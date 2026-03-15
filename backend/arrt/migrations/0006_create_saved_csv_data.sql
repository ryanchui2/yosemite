-- Store CSV upload snapshots: before scan (raw upload) and after scan (with results metadata)
CREATE TABLE IF NOT EXISTS saved_csv_data (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT,
    stage        TEXT NOT NULL CHECK (stage IN ('before_scan', 'after_scan')),
    file_name    TEXT,
    headers      JSONB NOT NULL DEFAULT '[]',
    rows         JSONB NOT NULL DEFAULT '[]',
    scan_id      TEXT,
    scan_summary JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_csv_data_stage ON saved_csv_data (stage);
CREATE INDEX IF NOT EXISTS idx_saved_csv_data_created_at ON saved_csv_data (created_at DESC);
