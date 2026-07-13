---
phase: 04-pipeline-tags-timeline
plan: 05
subsystem: database
tags: [supabase, postgres, view, rls, security_invoker, crm, timeline, migration]

# Dependency graph
requires:
  - phase: 04-pipeline-tags-timeline
    provides: "migr.034 creó la VIEW crm_timeline (audit_log + notes + tasks) y la tabla audit_log con logAudit"
provides:
  - "migración 035: redefine la VIEW crm_timeline para de-duplicar notas/tareas (excluye codes note.*/task.* de la rama audit_log)"
  - "VIEW crm_timeline de-duplicada con security_invoker preservado (prerequisito DB del Plan 04-07: UI de notas/tareas)"
affects: [04-07, crm-timeline, crm-notes-tasks]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Redefinir una VIEW con create or replace en una migración nueva (las migraciones son inmutables — NO se toca la 034)"
    - "De-dup de timeline vía WHERE en la rama audit_log, dejando audit_log intacto para el visor de auditoría"

key-files:
  created:
    - supabase/migrations/035_crm_timeline_dedup.sql
  modified: []

key-decisions:
  - "Opción A (recomendada en 04-UAT): WHERE action NOT IN (...) en la rama audit_log en lugar de borrar el logAudit de _content-actions.ts — mantiene audit_log intacto y el visor de auditoría sin cambios"
  - "create or replace en migración 035 nueva; la 034 queda inmutable"
  - "security_invoker = true conservado verbatim de 034 (T-04-10) — sin el flag la VIEW correría security-definer y bypassaría la RLS admin-only"

patterns-established:
  - "De-duplicación de timeline en la capa VIEW: filtrar la rama de auditoría en vez de mutar la escritura de audit_log"

requirements-completed: [TL-01]

# Metrics
duration: 12min
completed: 2026-06-22
status: complete
---

# Phase 04 Plan 05: De-duplicación de crm_timeline Summary

**Migración 035 redefine la VIEW crm_timeline con `create or replace` para excluir los codes note.*/task.* de la rama audit_log, eliminando la doble aparición de cada nota/tarea en el timeline; security_invoker=true conservado (T-04-10 mitigado) y audit_log intacto.**

## Performance

- **Duration:** ~12 min (Task 1 + checkpoint blocking-human + continuación)
- **Tasks:** 2 (1 auto + 1 checkpoint blocking-human resuelto por el operador)
- **Files modified:** 1 creado (`supabase/migrations/035_crm_timeline_dedup.sql`)

## Accomplishments
- Creada la migración `035_crm_timeline_dedup.sql`: `create or replace view public.crm_timeline with (security_invoker = true)` que reproduce las tres ramas UNION ALL de 034 (audit_log + notes + tasks) con un único cambio en la rama audit_log: `where action not in ('note.create','note.edit','note.delete','task.create','task.complete')`.
- Cada nota y cada tarea ahora aparece UNA sola vez en el timeline (entra por su propia rama notes/tasks; ya no se duplica vía audit_log).
- `audit_log` queda intacto: el visor de auditoría sigue mostrando los eventos note.*/task.*; solo dejan de aparecer por partida doble en el timeline.
- `security_invoker = true` preservado verbatim de 034 — la VIEW redefinida hereda la RLS admin-read de las tablas base (T-04-10 mitigado).
- Checkpoint blocking-human resuelto: el operador aplicó la migración a mano en el SQL Editor de Supabase (regla CLAUDE.md — el repo NO corre `supabase db push`) y respondió "aplicada" (el `create or replace view` corrió sin error).

## Task Commits

1. **Task 1: Migración 035 — de-duplicar crm_timeline (excluir note.*/task.* de la rama audit_log)** — `fbe7c9d` (feat)

**Plan metadata:** sin commit — `.planning/` está gitignored en este repo; este SUMMARY.md vive solo en el filesystem (intencional, no se fuerza el add).

_Task 2 era un checkpoint blocking-human (aplicación manual de la migración), sin commit por definición._

## Files Created/Modified
- `supabase/migrations/035_crm_timeline_dedup.sql` - Redefine la VIEW crm_timeline (create or replace) con WHERE en la rama audit_log que excluye los 5 codes note.*/task.*; conserva security_invoker=true y las ramas notes/tasks idénticas a 034.

## Decisions Made
- **Opción A del 04-UAT (de-dup en la VIEW):** filtrar la rama audit_log en lugar de eliminar el `logAudit` de `_content-actions.ts`. Razón: mantiene `audit_log` como fuente de verdad completa para el visor de auditoría; el timeline ya tiene ramas propias para notes/tasks, así que solo había que evitar la doble cuenta.
- **Migración nueva (035) con create or replace:** las migraciones aplicadas son inmutables; no se toca la 034.
- **security_invoker=true conservado:** no negociable (T-04-10) — sin el flag la VIEW correría security-definer y bypassaría el gate admin-only de las tablas base.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. Task 1 se ejecutó y commiteó (fbe7c9d) en la sesión original; el checkpoint blocking-human (Task 2) se resolvió cuando el operador confirmó "aplicada" tras correr la migración en Supabase sin error.

## User Setup Required
**Migración SQL aplicada a mano (RESUELTO).** El operador ejecutó `supabase/migrations/035_crm_timeline_dedup.sql` en el SQL Editor de Supabase (última aplicada previa: 034); el `create or replace view` corrió sin error. Confirmación recibida: "aplicada".

**Follow-up pendiente (NO bloqueante):** regenerar `supabase/schema.sql` (vía `supabase db dump` cuando se pueda) para dejarlo en sync con la definición de la VIEW de 035. No afecta el funcionamiento de la app ni del timeline; es higiene de schema dump.

## Next Phase Readiness
- VIEW `crm_timeline` de-duplicada y aplicada en Supabase → prerequisito DB del **Plan 04-07** (UI de notas/tareas en la ficha) satisfecho: cada nota/tarea aparecerá una sola vez en el tab Timeline.
- Único pendiente (no bloqueante): regenerar `supabase/schema.sql`.

## Self-Check: PASSED
- `supabase/migrations/035_crm_timeline_dedup.sql` — FOUND (4415 bytes; `security_invoker = true` en línea 19; WHERE con los 5 codes note.*/task.* en línea 32; ramas notes/tasks idénticas a 034).
- Commit `fbe7c9d` (feat(04-05): migracion 035 de-duplica crm_timeline (TL-01)) — FOUND en git log (`git log --oneline --grep="04-05"`).
- 034 NO modificada (migración inmutable) — confirmado.

---
*Phase: 04-pipeline-tags-timeline*
*Completed: 2026-06-22*
