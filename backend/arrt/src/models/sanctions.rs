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
    pub geo_risk_score: Option<u32>,
    pub geo_risk_level: Option<String>,
    pub geo_briefing: Option<String>,
}

#[derive(Serialize)]
pub struct SanctionsScanResponse {
    pub scan_id: String,
    pub total_entities: usize,
    pub flagged: usize,
    pub results: Vec<SanctionsScanResult>,
}
