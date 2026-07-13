# Phase 4: Pipeline, Tags & Timeline - Pattern Map

**Mapped:** 2026-06-20
**Files analyzed:** 14 (8 new, 6 modified)
**Analogs found:** 14 / 14 (all in-repo, verified)

> This phase is reuse-first. Every pattern has a verified in-repo precedent. The only genuinely new primitive is the kanban drag-and-drop interaction (native HTML5 DnD — no new dependency). Do NOT generate a UI-SPEC: the mocks (`02-pipeline.png`, `03-negocios.png`, `04-ficha-resumen.png`, `05-ficha-timeline.png`) + CONTEXT `<specifics>` are the design contract.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/034_crm_pipeline_tags_timeline.sql` | migration | CRUD + view | `supabase/migrations/031_crm_audit_log.sql` | exact (RLS admin-only) |
| `app/(crm)/admin/_actions.ts` (extend) | server-action | CRUD (auditable) | same file, `changePlan` (lines 46-69) | exact |
| `app/(crm)/admin/_actions.schemas.ts` (extend) | config/schema | validation | same file (lines 1-40) | exact |
| `app/(crm)/admin/pipeline/page.tsx` | route (RSC) | request-response (service-role read) | `negocios/page.tsx` | role-match |
| `app/(crm)/admin/pipeline/pipeline-client.tsx` | component (client) | event-driven (DnD) + in-mem filter | `negocios/negocios-client.tsx` | role-match |
| `app/(crm)/admin/negocios/page.tsx` (modify) | route (RSC) | request-response | self (load tags too) | exact |
| `app/(crm)/admin/negocios/negocios-client.tsx` (modify) | component (client) | in-mem filter | self (lines 136-163) | exact |
| `app/(crm)/admin/negocios/[id]/page.tsx` (modify) | route (RSC) | request-response (session read) | `auditoria/page.tsx` | role-match |
| `app/(crm)/admin/negocios/[id]/ficha-client.tsx` (modify) | component (client) | render + filter chips | `auditoria-client.tsx` | role-match |
| `app/(onboarding)/onboarding/page.tsx` (modify) | component (client) | event-driven (trigger conversion) | self `handleFinish` (lines 164-220) | exact |
| `components/crm/tag-chip.tsx` | component | render/toggle | `components/crm/status-badge.tsx` / `risk-badge.tsx` | role-match |
| `components/crm/timeline-entry.tsx` | component | render | `auditoria-client.tsx` row render | role-match |
| `lib/crm-pipeline.ts` | utility | transform (STAGES const + helpers) | `lib/crm-directory.ts` | role-match |
| `lib/crm-timeline.ts` + `lib/crm-tags.ts` | utility | transform (pure filter/format) | `lib/crm-directory.ts` `filterBusinesses` (line 58) | role-match |

## Pattern Assignments

### `supabase/migrations/034_crm_pipeline_tags_timeline.sql` (migration, CRUD + view)

**Analog:** `supabase/migrations/031_crm_audit_log.sql`

**Admin-only RLS — verbatim pattern** (031 lines 47-62). Replicate for EVERY new table (`leads`, `deals`, `tags`, `entity_tags`, `notes`, `tasks`): enable RLS in the same migration, ONE SELECT policy reading `is_admin` from the JWT `app_metadata`, NO insert/update/delete policy (writes are service-role-only → not falsifiable):
```sql
alter table public.audit_log enable row level security;

drop policy if exists "admin read audit_log" on public.audit_log;
create policy "admin read audit_log" on public.audit_log
  for select
  using ((select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true');
-- NUNCA usar using(true) (agujero de la migración 029).
-- Sin policy de insert/update/delete → solo service-role (createAdminClient) escribe.
```

**Column/index/comment conventions** (031 lines 24-45): `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()`, `metadata jsonb not null default '{}'::jsonb`, `risk` as `text ... check (...)`, FKs `on delete set null` to preserve history, dense Spanish comments explaining the *why*, section separators `-- ── N. … ──`, indexes `create index if not exists <table>_<col>_idx`. Header must note the post-deploy TODO: regenerate `supabase/schema.sql` after applying 034 by hand.

**Stage/status as `text` + CHECK** (LOCKED D-03/D-04 — precedent: `plan_status` text-libre in 032):
```sql
stage text not null default 'lead'
  check (stage in ('lead','calificado','trial','propuesta','pago')),
status text not null default 'open'
  check (status in ('open','won','lost')),
```

**`crm_timeline` VIEW with `security_invoker = true`** (CRITICAL — opposite of 027 public views; see Pitfall below). UNION of `audit_log` (by `business_id`) + `notes` + `tasks` into common shape (`kind, actor_type, title, body, occurred_at, metadata, business_id`), `order by occurred_at desc`. The `security_invoker` flag makes the view run with the CALLER's privileges so the base-table admin-read RLS is INHERITED. Without it the view runs security-definer (Postgres default) and bypasses the gate. notes/tasks must ALSO get their own 031-style admin-read policy (defense in depth).

---

### `app/(crm)/admin/_actions.ts` — new actions (server-action, CRUD/auditable)

**Analog:** same file, `changePlan` (lines 46-69)

**6-step contract — fixed order, LOCKED by D-14** (documented in header lines 16-31). Apply to `createDeal`, `moveStage`, `convertLead`, `assignTag`, `createTag`, `editTag`, `createNote`, `editNote`, `deleteNote`, `createTask`, `completeTask`:
```typescript
export async function changePlan(input: unknown): Promise<void> {
  const actor = await requireAdmin()                       // 1. ALWAYS first (action = POST endpoint)
  const data = changePlanSchema.parse(input)               // 2. untrusted input validated
  const admin = createAdminClient()                        // 3. service-role (bypasses RLS)
  const { data: prev } = await admin.from('businesses')    // 4. read prev for {from,to} if audited
    .select('plan').eq('id', data.businessId).single()
  const { error } = await admin.from('businesses')
    .update({ plan: data.plan }).eq('id', data.businessId)
  if (error) throw new Error('update_failed')              // throw snake error code
  await logAudit({ actorId: actor.id, action: 'plan.change', targetType: 'business',
    targetId: data.businessId, businessId: data.businessId, risk: 'medio',
    metadata: { from: prev?.plan ?? null, to: data.plan } })  // 5. exact action code
  revalidatePath(fichaPath(data.businessId))               // 6. revalidate affected path(s)
}
```

**New action codes** must be registered in the `ACTION_LABEL` map (see auditoria-client below) so audit + timeline read consistently — do NOT invent labels in two places. Suggested codes: `deal.create`, `deal.stage_change`, `lead.convert`, `tag.assign`, `note.create`, `note.delete`, `task.complete`. Imports/helpers reuse: `requireAdmin` (`@/lib/admin-guard`), `logAudit` (`@/lib/audit`), `createAdminClient` (`@/lib/supabase/admin`), `revalidatePath`, `fichaPath()` helper (lines 34-36).

---

### `app/(crm)/admin/_actions.schemas.ts` — new zod schemas (config, validation)

**Analog:** same file (lines 1-40)

Pure module, NO `'use server'` (importable from Vitest). Reuse `const businessId = z.uuid()` (line 19). `text` enums become `z.enum([...] as const)` calqued from the single source of truth (here `STAGES` keys in `lib/crm-pipeline.ts`). Pattern for each schema:
```typescript
export const moveDealSchema = z.object({
  dealId: z.uuid(),
  stage: z.enum(['lead','calificado','trial','propuesta','pago']),
  businessId: z.uuid().nullable().optional(),
})
```

---

### `app/(crm)/admin/pipeline/page.tsx` (route RSC, service-role read)

**Analog:** `app/(crm)/admin/negocios/page.tsx`

RSC default. The board read of `deals`+`leads`+`tags` for the operator mirrors the negocios directory: explicit-column SELECT (no `*` — State of the Art), pass plain rows to the client component, compute `$ abiertos / $ ganados` totals. Note: the pipeline read MAY use service-role like negocios (research's Responsibility Map row 1), but the timeline read (ficha) MUST use the session client (see ficha below). Await `params` (Next 16) on any dynamic segment.

---

### `app/(crm)/admin/pipeline/pipeline-client.tsx` (component, event-driven DnD + in-mem filter)

**Analog:** `app/(crm)/admin/negocios/negocios-client.tsx` (lines 136-163) for the in-memory filter; native HTML5 DnD is new.

**In-memory tag filter** mirrors the `useMemo` + filter-helper + matched-ids pattern:
```typescript
const filtered = useMemo(() => {
  const directoryRows = rows.map(toDirectoryRow)
  const matchedIds = new Set(filterBusinesses(directoryRows, { query, tab }).map((r) => r.id))
  return rows.filter((r) => matchedIds.has(r.id))
}, [rows, query, tab])
```
For tags use OR semantics (D-09): `selected.length === 0 || selected.some((t) => row.tagIds.includes(t))`. Put the pure filter in `lib/crm-tags.ts` (mirror of `filterBusinesses`).

**DnD (new):** native HTML5 `draggable` + `onDragStart`/`onDragOver`/`onDrop`. On drop call `moveStage` action; on failure toast + revert / `revalidatePath` re-reads truth (Pitfall 6 — no lying optimistic state). NO new dependency without a `checkpoint:human-verify` (Pitfall 5). Stage columns/colors come from the `STAGES` constant.

---

### `app/(crm)/admin/negocios/[id]/page.tsx` + `ficha-client.tsx` (route + component, session read + render)

**Analog:** `app/(crm)/admin/auditoria/page.tsx` (lines 20-38) for the read; `auditoria-client.tsx` (lines 37-74) for formatting.

**Timeline read — SESSION client, NOT service-role** (the RLS gate is the security, not the client). Mirror auditoria/page.tsx exactly:
```typescript
const supabase = await createClient()                       // session client → RLS enforced
const { data, error } = await supabase
  .from('crm_timeline')                                     // the security_invoker VIEW
  .select('kind, actor_type, title, body, occurred_at, metadata, business_id')
  .eq('business_id', id)                                    // filter by entity (no cross leak)
  .order('occurred_at', { ascending: false })
  .limit(100)                                               // limit/offset is fine at this volume
```

**Relative timestamp + label map — reuse verbatim** (auditoria-client.tsx lines 37-74): `formatWhen()` (Hoy · / Ayer · / `14 jun ·`, `America/Argentina/Buenos_Aires`) and the `ACTION_LABEL` map. The timeline "Cambios" branch must reuse the SAME labels.

**Ficha tab to fill** (ficha-client.tsx lines 115-132): the `role="tablist"` currently has a disabled `Timeline (PRONTO)` span. This phase makes it a real selectable tab (state-driven, `aria-selected`) and renders the timeline + filter chips (Todo/Mensajes/Llamadas/Notas/Tareas/Cambios — Mensajes/Llamadas show empty state per D-13). Also add the tags row with "+ Tag" in the Resumen tab.

---

### `app/(onboarding)/onboarding/page.tsx` (component, trigger conversion)

**Analog:** self, `handleFinish()` (lines 164-220) — this is the TRUE integration point, NOT `register/page.tsx` (Pitfall 2).

The `businesses` row is INSERTed here client-side under the owner's session (lines 180-198). Right AFTER that insert succeeds, call a new service-role server action (e.g. `linkLeadToBusiness({ businessId: business.id })`) to match a lead by the owner's normalized email and link it (deal→`won`, set `business_id`); if no match, create a lead already converted (D-06). The owner session CANNOT write `leads`/`deals` (admin-only RLS, Pitfall 3) — the action runs service-role server-side. **Anti-tampering:** re-derive the owner email from `supabase.auth.getUser()` SERVER-SIDE inside the action, never from a client-supplied value (booking rule). Wrap the call so a conversion failure does not break onboarding (best-effort, mirror the existing try/catch + `console.error`).

> This is the ONLY place a non-admin flow touches admin-only tables — keep it minimal and isolated, mirroring the booking public service-role pattern (`lib/supabase/admin.ts` `createAdminClient()`).

---

### `components/crm/tag-chip.tsx` + `timeline-entry.tsx` (components, render)

**Analog:** `components/crm/status-badge.tsx` / `risk-badge.tsx` (themed pills); `auditoria-client.tsx` row render for the timeline entry (icon + title + actor badge + body + relative ts). Reuse `lucide-react` icons, `--crm-info`/`--crm-success`/`--crm-danger`/`--primary` tokens (confirm exact names in `app/globals.css` `.crm-shell` scope during planning — A2). Actor badge variants OPERADOR/CLIENTE/IA/SISTEMA per mock `05-ficha-timeline.png`.

---

### `lib/crm-pipeline.ts` / `lib/crm-tags.ts` / `lib/crm-timeline.ts` (utilities, transform)

**Analog:** `lib/crm-directory.ts` (`filterBusinesses` line 58 — pure, testable filter).

`crm-pipeline.ts` holds the `STAGES` constant (single source of truth, D-03; Phase 5 RPT-02 consumes it) + pure helpers (totals per column). `crm-tags.ts` holds the OR-semantics tag filter. `crm-timeline.ts` holds the timeline row type + presentation helpers. Keep all pure (no `'use server'`, no Supabase import) so they are unit-testable — same reason `_actions.schemas.ts` is a pure module.

## Shared Patterns

### Admin authorization
**Source:** `lib/admin-guard.ts` `requireAdmin()` (lines 14-26) — throws `unauthorized`/`forbidden`, returns `User`.
**Apply to:** EVERY new server action, FIRST line. Reads `user.app_metadata.is_admin === true` (never a column).

### Audit write
**Source:** `lib/audit.ts` `logAudit()` (lines 8-19 signature) — `{ actorId, action, targetType, targetId?, businessId?, risk, reason?, metadata? }`, service-role, best-effort (never throws, never wrap in rollback).
**Apply to:** Auditable mutations (D-14): move stage, convert lead, delete note, complete task, etc.

### Admin-only RLS
**Source:** `supabase/migrations/031_crm_audit_log.sql` lines 47-62.
**Apply to:** All six new tables. `using ((select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true')`, no write policy, never `using(true)`.

### Service-role client
**Source:** `lib/supabase/admin.ts` `createAdminClient()` (used in `_actions.ts` line 49, `lib/audit.ts` line 30).
**Apply to:** All `leads`/`deals`/`tags`/`notes`/`tasks` writes + the onboarding conversion. Server-side only.

### ConfirmDialog (escalonado)
**Source:** `components/crm/confirm-dialog.tsx` (`ConfirmDialog` line 141; props `confirmWord?` line 47, `requireReason?` line 49, `onConfirm: (reason?) => Promise<void>` line 54).
**Apply to:** Destructive/irreversible pipeline actions if needed — mark `lost` (with reason), manual convert, delete note. Handles type-to-confirm + reason + anti-double-submit + a11y. Do NOT hand-roll a modal.

### Session-client RLS-gated read
**Source:** `app/(crm)/admin/auditoria/page.tsx` lines 20-38.
**Apply to:** The `crm_timeline` read ONLY (it inherits RLS via `security_invoker`). The pipeline/negocios reads may use service-role like the directory.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (kanban DnD interaction inside `pipeline-client.tsx`) | component behavior | event-driven | No drag-and-drop precedent or library in repo. Build with native HTML5 DnD (zero-install). Flag a `checkpoint:human-verify` only if `@dnd-kit` is deemed necessary. |

## Metadata

**Analog search scope:** `supabase/migrations/`, `app/(crm)/admin/`, `app/(onboarding)/`, `lib/`, `components/crm/`
**Files scanned:** 11 (all read or grepped, verified line ranges)
**Critical pitfall flagged:** `crm_timeline` MUST use `WITH (security_invoker = true)` — the OPPOSITE of the 027 public views — and be read with the SESSION client.
**Pattern extraction date:** 2026-06-20
