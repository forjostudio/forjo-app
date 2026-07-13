# Phase 1: Turnos Manuales - Research

**Researched:** 2026-06-26
**Domain:** Alta de turno autenticada desde el dashboard (reúso del pipeline de booking) — Next.js 16 App Router + Supabase RLS multi-tenant
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Sin seña en el alta manual. El turno manual **siempre se confirma directo** (`status = 'confirmed'`, sin `expires_at`, sin `pending_payment`). No genera link de pago ni mail de seña. **MANUAL-04 sale del alcance de Phase 1** (diferido a v2).
- **D-02:** reCAPTCHA NO aplica en el alta manual: el actor es el dueño autenticado. El gate de tenant es la sesión + RLS + re-validación por `business_id`, no el captcha.
- **D-03:** Combobox/buscador de clientes existentes del negocio (`clients` filtrados por `business_id`) + opción "crear nuevo" inline (nombre + contacto) en el mismo flujo.
- **D-04:** Dedupe al crear: si el teléfono o email del cliente nuevo coincide con uno existente del negocio, sugerir/reusar el existente en vez de duplicar. (Contrasta con el booking público, que SIEMPRE inserta cliente nuevo — ese comportamiento del flujo público NO se cambia.)
- **D-05:** El cliente elegido/creado queda asociado vía `client_id` + copia de `client_name`/`client_phone`/`client_email` a la fila del turno (patrón actual).
- **D-06:** El dueño puede agendar a **cualquier hora libre**, incluso fuera de la grilla de horario publicada. NO se restringe el alta manual a los slots de `/api/booking/availability`.
- **D-07:** El anti-doble-booking se mantiene intacto: una hora que **choca** con otro turno (cupo 1) se rechaza con el **mismo** `slot_taken` (409) que el booking público. La flexibilidad es solo respecto al horario de atención, NUNCA respecto a la colisión con otro turno.
- **D-08:** Botón "Nuevo turno" en **Agenda** y en **Turnos** (`appointments`). Además, click en un **slot vacío** de la grilla de la agenda abre el alta con fecha/hora (y profesional, si la columna corresponde) **pre-llenados**.
- **D-09:** Patrón responsive existente: **modal en desktop, drawer (`vaul`) en mobile**. Reusar el lenguaje visual de la agenda actual y los componentes shadcn/`@/components/ui` ya presentes — no introducir librería nueva.

### Claude's Discretion

- **Arquitectura del reúso del pipeline:** extraer la lógica compartida (re-validación de tenant de service/professional/location, re-check de disponibilidad por solapamiento + buffer, liberación de holds vencidos, traducción de `23505`/`23P01` → `slot_taken`) a un helper en `lib/` reusado por el endpoint público y el alta manual. La forma exacta (route handler nuevo vs. server action) la define research/planner siguiendo el patrón del repo. **Locked por roadmap:** corre con la sesión autenticada del dueño (anon key + RLS), no service role.
- **RLS de `appointments` INSERT:** verificar que las policies permiten al dueño autenticado insertar turnos en SU negocio (anon key + RLS) sin abrir escritura cross-tenant; si falta policy, la migración la agrega con `with check (business_id = ...)`.
- **Notificación al cliente:** NO se manda mail de confirmación desde el alta manual (consistente con el path público sin seña). El evento de Google Calendar se crea best-effort en `after()` si el negocio tiene sync, igual que el path público confirmado.
- **Validación de entrada:** mismo estilo defensivo del repo (parseo defensivo / Zod, errores `{ ok, error }` snake_case, status coherentes).

### Deferred Ideas (OUT OF SCOPE)

- **MANUAL-04 — Seña opcional en turno manual → diferido a v2.** El alta manual no maneja seña en Phase 1 (turno siempre `confirmed`). Actualizar Traceability de REQUIREMENTS.md para reflejar que MANUAL-04 sale de Phase 1.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MANUAL-01 | El dueño crea un turno desde el dashboard reusando el pipeline de `/api/booking/create` (validación, disponibilidad, anti-tampering de tenant, anti-doble-booking) desde su sesión autenticada, no por el flujo anónimo. | Pipeline mapeado abajo (`app/api/booking/create/route.ts:21-297`); plan = extraer la cadena reutilizable a `lib/booking-core.ts` consumida por el endpoint público (service role) y el alta autenticada (anon+RLS). RLS de `appointments` ya permite el INSERT del dueño (ver Hallazgo RLS). |
| MANUAL-02 | El dueño elige un cliente existente o carga uno nuevo (nombre + contacto), que queda asociado al turno. | Patrón de carga de `clients` por `business_id` en `app/(dashboard)/clients/page.tsx:18-32`; combobox + crear-inline + dedupe (D-04) documentado. Asociación `client_id` + copia de campos (D-05) ya existe en el insert público (`booking/create/route.ts:213-232`). |
| MANUAL-03 | El turno manual respeta la disponibilidad real del slot (cupo y, si existe, espacio compartido) igual que el booking público; no puede sobre-reservar. | Re-check de solapamiento + buffer (`booking/create/route.ts:106-134`) + respaldo atómico de constraints 011/013 (baseline `appointments_no_double_booking` y `appointments_no_overlap`). Funcionan idéntico con anon+RLS (son a nivel DB). En Phase 1 "cupo" = 1 (cupos grupales/espacio = Phase 2/3). |
| ~~MANUAL-04~~ | Seña opcional en turno manual. | **DIFERIDO a v2 (D-01).** No se investiga cobro de seña en el alta. El turno manual queda `confirmed` directo, sin `expires_at` ni `pending_payment`. |
</phase_requirements>

## Summary

Esta fase es, en gran medida, un **refactor + hardening + mejora de UI de código que YA existe**, no greenfield. El dashboard ya tiene un modal "Nuevo turno" funcionando en `app/(dashboard)/appointments/appointments-client.tsx:545-640` que inserta un turno `confirmed` por la sesión autenticada del dueño (anon key + RLS vía `lib/supabase/client`), y que ya traduce `23505`/`23P01`. El problema es que ese alta client-side **NO** corre el pipeline server-side completo: no re-valida que el service/professional/location sean del negocio (confía en el cliente), no aplica el re-check de solapamiento con buffer, no libera holds vencidos, no dispara Google Calendar y siempre inserta cliente nuevo (sin dedupe). La fase debe **mover esa lógica a un helper compartido server-side** (`lib/booking-core.ts`) que también consuma el endpoint público, y reemplazar el insert directo del cliente por una llamada a un **nuevo route handler autenticado** (`app/api/appointments/create/route.ts`).

Hallazgo crítico de RLS (verificado contra la doc de PostgreSQL y el baseline): la policy de `appointments` y de `clients` es `FOR ALL USING (business_id IN <negocios del dueño>)` **sin `WITH CHECK`**. Por la semántica de Postgres, cuando `FOR ALL` no tiene `WITH CHECK`, el `USING` se reutiliza como check de las filas nuevas. **Por lo tanto el dueño autenticado YA puede insertar turnos y clientes de SU negocio hoy, de forma tenant-safe — no hace falta una migración nueva para que el INSERT funcione.** Agregar un `WITH CHECK` explícito es una mejora de claridad/hardening (lo pide la skill de RLS), no un bloqueante funcional. El plan puede incluir una migración 040 opcional que formalice `FOR INSERT ... WITH CHECK` siguiendo el patrón ya presente de `fixed_expenses` (baseline líneas 1266-1290), pero NO es un gap que bloquee la fase.

Los constraints anti-doble-booking 011 (índice único `appointments_no_double_booking`) y 013 (exclusion constraint `appointments_no_overlap`) son a nivel de base de datos y aplican **idéntico** con anon key + RLS que con service role — son el respaldo atómico ante la carrera, independiente del rol de conexión. El alta manual reusa el mismo re-check + la misma traducción de error.

**Primary recommendation:** Extraer la cadena de validación de `booking/create` a `lib/booking-core.ts` (`createAppointmentCore({ supabase, businessId, ... })` que recibe el cliente Supabase ya construido — admin O server — para ser rol-agnóstico); crear `app/api/appointments/create/route.ts` (route handler autenticado, `createClient()` de `lib/supabase/server`, valida sesión + business por `owner_id`, llama al core, dispara GCal en `after()`); reemplazar el `handleCreate` client-side de `appointments-client.tsx` por un `fetch` a ese endpoint; agregar el combobox de clientes con dedupe; y reusar el mismo modal/drawer en Agenda. No agregar dependencias.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Validación + anti-tampering de tenant + anti-doble-booking | API / Backend (route handler `app/api/appointments/create`) | Database (constraints 011/013) | No se puede confiar en el cliente; la re-validación por `business_id` y el re-check de solapamiento son lógica server-side. Constraints DB = respaldo atómico. [VERIFIED: codebase grep] |
| Lógica de creación reutilizable (core) | lib/ (framework-agnostic) | — | `lib/booking-core.ts` consumido por endpoint público (service role) y alta manual (anon+RLS). Rol-agnóstico: recibe el cliente Supabase ya construido. [ASSUMED] (recomendación de diseño) |
| Aislamiento por tenant (lectura/escritura) | Database (RLS) | API (filtro `.eq('business_id', ...)`) | Defensa en profundidad: RLS + filtro explícito. La policy `FOR ALL USING` ya cubre INSERT del dueño. [VERIFIED: postgresql.org/docs] |
| Selección/creación de cliente + dedupe | API / Backend (dentro del core o del route handler) | Frontend (combobox UI) | El dedupe por teléfono/email debe correr server-side (autoridad), aunque la UI sugiera de forma optimista. [CITED: CONTEXT D-04] |
| Superficie UI (botón + form + click-en-slot) | Frontend Server (`page.tsx` carga datos) | Browser (`*-client.tsx` interactividad) | Patrón establecido del repo: server fetch + client component. [VERIFIED: codebase grep] |
| Evento de Google Calendar (best-effort) | API / Backend (en `after()`, service role para el token) | External (Google Calendar REST) | El `google_refresh_token` es server-only (`getBusinessSecrets`, service role). NO puede salir del browser. Debe correr en el route handler. [VERIFIED: codebase grep] |

## Standard Stack

> Esta fase NO instala dependencias nuevas. Todo el stack ya está vendoreado. Tabla informativa de lo que se reusa.

### Core (ya presente — sin instalación)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 16.2.7 | Route handlers, `after()`, App Router | Framework del repo; `after()` soportado en Route Handlers [CITED: node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md:8] |
| `@supabase/ssr` | ^0.10.3 | `createClient()` server (anon+cookies+RLS) | Cliente autenticado del dueño para el alta [VERIFIED: codebase] |
| `@supabase/supabase-js` | ^2.106.2 | Cliente Postgres/Auth | Insert/select + códigos de error PG (`23505`/`23P01`) [VERIFIED: codebase] |
| `react-hook-form` + `@hookform/resolvers` | ^7.77.0 / ^5.4.0 | Form del modal | Patrón de forms del repo (`app/(auth)/register/page.tsx`) [CITED: .claude/CLAUDE.md] |
| `zod` | ^4.4.3 | Validación de entrada (UI + body del route handler) | Estilo defensivo del repo [CITED: CONTEXT discretion] |
| `date-fns` | ^4.4.0 | Fechas/horas (zona AR fija) | Ya usado en agenda/appointments [VERIFIED: codebase] |
| `sonner` | ^2.0.7 | Toasts de éxito/error | Patrón de feedback del repo [VERIFIED: codebase] |
| `vaul` | ^1.1.2 | Drawer mobile | D-09; ya disponible (verificar componente `@/components/ui/drawer`, ver Open Questions) |

### Supporting (componentes shadcn ya vendoreados)
| Component | Purpose | When to Use |
|-----------|---------|-------------|
| `@/components/ui/dialog` | Modal desktop | `≥ 768px` (D-09) |
| `@/components/ui/drawer` | Drawer mobile (vaul) | `< 768px` (D-09) — **verificar que exista** (ver Open Questions) |
| `@/components/ui/select`, `input`, `label`, `button` | Campos del form | Reuso directo del modal actual de `appointments-client.tsx` |
| `@/components/ui/command` (combobox) | Buscador de clientes (D-03) | **verificar que exista** — si no, construir con `Input` + lista filtrada (patrón ya usado en `clients-client.tsx:476-499`) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Route handler nuevo (`app/api/appointments/create`) | Server action | Ver "Decisión: route handler vs server action" abajo — se recomienda route handler por consistencia con el repo |
| Combobox `@/components/ui/command` | `Input` + lista filtrada en memoria | Si `command` no está vendoreado, el patrón de filtrado en memoria de `clients-client.tsx` es suficiente y zero-install |

## Package Legitimacy Audit

> N/A — esta fase NO instala paquetes externos. Todas las dependencias listadas ya están en `package-lock.json` (verificado en `.claude/CLAUDE.md` Technology Stack). No se ejecuta el Package Legitimacy Gate porque no hay instalación nueva.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  DASHBOARD (dueño autenticado)                                        │
│                                                                       │
│  Agenda page          Turnos page                                     │
│  (agenda-client)      (appointments-client)                           │
│      │                     │                                          │
│      │  botón "Nuevo turno" / click en slot vacío (pre-llena         │
│      │  fecha+hora+profesional)                                       │
│      ▼                     ▼                                          │
│  ┌───────────────────────────────────────┐                          │
│  │  <NuevoTurnoForm>  (modal desktop /     │  combobox clientes       │
│  │   drawer mobile, componente compartido) │◄── (existentes + crear  │
│  │  - react-hook-form + zod                │     nuevo inline, dedupe)│
│  └───────────────────────────────────────┘                          │
│              │ fetch POST (credentials: same-origin)                  │
└──────────────┼──────────────────────────────────────────────────────┘
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  app/api/appointments/create/route.ts   (NUEVO — runtime Node)        │
│  1. createClient() de lib/supabase/server  (anon + cookies + RLS)     │
│  2. auth.getUser() → 401 si no hay sesión                             │
│  3. business por owner_id (tenant del actor, NO por slug)             │
│  4. parseo defensivo del body / zod                                   │
│  5. ── resolver/crear cliente (dedupe D-04) ──                        │
│  6. ┌─────────────────────────────────────────────┐                  │
│     │ lib/booking-core.ts                          │                  │
│     │  createAppointmentCore({ supabase, business, │                  │
│     │    serviceId, professionalId, locationId,    │                  │
│     │    date, time, clientId, clientFields })     │                  │
│     │  - re-valida service/professional/location   │                  │
│     │    por business_id (anti-tampering)          │                  │
│     │  - re-check solapamiento + buffer            │                  │
│     │  - libera holds vencidos                     │                  │
│     │  - INSERT (status='confirmed', expires=null) │                  │
│     │  - 23505/23P01 → slot_taken (409)            │                  │
│     └─────────────────────────────────────────────┘                  │
│  7. after(): GCal event si google_refresh_token (getBusinessSecrets,  │
│     service role SOLO para el token) — NO mail                        │
│  8. Response.json({ ok, appointmentId })                              │
└──────────────┬────────────────────────────────────────────────────────┘
               ▼  (mismo core, distinto caller)
┌─────────────────────────────────────────────────────────────────────┐
│  app/api/booking/create/route.ts   (PÚBLICO — ya existe)              │
│  - createAdminClient() (service role, tenant por slug)                │
│  - reCAPTCHA + seña + holds + mails  (lógica EXCLUSIVA del público)   │
│  - llama al MISMO createAppointmentCore(...)                          │
└─────────────────────────────────────────────────────────────────────┘
               │
               ▼
        ┌──────────────────────────────────────────────┐
        │ Postgres (appointments)                       │
        │  RLS: FOR ALL USING(business_id ∈ dueño)      │  ← anon+RLS path
        │  011: UNIQUE(business_id, coalesce(pro), date, time) WHERE status in (confirmed,pending_payment) │
        │  013: EXCLUDE gist overlap por (business_id, coalesce(pro), tsrange) │  ← respaldo atómico
        └──────────────────────────────────────────────┘
```

### Component Responsibilities

| Componente | Responsabilidad | Archivo |
|-----------|----------------|---------|
| Core de creación (NUEVO) | Re-validación tenant + re-check solapamiento/buffer + liberación de holds + INSERT + traducción de constraint | `lib/booking-core.ts` (nuevo) |
| Route handler autenticado (NUEVO) | Sesión + business por owner_id + dedupe cliente + llamada al core + GCal en `after()` | `app/api/appointments/create/route.ts` (nuevo) |
| Endpoint público (refactor) | reCAPTCHA + seña + mails + llamada al core | `app/api/booking/create/route.ts` (existe, se refactoriza para usar el core) |
| Form compartido (NUEVO) | Modal/drawer con combobox de cliente + campos | `components/dashboard/nuevo-turno-form.tsx` (nuevo, sugerido) |
| Agenda client (edit) | Botón "Nuevo turno" + click-en-slot pre-llenado | `app/(dashboard)/agenda/agenda-client.tsx` |
| Turnos client (edit) | Botón "Nuevo turno" (ya existe) → cambiar `handleCreate` a `fetch` al endpoint | `app/(dashboard)/appointments/appointments-client.tsx` |

### Pattern 1: Helper core rol-agnóstico (recibe el cliente Supabase ya construido)

**What:** El core NO crea su propio cliente Supabase. Lo recibe por parámetro, para servir tanto al público (service role) como al alta autenticada (anon+RLS) sin duplicar la cadena de validación.
**When to use:** Toda la cadena compartida de validación/insert de turnos.
**Firma propuesta:**
```typescript
// Source: diseño derivado de app/api/booking/create/route.ts:81-241 [ASSUMED]
import type { SupabaseClient } from '@supabase/supabase-js'

type BusinessForBooking = { id: string; buffer_minutes: number | null }

type CreateAppointmentInput = {
  supabase: SupabaseClient          // admin (público) | server/anon (manual) — rol-agnóstico
  business: BusinessForBooking      // ya resuelto por el caller (por slug o por owner_id)
  serviceId: string
  professionalId: string | null     // 'none'/null → SENTINEL bucket
  locationId: string | null
  date: string                      // 'yyyy-MM-dd'
  time: string                      // 'HH:mm'
  clientId: string | null
  clientName: string
  clientPhone: string | null
  clientEmail: string | null
  notes: string | null
  // En Phase 1 el alta manual SIEMPRE pasa requireDeposit=false → status='confirmed', expiresAt=null.
  // El público lo deja como hoy. MANUAL-04 (seña) diferido: no se agrega el branch de seña al manual.
  requireDeposit?: boolean
  depositExpiryHours?: number
}

type CreateAppointmentResult =
  | { ok: true; appointmentId: string; cancelToken: string; status: 'confirmed' | 'pending_payment'; serviceName: string; durationMinutes: number; cancelledHoldIds: string[] }
  | { ok: false; error: 'invalid_service' | 'invalid_professional' | 'slot_taken' | 'insert_failed'; status: 400 | 409 | 500 }

export async function createAppointmentCore(input: CreateAppointmentInput): Promise<CreateAppointmentResult>
```
**Qué encapsula (extraído de `booking/create/route.ts`):**
- Anti-tampering de service (`route.ts:83-91`), professional (`route.ts:94-104`), location (`route.ts:197-211`).
- Re-check de solapamiento con buffer + sentinela (`route.ts:106-134`).
- Liberación de holds vencidos (`route.ts:140-177` — devolver los ids cancelados para que el caller mande los mails en su `after()`, NO mandar mails desde el core).
- INSERT con `status`/`expires_at` (`route.ts:179-232`) + traducción `23505`/`23P01` → `slot_taken` (`route.ts:234-241`).

**Qué NO encapsula (queda en cada caller):** reCAPTCHA, gate de plan, secretos, mails, GCal. Esos son específicos del público o del manual.

### Pattern 2: Route handler autenticado (sesión del dueño)

**What:** Endpoint que corre con la cookie de sesión del dueño; resuelve el business por `owner_id` (no por slug), valida la sesión, y llama al core con el cliente anon+RLS.
**Example:**
```typescript
// Source: patrón de app/(dashboard)/clients/page.tsx:5-16 (sesión+owner) + booking/create [ASSUMED]
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getBusinessSecrets } from '@/lib/business-secrets'
import { createCalendarEvent } from '@/lib/google-calendar'
import { createAppointmentCore } from '@/lib/booking-core'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, address, buffer_minutes')
    .eq('owner_id', user.id)        // tenant del ACTOR, no por slug
    .single()
  if (!business) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })

  // ... parseo defensivo / zod del body ...
  // ... resolver/crear cliente con dedupe (D-04) — ver Pattern 3 ...

  const result = await createAppointmentCore({
    supabase, business, serviceId, professionalId, locationId,
    date, time, clientId, clientName, clientPhone, clientEmail, notes,
    requireDeposit: false,          // D-01: manual SIEMPRE confirmed
  })
  if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: result.status })

  // GCal best-effort: el token es server-only (service role) — NO mail (D-01).
  const secrets = await getBusinessSecrets(business.id)
  if (secrets.google_refresh_token) {
    const refresh = secrets.google_refresh_token
    const apptId = result.appointmentId
    after(async () => {
      try {
        const eventId = await createCalendarEvent(refresh, { /* summary, date, time, durationMinutes... */ })
        if (eventId) await supabase.from('appointments').update({ google_event_id: eventId }).eq('id', apptId)
      } catch (e) { console.error(`[appointments/create] gcal FALLÓ (${apptId}):`, e instanceof Error ? e.message : e) }
    })
  }
  return Response.json({ ok: true, appointmentId: result.appointmentId })
}
```

### Pattern 3: Selección/creación de cliente con dedupe (D-04)

**What:** El cliente puede venir como `clientId` (existente) o como datos nuevos. Si es nuevo, el server busca por teléfono normalizado / email dentro del `business_id` antes de insertar.
**Contraste con el público:** `booking/create/route.ts:188-192` SIEMPRE inserta un cliente nuevo — eso NO se toca.
**Patrón de dedupe (ya hay precedente de detección en `clients-client.tsx:176-191`):**
```typescript
// Normalización: teléfono = solo dígitos; email = lowercase. (mismo criterio que clients-client.tsx:180-181)
// Server-side: si el form mandó clientId, usarlo tal cual. Si mandó datos nuevos, buscar match por
// (business_id + phone normalizado) o (business_id + email lowercase) → si existe, reusar ese id.
```
**UI (D-03):** combobox que filtra `initialClients` en memoria (ya cargados por `business_id`) + "Crear nuevo cliente" inline. La sugerencia de dedupe puede mostrarse en la UI (optimista) y confirmarse en el server (autoridad).

### Anti-Patterns to Avoid

- **Insertar el turno directo desde el browser sin el core (estado actual de `appointments-client.tsx:288-330`):** salta el anti-tampering de service/professional/location, el re-check con buffer, la liberación de holds y el GCal. Es el bug que esta fase corrige. NO replicar ese patrón en Agenda.
- **Usar `createAdminClient()` (service role) en el alta manual:** rompe el principio "el actor es el dueño autenticado" (locked por roadmap). El service role solo va en el caller público. Excepción acotada: leer `google_refresh_token` vía `getBusinessSecrets` (server-only) en el `after()` — eso es lectura de un secreto del propio tenant ya resuelto, no escritura de datos de turno.
- **Confiar en `duration_minutes` o `business_id` que vengan del cliente:** la duración sale del service re-validado server-side (`booking/create/route.ts:112`); el `business_id` sale del business resuelto por `owner_id`.
- **Mandar mail de confirmación desde el alta manual:** D-01 lo prohíbe (consistente con el público sin seña, que tampoco manda).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Anti-doble-booking atómico | Un `count` + insert | Constraints 011 (`appointments_no_double_booking`) + 013 (`appointments_no_overlap`) ya en la DB | Son la única defensa real ante la carrera; el re-check en JS es solo UX [VERIFIED: baseline:797,648] |
| Re-check de solapamiento con buffer | Reescribir el cálculo | Extraer `overlaps()` + bucket por sentinela de `booking/create/route.ts:106-134` al core | Ya está probado en producción y alineado con la constraint 013 |
| Traducción de error de turno tomado | `try/catch` genérico | Mapeo `23505`/`23P01` → `slot_taken` (409) (`route.ts:234-241`) | Patrón establecido; ya replicado en `appointments-client.tsx:320-323` |
| Lectura del token de Google | Exponer el token al cliente | `getBusinessSecrets(businessId)` server-only | El token nunca debe salir del server (migración 027/028) [VERIFIED: lib/business-secrets.ts] |
| Side-effect que no debe bloquear la respuesta | `await` inline antes del return | `after()` de `next/server` | Soportado en Route Handlers en Next 16 [CITED: next docs after.md:8] |

**Key insight:** El 80% de esta fase es **mover** lógica existente y probada a un lugar compartido, no escribir lógica nueva. El riesgo principal es la regresión en el endpoint público al refactorizarlo para usar el core — la suite Vitest (TEST-01) debe seguir verde.

## Runtime State Inventory

> No es una fase de rename/refactor de strings ni migración de datos. Es una fase de feature (alta autenticada) + refactor de código. No aplica el inventario de estado runtime (no hay strings renombrados, ni datos almacenados que cambien de clave, ni servicios externos a re-registrar).

**Stored data:** None — no se renombra ninguna columna/clave; el turno manual escribe `appointments`/`clients` con el mismo esquema actual.
**Live service config:** None — no cambia config de servicios externos.
**OS-registered state:** None.
**Secrets/env vars:** None nuevos — `google_refresh_token` ya existe en `business_secrets`; no se agrega secreto.
**Build artifacts:** None.

## Common Pitfalls

### Pitfall 1: Asumir que falta una policy RLS de INSERT (gap fantasma)
**What goes wrong:** Se planifica una migración 040 "obligatoria" para permitir el INSERT del dueño, cuando el INSERT ya funciona.
**Why it happens:** La policy es `FOR ALL USING(...)` sin `WITH CHECK` visible; a primera vista parece que no cubre INSERT.
**How to avoid:** Postgres reusa el `USING` como check cuando `FOR ALL` no tiene `WITH CHECK` (verificado abajo). El INSERT del dueño de SU negocio ya pasa. La migración de `WITH CHECK` explícito es **hardening opcional**, no bloqueante. Confirmar con un test local (`supabase db reset` + insert como usuario autenticado de otro negocio → debe fallar).
**Warning signs:** El plan marca la migración como dependencia dura de MANUAL-01.

### Pitfall 2: Regresión en el endpoint público al extraer el core
**What goes wrong:** Al mover la cadena a `lib/booking-core.ts`, se rompe un caso del flujo con seña (holds, `expires_at`, mails).
**Why it happens:** El público tiene branches (seña/no-seña, liberación de holds con mails) que NO deben migrar al core.
**How to avoid:** El core devuelve los `cancelledHoldIds`; los mails de holds vencidos quedan en el `after()` del **caller público** (no del core). Correr la suite Vitest TEST-01 (aislamiento + webhooks) antes de cerrar.
**Warning signs:** El core importa `lib/email` o `lib/recaptcha` — señal de que migró lógica que no le corresponde.

### Pitfall 3: El click-en-slot de la Agenda no tiene una grilla de slots real
**What goes wrong:** Se asume que `agenda-client.tsx` tiene una grilla de horarios clickeable con slots vacíos; no la tiene.
**Why it happens:** La "Agenda" actual es un **editor de horario semanal + resumen de la semana** (`agenda-client.tsx:412-449` es un grid de 7 días con chips de turnos, sin filas de hora). No hay celdas hora×día vacías.
**How to avoid:** D-08 ("click en slot vacío pre-llena fecha/hora") requiere o bien (a) construir una vista de grilla día/semana con filas horarias (trabajo nuevo de UI no trivial), o (b) reinterpretar "slot" como "click en un día del resumen semanal pre-llena la fecha" (alcance menor). **Esto necesita decisión en planning** (ver Open Questions). El botón "Nuevo turno" sí es directo.
**Warning signs:** El plan asume reuso de una grilla horaria que no existe.

### Pitfall 4: `force-dynamic` / refresco de datos tras crear
**What goes wrong:** El turno creado no aparece en la lista sin recargar.
**Why it happens:** Los datos se cargan en el server component; tras el `fetch` al endpoint hay que refrescar.
**How to avoid:** Patrón del repo: `router.refresh()` tras éxito (usado en `agenda-client.tsx:85,97`), o actualizar el estado local optimista (como hace hoy `appointments-client.tsx:326`). El UI-SPEC ya especifica `router.refresh()` + cierre del modal.

## Code Examples

### Re-check de solapamiento con buffer (a extraer al core)
```typescript
// Source: app/api/booking/create/route.ts:108-134 [VERIFIED: codebase]
const SENTINEL = '00000000-0000-0000-0000-000000000000'
const bucket = proId ?? SENTINEL
const buffer = Number(business.buffer_minutes) || 0
const reqStart = timeToMinutes(time)
const reqEnd = reqStart + Number(service.duration_minutes || 30)
const { data: clashes } = await supabase
  .from('appointments')
  .select('id, status, expires_at, professional_id, time, duration_minutes')
  .eq('business_id', business.id)
  .eq('date', date)
  .in('status', ['confirmed', 'pending_payment'])
const overlaps = (a) => {
  const aStart = timeToMinutes(a.time)
  const aEnd = aStart + Number(a.duration_minutes || 30)
  return reqStart < aEnd + buffer && reqEnd > aStart - buffer
}
const sameBucket = (clashes || []).filter(a => (a.professional_id ?? SENTINEL) === bucket && overlaps(a))
const taken = sameBucket.some(a => a.status === 'confirmed' || a.expires_at == null || new Date(a.expires_at).getTime() > Date.now())
if (taken) return /* slot_taken 409 */
```

### Insert + traducción atómica de constraint (a extraer al core)
```typescript
// Source: app/api/booking/create/route.ts:213-241 [VERIFIED: codebase]
const { data: appt, error: insertErr } = await supabase
  .from('appointments')
  .insert({ business_id: business.id, client_id, client_name, /* ... */, status: 'confirmed', expires_at: null })
  .select('id, cancel_token')
  .single()
if (insertErr || !appt) {
  if (insertErr?.code === '23505' || insertErr?.code === '23P01') return /* slot_taken 409 */
  return /* insert_failed 500 */
}
```

### Insert autenticado vía RLS (precedente ya en producción)
```typescript
// Source: app/(dashboard)/appointments/appointments-client.tsx:299-323 [VERIFIED: codebase]
// El alta client-side YA inserta confirmed vía anon+RLS y traduce 23505/23P01. Esta fase MUEVE
// esta lógica al server (core) para sumar anti-tampering + buffer + holds + GCal + dedupe.
const { data: appt, error } = await supabase.from('appointments').insert({ /* ... */, status: 'confirmed' }).select(...).single()
if (error?.code === '23505' || error?.code === '23P01') toast.error('Ese horario se solapa...')
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Alta de turno client-side directo (anon+RLS, sin pipeline) | Alta vía route handler autenticado que reusa el core server-side | Esta fase | Suma anti-tampering, buffer, holds, GCal, dedupe; cierra el gap de validación del alta actual |
| Lógica de validación duplicada (público en route, manual en client) | Core compartido en `lib/booking-core.ts` | Esta fase | Una sola fuente de verdad; prepara el terreno para Phase 2 (cupos) que tocará el mismo core |

**Deprecated/outdated:**
- El `handleCreate` client-side de `appointments-client.tsx:288-330` queda reemplazado por un `fetch` al nuevo endpoint. No borrar el modal — se reusa la UI, se cambia el submit.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | El componente `@/components/ui/drawer` (vaul) está vendoreado | Standard Stack | Si no existe, hay que agregarlo vía shadcn (zero-install, `vaul` ya está en deps) — verificar antes de planear |
| A2 | El componente `@/components/ui/command` (combobox) está vendoreado | Standard Stack | Si no existe, usar `Input` + lista filtrada en memoria (patrón `clients-client.tsx`) — sin bloqueo |
| A3 | La firma propuesta de `createAppointmentCore` (rol-agnóstico, recibe el cliente) | Architecture Pattern 1 | Es una recomendación de diseño; el planner puede ajustar la firma. El principio (core compartido sin crear su cliente) es lo load-bearing |
| A4 | Migración 040 de `WITH CHECK` explícito es opcional (hardening), no funcional | Summary / Pitfall 1 | Verificado contra doc PG y baseline; bajo riesgo. Confirmar con test local antes de descartarla del plan |
| A5 | La firma de `createCalendarEvent(refresh, {...})` se reusa igual que en el público | Pattern 2 | Verificada la llamada en `booking/create/route.ts:252-259`; no se leyó la implementación interna de `lib/google-calendar.ts` (no necesario para planear) |

## Open Questions

1. **D-08 "click en slot vacío" sin grilla horaria en la Agenda.**
   - What we know: La Agenda actual (`agenda-client.tsx`) es editor de horario + resumen semanal de 7 días con chips; NO tiene grilla hora×día con celdas vacías clickeables. `appointments-client.tsx` tampoco (es tabla/tarjetas).
   - What's unclear: Si D-08 exige construir una vista de grilla horaria nueva (UI sustancial) o si alcanza con "click en un día → pre-llena fecha" + el botón "Nuevo turno".
   - Recommendation: Llevar a planning como decisión de alcance. El UI-SPEC (`01-UI-SPEC.md:23,132`) ya contempla el click-en-slot con `hover:border-primary` como si la grilla existiera — el planner debe decidir si se construye la grilla o se reinterpreta "slot". Recomendación: empezar por el botón + pre-llenado por día (alcance acotado), y dejar la grilla horaria como mejora opcional.

2. **`@/components/ui/drawer` y `@/components/ui/command` vendoreados.**
   - What we know: `vaul` está en deps; el repo usa `Dialog` en todos lados pero no se confirmó un `Drawer` o `Command` ya en `components/ui/`.
   - What's unclear: Si esos dos componentes ya existen como archivos.
   - Recommendation: El planner verifica con un `ls components/ui/`. Si faltan, agregarlos vía shadcn (zero-install). Fallback de `command`: `Input` + lista filtrada (ya probado en `clients-client.tsx`).

3. **Migración 040 (`WITH CHECK` explícito): ¿se incluye?**
   - What we know: Funcionalmente no hace falta (el `FOR ALL USING` ya cubre el INSERT). La skill de RLS recomienda `WITH CHECK` explícito en INSERT/UPDATE.
   - Recommendation: Incluir como tarea de hardening opcional siguiendo el patrón `fixed_expenses` (baseline:1266-1290), o documentar la decisión de no hacerla. No bloquea MANUAL-01.

## Environment Availability

> El alta manual no agrega dependencias externas nuevas. Google Calendar es opcional (best-effort, solo si el negocio tiene sync). No hay tooling externo que probar.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase (Postgres + Auth) | Todo el alta | ✓ (local CLI configurado, ver MEMORY) | PG17 local / prod | — |
| Google Calendar API | GCal event (best-effort) | Opcional por negocio | — | Si no hay `google_refresh_token`, se saltea (igual que el público) |
| Vitest | Suite TEST-01 (no-regresión) | ✓ | — | — |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** Google Calendar (best-effort, degrada sin sync)

## Validation Architecture

> `workflow.nyquist_validation` no está explícitamente en `false` (no se encontró config que lo desactive); el repo tiene Vitest (suite de 283 tests al cierre de v0.11). Se incluye la sección.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (suite existente, molde TEST-01 de v0.9: aislamiento anon-key + webhooks) |
| Config file | (verificar `vitest.config.*` en raíz — la suite ya corre en CI con `tsc --noEmit`) |
| Quick run command | `npm run test` (verificar script exacto en `package.json`) |
| Full suite command | `npm run test` (283/283 verde al cierre de v0.11) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MANUAL-01 | El alta autenticada crea un turno `confirmed` reusando el core | unit/integration | `npm run test` (test nuevo del core) | ❌ Wave 0 |
| MANUAL-03 | El alta manual rechaza colisión con `slot_taken` (409) — anti-doble-booking | unit/integration | `npm run test` (test del core: overlap + 23505/23P01) | ❌ Wave 0 |
| MANUAL-03 | No-regresión: el endpoint público sigue rechazando doble-booking tras el refactor al core | integration | `npm run test` (TEST-01 existente debe seguir verde) | ✅ (existe) |
| MANUAL-02 | Dedupe: cliente nuevo con teléfono/email existente reusa el cliente | unit | `npm run test` (test del dedupe server-side) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test` (suite rápida) + `tsc --noEmit`
- **Per wave merge:** suite completa Vitest
- **Phase gate:** suite verde antes de `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Test del core `createAppointmentCore` (overlap, buffer, anti-tampering, 23505/23P01 → slot_taken) — cubre MANUAL-01/03
- [ ] Test de no-regresión del endpoint público tras usar el core (reusar/extender TEST-01)
- [ ] Test del dedupe de cliente (D-04) — cubre MANUAL-02

## Security Domain

> `security_enforcement` no está en `false`; el aislamiento por tenant es el core value del proyecto. Sección incluida.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | Defensa en profundidad: RLS + filtro `.eq('business_id', ...)` (skill supabase-multitenant-rls) |
| V2 Authentication | yes | `supabase.auth.getUser()` en el route handler → 401 sin sesión (patrón `page.tsx` del dashboard) |
| V3 Session Management | yes | Cookies de sesión Supabase (`@supabase/ssr`); `fetch` con `credentials: 'same-origin'` (patrón `appointments-client.tsx:228`) |
| V4 Access Control | yes | Business resuelto por `owner_id` (no por slug); RLS `FOR ALL USING(business_id ∈ dueño)`; anti-tampering re-valida service/professional/location por `business_id` |
| V5 Input Validation | yes | Parseo defensivo del body / zod; nunca confiar en `duration_minutes`/`business_id` del cliente |
| V6 Cryptography | no | No se maneja material criptográfico nuevo (el `google_refresh_token` ya está protegido server-only) |

### Known Threat Patterns for Next.js 16 + Supabase RLS

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-tenant write (insertar turno en negocio ajeno) | Tampering / Elevation | Business por `owner_id` + RLS `WITH CHECK` (vía `USING` reusado) + filtro explícito por `business_id` |
| ID tampering (service/professional/location de otro negocio) | Tampering | Re-validación `.eq('business_id', business.id)` antes de usar cada ID (`booking/create/route.ts:83-104,197-211`) |
| Service-role leak al cliente | Information Disclosure | El alta manual NO usa service role; el token de Google se lee server-only en `after()` |
| Doble-booking por carrera concurrente | Tampering | Constraints 011/013 (respaldo atómico DB), idénticos con anon+RLS |
| Falta de auth en el endpoint | Spoofing / Elevation | `auth.getUser()` → 401; el proxy (`proxy.ts`) ya cubre `/api/*` con refresh de sesión |

## Sources

### Primary (HIGH confidence)
- `app/api/booking/create/route.ts:1-297` — pipeline público completo (anti-tampering, re-check, holds, insert, traducción de error, GCal en `after()`).
- `app/api/booking/availability/route.ts:1-60` — cálculo de disponibilidad + sentinela + estados ocupantes.
- `supabase/migrations/00000000000000_baseline.sql` — tablas `appointments`(81-106)/`clients`(214-227); constraints 013 `appointments_no_overlap`(648), PK; índices 011 `appointments_no_double_booking`(797); policies `business member access` sobre appointments(1203) y clients(1215) `FOR ALL USING(...)` sin `WITH CHECK`; ejemplo `fixed_expenses` con `FOR INSERT WITH CHECK`(1272).
- `app/(dashboard)/appointments/appointments-client.tsx:288-330,545-640` — modal "Nuevo turno" YA existente (insert confirmed vía anon+RLS, traducción 23505/23P01).
- `app/(dashboard)/agenda/agenda-client.tsx:412-449` — resumen semanal (NO grilla horaria) + escrituras autenticadas vía anon+RLS (`time_blocks`, `schedule_exceptions`).
- `app/(dashboard)/clients/page.tsx:18-32` + `clients-client.tsx:176-191,294-310` — carga de clients por `business_id`, detección de duplicados, escrituras autenticadas.
- `lib/business-secrets.ts:1-45` — `getBusinessSecrets` server-only (service role) para el token de Google.
- PostgreSQL docs (CREATE POLICY) — `FOR ALL` sin `WITH CHECK` reusa `USING` como check de filas nuevas (INSERT/UPDATE).
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md:8` — `after()` soportado en Route Handlers (Next 16).

### Secondary (MEDIUM confidence)
- `.claude/skills/supabase-multitenant-rls/SKILL.md` — reglas de RLS (defensa en profundidad, `WITH CHECK` en INSERT/UPDATE, service role solo server).
- `01-UI-SPEC.md` (ya aprobado) — contrato visual del form modal/drawer + combobox.
- `app/api/cron/cancel-expired/route.ts` — patrón de liberación de holds vencidos + `after()` best-effort.

### Tertiary (LOW confidence)
- Existencia de `@/components/ui/drawer` y `@/components/ui/command` — no confirmada en esta sesión (Open Questions 2).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — todo verificado en `.claude/CLAUDE.md` y `package-lock.json`; zero-install.
- Architecture (reúso del core): HIGH — pipeline público leído end-to-end; diseño del core derivado directamente de él.
- RLS / anti-doble-booking: HIGH — constraints y policies leídas en el baseline; semántica de `WITH CHECK` verificada contra la doc oficial de PostgreSQL.
- UI (click-en-slot): MEDIUM — la Agenda no tiene grilla horaria; D-08 necesita decisión de alcance en planning.
- Pitfalls: HIGH — derivados del código real.

**Research date:** 2026-06-26
**Valid until:** 2026-07-26 (stack estable; revalidar si cambia el baseline de migraciones o el pipeline de booking)
