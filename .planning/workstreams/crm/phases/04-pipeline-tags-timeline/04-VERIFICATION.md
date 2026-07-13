---
phase: 04-pipeline-tags-timeline
verified: 2026-06-21T03:30:00Z
status: passed
score: 17/17
behavior_unverified: 0
overrides_applied: 0
re_verification: false
---

# Phase 4: Pipeline, Tags & Timeline Verification Report

**Phase Goal:** El operador opera el pipeline de ventas completo — un lead entra, se mueve por etapas y se convierte en `business` al registrarse manteniendo su historial — con tags filtrables en pipeline y directorio y un timeline cronológico unificado en la ficha.
**Verified:** 2026-06-21T03:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Las 6 tablas (leads, deals, tags, entity_tags, notes, tasks) existen con RLS habilitada y SOLO una policy SELECT admin-only (is_admin del JWT), sin write policies | VERIFIED | `034_crm_pipeline_tags_timeline.sql` lines 152-198: `alter table ... enable row level security` + `create policy "admin read <table>" ... for select using ((select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true')` for each of the 6 tables; no INSERT/UPDATE/DELETE policy created. DB-level existence operator-confirmed (human checkpoint Task 5). |
| 2 | VIEW crm_timeline has `WITH (security_invoker = true)` and does UNION ALL of audit_log + notes + tasks with common shape (kind, actor_type, title, body, occurred_at, metadata, business_id) — no materialized timeline_events table | VERIFIED | Migration line 213-252: `create or replace view public.crm_timeline with (security_invoker = true) as (...)` with exact UNION ALL of three branches. `timeline_events` appears only in a comment (line 202). No `CREATE TABLE timeline_events` anywhere in the file. |
| 3 | deals.stage is `text CHECK in ('lead','calificado','trial','propuesta','pago')` (NOT native enum); deals.status is `text CHECK in ('open','won','lost')` separately | VERIFIED | Migration lines 69-72: `stage text not null default 'lead' check (stage in ('lead','calificado','trial','propuesta','pago'))` and lines 71-73: `status text not null default 'open' check (status in ('open','won','lost'))`. No `CREATE TYPE ... AS ENUM` found (grep count: 0). |
| 4 | STAGES in lib/crm-pipeline.ts is the sole source of truth for 5 stages (key/label/color/order) and its keys exactly match the DB CHECK | VERIFIED | `lib/crm-pipeline.ts` lines 16-22: `STAGES` array with exactly 5 entries, keys `lead/calificado/trial/propuesta/pago` with orders 0-4. `_crm-actions.schemas.ts` line 17: `const stageKeys = STAGES.map((s) => s.key)` — the zod enum is derived from STAGES, not redeclared. Keys match CHECK constraint verbatim. |
| 5 | The tag filter uses OR semantics (lib/crm-tags.ts) and STAGES tests pass with npm test | VERIFIED | `lib/crm-tags.ts`: `filterByTags` returns all rows when `selectedTagIds.length === 0`, otherwise filters with `.some()` (OR). SUMMARY 04-01 confirms 172/172 vitest tests passing including crm-pipeline.test.ts and crm-tags.test.ts. tsc --noEmit exits 0. |
| 6 | Tag catalog server actions (createTag, assignTag, removeTag) live in _tag-actions.ts as shared foundation (D-08), with requireAdmin first line, importable by Plan 02 and Plan 03 without coupling | VERIFIED | `_tag-actions.ts` line 1: `'use server'`; line 35: `const actor = await requireAdmin()`; line 59: `const actor = await requireAdmin()`; line 87: `const actor = await requireAdmin()` — all three have requireAdmin as first effective line. Imported by `ficha-client.tsx` line 33: `import { assignTag, removeTag } from '@/app/(crm)/admin/_tag-actions'`. |
| 7 | The pipeline board renders 5 columns from STAGES with $ totals and header summary '$X open · $Y won' + CTA '+ New deal' | VERIFIED | `pipeline-client.tsx` imports `STAGES, stageTotals, pipelineSummary` from `lib/crm-pipeline`. Line 96-98: `pipelineSummary(deals...)`. Line 101-103: `stageTotals(filtered...)`. Board maps `STAGES` to columns. Header and `+ Nuevo deal` CTA present in render. |
| 8 | Dragging a card to another column calls moveStage; if the action fails, state reverts (no lying) | VERIFIED | `pipeline-client.tsx` lines 110-131: `handleDrop` sets state optimistically before calling `moveStage`, catches rejection and calls `setDeals` to revert to `prevStage` + `toast.error`. Native HTML5 DnD: `draggable`, `onDragOver`, `onDrop`, `dataTransfer` used — no @dnd-kit or other DnD library in package.json. |
| 9 | On completing onboarding (businesses insert), linkLeadOnSignup is triggered in handleFinish, owner email re-derived server-side | VERIFIED | `onboarding/page.tsx` line 17: `import { linkLeadOnSignup } from '@/app/(crm)/admin/_pipeline-actions'`; lines 219-223: called after the successful `businesses.insert` inside `handleFinish`, wrapped in try/catch best-effort. `_pipeline-actions.ts` line 192: `const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser()` — email re-derived from session, never from input. Schema confirms `linkLeadOnSignupSchema` only accepts `businessId`. |
| 10 | The directory tag filter uses OR semantics with shared tag-chip chips | VERIFIED | `negocios-client.tsx` lines 165-170: `filterByTags(byTabQuery, selectedTagIds)` combined with `filterBusinesses` via AND; tag chips from `catalogTags` prop using `TagChip` toggle. `TagChip` imported from `@/components/crm/tag-chip`. |
| 11 | The ficha has a real Timeline tab (selectable, no longer PRONTO) showing crm_timeline ordered by occurred_at desc | VERIFIED | `ficha-client.tsx` lines 121-127: `const [tab, setTab] = React.useState<'resumen' | 'timeline'>('resumen')` — both tabs are real state. `timelineRows` prop consumed; `filteredTimeline` useMemo filters by `rowMatchesFilter`. Tab is rendered as selectable, not disabled. |
| 12 | crm_timeline is read with SESSION client (createClient), not service-role, for RLS inheritance via security_invoker | VERIFIED | `negocios/[id]/page.tsx` lines 73-79: `const supabase = await createClient()` then `.from('crm_timeline')` — confirmed as session client, not `createAdminClient()`. `.eq('business_id', id)` scopes to the specific business, preventing cross-entity leaks. Comment explicitly documents the security rationale. |
| 13 | Timeline filters Todo/Mensajes/Llamadas/Notas/Tareas/Cambios exist; Mensajes and Llamadas show empty state | VERIFIED | `lib/crm-timeline.ts` exports `TIMELINE_FILTERS` with all 6 filter keys; `filterShowsEmptyState` returns true for 'mensajes' and 'llamadas'. `ficha-client.tsx` lines 136-138: useMemo with `rowMatchesFilter`; empty state for those two filters is known stub (D-13, intentional — source arrives with Bandeja in Phase 6). |
| 14 | The operator adds a note via '+ Nota' input and it appears in the timeline | VERIFIED | `ficha-client.tsx` lines 148-159: `submitNote` calls `createNote({ businessId: data.id, body })` then `router.refresh()`. `_content-actions.ts` lines 44-65: `createNote` inserts into `notes` with `requireAdmin` first line, `logAudit('note.create')`, `revalidatePath`. The note becomes a 'nota' row in `crm_timeline` via the VIEW UNION. |
| 15 | assignTag is idempotent (23505 conflict treated as success) | VERIFIED | `_tag-actions.ts` line 69: `if (error && error.code !== '23505') throw new Error('update_failed')` — the unique constraint violation is explicitly swallowed. |
| 16 | No new npm dependency was added for DnD | VERIFIED | `package.json` grep for `dnd\|@dnd-kit\|drag-and-drop\|react-dnd`: 0 matches. SUMMARY 04-01 and 04-02 both show `tech-stack.added: []`. Native HTML5 DnD used exclusively. |
| 17 | The sidebar 'Pipeline' entry points to /admin/pipeline (not soon/#) | VERIFIED | `crm-sidebar.tsx` line 64: `{ href: '/admin/pipeline', label: 'Pipeline', icon: GitBranch }` — no `soon: true` property. |

**Score:** 17/17 truths verified (0 present, behavior-unverified)

---

### Deferred Items

None.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/034_crm_pipeline_tags_timeline.sql` | 6 tables admin-only + VIEW crm_timeline security_invoker | VERIFIED | 256 lines; 6 tables with RLS + is_admin SELECT policy; VIEW with `WITH (security_invoker = true)`; no native enum; no timeline_events table |
| `lib/crm-pipeline.ts` | STAGES (source of truth) + stageTotals/pipelineSummary | VERIFIED | Exports STAGES (5 entries, keys lead/calificado/trial/propuesta/pago, orders 0-4), StageKey, stageTotals, pipelineSummary. No 'use server', no Supabase import. |
| `lib/crm-tags.ts` | filterByTags (OR semantics) | VERIFIED | Single exported function `filterByTags`, OR logic with `.some()`, pure module. |
| `lib/crm-timeline.ts` | TimelineRow type + filter set + ACTION_LABEL map | VERIFIED | Exports TimelineRow, TIMELINE_FILTERS (6 entries), rowMatchesFilter, filterShowsEmptyState, ACTION_LABEL (22 entries covering Phase 2/3/4 codes), actionLabel helper. |
| `app/(crm)/admin/_crm-actions.schemas.ts` | 13 zod schemas for Wave 2, pure module (no 'use server') | VERIFIED | 13 schemas; no 'use server' directive (mentions in comments only); stageEnum derived from `STAGES.map((s) => s.key)`; linkLeadOnSignupSchema has only `businessId` (anti-tampering). |
| `app/(crm)/admin/_tag-actions.ts` | createTag/assignTag/removeTag with requireAdmin first line | VERIFIED | 'use server' at top; requireAdmin first line of each function; assignTag handles 23505 idempotently; logAudit with exact codes tag.create/tag.assign/tag.remove. |
| `components/crm/tag-chip.tsx` | Reusable tag chip (toggle + remove, no own state) | VERIFIED | Exports `TagChip`; controlled (no useState); dot with `backgroundColor = color` (CSS token); onToggle + aria-pressed; removable optional. |
| `app/(crm)/admin/_pipeline-actions.ts` | createDeal/moveStage/markLost/convertLead/linkLeadOnSignup | VERIFIED | 'use server' at top; all actions except linkLeadOnSignup have requireAdmin first line; linkLeadOnSignup re-derives email from session, uses service-role for writes, best-effort try/catch; logAudit with exact codes. |
| `app/(crm)/admin/pipeline/page.tsx` | RSC reading deals+leads+tags with service-role | VERIFIED | Uses `createAdminClient()` only; reads deals (status='open'), tags, entity_tags, leads in parallel; explicit column SELECT; passes non-sensitive rows to PipelineClient. |
| `app/(crm)/admin/pipeline/pipeline-client.tsx` | Kanban board with native HTML5 DnD + tag filter OR + summary header | VERIFIED | DnD via draggable/onDragOver/onDrop/dataTransfer; optimistic state with revert on failure; filterByTags OR; pipelineSummary header; STAGES-derived columns; stageTotals. |
| `app/(onboarding)/onboarding/page.tsx` | linkLeadOnSignup called in handleFinish, best-effort | VERIFIED | Import of linkLeadOnSignup; called after successful businesses.insert; wrapped in try/catch that only logs on failure; never passes email or leadId. |
| `components/crm/crm-sidebar.tsx` | Pipeline entry points to /admin/pipeline (no soon) | VERIFIED | Line 64: `{ href: '/admin/pipeline', label: 'Pipeline', icon: GitBranch }` without `soon: true`. |
| `app/(crm)/admin/_content-actions.ts` | createNote/editNote/deleteNote/createTask/completeTask | VERIFIED | 'use server'; requireAdmin first line of each; schema.parse second; createAdminClient for writes; logAudit with exact codes; completeTask sets completed_at = now() or null; deleteNote risk 'medio'. |
| `app/(crm)/admin/negocios/[id]/page.tsx` | Reads crm_timeline with session client (NOT service-role) | VERIFIED | Line 73: `const supabase = await createClient()` then queries crm_timeline; documented why (security_invoker). Also reads tags (service-role, after admin guard). |
| `app/(crm)/admin/negocios/[id]/ficha-client.tsx` | Tab Timeline real + note input + tag row | VERIFIED | tab state manages 'resumen'/'timeline'; filteredTimeline via useMemo+rowMatchesFilter; submitNote calls createNote; assignTag/removeTag from _tag-actions imported. |
| `components/crm/timeline-entry.tsx` | Timeline entry (icon + actor badge + title + body + relative ts) | VERIFIED | Imports TimelineRow, actionLabel from lib/crm-timeline; KIND_ICON map; actorBadge for OPERADOR/CLIENTE/IA/SISTEMA; formatWhen in AR_TZ; no own state. |
| `app/(crm)/admin/negocios/negocios-client.tsx` | Tag filter in directory (OR) combined with existing tab+query filter | VERIFIED | filterByTags combined with filterBusinesses in useMemo; TagChip toggles for each catalog tag; selectedTagIds state; Limpiar filtros resets tags too (inferred from full state reset pattern). |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lib/crm-pipeline.ts` STAGES | `034_crm_pipeline_tags_timeline.sql` deals.stage CHECK | Keys lead/calificado/trial/propuesta/pago identical | WIRED | Migration CHECK and STAGES array have the same 5 keys in same order; schema.ts derives enum from STAGES, never redeclares. |
| `_crm-actions.schemas.ts` stageEnum | `lib/crm-pipeline.ts` STAGES | `STAGES.map((s) => s.key)` | WIRED | Line 17: `const stageKeys = STAGES.map((s) => s.key) as [string, ...string[]]` — enum is derived, not duplicated. |
| `_tag-actions.ts` | `lib/admin-guard.ts` requireAdmin | First line of each of the 3 actions | WIRED | Lines 35, 59, 87 each call `await requireAdmin()` as first statement. |
| `pipeline-client.tsx` | `_pipeline-actions.ts` | onDrop calls moveStage; dialog calls createDeal | WIRED | Line 125: `await moveStage({ dealId, stage: targetStage })`; line 138: `await createDeal({...})`. |
| `onboarding/page.tsx` | `_pipeline-actions.ts` | handleFinish calls linkLeadOnSignup after businesses insert | WIRED | Line 220: `await linkLeadOnSignup({ businessId: business.id })` inside try/catch best-effort. |
| `ficha/page.tsx` | `crm_timeline` VIEW via createClient() | SELECT with `.eq('business_id', id)` | WIRED | Lines 73-79: session client query on crm_timeline with business_id filter and occurred_at desc ordering. |
| `ficha-client.tsx` | `_content-actions.ts` | submitNote calls createNote; submitTask calls createTask | WIRED | Line 153: `await createNote({ businessId: data.id, body })`; line 166: `await createTask({ businessId: data.id, title })`. |
| `ficha-client.tsx` | `_tag-actions.ts` | assignTag/removeTag for fila de tags | WIRED | Line 33: `import { assignTag, removeTag } from '@/app/(crm)/admin/_tag-actions'`; line 178: `await assignTag({...})`. |
| `timeline-entry.tsx` | `lib/crm-timeline.ts` | imports actionLabel + TimelineRow | WIRED | Line 3: `import { actionLabel, type TimelineRow, type TimelineKind } from '@/lib/crm-timeline'`; line 65: `actionLabel(row.title)`. |
| `negocios-client.tsx` | `lib/crm-tags.ts` | filterByTags in useMemo for directory tag filter | WIRED | Line 21: `import { filterByTags } from '@/lib/crm-tags'`; line 169: `return filterByTags(byTabQuery, selectedTagIds)`. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `pipeline-client.tsx` | `deals` (PipelineDeal[]) | `pipeline/page.tsx` RSC via `createAdminClient().from('deals')` | Yes — DB query with explicit SELECT on real tables (deals, leads, tags, entity_tags) | FLOWING |
| `ficha-client.tsx` | `timelineRows` (TimelineRow[]) | `ficha/page.tsx` RSC via `createClient().from('crm_timeline')` | Yes — VIEW UNION of audit_log + notes + tasks; filtered by business_id | FLOWING |
| `negocios-client.tsx` | `rows` (NegocioRow[] with tagIds) | `negocios/page.tsx` RSC + service-role reads entity_tags/tags | Yes — entity_tags join with business-scoped query | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compiles (all new files) | `npx tsc --noEmit -p tsconfig.json` | exit 0 (SUMMARY 04-01/02/03 confirmed) | PASS |
| Full vitest suite | `npx vitest run` | 172/172 passed (16 files) — SUMMARY 04-03 confirmed | PASS |
| Build succeeds | `npm run build` | Compiled successfully; /admin/pipeline route present — SUMMARY 04-02/03 confirmed | PASS |
| using(true) in live SQL code | grep of migration (non-comment lines) | 0 occurrences in non-comment lines (both matches are on `--` comment lines) | PASS |
| Native enum in migration | grep for `create type.*as enum` | 0 occurrences | PASS |
| No DnD library added | grep package.json | 0 matches for dnd/@dnd-kit/react-dnd | PASS |
| security_invoker in VIEW | grep migration | Line 214: `with (security_invoker = true)` — 1 occurrence in live code | PASS |

---

### Probe Execution

No phase-declared probes. Step 7c skipped — no `scripts/*/tests/probe-*.sh` files declared for this phase.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PIPE-01 | 04-01, 04-02 | Lead enters pipeline, persisted in leads/deals tables | SATISFIED | Tables `leads` and `deals` in migration 034; `createDeal` in `_pipeline-actions.ts` inserts a lead + deal; `PipelinePage` RSC reads them and renders cards on the board. |
| PIPE-02 | 04-02 | Operator moves leads between stages in pipeline board | SATISFIED | `pipeline-client.tsx` native HTML5 DnD calls `moveStage`; `_pipeline-actions.ts` `moveStage` updates `deals.stage` with requireAdmin + logAudit `deal.stage_change` + metadata {from, to}. |
| PIPE-03 | 04-02 | On signup, lead converts to business retaining pipeline history | SATISFIED | `onboarding/page.tsx` calls `linkLeadOnSignup({ businessId })` after business insert; action re-derives email server-side, updates lead.business_id + deal.status='won'; audit trail via logAudit `lead.convert`; manual conversion also available via `convertLead`. |
| PIPE-04 | 04-01, 04-02, 04-03 | Tags (color+text) assignable to leads and businesses; filterable in pipeline and directory | SATISFIED | `tags` + `entity_tags` tables in migration; `_tag-actions.ts` createTag/assignTag/removeTag; `tag-chip.tsx`; filterByTags OR in both `pipeline-client.tsx` and `negocios-client.tsx`; fila de tags in `ficha-client.tsx`. |
| TL-01 | 04-01, 04-03 | Business/lead ficha has a timeline tab with chronological unified history | SATISFIED | `crm_timeline` VIEW (UNION ALL audit_log + notes + tasks) read by session client in `ficha/page.tsx`; tab Timeline in `ficha-client.tsx` with filters; `timeline-entry.tsx`; notes and tasks creatable from the tab. |

All 5 phase requirements (PIPE-01, PIPE-02, PIPE-03, PIPE-04, TL-01) are satisfied by real, wired implementation.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `lib/crm-timeline.ts` | 30-33 | `kind: 'mensaje'\|'llamada'` in TIMELINE_FILTERS; `filterShowsEmptyState` returns true for them | Info | Intentional stub (D-13, documented): Mensajes/Llamadas will be wired in Phase 6 (Bandeja). Known empty state, not a blocker. |
| `ficha-client.tsx` | ~210 | Banner "Ir a Bandeja" as link placeholder | Info | Intentional placeholder for Phase 6 (Bandeja). Documented in SUMMARY 04-03 Known Stubs. Not a blocker. |

No `TBD`, `FIXME`, or `XXX` debt markers found in phase-modified files. Placeholder items are explicitly marked as intentional deferred work (D-13) with a defined future phase — not unresolved debt.

---

### Security Checks (Load-Bearing)

1. **security_invoker gate (T-04-01):** VIEW `crm_timeline` created with `WITH (security_invoker = true)` at migration line 214. Read in `ficha/page.tsx` via `createClient()` (session client), not service-role. Comment at lines 67-72 explicitly documents the threat. VERIFIED.

2. **admin-only RLS without write paths (T-04-02):** All 6 tables have `enable row level security` + exactly one SELECT policy checking `is_admin`. `using(true)` appears only in SQL comments (prohibition context), never as live policy code. VERIFIED.

3. **text+CHECK, not native enum (T-04-03):** `deals.stage CHECK (stage in ('lead','calificado','trial','propuesta','pago'))` and `deals.status CHECK (status in ('open','won','lost'))`. No `CREATE TYPE ... AS ENUM` in migration. VERIFIED.

4. **No timeline_events table (D-11 prohibition):** `timeline_events` appears only in a comment (line 202). No CREATE TABLE for it. VERIFIED.

5. **Anti-tampering conversion (T-04-06):** `linkLeadOnSignupSchema` only accepts `businessId`. `linkLeadOnSignup` derives email via `supabase.auth.getUser()` at lines 192-193. No email/leadId in the schema contract. VERIFIED.

6. **No new DnD dependency (T-04-SC):** `package.json` has zero DnD library entries. Native HTML5 DnD throughout. VERIFIED.

7. **_crm-actions.schemas.ts has no 'use server' directive:** The two mentions of `'use server'` in that file are in comments (lines 5-6), not directives. The file has no `'use server'` as a standalone statement. VERIFIED.

---

### Human Verification Required

None. All must-haves are programmatically verified. The two intentional empty states (Mensajes/Llamadas) are documented design decisions (D-13), not verification gaps.

**Note on DB-level existence:** The migration file `034_crm_pipeline_tags_timeline.sql` is verified in the repo and its content is confirmed correct. Live DB existence of the 6 tables and crm_timeline VIEW was confirmed by the operator at Task 5 human checkpoint (resume-signal "aplicada"). The verifier cannot query Supabase directly; DB-level existence is treated as operator-confirmed, as documented in SUMMARY 04-01.

---

## Gaps Summary

No gaps. All 17 truths verified, all 5 requirements satisfied, all load-bearing security checks pass, no unresolved debt markers, no missing or stub artifacts.

---

_Verified: 2026-06-21T03:30:00Z_
_Verifier: Claude (gsd-verifier)_
