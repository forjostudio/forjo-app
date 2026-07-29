---
phase: 12-cupo-por-solape-recurso-simult-neo
plan: 01
subsystem: database
tags: [postgres, supabase, plpgsql, advisory-lock, tsrange, security-definer, multi-tenant, typescript]

# Dependency graph
requires:
  - phase: 02-cupos-grupales
    provides: "time_blocks.capacity + appointments.seat/is_group + índice único 011 + EXCLUDE gist 013 + book_slot_atomic (respaldo atómico anti-sobrecupo)"
  - phase: 03-espacio-compartido
    provides: "locks por espacio en orden ascendente (anti-deadlock) + predicado canónico tsrange && tsrange"
  - phase: 09-asignaci-n-autom-tica-at-mica-de-profesional
    provides: "cuerpo VIGENTE de book_slot_atomic (migr. 058): lock hash(business_id+date+time) + selección 'cualquiera'"
provides:
  - "services.capacity_mode ('group_class' | 'simultaneous_resource', DEFAULT 'group_class') + CHECK fail-closed"
  - "services.capacity (smallint, DEFAULT 1) + CHECK capacity >= 1"
  - "book_slot_atomic mode-aware: advisory lock por modo + gate de cupo por SOLAPE filtrado por service_id"
  - "public_services expone capacity_mode (y NO capacity)"
  - "Service.capacity_mode / Service.capacity en lib/types.ts"
affects: [12-02 core JS mode-aware, 12-03 read-path availability + UI, 12-04 tests de carrera CUPO-04, secure-phase 12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Advisory lock de granularidad variable según el modo del servicio (service-day vs slot)"
    - "Gate de cupo por solape de intervalos (tsrange &&) filtrado por service_id dentro del RPC SECURITY DEFINER"

key-files:
  created:
    - supabase/migrations/062_service_capacity_mode_overlap.sql
  modified:
    - supabase/schema.sql
    - lib/types.ts
    - test/canchas-provision.test.ts
    - test/landing-derive.test.ts
    - test/staff-services.test.ts

key-decisions:
  - "capacity_mode como enum-vía-CHECK con DEFAULT 'group_class': todas las filas existentes (incluidas canchas) quedan en el modo actual sin backfill — cero regresión (D-01/D-14)"
  - "Cada modo lee SU fuente de cupo: simultáneo → services.capacity; grupal → time_blocks.capacity (intacto) (D-02)"
  - "Advisory lock re-granularizado por modo: simultáneo = hash(business_id+service_id+date), resto = hash(business_id+date+time) inalterado; el lock de modo se toma PRIMERO, antes de los de espacio → orden parcial consistente, deadlock-free (D-06)"
  - "seat sigue atado al slot exacto (date+time+bucket); el solape es SOLO el gate del cupo (D-05)"
  - "is_group = (capacity > 1) en la rama simultánea para que el EXCLUDE gist 013 no rechace los solapes legales (LANDMINE Pitfall 2)"
  - "public_services expone SOLO capacity_mode (flag de presentación); capacity queda server-side (no-leak de lugares restantes, D-12)"

patterns-established:
  - "Lock de granularidad dependiente del modo: la config del servicio se lee ANTES del lock (no compite en la carrera) y define qué key serializar"
  - "Bifurcación de semántica dentro del RPC dejando la rama histórica byte-idéntica como garantía de cero regresión"

requirements-completed: [CUPO-01, CUPO-02, CUPO-03, CUPO-04, CUPO-05]

# Metrics
duration: 18min
completed: 2026-07-29
status: complete
---

# Phase 12 Plan 01: Espinazo de integridad (columnas + RPC mode-aware) Summary

**Migración 062: `services.capacity_mode`/`capacity` con CHECKs fail-closed y `book_slot_atomic` redefinido in-place para que el cupo del recurso simultáneo se cuente por SOLAPE de intervalos (`tsrange &&` por `service_id`) bajo un advisory lock service-day, dejando la clase grupal byte-idéntica.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-07-29T15:53:00Z
- **Completed:** 2026-07-29T16:11:00Z
- **Tasks:** 3
- **Files modified:** 6 (1 creado, 5 modificados)

## Accomplishments

- **Columnas + CHECKs idempotentes** en `services`: `capacity_mode text NOT NULL DEFAULT 'group_class'` (enum extensible vía CHECK) y `capacity smallint NOT NULL DEFAULT 1` (CHECK `>= 1`). El DEFAULT cubre todas las filas existentes — incluidas las canchas — sin backfill (CUPO-05/D-14).
- **`book_slot_atomic` mode-aware** con firma byte-idéntica (14 params + `RETURNS TABLE (id, cancel_token)`), `CREATE OR REPLACE` sin `DROP`: los 4 callers de `createAppointmentCore` entran igual.
- **Corrección del sobrecupo escalonado (CUPO-02/CUPO-04):** para `simultaneous_resource` el advisory lock pasa a `hash(business_id + service_id + date)` — las reservas escalonadas (16:00 / 16:15) ahora serializan — y el gate cuenta por `tsrange && tsrange` filtrado por `service_id` + `business_id`, rechazando con `slot_full` cuando el solape alcanza `capacity`.
- **Cero regresión verificada:** la rama `group_class` es byte-idéntica a 058:184-211; el motor (`concurrency`, `booking-core`, `canchas-booking`, `staff-assignment`) queda 22/22 verde con la 062 aplicada en local.
- **`public_services` expone `capacity_mode`** (para que el selector público pueda ocultar "Cualquiera" en simultáneo, D-13) y NO expone `capacity` (no-leak de lugares restantes).

## Task Commits

1. **Task 1: Columnas capacity_mode/capacity + CHECKs + vista public_services + tipo Service** — `692ec3e` (feat)
2. **Task 2: Redefinir book_slot_atomic mode-aware (lock por modo + gate por solape) + OWNER/GRANT + NOTIFY** — `eb312a1` (feat)
3. **Task 3: [BLOCKING] Aplicar la 062 en local — `supabase db reset` + verificación** — sin commit (gate de validación, no produce cambios de archivos)

## Files Created/Modified

- `supabase/migrations/062_service_capacity_mode_overlap.sql` (NUEVO) — columnas + 2 CHECK idempotentes vía `pg_constraint` + `CREATE OR REPLACE VIEW public_services` + `CREATE OR REPLACE FUNCTION book_slot_atomic` mode-aware + OWNER/GRANT re-emitidos + `NOTIFY pgrst, 'reload schema'` como última línea.
- `supabase/schema.sql` — reflejo quirúrgico (no dump): 2 columnas + 2 CHECK inline en el bloque `services`, `capacity_mode` al final del SELECT de `public_services`, y el cuerpo nuevo de `book_slot_atomic`.
- `lib/types.ts` — `Service.capacity_mode: 'group_class' | 'simultaneous_resource'` y `Service.capacity: number`, con comentarios que explican qué fuente de cupo lee cada modo.
- `test/canchas-provision.test.ts`, `test/landing-derive.test.ts`, `test/staff-services.test.ts` — fixtures literales de `Service` actualizadas con los dos campos nuevos (`group_class` / 1).

## Decisions Made

- **`v_svc_cap` también se `COALESCE`a a 1** (además de `v_mode` a `'group_class'`): si el `SELECT` del servicio no resolviera ninguna fila, ambas variables quedarían NULL y `v_overlap >= NULL` sería NULL (nunca rechaza). El fail-safe deja el comportamiento histórico y el gate operativo. Refuerza D-07.
- **A4 del research resuelto:** para simultáneo con `capacity = 1` se deja `is_group = false` a propósito — el EXCLUDE gist 013 queda activo como respaldo atómico redundante con el gate por solape.
- **Time_blocks solo se lee en la rama grupal:** el `SELECT COALESCE(MAX(tb.capacity),1)` se movió DENTRO del `ELSE`, así el modo simultáneo no toca `time_blocks` (Pitfall 3: cada modo lee su fuente).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixtures de tests rotas por los campos requeridos de `Service`**
- **Found during:** Task 1 (tipos)
- **Issue:** `capacity_mode`/`capacity` son NOT NULL en la DB, así que se tiparon como requeridos en `Service`. Seis literales de fixture en `test/canchas-provision.test.ts`, `test/landing-derive.test.ts` y `test/staff-services.test.ts` construían `Service` a mano y dejaban de compilar (TS2739).
- **Fix:** agregar `capacity_mode: 'group_class', capacity: 1` a cada fixture (el default de la DB), en vez de aflojar el tipo a opcional (que habría escondido el campo a los consumidores).
- **Files modified:** `test/canchas-provision.test.ts`, `test/landing-derive.test.ts`, `test/staff-services.test.ts`
- **Verification:** `./node_modules/.bin/tsc --noEmit` limpio.
- **Committed in:** `692ec3e` (commit de Task 1)

**2. [Rule 3 - Blocking] Verificación con el binario local de TypeScript, no con `npx tsc`**
- **Found during:** Tasks 1 y 2
- **Issue:** el plan escribe `npx tsc --noEmit` en los bloques `<automated>`. En este proyecto `npx tsc` puede resolver el paquete `tsc@2.0.4` del registry (que NO es el compilador y siempre sale 0) — trampa ya documentada del entorno.
- **Fix:** se ejecutó `./node_modules/.bin/tsc --noEmit`. Mismo chequeo, resultado confiable.
- **Files modified:** ninguno
- **Verification:** salida limpia real, con errores detectados y corregidos antes del commit.
- **Committed in:** n/a (cambio de procedimiento de verificación)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** ambas necesarias para que el plan compile y se verifique de verdad. Sin scope creep: no se tocó ninguna lógica de producción fuera de los artefactos del plan.

## Issues Encountered

- **Fallos de tests en abono-* bajo carga paralela (PRE-EXISTENTES, no causados por la 062).** La suite completa (`npm run test`) marca 3-4 fallos intermitentes en `test/abono-create.test.ts`, `test/abono-cron.test.ts` y `test/abono-generation.test.ts` (asserts de cantidad de ocurrencias generadas). Corridos en aislamiento, esos archivos pasan.
  **Verificación A/B:** se restauró la función de la 058 en la DB local (sin la 062) y se corrió la suite completa → los MISMOS tests fallan. Con la 062 re-aplicada, el motor (`concurrency`, `booking-core`, `canchas-booking`, `staff-assignment`) queda 22/22 verde. Conclusión: flakiness pre-existente por carga/paralelismo contra la DB local, ajena a esta fase. Queda anotada, no se tocó (fuera de scope).
- **`supabase db reset` local corrió limpio** replayando el baseline + 040..062 en orden (PG17). Verificado a mano: `\d services` muestra ambas columnas con sus defaults y los 2 CHECK; el CHECK rechaza un `capacity_mode` fuera del enum; `book_slot_atomic` existe con 14 args; `public_services` lista `capacity_mode` y NO `capacity`; el service seedeado nace `group_class`/1.

## User Setup Required

**La migración 062 se aplica A MANO al Supabase de PROD, coordinada con el deploy — NO es parte del flujo GSD.**
- Última migración en prod: **061**. La próxima es la **062**.
- Tras aplicarla: correr `NOTIFY pgrst, 'reload schema';` (PostgREST cachea el schema) y confirmar que `supabase/schema.sql` del repo refleja el estado (ya actualizado en este plan).
- No hay variables de entorno nuevas ni servicios externos que configurar.

## Next Phase Readiness

- Columnas + función viven en la DB local: **12-02** (core JS mode-aware — LANDMINE del re-check de `lib/booking-core.ts:206-218`), **12-03** (read-path de disponibilidad + UI) y **12-04** (tests de carrera CUPO-04) pueden construir encima.
- Para 12-04: el fixture debe setear `capacity_mode='simultaneous_resource'` + `capacity` sobre el service sembrado; el test de carrera N+1 escalonado es el que valida de verdad la re-granularización del lock (hoy verificada solo por construcción).
- Pendiente de la fase: `secure-phase` obligatorio (se toca el núcleo `SECURITY DEFINER` compartido por 4 consumidores).

## Self-Check: PASSED

- `supabase/migrations/062_service_capacity_mode_overlap.sql` — existe
- `.planning/workstreams/motor-reservas/phases/12-cupo-por-solape-recurso-simult-neo/12-01-SUMMARY.md` — existe
- Commits `692ec3e`, `eb312a1` — presentes en el historial

---
*Phase: 12-cupo-por-solape-recurso-simult-neo*
*Completed: 2026-07-29*
