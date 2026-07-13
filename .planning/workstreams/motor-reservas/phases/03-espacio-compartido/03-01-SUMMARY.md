---
phase: 03-espacio-compartido
plan: 01
subsystem: database
tags: [postgres, rls, advisory-lock, multi-tenant, supabase, booking, concurrency]

# Dependency graph
requires:
  - phase: 02-cupos
    provides: "book_slot_atomic atómico (advisory lock slot+bucket + count vs capacity) en migración 041; bucketización COALESCE(professional_id, sentinel) byte-idéntica al índice 011 / EXCLUDE 013"
provides:
  - "tablas spaces + agenda_spaces (datos de tenant, RLS por op, sin read anon)"
  - "book_slot_atomic extendido in-place: advisory lock por espacio (orden ascendente) + EXISTS anti-solape cross-bucket con auto-exclusión"
  - "tipos de dominio Space / AgendaSpace en lib/types.ts"
  - "rama slot_taken de conflicto de espacio en lib/booking-core.ts"
  - "supabase/schema.sql regenerado con los nuevos objetos"
affects: [03-02-availability-acoplada, 03-03-ui-espacios, 03-04-appointment_spaces-backstop, 03-05-test-CONC-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Exclusión acoplada de espacio físico vía advisory lock por space_id (orden ascendente anti-deadlock) + EXISTS de solape de tiempo cross-bucket dentro de la misma tx SECURITY DEFINER"
    - "Modelo tabla-espacios + puente (spaces + agenda_spaces) en vez de exclusión explícita entre pares de agendas"

key-files:
  created:
    - supabase/migrations/042_spaces_and_coupled_exclusion.sql
  modified:
    - supabase/schema.sql
    - lib/types.ts
    - lib/booking-core.ts

key-decisions:
  - "La exclusión de espacio se extiende IN-PLACE dentro de book_slot_atomic (no se crea RPC nuevo) — misma firma de 14 params, mismo RETURNS TABLE"
  - "El conflicto de espacio reusa slot_taken (409); NO se introduce un código space_taken"
  - "agenda_spaces keya por professional_id REAL (no por v_bucket): la agenda sentinela/sin profesional no tiene espacios (Pitfall 1 / A2)"
  - "Ni spaces ni agenda_spaces tienen read anon (D-06): el bloqueo acoplado del read-path lo computa availability con service-role en Plan 02"
  - "El backstop appointment_spaces (EXCLUDE gist + trigger poblador) se difiere deliberadamente al Plan 03-04"

patterns-established:
  - "Lock por conjunto de espacios: array_agg(space_id ORDER BY space_id) → FOREACH pg_advisory_xact_lock por espacio en orden ascendente (evita deadlock entre agendas hermanas)"
  - "Anti-solape cross-bucket: EXISTS sobre appointments JOIN agenda_spaces de la agenda ajena, con tsrange && y self-exclusion por COALESCE(professional_id, sentinel) <> COALESCE(p_professional_id, sentinel) (Pitfall 3, F11 no cuenta contra sí misma)"

requirements-completed: [ESPACIO-01, ESPACIO-02, ESPACIO-03]

# Metrics
duration: ~12min
completed: 2026-06-30
status: complete
---

# Phase 3 Plan 01: Espacio compartido — espinazo de integridad Summary

**Modelo de datos de espacios físicos (spaces + puente agenda_spaces, RLS por tenant sin read anon) y extensión in-place de book_slot_atomic con advisory lock por espacio + EXISTS anti-solape cross-bucket — la exclusión acoplada vive en la DB, dentro de la misma tx SECURITY DEFINER que ya serializa el anti-sobrecupo de Phase 2.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 4 (3 de implementación + 1 checkpoint human-verify aprobado)
- **Files modified:** 4 (1 creado, 3 modificados)

## Accomplishments
- Migración 042 aditiva: tablas `spaces` y `agenda_spaces` por negocio, RLS habilitada con 4 policies por operación cada una (8 en total), predicado de tenant `owner_id = (SELECT auth.uid())`, insert/update con WITH CHECK, sin read anon.
- `book_slot_atomic` extendido IN-PLACE (CREATE OR REPLACE con firma idéntica de la 041): resuelve el set de espacios de la agenda vía `agenda_spaces`, toma un advisory lock por cada `space_id` en orden ascendente, y rechaza con `slot_taken` (409) si una agenda hermana (otro bucket que comparte ≥1 espacio) solapa en tiempo. Auto-conflicto excluido (la F11 que ocupa {A,B,C} no cuenta contra sí misma).
- Tipos de dominio `Space` y `AgendaSpace` en `lib/types.ts` (snake_case espejo de la fila DB) + rama de traducción de constraint a `slot_taken` en `lib/booking-core.ts`.
- `supabase/schema.sql` regenerado (`supabase db dump --local`) con `public.spaces`, `public.agenda_spaces`, sus 8 policies y el `book_slot_atomic` extendido.

## Task Commits

Cada tarea se commiteó atómicamente:

1. **Task 1: migración 042 — tablas spaces + agenda_spaces con RLS por op** - `a62b0f6` (feat)
2. **Task 2: extender book_slot_atomic — lock por espacio + EXISTS anti-solape** - `8958ea6` (feat)
3. **Task 3: tipos Space/AgendaSpace + branch slot_taken en booking-core** - `bc28175` (feat)
4. **Task 4: regenerar supabase/schema.sql (migración 042)** - `30a8e7d` (chore)

_Task 4 era el checkpoint human-verify (BLOCKING): el orquestador corrió `supabase db reset` local PG17 — baseline + 040 + 041 + 042 aplicaron LIMPIO, RLS=true en ambas tablas con 4 policies cada una, `book_slot_atomic` presente con la extensión. Aprobado → se commiteó el schema.sql regenerado._

## Files Created/Modified
- `supabase/migrations/042_spaces_and_coupled_exclusion.sql` - tablas spaces + agenda_spaces con RLS por op + redefinición de book_slot_atomic con lock por espacio + EXISTS anti-solape cross-bucket
- `supabase/schema.sql` - regenerado con los nuevos objetos (165 inserciones)
- `lib/types.ts` - interfaces `Space` y `AgendaSpace`
- `lib/booking-core.ts` - rama de traducción del nuevo conflicto de espacio a `slot_taken`

## Decisions Made
- **Exclusión IN-PLACE, no RPC nuevo:** la extensión de espacio se metió dentro de `book_slot_atomic` reusando la firma de 14 params; el caller (booking-core) no cambia de RPC, solo reconoce el nuevo `slot_taken`.
- **slot_taken, no space_taken:** el conflicto de espacio reusa el código 409 existente — el cliente no distingue "agenda llena" de "espacio ocupado", lo cual es correcto para la UX de booking.
- **agenda_spaces keya por professional_id real:** la resolución del set de espacios usa `p_professional_id` crudo (no `v_bucket`), porque la sentinela/agenda sin profesional no tiene espacios físicos (Pitfall 1 / A2).
- **Bucketización byte-idéntica:** el `COALESCE(professional_id, '00000000-...'::uuid)` del EXISTS es byte-idéntico al `v_bucket` de la 041 y al índice 011 / EXCLUDE 013 — invariante anti-regresión.
- **Backstop diferido:** `appointment_spaces` (tabla proyección + EXCLUDE gist + trigger poblador) NO se construye en este plan; se difiere deliberadamente al **Plan 03-04**. Este plan entrega la exclusión por advisory lock; el EXCLUDE gist es el cinturón-y-tiradores que se monta encima.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Pending Deploy Step (NO hecho en este plan)

**La migración 042 NO se aplicó a producción todavía.** Igual que la 041, el deploy a prod es a mano y coordinado:

1. Aplicar `supabase/migrations/042_spaces_and_coupled_exclusion.sql` A MANO al Supabase de **producción**, en orden, después del baseline + 040 + 041.
2. Inmediatamente después ejecutar `NOTIFY pgrst, 'reload schema';` para que PostgREST recargue el esquema y vea las nuevas tablas/función.
3. Coordinar ambos pasos **con el deploy** del código (los tipos y la rama de booking-core ya viven en la rama, pero la función extendida debe existir en la DB antes de que el código la invoque).

La validación local (`supabase db reset` PG17 + `supabase db dump --local`) ya está hecha y NO debe re-correrse.

## Next Phase Readiness
- **Plan 03-02** (disponibilidad acoplada read-path en `/api/booking/availability`) puede construirse encima: ya existen `agenda_spaces` y el set de espacios resoluble con service-role.
- **Plan 03-04** (backstop `appointment_spaces` EXCLUDE gist + trigger) montará el cinturón-y-tiradores sobre la exclusión por advisory lock entregada acá.
- **Plan 03-05** (test CONC-03) puede ejercitar el rechazo cross-bucket con fixtures `seedSpace` / `seedAgendaSpace`.
- **Blocker de prod:** la 042 debe aplicarse a mano a producción + `NOTIFY pgrst` antes del deploy del milestone (ver "Pending Deploy Step").

## Self-Check: PASSED

Todos los archivos creados/modificados existen en disco y los 4 commits de tarea (a62b0f6, 8958ea6, bc28175, 30a8e7d) están en el historial.

---
*Phase: 03-espacio-compartido*
*Completed: 2026-06-30*
