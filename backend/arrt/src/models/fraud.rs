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

/// Lightweight, fully-optional transaction struct used for AI-parsed input
/// and CSV uploads. Converted to `Transaction` before scoring.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TransactionInput {
    pub transaction_id: String,
    pub customer_name: Option<String>,
    pub amount: Option<f64>,
    pub cvv_match: Option<bool>,
    pub avs_result: Option<String>,
    pub address_match: Option<bool>,
    pub ip_is_vpn: Option<bool>,
    pub ip_country: Option<String>,
    pub device_type: Option<String>,
    pub card_present: Option<bool>,
    pub entry_mode: Option<String>,
    pub refund_status: Option<String>,
}

impl From<TransactionInput> for Transaction {
    fn from(t: TransactionInput) -> Self {
        Transaction {
            transaction_id: t.transaction_id,
            customer_name: t.customer_name,
            amount: t.amount,
            cvv_match: t.cvv_match,
            avs_result: t.avs_result,
            address_match: t.address_match,
            ip_is_vpn: t.ip_is_vpn,
            ip_country: t.ip_country,
            device_type: t.device_type,
            card_present: t.card_present,
            entry_mode: t.entry_mode,
            refund_status: t.refund_status,
        }
    }
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

// ── Benford's Law ─────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct DigitAnalysis {
    pub digit: u8,
    pub expected_pct: f64,
    pub observed_pct: f64,
    pub deviation: f64,
    pub flagged: bool,
}

#[derive(Serialize)]
pub struct BenfordResponse {
    pub sufficient_data: bool,
    pub total_transactions: usize,
    pub chi_square: Option<f64>,
    pub is_suspicious: Option<bool>,
    pub digit_analysis: Vec<DigitAnalysis>,
    pub flagged_digits: Vec<u8>,
    pub ai_explanation: Option<String>,
}

// ── Duplicate Invoice Detection ───────────────────────────────────────────────

#[derive(Serialize)]
pub struct DuplicateGroup {
    pub r#type: String,
    pub customer_id: Option<String>,
    pub amount: Option<f64>,
    pub date: Option<String>,
    pub order_id: Option<String>,
    pub transaction_ids: Vec<String>,
    pub count: usize,
}

#[derive(Serialize)]
pub struct DuplicatesResponse {
    pub total_duplicate_groups: usize,
    pub duplicate_groups: Vec<DuplicateGroup>,
    pub ai_explanation: Option<String>,
}

// ── Document / Invoice Fraud ──────────────────────────────────────────────────

#[derive(Serialize)]
pub struct DocumentFraudResponse {
    pub document_type: String,
    pub risk_level: String,
    pub risk_score: u32,
    pub fraud_signals: Vec<String>,
    pub legitimate_indicators: Vec<String>,
    pub summary: String,
    pub recommended_action: String,
}

#[derive(Deserialize)]
pub struct FraudReportRequest {
    pub transaction_id: String,
    pub confirmed_fraud: bool,
    pub reported_by: Option<String>,
    pub notes: Option<String>,
    /// Set to true when this report was produced by the pipeline's deep-review (AI analysis) path.
    pub ai_reviewed: Option<bool>,
    /// AI-generated notes from deep review (llm::explain_fraud / gemini_vision summary).
    pub ai_review_notes: Option<String>,
}

#[derive(Serialize)]
pub struct FraudReportResponse {
    pub success: bool,
    pub transaction_id: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FraudReportSummaryContent {
    pub common_vulnerabilities: Vec<String>,
    pub potential_reasons: Vec<String>,
    pub improvement_advice: Vec<String>,
    pub disclaimer: String,
}

#[derive(Serialize)]
pub struct FraudReportSummaryResponse {
    pub report_count: usize,
    pub ai_generated: bool,
    pub common_vulnerabilities: Vec<String>,
    pub potential_reasons: Vec<String>,
    pub improvement_advice: Vec<String>,
    pub disclaimer: String,
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

/// Outcome for a single transaction processed by the pipeline.
#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PipelineOutcome {
    Clean,
    FraudReportSaved,
    DeepReviewAndReportSaved,
}

#[derive(Debug, Serialize)]
pub struct PipelineResult {
    pub transaction_id: String,
    pub risk_score: u32,
    pub outcome: PipelineOutcome,
    pub triggered_rules: Vec<String>,
    /// Present when outcome is DeepReviewAndReportSaved.
    pub ai_review_notes: Option<String>,
    /// Present for PDF inputs: summary from Gemini Vision.
    pub vision_summary: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PipelineResponse {
    pub source_type: String,
    pub transactions_processed: usize,
    pub results: Vec<PipelineResult>,
}
