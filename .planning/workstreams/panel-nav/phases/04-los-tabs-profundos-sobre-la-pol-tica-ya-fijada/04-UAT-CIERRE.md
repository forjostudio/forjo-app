---
status: complete
phase: 04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada
source: [04-01-SUMMARY.md, 04-02-SUMMARY.md, 04-03-SUMMARY.md, 04-04-SUMMARY.md, 04-05-SUMMARY.md, 04-UAT.md, 04-VERIFICATION.md, 04-REVIEW.md]
started: 2026-11-17T15:55:00Z
updated: 2026-11-17T23:59:00Z
---

## Current Test

[testing complete]

## Nota de forma

La UAT de la fase **ya se corrió**: el dueño ejecutó `04-UAT-GUION.md` en su teléfono, en escritorio y en un
iPhone, **en producción** sobre el commit `974a131` (2026-11-17), y la anotó en `04-UAT.md` (30 filas: 28 ✅,
2 ⚠, 0 ❌; aprobada: «si, doy por aprobado»). Este archivo la traduce al formato del template —un ítem por
criterio de éxito del ROADMAP con la evidencia del dueño citada por recorrido— y registra los gaps que el
dueño decidió cerrar dentro de la fase (**opción B, 2026-11-17**, frente a la verificación `human_needed` y al
code review `04-REVIEW.md`). `04-UAT.md` es la hoja del dueño y no se toca.

## Tests

### 1. Los tabs son destinos y se componen con los dos niveles (criterio 1 + PRECISADO D-01)
expected: en `/negocio` y `/settings` cada tab no-default vive en `?tab=`; el atrás desde un tab vuelve al tab por defecto y el siguiente sale según cómo se entró (Phase 3); con un tab abierto, tocar la barra termina igual que sin el tab (B1)
result: pass
source: 04-UAT.md 1.1, 1.2, 1.4, 2.2, 2.3, 3.1, 3.3, 3.4, 7.1, 7.2, 7.3, 7.4, 8.1, 8.3, 8.4 (todos ✅)

### 2. T-1 respetado: `/servicios`, `/equipo` y `/consultorios` no se mueven (criterio 2)
expected: las tres rutas sin `?tab=`, sin tabs nuevos, con su contenido y su atrás de siempre, verificadas a mano ruta por ruta
result: pass
source: 04-UAT.md 5.1, 5.2, 5.3 (✅ los tres)

### 3. T-2 reconciliado: el OAuth no pierde su tab (criterio 3)
expected: volver del OAuth real de MercadoPago y de Google aterriza en Integraciones con `/negocio?tab=integraciones` limpia y un toast; desde Agenda vuelve a `/agenda` limpia
result: pass
source: 04-UAT.md 4.2, 4.3, 4.4 (✅); 4.1 y 8.5 ⚠ no corribles (MercadoPago acepta directo con el reconocimiento facial: no hay rama de cancelar)

### 4. Finanzas, con su botón de alta coherente (criterio 4)
expected: en `/finances` Turnos·Ventas·Egresos viven en la URL y el botón de alta sigue al tab visible en todos los caminos de entrada (Más, la tarjeta de Inicio, el sidebar, URL recargada), en Android, escritorio e iPhone
result: pass
source: 04-UAT.md 1.3, 2.1, 2.3, 3.2, 6.1, 8.2 (✅). Ver el test 6 (obs-1) para el salto de scroll observado en el mismo camino.

### 5. Cero dialecto nuevo y cero regresión (criterio 5)
expected: los tres grupos de tabs escriben historial sólo por el helper; cero regresión sobre lo verificado (overlays, aviso de cambios sin guardar de Agenda, aviso de salida de Inicio)
result: pass
source: 04-UAT.md 6.1, 6.2, 6.3 (✅); 04-VERIFICATION.md (barrido crudo en cero; diff vacío sobre lo bloqueado); `## (g)` de `.planning/debug/tabs-en-la-url-medida.md` (sonda 46/47, la única FALLA es el costo declarado `R-G3-10`)

### 6. El primer toque de un tab de Finanzas no mueve la página (obs-1)
expected: tocar Ventas o Egresos por primera vez después de entrar a Finanzas cambia el tab sin mover el scroll de la página, igual que los toques siguientes y que los tabs de Negocio y Configuración
result: issue
reported: "Al entrar la primera vez por nueva pestaña, cuando voy a finanzas>ventas, el primer tacto hace un scroll hacia el inicio de la página, después no pasa mas" · «Acá está el mismo scroll hacia el inicio de la página la primer vez que tocas Ventas» (escritorio) · «Lo del scroll es solo en Finanzas>Ventas» · «tambien tocando Egresos está ese scroll, es algo de Finanzas»
severity: minor
source: 04-UAT.md obs-1 (Android Chrome 157 y escritorio Chrome; no reportado en Safari 18.7.8 en el 8.2)

### 7. Un doble toque rápido en un tab no duplica entradas del historial (code review WR-02)
expected: tocar dos veces seguidas el mismo tab, o dos tabs en rápida sucesión, deja la pila igual que un toque deliberado (sin Ventas encima de Ventas ni dos `back()` desde el default)
result: issue
reported: "Code review 04-REVIEW.md WR-02 (confirmado por lectura en 04-VERIFICATION.md): los dos `alElegirTab` (finances-client.tsx:275-281, settings-client.tsx:1029-1036) deciden con el tab del último render, no con la URL real del momento del toque. El dueño decidió cerrarlo en la fase (opción B, 2026-11-17)."
severity: minor

### 8. Volver del OAuth con `?mp=` vacío o con `?tab=integraciones&mp=…` no traba los tabs de Negocio (code review WR-03)
expected: con cualquier forma de la URL de vuelta del OAuth, los cuatro tabs de Negocio siguen respondiendo y el próximo toque limpia `mp`/`google`
result: issue
reported: "Code review 04-REVIEW.md WR-03 (confirmado por lectura en 04-VERIFICATION.md): el render (settings-client.tsx:1013, `!== null`) y el efecto del OAuth (L1113, por valor vacío) no comparten el criterio; el comentario de L1106-1107 describe mal lo que pasa. El dueño decidió cerrarlo en la fase (opción B, 2026-11-17)."
severity: major

### 9. B1 después de una recarga con un tab abierto (code review WR-04, a medir)
expected: recargar con un tab abierto y después tocar Inicio en la barra termina igual que sin recargar (Inicio con `#salir`, el atrás avisa)
result: issue
reported: "Code review 04-REVIEW.md WR-04 — SIN MEDIR: la marca `frjView` sobrevive a la recarga y el `back()` del `consume-view-then-navigate` cae en un documento distinto, sin `popstate`, y se perdería el segundo paso (Inicio → termina en Negocio/Datos). El dueño decidió cerrarlo en la fase (opción B, 2026-11-17): medir primero; si no reproduce, declararlo descartado con el número."
severity: major

## Summary

total: 9
passed: 5
issues: 4
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-04-6
  truth: "El primer toque de un tab de Finanzas (Ventas o Egresos) cambia el tab sin mover el scroll de la página"
  status: resolved
  closed_by: "04-06 (re-UAT 04-UAT-GAPS.md 8/8 en producción c3da6d0, 2026-11-18)"
  reason: "User reported: el primer toque de Ventas/Egresos scrollea al inicio de la página (Android y escritorio); después no pasa más; sólo Finanzas"
  severity: minor
  test: 6
  root_cause: "MEDIDO (CDP bajo con-turno, Chrome 157): el `<Suspense fallback={null}>` de app/(dashboard)/finances/page.tsx:26 commitea la página SIN nodo del DOM mientras el chunk de FinancesClient no está cargado en el documento (contenedor con 0 hijos durante 310-1724 ms). InnerScrollAndFocusHandlerOld de Next 16.2.7 no encuentra nodo y deja pendiente el scrollRef de la navegación; el primer update del router —el ACTION_RESTORE que dispara el pushState del primer toque de tab— lo consume con scrollTop=0 + scrollIntoView. Hace falta: entrada por navegación blanda + chunk no cargado + tope de la página fuera de pantalla. Reproducido en Más, tarjeta «Ingresos del mes» (390x844: scrollY 1404→147) y sidebar de escritorio (1280x800: 830→115); segundo toque 0 escrituras; carga dura 0 escrituras. Causalidad: con fallback = div con clase del contenedor, 0 escrituras en los tres caminos (control positivo: Negocio sin tocar sigue escribiendo). El mismo pendiente latente existe en negocio/page.tsx:31 y settings/page.tsx:44 (medido en Negocio con el tope 40 px fuera de pantalla); clients/page.tsx tiene el mismo patrón desde v0.30 (sin medir). H-B (el documento se acorta) descartada: alto constante. El 147/115 en vez de 0 es por `html { scroll-behavior: smooth }` (globals.css:346) sin `data-scroll-behavior`. IN-02 confirmado emulado: router.refresh() en /negocio?tab=integraciones tras pushState escribe scrollTop=0 por OTRO mecanismo (scrollRef nuevo por key __PAGE__ distinta) que el fallback no cubre."
  artifacts:
    - path: "app/(dashboard)/finances/page.tsx"
      issue: "fallback={null} en L26 — causa raíz"
    - path: "app/(dashboard)/negocio/page.tsx"
      issue: "mismo Suspense con fallback null (L31): pendiente latente medido"
    - path: "app/(dashboard)/settings/page.tsx"
      issue: "mismo Suspense con fallback null (L44)"
    - path: "test/panel-tabs.test.ts"
      issue: "el gate de L400 y el caso (e) (~L530) exigen literalmente `<Suspense fallback={null}>`"
    - path: "app/(dashboard)/settings/settings-client.tsx"
      issue: "router.refresh() — IN-02, mecanismo distinto"
  missing:
    - "Que el boundary tenga un nodo del DOM mientras suspende (fallback div con la clase del contenedor) en finances, negocio y settings; ajustar el gate de panel-tabs.test.ts:400 y el caso (e)"
    - "Regresión en la sonda: primer toque de Ventas/Egresos tras entrada blanda con 0 escrituras de scroll"
    - "IN-02: decisión aparte (aceptar o preservar scrollY alrededor del refresh)"
  debug_session: ".planning/debug/finanzas-primer-toque-scroll.md"
- gap_id: G-04-7
  truth: "Un doble toque rápido en un tab no duplica entradas del historial"
  status: resolved
  closed_by: "04-07 (re-UAT 04-UAT-GAPS.md 8/8 en producción c3da6d0, 2026-11-18)"
  reason: "Code review WR-02: el `from` de panelTabCause sale del render, no de window.location al momento del toque"
  severity: minor
  test: 7
  root_cause: "CONFIRMADO por lectura + sonda pura con el applyPanelView real (.planning/debug/probes/g04-7-8-puro.mjs). Los dos alElegirTab pasan `from: tabResuelto.slug` de useSearchParams() del último commit (finances-client.tsx:280, settings-client.tsx:1035); el parche de pushState de Next despacha ACTION_RESTORE en startTransition, así que location/history.state cambian ya y useSearchParams recién al commit. Base UI no frena el segundo toque (active/value del último commit; Tabs controlado, sin estado local). Resultados: E1 Turnos→Ventas ×2 = push,push (Ventas sobre Ventas); E2 Turnos→Ventas→Egresos = push,push (atrás desde Egresos cae en Ventas, viola D-01); E4 = consume + replace que le borra frjUnder a /finances. SEGUNDO DEFECTO que el fix del review no cubre: history.back() es asíncrono, `holding` sigue true hasta el recorrido ⇒ E3 Ventas→Turnos ×2 = dos back, termina en /dashboard, aun leyendo window.location. La suite no lo vio: `tocar` (test/panel-tabs.test.ts:177-183) lee window.location (prueba la versión arreglada) y su back() es síncrono."
  artifacts:
    - path: "app/(dashboard)/finances/finances-client.tsx"
      issue: "alElegirTab decide con tabResuelto.slug del render (L280)"
    - path: "app/(dashboard)/settings/settings-client.tsx"
      issue: "alElegirTab decide con tabResuelto.slug del render (L1035)"
    - path: "lib/panel-history.ts"
      issue: "sin guarda de consumo en vuelo entre back() y popstate"
    - path: "test/panel-tabs.test.ts"
      issue: "el simulador `tocar` no reproduce el handler real y su back() es síncrono"
  missing:
    - "Helper puro compartido por las dos pantallas y por `tocar` que tome el `from` de window.location"
    - "Guarda de «consumo en vuelo» en lib/panel-history.ts que se limpie en el próximo popstate (misma forma en consumeOwnedPanelEntry y el «Volver» de clientes)"
    - "RED primero: gate (f) `cuerpoDe(fuente,'function alElegirTab(','): void {')` sin `tabResuelto.slug`; montarHistoria({ backAsincrono: true }) con dos tocar(TABS_FINANZAS,'appointments') desde [/dashboard, /finances{frjUnder}, /finances?tab=ventas{frjView:'tab'}] ⇒ 'consume','none', retrocesos 1, URL /finances"
  debug_session: ".planning/debug/doble-toque-tab.md"
- gap_id: G-04-8
  truth: "Volver del OAuth con `?mp=` vacío o con `?tab=integraciones&mp=…` no traba los tabs de Negocio"
  status: resolved
  closed_by: "04-07 (re-UAT 04-UAT-GAPS.md 8/8 en producción c3da6d0, 2026-11-18)"
  reason: "Code review WR-03: criterio distinto entre el render (L1013) y el efecto del OAuth (L1113) de settings-client.tsx"
  severity: major
  test: 8
  root_cause: "CONFIRMADO por lectura + sonda pura. El render fuerza Integraciones y apaga la reconciliación mientras mp/google estén PRESENTES (settings-client.tsx L1013 `!== null`, L1042, L1065); el único que los borra es el efecto del OAuth (deps [isNegocio], una vez por montaje), que no escribe en dos casos: (a) valor vacío — guarda por verdad `if (!mp && !google) return` (L1113); (b) `?tab=integraciones&mp=…` — la regla 2 de panelHistoryAction (from === to ⇒ 'none', lib/panel-history.ts:112 y :976) compara sólo el tab e ignora el drop. alElegirTab nunca pasa drop (L1035) ⇒ ningún toque limpia. Casos trabados: ?mp=, ?google=, ?tab=integraciones&mp=connected, ?tab=integraciones&google=connected, ?tab=integraciones&mp= (siempre se ve Integraciones; sólo sale remontando o recargando). Controles verdes: ?mp=connected, ?tab=cobros&mp=connected. El comentario L1104-1107 es falso y en (b) el toast sale dos veces en dev. Ningún callback emite esas URLs (sólo pegadas/editadas). Agenda (IN-03) tiene la misma guarda pero ningún render lee google ⇒ no traba."
  artifacts:
    - path: "app/(dashboard)/settings/settings-client.tsx"
      issue: "criterio por presencia en el render (L1013/1042/1065) vs por verdad en el efecto (L1113); comentario L1104-1107 incorrecto; alElegirTab sin drop"
    - path: "lib/panel-history.ts"
      issue: "regla 2 (from === to ⇒ 'none') se come la limpieza con drop (L112, L976)"
    - path: "lib/panel-tabs.ts"
      issue: "lugar del predicado único por presencia, junto a TABS_NEGOCIO"
  missing:
    - "Predicado único por presencia (`mp` o `google` en la query) exportado de lib/panel-tabs.ts y usado por render, corte de reconciliación y guarda del efecto"
    - "Limpieza que escriba cuando cambia la URL aunque from === to (helper de limpieza en lib/panel-history.ts, el de IN-03, o `from: null` cuando desde === 'integraciones')"
    - "Corregir el comentario L1104-1107"
    - "RED primero: pila con applyPanelView real + volverDelOAuth() con el predicado exportado para las 5 URLs trabadas ⇒ sin mp/google, /negocio?tab=integraciones, 2 entradas, 0 retrocesos, y tocar(TABS_NEGOCIO,'business') = 'replace' a /negocio; gate (g) sin `get('mp') !== null` ni `if (!mp && !google) return`, predicado ×2, sin «la query queda hasta el próximo toque»"
  debug_session: ".planning/debug/oauth-traba-tabs-negocio.md"
- gap_id: G-04-9
  truth: "B1 sigue andando después de recargar con un tab abierto"
  status: resolved
  reason: "Code review WR-04 — MEDIDO: NO REPRODUCE"
  severity: major
  test: 9
  root_cause: "NO REPRODUCE (CDP bajo con-turno, Chrome 157, 390x844, atrás = chrome.tabs.goBack). Más → Negocio → Cobros → recarga → toque en la barra: la marca {frjView:'tab'} sí sobrevive a la recarga, pero el back() de B1 cae en el MISMO documento nuevo (popstate, 0 documentos nuevos) y el segundo paso (decidirDesdeElAterrizaje) encadena. Control vs variante idénticos en Inicio (/dashboard#salir, aviso armado; 3 popstates; pila [/dashboard]), Turnos ([/dashboard, /appointments]) y Más ([/dashboard, /mas]). La premisa de WR-04 (la recarga sólo da documento nuevo a la entrada recargada) es falsa en Chrome 157: la recarga reemplaza el documento de todas las entradas que el documento viejo había empujado. Sin medir: Safari iOS real, Android real (comparte Chromium), pestaña descartada/restaurada por el sistema; sólo dev."
  artifacts: []
  missing: []
  debug_session: ".planning/debug/b1-tras-recarga.md"

## Deferred Follow-Ups

- test: 3
  idea: "obs-2: «al desconectar la cuenta y volver a conectarla, conecta direcamente, no pasa por mercadopago» — probablemente comportamiento de MercadoPago (saltea el consentimiento si la cuenta ya autorizó la app); a confirmar fuera de esta fase"
  deferred_at: 2026-11-17
- test: 3
  idea: "obs-3: «tampoco me cierra que no me lleve a la app movil, lo hace por una web» — el OAuth de MP abre la web de MP, no la app; fuera del alcance de la navegación del panel"
  deferred_at: 2026-11-17
- test: 5
  idea: "04-REVIEW.md IN-01 (condición de «subsección nuestra arriba» duplicada en unsaved-changes-guard.tsx:219 y panel-branch.ts:1528), IN-02 (router.refresh() en ?tab=integraciones podría re-aplicar el scroll, mismo mecanismo que WR-01 — conviene mirarlo junto con G-04-6), IN-03 (Agenda limpia ?google= con param 'google' y causa stale)"
  deferred_at: 2026-11-17
