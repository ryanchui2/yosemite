use axum::{extract::{State, Path}, http::StatusCode, Json};
use serde::Deserialize;
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::models::saved_entity::{SaveEntityRequest, SavedEntityData};
use crate::state::AppState;

#[derive(Deserialize)]
pub(crate) struct EntitySaveIdPath {
    id: Uuid,
}

/// POST /api/entity-saves
pub async fn create(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
    Json(payload): Json<SaveEntityRequest>,
) -> Result<Json<SavedEntityData>, (StatusCode, String)> {
    let user_id: Uuid = claims.sub.parse().map_err(|_| {
        (StatusCode::INTERNAL_SERVER_ERROR, "Invalid user id".to_string())
    })?;

    let entities_json = serde_json::to_value(&payload.entities).map_err(|e| {
        (StatusCode::UNPROCESSABLE_ENTITY, format!("Invalid entities: {}", e))
    })?;

    let id = Uuid::new_v4();
    let created_at = chrono::Utc::now();

    sqlx::query(
        r#"
        INSERT INTO saved_entity_data (id, name, entities, sanctions_results, geo_results, created_at, user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        "#,
    )
    .bind(id)
    .bind(&payload.name)
    .bind(&entities_json)
    .bind(&payload.sanctions_results)
    .bind(&payload.geo_results)
    .bind(created_at)
    .bind(user_id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to save entity data: {}", e))
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
pub async fn list(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
) -> Result<Json<Vec<SavedEntityData>>, (StatusCode, String)> {
    let user_id: Uuid = claims.sub.parse().map_err(|_| {
        (StatusCode::INTERNAL_SERVER_ERROR, "Invalid user id".to_string())
    })?;

    let rows = sqlx::query_as::<_, SavedEntityData>(
        "SELECT id, name, entities, sanctions_results, geo_results, created_at
         FROM saved_entity_data
         WHERE user_id = $1
         ORDER BY created_at DESC"
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to list saved entity data: {}", e))
    })?;

    Ok(Json(rows))
}

/// DELETE /api/entity-saves/:id
pub async fn delete(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
    Path(EntitySaveIdPath { id }): Path<EntitySaveIdPath>,
) -> Result<StatusCode, (StatusCode, String)> {
    let user_id: Uuid = claims.sub.parse().map_err(|_| {
        (StatusCode::INTERNAL_SERVER_ERROR, "Invalid user id".to_string())
    })?;

    let result = sqlx::query("DELETE FROM saved_entity_data WHERE id = $1 AND user_id = $2")
        .bind(id)
        .bind(user_id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to delete saved entity data: {}", e))
        })?;
    if result.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "Saved entity list not found".to_string()));
    }
    Ok(StatusCode::NO_CONTENT)
}
