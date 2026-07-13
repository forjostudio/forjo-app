# Phase 3: Booking público de alquiler - Research

**Researched:** 2026-07-01
**Domain:** Booking público anónimo (Next.js 16 RSC + route handlers service-role) sobre el motor de reservas v0.12 (Supabase Postgres, `book_slot_atomic` + exclusión por espacio) — vertical canchas
**Confidence:** HIGH (todo verificado contra el código real del repo; cero dependencias nuevas)

## Summary

La Phase 3 NO construye un motor: reusa el existente. La disponibilidad (`/api/booking/availability`)
ya acopla la exclusión por espacio (`siblingBusy`) con service-role por slug, y `book_slot_atomic`
(migr. 042) ya da la atomicidad cross-bucket por espacio físico. El trabajo real es tres cosas:
(1) **exponer la cancha al anon** con una vista acotada `public_canchas` (migr. 044); (2) **un client
component nuevo** que reusa los patrones de llamada del `BookingClient`; (3) **adaptar
`/api/booking/create`** para que en el caso canchas derive el `service` desde `professional.service_id`
server-side en vez de confiar en un `serviceId` del cliente.

**El hallazgo que rompe un supuesto:** hoy el create **exige `serviceId` del cliente** (`route.ts:29`
y `route.ts:40` lo tienen como campo requerido) y lo pasa tal cual a `createAppointmentCore`. D-03 dice
que el cliente de canchas manda `professionalId` y NUNCA `service_id`. Por lo tanto el create DEBE
resolver el `service_id` a partir del `professional_id` de la cancha, server-side, antes de invocar el
core. Esta es la única pieza de lógica server nueva de la fase, y es donde vive el riesgo de seguridad
(anti-tampering). El resto es exposición de datos + UI.

**Primary recommendation:** Migración 044 aditiva (`public_canchas` = join `professionals`×`services`
filtrado por `service_id IS NOT NULL AND active`, GRANT anon, sin `service_id` expuesto) + rama canchas
en el create que deriva el service del professional (validado por `business_id`) + `canchas-booking-client.tsx`
que reusa `availability`/`create`/`payment` tal cual. NO tocar `book_slot_atomic`, NO tocar `availability`,
NO cambiar la forma de respuesta `{ ok, busy, full }`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Vista pública dedicada **`public_canchas`** (migración **044** aditiva). Joinea
  `professionals` (donde `service_id IS NOT NULL`) con su `service` y expone SOLO:
  `{ business_id, id (= professional_id, lo reservable), name, price, duration_minutes }`.
  **NO expone `service_id` ni config interna.** Se descartó extender `public_professionals` con `service_id`.
- **D-02:** **Flujo de canchas dedicado** — client component propio (ej. `canchas-booking-client.tsx`).
  El cliente elige una **cancha** (nombre + precio + duración fija visible), después un **horario
  disponible**; SIN picker de duración ni de profesional. Reusa `/api/booking/availability` y
  `/api/booking/create`. Se descartó adaptar el `BookingClient` genérico.
- **D-03:** El cliente manda el **`professional_id`** (la cancha/agenda), **NUNCA `service_id` ni
  precio**. El create resuelve el `service` vía `professional.service_id` server-side (service-role),
  toma precio + duración de ahí y re-valida por `business_id`.
- **D-04:** **Reusar la seña business-level fija de hoy** (`require_deposit` + `deposit_amount`). La
  cancha muestra su precio; la reserva registra el precio de la cancha (ALQUILER-04). Cero cambio al
  modelo de pago.
- **D-05:** El flujo de canchas entra en **AMBOS caminos** de `/[slug]` (legacy `BookingClient` directo
  y sección booking del `LandingRenderer`), gateado por `resolveVertical(business).key === 'canchas'`.
- **D-06:** **Dos turnos consecutivos = inherente**, sin lógica ni UI nueva. Opcional: copy que lo sugiera.

### Claude's Discretion
- Nombre/ubicación exactos del client component; detalles visuales siguiendo el `BookingClient` y el design system.
- Cómo el `create` distingue el caso canchas (por vertical del negocio o por `professional.service_id` presente).
- Si `public_canchas` filtra por `active` (la vista debería, como `public_services`).
- Copy de la sugerencia de 2 turnos consecutivos.
- Forma exacta del payload que el client manda al create para canchas (dentro de D-03: sin service_id/precio).

### Deferred Ideas (OUT OF SCOPE)
- Seña = precio completo de la cancha / seña por cancha (cambiaría el modelo de pago).
- Pricing por franja horaria peak/off-peak (PRICING-FRANJA-01, v2).
- Selección de duración custom por el cliente (descartada; más tiempo = 2 turnos).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Descripción | Research Support |
|----|-------------|------------------|
| ALQUILER-01 | Cliente elige cancha + horario; NO elige duración (la fija de la cancha) | `public_canchas` expone `duration_minutes` de la cancha (P3); el client fija la duración del slot desde ahí (no hay picker) (Q5); el create la deriva del service, no del cliente (Q1) |
| ALQUILER-02 | Reservar respeta la exclusión por espacio (comparte espacio ocupado ⇒ no reservable) | `availability` YA acopla `siblingBusy` (Q&P read-path) y `book_slot_atomic` da la garantía atómica cross-bucket (Q2). Reuso directo, cero código nuevo del motor |
| ALQUILER-03 | Más tiempo ⇒ dos turnos consecutivos (no duración custom) | Inherente: el cliente reserva un slot y puede reservar el siguiente (D-06). Copy opcional (Q5) |
| ALQUILER-04 | El precio mostrado/asociado a la reserva es el de la cancha | La cancha lleva su `price` propio (cada cancha = 1 fila en `services`, migr. 043). El appointment referencia `service_id` de la cancha ⇒ `payment/create` y reportes leen ese precio vía `services(name, price)` (Q4) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Exponer cancha (nombre/precio/duración) al anon | Database (vista `public_canchas`) | Frontend Server (RSC `page.tsx` la lee con anon) | Aislamiento por vista acotada — mismo patrón que `public_services`/`public_professionals` |
| Elegir cancha + horario | Browser (`canchas-booking-client.tsx`) | — | UI de pasos, estado de selección; sin lógica de negocio sensible |
| Cálculo de disponibilidad (con exclusión por espacio) | API (`/api/booking/availability`, service-role) | — | El anon NO lee `appointments`/`agenda_spaces` (RLS); el server computa `{busy,full}` |
| Anti-tampering + derivación del service de la cancha | API (`/api/booking/create`, service-role) | Database (`book_slot_atomic` re-impone `p_business_id`) | Nunca confiar en IDs del cliente; el service se deriva del professional server-side |
| Atomicidad del cupo + exclusión por espacio | Database (`book_slot_atomic` RPC) | — | Advisory lock + EXISTS cross-bucket dentro de UNA transacción; autoridad única |
| Camino de seña/pago | API (`/api/payment/create`) + MercadoPago | Database (webhook confirma) | Reuso tal cual; el monto es `deposit_amount` business-level (D-04) |
| Gateo legacy vs LandingRenderer + vertical | Frontend Server (`page.tsx`, `landing-renderer.tsx`) | — | `resolveVertical(business).key === 'canchas'` decide qué client renderizar |

## Standard Stack

Sin dependencias nuevas. Todo el trabajo usa el stack ya presente. [VERIFIED: package.json + código del repo]

### Core (reuso, no instalación)
| Módulo | Rol en la fase | Archivo |
|--------|----------------|---------|
| `createAdminClient` (service-role) | Resolver tenant por slug + queries privilegiadas en los routes | `lib/supabase/admin.ts` (usado en create/availability/payment) |
| `createPublicServerClient` (anon) | Leer `public_canchas` desde el RSC `page.tsx` | `lib/supabase/public.ts:6` |
| `createAppointmentCore` | Cadena anti-tampering + `book_slot_atomic` + traducción de constraint | `lib/booking-core.ts:63` |
| `book_slot_atomic` (RPC) | Atomicidad cupo + exclusión por espacio | `supabase/migrations/042_*.sql:126` |
| `resolveVertical` | Gateo del flujo canchas + terminología | `lib/verticals.ts:163` |
| `canchasFromData` | Reconstrucción de la tupla cancha (referencia, NO se usa en el read público — la vista hace el join) | `lib/canchas.ts:127` |

### Supporting (UI, ya en repo)
| Módulo | Uso |
|--------|-----|
| `@/components/ui/{button,input,label,textarea}` | Formulario + CTA (UI-SPEC: reusar as-is) |
| `date-fns` + `es` locale | Calendario mensual (patrón `BookingClient`) |
| `sonner` (`toast`) | Errores (`slot_taken`, `recaptcha_failed`, genérico) |
| `lucide-react` (`Clock`, `ChevronLeft/Right`) | Iconografía del picker |
| reCAPTCHA v3 (script inyectado) | Solo camino sin seña (patrón `BookingClient:106-115`) |

**Installation:** ninguna. `npm install` no se corre en esta fase.

## Package Legitimacy Audit

> No aplica: la fase NO instala paquetes externos. Todo el stack ya está en `package.json` y verificado
> en producción. Migración SQL 044 aditiva (sin dependencias). **Packages removed:** none. **Packages
> flagged [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
ANON (browser)  ──GET /[slug]──▶  RSC page.tsx (createPublicServerClient, anon)
                                     │  lee public_businesses, public_services, public_professionals,
                                     │  time_blocks, exceptions, locations
                                     │  + [NUEVO] public_canchas  ── SI vertical==='canchas'
                                     │
                                     ├── resolveVertical(business).key === 'canchas' ?
                                     │        SÍ → <CanchasBookingClient canchas=… />   (D-02/D-05)
                                     │        NO → <BookingClient …/>  (path legacy intacto)
                                     │   (ambos dentro de landing===null legacy o del LandingRenderer)
                                     ▼
   [Paso 1] elegir cancha (name, price, duration_minutes de public_canchas)
   [Paso 2] elegir día → GET /api/booking/availability?slug&date&professionalId=<cancha.id>
                              │ (service-role por slug)
                              │  appointments del bucket + siblingBusy (espacio compartido)
                              ▼  responde { ok, busy, full }   ← forma NO cambia
            client arma slots con duration_minutes de la CANCHA (sin picker)
   [Paso 3] datos + CTA → POST /api/booking/create
                              │  body: { slug, professionalId: cancha.id, date, time, cliente, recaptcha }
                              │        (SIN serviceId, SIN precio — D-03)
                              ▼
              [NUEVO] rama canchas: SELECT professionals.service_id WHERE id=professionalId
                                    AND business_id=business.id  →  serviceId derivado
                              ▼
              createAppointmentCore({ serviceId derivado, professionalId, … })
                              │  anti-tampering (service/professional por business_id)
                              │  re-check solape + espacio (UX)  →  book_slot_atomic (autoridad)
                              ▼
              require_deposit ? POST /api/payment/create (monto = deposit_amount)  → MercadoPago
                              : notify + router.push(/[slug]/turno/{cancelToken})
```

### Pattern 1: Vista pública acotada (`public_*`)
**What:** Una VIEW que expone SOLO columnas no sensibles de una tabla base RLS, con GRANT a `anon`.
**When to use:** siempre que el anon necesite leer datos de una tabla base que no puede tocar directo.
**Example (patrón verificado — `public_services`, baseline:577):**
```sql
-- Source: supabase/migrations/00000000000000_baseline.sql:577-592
CREATE OR REPLACE VIEW "public"."public_services" AS
 SELECT "id", "business_id", "name", "duration_minutes", "price",
        "description", "active", "location_id", "location_ids", "created_at"
   FROM "public"."services"
  WHERE ("active" = true);
ALTER VIEW "public"."public_services" OWNER TO "postgres";
-- GRANT (baseline:3034):
GRANT ALL ON TABLE "public"."public_services" TO "anon";
GRANT ALL ON TABLE "public"."public_services" TO "authenticated";
GRANT ALL ON TABLE "public"."public_services" TO "service_role";
```

**DDL recomendado para `public_canchas` (migración 044, aditiva):**
```sql
-- Source: derivado del patrón public_services/public_professionals + D-01
-- 044 — public_canchas: vista acotada para el booking público del vertical canchas (ALQUILER-01/04).
-- Joinea professional (la agenda-cancha, migr. 043) con su service (precio+duración). Expone SOLO
-- lo reservable+mostrable: id (= professional_id, lo que el cliente manda al create), name, price,
-- duration_minutes. NUNCA service_id (puntero interno — D-01) ni columnas sensibles. Solo canchas
-- ACTIVAS (soft-delete = active=false en professional Y service, ver lib/canchas.ts:170-174).
CREATE OR REPLACE VIEW "public"."public_canchas" AS
 SELECT p."id",                    -- = professional_id: lo reservable (el client lo manda como professionalId)
        p."business_id",
        p."name",
        s."price",
        s."duration_minutes"
   FROM "public"."professionals" p
   JOIN "public"."services" s ON s."id" = p."service_id"
  WHERE p."service_id" IS NOT NULL   -- solo filas-cancha (índice parcial 043)
    AND p."active" = true            -- cancha activa
    AND s."active" = true;           -- service activo (soft-delete desactiva ambos)
ALTER VIEW "public"."public_canchas" OWNER TO "postgres";
GRANT SELECT ON TABLE "public"."public_canchas" TO "anon";
GRANT SELECT ON TABLE "public"."public_canchas" TO "authenticated";
GRANT SELECT ON TABLE "public"."public_canchas" TO "service_role";
```

Notas sobre el DDL (decisiones para el planner, NO re-litigan D-01):
- **`security_invoker` NO aplica / NO se necesita.** `public_services` y `public_professionals` son
  vistas SIN `security_invoker` (owner = postgres, corren como definer y por eso el anon las lee pese a
  la RLS de la tabla base). `public_canchas` debe seguir EXACTAMENTE ese molde (sin el flag), NO el de
  `crm_timeline` (que sí usa `security_invoker=true` porque quiere heredar la RLS admin-only). Poner
  `security_invoker=true` acá **rompería** la lectura anon (heredaría la RLS de `professionals`/`services`
  que el anon no cumple). [VERIFIED: baseline:546-592 vs baseline:293] **Riesgo si se copia mal el patrón.**
- Uso de `GRANT SELECT` (no `GRANT ALL`): el anon solo lee. `public_services` usa `GRANT ALL` por
  legado; para una vista nueva `GRANT SELECT` es más ajustado y suficiente. [ASSUMED — verificar que
  PostgREST expone la vista con solo SELECT; si el patrón del repo exige `GRANT ALL`, igualarlo.]
- `WHERE p.active = true AND s.active = true`: la Claude's Discretion de CONTEXT pregunta si filtrar por
  `active`; la respuesta es SÍ (consistente con `public_services WHERE active = true`), y como el
  soft-delete de una cancha desactiva professional Y service (`lib/canchas.ts:170-174`), filtrar por
  ambos es correcto y redundante-seguro.
- **Migración = 044**, aditiva. Aplicar el patrón del repo: validar con `supabase db reset` local (PG17),
  aplicar a mano en prod coordinado con deploy + `NOTIFY pgrst, 'reload schema';`, regenerar
  `supabase/schema.sql`. [CITED: 043_*.sql:24-28 — mismo protocolo]

### Pattern 2: Route público con service-role resuelto por slug
**What:** El route handler crea `createAdminClient()`, resuelve el negocio por `slug`, y filtra TODO
por `business.id`. El anon nunca toca la DB directo.
**Example:** `availability/route.ts:27-34`, `create/route.ts:44-53`.

### Pattern 3: Anti-tampering — re-validar toda entidad por `business_id`
**What:** Nunca confiar en IDs/precio del cliente; re-leer la entidad filtrando por `business_id`.
**Example (el core ya lo hace para service y professional):**
```ts
// Source: lib/booking-core.ts:83-104
const { data: service } = await supabase.from('services')
  .select('id, name, active, duration_minutes, location_id')
  .eq('id', serviceId).eq('business_id', business.id).single()
if (!service || service.active === false) return { ok:false, error:'invalid_service', status:400 }
// … idem professional por business_id
```

### Anti-Patterns to Avoid
- **Exponer `service_id` en `public_canchas`** → filtra el puntero interno y permite al cliente inferir
  el service para tamperearlo. D-01 lo prohíbe.
- **Que el client mande `serviceId` o `price`** para canchas → viola D-03; el server debe derivarlo.
- **Debilitar `book_slot_atomic`** con un count/check JS suelto como autoridad → el re-check JS es SOLO
  UX; la garantía vive en el RPC (advisory lock + EXISTS). [CITED: 042_*.sql:113-116]
- **Cambiar la forma de respuesta de `availability`** (`{ ok, busy, full }`) → congelada (D-06); el
  client de canchas la consume igual que el `BookingClient`.
- **Envolver `<section id="reservar">` en transform/overflow-hidden/position:fixed|sticky** en el
  LandingRenderer → rompe el popover del calendario y los toasts. [CITED: landing-renderer.tsx:177-194]

## Don't Hand-Roll

| Problema | No construir | Usar en su lugar | Por qué |
|----------|--------------|------------------|---------|
| Atomicidad del cupo + espacio | Un check "¿está libre?" en JS antes del insert | `book_slot_atomic` (RPC) | TOCTOU: dos requests concurrentes cruzan la ventana. El RPC serializa con advisory lock. [CITED: 042:113] |
| Exclusión por espacio compartido | Recalcular qué canchas comparten espacio en el client | `availability` (siblingBusy) + RPC | `agenda_spaces` no tiene read anon (D-06); ya está resuelto server-side |
| Disponibilidad | Leer `appointments` desde el client | `GET /api/booking/availability` | El anon no puede leer `appointments` (RLS); el server devuelve `{busy,full}` sin datos de cliente |
| Traducir choque de constraint a error de dominio | Parsear el error de Postgres a mano en el client | `createAppointmentCore` (23505/23P01/P0001 → slot_taken/slot_full) | Ya centralizado en `booking-core.ts:263-281` |
| Camino de pago / preferencia MP | Rehacer la preferencia | `/api/payment/create` + `createDepositPreference` | Reuso tal cual (D-04) |
| Reconstrucción cancha↔service | Emparejar por nombre | `public_canchas` (join por `service_id`) | Puntero estable; renombrar no rompe el match [CITED: canchas.ts:19-20] |

**Key insight:** el motor de v0.12 es agnóstico al rubro. Una cancha es simplemente un `professional`
(agenda) con `service_id` no-nulo mapeado a espacios en `agenda_spaces`. Todo lo que canchas necesita ya
está soportado; la fase es exposición + UI + una derivación server-side, no ingeniería de concurrencia.

## Hallazgos por pregunta

### Q1 — `/api/booking/create`: cómo valida/crea hoy y la adaptación canchas (D-03)

**Shape actual del handler** (`app/api/booking/create/route.ts`):
- Lee del body: `slug`, **`serviceId`** (requerido, `:29`), `professionalId` (opcional, `:30`),
  `locationId`, `date`, `time`, datos del cliente, `recaptchaToken`. [VERIFIED: route.ts:28-38]
- **Guard requerido (`:40`):** `if (!slug || !serviceId || !date || !time || !clientName) → missing_fields`.
  **Este `serviceId` requerido es exactamente lo que hay que quitar/derivar para canchas.**
- Resuelve el negocio por slug con service-role (`:48-53`), solo columnas no secretas incluyendo
  `require_deposit, deposit_amount, deposit_expiry_hours, buffer_minutes, plan_status`.
- **Gate de plan (SEC-04, `:62-64`):** blocklist `['expired','cancelled','suspended']` → 403 `plan_inactive`.
- **reCAPTCHA fail-closed (`:73-78`):** solo si NO hay seña (`!requireDeposit`); con seña el gate es el pago.
- Inserta un cliente nuevo SIEMPRE (`:82-86`, público no deduplica).
- **Delega a `createAppointmentCore`** (`:91-106`) pasándole `serviceId`, `professionalId`, `locationId`,
  fecha/hora, datos del cliente, `requireDeposit`, `depositExpiryHours`. El core hace el anti-tampering
  y el `book_slot_atomic`.
- Efectos best-effort en `after()`: mails de holds vencidos, Google Calendar (si confirmado), mail de
  seña pendiente (si `require_deposit`). [VERIFIED: route.ts:114-202]
- Devuelve `{ ok, appointmentId, cancelToken, requiresPayment }` (`:204`).

**Dónde el core deriva la duración/precio HOY:** el core lee el `service` por `serviceId + business_id`
(`booking-core.ts:83-88`) y de ahí saca `duration_minutes` para el anti-solape y `name` para el resultado.
**La duración NUNCA viene del cliente** — ya es correcto. El precio NO se toca en el create (vive en
`services.price` y lo lee `payment/create` / reportes vía el `service_id` del appointment).

**Forma exacta de la adaptación canchas (D-03) — recomendación:**

El punto de inserción es en el handler `create/route.ts`, ANTES de llamar a `createAppointmentCore`,
para producir un `serviceId` derivado que el core consume sin cambios. Dos sub-decisiones:

1. **Cómo distingue el caso canchas (Claude's Discretion).** Recomendación: **por presencia de un campo
   de payload dedicado, no por vertical.** El client de canchas manda `professionalId` (la cancha) y NO
   manda `serviceId`. El handler puede tratar "sin `serviceId` pero con `professionalId`" como el caso
   canchas: derivar el service del professional. Esto es más robusto que gatear por `resolveVertical`
   (evita una query extra a `businesses.type/vertical` y funciona aunque el vertical esté mal seteado).
   Contra-argumento: gatear por vertical es más explícito. **El planner debería elegir; ambas son válidas.
   Preferencia del research: derivar cuando `serviceId` está ausente y `professionalId` presente**, y
   dejar el path legacy (con `serviceId`) intacto byte a byte.

2. **La derivación server-side (anti-tampering):**
```ts
// Source: recomendado, derivado de booking-core.ts:93-104 (mismo patrón anti-tampering)
// Caso canchas: el cliente mandó professionalId (la cancha) pero NO serviceId (D-03).
// Derivar el service_id desde professionals.service_id, re-validando por business_id.
let resolvedServiceId = serviceId
if (!resolvedServiceId && professionalId) {
  const { data: cancha } = await supabase
    .from('professionals')
    .select('service_id')
    .eq('id', professionalId)
    .eq('business_id', business.id)   // anti-tampering: la cancha es de ESTE negocio
    .single()
  if (!cancha?.service_id) {
    return Response.json({ ok: false, error: 'invalid_service' }, { status: 400 })
  }
  resolvedServiceId = cancha.service_id as string
}
// El guard de missing_fields debe permitir el caso canchas: exigir (serviceId || professionalId).
```
   Luego el guard de `:40` cambia de `!serviceId` a `!(serviceId || professionalId)` (o equivalente), y
   se pasa `serviceId: resolvedServiceId` al core. El core sigue re-validando ese service por
   `business_id` (`booking-core.ts:83-88`) → **doble anti-tampering** (derivación + re-lectura). El
   `professionalId` de la cancha también viaja al core y ahí se re-valida por `business_id`
   (`booking-core.ts:95-104`) — el bucket queda bien seteado para el lock por espacio del RPC.

**Landmines de confianza en datos del cliente a blindar:**
- **Hoy el `serviceId` viene del cliente** (`route.ts:29`). Para canchas eso NO debe usarse: si el
  cliente mandara un `serviceId` arbitrario junto al `professionalId`, ¿cuál gana? **Recomendación
  dura:** en el caso canchas, **ignorar cualquier `serviceId` del body y SIEMPRE derivarlo del
  professional.** No hacer un merge cliente-provee-service. (Si el planner gatea por vertical, esto es
  natural; si gatea por "serviceId ausente", documentar que un `serviceId` presente + vertical canchas
  se descarta.)
- El `locationId` del cliente ya se re-valida por `business_id` en el core (`:219-229`) con fallback al
  del service. Canchas usa `location: 'Sede'` pero el UI-SPEC no expone multi-sede en el picker → el
  client puede mandar `locationId: null` y el core cae al del service. OK.
- El precio NUNCA llega del cliente ni en el flujo actual ni en el de canchas — se lee de `services`. OK.

### Q2 — `book_slot_atomic`: firma, exclusión por espacio, reuso sin cambios

**Firma (14 params, migr. 042:126-141):**
```
book_slot_atomic(
  p_business_id uuid, p_professional_id uuid, p_service_id uuid, p_location_id uuid,
  p_date date, p_time time, p_duration integer,
  p_client_id uuid, p_client_name text, p_client_phone text, p_client_email text,
  p_notes text, p_status text, p_expires_at timestamptz
) RETURNS TABLE (id uuid, cancel_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
```

**Cómo hereda la exclusión por espacio (042:150-196):**
1. Advisory lock por `slot+bucket` (`hashtextextended(business||bucket||date||time)`) — serializa
   reservas del mismo slot.
2. **Resuelve `v_space_ids` desde `agenda_spaces` por `p_professional_id` REAL** (no el sentinela) en
   orden ascendente. Si la agenda no tiene espacios → `NULL` → salta el bloque (cero overhead).
3. **Advisory lock por CADA space_id** en orden ascendente (anti-deadlock).
4. **EXISTS** anti-solape cross-bucket: ¿hay turno solapado en tiempo en una agenda HERMANA que comparta
   ≥1 espacio del set (excluyendo la propia agenda)? → `RAISE 'slot_taken' P0001`.
5. Count vs capacity del `time_block` → `slot_full` si lleno; asigna seat; INSERT.
6. Backstop declarativo: trigger `appointment_spaces_populate` proyecta turno×espacio; EXCLUDE gist
   `appointment_spaces_no_overlap` aborta la transacción si el lock fallara (defensa en profundidad).
   [VERIFIED: 042:246-359]

**Por qué NO se puede debilitar:** el lock va ANTES del EXISTS (si chequearas y después lockearas, dos
reservas leen "libre" antes de insertar → sobre-reserva). Nunca un count/SELECT suelto sin lock (LOCKED).
[CITED: 042:113-116]

**Confirmación de reuso sin cambios para canchas:** SÍ. El core llama al RPC con
`p_professional_id = proId` (la cancha) y `p_service_id = service.id` (el derivado), `p_duration =
service.duration_minutes` (la fija de la cancha). Como la cancha está mapeada en `agenda_spaces`
(provisionada en Phase 2 vía `provisionCancha`, `canchas.ts:104-110`), el RPC resuelve sus espacios y
aplica la exclusión automáticamente. **Cero cambio a la RPC, cero migración del motor.** El GRANT ya
incluye `service_role` (042:244). [VERIFIED: 042 + booking-core.ts:244-261]

### Q3 — Vista `public_canchas` (D-01): DDL, ver arriba en Pattern 1

Ver **Pattern 1** para el DDL completo, el molde correcto (SIN `security_invoker`, como
`public_services`), el GRANT anon, y el filtro por `active`. Confirmaciones clave:
- **NO expone `service_id`** (D-01): la vista selecciona `p.id, p.business_id, p.name, s.price,
  s.duration_minutes`. El `service_id` se usa SOLO en el JOIN y en el WHERE, nunca en el SELECT.
- **NO expone columnas sensibles:** ni matrícula/contacto del professional, ni `description`/`location_id`
  del service. Solo lo mostrable (nombre, precio, duración).
- `id` = `professional_id` = lo que el cliente manda como `professionalId` al create/availability.
- Consistente con `public_professionals` (baseline:546, `WHERE active = true`) y `public_services`.

**Riesgo/landmine:** copiar el flag `security_invoker=true` de `crm_timeline` por error rompería la
lectura anon. El molde correcto es el de `public_services`/`public_professionals` (sin flag).

### Q4 — Camino de seña/pago (D-04): cómo pasa el precio de la cancha

**`/api/payment/create`** (`app/api/payment/create/route.ts`) recibe `{ appointmentId, businessSlug }`,
resuelve el negocio (columnas no secretas + `deposit_amount, deposit_expiry_hours`, `:16-19`), lee el
appointment con `services(name, price)` (`:28-31`), y arma la preferencia MP con `createDepositPreference`.

**Cómo pasa el precio de la cancha (ALQUILER-04):**
- El **monto de la SEÑA** que se cobra por MercadoPago = `deposit_amount` business-level (D-04), NO el
  precio de la cancha. `createDepositPreference` usa `business.deposit_amount`. Esto es correcto y NO
  cambia.
- El **precio de la CANCHA** queda asociado al appointment vía su `service_id` (el derivado de la
  cancha): el appointment referencia el service de la cancha, cuyo `price` es el precio propio (cada
  cancha = 1 fila en `services` con su `price`, migr. 043 + `canchas.ts:62-67`). Cualquier lectura
  posterior (`payment/create` lee `services(name, price)` en `:30`; reportes/finanzas leen igual)
  obtiene el precio de la cancha. **ALQUILER-04 se cumple por construcción** — sin código nuevo en el
  camino de pago. [VERIFIED: payment/create:28-31 + canchas.ts:62-67]

**Redirección de confirmación:** idéntica al `BookingClient`:
- Con seña → `create` (hold + `pending_payment`) → `payment/create` → `window.location.href = url` (MP).
  [VERIFIED: booking-client.tsx:341-355]
- Sin seña → `create` confirma → `notify/booking` (fire-and-forget) →
  `router.push('/{slug}/turno/{cancelToken}')`. [VERIFIED: booking-client.tsx:357-372]

**Confirmación:** la seña sigue siendo `deposit_amount` fijo business-level; la reserva registra el
precio de la cancha vía `service_id`. Cero cambio al modelo de pago (D-04).

### Q5 — Client flow (`BookingClient`): patrones a replicar

El `canchas-booking-client.tsx` debe replicar estos patrones exactos del `BookingClient`:

- **Carga de disponibilidad** (`booking-client.tsx:208-230`): `GET /api/booking/availability?slug&date&professionalId`
  con `cache:'no-store'`; lee `{ busy, full }`; respuesta vieja sin `full` → `[]` defensivo.
  **Para canchas: `professionalId = cancha.id`** (la cancha ES el bucket). [VERIFIED]
- **Cómputo de slots** (`booking-client.tsx:232-266`): itera bloques del día (`time_blocks` + exceptions),
  genera slots cada `duration` minutos, descarta los que solapan con `busy` (con buffer) y los que están
  en `full`. **Para canchas: `duration = cancha.duration_minutes`** (fija, sin picker — ALQUILER-01/D-06).
- **reCAPTCHA** (`booking-client.tsx:106-115` carga script; `:282-295` genera token): solo camino sin
  seña. `siteKey = business.recaptcha_site_key || env`. Replicar tal cual.
- **POST al create** (`booking-client.tsx:302-319`): **para canchas el body NO lleva `serviceId`** —
  lleva `{ slug, professionalId: cancha.id, date, time, locationId: null, clientName, clientPhone,
  clientEmail, notes, recaptchaToken }`. (D-03: sin service_id/precio.)
- **Manejo de errores** (`:321-339`): `slot_taken`/`recaptcha_failed`/genérico/sin-conexión → toasts
  (textos ya definidos en el UI-SPEC, idénticos).
- **Navegación post-reserva** (`:341-372`): igual (pago o confirmación).
- **Calendario mensual + grilla de slots + auto-scroll + prefers-reduced-motion**
  (`:65-73, :147-151, :568-632`): reusar el markup y las clases Tailwind verbatim (UI-SPEC lo ancla).

**Diferencias del flujo canchas (3 pasos vs 4):** sin paso de profesional, sin picker de duración, sin
selector de sede (UI-SPEC §Layout). El resto (barra de progreso, resumen, formulario, CTA) es el mismo.

**Copy de 2 turnos consecutivos (D-06, Claude's Discretion):** una línea `text-xs text-muted-foreground`
bajo la grilla de slots, ej. "¿Necesitás más tiempo? Reservá dos horarios seguidos." Sin lógica nueva
(el UI-SPEC ya lo especifica en Copywriting).

### Q6 — Integración landing (D-05)

Dos puntos de gateo, ambos por `resolveVertical(business).key === 'canchas'`:

1. **`app/[slug]/page.tsx`** — el RSC ya:
   - Lee `public_businesses` con `vertical` incluido (`:46`) y llama `resolveVertical(business)` (`:76`).
   - Tiene la rama `landing === null` (legacy, `:95-109`) que renderiza `<BookingClient>` y la rama
     `landing !== null` (`:113-126`) que renderiza `<LandingRenderer>`.
   - **Adaptación:** agregar la lectura de `public_canchas` (solo si canchas, o siempre — es una query
     barata acotada) y, en AMBAS ramas, elegir `<CanchasBookingClient>` vs `<BookingClient>` según el
     vertical. Para el legacy es directo. Para el renderer, ver punto 2.
   - Lectura recomendada: `supabase.from('public_canchas').select('*').eq('business_id', business.id)`
     (anon, vía `createPublicServerClient`) — agregar al `Promise.all` de `:59-70` o condicional.

2. **`components/landing/landing-renderer.tsx`** — la sección `booking` (`:177-194`) envuelve
   `<BookingClient>` en `<section id="reservar">` (caja negra). **Adaptación:** el renderer necesita
   recibir la data de canchas y el vertical (o el componente ya resuelto) por props, y en el `case
   'booking'` renderizar `<CanchasBookingClient>` cuando el vertical es canchas. **Regla dura
   (LOCKED):** NO agregar transform/overflow-hidden/position:fixed|sticky alrededor de la sección
   (`:177-183`) — rompe el calendario y los toasts. El `CanchasBookingClient` usa los mismos primitivos
   (react-day-picker-style calendar propio, sonner) → misma restricción aplica.
   - **Opción de menor cambio (recomendada):** que `page.tsx` decida el componente de booking y lo pase
     al renderer como un prop `bookingSlot: ReactNode` (o un flag `vertical`), para no acoplar el
     renderer al modelo de canchas. El planner elige; ambas mantienen "sin caminos muertos" (D-05).

**Sin romper otros verticales:** el gateo es aditivo — salud/belleza/general siguen usando
`BookingClient` byte a byte (la rama canchas solo se activa con `key === 'canchas'`).

### Q7 — Seguridad (ALTO): guards a heredar + riesgos nuevos

**Guards del booking público existente que canchas DEBE heredar (todos ya en los routes reusados):**

| Guard | Dónde | Canchas lo hereda porque… |
|-------|-------|---------------------------|
| reCAPTCHA fail-closed (sin seña) | `create/route.ts:73-78` | reusa `/api/booking/create` sin tocar ese bloque |
| Gate de plan (`plan_status` blocklist) | `create/route.ts:62-64` | ídem — corre antes de todo |
| Anti-tampering service/professional por `business_id` | `booking-core.ts:83-104` | el service derivado y el professional se re-validan en el core |
| Anti-tampering location por `business_id` | `booking-core.ts:219-229` | ídem |
| Atomicidad cupo + exclusión espacio | `book_slot_atomic` (042) | el core lo invoca sin cambios |
| Traducción de constraint → slot_taken/slot_full | `booking-core.ts:263-281` | ídem |
| Anon nunca lee `appointments`/`agenda_spaces` | `availability` service-role (D-06) | reusa availability |
| Exposición acotada al anon | `public_canchas` (nueva, sin service_id) | la vista no expone config interna |

**Riesgos NUEVOS del flujo canchas y cómo el patrón existente los cubre:**

1. **Reservar la cancha de OTRO tenant.** El cliente manda `professionalId` (la cancha). Mitigación:
   la derivación server-side (Q1) lee `professionals` con `.eq('business_id', business.id)` → si la
   cancha no es del negocio del slug, `service_id` sale null → `invalid_service` 400. Además el core
   re-valida el professional por `business_id` (`:95-104`). **Doble barrera.** [cubierto]
2. **Sobre-reserva entre canchas que comparten espacio.** Mitigación: `book_slot_atomic` con advisory
   lock por espacio + EXISTS cross-bucket + backstop EXCLUDE (042). `availability` lo refleja en el
   read-path (siblingBusy). **Es exactamente el caso ancla que el motor v0.12 resolvió.** [cubierto]
3. **Tampering del `serviceId` para reservar una cancha barata al precio de otra / duración distinta.**
   Mitigación: el service se DERIVA del professional server-side (Q1); un `serviceId` del cliente se
   ignora en el caso canchas. El precio nunca viene del cliente. [cubierto — depende de implementar Q1 bien]
4. **`public_canchas` filtrando el puntero interno.** Mitigación: la vista NO expone `service_id`
   (D-01). [cubierto por el DDL de Pattern 1]
5. **Reservar una cancha desactivada (soft-deleted).** Mitigación: la vista filtra `active = true`
   (professional Y service). Además, si un cliente reconstruyera un `professionalId` desactivado, la
   derivación por `service_id` seguiría funcionando pero el core lee el service `.eq('active', …)`:
   **ojo** — el core rechaza `service.active === false` (`:89`), así que una cancha soft-deleted (service
   inactive) → `invalid_service`. **cubierto**, pero el planner debe verificar que el soft-delete
   desactiva el SERVICE (sí, `canchas.ts:170-174`).

**El secure-phase gate verificará** (de CONTEXT §Security): (a) atomicidad sin debilitar; (b)
anti-tampering por business_id; (c) exposición solo vía `public_canchas`; (d) `plan_status` + reCAPTCHA;
(e) no sobre-reserva concurrente entre canchas que comparten espacio. Todos cubiertos por reuso + el DDL
+ la derivación server-side. **La única pieza donde un bug de implementación abriría un hueco es la
derivación del service (Q1)** — es el foco de revisión.

## Runtime State Inventory

> Fase mayormente aditiva (vista nueva + componente + rama en un route). Igual se audita el estado runtime.

| Categoría | Items encontrados | Acción requerida |
|-----------|-------------------|------------------|
| Stored data | Ninguno nuevo. Los appointments de canchas usan las mismas tablas (`appointments`, `clients`) con el `service_id` de la cancha. No hay backfill. | Ninguna |
| Live service config | `public_canchas` es una vista nueva en la DB de prod → requiere aplicar la migr. 044 a mano + `NOTIFY pgrst, 'reload schema'` (PostgREST cache). | Aplicar migración coordinada con deploy |
| OS-registered state | Ninguno (sin crons nuevos, sin tasks). | Ninguna |
| Secrets/env vars | Ninguno nuevo. reCAPTCHA site key y secretos MP ya existen por negocio. | Ninguna |
| Build artifacts | Regenerar `supabase/schema.sql` tras aplicar la 044 (patrón del repo). `next build` recompila el nuevo client component. | Regenerar schema.sql |

**Nada encontrado en Stored data / OS-registered / Secrets:** verificado — la fase no renombra nada ni
migra datos existentes; solo agrega una vista de solo-lectura y expone canchas ya provisionadas en Phase 2.

## Common Pitfalls

### Pitfall 1: `security_invoker=true` en `public_canchas`
**Qué sale mal:** copiar el patrón de `crm_timeline` en vez del de `public_services` → la vista corre
con la RLS del invocador (anon) sobre `professionals`/`services` → el anon no puede leer nada → la página
pública de canchas queda vacía.
**Por qué:** dos moldes de vista conviven en el repo (definer para exposición anon, invoker para
heredar RLS). [VERIFIED: baseline:293 vs baseline:546/577]
**Cómo evitar:** copiar el DDL de Pattern 1 (sin `security_invoker`, owner postgres).
**Señal temprana:** `public_canchas` devuelve 0 filas para un negocio que tiene canchas.

### Pitfall 2: Confiar en el `serviceId` del cliente para canchas
**Qué sale mal:** hacer un merge donde el cliente puede proveer `serviceId` → tampering (reservar al
precio/duración de otra cancha).
**Por qué:** el handler HOY acepta `serviceId` del body (`route.ts:29`).
**Cómo evitar:** en el caso canchas, IGNORAR cualquier `serviceId` del body y derivarlo del professional
(Q1). El core re-valida por `business_id` como segunda barrera.
**Señal temprana:** un test de tampering que manda `serviceId` de otra cancha + `professionalId` real
debería seguir reservando la cancha del `professionalId`, nunca la del `serviceId`.

### Pitfall 3: Romper el path legacy al agregar la rama canchas
**Qué sale mal:** cambiar el guard `missing_fields` o la firma del core y regresar el booking de
salud/belleza/general.
**Por qué:** `create/route.ts` y `booking-core.ts` son compartidos por TODOS los verticales + el alta
manual autenticada.
**Cómo evitar:** la rama canchas debe ser aditiva (activarse solo cuando `serviceId` ausente +
`professionalId` presente, o por vertical). El path con `serviceId` queda byte-idéntico. Correr
`booking-core.test.ts` + `booking-public-regression.test.ts` como guard.
**Señal temprana:** cualquier fallo en `test/booking-public-regression.test.ts`.

### Pitfall 4: Envolver el booking en un containing block en el LandingRenderer
**Qué sale mal:** un `transform`/`overflow-hidden`/`position:fixed|sticky` alrededor de
`<section id="reservar">` rompe el popover del calendario y los toasts de sonner.
**Por qué:** esos crean un containing block que rompe `position:fixed`. [CITED: landing-renderer.tsx:177-183]
**Cómo evitar:** el `CanchasBookingClient` va en la MISMA caja negra que `BookingClient`, sin envoltorios nuevos.

### Pitfall 5: Olvidar el `NOTIFY pgrst, 'reload schema'` tras aplicar la 044
**Qué sale mal:** la vista existe en Postgres pero PostgREST (Supabase) no la expone → el RSC recibe
error al leer `public_canchas` en prod.
**Por qué:** PostgREST cachea el schema. [CITED: 043_*.sql:26-28]
**Cómo evitar:** parte del protocolo de deploy de migración del repo.

## Code Examples

### Leer `public_canchas` desde el RSC (anon)
```tsx
// Source: patrón de app/[slug]/page.tsx:64-66 (public_services/public_professionals)
const supabase = createPublicServerClient() // anon
const { data: canchas } = await supabase
  .from('public_canchas')
  .select('*')
  .eq('business_id', business.id)
// canchas: { id, business_id, name, price, duration_minutes }[]
```

### Gateo por vertical en page.tsx
```tsx
// Source: patrón de app/[slug]/page.tsx:76,95-126 + lib/verticals.ts:163
const vertical = resolveVertical(business)
const isCanchas = vertical.key === 'canchas'
// … en la rama legacy y en el renderer, elegir el componente de booking según isCanchas.
```

### POST al create para canchas (client)
```ts
// Source: patrón de booking-client.tsx:302-319, adaptado a D-03 (sin serviceId/precio)
await fetch('/api/booking/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    slug: business.slug,
    professionalId: cancha.id,     // la cancha ES el bucket reservable
    date: dateStr,
    time: selectedTime,
    locationId: null,               // canchas no expone multi-sede en el picker (UI-SPEC)
    clientName, clientPhone, clientEmail, notes,
    recaptchaToken,                 // solo camino sin seña
  }),
})
```

## State of the Art

| Enfoque viejo | Enfoque actual | Cuándo cambió | Impacto |
|---------------|----------------|---------------|---------|
| Booking anon insertaba con anon key | Route handler service-role + RLS-locked base tables | v0.9 (migr. 026-028) | El client no toca la DB; toda validación server-side |
| Insert directo (autocommit) | `book_slot_atomic` RPC (advisory lock + count + insert) | v0.12 (migr. 041) | Anti-TOCTOU; garantía de cupo en DB |
| Solo anti-solape por bucket | Exclusión acoplada por espacio físico (agenda_spaces + EXISTS + EXCLUDE) | v0.12 (migr. 042) | Canchas cruzadas: reservar F11 bloquea A/B/C |
| Cancha↔service por nombre | Puntero `professionals.service_id` (1:1 estable) | v0.13 Phase 2 (migr. 043) | Renombrar no rompe el match; base de `public_canchas` |

**Deprecado/no usar:** cliente Supabase público de browser (eliminado — `lib/supabase/public.ts:3-4`
lo documenta). Todo el booking pasa por route handlers.

## Assumptions Log

| # | Claim | Sección | Riesgo si es incorrecto |
|---|-------|---------|-------------------------|
| A1 | `GRANT SELECT` (no `GRANT ALL`) es suficiente para que PostgREST/anon lea `public_canchas` | Pattern 1 | Bajo — si el repo exige `GRANT ALL` para exponer la vista, igualar el patrón de `public_services` (`GRANT ALL`). Verificar en el reset local + smoke anon |
| A2 | Gatear el caso canchas del create por "serviceId ausente + professionalId presente" es preferible a gatear por vertical | Q1 | Medio — ambos funcionan; si el planner prefiere gatear por `resolveVertical` (query extra a businesses), es igualmente válido. Decisión de diseño abierta |
| A3 | Pasar el componente de booking al LandingRenderer como prop (vs. acoplar el renderer al modelo canchas) es el menor cambio | Q6 | Bajo — alternativa: el renderer recibe la data de canchas + vertical. Ambas cumplen D-05 |

## Open Questions

1. **¿Gatear el create por vertical o por forma del payload?**
   - Qué sabemos: hoy exige `serviceId`; canchas manda `professionalId`. Ambos criterios funcionan.
   - Qué falta: decisión de diseño del planner (CONTEXT lo deja a discreción).
   - Recomendación: derivar cuando `serviceId` ausente + `professionalId` presente (menos queries,
     robusto a vertical mal seteado); mantener el path legacy byte-idéntico.

2. **¿El LandingRenderer recibe un `bookingSlot` prop o la data de canchas?**
   - Qué sabemos: la sección booking es caja negra; el renderer no debe acoplarse de más.
   - Recomendación: `page.tsx` resuelve el componente y lo pasa como prop → renderer agnóstico al vertical.

## Environment Availability

> La fase depende de la DB Supabase (migración 044) y del stack ya presente. Sin herramientas externas nuevas.

| Dependencia | Requerida por | Disponible | Versión | Fallback |
|-------------|---------------|------------|---------|----------|
| Supabase CLI local (PG17) | Validar migr. 044 con `supabase db reset` | ✓ (infra-testing roadmap, MEMORY) | PG17 local | — |
| MercadoPago (por negocio) | Camino de seña (D-04) | ✓ (reuso) | — | Sin seña confirma directo |
| reCAPTCHA v3 (por negocio) | Camino sin seña | ✓ (reuso) | v3 | El server decide según config |
| Vitest | Guard de regresión + tests nuevos | ✓ | `vitest run` | — |

**Faltantes sin fallback:** ninguno. **Faltantes con fallback:** ninguno crítico.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (`vitest run`) — `vitest.config.mts`, environment `node` |
| Config file | `vitest.config.mts` (tsconfigPaths + react + setupFiles `vitest.setup.ts`) |
| Quick run command | `npx vitest run test/booking-core.test.ts test/booking-public-regression.test.ts` |
| Full suite command | `npm run test` (`vitest run`) |

Los tests que tocan Supabase usan `describe.skipIf(!hasSupabaseCreds)` con fixtures
(`test/helpers/booking-fixtures.ts`, `seedOneTenant`/`teardownOneTenant`) y service-role local.
[VERIFIED: booking-core.test.ts:1-40]

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ALQUILER-01 | Reserva de cancha crea appointment con la duración de la cancha (no del cliente) | integration | `npx vitest run test/canchas-booking.test.ts` | ❌ Wave 0 |
| ALQUILER-02 | Reservar cancha que comparte espacio ocupado → slot_taken | integration | `npx vitest run test/concurrency.test.ts -t espacio` | ✅ (motor v0.12 cubre; agregar caso canchas) |
| ALQUILER-03 | Dos turnos consecutivos posibles (sin lógica nueva) | integration | `npx vitest run test/canchas-booking.test.ts -t consecutiv` | ❌ Wave 0 |
| ALQUILER-04 | El appointment referencia el service (precio) de la cancha | integration | `npx vitest run test/canchas-booking.test.ts -t precio` | ❌ Wave 0 |
| SEC (anti-tampering) | serviceId del cliente ignorado; service derivado del professional | integration | `npx vitest run test/isolation.test.ts -t cancha` o nuevo | ❌ Wave 0 |
| SEC (cross-tenant) | professionalId de otro tenant → invalid_service | integration | `npx vitest run test/canchas-booking.test.ts -t tenant` | ❌ Wave 0 |
| Regresión | Booking de salud/belleza/general intacto tras la rama canchas | integration | `npx vitest run test/booking-public-regression.test.ts` | ✅ |
| DDL | `public_canchas` no expone `service_id`, filtra active, GRANT anon | integration | validar en `supabase db reset` + smoke anon | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run test/booking-core.test.ts test/booking-public-regression.test.ts`
- **Per wave merge:** `npm run test` (suite completa)
- **Phase gate:** suite verde + `supabase db reset` local aplica la 044 sin error, antes de `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/canchas-booking.test.ts` — cubre ALQUILER-01/03/04 + anti-tampering (serviceId derivado, cross-tenant), reusando `seedOneTenant` + provisión de una cancha (patrón `canchas-provision.test.ts`)
- [ ] Caso canchas en la exclusión por espacio (extender `test/concurrency.test.ts` o el nuevo file) para ALQUILER-02 con dos canchas que comparten espacio
- [ ] Smoke de `public_canchas` (no expone `service_id`, filtra active) — puede ir como assert en el reset local o un test de forma de la vista
- [ ] Guard: `booking-public-regression.test.ts` sigue verde tras la rama canchas (ya existe; correrlo)

## Security Domain

> `security_enforcement` habilitado (ALTO — público + concurrencia). CONTEXT lo marca explícitamente.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | Aislamiento por tenant (business_id) + service-role solo server; vista acotada para anon |
| V4 Access Control | yes | Anti-tampering: toda entidad re-validada por `business_id`; anon solo vía `public_canchas`; `plan_status` gate |
| V5 Input Validation | yes | Parseo defensivo del body (narrowing por `typeof`); `serviceId` del cliente ignorado en canchas (derivado del professional) |
| V6 Cryptography | no | Sin cripto nueva (reCAPTCHA/MP reusan el flujo existente) |
| V11 Business Logic | yes | Atomicidad cupo + exclusión espacio en `book_slot_atomic` (nunca check suelto); no sobre-reserva concurrente |
| V13 API / Web Service | yes | Route handlers service-role por slug; reCAPTCHA fail-closed; respuestas `{ ok, error }` estables |

### Known Threat Patterns for este stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Reservar cancha de otro tenant (professionalId ajeno) | Tampering / Elevation | Derivación + re-validación por `business_id` (doble barrera, Q1/Q7) |
| Tampering de serviceId/precio | Tampering | Service derivado del professional server-side; precio nunca del cliente; core re-lee por business_id |
| Sobre-reserva concurrente (canchas que comparten espacio) | Tampering (race) | `book_slot_atomic`: advisory lock por espacio + EXISTS cross-bucket + EXCLUDE backstop |
| Exposición de config interna al anon | Information Disclosure | `public_canchas` sin `service_id` ni columnas sensibles; sin read anon a `agenda_spaces`/`spaces` |
| Booking en negocio con plan vencido | Business Logic bypass | Gate `plan_status` blocklist (create:62) |
| Bot spam de reservas sin seña | Spoofing / DoS | reCAPTCHA v3 fail-closed (create:73) |

## Sources

### Primary (HIGH confidence)
- Código del repo (VERIFIED por lectura directa este session):
  - `app/api/booking/create/route.ts` — handler público, guards, delegación al core
  - `lib/booking-core.ts` — anti-tampering + `book_slot_atomic` + traducción de constraint
  - `app/api/booking/availability/route.ts` — `{busy,full}` + `siblingBusy` (espacio)
  - `app/api/payment/create/route.ts` — camino de seña, `services(name,price)`
  - `app/[slug]/page.tsx` + `app/[slug]/booking-client.tsx` — RSC + client patterns
  - `components/landing/landing-renderer.tsx` — sección booking (caja negra)
  - `lib/canchas.ts`, `lib/verticals.ts`, `lib/types.ts` — modelo cancha, vertical, tipos
  - `lib/supabase/public.ts` — cliente anon
  - `supabase/migrations/042_spaces_and_coupled_exclusion.sql` — `book_slot_atomic` + espacio
  - `supabase/migrations/043_professionals_service_id.sql` — puntero cancha↔service
  - `supabase/migrations/00000000000000_baseline.sql:546-592,3022-3036` — `public_services`/`public_professionals` (patrón de vista) + GRANTs

### Secondary (MEDIUM confidence)
- `.planning/workstreams/canchas/phases/03-*/03-CONTEXT.md` + `03-UI-SPEC.md` (decisiones + contrato UI)
- `.planning/workstreams/canchas/REQUIREMENTS.md` (ALQUILER-01..04)

### Tertiary (LOW confidence)
- Ninguna. Toda afirmación técnica está anclada a código real del repo.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — todo verificado en package.json + código; cero deps nuevas
- Architecture: HIGH — motor v0.12 leído completo; los tres puntos de cambio (vista/create/client) confirmados contra el código
- Pitfalls: HIGH — cada pitfall ancla a un file:line concreto (dos moldes de vista, serviceId del cliente, caja negra landing, PostgREST cache)
- Security: HIGH — guards existentes mapeados; riesgos nuevos cubiertos por reuso + derivación

**Research date:** 2026-07-01
**Valid until:** 2026-07-31 (código estable; re-verificar si cambian `book_slot_atomic`, el shape de `create`, o el patrón de vistas públicas)
