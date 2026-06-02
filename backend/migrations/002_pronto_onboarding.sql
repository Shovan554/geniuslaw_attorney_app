-- 002_pronto_onboarding.sql
-- Pronto onboarding columns on attorneys (shared Supabase DB).
-- KYC (Stripe Identity) result + Pronto platform-fee terms acceptance.
-- No charges anywhere; pronto_enabled is still flipped manually by staff.
ALTER TABLE attorneys
    ADD COLUMN IF NOT EXISTS kyc_verified             boolean   NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS kyc_session_id           text,
    ADD COLUMN IF NOT EXISTS pronto_terms_accepted    boolean   NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS pronto_terms_accepted_at timestamp;
