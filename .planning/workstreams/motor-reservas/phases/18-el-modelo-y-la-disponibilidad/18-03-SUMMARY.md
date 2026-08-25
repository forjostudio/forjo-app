---
phase: 18-el-modelo-y-la-disponibilidad
plan: 03
subsystem: booking
tags: [disponibilidad, read-path, agenda-por-servicio, comodin, integracion-db-local]

# Dependency graph
requires:
  - phase: 18-el-modelo-y-la-disponibilidad
    plan: 01
    provides: "la tabla puente `time_block_services` (migr. 071), aplicada en el Postgres LOCAL"
  - phase: 18-el-modelo-y-la-disponibilidad
    plan: 02
    provides: "`startTimesNotOffered` — la regla del comodín como resta de conjuntos, fuente única"
  - phase: 10-cualquiera-profesional
    provides: "el molde de uso de un helper puro dentro de este mismo route handler (`professionalsForService`) y la suite `booking-cualquiera-public.test.ts` como molde de integración"
provides:
  - "`app/api/booking/availability/route.ts`: los horarios de las franjas que no dan el servicio pedido se suman a `full` en las TRES ramas (AGENDA-03)"
  - "`test/helpers/booking-fixtures.ts` → `seedTimeBlockService`: siembra una fila de la puente sobre un tenant ya sembrado"
  - "`test/availability-service-window.test.ts`: 7 casos de integración contra la DB local, los que miden CON filas mapeadas"
  - "La cero regresión de AGENDA-04 medida, no asumida: sin `serviceId` y con la puente vacía la respuesta no cambia"
affects: [18-04, phase-19-ui-de-configuracion, phase-20-booking-publico]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sumar a `full` en vez de filtrar la entrada: el endpoint devuelve lo que se OCULTA, no la grilla"
    - "Cálculo izado una sola vez antes de las ramas cuando una de ellas retorna temprano (una lectura de la puente por request)"
    - "Prueba de mordida sobre un control negativo que es verde ANTES y DESPUÉS del cambio: se invierte la regla concreta que dice congelar y se verifica que cae"

key-files:
  created:
    - "test/availability-service-window.test.ts"
  modified:
    - "app/api/booking/availability/route.ts"
    - "test/helpers/booking-fixtures.ts"

key-decisions:
  - "El gate del cálculo es `svc && serviceIdParam` (la fila del servicio YA re-validada por tenant, más el parámetro): sin servicio resuelto no se lee la puente ni se oculta nada. Es lo que mantiene byte-idénticas a canchas y a los clientes viejos (AGENDA-04) y lo que hace que el read de la puente no exista para el request que no lo necesita"
  - "`notOffered` se calcula ANTES de la rama 'Cualquiera' y no dentro de cada rama: esa rama retorna temprano, así que un cálculo por rama habría duplicado el código y, peor, habría dejado abierta la puerta a que las tres divergieran. Una lectura de `time_block_services` por request, verificada por grep = 1"
  - "Se concatena sin mutar (`fullX.concat(notOffered)`) en los tres returns en vez de hacer push: en el return final `full` ya viene mutado por el bloque de espacio compartido, y mezclar los dos estilos sobre el mismo arreglo es exactamente cómo nace un bug de orden"
  - "La lectura de la puente lleva `.eq('business_id', business.id)` explícito aunque corra con service role (que bypassa RLS): mismo criterio que la lectura de `professional_services` que el archivo ya hacía. El anti-tampering queda con doble control — la resolución izada corta con `invalid_service` 400 y la query acota por tenant"
  - "`capBlocks` pasa a traer `id`. Es la única columna nueva y NUNCA se serializa: el contrato `{ ok, busy, full }` no cambia de forma"

patterns-established:
  - "Un caso de test que asierta AUSENCIA (`not.toContain`) es verde tanto antes como después de implementar la regla: no puede figurar como parte del RED esperado, y su valor se demuestra con una mordida contra la implementación INGENUA, no contra el estado previo"

requirements-completed: [AGENDA-03, AGENDA-04]

# Metrics
duration: 22min
completed: 2026-08-25
status: complete
---

# Phase 18 Plan 03: La disponibilidad respeta la agenda por servicio Summary

**`/api/booking/availability` dejó de ofrecer los horarios de las franjas que no dan el servicio pedido — en sus tres ramas, sumando a `full` en vez de filtrar los bloques, con la regla importada del helper del Plan 02 — y quedó medido con 7 casos de integración contra la DB local que ejercitan los escenarios CON filas mapeadas, los únicos capaces de distinguir "la regla existe" de "la regla no existe".**

## Performance

- **Duration:** ~22 min
- **Completed:** 2026-08-25
- **Tasks:** 2 (fixture + suite, endpoint), 2 commits

## What Was Built

### Task 1 — El fixture de la puente y la suite (commit `e39b3cd`)

**`test/helpers/booking-fixtures.ts` → `seedTimeBlockService`** — molde literal de su hermana `seedProfessionalService` (service-role insert, sin retorno porque la PK no es un id sintético, `throw` contextualizado). El comentario deja escrito que el teardown por CASCADE del negocio ya limpia estas filas y —lo que importa— que sembrar **una sola** fila cambia el modo de esa franja de comodín a mapeo explícito: es el único interruptor que estos tests pueden accionar.

**`test/availability-service-window.test.ts`** — `describe.skipIf(!hasSupabaseCreds)`, invoca el route handler **real** (`GET as availabilityGET`) con la fecha sentinela `'2031-03-03'` (lunes, dow=1). Escenario compartido: buffer 0, servicios de 30', y **tres** franjas del lunes — A 09:00-12:00, B 12:00-15:00 y **C 09:00-12:00 solapando a A a propósito**. Grilla resultante: mañana `09:00…11:30` (A/C), tarde `12:00…14:30` (B, la franja comodín de control).

| # | Caso | Qué mide |
|---|---|---|
| 1 | filas + servicio NO mapeado | AGENDA-03: la mañana se oculta, la tarde no |
| 2 | filas + servicio SÍ mapeado | control: distingue "aplica la regla" de "oculta todo" |
| 3 | puente vacía (comodín) | cero regresión D-02 — **y por sí solo no prueba nada** |
| 4 | franjas solapadas, una SÍ da | control negativo de la resta de conjuntos |
| 5 | rama "Cualquiera" (`any=1`) | la rama que retorna temprano también respeta la regla |
| 6 | rama recurso simultáneo | ídem, con el service en `simultaneous_resource` cupo 2 |
| 7 | sin `serviceId` | AGENDA-04: canchas y clientes viejos sin cambio |

El `afterEach` devuelve el estado al inicial (puente vacía, sin profesionales extra, servicios en `individual`/1) — el caso 6 muta `svc2` y el tenant se comparte, que es la advertencia que trae el propio `seedSimultaneousService`.

### Task 2 — El endpoint (commit `759ae1c`)

Tres cambios en `app/api/booking/availability/route.ts`:

**(a)** `capBlocks` pasa de `select('start_time, end_time')` a `select('id, start_time, end_time')`. Sin el id no hay con qué cruzar contra la puente. Aditivo: el id nunca se serializa.

**(b)** Inmediatamente después de `toMin` —o sea **antes** de la rama "Cualquiera", que retorna temprano— se declara `notOffered`. Con servicio resuelto se lee `time_block_services` filtrada por `.eq('business_id', business.id)` y se llena con `startTimesNotOffered(serviceIdParam, capBlocks, tbsRaw, duración)`. El bloque lleva el comentario con la trampa central (el endpoint devuelve lo que se **oculta**, no la grilla ⇒ filtrar los bloques ofrecería **de más**), el porqué de la fuente única (AGENDA-02, tres capas), el porqué del cálculo izado, los dos fail-safes y el caveat de `schedule_exceptions`.

**(c)** `notOffered` se concatena en los **tres** `return Response.json({ ok: true, ... })`: rama "Cualquiera", rama de recurso simultáneo y return final (donde `full` ya venía mutado por el bloque de espacio compartido).

## El RED del Task 1 — y la corrección de calibración del plan

El plan declaraba que al terminar el Task 1 la suite tenía que fallar en **exactamente los casos 1, 4, 5 y 6**. La medición real fue **3 failed | 4 passed**: cayeron **1, 5 y 6** — uno por rama — y el **caso 4 quedó verde**.

**No es un caso mal escrito: la expectativa del plan era la equivocada.** El caso 4 asierta una **ausencia** (`las 09:00 NO están en full`), y el endpoint de entonces no ocultaba **nada**, así que la satisfacía trivialmente. Un caso que asierta ausencia no puede figurar en el RED esperado de un cambio que sólo **agrega** ocultamientos: es verde antes y verde después. Su valor no es contra el estado previo — es contra la implementación **ingenua**.

Y eso se midió en vez de argumentarse. **Prueba de mordida:** se quitó a mano la resta de conjuntos de `startTimesNotOffered` (dejando la lectura ingenua "ocultar los horarios de las franjas que no lo dan") y se corrieron las dos suites:

| Suite | Caso que cayó |
|---|---|
| `availability-service-window` | **4. CONTROL NEGATIVO (solape)** — el que el plan esperaba rojo por el motivo equivocado |
| `time-block-services` | `CONTROL NEGATIVO de la resta: dos franjas solapadas que arrancan a la misma hora` |

**2 failed | 21 passed (23)**. Restaurado con `git checkout -- lib/time-block-services.ts` (verificado: `grep -c MORDIDA-TEMP` = 0 y `git status --short` sólo mostraba el route handler). El caso 4 muerde exactamente el bug que T-18-13 describe como *silencioso*, que es para lo que existe.

Los tres casos que sí estaban rojos (1, 5 y 6) cubren **una rama cada uno**, así que el RED demostró lo que tenía que demostrar: que ninguna de las tres ramas aplicaba la regla.

## Deviations from Plan

**Ninguna regla de desviación (1-4) aplicada.** No hubo bugs que arreglar, funcionalidad crítica faltante ni bloqueos. Se tocaron **exactamente** los tres archivos declarados; cero `.tsx`, cero paquetes nuevos.

Una única divergencia respecto de la letra del plan, ya explicada arriba y del lado del rigor: el criterio `<done>` del Task 1 ("falla en exactamente los casos 1, 4, 5 y 6") **no se cumple ni puede cumplirse** — el caso 4 asierta ausencia. En vez de reescribir el caso 4 para forzar el rojo (que lo habría convertido en un caso distinto y peor), se lo dejó como está y se demostró su mordida contra la implementación ingenua.

## Threat Model — estado

| Threat ID | Disposition | Estado al cerrar el plan |
|---|---|---|
| T-18-11 | mitigate | **Cerrado**: `notOffered` se concatena al MISMO arreglo `full` que ya mezcla lleno / agenda ocupada / espacio tomado. El contrato `{ ok, busy, full }` no cambió de forma (grep: siguen siendo exactamente 3 salidas exitosas) y el motivo del ocultamiento no viaja. El `id` de la franja se lee pero jamás se serializa |
| T-18-12 | mitigate | **Cerrado con doble control**: la resolución izada corta con `invalid_service` (400) si el `serviceId` no es del negocio del slug, **y** la lectura de la puente lleva `.eq('business_id', business.id)` explícito aunque corra con service role. Verificado por grep = 1 |
| T-18-13 | mitigate | **Cerrado por medición, no por lectura**: la implementación suma a `full` (nunca filtra `capBlocks`), la regla la resuelve el helper del Plan 02, y la mordida de arriba prueba que el caso 4 cae con la implementación ingenua |
| T-18-14 | mitigate | **Cerrado**: el cálculo está gateado por `svc && serviceIdParam`. Caso de test 7 verde + `canchas-booking.test.ts` y `booking-public-regression.test.ts` sin regresión |
| T-18-15 | accept | Sin cambios — **lo cierra el Plan 18-04** (backstop en `createAppointmentCore`, D-04). El read-path es UX, no el control |
| T-18-16 | accept | Sin cambios. El caveat de `schedule_exceptions` quedó **escrito en el código**, arriba del cálculo, con su porqué y con el puntero al backstop |
| T-18-SC | accept | **Cero paquetes nuevos**: `git diff -- package.json package-lock.json` vacío (0 bytes) |

## Verification Results

| # | Criterio del plan | Esperado | Resultado |
|---|---|---|---|
| 1 | `./node_modules/.bin/tsc --noEmit` · `npm run build` | exit 0 / exit 0 | ✅ **0** / ✅ **0** |
| 2 | `npx vitest run test/availability-service-window.test.ts` | 0 failed, **0 skipped** | ✅ **7 passed (7)**, sin skip |
| 3 | No-regresión: `booking-cualquiera-public` + `booking-public-regression` + `canchas-booking` + `concurrency` | 0 failed | ✅ **64 passed (64)** en 6 archivos (con `time-block-services`) |
| 4 | `grep -cE "^import .*time-block-services"` | 1 | ✅ **1** |
| 4 | `grep -cE "startTimesNotOffered\("` | ≥ 1 | ✅ **1** |
| 4 | `grep -cE "\.from\('time_block_services'\)"` | **1** (una sola lectura) | ✅ **1** |
| 4 | `grep -cE "\.concat\(notOffered\)"` | ≥ 3 (las tres ramas) | ✅ **3** |
| 4 | `grep -cE "return Response\.json\(\{ ok: true"` | **3** | ✅ **3** |
| 5 | `git diff --name-only` toca exactamente los archivos del plan | 3 en total | ✅ Task 1: `booking-fixtures.ts` + suite nueva · Task 2: sólo `availability/route.ts` |
| 5 | `git diff` de los dos `.tsx` públicos | vacío | ✅ **0 bytes** |
| 6 | `git diff -- package.json package-lock.json` | vacío | ✅ **0 bytes** |
| — | `grep -cF "seedTimeBlockService" test/helpers/booking-fixtures.ts` | ≥ 1 | ✅ **2** (definición + comentario) |
| — | `grep -cE "^  it\(" test/availability-service-window.test.ts` | ≥ 7 | ✅ **7** |

**Nota de gate:** no se corrió `npx vitest run` completo a propósito (suites de abono flaky en paralelo, restricción declarada en el plan). Las suites nombradas se corrieron con `--no-file-parallelism`. `tsc --noEmit` + `npm run build` cubren el resto del repo.

## Known Stubs

Ninguno. El endpoint aplica la regla de punta a punta y está medido. Lo que **no** hace —y no es un stub sino el reparto de la fase— es tener UI para escribir el mapeo (Phase 19) ni explicarle al público por qué un horario no aparece (Phase 20); mientras tanto la puente se siembra a mano, que es lo que asume el `uat_script`.

## UAT pendiente

El `uat_script` del plan (navegador contra el Supabase local, sembrando una fila de la puente por `psql` porque todavía no hay UI) **no se ejecutó** en este pase: la verificación fue automatizada contra el route handler real. Queda para el `/gsd:verify-work` de la fase.

## Next Plan

**18-04** — el backstop de D-04: `createAppointmentCore` deja de aceptar un turno cuyo horario cae en franjas que no dan el servicio, usando `isServiceAllowedAt` del mismo helper. Es lo que cierra T-18-15, aceptado acá justamente porque ese plan lo cubre dentro de la misma fase.

## Self-Check: PASSED

- Archivos verificados en disco: `app/api/booking/availability/route.ts`, `test/availability-service-window.test.ts`, `test/helpers/booking-fixtures.ts`.
- Commits verificados en git: `e39b3cd` (fixture + suite), `759ae1c` (endpoint).
