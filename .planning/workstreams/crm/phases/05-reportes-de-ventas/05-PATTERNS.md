# Phase 5: Reportes de Ventas - Pattern Map

**Mapped:** 2026-06-23
**Files analyzed:** 7 (5 new, 2 modified)
**Analogs found:** 6 / 7 (charts have no in-repo analog — first charts in the app; use RESEARCH v3 snippets)

> Build on `05-RESEARCH.md` — it already cites these analogs with file:line. This map pins the *exact* excerpts to copy so the planner can mirror them verbatim. All decisions are LOCKED (D-01..D-11); copy patterns, do not invent.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/036_mrr_snapshots.sql` | migration | batch (table+RLS+seed) | `supabase/migrations/034_crm_pipeline_tags_timeline.sql` | exact (RLS policy verbatim) |
| `lib/crm-reports.ts` | utility (pure lib) | transform | `lib/crm-metrics.ts` (`computeKpis`) + `lib/crm-pipeline.ts` | exact |
| `lib/crm-reports.test.ts` | test | transform | `lib/crm-metrics.test.ts` | exact |
| `app/api/cron/cancel-expired/route.ts` (MODIFY) | route (cron) | batch/event-driven | self (existing best-effort try/catch shape) | exact |
| `app/(crm)/admin/reportes/page.tsx` | page (RSC, reads) | request-response (read) | `auditoria/page.tsx` (session) + `negocios/page.tsx` (service-role) | exact (split read) |
| `app/(crm)/admin/reportes/reportes-client.tsx` | component (client charts) | request-response (render) | `pipeline-client.tsx` (ARS fmt + dark tokens) | role-match; charts = RESEARCH only |
| recharts chart sub-components (inside reportes-client) | component | render | — | **no analog** (see below) |

---

## Pattern Assignments

### `supabase/migrations/036_mrr_snapshots.sql` (migration, batch)

**Analog:** `supabase/migrations/034_crm_pipeline_tags_timeline.sql`

**RLS admin-read policy — COPY VERBATIM** (034 lines 161-166, the `deals` block; identical shape for every CRM table):
```sql
alter table public.deals enable row level security;
drop policy if exists "admin read deals" on public.deals;
create policy "admin read deals" on public.deals
  for select
  using ((select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true');
-- Sin policy de insert/update/delete: solo el service-role escribe deals.
```
For `mrr_snapshots`: same `enable row level security` + single `for select` policy with the **exact** `(select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true'` predicate. **NO insert/update/delete policy** — only the cron's service-role writes (lección 029: NUNCA `using(true)`).

**Header comment convention** (034 lines 1-29): box-drawing banner explaining QUÉ agrega, the "se aplica A MANO y EN ORDEN" note (última aplicada: 035 → este es 036), the is_admin isolation rationale, and the post-deploy TODO "regenerar `supabase/schema.sql` con `supabase db dump`". Mirror this header.

**`create table if not exists` + `create index if not exists` idempotent DDL style** (034 lines 35-49). For 036 use `primary key (month, plan)` as the unique key (RESEARCH §"Migración 036" lines 290-318) — this PK is the idempotency guarantee for the cron upsert (`onConflict 'month,plan'`).

**Plan CHECK** mirror the `deals.stage` CHECK style (034 line 70): `plan text not null check (plan in ('basic','studio','pro'))` — note plan keys are `basic`/`studio`/`pro` (confirmed in `lib/plan-prices.ts:11-13`).

**Seed** the current AR month so the chart isn't empty (D-01) — use the verbatim seed SQL in RESEARCH lines 308-318 (`date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')::date`, join `businesses`×`plan_prices` on `pp.plan_key = b.plan`, `on conflict (month, plan) do nothing`).

---

### `lib/crm-reports.ts` (pure utility, transform)

**Analog:** `lib/crm-metrics.ts` (REUSE `computeKpis` formula, do not reimplement) + `lib/crm-pipeline.ts` (consume `STAGES`)

**Pure-module contract** (crm-metrics.ts lines 1-33): no DB, no React, no `'use server'`. Domain types at top. `now: Date = new Date()` as the **last injectable param** for deterministic tests. AR zone via literal offset:
```ts
// crm-metrics.ts:32-33
const AR_OFFSET = '-03:00'
```
Use the same `AR_OFFSET` literal for month-key / 90d-window math (Pitfall 5). Import `date-fns` (`addDays`, etc.) as crm-metrics.ts:1 does.

**MRR formula — REUSE, do not duplicate** (crm-metrics.ts:53-61):
```ts
export function computeKpis(rows: BizRow[], prices: Prices, now: Date = new Date()): Kpis {
  const activos = rows.filter((r) => r.plan_status === 'active')
  // `?? 0`: un plan activo sin fila de precio suma 0, nunca NaN.
  const mrr = activos.reduce((sum, r) => sum + (prices[r.plan] ?? 0), 0)
  ...
}
```
`crm-reports.ts` MRR/ARPA must use this `Σ(prices[plan] ?? 0)` over `plan_status === 'active'` shape. ARPA = `mrr / activos.length` (guard divide-by-zero → 0 or null). The genuinely-new calcs are **funnel** and **churn**.

**Consume STAGES as funnel order** (crm-pipeline.ts:16-28) — single source of truth, do NOT redeclare stage order:
```ts
import { STAGES, type StageKey, type DealStatus } from '@/lib/crm-pipeline'
```
`STAGES` = `lead → calificado → trial → propuesta → pago`, each with `key/label/color/order`. Funnel "etapa alcanzada 1..N" (D-04): a deal at stage N counts in stages 1..N; `status='won'` counts through `pago`; `status='lost'` cuts at its last reached stage; `pct[N] = count[N]/count[N-1]`, first stage `pct=null`.

**Result-shape types** (mirror RESEARCH lines 261-263): return discriminated/nullable results — `ChurnResult = { bajas: number; pct: number | null }` where `pct: null` = sin historia suficiente (D-05, Pitfall 6 — never NaN/Infinity). Same `null`-for-no-data discipline for ranking VAR.

**Pure-lib helper style** (crm-metrics.ts:37-47): small named predicate helpers (`esPagoFallido`, `esTrialPorVencer`) above the exported functions; section dividers `// ── ... ──`.

---

### `lib/crm-reports.test.ts` (test, transform)

**Analog:** `lib/crm-metrics.test.ts`

**Test scaffold — copy structure** (crm-metrics.test.ts:1-23):
```ts
import { describe, it, expect } from 'vitest'
import { /* fns */ } from '@/lib/crm-reports'

const NOW = new Date('2026-06-18T12:00:00.000Z')   // fijo para determinismo (Pitfall 5: zona AR)
const PRICES = { basic: 15000, studio: 30000, pro: 50000 }
function daysFromNow(n: number): string { return new Date(NOW.getTime() + n * 86_400_000).toISOString() }
// builder fixture con defaults (cf. biz(partial))
```
Inject `NOW` into every call. Builder fns with sane defaults (`biz(partial)` pattern, lines 15-23). One `describe` per exported fn, behavior-named `it(...)` (lines 26-36). Quick run: `npx vitest run lib/crm-reports.test.ts`. Suite at 178 — keep it green. Cover RPT-01/RPT-02 per RESEARCH "Phase Requirements → Test Map" (lines 401-406): MRR, ARPA, MRR×plan, funnel (alcanzada/won/lost/pct), churn (pct null sin historia), ranking VAR, snapshot rows idempotentes.

---

### `app/api/cron/cancel-expired/route.ts` (MODIFY — route, cron/batch)

**Analog:** itself (existing best-effort shape)

**Existing best-effort try/catch to mirror** (lines 58-75): each side-effect wrapped in its own `try/catch` with contextual `console.error('[modulo/accion] ... FALLÓ:', e instanceof Error ? e.message : e)`; a failure never aborts the main flow. The snapshot block must follow this exactly (RESEARCH Pattern 4, lines 170-187).

**Auth + service-role already in place** (lines 6-12): the `Bearer ${process.env.CRON_SECRET}` guard (line 8) and `const supabase = createAdminClient()` (line 12) — the snapshot block **reuses the same `supabase` admin client** and inherits the auth barrier. No new client.

**Where to insert:** after the existing cancel-expired logic, **before the final `return Response.json(...)`** (currently line 78). Compute the AR month-key, build snapshot rows via the pure lib (`computeSnapshotRows` reading `businesses`×`plan_prices` with the admin client), then:
```ts
const { error: snapErr } = await supabase
  .from('mrr_snapshots')
  .upsert(rows, { onConflict: 'month,plan' })   // dedupe = idempotencia (Pitfall 3)
if (snapErr) console.error('[cron/mrr-snapshot] upsert error:', snapErr.message)
```
Wrap the whole block in its own `try/catch` (Pitfall 3; same criterion as the email loop). Decision A2 (Claude's Discretion): `upsert` re-writes the current month each day so it stays fresh; past months freeze because their month-key is never recomputed. **Do NOT add a second cron** (Vercel Hobby = 1/día; rompe el deploy).

---

### `app/(crm)/admin/reportes/page.tsx` (RSC page, read)

**Analogs:** `auditoria/page.tsx` (session-client RLS read) + `negocios/page.tsx` (service-role read after layout guard)

**Session-client for RLS-gated tables** (auditoria/page.tsx:1, 20-27) — use for `deals`, `audit_log`, `mrr_snapshots` (all have admin-read policy). T-04-10/T-01-09 lesson: NEVER service-role these (bypasses RLS):
```ts
import { createClient } from '@/lib/supabase/server'
const supabase = await createClient()
const { data, error } = await supabase
  .from('audit_log')
  .select('id, action, ...')        // SELECT explícito, sin comodín
  .order('created_at', { ascending: false })
if (error) console.error('[crm/reportes] read error:', error.message)
```

**Service-role for tables WITHOUT admin-read policy** (negocios/page.tsx:1, 41-48) — use ONLY for `businesses` (no "is_admin lee todo" policy) and `getPlanPrices()`:
```ts
import { createAdminClient } from '@/lib/supabase/admin'
import { getPlanPrices } from '@/lib/plan-prices'
const admin = createAdminClient()
const { data, error } = await admin.from('businesses').select('id, name, plan, plan_status') // no sensibles
const prices = await getPlanPrices()
```
**CRITICAL (T-01-09 / T-02-09):** the admin client and raw `businesses` rows NEVER cross to the client — pass **only aggregates / non-sensitive** fields to `reportes-client` (negocios/page.tsx docblock lines 5-20). See "Shared Patterns → Service-role containment".

**Combined read** (RESEARCH lines 328-342): one `Promise.all([...])` mixing both clients, then call `lib/crm-reports.ts` (pure) and pass only computed aggregates as props. **NO `business_id` filter** — cross-tenant by design; the gate is `is_admin` (D-10).

**Layout guard is upstream:** `app/(crm)/layout.tsx` already redirects non-admins (defense in depth, auditoria docblock lines 13-18) — page doesn't re-guard.

---

### `app/(crm)/admin/reportes/reportes-client.tsx` (client component, charts)

**Analog:** `pipeline-client.tsx` for ARS formatter + dark CRM tokens; **charts have NO in-repo analog** — use RESEARCH v3 snippets.

**`'use client'` + props-typed shape** (pipeline-client.tsx:1, 35-48): `'use client'` at top; exported prop types for the serializable aggregates from the RSC. recharts imports go here (NEVER in an RSC — RESEARCH Anti-Patterns).

**ARS formatter — COPY VERBATIM** (pipeline-client.tsx:50-54):
```ts
const arsFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})
```

**Color tokens** (crm-pipeline.ts STAGES lines 16-22 + RESEARCH Anti-Patterns line 194): NEVER hardcode hex. Use CSS tokens — `var(--primary)` (amarillo `#f4c543`, series principal), `var(--crm-info)` (azul), `var(--crm-success)` (verde), `var(--crm-danger)` (rojo, solo churn/peligro). For the funnel, reuse `STAGES[].color` directly.

**Charts (no analog — follow RESEARCH verbatim):**
- recharts v3 in `'use client'`, `ResponsiveContainer` inside `<div className="h-72 w-full">` (Pitfall 1, RESEARCH Pattern 1 lines 115-131).
- Donut MRR×plan: `Pie innerRadius>0` + `Cell` per plan + center `<Label>` (Pattern 2 lines 137-147).
- Funnel: `BarChart layout="vertical"` + `YAxis type="category"` (Pattern 3 lines 154-162) — confirm bar-vs-funnel-shape against `crm-design/06-reportes.png` (Open Question 1).
- Custom dark Tooltip typed `TooltipContentProps` with `var(--card)`/`var(--border)`/`var(--foreground)` (v3 breaking change, Pitfall 2; Open Question 2).
- Toggle 3/6/12m re-filters the snapshot series in memory (D-08); show only available months, no invented data.
- Churn card: render "— / sin historia suficiente" when `pct === null` (D-05, Pitfall 6). Relabel "Ingresos del mes" as recurring proxy, not "cobrado" (D-03).
- "Exportar" button: DEFERRED to v2 (D-08) — prefer not rendering a dead action.

---

## Shared Patterns

### RLS admin-read policy (migration)
**Source:** `034_crm_pipeline_tags_timeline.sql:161-166`
**Apply to:** `036_mrr_snapshots.sql`
```sql
alter table public.<t> enable row level security;
drop policy if exists "admin read <t>" on public.<t>;
create policy "admin read <t>" on public.<t>
  for select using ((select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true');
-- sin insert/update/delete: solo service-role escribe (lección 029, NUNCA using(true))
```

### Session-vs-service-role read split (T-04-10 / T-01-09)
**Source:** `auditoria/page.tsx:20-27` (session) + `negocios/page.tsx:41-48` (service-role)
**Apply to:** `reportes/page.tsx`
- Session client (`createClient`) → `deals`, `audit_log`, `mrr_snapshots` (have admin-read policy → RLS gates).
- Service-role (`createAdminClient`) → `businesses` (no policy) + `getPlanPrices()`, ONLY behind the layout guard.

### Service-role containment (never crosses to client)
**Source:** `negocios/page.tsx:5-20` docblock + lines 91-104 (acotado mapping)
**Apply to:** `reportes/page.tsx` → `reportes-client.tsx`
Pass ONLY computed aggregates / non-sensitive fields. Never the admin client, raw `businesses` rows, tokens, or secrets. Ranking exposes only `{ name, plan, mrr, var }`.

### Pure-lib + vitest
**Source:** `crm-metrics.ts` + `crm-metrics.test.ts` (and `crm-pipeline.ts`)
**Apply to:** `crm-reports.ts` + `crm-reports.test.ts`
No DB/React in lib; `now` injectable last param; `AR_OFFSET = '-03:00'`; null-not-NaN for missing data; mirror test scaffold (fixed `NOW`, builder fixtures, `describe` per fn).

### Best-effort try/catch in cron
**Source:** `cancel-expired/route.ts:58-75`
**Apply to:** the new snapshot block in the same file
Own `try/catch`, `console.error('[cron/mrr-snapshot] ...:', e instanceof Error ? e.message : e)`, never abort the main flow.

### ARS formatting
**Source:** `pipeline-client.tsx:50-54`
**Apply to:** `reportes-client.tsx` (and any ARS in the pure lib stays integer)
`Intl.NumberFormat('es-AR', { style:'currency', currency:'ARS', maximumFractionDigits:0 })`

---

## No Analog Found

| File / element | Role | Data Flow | Reason |
|----------------|------|-----------|--------|
| recharts chart sub-components (BarChart MRR, Pie donut, funnel bars, custom dark Tooltip) | component | render | First charts in the app — no existing recharts usage. Use RESEARCH §"Architecture Patterns" Patterns 1-3 (written for v3) + Pitfalls 1/2. recharts v3 differs from v2 training data; do not copy v2 tutorials. |

---

## Metadata

**Analog search scope:** `supabase/migrations/`, `lib/`, `app/(crm)/admin/`, `app/api/cron/`
**Files read for excerpts:** 034 migration, cancel-expired route, crm-metrics.ts, crm-metrics.test.ts, crm-pipeline.ts, auditoria/page.tsx, auditoria-client.tsx, negocios/page.tsx, pipeline-client.tsx, plan-prices.ts
**Plan keys confirmed:** `basic`/`studio`/`pro` (`lib/plan-prices.ts:11-13`), prices from `price_ars` (NEVER `price_usd`)
**Pattern extraction date:** 2026-06-23
