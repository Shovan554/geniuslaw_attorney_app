# Task 9 Report — Mobile Entry Point Button + Notification Routing

**Status: COMPLETE — no new TypeScript errors**

---

## Changes Applied

### Step 1: CREATE mobile/components/TestCallEntry.tsx
Created verbatim from plan. Named export `TestCallEntry`. Navigates to `/(auth)/pronto-test`. Uses `colors.accentBorder`, `colors.accentTint`, `colors.accent`, `colors.text`, `colors.textMuted` from theme. Ionicons `call-outline` + `chevron-forward`.

### Step 2: MODIFY pronto.tsx — `!enrolled && onboardingComplete` branch
- Added import: `import { TestCallEntry } from '../../components/TestCallEntry';` (line 19, after AppHeader import).
- Wrapped the existing `<Animated.View style={[styles.allSetCard, ...]}>` in a `<>...</>` fragment.
- Existing children preserved verbatim: `allSetBadge` View (with checkmark-circle icon), `allSetTitle` Text ("You're all set"), `allSetHint` Text (wait for staff member message).
- Appended `<View style={{ marginTop: spacing.md }}><TestCallEntry /></View>` after the closing `</Animated.View>`.

### Step 3: MODIFY pronto.tsx — `!enrolled` branch (Not enrolled / Get Pronto access)
- Wrapped the existing `<Animated.View style={[styles.card, ...]}>` in a `<>...</>` fragment.
- Existing children preserved verbatim: `rowHeader` View (dot + "Not enrolled" title), `hint` Text (enrollment instructions), `Pressable` navigating to `/pronto-onboarding` with "Get Pronto access" label.
- Appended `<View style={{ marginTop: spacing.md }}><TestCallEntry /></View>` after the closing `</Animated.View>`.

### Step 4: MODIFY pronto-onboarding.tsx — sticky footer
- Added import: `import { TestCallEntry } from '../../components/TestCallEntry';` (line 20, after PracticeAreaPicker import).
- In `<View style={[styles.footer, { borderTopColor: colors.cardBorder }]}>`, added `<View style={{ marginBottom: spacing.md }}><TestCallEntry /></View>` as the FIRST child, before the existing `{message ? ... : null}` block and `TouchableOpacity` CTA.

### Step 5: MODIFY lib/notifications.ts — routeFromNotificationData
- Replaced the function body to add an early-return guard: if `_data.genre === 'pronto_test'`, pushes `/(auth)/pronto-test` and returns.
- All other genres fall through to the existing `router.push('/(auth)/pronto' as never)`.

---

## TypeScript Output

```
app/(auth)/calls/[id].tsx(354,13): error TS2322: Type 'RegisteredStyle<AbsoluteFillStyle>' is not assignable to type 'ViewStyle | undefined'.
app/(auth)/calls/[id].tsx(375,13): error TS2322: Type 'RegisteredStyle<AbsoluteFillStyle>' is not assignable to type 'ViewStyle | undefined'.
```

**Classification:**
- Both errors: pre-existing, known-acceptable `DailyMediaView style={StyleSheet.absoluteFill}` errors in `calls/[id].tsx`. Not introduced by Task 9.
- Zero errors referencing `pronto.tsx`, `pronto-onboarding.tsx`, `notifications.ts`, or `TestCallEntry.tsx`.

---

## Concerns

- `colors.accentTint` is used in TestCallEntry — verified it is referenced in theme context (used elsewhere in the codebase). If for any reason this key does not exist on the colors object at runtime, the background will be `undefined` (React Native silently ignores it). No compile-time error because the theme type likely uses an index signature or the property exists.
- The `TestCallEntry` button is visible in both pre-enrollment branches and the onboarding footer. Per plan, entry point is "visible only while `pronto_enabled === false`" — the button is placed only in the `!enrolled` branches of pronto.tsx and in the onboarding flow, so the constraint is satisfied structurally. The enrolled + enabled branch does not receive the button.
- No git commit was made (per project rules — user handles all commits).
