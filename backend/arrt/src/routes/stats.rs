use axum::{extract::State, Json};
use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::state::AppState;

#[derive(Serialize)]
pub struct TopVendor {
    pub name: String,
    pub volume: f64,
    pub transaction_count: i64,
}

#[derive(Serialize)]
pub struct StatsResponse {
    pub total_transactions: i64,
    pub total_volume: f64,
    pub last_scan_at: Option<DateTime<Utc>>,
    pub volume_this_month: f64,
    pub volume_last_month: f64,
    pub top_vendors: Vec<TopVendor>,
}

/// GET /api/stats — dashboard metrics for small businesses.
/// All metrics are computed from the `transactions` table (same data as GET /api/transactions).
pub async fn get_stats(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
) -> Json<StatsResponse> {
    let user_id: Uuid = claims.sub.parse().unwrap_or_default();

    let total_row: (i64,) = sqlx::query_as("SELECT COUNT(*)::bigint FROM transactions")
        .fetch_one(&state.db)
        .await
        .unwrap_or((0,));

    let volume_row: (Option<f64>,) = sqlx::query_as("SELECT COALESCE(SUM(amount), 0) FROM transactions")
        .fetch_one(&state.db)
        .await
        .unwrap_or((Some(0.0),));

    let last_scan: Option<DateTime<Utc>> = sqlx::query_scalar(
        r#"
        SELECT created_at FROM saved_csv_data
        WHERE user_id = $1 AND stage = 'after_scan'
        ORDER BY created_at DESC LIMIT 1
        "#,
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None);

    let volume_this_month: (Option<f64>,) = sqlx::query_as(
        r#"
        SELECT COALESCE(SUM(amount), 0) FROM transactions
        WHERE created_at >= date_trunc('month', now())
          AND created_at < date_trunc('month', now()) + interval '1 month'
        "#,
    )
    .fetch_one(&state.db)
    .await
    .unwrap_or((Some(0.0),));

    let volume_last_month: (Option<f64>,) = sqlx::query_as(
        r#"
        SELECT COALESCE(SUM(amount), 0) FROM transactions
        WHERE created_at >= date_trunc('month', now()) - interval '1 month'
          AND created_at < date_trunc('month', now())
        "#,
    )
    .fetch_one(&state.db)
    .await
    .unwrap_or((Some(0.0),));

    #[derive(sqlx::FromRow)]
    struct VendorRow {
        name: Option<String>,
        volume: Option<f64>,
        transaction_count: i64,
    }

    let top_vendors: Vec<TopVendor> = sqlx::query_as::<_, VendorRow>(
        r#"
        SELECT
            COALESCE(customer_name, merchant_id, 'Unknown') AS name,
            SUM(COALESCE(amount, 0)) AS volume,
            COUNT(*)::bigint AS transaction_count
        FROM transactions
        GROUP BY COALESCE(customer_name, merchant_id, 'Unknown')
        HAVING SUM(COALESCE(amount, 0)) > 0
        ORDER BY volume DESC
        LIMIT 5
        "#,
    )
    .fetch_all(&state.db)
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|r| TopVendor {
        name: r.name.unwrap_or_else(|| "Unknown".to_string()),
        volume: r.volume.unwrap_or(0.0),
        transaction_count: r.transaction_count,
    })
    .collect();

    Json(StatsResponse {
        total_transactions: total_row.0,
        total_volume: volume_row.0.unwrap_or(0.0),
        last_scan_at: last_scan,
        volume_this_month: volume_this_month.0.unwrap_or(0.0),
        volume_last_month: volume_last_month.0.unwrap_or(0.0),
        top_vendors,
    })
}
