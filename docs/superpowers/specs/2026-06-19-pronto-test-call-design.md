# Pronto Test Call — Design

**Date:** 2026-06-19
**App:** Geniuslaw Attorney App (mobile + Pronto backend)
**Status:** Approved design — ready for implementation planning

## Purpose

Give attorneys a **demo / walkthrough** of the Pronto incoming-call experience *before*
they are live, so the first real call is never a surprise. The test mirrors the real
flow — request notification → open request → incoming call → join room — using the real
UI components fed mostly mocked data, plus two genuinely real touches: a **real OS push
banner** and a **real Daily.co room** (so camera/mic actually work).

It is a demo, **not** a device diagnostic. It must create **no real business data**.

## Key Decisions

| Decision | Choice |
|---|---|
| Primary purpose | Demo / walkthrough (mostly client-side, mocked) |
| Request notification | **Real OS banner** — backend inserts a row in the attorney notifications table; existing dispatcher pushes it |
| Incoming call | **Real local CallKit ring** via `RNCallKeep.displayIncomingCall` (Option A — local trigger, not push-initiated) |
| Call room | **Real Daily.co room, solo** — backend mints room + token; attorney sees own AV, fake "John Doe" label + placeholder client tile |
| Entry point | Visible **anytime `pronto_enabled === false`** (onboarding steps + "you're all set / waiting" screen); disappears when staff sets `pronto_enabled = true` |
| Test mode labeling | **"TEST MODE"** badge on the test screen and the test call room |
| Re-runnable | Yes — unlimited while not enabled |

## Flow

1. Attorney sees a **"Try a test call"** button/banner anywhere `pronto_enabled === false`.
2. Taps it → lands on **`pronto-test`**, a screen visually replicating the main Pronto
   "you're all set" UI but badged **TEST MODE**, with a **"Start test call"** button.
3. Taps Start → app calls `POST /attorney/pronto/test/start` → backend inserts a test
   notification row → dispatcher fires a **real OS banner**: *"John Doe requests DUI
   consultation."* Returns the dummy request payload.
4. After a short scripted delay, a **fake open-request card** appears (real card
   component, dummy data: John Doe / DUI / $X) in client state only.
5. Attorney taps **Accept** → brief "connecting" → app triggers a **real local CallKit
   ring** via `RNCallKeep.displayIncomingCall(testCallId, "John Doe", isVideo)`.
6. **Accept** on the native ring → existing `answerCall` event fires → app calls
   `POST /attorney/pronto/test/call` → backend mints a **real Daily room + token** →
   navigates to `calls/[id].tsx` in **test mode**. **Decline** → back to the test screen.
7. In the room: own camera/mic working, "John Doe" label, placeholder client tile,
   **TEST MODE** badge. **End** returns to the test screen — **no wrap-up, no real-call
   status polling**.

## Components & Files

### Mobile — new
- `mobile/app/(auth)/pronto-test.tsx` — the test screen: replica of the all-set Pronto UI
  (TEST MODE badge) + scripted state machine driving fake request → CallKit ring → join.
- A small reusable **"Try a test call"** button/banner component, placed in the onboarding
  screens and the waiting screen wherever `pronto_enabled === false`.

### Mobile — modified
- `mobile/app/(auth)/calls/[id].tsx` — add a `test` route flag. In test mode: **skip**
  `getProntoCallStatus` polling and `wrapUpProntoCall` / `end` calls; just join the room;
  **End** navigates back to `pronto-test`. Show TEST MODE badge.
- `mobile/lib/pronto.ts` — add `startProntoTest()` and `startProntoTestCall()` client
  functions.
- `mobile/lib/notifications.ts` — route the test notification tap to `pronto-test` via a
  distinct `link_type`/genre (e.g. `test_call`).
- CallKit answer/decline wiring — reuse existing `RNCallKeep` event handlers; in test mode,
  answer mints the test room and routes to `calls/[id].tsx?test=1`, decline returns to
  `pronto-test`.

### Backend (Pronto) — new, small
- `POST /attorney/pronto/test/start` — insert a test notification row (flagged, e.g.
  `genre = "test"`) so the existing dispatcher pushes the banner. Return the dummy request
  payload the screen displays. **No** request/call/case/order rows.
- `POST /attorney/pronto/test/call` — create a real Daily room with a short `exp`
  (~15 min) + meeting token; return an `AcceptProntoCallResult`-shaped payload. **No** DB
  call/case/order/payment records.

## Data Flow & No-Side-Effects Guarantees

- **The ONLY database insert in the entire flow is the single attorney notification row.**
  Nothing else is written to our DB — no `pronto_calls`, `cases`, `orders`, `transactions`,
  requests, or call records.
- The Daily room is created via **Daily.co's API (external service, not our database)** and
  auto-expires (~15 min `exp`), so it is not a DB insert.
- The fake open request and incoming call live **only in client state** — they never hit
  `/requests/open` or `/calls/active`.

## Error & Edge Handling

- **No push token / notifications disabled:** banner won't arrive, but the in-app flow
  still works (the open-request card appears regardless — the banner is a bonus, not a
  gate). Optionally show a subtle "we also sent you a notification" hint.
- **Camera/mic permission denied** in the test room: same handling as real calls
  (`calls/[id].tsx` already handles permissions).
- **CallKit decline:** returns cleanly to the test screen; no room minted.
- **`pronto_enabled` flips to true mid-test:** harmless — they can finish; the entry point
  simply won't reappear.
- **Re-run:** unlimited while not enabled.
- **iOS VoIP bridge:** locally calling `RNCallKeep.displayIncomingCall` only displays the
  CallKit UI and does **not** require the PKPushRegistry, so it must not interfere with the
  existing VoIP push bridge. Verify no conflict during implementation.

## Testing

- Manual run-through on a real device (push delivery + real Daily join + CallKit ring
  cannot be fully unit-tested).
- Verify: test-mode flag bypasses polling/wrap-up in `calls/[id].tsx`; entry point shows
  iff `pronto_enabled === false`; the two endpoints create **no** real DB rows; the test
  notification row is flagged and excluded from real lists.

## Out of Scope

- Push-initiated VoIP CallKit (rings when app is killed) — Option B, deferred.
- Two-way / looping "client" video in the room — solo only.
- Any device-diagnostic / permission-status tracking (covered by a separate deferred
  effort across all 3 apps).

## Complexity Assessment

Medium-small, mostly client-side. Highest-risk piece: making `calls/[id].tsx` tolerate a
test mode that skips real status-polling and wrap-up. Backend work is two small,
side-effect-free endpoints. CallKit and Daily reuse existing integrations.
