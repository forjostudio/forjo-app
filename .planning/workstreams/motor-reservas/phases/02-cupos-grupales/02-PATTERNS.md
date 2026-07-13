# Phase 2: Cupos Grupales - Pattern Map

**Mapped:** 2026-06-26
**Files analyzed:** 9 (1 migration, 1 core, 2 API callers, 1 availability, 2 dashboard client, 1 types, 1 test + fixtures)
**Analogs found:** 9 / 9 (todos con analog in-repo; cero patrón inventado)

> Esta fase toca el core endurecido en v0.9. Los analogs de `lib/booking-core.ts` y de los constraints del baseline son load-bearing: copiar el patrón exacto, no aproximar. **CORRECCIÓN sobre canonical_refs:** el editor de `time_blocks` (CUPOS-01) NO vive en `settings-client.tsx` (ahí no se editan time_blocks). Vive en `agenda-client.tsx` (grilla semanal, líneas 555-589) y se persiste por delete-all + insert (líneas 245-257). El research Open Question #4 ya lo anticipaba; este mapeo lo confirma leyendo ambos archivos.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/041_*.sql` | migration | transform (DDL) | `040_appointments_clients_insert_with_check.sql` + `00000000000000_baseline.sql` (011/013) | role-match (estilo) + exact (constraints a redefinir) |
| `lib/booking-core.ts` | service / core | request-response (CRUD insert) | sí mismo (líneas 184-212, INSERT + traducción de constraint) | self / exact |
| `app/api/booking/create/route.ts` | route handler | request-response | sí mismo (líneas 107-109, mapeo result.error → HTTP) | self / exact |
| `app/api/appointments/create/route.ts` | route handler | request-response | sí mismo (líneas 88-90, idéntico mapeo) | self / exact |
| `app/api/booking/availability/route.ts` | route handler | request-response (read) | sí mismo (líneas 49-59, bucket + busy) | self / exact |
| `app/(dashboard)/agenda/agenda-client.tsx` | component (client) | event-driven (form) + CRUD | sí mismo (grilla time_blocks 555-589; Dialog 736-766 para el roster) | self / exact |
| `app/(dashboard)/agenda/page.tsx` | page (server) | CRUD (read) | sí mismo (Promise.all de queries 28-43) | self / exact |
| `lib/types.ts` | model (interfaces) | — | `TimeBlock` (81-91), `Appointment` (175-206) | self / exact |
| `test/concurrency.test.ts` (NEW) | test | event-driven (concurrencia) | `test/booking-core.test.ts` (Test B/D) + `test/helpers/booking-fixtures.ts` | role-match |

## Pattern Assignments

### `supabase/migrations/041_*.sql` (migration, DDL transform)

**Analog A — estilo de policy WITH CHECK por tenant:** `supabase/migrations/040_appointments_clients_insert_with_check.sql` (líneas 1-37)

Comentario denso en español arriba (qué hace / qué NO hace / invariantes), policies permissive una-por-operación, y la forma exacta de la cláusula tenant a copiar literal para las nuevas policies de `time_blocks.capacity`:

```sql
CREATE POLICY "appointments tenant insert" ON "public"."appointments" FOR INSERT WITH CHECK (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));
```

> El comentario de 040 declara explícitamente "NO toca los constraints 011/013". La migración 041 SÍ los redefine — invertir esa frase y documentar el porqué (capacity-aware, cero regresión cupo 1).

**Analog B — constraint 011 a redefinir con `seat`:** `00000000000000_baseline.sql:797` (citado en RESEARCH §Current Integrity Baseline). Índice único parcial sobre `(business_id, COALESCE(professional_id, sentinel), date, time) WHERE status IN (confirmed, pending_payment)`. La redefinición agrega `, seat` como última columna del índice (RESEARCH Pattern 2).

**Analog C — constraint 013 (EXCLUDE gist) a condicionar:** `baseline.sql:649` (leído verbatim):

```sql
ALTER TABLE ONLY "public"."appointments"
    ADD CONSTRAINT "appointments_no_overlap" EXCLUDE USING "gist" ("business_id" WITH =, COALESCE("professional_id", '00000000-0000-0000-0000-000000000000'::"uuid") WITH =, "tsrange"(("date" + "time"), (("date" + "time") + "make_interval"("mins" => COALESCE("duration_minutes", 30)))) WITH &&) WHERE (("status" = ANY (ARRAY['confirmed'::"text", 'pending_payment'::"text"])));
```

Redefinición (RESEARCH Pattern 3, Opción A): agregar `AND NOT is_group` al `WHERE` (columna desnormalizada `is_group`/`capacity` en `appointments`, escrita por el RPC). `time_blocks` actual (`baseline.sql:633-642`) NO tiene `date`/`time` — `capacity` se agrega ahí como `smallint NOT NULL DEFAULT 1 CHECK (capacity >= 1)`.

**Patrón de validación post-migración:** `supabase db reset` local (PG17) antes de prod + regenerar `supabase/schema.sql` (patrón del repo, ver commits 040 / MEMORY infra-testing). `GRANT EXECUTE ON FUNCTION book_slot_atomic TO anon, authenticated, service_role`.

---

### `lib/booking-core.ts` (service/core, request-response)

**Analog:** sí mismo, líneas 184-212 — el bloque a REEMPLAZAR (INSERT directo → `supabase.rpc('book_slot_atomic', {...})`).

**Core INSERT + traducción de constraint actual** (184-212) — el patrón que el RPC reemplaza pero cuyo MAPEO de error se conserva/extiende:

```typescript
const { data: appt, error: insertErr } = await supabase
  .from('appointments')
  .insert({ business_id: business.id, client_id: clientId, /* ... */ status: initialStatus, expires_at: expiresAt })
  .select('id, cancel_token')
  .single()

if (insertErr || !appt) {
  // 23505 = índice 011 (mismo inicio); 23P01 = exclusion constraint 013 (solapamiento).
  if (insertErr?.code === '23505' || insertErr?.code === '23P01') {
    return { ok: false, error: 'slot_taken', status: 409 }
  }
  console.error('[booking-core] insert error:', insertErr?.message)
  return { ok: false, error: 'insert_failed', status: 500 }
}
```

**Cambios (RESEARCH §Code Examples):**
1. Tipo de retorno error (línea 61): agregar `'slot_full'` → `'invalid_service' | 'invalid_professional' | 'slot_taken' | 'slot_full' | 'insert_failed'`.
2. Tras el RPC: `if (rpcErr?.message?.includes('slot_full')) return { ok:false, error:'slot_full', status:409 }` ANTES del check `23505/23P01`.
3. El re-check JS de solapamiento (líneas 106-134, `taken` → `slot_taken`) debe volverse capacity-aware o delegar al RPC (RESEARCH Pitfall 5 / A5) — hoy marca `taken` con CUALQUIER ocupante del bucket; en grupal rechazaría al 2º inscripto falsamente.
4. Conservar el SENTINEL (línea 15) y el bucket `COALESCE(professional_id, SENTINEL)` (línea 108) EXACTOS — la clave del advisory lock del RPC debe usar el mismo COALESCE (RESEARCH Pitfall 1).
5. La liberación de holds vencidos (141-153) corre ANTES del RPC, igual que hoy — el RPC cuenta sobre el estado ya limpio.

---

### `app/api/booking/create/route.ts` (route handler, request-response)

**Analog:** sí mismo, líneas 107-109. El mapeo es genérico → `slot_full` se propaga sin tocar el archivo:

```typescript
if (!result.ok) {
  return Response.json({ ok: false, error: result.error }, { status: result.status })
}
```

> No requiere cambio funcional para que `slot_full` llegue al cliente (el error y status vienen del core). Solo se toca si se quiere copy/UX específico de "lleno" en el cliente público (`booking-client.tsx`).

---

### `app/api/appointments/create/route.ts` (route handler, request-response)

**Analog:** sí mismo, líneas 88-90 — idéntico al público, hereda `slot_full` automáticamente:

```typescript
if (!result.ok) {
  return Response.json({ ok: false, error: result.error }, { status: result.status })
}
```

---

### `app/api/booking/availability/route.ts` (route handler, read)

**Analog:** sí mismo, líneas 49-59 — el cómputo de `busy` por bucket a colapsar en `full` por slot (D-06, non-leak):

```typescript
const bucket = professionalId && professionalId !== 'none' ? professionalId : SENTINEL
const nowMs = Date.now()
const busy = (appts || [])
  .filter(a => (a.professional_id ?? SENTINEL) === bucket)
  .filter(a => a.status === 'confirmed' || a.expires_at == null || new Date(a.expires_at as string).getTime() > nowMs)
  .map(a => ({ time: a.time, status: a.status, expires_at: a.expires_at, duration_minutes: a.duration_minutes }))

return Response.json({ ok: true, busy }, { headers: { 'Cache-Control': 'no-store' } })
```

**Cambio (RESEARCH §Availability capacity-aware + Pitfall 4):** agrupar ocupantes por `time` (count), leer `time_blocks.capacity` del negocio en el mismo endpoint, y devolver SOLO `full: string[]` (slots con `count >= capacityFor(time)`). **NUNCA** devolver el count ni una entrada por ocupante. Mantener el mismo SENTINEL/bucket. Recomendación research: agregar `full` y conservar `busy` para minimizar blast radius en `booking-client.tsx` (para capacity=1 coinciden).

---

### `app/(dashboard)/agenda/agenda-client.tsx` (component, event-driven + CRUD)

**Analog para CUPOS-01 (campo `capacity` por bloque):** la fila de edición de `time_block`, líneas 557-583. Cada campo del bloque es un `<Input>` controlado con `updateBlock(day, idx, key, value)`:

```tsx
<Input type="time" value={block.start_time} onChange={e => updateBlock(day, idx, 'start_time', e.target.value)} className="w-28 text-sm" />
<span className="text-muted-foreground text-sm">→</span>
<Input type="time" value={block.end_time} onChange={e => updateBlock(day, idx, 'end_time', e.target.value)} className="w-28 text-sm" />
<Input value={block.label} onChange={e => updateBlock(day, idx, 'label', e.target.value)} placeholder="Mañana, Tarde... (opcional)" className="w-40 text-sm" />
```

El nuevo campo "cupo" se suma acá como `<Input type="number" min={1} value={block.capacity} onChange={e => updateBlock(day, idx, 'capacity', ...)}>`. Hay que extender:
- el tipo `LocalBlock` (línea 49): agregar `capacity: number`.
- `defaultBlock` / el mapeo de `initialTimeBlocks` (líneas 53-55, 135): default 1.
- el `toInsert` del save (líneas 247-257, delete-all + insert): agregar `capacity` al objeto insertado en `time_blocks`.

**Analog para CUPOS-04 (roster: drawer mobile / panel desktop):** D-04 pide drawer/panel. **NO hay uso de `Drawer` en `app/` todavía** — el componente `@/components/ui/drawer.tsx` existe (exporta `Drawer`, `DrawerContent`, `DrawerHeader`, `DrawerTitle`, etc., líneas 123-134) pero está sin estrenar. El analog de overlay YA usado en este mismo archivo es `Dialog` (líneas 736-766, modal "Copiar horario"):

```tsx
<Dialog open={copyDay !== null} onOpenChange={open => { if (!open) setCopyDay(null) }}>
  <DialogContent className="sm:max-w-sm">
    <DialogHeader><DialogTitle>Copiar horario {/* ... */}</DialogTitle></DialogHeader>
    {/* contenido */}
  </DialogContent>
</Dialog>
```

> Mirror este patrón open/onOpenChange + Header/Title para el roster. D-04 dice drawer en mobile: usar `@/components/ui/drawer` (vaul, ya instalado) con la MISMA estructura de estado (`selectedSlot !== null` → abierto). El contador 8/15 + lista (nombre, contacto, estado confirmado/seña pendiente) se computa de `initialAppointments` (ya cargados por slot) vs `capacity` del bloque. NO introducir librería nueva (D-04).

---

### `app/(dashboard)/agenda/page.tsx` (page server, CRUD read)

**Analog:** sí mismo, líneas 28-43 — `Promise.all` de queries filtradas por `business_id`:

```tsx
const [{ data: timeBlocks }, /* ... */] = await Promise.all([
  supabase.from('time_blocks').select('*').eq('business_id', business.id).order('day_of_week').order('start_time'),
  // ...
  supabase.from('appointments')
    .select('id, date, time, status, client_name, duration_minutes, location_id, services(name), professionals(name)')
    .eq('business_id', business.id).gte('date', weekStartStr).neq('status', 'cancelled')
    .order('date', { ascending: true }).order('time', { ascending: true }),
])
```

`select('*')` de `time_blocks` ya trae `capacity` tras la migración (sin cambio de query). Para el roster, el `select` de `appointments` ya incluye `client_name` y `status`; agregar `client_phone`/`client_email` si el roster los muestra (D-04 pide contacto) — siempre filtrado por `business_id`.

---

### `lib/types.ts` (model)

**Analog `TimeBlock`** (líneas 81-91) — agregar `capacity: number`:

```typescript
export interface TimeBlock {
  id: string
  business_id: string
  day_of_week: number
  start_time: string
  end_time: string
  label: string | null
  location_id: string | null
  created_at: string
}
```

**Analog `Appointment`** (líneas 175-206) — agregar `seat?: number` (y `is_group?: boolean` si se desnormaliza para el EXCLUDE condicional, RESEARCH Pattern 3 Opción A). Campos snake_case que reflejan la columna DB; opcionales con `?` (convención del repo).

---

### `test/concurrency.test.ts` (NEW test)

**Analog A — estructura del suite:** `test/booking-core.test.ts` (líneas 1-57). `describe.skipIf(!hasSupabaseCreds)`, `seedOneTenant` en `beforeAll`, `teardownOneTenant` en `afterAll`, `afterEach` que limpia appointments, `baseInput()` helper, `DATE` futura fija (`'2031-03-03'`), service-role como `supabase` del core (aísla de RLS).

**Analog B — molde CONC-02 (no-regresión cupo 1):** Test B (91-103) y Test D (109-162). Test B prueba `slot_taken` por re-check JS; Test D fuerza la carrera con un cliente "ciego" (intercepta el SELECT de clashes → `[]`) y verifica el respaldo atómico 23505/23P01 → `slot_taken`. CONC-02 extiende Test B/D con un bloque `capacity=1` y asierta que la 2ª da `slot_taken` (NO `slot_full`).

**Analog C — verificación independiente del estado de la DB:** Test C (80-88) y Test D (110-125) insertan/leen directo con `t.admin.from('appointments')` para asertar la fila resultante. CONC-01 lo usa para contar exactamente N filas confirmadas en el slot (no N+1):

```typescript
const { data } = await t.admin.from('appointments').select('id')
  .eq('business_id', t.businessId).eq('date', DATE).eq('time', '09:00')
  .in('status', ['confirmed','pending_payment'])
expect((data ?? []).length).toBe(2)
```

**Analog D — fixtures a extender:** `test/helpers/booking-fixtures.ts` `seedOneTenant` (39-88) siembra business+service+professional+location pero **NO siembra `time_blocks`** (A4). Hay que agregar `seedTimeBlock({ capacity })` o un parámetro a `seedOneTenant` para que el RPC/availability resuelvan capacity. CONC-01 dispara `Promise.all([createAppointmentCore(...), createAppointmentCore(...)])` sobre el último lugar (RESEARCH §CONC-01) y asierta exactamente 1 ok + 1 `slot_full`.

**Run:** `npx vitest run test/concurrency.test.ts test/booking-core.test.ts` (per-task); `npm test` (per-wave). Gate: `supabase db reset` local aplica 041 sin error antes de `/gsd:verify-work`.

---

## Shared Patterns

### Aislamiento por tenant (no negociable)
**Source:** todo `lib/booking-core.ts` (anti-tampering 83-104, 164-179) + `040_*.sql` WITH CHECK.
**Apply to:** migración 041, RPC, availability, queries de roster.
- El RPC `SECURITY DEFINER` recibe `business_id` YA resuelto por el caller y filtra TODO por él (RESEARCH Pitfall 2). `SET search_path = public`.
- El anti-tampering de service/professional/location lo sigue haciendo el core ANTES del RPC.
- Toda query del dashboard: `.eq('business_id', business.id)`.

### Bucket / sentinel consistente
**Source:** `booking-core.ts:15,108`, `availability/route.ts:11,52`, `baseline.sql:649,797`.
**Apply to:** el advisory lock del RPC, el índice único nuevo, el count de availability.
```typescript
const SENTINEL = '00000000-0000-0000-0000-000000000000'
const bucket = proId ?? SENTINEL  // === COALESCE(professional_id, sentinel)
```
> La clave del `pg_advisory_xact_lock` DEBE usar el mismo `COALESCE(professional_id, sentinel)` o el lock no serializa (RESEARCH Pitfall 1).

### Forma de error de dominio
**Source:** `booking-core.ts:61,205-212` + callers.
**Apply to:** `slot_full` (409) nuevo.
```typescript
return { ok: false, error: 'slot_full', status: 409 }   // core
return Response.json({ ok: false, error: result.error }, { status: result.status })  // callers (sin cambio)
```
Códigos snake_case cortos; estados `confirmed` + `pending_payment` ocupan lugar (mismo WHERE de los constraints).

### Logging
**Source:** `booking-core.ts:210`, `availability/route.ts:45`.
`console.error('[modulo/accion]', ...)` con mensaje seguro; nunca filtrar detalle de DB al cliente.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (RPC `book_slot_atomic` dentro de 041) | DB function | transform | No hay función `SECURITY DEFINER` con advisory lock en el repo. Patrón nuevo — guiarse por RESEARCH Pattern 1 (DDL completo) + Postgres docs `pg_advisory_xact_lock`. El estilo SQL/comentario lo aporta `040_*.sql`. |
| (Drawer del roster en `agenda-client.tsx`) | UI overlay | event-driven | `@/components/ui/drawer.tsx` existe pero NO se usa en `app/` aún. Analog de overlay más cercano = el `Dialog` del mismo archivo (736-766); el patrón vaul/drawer se toma del componente shadcn ya instalado. |

## Metadata

**Analog search scope:** `lib/`, `app/api/booking`, `app/api/appointments`, `app/(dashboard)/agenda`, `app/(dashboard)/settings`, `supabase/migrations`, `test/`, `components/ui`.
**Files scanned:** ~14.
**Pattern extraction date:** 2026-06-26
