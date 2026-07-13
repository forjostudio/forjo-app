---
phase: 03-espacio-compartido
plan: 05
subsystem: testing
tags: [vitest, concurrency, advisory-lock, supabase, postgres, espacio-compartido]

# Dependency graph
requires:
  - phase: 03-01
    provides: book_slot_atomic extendido con advisory lock por space_id + migración 042 (spaces/agenda_spaces)
  - phase: 03-02
    provides: disponibilidad acoplada + re-check de espacio en booking-core
  - phase: 03-04
    provides: appointment_spaces + EXCLUDE backstop + triggers
provides:
  - "Fixtures seedSpace/seedAgendaSpace/seedProfessional para sembrar espacios y mapear agendas hermanas a un espacio compartido"
  - "Test CONC-03: prueba determinista de que dos reservas concurrentes sobre agendas que comparten espacio resuelven 1 ok + 1 slot_taken"
  - "Guarda de no-regresión del milestone: si la exclusión de espacio se rompiera, la suite queda roja"
affects: [motor-reservas, espacio-compartido, concurrencia, canchas]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Verificación independiente del estado de la DB (occupantsAt) en vez de confiar en los retornos del core"
    - "Promise.all de dos createAppointmentCore para forzar la carrera real; determinismo vía advisory lock por espacio"

key-files:
  created: []
  modified:
    - test/helpers/booking-fixtures.ts
    - test/concurrency.test.ts

key-decisions:
  - "Helper aparte seedProfessional (2ª agenda hermana) en vez de extender SeededTenant: no rompe la firma de seedOneTenant que usan CONC-01/02/CUPOS"
  - "Canchas modeladas como capacity=1: el conflicto es por solape de espacio (D-03), no por cupo lleno → assert slot_taken, no slot_full"
  - "Cleanup de agenda_spaces + spaces en afterEach (agenda_spaces antes que spaces por FK) para no contaminar otros tests del mismo business"

patterns-established:
  - "Conflicto de espacio compartido: dos professional_id reales distintos mapeados al mismo space_id, reservas solapadas en tiempo colisionan por el advisory lock del RPC"
  - "occupantsAt sin filtrar por agenda captura ambas agendas hermanas que comparten el espacio → verifica que solo 1 fila ocupó el slot"

requirements-completed: [CONC-03]

# Metrics
duration: 12min
completed: 2026-06-30
status: complete
---

# Phase 3 Plan 5: CONC-03 anti-conflicto-de-espacio concurrente Summary

**Test Vitest determinista que prueba que dos reservas en paralelo sobre agendas distintas que comparten un espacio físico resuelven exactamente 1 ok + 1 slot_taken, verificado contra el estado real de la DB; más los fixtures seedSpace/seedAgendaSpace/seedProfessional.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-30T15:06:03Z
- **Completed:** 2026-06-30T15:18:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Fixtures `seedSpace` (inserta en `spaces`, devuelve space_id), `seedAgendaSpace` (mapea agenda↔espacio en `agenda_spaces`) y `seedProfessional` (2ª agenda hermana real) — molde de `seedTimeBlock`, service-role + throw en error.
- Test `CONC-03` en `test/concurrency.test.ts`: dos `createAppointmentCore` en `Promise.all` sobre dos professional_id reales distintos mapeados al mismo espacio A, al mismo horario solapado → exactamente 1 ok + 1 slot_taken (409).
- Verificación independiente de la DB (`occupantsAt('09:00') === 1`): no confía en los retornos del core, sino en que exactamente 1 fila ocupa el slot solapado a través de ambas agendas hermanas.
- Suite completa verde contra Supabase local con 042 aplicada: 302 tests, 26 archivos, cero regresión (CONC-01/02, CUPOS-02/03, booking-core intactos).

## Task Commits

Cada tarea se commiteó atómicamente:

1. **Task 1: Fixtures seedSpace + seedAgendaSpace + 2ª agenda hermana** - `c2b09cd` (test)
2. **Task 2: Test CONC-03 — anti-conflicto-de-espacio concurrente** - `8f8cbe0` (test)

## Files Created/Modified
- `test/helpers/booking-fixtures.ts` - Agrega `seedSpace`, `seedAgendaSpace`, `seedProfessional` (helpers service-role aparte, sin tocar la firma de `seedOneTenant`/`seedTimeBlock`).
- `test/concurrency.test.ts` - Importa los 3 helpers nuevos; agrega cleanup de `agenda_spaces`/`spaces` en `afterEach`; agrega el test `CONC-03` con `Promise.all` + assert de DB.

## Decisions Made
- **Helper `seedProfessional` aparte** en lugar de extender `SeededTenant` con un `professionalIdB`: la alternativa menos invasiva, no cambia la firma de `seedOneTenant` que comparten CONC-01/02/CUPOS.
- **Canchas = capacity 1** (no se prueba cupo): CONC-03 verifica el solape de espacio (D-03), por eso el rechazo esperado es `slot_taken` (doble-booking por espacio), no `slot_full`.
- **Cleanup en `afterEach`**: `agenda_spaces` antes que `spaces` por la FK; `appointment_spaces` cae por CASCADE de `appointments`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. El test corrió verde a la primera contra el Supabase local (creds presentes → `describe.skipIf` no skipeó); `npx tsc --noEmit` limpio en ambas tareas.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CONC-03 cierra el criterio de éxito duro de Phase 03 (espacio compartido): la exclusión atómica de espacio bajo concurrencia queda probada y blindada como guarda de no-regresión.
- Phase 03 (espacio-compartido) completa con sus 5 planes (03-01..03-05). Listo para verificación de fase / secure-phase.

## Self-Check: PASSED

- `test/helpers/booking-fixtures.ts` — FOUND
- `test/concurrency.test.ts` — FOUND
- `03-05-SUMMARY.md` — FOUND
- Commit `c2b09cd` (Task 1) — FOUND
- Commit `8f8cbe0` (Task 2) — FOUND

---
*Phase: 03-espacio-compartido*
*Completed: 2026-06-30*
