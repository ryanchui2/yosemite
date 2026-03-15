use axum::{extract::State, Json};

use crate::models::risk::{BusinessRiskRequest, BusinessRiskReport};
use crate::services::{llm, open_sanctions, ucdp};
use crate::state::AppState;

pub async fn business_risk(
    State(state): State<AppState>,
    Json(payload): Json<BusinessRiskRequest>,
) -> Json<BusinessRiskReport> {
    // Fetch from both APIs in parallel
    let countries = payload.countries.clone().unwrap_or_default();

    let (sanctions_hits, conflict_events) = tokio::join!(
        open_sanctions::search(&state.http, &payload.business_description, &state.opensanctions_api_key),
        ucdp::get_conflicts(&state.http, &countries),
    );

    let report = llm::analyze_business_risk(
        &state.http,
        &payload.business_description,
        &sanctions_hits,
        &conflict_events,
    )
    .await
    .unwrap_or_else(|_| BusinessRiskReport {
        business_description: payload.business_description.clone(),
        overall_risk_level: "UNKNOWN".to_string(),
        sanctions_hits,
        conflict_events,
        recommendations: vec![],
        ai_summary: "Analysis unavailable.".to_string(),
    });

    Json(report)
}
