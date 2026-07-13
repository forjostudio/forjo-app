---
phase: 03-espacio-compartido
plan: 04
subsystem: database
tags: [postgres, rls, exclude-gist, btree_gist, trigger, multi-tenant, supabase, booking, concurrency]

# Dependency graph
requires:
  - phase: 03-espacio-compartido
    provides: "book_slot_atomic extendido (advisory lock por espacio + EXISTS anti-solape cross-bucket) + tablas spaces/agenda_spaces en migración 042 (Plan 03-01)"
provides:
  - "tabla de proyección appointment_spaces (PK (appointment_id, space_id), slot tsrange, FKs ON DELETE CASCADE, RLS sin read anon)"
  - "EXCLUDE gist appointment_spaces_no_overlap (business_id WITH =, space_id WITH =, slot WITH &&) — backstop declarativo cross-bucket"
  - "trigger AFTER INSERT appointment_spaces_populate — expande la agenda a sus espacios vía agenda_spaces e inserta la proyección (confirmed/pending_payment)"
  - "trigger AFTER UPDATE OF status appointment_spaces_cleanup — borra la proyección al cancelar/expirar"
  - "supabase/schema.sql regenerado con la proyección + EXCLUDE + triggers"
affects: [03-05-test-CONC-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Backstop de integridad declarativo vía tabla de proyección desnormalizada (turno×espacio) + EXCLUDE gist, atómico dentro de la tx del insert del appointment — no bypasseable por app-logic"
    - "Triggers AFTER INSERT / AFTER UPDATE OF status que pueblan y limpian la proyección espejando el WHERE de status del EXCLUDE 013"

key-files:
  created: []
  modified:
    - supabase/migrations/042_spaces_and_coupled_exclusion.sql
    - supabase/schema.sql

key-decisions:
  - "El backstop es un EXCLUDE sobre la proyección appointment_spaces, NO sobre appointments — un EXCLUDE directo no podría expandir el fan-out F11→{A,B,C} vía la puente agenda_spaces"
  - "El backstop NO reemplaza el advisory lock del Plan 03-01: es defensa en profundidad ADICIONAL (Pitfall 6); si se hubiera recortado, ESPACIO-03 igual quedaba cumplido por el advisory lock"
  - "El conflicto de la proyección reusa 23P01 → slot_taken (booking-core ya lo mapea); no se introduce código nuevo"
  - "appointment_spaces no tiene read anon (D-06): la proyección es interna; RLS habilitada con select por owner_id para el dashboard si hiciera falta"
  - "Sin backfill de turnos previos: el backstop aplica a reservas creadas TRAS la migración (RESEARCH §Runtime State Inventory)"

patterns-established:
  - "Proyección turno×espacio: el trigger AFTER INSERT inserta una fila por (appointment × space) expandiendo agenda_spaces filtrado por business_id + professional_id, solo para status que ocupan (confirmed/pending_payment); agenda sin espacios → 0 filas, cero overhead"
  - "Auto-conflicto F11 excluido por construcción: cada espacio aparece una sola fila por appointment, así el EXCLUDE solo choca contra OTROS appointment_id (Pitfall 3)"

requirements-completed: [ESPACIO-03]

# Metrics
duration: ~8min
completed: 2026-06-30
status: complete
---

# Phase 3 Plan 04: Backstop de integridad appointment_spaces Summary

**Tabla de proyección `appointment_spaces` (una fila por turno×espacio) con su propio EXCLUDE gist `appointment_spaces_no_overlap` y los triggers que la pueblan/limpian desde `appointments` — el único backstop declarativo y atómico cross-espacio: si el advisory lock del Plan 03-01 tuviera un bug, el insert de la proyección choca con 23P01 y aborta toda la transacción del appointment.**

## Performance

- **Duration:** ~8 min
- **Tasks:** 3 (2 de implementación + 1 checkpoint human-verify aprobado)
- **Files modified:** 2 (migración 042 amendada in-place + schema.sql regenerado)

## Accomplishments
- **Proyección + EXCLUDE (Task 1):** amendado al MISMO `042_*.sql` (tras el RPC del Plan 01): tabla `public.appointment_spaces` (`appointment_id` FK ON DELETE CASCADE, `business_id`, `space_id` FK ON DELETE CASCADE, `slot tsrange NOT NULL`, PK `(appointment_id, space_id)`), RLS habilitada sin read anon (D-06), y el `EXCLUDE USING gist (business_id WITH =, space_id WITH =, slot WITH &&)` que rechaza mismo negocio + mismo espacio + rangos solapados con 23P01 (ya mapeado a `slot_taken`/409 por booking-core). `btree_gist` ya estaba habilitado por el EXCLUDE 013.
- **Triggers (Task 2):** dos funciones plpgsql SECURITY DEFINER SET search_path = public con sus triggers en `appointments`:
  - `appointment_spaces_populate()` AFTER INSERT: expande la agenda a sus espacios vía `agenda_spaces` (filtrado por `business_id` + `professional_id`) e inserta una fila por espacio con `tsrange(date+time, date+time + make_interval(mins => COALESCE(duration_minutes,30)))`, solo para `status IN ('confirmed','pending_payment')`. Agenda sin espacios → subconsulta vacía → 0 filas (cero overhead para cupos/individual). La F11 expande a 3 filas (A,B,C), cada cruzada a 1; cada espacio una sola vez por appointment.
  - `appointment_spaces_cleanup()` AFTER UPDATE OF status: `DELETE FROM appointment_spaces WHERE appointment_id = NEW.id` cuando el turno deja de ocupar (cancelled/expirado) y antes ocupaba — espejo del WHERE de status del EXCLUDE 013. El core pasa los holds vencidos a cancelled ANTES del RPC, así que el trigger los limpia.
- **schema.sql regenerado (Task 3):** `supabase db dump --local` tras el `supabase db reset` exitoso; ahora incluye `appointment_spaces` + el EXCLUDE + ambos triggers (108 inserciones).

## Task Commits

Cada tarea se commiteó atómicamente:

1. **Task 1+2: backstop appointment_spaces — proyección + EXCLUDE gist + triggers** - `e7383b1` (feat)
2. **Task 3: regenerar supabase/schema.sql (backstop appointment_spaces)** - `ce4ff56` (chore)

_Task 3 era el checkpoint human-verify (BLOCKING): el orquestador corrió `supabase db reset` local PG17 — baseline + 040 + 041 + 042 completa (con el backstop) aplicó LIMPIO, sin error. Verificado en vivo: tabla `appointment_spaces` presente, constraint `appointment_spaces_no_overlap` presente, ambos triggers presentes, RLS habilitada. Aprobado → se commiteó el schema.sql regenerado. NO se re-corrió `supabase db reset`/`db dump`._

## Files Created/Modified
- `supabase/migrations/042_spaces_and_coupled_exclusion.sql` - amendado in-place: tabla de proyección `appointment_spaces` + EXCLUDE gist `appointment_spaces_no_overlap` + triggers de población (AFTER INSERT) y limpieza (AFTER UPDATE OF status)
- `supabase/schema.sql` - regenerado con la proyección, el EXCLUDE y los dos triggers (108 inserciones)

## Decisions Made
- **EXCLUDE sobre la proyección, no sobre appointments:** un EXCLUDE directo sobre `appointments` no puede hacer join a la puente `agenda_spaces` por fila para expandir el fan-out F11→{A,B,C}; la proyección desnormaliza ese fan-out (1 fila por espacio) y deja que el EXCLUDE compare espacio contra espacio.
- **Defensa en profundidad, no reemplazo:** el advisory lock del Plan 03-01 es app-logic dentro del RPC; un error de lógica (ej. olvidar un espacio del set) no lo detecta nadie. El EXCLUDE es declarativo: si dos reservas no se serializaran, el insert de proyección choca con 23P01 y aborta. El plan era recortable — sin él, ESPACIO-03 ya estaba cumplido por el advisory lock (Pitfall 6).
- **slot_taken, no space_taken:** el 23P01 del EXCLUDE reusa el mismo path de traducción que el resto de los conflictos; el cliente no distingue.
- **Sin read anon (D-06):** RLS habilitada con select por owner_id (molde de spaces) para el dashboard; jamás anon.
- **Sin backfill:** el backstop solo cubre reservas creadas tras la migración (RESEARCH §Runtime State Inventory); los turnos previos no tienen filas de proyección.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Pending Deploy Step (NO hecho en este plan)

**La migración 042 completa (motor del Plan 03-01 + backstop de este plan, en el MISMO archivo) NO se aplicó a producción todavía.** Igual que la 041, el deploy a prod es a mano y coordinado:

1. Aplicar `supabase/migrations/042_spaces_and_coupled_exclusion.sql` (COMPLETA — incluye tablas spaces/agenda_spaces + book_slot_atomic extendido del Plan 03-01 Y la proyección appointment_spaces + EXCLUDE + triggers de este plan) A MANO al Supabase de **producción**, en orden, después del baseline + 040 + 041. NO `supabase db push`.
2. Inmediatamente después ejecutar `NOTIFY pgrst, 'reload schema';` para que PostgREST recargue el esquema y vea las nuevas tablas/objetos.
3. Coordinar con el deploy del código del milestone. El motor y el backstop van juntos en la 042: aplicar la 042 una sola vez cubre ambos planes.

La validación local (`supabase db reset` PG17 + `supabase db dump --local`) ya está hecha y NO debe re-correrse.

## Next Phase Readiness
- **Plan 03-05** (test CONC-03) es la verificación funcional REAL del EXCLUDE: ejercita dos reservas concurrentes en agendas que comparten un espacio y confirma que la 2ª choca con `slot_taken` por `appointment_spaces_no_overlap`, y que cancelar la 1ª libera la proyección (trigger de cleanup). El backstop no tiene cobertura de test propia en este plan — esa verificación vive en 03-05.
- **Blocker de prod:** la 042 completa debe aplicarse a mano a producción + `NOTIFY pgrst` antes del deploy del milestone (ver "Pending Deploy Step").

## Self-Check: PASSED

Ambos commits de tarea (`e7383b1`, `ce4ff56`) están en el historial; `supabase/schema.sql` y `supabase/migrations/042_spaces_and_coupled_exclusion.sql` existen en disco con `appointment_spaces` presente.

---
*Phase: 03-espacio-compartido*
*Completed: 2026-06-30*
