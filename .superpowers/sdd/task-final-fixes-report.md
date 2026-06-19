
---

## Final Fixes Report — 2026-06-19

### Status: COMPLETE

---

### Fix 1 — mobile/lib/testCall.ts: Remove premature clearTestCall in handleTestCallAnswer

**Root cause:** `clearTestCall(callUUID)` was called immediately after reading the stored info, before the async `startProntoTestCall` call and before `callKit.ts` invoked `endCallKit`. When `endCallKit` fired the end event, `isTestCall(callUUID)` returned false, causing the handler to fall through to `endProntoCall('declined')`.

**Before (lines 56–59):**
```ts
export async function handleTestCallAnswer(callUUID: string): Promise<void> {
  const info = TEST_CALLS.get(callUUID);
  clearTestCall(callUUID);          // <-- removed
  const isVideo = info?.isVideo ?? true;
```

**After:**
```ts
// NOTE: we intentionally do NOT call clearTestCall here. The native CallKit
// dismiss (triggered by endCallKit in the answer branch) fires an endCall /
// handleEnd event. Leaving the registry entry in place ensures isTestCall()
// returns true for that event, so the endCall/handleEnd test branch clears it
// and returns — never calling endProntoCall on the real backend.
export async function handleTestCallAnswer(callUUID: string): Promise<void> {
  const info = TEST_CALLS.get(callUUID);
  const isVideo = info?.isVideo ?? true;
```

**Trace (post-fix):**
1. User taps "Answer" on native CallKit ring.
2. `answerCall` fires → `isTestCall(uuid)` = **true** → calls `handleTestCallAnswer(uuid)`.
3. `handleTestCallAnswer` reads info, does NOT clear registry, routes to call screen.
4. `callKit.ts` calls `endCallKit(uuid)` / `RNCallKeep.endCall(uuid)` → fires `endCall`/`handleEnd` event.
5. `endCall`/`handleEnd` handler: `isTestCall(uuid)` = **true** → calls `clearTestCall(uuid)` and **returns** — `endProntoCall` is **never called**.

---

### Fix 2 — mobile/app/(auth)/pronto-test.tsx: Reset state on focus-in

**Root cause:** `useFocusEffect` only cleared timers in its cleanup (focus-out). On returning from a test call, `phase` remained `'ringing'` and `starting` remained whatever it was, making the screen non-re-runnable.

**Before:**
```tsx
useFocusEffect(
  useCallback(() => {
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []),
);
```

**After:**
```tsx
useFocusEffect(
  useCallback(() => {
    setPhase('idle');
    setStart(null);
    setStarting(false);
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []),
);
```

The focus-in resets are no-ops on initial mount (state already idle). They fire only when the screen regains focus after navigation, restoring the screen to a runnable state.

---

### TypeScript Output (npx tsc --noEmit)

```
app/(auth)/calls/[id].tsx(354,13): error TS2322: Type 'RegisteredStyle<AbsoluteFillStyle>' is not assignable to type 'ViewStyle | undefined'.
app/(auth)/calls/[id].tsx(375,13): error TS2322: Type 'RegisteredStyle<AbsoluteFillStyle>' is not assignable to type 'ViewStyle | undefined'.
```

**Classification:** Both errors are pre-existing TS2322 errors on `DailyMediaView` style props in `calls/[id].tsx`. Zero new errors introduced by these changes.

---

### Files Changed
- `/Users/shovansmini/codes/Geniuslaw_Attorney_App/mobile/lib/testCall.ts`
- `/Users/shovansmini/codes/Geniuslaw_Attorney_App/mobile/app/(auth)/pronto-test.tsx`

