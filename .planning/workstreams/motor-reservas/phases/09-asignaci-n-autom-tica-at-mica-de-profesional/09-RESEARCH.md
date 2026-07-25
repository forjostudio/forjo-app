# Phase 9: Asignación automática atómica de profesional - Research

**Researched:** 2026-07-25
**Domain:** PostgreSQL `SECURITY DEFINER` RPC + advisory locks + concurrencia (núcleo anti-doble-booking del motor de reservas)
**Confidence:** HIGH (todo anclado en el código real ya en producción: migr. 041/042/057, `lib/booking-core.ts`, `lib/staff-services.ts`, la suite `test/concurrency.test.ts`)

> **Provenance:** este es un dominio 100% interno (SQL + TS del propio repo, no hay paquetes ni docs externas nuevas). Cada afirmación se etiqueta `[VERIFICADO: <archivo:línea>]` cuando salió de leer el código real, o `[ASSUMED]` cuando es un juicio de diseño no verificable en esta sesión. No hay `Package Legitimacy Audit` ni `Environment Availability` porque la fase no instala nada ni depende de tooling externo nuevo (solo `supabase db reset` + `vitest`, ya presentes).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01 … D-12 — NO re-discutir)
- **D-01 (desempate):** empate en "menos turnos ese día" → gana `professionals.created_at` **asc**, `id` como tie-break secundario. Determinístico + self-balancing, cero estado extra.
- **D-02 (qué cuenta como carga):** conteo = **todos los turnos NO cancelados** del profesional **ese día completo** (00:00–23:59 zona AR), **cualquier servicio**, **incluyendo** ocurrencias de abono y **holds/señas vigentes**.
- **D-03 (sede en el conteo):** el conteo de carga es **total en TODAS las sedes** (una persona = una agenda). Distinto del filtro de CANDIDATOS (sí se acota por sede — D-07/D-13).
- **D-04 (alcance del lock):** el advisory lock se amplía a **`(business_id + horario de inicio)`**. Regla dura: **no degradar `slot_full` (anti-sobrecupo) ni `slot_taken` (anti-solape cross-espacio)**.
- **D-05:** la selección ocurre **DENTRO de `book_slot_atomic`**, misma transacción `SECURITY DEFINER`; **nunca** leer-libres→insertar.
- **D-06 (anti-tampering):** candidatos derivados **server-side** de `business_id` + mapeo `professional_services` (Phase 8); **nunca** de IDs del cliente.
- **D-07 (candidatos):** capaces del servicio (mapeo **o** comodín) + **de la sede de la reserva** (sin-sede vale para todas) + **activos**. La regla del comodín (0 filas = capaz de todo) hoy vive en TS (`lib/staff-services.ts`) → **replicarla en SQL con paridad semántica exacta**.
- **D-08 (SECURITY DEFINER):** toda query nueva dentro del RPC filtra por `business_id` **explícito**.
- **D-09 (migración):** RPC modificado en migración **058** (próxima; última en prod = 057), idempotente, `CREATE OR REPLACE FUNCTION`, aplicada a mano + `supabase db reset` local.
- **D-10 (sin disponibilidad):** ningún capaz libre → rechazo con el error de disponibilidad de siempre (`slot_full`/`slot_taken`).
- **D-11 (cero regresión):** los 4 caminos (profesional específico · cancha · ocurrencia de abono · cupo grupal) se comportan **exactamente como antes**.
- **D-12 (secure-phase obligatorio):** el gate verifica atomicidad bajo concurrencia REAL (test contra DB), cero regresión de los 4 caminos, y aislamiento por tenant de los candidatos.

### Claude's Discretion (las TRES zonas grises a resolver acá)
- Firma exacta del RPC y cómo se pasa la intención "cualquiera" (sentinel `professional_id NULL` u otro marcador).
- Mecánica exacta del key del advisory lock (cómo se hashea `business_id` + timestamp de inicio), respetando D-04.
- Forma de la query SQL de candidatos (LEFT JOIN + NOT EXISTS para el comodín, etc.), respetando paridad con `lib/staff-services.ts`.

### Deferred Ideas (OUT OF SCOPE)
- **UI de "cualquiera" + mostrar el profesional asignado** (ASIGN-01, ASIGN-05) → **Phase 10**. Esta fase NO toca ninguna superficie de UI.
- **Cupo por solape** (`capacity > 1` por solape) → **v0.26**. Toca el MISMO RPC; NO entra acá (coordinar orden de migración con la de v0.26).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Descripción | Research Support |
|----|-------------|------------------|
| **ASIGN-02** | Con "cualquiera", el sistema asigna automáticamente un profesional libre que sepa hacer el servicio elegido. | Query de candidatos SQL (§Gray Area 2) dentro del RPC, con paridad de comodín + filtro sede + activos + libre. |
| **ASIGN-03** | La asignación automática es **atómica**: dos reservas concurrentes de "cualquiera" sobre el mismo horario nunca reciben el mismo profesional ni sobre-reservan. | Advisory lock ampliado a `(business_id+date+time)` (§Gray Area 1) + selección de candidato bajo el lock + backstop de constraints 011/013/042. Test de carrera real (§Gray Area 3). |
| **ASIGN-04** | La asignación elige el profesional con **menos turnos ese día** (reparto de carga). | `ORDER BY count(turnos del día) ASC, created_at ASC, id ASC` (§Gray Area 2), conteo per D-02/D-03. |
</phase_requirements>

## Summary

`book_slot_atomic` es un RPC `SECURITY DEFINER` de 14 parámetros que ya encapsula, en UNA transacción, todo el anti-doble-booking del motor: un `pg_advisory_xact_lock` por slot+bucket, la exclusión acoplada por espacio físico (locks por espacio + `EXISTS` de solape, migr. 042), el conteo de ocupación vs `capacity` (cupos grupales, migr. 041) y el `INSERT` con `seat`, respaldado por el índice único 011 y el `EXCLUDE` gist 013 `[VERIFICADO: supabase/migrations/042_*.sql:126-238, 041_*.sql:95-174]`. Los CUATRO consumidores entran por un único punto — `createAppointmentCore` en `lib/booking-core.ts:244-261` — así que un cambio de firma/semántica los toca a los cuatro `[VERIFICADO: booking-core.ts]`.

La fase agrega, **dentro** de esa misma transacción, la selección de un profesional "libre y capaz" cuando la reserva no eligió uno. Las tres piezas de diseño que faltan (las zonas grises) tienen una solución de mínima fricción anclada en lo que ya existe: **(1)** ampliar el key del advisory lock quitando el bucket del hash `hashtextextended(...)` — un lock *más grueso* es estrictamente más seguro y no puede degradar `slot_full`/`slot_taken`; **(2)** una query de candidatos con `NOT EXISTS/EXISTS` sobre `professional_services` que replica byte-a-byte la regla del comodín de `lib/staff-services.ts`, más `ORDER BY` de carga; **(3)** señalar "cualquiera" con un **UUID centinela mágico** distinto del cero-SENTINEL actual, lo que preserva la firma de 14 params y el `RETURNS (id, cancel_token)` → `CREATE OR REPLACE` puro, cero regresión.

**Primary recommendation:** ampliar el lock a `(business_id + date + time)`, seleccionar el candidato bajo ese lock con una query de paridad-comodín ordenada por carga, señalar "cualquiera" con un UUID centinela mágico (NO reusar `NULL`, que ya significa "sin profesional"/SENTINEL), y dejar que el `INSERT` con el profesional elegido pase por el mismo esqueleto de constraints como backstop atómico. Validar ASIGN-03 con un test de carrera real espejando `test/concurrency.test.ts`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Selección atómica de profesional "cualquiera" | Database (RPC `book_slot_atomic`, PL/pgSQL) | — | D-05: correctness bajo concurrencia solo se garantiza en la DB, bajo el mismo advisory lock/transacción. El JS no puede dar atomicidad count→insert. |
| Regla del comodín (capaz de qué servicio) | Database (SQL nuevo en el RPC) espeja `lib/staff-services.ts` (TS) | — | D-07: la regla vive en TS (fuente única para UI/pública); el RPC la **replica** con paridad semántica, no la importa. |
| Señal de intención "cualquiera" | API/Backend (`lib/booking-core.ts` → param del RPC) | — | El core traduce el flag a un marcador que el RPC entiende; anti-tampering (D-06) exige que candidatos NO vengan del cliente. |
| Anti-sobrecupo / anti-solape / anti-espacio (backstop) | Database (índice 011, EXCLUDE 013, RPC 042) | — | Ya existen; el `INSERT` del profesional elegido pasa por ellos → red de seguridad declarativa. |
| Superficie pública "cualquiera" + mostrar asignado | — (Phase 10) | — | Fuera de alcance de esta fase (backend puro, UI hint: no). |

## Standard Stack

Sin stack nuevo. La fase usa exclusivamente lo ya presente:

| Componente | Versión/Origen | Rol en la fase |
|-----------|----------------|----------------|
| PostgreSQL 17 (Supabase) | local vía `supabase db reset` | motor del RPC; `pg_advisory_xact_lock`, `hashtextextended`, `tsrange`, `make_interval` ya en uso `[VERIFICADO: 041/042]` |
| PL/pgSQL `SECURITY DEFINER` | `book_slot_atomic` (migr. 041→042) | función a extender vía `CREATE OR REPLACE` en migr. 058 |
| `lib/booking-core.ts` | repo | único caller del RPC; punto donde se traduce "cualquiera" |
| `lib/staff-services.ts` | repo (Phase 8) | fuente canónica de la regla del comodín a espejar en SQL |
| Vitest `^4.1.9` | `package.json` | tests de carrera real contra Supabase local (`npm test`) |

**Sin instalación.** No hay paquetes nuevos → sin `Package Legitimacy Audit`.

## Runtime State Inventory

> Esta fase es una **migración de función** (058, `CREATE OR REPLACE`), NO un rename ni una migración de datos. Se completa el inventario para descartar estado huérfano.

| Categoría | Items encontrados | Acción requerida |
|-----------|-------------------|------------------|
| Stored data | **Ninguno** — no hay backfill: `professional_services` ya existe (057) y la regla del comodín es "0 filas = capaz de todo" (cero seed). Los `appointments` existentes no cambian de forma. `[VERIFICADO: 057_*.sql:22-25]` | Ninguna. |
| Live service config | **Ninguno** — el RPC no está registrado en ningún servicio externo; PostgREST cachea la firma de la función. | Tras aplicar 058 a prod: `NOTIFY pgrst, 'reload schema';` (patrón del repo) `[VERIFICADO: 057_*.sql:39]`. |
| OS-registered state | **Ninguno** (verificado: no hay cron ni task que referencie el RPC por nombre). | Ninguna. |
| Secrets/env vars | **Ninguno** — el RPC no lee secretos; `p_business_id` lo resuelve el caller. | Ninguna. |
| Build artifacts | **Ninguno** — `supabase/schema.sql` es el snapshot a **regenerar quirúrgicamente** tras aplicar 058 (patrón 042/054/057). | Regenerar `schema.sql` (no dump completo: el CLI reordena el archivo). |

**Canon operativo (D-09):** migr. **058** idempotente, `CREATE OR REPLACE FUNCTION`, validada con `supabase db reset` local (replay 001→058), aplicada **a mano** a prod coordinada con el deploy + `NOTIFY pgrst`. La última en prod es la 057.

---

## Gray Area 1 — Mecánica exacta del key del advisory lock (D-04)

### Cómo se deriva HOY el key

El lock actual serializa por **slot + bucket** `[VERIFICADO: 041_*.sql:121-122 y 042_*.sql:154-155]`:

```sql
-- v_bucket := COALESCE(p_professional_id, '00000000-0000-0000-0000-000000000000'::uuid);
PERFORM pg_advisory_xact_lock(hashtextextended(
  p_business_id::text || v_bucket::text || p_date::text || p_time::text, 0));
```

- Forma usada: **`pg_advisory_xact_lock(bigint)`** — la variante de **un solo argumento de 64 bits** (NO la forma `(int4, int4)`). El bigint sale de `hashtextextended(text, 0)` (hash de 64 bits, seed 0).
- El `xact` = el lock se libera **al fin de la transacción** (no requiere unlock manual) → correcto para el patrón del RPC.
- El COALESCE del bucket es **byte-idéntico** al del índice 011 (`041:65`), al EXCLUDE 013 (`041:76`) y al count de ocupación (`041:138`). Esa igualdad es "Pitfall 1" del repo: si el key difiriera, dos requests del mismo slot no compartirían lock → sobrecupo `[VERIFICADO: 041_*.sql:88, 120]`.
- La migr. 042 agrega **locks adicionales por espacio**, también en la forma de un argumento: `pg_advisory_xact_lock(hashtextextended(p_business_id::text || v_sid::text, 0))`, uno por `space_id` en **orden ascendente** (anti-deadlock) `[VERIFICADO: 042_*.sql:170-172]`.

### Cómo ampliarlo a `(business_id + horario de inicio)` — D-04

**Recomendación (HIGH):** quitar `v_bucket` del texto hasheado. El slot lock pasa a:

```sql
PERFORM pg_advisory_xact_lock(hashtextextended(
  p_business_id::text || p_date::text || p_time::text, 0));   -- SIN v_bucket
```

Todo lo demás (forma de un argumento, seed 0, locks de espacio posteriores) **queda igual**.

### Por qué ampliar es seguro (no degrada `slot_full` ni `slot_taken`)

Un lock **más grueso serializa MÁS, nunca menos**. La exclusión mutua se preserva o refuerza; solo baja el paralelismo (despreciable: el volumen de reservas simultáneas al MISMO instante de inicio por negocio es bajo — CONTEXT D-04). Análisis por invariante:

1. **`slot_full` (anti-sobrecupo, cupos grupales):** los inscriptos de una clase comparten `business_id+date+time` **y** bucket. Con el lock viejo (biz+bucket+date+time) o el nuevo (biz+date+time) el key es el **mismo** para ellos → serialización **idéntica**. El count vs `capacity` y el `RAISE slot_full` no cambian. `[VERIFICADO: comparación 041:121 vs propuesta]` → **CONC-01 sigue determinista.**
2. **`slot_taken` cross-espacio (canchas, migr. 042):** dos agendas distintas que comparten espacio, al mismo horario. Hoy toman slot locks **distintos** (buckets distintos) pero convergen en el **mismo lock de espacio** (orden ascendente) → serializan ahí. Con el lock ampliado convergen **antes**, en el slot lock común (biz+date+time), y **después** en el de espacio → serialización estrictamente mayor. El `EXISTS` de solape y el `RAISE slot_taken` no cambian. `[VERIFICADO: 042_*.sql:157-195]` → **CONC-03 sigue determinista.**
3. **Doble-booking cupo 1 (`23505` → slot_taken):** dos reservas del mismo slot+bucket comparten el key nuevo igual que el viejo → serializan; la 2ª reusa `seat 0` y choca con el índice 011. Sin cambio. `[VERIFICADO: 041_*.sql:158-160]`

### Consideraciones de colisión y deadlock

- **Colisión de hash:** `hashtextextended` es de 64 bits → probabilidad de colisión despreciable. Una colisión solo causaría que dos slots no relacionados serialicen de más (impacto de *performance*, jamás de correctness — los advisory locks son advisory, sobre-bloquear es seguro). `[ASSUMED — propiedad estándar de un hash de 64 bits]`
- **Colisión slot-lock vs space-lock:** ambos viven en el mismo keyspace bigint de advisory locks (forma de un argumento). Un choque entre un key de slot y uno de espacio solo agrega serialización inocua. No es un problema. `[ASSUMED]`
- **Deadlock:** el slot lock se toma **primero y una sola vez** por transacción; ampliarlo NO puede introducir un ciclo nuevo (todas las reservas del mismo instante hacen cola en el mismo primer lock antes de tocar los locks de espacio). El orden ascendente de los locks de espacio (042) se conserva intacto. `[VERIFICADO: orden de adquisición en 042_*.sql:154→170]`

### Por qué D-04 es NECESARIO para "cualquiera" (no es gratuito)

Si "cualquiera" se señala con un UUID mágico (§Gray Area 3), dos "cualquiera" concurrentes comparten bucket=mágico → ya serializarían con el lock viejo. **Pero** una reserva "cualquiera" y una reserva **específica de la misma persona X** al mismo horario tomarían slot locks **distintos** (bucket mágico ≠ bucket X) → NO serializan → la "cualquiera" podría elegir a X justo cuando la específica lo inserta → una de las dos rebota con `23505` en vez de que la "cualquiera" elija a otro libre. Ampliar a `(biz+date+time)` hace que **toda** reserva del instante (específica + cualquiera) serialice sobre el mismo lock, de modo que la selección de candidato ve un estado consistente y elige óptimo. `[VERIFICADO: razonamiento sobre 041:121 + booking-core.ts:244]`

---

## Gray Area 2 — Query SQL de candidatos con paridad-comodín exacta

### La regla a espejar (TS, fuente canónica)

`lib/staff-services.ts::professionalsForService` `[VERIFICADO: staff-services.ts:43-53]`:

```ts
return activeProfessionals.filter((p) => {
  const rows = bridge.filter((r) => r.professional_id === p.id)
  if (rows.length === 0) return true            // comodín: 0 filas = ofrece TODO
  return rows.some((r) => r.service_id === serviceId)
})
```

Traducción **con paridad semántica exacta** al SQL del RPC (comodín = `NOT EXISTS ninguna fila` **OR** `EXISTS una fila del servicio`):

```sql
(
  NOT EXISTS (
    SELECT 1 FROM professional_services ps
    WHERE ps.business_id = p_business_id AND ps.professional_id = p.id
  )
  OR EXISTS (
    SELECT 1 FROM professional_services ps
    WHERE ps.business_id = p_business_id
      AND ps.professional_id = p.id
      AND ps.service_id = p_service_id
  )
)
```

Ambos `ps.business_id = p_business_id` son el filtro de tenant explícito exigido por D-08 (RLS no protege dentro de `SECURITY DEFINER`). El índice `professional_services_by_service (service_id, professional_id)` sirve el segundo `EXISTS` `[VERIFICADO: 057_*.sql:87]`.

### La query de candidato completa (selección + orden de carga)

Se ejecuta **bajo el slot lock ya tomado** (§Gray Area 1). Toma la sede resuelta (`p_location_id`) y el servicio (`p_service_id`) ya validados por el core.

```sql
SELECT p.id
INTO   v_selected_pro
FROM   professionals p
WHERE  p.business_id = p_business_id                      -- D-08 tenant explícito
  AND  p.active = true                                    -- D-07 activos
  AND  p.service_id IS NULL                               -- excluir CANCHAS (ver nota) 
  AND  (p.location_id = p_location_id OR p.location_id IS NULL)  -- D-07/D-13 sede (sin-sede vale para todas)
  AND  (  -- D-07 capaz (paridad-comodín exacta con staff-services.ts)
        NOT EXISTS (SELECT 1 FROM professional_services ps
                    WHERE ps.business_id = p_business_id AND ps.professional_id = p.id)
        OR EXISTS  (SELECT 1 FROM professional_services ps
                    WHERE ps.business_id = p_business_id AND ps.professional_id = p.id
                      AND ps.service_id = p_service_id)
       )
  AND  NOT EXISTS (  -- LIBRE: sin turno OCUPANTE solapado en su bucket (espeja 013 + expires_at del core)
        SELECT 1 FROM appointments a
        WHERE a.business_id = p_business_id
          AND a.professional_id = p.id
          AND a.date = p_date
          AND a.status IN ('confirmed','pending_payment')
          AND (a.status = 'confirmed' OR a.expires_at IS NULL OR a.expires_at > now())   -- holds vigentes
          AND tsrange(a.date + a.time,
                      a.date + a.time + make_interval(mins => COALESCE(a.duration_minutes,30)))
              && tsrange(p_date + p_time,
                         p_date + p_time + make_interval(mins => p_duration))
       )
ORDER BY (  -- D-02/D-03: carga = turnos NO cancelados del profesional ese DÍA COMPLETO, TODAS las sedes/servicios
         SELECT count(*) FROM appointments a2
         WHERE a2.business_id = p_business_id
           AND a2.professional_id = p.id
           AND a2.date = p_date
           AND a2.status IN ('confirmed','pending_payment')
           AND (a2.status = 'confirmed' OR a2.expires_at IS NULL OR a2.expires_at > now())
       ) ASC,
       p.created_at ASC,   -- D-01 desempate: alta más vieja
       p.id ASC            -- D-01 tie-break secundario (determinismo total → tests reproducibles)
LIMIT 1;

IF v_selected_pro IS NULL THEN
  -- D-10: ningún capaz libre → error de disponibilidad de siempre.
  RAISE EXCEPTION 'slot_taken' USING ERRCODE = 'P0001';
END IF;
```

### Decisiones clave de la query (todas fundadas en D-01…D-13)

- **Comodín:** `NOT EXISTS … OR EXISTS …` es la traducción 1:1 del helper TS `[VERIFICADO: staff-services.ts:48-52]`. **Paridad exacta**, no una segunda interpretación.
- **Filtro de sede (D-07/D-13):** `p.location_id = p_location_id OR p.location_id IS NULL`. `professionals.location_id` existe y es nullable → "sin sede vale para todas" `[VERIFICADO: schema.sql:706, 1410-1411]`. El `p_location_id` que llega al RPC es la sede ya **resuelta** por el core (body → o fallback a `service.location_id`) `[VERIFICADO: booking-core.ts:219-234, 249]`.
- **Conteo de carga (D-02/D-03):** `count` de `appointments` del profesional ese día, **todas las sedes/servicios** (no se filtra por `location_id` ni `service_id`), incluyendo abonos (los turnos de abono son `appointments` normales etiquetados con `abono_id` `[VERIFICADO: abono-generation.ts:216-219]`) y holds vigentes. Se usa `status IN ('confirmed','pending_payment')` + guarda `expires_at` para materializar "no cancelados / holds **vigentes**" de D-02 (un hold expirado-no-cancelado no debe inflar la carga).
- **Determinismo (D-01):** `created_at ASC, id ASC` hace la selección **totalmente reproducible** → los tests de ASIGN-03/ASIGN-04 no son flaky. Es también self-balancing: el que gana el empate queda +1 y el próximo empate lo gana el otro.
- **Exclusión de canchas (`p.service_id IS NULL`) — subtlety a validar:** en el vertical canchas, `professionals` **son** canchas y tienen `service_id` NOT NULL (migr. 043, puntero cancha↔service) `[VERIFICADO: booking/create/route.ts:111-146, schema.sql:712]`. Una cancha con 0 filas en `professional_services` sería "comodín → capaz de todo" y podría colarse como candidato de "cualquiera". `p.service_id IS NULL` la excluye. El flujo "cualquiera" solo existe en verticales de staff (donde `service_id` es NULL), así que este filtro es defensa-en-profundidad sin regresión. **[ASSUMED — confirmar con el planner que ningún negocio mezcla staff + canchas en el mismo tenant; si lo hiciera, el filtro sigue siendo correcto].**

### Sobre la libertad (LIBRE) vs. el backstop de constraints

La `NOT EXISTS` de "libre" **espeja** el solape de duración del EXCLUDE 013 `[VERIFICADO: 041_*.sql:76]` y la semántica de `expires_at` del core `[VERIFICADO: booking-core.ts:170,177-178]`. Como la selección corre **bajo el slot lock ampliado**, para el caso ASIGN-03 (mismo horario) la libertad calculada es **autoritativa**: ninguna otra transacción puede insertar en `(biz,date,time)` en paralelo. Para solapes a **otro** horario (duración variable) que no comparten el slot lock, el `INSERT` del profesional elegido sigue pasando por el índice 011 / EXCLUDE 013 como **backstop atómico**: si por una carrera de distinto-horario el elegido resultara ocupado, el `RAISE`/constraint aborta con `slot_taken` (D-10, degradación graciosa) — **nunca** sobrecupo. `[VERIFICADO: booking-core.ts:263-281 traduce 23505/23P01/'slot_taken' → 409]`

---

## Gray Area 3 — Firma del RPC, cómo pasar "cualquiera", y patrón de test de concurrencia

### El problema de firma: `NULL` YA está ocupado

`p_professional_id = NULL` **hoy** significa "sin profesional" → bucket `SENTINEL` (`00000000-…-0`), el caso legítimo de un negocio que no trackea profesionales `[VERIFICADO: booking-core.ts:15,95,108; 041_*.sql:113]`. **Reusar `NULL` para "cualquiera" rompería** ese flujo (violación directa de D-11). Se necesita un marcador **distinto**.

### Recomendación (HIGH): UUID centinela mágico + firma intacta

Señalar "cualquiera" con un **UUID constante mágico** distinto del cero-SENTINEL, p.ej. `ANY_PROFESSIONAL = '00000000-0000-0000-0000-000000000001'`:

- **Firma del RPC INTACTA:** los mismos **14 parámetros**, mismo `RETURNS TABLE (id, cancel_token)`, mismo `LANGUAGE plpgsql SECURITY DEFINER SET search_path` → **`CREATE OR REPLACE FUNCTION` puro** (idempotente, D-09). Cero DROP, cero cambio de tipo de retorno, cero re-resolución de overloads en PostgREST. **Cero regresión para los 4 callers** (ninguno manda jamás ese UUID). `[VERIFICADO: firma en 042_*.sql:126-141; los 4 callers pasan proId validado o null]`
- **Por qué NO agregar un parámetro `p_auto_assign boolean`:** agregar un parámetro **cambia la firma** → crea un overload nuevo; para reemplazar habría que `DROP FUNCTION` la versión de 14 args y las llamadas `supabase.rpc()` por nombre podrían quedar ambiguas entre overloads. Más frágil que el UUID mágico. `[ASSUMED — comportamiento estándar de PostgREST con overloads]`
- **Por qué NO cambiar el `RETURNS TABLE` para devolver el pro asignado:** cambiar las columnas del `RETURNS TABLE` **cambia el tipo de retorno** → `CREATE OR REPLACE` **falla** ("cannot change return type"); requeriría `DROP FUNCTION` primero. Como Phase 9 es backend puro y el `appointments.professional_id` ya queda con el pro real, **Phase 10 puede leer el asignado de la fila** (`SELECT professional_id FROM appointments WHERE id = <returned>`), sin tocar la firma acá. Recomendación: **no cambiar el retorno en 058**. `[ASSUMED — regla de Postgres sobre CREATE OR REPLACE y return type]`

### Cómo lo pasa el core (`lib/booking-core.ts`)

Agregar un flag explícito a `CreateAppointmentInput` (más claro que sobrecargar `professionalId` con strings mágicos):

```ts
export type CreateAppointmentInput = {
  // …existente…
  autoAssign?: boolean   // Phase 9: "cualquiera" — el RPC elige el profesional
}
```

En `createAppointmentCore`:
- Si `autoAssign === true`: **saltear** la validación anti-tampering de `professionalId` (no hay uno específico) y **saltear** el re-check JS de solape/espacio (no computable sin bucket concreto — es solo UX; el RPC es la autoridad). Pasar `p_professional_id: ANY_PROFESSIONAL` al RPC. `[VERIFICADO: los re-checks JS de booking-core.ts:106-189 son UX; la autoridad es el RPC — comentarios 236-243]`
- Si `autoAssign` es falsy: comportamiento **byte-idéntico** al de hoy (los 4 callers actuales no setean el flag). Cero regresión.

Envolver los re-checks JS existentes en `if (!autoAssign) { … }` es el cambio mínimo. El resto del core (liberación de holds per-bucket, capacity JS) también se saltea para `autoAssign` porque no hay bucket — aceptable: el RPC hace el trabajo real y la libertad/holds vigentes ya se contemplan en la query de candidatos (guarda `expires_at`).

> **Nota Phase 10 (no implementar acá):** el route handler público seteará `autoAssign` desde un flag del body (la opción "Sin preferencia" que ya existe en `booking-client.tsx:476-487`). Phase 9 solo deja el core y el RPC listos; los tests son quienes ejercitan `autoAssign` en esta fase.

### Secuencia final del RPC (058) — dónde encaja cada bloque

```
1.  v_effective_pro := p_professional_id
    v_is_any := (p_professional_id = ANY_PROFESSIONAL)
2.  PERFORM pg_advisory_xact_lock( hash(biz + date + time) )        -- §GA1: lock AMPLIADO, primero
3.  IF v_is_any THEN
       <query de candidatos §GA2> INTO v_effective_pro
       IF v_effective_pro IS NULL THEN RAISE 'slot_taken'; END IF;  -- D-10
    END IF
4.  v_bucket := COALESCE(v_effective_pro, SENTINEL)                 -- recomputar con el pro elegido
5.  <bloque de espacio 042: resolver agenda_spaces de v_effective_pro, locks por space, EXISTS>  -- sin cambios salvo usar v_effective_pro
6.  <capacity count vs v_bucket → slot_full / seat>                 -- 041, sin cambios
7.  INSERT … professional_id = v_effective_pro, seat …             -- backstop 011/013/042
    RETURNING id, cancel_token
```

Puntos de correctness: la selección (paso 3) ocurre **después** del lock (paso 2) y **antes** de espacio/capacity/insert; `v_bucket` y el bloque de espacio se recomputan con `v_effective_pro`, no con el mágico (que no tiene espacios ni turnos). El `INSERT` inserta el pro **real** elegido, nunca el UUID mágico.

### Patrón de test de concurrencia (ASIGN-03) — espejando `test/concurrency.test.ts`

La suite `test/concurrency.test.ts` ya es el molde exacto: `describe.skipIf(!hasSupabaseCreds)`, service-role como el `supabase` del core, `Promise.all([...])` de dos `createAppointmentCore`, y una verificación **independiente** del estado de la DB (`occupantsAt`) `[VERIFICADO: concurrency.test.ts:25-114, 245-275]`.

**Fixtures nuevos necesarios** (agregar a `test/helpers/booking-fixtures.ts`, molde de `seedProfessional`/`seedAgendaSpace`):
- `seedProfessionalService(t, { professionalId, serviceId })` → inserta en `professional_services` con service-role (no existe helper aún `[VERIFICADO: grep — solo lib/staff-services.ts, test/staff-services.test.ts, lib/types.ts]`). Necesario para probar el mapeo explícito vs. el comodín.
- `seedProfessional` ya existe y devuelve un `professional_id` real activo `[VERIFICADO: booking-fixtures.ts:130-138]`.

**Tests a agregar (nuevo `test/staff-assignment.test.ts` o dentro de `concurrency.test.ts`):**

| Test | Setup | Aserción dura (estado DB) |
|------|-------|---------------------------|
| **ASIGN-02** — asigna un capaz libre | 2 pros activos, ambos comodín (0 filas), `seedTimeBlock` cap 1; `createAppointmentCore({ autoAssign:true, time:'09:00' })` | `result.ok`; el appointment insertado tiene `professional_id ∈ {proA, proB}`; `occupantsAt('09:00') === 1`. |
| **ASIGN-03** — dos "cualquiera" concurrentes → distintos | 2 pros libres, cap 1; `Promise.all` de dos `autoAssign` en '09:00' | 2 ok; los dos `professional_id` son **distintos**; `occupantsAt('09:00') === 2` (no 3). |
| **ASIGN-03b** — solo queda uno → 1 ok + 1 rechazo | 2 pros pero uno pre-ocupado en '09:00'; `Promise.all` de dos `autoAssign` | 1 ok + 1 `slot_taken`; `occupantsAt('09:00') === 2` (el pre + 1). |
| **ASIGN-04** — menos turnos ese día | 2 pros; proA con 2 turnos ese día en otras horas, proB con 0; un `autoAssign` en '09:00' | el appointment cae en **proB** (menos carga). Variante empate 0-0 → gana `created_at` más viejo. |
| **capaz (paridad)** — respeta el mapeo | proA mapeado SOLO a otro servicio (`seedProfessionalService`), proB comodín; `autoAssign` del servicio X | cae en proB; proA nunca elegido. |
| **sede (D-07)** — filtra por location | proA en location L1, proB sin location; reserva en L2 | solo proB es candidato. |

**Regresión de los 4 caminos (D-11):** los tests existentes deben pasar **sin cambios** una vez aplicada 058, porque ninguno setea `autoAssign`:
- Profesional específico + cupos: `test/concurrency.test.ts` (CONC-01/02, CUPOS-02/03) `[VERIFICADO]`
- Cancha / espacio: `test/concurrency.test.ts` (CONC-03, ALQUILER-02) + `test/canchas-booking.test.ts` `[VERIFICADO: nombres en test/]`
- Alta manual: `test/manual-booking.test.ts` `[VERIFICADO]`
- Abono (generación forward): `test/abono-generation.test.ts` + `test/abono-create.test.ts` + `test/abono-cron.test.ts` `[VERIFICADO]`
- Core general: `test/booking-core.test.ts`, `test/booking-public-regression.test.ts` `[VERIFICADO]`

Comando: `npm test` (`vitest run`), corre contra Supabase local con 058 aplicada (`supabase db reset`). El secure-phase (D-12) exige que ASIGN-03 sea un test de **carrera real** (`Promise.all`), no lectura de código — exactamente lo que hace CONC-01/CONC-03.

## Architecture Patterns

### Diagrama de flujo (reserva "cualquiera")

```
booking-client (Phase 10)  ──autoAssign:true──►  route handler (público / manual)
        │                                              │  resuelve business por slug/owner (tenant)
        │                                              ▼
        │                                    createAppointmentCore (lib/booking-core.ts)
        │                                       │  autoAssign? → salta re-checks JS, proId := ANY_MAGIC
        │                                       ▼
        │                                    RPC book_slot_atomic  (SECURITY DEFINER, migr. 058)
        │                                       1. advisory lock (biz+date+time)    ◄── §GA1 ampliado
        │                                       2. si ANY_MAGIC: SELECT candidato    ◄── §GA2 paridad-comodín
        │                                          (capaz+sede+activo+libre, ORDER BY carga,created_at,id)
        │                                          └─ ninguno → RAISE slot_taken (D-10)
        │                                       3. locks de espacio (042) con el pro elegido
        │                                       4. count vs capacity (041) → seat / slot_full
        │                                       5. INSERT professional_id=elegido  ◄── backstop 011/013/042
        │                                       ▼
        └────────────────────────────────  RETURNING (id, cancel_token)
```

### Anti-patterns a evitar

- **Leer libres fuera del RPC y después insertar** (D-05): es la carrera que la fase existe para cerrar. Toda la selección va **dentro** del lock/transacción.
- **Reusar `NULL` para "cualquiera":** rompe el bucket SENTINEL "sin profesional". Usar el UUID mágico.
- **Cambiar la firma o el `RETURNS TABLE`:** fuerza `DROP FUNCTION` y arriesga overloads/regresión. Mantener 14 params + `(id, cancel_token)`.
- **Segunda implementación de la regla del comodín:** la query SQL debe ser **paridad exacta** de `lib/staff-services.ts`, no una reinterpretación.
- **Insertar el UUID mágico como `professional_id`:** insertar siempre el pro **real** elegido (`v_effective_pro`).
- **Filtrar la carga por servicio o sede:** D-02/D-03 exigen carga **total del día, todas las sedes/servicios**.

## Don't Hand-Roll

| Problema | No construir | Usar en su lugar | Por qué |
|----------|--------------|------------------|---------|
| Atomicidad selección→insert | Un `SELECT libres` en JS + `INSERT` | El RPC bajo `pg_advisory_xact_lock` (ya existe) | Cada `.insert()` del client JS es su propia transacción autocommit → ventana TOCTOU `[VERIFICADO: 041_*.sql:80-88]` |
| Anti-sobrecupo / anti-solape / anti-espacio | Chequeos nuevos | Índice 011 + EXCLUDE 013 + RPC 042 (backstop) | Ya son declarativos y atómicos; el `INSERT` del elegido pasa por ellos gratis |
| Regla del comodín | Lógica nueva en SQL "a ojo" | Espejar `professionalsForService` 1:1 | Fuente única testeada (Phase 8); tres capas deben interpretarla idéntico |
| Zona horaria del "día" | Parseo manual de tz | El conteo es por `appointments.date` (columna `date`, ya en día AR de negocio) | El día del turno ya está materializado en `date`; no hace falta recalcular tz para el count |

## Common Pitfalls

### Pitfall 1 — Romper la igualdad byte-a-byte del bucket
**Qué sale mal:** si el COALESCE del bucket en el count/insert deja de coincidir con el índice 011, dos requests del mismo slot dejan de compartir key → sobrecupo. **Cómo evitar:** al recomputar `v_bucket := COALESCE(v_effective_pro, SENTINEL)` tras la selección, usar el MISMO literal `'00000000-0000-0000-0000-000000000000'::uuid` `[VERIFICADO: 041_*.sql:113,138,65]`.

### Pitfall 2 — La selección antes del lock
**Qué sale mal:** correr la query de candidatos ANTES del `pg_advisory_xact_lock` reintroduce la carrera (TOCTOU) que la fase cierra. **Cómo evitar:** lock primero (paso 2), selección después (paso 3). Igual que 042 pone el lock de espacio ANTES del `EXISTS` `[VERIFICADO: 042_*.sql:113-116]`.

### Pitfall 3 — `NULL` reinterpretado
**Qué sale mal:** un negocio sin profesionales que hoy reserva con `professional_id NULL` empieza a fallar porque el RPC intenta "asignar cualquiera" sin candidatos. **Cómo evitar:** "cualquiera" = UUID mágico explícito; `NULL` sigue siendo bucket SENTINEL sin selección.

### Pitfall 4 — Holds expirados inflando la carga o falseando "ocupado"
**Qué sale mal:** un `pending_payment` con `expires_at` pasado pero aún no cancelado hace ver a un pro ocupado (o infla su carga). **Cómo evitar:** guarda `(status='confirmed' OR expires_at IS NULL OR expires_at > now())` tanto en el `NOT EXISTS` de libre como en el `count` de carga, espejando `booking-core.ts:170,177-178` `[VERIFICADO]`.

### Pitfall 5 — Cambiar el tipo de retorno con `CREATE OR REPLACE`
**Qué sale mal:** agregar `professional_id` al `RETURNS TABLE` hace fallar el `CREATE OR REPLACE` con "cannot change return type". **Cómo evitar:** no cambiar el retorno en 058; Phase 10 lee `appointments.professional_id` de la fila.

### Pitfall 6 — Canchas coladas como candidatas
**Qué sale mal:** una cancha (professional con `service_id` NOT NULL) con 0 filas en `professional_services` sería comodín → candidata. **Cómo evitar:** `AND p.service_id IS NULL` en la query de candidatos.

## Code Examples

Todos verificados contra el repo (no hay fuentes externas):

### Lock ampliado (§GA1)
```sql
-- Source: supabase/migrations/041_*.sql:121 (original) → propuesta 058
-- ANTES: ... || v_bucket::text || ... ; DESPUÉS: sin v_bucket
PERFORM pg_advisory_xact_lock(hashtextextended(
  p_business_id::text || p_date::text || p_time::text, 0));
```

### Selección de candidato (§GA2) — ver la query completa arriba, con:
```sql
-- Source: espeja lib/staff-services.ts:43-53 (comodín) + 041_*.sql:76 (solape 013)
ORDER BY (SELECT count(*) FROM appointments a2 WHERE a2.business_id = p_business_id
            AND a2.professional_id = p.id AND a2.date = p_date
            AND a2.status IN ('confirmed','pending_payment')) ASC,
         p.created_at ASC, p.id ASC
LIMIT 1;
```

### Señal "cualquiera" en el core
```ts
// Source: lib/booking-core.ts (propuesta) — flag additivo, cero regresión
const ANY_PROFESSIONAL = '00000000-0000-0000-0000-000000000001'
// ...
if (autoAssign) {
  // saltar validación de professionalId y re-checks JS; el RPC elige.
  proId = ANY_PROFESSIONAL
} else {
  // …validación anti-tampering existente (byte-idéntica a hoy)…
}
```

## State of the Art

| Enfoque viejo | Enfoque de esta fase | Impacto |
|---------------|----------------------|---------|
| Lock por `slot+bucket` | Lock por `business_id+date+time` (más grueso) | Selección de candidato ve estado consistente de TODO el instante (específicas + cualquiera) |
| `professional_id NULL` = único caso "sin/otro" | `NULL` = SENTINEL (sin pro) · UUID mágico = "cualquiera" | Cero regresión del flujo sin-profesional |
| Regla del comodín solo en TS (UI/pública) | Además, espejada en SQL dentro del RPC | La asignación pública respeta el mapeo staff↔servicios |

**Deprecado/no usar:** la forma `pg_advisory_xact_lock(int4, int4)` — el repo usa consistentemente la forma de **un argumento bigint**; no mezclar (son keyspaces distintos).

## Assumptions Log

| # | Claim | Sección | Riesgo si es incorrecto |
|---|-------|---------|-------------------------|
| A1 | Ningún tenant mezcla staff (service_id NULL) + canchas (service_id NOT NULL) en el mismo negocio; el filtro `p.service_id IS NULL` es defensa-en-profundidad. | GA2 | Bajo: aun mezclándolos el filtro excluye canchas correctamente; solo confirmar que no haya un negocio staff cuyos pros tengan service_id por error. |
| A2 | Agregar un parámetro al RPC crearía un overload que PostgREST podría no resolver sin ambigüedad. | GA3 | Bajo: el UUID mágico evita el tema por completo; si el planner prefiere `p_auto_assign`, verificar resolución de overload en Supabase local. |
| A3 | `CREATE OR REPLACE FUNCTION` falla al cambiar columnas del `RETURNS TABLE` ("cannot change return type"). | GA3, Pitfall 5 | Bajo: es comportamiento estándar de Postgres; validable en `supabase db reset` si se intentara. |
| A4 | La colisión de hash de 64 bits entre keys de lock es despreciable y, de ocurrir, solo sobre-serializa (nunca correctness). | GA1 | Muy bajo: propiedad estándar de `hashtextextended`. |
| A5 | Contar la carga con `status IN ('confirmed','pending_payment')` + guarda `expires_at` materializa fielmente D-02 ("no cancelados / holds vigentes"). | GA2 | Bajo: es un heurístico de balanceo, no un invariante de correctness; una pequeña imprecisión no rompe ASIGN-03. Confirmar con el planner si D-02 quiere contar TAMBIÉN holds expirados-no-cancelados (no recomendado). |

## Open Questions (RESOLVED)

1. **¿El error de D-10 debe ser `slot_taken` o `slot_full`?**
   - Qué sabemos: ambos mapean a 409 en el core `[VERIFICADO: booking-core.ts:264-278]`. Para el caso individual (cap 1) `slot_taken` es el más consistente ("el slot está tomado en todo el equipo").
   - Recomendación: `RAISE 'slot_taken'` cuando no hay candidato libre; dejar `slot_full` solo para el excedente de cupo grupal (comportamiento actual).
   - RESOLVED: los plans adoptan `RAISE 'slot_taken'` (D-10) cuando no hay candidato libre — cae en la rama `slot_taken`→409 ya existente del core (09-01 Task 1 acceptance + Task 2 traducción de errores). `slot_full` queda intacto para el excedente de cupo grupal.

2. **¿Phase 9 devuelve el `professional_id` asignado?**
   - Qué sabemos: cambiar el `RETURNS TABLE` fuerza `DROP FUNCTION` (Pitfall 5). El pro real ya queda en `appointments.professional_id`.
   - Recomendación: **no** en Phase 9. Phase 10 lo lee de la fila (o hace su propio bump de firma si lo necesita, decisión de esa fase).
   - RESOLVED: los plans NO tocan el `RETURNS TABLE (id, cancel_token)` (`CREATE OR REPLACE` puro, sin DROP FUNCTION — 09-01 Task 1 firma byte-idéntica). Phase 10 leerá el profesional asignado desde la fila `appointments.professional_id`.

3. **`autoAssign` en el core: ¿flag booleano o `professionalId:'any'`?**
   - Recomendación: flag booleano explícito `autoAssign` (tipado, sin sobrecargar los strings mágicos `'none'`/`null` ya existentes). Decisión final del planner.
   - RESOLVED: los plans adoptan el flag booleano aditivo `autoAssign?: boolean` en `CreateAppointmentInput` + el UUID centinela mágico `ANY_PROFESSIONAL = '00000000-0000-0000-0000-000000000001'` que señala "cualquiera" al RPC (NO se sobrecarga `null`/`'none'`; el sentinel es distinto del cero de "sin profesional") — 09-01 Task 2.

## Security Domain

> `security_enforcement: true`, ASVS L1. secure-phase OBLIGATORIO (D-12). Esta fase reescribe el núcleo de integridad → el gate es no negociable.

### Categorías ASVS aplicables

| ASVS Category | Aplica | Control estándar en esta fase |
|---------------|--------|-------------------------------|
| V1 Architecture | sí | La selección corre dentro de la transacción `SECURITY DEFINER`; el diseño de lock/selección/insert documentado arriba es el control. |
| V4 Access Control (tenant isolation) | **sí (crítico)** | Toda query nueva filtra por `business_id` **explícito** (D-08); candidatos derivados server-side, nunca de IDs del cliente (D-06). |
| V5 Input Validation | sí | El core valida `service`/`location` por `business_id` antes del RPC; "cualquiera" NO acepta lista de pros del cliente (anti-tampering). |
| V6 Cryptography | no | — |
| V11 Business Logic (anti-race) | **sí (crítico)** | El advisory lock ampliado + backstop de constraints garantiza no-sobrecupo/no-doble-asignación bajo concurrencia real. Verificado por test de carrera (D-12). |

### Amenazas STRIDE para este stack (verificar en secure-phase)

| Patrón | STRIDE | Mitigación estándar |
|--------|--------|---------------------|
| Carrera de asignación (dos "cualquiera" → mismo pro / sobrecupo) | Tampering / DoS de integridad | Selección bajo `pg_advisory_xact_lock(biz+date+time)` + índice 011/EXCLUDE 013/RPC 042 como backstop; **test `Promise.all` real** (ASIGN-03). |
| `professionalId` ajeno colado por la vía "cualquiera" | Spoofing / Tampering | Candidatos derivados 100% server-side de `business_id`+`professional_services`; el cliente solo manda `autoAssign` boolean (D-06). |
| Cross-tenant dentro de `SECURITY DEFINER` (RLS no aplica) | Elevation of Privilege | `business_id = p_business_id` explícito en TODA subquery nueva (candidatos, carga, capaz) (D-08). |
| Regresión que degrada `slot_full`/`slot_taken` de los 4 caminos | Tampering (integridad) | Suite de regresión existente sin cambios + argumento de "lock más grueso = más seguro" (§GA1); gate cero-regresión (D-12). |
| Selección que "asigna a alguien ocupado" o "se cae" | DoS / Integridad | Guarda `expires_at` en libre/carga; `RAISE slot_taken` limpio si no hay candidato (D-10). |

## Sources

### Primary (HIGH confidence — código real del repo, autoritativo)
- `supabase/migrations/041_time_blocks_capacity_and_seat.sql` — definición original de `book_slot_atomic`, advisory lock, count vs capacity, seat, constraints 011/013.
- `supabase/migrations/042_spaces_and_coupled_exclusion.sql` — RPC extendido: locks por espacio, `EXISTS` de solape, `slot_taken` cross-espacio, backstop `appointment_spaces`.
- `supabase/migrations/057_professional_services.sql` — tabla puente + RLS + índice `by_service`.
- `lib/booking-core.ts` — `createAppointmentCore`, único caller del RPC, anti-tampering, re-checks JS, traducción de errores.
- `lib/staff-services.ts` — regla del comodín canónica (`professionalsForService`) a espejar en SQL.
- `lib/abono-generation.ts`, `app/api/booking/create/route.ts`, `app/api/appointments/create/route.ts`, `app/api/abonos/create/route.ts` — los 4 consumidores (cero regresión).
- `test/concurrency.test.ts`, `test/helpers/booking-fixtures.ts` — molde del test de carrera real.
- `supabase/schema.sql` — `professionals` (location_id, active, created_at, service_id), vistas públicas acotadas.

### Secondary (MEDIUM)
- `.planning/workstreams/motor-reservas/ROADMAP.md §Phase 9`, `REQUIREMENTS.md`, `08-CONTEXT.md`, `08` migr. — decisiones y semántica del mapeo.

### Tertiary (LOW / [ASSUMED])
- Reglas de Postgres sobre `CREATE OR REPLACE` + return type, overloads de PostgREST, y colisión de hash de 64 bits — conocimiento estándar no re-verificado en esta sesión (Assumptions A2, A3, A4).

## Metadata

**Confidence breakdown:**
- Advisory lock (GA1): HIGH — anclado en 041/042; el argumento "más grueso = más seguro" es demostrable.
- Query de candidatos (GA2): HIGH — paridad 1:1 verificable contra `staff-services.ts`; el filtro de canchas es la única zona [ASSUMED] (A1).
- Firma/señal "cualquiera" + tests (GA3): HIGH para el enfoque UUID mágico + molde de test; MEDIUM en los detalles de Postgres CREATE OR REPLACE (A3) — validables en `supabase db reset`.
- Cero regresión (D-11): HIGH — la firma intacta + flag additivo lo hace estructural.

**Research date:** 2026-07-25
**Valid until:** ~2026-08-25 (estable; solo cambiaría si se toca el RPC en la migración de v0.26 — coordinar orden con esa fase).
