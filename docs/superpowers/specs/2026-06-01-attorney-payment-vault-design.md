# Attorney Payment Vault — Design

**Date:** 2026-06-01
**Repo:** `Geniuslaw_Attorney_App` (backend + mobile)
**Status:** Approved for planning

## Goal

Let an attorney save a payment card from the profile section of the attorney
app. The card is stored on a Stripe Customer; **no charge is ever made**. We
persist the Stripe `customer_id` plus the card's `brand` and `last4` on the
`attorneys` row so the profile can display "Card on file •••• 4242" without a
Stripe round-trip.

Out of scope (explicitly): charging the card, subscriptions, off-session
payments, multiple saved cards, Apple/Google Pay wallet entry.

## Context

- The attorney app and Pronto share the same Supabase database, so the
  `attorneys` table is shared. The new columns are added once.
- The attorney app currently has **zero** Stripe integration (greenfield).
  Stripe env vars (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, etc.) have
  already been added to the attorney app backend.
- Pronto's `backend/services/stripe_service.py` (Customer + PaymentSheet
  pattern) is the template to mirror, trimmed to setup-only.
- The Stripe Customer created here lives in whatever Stripe account the
  attorney-app keys belong to. It is independent of Pronto's
  `clients.customer_id`; no conflict.

## Approach

**SetupIntent + PaymentSheet in setup mode.** The Stripe React Native SDK
renders the card form (PCI handled by Stripe). Backend creates the Customer +
SetupIntent + EphemeralKey; mobile presents the sheet; the card is attached to
the Customer. `customer_id` is persisted server-side *before* the sheet opens,
so saving the id is guaranteed even if the attorney abandons card entry.

Rejected alternatives: inline `CardField` form (more code, more PCI surface);
Stripe-hosted browser page (breaks in-app UX standard).

## Components

### 1. Database (shared Supabase)
Add to `attorneys`:
- `customer_id text` (nullable)
- `card_brand text` (nullable)
- `card_last4 text` (nullable)

Delivered as a SQL migration file checked into the attorney app backend (no
existing migrations dir — create `backend/migrations/`).

### 2. Backend — `backend/services/stripe_service.py` (new)
Mirrors Pronto, setup-only:
- `_configure()` / `get_publishable_key()` — read env.
- `get_or_create_attorney_customer(attorney_row) -> str` — return
  `attorneys.customer_id`; if blank, create a Stripe Customer (email/name +
  `metadata.attorney_id`), persist it to `attorneys`, return the id.
- `create_setup_bundle(attorney_row) -> dict` — `get_or_create_attorney_customer`,
  then create an EphemeralKey and a SetupIntent for that customer. Returns
  `{ setup_intent_client_secret, ephemeral_key, customer_id, publishable_key }`.
- `sync_saved_card(attorney_row) -> dict | None` — list the customer's card
  payment methods, take the most recent, persist `card_brand` + `card_last4`
  to `attorneys`, return `{ brand, last4 }` (or `None` if no card).

### 3. Backend — endpoints (added to existing `routers/attorneys.py`)
Behind the existing Bearer-auth middleware (resolves the current attorney):
- `POST /attorneys/me/vault/setup` → `create_setup_bundle` for the current
  attorney.
- `GET /attorneys/me/vault/card` → `sync_saved_card` → `{ brand, last4 } | null`.

Already registered via `attorneys_router` in `main.py`.

### 4. Mobile — `mobile/lib/vault.ts` (new)
Uses the existing `apiFetch` Bearer helper:
- `createSetupBundle()` → calls `POST /attorneys/me/vault/setup`.
- `getSavedCard()` → calls `GET /attorneys/me/vault/card`.

### 5. Mobile — `mobile/app/(auth)/profile/vault.tsx` (new route)
- On load: `getSavedCard()`. If a card exists, show "Card on file •••• {last4}"
  with brand. Else show an **Add Card** button.
- Add/Replace flow: `createSetupBundle()` → `initPaymentSheet({
  setupIntentClientSecret, customerId, customerEphemeralKeySecret })` →
  `presentPaymentSheet()`. On success, call `getSavedCard()` to refresh the
  displayed card (this also syncs `card_brand`/`card_last4` to the DB).
- Themed dark UI. **No native `Alert.alert`** — use themed inline/modal status
  (per attorney-app convention). Matches the `Card`/`Ionicons` style used by
  the existing Edit Profile / Change Password rows.

### 6. Mobile — profile entry point (`profile/index.tsx`)
Add a `Card` action row "Payment Vault" (wallet icon) next to Edit Profile /
Change Password → `router.push('/(auth)/profile/vault')`.

### 7. Mobile — native dependency
- Add `@stripe/stripe-react-native`.
- Wrap the app (or the auth subtree) in `<StripeProvider publishableKey=...>`,
  reading the publishable key from `EXPO_PUBLIC_*` config or the
  `/vault/setup` bundle.
- **Requires a fresh dev/EAS build** — native module, not usable in Expo Go or
  a JS-only reload. Accepted.

## Data flow

1. Attorney opens Profile → taps Payment Vault.
2. Vault screen calls `GET /vault/card` → shows existing card or Add button.
3. Tap Add → `POST /vault/setup` (creates Customer + persists `customer_id` on
   first call) → returns bundle.
4. `presentPaymentSheet()` → attorney enters card → Stripe attaches it to the
   Customer.
5. On success → `GET /vault/card` syncs `card_brand`/`card_last4` to
   `attorneys` and the screen shows "•••• {last4}".

## Error handling

- Missing Stripe env → backend raises clear `RuntimeError` (mirrors Pronto's
  `_require`).
- Attorney cancels the sheet → no error surfaced; `customer_id` already saved,
  card simply not added.
- `sync_saved_card` with no card → returns `null`, screen shows Add button.
- All mobile errors shown via themed UI, never native alerts.

## Testing

- Backend: unit-test `get_or_create_attorney_customer` (creates once, reuses
  thereafter) and `sync_saved_card` (persists brand/last4) with Stripe mocked.
- Manual: fresh build → add a Stripe test card (4242…) → confirm
  `attorneys.customer_id`, `card_brand`, `card_last4` populated and the profile
  shows "•••• 4242".
