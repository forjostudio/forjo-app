---
gsd_state_version: "1.0"
milestone: v0.31
milestone_name: La navegación mobile del panel (workstream `panel-nav`)
current_phase: 3 — La política de atrás, de un nivel a dos
current_plan: Not started
status: planning
stopped_at: Phase 02 complete, ready to plan Phase 3
last_updated: "2026-10-09T23:33:53.313Z"
last_activity: 2026-10-09
last_activity_desc: Phase 02 complete, transitioned to Phase 3
state_head: e9b285d238761cc6db73331a594cfe045a16239b
progress:
  total_phases: 3
  completed_phases: 1
  total_plans: 4
  completed_plans: 4
  percent: 33
workstream: panel-nav
created: 2026-09-28
current_phase_name: La política de atrás, de un nivel a dos
---

# Project State

## Current Position

**Current Plan:** Not started
**Total Plans in Phase:** 4
**Status:** Ready to plan
**Current Phase:** 3 — La política de atrás, de un nivel a dos
**Last Activity:** 2026-10-09
**Last Activity Description:** Phase 02 complete, transitioned to Phase 3

## Progress

**Progress:** [███░░░░░░░] 33%
**Phases Complete:** 0/3
**Plans Complete:** 4/4
**Current Plan:** 4

## Session Continuity

**Last session:** 2026-10-09T00:58:00.427Z

**Stopped At:** Phase 02 complete, ready to plan Phase 3
**Resume File:** None

## Performance Metrics

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 01 P01 | 12min | 2 tasks | 4 files |
| Phase 01 P02 | 13min | 2 tasks | 1 files |
| Phase 01 P03 | 38min | 2 tasks | 4 files |
| Phase 1 P04 | 40 | 2 tasks | 1 files |
| Phase 02 P01 | 22 min | 2 tasks | 6 files |
| Phase 02 P02 | 35 min | 2 tasks | 2 files |
| Phase 02 P03 | 18 min | 2 tasks | 3 files |
| Phase 02 P04 | 85 min | 2 tasks | 2 files |

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 261009-tzd | Guarda de borrador en los dialogos del panel | 2026-10-10 | 8714de0 | — |
| 261009-tzf | Compactar el banner de plan y el header de /clients | 2026-10-10 | 3093dd0 | — |
| 261009-tze | Los campos editables del panel no disparan el zoom de iOS | 2026-10-10 | 2881ee3 | — |

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
- [Phase 02]: La resta de la barra se hace por HREF (4 valores) y no por key (5): clients y patients son dos keys al MISMO /clients, asi que un set de keys dejaria Pacientes duplicado y SOLO en salud
- [Phase 02]: El bloque de identidad de /mas implementa las CUATRO divergencias deliberadas del contrato (40x40, rounded-lg en logo y fallback, nombre 16px/600, plan 14px/400) y las cuatro quedaron con gate automatico de conteo
- [Phase 02]: La expresion del id de grupo se escribe INLINE en los dos extremos (id del eyebrow + aria-labelledby) y NO se centraliza: con el prefijo en un solo sitio, el id puesto en un extremo y no en el otro se vuelve invisible para un barrido estatico
- [Phase 02]: Los grupos de /mas son role=group y no <section>: un section con nombre accesible se vuelve landmark y cinco landmarks nuevos son ruido para quien navega por landmarks
- [Phase 02]: El logout de /mas NO navega si signOut() falla: avisa con toast.error y se queda; mandar a /login con la sesion viva haria que el proxy rebote al dashboard
- [Phase 02]: El header de mobile se EXTRAJO a su propio componente en vez de editarse in-place: asi sidebar.tsx queda siendo el sidebar de desktop y nada mas, y el header nuevo puede usar usePathname() y useTerminology(), que el sidebar no usa
- [Phase 02]: El mapa de titulos del header es LOCAL y se construye con useTerminology(), no se deriva de buildNavGroups: ese devuelve solo lo que el rubro expone, no tiene /ayuda ni /mas, y para la raiz trae el label de desktop cuando el header tiene que decir Inicio
- [Phase 02]: El nombre del negocio es la linea DOMINANTE del header y el titulo de seccion la subordinada: al revés habria dos titulos iguales a 56px de distancia y el h1 de la pantalla competiria con el chrome fijo
- [Phase 02]: Las dos lineas del header son parrafos y ninguna es heading: un heading en el chrome fijo dejaria a las 13 pantallas con dos h1 cada una
- [Phase 02]: El fragmento del return del sidebar se deja con un unico hijo en vez de simplificarlo: desenvolverlo re-indentaria el bloque de desktop y el gate de byte-identidad lo leeria como una linea eliminada
- [Phase 02]: El ciclo RED->GREEN del candado del inventario se ejecuto como falsificabilidad MEDIDA (11 mutaciones temporales revertidas, nunca commiteadas) y no como commit rojo: el sujeto ya existia y el plan prohibe tocar app/components/lib
- [Phase 02]: El caso del grupo PANEL se reescribio al hecho computable: la forma original media el .filter del propio helper del test y no la produccion (medido: la mutacion que lo borra NO ponia rojo)
- [Phase 02]: El barrido del menu unico se repite sobre la fuente CRUDA ademas de la descontada: con comentarios descontados un drawer entero comentado es invisible, y la verificacion del plan pide que cuente como superviviente
- [Phase 02]: La region del reparto de Mas se delimita con un cuarto helper (bloque, entre dos marcadores) y no con recorte: la primera llave del marcador es la del objeto del .map y el recorte cortaba antes del .filter
- [Phase 02]: --font-geist-mono CONFIRMADO vacio con probe de navegador: el eyebrow hereda la sans del negocio en los ~50 call sites. Cierra el [ASSUMED] de RESEARCH C-5 sin tocar codigo
