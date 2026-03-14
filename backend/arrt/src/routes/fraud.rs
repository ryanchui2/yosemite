use axum::Json;

use crate::models::fraud::{FraudResult, ScanRequest, ScanResponse};

// Placeholder until Backend 1 hands over AppState + Transaction model
struct StubTransaction {
    transaction_id: String,
    customer_name: Option<String>,
    amount: Option<f64>,
    cvv_match: Option<bool>,
    avs_result: Option<String>,
    address_match: Option<bool>,
    ip_is_vpn: Option<bool>,
    card_present: Option<bool>,
    entry_mode: Option<String>,
    refund_status: Option<String>,
}

fn score_transaction(tx: &StubTransaction) -> (u32, Vec<String>) {
    let mut score: u32 = 0;
    let mut rules: Vec<String> = Vec::new();

    if tx.cvv_match == Some(false) {
        score += 35;
        rules.push("CVV mismatch".to_string());
    }

    if let Some(ref avs) = tx.avs_result {
        if avs.to_lowercase().contains("no match") || avs.to_lowercase() == "n" {
            score += 25;
            rules.push("AVS address verification failed".to_string());
        }
    }

    if tx.address_match == Some(false) {
        score += 20;
        rules.push("Billing and shipping address mismatch".to_string());
    }

    if tx.ip_is_vpn == Some(true) {
        score += 30;
        rules.push("VPN or proxy detected".to_string());
    }

    if tx.card_present == Some(false) {
        if let Some(ref mode) = tx.entry_mode {
            if mode.to_lowercase().contains("key") {
                score += 20;
                rules.push("Card not present + manually keyed entry".to_string());
            }
        }
    }

    if let Some(ref refund) = tx.refund_status {
        if refund.to_lowercase().contains("requested") || refund.to_lowercase().contains("completed") {
            score += 15;
            rules.push(format!("Refund status: {}", refund));
        }
    }

    if let Some(amt) = tx.amount {
        if amt > 5000.0 {
            score += 15;
            rules.push(format!("High transaction amount: ${:.2}", amt));
        }
    }

    (score, rules)
}

pub async fn scan(Json(_payload): Json<ScanRequest>) -> Json<ScanResponse> {
    // TODO: replace with real DB query once Backend 1 hands over AppState
    let mock_transactions: Vec<StubTransaction> = vec![];

    let total_scanned = mock_transactions.len();
    let mut results: Vec<FraudResult> = Vec::new();

    for tx in mock_transactions {
        let (risk_score, triggered_rules) = score_transaction(&tx);
        if risk_score == 0 {
            continue;
        }

        let risk_level = match risk_score {
            s if s >= 60 => "HIGH",
            s if s >= 30 => "MEDIUM",
            _ => "LOW",
        }
        .to_string();

        // TODO: wire in Gemini once AI Person 2 builds services/gemini.rs
        let ai_explanation: Option<String> = None;

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
