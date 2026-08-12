---
phase: 15-modelo-de-cupo-unificado
plan: 05
subsystem: booking
tags: [supabase, postgres, vitest, integration-tests, trigger, multi-tenant, runbook, migration]

# Dependency graph
requires:
  - phase: 15-modelo-de-cupo-unificado
    plan: 01
    provides: "migr. 068 aplicada en LOCAL — enum de tres modos, los dos CHECK, el DEFAULT 'individual' y el gate services_block_mode_change"
  - phase: 15-modelo-de-cupo-unificado
    plan: 03
    provides: "book_slot_atomic leyendo services.capacity en las dos ramas"
  - phase: 15-modelo-de-cupo-unificado
    plan: 04
    provides: "las lecturas JS alineadas — sin ellas el caso (c) moriría en el re-check JS antes de llegar al RPC"
provides:
  - "test/capacity-mode-change-gate.test.ts — 7 casos de integración del gate de CUPO-08 contra Postgres real, con control negativo ejecutado"
  - "CUPO-07 (c) y (d) en test/concurrency.test.ts — control negativo del cupo por bloque en la hora exacta y carrera N+1 sobre el cupo declarado, con A/B contra un mutante"
  - "15-RUNBOOK-068.md — pre-flight con criterio de aborto, orden respecto del deploy, verificación por instalación (D-09) y rollback por objeto"
affects: [phase-16, secure-phase-15, produccion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Un test de gate no cuenta como verde hasta que se lo vio FALLAR sin el gate: dropear el trigger, correr, restaurar"
    - "El A/B de una fase que mueve una fuente de datos se hace instalando el MUTANTE que restaura la fuente vieja, no razonando sobre el diff"
    - "Un runbook operativo se escribe con criterios de decisión (SEGUIR / ABORTAR / REGISTRAR) por control, no con pasos"
    - "Todo control de un runbook devuelve FILAS: los RAISE NOTICE no se ven en el SQL Editor de Supabase"

key-files:
  created:
    - test/capacity-mode-change-gate.test.ts
    - .planning/workstreams/motor-reservas/phases/15-modelo-de-cupo-unificado/15-RUNBOOK-068.md
  modified:
    - test/concurrency.test.ts

key-decisions:
  - "El orden del deploy que fija el runbook es CÓDIGO PRIMERO, contra lo que sugería el <action> del plan: si la 068 llega antes, el editor viejo rebota con 23514 al elegir 'Clase grupal'. La ventana intermedia (código nuevo + base vieja) es sub-oferta transitoria, nunca sobre-venta, y queda escrita con su mitigación"
  - "El caso (c) es hermano del (b), no su reemplazo: el (b) prueba el EXCLUDE 013 con un solape (23P01) y el (c) prueba el CUPO efectivo en la hora exacta (23505). Son constraints distintos"
  - "El contrapeso del aislamiento por tenant va DENTRO del mismo it: sin él, una RLS que bloqueara a todos dejaría el caso verde"
  - "Los dos casos de abonos que cortan por timeout NO se arreglan acá: son de la Phase 14, no tocan cupo, y el plan prohíbe tocar código fuera de los tests de la fase"

patterns-established:
  - "Cuando un caso nuevo obliga a que un comentario existente deje de ser cierto, se corrige el comentario en el mismo commit: un comentario que miente es peor que ninguno"
  - "El mutante se instala con el CREATE OR REPLACE de la migración vigente + la línea vieja, y se restaura re-aplicando la migración entera (que es idempotente por diseño) — nunca con db reset"

requirements-completed: [CUPO-07, CUPO-08]

# Metrics
duration: ~40min
completed: 2026-08-12
status: complete
---

# Phase 15 Plan 05: La verificación del gate y el runbook de la 068 — Summary

**CUPO-08 queda probado contra Postgres real con 7 casos que se vieron FALLAR sin el trigger, CUPO-07 suma el control negativo del cupo por bloque en la hora exacta y la carrera N+1 sobre el cupo declarado —los dos vistos fallar contra un mutante que restaura la lectura vieja—, y la 068 queda con un runbook que dice cuándo NO aplicarla. La 068 sigue sin aplicar en producción.**

## Performance

- **Duration:** ~40 min
- **Completed:** 2026-08-12
- **Tasks:** 3
- **Files:** 2 creados, 1 modificado

## Task Commits

| Task | Commit | Qué entró |
|---|---|---|
| 1 — Suite del gate | `49a0ff4` | `test/capacity-mode-change-gate.test.ts` (7 casos, 292 líneas) |
| 2 — Los dos casos de carrera | `8b6d0f0` | `test/concurrency.test.ts` — CUPO-07 (c) y (d) + el comentario de (b) corregido |
| 3 — Runbook | `9e163aa` | `15-RUNBOOK-068.md` (245 líneas) |

## Accomplishments

### Task 1 — La suite del gate de cambio de modo (CUPO-08)

`test/capacity-mode-change-gate.test.ts`, molde literal de `abono-delete-gate.test.ts`. **7 casos, 0 skips.**

| # | Qué prueba | Qué detecta si falla |
|---|---|---|
| 1 | Turno futuro vivo ⇒ rechazo `P0001` + `service_mode_has_future_appointments` **+ el servicio sigue en el modo anterior** | el gate no está instalado, o dejó de ver los turnos futuros vivos |
| 2 | Turnos futuros **cancelados** + pasado vivo ⇒ el cambio pasa **y queda escrito** | un `RETURN NULL` cancelando la escritura en silencio (T-14-16) |
| 3 | Turno futuro con `status` **NULL** bloquea igual | alguien "simplificó" el predicado a `NOT IN (...)`, que sobre NULL evalúa NULL y **abre** el gate |
| 4 | Turno de **hoy en hora AR** cuenta como futuro | la frontera calculada en UTC (a las 22:00 AR el `now()` UTC ya es mañana) |
| 5 | Con un turno futuro vivo: **desactivar** y **renombrar** (con `capacity_mode` en el SET, como emite `saveEditService`) pasan y persisten | el error que el review propuso en la 067 y que habría roto todas las bajas de abono en prod |
| 6 | Cross-tenant: 0 filas, sin error, servicio ajeno intacto **+ contrapeso** (el propio dueño sí escribe, 1 fila) | una RLS rota que bloqueara a todos dejaría la primera mitad verde |
| 7 | Los **dos** sentidos del CHECK: grupal/1 y individual/2 rebotan con `23514`, fila intacta | el CHECK no se creó, o se creó con una sola rama |

**Las tres defensas del molde están en cada caso:** `code` **y** `message` asertados (no "hubo error"), lectura del **estado real** de la base después de cada intento, y los **dos guards anti-falso-verde** en el `beforeAll` (sesión anon viva / anon key ≠ service-role).

**Cada caso siembra SU propio servicio** con `seedService`, así que ningún `UPDATE` puede salir "Success" por no matchear ninguna fila — que es la trampa que vuelve un gate roto indistinguible de uno sano.

### Task 2 — Los dos casos de carrera de CUPO-07

**CUPO-07 (c)** — control negativo del cupo por bloque **sobre la hora exacta**. Bloque en 3 (miente), servicio en el DEFAULT (`individual`/1, **leído** de la base, no asumido). Dos reservas del **mismo slot exacto**, secuenciales, asertadas por los **dos** caminos:
- por `createAppointmentCore` → `slot_taken` + **409** (nunca `slot_full`: un `slot_full` acá sería la firma de un cupo > 1 heredado del bloque);
- por **RPC directo** (lo que ve `autoAssign`, sin ningún re-check JS) → **`23505`** crudo del índice único 011 sobre el seat 0 repetido.

Y tres asserts de estado: **1** fila, `seat = 0`, `is_group = false`.

**CUPO-07 (d)** — carrera grupal con el cupo declarado en el servicio. Bloque en su cupo por defecto (**1**), servicio `group_class` cupo **N = 3**, **N+1 = 4** reservas concurrentes al mismo horario, con **warm-up de N+1 carriles** antes del `Promise.all`. Resultado: **3** confirmadas + **1** `slot_full`/409; **3** filas, **3** asientos distintos, `is_group = true` en todas.

### Task 3 — El runbook (`15-RUNBOOK-068.md`)

Cinco secciones, cada control con su **criterio de decisión** (SEGUIR / ABORTAR / REGISTRAR), no prosa:

1. **Pre-flight con ABORTO.** `max(capacity) from time_blocks > 1` ⇒ **no se aplica** (la premisa D-02 dejó de valer: hay un negocio cuyo cupo vive en el bloque y la migración se lo bajaría a 1). Con `bloques = 0` también se aborta — mediría el entorno equivocado. Y queda escrito **por qué** los controles devuelven números en vez de `where capacity > 1`.
2. **Aplicación.** Archivo entero, una sola sesión, **a mano**; `db push` **prohibido** (prod no tiene `schema_migrations`); el `NOTIFY pgrst, 'reload schema'` es la última sentencia y es obligatoria.
3. **Verificación por INSTALACIÓN, no por comportamiento (D-09).** `pg_constraint` (los dos CHECK con su definición), `information_schema` (el DEFAULT), `pg_trigger` (el trigger + `tgenabled`), `pg_proc.prosrc` (el código de dominio del gate **y** que `book_slot_atomic` ya **no** contenga `MAX(tb.capacity)`), más el agrupado por modo y un conteo de filas incoherentes. **Todos devuelven filas** — los `RAISE NOTICE` no se ven en el SQL Editor.
4. **Rollback por objeto**, con la trampa del enum viejo (volver a dos valores exige revertir antes el backfill) y con lo que se pierde al no revertir el backfill: **solo la etiqueta**, cero datos y cero reservas rotas.
5. **Después:** última aplicada = **068**, próxima del proyecto = **069**; espejado de `schema.sql` quirúrgico y **nunca** por `db dump` (ya está hecho por 15-01: verificar drift, no regenerar).

## Los dos controles negativos — EJECUTADOS, con el fallo transcrito

Un test de garantía que pasa con y sin la garantía no cuenta como verificación. Los dos se corrieron.

### (A) Task 1 — la suite del gate contra una base SIN el trigger

```
docker exec supabase_db_forjo-app psql -U postgres -d postgres \
  -c 'DROP TRIGGER "services_block_mode_change_trg" ON "public"."services";'
→ DROP TRIGGER   (triggers_restantes = 1)
```

```
 Test Files  1 failed (1)
      Tests  3 failed | 4 passed (7)

 FAIL  1 — con un turno futuro vivo el cambio de modo se RECHAZA (P0001 / service_mode_has_future_appointments)
 AssertionError: expected null not to be null
   ❯ test/capacity-mode-change-gate.test.ts:142:27   expect(upd.error).not.toBeNull()

 FAIL  3 — un turno futuro con status NULL también bloquea el cambio de modo
 AssertionError: expected undefined to be 'P0001'   (Received: undefined)

 FAIL  4 — un turno de HOY (hora AR) cuenta como futuro y bloquea el cambio de modo
 AssertionError: expected undefined to be 'P0001'   (Received: undefined)
```

Los **tres** casos de rechazo caen; los cuatro que no dependen del trigger (2, 5, 6, 7) siguen verdes — exactamente el reparto esperado, que es la señal de que cada caso prueba lo suyo. Restaurado el trigger con el `CREATE TRIGGER` literal de la 068 → **7/7**.

### (B) Task 2 — la carrera contra un MUTANTE que restaura la lectura del bloque

Mutante: el `CREATE OR REPLACE` de `book_slot_atomic` de la **068** con `v_capacity := v_svc_cap;` reemplazado por el `SELECT COALESCE(MAX(tb.capacity), 1) INTO v_capacity FROM time_blocks tb ...` de la **064**. Verificado instalado: `position('MAX(tb.capacity)' in prosrc) > 0` → `t`.

```
 Test Files  1 failed (1)
      Tests  4 failed | 20 skipped (24)     [-t "CUPO-07"]

 FAIL  CUPO-07 (d) — carrera: N+1 reservas concurrentes sobre un grupal de cupo N dejan exactamente N
 AssertionError: expected 1 to be 3
   - Expected  3
   + Received  1
   ❯ test/concurrency.test.ts:1181   expect(results.filter(r => r.ok).length).toBe(N)

 FAIL  CUPO-07 (c) — control negativo: con el bloque en 3, un servicio individual sigue dando cupo 1 en la hora exacta
 AssertionError: expected undefined to be '23505'   (Received: undefined)
   ❯ test/concurrency.test.ts:356   expect(rpc.error?.code).toBe('23505')
```

**El fallo del (d) es LITERALMENTE el que su comentario predice:** con el cupo saliendo del bloque (que ahí vale 1) entra **1** y se rechazan **N**. Y el del (c) también: con el bloque en 3 la 2ª reserva **entra** por RPC (no hay `23505`), que es el "daría 2 filas" escrito en el comentario. Los cuatro casos CUPO-07 —(a), (b), (c) y (d)— fallan contra el mutante.

Restaurado re-aplicando la **068 entera** (idempotente por diseño: `DROP ... IF EXISTS`, guards por `pg_constraint`, backfill por predicado) — **no** con `db reset`, que habría borrado los datos de prueba locales. Verificado: `position('MAX(tb.capacity)' in prosrc) > 0` → `f`, y los dos triggers de `services` presentes.

## Verificación

Comandos **literales** y su exit code.

| Comando | Resultado |
|---|---|
| `./node_modules/.bin/vitest run test/capacity-mode-change-gate.test.ts --no-file-parallelism` | **7 passed (7)**, 0 skips, exit **0** |
| `./node_modules/.bin/vitest run test/concurrency.test.ts --no-file-parallelism` | **24 passed (24)** — 22 de 15-04 **+ 2**, exit **0** |
| `./node_modules/.bin/vitest run test/concurrency.test.ts test/capacity-mode-change-gate.test.ts --no-file-parallelism` | **31 passed (31)**, exit **0** |
| Las **12** suites del `<verification>` (booking-core, booking-cualquiera-public, booking-public-regression, manual-booking, canchas-booking, canchas-provision, abono-create, abono-generation, abono-cron, staff-assignment, service-delete-gate, isolation) | **12 files passed**, **114 passed + 1 expected fail + 1 skipped**, exit **0** |
| `./node_modules/.bin/tsc --noEmit` | exit **0** (corrido después de cada task) |
| `npm run build` | exit **0**, `✓ Compiled successfully in 76s`, 0 `Module not found` |

**El skip y el expected-fail declarados, para que nadie los lea como cobertura:**
- `↓ isolation.test.ts > upload-gate: A sin has_web_custom NO puede subir a landing-assets` — Storage local apagado (`hasStorageTests`), skip **por diseño**, no por falta de creds.
- 1 `expected fail` preexistente en las suites de abonos.

**`supabase db reset` NO se corrió** (la 068 ya estaba aplicada en local y el reset borra los datos de prueba del dueño). En su lugar se verificó la instalación directamente contra el catálogo: los dos triggers de `services`, los tres CHECK y la ausencia de `MAX(tb.capacity)` en `prosrc`.

### Acceptance criteria por grep

| Criterio | Esperado | Real |
|---|---|---|
| `grep -c "service_mode_has_future_appointments" test/capacity-mode-change-gate.test.ts` | ≥ 1 | **4** |
| `grep -cF "'P0001'" test/capacity-mode-change-gate.test.ts` | ≥ 1 | **3** |
| `grep -cF "'23514'" test/capacity-mode-change-gate.test.ts` | ≥ 1 | **2** |
| `grep -cF "GUARD" test/capacity-mode-change-gate.test.ts` | ≥ 2 | **4** |
| `grep -cE "\}, 20000\)" test/capacity-mode-change-gate.test.ts` | ≥ 7 | **7** |
| `grep -cF "is_group" test/concurrency.test.ts` (aumenta vs HEAD) | > 24 | **32** |
| `grep -c "pg_constraint\|pg_trigger\|pg_proc" <runbook>` | ≥ 3 | **5** |
| `grep -ci "abortar" <runbook>` | ≥ 1 | **3** |
| `grep -ci "db push" <runbook>` | ≥ 1 | **2** (en frases que lo **prohíben**) |
| `grep -c "069" <runbook>` | ≥ 1 | **1** |

## Deviations from Plan

### 1. `grep -cE "seedTimeBlock\(t, \{ capacity: 3"` devuelve **2**, no 1

**Encontrado en:** Task 2.
**Qué pasó:** el criterio asumía que el caso A sería el **único** `seedTimeBlock` con cupo > 1 del archivo. Pero **15-03 ya había dejado `CUPO-07 (b)` con ese mismo seed**, y su comentario in-file lo declara como "el ÚNICO del archivo que conserva un cupo > 1" (15-04 lo ratificó como decisión).
**Por qué no se fusionaron:** el (b) y el (c) prueban **constraints distintos** — el (b) solapa sin compartir hora y lo rechaza el **EXCLUDE gist 013** (`23P01`); el (c) comparte la **hora exacta** y lo rechaza el **índice único 011** (`23505`). Bajar el bloque del (c) a 1 lo dejaría sin poder discriminante (con bloque 1 la función vieja también daría 1 fila), que es exactamente el argumento con el que 15-04 defendió el bloque del (b).
**Lo que sí se hizo:** corregir el comentario del (b), que pasaba a **mentir**. Ahora dice "uno de los dos únicos… el otro es su hermano (c)". Es el único cambio sobre un caso existente y no toca ni un assert.
**Commit:** `8b6d0f0`.

### 2. `grep -cF "warmUpPool()"` se queda en 2 — el caso (d) llama `warmUpPool(N + 1)`

**Encontrado en:** Task 2.
**Qué pasó:** el criterio contaba la forma literal `warmUpPool()` (3 carriles por defecto). El caso (d) lanza **4** reservas concurrentes: warmear 3 dejaría el 4º carril **frío**, que es exactamente el falso verde que el warm-up viene a impedir.
**Fix:** se llama `warmUpPool(N + 1)`. El **intento** del criterio (una llamada de warm-up más) se cumple: `grep -cF "warmUpPool("` pasó de **4** a **5**.

### 3. El runbook fija **código primero**, no migración primero

**Encontrado en:** Task 3.
**Qué pasó:** el `<action>` del plan pedía escribir "la migración va primero". El `<read_first>` del mismo plan apunta a `15-01-SUMMARY`, que dice lo contrario: *"la 068 no debería llegar a prod antes"* del guard D-10.
**Quién tiene razón:** el guard. Con la 068 aplicada y el código viejo, elegir **"Clase grupal"** en el editor de prod **rebota con `23514`** (fuerza `capacity = 1`, que el CHECK nuevo prohíbe) — una pantalla que hoy funciona quedaría rota. El argumento del plan ("el código nuevo lee `services.capacity`") no se sostiene: esa columna existe desde la **062**.
**Cómo quedó escrito:** código primero, migración **inmediatamente después, en la misma ventana**, con la ventana intermedia y su mitigación explícitas — el riesgo de esa ventana es **sub-oferta** (un turno que se rechaza), nunca sobre-venta.

### 4. Dos casos de las suites de abonos cortan por timeout en corridas largas

**Encontrado en:** verificación de cierre.
`abono-create > 7` y `abono-cron > 5` caen con `Test timed out in 5000ms` cuando se corren **14** suites juntas; con las **12** del `<verification>` la corrida es **verde**, y aislados pasan. Es el trap ya registrado en `15-CONTEXT.md` (los 5000 ms por defecto no alcanzan contra el Supabase local). Los dos casos son de la **Phase 14**, no tocan cupo ni `book_slot_atomic`, y el plan prohíbe tocar código fuera de los tests de esta fase ⇒ **no se arreglaron**. Registrado en `deferred-items.md §2` con el fix (agregarles timeout explícito).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. Este plan no agrega superficie: no toca endpoints, ni auth, ni schema, ni policies. Los dos archivos de test corren contra el Supabase **local** y el runbook es un documento.

## UAT pendiente (checkpoint `end-of-phase` del Task 3)

El `<human-check>` del Task 3 es de **cierre de fase** y queda **sin correr** (modo auto). Es el mismo guion que va a pedir la verificación de la fase, contra el dev local con la 068 aplicada:

1. `/servicios` → crear un servicio sin tocar el cupo: queda **Individual** y guarda sin error.
2. Editarlo a **Clase grupal**: el cupo aparece en 2 y guarda. Subirlo a 10: persiste.
3. Reservar ese grupal desde `/[slug]`: el mismo horario acepta más de una reserva y desaparece de la grilla recién al llenarse.
4. Con un turno futuro vivo, volverlo a **Individual**: el panel muestra **copy propia**, no el texto crudo del error.
5. Cancelar el turno y repetir: ahora guarda.

## Estado de producción

⛔ **La 068 sigue SIN aplicar en producción.** Última migración aplicada en prod = **067** (2026-08-11). Este plan dejó el archivo (15-01) y el procedimiento (`15-RUNBOOK-068.md`); **aplicarla es decisión del dueño**. Todo lo que se corrió acá fue contra el Postgres **local** (`supabase_db_forjo-app`, PG17).

## Self-Check: PASSED

- `test/capacity-mode-change-gate.test.ts` — FOUND
- `test/concurrency.test.ts` — FOUND (24 casos)
- `.planning/.../15-RUNBOOK-068.md` — FOUND
- Commits `49a0ff4`, `8b6d0f0`, `9e163aa` — FOUND en `git log`
