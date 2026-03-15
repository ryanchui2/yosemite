use axum::{http::StatusCode, Json};
use serde::Deserialize;

use crate::models::fraud::GeoRiskResponse;
use crate::services::llm;

#[derive(Deserialize)]
pub struct GeoRiskRequest {
    pub countries: Vec<String>,
}

/// POST /api/fraud/georisk
///
/// Accept JSON `{ "countries": ["Myanmar", "Nigeria"] }` and return an
/// AI-generated risk assessment for each country.
pub async fn analyze(
    Json(payload): Json<GeoRiskRequest>,
) -> Result<Json<GeoRiskResponse>, (StatusCode, String)> {
    let countries: Vec<String> = payload
        .countries
        .into_iter()
        .map(|c| c.trim().to_string())
        .filter(|c| !c.is_empty())
        .collect();

    if countries.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "No countries provided.".to_string()));
    }

    if countries.len() > 20 {
        return Err((StatusCode::BAD_REQUEST, "Maximum 20 countries per request.".to_string()));
    }

    let results = llm::analyze_geo_risk(&countries).await.map_err(|e| {
        tracing::error!("Geo-risk analysis failed: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Analysis failed: {}", e))
    })?;

    Ok(Json(GeoRiskResponse { results }))
}
