use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};

use crate::services::llm;
use crate::state::AppState;

// ── Request types ─────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct ChatRequest {
    pub message: String,
    pub context: Option<ChatContext>,
}

/// Serialized scan results sent from the frontend as context for the LLM.
/// All fields are optional — the endpoint gracefully handles partial context.
#[derive(Deserialize)]
pub struct ChatContext {
    /// Summary of fraud scan: flagged count, top transactions as text
    pub fraud_summary: Option<String>,
    /// Summary of sanctions scan: flagged entities as text
    pub sanctions_summary: Option<String>,
    /// Summary of geo-risk scan: countries and risk levels as text
    pub geo_summary: Option<String>,
}

// ── Response types ────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct ChatResponse {
    pub response: String,
}

// ── Handler ───────────────────────────────────────────────────────────────────

/// POST /api/chat
///
/// Accepts a user message and optional serialized scan context (fraud, sanctions,
/// geo-risk summaries as plain text). Returns an AI-generated response grounded
/// in the provided context.
///
/// The frontend is responsible for serializing its current scan state into the
/// three summary strings before sending. Plain text is preferred over JSON so
/// the LLM can read it directly without additional parsing.
///
/// Example context strings:
///   fraud_summary:    "4 flagged (HIGH). Top: GlobalTex Imports Ltd $12500, score 180."
///   sanctions_summary: "1 match. GlobalTex Imports Ltd → 91% confidence, EU Consolidated List."
///   geo_summary:      "Iran: CRITICAL (88/100). Russia: HIGH (72/100)."
pub async fn respond(
    State(state): State<AppState>,
    Json(payload): Json<ChatRequest>,
) -> Result<Json<ChatResponse>, (StatusCode, String)> {
    let message = payload.message.trim().to_string();

    if message.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "message must not be empty".to_string()));
    }

    if message.len() > 1000 {
        return Err((
            StatusCode::BAD_REQUEST,
            "message must be under 1000 characters".to_string(),
        ));
    }

    let (fraud_ctx, sanctions_ctx, geo_ctx) = match payload.context {
        Some(ctx) => (ctx.fraud_summary, ctx.sanctions_summary, ctx.geo_summary),
        None => (None, None, None),
    };

    let response = llm::chat_with_context(
        &state.http,
        &message,
        fraud_ctx.as_deref(),
        sanctions_ctx.as_deref(),
        geo_ctx.as_deref(),
    )
    .await
    .map_err(|e| {
        tracing::error!("Chat LLM call failed: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to generate response. Please try again.".to_string(),
        )
    })?;

    Ok(Json(ChatResponse { response }))
}
