use axum::{extract::State, Json};

use crate::models::fraud::{FraudResult, ScanRequest, ScanResponse, Transaction};
use crate::services::fraud_rules;
use crate::services::gemini;
use crate::state::AppState;

fn to_fraud_rules_tx(tx: &Transaction) -> fraud_rules::Transaction {
    fraud_rules::Transaction {
        transaction_id: tx.transaction_id.clone(),
        customer_name: tx.customer_name.clone(),
        amount: tx.amount,
        cvv_match: tx.cvv_match,
        avs_result: tx.avs_result.clone(),
        address_match: tx.address_match,
        ip_is_vpn: tx.ip_is_vpn,
        card_present: tx.card_present,
        entry_mode: tx.entry_mode.clone(),
        refund_status: tx.refund_status.clone(),
    }
}

pub async fn scan(
    State(state): State<AppState>,
    Json(payload): Json<ScanRequest>,
) -> Json<ScanResponse> {
    let transactions: Vec<Transaction> = if let Some(ids) = &payload.transaction_ids {
        sqlx::query_as::<_, Transaction>(
            "SELECT * FROM transactions WHERE transaction_id = ANY($1)",
        )
        .bind(ids)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
    } else {
        sqlx::query_as::<_, Transaction>("SELECT * FROM transactions")
            .fetch_all(&state.db)
            .await
            .unwrap_or_default()
    };

    let total_scanned = transactions.len();
    let mut results: Vec<FraudResult> = Vec::new();

    for tx in transactions {
        let (risk_score, triggered_rules) = fraud_rules::score(&to_fraud_rules_tx(&tx));
        if risk_score == 0 {
            continue;
        }

        let risk_level = fraud_rules::risk_level(risk_score).to_string();

        let ai_explanation = gemini::explain_fraud(&triggered_rules, &tx.transaction_id, risk_score)
            .await
            .ok();

        results.push(FraudResult {
            transaction_id: tx.transaction_id,
            customer_name: tx.customer_name,
            amount: tx.amount,
            risk_score,
            risk_level,
            triggered_rules,
            ai_explanation,
        });
    }

    results.sort_by(|a, b| b.risk_score.cmp(&a.risk_score));
    let flagged = results.len();

    Json(ScanResponse {
        total_scanned,
        flagged,
        results,
    })
}
