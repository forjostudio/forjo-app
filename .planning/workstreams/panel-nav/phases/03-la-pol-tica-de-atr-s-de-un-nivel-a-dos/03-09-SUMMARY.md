---
phase: "03-la-pol-tica-de-atr-s-de-un-nivel-a-dos"
plan: "09"
subsystem: navigation
tags: [mobile-nav, back-button, history-api, panel-branch, g2-1, cdp-probe, tdd]

# Dependency graph
requires:
  - phase: "03-la-pol-tica-de-atr-s-de-un-nivel-a-dos (plan 03-02)"
    provides: "`panelBranchPlan` con sus seis miembros y su regla 0 (*sin el hecho jamás un retroceso*), la marca de la rama guardando LA RUTA de abajo y `consumeOwnedBranchEntry` con sus dos guardas — el retroceso que esta regla ejecuta ya existía"
  - phase: "03-la-pol-tica-de-atr-s-de-un-nivel-a-dos (plan 03-05)"
    provides: "la REGLA DE DIRECCIÓN: ningún retroceso escribe la marca. Sin ella este arreglo fabricaría un G-5 nuevo — el aterrizaje del retroceso quedaría marcado, `algoNuestroDebajo` daría verdadero en la entrada original de Inicio y el aviso TAMPOCO se armaría"
  - phase: "03-la-pol-tica-de-atr-s-de-un-nivel-a-dos (plan 03-06)"
    provides: "la regla -1b (consumir el sentinel y recién entonces navegar) y el ejecutor de dos pasos: la regla nueva se mete DESPUÉS de ésa, y por eso el gesto con el sentinel arriba sigue teniendo dueño"
  - phase: "03-la-pol-tica-de-atr-s-de-un-nivel-a-dos (plan 03-07)"
    provides: "la SÉPTIMA regla del armado (`algoNuestroDebajo`) — la que hoy impide armar sobre la entrada de Inicio apilada, y la que vuelve a dejar pasar el armado sola cuando esa entrada deja de existir"
  - phase: "03-la-pol-tica-de-atr-s-de-un-nivel-a-dos (plan 03-08 / la UAT ronda 2)"
    provides: "el gap G2-1 con la cadena de cuatro pasos y el reporte TEXTUAL del dueño, más la decisión del dueño del 2026-10-27 (`03-DECISION-UAT-2.md`) que gobierna el resultado esperado de `Más → Inicio → atrás`"
provides:
  - "la regla de G2-1 en `panelBranchPlan`: con la marca diciendo LA RAÍZ, destino la raíz y viniendo de otra ruta ⇒ el RETROCESO guardado de un paso (`up`), decidido ENTRE la regla -1b y la regla 0"
  - "el hecho de la pila `raizDebajo`, SIN valor por omisión: un call site que lo olvide no compila"
  - "el ciclo Inicio↔sección ACOTADO: tres vueltas, la misma profundidad, y el hash del sentinel siempre en su forma base"
  - "el aviso de salida armándose SOLO en la entrada original de Inicio, sin tocar ninguna de las siete reglas del armado — lo que cambió es la PILA que esas reglas leen"
  - "tres escenarios de sonda (E-14/E-15/E-16) que CRUZAN la regla nueva con el sentinel de salida, con la marca de la rama y con el caso de la marca perdida: el hueco de método que llevó la ronda 1 a 8/8 con cinco fallos en el teléfono"
  - "el residuo de escritorio DECLARADO con su fecha en los tres lugares donde se puede leer, y cero consultas del ancho de pantalla en los cuatro archivos de la política y sus consumidores"
  - "el hecho medido de que un `Page.navigate` a la MISMA URL es una recarga y PRESERVA `history.state` — el mismo mecanismo por el que la marca sobrevive al F5 del dueño"
affects:
  - "plan 03-10 (la ronda 3 de UAT): los ítems 20, la mitad de overlay, 1-5, 10-13, 16 y 21 ya se pueden correr contra el comportamiento nuevo, y el recorrido del bloque H cambia de resultado esperado"
  - "`REQUIREMENTS.md` (MOB-05): la consecuencia declarada `Más → Inicio → atrás` avisa en vez de volver a Más la escribe el plan 03-10"
  - "Phase 4 (MOB-08/09, los tabs profundos): heredan la política con una regla más"

actuals:
  tokens: 121178
  tasks: 3
  commits: 5
plan_head_before: 1e820cbb92f5aaf6552e120d7d96879216bf2a80

tech-stack:
  added: []
  patterns:
    - "Un hecho de la pila SIN valor por omisión como disciplina de compilación: `raizDebajo` se suma a `masDebajo`, `holdsExitSentinel`, `vieneDeUnRetroceso` y `algoNuestroDebajo` — un call site que lo olvide no compila, así que el task entero es UNA unidad de compilación y no hay estado intermedio donde el hecho se pueda perder en silencio"
    - "El hecho se computa como *la marca DICE X* y no como *¿hay marca?*: es lo que hace que el hecho no se dispare donde no corresponde, y lo que permitió escribir la regla sin preguntarle nada a la pantalla"
    - "La regla va en la decisión de la RAMA y no en la política de RUTAS, decidido por el reparto medido de consumidores: `panelNavMode` la consumen el sidebar, la pantalla Más, la barra, el guard y los dos módulos (ahí la regla cambiaría el atrás de escritorio entero); `panelBranchPlan` sólo el hook de la barra y el guard"
    - "Residuo aceptado DECLARADO en los tres lugares donde se puede leer (el docblock de la regla, el consumidor donde se produce y el documento de debug), con fecha, en vez de taparlo con un chequeo de viewport que NAV-05 prohíbe"
    - "Escenario de sonda con DOS MITADES que miden la forma vieja y la nueva en la misma corrida, y los dos hechos como NÚMEROS en vez de como argumento: lo que se afirma es cuál gana el cruce, no que no haya cruce"
    - "Gemelo del bug en la suite: un segundo simulador que fija el `3 → 5 → 7` de la regla vieja al lado del `1, 1, 1` de la nueva, para que el número del defecto no se pueda 'simplificar' de vuelta sin ponerse rojo"
    - "Punto de partida LIMPIO explícito en la sonda (`reiniciarEnLimpio`): un escenario que hereda el estado de la mitad anterior mide el punto de partida y no el diseño"

key-files:
  created:
    - ".planning/workstreams/panel-nav/phases/03-la-pol-tica-de-atr-s-de-un-nivel-a-dos/03-09-SUMMARY.md"
  modified:
    - ".planning/debug/probes/panel-back-stack.mjs"
    - ".planning/debug/pila-de-dos-niveles-medida.md"
    - "lib/panel-history.ts"
    - "lib/panel-history.test.ts"
    - "lib/panel-branch.ts"
    - "components/dashboard/unsaved-changes-guard.tsx"
    - "test/panel-branch.test.ts"

key-decisions:
  - "La regla vive en `panelBranchPlan` y NO en `panelNavMode`, que quedó intacta en sus seis ramas: el reparto de consumidores está medido y en la política de rutas la regla cambiaría el atrás de escritorio entero, que es justo lo que el criterio 6 protege"
  - "NO hay séptimo miembro en el plan de rama: `up` ya ES el retroceso guardado de un paso con sus dos guardas, así que los dos consumidores quedan en UN dialecto y el `switch` exhaustivo del guard sigue en seis casos"
  - "La regla va ENTRE la -1b y la 0, y el orden es el argumento: después de la -1b porque con el sentinel arriba el gesto ya tiene dueño; antes de la regla 0 porque ahí el hecho de la rama es falso y la decisión caería en EMPUJAR, que es literalmente el bug. Hay un caso que sólo puede pasar si el orden es ése, y el gate del orden se demostró en rojo invirtiéndolo"
  - "El residuo de escritorio se ACEPTA y se declara con fecha 2026-10-27 como revisión ACOTADA del criterio 6: el criterio ya no se sostiene *por construcción* a través del hecho (en escritorio la marca sí puede decir la raíz), sino porque la barra se oculta a ≥1024px y el guard sólo computa con la pantalla sucia ⇒ un solo caso de residuo"
  - "NO se gatea la política por el ancho de la pantalla, y hay una auditoría que cuenta cero consultas en los cuatro archivos: un chequeo de viewport es exactamente lo que NAV-05 y el criterio 6 existen para prohibir"
  - "El hecho nuevo va SIN valor por omisión, así que el task 2 es una sola unidad de compilación: el cómputo en los dos consumidores entró ahí (lo forzó el compilador) y para el task 3 quedó lo que el compilador no puede exigir — el residuo declarado y los candados de un dialecto"
  - "En los casos que ya existían el hecho se pasó con CRITERIO y no en falso automático: `false` donde el caso afirma *sin el hecho la decisión devuelve lo de la política de rutas*, y DERIVADO DE LA PILA en el simulador (la entrada inmediatamente inferior comparada contra la raíz)"
  - "La sonda arranca sus escenarios nuevos desde un punto de partida que BORRA el estado (`reiniciarEnLimpio`), porque un `Page.navigate` a la misma URL es una recarga y PRESERVA `history.state`: sin eso, la mitad B de E-14 aterrizaba sobre la marca que dejó la mitad A y daba un rojo que no era del diseño"
  - "La consecuencia declarada se escribe en la suite con su propio caso: `Más → Inicio` deja la pila en un escalón, así que ese atrás AVISA en vez de volver a Más. No contradice la decisión (a) —sigue siendo *armar sólo si no hay nada nuestro debajo*—: lo que cambió es la pila que esa regla lee, y el dueño lo decidió el 2026-10-27"

patterns-established:
  - "Gate del ORDEN de una regla por número de línea dentro de la región recortada (la nueva después del ancla de la anterior y antes del ancla de la siguiente), demostrado en rojo moviendo la regla al lugar equivocado: el orden es la mitad del arreglo y ningún test de valor de retorno lo ve si todos los hechos están en el mismo lado"
  - "Recorte de región topado en la llave de cierre a principio de línea TAMBIÉN dentro de un test de auditoría de fuente: el `slice` sin tope llegaba al final del archivo y el contador medía otras funciones (la variante 'rojo midiendo otra cosa' del mismo modo de falla)"
  - "Evidencia de RED verificable con `check tdd-red-evidence` sobre un repo de vitest: el validador parsea TAP de node:test, así que el RED se corre con `--reporter=tap-flat` y las líneas de resumen se DERIVAN del propio TAP (`1..N` y el conteo de `not ok`), nunca se inventan"

requirements-completed: []

coverage:
  - id: D1
    description: "La sonda mide dieciséis escenarios y los tres nuevos CRUZAN la regla con las otras dos marcas: E-14 deja el crecimiento de dos entradas por vuelta (3 → 5 → 7) y la falta del aviso medidos como números contra la forma nueva (1, 1, 1 y el armado en `armar`) en la misma medición; E-15 afirma que dentro de la rama de Más la regla nueva no le roba el gesto al colapso, incluido su caso degenerado; E-16 mide las dos formas en las que la regla no se dispara y qué ve el dueño en cada una"
    verification:
      - kind: command
        ref: "node scripts/con-turno.mjs node .planning/debug/probes/panel-back-stack.mjs"
        status: pass
      - kind: command
        ref: "grep -oE \"id: 'E-[0-9]+'\" .planning/debug/probes/panel-back-stack.mjs | wc -l  (= 16)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Sección → raíz es un RETROCESO, decidido en `panelBranchPlan` con un hecho de la pila sin valor por omisión, entre la regla -1b y la regla 0, devolviendo el miembro `up` que ya existía; `panelNavMode` intacta en sus seis ramas y el conjunto de miembros en seis"
    verification:
      - kind: tests
        ref: "lib/panel-history.test.ts#panelBranchPlan — LA REGLA DE G2-1: sección → raíz es un RETROCESO (10 casos)"
        status: pass
      - kind: command
        ref: "gate de región: hecho nuevo=3 · retroceso guardado=2 · con valor por omisión=0 · orden: nueva=65 sentinel=55 regla0=68 · ramas de panelNavMode=6"
        status: pass
    human_judgment: false
  - id: D3
    description: "El ciclo Inicio↔sección no crece: tres vueltas, la misma profundidad, con su gemelo que fija el 3 → 5 → 7 de la regla vieja; más el límite declarado (la pila de tres escalones de D-02 sigue empujando y el atrás vuelve a Más) y la consecuencia declarada (`Más → Inicio` deja la pila en un escalón)"
    verification:
      - kind: tests
        ref: "lib/panel-history.test.ts#G2-1 — el ciclo Inicio↔sección repetido TRES veces deja la MISMA profundidad / su GEMELO / EL LÍMITE DECLARADO / Más → Inicio deja la pila en UN escalón"
        status: pass
    human_judgment: false
  - id: D4
    description: "Los dos consumidores computan el hecho con la MISMA forma, una vez cada uno, sobre el estado ya leído y re-verificado en el momento del gesto; el guard con la constante `PANEL_ROOT` importada y no el literal; el `switch` en seis casos con su chequeo de exhaustividad y `up` delegando al ejecutor compartido"
    verification:
      - kind: tests
        ref: "test/panel-branch.test.ts#G2-1 — UN dialecto del hecho nuevo en los DOS consumidores (6 casos)"
        status: pass
      - kind: command
        ref: "gate estructural: barra computa=1 · guard igual=1 · constante importada=1 · casos switch=6 · exhaustividad=2"
        status: pass
    human_judgment: false
  - id: D5
    description: "El residuo de escritorio declarado con su fecha (2026-10-27) en los tres lugares donde se lee —el docblock de la regla, el guard donde se produce y el documento de debug— y cero consultas del ancho de la pantalla en los cuatro archivos de la política y sus consumidores"
    verification:
      - kind: tests
        ref: "test/panel-branch.test.ts#CERO consultas del ancho de la pantalla... / el residuo de escritorio está DECLARADO con su fecha..."
        status: pass
      - kind: command
        ref: "grep -c '2026-10-27' en lib/panel-history.ts (1), components/dashboard/unsaved-changes-guard.tsx (1), .planning/debug/pila-de-dos-niveles-medida.md (3)"
        status: pass
    human_judgment: false
  - id: D6
    description: "En un teléfono real: entrando a Inicio, `Clientes → tocar Inicio` deja la URL de Inicio con el hash del sentinel y el atrás siguiente avisa y no sale; el ciclo repetido tres veces sigue haciendo lo mismo; y `Más → Inicio → atrás` AVISA PARA SALIR (la consecuencia declarada, no una regresión de MOB-04)"
    human_judgment: true
    rationale: "Es el backstop de la truth del plan y la sonda NO lo puede cerrar: monta su propio servidor estático y no corre el código de la app, así que A1 (el orden del efecto contra la escritura del router), A2 (que no haya otro commit en vuelo) y A11 (Safari/iOS y Chrome Android reales) siguen abiertos. Lo cierra la ronda 3 de UAT, que la corre el plan 03-10"

duration: "50 min"
completed: 2026-10-27
status: complete
---

# Phase 03 Plan 09: La regla de G2-1 — sección → raíz es un retroceso Summary

El ciclo Inicio↔sección dejó de crecer sin techo y el aviso de salida volvió a armarse solo, con una regla de tres hechos metida entre la del sentinel en la raíz y la que prohíbe retroceder sin el hecho — en `panelBranchPlan`, sin tocar `panelNavMode` y sin un séptimo miembro.

**Duración:** 50 min · **Tasks:** 3/3 · **Archivos:** 7 · **Commits:** 4 (+1 de cierre)

## Qué se hizo

### El gap, y por qué eran dos mitades de una

`panelNavMode` dice `to === root ⇒ push`, así que tocar Inicio desde una sección **apilaba** una tercera entrada. Eso producía dos defectos a la vez, y la cadena está medida:

1. el ciclo Inicio↔sección hacía crecer la pila **dos entradas por vuelta sin techo** — medido `3 → 5 → 7`;
2. cada entrada de Inicio alcanzada por ese empuje quedaba marcada con **la sección** que quedó debajo;
3. la séptima regla del armado (`algoNuestroDebajo`) leía esa marca y decía **no armar**;
4. ⇒ **el aviso de salida nunca aparecía**. Textual del dueño: *«al tocar inicio después de haber hecho otras cosas cae a /dashboard y la guarda de salir no está»*.

Con el retroceso, el dueño aterriza en la entrada **original** de Inicio, que no tiene nada nuestro debajo, y el aviso **se arma solo**: no se tocó ninguna de las siete reglas del armado — cambió la **pila** que esas reglas leen.

### Task 1 — la sonda mide el CRUCE, no otra vez lo mismo

Tres escenarios nuevos, cada uno con la decisión de rama escrita **en código ejecutable adentro** y con sus reglas **en orden** (el molde de E-10/E-13), más la acción de armado de **siete** reglas copiada de E-13:

- **E-14** mide la forma vieja y la nueva **en la misma corrida**: profundidades `[3,5,7]` / marca `{frjUnder:"/clients"}` / armado `no-armar` contra profundidades `[1,1,1]` / aterrizaje **sin marca** / armado `armar` / hashes `["#salir","#salir","#salir"]` sin ninguno escalado. Y el candado de la cicatriz 1 con el ojo donde importa: **exactamente un** par adyacente con el mismo pathname por vuelta, que es la **condición de existencia** de la entrada del sentinel y no un atrás muerto.
- **E-15** mide **los dos hechos como números** para afirmar cuál gana: en la pila de dos escalones de la rama la marca dice la raíz (hecho nuevo `true`, de la rama `false`) ⇒ retroceso; dentro de la rama de Más la marca dice Más (`false` / `true`) ⇒ `collapse-then-replace` con su `doble-retroceso` degenerado y cero pares repetidos.
- **E-16** mide las **dos** formas en las que la regla **no** se dispara: con el estado pisado por un reemplazo blando ajeno los dos hechos quedan en falso ⇒ **cero retrocesos**, la pila un escalón más larga y el armado en `no-armar` (se pierde el aviso, nunca el sitio); y en la pila de tres escalones de D-02 la marca dice la sección ⇒ el gesto **sigue empujando**, el atrás cae en **Más** (algo visible) y el armado dice `no-armar` — la decisión (a) funcionando.

**Sonda: 16 escenarios, 16 coinciden, rc 0.**

### Task 2 — la regla (RED → GREEN)

`raizDebajo` entró como hecho de la pila **sin valor por omisión**, con su docblock de tres puntos (hecho y no configuración; lo contesta el ejecutor del estado real y lo re-verifica en el click; se computa como *la marca **dice** la raíz*). La regla quedó como **-1c**, entre la -1b y la 0:

```ts
if (raizDebajo && to === root && from !== to) return 'up'
```

`panelNavMode` quedó **intacta** (seis ramas) y el conjunto del plan de rama sigue en **seis** miembros: `up` ya era el retroceso guardado de un paso, con sus dos guardas.

### Task 3 — el residuo donde se produce, y los candados de un dialecto

El guard es el **único** camino por el que la regla puede correr en escritorio (la barra se oculta a ≥1024px y ese camino pide la pantalla sucia), así que el residuo se declaró **ahí**, con su fecha y su alcance de un solo caso, más la frase de que no se tapa preguntándole el ancho a la pantalla. Y seis auditorías de fuente nuevas: un dialecto, la constante importada, cero consultas de ancho en los cuatro archivos, el residuo fechado, el `switch` en seis casos con exhaustividad, y el caso con el nombre del gap (el hecho sale de la **marca de la rama**, no de una clave nueva; la regla 0 sigue con **tres** dueños).

## El ciclo RED → GREEN

- **RED** (`9c7f501`): 145 casos, **9 fallan** sobre la conducta planeada — ocho en `expected 'push' to be 'up'` y el del ciclo ×3 en la profundidad de la pila. Verificado con `check tdd-red-evidence` ⇒ **`RED_EVIDENCE_OK`** (`target_test_failed`). El validador parsea TAP de node:test, así que el RED se corrió con `--reporter=tap-flat` y las líneas de resumen se **derivaron** del propio TAP (`1..145` y el conteo de `not ok`).
- **GREEN** (`6ab8b72`): 145/145, `tsc` 0, `eslint` 0, carril puro 76 archivos / 1625 casos.
- **REFACTOR:** sin commit. La implementación es una conjunción de tres hechos y una línea en cada consumidor; no hubo nada que limpiar, y el plan prohibía explícitamente el miembro nuevo y la clave nueva que serían las únicas "mejoras" a mano.

## Gates, cada uno demostrado en ROJO

| Gate | Rojo demostrado con | Verde |
|------|---------------------|-------|
| 16 escenarios declarados + el cruce adentro de cada uno | el repo de hoy: `escenarios declarados = 13`, `E-14 declarado = 0`; y una **copia mutada** donde a E-14 se le renombran `accionDeArmado`/`frjExit`/`frjUnder`/`empujar(cdp` ⇒ los dos contadores del cruce caen a 0 | 16 · cruce 3-5 / 3-5 / 4-13 por escenario |
| la sonda en verde con los tres nuevos en `OK` | el repo de hoy: 13 escenarios, 0 nuevos en `OK` | rc 0 · nuevos en `OK` = 3 · total 16 |
| el documento de debug con las tres mediciones, el crecimiento y el residuo fechado | el repo de hoy: `secciones nuevas = 0`, `titulo viejo = 1`, `con su fecha = 0` | 3 · 0 · 3 |
| la región de `panelBranchPlan` + el **orden** de la regla | el repo de hoy: `hecho nuevo = 0`, la línea de la regla vacía; y una **copia mutada** con la regla movida **después** de la regla 0 ⇒ `nueva=69 > regla0=67` | nueva=65 · sentinel=55 · regla0=68 |
| el cómputo en los dos consumidores + la constante + el residuo fechado | el estado en `1e820cb`: los cuatro contadores en 0 | 1 · 1 · 1 · 1 |
| `tsc` / `eslint` / intocables / `panelNavMode` en seis ramas | — (candados de no-regresión, no la prueba del trabajo) | 0 · 0 · vacío · 6 |

## Verificación de cierre del plan

| # | Qué | Resultado |
|---|-----|-----------|
| 1 | la sonda por el turno de pantalla, 16 escenarios | **rc 0 · 16/16** (confirmada después de los tres tasks) |
| 2 | el carril puro completo | **rc 0 · 76 archivos · 1631 casos** (1628 + 3 expected-fail; base 1607 + 3) |
| 3 | tipos con `./node_modules/.bin/tsc --noEmit` | **0 errores** |
| 4 | `panelNavMode` intacta | **6 ramas** |
| 5 | un dialecto en los dos consumidores, `switch` en seis | **1 y 1 · 6 casos + exhaustividad** |
| 6 | cero consultas del ancho de pantalla en los cuatro archivos | **0** |
| 7 | el residuo declarado en los tres lugares con su fecha | **1 · 1 · 3** |
| 8 | intocables sin tocar | **`git status` vacío** sobre los cinco |

Cero paquetes nuevos, cero migraciones (la próxima libre sigue siendo la **080**), cero affordance visible nuevo, un solo temporizador.

## Deviations from Plan

### Auto-fixed Issues

**1. [Regla 1 — Bug] La sonda heredaba el estado de la mitad anterior: `Page.navigate` a la misma URL es una RECARGA y preserva `history.state`**

- **Found during:** Task 1
- **Issue:** la mitad B de E-14 aterrizaba sobre `{frjUnder:"/clients"}` —la marca que había dejado la mitad A— en vez de sobre la entrada **original** de Inicio sin marca, así que el armado daba `no-armar` y el escenario salía en rojo. El rojo no era del diseño: era del **punto de partida**. La causa es que un `Page.navigate` a la ruta en la que ya estamos no es una navegación nueva sino una recarga, y una recarga **preserva** el estado de la entrada.
- **Fix:** se agregó `reiniciarEnLimpio` al lado de `reiniciarEn` —mismo reinicio más un `replaceState(null, '')`— y los tres escenarios nuevos parten de ahí. Los trece viejos **no se tocaron**. El hecho quedó documentado en el helper y en el documento de debug, porque es el **mismo mecanismo** por el que la marca sobrevive al F5 del dueño: no es una rareza del instrumento, es la semántica real.
- **Files modified:** `.planning/debug/probes/panel-back-stack.mjs`, `.planning/debug/pila-de-dos-niveles-medida.md`
- **Verification:** la sonda pasó de 15/16 a **16/16**
- **Commit:** `1c7a490`

**2. [Regla 1 — Bug] Una auditoría de fuente nueva medía hasta el final del archivo en vez de la función**

- **Found during:** Task 3
- **Issue:** el caso que afirma que la regla 0 sigue con **tres** dueños recortaba desde `isForeignOwnedEntry` **sin tope**, así que el `slice` llegaba al final de `lib/panel-history.ts` y el contador de `panelUnderRoute` medía 2 donde el predicado tiene 0. Es la misma variante de siempre vista del otro lado: en vez de verde midiendo cero, **rojo midiendo otra cosa**.
- **Fix:** la región se topa en la llave de cierre a principio de línea (`indexOf('\n}', desde)`), con un `toBeLessThan(400)` que falla si el tope se vuelve a perder.
- **Files modified:** `test/panel-branch.test.ts`
- **Verification:** 174/174 en `test/panel-branch.test.ts` + `test/dirty-history.test.ts`
- **Commit:** `8824830`

**3. [Regla 3 — Bloqueante] El reemplazo masivo del hecho en los call sites tocó tres comentarios**

- **Found during:** Task 2 (fase GREEN)
- **Issue:** la inserción del hecho en las 28 llamadas se hizo por patrón sobre la palabra `masDebajo`, y pisó tres líneas de **comentario** que la nombran (dos en `test/panel-branch.test.ts`, tres en `lib/panel-history.test.ts`), dejándolas como `` `raizDebajo: false, masDebajo` ``.
- **Fix:** las cinco líneas se restauraron a mano y la llamada multilínea que quedó con los dos hechos en un renglón se volvió a partir. Revisado con `git diff` buscando el patrón dentro de comentarios ⇒ cero.
- **Files modified:** `lib/panel-history.test.ts`, `test/panel-branch.test.ts`
- **Verification:** `eslint` 0, `tsc` 0, 145/145 y 174/174
- **Commit:** `6ab8b72` / `8824830`

**4. [Regla 2 — Funcionalidad crítica faltante] La posición del `STATE.md` del workstream quedó inconsistente tras el CLI**

- **Found during:** cierre del plan
- **Issue:** `state.advance-plan --ws panel-nav` movió el contador de **1 a 2** (el `begin-phase` de este run lo había dejado en 1 con ocho planes ya ejecutados), y el bloque de Progreso seguía diciendo `Plans Complete: 4/4` / `Current Plan: 4` de una fase anterior. Dejarlo así hace que el próximo `resume` arranque por el plan equivocado.
- **Fix:** se corrigieron a mano **sólo** los campos que son factualmente falsos sobre este plan: `current_plan: 10`, `stopped_at`, `last_activity_desc` y el bloque de Posición/Progreso al estado real de la fase (9/10). Los contadores de milestone que calcula el CLI (`12/14`, `percent: 0`) se **dejaron como los dejó el CLI**: corregirlos sería inventar números de otras fases.
- **Files modified:** `.planning/workstreams/panel-nav/STATE.md`
- **Verification:** `git status --porcelain` confirma que ningún comando del CLI tocó el STATE de otro workstream
- **Commit:** el de cierre

**Total deviations:** 4 auto-arregladas (2 bugs de medición, 1 bloqueante de edición masiva, 1 de consistencia de estado). **Impacto:** ninguno sobre el diseño de la regla — las dos primeras eran instrumentos que medían el punto de partida o el archivo equivocado, la tercera fue daño colateral de una edición por patrón, y la cuarta es higiene de estado del GSD.

## Authentication Gates

Ninguno.

## Known Stubs

Ninguno. Cero `TODO`/`FIXME`/placeholders agregados, cero tests salteados, cero `<verify>` sin correr.

## Lo que este plan NO cierra, declarado

La sonda monta su **propio servidor estático** y **no corre el código de la app**, así que **A1** (el orden del efecto que escribe la marca contra la escritura del router de Next), **A2** (que no haya otro commit del router en vuelo) y **A11** (Safari/iOS y Chrome Android reales) siguen **abiertos**. Un verde de la sonda **no** es un cierre de G2-1 en el teléfono: es el piso sobre el que la decisión pura se pudo escribir sin adivinar. Lo cierra la **ronda 3 de UAT**, que corre el plan `03-10`.

Y el **gemelo latente** del guard (su efecto diferido con la misma forma que el bucle que se arregló antes del ítem 1) sigue registrado como deuda: no entraba acá.

## Next

**Ready for `03-10`** — la ronda 3 de UAT. Los ítems que quedaron sin correr en la ronda 2 (20, la mitad de overlay en Inicio, 1-5, 10-13, 16 y 21) ya se pueden correr contra el comportamiento nuevo, y el recorrido del **bloque H** tiene que estar escrito con su resultado esperado **nuevo** —`Más → Inicio → atrás` **avisa para salir**— en `MOB-05` y en el guion, con prohibición explícita de tratarlo como regresión.

## Self-Check: PASSED

- `.planning/debug/probes/panel-back-stack.mjs` — FOUND (16 escenarios)
- `.planning/debug/pila-de-dos-niveles-medida.md` — FOUND (secciones E-14/E-15/E-16 + el residuo fechado)
- `lib/panel-history.ts` — FOUND (`raizDebajo` sin default, la regla -1c, la fecha 2026-10-27)
- `lib/panel-history.test.ts` — FOUND (145 casos)
- `lib/panel-branch.ts` — FOUND (el hecho computado en `handleNavigate`)
- `components/dashboard/unsaved-changes-guard.tsx` — FOUND (la constante importada + el residuo fechado)
- `test/panel-branch.test.ts` — FOUND (las seis auditorías nuevas)
- `1c7a490` — FOUND · `9c7f501` — FOUND · `6ab8b72` — FOUND · `8824830` — FOUND
</content>
</invoke>
