use axum::{extract::State, Json};

use crate::models::fraud::{FraudReportRequest, FraudReportResponse};
use crate::state::AppState;

pub async fn report(
    State(state): State<AppState>,
    Json(payload): Json<FraudReportRequest>,
) -> Json<FraudReportResponse> {
    let result = sqlx::query(
        "INSERT INTO fraud_reports (transaction_id, confirmed_fraud, reported_by, notes)
         VALUES ($1, $2, $3, $4)"
    )
    .bind(&payload.transaction_id)
    .bind(payload.confirmed_fraud)
    .bind(&payload.reported_by)
    .bind(&payload.notes)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => Json(FraudReportResponse {
            success: true,
            transaction_id: payload.transaction_id,
            message: "Report saved.".to_string(),
        }),
        Err(e) => {
            tracing::error!("Failed to save fraud report: {}", e);
            Json(FraudReportResponse {
                success: false,
                transaction_id: payload.transaction_id,
                message: "Failed to save report.".to_string(),
            })
        }
    }
}
