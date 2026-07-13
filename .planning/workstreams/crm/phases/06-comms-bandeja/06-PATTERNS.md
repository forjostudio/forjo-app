# Phase 6: Comms (Bandeja) - Pattern Map

**Mapped:** 2026-06-24
**Files analyzed:** 11 (10 new, 1 modified)
**Analogs found:** 11 / 11

> RESEARCH.md (`06-RESEARCH.md`) already cites in-repo analogs with file:line and full code examples. This map verifies those references against the live repo and gives the planner the exact analog + load-bearing excerpt per file. **Read RESEARCH.md §"Architecture Patterns" + §"Code Examples" alongside this** — the code skeletons live there; this file is the per-file analog index.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/038_crm_conversations_messages.sql` | migration | CRUD (schema + RLS) | `034_crm_pipeline_tags_timeline.sql` (admin RLS) **COMPOSED** with `schema.sql:1213` owner-scoped policy | exact (composition) |
| `app/api/agent/inbox/route.ts` | route (API) | event-driven (ingest, write) | `app/api/payment/webhook/[slug]/route.ts` | exact |
| `app/api/agent/context/route.ts` | route (API) | request-response (read-only) | `app/api/booking/availability/route.ts` | exact |
| `app/api/agent/inbox/state/route.ts` | route (API) | request-response (read-only, bot poll) | `app/api/booking/availability/route.ts` | role-match |
| `app/(crm)/admin/bandeja/actions.ts` | server action | transform (mutation + audit) | `app/(crm)/admin/_content-actions.ts` / `_actions.ts` | exact |
| `app/(crm)/admin/bandeja/page.tsx` | page (RSC server) | request-response (RLS read) | `app/(crm)/admin/auditoria/page.tsx` | exact |
| `app/(crm)/admin/bandeja/bandeja-client.tsx` | component (client) | request-response (list+thread+filters) | `auditoria-client.tsx` + `pipeline/pipeline-client.tsx` | role-match |
| `lib/conversations.ts` (+ `.test.ts`) | utility (pure lib) | transform (match/normalize) | `lib/crm-pipeline.ts` / `lib/crm-reports.ts` | exact |
| `lib/agent-context.ts` (+ `.test.ts`) | utility (pure lib) | transform (hours/services map) | `lib/crm-reports.ts` (pure + vitest) | role-match |
| `components/crm/crm-sidebar.tsx` | component (MODIFY nav) | n/a | same file: the "Reportes"/"Pipeline" enable | exact |

---

## Pattern Assignments

### `supabase/migrations/038_crm_conversations_messages.sql` (migration, CRUD) — LOAD-BEARING

**Analog A (admin override):** `supabase/migrations/034_crm_pipeline_tags_timeline.sql:152-158` (verified)
**Analog B (owner scope):** `supabase/schema.sql:1209` + `:1213-1215` (verified) — `business_secrets` "owner access secrets" is the exact subselect shape to copy.

The MIXED RLS is the load-bearing piece: **two permissive SELECT policies per table** that Postgres OR-es together. Do NOT write one giant condition.

**Admin override policy excerpt** (034:155-157, copy verbatim, rename table):
```sql
create policy "admin read leads" on public.leads
  for select
  using ((select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true');
-- Sin policy de insert/update/delete: solo el service-role escribe.
```

**Owner-scoped policy excerpt** (schema.sql:1213-1215, the subselect form to mirror — wrap `auth.uid()` in `(select ...)` per the rls SKILL perf rule):
```sql
-- "owner access secrets" on business_secrets:
USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = "auth"."uid"()))));
```

**Composed result for `conversations`** (and identical for `messages` — denormalize `business_id` onto `messages` so the policies are byte-identical, RESEARCH Pitfall 2):
```sql
-- Policy A — dueño: ve SOLO su business_id
create policy "owner read conversations" on public.conversations
  for select using (
    business_id in (select id from public.businesses where owner_id = (select auth.uid()))
  );
-- Policy B — operador admin (permissive → OR con A)
create policy "admin read conversations" on public.conversations
  for select using (
    (select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true'
  );
-- SIN policy de insert/update/delete: solo service-role escribe (espejo 034:158, lección 029).
```

**Schema skeleton:** see RESEARCH.md §"Migración 038 — esqueleto de tablas" (lines 446-480). Key constraints:
- `conversations`: unique `(business_id, channel, contact_phone)` → upsert onConflict of the ingest.
- `messages`: `business_id` denormalized (NOT NULL FK), unique index on `external_id` → idempotency.
- `handled_by` check `('unassigned','ai','human')`; `channel` check `('whatsapp')` (mail deferred).

**Operational TODO (mirror 034):** apply by hand in order after `037`, then regenerate `supabase/schema.sql` with `supabase db dump`.

---

### `app/api/agent/inbox/route.ts` (route, event-driven ingest) — token-auth mirror

**Analog:** `app/api/payment/webhook/[slug]/route.ts:1-56` (verified)

The auth-first / fail-closed / tenant-from-slug-not-body sequence is the load-bearing copy.

**Auth-first fail-closed excerpt** (webhook:29-35 — verify signature BEFORE trusting body; no `if (secret)` fail-open branch):
```typescript
// Verificar la firma PRIMERO, antes de confiar en el body... fail-closed (secreto ausente → 401).
if (!verifyMPSignature(request, dataIdQuery ?? body.data?.id)) {
  return new Response('Invalid signature', { status: 401 })
}
```
→ For ingest: replicate as `authOk(request)` checking `FORJO_AGENT_TOKEN` Bearer; absent secret → `return false` → 401 (RESEARCH Pattern 1, lines 165-171).

**Service-role + slug→tenant excerpt** (webhook:43, 59 — slug from validated route, never from body):
```typescript
const { slug } = await params
// ...
const supabase = createAdminClient()
```
→ For ingest: `slug` comes from the validated zod payload, then `supabase.from('businesses').select('id').eq('slug', msg.slug).single()` — `business_id` NEVER from the body (anti-tampering, CLAUDE.md). Then upsert conversation (onConflict `business_id,channel,contact_phone`) + upsert message (onConflict `external_id`, `ignoreDuplicates`). Full skeleton: RESEARCH Pattern 1 (lines 156-226).

**Note:** unlike the webhook, ingest writes synchronously (no `after()`) — the bot wants the 200 to mean "persisted" for its retry/idempotency loop. `export const dynamic = 'force-dynamic'`.

---

### `app/api/agent/context/route.ts` (route, read-only) — public-read mirror

**Analog:** `app/api/booking/availability/route.ts` (verified pattern: `force-dynamic`, `request.nextUrl.searchParams` sync, service-role by slug).

Contract shape (name/slug/address/mapsUrl/**bookingUrl** + services + hours + notes) is LOCKED by `whatsapp-ai-agent-kit/HANDOFF-forjo-integration.md`. Full skeleton + hours mapping: RESEARCH §"Code Examples → GET /api/agent/context" (lines 392-442).

Key load-bearing bits:
- `export const dynamic = 'force-dynamic'` + `{ headers: { 'Cache-Control': 'no-store' } }`.
- `const slug = request.nextUrl.searchParams.get('slug')` (Next 16: searchParams sync via nextUrl; params is Promise — see RESEARCH Pitfall 6).
- Extract the `business_hours → hours[]` and `services` mapping into `lib/agent-context.ts` (pure, testable) — keep the route thin.

---

### `app/api/agent/inbox/state/route.ts` (route, read-only bot poll)

**Analog:** same as context — `app/api/booking/availability/route.ts` (service-role by slug, `force-dynamic`, `nextUrl.searchParams`).

Reads `conversations.handled_by` by `slug` + `phone` (normalize with `normalizeArWhatsApp` from `lib/whatsapp.ts:14` before matching). Returns `{ handled_by }`. The bot polls this to know if it must pause (Modo Humano). Service-role read here is correct — the bot has no session, only the shared token; gate with the same `FORJO_AGENT_TOKEN` Bearer as ingest.

---

### `app/(crm)/admin/bandeja/actions.ts` (server action, audited mutation)

**Analog:** `app/(crm)/admin/_content-actions.ts:22-66` (verified) — the mandatory 6-step pattern, calcado VERBATIM de `_actions.ts`.

**6-step excerpt** (`_content-actions.ts:44-66`, `createNote` — copy the order exactly):
```typescript
export async function createNote(input: unknown): Promise<void> {
  const actor = await requireAdmin()                 // 1. guard (action = POST endpoint, layout no la protege)
  const data = createNoteSchema.parse(input)         // 2. zod, input no confiable
  const admin = createAdminClient()                  // 3. service-role (sin policy de write)
  const { error } = await admin.from('notes').insert({ ... })
  if (error) throw new Error('update_failed')        // 4. mutar + throw
  await logAudit({ actorId: actor.id, action: 'note.create', targetType: 'note',
    businessId: data.businessId ?? null, risk: 'bajo', metadata: {...} })  // 5. audit
  if (data.businessId) revalidatePath(fichaPath(data.businessId))          // 6. revalidate
}
```

For `takeConversation`:
- Step 1: `requireAdmin()` from `@/lib/admin-guard` (preferred over the manual `getUser()` check shown in RESEARCH Pattern 4 — match the established `_content-actions.ts` import).
- Step 4: `admin.from('conversations').update({ handled_by: 'human' }).eq('id', conversationId)`.
- Step 5: `logAudit({ action: 'conversation.takeover', targetType: 'conversation', risk: 'bajo', ... })` — register `conversation.takeover` in the central `ACTION_LABEL` map (`lib/crm-timeline.ts`) so it renders in auditoría/timeline.
- Step 6: `revalidatePath('/admin/bandeja')`.
- Add a `releaseConversation` (handled_by → 'ai') symmetric action.

---

### `app/(crm)/admin/bandeja/page.tsx` (page RSC, RLS-gated read)

**Analog:** `app/(crm)/admin/auditoria/page.tsx:20-39` (verified)

**Session-client read excerpt** (auditoria/page.tsx:20-38 — the load-bearing rule is documented in its header comment :7-14: read with SESSION client, never service-role; RLS admin-override is the guarantee, NOT the client):
```typescript
export default async function AuditoriaPage() {
  const supabase = await createClient()              // session: anon key + cookies (NOT createAdminClient)
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, actor_id, action, ...')             // SELECT explícito, sin comodín
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) console.error('[crm/auditoria] read error:', error.message)
  return <AuditoriaClient rows={data ?? []} loadError={Boolean(error)} />
}
```
→ For bandeja: `createClient()` (session), `from('conversations').select('id, business_id, contact_name, contact_phone, handled_by, unread_count, last_message_at')`, order by `last_message_at desc`, limit 100. Log prefix `[crm/bandeja]`. **Anti-pattern (RESEARCH Pitfall 1):** `createAdminClient` in a `page.tsx`/client leaks all tenants — the admin override lives in RLS.

---

### `app/(crm)/admin/bandeja/bandeja-client.tsx` (client, list+thread+filters)

**Analog A (list + tabs + formatWhen + RiskBadge):** `app/(crm)/admin/auditoria/auditoria-client.tsx:1-59` (verified)
**Analog B (filters/states UI + CRM dark tokens):** `app/(crm)/admin/pipeline/pipeline-client.tsx`

**Imports + AR-date helper to mirror** (auditoria-client.tsx:1-59):
```typescript
'use client'
import { useMemo, useState } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, ... } from '@/components/ui/table'
import { RiskBadge } from '@/components/crm/risk-badge'
const AR_TZ = 'America/Argentina/Buenos_Aires'
function formatWhen(iso: string): string { /* Hoy·/Ayer·/14 jun· en hora AR */ }
```
→ Copy `formatWhen` verbatim (don't hand-roll `toLocaleString`). Row type = snake_case as it comes from Supabase (`AuditRow` style — no camelCase rename).

Bandeja-specific UI (from mock `crm-design/07-bandeja.png`, contract A12 `--skip-ui`):
- Filter tabs `Todas / WhatsApp` (NO "Email" tab in v1 — D-01).
- State badges per conversation (`unassigned`/`ai`/`human`) — reuse the `RiskBadge`/StatusBadge chip pattern, do not invent CSS.
- Thread panel + "agente IA respondiendo" banner + "Tomar conversación" button (calls `takeConversation`, toast via `sonner`).
- **Composer DISABLED** with copy "próximamente" / "Escribir por WhatsApp…" — manual send is deferred (D-03). Do NOT build send.

---

### `lib/conversations.ts` (+ `lib/conversations.test.ts`) (pure utility)

**Analog:** `lib/crm-pipeline.ts` / `lib/crm-reports.ts` (pure-lib + vitest, per MEMORY "vitest 201/204").

Pure, Supabase-free functions so they're unit-testable:
- `matchEntity(phone, email)` → match against `leads.whatsapp`/`leads.email`, return `lead_id | null`.
- normalize via `normalizeArWhatsApp` (`lib/whatsapp.ts:14`) — don't hand-roll phone regex (RESEARCH "Don't Hand-Roll").
- the zod inbound schema / payload builder (so idempotency/shape is testable without a live DB).
- `handled_by` transition validity (ai→human, etc.).

Test command: `npx vitest run lib/conversations.test.ts`.

---

### `lib/agent-context.ts` (+ test) (pure utility)

**Analog:** `lib/crm-reports.ts` (pure mapping + vitest).

Extract from the context route the `business_hours → hours[] {day, ranges:[{open,close}]}` and `services → [{name,durationMinutes,price,description}]` mapping (RESEARCH lines 419-440). Keep the route handler thin; test the mapping with `npx vitest run lib/agent-context.test.ts`.

---

### `components/crm/crm-sidebar.tsx` (MODIFY — enable Bandeja nav)

**Analog:** same file — the already-shipped enable of "Reportes"/"Pipeline"/"Negocios" (verified, lines 53-74).

**Current state** (crm-sidebar.tsx:58, verified):
```typescript
{ href: '#', label: 'Bandeja', icon: Inbox, soon: true },
```
**Change to** (mirror lines 64-72 which have no `soon`):
```typescript
{ href: '/admin/bandeja', label: 'Bandeja', icon: Inbox },
```
`Inbox` is already imported (crm-sidebar.tsx:11). Single-line edit; do not touch other items.

---

## Shared Patterns

### Mixed RLS (owner OR admin) — NEW pattern, load-bearing
**Source:** `034_crm_pipeline_tags_timeline.sql:155-157` (admin) composed with `schema.sql:1213-1215` (owner subselect).
**Apply to:** `conversations` AND `messages` (denormalize `business_id` on `messages`).
Two permissive SELECT policies per table → Postgres OR. No write policy for users → only service-role writes. See migration section above for the composed excerpt.

### Token auth, fail-closed
**Source:** `app/api/payment/webhook/[slug]/route.ts:33` (verify-first, no fail-open `if (secret)` branch).
**Apply to:** `agent/inbox/route.ts`, `agent/inbox/state/route.ts` (and optionally context). Absent `FORJO_AGENT_TOKEN` → 401. Server-only env (NOT `NEXT_PUBLIC_`).

### Session-vs-service-role split
**Apply to all:**
- **Operator reads** (`bandeja/page.tsx`) → `createClient()` (session, RLS gates). NEVER `createAdminClient` in page/client — leaks tenants (Pitfall 1, documented as threat in auditoria/page.tsx:7-14).
- **Bot/external writes & reads** (`agent/*` routes) + **takeover mutation** (`actions.ts`) → `createAdminClient()` (service-role, after token/admin validation).

### Audited mutation 6-step
**Source:** `app/(crm)/admin/_content-actions.ts:44-66`.
**Apply to:** `bandeja/actions.ts`. requireAdmin → zod → createAdminClient → mutate/throw → logAudit → revalidatePath. Register the new `conversation.takeover` action code in `lib/crm-timeline.ts` ACTION_LABEL.

### AR timezone date formatting
**Source:** `auditoria-client.tsx:36-59` (`AR_TZ` + `formatWhen`).
**Apply to:** `bandeja-client.tsx`. Copy verbatim.

### Tenant from slug, never from body
**Source:** webhook `:43` (`const { slug } = await params`).
**Apply to:** `agent/inbox/route.ts` — `business_id` resolved from validated `slug`, never read from the POST payload (anti-tampering, CLAUDE.md).

## No Analog Found

None. Every Phase 6 file maps to an exact or close in-repo analog already in production.

## Metadata

**Analog search scope:** `supabase/migrations/`, `supabase/schema.sql`, `app/api/payment/`, `app/api/booking/`, `app/(crm)/admin/`, `components/crm/`, `lib/`.
**Files scanned (read):** 034 migration, schema.sql (RLS region), payment webhook, auditoria page + client, _content-actions, crm-sidebar.
**Verified against RESEARCH.md cited line numbers:** all confirmed.
**Pattern extraction date:** 2026-06-24
