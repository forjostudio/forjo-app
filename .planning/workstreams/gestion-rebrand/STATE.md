---
gsd_state_version: 1.0
milestone: v0.15
milestone_name: milestone
current_phase: 01
current_plan: 1
status: executing
stopped_at: Phase 1 UI-SPEC approved
last_updated: "2026-07-05T14:55:50.854Z"
last_activity: 2026-07-05 -- Phase 01 execution started
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 3
  completed_plans: 1
  percent: 0
---

# Project State

## Project Reference

**Milestone:** v0.15 Gestión rebrand (reorg de IA + features CRUD, behavior-frozen)
**Core value:** un negocio NUNCA lee ni modifica datos de otro (aislamiento por tenant);
en este milestone el riesgo dominante es la **regresión** (no romper comportamiento/rutas),
salvo DATA-03 (import CSV) donde el aislamiento vuelve a ser crítico.
**Branch:** `gsd/gestion-rebrand` (desde main, con v0.14 shipeado)

## Current Position

**Status:** Executing Phase 01
**Current Phase:** 01
**Last Activity:** 2026-07-05 -- Completed 01-01-PLAN.md (sidebar agrupado, NAV-01)
**Last Activity Description:** Sidebar del dashboard agrupado en 5 secciones data-driven; NAV-01 completo

## Progress

**Phases Complete:** 0 / 3
**Current Plan:** 2 / 3
**Progreso:** [███░░░░░░░] 33%

## Roadmap

- Phase 1: Reorg de IA + Ayuda — NAV-01, NAV-02, HELP-01 (UI, behavior-frozen)
- Phase 2: Alta manual + Exports CSV — CLIENT-01, DATA-01, DATA-02 (introduce columna origen, migr. 049)
- Phase 3: Import de clientes CSV — DATA-03 (backend delicado; research a nivel plan-phase)

## Accumulated Context

**Decisiones / notas:**

- Behavior-frozen: la reorg mueve funcionalidad de lugar, no la cambia. Mock aprobado en
  `design_handoff_forjo_rebrand/` (incluye "Mapa de cambios de dónde a dónde" = checklist de migración).

- Próxima migración libre = **049** (045=landing_cms, 047=backfill vertical, 048=app_settings ya tomadas; no renumerar las ajenas). La columna de origen del cliente (Fase 2) es candidata a 049.
- El badge de origen (Fase 2) y el import (Fase 3) comparten la columna de origen → introducirla en Fase 2, consumirla en Fase 3.
- Vertical `canchas` existe (sin profesionales) — la reorg no puede romper el gating/terminología por vertical (`resolveVertical`/`VERTICALS`).

- **[01-01]** Sidebar agrupado data-driven `{ section, keys[] }` dentro de `sidebar.tsx`, filtrado contra `resolveVertical(business).menu`; `lib/verticals.ts` intacto. Estado activo `bg-primary` (NO el del CRM). El link "Ayuda" del footer lo agrega el Plan 01-03, NO el 01-01.
- **[01-01]** Fix pre-existente aplicado en el mismo archivo: `SidebarContent` función → elemento JSX const (react-hooks/static-components) para pasar el gate `npx eslint`; patrón analog de `crm-sidebar.tsx`.

**TODOs:**

- Fase 3: research a nivel plan-phase (parseo/validación/dedup/aislamiento del import CSV).

**Blockers:** Ninguno.

## Session Continuity

**Last session:** 2026-07-05

**Stopped At:** Completed 01-01-PLAN.md (sidebar agrupado, NAV-01)
**Resume File:** .planning/workstreams/gestion-rebrand/phases/01-reorg-de-ia-ayuda/01-UI-SPEC.md
