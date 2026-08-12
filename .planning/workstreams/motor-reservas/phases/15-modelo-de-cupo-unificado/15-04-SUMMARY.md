---
phase: 15-modelo-de-cupo-unificado
plan: 04
subsystem: booking
tags: [nextjs, route-handler, react, supabase, vitest, integration-tests, multi-tenant, read-path]

# Dependency graph
requires:
  - phase: 15-modelo-de-cupo-unificado
    plan: 03
    provides: "book_slot_atomic leyendo services.capacity en los tres modos + el desacuerdo declarado que este plan cierra"
  - phase: 15-modelo-de-cupo-unificado
    plan: 01
    provides: "migr. 068 aplicada en LOCAL — enum de tres modos, CHECK de coherencia y DEFAULT 'individual'"
provides:
  - "El re-check JS de lib/booking-core.ts deriva el cupo de services.capacity (CUPO-07, D-08)"
  - "app/api/booking/availability/route.ts resuelve el cupo UNA vez por request desde el servicio consultado, con sus TRES consumidores migrados"
  - "El booking público manda serviceId también en el camino específico"
  - "Los cinco seedTimeBlock que 15-03 dejó en N, bajados — y convertidos en el control negativo de ESTE plan"
  - "CUPOS-02 reencuadrado: dos servicios y dos consultas, en vez de dos ventanas de bloque"
affects: [15-05, phase-16, booking-core, availability, booking-client, agenda-client]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Un cupo que deja de ser función del horario y pasa a ser constante por request (cambio de forma, no solo de fuente)"
    - "Bajar un fixture que era parche convierte al caso en el control negativo del plan que lo desbloqueó"

key-files:
  created: []
  modified:
    - lib/booking-core.ts
    - app/api/booking/availability/route.ts
    - app/[slug]/booking-client.tsx
    - test/concurrency.test.ts

key-decisions:
  - "El desacuerdo write-path/read-path se CIERRA, no se mueve: ninguna lectura JS del camino de reserva decide el cupo por time_blocks"
  - "El fallback sin serviceId es 1 — el camino más restrictivo — y es deliberado: sobre-ofrecer produce un rechazo en el create, sub-ofrecer solo esconde un slot"
  - "CUPO-07 (b) CONSERVA su bloque de cupo 3: ahí el número no declara, MIENTE, y es la mentira lo que el caso prueba. Es la única excepción del archivo y está documentada en el propio test"
  - "El re-check JS sigue siendo espejo de UX: no se lo convirtió en autoridad ni se tocó el RPC desde acá"

patterns-established:
  - "Cuando un plan libera un fixture que otro había dejado como parche, ese fixture se vuelve el A/B del plan que lo liberó — y se prueba instalando el archivo VIEJO y viéndolo fallar"
  - "Una resolución de entidad duplicada en dos ramas se iza UNA vez conservando literalmente su anti-tampering y su código de rechazo, y el orden de los rechazos se verifica por grep"

requirements-completed: [CUPO-07]

# Metrics
duration: ~25min
completed: 2026-08-12
status: complete
---

# Phase 15 Plan 04: Las tres lecturas del cupo se alinean con el motor — Summary

**`lib/booking-core.ts`, `app/api/booking/availability/route.ts` (con sus tres consumidores) y el booking público pasan a decidir el cupo con `services.capacity`, el mismo número que el RPC: el desacuerdo que 15-03 dejó DECLARADO queda cerrado, no movido — ninguna lectura del camino de reserva consulta ya `time_blocks.capacity`, y las tres suites que lo cubren se vieron FALLAR contra las versiones viejas antes de pasar con las nuevas.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-08-12
- **Tasks:** 3
- **Files modified:** 4 (0 creados, 4 modificados)

## Accomplishments

- **El desacuerdo se cerró.** Ni `booking-core` ni `availability` consultan `time_blocks.capacity`. La única lectura que queda en todo el árbol es `app/(dashboard)/agenda/agenda-client.tsx:465-474` — la **cuarta**, del panel autenticado, asignada a la **Phase 16** por D-08 y prohibida por los `<constraints>` de este plan. Se buscó una **quinta** y no existe (ver §Barrido).
- **Los tres consumidores de `capacityFor()` migraron, no solo su definición.** La función se **borró entera**: no quedó un call-site huérfano ni la posibilidad de agregar uno.
- **El cupo dejó de ser función del horario.** Es una **constante por request**, derivada del servicio consultado. Es un cambio de **forma**, no solo de fuente, y es lo que hace que la grilla y el motor no puedan volver a divergir por horario.
- **Los cinco `seedTimeBlock` que 15-03 dejó en N bajaron a 1 — y al bajar se convirtieron en el CONTROL NEGATIVO de este plan.** Con el bloque en 1 y el servicio en N, `CONC-01` y `CUPOS-03` **fallan** contra el `booking-core` de HEAD~ (medido abajo). Es exactamente el fallo que 15-03 registró y que este plan tenía que hacer desaparecer.
- **`CUPOS-02` reencuadrado sin ablandar una sola aserción**, y también con A/B: contra el `availability` viejo **falla**.
- **El conteo NO bajó:** `concurrency.test.ts` sigue en **22/22**, y las 8 suites del `<verification>` dan **65/65** con exit 0.
- **La forma de la respuesta pública no cambió:** `{ ok, busy, full }`, sin conteos, sin `capacity`, sin lugares restantes. Asertado ahora en **las dos** respuestas de `CUPOS-02`.

## Task Commits

Cada task se commiteó de forma atómica:

1. **Task 1: el re-check JS del core deriva el cupo del servicio** — `3e8d043` (feat)
2. **Task 2: la grilla pública resuelve el cupo del servicio consultado** — `e20dc52` (feat)
3. **Task 3: el booking público manda el `serviceId` + `CUPOS-02` reencuadrado + los bloques bajados** — `904d7bd` (feat)

## Files Created/Modified

- `lib/booking-core.ts` (+28 / −23) — se borró la constante del día de la semana y la consulta a `time_blocks`; el cupo sale de `Number(service.capacity) || 1`, la fila ya re-validada por `business_id`. La expresión de rechazo temprano quedó **sin tocar**. Tres comentarios reescritos: el del bloque de cupo, el de la LANDMINE del recurso simultáneo (decía que el modo se distinguía por su `time_block`, que ya no es cierto) y el del bypass contra el EXCLUDE, que ahora declara la consecuencia nueva `is_group ⟺ capacity_mode <> 'individual'`.
- `app/api/booking/availability/route.ts` (+64 / −51) — el archivo que más cambia. Una sola resolución de `services` **izada**, `capacityFor()` **borrada**, el `select` de bloques sin `capacity`, y los tres consumidores pasados a la constante.
- `app/[slug]/booking-client.tsx` (+13 / −3) — el `serviceId` deja de estar gateado por el modo simultáneo en el camino específico.
- `test/concurrency.test.ts` (+102 / −71) — `CUPOS-02` reencuadrado a dos servicios y dos consultas; cinco `seedTimeBlock` bajados a su cupo por defecto con el comentario de por qué; el de `CUPO-07 (b)` conservado con la razón escrita.

## El cambio de forma de `availability`, que es lo que hace que esto no sea "cambiar de dónde sale un número"

| | Antes | Después |
|---|---|---|
| Naturaleza del cupo | **función de `time`** (`capacityFor(hhmm)`), evaluada por slot y por turno | **constante por request** (`slotCapacity`), evaluada una vez |
| Fuente | `MAX(time_blocks.capacity)` de los bloques que cubren ese horario | `services.capacity` del servicio consultado |
| Consultas a `services` | **dos**, casi idénticas (rama "Cualquiera" + rama simultánea) | **una**, izada apenas resuelto el negocio |
| Sin `serviceId` | cupo del bloque (podía ser > 1) | **1**, el camino más restrictivo |

Los tres consumidores conservan su semántica exacta:

- **bucle de start-times de "Cualquiera"** — la bifurcación entre "cualquier solape bloquea" (cupo 1) y "solo bloquea si llenó el slot exacto" (cupo > 1) quedó igual; lo único que cambió es que el número ya no depende del horario.
- **armado de `busy`** — antes filtraba turno por turno según el cupo de **su** horario; ahora es una decisión por request (`slotCapacity <= 1 ? live : []`). Es la misma regla, evaluada una vez. **El merge del bloqueo por espacio compartido se conservó incondicional**: un espacio físico es 1-a-la-vez, independiente del cupo.
- **umbral de `full`** — `n >= slotCapacity` en vez de `n >= capacityFor(time)`.

**Por qué el fallback es 1 y no otra cosa:** los dos callers que no mandan `serviceId` son canchas (servicio de cupo fijo 1 ⇒ **byte-idéntico**) y cualquier cliente viejo. Fallar hacia el lado restrictivo es deliberado: **sobre-ofrecer** un horario produce un rechazo en el `create` (el público reserva y recibe un error), **sub-ofrecerlo** solo esconde un slot.

## Verificación — output literal

### Task 1 — criterios de aceptación

```
$ F=lib/booking-core.ts
1. grep -cE "^[[:space:]]*\.from\('time_blocks'\)" $F  → 0   (esperado 0, HEAD tenía 1)  ✓
2. grep -cF "const dow" $F                             → 0   (esperado 0)                ✓
3. grep -cF "Number(service.capacity)" $F              → 1   (esperado 1)                ✓
4. grep -cF "slotCapacity" $F                          → 3   (esperado >= 2)             ✓

$ ./node_modules/.bin/tsc --noEmit ; echo "TSC_EXIT=$?"
TSC_EXIT=0                                   # compilador REAL, nunca npx tsc

$ ./node_modules/.bin/vitest run test/booking-core.test.ts test/manual-booking.test.ts \
    --no-file-parallelism --testTimeout=30000
 Test Files  2 passed (2)
      Tests  12 passed (12)          VITEST_EXIT=0
```

### Task 2 — criterios de aceptación

```
$ F=app/api/booking/availability/route.ts
1. grep -cE "^[[:space:]]*\.select\('start_time, end_time, capacity'\)" $F → 0  (HEAD: 1)  ✓
2. grep -cF ".select('start_time, end_time')" $F                          → 1  (esperado 1) ✓
3. grep -cF "Number(b.capacity)" $F                                       → 0  (HEAD: 1)  ✓
4. grep -cF "'invalid_service'" $F                                        → 1  (HEAD: 2)  ✓
5. grep -cF ".eq('business_id', business.id)" $F                          → 10
   git show HEAD:$F | grep -cF ".eq('business_id', business.id)"          → 11
   ⇒ 11 − 1 = 10: se perdió EXACTAMENTE la del select de servicio unificado, ninguna otra  ✓
6. grep -cF "'any_professional_unsupported'" $F                           → 1  (el rechazo
   del combo no se movió ni se perdió)                                                     ✓
7. grep -cF "capacityFor" $F                                              → 0  (la función se
   BORRÓ entera: no quedó call-site huérfano)                                              ✓

$ ./node_modules/.bin/vitest run test/booking-cualquiera-public.test.ts test/canchas-booking.test.ts \
    --no-file-parallelism --testTimeout=30000
 Test Files  2 passed (2)
      Tests  11 passed (11)          VITEST_EXIT=0
```

`booking-cualquiera-public.test.ts` es la red de regresión del refactor: contiene el A/B que exige que la grilla de la rama "Cualquiera" quede **byte-idéntica** (`expect(despues).toEqual(antes)`) y el caso del camino específico (`DISP-02`).

### Task 3 — criterios de aceptación

```
$ F='app/[slug]/booking-client.tsx'
1. grep -cF "params.set('serviceId'" "$F"                          → 2  (esperado 2)  ✓
2. grep -cF "isSimultaneousResource) params.set('serviceId'" "$F"  → 0  (el gateo por
   modo desapareció)                                                                 ✓

$ grep -cE 'seedTimeBlock\(t, \{ capacity: [2-9]' test/concurrency.test.ts  → 1  ⚠ ver Deviations
   (la única ocurrencia es CUPO-07 (b) :290, el control negativo — las CINCO restantes bajaron)

$ ./node_modules/.bin/vitest run test/concurrency.test.ts --no-file-parallelism --testTimeout=30000
 Test Files  1 passed (1)
      Tests  22 passed (22)          VITEST_EXIT=0      # mismo conteo que 15-03, no bajó

$ git diff --stat 36b0f7e..HEAD
 app/[slug]/booking-client.tsx         |  16 ++--
 app/api/booking/availability/route.ts | 115 ++++++++++++---------
 lib/booking-core.ts                   |  51 ++++++-----
 test/concurrency.test.ts              | 157 +++++++++++++++++--------------
 4 files changed
 # exactamente CUATRO archivos; ninguno de supabase/ ni de app/(dashboard)/     ✓
 # canchas-booking-client.tsx y agenda-client.tsx NO aparecen                   ✓
```

### El A/B — lo que vuelve discriminantes a los tres casos migrados

Los bloques bajados no son cosmética: son el control negativo de este plan. Se instaló el archivo **VIEJO** (el de `36b0f7e`, previo a 15-04) y se corrieron los casos, uno por uno.

**(a) `lib/booking-core.ts` de HEAD~ (el que leía el bloque):**

```
$ git show 36b0f7e:lib/booking-core.ts > lib/booking-core.ts
$ grep -c "from('time_blocks')" lib/booking-core.ts   → 1     # confirmado: el lector viejo está puesto

$ ./node_modules/.bin/vitest run test/concurrency.test.ts --no-file-parallelism -t "CONC-01"
  × CONC-01 — anti-sobrecupo: dos reservas concurrentes sobre el último lugar, solo una confirma
      AssertionError: expected +0 to be 1
      → línea 176: expect(oks.length).toBe(1)
  Tests  1 failed | 21 skipped (22)

$ ./node_modules/.bin/vitest run test/concurrency.test.ts --no-file-parallelism -t "CUPOS-03"
  × CUPOS-03 — admite hasta capacity y rechaza el excedente con slot_full
      AssertionError: expected true to be false
      → línea 220: expect(res.ok).toBe(true)
  Tests  1 failed | 21 skipped (22)
```

Los dos fallan **exactamente** por donde 15-03 predijo: con el bloque en 1 y el servicio en N, el `taken && slotCapacity <= 1` del JS mataba la 2ª alta con `slot_taken` **sin llegar al RPC**. Con el core de este plan, entran.

**(b) `app/api/booking/availability/route.ts` de HEAD~ (con `capacityFor` sobre el bloque):**

```
$ git show 3e8d043:app/api/booking/availability/route.ts > app/api/booking/availability/route.ts

$ ./node_modules/.bin/vitest run test/concurrency.test.ts --no-file-parallelism -t "CUPOS-02"
  × CUPOS-02 — availability no filtra lugares restantes (busy/full sin conteo)
      AssertionError: expected [ '09:00', '10:00', '12:30' ] to not include '09:00'
      → línea 395: expect(fullGrupal).not.toContain('09:00')
  Tests  1 failed | 21 skipped (22)
```

El slot **parcial** (2 de 3) aparecía como **lleno** porque el read-path leía el cupo 1 del bloque mientras el servicio declaraba 3. Es literalmente el drift que D-08 advierte, medido. Los dos archivos se restauraron y el árbol volvió a quedar limpio (`git status --short` sin `lib/` ni `app/`) antes de commitear.

### Verificación del plan

```
$ ./node_modules/.bin/tsc --noEmit ; echo "TSC_EXIT=$?"
TSC_EXIT=0

$ ./node_modules/.bin/vitest run test/concurrency.test.ts test/booking-core.test.ts \
    test/booking-cualquiera-public.test.ts test/booking-public-regression.test.ts \
    test/canchas-booking.test.ts test/manual-booking.test.ts test/abono-generation.test.ts \
    test/staff-assignment.test.ts --no-file-parallelism --testTimeout=30000
 Test Files  8 passed (8)
      Tests  65 passed (65)          VITEST_EXIT=0

$ npm run build ; echo "BUILD_EXIT=$?"
BUILD_EXIT=0
```

**Conteo por archivo** (corrido uno por uno, como pide el plan):

| Suite | Tests | Consumidor del RPC que cubre |
|---|---|---|
| `concurrency.test.ts` | **22/22** | cupos, espacio compartido, simultáneo, seat |
| `booking-core.test.ts` | 5/5 | núcleo compartido |
| `booking-cualquiera-public.test.ts` | 7/7 | booking público + read-path "Cualquiera" |
| `booking-public-regression.test.ts` | 2/2 | booking público |
| `canchas-booking.test.ts` | 4/4 | **canchas** |
| `manual-booking.test.ts` | 7/7 | **alta manual** |
| `abono-generation.test.ts` | 11/11 | **generación forward de abonos** |
| `staff-assignment.test.ts` | 7/7 | asignación "cualquiera" |
| **Total** | **65/65** | los **cuatro** consumidores cubiertos |

### Barrido: ¿queda una quinta lectura?

```
$ grep -rn "capacityFor\|b\.capacity\|block\.capacity\|tb\.capacity" --include=*.ts --include=*.tsx app/ lib/
app/(dashboard)/agenda/agenda-client.tsx:465,467,474,536,638   ← la CUARTA (Phase 16, D-08)
app/(dashboard)/agenda/agenda-client.tsx:184,281,304,785-803   ← el EDITOR de bloques (escritura, no decisión)
```

**No hay quinta.** Las otras consultas a `time_blocks` del árbol (`app/api/agent/context/route.ts`, `lib/landing/derive.ts`, `app/(dashboard)/appointments/page.tsx`, `lib/impersonation.ts`, `app/[slug]/page.tsx`, onboarding) leen **día y ventana**, nunca `capacity`, o traen `select('*')` sin usar la columna para decidir nada. La única lectura que sigue **decidiendo** cupo por el bloque es `agenda-client.tsx`, que es el panel autenticado del dueño: drift de **visualización**, no de reserva, ya anotado y asignado.

## Decisions Made

- **El desacuerdo se cierra, no se mueve.** El criterio real no era "cambiar tres archivos" sino que **ninguna lectura JS del camino de reserva decida el cupo por `time_blocks`**. Por eso se borró `capacityFor()` entera en vez de reapuntarla, y se quitó `capacity` del `select` de bloques: las dos cosas garantizan que nadie la vuelva a usar por costumbre.
- **El re-check JS sigue siendo espejo de UX, en las dos direcciones.** No se lo convirtió en autoridad (la garantía atómica sigue viviendo en el RPC) ni se "mejoró" el RPC desde acá. La divergencia conocida —el JS aplica el buffer del negocio y el `tsrange` del SQL no— se conserva tal cual: gana la base.
- **La resolución del servicio se iza apenas resuelto el negocio, no después del `select` de turnos.** El orden de los rechazos se conserva donde importa: el combo "Cualquiera" + recurso simultáneo sigue devolviendo `any_professional_unsupported` con 400 **antes** de cualquier agregación, y un `serviceId` ajeno sigue muriendo con `invalid_service` 400 — verificado por grep y por los casos `T-12-11 (read)`.
- **`canchas-booking-client.tsx` NO se toca**, y queda **anotado en el comentario** del cambio para que no parezca un olvido: su servicio es de cupo fijo 1 y el fallback del endpoint es 1 ⇒ comportamiento byte-idéntico. Los 4/4 de `canchas-booking.test.ts` lo confirman.
- **`CUPOS-02` se reencuadró a dos SERVICIOS, no a dos ventanas.** El truco viejo (dos bloques de cupos distintos en dos franjas horarias) muere con el cupo por servicio, porque un servicio tiene **un** cupo. Las aserciones se repartieron sin ablandar ninguna, y **la forma del contrato y las claves prohibidas se asiertan en LAS DOS respuestas** — antes se asertaban en una sola.

## Deviations from Plan

### 1. [Rule 4 → resuelto sin cambio arquitectónico] `CUPO-07 (b)` conserva su bloque de cupo 3: el grep da **1**, no **0**

- **Encontrado en:** Task 3, criterio `grep -cE "seedTimeBlock\(t, \{ capacity: [2-9]" == 0`.
- **Qué pedía el plan:** que después de este plan **ningún** caso declarara el cupo en el bloque de agenda.
- **Qué se hizo:** bajaron **las cinco** ocurrencias que 15-03 dejó como parche del re-check JS (`CONC-01`, `CUPOS-03`, `CR2-01 (eje inverso)`, `no-drift (b)`, `CR-03 (a)`) **más** la ventana grupal de `CUPOS-02`, que el plan asignaba explícitamente acá. Quedó **una**: la de `CUPO-07 (b)`.
- **Por qué no se bajó** (probado, no supuesto): en ese caso el número del bloque **no declara nada, MIENTE a propósito** — el servicio es individual (cupo 1) y el bloque dice 3. Es la mentira lo que el caso prueba. Con el bloque en 1, la función **vieja** de la 064 (la que leía el bloque) también daría `is_group = false` y el test pasaría contra **las dos** versiones: perdería todo poder discriminante y dejaría de detectar una lectura apuntando a la columna vieja. Es exactamente el uso que el propio helper `seedTimeBlock` **declara** desde 15-03: *"a partir de acá el parámetro sirve como CONTROL NEGATIVO"*.
- **Qué se hizo en su lugar:** se dejó la ocurrencia con un comentario de seis líneas en el test que dice que es la **única** del archivo, que no es deuda, y por qué bajarla rompería el caso.
- **Alternativa descartada:** esconder el `3` detrás de una constante con nombre para que el grep diera 0. Se rechazó: satisfacer un grep escondiendo el literal es el anti-patrón que la Phase 14 ya registró (*"NO se forzó la clase para satisfacer el grep"*). El criterio se reporta como **1 con la razón escrita**, no como 0.
- **Impacto:** ninguno sobre el objetivo del plan. La afirmación *"ninguna lectura decide el cupo por `time_blocks`"* es verdadera en el **código**; lo que queda en `[2-9]` es un **fixture de test que miente a propósito** para probar justamente eso.

### 2. [Scope boundary] Dos hallazgos de diseño en `booking-client.tsx` quedaron sin tocar

- **Encontrado en:** Task 3, hook de diseño sobre `app/[slug]/booking-client.tsx`.
- **Situación:** el hook reportó `side-tab` (borde de acento lateral) en las líneas **633** y **761** — los dos paneles de resumen de la reserva.
- **Diagnóstico:** son **preexistentes** y están fuera de las líneas que tocó este plan (el cambio vive en `:266-276`, el armado de los parámetros de la consulta). No los causó ninguna edición de esta ola.
- **Qué se hizo:** nada (SCOPE BOUNDARY). No se suprimieron con un ignore ni se "arreglaron" de paso: son decisiones visuales de una pantalla pública en producción y cambiarlas dentro de un plan de read-path sería tocar diseño sin UAT.

### 3. [Scope boundary] La corrida de 8 suites tuvo un crash de worker de Windows, no una falla de test

- **Encontrado en:** verificación del plan.
- **Situación:** la **primera** corrida de las 8 suites terminó con `Error: Worker exited unexpectedly` y exit 1, reportando `Test Files 7 passed (8)` — **pero `Tests 65 passed (65)`**, o sea que ninguna aserción falló.
- **Diagnóstico:** crash del proceso hijo de vitest al cerrar, la trampa de entorno ya documentada en el CONTEXT de la fase. Dos corridas posteriores idénticas dieron **8/8, 65/65, exit 0**.
- **Qué se hizo:** nada sobre los tests. Se declara el resultado estable (exit 0) y el flag usado.

---

**Total deviations:** 3 (una de criterio con razón técnica, dos de límite de alcance). **Ninguna de código entregado de más.**
**Impact on plan:** el objetivo (CUPO-07 / D-08) se cumple entero y el desacuerdo que 15-03 declaró queda **cerrado**.

## Issues Encountered

- **`--reporter=basic` no existe en vitest 4** y hace explotar el runner con `ERR_LOAD_URL` antes de correr un solo test. Se descartó el flag; el conteo por archivo se obtuvo corriendo las suites una por una.
- **El `if (any && serviceIdParam)` pasó a `if (any && svc)`** para que TypeScript pudiera estrechar el tipo del servicio izado dentro de la rama. Es equivalente por construcción: `svc` es no-nulo exactamente cuando llegó un `serviceId` válido, porque el caso inválido ya retornó 400 arriba.
- **`git show <ref>:<file> > <file>` es el único modo seguro de hacer el A/B acá**, sin `git stash` (prohibido: el stash es global entre worktrees) y sin `git checkout --` sobre el árbol entero. Los dos archivos se restauraron desde una copia en el scratchpad y se verificó `git diff --stat` limpio antes de commitear.

## Known Stubs

Ninguno.

## Threat Flags

Ninguna superficie nueva fuera del `<threat_model>` del plan. Cero endpoints nuevos, cero columnas nuevas, cero dependencias npm nuevas (**T-15-SC**). Los cuatro mitigate del registro quedaron cubiertos y verificados ejecutando:

- **T-15-20** (tampering del `serviceId` que ahora llega siempre) — la resolución izada conserva `.eq('business_id', business.id)` y el `invalid_service` 400. El conteo de filtros por tenant bajó **exactamente 1** (el del select unificado) y ninguno más.
- **T-15-21** (fuga del cupo en la respuesta pública) — `slotCapacity` vive server-side; la respuesta sigue siendo `{ ok, busy, full }` con `full` booleano por slot. Cubierto por `CUPOS-02`, que ahora asierta el contrato y las 8 claves prohibidas en **las dos** respuestas.
- **T-15-22** (drift entre grilla y motor) — las tres lecturas cambiaron en el **mismo plan** y derivan del mismo campo; verificado con el A/B de byte-identidad de la rama "Cualquiera" y la suite de carrera completa.
- **T-15-23** (fallback sin `serviceId`) — cae a **1**, el camino más restrictivo. Canchas byte-idéntico (4/4).
- **T-15-24** (unificación de las dos re-validaciones) — el orden de los rechazos se conserva: `any_professional_unsupported` sigue con 400 antes de cualquier agregación (grep `== 1` + caso `T-12-11 (read)` verde).
- **T-15-25** (grilla del panel, 4ª lectura) — sigue `accept`, fuera de alcance por decisión de fase.

## User Setup Required

**La 068 SIGUE SIN APLICARSE A PRODUCCIÓN.** Última migración en prod = **067**. Este plan **no toca `supabase/`** y no agrega ninguna condición nueva al runbook, que sigue estando en `15-01-SUMMARY.md` §User Setup Required y en el plan 15-05.

Lo que **sí** cambia para el deploy: con este plan el código del read-path y el del write-path pasan a **exigir la 068 juntos**. El árbol ya no tiene el desacuerdo transitorio, así que el corte es limpio — pero el orden no se relaja: la 068 se aplica **a mano**, entera, en una sola transacción, con el pre-flight que **aborta si `max(capacity) from time_blocks > 1`**, coordinada con el deploy del código.

## Next Phase Readiness

**Listo para 15-05** (la suite de integración del gate de CUPO-08 + el runbook de la 068):

- Las **tres** lecturas del cupo del camino de reserva están alineadas con el motor. Queda la **cuarta** (`app/(dashboard)/agenda/agenda-client.tsx:465-474` + el `isGroup` de presentación de `:638`), asignada a la **Phase 16** por D-08.
- El árbol ya **no** está en estado de desacuerdo: el blocker que 15-03 abrió en STATE.md se cierra con este plan.
- `concurrency.test.ts` quedó en **22/22** con tres casos que ahora tienen control negativo propio contra las versiones viejas de `booking-core` y `availability`, además de los dos de 15-03 contra la función de la 064.

**Lo que este plan deliberadamente NO hizo:**

- **Tocar `agenda-client.tsx`** (Phase 16, prohibido por los `<constraints>`).
- **Tocar `canchas-booking-client.tsx`** — byte-idéntico por construcción, con la razón anotada en el código.
- **Convertir el re-check JS en autoridad** ni tocar el RPC. La autoridad atómica del cupo sigue siendo `book_slot_atomic`.
- **Dropear `time_blocks.capacity`.** La columna se conserva (diferido del milestone); el editor de bloques de la agenda la sigue escribiendo.

## Self-Check: PASSED

Archivos declarados, verificados en disco:

```
FOUND: lib/booking-core.ts
FOUND: app/api/booking/availability/route.ts
FOUND: app/[slug]/booking-client.tsx
FOUND: test/concurrency.test.ts
FOUND: .planning/workstreams/motor-reservas/phases/15-modelo-de-cupo-unificado/15-04-SUMMARY.md
```

Commits declarados, verificados en `git log`:

```
FOUND: 3e8d043   FOUND: e20dc52   FOUND: 904d7bd
```

---
*Phase: 15-modelo-de-cupo-unificado*
*Completed: 2026-08-12*
