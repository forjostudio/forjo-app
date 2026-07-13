# Phase 2: Cupos Grupales - Research

**Researched:** 2026-06-26
**Domain:** Postgres concurrency / atomic anti-overbooking · capacity-aware integrity constraints · Supabase RLS · Next.js 16 booking pipeline · Vitest integration testing
**Confidence:** HIGH (todo verificado leyendo el código actual del repo; cero dependencias nuevas)

## Summary

Esta fase agrega `capacity` (default 1) a `time_blocks` y redefine el respaldo atómico anti-doble-booking para que admita hasta N filas por slot **sin** regresión para `capacity = 1`. La ingeniería real está en la concurrencia: el `count < capacity` no puede hacerse con un SELECT suelto + INSERT desde el cliente JS porque entre ambos hay una ventana de carrera. La garantía atómica de hoy (índice único 011 + EXCLUDE gist 013) está construida para "1 fila por slot" y **no se puede expresar "hasta N" con un EXCLUDE gist** de forma natural.

**Hallazgo clave de arquitectura:** `time_blocks` es la **plantilla semanal recurrente** (`day_of_week`, `start_time`, `end_time`) — NO una fila por slot reservable. `capacity` vive en la plantilla y aplica a **todos** los slots generados dentro de la ventana de ese bloque. La ocupación viva se cuenta sobre la tabla `appointments` (no sobre `time_blocks`). El re-check JS de `lib/booking-core.ts` y el endpoint `availability` ya cuentan filas de `appointments`; la lógica nueva es "contar filas en el mismo slot vs `capacity`" en vez de "¿existe alguna?".

**Primary recommendation:** Mecanismo atómico = **función Postgres `SECURITY DEFINER` invocada con `supabase.rpc()`** que, dentro de una sola transacción, toma un **advisory lock por slot** (`pg_advisory_xact_lock(hashtext(bucket-key))`), cuenta los ocupantes y hace el INSERT condicional, devolviendo `slot_full` si ya hay `capacity` filas. Constraint redefinida = **reemplazar el índice único 011 y el EXCLUDE gist 013 por una columna `seat smallint` + un nuevo índice único `(business_id, COALESCE(professional_id, sentinela), date, time, seat)`** donde el RPC asigna `seat` atómicamente como `0..capacity-1`. Para `capacity = 1` solo existe `seat = 0` → el índice vuelve a ser efectivamente "1 fila por slot" → cero regresión, y el INSERT del seat duplicado choca con `23505` como hoy. Esta opción es la de **menor riesgo sobre el core endurecido**: el respaldo atómico de la DB se mantiene (un índice único, no un `count` suelto), y el advisory lock serializa solo el slot peleado.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 — Capacidad genérica del slot.** `time_blocks` solo gana `capacity` (default 1); el `label` existente nombra la clase. El público sigue eligiendo servicio como hoy — NO se ata el bloque a un `service_id`. El cupo cuenta **todos** los turnos que caen en ese slot contra `capacity`, sin importar el servicio.
- **D-02 — Capacity sobre el modelo actual.** Se decide el modelo conceptual ahora (agenda = profesional/`time_block` con `capacity`) pero NO se crea una abstracción `resource`/`agenda` genérica. Phase 3 agrega espacios físicos ENCIMA sin re-migrar `capacity`. El profesional sigue siendo el eje (incluida la sentinela `00000000-...`).
- **D-03 — Duración fija del bloque.** La clase grupal es un bloque con inicio/fin fijos; todos los inscriptos comparten el mismo `date` + `time`. Ocupación = `count(turnos en el slot con status confirmed/pending_payment) < capacity`. Habilita el chequeo atómico limpio por slot.
- **D-04 — Roster: click en slot grupal → drawer (mobile) / panel (desktop).** Contador (8/15) + lista de inscriptos (nombre, contacto, estado). Reusa `agenda-client.tsx` + shadcn/`vaul` ya presentes — NO librería nueva.
- **D-05 — Seña por servicio**, independiente de individual/grupal. No se agrega pricing ni lógica de seña nueva por capacidad.
- **D-06 — Público ve "disponible" hasta `count >= capacity`** ("lleno"). **NUNCA** expone cuántos lugares quedan. `/api/booking/availability` cuenta por slot vs `capacity` y devuelve solo libre/lleno.

### Claude's Discretion (técnico — LOCKED como atómico por roadmap/STATE)
- **Mecanismo atómico anti-sobrecupo (CONC-01):** lock por slot / `SELECT … FOR UPDATE` / serializable / contador con check — la forma exacta la define research/planner. **LOCKED:** chequeo atómico deliberado, **nunca un `count` suelto sin lock**. El re-check JS sigue siendo solo UX; la garantía real es la DB.
- **Redefinición de constraints 011/013 a capacity-aware:** cómo se keya la ocupación (columna `seat`/posición que vuelva único el índice, o reemplazo del índice por el chequeo atómico) es discreción de research/planner.
- **Migración de `capacity`:** aditiva (default 1), RLS habilitada + policies por operación con `with check (business_id = ...)`; no expone capacidad/roster a `anon`. Numeración post-baseline con underscore (`041_...`). Validar con `supabase db reset` local antes de prod.
- **Validación de entrada y errores:** mismo estilo defensivo; sumar `slot_full` (409) al mapeo junto a `slot_taken`.
- **Reúso del core:** el chequeo atómico + insert vive en `lib/booking-core.ts` (`createAppointmentCore`), reusado por público (service-role) y alta manual autenticada de Phase 1.

### Deferred Ideas (OUT OF SCOPE)
- Bloque atado a `service_id` (timetable real de clases) — descartado en D-01.
- Abstracción `resource`/`agenda` genérica — diferida a Phase 3.
- Estrategia Google Calendar para clases grupales (GCAL-GROUP-01) — v2.
- Waitlist (WAIT-01) y re-apertura del lugar al cancelar (CANCEL-REOPEN-01) — v2. El MVP es "disponible hasta llenarse".

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CUPOS-01 | Cupo (capacity) por bloque en el editor de agenda; default 1 | Migración 041 agrega `capacity smallint NOT NULL DEFAULT 1` a `time_blocks`; campo en `settings-client.tsx` (editor de horarios) + tipo en `lib/types.ts` |
| CUPOS-02 | Público "disponible" hasta llenar el cupo, sin exponer lugares restantes | `availability` agrupa busy por slot-start, devuelve solo `full: true/false` por slot — NUNCA el count (ver §Availability + non-leak) |
| CUPOS-03 | Admite hasta `capacity`, rechaza el excedente con `slot_full`; anti-sobrecupo atómico bajo concurrencia | RPC `SECURITY DEFINER` con `pg_advisory_xact_lock` por slot + INSERT condicional; nuevo error `slot_full` (409) en el core y ambos callers |
| CUPOS-04 | Admin: contador de ocupación (8/15) + roster en la agenda | Query en `agenda-client.tsx` (ya carga `appointments` + `time_blocks` por `business_id`); drawer `vaul`/panel shadcn (D-04) |
| CUPOS-05 | Seña por servicio, independiente de individual/grupal | Sin cambios — el flag `require_deposit`/`deposit_amount` del negocio + el servicio siguen rigiendo `requireDeposit` en el core; no se toca |
| CONC-01 | Test Vitest anti-sobrecupo concurrente: dos reservas sobre el último lugar, solo una confirma | `Promise.all` de dos `supabase.rpc()` paralelas contra Supabase local; asertar exactamente 1 ok + 1 `slot_full` (ver §Validation Architecture) |
| CONC-02 | Test no-regresión: capacity=1 sigue rechazando la 2ª con `slot_taken` | Extiende `booking-core.test.ts` Test B/D con un bloque capacity=1; el 2º choca con el índice único de seat → `slot_taken` |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Garantía atómica anti-sobrecupo | Database (Postgres RPC + advisory lock + índice único seat) | — | El único lugar donde la atomicidad es real; el JS no puede serializar la carrera |
| Conteo de ocupación vs capacity | Database (RPC) + API (`availability`) | — | El RPC decide en el alta; `availability` lo refleja para la UI pública |
| Anti-tampering de tenant (service/professional/location por `business_id`) | API / Core (`booking-core.ts`) | Database (RLS) | Ya existe; el RPC debe heredar el filtro por `business_id` resuelto por el caller |
| Capacity por bloque (config) | Database (`time_blocks.capacity`) + Dashboard (`settings-client.tsx`) | — | Plantilla semanal; dato editable del dueño |
| Roster + contador (admin) | Dashboard (`agenda-client.tsx`) | API/RLS | Dato exclusivo del admin; corre con sesión anon+RLS del dueño |
| "Disponible/lleno" sin lugares restantes | API (`availability`, service-role) | Client (`booking-client.tsx`) | El público NO lee `appointments` (RLS); el endpoint colapsa el count a un booleano |

## Standard Stack

**Sin dependencias nuevas.** Esta fase NO instala paquetes. Todo lo necesario ya está en el repo o en Postgres:

| Capacidad | Mecanismo | Ya disponible | Evidencia |
|-----------|-----------|---------------|-----------|
| Advisory lock / EXCLUDE / índices | Postgres nativo + `btree_gist` | ✓ | `btree_gist` extensión ya creada `[VERIFIED: codebase]` (`baseline.sql:20`) |
| RPC desde JS | `supabase.rpc('fn', {...})` | ✓ | `@supabase/supabase-js ^2.106.2` (`.claude/CLAUDE.md`) |
| Migraciones | SQL numerado post-baseline (underscore) + `supabase db reset` local | ✓ | `040_appointments_clients_insert_with_check.sql` `[VERIFIED: codebase]` |
| Tests de concurrencia | Vitest + Supabase local + helpers de fixtures | ✓ | `vitest.config.mts`, `test/helpers/booking-fixtures.ts` `[VERIFIED: codebase]` |
| Drawer/panel del roster | `vaul` + shadcn/`@/components/ui` | ✓ | D-04 / `.claude/CLAUDE.md` |

> **No se incluye `## Package Legitimacy Audit`**: esta fase no instala paquetes externos. `btree_gist` es una extensión nativa de Postgres ya habilitada.

## Current Integrity Baseline (leído antes de proponer cambios)

### Constraint 011 — índice único parcial `[VERIFIED: codebase]` (`baseline.sql:797`)
```sql
CREATE UNIQUE INDEX "appointments_no_double_booking"
  ON "public"."appointments" USING "btree"
  ("business_id", COALESCE("professional_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "date", "time")
  WHERE ("status" = ANY (ARRAY['confirmed'::"text", 'pending_payment'::"text"]));
```
Rechaza dos filas con el mismo `(business_id, bucket-profesional, date, time)` en estados que ocupan. Violación → `23505`.

### Constraint 013 — EXCLUDE gist por solapamiento `[VERIFIED: codebase]` (`baseline.sql:649`)
```sql
ALTER TABLE ONLY "public"."appointments"
  ADD CONSTRAINT "appointments_no_overlap" EXCLUDE USING "gist" (
    "business_id" WITH =,
    COALESCE("professional_id", '00000000-0000-0000-0000-000000000000'::"uuid") WITH =,
    "tsrange"(("date" + "time"), (("date" + "time") + "make_interval"("mins" => COALESCE("duration_minutes", 30)))) WITH &&
  ) WHERE (("status" = ANY (ARRAY['confirmed'::"text", 'pending_payment'::"text"])));
```
Rechaza dos filas del mismo bucket cuyos rangos `[inicio, fin)` se solapan (no solo inicio exacto). Violación → `23P01`. **Este es el constraint difícil**: un EXCLUDE gist no puede expresar "hasta N solapes" de forma natural.

### Core `createAppointmentCore` `[VERIFIED: codebase]` (`lib/booking-core.ts:63-223`)
- Re-valida `service`/`professional`/`location` por `business_id` (anti-tampering) — líneas 83-104, 164-179.
- Re-check de solapamiento en JS (UX-only): trae `appointments` del día (`confirmed`/`pending_payment`), filtra por bucket `COALESCE(professional_id, SENTINEL)` y solapamiento con buffer; si `taken` → `slot_taken` (409) — líneas 113-134.
- Libera holds vencidos (pending_payment con `expires_at` pasado) actualizándolos a `cancelled` — líneas 141-153.
- INSERT directo vía `supabase.from('appointments').insert(...)` — líneas 184-203. **NO usa transacciones explícitas ni RPC hoy.**
- Traducción de constraint: `insertErr?.code === '23505' || '23P01'` → `slot_taken` (409) — líneas 205-212. Este es el respaldo atómico real.
- Tipo de retorno error actual: `'invalid_service' | 'invalid_professional' | 'slot_taken' | 'insert_failed'` con status `400 | 409 | 500` — línea 61.

### Caller público `[VERIFIED: codebase]` (`app/api/booking/create/route.ts:91-109`)
Llama `createAppointmentCore` con service-role (tenant por slug), mapea `result.error` → `Response.json({ ok:false, error: result.error }, { status: result.status })` (línea 108). **El mapeo es genérico**: cualquier error nuevo del core se propaga tal cual → `slot_full` se propaga sin tocar este archivo (más allá de actualizar mensajes/UX si se desea).

### Caller manual `[VERIFIED: codebase]` (`app/api/appointments/create/route.ts:73-90`)
Igual patrón: `resolveClientId` (dedupe) → core → `Response.json({ ok:false, error: result.error }, { status: result.status })` (línea 89). Hereda `slot_full` automáticamente.

### Availability `[VERIFIED: codebase]` (`app/api/booking/availability/route.ts:37-59`)
- Trae `appointments` (`time, status, expires_at, professional_id, duration_minutes`) del negocio+fecha en `confirmed`/`pending_payment` — líneas 37-42.
- Filtra por bucket (`COALESCE(professional_id, SENTINEL)`), descarta holds vencidos — líneas 52-56.
- **Devuelve `busy: [{ time, status, expires_at, duration_minutes }]`** — línea 57. NO expone `professional_id` ni datos del cliente. **Hoy NO hay noción de count**: cualquier slot con ≥1 busy se marca ocupado en el client.

### Public booking client `[VERIFIED: codebase]` (`app/[slug]/booking-client.tsx:233-253`)
Genera la grilla de slots desde `time_blocks` (`start_time`→`end_time` por pasos de `duration`), y marca un slot ocupado si **algún** `busy` se solapa (líneas 241-246). Para capacity-aware esto debe cambiar a "ocupado si el endpoint dice `full`" (la lógica de count vive en el server, no en el client — ver §Availability non-leak).

> **Modelo de datos crítico:** `time_blocks` = plantilla semanal `[VERIFIED: codebase]` (`baseline.sql:633-642`): `day_of_week`, `start_time`, `end_time`, `label`, `location_id`. NO tiene `date`/`time`. Los constraints 011/013 viven en `appointments` (que sí tiene `date`/`time`). `capacity` en `time_blocks` aplica a todos los slots de la ventana del bloque; la ocupación se cuenta en `appointments`.

## Architecture Patterns

### System Architecture Diagram (flujo de alta grupal anti-sobrecupo)

```
  [Cliente público]                          [Dueño autenticado]
   booking-client.tsx                         nuevo-turno-form.tsx
        │                                            │
        ▼                                            ▼
  POST /api/booking/create                  POST /api/appointments/create
   (service-role, tenant=slug)               (anon+RLS, tenant=owner_id)
        │   reCAPTCHA, plan gate                     │   auth gate, dedupe cliente
        └───────────────┬────────────────────────────┘
                        ▼
              createAppointmentCore (lib/booking-core.ts)
                · anti-tampering service/pro/location por business_id
                · re-check JS de cupo (UX) → ¿count < capacity?
                        │
                        ▼  (en vez del INSERT directo de hoy)
              supabase.rpc('book_slot_atomic', {...})   ◄── GARANTÍA ATÓMICA
                        │
        ┌───────────────▼─────────────────────────────────┐
        │  Postgres fn SECURITY DEFINER (1 transacción):   │
        │   1. pg_advisory_xact_lock(hash del slot+bucket) │  serializa solo este slot
        │   2. SELECT count(*) ocupantes del slot          │
        │   3. IF count >= capacity → RAISE 'slot_full'    │
        │   4. seat := count  ; INSERT con seat            │
        │   5. índice único (..., seat) = respaldo atómico │  rechaza si dos compiten el seat
        └──────────────────────────────────────────────────┘
                        │
            ok → appointmentId / cancelToken      error → 'slot_full' (409) | 'slot_taken' (409)
```

### Pattern 1: Función Postgres atómica invocada por `supabase.rpc()` (RECOMENDADO)
**What:** Una función `SECURITY DEFINER` que encapsula lock + count + insert en una sola transacción server-side. El JS client la invoca con `supabase.rpc('book_slot_atomic', { p_business_id, p_professional_id, p_service_id, p_location_id, p_date, p_time, p_duration, p_client_id, ..., p_status, p_expires_at })`.
**When to use:** Siempre que el alta necesite garantía atómica que el JS no puede dar (no hay `BEGIN/COMMIT` explícito desde el client de Supabase — cada `.insert()` es su propia transacción autocommit).
**Por qué `SECURITY DEFINER`:** el caller manual usa anon+RLS (sesión del dueño). La función corre con los privilegios del owner de la función, pero **debe re-imponer el aislamiento por tenant internamente** (recibir `business_id` ya resuelto por el caller y filtrar todo por él — igual que hace el core hoy). El caller público usa service-role (ya bypassa RLS).
**Example (forma del DDL — el planner ajusta firma exacta):**
```sql
-- Source: patrón estándar de advisory-lock-then-insert (Postgres docs: pg_advisory_xact_lock)
-- [CITED: postgresql.org/docs/current/functions-admin.html#FUNCTIONS-ADVISORY-LOCKS]
CREATE OR REPLACE FUNCTION public.book_slot_atomic(
  p_business_id uuid, p_professional_id uuid, p_service_id uuid, p_location_id uuid,
  p_date date, p_time time, p_duration int, p_client_id uuid,
  p_client_name text, p_client_phone text, p_client_email text, p_notes text,
  p_status text, p_expires_at timestamptz
) RETURNS TABLE (id uuid, cancel_token text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_bucket uuid := COALESCE(p_professional_id, '00000000-0000-0000-0000-000000000000'::uuid);
  v_capacity int;
  v_occupied int;
  v_seat smallint;
BEGIN
  -- 1. Lock por slot+bucket: serializa SOLO las reservas que pelean este mismo slot.
  --    hashtextextended de la clave estable del slot → bigint para el advisory lock.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_business_id::text || v_bucket::text || p_date::text || p_time::text, 0));

  -- 2. Capacity del bloque que cubre este slot (plantilla semanal). Si no hay bloque, default 1.
  --    (El planner decide el join exacto time_block→slot por day_of_week + ventana + location.)
  SELECT COALESCE(MAX(tb.capacity), 1) INTO v_capacity
  FROM time_blocks tb
  WHERE tb.business_id = p_business_id
    AND tb.day_of_week = EXTRACT(dow FROM p_date)
    AND p_time >= tb.start_time AND p_time < tb.end_time;

  -- 3. Ocupantes actuales del slot (mismo bucket, mismo inicio, estados que ocupan,
  --    holds vencidos ya liberados por el core antes del rpc).
  SELECT count(*) INTO v_occupied
  FROM appointments a
  WHERE a.business_id = p_business_id
    AND COALESCE(a.professional_id, '00000000-0000-0000-0000-000000000000'::uuid) = v_bucket
    AND a.date = p_date AND a.time = p_time
    AND a.status IN ('confirmed','pending_payment');

  IF v_occupied >= v_capacity THEN
    RAISE EXCEPTION 'slot_full' USING ERRCODE = 'P0001';
  END IF;

  v_seat := v_occupied;  -- asigna el primer asiento libre 0..capacity-1
  RETURN QUERY
  INSERT INTO appointments (business_id, client_id, client_name, client_phone, client_email,
      service_id, professional_id, location_id, date, time, duration_minutes, seat, notes, status, expires_at)
  VALUES (p_business_id, p_client_id, p_client_name, p_client_phone, p_client_email,
      p_service_id, p_professional_id, p_location_id, p_date, p_time, p_duration, v_seat, p_notes, p_status, p_expires_at)
  RETURNING appointments.id, appointments.cancel_token;
END $$;
```
**Manejo del resultado en `booking-core.ts`:** reemplazar el `supabase.from('appointments').insert(...)` (líneas 184-203) por `supabase.rpc('book_slot_atomic', {...})`. Mapear:
- error con `message`/`code` que indique `slot_full` → `{ ok:false, error:'slot_full', status:409 }`
- `23505` (índice único de seat — dos requests compiten el mismo seat aunque el advisory lock debería prevenirlo: cinturón + tirantes) → `slot_taken` (capacity=1) o `slot_full` (capacity>1). **Recomendación: con el advisory lock, este choque casi no ocurre; mapearlo a `slot_full` si capacity>1, `slot_taken` si capacity=1.** El planner decide si distingue por capacity o colapsa a un solo código.

### Pattern 2: Columna `seat` que mantiene el índice único (REDEFINICIÓN de 011)
**What:** Agregar `seat smallint NOT NULL DEFAULT 0` a `appointments`. Reemplazar el índice 011 por:
```sql
DROP INDEX IF EXISTS appointments_no_double_booking;
CREATE UNIQUE INDEX appointments_no_double_booking
  ON appointments USING btree
  (business_id, COALESCE(professional_id, '00000000-0000-0000-0000-000000000000'::uuid), date, time, seat)
  WHERE (status = ANY (ARRAY['confirmed','pending_payment']));
```
**Cero regresión para capacity=1:** solo se asigna `seat = 0`, así que el índice rechaza la 2ª fila igual que hoy → `23505` → `slot_taken`. Para capacity=N, los seats 0..N-1 son únicos entre sí; la fila N+1 reusaría un seat ya tomado → `23505` (respaldo atómico si el advisory lock fallara).
**El profesional NO se bloquea a sí mismo:** N filas con el mismo `(business_id, professional_id, date, time)` pero distinto `seat` son válidas → permite la clase grupal del profesor con sus inscriptos (caso ancla brief §1, CONTEXT §specifics).

### Pattern 3: Qué hacer con el EXCLUDE gist 013 (decisión crítica)
El EXCLUDE gist **no puede expresar "hasta N solapes"**. Como D-03 fija duración del bloque (todos los inscriptos comparten `date`+`time` exacto, no solapes variables), el solapamiento dentro de un slot grupal es siempre "mismo rango exacto", que el índice único de seat ya cubre. **Recomendación:** para capacity>1 el EXCLUDE gist debe dejar de aplicar; para capacity=1 debe seguir protegiendo el anti-solape (turnos de duración variable que se pisan parcialmente). Opciones:
- **(A) RECOMENDADA — EXCLUDE gist condicional a capacity=1:** redefinir el constraint con un `WHERE` que lo limite a filas cuyo bloque tiene capacity=1. Problema: el EXCLUDE no puede hacer join a `time_blocks` en su predicado. Solución práctica: **desnormalizar** — copiar `capacity` (o un booleano `is_group`) a la fila de `appointments` en el INSERT (lo hace el RPC, que ya conoce la capacity), y hacer el EXCLUDE `WHERE (status IN (...) AND NOT is_group)`. Así capacity=1 conserva el anti-solape por rango (013 intacto, cero regresión) y capacity>1 lo evita.
- **(B) Reemplazar el EXCLUDE por chequeo en el RPC:** el RPC ya cuenta ocupantes del slot exacto; para capacity=1 con duración variable, el re-check de solapamiento del core (JS) + el índice único de seat cubren el inicio exacto, pero **NO** el solape parcial de turnos de distinta duración que el gist sí atrapa hoy. **Riesgo de regresión** → descartar B salvo que el planner confirme que todos los turnos del bucket comparten duración.

**Veredicto:** Opción A (EXCLUDE condicional vía columna desnormalizada `is_group`/`capacity` en `appointments`) es la de menor riesgo: mantiene 013 *intacto en comportamiento* para el caso 1-turno-por-slot (cero regresión, CONC-02) y solo lo desactiva donde el cupo lo exige. El planner debe verificar el `WHERE` exacto contra `supabase db reset` local.

### Recommended Project Structure (archivos tocados)
```
supabase/migrations/
  041_time_blocks_capacity_and_seat.sql   # capacity en time_blocks + seat/is_group en appointments
                                          # + redefinir índice 011 (seat) + EXCLUDE 013 (condicional)
                                          # + función book_slot_atomic + GRANT EXECUTE + RLS preservada
lib/
  booking-core.ts                         # INSERT directo → supabase.rpc('book_slot_atomic'); +slot_full al tipo
  types.ts                                # +capacity al tipo del time_block; +seat (opcional) a Appointment
app/api/booking/availability/route.ts     # count por slot vs capacity → solo full:true/false (D-06)
app/[slug]/booking-client.tsx             # marca slot ocupado por "full" del endpoint, no por overlap suelto
app/(dashboard)/settings/settings-client.tsx  # campo "cupo" por bloque (CUPOS-01)
app/(dashboard)/agenda/agenda-client.tsx  # contador 8/15 + roster drawer/panel (CUPOS-04, D-04)
test/
  concurrency.test.ts                     # CONC-01 (anti-sobrecupo) + CONC-02 (no-regresión cupo 1)
```

### Anti-Patterns to Avoid
- **`count` suelto + `.insert()` desde el JS client.** Es exactamente lo que el LOCKED prohíbe: entre el SELECT y el INSERT dos requests ven el mismo count y ambos insertan → sobrecupo. El advisory lock dentro del RPC cierra la ventana.
- **Hacer el INSERT condicional con `WHERE NOT EXISTS` sin lock.** Postgres no serializa lectores bajo READ COMMITTED; dos `INSERT ... SELECT WHERE count < capacity` concurrentes pueden ambos pasar. Hace falta el advisory lock o `SERIALIZABLE` + retry.
- **`SERIALIZABLE` + retry como mecanismo primario.** Funciona pero obliga a loop de reintento en el JS (el client de Supabase no reintenta `40001` solo) y complica el core. El advisory lock es más simple y localizado. Documentar `SERIALIZABLE` como alternativa, no como recomendación.
- **Exponer el count en `availability`.** Devolver `{ time, remaining: 3 }` filtra lugares restantes (viola D-06). Devolver solo `{ time, full: boolean }`.
- **Debilitar el EXCLUDE 013 globalmente.** Quitarlo o hacerlo siempre-permisivo regresa el anti-solape del caso 1. Debe quedar condicional (Opción A).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Serializar reservas del mismo slot | Mutex en Node / cola en memoria | `pg_advisory_xact_lock` dentro del RPC | El server es multi-instancia (Vercel); un lock en proceso no sirve. El lock de Postgres es global y se libera al fin de la transacción |
| Anti-sobrecupo atómico | `count` + `insert` en dos llamadas JS | RPC `SECURITY DEFINER` en una transacción | Una sola transacción = atomicidad real; dos llamadas JS = ventana de carrera |
| Anti-doble-booking capacity=1 | Lógica nueva en JS | Índice único `(... , seat)` redefinido | Reusa el respaldo atómico ya endurecido en v0.9; cero regresión |
| Anti-solape de duración variable | Re-implementar en JS/RPC | EXCLUDE gist 013 (condicional a capacity=1) | El gist ya resuelve solapes parciales; reescribirlo en código reintroduce bugs |

**Key insight:** la concurrencia correcta en multi-tenant serverless SOLO se garantiza en la DB. El re-check JS del core es y sigue siendo UX (lo dice el comentario actual en `booking-core.ts:182-183`). El milestone-core-value es "ni siquiera bajo concurrencia"; eso obliga al lock en Postgres.

## Runtime State Inventory

> Esta fase es aditiva (nueva columna + redefinición de constraints), no un rename. Aun así, cambiar constraints sobre una tabla con datos vivos en prod tiene estado a considerar.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `appointments` en prod tiene filas vivas sin `seat`. Al agregar `seat smallint NOT NULL DEFAULT 0` todas quedan seat=0 (correcto: son individuales). Filas en `confirmed`/`pending_payment` deben respetar el nuevo índice único | `DEFAULT 0` cubre el backfill; verificar que no haya duplicados pre-existentes en el mismo slot que rompan el índice único nuevo (no debería: 011 ya lo impide hoy) |
| Live service config | `time_blocks` de cada negocio en prod gana `capacity DEFAULT 1` → todos los bloques existentes quedan capacity 1 (cero cambio de comportamiento) | `DEFAULT 1 NOT NULL` cubre el backfill |
| OS-registered state | Ninguno — no hay Task Scheduler/cron nuevo (el cron diario de holds no cambia) | None — verificado: `vercel.json` cron sigue igual |
| Secrets/env vars | Ninguno nuevo. El RPC `SECURITY DEFINER` necesita `GRANT EXECUTE` a `anon` (público) y `authenticated` (manual) | Agregar `GRANT EXECUTE ON FUNCTION book_slot_atomic TO anon, authenticated, service_role` en la migración 041 |
| Build artifacts | `supabase/schema.sql` (snapshot regenerado) quedará desactualizado tras la migración | Regenerar `schema.sql` tras `supabase db reset` (patrón del repo, ver commits 040) |

**Migración sobre datos vivos:** redefinir el índice único (DROP + CREATE) y el EXCLUDE constraint sobre `appointments` poblada toma un lock breve. En Vercel Hobby/Supabase la tabla es chica (pre-1er-cliente), así que es seguro; documentar para cuando crezca (usar `CREATE INDEX CONCURRENTLY` no aplica dentro de una transacción de migración — el planner decide si es un riesgo a esta escala; a la escala actual, no).

## Common Pitfalls

### Pitfall 1: El advisory lock no serializa si la clave del slot no es estable/consistente
**What goes wrong:** dos requests del mismo slot computan claves de hash distintas (ej. una con `professional_id` null y otra con la sentinela) → no comparten lock → sobrecupo.
**Why it happens:** el bucket debe usar EXACTAMENTE el mismo `COALESCE(professional_id, sentinela)` que los constraints y el re-check JS.
**How to avoid:** construir la clave del lock con `COALESCE(professional_id, '00000000-...')` (igual que 011/013/`booking-core.ts:108`). Testear con `professional_id` null y no-null en CONC-01.
**Warning signs:** CONC-01 a veces deja entrar 2 (flaky) según el orden de las requests.

### Pitfall 2: `SECURITY DEFINER` rompe el aislamiento por tenant si confía en el caller
**What goes wrong:** la función corre con privilegios elevados; si no re-filtra por `business_id`, un caller manipulado podría insertar en otro tenant.
**Why it happens:** `SECURITY DEFINER` bypassa RLS de la función.
**How to avoid:** recibir `business_id` ya resuelto por el caller (slug→business o owner_id→business, como hoy) y filtrar TODO por él dentro de la función. El anti-tampering de service/professional/location lo sigue haciendo el core ANTES del RPC (líneas 83-104, 164-179) — el RPC recibe ids ya validados. Setear `SET search_path = public` para evitar shadowing.
**Warning signs:** un test cross-tenant (molde `manual-booking.test.ts:310`) logra insertar con datos de otro negocio.

### Pitfall 3: El EXCLUDE gist 013 sigue rechazando reservas grupales legítimas
**What goes wrong:** dos inscriptos del mismo slot grupal (mismo rango exacto) chocan con el EXCLUDE → `23P01` → `slot_taken` falso, no se puede llenar el cupo.
**Why it happens:** el gist trata cualquier solape (incluido el rango idéntico) como conflicto, sin saber de capacity.
**How to avoid:** Opción A — desnormalizar `is_group`/`capacity` a `appointments` y limitar el EXCLUDE a `WHERE NOT is_group` (capacity=1). Verificar con un test grupal que la 2ª-N reservas del slot NO chocan con 013.
**Warning signs:** la 2ª reserva de una clase grupal devuelve `slot_taken` en vez de confirmar.

### Pitfall 4: `availability` filtra lugares restantes sin querer
**What goes wrong:** el endpoint devuelve la lista cruda de `busy` con N entradas para el mismo slot → el cliente puede contar y deducir cuántos quedan.
**Why it happens:** hoy `busy` es una lista de ocupantes; con cupo, N ocupantes = N entradas visibles.
**How to avoid:** colapsar en el server a `{ time, full: boolean }` por slot (count vs capacity), NO devolver una entrada por ocupante. El client marca el slot ocupado solo cuando `full=true`.
**Warning signs:** la respuesta de `availability` tiene `length` proporcional a inscriptos.

### Pitfall 5: El re-check JS del core queda inconsistente con el RPC
**What goes wrong:** el re-check JS (UX) sigue devolviendo `slot_taken` cuando el slot tiene lugar libre en un bloque grupal → bloquea reservas válidas antes de llegar al RPC.
**Why it happens:** el re-check actual (líneas 126-134) marca `taken` si existe CUALQUIER ocupante del bucket+solape, sin contar capacity.
**How to avoid:** el re-check JS debe volverse capacity-aware (contar ocupantes del slot vs capacity del bloque) o, más simple y robusto, **delegar la decisión al RPC** y dejar el re-check JS solo para el caso obvio (count >= capacity ya conocido) o quitarlo del path grupal. El planner decide; lo seguro es que el RPC sea la autoridad y el JS no rechace de más.
**Warning signs:** un bloque cupo 15 con 1 inscripto rechaza al 2º con `slot_taken`.

## Code Examples

### Mapeo de error nuevo en booking-core.ts (forma)
```typescript
// Source: patrón actual de booking-core.ts:205-212 [VERIFIED: codebase], extendido con slot_full
const { data: appt, error: rpcErr } = await supabase
  .rpc('book_slot_atomic', { /* p_* params */ })
  .single()
if (rpcErr || !appt) {
  // RAISE EXCEPTION 'slot_full' (P0001) → message contiene 'slot_full'
  if (rpcErr?.message?.includes('slot_full')) {
    return { ok: false, error: 'slot_full', status: 409 }
  }
  // índice único de seat (capacity=1) → doble-reserva clásica
  if (rpcErr?.code === '23505' || rpcErr?.code === '23P01') {
    return { ok: false, error: 'slot_taken', status: 409 }
  }
  console.error('[booking-core] rpc error:', rpcErr?.message)
  return { ok: false, error: 'insert_failed', status: 500 }
}
```
Y extender el tipo de retorno (línea 61): `... | 'slot_taken' | 'slot_full' | 'insert_failed'`.

### Availability capacity-aware (forma — non-leak D-06)
```typescript
// Source: availability/route.ts:54-57 [VERIFIED: codebase], colapsado a full por slot
// Agrupa busy por inicio de slot dentro del bucket; full = count >= capacity del bloque que lo cubre.
const countByTime = new Map<string, number>()
for (const a of busyRows) countByTime.set(a.time, (countByTime.get(a.time) ?? 0) + 1)
// capacityFor(time) resuelve la capacity del time_block que cubre ese horario (day_of_week + ventana).
const fullSlots = [...countByTime.entries()]
  .filter(([time, n]) => n >= capacityFor(time))
  .map(([time]) => time)
return Response.json({ ok: true, full: fullSlots }, { headers: { 'Cache-Control': 'no-store' } })
// El client marca ocupado solo los slots en `full`. NUNCA se envía el count.
```
> El planner debe decidir cómo `availability` obtiene la capacity: leer `time_blocks` (capacity vive ahí) en el mismo endpoint y resolver `capacityFor(time)`. **Nota de compatibilidad:** cambiar la forma de la respuesta (`busy` → `full`) toca `booking-client.tsx`; mantener `busy` para capacity=1 y agregar `full` es una alternativa menos disruptiva — el planner elige. Para capacity=1, `full` y `busy` coinciden (1 ocupante = lleno), así que se puede unificar.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4 (`vitest.config.mts` `[VERIFIED: codebase]`) — environment `node`, `setupFiles: ['./vitest.setup.ts']` carga `.env.local` |
| Config file | `vitest.config.mts` (plugins: `tsconfigPaths()` para alias `@/*`, `react()`) |
| Quick run command | `npm test` (o `npx vitest run test/concurrency.test.ts`) |
| Full suite command | `npm test` (corre toda la suite — 283/283 verde tras v0.11 según MEMORY) |
| Supabase local | Los tests de integración se skipean sin las 3 creds (`hasSupabaseCreds`, `test/env.ts`); corren contra Supabase **local** (`supabase db reset` PG17) o el proyecto dev compartido |
| Fixtures | `test/helpers/booking-fixtures.ts` — `seedOneTenant({ bufferMinutes, serviceDurationMinutes })` siembra dueño+business+service+professional+location con service-role; `teardownOneTenant` cascadea |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONC-01 | Dos reservas concurrentes sobre el último lugar: 1 ok + 1 `slot_full` | integration (concurrencia) | `npx vitest run test/concurrency.test.ts -t "anti-sobrecupo"` | ❌ Wave 0 |
| CONC-02 | capacity=1: la 2ª reserva del mismo slot → `slot_taken` (no-regresión) | integration | `npx vitest run test/concurrency.test.ts -t "no-regresion"` | ❌ Wave 0 |
| CUPOS-03 | Admite hasta `capacity`, rechaza el excedente con `slot_full` | integration | `npx vitest run test/concurrency.test.ts -t "hasta capacity"` | ❌ Wave 0 |
| CUPOS-01/04 | capacity en time_blocks + roster/contador | manual / UAT visual | (verificación humana en `/agenda` + `/settings`) | manual |
| CUPOS-02 | Availability no filtra lugares restantes | unit + integration | assert que la respuesta no contiene count por slot | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run test/concurrency.test.ts test/booking-core.test.ts`
- **Per wave merge:** `npm test` (suite completa)
- **Phase gate:** suite verde + `supabase db reset` local aplica 041 sin error antes de `/gsd:verify-work`

### CONC-01 — patrón de test de concurrencia (RECOMENDADO)
```typescript
// Source: molde de booking-core.test.ts Test D + manual-booking.test.ts [VERIFIED: codebase]
// Sembrar un time_block capacity=2 (o setear capacity via admin), llenar 1 seat, luego DISPARAR
// dos rpc/altas EN PARALELO sobre el último lugar y asertar exactamente 1 ok + 1 slot_full.
it('CONC-01 — dos reservas concurrentes sobre el último lugar: solo una confirma', async () => {
  // capacity 2; ocupar seat 0. Quedan 1 lugar.
  await createAppointmentCore({ ...input, time: '09:00' }) // 1er inscripto
  const [a, b] = await Promise.all([
    createAppointmentCore({ ...input, time: '09:00' }),     // pelean el último lugar
    createAppointmentCore({ ...input, time: '09:00' }),
  ])
  const oks = [a, b].filter(r => r.ok).length
  const fulls = [a, b].filter(r => !r.ok && r.error === 'slot_full').length
  expect(oks).toBe(1)
  expect(fulls).toBe(1)
  // Verificación independiente: exactamente 2 filas confirmadas en el slot (no 3).
  const { data } = await t.admin.from('appointments').select('id')
    .eq('business_id', t.businessId).eq('date', DATE).eq('time', '09:00')
    .in('status', ['confirmed','pending_payment'])
  expect((data ?? []).length).toBe(2)
})
```
> **Caveat de concurrencia real:** `Promise.all` de dos llamadas desde el mismo proceso Node con el mismo socket puede serializarse en el client antes de llegar a la DB. Para forzar la carrera real, el RPC con `pg_advisory_xact_lock` garantiza la serialización **en la DB** independientemente del orden de llegada — por eso el test es determinista (siempre 1 ok + 1 full) en vez de flaky. Si el planner quiere estrés extra, lanzar K>2 en paralelo sobre cupo N y asertar exactamente N ok + (K-N) full.

### CONC-02 — no-regresión cupo 1
```typescript
it('CONC-02 — capacity=1: la 2ª reserva del mismo slot → slot_taken', async () => {
  // time_block default capacity=1. Extiende booking-core.test.ts Test B/D.
  const first = await createAppointmentCore({ ...input, time: '10:00' })
  expect(first.ok).toBe(true)
  const second = await createAppointmentCore({ ...input, time: '10:00' })
  expect(second.ok).toBe(false)
  if (!second.ok) expect(second.error).toBe('slot_taken') // NO slot_full
})
```

### Wave 0 Gaps
- [ ] `test/concurrency.test.ts` — CONC-01, CONC-02, CUPOS-03 (extiende molde de `booking-core.test.ts`)
- [ ] Fixtures: extender `seedOneTenant` para sembrar un `time_block` con `capacity` configurable (hoy no siembra time_blocks — los tests del core no los necesitaban; el availability/RPC sí). El planner agrega `seedTimeBlock({ capacity })` o un parámetro a `seedOneTenant`.
- [ ] Migración 041 aplicable por `supabase db reset` local antes de correr la suite.

## Security Domain

> `security_enforcement` enabled (absent = enabled). Esta fase toca DIRECTAMENTE el core endurecido en v0.9.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | El RPC `SECURITY DEFINER` re-impone tenant internamente; el anti-tampering sigue en el core antes del RPC |
| V4 Access Control | yes | RLS habilitada en `time_blocks`/`appointments`; `GRANT EXECUTE` del RPC acotado; el manual corre anon+RLS, el público service-role por slug |
| V5 Input Validation | yes | Parseo defensivo del body (molde existente); `capacity` validado `>= 1` (smallint) en el editor + en la migración (`CHECK (capacity >= 1)`) |
| V6 Cryptography | no | Sin cripto nueva |
| V7 Error Handling | yes | `slot_full` (409) como error de dominio snake_case; no filtrar detalles de DB al cliente |

### Known Threat Patterns for Postgres + Supabase RLS
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Sobrecupo bajo carrera (TOCTOU count→insert) | Tampering | `pg_advisory_xact_lock` + índice único seat dentro del RPC (atómico) |
| `SECURITY DEFINER` cross-tenant | Elevation of Privilege | Filtrar TODO por `business_id` resuelto por el caller; `SET search_path = public`; anti-tampering antes del RPC |
| Fuga de lugares restantes al público | Information Disclosure | `availability` colapsa count → `full: boolean`; `capacity` en time_blocks es público (cap estática, no ocupación) — aceptable |
| Regresión del anti-doble-booking cupo 1 | Tampering | Índice único seat (seat=0 único) + EXCLUDE 013 condicional preservado; CONC-02 lo guardea |
| Reasignar bloque/turno a otro tenant | Tampering | Policies `WITH CHECK (business_id IN <negocios del dueño>)` para `time_blocks` (hoy `time_blocks` tiene policy `FOR ALL USING(...)` que aplica como WITH CHECK; agregar `FOR UPDATE/INSERT WITH CHECK` explícito al estilo 040 es hardening) |

> **Nota RLS de `time_blocks` `[VERIFIED: codebase]`:** `time_blocks` tiene `CREATE POLICY "public read time_blocks" FOR SELECT USING (true)` (`baseline.sql:1354`) → `anon` PUEDE leer `time_blocks`, incluida la nueva columna `capacity`. Esto NO viola D-06: `capacity` es el tope estático (no la ocupación viva). La ocupación viva vive en `appointments`, que `anon` NO puede leer (sin policy de read público para `anon` sobre appointments) → la única vía pública a la ocupación es `availability` (service-role), que se colapsa a `full`. **El planner debe confirmar** que exponer `capacity` (tope) al público es aceptable (lo es por D-06: solo se prohíbe "lugares restantes", no el tamaño del cupo) — si se quisiera ocultar también el tope, habría que restringir la columna, lo que complica el read público existente. Recomendación: aceptar exponer `capacity` (tope), nunca la ocupación.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 1 fila por slot (índice único 011 sin seat) | índice único `(..., seat)` capacity-aware | Phase 2 | Permite N filas/slot sin perder atomicidad |
| INSERT directo desde JS (autocommit) | RPC `SECURITY DEFINER` con advisory lock | Phase 2 | Atomicidad real count→insert; el JS no puede serializar |
| `availability` devuelve lista de ocupantes | `availability` colapsa a `full: boolean` por slot | Phase 2 | No filtra lugares restantes (D-06) |
| EXCLUDE gist 013 global | EXCLUDE gist condicional a capacity=1 | Phase 2 | Conserva anti-solape del caso 1; lo evita en grupos |

**Deprecated/outdated:**
- `.planning/codebase/TESTING.md` está **DESACTUALIZADO** (fechado 2026-06-15, dice "NO hay framework de tests"). La realidad: Vitest 4 está instalado y la suite tiene 283 tests verdes (MEMORY/v0.11). Usar los archivos reales (`vitest.config.mts`, `test/*.test.ts`) como fuente de verdad, NO TESTING.md.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `pg_advisory_xact_lock` + índice único seat es la opción de menor riesgo vs SERIALIZABLE+retry | Pattern 1/Summary | Si el planner prefiere SERIALIZABLE, el core necesita loop de retry — mayor complejidad, mismo resultado funcional. Decisión LOCKED solo como "atómico deliberado"; la forma exacta es discreción |
| A2 | El EXCLUDE 013 se puede limitar a capacity=1 vía columna desnormalizada `is_group`/`capacity` en appointments | Pattern 3 | Si desnormalizar no es deseable, el planner debe elegir otra forma de condicionar el gist; el riesgo es regresión del anti-solape del caso 1 — debe testearse explícitamente |
| A3 | Exponer `capacity` (tope) al público vía la policy read de time_blocks es aceptable bajo D-06 | Security Domain | Si el negocio quiere ocultar el tope, hay que restringir la columna (más complejo) — confirmar con el dueño del producto |
| A4 | `seedOneTenant` no siembra `time_blocks` hoy y habrá que extenderlo para los tests de availability/RPC | Validation/Wave 0 | Verificado que el helper actual NO inserta time_blocks; bajo riesgo (solo agregar el seed) |
| A5 | El re-check JS del core debe volverse capacity-aware o delegar al RPC para no rechazar reservas grupales válidas | Pitfall 5 | Si se deja como está, bloquea el 2º+ inscripto con `slot_taken` falso — el planner debe abordarlo explícitamente |

**Confirmados (no asunciones):** definiciones de 011/013, comportamiento del core/callers/availability, modelo de `time_blocks` como plantilla, framework Vitest y fixtures, policy public-read de time_blocks — todo `[VERIFIED: codebase]` leyendo los archivos.

## Open Questions (RESOLVED)

1. **¿Advisory lock o SERIALIZABLE?**
   - What we know: ambos garantizan atomicidad; LOCKED solo exige "atómico deliberado, nunca count suelto".
   - What's unclear: preferencia del planner por simplicidad (advisory) vs aislamiento estándar (serializable+retry).
   - Recommendation: advisory lock (menos código, localizado al slot, sin retry en JS).

2. **¿Distinguir `slot_full` de `slot_taken` en el choque de índice de seat?**
   - What we know: con advisory lock, el choque de índice casi no ocurre; cuando ocurre, capacity define el significado.
   - Recommendation: capacity=1 → `slot_taken`; capacity>1 → `slot_full`. O colapsar todo a un mapeo por capacity en el core.

3. **¿`availability` mantiene `busy` o migra a `full`?**
   - What we know: cambiar la forma toca `booking-client.tsx`.
   - Recommendation: agregar `full` y mantener `busy` para minimizar el blast radius; para capacity=1 coinciden.

4. **¿La capacity se edita en `settings-client.tsx` (editor de horarios) o en `agenda-client.tsx`?**
   - CONTEXT D-01 dice "editor de agenda"; canonical_refs apunta a `settings-client.tsx` (grilla de time_blocks). Recommendation: el campo `capacity` va donde se editan los `time_blocks` (settings-client). El planner confirma leyendo ambos.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI local (PG17) | `supabase db reset` valida 041 | ✓ | (configurado, MEMORY infra-testing) | — |
| `btree_gist` extensión | EXCLUDE gist 013 | ✓ | nativo PG | — |
| Vitest 4 | CONC-01/02 | ✓ | 4.x | — |
| Supabase creds (URL+anon+service) | tests de integración | depende de `.env.local` | — | tests se skipean (`hasSupabaseCreds`) si faltan |

**Missing dependencies with no fallback:** ninguna.
**Missing dependencies with fallback:** creds de Supabase — sin ellas, CONC-01/02 se skipean (no fallan); deben estar presentes en CI/local para que el gate sea real.

## Sources

### Primary (HIGH confidence — leído en este repo)
- `lib/booking-core.ts:1-223` — core actual, re-check, traducción de constraint, INSERT directo
- `supabase/migrations/00000000000000_baseline.sql` — constraints 011 (:797), 013 (:649), `time_blocks` (:633), policy public-read time_blocks (:1354), btree_gist (:20)
- `supabase/migrations/040_appointments_clients_insert_with_check.sql` — estilo de migración de policies WITH CHECK
- `app/api/booking/create/route.ts`, `app/api/appointments/create/route.ts`, `app/api/booking/availability/route.ts` — callers y availability
- `app/[slug]/booking-client.tsx:233-253` — generación de slots desde time_blocks
- `test/booking-core.test.ts`, `test/manual-booking.test.ts`, `test/helpers/booking-fixtures.ts`, `test/env.ts`, `vitest.config.mts` — infra de tests
- `.planning/.../02-CONTEXT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md` — decisiones LOCKED

### Secondary (MEDIUM confidence)
- Postgres docs: `pg_advisory_xact_lock`, `SECURITY DEFINER`, EXCLUDE constraints (patrón estándar de advisory-lock-then-insert) `[CITED: postgresql.org/docs]`

### Tertiary (LOW confidence)
- Ninguna — todas las recomendaciones se anclan en código leído o docs de Postgres.

## Metadata

**Confidence breakdown:**
- Integrity baseline (011/013, core, availability): HIGH — leído verbatim del repo
- Mecanismo atómico (advisory lock + RPC + seat): HIGH para el patrón, MEDIUM para la firma exacta del RPC (discreción del planner)
- EXCLUDE 013 condicional (Opción A): MEDIUM — requiere validación con `supabase db reset` local (el predicado exacto)
- Tests de concurrencia: HIGH — molde directo de tests existentes
- RLS/non-leak: HIGH — policies leídas del baseline

**Research date:** 2026-06-26
**Valid until:** 2026-07-26 (stack estable; revalidar si cambia el baseline o el modelo de time_blocks)
