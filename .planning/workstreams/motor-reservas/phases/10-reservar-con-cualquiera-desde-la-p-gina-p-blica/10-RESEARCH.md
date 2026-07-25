# Phase 10: Reservar con "cualquiera" desde la página pública - Research

**Researched:** 2026-07-25
**Domain:** Frontend público (Next.js 16 App Router / RSC) + endpoint público de disponibilidad + wiring al RPC atómico ya existente (Phase 9). Multi-tenant Supabase con vistas acotadas para `anon`.
**Confidence:** HIGH (todo anclado en código real leído; el backend de asignación ya está shipeado en migr. 058)

## Summary

La capacidad de "cualquiera" ya existe end-to-end en el backend: `book_slot_atomic` (migr. **058**) recibe el UUID mágico `ANY_PROFESSIONAL` (`…0001`), elige bajo el advisory lock un profesional capaz+libre+de-menor-carga e **inserta el pro REAL** en `appointments.professional_id`. `lib/booking-core.ts` ya expone el flag `autoAssign` que traduce a ese UUID mágico. Esta fase es **puramente de superficie**: exponer esa mecánica en `/[slug]` sin tocar el motor.

Las 3 zonas grises se resuelven así, todas ancladas en construcciones que ya existen:

1. **Agregación de disponibilidad** → una **rama nueva** en `app/api/booking/availability/route.ts`, gateada por un param nuevo (`any=1` + `serviceId`), que resuelve los buckets de profesionales capaces server-side (espejando EXACTO el criterio de candidatos del RPC 058) y devuelve el mismo contrato `{ ok, busy, full }`. El camino específico/omitido queda **byte-idéntico** (DISP-02/D-08).
2. **Lista de capaces por servicio** → **vista acotada nueva `public_professional_services` (migr. 059)**, molde exacto de `public_canchas` (044) / `public_professionals`; se lee en `app/[slug]/page.tsx` y se pasa a `BookingClient`, que la interpreta con el helper puro `lib/staff-services.ts` (regla del comodín).
3. **"Cualquiera" → create + mostrar el asignado** → el front manda un boolean `anyProfessional` (nunca un `professionalId` forjado, D-05); el create route pasa `autoAssign: true` al core. **La pantalla de confirmación YA muestra el profesional** (no requiere cambios); **el mail de confirmación NO lo muestra hoy** y hay que agregarlo en los DOS paths de mail (sin seña y con seña).

**Primary recommendation:** No inventar nada nuevo del motor. Gatear TODO lo nuevo (param `any` de availability, flag `autoAssign` de create, tarjeta "Cualquiera") detrás de la condición **"2+ profesionales capaces"** (D-02) para que el camino de hoy —incluido canchas y el negocio de 1 profesional— quede intacto.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 (default del selector):** con 2+ profesionales capaces, el paso "Profesional" viene con **"Cualquiera" preseleccionado**. Coincide con el default actual (`selectedPro` arranca en `'none'`); el cambio es semántico: `'none'` pasa a leerse/mostrarse como **"Cualquiera"** = asignación across-staff.
- **D-02 (gating por cantidad):** "Cualquiera" **se muestra solo con 2+ profesionales capaces** del servicio elegido. Con ≤1 capaz (o negocio sin profesionales nombrados = sentinel) se **oculta** y el flujo se comporta **como hoy**. La cuenta de capaces respeta la **regla del comodín** de Phase 8 (`lib/staff-services.ts`: 0 filas = capaz de todo).
- **D-03 (presentación + copy):** "Cualquiera" es una **tarjeta arriba de la lista** de profesionales, misma UI que un profesional, copy **"Cualquiera"** + sub-texto **"El primero disponible"**. No es un toggle separado.
- **D-04 (ASIGN-05 — cuándo mostrar):** el nombre del profesional se muestra en **confirmación** (`turno/[token]`) y en el **mail** **siempre que haya un profesional asignado** (específico o por "Cualquiera"), trato uniforme "Te atiende: [Nombre]". Sin profesionales nombrados (sentinel) no se muestra nada. El nombre sale del **turno ya creado**, nunca del front.
- **D-05 (servidor = autoridad):** el cliente puede mandar "sin profesional", pero el servidor asigna. **Nunca** aceptar un `professionalId` pre-elegido como si fuera la asignación, ni confiar en uno que no pertenezca al negocio del slug. Anti-tampering de tenant **intacto**.
- **D-06 (contrato de disponibilidad acotado):** `/api/booking/availability` **agrega** varias agendas pero mantiene el contrato `{ ok, busy, full }`. El público **NO** ve cuántos lugares quedan, ni qué profesional está ocupado a qué hora, ni la agenda interna, más allá de lo que ya expone hoy.
- **D-07 (lista de capaces vía vista acotada):** la lista de capaces por servicio se sirve por una **vista acotada** (patrón `public_professionals`/`public_services`, migr. 027), **nunca** abriendo `professional_services` a `anon`.
- **D-08 (DISP-02 cero regresión):** elegido un profesional específico, la disponibilidad es la de **esa agenda**, byte-idéntica a hoy. Negocio de un solo profesional se comporta exactamente como hoy.
- **D-09 (gemelos):** `canchas-booking-client.tsx` sigue igual (elegir la cancha, **sin** "cualquiera"). Cualquier cambio de patrón compartido se evalúa en ambos calendarios (SC5).
- **D-10 (guards intactos):** ventana de reserva (v0.22) y gating de `plan_status` (SEC-04) siguen aplicando sin cambios en el camino nuevo.

### Claude's Discretion
- Cómo agregar disponibilidad across-staff manteniendo el contrato → resuelto en **Gray Zone 1** abajo.
- Cómo se sirve la lista de capaces sin exponer la puente → resuelto en **Gray Zone 2** abajo (vista `public_professional_services`, migr. 059).
- Cómo leer el profesional asignado y mostrarlo en confirmación + mail → resuelto en **Gray Zone 3** abajo.
- Detalles finos de UI de la tarjeta "Cualquiera" → planner/UI-SPEC, respetando D-03.

### Deferred Ideas (OUT OF SCOPE)
- **Default del selector configurable por el dueño** (setting) → Phase 11 (POLISH) / backlog. Por ahora el default es fijo (D-01).
- **Nudge "no hay lugar con [X] pero sí con Cualquiera"** → fuera de scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ASIGN-01 | En la reserva pública el cliente puede elegir un profesional específico **o** "cualquiera". | Gray Zone 3 (wiring del front → `autoAssign`) + tarjeta "Cualquiera" en step 2 de `booking-client.tsx`. |
| ASIGN-05 | El cliente ve qué profesional le tocó en confirmación y mail. | Gray Zone 3: la **confirmación ya lo muestra** (ConfirmationView:159-161 + `turno/[token]/page.tsx` ya fetchea `professionals(name)`); el **mail hay que agregarlo** en `notify/booking` + `payment/webhook` + `sendConfirmationEmail`. |
| DISP-01 | Un horario aparece disponible si **algún** profesional capaz lo tiene libre. | Gray Zone 1: rama de agregación (unión de disponibilidad) en `availability/route.ts`. |
| DISP-02 | Elegido un profesional específico, la disponibilidad es la de esa agenda (sin cambios). | Gray Zone 1: el path específico/omitido queda intacto; la rama nueva se gatea con `any=1`. |
| DISP-03 | Si ningún capaz tiene lugar, el horario no se ofrece. | Gray Zone 1: la agregación devuelve en `full` los start-times bloqueados para TODOS los capaces. |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Selección de "Cualquiera" vs profesional + gating por cantidad de capaces (D-01/02/03) | Frontend Client (`booking-client.tsx`) | — | Es puramente interacción/render del wizard; el cómputo de "capaces" es una función pura sobre datos ya fetcheados. |
| Servir qué profesional es capaz de qué servicio a `anon` (D-07) | Database (vista `public_professional_services`) → Frontend Server (`page.tsx`) | Frontend Client (lo consume) | El aislamiento lo da la vista acotada + `.eq('business_id')`; el RSC la lee sin credenciales del dueño. |
| Agregación de disponibilidad across-staff (DISP-01/03) | API / Backend (`availability/route.ts`, service-role) | — | El `anon` no puede leer `appointments` (RLS); la ocupación se resuelve server-side y colapsa a booleano por slot (D-06). |
| Asignación real del profesional (ASIGN-02/03/04) | Database (RPC `book_slot_atomic`, migr. 058) | — | **YA HECHO en Phase 9.** No se toca. La elección corre bajo advisory lock (atomicidad). |
| Disparar "cualquiera" hacia el create (ASIGN-01, D-05) | API / Backend (`create/route.ts` → `booking-core.ts`) | Frontend Client (manda el boolean) | El server es la autoridad; recibe un boolean, nunca un id de asignación. |
| Mostrar el profesional asignado (ASIGN-05, D-04) | Frontend Server (`turno/[token]`, ya hecho) + API (mails) | — | Se lee de la fila `appointments` ya creada; nunca del front. |

---

## Standard Stack

No hay librerías nuevas. Todo se construye sobre lo que ya está en el repo.

### Core (existente, load-bearing)
| Módulo / archivo | Rol en esta fase | Nota |
|------------------|------------------|------|
| `app/[slug]/booking-client.tsx` | Wizard público; step 2 "Profesional", estado `selectedPro: Professional \| null \| 'none'` (default `'none'`), fetch a availability, submit a create. | **Acá vive el selector y la grilla.** |
| `app/api/booking/availability/route.ts` | Contrato `{ ok, busy, full }`, bucketing por `professional_id` con `SENTINEL`, `siblingBusy` (espacio compartido v0.12). | **Acá va la agregación** (rama nueva gateada). |
| `app/[slug]/page.tsx` | RSC: `Promise.all` de `public_services`, `public_professionals`, `time_blocks`, etc. → props a ambos clients. | **Acá se suma** la lectura de la vista nueva. |
| `lib/staff-services.ts` | Regla del comodín (0 filas = capaz de todo). `professionalsForService()`, `isServiceCovered()`. Funciones **puras**. | **Fuente ÚNICA** para contar/filtrar capaces. No reimplementar la regla. |
| `lib/booking-core.ts` | `createAppointmentCore({ …, autoAssign })` → pasa `ANY_PROFESSIONAL` al RPC cuando `autoAssign=true`. | Ya listo desde Phase 9. |
| `app/api/booking/create/route.ts` | Anti-tampering, plan gate (SEC-04), ventana (backstop), reCAPTCHA, deriva service de cancha. | **Hay que wire-ear `autoAssign`** (hoy NO lo setea). |
| `app/[slug]/turno/[token]/page.tsx` + `components/booking/confirmation-view.tsx` | Confirmación: ya fetchea `professionals(name)` y ya renderiza la fila "Profesional". | **Sin cambios** (ver Gray Zone 3). |
| `app/api/notify/booking/route.ts` + `lib/email.ts` (`sendConfirmationEmail`) | Mail de confirmación sin seña. | **NO** incluye el profesional hoy → agregarlo. |
| `app/api/payment/webhook/[slug]/route.ts` | Mail de confirmación **con** seña (también llama `sendConfirmationEmail`). | Mismo cambio de mail, no olvidar. |

### Migración nueva
| # | Qué | Molde a copiar |
|---|-----|----------------|
| **059** | Vista `public_professional_services` (business_id, professional_id, service_id) acotada a `anon`. | `supabase/migrations/044_public_canchas.sql` (owner `postgres`, **sin** `security_invoker`, GRANT ALL a los 3 roles, idempotente). |

**Verificación de "versiones" (baseline de migraciones):** última en prod = **058**; la próxima es la **059**. Validación local `npx supabase db reset` (replay 001→059 en PG17). Aplicación a prod = **a mano** + `NOTIFY pgrst, 'reload schema';` + regenerar `supabase/schema.sql`. `[VERIFIED: supabase/migrations glob + STATE.md]`

---

## Package Legitimacy Audit

**No se instalan paquetes externos en esta fase.** Todo el trabajo es sobre código y una migración SQL. Sección N/A — no hay auditoría de registry que correr. `[VERIFIED: no package.json changes required]`

---

## Architecture Patterns

### System Architecture Diagram — camino "Cualquiera" (2+ capaces)

```
[Cliente en /[slug]] step 1: elige servicio
        │
        ▼
 booking-client.tsx  ── professionalsForService(serviceId, professionals, bridge)  (lib/staff-services, PURO)
        │                     │
        │                     ├─ capaces.length >= 2 ─► muestra tarjeta "Cualquiera" (D-02/03)  ─► selectedPro='none' (=any)
        │                     └─ capaces.length <= 1 ─► oculta "Cualquiera"; flujo de hoy
        │
        ▼ (elige día)
 GET /api/booking/availability?slug&date&any=1&serviceId=…      ◄── rama NUEVA (gateada por any=1)
        │        service-role: resuelve buckets capaces (espeja criterio RPC 058)
        │        enumera grilla semanal (dow, step=duración) × cada capaz → unión
        │        ► { ok, busy:[], full:[start-times bloqueados para TODOS los capaces] }   (D-06)
        ▼
 grilla de horarios (client filtra full)  ─► elige hora
        │
        ▼ (confirma)
 POST /api/booking/create  { …, anyProfessional:true, professionalId:null }   (D-05: boolean, no id)
        │  guards: plan_status(SEC-04) · ventana backstop · reCAPTCHA · anti-tampering  (INTACTOS, D-10)
        │  autoAssign=true ─► createAppointmentCore ─► book_slot_atomic(p_professional_id=ANY_PROFESSIONAL)
        │                                                    └─ elige pro capaz+libre+menor-carga BAJO LOCK
        │                                                       INSERT con el pro REAL en professional_id
        ▼
 router.push(`/[slug]/turno/[cancelToken]`)
        │
        ▼
 turno/[token]/page.tsx  ── select professionals(name)  ─► ConfirmationView renderiza "Profesional: X"  ✅ YA FUNCIONA
 + mail: notify/booking (sin seña) / payment/webhook (con seña) ─► sendConfirmationEmail(professionalName)  ◄── AGREGAR
```

Camino **específico** (`professionalId` concreto) y camino **canchas** (`professionalId = cancha.id`): **no pasan `any=1` ni `anyProfessional`** → recorren el código de hoy sin cambios (DISP-02/D-08/D-09).

### Gray Zone 1 — Agregación de disponibilidad (DISP-01/02/03, D-06)

**Recomendación: agregar una RAMA nueva keyed por `any=1` + `serviceId`, NO reescribir el bucketing existente.**

Hoy el endpoint (leído íntegro) hace: bucket = `professionalId || SENTINEL`, filtra `appts` por ese bucket, calcula `busy` (solapes de cupo-1 + `siblingBusy`) y `full` (count ≥ capacity), devuelve `{ ok, busy, full }`. Ese camino queda **intacto** (DISP-02).

Por qué hace falta una rama y no basta con reusar el bucket: hoy, "sin preferencia" (`professionalId` ausente) cae al bucket `SENTINEL` (turnos con `professional_id` NULL). En un negocio multi-staff, los turnos están bucketeados por cada `professional_id` real, así que el bucket SENTINEL estaría **vacío** y "Cualquiera" mostraría TODO libre aunque cada pro esté ocupado. La agregación real es una **unión de disponibilidad**, no un bucket.

Por qué la unión NO se puede expresar concatenando `busy`: `busy` es una lista de rangos por-turno y el client la aplica como solape (bloquea si CUALQUIER entrada solapa). Concatenar los `busy` de todos los pros daría intersección ("bloqueado si ALGÚN pro ocupado") — lo **opuesto** de la unión que pide DISP-01. Y exponer per-pro/counts viola D-06. Conclusión: **la agregación se computa server-side a nivel de start-time y se devuelve como `full`** (la lista de "ocultar este horario exacto"), con `busy: []`. `full` ya es un booleano-por-slot → no filtra nada nuevo (D-06).

**Algoritmo de la rama `any`:**
1. Resolver `service` (duración) por `business_id` (service-role; anti-tampering aunque sea read).
2. Resolver los **buckets capaces** espejando EXACTO el criterio de candidatos del RPC 058 (migr. 058:88-130): `professionals` del negocio con `active=true` **AND `service_id IS NULL`** (excluir canchas) **AND** (`location_id = p_location_id OR location_id IS NULL`) **AND** capacidad por comodín (`professional_services`: 0 filas ⇒ capaz de todo, o fila para `serviceId`). Reusar la MISMA lógica de comodín que `lib/staff-services.ts` para no divergir de la selección del RPC.
3. Traer los `appts` del negocio+fecha (ya se hace) y bucketear por `professional_id`.
4. **Enumerar la grilla semanal** del `dow` a paso = duración del servicio (misma fórmula que el client: `for (t=openMin; t+dur<=closeMin; t+=dur)` sobre `time_blocks` de ese `dow`). Para cada start-time `t`, un pro está **libre** si no tiene turno vivo que solape `[t, t+dur)` con buffer, **y** no está `full`, **y** no está bloqueado por espacio compartido (su `siblingBusy`). El slot es **agregado-disponible** si **al menos un** capaz está libre; si NINGUNO, `t` va a `full`.
5. Devolver `{ ok: true, busy: [], full }`.

**Caveat conocido (documentar, no bloquea):** la enumeración server usa la grilla semanal del `dow`; el client además aplica excepciones/consultorios que solo **quitan** slots → el `full` server es correcto para todo slot que el client muestre, salvo un **horario especial que EXTIENDE** el día (excepción `schedule_exceptions`), donde el client podría ofrecer un start-time fuera de la grilla semanal. Ese caso raro queda **respaldado por el RPC** (devuelve `slot_taken` si no hay capaz libre → toast normal). Aceptable: el RPC es la autoridad.

**`siblingBusy`/espacio compartido en el camino "cualquiera":** se computa por-pro dentro del paso 4 (un pro con el espacio ocupado por una hermana NO cuenta como libre). En la práctica solo importa para salud/belleza con salas compartidas; **canchas nunca usa "Cualquiera"** (D-09), así que su gemelo no toca esta rama.

### Gray Zone 2 — Servir la lista de capaces sin exponer la puente (D-07)

**Recomendación: vista acotada nueva `public_professional_services` (migr. 059), leída en `page.tsx`, interpretada por `lib/staff-services.ts` en el client.**

Por qué una vista y no derivar de lo que ya trae `page.tsx`: `page.tsx` trae `public_professionals` y `public_services` pero **NO** el mapeo puente → sin la puente no se puede saber quién hace qué. El front necesita el mapeo **client-side** (el servicio se elige en el client, y hay que (a) filtrar la lista de pros del step 2 al servicio elegido y (b) contar capaces ≥2 para gatear "Cualquiera", D-02). Por eso la vista se lee una vez en el RSC y se pasa como prop.

Migración 059 (molde exacto de `044_public_canchas.sql`):
```sql
CREATE OR REPLACE VIEW "public"."public_professional_services" AS
 SELECT "business_id", "professional_id", "service_id"
   FROM "public"."professional_services";
ALTER VIEW "public"."public_professional_services" OWNER TO "postgres";
GRANT ALL ON TABLE "public"."public_professional_services" TO "anon";
GRANT ALL ON TABLE "public"."public_professional_services" TO "authenticated";
GRANT ALL ON TABLE "public"."public_professional_services" TO "service_role";
```
- **NO** `security_invoker=true` (Pitfall confirmado en 044:23-25): con invoker la vista heredaría la RLS de `professional_services` que el `anon` NO cumple → 0 filas → gating roto. El molde correcto es owner `postgres` (definer), igual que `public_services`.
- Solo 3 columnas no sensibles. Respeta D-07: es una **vista acotada**, no se abre la tabla puente a `anon`. El mapeo es de por sí no-sensible (el selector lo revela igual).
- **Regla del comodín preservada:** un pro sin filas simplemente no aparece en la vista; `professionalsForService()` lo interpreta como "capaz de todo" (comodín). Cero backfill.

En `page.tsx`, sumar al `Promise.all`:
```ts
supabase.from('public_professional_services').select('*').eq('business_id', business.id),
```
y pasar `professionalServices` como prop a `BookingClient` (NO a `CanchasBookingClient`, D-09). En el client, para el servicio elegido:
```ts
import { professionalsForService } from '@/lib/staff-services'
const capaces = professionalsForService(selectedService.id, professionals, professionalServices)
const showAny = capaces.length >= 2   // D-02
```
(`professionals` viene de `public_professionals` — id/name/…; `professionalServices` de la vista nueva. El helper es puro y ya testeado.)

**Consistencia con el RPC (pitfall):** el conteo de capaces del front usa `active + comodín` pero NO filtra por `location`, mientras el RPC 058 sí exige match de sede. `public_professionals` no expone `location_id`, así que el front no puede filtrar por sede. Impacto: en un negocio multi-sede podría mostrarse "Cualquiera" y que un slot puntual falle con `slot_taken` (toast normal). Aceptable — el RPC es la autoridad; documentar.

### Gray Zone 3 — Flujo "cualquiera" → create + mostrar el asignado (ASIGN-05)

**a) Señal del front → `autoAssign` (D-05).** **Hallazgo crítico:** hoy `create/route.ts` **NO** setea `autoAssign`, y `professionalId: null` cae al bucket `SENTINEL` (agenda "sin preferencia") — **NO** es asignación across-staff. Por lo tanto el wiring es NUEVO y obligatorio:
- El front manda un boolean explícito, p.ej. `anyProfessional: true`, con `professionalId: null`. **Nunca** un id de asignación (D-05). Gatear el boolean en `isAny = selectedPro === 'none' && capaces.length >= 2`.
- El create route lee `body.anyProfessional === true` y pasa `autoAssign: true` a `createAppointmentCore`. El core ya traduce a `ANY_PROFESSIONAL` (booking-core.ts:110-111).
- **Sin guard extra necesario contra forjado:** si un cliente forja `anyProfessional` en un negocio sin capaces, el RPC no encuentra candidato → `RAISE 'slot_taken'` (migr. 058:132-136) → 409 normal. Fail-safe. Igual, gatear el `serviceId` de availability y el flag en `capaces>=2` mantiene el UX correcto.
- **Para negocios de 0-1 pro:** el front NO manda `any=1` ni `anyProfessional` → `professionalId: null` sigue cayendo a `SENTINEL` (comportamiento de hoy, D-08). No romper ese camino.

**b) Confirmación en pantalla — YA FUNCIONA, sin cambios.** `turno/[token]/page.tsx:17` ya hace `select(... professionals(name) ...)` por `cancel_token`, y `ConfirmationView` (confirmation-view.tsx:159-161) ya renderiza `{professionalName && <Row label="Profesional">…}`. Como el RPC 058 inserta el **pro REAL** en `appointments.professional_id`, la confirmación muestra "Profesional: [Nombre]" tanto para específico como para "Cualquiera", y **no muestra nada** cuando `professional_id` es NULL (sentinel) — exactamente D-04. **No requiere trabajo.** (Verificar en UAT que se cumple; no reimplementar.)

**c) Mail de confirmación — FALTA (los dos paths).** `sendConfirmationEmail` (lib/email.ts:217-255) **no tiene** `professionalName` y ninguno de sus callers lo pasa:
- `app/api/notify/booking/route.ts` (sin seña): su `select` (línea 18) NO trae `professionals(name)`.
- `app/api/payment/webhook/[slug]/route.ts` (con seña): también llama `sendConfirmationEmail`.

Cambios para ASIGN-05 en mail (D-04, "siempre que haya profesional asignado"):
1. `sendConfirmationEmail`: agregar param opcional `professionalName?: string | null` y, si viene, renderizar una fila "Profesional: X" en el HTML.
2. `notify/booking`: sumar `professionals(name)` al `select` y pasar `professionalName`.
3. `payment/webhook`: idem — no olvidar el path con seña, o el mail de "Cualquiera" con seña queda sin el nombre.

### Recommended Project Structure (superficies tocadas)
```
app/
├── [slug]/
│   ├── page.tsx                 # + lectura de public_professional_services (prop nueva)
│   ├── booking-client.tsx       # tarjeta "Cualquiera" (D-03) + gating capaces>=2 (D-02) + filtro de pros por servicio + señal anyProfessional
│   ├── canchas-booking-client.tsx  # SIN cambios (D-09) — verificar cero regresión
│   └── turno/[token]/page.tsx   # SIN cambios (ya muestra el profesional)
├── api/booking/availability/route.ts  # rama nueva `any=1&serviceId` (agregación)
├── api/booking/create/route.ts        # lee anyProfessional → autoAssign
├── api/notify/booking/route.ts        # + professionals(name) → mail
└── api/payment/webhook/[slug]/route.ts # + professionals(name) → mail
lib/
├── staff-services.ts            # SIN cambios (reusar professionalsForService)
├── booking-core.ts              # SIN cambios (autoAssign ya existe)
└── email.ts                     # + param professionalName en sendConfirmationEmail
supabase/migrations/
└── 059_public_professional_services.sql   # vista acotada NUEVA
```

### Anti-Patterns to Avoid
- **Reescribir el bucketing de availability.** El camino específico debe quedar byte-idéntico (DISP-02). Agregá una rama, no toques la existente.
- **Concatenar los `busy` de todos los pros** para "Cualquiera" → da intersección, lo opuesto a la unión (DISP-01). Computar a nivel start-time y devolver en `full`.
- **Reimplementar la regla del comodín** en el client o en el endpoint. Usar `lib/staff-services.ts` (front) y el criterio EXACTO del RPC 058 (endpoint) — son la fuente única.
- **`security_invoker=true` en la vista 059** → 0 filas para `anon` (ver 044:23-25).
- **Confiar en un `professionalId` del front como asignación** (D-05). El front manda un boolean; el server asigna.
- **Tocar `canchas-booking-client.tsx`** o el path `professionalId=cancha.id` del endpoint/create (D-09). Todo lo nuevo se gatea detrás de params que canchas nunca manda.
- **Exponer `service_id` de más o counts por slot** en la respuesta agregada (D-06).

---

## Don't Hand-Roll

| Problema | No construir | Usar en su lugar | Por qué |
|----------|--------------|------------------|---------|
| Decidir "quién es capaz de qué" | Filtro ad-hoc con la puente en el client/endpoint | `lib/staff-services.ts` (`professionalsForService`) en el front; criterio del RPC 058 en el endpoint | La regla del comodín (0 filas = todo) ya está encerrada y testeada; tres implementaciones divergirían (STATE 08-01). |
| Elegir el profesional en "Cualquiera" | Leer-libres→insertar desde JS | RPC `book_slot_atomic` con `ANY_PROFESSIONAL` (migr. 058) | La selección DEBE correr bajo el advisory lock o hay carrera (TOCTOU); ya está hecho y es la autoridad (ASIGN-03). |
| Mostrar el pro en confirmación | Pasar el pro elegido desde el front | Leer `appointments.professional_id` de la fila creada (ya lo hace `turno/[token]`) | El front no conoce al asignado por "Cualquiera"; sale del turno (D-04/D-05). |
| Exponer capacidad a `anon` | Abrir `professional_services` a `anon` | Vista acotada `public_*` (molde 044) | Patrón del repo; no filtra columnas sensibles ni la tabla base (D-07). |

**Key insight:** casi todo el "motor" de esta feature ya existe (RPC 058, `autoAssign`, `staff-services`, ConfirmationView). El riesgo NO es construir lógica nueva; es **regresionar** los 4 caminos que comparten el endpoint/core (específico, canchas, abono, cupo grupal) al agregar la rama de agregación y el flag.

---

## Runtime State Inventory

No aplica en el sentido de rename/migración de datos, pero sí hay **estado de servicio que hay que aplicar a mano** (patrón del workstream):

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Ninguno nuevo. Los turnos de "Cualquiera" ya se insertan con el pro real desde Phase 9 (migr. 058, en prod). | Ninguna migración de datos. |
| Live service config | **Vista `public_professional_services` (migr. 059)** debe crearse en el Postgres de prod **a mano** + `NOTIFY pgrst, 'reload schema';` (sin esto PostgREST no la expone al RSC `anon` → la lista de capaces vuelve vacía → "Cualquiera" nunca se muestra). | Aplicar 059 a mano coordinado con el deploy; regenerar `supabase/schema.sql`. |
| OS-registered state | Ninguno (no hay tasks/crons nuevos; Vercel Hobby cron diario intacto). | Ninguna. |
| Secrets/env vars | Ninguno nuevo. reCAPTCHA/Resend/MP sin cambios. | Ninguna. |
| Build artifacts | Ninguno. | Ninguna. |

---

## Common Pitfalls

### Pitfall 1: "Cualquiera" muestra todo libre (bucket SENTINEL vacío)
**Qué sale mal:** reusar el path de hoy (`professionalId` ausente → bucket SENTINEL) para "Cualquiera" en un negocio multi-staff → los turnos reales están en buckets por-pro, SENTINEL está vacío, toda la grilla aparece libre.
**Por qué:** el bucketing por `professional_id` no agrega; es por-agenda.
**Cómo evitar:** rama `any=1` con unión de disponibilidad (Gray Zone 1). No usar SENTINEL para agregar.
**Señal temprana:** en un negocio con 2 pros ocupados a la misma hora, "Cualquiera" ofrece ese horario.

### Pitfall 2: el create no dispara `autoAssign` y bookea al bucket SENTINEL
**Qué sale mal:** el front manda `professionalId: null` esperando "Cualquiera", pero el create route no setea `autoAssign` → el turno se inserta con `professional_id` NULL (sentinel), no se asigna nadie, y la confirmación no muestra profesional.
**Por qué:** hoy `create/route.ts` no lee ningún flag de auto-asignación.
**Cómo evitar:** wire-ear `body.anyProfessional === true` → `autoAssign: true` (Gray Zone 3a). Cubrir con un test que el turno de "Cualquiera" queda con `professional_id` NO nulo.
**Señal temprana:** turno creado con `professional_id` NULL cuando se eligió "Cualquiera".

### Pitfall 3: mail de confirmación sin el profesional (path con seña olvidado)
**Qué sale mal:** se agrega `professionalName` solo en `notify/booking` (sin seña) y el mail del flujo **con seña** (`payment/webhook`) queda sin el nombre → ASIGN-05 a medias.
**Cómo evitar:** tocar los DOS callers de `sendConfirmationEmail`.
**Señal temprana:** reserva con seña → mail sin fila "Profesional".

### Pitfall 4: regresión de canchas o del negocio de 1 profesional (DISP-02/D-08/D-09)
**Qué sale mal:** cambiar el default/omitido de availability o el path `professionalId` de create rompe canchas (que manda `professionalId=cancha.id`) o el negocio single-pro.
**Cómo evitar:** TODO lo nuevo detrás de params que esos caminos nunca mandan (`any`, `anyProfessional`). Correr `test/canchas-booking.test.ts` y `test/booking-public-regression.test.ts`.
**Señal temprana:** cualquier diff en la respuesta de availability para un `professionalId` concreto.

### Pitfall 5: vista 059 con `security_invoker=true` → gating siempre oculto
**Qué sale mal:** la vista hereda la RLS de la puente, `anon` lee 0 filas, `professionalsForService` cree que todos son comodín (o no filtra bien) → "Cualquiera" nunca aparece o aparece mal.
**Cómo evitar:** owner `postgres`, sin invoker (molde 044).
**Señal temprana:** en local, `select` de la vista como `anon` devuelve [].

### Pitfall 6: contar capaces sin excluir canchas
**Qué sale mal:** el criterio de capaces del front no excluye `professionals` con `service_id` NOT NULL (canchas), pero el RPC 058 sí (migr. 058:94-97) → divergencia. (En verticales no-canchas todos tienen `service_id` NULL, así que en la práctica no ocurre en `BookingClient`, pero documentarlo evita sorpresas si se comparte código.)
**Cómo evitar:** en `BookingClient` los `professionals` vienen de `public_professionals` (no-canchas); no mezclar con `public_canchas`.

---

## Code Examples

### Rama de agregación en `availability/route.ts` (esqueleto, D-06)
```ts
// Source: patrón derivado de app/api/booking/availability/route.ts (real) + criterio RPC 058
const any = searchParams.get('any') === '1'
const serviceIdParam = searchParams.get('serviceId') || ''
if (any && serviceIdParam) {
  // 1. duración del servicio (service-role, por business_id)
  // 2. buckets capaces: professionals active + service_id IS NULL + sede + comodín(professional_services)
  // 3. appts del negocio+fecha, bucketeados por professional_id
  // 4. enumerar grilla del dow (step=duración) y por cada start-time:
  //      libre_para_alguno = capaces.some(pro => !solapa(pro) && !full(pro) && !espacioBloqueado(pro))
  //      if (!libre_para_alguno) full.push('HH:MM')
  return Response.json({ ok: true, busy: [], full }, { headers: { 'Cache-Control': 'no-store' } })
}
// … camino de hoy (bucket por professionalId), BYTE-IDÉNTICO …
```

### Señal del front (booking-client.tsx) — sin id de asignación (D-05)
```ts
// Source: app/[slug]/booking-client.tsx (handleConfirm real) + Gray Zone 3
const capaces = professionalsForService(selectedService.id, professionals, professionalServices)
const isAny = selectedPro === 'none' && capaces.length >= 2
// availability:
const params = new URLSearchParams({ slug: business.slug, date: dateStr })
if (isAny) { params.set('any', '1'); params.set('serviceId', selectedService.id) }
else if (proId) params.set('professionalId', proId)
// create body:
body: JSON.stringify({ …, professionalId: isAny ? null : proId, anyProfessional: isAny })
```

### create/route.ts — leer el boolean y pasar autoAssign
```ts
// Source: app/api/booking/create/route.ts (real) — createAppointmentCore ya soporta autoAssign
const anyProfessional = body.anyProfessional === true
const result = await createAppointmentCore({ …, professionalId, autoAssign: anyProfessional })
```

---

## State of the Art

| Antes | Ahora | Cuándo cambió | Impacto |
|-------|-------|---------------|---------|
| "Sin preferencia" = bucket SENTINEL (agenda vacía compartida) | "Cualquiera" = asignación across-staff bajo lock (RPC 058) | Phase 9 (backend) + Phase 10 (superficie) | El default `'none'` cambia de semántica solo cuando hay 2+ capaces. |
| Confirmación sin profesional para "sin preferencia" | Confirmación muestra el pro asignado (ya soportado) | Phase 10 lo activa (el screen ya lo renderiza) | ASIGN-05 en pantalla = cero código nuevo. |

**Deprecado/obsoleto:** nada. Todo aditivo.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `payment/webhook/[slug]/route.ts` también llama `sendConfirmationEmail` y necesita el mismo cambio de `professionalName`. | Gray Zone 3c | Si el webhook manda el mail por otra vía, ASIGN-05 con seña podría quedar sin cubrir o el cambio ser innecesario. Verificar al planear (leer el webhook completo). |
| A2 | La forma de `ProfessionalService` en `lib/types.ts` es `{ business_id, professional_id, service_id }`, compatible con lo que devuelve la vista 059 y con `professionalsForService`. | Gray Zone 2 | Si el tipo difiere, ajustar el cast/prop. Bajo riesgo (la puente tiene esas 3 columnas, migr. 057). |
| A3 | El criterio de "sede" del RPC (`location_id = p_location_id OR NULL`) no genera divergencia relevante con el front en negocios de 1 sede (la mayoría). | Gray Zone 2 pitfall | En multi-sede podría mostrarse "Cualquiera" y fallar un slot puntual (toast normal). Aceptable; documentado. |

**Si esta tabla te preocupa:** A1 se cierra leyendo `payment/webhook/[slug]/route.ts` en el plan; A2 leyendo `lib/types.ts`. Ninguna cambia la arquitectura.

---

## Open Questions

1. **¿"Cualquiera" preseleccionado (D-01) o solo mostrado arriba?** D-01 dice preseleccionado; D-03 dice "tarjeta arriba, tratada como una opción más". El default `selectedPro='none'` ya es "sin selección explícita". Recomendación: mantener `'none'` como estado inicial y presentar "Cualquiera" como la tarjeta destacada arriba; el planner/UI-SPEC define el detalle visual de "seleccionada".
2. **Con exactamente 1 capaz, ¿se muestra el step de profesional?** D-02 dice "como hoy" (hoy el step siempre aparece con "Sin preferencia" + lista). Recomendación: con 1 capaz, mostrar ese único profesional (sin "Cualquiera"); con 0 nombrados, evaluar auto-skip del step (mejora de UX, no requerida). → UI-SPEC.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI local (PG17) | Validar migr. 059 con `db reset` | ✓ (configurado, STATE/memory) | — | — |
| Postgres prod (aplicar 059 a mano) | Exponer la vista a `anon` | Requiere acción manual del operador | — | Sin la vista, "Cualquiera" no se muestra (fail-safe: no rompe el booking de hoy) |

**Missing dependencies with no fallback:** ninguna. Sin la migración 059 aplicada, el front simplemente no muestra "Cualquiera" (la lista de capaces viene vacía) — el booking existente sigue funcionando. Fail-safe.

---

## Estrategia de tests (regresión)

> `workflow.nyquist_validation` está en `false` en `.planning/config.json` → no se incluye la sección formal de Validation Architecture. Igual, esta fase toca superficies de alto riesgo de regresión; guía mínima anclada en los tests existentes.

Framework: **Vitest** (283/283 al cierre de v0.11; suite del workstream verde). Comando: `npx vitest run` / `npx vitest run test/<file>`.

Tests a espejar/extender (existen, leídos por glob):
- `test/booking-public-regression.test.ts` — el path específico/omitido de availability y create debe quedar byte-idéntico (DISP-02/D-08).
- `test/canchas-booking.test.ts` — canchas sin "cualquiera", cero regresión (D-09/SC5).
- `test/staff-assignment.test.ts` (Phase 9) — la asignación "cualquiera" del RPC; extender para el path público.
- `test/booking-core.test.ts` — `autoAssign` ya cubierto en el core; agregar que el create route lo pasa cuando `anyProfessional=true`.

Casos nuevos sugeridos:
- **DISP-01:** 2 pros, 1 ocupado a las 10:00 → "Cualquiera" ofrece 10:00 (el otro libre).
- **DISP-03:** 2 pros, ambos ocupados a las 10:00 → 10:00 NO se ofrece (va a `full`).
- **DISP-02:** elegido el pro A específico, la respuesta de availability es idéntica byte-a-byte a la de antes de la fase.
- **ASIGN-05:** turno por "Cualquiera" → `appointments.professional_id` NO nulo; la confirmación y el mail muestran el nombre; negocio sin pros nombrados → nada.
- **Cero regresión canchas:** `professionalId=cancha.id` no toca la rama `any`.

Como el aislamiento/atomicidad viven en el RPC, priorizar tests de **carrera real contra la DB local** para la parte de asignación (patrón STATE 07-12) por sobre dobles de Supabase.

---

## Security Domain

> `security_enforcement: true` en config → sección incluida. Toca superficie pública anónima + el núcleo anti-doble-booking (secure-phase recomendado igual que Phases 6/9).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control (multi-tenant) | yes | Todo re-validado por `business_id` server-side (create route + core + RPC SECURITY DEFINER); vista 059 acotada + `.eq('business_id')`. |
| V5 Input Validation | yes | `anyProfessional` es un boolean (no un id); `serviceId`/`professionalId` re-validados por tenant (anti-tampering existente). Parseo defensivo del body (patrón del repo). |
| V1 Data Protection / exposure | yes | D-06: la respuesta agregada colapsa a booleano por slot (`full`), sin counts ni per-pro; la vista 059 no expone columnas sensibles. |
| V2 Authentication | no | Superficie pública anónima por diseño (booking). reCAPTCHA fail-closed intacto (D-10). |
| V6 Cryptography | no | Sin criptografía nueva. |

### Known Threat Patterns for esta fase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cliente fuerza `anyProfessional` en negocio sin capaces / forja `professionalId` como asignación | Tampering / Elevation | El server ignora ids como asignación (boolean); el RPC selecciona bajo lock y hace `RAISE 'slot_taken'` si no hay candidato (058:132-136). Anti-tampering por `business_id` intacto (D-05). |
| Inferir agenda interna / ocupación por-pro desde la respuesta agregada | Information Disclosure | Contrato `{ ok, busy:[], full }` — solo booleano por slot; nunca counts ni per-pro (D-06). |
| Leer la puente `professional_services` como `anon` | Information Disclosure | Solo vía vista acotada 059 (3 columnas no sensibles); la tabla base sigue sin policy `anon` (migr. 057). |
| Carrera de dos "Cualquiera" al mismo slot | Tampering (double-booking) | Ya mitigado en Phase 9: selección + inserción bajo el advisory lock ampliado (058); esta fase no lo toca. |
| Reservar con plan vencido / fuera de ventana por el camino nuevo | Business logic bypass | Los guards `plan_status` (SEC-04) y ventana backstop (`isDateOutOfWindow`) corren en el create route ANTES del core, independientes de `autoAssign` (D-10). |

**secure-phase:** recomendado (toca superficie pública + el linaje del núcleo anti-doble-booking), consistente con la política del workstream para Phases 6/9.

---

## Sources

### Primary (HIGH confidence)
- Código real leído íntegro: `app/api/booking/availability/route.ts`, `app/[slug]/booking-client.tsx`, `app/[slug]/canchas-booking-client.tsx`, `app/[slug]/page.tsx`, `app/[slug]/turno/[token]/page.tsx`, `components/booking/confirmation-view.tsx`, `app/api/booking/create/route.ts`, `lib/booking-core.ts`, `lib/staff-services.ts`, `app/api/notify/booking/route.ts`, `lib/email.ts` (firma de `sendConfirmationEmail`).
- Migraciones: `058_professional_auto_assignment.sql` (RPC auto-assign, criterio de candidatos), `057_professional_services.sql` (puente + RLS sin anon), `044_public_canchas.sql` (molde de vista acotada), baseline `public_professionals`/`public_services`.
- `10-CONTEXT.md` (D-01..D-10), `REQUIREMENTS.md`, `STATE.md`.

### Secondary (MEDIUM confidence)
- Globs de `test/` (nombres de suites de regresión existentes).

### Tertiary (LOW confidence)
- Ninguna. Todo verificado contra el repo.

---

## Metadata

**Confidence breakdown:**
- Standard stack / superficies: HIGH — todas leídas en el código real.
- Agregación de disponibilidad (Gray Zone 1): HIGH en el diseño; MEDIUM en el caveat de horarios-especiales que extienden (backstopped por RPC).
- Vista 059 (Gray Zone 2): HIGH — molde 044 idéntico y verificado.
- Confirmación/mail (Gray Zone 3): HIGH — confirmación ya renderiza; mail confirmado faltante (A1 a verificar en el webhook).

**Research date:** 2026-07-25
**Valid until:** ~2026-08-25 (estable; depende de que la migr. 059 sea la próxima = confirmar 058 es la última antes de planear).
