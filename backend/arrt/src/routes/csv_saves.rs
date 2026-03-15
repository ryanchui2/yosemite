use axum::{extract::{State, Path}, http::StatusCode, Json};
use serde::Deserialize;
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::models::saved_csv::{SaveCsvRequest, SavedCsvData};
use crate::state::AppState;

/// Extract a string from a JSON object by key (case-insensitive).
/// Tries the given key first, then any alternate keys (e.g. "vendor" for customer_name).
fn get_str(
    obj: &serde_json::Map<String, serde_json::Value>,
    key: &str,
    alternates: &[&str],
) -> Option<String> {
    let try_key = |k: &str| {
        let key_lower = k.to_lowercase();
        for (obj_k, v) in obj {
            if obj_k.to_lowercase() == key_lower {
                return v.as_str().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
            }
        }
        None
    };
    try_key(key).or_else(|| alternates.iter().find_map(|&alt| try_key(alt)))
}

/// Parse a JSON row (object) into transaction fields and upsert into the transactions table.
async fn upsert_transaction_from_row(
    db: &sqlx::PgPool,
    row: &serde_json::Value,
) -> Result<(), sqlx::Error> {
    let obj = match row.as_object() {
        Some(o) => o,
        None => return Ok(()),
    };

    let transaction_id = get_str(obj, "transaction_id", &["id"])
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let customer_name = get_str(obj, "customer_name", &["vendor", "merchant", "name"]);
    let customer_id = get_str(obj, "customer_id", &[]);
    let order_id = get_str(obj, "order_id", &["order", "orderid"]);
    let timestamp = get_str(obj, "timestamp", &["date", "datetime", "time"]);
    let amount = get_str(obj, "amount", &["total", "value"])
        .and_then(|s| s.parse::<f64>().ok())
        .or_else(|| {
            let key_lower = "amount".to_string();
            for (k, v) in obj {
                if k.to_lowercase() == key_lower {
                    return v.as_f64();
                }
            }
            None
        });
    let avs_result = get_str(obj, "avs_result", &[]);
    let entry_mode = get_str(obj, "entry_mode", &[]);
    let refund_status = get_str(obj, "refund_status", &[]);
    let ip_country = get_str(obj, "ip_country", &["country"]);
    let device_type = get_str(obj, "device_type", &["device"]);

    let parse_bool = |key: &str, alts: &[&str]| -> Option<bool> {
        get_str(obj, key, alts).and_then(|s| match s.to_lowercase().as_str() {
            "true" | "1" | "yes" => Some(true),
            "false" | "0" | "no" => Some(false),
            _ => None,
        })
    };
    let cvv_match = parse_bool("cvv_match", &[]);
    let address_match = parse_bool("address_match", &[]);
    let ip_is_vpn = parse_bool("ip_is_vpn", &[]);
    let card_present = parse_bool("card_present", &[]);

    sqlx::query(
        r#"
        INSERT INTO transactions (
            transaction_id, customer_name, customer_id, order_id, amount, timestamp,
            cvv_match, avs_result, address_match,
            ip_is_vpn, ip_country, device_type,
            card_present, entry_mode, refund_status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (transaction_id) DO UPDATE SET
            customer_name = EXCLUDED.customer_name,
            customer_id = EXCLUDED.customer_id,
            order_id = EXCLUDED.order_id,
            amount = EXCLUDED.amount,
            timestamp = EXCLUDED.timestamp,
            cvv_match = EXCLUDED.cvv_match,
            avs_result = EXCLUDED.avs_result,
            address_match = EXCLUDED.address_match,
            ip_is_vpn = EXCLUDED.ip_is_vpn,
            ip_country = EXCLUDED.ip_country,
            device_type = EXCLUDED.device_type,
            card_present = EXCLUDED.card_present,
            entry_mode = EXCLUDED.entry_mode,
            refund_status = EXCLUDED.refund_status
        "#,
    )
    .bind(&transaction_id)
    .bind(&customer_name)
    .bind(&customer_id)
    .bind(&order_id)
    .bind(amount)
    .bind(&timestamp)
    .bind(cvv_match)
    .bind(&avs_result)
    .bind(address_match)
    .bind(ip_is_vpn)
    .bind(&ip_country)
    .bind(&device_type)
    .bind(card_present)
    .bind(&entry_mode)
    .bind(&refund_status)
    .execute(db)
    .await?;
    Ok(())
}

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

    // Upsert each row into the transactions table so Overview stats and GET /api/transactions reflect saved data.
    for row in &payload.rows {
        if let Err(e) = upsert_transaction_from_row(&state.db, row).await {
            tracing::warn!("csv_saves: failed to upsert transaction row: {}", e);
        }
    }

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
