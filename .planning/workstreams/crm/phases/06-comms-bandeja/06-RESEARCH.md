# Phase 6: Comms (Bandeja) - Research

**Researched:** 2026-06-24
**Domain:** Bandeja unificada WhatsApp en el CRM super-admin — tablas canónicas `conversations`/`messages`, endpoint de ingest autenticado por token, RLS mixta (business-scoped + admin override), takeover state, `GET /api/agent/context`.
**Confidence:** HIGH (todo el patrón está grounded en código del repo + el HANDOFF del bot; no hay dependencias externas nuevas).

## Summary

Phase 6 construye **todo el lado Forjo** de una bandeja de WhatsApp lista para que el bot externo (`whatsapp-ai-agent-kit`, otro repo, Baileys en VPS) sincronice. Nada nuevo se instala: el stack ya tiene todo (Next 16 RSC, Supabase service-role + session client, shadcn, lucide, sonner). El trabajo es 4 piezas: (1) migración `038` con `conversations`/`messages` + RLS mixta; (2) endpoint de **ingest** (`POST` del bot, auth por `FORJO_AGENT_TOKEN`, resuelve negocio por slug, escribe con service-role, idempotente por id externo del mensaje) — espejo casi exacto del webhook de pago `app/api/payment/webhook/[slug]/route.ts:12-56`; (3) `GET /api/agent/context?slug=` (read-only, service-role, `force-dynamic`) — espejo de `app/api/booking/availability/route.ts`; (4) la UI `/admin/bandeja` (lista + thread + estados + takeover, composer deshabilitado) — patrón session-client RLS-gated de `app/(crm)/admin/auditoria/`.

La pieza de seguridad **load-bearing** es la RLS **mixta** de `conversations`/`messages`: es nueva en el repo. Hasta ahora el CRM era admin-only (migración 034: solo policy de SELECT con `is_admin` del JWT) y el dashboard era business-scoped (`business_id IN (select id from businesses where owner_id = auth.uid())`). Phase 6 necesita **las dos en OR**: el dueño ve SOLO su `business_id` (base del add-on "Mensajes" de gestion-rebrand) Y el operador `is_admin` ve todas. PostgreSQL combina policies permissive con OR, así que se expresan como dos policies de SELECT sobre la misma tabla, o una policy con la condición compuesta. La escritura sigue siendo exclusiva del service-role (sin policy de insert/update para usuarios) — el ingest del bot escribe vía `createAdminClient()` tras validar slug→`business_id`, y el takeover lo hace una server action con `createAdminClient()` + `logAudit`.

**Primary recommendation:** Migración `038_crm_conversations_messages.sql` (2 tablas + RLS mixta + índice único `(business_id, external_id)` para idempotencia) → ingest `POST /api/agent/inbox` (token + slug→business, upsert idempotente) → `GET /api/agent/context` → server action `takeConversation` (audited) + endpoint de lectura de estado para el bot → UI `/admin/bandeja` (RSC server + client, composer disabled, habilitar item sidebar). Mail (COMMS-03) y envío manual saliente quedan FUERA.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Phase 6 = bandeja WhatsApp **únicamente**. Mail two-way (COMMS-03) **diferido entero a v2**; sin tab "Email" en v1.
- **D-02:** Forjo-side completo, listo para el bot: tablas `conversations`/`messages` + endpoint de **ingest** (POST del bot) + `GET /api/agent/context` (nuevo) + UI de bandeja. La sync real del bot se configura después (otro repo).
- **D-05:** Contrato de ingest: el bot hace **POST** a un endpoint Forjo autenticado con **`FORJO_AGENT_TOKEN`** (header), Forjo **valida slug→negocio** y escribe en `conversations`/`messages`. El bot NO recibe credenciales de Supabase. La sync es **OPCIONAL** (toggle del bot); SQLite es source of truth del bot, Supabase es destino. **Idempotencia por id de mensaje del bot** (evitar duplicar en reintentos).
- **D-06:** `GET /api/agent/context?slug=<slug>` (read-only, service-role por slug, `force-dynamic`) — NUEVO. Devuelve lo mismo que la página pública: name/slug/address/mapsUrl/**bookingUrl** + services + hours + notes. El bot lo lee cada ~10 min.
- **D-03:** "Tomar conversación" setea estado IA→Humano (`conversations.handled_by` = `human`/`ai`/`unassigned`) y lo **expone para que el bot lo lea y pause**. Envío manual saliente **DIFERIDO** (composer "próximamente"). La acción de tomar queda **auditada** (`logAudit`).
- **D-04:** `conversations`/`messages` son **tablas canónicas** (migración nueva). RLS **business-scoped** (dueño ve SOLO su `business_id`, vía `businesses.owner_id`) **+ override admin** (`is_admin` JWT ve todas). Estados: `unassigned`/`ai`/`human`. Asociación a lead/negocio **por teléfono/email** (match contra `leads`/`businesses`); sin match = "Sin asignar". gestion-rebrand (add-on Mensajes del dueño) **reusa estas tablas**, no crea otras. El ingest escribe vía service-role tras validar slug→`business_id`.

### Claude's Discretion

- Schema exacto de `conversations`/`messages` (columnas, índices, id externo del bot para idempotencia).
- Forma del endpoint de ingest (shape del payload del bot) — alinear con el HANDOFF del agent kit.
- Estructura de componentes de la bandeja (lista/thread/composer-disabled).

### Deferred Ideas (OUT OF SCOPE)

- **Mail two-way completo (COMMS-03)** → v2 (requiere infra de inbound = costo + DNS/MX). NO tab "Email" en v1.
- **Envío manual saliente por WhatsApp** (Forjo→bot `send`) → slice de integración bot↔Forjo; requiere endpoints NUEVOS en el repo del bot.
- **Refactor multi-tenant del bot** (single-tenant → N) → repo del bot.
- **Sync real del bot configurada** (toggle + `FORJO_AGENT_TOKEN` en producción) → operativo, otro repo.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COMMS-01 | Bandeja unificada con conversaciones WhatsApp del agente, asociadas a lead/negocio | Schema `conversations`/`messages` (§Schema), ingest endpoint (§Ingest), asociación por phone/email contra `leads`/`businesses` (§Asociación), UI lista+thread (§UI) |
| COMMS-02 | Estado por conversación (IA/Vos/Sin asignar) + "tomar" pausa al agente | `conversations.handled_by` (`unassigned`/`ai`/`human`), server action `takeConversation` audited, endpoint que el bot lee para pausar (§Takeover) |
| COMMS-03 | Mail two-way | **DIFERIDO a v2** (D-01). No se implementa en Phase 6 — fuera de scope. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Recibir mensajes del bot (ingest) | API / Backend (route handler, service-role) | DB | El bot no tiene sesión Supabase; auth por token compartido + escritura service-role tras validar slug→tenant (espejo del webhook de pago). |
| Servir contexto al bot (`/api/agent/context`) | API / Backend (route handler, service-role) | DB | Read-only por slug, equivalente a la página pública; sin sesión. `force-dynamic`. |
| Aislamiento de conversaciones | DB (RLS mixta) | API (filtro `business_id`) | Defensa en profundidad: RLS business-scoped + admin override; la red de seguridad vive en la base. |
| Render de la bandeja del operador | Frontend Server (RSC) | Frontend Client (interactividad) | `page.tsx` lee con session client (RLS gatea), `*-client.tsx` para filtros/selección. Patrón auditoría. |
| Takeover ("tomar conversación") | API / Backend (server action, service-role) | DB + Audit | Mutación auditada; el bot lee el estado resultante para pausar. |
| Estado para el bot (polling de takeover) | API / Backend (route handler, service-role) | DB | El bot consulta un endpoint por slug+phone para saber si debe pausar. |

## Standard Stack

**No se instala nada nuevo.** Todo el stack ya está presente y verificado en `package.json` / `.claude/CLAUDE.md`. La fase es cero-install (alineado con la preferencia del proyecto).

### Core (ya en el repo)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 16.2.7 | App Router, route handlers, RSC, `after()` | Framework del repo. `proxy.ts` (NO `middleware.ts`). [VERIFIED: .claude/CLAUDE.md] |
| `@supabase/supabase-js` | ^2.106.2 | service-role client (`createAdminClient`) para ingest/context/takeover | Patrón establecido (admin.ts:3) [VERIFIED: lib/supabase/admin.ts] |
| `@supabase/ssr` | ^0.10.3 | session client (`createClient`) para lectura RLS-gated de la bandeja | Patrón auditoría (auditoria/page.tsx:21) [VERIFIED] |
| `zod` | ^4.4.3 | validar el payload del ingest (defensivo, no confiar en el bot) | Convención del proyecto [VERIFIED: .claude/CLAUDE.md] |
| `lucide-react` | ^1.17.0 | iconos (`Inbox` ya importado en sidebar) | iconLibrary del proyecto [VERIFIED: crm-sidebar.tsx:11] |
| `sonner` | ^2.0.7 | toasts del takeover | Convención [VERIFIED] |

### Supporting (ya en el repo)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| componentes `@/components/ui/*` | shadcn ^4.10.0 | Table/Tabs/Input/Button/Badge para la bandeja | Reusar los mismos que auditoria-client (auditoria-client.tsx:5-16) |
| `@/components/crm/*` | — | RiskBadge / StatusBadge / topbar / toaster del CRM | Patrón de badges de estado existente |
| `date-fns` + AR_TZ | ^4.4.0 | formato de timestamps en hora Argentina | Helper `formatWhen` ya existe en auditoria-client.tsx:38 (mirror it) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Polling del bot para takeover state | Realtime / webhook Forjo→bot | Diferido (D-03): requiere endpoint nuevo en el repo del bot. El polling (el bot YA hace polling de `/api/agent/context` cada 10 min) es el camino de menor fricción. |
| `upsert` con onConflict | check-then-insert | `upsert` es atómico y maneja el reintento del bot sin race; check-then-insert tiene ventana de carrera. Usar upsert. |

**Installation:** Ninguna. `npm install` no se ejecuta en esta fase.

## Package Legitimacy Audit

> **No aplica.** Phase 6 no instala paquetes externos. Todo el stack ya está en `package.json` y verificado contra `.claude/CLAUDE.md`. Sin SLOP/SUS posible — cero dependencias nuevas.

## Architecture Patterns

### System Architecture Diagram

```
  ┌─────────────────────────────┐         ┌──────────────────────────────────────────┐
  │  Bot WhatsApp (otro repo)    │         │              forjo-app (Vercel)            │
  │  Baileys · VPS · SQLite (SoT)│         │                                            │
  │                              │         │  ── API tier (Node, service-role) ──       │
  │  cada ~10 min ──────────────GET────────▶ GET /api/agent/context?slug=               │
  │   (arma su prompt)          │  Bearer │   slug→businesses → {business,services,     │
  │                              │  token  │   hours,notes}  (force-dynamic, read-only)  │
  │                              │         │                                            │
  │  por mensaje (toggle opc.) ─POST───────▶ POST /api/agent/inbox                       │
  │   {slug, external_id,       │  Bearer │   1. auth FORJO_AGENT_TOKEN (fail-closed)   │
  │    contact{phone,email,name}│  token  │   2. slug→business_id                       │
  │    direction, body, sender, │         │   3. upsert conversation (by phone)         │
  │    sent_at}                 │         │   4. upsert message (onConflict external_id)│
  │                            ◀─polling───┐  ── all via createAdminClient() ──         │
  │  ¿pausar? lee handled_by ───GET────────▶ GET /api/agent/inbox/state?slug=&phone=    │
  │   (si =human → Modo Humano) │  token  │   → {handled_by}                            │
  └─────────────────────────────┘         │                                            │
                                          │  ── DB tier (Postgres + RLS mixta) ──       │
                                          │   conversations / messages                  │
                                          │   RLS: owner(business_id) OR is_admin       │
                                          │                                            │
                                          │  ── App tier (RSC) ──                       │
   ┌────────────┐  session client        │   /admin/bandeja  page.tsx (RLS-gated read) │
   │  Operador  │◀──RLS (admin override)──┤    └ bandeja-client.tsx (lista+thread+      │
   │  (is_admin)│   server action         │       filtros, composer DISABLED)           │
   │            │──"Tomar conversación"──▶│    server action takeConversation()         │
   └────────────┘                         │     → createAdminClient update handled_by   │
                                          │     → logAudit (audited)                    │
   ┌────────────┐  session client        │                                            │
   │  Dueño     │◀──RLS (business_id)─────┤   (gestion-rebrand add-on "Mensajes":       │
   │  (owner)   │   ve SOLO su negocio    │    REUSA estas tablas, otra fase)           │
   └────────────┘                         └──────────────────────────────────────────┘
```

### Recommended Project Structure
```
app/
├── api/
│   └── agent/
│       ├── context/route.ts          # GET (D-06) — read-only, service-role, force-dynamic
│       └── inbox/
│           ├── route.ts              # POST ingest (D-05) — token + slug→business + upsert idempotente
│           └── state/route.ts        # GET (D-03) — el bot lee handled_by por slug+phone para pausar
├── (crm)/
│   └── admin/
│       └── bandeja/
│           ├── page.tsx              # RSC: session client lee conversations (RLS-gated)
│           ├── bandeja-client.tsx    # lista + thread + filtros + "Tomar" + composer disabled
│           └── actions.ts            # 'use server' takeConversation() + releaseConversation()
lib/
└── conversations.ts                  # helpers: matchEntity(phone,email), normalizeContact, upsert logic
supabase/
└── migrations/
    └── 038_crm_conversations_messages.sql   # 2 tablas + RLS mixta + índices
```

### Pattern 1: Ingest endpoint (espejo del webhook de pago)
**What:** El bot POSTea mensajes; Forjo autentica por token, resuelve tenant por slug, escribe con service-role, idempotente por id externo.
**When to use:** Cualquier escritura desde un caller externo sin sesión Supabase.
**Example:**
```typescript
// app/api/agent/inbox/route.ts
// Source: espejo de app/api/payment/webhook/[slug]/route.ts:12-56 (auth-first, slug→tenant, service-role)
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic' // nunca cachear, igual que availability/route.ts:6

// Auth FAIL-CLOSED: secreto ausente → 401 (igual que verifyMPSignature, NO fail-open).
function authOk(request: NextRequest): boolean {
  const expected = process.env.FORJO_AGENT_TOKEN
  if (!expected) return false                       // sin secreto configurado → rechazo
  const got = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return Boolean(got) && got === expected
}

// Parseo defensivo del shape del bot (no confiar en el cliente — convención CLAUDE.md).
const inboundSchema = z.object({
  slug: z.string().min(1),
  external_id: z.string().min(1),                   // id del mensaje en el bot → idempotencia
  contact: z.object({
    phone: z.string().min(1),
    name: z.string().nullish(),
    email: z.string().nullish(),
  }),
  direction: z.enum(['inbound', 'outbound']),       // entrante (cliente) / saliente (bot/IA)
  body: z.string(),
  sender: z.enum(['contact', 'ai', 'human']).default('contact'),
  sent_at: z.string().datetime().nullish(),
})

export async function POST(request: NextRequest) {
  if (!authOk(request)) return new Response('Unauthorized', { status: 401 })

  let raw: unknown
  try { raw = await request.json() } catch { return Response.json({ ok: false, error: 'bad_request' }, { status: 400 }) }
  const parsed = inboundSchema.safeParse(raw)
  if (!parsed.success) return Response.json({ ok: false, error: 'missing_fields' }, { status: 400 })
  const msg = parsed.data

  const supabase = createAdminClient()

  // slug→business_id (anti-tampering de tenant: el tenant NUNCA sale del body, sale del slug validado)
  const { data: business } = await supabase.from('businesses').select('id').eq('slug', msg.slug).single()
  if (!business) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })

  // upsert conversation por (business_id, contact_phone) → idempotente, sin race (no check-then-insert)
  const { data: convo, error: convoErr } = await supabase
    .from('conversations')
    .upsert(
      { business_id: business.id, channel: 'whatsapp', contact_phone: msg.contact.phone,
        contact_name: msg.contact.name ?? null, last_message_at: msg.sent_at ?? new Date().toISOString() },
      { onConflict: 'business_id,channel,contact_phone' }
    )
    .select('id')
    .single()
  if (convoErr || !convo) return Response.json({ ok: false, error: 'insert_failed' }, { status: 500 })

  // upsert message idempotente por external_id (reintento del bot → 23505 tratado como éxito)
  const { error: msgErr } = await supabase
    .from('messages')
    .upsert(
      { conversation_id: convo.id, external_id: msg.external_id, direction: msg.direction,
        sender: msg.sender, body: msg.body, sent_at: msg.sent_at ?? new Date().toISOString() },
      { onConflict: 'external_id', ignoreDuplicates: true }
    )
  if (msgErr) return Response.json({ ok: false, error: 'insert_failed' }, { status: 500 })

  return Response.json({ ok: true })
}
```

### Pattern 2: RLS mixta (business-scoped OR admin override) — LA PIEZA LOAD-BEARING
**What:** El dueño ve solo su `business_id`; el operador `is_admin` ve todo. Postgres OR-ea policies permissive.
**When to use:** Tablas compartidas entre el dueño (dashboard) y el operador (CRM). Patrón NUEVO en el repo.
**Example:**
```sql
-- supabase/migrations/038_crm_conversations_messages.sql
-- Source: compone businesses.owner_id (schema.sql:1209 "owner access" / appointments "business member access")
--         + el gate is_admin del JWT (034_crm_pipeline_tags_timeline.sql:155-157)

alter table public.conversations enable row level security;

-- Policy A — dueño: ve SOLO conversaciones de su negocio (base del add-on "Mensajes" gestion-rebrand).
-- auth.uid() envuelto en subselect (evaluado una vez por query — perf, regla del SKILL rls).
create policy "owner read conversations" on public.conversations
  for select using (
    business_id in (select id from public.businesses where owner_id = (select auth.uid()))
  );

-- Policy B — operador: override admin, ve TODAS (igual que el resto del CRM, mig 034).
-- Permissive → se combina con la A vía OR: dueño O admin. NO se necesita una sola condición gigante.
create policy "admin read conversations" on public.conversations
  for select using (
    (select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true'
  );

-- SIN policy de insert/update/delete para usuarios: SOLO el service-role escribe
-- (ingest del bot + takeover) — así nada es falsificable (lección 029, espejo 034:158).
-- mismas dos policies de SELECT para public.messages (filtrando por conversation_id → business).
```
**Nota crítica para `messages`:** `messages` no tiene `business_id` directo (lo hereda vía `conversation_id`). Dos opciones: (a) **denormalizar** `business_id` en `messages` (más simple para RLS, recomendado — evita un subselect anidado por fila); (b) RLS con subselect a `conversations`. **Recomendado: (a)** copiar `business_id` en `messages` al insertar (el ingest ya tiene el `business.id`). Es la opción que mantiene las policies idénticas a las de `conversations` y barata en runtime.

### Pattern 3: Lectura RLS-gated de la bandeja (session client, NO service-role)
**What:** El `page.tsx` lee con el session client del operador; la RLS gatea. NUNCA service-role en la lectura del operador.
**When to use:** Toda lectura del operador en el CRM.
**Example:**
```typescript
// app/(crm)/admin/bandeja/page.tsx
// Source: app/(crm)/admin/auditoria/page.tsx:20-39 (session client → RLS admin-read es la garantía, NO el cliente)
import { createClient } from '@/lib/supabase/server'

export default async function BandejaPage() {
  const supabase = await createClient()
  // La policy "admin read conversations" devuelve TODAS al operador (override).
  // SELECT explícito (sin comodín) — convención + nota de seguridad del webhook de pago.
  const { data, error } = await supabase
    .from('conversations')
    .select('id, business_id, contact_name, contact_phone, handled_by, unread_count, last_message_at')
    .order('last_message_at', { ascending: false })
    .limit(100)
  if (error) console.error('[crm/bandeja] read error:', error.message)
  return <BandejaClient rows={data ?? []} loadError={Boolean(error)} />
}
```

### Pattern 4: Takeover server action (audited)
```typescript
// app/(crm)/admin/bandeja/actions.ts
'use server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'

export async function takeConversation(conversationId: string) {
  // 1. confirmar operador (defensa en profundidad; el layout (crm) ya gatea is_admin)
  const session = await createClient()
  const { data: { user } } = await session.auth.getUser()
  if (user?.app_metadata?.is_admin !== true) return { ok: false, error: 'forbidden' }

  // 2. mutar con service-role (no hay policy de update para usuarios — D-04)
  const admin = createAdminClient()
  const { error } = await admin.from('conversations')
    .update({ handled_by: 'human' }).eq('id', conversationId)
  if (error) return { ok: false, error: 'update_failed' }

  // 3. auditar (D-03) — best-effort, no rompe el flujo (lib/audit.ts)
  await logAudit({
    actorId: user.id, action: 'conversation.takeover', targetType: 'conversation',
    targetId: conversationId, risk: 'bajo', reason: 'Operador tomó la conversación',
  })
  return { ok: true }
  // El bot lee handled_by='human' vía GET /api/agent/inbox/state y pasa a Modo Humano (pausa).
}
```

### Anti-Patterns to Avoid
- **Leer la bandeja con `createAdminClient()` (service-role):** bypassa la RLS mixta y expone TODAS las conversaciones sin pasar por la policy. La lectura del operador SIEMPRE con session client (auditoria/page.tsx:9-14 lo documenta como threat). El override admin ya está en la RLS.
- **Sacar el tenant del body del POST del bot:** el `business_id` SIEMPRE del slug validado, NUNCA del payload (anti-tampering, CLAUDE.md). El bot es input no confiable, igual que el webhook de pago.
- **check-then-insert para idempotencia:** ventana de carrera en reintentos del bot. Usar `upsert` con `onConflict` sobre `external_id`.
- **`with check` ausente / `using(true)`:** agujero de la migración 029. Sin policy de write para usuarios = solo service-role escribe.
- **Construir el composer / envío manual:** DIFERIDO (D-03). El composer va deshabilitado con copy "próximamente". NO planear el `send`.
- **Agregar tab "Email" / mail:** COMMS-03 diferido (D-01). NO entra.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth del caller externo | Esquema custom de firma | Token compartido `FORJO_AGENT_TOKEN` Bearer fail-closed | Es lo que el bot ya manda (HANDOFF); espejo del fail-closed del webhook de pago |
| Idempotencia | Tabla de "mensajes vistos" | Índice único `(external_id)` + `upsert ignoreDuplicates` | Postgres ya lo hace atómicamente; el repo trata 23505 como éxito (entity_tags 034:109) |
| Normalización de teléfono para match | Regex ad-hoc | `normalizeArWhatsApp()` (lib/whatsapp.ts:14) | Ya idempotente, maneja 15/área/país AR; usarla en el match y al guardar `contact_phone` |
| Formato de fecha AR | `new Date().toLocaleString()` suelto | `formatWhen()` + `AR_TZ` (auditoria-client.tsx:36-59) | Zona fija AR ya resuelta; copiar el helper |
| Guard de admin | Check client-side | Layout `(crm)` ya redirige server-side (layout.tsx:29) + RLS | Doble capa ya montada |
| Auditoría | INSERT manual a audit_log | `logAudit()` (lib/audit.ts:29) | Best-effort, no falsificable, ya valida shape |
| Badges de estado | CSS nuevo | `RiskBadge`/StatusBadge del CRM | Consistencia visual (regla UX del perfil) |

**Key insight:** Cada pieza de Phase 6 tiene un análogo exacto ya en producción en el repo. El riesgo no es construir, es **desviarse del patrón probado** — especialmente leer con service-role (fuga) o sacar el tenant del body (tampering).

## Runtime State Inventory

> Phase 6 NO es rename/refactor/migración de strings — es feature nueva. Igual hay estado runtime relevante para el deploy:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Tablas NUEVAS `conversations`/`messages` (migración 038, aplicada a mano en orden tras 037) | Migración SQL + regenerar `supabase/schema.sql` con `supabase db dump` post-deploy (TODO operativo, igual que 034:27-28) |
| Live service config | El bot (`whatsapp-ai-agent-kit`, VPS) necesitará `FORJO_BASE_URL`+`FORJO_SLUG`+`FORJO_AGENT_TOKEN` en su `.env.local` — pero eso es OTRO repo / operativo (Deferred) | Ninguna en este repo. Forjo solo expone los endpoints. |
| OS-registered state | Ninguno — no hay cron nuevo (Vercel Hobby = 1 cron diario ya tomado por cancel-expired) | None. El bot hace polling él mismo, no Forjo. |
| Secrets/env vars | `FORJO_AGENT_TOKEN` NUEVO (server-only, NO `NEXT_PUBLIC_`) en Vercel env | Setear en Vercel antes del deploy. El bot usa el mismo valor. |
| Build artifacts | Ninguno | None. |

## Common Pitfalls

### Pitfall 1: Service-role en la lectura del operador (fuga de aislamiento)
**What goes wrong:** Usar `createAdminClient()` en `bandeja/page.tsx` muestra TODAS las conversaciones de todos los tenants sin pasar por RLS.
**Why it happens:** Copiar el patrón del ingest (que sí usa service-role) en la lectura.
**How to avoid:** Lectura del operador SIEMPRE con `createClient()` (session). El override admin vive en la RLS, no en el cliente. Documentado como threat en auditoria/page.tsx:9-14.
**Warning signs:** `import { createAdminClient }` en un `page.tsx` o `*-client.tsx`.

### Pitfall 2: RLS de `messages` sin `business_id` propio
**What goes wrong:** Si `messages` solo tiene `conversation_id`, la policy del dueño necesita un subselect anidado caro y fácil de equivocar.
**Why it happens:** Normalización ingenua.
**How to avoid:** Denormalizar `business_id` en `messages` (lo copia el ingest desde `business.id`). Policies idénticas a `conversations`, baratas.
**Warning signs:** Policy de `messages` con `conversation_id in (select ... )`.

### Pitfall 3: Idempotencia rota → mensajes duplicados en reintentos del bot
**What goes wrong:** El bot reintenta (red caída) y se duplican mensajes.
**Why it happens:** Insert simple sin constraint, o check-then-insert con race.
**How to avoid:** Índice único sobre `messages.external_id` + `upsert({...}, { onConflict: 'external_id', ignoreDuplicates: true })`. El bot es el dueño del `external_id` (su id de mensaje SQLite).
**Warning signs:** `.insert()` plano en el ingest.

### Pitfall 4: Auth fail-open
**What goes wrong:** `if (process.env.FORJO_AGENT_TOKEN) { check }` → sin token configurado, el endpoint queda abierto a cualquiera.
**Why it happens:** Querer "no romper en dev".
**How to avoid:** Fail-CLOSED: secreto ausente → 401 (espejo de verifyMPSignature, webhook payment:33). Sin token = sin acceso.
**Warning signs:** El endpoint responde 200 a un POST sin Authorization.

### Pitfall 5: El bot es single-tenant hoy
**What goes wrong:** Planear asumiendo que el bot ya manda `slug` por mensaje y maneja N negocios.
**Why it happens:** El HANDOFF describe un bot single-tenant (un `.env` por negocio, `FORJO_SLUG` fijo).
**How to avoid:** El endpoint ACEPTA `slug` en el payload (contrato Forjo-defined), y el bot lo manda desde su `FORJO_SLUG`. El refactor multi-tenant del bot es Deferred (otro repo). Forjo construye listo para N; el bot adapta.
**Warning signs:** Asumir que un bot manda conversaciones de varios slugs hoy.

### Pitfall 6: Next 16 — `params` es Promise, `searchParams` síncrono vía `nextUrl`
**What goes wrong:** `params.slug` sin await rompe; o cachear el route handler.
**Why it happens:** Next 16 breaking changes (CLAUDE.md).
**How to avoid:** `export const dynamic = 'force-dynamic'`; `const slug = request.nextUrl.searchParams.get('slug')` (síncrono, como availability/route.ts:19-20). Consultar `node_modules/next/dist/docs/` antes de asumir.

### Pitfall 7: Sidebar item "Bandeja" en PRONTO
**What goes wrong:** La ruta existe pero el nav la deja deshabilitada.
**Why it happens:** El item está `{ href: '#', label: 'Bandeja', icon: Inbox, soon: true }` (crm-sidebar.tsx:58).
**How to avoid:** Cambiar a `{ href: '/admin/bandeja', label: 'Bandeja', icon: Inbox }` (quitar `soon`), igual que se hizo con Reportes/Pipeline/Negocios. El icono `Inbox` ya está importado (crm-sidebar.tsx:11).

## Code Examples

### `GET /api/agent/context` (D-06)
```typescript
// app/api/agent/context/route.ts
// Source: HANDOFF-forjo-integration.md (shape EXACTA) + app/api/booking/availability/route.ts (patrón)
import { createAdminClient } from '@/lib/supabase/admin'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const DAYS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'] // day_of_week 0..6

export async function GET(request: NextRequest) {
  // Auth OPCIONAL pero recomendada (HANDOFF): aceptar Bearer si viene, no exponer datos privados igual.
  const slug = request.nextUrl.searchParams.get('slug') || ''
  if (!slug) return Response.json({ ok: false, error: 'missing_params' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: business } = await supabase
    .from('businesses').select('id, name, slug, address, maps_url').eq('slug', slug).single()
  if (!business) return Response.json({ error: 'not_found' }, { status: 404 })

  const [{ data: services }, { data: hours }] = await Promise.all([
    supabase.from('services').select('name, duration_minutes, price, description')
      .eq('business_id', business.id).eq('active', true),
    supabase.from('business_hours').select('day_of_week, open_time, close_time, is_open')
      .eq('business_id', business.id),
  ])

  // Mapear business_hours → hours[] {day, ranges:[{open,close}]} (HANDOFF). is_open=false → ranges:[].
  const byDay = new Map<number, { open: string; close: string }[]>()
  for (const h of hours ?? []) {
    if (!h.is_open || !h.open_time || !h.close_time) continue
    const arr = byDay.get(h.day_of_week) ?? []
    arr.push({ open: String(h.open_time).slice(0,5), close: String(h.close_time).slice(0,5) })
    byDay.set(h.day_of_week, arr)
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gestion.forjo.studio'

  return Response.json({
    business: {
      name: business.name, slug: business.slug,
      address: business.address ?? null, mapsUrl: business.maps_url ?? null,
      bookingUrl: `${appUrl}/${business.slug}/turno`,    // OBLIGATORIO (HANDOFF)
    },
    services: (services ?? []).map(s => ({
      name: s.name, durationMinutes: s.duration_minutes ?? null,
      price: s.price != null ? Number(s.price) : null, description: s.description ?? null,
    })),
    hours: DAYS.map((day, i) => ({ day, ranges: byDay.get(i) ?? [] })),
    notes: null,   // no hay campo notes en businesses hoy → null (HANDOFF permite null)
  }, { headers: { 'Cache-Control': 'no-store' } })
}
```

### Migración 038 — esqueleto de tablas
```sql
-- 038_crm_conversations_messages.sql (aplicar a mano EN ORDEN tras 037)
create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  channel         text not null default 'whatsapp' check (channel in ('whatsapp')), -- mail diferido
  contact_phone   text not null,                  -- normalizado (normalizeArWhatsApp)
  contact_name    text,
  lead_id         uuid references public.leads(id) on delete set null,  -- match por phone/email (D-04)
  handled_by      text not null default 'ai' check (handled_by in ('unassigned','ai','human')),
  unread_count    integer not null default 0,
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
-- idempotencia de conversación + onConflict del upsert del ingest:
create unique index if not exists conversations_tenant_contact_idx
  on public.conversations (business_id, channel, contact_phone);
create index if not exists conversations_business_idx on public.conversations (business_id);
create index if not exists conversations_last_msg_idx on public.conversations (last_message_at desc);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  business_id     uuid not null references public.businesses(id) on delete cascade, -- denormalizado p/ RLS (Pitfall 2)
  external_id     text not null,                  -- id del mensaje en el bot → idempotencia (D-05)
  direction       text not null check (direction in ('inbound','outbound')),
  sender          text not null default 'contact' check (sender in ('contact','ai','human')),
  body            text not null,
  sent_at         timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create unique index if not exists messages_external_id_idx on public.messages (external_id);
create index if not exists messages_conversation_idx on public.messages (conversation_id, sent_at);
-- + RLS mixta de Pattern 2 sobre AMBAS tablas (owner OR is_admin; sin write para usuarios).
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CRM admin-only RLS (mig 031-034) | RLS **mixta** owner OR is_admin | Phase 6 | Primera tabla del CRM que el dueño también lee (base gestion-rebrand) |
| Bot lee `negocio.md` local | Bot lee `GET /api/agent/context` (modo forjo) | HANDOFF | Forjo es la fuente del prompt del bot; el endpoint es nuevo en el repo |
| WhatsApp solo saliente (wa.me, lib/whatsapp.ts) | Conversaciones two-way persistidas (entrante+saliente del bot) | Phase 6 | Nuevo modelo de datos de comms |

**Deprecated/outdated:** Nada se deprecia. `lib/whatsapp.ts` (wa.me) sigue para links salientes; se reusa `normalizeArWhatsApp` para el match.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | El payload del ingest (shape `{slug, external_id, contact, direction, body, sender, sent_at}`) es **Forjo-defined** — el HANDOFF solo especifica `GET /api/agent/context`, NO el POST de sync (lo describe como "fase siguiente"). | Ingest / Pattern 1 | Bajo: el bot adapta al contrato que Forjo defina (D-05 dice "alinear con HANDOFF" pero el HANDOFF no tiene el POST). Confirmar el shape con el dueño del repo del bot antes de la sync real (Deferred). |
| A2 | `business_hours` no tiene rangos múltiples por día como filas separadas con el mismo `day_of_week` necesariamente; el mapeo asume 1+ filas por día. | context endpoint | Bajo: el HANDOFF acepta `ranges[]`; si hay 1 fila/día funciona igual (array de 1). |
| A3 | No existe un campo `notes` para el agente en `businesses` → se devuelve `null` (el HANDOFF lo permite). | context endpoint | Bajo: el bot tolera `null`. Si se quiere notes, agregar columna en otra fase. |
| A4 | El bot lee el takeover state por **polling** (`GET /api/agent/inbox/state`), no por push. El HANDOFF dice que el bot ya hace polling de context cada 10 min. | Takeover / D-03 | Medio: latencia de pausa = intervalo de polling. Si se requiere pausa inmediata, es un slice de integración (Deferred). Confirmar con el dueño del bot. |
| A5 | `NEXT_PUBLIC_APP_URL` existe como env (usado para `bookingUrl`). | context endpoint | Bajo: CLAUDE.md lista "URL de app" entre las `NEXT_PUBLIC_`. Verificar el nombre exacto en `.env.local`. |

**Estas 5 asunciones son de bajo/medio riesgo y NO bloquean el build** — Forjo construye su lado; el bot (otro repo, Deferred) adapta al contrato.

## Open Questions (RESOLVED)

> Ambas resueltas inline (Recommendation aplicada en los planes 06-01/06-02): Forjo DEFINE el contrato de ingest (el bot adapta, sync real Deferred); y en v1 la conversación se asocia siempre al `business_id` (del slug) con `lead_id` nullable por match phone/email, "Sin asignar" = estado de takeover (`handled_by='unassigned'`), no de asociación.

1. **Shape exacto del POST del bot.** — RESUELTO: Forjo define el contrato (Pattern 1); el bot adapta. La sync real es Deferred. No bloquea.
   - What we know: El HANDOFF especifica el GET de context al detalle; el POST de sync lo menciona como fase futura ("requiere tabla outbox + cron + el bot que la lee").
   - What's unclear: Campos exactos que el bot enviará por mensaje.
   - Recommendation: Forjo DEFINE el contrato (Pattern 1) y lo documenta; el bot adapta. No bloquea — la sync real es Deferred.

2. **Asociación a `leads` vs `businesses` por phone/email.**
   - What we know: D-04 dice match contra `leads`/`businesses`; sin match = "Sin asignar".
   - What's unclear: Una conversación de WhatsApp llega por el `slug` de un negocio (ya hay `business_id`). El "lead" sería el CONTACTO que escribe (un cliente del negocio), no el negocio. ¿Se crea/matchea un `lead` por el phone del contacto, o solo se asocia al `business_id`?
   - Recommendation: En v1, asociar siempre al `business_id` (viene del slug). El `lead_id` es nullable: matchear contra `leads.whatsapp`/`leads.email` con `normalizeArWhatsApp`; si no hay match, queda null (la conversación igual está asignada al negocio). "Sin asignar" (`handled_by='unassigned'`) es un estado de TAKEOVER, no de asociación — clarificar en discuss/plan si "Sin asignar" del mock es estado de handler o de entidad.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Next.js 16 | Todo | ✓ | 16.2.7 | — |
| Supabase (Postgres + RLS) | Tablas + RLS | ✓ | en prod | — |
| `FORJO_AGENT_TOKEN` env | Ingest auth | ✗ (a setear) | — | Sin él el ingest es 401 (fail-closed correcto); setear en Vercel pre-deploy |
| Bot WhatsApp (otro repo) | Sync real | ✗ (Deferred) | — | Forjo construye listo; la sync se activa después. No bloquea Phase 6. |

**Missing dependencies with no fallback:** Ninguna que bloquee el build de Phase 6 (el bot es Deferred por diseño).
**Missing dependencies with fallback:** `FORJO_AGENT_TOKEN` — setear en Vercel; hasta entonces el endpoint rechaza correctamente (fail-closed).

## Validation Architecture

> El repo NO tiene framework de tests instalado por default, PERO el milestone CRM corre **Vitest** (MEMORY: "Vitest 201/204", lib puras testeadas como `lib/crm-reports`). Phase 6 debe seguir ese patrón: lógica pura testeable extraída a `lib/conversations.ts`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (presente en el workstream CRM; ver migr. 036/reportes) |
| Config file | `vitest.config.*` (verificar en Wave 0 si aplica a este workstream) |
| Quick run command | `npx vitest run <file>` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COMMS-01 | `matchEntity(phone,email)` matchea lead/negocio o devuelve null | unit | `npx vitest run lib/conversations.test.ts` | ❌ Wave 0 |
| COMMS-01 | mapeo `business_hours` → `hours[]` del context endpoint | unit (extraer a lib puro) | `npx vitest run lib/agent-context.test.ts` | ❌ Wave 0 |
| COMMS-02 | transición de estado handled_by (ai→human) válida | unit | `npx vitest run lib/conversations.test.ts` | ❌ Wave 0 |
| ingest | idempotencia: mismo external_id no duplica (lógica de upsert) | integration (manual contra Supabase local) o unit del builder del payload | manual-only + zod schema unit | ❌ Wave 0 |
| RLS mixta | dueño NO ve otro tenant; admin ve todo | manual-only (probar con 2 usuarios — checklist SKILL rls) | manual | n/a |

### Sampling Rate
- **Per task commit:** `npx vitest run <archivo tocado>`
- **Per wave merge:** `npx vitest run` (full)
- **Phase gate:** suite verde + prueba manual de la RLS mixta con un usuario dueño y uno admin (checklist supabase-multitenant-rls).

### Wave 0 Gaps
- [ ] `lib/conversations.ts` extraído como lógica pura (match, normalización, builder del payload) — para que sea testeable sin Supabase.
- [ ] `lib/agent-context.ts` (mapeo hours/services puro) separado del route handler.
- [ ] Tests Vitest de las funciones puras anteriores.
- [ ] **Prueba manual obligatoria de RLS mixta** (no automatizable sin staging): un usuario dueño NO debe ver conversaciones de otro negocio; un usuario `is_admin` debe verlas todas. Es la garantía load-bearing.

## Security Domain

> `security_enforcement` activo (aislamiento multi-tenant es el Core Value del proyecto). Esta es la sección crítica.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Ingest: token compartido `FORJO_AGENT_TOKEN` Bearer fail-closed (espejo webhook pago). Operador: sesión Supabase + `is_admin` JWT (layout guard). |
| V3 Session Management | yes | Session client (`@supabase/ssr`) para el operador; el bot NO tiene sesión (service-role tras token). |
| V4 Access Control | **yes (load-bearing)** | RLS **mixta** owner(`business_id`) OR `is_admin`; SIN policy de write para usuarios → solo service-role escribe. Lectura del operador con session client (nunca service-role). |
| V5 Input Validation | yes | `zod` sobre el payload del bot; parseo defensivo (no confiar en el cliente); tenant del slug, NUNCA del body. |
| V6 Cryptography | no | No se maneja cripto propia (token comparado en claro server-side; sobre HTTPS). |

### Known Threat Patterns for {bandeja CRM + ingest externo}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-tenant read (dueño ve otro negocio) | Information Disclosure | RLS mixta + filtro `business_id`; lectura con session client. Probar con 2 usuarios (checklist SKILL). |
| Ingest forjado (POST con datos falsos) | Spoofing / Tampering | Token fail-closed (401 sin token); tenant del slug validado, no del body; service-role solo tras validar. |
| Mensajes duplicados (reintento) | — (integridad) | Índice único `external_id` + upsert idempotente. |
| Privilege escalation vía service-role en lectura | Elevation of Privilege | NUNCA `createAdminClient` en `page.tsx`/client; documentado como anti-pattern. |
| Takeover no auditado | Repudiation | `logAudit('conversation.takeover')` en la server action. |
| `FORJO_AGENT_TOKEN` filtrado al cliente | Information Disclosure | Server-only (NO `NEXT_PUBLIC_`); igual que service-role key. |

## Sources

### Primary (HIGH confidence)
- `c:/Users/franc/Desktop/Forjo Studio/whatsapp-ai-agent-kit/HANDOFF-forjo-integration.md` — contrato del bot: shape EXACTA de `GET /api/agent/context`, auth `FORJO_AGENT_TOKEN`, toggle opcional, "modo forjo" (polling 10 min). [VERIFIED: leído en disco]
- `app/api/payment/webhook/[slug]/route.ts:12-56` — patrón ingest: auth-first fail-closed → slug→tenant → service-role write + idempotencia. [VERIFIED]
- `app/api/booking/availability/route.ts` — patrón GET read-only por slug, service-role, `force-dynamic`, `nextUrl.searchParams`. [VERIFIED]
- `supabase/migrations/034_crm_pipeline_tags_timeline.sql:146-198` — RLS admin-only del CRM (`is_admin` JWT), sin write para usuarios. [VERIFIED]
- `supabase/schema.sql:1209` ("owner access") + `029_drop_public_read_appointments_policy.sql:8-10` — RLS business-scoped (`owner_id = auth.uid()`). [VERIFIED]
- `app/(crm)/admin/auditoria/page.tsx:20-39` — lectura RLS-gated con session client (NO service-role); documenta la threat. [VERIFIED]
- `app/(crm)/layout.tsx:22-29` — guard server-side `is_admin` del JWT. [VERIFIED]
- `lib/audit.ts:29` — `logAudit` best-effort service-role. [VERIFIED]
- `lib/whatsapp.ts:14` — `normalizeArWhatsApp` para el match por teléfono. [VERIFIED]
- `components/crm/crm-sidebar.tsx:58` — item "Bandeja" en PRONTO (a habilitar). [VERIFIED]
- `supabase/schema.sql:130-172,523-534` — columnas de `business_hours`/`businesses`/`services` para el context endpoint. [VERIFIED]
- `.claude/skills/supabase-multitenant-rls/SKILL.md` — reglas de RLS (subselect de auth.uid, with check, service-role solo server). [CITED]

### Secondary (MEDIUM confidence)
- MEMORY (`whatsapp-agent-kit.md`, `crm-admin-milestone.md`) — el agente ya existe (Baileys/VPS/SQLite); Forjo expone `GET /api/agent/context`; sync opcional; Vitest en el workstream. [CITED]

### Tertiary (LOW confidence)
- Ninguna fuente web — todo grounded en repo + HANDOFF. No hizo falta búsqueda externa.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — cero-install, todo verificado en package.json/CLAUDE.md.
- Architecture (ingest/context/RLS/takeover): HIGH — cada pieza tiene análogo exacto en producción en el repo.
- RLS mixta: HIGH — composición directa de dos policies ya existentes (034 admin + owner access).
- Contrato del POST del bot: MEDIUM — Forjo-defined (el HANDOFF solo cubre el GET); A1/A4 a confirmar con el repo del bot (Deferred, no bloquea).
- Pitfalls: HIGH — derivados de threats ya documentados en el código (029, webhook pago, auditoria).

**Research date:** 2026-06-24
**Valid until:** ~2026-07-24 (estable; depende del repo del bot solo para la sync real, que es Deferred).
