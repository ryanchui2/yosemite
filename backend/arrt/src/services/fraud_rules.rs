use crate::models::fraud::Transaction;

pub fn score(tx: &Transaction) -> (u32, Vec<String>) {
    let mut score: u32 = 0;
    let mut rules: Vec<String> = Vec::new();

    // --- Round Amount (structuring / laundering signal) ---
    if let Some(amt) = tx.amount {
    let cents = (amt * 100.0).round() as u64;
    if cents % 100 == 0 && amt >= 1000.0 {
        score += 15;
        rules.push(format!("Suspiciously round amount: ${:.0}", amt));
    }
}

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

    // --- High-risk origin country (potential bias?) ---
    const HIGH_RISK_COUNTRIES: &[&str] = &["NG", "RU", "CN", "KP", "IR", "VE"];
    if let Some(ref country) = tx.ip_country {
        if HIGH_RISK_COUNTRIES.contains(&country.to_uppercase().as_str()) {
            score += 20;
            rules.push(format!("Transaction from high-risk country: {}", country));
        }
    }

    if tx.ip_is_vpn == Some(true) {
    if let Some(ref device) = tx.device_type {
        if device.to_lowercase().contains("mobile") {
            score += 15;
            rules.push("Mobile device with VPN active".to_string());
        }
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

#[cfg(test)]
mod tests {
    use super::{risk_level, score};
    use crate::models::fraud::Transaction;

    fn tx(overrides: impl FnOnce(&mut Transaction)) -> Transaction {
        let mut t = Transaction {
            transaction_id: "tx-1".to_string(),
            customer_name: None,
            amount: None,
            cvv_match: None,
            avs_result: None,
            address_match: None,
            ip_is_vpn: None,
            ip_country: None,
            card_present: None,
            entry_mode: None,
            refund_status: None,
        };
        overrides(&mut t);
        t
    }

    #[test]
    fn score_empty_tx_is_zero() {
        let t = tx(|_| {});
        let (s, rules) = score(&t);
        assert_eq!(s, 0);
        assert!(rules.is_empty());
    }

    #[test]
    fn score_cvv_mismatch_adds_35() {
        let t = tx(|t| t.cvv_match = Some(false));
        let (s, rules) = score(&t);
        assert_eq!(s, 35);
        assert!(rules.contains(&"CVV mismatch".to_string()));
    }

    #[test]
    fn score_avs_no_match_adds_25() {
        let t = tx(|t| t.avs_result = Some("no match".to_string()));
        let (s, rules) = score(&t);
        assert_eq!(s, 25);
        assert!(rules.contains(&"AVS address verification failed".to_string()));
    }

    #[test]
    fn score_avs_n_adds_25() {
        let t = tx(|t| t.avs_result = Some("N".to_string()));
        let (s, _) = score(&t);
        assert_eq!(s, 25);
    }

    #[test]
    fn score_address_mismatch_adds_20() {
        let t = tx(|t| t.address_match = Some(false));
        let (s, rules) = score(&t);
        assert_eq!(s, 20);
        assert!(rules.contains(&"Billing and shipping address mismatch".to_string()));
    }

    #[test]
    fn score_vpn_adds_30() {
        let t = tx(|t| t.ip_is_vpn = Some(true));
        let (s, rules) = score(&t);
        assert_eq!(s, 30);
        assert!(rules.contains(&"VPN or proxy detected".to_string()));
    }

    #[test]
    fn score_card_not_present_keyed_adds_20() {
        let t = tx(|t| {
            t.card_present = Some(false);
            t.entry_mode = Some("keyed".to_string());
        });
        let (s, rules) = score(&t);
        assert_eq!(s, 20);
        assert!(rules.contains(&"Card not present + manually keyed entry".to_string()));
    }

    #[test]
    fn score_refund_requested_adds_15() {
        let t = tx(|t| t.refund_status = Some("refund requested".to_string()));
        let (s, rules) = score(&t);
        assert_eq!(s, 15);
        assert!(rules.iter().any(|r| r.contains("Refund status")));
    }

    #[test]
    fn score_high_amount_adds_15() {
        let t = tx(|t| t.amount = Some(5001.0));
        let (s, rules) = score(&t);
        assert_eq!(s, 15);
        assert!(rules.iter().any(|r| r.contains("5001.00")));
    }

    #[test]
    fn score_5000_not_high_amount() {
        let t = tx(|t| t.amount = Some(5000.0));
        let (s, _) = score(&t);
        assert_eq!(s, 0);
    }

    #[test]
    fn score_combined_above_60() {
        let t = tx(|t| {
            t.cvv_match = Some(false);  // 35
            t.avs_result = Some("n".to_string()); // 25
            t.address_match = Some(false); // 20
        });
        let (s, rules) = score(&t);
        assert_eq!(s, 80);
        assert_eq!(rules.len(), 3);
    }

    #[test]
    fn risk_level_high() {
        assert_eq!(risk_level(60), "HIGH");
        assert_eq!(risk_level(100), "HIGH");
    }

    #[test]
    fn risk_level_medium() {
        assert_eq!(risk_level(30), "MEDIUM");
        assert_eq!(risk_level(59), "MEDIUM");
    }

    #[test]
    fn risk_level_low() {
        assert_eq!(risk_level(0), "LOW");
        assert_eq!(risk_level(29), "LOW");
    }
}
