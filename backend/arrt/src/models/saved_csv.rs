use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct SavedCsvData {
    pub id: Uuid,
    pub name: Option<String>,
    pub stage: String,
    pub file_name: Option<String>,
    pub headers: serde_json::Value,
    pub rows: serde_json::Value,
    pub scan_id: Option<String>,
    pub scan_summary: Option<serde_json::Value>,
    pub scan_results: Option<serde_json::Value>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Deserialize)]
pub struct SaveCsvRequest {
    pub name: Option<String>,
    pub stage: String,
    pub file_name: Option<String>,
    pub headers: Vec<String>,
    pub rows: Vec<serde_json::Value>,
    pub scan_id: Option<String>,
    pub scan_summary: Option<serde_json::Value>,
    pub scan_results: Option<serde_json::Value>,
}
