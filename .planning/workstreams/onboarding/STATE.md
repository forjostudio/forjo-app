---
gsd_state_version: 1.0
milestone: v0.14
milestone_name: Onboarding
status: Awaiting next milestone
stopped_at: Phase 3 planned (3 plans, 2 waves) — ready to execute
last_updated: "2026-07-04T22:32:46.001Z"
last_activity: 2026-07-04 — Milestone v0.14 completed and archived
progress:
  total_phases: 3
  completed_phases: 3
  total_plans: 7
  completed_plans: 7
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (compartido por todos los workstreams)
Requirements: .planning/workstreams/onboarding/REQUIREMENTS.md
Roadmap: .planning/workstreams/onboarding/ROADMAP.md

**Core value:** Un negocio NUNCA puede leer ni modificar datos de otro, y los flujos de pago no pueden ser forzados ni falsificados (aislamiento multi-tenant + integridad de pagos).
**Current focus:** Phase 03 — rework-del-selector-de-rubro

## Current Position

Phase: Milestone v0.14 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-07-04 — Milestone v0.14 completed and archived

## Milestone Context

v0.14 no agrega features al onboarding: **arregla y pule lo existente**. Dos brechas:

1. **Datos (Phase 1):** el paso "Horarios de atención" escribe en `business_hours`, pero panel de agenda + booking público leen `time_blocks` → los horarios del alta no llegan a donde se reserva. `business_hours` NO está huérfana: la leen landing (`lib/landing/derive.ts`, `components/landing/hours.tsx`) y agente WhatsApp (`lib/agent-context.ts`, `app/api/agent/context/route.ts`). Dos fuentes divergentes → unificar sin romper a los 4 lectores. Riesgo dominante = **regresión**, no aislamiento (los horarios ya viven bajo `business_id`).
2. **UX (Phase 2):** botón "Omitir" en pasos no obligatorios (completables luego desde el panel) + repaso general del flujo (labels visibles, feedback inmediato, orden lógico). Rework de presentación sobre `app/(onboarding)/onboarding/page.tsx`, sin pasos/campos nuevos ni rediseño completo.

Faseo: reconciliación de horarios (P1) → rework UX del onboarding (P2, depende de P1).

## Accumulated Context

### Decisions

Decisiones de fase ABIERTAS (resolver en discuss-phase, NO lockeadas en el roadmap):

- **P1:** ¿cuál es la tabla canónica de horarios? — (a) `time_blocks` como fuente (migrar onboarding a escribirla + migrar landing/agente a leerla); (b) `business_hours` como fuente (panel/booking la leen); (c) vista/sincronización que mantenga ambas coherentes. Criterio: minimizar migración + cero regresión en los 4 lectores. La deprecación de la tabla perdedora está diferida (SCHED-DROP-01, v2) → se puede mantener ambas transitoriamente.
- **P2:** ¿qué pasos son "no obligatorios" (omitibles) y cómo se representa un paso omitido para que el panel sepa que quedó pendiente? El indicador de "onboarding incompleto" en el panel está diferido (ONB-PROGRESS-01, v2) → en v0.14 alcanza con que el dato quede completable desde el panel, sin recordatorio dedicado.
- [Phase 01]: Onboarding escribe time_blocks (fuente única) con horario partido en vez de business_hours (D-01/D-04, SCHED-01)
- [Phase ?]: 01-03: DROP business_hours (migr 046) — time_blocks fuente unica; DROP a prod diferido al usuario
- [Phase ?]: 02-01: navegación del wizard por posición en visibleSteps (no s+1) para saltar Profesionales en canchas; precio 0 = servicio gratuito; header con lockup de marca

### Pending Todos

None yet.

### Blockers/Concerns

- **Regresión de horarios (P1):** landing, agente de WhatsApp, panel de agenda y booking público leen horarios hoy — cualquier reconciliación debe validarse contra los 4 sin perder ni cambiar los horarios de negocios existentes.

## Deferred Items (v2 / future — NO en v0.14)

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Schema | SCHED-DROP-01 (deprecar/eliminar la tabla de horarios perdedora una vez unificada la fuente) | Deferred | v0.14 scoping |
| Onboarding | ONB-PROGRESS-01 (indicador de "onboarding incompleto" en el panel que recuerde completar pasos omitidos) | Deferred | v0.14 scoping |

## Session Continuity

Last session: 2026-07-04T19:48:59.221Z
Stopped at: Phase 3 planned (3 plans, 2 waves) — ready to execute
Resume file: .planning/workstreams/onboarding/phases/03-rework-del-selector-de-rubro/03-01-PLAN.md
Next: `/gsd:discuss-phase 1 --ws onboarding`

## Performance Metrics

| Phase | Plan | Duration | Notes |
|-------|------|----------|-------|
| — | — | — | — |
| Phase 01 P01 | 5min | 2 tasks | 1 files |
| Phase 01 P02 | 12min | 2 tasks | 3 files |

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
