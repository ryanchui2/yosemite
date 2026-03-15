use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::auth::middleware::AuthUser;
use crate::state::AppState;

fn ai_base_url() -> String {
    std::env::var("AI_SERVICE_URL")
        .unwrap_or_else(|_| "http://localhost:8000".to_string())
}

#[derive(Debug, Deserialize, Serialize)]
pub struct AgentScanTransaction {
    pub transaction_id: String,
    pub order_id: Option<String>,
    pub customer_id: Option<String>,
    pub amount: Option<f64>,
    pub cvv_match: Option<bool>,
    pub address_match: Option<bool>,
    pub ip_is_vpn: Option<bool>,
    pub card_present: Option<bool>,
    pub timestamp: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct AgentScanRequest {
    pub transactions: Vec<AgentScanTransaction>,
    /// Optional base64-encoded document (PDF/image) for VLM document fraud analysis.
    #[serde(default)]
    pub document_base64: Option<String>,
    /// MIME type of the document, e.g. application/pdf or image/jpeg.
    #[serde(default)]
    pub mime_type: Option<String>,
}

/// POST /api/fraud/agent-scan
///
/// Forwards the transaction batch to the Python sidecar's /agent-scan endpoint,
/// which runs the Railtracks fraud_analyst pipeline and returns a structured
/// FraudReport (risk_level, summary, anomalous_transaction_ids,
/// benford_suspicious, duplicate_groups_count, recommendations).
pub async fn scan(
    AuthUser(_): AuthUser,
    State(state): State<AppState>,
    Json(payload): Json<AgentScanRequest>,
) -> impl IntoResponse {
    let url = format!(
        "{}/agent-scan",
        ai_base_url().trim_end_matches('/')
    );

    tracing::debug!(transaction_count = payload.transactions.len(), "agent_scan: request received");

    match state.http.post(&url).json(&payload).send().await {
        Ok(resp) => {
            let status = resp.status();
            tracing::debug!(status = status.as_u16(), "agent_scan: sidecar response");
            if !status.is_success() {
                let body = resp.text().await.unwrap_or_else(|_| status.to_string());
                return (
                    StatusCode::BAD_GATEWAY,
                    Json(serde_json::json!({
                        "error": "AI service error",
                        "detail": format!("{}: {}", status, body)
                    })),
                )
                    .into_response();
            }
            match resp.json::<Value>().await {
                Ok(body) => (StatusCode::OK, Json(body)).into_response(),
                Err(e) => (
                    StatusCode::BAD_GATEWAY,
                    Json(serde_json::json!({
                        "error": "Failed to parse agent-scan response",
                        "detail": e.to_string()
                    })),
                )
                    .into_response(),
            }
        }
        Err(e) => {
            tracing::error!(error = %e, "agent_scan: sidecar HTTP error");
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({
                    "error": "AI service unavailable",
                    "detail": e.to_string()
                })),
            )
                .into_response()
        }
    }
}
