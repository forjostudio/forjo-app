---
phase: 02-admin-de-plataforma
plan: 03
subsystem: crm-frontend
tags: [next16, rsc, supabase, service-role, multi-tenant, cva, dashboard, directorio]

# Dependency graph
requires:
  - phase: 02-admin-de-plataforma
    plan: 01
    provides: "computeKpis/deriveAlerts (lib/crm-metrics), filterBusinesses (lib/crm-directory), getPlanPrices (lib/plan-prices), columnas has_web_custom/has_whatsapp"
  - phase: 01-cimientos-auditor-a
    provides: "shell CRM (layout guard, CrmSidebar, CrmTopbar), RiskBadge (calque cva), patrón RSC+client de auditoría, EmptyState, export CSV client-side"
provides:
  - "components/crm/status-badge.tsx (StatusBadge — calque del cva de RiskBadge, un solo rojo --crm-danger)"
  - "components/crm/kpi-card.tsx (KpiCard — valor display sin delta histórico fabricado, slot sparkline plano)"
  - "components/crm/alert-list.tsx (AlertList — filas clickeables a la ficha + empty state)"
  - "Dashboard /admin con 4 KPIs reales (computeKpis) + alertas (deriveAlerts)"
  - "Directorio /admin/negocios (tabla buscable/filtrable; suspendidos siempre visibles + marcados)"
  - "Sidebar Negocios → /admin/negocios y Planes y precios → /admin/planes cableados"
affects: ["02-04 ficha de negocio", "02-05 planes y precios", "server actions del CRM"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RSC del CRM con createAdminClient (service-role) server-only: SELECT explícito de columnas no sensibles, solo filas/valores cruzan al client (anti-pattern T-01-09/T-02-09)"
    - "Email del dueño resuelto vía admin.auth.admin.getUserById acotado (solo el string email, fallback a notification_email) — T-02-10"
    - "Filtrado del directorio delegado en filterBusinesses (lib pura), conteos por tab calculados sobre todas las filas"
    - "StatusBadge calca el cva LOCAL de RiskBadge sin tocar el badge compartido; el dot lleva el hue inline"

key-files:
  created:
    - components/crm/status-badge.tsx
    - components/crm/kpi-card.tsx
    - components/crm/alert-list.tsx
    - app/(crm)/admin/negocios/page.tsx
    - app/(crm)/admin/negocios/negocios-client.tsx
  modified:
    - app/(crm)/admin/page.tsx
    - components/crm/crm-sidebar.tsx

decisions:
  - "Sub-caption del directorio = 'Dueño(email) · slug': no existe columna city en businesses; se usa dato real (email del dueño + slug) en vez de fabricar 'Ciudad' (UI-SPEC dice 'Dueño · Ciudad' pero la verdad de datos no tiene ciudad)"
  - "AlertList recibe AlertItem (= Alert + diasRestantes?) sin cambiar el contrato de deriveAlerts: el RSC enriquece las alertas de trial con los días restantes derivados en vivo; pago_fallido no lleva días"
  - "MRR formateado con Intl.NumberFormat es-AR (currency ARS, sin decimales) → string limpio sin overlap $/ARS (D-03)"
  - "El link 'Planes y precios' → /admin/planes apunta a una página que aún no existe (plan 02-05); se cablea según el contrato del plan"

# Metrics
duration: ~9min
completed: 2026-06-18
status: complete
---

# Phase 2 Plan 03: Pantallas de lectura del Admin (Dashboard + Directorio) Summary

**Dashboard `/admin` con 4 KPI cards reales (computeKpis) + alertas clickeables (deriveAlerts), y directorio `/admin/negocios` buscable/filtrable que SIEMPRE muestra los suspendidos marcados — todo leído server-side con service-role sin que el cliente cruce, más los 3 componentes nuevos (StatusBadge/KpiCard/AlertList) y el sidebar cableado.**

## Performance
- **Duration:** ~9 min
- **Tasks:** 3 de 3 autónomas completas
- **Files created/modified:** 7

## Accomplishments
- **StatusBadge** (`components/crm/status-badge.tsx`): calca el cva LOCAL de RiskBadge (no edita el badge compartido). Variantes por `plan_status`: active→Activo (verde `--crm-success`), trial→Trial (azul `--crm-info`), suspended→Suspendido (rojo `--crm-danger`, distintivo), cancelled/expired→Churn (rojo `--crm-danger`, dot muted). Un solo rojo, nunca `--destructive`.
- **KpiCard** (`components/crm/kpi-card.tsx`): chrome de Card, valor display `text-4xl` 700, slot sparkline VACÍO/plano (sin tendencia fabricada, D-03), regla de acento superior en `--crm-danger` para tone danger. Opcional `href` para navegar.
- **AlertList** (`components/crm/alert-list.tsx`): filas clickeables → `/admin/negocios/{id}` (Link, ≥44px, hover `bg-secondary`, focus ring amarillo), dot rojo/amarillo por tipo, caption mono con días de trial, empty state "Todo en orden".
- **Dashboard `/admin`**: RSC que lee `businesses` (SELECT no sensible) con service-role tras el guard del layout; 4 KpiCard (MRR accent, activos info, trials info, pagos fallidos danger) + AlertList. Sin bloques pipeline/actividad del mock.
- **Directorio `/admin/negocios`**: RSC (SELECT no sensible + email del dueño acotado vía `getUserById` con fallback) + client que calca auditoria-client (tabs con conteo live, búsqueda, `filterBusinesses`, tabla NEGOCIO/PLAN/ESTADO/CONTACTO/ADD-ONS/MRR + chevron, filas clickeables y focusables, Exportar CSV). 'Todos' incluye suspendidos.
- **Sidebar**: items `Negocios` → `/admin/negocios` y `Planes y precios` → `/admin/planes` (quitado `soon:true`); el resto sigue "PRONTO".

## Task Commits
1. **Task 1: StatusBadge + KpiCard + AlertList** — `6c540de` (feat)
2. **Task 2: Dashboard /admin (KPIs + alertas)** — `9dcbabd` (feat)
3. **Task 3: Directorio /admin/negocios + sidebar** — `ce59fff` (feat)

## Files Created/Modified
- `components/crm/status-badge.tsx` — badge de estado del negocio (calque cva)
- `components/crm/kpi-card.tsx` — KPI card sin delta fabricado, regla de acento en danger
- `components/crm/alert-list.tsx` — lista de alertas clickeables + empty state
- `app/(crm)/admin/page.tsx` — Dashboard RSC (reemplaza el placeholder de Phase 1)
- `app/(crm)/admin/negocios/page.tsx` — Directorio RSC (lectura global service-role + email acotado)
- `app/(crm)/admin/negocios/negocios-client.tsx` — tabla + filtros + búsqueda + navegación a ficha + CSV
- `components/crm/crm-sidebar.tsx` — Negocios y Planes y precios cableados

## Decisions Made
- **Sub-caption 'Dueño · slug', no 'Dueño · Ciudad':** `businesses` no tiene columna `city`. En vez de fabricar una ciudad (prohibido por la regla "nunca un valor falso"), se muestra el email del dueño + el slug, que son datos reales. Si más adelante se agrega `city`, se actualiza el sub-caption.
- **AlertList enriquece sin romper el contrato puro:** `deriveAlerts` sigue devolviendo `Alert[]` (sin días); el RSC mapea las alertas de trial a `AlertItem` con `diasRestantes` derivado en vivo, así el caption muestra "vence en N días"/"vence hoy" sin que la lib tenga que conocer la fecha de cierre.
- **MRR con Intl.NumberFormat es-AR:** string limpio ARS sin decimales y sin el overlap `$3.24M`+`ARS` del prototipo.

## Deviations from Plan

### Auto-fixed / clarifications (Rule 2/3)

**1. [Rule 2 - faithful-data] Sub-caption del directorio sin ciudad inventada**
- **Found during:** Task 3
- **Issue:** El UI-SPEC pide sub-caption "Dueño · Ciudad" pero no existe columna `city` en `businesses`; renderizar una ciudad sería un dato fabricado (violación de "nunca un valor falso" del UI-SPEC).
- **Fix:** Sub-caption = `{ownerEmail ?? 'Sin dato'} · {slug}` (datos reales).
- **Files:** `app/(crm)/admin/negocios/negocios-client.tsx`
- **Commit:** `ce59fff`

Resto: plan ejecutado tal cual fue escrito.

## Threat Mitigations Aplicadas (del threat_model del plan)
- **T-02-09 (Info disclosure service-role/columnas):** ambos RSC leen con `createAdminClient` server-only, SELECT explícito de columnas no sensibles, y pasan al client solo filas/valores — el cliente nunca importa `createAdminClient`. ✔
- **T-02-10 (email del dueño vía admin API):** `getUserById` acotado, se extrae solo `user.email` (con fallback a `notification_email`); el objeto user completo no se propaga. ✔
- **T-02-11 (visibilidad de suspendidos):** tab 'Todos' default incluye suspendidos (`filterBusinesses`), tab `Suspendidos` extra, `StatusBadge` rojo distintivo. ✔

## Issues Encountered
None. Advertencias `LF will be replaced by CRLF` de git son cosméticas (Windows). El init del SDK resolvió por defecto al workstream `web-builder`; se trabajó con los paths explícitos del workstream `crm` del prompt.

## Known Stubs
- El link de sidebar `Planes y precios` → `/admin/planes` apunta a una página que aún NO existe (la entrega plan 02-05 de esta misma fase). Es intencional por contrato del plan; hasta que 02-05 cree la ruta, el link da 404. No bloquea el objetivo de este plan (Dashboard + Directorio).

## Next Phase Readiness
- Dashboard y Directorio listos. La fila del directorio ya navega a `/admin/negocios/{id}` (la ficha la entrega plan 02-04) y el sidebar enruta a `/admin/planes` (la entrega plan 02-05).

## Self-Check: PASSED
- 7 archivos creados/modificados verificados en disco (FOUND).
- 3 commits verificados en git (6c540de, 9dcbabd, ce59fff).
- `tsc --noEmit` sin errores; `eslint` de los 7 archivos sin warnings.

---
*Phase: 02-admin-de-plataforma · Plan 03*
*Completed: 2026-06-18*
