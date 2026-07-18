---
phase: 04-ventana-de-reserva-p-blica
plan: 04
subsystem: booking / backstop server anti-tampering
tags: [booking-window, backstop, anti-tampering, multi-tenant, hora-ar, no-regresion]
status: complete
requires:
  - "lib/booking-window.ts — isDateOutOfWindow(business, date) (Plan 01, corte inclusive en hora AR)"
  - "businesses.max_advance_days/max_advance_date (migr. 052, Plan 01)"
provides:
  - "app/api/booking/create/route.ts — backstop isDateOutOfWindow (400 date_out_of_window) tras el gate de plan y antes del insert de client"
  - "test/booking-window-exemption.test.ts — exención del alta manual (core window-agnostic) + contrato del predicado del backstop"
affects:
  - "secure-phase gate (T-04-09/10/11 verificados por este backstop)"
  - "code-review (appointments/create NO tocado = exención por construcción)"
tech-stack:
  added: []
  patterns:
    - "Backstop server de autoridad: valida server-side aunque la UI se saltee (anti-tampering)"
    - "Guard temprano ANTES del insert de client → sin filas clients huérfanas (Pitfall 3)"
    - "Fuente única de corte (isDateOutOfWindow) compartida UI+server → sin drift"
    - "Ventana SOLO en el route público; booking-core window-agnostic → alta manual exenta por diseño"
key-files:
  created:
    - test/booking-window-exemption.test.ts
  modified:
    - app/api/booking/create/route.ts
    - test/canchas-booking.test.ts
decisions:
  - "El guard va justo tras el gate de plan_status (antes de reCAPTCHA/secrets/insert client) para rechazar temprano sin dejar orphans"
  - "El core (booking-core) NO conoce la ventana: la exención del alta manual es por construcción, no por un branch condicional"
  - "canchas-booking.test.ts opta explícitamente por sin-límite (window null) porque usa una DATE sentinela lejana y no es un test de la ventana"
metrics:
  tasks: 2
  files_created: 1
  files_modified: 2
  completed: 2026-07-18
status_line: "Backstop server anti-tampering de la ventana en booking/create (400 date_out_of_window, hora AR, antes del insert de client) + test de exención del alta manual; suite completa verde 598/599"
---

# Phase 4 Plan 04: Backstop server de la ventana de reserva pública — Summary

Capa de AUTORIDAD del enforcement en 3 capas (D-08): `app/api/booking/create` ahora rechaza server-side toda reserva pública con fecha fuera de la ventana aunque el cliente manipule la request. Es el enforcement REAL de la fase (lo que verifica el secure-phase gate); el cap del calendario (Plan 03) es solo UX y se puede saltear. El backstop consume el helper compartido `isDateOutOfWindow` (Plan 01, hora AR, corte inclusive) para coincidir exactamente con lo que ve el calendario, y corre TEMPRANO —antes del insert de `client`— para no dejar filas huérfanas. El alta manual autenticada (`app/api/appointments/create`) queda exenta por construcción: la ventana vive solo en el route público, el core compartido es window-agnostic.

## What Was Built

### Task 1 — Backstop en app/api/booking/create/route.ts (commit `7487eb7`)
- `import { isDateOutOfWindow } from '@/lib/booking-window'`.
- Select de `businesses` ampliado con `max_advance_days, max_advance_date` (las 2 columnas que lee el helper; el resto del select intacto).
- Guard `if (isDateOutOfWindow(business, date)) return Response.json({ ok:false, error:'date_out_of_window' }, { status: 400 })`, ubicado inmediatamente tras el gate de `plan_status` y ANTES del insert de `client` (Pitfall 3: una fecha fuera de ventana no deja `clients` huérfanos). 400 = validación de input, consistente con `missing_fields`.
- NO se tocó `createAppointmentCore` / `lib/booking-core.ts` / la derivación de canchas / `appointments/create`.

### Task 2 — Test de exención del alta manual (commit `b695402`)
- `test/booking-window-exemption.test.ts`:
  - Caso con DB (`skipIf(!hasSupabaseCreds)`): `createAppointmentCore` con fecha lejana `2031-05-05` y `requireDeposit:false` → `ok` + fila `confirmed`. Demuestra que el core (usado por el alta manual) es window-agnostic → el alta manual queda exenta.
  - Caso unitario (siempre corre, sin DB): contrato del predicado que ejerce el backstop — `isDateOutOfWindow` rechaza fuera de ventana, permite dentro, y sin límite (business sin columnas) nunca rechaza.
- Honestidad de scope (mismo criterio que booking-public-regression): el RECHAZO del backstop se cubre como unidad en `lib/booking-window.test.ts` (Plan 01); acá se cubre la EXENCIÓN vía el core + el contrato del predicado. El route HTTP público completo (reCAPTCHA/secrets/cookies) es inviable de invocar sin server.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `test/canchas-booking.test.ts` rompió por el nuevo backstop**
- **Found during:** Verificación de la suite completa (`npx vitest run`) tras Task 2.
- **Issue:** `canchas-booking.test.ts` invoca el route handler real (`createPOST`) con la DATE sentinela `2031-03-03` (5 años en el futuro, elegida para no chocar con turnos pasados). La migr. 052 puso `max_advance_days DEFAULT 30`, así que todo negocio sembrado por `seedOneTenant` nace con ventana de 30 días. El backstop nuevo rechazaba correctamente esa fecha con `date_out_of_window` (400), rompiendo los 4 tests de canchas (que son sobre derivación de service, no sobre la ventana). El código del backstop es correcto; el fallo es una interacción con un fixture cuya fecha sentinela predata la feature de ventana.
- **Fix:** En el `beforeAll` de `canchas-booking.test.ts`, tras sembrar, se setea explícitamente `max_advance_days: null, max_advance_date: null` en el negocio (opta por "sin límite") con un comentario que explica el porqué. Preserva la DATE y la intención del test (service derivation). La cobertura de la ventana vive en `lib/booking-window.test.ts` + `test/booking-window-exemption.test.ts`.
- **Files modified:** test/canchas-booking.test.ts
- **Commit:** `a31cc69`

## Verification

- `npx tsc --noEmit` — sin errores nuevos en `booking/create/route.ts` (OK-TSC).
- Presencia del guard: `isDateOutOfWindow` + `date_out_of_window` + `max_advance_date` en el route (OK-GUARD / OK-SELECT).
- `npx eslint` sobre los 3 archivos tocados — limpio.
- `npx vitest run test/booking-window-exemption.test.ts` → 4 passed.
- `npx vitest run lib/booking-window.test.ts test/manual-booking.test.ts` → 16 passed (no-regresión del predicado + alta manual).
- **Suite completa `npx vitest run` → 43 files, 598 passed | 1 skipped.**

## Threat Mitigations (del threat_model del plan)

- **T-04-09 (Tampering / fecha en el body):** mitigado — `isDateOutOfWindow(business, date)` valida server-side en hora AR aunque la UI se saltee.
- **T-04-10 (integridad / orphans):** mitigado — el guard corre ANTES del insert de `client` → sin `clients` huérfanos.
- **T-04-11 (bypass / exención del alta manual):** mitigado — la ventana vive solo en el route público; `appointments/create` y `booking-core` sin cambios → alta manual exenta sin abrir bypass del anti-doble-booking. Verificado por test de exención + no-regresión de `manual-booking`.

## Success Criteria — met

- Backstop rechaza fechas fuera de ventana en el flujo público (400 `date_out_of_window`) sin dejar `clients` huérfanos.
- Alta manual autenticada exenta (core window-agnostic, `appointments/create` no tocado), demostrado por tests.
- Cero regresión en el flujo público (rama seña/sin seña) y en el alta manual (suite completa verde).

## Self-Check: PASSED
- Archivos verificados en disco: route.ts, booking-window-exemption.test.ts, canchas-booking.test.ts, 04-04-SUMMARY.md.
- Commits verificados en git: `7487eb7` (backstop), `b695402` (test exención), `a31cc69` (fix fixture canchas).
