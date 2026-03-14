use axum::{extract::State, Json};

use crate::models::fraud::{FraudResult, ScanRequest, ScanResponse, Transaction};
use crate::services::{fraud_rules, gemini, ml_sidecar};
use crate::state::AppState;


pub async fn scan(
    State(state): State<AppState>,
    Json(payload): Json<ScanRequest>,
) -> Json<ScanResponse> {
    let transactions: Vec<Transaction> = if let Some(ids) = &payload.transaction_ids {
        sqlx::query_as::<_, Transaction>(
            "SELECT * FROM transactions WHERE transaction_id = ANY($1)",
        )
        .bind(ids)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
    } else {
        sqlx::query_as::<_, Transaction>("SELECT * FROM transactions")
            .fetch_all(&state.db)
            .await
            .unwrap_or_default()
    };

    let total_scanned = transactions.len();
    let anomaly_scores = ml_sidecar::call_ml_sidecar(&state.http, &transactions).await;
    let mut results: Vec<FraudResult> = Vec::new();

    for tx in &transactions {
        let (risk_score, triggered_rules) = fraud_rules::score(&tx);
        if risk_score == 0 {
            continue;
        }

        let risk_level = fraud_rules::risk_level(risk_score).to_string();

        let ai_explanation = gemini::explain_fraud(&triggered_rules, &tx.transaction_id, risk_score)
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

    Json(ScanResponse {
        total_scanned,
        flagged,
        results,
    })
}
