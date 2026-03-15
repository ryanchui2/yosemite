-- Saved entity lists for Geo & Sanctions: entities (description, country) + optional scan results
CREATE TABLE IF NOT EXISTS saved_entity_data (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name              TEXT,
    entities          JSONB NOT NULL DEFAULT '[]',
    sanctions_results  JSONB,
    geo_results       JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_entity_data_created_at ON saved_entity_data (created_at DESC);
