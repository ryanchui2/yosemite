use axum::{
    extract::{Multipart, State},
    http::StatusCode,
    Json,
};

use crate::auth::middleware::AuthUser;
use csv::ReaderBuilder;
use std::collections::{HashMap, HashSet};
use std::io::Cursor;
use uuid::Uuid;

use crate::models::fraud::GeoRiskResult;
use crate::models::risk::SanctionsHit;
use crate::models::sanctions::{SanctionsScanResponse, SanctionsScanResult};
use crate::services::{llm, open_sanctions};
use crate::state::AppState;

/// POST /api/sanctions/scan
///
/// Accept multipart/form-data with a CSV file (field name optional).
/// CSV must have a header row with a `description`, `name`, `entity_name`,
/// `company`, or `vendor` column (case-insensitive).
/// Each row is searched against OpenSanctions; matches are returned.
/// If a `country` column is present, geopolitical risk is also assessed per country.
pub async fn scan(
    AuthUser(_): AuthUser,
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<SanctionsScanResponse>, (StatusCode, String)> {
    let mut file_bytes: Option<Vec<u8>> = None;

    while let Some(field) = multipart.next_field().await.map_err(|e| {
        (StatusCode::BAD_REQUEST, format!("Multipart error: {}", e))
    })? {
        let bytes = field.bytes().await.map_err(|e| {
            (StatusCode::BAD_REQUEST, format!("Failed to read file: {}", e))
        })?;
        if bytes.len() > 5 * 1024 * 1024 {
            return Err((
                StatusCode::PAYLOAD_TOO_LARGE,
                "File too large. Maximum 5MB.".to_string(),
            ));
        }
        file_bytes = Some(bytes.to_vec());
    }

    let bytes = file_bytes.ok_or((
        StatusCode::BAD_REQUEST,
        "No file uploaded. Send a CSV as multipart/form-data field 'file'.".to_string(),
    ))?;

    let mut reader = ReaderBuilder::new()
        .flexible(true)
        .trim(csv::Trim::All)
        .from_reader(Cursor::new(&bytes));

    let headers = reader
        .headers()
        .map_err(|e| (StatusCode::UNPROCESSABLE_ENTITY, format!("CSV headers: {}", e)))?
        .clone();

    let name_idx = ["description", "name", "entity_name", "company", "vendor"]
        .iter()
        .find_map(|target| {
            headers
                .iter()
                .position(|h| h.trim().eq_ignore_ascii_case(target))
        })
        .ok_or((
            StatusCode::UNPROCESSABLE_ENTITY,
            "CSV must have one of: 'description', 'name', 'entity_name', 'company', or 'vendor'."
                .to_string(),
        ))?;

    let country_idx = headers
        .iter()
        .position(|h| h.trim().eq_ignore_ascii_case("country"));

    // First pass: collect all (name, country) pairs
    let mut entities: Vec<(String, Option<String>)> = Vec::new();
    for record in reader.records() {
        let record = record.map_err(|e| {
            (
                StatusCode::UNPROCESSABLE_ENTITY,
                format!("CSV record: {}", e),
            )
        })?;
        let name = match record.get(name_idx) {
            Some(s) if !s.trim().is_empty() => s.trim().to_string(),
            _ => continue,
        };
        let country = country_idx
            .and_then(|i| record.get(i))
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        entities.push((name, country));
    }

    // Batch-fetch geo risk for all unique countries in one LLM call
    let unique_countries: Vec<String> = entities
        .iter()
        .filter_map(|(_, c)| c.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();

    let geo_map: HashMap<String, GeoRiskResult> = if !unique_countries.is_empty() {
        match llm::analyze_geo_risk(&state.http, &unique_countries).await {
            Ok(results) => results.into_iter().map(|r| (r.country.clone(), r)).collect(),
            Err(e) => {
                tracing::warn!("Geo-risk fetch failed, continuing without geo data: {}", e);
                HashMap::new()
            }
        }
    } else {
        HashMap::new()
    };

    // Second pass: sanctions lookup + geo enrichment per entity
    let mut total_entities = 0_usize;
    let mut results: Vec<SanctionsScanResult> = Vec::new();

    for (name, country) in &entities {
        let query = match country {
            Some(c) => format!("{} {}", name, c),
            None => name.clone(),
        };
        total_entities += 1;
        let hits: Vec<SanctionsHit> =
            open_sanctions::search(&state.http, &query, &state.opensanctions_api_key).await;

        let (llm_risk_raw, ai_explanation) = llm::explain_sanctions_entity(&state.http, name, &hits)
            .await
            .unwrap_or_else(|e| {
                tracing::warn!("Sanctions LLM explain failed for entity {:?}: {}", name, e);
                // When LLM fails, derive risk from OpenSanctions hit scores so a second scan
                // (e.g. after rate limit) doesn't default every entity to LOW.
                let fallback = if hits.is_empty() {
                    "LOW".to_string()
                } else {
                    let max_score = hits.iter().map(|h| h.score).fold(0.0_f64, f64::max);
                    if max_score >= 0.9 {
                        "HIGH".to_string()
                    } else if max_score >= 0.7 {
                        "MEDIUM".to_string()
                    } else {
                        "LOW".to_string()
                    }
                };
                (fallback, String::new())
            });
        let llm_risk = llm_risk_raw.to_uppercase();

        let geo = country.as_deref().and_then(|c| {
            geo_map.get(c).or_else(|| {
                geo_map
                    .iter()
                    .find(|(k, _)| k.eq_ignore_ascii_case(c))
                    .map(|(_, v)| v)
            })
        });
        let geo_risk_score = geo.map(|g| g.risk_score);
        let geo_risk_level = geo.map(|g| g.risk_level.to_uppercase());
        let geo_briefing = geo.map(|g| g.ai_briefing.clone());
        let geo_level_str = geo
            .map(|g| g.risk_level.as_str().to_uppercase())
            .unwrap_or_else(|| "LOW".to_string());

        if hits.is_empty() {
            let action = if llm_risk == "LOW" && geo_level_str == "LOW" {
                "No match — clear".to_string()
            } else if llm_risk != "LOW" {
                "Review — flagged by AI despite no database match".to_string()
            } else {
                format!("Review — elevated geo risk ({})", geo_level_str)
            };

            // Effective risk incorporates geo signal even with no sanctions hit (case-insensitive)
            let effective_risk = match (llm_risk.as_str(), geo_level_str.as_str()) {
                ("HIGH", _) | (_, "HIGH") | (_, "CRITICAL") => "HIGH",
                ("MEDIUM", _) | (_, "MEDIUM") => "MEDIUM",
                _ => "LOW",
            };

            results.push(SanctionsScanResult {
                uploaded_name: name.clone(),
                matched_name: String::new(),
                confidence: 0,
                risk_level: effective_risk.to_string(),
                sanctions_list: String::new(),
                reason: String::new(),
                ai_explanation,
                action,
                geo_risk_score,
                geo_risk_level,
                geo_briefing,
            });
        } else {
            for hit in &hits {
                let db_risk = if hit.score >= 0.9 {
                    "HIGH"
                } else if hit.score >= 0.7 {
                    "MEDIUM"
                } else {
                    "LOW"
                };
                let effective_risk = match (db_risk, llm_risk.as_str(), geo_level_str.as_str()) {
                    ("HIGH", _, _) | (_, "HIGH", _) | (_, _, "HIGH") | (_, _, "CRITICAL") => "HIGH",
                    ("MEDIUM", _, _) | (_, "MEDIUM", _) | (_, _, "MEDIUM") => "MEDIUM",
                    _ => "LOW",
                };
                results.push(SanctionsScanResult {
                    uploaded_name: name.clone(),
                    matched_name: hit.name.clone(),
                    confidence: (hit.score * 100.0).round() as u32,
                    risk_level: effective_risk.to_string(),
                    sanctions_list: hit.topics.join(", "),
                    reason: format!("Score {:.2}", hit.score),
                    ai_explanation: ai_explanation.clone(),
                    action: "Review match".to_string(),
                    geo_risk_score,
                    geo_risk_level: geo_risk_level.clone(),
                    geo_briefing: geo_briefing.clone(),
                });
            }
        }
    }

    let flagged: usize = results
        .iter()
        .filter(|r| {
            let level = r.risk_level.as_str();
            level == "HIGH" || level == "MEDIUM" || level == "CRITICAL"
        })
        .map(|r| r.uploaded_name.clone())
        .collect::<HashSet<_>>()
        .len();
    Ok(Json(SanctionsScanResponse {
        scan_id: Uuid::new_v4().to_string(),
        total_entities,
        flagged,
        results,
    }))
}
