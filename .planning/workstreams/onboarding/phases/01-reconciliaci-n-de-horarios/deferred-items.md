# Deferred Items — Phase 01 (Reconciliación de horarios)

Ítems descubiertos durante la ejecución que están **fuera de scope** del plan actual
(no causados por los cambios del plan). No se tocan acá.

## Lint pre-existente en `app/(onboarding)/onboarding/page.tsx`

Descubierto durante: 01-01, verify `npm run lint`.

El archivo ya tenía 3 problemas de lint ANTES de este plan (confirmado con `git stash` +
re-lint del baseline), no introducidos por la migración a `time_blocks`:

- `page.tsx:~78` — `react-hooks/immutability`: `selectPalette` muta
  `document.documentElement.dataset.palette` (side-effect de DOM fuera de un efecto).
- `page.tsx:~109` — `react-hooks/set-state-in-effect`: `setSlug` llamado sincrónicamente
  dentro de un `useEffect` (slugify del nombre).

Ambos son del ruleset del React Compiler (`eslint-config-next` 16). Son deuda pre-existente
del onboarding, no del paso de horarios. Candidatos al rework de UX del onboarding (Phase 2).

## Lint pre-existente en el resto del repo

`npm run lint` reporta ~590 problemas en archivos NO tocados por este plan
(`components/dashboard/*`, `design_handoff_forjo_rebrand/preview/*`, etc.). Fuera de scope.
