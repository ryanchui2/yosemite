ALTER TABLE fraud_reports ADD COLUMN user_id UUID REFERENCES users(id);
ALTER TABLE saved_csv_data ADD COLUMN user_id UUID REFERENCES users(id);
ALTER TABLE saved_entity_data ADD COLUMN user_id UUID REFERENCES users(id);
