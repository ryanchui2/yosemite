use axum::{
    extract::{Multipart, State},
    http::StatusCode,
    Json,
};

use crate::models::fraud::{
    PipelineOutcome, PipelineResponse, PipelineResult, Transaction, TransactionInput,
};
use crate::services::{ai_parser, fraud_rules, gemini_vision, llm};
use crate::state::AppState;

// ── Score thresholds ──────────────────────────────────────────────────────────
const CLEAN_THRESHOLD: u32 = 20;
const FRAUD_THRESHOLD: u32 = 70;

// ── Allowed MIME types ────────────────────────────────────────────────────────
const PDF_TYPES: &[&str] = &["application/pdf", "image/jpeg", "image/png", "image/webp"];
const CSV_TYPE: &str = "text/csv";

/// POST /api/fraud/pipeline
///
/// Accept multipart/form-data with a single `file` field.
/// Routes the input through the correct parsing + scoring + reporting path.
#[axum::debug_handler]
pub async fn ingest(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<PipelineResponse>, (StatusCode, String)> {
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
    let mut results: Vec<PipelineResult> = Vec::with_capacity(total);

    // ── Score + route each transaction ────────────────────────────────────────
    for input in transactions {
        let tx: Transaction = input.into();
        let (risk_score, triggered_rules) = fraud_rules::score(&tx);

        if risk_score < CLEAN_THRESHOLD {
            // ── CLEAN — no action ─────────────────────────────────────────────
            results.push(PipelineResult {
                transaction_id: tx.transaction_id,
                risk_score,
                outcome: PipelineOutcome::Clean,
                triggered_rules,
                ai_review_notes: None,
                vision_summary: None,
            });
        } else if risk_score > FRAUD_THRESHOLD {
            // ── HIGH RISK — save report immediately ───────────────────────────
            save_fraud_report(
                &state.db,
                &tx.transaction_id,
                risk_score,
                &triggered_rules,
                false,
                None,
                vision_summary.as_deref(),
            )
            .await;

            results.push(PipelineResult {
                transaction_id: tx.transaction_id,
                risk_score,
                outcome: PipelineOutcome::FraudReportSaved,
                triggered_rules,
                ai_review_notes: None,
                vision_summary: vision_summary.clone(),
            });
        } else {
            // ── AMBIGUOUS (20–70) — deep AI review then save report ───────────
            let ai_notes = llm::explain_fraud(&triggered_rules, &tx.transaction_id, risk_score)
                .await
                .ok();

            // For PDF inputs, attach vision context to the notes
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
                None, // already merged above
            )
            .await;

            results.push(PipelineResult {
                transaction_id: tx.transaction_id,
                risk_score,
                outcome: PipelineOutcome::DeepReviewAndReportSaved,
                triggered_rules,
                ai_review_notes: combined_notes,
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
            amount: get("amount").and_then(|v| v.parse::<f64>().ok()),
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
        "INSERT INTO fraud_reports (transaction_id, confirmed_fraud, reported_by, notes, ai_reviewed, ai_review_notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING"
    )
    .bind(transaction_id)
    .bind(true)
    .bind("pipeline")
    .bind(&notes)
    .bind(ai_reviewed)
    .bind(ai_review_notes)
    .execute(db)
    .await;

    if let Err(e) = result {
        tracing::error!("Pipeline: failed to save fraud report for {}: {}", transaction_id, e);
    }
}
