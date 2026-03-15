use axum::{extract::State, http::StatusCode, Json};
use std::collections::HashMap;

use crate::models::fraud::{
    EntityFraudSummary, EntityGeoRisk, EntityInvestigateRequest, EntityInvestigationResponse,
    EntitySanctionsSummary, ScoringTx,
};
use crate::services::{fraud_rules, llm, open_sanctions};
use crate::state::AppState;

/// POST /api/entity/investigate
///
/// Cross-references a single entity name across all three intelligence modules:
///   1. Fraud — queries the transactions table for matching customer names and scores them
///   2. Sanctions — searches OpenSanctions for the entity name
///   3. Geo Risk — derives the primary country from transaction ip_country and
///      generates a geopolitical risk briefing via LLM
///
/// Returns a composite risk score and an AI-generated verdict with recommended action.
pub async fn investigate(
    State(state): State<AppState>,
    Json(payload): Json<EntityInvestigateRequest>,
) -> Result<Json<EntityInvestigationResponse>, (StatusCode, String)> {
    let entity_name = payload.entity_name.trim().to_string();
    if entity_name.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "entity_name must not be empty".to_string()));
    }

    // ── 1. Fraud: query transactions by customer_name (case-insensitive partial match) ──

    let transactions: Vec<ScoringTx> =
        sqlx::query_as::<_, ScoringTx>(
            "SELECT * FROM transactions WHERE customer_name ILIKE $1",
        )
        .bind(format!("%{}%", entity_name))
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();

    let transaction_count = transactions.len();
    let mut flagged_count = 0_usize;
    let mut highest_risk_score: u32 = 0;
    let mut all_triggered_rules: HashMap<String, usize> = HashMap::new();

    for tx in &transactions {
        let (score, rules) = fraud_rules::score(tx);
        if score > 0 {
            flagged_count += 1;
            if score > highest_risk_score {
                highest_risk_score = score;
            }
            for rule in rules {
                *all_triggered_rules.entry(rule).or_insert(0) += 1;
            }
        }
    }

    // Top rules: sorted by frequency, take up to 5
    let mut rule_counts: Vec<(String, usize)> = all_triggered_rules.into_iter().collect();
    rule_counts.sort_by(|a, b| b.1.cmp(&a.1));
    let top_triggered_rules: Vec<String> = rule_counts
        .into_iter()
        .take(5)
        .map(|(rule, _)| rule)
        .collect();

    let fraud_risk_level = fraud_rules::risk_level(highest_risk_score).to_string();

    // Normalize fraud score to 0-100 scale (150 = practical "very high" baseline)
    let fraud_pct = (highest_risk_score as f64 / 150.0 * 100.0).min(100.0);

    let fraud_summary = EntityFraudSummary {
        transaction_count,
        flagged_count,
        highest_risk_score,
        risk_level: fraud_risk_level,
        top_triggered_rules: top_triggered_rules.clone(),
    };

    // ── 2. Sanctions: search OpenSanctions ────────────────────────────────────

    let hits = open_sanctions::search(&state.http, &entity_name, &state.opensanctions_api_key).await;

    let (sanctions_summary, sanctions_pct) = if let Some(best) = hits.iter().max_by(|a, b| {
        a.score.partial_cmp(&b.score).unwrap_or(std::cmp::Ordering::Equal)
    }) {
        let confidence = (best.score * 100.0).round() as u32;
        let risk_level = if best.score >= 0.9 {
            "HIGH"
        } else if best.score >= 0.7 {
            "MEDIUM"
        } else {
            "LOW"
        };
        let summary = EntitySanctionsSummary {
            match_found: true,
            matched_name: Some(best.name.clone()),
            confidence: Some(confidence),
            sanctions_list: Some(best.topics.join(", ")),
            reason: Some(format!("OpenSanctions score: {:.2}", best.score)),
            risk_level: Some(risk_level.to_string()),
        };
        (summary, best.score * 100.0)
    } else {
        (
            EntitySanctionsSummary {
                match_found: false,
                matched_name: None,
                confidence: None,
                sanctions_list: None,
                reason: None,
                risk_level: Some("LOW".to_string()),
            },
            0.0,
        )
    };

    // ── 3. Geo Risk: derive primary country from transactions, call LLM ───────

    // Most common ip_country across matched transactions
    let primary_country: Option<String> = {
        let mut country_counts: HashMap<String, usize> = HashMap::new();
        for tx in &transactions {
            if let Some(ref c) = tx.ip_country {
                *country_counts.entry(c.clone()).or_insert(0) += 1;
            }
        }
        country_counts
            .into_iter()
            .max_by_key(|(_, count)| *count)
            .map(|(country, _)| country)
    };

    let (geo_summary, geo_pct) = if let Some(ref country) = primary_country {
        match llm::analyze_geo_risk(&state.http, &[country.clone()]).await {
            Ok(results) if !results.is_empty() => {
                let g = &results[0];
                let geo_pct = g.risk_score as f64;
                let summary = EntityGeoRisk {
                    country: Some(g.country.clone()),
                    risk_score: Some(g.risk_score),
                    risk_level: Some(g.risk_level.clone()),
                    ai_briefing: Some(g.ai_briefing.clone()),
                };
                (summary, geo_pct)
            }
            _ => (
                EntityGeoRisk {
                    country: Some(country.clone()),
                    risk_score: None,
                    risk_level: None,
                    ai_briefing: None,
                },
                0.0,
            ),
        }
    } else {
        (
            EntityGeoRisk {
                country: None,
                risk_score: None,
                risk_level: None,
                ai_briefing: None,
            },
            0.0,
        )
    };

    // ── 4. Composite score ────────────────────────────────────────────────────

    let composite_f = fraud_pct * 0.40 + sanctions_pct * 0.35 + geo_pct * 0.25;
    let composite_risk_score = composite_f.round() as u32;

    let composite_risk_level = match composite_risk_score {
        s if s >= 75 => "CRITICAL",
        s if s >= 55 => "HIGH",
        s if s >= 35 => "MEDIUM",
        _ => "LOW",
    }
    .to_string();

    // ── 5. LLM: generate AI summary and recommended action ────────────────────

    let (ai_summary, recommended_action) = llm::summarize_entity(
        &state.http,
        &entity_name,
        composite_risk_score,
        &composite_risk_level,
        &top_triggered_rules,
        sanctions_summary.matched_name.as_deref(),
        sanctions_summary.sanctions_list.as_deref(),
        geo_summary.country.as_deref(),
        geo_summary.risk_level.as_deref(),
    )
    .await
    .unwrap_or_else(|_| (
        format!(
            "{} shows elevated risk across fraud indicators and compliance checks.",
            entity_name
        ),
        "Review this entity with your compliance team before proceeding.".to_string(),
    ));

    Ok(Json(EntityInvestigationResponse {
        entity_name,
        composite_risk_score,
        composite_risk_level,
        fraud: fraud_summary,
        sanctions: sanctions_summary,
        geo_risk: geo_summary,
        ai_summary,
        recommended_action,
    }))
}
