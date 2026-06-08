# Stripe Connect Payouts Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an attorney set up their law firm's Stripe Connect (Express) payout account during Pronto onboarding, right after practice-area selection, writing `law_firms.destination_connect_id` only once the account can actually receive payouts.

**Architecture:** New backend `connect_service.py` (separate from vault `stripe_service.py` and `kyc_service.py`, reusing the same `stripe.api_key`) creates an Express account on the attorney's firm and returns a hosted AccountLink URL. Readiness is poll-on-return: `refresh_connect_status()` re-reads the account and promotes `connect_account_id` → `destination_connect_id` when `payouts_enabled` is true. Mobile adds a final "Payouts" onboarding step that opens the link and re-checks on return.

**Tech Stack:** FastAPI + Supabase (Python), Stripe Python SDK (Connect: `Account`, `AccountLink`), React Native / Expo Router, `expo-linking` (already installed).

---

## File Structure

**Backend**
- Create: `backend/migrations/003_law_firm_connect.sql` — adds `connect_account_id`, `destination_connect_id` to `law_firms`.
- Create: `backend/services/connect_service.py` — Express account creation, AccountLink, readiness promotion.
- Create: `backend/tests/test_connect_service.py` — unit tests with stubbed Stripe + Supabase.
- Modify: `backend/models/onboarding.py` — add `connect_ready` to `OnboardingStatus`; add `ConnectStartResult`, `ConnectRefreshResult`.
- Modify: `backend/routers/attorneys.py` — wire `connect_ready` into onboarding status; add `/me/connect/start` and `/me/connect/refresh`.

**Mobile**
- Modify: `mobile/lib/onboarding.ts` — add `connect_ready` to type; add `connectStart()`, `connectRefresh()`.
- Modify: `mobile/app/(auth)/pronto-onboarding.tsx` — add the `connect` step.

**Env (no code, note for deploy)**
- New backend env var `STRIPE_CONNECT_RETURN_URL` (https URL Stripe redirects to after onboarding). Not an `EXPO_PUBLIC_*` var — backend only.

---

## Task 1: Database migration

**Files:**
- Create: `backend/migrations/003_law_firm_connect.sql`

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply it to the Supabase database** (run the SQL in the Supabase SQL editor, or via your migration runner). Verify the two columns exist on `law_firms`.

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/003_law_firm_connect.sql
git commit -m "feat(connect): add law_firms connect account columns"
```

---

## Task 2: `connect_service.py` (TDD)

**Files:**
- Create: `backend/services/connect_service.py`
- Test: `backend/tests/test_connect_service.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_connect_service.py
import sys
import types
from pathlib import Path
from unittest.mock import MagicMock

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


@pytest.fixture
def stripe_stub(monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_stub")
    monkeypatch.setenv("STRIPE_CONNECT_RETURN_URL", "https://example.com/connect/return")
    import services.connect_service as svc

    stripe = types.SimpleNamespace()
    stripe.api_key = None
    stripe.Account = types.SimpleNamespace(
        create=MagicMock(return_value=types.SimpleNamespace(id="acct_NEW", payouts_enabled=False)),
        retrieve=MagicMock(return_value=types.SimpleNamespace(id="acct_NEW", payouts_enabled=False)),
    )
    stripe.AccountLink = types.SimpleNamespace(
        create=MagicMock(return_value=types.SimpleNamespace(url="https://connect.stripe.com/setup/abc")),
    )
    monkeypatch.setattr(svc, "stripe", stripe)
    return stripe


@pytest.fixture
def supabase_stub(monkeypatch):
    import services.connect_service as svc
    sb = MagicMock()
    monkeypatch.setattr(svc, "get_supabase", lambda: sb)
    return sb


def _set_firm(sb, firm):
    """Make _fetch_firm() return `firm` (a dict) or None when firm is None."""
    sb.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = (
        types.SimpleNamespace(data=[firm] if firm else [])
    )


def test_firm_payouts_ready_true(stripe_stub, supabase_stub):
    import services.connect_service as svc
    _set_firm(supabase_stub, {"id": 5, "destination_connect_id": "acct_LIVE"})
    assert svc.firm_payouts_ready(5) is True


def test_firm_payouts_ready_false_when_blank(stripe_stub, supabase_stub):
    import services.connect_service as svc
    _set_firm(supabase_stub, {"id": 5, "destination_connect_id": "  "})
    assert svc.firm_payouts_ready(5) is False


def test_start_returns_ready_when_destination_set(stripe_stub, supabase_stub):
    import services.connect_service as svc
    _set_firm(supabase_stub, {"id": 5, "destination_connect_id": "acct_LIVE"})
    out = svc.start_connect_onboarding({"id": 7, "firm_id": 5, "email": "a@b.co"})
    assert out == {"status": "ready"}
    stripe_stub.Account.create.assert_not_called()
    stripe_stub.AccountLink.create.assert_not_called()


def test_start_creates_account_and_returns_link(stripe_stub, supabase_stub):
    import services.connect_service as svc
    _set_firm(supabase_stub, {"id": 5, "connect_account_id": None, "destination_connect_id": None})
    out = svc.start_connect_onboarding({"id": 7, "firm_id": 5, "email": "a@b.co"})
    assert out == {"status": "pending", "url": "https://connect.stripe.com/setup/abc"}
    stripe_stub.Account.create.assert_called_once()
    stripe_stub.AccountLink.create.assert_called_once()
    supabase_stub.table.assert_any_call("law_firms")


def test_start_reuses_existing_account(stripe_stub, supabase_stub):
    import services.connect_service as svc
    _set_firm(supabase_stub, {"id": 5, "connect_account_id": "acct_OLD", "destination_connect_id": None})
    out = svc.start_connect_onboarding({"id": 7, "firm_id": 5, "email": "a@b.co"})
    assert out["status"] == "pending"
    stripe_stub.Account.create.assert_not_called()
    stripe_stub.AccountLink.create.assert_called_once()
    # Link is created against the existing account id.
    _, kwargs = stripe_stub.AccountLink.create.call_args
    assert kwargs["account"] == "acct_OLD"


def test_refresh_none_when_no_account(stripe_stub, supabase_stub):
    import services.connect_service as svc
    _set_firm(supabase_stub, {"id": 5, "connect_account_id": None, "destination_connect_id": None})
    out = svc.refresh_connect_status({"id": 7, "firm_id": 5})
    assert out == {"status": "none"}
    stripe_stub.Account.retrieve.assert_not_called()


def test_refresh_promotes_when_payouts_enabled(stripe_stub, supabase_stub):
    import services.connect_service as svc
    _set_firm(supabase_stub, {"id": 5, "connect_account_id": "acct_OLD", "destination_connect_id": None})
    stripe_stub.Account.retrieve.return_value = types.SimpleNamespace(id="acct_OLD", payouts_enabled=True)
    out = svc.refresh_connect_status({"id": 7, "firm_id": 5})
    assert out == {"status": "ready"}
    supabase_stub.table.assert_any_call("law_firms")


def test_refresh_pending_when_not_enabled(stripe_stub, supabase_stub):
    import services.connect_service as svc
    _set_firm(supabase_stub, {"id": 5, "connect_account_id": "acct_OLD", "destination_connect_id": None})
    stripe_stub.Account.retrieve.return_value = types.SimpleNamespace(id="acct_OLD", payouts_enabled=False)
    out = svc.refresh_connect_status({"id": 7, "firm_id": 5})
    assert out == {"status": "pending"}


def test_refresh_ready_shortcircuits(stripe_stub, supabase_stub):
    import services.connect_service as svc
    _set_firm(supabase_stub, {"id": 5, "connect_account_id": "acct_OLD", "destination_connect_id": "acct_OLD"})
    out = svc.refresh_connect_status({"id": 7, "firm_id": 5})
    assert out == {"status": "ready"}
    stripe_stub.Account.retrieve.assert_not_called()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && ./venv/bin/python -m pytest tests/test_connect_service.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'services.connect_service'`

- [ ] **Step 3: Write the implementation**

```python
# backend/services/connect_service.py
"""
Attorney Pronto onboarding — Stripe Connect (firm payouts) setup.

Creates a Stripe Express connected account for the attorney's LAW FIRM and hands
back a hosted onboarding (AccountLink) URL. Readiness is detected by
poll-on-return: refresh_connect_status() re-reads the account and, once Stripe
reports payouts_enabled, promotes the working account id to the firm's
destination_connect_id — the id Pronto payment routing reads.

Firm-level: the connected account lives on law_firms, shared by every attorney
in the firm (first-come; no firm-admin concept). connect_account_id is the
resume handle (written at creation, even mid-onboarding); destination_connect_id
is written ONLY when payouts are actually enabled. Reuses the same Stripe
api_key as the card-vault and KYC integrations; those modules are untouched.
"""
from __future__ import annotations

import logging
import os

import stripe

from services.stripe_service import _configure
from services.supabase_client import get_supabase

log = logging.getLogger(__name__)

FIRM_SELECT = "id,name,connect_account_id,destination_connect_id"


def _return_url() -> str:
    url = os.environ.get("STRIPE_CONNECT_RETURN_URL")
    if not url:
        raise RuntimeError("Missing required env var: STRIPE_CONNECT_RETURN_URL")
    return url


def _fetch_firm(firm_id: int) -> dict | None:
    resp = (
        get_supabase()
        .table("law_firms")
        .select(FIRM_SELECT)
        .eq("id", firm_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    return rows[0] if rows else None


def firm_payouts_ready(firm_id: int) -> bool:
    """True when the firm already has a payout-ready destination_connect_id."""
    firm = _fetch_firm(firm_id)
    return bool(firm and (firm.get("destination_connect_id") or "").strip())


def start_connect_onboarding(attorney_row: dict) -> dict:
    """Ensure the firm has an Express account; return a hosted onboarding link.

    Returns {"status": "ready"} when the firm is already payout-ready (no link
    needed), else {"status": "pending", "url": <account_link_url>}.
    """
    _configure()
    firm_id = attorney_row["firm_id"]
    firm = _fetch_firm(firm_id)
    if firm and (firm.get("destination_connect_id") or "").strip():
        return {"status": "ready"}

    account_id = (firm.get("connect_account_id") if firm else None) or None
    if not account_id:
        account = stripe.Account.create(
            type="express",
            country="US",
            email=(attorney_row.get("email") or "") or None,
            capabilities={"transfers": {"requested": True}},
            metadata={"firm_id": str(firm_id)},
        )
        account_id = account.id
        get_supabase().table("law_firms").update(
            {"connect_account_id": account_id}
        ).eq("id", firm_id).execute()

    link = stripe.AccountLink.create(
        account=account_id,
        refresh_url=_return_url(),
        return_url=_return_url(),
        type="account_onboarding",
    )
    return {"status": "pending", "url": link.url}


def refresh_connect_status(attorney_row: dict) -> dict:
    """Re-read the firm's account; promote to destination_connect_id when ready.

    Returns {"status": "ready" | "pending" | "none"}.
    """
    _configure()
    firm_id = attorney_row["firm_id"]
    firm = _fetch_firm(firm_id)
    if firm and (firm.get("destination_connect_id") or "").strip():
        return {"status": "ready"}

    account_id = (firm.get("connect_account_id") if firm else None) or None
    if not account_id:
        return {"status": "none"}

    account = stripe.Account.retrieve(account_id)
    if getattr(account, "payouts_enabled", False):
        get_supabase().table("law_firms").update(
            {"destination_connect_id": account_id}
        ).eq("id", firm_id).execute()
        return {"status": "ready"}
    return {"status": "pending"}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && ./venv/bin/python -m pytest tests/test_connect_service.py -v`
Expected: PASS (9 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/services/connect_service.py backend/tests/test_connect_service.py
git commit -m "feat(connect): firm Express account onboarding service"
```

---

## Task 3: Models + router wiring

**Files:**
- Modify: `backend/models/onboarding.py`
- Modify: `backend/routers/attorneys.py`

- [ ] **Step 1: Add `connect_ready` + result models in `onboarding.py`**

Change the imports line at the top of `backend/models/onboarding.py`:

```python
from typing import Optional

from pydantic import BaseModel
```

Add `connect_ready` to `OnboardingStatus` so it reads:

```python
class OnboardingStatus(BaseModel):
    pronto_enabled: bool
    kyc_verified: bool
    has_card: bool
    terms_accepted: bool
    practices_selected: bool
    connect_ready: bool
```

Add these two models at the end of the file:

```python
class ConnectStartResult(BaseModel):
    status: str
    url: Optional[str] = None


class ConnectRefreshResult(BaseModel):
    status: str
```

- [ ] **Step 2: Wire the router in `attorneys.py`**

Add to the `models.onboarding` import block (currently `KycRefreshResult, KycSessionBundle, OnboardingStatus, TermsAcceptResult`):

```python
from models.onboarding import (
    ConnectRefreshResult,
    ConnectStartResult,
    KycRefreshResult,
    KycSessionBundle,
    OnboardingStatus,
    TermsAcceptResult,
)
```

Add the service import next to `from services import kyc_service`:

```python
from services import connect_service
```

Replace the `onboarding_status` endpoint body so it includes `connect_ready`:

```python
@router.get("/me/onboarding", response_model=OnboardingStatus)
def onboarding_status(token: dict = Depends(require_attorney_role)) -> OnboardingStatus:
    attorney = _current_attorney_row(token)
    flags = kyc_service.compute_onboarding_status(attorney)
    flags["connect_ready"] = connect_service.firm_payouts_ready(attorney["firm_id"])
    return OnboardingStatus(**flags)
```

Add the two endpoints (place them right after `pronto_terms_accept`):

```python
@router.post("/me/connect/start", response_model=ConnectStartResult)
def connect_start(token: dict = Depends(require_attorney_role)) -> ConnectStartResult:
    attorney = _current_attorney_row(token)
    return ConnectStartResult(**connect_service.start_connect_onboarding(attorney))


@router.post("/me/connect/refresh", response_model=ConnectRefreshResult)
def connect_refresh(token: dict = Depends(require_attorney_role)) -> ConnectRefreshResult:
    attorney = _current_attorney_row(token)
    return ConnectRefreshResult(**connect_service.refresh_connect_status(attorney))
```

- [ ] **Step 3: Verify the backend imports cleanly**

Run: `cd backend && STRIPE_CONNECT_RETURN_URL=https://example.com/r ./venv/bin/python -c "import routers.attorneys"`
Expected: no output, exit code 0 (no ImportError).

- [ ] **Step 4: Run the full backend test suite**

Run: `cd backend && ./venv/bin/python -m pytest tests/test_connect_service.py -v`
Expected: PASS (9 passed). (Note: pre-existing `tests/test_kyc_service.py` has stale `compute_onboarding_status` expectations unrelated to this work — do not fix here.)

- [ ] **Step 5: Commit**

```bash
git add backend/models/onboarding.py backend/routers/attorneys.py
git commit -m "feat(connect): connect_ready status + start/refresh endpoints"
```

---

## Task 4: Mobile API client (`lib/onboarding.ts`)

**Files:**
- Modify: `mobile/lib/onboarding.ts`

- [ ] **Step 1: Add `connect_ready` to the status type**

In `OnboardingStatus`, add the field:

```typescript
export type OnboardingStatus = {
  pronto_enabled: boolean;
  kyc_verified: boolean;
  has_card: boolean;
  terms_accepted: boolean;
  practices_selected: boolean;
  connect_ready: boolean;
};
```

- [ ] **Step 2: Add Connect result types + calls**

Add these types after `KycRefreshResult`:

```typescript
export type ConnectStartResult = { status: 'ready' | 'pending'; url?: string };

export type ConnectRefreshResult = { status: 'ready' | 'pending' | 'none' };
```

Add these functions at the end of the file (the local `call<T>` helper already supports `'POST'`):

```typescript
export async function connectStart(): Promise<Result<ConnectStartResult>> {
  return call<ConnectStartResult>('POST', '/attorneys/me/connect/start');
}

export async function connectRefresh(): Promise<Result<ConnectRefreshResult>> {
  return call<ConnectRefreshResult>('POST', '/attorneys/me/connect/refresh');
}
```

- [ ] **Step 3: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors in `lib/onboarding.ts` (a pre-existing error in `calls/[id].tsx` is unrelated and may remain).

- [ ] **Step 4: Commit**

```bash
git add mobile/lib/onboarding.ts
git commit -m "feat(connect): mobile connect start/refresh client + connect_ready"
```

---

## Task 5: Mobile onboarding `connect` step (`pronto-onboarding.tsx`)

**Files:**
- Modify: `mobile/app/(auth)/pronto-onboarding.tsx`

- [ ] **Step 1: Add imports**

Add at the top with the other imports:

```typescript
import * as Linking from 'expo-linking';
```

Extend the `lib/onboarding` import to include the connect calls:

```typescript
import {
  acceptProntoTerms,
  connectRefresh,
  connectStart,
  createKycSession,
  getOnboardingStatus,
  refreshKycStatus,
  type OnboardingStatus,
} from '../../lib/onboarding';
```

- [ ] **Step 2: Add the `connect` step to the step machinery**

Change the `Step` type:

```typescript
type Step = 'loading' | 'kyc' | 'payment' | 'terms' | 'practices' | 'connect' | 'waiting';
```

Add a 5th entry to `STEPS`:

```typescript
const STEPS: { key: Exclude<Step, 'loading' | 'waiting'>; label: string }[] = [
  { key: 'kyc', label: 'Identity' },
  { key: 'payment', label: 'Payment' },
  { key: 'terms', label: 'Terms' },
  { key: 'practices', label: 'Practice' },
  { key: 'connect', label: 'Payouts' },
];
```

Replace `stepFromStatus` so `connect` is the terminal step after practices:

```typescript
function stepFromStatus(s: OnboardingStatus): Step {
  if (!s.kyc_verified) return 'kyc';
  if (!s.has_card) return 'payment';
  if (!s.terms_accepted) return 'terms';
  if (!s.practices_selected) return 'practices';
  // Payouts is the last step. It renders either "set up" or "already set for your
  // firm — you're good" based on the firm's Connect readiness.
  return 'connect';
}
```

Replace `currentIndex`:

```typescript
function currentIndex(step: Step): number {
  if (step === 'kyc') return 0;
  if (step === 'payment') return 1;
  if (step === 'terms') return 2;
  if (step === 'practices') return 3;
  if (step === 'connect') return 4;
  return 5; // waiting → all complete
}
```

- [ ] **Step 3: Add connect state + refresh-on-load into `reload`**

Add this state alongside the other `useState` hooks (near `practicesLoading`):

```typescript
const [connectStatus, setConnectStatus] = useState<'unknown' | 'ready' | 'pending'>('unknown');
```

Replace the `reload` callback so it re-checks Connect readiness whenever the
`connect` step is shown (this runs on every focus via the existing
`useFocusEffect`, so returning from the Stripe browser re-checks automatically):

```typescript
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
  const next = stepFromStatus(res.data);
  setStep(next);
  if (next === 'connect') {
    if (res.data.connect_ready) {
      setConnectStatus('ready');
    } else {
      const r = await connectRefresh();
      if (r.ok) setConnectStatus(r.data.status === 'ready' ? 'ready' : 'pending');
    }
  }
}, [router]);
```

- [ ] **Step 4: Route practices "Save & continue" into the connect step**

Replace the end of `savePractices` (currently `router.replace('/pronto')`) so it
advances to the payouts step instead of leaving onboarding:

```typescript
const savePractices = useCallback(async () => {
  if (selectedPractices.size === 0) return;
  setWorking(true);
  setMessage(null);
  const res = await savePracticeAreas([...selectedPractices]);
  setWorking(false);
  if (!res.ok) {
    setMessage(res.message);
    return;
  }
  // Practices saved → advance to the payouts step (reload computes 'connect'
  // and checks the firm's Connect readiness).
  await reload();
}, [selectedPractices, reload]);
```

- [ ] **Step 5: Add the `setupPayouts` handler**

Add this callback near the other handlers (e.g. after `savePractices`):

```typescript
const setupPayouts = useCallback(async () => {
  setWorking(true);
  setMessage(null);
  const res = await connectStart();
  setWorking(false);
  if (!res.ok) {
    setMessage(res.message);
    return;
  }
  if (res.data.status === 'ready') {
    setConnectStatus('ready');
    return;
  }
  if (res.data.url) {
    // Opens Stripe-hosted onboarding. On return to the app, useFocusEffect →
    // reload() → connectRefresh() promotes the firm once payouts are enabled.
    await Linking.openURL(res.data.url);
  }
}, []);
```

- [ ] **Step 6: Add the `connect` branch to the `hero` config**

In the `hero` ternary chain, the final branch is currently the practices object.
Make practices explicit and add `connect` as the new final branch. Replace the
tail of the chain (the `: { ...practices }` block) with:

```typescript
        : step === 'practices'
          ? {
              icon: 'briefcase-outline' as const,
              title: 'Choose your practice areas',
              body: 'Select the practice areas you handle. Clients will be matched to you based on these.',
              points: [],
              cta: 'Save & continue',
              onPress: savePractices,
              busy: false,
            }
          : connectStatus === 'ready'
            ? {
                icon: 'cash-outline' as const,
                title: 'Payouts ready',
                body: "Stripe payouts are already set up for your firm — you're good to go.",
                points: [],
                cta: 'Continue',
                onPress: () => router.replace('/pronto'),
                busy: false,
              }
            : {
                icon: 'cash-outline' as const,
                title: 'Set up firm payouts',
                body: "Connect your firm's bank account through Stripe so client payments can reach you. Stripe securely collects your bank and verification details — it only takes a couple of minutes.",
                points: [],
                cta: 'Set up payouts',
                onPress: setupPayouts,
                busy: false,
              };
```

(The body JSX already falls back to `<Text>{hero.body}</Text>` for any step that
isn't `terms` or `practices`, so the `connect` step renders its body with no
further JSX changes.)

- [ ] **Step 7: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors from `pronto-onboarding.tsx` (`'cash-outline'` is a valid Ionicons name; pre-existing unrelated error in `calls/[id].tsx` may remain).

- [ ] **Step 8: Commit**

```bash
git add "mobile/app/(auth)/pronto-onboarding.tsx"
git commit -m "feat(connect): payouts onboarding step in Pronto wizard"
```

---

## Task 6: Manual end-to-end verification (Stripe test mode)

**Prerequisites:** Backend running with `STRIPE_SECRET_KEY` = a **test** key and
`STRIPE_CONNECT_RETURN_URL` set to any reachable https page (e.g. a simple
"you can return to the app now" page). Mobile pointed at that backend.

- [ ] **Step 1:** As an attorney whose firm has no `destination_connect_id`, complete onboarding through practice areas → reach the **Payouts** step → tap **Set up payouts**.
- [ ] **Step 2:** In the Stripe-hosted onboarding, use test data (SSN `000-00-0000`, routing `110000000`, account `000123456789`, OTP `000000`, or the test-mode "skip / use test data" shortcut). Finish and return to the app.
- [ ] **Step 3:** Confirm the step flips to **"Payouts ready … you're good to go"** and `law_firms.destination_connect_id` is now populated in Supabase. Tap **Continue** → lands on `/pronto` (waiting-for-staff).
- [ ] **Step 4:** As a *second* attorney in the **same firm**, reach the Payouts step and confirm it shows **"Payouts ready"** immediately (inherited), with no second Stripe account created (`law_firms.connect_account_id` unchanged).
- [ ] **Step 5:** Confirm existing flows are unaffected: card vault setup and KYC still work (test/live isolation means the live integration is untouched).

---

## Notes / Out of scope

- **Deploy:** set `STRIPE_CONNECT_RETURN_URL` in the backend environment before shipping. Backend-only var (not `EXPO_PUBLIC_*`), so no EAS env upload needed.
- **Future:** `account.updated` webhook for readiness without requiring the user to return; routing client payments to `destination_connect_id` (client/Pronto-payment side); firm-admin permissions for who may onboard.
