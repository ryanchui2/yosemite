-- Consolidated schema (reset): transactions, fraud_reports, saved_csv_data, saved_entity_data, fraud_scan_cache

-- Transactions
CREATE TABLE IF NOT EXISTS transactions (
    transaction_id     TEXT        PRIMARY KEY,
    customer_name       TEXT,
    amount              FLOAT8,
    cvv_match           BOOLEAN,
    avs_result          TEXT,
    address_match       BOOLEAN,
    ip_is_vpn           BOOLEAN,
    card_present        BOOLEAN,
    entry_mode          TEXT,
    refund_status       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    order_id            TEXT,
    customer_id         TEXT,
    timestamp           TEXT,
    currency            TEXT,
    payment_method      TEXT,
    card_last4          TEXT,
    card_brand          TEXT,
    transaction_status  TEXT,
    merchant_id         TEXT,
    store_id            TEXT,
    ip_address          TEXT,
    ip_country          TEXT,
    device_type         TEXT,
    amount_subtotal     FLOAT8,
    tax                 FLOAT8,
    discount_applied    FLOAT8
);

INSERT INTO transactions (transaction_id, customer_name, amount, cvv_match, avs_result, address_match, ip_is_vpn, card_present, entry_mode, refund_status)
VALUES
    ('TXN-001', 'Alice Johnson',   1200.00, true,  'match',    true,  false, true,  'swipe',   NULL),
    ('TXN-002', 'Bob Martinez',    8750.50, false, 'no match', false, true,  false, 'keyed',   'requested'),
    ('TXN-003', 'Carol Williams',   320.00, true,  'match',    true,  false, true,  'chip',    NULL),
    ('TXN-004', 'David Lee',       5200.00, false, 'N',        false, true,  false, 'keyed',   NULL),
    ('TXN-005', 'Eve Thompson',     950.00, true,  'match',    true,  false, true,  'swipe',   NULL),
    ('TXN-006', 'Frank Davis',    12000.00, false, 'no match', false, true,  false, 'keyed',   'completed'),
    ('TXN-007', 'Grace Kim',        450.00, true,  'match',    true,  false, true,  'chip',    NULL),
    ('TXN-008', 'Hank Wilson',     3100.00, true,  'match',    false, false, true,  'swipe',   NULL)
ON CONFLICT (transaction_id) DO NOTHING;

-- Demo narrative seed: GlobalTex + Acme + Nordic
INSERT INTO transactions (
    transaction_id, customer_name, amount, cvv_match, avs_result, address_match,
    ip_is_vpn, card_present, entry_mode, refund_status,
    ip_country, device_type, timestamp, currency, payment_method,
    card_brand, card_last4, customer_id, order_id, transaction_status
)
VALUES
    ('TXN-D001', 'GlobalTex Imports Ltd', 12500.00, false, 'no match', false, true, false, 'keyed', NULL, 'IR', 'desktop', '2026-03-01T10:23:00Z', 'USD', 'card', 'Visa', '4821', 'CUST-GTX-01', 'ORD-D001', 'completed'),
    ('TXN-D002', 'GlobalTex Imports Ltd', 9800.00, false, 'match', true, true, false, 'keyed', NULL, 'IR', 'mobile', '2026-03-05T14:11:00Z', 'USD', 'card', 'Mastercard', '9134', 'CUST-GTX-01', 'ORD-D002', 'completed'),
    ('TXN-D003', 'GlobalTex Imports Ltd', 15000.00, false, 'match', false, false, false, 'keyed', NULL, 'IR', 'desktop', '2026-03-08T09:45:00Z', 'USD', 'card', 'Visa', '4821', 'CUST-GTX-01', 'ORD-D003', 'completed'),
    ('TXN-D004', 'GlobalTex Imports Ltd', 11200.00, true, 'match', true, true, false, 'keyed', NULL, 'IR', 'desktop', '2026-03-12T16:30:00Z', 'USD', 'card', 'Visa', '4821', 'CUST-GTX-01', 'ORD-D004', 'completed'),
    ('TXN-D005', 'Acme Office Supplies', 320.00, true, 'match', true, false, true, 'chip', NULL, 'US', 'desktop', '2026-03-02T11:00:00Z', 'USD', 'card', 'Visa', '1122', 'CUST-AOS-01', 'ORD-D005', 'completed'),
    ('TXN-D006', 'Nordic Consulting Group', 1800.00, true, 'match', true, false, true, 'swipe', NULL, 'DE', 'desktop', '2026-03-07T13:00:00Z', 'USD', 'bank_transfer', NULL, NULL, 'CUST-NCG-01', 'ORD-D006', 'completed')
ON CONFLICT (transaction_id) DO NOTHING;

-- Fraud reports
CREATE TABLE IF NOT EXISTS fraud_reports (
    id              SERIAL PRIMARY KEY,
    transaction_id  TEXT        NOT NULL,
    confirmed_fraud BOOLEAN     NOT NULL,
    reported_by     TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    ai_reviewed     BOOLEAN DEFAULT FALSE,
    ai_review_notes TEXT
);

-- Saved CSV data
CREATE TABLE IF NOT EXISTS saved_csv_data (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT,
    stage        TEXT NOT NULL CHECK (stage IN ('before_scan', 'after_scan')),
    file_name    TEXT,
    headers      JSONB NOT NULL DEFAULT '[]',
    rows         JSONB NOT NULL DEFAULT '[]',
    scan_id      TEXT,
    scan_summary JSONB,
    scan_results JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_saved_csv_data_stage ON saved_csv_data (stage);
CREATE INDEX IF NOT EXISTS idx_saved_csv_data_created_at ON saved_csv_data (created_at DESC);

-- Saved entity data
CREATE TABLE IF NOT EXISTS saved_entity_data (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT,
    entities          JSONB NOT NULL DEFAULT '[]',
    sanctions_results  JSONB,
    geo_results       JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_saved_entity_data_created_at ON saved_entity_data (created_at DESC);

-- Single-row fraud scan cache
CREATE TABLE IF NOT EXISTS fraud_scan_cache (
    id INTEGER PRIMARY KEY DEFAULT 1,
    scan_response JSONB,
    summary_response JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = 1)
);
INSERT INTO fraud_scan_cache (id, scan_response, summary_response, updated_at)
VALUES (1, NULL, NULL, NOW())
ON CONFLICT (id) DO NOTHING;
