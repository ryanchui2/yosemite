-- Create transactions table for fraud scanning
CREATE TABLE IF NOT EXISTS transactions (
    transaction_id  TEXT        PRIMARY KEY,
    customer_name   TEXT,
    amount          FLOAT8,
    cvv_match       BOOLEAN,
    avs_result      TEXT,
    address_match   BOOLEAN,
    ip_is_vpn       BOOLEAN,
    card_present    BOOLEAN,
    entry_mode      TEXT,
    refund_status   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed a handful of sample rows for testing
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
