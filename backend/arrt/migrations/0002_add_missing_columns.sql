-- Add columns missing from the initial migration to match the Transaction model
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS order_id           TEXT,
    ADD COLUMN IF NOT EXISTS customer_id        TEXT,
    ADD COLUMN IF NOT EXISTS timestamp          TEXT,
    ADD COLUMN IF NOT EXISTS currency           TEXT,
    ADD COLUMN IF NOT EXISTS payment_method     TEXT,
    ADD COLUMN IF NOT EXISTS card_last4         TEXT,
    ADD COLUMN IF NOT EXISTS card_brand         TEXT,
    ADD COLUMN IF NOT EXISTS transaction_status TEXT,
    ADD COLUMN IF NOT EXISTS merchant_id        TEXT,
    ADD COLUMN IF NOT EXISTS store_id           TEXT,
    ADD COLUMN IF NOT EXISTS ip_address         TEXT,
    ADD COLUMN IF NOT EXISTS ip_country         TEXT,
    ADD COLUMN IF NOT EXISTS device_type        TEXT,
    ADD COLUMN IF NOT EXISTS amount_subtotal    FLOAT8,
    ADD COLUMN IF NOT EXISTS tax                FLOAT8,
    ADD COLUMN IF NOT EXISTS discount_applied   FLOAT8;
