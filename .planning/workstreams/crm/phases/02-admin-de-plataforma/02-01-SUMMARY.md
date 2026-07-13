---
phase: 02-admin-de-plataforma
plan: 01
subsystem: database
tags: [supabase, rls, postgres, trigger, vitest, mercadopago, multi-tenant]

# Dependency graph
requires:
  - phase: 01-cimientos-auditor-a
    provides: "requireAdmin(), logAudit(), audit_log, patrón RLS admin-read via JWT app_metadata, vitest infra"
provides:
  - "Migración 032: tabla plan_prices (ARS) + columnas businesses.has_web_custom/has_whatsapp"
  - "RLS admin-read en plan_prices (SELECT solo is_admin, escritura service-role-only)"
  - "Cierre del agujero A5: trigger businesses_protect_admin_columns que bloquea al owner escribir has_web_custom/has_whatsapp/plan/plan_status"
  - "getPlanPrices() — getter de precios ARS con fallback a subscription-plans.ts"
  - "computeKpis(), deriveAlerts(), resolveTrialEndsAt() — funciones puras testeadas"
  - "filterBusinesses() — filtro puro del directorio (incluye suspendidos en 'todos')"
  - "'suspended' sumado a VALID_STATUSES en app/api/admin/set-plan/route.ts"
affects: [02-02, "server actions CRM", "dashboard /admin", "directorio negocios", "ficha negocio", "editor de precios"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Funciones puras testeables en vitest node (computeKpis/deriveAlerts/filterBusinesses)"
    - "Getter con fallback ARS (getPlanPrices calca getSubscriptionPlan)"
    - "Cierre de columnas administrativas vía BEFORE UPDATE trigger (Postgres no restringe columnas en RLS)"

key-files:
  created:
    - supabase/migrations/032_crm_admin.sql
    - lib/plan-prices.ts
    - lib/crm-metrics.ts
    - lib/crm-metrics.test.ts
    - lib/crm-directory.ts
    - lib/crm-directory.test.ts
  modified:
    - app/api/admin/set-plan/route.ts

key-decisions:
  - "Cierre del agujero A5 vía BEFORE UPDATE trigger (auth.role() != 'service_role' → revierte has_web_custom/has_whatsapp/plan/plan_status a OLD): Postgres no permite restringir columnas dentro de una policy RLS, así que el trigger es el patrón idiomático que NO rompe los updates legítimos del dueño (onboarding/settings/palette)"
  - "plan_prices seedeada con price_ars de subscription-plans.ts (15000/30000/50000), NO el price_usd de plans.ts (Pitfall 1)"
  - "Fin del día AR para exactDate de resolveTrialEndsAt vía offset literal -03:00 (UTC-3 sin DST), sin date-fns-tz (no instalado)"

patterns-established:
  - "Pure-function metrics layer: lógica de KPIs/alertas/trial/filtro fuera de DB y React, now inyectable para determinismo en test"
  - "Service-role price getter con fallback a la constante de seed"

requirements-completed: []  # NO marcar completas aún: ADM-04/05/07/ALERT-01 dependen de pantallas/acciones de planes posteriores y de la migración aplicada

# Metrics
duration: 4min
completed: 2026-06-18
status: complete
checkpoint_resolved: "2026-06-18 — migración 032 aplicada a Supabase por el operador"
---

# Phase 2 Plan 01: Substrato de datos + lógica pura del Admin de Plataforma Summary

**Migración 032 (plan_prices ARS + add-on flags + cierre del agujero RLS A5 vía trigger) escrita, libs puras de KPIs/alertas/trial/filtro testeadas en verde (20/20), y 'suspended' habilitado en set-plan — PAUSADO en el checkpoint humano de aplicar la migración a Supabase.**

## Performance

- **Duration:** ~4 min (tareas autónomas; pausado en checkpoint humano)
- **Started:** 2026-06-18T15:03:07Z
- **Completed (autónomo):** 2026-06-18T15:06:54Z
- **Tasks:** 3 de 4 autónomas completas (Task 2 = checkpoint humano, bloqueante)
- **Files created/modified:** 7

## Accomplishments
- Migración `032_crm_admin.sql` con: tabla `plan_prices` seedeada en ARS (15000/30000/50000), columnas `has_web_custom`/`has_whatsapp`, RLS admin-read sin `using(true)`, y el cierre del agujero A5 (trigger `businesses_protect_admin_columns`).
- `lib/plan-prices.ts` (`getPlanPrices` con fallback ARS), `lib/crm-metrics.ts` (computeKpis/deriveAlerts/resolveTrialEndsAt), `lib/crm-directory.ts` (filterBusinesses) — todas puras y testeadas.
- 20/20 tests de Vitest en verde; sin errores nuevos de `tsc` en las libs creadas.
- `'suspended'` sumado a `VALID_STATUSES` en `app/api/admin/set-plan/route.ts` (D-05), sin otros cambios en el route.

## Task Commits

1. **Task 1: Migración 032** - `184db12` (feat)
2. **Task 3 (RED): tests fallidos** - `3dc7bc6` (test)
3. **Task 3 (GREEN): libs puras** - `1d5da15` (feat)
4. **Task 4: 'suspended' en set-plan** - `c6e1525` (feat)

**Task 2 (checkpoint:human-action, blocking):** PENDIENTE — el operador debe aplicar la migración 032 a Supabase a mano. No completado por el ejecutor (no se fabrica el apply).

## Files Created/Modified
- `supabase/migrations/032_crm_admin.sql` - plan_prices + add-on flags + RLS admin-read + trigger anti-escalada del owner
- `lib/plan-prices.ts` - getPlanPrices() lee plan_prices (service-role) con fallback a subscription-plans.ts price_ars
- `lib/crm-metrics.ts` - computeKpis/deriveAlerts/resolveTrialEndsAt (funciones puras)
- `lib/crm-metrics.test.ts` - 12 tests de las métricas
- `lib/crm-directory.ts` - filterBusinesses (filtro/búsqueda puro)
- `lib/crm-directory.test.ts` - 8 tests del directorio
- `app/api/admin/set-plan/route.ts` - +'suspended' en VALID_STATUSES

## Decisions Made
- **Cierre del agujero A5 con trigger, no con policy de columnas:** Postgres no permite restringir columnas dentro de una policy RLS. Un `BEFORE UPDATE` trigger que revierte las 4 columnas administrativas (`has_web_custom`/`has_whatsapp`/`plan`/`plan_status`) cuando `auth.role() != 'service_role'` bloquea al dueño sin romper sus updates legítimos. El service-role (server actions del CRM) bypassa RLS y corre con role `service_role`, así que sí escribe esas columnas.
- **Fuente de precios = price_ars de subscription-plans.ts** (lo que cobra MP), no price_usd de plans.ts (Pitfall 1, verificado contra el seed).
- **Fin del día AR vía offset literal `-03:00`** (AR es UTC-3 fijo sin DST); no se agregó `date-fns-tz` (no está instalado, cero paquetes nuevos).

## Deviations from Plan

None - plan ejecutado tal cual fue escrito. Los tres archivos de libs, la migración y el cambio de set-plan siguen el contrato. Único corte: el checkpoint humano de Task 2 (esperado por el plan, `autonomous: false`).

## Issues Encountered
None. Las advertencias `LF will be replaced by CRLF` de git son cosméticas (entorno Windows) y no afectan el contenido. El init del SDK resolvió por defecto al workstream `web-builder`; se trabajó con los paths explícitos del workstream `crm` provistos en el prompt.

## Checkpoint Pendiente (Task 2 — BLOCKING)

**Acción humana requerida antes de continuar la fase:** aplicar `supabase/migrations/032_crm_admin.sql` al Postgres del proyecto (SQL Editor del dashboard o `supabase db push`), en orden (última aplicada: 031).

**Verificación post-apply:**
1. `select plan_key, price_ars from public.plan_prices order by plan_key;` → 3 filas (basic 15000, pro 50000, studio 30000).
2. `select column_name from information_schema.columns where table_name='businesses' and column_name in ('has_web_custom','has_whatsapp');` → 2 filas.
3. (Opcional) como dueño no-admin: `update businesses set has_whatsapp=true where id='<su negocio>';` → la flag NO cambia (trigger la revierte).
4. (Operativo, no bloqueante) regenerar `supabase/schema.sql` con `supabase db dump`.

**Verificación diferida** (depende del apply): la query contra `plan_prices` y `businesses.has_*` solo es válida tras aplicar la migración. `getPlanPrices()` degrada a fallback ARS si la tabla no existe todavía, así que el resto de la fase compila igual; los datos live requieren el apply.

**Resume-signal:** el operador escribe "aplicada" cuando las 3 filas + 2 columnas existan, o pega el error.

## Next Phase Readiness
- Substrato de datos y lógica pura listos para que Plan 02 (server actions + pantallas) los consuman.
- BLOQUEADO en el apply de la migración 032 (checkpoint humano). Sin él, las pantallas que lean `plan_prices`/`has_*` no tendrán datos live (getPlanPrices cae a fallback).

## Self-Check: PASSED

- 7 archivos creados/modificados verificados en disco (FOUND).
- 4 commits verificados en git (184db12, 3dc7bc6, 1d5da15, c6e1525).
- 20/20 tests de Vitest en verde; `tsc --noEmit` sin errores nuevos en las libs.

---
*Phase: 02-admin-de-plataforma*
*Completed (autónomo, pausado en checkpoint): 2026-06-18*
