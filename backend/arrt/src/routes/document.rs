use axum::{
    extract::{Multipart, State},
    http::StatusCode,
    Json,
};

use crate::auth::middleware::AuthUser;

use crate::models::fraud::DocumentFraudResponse;
use crate::services::gemini_vision;
use crate::state::AppState;

pub async fn analyze(
    AuthUser(_): AuthUser,
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<DocumentFraudResponse>, (StatusCode, String)> {
    let mut file_bytes: Option<Vec<u8>> = None;
    let mut mime_type = "application/octet-stream".to_string();

    while let Some(field) = multipart.next_field().await.map_err(|e| {
        (StatusCode::BAD_REQUEST, format!("Multipart error: {}", e))
    })? {
        let content_type = field
            .content_type()
            .unwrap_or("application/octet-stream")
            .to_string();

        let bytes = field.bytes().await.map_err(|e| {
            (StatusCode::BAD_REQUEST, format!("Failed to read file: {}", e))
        })?;

        // Validate type — accept PDF and common image formats
        let allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
        if !allowed.contains(&content_type.as_str()) {
            return Err((
                StatusCode::UNSUPPORTED_MEDIA_TYPE,
                format!("Unsupported file type: {}. Use PDF, JPEG, PNG, or WEBP.", content_type),
            ));
        }

        // Limit to 10MB
        if bytes.len() > 10 * 1024 * 1024 {
            return Err((
                StatusCode::PAYLOAD_TOO_LARGE,
                "File too large. Maximum 10MB.".to_string(),
            ));
        }

        mime_type = content_type;
        file_bytes = Some(bytes.to_vec());
    }

    let bytes = file_bytes.ok_or((
        StatusCode::BAD_REQUEST,
        "No file uploaded. Send a PDF or image as multipart/form-data field 'file'.".to_string(),
    ))?;

    gemini_vision::analyze_document(&state.http, bytes, &mime_type)
        .await
        .map(Json)
        .map_err(|e| {
            tracing::error!("Document analysis failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, format!("Analysis failed: {}", e))
        })
}
