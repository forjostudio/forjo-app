---
phase: 04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada
plan: "01"
subsystem: ui
tags: [next16, useSearchParams, history, tabs, base-ui, vitest, cdp]

requires:
  - phase: 03-la-pol-tica-de-atr-s-de-un-nivel-a-dos
    provides: la política de dos niveles (frjUnder, sentinel de salida, panelNavMode) y el ejecutor applyPanelView de v0.30
provides:
  - lib/panel-tabs.ts — TAB_PARAM, PanelTabGroup, TABS_NEGOCIO/CONFIG/FINANZAS (Map), resolveTab, tabSlug
  - la causa 'user-switch' (replace) y panelTabCause({ from, to }) en lib/panel-history.ts
  - applyPanelView ya no fabrica la marca frjView en un replace sobre una entrada ajena (Patrón 3)
  - drop?: readonly string[] en panelViewUrl y applyPanelView (lo consume el 04-02 para el retorno del OAuth)
  - Finanzas con el tab en la URL (?tab=ventas|egresos; Turnos = URL limpia) y su página con Suspense
  - los recorridos R-T-finanzas-* en la sonda de la app y el registro .planning/debug/tabs-en-la-url-medida.md
affects: [04-02 settings-client (Negocio/Configuración), 04-03.., /clients (cambio declarado), la sonda de la app]

actuals:
  tokens: 25400
  tasks: 2
  commits: 13
plan_head_before: e68e38177149ca57d0660a6e4bb6066c0b5d6775

tech-stack:
  added: []
  patterns:
    - "Grupo de tabs de UN nivel con default null (URL limpia): resolveTab → resolveViewParam → saneo stale; el toque declara la causa con panelTabCause"
    - "Una marca de propiedad sólo la crea un push; un replace conserva holding y nunca la fabrica"
    - "En la sonda: el punto del toque se convierte al viewport VISUAL antes de Input.dispatchMouseEvent"

key-files:
  created:
    - lib/panel-tabs.ts
    - test/panel-tabs.test.ts
    - .planning/debug/tabs-en-la-url-medida.md
    - .planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/deferred-items.md
  modified:
    - lib/panel-history.ts
    - lib/panel-history.test.ts
    - test/panel-history-clients.test.ts
    - app/(dashboard)/finances/finances-client.tsx
    - app/(dashboard)/finances/page.tsx
    - .planning/debug/probes/panel-exit-en-la-app.mjs

key-decisions:
  - "?tab=turnos explícito se sanea a la URL limpia (D-06 a discreción): resolveTab da slug null para el default y resolveViewParam pide stale"
  - "Patrón 3 aplicado: holding izado en applyPanelView; la marca es panelViewState(param, action === 'push' || holding ? to : null)"
  - "Cambio declarado en /clients: la fusión programmatic sobre una ?c= pegada ya no marca la entrada; el Volver reemplaza en vez de retroceder fuera del sitio"

patterns-established:
  - "Pantalla con tabs en la URL: useSearchParams → resolveTab → value del <Tabs>; handler `function alElegirTab(value: unknown, detalles: { reason: string }): void` que descarta reason !== 'none' y sólo llama applyPanelView; efecto de reconciliación con sanitizeAction + reconciledMemo + ref"
  - "Simulador de pila en vitest node: historia falsa con vi.stubGlobal('window') que corre el applyPanelView REAL"

requirements-completed: [MOB-09, MOB-08]

coverage:
  - id: D1
    description: "Finanzas deriva el tab de la URL; el botón de alta sigue al tab resuelto; el atrás vuelve a Turnos y después sale según cómo se entró (Más o Inicio); una URL inválida se sanea a /finances"
    requirement: MOB-09
    verification:
      - kind: e2e
        ref: "node scripts/con-turno.mjs node .planning/debug/probes/panel-exit-en-la-app.mjs dev interfaz R-T-finanzas-por-mas,R-T-finanzas-desde-inicio,R-T-finanzas-invalido"
        status: pass
      - kind: unit
        ref: "test/panel-tabs.test.ts#Finanzas — el tab sale de la URL, en un solo dialecto"
        status: pass
    human_judgment: true
    rationale: "Chrome de escritorio headless con emulación mobile; el teléfono real del dueño (Android/iOS) y el gesto físico de atrás se verifican en /gsd-verify-work 4 --ws panel-nav"
  - id: D2
    description: "La política de un nivel de tabs en el helper: 'user-switch' (replace) decidida en el switch exhaustivo y panelTabCause; D-01/D-02/D-04/D-07 como pilas en el simulador"
    requirement: MOB-08
    verification:
      - kind: unit
        ref: "test/panel-tabs.test.ts#el simulador de pila — el applyPanelView REAL contra una historia falsa"
        status: pass
      - kind: unit
        ref: "lib/panel-history.test.ts#panelHistoryAction — regla 0 / regla 2 (siete causas)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Un replace no fabrica la marca sobre una entrada ajena (Patrón 3): la URL pegada → Egresos → Turnos queda en /finances dentro del sitio"
    requirement: MOB-08
    verification:
      - kind: e2e
        ref: "node scripts/con-turno.mjs node .planning/debug/probes/panel-exit-en-la-app.mjs dev interfaz R-T-finanzas-url-pegada"
        status: pass
      - kind: unit
        ref: "lib/panel-history.test.ts#applyPanelView — UN REEMPLAZO NO CAMBIA QUIÉN EMPUJÓ LA ENTRADA"
        status: pass
    human_judgment: true
    rationale: "El cambio declarado de /clients (la fusión sobre una ?c= pegada) no tiene recorrido en la app: está fijado por un test unitario y lo tiene que ver el dueño"
  - id: D4
    description: "drop en panelViewUrl/applyPanelView (para el retorno del OAuth del 04-02)"
    verification:
      - kind: unit
        ref: "lib/panel-history.test.ts#panelViewUrl con `drop`"
        status: pass
    human_judgment: false

duration: 59min
completed: 2026-11-17
status: complete
---

# Phase 4 Plan 01: Finanzas en la URL y el ejecutor que no fabrica marcas Summary

**Los tabs de Finanzas viven en `?tab=` (Turnos = URL limpia) sobre una causa nueva `user-switch` + `panelTabCause`, la lista cerrada en `lib/panel-tabs.ts` con `Map`, y `applyPanelView` corregido para que un reemplazo nunca marque como propia una entrada ajena — los cuatro `R-T-finanzas-*` medidos FALLA → OK en la app real.**

## Performance

- **Duration:** 59 min
- **Started:** 2026-11-17T10:28:48Z
- **Completed:** 2026-11-17T11:27:23Z
- **Tasks:** 2 (task 1 tracer, task 2 TDD)
- **Files modified:** 10 (4 creados, 6 modificados) + `deferred-items.md`

## Accomplishments

- **D-04 / MOB-09:** `finances-client.tsx` deriva el tab de `useSearchParams` (`resolveTab(TABS_FINANZAS)`), sin `useState` ni setter; el handler `alElegirTab` filtra `reason !== 'none'` y sólo escribe por `applyPanelView`; la reconciliación copia el molde de `/clients`. Las dos líneas del botón de alta quedaron byte-idénticas (`txTab` conserva nombre y tipo). `finances/page.tsx` envuelta en `<Suspense fallback={null}>`, sin `searchParams`, negocio por `owner_id`.
- **D-01/D-02/D-05/D-06/D-07:** `lib/panel-tabs.ts` (puro, sin directiva de cliente) con los tres grupos de D-05 en `Map`; `'user-switch'` decidida en el `switch` exhaustivo; `panelTabCause` elige la causa. Las claves de prototipo (`constructor`, `__proto__`, `toString`, `hasOwnProperty`) caen al default con `value` string.
- **Patrón 3 (T-04-02):** `applyPanelView` iza `holding` y escribe la marca sólo con `push` o `holding`. Medido en la app: con el código de antes, `/finances?tab=ventas` pegada → Egresos → Turnos hacía un `back` y salía a la página de afuera; con el arreglo queda en `/finances` dentro del sitio.
- **`drop`:** `panelViewUrl`/`applyPanelView` aceptan `drop?: readonly string[]` (default vacío ⇒ `/clients` sin cambio); listo para el retorno del OAuth del 04-02.

## Task Commits

1. **Task 1: Finanzas de punta a punta (tracer)**
   - `efb9ae4` test(04-01): la sonda mide los tabs de Finanzas en la URL (R-T-finanzas-*)
   - `2cf1d89` test(04-01): tocarTab espera la posicion quieta del tab antes de tocar (P-1)
   - `f481059` feat(04-01): Finanzas deriva el tab de la URL (?tab=) sobre la politica de un nivel
   - `10587ff` docs(04-01): registro de mediciones de la fase 4, (a) Finanzas en la URL
2. **Task 2: el ejecutor — un replace no fabrica la marca, y `drop` (TDD)**
   - `cf41e78` test(04-01): casos rojos del Patron 3 (un replace no fabrica la marca) y de drop  ← RED
   - `247fc8f`, `113d8c6`, `13bad17`, `721acdd`, `b75dc81`, `7c01b0a` test(04-01): vueltas del instrumento (P-1, sólo la sonda)
   - `f3896d0` fix(04-01): un replace no fabrica la marca sobre una entrada ajena (Patron 3) y drop  ← GREEN
   - `f24ad6f` docs(04-01): (b) un reemplazo no fabrica la marca, medido en la suite y en la app

## Las mediciones (detalle completo en `.planning/debug/tabs-en-la-url-medida.md`)

**Entorno.** Supabase local de forjo-app ya arriba (no hizo falta `supabase start`; `api local=200`, `negocio-prueba` presente, CLI `2.107.0`). Contenedores antes y después: los de `forjo-app` y `erp-forjo-studio`, sin cambios (no se paró ni reseteó nada). No había `next dev` del dueño vivo (sin `.next/dev/lock`): cada corrida de la sonda levantó el suyo en el 3031 y lo mató al salir con el puerto verificado libre. `Chrome/157.0.8103.52`, node `v24.15.0`, gesto `interfaz`, modo estricto ACTIVO, `next.config.ts` con huella `8ceb99ae…0aa1ae03578`.

**Suites.**

| Momento | Ocho suites de historial | Pura entera |
|---|---|---|
| Base `85c99ae` (7 suites, 07:35 AR) | 7 / 550 | — |
| Verdes antes del task 2 (`f481059`, 07:38 AR) | 8 / 589 | — |
| RED del task 2 (`cf41e78`) | 596 verdes + 9 rojos | — |
| Verdes después (`f3896d0`, 08:22 AR) | 8 / 605 | 77 / 1779 + 3 expected-fail |

**Los 9 rojos del task 2 (todos de aserción, todos «RED hoy»):** los tres de `panelViewUrl con drop`; en `applyPanelView — UN REEMPLAZO NO CAMBIA QUIÉN EMPUJÓ LA ENTRADA`: «un reemplazo SIN holding NO fabrica la marca», «CAMBIO DECLARADO en /clients…» y «applyPanelView pasa drop»; y en el simulador: D-03 (URL pegada), D-09 (OAuth con drop) y D-08 (`consumeOwnedPanelEntry` sobre entrada ajena).

**Mutaciones:** M-1 `panelViewState(param, action === 'push' || holding ? to : null)` → `panelViewState(param, to)`: 6 rojos; M-2 `return 'user-switch'` → `return 'user-open'`: 7 rojos; M-3 `for (const quitar of drop) sp.delete(quitar)` → `… void quitar`: 5 rojos. Las tres restauradas con el árbol limpio.

**App:** RED de `R-T-finanzas-por-mas`, `-desde-inicio`, `-invalido` con la app sin tocar (3 FALLA, rc 1) → GREEN con `f481059` (3 OK, rc 0). RED de `R-T-finanzas-url-pegada` con el código previo al arreglo (FALLA: `marca_tras_egresos={"frjView":"tab"}`, `ubicacion_tras_turnos=(afuera)`, rc 1) → GREEN con `f3896d0` (los cuatro OK, rc 0).

**Gates corridos (rc):** gate 1 del task 1 (entorno) 0 · gate 2 del task 1 (suites/tsc/eslint/candados) 0 · gate 3 del task 1 (app, 3 OK) 0 · gate 4 del task 1 (registro) 0 · gate 2 del task 2 (suites, pura, mutaciones, candados) 0 · gate 3 del task 2 (app, 4 OK) 0 · gate 4 del task 2 (registro) 0. `tsc --noEmit` limpio; eslint de Finanzas = sólo el preexistente `{"react-hooks/set-state-in-effect":1}`.

## Decisions Made

- `?tab=turnos` explícito se sanea a la URL limpia (discreción de D-06): sale gratis de `resolveTab` + `resolveViewParam`.
- El efecto de reconciliación de Finanzas NO tiene corte por overlay (a diferencia de `/clients`): con un diálogo abierto la URL no cambia, y si cambiara la regla 0 difiere y la memoria se conserva. Queda escrito en el comentario.
- El cambio de comportamiento en `/clients` (fusión sobre `?c=` pegada) se aceptó y se declaró con fecha en el docblock de `applyPanelView`, en `## (b)` y en un test.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking / P-1] El instrumento no tocaba el tab (dos defectos de la sonda)**
- **Found during:** Task 1 (primer RED) y Task 2 (primer RED de `R-T-finanzas-url-pegada`)
- **Issue:** (a) el click se calculaba antes del corrimiento que producen las tarjetas al terminar de cargar: con el código viejo el tab medido seguía en Turnos; (b) sobre la URL pegada los clicks caían en un `div` ajeno: el viewport VISUAL estaba desplazado respecto del de layout (medido: escala 1, desplazamiento `(0,37)`/`(0,55)`) y `Input.dispatchMouseEvent` usa el visual.
- **Fix:** `tocarTab` espera la posición quieta (sin re-centrar en cada lectura), afirma el punto con `elementFromPoint`, convierte al viewport visual y reintenta hasta tres veces; el recorrido nuevo graba los toques, las escrituras, la consola y el objetivo de cada click. **Ningún `esperado` cambió** (gate 4 lo verifica).
- **Files modified:** `.planning/debug/probes/panel-exit-en-la-app.mjs`
- **Commits:** `2cf1d89`, `247fc8f`, `113d8c6`, `13bad17`, `721acdd`, `b75dc81`, `7c01b0a`

**2. [Rule 1 - Bug del gate] La mutación M-1 del gate pasa un literal con `||` por `argv`**
- **Found during:** Task 2 (paso 3)
- **Issue:** el `node` de Volta pasa por `cmd` y el `||` del literal se interpreta como operador del shell (*"holding" no se reconoce como un comando interno o externo*): el «mutacion roja» de M-1 del gate podía venir de un archivo roto.
- **Fix:** M-1 re-medida con un script que lee los literales de su propio archivo: 6 rojos, los seis `AssertionError`. El gate del plan no se editó (es del plan); queda anotado para el 04-02.
- **Verification:** `## (b)` del registro.

**3. [Rule 3] `test/panel-tabs.test.ts` normaliza CRLF al leer fuentes**
- **Issue:** con `core.autocrlf` la copia de trabajo de `finances-client.tsx` es CRLF y el recorte de la región del handler buscaba `\n  }\n`.
- **Fix:** `read()` reemplaza `\r\n` por `\n`. Commit `f481059`.

### Incidente de proceso (no es una desviación del plan; se reporta entero)

**Una corrida de pantalla FUERA DEL TURNO, accidental, y cortada.** A las 07:42 AR un `node -e` mío para escribir el registro llevaba backticks dentro de comillas dobles; bash los ejecutó como sustitución de comandos y uno de ellos fue la ruta de la sonda (`.planning/debug/probes/panel-exit-en-la-app.mjs`, que tiene shebang): **corrió la sonda completa, sin argumentos (todos los recorridos), sin pasar por `con-turno.mjs`**, de 07:42 a 07:47, mientras una suite de Playwright de `erp-forjo-studio` tenía el turno desde 07:44. Al detectarlo maté su shell padre (PID 3598, mío) y la sonda murió con `EPIPE` en un `console.log`. Verificado después: nada escuchando en 3031 ni 9335, sin `.next/dev/lock`, ningún Chrome ni `next dev` de la sonda huérfano. **No se corrió `liberar`**: el turno era del ERP, no mío. El archivo del registro no se escribió con ese comando (se escribió después con la herramienta de archivos). Pudo haberle quitado CPU a la corrida del ERP de esos minutos. A partir de ahí no volví a usar `node -e` con texto libre.

---

**Total deviations:** 3 auto-fixed (2 del instrumento/gate, 1 de lectura de fuentes) + 1 incidente de proceso reportado.
**Impact on plan:** ninguno sobre el código de producción ni sobre los `esperado`. Las vueltas del instrumento alargaron el task 2 (cinco corridas de pantalla extra, más ~14 min de espera del turno).

## Issues Encountered

- El turno esperó dos veces a `erp-forjo-studio` (~26 s con dueño muerto, que la herramienta destrabó sola; ~14 min con una suite completa viva). Esperas, no rojos.

## Known Stubs

Ninguno.

## Deuda preexistente (no tocada)

- `finances-client.tsx`: `react-hooks/set-state-in-effect` en el `useEffect(() => { fetchData() }, [fetchData])` (L383 en `85c99ae`). Anotado en `deferred-items.md`.
- **Hallazgo nuevo fuera de alcance:** Finanzas desborda 17-25 px en horizontal a 390 px (documento de 407-415 px). Anotado en `deferred-items.md`.

## Reglas de PARAR

Ninguna disparó un checkpoint. P-1 aplicó (instrumento arreglado, nunca un `esperado`). P-0, P-2, P-3, P-4: no aplicaron (las suites que estaban verdes siguieron verdes; las tres mutaciones dieron rojo; ningún intocable tocado: `lib/overlay-history.ts`, `lib/dirty-history.ts`, `lib/panel-branch.ts`, `scripts/con-turno.mjs`, `next.config.ts`, `components/`, `app/(dashboard)/{mas,clients,settings,agenda}` sin diff contra `85c99ae`; cero dependencias y cero migraciones).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Listo para el 04-02: `TABS_NEGOCIO`/`TABS_CONFIG`, `panelTabCause`, `'user-switch'` y `drop` existen y están probados; el molde de pantalla es el de Finanzas (`function alElegirTab(value: unknown, detalles: { reason: string }): void` en una línea, efecto con `sanitizeAction` + `reconciledMemo` + ref).
- Para el 04-02: (1) el `mutar` del gate no puede pasar literales con `|`/`&` por `argv` en esta máquina; (2) en la sonda, `tocarTab` ya convierte al viewport visual — los recorridos de Negocio/Configuración pueden usarlo tal cual; (3) MOB-08/MOB-09 NO se marcaron (los marca el dueño en `/gsd-verify-work 4 --ws panel-nav`); nada se pusheó.

---
*Phase: 04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada*
*Completed: 2026-11-17*

## Self-Check: PASSED

- Los 4 archivos creados existen (`lib/panel-tabs.ts`, `test/panel-tabs.test.ts`, `.planning/debug/tabs-en-la-url-medida.md`, `deferred-items.md`).
- Los 13 commits del plan existen (`efb9ae4` … `f24ad6f`); `test(04-01)` antes de `feat(04-01)` y de `fix(04-01)` (gates 4 de los dos tasks).
