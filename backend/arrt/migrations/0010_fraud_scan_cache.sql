-- Single-row cache for fraud scan and report summary so refresh returns cached results.
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
