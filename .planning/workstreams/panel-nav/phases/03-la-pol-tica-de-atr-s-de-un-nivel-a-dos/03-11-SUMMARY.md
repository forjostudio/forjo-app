---
phase: "03-la-pol-tica-de-atr-s-de-un-nivel-a-dos"
plan: "11"
subsystem: ui
tags: [mobile-nav, back-button, history-stack, g3-1, panel-branch, cdp-probe, tdd, blocking-human]

# Dependency graph
requires:
  - phase: "03-la-pol-tica-de-atr-s-de-un-nivel-a-dos (plan 03-09)"
    provides: "la regla `-1c` de `G2-1` (sección → raíz es un retroceso) y el canal de propagación del colapso con su consumidor único — el arreglo de este plan es un SEGUNDO PRODUCTOR sobre ese canal, sin tocar ninguna de las dos funciones de política"
  - phase: "03-la-pol-tica-de-atr-s-de-un-nivel-a-dos (plan 03-05)"
    provides: "`BranchMarkRequest`, `pedirMarcaPropagada` y `applyBranchMarkRequest` — el canal que ya tenía exactamente la forma que esta propagación necesitaba (lo llena quien LEYÓ, lo consume uno, escribe por el escritor único, descarta siempre, no inventa rutas)"
  - phase: "03-la-pol-tica-de-atr-s-de-un-nivel-a-dos (plan 03-10 / la ronda 3 de la UAT)"
    provides: "`G3-1` medido en el teléfono —el recorrido 1.1 falló en el primer intento— y el recorrido 1.2 del 2026-10-28, que PASÓ y descartó la hipótesis rival: el bundle era el nuevo y la regla sí dispara"
provides:
  - "`branchCarryMark` (`lib/panel-branch.ts`): el segundo productor del canal de propagación, con sus tres reglas en orden y la del valor leído última — la marca de la rama VIAJA por encima del `replace`"
  - "el cableado en `handleNavigate`, sobre el MISMO `window.history.state` que ya se leía para los tres hechos: una sola lectura por gesto, y el único momento en que ese valor existe"
  - "el docblock del canal con sus DOS productores y la disciplina que comparten escrita como invariante: *sólo llena este canal quien LEYÓ la entrada de abajo*"
  - "`panelNavMode` (6 retornos / 5 ramas) y `panelBranchPlan` (6 reglas / 2 retrocesos / 2 caídas) INTACTAS, medidas por recorte: el arreglo es aditivo"
  - "E-17 y E-18 en la sonda CDP: la CADENA de reemplazos cruzada con la regla `-1c`, con el sentinel de salida y con la rama de Más — la sonda pasa a DIECIOCHO escenarios"
  - "el residuo del camino del guard de cambios sin guardar declarado en los CUATRO lugares donde se puede leer, con fecha 2026-10-28"
  - "MOB-04 precisado por tercera vez (no contradicho) con los tres no-defectos re-afirmados, `G3-1` anotado como arreglado-y-sin-verificar, y el motivo del recorrido 1.1 del guion corregido a la causa real"
affects:
  - "el cierre de la Phase 3: queda condicionado a que la ronda 3 se RE-CORRA DESDE EL PRINCIPIO y pase en los DOS motores. MOB-04 y MOB-05 necesitan Android e iPhone; MOB-06 le debe sólo iPhone más la parte de overlay"
  - "Phase 4 (MOB-08/09, los tabs profundos): heredan el canal con dos productores y el enunciado *un replace no cambia lo que quedó debajo*"

actuals:
  tokens: 132217
  tasks: 3
  commits: 6
plan_head_before: 8460f793346ff28cc782608fedd3d62799dce5a4

tech-stack:
  added: []
  patterns:
    - "Una marca de historial que tiene que sobrevivir un `replace` se PROPAGA (viaja el valor que se LEYÓ) y no se DERIVA del par de rutas: el par dice `replace` y la derivación daría `null`, que es justo el bug. El enunciado es de la pila —un reemplazo no cambia lo que quedó debajo— y no del síntoma"
    - "Un segundo PRODUCTOR sobre un canal que ya existe está en el grano; un segundo DIALECTO de la misma regla no. El canal se amplía escribiendo la condición que los dos productores comparten como invariante (*sólo llena este canal quien LEYÓ la entrada de abajo*) y dejando el consumidor en UNO"
    - "El valor que una propagación necesita se lee ANTES de la navegación y en el gesto, que es el único lugar que ya lo tiene leído: después del `replace` del `<Link>` el valor no existe más. Dos lecturas del estado en el mismo gesto son dos verdades que pueden diferir"
    - "Sin valor leído no se inventa ninguno: la abstención se MIDE (la primitiva devuelve si escribió) en vez de prometerse. Quedarse sin marca deja una pila un escalón más larga; una marca falsa deja al dueño fuera del sitio"
    - "Un escenario de sonda que mide marcas POR SEPARADO no ve un defecto de CADENA: el gate cuenta ≥2 reemplazos del `<Link>` ADENTRO de la región de cada escenario nuevo, porque con uno se mide lo que E-16 mitad A ya medía"
    - "El cableado de un hook que no se puede montar se audita por REGIÓN DE FUENTE recortada por la firma exacta, y el caso se PRUEBA EN ROJO comentando la llamada: un caso que mide la función aislada queda verde sin el arreglo"
    - "El ancla de cierre de un recorte es la llave SOLA en su línea (`\\n}\\n`): con `\\n}` el recorte se trunca en el `}: {` del cierre de la firma con parámetro-objeto y el contador mide cero estando en verde (reproducido en este plan, dos veces, antes de corregirlo)"

key-files:
  created:
    - ".planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-11-SUMMARY.md"
  modified:
    - "lib/panel-branch.ts"
    - "lib/panel-history.ts"
    - "test/panel-branch.test.ts"
    - ".planning/debug/probes/panel-back-stack.mjs"
    - ".planning/debug/pila-de-dos-niveles-medida.md"
    - ".planning/workstreams/panel-nav/REQUIREMENTS.md"
    - ".planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-UAT-2.md"
    - ".planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-UAT-GUION-3.md"
    - ".planning/WINDOWS.md"

key-decisions:
  - "El arreglo de `G3-1` es un SEGUNDO PRODUCTOR del canal de propagación y NO un cambio en la política: `panelNavMode` y `panelBranchPlan` quedaron intactas (medidas por recorte: 6 retornos / 5 ramas y 6 reglas / 2 retrocesos / 2 caídas). La regla `-1c` ya era correcta y estaba desplegada — lo que faltaba era que el hecho que lee ESTUVIERA AHÍ"
  - "El productor vive en `lib/panel-branch.ts` y se cuelga del GESTO, no del ejecutor: el `replace` lo ejecuta el `<Link>` con su prefetch y su transición (por eso `runBranchNavigation` devuelve `false` para `push`/`replace`), y el gesto es el único lugar que ya leyó el estado — una sola lectura por gesto"
  - "La propagación se escribió GENERAL (viaja cualquier ruta leída) y no acotada a *la marca dice la raíz*: la alternativa acotada dejaría la misma regla significando dos cosas según el valor de la marca. El costo quedó MEDIDO en E-18 y es una mejora: dentro de la rama de Más, D-03 ahora se sostiene por encima del reemplazo (`up` contra `push`)"
  - "La regla del valor leído va ÚLTIMA de las tres, para que el caso *destino igual* y el caso *no es un reemplazo* se resuelvan por SU propio motivo y no por casualidad de que la marca estuviera ausente. El orden se audita en la fuente, no sólo por valor de retorno"
  - "El caso de `replace` con la MISMA ruta no pide nada, y tiene nombre propio: ahí el pathname no cambia, el efecto de marcado NO vuelve a correr y el pedido sobreviviría a una navegación que no es la que lo pidió — una marca rancia sobre una entrada ajena, el mismo bug del otro lado"
  - "El residuo del camino del guard se DECLARA en vez de cablearse: el guard ejecuta su propio reemplazo y no pasa por `handleNavigate`, así que en una pantalla sucia la marca se sigue perdiendo y el gesto siguiente queda un escalón más largo — nunca una expulsión. Cablearlo exigiría una SEGUNDA lectura del estado en el mismo gesto más un parámetro nuevo en el ejecutor compartido"
  - "MOB-04, MOB-05 y MOB-06 siguen SIN marcar y `requirements.mark-complete` NO se corrió: los marca el teléfono, no la suite verde ni la sonda en dieciocho. La ronda 3 se re-corre DESDE EL PRINCIPIO porque el arreglo cambia la forma de la pila"

patterns-established:
  - "Prueba en rojo del CABLEADO por mutación reversible con verificación por CHECKSUM del archivo (y no contra el repositorio, que en ese punto todavía incluye el trabajo sin commitear): se comenta la llamada, se ve caer la suite, se restaura y se compara la huella antes/después"
  - "Prueba en rojo de un ESCENARIO DE SONDA mutando la primitiva que el escenario depende (la propagación a no-op): acá el rojo sale como *la sonda no pudo completar la medición* con rc 1 —el retroceso guardado NEGÁNDOSE— en vez de como `FALLA`, y eso también se escribe, porque un gate que cuenta `FALLA` no vería esa forma de rojo"

requirements-completed: []

coverage:
  - id: D1
    description: "`branchCarryMark` con sus tres reglas en orden (no es un reemplazo ⇒ nada · destino igual ⇒ nada · sin valor leído ⇒ NO se inventa ninguno) y el camino de punta a punta en una sola corrida, con el paso de la PÉRDIDA adentro: el gesto deja el pedido con la ruta leída, el router pisa la entrada y el consumidor la escribe por el escritor único"
    requirement: "MOB-04"
    verification:
      - kind: unit
        ref: "test/panel-branch.test.ts#G3-1 — la marca VIAJA por encima del `replace` (el camino entero, una sola corrida) · 15 casos nuevos; `npx vitest run --project pure test/panel-branch.test.ts lib/panel-history.test.ts` ⇒ rc 0 · 2 archivos · 288 pasados (base medida 273)"
        status: pass
      - kind: command
        ref: "prueba en ROJO del cableado: con la llamada al productor comentada ⇒ rc 1 · 1 caso fallado · checksum del módulo idéntico antes y después de la mutación"
        status: pass
    human_judgment: false
  - id: D2
    description: "El canal con DOS productores y UN consumidor, los dos nombrados en su docblock con la disciplina que comparten; `panelNavMode` y `panelBranchPlan` intactas; cero claves nuevas en la pila; cero miembros nuevos en el plan de rama; los dos componentes consumidores sin tocar"
    requirement: "MOB-06"
    verification:
      - kind: command
        ref: "gate de fuente: productores del canal=4 (1 declaración + 2 del colapso + 1 del gesto) · consumidor=2 · el hecho de -1c textual=1 · total del identificador=1 · propagaciones del state=0"
        status: pass
      - kind: command
        ref: "gate de recorte de política: panelNavMode retornos=6 ramas=5 · panelBranchPlan reglas=6 retrocesos=2 caídas a la política de rutas=2 (los cinco iguales a la base medida hoy)"
        status: pass
      - kind: unit
        ref: "test/panel-branch.test.ts#el canal tiene DOS productores y UN consumidor / #`panelNavMode` y `panelBranchPlan` quedan INTACTAS / #G3-1 — el arreglo no agregó una clave nueva a la pila ni un miembro nuevo al plan de rama"
        status: pass
    human_judgment: false
  - id: D3
    description: "E-17: `G3-1` medido como números con TRES mitades en la misma corrida — la forma vieja (marca perdida, hecho falso, plan `push`, profundidad 2→3, cero hash en el camino), la nueva (la marca sobrevive la CADENA entera, plan `up`, profundidad 2→1, armado `armar`, hash base, un solo par adyacente) y la de la marca que nunca se leyó (la propagación se ABSTIENE) — más el contraste explícito `['push','up']` / `[3,1]`"
    requirement: "MOB-04"
    verification:
      - kind: integration
        ref: "node scripts/con-turno.mjs node .planning/debug/probes/panel-back-stack.mjs ⇒ rc 0 · escenarios medidos 18 · coinciden 18 · no coinciden 0 · `OK  E-17` y `OK  E-18` presentes"
        status: pass
      - kind: command
        ref: "gate estructural: escenarios=18 · primitivas nuevas=2 · E-17 región=209 líneas con 5 reemplazos del `<Link>` · E-18 región=175 líneas con 2 — es una CADENA, no un reemplazo suelto"
        status: pass
      - kind: command
        ref: "prueba en ROJO: con `propagarLaMarca` mutada a no-op ⇒ rc 1, la sonda no completa la medición y el retroceso guardado se NIEGA (*la entrada de arriba NO lleva nuestra marca*); checksum de la sonda idéntico antes y después"
        status: pass
    human_judgment: false
  - id: D4
    description: "E-18: dentro de la rama de Más la propagación NO le roba el gesto al colapso (sigue siendo `collapse-then-replace`, cero pares adyacentes), D-03 se sostiene por encima del reemplazo (`up` con la propagación contra `push` sin ella) y el LÍMITE DECLARADO de D-02 sigue empujando con el atrás cayendo en Más"
    requirement: "MOB-04"
    verification:
      - kind: integration
        ref: "`OK  E-18` en la corrida de 18/18: mitad_A_plan_con_la_propagacion=up · mitad_A_plan_sin_la_propagacion=push · mitad_B_plan=collapse-then-replace · mitad_B_pares_adyacentes=0 · limite_plan=push · limite_atras_cae_en=/mas"
        status: pass
    human_judgment: false
  - id: D5
    description: "Los cuatro documentos diciendo lo mismo que el código: MOB-04 precisado con fecha y con los tres no-defectos re-afirmados, el residuo nuevo declarado en los cuatro lugares, `G3-1` anotado como arreglado-y-sin-verificar, el motivo del recorrido 1.1 corregido, y la entrada 18 del registro agregada POR EL CLI con tabla y JSON sincronizados"
    verification:
      - kind: command
        ref: "gate de documentos: MOB-04 con la fecha nueva=2 · E-17 citado=2 · residuos=4 · límite de tres escalones=2 · etiquetas sin tilde intactas=[4/4] · los tres sin marcar=2 · UAT anotada=[2/1] · el guion cita E-17=1 · bloques del guion intactos=3"
        status: pass
      - kind: command
        ref: "gate del registro: total_count=18 · filas de la tabla=18 · entradas del JSON=18 · entrada 18=1 · menciona el guard=6 · con su fecha=4 · `windows status --ws panel-nav` rc 0"
        status: pass
    human_judgment: false
  - id: D6
    description: "Cero regresión de los gates de la fase: la suite completa, los tipos y el lint de lo tocado, con los tres intocables y los dos componentes consumidores sin modificar"
    verification:
      - kind: command
        ref: "npx vitest run ⇒ rc 0 · 110 archivos · 1949 pasados + 4 expected-fail + 1 skipped (base medida: 1934 pasados + 4 expected-fail sobre 110 archivos)"
        status: pass
      - kind: command
        ref: "./node_modules/.bin/tsc --noEmit ⇒ 0 errores fuera de .next/ · ./node_modules/.bin/eslint lib/panel-branch.ts lib/panel-history.ts test/panel-branch.test.ts ⇒ rc 0 · `git status --porcelain` vacío para overlay-history, dirty-history, con-turno.mjs, panel-bottom-nav y unsaved-changes-guard"
        status: pass
    human_judgment: false
  - id: D7
    description: "La ronda 3 de la UAT RE-CORRIDA DESDE EL PRINCIPIO en los dos motores reales: los ocho recorridos de Android Chrome y los 21 de iPhone Safari, con pestaña nueva por recorrido y cada ítem anotado pasa / falla (textual) / no corrible (con el motivo) en `03-UAT-2.md`, con fecha y motor"
    requirement: "MOB-05"
    verification: []
    human_judgment: true
    rationale: "PENDIENTE DE LA PERSONA — es el checkpoint de bloqueo humano de este plan (`gate=\"blocking-human\"`) y NO se auto-aprobó. Nada de lo medido acá lo cierra: la ronda 1 llegó con la sonda en 8/8 y encontró cinco fallos, la 2 con 13/13 y encontró `G2-1`, la 3 con 16/16 y encontró `G3-1` en el PRIMER recorrido. Lo que cierra son los tres supuestos que ninguna sonda puede cerrar: A1 (el orden del efecto que escribe la marca contra la escritura del router), A2 (que no haya otro commit del router en vuelo) y A11 (los dos motores reales). El modo de falla de esta fase es silencioso y no lo ve `tsc`, ni la suite, ni el build, ni la sonda"

# Metrics
duration: "28 min"
completed: 2026-10-28
status: complete
---

# Phase 03 Plan 11: La marca de la rama viaja por encima del `replace` Summary

**La marca de la rama ahora SOBREVIVE la cadena de `replace` de sección a sección —el gesto lee la ruta que quedó debajo antes de que el `<Link>` reemplace y la propaga por el canal que ya existía—, con `panelNavMode` y `panelBranchPlan` intactas, dos escenarios de sonda que miden la CADENA cruzada con el sentinel y con la rama de Más (18/18), y la ronda 3 devuelta al dueño en un checkpoint que no se puede auto-aprobar.**

## Performance

- **Duration:** 28 min
- **Started:** 2026-10-28T15:36:00Z (aprox.)
- **Completed:** 2026-10-28T16:05:00Z
- **Tasks:** 3 de 4 (el task 4 es el checkpoint de bloqueo humano, y PARÓ ahí a propósito)
- **Files modified:** 9

## Accomplishments

- **`G3-1` cerrado en el código.** `branchCarryMark` —el **segundo** productor del canal de propagación— deja el pedido con la ruta que **se leyó** de la entrada de arriba, el router pisa la entrada con su propio state, y el consumidor único la escribe en la entrada nueva por el escritor único. Parado en la última sección de un paseo, el hecho de la regla `-1c` vuelve a ser **verdadero** ⇒ tocar Inicio **retrocede** en vez de empujar.
- **El mecanismo se midió ANTES de escribir el arreglo** (paso 0 del plan): el caso de punta a punta se dejó en rojo primero —`1 failed | 128 passed (129)`, exit 1, `AssertionError: expected 'undefined' to be 'function'`— y el rojo apareció **por el motivo esperado**, así que el mecanismo era el que el plan leyó.
- **El arreglo es aditivo y está medido como tal:** `panelNavMode` sigue en 6 retornos / 5 ramas y `panelBranchPlan` en 6 reglas / 2 retrocesos / 2 caídas, recortadas y contadas. Cero claves nuevas en la pila, cero miembros nuevos en el plan de rama, cero cambios en los dos componentes consumidores.
- **La sonda pasa a DIECIOCHO escenarios y por primera vez mide una CADENA.** `E-17` deja `G3-1` como números con tres mitades en la misma corrida y el contraste explícito (`['push','up']` de plan y `[3,1]` de profundidad final: la única diferencia entre los dos recorridos del dueño es **un** reemplazo). `E-18` afirma que dentro de la rama de Más la propagación **no** le roba el gesto al colapso, que **D-03 se sostiene por encima del reemplazo** y que el **límite declarado** de D-02 sigue empujando.
- **Los tres gates nuevos, probados en rojo** —el del cableado comentando la llamada (rc 1, 1 caso fallado, checksum idéntico tras restaurar), el de la sonda mutando la propagación a no-op (rc 1, el retroceso guardado **negándose**) y los de documento, que estaban rojos contra el repo de la mañana (16 escenarios, 0 primitivas, 17 entradas del registro, el título viejo).
- **El residuo nuevo declarado en vez de descubierto en la ronda 4:** el camino del guard de cambios sin guardar **no** propaga, así que en una pantalla sucia el gesto siguiente queda **un escalón más largo** — nunca una expulsión. Escrito en los cuatro lugares donde se puede leer, los cuatro con fecha **2026-10-28**.

## Task Commits

1. **Task 1 (tracer, TDD) — RED: el caso de punta a punta antes del arreglo** — `ae8d425` (test)
2. **Task 1 (tracer, TDD) — GREEN: el productor, el cableado, los docblocks y los 15 casos** — `e39a4ce` (feat)
3. **Task 2: la sonda mide la CADENA cruzada (E-17, E-18)** — `9ba74a7` (feat)
4. **Task 3: los documentos al día y el registro de imprecisiones** — `764ec1d` (docs)
5. **Task 4: el checkpoint de bloqueo humano** — **NO EJECUTADO**: paró ahí, como corresponde

**REFACTOR:** no hubo commit — no había nada que limpiar (el productor son tres `if` y una llamada).

**Cierre del plan:** `74841a4` (el resumen) y `1348b8c` (estado + roadmap).

_`commits: 6` está **MEDIDO** con `git rev-list --count 8460f79..HEAD` al cerrar —4 de task + el del resumen + el de cierre—, no narrado._

## Files Created/Modified

- `lib/panel-branch.ts` — `branchCarryMark` (el segundo productor, exportado y drivable con el `window` simulado) + la línea en `handleNavigate` sobre el mismo `estado` ya leído + el docblock del canal reescrito con sus **dos** productores, el invariante que comparten y el residuo del guard
- `lib/panel-history.ts` — **sólo comentarios**: la causa (i) de *quién borra esta marca* enmendada con fecha (deja de aceptarse en el camino de la barra) y el motivo escrito de por qué no se arregló preservando la clave en el ejecutor de vistas
- `test/panel-branch.test.ts` — 15 casos nuevos en la suite que ya existía (273 → 288 en el carril puro): las reglas en orden con sus contrapuestos adyacentes, el de punta a punta con la pérdida adentro, la **cadena de dos** reemplazos, el pedido que no coincide, las dos guardas del escritor único, y las auditorías de fuente del cableado, del canal y de las dos funciones de política
- `.planning/debug/probes/panel-back-stack.mjs` — `reemplazarComoElRouter` y `propagarLaMarca` + `E-17` y `E-18`, más el veredicto y el mapa escenario → plan al día
- `.planning/debug/pila-de-dos-niveles-medida.md` — `### E-17` y `### E-18` con las mediciones **pegadas tal cual salieron**, el contraste como números, el residuo del camino del guard con su fecha, los tres no-defectos nombrados uno por uno, y el título y el veredicto actualizados a dieciocho
- `.planning/workstreams/panel-nav/REQUIREMENTS.md` — la **tercera** precisión de MOB-04 (2026-10-28) y la tabla de *se marca si* diciendo que la ronda 3 se re-corre desde el principio
- `03-UAT-2.md` — `G3-1` anotado como **arreglado y sin verificar en el teléfono**, sin reinterpretar nada de las tres rondas
- `03-UAT-GUION-3.md` — el **motivo** del recorrido 1.1 corregido a la causa real y el 1.2 anotado como el recorrido que separó las hipótesis
- `.planning/WINDOWS.md` — la entrada **18** agregada por el CLI (tabla y JSON los dos en 18); la **17** NO se marcó arreglada

## Decisions Made

Las siete decisiones están en `key-decisions` del frontmatter. Las dos que más gobiernan lo que viene:

1. **El arreglo vive FUERA de la política.** La regla `-1c` ya era correcta; lo que faltaba era que el hecho que lee estuviera presente. Tocar `panelNavMode` habría cambiado el atrás de **escritorio entero** (criterio 6) y tocar el orden de `panelBranchPlan` habría cambiado el significado de siete escenarios ya medidos.
2. **La propagación es GENERAL, con su costo medido.** Viaja cualquier ruta leída, porque *un reemplazo no cambia lo que hay debajo* es cierto para cualquier valor. El efecto dentro de la rama de Más quedó medido en `E-18` y resultó ser lo que **D-03 pide**: recorrer dos secciones de Más y tocar Más ahora **sube** en vez de apilar.

## Deviations from Plan

### 1. [Rule 3 - Blocking] El gate de `retrocesos=0` del task 1 es imposible contra este repo, y se corrigió a la base MEDIDA

- **Found during:** Task 1, antes de escribir una línea (medición de líneas base).
- **Issue:** el `<automated>` del task 1 exige `history\.back\(\)` **= 0** en `lib/panel-branch.ts` («este módulo no retrocede por su cuenta»). **Medido hoy: 2** — `consumeOwnedExitSentinel` (el consumo del sentinel de salida) y la limpieza del desmontaje, las dos **anteriores a este plan** y las dos fuera del alcance (el plan prohíbe explícitamente tocar el consumo del sentinel y el rastreo del retroceso). El gate, tal como está escrito, sale rojo contra **cualquier** estado del repo, incluido el de antes del plan.
- **Fix:** se corrió el gate con la base **medida** (`back == 2`, o sea *cero retrocesos NUEVOS*, que es lo que la prohibición de fondo pide: «PROHIBIDO agregar un camino nuevo que llame a `history.back()`»). Los otros cinco contadores del mismo gate se dejaron exactamente como el plan los pide y los cinco pasan.
- **Files modified:** ninguno — es una corrección del **gate**, no del código.
- **Verification:** `productores del canal=4 · consumidor=2 · el hecho de -1c textual=1 · total del identificador=1 · propagaciones del state=0 · retrocesos=2 (base medida hoy: 2)`.
- **Committed in:** `e39a4ce` (no cambia archivos; queda documentado acá).

### 2. [Rule 3 - Blocking] `check tdd-red-evidence` no puede leer la salida de `vitest`, y el RED se verificó a mano

- **Found during:** Task 1, paso RED.
- **Issue:** el verbo `gsd-tools check tdd-red-evidence` parsea **TAP de `node --test`** (`# tests N` / `# pass N` / `# fail N` a principio de línea, y `ok N - <nombre>` sin sangría). Con la salida normal de `vitest` devuelve `INVALID_RED / invalid_record`, y con `--reporter=tap` devuelve `INVALID_RED / zero_tests_discovered` porque el reporter de vitest **anida** los casos y no emite ese resumen. O sea: un RED **genuino** se clasifica como inválido por una limitación del **instrumento**, no del RED.
- **Fix:** se dejó el veredicto del verbo **como salió** (no se fabricó un `output` con las líneas que el parser quiere: eso habría sido inventar la medición) y el RED se verificó a mano contra los tres criterios del propio verbo: exit **1**, el caso **nombrado distintamente** que falla, y la falla es una **aserción sobre el comportamiento planeado** (`expected 'undefined' to be 'function'` sobre `branchCarryMark`), con los otros **128** casos del archivo **pasando** — o sea ni un error de sintaxis, ni cero casos descubiertos, ni una falla ajena.
- **Files modified:** ninguno.
- **Verification:** la corrida del RED quedó pegada en el cuerpo del commit `ae8d425`.
- **Committed in:** `ae8d425`.

### 3. [Rule 1 - Bug] El recorte de región de dos casos nuevos se truncaba en el `}: {` de la firma

- **Found during:** Task 1, paso (5), al correr los casos nuevos.
- **Issue:** dos auditorías de fuente nuevas recortaban con `indexOf('\n}')` y el recorte terminaba en el `}: {` del cierre de la firma con parámetro-objeto ⇒ regiones de 71 y 88 caracteres. **Es la trampa que el plan nombra** y la guarda de largo mínimo la agarró: rojo honesto en vez de verde midiendo cero.
- **Fix:** el ancla pasó a la llave **sola en su línea** (`'\n}\n'`), con el motivo escrito al lado en los dos casos.
- **Files modified:** `test/panel-branch.test.ts`.
- **Verification:** las dos regiones pasan a 400+ caracteres y los contadores miden lo que tienen que medir; 288 casos verdes.
- **Committed in:** `e39a4ce`.

### 4. [Rule 2 - Missing critical] `E-18` necesitaba DOS reemplazos para medir una cadena, no uno

- **Found during:** Task 2, al correr el gate estructural de la sonda.
- **Issue:** la primera forma de `E-18` armaba la rama con **un** reemplazo, y el gate del plan exige **≥ 2 por escenario** con un motivo medido: con uno se mide lo que `E-16` mitad A ya medía (una marca pisada) y **no** la cadena, que es la causa de `G3-1`.
- **Fix:** la rama de Más se arma con una **cadena** de dos reemplazos (`/finances → /web → /ayuda`), leyendo antes y propagando después en cada tramo, y las claves medidas pasaron a plural (`valores_leidos_antes_de_cada_reemplazo`, `escribio_en_cada_tramo`).
- **Files modified:** `.planning/debug/probes/panel-back-stack.mjs`.
- **Verification:** `E-18 región=175 líneas · reemplazos del <Link>=2 · propagaciones=2`, y el escenario sale `OK` en la corrida de 18/18.
- **Committed in:** `9ba74a7`.

---

**Total deviations:** 4 (2 por gates del plan imposibles o incompletos contra el repo real, 1 bug de recorte en los casos nuevos, 1 cobertura faltante en un escenario). **Impacto:** ninguna cambió el alcance ni la forma del arreglo. Las dos primeras son del **instrumento** y quedaron documentadas con el número medido al lado, que es la disciplina que esta fase viene sosteniendo.

## Issues Encountered

- **El recibo automático del checkpoint ya está verde ANTES de que el dueño toque el teléfono.** El `<automated>` del task 4 cuenta motores nombrados (4), el recorrido 1.1 anotado (1) y una fecha nueva (2) en `03-UAT-2.md` — y los tres ya están satisfechos por la ronda 3 **interrumpida** y por el recorrido del 2026-10-28. Es exactamente lo que el propio plan advierte: **ese chequeo es un recibo de que el dueño escribió lo que midió, NO una aprobación**. Lo que protege acá es el `gate="blocking-human"`, que la configuración de avance automático **no puede apagar** — y que en este install es la única protección que no se puede desactivar (`auto_advance: true` a nivel proyecto; el `auto_advance: false` del workstream es **inerte**).
- **El rojo de la sonda sin propagación no tiene forma de `FALLA`.** Con `propagarLaMarca` mutada a no-op, `E-17` mitad B llama al retroceso guardado, que **se niega** (`la entrada de arriba NO lleva nuestra marca`) y hace abortar la corrida: rc **1** pero **cero** líneas `FALLA`. Queda escrito acá y en el documento de debug, porque un gate que sólo cuenta `FALLA` no vería esa forma de rojo (el del plan mira `rc`, así que sí la ve).
- **La suite completa tardó 72 s** y el carril `db` corrió con Docker arriba: no hubo que degradar ningún piso.

## User Setup Required

None — cero paquetes, cero migraciones (la próxima libre sigue siendo la **080**), cero variables de entorno.

## Next Phase Readiness

- **El cierre de la Phase 3 depende de UNA cosa y no está en el pipeline: la ronda 3 re-corrida por el dueño en los DOS motores.** El checkpoint quedó devuelto con su contenido textual; MOB-04, MOB-05 y MOB-06 siguen **sin marcar**.
- Si algo falla, los tres **vuelven a quedar sin marcar**, el fallo se anota **con lo que se vio** y entra como gap de una ronda nueva — **sin interpretarlo ni arreglarlo en el momento**.
- Lo que queda **declarado y abierto** para después: el residuo del camino del guard (entrada **18** del registro), el residuo de escritorio (entrada **16**) y el límite de la pila de tres escalones de D-02. Ninguno es un defecto nuevo; los tres están escritos con fecha.
- Diferido al **cierre de fase**, sin cambios: apuntar la sonda a la app real en vez de a su página estática. Este gap no lo necesitaba —lo que faltaba medir era la **forma de la pila**, no el cableado de React— y sigue siendo lo único que podría cerrar A1 y A2 sin un teléfono.

## Self-Check: PASSED

- `.planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-11-SUMMARY.md` — **FOUND**
- Los nueve archivos de `key-files.modified` — **FOUND** (los nueve existen y los nueve aparecen en `git diff --numstat 8460f79..HEAD`)
- Commits `ae8d425`, `e39a4ce`, `9ba74a7`, `764ec1d` — **FOUND** en `git log`
- `<acceptance_criteria>` del task 1 — **8/8 PASS** (incluido el `back()` con la base medida, ver desviación 1)
- `<acceptance_criteria>` del task 2 — **8/8 PASS**
- `<acceptance_criteria>` del task 3 — **5/5 PASS**
- `<verification>` del plan — **11 de 11 corridos**; el ítem 11 (MOB-04/05/06 sin marcar) verificado: `requirements.mark-complete` **no** se corrió y las tres casillas siguen en `- [ ]`

---
*Phase: 03-la-pol-tica-de-atr-s-de-un-nivel-a-dos · Plan 11*
*Completed: 2026-10-28 — con el task 4 (checkpoint de bloqueo humano) PENDIENTE DE LA PERSONA*
