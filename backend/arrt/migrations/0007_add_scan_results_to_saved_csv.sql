-- Store full anomaly scan results (per-row) for saved after_scan reports
ALTER TABLE saved_csv_data
    ADD COLUMN IF NOT EXISTS scan_results JSONB;
