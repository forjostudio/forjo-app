# Phase 12: Cupo por solape (recurso simultáneo) - Research

**Researched:** 2026-07-29
**Domain:** PostgreSQL concurrency (advisory locks, `SECURITY DEFINER` RPC, interval overlap) + Next.js 16 read-path + multi-tenant isolation
**Confidence:** HIGH — todas las respuestas están validadas contra el código VIGENTE en el repo (líneas citadas) y contra la semántica documentada de Postgres. No hay paquetes nuevos ni dependencias externas.

## Summary

Esta fase re-escribe el núcleo atómico `book_slot_atomic` (`SECURITY DEFINER`) para que el "cupo N" signifique dos cosas distintas según un flag por servicio: **clase grupal** (conteo por hora de inicio exacta contra `time_blocks.capacity` — comportamiento actual, INTACTO) o **recurso simultáneo** (conteo por SOLAPE de intervalos contra una columna nueva `services.capacity`). El cambio es quirúrgico: se lee el modo una vez al entrar, se elige la granularidad del advisory lock según el modo, y se bifurca SOLO el criterio de conteo — dejando byte-idéntico el resto (selección "cualquiera" de 058, exclusión por espacio de 042, asignación de `seat`, casos cupo 1 y canchas).

El bug raíz (documentado en REQUIREMENTS.md:14-28 y reproducido en UAT fase 07) es que el lock actual `hash(business_id + date + time)` (058:82-83) serializa solo reservas del MISMO instante de inicio; dos reservas escalonadas (16:00 y 16:15) toman locks distintos, no se serializan, y ambas pasan el conteo `date+time` exacto (058:195-200) que nunca mira `duration_minutes`. La corrección: para `simultaneous_resource` el lock pasa a `hash(business_id + service_id + date)`, que serializa TODAS las reservas de ese servicio ese día — exactamente el conjunto donde el conteo por solape debe ser consistente.

**Primary recommendation:** Migración **062** con dos `ADD COLUMN IF NOT EXISTS` (`services.capacity_mode` enum-vía-CHECK default `'group_class'`, `services.capacity` default 1) + `CREATE OR REPLACE FUNCTION book_slot_atomic` (firma byte-idéntica, sin DROP) que (a) lee `capacity_mode`/`capacity` del servicio ANTES del lock, (b) elige el lock key por modo, (c) bifurca el conteo (overlap vs exacto) manteniendo `seat` atado al slot exacto y ampliando `is_group` para incluir el modo simultáneo. **Landmine crítico fuera del SQL:** el re-check JS de `lib/booking-core.ts:206-218` rechaza prematuramente el 2º solape como `slot_taken` para `slotCapacity<=1` — DEBE volverse mode-aware o el recurso simultáneo nunca se llena. Verificación DURA con test de carrera N+1 escalonado (CUPO-04) sobre la DB local, molde CONC-01.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Modo por servicio como **enum extensible** (no boolean): `services.capacity_mode text NOT NULL DEFAULT 'group_class'` con CHECK `IN ('group_class','simultaneous_resource')`. Default `group_class` ⇒ cero regresión sin backfill. Molde: `businesses.public_selector_default` (061) y `abono_window_weeks` (055).
- **D-02:** El cupo N del recurso simultáneo vive en **columna nueva `services.capacity` (default 1)**, usada SOLO por `simultaneous_resource`. La clase grupal sigue leyendo `time_blocks.capacity` INTACTO. Cada modo lee su propia fuente.
- **D-03:** Conteo por solape **por servicio**: una reserva `simultaneous_resource` compite solo contra otros turnos del MISMO `service_id` que se solapan en su intervalo (inicio + `duration_minutes`).
- **D-04:** Cruce entre servicios (v1) = **carriles independientes**. Cada servicio simultáneo tiene su propio "carril" de N lugares; no bloquea ni es bloqueado por otros servicios.
- **D-05:** El **`seat`** sigue atado al **slot exacto** (posición dentro del `date+time` exacto) para no chocar con el índice único 011. El solape es solo el gate del cupo, separado de la asignación de asiento.
- **D-06:** **Re-granularización del advisory lock dependiente del modo.** `simultaneous_resource` → lock `hash(business_id + service_id + date)`; `group_class` y cupo 1 → lock fino actual. El researcher valida que componga con Phase 9 (058), Phase 3 (042 orden ascendente), y no degrade `slot_full`/`slot_taken` ni cupo 1. **(Validado abajo, Q1.)**
- **D-07:** Conteo nuevo + lectura del flag DENTRO del mismo `book_slot_atomic` (`SECURITY DEFINER`, RLS NO protege adentro): toda query nueva filtra por `business_id = p_business_id` explícito; el flag se re-valida por `business_id`.
- **D-08:** **CUPO-04 se verifica con test de carrera real contra la DB** (N+1 escalonadas concurrentes sobre cupo N nunca superan el cupo). Molde: CONC-01/CONC-03.
- **D-09:** Segmented control "Clase grupal / Recurso simultáneo" + microcopy en el editor de servicio (`/servicios`); campo de cupo N cuando el modo es `simultaneous_resource`.
- **D-10:** Labels fijos para todos los negocios (no por vertical en v1).
- **D-11:** Roster del admin en simultáneo = filas individuales + aviso "lleno" (ej. "2/2 camillas"); NO el contador "8/15" del grupal.
- **D-12:** Grid público **overlap-aware**: `/api/booking/availability` marca "lleno" cuando el intervalo ya tiene `capacity` turnos solapados. Misma lógica que el RPC, replicada en el read-path. Mantiene el no-leak de lugares restantes (Phase 2 D-06).
- **D-13:** `simultaneous_resource` **exige elegir profesional** — NO ofrece "Cualquiera" (soporte diferido). Phase 10 selector debe ocultarlo.
- **D-14:** **Cero regresión de canchas.** Nacen `capacity_mode='group_class'` por default; `services.capacity` no las toca; exclusión por espacio (042) igual. El modo simultáneo NO aplica a canchas.

### Claude's Discretion
- Mecanismo exacto de la re-granularización del lock (D-06) — dirección locked, detalle validado por research (ver Q1).
- Estructura de la migración 062 (orden ADD COLUMN + CREATE OR REPLACE FUNCTION), re-emisión OWNER/GRANT con firma completa, `NOTIFY pgrst, 'reload schema'`.
- Cómo se ramifica el cuerpo del RPC por `capacity_mode` (leer el flag una vez y bifurcar lock + conteo).

### Deferred Ideas (OUT OF SCOPE)
- Control por-dueño de paralelismo cross-servicio (opción 3 del cruce entre servicios).
- Soporte de "Cualquiera" (multi-staff) sobre servicios `simultaneous_resource` (capacity-aware auto-assign).
- Terminología por vertical de los dos modos (`lib/verticals`).
- Repensar el modelo de planes/límites "agendas → profesionales/canchas" (milestone aparte).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CUPO-01 | El dueño marca cada servicio como clase grupal o recurso simultáneo desde el panel | Q3 (columna `capacity_mode` + CHECK); D-09 UI en `settings-client.tsx` (servicios `select('*')` ya propaga la columna — `servicios/page.tsx:22`) |
| CUPO-02 | Con simultáneo, se rechaza cuando en el intervalo ya hay `capacity` turnos solapados (no por hora exacta) | Q2 (SQL de conteo por `tsrange &&` por `service_id`) |
| CUPO-03 | Con clase grupal, el cupo se cuenta por hora exacta (sin cambios) | Q1/Q2 (rama `group_class` byte-idéntica a 058:184-211) |
| CUPO-04 | Control por solape ATÓMICO bajo concurrencia (test de carrera contra la DB) | Q1 (lock service-day) + Q5 (test N+1 escalonado, molde CONC-01) |
| CUPO-05 | Cero regresión del núcleo: cupo 1, canchas, forward de abonos, multi-staff, espacio compartido; `slot_full`/`slot_taken` no se degradan | Q1 (composición) + Landmines + Validation Architecture (regresión de las 4 vías) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Gate de cupo por solape (autoridad atómica) | Database (`book_slot_atomic`, `SECURITY DEFINER`) | — | La atomicidad count→insert solo se garantiza en la DB bajo `pg_advisory_xact_lock`; el JS no puede (cada `.rpc`/`.insert` es su propia transacción autocommit — booking-core.ts:265-270) |
| Flag por servicio (`capacity_mode`, `capacity`) | Database (columnas en `services`) | Frontend Server (editor `/servicios`) | Dato de tenant; se escribe desde el panel autenticado (anon+RLS) y se lee dentro del RPC |
| Re-check UX temprano (mode-aware) | API / Backend (`lib/booking-core.ts`) | — | Solo UX/rechazo temprano; la autoridad es el RPC. DEBE volverse mode-aware (landmine) |
| Grid público overlap-aware | API / Backend (`/api/booking/availability`, service-role) | Browser (`booking-client.tsx` consume `full`) | El anon no lee `appointments` (RLS); el endpoint calcula el solape server-side y devuelve booleano-por-slot en `full` (no-leak D-06) |
| Ocultar "Cualquiera" para simultáneo (D-13) | Browser (selector Phase 10) | Database (`public_services.capacity_mode`) | Presentación; el flag viaja por la vista acotada |

## Standard Stack

Sin paquetes nuevos. La fase se implementa 100% con el stack existente:

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| PostgreSQL (Supabase) | 17 (local reset) / prod | `book_slot_atomic`, `pg_advisory_xact_lock`, `tsrange &&`, CHECK/enum | Es donde vive la garantía atómica (patrón LOCKED del proyecto) |
| `@supabase/supabase-js` | ^2.106.2 | `.rpc('book_slot_atomic', ...)` desde el core | Ya cableado en `lib/booking-core.ts:273` |
| Vitest | ^4.1.9 | Test de carrera CUPO-04 contra la DB local | `npm run test` = `vitest run`; molde CONC-01 en `test/concurrency.test.ts` |
| Next.js | 16.2.7 (App Router) | Route handler de availability (`route.ts`, `export const dynamic='force-dynamic'`) | Middleware = `proxy.ts`; no aplica acá |

**Package Legitimacy Audit:** No aplica — la fase NO instala paquetes externos. Todo es SQL + TypeScript sobre dependencias ya presentes en `package.json`.

## Architecture Patterns

### System Data Flow (recurso simultáneo)

```
Cliente público / Alta manual / Cron abonos / Canchas
        │  (los CUATRO entran por el mismo core)
        ▼
lib/booking-core.ts  createAppointmentCore()
        │  1. anti-tampering: SELECT service (+ capacity_mode, capacity NUEVO) por business_id  [~ln 95]
        │  2. re-check JS UX (mode-aware NUEVO — no rechazar solape en simultáneo)              [~ln 134-218]
        │  3. .rpc('book_slot_atomic', {14 params SIN CAMBIO})                                  [~ln 273]
        ▼
DB: book_slot_atomic (SECURITY DEFINER)  ── migración 062 ──
        │  A. SELECT capacity_mode, capacity INTO v_mode, v_svc_cap  (por business_id)   [NUEVO, antes del lock]
        │  B. pg_advisory_xact_lock( mode == simultaneous ? hash(biz+svc+date)          [MODIFICADO por modo]
        │                                                  : hash(biz+date+time) )
        │  C. if v_is_any: selección "cualquiera" (058) ── group_class only ──           [SIN CAMBIO]
        │  D. locks por espacio ascendente + EXISTS anti-solape (042)                    [SIN CAMBIO]
        │  E. gate de cupo:
        │        simultaneous → count(overlap por service_id) >= v_svc_cap ? slot_full   [NUEVO]
        │        group_class  → count(exacto date+time) >= tb.capacity ? slot_full       [SIN CAMBIO, 058:184-211]
        │  F. seat = count(exacto date+time+bucket)  ;  is_group = (mode-aware)           [seat SIN CAMBIO / is_group AMPLIADO]
        │  G. INSERT appointments (seat, is_group, ...)
        ▼
      RETURNS TABLE (id, cancel_token)   ── byte-idéntico ──
```

### Recommended body structure of `book_slot_atomic` (062)

```
DECLARE
  v_mode text;               -- (062) capacity_mode del servicio
  v_svc_cap int;             -- (062) services.capacity (solo simultaneous)
  v_effective_pro uuid := p_professional_id;   -- (058) sin cambio
  v_is_any boolean := (...);                    -- (058) sin cambio
  v_bucket uuid; v_capacity int; v_occupied int; v_overlap int; v_seat smallint; v_is_group boolean;
  v_space_ids uuid[]; v_sid uuid;               -- (042) sin cambio
BEGIN
  -- A. Leer el modo del servicio ANTES del lock (config estable, no compite en la carrera). D-07 tenant explícito.
  SELECT s.capacity_mode, COALESCE(s.capacity, 1)
    INTO v_mode, v_svc_cap
  FROM services s WHERE s.id = p_service_id AND s.business_id = p_business_id;
  v_mode := COALESCE(v_mode, 'group_class');   -- fail-safe al modo actual

  -- B. Lock dependiente del modo (D-06). group_class/canchas ⇒ key fino actual; simultaneous ⇒ key service-day.
  IF v_mode = 'simultaneous_resource' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      p_business_id::text || p_service_id::text || p_date::text, 0));
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended(
      p_business_id::text || p_date::text || p_time::text, 0));   -- 058:82-83 sin cambio
  END IF;

  -- C. Selección "cualquiera" (058:88-137) — SIN CAMBIO. (D-13: simultáneo no ofrece "cualquiera".)
  -- D. Recompute v_bucket + locks por espacio ascendente + EXISTS (058:139-182 / 042) — SIN CAMBIO.

  -- E/F. Gate de cupo + seat + is_group, bifurcado por modo.
  IF v_mode = 'simultaneous_resource' THEN
    -- Gate por SOLAPE por service_id (D-02/D-03). tsrange && idéntico al de 042:190-191 / EXCLUDE 013.
    SELECT count(*) INTO v_overlap
    FROM appointments a
    WHERE a.business_id = p_business_id
      AND a.service_id  = p_service_id
      AND a.date        = p_date
      AND a.status IN ('confirmed','pending_payment')
      AND tsrange(a.date + a.time, a.date + a.time + make_interval(mins => COALESCE(a.duration_minutes,30)))
          && tsrange(p_date + p_time, p_date + p_time + make_interval(mins => p_duration));
    IF v_overlap >= v_svc_cap THEN
      RAISE EXCEPTION 'slot_full' USING ERRCODE = 'P0001';
    END IF;
    -- seat atado al slot EXACTO (D-05) — misma query que 058:195-200 (no choca con índice 011).
    SELECT count(*) INTO v_occupied
    FROM appointments a
    WHERE a.business_id = p_business_id
      AND COALESCE(a.professional_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_bucket
      AND a.date = p_date AND a.time = p_time
      AND a.status IN ('confirmed','pending_payment');
    v_seat := v_occupied;
    v_is_group := (v_svc_cap > 1);   -- desactiva EXCLUDE 013 para permitir solapes hasta el cupo (LANDMINE)
  ELSE
    -- group_class: 058:184-211 EXACTO (v_capacity de time_blocks, v_occupied exacto, seat, is_group).
    ... (sin cambio) ...
    v_is_group := (v_capacity > 1);
  END IF;

  INSERT INTO appointments (..., seat, is_group, ...) VALUES (..., v_seat, v_is_group, ...) RETURNING ...;
END;
```

### Anti-Patterns to Avoid
- **`count` suelto sin lock** para decidir "¿queda lugar?": es la carrera TOCTOU que el proyecto prohíbe explícitamente (booking-core.ts:265-270, CONTEXT REQUIREMENTS:82-84). El conteo por solape SIEMPRE va después del lock.
- **`DROP FUNCTION` + recreate:** rompería los 4 callers. Solo `CREATE OR REPLACE` con firma byte-idéntica (14 params + `RETURNS TABLE (id, cancel_token)`), patrón 041/042/058.
- **Contar el gate por bucket (profesional) en vez de por servicio:** violaría D-03 (una consulta normal de la misma persona restaría contra "camilla"). El gate simultáneo filtra por `service_id`, no por `professional_id`.
- **Evaluar el `seat` por solape:** chocaría con el índice único 011 `(business, bucket, date, time, seat)`. `seat` SIEMPRE por slot exacto (D-05).
- **Mover `capacity` del grupal a `services`:** rompería yoga 16:00=10 / 18:00=15 (cada clase/slot tiene su cupo). Cada modo lee su fuente (D-02).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Serialización de la carrera | Mutex en Node / lock en memoria | `pg_advisory_xact_lock` (ya en 041/042/058) | Vercel es multi-instancia; solo el lock de Postgres es global al cluster y se libera al fin de la transacción (041:84-88) |
| Solape de intervalos | Comparación manual de minutos en SQL | `tsrange(...) && tsrange(...)` | Ya es el predicado canónico del proyecto (042:190-191, EXCLUDE 013 en 041:76); consistencia garantizada |
| CHECK idempotente del enum | `ALTER ... ADD CONSTRAINT` a secas | Bloque `DO $$ ... pg_constraint ... $$` | Molde exacto 055:51-64 / 061:41-54; re-correr la migración = no-op |
| Exponer flag al público | Query ancha de `services` a anon | `CREATE OR REPLACE VIEW public_services` + columna al final | Molde 061:59-82 / 052; anon lee la vista acotada, nunca la tabla |

**Key insight:** cada pieza que esta fase necesita YA existe en el repo en otra forma (lock, `tsrange`, CHECK idempotente, vista acotada). El trabajo es COMPONER, no inventar.

## Runtime State Inventory

> Esta fase modifica una función almacenada (`book_slot_atomic`) y agrega columnas. No es un rename, pero sí toca estado en runtime coordinado con el deploy.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `appointments.seat` / `is_group` ya existen (041). Los turnos EXISTENTES nacieron `group_class` implícito; con `capacity_mode` default `'group_class'` no requieren backfill. `services.capacity_mode`/`capacity` se agregan con DEFAULT → todas las filas existentes quedan en modo actual. | Data migration = NINGUNA (el DEFAULT cubre las filas viejas). Solo DDL. |
| Live service config | `book_slot_atomic` es una función viva en Postgres. Prod se actualiza A MANO con `CREATE OR REPLACE` coordinado con el deploy + `NOTIFY pgrst, 'reload schema'` (patrón 058:38-39). PostgREST cachea el schema → el `NOTIFY` es obligatorio para que el `.rpc()` vea la nueva firma/columnas. | Aplicar 062 a mano en prod tras el deploy; correr el `NOTIFY`. |
| OS-registered state | Ninguno — no hay tasks/crons nuevos. El cron diario de abonos (que genera forward vía el mismo core) NO cambia de firma. | None. |
| Secrets/env vars | Ninguno. | None. |
| Build artifacts | `supabase/schema.sql` debe regenerarse tras aplicar 062 (patrón del repo, 042:28 / 055:41-42). El baseline local replaya 040..062 en `supabase db reset`. | Regenerar `schema.sql`; validar con `supabase db reset` local (PG17). |

**Nothing found in category "OS-registered state" / "Secrets":** verificado — la fase es DDL + cambio de función + read-path + UI, sin nuevos crons ni secretos.

## Open Questions — Resueltas (implementation-ready)

### Q1. Mecanismo exacto de re-granularización del lock (D-06) — VALIDADO

**Respuesta:** `simultaneous_resource` usa `pg_advisory_xact_lock(hashtextextended(business_id||service_id||date, 0))`; `group_class` y cupo 1 mantienen `hash(business_id||date||time)` de 058:82-83. La decisión del lock es por MODO, no por el valor de la capacity.

**(a) Composición con el widening de Phase 9 (058).** [VERIFIED: supabase/migrations/058_professional_auto_assignment.sql:75-83]
058 ya quitó `v_bucket` del hash (lock = `biz+date+time`). Para `group_class` mantenemos ESE lock exacto → la selección "cualquiera" (058:88-137) ve el mismo estado consistente de siempre; byte-idéntico. Para `simultaneous_resource`, D-13 oculta "Cualquiera", así que el bloque `v_is_any` no se ejercita; aunque llegara, el lock service-day es más grueso (serializa MÁS, nunca menos) y la selección de candidato (que cuenta carga sobre el día completo, 058:119-130) sigue siendo correcta. Un lock más grueso nunca introduce sobre-reserva.

**(b) Composición con los locks por espacio de Phase 3 (042, orden ascendente).** [VERIFIED: supabase/migrations/042_spaces_and_coupled_exclusion.sql:117-123, 156-158]
El orden global de adquisición se preserva: **[1 lock de modo] → [N locks de espacio en orden ascendente de `space_id`]**. 062 solo cambia el KEY del PRIMER lock según el modo; su POSICIÓN (siempre primero, antes de los locks de espacio) no cambia.

Análisis de deadlock (formal): un deadlock exige un ciclo donde T1 sostiene un recurso que T2 quiere y viceversa, adquiridos en orden opuesto. Cada transacción toma **exactamente un** lock de modo (el suyo) y lo toma **primero**; recién después toma locks de espacio en orden ascendente. Para que T2 esperara el lock de modo de T1, ese lock tendría que ser el lock de modo propio de T2 — pero T2 ya lo adquirió antes de cualquier lock de espacio, así que T2 nunca puede estar sosteniendo un espacio mientras espera un lock de modo. Por lo tanto no hay ciclo posible: el conjunto de locks respeta un orden parcial consistente (`modo < espacios ascendentes`) en TODAS las transacciones. **Deadlock-free.** Dos servicios distintos que comparten un espacio contienden solo en el lock de espacio (uno espera, ninguno sostiene lo que el otro pide entre los locks de modo, que son disjuntos).

**(c) No degrada `slot_full`/`slot_taken` ni el caso cupo 1.** [VERIFIED: 058:203-211]
Para `group_class` (incluye cupo 1 individual) el lock key es INALTERADO → esas rutas son byte-idénticas: cupo 1 sigue con `seat=0` fijo → 2ª reserva choca con índice 011 (23505 → `slot_taken`); grupal lleno sigue con `slot_full`. `slot_taken` por espacio (042 EXISTS) es independiente del lock de cupo y no cambia.

**Detalles de Postgres validados:**
- `pg_advisory_xact_lock(key bigint)` — forma de UN argumento; `hashtextextended(text, seed)` devuelve `bigint`. Se mantiene esa forma (no la de dos `int4`) por consistencia con 058/042. [CITED: postgresql.org/docs — Advisory Lock Functions; `hashtextextended` returns bigint]
- El lock se libera al fin de la transacción (`_xact_`); nunca se libera manualmente. [VERIFIED: 041:84-88]
- **Colisiones de hash entre negocios/servicios:** posibles en teoría (espacio bigint), pero solo causan SOBRE-serialización (dos claves distintas comparten lock → una espera de más). Nunca causan SUB-serialización (un lock faltante). Correctness-safe, mismo supuesto que 058/042 ya dependen. `service_id` es un UUID de este negocio → sin colisión cross-tenant relevante.

**Conclusión:** el mecanismo locked es correcto y compone. La única sutileza a codificar: leer `v_mode` ANTES del lock (la config del servicio no compite en la carrera de reservas).

### Q2. SQL exacto del conteo por solape (D-02/D-03/D-05) — VALIDADO

**Gate de cupo (`simultaneous_resource`):** contar turnos del MISMO `service_id`, mismo negocio, cuyo intervalo `[inicio, inicio+duration)` solapa el de la reserva; rechazar cuando `>= v_svc_cap`. SQL en el bloque "E/F" de arriba. El predicado `tsrange(...) && tsrange(...)` es **idéntico byte-a-byte** al de la exclusión por espacio (042:190-191) y al EXCLUDE 013 (041:76) → semántica de solape consistente en todo el motor. [VERIFIED: supabase/migrations/041...:76; 042...:190-191]

**Verificación contra el caso ancla** (REQUIREMENTS.md:14-20, cupo 2, dur 30):
- A(16:00-16:30), B(16:00-16:30): al llegar B, overlap con A = 1 < 2 → OK, seat exacto@16:00 = 1.
- C(16:15-16:45): overlap = {A,B} = 2 >= 2 → **`slot_full`** (antes se colaba). ✅ bug corregido.

**`seat` por slot exacto (D-05):** misma query que 058:195-200 (count por `bucket + date + time` exacto). Dos reservas escalonadas tienen `time` distinto → claves de índice 011 distintas → `seat=0` en ambas sin colisión. Solo reservas al MISMO `date+time` comparten seat-namespace y reciben 0,1,... — para las cuales `is_group=true` (ver abajo) desactiva el EXCLUDE 013.

**Composición con `is_group` / EXCLUDE 013 (LANDMINE):** [VERIFIED: 041:67-76]
El EXCLUDE 013 es `... WHERE (status IN (...) AND NOT is_group)`. Para permitir solapes hasta el cupo en simultáneo, la fila DEBE nacer con `is_group=true` cuando `v_svc_cap > 1` — si no, dos turnos solapados del mismo bucket chocarían con el gist (23P01) y el recurso nunca se llenaría. Por eso `v_is_group := (v_svc_cap > 1)` en la rama simultánea. Para `v_svc_cap = 1` simultáneo, `is_group=false` → EXCLUDE activo → rechaza el solape (redundante con el gate por count, consistente). El grupal mantiene `is_group := (v_tb_capacity > 1)`.

**`group_class` sin cambios (CUPO-03):** rama `ELSE` = 058:184-211 exacto (count por `date+time` exacto contra `time_blocks.capacity`). [VERIFIED: 058:184-211]

### Q3. Estructura de la migración 062 — VALIDADO

Orden obligatorio (idempotente, molde 055/061):

```sql
-- 1. Columnas (DEFAULT cubre filas existentes ⇒ cero regresión sin backfill, D-01/D-02)
ALTER TABLE "public"."services" ADD COLUMN IF NOT EXISTS "capacity_mode" text NOT NULL DEFAULT 'group_class';
ALTER TABLE "public"."services" ADD COLUMN IF NOT EXISTS "capacity" smallint NOT NULL DEFAULT 1;

-- 2. CHECKs idempotentes vía pg_constraint (molde 055:51-64 / 061:41-54)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conname='services_capacity_mode_chk' AND conrelid='"public"."services"'::regclass) THEN
    ALTER TABLE "public"."services" ADD CONSTRAINT "services_capacity_mode_chk"
      CHECK ("capacity_mode" IN ('group_class','simultaneous_resource'));
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conname='services_capacity_positive' AND conrelid='"public"."services"'::regclass) THEN
    ALTER TABLE "public"."services" ADD CONSTRAINT "services_capacity_positive" CHECK ("capacity" >= 1);
  END IF;
END $$;

-- 3. CREATE OR REPLACE FUNCTION book_slot_atomic (firma byte-idéntica, sin DROP) — cuerpo del bloque "E/F"
-- 4. ALTER FUNCTION ... OWNER TO "postgres";                (re-emitir, patrón 058:226)
-- 5. GRANT EXECUTE ... TO "anon","authenticated","service_role";   (re-emitir, patrón 058:230)

-- 6. (opcional, D-13) exponer capacity_mode en la vista pública acotada (ver Q4)
-- 7. NOTIFY pgrst, 'reload schema';                        (obligatorio tras DDL, 061:94)
```

**Validación:** ÚNICA vía automatizada = `supabase db reset` local (PG17, baseline + 040..062 en orden). NO existe `supabase db push` en el flujo GSD. Prod se aplica A MANO coordinado con el deploy. Tras aplicar: regenerar `supabase/schema.sql`. [VERIFIED: 058:38-39, 055:39-42, CONTEXT canonical_refs línea 90]

**Tipos TS:** `lib/types.ts` — agregar `capacity_mode: 'group_class' | 'simultaneous_resource'` y `capacity: number` a la interface `Service` (snake_case, refleja la fila DB; convención del proyecto).

### Q4. Read-path de disponibilidad overlap-aware (D-12) — VALIDADO con decisión pendiente acotada

**Estado actual del endpoint** (`app/api/booking/availability/route.ts`): la rama específica (professionalId concreto) NO recibe `serviceId` — solo la rama `any` lo recibe (línea 29, 101). Calcula `busy` (slots individuales cap<=1, línea 287-289) y `full` (count por hora exacta >= `time_blocks.capacity`, línea 302-310). [VERIFIED: app/api/booking/availability/route.ts:236-312]

**Cambio requerido para simultáneo:** el endpoint corre con **service-role** (`createAdminClient`, línea 34) → puede leer `services` directamente (ya lo hace en la rama `any`, línea 104-109). Recomendación:
1. El client pasa `serviceId` también en la rama específica (hoy solo pasa `professionalId`; `booking-client.tsx:254-259` ya tiene `selectedService.id` a mano).
2. El endpoint lee `capacity_mode`, `capacity` del `serviceId` (re-validado por `business_id`, anti-tampering aunque sea read — igual que línea 104-109).
3. Si `simultaneous_resource`: enumerar los start-times de la grilla (paso = `duration`, igual que la rama `any`, línea 197-202) y para cada uno contar los turnos VIVOS del `service_id` cuyo intervalo solapa; marcar el start-time en `full` cuando `count >= capacity`. Devolver `busy: []` (los solapes del propio servicio son legales hasta el cupo → NO deben ir a `busy` o el client los bloquearía como conflicto). Mismo patrón booleano-por-slot que la rama `any` (línea 229-230) → **mantiene el no-leak D-06** (nunca counts/remaining).
4. Si `group_class`: comportamiento actual byte-idéntico.

**Consistencia de la lógica de solape:** el `overlaps()` del endpoint (línea 182-186) y el del client (booking-client.tsx:287-291) usan `[inicio-buffer, fin+buffer)`; el RPC usa `tsrange &&` sin buffer. El buffer es una preferencia de UX del read-path; el RPC es la autoridad. Divergencia aceptable ya documentada (mismo caveat que la rama `any`, RESEARCH A3 histórico) — un slot límite raro cae en `slot_full` al reservar.

**¿La vista pública necesita `capacity_mode`/`capacity`?**
- Para el read-path de disponibilidad: **NO** — el endpoint usa service-role y lee `services` directo.
- Para D-13 (ocultar "Cualquiera" en el selector, Phase 10) y para que `booking-client.tsx` sepa el modo del servicio elegido: **SÍ `capacity_mode`**, vía `CREATE OR REPLACE VIEW public_services` agregando la columna al final (molde 061:59-82). `capacity_mode` es un flag de presentación (enum acotado, no PII) → está bien que viaje a anon.
- `capacity` (el N): **mantener server-side** (no exponer en la vista) para respetar el no-leak de lugares restantes. El "lleno/libre" ya lo resuelve el endpoint.

**Decisión acotada para el planner:** confirmar si `booking-client.tsx` (grid general) debe además renderizar distinto el roster/labels para simultáneo. D-11 dice que el ROSTER del ADMIN cambia (filas + "lleno"), no el grid público (el público solo ve libre/lleno). Recomendado: exponer solo `capacity_mode` en `public_services`; el grid público no necesita más.

### Q5. Test de carrera CUPO-04 (D-08) — VALIDADO, forma concreta

**Dónde vive:** `test/concurrency.test.ts` (agregar el caso junto a CONC-01/CONC-03) o archivo nuevo `test/overlap-capacity.test.ts` reusando los helpers de `test/helpers/booking-fixtures.ts`. Recomendado: mismo archivo, mismo `describe.skipIf(!hasSupabaseCreds)`, mismo tenant sembrado. [VERIFIED: test/concurrency.test.ts:1-114]

**Cómo abre conexiones concurrentes reales:** cada `createAppointmentCore` dispara un `.rpc('book_slot_atomic')` = un request HTTP separado al PostgREST/DB → transacción/conexión propia. `Promise.all([...])` lanza N+1 en paralelo. El advisory lock service-day serializa la carrera DENTRO de la DB (determinista, no flaky) — igual que CONC-01 con el lock de slot. [VERIFIED: test/concurrency.test.ts:86-114]

**Setup del fixture:** `seedOneTenant` crea un service (booking-fixtures.ts:71-77). Falta setear el modo: agregar un helper `seedSimultaneousService` o, más simple, `t.admin.from('services').update({ capacity_mode: 'simultaneous_resource', capacity: N }).eq('id', t.serviceId)`. Sembrar un `time_block` que cubra la ventana (`seedTimeBlock`, capacity irrelevante para simultáneo pero define el día); usar `professionalId` FIJO (Pitfall 1, no mezclar null/sentinel). [VERIFIED: test/helpers/booking-fixtures.ts:39-123]

**Forma del test (N=2, dur 30, escalonado con instante común):**
```
capacity = 2, duration = 30.
Tres reservas STAGGERED cuyos intervalos comparten el instante [16:20,16:30):
  A 16:00-16:30, B 16:10-16:40, C 16:20-16:50   (los 3 solapan en [16:20,16:30))
Promise.all([create A, create B, create C]) en PARALELO.
Assert: oks.length === 2  &&  fulls.length === 1  (error === 'slot_full')
Assert DURO (estado real de la DB, no los retornos):
  count(appointments del service_id, date, status ocupa, cuyo intervalo contiene 16:20) === 2   (NUNCA 3)
```
Por qué prueba la re-granularización: con el lock viejo (`biz+date+time`) los tres starts distintos tomarían locks distintos → los 3 pasarían el gate → 3 aceptados (el bug). Con el lock service-day, los tres serializan y el 3º ve `overlap=2 >= 2` → `slot_full`. Es el test que falla ANTES del fix y pasa después.

**Casos adicionales recomendados (CUPO-05 no-regresión, en la misma suite):**
- Simultáneo cap 1: 2ª reserva solapada (escalonada) → `slot_full` (o `slot_taken` por EXCLUDE 013 si `is_group=false`; asertar 409 sin sobre-reserva). Fijar la expectativa exacta según el `is_group` de cap 1.
- `group_class` cap N: CONC-01/CUPOS-03 EXISTENTES deben seguir verdes SIN cambios (byte-idéntico).
- Canchas (`test/canchas-booking.test.ts`, ALQUILER-02) y espacio compartido (CONC-03) verdes sin cambios (D-14).

## Common Pitfalls (LANDMINES)

### Pitfall 1: El re-check JS de `booking-core.ts` rechaza el solape simultáneo ANTES del RPC — CRÍTICO
**Qué sale mal:** `lib/booking-core.ts:206-218` calcula `taken = sameBucket.some(overlaps)` y `slotCapacity` desde `time_blocks`; si `taken && slotCapacity <= 1` devuelve `slot_taken`. Para un servicio `simultaneous_resource` cuyo `time_block` tiene capacity 1 (o no hay bloque grupal), `slotCapacity=1` y el 2º turno solapado dispara ese early-return → **el recurso simultáneo NUNCA se llena** (rechaza en el segundo, no en el cupo+1). [VERIFIED: lib/booking-core.ts:206-218, 149-162]
**Cómo evitar:** el `SELECT service` de la línea 95-100 debe traer también `capacity_mode, capacity`; el bloque de re-check (134-237) debe volverse mode-aware: si `capacity_mode='simultaneous_resource'`, NO aplicar el early-return por solape/`slotCapacity` (dejar que el RPC —autoridad— decida por el conteo por solape). Análogo a cómo el grupal ya se exceptúa (`slotCapacity<=1` gate existente).
**Señal temprana:** un test de "2ª reserva escalonada en simultáneo cap 2" que vuelve `slot_taken` en vez de `ok`.

### Pitfall 2: `is_group` no ampliado al modo simultáneo → EXCLUDE 013 bloquea los solapes legales
**Qué sale mal:** si la fila simultánea cap>1 nace con `is_group=false` (lógica vieja `v_tb_capacity>1`), el EXCLUDE gist 013 (activo para `NOT is_group`) rechaza el 2º turno solapado del mismo bucket con 23P01 → el cupo nunca se llena. [VERIFIED: 041:67-76]
**Cómo evitar:** `v_is_group := (v_svc_cap > 1)` en la rama simultánea (Q2).

### Pitfall 3: Mezclar la fuente de capacity entre modos
**Qué sale mal:** leer `services.capacity` para group_class (rompe yoga 16:00=10 / 18:00=15) o `time_blocks.capacity` para simultáneo (no expresa camilla=2 vs gimnasio en la misma franja). [VERIFIED: CONTEXT D-02]
**Cómo evitar:** cada rama lee SOLO su fuente (`v_svc_cap` simultáneo, `v_capacity` de `time_blocks` grupal).

### Pitfall 4: "Cualquiera" + simultáneo (D-13) no gateado
**Qué sale mal:** la selección "cualquiera" (058:88-137) marca ocupado a quien tenga CUALQUIER turno solapado → no sabe usar la 2ª camilla; si el selector público no lo oculta, el cliente ve "Cualquiera" y recibe rechazos raros. [VERIFIED: 058:106-118]
**Cómo evitar:** Phase 10 selector oculta "Cualquiera" para `capacity_mode='simultaneous_resource'` (necesita `capacity_mode` en `public_services`, Q4). El RPC es seguro aunque llegue (over-serializa; el candidato libre puede no existir → `slot_taken`), pero es un combo no soportado en v1.

### Pitfall 5: Canchas regresión (D-14)
**Qué sale mal:** si el default de `capacity_mode` no fuera `'group_class'`, las canchas (que usan `services` con precio/duración, 043) cambiarían de semántica. [VERIFIED: CONTEXT D-14, 044 public_canchas]
**Cómo evitar:** `DEFAULT 'group_class'` cubre canchas existentes y nuevas; `services.capacity` (default 1) no las afecta; la rama `group_class` es byte-idéntica. Verificar `canchas-booking.test.ts` verde.

### Pitfall 6: Olvidar el `NOTIFY pgrst` / regenerar schema.sql
**Qué sale mal:** PostgREST cachea el schema; sin `NOTIFY pgrst, 'reload schema'` tras el DDL, el `.rpc()` puede no ver las columnas nuevas / la firma. [VERIFIED: 061:94]
**Cómo evitar:** incluir el `NOTIFY` al final de 062 y regenerar `supabase/schema.sql`.

## Code Examples

### Predicado de solape canónico (reusar tal cual)
```sql
-- Source: supabase/migrations/042_spaces_and_coupled_exclusion.sql:190-191 (idéntico a EXCLUDE 013)
tsrange(a.date + a.time, a.date + a.time + make_interval(mins => COALESCE(a.duration_minutes, 30)))
  && tsrange(p_date + p_time, p_date + p_time + make_interval(mins => p_duration))
```

### CHECK idempotente del enum (molde)
```sql
-- Source: supabase/migrations/055_abono_window_bounds.sql:51-64
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conname='services_capacity_mode_chk' AND conrelid='"public"."services"'::regclass) THEN
    ALTER TABLE "public"."services" ADD CONSTRAINT "services_capacity_mode_chk"
      CHECK ("capacity_mode" IN ('group_class','simultaneous_resource'));
  END IF;
END $$;
```

### Test de carrera (molde CONC-01)
```ts
// Source: test/concurrency.test.ts:93-114 (adaptar a N+1 escalonado / slot_full)
const [a, b, c] = await Promise.all([
  createAppointmentCore({ ...baseInput(), time: '16:00' }),
  createAppointmentCore({ ...baseInput(), time: '16:10' }),
  createAppointmentCore({ ...baseInput(), time: '16:20' }),
])
expect([a,b,c].filter(r => r.ok).length).toBe(2)
expect([a,b,c].filter(r => !r.ok && r.error === 'slot_full').length).toBe(1)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Cupo contado por `date+time` exacto para TODO | Cupo por `tsrange &&` overlap cuando `capacity_mode='simultaneous_resource'` | Phase 12 (062) | Corrige el sobrecupo de recursos escalonados (camillas) manteniendo grupal intacto |
| Advisory lock siempre `biz+date+time` | Lock `biz+service_id+date` para simultáneo | Phase 12 (062) | Serializa la carrera del conjunto correcto (servicio-día) |

**Deprecated/outdated:** nada se deprecia — el modo `group_class` es el default y queda 100% vigente. El cambio es ADITIVO y coexistente.

## Validation Architecture

> `workflow.nyquist_validation` no está en `false` → sección incluida. CUPO-04 exige test de propiedad/carrera contra la DB (LOCKED D-08).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.9 |
| Config file | `vitest.config.*` (existe; los tests contra la DB corren con `describe.skipIf(!hasSupabaseCreds)`) |
| Quick run command | `npm run test` (= `vitest run`) |
| Full suite command | `npm run test` |
| Requisito de entorno | `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` apuntando al Supabase LOCAL (tras `supabase db reset` con 040..062) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CUPO-04 | N+1 escalonadas concurrentes sobre cupo N ⇒ nunca > N | concurrency (DB real) | `npm run test` → `test/concurrency.test.ts` (caso CUPO-04) | ❌ Wave 0 (nuevo caso) |
| CUPO-02 | 2ª+ solapada rechazada por `slot_full` en simultáneo | integration (DB) | idem | ❌ Wave 0 |
| CUPO-03 | grupal cuenta por hora exacta (sin cambios) | regression | `test/concurrency.test.ts` CONC-01/CUPOS-03 EXISTENTES | ✅ (no debe cambiar) |
| CUPO-05 | cupo 1, canchas, abonos, multi-staff, espacio: sin regresión | regression | `test/concurrency.test.ts` (CONC-01/02/03, ALQUILER-02) + `test/canchas-booking.test.ts` + `test/staff-assignment.test.ts` | ✅ (deben seguir verdes) |
| CUPO-01 | flag persistido desde el panel | manual/UAT | editor `/servicios` (checkpoint humano) | manual |

### Sampling Rate
- **Per task commit:** `npm run test` (subset del motor: concurrency + booking-core + canchas + staff-assignment).
- **Per wave merge:** `npm run test` completo (283+ tests actuales deben quedar verdes).
- **Phase gate:** suite completa verde + `supabase db reset` local aplica 062 sin error + secure-phase (obligatorio).

### Wave 0 Gaps
- [ ] Helper de fixture para setear `capacity_mode='simultaneous_resource'` + `capacity` en el service sembrado (o `t.admin.from('services').update(...)`).
- [ ] Caso CUPO-04 (N+1 escalonado) en `test/concurrency.test.ts`.
- [ ] Caso simultáneo cap 1 (no-regresión) + caso CUPO-02 (`slot_full` por solape).
- [ ] Framework install: NINGUNO — Vitest ya presente.

## Security Domain

> `security_enforcement` habilitado (default). **secure-phase OBLIGATORIO** — modifica el núcleo `SECURITY DEFINER` compartido por 4 consumidores.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control (tenant isolation) | yes | `book_slot_atomic` es `SECURITY DEFINER` → RLS NO protege adentro; TODA query nueva filtra por `business_id = p_business_id` explícito (D-07). El `SELECT capacity_mode FROM services` se re-valida por `business_id`. Nunca confiar en IDs del cliente (anti-tampering ya en core:95-100). [skill supabase-multitenant-rls] |
| V5 Input Validation | yes | CHECK del enum `capacity_mode` fail-closed a nivel DB (el panel anon+RLS PostgREST no puede meter un valor fuera del enum); CHECK `capacity >= 1`. Molde 055/061. |
| V6 Cryptography | no | — |
| Concurrency integrity (no ASVS estándar, core del proyecto) | yes | `pg_advisory_xact_lock` antes de todo count; test de carrera real (CUPO-04). Prohibido `count` suelto. |

### Known Threat Patterns for este stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Sobrecupo por carrera TOCTOU (staggered) | Tampering / DoS de integridad | Lock service-day + gate por solape en la misma transacción (Q1/Q2); verificado por CUPO-04 |
| Cross-tenant vía `service_id` ajeno en el RPC | Elevation / Info Disclosure | `SELECT ... WHERE service_id=p_service_id AND business_id=p_business_id`; core ya valida el service por business (95-100) |
| Fuga de "lugares restantes" al público | Info Disclosure | Read-path devuelve booleano-por-slot en `full` (no counts); `capacity` NO se expone en `public_services` (D-06/D-12) |
| Escritura de `capacity_mode` fuera del enum desde el panel | Tampering | CHECK constraint fail-closed (V5) |
| Regresión que degrada `slot_full`/`slot_taken` en los 4 callers | Tampering de integridad | Rama `group_class` byte-idéntica + tests de regresión CUPO-05 |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `services.capacity` como `smallint` (mismo tipo que `time_blocks.capacity`, 041:43) | Q3 | Bajo — si se prefiere `int`, cambiar el tipo; el CHECK `>=1` no cambia |
| A2 | El client puede pasar `serviceId` en la rama específica de availability sin romper el camino actual (query aditiva) | Q4 | Bajo — es aditivo; si no se pasa, el endpoint cae al comportamiento group_class (default), backstop = RPC |
| A3 | Exponer solo `capacity_mode` (no `capacity`) en `public_services` alcanza para D-13 | Q4 | Medio — si el grid público necesitara el N, habría que decidir el no-leak; recomendación conservadora ya dada |
| A4 | Para simultáneo cap 1, `is_group=false` (EXCLUDE 013 hace el trabajo) es aceptable | Q2 | Bajo — alternativa: forzar `is_group=true` y confiar solo en el count; ambas correctas, elegir en plan |

**Nota:** ninguna de estas assumptions bloquea el diseño; son decisiones finas de implementación que el planner/discuss puede confirmar. No hay claims sobre compliance/retención/seguridad basados en conocimiento no verificado.

## Project Constraints (from CLAUDE.md / AGENTS.md)
- **Next.js 16, NO 14:** middleware = `proxy.ts`; consultar `node_modules/next/dist/docs/` antes de asumir comportamiento. (No afecta esta fase — el route handler de availability ya existe con la convención correcta.)
- **Aislamiento por tenant NO negociable:** toda query/policy/route que toque datos de un negocio garantiza `business_id` (RLS + explícito en `SECURITY DEFINER`).
- **Migraciones SQL numeradas** en `supabase/migrations/`, aplicadas A MANO en orden; 062 coordinada con el deploy; validación local = `supabase db reset`.
- **Vercel Hobby:** cron diario máximo — no aplica (sin crons nuevos).
- **Dev env Windows + PowerShell.**
- **Skills obligatorias:** `supabase-multitenant-rls` (tenant en columna/RPC nuevos), `convenciones-forjo` (stack/naming/migraciones).

## Sources

### Primary (HIGH confidence)
- `supabase/migrations/058_professional_auto_assignment.sql` — cuerpo VIGENTE del RPC (lock, selección "cualquiera", count exacto, seat, espacio).
- `supabase/migrations/041_time_blocks_capacity_and_seat.sql` — capacity, seat/is_group, índice 011, EXCLUDE 013, 1ª versión RPC.
- `supabase/migrations/042_spaces_and_coupled_exclusion.sql` — locks por espacio ascendente, `tsrange &&`, backstop `appointment_spaces`.
- `lib/booking-core.ts` — core de los 4 callers; re-check JS (landmine); mapeo de errores RPC→slot_full/slot_taken.
- `app/api/booking/availability/route.ts` — read-path actual (rama `any` + específica); patrón para D-12.
- `test/concurrency.test.ts` — CONC-01/CONC-03/ALQUILER-02, molde de CUPO-04.
- `test/helpers/booking-fixtures.ts` — `seedOneTenant`/`seedTimeBlock`, base del fixture simultáneo.
- `supabase/migrations/055_abono_window_bounds.sql` / `061_public_selector_default.sql` — molde de columna + CHECK idempotente + `NOTIFY pgrst` + REPLACE de vista.
- `12-CONTEXT.md`, `REQUIREMENTS.md`, `ROADMAP.md` §Phase 12 — decisiones locked D-01..D-14, CUPO-01..05.

### Secondary (MEDIUM confidence)
- [CITED: postgresql.org/docs] Advisory lock functions (`pg_advisory_xact_lock`, forma bigint, liberación al fin de xact); `hashtextextended` returns bigint; `tsrange && tsrange` overlap operator. Consistente con el uso ya validado en 041/042/058.

### Tertiary (LOW confidence)
- Ninguna. Todos los hallazgos están respaldados por código del repo o por semántica estándar de Postgres ya en uso en el proyecto.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — sin paquetes nuevos; todo verificado en `package.json` y el código.
- Architecture (lock + overlap + migración): HIGH — validado línea por línea contra 041/042/058 y semántica de Postgres.
- Pitfalls: HIGH — el landmine del re-check JS y el de `is_group` están confirmados en el código (booking-core.ts:206-218, 041:67-76).
- Read-path D-12: MEDIUM — la mecánica es clara; queda una decisión fina (qué exponer en `public_services`) acotada en A3.

**Research date:** 2026-07-29
**Valid until:** 2026-08-28 (stack estable; re-validar si se aplica alguna migración 062+ antes de planificar).
