---
phase: 15-modelo-de-cupo-unificado
plan: 01
subsystem: database
tags: [postgres, supabase, migration, check-constraint, trigger, plpgsql, multi-tenant, typescript]

# Dependency graph
requires:
  - phase: 12-cupo-por-solape-recurso-simult-neo
    provides: "services.capacity_mode / services.capacity (migr. 062) y el riesgo residual R-1 que este plan cierra"
  - phase: 14-cierre-de-backlog
    provides: "migr. 065 y 067 — el molde fail-closed de gate en la base (hora AR, rama de estado nulo, RETURN obligatorio)"
provides:
  - "migr. 068: enum de TRES modos de cupo con 'individual' como DEFAULT de la columna"
  - "CHECK de coherencia modo↔cupo: individual ⇒ 1, group_class / simultaneous_resource ⇒ >= 2"
  - "Backfill por predicado que deja los servicios group_class de cupo 1 en 'individual'"
  - "Gate services_block_mode_change: rechaza cambiar capacity_mode con turnos futuros vivos (P0001)"
  - "El invariante is_group ⟺ capacity_mode <> 'individual', que es lo que vuelve suficiente al gate"
  - "supabase/schema.sql espejado y lib/types.ts con la unión de tres literales"
affects: [15-02, 15-03, 15-04, 15-05, phase-16, book_slot_atomic, settings-client, booking-core, availability]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ALTER COLUMN ... SET DEFAULT en migración numerada (primer precedente del repo fuera del baseline)"
    - "Gate BEFORE UPDATE OF <columna> con guard de no-cambio IS NOT DISTINCT FROM (primer BEFORE UPDATE de gate del repo)"

key-files:
  created:
    - supabase/migrations/068_service_capacity_unified_and_mode_gate.sql
  modified:
    - supabase/schema.sql
    - lib/types.ts

key-decisions:
  - "El gate de CUPO-08 va como trigger BEFORE UPDATE OF capacity_mode sobre services, con guard de no-cambio primero — elegido después de trazar el write-path real (6 escrituras), no antes"
  - "El gate NO lleva guard de cascada: services_business_id_fkey es ON DELETE CASCADE, una cascada borra la fila y nunca llega a un BEFORE UPDATE"
  - "Código de dominio nuevo: service_mode_has_future_appointments (ningún código de la 065 es substring de éste ni al revés)"
  - "La 068 se validó aplicándola al Postgres LOCAL con psql --single-transaction en vez de supabase db reset, para no destruir los datos de prueba locales"

patterns-established:
  - "Backfill por predicado re-corrible antes del ADD CONSTRAINT (molde 055), con la 2ª pasada verificada en 0 filas"
  - "Pre-flight de migración escrito en el header con criterio de ABORTO y controles que devuelven números distintos de cero"

requirements-completed: [CUPO-06, CUPO-08]

# Metrics
duration: 47min
completed: 2026-08-12
status: complete
---

# Phase 15 Plan 01: Modelo de cupo unificado — Summary

**Migración 068: `services.capacity_mode` pasa a un enum de tres valores con `individual` como DEFAULT, `services.capacity` queda atado al modo por un CHECK de coherencia, y un trigger `BEFORE UPDATE OF capacity_mode` cierra el riesgo residual R-1 rechazando el cambio de modo con turnos futuros vivos.**

## Performance

- **Duration:** ~47 min
- **Started:** 2026-08-12T00:00:00Z (aprox.)
- **Completed:** 2026-08-12
- **Tasks:** 3
- **Files modified:** 3 (1 creado, 2 modificados)

## Accomplishments

- **El modo "individual" ahora se puede DECLARAR**, y es el DEFAULT de la columna. Dejó de deducirse de `time_blocks.capacity = 1`, una columna de otra tabla que no sabe a qué servicio corresponde — que es el defecto que abrió la fase (un corte de pelo etiquetado "Clase grupal").
- **Las dos representaciones del mismo estado se eliminaron en la base.** Un `group_class` o un `simultaneous_resource` con cupo 1 es imposible (23514), y un `individual` con cupo distinto de 1 también.
- **R-1 cerrado de raíz, no por parche.** El CHECK de coherencia produce `is_group ⟺ capacity_mode <> 'individual'`, así que gatear el cambio de MODO gatea todo el drift posible de `is_group`: un cambio de solo `capacity` (de 2 a 5) nunca lo puede voltear.
- **Los 10 servicios del Postgres local (9 en prod) quedaron `individual`/cupo 1** sin cambiar de comportamiento — cupo 1 en los dos casos ⇒ `is_group = false` en los dos.

## Task Commits

Cada task se commiteó de forma atómica:

1. **Task 1: la 068 — modelo (D-04, D-05, D-06) en el orden obligatorio** — `d37d45b` (feat)
2. **Task 2: gate de cambio de modo en la base (CUPO-08, cierra R-1)** — `5743be2` (feat)
3. **Task 3: espejo quirúrgico en schema.sql + el tipo del modo en TypeScript** — `df66f08` (feat)

## Files Created/Modified

- `supabase/migrations/068_service_capacity_unified_and_mode_gate.sql` (**nuevo**, 303 líneas) — DROP del CHECK de 2 valores → backfill → CHECK del enum de 3 → CHECK de coherencia → DEFAULT `'individual'` → gate de cambio de modo → `NOTIFY pgrst`.
- `supabase/schema.sql` — espejo quirúrgico: tabla `services` (DEFAULT, enum de 3, CHECK de coherencia inline), función `services_block_mode_change()` (comentarios comprimidos a lo esencial) y el trigger en el bloque alfabético. El `NOTIFY pgrst` **no** se espejó.
- `lib/types.ts` — `capacity_mode` pasa a la unión de tres literales (inline, sin alias exportado). Comentarios de `capacity_mode`, `capacity` e `is_group` **reescritos enteros**: el viejo afirmaba que el grupal lee `time_blocks.capacity` y que `capacity` lo lee solo el simultáneo, y las dos cosas dejaron de ser ciertas.

## Verificación — output literal

### Task 1

```
$ ls supabase/migrations/068_service_capacity_unified_and_mode_gate.sql
supabase/migrations/068_service_capacity_unified_and_mode_gate.sql

$ grep -c 'services_capacity_matches_mode_chk' supabase/migrations/068_*.sql
2                                    # >= 2 ✓ (guard conname + ADD CONSTRAINT)

$ grep -n 'UPDATE "public"."services"' supabase/migrations/068_*.sql
126:UPDATE "public"."services"
$ grep -n 'services_capacity_matches_mode_chk' supabase/migrations/068_*.sql
173:     WHERE "conname" = 'services_capacity_matches_mode_chk'
177:      ADD CONSTRAINT "services_capacity_matches_mode_chk"
                                     # 126 < 173 ⇒ el backfill precede al CHECK (D-05) ✓

$ grep -cE 'NOT VALID|VALIDATE CONSTRAINT' supabase/migrations/068_*.sql
0                                    # ✓ no se introduce el patrón sin precedente

$ grep -cE '^[[:space:]]*NOTIFY pgrst' supabase/migrations/068_*.sql
1                                    # ✓
```

Aplicación al Postgres **local** (1ª pasada):

```
$ docker exec -i supabase_db_forjo-app psql -v ON_ERROR_STOP=1 --single-transaction \
    -U postgres -d postgres < supabase/migrations/068_service_capacity_unified_and_mode_gate.sql
ALTER TABLE / UPDATE 10 / DO / DO / ALTER TABLE / NOTIFY
EXIT=0
```

2ª pasada (re-corribilidad):

```
ALTER TABLE / UPDATE 0 / DO / DO / ALTER TABLE / CREATE FUNCTION / ALTER FUNCTION /
DROP TRIGGER / CREATE TRIGGER / NOTIFY
EXIT_2NDPASS=0                       # UPDATE 0 ⇒ el backfill es re-corrible ✓
```

Estado resultante:

```
 capacity_mode | capacity | count
---------------+----------+-------
 individual    |        1 |    10

              conname               |                        pg_get_constraintdef
------------------------------------+---------------------------------------------------------------
 services_capacity_matches_mode_chk | CHECK ((((capacity_mode = 'individual') AND (capacity = 1)) OR
                                    |   ((capacity_mode = ANY (ARRAY['group_class','simultaneous_resource'])) AND (capacity >= 2))))
 services_capacity_mode_chk         | CHECK ((capacity_mode = ANY (ARRAY['individual','group_class','simultaneous_resource'])))
 services_capacity_positive         | CHECK ((capacity >= 1))

 column_default   →  'individual'::text
```

Rechazos del CHECK, cada uno con una fila real forzada en la misma transacción (trampa registrada:
un UPDATE que no matchea sale "Success" y no prueba nada — por eso se imprime `filas_a_tocar = 1`
antes de cada caso):

```
group_class + cupo 1            → ERROR: violates check constraint "services_capacity_matches_mode_chk"
individual + cupo 2             → ERROR: violates check constraint "services_capacity_matches_mode_chk"
simultaneous_resource + cupo 1  → ERROR: violates check constraint "services_capacity_matches_mode_chk"
'banda_de_musica' (valor fuera del enum) → ERROR: violates check constraint
group_class + cupo 2            → UPDATE 1 ; capacity_mode=group_class capacity=2   (PASA ✓)
```

### Task 2

```
$ grep -c 'services_block_mode_change'            → 5   # >= 4 ✓
$ grep -c 'service_mode_has_future_appointments'  → 1   # >= 1 ✓
$ grep -c 'IS NOT DISTINCT FROM'                  → 1   # == 1 ✓
$ grep -cF 'RETURN NEW;'                          → 2   # >= 2 ✓
$ grep -cF 'a."status" IS NULL'                   → 1   # == 1 ✓
$ grep -cE 'BEFORE UPDATE OF "capacity_mode"'     → 1   # == 1 ✓
$ grep -cE '^[[:space:]]*NOTIFY pgrst'            → 1   # ✓
```

Comportamiento del gate contra el Postgres local (todo en transacciones con `ROLLBACK`; el estado
final quedó intacto en `individual`/1 × 10):

```
GATE      turno futuro vivo (confirmed) + cambio de modo
          → ERROR: service_mode_has_future_appointments
            CONTEXT: PL/pgSQL function services_block_mode_change() line 50 at RAISE   ✓ (P0001)

CONTROL A turno futuro vivo + UPDATE name/active (NO toca capacity_mode)
          → UPDATE 1 ; name='Corte renombrado' active=f                                ✓ pasa

CONTROL B turno futuro vivo + UPDATE que MANDA capacity_mode con el MISMO valor
          (lo que hace saveEditService en cada guardado)
          → UPDATE 1 ; capacity_mode=individual name='Corte editado'                   ✓ pasa

CONTROL C servicio SIN turnos futuros vivos + cambio de modo a simultaneous_resource/3
          → UPDATE 1 ; capacity_mode=simultaneous_resource capacity=3                  ✓ pasa
CONTROL C2 mismo servicio + turno futuro CANCELADO + cambio a group_class/2
          → UPDATE 1 ; capacity_mode=group_class capacity=2                            ✓ pasa
CONTROL C3 mismo servicio + turno futuro con status NULL + cambio de modo
          → ERROR: service_mode_has_future_appointments                                ✓ TRABA
            (la rama de estado nulo funciona: sin ella el gate se abriría)
```

### Task 3

```
$ ./node_modules/.bin/tsc --noEmit ; echo "TSC_EXIT=$?"
TSC_EXIT=0                                          # con el compilador real, nunca npx tsc

$ npm run build ; echo "BUILD_EXIT=..."
BUILD_EXIT=0

$ grep -cF "'individual' | 'group_class' | 'simultaneous_resource'" lib/types.ts   → 1  ✓
$ grep -cF "'group_class' | 'simultaneous_resource'" lib/types.ts                  → 1  ✓
$ grep -c 'services_block_mode_change' supabase/schema.sql                         → 3  ✓ (>= 3)
$ grep -c 'services_capacity_matches_mode_chk' supabase/schema.sql                 → 1  ✓
$ grep -cE '^[[:space:]]*NOTIFY pgrst' supabase/schema.sql                         → 0  ✓
$ grep -c "'individual'::\"text\"" supabase/schema.sql                             → 3  ✓ (>= 2)
```

Alcance del diff (verificación #4 del plan): exactamente los tres archivos declarados. Ningún archivo
de `app/`, `lib/booking-core.ts` ni `test/`.

## Decisions Made

- **Forma del gate: trigger `BEFORE UPDATE OF "capacity_mode"` con guard de no-cambio primero.** Era discreción del planificador y quedó cerrada. Se eligió **después** de trazar el write-path real de `services` (auditoría re-verificada en esta ejecución, ver más abajo), que es lo que el review de la 067 exigió antes de aceptar un `BEFORE UPDATE`.
- **Sin guard de cascada, a propósito.** `services_business_id_fkey` es `ON DELETE CASCADE`: cerrar la cuenta de un negocio **borra** la fila de `services`, nunca la actualiza, así que una cascada jamás llega a un `BEFORE UPDATE`. Queda escrito en el SQL para que nadie agregue código muerto "por simetría" con la 065 y la 067.
- **Código de dominio `service_mode_has_future_appointments`**, fijo, nuevo y sin datos del negocio (el texto viaja al navegador — T-14-14 / T-13-09). Convivencia verificada: ninguno de los dos códigos de la 065 (`service_has_future_appointments`, `service_has_active_abono`) es substring de éste ni al revés, así que el `message.includes(...)` del panel no los puede confundir.
- **El CHECK de coherencia se escribió como disyunción de dos ramas** (individual / los otros dos), sin rama para NULL: las dos columnas son `NOT NULL`. Queda dicho en el comentario para que nadie la sume después.

### Auditoría del write-path (re-verificada, no heredada)

El plan pedía parar y reportar si aparecía un write-path no listado. Se re-corrió la búsqueda sobre
todo el repo (`app/`, `lib/`, `scripts/`, `test/`): hay **6** escrituras `UPDATE` sobre `services` y
**12** archivos TS que mencionan `capacity_mode`. Ninguna escritura fuera de las listadas por el plan:

| Escritura | Manda `capacity_mode` | Efecto sobre el gate |
|---|---|---|
| `settings-client.tsx:703` `saveEditService` | **sí, siempre** (payload fijo) | dispara; el guard de no-cambio lo deja pasar (CONTROL B) |
| `settings-client.tsx:656` `toggleService` | no | el trigger ni dispara |
| `settings-client.tsx:665` `setServiceLocations` | no | el trigger ni dispara |
| `lib/canchas.ts:204` (baja de cancha) | no | el trigger ni dispara |
| `lib/canchas.ts:283` `updateCancha` | no | el trigger ni dispara |
| `lib/canchas.ts:308` `setCanchaActive` | no | el trigger ni dispara |
| `settings-client.tsx:617` `addService` | (INSERT) | fuera del alcance de un trigger de UPDATE |

**Ningún write-path legítimo queda bloqueado.** Sin hallazgos que reportar.

## Deviations from Plan

### 1. [Rule 3 — Blocking] La validación se hizo aplicando la 068 al Postgres local, no con `supabase db reset`

- **Encontrado en:** Task 1 (y aplicado también en Task 2).
- **Situación:** el `<verify>` de las Tasks 1 y 2 era `supabase db reset`. La instrucción operativa de esta ejecución prohíbe correrlo sin avisar: **destruye los datos de prueba del Supabase local**.
- **Qué se hizo en su lugar:** se aplicó el archivo completo contra el Postgres local con
  `docker exec -i supabase_db_forjo-app psql -v ON_ERROR_STOP=1 --single-transaction`, que valida lo mismo y más:
  el orden D-05 en una sola transacción (con el backfill real de 10 filas), la re-corribilidad (2ª pasada = `UPDATE 0`),
  el estado resultante de constraints y DEFAULT, y el **comportamiento** del gate y de los CHECK con filas forzadas.
  Un `db reset` sobre una base vacía + seed **no** habría probado el backfill (la base recién reseteada no tiene las filas `group_class`/1 que lo hacen necesario).
- **Lo que NO cubre esta validación:** que el replay del baseline numerado + 040..068 **en orden** desde cero termine limpio. Eso sigue pendiente de un `supabase db reset` y queda anotado abajo.
- **Verificación:** exit 0 en las dos pasadas; ver el output literal de arriba.
- **Committed in:** `d37d45b` y `5743be2`.

---

**Total deviations:** 1 (Rule 3 — bloqueo operativo, no de código).
**Impact on plan:** ninguno sobre el contenido entregado. La validación resultante es más fuerte en comportamiento y más débil en replay-desde-cero.

## Issues Encountered

- **El primer intento de CONTROL C dio un falso rojo** (rechazó cuando debía pasar): el servicio de prueba del seed local ya tenía **4 turnos futuros vivos preexistentes**, así que el turno cancelado que se insertó no aislaba nada. Se rehízo el control creando un servicio nuevo dentro de la misma transacción, con `count(*) = 0` de turnos futuros vivos impreso antes del UPDATE. Es la misma clase de trampa que el CONTEXT registra para los DELETE que salen "Success": el control tiene que **probar** su premisa, no asumirla.
- **La primera versión del header nombraba `services_capacity_matches_mode_chk` en la sección "Qué hace"**, lo que hacía que el criterio de aceptación de orden (`grep -n` del backfill vs. del constraint) comparara contra una línea de comentario en vez de contra el SQL. Se reescribió esa línea del header para que la comparación sea inequívoca.

## Known Stubs

Ninguno.

## Threat Flags

Ninguna superficie nueva fuera del `<threat_model>` del plan. La única escritura nueva es un trigger
de solo-lectura sobre `appointments` con filtro explícito por tenant dentro de un `SECURITY DEFINER`.

## User Setup Required

**La 068 NO se aplicó a producción.** El runbook completo es el plan 15-05; el orden mínimo es:

1. **Pre-flight (obligatorio, está escrito en el header de la 068).** Contra **producción**:
   ```sql
   select count(*), count(*) filter (where capacity is null), max(capacity) from time_blocks;
   select capacity_mode, capacity, count(*) from services group by 1,2 order by 3 desc;
   ```
   - **ABORTAR si `max(capacity) > 1`**: hay un negocio cuyo cupo grupal vive en el bloque de agenda y esta migración se lo bajaría de hecho a 1.
   - Si aparece un `group_class` con cupo >= 2, el backfill **no** lo toca (así está escrito el predicado), pero hay que registrarlo.
2. **Aplicar `supabase/migrations/068_service_capacity_unified_and_mode_gate.sql` A MANO**, entero y en una sola transacción, en el SQL editor de Supabase. Nunca por `db push`. Última migración en prod hoy = **067**.
3. El `NOTIFY pgrst, 'reload schema';` ya está incluido al final del archivo.
4. **Coordinar con el deploy del código**: aplicar la 068 antes de que el panel pueda ofrecer los tres modos deja el editor de servicios de hoy rebotando si el dueño elige "Clase grupal" (fuerza `capacity = 1`, que el CHECK nuevo rechaza). Ese guard mínimo es D-10 y entra en otro plan de esta misma fase — **la 068 no debería llegar a prod antes que él**.
5. Verificación post-aplicación (D-09, por **instalación**, no por comportamiento — hay cero servicios simultáneos en prod y el gate solo dispara con turnos futuros vivos):
   ```sql
   select proname from pg_proc where proname = 'services_block_mode_change';
   select tgname from pg_trigger where tgname = 'services_block_mode_change_trg';
   ```
   No perder tiempo intentando provocar el rechazo en producción.

## Next Phase Readiness

**Listo para los planes 15-02..15-05:**

- La base ya declara los tres modos y el invariante `is_group ⟺ capacity_mode <> 'individual'`.
- `lib/types.ts` ya expone la unión de tres, así que el editor (D-10) y las lecturas del cupo (D-08) pueden tipar contra ella sin castings.

**Pendientes reales que este plan deja abiertos (por alcance, no por olvido):**

- **`supabase db reset` no se corrió** ⇒ falta la confirmación de que el replay del baseline + 040..068 desde cero termina limpio. El archivo es re-corrible y se aplicó dos veces seguidas con exit 0 sobre una base con datos, así que el riesgo es bajo, pero el gate formal del plan queda sin ejecutar. **Requiere el OK del dueño** porque borra los datos de prueba locales.
- **La suite de integración va a fallar contra el Postgres local hasta que entre D-10.** Cuatro `afterEach` escriben `update({ capacity_mode: 'group_class', capacity: 1 })` — `test/concurrency.test.ts:54`, `test/booking-cualquiera-public.test.ts:127`, `:334`, `:365` — combinación que el CHECK nuevo ya rechaza en la base local. Es la consecuencia esperada y anticipada por D-10; **no** es una regresión de este plan. Por eso no se corrió ninguna suite acá.
- `app/(dashboard)/settings/settings-client.tsx:616` y `:701` siguen forzando `capacity = 1` para todo lo que no sea simultáneo (D-10, otro plan).
- Las cuatro lecturas del cupo (D-08) siguen leyendo `time_blocks.capacity`: `book_slot_atomic`, `lib/booking-core.ts:186-199`, `app/api/booking/availability/route.ts:72-83` (+ sus tres consumidores `:218`, `:415`, `:432`) y `agenda-client.tsx:465-474` (Phase 16).
- El comentario del gate espejo de la 064 en `supabase/schema.sql:436-447` **sigue mintiendo** (su premisa es que el cupo es del bloque). D-07: el gate no se re-escopea, pero el comentario hay que reescribirlo — no entraba en el alcance de este plan.

---
*Phase: 15-modelo-de-cupo-unificado*
*Completed: 2026-08-12*
