// Test file for AI2 features - tests the fraud rules engine
use arrt_backend::services::fraud_rules;
use arrt_backend::models::fraud::Transaction;

#[tokio::test]
async fn test_fraud_scoring() {
    let tx = Transaction {
        transaction_id: "TXN-001".to_string(),
        customer_name: Some("John Doe".to_string()),
        amount: Some(12000.0),
        cvv_match: Some(false),
        avs_result: Some("N".to_string()),
        address_match: Some(false),
        ip_is_vpn: Some(true),
        ip_country: None,
        device_type: None,
        card_present: Some(false),
        entry_mode: Some("keyed".to_string()),
        refund_status: None,
    };

    let (score, rules) = fraud_rules::score(&tx);

    println!("Score: {}", score);
    println!("Rules triggered: {:?}", rules);

    // Score should be:
    // CVV mismatch: +35
    // AVS no match: +25
    // Address mismatch: +20
    // VPN detected: +30
    // Card not present + keyed: +20
    // High amount (>5000): +15
    // Total: 145
    assert!(score >= 145, "Expected score >= 145, got {}", score);
    assert!(rules.contains(&"CVV mismatch".to_string()));
    assert!(rules.contains(&"VPN or proxy detected".to_string()));
}

#[test]
fn test_risk_level() {
    assert_eq!(fraud_rules::risk_level(0), "LOW");
    assert_eq!(fraud_rules::risk_level(30), "MEDIUM");
    assert_eq!(fraud_rules::risk_level(60), "HIGH");
    assert_eq!(fraud_rules::risk_level(85), "HIGH");
}

#[test]
fn test_risk_level_boundaries() {
    assert_eq!(fraud_rules::risk_level(29), "LOW");
    assert_eq!(fraud_rules::risk_level(59), "MEDIUM");
}

