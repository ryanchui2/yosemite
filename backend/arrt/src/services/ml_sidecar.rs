use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::models::fraud::Transaction;

const SIDECAR_URL: &str = "http://localhost:8000/score";

#[derive(Serialize)]
struct SidecarTx<'a> {
    transaction_id: &'a str,
    amount: Option<f64>,
    cvv_match: Option<bool>,
    ip_is_vpn: Option<bool>,
    address_match: Option<bool>,
    card_present: Option<bool>,
}

#[derive(Deserialize)]
struct SidecarScore {
    transaction_id: String,
    anomaly_score: f64,
}

#[derive(Deserialize)]
struct SidecarResponse {
    scores: Vec<SidecarScore>,
}

/// Returns a map of transaction_id → anomaly_score (0.0–1.0, higher = more anomalous).
/// Returns empty map if the sidecar is not running — never panics.
pub async fn call_ml_sidecar(
    client: &Client,
    transactions: &[Transaction],
) -> HashMap<String, f64> {
    let payload: Vec<SidecarTx> = transactions
        .iter()
        .map(|tx| SidecarTx {
            transaction_id: &tx.transaction_id,
            amount: tx.amount,
            cvv_match: tx.cvv_match,
            ip_is_vpn: tx.ip_is_vpn,
            address_match: tx.address_match,
            card_present: tx.card_present,
        })
        .collect();

    let result = client
        .post(SIDECAR_URL)
        .json(&serde_json::json!({ "transactions": payload }))
        .send()
        .await;

    match result {
        Ok(res) => match res.json::<SidecarResponse>().await {
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
