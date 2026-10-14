---
phase: 03-la-pol-tica-de-atr-s-de-un-nivel-a-dos
plan: "01"
subsystem: ui
tags: [navegacion, history-api, cdp, chrome-devtools-protocol, vitest, next16, mobile]

# Dependency graph
requires:
  - phase: 02-la-barra-inferior-y-m-s
    provides: "`/mas` como RUTA (no como hoja de overlay), los tres consumidores de `panelNavMode` (barra, pantalla Más, sidebar) y los candados estáticos de la Phase 2"
  - phase: v0.30 (NAV-07 / NAV-08)
    provides: "`panelNavMode` con sus cuatro ramas documentadas, `PANEL_ROOT`, `consumeOwnedPanelEntry`, `isForeignOwnedEntry` y el simulador de pila de la suite"
provides:
  - "`panelNavMode` con SEIS ramas: `to === more ⇒ push` (D-02) y `from === more ⇒ push` (MOB-04 nivel 1), con las tres originales intactas y primero"
  - "`PANEL_MORE = '/mas'` exportado, y la ruta de Más como parámetro con default (`more = PANEL_MORE`) — la rama es testeable sin montar nada"
  - "El atrás de dos niveles llega a la barra, a la pantalla Más y al sidebar POR CONSUMO: cero componentes editados"
  - "Una sonda CDP re-ejecutable (`.planning/debug/probes/panel-back-stack.mjs`) que mide la pila REAL del navegador para los 7 recorridos de la fase y falla con rc≠0 si alguna difiere"
  - "Las 7 pilas medidas y escritas (`.planning/debug/pila-de-dos-niveles-medida.md`), con los 3 supuestos que la sonda NO puede cerrar declarados y ruteados a la UAT"
affects: [03-02 (la marca de la rama y el retroceso guardado), 03-03 (el sentinel de salida de MOB-05), 03-04 (la UAT en celular real), 04 (los tabs)]

actuals:
  tokens: 24910   # chars/4 sobre los 4 archivos tocados (99.640 chars). Sólo el diff realizado: 12.801 (51.203 chars)
  tasks: 2
  commits: 3
  plan_head_before: 04dcd34f2d3985cf4d311e5bfb23bd1e2c3e1d3b

tech-stack:
  added: []   # CERO paquetes nuevos: el `WebSocket` global de Node v24 hace de cliente de CDP
  patterns:
    - "La política de navegación se expresa sobre RUTAS en una función pura, y los componentes la heredan por consumo — no por edición"
    - "Las ramas de una regla de historial se fijan por SECUENCIA COMPLETA en un gate de región, no por presencia: mover cualquiera lo pone rojo"
    - "Una sonda CDP autocontenida (servidor `node:http` propio + Chrome headless + `WebSocket` global) mide la pila real sin dev server, sin base y sin paquetes nuevos"
    - "La sonda distingue `abajo` (el camino del atrás) de `adelante` (las entradas de forward) y DECLARA la segunda en vez de ignorarla"

key-files:
  created:
    - .planning/debug/probes/panel-back-stack.mjs
    - .planning/debug/pila-de-dos-niveles-medida.md
  modified:
    - lib/panel-history.ts
    - lib/panel-history.test.ts

key-decisions:
  - "`to === more` se escribe ANTES de `from === more`: son mutuamente excluyentes salvo `from === to === more`, que ya atajó la rama 1, y el orden explícito evita que una tercera rama futura en el medio cambie ese significado"
  - "La ruta de Más entra como parámetro con default y no como literal en el cuerpo — mismo molde que `root`, y es lo que vuelve testeable la rama"
  - "El `PANEL_MORE` de los tests se afirma por NAMESPACE (`PH.PANEL_MORE`) y no por import nombrado: un import nombrado inexistente revienta al CARGAR el módulo, y ese rojo es del loader, no de la política — no distingue 'falta la rama' de 'el archivo no compila'"
  - "La sonda mide TRES cantidades por escenario (abajo / actual / adelante) porque se midió que ni `back()` ni `replaceState` truncan las entradas de adelante. La corrección no estaba en el research"
  - "Lo que este plan NO hace queda escrito en el docblock Y en un caso de test: tocar Más dentro de su rama todavía APILA, porque subir un nivel (D-03) no se puede decidir sobre rutas"

patterns-established:
  - "Gate de región con ancla en la llave SOLA (`/^}$/`): el recorte de una función cuyo destructuring cierra en columna 0 se trunca si el ancla acepta cualquier llave inicial"
  - "Degradación segura por diseño: toda rama nueva devuelve `push`. Sin la marca de 03-02, el peor caso es una pila un escalón más larga — nunca una expulsión del sitio"

requirements-completed: [MOB-04, MOB-06]

coverage:
  - id: D1
    description: "El atrás tiene dos niveles hacia abajo: desde una sección abierta por Más vuelve a Más, y de ahí a Inicio (MOB-04 nivel 1)"
    requirement: MOB-04
    verification:
      - kind: unit
        ref: "lib/panel-history.test.ts#Más → sección EMPUJA: la sección queda ENCIMA de Más (MOB-04 nivel 1)"
        status: pass
      - kind: unit
        ref: "lib/panel-history.test.ts#Inicio → Más → Finanzas: el primer atrás cae en MÁS y el segundo en INICIO (criterio 1)"
        status: pass
      - kind: unit
        ref: "lib/panel-history.test.ts#las 9 secciones que en mobile SÓLO se alcanzan por Más: atrás → Más, atrás → Inicio"
        status: pass
      - kind: e2e
        ref: "node scripts/con-turno.mjs node .planning/debug/probes/panel-back-stack.mjs (E-1, Page.getNavigationHistory en Chrome/154.0.8037.98)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Más apila sobre lo que haya abierto: `Inicio → Turnos → Más → atrás` cae en Turnos, con tres escalones (D-02)"
    requirement: MOB-04
    verification:
      - kind: unit
        ref: "lib/panel-history.test.ts#sección → Más EMPUJA: Más apila sobre lo que haya abierto (D-02)"
        status: pass
      - kind: unit
        ref: "lib/panel-history.test.ts#Inicio → Turnos → Más: el atrás cae en TURNOS, con TRES escalones (D-02)"
        status: pass
      - kind: unit
        ref: "lib/panel-history.test.ts#los 4 destinos de la barra → Más: el atrás devuelve el destino (D-02)"
        status: pass
      - kind: e2e
        ref: "panel-back-stack.mjs (E-2: medido [/dashboard,/appointments,/mas], atrás → /appointments)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Las tres ramas originales quedan intactas y primero, y `return 'replace'` sigue última: la secuencia completa de las seis ramas está fijada por un gate de región"
    requirement: MOB-04
    verification:
      - kind: unit
        ref: "lib/panel-history.test.ts#Más → Más REEMPLAZA: la rama 1 sigue ganando sobre las dos nuevas (cicatriz 1)"
        status: pass
      - kind: other
        ref: "gate de región: sed -n '/^export function panelNavMode(/,/^}$/p' → secuencia medida idéntica a la esperada (18 líneas, última = llave sola)"
        status: pass
    human_judgment: false
  - id: D4
    description: "La ruta de Más es un parámetro con default y `PANEL_MORE` está exportado — la rama es testeable sin montar nada"
    verification:
      - kind: unit
        ref: "lib/panel-history.test.ts#la ruta de Más es un parámetro, no un literal escondido en la regla"
        status: pass
      - kind: unit
        ref: "lib/panel-history.test.ts#PANEL_MORE está exportado y es la ruta de Más SIN TILDE"
        status: pass
    human_judgment: false
  - id: D5
    description: "Desktop no se entera, por construcción y sin ningún chequeo de viewport: ninguno de los 14 destinos del sidebar es `/mas` (criterio 6, MOB-07)"
    requirement: MOB-06
    verification:
      - kind: unit
        ref: "lib/panel-history.test.ts#criterio 6 — ninguno de los 14 destinos del sidebar es PANEL_MORE, así que desktop no se entera"
        status: pass
      - kind: unit
        ref: "test/panel-history-sidebar.test.ts + test/panel-nav-groups.test.ts (7 archivos / 203 casos verdes sin editarse)"
        status: pass
    human_judgment: false
  - id: D6
    description: "El invariante de v0.30 sigue verde y sin editar: las 13 rutas del sidebar dejan una sola sección encima del dashboard, y `Dashboard → Finanzas → Clientes → atrás` sigue cayendo en el dashboard (MOB-06, criterio 4)"
    requirement: MOB-06
    verification:
      - kind: unit
        ref: "lib/panel-history.test.ts#desde CUALQUIER sección del menú, después de cualquier recorrido, el atrás cae en el dashboard (bloque sin editar)"
        status: pass
      - kind: unit
        ref: "npx vitest run --project pure → 75 archivos, 1417 passed + 3 expected fail (piso 1404)"
        status: pass
    human_judgment: false
  - id: D7
    description: "El cambio de comportamiento llega sin tocar una sola línea de componente: la barra, la pantalla Más y el sidebar lo heredan por consumo (criterio 5)"
    requirement: MOB-06
    verification:
      - kind: other
        ref: "git status --porcelain -- panel-bottom-nav.tsx sidebar.tsx mas-client.tsx overlay-history.ts dirty-history.ts → vacío; hashes base 32cf56c / 351a53b intactos"
        status: pass
    human_judgment: false
  - id: D8
    description: "Sonda CDP re-ejecutable que mide la pila real del navegador para los 7 recorridos y falla con rc≠0 si alguna difiere, sin dev server, sin base y sin paquetes nuevos"
    verification:
      - kind: e2e
        ref: "node scripts/con-turno.mjs node .planning/debug/probes/panel-back-stack.mjs → rc 0, 7/7 coinciden"
        status: pass
      - kind: other
        ref: "gate estático: lectura de la pila real=1, WebSocket=2, servidor propio=1, spawn=1, referencias al dev server o a la base=0, imports ajenos=[], escenarios faltantes=0"
        status: pass
      - kind: other
        ref: "git status --porcelain -- package.json package-lock.json → vacío; eslint rc 0 sobre el .mjs"
        status: pass
    human_judgment: false
  - id: D9
    description: "El documento de debug deja las 7 mediciones verbatim y declara los 3 supuestos que la sonda NO puede cerrar (A1, A2, A11), ruteados a la UAT del plan 03-04"
    verification:
      - kind: other
        ref: "gate del documento: faltantes=0 sobre {E-1..E-7, A1, A2, A11, 'NO puede cerrar'}, versión de Chrome citada=2"
        status: pass
    human_judgment: false
  - id: D10
    description: "En un teléfono real, `Inicio → Más → Finanzas → atrás` deja Más a la vista y el siguiente atrás cae en Inicio; y `Inicio → Turnos → Más → atrás` cae en Turnos"
    requirement: MOB-04
    verification: []
    human_judgment: true
    rationale: "Es el único criterio que vale en esta fase y es el backstop declarado en los must_haves del plan. El modo de falla es SILENCIOSO (la URL cambia y la vista no, o el atrás no hace nada) y no lo ve tsc, ni la suite, ni el build. Todo lo medido acá fue Chrome de escritorio headless: Safari/iOS y Chrome Android reales (A11) sólo se cierran con el teléfono del dueño, en la UAT del plan 03-04"

# Metrics
duration: 34 min
completed: 2026-10-14
status: complete
---

# Phase 3 Plan 01: La política de atrás, de un nivel a dos Summary

**`panelNavMode` pasa de cuatro ramas a seis — `to === '/mas' ⇒ push` (D-02) y `from === '/mas' ⇒ push` (MOB-04 nivel 1) — y los tres menús heredan el atrás de dos niveles sin que se edite una sola línea de componente; más una sonda CDP re-ejecutable que midió las siete pilas reales del navegador (7/7) en vez de derivarlas.**

## Performance

- **Duration:** 34 min (de los cuales **~21 min** fueron **espera del turno de pantalla**: dos suites de Playwright de otros proyectos de esta máquina tenían el turno)
- **Started:** 2026-10-14T02:26:00Z
- **Completed:** 2026-10-14T03:00:10Z
- **Tasks:** 2 / 2
- **Files modified:** 4 (2 creados, 2 modificados)

## Accomplishments

- **El atrás tiene dos niveles, y son dos líneas.** `panelNavMode` gana las ramas 4 (`to === more ⇒ push`, D-02) y 5 (`from === more ⇒ push`, MOB-04 nivel 1), con las tres originales **intactas y primero** y el `return 'replace'` final en su lugar. La secuencia completa de las seis queda fijada por un gate de región, así que mover cualquiera se pone rojo.
- **Cero componentes tocados, y está probado y no afirmado.** La barra, la pantalla Más y el sidebar ya consumían la función en su `replace={panelNavMode({ from: pathname, to: … })}`, así que las dos ramas nuevas los alcanzan **por consumo**. El gate corre `git status --porcelain` sobre los tres componentes y sobre los otros dos dueños de la pila, y los cinco salen vacíos con sus hashes base (`32cf56c` / `351a53b`) intactos.
- **Las siete pilas, MEDIDAS en Chrome y no derivadas.** La sonda `.planning/debug/probes/panel-back-stack.mjs` lee `Page.getNavigationHistory` en `Chrome/154.0.8037.98` sobre su propio servidor estático en loopback, **sin dev server, sin base y con cero paquetes nuevos** (el `WebSocket` de CDP es el global de Node v24). Las siete coincidieron con lo esperado y la sonda **sale distinto de cero** si alguna difiere: es un instrumento con gate que 03-02 y 03-03 pueden volver a correr.
- **Tres mediciones que le ahorran trabajo a los planes siguientes:** E-5 le fija la forma a 03-02 (doble retroceso sin navegar, y la marca guardando **la ruta** y no un booleano); E-6 prueba que estar parado sobre el sentinel **cuenta como armado**, o sea que 03-03 **no** tiene que pisarlo con un reemplazo; y E-3 confirma que la marca de la entrada de abajo **sobrevive al retroceso**.
- **Lo que este plan NO hace quedó escrito en tres lugares** (docblock, un caso de test y el documento de debug): tocar Más estando dentro de su rama **todavía apila** (`[/dashboard, /mas, /finances, /mas]`), porque subir un nivel (D-03) **no se puede decidir sobre rutas**. Es una pila un escalón más larga, no un defecto peligroso, y lo arregla 03-02. Declararlo es lo que impide que la UAT lo lea como una regresión de este plan.

## Task Commits

1. **Task 1 (tracer, TDD): las dos ramas de ruta** — RED `1b5d40f` (`test`) → GREEN `3fd89cb` (`feat`). Sin REFACTOR: la implementación son cinco líneas, ya mínimas.
2. **Task 2: la sonda y el documento de debug** — `efc7dd1` (`chore`)

**Commits medidos:** `git rev-list --count 04dcd34..HEAD` = **3** (base `04dcd34f2d3985cf4d311e5bfb23bd1e2c3e1d3b`, del ledger).

## Files Created/Modified

- `lib/panel-history.ts` — `PANEL_MORE` exportado, `more = PANEL_MORE` en la firma, las dos ramas nuevas cuarta y quinta, y el docblock extendido con el **por qué** de cada una, con la consecuencia de D-02 (tres escalones) y con lo que la función todavía no hace y por qué.
- `lib/panel-history.test.ts` — 13 casos nuevos (71 → **84**): las dos ramas, el candado del orden, el parámetro `more`, el export de `PANEL_MORE`, el criterio 6 sobre los 14 destinos del sidebar, y en el simulador de pila los dos recorridos de MOB-04, el de D-02, el barrido de las 9 secciones de la rama de Más, el de los 4 destinos de la barra, la entrada directa y el caso que declara el apilado de D-03.
- `.planning/debug/probes/panel-back-stack.mjs` *(nuevo)* — la sonda CDP autocontenida y re-ejecutable, con las primitivas de medición (`medir`, `reiniciarEn`, `empujar`, `retrocederGuardado`, `colapsar`) y los siete escenarios con su expectativa en código.
- `.planning/debug/pila-de-dos-niveles-medida.md` *(nuevo)* — las siete mediciones verbatim, con qué se midió, qué significa "la pila" en esta sonda, y la sección **"Lo que esta sonda NO puede cerrar"**.

## Las siete pilas medidas

| # | Recorrido | Medido | Veredicto |
|---|---|---|---|
| **E-1** | MOB-04 nivel 1 · `Inicio → Más → Finanzas` | `[/dashboard,/mas,/finances]` · atrás → `/mas` · atrás → `/dashboard` | OK |
| **E-2** | D-02 · `Inicio → Turnos → Más` | `[/dashboard,/appointments,/mas]`, **3** escalones · atrás → `/appointments` | OK |
| **E-3** | subir un nivel (→ 03-02) | actual `/mas`, abajo `[/dashboard,/mas]`, aterrizó con `{frjUnder:"/dashboard"}` | OK |
| **E-4** | colapso normal (criterio 2) | rama `retroceso-y-reemplazo` · abajo `[/dashboard,/clients]` · el atrás cae en Inicio · `/finances` queda **adelante** | OK |
| **E-5** | colapso degenerado (→ 03-02) | rama `doble-retroceso` · abajo `[/dashboard,/appointments]` · **cero** entradas idénticas adyacentes | OK |
| **E-6** | sentinel de salida (→ 03-03) | tras el 1er atrás: `/dashboard#salir` con `{frjExit:1}` vivo y `pathname = /dashboard`; tras el 2º: `/dashboard` sin marca | OK |
| **E-7** | entrada directa (cicatriz 2) | índice `0`, abajo `['/finances']`, el retroceso guardado **se negó**, sigue parado en `/finances` | OK |

**7 medidos · 7 coinciden · 0 difieren · rc 0.**

## Resultado de los ocho gates `<automated>`

| Gate | Qué mide | Medido |
|---|---|---|
| T1-1 | secuencia de las seis ramas (gate de región) | recorte **18** líneas (≥9), última = llave sola; secuencia **idéntica** a la esperada; `PANEL_MORE` exportado=**1**; `more` como parámetro=**1** |
| T1-2 | `lib/panel-history.test.ts` verde | rc **0** · **84** casos (≥82, base 71) |
| T1-3 | no-regresión de v0.30 y la Phase 2 | rc **0** · **7** archivos verdes · **203** casos |
| T1-4 | tsc + eslint + archivos intocados | tsc **vacío** · eslint rc **0** · los otros dos dueños **vacío** · componentes tocados **vacío** · hashes `32cf56c` / `351a53b` |
| T2-1 | la sonda es autocontenida y mide de verdad | pila real=**1** · WebSocket=**2** · servidor propio=**1** · spawn=**1** · dev server/base=**0** · imports ajenos=**[]** · escenarios faltantes=**0** |
| T2-2 | la sonda corre y mide | rc **0** · 7/7 coinciden |
| T2-3 | el documento de debug está completo | faltantes=**0** sobre `{E-1..E-7, A1, A2, A11, "NO puede cerrar"}` · Chrome citado=**2** |
| T2-4 | eslint sobre el `.mjs` + cero paquetes | eslint rc **0** · `package.json`/lock **vacío** |

**Verificación de cierre del plan:** sonda rc **0** · 8 archivos de historial verdes con **287** casos (≥285, base 274) · `tsc --noEmit` **vacío** (con `./node_modules/.bin/tsc`, nunca `npx tsc`) · los 5 archivos que no se tocan **vacíos** · `package.json`/lock **vacíos** · carril puro completo: **75** archivos, **1417** passed + **3** expected fail (piso 1404).

## Decisions Made

- **`to === more` va antes que `from === more`.** Hoy el orden entre las dos da igual —son mutuamente excluyentes salvo `from === to === more`, que ya atajó la rama 1—, pero escribirlo explícito evita que mañana una tercera rama en el medio cambie ese significado sin que nadie lo vea.
- **El `PANEL_MORE` del test se afirma por namespace (`PH.PANEL_MORE`), no por import nombrado.** Es por el ciclo RED-GREEN: un import nombrado que todavía no existe revienta al **cargar** el módulo, y ese rojo es del loader y no de la política — no distingue "falta la rama" de "el archivo no compila", así que no autoriza a implementar nada. Con el namespace, el único rojo posible es el de la aserción. Queda documentado en el archivo.
- **La sonda mide tres cantidades por escenario (`abajo` / `actual` / `adelante`), no una.** Es una corrección **medida** que el research no tenía: ni `history.back()` ni `replaceState` truncan las entradas de **adelante**. "La pila" de los criterios de la fase es el **camino del atrás** (`abajo`); las de adelante **no son basura en ese camino** y el dueño estuvo ahí de verdad, así que se **declaran** en la expectativa en vez de ignorarse.
- **El barrido de los 4 destinos de la barra trata Inicio aparte, y no por descuido.** `Inicio → Inicio` es la **misma ruta** (rama 1, `replace`), así que ahí la pila queda en dos escalones y el atrás cae igual en Inicio — que es MOB-04 nivel 2, el que ya cumplía. El test lo dice explícito en vez de excluir el caso en silencio.

## Deviations from Plan

**None - plan executed exactly as written.**

Los ocho `<automated>` corrieron y dieron verde **en el código escrito según el `<action>`**, sin tocar ninguna expectativa de gate. En particular el gate de región —el que el plan declara como el corregido— devolvió **18 líneas** con la última siendo la llave sola, así que midió la regla de verdad y su verde vale.

## Issues Encountered

- **La sonda esperó ~21 minutos el turno de pantalla.** Dos suites de Playwright de otros proyectos de esta máquina (forjo-tiendas y después erp-forjo-studio) tenían el turno, con dueño **vivo**. El envoltorio imprimió su cartel nombrando al dueño cada ~80 s y tomó el turno solo cuando se liberó. **No es un defecto ni un rojo** — es exactamente para lo que existe el turno; queda anotado acá y en el documento de debug para que la próxima vez nadie lo lea como un cuelgue. **No se cortó con Ctrl+C** (hay un defecto conocido: el candado quedaría tomado por un dueño vivo y bloquearía a todos los proyectos).
- **El `check tdd-red-evidence` del SDK espera TAP de `node:test`, no el reporter por defecto de Vitest.** La corrida de RED se repitió con `--reporter=tap-flat` y se le adosaron las tres líneas de resumen (`# tests 84` / `# pass 74` / `# fail 10`) medidas en la misma corrida. Veredicto: **`RED_EVIDENCE_OK`** (el test objetivo falló por aserción, exit 1) ⇒ GREEN autorizado. No es un hallazgo del plan, es una nota de herramienta.

## Known Stubs

Ninguno. Hay **una incompletitud declarada y a propósito**, que no es un stub: tocar Más estando **dentro** de su rama todavía **apila** en vez de subir un nivel (D-03). No es un valor vacío ni un placeholder — es una rama de la política que **no se puede decidir sobre rutas** (el par `(from, to)` es idéntico con la pila de tres, donde subir es correcto, y con la entrada directa, donde el mismo retroceso expulsaría al dueño del sitio). Queda escrita en el docblock de `panelNavMode`, en el caso de test `tocar Más estando DENTRO de su rama todavía APILA — declarado acá, lo arregla 03-02`, y en el documento de debug. **La resuelve el plan 03-02**, que es el dueño declarado de la marca de la rama.

## Threat Flags

Ninguno nuevo. La superficie de este plan es la que el `<threat_model>` del plan ya encuadra: cero cambios de esquema, policies o queries, cero migraciones (la próxima libre sigue siendo la **080**) y cero datos de otro negocio en juego. Las dos amenazas `high` quedaron con su gate verde:

- **T-03-01** (un retroceso sobre entrada ajena ⇒ el dueño fuera del sitio): este plan **no ejecuta ningún retroceso** — las dos ramas nuevas devuelven `push`. El gate de secuencia lo fija y el caso de entrada directa (`['/finances']` + tocar Más ⇒ `push`) es el candado explícito; la sonda lo midió en **E-7**, donde el retroceso guardado **se negó**.
- **T-03-03** (la forma de la pila aceptada por razonamiento en vez de por medición): cerrada por la sonda, 7/7 en Chrome real, con rc≠0 si alguna difiere.
- **T-03-04** (la sonda convertida en código de la app): vive en `.planning/debug/probes/`, es `.mjs` (fuera del `include` de `tsconfig.json`), no se importa desde `app/`, `lib/` ni `components/`, y el gate afirma que no referencia ni el dev server ni la base.
- **T-03-SC** (supply chain): `package.json` y el lockfile **sin tocar**, y el gate de imports confirma que todos son de la plataforma de Node.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Listo para el plan 03-02.** Lo que hereda, medido y no supuesto:

- **E-5 le fija la forma:** el colapso degenerado se resuelve con **doble retroceso sin navegar**, y por eso la marca tiene que guardar **la ruta** y no un booleano — con un booleano esa rama no se puede detectar.
- **E-3 confirma que la marca de la entrada de abajo sobrevive al retroceso** (aterriza con `{frjUnder:"/dashboard"}`), que es el dato que el retroceso guardado necesita para decidir el salto siguiente.
- **E-4 confirma el colapso normal** y además que el reemplazo **no trunca** las entradas de adelante.
- **Las dos lecciones del encadenamiento están escritas dentro de la sonda** y hay que copiarlas: el listener se engancha **en el gesto** y con `{ once: true }` (no en un efecto, que se pierde el `popstate` de una navegación same-route), y **no se navega dentro del `popstate`** (el segundo paso se difiere fuera del evento).
- **Para 03-03:** E-6 prueba que el sentinel que queda debajo de una sección **no** produce el atrás muerto de C-5 — estar parado sobre él cuenta como armado — así que **no hay que pisarlo con un reemplazo**.

**Lo que queda abierto, declarado y ruteado — no es un blocker de este plan:**

- **A1** — que el efecto que escribe la marca corra **después** de la escritura del router de Next. Es semántica de React y del router, no de la pila: la sonda mide `history` crudo sin router en el medio.
- **A2** — que no haya **otro commit del router en vuelo** cuando se escribe la marca.
- **A11** — **Safari/iOS y Chrome Android reales.** Todo lo medido en este repo sobre el retroceso fue Chrome de escritorio headless, incluida esta sonda.

Los tres van a la **UAT del plan 03-04**, que es el único criterio que cierra la fase: el modo de falla es **silencioso** (la URL cambia y la vista no, o el atrás no hace nada) y **no lo ve `tsc`, ni la suite, ni el build**.

**Nota para quien cierre la fase:** `MOB-04` y `MOB-06` quedan **sin marcar** en `REQUIREMENTS.md` a propósito — los declaran también los planes 03-02, 03-03 y 03-04, que todavía no tienen SUMMARY, y el gate de IDs compartidos los bloquea hasta que termine el último. `STATE.md` y `ROADMAP.md` no se tocaron: los escribe el orquestador al cerrar la wave.

---
*Phase: 03-la-pol-tica-de-atr-s-de-un-nivel-a-dos · Plan: 01*
*Completed: 2026-10-14*

## Self-Check: PASSED

Los 4 archivos de `key-files` existen en disco (`[ -f ]` sobre los 2 creados y los 2 modificados) y
los 3 commits del plan están en `git log --oneline --all` (`1b5d40f`, `3fd89cb`, `efc7dd1`). Los ocho
`<automated>` de los tasks y los cinco puntos de la `<verification>` del plan se re-corrieron y
quedaron verdes, con sus números medidos en las tablas de arriba. `STATE.md`, `ROADMAP.md` y
`REQUIREMENTS.md` **sin tocar**, como corresponde en este modo de ejecución.
