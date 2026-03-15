use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};
use serde::{Deserialize, Serialize};
use serde_json::Value;

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
}

/// POST /api/fraud/agent-scan
///
/// Forwards the transaction batch to the Python sidecar's /agent-scan endpoint,
/// which runs the Railtracks fraud_analyst pipeline and returns a structured
/// FraudReport (risk_level, summary, anomalous_transaction_ids,
/// benford_suspicious, duplicate_groups_count, recommendations).
pub async fn scan(
    State(state): State<AppState>,
    Json(payload): Json<AgentScanRequest>,
) -> impl IntoResponse {
    let url = format!(
        "{}/agent-scan",
        ai_base_url().trim_end_matches('/')
    );

    // #region agent log
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open("/Users/ryanalumkal/Documents/GitHub/arrt/.cursor/debug.log")
    {
        use std::io::Write;
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis();
        let _ = writeln!(
            f,
            r#"{{"location":"agent_scan.rs:scan","message":"request_received","data":{{"transaction_count":{},"hypothesisId":"H3"}},"timestamp":{}}}"#,
            payload.transactions.len(),
            ts
        );
    }
    // #endregion

    match state.http.post(&url).json(&payload).send().await {
        Ok(resp) => {
            let status = resp.status();
            // #region agent log
            if let Ok(mut f) = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open("/Users/ryanalumkal/Documents/GitHub/arrt/.cursor/debug.log")
            {
                use std::io::Write;
                let ts = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_millis();
                let _ = writeln!(
                    f,
                    r#"{{"location":"agent_scan.rs:sidecar_response","message":"sidecar_status","data":{{"status":{},"hypothesisId":"H3"}},"timestamp":{}}}"#,
                    status.as_u16(),
                    ts
                );
            }
            // #endregion
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
            // #region agent log
            if let Ok(mut f) = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open("/Users/ryanalumkal/Documents/GitHub/arrt/.cursor/debug.log")
            {
                use std::io::Write;
                let ts = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_millis();
                let detail = e.to_string();
                let esc = detail.replace('\\', "\\\\").replace('"', "\\\"");
                let _ = writeln!(
                    f,
                    r#"{{"location":"agent_scan.rs:sidecar_err","message":"sidecar_http_error","data":{{"detail":"{}","hypothesisId":"H3"}},"timestamp":{}}}"#,
                    esc,
                    ts
                );
            }
            // #endregion
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
