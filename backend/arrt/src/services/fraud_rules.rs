// Stub transaction — replaced with models::transaction::Transaction once Backend 1 is done.
// When swapping: delete this struct, change the import in routes/fraud.rs, nothing else changes.
pub struct Transaction {
    pub transaction_id: String,
    pub customer_name: Option<String>,
    pub amount: Option<f64>,
    pub cvv_match: Option<bool>,
    pub avs_result: Option<String>,
    pub address_match: Option<bool>,
    pub ip_is_vpn: Option<bool>,
    pub card_present: Option<bool>,
    pub entry_mode: Option<String>,
    pub refund_status: Option<String>,
}

pub fn score(tx: &Transaction) -> (u32, Vec<String>) {
    let mut score: u32 = 0;
    let mut rules: Vec<String> = Vec::new();

    // --- Identity / Card Verification ---
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

    // --- Network / Device ---
    if tx.ip_is_vpn == Some(true) {
        score += 30;
        rules.push("VPN or proxy detected".to_string());
    }

    // --- Card Present / Entry Mode ---
    if tx.card_present == Some(false) {
        if let Some(ref mode) = tx.entry_mode {
            if mode.to_lowercase().contains("key") {
                score += 20;
                rules.push("Card not present + manually keyed entry".to_string());
            }
        }
    }

    // --- Return Fraud ---
    if let Some(ref refund) = tx.refund_status {
        if refund.to_lowercase().contains("requested")
            || refund.to_lowercase().contains("completed")
        {
            score += 15;
            rules.push(format!("Refund status: {}", refund));
        }
    }

    // --- High Amount Threshold ---
    if let Some(amt) = tx.amount {
        if amt > 5000.0 {
            score += 15;
            rules.push(format!("High transaction amount: ${:.2}", amt));
        }
    }

    (score, rules)
}

pub fn risk_level(score: u32) -> &'static str {
    match score {
        s if s >= 60 => "HIGH",
        s if s >= 30 => "MEDIUM",
        _ => "LOW",
    }
}
