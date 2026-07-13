---
phase: 01-turnos-manuales
plan: 03
subsystem: database
tags: [migration, rls, supabase, postgres, multi-tenant, with-check, hardening]

# Dependency graph
requires:
  - phase: 01-turnos-manuales (plan 01-02)
    provides: pipeline de alta manual (/api/booking/create reusado desde la sesión del dueño)
provides:
  - "Migración 040: policies FOR INSERT WITH CHECK explícitas para appointments y clients (defensa en profundidad de aislamiento por tenant)"
  - "supabase/schema.sql regenerado reflejando las 2 policies + CREATE EXTENSION pg_net del baseline"
  - "Traceability de REQUIREMENTS.md: MANUAL-04 marcado como diferido a v2 (D-01)"
  - "Precedente de naming: migraciones nuevas sobre el baseline usan separador underscore (040_nombre.sql), no guion"
affects: [Phase 2 — Cupos Grupales, Phase 3 — Espacio Compartido, cualquier migración futura sobre el baseline replayable]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "FOR INSERT WITH CHECK (business_id IN <negocios del dueño>) — patrón fixed_expenses como molde para policies de INSERT tenant-safe"
    - "Naming de migraciones post-baseline: <NNN>_nombre.sql con underscore (el Supabase CLI saltea silenciosamente nombres con guion)"

key-files:
  created:
    - supabase/migrations/040_appointments_clients_insert_with_check.sql
  modified:
    - supabase/schema.sql
    - .planning/workstreams/motor-reservas/REQUIREMENTS.md

key-decisions:
  - "040 es hardening de claridad, NO un bug funcional: la policy FOR ALL USING ya cubría el INSERT por la semántica de Postgres (RESEARCH Pitfall 1)"
  - "Migración nueva numerada 040 sobre el baseline replayable (MEMORY infra-testing-roadmap); el baseline NO se renumera"
  - "MANUAL-04 (seña opcional en alta manual) diferido a v2 por D-01: el turno manual siempre queda confirmed"

patterns-established:
  - "Naming de migraciones: usar underscore (040_nombre.sql) — el guion hace que supabase db reset saltee el archivo silenciosamente"
  - "Validación local con supabase db reset como guard anti falso-positivo (build/types pasan sin la migración aplicada porque los tipos salen de config)"

requirements-completed: [MANUAL-01, MANUAL-04]

# Metrics
duration: ~35min (incl. checkpoint humano)
completed: 2026-06-26
status: complete
---

# Phase 1 Plan 03: Hardening RLS del alta manual (FOR INSERT WITH CHECK) Summary

**Migración 040 que agrega policies `FOR INSERT WITH CHECK (business_id ∈ negocios del dueño)` explícitas para `appointments` y `clients` (defensa en profundidad de tenant), validada localmente con `supabase db reset` sobre PG17, con `schema.sql` regenerado y MANUAL-04 diferido a v2.**

## Performance

- **Duration:** ~35 min (incluye el checkpoint humano de validación local)
- **Started:** 2026-06-26T13:00:23-03:00 (commit Task 1)
- **Completed:** 2026-06-26
- **Tasks:** 3
- **Files modified:** 3 (1 nuevo, 2 editados)

## Accomplishments

- Migración `040` con 2 policies permissive `FOR INSERT WITH CHECK`, copiando literal el patrón `fixed_expenses tenant insert` del baseline (sin tocar la policy `business member access` ni los constraints anti doble-booking 011/013).
- Validación local sobre Postgres LOCAL (PG17): `supabase db reset` replaya baseline + 040 sin error de SQL; `pg_policies` confirma las 2 policies aplicadas.
- `supabase/schema.sql` regenerado y commiteado (delta limpio: las 2 policies + `CREATE EXTENSION pg_net` que el schema previo no reflejaba).
- Traceability de REQUIREMENTS.md actualizada: MANUAL-04 sale de Phase 1, diferido a v2 citando D-01.

## Task Commits

1. **Task 1: Escribir migración 040 (FOR INSERT WITH CHECK appointments + clients)** — `e053f0b` (feat)
2. **Task 2: [BLOCKING] Validación local + regen schema.sql** — checkpoint humano (resuelto por el orchestrator), produjo:
   - `28b9b77` (fix): rename del archivo de migración a separador underscore
   - `546e6a0` (chore): regenerar `supabase/schema.sql`
3. **Task 3: Diferir MANUAL-04 en la Traceability de REQUIREMENTS.md** — sin commit (`.planning/` gitignored; cambio en disco)

_Nota: REQUIREMENTS.md está bajo `.planning/`, que es gitignored en este repo. El cambio queda en disco, no se commitea (comportamiento esperado del workstream)._

## Files Created/Modified

- `supabase/migrations/040_appointments_clients_insert_with_check.sql` — 2 policies FOR INSERT WITH CHECK (appointments + clients), patrón fixed_expenses. Encabezado SQL en español documentando que es hardening (no funcional) y que no toca la policy USING ni los constraints 011/013.
- `supabase/schema.sql` — regenerado vía `supabase db dump --local`; refleja las 2 policies nuevas + `CREATE EXTENSION pg_net`.
- `.planning/workstreams/motor-reservas/REQUIREMENTS.md` — fila Traceability de MANUAL-04 → `Deferred (v2) | Out of Phase 1 (D-01)`; fila Phase→Requirements de Phase 1 → `3 activos + 1 diferido`; footnote citando D-01.

## Decisions Made

- **040 = hardening de claridad, no fix de bug.** El INSERT del dueño ya era tenant-safe hoy: una policy permissive `FOR ALL USING(...)` usa su expresión `USING` también como `WITH CHECK` de las filas nuevas (semántica de Postgres). La policy explícita `FOR INSERT` la pide la skill `supabase-multitenant-rls` (regla 3) por claridad y para no depender de esa inferencia. Ambas policies son permissive y expresan la MISMA regla → no aflojan nada (se OR-ean).
- **Numeración 040, baseline intacto** (MEMORY infra-testing-roadmap): primera migración sobre el baseline replayable.
- **MANUAL-04 diferido a v2 (D-01):** el alta manual no maneja seña; el turno siempre queda `confirmed`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Rename del archivo de migración: guion → underscore**
- **Found during:** Task 2 (validación local con `supabase db reset`)
- **Issue:** El archivo se creó como `040-appointments-clients-insert-with-check.sql` (separador **guion**). El Supabase CLI lo **saltaba silenciosamente** en `supabase db reset` (espera el patrón `<timestamp/numero>_name.sql`), dejando las policies SIN aplicar. Esto es EXACTAMENTE el falso-positivo de verificación que el checkpoint (threat T-01-12) buscaba prevenir: build y typecheck pasan sin la migración aplicada porque los tipos salen de config, no de la DB viva — el reset local fue el guard que lo cazó.
- **Fix:** Renombrar a `040_appointments_clients_insert_with_check.sql` (**underscore**), conservando la numeración 040. Tras el rename, `supabase db reset` aplica `Applying migration 040_...` limpio.
- **Files modified:** `supabase/migrations/040_appointments_clients_insert_with_check.sql` (rename)
- **Verification:** `supabase db reset` sin `ERROR:` de SQL; `pg_policies` muestra `appointments tenant insert` (INSERT) y `clients tenant insert` (INSERT).
- **Committed in:** `28b9b77` (fix)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** El fix fue necesario para que la migración realmente se aplicara; sin él la validación habría sido un falso-positivo. Sin scope creep. **Lección para el milestone:** toda migración nueva sobre el baseline replayable DEBE usar separador underscore (`NNN_nombre.sql`), no guion, o `supabase db reset` la saltea silenciosamente.

## Issues Encountered

- Bug de naming (guion vs underscore) — ver Deviation 1. Resuelto vía rename + re-reset local.

## Threat Mitigations Verified

- **T-01-10** (INSERT cross-tenant en appointments/clients): mitigado. Policy `FOR INSERT WITH CHECK` explícita aplicada + la `FOR ALL USING` existente; ambas permissive, misma regla de tenant.
- **T-01-11** (debilitar constraints 011/013 o la policy existente): mitigado. 040 solo AGREGA policies; sin `DROP POLICY`, sin `ALTER ... CONSTRAINT`, los constraints aparecen solo en comentarios.
- **T-01-12** (falso-positivo de verificación): mitigado **y demostrado** — el reset local cazó el bug de naming que dejaba la migración sin aplicar.

## User Setup Required

None — la migración 040 NO se aplica a producción automáticamente. Prod se aplica a mano, coordinado con el deploy (constraint del proyecto). Aplicar `040_appointments_clients_insert_with_check.sql` a la DB de producción en el próximo deploy.

## Next Phase Readiness

- Phase 1 (Turnos Manuales) cerrada: MANUAL-01/02/03 completos, MANUAL-04 diferido a v2.
- El aislamiento de tenant del alta manual queda con policy explícita; sin regresión sobre los constraints anti doble-booking.
- **Precedente naming establecido** para Phase 2/3: migraciones nuevas con underscore.
- Pendiente operativo (no bloqueante de fase): aplicar 040 a producción a mano en el próximo deploy.

## Self-Check: PASSED

- Archivos verificados en disco: `040_appointments_clients_insert_with_check.sql`, `supabase/schema.sql`, `01-03-SUMMARY.md` — todos FOUND.
- Commits verificados en git: `e053f0b` (Task 1), `28b9b77` (fix rename), `546e6a0` (schema regen) — todos FOUND.
- Task 3 (REQUIREMENTS.md) en disco, no commiteado (`.planning/` gitignored — esperado).

---
*Phase: 01-turnos-manuales*
*Completed: 2026-06-26*
