---
phase: 06-modelo-del-abono-alta-manual-generaci-n-forward
plan: 02
subsystem: booking
tags: [typescript, supabase, booking-core, abonos, multi-tenant, motor-generacion, vitest]

# Dependency graph
requires:
  - phase: 06-01-modelo-del-abono
    provides: "tabla abonos + appointments.abono_id (FK) + interface Abono/Appointment.abono_id en lib/types.ts"
  - phase: motor-reservas (booking-core)
    provides: "createAppointmentCore — núcleo atómico rol-agnóstico (advisory lock + count vs capacity + EXISTS espacio + constraints 011/013)"
provides:
  - "lib/abono-generation.ts — motor forward generateAbonoOccurrences(input) → {created, skipped}"
  - "Garantía: toda ocurrencia del abono se materializa vía createAppointmentCore, nunca por insert directo"
  - "Skip-and-record ante conflicto (slot_taken/slot_full/day_closed/out_of_hours/invalid_*) sin pisar turnos ajenos"
  - "Precedencia por fecha: schedule_exception (incl. horario especial closed=false) OVERRIDE grilla semanal time_blocks"
  - "Idempotencia forward por (business_id, abono_id, date) no-cancelado"
affects: [06-03-alta-manual, 06-04-cron, 07-cancelacion-serie]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Motor puro: NO persiste generated_until ni appendea skipped_occurrences — devuelve el resultado y el caller (Plan 03/04) lo aplica"
    - "abono_id como etiqueta no-constraint: UPDATE acotado por id+business_id post-insert atómico (no relaja el anti-doble-booking, D-04/D-10)"
    - "Iteración de a 7 días desde la 1ª fecha que matchea el dow (no día a día): acota el loop (T-06-08)"
    - "getUTCDay() sobre `${date}T00:00:00Z` = convención EXTRACT(dow) de la DB (0=domingo..6=sábado)"

key-files:
  created:
    - lib/abono-generation.ts
    - test/abono-generation.test.ts
  modified: []

key-decisions:
  - "El horario especial (schedule_exception closed=false) es la ÚNICA autoridad de horario para ese día: OVERRIDE la grilla semanal, no se exige además un time_block (augmentation del plan-check)"
  - "Ante excepción de fecha se elige la MÁS específica: la que matchea location_id del abono gana sobre la global (location_id null)"
  - "Motor rol-agnóstico (recibe supabase): service-role en el cron, anon+RLS en el alta autenticada; no crea su cliente"

patterns-established:
  - "Motor de materialización de series: itera fechas → guardas de agenda (excepción/grilla) → idempotencia → createAppointmentCore → etiqueta abono_id"

requirements-completed: [ABONO-02]

# Metrics
duration: 18min
completed: 2026-07-20
status: complete
---

# Phase 6 Plan 02: Motor de generación forward del abono Summary

**`lib/abono-generation.ts` genera la serie del abono materializando cada ocurrencia semanal vía `createAppointmentCore` (núcleo atómico anti-doble-booking); ante conflicto SALTEA + registra sin pisar, etiqueta el turno con `abono_id` (UPDATE acotado por tenant), respeta día cerrado / horario especial / grilla semanal con precedencia por fecha, es idempotente y aislado por tenant. 6 tests contra la DB local en verde.**

## Performance

- **Duration:** ~18 min
- **Completed:** 2026-07-20
- **Tasks:** 2
- **Files modified:** 2 (2 creados, 0 modificados)

## Accomplishments
- `generateAbonoOccurrences({ supabase, business, abono, fromDate, toDate })` → `{ created: string[]; skipped: {date, reason}[] }`.
- Iteración semanal exacta: desde la 1ª fecha del rango cuyo `getUTCDay()` == `abono.day_of_week`, avanzando de a 7 días (acota el loop, T-06-08).
- Toda alta pasa por `createAppointmentCore` (import + llamada única por ocurrencia). CERO insert directo a `appointments` y CERO `.rpc('book_slot_atomic')` en el archivo — verificado por gate.
- Skip-and-record (D-06): `slot_taken`/`slot_full` (esperados) + `invalid_service`/`invalid_professional`/`insert_failed` (defensivo) → van a `skipped` y la serie CONTINÚA; nunca se pisa el turno ajeno.
- Guardas de "el negocio abre a esta hora" que el core NO evalúa, con **precedencia por fecha**:
  - `schedule_exception` closed=true (global o del location del abono) → skip `day_closed`, sin llamar al core.
  - `schedule_exception` closed=false (horario especial) → ventana EXACTA `[start_time, end_time)` que OVERRIDE la grilla semanal; fuera de ella → skip `out_of_hours` (augmentation del plan-check).
  - Sin excepción → cae la grilla semanal `time_blocks` del `day_of_week`; fuera de todo bloque → skip `out_of_hours`.
- `abono_id` seteado con `UPDATE ... .eq('id', appointmentId).eq('business_id', business.id)` tras el insert atómico (etiqueta no-constraint → no relaja el anti-doble-booking, D-04/D-10).
- Idempotencia: existe un turno `(business_id, abono_id, date)` no-cancelado → no se regenera (ni `created` ni `skipped`), haciendo re-correr el motor un no-op.
- Motor PURO: no persiste `generated_until` ni `skipped_occurrences` — eso lo hacen los callers (Plan 03/04) con el resultado.

## Task Commits

1. **Task 1: Motor generateAbonoOccurrences** — `3eafb9a` (feat)
2. **Task 2: Tests del motor contra la DB local** — `77a3524` (test)

## Files Created/Modified
- `lib/abono-generation.ts` — motor forward: iteración semanal, guardas de agenda con precedencia por fecha, idempotencia, paso por booking-core, etiqueta abono_id acotada por tenant.
- `test/abono-generation.test.ts` — 6 casos vitest contra la DB local (iteración, no-pisa, idempotencia, día cerrado, horario especial, aislamiento).

## Decisions Made
- **Horario especial = autoridad única del día:** una `schedule_exception` con `closed=false` define la ventana abierta EXACTA de esa fecha y OVERRIDE la grilla semanal; no se exige además un `time_block` (evita que un turno dentro del bloque semanal pero fuera de la ventana especial se genere mal). Refina la guarda (3) del plan (augmentation del plan-check).
- **Excepción más específica gana:** ante una excepción global (location_id null) y una del location del abono para la misma fecha, se aplica la del location del abono.
- **Motor puro y testeable:** no toca la fila del abono — el estado rolling lo administra el caller. Mantiene el núcleo aislado y determinístico.

## Deviations from Plan

### Auto-fixed Issues

None — el plan se ejecutó tal cual, incorporando la augmentation obligatoria del orquestador (horario especial `closed=false`) como parte de la guarda (3) de la Task 1 y su caso de test en la Task 2. No fue una desviación sino una instrucción explícita del prompt.

**Total deviations:** 0.

## Threat Mitigations Applied
- **T-06-05 (Tampering):** toda alta pasa por `createAppointmentCore`; gate confirma sin insert/RPC directo.
- **T-06-06 (Tampering):** ante `slot_taken`/`slot_full` se saltea + registra; jamás UPDATE/DELETE sobre el turno ajeno — test "no-pisa" (caso 2) lo prueba.
- **T-06-07 (Info Disclosure / cross-tenant):** todas las queries (clients/schedule_exceptions/time_blocks/appointments) filtran por `business_id` del abono; el UPDATE de `abono_id` lleva `.eq('business_id', business.id)` — test de aislamiento (caso 6) lo prueba.
- **T-06-08 (DoS):** rango acotado provisto por el caller + avance de a 7 días + guarda `fromDate > toDate` → sin recursión ni loop infinito.

## Issues Encountered
- `appointments.abono_id` es FK a `abonos(id)`: el test DEBE sembrar una fila real de `abonos` (no basta un UUID sintético), o el UPDATE de la etiqueta viola la FK. Resuelto sembrando client + abono reales en `beforeAll`.

## User Setup Required
None.

## Next Phase Readiness
- Plan 03 (alta manual) puede llamar `generateAbonoOccurrences` con la sesión del dueño (anon+RLS) tras insertar la fila del abono, y persistir `generated_until` + appendear `skipped_occurrences` con el resultado.
- Plan 04 (cron) puede iterar abonos activos y extender la ventana rolling reusando el mismo motor (idempotente sobre el rango ya generado).

## Self-Check: PASSED
- Archivos verificados: lib/abono-generation.ts, test/abono-generation.test.ts, 06-02-SUMMARY.md — presentes.
- Commits verificados: 3eafb9a (Task 1), 77a3524 (Task 2) — en git log.
- Gate: `grep -E "book_slot_atomic|\.from\('appointments'\)\.insert" lib/abono-generation.ts` → vacío (solo el path createAppointmentCore + UPDATE abono_id acotado).
- tsc `--noEmit` pasa; `vitest run test/abono-generation.test.ts` → 6/6 verde.

---
*Phase: 06-modelo-del-abono-alta-manual-generaci-n-forward*
*Completed: 2026-07-20*
