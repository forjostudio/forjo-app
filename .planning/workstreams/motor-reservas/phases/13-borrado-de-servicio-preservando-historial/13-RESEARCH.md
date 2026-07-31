# Phase 13: Borrado de servicio preservando historial — Research

**Researched:** 2026-07-31
**Domain:** PostgreSQL (columnas aditivas + FK referencial + triggers bajo RLS) · PostgREST/supabase-js (mapeo de errores) · React/Next 16 (read-paths de historial + diálogo de dos estados)
**Confidence:** HIGH (esquema, código y moldes verificados en el repo) / MEDIUM (mapeo de errores de PostgREST y orden BEFORE-trigger vs. acción referencial: citados de docs oficiales, sin ejecución local aún)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Mecanismo de desacople**
- **D-01:** **Snapshot al crear el turno.** `appointments` suma dos columnas nuevas (nombre y precio del servicio), pobladas en cada alta. La historia queda **autónoma**: no depende de que la fila de `services` siga viva. Se descartó el soft-delete del servicio (obligaría a filtrar `deleted_at IS NULL` en TODOS los listados — panel, `public_services`, alta manual, abonos, canchas — y olvidarse en uno resucita el servicio) y el snapshot perezoso (dejaría las columnas nulas en el 99% de las filas sin resolver nada más).
- **D-02:** **El snapshot lo escribe un trigger `BEFORE INSERT` en la DB**, que copia `name`/`price` desde `services` filtrando por `business_id`. El **write-path de la app queda intacto**: cero cambios en `createAppointmentCore` ni en los cuatro consumidores del RPC (booking público, alta manual, generación forward de abonos, canchas) — que es exactamente donde vive el riesgo de regresión de este workstream. Cubre además cualquier insert que no pase por el core (seeds, callers futuros).
- **D-03:** **El snapshot es una foto inmutable**, no un espejo: se escribe una vez y no se refresca nunca. Un turno de marzo conserva el nombre y el precio que el servicio tenía en marzo. Consecuencia **buscada y aceptada**: editar el precio de un servicio deja de reescribir la facturación histórica (hoy sí lo hace).
- **D-04:** **`appointments.service_id` pasa a `ON DELETE SET NULL`** y la misma migración **backfillea** el snapshot de todos los turnos históricos desde el join actual. Alcanza porque **Finanzas no agrupa por `service_id`** (verificado: suma `services(price)` y muestra `services(name)` por fila). Se descartó dropear el FK para conservar un UUID huérfano — perdería integridad referencial en el write-path vivo, en contra de la disciplina anti-tampering del proyecto. **Límite conocido del backfill:** hereda el precio **actual** de cada servicio; el precio real que tenía un turno de marzo ya se perdió y no es reconstruible. Es aceptado, no un bug a resolver.

**Autoridad del precio en el historial**
- **D-05:** **Snapshot primero, join de fallback** (`COALESCE(snapshot, services.…)`) para nombre y precio. Con el backfill el snapshot queda siempre poblado, así que el join sobrevive solo como red de seguridad ante un snapshot vacío.
- **D-06:** **Solo se migran los read-paths de historial:** Finanzas, ficha del cliente y Turnos (tabs Pasados/Todos). Agenda, Dashboard, Abonos e impersonación muestran turnos vivos, donde el servicio existe por definición — no se tocan. Diff chico y enfocado.
- **D-07:** **Un turno de un servicio borrado NO se distingue visualmente** en el historial: se lee igual que cualquier otro turno, con su nombre y su precio. Es literalmente lo que pide HIST-03.

**Qué bloquea el borrado**
- **D-08:** **"Tiene turnos futuros" = `date >= hoy` (hora AR) y `status != 'cancelled'`.** Un turno futuro ya cancelado no bloquea nada. Se descartó contar cancelados: reproduciría exactamente la confusión que esta fase viene a arreglar (el dueño cancela todo y el borrado sigue trabado). El chequeo corre **server-side filtrando por `business_id`**.
- **D-09:** **Abonos: el activo bloquea, el archivado se desacopla.** Hoy `abonos.service_id` es `ON DELETE RESTRICT`, así que una serie dada de baja hace meses traba el borrado. Un abono **activo** cuenta como turnos futuros y dispara el mismo modal (mencionando la serie viva); los **cancelados/completados** dejan de bloquear: su FK también pasa a `SET NULL` **con snapshot del nombre del servicio**, para que el detalle de la serie archivada no quede vacío. La migración toca dos tablas.
- **D-10:** **El gate vive en un trigger `BEFORE DELETE` en la DB.** Al pasar el FK a `SET NULL` se pierde el guard que hoy da Postgres: un pre-check solo en el cliente dejaría una ventana TOCTOU en la que un turno reservado en el medio queda huérfano en silencio. El trigger rechaza el DELETE si hay turnos futuros no cancelados o un abono activo (filtrando por `business_id`), y el borrado **sigue saliendo desde `settings-client` con la sesión del dueño + RLS**, como el resto del CRUD de Ajustes.

**UX del borrado y de la desactivación**
- **D-11:** **Pre-check al abrir + un solo modal con dos estados.** Al tocar el tacho se consulta si hay turnos futuros / abono activo y se abre el **mismo** diálogo en uno de dos estados: *bloqueado* (explica y ofrece "Desactivar") o *confirmable* (aclara que se conservan N turnos en el historial). El dueño sabe qué va a pasar **antes** de apretar; el trigger de D-10 queda de backstop por si algo cambió en el medio.
- **D-12:** **El botón "Desactivar" desactiva ahí mismo** (`toggleService(id, false)`, que ya existe), cierra el diálogo y confirma con un toast. Ofrecer la vía sin ejecutarla dejaría al dueño buscando el switch.
- **D-13:** **El modal bloqueado muestra conteo + fecha del próximo turno** ("tiene 3 turnos reservados a partir del 5/8", y "y un abono activo" cuando aplique). Sale de la misma query del pre-check. Se descartó linkear a Turnos filtrado por servicio: ese filtro no existe hoy (Turnos filtra por profesional, estado y rango de fecha) y construirlo sería capacidad nueva.
- **D-14:** **Los servicios desactivados salen de la lista principal**, con **tabs "Activos / Desactivados" y contador** — molde exacto del filtro Archivados de `/abonos` (Phase 7, D-20). Hoy quedan mezclados con el nombre tachado, lo que vuelve pobre la salida que ofrece D-12. No hace falta migración: `services.active` ya existe. **Solo servicios** — sedes y profesionales tienen el mismo problema pero quedan diferidos.

### Claude's Discretion

- Nombres exactos de las columnas del snapshot en `appointments` y en `abonos` (respetando snake_case y el molde de columnas aditivas de 055/061).
- Número y estructura de la migración: la próxima libre es la **065** (062/063/064 salieron en Phase 12 y ya están en prod). Orden de `ADD COLUMN` → backfill → `ALTER FK` → triggers, idempotencia, y `NOTIFY pgrst, 'reload schema'`.
- Cómo el trigger `BEFORE DELETE` comunica el motivo del rechazo (código de error / mensaje) y cómo lo mapea el cliente al estado del modal — molde del mapeo `23505`/`23P01` → `slot_taken` de `booking-core`.
- Si el pre-check del modal es una query directa desde `settings-client` o un helper compartido.
- Layout fino del diálogo de dos estados y del switch de tabs, dentro del design system existente.

### Deferred Ideas (OUT OF SCOPE)

- **Modal + desacople completo para sede y cancha** — mismo patrón, otra fase (ya diferido en REQUIREMENTS §Future). Acá solo se corrige su copy.
- **Tabs Activos/Desactivados también en sedes y profesionales** — mismo problema de lista mezclada; queda fuera para no triplicar la superficie de UI de esta fase.
- **Filtro por servicio en la pantalla de Turnos** — haría accionable el modal bloqueado ("ver los 3 turnos que bloquean"), pero hoy no existe: es capacidad nueva.
- **Reconstruir el precio histórico real de los turnos anteriores al snapshot** — imposible con los datos actuales; el backfill hereda el precio vigente y se acepta (D-04).

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Descripción | Soporte de esta investigación |
|----|-------------|-------------------------------|
| HIST-01 | El dueño puede **borrar** un servicio cuyos turnos son todos pasados/cancelados (sin turnos futuros). | §Esquema real (FK `appointments_service_id_fkey` → `SET NULL`), §Trigger `BEFORE DELETE` (gate D-08/D-09/D-10), §Molde de migración 065. |
| HIST-02 | Al intentar borrar un servicio con turnos **futuros**, un **modal** lo bloquea, lo explica y ofrece **desactivar**. | §Pre-check (molde literal `canchas-manager.openDelete`), §Diálogo de dos estados (`ConfirmDialog` + `toggleService`), §Mapeo del error P0001 al estado bloqueado. |
| HIST-03 | Los turnos **pasados** de un servicio borrado siguen visibles en el historial (Finanzas / ficha del cliente) con su nombre y precio, sin romper reportes. | §Trigger `BEFORE INSERT` de snapshot + backfill, §Read-paths de historial (7 sitios en Finanzas + 2 helpers en clientes + 2 en Turnos + export CSV). |
</phase_requirements>

---

## Summary

Esta fase es **una migración + un helper puro + un diálogo**. No hay stack nuevo, no hay paquete nuevo, no hay decisión de arquitectura abierta: el CONTEXT cerró las 14 decisiones y el repo ya tiene el molde literal de **cada** una de las piezas. El trabajo real es de precisión, no de invención.

Lo que la investigación confirma y aporta encima del CONTEXT:

1. **Los cuatro FKs a `services` están verificados con su nombre exacto** y solo dos se tocan: `appointments_service_id_fkey` (hoy sin acción = `NO ACTION`, pasa a `SET NULL`) y `abonos_service_id_fkey` (hoy `RESTRICT`, pasa a `SET NULL`). `professional_services_service_id_fkey` (CASCADE) y `professionals_service_id_fkey` (SET NULL) se resuelven solos.
2. **El molde de trigger ya existe en el repo** (`appointment_spaces_populate` / `_cleanup`, migr. 042): `CREATE OR REPLACE FUNCTION … LANGUAGE plpgsql SECURITY DEFINER SET search_path = public` + `CREATE TRIGGER`. El molde de columna aditiva idempotente está en 055/061/062. La migración libre es la **065**.
3. **El error del `BEFORE DELETE` llega al browser como `{ code: 'P0001', message, details, hint }`** (PostgREST → supabase-js), que es exactamente el mismo canal que ya usa `booking-core` para `slot_taken`/`slot_full`. El mapeo cliente es una línea.
4. **Hay dos read-paths de historial que el CONTEXT no lista y que rompen HIST-03 si se olvidan**: `app/api/export/finances/route.ts` (el CSV de Finanzas) y los helpers `getApptPrice`/`getApptService` de `clients-client.tsx` (la ficha del cliente lee de ahí, no de `page.tsx`). Ver §Read-paths.
5. **El "Folded Todo" del copy de sede/cancha YA ESTÁ SHIPEADO** (commit `8e34b00`, 2026-07-27) y REQUIREMENTS lo declara Out of Scope. El planner debe **verificar, no reescribir**.
6. **Landmine principal:** `lib/canchas.ts::deleteCancha` también hace `DELETE FROM services` y hoy mapea `23503 → has_appointments`. Al soltar el FK ese `23503` deja de existir y el trigger nuevo devuelve `P0001` ⇒ si no se actualiza el mapeo, el borrado de una cancha bloqueada muestra el toast genérico "No se pudo eliminar la cancha".

**Primary recommendation:** una única migración **065** en el orden `ADD COLUMN (nullable) → backfill idempotente → ALTER FK (drop+add) → funciones+triggers → NOTIFY pgrst`, un helper puro nuevo `lib/appointment-service.ts` (`apptServiceName` / `apptServicePrice`) que centralice el fallback de D-05 y se consuma desde los ~12 read-paths de historial, y un diálogo de dos estados que reusa `ConfirmDialog` + el pre-check literal de `canchas-manager.openDelete`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Snapshot inmutable de nombre/precio al crear el turno | **Database (trigger `BEFORE INSERT`)** | — | D-02: cubre los 4 consumidores del RPC + cualquier caller futuro sin tocar el write-path. La app no participa. |
| Desacople del FK (`SET NULL`) + backfill histórico | **Database (migración 065)** | — | Integridad referencial es responsabilidad de la base; el backfill es un `UPDATE` de una sola vez. |
| Gate autoritativo "no borrar si hay futuros / abono activo" | **Database (trigger `BEFORE DELETE`)** | Client (pre-check UX) | D-10: sin ventana TOCTOU. El cliente NO autoriza, solo anticipa. |
| Pre-check de conteo + próximo turno para el modal | **Client (`settings-client` + browser client con RLS)** | Database (RLS) | Es UX. La query filtra por `business_id` (defensa en profundidad) y la garantía real está en el trigger. |
| Fallback snapshot → join en el historial | **Client/Server components (helper puro TS)** | — | PostgREST no evalúa `COALESCE` en `select()`; el fallback se resuelve en JS. |
| Desactivación (`active = false`) desde el modal | **Client (`toggleService`, ya existe)** | Database (RLS) | D-12: reusar, no reimplementar. |
| Separación visual Activos/Desactivados | **Client (`settings-client`, estado local)** | — | D-14: `services.active` ya existe; es filtro de presentación. |

---

## Standard Stack

### Core

| Librería | Versión | Propósito | Por qué es la estándar acá |
|----------|---------|-----------|----------------------------|
| PostgreSQL (Supabase) | 17 (local, `supabase db reset`) | Columnas, FK, triggers, backfill | Es la única capa que puede hacer atómico el gate (D-10) y universal el snapshot (D-02). [VERIFIED: supabase/migrations + schema.sql] |
| `@supabase/supabase-js` | `^2.106.2` | DELETE/UPDATE del panel con anon+RLS y lectura del error de Postgres | Ya es el canal del CRUD de Ajustes. [VERIFIED: package.json] |
| Next.js | `16.2.7` (App Router) | Server Components de los read-paths + client components de Ajustes | Stack del proyecto. [VERIFIED: package.json] |
| `@base-ui/react` vía `@/components/ui/dialog` | `^1.5.0` | Diálogo con focus-trap/Escape/portal | Ya lo compone `ConfirmDialog`; NO hand-rollear overlay ni trap. [VERIFIED: components/crm/confirm-dialog.tsx:10-11] |
| `sonner` | `^2.0.7` | Toasts de confirmación / error | Patrón único de feedback del panel. [VERIFIED: package.json] |
| `vitest` | ya instalado | Tests puros (helper de fallback) + integración contra Supabase local | `test/booking-core.test.ts` y `test/helpers/booking-fixtures.ts` son el molde. [VERIFIED: vitest.config.ts, test/] |

### Supporting

Ninguna. **Esta fase no instala nada.**

### Alternatives Considered

| En vez de | Se podría usar | Trade-off |
|-----------|----------------|-----------|
| Extender `ConfirmDialog` con props opcionales | Componente nuevo `delete-service-dialog.tsx` | Ver §Superficie de UI → "Dos estados". Recomendación: extender (aditivo, 0 impacto en los 10 call-sites), alternativa válida si el layout diverge mucho. |
| Helper puro en `lib/` | Fallback inline en cada read-path | El inline ya existe y está **duplicado 12 veces**; centralizar es lo que vuelve testeable HIST-03. |

**Installation:** ninguna.

---

## Package Legitimacy Audit

**No aplica: esta fase no instala ningún paquete externo.** No hay `npm install` en el alcance (verificado contra las decisiones D-01..D-14 y contra el código a modificar). No hay verdicts `SLOP`/`SUS` que reportar y el planner **no** necesita insertar ningún `checkpoint:human-verify` por dependencias.

---

## Esquema real actual (verificado en `supabase/schema.sql`)

### `public.appointments` (schema.sql:487-515)

Columnas relevantes: `id`, `business_id uuid` (**NULLABLE**), `professional_id`, `service_id uuid` (**NULLABLE**), `client_id`, `client_name text NOT NULL`, `date date NOT NULL`, `time time NOT NULL`, `status text DEFAULT 'pending'` (**NULLABLE**), `payment_status`, `notes`, `created_at`, `location_id`, `email_sent`, `cancel_token`, `deposit_paid`, `deposit_amount numeric(10,2)`, `mp_payment_id`, `expires_at`, `duration_minutes int`, `google_event_id`, `seat smallint NOT NULL DEFAULT 0`, `is_group boolean NOT NULL DEFAULT false`, `abono_id uuid`.

Constraints e índices anti-doble-booking (**NO se tocan**):

- `appointments_no_overlap` — `EXCLUDE USING gist (business_id =, COALESCE(professional_id, sentinel) =, tsrange(date+time, …+duration) &&) WHERE (status IN ('confirmed','pending_payment') AND NOT is_group)` (schema.sql:1110-1111).
- `appointments_no_double_booking` — `UNIQUE INDEX (business_id, COALESCE(professional_id, sentinel), date, time, seat) WHERE status IN ('confirmed','pending_payment')` (schema.sql:1279).

Triggers existentes sobre `appointments` (schema.sql:1383-1387):

- `appointment_spaces_populate_trg` — **AFTER INSERT** FOR EACH ROW.
- `appointment_spaces_cleanup_trg` — **AFTER UPDATE OF status** FOR EACH ROW.

RLS: `ENABLE ROW LEVEL SECURITY` (1820) + policy `"business member access"` (ALL, `USING business_id IN (select id from businesses where owner_id = auth.uid())`, 1874) + policy `"appointments tenant insert"` (INSERT `WITH CHECK`, 1823). **No hay policies por columna** ⇒ las columnas nuevas quedan cubiertas automáticamente.

### `public.services` (schema.sql:956-971)

`id`, `business_id uuid` (**NULLABLE**), `name text NOT NULL`, `duration_minutes int NOT NULL`, `price numeric(10,2) NOT NULL`, `description`, `active boolean DEFAULT true`, `created_at`, `location_id`, `location_ids uuid[]`, `capacity_mode text NOT NULL DEFAULT 'group_class'` (CHECK `services_capacity_mode_chk`), `capacity smallint NOT NULL DEFAULT 1` (CHECK `services_capacity_positive`).

RLS habilitada (2032) + policy única `"business member access"` **sin cláusula `FOR`** ⇒ aplica a ALL, incluido DELETE (1892). Vista pública `public_services` (977-989) expone `id, business_id, name, duration_minutes, price, description, active, location_id, location_ids, created_at, capacity_mode` con `WHERE active = true`. **Esta fase NO la toca** (las columnas nuevas están en `appointments`/`abonos`, no en `services`).

### `public.abonos` (schema.sql:427-450)

`service_id uuid` (NULLABLE), `status text NOT NULL DEFAULT 'active'` CHECK `IN ('active','cancelled','completed')`, RLS con 4 policies por operación (1724-1745).

### Los CUATRO FKs a `services` — nombres exactos para el `ALTER TABLE`

| Constraint | Tabla | ON DELETE actual | schema.sql | Acción en la 065 |
|------------|-------|------------------|-----------|------------------|
| `appointments_service_id_fkey` | `appointments` | *(ninguna → `NO ACTION`)* | :1485-1486 | **DROP + ADD con `ON DELETE SET NULL`** (D-04) |
| `abonos_service_id_fkey` | `abonos` | `ON DELETE RESTRICT` | :1416 | **DROP + ADD con `ON DELETE SET NULL`** (D-09) |
| `professional_services_service_id_fkey` | `professional_services` | `ON DELETE CASCADE` | :1446 | **Sin cambio** (se resuelve solo) |
| `professionals_service_id_fkey` | `professionals` | `ON DELETE SET NULL` | :1626 | **Sin cambio** (mecanismo de canchas, migr. 043) |

[VERIFIED: `supabase/schema.sql`, grep sobre `ADD CONSTRAINT … REFERENCES "public"."services"`]

**Baseline de migraciones:** el último archivo del repo es `064_agenda_day_lock_and_mirror_gate.sql` y las 062/063/064 **ya están aplicadas en prod** (CONTEXT + MEMORY §Phase 12) ⇒ **la próxima libre es la 065**. [VERIFIED: `ls supabase/migrations/`]

---

## Molde de migración (extraído literal de 042/055/056/061/062)

### Anatomía obligatoria

1. **Cabecera de comentario larga en español**, con: número + título en una línea, `-- Contexto (workstream / Phase N — REQ-IDs, vX.Y)`, `-- Qué hace:` numerado, `-- Qué NO hace (invariantes del proyecto):`, y **siempre** el párrafo de aplicación: *"NO se aplica vía push remoto. La ÚNICA validación es `supabase db reset` local (PG17)… Prod se aplica A MANO coordinado con el deploy + `NOTIFY pgrst, 'reload schema';`. La última migración en prod = 064. Tras aplicar, regenerar `supabase/schema.sql`"*. [VERIFIED: 055:1-45, 061:1-34, 062:1-46]
2. **Secciones numeradas** separadas por `-- ── N. Título ────────` (barras Unicode). [VERIFIED: 062:48, 061:36]
3. **Idempotencia**: `ADD COLUMN IF NOT EXISTS`, constraints dentro de un `DO $$ … IF NOT EXISTS (SELECT 1 FROM "pg_constraint" WHERE "conname" = … AND "conrelid" = '"public"."tabla"'::"regclass") … END $$;`. [VERIFIED: 055:56-64, 061:41-54, 062:56-85]
4. **Funciones**: `CREATE OR REPLACE FUNCTION "public"."nombre"() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ … $$;` seguido de `ALTER FUNCTION … OWNER TO "postgres";`. [VERIFIED: 042:310-330]
5. **Triggers**: `CREATE TRIGGER "nombre_trg" AFTER|BEFORE <evento> ON "public"."tabla" FOR EACH ROW EXECUTE FUNCTION "public"."fn"();`. ⚠ **042 NO usa `DROP TRIGGER IF EXISTS` previo** — como `CREATE TRIGGER` (sin `OR REPLACE`) falla si el trigger ya existe, para que la 065 sea **re-corrible** hay que anteponer `DROP TRIGGER IF EXISTS "x" ON "public"."tabla";` (divergencia justificada del molde; PG14+ soporta `CREATE OR REPLACE TRIGGER`, pero el `DROP IF EXISTS` es más explícito y coherente con el estilo del repo). [VERIFIED: 042:333-335, 357-359]
6. **Cierre**: `NOTIFY pgrst, 'reload schema';` **siempre**. [VERIFIED: 061:94, 062:394]
7. **Nombres SQL entrecomillados** (`"public"."appointments"`) en DDL, siguiendo el dump.
8. **Backfill / normalización va ANTES de la constraint que valida** (molde 055:52-56: el `UPDATE` de clamp precede al `ADD CHECK`).

### Orden recomendado de la 065

```
1. ADD COLUMN IF NOT EXISTS  appointments.<snapshot nombre>  text          -- NULLABLE
   ADD COLUMN IF NOT EXISTS  appointments.<snapshot precio>  numeric(10,2) -- NULLABLE
   ADD COLUMN IF NOT EXISTS  abonos.<snapshot nombre>        text          -- NULLABLE
2. BACKFILL idempotente (UPDATE … FROM services … WHERE snapshot IS NULL)
3. ALTER FK: DROP CONSTRAINT appointments_service_id_fkey + ADD … ON DELETE SET NULL
   ALTER FK: DROP CONSTRAINT abonos_service_id_fkey       + ADD … ON DELETE SET NULL
4. FUNCIÓN + TRIGGER  BEFORE INSERT ON appointments  (snapshot)
   FUNCIÓN + TRIGGER  BEFORE INSERT ON abonos        (snapshot del nombre)
   FUNCIÓN + TRIGGER  BEFORE DELETE ON services      (gate D-08/D-09/D-10)
5. NOTIFY pgrst, 'reload schema';
```

**Por qué las columnas van NULLABLE y no `NOT NULL DEFAULT` como en 055/061/062:** `appointments.service_id` es nullable, así que un turno sin servicio no tiene snapshot posible. Un `NOT NULL DEFAULT ''` mentiría (un nombre vacío no es "sin servicio") y rompería el fallback de D-05, que distingue por `null`. **Divergencia consciente del molde — documentarla en la cabecera de la migración.**

**Idempotencia del `ALTER FK`:** `DROP CONSTRAINT IF EXISTS` + el `DO $$ IF NOT EXISTS (pg_constraint) … ADD CONSTRAINT` del molde. Ojo: si se hace `DROP IF EXISTS` y después el `IF NOT EXISTS` guard, en la segunda corrida el constraint ya fue dropeado y se re-crea igual ⇒ correcto y re-corrible.

---

## Triggers en Postgres bajo RLS/Supabase — lo que hay que saber

### (a) `BEFORE INSERT` sobre `appointments` que copia de `services`

- **`SECURITY DEFINER SET search_path = public`** es el molde del repo (042) y es lo correcto acá: el owner de la función es `postgres`, que **bypassa RLS**, así que la lectura de `services` funciona igual venga el insert del `service_role` (booking público), del `authenticated` (alta manual) o de dentro del RPC `book_slot_atomic` (que ya es SECURITY DEFINER). Sin `SECURITY DEFINER`, un insert hecho por un rol sin visibilidad RLS sobre `services` dejaría el snapshot en NULL **en silencio**. [CITED: PostgreSQL — SECURITY DEFINER ejecuta con los privilegios del owner]
- **Contrapartida obligatoria (skill `supabase-multitenant-rls`):** adentro de un `SECURITY DEFINER` la RLS no protege ⇒ el `SELECT` **debe** filtrar por `business_id` explícito: `WHERE s.id = NEW.service_id AND s.business_id = NEW.business_id`. Es el mismo razonamiento que la migr. 062:167-177 documenta para `book_slot_atomic`.
- **`NEW.service_id IS NULL`** (posible: la columna es nullable) → el `SELECT … INTO` no matchea, las variables quedan NULL, el snapshot queda NULL. **Comportamiento correcto y deseado** — el fallback de D-05 lo lee como "Sin servicio", igual que hoy. **No hay que hacer `RAISE`.**
- **`NEW.business_id IS NULL`** (la columna es nullable en el esquema) → el filtro `s.business_id = NEW.business_id` nunca matchea ⇒ snapshot NULL. Es *fail-safe* (nunca copia datos de otro tenant) pero silencioso. Documentarlo; en la práctica los 4 consumidores siempre mandan `business_id`.
- **Tampering:** el trigger debe **sobrescribir incondicionalmente** (`NEW.x := …`), no "solo si viene NULL". Si respetara el valor entrante, un dueño podría insertar por PostgREST un turno con precio inflado y falsear su propia facturación. Sobrescribir siempre lo vuelve inviolable en el INSERT.
- **Inmutabilidad (D-03) en el UPDATE:** no hay trigger de UPDATE propuesto, así que un dueño **sí** puede editar el snapshot de sus propios turnos vía PostgREST (`update({ service_price: … })`). Riesgo: bajo (son sus datos, no hay cruce de tenants), pero es una **amenaza a registrar para secure-phase**. Si se decide cerrarlo, el trigger `BEFORE UPDATE` debe restaurar `OLD` **solo** para las columnas de snapshot y **jamás** bloquear el cambio de `service_id` (porque el `ON DELETE SET NULL` llega justamente como un UPDATE de `service_id` y bloquearlo rompería la integridad referencial — ver la advertencia de las docs de PG citada abajo).
- **Interacción con los triggers existentes:** el `SET NULL` del FK dispara un `UPDATE` sobre `appointments` que toca **solo `service_id`**. El trigger `appointment_spaces_cleanup_trg` está declarado `AFTER UPDATE **OF status**` ⇒ **no se dispara**. Cero efecto colateral. [VERIFIED: schema.sql:1383]

### (b) `BEFORE DELETE` sobre `services` con `RAISE EXCEPTION`

- **Orden de ejecución.** Las docs de PG dicen que un trigger BEFORE ROW se dispara *"before constraints are checked and the INSERT, UPDATE, or DELETE is attempted"*, y que las acciones referenciales *"are treated as part of the SQL command that caused them (note that such actions are never deferred)"* ejecutándose como `UPDATE`/`DELETE` ordinarios **sobre la tabla referenciante**. ⇒ **Un `RAISE` en el `BEFORE DELETE` aborta la transacción antes de que se aplique cualquier `ON DELETE SET NULL`**: no hay estado intermedio ni turnos que queden huérfanos por un borrado rechazado. [CITED: postgresql.org/docs/current/sql-createtrigger.html] [CITED: postgresql.org/docs/current/trigger-definition.html]
- **Las docs también avisan:** *"any triggers that exist on the referencing table will be fired for those changes… If such a trigger modifies or blocks the effect of one of these commands, the end result could be to break referential integrity."* → esto es exactamente por qué un futuro trigger de inmutabilidad no puede bloquear el `service_id := NULL`.
- **Forma del error que llega al browser.** PostgREST mapea `P0001` (default de `RAISE` en PL/pgSQL) a **HTTP 400** y devuelve `{"message": <texto del RAISE>, "details": <USING DETAIL>, "hint": <USING HINT>, "code": "P0001"}`; `supabase-js` lo entrega como `error: PostgrestError` con esos cuatro campos. [CITED: docs.postgrest.org/en/stable/references/errors.html]
- **Molde de mapeo ya vigente en el repo:** `lib/booking-core.ts:346-360` distingue por `rpcErr?.message?.includes('slot_full' | 'slot_taken' | 'simultaneous_space_conflict')` y por `rpcErr?.code === '23505' | '23P01'`. ⇒ El trigger debe hacer `RAISE EXCEPTION 'service_has_future_appointments' USING ERRCODE = 'P0001'` (o dos códigos distintos si se quiere distinguir "abono activo") y el cliente chequear `error.code === 'P0001' && error.message.includes('service_has_future_appointments')`.
- **NULL-safety del predicado de estado (LANDMINE).** `appointments.status` es **nullable** (DEFAULT `'pending'`). `status <> 'cancelled'` evalúa a NULL para una fila con status NULL ⇒ esa fila **no se cuenta** y el gate se abre de más. Usar `a.status IS DISTINCT FROM 'cancelled'` (o `COALESCE(a.status,'pending') <> 'cancelled'`).
- **"Hoy en hora AR" dentro de SQL.** Ninguna migración del repo computa todavía la fecha argentina en SQL (verificado por grep: 0 ocurrencias de `AT TIME ZONE` / `Buenos_Aires` / `-03:00` en `supabase/migrations/`). La forma canónica es `(now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`. En TypeScript el repo usa dos variantes ya establecidas: `new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })` (`canchas-manager.tsx:162`) y `todayInAR()` (`lib/booking-window.ts:32`). El pre-check del cliente y el trigger **tienen que coincidir**, o el modal dirá "podés borrar" y el trigger rechazará (o al revés) en el borde del día.
- **Filtro por tenant en el gate.** El predicado autoritativo es `a.service_id = OLD.id` (el UUID es PK global ⇒ no puede haber falsos positivos cross-tenant). Sumar `AND a.business_id = OLD.business_id` como defensa en profundidad es lo que pide la skill, **pero** `services.business_id` es nullable: si fuera NULL, ese `AND` haría que el conteo dé 0 y el gate se abriría. Recomendación: usar `a.service_id = OLD.id AND (OLD.business_id IS NULL OR a.business_id = OLD.business_id)` — fail-closed y con el filtro explícito.
- **Abono activo (D-09):** segundo `EXISTS` sobre `abonos WHERE service_id = OLD.id AND status = 'active'`.
- El trigger también debe ser `SECURITY DEFINER SET search_path = public` para contar `appointments`/`abonos` sin depender de la RLS del rol que borra.

---

## Read-paths de historial a migrar (D-05 / D-06)

### PostgREST y `COALESCE`

**PostgREST no evalúa expresiones SQL en `select()`**: soporta columnas, casts (`col::text`), renombres (`alias:col`) y embeds (`services(name,price)`), pero **no** funciones escalares como `COALESCE`. ⇒ El fallback de D-05 **se resuelve en TypeScript**, del lado del consumidor. [ASSUMED — no verificado contra la doc de PostgREST en esta sesión; el patrón, en cambio, sí está verificado como el único usado en el repo]

Además: con `select('*, services(name, price)')`, el `*` ya trae automáticamente las columnas nuevas ⇒ **la mayoría de los selects no cambian**. Solo hay que agregar las columnas explícitamente donde el select es acotado (`select('services(price)')`, `select('date, services(name, price)')`).

⚠ **El embed `services(...)` depende de que el FK exista.** Como D-04 conserva el FK (solo cambia la acción), **todos los embeds siguen funcionando**; si en algún momento se dropeara el FK, PostgREST perdería la relación y **todos** estos selects fallarían con `PGRST200`. Es una razón técnica adicional a favor de D-04.

### Patrón recomendado — helper puro compartido

Hoy el fallback está **duplicado 12 veces** con el mismo cast inline. Lo que ya existe más parecido a un helper son estas dos funciones de la ficha del cliente:

```ts
// app/(dashboard)/clients/clients-client.tsx:145-150 (estado ACTUAL)
function getApptPrice(a: Appointment): number {
  return (a.services as { price?: number } | null)?.price || 0
}
function getApptService(a: Appointment): string {
  return (a.services as { name?: string } | null)?.name || '—'
}
```

**Recomendación:** promoverlas a `lib/appointment-service.ts` (funciones puras, sin React ni Supabase — mismo criterio que `lib/booking-window.ts`), con el snapshot primero, y consumirlas desde todos los read-paths de historial. Eso vuelve HIST-03 testeable con Vitest sin DB.

### Inventario exacto de sitios (líneas verificadas hoy)

| Archivo | Línea | Qué hace | ¿En alcance D-06? |
|---------|-------|----------|-------------------|
| `app/(dashboard)/finances/finances-client.tsx` | 219 | `select('*, services(name, price)')` — lista principal del período | **SÍ** (el `*` ya trae el snapshot; no cambia el select) |
| ídem | 246 + **250** | `select('services(price)')` período anterior + reduce | **SÍ** — el select **sí** hay que ampliarlo |
| ídem | 268 + **273** | `select('services(price)')` chart 6 meses + reduce | **SÍ** — ampliar select |
| ídem | **288** | `apptRevenue` reduce | **SÍ** |
| ídem | **314** | ranking por servicio (`svc?.name`, `svc?.price`) | **SÍ** |
| ídem | **518** | `buildDailyCashflow` reduce | **SÍ** |
| ídem | **881** | render de fila (nombre + precio) | **SÍ** |
| `app/api/export/finances/route.ts` | **48 + 66-72** | CSV de Finanzas: `select('date, services(name, price)')`, `concepto = svc?.name ?? '—'`, `monto = svc?.price ?? 0` | **SÍ — NO listado en el CONTEXT.** Es Finanzas; si se omite, el CSV de un servicio borrado sale "—" / 0 y contradice HIST-03. |
| `app/(dashboard)/clients/page.tsx` | 24 | `select('*, services(name, price)')` | **SÍ** (el `*` ya alcanza) |
| `app/(dashboard)/clients/clients-client.tsx` | **145-150** | `getApptPrice` / `getApptService` — **acá vive el fallback real de la ficha** | **SÍ — NO listado en el CONTEXT** |
| `app/(dashboard)/appointments/page.tsx` | 20 | `select('*, professionals(name), services(name, price, duration_minutes)')` | **SÍ** (el `*` alcanza) |
| `app/(dashboard)/appointments/appointments-client.tsx` | 169 | mismo select en `refresh()` | **SÍ** (el `*` alcanza) |
| ídem | **382 y 424** | render de la tabla (desktop) y de las tarjetas (mobile) — **son dos**, la regresión clásica es tocar una sola | **SÍ** |
| `app/(dashboard)/abonos/page.tsx` | 39 | `select('… services(name) …')` de la serie | **SÍ para D-09** (serie archivada) — agregar el snapshot de `abonos` al select |
| `app/(dashboard)/abonos/abonos-client.tsx` | 39-46 (`AbonoRow`) | tipo con `services: { name: string } \| null` | **SÍ para D-09** — sumar el campo del snapshot al tipo |
| `app/(dashboard)/agenda/page.tsx` | 41 | turnos vivos | **NO** (D-06) |
| `app/(dashboard)/dashboard/page.tsx` | 61/68/75 + **83-85** (`monthRevenue`) | Dashboard | **NO por D-06** — ver §Open Questions #1 |
| `lib/impersonation.ts` | 79 | vista de soporte | **NO** (D-06) |
| Rutas de mail/pago/cancelación (`api/notify/*`, `api/payment/*`, `api/cancel/*`, `api/google/sync`, `app/[slug]/…`) | varias | turnos **vivos** | **NO** — el servicio existe por definición |

`lib/types.ts::Appointment` (243-282) tiene que sumar los dos campos opcionales del snapshot; `Service` (181-203) no cambia.

---

## Superficie de UI a tocar

### `deleteService` (settings-client.tsx:521-533) — estado actual

```ts
async function deleteService(id: string) {
  // NO optimista: capturamos el error real. Defensa en profundidad con business_id (igual que
  // deleteProfessional). Si hay turnos asociados, el FK (23503) bloquea el borrado → sugerimos
  // desactivar en vez de tocar el estado (el item sigue en la lista porque no filtramos).
  const { error } = await supabase.from('services').delete().eq('id', id).eq('business_id', business.id)
  if (error) {
    if (error.code === '23503') toast.error('No se puede eliminar: el servicio tiene turnos asociados, …')
    else toast.error('No se pudo eliminar el servicio')
    return
  }
  setServices(prev => prev.filter(s => s.id !== id))
  toast.success('Servicio eliminado')
}
```

Tras la 065 el `23503` **ya no puede ocurrir por `appointments`** (pasa a `SET NULL`) ni por `abonos` — el rechazo llega como `P0001`. La rama `23503` se reemplaza (no se elimina a ciegas: dejarla como fallback defensivo es barato).

`toggleService` (534-537) queda tal cual y es lo que invoca D-12. ⚠ Nota: `toggleService` **no filtra por `business_id`** ni chequea `error` (a diferencia de `deleteService`/`deleteProfessional`/`toggleLocation`). Si el modal lo va a exponer como acción primaria, conviene alinearlo al patrón (`+ .eq('business_id', business.id)` + `if (error) toast.error(...)`).

### Pre-check (D-11/D-13) — el molde EXACTO ya existe

`components/dashboard/canchas-manager.tsx:157-170` hace literalmente esto para las canchas:

```ts
async function openDelete(c: Cancha) {
  setDelCancha(c)
  setDelPending(null)   // null = "contando…"
  // Contar reservas PRÓXIMAS (pending/pending_payment/confirmed, fecha >= hoy AR) …
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const { count } = await supabase.from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', business.id)
    .eq('professional_id', c.professional.id)
    .in('status', ['pending', 'pending_payment', 'confirmed'])
    .gte('date', today)
  setDelPending(count ?? 0)
}
```

Para servicios cambia el filtro (`.eq('service_id', s.id)`) y, por D-13, hace falta también **la fecha del próximo turno** ⇒ conviene una sola query que traiga `select('date', { count: 'exact' }).order('date').limit(1)` en vez de `head: true`, más un segundo `EXISTS` sobre `abonos` (`status = 'active'`). Ojo: D-08 define el filtro como `status != 'cancelled'`, **no** como el `.in([...])` de canchas — usar `.neq('status', 'cancelled')` para que el pre-check y el trigger digan lo mismo.

### Diálogo de dos estados (D-11/D-12)

`ConfirmDialog` (`components/crm/confirm-dialog.tsx`) ya resuelve focus-trap, Escape, portal, anti-doble-submit, `RiskBadge` y el botón destructivo. Su footer es fijo: `[Cancelar] [confirmLabel]`. Su `description` **es dinámica** — el mismo canchas-manager ya construye un `delDescription` de tres estados ("Verificando reservas…" / "⚠ tiene N reservas próximas…" / "…"). Lo que **no** tiene es un segundo botón de acción.

| Opción | Qué implica | Trade-off |
|--------|-------------|-----------|
| **A (recomendada)** Extender `ConfirmDialog` con `secondaryAction?: { label, onClick }` y `confirmHidden?: boolean` | 2 props opcionales, aditivas | Cero impacto en los ~10 call-sites existentes (`ficha-client`, `pipeline-client`, `planes-client`, `abonos-client`, `settings-client` ×2, `addon-toggle`, `extend-trial-dialog`, `canchas-manager`). Reusa el guard anti-doble-submit y los tests puros de `confirm-dialog.test.tsx`. Es "mirror the existing pattern". |
| **B** `components/dashboard/delete-service-dialog.tsx` dedicado | Componente nuevo compuesto de `@/components/ui/dialog` | Libertad total de layout, pero re-implementa gating/loading/focus y agrega un segundo dialog a mantener. |

En **estado bloqueado** el primario debe ser **"Desactivar"** y no debe existir un botón "Eliminar" habilitado (el trigger lo rechazaría igual, pero ofrecer una acción que se sabe que va a fallar es mal UX). En **estado confirmable**, footer clásico `[Cancelar] [Eliminar]` con el copy "se conservan N turnos en el historial".

⚠ `ConfirmDialog.handleConfirm` **traga** el error y muestra un toast genérico ("No se pudo completar la acción…") si `onConfirm` **lanza**. Como `deleteService` no lanza (devuelve tras el toast propio), el dialog se cierra igual. Si se quiere que el modal quede abierto y se re-renderice en estado *bloqueado* cuando el backstop del trigger dispare (carrera real: alguien reservó entre el pre-check y el confirm), `deleteService` tiene que **lanzar o devolver un discriminado** y el caller re-abrir/actualizar el estado. Decisión del planner.

### Tabs Activos/Desactivados (D-14) — molde literal de `/abonos`

- Tipo + constante a nivel módulo: `abonos-client.tsx:53-57` (`type AbonoTab`, `const ABONO_TABS: { key; label }[]`).
- Estado + filtro + contadores con `useMemo`, **usando el MISMO predicado** para filtrar y para contar (comentario explícito en 146-150: "si cada uno decidiera por su cuenta, el tab podría decir 'Activos (1)' sobre una lista vacía").
- Render (264-277): botones pill `rounded-full text-xs font-medium`, `aria-pressed`, activo = `bg-primary text-primary-foreground`, inactivo = `bg-secondary/50 text-muted-foreground hover:text-foreground`, etiqueta `{label} ({count})`.
- Empty state por tab (281-295): borde punteado + icono + título + explicación.
- Para servicios el predicado es trivial: `s.active === (tab === 'activos')`. La lista renderiza en `settings-client.tsx:1454+` (dentro de la rama `!isCanchas`) y el nombre tachado (`!s.active && 'line-through …'`, :1472) puede quedar o irse — con tabs deja de aportar.

### Copy de sede / cancha — **YA HECHO, no re-hacer**

- `settings-client.tsx:886` (sede), `:715` (profesional) y `components/dashboard/canchas-manager.tsx:181` (cancha) **ya dicen** "…tiene turnos asociados, **incluidos pasados y cancelados (cancelar no los borra). Desactivalo para dejar de ofrecerlo y conservar el historial**, o borrá esos turnos primero." Commit `8e34b00` ("fix(11-02): copy honesto de borrado bloqueado…", 2026-07-27). [VERIFIED: lectura del archivo + `git log -S`]
- `REQUIREMENTS.md §Out of Scope` lo confirma: *"Re-hacer el copy de los 3 toasts de borrado (servicio/sede/cancha) — ya está shipeado"*.
- ⇒ **El planner debe emitir a lo sumo una tarea de verificación**, no de edición. (El CONTEXT §Folded Todos y sus números de línea 886/715 están desactualizados respecto de este hecho.)

---

## Don't Hand-Roll

| Problema | No construir | Usar en su lugar | Por qué |
|----------|--------------|------------------|---------|
| Gate atómico "tiene futuros" | Un `select count` en el cliente + `delete` si da 0 | Trigger `BEFORE DELETE` (D-10) | Ventana TOCTOU: una reserva pública entre el count y el delete deja el turno huérfano en silencio. |
| Escribir el snapshot en el write-path | Modificar `createAppointmentCore` / los 4 callers | Trigger `BEFORE INSERT` (D-02) | Es el punto de mayor riesgo de regresión del workstream; además no cubriría seeds ni callers futuros. |
| Fallback snapshot→join | Repetir el ternario en cada uno de los 12 sitios | Helper puro en `lib/` | Ya está duplicado 12 veces; centralizar es lo que vuelve testeable HIST-03 sin DB. |
| Modal, focus-trap, anti-doble-submit | `<div>` con overlay propio | `ConfirmDialog` / `@/components/ui/dialog` | Ya resuelto y testeado (`confirm-dialog.test.tsx`). |
| "Hoy en Argentina" | `new Date().toISOString().slice(0,10)` | `todayInAR()` o `toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })` / `(now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date` | El server corre en UTC en Vercel: a las 21:00 AR el ISO crudo ya es "mañana" y el gate se corre un día. |
| Filtro de servicios desactivados | Un `deleted_at` / soft-delete nuevo | `services.active` (ya existe) | D-01/D-14 lo descartan explícitamente. |

**Key insight:** en esta fase, todo lo que se resuelve en la base es *universal y atómico*; todo lo que se resuelve en el cliente es *UX*. Confundir las dos capas es exactamente el bug que la fase viene a arreglar.

---

## Common Pitfalls

### Pitfall 1: `deleteCancha` deja de reconocer el bloqueo (LANDMINE principal)

**Qué sale mal:** `lib/canchas.ts:186-196` mapea `23503 → 'has_appointments'` en el `DELETE FROM services`. Tras la 065 ese `23503` **ya no se produce** (FK en `SET NULL`) y el rechazo llega como `P0001` ⇒ cae en `service_delete_failed` ⇒ `canchas-manager.tsx:180-183` muestra "No se pudo eliminar la cancha" en vez del copy correcto.
**Por qué pasa:** el trigger nuevo es global sobre `services`, y en el vertical canchas **una cancha ES un service** (migr. 043).
**Cómo evitarlo:** actualizar el mapeo de `deleteCancha` para reconocer también `P0001` + el message del trigger. Nota atenuante: `deleteCancha` borra **primero** el `professional` (cuyo FK desde `appointments` sigue en `NO ACTION`), así que una cancha con cualquier turno ya falla ahí con `23503` — el camino nuevo se ve sobre todo con **abonos** (hoy `RESTRICT`, mañana gate del trigger).
**Señal temprana:** el UAT de canchas muestra el toast genérico al borrar una cancha con abono activo.

### Pitfall 2: `status` NULL abre el gate

**Qué sale mal:** `a.status <> 'cancelled'` no cuenta las filas con `status IS NULL` (la columna es nullable con DEFAULT `'pending'`) ⇒ el trigger deja borrar un servicio con turnos futuros.
**Cómo evitarlo:** `a.status IS DISTINCT FROM 'cancelled'`. Mismo criterio en el pre-check TS (`.neq('status','cancelled')` en PostgREST **también** descarta los NULL ⇒ pre-check y trigger deben usar la misma semántica o divergen; lo más seguro es que el trigger use `IS DISTINCT FROM` y el pre-check `.or('status.is.null,status.neq.cancelled')`, o directamente que ambos usen la lista blanca de estados vivos).

### Pitfall 3: Desfasaje de "hoy" entre el pre-check y el trigger

**Qué sale mal:** el pre-check corre en el browser (zona del usuario o AR explícita) y el trigger en la DB (UTC). A las 21:00-23:59 AR difieren un día ⇒ el modal dice "podés borrar" y el trigger rechaza (o al revés).
**Cómo evitarlo:** ambos con zona AR explícita. En SQL: `(now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`.

### Pitfall 4: `CREATE TRIGGER` sin `DROP … IF EXISTS` rompe la re-corrida

**Qué sale mal:** `CREATE TRIGGER` (sin `OR REPLACE`) falla con `42710` si el trigger ya existe ⇒ la migración deja de ser idempotente y un `db reset` parcial o un re-apply en prod aborta a mitad.
**Cómo evitarlo:** `DROP TRIGGER IF EXISTS "x" ON "public"."tabla";` antes de cada `CREATE TRIGGER`. (La 042 no lo hace porque nació con las tablas.)

### Pitfall 5: Backfill no idempotente

**Qué sale mal:** un backfill sin guard, re-corrido después de que alguien editó un precio, **reescribe** snapshots ya escritos y viola D-03.
**Cómo evitarlo:** `… WHERE a.<snapshot_nombre> IS NULL` (y el análogo en `abonos`). Es la misma disciplina del `UPDATE` previo al CHECK de la 055.

### Pitfall 6: Tocar solo uno de los dos renders de Turnos

**Qué sale mal:** `appointments-client.tsx` renderiza la tabla (desktop, :382) **y** las tarjetas (mobile, :424) con el mismo cast duplicado. Migrar uno solo deja el mobile mostrando "—" para servicios borrados.
**Señal temprana:** UAT visual en 375px.

### Pitfall 7: Ampliar `select('services(price)')` y olvidarse de la columna nueva

**Qué sale mal:** en Finanzas hay dos selects **acotados** (`:246`, `:268`) que no traen `*`. Si solo se cambia el reduce y no el select, el snapshot llega `undefined` y el período anterior / el chart de 6 meses caen a 0 para servicios borrados — el bug se ve como "el gráfico bajó", no como un error.

### Pitfall 8: Asumir que el `.delete()` que no matchea devuelve error

**Qué sale mal:** con RLS, un `DELETE` cuya fila no pasa la policy devuelve `error === null` y 0 filas. `deleteService` mostraría "Servicio eliminado" y sacaría la fila del estado local aunque no se haya borrado nada. Es comportamiento **preexistente** (no una regresión de esta fase), pero si se quiere endurecer, agregar `.select('id')` y verificar que volvió una fila.

### Pitfall 9: Regenerar `schema.sql` con `db dump`

**Qué sale mal:** el CLI reordena el archivo entero y el diff se vuelve irrevisable (decisión registrada del proyecto desde Phase 06).
**Cómo evitarlo:** edición **quirúrgica** a mano de `supabase/schema.sql`: agregar las 3 columnas, cambiar las 2 líneas de `ADD CONSTRAINT … FOREIGN KEY`, y sumar las 3 funciones + 3 triggers en su lugar alfabético/posicional.

---

## Code Examples

### 1. Función + trigger de snapshot (molde 042 + filtro por tenant de 062)

```sql
-- Fuente del molde: supabase/migrations/042_spaces_and_coupled_exclusion.sql:310-335
CREATE OR REPLACE FUNCTION "public"."appointments_service_snapshot"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Filtro por business_id EXPLÍCITO: adentro de un SECURITY DEFINER la RLS NO aplica, así que un
  -- service_id de otro tenant NO debe resolver a nada (skill supabase-multitenant-rls / molde 062).
  -- Se SOBRESCRIBE siempre (no "solo si viene NULL"): el snapshot no puede ser dictado por el cliente.
  SELECT s.name, s.price
    INTO NEW.<col_nombre>, NEW.<col_precio>
  FROM services s
  WHERE s.id = NEW.service_id
    AND s.business_id = NEW.business_id;
  -- service_id NULL, business_id NULL o servicio de otro tenant ⇒ snapshot NULL: el historial cae al
  -- fallback ("Sin servicio"), exactamente como se comporta hoy. NO se hace RAISE.
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."appointments_service_snapshot"() OWNER TO "postgres";

DROP TRIGGER IF EXISTS "appointments_service_snapshot_trg" ON "public"."appointments";
CREATE TRIGGER "appointments_service_snapshot_trg"
  BEFORE INSERT ON "public"."appointments"
  FOR EACH ROW EXECUTE FUNCTION "public"."appointments_service_snapshot"();
```

### 2. Gate `BEFORE DELETE` con error mapeable

```sql
CREATE OR REPLACE FUNCTION "public"."services_block_delete_with_future"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
BEGIN
  IF EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.service_id = OLD.id
      AND (OLD.business_id IS NULL OR a.business_id = OLD.business_id)  -- defensa en profundidad
      AND a.date >= v_today
      AND a.status IS DISTINCT FROM 'cancelled'   -- NULL-safe (status es nullable)
  ) THEN
    RAISE EXCEPTION 'service_has_future_appointments' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM abonos ab
    WHERE ab.service_id = OLD.id
      AND (OLD.business_id IS NULL OR ab.business_id = OLD.business_id)
      AND ab.status = 'active'
  ) THEN
    RAISE EXCEPTION 'service_has_active_abono' USING ERRCODE = 'P0001';
  END IF;

  RETURN OLD;   -- BEFORE DELETE: devolver OLD deja seguir el borrado (NULL lo cancelaría en silencio)
END;
$$;
```

> `RETURN OLD` es obligatorio: en un `BEFORE DELETE FOR EACH ROW`, devolver `NULL` **cancela el borrado sin error** — el peor de los mundos (la UI diría "eliminado" y no se borró nada).

### 3. Mapeo del error en el cliente (molde `lib/booking-core.ts:346-360`)

```ts
const { error } = await supabase.from('services').delete()
  .eq('id', id).eq('business_id', business.id)
if (error) {
  // PostgREST devuelve { code:'P0001', message:'service_has_future_appointments', details, hint }.
  if (error.code === 'P0001' && error.message?.includes('service_has_future_appointments')) { … }
  else if (error.code === 'P0001' && error.message?.includes('service_has_active_abono')) { … }
  else if (error.code === '23503') { /* fallback defensivo: otro FK todavía en NO ACTION */ }
  else toast.error('No se pudo eliminar el servicio')
  return
}
```

### 4. Helper puro del fallback (D-05)

```ts
// lib/appointment-service.ts — funciones PURAS (sin React ni Supabase), molde lib/booking-window.ts
export function apptServiceName(a: { <col_nombre>?: string | null; services?: { name?: string } | null }): string {
  return a.<col_nombre> ?? a.services?.name ?? '—'
}
export function apptServicePrice(a: { <col_precio>?: number | null; services?: { price?: number } | null }): number {
  return Number(a.<col_precio> ?? a.services?.price ?? 0)
}
```

> Usar `??` y no `||`: con `||` un precio **0 legítimo** caería al join (y, si el servicio ya no existe, a `0` igual — pero el `??` mantiene la semántica "el snapshot manda" incluso para 0). El código actual usa `|| 0`, que colapsa `0` y `null`; el helper nuevo debe distinguirlos.

### 5. Tabs con contador (molde `abonos-client.tsx:53-57 / 146-156 / 264-277`)

```tsx
type ServiceTab = 'activos' | 'desactivados'
const SERVICE_TABS: { key: ServiceTab; label: string }[] = [
  { key: 'activos', label: 'Activos' },
  { key: 'desactivados', label: 'Desactivados' },
]
// filtro y contador llaman al MISMO predicado (si no, el tab miente sobre una lista vacía)
const visibleServices = useMemo(() => services.filter(s => !!s.active === (tab === 'activos')), [services, tab])
const tabCounts = useMemo(() => {
  const activos = services.filter(s => !!s.active).length
  return { activos, desactivados: services.length - activos }
}, [services])
```

---

## Runtime State Inventory

*(Fase con migración: se completa aunque no sea un rename.)*

| Categoría | Encontrado | Acción requerida |
|-----------|-----------|------------------|
| **Datos almacenados** | `appointments` de prod (todas las filas históricas, sin snapshot) y `abonos` archivados. | **Migración de datos**: backfill idempotente dentro de la 065. Es lo que hace visible el historial viejo (HIST-03). |
| **Config de servicio vivo** | Ninguna. El cambio no toca MercadoPago, Google Calendar, Resend, n8n ni el agente de WhatsApp. Verificado: los read-paths modificados son todos del panel. | Ninguna. |
| **Estado registrado en el SO** | Ninguno. No hay cron nuevo (Vercel Hobby: el cron diario existente no cambia). | Ninguna. |
| **Secretos / env vars** | Ninguno nuevo. | Ninguna. |
| **Artefactos de build / esquema** | `supabase/schema.sql` queda desactualizado apenas se aplica la 065; PostgREST cachea el esquema. | `NOTIFY pgrst, 'reload schema';` al final de la migración **y** en prod tras el apply manual; regenerar `schema.sql` **a mano** (sin `db dump`). |
| **Prod (operativo)** | La 065 **no** la aplica el flujo GSD. Última en prod = **064**. | Aplicar a mano coordinado con el deploy, en orden numérico, después de validar con `npx supabase db reset` local. |

---

## Verificación sin regresión del write-path

**Nyquist está desactivado** en este proyecto (`.planning/config.json → workflow.nyquist_validation: false`), así que no corresponde la sección formal de Validation Architecture. Igual, esto es lo que existe y lo que conviene sumar.

### Infra existente

- **Runner:** Vitest (`vitest.config.ts`, `environment: 'node'`, `setupFiles: ./vitest.setup.ts` que carga `.env.local`). Comandos: `npm run test` (`vitest run`) y `npm run test:watch`. CI corre además `tsc --noEmit`.
- **Tests de integración contra Supabase real (local):** `test/booking-core.test.ts`, `test/concurrency.test.ts`, `test/canchas-booking.test.ts`, `test/abono-generation.test.ts`, `test/isolation.test.ts`, y **41 archivos** más en `test/`. Se skipean solos con `describe.skipIf(!hasSupabaseCreds)` (`test/env.ts`).
- **Fixtures:** `test/helpers/booking-fixtures.ts` — `seedOneTenant`, `seedService`, `seedProfessional`, `seedTimeBlock`, `seedSimultaneousService`, `seedSpace`, `seedAgendaSpace`, `teardownOneTenant`. Es el molde exacto para sembrar dos tenants y probar el trigger.
- **Reset de la DB local:** `npx supabase db reset` (PG17) replaya el baseline + `040..065` en orden. Es la **única** validación automatizada de la migración.

### Qué probar (propuesta para el planner)

| Qué | Tipo | Molde |
|-----|------|-------|
| El snapshot se escribe en los 4 caminos (booking público, alta manual, abono forward, cancha) | integración | `test/booking-core.test.ts` + `test/manual-booking.test.ts` + `test/abono-generation.test.ts` + `test/canchas-booking.test.ts` |
| El snapshot es inmutable ante un cambio de precio del servicio (D-03) | integración | `booking-core.test.ts` (insert → update service → re-select) |
| Un `service_id` de OTRO tenant no filtra nombre/precio al snapshot | integración | `booking-core.test.ts` test A (anti-tampering, ya existe con dos tenants) |
| `DELETE` de un servicio con turno futuro → error `P0001` con el message esperado | integración | nuevo, `seedOneTenant` + insert directo |
| `DELETE` con solo turnos pasados/cancelados → OK, y los turnos sobreviven con `service_id IS NULL` + snapshot intacto (HIST-01 + HIST-03) | integración | ídem |
| `DELETE` con abono `active` → bloqueado; con abono `cancelled` → permitido y el nombre sobrevive (D-09) | integración | `test/abono-cancel.test.ts` para el seed de abonos |
| `apptServiceName` / `apptServicePrice` (fallback, precio 0, ambos null) | unitario puro | `lib/booking-window.test.ts` / `lib/crm-reports.test.ts` |
| Cero regresión del motor | integración | `test/concurrency.test.ts` + `booking-public-regression.test.ts` ya existentes: **deben seguir verdes sin modificarse** — ese es el criterio de "el write-path no se tocó". |

---

## Environment Availability

| Dependencia | Requerida por | Disponible | Versión | Fallback |
|-------------|---------------|-----------|---------|----------|
| Supabase CLI local (PG17) | validar la 065 con `db reset` | ✓ (baseline configurado, MEMORY §infra-testing-roadmap) | — | ninguno: es la única validación |
| `.env.local` con las 3 creds de Supabase | tests de integración | ✓ (los tests ya corren en el workstream) | — | los tests se auto-skipean (`hasSupabaseCreds`) |
| Acceso manual al Supabase de **prod** | aplicar la 065 | ✗ desde el flujo GSD (por diseño) | — | **ninguno** — es una acción del operador, fuera del alcance del ejecutor |
| Node + npm | build/tests | ✓ | — | — |

**Faltantes sin fallback:** el apply manual en prod. El plan debe cerrarse con un `checkpoint:human-verify` / nota operativa, nunca intentando aplicarla.

---

## Security Domain

`security_enforcement` no está desactivado ⇒ sección incluida.

### Categorías ASVS aplicables

| Categoría ASVS | Aplica | Control estándar en esta fase |
|----------------|--------|-------------------------------|
| V2 Authentication | no | No se toca auth. El borrado ya exige sesión (RLS). |
| V3 Session Management | no | Sin cambios. |
| **V4 Access Control** | **sí** | RLS `"business member access"` sobre `services`/`appointments`/`abonos` + `.eq('business_id', …)` explícito en el cliente + filtro por `business_id` dentro de los triggers `SECURITY DEFINER`. |
| **V5 Input Validation** | **sí** | El snapshot **no** lo aporta el cliente: lo sobrescribe el trigger desde `services` (anti-tampering). El gate de borrado es server-side (DB), no client-side. |
| V6 Cryptography | no | Sin criptografía nueva. |
| V7 Error handling / Logging | parcial | Los mensajes del `RAISE` son códigos de dominio (`service_has_future_appointments`), no filtran datos de otro tenant. |

### Amenazas conocidas para este cambio

| Patrón | STRIDE | Mitigación estándar |
|--------|--------|---------------------|
| Un dueño borra un servicio de **otro** negocio | Elevation of Privilege | RLS ALL sobre `services` + `.eq('business_id', …)`; el trigger no relaja nada (solo bloquea). |
| El trigger `SECURITY DEFINER` lee `services`/`appointments` de otro tenant | Information Disclosure | Filtro `business_id` explícito adentro (regla dura de la skill; molde 062:167-177). |
| Cliente inyecta `service_name`/`service_price` falsos al crear un turno (facturación inflada) | Tampering | El `BEFORE INSERT` **sobrescribe siempre**, nunca respeta lo entrante. |
| Dueño edita el snapshot por PostgREST después del alta (`update({...})`) | Tampering (auto-tenant) | **Sin mitigar hoy.** Riesgo bajo (datos propios), pero registrar como amenaza para `secure-phase`; mitigación opcional: trigger `BEFORE UPDATE` que restaure `OLD` en las columnas de snapshot (sin bloquear `service_id`). |
| TOCTOU: reserva creada entre el pre-check y el `DELETE` | Tampering / integridad | Trigger `BEFORE DELETE` (D-10) — es exactamente su razón de ser. |
| Borrado cancelado en silencio por `RETURN NULL` en el trigger | Repudiation / integridad | `RETURN OLD` obligatorio; test que verifica que el servicio efectivamente desaparece. |
| El `SET NULL` deja turnos futuros huérfanos si el gate falla | Integridad | El `RAISE` corre **antes** de la acción referencial (docs PG) ⇒ transacción abortada, sin estado intermedio. |
| Regresión del motor anti-doble-booking por el trigger nuevo en el write-path | DoS / integridad | `test/concurrency.test.ts` + `booking-public-regression.test.ts` verdes **sin modificarse**; `book_slot_atomic` NO se toca. |

---

## Assumptions Log

| # | Claim | Sección | Riesgo si es falso |
|---|-------|---------|--------------------|
| A1 | PostgREST no evalúa `COALESCE` ni funciones escalares en `select()`, por eso el fallback va en TS. | Read-paths | Bajo. Si existiera, el patrón TS sigue siendo válido y es el único usado en el repo. |
| A2 | El `DELETE` de PostgREST devuelve el error de un trigger `BEFORE DELETE` con la misma forma que el de un RPC. | Triggers (b) | Medio: si el shape difiere, el mapeo cliente cambia (mismo error, otro campo). **Verificar en el primer test de integración de la 065.** |
| A3 | Ninguna ruta de la app inserta en `appointments` fuera del RPC (verificado por grep: solo tests lo hacen). | Triggers (a) | Bajo. Aunque hubiera una, el trigger la cubre igual (esa es la ventaja de D-02). |
| A4 | `.neq('status','cancelled')` de PostgREST descarta también las filas con `status IS NULL`. | Pitfall 2 | Medio: si no las descartara, el pre-check contaría de más y el modal bloquearía sin motivo. Se resuelve usando una lista blanca de estados en ambos lados. |
| A5 | El backfill sobre `appointments` de prod corre en tiempo razonable (tabla no masiva). | Migración | Bajo: es un SaaS pre-primer-cliente-a-escala. Si fuera grande, batchear. |

---

## Open Questions

1. **Dashboard queda fuera de D-06, pero `monthRevenue` es histórico.**
   - Lo que sabemos: `app/(dashboard)/dashboard/page.tsx:61` trae `select('*, services(price)')` de **todo el mes hasta hoy** y :83-85 lo suma en `monthRevenue`. Si el dueño borra un servicio a mitad de mes, ese número **baja** respecto de Finanzas para el mismo período.
   - Lo que no está claro: si D-06 ("Dashboard muestra turnos vivos") contemplaba este caso o lo dio por vivo.
   - Recomendación: migrar **solo** `monthRevenue` (3 líneas, mismo helper) o registrarlo explícitamente como inconsistencia aceptada. **Decisión del planner / del dueño; no re-litigar D-06 sin él.**

2. **¿Un solo código de error o dos?**
   - D-13 pide que el modal diga "y un abono activo" cuando aplique. Dos `ERRCODE`/messages distintos (`service_has_future_appointments` / `service_has_active_abono`) permiten al backstop reconstruir el mensaje correcto; uno solo obliga a re-consultar. Recomendación: **dos messages, mismo `P0001`**.

3. **¿`deleteService` debe lanzar para que el modal reaccione al backstop?**
   - Hoy devuelve tras el toast y `ConfirmDialog` cierra igual. Ver §Diálogo de dos estados. Es UX de un caso de carrera raro; decidir en el plan.

4. **Nombres de columnas.**
   - Discreción de Claude. Candidatos coherentes con el snake_case del repo y sin colisionar con el embed `services`: `service_name` / `service_price` en `appointments`, `service_name` en `abonos`. Alternativa más explícita: `service_name_snapshot` / `service_price_snapshot`. Recomendación: los cortos — el comentario de `lib/types.ts` documenta la semántica, y `services(...)` (embed) no colisiona con `service_*` (columnas).

---

## Sources

### Primary (HIGH confidence)

- `supabase/schema.sql` — definición de `appointments` (487-515), `services` (956-971), `abonos` (427-450), los 4 FKs a `services` (1416, 1446, 1486, 1626), constraints 1110/1279, triggers 1383-1391, policies RLS 1724-1745 / 1820-1892 / 2032.
- `supabase/migrations/042_spaces_and_coupled_exclusion.sql:290-359` — molde literal de función + trigger.
- `supabase/migrations/055_abono_window_bounds.sql`, `056`, `061`, `062` — molde de cabecera, idempotencia, `DO $$ pg_constraint`, orden backfill→constraint, `NOTIFY pgrst`.
- `lib/booking-core.ts:230-386` — write-path intacto y molde de mapeo de errores de Postgres a dominio.
- `app/(dashboard)/settings/settings-client.tsx:500-547, 690-720, 865-899, 1425-1535, 2304-2327` — CRUD de servicios, gate `isCanchas`, `ConfirmDialog`.
- `components/dashboard/canchas-manager.tsx:155-201, 340-356` — molde del pre-check + descripción de dos estados.
- `app/(dashboard)/abonos/abonos-client.tsx:30-57, 140-160, 264-295` — molde de tabs con contador.
- `components/crm/confirm-dialog.tsx` — contrato de props, gating, anti-doble-submit.
- `app/(dashboard)/finances/finances-client.tsx`, `app/(dashboard)/clients/clients-client.tsx`, `app/(dashboard)/appointments/appointments-client.tsx`, `app/api/export/finances/route.ts` — inventario de read-paths.
- `test/`, `test/helpers/booking-fixtures.ts`, `vitest.config.ts` — infra de verificación.
- `git log -S "incluidos pasados y cancelados"` → commit `8e34b00` — el copy ya está shipeado.
- `.claude/skills/supabase-multitenant-rls/SKILL.md` — reglas duras de RLS/tenant.

### Secondary (MEDIUM confidence)

- [docs.postgrest.org/en/stable/references/errors.html](https://docs.postgrest.org/en/stable/references/errors.html) — `P0001` → HTTP 400 y body `{message, details, hint, code}`.
- [postgresql.org/docs/current/sql-createtrigger.html](https://www.postgresql.org/docs/current/sql-createtrigger.html) — "BEFORE… before constraints are checked and the … DELETE is attempted"; acciones de FK "treated as part of the SQL command that caused them (never deferred)".
- [postgresql.org/docs/current/trigger-definition.html](https://www.postgresql.org/docs/current/trigger-definition.html) — las acciones referenciales se ejecutan como UPDATE/DELETE ordinarios y disparan los triggers de la tabla referenciante.

### Tertiary (LOW confidence)

- Limitaciones de `select()` de PostgREST respecto de expresiones escalares — conocimiento de entrenamiento, no verificado esta sesión (ver A1).

---

## Metadata

**Confidence breakdown:**

- Esquema, FKs, moldes de migración y superficie de código: **HIGH** — todo leído del repo en esta sesión, con archivo y línea.
- Semántica de triggers bajo Supabase/RLS y forma del error PostgREST: **MEDIUM** — citada de docs oficiales; el shape exacto del error para un `DELETE` (vs. RPC) se confirma recién con el primer test de integración (A2).
- Pitfalls: **HIGH** para los derivados de código leído (1, 2, 6, 7, 8, 9); **MEDIUM** para los 3 y 5 (razonamiento sobre comportamiento no ejecutado).
- Stack: **HIGH** — no se agrega nada.

**Research date:** 2026-07-31
**Valid until:** 2026-08-30 (estable: Postgres + un repo con moldes fijos; re-verificar solo si se aplican migraciones nuevas antes de ejecutar esta fase).
