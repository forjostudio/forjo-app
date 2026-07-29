---
phase: 12-cupo-por-solape-recurso-simult-neo
plan: 04
subsystem: testing
tags: [vitest, supabase, postgres, advisory-lock, concurrency, race-test, multi-tenant]

# Dependency graph
requires:
  - phase: 12-01
    provides: "migr. 062 — services.capacity_mode/capacity + book_slot_atomic mode-aware (lock service-day + gate por solape)"
  - phase: 12-02
    provides: "booking-core mode-aware (el early-return JS ya no corta el 2º solape) + availability overlap-aware"
  - phase: 02-cupos-grupales
    provides: "test/concurrency.test.ts (molde CONC-01: Promise.all + assert duro por la DB) + seedTimeBlock"
provides:
  - "seedSimultaneousService(seeded, { capacity }) en test/helpers/booking-fixtures.ts"
  - "CUPO-04: carrera N+1 escalonada real contra la DB (3 starts que comparten un instante, cupo 2)"
  - "occupantsCovering(instant): assert DURO por INTERVALO contra el estado real de la DB"
  - "CUPO-02 secuencial (3ª solapada → slot_full) + simultáneo cupo 1 (2ª solapada → 409)"
  - "Evidencia A/B de la re-granularización del lock (D-06): falla con el lock viejo, pasa con el service-day"
affects: [secure-phase 12 (evidencia de atomicidad T-12-16/17/18), deploy de la migr. 062 a prod]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Warm-up del pool HTTP antes de una carrera para que las N transacciones lleguen JUNTAS al RPC (si no, el test es un falso verde)"
    - "Control negativo A/B: parchear la función en la DB local con el lock viejo, ver el test FALLAR, y restaurar con supabase db reset"

key-files:
  created: []
  modified:
    - test/helpers/booking-fixtures.ts
    - test/concurrency.test.ts

key-decisions:
  - "El warm-up (3 lecturas triviales en paralelo) es parte del test, no un detalle: sin él CUPO-04 pasaba INCLUSO con el lock viejo — no detectaba nada"
  - "El assert duro cuenta por INTERVALO (occupantsCovering), no por hora exacta: es el único conjunto que espeja el gate del RPC (business_id + service_id + date + solape)"
  - "El afterEach devuelve el service a los defaults ('group_class'/1) porque el tenant/service es compartido por todo el archivo"
  - "Simultáneo cupo 1 asierta el error EXACTO observado (slot_full, no slot_taken): el gate por solape lo agarra antes que el EXCLUDE 013"

patterns-established:
  - "Un test de carrera contra la DB no vale hasta que se lo vio FALLAR contra el código sin el fix (control negativo obligatorio)"

requirements-completed: [CUPO-02, CUPO-04, CUPO-05]

# Metrics
duration: 30min
completed: 2026-07-29
status: complete
---

# Phase 12 Plan 04: Verificación dura del anti-sobrecupo por solape Summary

**La garantía atómica del recurso simultáneo queda PROBADA, no argumentada: tres reservas escalonadas concurrentes sobre un cupo 2 dejan exactamente 2 filas en la DB, y el mismo test se vio FALLAR (3 ok / 3 filas = sobrecupo) contra el advisory lock viejo antes de pasar con el lock service-day de la 062.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-07-29T13:38:00-03
- **Completed:** 2026-07-29T14:08:00-03
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- **CUPO-04 — carrera real contra la DB.** Servicio `simultaneous_resource` cupo 2, duración 30': tres altas EN PARALELO en 16:00 / 16:10 / 16:20 (las tres se pisan de a pares y comparten `[16:20,16:30)`) resuelven **exactamente 2 ok + 1 `slot_full` (409)**, con assert DURO sobre el estado real: **2 filas** ocupan el instante compartido, nunca 3.
- **Control negativo DEMOSTRADO (no asumido).** Se parcheó `book_slot_atomic` en la DB local dejando el gate por solape intacto pero volviendo al lock viejo `hash(business_id+date+time)`; CUPO-04 **falló 3 de 3 corridas** con `expected 3 to be 2` (tres inserts = sobrecupo). Restaurada la 062 vía `supabase db reset`, pasa. Eso es la prueba de que lo que salva el cupo es la **re-granularización del lock (D-06)**, no el conteo.
- **El test era un falso verde y se arregló.** Sin warm-up del pool HTTP, CUPO-04 **pasaba incluso con el lock viejo**: cada `createAppointmentCore` hace 5 round-trips antes del `.rpc` y, con el pool frío, el primer carril abre el socket y los otros llegan escalonados — la carrera nunca ocurría. Tres lecturas triviales en paralelo antes del `Promise.all` alinean los tres carriles.
- **CUPO-02 (secuencial) + simultáneo cupo 1.** Con cupo 2 las dos primeras escalonadas ENTRAN (el caso que el early-return de `booking-core` cortaba antes de 12-02) y la 3ª recibe `slot_full`/409; con cupo 1 la 2ª solapada se rechaza con `slot_full`/409 y queda 1 sola fila. Ningún `time` se repite en ninguno de los casos: un gate por hora exacta los dejaría pasar a todos.
- **Gate CUPO-05 corrido.** `supabase db reset` replayó baseline + 040..062 en orden sin error; la suite completa quedó en **774-777 passed / 1 skipped de 780**, con los ÚNICOS fallos en `abono-*` (flakiness pre-existente, ver abajo). Las 8 suites del motor corridas juntas: **52 passed / 1 skipped, 0 fallos**.

## Task Commits

1. **Task 1: Fixture `seedSimultaneousService` + casos CUPO-04 / CUPO-02 / simultáneo cap 1** — `742123c` (test)
2. **Task 2: [BLOCKING] `supabase db reset` + `npm run test` + control negativo A/B** — `b7e6c73` (test — endurecimiento del warm-up que salió del A/B; el reset y la corrida de la suite no producen archivos)

## Files Created/Modified

- `test/helpers/booking-fixtures.ts` — `seedSimultaneousService(seeded, { capacity })`: `UPDATE services SET capacity_mode='simultaneous_resource', capacity=N` filtrado por `id` + `business_id` (service-role, throw en error). Molde de `seedProfessionalService`; la firma de `seedOneTenant` quedó intacta.
- `test/concurrency.test.ts` — `occupantsCovering(instant)` (assert duro por intervalo, `[inicio, fin)` igual que `tsrange &&`, filtrado por `service_id`), reset del service a los defaults en el `afterEach`, warm-up del pool, y los tres casos nuevos (`CUPO-04`, `CUPO-02`, `simultáneo cupo 1`). Los 6 casos existentes (CONC-01/02/03, CUPOS-02/03, ALQUILER-02) no se tocaron.

## Evidencia A/B del control negativo (números observados)

| Variante de `book_slot_atomic` en la DB local | `oks` | `slot_full` | Filas que ocupan `[16:20]` | Resultado |
|---|---|---|---|---|
| Lock VIEJO `hash(business_id+date+time)`, gate por solape intacto | **3** | 0 | **3** (sobrecupo) | **FALLA** — `AssertionError: expected 3 to be 2`, 3 de 3 corridas |
| Lock 062 `hash(business_id+service_id+date)` (service-day) | 2 | 1 | 2 | **PASA** — 9/9 tests del archivo verdes |

Sonda previa a nivel RPC crudo (sin pasar por el core), con el lock viejo: los tres `.rpc` arrancan en `+0ms` y duran 15-18ms cada uno → los tres cuentan antes de que ninguno commitee → **3 filas insertadas**. Ese es exactamente el bug que la 062 corrige.

Procedimiento del A/B (reproducible): se generó una copia de la función de la 062 con el único cambio de la clave del lock, se aplicó con `docker exec supabase_db_forjo-app psql`, se corrió `npx vitest run test/concurrency.test.ts -t "CUPO-04"` (3 veces), y se restauró el estado con `npx supabase db reset`. Se verificó a mano en `pg_proc.prosrc` cuál de las dos claves estaba instalada antes y después. La función parcheada vivió SOLO en la DB local; no se creó ningún archivo en `supabase/migrations/`.

## Gate CUPO-05 — números reales de la suite

- `npx supabase db reset`: replayó el baseline + `040..062` en orden, `062_service_capacity_mode_overlap.sql` aplicó limpio. Sin errores.
- `npm run test` (3 corridas completas): `775/780`, `777/780`, `774/780` passed (1 skipped fijo = gate de Storage, apagado en local).
- **Todos los fallos, en las 3 corridas, en `abono-create.test.ts` / `abono-cron.test.ts` / `abono-generation.test.ts`** (entre 2 y 5 según la corrida): timeouts de 5s y asserts de cantidad de ocurrencias. **Corridos en aislamiento: `3 passed (3) | 34 passed (34)`.** Es la flakiness por carga/paralelismo contra la DB local que el Plan 12-01 ya verificó A/B restaurando la función de la 058 (fallan los MISMOS tests sin la 062). NO se tocó: es ajena a esta fase.
- **Regresión de las 4 vías, corrida junta y limpia:** `concurrency`, `canchas-booking`, `staff-assignment`, `booking-core`, `booking-cualquiera-public`, `booking-public-regression`, `manual-booking`, `isolation` → **8 files passed, 52 passed | 1 skipped, 0 fallos**. `slot_full`/`slot_taken` no se degradaron: CONC-02 sigue dando `slot_taken` en cupo 1 grupal y CUPOS-03 sigue dando `slot_full` en el excedente grupal.
- **NO** se corrió `supabase db push` ni se tocó prod en ningún momento.

## Decisions Made

- **El warm-up es parte del contrato del test, no un tweak.** Queda comentado en el código con el porqué y con el número medido, para que nadie lo borre por "ruido".
- **`occupantsCovering` filtra por `service_id`** (además de business+date+estado): es el conjunto EXACTO del gate del RPC (062:309-322). Contar por bucket/profesional mediría otra cosa (D-03/D-04, carriles independientes).
- **El `time_block` de los casos simultáneos se siembra con `capacity: 1` a propósito.** Es el caso real (un servicio individual que pasa a recurso simultáneo) y además vuelve a exponer el LANDMINE del re-check JS: con `slotCapacity=1`, si el gate por modo de 12-02 se cayera, el 2º turno moriría con `slot_taken` y el test lo cantaría.
- **Simultáneo cupo 1 asierta `slot_full`, no `slot_taken`.** Observado contra la DB: el gate por solape (`overlap 1 >= 1`) dispara ANTES que el EXCLUDE gist 013, que con `is_group=false` queda de respaldo redundante. Fijarlo hace que una degradación en cualquiera de los dos sentidos salte como regresión.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] El test CUPO-04 como estaba especificado era un FALSO VERDE**
- **Found during:** Task 2 (control negativo A/B)
- **Issue:** con el lock viejo instalado en la DB local, CUPO-04 **pasaba** (2 ok + 1 `slot_full`). Es decir: el test no detectaba la regresión que existe para detectar. Causa: `createAppointmentCore` hace 5 round-trips HTTP antes del `.rpc` y, con el pool de conexiones frío, el primer carril abre el socket y los otros dos esperan los suyos → llegan al RPC escalonados y la carrera nunca ocurre (la 3ª cuenta cuando las otras dos ya commitearon). Una sonda a nivel `.rpc` crudo confirmó que con conexiones calientes los tres arrancan en `+0ms` y el sobrecupo aparece.
- **Fix:** tres lecturas triviales en paralelo (`services.select('id')`) antes del `Promise.all`, para abrir los sockets sin tocar estado. Con eso el control negativo falla 3 de 3 corridas.
- **Files modified:** `test/concurrency.test.ts`
- **Verification:** A/B completo — lock viejo → `expected 3 to be 2` (3/3); lock 062 → 9/9 verdes.
- **Committed in:** `b7e6c73`

**2. [Rule 3 - Blocking] Verificación con el binario local de TypeScript, no con `npx tsc`**
- **Found during:** Task 1
- **Issue:** el bloque `<automated>` del plan escribe `npx tsc --noEmit`; en este proyecto eso puede resolver `tsc@2.0.4` del registry (que NO es el compilador y siempre sale 0). Trampa ya documentada y repetida en 12-01 y 12-02.
- **Fix:** se ejecutó `./node_modules/.bin/tsc --noEmit` (limpio, exit 0).
- **Files modified:** ninguno
- **Committed in:** n/a (procedimiento de verificación)

---

**Total deviations:** 2 auto-fixed (1 missing-critical, 1 blocking)
**Impact on plan:** los artefactos son exactamente los del plan; la desviación 1 es lo que convierte el plan en una verificación real en vez de una ceremonia. Sin scope creep: no se tocó código de producción.

## Issues Encountered

- **`abono-create` / `abono-cron` / `abono-generation` fallan entre 2 y 5 tests en la corrida COMPLETA y pasan 34/34 en aislamiento.** Flakiness pre-existente por carga/paralelismo contra la DB local (timeouts de 5s), ya verificada A/B en el Plan 12-01 contra la función de la 058. Ajena a esta fase; no se tocó (fuera de scope). **No enmascara nada de esta fase:** ninguna suite del motor falló en ninguna de las 3 corridas.
- **La función parcheada del A/B nunca tocó el repo.** Vivió solo en la DB local y se borró con `supabase db reset`; el estado final de la DB local es el baseline + 040..062 tal cual el repo (verificado leyendo `pg_proc.prosrc`).

## Known Stubs

Ninguno.

## Threat Flags

Ninguna superficie nueva: este plan solo agrega tests y un fixture de seed. Los tres threats del `<threat_model>` quedan cubiertos con evidencia — **T-12-16** (assert duro por la DB + control negativo demostrado), **T-12-17** (suite completa corrida sobre el baseline con la 062, 4 vías verdes), **T-12-18** (el gate fue `supabase db reset` ANTES de `npm run test`, nunca se validó contra una DB sin la 062).

## User Setup Required

**La migración 062 se aplica A MANO al Supabase de PROD, coordinada con el deploy** (última en prod: 061). Tras aplicarla: `NOTIFY pgrst, 'reload schema';`. `supabase/schema.sql` ya refleja el estado (Plan 12-01). No hay variables de entorno nuevas.

## Next Phase Readiness

- **Fase 12 cerrada del lado del código.** Queda pendiente el UAT visual del panel (Plan 12-03, auto-aprobado) y el **`secure-phase` obligatorio** — este plan es la evidencia de atomicidad que ese gate exige (no acepta lectura de código): CUPO-04 con control negativo demostrado.
- Para el deploy: aplicar la 062 a prod + `NOTIFY pgrst`.

## Self-Check: PASSED

- `test/helpers/booking-fixtures.ts` — existe y contiene `seedSimultaneousService` / `simultaneous_resource`
- `test/concurrency.test.ts` — existe y contiene `CUPO-04` / `slot_full` / `occupantsCovering`
- `.planning/workstreams/motor-reservas/phases/12-cupo-por-solape-recurso-simult-neo/12-04-SUMMARY.md` — existe
- Commits `742123c`, `b7e6c73` — presentes en el historial
- `./node_modules/.bin/tsc --noEmit` — limpio
- `npx supabase db reset` (040..062) + `npm run test` — corridos; solo `abono-*` (flaky pre-existente) en rojo

---
*Phase: 12-cupo-por-solape-recurso-simult-neo*
*Completed: 2026-07-29*
