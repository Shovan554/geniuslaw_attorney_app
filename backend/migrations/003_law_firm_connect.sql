-- 003_law_firm_connect.sql
-- Stripe Connect (firm payouts) columns on law_firms (shared Supabase DB).
-- connect_account_id  : the Express account id (acct_...), written at creation,
--                       even while onboarding is incomplete. Resume handle so a
--                       retry reuses the same account instead of duplicating it.
-- destination_connect_id : written ONLY once Stripe reports payouts_enabled.
--                       This is what Pronto payment routing reads; its presence
--                       means the firm is genuinely payout-ready.
ALTER TABLE law_firms
    ADD COLUMN IF NOT EXISTS connect_account_id     text,
    ADD COLUMN IF NOT EXISTS destination_connect_id text;
