---
status: diagnosed
trigger: "Investigá si HOY es viable interceptar el botón atrás del navegador para el aviso de cambios sin guardar en Forjo App. Solo diagnóstico y costo — NO apliques ningún cambio."
created: 2026-10-05T00:00:00Z
updated: 2026-10-05T00:00:00Z
---

## Current Focus

veredicto: VIABLE CON CONDICIONES (diagnostico cerrado, nada aplicado)

reasoning_checkpoint:
  hypothesis: "La premisa de unsaved-changes-guard.tsx:21-25 es mitad verdadera (no hay API para CANCELAR el popstate) y mitad caduca (el truco de entrada sentinel NO desincroniza el router: Next lo preserva a proposito y el repo ya lo corre en prod)."
  confirming_evidence:
    - "MEDIDO: popstate llega cancelable:false, preventDefault() no-op (Chrome 153 headless)."
    - "MEDIDO: Navigation API con el atras REAL del navegador llega cancelable:false/userInitiated:true => no se puede cancelar."
    - "LEIDO: navigation.js:412-413 setea preserveCustomHistoryState:true en el traverse — Next conserva la marca custom a proposito."
    - "LEIDO: app-router.js:258-262 — el pushState parcheado despacha la sincronizacion del router."
    - "LEIDO: lib/overlay-history.ts corre el truco completo (push + popstate + re-push + back guardado) en 39 overlays, en prod, verificado en celular real."
    - "MEDIDO: el ciclo sentinel completo (S1-S4) funciona, incluida la guarda contra el back() sobre entrada ajena."
  falsification_test: "Que el atras del usuario llegara con cancelable:true (habria una via limpia) o que el back borrara la marca custom de la entrada (el sentinel no sobreviviria). Las dos se midieron y dieron lo contrario."
  fix_rationale: "N/A — no se aplica fix en esta sesion. El diseno propuesto ataca la causa (no se puede cancelar el atras) absorbiendolo con una entrada propia, no tapando el sintoma."
  blind_spots:
    - "NO VERIFICADO end-to-end contra el router real de Next en /agenda: requeriria login en el Supabase local y editar horarios. La evidencia es el precedente de prod (overlay-history) + la mecanica medida en aislamiento."
    - "NO VERIFICADO en Safari/iOS ni en Chrome Android reales: lo medido es Chrome 153 desktop headless."
    - "NO VERIFICADO: el back por teclado (Alt+Left) — headless no enruta la tecla a historial."
    - "NO MEDIDO: el orden de los dos listeners de popstate (el de Next y el nuevo) bajo carga; se razono que es indiferente porque el traverse que absorbe el sentinel es same-route."
  candidate_causes:
    - "code: el guard solo intercepta el onNavigate del <Link>; el popstate no tiene ningun listener (unsaved-changes-guard.tsx, cero ocurrencias de popstate)."
    - "config/proceso: D-01 del workstream panel-nav prohibe explicitamente interceptar popstate (REQUIREMENTS.md:24-25, :108) apoyandose en la premisa caduca => el trabajo quedo fuera de alcance por politica, no por imposibilidad."
    - "environment: la plataforma no ofrece cancelacion del atras de usuario (medido) — es una restriccion real del navegador, no del repo."
  and_gate: "SI — hacen falta DOS condiciones simultaneas para el sintoma: (1) la restriccion de plataforma (el atras no se puede cancelar) Y (2) la decision de alcance de no usar el unico mecanismo que si funciona (el sentinel). Quitar solo (2) alcanza para arreglarlo; (1) no se puede quitar."

next_action: "Ninguna accion de codigo. Decision del dueno: reabrir D-01 para este caso (como ya se reabrio de hecho para overlay-history) o aceptar la alternativa sin historial (persistir el borrador). Informe entregado al caller."

## Symptoms

expected: "En /agenda con horarios editados sin guardar, apretar el atrás del celular debería avisar antes de perder los cambios (igual que hoy avisa al salir por un link del menú)."
actual: "El atrás del celular navega y pierde los cambios sin avisar. Confirmado por el dueño en celular real."
errors: "ninguno — pérdida silenciosa de datos"
reproduction: "/agenda → editar horarios sin guardar → botón atrás del celular → navega, cambios perdidos"
started: "desde que existe el guard — es un límite declarado a propósito en unsaved-changes-guard.tsx:21-25"

## Eliminated

## Evidence

- timestamp: 2026-10-05T00:10:00Z
  checked: "node_modules/next/package.json (version) + grep de APIs de bloqueo en node_modules/next/dist/client/"
  found: "Next 16.2.7 confirmado. `grep -rn 'useBlocker|blockNavigation|navigationBlock|onBeforeNavigate|interceptNavigation|navigation.addEventListener|window.navigation' node_modules/next/dist/client/ node_modules/next/dist/shared/` = CERO hits. La unica API de cancelacion es `onNavigate` del Link (link.d.ts:170, docs link.md:451-474), que solo cubre clicks en Link."
  implication: "La MITAD de la premisa es VERDADERA: no hay API de bloqueo para popstate en Next 16.2.7. Tampoco Next usa la Navigation API (tiene TODOs para eso: app-router.js:50, :253, :269)."

- timestamp: 2026-10-05T00:12:00Z
  checked: "node_modules/next/dist/client/components/app-router.js:252-279 (parche de pushState/replaceState) y :284-301 (onPopState)"
  found: "`pushState` parcheado: si el state NO trae `__NA`/`_N`, copia los internos de Next adentro (copyNextJsInternalHistoryState, :84-96) y despacha ACTION_RESTORE via applyUrlFromHistoryPushReplace (:258-262) => usePathname/useSearchParams quedan sincronizados. `onPopState` (:284-299) solo LEE `event.state`: si no trae `__NA` recarga la pagina entera (:290-292), si lo trae despacha dispatchTraverseAction (:296-298). Es un listener normal (:301), no captura, y popstate NO es cancelable."
  implication: "El pushState manual es el camino SOPORTADO y sincronizado, no un hack. Lo que no existe es cancelar el popstate."

- timestamp: 2026-10-05T00:15:00Z
  checked: "node_modules/next/dist/client/components/segment-cache/navigation.js:271, :382, :413 + app-router.js:46-67 (pushRef.preserveCustomHistoryState)"
  found: "`completeTraverseNavigation` (el camino del back/forward) setea `preserveCustomHistoryState: true` (navigation.js:412-413) => el replaceState de app-router.js:52 hace `{...window.history.state, __NA, tree}` y CONSERVA nuestras claves. En cambio `completeSoftNavigation` (Link/router.push/replace) setea `preserveCustomHistoryState: false` (navigation.js:382) => el state se reescribe SIN nuestras claves."
  implication: "EVIDENCIA DECISIVA CONTRA LA PREMISA: Next PRESERVA a proposito el custom history state en el back/forward (el comentario de navigation.js:412 lo dice literal: 'Ensures that the custom history state that was set is preserved when applying this update'). El patron sentinel NO desincroniza el router: Next lo contempla. PERO una navegacion blanda (Link/push/replace) BORRA la marca."

- timestamp: 2026-10-05T00:18:00Z
  checked: "lib/overlay-history.ts entero (377 lineas) + lib/panel-history.ts entero (519 lineas)"
  found: "overlay-history.ts hace EXACTAMENTE el truco que la premisa declara imposible: pushState con hash al abrir (:321-327), listener de popstate (:341-353), re-push si el cierre se veta (:349-350, tick), y back() de limpieza solo si la marca es nuestra (:333, :374). Marca = `{frjOverlay: number}` (:93-95). panel-history.ts usa marca `{frjView: string|null}` (:165-167) y escribe con pushState/replaceState parcheados (:474-475)."
  implication: "La CONCLUSION de la premisa es FALSA en el repo de hoy: el truco corre en produccion sobre 39 overlays del panel, verificado en celular real, y no desincronizo nada. La premisa quedo caduca el dia del quick 260928-seo."

- timestamp: 2026-10-05T00:22:00Z
  checked: "app/(dashboard)/agenda/agenda-client.tsx:290 y :381-410"
  found: "Agenda tiene UNA mutacion CRUDA de historial fuera de todo helper: `window.history.replaceState(null, '', '/agenda')` (:290) en el efecto de limpieza del `?google=` del OAuth. Pasa `null` como state => el parche de Next lo rellena con sus internos pero BORRA cualquier marca custom de la entrada actual. `hoursDirty` es estado POR GESTO, no diff contra baseline (:389-392); `saveHours` es el unico que la apaga (:380). beforeunload ya cubre recarga/cerrar pestana (:401-410)."
  implication: "COLISION CONCRETA #1: si la marca sentinel ya estuviera empujada y ese efecto corriera, la marca se pierde. Es un caso estrecho (solo con `?google=` en la URL y el efecto corre en mount, antes de que haya nada sucio), pero confirma que un `back()` sin re-verificar la marca puede caer sobre una entrada ajena."

- timestamp: 2026-10-05T00:25:00Z
  checked: "components/dashboard/sidebar.tsx:144-164 + lib/panel-history.ts:297-310 (panelNavMode) + :512-518 (consumeOwnedPanelEntry)"
  found: "El sidebar navega con `<Link replace={panelNavMode(...)==='replace'}>` (:152). Entre secciones (agenda->finances) => replace. `consumeOwnedPanelEntry()` (:163) solo hace back() si la marca es `frjView` y NO es `frjOverlay` (panel-history.ts:514-515): una marca nueva `frjDirty` le daria false => NO hace back(). El guard se evalua PRIMERO (:162) y si bloquea, previene y no pasa nada mas."
  implication: "COLISION CONCRETA #2: `consumeOwnedPanelEntry` es SEGURO frente a una marca nueva (no la reconoce => no la toca). Pero el `replace` del Link (navigation.js:382, preserveCustomHistoryState:false) BORRA la marca sentinel de la entrada de arriba. Cualquier back() posterior sin re-verificar la marca seria un back() sobre entrada AJENA = expulsar al usuario del sitio (cicatriz 2)."

- timestamp: 2026-10-05T00:28:00Z
  checked: "lib/panel-history.ts:90-99 (regla 0 de panelHistoryAction) + grep de applyPanelView en el repo"
  found: "La regla 0 solo se abstiene cuando `overlayOwnsTop` (`isOverlayOwnedEntry`, :212-219, chequea `frjOverlay` numerico). Una marca `frjDirty` NO la activa => `applyPanelView` escribiria ENCIMA. Hoy `applyPanelView` se llama SOLO desde app/(dashboard)/clients/clients-client.tsx (:589, :645, :871, :948) — Agenda NO lo llama."
  implication: "COLISION #3 es FUTURA, no actual: hoy Agenda no usa applyPanelView. Pero la Phase 2 de v0.30 y T-3 (REQUIREMENTS.md:95) planean cablear el `activeLoc` de Agenda con cause 'filter' => replace. Ese dia el replace caeria sobre la entrada sentinel y la borraria. La regla 0 tendria que aprender la marca nueva (o la marca nueva tendria que ser reconocida por un predicado compartido)."

- timestamp: 2026-10-05T00:31:00Z
  checked: ".planning/workstreams/panel-nav/ROADMAP.md y REQUIREMENTS.md:24-37, :95, :106-108"
  found: "D-01 'Historia honesta, NO reescrita': 'No se intercepta popstate ni se reescribe el historial' (REQUIREMENTS.md:24-25). La tabla de NO-objetivos dice literal: 'Interceptar el back para la guarda de cambios sin guardar | Limite ya declarado a proposito en unsaved-changes-guard.tsx. NAV-06 solo exige no empeorarlo.' (:108). El ROADMAP cita la premisa del guard como hecho establecido y la pone fuera de alcance de la Phase 1."
  implication: "El bloqueo de HOY no es tecnico: es una decision de alcance (D-01) tomada apoyandose en una premisa tecnica que este diagnostico demuestra caduca. Reabrirlo es una decision del dueno, no un hallazgo de ingenieria."

- timestamp: 2026-10-05T00:45:00Z
  checked: "MEDIDO en Chrome 153 headless (CDP, servidor estatico propio en :8731 — el dev server del dueno en :80 NO se toco). Scripts en el scratchpad de la sesion."
  found: "(A) `popstate` llega con `cancelable: false` y `preventDefault()` es NO-OP: el back ocurre igual. (B) Navigation API: un traverse PROGRAMATICO (`history.back()`) llega `cancelable: true, userInitiated: false` y `preventDefault()` SI lo bloquea. (C) Un traverse de NIVEL NAVEGADOR (Page.navigateToHistoryEntry = el boton atras real) llega `cancelable: FALSE, userInitiated: TRUE` y `preventDefault()` NO hace nada (defaultPrevented queda false), y el popstate si dispara."
  implication: "LA VARIANTE LIMPIA ESTA MUERTA: la Navigation API NO puede cancelar el atras del usuario (anti history-trapping del spec). El UNICO mecanismo viable es el de entrada sentinel que ya usa overlay-history.ts. Y confirma que la premisa tiene razon en 'no hay API de bloqueo' — pero se equivoca en la conclusion."

- timestamp: 2026-10-05T00:50:00Z
  checked: "MEDIDO: ciclo sentinel completo con un borrador sucio (5 escenarios)"
  found: "S1 (atras de usuario, sucio, decide QUEDARSE): sentinel absorbe el back, popstate con topIsOurs:false => avisa => re-push => el usuario NUNCA sale de la pagina; repetido dos veces seguidas sigue funcionando. S2 (decide SALIR): la continuacion por `history.back()` aterriza en la entrada REAL anterior, sin aviso espurio (la bandera ya esta en false). S3 (guardado => consumir): `back()` de limpieza, CERO avisos, el hash se limpia. S4 (una escritura AJENA pisa el state de la entrada de arriba): `isOurs()` pasa a false con `holding` todavia en true, y la guarda de re-verificacion DEVUELVE 'foreign-top-skipped' SIN hacer `back()`. S5 (Alt+Left por CDP): NO VERIFICADO — headless no enruta la tecla a historial."
  implication: "El patron funciona y la cicatriz 2 queda cubierta por la MISMA guarda que overlay-history.ts ya tiene (re-verificar la marca justo antes de cada `back()`), medida esta vez contra el caso que la dispara."

- timestamp: 2026-10-05T00:55:00Z
  checked: "MEDIDO: las cuatro formas de la continuacion de confirmLeave() con el sentinel empujado (Q4)"
  found: "Q4-A (lo de HOY: `router.push(href)` sin consumir el sentinel) => BASURA CONFIRMADA: desde el destino, el primer atras aterriza en `?p=agenda#sin-guardar` (la entrada sentinel muerta, con `frjDirty` todavia en el state) y hace falta un SEGUNDO atras para llegar a la agenda. Q4-B (encadenar `history.back()` + `pushState` en el mismo tick) => ROTO: el push se PIERDE, el usuario queda en la agenda y el destino nunca ocurre. Q4-C (consumir y empujar el destino DESDE el popstate del consumo) => LIMPIO. Q4-D (`replaceState` ENCIMA del sentinel, sin back y sin encadenar) => LIMPIO y el mas simple: el destino queda bien y un solo atras aterriza exacto en la agenda. Q4-E descartado: contaminado por acumulacion de historial del harness, NO VERIFICADO."
  implication: "Respuesta a Q4: SI, el `router.push` de hoy dejaria basura, y esta MEDIDO. La continuacion correcta es `replace` encima del sentinel (Q4-D) — no requiere pelear con la asincronia de `back()`, que es justo la trampa que `panel-history.ts:504-506` documenta y que Q4-B reproduce."

- timestamp: 2026-10-05T01:00:00Z
  checked: "npx vitest run --project pure (baseline antes de cualquier cambio) + test/overlay-history.test.ts"
  found: "67 archivos, 1180 passed, 3 expected fail (los canarios de reloj), 24s. `test/overlay-history.test.ts` tiene 27 casos. Verde."
  implication: "Baseline verde: cualquier regresion de un cambio futuro seria atribuible. El molde de test (environment node, decisiones puras) ya existe y el costo de cubrir el mecanismo nuevo es bajo."

- timestamp: 2026-10-05T01:05:00Z
  checked: "components/dashboard/unsaved-changes-guard.tsx:30-32 vs grep de useUnsavedChanges"
  found: "El docblock dice 'el guard solo se arma cuando una pagina llama useUnsavedChanges. Hoy lo hace SOLO Agenda'. FALSO hoy: `app/(dashboard)/web/web-client.tsx:216` tambien lo llama. REQUIREMENTS.md:95 (T-3) repite el mismo dato desactualizado ('Agenda es la UNICA pantalla que usa useUnsavedChanges')."
  implication: "Hallazgo colateral: el comentario y el requirement estan desactualizados. Importa para el COSTO — cualquier cambio al guard impacta DOS pantallas (/agenda y /web), no una, y /web tiene su propio beforeunload y su propio dialogo de descarte."

## Resolution

root_cause: |
  La premisa de `components/dashboard/unsaved-changes-guard.tsx:21-25` es MITAD VERDADERA Y MITAD CADUCA, y
  esa mezcla es la causa de que el atras siga sin cubrirse:
    (1) VERDADERA y MEDIDA: Next 16.2.7 no expone ninguna API de bloqueo para `popstate` (cero hits de
        useBlocker/blockNavigation/etc. en node_modules/next/dist/client/), `popstate` llega con
        `cancelable: false`, y la Navigation API tampoco sirve porque el atras del usuario llega con
        `cancelable: false, userInitiated: true`. No se puede CANCELAR el atras. Punto.
    (2) CADUCA: la conclusion de que el truco de empujar una entrada y revertirla "desincroniza el
        historial del router" es FALSA en el repo de hoy. Next PRESERVA a proposito el custom history
        state en el back/forward (`navigation.js:412-413`, `preserveCustomHistoryState: true`) y su
        `pushState` parcheado DESPACHA la sincronizacion del router (`app-router.js:258-262`). Y el repo
        corre exactamente ese truco en produccion sobre 39 overlays (`lib/overlay-history.ts`, verificado
        en celular real) sin desincronizar nada.
  O sea: no hace falta cancelar el atras — hace falta ABSORBERLO con una entrada sentinel, que es lo que
  el repo ya sabe hacer. El bloqueo que queda es de ALCANCE, no tecnico: D-01 del workstream panel-nav
  (`.planning/workstreams/panel-nav/REQUIREMENTS.md:24-25, :108`) prohibe interceptar popstate, y lo
  justifica citando esta misma premisa caduca.

fix: "NO APLICADO — la sesion fue solo diagnostico, por pedido explicito. Diseno propuesto y costo en el informe al caller."

verification: "N/A — no se aplico ningun cambio. Arbol limpio: `git status --porcelain` solo muestra este doc de sesion y los archivos ya sucios de antes."

files_changed: []
