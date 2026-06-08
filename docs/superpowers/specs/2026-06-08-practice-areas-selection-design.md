# Practice-areas selection step + profile editing

Date: 2026-06-08
Status: Approved

## Goal

After the Pronto "Accept platform terms" step, add a new onboarding step where an
attorney selects which practice areas they handle. Selections are saved to the
`attorneys.practice_areas` text column as a comma-separated list of practice-area
**names**. Existing selections must be pre-checked. Attorneys can edit their
practice areas later from a dedicated section in their Profile.

## Data model (existing, unchanged)

- `practice_areas` table: `{ id, name, pre_retainer_required, pronto_fee_cents, pronto_fee_currency }`.
  Two relevant kinds: `pre_retainer_required = false` and `pre_retainer_required = true`.
- `attorneys.practice_areas` (`text`, nullable): comma-separated practice-area names,
  e.g. `"Debt Settlement,Foreclosure Defense,Bankruptcy"`.

Both backends share the same database. All new endpoints live in the main backend
(this repo), served at `EXPO_PUBLIC_API_URL`.

## Backend (`backend/`)

1. **Catalog** — `GET /attorneys/practice-areas` (attorney-role auth):
   query `practice_areas` table, return `[{ id, name, pre_retainer_required }]`
   ordered by `name`.

2. **Read selections** — extend `GET /attorneys/me`:
   add `practice_areas: Optional[str]` to `AttorneyProfile` and `ATTORNEY_SELECT`.

3. **Save** — `PATCH /attorneys/me/practice-areas` (attorney-role auth):
   body `{ names: string[] }`. Validate each name against the `practice_areas`
   table (drop unknowns), join valid names with `,`, write to
   `attorneys.practice_areas`. Return `{ practice_areas: str }`. Idempotent
   full-replace; shared by onboarding and profile editing.

4. **Onboarding gating** — `compute_onboarding_status` adds
   `practices_selected = bool((practice_areas or "").strip())`; added to the
   `OnboardingStatus` model. Requires `practice_areas` in `ATTORNEY_SELECT`.

## Mobile

### Onboarding flow (`app/(auth)/pronto-onboarding.tsx`)
- New step `'practices'` inserted after `terms`:
  `kyc -> payment -> terms -> practices -> waiting`.
- `STEPS` gains `{ key: 'practices', label: 'Practice' }` (now 4 steps);
  `stepFromStatus` and `currentIndex` updated.
- Custom render block (modeled on the `terms` block) with two grouped sections:
  "Practice areas" (`pre_retainer_required = false`) and "Pre-retainer required"
  (`= true`). Each section is a list of tappable checkbox rows, pre-checked from
  the attorney's saved `practice_areas`.
- Footer CTA "Save & continue": disabled until >= 1 selected; saves -> reload ->
  advances to `waiting`.

### Profile editing
- New row "Practice areas" in `app/(auth)/profile/index.tsx`
  (icon `briefcase-outline`) -> new screen `app/(auth)/profile/practice-areas.tsx`.
- Same two-section checklist, pre-checked from current selections,
  "Save changes" -> same `PATCH /attorneys/me/practice-areas`.

### Shared lib
- `lib/practiceAreas.ts`: `listPracticeAreas()` (GET catalog) +
  `savePracticeAreas(names)` (PATCH), reusing the `authedFetch` Result pattern.
- `lib/attorney.ts`: add `practice_areas: string | null` to `AttorneyProfile`.
- `lib/onboarding.ts`: add `practices_selected: boolean` to `OnboardingStatus`.
- Shared checklist UI component rendered in both the onboarding step and the
  profile screen.

## Decisions

- Selection is **required** (>= 1) to complete onboarding.
- Two sections are visual grouping only; all checked names save into one
  comma-separated string regardless of section.
- Matching is by **name** (per the existing text column). Brittle under renames,
  but matches the current schema.
