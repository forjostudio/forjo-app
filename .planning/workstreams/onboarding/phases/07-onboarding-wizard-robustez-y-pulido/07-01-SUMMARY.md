---
phase: 07-onboarding-wizard-robustez-y-pulido
plan: 01
subsystem: onboarding
tags: [next16, supabase, service-role, multi-tenant, storage, rls, wizard, ux]

# Dependency graph
requires:
  - phase: baseline
    provides: "businesses.logo_url + bucket logos ya existentes; RLS owner-scoped en businesses"
provides:
  - "Endpoint GET /api/onboarding/slug-available (service-role, session-gated, devuelve solo { available: boolean })"
  - "checkSlug del wizard reapuntado al endpoint (ve el espacio global multi-tenant, fail-safe en error de red)"
  - "Botón 'Cerrar sesión' en el header del onboarding (salida del embudo para usuario autenticado sin negocio)"
  - "Picker de logo en el paso 1 + upload al bucket logos al finalizar (path aislado por tenant, best-effort)"
  - "Selector de paleta removido del wizard; negocio nuevo arranca con la paleta default 'red'"
affects: [onboarding, phase-08-auth-theming, settings-apariencia]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Route handler service-role con gate de sesión + respuesta booleana mínima (anti-enumeración multi-tenant)"
    - "Upload de asset best-effort post-insert keyeado por business.id de la sesión (path traversal-safe)"

key-files:
  created:
    - app/api/onboarding/slug-available/route.ts
  modified:
    - app/(onboarding)/onboarding/page.tsx

key-decisions:
  - "El endpoint de slug serializa EXCLUSIVAMENTE { available: boolean } (select('id') + maybeSingle) — cero campos del negocio dueño (T-07-01/D-02)"
  - "Gate de sesión en el endpoint (401 sin user) como refuerzo de bajo costo sobre D-02 (T-07-04)"
  - "checkSlug fail-safe: solo available===true habilita; error de red → slugAvailable=null (nunca falso-positivo, Pitfall 5)"
  - "Logo sube al FINALIZAR (no en el paso 1) porque la RLS del bucket exige que el negocio exista; path ${business.id}/logo.${ext} con id de la sesión (T-07-02)"
  - "Paleta default hardcodeada 'red' + primary_color '#d94a2b' en el insert; la paleta sigue editable en Ajustes (D-06)"

patterns-established:
  - "Chequeo de disponibilidad en espacio de nombres global multi-tenant vía service-role + respuesta booleana mínima"
  - "Paso aditivo best-effort en handleFinish (logo) que nunca rompe el redirect, mismo criterio que linkLeadOnSignup"

requirements-completed: [ONB-01, ONB-02, ONB-03, ONB-04]

# Metrics
duration: ~20min
completed: 2026-07-17
status: complete
---

# Phase 07 Plan 01: Robustez y pulido del wizard de onboarding — Summary

**Endpoint service-role de disponibilidad de slug que devuelve solo un booleano (cierra el bug cross-tenant ONB-01 y la fuga T-07-01), más salida del wizard, logo al bucket `logos` y remoción del selector de paleta.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-17
- **Tasks:** 3
- **Files modified:** 2 (1 creado, 1 modificado) + deferred-items.md

## Accomplishments
- **ONB-01 (bug + threat load-bearing):** nuevo `app/api/onboarding/slug-available/route.ts` — GET service-role que resuelve la existencia de un slug en el espacio global multi-tenant y devuelve EXCLUSIVAMENTE `{ available: boolean }` (nunca id/name/owner). Gateado a sesión autenticada (401 sin user). `checkSlug` del wizard reapuntado a `fetch` de este endpoint: ahora el feedback "✗ Ya está en uso" aparece ANTES de finalizar en vez del opaco "Error al crear el negocio" en el insert. Debounce de 500ms intacto; fail-safe ante error de red.
- **ONB-02:** botón "Cerrar sesión" discreto en el header (arriba a la derecha, no compite con el lockup), visible en todos los pasos → `signOut` + `push('/login')` + `refresh()`. Salida clara para el usuario autenticado con la cuenta equivocada.
- **ONB-03:** picker de logo en el paso 1 (avatar redondo + input file oculto + validación tipo/tamaño); el archivo se previsualiza pero sube al FINALIZAR, al bucket `logos` en `${business.id}/logo.${ext}`, persistiendo `businesses.logo_url`. Best-effort: un fallo del upload no rompe el redirect al dashboard.
- **ONB-04:** eliminado del wizard el selector de paleta (`PALETTES`, estado `palette`, `selectPalette`, el apply en vivo y el bloque de swatches); el insert hardcodea `palette: 'red'` + `primary_color: '#d94a2b'`. La feature sigue viva en Ajustes → Apariencia (settings-client.tsx no se tocó).

## Task Commits

1. **Task 1: Endpoint service-role de disponibilidad de slug (ONB-01)** — `3399c03` (feat)
2. **Task 2: checkSlug via endpoint + salida del wizard + sin paleta (ONB-01/02/04)** — `49b603c` (feat)
3. **Task 3: Logo del negocio en el paso 1, sube al finalizar (ONB-03)** — `dbb5c4e` (feat)

## Files Created/Modified
- `app/api/onboarding/slug-available/route.ts` (NUEVO) — GET service-role, session-gated, valida el shape del slug, devuelve solo `{ available: boolean }`.
- `app/(onboarding)/onboarding/page.tsx` (MODIFICADO) — checkSlug via fetch, `handleLogout` + botón en el header, picker de logo + upload al finalizar, selector de paleta removido, insert con paleta default.

## Decisions Made
- Invariante T-07-01/D-02 sostenida con `select('id')` + `.maybeSingle()`: el id es solo marcador de existencia y jamás se serializa; la respuesta de éxito es un objeto literal `{ available: !data }`.
- Gate de sesión (T-07-04): el onboarding siempre está autenticado, así que exigir `auth.getUser()` corta la enumeración anónima con cero costo de UX.
- Upload del logo con referencia única al bucket (`const bucket = supabase.storage.from('logos')`) reutilizada para `upload` + `getPublicUrl` — más limpio y cablea el bucket correcto (`logos`, NO `landing-assets`).

## Deviations from Plan
None - plan ejecutado tal cual. (El único ajuste menor fue factorizar `supabase.storage.from('logos')` a una variable local `bucket` para reusarla en upload y getPublicUrl; misma semántica que el molde de settings, sin cambio de comportamiento.)

## Issues Encountered
- `npx eslint` sobre `page.tsx` reporta 2 problemas (1 error `react-hooks/set-state-in-effect` en L125 `setSlug(slugified)`, 1 warning `Badge` import muerto) que son **pre-existentes en el base 5fec7f5** — verificado extrayendo el archivo del base y confirmando que ambos patrones ya existían intactos. Fuera del scope de esta fase (regla de scope boundary + regla 3 "no limpiar código alrededor del cambio"). Documentados en `deferred-items.md`. El código nuevo de 07-01 no agrega ningún problema de lint nuevo.

## Verification
- `npx tsc --noEmit` — verde (prueba también que ONB-04 removió `PALETTES`/`palette`/`selectPalette` sin referencias colgadas).
- `npx eslint` sobre los archivos nuevos/modificados — sin problemas nuevos (solo los 2 pre-existentes documentados).
- Greps de cableado: `{ available: !data }` exacto (×1) + `auth.getUser` en el route; `slug-available`, `auth.signOut`, `storage.from('logos')` (×1) presentes en page.tsx; `palette: 'red'` (×1); `PALETTES` ausente; `landing-assets` ausente.
- `npx vitest run` — 532 passed, 49 skipped, 0 failed (sin regresión; los skips son las suites que requieren Supabase local, OFF en este entorno).
- **NO testeable localmente:** el upload real del logo (Supabase Storage OFF en Windows) → validado por el cableado; requiere UAT/staging al cierre de fase.

## User Setup Required
None - sin migración, sin nuevas env vars, sin config de Dashboard (`businesses.logo_url` y el bucket `logos` ya existen).

## Next Phase Readiness
- Fase autónoma completa. `/gsd:secure-phase 7` es obligatorio al cierre (ONB-01 es multi-tenant + service-role; verificar T-07-01..04).
- Diferido a propósito: ONB-05 (theming de auth) es Phase 8.

## Self-Check: PASSED

- Archivos verificados en disco: `app/api/onboarding/slug-available/route.ts`, `app/(onboarding)/onboarding/page.tsx`, `07-01-SUMMARY.md` — todos FOUND.
- Commits verificados: `3399c03`, `49b603c`, `dbb5c4e`, `4998600` — todos FOUND. Working tree limpio.

---
*Phase: 07-onboarding-wizard-robustez-y-pulido*
*Completed: 2026-07-17*
