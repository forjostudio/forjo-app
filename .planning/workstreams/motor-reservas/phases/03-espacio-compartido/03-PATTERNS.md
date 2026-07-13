# Phase 3: Espacio Compartido - Pattern Map

**Mapped:** 2026-06-29
**Files analyzed:** 9 (1 created, 8 modified)
**Analogs found:** 9 / 9 (todos los analogs viven en el repo; cero dependencia nueva)

> Esta fase NO introduce librerías ni patrones nuevos. Cada archivo extiende un mecanismo
> que el repo ya usa y testea (advisory lock, EXCLUDE gist, traducción de constraint, RLS por
> op WITH CHECK, terminología por vertical). El riesgo no está en inventar — está en mantener
> la **bucketización byte-idéntica** (`COALESCE(professional_id, SENTINEL)`) y el predicado de
> solape **consistentes** entre las 4 superficies: RPC lock, RPC EXISTS, backstop EXCLUDE, availability.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/042_spaces_and_coupled_exclusion.sql` | migration | transform (DDL + atomic write) | `supabase/migrations/041_time_blocks_capacity_and_seat.sql` | exact (mismo `book_slot_atomic` + EXCLUDE gist) |
| `lib/booking-core.ts` (MOD) | service | request-response (CRUD) | self (re-check `sameBucket` existente, líneas 106-156) | exact |
| `app/api/booking/availability/route.ts` (MOD) | route | request-response (read) | self (`busy`/`full`, líneas 77-112) | exact |
| `lib/types.ts` (MOD) | model | — | self (`Professional` 105-117, `TimeBlock` 81-94) | exact |
| `lib/verticals.ts` (MOD) | config | — | self (`VerticalTerminology` 7-17, `getVertical` 118-121) | exact |
| `lib/use-terminology.tsx` (MOD) | provider | — | self (consume `VerticalTerminology` tal cual) | exact |
| `app/(dashboard)/settings/settings-client.tsx` (MOD) | component | CRUD | self (CRUD de `professionals`, líneas 418-487) | exact |
| `test/concurrency.test.ts` (MOD) | test | event-driven (concurrencia) | self (CONC-01, líneas 89-110) | exact |
| `test/helpers/booking-fixtures.ts` (MOD) | test | file-I/O (seed) | self (`seedTimeBlock`, líneas 100-123) | exact |

**Callers que heredan la exclusión sin tocarse:** `app/api/booking/create/route.ts` y
`app/api/appointments/create/route.ts` (ambos llaman a `createAppointmentCore`; la exclusión de
espacio se agrega una sola vez en el core → ambos la heredan sin cambios).

---

## Pattern Assignments

### `supabase/migrations/042_spaces_and_coupled_exclusion.sql` (migration, NEW)

**Analog principal:** `supabase/migrations/041_time_blocks_capacity_and_seat.sql` (el RPC atómico)
+ `supabase/migrations/040_appointments_clients_insert_with_check.sql` (policies por op WITH CHECK).

**(1) Estructura/header de migración** — copiar el molde de comentarios denso en español de 041
(líneas 1-37): bloque "Qué hace" / "Qué NO hace (invariantes del proyecto)". Documentar: aditiva,
NO push remoto, validada con `supabase db reset` local (PG17), prod a mano + `NOTIFY pgrst, 'reload schema';`.

**(2) Advisory lock atómico — extender `book_slot_atomic` IN-PLACE** (no RPC nuevo). El cuerpo
actual está en `041` líneas 95-174. El lock slot+bucket existente (líneas 121-122):
```sql
PERFORM pg_advisory_xact_lock(hashtextextended(
  p_business_id::text || v_bucket::text || p_date::text || p_time::text, 0));
```
Agregar TRAS ese lock: resolver el set de espacios vía la puente y tomar un lock por CADA `space_id`
en **orden ascendente** (RESEARCH Pattern 1, anti-deadlock Pitfall 2):
```sql
SELECT array_agg(asp.space_id ORDER BY asp.space_id) INTO v_space_ids
  FROM agenda_spaces asp
 WHERE asp.business_id = p_business_id AND asp.professional_id = p_professional_id;
IF v_space_ids IS NOT NULL THEN
  FOREACH v_sid IN ARRAY v_space_ids LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(p_business_id::text || v_sid::text, 0));
  END LOOP;
  -- EXISTS anti-solape cross-bucket, EXCLUYENDO la propia agenda (Pitfall 3, auto-conflicto F11):
  --   COALESCE(a.professional_id, sentinel) <> COALESCE(p_professional_id, sentinel)
  --   AND other.space_id = ANY(v_space_ids) AND tsrange(...) && tsrange(...)
  -- → RAISE EXCEPTION 'slot_taken' USING ERRCODE = 'P0001';  (reusar slot_taken, NO space_taken)
END IF;
```
**Invariante crítico (Pitfall 1):** el `COALESCE(professional_id, '00000000-0000-0000-0000-000000000000'::uuid)`
debe ser byte-idéntico al del índice 011 (041:65), al EXCLUDE 013 (041:76) y al `v_bucket` (041:113).
La función SIGUE siendo `SECURITY DEFINER SET search_path = public` y re-impone `p_business_id`.

**(3) Backstop EXCLUDE gist sobre proyección turno×espacio** — molde del EXCLUDE 013
(`041` línea 76; `baseline.sql:649`) llevado a una tabla nueva `appointment_spaces`. RESEARCH Pattern 3:
```sql
ALTER TABLE public.appointment_spaces
  ADD CONSTRAINT appointment_spaces_no_overlap
  EXCLUDE USING gist (business_id WITH =, space_id WITH =, slot WITH &&);
```
Poblada por trigger AFTER INSERT en `appointments` (expande agenda→espacios vía `agenda_spaces`);
AFTER UPDATE de status a cancelled/expired → DELETE de las filas (Pitfall 4). `btree_gist` YA habilitado
(lo usa 013). **Recortable:** este backstop es el candidato a cortar si la fase crece (plan separado al final).

**(4) Tablas `spaces` + `agenda_spaces` con RLS por op WITH CHECK** — copiar literal el patrón de
`040` (líneas 30-36) y `041` (líneas 192-200). RESEARCH Code Examples / Migración:
```sql
CREATE POLICY "spaces tenant insert" ON public.spaces FOR INSERT
  WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE owner_id = (SELECT auth.uid())));
```
4 policies por op (select/insert/update/delete) para cada tabla. `agenda_spaces.professional_id`
NOT NULL FK (Pitfall 1 / A2: la sentinela no tiene espacios). **NO dar read anon** a estas tablas (D-06).

**GRANT del RPC redefinido** (igual que 041:183) a `anon, authenticated, service_role`.

---

### `lib/booking-core.ts` (service, request-response) — MODIFY

**Analog:** self. El re-check de bucket existente está en líneas 106-156 (resuelve `bucket`, trae
`clashes`, define `overlaps`, filtra `sameBucket`, decide `taken`).

**Punto de inserción:** tras el `sameBucket` (línea 141) y antes/junto al chequeo `taken`. RESEARCH Pattern 2.
Es **solo UX** (rechazo temprano); la autoridad es el RPC. Reusar:
- `SENTINEL` (línea 15), `bucket = proId ?? SENTINEL` (línea 108), `overlaps(a)` (líneas 136-140),
  `nowMs` (línea 109), el mismo predicado de "ocupado de verdad" (líneas 144-146).
- Query nueva a `agenda_spaces` filtrada por `.eq('business_id', business.id)` (mismo estilo que las
  queries de líneas 113-118): resolver `mySpaces`, luego `siblings` (`.in('space_id', spaceIds).neq('professional_id', bucket)`),
  marcar `spaceClash` contra los `clashes` YA traídos.
- Si la agenda no tiene espacios mapeados → skip total (comportamiento individual/cupos intacto).
- Retorno: `return { ok: false, error: 'slot_taken', status: 409 }` (reusar el código existente, línea 155).

**Traducción de constraint (sin cambio):** el `23P01` del backstop EXCLUDE cae en el handler existente
de líneas 237-239 (`rpcErr?.code === '23505' || rpcErr?.code === '23P01'` → `slot_taken`). El `RAISE 'slot_taken'`
del RPC llega por `message` — agregar (o reusar) el branch tipo línea 232 si se levanta como P0001.

---

### `app/api/booking/availability/route.ts` (route, read) — MODIFY

**Analog:** self. La lógica `busy`/`full` está en líneas 77-112. RESEARCH Pattern 4.

**Punto de inserción:** tras resolver `bucket` (línea 80). Reusar `SENTINEL` (línea 11), el set `appts`
ya traído del negocio (líneas 37-42, SIN filtrar aún por bucket), el filtro de holds vencidos (línea 84).
- Traer agendas hermanas: `agenda_spaces` → `mySpaces` (por `bucket`) → `siblingBuckets`
  (`.in('space_id', ...).neq('professional_id', bucket)`), con `.eq('business_id', business.id)`.
- `siblingBusy`: turnos en agenda hermana que solapan → agregar a **`busy`** (NO a `full`): el bloqueo de
  espacio es solape 1-a-la-vez, no cupo lleno (Pitfall 5; `full` queda reservado para count>=capacity).
- **D-06 / no-leak (LOCKED):** la respuesta NO cambia de forma — sigue `{ ok, busy, full }`
  (línea 112). El test CUPOS-02 (`Object.keys(body).sort() === ['busy','full','ok']`,
  `concurrency.test.ts:202`) DEBE seguir verde.

---

### `lib/types.ts` (model) — MODIFY

**Analog:** self. `Professional` (105-117), `TimeBlock` con `capacity` (81-94), `Appointment` con
`seat`/`is_group` (178-214). Convención: campos en **snake_case** (espejo de la fila DB), `string`/`number`/`| null`,
comentario en español en cada campo no trivial.

Agregar:
```ts
export interface Space {
  id: string
  business_id: string
  name: string
  created_at: string
}
export interface AgendaSpace {        // puente professional(agenda) ↔ space
  business_id: string
  professional_id: string
  space_id: string
}
```

---

### `lib/verticals.ts` (config) — MODIFY

**Analog:** self. `VerticalTerminology` (7-17), los 3 verticales (35-93), `getVertical`/`resolveVertical`
(118-132). El archivo es **framework-agnostic** (sin React/iconos) — mantenerlo así.

Agregar `resource` / `resources` a `VerticalTerminology` y a cada vertical (default `'Profesional'`/`'Equipo'`).
"Cancha de fútbol" YA es un `type` del vertical `general` (línea 79) → la resolución debe poder dar
"Cancha" para ese `type` sin romper los otros verticales. **Recomendación research (A1, no LOCKED):**
override por `type` (`TYPE_TERMINOLOGY_OVERRIDE: Record<string, Partial<VerticalTerminology>>`) aplicado
en `resolveVertical`/`getVertical` tras el spread. Label-only, cero impacto en datos.

---

### `lib/use-terminology.tsx` (provider) — MODIFY (mínimo)

**Analog:** self. Consume `VerticalTerminology` tal cual (líneas 27-29). Si se agregan `resource`/`resources`
a `VerticalTerminology`, este provider los expone sin cambios (solo se beneficia del tipo extendido). El `DEFAULT`
(línea 7) ya cae a `general`.

---

### `app/(dashboard)/settings/settings-client.tsx` (component, CRUD) — MODIFY

**Analog:** self. El CRUD de `professionals` (estado local + browser supabase client + `toast` + UI optimista)
está en líneas 418-487. **Patrón a copiar tal cual** para el alta de espacios + mapeo agenda→espacios (D-04):
- Estado: `const [professionals, setProfessionals] = useState<Professional[]>(initialProfessionals)` (418),
  `newPro`/`savingPro`/`editingPro` (419-424). Replicar para `spaces` + `agenda_spaces`.
- Escritura: `supabase.from('professionals').insert(...).select().single()` (482-487) +
  `.update(...).eq('id', ...)` (462) + actualización optimista de estado (`setProfessionals(prev => ...)`, 464)
  + `toast.error`/`toast.success` (463, 467).
- **Aislamiento:** las queries del dashboard van por el browser client con RLS; la nueva UI escribe
  `spaces`/`agenda_spaces` confiando en RLS WITH CHECK por tenant (sin pasar `business_id` falsificable).
- Carga inicial: viene como prop desde `settings/page.tsx` (Server Component, `.eq('business_id', business.id)`).
- UI: reusar el lenguaje visual existente (`vaul`/shadcn `@/components/ui`), sin dependencias nuevas.

---

### `test/concurrency.test.ts` (test, concurrencia) — MODIFY (CONC-03)

**Analog:** self. CONC-01 (líneas 89-110) es el molde EXACTO. RESEARCH §Phase Requirements / CONC-03.

Copiar la estructura de CONC-01: `seedTimeBlock` + dos `createAppointmentCore` en `Promise.all`
(líneas 97-100) + assert `oks.length === 1` / rechazos === 1 (102-105) + **verificación independiente
del estado de la DB** vía `occupantsAt` (líneas 71-80, 109). Para CONC-03: dos altas en paralelo sobre
**agendas distintas que comparten un espacio** → exactamente 1 ok + 1 `slot_taken`. Reusar
`baseInput()` (52-67), `describe.skipIf(!hasSupabaseCreds)` (25), `DATE = '2031-03-03'` (23, lunes).

---

### `test/helpers/booking-fixtures.ts` (test, seed) — MODIFY

**Analog:** self. `seedTimeBlock` (líneas 100-123) es el molde para `seedSpace` / `seedAgendaSpace`:
service-role `seeded.admin.from(...).insert(...).select('id').single()` con throw en error (líneas 109-122).
Extender `SeededTenant` (20-33) con un 2º `professionalId` (agenda hermana) si CONC-03 lo necesita.
Teardown por CASCADE de `business` ya cubre las tablas nuevas (FK `ON DELETE CASCADE` a `businesses`).

---

## Shared Patterns

### Bucketización byte-idéntica (el invariante #1 de la fase)
**Source:** `SENTINEL = '00000000-0000-0000-0000-000000000000'` en `lib/booking-core.ts:15`,
`availability/route.ts:11`, índice 011 `041:65`, EXCLUDE 013 `041:76`, `v_bucket` `041:113`.
**Apply to:** RPC lock, RPC EXISTS, backstop EXCLUDE, availability, re-check JS. **Toda** comparación
de agenda usa `COALESCE(professional_id, SENTINEL)` exacto. Mezclar `NULL` y sentinela rompe la
serialización → sobre-reserva (Pitfall 1).

### Advisory lock atómico (NUNCA count suelto sin lock)
**Source:** `book_slot_atomic`, `041:121-122` (`pg_advisory_xact_lock(hashtextextended(...))`).
**Apply to:** todo chequeo de conflicto de espacio en el write path. Lock por **espacio individual**
en **orden ascendente** (no por hash del set; Pitfall 2 / anti-deadlock). El lock va ANTES del EXISTS.

### EXCLUDE gist como backstop declarativo
**Source:** `appointments_no_overlap` `041:74-76` / `baseline.sql:649`.
**Apply to:** `appointment_spaces_no_overlap` sobre la proyección turno×espacio. Único backstop real
si el lock tiene un bug (Pitfall 6). `23P01` → `slot_taken` ya manejado en `booking-core.ts:237-239`.

### RLS por operación con WITH CHECK por tenant
**Source:** `040:30-36`, `041:192-200`.
**Apply to:** `spaces`, `agenda_spaces`, `appointment_spaces`. 4 policies por op,
`business_id IN (SELECT id FROM businesses WHERE owner_id = (SELECT auth.uid()))`. NO read anon (D-06).

### Errores `{ ok, error }` snake_case + status coherente
**Source:** `booking-core.ts:155,238` (`{ ok: false, error: 'slot_taken', status: 409 }`),
`appointments/create/route.ts:28,44,89`.
**Apply to:** conflicto de espacio = **reusar `slot_taken` 409** (no agregar `space_taken`; research recomendado).

### Anti-tampering de tenant (re-validar ids del cliente por business_id)
**Source:** `booking-core.ts:83-104` (service/professional re-validados por `business_id`),
`appointments/create/route.ts:146-154`.
**Apply to:** cualquier `spaceId`/`professionalId` que llegue del cliente — re-validar por `business_id`
antes de usarlo en el mapeo/exclusión.

### Migración aditiva validada local
**Source:** headers de `040`/`041` ("NO push remoto; `supabase db reset` local PG17; prod a mano").
**Apply to:** `042`. Post-deploy: regenerar `supabase/schema.sql` (igual que 037/039) + `NOTIFY pgrst, 'reload schema';`.

---

## No Analog Found

Ninguno. Todos los archivos extienden un patrón existente del repo. Las tres tablas nuevas
(`spaces`, `agenda_spaces`, `appointment_spaces`) reusan el molde de DDL/RLS de `040`/`041` y el
molde de EXCLUDE gist de `013`/`041`.

---

## Metadata

**Analog search scope:** `lib/`, `app/api/booking/`, `app/api/appointments/`,
`app/(dashboard)/settings/`, `supabase/migrations/`, `test/` + `test/helpers/`.
**Files scanned:** 11 (booking-core, 041, 040, availability, appointments/create, booking-fixtures,
verticals, use-terminology, types, settings-client, concurrency.test).
**Pattern extraction date:** 2026-06-29
**Note:** `.planning/codebase/TESTING.md` está DESACTUALIZADO (dice "no hay framework de tests").
El molde real de tests es `test/concurrency.test.ts` + `test/helpers/booking-fixtures.ts` (Vitest ^4.1.9).
