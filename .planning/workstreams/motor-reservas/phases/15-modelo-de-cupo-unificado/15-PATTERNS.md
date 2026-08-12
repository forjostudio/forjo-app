# Phase 15: Modelo de cupo unificado — Pattern Map

**Mapped:** 2026-08-12
**Files analyzed:** 7 (3 nuevos · 4 modificados)
**Analogs found:** 7 / 7 (todos con análogo exacto en el repo)

---

## File Classification

| Nuevo/Modificado | Rol | Data Flow | Análogo más cercano | Calidad |
|---|---|---|---|---|
| `supabase/migrations/068_*.sql` | migration | DDL + backfill + trigger | **065** (estructura global) + **064** (cuerpo del RPC) + **055** (backfill→CHECK) | exact (compuesto) |
| test del gate de cambio de modo | test (integración PG real) | request-response contra PostgREST | `test/abono-delete-gate.test.ts` | exact |
| extensión del test de carrera | test (concurrencia) | carrera contra PG real | `test/concurrency.test.ts:370-420` (CUPO-04) | exact |
| `supabase/schema.sql` | schema mirror | — | `schema.sql:532-...` (`services_block_delete`) + `:1102-1117` + `:1553` | exact |
| `lib/booking-core.ts:186-199` | lib/core | re-check JS (UX) | su propio bloque + `:246-262` (rama simultánea ya migrada) | exact |
| `app/api/booking/availability/route.ts:72-83` | route handler | read-path público | `:246-290` (rama simultánea ya migrada) | exact |
| `lib/types.ts:193-201` | model/tipos | — | el propio campo `capacity_mode` | exact |

---

## 1. Moldes de migración — cuál de las seis para cada cosa

### (a) `CREATE OR REPLACE FUNCTION book_slot_atomic` sin cambiar la firma → **064**

`supabase/migrations/064_agenda_day_lock_and_mirror_gate.sql` es el molde **y** el punto de partida
obligatorio: es la **última** redefinición del RPC, así que su cuerpo (`064:100-475`) es el estado
vigente. La 068 arranca de ahí y aplica cambios encima, exactamente como la 064 declara que hizo con
la 063 (`064:6-8`).

Elementos a copiar literal:

- Firma byte-idéntica, 14 params + `RETURNS TABLE ("id" uuid, "cancel_token" uuid)` — `064:100-115`.
- `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public` — `064:116`.
- Bloque `DECLARE` con comentario por variable indicando en qué migración nació — `064:117-137`.
- Cierre obligatorio, tres líneas, en este orden — `064:477-485`:
  ```sql
  ALTER FUNCTION "public"."book_slot_atomic"(uuid, uuid, uuid, uuid, date, time without time zone, integer, uuid, text, text, text, text, text, timestamp with time zone) OWNER TO "postgres";
  GRANT EXECUTE ON FUNCTION "public"."book_slot_atomic"(...) TO "anon", "authenticated", "service_role";
  NOTIFY pgrst, 'reload schema';
  ```
- **Nunca `DROP FUNCTION`.** El header lo declara invariante del proyecto (`064:91-93`, `062:39-41`):
  cambiar params o el `RETURNS` obliga a recrearla y rompe los 4 callers de `createAppointmentCore`.

Qué toca la 068 dentro del cuerpo: la **rama grupal** `064:433-440`
(`SELECT COALESCE(MAX(tb.capacity), 1) INTO v_capacity FROM time_blocks tb ...`) pasa a leer
`v_svc_cap` de `services`, y el `IF v_mode = 'simultaneous_resource'` de `064:306` pasa a ser un
`CASE` de tres modos. El resto (selección "cualquiera" `064:189-238`, bloque de espacio
`064:244-300`, INSERT `064:463-473`) queda **byte-idéntico** — es el patrón declarado de cada
redefinición: cambio quirúrgico + declarar explícitamente qué quedó igual.

**D-07 (reescribir el comentario que miente):** el comentario a corregir es `064:395-404` (migración,
histórica, NO se edita) y su espejo vivo en **`supabase/schema.sql:436-447`**. Ahí es donde se
reescribe la premisa.

### (b) `ALTER TABLE ... DROP/ADD CONSTRAINT` → **062** para el ADD, **065** para el DROP

- **ADD CONSTRAINT (CHECK): molde 062**, `062:56-85`. Dos bloques `DO $$ ... $$` idempotentes,
  guardados por `pg_constraint`:
  ```sql
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM "pg_constraint"
       WHERE "conname" = 'services_capacity_mode_chk'
         AND "conrelid" = '"public"."services"'::"regclass"
    ) THEN
      ALTER TABLE "public"."services"
        ADD CONSTRAINT "services_capacity_mode_chk"
        CHECK ("capacity_mode" IN ('group_class', 'simultaneous_resource'));
    END IF;
  END
  $$;
  ```
  Es además el constraint **exacto** que la 068 tiene que dropear y recrear. El molde se repite
  idéntico en `055:52-66` y `061:44-54`.
- **DROP CONSTRAINT: molde 065**, `065:110-111` — `ALTER TABLE ... DROP CONSTRAINT IF EXISTS "x";`
  suelto, seguido del `DO $$` de re-creación. El `IF EXISTS` es lo que hace re-corrible el archivo.
- **Naming:** sufijo semántico en snake_case, prefijado por la tabla:
  `services_capacity_mode_chk` (enum), `services_capacity_positive` / `time_blocks_capacity_positive`
  (rango simple), `businesses_abono_window_weeks_range` (rango con bounds),
  `businesses_public_selector_default_chk`. Para el CHECK de coherencia modo↔cupo (D-06) el nombre
  que encaja en la convención es `services_capacity_mode_coherence_chk` o
  `services_capacity_matches_mode_chk`.

### (c) Backfill con `UPDATE` dentro de una migración → **055** (y 065 para el guard de re-corrida)

**Sí hay precedente, tres veces:** `047:35` (data-only, sin DDL), `050:53`, `055:45-48`, `065:84-97`.

**055 es el molde exacto para esta fase** porque hace *literalmente* lo que pide D-05: normalizar
primero para que el CHECK se pueda crear después. Su encabezado de sección lo dice con esas palabras
(`055:44`): `-- ── 1. Normalizar PRIMERO los valores fuera de rango (si no, el CHECK no se puede crear) ──`
seguido de `-- ── 2. DESPUÉS el CHECK ──` (`055:50`). Copiar ese par de headers tal cual deja el
razonamiento de D-05 visible en el archivo.

Precauciones que llevan los backfills del repo:

1. **Predicado acotado, nunca un UPDATE completo** — `055:47-48` filtra por los valores fuera de
   rango; `065:90` usa `IS NULL` como guard. Para la 068 el predicado es
   `WHERE capacity_mode = 'group_class' AND capacity <= 1` (D-04): además de acotar, es lo que hace
   el backfill **re-corrible** (2ª pasada = 0 filas) y lo que protege a un grupal ≥ 2 declarado entre
   la escritura y la aplicación.
2. **Filtro explícito por tenant cuando la tabla lo tiene** — `065:89`, `065:96`
   (`s.business_id = a.business_id`, con la rama `IS NULL` para filas legacy). Acá no aplica (el
   UPDATE es sobre `services` sin join), pero el criterio se documenta igual.
3. **Documentar el límite aceptado** — `065:81-83` deja escrito qué se pierde y por qué no es un bug.
   El equivalente en la 068 es el "byte-idéntico" de D-04.
4. **Declarar si `schema.sql` cambia** — `047:31-32` aclara que un backfill data-only NO obliga a
   regenerar el schema. La 068 sí lo obliga (cambia CHECKs, DEFAULT y la función).

### (d) Gate `RAISE EXCEPTION ... USING ERRCODE = 'P0001'` con código de dominio → **067**, con 065 de referencia

`067_abono_delete_orphan_gate.sql` es el mejor molde de los seis, por tres motivos:

1. Es **una sola función** (`067:70-138`) — no arrastra columnas, FKs ni backfill como la 065.
2. Su header **razona explícitamente por qué NO se usó un trigger `BEFORE UPDATE`** (`067:31-40`), que
   es justo la decisión abierta en "Claude's Discretion" de esta fase.
3. Tiene el bloque de "cambio de comportamiento que hay que decidir ANTES de aplicar" (`067:42-57`),
   que es el molde de cómo documentar el rechazo nuevo de CUPO-08.

Patrón a copiar, en orden (`067:70-148`):

```sql
CREATE OR REPLACE FUNCTION "public"."<tabla>_<accion>"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;  -- 067:76
BEGIN
  -- 1. GUARD DE CASCADA primero (067:85-88 / 065:228-231)
  IF OLD."business_id" IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM businesses b WHERE b."id" = OLD."business_id") THEN
    RETURN OLD;
  END IF;
  -- 2. EXISTS anclado en la PK + filtro explícito por tenant + rama status IS NULL (067:122-129)
  IF EXISTS (...) THEN
    RAISE EXCEPTION '<codigo_de_dominio_fijo>' USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;  -- 067:136 — devolver NULL cancela en silencio (204 + UI mintiendo)
END;
$$;
ALTER FUNCTION "public"."<fn>"() OWNER TO "postgres";
DROP TRIGGER IF EXISTS "<fn>_trg" ON "public"."<tabla>";   -- 067:144, idempotencia (sin él: 42710)
CREATE TRIGGER "<fn>_trg" BEFORE <EVENTO> ON "public"."<tabla>" FOR EACH ROW EXECUTE FUNCTION "public"."<fn>"();
NOTIFY pgrst, 'reload schema';
```

Detalles no negociables del molde:

- **"Hoy" en hora AR, nunca UTC** — `067:73-76`, `065:218-220`. A las 22:00 AR el `now()` UTC ya es
  mañana y un turno de mañana temprano dejaría de contarse como futuro.
- **La rama `a.status IS NULL` es obligatoria** — `067:113-116`, `065:242-245`. `NOT IN (...)` sobre
  NULL evalúa a NULL ⇒ esas filas quedarían fuera del EXISTS y **abrirían** el gate. El repo ya pagó
  esta trampa dos veces.
- **El `message` es un código de dominio fijo, sin datos del negocio** — `067:118-121` lo justifica
  (T-14-14 / T-13-09): el texto viaja al navegador. Messages **distintos** sobre el **mismo** P0001 es
  el patrón para que la UI distinga motivos (`065:268`, `067:95` vs `067:130`).
- **Orden de las reglas dentro del trigger importa** — `067:90-93`: primero la regla cuyo mensaje es
  más accionable para el dueño.

### (e) `ALTER COLUMN ... SET DEFAULT` → **SIN PRECEDENTE fuera del baseline**

`grep "ALTER COLUMN" supabase/migrations/*.sql` (excluyendo el baseline) devuelve **cero**. Todos los
defaults del repo se declaran en el `ADD COLUMN ... NOT NULL DEFAULT` (`062:49-53`) o vienen del
baseline. El paso 5 de D-05 (`ALTER COLUMN capacity_mode SET DEFAULT 'individual'`) es la **primera**
vez que el repo hace esto en una migración numerada — vale documentarlo en el header como divergencia
consciente, igual que la 065 documenta sus dos divergencias del molde de columna aditiva
(`065:45-52`).

---

## 2. `ALTER TABLE ... ADD CONSTRAINT` — precedente y `NOT VALID`

**Sí hay precedente**, cinco fuera del baseline: `041:44` y `041:76`, `042:298`, `055:60`, `061:50`,
`062:65` y `062:81`, `065:122` y `065:140` (FKs).

**`NOT VALID` + `VALIDATE CONSTRAINT`: CERO precedente en todo el repo.**
`grep -i "not valid\|validate constraint" supabase/migrations/*.sql` → sin resultados. Todos los
constraints se agregan **validando de entrada**, lo que es coherente con D-05: si el backfill no corre
primero, el `ADD CONSTRAINT` aborta la migración entera. **No introducir `NOT VALID` en la 068** — sería
un patrón nuevo, y el volumen de datos (9 filas en prod) no lo justifica.

Dos formas conviven en el repo:

- **Directa, sin guard**: `041:44` (`ALTER TABLE ... ADD CONSTRAINT ... CHECK (...);` en una línea).
- **Idempotente con `DO $$` + `pg_constraint`**: `055`, `061`, `062`, `065`. **Es la forma actual** —
  las cuatro migraciones más recientes que agregan constraints la usan, y `062:55` la nombra
  explícitamente "Molde 055/061". Usar esta.

---

## 3. Moldes de test

### Gate del cambio de modo → **`test/abono-delete-gate.test.ts`**

De los tres candidatos, es el que prueba un gate de la base contra Postgres real **con el camino de
rechazo incluido**:

| Candidato | Qué prueba | Sirve como molde |
|---|---|---|
| `test/abono-delete-gate.test.ts` | PostgREST real → trigger → `P0001` + `message`, y verifica que la fila **sigue viva** | **SÍ — molde principal** |
| `test/service-delete-gate.test.ts` | Lo mismo para la 065; casos 1/5 (`:94-101`, `:167-174`) | SÍ — molde secundario, mismo estilo |
| `test/canchas-delete-integration.test.ts` | Integración del *caller* (`lib/canchas.ts`) con el gate; el rechazo llega mockeado en `canchas-provision.test.ts:333-370` | NO para el gate en sí |

Estructura a copiar de `abono-delete-gate.test.ts`:

- **Cabecera y skip** (`:1-27`): `describe.skipIf(!hasSupabaseCreds)('066: gate ...')`, import de
  `hasSupabaseCreds` de `./env` y de los fixtures.
- **Fechas fijas** (`:21-23`): `const FUTURE = '2031-03-03'` / `const PAST = '2020-03-02'` — nunca
  derivar del reloj del runner. `concurrency.test.ts:24` usa la misma fecha y aclara que es lunes
  (`EXTRACT(dow) = 1`), que es lo que alinea con `seedTimeBlock` (default `day_of_week=1`).
- **Dos tenants + sesión anon del dueño** (`:29-57`): `t` (ajeno) y `other`, con
  `signInWithPassword` y **dos GUARDS anti-falso-verde** — sin sesión activa, y anon key ≠
  service-role key. Copiar los dos guards literalmente si el test toca RLS.
- **Assert del contrato, no "hubo error"** (`:126-137`):
  ```ts
  expect(del.error).not.toBeNull()
  expect(del.error?.code).toBe('P0001')
  expect(del.error?.message).toContain('<codigo_de_dominio>')
  // y el estado REAL de la DB después: la fila sigue existiendo
  expect(await abonoExists(t, abono)).toBe(true)
  ```
  El comentario `:120-124` explica por qué el `message` es parte del assert: es el **contrato** que el
  cliente mapea; un assert de "hubo error" pasaría con cualquier otro rechazo.
- **Caso complementario obligatorio** (`:138-140`): el camino que **SÍ** pasa, que es el que detecta
  un `RETURN NULL` en el trigger (error nulo + fila todavía viva = verde falso).
- **Timeout explícito por caso**: `}, 20000)` — los 5000 ms default no alcanzan contra el Supabase
  local.
- **Helpers locales de siembra** dentro del `describe` (`:78-119`), con `tenant.admin` (service-role)
  y `.select('id').single()` + throw en error.

### Fixtures reusables — `test/helpers/booking-fixtures.ts`

| Helper | Línea | Uso en esta fase |
|---|---|---|
| `seedOneTenant({ bufferMinutes, serviceDurationMinutes })` | `:39` | tenant + business + service + professional + location |
| `seedTimeBlock(t, { capacity })` | `:100` | ahora deja de decidir el cupo — útil como **control negativo** (bloque cupo 3 + servicio `individual` ⇒ el cupo debe seguir siendo 1) |
| `seedService(t, {...})` | `:148` | 2º servicio para los casos cross-servicio |
| `seedSimultaneousService(t, { capacity })` | `:251` | **el helper a extender**: hoy hace `update({ capacity_mode: 'simultaneous_resource', capacity })` sobre `t.serviceId`. La 068 no cambia su forma, pero su comentario (`:239-250`) afirma que el grupal lee `time_blocks.capacity` — hay que reescribirlo |
| `seedProfessional` / `seedSpace` / `seedAgendaSpace` / `seedProfessionalService` | `:130/:203/:217/:231` | escenarios de espacio y multi-staff |
| `teardownOneTenant(t)` | `:316` | `afterAll`; depende del guard de cascada de los triggers |
| `purgeAbonos(t, { id })` | `:284` | solo si el caso siembra abonos |

### Extensión del test de carrera → **`test/concurrency.test.ts`**

- **El caso a espejar es CUPO-04**, `:391-420`. Su comentario `:381-388` es el **control negativo
  documentado** que el CONTEXT declara estándar de la fase: "restaurando el lock fino en la función,
  este mismo test devuelve 3 ok / 3 filas (falla)". Reproducir esa forma: decir explícitamente qué
  cambio en la función hace fallar el test.
- **WARM-UP obligatorio** (`:404-410`):
  ```ts
  await Promise.all([1, 2, 3].map(() => t.admin.from('services').select('id').eq('id', t.serviceId)))
  ```
  Sin él, el pool frío escalona los carriles y **el test pasa incluso con el lock viejo** — falso
  verde medido.
- **`afterEach` que devuelve el service a los defaults** (`:40-58`). ⚠ Ese bloque hace hoy
  `.update({ capacity_mode: 'group_class', capacity: 1 })` — que en la 068 pasa a **violar el CHECK de
  coherencia** (`group_class ⇒ capacity >= 2`). Hay que cambiarlo a `'individual'`. Mismo problema en
  `booking-cualquiera-public.test.ts:127, :334, :365`.
- **Assert duro contra el estado real de la DB** después de la carrera (`:415-420`), no solo contra los
  returns de `createAppointmentCore`.
- **`baseInput()`** (`:63-70`): `professionalId` fijo, nunca `null`, para no mezclar bucket real y
  SENTINEL entre reservas del mismo slot (Pitfall 1).

---

## 4. Mapeo del error de dominio a copy en la UI (para Phase 16 — fijado acá)

El patrón tiene **tres piezas** y siempre las mismas tres. Molde canónico: `settings-client.tsx`
(servicios) y `abonos-client.tsx` (abonos).

**Pieza 1 — el tipo del resultado, arriba del archivo:**
```ts
// app/(dashboard)/settings/settings-client.tsx:41
type DeleteServiceResult = { ok: true } | { ok: false; error: 'has_future_appointments' | 'has_active_abono' | 'unknown' }
// app/(dashboard)/abonos/abonos-client.tsx:57
type DeleteAbonoResult = { ok: true } | { ok: false; error: 'is_active' | 'has_future_turns' | 'unknown' }
```
El código de la UI **no** es el código de la DB: `service_has_future_appointments` (DB) →
`has_future_appointments` (UI). La traducción ocurre en la pieza 2.

**Pieza 2 — el mapeo, en la función que escribe:**
```ts
// app/(dashboard)/settings/settings-client.tsx:630-646
async function deleteService(id: string): Promise<DeleteServiceResult> {
  const { data, error } = await supabase.from('services').delete().eq('id', id).eq('business_id', business.id).select('id')
  if (error) {
    if (error.code === 'P0001' && error.message?.includes('service_has_future_appointments')) return { ok: false, error: 'has_future_appointments' }
    if (error.code === 'P0001' && error.message?.includes('service_has_active_abono')) return { ok: false, error: 'has_active_abono' }
    if (error.code === '23503') return { ok: false, error: 'has_future_appointments' }   // fallback defensivo
    return { ok: false, error: 'unknown' }
  }
  if (!data || data.length === 0) return { ok: false, error: 'unknown' }   // 0 filas sin error = la RLS filtró ⇒ FALLO
  ...
}
```
Idéntico en `abonos-client.tsx:258-274`. Cuatro invariantes:

- `error.code === 'P0001' && error.message?.includes('<codigo>')` — **siempre los dos**, code primero.
- `.eq('business_id', business.id)` en el write, defensa en profundidad.
- `.select('id')` + chequeo de 0 filas: sin él la UI dice "eliminado" sin haber borrado nada
  (T-14-23 / T-14-16).
- **NO emite `toast.error`**: el motivo se **devuelve** y lo traduce el modal, que sabe qué estado
  estaba mostrando. El toast de éxito sí vive acá.

**Pieza 3 — la copy, en el modal, por `motivo`:**
```tsx
// app/(dashboard)/settings/settings-client.tsx:2505-2506
motivo === 'has_future_appointments' ? 'No se puede eliminar: quedaron turnos futuros reservados. Desactivalo para dejar de ofrecerlo y conservar el historial.'
  : motivo === 'has_active_abono' ? 'No se puede eliminar: el servicio tiene un abono activo. Desactivalo para dejar de ofrecerlo y conservar el historial.'
```
(equivalente en `abonos-client.tsx:690-693`). El texto crudo del error **nunca** se interpola en
pantalla.

**Variante server-side del mismo patrón** (si el gate se consume desde `lib/`, no desde un client):
`lib/canchas.ts:228-235` — misma discriminación por `code` + `message.includes`, devolviendo un código
de dominio propio. Y `lib/booking-core.ts:348-361` para los códigos del RPC
(`simultaneous_space_conflict` → 409).

**Mapa de copy centralizado** para los códigos del write-path público:
`abonos-client.tsx:79` (`simultaneous_space_conflict: 'El recurso simultáneo no puede usar un espacio compartido'`).

---

## 5. El tipo del modo en TS + inventario completo de call-sites

### Cómo está tipado hoy

```ts
// lib/types.ts:193-201
  // Qué significa el "cupo N" de este servicio (migr. 062, Phase 12):
  //   'group_class'           = clase grupal: el cupo lo pone time_blocks.capacity y se cuenta por
  //                             HORA DE INICIO EXACTA (comportamiento histórico). Es el DEFAULT.
  //   'simultaneous_resource' = recurso simultáneo (ej. 2 camillas): el cupo es `capacity` (abajo) y
  //                             se cuenta por SOLAPE de intervalos entre turnos del mismo servicio.
  capacity_mode: 'group_class' | 'simultaneous_resource'
  // Cupo N del recurso simultáneo. Lo lee SOLO el modo 'simultaneous_resource'; la clase grupal
  // sigue leyendo time_blocks.capacity. DEFAULT 1 en la DB.
  capacity: number
```

Es una **unión de literales inline en la interface `Service`**, sin alias exportado. El único alias
vive **local al componente**: `settings-client.tsx:126` → `type CapacityMode = Service['capacity_mode']`
(derivado, no duplicado — patrón a preservar). El comentario de `types.ts:194-200` es doblemente
mentiroso después de la 068 (el grupal deja de leer `time_blocks.capacity`) y hay que reescribirlo
completo, no solo agregar el 3er valor.

### Inventario de call-sites del literal — **todo sitio que asume 2 valores**

Producción (14 sitios en 6 archivos):

| Archivo:línea | Qué asume | Riesgo |
|---|---|---|
| `lib/types.ts:193-201` | la unión de 2 + el comentario que describe la fuente del cupo | **ALTO** — origen del tipo |
| `lib/booking-core.ts:116` | `select(... capacity_mode, capacity)` | bajo (ya trae ambas) |
| `lib/booking-core.ts:136` | `=== 'simultaneous_resource'` ⇒ rechazo de "Cualquiera" | **ALTO** — ¿`group_class` con cupo ≥ 2 también debe rechazar "Cualquiera"? decisión de la fase |
| `lib/booking-core.ts:254` | `isSimultaneousResource` gobierna el `rejectEarly` de `:262` | **ALTO** — es una de las 3 lecturas de D-08 |
| `lib/booking-core.ts:186-199` | `slotCapacity` desde `time_blocks` | **ALTO** — la lectura que se mueve |
| `app/api/booking/availability/route.ts:109,120` | rama `any`: rechaza simultáneo | **ALTO** — mismo dilema que `booking-core:136` |
| `app/api/booking/availability/route.ts:262,268` | rama simultánea del grid | medio |
| `app/api/booking/availability/route.ts:72-83` | `capacityFor()` desde `time_blocks` | **ALTO** — la lectura que se mueve |
| `app/api/booking/availability/route.ts:218,415,432` | **tres consumidores más** de `capacityFor()` | **ALTO** — no alcanza con cambiar la definición |
| `app/[slug]/booking-client.tsx:129` | `isSimultaneousResource` oculta "Cualquiera" | medio (UX; el control real es server) |
| `app/(dashboard)/settings/settings-client.tsx:126,165-198,521-523,613-622,675-701,1696,1741` | `CapacityMode`, array `opts` de **2** opciones (`:175-177`), defaults `'group_class'` en 4 lugares, y `capacity: mode === 'simultaneous' ? N : 1` en `:616` y `:701` | **CRÍTICO** — `:616`/`:701` fuerzan `capacity = 1` para todo lo que no sea simultáneo ⇒ **rebotan contra el CHECK de coherencia** si el modo es `group_class`. Es el sitio del "subir el cupo a 2 automáticamente" de D-06. Es Phase 16, pero la 068 lo rompe si nadie lo toca |
| `app/(dashboard)/agenda/agenda-client.tsx:44,484-521,637-638` | `capacity_mode !== 'simultaneous_resource'` ⇒ `continue`, y `capacityFor()` propio desde `time_blocks` (`:465-474`) | **ALTO — hallazgo no listado en D-08** (ver abajo) |

Tests (a actualizar o van a fallar contra el CHECK nuevo):

| Archivo:línea | Qué hace |
|---|---|
| `test/concurrency.test.ts:54` | `afterEach` → `update({ capacity_mode: 'group_class', capacity: 1 })` — **viola el CHECK de D-06** |
| `test/booking-cualquiera-public.test.ts:127, :334, :365` | idem, tres veces |
| `test/helpers/booking-fixtures.ts:239-254` | `seedSimultaneousService` + comentario que afirma la fuente vieja del cupo grupal |
| `test/canchas-provision.test.ts:187, :254, :384, :431` | objetos `Service` literales con `capacity_mode: 'group_class', capacity: 1` |
| `test/landing-derive.test.ts:175`, `test/staff-services.test.ts:45` | idem, fixtures de objeto |

SQL (histórico, **no se edita**): `062:50,66,145-178`; `064:118-150,306,424`; espejo **vivo** en
`supabase/schema.sql:242, 454, 1113, 1115, 1134`.

---

## 6. Sitios donde `is_group` se deriva o se asume (riesgo, más allá de la landmine del CONTEXT)

| Sitio | Qué hace | Nota |
|---|---|---|
| `schema.sql:428` (`v_is_group := (v_svc_cap > 1)`) | rama simultánea | queda igual |
| `schema.sql:490` (`v_is_group := (v_capacity > 1)`) | rama grupal, desde `time_blocks` | **es la línea que cambia** |
| `schema.sql:447` (`AND a.is_group = true`) | gate espejo de la 064 | D-07: no se re-escopea, pero su comentario `:436-447` miente después de la 068 |
| `schema.sql:1257` (`appointments_no_overlap ... AND NOT "is_group"`) | EXCLUDE gist 013 | **la landmine**: es el consumidor real de `is_group` |
| `schema.sql:657` | `"is_group" boolean DEFAULT false NOT NULL` | default de la columna |
| `lib/types.ts:272-274` | comentario: "`is_group` = desnormalización (capacity > 1)" | **ambiguo a propósito**: no dice de qué `capacity`. Después de la 068 hay que decir "de `services.capacity`" |
| `lib/booking-core.ts:257-259` | comentario que razona el bypass del re-check contra el EXCLUDE | actualizar junto con `:186-199` |
| `test/concurrency.test.ts:656, :701-702` | asserts DIRECTOS de `is_group` en la fila insertada | **el control que detecta una derivación rota**. `:656` incluso comenta "si esto fuera false, el gist ya lo cubriría y el test no probaría nada" |
| `test/helpers/booking-fixtures.ts:171` | `seedExpiredHold` escribe `seat 0 + is_group false` a mano | asume el motor individual |

### ⚠ Hallazgo: hay una CUARTA lectura del cupo, no listada en D-08

La tabla de D-08 lista tres lugares. Hay un cuarto:
**`app/(dashboard)/agenda/agenda-client.tsx:465-474`** define su **propio** `capacityFor(date, time)`
leyendo `time_blocks.capacity`, y lo usa en `:536` (roster del slot: `capacity: capacityFor(date, time)`)
y en `:638` (`const isGroup = !isSimultaneous && capacityFor(ds, a.time) > 1` — deriva un `isGroup` de
presentación desde el bloque). Es el panel del dueño, no el booking público, así que es un drift de
**visualización**, no de reserva — y el ROADMAP ya asigna la grilla de la agenda a la **Phase 16**.
Pero conviene que quede escrito acá: después de la 068 esa pantalla dice "cupo N" leyendo una columna
que ya no decide nada.

Además, `capacityFor()` de `availability/route.ts` tiene **tres** consumidores además de su
definición: `:218`, `:415` y `:432`. Cambiar solo `:72-83` no alcanza; hay que verificar los tres.

---

## 7. Espejado quirúrgico de `supabase/schema.sql`

`schema.sql` es un espejo **editado a mano**, nunca un `db dump` (declarado en `065:38-43`,
`067:65-67`). Regla observada comparando migración ↔ schema:

- **Los comentarios se COMPRIMEN.** `services_block_delete` ocupa `065:215-284` (70 líneas, densas) y
  en `schema.sql:532-...` queda con 2-4 líneas de comentario. Lo mismo con `book_slot_atomic`: `064`
  tiene 100 líneas de header, `schema.sql:224-500` conserva solo los comentarios inline esenciales
  (la LANDMINE en `:425-428`, el alcance acotado del espejo en `:436-447`).
- **El estilo del DDL se normaliza al formato pg_dump**: `LANGUAGE "plpgsql" SECURITY DEFINER SET
  "search_path" TO 'public'` (con comillas), CHECK como `= ANY (ARRAY['x'::"text", ...])` en vez de
  `IN (...)` — ver `schema.sql:1115` vs `062:66`.
- **Los CHECK van INLINE en el `CREATE TABLE`**, no como `ALTER TABLE` suelto: `schema.sql:1113-1116`.
  Ahí es donde se edita el enum de 3 valores, el DEFAULT `'individual'` y se **agrega** el CHECK de
  coherencia como tercera línea de `CONSTRAINT`.
- **Los triggers viven todos juntos**, en una sola línea cada uno, con `CREATE OR REPLACE TRIGGER`
  (no `CREATE TRIGGER`), ordenados alfabéticamente: `schema.sql:1529-1553`. Un trigger nuevo
  `services_block_mode_change_trg` entra ordenado junto a `services_block_delete_trg` (`:1553`).
- **`NOTIFY pgrst` NO se espeja** en `schema.sql` — es solo de la migración.

Superficies exactas a tocar en `schema.sql`: `:224-500` (función), `:1102-1117` (tabla `services`),
`:1529-1553` (bloque de triggers), y `:436-447` (el comentario de D-07 que hay que reescribir).

---

## Shared Patterns

### Header de migración (obligatorio, molde 065/067)
Bloque de comentarios antes de una sola línea de SQL, con estas secciones en este orden:
1. Título de una línea: `-- NNN — <qué hace>` + `(<fase / requisito / workstream>)`.
2. `-- Contexto (motor-reservas / Phase NN — CUPO-xx, v0.27):` con el defecto que se corrige.
3. `-- Qué hace:` numerado, **en el orden en que corren las sentencias** (acá: el orden de D-05).
4. `-- Qué NO hace (invariantes del proyecto):` — el bloque que las seis migraciones repiten. Incluye
   siempre: "NO edita la NNN-1 (ya aplicada en prod)", "NO cambia la firma del RPC", "NO toca policies
   RLS", y el párrafo de aplicación (`db reset` local PG17 es la única validación · prod A MANO ·
   `schema.sql` quirúrgico, nunca `db dump` · última en prod = 067).
5. Divergencias conscientes del molde, si las hay (`065:45-52`).

### Aislamiento por tenant dentro de `SECURITY DEFINER`
`WHERE ... AND business_id = <tenant>` **explícito** en toda query dentro de una función
`SECURITY DEFINER` — la RLS **no aplica** ahí. Justificado en `062:167-172`, `065:153-155`,
`064:322`. Aplica al gate nuevo de CUPO-08 y a la lectura del modo en el RPC.

### Separadores de sección
`-- ── N. Título ─────────────────────────` (barras Unicode, ~100 col) tanto en SQL como en TS.

---

## No Analog Found

Ninguno. Los 7 artefactos tienen análogo directo. Las dos **ausencias** relevantes ya están
documentadas arriba y son datos accionables, no huecos:

| Cosa | Estado |
|---|---|
| `NOT VALID` + `VALIDATE CONSTRAINT` | **cero precedente** — no introducirlo |
| `ALTER COLUMN ... SET DEFAULT` en migración numerada | **cero precedente** fuera del baseline — la 068 sería la primera; declararlo como divergencia consciente en el header |

---

## Metadata

**Analog search scope:** `supabase/migrations/`, `supabase/schema.sql`, `lib/`, `app/api/`,
`app/(dashboard)/`, `app/[slug]/`, `test/`, `test/helpers/`
**Pattern extraction date:** 2026-08-12
