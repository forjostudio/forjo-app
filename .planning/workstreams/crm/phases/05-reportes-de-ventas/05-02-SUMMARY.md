---
phase: 05-reportes-de-ventas
plan: 02
subsystem: ui
tags: [recharts, rsc, nextjs, supabase, crm, mrr, reportes, dataviz]

# Dependency graph
requires:
  - phase: 05-01
    provides: "lib/crm-reports.ts (MRR/ARPA/embudo/churn/ranking/snapshot), tabla mrr_snapshots (RLS admin-read) + seed, snapshot mensual en el cron diario"
  - phase: 02-admin-de-plataforma
    provides: "plan_prices editables (getPlanPrices), SUBSCRIPTION_PLANS display names, columnas no sensibles de businesses"
  - phase: 04-pipeline-tags-timeline
    provides: "deals (etapas lead→pago) para el embudo de conversión; lib/crm-pipeline STAGES[].color"
provides:
  - "Ruta /admin/reportes: RSC con split de lectura session/service-role + cálculo con lib pura + props solo-agregados"
  - "reportes-client.tsx: 5 KPI cards + 4 charts recharts (Evolución MRR / donut MRR por plan / embudo / ranking) + toggle 3/6/12m"
  - "Primeros gráficos recharts de la app (BarChart/PieChart donut/BarChart vertical + tooltips custom dark tipados)"
  - "Nav item 'Reportes' habilitado en el sidebar CRM (apunta a /admin/reportes)"
affects: [06-comms, reportes, dataviz, crm-admin]

# Tech tracking
tech-stack:
  added: []  # cero dependencias nuevas — recharts ^3.8.1 ya estaba instalado (D-09)
  patterns:
    - "Split de lectura session (RLS admin-read) vs service-role (businesses sin policy) en un Promise.all dentro de un RSC del CRM"
    - "RSC pasa SOLO agregados serializables al client; el admin client y las filas crudas nunca cruzan al browser (T-01-09/T-02-09)"
    - "Primeros charts recharts del repo dentro de un 'use client': ResponsiveContainer en padre con altura fija, tooltips custom dark con tokens CSS (var(--card)/--border/--foreground), cero hex hardcodeado"
    - "Empty-states honestos: churn muestra cuenta de bajas + '— sin historia suficiente' cuando pct es null (jamás NaN%)"

key-files:
  created:
    - "app/(crm)/admin/reportes/page.tsx"
    - "app/(crm)/admin/reportes/reportes-client.tsx"
  modified:
    - "components/crm/crm-sidebar.tsx"

key-decisions:
  - "Split session/service-role: deals/audit_log/mrr_snapshots con createClient() (hereda RLS admin-read, T-05-06); businesses + getPlanPrices con createAdminClient() solo tras el guard del layout (sin policy is_admin)"
  - "Cross-tenant POR DISEÑO (D-10): el aislamiento es is_admin, NO business_id — ninguna query filtra por tenant; residual T-05-08 aceptado y documentado; solo agregados cruzan al cliente"
  - "'Ingresos del mes' relabelada como proxy recurrente, NO 'cobrado' (D-03)"
  - "Botón 'Exportar' DIFERIDO a v2 (D-08): no se renderiza acción muerta"
  - "Churn empty-state honesto (D-05): cuenta de bajas siempre; % solo si hay snapshot del mes previo, si no '— sin historia suficiente'"
  - "Etiquetas de plan desde SUBSCRIPTION_PLANS[plan].name (Básico/Estudio/Pro), fuente de verdad, NO el texto del mock"
  - "Nav item 'Reportes' habilitado durante la QA visual (estaba como PRONTO con href '#'); follow-up no planificado, agregado al scope efectivo del plan"

patterns-established:
  - "Charts recharts en el CRM dark: ResponsiveContainer en <div className='h-72 w-full'>, tooltips custom tipados TooltipContentProps con tokens, colores de series desde var(--...) y STAGES[].color"
  - "RSC de reportes admin-only: lectura mixta segura + cálculo con lib pura + props solo-agregados (template para futuros dashboards cross-tenant del operador)"

requirements-completed: [RPT-01, RPT-02]

# Metrics
duration: ~57min (incluye el checkpoint humano de QA visual)
completed: 2026-06-23
status: complete
---

# Phase 5 Plan 02: Superficie de Reportes de Ventas Summary

**Pantalla `/admin/reportes` (RSC con split session/service-role + reportes-client con 5 KPIs y 4 charts recharts) reproduciendo el mock LOCKED 06-reportes.png sobre el shell dark del CRM, cerrando RPT-01 (MRR/revenue) y RPT-02 (conversión por etapa + ranking).**

## Performance

- **Duration:** ~57 min (incluye el checkpoint humano de verificación visual)
- **Started:** 2026-06-23T20:28:06-03:00 (Task 1)
- **Completed:** 2026-06-23T21:25:15-03:00 (follow-up sidebar)
- **Tasks:** 2 auto + 1 checkpoint humano resuelto (+ 1 follow-up no planificado)
- **Files modified:** 3 (2 creados, 1 modificado)

## Accomplishments
- RSC `/admin/reportes`: lee `deals`/`audit_log`/`mrr_snapshots` con `createClient()` (session, RLS admin-read) y `businesses`+`getPlanPrices()` con `createAdminClient()` (service-role) en un `Promise.all`; calcula con `lib/crm-reports.ts`; pasa SOLO agregados al cliente. Sin filtro `business_id` (cross-tenant por diseño).
- `reportes-client.tsx`: 5 KPI cards (MRR con VAR, Ingresos del mes como proxy recurrente, ARPA, Conversión Lead→Activo, Churn rojo con empty-state honesto) + 4 charts recharts (Evolución MRR barras, MRR por plan donut con total al centro, Embudo barras horizontales, Ranking tabla) + toggle 3/6/12m que re-filtra la serie en memoria. Primeros charts del repo; tooltips custom dark; cero hex hardcodeado.
- Nav item "Reportes" habilitado en el sidebar CRM (de PRONTO/href '#' a link real a `/admin/reportes`).
- QA visual humana aprobada contra `crm-design/06-reportes.png` (con los diffs esperados LOCKED: labels Básico/Estudio/Pro, ranking VAR "—", embudo horizontal, bajo volumen por 1 negocio activo).

## Task Commits

Cada tarea se commiteó atómicamente:

1. **Task 1: RSC /admin/reportes/page.tsx (split session/service-role + agregados)** - `c6d66e0` (feat)
2. **Task 2: reportes-client.tsx (5 KPIs + 4 charts recharts + toggle 3/6/12m)** - `4562629` (feat)
3. **Follow-up (no planificado): habilitar nav item Reportes en el sidebar CRM** - `9ac6659` (feat)

**Task 3 (checkpoint:human-verify):** RESUELTO — el operador confirmó "approved"; sin cambios de código.

**Plan metadata:** se commitea por separado (`.planning/` está gitignored en este repo → el commit de docs hace skip; esperado).

## Files Created/Modified
- `app/(crm)/admin/reportes/page.tsx` - RSC: lectura mixta segura (session para tablas admin-read, service-role solo para businesses tras el guard del layout), cálculo con lib/crm-reports, props solo-agregados; docblock español del split + racional de aislamiento is_admin (no business_id).
- `app/(crm)/admin/reportes/reportes-client.tsx` - 'use client' con 5 KPIs + 4 charts recharts + toggle 3/6/12m; arsFormatter copiado verbatim de pipeline-client; tooltips custom dark; empty-states honestos.
- `components/crm/crm-sidebar.tsx` - nav item "Reportes" habilitado (link a /admin/reportes en lugar de placeholder PRONTO).

## Decisions Made
- **Split session/service-role:** `deals`/`audit_log`/`mrr_snapshots` con `createClient()` (heredan RLS admin-read; leer con service-role bypassaría la policy — lección T-04-10). `businesses` (sin policy is_admin) + `getPlanPrices()` con `createAdminClient()` solo tras el guard del layout `(crm)`.
- **Cross-tenant por diseño (D-10):** los reportes son agregados del operador; el aislamiento es `is_admin`, no `business_id`. Ninguna query filtra por tenant. Solo cruzan agregados, nunca el admin client ni filas crudas de businesses.
- **Relabelado honesto:** "Ingresos del mes" = proxy recurrente, no "cobrado" (D-03). Churn muestra cuenta de bajas siempre y "— sin historia suficiente" si no hay mes previo (D-05). Sin botón "Exportar" muerto (D-08, diferido a v2).
- **Etiquetas de plan** desde `SUBSCRIPTION_PLANS[plan].name`, no del mock.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Nav item "Reportes" del sidebar CRM seguía deshabilitado**
- **Found during:** Checkpoint de QA visual (Task 3)
- **Issue:** El plan asumía que el item "Reportes" del sidebar ya apuntaba a la ruta ("El item 'Reportes' ya existe en el sidebar"), pero seguía como placeholder PRONTO con `href: '#'`. La pantalla recién construida era inaccesible desde la navegación.
- **Fix:** Habilitado el item en `components/crm/crm-sidebar.tsx` para que linkee a `/admin/reportes`.
- **Files modified:** components/crm/crm-sidebar.tsx
- **Verification:** tsc limpio; el operador accedió a /admin/reportes vía el sidebar durante la QA visual y aprobó.
- **Committed in:** `9ac6659`

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Necesario para que la pantalla sea alcanzable desde la UI. Sin scope creep — un único archivo de navegación.

## Issues Encountered
None — los dos tasks auto pasaron tsc/build/tests; el único ajuste fue el sidebar (ver Deviations).

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: information-disclosure (mitigated) | app/(crm)/admin/reportes/page.tsx | T-05-05: service-role y filas crudas de businesses contenidos en el server; solo agregados (KPIs, serie, MRR por plan, embudo, ranking name/plan/mrr/var) cruzan a reportes-client. |
| threat_flag: elevation-of-privilege (mitigated) | app/(crm)/admin/reportes/page.tsx | T-05-06: deals/audit_log/mrr_snapshots leídos con createClient() (session, hereda RLS admin-read), NO service-role. |
| threat_flag: elevation-of-privilege (mitigated) | app/(crm)/layout.tsx | T-05-07: guard server-side del layout (crm) (FND-01) protege /admin/reportes; sin re-guard redundante (defensa en profundidad ya provista). |
| threat_flag: information-disclosure (accepted) | app/(crm)/admin/reportes/page.tsx | T-05-08: scope cross-tenant POR DISEÑO (D-10) — aislamiento is_admin, NO business_id; residual aceptado, solo agregados expuestos. |
| threat_flag: supply-chain (mitigated) | package.json | T-05-SC: cero dependencias nuevas (recharts ^3.8.1 ya instalado, D-09); el plan no tocó package.json/package-lock.json. |

## must_haves status

- ✅ El operador abre /admin/reportes y ve la pantalla reproduciendo el mock 06-reportes.png (QA visual aprobada).
- ✅ 5 KPI cards: MRR (con VAR), Ingresos del mes (proxy recurrente, NO "cobrado"), ARPA, Conversión Lead→Activo, Churn (cuenta siempre; % o "— sin historia suficiente").
- ✅ 4 gráficos recharts: Evolución de MRR (barras), MRR por plan (donut con total al centro), Embudo (barras por etapa), Ranking (tabla).
- ✅ Toggle 3/6/12 meses re-filtra la serie en memoria mostrando solo los meses disponibles (sin inventar datos).
- ✅ service-role y filas crudas de businesses NUNCA cruzan al cliente: reportes-client recibe SOLO agregados.
- ✅ artifacts: page.tsx (importa @/lib/crm-reports, lee mrr_snapshots) y reportes-client.tsx ('use client' + recharts) presentes.

## Next Phase Readiness
- Phase 05 (reportes-de-ventas) COMPLETA: 05-01 (lib/datos) + 05-02 (superficie) → RPT-01 y RPT-02 cerrados. 2 de 2 plans.
- Listo para Phase 06 (Comms/Bandeja). Sin blockers de esta fase.
- Pendiente operativo NO bloqueante heredado de 05-01: regenerar `supabase/schema.sql` (migración 036 ya aplicada a mano).

## Self-Check: PASSED

Verificado:
- Artefactos existen: app/(crm)/admin/reportes/page.tsx, app/(crm)/admin/reportes/reportes-client.tsx, components/crm/crm-sidebar.tsx (nav item habilitado, línea 71).
- Commits en gsd/crm: c6d66e0, 4562629, 9ac6659 (confirmados en git log).
- tsc limpio (npx tsc --noEmit → TSC_OK). build verde y 201/201 tests ya verificados por el executor.

---
*Phase: 05-reportes-de-ventas*
*Completed: 2026-06-23*
