use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(FromRow)]
pub struct Transaction {
    pub transaction_id: String,
    pub customer_name: Option<String>,
    pub amount: Option<f64>,
    pub cvv_match: Option<bool>,
    pub avs_result: Option<String>,
    pub address_match: Option<bool>,
    pub ip_is_vpn: Option<bool>,
    pub card_present: Option<bool>,
    pub entry_mode: Option<String>,
    pub refund_status: Option<String>,
    pub ip_country: Option<String>,
    pub device_type: Option<String>,
}

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
    pub anomaly_score: Option<f64>,
}

#[derive(Serialize)]
pub struct ScanResponse {
    pub total_scanned: usize,
    pub flagged: usize,
    pub results: Vec<FraudResult>,
}

#[derive(Deserialize)]
pub struct FraudReportRequest {
    pub transaction_id: String,
    pub confirmed_fraud: bool,
    pub reported_by: Option<String>,
    pub notes: Option<String>,
}

#[derive(Serialize)]
pub struct FraudReportResponse {
    pub success: bool,
    pub transaction_id: String,
    pub message: String,
}
