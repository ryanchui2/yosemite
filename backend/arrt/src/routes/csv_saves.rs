use axum::{extract::{State, Path}, http::StatusCode, Json};
use serde::Deserialize;
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::models::saved_csv::{SaveCsvRequest, SavedCsvData};
use crate::state::AppState;

#[derive(Deserialize)]
pub(crate) struct CsvSaveIdPath {
    id: Uuid,
}

/// POST /api/csv-saves
pub async fn create(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
    Json(payload): Json<SaveCsvRequest>,
) -> Result<Json<SavedCsvData>, (StatusCode, String)> {
    if payload.stage != "before_scan" && payload.stage != "after_scan" {
        return Err((
            StatusCode::BAD_REQUEST,
            "stage must be 'before_scan' or 'after_scan'".to_string(),
        ));
    }

    let user_id: Uuid = claims.sub.parse().map_err(|_| {
        (StatusCode::INTERNAL_SERVER_ERROR, "Invalid user id".to_string())
    })?;

    let headers_json = serde_json::to_value(&payload.headers).map_err(|e| {
        (StatusCode::UNPROCESSABLE_ENTITY, format!("Invalid headers: {}", e))
    })?;
    let rows_json = serde_json::to_value(&payload.rows).map_err(|e| {
        (StatusCode::UNPROCESSABLE_ENTITY, format!("Invalid rows: {}", e))
    })?;

    let id = Uuid::new_v4();
    let created_at = chrono::Utc::now();

    sqlx::query(
        r#"
        INSERT INTO saved_csv_data (id, name, stage, file_name, headers, rows, scan_id, scan_summary, scan_results, created_at, user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        "#,
    )
    .bind(id)
    .bind(&payload.name)
    .bind(&payload.stage)
    .bind(&payload.file_name)
    .bind(&headers_json)
    .bind(&rows_json)
    .bind(&payload.scan_id)
    .bind(&payload.scan_summary)
    .bind(&payload.scan_results)
    .bind(created_at)
    .bind(user_id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to save CSV data: {}", e))
    })?;

    let saved = SavedCsvData {
        id,
        name: payload.name,
        stage: payload.stage,
        file_name: payload.file_name,
        headers: headers_json,
        rows: rows_json,
        scan_id: payload.scan_id,
        scan_summary: payload.scan_summary,
        scan_results: payload.scan_results,
        created_at,
    };

    Ok(Json(saved))
}

/// GET /api/csv-saves
pub async fn list(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
) -> Result<Json<Vec<SavedCsvData>>, (StatusCode, String)> {
    let user_id: Uuid = claims.sub.parse().map_err(|_| {
        (StatusCode::INTERNAL_SERVER_ERROR, "Invalid user id".to_string())
    })?;

    let rows = sqlx::query_as::<_, SavedCsvData>(
        "SELECT id, name, stage, file_name, headers, rows, scan_id, scan_summary, scan_results, created_at
         FROM saved_csv_data
         WHERE user_id = $1
         ORDER BY created_at DESC"
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to list saved CSV data: {}", e))
    })?;

    Ok(Json(rows))
}

/// DELETE /api/csv-saves/:id
pub async fn delete(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
    Path(CsvSaveIdPath { id }): Path<CsvSaveIdPath>,
) -> Result<StatusCode, (StatusCode, String)> {
    let user_id: Uuid = claims.sub.parse().map_err(|_| {
        (StatusCode::INTERNAL_SERVER_ERROR, "Invalid user id".to_string())
    })?;

    let result = sqlx::query("DELETE FROM saved_csv_data WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(user_id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to delete saved data: {}", e))
        })?;
    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Saved log not found".to_string()));
    }
    Ok(StatusCode::NO_CONTENT)
}
