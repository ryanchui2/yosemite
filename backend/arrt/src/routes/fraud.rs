use axum::Json;

use crate::models::fraud::{FraudResult, ScanRequest, ScanResponse};
use crate::services::{fraud_rules, gemini};

// TODO (Backend 1): replace this import with `use crate::models::transaction::Transaction`
//                   and delete services::fraud_rules::Transaction
use crate::services::fraud_rules::Transaction;

pub async fn scan(Json(_payload): Json<ScanRequest>) -> Json<ScanResponse> {
    // TODO (Backend 1): replace with real DB query using AppState
    let transactions: Vec<Transaction> = vec![];

    let total_scanned = transactions.len();
    let mut results: Vec<FraudResult> = Vec::new();

    for tx in transactions {
        let (risk_score, triggered_rules) = fraud_rules::score(&tx);
        if risk_score == 0 {
            continue;
        }

        let risk_level = fraud_rules::risk_level(risk_score).to_string();

        let ai_explanation = gemini::explain_fraud(&triggered_rules, &tx.transaction_id, risk_score)
            .await
            .ok();

        results.push(FraudResult {
            transaction_id: tx.transaction_id,
            customer_name: tx.customer_name,
            amount: tx.amount,
            risk_score,
            risk_level,
            triggered_rules,
            ai_explanation,
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
