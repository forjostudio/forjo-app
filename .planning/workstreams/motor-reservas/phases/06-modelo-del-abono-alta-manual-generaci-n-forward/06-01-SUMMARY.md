---
phase: 06-modelo-del-abono-alta-manual-generaci-n-forward
plan: 01
subsystem: database
tags: [postgres, supabase, rls, migrations, multi-tenant, abonos, typescript]

# Dependency graph
requires:
  - phase: 04-ventana-de-reserva
    provides: "patrón de columna aditiva owner-updatable en businesses (max_advance_days) reusado por abono_window_weeks"
  - phase: 03-espacio-compartido
    provides: "patrón create-table-con-4-policies-owner-only (spaces/agenda_spaces) reusado por abonos"
provides:
  - "Tabla abonos (serie recurrente) con RLS owner-only + 4 policies por operación"
  - "appointments.abono_id (FK on delete set null) — vínculo turno→serie"
  - "businesses.abono_window_weeks (default 8) — ventana de generación forward"
  - "Columnas extensibles nullable (reminder_lead_hours, deposit_amount, billing_subscription_id) para v0.25 sin re-migrar"
  - "interface Abono + abono_id en Appointment + abono_window_weeks en Business (lib/types.ts)"
affects: [06-02-generacion-forward, 06-03-alta-manual, 06-04-cron, 06-05-ui-agenda, 07-cancelacion-serie]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Modelo extensible: columnas nullable presentes desde ya para lógica diferida (D-02), evita re-migrar"
    - "abono_id como etiqueta no-constraint: se setea fuera de book_slot_atomic para no tocar el RPC endurecido"
    - "Inserción quirúrgica en schema.sql cuando el CLI reordena el dump completo (evita diff ruidoso)"

key-files:
  created:
    - supabase/migrations/054_abonos.sql
  modified:
    - supabase/schema.sql
    - lib/types.ts

key-decisions:
  - "book_slot_atomic queda intacto: abono_id se setea con UPDATE acotado post-insert (Plan 02), no dentro del RPC"
  - "schema.sql editado quirúrgicamente (no regenerado por dump) porque el CLI v2.107 reordena todo el archivo"
  - "mp_connection_status (migr. 053) NO se agregó a schema.sql: gap pre-existente fuera del scope de 054"

patterns-established:
  - "Abono = serie; los turnos se materializan en appointments con abono_id apuntando a la serie"
  - "RLS owner-only vía business_id in (select id from businesses where owner_id = auth.uid()), una policy por op"

requirements-completed: [ABONO-01, ABONO-02, ABONO-03]

# Metrics
duration: 20min
completed: 2026-07-20
status: complete
---

# Phase 6 Plan 01: Modelo del abono (espinazo de datos) Summary

**Migración 054 idempotente: tabla `abonos` con RLS owner-only (4 policies), `appointments.abono_id` (FK on delete set null) y `businesses.abono_window_weeks` (default 8), extensible sin re-migrar; schema.sql y tipos TS reflejan el cambio; book_slot_atomic intacto.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-20T22:47:00Z (aprox.)
- **Completed:** 2026-07-20T23:07:00Z
- **Tasks:** 2
- **Files modified:** 3 (1 creado, 2 modificados)

## Accomplishments
- Tabla `abonos` creada con RLS habilitada en la misma migración + 4 policies owner-only (select/insert/update/delete), predicado de tenant `business_id in (businesses del owner)`, sin policy anon (D-10).
- Columnas base de la serie (D-01): día/hora, servicio/cliente/agenda, `status`, `cancel_token` a nivel serie, `generated_until` (frontera rolling idempotente), `skipped_occurrences` jsonb (D-06).
- Columnas extensibles nullable (D-02) presentes pero sin lógica: `reminder_lead_hours`, `deposit_amount`, `billing_subscription_id` — soportan el cobro recurrente / pagá-o-liberá de v0.25 sin re-migrar.
- `appointments.abono_id` (D-03): FK aditiva `on delete set null` (borrar un abono no borra sus turnos ya generados) + índice.
- `businesses.abono_window_weeks` (D-07): ventana de generación a nivel negocio, default 8, owner-updatable (el trigger `businesses_protect_admin_columns` no la protege), no viaja al anon.
- `book_slot_atomic` queda byte-idéntico: la 054 no lo toca (D-10, T-06-04).
- `supabase db reset` replaya baseline + 040..054 limpio en PG17 local; `tsc --noEmit` pasa.

## Task Commits

Cada tarea se commiteó atómicamente:

1. **Task 1: Migración 054 (tabla abonos + FK abono_id + businesses.abono_window_weeks)** - `112b52e` (feat)
2. **Task 2: Regenerar schema.sql + tipos TS (interface Abono, abono_id, abono_window_weeks)** - `bc2436c` (feat)

## Files Created/Modified
- `supabase/migrations/054_abonos.sql` - Migración idempotente: tabla abonos + RLS + 4 policies + 5 FKs + 2 índices; appointments.abono_id (+FK+índice); businesses.abono_window_weeks.
- `supabase/schema.sql` - Reflejo quirúrgico de la 054 (tabla abonos con pkey/FKs/índices/RLS/policies/grants, appointments.abono_id, businesses.abono_window_weeks); book_slot_atomic sin cambios.
- `lib/types.ts` - `export interface Abono`, `abono_id?` en Appointment, `abono_window_weeks?` en Business.

## Decisions Made
- **book_slot_atomic intacto:** `abono_id` es una etiqueta que no participa de ninguna constraint (011/013/cupos/espacio); se setea con un UPDATE acotado justo después del insert atómico (Plan 02). Evita un DROP/recreate del SECURITY DEFINER endurecido → cero relajación del anti-doble-booking (D-10, T-06-04).
- **schema.sql editado quirúrgicamente en vez de regenerado por dump:** el CLI de Supabase instalado (v2.107) produce un dump que reordena TODO el archivo (~199 líneas de churn por reordenamiento), lo que enterraría el cambio real en ruido y violaría la regla de mínimo diff. Se insertó a mano solo lo nuevo, extraído del dump y ubicado en las secciones correctas del schema.sql existente. Resultado: diff de 112 inserciones / 2 deletions (las 2 deletions son solo la coma agregada a `is_group` y `max_advance_date`). book_slot_atomic queda fuera del diff = byte-idéntico.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] schema.sql se editó quirúrgicamente en lugar de regenerarse por `supabase db dump`**
- **Found during:** Task 2 (regenerar schema.sql)
- **Issue:** El patrón del repo es regenerar schema.sql con el dump del CLI. Pero el CLI instalado (v2.107) genera un dump que reordena el archivo entero (3689 vs 3490 líneas, casi cada tabla aparece como removida+reañadida). Sobrescribir produciría un diff enorme y ruidoso que mezcla reordenamiento no relacionado con el cambio real, violando la regla de "cambia solo lo necesario" y ocultando si book_slot_atomic cambió.
- **Fix:** Se extrajeron los bloques de la 054 del dump nuevo (formato pg_dump correcto) y se insertaron a mano en las secciones exactas del schema.sql existente (CREATE TABLE, ADD CONSTRAINT pkey, FKs, CREATE INDEX, ENABLE RLS + policies, GRANT). Diff verificado: solo abonos + las 2 columnas aditivas; book_slot_atomic ausente del diff (unchanged).
- **Files modified:** supabase/schema.sql
- **Verification:** `git diff` muestra 112 inserciones / 2 deletions, todas las líneas no-blanco añadidas son abonos-related; `grep book_slot_atomic` sobre el diff = vacío; `tsc --noEmit` pasa.
- **Committed in:** bc2436c (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking / método de regeneración).
**Impact on plan:** El resultado funcional es idéntico al que buscaba el plan (schema.sql refleja la 054, book_slot_atomic intacto). Solo cambió el MÉTODO (edición quirúrgica vs dump) para respetar el mínimo diff ante un CLI que reordena. Sin scope creep.

## Issues Encountered
- **Gap pre-existente (fuera de scope):** `supabase/schema.sql` estaba desactualizado respecto a la migración 053 (`businesses.mp_connection_status`) — la última regeneración de schema.sql fue en la 052 (commit de7d3df). La 053 agregó el archivo de migración y el campo en `lib/types.ts` pero nunca regeneró schema.sql. Este plan (054) NO lo corrigió: por SCOPE BOUNDARY el gap no fue causado por esta tarea y pertenece al milestone mp-connect. `lib/types.ts` ya tenía `mp_connection_status` (agregado por la 053). El schema.sql sigue sin esa columna; se recomienda regenerarlo cuando se cierre/deploye la 053. No bloquea la 054 (`supabase db reset` replaya 053 antes de 054 sin problema).

## User Setup Required
None - no external service configuration required.

**Nota de deploy (prod):** La migración 054 NO se aplica por el flujo GSD. Se aplica A MANO coordinada con el deploy del código de la fase + `NOTIFY pgrst, 'reload schema';`. Última migración en prod = 053; esta es la 054.

## Next Phase Readiness
- Espinazo de datos listo. Plan 02 (motor de generación forward) puede materializar turnos en `appointments` con `abono_id` seteado vía UPDATE post-insert.
- Plan 03 (alta manual) tiene la tabla `abonos` + policies owner-only para insertar la serie con la sesión del dueño.
- Plan 04 (cron) tiene el índice `abonos(business_id, status)` para iterar abonos activos por negocio.
- Plan 05 (UI agenda) puede marcar turnos fijos por `appointments.abono_id != null` (D-09).

## Self-Check: PASSED
- Archivos verificados: 054_abonos.sql, schema.sql, lib/types.ts, 06-01-SUMMARY.md — todos presentes.
- Commits verificados: 112b52e (Task 1), bc2436c (Task 2) — ambos en git log.

---
*Phase: 06-modelo-del-abono-alta-manual-generaci-n-forward*
*Completed: 2026-07-20*
