---
phase: 05
slug: reportes-de-ventas
status: secured
threats_open: 0
threats_closed: 9
asvs_level: 1
block_on: high
created: 2026-06-24
---

# Phase 05 — Security: Reportes de Ventas (CRM)

**Workstream:** crm
**Phase:** 05-reportes-de-ventas
**Audited:** 2026-06-24
**ASVS Level:** 1
**Block-on:** high
**Register source:** authored at plan-time (PLAN.md `<threat_model>` blocks 05-01 / 05-02)
**Verification mode:** State-B — register built from plan threat models, mitigations verified against working-tree code (no new-threat scan)

**Result: SECURED — 9/9 threats CLOSED (8 mitigate, 1 accept). No OPEN threats, no unregistered flags.**

Phase 5 es una superficie de inteligencia comercial admin-only: lectura cross-tenant agregada (gate `is_admin`, NO `business_id`) + UNA escritura nueva (snapshot mensual de MRR vía service-role desde el cron diario). El code-review fix pass posterior (037 bigint, filtro de planes, clamp de churn, funnel por `.order`) se verificó contra el código vivo y NO debilitó ninguna mitigación.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Vercel cron → `/api/cron/cancel-expired` | Invocación externa autenticada con `Authorization: Bearer ${CRON_SECRET}` | trigger (sin payload sensible) |
| API route (service-role) → Postgres | El cron escribe `mrr_snapshots` con service-role (no hay sesión admin en el cron) | agregados de MRR (month/plan/mrr/active_count) |
| Postgres RLS (`mrr_snapshots`) → lectura de sesión | Policy admin-read `is_admin` es el gate; sin policy de write nadie salvo service-role escribe | filas agregadas admin-only |
| Operador (`is_admin`) → tablas admin-only | Aislamiento por flag `is_admin` del JWT, NO `business_id` (datos cross-tenant del operador por diseño) | deals/audit_log/mrr_snapshots/businesses (agregados) |
| RSC (server) → reportes-client (browser) | Solo cruzan agregados/no sensibles; el admin client y las filas crudas nunca salen del server | KPIs, series, embudo, ranking (name/plan/mrr/var) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-05-01 | Elevation of Privilege | `mrr_snapshots` RLS | mitigate | `036:41-46` RLS enabled + única policy `for select using ((select auth.jwt()->'app_metadata'->>'is_admin')='true')` (verbatim de 034); sin insert/update/delete/all; `using(true)` solo en comentario de prohibición (`036:20`). Corroborado en `schema.sql:1040` (única SELECT) + `:1203` (RLS on). | closed |
| T-05-02 | Tampering | snapshot mensual | mitigate | Sin policy de write → solo el service-role del cron escribe; PK `(month,plan)` (`036:37`) impide duplicar. `037_mrr_snapshots_bigint.sql` = SOLO `alter column mrr type bigint` (sin policy/insert/update/delete/grant/rls). El dueño de un negocio no puede falsificar su MRR histórico. | closed |
| T-05-03 | Spoofing | cron `/api/cron/cancel-expired` | mitigate | `route.ts:45` `auth !== Bearer ${CRON_SECRET}` → 401; el bloque de snapshot corre dentro del mismo handler autenticado (`writeMonthlySnapshot` `:67/:118`); sin endpoint nuevo. | closed |
| T-05-04 | Denial of Service | cron piggyback | mitigate/accept | `route.ts:17-41` `writeMonthlySnapshot` en su propio try/catch (best-effort): todo error `return 0` + `console.error`, nunca throw, nunca aborta cancel-expired. Idempotente vía `upsert(onConflict:'month,plan')` (`:31`). Residual aceptado: si un día falla, se re-escribe al siguiente. | closed |
| T-05-05 | Information Disclosure | service-role → cliente | mitigate | `reportes/page.tsx:186-201` pasa SOLO agregados serializables (KPIs, series, planSlices, funnel, ranking name/plan/mrr/var); `reportes-client.tsx` sin `createAdminClient`/supabase/secret/token. Admin client y filas crudas de businesses nunca cruzan al browser. | closed |
| T-05-06 | Elevation of Privilege | lectura de tablas admin-only | mitigate | `page.tsx:68,78-85` `deals`/`audit_log`/`mrr_snapshots` con `createClient()` (session, hereda RLS admin-read); `createAdminClient()` (`:69,86`) SOLO para `businesses` (sin policy is_admin). Lección T-04-10: leer con service-role bypassaría la policy. `lib/crm-reports.ts` puro. | closed |
| T-05-07 | Elevation of Privilege | acceso a `/admin/reportes` | mitigate | `(crm)/layout.tsx:26-29` guard server-side: `if (!user) redirect('/login')` + `if (is_admin !== true) redirect('/dashboard')` antes de cualquier JSX (FND-01); la página no re-guarda (defensa en profundidad) y la RLS no devolvería filas igual. | closed |
| T-05-08 | Information Disclosure | scope cross-tenant | accept | Reportes = agregados cross-tenant POR DISEÑO (datos del operador); aislamiento `is_admin`, NO `business_id` (D-10). `page.tsx` sin `.eq('business_id',...)`; solo cruzan agregados, no datos sensibles de un negocio puntual. Residual aceptado (ver Accepted Risks). | closed |
| T-05-SC | Tampering (supply-chain) | npm installs | mitigate | `git diff --stat HEAD -- package.json package-lock.json` vacío; cero deps nuevas (recharts ^3.8.1 + vitest ya instalados). Los `instagram-a-web` node_modules en git status son de otra skill, fuera de esta fase. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| T-05-08 | T-05-08 | Los reportes son agregados cross-tenant por diseño (el operador ve la salud comercial de TODOS los negocios). El aislamiento es el flag `is_admin` del JWT + la RLS admin-read, NO `business_id`. Solo cruzan agregados (KPIs, series, ranking name/plan/mrr); ningún dato sensible de un negocio puntual. No se filtra por tenant a propósito. | CRM operator (dueño) | 2026-06-24 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-24 | 9 | 9 | 0 | gsd-security-auditor (opus) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log (T-05-08)
- [x] `threats_open: 0` confirmed
- [x] `status: secured` set in frontmatter

**Approval:** verified 2026-06-24
