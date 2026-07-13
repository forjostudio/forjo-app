---
phase: 04-pipeline-tags-timeline
plan: 01
subsystem: database
tags: [supabase, postgres, rls, security_invoker, zod, vitest, crm, pipeline, tags, timeline]

# Dependency graph
requires:
  - phase: 02-admin-de-plataforma
    provides: "patrón RLS admin-only (migración 031), contrato de 6 pasos de server actions (_actions.ts), requireAdmin/logAudit/createAdminClient, schemas zod puros (_actions.schemas.ts)"
  - phase: 03-impersonacion-read-only
    provides: "audit_log como fuente de la rama 'cambio' del timeline; patrón security_invoker para herencia de RLS"
provides:
  - "Migración 034: 6 tablas CRM admin-only (leads, deals, tags, entity_tags, notes, tasks) con RLS + policy SELECT is_admin, sin write paths"
  - "VIEW crm_timeline (security_invoker = true): UNION ALL de audit_log + notes + tasks con shape común, hereda la RLS admin-read de las tablas base"
  - "lib/crm-pipeline.ts: STAGES como única fuente de verdad de las 5 etapas + stageTotals/pipelineSummary"
  - "lib/crm-tags.ts: filterByTags (semántica OR, puro)"
  - "lib/crm-timeline.ts: TimelineRow + set de filtros + mapa de etiquetas de acción"
  - "app/(crm)/admin/_crm-actions.schemas.ts: 13 schemas zod de Wave 2 (pipeline/tags/notas/tareas), stage enum derivado de STAGES"
  - "app/(crm)/admin/_tag-actions.ts: createTag/assignTag/removeTag (foundation compartido D-08)"
  - "components/crm/tag-chip.tsx: chip de tag reusable (toggle + remove)"
affects: [04-02-pipeline-board, 04-03-ficha-timeline, 05-reportes-de-ventas]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "VIEW de agregación on-the-fly con security_invoker = true (hereda RLS del caller, opuesto a las public views security-definer de 027)"
    - "Tabla admin-only = RLS enable + única policy SELECT que lee is_admin del JWT app_metadata, SIN policy de write (solo service-role escribe)"
    - "STAGES como única fuente de verdad: las keys del CHECK de DB, el enum zod y los totales por columna se derivan de la misma constante"
    - "Foundation compartido de tags (D-08): un solo catálogo + _tag-actions.ts importable por board y ficha sin acoplarse"

key-files:
  created:
    - "supabase/migrations/034_crm_pipeline_tags_timeline.sql"
    - "lib/crm-pipeline.ts"
    - "lib/crm-pipeline.test.ts"
    - "lib/crm-tags.ts"
    - "lib/crm-tags.test.ts"
    - "lib/crm-timeline.ts"
    - "app/(crm)/admin/_crm-actions.schemas.ts"
    - "app/(crm)/admin/_crm-actions.schemas.test.ts"
    - "app/(crm)/admin/_tag-actions.ts"
    - "components/crm/tag-chip.tsx"
  modified: []

key-decisions:
  - "D-01: leads 1 → deals N vía FK lead_id; deals.stage (text+CHECK 5 etapas) separado de deals.status (text+CHECK open/won/lost), NO enum nativo"
  - "D-08: un solo catálogo de tags compartido; sus server actions viven en _tag-actions.ts como foundation para que Plan 02 y Plan 03 importen en paralelo sin acoplarse"
  - "D-11: timeline = VIEW crm_timeline on-the-fly (security_invoker), NUNCA tabla materializada timeline_events"
  - "assignTag idempotente: el conflicto 23505 del índice único (tag_id, entity_type, entity_id) se trata como éxito"
  - "linkLeadOnSignupSchema NO recibe email/leadId en el input (anti-tampering: el email se re-deriva server-side)"

patterns-established:
  - "VIEW security_invoker para herencia de RLS admin-read (D-11)"
  - "Tabla CRM admin-only espejando verbatim la migración 031 (D-14)"
  - "STAGES única fuente de verdad de etapas (DB CHECK + zod enum + totales)"

requirements-completed: [PIPE-01, PIPE-02, PIPE-03, PIPE-04, TL-01]

# Metrics
duration: ~18min
completed: 2026-06-21
status: complete
---

# Phase 4 Plan 01: Cimientos de datos del CRM (pipeline, tags, timeline) Summary

**Migración 034 con 6 tablas CRM admin-only + VIEW crm_timeline (security_invoker), STAGES como única fuente de verdad de las 5 etapas, filtro de tags OR, schemas zod de Wave 2, y _tag-actions.ts como catálogo de tags compartido**

## Performance

- **Duration:** ~18 min (Tasks 1-4 sesión previa) + finalización (esta sesión)
- **Started:** 2026-06-21T22:16:00Z (aprox.)
- **Completed:** 2026-06-21
- **Tasks:** 5 (4 auto + 1 checkpoint blocking-human resuelto)
- **Files modified:** 10 (todos creados)

## Accomplishments
- Migración 034: 6 tablas nuevas (leads, deals, tags, entity_tags, notes, tasks) todas con RLS habilitada y una única policy de SELECT admin-only (is_admin del JWT app_metadata), sin policy de insert/update/delete — solo service-role escribe.
- VIEW crm_timeline con `WITH (security_invoker = true)`: UNION ALL de audit_log ('cambio') + notes ('nota') + tasks ('tarea') con shape común (kind, actor_type, title, body, occurred_at, metadata, business_id). Hereda la RLS admin-read de las tablas base; no es una tabla materializada.
- STAGES (lib/crm-pipeline.ts) como única fuente de verdad de las 5 etapas; sus keys (lead/calificado/trial/propuesta/pago) coinciden 1:1 con el CHECK de deals.stage en la migración (cross-check verificado).
- filterByTags (lib/crm-tags.ts) con semántica OR + tipos de timeline (lib/crm-timeline.ts), ambos puros y testeados.
- 13 schemas zod de Wave 2 en _crm-actions.schemas.ts, con el enum de stage derivado de STAGES (no duplicado) y anti-tampering en linkLeadOnSignupSchema.
- _tag-actions.ts: createTag/assignTag/removeTag siguiendo el contrato de 6 pasos verbatim; foundation compartido importable por Plan 02 y Plan 03. assignTag idempotente (23505 → éxito).
- tag-chip.tsx reusable (toggle accesible + remove opcional, tokens CSS).

## Task Commits

1. **Task 1: Migración 034 — 6 tablas CRM admin-only + VIEW crm_timeline** - `e9d5964` (feat)
2. **Task 2: Libs puras del CRM — STAGES, filtro de tags OR, tipos de timeline** - `62c845d` (feat)
3. **Task 3: Schemas zod de las acciones de Wave 2 + tag-chip reusable** - `bcbde60` (feat)
4. **Task 4: Server actions del catálogo compartido de tags (_tag-actions.ts)** - `1efeb47` (feat)
5. **Task 5 [BLOCKING checkpoint]: Aplicar migración 034 a mano en Supabase** - resuelto por el operador (user_response = "aplicada")

_Nota: la SUMMARY/STATE/ROADMAP no se commitean — `.planning/` está gitignored (esperado)._

## Files Created/Modified
- `supabase/migrations/034_crm_pipeline_tags_timeline.sql` - 6 tablas admin-only + VIEW crm_timeline (security_invoker)
- `lib/crm-pipeline.ts` - STAGES (fuente de verdad), StageKey, stageTotals(), pipelineSummary()
- `lib/crm-pipeline.test.ts` - tests Vitest de STAGES y totales
- `lib/crm-tags.ts` - filterByTags() (OR puro)
- `lib/crm-tags.test.ts` - tests Vitest del filtro OR
- `lib/crm-timeline.ts` - TimelineRow, set de filtros del timeline, mapa de etiquetas de acción
- `app/(crm)/admin/_crm-actions.schemas.ts` - 13 schemas zod de Wave 2 (módulo puro, sin 'use server')
- `app/(crm)/admin/_crm-actions.schemas.test.ts` - tests de schemas clave
- `app/(crm)/admin/_tag-actions.ts` - createTag/assignTag/removeTag (foundation D-08, 'use server')
- `components/crm/tag-chip.tsx` - chip de tag controlado (toggle + remove)

## Decisions Made
None - followed plan as specified. Las decisiones LOCKED (D-01, D-03, D-04, D-08, D-11, D-14, D-15) se respetaron tal cual; ver frontmatter key-decisions.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. Tasks 1-4 ejecutados sin desviaciones. El checkpoint Task 5 (aplicar migración a mano) es flujo normal del repo: las migraciones se aplican a mano y en orden coordinadas con el deploy (regla CLAUDE.md, no `supabase db push` automatizado).

## Database Verification (operator-confirmed)

La verificación de la base de datos fue **confirmada por el operador** (resume-signal "aplicada"): las 6 tablas (leads, deals, tags, entity_tags, notes, tasks) y la VIEW crm_timeline ahora existen en Supabase. El executor NO puede consultar Supabase directamente; la verificación de los pasos 3-5 del checkpoint (pg_tables, pg_views/reloptions security_invoker, pg_policies solo SELECT) quedó a cargo del operador en el SQL Editor.

**Pendiente operativo (no bloqueante):** regenerar `supabase/schema.sql` con `supabase db dump` cuando se pueda.

## Threat Flags

Ninguno nuevo. Los threats del plan (T-04-01 VIEW security_invoker, T-04-02 RLS admin-only sin write, T-04-03 CHECK stage/status, T-04-04 entity_tags discriminador, T-04-15 _tag-actions requireAdmin+zod, T-04-SC sin instalar paquetes) quedaron mitigados en el código. `tech-stack.added: []` — esta fase NO instaló paquetes nuevos.

## User Setup Required
None - la migración 034 ya fue aplicada por el operador. Pendiente operativo no bloqueante: regenerar `supabase/schema.sql`.

## Next Phase Readiness
- Tablas live + STAGES + _tag-actions.ts + tag-chip + schemas zod listos como foundation de Wave 2.
- Plan 02 (tablero pipeline, _pipeline-actions.ts, DnD nativo) y Plan 03 (ficha timeline, _content-actions.ts, filtro de directorio) pueden ejecutarse en paralelo: ambos depends_on solo de 04-01, cero overlap.
- Sin blockers.

## Self-Check: PASSED
- 10/10 artefactos del plan presentes en disco.
- 4 commits de tarea verificados en gsd/crm (e9d5964, 62c845d, bcbde60, 1efeb47).
- `npx tsc --noEmit -p tsconfig.json` → exit 0.
- security_invoker = true en la VIEW (1 ocurrencia); using(true) en policies = 0.
- Keys de STAGES coinciden 1:1 con el CHECK de deals.stage.

---
*Phase: 04-pipeline-tags-timeline*
*Completed: 2026-06-21*
