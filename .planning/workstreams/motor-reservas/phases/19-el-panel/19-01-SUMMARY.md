---
phase: 19-el-panel
plan: 01
subsystem: api
tags: [typescript, vitest, agenda, time-blocks, pure-functions, multi-tenant]

# Dependency graph
requires:
  - phase: 18-la-agenda-por-servicio
    provides: "lib/time-block-services.ts (las 4 funciones puras de la regla del comodin + el contrato D-16) y su suite"
provides:
  - "servicesOfBlock / isBlockWildcard: la pregunta INVERSA de la franja, para que el panel no reimplemente la regla del comodin en el JSX (AGENDA-02, AGENDA-06)"
  - "lib/agenda-hours-payload.ts: el contrato del guardado por diff (payload completo, sin cupo, re-derivacion del estado desde la base)"
  - "Los tipos AgendaBlockDraft / AgendaDayDraft / SavedAgendaBlock / AgendaBlockPayload que consumen los Planes 19-02, 19-04 y 19-05"
  - "Dos controles negativos ejecutables de las trampas caras de la fase: P-01 (doble guardado duplica) y P-03 (el payload por consultorio borra las otras sedes)"
affects: [19-02, 19-04, 19-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Modulo puro que DECIDE + UI que solo PINTA (molde lib/agenda-occupancy.ts) aplicado al write path, no solo al read path"
    - "Prueba de mordida manual: reintroducir el bug a proposito y verificar que el test se pone rojo antes de dar el caso por bueno"

key-files:
  created:
    - lib/agenda-hours-payload.ts
    - test/agenda-hours-payload.test.ts
  modified:
    - lib/time-block-services.ts
    - test/time-block-services.test.ts

key-decisions:
  - "Se descarta la clave temporal por bloque (tmp_key) que recomendaba el research: la re-derivacion completa del estado desde las filas que devuelve la base elimina la clase de bug de correlacion en vez de administrarla"
  - "isBlockWildcard delega en servicesOfBlock (misma travesia) para que las dos respuestas no puedan divergir, igual que isServiceScheduled se apoya en blocksForService"
  - "buildSaveHoursPayload no acepta ningun parametro de consultorio: el filtro por sede es de la vista, no del guardado (P-03 cerrado por firma, no por cuidado)"
  - "AgendaDayDraft es generico sobre el shape del bloque para que agenda-client pueda sumarle su campo de error sin castear en el call site"

patterns-established:
  - "Pattern: la pregunta directa y la inversa de la misma regla viven en el mismo modulo y una delega en la otra"
  - "Pattern: el contrato de un guardado por diff (que viaja y como queda el estado despues) se testea con objetos planos, sin base ni navegador"

requirements-completed: [AGENDA-05, AGENDA-06]

# Metrics
duration: 12min
completed: 2026-08-26
status: complete
---

# Phase 19 Plan 01: Los dos modulos puros del panel Summary

**`servicesOfBlock` / `isBlockWildcard` (la pregunta inversa de la franja) mas `lib/agenda-hours-payload.ts` con el contrato del guardado por diff — 36 tests verdes y las dos trampas caras de la fase (P-01, P-03) cerradas con controles negativos verificados por mordida.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-26T00:03:00Z
- **Completed:** 2026-08-26T00:15:00Z
- **Tasks:** 2 (ambas TDD: RED → GREEN)
- **Files modified:** 4 (2 creados, 2 modificados)

## Accomplishments

- El panel ya puede responder "esta franja es comodin" con la MISMA funcion que el motor. `isBlockWildcard` delega en `servicesOfBlock`, asi que no hay forma de que las dos respuestas diverjan, y ninguna acepta una nocion de vigencia — el matiz D-11 (una franja cuyo unico mapeo es a un servicio desactivado NO es comodin) queda congelado por la FIRMA, no por un comentario.
- Las tres reglas del guardado que hoy viven enterradas adentro de `saveHours()` salieron del componente a un modulo puro: el set es completo (7 dias x todos los consultorios), el cupo del bloque no viaja, y el estado post-guardado se re-deriva de lo que devuelve la base.
- Las dos trampas que solo se ven en produccion —el segundo guardado que duplica y el payload por consultorio que borra la otra sede— ahora fallan en rojo si alguien las reintroduce. Las dos se verificaron **reintroduciendo el bug a proposito** (ver §Pruebas de mordida).
- Cero dependencias nuevas, cero lineas borradas del modulo asegurado de la Phase 18.

## Task Commits

1. **Task 1 (RED): tests de la pregunta inversa** — `d5fc596` (test) — 8 casos nuevos, todos rojos (`isBlockWildcard is not a function`)
2. **Task 1 (GREEN): `servicesOfBlock` + `isBlockWildcard`** — `1f2107f` (feat) — 24/24 verdes
3. **Task 2 (RED): suite del contrato del guardado** — `86cfc03` (test) — 12 casos, suite roja (el modulo no existia)
4. **Task 2 (GREEN): `lib/agenda-hours-payload.ts`** — `34c896e` (feat) — 12/12 verdes

**Plan metadata:** ver commit `docs(19-01)` posterior.

_Sin commit de REFACTOR: no hizo falta limpiar nada despues del GREEN._

## Files Created/Modified

- `lib/time-block-services.ts` — **+43 lineas, 0 borradas.** Dos funciones nuevas al final del archivo. Las 4 funciones de la Phase 18 (`threats_open: 0`) quedaron intactas byte a byte.
- `test/time-block-services.test.ts` — **+65.** Dos `describe` nuevos (suites 5 y 6) reusando las factories `block()` / `map()` que ya estaban.
- `lib/agenda-hours-payload.ts` — **nuevo, 202 lineas.** 2 funciones + 4 tipos exportados + 3 helpers locales. Cero imports.
- `test/agenda-hours-payload.test.ts` — **nuevo, 184 lineas.** 3 `describe`, 12 `it`, cero Supabase.

## Verificacion (los 9 puntos del plan)

| # | Chequeo | Resultado |
|---|---|---|
| 1 | `./node_modules/.bin/tsc --noEmit` | exit **0** |
| 2 | `npx vitest run` de las dos suites nombradas | **36 passed**, 0 failed, 0 skipped |
| 3 | `^export function ` en `time-block-services` / `agenda-hours-payload` | **6** / **2** |
| 4 | `^import ` en `time-block-services` = 1 (`import type`); imports sucios en `agenda-hours-payload` | **1** / **0** |
| 5 | `\bcapacity\b` (case-insensitive) en `agenda-hours-payload` | **0** |
| 6 | lineas borradas en `lib/time-block-services.ts` | **0** |
| 7 | pruebas de mordida | ver abajo, las dos rojas |
| 8 | archivos tocados vs. el frontmatter | exactamente los **4** |
| 9 | `git diff -- package.json package-lock.json` | **vacio** |

Extra: `npx eslint` sobre los 4 archivos sale limpio (exit 0). `npm run lint` completo se corto por timeout de 2 min en esta maquina — no es un gate de este plan (lo es del 19-04/19-05) y se sustituyo por el eslint acotado.

## Pruebas de mordida (los controles negativos, verificados de verdad)

Las dos se ejecutaron a mano sobre el codigo ya verde, se observo el rojo, y se restauro el archivo desde una copia previa (working tree limpio despues, verificado con `git status`).

**T-19-01 — vigencia adentro de `isBlockWildcard`.** Se le agrego un filtro `bridge.filter(r => r.active !== false)` y al caso 7 una fila con `active: false`.
→ **1 failed | 23 passed.** El unico rojo fue *"EL CASO MORDEDOR (D-11): franja cuyo unico mapeo es a un servicio DESACTIVADO ⇒ false"*. El control negativo muerde exactamente donde debe: si alguien "arregla" la funcion filtrando inactivos, el panel pintaria "Cualquier servicio" sobre una franja que el publico ve restringida, y el test lo frena.

**T-19-03 — filtro por consultorio en `buildSaveHoursPayload`.** Se le sumo un parametro `activeLoc` opcional que descarta los bloques de otras sedes.
→ **1 failed | 11 passed.** El unico rojo fue *"CONTROL NEGATIVO de P-03: con dos consultorios en el mismo dia viajan LOS DOS bloques"*. Los otros 11 casos pasaron con el bug adentro — que es precisamente el punto: sin ese caso, la regresion que borra la sede B pasaria la suite entera.

## Decisions Made

- **Se descarta `tmp_key` (Open Question 2 del research).** El research proponia que el cliente mandara una clave temporal por bloque y el RPC la devolviera para correlacionar payload ↔ retorno. Se eligio la re-derivacion completa: `buildDayStatesFromRows` reconstruye los 7 dias desde las filas que devuelve la base, sin correlacionar nada. Al no existir correlacion, no existe la clase de bug de correlacion — es estrictamente mas simple y elimina el modo de falla en vez de administrarlo. Consecuencia para el Plan 19-05: el RPC no necesita `WITH ORDINALITY` ni eco de claves, solo devolver el set resultante.
- **`isBlockWildcard` delega en `servicesOfBlock`** en vez de implementar su propio `.some(...)`: mismo criterio que `isServiceScheduled` sobre `blocksForService` (`:116`). Cuesta una travesia mas y compra la imposibilidad de que las dos respuestas diverjan.
- **La firma de `buildSaveHoursPayload` cierra P-03, no un comentario.** No hay parametro de consultorio: para reintroducir el bug hay que cambiar la firma, que es un cambio visible en review. `hasLocations` (booleano) es lo unico que entra sobre sedes, y solo para conservar la regla de hoy (`agenda-client.tsx:377`).
- **`AgendaDayDraft` es generico sobre el bloque.** El Plan 19-04 va a definir `LocalBlock = AgendaBlockDraft + { error?: string }`; con el generico lo puede pasar directo, sin declarar dos formas del mismo objeto ni castear.
- **`uniqueIds` conserva el orden de entrada.** La puente no tiene orden, pero un payload estable entre dos guardados identicos hace el diff del RPC mas facil de razonar y la ida y vuelta del test 12 comparable.

## Deviations from Plan

None — plan executed exactly as written. Los dos modulos, las 4 firmas y los 20 casos de test salieron como el plan los describia.

Nota menor (no es desviacion de alcance): el gate opcional `npm run lint` completo se corto por timeout en esta maquina y se reemplazo por `npx eslint` sobre los 4 archivos tocados, que sale limpio. `npm run lint` no figura en el `<verify>` de ninguna de las 2 tareas de este plan.

## Issues Encountered

- **`npx vitest run` completo no se corrio a proposito** (constraint del plan: las suites de abono son flaky en paralelo en esta maquina). Se corrieron las dos suites nombradas.
- **`npm run lint` timeout a los 2 min.** Resuelto con eslint acotado a los archivos del plan. Vale la pena tenerlo en cuenta para los Planes 19-04/19-05, donde el lint completo SI es un gate: conviene correrlo con timeout ampliado o acotado a los archivos tocados.

## Known Stubs

Ninguno. Los dos modulos estan completos y consumidos por tests reales; el cableado a la UI es de los Planes 19-04 y 19-05 por diseño de la fase (asi lo declara la tabla de artefactos del plan).

## Threat Flags

Ninguna superficie de seguridad nueva. Los dos modulos son puros, no tocan red ni base, no reciben credenciales y no deciden aislamiento: el contrato D-16 (el caller filtra ANTES) esta escrito en el JSDoc de las dos funciones nuevas y congelado por el caso de test 4. El payload que arma `buildSaveHoursPayload` es entrada NO confiable para el RPC del Plan 19-02, que es donde vive la validacion (`auth.uid()` + RLS + los REVOKE de P-02).

## Next Phase Readiness

Listo para el **Plan 19-02** (la migracion 074): el shape del payload ya esta fijado por `AgendaBlockPayload` y el del retorno por `SavedAgendaBlock` — la funcion SQL tiene que devolver exactamente esas 7 columnas, **sin** ninguna clave de cupo y **sin** necesidad de eco de claves temporales.

Para el **19-04**: `LocalBlock` = `AgendaBlockDraft` + `error?`, y el inicializador de `dayStates` pasa a ser una llamada a `buildDayStatesFromRows` alimentada con `servicesOfBlock` por franja.

Para el **19-05**: `isBlockWildcard` decide el chip comodin y `buildSaveHoursPayload` + `buildDayStatesFromRows` son las dos mitades de `saveHours`.

Sin blockers.

## Self-Check: PASSED

- `lib/time-block-services.ts` — FOUND
- `lib/agenda-hours-payload.ts` — FOUND
- `test/time-block-services.test.ts` — FOUND
- `test/agenda-hours-payload.test.ts` — FOUND
- commit `d5fc596` — FOUND
- commit `1f2107f` — FOUND
- commit `86cfc03` — FOUND
- commit `34c896e` — FOUND

---
*Phase: 19-el-panel · Plan 01*
*Completed: 2026-08-26*
