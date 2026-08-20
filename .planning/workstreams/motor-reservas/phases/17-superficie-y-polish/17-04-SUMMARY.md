---
phase: 17-superficie-y-polish
plan: 04
subsystem: agenda
tags: [typescript, pure-functions, vitest, mutation-testing, capacity, tailwind, mobile]

# Dependency graph
requires:
  - phase: 15-cupo-unificado
    provides: "`services.capacity` + `services.capacity_mode` como fuente única del cupo (migr. 068); la columna de cupo de los bloques dejó de decidir"
  - phase: 12-cupo-por-solape
    provides: "la lógica de ocupación por solape del recurso simultáneo, validada en producción, que este plan mueve tal cual"
provides:
  - "`lib/agenda-occupancy.ts`: módulo PURO (cero imports) con la ocupación y el agrupamiento por slot"
  - "`buildDayEntries<A, S>`: agrupación por `date | HH:MM | service_id` con `occupied` / `capacity` / `pendingDeposit`"
  - "`computeOverlapFull<A, S>`: la ocupación por solape del simultáneo, ahora testeable fuera del componente"
  - "`capacityOf`, `occupiesSeat`, `timeToMin`, `OCCUPYING_STATUSES`, `DayEntry<A>`, `OccupancyAppt`, `OccupancyService`"
  - "`test/agenda-occupancy.test.ts`: 20 casos puros, 2 de ellos discriminantes verificados por mutación"
  - "Finanzas mobile: el servicio como segunda línea bajo el nombre del cliente (POLISH-10)"
affects: [17-05, agenda-grilla, roster]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lógica derivada de un `useMemo` extraída a un módulo puro y genérico (`<A extends Shape>`) para que el caller conserve su tipo concreto sin castear — el runner corre con `environment: 'node'` y no puede renderizar el componente"
    - "`nowMs` por parámetro en vez de `Date.now()` adentro: es lo que vuelve determinista el caso del hold vencido"
    - "Prueba de MUTACIÓN como criterio de aceptación explícito: un test que pasa con y sin la garantía no cuenta"
    - "Dato que no entra en la fila de mobile → segunda línea bajo el elemento dominante, con la columna de desktop intacta y las dos visibilidades complementarias"

key-files:
  created:
    - "lib/agenda-occupancy.ts"
    - "test/agenda-occupancy.test.ts"
  modified:
    - "app/(dashboard)/finances/finances-client.tsx"

key-decisions:
  - "El cupo sale de `services.capacity` y el módulo NO recibe los bloques de horario: no hay parámetro por donde entren, así que la fuente jubilada por la 068 no puede volver a enchufarse por descuido (T-17-16)"
  - "El modo se LEE de `capacity_mode`, nunca se deduce de `capacity > 1`: los casos 8 y 9 usan servicios de cupo 3 y 5 que NO agrupan, así que deducir vuelve a poner la suite en rojo (T-17-17)"
  - "El `service_id` es parte de la clave del grupo; probado por mutación, no por un test verde (T-17-18)"
  - "`occupiesSeat` replica el guard de hold vivo del RPC (migr. 063); probado por mutación (T-17-19)"
  - "Genéricos `<A extends OccupancyAppt, S extends OccupancyService>` + `ReadonlyMap` en vez de casteos: 17-05 va a poder leer `client_name`, `abono_id` y el join del nombre sin un solo `as`"
  - "Un grupo con todos sus miembros no-ocupantes existe igual, con `occupied: 0`: colapsar no puede hacer desaparecer un slot que hoy se ve"
  - "D-12 literal y ACEPTADO (T-17-21): un servicio DESACTIVADO no resuelve en el mapa del caller y su clase cae en tratamiento individual — anotado en el módulo, NO arreglado ampliando la consulta del server"
  - "Finanzas: el servicio baja como segunda línea solo en mobile; la columna de ≥640px se mantiene, no se reemplaza. No hubo que desplazar ningún otro dato"

patterns-established:
  - "Antes de dar por buena una garantía de seguridad/integridad, mutar el código y verificar que el caso previsto se pone en rojo; pegar las tres salidas (rojo, rojo, verde) en el SUMMARY"
  - "Un helper puro nombra en su cabecera la fuente de datos que NO debe usar y por qué, cuando esa fuente sigue existiendo en la base"

requirements-completed: [POLISH-09, POLISH-10]

# Metrics
duration: 22min
completed: 2026-08-20
status: complete
---

# Phase 17 Plan 04: Ocupación y agrupamiento por slot como módulo puro + Finanzas mobile Summary

**La ocupación de un slot y su agrupamiento salen de la grilla a `lib/agenda-occupancy.ts` —módulo puro, cero imports— con el cupo leído de `services.capacity` (la fuente del motor desde la 068) y el modo leído de `capacity_mode` en vez de deducido del número, congelado por 20 casos de los cuales dos están verificados por mutación; y Finanzas mobile muestra el servicio sin mover nada de lugar.**

## Performance

- **Duration:** ~22 min
- **Completed:** 2026-08-20
- **Tasks:** 3
- **Files created:** 2 · **modified:** 1

## Accomplishments

- **POLISH-09 tiene ahora una implementación correcta y probada.** `capacityFor()` calculaba la ocupación con la columna de cupo de los bloques de horario, que desde la migración 068 el motor ignora. El módulo nuevo **no recibe los bloques**: no hay parámetro por donde entren. La grilla ya no puede decir "lleno" con un número que el motor no mira.
- **El modo se lee, no se deduce.** `isGroup = capacityFor(...) > 1` era la línea de al lado de `isSimultaneous`, que ya lo hacía bien. Los casos 8 y 9 de la suite usan un simultáneo de cupo 3 y un individual de cupo 5: si alguien vuelve a deducir el modo del número, los dos se ponen en rojo.
- **Dos garantías probadas por mutación, no por un test verde.** Sacar el `service_id` de la clave del grupo pone en rojo el caso 4; sacar el guard de hold vivo pone en rojo el caso 2. Las tres salidas están abajo.
- **El agrupamiento no tiene analog en el repo** (así lo dice el PATTERNS) y por eso los criterios eran literales: grupo en la posición de su **primer** miembro, individuales conservando la suya, grupo con `occupied: 0` que igual existe, y clave con `service_id`. Los cuatro tienen su caso.
- **POLISH-10 cerrado sin desplazar nada.** El servicio baja como segunda línea bajo el nombre del cliente solo en mobile; fecha, precio y la acción quedan donde estaban, y la columna de desktop se mantiene byte-idéntica.

## Task Commits

1. **Task 1: `lib/agenda-occupancy.ts` — la ocupación y el agrupamiento, puros** — `44d45ae` (feat)
2. **Task 2: Los tests que congelan D-10, D-11 y D-12, con dos casos probados por mutación** — `2552b19` (test)
3. **Task 3: Finanzas en mobile muestra el servicio (POLISH-10)** — `98fcc2e` (feat)
4. *(fuera de tareas)* Registro del ESLint pre-existente de Finanzas como fuera de alcance — `ec5faf4` (docs)

## Files Created/Modified

- **`lib/agenda-occupancy.ts`** (nuevo, 221 líneas) — `OCCUPYING_STATUSES`, `OccupancyAppt`, `OccupancyService`, `DayEntry<A>` (unión discriminada por `kind`), `timeToMin`, `capacityOf`, `occupiesSeat`, `buildDayEntries<A, S>`, `computeOverlapFull<A, S>`. Cabecera con los tres porqués exigidos por el plan (de dónde sale el cupo, por qué el modo se lee, por qué el `service_id` está en la clave) más la consecuencia aceptada de D-12.
- **`test/agenda-occupancy.test.ts`** (nuevo, 318 líneas) — 20 casos: los 16 pedidos más 4 unitarios de `occupiesSeat` / `capacityOf` / `timeToMin`.
- **`app/(dashboard)/finances/finances-client.tsx`** — `const svc = apptServiceName(appt, '')` una sola vez por fila; el nombre del cliente envuelto en `min-w-0 flex-1` con la línea del servicio debajo, condicionada a servicio no vacío.

## Verificación medida

### Gates de aceptación (antes → después)

| Criterio | Antes | Después | |
|---|---|---|---|
| `tsc --noEmit` (exit) | 0 | **0** | PASS |
| `vitest run test/agenda-occupancy.test.ts --no-file-parallelism` | (no existía) | **20 passed, 0 failed** (≥16 pedidos) | PASS |
| `grep -c '^import' lib/agenda-occupancy.ts` | — | **0** | PASS |
| `export function {buildDayEntries,computeOverlapFull,capacityOf,occupiesSeat,timeToMin}` | — | **1 / 1 / 1 / 1 / 1** | PASS |
| `grep -nF 'time_blocks' lib/agenda-occupancy.ts` | — | **0 líneas** (ni siquiera en comentario) | PASS |
| `grep -cF 'Date.now()' lib/agenda-occupancy.ts` | — | **0** | PASS |
| `grep -cE '\bas\b [A-Z]' lib/agenda-occupancy.ts` | — | **0** | PASS |
| `grep -cF "from '@/lib/agenda-occupancy'" test/…` | — | **1** | PASS |
| `grep -ciE "supabase\|createclient\|process\.env" test/…` | — | **0** | PASS |
| `grep -ciE "\.skip\(\|\.todo\(" test/…` | — | **0** | PASS |
| `grep -cF 'sm:hidden' finances-client.tsx` | **0** | **1** | PASS |
| `grep -cF 'hidden sm:block' finances-client.tsx` | **1** | **1** | PASS |
| `grep -cF 'min-w-0 flex-1' finances-client.tsx` | **0** | **1** | PASS |
| `grep -cF 'apptServiceName' finances-client.tsx` | **3** | **4** | PASS |
| `git diff --name-only` (HEAD~3..HEAD) | — | exactamente los 3 archivos del plan | PASS |
| `git diff -- package.json package-lock.json "app/(dashboard)/agenda/"` | — | **vacío** | PASS |

`agenda-client.tsx` y `agenda/page.tsx` **no fueron tocados** — verificado en el diff.

### Prueba de mutación (obligatoria)

**Mutación 1 — clave del grupo sin `service_id`** (`\`${a.date}|${time}|${a.service_id}\`` → `\`${a.date}|${time}\``):

```
 × caso 1: tres confirmados de un grupal de cupo 6 ⇒ UNA entrada con occupied 3 / capacity 6
 × caso 4 (DISCRIMINANTE, verificado por mutación): dos servicios grupales DISTINTOS a la misma hora NO se fusionan
AssertionError: expected '2026-08-25|09:00' to be '2026-08-25|09:00|yoga'
AssertionError: expected [ { kind: 'group', …(9) } ] to have a length of 2 but got 1
 Tests  2 failed | 18 passed (20)
```

El caso previsto (**4**) se puso en rojo: los dos servicios se fusionaron en una sola entrada. El caso 1 cayó de arrastre porque también afirma la forma de la clave — señal extra, no ruido.

**Mutación 2 — `occupiesSeat` sin el guard de hold vivo** (las tres líneas del guard → `return true`):

```
 × caso 2 (DISCRIMINANTE, verificado por mutación): un hold VENCIDO sigue en la lista pero NO ocupa lugar
 × caso 15: un hold VENCIDO no cuenta hacia el solape
AssertionError: expected 3 to be 2
AssertionError: expected 2 to be +0
 Tests  2 failed | 18 passed (20)
```

El caso previsto (**2**) se puso en rojo: el hold vencido pasó a ocupar lugar (`occupied` 3 en vez de 2). El caso 15 confirma que la misma garantía cubre el solape del simultáneo.

**Restauración y verde final** (`git checkout -- lib/agenda-occupancy.ts`, sin diff residual):

```
 Test Files  1 passed (1)
      Tests  20 passed (20)
```

### Finanzas — verificación de Task 3

- **Hecho:** `tsc --noEmit` exit 0, los 4 greps del criterio en verde, y smoke test con `npm run dev` (Next 16.2.7 Turbopack): `GET /finances` compila y devuelve **307 → /login** (el guard de sesión), sin error de compilación en el módulo modificado. Servidor apagado después.
- **NO hecho — queda para la UAT visual:** la comprobación **a 375px y a ≥640px con datos reales** no se pudo ejecutar acá: `/finances` está detrás del login y en este entorno no hay navegador ni sesión autenticada. **Es exactamente el tipo de verificación que este workstream aprendió a no dar por hecha** (la UAT real encuentra lo que el pipeline verde no). Chequeo pendiente, en una sola pasada:
  1. a **375px**, cada fila del tab **Turnos** muestra el servicio en gris chico bajo el nombre del cliente, y fecha / precio / botón quedan en la misma posición que antes;
  2. una fila de un turno **sin servicio** no muestra una segunda línea vacía;
  3. a **≥640px** la fila se ve exactamente como hoy: una sola línea, con el servicio en su columna.

## Deviations from Plan

**1. [Rule 3 - Blocker] El comentario del código rompía dos greps de aceptación**

- **Found during:** Task 3
- **Issue:** el comentario que escribí para explicar la decisión mencionaba literalmente `sm:hidden` y `hidden sm:block`, así que `grep -cF` daba **2** en ambos casos en vez de **1**. El criterio cuenta líneas, no clases aplicadas: la prosa contaba igual que el markup.
- **Fix:** se reescribió el comentario describiendo la complementariedad sin nombrar las clases ("esta se esconde desde 640px, justo donde aparece aquella"). El markup no cambió.
- **Files modified:** `app/(dashboard)/finances/finances-client.tsx`
- **Verification:** `sm:hidden` = 1, `hidden sm:block` = 1
- **Commit:** `98fcc2e`

**2. [Alcance] La verificación manual de Finanzas quedó a medias, y está declarada como tal**

- El criterio pedía prueba manual en `npm run dev` a 375px y ≥640px. Se ejecutó el servidor y se comprobó que la ruta compila (307 al login), pero la inspección visual autenticada no es ejecutable en este entorno (sin navegador, sin sesión). **No se marca como hecha**: queda listada arriba como pendiente de UAT, con los tres puntos a mirar. No se sustituyó por una afirmación que no se midió.

**Total deviations:** 1 auto-arreglada (Rule 3) + 1 limitación de entorno declarada.
**Impact:** ninguno sobre el código entregado. Los 16 gates automatizados están en verde y las dos mutaciones obligatorias hicieron lo predicho.

## Fuera de alcance encontrado (no arreglado)

- **`finances-client.tsx:290`** dispara un error de ESLint `react-hooks/set-state-in-effect` (`useEffect(() => { fetchData() }, [fetchData])`). Verificado **pre-existente en `HEAD`**, a ~600 líneas del bloque que toca este plan. Registrado en `deferred-items.md` de la fase, no tocado.

## Rojo conocido y DECLARADO al cerrar este plan

`lib/agenda-occupancy.ts` queda **sin ningún consumidor** y `agenda-client.tsx` sigue con `capacityFor()` leyendo el cupo de los bloques y con `isGroup` deduciendo el modo del número. **Esto es lo esperado, no código muerto ni una duplicación olvidada:** el plan **17-05** borra las dos lecturas viejas y pasa a importar este módulo. Ningún criterio de aceptación de 17-04 depende de ese cableado, y ninguna suite queda en rojo.

## Known Stubs

Ninguno. Ni valores vacíos hardcodeados, ni placeholders, ni componentes sin fuente de datos. El módulo entregado está completo y probado; lo único pendiente es su consumo, que es trabajo declarado de 17-05.

## Threat Flags

Ninguno. El plan no crea endpoints, no toca auth, no accede a archivos, no cambia esquema y no agrega dependencias (`git diff -- package.json package-lock.json` vacío, T-17-SC). El módulo es puro y sin imports: no puede hablar con nada (T-17-20).

## Next

Listo para **17-05**, que consume `buildDayEntries` / `computeOverlapFull` en la columna del día, borra `capacityFor()` y la copia local de `timeToMin`, y le pasa el `service_id` al roster.

## Self-Check: PASSED

- `lib/agenda-occupancy.ts` — FOUND
- `test/agenda-occupancy.test.ts` — FOUND
- `app/(dashboard)/finances/finances-client.tsx` — FOUND (modificado)
- Commits `44d45ae`, `2552b19`, `98fcc2e`, `ec5faf4` — FOUND en `git log`
- `tsc --noEmit` exit 0 · suite 20/20 · los 16 gates de grep/diff medidos arriba en verde
