---
phase: 18-el-modelo-y-la-disponibilidad
plan: 02
subsystem: booking
tags: [helper-puro, vitest, comodin, agenda-por-servicio, contrato-d16]

# Dependency graph
requires:
  - phase: 18-el-modelo-y-la-disponibilidad
    plan: 01
    provides: "la tabla puente `time_block_services` (business_id/time_block_id/service_id) cuyas columnas espeja el tipo `TimeBlockService`"
  - phase: 08-equipo-que-servicios-hace-cada-profesional
    provides: "`lib/staff-services.ts` + `test/staff-services.test.ts`: el molde exacto del contrato (cabecera, pureza, D-16, control negativo)"
provides:
  - "`TimeBlockService` en `lib/types.ts`: el tipo de fila de la puente, snake_case espejo de la migr. 071"
  - "`lib/time-block-services.ts`: la regla del comodín franja↔servicio encerrada en 4 funciones puras (`blocksForService`, `isServiceScheduled`, `isServiceAllowedAt`, `startTimesNotOffered`) + el tipo `BlockWindow`"
  - "El dato de D-06 computable: `isServiceScheduled` dice si un servicio no lo cubre ninguna franja, sin bloquear nada"
  - "La regla del ACEPTA de D-04 lista para el backstop del Plan 04, sin introducir validación general de ventana"
  - "`test/time-block-services.test.ts`: 16 casos puros, cada comodín emparejado con su caso con filas"
affects: [18-03, 18-04, phase-19-ui-de-configuracion, phase-20-booking-publico]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Helper puro con contrato D-16 (el caller acota por tenant ANTES): molde `lib/staff-services.ts`"
    - "Función genérica sobre `{ id: string }` en vez de la interfaz de fila completa, para no obligar a un cast mentiroso en un call site que lee 3 columnas"
    - "Resta de conjuntos para calcular lo que se OCULTA (no lo que se ofrece), porque el endpoint de disponibilidad devuelve la lista de horarios a esconder"
    - "Prueba de mordida: invertir a mano la regla que la suite dice congelar y confirmar que se pone roja, en vez de asumir que los tests muerden"

key-files:
  created:
    - "lib/time-block-services.ts"
    - "test/time-block-services.test.ts"
  modified:
    - "lib/types.ts"

key-decisions:
  - "`blocksForService` va GENÉRICA sobre `<T extends { id: string }>` y no atada a `TimeBlock`: el endpoint de disponibilidad lee sólo `start_time`/`end_time` y forzar la interfaz completa obligaría a un cast mentiroso en el call site — que es exactamente el precio que paga hoy el molde `staff-services` en `availability/route.ts`"
  - "`startTimesNotOffered` NO tiene atajo `if (bridge.length === 0) return []`: el resultado vacío con la puente vacía EMERGE de la regla del comodín. El atajo habría hecho que el caso de test 13 pasara igual con la regla invertida — o sea, habría desactivado un control negativo. Medido en la prueba de mordida: sin el atajo, ese caso se pone rojo"
  - "El parseo de hora es una función LOCAL no exportada (`toMinutes`), replicando `timeToMinutes` de `booking-core` y `toMin` de `availability`: importarla habría roto la pureza de un solo `import type`. Tolera `'HH:MM:SS'` porque Postgres devuelve `time` con segundos"
  - "La enumeración de la grilla usa LA MISMA fórmula que el endpoint y el cliente público (`for (t = open; t + dur <= close; t += dur)`): si divergiera, el server ocultaría horarios que el cliente ni muestra"
  - "`isServiceAllowedAt` sólo mira las franjas que CONTIENEN el horario y acepta cuando no hay ninguna: es la diferencia entre el backstop de D-04 y una validación general de ventana, que rompería los días con horario especial que extienden la jornada"
  - "El helper NO filtra por `business_id` aunque tenga la columna a mano (contrato D-16, T-18-07): un filtro por tenant adentro daría una falsa sensación de aislamiento en un módulo que no puede validar el origen de las filas. Congelado por el caso de test 4"

patterns-established:
  - "Antes de agregar un early-return por conveniencia a una función que encierra una regla, verificar que ese atajo no vuelva tautológico un caso de test que existía para morder"
  - "La prueba de mordida se reporta con el desglose de QUÉ casos cayeron, no con un 'la suite se puso roja': el reparto muestra si el control negativo cubre las cuatro funciones o sólo una"

requirements-completed: [AGENDA-02]

# Metrics
duration: 18min
completed: 2026-08-25
status: complete
---

# Phase 18 Plan 02: El helper puro de la regla del comodín Summary

**La regla del comodín franja↔servicio quedó encerrada en un solo lugar puro y testeado — `lib/time-block-services.ts`, 4 funciones sin Supabase ni React, con 16 casos que muerden — para que la disponibilidad (Plan 03), el `create` (Plan 04) y el panel de la Phase 19 la interpreten idéntico en vez de derivar.**

## Performance

- **Duration:** ~18 min
- **Completed:** 2026-08-25
- **Tasks:** 2 (implementación + tests), 2 commits

## What Was Built

### Task 1 — El tipo y las 4 funciones puras (commit `f7fe311`)

**`lib/types.ts`** — `TimeBlockService` junto a `ProfessionalService`, con las **tres** columnas de la migr. 071 en `snake_case` (`business_id`, `time_block_id`, `service_id`), tomadas del `18-01-SUMMARY.md` y no adivinadas. El comentario dice de qué tabla sale y que 0 filas significa comodín.

**`lib/time-block-services.ts`** — cabecera con el formato del molde (qué regla encierra · quién la necesita · por qué una fuente única · el contrato D-16), más el tipo `BlockWindow` (id + apertura + cierre) y **4 funciones exportadas**:

| Función | Qué decide |
|---|---|
| `blocksForService(serviceId, blocks, bridge)` | las franjas donde se da el servicio — genérica sobre `{ id: string }` |
| `isServiceScheduled(serviceId, blocks, bridge)` | el dato de D-06, por construcción `blocksForService(...).length > 0` |
| `isServiceAllowedAt(serviceId, startMinutes, blocks, bridge)` | la regla del ACEPTA de D-04 |
| `startTimesNotOffered(serviceId, blocks, bridge, durationMinutes)` | los `'HH:MM'` a dejar de ofrecer |

Dos helpers **locales, no exportados** (`toMinutes`, `startTimesOf`) sostienen el parseo de hora tolerante a `'HH:MM:SS'` y la enumeración de la grilla con la misma fórmula del endpoint.

La trampa que `startTimesNotOffered` resuelve está comentada en el código con sus **dos** motivos: (1) el endpoint devuelve lo que se OCULTA, así que quitar franjas de la entrada ofrecería más, no menos; (2) "los horarios de las franjas que no lo dan" tampoco alcanza, porque con dos franjas solapadas que arrancan a la misma hora se ocultaría un horario legítimo. De ahí la **resta de conjuntos**.

### Task 2 — Los tests (commit `0a57573`)

`test/time-block-services.test.ts`, espejo estructural de `test/staff-services.test.ts`: dos factories mínimas al tope (`block`, `map`), **4 `describe`** (uno por función) y **16 `it`**, con los 16 casos obligatorios del plan. Los cinco casos que el plan exige que declaren su rol de control negativo lo dicen en el texto del `it(...)`: los casos 3, 6, 8, 9 y 15 arrancan con `CONTROL NEGATIVO` / `CONTROL ANTI-REGRESIÓN` / `CONTRATO D-16`.

## La prueba de mordida (criterio 6 del plan)

Se invirtió **a mano** la condición del comodín en `blocksForService` (`if (rows.length === 0) return false` en vez de `true`), se corrió la suite y se restauró con `git checkout -- lib/time-block-services.ts`. **El cambio no quedó en el árbol** (verificado: `git status --short` sólo mostraba el test sin trackear, y la línea original volvió a la línea 94).

Resultado con la regla invertida: **6 failed | 10 passed (16)** — y el reparto importa, porque muestra que el control negativo cubre **las cuatro** funciones, no una:

| Suite | Caso que cayó |
|---|---|
| `blocksForService` | `franja con 0 filas sirve para TODOS los servicios (comodín)` |
| `blocksForService` | `CONTROL NEGATIVO: el mapeo de OTRA franja no afecta a ésta` |
| `isServiceScheduled` | `todas las franjas comodín: TODO servicio está agendado` |
| `isServiceScheduled` | `una sola franja comodín entre varias mapeadas vuelve a agendar todo` |
| `isServiceAllowedAt` | `con la puente vacía cualquier horario dentro de cualquier franja se acepta` |
| `startTimesNotOffered` | `puente vacía: no se oculta nada (día de la migración, D-02)` |

Restaurado el helper: **16 passed (16)**.

⚠ **Lo que esta prueba enseñó, y que cambió una decisión de implementación:** el borrador tenía un early-return `if (bridge.length === 0) return []` en `startTimesNotOffered` "para documentar el día de la migración". Con ese atajo, el caso 13 habría pasado **igual** con la regla invertida — o sea, habría desactivado un control negativo por conveniencia. Se sacó: el `[]` con la puente vacía ahora **emerge** de la regla del comodín, y por eso ese caso figura entre los 6 que cayeron.

## Nota de proceso — el orden TDD del Task 1

El Task 1 viene marcado `tdd="true"` con su bloque `<behavior>`, pero sus criterios `<done>` exigen que `git diff --name-only` toque **exactamente** `lib/types.ts` y `lib/time-block-services.ts` — o sea, el plan reparte deliberadamente la implementación al Task 1 y los tests al Task 2, y escribir el archivo de tests dentro del Task 1 habría violado su propia verificación. Se siguió la descomposición del plan (implementación → tests → mordida) en vez de forzar un commit RED que el plan no contempla.

**La garantía que el ciclo RED aporta no se perdió**: la prueba de mordida de arriba es su equivalente empírico y es más fuerte que un RED inicial, porque demuestra que los tests fallan al quitar **la regla concreta** que dicen congelar, no simplemente porque el módulo todavía no existía. Es exactamente lo que el `<done>` del Task 2 pide como prueba.

## Deviations from Plan

**Ninguna regla de desviación (1-4) aplicada.** No hubo bugs que arreglar, funcionalidad crítica faltante ni bloqueos, y no se tocó ningún archivo fuera de los tres declarados.

Un solo ajuste de criterio propio, ya explicado arriba y del lado del rigor: **no** se agregó el early-return `bridge.length === 0` que el `<behavior>` describía como comportamiento ("con la puente vacía devuelve `[]`"). El comportamiento se cumple igual —está testeado— pero emerge de la regla en vez de estar cortocircuitado, que es lo que mantiene vivo el control negativo del caso 13.

## Threat Model — estado

| Threat ID | Disposition | Estado al cerrar el plan |
|---|---|---|
| T-18-07 | mitigate | **Cerrado**: el contrato D-16 está escrito en la cabecera con su porqué (un filtro por tenant adentro daría falsa sensación de aislamiento) y el caso de test 4 lo congela — filas con `business_id: 'otro-negocio'` producen el mismo resultado que las propias. El aislamiento real vive en la RLS de la 071 y en las queries de los Planes 03/04 |
| T-18-08 | mitigate | **Cerrado por medición**: la prueba de mordida muestra que invertir el comodín pone **6** casos en rojo, repartidos en las 4 suites. El caso 1 va emparejado con el 2 y el 13 con el 14, y el atajo que habría neutralizado el 13 se sacó a propósito |
| T-18-09 | mitigate | **Cerrado**: `isServiceAllowedAt` filtra primero las franjas que CONTIENEN el horario y devuelve `true` si no hay ninguna. El caso de test 8 (`CONTROL ANTI-REGRESIÓN`) lo congela para un horario a las 20:00 con una única franja 09:00-13:00 |
| T-18-10 | accept | Sin cambios: las entradas son ids de franja/servicio, minutos y `'HH:MM'`. Ningún dato de cliente ni de ocupación entra al módulo |
| T-18-SC | accept | **Cero paquetes nuevos**: `git diff HEAD~2 HEAD -- package.json package-lock.json` vacío |

## Verification Results

| # | Criterio del plan | Esperado | Resultado |
|---|---|---|---|
| 1 | `./node_modules/.bin/tsc --noEmit` | exit 0 | ✅ (corrido tras cada task) |
| 2 | `npx vitest run test/time-block-services.test.ts` | 0 failed, 0 skipped | ✅ **16 passed (16)** |
| 3 | `grep -cE "^export function " lib/time-block-services.ts` | 4 | ✅ **4** |
| 4 | `grep -cE "^import " lib/time-block-services.ts` = 1 y es `import type` | 1 / 1 | ✅ **1 / 1** |
| 5 | `grep -cE "^  it\(" test/...` ≥ 12 · `grep -cE "^describe\(" test/...` = 4 | ≥12 / 4 | ✅ **16 / 4** |
| 6 | La prueba de mordida documentada en el SUMMARY | — | ✅ (sección propia, con el reparto de los 6 casos) |
| 7 | `git diff --name-only` toca exactamente los 3 archivos | 3 | ✅ `lib/time-block-services.ts`, `lib/types.ts`, `test/time-block-services.test.ts` |
| 8 | `git diff -- package.json package-lock.json` vacío | vacío | ✅ |
| — | `grep -cF "TimeBlockService" lib/types.ts` | ≥ 1 | ✅ **1** |
| — | `grep -cE "^import .*(supabase\|@supabase)" test/...` | 0 | ✅ **0** |
| — | Las 4 exportadas son las nombradas por el plan | — | ✅ `blocksForService`, `isServiceScheduled`, `isServiceAllowedAt`, `startTimesNotOffered` |
| — | Sin regresión en el molde vecino (`test/staff-services.test.ts`) | verde | ✅ **24 passed (24)** en las dos suites puras |

**Nota de gate:** no se corrió `npx vitest run` completo a propósito — las suites de abono son flaky en paralelo en esta máquina y ensucian el resultado sin aportar señal sobre este plan (restricción declarada en el plan y en el CONTEXT). Se corrieron las suites nombradas, más `staff-services` como control de que el tipo nuevo en `lib/types.ts` no rompió al vecino. `tsc --noEmit` cubre el resto del repo.

## Known Stubs

Ninguno. Las cuatro funciones están implementadas y testeadas; el plan no crea UI ni endpoints. Que todavía **nadie las consuma** es por diseño del reparto de la fase: `availability/route.ts` las usa en el Plan 18-03 y `booking-core.ts` en el 18-04.

## Next Plan

**18-03** — AGENDA-03: `app/api/booking/availability/route.ts` deja de ofrecer los horarios de las franjas que no dan el servicio pedido, importando `blocksForService`/`startTimesNotOffered` de este módulo (nunca reimplementando la regla).

## Self-Check: PASSED

- Archivos verificados en disco: `lib/time-block-services.ts`, `test/time-block-services.test.ts`, `lib/types.ts`.
- Commits verificados en git: `f7fe311` (helper + tipo), `0a57573` (tests).
