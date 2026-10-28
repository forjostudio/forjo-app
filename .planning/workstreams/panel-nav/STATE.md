---
gsd_state_version: "1.0"
milestone: v0.31
milestone_name: La navegación mobile del panel (workstream `panel-nav`)
current_phase: 03
current_plan: 12
status: executing
stopped_at: Completado 03-12-PLAN.md — la causa de G3-2/G3-3 es la intervencion de historial de Chrome; el 03-13 espera la decision del dueno sobre cuando se arma el sentinel
last_updated: "2026-10-28T21:01:38.754Z"
last_activity: 2026-10-28
last_activity_desc: "03-12 completado: G3-2/G3-3 medidos (intervencion de historial), 03-13 espera decision del dueno"
state_head: 18b9c4fd380b0e41ab15cc2317d2f6997314e38c
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 17
  completed_plans: 16
  percent: 0
workstream: panel-nav
created: 2026-09-28
current_phase_name: la-pol-tica-de-atr-s-de-un-nivel-a-dos
---

# Project State

## Current Position

**Current Plan:** 12
**Total Plans in Phase:** 13
**Status:** Executing Phase 03 — 03-12 completado; 03-13 bloqueado por una decision del dueno (cuando se arma el sentinel)
**Current Phase:** 03
**Last Activity:** 2026-10-28 — 03-12 completado (medicion de G3-2/G3-3)
**Last Activity Description:** la causa de G3-2/G3-3 es la intervencion de historial de Chrome; doble montaje descartado

## Progress

**Progress:** [░░░░░░░░░░] 0%
**Phases Complete:** 0/3
**Plans Complete:** 12/13 (en la fase 03)
**Current Plan:** 12

## Session Continuity

**Last session:** 2026-10-28T21:01:08.535Z

**Stopped At:** Completado 03-12-PLAN.md — la causa de G3-2/G3-3 es la intervencion de historial de Chrome; el 03-13 espera la decision del dueno sobre cuando se arma el sentinel
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
| Phase 03 P09 | 95 min | 3 tasks | 7 files |
| Phase 03 P10 | 35 min | 2 tasks | 6 files |
| Phase 03 P11 | 28 min | 3 tasks tasks | 9 files files |
| Phase 03 P12 | 60 min | 3 tasks | 7 files |

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
- [Phase 03]: El criterio 6 se REVISA de forma acotada (2026-10-27) en vez de declararse cumplido o renunciado: el mecanismo sigue sin consultar el ancho de pantalla, pero lo que lo sostiene paso del hecho de la pila al cableado (barra oculta a >=1024px + el guard solo computa con la pantalla sucia), con un residuo de UN SOLO CASO declarado
- [Phase 03]: MOB-04 se PRECISA con su limite declarado: el ciclo Inicio-seccion deja de crecer, pero en la pila de tres escalones de D-02 la regla NO se dispara y el gesto sigue apilando. La fase promete que el ciclo no crece sin techo, no que la pila nunca pase de dos
- [Phase 03]: La consecuencia de la regla sobre Mas - tocar Inicio - atras se declara debajo de MOB-05 con fecha y con prohibicion de leerla como regresion: la decision (a) no cambio, cambio la PILA que lee
- [Phase 03]: La ronda 3 se ACOTA a ocho recorridos en Android mas los 21 en iPhone, con el motivo medido por item; y NO se corrio requirements.mark-complete: MOB-04/05/06 se marcan con el telefono, no con la suite verde
- [Phase 03]: G3-1 se cierra con un SEGUNDO PRODUCTOR del canal de propagacion (branchCarryMark) y NO tocando la politica: panelNavMode (6 retornos / 5 ramas) y panelBranchPlan (6 reglas / 2 retrocesos / 2 caidas) quedaron intactas y medidas por recorte. La regla -1c ya era correcta y estaba desplegada; lo que faltaba era que el hecho que lee ESTUVIERA AHI
- [Phase 03]: El valor se lee en el GESTO y no en el efecto, sobre el mismo window.history.state que ya se leia para los tres hechos: despues del replace del <Link> el valor no existe mas, y dos lecturas en el mismo gesto son dos verdades que pueden diferir
- [Phase 03]: La propagacion se escribio GENERAL (viaja cualquier ruta leida) y no acotada a la marca dice la raiz: la acotada dejaria la misma regla significando dos cosas segun el valor. El costo quedo MEDIDO en E-18 y resulto ser lo que D-03 pide (tocar Mas desde dos secciones de Mas sube en vez de apilar)
- [Phase 03]: Sin valor leido NO se inventa ninguno, y la abstencion se mide en vez de prometerse (E-17 mitad C): quedarse sin marca deja la pila un escalon mas larga, una marca falsa deja al dueno fuera del sitio
- [Phase 03]: El residuo del camino del guard de cambios sin guardar se DECLARA en los cuatro lugares donde se puede leer (2026-10-28) en vez de cablearse: el guard no pasa por handleNavigate, asi que en pantalla sucia la marca se sigue perdiendo y el gesto queda un escalon mas largo, nunca una expulsion
- [Phase 03]: MOB-04/05/06 siguen SIN marcar y requirements.mark-complete NO se corrio: los marca el telefono, no la suite verde ni la sonda en 18/18. La ronda 3 se re-corre DESDE EL PRINCIPIO porque el arreglo cambia la forma de la pila
- [Phase 03]: G3-2 y G3-3 son UNA causa y no es la divergencia referencia/URL: la intervencion de historial de Chrome saltea la entrada de Inicio porque el sentinel se empuja sin activacion del usuario (al montar y desde el temporizador); holding=true en los dos — Medido en la app real por CDP con el atras de la INTERFAZ (chrome.tabs.goBack): mismo servidor y mismo modo estricto, solo cambiando el gesto, los dos recorridos pasan con la navegacion a la entrada anterior y fallan con el de la interfaz (entradas_salteadas=1, sin popstate)
- [Phase 03]: El 03-13 NO puede implementar A-D para G3-2/G3-3: cuando se arma el sentinel (tras un toque del dueno, o aceptar el limite) es decision del dueno; (A) queda elegida solo para el defecto de logica de la recarga (septima regla sin acreditar con frjExit de instancia muerta) y el doble montaje queda descartado — Ninguna de las cuatro opciones toca una entrada que el navegador nunca visita; el doble montaje midio cero popstate sin gesto y un armado al montar con el estricto activo y apagado
