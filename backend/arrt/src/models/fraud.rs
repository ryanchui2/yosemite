use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct ScanRequest {
    /// Pass specific IDs, or leave empty to scan all
    pub transaction_ids: Option<Vec<String>>,
}

#[derive(Serialize)]
pub struct FraudResult {
    pub transaction_id: String,
    pub customer_name: Option<String>,
    pub amount: Option<f64>,
    pub risk_score: u32,
    pub risk_level: String, // "HIGH", "MEDIUM", "LOW"
    pub triggered_rules: Vec<String>,
    pub ai_explanation: Option<String>,
}

#[derive(Serialize)]
pub struct ScanResponse {
    pub total_scanned: usize,
    pub flagged: usize,
    pub results: Vec<FraudResult>,
}
