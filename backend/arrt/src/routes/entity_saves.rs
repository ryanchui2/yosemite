use axum::{extract::{State, Path}, http::StatusCode, Json};
use serde::Deserialize;

use crate::models::saved_entity::{SaveEntityRequest, SavedEntityData};
use crate::state::AppState;
use uuid::Uuid;

#[derive(Deserialize)]
pub(crate) struct EntitySaveIdPath {
    id: Uuid,
}

/// POST /api/entity-saves
/// Save an entity list (and optional sanctions/geo scan results) for Geo & Sanctions.
pub async fn create(
    State(state): State<AppState>,
    Json(payload): Json<SaveEntityRequest>,
) -> Result<Json<SavedEntityData>, (StatusCode, String)> {
    let entities_json = serde_json::to_value(&payload.entities).map_err(|e| {
        (
            StatusCode::UNPROCESSABLE_ENTITY,
            format!("Invalid entities: {}", e),
        )
    })?;

    let id = Uuid::new_v4();
    let created_at = chrono::Utc::now();

    sqlx::query(
        r#"
        INSERT INTO saved_entity_data (id, name, entities, sanctions_results, geo_results, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        "#,
    )
    .bind(id)
    .bind(&payload.name)
    .bind(&entities_json)
    .bind(&payload.sanctions_results)
    .bind(&payload.geo_results)
    .bind(created_at)
    .execute(&state.db)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to save entity data: {}", e),
        )
    })?;

    let saved = SavedEntityData {
        id,
        name: payload.name,
        entities: entities_json,
        sanctions_results: payload.sanctions_results,
        geo_results: payload.geo_results,
        created_at,
    };

    Ok(Json(saved))
}

/// GET /api/entity-saves
/// List saved entity lists, most recent first.
pub async fn list(
    State(state): State<AppState>,
) -> Result<Json<Vec<SavedEntityData>>, (StatusCode, String)> {
    let rows = sqlx::query_as::<_, SavedEntityData>(
        "SELECT id, name, entities, sanctions_results, geo_results, created_at
         FROM saved_entity_data
         ORDER BY created_at DESC"
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Failed to list saved entity data: {}", e),
        )
    })?;

    Ok(Json(rows))
}

/// DELETE /api/entity-saves/:id
pub async fn delete(
    State(state): State<AppState>,
    Path(EntitySaveIdPath { id }): Path<EntitySaveIdPath>,
) -> Result<StatusCode, (StatusCode, String)> {
    let result = sqlx::query("DELETE FROM saved_entity_data WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to delete saved entity data: {}", e),
            )
        })?;
    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Saved entity list not found".to_string()));
    }
    Ok(StatusCode::NO_CONTENT)
}
