---
phase: 05-reportes-de-ventas
plan: 01
subsystem: database
tags: [crm, reportes, mrr, supabase, rls, vitest, cron, snapshots]

# Dependency graph
requires:
  - phase: 02-admin-de-plataforma
    provides: "plan_prices (price_ars 15k/30k/50k) — base de MRR; businesses.plan/plan_status"
  - phase: 04-pipeline-tags-timeline
    provides: "STAGES (orden del embudo lead→pago) en lib/crm-pipeline.ts; deals/DealStatus"
provides:
  - "lib/crm-reports.ts: cálculos puros MRR/ARPA/mrrByPlan/funnel/churn/ranking/computeSnapshotRows (RPT-01/RPT-02 calculables)"
  - "Tabla mrr_snapshots (migración 036) admin-only por RLS, sin write policy, con seed del mes actual"
  - "Snapshot mensual idempotente piggybackeado en el cron diario cancel-expired (upsert onConflict month,plan)"
affects: [05-02, reportes, surface-reportes, recharts]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lib pura testeable espejando lib/crm-metrics.ts (sin DB/React/'use server'; now inyectable; null-not-NaN)"
    - "Cron piggyback idempotente: nuevo trabajo mensual dentro del cron diario existente (Vercel Hobby = 1/día), upsert por PK"
    - "Tabla admin-only por is_admin (no business_id): RLS single SELECT policy, sin insert/update/delete (solo service-role escribe)"

key-files:
  created:
    - "lib/crm-reports.ts — cálculos puros de reportes de ventas"
    - "lib/crm-reports.test.ts — 23 tests vitest (RPT-01/RPT-02)"
    - "supabase/migrations/036_mrr_snapshots.sql — tabla + RLS admin-read + seed mes actual"
  modified:
    - "app/api/cron/cancel-expired/route.ts — bloque snapshot mensual idempotente (best-effort try/catch)"

key-decisions:
  - "MRR reusa la fórmula de computeKpis (Σ prices[plan] ?? 0 sobre plan_status==='active'); add-ons NO entran (D-02)"
  - "STAGES se importa de @/lib/crm-pipeline (única fuente de verdad del orden del embudo); no se redeclara (D-04)"
  - "Disciplina null-not-NaN: datos faltantes/divide-by-zero devuelven null, nunca NaN/Infinity (D-05/Pitfall 6)"
  - "month-key en zona AR vía offset literal -03:00 (UTC-3 sin DST), sin date-fns-tz (cero paquetes nuevos, Pitfall 5)"
  - "mrr_snapshots aislada por is_admin (no business_id): datos cross-tenant del operador por diseño (D-10)"
  - "Migración 036 aplicada A MANO al SQL Editor (regla CLAUDE.md: GSD no corre supabase db push); igual que 034/035"

patterns-established:
  - "Snapshot histórico congelado: el upsert re-escribe solo el mes en curso; meses pasados quedan inmutables porque su month-key no se recalcula (A2 RESEARCH)"
  - "Idempotencia por PK (month,plan): el cron puede correr todos los días sin duplicar filas"

requirements-completed: [RPT-01, RPT-02]

# Metrics
duration: ~14min
completed: 2026-06-23
status: complete
---

# Phase 5 Plan 01: Cimientos de Reportes de Ventas Summary

**Lib pura crm-reports.ts (MRR/ARPA/embudo/churn/ranking/snapshot reusando computeKpis + STAGES) más la tabla mrr_snapshots admin-only por RLS con seed y autoalimentación mensual idempotente desde el cron diario.**

## Performance

- **Duration:** ~14 min
- **Tasks:** 2 auto (TDD task 1) + 1 checkpoint:human-verify resuelto
- **Files modified:** 4 (3 creados, 1 modificado)

## Accomplishments
- `lib/crm-reports.ts`: cálculos puros `mrrByPlan`, `arpa`, `funnel`, `churn`, `ranking`, `computeSnapshotRows` cubriendo la parte calculable de RPT-01 (revenue/MRR/MRR por plan/serie histórica) y RPT-02 (embudo de conversión por etapa + churn + ranking).
- 23 tests vitest nuevos (`lib/crm-reports.test.ts`); suite completa verde 201/201; `tsc --noEmit` limpio.
- Migración 036: tabla `mrr_snapshots` (PK `month,plan`, CHECK `plan in basic/studio/pro`), RLS habilitado con UNA sola policy `for select` por `is_admin` (predicado verbatim de 034), SIN policy de write, más seed del mes actual.
- Cron diario `cancel-expired` autoalimenta el snapshot mensual de forma idempotente (`upsert onConflict 'month,plan'`) dentro de su propio try/catch best-effort — un fallo del snapshot no aborta cancel-expired, ni se agrega un cron nuevo (Vercel Hobby).

## Task Commits

1. **Task 1: lib pura crm-reports.ts + vitest (TDD)** — `965cf09` (feat)
2. **Task 2: migración 036 mrr_snapshots (RLS admin-read + seed) + snapshot mensual idempotente en el cron** — `3001099` (feat)
3. **Task 3 (checkpoint:human-verify):** migración 036 aplicada a mano por el operador — resume-signal "aplicada" (sin commit de código)

**Plan metadata:** SUMMARY/STATE/ROADMAP — `.planning/` gitignoreado → commit reporta `skipped_gitignored` (esperado; valen los writes en disco).

## Files Created/Modified
- `lib/crm-reports.ts` — módulo puro de cálculo de reportes (MRR, ARPA, mrrByPlan, funnel, churn, ranking, computeSnapshotRows); importa STAGES de `@/lib/crm-pipeline`.
- `lib/crm-reports.test.ts` — cobertura vitest de los 7 cálculos (23 tests), un describe por función.
- `supabase/migrations/036_mrr_snapshots.sql` — tabla `mrr_snapshots` + RLS admin-read single SELECT policy + seed del mes actual.
- `app/api/cron/cancel-expired/route.ts` — bloque idempotente que upsertea el snapshot mensual de MRR antes del `Response.json` final.

## Decisions Made
- None nuevas — se siguieron las decisiones LOCKED del plan (D-02 MRR sin add-ons, D-04 STAGES único, D-05 null-not-NaN, D-10 aislamiento por is_admin, Pitfall 5 offset -03:00). Cero dependencias nuevas (D-09: recharts y vitest ya instalados).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Checkpoint Resolution

**Task 3 (checkpoint:human-verify) — RESUELTO.** El operador aplicó `supabase/migrations/036_mrr_snapshots.sql` a Supabase a mano (SQL Editor, en orden, después de 035) y confirmó con "aplicada":
- Tabla `mrr_snapshots` existe con el esquema correcto (`month`/`plan`/`mrr`/`active_count`/`created_at`).
- RLS habilitado con exactamente UNA policy "admin read mrr_snapshots" (SELECT), sin policy de insert/update/delete.
- Fila seed del mes actual presente (2026-06-01, basic, mrr 16000, active_count 1).

Pendiente operativo NO bloqueante: regenerar `supabase/schema.sql` con `supabase db dump --linked` (igual que tras 034/035).

## Threat Flags

Mitigaciones del threat_model del plan aplicadas y verificadas:

| Threat ID | Disposition | Estado |
|-----------|-------------|--------|
| T-05-01 (EoP — mrr_snapshots RLS) | mitigate | DONE — una sola policy `for select using ((select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true')`; sin policy de write; `using(true)` ausente del SQL vivo |
| T-05-02 (Tampering — snapshot mensual) | mitigate | DONE — sin write policy → solo el service-role del cron escribe; PK (month,plan) impide duplicar |
| T-05-03 (Spoofing — cron) | mitigate | DONE — el snapshot hereda el gate `Bearer ${CRON_SECRET}` del handler existente; sin endpoint nuevo |
| T-05-04 (DoS — cron piggyback) | mitigate/accept | DONE — bloque en try/catch propio (best-effort); residual aceptado: el mes en curso se re-escribe al día siguiente (idempotente por PK) |
| T-05-SC (supply-chain — npm) | mitigate | DONE — cero dependencias nuevas; package.json/package-lock.json intactos |

No se introdujo superficie de seguridad fuera del threat_model del plan.

## Next Phase Readiness
- Capa de datos + cálculo de Wave 1 lista. Plan 05-02 (surface visual recharts en `/admin/reportes`) puede consumir `lib/crm-reports.ts` y leer la tabla viva `mrr_snapshots`.
- La tabla está sembrada y se autoalimenta 1×/mes; el chart de evolución no arranca vacío.

## Self-Check: PASSED

- `lib/crm-reports.ts` — FOUND
- `lib/crm-reports.test.ts` — FOUND
- `supabase/migrations/036_mrr_snapshots.sql` — FOUND
- `app/api/cron/cancel-expired/route.ts` (onConflict 'month,plan') — FOUND
- Commit `965cf09` — FOUND on gsd/crm
- Commit `3001099` — FOUND on gsd/crm
- `npx tsc --noEmit` — clean

---
*Phase: 05-reportes-de-ventas*
*Completed: 2026-06-23*
