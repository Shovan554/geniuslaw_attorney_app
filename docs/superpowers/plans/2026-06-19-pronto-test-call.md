# Pronto Test Call Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a not-yet-enabled attorney run a self-contained demo of the Pronto incoming-call experience — real OS push banner, real native CallKit ring, real solo Daily.co room — that writes nothing to the database except a single (flagged, hidden) attorney notification row.

**Architecture:** Mostly client-side. A new `pronto-test` screen drives a scripted state machine (Start → fake open-request card → local CallKit ring → join). Two tiny side-effect-free Pronto backend endpoints provide the one real notification row and a real Daily room/token. The existing global CallKit `answerCall`/`endCall` listeners branch to the test path via an in-memory test-call registry. The existing `calls/[id]` Daily screen gains a `test` mode that skips all real status-polling / wrap-up backend calls.

**Tech Stack:** React Native + Expo Router (mobile, TypeScript), FastAPI + Supabase + Daily.co (Pronto backend, Python), `react-native-callkeep` (CallKit/ConnectionService), `@daily-co/react-native-daily-js`.

## Global Constraints

- **Only ONE DB insert in the whole feature: a single `attorney_notifications` row.** No other inserts/updates to any table. No `pronto_calls`, `pronto_requests`, `cases`, `orders`, `transactions`, or schema/migration changes.
- The test notification row uses `genre = "pronto_test"` and MUST be excluded from the attorney's real in-app notification list (filter, not delete).
- The Daily room is created via Daily.co's HTTP API (external, auto-expiring) — never persisted in our DB.
- Entry point ("Try a test call") is visible **only while `pronto_enabled === false`** (mobile `Availability.pronto_enabled`).
- A clear **"TEST MODE"** badge appears on the test screen and the test call room.
- Mobile has **no JS test runner**; the automated gate is `npx tsc --noEmit` (run from `mobile/`) plus the manual device steps in each task. Backend uses pytest (`backend/pytest.ini`); pure helpers get real unit tests.
- Never use `Alert.alert` for the Pronto wrap-up flow is already handled; for new test code, plain `Alert.alert` for error toasts is acceptable (matches `callKit.ts` / `pronto.tsx` existing usage).
- Daily/Supabase env + the existing `_create_daily_room` / `_mint_meeting_token` helpers in `calls_service.py` are reused verbatim — do not re-implement Daily HTTP.

---

## File Structure

**Backend (`/Users/shovansmini/codes/Pronto/backend`):**
- Create `services/pronto_test.py` — pure helpers: dummy constants, `build_test_notification`, `build_test_start_response`.
- Modify `services/calls_service.py` — add `create_test_call_room(attorney_name, is_video)` (reuses existing Daily helpers, no DB).
- Modify `routers/attorney_pronto.py` — add `POST /test/start` and `POST /test/call`.
- Modify `routers/attorney_notifications.py` — exclude `genre = "pronto_test"` from the list query.
- Create `tests/test_pronto_test.py` — unit tests for the pure helpers + the no-DB room wrapper.

**Mobile (`/Users/shovansmini/codes/Geniuslaw_Attorney_App/mobile`):**
- Modify `lib/pronto.ts` — `TestCallStart` type + `startProntoTest()` + `startProntoTestCall()`.
- Create `lib/testCall.ts` — in-memory test-call registry + `displayTestIncomingCall` + `handleTestCallAnswer`.
- Modify `lib/callKit.ts` — branch the iOS + Android `answerCall`/`endCall` handlers to the test path.
- Modify `app/(auth)/calls/[id].tsx` — `test` route param → skip polling/end/wrap-up, simulate connected, self-view as main tile, TEST MODE badge.
- Create `app/(auth)/pronto-test.tsx` — the test screen + scripted flow.
- Create `components/TestCallEntry.tsx` — the reusable "Try a test call" button.
- Modify `app/(auth)/pronto.tsx` — render `<TestCallEntry/>` in both pre-enrolled branches.
- Modify `app/(auth)/pronto-onboarding.tsx` — render `<TestCallEntry/>` in the sticky footer.
- Modify `lib/notifications.ts` — route `genre === "pronto_test"` taps to `pronto-test`.

---

## Task 1: Backend — pure test helpers + unit tests

**Files:**
- Create: `/Users/shovansmini/codes/Pronto/backend/services/pronto_test.py`
- Test: `/Users/shovansmini/codes/Pronto/backend/tests/test_pronto_test.py`

**Interfaces:**
- Produces:
  - `TEST_CLIENT_NAME: str`, `TEST_PRACTICE_AREA: str`, `TEST_FEE_CENTS: int`, `TEST_FEE_CURRENCY: str`, `TEST_IS_VIDEO: bool`
  - `build_test_notification(attorney_id: int) -> dict` — the exact dict inserted into `attorney_notifications`.
  - `build_test_start_response(call_id: str) -> dict` — `{call_id, client_name, practice_area_name, fee_amount_cents, fee_currency, is_video}`.

- [ ] **Step 1: Write the failing test**

Create `/Users/shovansmini/codes/Pronto/backend/tests/test_pronto_test.py`:

```python
from services.pronto_test import (
    TEST_CLIENT_NAME,
    TEST_FEE_CENTS,
    TEST_PRACTICE_AREA,
    build_test_notification,
    build_test_start_response,
)


def test_notification_is_flagged_pronto_test_genre():
    row = build_test_notification(42)
    assert row["attorney_id"] == 42
    assert row["genre"] == "pronto_test"
    assert row["link_type"] == "test_call"
    assert row["link_id"] is None
    # John Doe + DUI must appear so the banner reads like a real request.
    assert TEST_CLIENT_NAME in row["long_description"]
    assert TEST_PRACTICE_AREA in row["long_description"]


def test_notification_has_no_extra_keys():
    # Guard against accidentally writing columns that don't exist / shouldn't be set.
    assert set(build_test_notification(1).keys()) == {
        "attorney_id",
        "genre",
        "short_description",
        "long_description",
        "link_type",
        "link_id",
    }


def test_start_response_shape():
    out = build_test_start_response("abc-123")
    assert out == {
        "call_id": "abc-123",
        "client_name": TEST_CLIENT_NAME,
        "practice_area_name": TEST_PRACTICE_AREA,
        "fee_amount_cents": TEST_FEE_CENTS,
        "fee_currency": "USD",
        "is_video": True,
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/shovansmini/codes/Pronto/backend && python -m pytest tests/test_pronto_test.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'services.pronto_test'`.

- [ ] **Step 3: Write minimal implementation**

Create `/Users/shovansmini/codes/Pronto/backend/services/pronto_test.py`:

```python
"""Pure helpers for the attorney "test call" demo.

The only side effect the test feature is allowed in our DB is inserting the
single notification row built by ``build_test_notification``. Everything here
is pure so it can be unit-tested without Supabase or Daily.
"""

TEST_CLIENT_NAME = "John Doe"
TEST_PRACTICE_AREA = "DUI Defense"
TEST_FEE_CENTS = 25000
TEST_FEE_CURRENCY = "USD"
TEST_IS_VIDEO = True


def build_test_notification(attorney_id: int) -> dict:
    """The single attorney_notifications row a test run is allowed to insert.

    genre='pronto_test' both routes the tap to the test screen and lets the
    notification-list endpoint filter it out of the attorney's real inbox.
    """
    return {
        "attorney_id": int(attorney_id),
        "genre": "pronto_test",
        "short_description": "📞 Pronto! Test Call",
        "long_description": (
            f"{TEST_CLIENT_NAME} requests a {TEST_PRACTICE_AREA} consultation."
        ),
        "link_type": "test_call",
        "link_id": None,
    }


def build_test_start_response(call_id: str) -> dict:
    """Dummy open-request payload the mobile test screen renders."""
    return {
        "call_id": call_id,
        "client_name": TEST_CLIENT_NAME,
        "practice_area_name": TEST_PRACTICE_AREA,
        "fee_amount_cents": TEST_FEE_CENTS,
        "fee_currency": TEST_FEE_CURRENCY,
        "is_video": TEST_IS_VIDEO,
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/shovansmini/codes/Pronto/backend && python -m pytest tests/test_pronto_test.py -q`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
cd /Users/shovansmini/codes/Pronto
git add backend/services/pronto_test.py backend/tests/test_pronto_test.py
git commit -m "feat(pronto): pure helpers for attorney test-call demo"
```

---

## Task 2: Backend — `create_test_call_room` (no-DB Daily room)

**Files:**
- Modify: `/Users/shovansmini/codes/Pronto/backend/services/calls_service.py` (append a new function; reuses existing `_create_daily_room` at lines 67-85 and `_mint_meeting_token` at lines 88-103)
- Test: `/Users/shovansmini/codes/Pronto/backend/tests/test_pronto_test.py` (extend)

**Interfaces:**
- Consumes: `_create_daily_room(is_video: bool) -> {"name","url"}`, `_mint_meeting_token(room_name, user_name) -> str` (existing, private, same module).
- Produces: `create_test_call_room(attorney_name: str, is_video: bool) -> {"daily_room_url": str, "daily_meeting_token": str, "is_video": bool}`.

- [ ] **Step 1: Write the failing test (extend the Task 1 test file)**

Append to `/Users/shovansmini/codes/Pronto/backend/tests/test_pronto_test.py`:

```python
import services.calls_service as cs


def test_create_test_call_room_uses_daily_helpers_and_writes_no_db(monkeypatch):
    calls = {}

    def fake_room(is_video):
        calls["room_video"] = is_video
        return {"name": "pronto-testroom", "url": "https://x.daily.co/pronto-testroom"}

    def fake_token(room_name, user_name):
        calls["token_args"] = (room_name, user_name)
        return "tok_123"

    # If the function touched the DB this would blow up — proves no-DB.
    def boom():
        raise AssertionError("create_test_call_room must not touch Supabase")

    monkeypatch.setattr(cs, "_create_daily_room", fake_room)
    monkeypatch.setattr(cs, "_mint_meeting_token", fake_token)
    monkeypatch.setattr(cs, "get_supabase", boom)

    out = cs.create_test_call_room("Jane Attorney", True)
    assert out == {
        "daily_room_url": "https://x.daily.co/pronto-testroom",
        "daily_meeting_token": "tok_123",
        "is_video": True,
    }
    assert calls["room_video"] is True
    assert calls["token_args"] == ("pronto-testroom", "Jane Attorney")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/shovansmini/codes/Pronto/backend && python -m pytest tests/test_pronto_test.py -q`
Expected: FAIL — `AttributeError: module 'services.calls_service' has no attribute 'create_test_call_room'`.

- [ ] **Step 3: Write minimal implementation**

Append to `/Users/shovansmini/codes/Pronto/backend/services/calls_service.py` (end of file):

```python
def create_test_call_room(attorney_name: str, is_video: bool) -> dict:
    """Mint a real, throwaway Daily room + token for the attorney "test call".

    Reuses the production Daily helpers but performs NO database writes — no
    pronto_calls / pronto_requests rows are created. The room self-expires via
    ROOM_TTL_SECONDS like any other.
    """
    room = _create_daily_room(is_video=is_video)
    token = _mint_meeting_token(room["name"], attorney_name or "Attorney")
    return {
        "daily_room_url": room["url"],
        "daily_meeting_token": token,
        "is_video": bool(is_video),
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/shovansmini/codes/Pronto/backend && python -m pytest tests/test_pronto_test.py -q`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
cd /Users/shovansmini/codes/Pronto
git add backend/services/calls_service.py backend/tests/test_pronto_test.py
git commit -m "feat(pronto): create_test_call_room mints Daily room with no DB writes"
```

---

## Task 3: Backend — `/test/start` + `/test/call` endpoints + hide test notifications

**Files:**
- Modify: `/Users/shovansmini/codes/Pronto/backend/routers/attorney_pronto.py` (imports near lines 1-16; `router = APIRouter(prefix="/attorney/pronto", ...)` at line 52; append endpoints at end of file)
- Modify: `/Users/shovansmini/codes/Pronto/backend/routers/attorney_notifications.py` (the `list_my_notifications` query, the `sb.table("attorney_notifications").select(...).eq("attorney_id", attorney_id).is_("dismissed_at", "null")` chain)

**Interfaces:**
- Consumes: `require_attorney` (returns payload with `attorney_id`), `get_supabase`, `build_test_notification`, `build_test_start_response`, `create_test_call_room`.
- Produces (HTTP, both require `Depends(require_attorney)`):
  - `POST /attorney/pronto/test/start` → `TestStartResponse {call_id, client_name, practice_area_name, fee_amount_cents, fee_currency, is_video}`. Inserts exactly one `attorney_notifications` row.
  - `POST /attorney/pronto/test/call` body `TestCallRequest {call_id: str, is_video: bool}` → `TestCallResponse {call_id, signing_id: null, practice_area_id: null, daily_room_url, daily_meeting_token, is_video, client_name}`. No DB writes.

- [ ] **Step 1: Add imports**

In `/Users/shovansmini/codes/Pronto/backend/routers/attorney_pronto.py`, add to the import block (after `import logging` / alongside existing service imports near lines 1-16):

```python
import uuid

from services.calls_service import create_test_call_room
from services.pronto_test import build_test_notification, build_test_start_response
from services.pronto_test import TEST_CLIENT_NAME
```

- [ ] **Step 2: Append the endpoints**

At the END of `/Users/shovansmini/codes/Pronto/backend/routers/attorney_pronto.py`:

```python
# ---------------------------------------------------------------------------
# Attorney "test call" demo — for not-yet-enabled attorneys to preview Pronto.
# The ONLY DB write here is a single (hidden) attorney_notifications row.
# ---------------------------------------------------------------------------

class TestStartResponse(BaseModel):
    call_id: str
    client_name: str
    practice_area_name: str
    fee_amount_cents: int
    fee_currency: str
    is_video: bool


class TestCallRequest(BaseModel):
    call_id: str
    is_video: bool = True


class TestCallResponse(BaseModel):
    call_id: str
    signing_id: int | None = None
    practice_area_id: int | None = None
    daily_room_url: str
    daily_meeting_token: str
    is_video: bool
    client_name: str


@router.post("/test/start", response_model=TestStartResponse)
async def start_test_call(payload: dict = Depends(require_attorney)):
    """Fire the real push banner (one notification row) and return the dummy
    open-request payload the mobile test screen renders."""
    attorney_id = int(payload["attorney_id"])
    sb = get_supabase()
    sb.table("attorney_notifications").insert(
        build_test_notification(attorney_id)
    ).execute()
    call_id = str(uuid.uuid4())
    return TestStartResponse(**build_test_start_response(call_id))


@router.post("/test/call", response_model=TestCallResponse)
async def start_test_call_room(
    body: TestCallRequest, payload: dict = Depends(require_attorney)
):
    """Mint a real (throwaway) Daily room/token for the test call. No DB writes."""
    attorney_id = int(payload["attorney_id"])
    att = (
        get_supabase()
        .table("attorneys")
        .select("full_name")
        .eq("id", attorney_id)
        .limit(1)
        .execute()
    )
    rows = att.data or []
    attorney_name = (rows[0].get("full_name") if rows else "") or "Attorney"
    room = create_test_call_room(attorney_name, body.is_video)
    return TestCallResponse(
        call_id=body.call_id,
        signing_id=None,
        practice_area_id=None,
        daily_room_url=room["daily_room_url"],
        daily_meeting_token=room["daily_meeting_token"],
        is_video=room["is_video"],
        client_name=TEST_CLIENT_NAME,
    )
```

- [ ] **Step 3: Hide test notifications from the real inbox**

In `/Users/shovansmini/codes/Pronto/backend/routers/attorney_notifications.py`, find the `list_my_notifications` query (the chain `.select(NOTIFICATION_COLS).eq("attorney_id", attorney_id).is_("dismissed_at", "null")`) and insert a `.neq` immediately after the `.is_("dismissed_at", "null")` line:

```python
        .is_("dismissed_at", "null")
        .neq("genre", "pronto_test")
```

(If an unread-count query in the same file also reads `attorney_notifications`, add the same `.neq("genre", "pronto_test")` there too.)

- [ ] **Step 4: Verify syntax + existing tests still pass**

Run: `cd /Users/shovansmini/codes/Pronto/backend && python -c "import routers.attorney_pronto, routers.attorney_notifications" && python -m pytest -q`
Expected: imports succeed (no SyntaxError); pytest reports all existing tests still passing.

- [ ] **Step 5: Manual smoke test against dev backend**

With the dev Pronto backend running and a valid attorney access token in `$TOK`:

```bash
curl -s -X POST "$PRONTO_API_URL/attorney/pronto/test/start" -H "Authorization: Bearer $TOK" | python -m json.tool
# Expect: {call_id, client_name:"John Doe", practice_area_name:"DUI Defense", ...}
curl -s -X POST "$PRONTO_API_URL/attorney/pronto/test/call" -H "Authorization: Bearer $TOK" \
  -H "Content-Type: application/json" -d '{"call_id":"<paste call_id>","is_video":true}' | python -m json.tool
# Expect: {daily_room_url, daily_meeting_token, client_name:"John Doe", ...}
```
Then confirm in the DB that exactly ONE new `attorney_notifications` row (genre `pronto_test`) was created and NO `pronto_calls`/`pronto_requests` rows.

- [ ] **Step 6: Commit**

```bash
cd /Users/shovansmini/codes/Pronto
git add backend/routers/attorney_pronto.py backend/routers/attorney_notifications.py
git commit -m "feat(pronto): /test/start + /test/call endpoints (single hidden notif, no other DB writes)"
```

---

## Task 4: Mobile — `pronto.ts` client functions

**Files:**
- Modify: `/Users/shovansmini/codes/Geniuslaw_Attorney_App/mobile/lib/pronto.ts` (append after the `AcceptProntoCallResult` block near line 339, or at end of file)

**Interfaces:**
- Consumes: existing `request<T>` helper, `AcceptProntoCallResult` type (lines 331-339).
- Produces:
  - `type TestCallStart = {call_id; client_name; practice_area_name; fee_amount_cents; fee_currency; is_video}`
  - `startProntoTest(): Promise<Result<TestCallStart>>` → `POST /attorney/pronto/test/start`
  - `startProntoTestCall(callId: string, isVideo: boolean): Promise<Result<AcceptProntoCallResult>>` → `POST /attorney/pronto/test/call`

- [ ] **Step 1: Add the type + functions**

Append to `/Users/shovansmini/codes/Geniuslaw_Attorney_App/mobile/lib/pronto.ts`:

```typescript
// ---------------------------------------------------------------------------
// Attorney "test call" demo (pre-enrollment preview). Backend writes only a
// single hidden notification row; the room is a throwaway Daily room.
// ---------------------------------------------------------------------------

export type TestCallStart = {
  call_id: string;
  client_name: string;
  practice_area_name: string;
  fee_amount_cents: number;
  fee_currency: string;
  is_video: boolean;
};

export async function startProntoTest(): Promise<Result<TestCallStart>> {
  return request<TestCallStart>('POST', '/attorney/pronto/test/start');
}

export async function startProntoTestCall(
  callId: string,
  isVideo: boolean,
): Promise<Result<AcceptProntoCallResult>> {
  return request<AcceptProntoCallResult>('POST', '/attorney/pronto/test/call', {
    call_id: callId,
    is_video: isVideo,
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/shovansmini/codes/Geniuslaw_Attorney_App/mobile && npx tsc --noEmit`
Expected: no new errors referencing `pronto.ts`.

- [ ] **Step 3: Commit**

```bash
cd /Users/shovansmini/codes/Geniuslaw_Attorney_App
git add mobile/lib/pronto.ts
git commit -m "feat(mobile): pronto test-call client functions"
```

---

## Task 5: Mobile — `lib/testCall.ts` registry + ring + answer handler

**Files:**
- Create: `/Users/shovansmini/codes/Geniuslaw_Attorney_App/mobile/lib/testCall.ts`

**Interfaces:**
- Consumes: `startProntoTestCall` (Task 4); `router` from `expo-router`; `react-native-callkeep` (lazy require).
- Produces:
  - `markTestCall(callUUID: string, info: {isVideo: boolean; clientName: string}): void`
  - `isTestCall(callUUID: string): boolean`
  - `clearTestCall(callUUID: string): void`
  - `displayTestIncomingCall(callUUID: string, callerName: string, isVideo: boolean): void`
  - `handleTestCallAnswer(callUUID: string): Promise<void>` — mints the test room and navigates to `/(auth)/calls/[id]` with `test=1`.

- [ ] **Step 1: Create the module**

Create `/Users/shovansmini/codes/Geniuslaw_Attorney_App/mobile/lib/testCall.ts`:

```typescript
import { router } from 'expo-router';
import { Alert } from 'react-native';

import { startProntoTestCall } from './pronto';

// In-memory registry of CallKit UUIDs that belong to the test-call demo. The
// global answerCall/endCall listeners in callKit.ts consult this so a test
// ring never hits the real accept/decline backend endpoints.
type TestCallInfo = { isVideo: boolean; clientName: string };
const TEST_CALLS = new Map<string, TestCallInfo>();

export function markTestCall(callUUID: string, info: TestCallInfo): void {
  TEST_CALLS.set(callUUID, info);
}

export function isTestCall(callUUID: string): boolean {
  return TEST_CALLS.has(callUUID);
}

export function clearTestCall(callUUID: string): void {
  TEST_CALLS.delete(callUUID);
}

/**
 * Show a real native CallKit / ConnectionService incoming-call screen locally
 * (no push). Requires RNCallKeep.setup() to have run — initCallKit() does this
 * on auth-layout mount for every signed-in user, so it's available pre-enrollment.
 */
export function displayTestIncomingCall(
  callUUID: string,
  callerName: string,
  isVideo: boolean,
): void {
  let RNCallKeep: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    RNCallKeep = require('react-native-callkeep').default;
  } catch (e) {
    console.warn('[testCall] callkeep require failed', e);
    return;
  }
  if (!RNCallKeep) return;
  try {
    RNCallKeep.displayIncomingCall(callUUID, callerName, callerName, 'generic', isVideo);
  } catch (e) {
    console.warn('[testCall] displayIncomingCall failed', e);
  }
}

/**
 * Called from the global CallKit answerCall handler when the answered UUID is
 * a test call. Mints the throwaway Daily room and routes into the call screen
 * in test mode. Caller is responsible for releasing the CallKit entry
 * (callKit.ts calls endCallKit after this resolves).
 */
export async function handleTestCallAnswer(callUUID: string): Promise<void> {
  const info = TEST_CALLS.get(callUUID);
  clearTestCall(callUUID);
  const isVideo = info?.isVideo ?? true;
  const name = info?.clientName ?? 'John Doe';

  const res = await startProntoTestCall(callUUID, isVideo);
  if (!res.ok) {
    Alert.alert('Test call failed', res.message);
    return;
  }
  router.push({
    pathname: '/(auth)/calls/[id]',
    params: {
      id: res.data.call_id,
      url: res.data.daily_room_url,
      token: res.data.daily_meeting_token,
      name,
      video: isVideo ? '1' : '0',
      pronto: '1',
      test: '1',
    },
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/shovansmini/codes/Geniuslaw_Attorney_App/mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/shovansmini/codes/Geniuslaw_Attorney_App
git add mobile/lib/testCall.ts
git commit -m "feat(mobile): test-call registry, local CallKit ring, answer handler"
```

---

## Task 6: Mobile — branch CallKit handlers to the test path

**Files:**
- Modify: `/Users/shovansmini/codes/Geniuslaw_Attorney_App/mobile/lib/callKit.ts` (iOS `answerCall` listener at lines 91-111; iOS `endCall` listener at lines 113-120; Android `handleAnswer` at lines 208-244; Android `handleEnd` at lines 246-258)

**Interfaces:**
- Consumes: `isTestCall`, `handleTestCallAnswer`, `clearTestCall` from `./testCall`; existing `endCallKit` (same module, line 393).

- [ ] **Step 1: Add the import**

In `/Users/shovansmini/codes/Geniuslaw_Attorney_App/mobile/lib/callKit.ts`, after the existing `import { acceptProntoCall, ... } from './pronto';` block (lines 4-9), add:

```typescript
import { clearTestCall, handleTestCallAnswer, isTestCall } from './testCall';
```

- [ ] **Step 2: Branch the iOS answerCall handler**

Replace the opening of the iOS listener (line 91):

```typescript
  RNCallKeep.addEventListener('answerCall', async ({ callUUID }: { callUUID: string }) => {
    console.log('[callKit] answerCall', callUUID);
    try {
      const res = await acceptProntoCall(callUUID);
```

with:

```typescript
  RNCallKeep.addEventListener('answerCall', async ({ callUUID }: { callUUID: string }) => {
    console.log('[callKit] answerCall', callUUID);
    if (isTestCall(callUUID)) {
      await handleTestCallAnswer(callUUID);
      endCallKit(callUUID);
      return;
    }
    try {
      const res = await acceptProntoCall(callUUID);
```

- [ ] **Step 3: Branch the iOS endCall handler**

Replace (line 113):

```typescript
  RNCallKeep.addEventListener('endCall', async ({ callUUID }: { callUUID: string }) => {
    console.log('[callKit] endCall', callUUID);
    try {
      await endProntoCall(callUUID, 'declined');
```

with:

```typescript
  RNCallKeep.addEventListener('endCall', async ({ callUUID }: { callUUID: string }) => {
    console.log('[callKit] endCall', callUUID);
    if (isTestCall(callUUID)) {
      clearTestCall(callUUID);
      return;
    }
    try {
      await endProntoCall(callUUID, 'declined');
```

- [ ] **Step 4: Branch the Android handleAnswer**

Replace the opening of `handleAnswer` (line 208):

```typescript
  const handleAnswer = async (callUUID: string) => {
    console.log('[callKit] (android) answerCall', callUUID);
    try {
      RNCallKeep.backToForeground();
```

with:

```typescript
  const handleAnswer = async (callUUID: string) => {
    console.log('[callKit] (android) answerCall', callUUID);
    if (isTestCall(callUUID)) {
      try { RNCallKeep.backToForeground(); } catch {}
      try { RNCallKeep.setCurrentCallActive(callUUID); } catch {}
      await handleTestCallAnswer(callUUID);
      try { RNCallKeep.endCall(callUUID); } catch {}
      return;
    }
    try {
      RNCallKeep.backToForeground();
```

- [ ] **Step 5: Branch the Android handleEnd**

Replace the opening of `handleEnd` (line 246):

```typescript
  const handleEnd = async (callUUID: string) => {
    if (acceptedCallUUIDs.has(callUUID)) {
```

with:

```typescript
  const handleEnd = async (callUUID: string) => {
    if (isTestCall(callUUID)) {
      clearTestCall(callUUID);
      return;
    }
    if (acceptedCallUUIDs.has(callUUID)) {
```

- [ ] **Step 6: Typecheck**

Run: `cd /Users/shovansmini/codes/Geniuslaw_Attorney_App/mobile && npx tsc --noEmit`
Expected: no new errors. (Note: `endCallKit` is defined later in the same module — calling it inside the iOS listener is a hoisted `function` declaration, so it resolves.)

- [ ] **Step 7: Commit**

```bash
cd /Users/shovansmini/codes/Geniuslaw_Attorney_App
git add mobile/lib/callKit.ts
git commit -m "feat(mobile): route test-call CallKit answer/decline to the test path"
```

---

## Task 7: Mobile — `calls/[id].tsx` test mode

**Files:**
- Modify: `/Users/shovansmini/codes/Geniuslaw_Attorney_App/mobile/app/(auth)/calls/[id].tsx` (params at lines 38-51; status-poll effect at lines 137-172; `reportEnded` at lines 73-113; `onJoined` at lines 187-190; render block lines 316-399)

**Interfaces:**
- Consumes: route param `test` ('1' for test mode).

- [ ] **Step 1: Parse the `test` param**

In the `useLocalSearchParams` generic (lines 38-45), add `test?: string;`, then after line 51 (`const isPronto = params.pronto === '1';`) add:

```typescript
  const isTest = params.test === '1';
```

- [ ] **Step 2: Short-circuit `reportEnded` for test calls**

In `reportEnded` (lines 73-113), immediately after `endingRef.current = true;` and `setStatus('ended');` (lines 76-77), add — before the `const wasConnected` line:

```typescript
      if (isTest) {
        router.back();
        return;
      }
```

Then add `isTest` to the `useCallback` dependency array on line 112: `[callId, calleeName, isPronto, isTest]`.

- [ ] **Step 3: Disable status polling in test mode**

In the polling effect (lines 137-172), add as the FIRST statement inside the effect body (before `if (status === 'connected' || status === 'ended') return;`):

```typescript
    if (isTest) return; // test rooms are solo; no server-side call status to poll
```

Then add `isTest` to that effect's dependency array (line 172): `[callId, status, reportEnded, isPronto, isTest]`.

- [ ] **Step 4: Simulate "connected" on join in test mode**

Replace `onJoined` (lines 187-190):

```typescript
    const onJoined = () => {
      setStatus('ringing');
      syncParticipants(co);
    };
```

with:

```typescript
    const onJoined = () => {
      syncParticipants(co);
      if (isTest) {
        // Solo test room: no remote ever joins, so simulate a connected call
        // (label + running timer) the moment we're in the room.
        connectedAtRef.current = Date.now();
        setStatus('connected');
        elapsedTimerRef.current = setInterval(() => {
          if (connectedAtRef.current) {
            setElapsedSec(Math.floor((Date.now() - connectedAtRef.current) / 1000));
          }
        }, 1000);
        return;
      }
      setStatus('ringing');
    };
```

Then add `isTest` to the Daily-setup effect dependency array (line 267): `[roomUrl, meetingToken, isVideoCall, syncParticipants, isTest]`.

- [ ] **Step 5: Show self as the main tile + a TEST MODE badge**

Replace the existing `showRemoteVideo` / `showLocalVideo` declarations (lines 309-314):

```typescript
  const showRemoteVideo =
    isVideoCall &&
    remoteParticipant?.videoTrack &&
    remoteParticipant?.video !== false;
  const showLocalVideo =
    isVideoCall && localParticipant?.videoTrack && !cameraOff;
```

with (note `showSelfAsMain` is declared FIRST so the others can reference it):

```typescript
  // In a solo test room there is no remote participant, so promote the
  // attorney's own camera to the full-screen tile (otherwise they'd only see
  // the placeholder avatar and a tiny PiP of themselves).
  const showSelfAsMain =
    isTest && isVideoCall && !!localParticipant?.videoTrack && !cameraOff;
  const showRemoteVideo =
    !isTest &&
    isVideoCall &&
    remoteParticipant?.videoTrack &&
    remoteParticipant?.video !== false;
  const showLocalVideo =
    isVideoCall && localParticipant?.videoTrack && !cameraOff && !showSelfAsMain;
```

Then, immediately inside the `<SafeAreaView ...>` (after the opening tag on line 320, before the remote-video block), add the self-as-main tile and the TEST MODE badge:

```tsx
      {showSelfAsMain ? (
        <View style={StyleSheet.absoluteFill}>
          <DailyMediaView
            videoTrack={localParticipant!.videoTrack as any}
            audioTrack={null}
            objectFit="cover"
            mirror
            zOrder={0}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.topScrim} />
        </View>
      ) : null}

      {isTest ? (
        <View style={styles.testBadge} pointerEvents="none">
          <Text style={styles.testBadgeText}>TEST MODE</Text>
        </View>
      ) : null}
```

Add these styles to the `StyleSheet.create({...})` block (after `endIcon`, line 663):

```typescript
  testBadge: {
    position: 'absolute',
    top: spacing.xl,
    alignSelf: 'center',
    zIndex: 20,
    backgroundColor: 'rgba(201,168,76,0.92)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  testBadgeText: {
    color: '#0B0F1A',
    fontSize: 12,
    letterSpacing: 1,
    fontWeight: '700',
  },
```

- [ ] **Step 6: Typecheck**

Run: `cd /Users/shovansmini/codes/Geniuslaw_Attorney_App/mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/shovansmini/codes/Geniuslaw_Attorney_App
git add "mobile/app/(auth)/calls/[id].tsx"
git commit -m "feat(mobile): test mode for the Daily call screen (no polling/wrap-up, self-view, badge)"
```

---

## Task 8: Mobile — the `pronto-test` screen

**Files:**
- Create: `/Users/shovansmini/codes/Geniuslaw_Attorney_App/mobile/app/(auth)/pronto-test.tsx`

**Interfaces:**
- Consumes: `startProntoTest`, `TestCallStart` (Task 4); `markTestCall`, `displayTestIncomingCall` (Task 5); theme tokens.

- [ ] **Step 1: Create the screen**

Create `/Users/shovansmini/codes/Geniuslaw_Attorney_App/mobile/app/(auth)/pronto-test.tsx`:

```tsx
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fonts, radius, spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { startProntoTest, type TestCallStart } from '../../lib/pronto';
import { displayTestIncomingCall, markTestCall } from '../../lib/testCall';

type Phase = 'idle' | 'request' | 'ringing';

function formatMoney(cents: number, currency: string): string {
  const sym = (currency || 'USD').toUpperCase() === 'USD' ? '$' : `${currency} `;
  return `${sym}${((cents || 0) / 100).toFixed(2)}`;
}

export default function ProntoTestScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [starting, setStarting] = useState(false);
  const [start, setStart] = useState<TestCallStart | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Reset to a clean state whenever the screen regains focus (e.g. returning
  // from the test call) so the demo is re-runnable.
  useFocusEffect(
    useCallback(() => {
      return () => {
        timers.current.forEach(clearTimeout);
        timers.current = [];
      };
    }, []),
  );

  const onStart = useCallback(async () => {
    if (starting) return;
    setStarting(true);
    const res = await startProntoTest();
    setStarting(false);
    if (!res.ok) {
      Alert.alert('Could not start test', res.message);
      return;
    }
    setStart(res.data);
    // Mirror the real flow: a beat after the push fires, the open request lands.
    const t = setTimeout(() => setPhase('request'), 1500);
    timers.current.push(t);
  }, [starting]);

  const onAccept = useCallback(() => {
    if (!start) return;
    setPhase('ringing');
    markTestCall(start.call_id, {
      isVideo: start.is_video,
      clientName: start.client_name,
    });
    // Short delay, then the real native CallKit ring appears.
    const t = setTimeout(() => {
      displayTestIncomingCall(start.call_id, start.client_name, start.is_video);
    }, 1200);
    timers.current.push(t);
  }, [start]);

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.titleWrap}>
          <Text style={[styles.eyebrow, { color: colors.accent, fontFamily: fonts.sansBold }]}>
            TEST MODE
          </Text>
          <Text style={[styles.title, { color: colors.text, fontFamily: fonts.heading }]}>
            Try a test call
          </Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Replica of the "you're all set" card */}
        <Animated.View
          entering={FadeInUp.duration(400)}
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.accentBorder }]}
        >
          <View
            style={[
              styles.badge,
              { backgroundColor: 'rgba(76,175,125,0.12)', borderColor: 'rgba(76,175,125,0.40)' },
            ]}
          >
            <Ionicons name="call" size={40} color={colors.success} />
          </View>
          <Text style={[styles.cardTitle, { color: colors.text, fontFamily: fonts.heading }]}>
            Preview a Pronto call
          </Text>
          <Text style={[styles.cardHint, { color: colors.textMuted, fontFamily: fonts.sans }]}>
            This is a safe walkthrough — no real client is involved. You&apos;ll get a
            notification, an incoming request, and a real call you can join.
          </Text>

          {phase === 'idle' ? (
            <Pressable
              onPress={onStart}
              disabled={starting}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: colors.accent, opacity: starting ? 0.6 : pressed ? 0.85 : 1 },
              ]}
            >
              {starting ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={[styles.primaryBtnLabel, { color: colors.background, fontFamily: fonts.sansBold }]}>
                  Start test call
                </Text>
              )}
            </Pressable>
          ) : (
            <Text style={[styles.waiting, { color: colors.textMuted, fontFamily: fonts.sansMedium }]}>
              {phase === 'request'
                ? 'A test request just came in below.'
                : 'Calling you now — answer the incoming call.'}
            </Text>
          )}
        </Animated.View>

        {/* Fake open request card — mirrors the real first-come card */}
        {phase !== 'idle' && start ? (
          <Animated.View entering={FadeInDown.duration(400)} style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted, fontFamily: fonts.sansBold }]}>
              Open request (1)
            </Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.success }]}>
              <Text style={[styles.cardTitle, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
                {start.client_name}
              </Text>
              <Text style={[styles.cardHint, { color: colors.textMuted, fontFamily: fonts.sans }]}>
                {start.practice_area_name}
              </Text>
              <Text style={[styles.fee, { color: colors.accent, fontFamily: fonts.sansBold }]}>
                {formatMoney(start.fee_amount_cents, start.fee_currency)}
              </Text>
              <Pressable
                onPress={onAccept}
                disabled={phase === 'ringing'}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: colors.success, opacity: phase === 'ringing' ? 0.6 : pressed ? 0.85 : 1 },
                ]}
              >
                {phase === 'ringing' ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <Text style={[styles.primaryBtnLabel, { color: colors.background, fontFamily: fonts.sansBold }]}>
                    Accept
                  </Text>
                )}
              </Pressable>
            </View>
          </Animated.View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { flex: 1, alignItems: 'center' },
  eyebrow: { fontSize: 11, letterSpacing: 1.5 },
  title: { fontSize: 20 },
  scroll: { padding: spacing.lg, gap: spacing.lg },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  cardTitle: { fontSize: 18, textAlign: 'center' },
  cardHint: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  fee: { fontSize: 22, marginTop: spacing.xs },
  waiting: { fontSize: 14, textAlign: 'center', marginTop: spacing.sm },
  primaryBtn: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    marginTop: spacing.md,
    alignSelf: 'stretch',
  },
  primaryBtnLabel: { fontSize: 15 },
  section: { gap: spacing.sm },
  sectionLabel: { fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
});
```

- [ ] **Step 2: Typecheck**

Run: `cd /Users/shovansmini/codes/Geniuslaw_Attorney_App/mobile && npx tsc --noEmit`
Expected: no new errors. (If `useFocusEffect`/`FadeInDown` imports are reported unused, leave them — they're used in the JSX.)

- [ ] **Step 3: Commit**

```bash
cd /Users/shovansmini/codes/Geniuslaw_Attorney_App
git add "mobile/app/(auth)/pronto-test.tsx"
git commit -m "feat(mobile): pronto-test screen with scripted demo flow"
```

---

## Task 9: Mobile — entry point button + notification routing

**Files:**
- Create: `/Users/shovansmini/codes/Geniuslaw_Attorney_App/mobile/components/TestCallEntry.tsx`
- Modify: `/Users/shovansmini/codes/Geniuslaw_Attorney_App/mobile/app/(auth)/pronto.tsx` (the `!enrolled && onboardingComplete` branch — actual lines ~475-496; the `!enrolled` branch — actual lines ~497-523)
- Modify: `/Users/shovansmini/codes/Geniuslaw_Attorney_App/mobile/app/(auth)/pronto-onboarding.tsx` (sticky footer — actual lines ~566-587)
- Modify: `/Users/shovansmini/codes/Geniuslaw_Attorney_App/mobile/lib/notifications.ts` (`routeFromNotificationData`, lines 168-172)

**Interfaces:**
- Produces: `TestCallEntry` React component (default-less named export) that navigates to `/(auth)/pronto-test`.

- [ ] **Step 1: Create the button component**

Create `/Users/shovansmini/codes/Geniuslaw_Attorney_App/mobile/components/TestCallEntry.tsx`:

```tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts, radius, spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

export function TestCallEntry() {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push('/(auth)/pronto-test' as never)}
      style={({ pressed }) => [
        styles.btn,
        { borderColor: colors.accentBorder, backgroundColor: colors.accentTint, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Ionicons name="call-outline" size={20} color={colors.accent} />
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: colors.text, fontFamily: fonts.sansSemiBold }]}>
          Try a test call
        </Text>
        <Text style={[styles.sub, { color: colors.textMuted, fontFamily: fonts.sans }]}>
          See exactly how a Pronto call works — no client involved.
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  textWrap: { flex: 1 },
  title: { fontSize: 15 },
  sub: { fontSize: 12, marginTop: 2 },
});
```

- [ ] **Step 2: Render it in the Pronto "all set / waiting" branch**

In `/Users/shovansmini/codes/Geniuslaw_Attorney_App/mobile/app/(auth)/pronto.tsx`, add the import near the other component imports at the top of the file:

```typescript
import { TestCallEntry } from '../../components/TestCallEntry';
```

The `!enrolled && onboardingComplete` branch currently renders a single `<Animated.View ... style={[styles.allSetCard, ...]}>...</Animated.View>`. Wrap that branch's content in a fragment and append the entry button. Replace the branch body so it reads:

```tsx
        ) : !enrolled && onboardingComplete ? (
          <>
            <Animated.View
              entering={FadeInUp.delay(60).duration(500).easing(Easing.out(Easing.cubic))}
              style={[styles.allSetCard, { backgroundColor: colors.card, borderColor: colors.accentBorder }]}
            >
              {/* ...existing all-set card contents unchanged... */}
            </Animated.View>
            <View style={{ marginTop: spacing.md }}>
              <TestCallEntry />
            </View>
          </>
        ) : !enrolled ? (
```

(Keep the existing `allSetBadge` / `allSetTitle` / `allSetHint` children verbatim inside the `Animated.View`.)

- [ ] **Step 3: Render it in the Pronto "not enrolled" branch**

In the same file, the `!enrolled` branch renders a single `<Animated.View ... style={[styles.card, ...]}>` ending with the "Get Pronto access" button. Wrap it in a fragment and append the entry button after the closing `</Animated.View>`:

```tsx
        ) : !enrolled ? (
          <>
            <Animated.View
              entering={FadeInUp.delay(60).duration(500).easing(Easing.out(Easing.cubic))}
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            >
              {/* ...existing "Not enrolled" card contents unchanged... */}
            </Animated.View>
            <View style={{ marginTop: spacing.md }}>
              <TestCallEntry />
            </View>
          </>
        ) : (
```

- [ ] **Step 4: Render it in the onboarding sticky footer**

In `/Users/shovansmini/codes/Geniuslaw_Attorney_App/mobile/app/(auth)/pronto-onboarding.tsx`, add the import near the other component imports (alongside `PracticeAreaPicker` on line 19):

```typescript
import { TestCallEntry } from '../../components/TestCallEntry';
```

In the sticky footer block (the `<View style={[styles.footer, ...]}>` at ~line 566), add `<TestCallEntry />` as the FIRST child, before the `{message ? ... : null}` line:

```tsx
          <View style={[styles.footer, { borderTopColor: colors.cardBorder }]}>
            <View style={{ marginBottom: spacing.md }}>
              <TestCallEntry />
            </View>
            {message ? (
```

- [ ] **Step 5: Route test-notification taps to the test screen**

In `/Users/shovansmini/codes/Geniuslaw_Attorney_App/mobile/lib/notifications.ts`, replace `routeFromNotificationData` (lines 168-172):

```typescript
export function routeFromNotificationData(router: Router, _data: NotificationData): void {
  // v1: every Pronto notification routes to the Pronto tab. Sub-routing
  // (e.g. signing → /signings/:id) can be added when more genres land.
  router.push('/(auth)/pronto' as never);
}
```

with:

```typescript
export function routeFromNotificationData(router: Router, _data: NotificationData): void {
  // Test-call demo notifications open the dedicated test screen.
  if (_data.genre === 'pronto_test') {
    router.push('/(auth)/pronto-test' as never);
    return;
  }
  // v1: every other Pronto notification routes to the Pronto tab. Sub-routing
  // (e.g. signing → /signings/:id) can be added when more genres land.
  router.push('/(auth)/pronto' as never);
}
```

- [ ] **Step 6: Typecheck**

Run: `cd /Users/shovansmini/codes/Geniuslaw_Attorney_App/mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
cd /Users/shovansmini/codes/Geniuslaw_Attorney_App
git add "mobile/components/TestCallEntry.tsx" "mobile/app/(auth)/pronto.tsx" "mobile/app/(auth)/pronto-onboarding.tsx" mobile/lib/notifications.ts
git commit -m "feat(mobile): test-call entry button (pre-enrollment) + notification routing"
```

---

## Task 10: Full manual device verification

**Files:** none (verification only). Requires a real EAS / `expo run` dev build on a physical device (CallKit + Daily + push do not work in Expo Go or simulators).

- [ ] **Step 1: Pre-enrollment entry point visibility**

Sign in as an attorney with `pronto_enabled = false`. Confirm "Try a test call" appears: (a) on the Pronto tab when not enrolled, (b) on the Pronto tab in the "You're all set / waiting" state, and (c) in the onboarding footer. Then confirm it is ABSENT once `pronto_enabled = true`.

- [ ] **Step 2: Notification banner**

Open the test screen, tap **Start test call**, background the app. Confirm a real OS banner "📞 Pronto! Test Call — John Doe requests a DUI Defense consultation." appears. Tap it → app opens the `pronto-test` screen. Confirm this notification does NOT appear in the attorney's in-app notification list.

- [ ] **Step 3: Request → ring → join**

Back in the test screen, confirm the fake open-request card (John Doe / DUI Defense / $250.00) appears, tap **Accept**, and confirm a real native CallKit/incoming-call screen rings. Tap Accept on the native UI → the call screen opens in TEST MODE showing your own camera full-screen, "John Doe" label, a running timer, and a TEST MODE badge.

- [ ] **Step 4: Decline path**

Repeat to the ring, then tap **Decline** on the native UI. Confirm you return to the test screen with no crash and no call screen.

- [ ] **Step 5: End + re-run**

In the test call, tap End. Confirm you return cleanly (NO wrap-up "Did you complete?" modal — that's the real-call path). Re-run the whole flow to confirm it's repeatable.

- [ ] **Step 6: No DB side effects**

After several test runs, query the DB: confirm only `attorney_notifications` rows with `genre = 'pronto_test'` were added, and NO new `pronto_calls`, `pronto_requests`, `cases`, `orders`, or `transactions` rows exist.

---

## Notes for the implementer

- **Why a UUID from the backend:** iOS CallKit requires `callUUID` to be a valid UUID. `/test/start` returns `call_id = str(uuid.uuid4())`; the mobile side uses it verbatim for `displayIncomingCall`. Do not synthesize the UUID on-device.
- **Why `endCallKit` in the iOS answer branch:** after answering, the native CallKit entry must be released or iOS throttles future calls; the real push flow relies on the OS, but the local test ring must release it explicitly.
- **Dev-client requirement:** if `initCallKit` logs "native modules not in this binary," the ring won't show — the build predates the CallKit native modules. Use a proper EAS / `expo run:ios|android` build.
- **`pronto: '1'` AND `test: '1'`:** both are passed to the call screen; `isTest` short-circuits every place `isPronto` would trigger a backend call, so no real endpoints are hit.
```
