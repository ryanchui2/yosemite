-- Add AI review columns to fraud_reports for pipeline deep-review tracking
ALTER TABLE fraud_reports
    ADD COLUMN IF NOT EXISTS ai_reviewed      BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS ai_review_notes  TEXT;
