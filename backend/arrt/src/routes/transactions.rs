use axum::{extract::{Query, State}, Json};
use serde::Deserialize;

use crate::{models::transaction::Transaction, state::AppState};

#[derive(Deserialize)]
pub struct TransactionQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub risk_level: Option<String>,
    pub customer_id: Option<String>,
}

pub async fn list(
    State(state): State<AppState>,
    Query(params): Query<TransactionQuery>,
) -> Json<Vec<Transaction>> {
    let limit = params.limit.unwrap_or(50).min(200);
    let offset = params.offset.unwrap_or(0);

    let rows = sqlx::query_as::<_, Transaction>(
        "SELECT * FROM transactions ORDER BY timestamp DESC LIMIT $1 OFFSET $2"
    )
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    Json(rows)
}
