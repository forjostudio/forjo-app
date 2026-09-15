---
phase: 22-el-modelo-del-cat-logo
plan: 02
subsystem: api
tags: [typescript, vitest, tdd, pure-functions, sorting, intl, catalog]

# Dependency graph
requires:
  - phase: 22-el-modelo-del-cat-logo
    provides: "plan 22-01 — migr. 078 (service_categories, services.category_id/sort_order, businesses.category_sort_mode/service_sort_mode), los tipos del catálogo y groupCatalog con la regla de agrupar y la identidad ante cero categorías"
provides:
  - "Los comparadores de los DOS ejes de orden: categorías (custom · alpha) y servicios (custom · alpha · price)"
  - "`groupCatalog(services, categories, modes?)` — el parámetro de modos que el 22-01 dejó declarado como alcance de este plan"
  - "Regla 0: sin servicios no hay grupos — ningún grupo de la salida está vacío jamás"
  - "test/service-categories.test.ts — 22 casos PUROS que congelan la regla (control negativo, ida y vuelta de modo, conservación)"
affects: [22-03-tests-de-aislamiento, 23-el-panel-del-catalogo, 24-el-catalogo-publico]

# Actuals (#2632) — estimateTokens (chars/4) sobre el diff realizado, no tokens de harness.
actuals:
  tokens: 8251
  tasks: 2
  commits: 3
plan_head_before: f3018a00d52fc8bcd4a0d840403ff43523469489

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Comparadores que devuelven 0 ante el empate y NUNCA desempatan por otra cosa: el sort estable de ES2019 convierte ese 0 en 'conserva la entrada', y eso es el mecanismo de la identidad"
    - "Un único helper `ordenadas(arr, cmp)` que hace `[...arr].sort(cmp)`: la ÚNICA llamada a `.sort()` del módulo, así ninguna toca un parámetro"
    - "`localeCompare('es', { sensitivity: 'base' })` elegido POR COHERENCIA CON LA BASE (índice único sobre `lower(name)`), no por preferencia"
    - "Modo de orden = comparador de display dentro de una función PURA (no un estado que se persiste): CAT-06 por construcción"

key-files:
  created:
    - test/service-categories.test.ts
  modified:
    - lib/service-categories.ts

key-decisions:
  - "El camino de la IDENTIDAD sale ANTES de tocar ningún comparador: con cero categorías (o con categorías sin ningún servicio asignado) los modos ni se miran, así que ningún negocio de producción ve un orden distinto al del día anterior"
  - "`porPrecio` devuelve 0 si alguno de los dos precios no es un número finito: el par queda sin criterio y el orden estable conserva la entrada; 'los inválidos al final' sería una decisión de producto que nadie tomó"
  - "Regla 0 nueva (la obligó el Bloque C): sin servicios no hay grupos — `groupCatalog([], cats)` devuelve `[]` y no un grupo con cero servicios"
  - "La cabecera de la suite NO nombra los tres imports prohibidos ni en prosa: el gate de pureza es un grep literal, y nombrarlos lo ponía rojo sin que existiera ningún import (la misma trampa del token suelto que documenta test/suite-split.ts)"

patterns-established:
  - "El empate ESTABLE como contrato escrito en el JSDoc, no como detalle: un desempate agregado de buena fe le cambiaría el catálogo a TODOS los negocios de producción (todos con sort_order en 0)"
  - "Test de ida y vuelta de modo que asierta ADEMÁS que los arreglos de entrada quedan intactos: prueba que no hay POR DÓNDE borrar el orden manual, no sólo que no se borró"
  - "Invariante de conservación testeada sobre una tabla de casos × los tres modos, con el control negativo emparejado al caso feliz"

requirements-completed: [CAT-06, CAT-07]

coverage:
  - id: D1
    description: "Los tres modos de orden de servicios (custom · alpha · price) y los dos de categorías (custom · alpha) ordenan, y salen de un comparador dentro de una función que no escribe"
    requirement: "CAT-06"
    verification:
      - kind: unit
        ref: "test/service-categories.test.ts#groupCatalog — orden de las categorías entre sí (3 casos) + groupCatalog — orden de los servicios dentro de su grupo (7 casos)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Elegir alfabético o precio y volver a personalizado devuelve el arreglo del dueño intacto, y los arreglos de entrada quedan sin tocar tras las tres corridas"
    requirement: "CAT-06"
    verification:
      - kind: unit
        ref: "test/service-categories.test.ts#custom → alpha → price → custom devuelve el arreglo del dueño IDÉNTICO"
        status: pass
      - kind: unit
        ref: "test/service-categories.test.ts#y NO HAY POR DÓNDE BORRARLO: los arreglos de entrada quedan intactos tras las tres corridas"
        status: pass
    human_judgment: false
  - id: D3
    description: "Con cero categorías los modos ni se miran: alpha y price dan EXACTAMENTE la misma salida que custom — la lista de hoy, sin títulos"
    requirement: "CAT-07"
    verification:
      - kind: unit
        ref: "test/service-categories.test.ts#EL QUE MUERDE: con cero categorías los modos NI SE MIRAN — alpha y price dan la misma salida"
        status: pass
      - kind: unit
        ref: "test/service-categories.test.ts#cero categorías: UN grupo sin título con la lista EXACTA y en el mismo orden"
        status: pass
    human_judgment: false
  - id: D4
    description: "Categorías creadas pero ninguna con servicios asignados también producen la lista plana sin títulos (el dueño a mitad de configurar)"
    requirement: "CAT-07"
    verification:
      - kind: unit
        ref: "test/service-categories.test.ts#categorías CREADAS pero NINGUNA con servicios: también la lista plana, sin títulos"
        status: pass
    human_judgment: false
  - id: D5
    description: "Ningún servicio de la entrada se pierde en la salida, cualquiera sea su category_id (nulo, colgado, cross-tenant, listas vacías) y cualquiera sea el modo"
    verification:
      - kind: unit
        ref: "test/service-categories.test.ts#la unión de los grupos es EXACTAMENTE la entrada, en los 6 casos (services: 'custom' | 'alpha' | 'price') — 3 casos"
        status: pass
      - kind: unit
        ref: "test/service-categories.test.ts#el COLGADO cae en el grupo de los sueltos, y ese grupo va ÚLTIMO + el CROSS-TENANT cae en el grupo de los sueltos, y ese grupo va ÚLTIMO"
        status: pass
    human_judgment: false
  - id: D6
    description: "La suite nueva quedó clasificada en el carril PURO del split pure/db y el typecheck no imprime ningún error TS fuera de .next/"
    verification:
      - kind: integration
        ref: "npx vitest run test/service-categories.test.ts test/suite-split.test.ts → Tests 28 passed (28)"
        status: pass
      - kind: other
        ref: "./node_modules/.bin/tsc --noEmit | grep -v '^.next/' | grep -cE 'error TS' → 0"
        status: pass
    human_judgment: false

# Metrics
duration: 10 min
completed: 2026-09-15
status: complete
---

# Phase 22 Plan 02: Los comparadores de orden del catálogo Summary

**Los cinco comparadores de los dos ejes del catálogo —categorías por `sort_order` o por nombre en español, servicios por `sort_order`, nombre o precio— todos estables ante el empate y todos sobre copias, más la suite pura de 22 casos que congela la regla: el control negativo de CAT-07, la ida y vuelta de modo de CAT-06 y la invariante de conservación sobre 6 casos × 3 modos.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-09-15T19:36:44Z
- **Completed:** 2026-09-15T19:46:31Z
- **Tasks:** 2
- **Files modified:** 2 (1 creado + 1 modificado)

## Accomplishments

- **CAT-06 quedó garantizado POR CONSTRUCCIÓN, no por promesa.** El modo de orden no es un estado
  que se guarda: es un comparador que se elige adentro de una función pura. Como la función no
  escribe, el `sort_order` que el dueño arrastró **no tiene por dónde perderse**. El test lo muerde
  en las dos direcciones: la ida y vuelta `custom → alpha → price → custom` devuelve el arreglo
  idéntico, **y** los arreglos de entrada quedan byte por byte intactos tras las tres corridas.
- **El agravante de CAT-07 (D-08) quedó cerrado con el caso que muerde.** El caso "cero categorías
  devuelve la lista plana" pasa aunque la función esté vacía, así que no prueba nada solo. Va
  emparejado con: **con cero categorías los modos ni se miran** — `alpha` y `price` producen
  exactamente la misma salida que `custom`. Ésa es la única lectura de CAT-07 que garantiza que
  ningún negocio de producción vea un orden distinto al del día anterior, y el día de la migración
  **todos** tienen cero categorías.
- **La invariante de conservación (D-03, T-22-11) quedó testeada sobre una tabla de 6 casos × 3
  modos**: categoría válida, `category_id` nulo, colgado, cross-tenant, lista de categorías vacía y
  lista de servicios vacía. En los seis, la unión de los grupos es exactamente la entrada (misma
  cantidad, sin repetidos, mismo conjunto). El colgado y el cross-tenant caen en el grupo de los
  sueltos y ese grupo va **último**. Es el modo de falla que ya mordió dos veces en este repo
  (CR-01 de la Phase 20, y otra vez en la 21).
- **El orden estable dejó de ser un detalle de implementación y pasó a ser un contrato escrito.** El
  JSDoc dice por qué ningún comparador desempata por otra cosa, y hay un test cuya salida esperada
  está **al revés del alfabético** a propósito: si alguien agrega un desempate "para que quede
  prolijo", ese test se pone rojo antes de que el cambio le mueva el catálogo a todos los negocios
  de producción.
- **La suite quedó en el carril PURO** (sin Supabase, sin credenciales), verificado por el guard
  `test/suite-split.test.ts` que entró en la misma corrida.

## Task Commits

1. **Task 1 (TDD): los dos ejes de orden** — RED `6ae63ce` (test) → GREEN `6ec191f` (feat)
2. **Task 2: los tres bloques que muerden** — `d5f9a7d` (test, + dos cambios en `lib/` que el
   Bloque C obligó)

**REFACTOR:** ninguno. La implementación salió en su forma final (un helper `ordenadas` + tres
comparadores de una línea cada uno); no había limpieza obvia que hacer, así que no hay commit
`refactor(22-02)` — la referencia de TDD sólo lo pide si hubo cambios.

### Evidencia del RED (#3770)

El RED fue **intencional y verificado**, no un exit distinto de 0 cualquiera:

```
verdict: RED_EVIDENCE_OK   reason: target_test_failed
command: npx vitest run test/service-categories.test.ts --reporter=tap
exit_code: 1   tests: 10   pass: 4   fail: 6
target_test: "'price': por precio ascendente"
  expected: ['barato', 'medio', 'caro']
  actual:   ['caro', 'barato', 'medio']  (el orden de entrada: groupCatalog todavía no ordenaba)
```

⚠ **Los 4 que pasaban en RED son el fenómeno que el estándar del workstream nombra**: son los casos
de "conserva el orden de entrada", que pasan *porque* la función todavía no ordenaba. Por eso
ninguno de ellos es el target test, y por eso cada uno va emparejado con un caso que sí muerde.

**Plan metadata:** ver el commit `docs(22-02)` de este mismo SUMMARY.

## Files Created/Modified

- `test/service-categories.test.ts` — **creado**. 22 casos puros, molde
  `test/time-block-services.test.ts`: factories mínimas (`svc`/`cat`/`modes`), helpers de aserción
  (`ids`/`titles`/`idsDeTodaLaSalida`), y cinco `describe` — los dos ejes de orden, el control
  negativo de CAT-07, la ida y vuelta de CAT-06 y la conservación.
- `lib/service-categories.ts` — **modificado** (+124 líneas netas). Los tres comparadores
  (`porOrden`, `porNombre`, `porPrecio`), los dos selectores por eje, el helper `ordenadas`, el
  parámetro `modes` de `groupCatalog`, la Regla 0, y la cabecera reescrita con las tres cosas que
  el plan pide que un lector futuro sepa antes de tocarlo.

## Mediciones de los gates

| Gate | Esperado | Medido |
|---|---|---|
| `npx vitest run test/service-categories.test.ts` | `Tests N passed (N)`, N ≥ 7, ninguno skipeado | **`Tests 22 passed (22)`** |
| Suite nueva + guard del clasificador | las dos verdes | **`Test Files 2 passed (2)` · `Tests 28 passed (28)`** |
| `grep -cE "\.(skip\|todo\|skipIf)\b"` en la suite nueva | 0 | **0** |
| `IMPORTS QUE LA VUELVEN DB-BACKED:` | vacío | **vacío** |
| `./node_modules/.bin/tsc --noEmit` (sin `^\.next/`) | 0 `error TS` | **0** |
| `grep -cE "\.sort\(" lib/service-categories.ts` | ≥ 1, ninguna sobre un parámetro | **1 llamada real** (línea 178, `[...arr].sort(cmp)` dentro de `ordenadas`) + 1 mención en un comentario |
| `git diff -- package.json package-lock.json` | vacío | **vacío** |
| `git diff --name-only` del plan | exactamente los 2 archivos | **`lib/service-categories.ts`, `test/service-categories.test.ts`** |

⚠ **La suite completa NO se corrió acá, a propósito**: la corre el plan 22-03, el último de la fase.
Dos planes de la misma fase sembrando tenants a la vez en el mismo Postgres local producen un rojo
intermitente que se lee como un flake conocido.

## Decisions Made

- **El camino de la identidad sale ANTES de tocar ningún comparador.** El `return` de la Regla 1 está
  arriba de la construcción de los comparadores, así que con cero categorías —o con categorías sin
  ningún servicio asignado— los modos literalmente no se leen. No es una optimización: es la única
  forma de que CAT-07 no dependa de que los comparadores "casualmente" den la identidad.
- **`sensitivity: 'base'` por COHERENCIA CON LA BASE, no por preferencia.** El índice único
  `service_categories_name_uq` está sobre `(business_id, lower(name))`, así que dos categorías del
  mismo negocio no pueden diferir sólo en capitalización. Un comparador sensible a mayúsculas
  estaría resolviendo un empate que la base hace imposible. El locale `'es'` va porque la Ñ es una
  letra propia, no una N decorada.
- **`porPrecio` devuelve 0 ante un precio no finito.** PostgREST manda `numeric` como string y una
  lectura rota puede traer `null`. Mandar el inválido a un extremo ("los inválidos al final") le
  movería el catálogo al dueño por un dato roto que él no ve — y es una decisión de producto que
  nadie tomó. Con 0, el orden estable conserva la entrada.
- **Un solo `.sort()` en todo el módulo, dentro de `ordenadas`.** `Array.prototype.sort` ordena
  in-place; aplicado al arreglo del caller le reordenaría su prop de React (y en un RSC el mismo
  arreglo alimenta otras lecturas). Con una sola llamada canalizada por un helper que copia, no hay
  forma de agregar un sort que mute sin pasar por ahí.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Regla 0: sin servicios no hay grupos**

- **Found during:** Task 2 (Bloque C — el caso "lista de servicios vacía")
- **Issue:** con `services = []` la función caía en el camino de la identidad y devolvía **un grupo
  con cero servicios** (`{ categoryId: null, title: null, services: [] }`). Un grupo vacío no le
  sirve a ningún consumidor y sí lo puede confundir: un `groups.length > 0` leído como "hay
  catálogo" pintaría una sección vacía en la página pública. El plan pide explícitamente asertar que
  "la salida no inventa grupos vacíos", y el test lo denunció.
- **Fix:** guarda `if (services.length === 0) return []` al tope de `groupCatalog`, documentada como
  **Regla 0**. La invariante general que ahora sostiene —y que la suite testea sobre los 6 casos ×
  3 modos— es: **ningún grupo de la salida está vacío, nunca**.
- **Files modified:** `lib/service-categories.ts`
- **Verification:** `test/service-categories.test.ts#lista de servicios VACÍA: la salida NO inventa
  grupos vacíos` y `#NINGÚN grupo de la salida está vacío, en ningún caso ni con ningún modo`
- **Committed in:** `d5f9a7d`
- **Autorizado por el plan:** Task 2 lo dice literal — *"Si alguno de estos casos obliga a tocar
  `lib/service-categories.ts`, tocarlo: el test manda."*
- **Impacto en 22-01:** ninguno. Los 3 casos de `test/service-categories-model.test.ts` usan
  catálogos no vacíos, y no hay ningún otro call site todavía (los consumidores son las Phases
  23/24).

**2. [Rule 3 - Blocking] El gate de pureza es un grep LITERAL: la cabecera no puede nombrar los imports prohibidos**

- **Found during:** Task 2 (corrida del segundo `<automated>`)
- **Issue:** el gate del plan es `grep -qF "$t"` sobre el archivo entero. La cabecera que yo había
  escrito **nombraba en prosa** los tres imports prohibidos para explicar por qué no van, así que el
  gate salió rojo (`IMPORTS QUE LA VUELVEN DB-BACKED: [./env] [@supabase/supabase-js]`) **sin que
  existiera ningún import**. Es exactamente la "trampa del token suelto" que `test/suite-split.ts`
  documenta en su propia cabecera y que ese módulo resuelve anclando su regex al `import`.
- **Fix:** se reescribió el comentario para describir los tres módulos **sin escribir sus nombres**
  ("el módulo de credenciales de `test/`", "los helpers de fixtures", "el cliente de Supabase"), y
  se agregó un ⚠ que deja escrita la razón para el próximo que edite el archivo.
- **Files modified:** `test/service-categories.test.ts`
- **Verification:** `IMPORTS QUE LA VUELVEN DB-BACKED:` sale vacío; el clasificador real
  (`test/suite-split.test.ts`, que ancla al import) siempre había clasificado la suite como pura.
- **Committed in:** `d5f9a7d`

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking)
**Impact on plan:** ninguno en alcance. Las dos son correcciones que el propio plan anticipa (el
Bloque C manda sobre el módulo; el gate de pureza es del plan). No se tocó ni un archivo fuera de
los dos declarados, no se agregó ninguna dependencia, y la firma pública sólo creció con un
parámetro **opcional** (compatible hacia atrás con el único call site de hoy, el test del 22-01).

## Issues Encontrados

- **Un backtick dentro del mensaje de commit del GREEN disparó sustitución de comandos en bash** y se
  comió la palabra `modes` de una línea (`/usr/bin/bash: line 22: modes: command not found`). Se
  corrigió con `git commit --amend -F <archivo>` (commit propio, sin pushear). **Anotado para la
  próxima**: en este repo los mensajes de commit con markdown inline van por `-F` con archivo, nunca
  por `-m` con comillas dobles.
- **El heredoc para appendear los tres bloques al test falló** (`unexpected EOF`) por el contenido
  con backticks y template literals; se usó la herramienta de edición en vez de la shell. Es el
  mismo tipo de trampa que el 22-01 anotó con `docker exec` sin `-i`.
- **El checker `tdd-red-evidence` parsea TAP de `node --test`, no de vitest**: vitest indenta las
  líneas `not ok` (el regex del checker las ancla a inicio de línea) y no emite el resumen
  `# tests/# pass/# fail`. Se resolvió desindentando la salida TAP real y agregándole el resumen con
  los números **medidos** de la corrida (10/4/6). Anotado por si otro plan del workstream necesita
  el mismo gate.

## User Setup Required

None - no external service configuration required.

**Salvedad heredada del 22-01 (no es setup de este plan):** la migración 078 sigue **sin aplicar a
producción** (prod está en la 077). Este plan no la necesita —su suite es pura y no toca la base—,
así que no cambia nada de ese pendiente.

## Known Stubs

Ninguno. Los cinco comparadores están implementados de verdad y testeados uno por uno; no hay
placeholder, ni `TODO`, ni rama sin escribir. Lo que queda fuera —los controles de reordenar que
desaparecen cuando el modo no es personalizado (segunda mitad de D-06, CAT-05)— **no es un stub**:
es UI, este plan no tiene superficie de aplicación, y está asignado a la Phase 23.

## Threat Flags

Ninguno. El plan no agregó endpoints, rutas de auth, acceso a archivos ni superficie de red: las dos
fronteras de confianza que declara el `<threat_model>` (filas del anon → `groupCatalog`, y `name` →
`title`) son las mismas del 22-01 y siguen cubiertas.

- **T-22-11 (DoS auto-infligido — descartar servicios):** cerrado con la invariante de conservación
  sobre 6 casos × 3 modos, más el caso explícito del colgado y del cross-tenant.
- **T-22-12 (Tampering — persistir el orden desde el display):** cerrado. La función es pura, ordena
  sobre copias (una sola llamada a `.sort()` en todo el módulo, dentro de `ordenadas`), y el test de
  ida y vuelta asierta que los arreglos de entrada quedan intactos.
- **T-22-13 (`title` como vector de inyección):** el módulo sigue propagando `title` como `string`
  plano y no construye marcado en ninguna línea nueva. La restricción de interpolarlo en JSX quedó
  escrita en la cabecera como contrato para la Phase 24.
- **T-22-14 (falsa sensación de aislamiento):** intacto. Ningún comparador filtra por tenant, y el
  test del cross-tenant congela ese contrato: el servicio de otra lista **se muestra** en el grupo de
  los sueltos, no se descarta. El aislamiento real vive en la FK compuesta y en el `.eq()` del caller.
- **T-22-SC (supply chain):** cero paquetes nuevos, `git diff -- package.json package-lock.json`
  vacío.

## Next Phase Readiness

**Listo para el plan 22-03** (los tests de aislamiento contra la base): el módulo puro está completo
y su regla congelada, así que el 22-03 puede concentrarse en lo que sólo se puede medir contra
Postgres — la FK compuesta cross-tenant (T-22-04), la regresión de escritura anónima por las tres
vistas (T-22-03) y el comportamiento del borrado de categoría (T-22-05). **Es el 22-03 el que corre
la suite completa**, por ser el último de la fase.

**Lo que este plan deja explícitamente para otros:**

- **23** — el panel: el write path del reordenamiento (CAT-03) y los controles de reordenar que
  desaparecen cuando el modo no es personalizado (CAT-05, segunda mitad de D-06). El write path va
  **fuera** de este módulo a propósito: meterlo adentro rompería CAT-06.
- **24** — la página pública: el consumidor de `groupCatalog`, que interpola `title` en JSX y nunca
  como marcado (T-22-13).

**Bloqueante conocido:** ninguno.

## Self-Check: PASSED

- `lib/service-categories.ts` — FOUND
- `test/service-categories.test.ts` — FOUND
- Commit `6ae63ce` (RED) — FOUND
- Commit `6ec191f` (GREEN) — FOUND
- Commit `d5f9a7d` (Task 2) — FOUND
- `git rev-list --count f3018a0..HEAD` = **3** (medido, no narrado)
- `npx vitest run test/service-categories.test.ts` → `Tests 22 passed (22)` — OK
- `tsc --noEmit` sin `error TS` fuera de `.next/` — OK

---
*Phase: 22-el-modelo-del-cat-logo*
*Completed: 2026-09-15*
