---
status: diagnosed
trigger: "G-04-9 (b1-tras-recarga): B1 después de recargar con un tab abierto (code review WR-04, SIN MEDIR)."
created: 2026-11-17T22:00:00Z
updated: 2026-11-17T22:55:00Z
goal: find_root_cause_only
workstream: panel-nav
gap: G-04-9
---

## Current Focus

veredicto: "NO REPRODUCE — H-1 refutada con números (ver Eliminated y Resolution). Nada que arreglar en el código de la fase; si se quiere blindar igual, es una decisión del dueño, no un defecto medido."
next_action: "ninguna en este debug: devolver el veredicto al orquestador (G-04-9 descartado con el número)"
hypothesis_original: "H-1 (WR-04 de 04-REVIEW.md): la marca `{frjView:'tab'}` de /negocio?tab=cobros sobrevive a la recarga (history.state se preserva), pero la entrada de abajo (/negocio) es del documento ANTERIOR. Al tocar Inicio, `vistaArriba` da true, B1 (`consume-view-then-navigate`) hace `history.back()` y ese retroceso es ENTRE DOCUMENTOS: carga /negocio de cero, el `popstate` no llega a este documento, el listener `once` del segundo paso muere con él y `decidirDesdeElAterrizaje` no corre ⇒ el dueño tocó Inicio y queda en Negocio/Datos (con una recarga en el medio)."
test: "sonda CDP nueva (.planning/debug/probes/g04-scroll-y-recarga.mjs, mismo arnés que panel-exit-en-la-app.mjs) bajo con-turno: control (Más → Negocio → Cobros → Inicio, sin recargar) y variante (lo mismo con Page.reload antes de tocar Inicio), midiendo la pila cruda y normalizada, el hash, el estado de la entrada, los documentos nuevos, los popstate y el aviso; después un atrás de la interfaz."
expecting: "si H-1: la variante termina en /negocio (Datos) con un documento nuevo y sin popstate, sin #salir; el control en /dashboard#salir. Si no reproduce: la variante termina igual que el control."
esperados_escritos_antes_de_correr: |
  (2026-11-17, antes de la primera corrida; son los `esperado_si_HA` de la sonda, copiados acá)
  B1-recarga-movil (390x844, gesto de atrás = interfaz):
    control (sin recarga): url=/dashboard · aviso armado (#salir)=si · el atrás avisa=si.
    variante (con recarga antes del toque): marca tras recargar={"frjView":"tab"} · url final=/negocio
    (Datos, sin ?tab) · #salir=no · documentos nuevos tras el toque=[/negocio] · popstates en el
    documento tras el toque=0 · pila normalizada=[/dashboard, /mas, /negocio] · el atrás avisa=no ·
    igual al control=no.
  Si H-1 es FALSA ("no reproduce"): la variante termina igual que el control (url=/dashboard, #salir=si).
bug_class: Bohrbug (determinista: depende sólo de la secuencia recarga → toque)
known_pattern_candidate: "ninguno: .planning/debug/knowledge-base.md no existe; MemPalace no consultado (sin recall cableado en este agente)"

## Symptoms

expected: recargar con un tab abierto (p. ej. /negocio?tab=cobros entrando por Más → Negocio → Cobros) y después tocar Inicio en la barra de abajo ⇒ igual que sin recargar: cae en Inicio con `#salir` y el primer atrás muestra el aviso de salida (no vuelve a Cobros/Negocio).
actual: sin medir. El code review WR-04 deriva que la marca `frjView` sobrevive a la recarga, el `back()` del `consume-view-then-navigate` cae en un documento distinto, no llega `popstate` al guard y se pierde el segundo paso ⇒ el dueño termina en Negocio/Datos.
errors: ninguno
reproduction: test 9 de 04-UAT-CIERRE.md
started: code review de la Phase 4 (2026-11-17); B1 entró en el plan 04-04 (b13f0a1).

## Eliminated

- hypothesis: "H-1 (WR-04): tras recargar con un tab abierto, el back() de B1 cruza de documento, no llega el popstate y el dueño queda en Negocio/Datos"
  evidence: "corrida 2 (Chrome 157, gesto interfaz): después de Page.reload en /negocio?tab=cobros, el back() de consumeOwnedPanelEntry aterrizó en /negocio con `popstate` en el MISMO documento nuevo (2kfgb9), sin documento nuevo; el segundo paso (decidirDesdeElAterrizaje) corrió y encadenó dos retrocesos más (/mas, /dashboard) en ese documento; final /dashboard#salir con el aviso armado, pila [/dashboard], y el atrás mostró el aviso — idéntico al control sin recarga. La premisa «la recarga le asigna otra secuencia de documento a la entrada actual y la de abajo queda en el documento anterior» no se cumple: la recarga reemplazó el documento de TODAS las entradas que el documento viejo había empujado con pushState (en el modelo de la especificación HTML esas entradas comparten el mismo «document state», y la recarga lo recarga entero)."
  timestamp: 2026-11-17T22:20:00Z

## Evidence

- timestamp: 2026-11-17T22:00:00Z
  checked: "lib/panel-branch.ts:404-422 (rama consume-view-then-navigate de runBranchNavigation), :2028-2051 (decidirDesdeElAterrizaje), :1500-1530 (branchStackFacts); lib/panel-history.ts:1146-1152 (consumeOwnedPanelEntry)"
  found: "el segundo paso se engancha como `addEventListener('popstate', segundoPaso, { once: true })` en el documento actual y el consumo es un `history.back()` guardado sólo por la forma del estado (`panelViewEntryParam(estado) !== null && !isForeignOwnedEntry(estado)`); la marca `frjView` no lleva identidad de documento ni de instancia."
  implication: "nada en el código distingue una marca de este documento de una heredada por la recarga: si el retroceso cruza de documento, el segundo paso no tiene quién lo ejecute."
- timestamp: 2026-11-17T22:20:00Z
  checked: "corrida 2 de .planning/debug/probes/g04-scroll-y-recarga.mjs (B1-recarga-movil, 390x844, gesto de atrás = interfaz `chrome.tabs.goBack`, Chrome 157.0.8103.52 headless, next dev propio en 3031, modo estricto activo). Log: scratchpad/corrida2.log"
  found: |
    CONTROL (sin recarga): en Cobros pila=[/dashboard, /mas, /negocio, /negocio?tab=cobros] estado={"frjView":"tab"};
      tras tocar Inicio: url=/dashboard#salir estado={"frjExit":1}, pila=[/dashboard], cruda=[(afuera), /dashboard, /dashboard#salir];
      el atrás: url=/dashboard, aviso visible=si.
    VARIANTE (con Page.reload en /negocio?tab=cobros antes del toque):
      la recarga crea el documento 2kfgb9 con estado {"frjView":"tab"} (la marca SOBREVIVE, como decía WR-04); pageshow persisted=false;
      la hidratación de Next re-escribe la entrada conservando frjView.
      tras tocar Inicio, TODO en el MISMO documento 2kfgb9: back (consumeOwnedPanelEntry < runBranchNavigation < handleNavigate)
      → popstate en /negocio (frjUnder=/mas) → back (consumeOwnedBranchEntry < decidirDesdeElAterrizaje < reDecidir < segundoPaso)
      → popstate en /mas → back → popstate en /dashboard → pushState #salir (armarSentinel).
      documentos nuevos tras el toque = 0 · popstates = 3 · url final=/dashboard#salir · aviso armado=si · pila=[/dashboard] ·
      cruda=[(afuera), /dashboard, /dashboard#salir] · el atrás: /dashboard con el aviso visible=si.
      variante_igual_al_control = si.
  implication: "H-1 REFUTADA en Chrome 157: la premisa de WR-04 («la entrada de abajo pertenece al documento anterior a la recarga y el back() es entre documentos») es falsa en este motor. Después de recargar, el retroceso a las entradas que había empujado el documento viejo fue del MISMO documento (popstate en 2kfgb9, sin documento nuevo), así que el segundo paso de B1 corre y el gesto termina igual que sin recargar."
- timestamp: 2026-11-17T22:50:00Z
  checked: "corrida 5: los otros dos destinos de la barra (WR-04 decía «todos los gestos de la barra con un tab abierto»), cada uno con control sin recarga y variante con Page.reload. Log: scratchpad/corrida5.log"
  found: |
    B1-recarga-turnos: control pila=[/dashboard, /appointments]; variante (tras recargar, marca {"frjView":"tab"}) → back
      (consumeOwnedPanelEntry) → popstate en /negocio en el MISMO documento xtlodq → back (consumeOwnedBranchEntry <
      decidirDesdeElAterrizaje) → popstate en /mas → replace a /appointments; final /appointments, pila=[/dashboard, /appointments]
      = control; documentos nuevos tras el toque = [].
    B1-recarga-mas: control pila=[/dashboard, /mas]; variante → back → popstate /negocio (mismo documento 3kt3cd) → back →
      popstate /mas; final /mas, pila=[/dashboard, /mas] = control; documentos nuevos = [].
  implication: "los tres destinos de la barra (Inicio, Turnos, Más) terminan igual con y sin recarga: G-04-9 no reproduce en Chrome 157 de escritorio con emulación móvil y el atrás de la interfaz."

## Resolution

root_cause: "NO REPRODUCE (medido). No hay defecto: tras recargar en /negocio?tab=cobros, Chrome 157 trata las entradas que el documento viejo había empujado con pushState (/negocio, /mas, /dashboard) como del MISMO documento nuevo; el back() de B1 dispara popstate en ese documento, el segundo paso (decidirDesdeElAterrizaje) corre y el gesto termina igual que sin recarga en los tres destinos de la barra. La premisa de WR-04 (una secuencia de documento nueva sólo para la entrada recargada) no se cumple en este motor."
fix: (no aplica: goal find_root_cause_only; y no hay defecto que arreglar)
verification: "corridas 2 y 5 de .planning/debug/probes/g04-scroll-y-recarga.mjs (B1-recarga-movil, B1-recarga-turnos, B1-recarga-mas), cada una con control sin recarga; números en Evidence."
files_changed: []
blind_spots: "Safari/WebKit de iOS y Chrome de Android reales no medidos (Android comparte el código de historial de Chromium: se espera igual); una pestaña DESCARTADA y restaurada por el sistema (Android) o una restauración de sesión no son una recarga y no se midieron; sólo dev (next dev, modo estricto)."
