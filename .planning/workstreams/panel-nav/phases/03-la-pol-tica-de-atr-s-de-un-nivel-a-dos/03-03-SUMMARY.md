---
phase: 03-la-pol-tica-de-atr-s-de-un-nivel-a-dos
plan: "03"
subsystem: ui
tags: [navegacion, history-api, react-hooks, next16, mobile, accesibilidad, tailwind4, vitest, cdp]

# Dependency graph
requires:
  - phase: 03-la-pol-tica-de-atr-s-de-un-nivel-a-dos (plan 03-01)
    provides: "`panelNavMode` con seis ramas, `PANEL_MORE` exportado, y la sonda CDP con los 7 escenarios medidos — **E-6** es exactamente la forma que este plan implementa"
  - phase: 03-la-pol-tica-de-atr-s-de-un-nivel-a-dos (plan 03-02)
    provides: "`lib/panel-branch.ts` (el ejecutor de dos pasos + `usePanelBranch`), la marca `frjUnder`, `panelBranchPlan` con el quinto miembro YA en el tipo y el ejecutor que YA lo ejecuta, y el paso 3 del `onNavigate` de la barra"
  - phase: NAV-10 (quick 261006-flm)
    provides: "`lib/dirty-history.ts`: el ciclo del sentinel COMPLETO corriendo en producción — el hash como condición de existencia, la re-verificación de la marca antes de cada retroceso, el candado de un solo dueño por entrada, y `participates` (nadie absorbe sin poder avisar)"
  - phase: v0.30 / NAV-06
    provides: "`lib/overlay-history.ts`: los dos helpers del teclado PUROS y ya exportados (umbral de inset y ventana de gracia de 300ms), medidos con sonda"
  - phase: 02-la-barra-inferior-y-m-s (02-UI-SPEC §13)
    provides: "El contrato de diseño del aviso efímero: copy, ancho medido en las 5 familias, ancla, superficie, radio, tipografía, capa, interactividad, a11y, movimiento, y la regla de la constante única"
provides:
  - "`frjExit`: la CUARTA marca de la pila, y la única nueva que es **absorbente** — por eso SÍ entra en `isForeignOwnedEntry` (al revés de la marca de la rama, que es propia-informativa y queda afuera)"
  - "`isExitSentinelOwnedEntry`: el tercer dueño de la regla 0, con el literal duplicado a propósito y su candado anti-deriva"
  - "`PANEL_EXIT_HINT_MS`: la duración visible del aviso Y la ventana lógica del segundo atrás, un solo número consumido por un solo temporizador que hace las dos cosas"
  - "`PANEL_EXIT_HASH = '#salir'`: el hash del sentinel con sus dos criterios medidos, y el criterio (a) escrito como función contra las constantes IMPORTADAS de los otros dos dueños"
  - "`panelExitArmAction` / `panelExitPopAction`: las dos decisiones puras del ciclo, con las reglas en orden y el motivo de cada orden"
  - "`panelBranchPlan` con `holdsExitSentinel`: PRODUCE el quinto miembro del tipo (`'none'`) en su primera regla, desde la misma función de decisión"
  - "El ciclo en el MISMO hook de la rama: una instancia, un dueño por entrada, el estado de sentinel vivo re-derivado de la entrada de arriba (E-6), y el teclado re-armando en vez de gastar el aviso (C-7)"
  - "El aviso efímero de §13 como HERMANO del elemento de navegación (no hijo), con su ancla de escritorio derivada del layout (D-05)"
  - "El bloque 11 del candado de chrome: los 9 invariantes del aviso que ni `tsc`, ni el build, ni la suite de decisiones ven"
affects: [03-04 (la UAT en celular real — A1/A2/A11 + el aviso visible y legible; la enmienda de MOB-07 por D-05), 04 (los tabs — la regla 0 con tres dueños y el chequeo de exhaustividad del tipo del plan)]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 23138   # chars/4 sobre el diff REALIZADO (92.554 chars en los 6 archivos)
  tasks: 3
  commits: 5      # MEDIDO: git rev-list --count aa085b6..HEAD
  plan_head_before: aa085b60b113bc5090baf6c569cb3a65ada6ee81

# Tech tracking
tech-stack:
  added: []   # CERO paquetes nuevos, cero tokens CSS nuevos, cero DOM simulado
  patterns:
    - "Un valor que es a la vez una duración VISIBLE y una ventana LÓGICA se exporta desde un solo lugar y se consume con un solo temporizador que hace las dos cosas: la sincronización queda garantizada por ESTRUCTURA, no por disciplina"
    - "Una marca de historial nueva se clasifica antes de escribirla: AJENA-ABSORBENTE (su dueño la empujó para consumirla ⇒ entra en la regla 0) o PROPIA-INFORMATIVA (anota un dato sobre una entrada del router ⇒ queda afuera). Las dos direcciones rompen cosas opuestas y los dos casos de test van adyacentes"
    - "El estado de «soy dueño de un sentinel vivo» se RE-DERIVA de la entrada de arriba en cada commit, y la referencia sólo sobrevive para el instante del `popstate` —donde la entrada ya fue consumida y no hay nada de donde derivar—"
    - "Un criterio de elección medido (el hash no puede ser interpretado por otro dueño) se escribe como FUNCIÓN contra las constantes importadas de los otros módulos, no como comentario ni como literal copiado: así el día que el otro cambie, el candado lo ve"
    - "Un gate que deriva su valor de barrido de la constante del módulo (en vez de copiar el literal) es el único que sigue midiendo cuando el ejecutor elige otro valor"
    - "Un elemento que tiene que verse donde su hermano está oculto por CSS se monta como HERMANO y no como hijo, y hay un caso de test que lo afirma: adentro, el incumplimiento es invisible en el breakpoint donde se desarrolla"
    - "Una región viva de accesibilidad se queda MONTADA y es su CONTENIDO el que aparece y desaparece: una región cuyo contenido nunca cambia no anuncia nada"

key-files:
  created: []
  modified:
    - lib/panel-history.ts
    - lib/panel-history.test.ts
    - lib/panel-branch.ts
    - test/panel-branch.test.ts
    - components/dashboard/panel-bottom-nav.tsx
    - test/panel-nav-chrome.test.ts

key-decisions:
  - "**`frjExit` SÍ entra en `isForeignOwnedEntry` y la decisión NO se heredó de `frjUnder`: se tomó con su propia medición.** El criterio es la CLASE de marca, no la fase que la escribió: el sentinel es una entrada que su dueño empujó para consumirla (como la de un overlay o la del guard de cambios sin guardar), así que una escritura encima le borra la marca y queda basura más un atrás muerto; la marca de la rama sólo anota un dato sobre una entrada del router, y meterla en la regla 0 haría que `applyPanelView` se abstenga sobre toda entrada marcada ⇒ el detalle de cliente dejaría de empujar en `/clients`. La medición que lo cierra: con el sentinel en la regla 0, `applyPanelUnder` desde una sección hacia Inicio **se abstiene** (verificado en test) — y ésa es justo la escritura que, sin el predicado, caería sobre el sentinel al volver de una sección (E-6)"
  - "El hash es `'#salir'` y **se fijó en el plan, no a criterio del ejecutor**, porque sus dos criterios hay que MEDIRLOS: (a) no empieza con `#modal` ni con `#sin-guardar` —afirmado contra sus constantes importadas— y (b) cero elementos del panel con ese identificador (barrido medido: 0 sobre `app/` y `components/`, `.tsx` y `.ts`). El gate DERIVA el texto de la constante del módulo, así que sigue barriendo el hash real si alguna vez cambia"
  - "`holdsExitSentinel` va **sin default** en `panelBranchPlan`, igual que `masDebajo`: es un HECHO de la pila y no una configuración, así que un call site que lo olvide **no compila**. Costó actualizar los 11 call sites existentes de la suite y vale la pena: es la misma disciplina que esta fase viene a instalar"
  - "La regla del sentinel es la **primera** de `panelBranchPlan`, antes incluso de la regla 0. Medido por razonamiento sobre el código: en Inicio con el sentinel armado el hecho de la rama es FALSO, así que la regla 0 devolvería `replace` — y ese reemplazo caería sobre el sentinel dejando dos entradas idénticas con el sentinel re-armado encima, o sea un atrás muerto ENTERRADO"
  - "`drawsExitHint` es un parámetro **obligatorio** del hook y no un default `true`: es el molde exacto de `participates` en `lib/dirty-history.ts`, y la pregunta que fuerza es la correcta («¿hay alguien a quien pedirle el aviso?»). Hoy se cumple además por construcción —el único consumidor dibuja el aviso en el mismo componente—, pero el contrato queda escrito para el segundo"
  - "El rastreador del teclado se **repite** en este módulo en vez de importarse, y se declara por qué: el de `lib/overlay-history.ts` es estado privado del módulo (no exportado) y ese módulo es intocable en esta fase. Lo que sí se reusa es lo que está MEDIDO: los dos helpers puros (umbral de inset y ventana de gracia) y la decisión"
  - "El aviso es **hermano** del elemento de navegación y no hijo, y es la única forma de cumplir D-05: el elemento lleva `lg:hidden`, así que adentro quedaría la absorción SIN aviso en escritorio —el botón muerto que el propio módulo del sentinel declara peor que el bug— y el incumplimiento sería invisible a 375px"
  - "El ancla de escritorio sale del layout y no de un token nuevo: la mitad del ancho del sidebar (`7.5rem`, la mitad del `lg:pl-60` que el `<main>` ya usa) y 24px del borde inferior, los dos de la escala del proyecto. Verificado compilando las clases con el pipeline real de Tailwind: `left: calc(50% + 7.5rem)` y `bottom: calc(var(--panel-nav-h) + env(safe-area-inset-bottom,0px) + 0.5rem)` se generan con los espacios que el CSS exige"
  - "`nextPanelExitHash` existe aunque el ciclo nunca re-arma estando parado sobre un sentinel: si el dueño llega con la URL ya pegada con el hash, empujar la misma URL colapsa la entrada y el primer atrás lo SACA del panel — justo lo contrario de lo que el sentinel hace. Es la cicatriz 1 y el molde de `nextDirtyHash`"

patterns-established:
  - "Cuándo-armar y qué-significa-un-retroceso se escriben como DOS funciones puras con reglas en orden y un caso por regla, cada uno apagando una sola condición del caso base: el orden queda ejercitado y no supuesto"
  - "El candado de la constante única se afirma leyendo el FUENTE y no un valor de retorno, porque la propiedad es de la estructura del módulo: dos temporizadores con el mismo número también serían dos lugares que pueden divergir"
  - "Los contadores de un gate sobre un componente se miden en el ÁMBITO que corresponde a cada invariante (fuera del elemento vigilado para lo nuevo, sobre el archivo entero para lo que vive adentro) y descontando comentarios: medido, dos de ellos ya valían 1 sin el aviso escrito"
  - "Todo valor arbitrario de Tailwind de una superficie nueva se afirma SIN espacios con un barrido sobre todos los valores arbitrarios de la región, no sólo sobre el que se escribió: con un espacio la clase no se genera y nadie avisa"

requirements-completed: [MOB-05, MOB-06]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "El sentinel de salida entra en la regla 0 con el molde de los otros dos predicados, y la marca de la rama sigue afuera (los dos casos adyacentes y contrapuestos)"
    requirement: "MOB-06"
    verification:
      - kind: unit
        ref: "lib/panel-history.test.ts#el sentinel de salida — la CUARTA marca de la pila, y la ÚNICA nueva que es absorbente"
        status: pass
      - kind: other
        ref: "gate de región: dueños que reconoce la regla 0 = 3 · marca de la rama dentro de la regla 0 = 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "La ventana del aviso es UNA constante consumida por UN temporizador que hace las dos cosas (ocultar y re-armar), y el componente no la re-declara"
    requirement: "MOB-05"
    verification:
      - kind: unit
        ref: "test/panel-branch.test.ts#la ventana del aviso — UNA constante, UN temporizador (§13, la regla de la constante única)"
        status: pass
      - kind: other
        ref: "gate de conteo: usos en código = 2 · temporizadores = 1 · re-declarada en el componente = 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "El ciclo del sentinel: absorber una vez, avisar, y no re-armar durante la ventana — con las dos decisiones puras y sus reglas en orden, el overlay ganando siempre y el teclado re-armando en vez de gastar el aviso"
    requirement: "MOB-05"
    verification:
      - kind: unit
        ref: "test/panel-branch.test.ts#cuándo se arma el sentinel — las reglas EN ORDEN"
        status: pass
      - kind: unit
        ref: "test/panel-branch.test.ts#qué significa un retroceso — las reglas EN ORDEN"
        status: pass
    human_judgment: false
  - id: D4
    description: "`panelBranchPlan` produce el quinto miembro del tipo (`'none'`) desde la misma función, en su primera regla, sin cambiar ninguna de las ramas que ya estaban"
    requirement: "MOB-06"
    verification:
      - kind: unit
        ref: "test/panel-branch.test.ts#panelBranchPlan con el sentinel arriba — el quinto miembro del tipo, PRODUCIDO (barrido 10 × 5 × 2)"
        status: pass
    human_judgment: false
  - id: D5
    description: "La forma del sentinel debajo de una sección no deja un atrás muerto: estar parado sobre él cuenta como armado"
    requirement: "MOB-05"
    verification:
      - kind: e2e
        ref: "node scripts/con-turno.mjs node .planning/debug/probes/panel-back-stack.mjs — E-6, 7/7, rc 0"
        status: pass
    human_judgment: false
  - id: D6
    description: "El aviso efímero de §13 escrito verbatim (copy, ancla, superficie, radio, padding, tipografía, capa, interactividad, a11y, movimiento y movimiento reducido), hermano del elemento de navegación y con su ancla de escritorio"
    requirement: "MOB-05"
    verification:
      - kind: unit
        ref: "test/panel-nav-chrome.test.ts#11 · el aviso efímero de salida (§13 / MOB-05 / D-05, plan 03-03)"
        status: pass
      - kind: other
        ref: "pipeline real de Tailwind: las 7 clases del aviso generan CSS válido (calc con espacios, variante de movimiento reducido, breakpoint lg)"
        status: pass
    human_judgment: false
  - id: D7
    description: "El aviso se VE y se LEE en un teléfono real, 8px arriba de la barra y en una sola línea; el ciclo repetido tres veces seguidas sigue funcionando; y en escritorio aparece centrado sobre la columna de contenido"
    requirement: "MOB-05"
    verification: []
    human_judgment: true
    rationale: "El modo de falla de esta fase es SILENCIOSO y ningún gate de este repo lo ve: no hay DOM simulado (`environment: 'node'`), no hay Testing Library ni Playwright, y el milestone prohíbe paquetes nuevos. Lo que esta suite cubre es el código escrito; que el aviso sea legible, esté al alcance del pulgar y no quede tapado sólo se cierra en el teléfono del dueño. Ruteado a la UAT del plan 03-04, junto con A1/A2/A11"
  - id: D8
    description: "Un atrás que en realidad bajaba el teclado no gasta el aviso (C-7)"
    requirement: "MOB-05"
    verification:
      - kind: unit
        ref: "test/panel-branch.test.ts#REGLA 5 — el retroceso era del TECLADO ⇒ RE-ARMAR sin gastar el aviso (C-7)"
        status: pass
    human_judgment: true
    rationale: "La DECISIÓN está cubierta como función pura, pero el disparo real depende de los eventos de `visualViewport` de un IME real — y todo lo medido en este repo sobre el retroceso fue Chrome de escritorio headless (A11). El atenuante está medido (Inicio no tiene campos de texto: cero), así que es improbable, no imposible. Queda como ítem de la UAT del plan 03-04"

# Metrics
duration: 32 min
completed: 2026-10-14
status: complete
---

# Phase 3 Plan 03: La política de atrás, de un nivel a dos — el ciclo del sentinel de salida y el aviso efímero

**El primer atrás en Inicio ya no saca del panel: lo absorbe un sentinel propio (`frjExit`, la cuarta marca de la pila y la única nueva que entra en la regla 0) y aparece el aviso de §13 verbatim, 8px arriba de la barra en celular y centrado sobre la columna de contenido en escritorio; la duración visible y la ventana lógica del segundo atrás son el mismo número desde un solo lugar, consumido por un solo temporizador que hace las dos cosas.**

## Performance

- **Duration:** 32 min
- **Started:** 2026-10-14T03:32:24Z
- **Completed:** 2026-10-14T04:04:00Z
- **Tasks:** 3 de 3
- **Files modified:** 6 (0 creados)

## Accomplishments

- **MOB-05 implementado con el mecanismo que el estándar permite.** El atrás no se cancela (llega `cancelable: false`): se **absorbe**. Se empuja un sentinel propio mientras el dueño está en la raíz del panel, su atrás consume esa entrada, y el `popstate` que llega es el aviso de que el gesto ocurrió. Es el ciclo que `lib/dirty-history.ts` ya corre en producción, reducido a *absorber una vez y no re-armar durante la ventana*.
- **La regla de la constante única de §13, cumplida por estructura y no por disciplina.** `PANEL_EXIT_HINT_MS` es **un** número en **un** lugar, y lo consume **un** temporizador que hace **las dos** cosas al expirar: ocultar el aviso y re-armar el sentinel. No hay dos efectos, así que no hay dos números que puedan desincronizarse — y los dos síntomas de esa desincronización son silenciosos (ni `tsc` ni la suite los ven).
- **El cuarto escritor de la pila entró con la disciplina de los otros tres.** `frjExit` es una clave nueva —no reusa ninguna de las tres que ya viven ahí ni la de la rama—, SÍ entra en `isForeignOwnedEntry` porque es una entrada **absorbente**, su marca se re-verifica antes de **cada** retroceso, y hay un candado anti-deriva que lee los dos módulos y exige que el literal siga siendo el mismo.
- **El quinto miembro del tipo del plan, producido desde la misma función de decisión.** `panelBranchPlan` ganó el hecho `holdsExitSentinel` y devuelve `'none'` en su primera regla: tocar Inicio estando en Inicio con el sentinel armado no navega, no apila y no reemplaza. Si *nada* viviera afuera del tipo, el chequeo de exhaustividad del plan 03-04 no lo vería.
- **El aviso de §13 verbatim, y en los dos viewports (D-05).** Copy exacto, ancla como una sola expresión sin espacios que suma el alto de la barra y el inset con fallback, superficie invertida (el único par con contraste garantizado en los 40 temas), radio y padding del sistema, 14px/500/1.4 en una línea, capa entre la barra y los drawers, sin interacción, las tres propiedades de accesibilidad, y el movimiento sólo en opacidad y transformación con su variante de movimiento reducido. Es **hermano** del elemento de navegación, no hijo — la única forma de que se vea en escritorio.
- **Los 11 gates automatizados y la sonda, verdes.** Suite pura en **1506 pasados / 76 archivos** (piso 1463; los 3 expected-fail siguen siendo 3), la sonda CDP en **7/7** incluido E-6, `tsc` limpio, eslint rc 0, y los intocables —`lib/overlay-history.ts`, `lib/dirty-history.ts`, el sidebar, la pantalla Más, `app/globals.css` y `app/themes.css`— sin una línea tocada.

## Task Commits

Cada task se commiteó por separado; los dos primeros son `tdd="true"` y por eso llevan RED y GREEN.

1. **Task 1: El sentinel entra en la regla 0 — el predicado y su candado anti-deriva**
   - `f4e028b` (test) — RED intencional: 5 fallados / 107 pasados, todos de **aserción** y ninguno del loader (lo nuevo se afirma por namespace `PH.algo` justamente para eso).
   - `791e041` (feat) — GREEN: `isExitSentinelOwnedEntry` con el molde exacto de los otros dos y la regla 0 reconociendo **tres** dueños, sumando en vez de reescribir.
2. **Task 2: El ciclo del sentinel — absorber una vez, avisar, y re-armar con un solo temporizador**
   - `239ef09` (test) — RED intencional: 26 fallados / 21 pasados, todos de aserción.
   - `e6ca9de` (feat) — GREEN: la constante única, el hash con sus dos criterios, las dos decisiones puras, `panelBranchPlan` con el hecho nuevo, y el ciclo en el mismo hook de la rama.
3. **Task 3: El aviso de §13, hermano de la barra, y su ancla de escritorio**
   - `e4ac05b` (feat) — el aviso verbatim, el fragmento con los dos hermanos, el ancla de escritorio derivada del layout, y el bloque 11 del candado (9 casos nuevos).

**Commits de producción medidos:** 5 (`git rev-list --count aa085b6..HEAD`).

## Files Created/Modified

- `lib/panel-history.ts` — `isExitSentinelOwnedEntry` (el tercer dueño de la regla 0, con el literal `frjExit` duplicado a propósito y el docblock que explica por qué el sentinel SÍ entra y la marca de la rama NO); `isForeignOwnedEntry` sumando el dueño nuevo; `panelBranchPlan` con `holdsExitSentinel` y su regla -1, que **produce** el quinto miembro del tipo.
- `lib/panel-history.test.ts` — el bloque del sentinel (6 casos) pegado al de la marca de la rama, con los dos casos contrapuestos adyacentes; y los 11 call sites de `panelBranchPlan` actualizados al hecho nuevo (obligatorio, sin default).
- `lib/panel-branch.ts` — `PANEL_EXIT_HINT_MS`, `PANEL_EXIT_HASH`, la marca y su reconocedor, `exitHashCollidesWithOtherOwners` (el criterio (a) escrito como función contra las constantes importadas), `nextPanelExitHash`, `panelExitArmAction`, `panelExitPopAction`, el rastreador del teclado sobre los dos helpers puros de overlays, y el ciclo entero dentro del **mismo** hook de la rama.
- `test/panel-branch.test.ts` — 28 casos nuevos: la auditoría de la constante única y del cero-gate-de-viewport, la marca y las cuatro formas disjuntas, el hash contra las constantes importadas, las dos decisiones con una regla por caso, `panelBranchPlan` con el barrido 10 × 5 × 2, y el candado anti-deriva que lee los dos módulos.
- `components/dashboard/panel-bottom-nav.tsx` — el componente devuelve un fragmento con el elemento de navegación (intacto, con su `lg:hidden`) y el aviso como **hermano**; el aviso con todo lo que §13 fija y su ancla de escritorio; el encabezado explicando por qué no es un toast y por qué el aviso no puede ir adentro de la barra.
- `test/panel-nav-chrome.test.ts` — bloque 11: los 9 invariantes del aviso que ningún otro gate ve.

## Decisions Made

### Qué se decidió sobre `frjExit` en la regla 0, y con qué medición

**Entra.** Y la decisión **no se heredó** de `frjUnder` (que quedó afuera en el plan 03-02): se tomó con su propio criterio y su propia medición, porque lo que decide no es la fase que escribió la marca sino **la clase de marca**:

| | `frjUnder` (plan 03-02) | `frjExit` (este plan) |
|---|---|---|
| Qué es | **propia-informativa**: anota un dato (qué ruta quedó debajo) sobre una entrada que empujó el router | **ajena-absorbente**: una entrada que su dueño **empujó para consumirla**, como la de un overlay o la del guard de cambios sin guardar |
| En la regla 0 | **NO** | **SÍ** |
| Qué rompe la decisión equivocada | con ella adentro, `applyPanelView` se abstiene sobre **toda** entrada marcada ⇒ el detalle de cliente deja de empujar en `/clients` (regresión de v0.30) | con ella afuera, una escritura le borra la marca ⇒ su dueño no la reconoce, no la consume al expirar la ventana, y queda basura en la pila **más un atrás muerto** |

**La medición que lo cierra** (y es la razón por la que el call site ya existe, no es hipotético): al volver de una sección hacia Inicio, el efecto de marcado del hook llama a `applyPanelUnder` con la política en `push`… y la entrada de arriba en ese momento **es el sentinel** (escenario **E-6**: el primer atrás aterriza sobre `/dashboard#salir` con `{"frjExit":1}` y la marca viva). Sin el predicado, ese reemplazo cae justo sobre el sentinel. Con el predicado, `applyPanelUnder` **se abstiene** — afirmado en `lib/panel-history.test.ts` (`applyPanelUnder con el sentinel arriba tampoco escribe`), y la degradación es segura: sin la marca de la rama, la política empuja o reemplaza, **nunca** retrocede.

El gate de región lo fija por los dos lados a la vez: **dueños que reconoce la regla 0 = 3** y **marca de la rama dentro de la regla 0 = 0**. Y los dos casos de test están escritos **adyacentes**, en una sola aserción doble, para que la diferencia no se pierda en un refactor.

### El resto

- **El hash quedó en `'#salir'`**, fijado por el plan y no a criterio del ejecutor, porque sus dos criterios hay que medirlos: (a) no empieza con `#modal` ni con `#sin-guardar` —afirmado contra sus constantes **importadas**, no contra literales copiados— y (b) **cero** elementos del panel con ese identificador (barrido re-corrido en este plan sobre `app/` y `components/`, `.tsx` y `.ts`: 0). El gate **deriva** el texto de la constante del módulo, así que seguiría barriendo el hash real si alguna vez cambia.
- **`holdsExitSentinel` va sin default**, igual que `masDebajo`: es un hecho de la pila, no una configuración, y un call site que lo olvide **no compila**. Costó actualizar 11 call sites de la suite.
- **La regla del sentinel es la primera de `panelBranchPlan`**, antes de la regla 0: en Inicio con el sentinel armado el hecho de la rama es falso, así que la regla 0 devolvería `replace` y ese reemplazo caería **sobre** el sentinel.
- **`drawsExitHint` es obligatorio** en el hook, molde de `participates`: sin alguien que dibuje el aviso no se arma **nada**. Hoy se cumple además por construcción (el único consumidor dibuja el aviso en el mismo componente).
- **El rastreador del teclado se repite** en este módulo en vez de importarse, y queda declarado por qué: el de `lib/overlay-history.ts` es estado **privado** del módulo y ese módulo es intocable. Lo que sí se reusa es lo que está medido: los dos helpers puros y la decisión.
- **El aviso es hermano y no hijo**, y es la única forma de cumplir D-05.
- **El ancla de escritorio sale del layout**: `lg:left-[calc(50%+7.5rem)]` (la mitad del `lg:pl-60` del `<main>`) y `lg:bottom-6`. Cero token nuevo.
- **Se verificó que las clases del aviso COMPILAN de verdad**, no sólo que están escritas: se corrió el pipeline real de Tailwind sobre las 7 clases y se leyó el CSS generado (`bottom: calc(var(--panel-nav-h) + env(safe-area-inset-bottom,0px) + 0.5rem)`, `left: calc(50% + 7.5rem)`, la variante de movimiento reducido y el breakpoint `lg`). Es el riesgo simétrico del gate de espacios: sin espacios la clase se genera, y Tailwind le pone los que el CSS exige.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing critical] `nextPanelExitHash`, que el plan no pedía explícitamente**

- **Found during:** Task 2
- **Issue:** el plan pedía el hash como **constante** (`PANEL_EXIT_HASH`) y nada más. Empujar el sentinel con la constante a secas reintroduce la **cicatriz 1** en un caso real: si el dueño llega con la URL ya pegada con nuestro hash (`/dashboard#salir`), el `pushState` cae sobre la misma URL, el router **colapsa la entrada**, no se crea ninguna, y el primer atrás **saca al dueño del panel** — exactamente lo contrario de lo que el sentinel viene a hacer, y en silencio.
- **Fix:** se agregó `nextPanelExitHash(currentHash)` con el molde exacto de `nextDirtyHash` del módulo de referencia (que existe por esta misma razón): respeta un hash ajeno, y si el actual ya es el nuestro empuja el sufijo numerado. Con 6 casos de test, incluidos los dos degenerados (`Number('')` da 0 y `Number('abc')` da NaN: los dos caen al base, nunca a `#salir-NaN`).
- **Files modified:** `lib/panel-branch.ts`, `test/panel-branch.test.ts`
- **Verification:** `test/panel-branch.test.ts#el hash siguiente nunca repite el actual (cicatriz 1…)` — verde; y el gate del hash sigue derivando el texto de la constante.
- **Committed in:** `e6ca9de` (parte del commit del task)

**2. [Rule 3 — Blocker] El `drawsExitHint` de la barra se adelantó al Task 2**

- **Found during:** Task 2
- **Issue:** `drawsExitHint` quedó como parámetro **obligatorio** de `usePanelBranch` (ver Decisiones). El cuarto gate del Task 2 exige `tsc --noEmit` limpio, y el único call site del hook vive en `components/dashboard/panel-bottom-nav.tsx`, que es archivo del **Task 3**. Sin tocarlo, `tsc` no podía estar limpio al cerrar el Task 2.
- **Fix:** se agregó **sólo** `drawsExitHint: true` (con su comentario) en el commit del Task 2; el consumo de `hintVisible` y el aviso entero quedaron en el Task 3, que es donde el plan los pone.
- **Files modified:** `components/dashboard/panel-bottom-nav.tsx`
- **Verification:** gate 4 del Task 2 (`tsc` limpio, eslint rc 0, intocables vacíos) — verde; y el gate 3 del Task 3 sigue midiendo **0** re-declaraciones de la ventana en el componente.
- **Committed in:** `e6ca9de`
- **Alternativa descartada:** darle default `false` al parámetro. Habría dejado el call site compilando sin pensar el problema, que es lo contrario de lo que el parámetro existe para forzar.

**3. [Rule 3 — Blocker] Los casos de `panelBranchPlan` se movieron del archivo del Task 1 al del Task 2**

- **Found during:** Task 1
- **Issue:** `panelBranchPlan` vive en `lib/panel-history.ts`, así que el primer impulso fue escribir sus casos en `lib/panel-history.test.ts` (el archivo del Task 1). Pero el cambio de firma lo asigna el plan al **Task 2**, y pasarle `holdsExitSentinel` a una función que todavía no lo acepta rompe el gate 3 del Task 1 (`tsc` limpio). Son tasks distintos: el Task 1 no puede depender del Task 2.
- **Fix:** los tres casos se movieron a `test/panel-branch.test.ts`, que es donde el `<behavior>` del Task 2 los pide, y el commit RED del Task 1 se **enmendó** antes de seguir (nada estaba publicado).
- **Files modified:** `lib/panel-history.test.ts`, `test/panel-branch.test.ts`
- **Verification:** gate 3 del Task 1 (`tsc` limpio, 8 suites verdes) y gate 2 del Task 2 (47 casos, ≥28) — los dos verdes.
- **Committed in:** `f4e028b` (enmendado) y `239ef09`

**4. [Rule 2 — Missing critical] El `<nav>` se reindentó para poder envolverlo en el fragmento**

- **Found during:** Task 3
- **Issue:** el aviso tiene que ser **hermano** del elemento de navegación, lo que obliga a envolver los dos en un fragmento. Dejar el `<nav>` con la indentación vieja adentro del fragmento habría dejado el archivo mintiendo sobre su propia estructura.
- **Fix:** 89 líneas desplazadas **dos espacios**, sin un solo cambio de contenido. El gate que recorta el elemento de navegación (`/<nav$/,/<\/nav>/`) sigue encontrándolo, y los tres contadores de D-04 (los `active ?` = 3 y el bloque del indicador = 1) siguen exactos.
- **Files modified:** `components/dashboard/panel-bottom-nav.tsx`
- **Verification:** gates 2, 3 y 4 del Task 3 — verdes; y el diff se lee con `git diff -w`.
- **Committed in:** `e4ac05b`

---

**Total deviations:** 4 auto-fixed (2 × Rule 2 — funcionalidad crítica faltante; 2 × Rule 3 — bloqueo para completar el task).
**Impact on plan:** cero scope creep. Las dos de Rule 2 son correctitud (una cicatriz ya sufrida en este repo, y la estructura que D-05 exige); las dos de Rule 3 son re-ubicación de trabajo **dentro** de los archivos que el plan ya lista, para que cada task cierre verde por sí solo. Ningún requisito nuevo, ningún paquete nuevo, ningún token nuevo, ninguna migración.

## Issues Encountered

**1. El piso de casos del plan estaba desactualizado, y los gates ya pasaban sin el trabajo.** El plan declara bases de 97 / 12 / 48 casos y exige ≥103 / ≥28 / ≥54. Medido **antes** de escribir una línea: 106 / 19 / 50. O sea que el gate de `lib/panel-history.test.ts` (≥103) **ya estaba verde** con la base real. No se tocó el gate —relajarlo o endurecerlo por cuenta propia está prohibido—: se escribieron los casos que el `<behavior>` pide, y los números finales son **112 / 47 / 59**, cómodos arriba de los tres pisos. Queda anotado porque un piso que ya está cumplido no mide nada, y el próximo plan de esta fase haría bien en derivar la base en vez de copiarla.

**2. El reloj.** Los dos canarios de reloj de la suite fallan a propósito fuera de [01:00, 23:30] hora de Argentina, y el trabajo arrancó 00:32. No afectó nada —los dos canarios no están en las nueve suites de esta fase y la corrida del carril completo se hizo 01:02, ya adentro de la ventana— pero vale como recordatorio: un rojo de esos no es del cambio.

**3. Un heredoc de bash se rompió al escribir el bloque de tests.** Se resolvió escribiendo con la herramienta de edición en vez de por shell. Sin consecuencias.

## User Setup Required

None — no hay configuración de servicios externos, variables de entorno ni migraciones (la próxima libre sigue siendo la **080**).

## Next Phase Readiness

**Listo para el plan 03-04 (la UAT en celular real y la coherencia de los artefactos).** Lo que le queda:

- **Los tres supuestos que ninguna sonda cierra:** **A1** (el orden del efecto que escribe la marca contra la escritura del router de Next), **A2** (que no haya otro commit del router en vuelo al escribir) y **A11** (Safari/iOS y Chrome Android reales — todo lo medido acá fue Chrome de escritorio headless).
- **Los ítems de UAT que este plan agrega:** el aviso **visible y legible** 8px arriba de la barra y en una sola línea; el ciclo repetido **tres veces seguidas**; el aviso en **escritorio** centrado sobre la columna de contenido; que el aviso **no** aparezca por un gesto que en realidad bajaba el teclado; y que el aviso **no** coexista con un overlay abierto.
- **Dos consecuencias declaradas, no descubiertas** (las dos están escritas en el docblock del módulo y van a la UAT):
  1. con el sentinel armado, la URL de Inicio muestra el hash (`/dashboard#salir`). Es inherente al mecanismo —el hash es la condición de existencia de la entrada— y es la forma medida en E-6.
  2. el sentinel se arma estando en la raíz, **haya o no haya** historia debajo. Si debajo de Inicio quedó una sección (`Inicio → Turnos → Inicio`, que la política empuja en los dos sentidos), el segundo atrás no sale del panel: vuelve a Turnos, y el copy del aviso queda optimista. No se arregló acá porque **no hay forma confiable de preguntarle al navegador si hay algo debajo** (`history.length` cuenta también el forward) — es la misma razón por la que el caso de entrada directa está aceptado desde v0.30 (E-7). El gesto sigue haciendo algo visible en los dos casos, que es el invariante que importa. **Si el dueño lo nota en la UAT, la discusión vuelve al gate de diseño, no al código.**
- **La enmienda de MOB-07 por D-05** es trabajo explícito del plan 03-04 (Task 2), con su propio gate. Este plan **no** tocó `REQUIREMENTS.md`.

**Sin blockers.**

## Self-Check: PASSED

- Los **6 archivos** de `key-files.modified` existen en disco.
- Los **5 commits** citados existen en el historial (`f4e028b`, `791e041`, `239ef09`, `e6ca9de`, `e4ac05b`), y el conteo medido contra el ledger (`aa085b6..HEAD`) da **5** — el mismo número que dice el frontmatter.
- Los **11 gates `<automated>`** del plan (3 del Task 1, 4 del Task 2, 4 del Task 3) corridos y verdes, con sus números en el reporte.
- `<verification>` del plan, los 6 puntos: 9 suites verdes (376 casos) · sonda **7/7** rc 0 con **E-6** verde · `tsc --noEmit` limpio · la constante única verificable de un vistazo (1 declaración, 2 usos en código, 1 temporizador, 0 menciones en el componente) · 0 gate de viewport en el módulo del ciclo · intocables y los dos archivos de tokens sin tocar.
- Carril puro completo: **1506 pasados / 3 expected-fail / 76 archivos** (piso del plan: 1463 y 76).
- `STATE.md` y `ROADMAP.md` **sin tocar**, como pidió el orquestador.

---
*Phase: 03-la-pol-tica-de-atr-s-de-un-nivel-a-dos*
*Completed: 2026-10-14*
