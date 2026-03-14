use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::models::fraud::Transaction;

fn ai_service_url() -> String {
    let base = std::env::var("AI_SERVICE_URL")
        .unwrap_or_else(|_| "http://localhost:8000".to_string());
    format!("{}/score", base.trim_end_matches('/'))
}

#[derive(Serialize)]
struct AnomalyTx<'a> {
    transaction_id: &'a str,
    amount: Option<f64>,
    cvv_match: Option<bool>,
    ip_is_vpn: Option<bool>,
    address_match: Option<bool>,
    card_present: Option<bool>,
}

#[derive(Deserialize)]
struct AnomalyScore {
    transaction_id: String,
    anomaly_score: f64,
}

#[derive(Deserialize)]
struct AnomalyResponse {
    scores: Vec<AnomalyScore>,
}

/// Returns a map of transaction_id → anomaly_score (0.0–1.0, higher = more anomalous).
/// Returns empty map if the AI service is unavailable — never panics.
pub async fn get_anomaly_scores(
    client: &Client,
    transactions: &[Transaction],
) -> HashMap<String, f64> {
    let payload: Vec<AnomalyTx> = transactions
        .iter()
        .map(|tx| AnomalyTx {
            transaction_id: &tx.transaction_id,
            amount: tx.amount,
            cvv_match: tx.cvv_match,
            ip_is_vpn: tx.ip_is_vpn,
            address_match: tx.address_match,
            card_present: tx.card_present,
        })
        .collect();

    let result = client
        .post(ai_service_url())
        .json(&serde_json::json!({ "transactions": payload }))
        .send()
        .await;

    match result {
        Ok(res) => match res.json::<AnomalyResponse>().await {
            Ok(data) => data
                .scores
                .into_iter()
                .map(|s| (s.transaction_id, s.anomaly_score))
                .collect(),
            Err(_) => HashMap::new(),
        },
        Err(_) => HashMap::new(),
    }
}
