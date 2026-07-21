---
phase: 07-cancelaci-n-del-abono-mail-panel
plan: 06
subsystem: api
tags: [supabase, postgrest, abonos, idempotencia, multi-tenant, vitest]

# Dependency graph
requires:
  - phase: 07-cancelaci-n-del-abono-mail-panel
    provides: "motor compartido de baja de serie (lib/abono-cancel.ts, Plan 07-01) + sus dos suites de test"
provides:
  - "Barrido de reparación idempotente en cancelAbonoSeries: un reintento sobre una serie que quedó a medias deja 0 turnos futuros vivos (CR-01)"
  - "AbonoCancelSummary.unknown: el preview distingue 'no se pudo calcular' de 'no hay turnos futuros' (WR-04)"
  - "abonoDayLabel(dow) exportado: fuente ÚNICA de la etiqueta plural del día fijo, con fallback único (IN-01)"
  - "toISODate(d) exportado: fuente ÚNICA de la serialización 'yyyy-MM-dd' por componentes locales (IN-02)"
affects: [07-09, 07-11, 07-12, secure-phase-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reparación por reintento: cuando dos escrituras no pueden ser atómicas, la rama que detecta 'ya estaba hecho' RE-EMITE el efecto idempotente en vez de solo informarlo"
    - "Degradación explícita: un fallo de lectura que alimenta un consentimiento se marca con un flag, nunca se colapsa a un valor legítimo"

key-files:
  created: []
  modified:
    - lib/abono-cancel.ts
    - lib/abono-cancel.test.ts
    - test/abono-cancel.test.ts

key-decisions:
  - "CR-01 se cierra con barrido de reparación en la rama alreadyCancelled, NO con un RPC SECURITY DEFINER (evita migración extra + superficie definer) ni invirtiendo el orden de las escrituras (dejaría la serie 'active' con turnos cancelados y el cron los regeneraría)"
  - "cancelledCount se mantiene en 0 en la rama reparadora: informa 'cuántos canceló ESTA baja', no 'cuántos reparó' — devolver lo reparado anunciaría un efecto que el usuario no produjo"
  - "alreadyCancelled: true pasa a significar 'esta llamada no volteó la serie' (no re-disparar mails), NUNCA 'no hay nada que hacer'"

patterns-established:
  - "Todo UPDATE del motor sobre appointments lleva los 4 filtros: business_id + abono_id (doble scoping D-24) + gte(date, cutoff) (D-02) + neq(status,'cancelled') (idempotencia)"
  - "El motor sigue siendo rol-agnóstico: los tests puros le inyectan un doble del cliente Supabase en vez de mockear el paquete"

requirements-completed: [ABONO-04, ABONO-05]

# Metrics
duration: 22min
completed: 2026-07-21
status: complete
---

# Phase 7 Plan 06: Reintento reparador de la baja del abono + contratos compartidos Summary

**El reintento de la baja del abono ahora REPARA la serie que quedó a medias (0 turnos futuros vivos, sin re-disparar mails), el preview marca `unknown` cuando no pudo calcular, y el motor publica `abonoDayLabel`/`toISODate` como fuente única.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-07-21T18:30Z
- **Completed:** 2026-07-21T18:42Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- **CR-01 cerrado** (único BLOCKER del code review de la Phase 7). La rama `(b)` de `cancelAbonoSeries` re-emite la cancelación en masa antes de responder: un reintento sobre una serie con la fila ya en `cancelled` y sus turnos futuros vivos los cancela todos. Sigue devolviendo `alreadyCancelled: true`, así que ninguna vía re-dispara mails (D-05/D-14) y el gate atómico de `(a)` quedó intacto.
- **WR-04 cerrado a nivel motor.** `previewAbonoCancellation` devuelve `{ count: 0, lastDate: null, unknown: true }` ante error de DB, en vez de un cero indistinguible de "no hay turnos". El consumo en la UI lo cierra el Plan 07-09.
- **IN-01 / IN-02 cerrados del lado del proveedor.** `abonoDayLabel(dow)` (fallback ÚNICO `'los días'` para cualquier valor que no sea entero 0..6) y `toISODate(d)` (componentes locales, zero-padded) se exportan desde `lib/abono-cancel.ts`; `todayISOInAR()` ahora delega en `toISODate(todayInAR())`. Los 4 consumidores los adoptan en 07-09 y 07-11.
- **Suite completa verde: 694 passed / 1 skipped, 53 archivos** con `--no-file-parallelism`. Baseline previo documentado: 683 → +11 casos nuevos, ninguno borrado.

## Task Commits

1. **Task 1 (RED): caso del reintento reparador** — `bf004f5` (test)
2. **Task 1 (GREEN): barrido de reparación en la rama alreadyCancelled** — `bcaadf0` (fix)
3. **Task 2 (RED): preview degradado + abonoDayLabel/toISODate** — `5316d5e` (test)
4. **Task 2 (GREEN): flag `unknown` + los dos contratos compartidos** — `342496b` (feat)
5. **Task 3: gate de regresión** — sin commit propio: es un gate de verificación y no requirió cambios de código (la suite salió verde sin tocar nada).

_TDD: cada tarea produjo su commit RED y su commit GREEN. No hubo fase REFACTOR (no quedaron cambios pendientes de limpieza)._

## Files Created/Modified

- `lib/abono-cancel.ts` — barrido de reparación en la rama `(b)`; `AbonoCancelSummary.unknown`; `abonoDayLabel` y `toISODate` exportados; `todayISOInAR` delega; cabecera doctrinal ampliada con la garantía "no atómica pero recuperable por reintento"; comentario de `(c)` corregido (antes afirmaba que "el caller decide si reintenta", premisa que era falsa).
- `test/abono-cancel.test.ts` — 5 casos nuevos (9-13) contra la DB local: reintento reparador, el barrido no toca el pasado, no cruza serie ni tenant, idempotencia de la 3ª llamada, `not_found` sin barrido. Dos helpers nuevos: `liveFutureCount` y `seedHalfCancelled`.
- `lib/abono-cancel.test.ts` — 6 casos puros nuevos: preview con error → `unknown: true`, preview OK sin flag, `abonoDayLabel` en los 7 dow + fallback único sobre 5 entradas inválidas, `toISODate` por componentes locales + zero-pad. Doble de cliente Supabase (`fakeSupabase`) que reproduce la cadena exacta del preview.

## RED verificado

Antes del fix, los casos nuevos fallaban contra el código previo: `9 — CR-01: el reintento…` y `12 — el barrido es idempotente…` daban `expected 4 to be +0` (los 4 turnos futuros seguían vivos). Los casos 10, 11 y 13 pasan en ambos estados a propósito: son las barandas que verifican que el barrido NO se pase de alcance.

## Decisions Made

- **CR-01 → barrido de reparación** (opción 1 del plan). Descartadas: (2) RPC `SECURITY DEFINER` transaccional — obliga a una migración extra coordinada a mano con prod, agrega superficie definer a blindar con `search_path` fijo y rompe el contrato rol-agnóstico del motor; (3) invertir el orden de las escrituras — empeora el escenario, porque un fallo parcial dejaría la serie `active` con los turnos cancelados y el **cron los regeneraría** en la corrida siguiente.
- **`cancelledCount` se queda en 0** en la rama reparadora, comentado en el código: el número informado es "cuántos canceló ESTA baja". Devolver lo reparado haría que el panel y la pantalla pública anuncien un efecto que el usuario no produjo.
- **El barrido es un UPDATE sin `.select()`**: la rama no necesita las filas afectadas (informa 0 a propósito), así que no se traen datos que después se descartan.

## Deviations from Plan

### Ajustes de entorno / criterios

**1. [Rule 3 - Blocking] Los comandos de verificación del plan apuntaban al repo principal, no al worktree**

- **Found during:** Task 1 (primera corrida de tests)
- **Issue:** los bloques `<automated>` del plan arrancan con `cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app"`, que es el checkout principal. Ejecutados tal cual habrían testeado el código VIEJO y no los cambios de este plan (el worktree corre en `.claude/worktrees/agent-ac851c96326522424`).
- **Fix:** los mismos comandos se corrieron con el worktree como cwd. Para eso hizo falta preparar el entorno local del worktree, todo bajo rutas gitignoreadas y por lo tanto sin efecto sobre el commit: junction `node_modules` → el del repo principal, y copia de `.env.local` + `.env.test.local` + `next-env.d.ts`. `git status` quedó limpio en todo momento.
- **Verification:** `git status --short` vacío tras la preparación; la suite corrió contra la DB local (los tests de `test/` NO skipearon).
- **Committed in:** n/a (no hay archivos versionados involucrados)

**2. [Rule 1 - Criterio del plan inconsistente] El criterio de "igual cantidad de `.eq('abono_id')` que de `.eq('business_id')`" es insatisfacible por construcción**

- **Found during:** Task 1 (chequeo de criterios de aceptación)
- **Issue:** el plan pedía que la cantidad de líneas con `.eq('abono_id', abonoId)` fuera igual a la de `.eq('business_id', businessId)`. No puede serlo: las dos queries sobre `abonos` (gate atómico y desambiguación) llevan `business_id` pero se scopean por `.eq('id', abonoId)`, no por `abono_id`. Ya antes de este plan la relación era 2 vs 4.
- **Fix:** se verificó el INVARIANTE que el criterio protege, no su letra: hay 3 queries sobre `appointments` (preview + barrido + masivo) y `.eq('abono_id', abonoId)` aparece exactamente 3 veces, una por query, y las 3 llevan también `.eq('business_id', businessId)`. Doble scoping D-24 completo.
- **Verification:** `grep -cE "from\('appointments'\)"` = 3; `grep -cE "\.eq\('abono_id', abonoId\)"` = 3; `grep -cE "\.eq\('business_id', businessId\)"` = 5 (3 de appointments + 2 de abonos); test 11 asierta que `abonoB` y `abonoOther` quedan intactos.
- **Committed in:** `bcaadf0`

**3. [Rule 2 - Precisión] Reformulados dos comentarios para que los greps de aceptación midan el código y no la prosa**

- **Found during:** Task 2
- **Issue:** los docblocks nuevos citaban literalmente `unknown: true` y `'los días'`, y los criterios `grep -c` (que esperan 1) contaban también la prosa.
- **Fix:** los comentarios pasaron a decir "el flag `unknown` en true" y "la etiqueta VACÍA / una genérica". Los criterios ahora dan exactamente 1 en ambos casos, midiendo el código real.
- **Verification:** `grep -cE "unknown:\s*true"` = 1; `grep -c "'los días'"` = 1.
- **Committed in:** `342496b`

---

**Total deviations:** 3 (1 blocking de entorno, 1 criterio inconsistente del plan, 1 de precisión de verificación)
**Impact on plan:** ninguna cambia el alcance ni el comportamiento pedido. Cero dependencias nuevas: `package.json` y `package-lock.json` intactos (T-07-SC).

## Prohibiciones verificadas

- Ninguna rama escribe un status distinto de `'cancelled'`: `grep -cE "update\(\{[^}]*status:\s*'(active|confirmed|pending)'"` = 0. `'cancelled'` sigue siendo TERMINAL (D-04) y el barrido no reabre slots → no hay ventana nueva de doble-booking.
- El barrido lleva SIEMPRE `business_id` + `abono_id` (test 11 lo asierta contra otra serie y otro tenant).
- El módulo no manda mails ni instancia clientes Supabase: sigue recibiendo el cliente por parámetro.
- Cero funciones RPC y cero migraciones desde este plan.
- `07-01..07-05-PLAN.md` no se tocaron.

## Issues Encountered

- El worktree venía sin `node_modules` ni archivos de entorno, así que la suite habría skipeado en bloque los tests contra la DB (`describe.skipIf(!hasSupabaseCreds)`) — un falso verde. Resuelto con la junction + la copia de los `.env` (deviación 1). Con eso, los 13 tests de `test/abono-cancel.test.ts` corrieron de verdad contra el Supabase local.
- No apareció ningún fallo, ni causado por este plan ni pre-existente: la suite completa con `--no-file-parallelism` salió **694 passed / 1 skipped / 0 failed**. Los 3 fallos intermitentes listados en `deferred-items.md` no se manifestaron (son de contención con paralelismo de archivos, que la bandera desactiva).

## Baseline para el resto de la tanda

| Métrica | Antes (documentado en `deferred-items.md`) | Después de 07-06 |
|---|---|---|
| Tests verdes (`npx vitest run --no-file-parallelism`) | 683 passed / 1 skipped | **694 passed / 1 skipped** |
| Archivos de test | — | 53 passed |
| `npx tsc --noEmit` | 0 | 0 |
| `npx eslint lib/abono-cancel.ts` | 0 | 0 |

El Plan 07-12 debe comparar contra **694**.

## User Setup Required

None — no hay configuración externa, ni migración, ni variable de entorno nueva.

## Next Phase Readiness

- **07-09** ya puede consumir `AbonoCancelSummary.unknown` en la pantalla pública (mostrar "no pudimos calcular cuántos turnos se cancelan" en vez de omitir el aviso previo) y `abonoDayLabel` en `app/abono/cancelar/[token]/page.tsx`.
- **07-11** ya puede reemplazar las 3 copias restantes de `DAY_LABELS` (`app/api/abonos/cancel/route.ts`, `app/api/abonos/cancel/[token]/route.ts`, `app/api/abonos/create/route.ts`) y las 2 de `toISODate` (`abonos/create`, cron) por los imports de `lib/abono-cancel`.
- **secure-phase**: las amenazas T-07-23..T-07-27 del plan quedan cubiertas por código + tests (T-07-26 sigue en `accept`, sin cambios).
- Sin bloqueantes.

---
*Phase: 07-cancelaci-n-del-abono-mail-panel*
*Completed: 2026-07-21*
