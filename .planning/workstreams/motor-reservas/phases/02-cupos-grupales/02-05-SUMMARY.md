---
phase: 02-cupos-grupales
plan: 05
subsystem: booking
tags: [tests, concurrency, vitest, capacity, anti-oversell, non-leak, d-06]

# Dependency graph
requires:
  - phase: 02-cupos-grupales
    provides: "041: book_slot_atomic (advisory lock + count vs capacity + RAISE slot_full) — la garantía atómica que estos tests prueban"
  - phase: 02-cupos-grupales
    provides: "createAppointmentCore → RPC + mapeo slot_full/slot_taken (02-02)"
  - phase: 02-cupos-grupales
    provides: "availability capacity-aware { ok, busy, full } (02-03)"
provides:
  - "Suite de concurrencia: CONC-01 (anti-sobrecupo), CONC-02 (cero-regresión cupo 1), CUPOS-03 (hasta capacity), CUPOS-02 (no-leak D-06)"
  - "Gate de la fase: npm test verde (301) con 041 aplicada — criterio de éxito DURO"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Promise.all de dos altas sobre el último lugar → asertar 1 ok + 1 slot_full Y verificar el estado de la DB con t.admin (no solo los resultados): el advisory lock lo hace determinista"
    - "professionalId fijo (no null) en todas las altas del mismo slot para no mezclar bucket null/sentinel (Pitfall 1)"
    - "Invocar el route handler GET directo con new Request(url) as NextRequest (Next 16, sin server vivo) para asertar el contrato no-leak"

key-files:
  created: []
  modified:
    - test/concurrency.test.ts

key-decisions:
  - "CONC-01 verifica el estado de la DB (occupantsAt → exactamente 2 filas), no solo los resultados del core: es la prueba real de no-sobrecupo (T-02-16)"
  - "CONC-02 asierta explícitamente slot_taken (NO slot_full) para cupo 1 — guarda de cero-regresión (T-02-17)"
  - "CUPOS-02 invoca el route handler real (no replica su lógica): asierta Object.keys === [busy, full, ok] + ausencia de claves de conteo en busy + full en HH:MM"
  - "El slug del fixture se lee de la DB con t.admin en vez de extender SeededTenant: este plan solo toca test/concurrency.test.ts"

requirements-completed: [CONC-01, CONC-02, CUPOS-03, CUPOS-02]

# Metrics
duration: 12min
completed: 2026-06-29
status: complete
---

# Phase 2 Plan 05: Tests de Concurrencia (Anti-Sobrecupo + No-Regresión Cupo 1 + No-Leak) Summary

**`test/concurrency.test.ts` pasa de scaffold (3 `expect.fail`) a 4 tests reales verdes contra Supabase local con 041 aplicada: CONC-01 prueba que dos altas concurrentes sobre el último lugar de un cupo=2 resuelven 1 ok + 1 `slot_full` y dejan exactamente 2 filas en la DB (no 3); CONC-02 fija que cupo=1 sigue dando `slot_taken` (no `slot_full`); CUPOS-03 que cupo=N admite N y rechaza el excedente; CUPOS-02 que `/api/booking/availability` solo devuelve `{ ok, busy, full }` sin filtrar lugares restantes. Suite completa: 301 tests verdes (+4), cero regresión.**

## Performance

- **Tasks:** 1 (TDD: scaffold RED preexistente → GREEN)
- **Files modified:** 1 (solo test)
- **Duration:** ~12 min
- **Completed:** 2026-06-29

## Accomplishments
- **CONC-01 (anti-sobrecupo concurrente):** `seedTimeBlock({ capacity: 2 })`, se ocupa seat 0, luego `Promise.all` de dos `createAppointmentCore` sobre `'09:00'`. Asierta `oks.length === 1` y `fulls.length === 1` (error `slot_full`). Verificación independiente con `t.admin`: exactamente **2 filas** ocupando el slot (no 3). El advisory lock del RPC serializa la carrera en la DB → determinista, no flaky.
- **CONC-02 (cero-regresión cupo 1):** `seedTimeBlock({ capacity: 1 })`, 1ª reserva ok, 2ª → `slot_taken` (status 409), **explícitamente NO `slot_full`**. DB conserva 1 fila. Locks el anti-doble-booking de v0.9 byte-por-byte (índice único de seat → 23505 → slot_taken).
- **CUPOS-03 (admite hasta capacity):** `seedTimeBlock({ capacity: 3 })`, 3 altas secuenciales ok, la 4ª → `slot_full`. DB con exactamente 3 filas.
- **CUPOS-02 (no-leak D-06):** invoca el route handler `GET` real (`new Request(url) as NextRequest`) con un slot grupal parcial (2/3), uno lleno (3/3) y uno individual ocupado (1/1). Asierta `Object.keys(body) === [busy, full, ok]` (nada más), ausencia de claves `count/remaining/seat/capacity/...` en cada entrada de `busy`, `full` como `string[]`, y las dos regresiones del UAT: (a) el slot lleno `'10:00'` está en `full` en formato **'HH:MM'** (no 'HH:MM:SS'); (b) el slot parcial `'09:00'` NO está ni en `full` ni en `busy` (sigue reservable); (c) el individual `'12:30'` está en busy Y full (cupo 1 coinciden).
- **Suite completa:** `npm test` → **26 files / 301 tests verdes** (eran ~297; +4 de concurrencia). `npx tsc --noEmit` exit 0. Cero regresión en booking-core.test.ts (cupo 1).

## Conteo final de la suite (para memoria del proyecto)
- `npm test` (Vitest): **301 tests / 26 files** — todos verdes.
- Antes de este plan: 297 (con 3 `expect.fail` del scaffold contando como fallos pendientes); ahora 301 reales.

## Task Commits
1. **test(02-05): completar tests de concurrencia (CONC-01/02, CUPOS-03/02)** — `c4fd73b`

## Files Modified
- `test/concurrency.test.ts` — reemplazo de los 3 `expect.fail` placeholder por 4 cuerpos reales (CONC-01, CONC-02, CUPOS-03, CUPOS-02) + helper `occupantsAt` (verificación DB independiente) + `baseInput` con professionalId fijo (anti Pitfall 1).

## Decisions Made
- **Verificación de DB en CONC-01/CONC-02/CUPOS-03:** se asierta el estado real con `t.admin` (no solo los resultados del core). Es lo que detectaría un sobrecupo (3 filas) si el advisory lock fallara — el resultado del core podría mentir, la DB no.
- **CONC-02 explícito `slot_taken` ≠ `slot_full`:** si la 2ª reserva cupo 1 diera `slot_full`, el test pasaría pero enmascararía una regresión del camino cupo 1. El assert literal lo previene (T-02-17).
- **CUPOS-02 invoca el handler real:** en vez de replicar la lógica de availability, se llama `availabilityGET(new Request(url) as NextRequest)`. Asierta el contrato serializado de punta a punta (incluido el `.slice(0,5)` → 'HH:MM'), no una reimplementación.
- **professionalId fijo en todas las altas del mismo slot:** evita mezclar bucket `null` vs sentinela entre reservas del mismo slot, que rompería la serialización del advisory lock (Pitfall 1).
- **slug leído de la DB, no del fixture:** `SeededTenant` no expone `slug`; se lee con `t.admin` para no modificar el fixture (este plan solo toca `test/concurrency.test.ts`).

## Deviations from Plan
None - plan ejecutado tal como está escrito. El scaffold tenía 3 `it` (CONC-01/02, CUPOS-03); se agregó el 4º `it` de CUPOS-02 que el plan especifica en `<behavior>` y en `requirements: [..., CUPOS-02]`.

## Known Stubs
None.

## Threat Flags
None — el plan solo agrega tests (sin superficie de seguridad nueva). Las mitigaciones del `<threat_model>` quedaron cubiertas por aserciones: T-02-16 (CONC-01 verifica la DB, no los resultados), T-02-17 (CONC-02 asierta slot_taken ≠ slot_full), T-02-18 (CUPOS-02 asierta ausencia de conteo/lugares restantes).

## Issues Encountered
- `t.slug` no existía en `SeededTenant` (la primera versión lo asumía). Resuelto leyendo el slug de `businesses` con `t.admin` en el propio test, sin tocar el fixture.

## User Setup Required
None. El gate corre contra Supabase local (`.env.test.local` → 127.0.0.1 con 041 aplicada por `supabase db reset`). Sin las 3 creds, la suite se skipea (no falla) — el gate real exige las creds + 041.

## Self-Check: PASSED

- File: `test/concurrency.test.ts` found (182 insertions, 22 deletions sobre el scaffold)
- Commit: `c4fd73b` found
- `npx vitest run test/concurrency.test.ts` → 4 passed
- `npm test` → 301 passed (26 files), cero regresión
- `npx tsc --noEmit` → exit 0
- No production code modificado (solo test)

---
*Phase: 02-cupos-grupales*
*Completed: 2026-06-29*
