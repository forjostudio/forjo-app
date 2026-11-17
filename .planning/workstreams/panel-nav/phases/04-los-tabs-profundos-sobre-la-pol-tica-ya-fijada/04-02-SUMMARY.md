---
phase: 04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada
plan: "02"
subsystem: ui
tags: [next16, useSearchParams, history, tabs, oauth, sonner, vitest, cdp]

requires:
  - phase: 04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada
    provides: "04-01: lib/panel-tabs.ts (TABS_NEGOCIO/CONFIG, resolveTab, tabSlug), 'user-switch' + panelTabCause, applyPanelView con drop y sin marca fabricada en un replace, el molde de pantalla de Finanzas"
provides:
  - "/negocio (Datos · Cobros · Integraciones · Notificaciones) y /settings (Apariencia · Seguridad · Suscripción) con el tab en ?tab=, sin estado de tab al lado de la URL"
  - "el retorno del OAuth de /negocio como UN replace del helper a ?tab=integraciones con drop ['mp', 'google'] (D-09)"
  - "Agenda limpia su ?google= con applyPanelView stale (D-10): el barrido crudo del criterio 5 en cero en las tres pantallas"
  - "el aviso del retorno del OAuth (Negocio y Agenda) por fin se ve: se pide en la próxima tarea"
  - "negocio/page y settings/page envueltas en <Suspense fallback={null}>"
  - "el describe «el cableado de los tres grupos» (a)-(i) + honestidad en test/panel-tabs.test.ts"
  - "ocho recorridos R-T-* nuevos en la sonda de la app y las secciones (c) y (d) del registro"
affects: [04-03, 04-04, 04-05 (UAT del dueño: T-1 ruta por ruta y el OAuth REAL en prod), la sonda de la app]

actuals:
  tokens: 18610
  tasks: 2
  commits: 6
plan_head_before: 43bb2bda83c3d3f326cde283b09fafedfba334cf

tech-stack:
  added: []
  patterns:
    - "Un aviso pedido en un efecto de MONTAJE de un documento nuevo se pide en la próxima tarea (setTimeout 0, sin limpieza): el <Toaster> de sonner se suscribe en su propio efecto, después del de la página"
    - "Dos escritores sobre la misma URL: la reconciliación genérica se corta mientras el efecto del OAuth es el dueño de la query"
    - "En los candados estáticos, descontar primero los comentarios de línea entera (sinComentariosFirme) y afirmar un marcador del final del tramo"

key-files:
  created:
    - .planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/04-02-SUMMARY.md
  modified:
    - app/(dashboard)/settings/settings-client.tsx
    - app/(dashboard)/negocio/page.tsx
    - app/(dashboard)/settings/page.tsx
    - app/(dashboard)/agenda/agenda-client.tsx
    - test/panel-tabs.test.ts
    - .planning/debug/probes/panel-exit-en-la-app.mjs
    - .planning/debug/tabs-en-la-url-medida.md
    - .planning/workstreams/panel-nav/phases/04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada/deferred-items.md

key-decisions:
  - "El aviso del OAuth se difiere a la próxima tarea (Rule 1): con el código de antes medía CERO toasts en /negocio y /agenda; sin limpieza a propósito, porque el desmontaje simulado del modo estricto lo cancelaría y la segunda corrida ya no ve la query"
  - "alElegirTab se declara ANTES del par tabValue/onTabChange (función declarada, sin uso adelantado); el esqueleto de las dos líneas queda como el plan lo fija"
  - "El describe nuevo descuenta comentarios con sinComentariosFirme: el sinComentarios del molde se comía 24.933 caracteres de settings-client por un comentario de línea con /api/google/*"
  - "read y sinComentarios no se copiaron: ya estaban en test/panel-tabs.test.ts desde el 04-01 (redeclararlos rompe el módulo); se sumaron recorte, entre y cuerpoDe"

patterns-established:
  - "Pantalla con DOS grupos de tabs en un mismo cliente: grupoDeTabs/tabResuelto null fuera de los grupos ⇒ handler y reconciliación no tocan la URL (T-1)"

requirements-completed: [MOB-08]

coverage:
  - id: D1
    description: "Negocio en la URL: por Más, Cobros → Integraciones → Cobros agrega UNA entrada y el atrás cae en Datos → Más → Inicio (criterio 1); tocar Datos consume (D-02)"
    requirement: MOB-08
    verification:
      - kind: e2e
        ref: "node scripts/con-turno.mjs node .planning/debug/probes/panel-exit-en-la-app.mjs dev interfaz R-T-negocio-por-mas,R-T-negocio-datos-consume"
        status: pass
      - kind: unit
        ref: "test/panel-tabs.test.ts#el cableado de los tres grupos (criterio 5, T-1, T-2, D-10)"
        status: pass
    human_judgment: true
    rationale: "Chrome de escritorio headless con emulación mobile; el teléfono real del dueño y el gesto físico se verifican en /gsd-verify-work 4 --ws panel-nav (04-05)"
  - id: D2
    description: "Configuración en la URL: ?tab=seguridad pegada abre Seguridad sin default fabricado debajo; ?tab=ventas se sanea a /settings en Apariencia sin entradas (D-03, D-06, D-07)"
    requirement: MOB-08
    verification:
      - kind: e2e
        ref: "node scripts/con-turno.mjs node .planning/debug/probes/panel-exit-en-la-app.mjs dev interfaz R-T-config-por-url"
        status: pass
    human_judgment: false
  - id: D3
    description: "El retorno del OAuth (T-2, criterio 3) simulado con la URL exacta del backend: un toast, /negocio?tab=integraciones por un replace sin marca, Datos queda en el sitio; rama de error igual"
    requirement: MOB-08
    verification:
      - kind: e2e
        ref: "node scripts/con-turno.mjs node .planning/debug/probes/panel-exit-en-la-app.mjs dev interfaz R-T-negocio-oauth-mp,R-T-negocio-oauth-google-error"
        status: pass
      - kind: unit
        ref: "test/panel-tabs.test.ts#(g) el retorno del OAuth en Negocio (M-4, M-7 en rojo)"
        status: pass
    human_judgment: true
    rationale: "El OAuth REAL de MercadoPago/Google sólo vuelve en producción: lo verifica el dueño en el 04-05"
  - id: D4
    description: "D-08: tocar Negocio en el sidebar estando en Cobros vuelve a Datos consumiendo; con la URL pegada, el <Link> reemplaza y queda en el sitio"
    requirement: MOB-08
    verification:
      - kind: e2e
        ref: "node scripts/con-turno.mjs node .planning/debug/probes/panel-exit-en-la-app.mjs dev interfaz R-T-sidebar-seccion-activa"
        status: pass
    human_judgment: false
  - id: D5
    description: "T-1: /servicios, /equipo y /consultorios no se mueven (control en OK antes y después, settings-client byte-idéntico fuera de la región, páginas de sección sin diff, M-6 en rojo)"
    requirement: MOB-08
    verification:
      - kind: e2e
        ref: "node scripts/con-turno.mjs node .planning/debug/probes/panel-exit-en-la-app.mjs dev interfaz R-T-secciones-sin-tab"
        status: pass
      - kind: unit
        ref: "test/panel-tabs.test.ts#(c) T-1 textual"
        status: pass
    human_judgment: true
    rationale: "La verificación ruta por ruta A MANO es del dueño en el 04-05 (lo pide el ROADMAP)"
  - id: D6
    description: "D-10 + criterio 5: Agenda limpia ?google= por el helper (un toast, /agenda, sin entradas, {frjView:null}); el barrido crudo del ROADMAP da cero en las tres pantallas; npm run build verde"
    requirement: MOB-08
    verification:
      - kind: e2e
        ref: "node scripts/con-turno.mjs node .planning/debug/probes/panel-exit-en-la-app.mjs dev interfaz R-T-agenda-google"
        status: pass
      - kind: unit
        ref: "test/panel-tabs.test.ts#(a) criterio 5 y (h) Agenda"
        status: pass
      - kind: command
        ref: "npm run build"
        status: pass
    human_judgment: false

duration: 27min
completed: 2026-11-17
status: complete
---

# Phase 4 Plan 02: Negocio y Configuración en la URL, el OAuth reconciliado y un solo dialecto — Summary

**Los dos grupos de tabs de `settings-client.tsx` derivan el tab de `?tab=` con el molde de Finanzas sin mover `/servicios`, `/equipo` ni `/consultorios` (T-1); el retorno del OAuth es UN `replace` del helper a `?tab=integraciones` con `drop: ['mp', 'google']` y Agenda limpia su `?google=` como `stale` — ocho recorridos medidos FALLA → OK en la app real (el control de T-1 en OK las dos veces), y de paso el aviso del OAuth, que con el código de antes NUNCA se veía, ahora sale una vez.**

## Performance

- **Duration:** 27 min
- **Started:** 2026-11-17T11:38:14Z
- **Completed:** 2026-11-17T12:05:00Z
- **Tasks:** 2 (task 1 tracer, task 2 TDD)
- **Files modified:** 7 del plan + `deferred-items.md`

## Accomplishments

- **MOB-08 / D-01, D-02, D-03, D-06, D-07 en Negocio y Configuración:** sin `useState` de tab; `useSearchParams` → `resolveTab` por grupo → `tabValue`; `alElegirTab` con el molde de Finanzas; la reconciliación con `sanitizeAction` + `reconciledMemo` + `conciliadoTabRef`, cortada con `if (grupoDeTabs === null || vueltaDeOAuth) return`.
- **T-1:** el par `tabValue`/`onTabChange` conserva su esqueleto (`isSection ? SECTION_TAB[view] :` / `isSection ? undefined :`); todo lo que sigue a la región es byte-idéntico a `85c99ae` (3040 líneas no vacías), y las tres páginas de sección y `app/api/**` tienen diff cero.
- **D-09 (T-2):** la escritura cruda que forzaba el tab y borraba la query ya no existe; Integraciones se muestra desde el primer frame (`vueltaDeOAuth`), y el replace deja `{"frjView":null}` (sin marca fabricada), así que Datos después reemplaza y no retrocede fuera del sitio.
- **D-10 + criterio 5:** Agenda pasa por `applyPanelView({ cause: 'stale', param: 'google', from: g, to: null })`; `grep -rE 'pushState|replaceState|history\.back'` sobre las tres pantallas da vacío con rc 1.
- **D-08 sin cableado nuevo:** medido en escritorio, sobre la entrada nuestra (consume, índice −1) y sobre la URL pegada (el `<Link>` reemplaza a la ruta limpia).
- **`npm run build`** rc 0: `/negocio`, `/settings`, `/finances` y `/agenda` siguen dinámicas (`ƒ`), sin el error de Suspense.

## Task Commits

1. **Task 1: Negocio y Configuración de punta a punta (tracer)**
   - `1b3e26f` test(04-02): la sonda mide Negocio, Configuracion, el OAuth y T-1 (R-T-*)
   - `3adb255` feat(04-02): Negocio y Configuracion derivan el tab de la URL; el OAuth es un reemplazo del helper
   - `944167c` docs(04-02): (c) Negocio y Configuracion en la URL, y el OAuth, medidos en la app
2. **Task 2: Agenda y los candados del cableado (TDD)**
   - `8b9f57d` test(04-02): candados del cableado de los tres grupos y R-T-agenda-google (RED de D-10)
   - `cb0d519` feat(04-02): Agenda limpia su ?google= por el helper (D-10)
   - `e8ad470` docs(04-02): (d) Agenda y los candados del cableado, un solo dialecto

## Las mediciones (detalle completo en `.planning/debug/tabs-en-la-url-medida.md`, `## (c)` y `## (d)`)

**Entorno.** Supabase local de forjo-app ya arriba (`api local=200`, no hizo falta `supabase start`; no se paró ni reseteó ninguna pila). No había `next dev` de este repo (sin `.next/dev/lock`): cada corrida levantó el suyo en el 3031 y lo mató al salir con el puerto verificado libre. El `next dev` de forjo-landing en el 3000 no se tocó. `Chrome/157.0.8103.52`, node `v24.15.0`, gesto `interfaz`, modo estricto ACTIVO, `next.config.ts` con huella `8ceb99ae…0aa1ae03578`. Las cuatro corridas de pantalla pasaron por el turno, en segundo plano, sin esperas ajenas.

**App — task 1:** RED con la app sin tocar (`1b3e26f`): rc 1, **6 FALLA** (`R-T-negocio-por-mas`, `-datos-consume`, `R-T-config-por-url`, `R-T-negocio-oauth-mp`, `-oauth-google-error`, `R-T-sidebar-seccion-activa`) y el control `R-T-secciones-sin-tab` en **OK**. GREEN con `3adb255`: rc 0, **7 OK**.

**App — task 2:** RED con Agenda sin tocar (`8b9f57d`): rc 1, `R-T-agenda-google` en **FALLA** (`toasts_google=0`, `marca_tras_limpiar="null"`), con `R-T-negocio-oauth-mp` y el control de T-1 en OK. GREEN con `cb0d519`: rc 0, **3 OK**.

**Candados (`test/panel-tabs.test.ts`):** con Agenda sin tocar, 2 rojos de aserción — `(a)` (`agenda-client.tsx: true`) y `(h)` (la región no contiene `applyPanelView(`) — y 51 verdes; después, las ocho suites de historial **8 / 615** y la pura entera **77 archivos** verdes (08:56 AR, dentro de la ventana de los canarios).

**Mutaciones (las cuatro en rojo, de aserción, restauradas con la huella y el árbol limpio):**

| Mutación | Literal | Casos en rojo |
|---|---|---|
| M-4 | `, drop: ['mp', 'google']` → `` | (g) |
| M-5 | `const txTab = tabResuelto.value` → `const [txTab, setTxTab] = useState(tabResuelto.value); void setTxTab` | Finanzas «no sobrevive ninguna segunda fuente…» y (b) |
| M-6 | `isSection ? undefined :` → `isSection ? alElegirTab :` | (c) |
| M-7 | `if (grupoDeTabs === null \|\| vueltaDeOAuth) return` → `if (grupoDeTabs === null) return` | (g) |

**Barrido crudo del criterio 5:** `grep -rE 'pushState|replaceState|history\.back'` sobre `settings-client.tsx`, `finances-client.tsx` y `agenda-client.tsx` → sin salida, rc 1.

**Gates corridos (rc):** task 1 — gate 2 (T-1 por diff, suites 8/605, tsc, eslint) 0 · gate 3 (app, 7 OK) 0 · gate 4 (registro) 0. Task 2 — gate 2 (barrido, suites 8/615, pura 77, M-4..M-7, guard de Agenda, tsc, eslint) 0 · gate 3 (app, 3 OK) 0 · gate 4 (registro) 0. Re-corridos al final sobre `e8ad470`: gate 2 y gate 4 del task 1, rc 0. `tsc --noEmit` limpio; `npm run build` rc 0.

**eslint (deuda preexistente, no tocada):** `settings-client.tsx` quedó EXACTAMENTE en `react-hooks/immutability=6, react-hooks/purity=2, react-hooks/set-state-in-effect=2` (10; el setter forzado del efecto del OAuth, uno de los tres `set-state-in-effect`, desapareció con el cambio). `agenda-client.tsx`: `react-hooks/purity=1` (preexistente, ahora L896 por las líneas sumadas arriba). Páginas, sonda y test: limpios.

## Decisions Made

- El toast del OAuth se pide en la próxima tarea (ver Deviations, 1).
- `alElegirTab` va antes del par `tabValue`/`onTabChange`, para que la constante no use una función declarada más abajo.
- El borde aceptado del OAuth queda escrito en el comentario del efecto: ningún callback emite `tab`; si alguien pegara `?tab=integraciones&mp=…`, la regla 2 no escribe y la query queda hasta el próximo toque.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] El aviso del retorno del OAuth nunca se veía (Negocio y Agenda)**
- **Found during:** Task 1, el RED (y confirmado en el RED de Agenda del task 2).
- **Issue:** con el código de antes los dos retornos midieron `toasts=0` aunque el efecto corría (la query desaparecía). Leído en `sonner` 2.0.7: `toast()` sólo publica a los suscriptores de ese momento y el `<Toaster>` se suscribe en su propio `useEffect`; como está montado después de `{children}` en `app/layout.tsx`, su efecto corre después del de la pantalla y el toast se pierde en un documento nuevo — que es siempre el caso del retorno del OAuth. Sin el arreglo, el `esperado` de `toasts_mp: 1` / `toasts_google: 1` no se cumplía con el código del plan.
- **Fix:** los toasts del efecto se piden en `setTimeout(…, 0)`, sin limpieza a propósito (el desmontaje simulado del modo estricto la correría y la segunda corrida ya no ve la query). Dentro de la región permitida del plan en `settings-client.tsx` y del efecto de Agenda; el comentario explica el porqué.
- **Files modified:** `app/(dashboard)/settings/settings-client.tsx`, `app/(dashboard)/agenda/agenda-client.tsx`
- **Verification:** `toasts=0` en los RED → `toasts=1` en los GREEN (modo estricto activo: no se duplica). Ningún `esperado` cambió.
- **Commits:** `3adb255`, `cb0d519`

**2. [Rule 1 - Bug del instrumento de test] El `sinComentarios` del molde medía cero sobre `settings-client.tsx`**
- **Found during:** Task 2, al escribir el caso (i) (rojo por región vacía).
- **Issue:** el descuento saca los comentarios de bloque antes que los de línea; un comentario de línea con `/api/google/*` abría un bloque falso que se comía 24.933 caracteres de código, incluidas las dos `TabsList`.
- **Fix:** el `describe` nuevo usa `sinComentariosFirme` (primero los comentarios de línea entera) y un caso de honestidad que afirma tres marcadores del tramo. Los consumidores viejos no se tocaron (anotado en `deferred-items.md`).
- **Files modified:** `test/panel-tabs.test.ts`
- **Commit:** `8b9f57d`

**3. [Rule 3 - Ajuste del instrumento] `read`/`sinComentarios` no se copiaron**
- El plan pedía copiarlos del molde, pero el 04-01 ya los dejó a nivel de módulo en `test/panel-tabs.test.ts`; redeclararlos rompe el módulo. Se reusan y se suman `recorte` (copiado, con su origen escrito), `entre` y `cuerpoDe`.

**4. [Rule 3 - El instrumento de las mutaciones] Re-medición con literales de archivo**
- El `mutar` del gate corrió y dio las cuatro en rojo. Por la lección del 04-01 (el `node` de Volta y `cmd`), se re-midieron con un script que lee los literales de un archivo y nombra los casos en rojo y su tipo: los cuatro, `AssertionError`. En esta sesión el paso por `argv` con `||` funcionó (probado aparte), así que el gate no mintió.

---

**Total deviations:** 4 (2 Rule 1, 2 Rule 3). **Impact on plan:** el código de producción cambió sólo dentro de las regiones permitidas; ningún `esperado` se tocó; el arreglo del toast es una mejora visible para el dueño (el aviso del OAuth ahora aparece).

## Issues Encountered

- Ninguna espera del turno (las cuatro corridas lo tomaron al primer intento). Ninguna regla de PARAR disparó: P-0 (entorno sano), P-1 (no hubo fallo del instrumento de pantalla), P-3 (ningún intocable ni archivo fuera del plan: `lib/overlay-history.ts`, `lib/dirty-history.ts`, `lib/panel-branch.ts`, `lib/panel-history.ts`, `lib/panel-tabs.ts`, `scripts/con-turno.mjs`, `next.config.ts`, `components/`, `mas`, `clients`, `finances`, `servicios`, `equipo`, `consultorios`, `app/api` sin diff), P-4 (las cuatro mutaciones rojas), P-5 (el control de T-1 en OK en las tres corridas que lo incluyeron).

## Known Stubs

Ninguno.

## Lo que el dueño tiene que ver en la UAT (04-05)

- **El OAuth REAL** (MercadoPago y Google desde Integraciones, en producción): tiene que volver a `/negocio?tab=integraciones` con Integraciones visible, **el toast tiene que aparecer** (antes no aparecía), y un atrás tiene que salir de la sección.
- **T-1 a mano:** `/servicios`, `/equipo` y `/consultorios` (por Más y por la barra/sidebar), sin cambio alguno.
- **Por Más en el teléfono:** `Negocio → Cobros → Integraciones → Cobros → atrás` (Datos) → atrás (Más) → atrás (Inicio); y lo mismo en Configuración.
- Lo declarado por el research como composición con la barra (C-2..C-5: tocar Inicio/Turnos/Más estando en un tab) **no lo cambia este plan**; si en el teléfono el aviso de salida no se arma en `Más → Negocio → Cobros → Inicio`, es eso (Pitfall 9), no una regresión de este plan.

## Next Phase Readiness

- Para el 04-03: el molde de pantalla con dos grupos ya está probado; los recorridos `R-T-*` de Negocio/Configuración/OAuth/Agenda quedan en la sonda para regresión; `tocarSeccionActiva` y `contarToasts` sirven tal cual.
- **Ojo con el descuento de comentarios** en cualquier candado nuevo sobre `settings-client.tsx`: usar `sinComentariosFirme` (o el fuente crudo) y afirmar un marcador del final del tramo.
- MOB-08 **no** se marcó; nada se pusheó; STATE/ROADMAP/REQUIREMENTS sin tocar (los lleva el orquestador).

---
*Phase: 04-los-tabs-profundos-sobre-la-pol-tica-ya-fijada*
*Completed: 2026-11-17*

## Self-Check: PASSED

- Los archivos del plan existen y están commiteados (`settings-client.tsx`, las dos páginas, `agenda-client.tsx`, `test/panel-tabs.test.ts`, la sonda, el registro con `cierre (c)` y `cierre (d)`).
- Los 6 commits del plan existen (`1b3e26f`, `3adb255`, `944167c`, `8b9f57d`, `cb0d519`, `e8ad470`), medidos desde el ledger (`43bb2bd..HEAD` = 6); `test(04-02)` antes de cada `feat(04-02)` (gates 4 de los dos tasks).
