---
gsd_state_version: "1.0"
milestone: v0.31
milestone_name: La navegación mobile del panel (workstream `panel-nav`)
current_phase: 02
current_plan: 1
status: executing
stopped_at: Tracer gate abierto en 02-01 (UAT visual pendiente)
last_updated: "2026-10-08T23:25:22.330Z"
last_activity: 2026-10-08
last_activity_desc: Phase 02 execution started
state_head: 1da6c5cde67d692ad0af3eb99de266bb054df6c0
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 4
  completed_plans: 1
  percent: 0
workstream: panel-nav
created: 2026-09-28
current_phase_name: La barra inferior y Más
---

# Project State

## Current Position

**Status:** Executing Phase 02
**Current Phase:** 02
**Last Activity:** 2026-10-08 — Phase 02 execution started
**Last Activity Description:** Phase 02 execution started

## Progress

**Phases Complete:** 0/3
**Current Plan:** 1

## Session Continuity

**Last session:** 2026-10-08T23:25:15.295Z

**Stopped At:** Tracer gate abierto en 02-01 (UAT visual pendiente)
**Resume File:** None

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 12min | 2 tasks | 4 files |
| Phase 01 P02 | 13min | 2 tasks | 1 files |
| Phase 01 P03 | 38min | 2 tasks | 4 files |
| Phase 1 P04 | 40 | 2 tasks | 1 files |
| Phase 02 P01 | 22 min | 2 tasks | 6 files |

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
- [Phase 1 — El detalle de cliente, con la regla de historial que lo gobierna]: El modal de fusion pasa a tres filas con break-all en el mail: el desborde medido a 375px va de +36.4px a -13.0px, y truncar era el bug (el modal autoriza un borrado)
- [Phase 1 — El detalle de cliente, con la regla de historial que lo gobierna]: Fusionar con la ficha abierta: misma accion en el header del detalle, lg:hidden en la FILA (desktop intacto, display:none a 1280px) y solo si el cliente abierto es duplicado
