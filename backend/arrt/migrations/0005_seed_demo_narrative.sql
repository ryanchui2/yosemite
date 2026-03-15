-- Demo narrative seed: "GlobalTex Imports Ltd"
-- A single vendor that triggers HIGH fraud risk across all rules,
-- designed to cross-reference with sanctions screening and geo-risk demos.
--
-- Fraud score breakdown per transaction:
--   TXN-D001: CVV(35) + VPN(30) + IR country(20) + address mismatch(20) + AVS fail(25) + keyed(20) + round amt(15) + high amt(15) = 180
--   TXN-D002: CVV(35) + VPN(30) + IR country(20) + mobile+VPN(15) + high amt(15) = 115
--   TXN-D003: CVV(35) + IR country(20) + address mismatch(20) + round amt(15) + high amt(15) = 105
--   TXN-D004: VPN(30) + IR country(20) + keyed(20) + round amt(15) + high amt(15) = 100
--   TXN-D005/D006: clean — LOW risk for contrast

INSERT INTO transactions (
    transaction_id, customer_name, amount, cvv_match, avs_result, address_match,
    ip_is_vpn, card_present, entry_mode, refund_status,
    ip_country, device_type, timestamp, currency, payment_method,
    card_brand, card_last4, customer_id, order_id, transaction_status
)
VALUES
    (
        'TXN-D001', 'GlobalTex Imports Ltd', 12500.00,
        false, 'no match', false,
        true, false, 'keyed', NULL,
        'IR', 'desktop', '2026-03-01T10:23:00Z', 'USD', 'card',
        'Visa', '4821', 'CUST-GTX-01', 'ORD-D001', 'completed'
    ),
    (
        'TXN-D002', 'GlobalTex Imports Ltd', 9800.00,
        false, 'match', true,
        true, false, 'keyed', NULL,
        'IR', 'mobile', '2026-03-05T14:11:00Z', 'USD', 'card',
        'Mastercard', '9134', 'CUST-GTX-01', 'ORD-D002', 'completed'
    ),
    (
        'TXN-D003', 'GlobalTex Imports Ltd', 15000.00,
        false, 'match', false,
        false, false, 'keyed', NULL,
        'IR', 'desktop', '2026-03-08T09:45:00Z', 'USD', 'card',
        'Visa', '4821', 'CUST-GTX-01', 'ORD-D003', 'completed'
    ),
    (
        'TXN-D004', 'GlobalTex Imports Ltd', 11200.00,
        true, 'match', true,
        true, false, 'keyed', NULL,
        'IR', 'desktop', '2026-03-12T16:30:00Z', 'USD', 'card',
        'Visa', '4821', 'CUST-GTX-01', 'ORD-D004', 'completed'
    ),
    (
        'TXN-D005', 'Acme Office Supplies', 320.00,
        true, 'match', true,
        false, true, 'chip', NULL,
        'US', 'desktop', '2026-03-02T11:00:00Z', 'USD', 'card',
        'Visa', '1122', 'CUST-AOS-01', 'ORD-D005', 'completed'
    ),
    (
        'TXN-D006', 'Nordic Consulting Group', 1800.00,
        true, 'match', true,
        false, true, 'swipe', NULL,
        'DE', 'desktop', '2026-03-07T13:00:00Z', 'USD', 'bank_transfer',
        NULL, NULL, 'CUST-NCG-01', 'ORD-D006', 'completed'
    )
ON CONFLICT (transaction_id) DO NOTHING;
