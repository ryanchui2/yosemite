use axum::{extract::State, Json};
use std::collections::HashMap;

use crate::models::fraud::{FraudResult, ScanRequest, ScanResponse, ScoringTx};
use crate::services::{anomaly_service, fraud_rules, llm};
use crate::state::AppState;

/// Runs the fraud scan (used by both GET cache and POST).
async fn run_scan(state: &AppState, payload: &ScanRequest) -> ScanResponse {
    let transactions: Vec<ScoringTx> = if let Some(ids) = &payload.transaction_ids {
        sqlx::query_as::<_, ScoringTx>(
            "SELECT * FROM transactions WHERE transaction_id = ANY($1)",
        )
        .bind(ids)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
    } else {
        sqlx::query_as::<_, ScoringTx>("SELECT * FROM transactions")
            .fetch_all(&state.db)
            .await
            .unwrap_or_default()
    };

    let total_scanned = transactions.len();
    let anomaly_scores = anomaly_service::get_anomaly_scores(&state.http, &transactions).await;

    // Fetch all fraud reports to merge them into the scan results
    let reports = sqlx::query!(
        "SELECT transaction_id, confirmed_fraud, notes, ai_review_notes FROM fraud_reports"
    )
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let mut report_map = HashMap::new();
    for row in reports {
        report_map.insert(
            row.transaction_id,
            (row.confirmed_fraud, row.notes, row.ai_review_notes),
        );
    }

    let mut results: Vec<FraudResult> = Vec::new();

    for tx in &transactions {
        let (mut risk_score, triggered_rules) = fraud_rules::score(&tx);
        let in_report = report_map.get(&tx.transaction_id);

        if risk_score == 0 && in_report.is_none() {
            continue;
        }

        let mut risk_level = fraud_rules::risk_level(risk_score).to_string();
        let mut ai_explanation = llm::explain_fraud(&state.http, &triggered_rules, &tx.transaction_id, risk_score)
            .await
            .ok();

        // Override with fraud report details if it exists
        if let Some((confirmed_fraud, notes, ai_notes)) = in_report {
            if *confirmed_fraud {
                risk_score = 100;
                risk_level = "HIGH".to_string();
            } else if risk_score < 70 {
                 risk_level = "MEDIUM".to_string(); // Give it at least medium risk if it was reported
            }

            // Prefer AI notes, then fallback to manual notes, then fallback to standard explanation
            if let Some(n) = ai_notes {
                ai_explanation = Some(n.clone());
            } else if let Some(n) = notes {
                ai_explanation = Some(n.clone());
            }
        }

        let anomaly_score = anomaly_scores.get(&tx.transaction_id).copied();

        results.push(FraudResult {
            transaction_id: tx.transaction_id.clone(),
            customer_name: tx.customer_name.clone(),
            amount: tx.amount,
            risk_score,
            risk_level,
            triggered_rules,
            ai_explanation,
            anomaly_score,
        });
    }

    results.sort_by(|a, b| b.risk_score.cmp(&a.risk_score));
    let flagged = results.len();

    ScanResponse {
        total_scanned,
        flagged,
        results,
    }
}

/// GET /api/fraud/scan — return cached scan result, or run once and cache. Avoids re-running on refresh.
pub async fn get_cached_scan(State(state): State<AppState>) -> Json<ScanResponse> {
    let cached: Option<serde_json::Value> =
        sqlx::query_scalar("SELECT scan_response FROM fraud_scan_cache WHERE id = 1")
            .fetch_optional(&state.db)
            .await
            .unwrap_or(None);

    if let Some(ref v) = cached {
        if let Ok(resp) = serde_json::from_value::<ScanResponse>(v.clone()) {
            return Json(resp);
        }
    }

    let payload = ScanRequest { transaction_ids: None };
    let response = run_scan(&state, &payload).await;
    let json = serde_json::to_value(&response).unwrap_or_default();
    let _ = sqlx::query("UPDATE fraud_scan_cache SET scan_response = $1, updated_at = NOW() WHERE id = 1")
        .bind(&json)
        .execute(&state.db)
        .await;
    Json(response)
}

/// POST /api/fraud/scan — run scan and update cache.
pub async fn scan(
    State(state): State<AppState>,
    Json(payload): Json<ScanRequest>,
) -> Json<ScanResponse> {
    let response = run_scan(&state, &payload).await;
    let json = serde_json::to_value(&response).unwrap_or_default();
    let _ = sqlx::query("UPDATE fraud_scan_cache SET scan_response = $1, updated_at = NOW() WHERE id = 1")
        .bind(&json)
        .execute(&state.db)
        .await;
    Json(response)
}
