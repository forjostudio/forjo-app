# Phase 9: Asignación automática atómica de profesional - Pattern Map

**Mapped:** 2026-07-25
**Files analyzed:** 4 (1 migration CREATE · 1 lib MODIFY · 1 test CREATE · 1 fixtures MODIFY) + 1 parity reference (no-modify)
**Analogs found:** 4 / 4 (todos con analog exacto en el repo)

> Dominio 100% interno (SQL + TS del propio repo). No hay analogs "por rol genérico": cada archivo tiene un antecesor directo ya en producción. Las líneas citadas son las reales verificadas en esta sesión.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/058_*.sql` (CREATE) | migration / PL/pgSQL RPC | transform + event-driven (write path atómico) | `supabase/migrations/042_spaces_and_coupled_exclusion.sql` (RPC vigente) + `041_time_blocks_capacity_and_seat.sql` (definición base) | exact |
| `lib/booking-core.ts` (MODIFY) | service / core compartido | request-response → RPC | sí mismo (extensión aditiva del path existente) | self |
| `test/staff-assignment.test.ts` (CREATE) | test de concurrencia | event-driven / race (Promise.all) | `test/concurrency.test.ts` (CONC-01/CONC-03) | exact |
| `test/helpers/booking-fixtures.ts` (MODIFY: `seedProfessionalService`) | test fixture / seeder | CRUD (service-role insert) | `seedAgendaSpace` (líneas 158-163, mismo molde puente) | exact |
| `lib/staff-services.ts` (REFERENCE — NO modificar) | utility / regla de negocio pura | transform (filter) | fuente de paridad para el SQL de candidatos | parity-source |

## Shared Patterns

### Migración numerada `CREATE OR REPLACE FUNCTION` idempotente
**Source:** `042_spaces_and_coupled_exclusion.sql:108-244` y `041_*.sql:95-183`
**Apply to:** `058_*.sql`
- Header de comentario denso en español explicando contexto (fase/reqs), "Qué hace" y "Qué NO hace (invariantes)". Ver `042:1-40`, `041:1-38`, `057:1-40`.
- `CREATE OR REPLACE FUNCTION "public"."book_slot_atomic"( ...14 params idénticos... ) RETURNS TABLE ("id" uuid, "cancel_token" uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public` — copiar la firma **byte-idéntica** de `042:126-142` (RESEARCH GA3 / Pitfall 5: cambiar params o RETURNS obliga a DROP → regresión).
- Re-emitir `ALTER FUNCTION ... OWNER TO "postgres";` y `GRANT EXECUTE ON FUNCTION ... TO "anon", "authenticated", "service_role";` con la firma completa de 14 tipos (`042:240-244`).
- Validación local: `supabase db reset` (replay 001→058). Prod a mano + `NOTIFY pgrst, 'reload schema';` + regenerar `supabase/schema.sql` (patrón `057:38-40`).

### Sentinel de bucket byte-idéntico (Pitfall 1)
**Source:** `041_*.sql:65, 113, 138` · `042_*.sql:144, 183, 187-188` · `booking-core.ts:15`
**Apply to:** `058_*.sql` (recompute de `v_bucket` tras la selección) y cualquier subquery nueva.
Literal exacto en todas las capas: `'00000000-0000-0000-0000-000000000000'::uuid`. El UUID mágico "cualquiera" (`...0001`) es DISTINTO y **nunca** se inserta como `professional_id`.

### Filtro de tenant explícito dentro de `SECURITY DEFINER` (D-08)
**Source:** `041_*.sql:129,137` · `042_*.sql:164,184`
**Apply to:** toda subquery nueva de `058` (candidatos, carga, capaz-comodín).
`WHERE ...business_id = p_business_id` en cada `FROM` — RLS no aplica dentro de la función.

## Pattern Assignments

### `supabase/migrations/058_*.sql` (migration, PL/pgSQL RPC)

**Analog primario:** `042_spaces_and_coupled_exclusion.sql:108-244` (RPC vigente en prod — copiar TODO el cuerpo y modificarlo, NO reescribir de cero).
**Analog secundario:** `041_*.sql:95-174` (misma función, versión previa — el bloque de count/seat/insert es idéntico en ambas).

**Cuerpo actual a copiar como base** (`042:142-238`) — el orden real de bloques hoy:
1. `DECLARE v_bucket := COALESCE(p_professional_id, sentinel)`, `v_capacity`, `v_occupied`, `v_seat`, `v_space_ids`, `v_sid` (`042:143-149`).
2. Lock slot+bucket: `PERFORM pg_advisory_xact_lock(hashtextextended(p_business_id::text || v_bucket::text || p_date::text || p_time::text, 0));` (`042:154-155`).
3. Bloque de espacio 042: `array_agg(... ORDER BY asp.space_id)` → `FOREACH ... pg_advisory_xact_lock(hashtextextended(p_business_id::text || v_sid::text, 0))` → `EXISTS` de solape → `RAISE slot_taken` (`042:162-196`).
4. Capacity: `SELECT COALESCE(MAX(tb.capacity),1)` por `day_of_week + ventana` (`042:201-205`).
5. Ocupación: `SELECT count(*) ... = v_bucket` (`042:209-214`).
6. Seat + `RAISE slot_full` para cupo>1, seat=0 para cupo 1 (`042:217-225`).
7. `RETURN QUERY INSERT INTO appointments (...) VALUES (...) RETURNING appointments.id, appointments.cancel_token;` (`042:226-236`).

**Cambios que introduce 058** (según RESEARCH §"Secuencia final del RPC" y Gray Areas):
- **Nuevo DECLARE:** `v_effective_pro uuid`, `v_is_any boolean`, constante mágica `'00000000-0000-0000-0000-000000000001'`.
- **Lock AMPLIADO (§GA1):** quitar `v_bucket::text` del hash del slot lock →
```sql
PERFORM pg_advisory_xact_lock(hashtextextended(
  p_business_id::text || p_date::text || p_time::text, 0));   -- SIN v_bucket
```
- **Selección de candidato (§GA2), DESPUÉS del lock, ANTES del bloque de espacio:** query `SELECT p.id INTO v_effective_pro FROM professionals p WHERE ... ORDER BY (count carga) ASC, p.created_at ASC, p.id ASC LIMIT 1;` con la paridad-comodín de `staff-services.ts` (ver abajo) + `IF v_effective_pro IS NULL THEN RAISE 'slot_taken'`. Ver query completa en RESEARCH GA2:179-222.
- **Recompute:** `v_bucket := COALESCE(v_effective_pro, sentinel)` y usar `v_effective_pro` en el bloque de espacio (`array_agg` keya por `v_effective_pro`), en el count y en el `INSERT` (`professional_id = v_effective_pro`).

**Paridad-comodín SQL (debe reflejar 1:1 `staff-services.ts:48-52`):**
```sql
AND ( NOT EXISTS (SELECT 1 FROM professional_services ps
                  WHERE ps.business_id = p_business_id AND ps.professional_id = p.id)
      OR EXISTS  (SELECT 1 FROM professional_services ps
                  WHERE ps.business_id = p_business_id AND ps.professional_id = p.id
                    AND ps.service_id = p_service_id) )
```
El índice `professional_services_by_service (service_id, professional_id)` de `057:87` sirve el segundo EXISTS.

**Pitfalls confirmados contra el código:**
- `AND p.service_id IS NULL` excluye canchas (Pitfall 6 / `professionals.service_id` de migr. 043).
- Guarda holds vigentes `(a.status='confirmed' OR a.expires_at IS NULL OR a.expires_at > now())` espeja `booking-core.ts:170,177-178` (Pitfall 4).
- Filtro sede `(p.location_id = p_location_id OR p.location_id IS NULL)` — `professionals.location_id` nullable.

---

### `lib/booking-core.ts` (service, core compartido)

**Analog:** sí mismo — extensión **aditiva**, cero cambio para los 4 callers actuales.

**Punto de inserción del flag** — tipo de entrada (`booking-core.ts:26-47`):
```ts
export type CreateAppointmentInput = {
  // …existente…
  autoAssign?: boolean   // Phase 9: "cualquiera" — el RPC elige el profesional
}
```

**Validación anti-tampering a saltear cuando `autoAssign`** (`booking-core.ts:93-104`): el bloque que resuelve `proId` desde `professionalId` re-validando por `business_id`. Con `autoAssign`, en vez de resolver un pro, se pasa `proId = ANY_PROFESSIONAL`.

**Re-checks JS a envolver en `if (!autoAssign) { … }`** (son solo UX, la autoridad es el RPC — comentarios `booking-core.ts:236-243`):
- Re-check de solape por bucket (`113-141`).
- Re-check de espacio compartido (`152-174`).
- Re-check capacity-aware `taken && slotCapacity` (`177-189`).
- Liberación de holds vencidos per-bucket (`196-208`) — también se saltea (no hay bucket concreto; la query de candidatos ya contempla `expires_at`).

**Llamada al RPC a preservar intacta** (`booking-core.ts:244-261`): mismo objeto de 14 `p_*`; solo cambia el valor de `p_professional_id` (proId real o UUID mágico). El bloque de traducción de errores `rpcErr` (`263-281`: `slot_full`→409, `slot_taken`→409, `23505`/`23P01`→`slot_taken`) **no cambia** — el `RAISE 'slot_taken'` de "sin candidato" (D-10) cae en la rama `271-273` ya existente.

**Constante mágica** (RESEARCH Code Examples): `const ANY_PROFESSIONAL = '00000000-0000-0000-0000-000000000001'` — distinta del `SENTINEL` de `booking-core.ts:15`.

---

### `test/staff-assignment.test.ts` (test de concurrencia, race)

**Analog:** `test/concurrency.test.ts` — molde EXACTO. Copiar su esqueleto:
- `describe.skipIf(!hasSupabaseCreds)(...)` (`concurrency.test.ts:25`).
- `beforeAll` → `seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })`, `supabase = t.admin` (`29-34`).
- `afterAll` → `teardownOneTenant(t)` (`36-38`).
- `afterEach` → limpiar `appointments`, `time_blocks`, `agenda_spaces`, `spaces` (+ agregar `professional_services`) por `business_id` (`41-50`).
- `baseInput()` helper (`56-71`) — agregar `autoAssign: true` en los tests de asignación.
- `occupantsAt(time)` — verificación independiente del estado de la DB, NO de los retornos del core (`75-84`).
- **Race real:** `const [a, b] = await Promise.all([...])` con dos `createAppointmentCore` sobre el mismo `time` (`101-104`, `259-262`). Aserción dura: `oks.length === 1/2` + `occupantsAt(...)` exacto (`106-113`).

**Tests a agregar** (matriz en RESEARCH GA3:300-307):
| Test | Analog de estructura |
|------|----------------------|
| ASIGN-02 (asigna un capaz libre) | CONC-01 sin el `slot_full` (`93-114`) |
| ASIGN-03 (dos "cualquiera" concurrentes → distintos) | CONC-03 `Promise.all` (`245-275`), assert `professional_id` distintos + `occupantsAt===2` |
| ASIGN-03b (queda uno → 1 ok + 1 slot_taken) | CONC-01 (`101-113`) |
| ASIGN-04 (menos turnos ese día) | secuencial estilo CUPOS-03 (`140-160`), leer `professional_id` insertado |
| capaz/paridad (respeta mapeo) | usa nuevo `seedProfessionalService` |
| sede (D-07) | usa `seedProfessional` + location |

**Leer el pro asignado** (Phase 9 no cambia el RETURNS): `SELECT professional_id FROM appointments WHERE id = <appointmentId>` con `t.admin`, estilo `occupantsAt`.

---

### `test/helpers/booking-fixtures.ts` (fixture — agregar `seedProfessionalService`)

**Analog:** `seedAgendaSpace` (`booking-fixtures.ts:158-163`) — molde exacto de puente sin id sintético:
```ts
export async function seedAgendaSpace(seeded, args: { professionalId; spaceId }): Promise<void> {
  const ins = await seeded.admin.from('agenda_spaces')
    .insert({ business_id: seeded.businessId, professional_id: args.professionalId, space_id: args.spaceId })
  if (ins.error) throw new Error(`seed: insert agenda_space falló: ${ins.error?.message}`)
}
```
**Nuevo `seedProfessionalService(seeded, { professionalId, serviceId })`:** mismo patrón, insertando en `professional_services` con `business_id + professional_id + service_id` (columnas de `057:48-53`), sin retorno (PK compuesta), throw en error. `seedProfessional` (`130-138`) ya existe para el 2º pro.

---

### `lib/staff-services.ts` (REFERENCE — parity source, NO modificar)

`professionalsForService` (`staff-services.ts:43-53`) es la regla canónica del comodín. El SQL de candidatos de `058` debe ser **paridad semántica exacta**, no una reinterpretación:
```ts
if (rows.length === 0) return true            // comodín: 0 filas = ofrece TODO
return rows.some((r) => r.service_id === serviceId)
```
→ `NOT EXISTS (ninguna fila) OR EXISTS (fila del servicio)`. NO tocar este archivo.

## No Analog Found

Ninguno. Los 4 archivos tienen antecesor directo en el repo. Única zona [ASSUMED] (RESEARCH A1): que ningún tenant mezcle staff (`service_id` NULL) + canchas (`service_id` NOT NULL) — el filtro `p.service_id IS NULL` es correcto igual; confirmar con el planner.

## Metadata

**Analog search scope:** `supabase/migrations/` (041, 042, 057), `lib/` (booking-core.ts, staff-services.ts), `test/` (concurrency.test.ts, helpers/booking-fixtures.ts).
**Files scanned:** 7 leídos completos + 2 (CONTEXT/RESEARCH) de entrada.
**Pattern extraction date:** 2026-07-25
