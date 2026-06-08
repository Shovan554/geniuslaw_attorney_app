# Stripe Connect Payouts Onboarding — Design

**Date:** 2026-06-08
**Status:** Approved design, pending implementation plan

## Problem

When clients pay through the Pronto app, the payment is routed to the attorney's
law firm's Stripe Connect account via `law_firms.destination_connect_id`. Today
that column does not exist and the backend has no Stripe Connect capability — so
any attorney whose firm has no `destination_connect_id` cannot receive money.

We need to let attorneys set up their firm's Stripe Connect (payouts) account
during Pronto onboarding, right after they select practice areas. Onboarding is
**firm-level**: the Connect account belongs to the law firm, and any attorney in
that firm can set it up (first-come — there is no firm-admin concept yet). Once a
firm has a ready account, every other attorney in that firm inherits it.

## Goals

- Attorneys onboard their firm's Stripe Connect (Express) account from inside the
  app, with no paperwork we manage — Stripe hosts the bank/identity collection.
- `law_firms.destination_connect_id` is populated **only when the account can
  actually receive payouts**, so the "is it set?" check is always truthful.
- Do not modify or risk the existing Stripe integrations (card vault, KYC). They
  run on the same Stripe platform account / `STRIPE_SECRET_KEY`.

## Non-Goals

- **Routing client payments** to the connect id (destination charges / transfers)
  — that lives on the client/Pronto-payment side, not this repo. This spec only
  makes firms *payout-ready*.
- Webhook-based readiness detection (deferred; see Approach below).
- A firm-admin / permissions concept.

## Background — current state

- Backend talks to Stripe only for: card vault (`stripe_service.py` — Customer +
  SetupIntent, never charges) and KYC (`kyc_service.py` — Stripe Identity). Both
  use `stripe.api_key = STRIPE_SECRET_KEY`.
- No Connect code exists: no `Account.create`, no `AccountLink`, no transfers, no
  webhooks.
- `law_firms` has only `id` and `name` referenced in code; no
  `destination_connect_id` column.
- `attorneys.firm_id` → `law_firms.id`.
- Pronto onboarding flow (mobile-driven, linear):
  `KYC → Card vault → Terms → Practice areas → (waiting for staff)`.
  Staff manually flip `pronto_enabled` in the DB.

## Chosen approach

**Express accounts + hosted Account Link, readiness via poll-on-return.**

- Stripe **Express** account type: Stripe hosts the bank/SSN/identity onboarding
  pages. We never collect or store that data.
- The attorney opens a one-time hosted **Account Link** URL, completes Stripe's
  pages, and is redirected back into the app.
- Readiness is detected by **poll-on-return**: when the app reopens after the
  link, it calls the backend, which does `stripe.Account.retrieve(...)` and checks
  `payouts_enabled`. (A webhook is more robust but needs public webhook infra we
  don't have; deferred. Onboarding happens in-app and the user returns
  immediately, so poll-on-return is sufficient for v1.)

## Data model

Two new columns on `law_firms`. The distinction makes the "if it exists, you're
good" rule literally true:

- **`connect_account_id`** (text, nullable) — the `acct_xxx`, written **at account
  creation**, even if onboarding is incomplete. The *resume handle*: a retry
  reuses this instead of creating a duplicate account.
- **`destination_connect_id`** (text, nullable) — written **only when Stripe
  confirms `payouts_enabled = true`**. What payment routing reads; its presence
  *is* the "ready" signal. No extra boolean needed.

## Backend

New module `connect_service.py`, separate from `stripe_service.py` and
`kyc_service.py`, reusing the same `stripe.api_key` init. **No edits to existing
vault/KYC logic.**

### `POST /attorneys/me/connect/start`

1. Load the attorney's firm (`firm_id` → `law_firms` row).
2. If `destination_connect_id` is already set → return `{ status: "ready" }`
   (the "already set up for your firm" case; no link needed).
3. Else reuse `connect_account_id` if present, otherwise
   `stripe.Account.create(type="express", ...)` and persist the new id to
   `law_firms.connect_account_id`.
4. `stripe.AccountLink.create(account=..., type="account_onboarding",
   refresh_url=..., return_url=...)` and return `{ status: "pending", url }`.

### `POST /attorneys/me/connect/refresh`

Called when the app reopens after the Account Link.

1. Load the firm. If no `connect_account_id` → return `{ status: "none" }`.
2. `stripe.Account.retrieve(connect_account_id)`.
3. If `payouts_enabled` → write `destination_connect_id = connect_account_id` on
   the firm; return `{ status: "ready" }`.
4. Else return `{ status: "pending" }`.

### Onboarding status

Add `connect_ready: bool` to the onboarding status model, derived from the firm's
`destination_connect_id IS NOT NULL`.

## Mobile

A new onboarding step **after practice areas save**. On entry, read
`connect_ready`:

- **Ready** → "Stripe payouts are already set up for your firm — you're good to
  go." → continue to the waiting-for-staff screen.
- **Not ready** → "Set up payouts" button → `POST /connect/start` → open the
  returned URL in the in-app browser → on return, `POST /connect/refresh`:
  - `ready` → continue to waiting screen.
  - `pending` → "Looks like that didn't finish — try again." (re-runs `/start`).

Return/refresh URLs use the app's existing deep-link scheme (resolved during
implementation).

## Error handling & edge cases

- **Abandoned onboarding** → `connect_account_id` persists; retry resumes the same
  account (no duplicates).
- **Expired link** → `/connect/start` generates a fresh one.
- **Two attorneys, same firm, racing** → both reference the same firm account;
  whoever first reaches `payouts_enabled` writes `destination_connect_id`; the
  other then sees "already set."
- **Stripe API error** → friendly message, retry allowed.

## Testing

- Stripe **test keys** + fake test data (SSN `000-00-0000`, routing `110000000`,
  account `000123456789`, OTP `000000`, or the test-mode skip shortcut).
- Verify `payouts_enabled` flips and `destination_connect_id` is written.
- Verify a second attorney in the same firm sees "already set."
- Confirm existing live vault/KYC are untouched (test/live isolation in Stripe
  guarantees no impact on the live integration).

## Out of scope / future

- Webhook-based readiness (`account.updated`) for robustness.
- Destination charges / transfers that route client payments to the connect id
  (client/Pronto-payment side).
- Firm-admin permissions for who may onboard.
