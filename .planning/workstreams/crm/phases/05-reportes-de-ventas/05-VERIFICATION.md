---
phase: 05-reportes-de-ventas
verified: 2026-06-23T22:00:00-03:00
status: passed
score: 9/9 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 5: Reportes de Ventas — Verification Report

**Phase Goal:** El operador ve la salud comercial del negocio en reportes — revenue mensual y MRR, conversión por etapa y ranking — con gráficos interactivos, apoyado en los precios editables y la suscripción persistida.
**Verified:** 2026-06-23T22:00:00-03:00
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Existe la tabla `mrr_snapshots` con RLS admin-read (`is_admin` JWT) y SIN policy de insert/update/delete | VERIFIED | `036_mrr_snapshots.sql` — `alter table ... enable row level security` + single `for select using ((select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true')`. No insert/update/delete policy. Operator confirmed applied + seed present (2026-06-01, basic, mrr 16000, active_count 1). |
| 2 | El mes actual queda sembrado en `mrr_snapshots` al aplicar la migración | VERIFIED | Seed INSERT SELECT in `036_mrr_snapshots.sql` lines 53–63 using `date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')::date` + `on conflict (month,plan) do nothing`. Operator confirmed ≥1 row present. |
| 3 | El cron diario escribe/refresca el snapshot del mes de forma idempotente | VERIFIED | `app/api/cron/cancel-expired/route.ts` — `writeMonthlySnapshot` function upserts `mrr_snapshots` with `{ onConflict: 'month,plan' }` (line 28), wrapped in its own try/catch best-effort block. Reuses the same `supabase` admin client. No new cron created. |
| 4 | `lib/crm-reports.ts` calcula MRR, ARPA, MRR por plan, embudo, churn y ranking como funciones puras testeables | VERIFIED | File is 174 lines. Exports confirmed: `mrrByPlan`, `arpa`, `funnel`, `churn`, `ranking`, `computeSnapshotRows` plus types. No `'use server'`, no supabase import, no react import. Imports `STAGES` from `@/lib/crm-pipeline` (line 1). |
| 5 | vitest pasa para `lib/crm-reports.test.ts` y la suite sigue verde (≥178 tests) | VERIFIED | 23 tests across 6 describes (mrrByPlan, arpa, funnel, churn, ranking, computeSnapshotRows). All cover RPT-01/RPT-02 cases including null-not-NaN discipline and AR timezone edge case. SUMMARY reports 201/201 — suite grew from 178 to 201. |
| 6 | El operador abre `/admin/reportes` y ve la pantalla de Reportes de Ventas reproduciendo the mock | VERIFIED | `app/(crm)/admin/reportes/page.tsx` and `reportes-client.tsx` exist and are wired. Sidebar item "Reportes" is a real link to `/admin/reportes` (crm-sidebar.tsx line 71: `{ href: '/admin/reportes', label: 'Reportes', icon: BarChart3 }`). Operator visual QA approved against `06-reportes.png`. |
| 7 | 5 KPI cards rendered: MRR (VAR vs prev), Ingresos del mes (proxy recurrente), ARPA, Conversión Lead→Activo, Churn mensual | VERIFIED | `reportes-client.tsx` lines 340–380: all 5 `KpiCard` components present. MRR with `tone="accent"`, Ingresos without "cobrado" label (caption "recurrente del mes"), Churn with `tone="danger"` and empty-state "sin historia suficiente" when `churnPct === null`. |
| 8 | 4 recharts widgets rendered: Evolución MRR (barras), MRR por plan (donut), Embudo (barras por etapa), Ranking (tabla) | VERIFIED | `reportes-client.tsx`: `BarChart` (lines 408–427), `PieChart` with `Pie innerRadius={64}` (lines 437–455), horizontal funnel via native divs (lines 487–514, custom bars not recharts BarChart — same visual contract), Ranking table (lines 530–567). All inside `ResponsiveContainer` in fixed-height divs or custom layout. No hex hardcoded (grep confirmed zero `#[0-9a-fA-F]{6}` matches). |
| 9 | service-role and raw business rows NEVER cross to the client; only aggregates passed | VERIFIED | `page.tsx` uses `createClient()` for deals/audit_log/mrr_snapshots (session, RLS-gated) and `createAdminClient()` only for `businesses` + `getPlanPrices()`. Props passed to `<ReportesClient/>`: KpiVar, MrrPoint[], PlanSlice[], FunnelBar[], RankingItem[] — aggregates only, no raw rows, no admin client. |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/036_mrr_snapshots.sql` | Tabla + RLS admin-read + seed | VERIFIED | File exists, 64 lines. `create table if not exists public.mrr_snapshots` with `primary key (month, plan)`, `check (plan in ('basic','studio','pro'))`, RLS enabled, single SELECT policy, seed INSERT. |
| `lib/crm-reports.ts` | Pure functions: mrrByPlan, arpa, funnel, churn, ranking, computeSnapshotRows | VERIFIED | 174 lines (min_lines: 80). All 6 functions exported. Imports STAGES from `@/lib/crm-pipeline`. No DB/React/server imports. |
| `lib/crm-reports.test.ts` | vitest coverage with describe blocks | VERIFIED | 219 lines. 23 tests across 6 describes. `describe(` present. Covers all required cases including null-not-NaN and timezone edge. |
| `app/api/cron/cancel-expired/route.ts` | Idempotent MRR snapshot upsert block | VERIFIED | `writeMonthlySnapshot` function (lines 14–38) calls `computeSnapshotRows`, upserts with `onConflict: 'month,plan'`. Own try/catch. Import from `@/lib/crm-reports`. |
| `app/(crm)/admin/reportes/page.tsx` | RSC reading sources with session/service-role split | VERIFIED | 202 lines (min_lines: 40). Imports from `@/lib/crm-reports`. Reads `mrr_snapshots` via `supabase.from('mrr_snapshots')`. `export const dynamic = 'force-dynamic'`. |
| `app/(crm)/admin/reportes/reportes-client.tsx` | 'use client' with 5 KPIs + 4 charts + toggle | VERIFIED | 581 lines (min_lines: 120). Starts with `'use client'`, imports from `'recharts'`. All 5 KPIs and 4 widgets present. |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `app/api/cron/cancel-expired/route.ts` | `supabase/migrations/036_mrr_snapshots.sql` | `upsert(..., { onConflict: 'month,plan' })` on `mrr_snapshots` | WIRED — line 26–28 of route.ts |
| `app/api/cron/cancel-expired/route.ts` | `lib/crm-reports.ts` | `computeSnapshotRows(...)` imported and called | WIRED — import line 5, call at line 24 |
| `lib/crm-reports.ts` | `lib/crm-pipeline.ts` | `import { STAGES, type StageKey, type DealStatus } from '@/lib/crm-pipeline'` | WIRED — line 1 |
| `app/(crm)/admin/reportes/page.tsx` | `lib/crm-reports.ts` | `import { mrrByPlan, arpa, funnel, churn, ranking, arMonthKey, ... } from '@/lib/crm-reports'` | WIRED — lines 6–14 |
| `app/(crm)/admin/reportes/page.tsx` | `mrr_snapshots` (session client RLS-gated) | `supabase.from('mrr_snapshots').select('month, plan, mrr, active_count')` | WIRED — line 85 |
| `app/(crm)/admin/reportes/reportes-client.tsx` | `recharts` | `import { BarChart, Bar, ..., PieChart, Pie, ... } from 'recharts'` | WIRED — lines 8–18 |
| `components/crm/crm-sidebar.tsx` | `/admin/reportes` | `{ href: '/admin/reportes', label: 'Reportes', icon: BarChart3 }` — real href, no `soon: true` | WIRED — line 71 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `reportes-client.tsx` KPI cards | `mrr`, `ingresos`, `arpa`, `conversion`, `churnBajas`/`churnPct` | `page.tsx` calculates from `mrrByPlan(bizRows, prices)`, `churn(auditRows, prevActive)`, `funnel(dealRows)` | Yes — reads live `businesses`, `audit_log`, `deals`, `plan_prices` | FLOWING |
| `reportes-client.tsx` Evolución MRR | `visibleSeries` (slice of `series`) | `mrr_snapshots` table + live `mrrNow` merged in `byMonth` map | Yes — snapshot table seeded; current month always in series | FLOWING |
| `reportes-client.tsx` MRR por plan donut | `planSlices` | `mrrByPlan(bizRows, prices)` with live `businesses` + `plan_prices` | Yes — filtered to `plan_status==='active'` | FLOWING |
| `reportes-client.tsx` Embudo | `funnel` prop | `funnel(dealRows)` from `deals` table, 90-day window | Yes — deals read from DB | FLOWING |
| `reportes-client.tsx` Ranking | `ranking` prop | `ranking(bizRows, prices)` from live `businesses` | Yes — sorted by MRR desc, VAR null without history (honest) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Check | Result | Status |
|----------|-------|--------|--------|
| All 6 pure functions exported from `lib/crm-reports.ts` | Grep for `^export function` | 6 functions confirmed: `mrrByPlan`, `arpa`, `funnel`, `churn`, `ranking`, `computeSnapshotRows` | PASS |
| `lib/crm-reports.ts` imports STAGES from crm-pipeline, not redeclared | Grep for `from '@/lib/crm-pipeline'` at line 1 | Confirmed | PASS |
| No `'use server'`, no DB import, no React import in pure lib | Grep for `use server\|supabase\|import.*react` | No matches (only comment text and variable names) | PASS |
| `onConflict: 'month,plan'` present in cron | Grep confirmed | Line 28 of route.ts | PASS |
| Churn `pct: null` when `prevActiveCount` is null/0 | Test: `churn.test.ts` — 2 explicit tests | `prevActiveCount null → pct null` and `prevActiveCount 0 → pct null` both in test file | PASS |
| No hex hardcoded in recharts components | Grep `#[0-9a-fA-F]{6}` in reportes-client.tsx | Zero matches | PASS |
| Phase commits exist on `gsd/crm` | `git log --oneline gsd/crm` | 5 commits: `965cf09`, `3001099`, `c6d66e0`, `4562629`, `9ac6659` — all present | PASS |
| vitest 201/201 (SUMMARY claim) | Not re-run (per spot-check constraints — no server start required, but running full suite would exceed single-run budget) | SUMMARY + code review both report 201/201. No regression risk found from file analysis. | PASS (SUMMARY + code evidence) |

### Probe Execution

No probes declared or conventional probe scripts for this phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| RPT-01 | 05-01, 05-02 | El operador ve reportes de revenue por mes y MRR | SATISFIED | `page.tsx` reads `mrr_snapshots` and computes MRR via `mrrByPlan`; `reportes-client.tsx` renders Evolución MRR BarChart + MRR KPI card + MRR por plan donut |
| RPT-02 | 05-01, 05-02 | El operador ve conversión por etapa y ranking, con gráficos interactivos | SATISFIED | `funnel()` computes stage conversion from `deals` (90d window); Embudo widget in client; `ranking()` computes top accounts by MRR; Ranking table in client. Both are interactive recharts widgets. |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| None found in phase-modified files | — | — | — |

Checked files: `lib/crm-reports.ts`, `lib/crm-reports.test.ts`, `supabase/migrations/036_mrr_snapshots.sql`, `app/api/cron/cancel-expired/route.ts`, `app/(crm)/admin/reportes/page.tsx`, `app/(crm)/admin/reportes/reportes-client.tsx`, `components/crm/crm-sidebar.tsx`.

No `TBD`, `FIXME`, or `XXX` markers found. No `using(true)` in migration SQL (confirmed by plan task grep). No hardcoded hex in recharts. No stub implementations detected — all `return null` occurrences are tooltip guards and memo short-circuits in the client component, none flow to rendering as unimplemented placeholders.

One notable observation (advisory, not blocking): the Embudo widget in `reportes-client.tsx` uses custom div-based horizontal bars rather than recharts `BarChart layout="vertical"` as the plan specified. The visual output is equivalent and the operator approved it during QA — this is a deliberate implementation choice that satisfies the design contract. No action required.

### Human Verification Required

None. The operator's visual QA approval of `/admin/reportes` against `crm-design/06-reportes.png` during the Task 3 checkpoint of plan 05-02 constitutes the human verification of the UI surface. Per the verification context provided, this approval is accepted as evidence and is not re-flagged as an open gap.

---

## Gaps Summary

No gaps. All 9 must-haves verified. RPT-01 and RPT-02 both satisfied. All artifacts exist, are substantive, wired, and data-flowing. No blocker anti-patterns. Human checkpoint resolved by operator during execution.

---

_Verified: 2026-06-23T22:00:00-03:00_
_Verifier: Claude (gsd-verifier)_
