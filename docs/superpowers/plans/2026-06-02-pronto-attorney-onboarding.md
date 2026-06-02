# Pronto Attorney Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give attorneys whose `pronto_enabled = false` a self-serve, resumable onboarding wizard (Stripe Identity KYC → save a card → accept the $39.95/month platform-fee terms), after which a staff member manually flips `pronto_enabled`.

**Architecture:** All work lives in `Geniuslaw_Attorney_App`. The FastAPI backend gains four `/attorneys/me/...` endpoints and a `kyc_service.py` (Stripe Identity + terms), persisting to four new `attorneys` columns. The Pronto repo is untouched. The mobile app gets a dedicated wizard screen that reads a single onboarding-status endpoint and renders the correct step; the existing vault PaymentSheet is reused for the card step, and `@stripe/stripe-identity-react-native` drives the native ID + selfie capture.

**Tech Stack:** Python 3.11 / FastAPI / Stripe Python SDK / Supabase (Postgres) on the backend; Expo / React Native / expo-router / `@stripe/stripe-react-native` + `@stripe/stripe-identity-react-native` on mobile. Backend tests use pytest with `stripe`/`get_supabase` stubs (see `backend/tests/test_stripe_service.py`).

**Spec:** `docs/superpowers/specs/2026-06-02-pronto-attorney-onboarding-design.md`

---

## File Structure

**Backend (`backend/`)**
- `migrations/002_pronto_onboarding.sql` — *create* — four new `attorneys` columns
- `models/onboarding.py` — *create* — pydantic response models
- `services/kyc_service.py` — *create* — onboarding status, Stripe Identity session/refresh, terms acceptance
- `routers/attorneys.py` — *modify* — extend `ATTORNEY_SELECT`, add four routes
- `tests/test_kyc_service.py` — *create* — unit tests for `kyc_service`

**Mobile (`mobile/`)**
- `package.json` / `app.json` — *modify* — add Identity dependency + camera permission
- `lib/onboarding.ts` — *create* — API client (mirrors `lib/vault.ts`)
- `app/(auth)/pronto-onboarding.tsx` — *create* — the wizard screen
- `app/(auth)/pronto.tsx` — *modify* — "Get Pronto access" button on the not-enrolled card

---

## Task 1: Database migration — onboarding columns

**Files:**
- Create: `backend/migrations/002_pronto_onboarding.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 002_pronto_onboarding.sql
-- Pronto onboarding columns on attorneys (shared Supabase DB).
-- KYC (Stripe Identity) result + Pronto platform-fee terms acceptance.
-- No charges anywhere; pronto_enabled is still flipped manually by staff.
ALTER TABLE attorneys
    ADD COLUMN IF NOT EXISTS kyc_verified             boolean   NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS kyc_session_id           text,
    ADD COLUMN IF NOT EXISTS pronto_terms_accepted    boolean   NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS pronto_terms_accepted_at timestamp;
```

- [ ] **Step 2: Apply the migration to Supabase**

Run the SQL above in the Supabase SQL editor (or your migration runner) against the shared database. Confirm the four columns exist:

Run (psql or Supabase SQL editor):
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'attorneys'
  AND column_name IN ('kyc_verified','kyc_session_id','pronto_terms_accepted','pronto_terms_accepted_at')
ORDER BY column_name;
```
Expected: four rows returned.

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/002_pronto_onboarding.sql
git commit -m "feat(db): add Pronto onboarding columns to attorneys"
```

---

## Task 2: Backend response models

**Files:**
- Create: `backend/models/onboarding.py`

- [ ] **Step 1: Write the models**

```python
from pydantic import BaseModel


class OnboardingStatus(BaseModel):
    pronto_enabled: bool
    kyc_verified: bool
    has_card: bool
    terms_accepted: bool


class KycSessionBundle(BaseModel):
    session_id: str
    ephemeral_key_secret: str
    publishable_key: str


class KycRefreshResult(BaseModel):
    kyc_verified: bool
    status: str


class TermsAcceptResult(BaseModel):
    terms_accepted: bool
```

- [ ] **Step 2: Verify it imports**

Run: `cd backend && venv/bin/python -c "from models.onboarding import OnboardingStatus, KycSessionBundle, KycRefreshResult, TermsAcceptResult; print('ok')"`
Expected: prints `ok`

- [ ] **Step 3: Commit**

```bash
git add backend/models/onboarding.py
git commit -m "feat(api): add Pronto onboarding response models"
```

---

## Task 3: `kyc_service` — onboarding status (pure)

**Files:**
- Create: `backend/services/kyc_service.py`
- Test: `backend/tests/test_kyc_service.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_kyc_service.py`:

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


def test_compute_onboarding_status_all_false():
    import services.kyc_service as svc

    row = {}
    assert svc.compute_onboarding_status(row) == {
        "pronto_enabled": False,
        "kyc_verified": False,
        "has_card": False,
        "terms_accepted": False,
    }


def test_compute_onboarding_status_reads_flags_and_card():
    import services.kyc_service as svc

    row = {
        "pronto_enabled": False,
        "kyc_verified": True,
        "card_last4": "4242",
        "pronto_terms_accepted": True,
    }
    assert svc.compute_onboarding_status(row) == {
        "pronto_enabled": False,
        "kyc_verified": True,
        "has_card": True,
        "terms_accepted": True,
    }


def test_compute_onboarding_status_blank_card_is_no_card():
    import services.kyc_service as svc

    assert svc.compute_onboarding_status({"card_last4": "  "})["has_card"] is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && venv/bin/python -m pytest tests/test_kyc_service.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'services.kyc_service'`

- [ ] **Step 3: Write minimal implementation**

Create `backend/services/kyc_service.py`:

```python
"""
Attorney Pronto onboarding — KYC (Stripe Identity) + terms acceptance.

Creates a Stripe Identity VerificationSession (document + selfie/liveness) for
the attorney, tracks its result on the `attorneys` row (`kyc_verified`,
`kyc_session_id`), and records acceptance of the Pronto platform-fee terms
(`pronto_terms_accepted`, `pronto_terms_accepted_at`). No charges anywhere.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import stripe

from services.stripe_service import _configure, get_publishable_key
from services.supabase_client import get_supabase

log = logging.getLogger(__name__)


class OnboardingError(ValueError):
    """Raised when a step's prerequisites are not met."""


def compute_onboarding_status(attorney_row: dict) -> dict[str, bool]:
    """Pure: derive the four onboarding flags from an attorney row."""
    return {
        "pronto_enabled": bool(attorney_row.get("pronto_enabled")),
        "kyc_verified": bool(attorney_row.get("kyc_verified")),
        "has_card": bool((attorney_row.get("card_last4") or "").strip()),
        "terms_accepted": bool(attorney_row.get("pronto_terms_accepted")),
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && venv/bin/python -m pytest tests/test_kyc_service.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add backend/services/kyc_service.py backend/tests/test_kyc_service.py
git commit -m "feat(api): add onboarding status computation to kyc_service"
```

---

## Task 4: `kyc_service` — create Stripe Identity session

**Files:**
- Modify: `backend/services/kyc_service.py`
- Test: `backend/tests/test_kyc_service.py`

- [ ] **Step 1: Write the failing test**

Add this shared stub fixture and test to `backend/tests/test_kyc_service.py` (place the fixtures near the top, after the imports):

```python
@pytest.fixture
def stripe_stub(monkeypatch):
    """Replace the `stripe` module imported by kyc_service with a stub."""
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_stub")
    monkeypatch.setenv("STRIPE_PUBLISHABLE_KEY", "pk_test_stub")
    import services.kyc_service as svc

    stripe = types.SimpleNamespace()
    stripe.api_key = None

    session = types.SimpleNamespace(id="vs_NEW", status="requires_input")
    stripe.identity = types.SimpleNamespace(
        VerificationSession=types.SimpleNamespace(
            create=MagicMock(return_value=session),
            retrieve=MagicMock(return_value=session),
        )
    )

    ek = types.SimpleNamespace(secret="ek_secret_123")
    stripe.EphemeralKey = types.SimpleNamespace(create=MagicMock(return_value=ek))

    monkeypatch.setattr(svc, "stripe", stripe)
    return stripe


@pytest.fixture
def supabase_stub(monkeypatch):
    import services.kyc_service as svc

    sb = MagicMock()
    monkeypatch.setattr(svc, "get_supabase", lambda: sb)
    return sb


def test_create_kyc_session_shape_and_persist(stripe_stub, supabase_stub, monkeypatch):
    import services.kyc_service as svc

    monkeypatch.setenv("STRIPE_PUBLISHABLE_KEY", "pk_test_x")
    row = {"id": 7, "email": "a@b.co"}

    bundle = svc.create_kyc_session(row)

    assert bundle == {
        "session_id": "vs_NEW",
        "ephemeral_key_secret": "ek_secret_123",
        "publishable_key": "pk_test_x",
    }
    stripe_stub.identity.VerificationSession.create.assert_called_once()
    stripe_stub.EphemeralKey.create.assert_called_once()
    supabase_stub.table.assert_called_with("attorneys")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && venv/bin/python -m pytest tests/test_kyc_service.py::test_create_kyc_session_shape_and_persist -v`
Expected: FAIL with `AttributeError: module 'services.kyc_service' has no attribute 'create_kyc_session'`

- [ ] **Step 3: Write minimal implementation**

Append to `backend/services/kyc_service.py`:

```python
def create_kyc_session(attorney_row: dict) -> dict[str, Any]:
    """Create a Stripe Identity VerificationSession + ephemeral key for the app.

    Persists the session id on the attorney row. Returns the bundle the mobile
    Identity sheet needs: { session_id, ephemeral_key_secret, publishable_key }.
    """
    _configure()
    session = stripe.identity.VerificationSession.create(
        type="document",
        options={"document": {"require_matching_selfie": True}},
        provided_details={"email": (attorney_row.get("email") or "") or None},
        metadata={"attorney_id": str(attorney_row["id"])},
    )
    ephemeral = stripe.EphemeralKey.create(
        verification_session=session.id,
        stripe_version="2024-06-20",
    )
    get_supabase().table("attorneys").update(
        {"kyc_session_id": session.id}
    ).eq("id", attorney_row["id"]).execute()
    return {
        "session_id": session.id,
        "ephemeral_key_secret": ephemeral.secret,
        "publishable_key": get_publishable_key(),
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && venv/bin/python -m pytest tests/test_kyc_service.py -v`
Expected: all tests pass (4 total now)

- [ ] **Step 5: Commit**

```bash
git add backend/services/kyc_service.py backend/tests/test_kyc_service.py
git commit -m "feat(api): create Stripe Identity verification session"
```

---

## Task 5: `kyc_service` — refresh KYC status

**Files:**
- Modify: `backend/services/kyc_service.py`
- Test: `backend/tests/test_kyc_service.py`

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_kyc_service.py`:

```python
def test_refresh_kyc_no_session_returns_current(stripe_stub, supabase_stub):
    import services.kyc_service as svc

    out = svc.refresh_kyc_status({"id": 7, "kyc_session_id": None, "kyc_verified": False})
    assert out == {"kyc_verified": False, "status": "none"}
    stripe_stub.identity.VerificationSession.retrieve.assert_not_called()


def test_refresh_kyc_verified_persists(stripe_stub, supabase_stub):
    import services.kyc_service as svc

    stripe_stub.identity.VerificationSession.retrieve.return_value = types.SimpleNamespace(
        id="vs_NEW", status="verified"
    )
    out = svc.refresh_kyc_status({"id": 7, "kyc_session_id": "vs_NEW", "kyc_verified": False})

    assert out == {"kyc_verified": True, "status": "verified"}
    supabase_stub.table.assert_called_with("attorneys")


def test_refresh_kyc_processing_does_not_persist(stripe_stub, supabase_stub):
    import services.kyc_service as svc

    stripe_stub.identity.VerificationSession.retrieve.return_value = types.SimpleNamespace(
        id="vs_NEW", status="processing"
    )
    out = svc.refresh_kyc_status({"id": 7, "kyc_session_id": "vs_NEW", "kyc_verified": False})

    assert out == {"kyc_verified": False, "status": "processing"}
    supabase_stub.table.assert_not_called()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && venv/bin/python -m pytest tests/test_kyc_service.py -k refresh -v`
Expected: FAIL with `AttributeError: module 'services.kyc_service' has no attribute 'refresh_kyc_status'`

- [ ] **Step 3: Write minimal implementation**

Append to `backend/services/kyc_service.py`:

```python
def refresh_kyc_status(attorney_row: dict) -> dict[str, Any]:
    """Retrieve the attorney's Identity session; persist kyc_verified when verified.

    Returns { kyc_verified, status } where status is Stripe's session status
    (requires_input | processing | verified | canceled), or "none" when no
    session has been started yet.
    """
    _configure()
    session_id = (attorney_row.get("kyc_session_id") or "").strip()
    if not session_id:
        return {"kyc_verified": bool(attorney_row.get("kyc_verified")), "status": "none"}

    session = stripe.identity.VerificationSession.retrieve(session_id)
    verified = session.status == "verified"
    if verified and not attorney_row.get("kyc_verified"):
        get_supabase().table("attorneys").update(
            {"kyc_verified": True}
        ).eq("id", attorney_row["id"]).execute()
    return {"kyc_verified": verified, "status": session.status}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && venv/bin/python -m pytest tests/test_kyc_service.py -v`
Expected: all tests pass (7 total now)

- [ ] **Step 5: Commit**

```bash
git add backend/services/kyc_service.py backend/tests/test_kyc_service.py
git commit -m "feat(api): refresh and persist KYC verification status"
```

---

## Task 6: `kyc_service` — accept Pronto terms (guarded)

**Files:**
- Modify: `backend/services/kyc_service.py`
- Test: `backend/tests/test_kyc_service.py`

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_kyc_service.py`:

```python
def test_accept_terms_requires_kyc(supabase_stub):
    import services.kyc_service as svc

    with pytest.raises(svc.OnboardingError):
        svc.accept_pronto_terms({"id": 7, "kyc_verified": False, "card_last4": "4242"})
    supabase_stub.table.assert_not_called()


def test_accept_terms_requires_card(supabase_stub):
    import services.kyc_service as svc

    with pytest.raises(svc.OnboardingError):
        svc.accept_pronto_terms({"id": 7, "kyc_verified": True, "card_last4": None})
    supabase_stub.table.assert_not_called()


def test_accept_terms_persists_when_ready(supabase_stub):
    import services.kyc_service as svc

    out = svc.accept_pronto_terms({"id": 7, "kyc_verified": True, "card_last4": "4242"})
    assert out == {"terms_accepted": True}
    supabase_stub.table.assert_called_with("attorneys")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && venv/bin/python -m pytest tests/test_kyc_service.py -k accept -v`
Expected: FAIL with `AttributeError: module 'services.kyc_service' has no attribute 'accept_pronto_terms'`

- [ ] **Step 3: Write minimal implementation**

Append to `backend/services/kyc_service.py`:

```python
def accept_pronto_terms(attorney_row: dict) -> dict[str, bool]:
    """Record Pronto platform-fee terms acceptance.

    Guards that KYC is verified and a card is on file. Raises OnboardingError
    when a prerequisite is missing. No charge is made — acceptance only.
    """
    status = compute_onboarding_status(attorney_row)
    if not status["kyc_verified"]:
        raise OnboardingError("Complete identity verification first.")
    if not status["has_card"]:
        raise OnboardingError("Add a payment method first.")

    now = datetime.now(timezone.utc).isoformat()
    get_supabase().table("attorneys").update(
        {"pronto_terms_accepted": True, "pronto_terms_accepted_at": now}
    ).eq("id", attorney_row["id"]).execute()
    return {"terms_accepted": True}
```

- [ ] **Step 4: Run the full service test suite**

Run: `cd backend && venv/bin/python -m pytest tests/test_kyc_service.py -v`
Expected: all tests pass (10 total)

- [ ] **Step 5: Commit**

```bash
git add backend/services/kyc_service.py backend/tests/test_kyc_service.py
git commit -m "feat(api): record Pronto terms acceptance with prerequisite guard"
```

---

## Task 7: Wire the four routes into the attorneys router

**Files:**
- Modify: `backend/routers/attorneys.py`

- [ ] **Step 1: Extend `ATTORNEY_SELECT` to include onboarding columns**

In `backend/routers/attorneys.py`, replace line 11:

```python
ATTORNEY_SELECT = "id,firm_id,full_name,email,phone,address,bar_number,title,bio,status,customer_id,card_brand,card_last4"
```

with:

```python
ATTORNEY_SELECT = "id,firm_id,full_name,email,phone,address,bar_number,title,bio,status,customer_id,card_brand,card_last4,pronto_enabled,kyc_verified,kyc_session_id,pronto_terms_accepted"
```

(The extra keys are ignored by `AttorneyProfile` — pydantic v2 ignores unknown fields — so `/me` is unaffected.)

- [ ] **Step 2: Add imports**

In `backend/routers/attorneys.py`, after the existing `from models.vault import VaultCard, VaultSetupBundle` line, add:

```python
from models.onboarding import (
    KycRefreshResult,
    KycSessionBundle,
    OnboardingStatus,
    TermsAcceptResult,
)
from services import kyc_service
```

- [ ] **Step 3: Add the four routes**

Append to the end of `backend/routers/attorneys.py`:

```python
@router.get("/me/onboarding", response_model=OnboardingStatus)
def onboarding_status(token: dict = Depends(require_attorney_role)) -> OnboardingStatus:
    attorney = _current_attorney_row(token)
    return OnboardingStatus(**kyc_service.compute_onboarding_status(attorney))


@router.post("/me/kyc/session", response_model=KycSessionBundle)
def kyc_session(token: dict = Depends(require_attorney_role)) -> KycSessionBundle:
    attorney = _current_attorney_row(token)
    return KycSessionBundle(**kyc_service.create_kyc_session(attorney))


@router.post("/me/kyc/refresh", response_model=KycRefreshResult)
def kyc_refresh(token: dict = Depends(require_attorney_role)) -> KycRefreshResult:
    attorney = _current_attorney_row(token)
    return KycRefreshResult(**kyc_service.refresh_kyc_status(attorney))


@router.post("/me/pronto-terms/accept", response_model=TermsAcceptResult)
def pronto_terms_accept(token: dict = Depends(require_attorney_role)) -> TermsAcceptResult:
    attorney = _current_attorney_row(token)
    try:
        result = kyc_service.accept_pronto_terms(attorney)
    except kyc_service.OnboardingError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    return TermsAcceptResult(**result)
```

- [ ] **Step 4: Verify the app imports and routes register**

Run: `cd backend && venv/bin/python -c "from main import app; paths = {r.path for r in app.routes}; assert '/attorneys/me/onboarding' in paths and '/attorneys/me/kyc/session' in paths and '/attorneys/me/kyc/refresh' in paths and '/attorneys/me/pronto-terms/accept' in paths; print('routes ok')"`
Expected: prints `routes ok`

- [ ] **Step 5: Run the whole backend test suite (no regressions)**

Run: `cd backend && venv/bin/python -m pytest -q`
Expected: all tests pass (existing 5 + new 10 = 15)

- [ ] **Step 6: Commit**

```bash
git add backend/routers/attorneys.py
git commit -m "feat(api): expose Pronto onboarding + KYC + terms endpoints"
```

---

## Task 8: Mobile — add Stripe Identity dependency + native config

> This task adds a native module, so it requires a fresh EAS build (cannot ship OTA). Do this task before the screen task so the import resolves.

**Files:**
- Modify: `mobile/package.json` (via installer)
- Modify: `mobile/app.json`

- [ ] **Step 1: Install the Identity SDK**

Run: `cd mobile && npx expo install @stripe/stripe-identity-react-native`
Expected: package added to `package.json` dependencies.

- [ ] **Step 2: Add camera permission to `app.json`**

In `mobile/app.json`, ensure the iOS camera usage string is present under `expo.ios.infoPlist` (Identity needs the camera for document + selfie capture). Add this key (merge into an existing `infoPlist` object if one exists):

```json
"ios": {
  "infoPlist": {
    "NSCameraUsageDescription": "We use the camera to verify your identity with a photo ID and a selfie."
  }
}
```

And ensure Android camera permission under `expo.android.permissions`:

```json
"android": {
  "permissions": ["CAMERA"]
}
```

- [ ] **Step 3: Prebuild + rebuild native projects**

Run: `cd mobile && npx expo prebuild --clean`
Expected: `ios/` and `android/` regenerate without error.

Then trigger a dev client build (the device/simulator used for testing must run this new binary — the JS-only Expo Go/OTA path will NOT have the native Identity module):

Run: `cd mobile && eas build --profile development --platform ios`
Expected: build succeeds and produces an installable dev client.

- [ ] **Step 4: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/app.json
git commit -m "build(mobile): add Stripe Identity SDK + camera permission"
```

---

## Task 9: Mobile — onboarding API client

**Files:**
- Create: `mobile/lib/onboarding.ts`

- [ ] **Step 1: Write the client**

Create `mobile/lib/onboarding.ts`:

```typescript
import { authedFetch } from './auth';

export type OnboardingStatus = {
  pronto_enabled: boolean;
  kyc_verified: boolean;
  has_card: boolean;
  terms_accepted: boolean;
};

export type KycSessionBundle = {
  session_id: string;
  ephemeral_key_secret: string;
  publishable_key: string;
};

export type KycRefreshResult = { kyc_verified: boolean; status: string };

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

export async function getOnboardingStatus(): Promise<Result<OnboardingStatus>> {
  return call<OnboardingStatus>('GET', '/attorneys/me/onboarding');
}

export async function createKycSession(): Promise<Result<KycSessionBundle>> {
  return call<KycSessionBundle>('POST', '/attorneys/me/kyc/session');
}

export async function refreshKycStatus(): Promise<Result<KycRefreshResult>> {
  return call<KycRefreshResult>('POST', '/attorneys/me/kyc/refresh');
}

export async function acceptProntoTerms(): Promise<Result<{ terms_accepted: boolean }>> {
  return call<{ terms_accepted: boolean }>('POST', '/attorneys/me/pronto-terms/accept');
}
```

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors referencing `lib/onboarding.ts`.

- [ ] **Step 3: Commit**

```bash
git add mobile/lib/onboarding.ts
git commit -m "feat(mobile): add Pronto onboarding API client"
```

---

## Task 10: Mobile — onboarding wizard screen

**Files:**
- Create: `mobile/app/(auth)/pronto-onboarding.tsx`

The screen reads `getOnboardingStatus()` on mount/focus and renders one step:
`!kyc_verified` → KYC, `!has_card` → Payment, `!terms_accepted` → Terms, else → Waiting. KYC uses `useStripeIdentity` (native sheet); Payment reuses the vault PaymentSheet (`createSetupBundle` from `lib/vault`); Terms calls `acceptProntoTerms`.

- [ ] **Step 1: Write the screen**

Create `mobile/app/(auth)/pronto-onboarding.tsx`:

```typescript
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { useStripeIdentity } from '@stripe/stripe-identity-react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card } from '../../components/Card';
import { fonts, radius, spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import {
  acceptProntoTerms,
  createKycSession,
  getOnboardingStatus,
  refreshKycStatus,
  type OnboardingStatus,
} from '../../lib/onboarding';
import { createSetupBundle } from '../../lib/vault';

const PLATFORM_FEE_COPY =
  'By continuing you agree to the GeniusLaw Pronto platform fee of $39.95/month. ' +
  'Your card on file will be used to bill this fee once your account is enabled. ' +
  'No charge is made today.';

type Step = 'loading' | 'kyc' | 'payment' | 'terms' | 'waiting';

function stepFromStatus(s: OnboardingStatus): Step {
  if (!s.kyc_verified) return 'kyc';
  if (!s.has_card) return 'payment';
  if (!s.terms_accepted) return 'terms';
  return 'waiting';
}

export default function ProntoOnboardingScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [step, setStep] = useState<Step>('loading');
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await getOnboardingStatus();
    if (!res.ok) {
      setMessage(res.message);
      return;
    }
    if (res.data.pronto_enabled) {
      router.replace('/pronto');
      return;
    }
    setStep(stepFromStatus(res.data));
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  // --- KYC step (Stripe Identity native sheet) ---
  const fetchIdentityOptions = useCallback(async () => {
    const res = await createKycSession();
    if (!res.ok) throw new Error(res.message);
    return {
      sessionId: res.data.session_id,
      ephemeralKeySecret: res.data.ephemeral_key_secret,
      brandLogo: Image.resolveAssetSource(require('../../assets/icon.png')),
    };
  }, []);

  const { status: identityStatus, present: presentIdentity, loading: identityLoading } =
    useStripeIdentity(fetchIdentityOptions);

  useEffect(() => {
    if (identityStatus === 'FlowCompleted') {
      setWorking(true);
      setMessage('Reviewing your ID…');
      refreshKycStatus()
        .then((r) => {
          if (r.ok && !r.data.kyc_verified) {
            setMessage("We're still reviewing your ID. Check back shortly.");
          } else if (!r.ok) {
            setMessage(r.message);
          }
        })
        .finally(() => {
          setWorking(false);
          reload();
        });
    }
  }, [identityStatus, reload]);

  // --- Payment step (reuse vault PaymentSheet) ---
  const addCard = useCallback(async () => {
    setWorking(true);
    setMessage(null);
    const bundleRes = await createSetupBundle();
    if (!bundleRes.ok) {
      setMessage(bundleRes.message);
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
      setMessage(init.error.message);
      setWorking(false);
      return;
    }
    const { error } = await presentPaymentSheet();
    if (error) {
      if (error.code !== 'Canceled') setMessage(error.message);
      setWorking(false);
      return;
    }
    setWorking(false);
    await reload();
  }, [initPaymentSheet, presentPaymentSheet, reload]);

  // --- Terms step ---
  const agree = useCallback(async () => {
    setWorking(true);
    setMessage(null);
    const res = await acceptProntoTerms();
    if (!res.ok) setMessage(res.message);
    setWorking(false);
    await reload();
  }, [reload]);

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text, fontFamily: fonts.heading }]}>
          Get Pronto access
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {step === 'loading' ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.textMuted} />
          </View>
        ) : (
          <Animated.View entering={FadeInDown.duration(320)}>
            {step === 'kyc' ? (
              <Card>
                <Text style={[styles.stepTitle, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
                  Step 1 · Verify your identity
                </Text>
                <Text style={[styles.body, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                  Scan your government ID and take a quick selfie. This confirms you are who you say you are.
                </Text>
                <TouchableOpacity
                  disabled={working || identityLoading}
                  onPress={() => presentIdentity()}
                  style={[styles.button, { backgroundColor: colors.accent, opacity: working || identityLoading ? 0.6 : 1 }]}
                >
                  <Text style={[styles.buttonText, { color: colors.background, fontFamily: fonts.sansSemiBold }]}>
                    Start verification
                  </Text>
                </TouchableOpacity>
              </Card>
            ) : null}

            {step === 'payment' ? (
              <Card>
                <Text style={[styles.stepTitle, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
                  Step 2 · Add a payment method
                </Text>
                <Text style={[styles.body, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                  You're verified. Add a card we'll keep on file for the Pronto platform fee. No charge today.
                </Text>
                <TouchableOpacity
                  disabled={working}
                  onPress={addCard}
                  style={[styles.button, { backgroundColor: colors.accent, opacity: working ? 0.6 : 1 }]}
                >
                  {working ? (
                    <ActivityIndicator color={colors.background} />
                  ) : (
                    <Text style={[styles.buttonText, { color: colors.background, fontFamily: fonts.sansSemiBold }]}>
                      Add card
                    </Text>
                  )}
                </TouchableOpacity>
              </Card>
            ) : null}

            {step === 'terms' ? (
              <Card>
                <Text style={[styles.stepTitle, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
                  Step 3 · Accept the platform terms
                </Text>
                <Text style={[styles.body, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                  {PLATFORM_FEE_COPY}
                </Text>
                <TouchableOpacity
                  disabled={working}
                  onPress={agree}
                  style={[styles.button, { backgroundColor: colors.accent, opacity: working ? 0.6 : 1 }]}
                >
                  {working ? (
                    <ActivityIndicator color={colors.background} />
                  ) : (
                    <Text style={[styles.buttonText, { color: colors.background, fontFamily: fonts.sansSemiBold }]}>
                      I agree to $39.95/month
                    </Text>
                  )}
                </TouchableOpacity>
              </Card>
            ) : null}

            {step === 'waiting' ? (
              <Card>
                <Text style={[styles.stepTitle, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
                  You're all set
                </Text>
                <Text style={[styles.body, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                  A staff member will give you access to Pronto shortly. You'll see the Pronto dashboard here as soon as your account is enabled.
                </Text>
              </Card>
            ) : null}

            {message ? (
              <Text style={[styles.status, { color: colors.textMuted, fontFamily: fonts.sans }]}>{message}</Text>
            ) : null}
          </Animated.View>
        )}
      </ScrollView>
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
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl },
  center: { paddingVertical: spacing.xl, alignItems: 'center' },
  stepTitle: { fontSize: 16, marginBottom: spacing.sm },
  body: { fontSize: 14, lineHeight: 20 },
  button: { marginTop: spacing.lg, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  buttonText: { fontSize: 15, letterSpacing: 0.4 },
  status: { marginTop: spacing.md, fontSize: 13, textAlign: 'center' },
});
```

> **Note on `brandLogo`:** the code uses `require('../../assets/icon.png')`. If the app icon lives at a different path, point `require(...)` at any bundled PNG (the Identity SDK only uses it for sheet branding). Verify the asset path resolves before building.

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors in `app/(auth)/pronto-onboarding.tsx`. If `useStripeIdentity`'s status union differs from `'FlowCompleted'`, adjust the string literal to the SDK's completed-status value (check the package's exported `IdentityVerificationSheetStatus`).

- [ ] **Step 3: Commit**

```bash
git add "mobile/app/(auth)/pronto-onboarding.tsx"
git commit -m "feat(mobile): Pronto onboarding wizard (KYC, payment, terms, waiting)"
```

---

## Task 11: Mobile — "Get Pronto access" button on the not-enrolled card

**Files:**
- Modify: `mobile/app/(auth)/pronto.tsx` (the `!enrolled` branch, currently lines ~274-289)

- [ ] **Step 1: Replace the not-enrolled card body**

In `mobile/app/(auth)/pronto.tsx`, find the `!enrolled ?` branch:

```tsx
        ) : !enrolled ? (
          <Animated.View
            entering={FadeInUp.delay(60).duration(500).easing(Easing.out(Easing.cubic))}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          >
            <View style={styles.rowHeader}>
              <View style={[styles.dot, { backgroundColor: colors.textMuted }]} />
              <Text style={[styles.cardTitle, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
                Not enrolled
              </Text>
            </View>
            <Text style={[styles.hint, { color: colors.textMuted, fontFamily: fonts.sans }]}>
              Pronto access is granted by GeniusLaw. Please reach out to GeniusLaw to get
              enrolled — automatic enrollment is coming soon.
            </Text>
          </Animated.View>
        ) : (
```

and replace it with:

```tsx
        ) : !enrolled ? (
          <Animated.View
            entering={FadeInUp.delay(60).duration(500).easing(Easing.out(Easing.cubic))}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
          >
            <View style={styles.rowHeader}>
              <View style={[styles.dot, { backgroundColor: colors.textMuted }]} />
              <Text style={[styles.cardTitle, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
                Not enrolled
              </Text>
            </View>
            <Text style={[styles.hint, { color: colors.textMuted, fontFamily: fonts.sans }]}>
              Get set up for Pronto: verify your identity, add a payment method, and accept the
              platform terms. A staff member enables your access once you're done.
            </Text>
            <Pressable
              onPress={() => router.push('/pronto-onboarding')}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1, marginTop: spacing.md },
              ]}
            >
              <Text style={[styles.primaryBtnLabel, { color: colors.background, fontFamily: fonts.sansBold }]}>
                Get Pronto access
              </Text>
            </Pressable>
          </Animated.View>
        ) : (
```

(`Pressable`, `router`, `styles.primaryBtn`, `styles.primaryBtnLabel`, and `spacing` are all already imported/defined in this file — confirmed against the accept-request button.)

- [ ] **Step 2: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors in `app/(auth)/pronto.tsx`.

- [ ] **Step 3: Manual walkthrough on the dev build**

On the new dev client build (Task 8), as an attorney with `pronto_enabled = false`:
1. Open the Pronto tab → tap **Get Pronto access**.
2. **KYC:** tap Start verification → complete the Stripe Identity sheet → screen advances to Payment (may briefly show "reviewing your ID").
3. **Payment:** add a test card → screen advances to Terms.
4. **Terms:** tap "I agree to $39.95/month" → screen shows the Waiting state.
5. In Supabase, set `pronto_enabled = true` for this attorney → re-open the screen → it routes to the normal Pronto dashboard.

- [ ] **Step 4: Commit**

```bash
git add "mobile/app/(auth)/pronto.tsx"
git commit -m "feat(mobile): launch Pronto onboarding from not-enrolled card"
```

---

## Self-Review Notes (coverage against spec)

- **DB columns** → Task 1 (`kyc_verified`, `kyc_session_id`, `pronto_terms_accepted`, `pronto_terms_accepted_at`). Vault columns reused, not re-created.
- **`GET /onboarding`** → Tasks 3 (logic) + 7 (route).
- **`POST /kyc/session`** → Tasks 4 + 7.
- **`POST /kyc/refresh`** (pass/fail, no name compare; handles async `processing`) → Tasks 5 + 7.
- **`POST /pronto-terms/accept`** (guards KYC + card, 409 on failure) → Tasks 6 + 7.
- **Mobile native KYC sheet + EAS rebuild** → Task 8.
- **Wizard with 4 derived steps, reuses vault PaymentSheet** → Tasks 9 + 10.
- **Not-enrolled "Get Pronto access" entry point** → Task 11.
- **Staff handoff = DB flag only** → no notification task by design (spec non-goal); query documented in the spec.
- **No charge / no auto-enable / no name match / no webhook** → honored throughout (non-goals).
