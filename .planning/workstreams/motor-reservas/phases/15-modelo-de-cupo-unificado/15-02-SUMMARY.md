---
phase: 15-modelo-de-cupo-unificado
plan: 02
subsystem: frontend
tags: [react, nextjs, supabase, postgrest, check-constraint, vitest, integration-tests, multi-tenant]

# Dependency graph
requires:
  - phase: 15-modelo-de-cupo-unificado
    plan: 01
    provides: "migr. 068 aplicada en LOCAL — enum de tres modos, CHECK de coherencia modo↔cupo, DEFAULT 'individual' y el gate services_block_mode_change (P0001)"
  - phase: 12-cupo-por-solape-recurso-simult-neo
    provides: "CapacityModeFields, seedSimultaneousService y los casos de recurso simultáneo que este plan tuvo que volver legales"
provides:
  - "El editor de servicios NO puede producir una combinación que el CHECK de coherencia rechace"
  - "Tercera opción de modo en el segmented control, con 'Individual' primero y como default de alta"
  - "minCapacityFor(): el piso de cupo por modo, espejo del CHECK de la 068"
  - "Mapeo del rechazo de CUPO-08 a copy propia en saveEditService (P0001 + service_mode_has_future_appointments)"
  - "seedGroupClassService(seeded, { capacity, serviceId? }) — el único modo de declarar un escenario grupal desde la 068"
  - "Las dos suites que escriben capacity_mode, VERDES contra el Postgres local con la 068 aplicada"
affects: [15-03, 15-04, 15-05, phase-16, settings-client, concurrency-suite]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Piso de cupo por modo en el cliente como ESPEJO de un CHECK de la base (la autoridad sigue siendo el constraint)"
    - "Guard de test que asierta un rechazo de CHECK (23514) por UPDATE directo, sin pasar por un helper que hace throw"

key-files:
  created: []
  modified:
    - app/(dashboard)/settings/settings-client.tsx
    - test/helpers/booking-fixtures.ts
    - test/concurrency.test.ts
    - test/booking-cualquiera-public.test.ts

key-decisions:
  - "El caso del simultáneo de cupo 1 NO se borró: se convirtió en el guard de que la configuración sigue sin existir (asierta 23514 + relee la fila)"
  - "CR-04 (b) se reencuadró en vez de fusionarse con gap 3: conserva la agenda hermana, que gap 3 no tiene, y el conteo de casos no bajó"
  - "Los 10 errores de ESLint de settings-client.tsx son PREEXISTENTES (probado contra HEAD) y quedan fuera de alcance"

patterns-established:
  - "Para probar un rechazo de constraint desde un test, el intento va con UPDATE directo por t.admin — los helpers de fixtures hacen throw y se llevan el caso puesto"
  - "Un caso que el modelo vuelve imposible se convierte en guard de esa imposibilidad, con nota de qué escenario se perdió y por qué"

requirements-completed: [CUPO-06, CUPO-08]

# Metrics
duration: 35min
completed: 2026-08-12
status: complete
---

# Phase 15 Plan 02: Guard mínimo del editor y de los tests — Summary

**El editor de servicios deja de poder producir una combinación que la 068 rechaza (tercera opción de modo, piso de cupo por modo y mapeo del rechazo de CUPO-08 a copy propia), y las siete escrituras de test que el CHECK de coherencia volvió ilegales quedan legales con las dos suites verdes y el conteo de casos intacto.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-08-12
- **Tasks:** 3
- **Files modified:** 4 (0 creados, 4 modificados)

## Accomplishments

- **El editor y la base dejaron de contradecirse.** Antes de este plan, con la 068 aplicada, elegir "Clase grupal" en `/servicios` rebotaba contra `services_capacity_matches_mode_chk` y el dueño veía un toast genérico sobre una pantalla que hasta ayer funcionaba. Ahora el cambio de modo lleva el cupo en el mismo patch y el piso legal se aplica antes de tocar la red.
- **El modo individual ya se puede ELEGIR, no solo existir en la base.** Es la primera opción del control y el default de alta, que es lo que corresponde al 100 % de los servicios reales.
- **Las siete escrituras ilegales quedaron cerradas, en los DOS sentidos del CHECK.** Cuatro de clase grupal con cupo 1 y tres de recurso simultáneo con cupo 1 — estas últimas a través de un helper que hace `throw`, así que no degradaban: mataban el caso entero con `23514`.
- **Ningún caso se borró.** Los dos escenarios que el modelo vuelve imposibles sobreviven como guards de esa imposibilidad, con la nota de qué se perdió y por qué. Conteo: **20/20** en `concurrency.test.ts` y **7/7** en `booking-cualquiera-public.test.ts` — idéntico al de antes de la 068.
- **El rechazo de CUPO-08 tiene por primera vez una salida de UX.** El gate que 15-01 puso en la base ya no llega al dueño como "Error al guardar".

## Task Commits

Cada task se commiteó de forma atómica:

1. **Task 1: Guard mínimo del editor de servicios (D-10 punto 1, D-06)** — `05624cb` (feat)
2. **Task 2: Fixtures de test alineados a la fuente única del cupo** — `f1b7456` (test)
3. **Task 3: Toda escritura de test que la 068 vuelve ilegal** — `eeec460` (test)

## Files Created/Modified

- `app/(dashboard)/settings/settings-client.tsx` (+67 / −32) — `minCapacityFor()` nuevo; `normalizeCapacity()` acepta un piso; tercera opción en `opts` con `individual` primero; el `onClick` del radio patchea modo **y** cupo; el campo del número pasa de "solo simultáneo" a "todo lo que no sea individual" con `min={2}`; los **cuatro** defaults a `individual`/1 (incluido el `?? 'group_class'` de `openEditService`, que el grep del literal no ve); `addService` y `saveEditService` calculan el cupo como "individual ? 1 : normalizado con piso 2"; `saveEditService` mapea el rechazo del gate.
- `test/helpers/booking-fixtures.ts` (+46 / −12) — `seedGroupClassService(seeded, { capacity, serviceId? })` nuevo; comentarios de `seedSimultaneousService`, `seedTimeBlock` y `seedService` reescritos (los tres afirmaban cosas que la 068 volvió falsas).
- `test/concurrency.test.ts` (+96 / −44) — `afterEach` al DEFAULT nuevo; el caso del simultáneo cupo 1 convertido en guard del `23514`; CR-01 subido a cupo 2 con los conteos corridos un lugar; CR-04 (b) reencuadrado.
- `test/booking-cualquiera-public.test.ts` (+16 / −9) — las tres escrituras (`afterEach` + los dos restablecidos dentro de casos de T-12-11) al DEFAULT nuevo, con el comentario hablando de "un modo que no sea el simultáneo" en vez de nombrar la clase grupal.

## Verificación — output literal

### Task 1 — criterios de aceptación

```
$ F="app/(dashboard)/settings/settings-client.tsx"
1. grep -cF "capacity_mode: 'group_class'" $F      → 0    (esperado 0)   ✓
2. grep -cF "?? 'group_class'" $F                  → 0    (esperado 0)   ✓
3. grep -cF "capacity_mode: 'individual'" $F       → 3    (esperado >=3) ✓
4. grep -cF "key: 'individual'" $F                 → 1    (esperado 1)   ✓
5. grep -c "service_mode_has_future_appointments"  → 1    (esperado 1)   ✓
6. grep -cF "error.code === 'P0001'" $F            → 3    (esperado >=3) ✓
7. git diff -U0 -- $F | grep -cF "+            min={2}"  → 1  (esperado 1) ✓
```

Compilador y linter:

```
$ ./node_modules/.bin/tsc --noEmit ; echo "TSC_EXIT=$?"
TSC_EXIT=0                                  # compilador REAL, nunca npx tsc

$ ./node_modules/.bin/eslint "app/(dashboard)/settings/settings-client.tsx"
✖ 10 problems (10 errors, 0 warnings)
LINT_EXIT=1                                 # ⚠ ver Deviations: los 10 son PREEXISTENTES
```

### Task 2 — criterios de aceptación

```
$ F=test/helpers/booking-fixtures.ts
1. grep -c "export async function seedGroupClassService" $F      → 1  (esperado 1) ✓
2. grep -cF "capacity_mode: 'group_class'" $F                    → 1  (esperado 1) ✓
3. grep -cF "capacity_mode: 'simultaneous_resource'" $F          → 1  (esperado 1) ✓
$ ./node_modules/.bin/tsc --noEmit ; echo "TSC_EXIT=$?"
TSC_EXIT=0
```

### Task 3 — criterios de aceptación

```
1. grep -cF "capacity_mode: 'group_class'" test/concurrency.test.ts               → 0   (esperado 0)   ✓
2. grep -cF "capacity_mode: 'group_class'" test/booking-cualquiera-public.test.ts → 0   (esperado 0)   ✓
3. grep -cF "capacity_mode: 'individual'"  test/concurrency.test.ts               → 1   (esperado >=1) ✓
4. grep -cF "capacity_mode: 'individual'"  test/booking-cualquiera-public.test.ts → 3   (esperado 3)   ✓
5. grep -cE "seedSimultaneousService\(t, \{ capacity: 1 \}\)" test/concurrency.test.ts → 0 (esperado 0) ✓
6. grep -cF "'23514'" test/concurrency.test.ts                                    → 1   (esperado >=1) ✓
```

### Las suites, contra el Postgres LOCAL con la 068 aplicada

```
$ ./node_modules/.bin/vitest run test/concurrency.test.ts test/booking-cualquiera-public.test.ts --no-file-parallelism
 Test Files  2 passed (2)
      Tests  27 passed (27)
   Duration  22.30s
VITEST_EXIT=0
```

Por archivo (corridos por separado para poder declarar el conteo exacto):

```
$ ./node_modules/.bin/vitest run test/concurrency.test.ts
 Test Files  1 passed (1)
      Tests  20 passed (20)      EXIT=0

$ ./node_modules/.bin/vitest run test/booking-cualquiera-public.test.ts
 Test Files  1 passed (1)
      Tests  7 passed (7)        EXIT=0
```

**El conteo NO bajó.** Baseline previo a la 068, medido sobre el árbol antes de tocar nada
(`grep -cE "^\s*(it|test)(\.[a-z]+)?\(" <archivo>`): **20** en `concurrency.test.ts` y **7** en
`booking-cualquiera-public.test.ts`. Post-plan: los mismos 20 y 7, y las dos suites pasan enteras.
**Cero casos caídos por `23514`**: el único lugar del repo donde ese código aparece es como
**aserción** del guard nuevo.

### Estado de la base local (la premisa que hacía falta probar, no asumir)

```
$ docker exec -i supabase_db_forjo-app psql -U postgres -d postgres -c "..."
 capacity_mode | capacity | count
---------------+----------+-------
 individual    |        1 |    10

              conname
------------------------------------
 services_capacity_matches_mode_chk     # la 068 está aplicada en LOCAL ✓
```

### Build y alcance del diff

```
$ npm run build ; echo "BUILD_EXIT=..."
BUILD_EXIT=0

$ git diff --name-only e9e0fdc..HEAD
app/(dashboard)/settings/settings-client.tsx
test/booking-cualquiera-public.test.ts
test/concurrency.test.ts
test/helpers/booking-fixtures.ts
```

Exactamente los **cuatro** archivos declarados. **Ninguno** de `supabase/`, `lib/booking-core.ts` ni
`app/api/` (verificación #3 del plan).

## Decisions Made

- **El caso "simultáneo cupo 1" se convirtió en guard, no se borró.** El escenario dejó de existir por
  construcción del modelo, así que el caso pasa a asertar que **sigue** sin existir: `23514` +
  `services_capacity_matches_mode_chk`, y **releyendo la fila** para probar que el servicio quedó en su
  modo anterior (no se confía en el error). El intento va con `UPDATE` directo por `t.admin` porque
  `seedSimultaneousService` hace `throw` y se llevaría el caso puesto. Lo que el caso probaba antes
  —la 2ª reserva solapada de un cupo 1 se rechaza— ya lo cubren `CONC-02` y el caso del `23P01`.
- **CR-04 (b) se reencuadró en lugar de fusionarse con `gap 3`.** El plan autorizaba fusionarlos "si
  queda redundante", pero no lo queda: `gap 3` **no tiene agenda hermana** ni espacio compartido entre
  dos agendas, y asierta dos start-times; el caso reencuadrado conserva ese setup y asierta que con
  cupo 2 + espacio compartido **todos** los horarios van a `full` (incluidos los que la hermana no
  pisa) y que el write-path devuelve `simultaneous_space_conflict` en el horario que antes era libre.
  Fusionarlos habría bajado el conteo de casos de 20 a 19, que es exactamente lo que el criterio de
  éxito prohíbe.
- **CR-01 sube a cupo 2 con los conteos corridos un lugar y conserva su assert discriminante.** La 2ª
  reserva viva (16:20) solapa al hold vencido: si el hold contara, moriría con `slot_full` sobre un
  cupo de 2. El fixture `seedExpiredHold` no se tocó.
- **El piso de cupo del cliente es espejo, no autoridad.** `minCapacityFor()` lleva escrito que la
  autoridad es `services_capacity_matches_mode_chk`; el `.eq('business_id', ...)` del `update` se
  conservó como defensa en profundidad (T-15-10).
- **El toast del rechazo es copy propia y fija.** No interpola `error.message` ni el nombre del
  servicio (T-15-11 / lección T-14-14 / T-13-09), y discrimina con `error.code === 'P0001'` **más**
  `message.includes('service_mode_has_future_appointments')`, molde exacto de `deleteService`.

## Deviations from Plan

### 1. [Scope boundary] El `<verify>` del Task 1 no puede emitir `LINT_OK`: los 10 errores de ESLint son PREEXISTENTES

- **Encontrado en:** Task 1.
- **Situación:** el `<automated>` del Task 1 encadena `tsc --noEmit && eslint <archivo> && echo LINT_OK`.
  El `eslint` sale **1** con 10 errores en `settings-client.tsx`.
- **Diagnóstico (probado, no supuesto):** se copió la versión de `HEAD` del archivo a
  `app/(dashboard)/settings/zz-baseline-check.tsx` y se linteó → **los mismos 10 errores, mismo exit 1**.
  Son reglas del React Compiler (`react-hooks/set-state-in-effect` ×2, `react-hooks/immutability` ×6,
  `react-hooks/purity` ×2) en el bloque de tema/paleta y en las subidas de logo/foto. **Ninguna** de
  las líneas reportadas cae dentro de los hunks de este plan (verificado contra `git diff -U0 | grep ^@@`).
- **Qué se hizo:** nada — es la SCOPE BOUNDARY del ejecutor (no auto-arreglar issues preexistentes en
  código no tocado). Se registró en
  `.planning/workstreams/motor-reservas/phases/15-modelo-de-cupo-unificado/deferred-items.md`.
- **Gate real cumplido:** `./node_modules/.bin/tsc --noEmit` exit **0** y `npm run build` exit **0**.

---

**Total deviations:** 1 (límite de alcance, no de código).
**Impact on plan:** ninguno sobre el contenido entregado.

## Issues Encountered

- **Ninguno bloqueante.** La conversión de CR-01 a cupo 2 exigió elegir los horarios con cuidado para
  que la 2ª reserva siguiera solapando al hold vencido (si no, el test dejaba de discriminar y pasaba
  igual con el hold contando). Se eligió 16:10 / 16:20 / 16:30 sobre un hold en 16:00-16:30: la 2ª pisa
  el hold y la 3ª ya no lo necesita para llenarse.

## Known Stubs

Ninguno.

## Threat Flags

Ninguna superficie nueva fuera del `<threat_model>` del plan. Cero dependencias npm nuevas
(`package.json` intacto, T-15-SC). El cliente Supabase del panel sigue siendo el del navegador
(anon + RLS): este plan no agrega ninguna llamada nueva a la base.

## Pendiente de verificación humana

El `<human-check>` del Task 1 está declarado en modo **end-of-phase** (se ejecuta al cierre de la fase,
no bloquea este plan). Los cuatro pasos, en `/servicios` contra el dev local con la 068 aplicada:

1. Crear un servicio nuevo sin tocar el control de cupo → se guarda sin error y queda en **Individual**.
2. Abrirlo, elegir **Clase grupal** → aparece el campo de número con **2** y se guarda sin error.
3. Subirlo a 10 y guardar → persiste 10.
4. Volverlo a **Individual** y guardar → persiste con cupo 1.

Ninguno de los cuatro puede terminar en el toast genérico "Error al guardar".

## User Setup Required

Nada nuevo respecto de 15-01. Sigue vigente y **sin hacer**:

- **La 068 NO está aplicada a producción** (última en prod = **067**). El runbook, con su pre-flight y
  su criterio de ABORTO, está en `15-01-SUMMARY.md` §User Setup Required y en el plan 15-05.
- **Este plan es el que destraba el orden de deploy.** El bloqueo que registraba STATE.md
  ("la 068 no debería llegar a prod antes que el guard del editor") queda **cerrado en código**: el
  editor ya es coherente con el CHECK. La coordinación sigue siendo aplicar la 068 a mano junto con el
  deploy de este código.
- `supabase db reset` sigue **sin correrse** (borra los datos de prueba locales): el replay del baseline
  + 040..068 desde cero sigue sin confirmarse. **Requiere el OK del dueño.**

## Next Phase Readiness

**Listo para 15-03/15-04** (las cuatro lecturas del cupo, D-08):

- `seedGroupClassService` ya existe con su `serviceId` opcional, que es exactamente lo que 15-03
  necesita para armar el caso de **dos servicios grupales distintos** coexistiendo en el mismo slot.
- Los comentarios de los fixtures ya no afirman que el cupo grupal vive en el bloque de agenda, así que
  15-03 no arranca leyendo documentación falsa.
- El comentario de `seedTimeBlock` deja escrito el **control negativo** que 15-03 tiene que sostener:
  un bloque de cupo 3 con un servicio individual tiene que seguir dando cupo 1.

**Lo que este plan deliberadamente NO adelantó (sigue siendo CUPO-09, Phase 16):**

- El copy que explique el eje de conteo de cada modo (grupal = por hora de inicio; simultáneo = por
  solape). Acá quedó una línea mínima que solo nombra los tres modos.
- El badge de modo en la lista de `/servicios` y el cupo deshabilitado con estado propio en el modo
  individual.

**Sigue abierto de 15-01:** los casos grupales de `concurrency.test.ts` que declaran el cupo en el
**bloque de agenda** (`seedTimeBlock` con cupo > 1) siguen pasando tal cual — mientras el motor lea el
bloque, son correctos. Su migración a `seedGroupClassService` es de **15-03**, en la misma unidad que el
cambio del RPC. La línea divisoria es exacta: acá entró todo lo que el **CHECK** vuelve ilegal; allá va
todo lo que el **cambio de fuente del cupo** vuelve incorrecto.

## Self-Check: PASSED

Archivos declarados, verificados en disco:

```
FOUND: app/(dashboard)/settings/settings-client.tsx
FOUND: test/helpers/booking-fixtures.ts
FOUND: test/concurrency.test.ts
FOUND: test/booking-cualquiera-public.test.ts
FOUND: .planning/workstreams/motor-reservas/phases/15-modelo-de-cupo-unificado/deferred-items.md
```

Commits declarados, verificados en `git log`:

```
FOUND: 05624cb   FOUND: f1b7456   FOUND: eeec460
```

---
*Phase: 15-modelo-de-cupo-unificado*
*Completed: 2026-08-12*
