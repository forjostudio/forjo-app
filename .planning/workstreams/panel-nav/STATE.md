---
gsd_state_version: "1.0"
milestone: v0.30
milestone_name: La navegación del panel
current_phase: 1 — El detalle de cliente, con la regla de historial que lo gobierna
current_plan: 3 of 4
status: Phase 1 en ejecución — planes 01-01, 01-02 y 01-03 completos
stopped_at: Completed 01-03-PLAN.md
last_updated: "2026-09-29T16:53:15.161Z"
last_activity: 2026-09-29
last_activity_desc: "Plan 01-03 ejecutado (cierre de gaps NAV-07 + NAV-08): panelNavMode (push-vs-replace del menu, pura y sobre rutas) + consumeOwnedPanelEntry (generico, 2 guardas) en lib/panel-history.ts; el sidebar las CONSUME en una prop y una guarda del onNavigate que ya existia. 5 mutaciones corridas. UAT en celular PENDIENTE (la corre el dueno)."
state_head: acc3bf78a2bc0bdc9a64c545c691e5eb4f6eda2c
progress:
  total_phases: 2
  completed_phases: 0
  total_plans: 4
  completed_plans: 3
  percent: 0
workstream: panel-nav
created: 2026-09-28
---

# Project State

## Current Position

**Status:** Phase 1 en ejecución — planes 01-01, 01-02 y 01-03 completos
**Current Phase:** 1 — El detalle de cliente, con la regla de historial que lo gobierna
**Last Activity:** 2026-09-29
**Last Activity Description:** Plan 01-03 ejecutado (cierre de gaps NAV-07 + NAV-08): panelNavMode (push-vs-replace del menu, pura y sobre rutas) + consumeOwnedPanelEntry (generico, 2 guardas) en lib/panel-history.ts; el sidebar las CONSUME en una prop y una guarda del onNavigate que ya existia. 5 mutaciones corridas. UAT en celular PENDIENTE (la corre el dueno).

## Progress

**Phases Complete:** 0/2
**Current Plan:** 3 of 4 (01-01, 01-02 y 01-03 completos; 01-04 en ejecución en paralelo)

## Session Continuity

**Last session:** 2026-09-29T16:53:04.710Z

**Stopped At:** Completed 01-03-PLAN.md
**Resume File:** None

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 12min | 2 tasks | 4 files |
| Phase 01 P02 | 13min | 2 tasks | 1 files |
| Phase 01 P03 | 38min | 2 tasks | 4 files |

## Decisions

- [Phase 1 — El detalle de cliente, con la regla de historial que lo gobierna]: ① A→B empuja (no reemplaza): el helper es agnóstico del viewport y una política replace obligaría a una séptima causa
- [Phase 1 — El detalle de cliente, con la regla de historial que lo gobierna]: ② El saneo corre en un efecto con guarda de idempotencia doble (sanitizeAction + regla 0) y memoria que se resetea (reconciledMemo)
- [Phase 1 — El detalle de cliente, con la regla de historial que lo gobierna]: La fusión de duplicados NO escribe historial: registra una redirección idBorrado→idConservado y la reconciliación aplica el replace cuando el modal suelta la entrada
- [Phase 1 — El detalle de cliente, con la regla de historial que lo gobierna]: La regla 0 (overlayOwnsTop ⇒ none) es absoluta: debilitarla cambiaría una regresión por un defecto (entrada huérfana + atrás muerto)
- [Phase 1 — El detalle de cliente, con la regla de historial que lo gobierna]: El invariante de NAV-06 basado en git (los 3 archivos intocables en su commit original) vive como gate de bash y NO como test: el CI clona a profundidad 1 y seria rojo en cada push por falta de historia
- [Phase 1 — El detalle de cliente, con la regla de historial que lo gobierna]: El cableado se verifica por REGION recortada (recorte + sinComentarios + guarda de 'no encontro nada'), nunca sobre el archivo entero: clients-client.tsx tiene ~1400 lineas y una asercion global pasaria por casualidad
- [Phase 1 — El detalle de cliente, con la regla de historial que lo gobierna]: NAV-07 NO es replace a secas: la regla tiene 4 ramas (misma ruta=replace, dashboard->seccion=push, seccion->dashboard=push, seccion->seccion=replace) y vive pura en panelNavMode; replace en todos los links reemplazaria la entrada del dashboard y el atras sacaria del panel
- [Phase 1 — El detalle de cliente, con la regla de historial que lo gobierna]: seccion->dashboard EMPUJA y no reemplaza: replace dejaria /dashboard sobre /dashboard = atras muerto, la misma entrada basura con la que se descarto <Link replace={active}>
- [Phase 1 — El detalle de cliente, con la regla de historial que lo gobierna]: NAV-08 se resuelve PREVINIENDO la navegacion (e.preventDefault en onNavigate), nunca encadenandola: history.back() es asincrono y el router empujaria su entrada antes del pop
- [Phase 1 — El detalle de cliente, con la regla de historial que lo gobierna]: El ejecutor de NAV-08 es GENERICO (no recibe el param): pregunta si la entrada de arriba es de alguna subseccion, asi los tabs de la Phase 2 heredan el arreglo sin tocar el modulo
- [Phase 1 — El detalle de cliente, con la regla de historial que lo gobierna]: La politica y el CABLEADO necesitan candados separados: lib/panel-history.test.ts queda verde con el replace borrado del sidebar (medido), por eso se agrego test/panel-history-sidebar.test.ts
