---
phase: 15-modelo-de-cupo-unificado
plan: 03
subsystem: database
tags: [postgres, supabase, migration, plpgsql, rpc, concurrency, vitest, integration-tests, multi-tenant]

# Dependency graph
requires:
  - phase: 15-modelo-de-cupo-unificado
    plan: 01
    provides: "migr. 068 aplicada en LOCAL — enum de tres modos, CHECK de coherencia modo↔cupo, DEFAULT 'individual' y el gate services_block_mode_change"
  - phase: 15-modelo-de-cupo-unificado
    plan: 02
    provides: "seedGroupClassService + las dos suites verdes contra el CHECK de coherencia (20/20 y 7/7)"
  - phase: 12-cupo-por-solape-recurso-simult-neo
    provides: "migr. 064 — el cuerpo VIGENTE de book_slot_atomic (lock de negocio-día + gate espejo) del que arranca esta redefinición"
provides:
  - "book_slot_atomic decide el cupo leyendo services.capacity en los TRES modos (CUPO-07)"
  - "La rama no simultánea ya NO consulta time_blocks: v_capacity := v_svc_cap"
  - "Fail-safe del modo a 'individual' — estrictamente más fail-closed que el histórico 'group_class'"
  - "El comentario del gate espejo con la justificación que sobrevive al cambio de fuente del cupo (D-07)"
  - "CUPO-07 (a)/(b): el control negativo A/B del cambio de régimen, visto FALLAR contra la función de la 064"
affects: [15-04, 15-05, phase-16, book_slot_atomic, booking-core, availability, agenda-client]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Redefinición de book_slot_atomic con inventario explícito de lo que queda byte-idéntico (molde 064)"
    - "Control negativo de un cambio del RPC por RPC DIRECTO, para saltear un re-check JS que todavía no migró"

key-files:
  created: []
  modified:
    - supabase/migrations/068_service_capacity_unified_and_mode_gate.sql
    - supabase/schema.sql
    - test/concurrency.test.ts

key-decisions:
  - "Los bloques de agenda con cupo N NO se pudieron bajar a 1 en esta ola: booking-core sigue leyendo time_blocks.capacity (migra en 15-04) y cortaría con slot_taken antes de llegar al RPC. Probado, no supuesto: 2 casos fallaron"
  - "El control negativo de CUPO-07 se prueba IGUAL en esta ola, por RPC directo (dos casos nuevos), y se lo vio fallar contra la función de la 064 con los códigos exactos que el comentario predice"
  - "El gate espejo NO se re-escopea (D-07): se reescribe solo su justificación, que quedaba apoyada en una premisa muerta"
  - "La rama no simultánea NO se parte en tres: individual y group_class comparten eje de conteo y asiento, y ahora también la fuente del número"

patterns-established:
  - "Cuando una migración del RPC deja temporalmente en desacuerdo a un lector JS que migra después, el test conserva el valor viejo del lado JS y el control negativo se prueba por el camino que no pasa por ese lector"
  - "Un cambio en book_slot_atomic se valida instalando la función VIEJA en local, viendo fallar los casos nuevos con el código exacto esperado, y reinstalando la nueva"

requirements-completed: [CUPO-07]

# Metrics
duration: 20min
completed: 2026-08-12
status: complete
---

# Phase 15 Plan 03: El cupo sale del servicio, dentro del motor — Summary

**`book_slot_atomic` deja de consultar `time_blocks.capacity` y decide el cupo con `services.capacity` en los tres modos, con la firma byte-idéntica, sin `DROP`, sin tocar el eje de serialización, y con el cambio de régimen frente al EXCLUDE gist 013 probado por A/B contra la función de la 064 — no razonado en un comentario.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-08-12
- **Tasks:** 3
- **Files modified:** 3 (0 creados, 3 modificados)

## Accomplishments

- **La fuente del número se movió DENTRO del motor** (CUPO-07). La consulta `COALESCE(MAX(tb.capacity), 1)` sobre el bloque de agenda se borró entera; en su lugar queda `v_capacity := v_svc_cap`, o sea el cupo que el servicio **declaró** en el paso 0, antes del lock.
- **El cambio de régimen quedó PROBADO, no argumentado.** Se instaló la función de la 064 en el Postgres local y se vio a los dos casos nuevos fallar con los códigos exactos que sus comentarios predicen (`23505` en uno, `is_group = true` en el otro), y después pasar con la 068. Es el estándar de la fase: contra Postgres de verdad, con control negativo.
- **Cero regresión de los cuatro consumidores del RPC**, medida: 54/54 en las siete suites que los cubren (booking público, alta manual, abonos, canchas, multi-staff y "cualquiera").
- **El comentario del gate espejo dejó de mentir** (D-07) sin que su predicado se moviera un carácter. La razón vieja moría con esta migración; la nueva es el mismo caso legal, ahora declarado.
- **El conteo de casos SUBIÓ**, no bajó: `concurrency.test.ts` pasa de **20** a **22**.

## Task Commits

Cada task se commiteó de forma atómica:

1. **Task 1: el RPC lee `services.capacity` en los tres modos (068, sección 7)** — `7101916` (feat)
2. **Task 2: espejo quirúrgico en `schema.sql` + el comentario D-07** — `d6de062` (feat)
3. **Task 3: `concurrency.test.ts` declara el cupo en el servicio + control negativo** — `8b12503` (test)

## Files Created/Modified

- `supabase/migrations/068_service_capacity_unified_and_mode_gate.sql` (+467) — sección **7** nueva, insertada **antes** del `NOTIFY pgrst` que ya cerraba el archivo (no se duplicó). Contiene el header con el inventario de lo byte-idéntico + los cuatro cambios + el razonamiento del cambio de régimen, la función completa y el cierre de tres líneas (`ALTER FUNCTION ... OWNER`, `GRANT EXECUTE`, y el `NOTIFY` preexistente).
- `supabase/schema.sql` (+31 / −21) — espejo quirúrgico del cuerpo nuevo, con los comentarios comprimidos al estilo del archivo. Los 8 hunks caen **todos** dentro de la función (líneas 218-475): ni la tabla `services`, ni el gate de cambio de modo, ni el bloque de triggers (ya espejados en 15-01).
- `test/concurrency.test.ts` (+135 / −24) — los seis casos del inventario declaran el cupo en el servicio; dos casos **nuevos** (`CUPO-07 (a)` y `(b)`) con el control negativo; `no-drift (b)` reencuadrado y renombrado; el caso del `23P01` renombrado al modo individual.

## El cambio de régimen de `is_group`, razonado por escrito

Es lo que el plan pedía dejar asentado, y lo que hace que este no sea "mover de dónde se lee un número".

`is_group` hace **doble trabajo**: significa a la vez *"cupo > 1, varias filas comparten el slot"* **y** *"exenta del EXCLUDE gist 013"* (`041`: `... AND NOT is_group`). Esa ambigüedad es la causa raíz que la **064** tuvo que resolver con el lock de negocio-día, después de que la **063** no alcanzara. Por eso el cambio se razona **contra el EXCLUDE**, no contra el conteo:

| | Antes de la 068 | Después de la 068 |
|---|---|---|
| Fuente del número | `MAX(time_blocks.capacity)` — del **bloque** (business + day_of_week + ventana) | `services.capacity` — del **servicio** |
| En un negocio con un bloque de cupo 3 | **TODAS** las filas, de cualquier servicio, nacen `is_group = true` y quedan **fuera** del gist 013 | Solo quedan fuera las de un servicio que **declaró** cupo >= 2 |
| Un servicio individual | hereda el cupo del bloque; puede nacer `is_group = true` sin haberlo pedido | cupo 1 ⇒ `v_seat := 0` fijo ⇒ 23505 en el slot exacto, e `is_group = false` ⇒ **vuelve a entrar** al EXCLUDE 013, que es el que rechaza el solape de **duración variable** |

Las dos direcciones son obligatorias y las dos están cubiertas:

- **Cupo >= 2 DEBE nacer `is_group = true`.** Si naciera `false`, el 2º turno solapado del mismo bucket chocaría con el gist (`23P01`) y el cupo **nunca se llenaría**. Lo prueba `CUPO-07 (a)`: las tres filas entran y las tres tienen `is_group = true`.
- **Cupo 1 DEBE volver al gist.** Un `EXCLUDE` no puede expresar "hasta N", así que las filas de cupo >= 2 salen a propósito y su anti-solape lo impone la función bajo el lock; pero las de cupo 1 tienen que quedar cubiertas por el gist o se pierde el anti-doble-booking de duración variable de v0.9. Lo prueba `CUPO-07 (b)`: con la 064 la 2ª reserva **entraba** (el bloque decía 3 ⇒ `is_group = true` ⇒ invisible para el gist); con la 068 muere con `23P01`.

**Por qué el cutover es neutro en producción:** el pre-flight de la 068 **aborta** si `max(capacity) from time_blocks > 1`. Medido contra prod el 2026-08-11: **19 bloques, cupo máximo 1** ⇒ el 100 % de los datos reales cae del lado en que el cambio es byte-idéntico (D-02).

## Verificación — output literal

### Task 1 — criterios de aceptación

```
$ F=supabase/migrations/068_service_capacity_unified_and_mode_gate.sql
1. grep -cE '^[[:space:]]*FROM[[:space:]]+time_blocks' $F   → 0   (esperado 0)  ✓
2. grep -cF 'v_capacity := v_svc_cap' $F                    → 1   (esperado 1)  ✓
3. grep -cF 'v_is_group := (v_capacity > 1)' $F             → 1   (esperado 1)  ✓
4. grep -cF 'v_is_group := (v_svc_cap > 1)' $F              → 1   (esperado 1)  ✓  (rama simultánea intacta)
5. grep -cE '^[[:space:]]*NOTIFY pgrst' $F                  → 1   (esperado 1)  ✓  (no se duplicó)
6. grep -c 'DROP FUNCTION' $F                               → 0   (esperado 0)  ✓
7. grep -c 'GRANT EXECUTE ON FUNCTION' $F                   → 1   (esperado 1)  ✓

$ diff <(grep -A 15 'CREATE OR REPLACE FUNCTION "public"."book_slot_atomic"' 064_*.sql | head -16) \
       <(grep -A 15 'CREATE OR REPLACE FUNCTION "public"."book_slot_atomic"' 068_*.sql | head -16)
FIRMA_IDENTICA_OK                                                 # sin diferencias ✓
```

Aplicación al Postgres **local** (archivo completo, una sola transacción):

```
$ docker exec -i supabase_db_forjo-app psql -v ON_ERROR_STOP=1 --single-transaction \
    -U postgres -d postgres < supabase/migrations/068_service_capacity_unified_and_mode_gate.sql
ALTER TABLE / UPDATE 0 / DO / DO / ALTER TABLE / CREATE FUNCTION / ALTER FUNCTION /
DROP TRIGGER / CREATE TRIGGER / CREATE FUNCTION / ALTER FUNCTION / GRANT / NOTIFY
PSQL_EXIT=0                       # UPDATE 0 = el backfill de 15-01 sigue siendo re-corrible
```

Estado **instalado**, leído de `pg_proc` (no del archivo):

```
select regexp_count(prosrc,'FROM time_blocks'), regexp_count(prosrc,'v_capacity := v_svc_cap')
  → 0 | 1                         # cero consultas al bloque; el cupo sale del servicio ✓

select pg_get_function_identity_arguments(oid) …
  → p_business_id uuid, p_professional_id uuid, p_service_id uuid, p_location_id uuid, p_date date,
    p_time time without time zone, p_duration integer, p_client_id uuid, p_client_name text,
    p_client_phone text, p_client_email text, p_notes text, p_status text,
    p_expires_at timestamp with time zone           # los 14 params ✓
select pg_get_function_result(oid) → TABLE(id uuid, cancel_token uuid)   # el RETURNS ✓
```

> La única mención de `time_blocks` que queda dentro de la función es **prosa**: el comentario del gate espejo que explica cuál era la premisa vieja y por qué murió. Cero consultas (`regexp_count(prosrc,'FROM time_blocks') = 0`).

### Task 2 — criterios de aceptación

```
$ S=supabase/schema.sql
1. grep -cE '^[[:space:]]*FROM[[:space:]]+time_blocks' $S  → 0   (HEAD tenía 1)  ✓
2. grep -cF 'v_capacity := v_svc_cap' $S                   → 1   (esperado 1)    ✓
3. grep -cF 'v_is_group := (v_capacity > 1)' $S            → 1   (esperado 1)    ✓
4. grep -c 'book_slot_atomic' $S      → 5  vs  HEAD → 5    (no se duplicó)       ✓
5. grep -cE '^[[:space:]]*NOTIFY pgrst' $S                 → 0   (no se espeja)  ✓

$ git diff -U0 $S | grep '^@@'
@@ -218 +218,2 @@   @@ -220 +221,2 @@   @@ -239 +241 @@   @@ -241 +243,3 @@
@@ -247 +251 @@   @@ -430 +434,8 @@   @@ -434,7 +445,9 @@   @@ -462,8 +475,5 @@
                                       # los 8 hunks caen dentro de la función (218-475):
                                       # ni `services`, ni el gate de modo, ni los triggers ✓
```

### Task 3 — el A/B, que es lo que vuelve discriminantes a los casos nuevos

Se instaló la función **VIEJA** (la de la 064, que leía el bloque) en el Postgres local y se corrieron **solo** los dos casos nuevos:

```
$ docker exec … psql < supabase/migrations/064_agenda_day_lock_and_mirror_gate.sql
$ select regexp_count(prosrc,'FROM time_blocks') …  → 1     # confirmado: la función vieja está puesta

$ ./node_modules/.bin/vitest run test/concurrency.test.ts --no-file-parallelism -t "CUPO-07"
  × CUPO-07 (a) — el cupo lo pone el SERVICIO aunque el bloque de agenda diga 1
      AssertionError: expected { code: '23505', … } to be null
      → línea 271: expect(error).toBeNull()
  × CUPO-07 (b) — control negativo: un bloque de cupo 3 ya NO vuelve grupal a un servicio individual
      AssertionError: expected true to be false
      → línea 296: expect(row?.is_group).toBe(false)
  Tests  2 failed | 20 skipped (22)
```

**Los dos fallan exactamente por donde su comentario dice que tienen que fallar:** (a) con `23505`, porque con el cupo del bloque en 1 la 2ª fila repetía el asiento 0; (b) con `is_group = true`, porque el bloque de cupo 3 volvía grupal a un servicio individual y lo sacaba del EXCLUDE 013. Es el cambio de régimen, medido.

Reinstalada la 068, la suite entera:

```
$ ./node_modules/.bin/vitest run test/concurrency.test.ts --no-file-parallelism
 Test Files  1 passed (1)
      Tests  22 passed (22)          VITEST_EXIT=0
```

**El conteo NO bajó: subió de 20 a 22.** Baseline de 15-02 = 20/20; acá 22/22 (ningún caso borrado, dos agregados).

### Cero regresión de los cuatro consumidores del RPC

```
$ ./node_modules/.bin/vitest run test/booking-core.test.ts test/manual-booking.test.ts \
    test/canchas-booking.test.ts test/abono-generation.test.ts test/abono-create.test.ts \
    test/staff-assignment.test.ts test/booking-cualquiera-public.test.ts \
    --no-file-parallelism --testTimeout=30000
 Test Files  7 passed (7)
      Tests  54 passed (54)          VITEST_EXIT=0
```

### Criterios de Task 3 y gates de compilación

```
$ grep -c 'seedGroupClassService' test/concurrency.test.ts        → 9   (esperado >= 7)  ✓
$ grep -cE '^\s*(it|test)(\.[a-z]+)?\(' test/concurrency.test.ts  → 22  (era 20)         ✓
$ grep -cE 'seedTimeBlock\(t, \{ capacity: [2-9]' …               → 6   (esperado 1)     ⚠ ver Deviations

$ ./node_modules/.bin/tsc --noEmit ; echo "TSC_EXIT=$?"
TSC_EXIT=0                                  # compilador REAL, nunca npx tsc

$ npm run build
BUILD_EXIT=0

$ git diff --stat cc41b55..HEAD
 supabase/migrations/068_…sql | 467 +++++
 supabase/schema.sql          |  52 ++-
 test/concurrency.test.ts     | 135 +++-
 3 files changed                             # exactamente 3 archivos, NINGUNO de app/ ni lib/ ✓
```

## Decisions Made

- **La rama no simultánea se mantiene en DOS ramas, no se parte en tres.** `individual` y `group_class` comparten el **mismo eje de conteo** (hora de inicio exacta) y el mismo tratamiento del asiento; lo único que los distinguía era el número, y ahora sale del mismo lugar para los dos. Un `CASE` de tres ramas duplicaría código idéntico y agrandaría el diff sobre la función que la Phase 12 necesitó **dos rondas de review y cinco blockers** para dejar bien.
- **`v_capacity` se conserva como variable** en vez de usar `v_svc_cap` en línea. Deja **byte-idénticas** las dos líneas que la consumen (el gate de asiento y la derivación de `is_group`): un diff mínimo sobre esta función es una decisión de **riesgo**, no de estilo.
- **El fail-safe del modo pasa a `individual` y es estrictamente más fail-closed.** Antes, un `p_service_id` que no resolviera —por ejemplo el de otro tenant— caía a la rama grupal, donde el cupo lo ponía el bloque de agenda y **podía heredar un cupo > 1 que ese servicio nunca declaró**. Ahora cae a cupo 1: seat fijo en 0, `is_group = false`, la fila adentro del EXCLUDE. El filtro `AND s.business_id = p_business_id` del paso 0 no se tocó.
- **El `v_svc_cap > 1` del rechazo `simultaneous_space_conflict` se dejó igual** aunque el CHECK de coherencia de 15-01 ya vuelva imposible un simultáneo de cupo 1. Queda escrito en el SQL: un gate no debería depender de un constraint para ser correcto.
- **Los comentarios del `DECLARE` se corrigieron** aunque el plan pedía "todo lo demás byte-idéntico". Decían que `capacity_mode` es de dos valores y que `services.capacity` "lo lee SOLO la rama simultánea" — las dos cosas dejaron de ser ciertas con este cambio. Es el mismo criterio de D-07: un comentario que miente es peor que ninguno.
- **El control negativo de CUPO-07 se probó por RPC directo.** Es el único camino que en esta ola llega al RPC con el bloque y el servicio **discrepando** (ver Deviations).

## Deviations from Plan

### 1. [Rule 3 — Blocking] Los bloques de agenda con cupo N NO se pudieron bajar a 1: `booking-core` todavía lee `time_blocks.capacity`

- **Encontrado en:** Task 3.
- **Qué pedía el plan:** que los seis casos del inventario dejaran el `seedTimeBlock` en su cupo por defecto (1) y declararan el cupo en el servicio, con el criterio `grep -cE "seedTimeBlock\(t, \{ capacity: [2-9]" == 1`.
- **Qué pasa en realidad (medido, no supuesto):** `lib/booking-core.ts:191-199` sigue calculando `slotCapacity` con un `MAX` sobre `time_blocks`, y `:270` sigue haciendo `rejectEarly = isSimultaneousResource ? takenByOtherService : (taken && slotCapacity <= 1)`. Con el bloque en 1 y el servicio en N, la **2ª alta secuencial de un servicio grupal muere con un `slot_taken` del JS sin llegar nunca al RPC**. Esa lectura la migra el plan **15-04**, que este plan tiene prohibido tocar.
- **Evidencia:** aplicada la 068 y migrados los casos tal como el plan los describe, la corrida dio **2 failed | 18 passed**: `CONC-01` (`expected +0 to be 1` — las dos altas paralelas rebotaron en el JS) y `CUPOS-03` (`expected false to be true` — la 2ª secuencial). No es una hipótesis: es la corrida.
- **Qué se hizo en su lugar:** los casos que entran por `createAppointmentCore` conservan el bloque en N **y además** declaran el cupo en el servicio, con un comentario que dice por qué el número del bloque quedó ahí (alimenta **solo** al re-check JS) y que 15-04 lo baja. Quedaron **6** ocurrencias en vez de 1: `CONC-01`, `CUPOS-03`, `CUPOS-02` (que el plan ya excluía), `CR2-01 (eje inverso)`, `no-drift (b)` y `CR-03 (a)`.
- **Y el control negativo NO se perdió, se probó por otro camino:** dos casos **nuevos** (`CUPO-07 (a)` y `(b)`) entran por **RPC directo** —que no pasa por el re-check JS— con el bloque y el servicio **discrepando**, y se los vio **fallar** contra la función de la 064 con los códigos exactos que predicen. Es el estándar de la fase (contra Postgres real, con A/B), aplicado por el único camino disponible en esta ola.
- **Caso especial, `CR2-01 (eje inverso)`:** acá el bloque en N no es un parche sino un requisito del caso. El brief lo advierte: con el bloque en 1 el paso 2 seguiría pasando —el error es `slot_taken` en los dos casos— pero **por el re-check JS en vez de por el gate espejo del SQL**, que es justo lo que hay que evitar. Se necesitan las dos cosas (bloque en 3 **y** `otroServicio` grupal cupo 3) porque hoy los dos lectores miran fuentes distintas.
- **Caso especial, `CR-03 (a)`:** además de lo anterior, el bloque en 3 evita que una carrera perdida por milisegundos vea una fila ya commiteada y se coma un `slot_taken` espurio del JS, que volvería **flaky** al guard de serialización de `v_seat`.
- **Lo que hereda 15-04:** bajar esas cinco ocurrencias a 1 (la sexta, la ventana grupal de `CUPOS-02`, ya estaba asignada a 15-04 por el propio plan) en la **misma unidad** en que `booking-core` y `availability` pasen a leer `services.capacity`. Es exactamente lo que D-08 declara: *"separarlos es literalmente cómo se produce el drift"*.

### 2. [Rule 3 — Blocking] La validación se hizo aplicando la 068 al Postgres local, no con `supabase db reset`

- **Encontrado en:** Task 1 (mismo bloqueo operativo que 15-01 ya registró).
- **Situación:** el `<verify>` del Task 1 era `supabase db reset`, que **destruye los datos de prueba del Supabase local** y está prohibido sin aviso previo por la instrucción operativa de esta ejecución.
- **Qué se hizo en su lugar:** se aplicó el archivo completo con `docker exec -i supabase_db_forjo-app psql -v ON_ERROR_STOP=1 --single-transaction` (exit 0) y se verificó el resultado **contra `pg_proc`**, no contra el archivo: cero consultas a `time_blocks`, la asignación desde el servicio presente, y la firma instalada (14 params + `RETURNS TABLE`). Después se corrió el A/B completo contra esa base.
- **Lo que NO cubre:** que el replay del baseline + 040..068 **en orden desde cero** termine limpio. Sigue pendiente y **requiere el OK del dueño**.

### 3. [Scope boundary] Un caso de `abono-create.test.ts` cae por timeout de entorno, no por regresión

- **Encontrado en:** verificación de cero regresión.
- **Situación:** `abono-create.test.ts > 7 — indefinido: sin totalOccurrences…` falló con `Test timed out in 5000ms`. Es el caso que corre **seis** altas de abono completas en un solo `it`.
- **Diagnóstico (probado):** con `--testTimeout=30000` el archivo da **13/13** y la corrida de las siete suites da **54/54**. No es una aserción rota: es la trampa de entorno ya documentada en el CONTEXT de la fase (el Supabase local tarda ~2.16 s al root con tres stacks levantados). Además, este plan **quita** una consulta del RPC, no agrega trabajo.
- **Qué se hizo:** nada sobre el test (SCOPE BOUNDARY). Se declara el flag usado en la corrida.

---

**Total deviations:** 3 (dos bloqueos de secuencia/operativos, uno de límite de alcance). **Ninguna de código entregado de más.**
**Impact on plan:** el objetivo del plan (CUPO-07) se cumple entero. Lo que se movió es **dónde** se prueba el control negativo, porque el otro lector del cupo todavía no migró.

## Issues Encountered

- **La corrida contra la 068 con los tests SIN tocar dio 5 fallos** (`CONC-01`, `CUPOS-03`, `CUPOS-02`, `no-drift (b)`, `CR-03 (a)`) — exactamente los cinco casos que declaraban el cupo en el bloque. Se corrió a propósito **antes** de tocar los tests: es la prueba de que el cambio del RPC realmente movió la fuente del número, y no un efecto de haber reescrito los tests para que pasen.
- **El criterio de aceptación `grep -c "DROP FUNCTION" == 0` no distinguía sentencia de comentario.** El header decía "SIN `DROP FUNCTION`" (igual que el de la 064) y hacía dar 1. Se reescribió esa línea a "SIN dropear la función": el criterio queda inequívoco y el significado intacto.
- **En `CUPO-07 (b)` el 2º intento va a las 14:40, no a las 14:30.** En la hora **exacta** se violarían a la vez el índice único 011 y el EXCLUDE 013, y cuál de los dos reporta primero no está garantizado. Con un solape que no comparte hora exacta el 011 no aplica, así que el `23P01` prueba **inequívocamente** que la fila volvió a estar dentro del gist — que es justo lo que el caso viene a probar.

## Known Stubs

Ninguno.

## Threat Flags

Ninguna superficie nueva fuera del `<threat_model>` del plan. No hay endpoints, ni policies, ni columnas nuevas: la migración **redefine una función existente** con la firma intacta. Cero dependencias npm nuevas (T-15-SC). El filtro por tenant del `SECURITY DEFINER` (`AND s.business_id = p_business_id`) no se tocó, y el fail-safe del modo quedó **más** restrictivo que antes (T-15-16).

## User Setup Required

**La 068 SIGUE SIN APLICARSE A PRODUCCIÓN.** Última migración en prod = **067**. El runbook completo está en `15-01-SUMMARY.md` §User Setup Required y en el plan 15-05. Este plan **agrega una condición nueva al pre-flight** que ya estaba escrita en el header de la 068 y que ahora es literalmente el criterio de corte:

> `select count(*), count(*) filter (where capacity is null), max(capacity) from time_blocks;`
> **ABORTAR si `max(capacity) > 1`.** Desde esta sección el RPC ya no lee esa columna: en un negocio cuyo cupo grupal viva en el bloque, el cutover **le bajaría el cupo a 1 de hecho**. Medido el 2026-08-11: 19 bloques, máximo 1 ⇒ ningún negocio afectado.

Y el orden de deploy no cambió: la 068 se aplica **a mano**, entera, en una sola transacción, coordinada con el deploy del código (el guard del editor de 15-02 ya está en el árbol).

## Next Phase Readiness

**Listo para 15-04** (las otras tres lecturas del cupo, D-08):

- El RPC ya es la referencia: `lib/booking-core.ts:186-199` y `app/api/booking/availability/route.ts:72-83` (+ sus tres consumidores `:218`, `:415`, `:432`) tienen que quedar consistentes con **`services.capacity`**, no con el bloque.
- **15-04 hereda una tarea concreta de este plan:** bajar a 1 los cinco `seedTimeBlock(t, { capacity: N })` que quedaron en `concurrency.test.ts` (`:162` CONC-01, `:289` CUPOS-03, `:779` CR2-01 inverso, `:874` no-drift (b), `:906` CR-03 (a)) **más** la ventana grupal de `CUPOS-02` (`:327`), en la **misma unidad** en que `booking-core` deje de leer el bloque. Cada uno tiene el comentario que dice por qué sigue ahí. Cuando eso pase, `CUPO-07 (a)`/`(b)` dejan de ser los únicos con control negativo y el `grep` del plan (`== 1`, y después `== 0`) recién ahí es alcanzable.
- El drift que D-08 advierte es **hoy visible y acotado**: el read-path publica disponibilidad con el cupo del bloque mientras el write-path decide con el del servicio. En producción los dos dan 1 (D-02), así que no hay impacto real, pero el árbol **no debería quedar en este estado más allá de 15-04**.

**Lo que este plan deliberadamente NO hizo:**

- **Re-escopear el gate espejo** (D-07). Se reescribió su justificación; ampliar el predicado sería **cambiar comportamiento** y queda anotado como revisión propia.
- **Tocar el eje de serialización.** El lock de negocio-día, los locks por espacio y su orden global quedaron byte-idénticos: esta migración no reabre CR2-01.
- **Dropear `time_blocks.capacity`.** La columna se conserva (diferido del milestone) y `agenda-client.tsx:465-474` la sigue leyendo hasta la Phase 16.

## Self-Check: PASSED

Archivos declarados, verificados en disco:

```
FOUND: supabase/migrations/068_service_capacity_unified_and_mode_gate.sql
FOUND: supabase/schema.sql
FOUND: test/concurrency.test.ts
FOUND: .planning/workstreams/motor-reservas/phases/15-modelo-de-cupo-unificado/15-03-SUMMARY.md
```

Commits declarados, verificados en `git log`:

```
FOUND: 7101916   FOUND: d6de062   FOUND: 8b12503
```

---
*Phase: 15-modelo-de-cupo-unificado*
*Completed: 2026-08-12*
</content>
</invoke>
