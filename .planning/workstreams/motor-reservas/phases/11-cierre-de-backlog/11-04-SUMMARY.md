---
phase: 11-cierre-de-backlog
plan: 04
subsystem: booking
tags: [booking, ui, settings, multi-staff, pure-function, rls, motor-reservas]

# Dependency graph
requires:
  - phase: 11 (plan 03)
    provides: "columna businesses.public_selector_default (enum 'any'|'choose', migr 061) + read-path server-side hasta BookingClient"
  - phase: 11 (plan 02)
    provides: "settings-client.tsx (toasts + deleteProfessional) — cambio de este plan es aditivo"
provides:
  - "Helper puro anyCardPlacement(setting) -> 'first'|'last' (lib/booking-selector.ts) + test (5 casos)"
  - "Orden de la tarjeta 'Cualquiera' en el paso 2 del booking público según el setting (Opción A)"
  - "Toggle de 2 opciones en Ajustes (tab Cobros) que persiste public_selector_default owner-only"
affects: [motor-reservas, booking-client, settings]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Setting de presentación por negocio manifestado como ORDEN de render (no auto-salteo): función pura testeable + wiring en el client"
    - "Persistencia inmediata (optimista + revert) de un setting enum vía businesses.update().eq('id', business.id) (molde theme/palette/dashboard_widgets)"

key-files:
  created:
    - lib/booking-selector.ts
    - test/booking-selector.test.ts
  modified:
    - app/[slug]/booking-client.tsx
    - app/(dashboard)/settings/settings-client.tsx

key-decisions:
  - "settings/page.tsx NO se tocó: ya lee businesses con .select('*'), así que public_selector_default llega gratis a SettingsClient (el plan lo permitía explícitamente)"
  - "Toggle con persistencia inmediata (optimista + revert on error), no un botón Guardar: mejor UX para un enum de 2 opciones, molde theme/palette/dashboard_widgets"
  - "El reorder del paso 2 se hizo con un IIFE local en el bloque step===2: mantiene el cambio contenido, sin nuevos consts en el body del componente"

patterns-established:
  - "anyCardPlacement: única palanca observable del setting es el orden/prominencia de la tarjeta 'Cualquiera' (cambiar solo el useState inicial sería inerte — el paso 2 siempre exige un tap)"

requirements-completed: [EXTRA-B]

# Metrics
duration: ~18min
completed: 2026-07-27
status: complete
---

# Phase 11 Plan 04: EXTRA-B UI — orden de la tarjeta "Cualquiera" + toggle en Ajustes Summary

**El setting `public_selector_default` se manifiesta como el ORDEN de la tarjeta "Cualquiera" en el paso 2 del booking (función pura `anyCardPlacement` + wiring), y el dueño lo controla desde un toggle owner-only en Ajustes — sin tocar el motor de reservas (D-08).**

## Performance

- **Duration:** ~18 min
- **Completed:** 2026-07-27
- **Tasks:** 3 (1 TDD helper puro + 2 wiring UI)
- **Files:** 2 creados + 2 modificados

## Accomplishments
- **Helper puro `anyCardPlacement(setting)`** (`lib/booking-selector.ts`): `'choose'→'last'`, todo lo demás (`'any'`/`null`/`undefined`/valor inesperado)`→'first'`. Fail-safe hacia el comportamiento actual; solo `'choose'` reordena. Sin React/DOM/Supabase → testeable barato.
- **Test `test/booking-selector.test.ts`** (vitest, molde `staff-services.test.ts`): 5 casos, verde. RED→GREEN respetado (commit `test` antes de `feat`).
- **Paso 2 del booking** (`booking-client.tsx`): con `showAny` (≥2 capaces), el orden de la tarjeta "Cualquiera" vs la lista de profesionales lo decide `anyCardPlacement(business.public_selector_default)` — `'first'` = arriba (byte-idéntico a hoy, D-06); `'last'` = debajo de los profesionales (D-07). El gate `showAny`, el sentinel (0 capaces), `isAny`, `useState('none')` y la señal `anyProfessional` quedaron intactos.
- **Toggle en Ajustes** (`settings-client.tsx`, tab Cobros): control de 2 opciones ("Sí, mostrar 'Cualquiera' arriba" = `any` / "No, que elijan un profesional" = `choose`) con persistencia inmediata optimista vía `businesses.update({ public_selector_default }).eq('id', business.id)` (RLS owner-only, patrón `require_deposit`), toast de éxito/fallo y revert si la escritura falla. Cambio **aditivo** a lo de 11-02.

## Task Commits

1. **Task 1 (RED): test fallando de `anyCardPlacement`** — `ebc5f45` (test)
2. **Task 1 (GREEN): helper puro `anyCardPlacement`** — `79445f6` (feat)
3. **Task 2: orden de la tarjeta "Cualquiera" en el paso 2** — `b2f78b3` (feat)
4. **Task 3: toggle owner-only en Ajustes** — `798fa5f` (feat)

**Plan metadata:** SUMMARY commit (docs).

## Files Created/Modified
- `lib/booking-selector.ts` — helper puro `anyCardPlacement` + tipos `SelectorDefault`/`AnyCardPlacement`
- `test/booking-selector.test.ts` — 5 casos ('choose'→'last'; 'any'/null/undefined/garbage→'first')
- `app/[slug]/booking-client.tsx` — import del helper + reorder de la tarjeta "Cualquiera" en el paso 2 (IIFE local, gate ≥2 intacto)
- `app/(dashboard)/settings/settings-client.tsx` — estado `selectorDefault` + `saveSelectorDefault` + Card con el toggle en el tab Cobros

## Decisions Made
- **`settings/page.tsx` no requirió cambios.** El server component lee `businesses` con `.select('*')` (línea 14), así que `public_selector_default` ya viaja a `SettingsClient` como parte de `business`. El plan lo contemplaba ("si ya usa `*`, no hace falta"). No se tocó el archivo.
- **Persistencia inmediata (optimista + revert), no botón Guardar.** Para un enum de 2 opciones es mejor UX y espeja el patrón ya usado en theme/palette/font/dashboard_widgets (update on select). Si la escritura falla, se revierte el estado local y se avisa con toast.
- **Reorder vía IIFE local en el bloque `step === 2`.** Mantiene el cambio contenido en el paso 2 (define `anyCard`/`sentinelCard`/`proList` y elige el orden) sin agregar consts JSX al body del componente que correrían en todos los pasos.

## Deviations from Plan
Ninguna. El plan se ejecutó tal cual. `settings/page.tsx` figuraba en `files_modified` pero el propio plan preveía no tocarlo si el select era `*` (lo es) — no es una desviación sino la rama esperada.

## Issues Encountered
- **Falsos rojos en `npm test` (full suite con file-parallelism):** 9 tests de abono fallan (`abono-cron`, `abono-create`, `abono-cancel-routes`, `abono-generation`) al correr `npx vitest run` en paralelo. **Son pre-existentes y ajenos a este plan:** (1) ninguno importa nada que este plan tocó (cero overlap con booking-selector/booking-client/settings-client); (2) `abono-generation.test.ts` pasa 11/11 en aislamiento; (3) la suite completa corrida **secuencial** (`--no-file-parallelism`) da **776 passed / 1 skipped / 0 failed** (63/63 files). Es contención de la Supabase LOCAL compartida entre archivos de test en paralelo (flakiness de test-infra), no una regresión. **Fuera de scope** — logueado en `deferred-items.md`.

## Verification
- `npx vitest run test/booking-selector.test.ts` → 5/5 verde.
- `npx vitest run test/booking-cualquiera-public.test.ts` → 5/5 verde (gate ≥2 + contrato intactos tras el reorder).
- `npx vitest run test/booking-public-regression.test.ts test/canchas-booking.test.ts` → 6/6 verde (sin regresión pública ni de canchas).
- `npx vitest run --no-file-parallelism` (suite completa, modo correcto para tests con DB local) → **776 passed / 1 skipped / 0 failed**.
- `./node_modules/.bin/tsc --noEmit` → limpio.

## Threat Model Compliance
- **T-11-06 (escritura cross-tenant del setting) — mitigado:** el toggle persiste con `supabase.from('businesses').update({...}).eq('id', business.id)` vía cliente browser + RLS owner-only (patrón `require_deposit`), sin service-role ni endpoint nuevo.
- **T-11-07 (EXTRA-B tocando el motor) — accept, respetado:** solo orden de render; `book_slot_atomic`/availability/create/contrato y la señal `anyProfessional` sin tocar; el server sigue siendo la autoridad de la asignación y el gate ≥2 intacto.
- **T-11-11 (enum inválido) — mitigado:** el control emite solo `'any'|'choose'`; el CHECK de la migr 061 es el fail-closed en DB.

## Next Phase Readiness
- EXTRA-B queda cerrado end-to-end: backend (11-03, columna+vista+read-path) + UI (11-04, orden+toggle).
- Deploy: la migr 061 debe aplicarse a mano en prod (paso de 11-03, ya documentado); el toggle y el reorder son solo código (no requieren migración adicional).
- Motor de reservas intacto (D-08).

## Self-Check: PASSED
- `lib/booking-selector.ts` — FOUND
- `test/booking-selector.test.ts` — FOUND
- Commit `ebc5f45` (test RED) — FOUND
- Commit `79445f6` (feat helper) — FOUND
- Commit `b2f78b3` (feat booking-client) — FOUND
- Commit `798fa5f` (feat settings toggle) — FOUND
- `anyCardPlacement` referenciado en booking-client.tsx — VERIFIED (grep=3)
- `public_selector_default` en settings-client.tsx — VERIFIED (grep=2)
- tsc limpio + suite secuencial 776/0 — VERIFIED

---
*Phase: 11-cierre-de-backlog*
*Completed: 2026-07-27*
