# Deferred / Out-of-Scope Items — Phase 02-01

Discovered during execution. NOT fixed (pre-existing, outside the current task's changes).

## Pre-existing lint findings in `app/(onboarding)/onboarding/page.tsx`

Present before this phase (verified at commit 049a099 and prior). Not introduced by the rework:

- `page.tsx:120` — `react-hooks/set-state-in-effect`: `setSlug(slugified)` called synchronously inside `useEffect` (slugify-on-name effect). Pre-existing.
- `page.tsx:92` (`Step 2 - Services` region) — `react-hooks/immutability` warning. Pre-existing.

## Pre-existing lint errors elsewhere (repo-wide `npm run lint`)

- `components/dashboard/upcoming-appointments.tsx:66` — `react-hooks/preserve-manual-memoization` (Compilation Skipped). Unrelated to onboarding.
- `design_handoff_forjo_rebrand/preview/app.js` — unused var warnings. Vendored/handoff preview, not app code.

These are logged per the executor scope-boundary rule (only auto-fix issues directly caused by the current task). None block the onboarding rework.
