# Phase 4: Pipeline, Tags & Timeline - Research

**Researched:** 2026-06-20
**Domain:** CRM sales pipeline (kanban), shared tag catalog, unified chronological timeline (SQL VIEW) — all admin-only inside the Forjo CRM console
**Confidence:** HIGH (all findings verified against in-repo code; no external lookups needed)

## Summary

This phase is almost entirely an **in-repo pattern-replication exercise**, not a new-technology exercise. Every architectural decision (admin-only RLS via JWT `app_metadata`, service-role reads in RSC, session-client reads gated by RLS, `requireAdmin()` + `zod` + `logAudit()` server actions, numbered hand-applied migrations) already exists and is battle-tested in Phases 1–3. The job of the planner is to mirror those patterns for six new tables (`leads`, `deals`, `tags`, a tag-join table, `notes`, `tasks`) plus one SQL VIEW (`crm_timeline`), and to wire three new UI surfaces (pipeline kanban, tag filter in the directory, timeline tab in the ficha) that the Phase 1–3 shell already left placeholders for.

Three findings are load-bearing and change how the plan must be structured:

1. **The lead→business conversion integration point is the ONBOARDING page, not the register page.** `app/(auth)/register/page.tsx` only calls `supabase.auth.signUp()` and redirects to `/onboarding`. The `businesses` row is actually INSERTed in `app/(onboarding)/onboarding/page.tsx` → `handleFinish()`, client-side, under the owner's own session (anon key, RLS). Since `leads`/`deals` are admin-only, the owner's session CANNOT write to them — the link MUST happen server-side via service-role. The cleanest pattern is a dedicated server route/action invoked after business creation that resolves the lead by normalized email and links it with service-role (mirroring the booking public pattern).

2. **The `crm_timeline` VIEW must use `WITH (security_invoker = true)` — the OPPOSITE of every existing view in the repo.** All current public views (026/027 `public_services`, `public_business_hours`, etc.) deliberately run as security-DEFINER to BYPASS base-table RLS for anon reads. The timeline needs the reverse: read through the operator's *session* client (like the audit viewer does) so the `audit_log` admin-read RLS policy is INHERITED and enforced. A non-invoker view here would either bypass the admin gate or return zero rows. This is the single biggest pitfall in the phase.

3. **No drag-and-drop library is bundled.** `package.json` has no dnd library. Per the developer's "prefer zero-install / flag new deps" rule, the kanban drag-drop must be built with **native HTML5 Drag and Drop API** (or Pointer Events) — no new dependency — OR the dependency must be flagged and approved before install. Recommendation below: native HTML5 DnD.

**Primary recommendation:** Create migration `034_crm_pipeline_tags_timeline.sql` mirroring the 031/032 admin-only RLS pattern verbatim; build the lead→business link as a service-role server action triggered from the onboarding finish flow; build `crm_timeline` as a `security_invoker` VIEW read through the session client; implement kanban DnD with native HTML5 drag events (no new dep).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Pipeline board render (kanban columns, $ totals) | RSC (service-role read) | Client (`*-client.tsx` for DnD interactivity) | Same split as `negocios/page.tsx` (RSC reads with service-role) + `negocios-client.tsx` (interactivity) |
| Move deal between stages | Server action (`requireAdmin` + service-role write + `logAudit`) | Client (optimistic DnD then call action) | Stage change is an auditable mutation (D-14); the board is not authoritative |
| Lead→business conversion (auto) | Server action / route (service-role) | Onboarding client (triggers it post-insert) | Admin-only tables written from a non-admin session → MUST be service-role (D-06, booking pattern) |
| Lead→business conversion (manual) | Server action (`requireAdmin` + service-role) | Pipeline client (button + ConfirmDialog) | Operator-initiated, auditable |
| Tag CRUD + assignment | Server action (`requireAdmin` + service-role) | Client (chips UI) | Admin-only catalog (D-07, D-14) |
| Tag filter (pipeline + directory) | Client (in-memory filter) | RSC (loads tags + assignments) | Mirror `filterBusinesses` in-memory pattern (`negocios-client.tsx`); OR semantics (D-09) |
| Timeline read | RSC (session client → `crm_timeline` VIEW, RLS-gated) | Client (filter chips, render) | Mirror `auditoria/page.tsx` session-client read; VIEW inherits admin RLS via `security_invoker` |
| Notes/Tasks CRUD | Server action (`requireAdmin` + service-role + `logAudit`) | Client (input + list) | Admin-only writes, some auditable (D-12, D-14) |

## Standard Stack

No new libraries required. Everything is already in `package.json` (verified).

### Core (all already installed — verified in package.json)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | `16.2.7` | App Router, RSC, server actions, route handlers | Project framework [VERIFIED: package.json] |
| `react` / `react-dom` | `19.2.4` | UI + RSC | [VERIFIED: package.json] |
| `@supabase/supabase-js` | `^2.106.2` | Postgres/Auth client (service-role admin) | [VERIFIED: package.json] |
| `@supabase/ssr` | `^0.10.3` | Session client (anon + cookies) for RLS-gated reads | [VERIFIED: package.json] |
| `zod` | `^4.4.3` | Server-action input validation (`.parse` after `requireAdmin`) | [VERIFIED: package.json] |
| `lucide-react` | `^1.17.0` | Icons (board, tags, timeline entry icons) | [VERIFIED: package.json] |
| `sonner` | `^2.0.7` | Toasts on action success/failure | [VERIFIED: package.json] |
| Native HTML5 Drag & Drop API | browser built-in | Kanban card drag-drop | Zero-install; no dnd lib bundled (see Don't Hand-Roll caveat) |

### Supporting (already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@base-ui/react` | `^1.5.0` | Unstyled primitives (Dialog backing ConfirmDialog) | Reuse via `@/components/ui/dialog` |
| `date-fns` | `^4.4.0` | Date math for tasks `due` / relative timestamps | If `Intl` formatting (already used in auditoria-client) is insufficient |
| `react-day-picker` | `^10.0.1` | Date picker for task `due` (optional) | Only if a calendar picker is wanted; `ExtendTrialDialog` already shows the in-repo pattern |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native HTML5 DnD | `@dnd-kit/core` or `react-beautiful-dnd` | Better a11y/touch, but a NEW dependency — violates "prefer zero-install" rule; must be flagged + approved. Native DnD is enough for a single-operator desktop board. |
| Stage as `text` + CHECK | Postgres `enum` type | LOCKED against by D-03 (enum requires `ALTER TYPE` to extend; CHECK is just a constant + constraint edit) |
| `crm_timeline` VIEW | Materialized `timeline_events` table | LOCKED against by D-11 (dual-write + drift on the audit source-of-truth is unacceptable) |

**Installation:** None. No `npm install` step in this phase. If the planner concludes native DnD is unacceptable, it MUST insert a `checkpoint:human-verify` task to approve `@dnd-kit/core` before any install.

## Package Legitimacy Audit

> Not applicable — this phase installs NO external packages. All libraries used are already in `package.json` and were vetted in prior milestones. If a dnd library is later proposed, run the Package Legitimacy Gate on it first.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                          ┌─────────────────────────────────────────────┐
                          │  CRM console  (app/(crm)/admin/*)            │
                          │  guarded by layout: is_admin via JWT         │
                          └─────────────────────────────────────────────┘
                                          │
   ┌──────────────────────┬──────────────┼───────────────────┬─────────────────────┐
   │                      │              │                   │                     │
   ▼                      ▼              ▼                   ▼                     ▼
[Pipeline page]      [Negocios dir]   [Ficha → Timeline]  [Server actions]    [Onboarding finish]
 RSC service-role     RSC service-role  RSC SESSION client  requireAdmin +      (owner session)
 reads deals+tags     + tag filter      reads crm_timeline  zod + service-role        │
   │                      │              (RLS-gated VIEW)    + logAudit               │ POST
   │ drag card            │ filter chips      │                  │                    ▼
   ▼ (client)             ▼ (in-mem OR)       ▼ render        ┌───┴────┐      [link-lead server action]
[moveDeal action]    [shared tags]      filter chips         │ writes │       service-role:
   │                                    Notas/Tareas/Cambios  ▼        ▼       match lead by email,
   └──────────────────┬─────────────────────┬───────────────┘   logAudit     deal→won, set business_id
                      ▼                      ▼                  (audit_log)         │
              ┌───────────────────────────────────────────────────────────────────┘
              ▼
   ┌──────────────────────────── Postgres (migration 034) ───────────────────────────┐
   │  leads ── deals (1:N)        tags ──< entity_tags >── leads / businesses          │
   │  notes      tasks            audit_log (031, existing)                            │
   │  ALL admin-only RLS (is_admin via app_metadata JWT, mirror of 031/032)           │
   │                                                                                   │
   │  VIEW crm_timeline  WITH (security_invoker = true)  =                             │
   │     UNION ALL of: audit_log (by business_id) + notes + tasks                      │
   │     shape: kind, actor_type, title, body, occurred_at, metadata                   │
   │     ORDER BY occurred_at DESC                                                      │
   └───────────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
Mirror the existing CRM layout (verified file layout under `app/(crm)/admin/`):
```
app/(crm)/admin/
├── _actions.ts                 # EXISTING — add pipeline/tag/note/task actions here OR a new _actions file per domain
├── _actions.schemas.ts         # EXISTING — add new zod schemas here (pure module, no 'use server')
├── pipeline/
│   ├── page.tsx                # RSC: service-role read of deals+leads+tags, $ totals
│   └── pipeline-client.tsx     # client: kanban columns, native HTML5 DnD, tag filter chips
├── negocios/
│   ├── page.tsx                # EXISTING — extend to also load tags/assignments
│   └── negocios-client.tsx     # EXISTING — add tag filter chips (mirror Tabs/useMemo filter)
│   └── [id]/
│       ├── page.tsx            # EXISTING — also fetch crm_timeline for the [id]
│       └── ficha-client.tsx    # EXISTING — fill the "Timeline (PRONTO)" tab; add tags row
components/crm/
├── tag-chip.tsx                # new: color dot + text chip (toggle for filter)
├── timeline-entry.tsx          # new: icon + title + actor badge + body + relative ts
└── (reuse) confirm-dialog.tsx, status-badge.tsx, risk-badge.tsx
lib/
├── crm-pipeline.ts             # new: STAGES constant (key/label/color/order), pure helpers
├── crm-tags.ts                 # new: tag filter (OR semantics) pure helper, mirror crm-directory.ts
└── crm-timeline.ts             # new: timeline row type + presentation helpers (reuse formatWhen)
supabase/migrations/
└── 034_crm_pipeline_tags_timeline.sql   # the ONE migration for this phase
```

### Pattern 1: Admin-only table + RLS (mirror of 031/032) — LOCKED by D-14
**What:** Every new table enables RLS in the same migration; SELECT policy reads `is_admin` from the JWT `app_metadata`; NO insert/update/delete policy (writes are service-role-only → not falsifiable by clients).
**When to use:** All six new tables.
**Example:**
```sql
-- Source: supabase/migrations/031_crm_audit_log.sql (verbatim pattern) [VERIFIED: in-repo]
alter table public.deals enable row level security;

drop policy if exists "admin read deals" on public.deals;
create policy "admin read deals" on public.deals
  for select
  using ((select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true');
-- NO insert/update/delete policy: only service-role (createAdminClient) writes.
-- NEVER using(true) — that was the 029 hole; the predicate ALWAYS checks is_admin.
```

### Pattern 2: Stage as `text` column with CHECK — LOCKED by D-03
**What:** No Postgres enum. A single TS constant `STAGES` is the source of truth; the DB column is `text` with a CHECK listing the 5 stage keys.
**Example:**
```sql
-- Source: pattern documented in 032 ("plan_status es text libre"); D-03 [VERIFIED: in-repo + CONTEXT]
stage text not null default 'lead'
  check (stage in ('lead','calificado','trial','propuesta','pago')),
status text not null default 'open'
  check (status in ('open','won','lost')),   -- D-04: status separate from stage
```
```typescript
// lib/crm-pipeline.ts — single source of truth (D-03). Phase 5 RPT-02 consumes this.
export const STAGES = [
  { key: 'lead',       label: 'Lead',       color: 'var(--muted-foreground)', order: 0 }, // gris
  { key: 'calificado', label: 'Calificado', color: 'var(--crm-info)',         order: 1 }, // azul
  { key: 'trial',      label: 'Trial',      color: 'var(--primary)',          order: 2 }, // amarillo
  { key: 'propuesta',  label: 'Propuesta',  color: 'var(--primary)',          order: 3 }, // ámbar
  { key: 'pago',       label: 'Pago',       color: 'var(--crm-success)',      order: 4 }, // verde
] as const
```
> Confirm exact CSS token names against `app/globals.css` `.crm-shell` scope during planning (`--crm-info`, `--crm-success`, `--crm-danger` are referenced in ficha-client.tsx [VERIFIED]).

### Pattern 3: `security_invoker` VIEW for the timeline — CRITICAL, opposite of repo's public views
**What:** A view that UNIONs `audit_log` + `notes` + `tasks` into a common shape, read through the operator's *session* client so the `audit_log` admin-read RLS policy is enforced.
**When to use:** The `crm_timeline` VIEW (D-11).
**Example:**
```sql
-- Source: D-11 + audit RLS (031) + view-RLS gotcha (027 documents the inverse) [VERIFIED]
-- security_invoker = true → the view runs with the CALLER's privileges, so the
-- "admin read audit_log" RLS policy on the base table IS enforced. WITHOUT it,
-- the view runs as its owner (security-definer, Postgres default) and would BYPASS
-- the admin gate. This is the OPPOSITE of public_services/public_business_hours (027),
-- which intentionally use security-definer to bypass RLS for anon reads.
create or replace view public.crm_timeline
  with (security_invoker = true) as
  select
    'cambio'::text       as kind,
    case when actor_id is null then 'sistema' else 'operador' end as actor_type,
    action               as title,
    reason               as body,
    created_at           as occurred_at,
    metadata             as metadata,
    business_id          as business_id
  from public.audit_log
  union all
  select 'nota', 'operador', 'Nota', body, created_at, '{}'::jsonb, business_id
  from public.notes
  union all
  select 'tarea', 'operador',
         case when done then 'Tarea completada' else 'Tarea creada' end,
         title, coalesce(completed_at, created_at), '{}'::jsonb, business_id
  from public.tasks;
-- read it with the SESSION client (createClient()), filtered by business_id, like auditoria/page.tsx.
```
> Note: notes/tasks tables ALSO have their own admin-read RLS policies, so even with `security_invoker` every branch is gated. The view does not need its own GRANT to anon — it is admin-console-only.

### Pattern 4: Server action (mirror of every Phase-2 action) — LOCKED by D-14
**What:** Fixed order: `requireAdmin()` first → `schema.parse(input)` → `createAdminClient()` (service-role) → read prev state if audit needs `{from,to}` → mutate → `logAudit({...})` → `revalidatePath(...)`.
**Example:**
```typescript
// Source: app/(crm)/admin/_actions.ts (changePlan) [VERIFIED: in-repo]
export async function moveDeal(input: unknown): Promise<void> {
  const actor = await requireAdmin()              // 1. ALWAYS first — actions are POST endpoints
  const data = moveDealSchema.parse(input)        // 2. untrusted input validated
  const admin = createAdminClient()               // 3. service-role (bypasses RLS)
  const { data: prev } = await admin.from('deals').select('stage').eq('id', data.dealId).single()
  const { error } = await admin.from('deals').update({ stage: data.stage }).eq('id', data.dealId)
  if (error) throw new Error('update_failed')
  await logAudit({ actorId: actor.id, action: 'deal.stage_change', targetType: 'deal',
    targetId: data.dealId, businessId: data.businessId ?? null, risk: 'bajo',
    metadata: { from: prev?.stage ?? null, to: data.stage } })  // 5. exact action code
  revalidatePath('/admin/pipeline')               // 6. revalidate
}
```

### Pattern 5: Lead→business link from onboarding (service-role, booking-style isolation) — D-05/D-06
**What:** After `handleFinish()` inserts the `businesses` row in onboarding (owner session), call a server action/route that runs service-role to match a lead by normalized email and link it. The owner session CANNOT touch `leads`/`deals` (admin-only RLS) — only service-role can.
**Where:** New server action invoked from `app/(onboarding)/onboarding/page.tsx` `handleFinish()` right after the `businesses` insert succeeds (or a route handler called with the new `business.id`).
**Anti-tampering:** Resolve the lead by the AUTHENTICATED owner's email (from `supabase.auth.getUser()` server-side), NOT from a client-supplied email/lead id. Mirror the booking rule: never trust an id from the client; re-derive the scope server-side. If no lead matches → create a lead already in `won`/converted state with `business_id` set (D-06).
```typescript
// Pattern: createAdminClient() server-side, email from server session, not from the body.
// This is the ONLY place a non-admin flow touches admin-only tables — keep it minimal & isolated.
```

### Anti-Patterns to Avoid
- **Reading `crm_timeline` / `audit_log` with service-role.** The audit viewer deliberately uses the SESSION client so RLS enforces the admin gate (documented as threat T-01-09 in `auditoria/page.tsx`). Service-role would bypass RLS. Read the timeline with `createClient()`.
- **A `security_invoker`-less timeline view.** It would run security-definer (Postgres default) and bypass the admin gate, or if granted to anon, leak. Always `WITH (security_invoker = true)`.
- **Writing `leads`/`deals` from the owner's onboarding session.** RLS blocks it (no write policy) and it would be a tenant-isolation violation. Use service-role server-side only.
- **Trusting a client-supplied lead id / email for conversion.** Re-derive from the server session (booking anti-tampering rule, AGENTS/CLAUDE.md).
- **Adding a dnd dependency without flagging it.** Violates the developer's vendor rule. Native HTML5 DnD first; flag if insufficient.
- **`using(true)` on any new RLS policy.** This was the 029 security hole. Predicate ALWAYS checks `is_admin`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Modal / focus trap / Escape / outside-click for convert/lost confirm | Custom overlay | `ConfirmDialog` (`components/crm/confirm-dialog.tsx`) | Already handles type-to-confirm, requireReason, anti-double-submit, a11y [VERIFIED] |
| Risk/status pills | New badge | `RiskBadge`, `StatusBadge` (`components/crm/`) | Existing, themed [VERIFIED] |
| Audit write | Custom insert | `logAudit()` (`lib/audit.ts`) — `{ actorId, action, targetType, targetId, businessId, risk, reason, metadata }` | Best-effort, service-role, non-falsifiable [VERIFIED] |
| Admin authorization | Custom check | `requireAdmin()` (`lib/admin-guard.ts`) — throws `unauthorized`/`forbidden`, returns `User` | Re-validates per action (layout guard doesn't cover direct POSTs) [VERIFIED] |
| In-memory list filtering (tag filter) | New filter engine | Mirror `filterBusinesses` (`lib/crm-directory.ts`) + `useMemo` pattern in `negocios-client.tsx` | Proven pattern; OR semantics is a simple `.some()` over selected tags [VERIFIED] |
| Relative timestamp ("Hoy · 13:22") | Custom date formatter | `formatWhen()` pattern in `auditoria-client.tsx` (Intl + AR_TZ) | Already handles Hoy/Ayer/date in `America/Argentina/Buenos_Aires` [VERIFIED] |
| CSV export (if pipeline/timeline export wanted) | New lib | `rowsToCsv` + Blob pattern in `negocios-client.tsx`/`auditoria-client.tsx` | Client-side, RFC-4180, BOM, no lib [VERIFIED] |
| Timeline aggregation | Materialized table + triggers | `crm_timeline` `security_invoker` VIEW | D-11; avoids dual-write/drift on audit source-of-truth |

**Key insight:** The entire phase is reuse-first. The only genuinely NEW primitive is the kanban DnD interaction; everything else has a verified in-repo precedent the planner should reference by file path.

## Runtime State Inventory

> This is a greenfield feature phase (new tables, new UI), NOT a rename/refactor/migration. The categories below are checked for completeness.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — `leads`/`deals`/`tags`/`notes`/`tasks` do not exist yet (verified: no matching `create table` in `supabase/`). | New migration 034 creates them. |
| Live service config | None — no external service stores pipeline/tag state. | None. |
| OS-registered state | None — no cron, no OS task touches this phase (Vercel daily cron unrelated). | None. |
| Secrets/env vars | None new — reuses `SUPABASE_SERVICE_ROLE_KEY` (already present, server-only). | None. |
| Build artifacts | None — no compiled package renamed. After applying 034 by hand, regenerate `supabase/schema.sql` via `supabase db dump` (the documented post-deploy TODO in 031/032/033). | Operational, non-blocking. |

**Post-migration operational note (from 031/032/033 headers):** after applying 034 by hand in Supabase, regenerate `supabase/schema.sql`. MEMORY also notes `schema.sql` is currently out of date from Phase 1 — flag for the planner but it does not block this phase.

## Common Pitfalls

### Pitfall 1: Timeline VIEW bypasses or breaks the admin gate
**What goes wrong:** A plain `CREATE VIEW` runs security-definer (Postgres default), so the `audit_log` admin-read RLS is NOT applied to reads through the view; either it leaks (if granted broadly) or behaves inconsistently.
**Why it happens:** Every existing repo view (027) intentionally uses security-definer to bypass RLS for anon — copying that pattern here is exactly wrong.
**How to avoid:** `create or replace view public.crm_timeline with (security_invoker = true) as ...` and read it with the SESSION client (`createClient()`), filtered by `business_id`, exactly like `auditoria/page.tsx`.
**Warning signs:** Timeline shows rows to a non-admin in a test; or shows rows when read with service-role but not session client (means the gate isn't where you think).

### Pitfall 2: Conversion wired to the wrong file
**What goes wrong:** Planner wires lead→business link into `app/(auth)/register/page.tsx` and it never fires, because the `businesses` row is created later in onboarding.
**Why it happens:** The CONTEXT canonical-refs name `register/page.tsx` as the integration point, but register only does `auth.signUp()` + redirect; the actual `businesses` INSERT is in `app/(onboarding)/onboarding/page.tsx` → `handleFinish()`.
**How to avoid:** Hook the conversion to the successful `businesses` insert in onboarding `handleFinish()` (call a service-role server action with the new `business.id`), not to register.
**Warning signs:** A lead with a matching email stays unlinked after a real signup test.

### Pitfall 3: Owner session tries to write admin-only tables
**What goes wrong:** Conversion code uses the owner's `createClient()` session to write `deals`/`leads`; RLS silently blocks the write (no write policy) and the link never persists.
**Why it happens:** Onboarding runs under the owner's anon session.
**How to avoid:** All `leads`/`deals` writes — including the conversion — go through service-role server-side. Re-derive the owner email from the server session (anti-tampering).
**Warning signs:** No error but no row written; or a permissions error in logs.

### Pitfall 4: Server action invoked directly bypasses the UI guard
**What goes wrong:** `moveDeal`, `convertLead`, `deleteNote`, etc. are POST endpoints; a direct call skips the ConfirmDialog and the layout guard.
**Why it happens:** Documented as Pitfall 2 / T-02-04 in `_actions.ts`.
**How to avoid:** `requireAdmin()` as the FIRST line of every action; `zod.parse(input)` second.
**Warning signs:** An action that mutates before calling `requireAdmin()`.

### Pitfall 5: New dependency added silently for DnD
**What goes wrong:** Installing `@dnd-kit` / `react-beautiful-dnd` without flagging violates the vendor rule and adds bundle weight for a single-operator board.
**How to avoid:** Native HTML5 DnD (`draggable`, `onDragStart`/`onDragOver`/`onDrop`). If a11y/touch is deemed essential, insert a `checkpoint:human-verify` to approve the dep first.
**Warning signs:** A `npm install` step appears in the plan without an approval checkpoint.

### Pitfall 6: Optimistic DnD persists before the server confirms
**What goes wrong:** Card visually moves, server action fails, board now lies.
**Why it happens:** Optimistic UI without rollback (project anti-pattern: "no persistir optimista en flujos async" — though that rule targets payments, the spirit applies).
**How to avoid:** On drop, call the action; on failure, toast + revert (or `revalidatePath` re-reads truth). Keep the move auditable via `logAudit`.

## Code Examples

All verified patterns live in-repo; reference these exact files when planning task actions:

### Admin-only RLS table
`supabase/migrations/031_crm_audit_log.sql` lines 47–62 (RLS enable + admin-read policy, no write policy).

### Service action contract
`app/(crm)/admin/_actions.ts` lines 16–69 (`changePlan`: the canonical 6-step order) + `_actions.schemas.ts` (pure zod module, no `'use server'`, importable in tests).

### Session-client RLS-gated read (model for timeline)
`app/(crm)/admin/auditoria/page.tsx` lines 20–38 (reads `audit_log` with `createClient()`, RLS is the gate).

### In-memory tag-style filter
`app/(crm)/admin/negocios/negocios-client.tsx` lines 136–158 (`useMemo` + `filterBusinesses` + Tabs) — replicate for OR-semantics tag chips.

### Relative timestamp + action label map (timeline reuse)
`app/(crm)/admin/auditoria/auditoria-client.tsx` lines 38–74 (`formatWhen`, `ACTION_LABEL`) — the timeline "Cambios" branch should reuse these labels so audit + timeline read consistently.

### Ficha tab placeholder to fill
`app/(crm)/admin/negocios/[id]/ficha-client.tsx` lines 115–132 (the `role="tablist"` with "Timeline (PRONTO)" disabled span — this phase makes it a real tab).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `is_admin` as a column | `is_admin` in `auth.users.app_metadata` (JWT) | Phase 1 (031) | Policies read JWT, not a column — replicate verbatim |
| Wildcard `select('*')` | Explicit non-sensitive column SELECT | Phase 2 | New reads must list columns explicitly |
| `middleware.ts` | `proxy.ts` (Next 16) | repo baseline | This phase doesn't touch middleware, but don't reference `middleware.ts` |
| `params` sync | `params: Promise<{id}>` → `await params` (Next 16) | repo baseline | New dynamic routes (`pipeline/[?]`, ficha) must await params |

**Deprecated/outdated:** none relevant to this phase. Next 16 conventions apply (RSC default, server actions, `after()` for best-effort side effects, `await params`).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Native HTML5 Drag & Drop is acceptable for the single-operator desktop kanban (no dnd lib). | Standard Stack / Pitfall 5 | If the operator needs touch/mobile DnD or strong a11y, may need `@dnd-kit` (flagged dep). Low risk — board is desktop operator tool. |
| A2 | CSS tokens `--crm-info`/`--crm-success`/`--crm-danger`/`--primary` exist in the `.crm-shell` scope for stage colors. | Pattern 2 | If a token is missing, stage colors fall back wrong. Verify against `app/globals.css` during planning. Referenced in ficha-client.tsx so likely present. |
| A3 | Notes/Tasks need their own admin-read RLS policies (the timeline VIEW alone is not the gate). | Pattern 3 note | If omitted, a direct read of `notes`/`tasks` (not via view) could be unprotected. Mitigated by always giving each table the 031 policy. |
| A4 | The conversion should be triggered from onboarding `handleFinish()` via a service-role server action. | Pattern 5 / Pitfall 2 | If product wants conversion only at a different lifecycle point, the trigger location changes. The email-match + service-role mechanics stay the same. |
| A5 | Stage keys are `lead/calificado/trial/propuesta/pago` (Spanish, from the mock labels). | Pattern 2 | If the team prefers English keys, change the constant + CHECK. Low risk — D-03 says the constant is source of truth. |

## Open Questions (RESOLVED)

1. **Where exactly should the auto-conversion fire — client `handleFinish()` calling a server action, or a dedicated route handler?**
   - What we know: `businesses` is inserted client-side in onboarding under the owner session; admin-only tables need service-role.
   - What's unclear: whether to add a server action imported into the onboarding client, or a `/api/crm/link-lead` route handler (booking-style).
   - Recommendation: a server action is the lighter, in-pattern choice (Phase 2 uses server actions everywhere). Re-derive the owner email server-side. Planner decides; both satisfy D-05/D-06.
   - **RESOLVED:** Auto-conversion fires via a **service-role server action** (`linkLeadOnSignup`) invoked from onboarding `handleFinish()` (NOT a route handler). The owner email is re-derived server-side from the session; the call is best-effort try/catch so a failure never breaks the onboarding. See Plan 04-02 Task 1 + Task 3.

2. **Single `entity_tags` join with an `entity_type` discriminator, or two join tables (`lead_tags`, `business_tags`)?**
   - What we know: D-08 says one shared catalog assigned to both leads and businesses.
   - Recommendation: one `entity_tags(tag_id, entity_type check in ('lead','business'), entity_id, ...)` join — simplest, matches "un solo catálogo compartido". Planner finalizes shape (Claude's discretion per CONTEXT).
   - **RESOLVED:** A **single `entity_tags` join** with an `entity_type` discriminator (`check in ('lead','business')`) + unique index `(tag_id, entity_type, entity_id)` — matches D-08 (one shared catalog for both leads and businesses). No `lead_tags`/`business_tags` split. See Plan 04-01 Task 1.

3. **Pagination of the timeline VIEW (keyset vs limit/offset).**
   - What we know: CONTEXT marks this as Claude's discretion; volume per business is low (single operator).
   - Recommendation: simple `.order('occurred_at', { ascending: false }).limit(N)` (mirrors auditoria's `.limit(100)`); keyset is over-engineering at this volume but is the documented upgrade path if needed.
   - **RESOLVED:** Timeline pagination uses **`.limit(100)`** (limit/offset over the VIEW, ordered `occurred_at` desc), mirroring auditoria's `.limit(100)`. Keyset is the documented upgrade path but is over-engineering at this single-operator volume. See Plan 04-03 Task 2.

## Environment Availability

> This phase has no NEW external dependencies. Supabase (existing) and the service-role key (existing, server-only) are the only infra. No new CLI/runtime/service is introduced. Migrations are applied by hand in the Supabase dashboard (existing workflow). Section otherwise not applicable.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase (Postgres + RLS) | All tables/VIEW | ✓ | existing | — |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role writes, conversion | ✓ | existing (server-only) | — |
| `supabase` CLI (for `db dump`) | Regenerate schema.sql post-migration | ✓ (used in prior phases) | — | Manual schema sync |

**Missing dependencies with no fallback:** none.

## Project Constraints (from CLAUDE.md / AGENTS.md)

- **Next.js 16, NOT 14** — middleware is `proxy.ts`; `params` is a Promise (`await params`); consult `node_modules/next/dist/docs/` before assuming framework behavior. This phase only adds RSC pages + server actions (no middleware change).
- **Multi-tenant isolation is non-negotiable** — every CRM query filters by `business_id`/`lead_id`; admin-only tables gated by `is_admin` JWT; service-role only server-side (`@/lib/supabase/admin`).
- **Migrations numbered, applied by hand, in order** — next is `034`; coordinate with deploy; regenerate `schema.sql` after.
- **Dev env Windows + PowerShell** — plan commands accordingly (bash here is Git Bash; runtime is PowerShell).
- **Error/response conventions** — server actions throw `'update_failed'` etc.; comments in Spanish explaining the *why* of non-obvious decisions; `console.error('[modulo/accion]', ...)` logging.
- **No new dependency without flagging** (developer vendor rule) — applies to any dnd library.
- **UI fidelity is load-bearing** — reproduce mocks `02-pipeline.png`, `03-negocios.png`, `04-ficha-resumen.png`, `05-ficha-timeline.png` faithfully; UI-SPEC was intentionally skipped — the mocks + CONTEXT `<specifics>` are the design contract (do NOT generate a UI-SPEC).

## Sources

### Primary (HIGH confidence — in-repo, verified this session)
- `supabase/migrations/031_crm_audit_log.sql` — admin-only RLS pattern, audit_log columns, `is_admin` via JWT.
- `supabase/migrations/032_crm_admin.sql` — plan_prices admin-read pattern, `text`+CHECK precedent, owner-column protection trigger.
- `supabase/migrations/033_audit_actor_nullable.sql` — nullable actor (system actions).
- `supabase/migrations/027_business_secrets_and_public_views.sql` lines 73–112 — view security-definer-vs-invoker gotcha (the inverse of what timeline needs).
- `app/(crm)/admin/_actions.ts` + `_actions.schemas.ts` — server-action 6-step contract + zod-in-pure-module pattern.
- `app/(crm)/admin/auditoria/page.tsx` + `auditoria-client.tsx` — session-client RLS-gated read; `formatWhen`/`ACTION_LABEL`; CSV export.
- `app/(crm)/admin/negocios/page.tsx` + `negocios-client.tsx` + `[id]/page.tsx` + `[id]/ficha-client.tsx` — RSC service-role read, in-memory filter, ficha Timeline placeholder.
- `app/(auth)/register/page.tsx` + `app/(onboarding)/onboarding/page.tsx` — true conversion integration point (onboarding, not register).
- `lib/audit.ts`, `lib/admin-guard.ts`, `lib/supabase/admin.ts` — `logAudit`/`requireAdmin`/`createAdminClient` signatures.
- `components/crm/confirm-dialog.tsx`, `crm-sidebar.tsx` — reusable ConfirmDialog; sidebar already has "Pipeline" (soon) + "Negocios" entries.
- `package.json` — no dnd lib; all needed libs present; next 16.2.7, react 19.2.4, zod 4.4.3.
- `.claude/skills/supabase-multitenant-rls/SKILL.md` — RLS/service-role rules.
- `04-CONTEXT.md` — 15 LOCKED decisions D-01..D-15.

### Secondary / Tertiary
- None — no external lookups were necessary; all findings are from in-repo source.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against package.json; no new deps.
- Architecture / RLS patterns: HIGH — copied verbatim from applied migrations + existing CRM actions.
- Conversion integration point: HIGH — traced register → onboarding insert in source.
- Timeline VIEW security_invoker: HIGH — confirmed against the repo's documented inverse view pattern (027).
- DnD verdict: HIGH that no lib is bundled; MEDIUM that native DnD is sufficient (depends on a11y/touch expectations — see A1).

**Research date:** 2026-06-20
**Valid until:** 2026-07-20 (stable; in-repo patterns change only with new migrations/phases)
