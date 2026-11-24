---
gsd_state_version: "1.0"
milestone: v0.31
milestone_name: La navegación mobile del panel (workstream `panel-nav`)
current_phase: 4 — Los tabs profundos sobre la política ya fijada
current_plan: Not started
status: milestone_complete
stopped_at: "v0.31 SHIPPED y archivado (2026-11-19, tag v0.31, producción ed95669); workstream sin milestone activo; próximo /gsd-new-milestone"
last_updated: "2026-11-18T13:47:23.429Z"
last_activity: 2026-11-19
last_activity_desc: "Phase 4 completa (verificación passed, re-UAT de gaps 8/8)"
state_head: c279df5ea249d549a782aac2e56c3b749d8db483
progress:
  total_phases: 3
  completed_phases: 3
  total_plans: 29
  completed_plans: 29
  percent: 100
workstream: panel-nav
created: 2026-09-28
current_phase_name: Los tabs profundos sobre la política ya fijada
---

# Project State

## Current Position

**Current Plan:** Not started
**Total Plans in Phase:** 8
**Status:** v0.31 SHIPPED — milestone cerrado y archivado en `.planning/milestones/v0.31-*`
**Current Phase:** 4 — Los tabs profundos sobre la política ya fijada
**Last Activity:** 2026-11-19 - Milestone v0.31 cerrado y archivado (tag v0.31)
**Last Activity Description:** Phase 4 completa (verificación passed 5/5, re-UAT de gaps 8/8 en producción)

## Progress

**Progress:** [██████████] 100%
**Phases Complete:** 3/3
**Plans Complete:** 29/29 (fases 2, 3 y 4 completas)
**Current Plan:** 8 (04-08)

## Session Continuity

**Last session:** 2026-11-18T14:00:00.000Z

**Stopped At:** v0.31 SHIPPED y archivado (2026-11-19, tag v0.31, producción ed95669); workstream sin milestone activo; próximo /gsd-new-milestone
**Resume File:** .planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-VERIFICATION.md

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
| Phase 03 P13 | 47min | 4 tasks | 9 files |
| Phase 03 P14 | 25min | 4 tasks (incl. checkpoint aprobado) | 6 files |
| Phase 03 P15 | 40min | 2 de 6 tasks (parado en P-4) | 4 files |
| Phase 03 P16 | 31min | 3 tasks (+1 checkpoint) | 5 files |
| Phase 03 P17 | 39min | 3 de 4 tasks (+1 checkpoint bloqueante pendiente) | 6 files |

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 261009-tzd | Guarda de borrador en los dialogos del panel | 2026-10-10 | 8714de0 | — |
| 261009-tzf | Compactar el banner de plan y el header de /clients | 2026-10-10 | 3093dd0 | — |
| 261009-tze | Los campos editables del panel no disparan el zoom de iOS | 2026-10-10 | 2881ee3 | — |
| fast-261029 | Sin autoscroll al entrar a /web (el flag de montaje de los widgets de reserva vs Strict Mode) | 2026-10-29 | 76f98f3 | — |
| fast-261116 | CI: CLI de Supabase fijo en 2.122.1 (`latest` paso a v3 y rechaza `[inbucket]`) | 2026-11-16 | 6750b5d | — |
| fast-261116b | R2-WR-01: el gate de la rama ignore exige leer el reintento antes de apagarlo (probado con mutacion) + guarda R2-IN-03 | 2026-11-16 | 7eedb66 | — |
| 261116-t5o | R2-WR-02 medido: cerrar el dialogo con el atras enseguida y tocar despues → el atras siguiente avisa (veredicto arma, entradas_salteadas=0; lo devuelve Chrome, no el modulo) | 2026-11-16 | 8f58a54 | [261116-t5o-medir-r2-wr-02-g3-10-pronto-y-toque](./quick/261116-t5o-medir-r2-wr-02-g3-10-pronto-y-toque/) |
| 261118-jdq | obs-G1: los tabs de Finanzas con `min-h-dvh` para que Ventas vacia no achique la pagina (rojo 3/3 recorte del navegador → verde 8/8, G-04-6 sigue 5/5; sin pushear, UAT con R2-WR-01) | 2026-11-18 | 05733dc | [261118-jdq-obs-g1-alto-minimo-de-los-tabs-de-finanz](./quick/261118-jdq-obs-g1-alto-minimo-de-los-tabs-de-finanz/) |
| 261118-kat | R2-WR-01: la guarda de consumo en vuelo — medido primero (caso 1 bfcache NO reproduce en Chrome 157 por BroadcastChannel; casos 2 y 3a/3b SI, 3b-b1 sacaba del sitio) y arreglado: try/catch del back, guarda compartida con consumeOwnedPanelEntry, pageshow persisted defensivo (decision A del dueno); AR-04-05/06 cerrados por mitigacion; sin pushear | 2026-11-18 | 87868c4 | [261118-kat-r2-wr-01-la-guarda-de-consumo-en-vuelo-s](./quick/261118-kat-r2-wr-01-la-guarda-de-consumo-en-vuelo-s/) |
| 261118-pjd | CR-01 del review de R2-WR-01 (doble toque a Inicio en la barra sacaba del sitio, pre-existente desde B1) + WR-02 + WR-01 (opcion A del dueno: llego = state Y URL) + IN-01 + UP-doble (consumeOwnedBranchEntry comparte la guarda): los 5 medidos en rojo y arreglados; app 46/47 (unica FALLA la declarada), estatica 18/18, scroll 8/8, pura 77/1876; sin pushear | 2026-11-19 | 5d7ee5f | [261118-pjd-cr-01-del-review-de-r2-wr-01-un-solo-seg](./quick/261118-pjd-cr-01-del-review-de-r2-wr-01-un-solo-seg/) |
| 261119-32l | Familia back() cerrada: el sentinel de salida y su desmontaje por la guarda compartida (BLOCKER X2: doble toque desde Inicio con #salir sacaba del sitio), un solo segundo paso para las 3 ramas (IN-03), el guard sucio degrada en vez de quedarse quieto (WR-01); candado C-back-cerrado (lista cerrada, probado con 2 mutaciones); panel-branch.ts sin back() crudos; app 46/47, estatica 18/18, scroll 8/8, pura 77/1888; sin pushear | 2026-11-19 | a85adc0 | [261119-32l-cerrar-la-familia-back-todo-atras-del-pa](./quick/261119-32l-cerrar-la-familia-back-todo-atras-del-pa/) |
| 261124-ine | Export/import de clientes y finanzas pasa de CSV a Excel (.xlsx) con formato | 2026-11-24 | 7629e72 | [261124-ine-export-import-de-clientes-y-finanzas-pas](./quick/261124-ine-export-import-de-clientes-y-finanzas-pas/) |
| 261124-lfd | Apellido opcional del cliente (solo panel, migr. 081) + columna Origen del Excel que no confunda (Needs Review) | 2026-11-24 | 3a80447 | [261124-lfd-apellido-opcional-del-cliente-solo-panel](./quick/261124-lfd-apellido-opcional-del-cliente-solo-panel/) |
| 261124-nxz | Apellido opcional en el alta rapida de cliente (turno, abono, venta) (Verified) | 2026-11-24 | 536bb3c | [261124-nxz-apellido-opcional-en-el-alta-rapida-de-c](./quick/261124-nxz-apellido-opcional-en-el-alta-rapida-de-c/) |
| 261124-q68 | Pendientes de v0.31: R3-WR-01 (applyPanelView con chequeo de llegada) y R2-IN-04 (fila de Clientes con la URL de ahora) reprodujeron y quedaron arreglados; Finanzas a 390 px con flex-wrap; /clients fallback no reprodujo (page.tsx intacto); verificacion human_needed: sonda completa y G1-* pendientes por base local vacia; sin pushear | 2026-11-24 | 63c1207 | [261124-q68-pendientes-v0-31-r3-wr-01-r2-in-04-fallb](./quick/261124-q68-pendientes-v0-31-r3-wr-01-r2-in-04-fallb/) |
| fast | Clientes del alta rapida (turno, abono, venta) con origin manual | 2026-11-24 | 95c5c98 | — |

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
- [Phase 03]: El sentinel de salida se empuja SOLO con activacion del usuario (camino 1): armarSentinel recibe puedeEmpujar sin default, efecto y toque lo leen con panelExitActivationNow, los dos reintentos del popstate lo pasan en falso; el aviso no vence (constante y temporizador borrados) y lo baja el toque que re-arma — Medido en el plan 03-12: un empuje sin activacion es salteable por la intervencion de historial; la calibracion del 03-13 dio la rama (b) (isActive mas estricto que el navegador, la direccion segura) y la sonda de la app dio 11/11 con el atras de la interfaz
- [Phase 03]: Otro dueno para la acreditacion de (A) es ajena Y sin marca de salida, no isForeignOwnedEntry a secas, y la rama none ASIGNA la referencia — isForeignOwnedEntry reconoce el frjExit de cualquier id y habria rechazado justo la entrada de la recarga; asignar re-deriva en los dos sentidos y saca el cartel que mentia sobre una marca muerta. Medido en la app: pares 1->25, 59->301 por la septima, absorbidos
- [Phase 03]: G3-4 es H1, medido en la app real: el back() que enciende el aviso al loguearse sale de la limpieza del desmontaje del panel en el doble montaje del modo estricto (commitDoubleInvokeEffectsInDEV en la base de la pila, arm->none con el mismo id); H2 (router.refresh) no se cumple. El descartado del 03-12 vale solo para la hidratacion
- [Phase 03]: El arreglo de G3-4 vive solo en la limpieza del desmontaje: queueMicrotask + panelExitUnmountAction({ sigueMontada, nuestroArriba }) con la marca re-leida en el instante; nunca un temporizador; el login no se toco. Sonda de la app 12/12, estatica 18/18, suite 1994
- [Phase 03]: El canal de diagnostico (recordExitDiag / __forjoPanelDiag) graba SOLO con NODE_ENV development o test (decision del dueno sobre WR-05, plan 03-15): panelExitDiagEnabled pura, gate como primera sentencia leido en cada llamada, sin bandera publica; en next dev las sondas lo siguen usando igual
- [Phase 03]: Los cuatro gaps del code review MEDIDOS en la app real (03-15, seccion (h)): G3-5 otro (el keyup re-empuja #salir con isActive=true pero el segundo atras SALE salteando /dashboard; el aviso se va al soltar), G3-6 descartado (el router.replace pedido desde el popstate del colapso SI escribe), G3-7 confirmado (firma entera de WR-02 en los tres), G3-8 descartado (el login siempre aterriza en /dashboard). P-4: el plan para sin arreglos de gap
- [Phase 03]: G3-5 se arreglo por la DECISION del dueno (que el aviso se quede), no por un veredicto: veredicto G3-5 sigue en otro. Un keyup cuenta como toque solo si su keydown llego despues del ultimo popstate (panelExitKeyStep, conjunto de teclas con keydown en captura; identidad = code o key, en un solo lugar). Medido: aviso_tras_soltar no->si, entradas_salteadas 1->0 en los dos ordenes de soltar
- [Phase 03]: G3-7 se arreglo con el contrafactico de panelExitArmAction (foreignOwnsTop en falso) en panelExitForeignRetry y el empuje desde el efecto del armado (deps + reintentoDelArmado), nunca desde el popstate; la intervencion de historial temida (P-8) NO aparecio: los tres R-G3-7 en OK con entradas_salteadas=0 y R-lateral en verde
- [Phase 03]: G3-9 se arreglo en plan-modal.tsx con el patron de scroll por caller de Editar servicio (max-h 100svh-2rem, tres filas, la lista como unica fila con scroll); components/ui/dialog.tsx intacto. Medido RED -> GREEN a 360x640, 375x667 y 390x844: el popup de 934 px corrido hacia arriba pasa a 608/635/812 px desde top=16 con la X tocable
- [Phase 03]: El control a 390x844 dio la X fuera ANTES del arreglo: el clickReal de los R-G3-7 caia en <html> fuera del popup (cierre por click afuera), no en la X; el instrumento nuevo mide bien y P-9 no aplica
- [Phase 03]: veredicto G3-10: otro (P-10, sin arreglo ni costo declarado): sin activacion el cierre con el atras deja el armado pendiente (camino 1), pero con la activacion viva el reintento de G3-7 empuja #salir y el atras siguiente lo saltea (entradas_salteadas=1, la intervencion de historial); la pregunta va al dueno
- [Phase 03]: El 03-17 paro en P-1 en la no-regresion: R-login-con-activacion ya no puede reproducir su condicion desde f75e739 (el login con window.location.assign, entro con el merge 643e99e); no es el modal (no es P-5, nada revertido)
- [Phase 03]: Decision del dueno (2026-11-16): R-login-con-activacion RETIRADO de la no-regresion (marcado obsoleto en la sonda, codigo y esperado intactos; los doce de antes pasan a once); G3-4 ya no puede pasar por el login con recarga completa y su arreglo (panelExitUnmountAction) se queda
- [Phase 03]: Decision del dueno (2026-11-16): G3-10 DECLARADO costo del camino 1 con veredicto otro (cerrar con el atras no deja el aviso armado: sin activacion, pendiente; con activacion, el reintento arma y Chrome lo saltea); la logica del aviso no cambia
- [Phase 04]: D-01 PRECISA MOB-08: un solo nivel de tabs — salir del default empuja, entre no-default reemplaza, tocar el default consume; un pegado no fabrica el default debajo (D-03)
- [Phase 04]: B1 elegido por el dueño en el checkpoint del 04-03: séptimo miembro `consume-view-then-navigate` del plan de la rama, para que tocar la barra con un tab abierto termine igual que sin el tab
- [Phase 04]: G-04-6 (obs-1) se cerró dándole al `<Suspense>` un nodo del DOM como fallback en finances/negocio/settings: con `fallback={null}` el scroll pendiente de Next se ejecutaba en el primer toque de tab (medido por CDP, 1/5 → 5/5); la sonda se corrigió por P-1 para descontar el recorte por alto, con control contra la corrida roja (decisión del dueño)
- [Phase 04]: G-04-7: el `from` del toque sale de la URL de ahora (`toqueDeTab`) y una guarda de consumo en vuelo corta el doble `back()`; G-04-8: un solo predicado por presencia (`vueltaDeOAuthPendiente`) y `cleansQuery` en la regla 2. G-04-9 (B1 tras recarga) NO REPRODUCE en Chrome 157 y se descartó con el número
- [Phase 04]: Deuda decidida por el dueño (2026-11-18): R2-WR-01 (guarda sin `popstate` por bfcache) y obs-G1 (recorte con 0 ventas) van a `/gsd-quick`, R2-WR-01 midiendo primero; MOB-08/09 marcados recién con la re-UAT 8/8 en producción

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| quick_tasks | 261006-tbc-el-ci-levanta-su-propia-base-en-vez-de-p | missing | 2026-11-19 | v0.31 |
| uat_gaps | 03/03-DECISION-UAT-2.md | unknown | 2026-11-19 | v0.31 |
| uat_gaps | 03/03-DECISION-UAT-3.md | unknown | 2026-11-19 | v0.31 |
| uat_gaps | 03/03-DECISION-UAT.md | unknown | 2026-11-19 | v0.31 |
| uat_gaps | 03/03-UAT-2.md | unknown | 2026-11-19 | v0.31 |
| uat_gaps | 03/03-UAT-GUION-2.md | unknown | 2026-11-19 | v0.31 |
| uat_gaps | 03/03-UAT-GUION-3.md | unknown | 2026-11-19 | v0.31 |
| uat_gaps | 03/03-UAT.md | unknown | 2026-11-19 | v0.31 |
| uat_gaps | 04/04-UAT-GAPS.md | unknown | 2026-11-19 | v0.31 |
| uat_gaps | 04/04-UAT-GUION.md | unknown | 2026-11-19 | v0.31 |
| uat_gaps | 04/04-UAT.md | unknown | 2026-11-19 | v0.31 |
| verification_gaps | 01/01-VERIFICATION.md | human_needed | 2026-11-19 | v0.31 |
| deferred_items | 02/deferred-items.md: D-1 ·  react-hooks/purity  preexistente en  app/(dashboard)/layout.tsx   -  Encontrado d | acknowledged | 2026-11-19 | v0.31 |
| deferred_items | 04/deferred-items.md: Finanzas desborda en horizontal a 390 px (17-25 px de más) status: open  Qué:  en un doc | acknowledged | 2026-11-19 | v0.31 |
| deferred_items | 04/deferred-items.md: eslint de  finances-client.tsx :  react-hooks/set-state-in-effect  preexistente status:  | acknowledged | 2026-11-19 | v0.31 |
| deferred_items | 04/deferred-items.md: El aviso de error del OAuth de Google en el login mobile probablemente tampoco se ve sta | acknowledged | 2026-11-19 | v0.31 |
| deferred_items | 04/deferred-items.md: El  sinComentarios  del molde se come código cuando un comentario de línea nombra  /  st | acknowledged | 2026-11-19 | v0.31 |
| deferred_items | 04/deferred-items.md:  /clients  tiene el mismo boundary sin nodo desde v0.30, sin medir status: open  Qué:    | acknowledged | 2026-11-19 | v0.31 |
| deferred_items | 04/deferred-items.md: IN-02:  router.refresh()  en  /negocio?tab=integraciones  puede llevar la página arriba  | acknowledged | 2026-11-19 | v0.31 |
| deferred_items | 04/deferred-items.md:  html { scroll-behavior: smooth }  sin  data-scroll-behavior  status: open  Qué:   app/g | acknowledged | 2026-11-19 | v0.31 |
| deferred_items | 04/deferred-items.md: La guarda de consumo en vuelo no se extendió a  consumeOwnedPanelEntry  (plan 04-07, G-0 | acknowledged | 2026-11-19 | v0.31 |
| deferred_items | 04/deferred-items.md: obs-G1: con 0 ventas, el tab Ventas de Finanzas achica la página y el navegador recorta  | acknowledged | 2026-11-19 | v0.31 |
| deferred_items | 04/deferred-items.md: R2-WR-01: la guarda de consumo en vuelo podría quedar encendida sin  popstate  (code rev | acknowledged | 2026-11-19 | v0.31 |
| deferred_items | 04/deferred-items.md: R2-IN-04: doble toque en una fila de Clientes apila  ?c=A  sobre  ?c=A  (code review ron | acknowledged | 2026-11-19 | v0.31 |
| deferred_items | 04/deferred-items.md: Decisión del dueño (2026-11-18, secure-phase): el cruce guarda ↔  consumeOwnedPanelEntry | acknowledged | 2026-11-19 | v0.31 |
| deferred_items | 04/deferred-items.md: Review del quick 261118-kat (CR-01, WR-01..04, IN-01..03): un solo segundo paso de B1, e | acknowledged | 2026-11-19 | v0.31 |
| deferred_items | 04/deferred-items.md: Review del quick 261118-pjd (CR-01 X2, WR-01 S4, IN-01..04): la familia back() cerrada s | acknowledged | 2026-11-19 | v0.31 |
| deferred_items | 04/deferred-items.md: R3-WR-01 (review final antes del push, 2026-11-19):  applyPanelView  sin el chequeo de l | acknowledged | 2026-11-19 | v0.31 |
