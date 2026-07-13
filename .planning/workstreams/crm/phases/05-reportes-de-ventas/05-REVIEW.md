---
phase: 05-reportes-de-ventas
reviewed: 2026-06-23T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - lib/crm-reports.ts
  - lib/crm-reports.test.ts
  - supabase/migrations/036_mrr_snapshots.sql
  - app/api/cron/cancel-expired/route.ts
  - app/(crm)/admin/reportes/page.tsx
  - app/(crm)/admin/reportes/reportes-client.tsx
  - components/crm/crm-sidebar.tsx
findings:
  critical: 0
  warning: 5
  info: 6
  total: 11
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-06-23
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Reviewed the Reportes de Ventas slice (pure calc lib + tests, migration 036 `mrr_snapshots`,
the snapshot piggybacked on the daily cron, and the `/admin/reportes` RSC + recharts client).

**Security posture is sound.** The RSC split is correct: session client (RLS-gated) reads
`deals`/`audit_log`/`mrr_snapshots`, service-role reads ONLY `businesses` + prices, and only
serializable aggregates cross to the client — no admin client or raw rows leak. Migration 036
enables RLS with a single admin-read SELECT policy (no insert/update/delete, no `using(true)`),
mirroring 031/034. The `audit_log` read for churn selects only `action, created_at` (no `metadata`),
so no sensitive metadata is exposed. Cron snapshot write is service-role behind the `CRON_SECRET`
bearer gate and idempotent via PK `(month, plan)`. No BLOCKERs found.

The findings below are correctness/robustness edges and quality items. The most important are
WR-01 (churn window/sign semantics produce a misleading % and can show a negative churn %),
WR-02 (a duplicated 036-style coupling between `STAGES` array index and `.order`), and WR-03
(snapshot historical months silently re-freeze to whatever prices are configured today).

## Warnings

### WR-01: Churn % can be negative and uses an inconsistent denominator window

**File:** `lib/crm-reports.ts:123-133`, `app/(crm)/admin/reportes/page.tsx:128,150`
**Issue:** `churn()` computes `bajas = suspend - reactivate` and `pct = bajas / prevActiveCount`.
Two problems:
1. **Negative churn is renderable.** If reactivations exceed suspensions in the window,
   `bajas` is negative and `pct` is negative. `reportes-client.tsx:371` then renders
   `pctFormatter.format(churnPct!)` which will display something like `-3,2%` churn — a nonsensical
   metric. The danger-tone red card showing a negative churn percent is misleading to the operator.
2. **Denominator window mismatch.** The numerator counts suspend/reactivate events from the
   **current month** (`monthStart`), but the denominator `prevActive` is the active_count of the
   **previous month's snapshot**. That is a defensible MoM convention, but `prevActive` is derived
   from `byMonth` which the RSC overwrites for the *current* month with live data
   (`page.tsx:115`). If the snapshot has never run, the only entries in `byMonth` are the seeded
   month + the live current month, so `monthsSorted.length` can be `< 2` and `prevActive` is
   `null` → pct null (acceptable). But once two months exist, the previous month's `active` comes
   purely from snapshot rows, which were only ever written for `plan in (basic,studio,pro)` — any
   business on a legacy/other active plan is silently excluded from the churn denominator while it
   *would* be counted in a `business.suspend` event, skewing the ratio upward.
**Fix:** Clamp/guard the rendered churn percent and document the sign convention:
```ts
// crm-reports.ts
const netBajas = suspend - reactivate
const bajas = netBajas // keep raw for the count
const pct = prevActiveCount && prevActiveCount > 0 && netBajas > 0
  ? netBajas / prevActiveCount
  : (prevActiveCount && prevActiveCount > 0 ? 0 : null) // never negative %
```
And in the client, when `churnPct` is negative or zero, show `0%` (or "altas netas") rather than a
negative churn figure. Separately, ensure the churn denominator and the snapshot plan filter use the
same plan universe (see WR-03/IN-04).

### WR-02: `funnel()` assumes STAGES array index equals `.order` — silent breakage if reordered

**File:** `lib/crm-reports.ts:96-104`
**Issue:** `counts` is indexed by the STAGES *array position* `i` (`counts = STAGES.map(() => 0)`,
loop `for (let i = 0; i <= reached; i++)`), but `reached` is derived from the `.order` *field*
(`stageOrder()` returns `st.order`, and `maxOrder = STAGES.length - 1`). This only works because
today STAGES happens to be declared with array index === order (0..4). If anyone reorders the STAGES
array or assigns non-contiguous/non-zero-based `order` values, `counts[reached]` will write to the
wrong bucket or out of range, silently corrupting the funnel with no test catching it (tests use the
same coincidental ordering). `maxOrder` likewise conflates "last array index" with "max order value".
**Fix:** Index by order explicitly and derive maxOrder from the order field, or assert the invariant:
```ts
const maxOrder = Math.max(...STAGES.map((s) => s.order))
// build a map order -> array slot, or sort STAGES by order before mapping counts
const ordered = [...STAGES].sort((a, b) => a.order - b.order)
const counts = ordered.map(() => 0)
// ... reached = ordered.findIndex / stageOrder; and return ordered.map(...)
```
At minimum add a unit test that reorders STAGES (or a fixture) to prove index-vs-order independence.

### WR-03: Historical snapshot months silently re-freeze to today's prices

**File:** `app/api/cron/cancel-expired/route.ts:24-28`, `lib/crm-reports.ts:162-171`
**Issue:** The cron upserts `computeSnapshotRows(...)` for the **current** month every day with
`onConflict: 'month,plan'`. `mrr` is computed from *today's* `getPlanPrices()`. That is fine for the
in-progress month, but if `plan_prices` is edited mid-month, the current month's snapshot retroactively
changes on the next cron run (the "frozen history" guarantee only holds for *past* months because their
month-key is no longer produced). The migration comment (036:7-13) claims the upsert "lo mantiene
fresco" — but "fresh" here means *retroactively rewriting the same month's MRR with new prices*, which
can make the evolution chart's most-recent bar jump after a price change unrelated to actual MRR
movement. Also, `active_count` from the snapshot is plan-filtered to basic/studio/pro at write time
(036:33 CHECK + seed `where ... b.plan in (...)`), so a business on any other active plan is invisible
in the historical series even though it counts in the live `mrrByPlan` (which has no plan whitelist).
**Fix:** Decide and document the contract. If month-to-date should reflect price-at-snapshot-time,
freeze the price into the row (already happens) but stop re-writing once the month rolls; if it should
reflect current config, that's the current behavior — then update the 036 comment to say "the current
month is recomputed daily with current prices, not frozen". Align the live `mrrByPlan` plan universe
with the snapshot CHECK (or drop the CHECK) so live vs historical totals are comparable.

### WR-04: `mrr_snapshots.mrr` is `integer` but MRR sums can exceed 32-bit at scale

**File:** `supabase/migrations/036_mrr_snapshots.sql:34`
**Issue:** `mrr integer not null default 0`. Postgres `integer` maxes at 2,147,483,647. MRR in ARS
for the `pro` plan alone (50,000) overflows at ~42,949 active pro accounts — distant, but ARS is a
high-nominal currency and price_ars is editable upward. An overflow throws on upsert (`22003`), which
the cron swallows as best-effort (returns 0, logs), silently dropping the snapshot for that month with
no surfaced error. `active_count` integer is fine.
**Fix:** Use `bigint` for `mrr` (and arguably for any ARS money column):
```sql
mrr bigint not null default 0,
```

### WR-05: Cron snapshot reads ALL businesses but seed/CHECK only allow 3 plans — silent data loss on unknown plan

**File:** `app/api/cron/cancel-expired/route.ts:24-28`, `supabase/migrations/036_mrr_snapshots.sql:33`
**Issue:** `computeSnapshotRows` builds rows for **every** active plan present in `businesses`
(no whitelist — `mrrByPlan` groups by whatever `r.plan` is). But the table has
`check (plan in ('basic','studio','pro'))`. If a business has an active plan outside that set
(e.g. a legacy/grandfathered key), the upsert batch will fail the CHECK constraint (`23514`) for the
**entire** `.upsert(rows, ...)` call, not just the offending row — Supabase sends the rows as one
statement. The whole month's snapshot is then dropped (best-effort catch), and the failure is only a
console log. This is a real foot-gun the moment any non-standard plan exists.
**Fix:** Filter `computeSnapshotRows` output (or `mrrByPlan` input) to the known plan keys before
upserting, mirroring the seed's `b.plan in ('basic','studio','pro')`:
```ts
const KNOWN = new Set(['basic','studio','pro'])
const rows = computeSnapshotRows(...).filter(r => KNOWN.has(r.plan))
```

## Info

### IN-01: `AR_OFFSET` constant is declared and exported but never used

**File:** `lib/crm-reports.ts:37,174`
**Issue:** `const AR_OFFSET = '-03:00'` is defined and re-exported (`export { arMonthKey, AR_OFFSET }`)
but `arMonthKey` uses a hardcoded `3 * 3_600_000` offset instead of `AR_OFFSET`, and no caller imports
it. Dead constant + dead export. The page.tsx uses its own literal `-03:00` string (`page.tsx:75`)
rather than this constant.
**Fix:** Either use `AR_OFFSET` consistently (parse it in `arMonthKey`, import it in page.tsx for
`monthStart`) or remove the constant and its export.

### IN-02: Magic offset `3 * 3_600_000` duplicated and not DST-safe by construction

**File:** `lib/crm-reports.ts:51`
**Issue:** AR is UTC-3 with no DST today, so the literal 3h shift is correct, but the magic number is
inlined with a comment rather than expressed via the named `AR_OFFSET`. The page.tsx month boundary
uses a different mechanism (`new Date('...T00:00:00-03:00')`), so two code paths encode the same AR
assumption differently — a maintenance hazard if Argentina ever changes offset.
**Fix:** Centralize the AR offset (one constant) and derive both the month-key shift and the
`monthStart` ISO from it.

### IN-03: `var` used as a property name (RankingRow.var / RankingItem.var)

**File:** `lib/crm-reports.ts:34,150`, `app/(crm)/admin/reportes/reportes-client.tsx:42,552-557`
**Issue:** `var` is a reserved word; as an object property it's legal but reads poorly and trips some
linters/minifiers' heuristics. Mildly confusing alongside actual `var` semantics.
**Fix:** Rename to `varMrr` or `delta` for clarity (purely cosmetic; not load-bearing).

### IN-04: `mrrByPlan` has no plan whitelist while every consumer assumes the 3 known plans

**File:** `lib/crm-reports.ts:63-72`, `app/(crm)/admin/reportes/page.tsx:101-103,153`
**Issue:** `mrrByPlan` groups by arbitrary `r.plan`, but the page only renders slices for
`PLAN_KEYS = ['basic','studio','pro']` (`page.tsx:153` filters by those keys). An active business on
an unknown plan contributes to `mrrNow`/`activosNow` (the KPI totals and ARPA denominator) but is
invisible in the donut and excluded from the snapshot — so the donut percentages won't sum to the
headline MRR. Not a crash, but an inconsistency between the headline number and the breakdown.
**Fix:** Decide one plan universe and apply it uniformly to KPIs, donut, ranking, snapshot, and churn
denominator (relates to WR-03/WR-05).

### IN-05: `monthLabelFromKey` parses month with `slice(5,7)` — fragile to non-canonical keys

**File:** `app/(crm)/admin/reportes/page.tsx:61-65`
**Issue:** Relies on the key always being exactly `'YYYY-MM-01'`. Snapshot rows come from DB `date`
columns serialized by Supabase, which should be `YYYY-MM-DD`, so `slice(5,7)` is correct today — but
it's positional parsing with a silent `?? key` fallback that would render a raw date if the format ever
shifts. Low risk given the controlled writer.
**Fix:** Parse defensively (`key.split('-')[1]`) or validate the key shape once.

### IN-06: Snapshot count returned to caller but `cancelled: 0` early-return path differs in shape

**File:** `app/api/cron/cancel-expired/route.ts:64-65,117`
**Issue:** The no-holds early return is `{ cancelled: 0, snapshotRows }` while the main return is
`{ cancelled, emailed, snapshotRows }`. The early path omits `emailed`. Harmless for a cron, but the
response shape is inconsistent — any monitoring that asserts a stable JSON shape would see a missing
`emailed` key on quiet days.
**Fix:** Return `{ cancelled: 0, emailed: 0, snapshotRows }` for shape consistency.

## Narrative Findings (AI reviewer)

The security model for this phase is the strongest part of the submission and matches the stated
contract (D-10): isolation is gated by `is_admin` RLS, not `business_id`; service-role touches only
`businesses`; aggregates-only cross the client boundary; migration 036 has no write policy and never
uses `using(true)`. recharts v3 usage is correct (`ResponsiveContainer` inside fixed-height parents
at lines 406/435, custom dark tooltips typed, donut center label via `<Label content=...>`), and the
empty-states are honest (no NaN, null-not-NaN discipline holds in the pure lib and is well covered by
`crm-reports.test.ts`).

The real risk surface is **correctness under data variety**, not security:
- The cron's best-effort `try/catch` converts three distinct failure modes (CHECK violation on an
  unknown plan WR-05, integer overflow WR-04, businesses read error) into the same silent
  `console.error` + `return 0`, so the snapshot can quietly stop updating with no operator-visible
  signal. Best-effort is the right call to not abort `cancel-expired`, but consider surfacing a
  non-zero count or a health ping so a stalled MRR series is noticeable.
- The funnel/order coupling (WR-02) and the unused `AR_OFFSET` (IN-01/IN-02) are the kind of latent
  defects that pass today's tests precisely because the tests share the implementation's coincidental
  assumptions.

No issue rises to BLOCKER: nothing here breaks tenant isolation, leaks data, or corrupts the live
operational tables. WR-01 and WR-05 are the two to fix before this ships, because they produce
visibly wrong numbers (negative churn) and silent total snapshot loss (one non-standard plan).

---

_Reviewed: 2026-06-23_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
