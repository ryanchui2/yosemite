use axum::{
    extract::{Multipart, State},
    http::StatusCode,
    Json,
};
use std::path::Path;

use crate::auth::middleware::AuthUser;

use crate::models::fraud::{
    PipelineOutcome, PipelineResponse, PipelineResult, ScoringTx, TransactionInput,
};
use crate::services::{ai_parser, fraud_rules, gemini_vision, llm};
use crate::state::AppState;

// ── Score thresholds ──────────────────────────────────────────────────────────
const CLEAN_THRESHOLD: u32 = 20;
const FRAUD_THRESHOLD: u32 = 70;

// ── Allowed MIME types ────────────────────────────────────────────────────────
const PDF_TYPES: &[&str] = &["application/pdf", "image/jpeg", "image/png", "image/webp"];
const CSV_TYPE: &str = "text/csv";

/// POST /api/fraud/seed-demo
///
/// Loads transactions from scripts/demo/transactions_agent_scan_demo.csv into the DB
/// so the agent pipeline (velocity, graph, sequence, GNN) has proper demo data.
#[axum::debug_handler]
pub async fn seed_demo(
    AuthUser(_): AuthUser,
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".into());
    let path = Path::new(&manifest_dir)
        .join("../..")
        .join("scripts/demo/transactions_agent_scan_demo.csv");
    let path = path
        .canonicalize()
        .map_err(|e| (StatusCode::NOT_FOUND, format!("Demo CSV not found: {}. Run from repo root or set CARGO_MANIFEST_DIR. {}", path.display(), e)))?;
    let bytes = std::fs::read(&path).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to read demo CSV: {}", e)))?;
    let transactions = parse_csv(&bytes).map_err(|e| (StatusCode::UNPROCESSABLE_ENTITY, format!("Demo CSV parse error: {}", e)))?;
    // Clear existing transactions so the DB only has demo data (and agent scan gets the right set).
    sqlx::query("TRUNCATE TABLE transactions CASCADE")
        .execute(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to clear transactions: {}", e)))?;
    for tx in &transactions {
        save_transaction(&state.db, tx).await;
    }
    Ok(Json(serde_json::json!({ "loaded": transactions.len(), "path": path.to_string_lossy() })))
}

/// POST /api/fraud/pipeline
///
/// Accept multipart/form-data with a single `file` field.
/// Routes the input through the correct parsing + scoring + reporting path.
#[axum::debug_handler]
pub async fn ingest(
    AuthUser(claims): AuthUser,
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<PipelineResponse>, (StatusCode, String)> {
    let user_id = uuid::Uuid::parse_str(&claims.sub).ok();
    // ── Extract file bytes and content-type ───────────────────────────────────
    let mut file_bytes: Option<Vec<u8>> = None;
    let mut mime_type = "application/octet-stream".to_string();

    while let Some(field) = multipart.next_field().await.map_err(|e| {
        (StatusCode::BAD_REQUEST, format!("Multipart error: {}", e))
    })? {
        let ct = field
            .content_type()
            .unwrap_or("application/octet-stream")
            .to_string();

        let bytes = field.bytes().await.map_err(|e| {
            (StatusCode::BAD_REQUEST, format!("Failed to read file: {}", e))
        })?;

        if bytes.len() > 20 * 1024 * 1024 {
            return Err((StatusCode::PAYLOAD_TOO_LARGE, "File too large. Maximum 20MB.".to_string()));
        }

        mime_type = ct;
        file_bytes = Some(bytes.to_vec());
    }

    let bytes = file_bytes.ok_or((
        StatusCode::BAD_REQUEST,
        "No file uploaded. Send a file as multipart/form-data field 'file'.".to_string(),
    ))?;

    // ── Determine source type and parse into transactions ─────────────────────
    let (source_type, transactions, vision_summary) = if mime_type == CSV_TYPE {
        let txns = parse_csv(&bytes).map_err(|e| {
            (StatusCode::UNPROCESSABLE_ENTITY, format!("CSV parse error: {}", e))
        })?;
        ("csv".to_string(), txns, None)
    } else if PDF_TYPES.contains(&mime_type.as_str()) {
        // Run AI document parser and Gemini Vision concurrently
        let parse_fut = ai_parser::parse_document_to_csv(&state.http, bytes.clone(), &mime_type);
        let vision_fut = gemini_vision::analyze_document(&state.http, bytes.clone(), &mime_type);

        let (parse_result, vision_result) = tokio::join!(parse_fut, vision_fut);

        let txns = parse_result.map_err(|e| {
            (StatusCode::INTERNAL_SERVER_ERROR, format!("AI document parse failed: {}", e))
        })?;

        // Extract a short summary from Gemini Vision for attaching to reports
        let vision_note = vision_result.ok().map(|v| {
            format!(
                "[Vision] risk={} score={} — {} — {}",
                v.risk_level, v.risk_score, v.summary, v.recommended_action
            )
        });

        ("pdf".to_string(), txns, vision_note)
    } else {
        // Other documents (email, plain text, etc.) — AI parse only
        let txns = ai_parser::parse_document_to_csv(&state.http, bytes, &mime_type)
            .await
            .map_err(|e| {
                (StatusCode::INTERNAL_SERVER_ERROR, format!("AI document parse failed: {}", e))
            })?;
        ("document".to_string(), txns, None)
    };

    let total = transactions.len();
    let mut results: Vec<PipelineResult> = Vec::with_capacity(total + 1);

    // ── Score + route each transaction ────────────────────────────────────────
    for input in transactions {
        // ... (existing loop content remains same)
        save_transaction(&state.db, &input).await;

        let customer_name = input.customer_name.clone();
        let amount = input.amount;
        let timestamp = input.timestamp.clone();

        let tx: ScoringTx = input.into();
        let (risk_score, triggered_rules) = fraud_rules::score(&tx);

        if risk_score < CLEAN_THRESHOLD {
            results.push(PipelineResult {
                transaction_id: tx.transaction_id.clone(),
                customer_name,
                amount,
                timestamp,
                risk_score,
                outcome: PipelineOutcome::Clean,
                triggered_rules,
                ai_review_notes: None,
                vision_summary: None,
            });
        } else if risk_score > FRAUD_THRESHOLD {
            save_fraud_report(
                &state.db,
                &tx.transaction_id,
                risk_score,
                &triggered_rules,
                false,
                vision_summary.as_deref(),
                None,
                user_id,
            )
            .await;

            results.push(PipelineResult {
                transaction_id: tx.transaction_id,
                customer_name,
                amount,
                timestamp,
                risk_score,
                outcome: PipelineOutcome::FraudReportSaved,
                triggered_rules,
                ai_review_notes: vision_summary.clone(),
                vision_summary: vision_summary.clone(),
            });
        } else {
            let ai_notes = llm::explain_fraud(&state.http, &triggered_rules, &tx.transaction_id, risk_score)
                .await
                .ok();

            let combined_notes = match (&ai_notes, &vision_summary) {
                (Some(n), Some(v)) => Some(format!("{}\n{}", n, v)),
                (Some(n), None) => Some(n.clone()),
                (None, Some(v)) => Some(v.clone()),
                (None, None) => None,
            };

            save_fraud_report(
                &state.db,
                &tx.transaction_id,
                risk_score,
                &triggered_rules,
                true,
                combined_notes.as_deref(),
                None,
                user_id,
            )
            .await;

            results.push(PipelineResult {
                transaction_id: tx.transaction_id,
                customer_name,
                amount,
                timestamp,
                risk_score,
                outcome: PipelineOutcome::DeepReviewAndReportSaved,
                triggered_rules,
                ai_review_notes: combined_notes,
                vision_summary: vision_summary.clone(),
            });
        }
    }

    // ── Document-level Fallback ───────────────────────────────────────────────
    // If no transactions were found, but the document itself (Vision) is HIGH RISK,
    // add a document-level anomaly result so the user sees the phishing/fraud signal.
    if results.is_empty() && vision_summary.is_some() {
        // Look for "score=X" in the vision_summary note to recover the score
        let score = vision_summary.as_ref()
            .and_then(|s| s.split("score=").nth(1))
            .and_then(|s| s.split(' ').next())
            .and_then(|s| s.parse::<u32>().ok())
            .unwrap_or(0);

        if score >= FRAUD_THRESHOLD {
            let doc_id = format!("DOC-ANOMALY-{}", &uuid::Uuid::new_v4().to_string()[..8]);
            
            save_fraud_report(
                &state.db,
                &doc_id,
                score,
                &vec!["High document-level risk".to_string()],
                false,
                vision_summary.as_deref(),
                None,
                user_id,
            )
            .await;

            results.push(PipelineResult {
                transaction_id: doc_id,
                customer_name: Some("Document Analysis".to_string()),
                amount: None,
                timestamp: Some(chrono::Utc::now().to_rfc3339()),
                risk_score: score,
                outcome: PipelineOutcome::FraudReportSaved,
                triggered_rules: vec!["Forensic analysis suggests fraudulent document content".to_string()],
                ai_review_notes: vision_summary.clone(),
                vision_summary: vision_summary.clone(),
            });
        }
    }

    Ok(Json(PipelineResponse {
        source_type,
        transactions_processed: total,
        results,
    }))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Parse CSV bytes into a list of TransactionInput rows.
/// The CSV must have a header row that matches (a subset of) the Transaction field names.
fn parse_csv(bytes: &[u8]) -> Result<Vec<TransactionInput>, Box<dyn std::error::Error + Send + Sync>> {
    let mut reader = csv::Reader::from_reader(bytes);
    let headers = reader.headers()?.clone();

    let mut rows: Vec<TransactionInput> = Vec::new();

    for result in reader.records() {
        let record = result?;

        // Helper: get field by header name (case-insensitive)
        let get = |name: &str| -> Option<String> {
            headers.iter().position(|h| h.to_ascii_lowercase() == name.to_ascii_lowercase())
                .and_then(|i| record.get(i))
                .filter(|v| !v.is_empty())
                .map(String::from)
        };

        let parse_bool = |name: &str| -> Option<bool> {
            get(name).and_then(|v| match v.to_ascii_lowercase().as_str() {
                "true" | "1" | "yes" => Some(true),
                "false" | "0" | "no" => Some(false),
                _ => None,
            })
        };

        let transaction_id = match get("transaction_id") {
            Some(id) => id,
            None => continue, // skip rows without an ID
        };

        rows.push(TransactionInput {
            transaction_id,
            customer_name: get("customer_name"),
            customer_id: get("customer_id"),
            order_id: get("order_id"),
            amount: get("amount").and_then(|v| v.parse::<f64>().ok()),
            timestamp: get("timestamp"),
            cvv_match: parse_bool("cvv_match"),
            avs_result: get("avs_result"),
            address_match: parse_bool("address_match"),
            ip_is_vpn: parse_bool("ip_is_vpn"),
            ip_country: get("ip_country"),
            device_type: get("device_type"),
            card_present: parse_bool("card_present"),
            entry_mode: get("entry_mode"),
            refund_status: get("refund_status"),
        });
    }

    Ok(rows)
}

/// Insert a fraud report into the DB using the existing schema (now with ai_reviewed columns).
async fn save_fraud_report(
    db: &sqlx::PgPool,
    transaction_id: &str,
    risk_score: u32,
    triggered_rules: &[String],
    ai_reviewed: bool,
    ai_review_notes: Option<&str>,
    extra_notes: Option<&str>,
    user_id: Option<uuid::Uuid>,
) {
    let base_notes = format!(
        "Pipeline auto-report. Score: {}. Rules: {}",
        risk_score,
        triggered_rules.join(", ")
    );
    let notes = match extra_notes {
        Some(extra) => format!("{}\n{}", base_notes, extra),
        None => base_notes,
    };

    let result = sqlx::query(
        "INSERT INTO fraud_reports (transaction_id, confirmed_fraud, reported_by, notes, ai_reviewed, ai_review_notes, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING"
    )
    .bind(transaction_id)
    .bind(true)
    .bind("pipeline")
    .bind(&notes)
    .bind(ai_reviewed)
    .bind(ai_review_notes)
    .bind(user_id)
    .execute(db)
    .await;

    if let Err(e) = result {
        tracing::error!("Pipeline: failed to save fraud report for {}: {}", transaction_id, e);
    }
}

/// Insert a parsed transaction into the DB so it appears in the main dashboard lists.
async fn save_transaction(db: &sqlx::PgPool, tx: &TransactionInput) {
    let result = sqlx::query(
        "INSERT INTO transactions (
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
            refund_status = EXCLUDED.refund_status"
    )
    .bind(&tx.transaction_id)
    .bind(&tx.customer_name)
    .bind(&tx.customer_id)
    .bind(&tx.order_id)
    .bind(tx.amount)
    .bind(&tx.timestamp)
    .bind(tx.cvv_match)
    .bind(&tx.avs_result)
    .bind(tx.address_match)
    .bind(tx.ip_is_vpn)
    .bind(&tx.ip_country)
    .bind(&tx.device_type)
    .bind(tx.card_present)
    .bind(&tx.entry_mode)
    .bind(&tx.refund_status)
    .execute(db)
    .await;

    if let Err(e) = result {
        tracing::error!("Pipeline: failed to save transaction {}: {}", tx.transaction_id, e);
    }
}
