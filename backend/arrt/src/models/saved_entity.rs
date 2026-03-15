use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct SavedEntityData {
    pub id: Uuid,
    pub name: Option<String>,
    pub entities: serde_json::Value,
    pub sanctions_results: Option<serde_json::Value>,
    pub geo_results: Option<serde_json::Value>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Deserialize)]
pub struct SaveEntityRequest {
    pub name: Option<String>,
    pub entities: Vec<EntityRow>,
    pub sanctions_results: Option<serde_json::Value>,
    pub geo_results: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntityRow {
    pub description: String,
    pub country: String,
}
