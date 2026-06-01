# Attorney Payment Vault Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an attorney save a payment card from the profile section; store the Stripe `customer_id` + card `brand`/`last4` on the `attorneys` row. No charges — SetupIntent only.

**Architecture:** Backend (FastAPI) creates a Stripe Customer + SetupIntent + EphemeralKey and persists `customer_id` immediately; the mobile app presents Stripe's PaymentSheet in setup mode to attach the card, then re-reads the saved card which syncs `brand`/`last4` to the DB. All in the `Geniuslaw_Attorney_App` repo against the shared Supabase DB.

**Tech Stack:** FastAPI, Supabase (supabase-py), Stripe Python SDK, pytest; React Native / Expo Router, `@stripe/stripe-react-native`.

**Spec:** `docs/superpowers/specs/2026-06-01-attorney-payment-vault-design.md`

---

## File Structure

- `backend/migrations/001_attorney_vault.sql` — **create** — adds `customer_id`, `card_brand`, `card_last4` to `attorneys`.
- `backend/requirements.txt` — **modify** — add `stripe`.
- `backend/services/stripe_service.py` — **create** — Customer / SetupIntent / saved-card logic (mirrors Pronto, setup-only).
- `backend/models/vault.py` — **create** — `VaultSetupBundle`, `VaultCard` pydantic models.
- `backend/routers/attorneys.py` — **modify** — add `POST /attorneys/me/vault/setup` and `GET /attorneys/me/vault/card`.
- `backend/tests/test_stripe_service.py` — **create** — unit tests with Stripe + Supabase mocked.
- `mobile/package.json` — **modify** — add `@stripe/stripe-react-native`.
- `mobile/.env` (and EAS env) — **modify** — add `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
- `mobile/app/_layout.tsx` — **modify** — wrap app in `<StripeProvider>`.
- `mobile/lib/vault.ts` — **create** — `createSetupBundle()`, `getSavedCard()`.
- `mobile/app/(auth)/profile/vault.tsx` — **create** — Vault screen (show card or add).
- `mobile/app/(auth)/profile/index.tsx` — **modify** — add "Payment Vault" action row.

---

## Task 1: Database migration (shared Supabase)

**Files:**
- Create: `backend/migrations/001_attorney_vault.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 001_attorney_vault.sql
-- Stripe vault columns on attorneys (shared Supabase DB).
-- Stores a Stripe Customer id + the saved card's brand/last4. No charges.
ALTER TABLE attorneys
    ADD COLUMN IF NOT EXISTS customer_id text,
    ADD COLUMN IF NOT EXISTS card_brand  text,
    ADD COLUMN IF NOT EXISTS card_last4  text;
```

- [ ] **Step 2: Run it against Supabase**

Run the SQL in the Supabase SQL editor (or psql) for the shared project.

- [ ] **Step 3: Verify the columns exist**

Run in Supabase SQL editor:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'attorneys'
  AND column_name IN ('customer_id', 'card_brand', 'card_last4');
```
Expected: 3 rows returned.

- [ ] **Step 4: Commit**

```bash
git add backend/migrations/001_attorney_vault.sql
git commit -m "feat(db): add stripe vault columns to attorneys"
```

---

## Task 2: Backend dependencies (Stripe + pytest)

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Add Stripe to requirements.txt**

Append this line to `backend/requirements.txt`:
```
stripe
```

- [ ] **Step 2: Install Stripe and pytest into the venv**

Run:
```bash
cd backend && ./venv/bin/pip install stripe pytest
```
Expected: "Successfully installed stripe-… pytest-…".

- [ ] **Step 3: Verify imports**

Run:
```bash
cd backend && ./venv/bin/python -c "import stripe, pytest; print('ok', stripe.VERSION)"
```
Expected: `ok <version>`.

- [ ] **Step 4: Commit**

```bash
git add backend/requirements.txt
git commit -m "build(backend): add stripe dependency"
```

---

## Task 3: Backend Stripe service

**Files:**
- Create: `backend/services/stripe_service.py`
- Test: `backend/tests/test_stripe_service.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/__init__.py` (empty) and `backend/tests/test_stripe_service.py`:

```python
import sys
import types
from pathlib import Path
from unittest.mock import MagicMock

import pytest

# Make `backend/` importable as the package root (services.*, etc.)
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


@pytest.fixture
def stripe_stub(monkeypatch):
    """Replace the `stripe` module imported by stripe_service with a stub."""
    import services.stripe_service as svc

    stripe = types.SimpleNamespace()
    stripe.api_key = None

    customer = types.SimpleNamespace(id="cus_NEW")
    stripe.Customer = types.SimpleNamespace(create=MagicMock(return_value=customer))

    ek = types.SimpleNamespace(secret="ek_secret_123")
    stripe.EphemeralKey = types.SimpleNamespace(create=MagicMock(return_value=ek))

    si = types.SimpleNamespace(client_secret="seti_secret_123")
    stripe.SetupIntent = types.SimpleNamespace(create=MagicMock(return_value=si))

    pm = types.SimpleNamespace(
        card=types.SimpleNamespace(brand="visa", last4="4242")
    )
    stripe.PaymentMethod = types.SimpleNamespace(
        list=MagicMock(return_value=types.SimpleNamespace(data=[pm]))
    )

    monkeypatch.setattr(svc, "stripe", stripe)
    return stripe


@pytest.fixture
def supabase_stub(monkeypatch):
    import services.stripe_service as svc

    sb = MagicMock()
    monkeypatch.setattr(svc, "get_supabase", lambda: sb)
    return sb


def test_get_or_create_customer_reuses_existing(stripe_stub, supabase_stub):
    import services.stripe_service as svc

    row = {"id": 7, "customer_id": "cus_EXISTING", "email": "a@b.co", "full_name": "A"}
    assert svc.get_or_create_attorney_customer(row) == "cus_EXISTING"
    stripe_stub.Customer.create.assert_not_called()


def test_get_or_create_customer_creates_and_persists(stripe_stub, supabase_stub):
    import services.stripe_service as svc

    row = {"id": 7, "customer_id": None, "email": "a@b.co", "full_name": "A"}
    cid = svc.get_or_create_attorney_customer(row)

    assert cid == "cus_NEW"
    stripe_stub.Customer.create.assert_called_once()
    supabase_stub.table.assert_called_with("attorneys")


def test_create_setup_bundle_shape(stripe_stub, supabase_stub, monkeypatch):
    import services.stripe_service as svc

    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_x")
    monkeypatch.setenv("STRIPE_PUBLISHABLE_KEY", "pk_test_x")
    row = {"id": 7, "customer_id": "cus_EXISTING", "email": "a@b.co", "full_name": "A"}

    bundle = svc.create_setup_bundle(row)
    assert bundle == {
        "setup_intent_client_secret": "seti_secret_123",
        "ephemeral_key": "ek_secret_123",
        "customer_id": "cus_EXISTING",
        "publishable_key": "pk_test_x",
    }


def test_sync_saved_card_persists_brand_last4(stripe_stub, supabase_stub):
    import services.stripe_service as svc

    row = {"id": 7, "customer_id": "cus_EXISTING"}
    card = svc.sync_saved_card(row)

    assert card == {"brand": "visa", "last4": "4242"}
    supabase_stub.table.assert_called_with("attorneys")


def test_sync_saved_card_no_customer_returns_none(stripe_stub, supabase_stub):
    import services.stripe_service as svc

    assert svc.sync_saved_card({"id": 7, "customer_id": None}) is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd backend && ./venv/bin/python -m pytest tests/test_stripe_service.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'services.stripe_service'`.

- [ ] **Step 3: Implement the service**

Create `backend/services/stripe_service.py`:

```python
"""
Attorney-app Stripe integration — setup-only (vault a card, never charge it).

Creates a Stripe Customer for the attorney and attaches a card via a
SetupIntent presented by the mobile PaymentSheet. We persist `customer_id`
plus the saved card's `brand`/`last4` on the `attorneys` row. There is NO
PaymentIntent and NO charge anywhere in this module.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import stripe

from services.supabase_client import get_supabase

log = logging.getLogger(__name__)


def _require(env: str) -> str:
    value = os.environ.get(env)
    if not value:
        raise RuntimeError(f"Missing required env var: {env}")
    return value


def _configure() -> None:
    stripe.api_key = _require("STRIPE_SECRET_KEY")


def get_publishable_key() -> str:
    return _require("STRIPE_PUBLISHABLE_KEY")


def get_or_create_attorney_customer(attorney_row: dict) -> str:
    """Return the attorney's Stripe customer id, creating + persisting if blank."""
    _configure()
    existing = (attorney_row.get("customer_id") or "").strip()
    if existing:
        return existing

    customer = stripe.Customer.create(
        email=(attorney_row.get("email") or "") or None,
        name=(attorney_row.get("full_name") or "") or None,
        metadata={"attorney_id": str(attorney_row["id"])},
    )

    get_supabase().table("attorneys").update(
        {"customer_id": customer.id}
    ).eq("id", attorney_row["id"]).execute()
    return customer.id


def create_setup_bundle(attorney_row: dict) -> dict[str, Any]:
    """Build the bundle the mobile PaymentSheet needs to attach a card.

    Returns: { setup_intent_client_secret, ephemeral_key, customer_id,
               publishable_key }.
    """
    _configure()
    customer_id = get_or_create_attorney_customer(attorney_row)

    ephemeral = stripe.EphemeralKey.create(
        customer=customer_id,
        stripe_version="2024-06-20",
    )
    setup_intent = stripe.SetupIntent.create(
        customer=customer_id,
        automatic_payment_methods={"enabled": True},
    )
    return {
        "setup_intent_client_secret": setup_intent.client_secret,
        "ephemeral_key": ephemeral.secret,
        "customer_id": customer_id,
        "publishable_key": get_publishable_key(),
    }


def sync_saved_card(attorney_row: dict) -> dict[str, str] | None:
    """Read the customer's most recent card, persist brand/last4, return them.

    Returns { brand, last4 } or None when no card is attached.
    """
    _configure()
    customer_id = (attorney_row.get("customer_id") or "").strip()
    if not customer_id:
        return None

    methods = stripe.PaymentMethod.list(customer=customer_id, type="card")
    data = getattr(methods, "data", None) or []
    if not data:
        get_supabase().table("attorneys").update(
            {"card_brand": None, "card_last4": None}
        ).eq("id", attorney_row["id"]).execute()
        return None

    card = data[0].card
    brand, last4 = card.brand, card.last4
    get_supabase().table("attorneys").update(
        {"card_brand": brand, "card_last4": last4}
    ).eq("id", attorney_row["id"]).execute()
    return {"brand": brand, "last4": last4}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd backend && ./venv/bin/python -m pytest tests/test_stripe_service.py -v
```
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/services/stripe_service.py backend/tests/__init__.py backend/tests/test_stripe_service.py
git commit -m "feat(backend): stripe vault service (setup-only)"
```

---

## Task 4: Backend vault endpoints

**Files:**
- Create: `backend/models/vault.py`
- Modify: `backend/routers/attorneys.py`

- [ ] **Step 1: Create the vault models**

Create `backend/models/vault.py`:

```python
from pydantic import BaseModel


class VaultSetupBundle(BaseModel):
    setup_intent_client_secret: str
    ephemeral_key: str
    customer_id: str
    publishable_key: str


class VaultCard(BaseModel):
    brand: str
    last4: str
```

- [ ] **Step 2: Add a customer-row helper + vault columns to the select in `attorneys.py`**

In `backend/routers/attorneys.py`, change `ATTORNEY_SELECT` (line 9) to include the vault columns:

```python
ATTORNEY_SELECT = "id,firm_id,full_name,email,phone,address,bar_number,title,bio,status,customer_id,card_brand,card_last4"
```

Add these imports near the existing imports at the top of the file:

```python
from models.vault import VaultCard, VaultSetupBundle
from services import stripe_service
```

Add this helper after `_profile_from_row` (it resolves the full attorney row, including the vault columns, for the authenticated token):

```python
def _current_attorney_row(token: dict) -> dict:
    user_id = int(token["sub"])
    email = _fetch_user_email(user_id)
    if not email:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    attorney = _fetch_attorney_by_email(email)
    if not attorney:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attorney profile not found.")
    return attorney
```

> Note: `AttorneyProfile` is a plain Pydantic v2 `BaseModel`, which ignores unknown keys by default. The three new columns in the widened `ATTORNEY_SELECT` are therefore silently dropped by the existing `_profile_from_row(**row)` — **no change to `_profile_from_row` is needed** and `GET /attorneys/me` keeps working unchanged.

- [ ] **Step 3: Add the two endpoints**

Append to `backend/routers/attorneys.py`:

```python
@router.post("/me/vault/setup", response_model=VaultSetupBundle)
def vault_setup(token: dict = Depends(require_attorney_role)) -> VaultSetupBundle:
    attorney = _current_attorney_row(token)
    bundle = stripe_service.create_setup_bundle(attorney)
    return VaultSetupBundle(**bundle)


@router.get("/me/vault/card", response_model=VaultCard | None)
def vault_card(token: dict = Depends(require_attorney_role)) -> VaultCard | None:
    attorney = _current_attorney_row(token)
    card = stripe_service.sync_saved_card(attorney)
    return VaultCard(**card) if card else None
```

- [ ] **Step 4: Verify the app imports and routes register**

Run:
```bash
cd backend && ./venv/bin/python -c "from routers.attorneys import router; print([r.path for r in router.routes])"
```
Expected: list includes `/attorneys/me/vault/setup` and `/attorneys/me/vault/card`.

- [ ] **Step 5: Commit**

```bash
git add backend/models/vault.py backend/routers/attorneys.py
git commit -m "feat(backend): attorney vault setup + saved-card endpoints"
```

---

## Task 5: Mobile — Stripe SDK + provider + env

**Files:**
- Modify: `mobile/package.json` (via installer)
- Modify: `mobile/.env`
- Modify: `mobile/app/_layout.tsx`

- [ ] **Step 1: Install the native module**

Run:
```bash
cd mobile && npx expo install @stripe/stripe-react-native
```
Expected: `@stripe/stripe-react-native` added to `package.json` dependencies.

- [ ] **Step 2: Add the publishable key to env**

Add to `mobile/.env` (use the test publishable key from the attorney-app Stripe account — the `pk_test_…` matching the backend `STRIPE_SECRET_KEY`):
```
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
```
Also add the same var to the EAS build profiles (`eas.json` env or EAS dashboard) so production builds have it.

- [ ] **Step 3: Wrap the app in StripeProvider**

Edit `mobile/app/_layout.tsx`. Add the import:
```typescript
import { StripeProvider } from '@stripe/stripe-react-native';
```
Wrap the `RootStack` inside `RootLayout`'s provider tree:
```typescript
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <StripeProvider publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY!}>
          <RootStack />
        </StripeProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
```

- [ ] **Step 4: Rebuild the dev client (native module added)**

Run:
```bash
cd mobile && npx expo prebuild --clean && npx expo run:ios
```
(or `eas build --profile development`). Expected: app launches without a "StripeProvider native module not found" error.

- [ ] **Step 5: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/app/_layout.tsx mobile/eas.json
git commit -m "build(mobile): add stripe-react-native + StripeProvider"
```

---

## Task 6: Mobile — vault lib

**Files:**
- Create: `mobile/lib/vault.ts`

- [ ] **Step 1: Implement the lib**

Create `mobile/lib/vault.ts` (mirrors the `Result`/`authedFetch` pattern in `lib/attorney.ts`):

```typescript
import { authedFetch } from './auth';

export type VaultSetupBundle = {
  setup_intent_client_secret: string;
  ephemeral_key: string;
  customer_id: string;
  publishable_key: string;
};

export type VaultCard = { brand: string; last4: string };

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

async function call<T>(method: 'GET' | 'POST', path: string): Promise<Result<T>> {
  try {
    const res = await authedFetch(path, { method });
    if (!res) return { ok: false, message: 'Not signed in.' };
    const json = await res.json().catch(() => ({} as any));
    if (!res.ok) {
      const detail = json?.detail;
      const message =
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail) && detail[0]?.msg
            ? String(detail[0].msg)
            : `Request failed (${res.status})`;
      return { ok: false, message };
    }
    return { ok: true, data: json as T };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? 'Network error' };
  }
}

export async function createSetupBundle(): Promise<Result<VaultSetupBundle>> {
  return call<VaultSetupBundle>('POST', '/attorneys/me/vault/setup');
}

// Backend returns `null` (HTTP 200) when no card is on file.
export async function getSavedCard(): Promise<Result<VaultCard | null>> {
  return call<VaultCard | null>('GET', '/attorneys/me/vault/card');
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
cd mobile && npx tsc --noEmit
```
Expected: no new errors referencing `lib/vault.ts`.

- [ ] **Step 3: Commit**

```bash
git add mobile/lib/vault.ts
git commit -m "feat(mobile): vault api client"
```

---

## Task 7: Mobile — Vault screen

**Files:**
- Create: `mobile/app/(auth)/profile/vault.tsx`

- [ ] **Step 1: Implement the screen**

Create `mobile/app/(auth)/profile/vault.tsx`. It mirrors the header/themed layout of `profile/change-password.tsx`, shows the saved card or an Add button, and uses Stripe's setup-mode PaymentSheet. No `Alert.alert` — status is rendered inline (attorney-app convention):

```typescript
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../../../components/Card';
import { fonts, radius, spacing } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import { createSetupBundle, getSavedCard, VaultCard } from '../../../lib/vault';

export default function VaultScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [card, setCard] = useState<VaultCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const loadCard = useCallback(async () => {
    const res = await getSavedCard();
    if (res.ok) {
      setCard(res.data);
      setStatus(null);
    } else {
      setStatus(res.message);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadCard().finally(() => setLoading(false));
  }, [loadCard]);

  const addCard = useCallback(async () => {
    setWorking(true);
    setStatus(null);

    const bundleRes = await createSetupBundle();
    if (!bundleRes.ok) {
      setStatus(bundleRes.message);
      setWorking(false);
      return;
    }
    const b = bundleRes.data;

    const init = await initPaymentSheet({
      merchantDisplayName: 'Genius Law',
      customerId: b.customer_id,
      customerEphemeralKeySecret: b.ephemeral_key,
      setupIntentClientSecret: b.setup_intent_client_secret,
    });
    if (init.error) {
      setStatus(init.error.message);
      setWorking(false);
      return;
    }

    const { error } = await presentPaymentSheet();
    if (error) {
      // User cancellation is not an error worth surfacing loudly.
      if (error.code !== 'Canceled') setStatus(error.message);
      setWorking(false);
      return;
    }

    await loadCard();
    setStatus('Card saved.');
    setWorking(false);
  }, [initPaymentSheet, presentPaymentSheet, loadCard]);

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text, fontFamily: fonts.heading }]}>
          Payment Vault
        </Text>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.content}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.textMuted} />
          </View>
        ) : (
          <Animated.View entering={FadeInDown.duration(320)}>
            <Card>
              {card ? (
                <View style={styles.cardRow}>
                  <View style={[styles.iconWrap, { backgroundColor: colors.accentTint, borderColor: colors.accentBorder }]}>
                    <Ionicons name="card-outline" size={18} color={colors.accent} />
                  </View>
                  <Text style={[styles.cardText, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
                    {card.brand.toUpperCase()} •••• {card.last4}
                  </Text>
                </View>
              ) : (
                <Text style={[styles.empty, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                  No card on file.
                </Text>
              )}
            </Card>

            <TouchableOpacity
              disabled={working}
              onPress={addCard}
              style={[styles.button, { backgroundColor: colors.accent, opacity: working ? 0.6 : 1 }]}
            >
              {working ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={[styles.buttonText, { color: colors.background, fontFamily: fonts.sansSemiBold }]}>
                  {card ? 'Replace Card' : 'Add Card'}
                </Text>
              )}
            </TouchableOpacity>

            {status ? (
              <Text style={[styles.status, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                {status}
              </Text>
            ) : null}
          </Animated.View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  center: { paddingVertical: spacing.xl, alignItems: 'center' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: {
    width: 32, height: 32, borderRadius: radius.sm, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  cardText: { fontSize: 15 },
  empty: { fontSize: 14 },
  button: {
    marginTop: spacing.lg, borderRadius: radius.md, paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: { fontSize: 15, letterSpacing: 0.4 },
  status: { marginTop: spacing.md, fontSize: 13, textAlign: 'center' },
});
```

- [ ] **Step 2: Type-check**

Run:
```bash
cd mobile && npx tsc --noEmit
```
Expected: no new errors referencing `profile/vault.tsx`. (If `error.code !== 'Canceled'` mis-types, use `error.code !== 'Canceled' as any` or compare against `PaymentSheetError.Canceled` from the SDK.)

- [ ] **Step 3: Commit**

```bash
git add "mobile/app/(auth)/profile/vault.tsx"
git commit -m "feat(mobile): payment vault screen"
```

---

## Task 8: Mobile — profile entry row

**Files:**
- Modify: `mobile/app/(auth)/profile/index.tsx`

- [ ] **Step 1: Add the "Payment Vault" action row**

In `mobile/app/(auth)/profile/index.tsx`, insert a new `Animated.View` block immediately after the "Change Password" card block (after its closing `</Animated.View>`, before the closing `</>`):

```typescript
<Animated.View entering={FadeInLeft.duration(360).delay(360)}>
  <Card style={styles.cardSpacing} padding="md" onPress={() => router.push('/(auth)/profile/vault')}>
    <View style={styles.actionRow}>
      <View style={[styles.iconWrap, { backgroundColor: colors.accentTint, borderColor: colors.accentBorder }]}>
        <Ionicons name="wallet-outline" size={18} color={colors.accent} />
      </View>
      <Text style={[styles.actionText, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
        Payment Vault
      </Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </View>
  </Card>
</Animated.View>
```

- [ ] **Step 2: Type-check**

Run:
```bash
cd mobile && npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "mobile/app/(auth)/profile/index.tsx"
git commit -m "feat(mobile): payment vault entry in profile"
```

---

## Task 9: End-to-end manual verification

**Files:** none (manual)

- [ ] **Step 1: Start the backend**

Run:
```bash
cd backend && ./venv/bin/uvicorn main:app --reload
```
Expected: starts with no import errors; `/attorneys/me/vault/setup` present in the OpenAPI docs (`/docs`).

- [ ] **Step 2: Run the rebuilt mobile dev client and add a card**

In the app: Profile → Payment Vault → Add Card → enter Stripe test card `4242 4242 4242 4242`, any future expiry, any CVC/zip → confirm.
Expected: sheet closes, screen shows "VISA •••• 4242", status "Card saved."

- [ ] **Step 3: Verify persistence in Supabase**

Run in Supabase SQL editor (replace with your attorney id/email):
```sql
SELECT id, customer_id, card_brand, card_last4 FROM attorneys WHERE email = 'you@firm.com';
```
Expected: `customer_id` like `cus_…`, `card_brand` = `visa`, `card_last4` = `4242`.

- [ ] **Step 4: Verify no charge in Stripe**

In the Stripe dashboard (attorney-app account, test mode): Customers → the new `cus_…` has the card under Payment methods, and Payments shows **no** charge.

- [ ] **Step 5: Re-open the screen**

Navigate away and back to Payment Vault.
Expected: "VISA •••• 4242" loads immediately from `GET /vault/card` (no sheet).

---

## Self-Review Notes

- **Spec coverage:** DB columns (T1), backend service incl. `customer_id` persist + brand/last4 (T3), endpoints (T4), mobile lib (T6), screen with saved-card display + add (T7), profile entry (T8), native dep + provider (T5), no-charge verified (T9). All spec sections mapped.
- **Type consistency:** `create_setup_bundle`/`sync_saved_card`/`get_or_create_attorney_customer` names match across backend tasks; `VaultSetupBundle`/`VaultCard` field names match the mobile `VaultSetupBundle`/`VaultCard` types; `createSetupBundle`/`getSavedCard` used consistently in lib + screen.
- **Known risk:** Widening `ATTORNEY_SELECT` (T4 Step 2) is safe — `AttorneyProfile` (plain Pydantic v2 model) ignores the extra `customer_id`/`card_brand`/`card_last4` keys, so `GET /attorneys/me` is unaffected.
