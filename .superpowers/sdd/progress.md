# Pronto Test Call — Progress Ledger

Mode: subagent-driven, **no commits** (working-tree only; user commits at end).
Plan: docs/superpowers/plans/2026-06-19-pronto-test-call.md
Backend repo: /Users/shovansmini/codes/Pronto
Mobile repo: /Users/shovansmini/codes/Geniuslaw_Attorney_App

- [x] Task 1: Backend pure helpers (pronto_test.py) + unit tests — review clean (3 tests pass; minor: benign int() cast)
- [x] Task 2: Backend create_test_call_room (no-DB Daily room) — review clean (4 tests pass; no-DB proven via boom monkeypatch)
- [x] Task 3: Backend /test/start + /test/call endpoints + hide test notifs — review clean (66 tests pass; /test/call no-DB confirmed). Minors (non-blocking): local Pydantic models (plan-mandated), attorney_name "Attorney" fallback (mirrors accept_call), PEP8 blank line.
- [x] Task 4: Mobile pronto.ts client functions — review clean (tsc no new errors). NOTE: tsc baseline has 1 pre-existing error: calls/[id].tsx:330 TS2322 StyleSheet.absoluteFill on DailyMediaView (relevant to Task 7 — its new self-view block uses the same pattern).
- [x] Task 5: Mobile lib/testCall.ts registry + ring + answer handler — review clean (no tsc errors; no circular import; params include pronto:'1' + test:'1')
- [x] Task 6: Mobile callKit.ts branch handlers — review clean (all 4 handler branches guard isTestCall + return before real backend; real paths untouched; no new tsc errors)
- [x] Task 7: Mobile calls/[id].tsx test mode — review clean (verified line-by-line: test call never reaches endProntoCall/endCallApi/getProntoCallStatus/getCallStatus/wrapUpProntoCall; real path unchanged; tsc = 2 acceptable TS2322 DailyMediaView-style only)
- [x] Task 8: Mobile pronto-test.tsx screen — review clean (TEST MODE label, replica card, correct flow; calls startProntoTest/markTestCall/displayTestIncomingCall only — NOT startProntoTestCall; re-runnable; no tsc errors)
- [x] Task 9: Mobile entry button + notification routing — review clean (button only in both !enrolled branches + onboarding footer, NOT enrolled UI; existing JSX preserved; routing additive; no new tsc errors). colors.accentTint confirmed present on theme.
- [ ] Task 10: Manual device verification (USER-RUN — needs EAS/expo run device build)

## Final whole-branch review (opus)
- Verdict was NEEDS FIXES → 1 blocking (IMPORTANT): test answer hit real endProntoCall because handleTestCallAnswer cleared the registry before endCallKit fired the end event.
- Fix applied: removed clearTestCall from handleTestCallAnswer (testCall.ts); the endCall/handleEnd test branches now clear it. + re-runnability fix in pronto-test.tsx (reset state on focus-in).
- Re-review: PASS on guarantee #3 (iOS+Android answered), decline path, re-runnability-without-race. No new tsc errors (only the 2 accepted pre-existing TS2322).
- Non-blocking minors left as-is: #2 tiny registry leak (abandoned-before-answer), #4 stale-banner routing, #5 onboarding footer gated indirectly via redirect, #6 Daily room uses existing ROOM_TTL (2h) not 15min — plan deliberately reuses the existing auto-expiring helper.

ALL IMPLEMENTATION COMPLETE. No commits made (working-tree only per user). User to commit + run Task 10 on device.

## Post-deploy fix (runtime error hit during testing)
- /test/start returned 500: attorney_notifications_genre_check rejected genre='pronto_test' (live constraint is genre='pronto' ONLY; link_type='test_call' also not in the allowed set).
- Fix: added backend/migrations/023_attorney_test_call_notifications.sql widening genre → IN ('pronto','pronto_test') and link_type → +'test_call'. User chose the migration approach. USER MUST APPLY THE SQL to Supabase (not run by me). No code changes needed — genre/link_type values already match.
- Latent pre-existing issue flagged: genre='pronto_direct_call' (used by direct-call code) is also rejected by the live constraint; not fixed here (out of scope).

## Parity refactor (user: "open request must be same as real + sign/accept same way")
- Extracted the real open-request card + "Accept & Sign"/"Retainer signed" bottom sheet into shared mobile/components/ProntoOpenRequest.tsx (formatMoney, ProntoRequestModalState, ProntoActionSheet, ProntoOpenRequestCard).
- pronto.tsx (production) now imports & uses them — behavior provably identical (handleAccept→confirm→doAccept→acceptProntoRequest→accepted unchanged; shared styles kept).
- pronto-test.tsx now renders the SAME card + sheet with a full dummy OpenRequest (id:-1, hardcoded state/email/phone); onConfirmAccept shows the real "Retainer signed" sheet then fires the local CallKit ring after ~2s — ZERO backend calls (no acceptProntoRequest; startProntoTestCall still only fires later in the CallKit answer handler).
- Review: production parity confirmed, test path backend-free, no new tsc errors. False-positive only: reviewer flagged TestCallEntry in pronto.tsx but that's Task 9 (uncommitted working tree). Cosmetic nit left: harmless stray key on card root View.

## Guided walkthrough steps (user request)
- pronto-test.tsx phases now: idle → requesting (3s info: "How requests reach you" — a client request pops up as a notification) → request (shared card) → Accept & Sign → awaitingCall (10s info: "Payment in progress" — client pays, then you'll get a call) → ringing.
- Constants REQUEST_DELAY_MS=3000, PAYMENT_DELAY_MS=10000. Info-box card with icon + spinner per phase. Still backend-free until CallKit answer. tsc clean (only the 2 accepted pre-existing TS2322).
