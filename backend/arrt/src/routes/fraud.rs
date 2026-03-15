use axum::{extract::State, Json};

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
    let mut results: Vec<FraudResult> = Vec::new();

    for tx in &transactions {
        let (risk_score, triggered_rules) = fraud_rules::score(tx);
        if risk_score == 0 {
            continue;
        }

        let risk_level = fraud_rules::risk_level(risk_score).to_string();

        let ai_explanation = llm::explain_fraud(&state.http, &triggered_rules, &tx.transaction_id, risk_score)
            .await
            .ok();

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
