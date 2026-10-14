---
phase: 03-la-pol-tica-de-atr-s-de-un-nivel-a-dos
plan: "02"
subsystem: ui
tags: [navegacion, history-api, react-hooks, next16, mobile, vitest, cdp]

# Dependency graph
requires:
  - phase: 03-la-pol-tica-de-atr-s-de-un-nivel-a-dos (plan 03-01)
    provides: "`panelNavMode` con seis ramas, `PANEL_MORE` exportado y la ruta de Más como parámetro, y la sonda CDP con las 7 pilas medidas (E-3/E-4/E-5 son la forma que este plan implementa)"
  - phase: v0.30 (NAV-05 / NAV-07 / NAV-08)
    provides: "`panelViewState` como molde de marca propia, `isForeignOwnedEntry` como predicado de la regla 0, `consumeOwnedPanelEntry` con sus dos guardas, y `applyPanelView` como molde de ejecutor"
  - phase: NAV-11 (quick 261006-iey)
    provides: "`leaveNavigationPlan` + el provider del guard: el molde MEDIDO del plan de dos pasos (listener enganchado en el gesto, navegación diferida a un commit)"
provides:
  - "`frjUnder`: una marca NUEVA en el estado de la entrada que guarda LA RUTA que quedó inmediatamente debajo — no un booleano, porque el caso degenerado necesita saber cuál es"
  - "`applyPanelUnder`: la escritura de la marca con reemplazo de estado de DOS argumentos (sin la URL), consultando la regla 0 primero y la política después"
  - "`panelBranchPlan`: la decisión pura con el hecho como booleano y un tipo de CINCO miembros (empujar, reemplazar, subir, colapsar-y-reemplazar, nada)"
  - "`consumeOwnedBranchEntry`: la hermana de `consumeOwnedPanelEntry`, con las dos guardas repetidas y sin tocarle la semántica a la original"
  - "`lib/panel-branch.ts`: el ejecutor de dos pasos (listener de disparo único enganchado en el gesto) y `usePanelBranch`, el hook que marca después del commit y DIFIERE la navegación a un efecto"
  - "El paso 3 del `onNavigate` de la barra, con los pasos 1 y 2 intactos y cero mutaciones crudas de historial en el componente"
  - "Los candados del cableado: el orden de los tres pasos, el criterio 6 (cero rama en Más y en el sidebar) y D-04 (cero affordance visible nuevo)"
affects: [03-03 (el sentinel de salida de MOB-05 — produce el quinto miembro del tipo), 03-04 (la UAT en celular real — A1/A2/A11), 04 (los tabs — la marca y su degradación)]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 47663   # chars/4 sobre los 6 archivos tocados (190.654 chars). Sólo el diff realizado: 16.790 (67.160 chars)
  tasks: 3
  commits: 5      # MEDIDO: git rev-list --count 30ba73a..HEAD
  plan_head_before: 30ba73a29d136e6d13df0bcd42b8acfa7a0e88d7

# Tech tracking
tech-stack:
  added: []   # CERO paquetes nuevos y cero DOM simulado: los tests son de decisiones puras en el carril `node`
  patterns:
    - "Una decisión de historial recibe los HECHOS como booleanos y el ejecutor los re-verifica en el momento del gesto: la decisión no toca `window` y por eso es barrible en una suite pura"
    - "Una marca de historial guarda el DATO (la ruta) y no un predicado (un booleano) cuando alguna rama necesita leerlo más tarde en la cadena"
    - "Un retroceso nuevo se escribe como FUNCIÓN HERMANA de la que ya hay, nunca cambiándole la semántica a la vieja: hay candados estáticos que exigen el literal de la vieja en sus call sites"
    - "Un hook que toca la pila vive en `lib/` y recibe el pathname y la navegación como PARÁMETROS: así no importa el router de Next y no lo arrastra a su grafo ni al de su suite"
    - "El plan de dos pasos: el listener del segundo paso se engancha EN EL GESTO con disparo único, y la navegación se deja pedida en estado y la ejecuta un efecto (nunca adentro del evento)"
    - "Un gate de región sobre una llamada de escritura de estado se mide con DOS regex contrapuestas (una exige la forma de dos argumentos, la otra niega el tercero), nunca contando comas: un paréntesis anidado en el primer argumento deja el conteo en cero"

key-files:
  created:
    - lib/panel-branch.ts
    - test/panel-branch.test.ts
  modified:
    - lib/panel-history.ts
    - lib/panel-history.test.ts
    - components/dashboard/panel-bottom-nav.tsx
    - test/panel-nav-chrome.test.ts

key-decisions:
  - "La marca guarda LA RUTA y no un booleano, y es una decisión medida (E-5): el caso degenerado —el destino de la barra es justo la ruta que quedaría debajo— sólo se detecta leyendo cuál es esa ruta, y leyéndola DESPUÉS del primer retroceso"
  - "`frjUnder` es una clave NUEVA y NO entra en `isForeignOwnedEntry`: ahí dentro, la regla 0 haría que `applyPanelView` se abstenga sobre cualquier entrada marcada y el detalle de cliente dejaría de empujar entrada en `/clients` (regresión silenciosa de v0.30). Hay un caso contrapuesto y un gate de región que lo cuenta en cero"
  - "El caso degenerado NO se decide en la decisión de rutas: se decide en el segundo paso del ejecutor (`branchSecondStep`), que es el único momento en que la ruta de abajo se puede leer. La decisión de rutas lo dice en su docblock con el puntero"
  - "La regla `from === to` se evalúa ANTES de las dos ramas nuevas: si la rama de Más ganara, `/mas → /mas` devolvería `up` y el dueño bajaría un escalón tocando la pantalla en la que ya está (cicatriz 1)"
  - "El hecho se computa comparando la marca contra la ruta de Más y no preguntando «¿hay marca?»: es lo que hace que desktop no se entere POR CONSTRUCCIÓN (criterio 6), sin un chequeo de viewport en el medio"
  - "`consumeOwnedBranchEntry` lleva paréntesis pelados y no parámetro-objeto, por MEDICIÓN: con parámetro-objeto el destructuring cierra con una llave en columna 0 y el gate que audita sus dos guardas recortaría en la firma, poniéndose verde midiendo cero"
  - "`branchMarkDecision` devuelve `string | null` (la ruta a anotar) en vez de un booleano: es la misma respuesta a las dos preguntas del plan —«¿hay que marcar?» y «¿con qué?»— y evita que el call site vuelva a derivar la ruta"
  - "El tercer archivo (`lib/panel-branch.ts`) existe porque dos restricciones se cruzan: el candado de la Phase 2 prohíbe mutaciones crudas de historial en los tres componentes nuevos, y `lib/panel-history.ts` evita importar React a propósito"
  - "La degradación por marca perdida se DECLARA en el docblock con la lista completa de quién la borra (el `replace` de los tres menús, tres causas de `applyPanelView`, el reemplazo crudo de Agenda) y se acepta en esta fase: sin marca la política empuja o reemplaza, nunca retrocede"

patterns-established:
  - "Degradación segura por diseño, verificada por barrido: 9 secciones × 5 destinos con el hecho en falso tienen que devolver exactamente lo que devuelve la política de rutas, y NUNCA un retroceso"
  - "El invariante del criterio 2 se afirma como PROPIEDAD de la pila resultante (`/mas` no queda inmediatamente debajo · no hay dos entradas idénticas adyacentes) y se barre sobre 9 × 4 destinos en dos formas de pila, en vez de enumerar recorridos a mano"
  - "Un candado de cableado que tiene que existir en UN componente y NO existir en los otros dos se escribe en un bloque SEPARADO del que afirma lo común: mezclarlo en el mismo bucle invierte el significado"

requirements-completed: [MOB-04, MOB-06]

coverage:
  - id: D1
    description: "Tocar Más estando dentro de su rama SUBE un nivel (D-03): desde Finanzas abierta por Más, la pila queda en [Inicio, Más] — y nunca por reemplazo, que dejaría /mas encima de /mas"
    requirement: MOB-04
    verification:
      - kind: unit
        ref: "lib/panel-history.test.ts#con el hecho y destino MÁS ⇒ SUBIR un nivel (D-03), nunca reemplazar"
        status: pass
      - kind: unit
        ref: "lib/panel-history.test.ts#Inicio → Más → Finanzas → Más deja la pila en [Inicio, Más] (D-03)"
        status: pass
      - kind: unit
        ref: "test/panel-branch.test.ts#con la marca propia arriba retrocede UNA vez y se hace cargo"
        status: pass
      - kind: e2e
        ref: "node scripts/con-turno.mjs node .planning/debug/probes/panel-back-stack.mjs (E-3, Page.getNavigationHistory)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Estando en una sección abierta por Más, tocar un destino de la barra deja la pila sin /mas inmediatamente debajo (criterio 2): se consume la entrada de la sección y recién entonces se reemplaza, encadenado por el evento del retroceso"
    requirement: MOB-04
    verification:
      - kind: unit
        ref: "lib/panel-history.test.ts#con el hecho y un destino de la barra ⇒ COLAPSAR Y REEMPLAZAR (criterio 2)"
        status: pass
      - kind: unit
        ref: "lib/panel-history.test.ts#INVARIANTE BARRIDO — 9 secciones × 4 destinos, en las pilas de dos y de tres escalones"
        status: pass
      - kind: unit
        ref: "test/panel-branch.test.ts#cuando el evento llega y el segundo paso dice NAVEGAR, navega EXACTAMENTE una vez y con reemplazo"
        status: pass
      - kind: e2e
        ref: "node scripts/con-turno.mjs node .planning/debug/probes/panel-back-stack.mjs (E-4)"
        status: pass
    human_judgment: false
  - id: D3
    description: "El caso degenerado está resuelto y no esquivado: si el destino de la barra coincide con la ruta que quedaría debajo, se consume DOS VECES y no se navega — reemplazar ahí dejaría dos entradas idénticas adyacentes"
    requirement: MOB-04
    verification:
      - kind: unit
        ref: "lib/panel-history.test.ts#EL DEGENERADO — Inicio → Turnos → Más → Finanzas → Turnos no deja dos entradas idénticas"
        status: pass
      - kind: unit
        ref: "test/panel-branch.test.ts#EL DEGENERADO — cuando dice CONSUMIR POR SEGUNDA VEZ, retrocede otra vez y NO navega"
        status: pass
      - kind: unit
        ref: "test/panel-branch.test.ts#parados en Más y la ruta de abajo COINCIDE con el destino ⇒ CONSUMIR POR SEGUNDA VEZ"
        status: pass
      - kind: e2e
        ref: "node scripts/con-turno.mjs node .planning/debug/probes/panel-back-stack.mjs (E-5)"
        status: pass
    human_judgment: false
  - id: D4
    description: "NUNCA un retroceso sobre una entrada que no lleve nuestra marca: dos guardas independientes antes de cada retroceso, y la decisión pura no puede devolver subir ni el colapso con el hecho en falso (MOB-06, T-03-05)"
    requirement: MOB-06
    verification:
      - kind: unit
        ref: "lib/panel-history.test.ts#REGLA 0 — sin el hecho devuelve lo de siempre y NUNCA un retroceso (la cicatriz 2)"
        status: pass
      - kind: unit
        ref: "lib/panel-history.test.ts#ENTRADA DIRECTA — sin marca, /finances → /mas EMPUJA: es el candado de la cicatriz 2"
        status: pass
      - kind: unit
        ref: "test/panel-branch.test.ts#con una entrada de OTRO DUEÑO arriba no retrocede: es la cicatriz 2"
        status: pass
      - kind: unit
        ref: "test/panel-branch.test.ts#el segundo retroceso del degenerado TAMBIÉN pasa por las dos guardas"
        status: pass
      - kind: e2e
        ref: "node scripts/con-turno.mjs node .planning/debug/probes/panel-back-stack.mjs (E-7, entrada directa)"
        status: pass
    human_judgment: false
  - id: D5
    description: "La marca es NUEVA, no entra en el predicado de la regla 0, y se escribe con reemplazo de estado de dos argumentos sin cambiar la URL ni propagar el estado actual (T-03-06, T-03-07, T-03-08)"
    requirement: MOB-06
    verification:
      - kind: unit
        ref: "lib/panel-history.test.ts#isForeignOwnedEntry NO la reconoce — si lo hiciera, el detalle de cliente dejaría de empujar"
        status: pass
      - kind: unit
        ref: "lib/panel-history.test.ts#saliendo de Más hacia una sección: escribe UNA vez, con DOS argumentos y sin retroceder"
        status: pass
      - kind: other
        ref: "gate de región sobre applyPanelUnder: forma de dos argumentos=1 · tercer argumento=0 · propaga el estado actual=0 · marca dentro del predicado de la regla 0=0"
        status: pass
      - kind: unit
        ref: "test/panel-history-clients.test.ts#(a) el helper nunca compone el state por propagación"
        status: pass
    human_judgment: false
  - id: D6
    description: "El paso 3 vive sólo en la barra, con los tres pasos en orden y previniendo la navegación; Más y el sidebar no lo tienen (criterio 6) y nada visible cambia (D-04)"
    requirement: MOB-04
    verification:
      - kind: unit
        ref: "test/panel-nav-chrome.test.ts#la barra: el paso 3 va DESPUÉS del guard y de NAV-08, y PREVIENE la navegación"
        status: pass
      - kind: unit
        ref: "test/panel-nav-chrome.test.ts#la pantalla Más: el paso 3 NO existe (criterio 6, y cero segundo dialecto)"
        status: pass
      - kind: unit
        ref: "test/panel-nav-chrome.test.ts#D-04 · la barra no gana ningún affordance visible condicionado a la rama"
        status: pass
      - kind: other
        ref: "gate de región sobre el onNavigate: secuencia = requestNavigation|consumeOwnedPanelEntry|handleNavigate · prevenciones=3"
        status: pass
    human_judgment: false
  - id: D7
    description: "En un teléfono real: desde una sección abierta por Más, tocar Más vuelve a Más; y tocar un destino de la barra deja el atrás cayendo en Inicio (pila de dos) o en la sección de la barra desde la que se abrió Más (pila de tres), nunca en Más y nunca con un atrás que no hace nada visible"
    requirement: MOB-04
    verification: []
    human_judgment: true
    rationale: "El modo de falla de esta fase es SILENCIOSO (la URL cambia y la vista no, o el atrás no hace nada) y no lo ve `tsc`, ni la suite, ni el build. Todo lo medido acá fue Chrome de escritorio headless (supuesto A11): Safari/iOS y Chrome Android reales sólo se cierran con el teléfono del dueño — ítem de la UAT del plan 03-04"
  - id: D8
    description: "El efecto que escribe la marca corre DESPUÉS de la escritura del router de Next, así que el router no la pisa (supuesto A1), y no hay otro commit del router en vuelo en ese momento (A2)"
    requirement: MOB-06
    verification: []
    human_judgment: true
    rationale: "El camino de código está verificado (un reemplazo de estado SIN url no despacha ningún commit del router) pero el ORDEN no: es semántica de React y del router, no de la pila del navegador, y la sonda CDP mide `history` crudo con su propio servidor estático — no hay router de Next en el medio. Sólo se cierra con la app real (ítem de la UAT del plan 03-04). Si estuviera mal, D-03 y el criterio 2 degradan a empujar EN SILENCIO — y ésa es, a propósito, la degradación segura"

# Metrics
duration: 20 min
completed: 2026-10-14
status: complete
---

# Phase 3 Plan 02: La política de atrás, de un nivel a dos — la mitad difícil

**Una marca nueva (`frjUnder`) que guarda LA RUTA que quedó debajo, una decisión pura de cinco miembros que recibe ese hecho como booleano, y el ejecutor de dos pasos que hace que tocar Más dentro de su rama SUBA un nivel y que volver a la barra no deje Más debajo — incluido el caso degenerado, con doble retroceso y sin navegar.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-10-14T03:07:53Z
- **Completed:** 2026-10-14T03:28:25Z
- **Tasks:** 3
- **Files modified:** 6 (2 creados, 4 modificados)

## Accomplishments

- **La incompletitud declarada por el plan 03-01 quedó cerrada.** Hasta este plan, tocar Más estando dentro de su rama **apilaba** (`[/dashboard, /mas, /finances, /mas]`), y estaba escrito así a propósito en tres lugares: el docblock de `panelNavMode`, un caso de test y el documento de la pila medida. Ahora ese gesto **sube un nivel** y la pila queda en `[Inicio, Más]`. El docblock de `panelNavMode` se actualizó para apuntar a quién lo resuelve, en vez de seguir anunciándolo como trabajo futuro.
- **El hecho que la política de rutas no podía expresar, expresado.** `from = '/finances'`, `to = '/mas'` significa dos cosas opuestas según qué haya debajo: si el dueño llegó por Más hay que subir, y si entró **directo** a Finanzas ese mismo retroceso **lo expulsa del sitio**. La marca distingue los dos casos, y toda la ingeniería del plan existe para que cuando el hecho no esté, la degradación sea "una pila más larga" y nunca "el dueño afuera": un barrido de 9 secciones × 5 destinos con el hecho en falso exige que la decisión devuelva **exactamente** lo que devolvía antes.
- **El caso degenerado resuelto con la forma medida, no con la intuitiva.** Si el destino de la barra es justo la ruta que quedaría debajo (`Inicio → Turnos → Más → Finanzas → Turnos`), reemplazar dejaría `[…, Turnos, Turnos]` — dos entradas idénticas pegadas, o sea un atrás que no hace nada visible. Se retrocede **dos veces y no se navega**, que es lo que la sonda midió en E-5. Es también el motivo por el que la marca guarda la **ruta** y no un booleano: con un booleano la rama no se puede detectar.
- **Un invariante barrido en vez de recorridos enumerados a mano.** El criterio 2 se afirma como propiedad de la pila resultante —`/mas` no queda inmediatamente debajo, y nunca hay dos entradas idénticas adyacentes— sobre **9 secciones × 4 destinos** en las pilas de dos y de tres escalones. En la de tres el atrás cae en la sección de la barra desde la que se abrió Más, que es el mismo principio con el que el dueño resolvió D-02.
- **Desktop no se entera por construcción, sin un chequeo de viewport.** El hecho se computa comparando la marca contra la ruta de Más, y en escritorio nada navega a Más ⇒ la marca nunca dice Más ⇒ la decisión cae en las ramas de siempre. Hay un caso que lo clava con los 14 destinos del sidebar, y otro que exige **cero** rama en la pantalla Más y en el sidebar.
- **Cero affordance visible nuevo (D-04), con candado.** El activo se sigue decidiendo por igualdad literal de pathname en los mismos tres ternarios y el único bloque del indicador. Si mañana alguien ilumina Más estando en su rama, el caso se pone rojo y la discusión vuelve al gate de diseño — que es exactamente lo que D-04 decidió.
- **Los cuatro intocables, intocados.** `lib/overlay-history.ts`, `lib/dirty-history.ts`, `components/dashboard/sidebar.tsx` y `app/(dashboard)/mas/mas-client.tsx` quedaron con `git status` vacío, y las ramas nuevas los alcanzan **por consumo**. Cero paquetes nuevos, cero DOM simulado, y la config del runner sin tocar.

## Task Commits

Cada task se commiteó por separado. Los dos primeros son TDD (test → feat):

1. **Task 1: La marca de la rama, la decisión pura y la hermana de consumo**
   - `7792980` — `test(03-02)`: 22 casos nuevos (84 → 106). **RED medido:** 19 casos rojos por `TypeError: panelUnderState / panelUnderRoute / applyPanelUnder / panelBranchPlan is not a function`.
   - `00cad80` — `feat(03-02)`: la marca, la escritura, la decisión y la hermana. **GREEN:** 106/106.
2. **Task 2: El ejecutor de dos pasos y el hook que marca la entrada después del commit**
   - `64e7980` — `test(03-02)`: `test/panel-branch.test.ts`, 19 casos. **RED declarado:** `Cannot find module '@/lib/panel-branch'`.
   - `fc7beec` — `feat(03-02)`: `lib/panel-branch.ts`. **GREEN:** 19/19.
3. **Task 3: El paso 3 del `onNavigate` de la barra, y los dos candados del cableado** — `2debb94` (`feat`)

**Plan metadata:** ver el commit `docs(03-02)` que acompaña a este archivo.

**Commits medidos:** `git rev-list --count 30ba73a..HEAD` = **5** (base `plan_head_before: 30ba73a`).

## Files Created/Modified

- `lib/panel-branch.ts` *(creado, 16.256 bytes)* — El ejecutor de dos pasos y el hook. Sin directiva de frontera de cliente y **sin importar el router de Next**: el pathname y la navegación entran como parámetros, que es lo que lo deja vivir en `lib/`. Contiene `branchSecondStep` (la decisión del segundo paso, con el degenerado), `runBranchNavigation` (listener de disparo único enganchado en el gesto, desenganchado si el consumo se niega), `nextBranchId`, `branchMarkDecision` y `usePanelBranch`.
- `test/panel-branch.test.ts` *(creado)* — 19 casos en el carril puro, contra un `window` mínimo stubeado (lo único que el ejecutor toca: `history.state`, `history.back`, `location.pathname` y el par de enganche de listeners). Declara explícitamente qué **no** cubre: el orden de efectos de React contra el del router.
- `lib/panel-history.ts` *(modificado)* — `PanelUnderState` / `panelUnderState` / `panelUnderRoute` (la marca, con el molde de la de subsección), `applyPanelUnder` (la escritura), `PanelBranchPlan` + `panelBranchPlan` (la decisión), `consumeOwnedBranchEntry` (la hermana). Más dos docblocks: el **por qué no** de `isForeignOwnedEntry`, y la actualización del límite declarado de `panelNavMode`.
- `lib/panel-history.test.ts` *(modificado)* — 22 casos nuevos (84 → 106), incluido el simulador de pila extendido con los dos modos nuevos y el barrido del invariante.
- `components/dashboard/panel-bottom-nav.tsx` *(modificado)* — El paso 3 del `onNavigate` (con los pasos 1 y 2 byte por byte como estaban), el consumo del hook una sola vez, el router pasado como callback, y tres bloques de comentario nuevos en el encabezado (por qué el toqueteo de la pila no vive acá, y por qué nada cambia visualmente).
- `test/panel-nav-chrome.test.ts` *(modificado)* — Bloque `3b` con 5 casos nuevos (45 → 50): el cableado del paso 3, la guarda positiva del hook, el criterio 6 por componente y D-04.

## Resultados de los gates, con los números medidos

### Task 1 — cuatro gates

| Gate | Medido |
|---|---|
| Región del módulo | marca en CÓDIGO (sin comentarios) = **4** (≥4) · marca dentro del predicado de la regla 0 = **0** (0) · hermana = **1** · la vieja sigue viva = **1** · decisión = **1** · escritura = **1** · recortes sanos: hermana **7** líneas, decisión **27** líneas · guardas de la hermana: ajena **1**, propia **1** · la decisión toca `window` = **0** · miembros nuevos del tipo = **3** |
| Región de la escritura | recorte **19** líneas, última línea `}` · llamada medida: `replaceState(panelUnderState(from), '')` · forma de dos argumentos = **1** · tercer argumento = **0** · propaga el estado actual = **0** · consulta la política = **1** · respeta la regla 0 = **1** |
| Suite del módulo | rc **0** · **106** casos (piso 97; base del plan 03-01 medida hoy: 84) |
| No-regresión de v0.30 | rc **0** · **5/5** suites verdes (**133** casos) · `tsc` sin una línea `error TS` · intocables sin tocar: **vacío** |

### Task 2 — tres gates

| Gate | Medido |
|---|---|
| Forma del módulo | directiva de frontera = **0** · imports del router de Next = **0** · imports que no son React ni un módulo de `lib/` = **ninguno** · listener de disparo único = **1** · consume el módulo de política = **1** · **16.256** bytes (piso 2.000) |
| Suite del ejecutor | rc **0** · **19** casos (piso 12) · DOM simulado o testing-library = **0** |
| Tipos y lint | `tsc` sin errores · `eslint` rc **0** · `package.json` / lock / config del runner sin tocar: **vacío** |

### Task 3 — cinco gates

| Gate | Medido |
|---|---|
| El candado del chrome | rc **0** · **50** casos (piso 48; base medida hoy: 45) |
| Región del `onNavigate` | secuencia = `requestNavigation\|consumeOwnedPanelEntry\|handleNavigate\|` (exactamente la esperada) · prevenciones = **3** · importa el módulo de la rama = **2** · usa el router = **2** |
| Las ocho suites | rc **0** · **8/8** archivos verdes (**283** casos) |
| Tipos, lint e intocables | `tsc` sin errores · `eslint` rc **0** · intocables sin tocar: **vacío** |
| La sonda CDP | rc **0** — **7** escenarios medidos, **7** coinciden, **0** no coinciden. Supuestos cerrados: A4 (E-1/E-2/E-3/E-7), A5 (E-4), A6 (E-5), A7 (E-6). El turno de pantalla estaba libre: **no hubo espera** |

### Verificación de cierre del plan

| # | Criterio | Medido |
|---|---|---|
| 1 | Las nueve suites puras verdes | rc **0** · **9/9** archivos · **333** casos |
| 2 | La pila real, re-medida | `con-turno.mjs` + sonda ⇒ rc **0**, 7/7 coincidencias |
| 3 | `tsc` limpio (con `./node_modules/.bin/tsc`, nunca `npx tsc`) | cero líneas `error TS` fuera de `.next/` |
| 4 | Los cuatro intocables sin tocar | `git status --porcelain` **vacío** sobre los cuatro |
| 5 | Cero paquetes nuevos | `git status --porcelain` **vacío** sobre `package.json`, el lock y `vitest.config.mts` |
| 6 | eslint sin hallazgos nuevos | rc **0** sobre los cuatro archivos tocados; los tres preexistentes conocidos siguen fuera de estos archivos |
| — | **Carril puro completo** (control extra, no pedido por el plan) | **76** archivos (piso 75, +1 = la suite nueva) · **1463** pasados + **3** expected-fail (piso 1417+3; +46 = 22+19+5) · rc **0** |

## Decisions Made

Las nueve decisiones están en el frontmatter (`key-decisions`). Las tres que más condicionan lo que viene:

1. **La marca guarda la ruta, no un booleano.** No es defensivo: es lo único con lo que el caso degenerado se puede detectar, y está medido en E-5. La Phase 4 hereda esa forma.
2. **El quinto miembro del tipo del plan (`'none'`) se declara ahora aunque nadie lo devuelva todavía.** Lo produce el plan 03-03. Vive en el tipo a propósito: si *nada* fuera un resultado posible de la decisión de navegación y viviera fuera del tipo, el chequeo de exhaustividad del plan 03-04 **no lo vería** — que es la clase de hueco silencioso que esta fase viene a cerrar.
3. **La degradación por marca perdida se acepta y se escribe, no se parchea.** Preservar la clave en `applyPanelView` sería una línea, pero toca el ejecutor que v0.30 dejó auditado con un gate de código y abre la pregunta de si un estado propio conservado reintroduce la trampa de la rama temprana del parche de Next. Si la Phase 4 lo necesita para los tabs, entra ahí con su propia medición.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] El límite declarado en el docblock de `panelNavMode` quedaba mintiendo**

- **Found during:** Task 1 (la marca, la decisión y la hermana)
- **Issue:** El docblock de `panelNavMode` abría un bloque "⚠ **LO QUE ESTA FUNCIÓN TODAVÍA NO HACE, y no es un olvido**" que decía textualmente que D-03 "es trabajo del plan 03-02" y que "mientras tanto ese gesto **apila**". Este plan **es** el 03-02: dejarlo así convertía una advertencia load-bearing en una afirmación falsa, y la próxima persona que leyera el módulo buscaría el trabajo pendiente en un plan ya cerrado. El `<action>` del task no lo pedía.
- **Fix:** Se reescribió el bloque: sigue explicando por qué la regla de rutas **no puede** decidir D-03 (que es la razón de ser de todo el plan) y ahora apunta a quién lo resuelve (`panelBranchPlan`, que la **extiende** en vez de reemplazarla) y re-encuadra el `push` como lo que es: la **degradación segura** de la fase, no una tarea pendiente.
- **Files modified:** `lib/panel-history.ts` (sólo el docblock; el cuerpo de la función y la secuencia de sus seis ramas quedaron byte por byte como estaban)
- **Verification:** el gate de secuencia de ramas del plan 03-01 sigue verde (está en las 9 suites, rc 0), y el caso `tocar Más estando DENTRO de su rama todavía APILA` sigue pasando porque afirma el comportamiento de `panelNavMode`, que no cambió
- **Committed in:** `00cad80` (commit de Task 1)

**2. [Rule 2 - Missing Critical] El invariante de T-03-06 ("un solo dueño por entrada") estaba esperado pero no exigido**

- **Found during:** Task 2 (el ejecutor y el hook)
- **Issue:** El `<behavior>` pedía un id de instancia que no se repita ("molde del id de los otros dos módulos") y el registro de amenazas lista `T-03-06` como **high** con la mitigación *"el hook se instancia una sola vez"*. Implementado literalmente, `nextBranchId()` quedaba como un valor que nadie lee: un id que no gobierna nada no mitiga nada, y el invariante seguía siendo una **expectativa** (la barra vive en el layout y no se re-monta) en vez de un candado. Dos dueños por la misma entrada descuadran el conteo de retrocesos y dejan un atrás muerto o uno de más.
- **Fix:** Se agregó un dueño a nivel de módulo (`instanciaDuena`): la instancia lo toma en un efecto declarado **antes** del de marcado —React corre los efectos de un commit en orden de declaración— y lo suelta al desmontarse. Sólo la dueña escribe la marca. **Cae del lado seguro por construcción:** una instancia que no es la dueña simplemente no marca, y sin marca la política empuja o reemplaza, nunca retrocede. El gesto (`handleNavigate`) **no** se gatea, para que una sorpresa de orden no pueda romper la navegación.
- **Files modified:** `lib/panel-branch.ts`
- **Verification:** `test/panel-branch.test.ts#el id de instancia no se repite` + el gate del criterio 6 (`usePanelBranch` cuenta **0** en Más y en el sidebar ⇒ la barra es la única instancia) + las 9 suites verdes
- **Committed in:** `fc7beec` (commit de Task 2)

**3. [Rule 2 - Missing Critical] El segundo retroceso del degenerado podía quedar sin salida**

- **Found during:** Task 2 (el ejecutor)
- **Issue:** El `<action>` decía que cuando el segundo paso dice `second-consume` se retrocede una segunda vez y no se navega. Pero ese segundo retroceso pasa por las **dos guardas** de `consumeOwnedBranchEntry`, así que puede negarse —por ejemplo si la entrada de Más lleva además la marca de un overlay—. Sin una salida, el gesto del dueño quedaba **muerto**: ni retroceso ni navegación, y el toque no hace nada.
- **Fix:** Si el segundo consumo se niega, se navega con reemplazo. Es la misma degradación segura del resto de la cadena, y es la disciplina de "guarda repetida" aplicada hasta el final en vez de supuesta.
- **Files modified:** `lib/panel-branch.ts`
- **Verification:** `test/panel-branch.test.ts#el segundo retroceso del degenerado TAMBIÉN pasa por las dos guardas` (mide: `back` llamado **1** vez y la navegación **1** vez, en vez de cero y cero)
- **Committed in:** `fc7beec` (commit de Task 2)

---

**Total deviations:** 3 auto-fixed (3 × Rule 2 — missing critical)
**Impact on plan:** Ninguna agrega alcance. Las tres cierran un hueco que el plan nombraba sin exigir: una advertencia que había quedado falsa, una amenaza `high` cuya mitigación estaba supuesta, y una rama del ejecutor sin salida. Las tres caen del lado seguro —ninguna puede producir un retroceso de más— y las tres tienen un caso de test o un gate que las mide. Cero paquetes nuevos, cero archivos fuera de los seis del plan, cero intocables tocados.

## Issues Encountered

- **El RED de Task 2 es un "módulo no encontrado", no un rojo de aserción — y es declarado.** El plan 03-01 estableció que lo nuevo se afirme por **namespace** y no por import nombrado, justamente para que el rojo venga de la aserción y no del loader. Para un módulo **nuevo** eso es imposible: no hay forma de tener un rojo de aserción antes de que el archivo exista. El rojo medido (`Cannot find module '@/lib/panel-branch'`) dice **exactamente** qué falta y no se confunde con "el archivo no compila", así que se aceptó y quedó escrito en el mensaje del commit. El RED de Task 1, en cambio, sí es de aserción (`TypeError: … is not a function`), porque el módulo ya existía.
- **Un heredoc de bash se rompió al anexar los casos de Task 1** (`unexpected EOF while looking for matching`). Se resolvió escribiendo el bloque a un archivo del scratchpad y anexándolo con `cat`. Sin efecto sobre el contenido; queda anotado porque es la segunda vez que esta máquina rechaza un heredoc largo.
- **El turno de pantalla estaba libre.** La sonda corrió sin esperar (la corrida del plan 03-01 había esperado ~21 minutos). No es un cambio de comportamiento del instrumento: es que no había otro proyecto con el turno tomado.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Listo para el plan 03-03** (el sentinel de salida de MOB-05):

- El **quinto miembro del tipo del plan (`'none'`) ya está declarado** y `runBranchNavigation` ya lo ejecuta (se hace cargo sin tocar la pila). 03-03 sólo tiene que **producirlo** cuando el sentinel esté arriba y el destino sea la ruta actual: no necesita tocar el tipo ni el ejecutor.
- La medición que le ahorra trabajo ya está hecha (**E-6**): estar parado sobre el sentinel **cuenta como armado** y el retroceso que lo consume **es** el primer intento de salida ⇒ no hace falta pisarlo con un reemplazo.
- ⚠ **La marca nueva y el sentinel de salida comparten la pila.** `frjUnder` es una clave nueva y los otros dueños la ignoran, pero 03-03 va a agregar un **cuarto** escritor (`frjExit`, según la sonda): tiene que entrar con la misma disciplina —su propia clave, su propia marca re-verificada antes de cada retroceso— y decidir explícitamente si su marca entra o no en `isForeignOwnedEntry`. Para `frjUnder` la respuesta fue **no** (es nuestra, del mismo módulo); para `frjExit` la respuesta probablemente también sea no, por el mismo motivo, pero **tiene que decidirse y medirse**, no heredarse.
- La **constante única de MOB-05** (`PANEL_EXIT_HINT_MS = 2000`, duración visible = ventana lógica) sigue siendo trabajo de 03-03: este plan no la tocó.

**Lo que queda abierto, declarado y ruteado a la UAT del plan 03-04 (no es deuda oculta):**

- **A1** — el orden del efecto que escribe la marca contra la escritura del router de Next. El camino de código está verificado; el orden no. **Si estuviera mal, D-03 y el criterio 2 degradan a empujar EN SILENCIO.** Está escrito en el docblock del efecto, no al pie.
- **A2** — que no haya otro commit del router en vuelo cuando se escribe la marca.
- **A11** — Safari/iOS y Chrome Android **reales**: todo lo medido en este repo sobre el retroceso fue Chrome de escritorio headless.
- **El riesgo de D-04, declarado y no negado:** dos pantallas que se ven igual se comportan distinto (en Turnos el atrás cae en Inicio; en Finanzas cae en Más) y nada en pantalla lo dice. Es un ítem explícito de la UAT: si el dueño se pierde, es un hallazgo con evidencia y el affordance se agrega después **sabiendo** que hacía falta.

**El recordatorio de método, que vale más que los números de arriba:** el modo de falla de esta fase es **silencioso** y no lo ve `tsc`, ni la suite, ni el build. El único criterio que cierra la fase es la UAT en un teléfono real.

## Self-Check: PASSED

- Los **6** archivos declarados en `key-files` existen en disco (`[ -f ]` sobre los 2 creados y los 4 modificados).
- Los **5** commits declarados existen en `git log --oneline --all`: `7792980`, `00cad80`, `64e7980`, `fc7beec`, `2debb94`.
- Los `<acceptance_criteria>` de los tres tasks se re-corrieron al cierre: **12/12** gates `<automated>` en verde, con los números en la sección de gates.
- La `<verification>` del plan se re-corrió entera: 9/9 suites puras (333 casos), sonda 7/7 con rc 0, `tsc` limpio, 4 intocables sin tocar, cero paquetes nuevos, `eslint` rc 0.
- **Ningún stub, ningún `TODO`/`FIXME` nuevo, ningún test skipeado y ningún `<verify>` sin correr.** Lo que queda abierto (A1/A2/A11 y el riesgo de D-04) estaba **declarado por el plan** como `verification: backstop` y está ruteado a la UAT del plan 03-04 — no es deuda introducida acá.

---
*Phase: 03-la-pol-tica-de-atr-s-de-un-nivel-a-dos*
*Completed: 2026-10-14*
