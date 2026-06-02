# Pronto Attorney Onboarding — Design

**Date:** 2026-06-02
**Repo:** `Geniuslaw_Attorney_App` (backend + mobile)
**Status:** Approved design, ready for implementation plan

## Problem

Attorneys whose `attorneys.pronto_enabled = false` currently see a static "Not enrolled —
reach out to GeniusLaw" card on the Pronto screen
(`mobile/app/(auth)/pronto.tsx`). There is no self-serve path to become eligible. We want a
guided onboarding that collects the prerequisites for Pronto access — identity verification, a
payment method on file, and acceptance of the platform-fee terms — after which a staff member
manually enables the attorney.

## Goals

- Self-serve, resumable onboarding gated on `pronto_enabled = false`.
- Three attorney-completed steps: **KYC (Stripe Identity)** → **Payment card (existing vault)** →
  **Terms acceptance ($39.95/month platform fee)**.
- A **Waiting** state after all three steps until staff manually flip `pronto_enabled = true`.
- Keep all new work inside `Geniuslaw_Attorney_App`; leave the Pronto repo untouched.

## Non-goals (YAGNI)

- No name/identity matching between Stripe's verified name and `attorneys.full_name` — pass/fail
  on Stripe's `verified` status only.
- No staff notification, email, or dashboard — staff handoff is **DB flag only**.
- No actual charging of the $39.95/month — acceptance is recorded, nothing is billed.
- No terms versioning.
- No Stripe webhook infrastructure in MVP (noted as optional hardening).
- No automatic flip of `pronto_enabled` — it stays 100% manual.

## Key decisions (from brainstorming)

1. **KYC provider:** Stripe Identity (document scan + live selfie / liveness).
2. **Name mismatch handling:** ignore — only Stripe's pass/fail `verified` status matters.
3. **Flow shape:** dedicated, resumable wizard screen (not an inline stepper).
4. **Ownership:** new endpoints + columns live in the `Geniuslaw_Attorney_App` backend, alongside
   the existing Stripe vault feature. The Pronto repo's availability endpoint is unchanged.
5. **Staff handoff:** DB flag only (no notification built).
6. **Mobile KYC capture:** native `@stripe/stripe-identity-react-native` sheet (best UX; requires a
   fresh EAS build — cannot ship over-the-air).

## Database — new columns on `attorneys`

```sql
ALTER TABLE public.attorneys
  ADD COLUMN kyc_verified             boolean   NOT NULL DEFAULT false,
  ADD COLUMN kyc_session_id           text      NULL,      -- Stripe VerificationSession id (vs_...)
  ADD COLUMN pronto_terms_accepted    boolean   NOT NULL DEFAULT false,
  ADD COLUMN pronto_terms_accepted_at timestamp NULL;      -- legal record of acceptance
```

Existing vault columns are reused: `customer_id`, `card_brand`, `card_last4`.
"Has card" is derived as `card_last4 IS NOT NULL`.

**Staff handoff query** (run manually, no automation):

```sql
SELECT id, full_name, email
FROM attorneys
WHERE kyc_verified
  AND card_last4 IS NOT NULL
  AND pronto_terms_accepted
  AND NOT pronto_enabled;
```

## Backend (FastAPI — `Geniuslaw_Attorney_App/backend`)

New routes in `routers/attorneys.py`; Stripe Identity logic in a new `services/kyc_service.py`;
onboarding-status computation in a small helper (pure, testable). Follows the existing
`stripe_service.py` / vault pattern, including `require_attorney_role` auth and `get_supabase()`
table access.

| Endpoint | Behavior |
|---|---|
| `GET /attorneys/me/onboarding` | Returns `{ pronto_enabled, kyc_verified, has_card, terms_accepted }`. Single source the wizard reads to compute its current step. |
| `POST /attorneys/me/kyc/session` | Creates a Stripe Identity `VerificationSession` (document + selfie/liveness) and an EphemeralKey for it; persists `kyc_session_id`. Returns `{ session_id, ephemeral_key_secret, publishable_key }`. |
| `POST /attorneys/me/kyc/refresh` | Retrieves the session from Stripe; if `status == "verified"`, sets `kyc_verified = true`. Pass/fail only, no name comparison. Called by the app when the native sheet closes. May return `processing` (Identity is async) — wizard then shows a "reviewing your ID" state and allows retry/refresh. |
| `POST /attorneys/me/pronto-terms/accept` | Guards that `kyc_verified` and `card_last4 IS NOT NULL`; if so, sets `pronto_terms_accepted = true` and `pronto_terms_accepted_at = now()`. Returns 409/422 if prerequisites unmet. |

### Onboarding step derivation (server returns flags; client computes step)

```
if pronto_enabled            -> ENROLLED (leave wizard, normal Pronto UI)
elif not kyc_verified        -> STEP 1: KYC
elif not has_card            -> STEP 2: PAYMENT
elif not terms_accepted      -> STEP 3: TERMS
else                         -> STEP 4: WAITING (all done, awaiting staff)
```

### Async-verification note

Stripe Identity sessions resolve asynchronously (`requires_input` → `processing` →
`verified` / `requires_input`). MVP polls via `/kyc/refresh` when the sheet closes. If still
`processing`, the wizard stays on Step 1 with a "we're reviewing your ID, check back shortly"
message and a refresh action. A Stripe webhook
(`identity.verification_session.verified`) updating `kyc_verified` is the robust long-term source
of truth and is recommended as a follow-up, but is out of scope for MVP.

## Mobile (Expo / React Native — `Geniuslaw_Attorney_App/mobile`)

### Dependency

- Add `@stripe/stripe-identity-react-native` and its config plugin.
- **Requires a fresh EAS dev + prod build** — native module, not OTA-shippable (same class of change
  as the existing `stripe-react-native` / Xcode 26 patch).

### New screen: `app/(auth)/pronto/onboarding.tsx`

Resumable wizard. On mount calls `GET /attorneys/me/onboarding` and jumps to the correct step:

- **Step 1 — KYC** (`!kyc_verified`): "Verify your identity." Button calls
  `POST /kyc/session`, opens the native Identity sheet with the returned `session_id` +
  `ephemeral_key_secret`. When the sheet closes, calls `POST /kyc/refresh` and re-reads status.
- **Step 2 — Payment** (`kyc_verified && !has_card`): "You're verified — add a payment method."
  Reuses the **existing vault PaymentSheet flow** (`POST /vault/setup` + `GET /vault/card`). No new
  card logic.
- **Step 3 — Terms** (`has_card && !terms_accepted`): agreement screen displaying the
  **$39.95/month platform fee**, with a scroll/checkbox gate and an **Agree** button calling
  `POST /pronto-terms/accept`. No payment is run — acceptance only.
- **Step 4 — Waiting** (all true, `!pronto_enabled`): "A staff member will give you access to
  Pronto shortly."

### `pronto.tsx` change

The existing "Not enrolled" card's copy/button becomes **"Get Pronto access"**, which
`router.push`-es to the onboarding wizard. The enrolled UI is unchanged.

### New API client: `lib/onboarding.ts`

Mirrors `lib/vault.ts`. Wraps `GET /onboarding`, `POST /kyc/session`, `POST /kyc/refresh`,
`POST /pronto-terms/accept`.

## Testing

- Backend: service-level tests for the onboarding-status flag computation and the terms-accept
  guard (rejects when KYC or card missing; succeeds and stamps timestamp when both present). Stripe
  Identity calls are mocked, following `backend/tests/test_stripe_service.py`.
- Mobile: manual walkthrough of the four wizard steps; no automated mobile tests.

## Affected files (anticipated)

**Backend**
- `backend/routers/attorneys.py` — 4 new routes
- `backend/services/kyc_service.py` — new (Stripe Identity)
- `backend/services/stripe_service.py` — possibly shared `_configure()` / publishable key helpers
- `backend/models/` — new pydantic models for onboarding status, KYC session bundle
- `backend/tests/test_kyc_service.py` (or extend existing) — new
- DB migration for the four new columns

**Mobile**
- `mobile/app/(auth)/pronto/onboarding.tsx` — new wizard
- `mobile/app/(auth)/pronto.tsx` — "Get Pronto access" button
- `mobile/lib/onboarding.ts` — new API client
- `package.json` / config plugin — `@stripe/stripe-identity-react-native`
