use axum::{extract::State, Json};

use crate::models::fraud::{BenfordResponse, DuplicatesResponse};
use crate::models::transaction::Transaction;
use crate::services::{anomaly_service, llm};
use crate::state::AppState;

pub async fn benford(State(state): State<AppState>) -> Json<BenfordResponse> {
    let transactions: Vec<Transaction> =
        sqlx::query_as::<_, Transaction>("SELECT * FROM transactions")
            .fetch_all(&state.db)
            .await
            .unwrap_or_default();

    let amounts: Vec<f64> = transactions.iter().filter_map(|tx| tx.amount).collect();
    let mut result = anomaly_service::get_benford_analysis(&state.http, &amounts).await;

    // Ask Gemini to explain if suspicious
    if result.is_suspicious == Some(true) && !result.flagged_digits.is_empty() {
        let digits: Vec<String> = result.flagged_digits.iter().map(|d| d.to_string()).collect();
        let rules = vec![format!(
            "Benford's Law deviation detected. Chi-square: {:.2}. Flagged leading digits: {}",
            result.chi_square.unwrap_or(0.0),
            digits.join(", ")
        )];
        result.ai_explanation = llm::explain_fraud(&rules, "BATCH-BENFORD", 75).await.ok();
    }

    Json(result)
}

pub async fn duplicates(State(state): State<AppState>) -> Json<DuplicatesResponse> {
    let transactions: Vec<Transaction> =
        sqlx::query_as::<_, Transaction>("SELECT * FROM transactions")
            .fetch_all(&state.db)
            .await
            .unwrap_or_default();

    let mut result = anomaly_service::get_duplicates(&state.http, &transactions).await;

    // Ask Gemini to explain if duplicates found
    if result.total_duplicate_groups > 0 {
        let rules = vec![format!(
            "{} duplicate invoice group(s) detected across {} transactions",
            result.total_duplicate_groups,
            transactions.len()
        )];
        result.ai_explanation = llm::explain_fraud(&rules, "BATCH-DUPLICATES", 60).await.ok();
    }

    Json(result)
}
