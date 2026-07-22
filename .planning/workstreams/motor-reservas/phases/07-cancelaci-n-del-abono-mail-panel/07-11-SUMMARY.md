---
phase: 07-cancelaci-n-del-abono-mail-panel
plan: 11
subsystem: api
tags: [abonos, cron, mail, deduplicacion, contratos-compartidos, vitest]

# Dependency graph
requires:
  - phase: 07-cancelaci-n-del-abono-mail-panel
    provides: "07-06: abonoDayLabel(dow) y toISODate(d) exportados desde lib/abono-cancel.ts"
provides:
  - "IN-01 cerrado en los 4 consumidores: la etiqueta del día fijo sale de UNA sola función (las dos vías de baja + el alta)"
  - "IN-02 cerrado: NO queda ninguna copia de toISODate en código de producción (grep -rlE sobre app/ y lib/ sin resultados)"
affects: [07-12, secure-phase-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Adopción de contrato compartido: el consumidor borra su copia local e importa el símbolo; el comentario documenta POR QUÉ la copia era peligrosa, no qué hace la función"
    - "Los comentarios de coincidencia-mantenida-a-mano se reescriben cuando la coincidencia pasa a ser un mismo símbolo: un comentario obsoleto reinstala la duplicación en la próxima edición"

key-files:
  created: []
  modified:
    - app/api/abonos/cancel/route.ts
    - app/api/abonos/create/route.ts
    - app/api/cron/cancel-expired/route.ts

key-decisions:
  - "El comentario de countAbonoAppointments en abonos/create (que menciona SKIPPED_CAP y toISODate) NO se tocó: sigue siendo cierto y el plan acota la reescritura de prosa al comentario del cron"
  - "El import de @/lib/abono-cancel en abonos/cancel se fusionó con el de cancelAbonoSeries (una sola línea) para cumplir el criterio de un único import del módulo"
  - "Los comentarios nombran las funciones SIN paréntesis para que los greps de aceptación midan código y no prosa (mismo criterio que 07-06 y 07-09)"

requirements-completed: [ABONO-04, ABONO-05]

# Metrics
duration: 11min
completed: 2026-07-21
status: complete
---

# Phase 7 Plan 11: Los tres callers restantes adoptan los contratos compartidos Summary

**La baja por panel, el alta del abono y el cron diario dejan de tener copias propias de la etiqueta del día y de la serialización `'yyyy-MM-dd'`: los tres consumen `abonoDayLabel` y `toISODate` de `lib/abono-cancel`, sin ningún cambio de comportamiento observable.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-07-21T21:38Z
- **Completed:** 2026-07-21T21:49Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- **IN-01 cerrado del todo.** Desaparecieron las dos copias de `DAY_LABELS` que quedaban (`app/api/abonos/cancel/route.ts` y `app/api/abonos/create/route.ts`; las dos de la superficie pública ya las había borrado el Plan 07-09). El fallback ante un `dow` inválido ahora es UNO solo para las tres superficies: el `'los días'` que vive dentro de `abonoDayLabel`. El mail de la misma baja no puede volver a decir cosas distintas según quién la ejecutó (D-14/D-16).
- **IN-02 cerrado del todo.** `grep -rlE "^function toISODate\(" app/ lib/` no devuelve ningún archivo: la serialización del día argentino existe una sola vez en producción. El alta, el cron y el motor de baja comparten literalmente el mismo símbolo, así que el borde de medianoche AR no puede divergir entre quien genera un turno y quien lo cancela.
- **El comentario del cron se puso al día.** La frase que afirmaba que el alta y el cron "coinciden, igual que SKIPPED_CAP, `toISODate` y `countAbonoAppointments`" describía una coincidencia sostenida a mano — exactamente la premisa que reinstala la duplicación en la próxima edición. Ahora dice que `toISODate` es el MISMO símbolo importado del motor, y deja `SKIPPED_CAP` / `countAbonoAppointments` como lo que siguen siendo: criterios espejados.
- **Cero cambio de reglas.** El clamp `1..52`, el `SKIPPED_CAP`, el anti-tampering por `business_id`, la derivación del service para canchas, el `cancelUrl` (D-16), el `after()` del mail, el gate Bearer del cron, el filtro `status='active'` y la cancelación de holds vencidos quedaron intactos. `vercel.json` no se tocó.
- **Suite completa verde: 707 passed / 1 skipped, 54 archivos** con `--no-file-parallelism`, exit 0.

## Task Commits

1. **Task 1 — IN-01 + IN-02 en las dos rutas de abonos (baja por panel y alta)** — `a83440f` (refactor)
2. **Task 2 — IN-02 en el cron + gate de regresión de la suite** — `2054864` (refactor)

## Files Created/Modified

- `app/api/abonos/cancel/route.ts` — `abonoDayLabel` fusionado en el import existente de `@/lib/abono-cancel`; borrada la constante local `DAY_LABELS` (y con ella el fallback inline `?? 'los días'` de la interpolación); el `dayLabel` del mail conserva el prefijo `todos ` que arma el caller. Comentario nuevo explicando por qué la copia era peligrosa.
- `app/api/abonos/create/route.ts` — borradas `DAY_LABELS` y la función local `toISODate`; import nuevo de `@/lib/abono-cancel` con los dos símbolos, documentado con la razón de no recortar el ISO en UTC (en Vercel el proceso corre en UTC y el corte se correría una jornada entera). Los tres puntos de uso — el `dayLabel` del mail de alta y los dos cálculos del rango de la primera tanda — pasan a la implementación compartida.
- `app/api/cron/cancel-expired/route.ts` — borrada la copia local de `toISODate`, import nuevo del motor, y reescrito el comentario de `clampWindowWeeks`.

## Cuerpo de `toISODate` verificado idéntico

El plan exige comprobar que la implementación importada es EXACTAMENTE la que estaba local. Las tres eran carácter por carácter la misma función: `getFullYear()`, `getMonth()+1` y `getDate()` sobre los componentes **locales** del `Date`, mes y día con `padStart(2, '0')`, y template `${y}-${m}-${day}`. La versión de `lib/abono-cancel.ts` (Plan 07-06) es esa misma, con el docblock ampliado. Cero cambio semántico.

## Baseline de tests

| Métrica | Baseline 07-06 | Baseline 07-09 | Después de 07-11 |
|---|---|---|---|
| Tests verdes (`vitest run --no-file-parallelism`) | 694 passed / 1 skipped | 707 passed / 1 skipped | **707 passed / 1 skipped** |
| Archivos de test | 53 | 54 | **54 passed** |
| `tsc --noEmit` | 0 | 0 | **0** |
| `eslint` sobre los archivos tocados | 0 | 0 | **0** |

Conteo ≥ baseline: este plan no agrega ni borra casos (es una unificación de fuente, no un cambio de reglas), así que 707 = 707 es el resultado esperado. `test/abono-create.test.ts` corrió aparte en Task 1: **13 passed**.

## Deviations from Plan

### Ajustes de verificación

**1. [Rule 3 - Blocking] `npx tsc` está prohibido en este árbol: resuelve un paquete del registro que siempre sale 0**

- **Found during:** Task 1
- **Issue:** los bloques `<automated>` del plan usan `npx tsc --noEmit`, `npx vitest` y `npx eslint`. `npx tsc` resuelve un paquete homónimo del registro que produce un FALSO VERDE (ya ocurrió una vez en esta fase; el Plan 07-09 registró la misma deviación).
- **Fix:** todas las verificaciones se corrieron con los binarios locales: `./node_modules/.bin/tsc --noEmit`, `./node_modules/.bin/vitest run`, `./node_modules/.bin/eslint`.
- **Verification:** `tsc --noEmit` = 0 tras cada tarea, compilando el proyecto real (el mismo binario detectó errores reales en planes previos de la tanda).
- **Committed in:** n/a (no hay archivos versionados involucrados)

**2. [Rule 3 - Entorno] Un worker de vitest murió en la primera corrida de la suite completa (fallo intermitente pre-existente)**

- **Found during:** Task 2
- **Issue:** la primera corrida devolvió `Test Files 53 passed (54)` / `700 passed` con un `Error: Worker exited unexpectedly` — un archivo entero no llegó a ejecutarse. Es el fallo intermitente de contención ya listado en `deferred-items.md`, no un fallo de assertion: ningún test reportó `failed`.
- **Fix:** ninguno de código. Se re-corrió la suite completa idéntica: `54 passed (54)` / `707 passed | 1 skipped`, **exit 0**. No se tocó ningún test ni ninguna configuración.
- **Verification:** salida de la segunda corrida capturada; `EXIT=0`.
- **Committed in:** n/a

---

**Total deviations:** 2, ambas de entorno de verificación. Ninguna cambia el alcance ni el comportamiento pedido.

## Prohibiciones verificadas

- **Ninguna regla de negocio cambió.** `clampWindowWeeks` sigue apareciendo 3 veces en `abonos/create` (definición + 2 referencias) y el clamp del cron quedó intacto; `SKIPPED_CAP` sin tocar; el gate del secreto del cron (`401`) y el filtro `'active'` siguen presentes; el criterio de mails no se movió.
- **`lib/abono-generation.ts` y el RPC `book_slot_atomic` no se tocaron:** no aparecen en el diff.
- **Cero crons nuevos y cero cambio de frecuencia:** `git diff --numstat vercel.json` vacío. El cron diario `0 3 * * *` de Vercel Hobby sigue igual.
- **La copia de `fmtDate` del client component público NO se movió** (duplicación deliberada, documentada por el Plan 07-09).
- **`07-01..07-05-PLAN.md` no se tocaron.**
- **Cero dependencias nuevas (T-07-SC):** `package.json`, `package-lock.json` y `node_modules` intactos — el plan sólo mueve imports internos.
- **Ningún archivo borrado:** `git diff --diff-filter=D` sin resultados en los dos commits.

## Threat Flags

Ninguna superficie de seguridad nueva. El registro del plan queda así:

| Threat | Estado |
|---|---|
| T-07-50 (divergencia del corte de fecha entre alta, cron y baja) | mitigada: un único símbolo, cero copias en producción |
| T-07-51 (el mail de la misma baja diciendo cosas distintas) | mitigada: `abonoDayLabel` con fallback único en las 4 superficies |
| T-07-52 (tocar el cron compartido por todos los tenants) | mitigada: el cambio es un reemplazo de import; gate Bearer, `status='active'` y clamp verificados por grep |
| T-07-53 (alterar frecuencia o costo del cron) | mitigada: `vercel.json` sin cambios, sin queries ni iteraciones nuevas |
| T-07-54 (regresión silenciosa en el alta o en la generación forward) | mitigada: suite completa en 707 + `test/abono-create.test.ts` en 13 |
| T-07-SC (dependencias) | mitigada: `package.json` / `package-lock.json` intactos |

## Issues Encountered

- Sólo el worker intermitente de vitest (deviación 2). Ningún test falló por assertion, ni por este plan ni pre-existente.

## User Setup Required

None — sin configuración externa, sin migración y sin variable de entorno nueva.

## Next Phase Readiness

- **07-12** ya puede testear sabiendo que `abonoDayLabel` y `toISODate` son los únicos productores de esos dos valores en producción: un test sobre el motor cubre a los 4 consumidores.
- **secure-phase** puede cerrar T-07-50..T-07-54 con código verificable por grep en los 3 archivos.
- Sin bloqueantes.

## Self-Check: PASSED

- Archivos verificados en disco: `app/api/abonos/cancel/route.ts`, `app/api/abonos/create/route.ts`, `app/api/cron/cancel-expired/route.ts` — los 3 presentes.
- Commits verificados en `git log`: `a83440f`, `2054864` — los 2 presentes.
- `grep -rlE "^function toISODate\(" app/ lib/` sin resultados.
- `node_modules`, `package.json` y `package-lock.json` intactos.

---
*Phase: 07-cancelaci-n-del-abono-mail-panel*
*Completed: 2026-07-21*
