-- 001_attorney_vault.sql
-- Stripe vault columns on attorneys (shared Supabase DB).
-- Stores a Stripe Customer id + the saved card's brand/last4. No charges.
ALTER TABLE attorneys
    ADD COLUMN IF NOT EXISTS customer_id text,
    ADD COLUMN IF NOT EXISTS card_brand  text,
    ADD COLUMN IF NOT EXISTS card_last4  text;
