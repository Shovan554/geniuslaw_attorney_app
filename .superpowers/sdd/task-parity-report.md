# Task Parity Report — ProntoOpenRequest shared component

## Status
COMPLETE — all three steps done, zero new TypeScript errors introduced.

## Files Created
- `mobile/components/ProntoOpenRequest.tsx` — new shared component file

## Files Modified
- `mobile/app/(auth)/pronto.tsx` — removed local code, added shared imports, replaced inline card markup
- `mobile/app/(auth)/pronto-test.tsx` — replaced fake card + local formatMoney with shared components

---

## Step 1: mobile/components/ProntoOpenRequest.tsx (created)

Exports:
- `formatMoney(cents, currency)` — moved verbatim from pronto.tsx lines 46–56
- `ProntoRequestModalState` — the exact ModalState union from pronto.tsx lines 40–44 (renamed for export)
- `ProntoActionSheet({ modal, colors, onDismiss, onConfirmAccept })` — moved verbatim from pronto.tsx lines 70–247
- `ProntoOpenRequestCard({ req, accepting, disabled, colors, onAccept })` — extracted from the `visibleRequests.map` body (pronto.tsx lines ~659–739). Button calls `onAccept(req)`; shows ActivityIndicator when `accepting`; opacity is `0.5` when `disabled && !accepting` (replicates the real `acceptingId !== null && acceptingId !== req.id` logic).

Module-local StyleSheets:
- `cardStyles` — card-relevant entries (card, cardTitle, hint, reqHeader, reqClientRow, urgencyRow, feePill, feePillText, primaryBtn, primaryBtnLabel) copied verbatim from pronto.tsx `styles`
- `sheetStyles` — copied verbatim from pronto.tsx `sheetStyles`

---

## Step 2: pronto.tsx changes (refactored)

Removed:
- `type ModalState` (lines 40–44) — now imported as `ProntoRequestModalState`
- `function formatMoney` (lines 46–56) — now imported from shared
- `function ProntoActionSheet` (lines 70–247) — now imported from shared
- `const sheetStyles` StyleSheet (~981 to EOF) — now lives in shared file

Added import:
```ts
import {
  ProntoActionSheet,
  ProntoOpenRequestCard,
  formatMoney,
  type ProntoRequestModalState,
} from '../../components/ProntoOpenRequest';
```

Changed:
- `useState<ModalState>(null)` → `useState<ProntoRequestModalState>(null)`
- Removed `AppColors` from theme import (no longer used directly in pronto.tsx)
- Replaced inline `visibleRequests.map` card markup with:
  ```tsx
  visibleRequests.map((req) => (
    <ProntoOpenRequestCard
      key={req.id}
      req={req}
      accepting={acceptingId === req.id}
      disabled={acceptingId !== null}
      colors={colors}
      onAccept={handleAccept}
    />
  ))
  ```
- `<ProntoActionSheet>` usage site unchanged (now resolves to imported component with same props)

Unchanged:
- All logic: `handleAccept` → confirm modal → `doAccept` → `acceptProntoRequest` → accepted modal
- The `styles` StyleSheet in full (all entries retained; still used by other parts of the screen)
- All other state, effects, and JSX

---

## Step 3: pronto-test.tsx changes

Removed:
- Local `function formatMoney` — replaced with shared
- Old fake card markup (simplified `<View>` with `Accept` button) — replaced with shared `ProntoOpenRequestCard`
- Old `onAccept` callback — replaced with `onConfirmAccept`

Added:
```ts
import {
  ProntoActionSheet,
  ProntoOpenRequestCard,
  formatMoney,
  type ProntoRequestModalState,
} from '../../components/ProntoOpenRequest';
import type { OpenRequest } from '../../lib/pronto';
```

New state:
- `const [modal, setModal] = useState<ProntoRequestModalState>(null);`
- `setModal(null)` added to `useFocusEffect` reset

`dummyReq` built from `start` + hardcoded realistic contact fields (client_state: 'California', client_email: 'john.doe@example.com', client_phone: '(555) 010-1234', attempt_count: 0, signed_at/paid_at: null).

`onConfirmAccept` — NO backend calls. Sets phase to 'ringing', shows the real 'accepted' sheet via `setModal({ kind: 'accepted', ... })`, calls `markTestCall`, then fires `displayTestIncomingCall` after 2000ms.

Card rendered inside existing Animated.View + "Open request (1)" section label:
```tsx
<ProntoOpenRequestCard
  req={dummyReq}
  accepting={false}
  disabled={phase === 'ringing'}
  colors={colors}
  onAccept={(r) => setModal({ kind: 'confirm', req: r })}
/>
```

Sheet rendered at screen root:
```tsx
<ProntoActionSheet
  modal={modal}
  colors={colors}
  onDismiss={() => setModal(null)}
  onConfirmAccept={onConfirmAccept}
/>
```

"Start test call" card and `onStart` flow unchanged.

Removed `fee`, `secondaryBtn` from styles (no longer used). Kept all other style entries.

---

## TypeScript output (npx tsc --noEmit)

```
app/(auth)/calls/[id].tsx(354,13): error TS2322: Type 'RegisteredStyle<AbsoluteFillStyle>' is not assignable to type 'ViewStyle | undefined'.
app/(auth)/calls/[id].tsx(375,13): error TS2322: Type 'RegisteredStyle<AbsoluteFillStyle>' is not assignable to type 'ViewStyle | undefined'.
```

Exactly 2 errors — both pre-existing TS2322 on `DailyMediaView` style in `calls/[id].tsx` as documented in the brief. Zero new errors introduced by this change.

---

## Concerns / notes

1. **`disabled` prop semantics**: The brief says `accepting` and `disabled` are separate props. In `ProntoOpenRequestCard`, the Pressable `disabled` prop is set to the `disabled` prop (which in pronto.tsx is `acceptingId !== null`, meaning ANY accept is in progress). The opacity replicates the original: `disabled && !accepting ? 0.5 : pressed ? 0.85 : 1`. This matches the original logic exactly (`acceptingId !== null && acceptingId !== req.id ? 0.5`).

2. **`AppColors` removed from pronto.tsx theme import**: `AppColors` was imported but after removing `ProntoActionSheet` and its local type annotation, it was no longer directly referenced in pronto.tsx. Removed to avoid an unused-import TS warning.

3. **Test screen `fee` style removed**: The old test screen had a `fee` style entry (fontSize 22) used only by the old fake card. It's no longer needed and was omitted from the new styles object, keeping the StyleSheet clean.

4. **No git commits made** per project convention.
