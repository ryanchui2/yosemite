CREATE TABLE IF NOT EXISTS fraud_reports (
    id              SERIAL PRIMARY KEY,
    transaction_id  TEXT        NOT NULL,
    confirmed_fraud BOOLEAN     NOT NULL,
    reported_by     TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
