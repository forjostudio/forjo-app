---
gsd_state_version: "1.0"
milestone: v0.30
milestone_name: La navegación del panel
current_phase: 1 — El detalle de cliente, con la regla de historial que lo gobierna
current_plan: 2 of 2
status: Phase 1 en ejecución — plan 01-01 completo
stopped_at: Completed 01-02-PLAN.md
last_updated: "2026-09-29T16:53:15.161Z"
last_activity: 2026-09-29
last_activity_desc: "Plan 01-01 ejecutado: lib/panel-history.ts (4 acciones x 6 causas, 53 casos) + el detalle de cliente derivado de /clients?c=<id>. UAT en celular PENDIENTE (la corre el dueño)."
state_head: 483c36fc5879604db16d34019e593691cdc45e04
progress:
  total_phases: 2
  completed_phases: 0
  total_plans: 2
  completed_plans: 2
  percent: 0
workstream: panel-nav
created: 2026-09-28
---

# Project State

## Current Position

**Status:** Phase 1 en ejecución — plan 01-01 completo
**Current Phase:** 1 — El detalle de cliente, con la regla de historial que lo gobierna
**Last Activity:** 2026-09-29
**Last Activity Description:** Plan 01-01 ejecutado: `lib/panel-history.ts` (4 acciones x 6 causas, 53 casos) + el detalle de cliente derivado de `/clients?c=<id>`. UAT en celular PENDIENTE (la corre el dueño).

## Progress

**Phases Complete:** 0/2
**Current Plan:** 2 of 2 (01-01 completo)

## Session Continuity

**Last session:** 2026-09-29T16:53:04.710Z

**Stopped At:** Completed 01-02-PLAN.md
**Resume File:** None

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 12min | 2 tasks | 4 files |
| Phase 01 P02 | 13min | 2 tasks | 1 files |

## Decisions

- [Phase 1 — El detalle de cliente, con la regla de historial que lo gobierna]: ① A→B empuja (no reemplaza): el helper es agnóstico del viewport y una política replace obligaría a una séptima causa
- [Phase 1 — El detalle de cliente, con la regla de historial que lo gobierna]: ② El saneo corre en un efecto con guarda de idempotencia doble (sanitizeAction + regla 0) y memoria que se resetea (reconciledMemo)
- [Phase 1 — El detalle de cliente, con la regla de historial que lo gobierna]: La fusión de duplicados NO escribe historial: registra una redirección idBorrado→idConservado y la reconciliación aplica el replace cuando el modal suelta la entrada
- [Phase 1 — El detalle de cliente, con la regla de historial que lo gobierna]: La regla 0 (overlayOwnsTop ⇒ none) es absoluta: debilitarla cambiaría una regresión por un defecto (entrada huérfana + atrás muerto)
- [Phase 1 — El detalle de cliente, con la regla de historial que lo gobierna]: El invariante de NAV-06 basado en git (los 3 archivos intocables en su commit original) vive como gate de bash y NO como test: el CI clona a profundidad 1 y seria rojo en cada push por falta de historia
- [Phase 1 — El detalle de cliente, con la regla de historial que lo gobierna]: El cableado se verifica por REGION recortada (recorte + sinComentarios + guarda de 'no encontro nada'), nunca sobre el archivo entero: clients-client.tsx tiene ~1400 lineas y una asercion global pasaria por casualidad
