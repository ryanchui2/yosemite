use axum::{extract::State, Json};
use std::collections::HashMap;

use crate::models::fraud::{
    FraudReportRequest, FraudReportResponse, FraudReportSummaryContent, FraudReportSummaryResponse,
    FraudResult, Transaction,
};
use crate::services::fraud_rules;
use crate::services::llm;
use crate::state::AppState;

pub async fn report(
    State(state): State<AppState>,
    Json(payload): Json<FraudReportRequest>,
) -> Json<FraudReportResponse> {
    let result = sqlx::query(
        "INSERT INTO fraud_reports (transaction_id, confirmed_fraud, reported_by, notes, ai_reviewed, ai_review_notes)
         VALUES ($1, $2, $3, $4, $5, $6)"
    )
    .bind(&payload.transaction_id)
    .bind(payload.confirmed_fraud)
    .bind(&payload.reported_by)
    .bind(&payload.notes)
    .bind(payload.ai_reviewed.unwrap_or(false))
    .bind(&payload.ai_review_notes)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => Json(FraudReportResponse {
            success: true,
            transaction_id: payload.transaction_id,
            message: "Report saved.".to_string(),
        }),
        Err(e) => {
            tracing::error!("Failed to save fraud report: {}", e);
            Json(FraudReportResponse {
                success: false,
                transaction_id: payload.transaction_id,
                message: "Failed to save report.".to_string(),
            })
        }
    }
}

pub async fn summary(State(state): State<AppState>) -> Json<FraudReportSummaryResponse> {
    let transactions = sqlx::query_as::<_, Transaction>("SELECT * FROM transactions")
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let mut flagged_results = transactions
        .iter()
        .filter_map(|tx| {
            let (risk_score, triggered_rules) = fraud_rules::score(tx);
            if risk_score == 0 {
                return None;
            }

            Some(FraudResult {
                transaction_id: tx.transaction_id.clone(),
                customer_name: tx.customer_name.clone(),
                amount: tx.amount,
                risk_score,
                risk_level: fraud_rules::risk_level(risk_score).to_string(),
                triggered_rules,
                ai_explanation: None,
                anomaly_score: None,
            })
        })
        .collect::<Vec<_>>();

    flagged_results.sort_by(|a, b| b.risk_score.cmp(&a.risk_score));
    flagged_results.truncate(25);

    let fallback = build_fallback_summary(&flagged_results);

    if flagged_results.is_empty() {
        return Json(FraudReportSummaryResponse {
            report_count: 0,
            ai_generated: false,
            common_vulnerabilities: fallback.common_vulnerabilities,
            potential_reasons: fallback.potential_reasons,
            improvement_advice: fallback.improvement_advice,
            disclaimer: fallback.disclaimer,
        });
    }

    let report_context = build_report_context(&flagged_results);
    let (summary, ai_generated) = match llm::summarize_fraud_reports(&report_context).await {
        Ok(summary) => (summary, true),
        Err(err) => {
            tracing::warn!("Failed to generate fraud report summary with AI: {}", err);
            (fallback, false)
        }
    };

    Json(FraudReportSummaryResponse {
        report_count: flagged_results.len(),
        ai_generated,
        common_vulnerabilities: summary.common_vulnerabilities,
        potential_reasons: summary.potential_reasons,
        improvement_advice: summary.improvement_advice,
        disclaimer: summary.disclaimer,
    })
}

fn build_report_context(results: &[FraudResult]) -> String {
    results
        .iter()
        .map(|result| {
            let mut details = Vec::new();

            if let Some(customer_name) = &result.customer_name {
                details.push(format!("customer: {}", customer_name));
            }
            if let Some(amount) = result.amount {
                details.push(format!("amount: {:.2}", amount));
            }
            details.push(format!("risk_score: {}", result.risk_score));
            details.push(format!("risk_level: {}", result.risk_level));

            if !result.triggered_rules.is_empty() {
                details.push(format!("signals: {}", result.triggered_rules.join(", ")));
            }

            format!("- {} | {}", result.transaction_id, details.join(" | "))
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn build_fallback_summary(results: &[FraudResult]) -> FraudReportSummaryContent {
    if results.is_empty() {
        return FraudReportSummaryContent {
            common_vulnerabilities: vec![
                "No risky transactions were found in the latest fraud scan, so recurring vulnerabilities cannot be ranked yet.".to_string(),
            ],
            potential_reasons: vec![
                "The current scan did not surface flagged patterns that require an AI-generated overview.".to_string(),
            ],
            improvement_advice: vec![
                "Continue monitoring new transactions so the dashboard can summarize repeat weaknesses once fraud signals appear.".to_string(),
            ],
            disclaimer: "AI-generated summaries may be imprecise and should be reviewed by an analyst before making operational decisions.".to_string(),
        };
    }

    let mut vulnerabilities: HashMap<&'static str, usize> = HashMap::new();
    let mut reasons: HashMap<&'static str, usize> = HashMap::new();
    let mut advice: HashMap<&'static str, usize> = HashMap::new();

    let high_risk_count = results
        .iter()
        .filter(|result| result.risk_level == "HIGH")
        .count();

    if high_risk_count > 0 {
        *vulnerabilities
            .entry("High-risk fraud signals are concentrated in a subset of transactions that need immediate review.")
            .or_default() += high_risk_count;
        *reasons
            .entry("Multiple risk indicators are stacking together on the same transactions, which usually points to coordinated fraud behavior.")
            .or_default() += high_risk_count;
        *advice
            .entry("Prioritize the highest-risk transactions for manual review and tighten rules where multiple signals appear together.")
            .or_default() += high_risk_count;
    }

    for result in results {
        if contains_rule(result, &["cvv mismatch", "avs", "address mismatch", "billing and shipping address mismatch"]) {
            *vulnerabilities
                .entry("Verification mismatches are recurring across flagged transactions.")
                .or_default() += 1;
            *reasons
                .entry("Attackers may be using stolen or synthetic identities that fail CVV, AVS, or billing-address checks.")
                .or_default() += 1;
            *advice
                .entry("Tighten step-up verification for CVV, AVS, and billing mismatches before approval.")
                .or_default() += 1;
        }

        if contains_rule(result, &["vpn", "proxy"]) {
            *vulnerabilities
                .entry("Masked network activity such as VPN or proxy usage appears repeatedly.")
                .or_default() += 1;
            *reasons
                .entry("Fraudsters may be hiding their location to bypass geolocation and reputation controls.")
                .or_default() += 1;
            *advice
                .entry("Increase scrutiny or block high-risk VPN and proxy traffic during payment review.")
                .or_default() += 1;
        }

        if contains_rule(result, &["card not present", "keyed entry"]) {
            *vulnerabilities
                .entry("Card-not-present payment flows are a recurring exposure area.")
                .or_default() += 1;
            *reasons
                .entry("Remote checkout paths may have weaker identity verification than in-person transactions.")
                .or_default() += 1;
            *advice
                .entry("Add stronger authentication and velocity checks for card-not-present transactions.")
                .or_default() += 1;
        }

        if contains_rule(result, &["refund status", "refund activity"]) {
            *vulnerabilities
                .entry("Refund-related behavior appears in the current fraud pattern.")
                .or_default() += 1;
            *reasons
                .entry("Fraudsters may be exploiting refund workflows to extract funds or obscure the original charge path.")
                .or_default() += 1;
            *advice
                .entry("Review refund approval rules and require secondary checks for suspicious post-payment activity.")
                .or_default() += 1;
        }
    }

    FraudReportSummaryContent {
        common_vulnerabilities: top_sentences(
            vulnerabilities,
            vec!["The current fraud scan shows repeat control gaps that should be reviewed in more detail.".to_string()],
        ),
        potential_reasons: top_sentences(
            reasons,
            vec!["The flagged transactions suggest gaps in verification depth, transaction monitoring, or manual review timing.".to_string()],
        ),
        improvement_advice: top_sentences(
            advice,
            vec!["Use the flagged fraud patterns to tighten review thresholds, verification rules, and analyst escalation paths.".to_string()],
        ),
        disclaimer: "AI-generated summaries may be imprecise and should be reviewed by an analyst before making operational decisions.".to_string(),
    }
}

fn top_sentences(
    counts: HashMap<&'static str, usize>,
    fallback: Vec<String>,
) -> Vec<String> {
    let mut items = counts.into_iter().collect::<Vec<_>>();
    items.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(b.0)));

    let ranked = items
        .into_iter()
        .take(3)
        .map(|(text, _)| text.to_string())
        .collect::<Vec<_>>();

    if ranked.is_empty() {
        fallback
    } else {
        ranked
    }
}

fn contains_rule(result: &FraudResult, keywords: &[&str]) -> bool {
    result.triggered_rules.iter().any(|rule| {
        let normalized = rule.to_ascii_lowercase();
        keywords.iter().any(|keyword| normalized.contains(keyword))
    })
}
