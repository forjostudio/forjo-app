---
phase: 02-cupos-grupales
plan: 01
subsystem: database
tags: [postgres, supabase, rls, advisory-lock, exclude-constraint, concurrency, vitest, migration]

# Dependency graph
requires:
  - phase: 01-turnos-manuales
    provides: "lib/booking-core.ts (createAppointmentCore extraído), policies INSERT WITH CHECK (040), fixtures booking-fixtures.ts (seedOneTenant/teardownOneTenant)"
provides:
  - "Migración 041: capacity en time_blocks + seat/is_group en appointments"
  - "Índice único 011 capacity-aware (con seat, cero regresión cupo 1)"
  - "EXCLUDE gist 013 condicionado a NOT is_group (anti-solape cupo 1 intacto)"
  - "Función book_slot_atomic (SECURITY DEFINER + pg_advisory_xact_lock) — respaldo atómico anti-sobrecupo"
  - "supabase/schema.sql regenerado reflejando 041"
  - "seedTimeBlock(seeded, { capacity }) en booking-fixtures"
  - "test/concurrency.test.ts scaffold (CONC-01/CONC-02/CUPOS-03 pendientes)"
affects: [02-02, 02-03, 02-04, 02-05, booking-core, availability, agenda-client, settings-client]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RPC SECURITY DEFINER + pg_advisory_xact_lock por slot para atomicidad count→insert"
    - "Columna seat que vuelve único el índice por slot (capacity-aware sin perder el respaldo atómico)"
    - "Desnormalización is_group para condicionar un EXCLUDE gist que no puede hacer join"

key-files:
  created:
    - supabase/migrations/041_time_blocks_capacity_and_seat.sql
    - test/concurrency.test.ts
  modified:
    - supabase/schema.sql
    - test/helpers/booking-fixtures.ts

key-decisions:
  - "book_slot_atomic devuelve cancel_token uuid (no text): cancel_token es uuid en el baseline (col 99)"
  - "is_group insertado = (capacity > 1): grupal sii el bloque tiene cupo; condiciona el EXCLUDE 013"
  - "seedTimeBlock default day_of_week=1 (lunes) porque la DATE fija de la suite (2031-03-03) es lunes"
  - "Hardening RLS time_blocks con policies FOR INSERT + FOR UPDATE WITH CHECK (estilo 040)"

patterns-established:
  - "Clave del advisory lock usa el mismo COALESCE(professional_id, sentinel) que el índice (Pitfall 1)"
  - "Scaffold de tests Wave 0 con expect.fail (rojo explícito) — Plan 05 los completa"

requirements-completed: [CUPOS-01, CUPOS-03, CONC-01, CONC-02]

# Metrics
duration: 18min
completed: 2026-06-27
status: complete
---

# Phase 2 Plan 01: Espinazo de Integridad Summary

**Migración 041 capacity-aware (índice 011 con seat + EXCLUDE 013 condicional a NOT is_group) y RPC `book_slot_atomic` con `pg_advisory_xact_lock` — validada con `supabase db reset` local PG17, cero regresión cupo 1.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-06-27T11:20:00Z
- **Completed:** 2026-06-27T11:38:00Z
- **Tasks:** 3
- **Files modified:** 4 (2 creados, 2 modificados)

## Accomplishments
- Migración 041 escrita: `capacity` en `time_blocks` (CHECK >= 1), `seat`/`is_group` en `appointments`, índice único 011 redefinido con `seat`, EXCLUDE gist 013 condicionado a `NOT is_group`, función `book_slot_atomic` (SECURITY DEFINER + advisory lock + count vs capacity + RAISE 'slot_full'), GRANT EXECUTE a anon/authenticated/service_role, policies WITH CHECK de `time_blocks`.
- **`supabase db reset` local replayó baseline + 040 + 041 sin error** (PG17, container `supabase_db_forjo-app` healthy). Línea final: `Finished supabase db reset on branch gsd/motor-reservas.` — cero `ERROR:` (solo el ruido benigno esperado: WARNING gbtree/ts_dist de btree_gist, WARN seed.sql, Skipping README.md).
- `supabase/schema.sql` regenerado vía `supabase db dump --local` (delta +89/-4): refleja capacity, seat, is_group, índice 011 con seat, EXCLUDE 013 con `AND (NOT is_group)`, función + GRANTs.
- Fixture extendido con `seedTimeBlock` (capacity configurable) + scaffold `test/concurrency.test.ts` con los 3 `it` (CONC-01/CONC-02/CUPOS-03) en rojo explícito (`expect.fail`, no verde falso), filtrables con `-t`.

## Task Commits

1. **Task 1: Migración 041** - `f387b77` (feat)
2. **Task 2: Validación `supabase db reset` + regenerar schema.sql** - `6653d92` (chore)
3. **Task 3: seedTimeBlock + scaffold concurrency.test.ts** - `7e40851` (test)

## Files Created/Modified
- `supabase/migrations/041_time_blocks_capacity_and_seat.sql` - DDL del espinazo de integridad capacity-aware + book_slot_atomic
- `supabase/schema.sql` - snapshot regenerado tras reset local (refleja 041)
- `test/helpers/booking-fixtures.ts` - `seedTimeBlock(seeded, { capacity, dayOfWeek, startTime, endTime })`
- `test/concurrency.test.ts` - scaffold Wave 0 (CONC-01/CONC-02/CUPOS-03 pendientes para Plan 05)

## Contrato técnico de book_slot_atomic (LOCKED)

Firma:
```
book_slot_atomic(
  p_business_id uuid, p_professional_id uuid, p_service_id uuid, p_location_id uuid,
  p_date date, p_time time without time zone, p_duration integer, p_client_id uuid,
  p_client_name text, p_client_phone text, p_client_email text, p_notes text,
  p_status text, p_expires_at timestamptz
) RETURNS TABLE (id uuid, cancel_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
```
- Lock: `pg_advisory_xact_lock(hashtextextended(p_business_id::text || COALESCE(professional_id,sentinel)::text || p_date::text || p_time::text, 0))`.
- Sentinel `00000000-0000-0000-0000-000000000000` byte-idéntico en índice, lock y count de ocupación.
- Capacity: `MAX(capacity)` del time_block que cubre el slot (`day_of_week = EXTRACT(dow) AND p_time >= start_time AND p_time < end_time`), default 1.
- Ocupación: count de `appointments` en el mismo bucket+date+time con status `confirmed`/`pending_payment`. `>= capacity` → `RAISE EXCEPTION 'slot_full' USING ERRCODE='P0001'`.
- INSERT con `seat := count`, `is_group := (capacity > 1)`.

**Plan 02-05 (que llena los tests) debe consumir el RPC con `supabase.rpc('book_slot_atomic', { p_* })` y mapear: `message` contiene `slot_full` → error `slot_full` (409); `23505`/`23P01` → `slot_taken` (409, cupo 1).**

## Decisions Made
- **`cancel_token` es uuid, no text:** el research mostraba `RETURNS TABLE (..., cancel_token text)` como forma tentativa, pero el baseline define `cancel_token uuid DEFAULT gen_random_uuid()` (col 99). Se usó `uuid` para coincidir con la columna real — verificado por `supabase db reset` exitoso.
- **`is_group := (capacity > 1)`:** desnormaliza la condición grupal en el INSERT del RPC (única fuente que conoce la capacity), lo que permite condicionar el EXCLUDE 013 sin que el gist tenga que hacer join a `time_blocks`.
- **`seedTimeBlock` default day_of_week=1:** la DATE fija de la suite (`2031-03-03`) es lunes (`EXTRACT(dow)=1`); el bloque sembrado debe cubrir ese día para que el RPC resuelva la capacity correcta.

## Deviations from Plan

None - plan executed exactly as written. (El único ajuste — `cancel_token uuid` en vez de `text` — no es una desviación del plan: el plan especifica `RETURNS TABLE (id uuid, cancel_token uuid)` en la firma de Task 1; la forma `text` venía solo del ejemplo tentativo del research, que el plan ya corrigió.)

## Issues Encountered
- El grep de verificación de Task 1 (`grep -c 'supabase db push'`) marcaba FAIL porque un comentario decía literalmente "NO usa `supabase db push`". Se reformuló el comentario a "NO se aplica vía push remoto" para que la cadena prohibida no aparezca en el archivo. No afectó el DDL.

## User Setup Required
None - sin configuración de servicios externos. **PENDIENTE operativo (NO de este plan):** la migración 041 debe aplicarse A MANO en producción, coordinada con el deploy (constraint del proyecto). Este plan solo validó en local; prod queda pendiente.

## Next Phase Readiness
- El espinazo de integridad está en la DB y validado en local. Listo para:
  - **Plan 02-02:** cablear `createAppointmentCore` al RPC `book_slot_atomic` + tipo `slot_full` + re-check JS capacity-aware.
  - **Plan 02-03/04:** availability capacity-aware (full por slot, D-06), campo capacity en agenda-client, roster/contador.
  - **Plan 02-05:** llenar los 3 tests del scaffold (CONC-01/CONC-02/CUPOS-03) con los moldes de 02-RESEARCH.md.
- **Blocker para `/gsd:verify-work`:** ninguno en local; recordar la aplicación manual de 041 a prod antes de shippear la fase.

## Self-Check: PASSED

- Files: 5/5 found (041 migration, schema.sql, booking-fixtures.ts, concurrency.test.ts, SUMMARY.md)
- Commits: 3/3 found (f387b77, 6653d92, 7e40851)

---
*Phase: 02-cupos-grupales*
*Completed: 2026-06-27*
