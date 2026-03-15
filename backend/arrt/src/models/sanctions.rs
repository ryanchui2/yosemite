use serde::Serialize;

#[derive(Serialize)]
pub struct SanctionsScanResult {
    pub uploaded_name: String,
    pub matched_name: String,
    pub confidence: u32,
    pub risk_level: String,
    pub sanctions_list: String,
    pub reason: String,
    pub ai_explanation: String,
    pub action: String,
}

#[derive(Serialize)]
pub struct SanctionsScanResponse {
    pub scan_id: String,
    pub total_entities: usize,
    pub flagged: usize,
    pub results: Vec<SanctionsScanResult>,
}
