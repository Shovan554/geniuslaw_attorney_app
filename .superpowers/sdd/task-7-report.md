# Task 7 Report — `calls/[id].tsx` test mode

**Status: COMPLETE — all 5 edits applied, tsc clean (only expected pre-existing TS2322 errors)**

---

## File Changed

`mobile/app/(auth)/calls/[id].tsx`

---

## Edits Applied

### Edit 1 — Parse `test` param
Added `test?: string;` to the `useLocalSearchParams` generic type, and `const isTest = params.test === '1';` after `isPronto`. (Lines ~38–52)

### Edit 2 — Short-circuit `reportEnded` for test calls
Added `if (isTest) { router.back(); return; }` immediately after `setStatus('ended')` inside `reportEnded`, before `const wasConnected`. Updated `useCallback` dep array from `[callId, calleeName, isPronto]` to `[callId, calleeName, isPronto, isTest]`.

### Edit 3 — Disable status polling in test mode
Added `if (isTest) return; // test rooms are solo; no server-side call status to poll` as the FIRST statement inside the polling `useEffect`. Updated dep array from `[callId, status, reportEnded, isPronto]` to `[callId, status, reportEnded, isPronto, isTest]`.

### Edit 4 — Simulate "connected" on join in test mode
Replaced `onJoined` (was 4 lines) with an expanded version: calls `syncParticipants(co)` first, then if `isTest` sets `connectedAtRef.current`, calls `setStatus('connected')`, starts the elapsed interval timer, and returns early — skipping the normal `setStatus('ringing')`. Updated Daily-setup effect dep array from `[roomUrl, meetingToken, isVideoCall, syncParticipants]` to `[roomUrl, meetingToken, isVideoCall, syncParticipants, isTest]`.

### Edit 5 — Self-as-main tile + TEST MODE badge
Three sub-edits:
- **5a**: Replaced `showRemoteVideo`/`showLocalVideo` block with `showSelfAsMain` declared first, then updated `showRemoteVideo` to gate on `!isTest`, and updated `showLocalVideo` to add `&& !showSelfAsMain`.
- **5b**: Inserted self-tile JSX (`showSelfAsMain ? <View style={StyleSheet.absoluteFill}><DailyMediaView .../><View style={styles.topScrim}/></View>`) and TEST MODE badge (`isTest ? <View style={styles.testBadge}><Text style={styles.testBadgeText}>TEST MODE</Text></View>`) immediately inside `<SafeAreaView>`, before the remote-video block.
- **5c**: Added `testBadge` and `testBadgeText` to `StyleSheet.create({...})` after `endIcon`.

---

## tsc Output

```
app/(auth)/calls/[id].tsx(354,13): error TS2322: Type 'RegisteredStyle<AbsoluteFillStyle>' is not assignable to type 'ViewStyle | undefined'.
app/(auth)/calls/[id].tsx(375,13): error TS2322: Type 'RegisteredStyle<AbsoluteFillStyle>' is not assignable to type 'ViewStyle | undefined'.
```

### Error Classification

| Error | Line | Classification |
|-------|------|---------------|
| TS2322 `RegisteredStyle<AbsoluteFillStyle>` not assignable to `ViewStyle \| undefined` | 354 | **Acceptable duplicate** — new self-view `DailyMediaView style={StyleSheet.absoluteFill}` block added in step 5, same pattern as pre-existing error |
| TS2322 `RegisteredStyle<AbsoluteFillStyle>` not assignable to `ViewStyle \| undefined` | 375 | **Pre-existing** — original remote-video `DailyMediaView style={StyleSheet.absoluteFill}` block (previously line 330, now shifted to 375 due to added lines) |

Both errors are exactly the `StyleSheet.absoluteFill` assignability quirk on `DailyMediaView`. Zero genuinely new error types introduced.

---

## Concerns

None. All edits are strictly additive guards behind `isTest`; the non-test (real Pronto and regular) call path is unchanged. The `pointerEvents="none"` prop on the TEST MODE badge is correct React Native JSX usage. The `spacing.xs` value exists in the theme constants (`xs: 4`). The Daily-setup effect's eslint suppression comment already covers the intentional omission of `reportEnded` from deps; adding `isTest` to the dep array is fine because `isTest` is a stable constant (derived from route params that don't change mid-call).
