# Task: make the test open-request look & behave exactly like the real one

Goal: the attorney "test call" demo must show the SAME open-request card and the SAME
"Accept & Sign" → "Retainer signed" bottom-sheet flow as the real Pronto screen — by
SHARING the exact components (not re-skinning). Only the accept handler differs (test =
no backend; fire the CallKit ring after the success sheet).

Repo: /Users/shovansmini/codes/Geniuslaw_Attorney_App/mobile

Read the real source for exact JSX/styles (Read tool may truncate these files — use
`sed -n 'A,Bp' <file>` via Bash to read exact ranges):
- app/(auth)/pronto.tsx:
  - ModalState type: lines 40-44
  - formatMoney: lines 46-56
  - ProntoActionSheet component: lines 70-247 (full function)
  - open-request card JSX (the per-request `<View key={req.id}>...</View>`): lines ~659-739
  - `styles` StyleSheet: starts line ~871 (card/cardTitle/hint/reqHeader/reqClientRow/
    urgencyRow/feePill/feePillText/primaryBtn/primaryBtnLabel are the card-relevant ones)
  - `sheetStyles` StyleSheet: starts line ~981 to EOF
  - the `<ProntoActionSheet ... />` usage site (find it near the end of the return)
  - state: `const [modal, setModal] = useState<ModalState>(null)` (line ~98)

## Step 1 — CREATE mobile/components/ProntoOpenRequest.tsx (shared)

Export, moving the real code VERBATIM (same JSX, same style values):
- `export function formatMoney(cents: number, currency: string): string` — move from pronto.tsx 46-56.
- `export type ProntoRequestModalState` — the exact ModalState union from pronto.tsx 40-44.
- `export function ProntoActionSheet({ modal, colors, onDismiss, onConfirmAccept }: {
     modal: ProntoRequestModalState; colors: AppColors; onDismiss: () => void;
     onConfirmAccept: (req: OpenRequest) => void; })` — move the whole function (70-247) verbatim.
- `export function ProntoOpenRequestCard({ req, accepting, disabled, colors, onAccept }: {
     req: OpenRequest; accepting: boolean; disabled: boolean; colors: AppColors;
     onAccept: (req: OpenRequest) => void; })` — extract the per-request card `<View>...</View>`
     (the body inside `visibleRequests.map((req) => ( ... ))`, lines ~659-739). The button calls
     `onAccept(req)`; show ActivityIndicator when `accepting`; dim/disable when `disabled`
     (replicate the existing `acceptingId !== null && acceptingId !== req.id ? 0.5 : ...` logic
     using `accepting`/`disabled`). Keep the "Accept & Sign" pencil button, fee pill, client
     name/state/email/phone rows, and "First to accept wins" exactly as in the original.
- Module-local StyleSheets in this file: `sheetStyles` (verbatim from pronto.tsx) and a local
  styles object with the card-relevant entries copied verbatim (card, cardTitle, hint,
  reqHeader, reqClientRow, urgencyRow, feePill, feePillText, primaryBtn, primaryBtnLabel).
- Imports: Ionicons; ActivityIndicator, Modal, Pressable, StyleSheet, Text, View from
  'react-native'; Animated, { FadeInUp } from 'react-native-reanimated'; AppColors, fonts,
  radius, spacing from '../constants/theme'; type OpenRequest from '../lib/pronto'.

## Step 2 — REFACTOR app/(auth)/pronto.tsx to use the shared components (behavior identical)

- DELETE the local `formatMoney`, the `ModalState` type, the `ProntoActionSheet` function, and
  the `sheetStyles` StyleSheet from pronto.tsx.
- Import from '../../components/ProntoOpenRequest':
  `import { ProntoActionSheet, ProntoOpenRequestCard, formatMoney, type ProntoRequestModalState } from '../../components/ProntoOpenRequest';`
- Change `useState<ModalState>(null)` → `useState<ProntoRequestModalState>(null)`.
- KEEP the `styles` StyleSheet as-is (its card/cardTitle/hint/primaryBtn/etc. are still used by
  OTHER parts of pronto.tsx — do NOT remove those). Only the card MARKUP moves, not the screen's
  shared styles.
- Replace the inline per-request card markup inside `visibleRequests.map((req) => ( <View ...>...</View> ))`
  with:
  `visibleRequests.map((req) => (
     <ProntoOpenRequestCard
       key={req.id}
       req={req}
       accepting={acceptingId === req.id}
       disabled={acceptingId !== null}
       colors={colors}
       onAccept={handleAccept}
     />
   ))`
- The `<ProntoActionSheet modal={modal} colors={colors} onDismiss={...} onConfirmAccept={...} />`
  usage site stays the same (now resolves to the imported component). Confirm its props match.
- Net effect: the real Pronto screen renders identically and behaves identically (handleAccept →
  confirm modal → doAccept → acceptProntoRequest → accepted modal). Verify nothing else changed.

## Step 3 — UPDATE app/(auth)/pronto-test.tsx to use the shared card + sheet

- Import: `import { ProntoActionSheet, ProntoOpenRequestCard, formatMoney, type ProntoRequestModalState } from '../../components/ProntoOpenRequest';`
  and `import type { OpenRequest } from '../../lib/pronto';`
- Remove the simplified fake-request card markup and the local formatMoney (use the shared one).
- Add state: `const [modal, setModal] = useState<ProntoRequestModalState>(null);`
- Build a full dummy OpenRequest from `start` + realistic hardcoded contact fields so the card
  looks fully populated:
  `const dummyReq: OpenRequest = start ? {
     id: -1,
     client_name: start.client_name,
     client_state: 'California',
     client_email: 'john.doe@example.com',
     client_phone: '(555) 010-1234',
     practice_area_name: start.practice_area_name,
     fee_amount_cents: start.fee_amount_cents,
     fee_currency: start.fee_currency,
     signed_at: null,
     paid_at: null,
     attempt_count: 0,
   } : null;`  (guard render on dummyReq)
- When `phase !== 'idle' && dummyReq`, render the shared card instead of the old one:
  `<ProntoOpenRequestCard req={dummyReq} accepting={false} disabled={phase === 'ringing'}
     colors={colors} onAccept={(r) => setModal({ kind: 'confirm', req: r })} />`
  (wrap with the existing "Open request (1)" section label + Animated.View as before).
- Render the shared sheet at the end of the screen:
  `<ProntoActionSheet modal={modal} colors={colors} onDismiss={() => setModal(null)}
     onConfirmAccept={onConfirmAccept} />`
- Implement onConfirmAccept — this REPLACES the old onAccept ring logic. It must NOT call any
  backend (no acceptProntoRequest). It shows the real "Retainer signed" success sheet, then
  fires the local CallKit ring:
  `const onConfirmAccept = useCallback((req: OpenRequest) => {
     if (!start) return;
     setPhase('ringing');
     setModal({
       kind: 'accepted',
       clientName: req.client_name,
       practiceArea: req.practice_area_name,
       fee: formatMoney(req.fee_amount_cents, req.fee_currency),
     });
     markTestCall(start.call_id, { isVideo: start.is_video, clientName: start.client_name });
     const t = setTimeout(() => {
       displayTestIncomingCall(start.call_id, start.client_name, start.is_video);
     }, 2000);
     timers.current.push(t);
   }, [start]);`
- Remove the now-unused old `onAccept`/fee text from the old card. Keep markTestCall +
  displayTestIncomingCall imports (still used by onConfirmAccept). The "Start test call" card and
  onStart flow are unchanged. The useFocusEffect reset must ALSO reset modal: add
  `setModal(null);` alongside the existing `setPhase('idle'); setStart(null); setStarting(false);`.

## Constraints / verification
- NO git commit, NO git add. Working tree only.
- The test path must still make ZERO backend calls until the CallKit answer (which calls
  /test/call). onConfirmAccept must NOT call acceptProntoRequest or any other endpoint.
- Verify `npx tsc --noEmit` from mobile/. KNOWN ACCEPTABLE: exactly 2 pre-existing TS2322 on
  DailyMediaView style in calls/[id].tsx. Your changes must add NO new errors. Classify any error.
- The real pronto.tsx must render & behave identically (it now just imports the shared pieces).
