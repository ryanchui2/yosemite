use axum::{extract::{Query, State}, Json};
use serde::Deserialize;

use crate::auth::middleware::AuthUser;
use crate::{models::transaction::Transaction, state::AppState};

#[derive(Deserialize)]
pub struct TransactionQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub customer_id: Option<String>,
}

pub async fn list(
    AuthUser(_): AuthUser,
    State(state): State<AppState>,
    Query(params): Query<TransactionQuery>,
) -> Json<Vec<Transaction>> {
    let limit = params.limit.unwrap_or(50).min(500);
    let offset = params.offset.unwrap_or(0);

    let rows = if let Some(cid) = &params.customer_id {
        sqlx::query_as::<_, Transaction>(
            "SELECT * FROM transactions WHERE customer_id = $1 ORDER BY timestamp DESC LIMIT $2 OFFSET $3"
        )
        .bind(cid)
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
    } else {
        sqlx::query_as::<_, Transaction>(
            "SELECT * FROM transactions ORDER BY timestamp DESC LIMIT $1 OFFSET $2"
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
    };

    Json(rows)
}
