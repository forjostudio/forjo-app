---
phase: 05-reportes-de-ventas
fixed_at: 2026-06-23T21:52:00Z
review_path: .planning/workstreams/crm/phases/05-reportes-de-ventas/05-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
requires_manual_action: true
---

# Phase 5: Code Review Fix Report

**Fixed at:** 2026-06-23
**Source review:** .planning/workstreams/crm/phases/05-reportes-de-ventas/05-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (WR-01..WR-05; the 6 INFO are out of scope — critical_warning only)
- Fixed: 5
- Skipped: 0
- tsc `--noEmit`: clean
- vitest: 204 passed (17 files) — +3 new tests vs the prior 201 in this lib slice

> ACTION REQUIRED: WR-04 created migration `supabase/migrations/037_mrr_snapshots_bigint.sql`
> which **must be applied by hand** in the Supabase SQL Editor by the operator (036 is already
> applied to the live DB, so the column change ships as a new migration). After applying, regenerate
> `supabase/schema.sql` with `supabase db dump`. Resume signal: 'aplicada'.

## Fixed Issues

### WR-01: Churn % can be negative

**Files modified:** `lib/crm-reports.ts`, `lib/crm-reports.test.ts`
**Commit:** ded66f6
**Applied fix:** Clamped the rendered churn rate at a floor of 0 in `churn()`. When the net
(`suspend - reactivate`) is `<= 0` (reactivations outpace suspensions, or no losses), `pct` is `0`
instead of a negative figure. The raw net `bajas` count is preserved (can still be shown negative
separately). No client change needed: `pctFormatter.format(0)` renders `0%`, and the existing
`churnHasHistory` null-guard still drives the `—` empty-state. Added a test for net-negative churn.

### WR-02: `funnel()` assumed array index == `.order`

**Files modified:** `lib/crm-reports.ts`, `lib/crm-reports.test.ts`
**Commit:** d234445
**Applied fix:** `funnel()` now sorts a copy of `STAGES` by the `.order` field, builds an
`order -> slot` map, and derives `maxOrder` from the real max `.order` value rather than
`STAGES.length - 1`. Counts are bucketed by order-slot, and the result is returned in `.order` order.
Reordering `STAGES` or assigning non-contiguous orders no longer silently corrupts the funnel. Added
a test asserting index/order independence (result strictly increasing in `.order`; the highest-order
stage — by field, not array index — reaches every bucket).

### WR-03: Imprecise "frozen history" comment

**Files modified:** `app/api/cron/cancel-expired/route.ts`
**Commit:** 72f6bd8
**Applied fix:** Comment-only. Replaced the ambiguous "lo mantiene fresco / meses pasados congelados"
wording with an accurate contract: only the in-progress current month is re-upserted each cron run
(recomputed with today's `getPlanPrices`, so a mid-month price change moves the current-month bar on
the next run); past months are frozen *de facto* because their month-key is no longer produced — not
because a price is captured into the row. No logic change. (036's header comment left as-is to avoid
touching the applied migration file; the authoritative, accurate comment now lives at the writer.)

### WR-04: `mrr_snapshots.mrr` is `integer`, can overflow at scale

**Files modified:** `supabase/migrations/037_mrr_snapshots_bigint.sql` (NEW)
**Commit:** 910e8a3
**Applied fix:** Created migration 037 with
`alter table public.mrr_snapshots alter column mrr type bigint;` plus a Spanish header explaining the
overflow risk (ARS is high-nominal; `pro` at 50.000 overflows int at ~42.949 accounts; an overflow
throws 22003 that the best-effort cron swallows, dropping the snapshot silently). `active_count` stays
`integer`. **036 was NOT edited** — it is already applied to the live DB; editing it would desync.
**STATUS: fixed (migration created) — REQUIRES manual apply by operator (resume-signal 'aplicada').**
After apply, regenerate `supabase/schema.sql`.

### WR-05: Cron snapshot upsert fails entirely on an unknown plan

**Files modified:** `lib/crm-reports.ts`, `lib/crm-reports.test.ts`
**Commit:** 61b8806
**Applied fix:** `computeSnapshotRows` now filters its output to the known plan keys
(`SNAPSHOT_PLANS = {basic, studio, pro}`, mirroring 036's CHECK and seed). A business on a
legacy/grandfathered plan can no longer trip the table CHECK (23514) and fail the entire month's
`.upsert` batch (Supabase sends the batch as one statement) — the offending plan is dropped at the
lib boundary instead. The cron consumes this filtered output, so the cron path is covered without an
extra DB-level change. Added a test with legacy/grandfathered plans.

---

_Fixed: 2026-06-23_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
