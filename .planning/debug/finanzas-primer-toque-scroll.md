---
status: diagnosed
trigger: "G-04-6 (finanzas-primer-toque-scroll): el primer toque de un tab de Finanzas (Ventas o Egresos) después de entrar a Finanzas scrollea la página hasta arriba; los siguientes no. Los tabs de Negocio y Configuración no lo hacen."
created: 2026-11-17T22:00:00Z
updated: 2026-11-17T23:10:00Z
goal: find_root_cause_only
workstream: panel-nav
gap: G-04-6
---

## Current Focus

veredicto: "CAUSA RAÍZ CONFIRMADA (H-A) con reproducción medida y prueba de causalidad (ver Resolution)."
next_action: "ninguna en este debug: devolver ROOT CAUSE FOUND al orquestador; el arreglo lo decide/planifica la fase"
hypothesis_original: "H-A (WR-01 de 04-REVIEW.md): en una navegación BLANDA a /finances, el `<Suspense fallback={null}>` nuevo de app/(dashboard)/finances/page.tsx:26 hace commit con `null` mientras el chunk de FinancesClient carga; el `InnerScrollAndFocusHandlerOld` del layout-router no encuentra nodo del DOM (layout-router.js:142-144) y deja el `scrollRef` de la navegación en `current: true`. El primer `pushState` del tab dispara ACTION_RESTORE, el handler corre en componentDidUpdate con el ref todavía pendiente y, como el borde de arriba de la página está fuera del viewport, ejecuta `htmlElement.scrollTop = 0` (L181) y recién ahí lo consume."
test: "sonda CDP nueva (.planning/debug/probes/g04-scroll-y-recarga.mjs, mismo arnés que panel-exit-en-la-app.mjs) bajo con-turno: scrollY antes/después del 1er y 2º toque, con un registro de cada escritura de scroll (setter de scrollTop sobre <html>/<body>, scrollTo, scrollIntoView) con su pila de JS, y un MutationObserver del contenedor de la página para ver si la página hace commit VACÍA al entrar."
expecting: "si H-A: entrada blanda ⇒ 1er toque con scrollY → 0 y una escritura `scrollTop=0` con `handlePotentialScroll` en la pila; 2º toque sin movimiento; recarga dura ⇒ sin salto; re-entrada en la misma sesión ⇒ sin salto; contenedor vacío durante la entrada blanda."
corridas: "1 (entorno: /login 404) · 2 (RED en tarjeta, sidebar, Negocio; carga dura sin salto) · 3 (instrumento: P-1 de la barra; IN-02 no discriminante) · 4 (entorno: /login 404) · 5 (RED por Más + re-entrada sin salto + IN-02 confirmado) · 6 (experimento temporal de causalidad, revertido). Logs en el scratchpad de la sesión; los números están copiados en Evidence."
esperados_escritos_antes_de_correr: |
  (2026-11-17, antes de la primera corrida; son los `esperado_si_HA` de la sonda, copiados acá)
  F-blanda-mas-movil (390x844; Inicio → Más → Finanzas blanda, primera vez en el documento):
    vacio_al_entrar=si · salto_toque1 (Ventas)=si con una escritura `scrollTop=0` en <html> cuya pila
    nombra handlePotentialScroll/componentDidUpdate del layout-router · salto_toque2 (Egresos)=no ·
    re-entrada en el mismo documento: vacio_al_reentrar=no · salto_toque3 (Ventas)=no.
  F-directa-movil (predicción a, carga dura de /finances): salto_toque1=no · salto_toque2=no.
  F-tarjeta-movil (Inicio → tarjeta «Ingresos del mes»): vacio_al_entrar=si · salto Egresos=si · salto Ventas=no.
  F-sidebar-escritorio (1280x800, sidebar): vacio_al_entrar=si · salto_toque1=si · salto_toque2=no.
  N-negocio-borde-movil (predicción c): vacio_al_entrar=si · salto Cobros (borde 40 px fuera)=si ·
    salto Integraciones=no · IN-02 emulado (router.refresh en Integraciones con el borde fuera)=scrollea.
  Si H-A es FALSA: salto_toque1=no en las entradas blandas (y H-B predeciría movimiento en CADA cambio
  de un tab largo a uno corto, con `alto` que baja, no sólo en el primero).
bug_class: Bohrbug (determinista por camino de entrada; la condición disparadora —chunk sin cargar— es de estado de sesión, no de azar)
known_pattern_candidate: "ninguno: .planning/debug/knowledge-base.md no existe; MemPalace no consultado (sin recall cableado en este agente)"

## Symptoms

expected: tocar Ventas o Egresos por primera vez después de entrar a Finanzas cambia el tab sin mover el scroll de la página, igual que los toques siguientes y que los tabs de Negocio/Configuración.
actual: (dueño, textual) «Al entrar la primera vez por nueva pestaña, cuando voy a finanzas>ventas, el primer tacto hace un scroll hacia el inicio de la página, después no pasa mas» · (escritorio) «Acá está el mismo scroll hacia el inicio de la página la primer vez que tocas Ventas» · «Lo del scroll es solo en Finanzas>Ventas» · «tambien tocando Egresos está ese scroll, es algo de Finanzas». Visto en Android Chrome 157.0.8103.78 y Chrome de escritorio en PRODUCCIÓN (commit 974a131); no reportado en Safari 18.7.8.
errors: ninguno
reproduction: test 6 de 04-UAT-CIERRE.md; pestaña nueva → Inicio → Más (o la tarjeta «Ingresos del mes», o el sidebar de escritorio) → Finanzas → scrollear hasta los tabs → tocar Ventas.
started: Phase 4 (2026-11-17). Antes de la fase el tab no escribía historial.

## Eliminated

- hypothesis: "H-B (datos/render): el cambio de tab acorta el documento y el navegador recorta el scroll"
  evidence: "en todos los toques de Finanzas `alto` quedó igual antes y después (2248 móvil, 1630 escritorio); el primer toque movió 715–1257 px CON una escritura de la página (handlePotentialScroll) y los demás toques —mismos tabs, mismos datos— no escribieron nada; los únicos deltas sin escritura (-18/-37/-55) son el recorte del máximo cuando el viewport emulado crece (innerHeight 844 → 881/899, vv.dy 37/55), no un cambio de alto del contenido."
  timestamp: 2026-11-17T22:50:00Z

## Evidence

- timestamp: 2026-11-17T22:00:00Z
  checked: "lectura de node_modules/next/dist/client/components/layout-router.js:115-197 (InnerScrollAndFocusHandlerOld; enableNewScrollHandler = process.env.__NEXT_APP_NEW_SCROLL_HANDLER, no seteado en next.config.ts)"
  found: "el handler sale SIN consumir (`scrollRef.current` sigue en true) si `findDOMNode(this)` no devuelve un Element (L142-144); lo consume (L162) sólo cuando encuentra nodo, y corre en componentDidMount Y en componentDidUpdate. Si el borde de arriba del nodo está fuera del viewport ejecuta `document.documentElement.scrollTop = 0` (L181)."
  implication: "el mecanismo de WR-01 existe en el código que corre; falta medir que se active en este camino."
- timestamp: 2026-11-17T22:00:00Z
  checked: "app-router.js:233-262 (parche de pushState) y restore-reducer.js"
  found: "todo pushState con URL ajeno a Next despacha ACTION_RESTORE dentro de startTransition; el restore usa FreshnessPolicy.HistoryTraversal con `accumulation.scrollRef = null` (no crea un ref nuevo)."
  implication: "el restore no fabrica un scroll nuevo: si scrollea, es un ref que quedó pendiente de antes."
- timestamp: 2026-11-17T22:00:00Z
  checked: "app/(dashboard)/finances/page.tsx, finances-client.tsx:1088-1176, app/(dashboard)/layout.tsx:133-145; búsqueda de loading.tsx/template.tsx en app/"
  found: "la página envuelve a FinancesClient en `<Suspense fallback={null}>`; no hay loading.tsx ni template.tsx en el route group; los tabs están DEBAJO de KPIs, resumen, gastos fijos y gráficos (L1088), así que para tocarlos hay que haber scrolleado. Las tres TabsContent cambian el alto del documento al cambiar de tab."
  implication: "hipótesis competidora H-B (datos/render): el cambio de tab acorta el documento y el navegador recorta el scroll. Discriminador: H-B predice el mismo movimiento en CADA cambio largo→corto, no sólo en el primero; se mide scrollHeight antes/después."
- timestamp: 2026-11-17T21:42:00Z
  checked: "corrida 1 de la sonda (turno libre, 18:39 AR): log del next dev propio y .next/dev/types/routes.d.ts que ese servidor generó"
  found: "ERROR DEL ENTORNO, no de la app: `GET /login 404` dos veces; el routes.d.ts generado lista SÓLO `/`, `/[slug]` y `/suspendido` (ninguna página anidada: el /login cayó en app/[slug], que hace notFound()). La sonda murió en el login (`document.getElementById('email')` nulo). No se midió nada. El código de app/ no cambió desde la última corrida buena (12:34 AR, `GET /login 200`). Un escaneo del mismo directorio con el Watchpack de Next (scratchpad/watchpack-app.cjs, sin servidor) encuentra las 38 páginas. En ese momento el Supabase del ERP se estaba reiniciando (contenedores `Up About a minute`)."
  implication: "fallo transitorio del escaneo inicial del watcher de next dev bajo carga, no un defecto de la app ni del instrumento; se reintenta por el turno. Si se repite, se reporta (no se toca la app ni next.config.ts)."
- timestamp: 2026-11-17T22:20:00Z
  checked: "corrida 2 (reintento, 18:50 AR tras esperar ~5 min al Playwright del ERP; página SIN tocar, huella f079ef8df9a24c2b, `<Suspense fallback={null}>`; Chrome 157.0.8103.52; `GET /login 200`). Log: scratchpad/corrida2.log"
  found: |
    F-tarjeta-movil (Inicio → tarjeta → Finanzas, blanda, documento nuevo, 390x844):
      contenedor de la página SIN NADA visible durante 328 ms al entrar (t=2542 hijos=0 → t=2870 aparece div.space-y-6.max-w-5xl).
      1er toque (Egresos): y 1404 → 147 (delta -1257; primera_top -1257 → 0), animado (35 pasos de scroll),
        y DOS escrituras de la página en el mismo ms: `scrollTop=0` en <html> y `scrollIntoView()` en el div de la página,
        las dos con la pila `… < disableSmoothScrollDuringRouteTransition < InnerScrollAndFocusHandlerOld.handlePotentialScroll
        < InnerScrollAndFocusHandlerOld.componentDidUpdate < … commitLayoutEffectOnFiber`.
      2º toque (Ventas): delta 0, ninguna escritura.
    F-sidebar-escritorio (1280x800, sidebar, blanda): contenedor vacío 315 ms al entrar; 1er toque (Ventas) y 830 → 115
      (primera_top -715 → 0) con las mismas dos escrituras desde handlePotentialScroll/componentDidUpdate; 2º toque (Egresos) delta 0, sin escrituras.
    F-directa-movil (predicción a, carga DURA de /finances): 1er toque y 1404 → 1367 y 2º 1367 → 1349, CERO escrituras de la
      página; el delta es el recorte del máximo de scroll (alto 2248 − innerHeight 881 = 1367, el viewport emulado creció 37 px:
      vv.dy 0 → 37 → 55), no un scroll de Next.
    N-negocio-borde-movil (predicción c, Más → Negocio blanda): contenedor vacío 382 ms al entrar; con el borde de arriba 40 px
      fuera (primera_top -40), el 1er toque (Cobros) escribe `scrollTop=0` + `scrollIntoView()` desde
      handlePotentialScroll/componentDidUpdate (y 187 → 0; además el alto bajó a 844 = viewport); 2º toque sin escrituras.
    IN-02 emulado (window.next.router.refresh() en ?tab=integraciones): NO DISCRIMINANTE — a 390x844 Integraciones no desborda
      (alto 844 = viewport, máximo de scroll 0), no se pudo poner el borde fuera; cero escrituras (el pedido sí salió: `GET /negocio?tab=integraciones`).
    F-blanda-mas-movil: ERROR DEL INSTRUMENTO — en la primera navegación de la sesión (compilación en frío) el toque en Más no
      llegó a /mas en 90 s (`GET /mas 200 in 2.4s` en el log del servidor, pero la URL no cambió). No midió nada; se re-corre con calentamiento.
  implication: |
    H-A CONFIRMADA en su mecanismo por observación directa: la página hace commit VACÍA en la entrada blanda, y el primer
    toque de tab dispara el scroll de navegación pendiente desde `componentDidUpdate` del handler de Next; el segundo no
    (el ref ya se consumió). La carga dura no lo hace (predicción a) y Negocio tiene el mismo ref pendiente, invisible porque
    sus tabs están arriba (predicción c).
    ⚠ NOTA DEL INSTRUMENTO (P-1, declarada): el clasificador `salto_al_inicio` (min_y ≤ 5) estaba mal calibrado —suponía y→0—
    y por eso imprimió `no` en F-tarjeta y F-sidebar. Los números crudos no cambian: la página arranca a 147 px (móvil) /
    115 px (escritorio) por el header y los banners, y Next hace `scrollTop=0` y enseguida `scrollIntoView()` del div porque
    `<html>` tiene `scroll-behavior: smooth` (el log de Next lo avisa: falta `data-scroll-behavior="smooth"`), así que el
    scroll animado todavía no movió nada cuando chequea `topOfElementInViewport` → termina con el div pegado arriba
    (primera_top = 0). Eso ES «el inicio de la página» que ve el dueño. La corrida 3 agrega el criterio `llevo_al_inicio`
    (primera_top de <0 a ≥0) y `escritura_de_next` (pila con handlePotentialScroll) sin tocar ningún esperado de H-A.
- timestamp: 2026-11-17T22:35:00Z
  checked: "corrida 3 (página SIN tocar; con calentamiento de /mas, /finances, /negocio, /clients, /dashboard por carga dura). Log: scratchpad/corrida3.log"
  found: |
    F-blanda-mas-movil: OTRA VEZ error del instrumento en el PRIMER recorrido («el toque en /mas no llegó a /mas»); el servidor
      registró `GET /mas` y enseguida `GET /finances`: el toque cayó en otra cosa (la tarjeta de Inicio que lleva a /finances).
      Causa del instrumento: la copia de `tocarEnLaBarra`/`tocarEnlace` toca en coordenadas del viewport de LAYOUT, sin la
      conversión al viewport VISUAL que el 04-01 le puso a `tocarTab` (el viewport visual queda desplazado con `mobile: true`,
      medido dy=37/55 en la corrida 2). Arreglado en la sonda (conversión + afirmación con elementFromPoint + dice dónde quedó).
    IN02-refresh-corto (390x480, carga dura de /negocio?tab=integraciones, borde 40 px fuera, alto 812): router.refresh() salió
      (`GET /negocio?tab=integraciones` x2) y NO movió nada (y 187 → 187, cero escrituras). NO DISCRIMINA: con la carga dura el
      árbol ya trae `__PAGE__?{"tab":"integraciones"}` y el refresh coincide; la precondición de IN-02 es el árbol viejo
      (`__PAGE__`) que deja un pushState del tab. Se rehace entrando por carga dura a /negocio y tocando Integraciones.
  implication: "ningún dato nuevo sobre H-A; dos instrumentos corregidos (P-1 declarado), ningún esperado cambiado."
- timestamp: 2026-11-17T22:40:00Z
  checked: "corrida 4 (19:21 AR, turno libre): log del next dev propio (forjo-sonda-g04-next-41360.log)"
  found: "el MISMO fallo de entorno que la corrida 1: `GET /login 404` dos veces con el servidor recién levantado; no se midió nada. Patrón: 2 de 4 arranques de `next dev` en esta sesión salen con el árbol de rutas incompleto (sólo páginas de primer nivel), sin cambios en app/; un arranque posterior anda. Coincide con que la sonda mata el servidor con `taskkill /F` (la de la fase hace lo mismo) mientras Turbopack puede estar escribiendo su caché persistente (`✓ Finished writing to filesystem cache` aparece a mitad de corrida)."
  implication: "defecto del ENTORNO de desarrollo (caché persistente de Turbopack / arranque de next dev), no de la app ni de la hipótesis. La sonda ahora exige `/login 200` y reinicia SU servidor hasta dos veces; se reporta al orquestador como hallazgo de entorno (puede pegarle también a panel-exit-en-la-app.mjs y al next dev del dueño)."
- timestamp: 2026-11-17T22:50:00Z
  checked: "corrida 5 (página SIN tocar, huella f079ef8df9a24c2b; /login 200 al primer intento; calentamiento). Log: scratchpad/corrida5.log"
  found: |
    F-blanda-mas-movil (EL camino del dueño: Inicio → Más → Finanzas, blanda, 390x844) — los 8 valores = H-A:
      entrada: contenedor de la página con hijos=0 durante 1724 ms (t=8717 → t=10441), después div.space-y-6.max-w-5xl.
      1er toque (Ventas): y 1404 → 147, primera_top -1257 → 0, animado (35 pasos), escrituras `scrollTop=0` en <html> +
        `scrollIntoView()` del div, ambas con pila `disableSmoothScrollDuringRouteTransition < InnerScrollAndFocusHandlerOld.handlePotentialScroll
        < InnerScrollAndFocusHandlerOld.componentDidUpdate < … commitLayoutEffectOnFiber`.
      2º toque (Egresos): ninguna escritura (delta -18 = recorte del máximo por el viewport emulado 844 → 881).
      RE-ENTRADA en el mismo documento (Más → Finanzas otra vez): el contenedor NUNCA queda vacío (de /mas pasa directo al div
        de Finanzas: la transición retuvo la UI vieja porque el chunk ya estaba cargado) y el 1er toque (Ventas) NO escribe
        (delta -37 = recorte). ⇒ predicción (b) confirmada.
    IN02-refresh-corto (390x480, carga dura de /negocio, toque en Integraciones = pushState con el árbol viejo, borde 40 px fuera):
      el toque previo no escribe (la hidratación no deja ref pendiente); `window.next.router.refresh()` ⇒ `scrollTop=0` +
      `scrollIntoView()` desde handlePotentialScroll/componentDidUpdate, y 187 → 147, primera_top -40 → 0. ⇒ IN-02 confirmado
      (emulado con el mismo router; el botón real de desconectar no se tocó: no hay cuenta conectada en local). A 390x844
      Integraciones no desborda, así que ahí no se ve.
  implication: "H-A confirmada en el camino del dueño, con las tres predicciones del code review (a: carga dura sin salto; b: re-entrada sin salto; c: Negocio con el mismo ref pendiente). Falta la prueba de causalidad: cambiar SÓLO el fallback del Suspense de finances/page.tsx y ver que el primer toque deje de escribir, con Negocio sin tocar como control positivo en la misma corrida."
- timestamp: 2026-11-17T22:52:00Z
  checked: "ESPERADOS DE LA CORRIDA 6, escritos ANTES de correrla (EXPERIMENTO TEMPORAL de causalidad)"
  found: |
    Cambio temporal (se revierte con Edit, nunca con git checkout): app/(dashboard)/finances/page.tsx:26
      `<Suspense fallback={null}>` → `<Suspense fallback={<div className="space-y-6 max-w-5xl" aria-busy="true" />}>` (el fix de WR-01).
    Si H-A es la causa: F-blanda-mas-movil, F-tarjeta-movil y F-sidebar-escritorio ⇒ salto_toque1=no y next_toque1=no (el
      handler encuentra el div del fallback en el montaje y consume el ref; el div vacío tiene alto 0 pero ancho > 0, así que
      `shouldSkipElement` no lo saltea; el `vacio_al_entrar` de la sonda cuenta hijos de alto > 0 y va a seguir diciendo `si`:
      se lee `hijos=1` en las líneas). N-negocio-borde-movil (Negocio SIN tocar, control positivo): salto_toque1=si, next_toque1=si.
    Si H-A NO es la causa: el primer toque de Finanzas sigue escribiendo desde handlePotentialScroll.
  implication: "criterio de corte fijado antes de medir."
- timestamp: 2026-11-17T23:05:00Z
  checked: "corrida 6 = EXPERIMENTO TEMPORAL (finances/page.tsx con el fallback div, huella bab1c12850d1d4f9; negocio/page.tsx SIN tocar). Log: scratchpad/corrida6.log. Revertido con Edit al terminar: `git diff` vacío en app/, lib/, components/, scripts/ y next.config.ts."
  found: |
    Finanzas con el fallback div — en la entrada el contenedor muestra `hijos=1 visibles=0` (el div del fallback, alto 0: HAY nodo)
    en vez de `hijos=0`, y el 1er toque NO escribe en los TRES caminos:
      F-blanda-mas-movil: 1er toque (Ventas) cero escrituras (delta -37 = recorte del viewport emulado); 2º y re-entrada, cero.
      F-tarjeta-movil: 1er toque (Egresos) cero escrituras (delta -55 = recorte); 2º cero.
      F-sidebar-escritorio: 1er toque (Ventas) y 830 → 830, cero escrituras; 2º cero.
    Negocio SIN tocar (control positivo en la MISMA corrida): entrada con `hijos=0` durante 373 ms; 1er toque (Cobros, borde fuera)
      ⇒ `scrollTop=0` + `scrollIntoView()` desde handlePotentialScroll/componentDidUpdate, y 187 → 0.
  implication: "CAUSALIDAD CONFIRMADA: cambiar SÓLO el fallback (darle un nodo del DOM al boundary) apaga el salto en los tres caminos de Finanzas, mientras la página hermana con `fallback={null}` lo sigue mostrando en la misma corrida. H-A es la causa."
- timestamp: 2026-11-17T23:06:00Z
  checked: "app/globals.css:345-347 y node_modules/next/dist/shared/lib/router/utils/disable-smooth-scroll.js"
  found: "`@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }` y SIN `data-scroll-behavior=\"smooth\"` en <html>: Next 16 sólo apaga el scroll suave durante la transición si ese atributo está (si no, avisa en dev: «Detected scroll-behavior: smooth…», visto en el log de todas las corridas). Por eso el `scrollTop=0` de Next es ANIMADO, el chequeo `topOfElementInViewport` todavía ve la posición vieja y además llama `scrollIntoView()`: el salto termina con el div de la página pegado arriba (y=147 móvil / 115 escritorio), no en y=0. Con reduced-motion sería instantáneo a y=0."
  implication: "factor de FORMA (animado, dónde aterriza), no de causa: sin el ref pendiente no hay scroll ninguno (corrida 6)."

## Resolution

root_cause: |
  El `<Suspense fallback={null}>` que agregó la Phase 4 en app/(dashboard)/finances/page.tsx:26 hace que, en una navegación
  BLANDA a /finances con el chunk de FinancesClient todavía sin cargar en ese documento, la página haga commit SIN ningún
  nodo del DOM (medido: contenedor con hijos=0 durante 310–1724 ms). El `InnerScrollAndFocusHandlerOld` de Next 16.2.7
  (layout-router.js:115-197) no encuentra nodo en el montaje y deja PENDIENTE el `scrollRef` de esa navegación. La primera
  actualización del router que viene después —el ACTION_RESTORE que despacha el parche de pushState de Next cuando el toque
  del tab llama a `applyPanelView`— re-renderiza el layout-router y su `componentDidUpdate` → `handlePotentialScroll`
  consume el ref: como el borde de arriba de la página está fuera del viewport (los tabs de Finanzas están debajo de KPIs y
  gráficos), ejecuta `document.documentElement.scrollTop = 0` + `scrollIntoView()` del div de la página. Los toques
  siguientes no lo repiten porque el ref ya se consumió.
  Es un AND de tres condiciones: (1) entrada blanda (la carga dura no asigna scrollRef: medido sin escrituras); (2) el chunk
  del cliente sin cargar en ESE documento (re-entrada en la misma sesión: sin commit vacío y sin escritura); (3) el borde de
  arriba fuera de la pantalla en la primera actualización del router. Negocio/Configuración tienen (1) y (2) iguales
  (medido en Negocio, predicción c) pero casi nunca (3), porque sus tabs están arriba.
fix: (no aplica: goal find_root_cause_only)
verification: |
  Reproducción RED medida (corridas 2 y 5, página sin tocar) en los tres caminos del dueño: Más (390x844) 1404 → 147,
  tarjeta (390x844) 1404 → 147, sidebar (1280x800) 830 → 115, siempre con la pila
  `InnerScrollAndFocusHandlerOld.handlePotentialScroll < componentDidUpdate`; segundo toque sin escritura; carga dura y
  re-entrada sin escritura. Causalidad (corrida 6, experimento temporal revertido): con el fallback div los tres caminos
  dejan de escribir y Negocio sin tocar sigue escribiendo en la misma corrida.
files_changed: []
reasoning_checkpoint:
  hypothesis: "el fallback null del Suspense de la página deja pendiente el scroll de la navegación blanda y el primer pushState del tab lo dispara"
  confirming_evidence:
    - "pila de la escritura medida: disableSmoothScrollDuringRouteTransition < InnerScrollAndFocusHandlerOld.handlePotentialScroll < InnerScrollAndFocusHandlerOld.componentDidUpdate, en el toque 1 y nunca en el toque 2"
    - "contenedor de la página con hijos=0 en cada entrada blanda con el chunk sin cargar; nunca en la re-entrada"
    - "intervención: sólo cambiar el fallback a un div apaga la escritura en los tres caminos; el control (Negocio) la sigue mostrando"
  falsification_test: "con el fallback div el primer toque seguiría escribiendo desde handlePotentialScroll (no pasó: cero escrituras en 3/3)"
  fix_rationale: "darle un nodo del DOM al boundary mientras suspende (o no tener el boundary dentro de la página) deja que el handler consuma el ref en el montaje, como antes de la fase"
  blind_spots: "build de producción (sólo next dev con modo estricto; el dueño lo vio en producción, así que el mecanismo existe allá también); Safari de iOS (no reportado en el 8.2; no medido); el alternativo «sacar el Suspense» no se midió; /clients tiene el mismo molde desde v0.30 y no se midió"
  candidate_causes:
    - "code (app): el `<Suspense fallback={null}>` nuevo de la página — CONFIRMADA por intervención"
    - "code (framework): el handler de scroll de Next 16.2.7 deja el ref pendiente sin nodo y lo consume en cualquier update posterior — mecanismo, no se toca"
    - "data/render (H-B): el cambio de tab acorta el documento y el navegador recorta — ELIMINADA"
    - "environment: chunk del cliente sin cargar en el documento — condición necesaria (re-entrada sin salto)"
    - "config (CSS): `scroll-behavior: smooth` sin `data-scroll-behavior` — da la FORMA (animado, aterriza en el div), no la causa"
  and_gate: "sí: entrada blanda ∧ chunk sin cargar en el documento ∧ borde de arriba fuera del viewport en la primera actualización del router; la causa raíz modificable es el fallback sin nodo"
related_finding_IN02: "CONFIRMADO (emulado con window.next.router.refresh(), corrida 5): con el árbol viejo que deja un pushState de tab, un router.refresh() en /negocio?tab=integraciones con el borde fuera escribe scrollTop=0 + scrollIntoView desde el mismo handler (y 187 → 147, 390x480). Mecanismo DISTINTO (un scrollRef NUEVO por la clave `__PAGE__` vs `__PAGE__?{\"tab\":…}`), así que el cambio del fallback NO lo arregla. A 390x844 Integraciones no desborda y no se ve."
environment_finding: "2 de 6 arranques de `next dev` en esta sesión (corridas 1 y 4) salieron con el árbol de rutas incompleto (`GET /login 404`, routes.d.ts con sólo /, /[slug] y /suspendido) sin cambios en app/; un servidor nuevo anduvo. La sonda nueva se protege exigiendo /login 200 y reiniciando SU servidor; panel-exit-en-la-app.mjs no tiene esa guarda."
