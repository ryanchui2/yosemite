use axum::{
    extract::{Multipart, State},
    http::StatusCode,
    Json,
};
use csv::ReaderBuilder;
use std::io::Cursor;
use uuid::Uuid;

use crate::models::risk::SanctionsHit;
use crate::models::sanctions::{SanctionsScanResponse, SanctionsScanResult};
use crate::services::open_sanctions;
use crate::state::AppState;

/// POST /api/sanctions/scan
///
/// Accept multipart/form-data with a CSV file (field name optional).
/// CSV must have a header row with a "description" column (case-insensitive).
/// Each row is searched against OpenSanctions; matches are returned.
pub async fn scan(
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
        "No file uploaded. Send a CSV as multipart/form-data.".to_string(),
    ))?;

    let mut reader = ReaderBuilder::new()
        .flexible(true)
        .trim(csv::Trim::All)
        .from_reader(Cursor::new(&bytes));

    let headers = reader
        .headers()
        .map_err(|e| (StatusCode::UNPROCESSABLE_ENTITY, format!("CSV headers: {}", e)))?
        .clone();
    let name_idx = headers
        .iter()
        .position(|h| h.trim().to_lowercase() == "description")
        .ok_or((
            StatusCode::UNPROCESSABLE_ENTITY,
            "CSV must have a 'description' column.".to_string(),
        ))?;
    let country_idx = headers
        .iter()
        .position(|h| h.trim().to_lowercase() == "country");

    let mut total_entities = 0_usize;
    let mut results: Vec<SanctionsScanResult> = Vec::new();

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
        let query = match &country {
            Some(c) => format!("{} {}", name, c),
            None => name.clone(),
        };
        total_entities += 1;
        let hits: Vec<SanctionsHit> =
            open_sanctions::search(&state.http, &query).await;
        if hits.is_empty() {
            results.push(SanctionsScanResult {
                uploaded_name: name.clone(),
                matched_name: String::new(),
                confidence: 0,
                risk_level: "LOW".to_string(),
                sanctions_list: String::new(),
                reason: String::new(),
                ai_explanation: String::new(),
                action: "No match — clear".to_string(),
            });
        } else {
            for hit in hits {
                let risk_level = if hit.score >= 0.9 {
                    "HIGH"
                } else if hit.score >= 0.7 {
                    "MEDIUM"
                } else {
                    "LOW"
                };
                results.push(SanctionsScanResult {
                    uploaded_name: name.clone(),
                    matched_name: hit.name.clone(),
                    confidence: (hit.score * 100.0).round() as u32,
                    risk_level: risk_level.to_string(),
                    sanctions_list: hit.topics.join(", "),
                    reason: format!("Score {:.2}", hit.score),
                    ai_explanation: String::new(),
                    action: "Review match".to_string(),
                });
            }
        }
    }

    let flagged = results.iter().filter(|r| !r.matched_name.is_empty()).count();
    Ok(Json(SanctionsScanResponse {
        scan_id: Uuid::new_v4().to_string(),
        total_entities,
        flagged,
        results,
    }))
}
