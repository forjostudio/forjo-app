# Phase 5: Reportes de Ventas - Context

**Gathered:** 2026-06-22
**Status:** Ready for planning

<domain>
## Phase Boundary

El operador ve la salud comercial del SaaS en una pantalla de reportes (`/admin/reportes`):
revenue/MRR mensual + MRR por plan, embudo de conversión por etapa del pipeline, y ranking
de cuentas por MRR — con gráficos interactivos (recharts). Reproduce el mock aprobado
`crm-design/06-reportes.png` (decisión LOCKED A12: el mock es el contrato de diseño).

Cubre RPT-01 (revenue por mes + MRR) y RPT-02 (conversión por etapa + ranking, gráficos).
Se apoya en los precios editables de Phase 2 (`plan_prices`, ARS) y las etapas del pipeline
de Phase 4 (`deals.stage`). Es una superficie admin-only (operador/dueño), cross-tenant por
diseño: NO se filtra por `business_id` — el aislamiento es el gate `is_admin` (como el resto del CRM).

**Datos mayormente de solo-lectura**, con UNA escritura nueva: un snapshot mensual de MRR
(para poder graficar la evolución histórica, que el estado actual no puede reconstruir).
</domain>

<decisions>
## Implementation Decisions

### Fuente de MRR / revenue histórico
- **D-01:** El chart "Evolución de MRR" (3/6/12 meses) se alimenta de una **tabla snapshot mensual nueva** (`mrr_snapshots`): una fila por (mes, plan) con `mrr` y `active_count`. Se escribe **1×/mes piggybackeando el cron diario existente** (`/api/cron/cancel-expired`) — Vercel Hobby permite 1 cron/día, NO agregar un cron nuevo. La escritura debe ser **idempotente / dedupe por mes** (upsert por (month, plan)) porque el cron corre todos los días. Migración nueva (036), admin-only por RLS (consistente con las tablas CRM de 034). **Sembrar el mes actual** al aplicar la migración para que el chart no arranque vacío.
- **D-02:** MRR = `Σ(price_ars del plan × negocios activos de ese plan)`. Reusa `plan_prices` (ARS, `price_ars` editable — Phase 2 / ADM-05) y `businesses.plan` + `businesses.plan_status='active'`. Los **add-ons NO entran en el MRR** (cobro manual, fuera del recurrente — decisión Phase 2).
- **D-03:** La tarjeta "Ingresos del mes" del mock = **proxy de facturación recurrente** (= MRR del mes), NO "cobrado real". **Relabelar** la tarjeta para no afirmar "cobrado" (no persistimos pagos MP). El cobrado real se difiere (ver Deferred).

### Embudo de conversión
- **D-04:** Cálculo = **snapshot por etapa alcanzada** en ventana de **90 días** (por `deals.created_at`), sobre la tabla `deals`. Un deal en etapa N cuenta en las etapas 1..N (etapa alcanzada, no solo la actual); los **ganados** (`status='won'`) cuentan hasta `pago`; los **perdidos** (`status='lost'`) cortan en su última etapa alcanzada. El % entre etapas = `count(etapa N) / count(etapa N-1)`. Orden de etapas = `STAGES` de `lib/crm-pipeline.ts` (fuente de verdad: lead → calificado → trial → propuesta → pago).

### KPIs del header (5 tarjetas del mock)
- **D-05:** Entran los **5 KPIs** del mock (fidelidad A12). Cálculos:
  - **MRR** — D-02 (con VAR vs snapshot mes previo).
  - **Ingresos del mes** — D-03 (proxy recurrente).
  - **ARPA** — `MRR / activos` (trivial).
  - **Conversión Lead→Activo** — `deals ganados/convertidos ÷ leads de la ventana` (de `deals`).
  - **Churn mensual** — tarjeta **presente** (no se difiere visualmente). La **cuenta de bajas** del mes sale de `audit_log` (`business.suspend` neto de `business.reactivate` — codes confirmados en `_actions.ts:88,115`), disponible desde el día 1. La **tasa %** usa como denominador el `active_count` del **mes anterior** de `mrr_snapshots`; **hasta que exista ≥1 snapshot previo**, la tarjeta muestra la cuenta de bajas y el % como "— / sin historia suficiente" (empty-state honesto, NO un % inventado). Decisión tomada vía `forjo-advisor` (scope técnico).

### MRR por plan, ranking, rango temporal, export
- **D-06:** "MRR por plan" (donut) = Σ del MRR del mes actual desglosado por plan (Básico/Pro/Equipo) con monto, % y conteo de negocios.
- **D-07:** "Ranking" = top cuentas por MRR (negocio, plan, MRR, VAR). MRR por negocio = `price_ars` de su plan (si activo). VAR vs snapshot del mes previo ("—" hasta haber historia).
- **D-08:** El toggle **3/6/12 meses es funcional** (re-consulta `mrr_snapshots`; muestra solo los meses disponibles, sin inventar datos faltantes). El botón **"Exportar" se DIFIERE a v2** (ver Deferred — evitar duplicar el export/import de otro milestone).

### Stack / acceso a datos
- **D-09:** Gráficos = **recharts** (ya bundleado, `^3.8.1`). **Cero dependencias nuevas.**
- **D-10:** Lectura de tablas admin-only (`mrr_snapshots`, `deals`, `audit_log`, `plan_prices`, `businesses`) sigue el patrón de Phase 4: **session client RLS-gated** para lo que tiene policy admin-read (espejar `auditoria/page.tsx` para `audit_log`), o service-role tras el layout guard `app/(crm)/layout.tsx` para lecturas agregadas — NUNCA exponer al cliente más que lo agregado/no sensible. **NO filtrar por `business_id`** (son datos del operador, cross-tenant; el gate es `is_admin`). La escritura del snapshot en el cron usa service-role (no hay sesión admin en el cron).
- **D-11:** Lógica de cálculo en una **lib pura** testeable (`lib/crm-reports.ts`: MRR, ARPA, churn, embudo, ranking) — espejo de `lib/crm-pipeline.ts` — con tests vitest (el proyecto está en 178 tests; sumar cobertura de los cálculos puros).

### Claude's Discretion
- Forma exacta del schema de `mrr_snapshots` (columnas, índices, unique por (month, plan)).
- Estructura de los componentes client de charts (un wrapper por widget vs uno grande).
- Nombres internos de funciones/archivos dentro de las convenciones del repo.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño (contrato LOCKED A12)
- `c:/Users/franc/Desktop/Forjo Studio/crm-design/06-reportes.png` — mock aprobado de la pantalla de reportes (layout exacto: 5 KPIs + Evolución MRR + MRR por plan arriba; Embudo + Ranking abajo; dark CRM, acento amarillo). Reproducir con fidelidad; reusar el patrón `--skip-ui` de Phase 4 (mock = contrato, no UI-SPEC).
- `c:/Users/franc/Desktop/Forjo Studio/crm-design/01-dashboard.png` — referencia secundaria de estilo del shell.

### Roadmap / requirements
- `.planning/workstreams/crm/ROADMAP.md` §"Phase 5: Reportes de Ventas" — goal + success criteria.
- `.planning/workstreams/crm/REQUIREMENTS.md` — RPT-01, RPT-02.
- `c:/Users/franc/Desktop/Forjo Studio/forjo-crm-admin-brief.md` §9.3 — unknown de "datos para MRR / pagos fallidos": resuelto en este CONTEXT como proxy recurrente (D-03) + snapshot mensual (D-01).

### Código fuente a respetar
- `lib/crm-pipeline.ts` — `STAGES` (fuente de verdad de las etapas del embudo, D-04).
- `app/(crm)/admin/_actions.ts` — codes de auditoría `business.suspend` / `business.reactivate` (base del churn, D-05) y el contrato de 6 pasos de server actions.
- `lib/audit.ts` — `logAudit` / esquema de `audit_log`.
- `lib/subscription-plans.ts` — `price_ars` por plan.
- `app/(crm)/admin/auditoria/page.tsx` + `auditoria-client.tsx` — patrón de lectura de `audit_log` con session client RLS-gated (espejar, D-10).
- `app/(crm)/admin/negocios/page.tsx` — patrón de lectura service-role tras el layout guard.
- `supabase/migrations/032_crm_admin.sql` (plan_prices), `034_crm_pipeline_tags_timeline.sql` (deals, RLS admin-only + el patrón de policy a copiar para `mrr_snapshots`).
- `vercel.json` + `app/api/cron/cancel-expired/route.ts` — el cron diario donde piggybackear el snapshot (D-01).

### Skills del proyecto
- `.claude/skills/supabase-multitenant-rls/SKILL.md` — para la migración 036 (`mrr_snapshots` admin-only, patrón de policy `is_admin`).
- `.claude/skills/convenciones-forjo/SKILL.md` — naming/estructura/stack.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **recharts** (`^3.8.1`) — bar chart (Evolución MRR), donut (MRR por plan), barras de embudo. Ya en el stack; sin install.
- **`plan_prices` + getPlanPrices** (Phase 2) — precios ARS editables, input del MRR.
- **`STAGES`** (`lib/crm-pipeline.ts`) — orden de etapas para el embudo.
- **`audit_log` + `logAudit`** — base del churn (eventos `business.suspend`/`business.reactivate`) y de cualquier escritura auditada.
- **CRM shell / layout guard** (`app/(crm)/layout.tsx`) — el item "Reportes" ya existe en el sidebar (visible en el mock); la página cuelga del shell dark existente.
- **`auditoria-client.tsx`** — patrón de lectura admin-only vía session client (mismo que necesita Reportes).

### Established Patterns
- **RLS admin-only por `is_admin` JWT** (migr. 034) — copiar el patrón de policy para `mrr_snapshots`. Sin policy de insert/update/delete (escribe solo service-role desde el cron).
- **Session client para lecturas admin-only** (lección T-04-10): no usar service-role donde una policy RLS ya gatea; service-role solo para la escritura del cron y lecturas agregadas tras el layout guard.
- **Cron piggyback** (Vercel Hobby, 1 cron/día) — agregar el snapshot mensual idempotente al handler diario existente, no crear un cron nuevo (rompería el deploy).
- **Lib pura + vitest** (espejo de `lib/crm-pipeline.ts` / `lib/crm-tags.ts`) para los cálculos.

### Integration Points
- Nueva migración `036_mrr_snapshots.sql` (tabla + RLS admin-only + seed del mes actual).
- Nuevo bloque en `app/api/cron/cancel-expired/route.ts` (upsert del snapshot del mes, dedupe).
- Nueva ruta `app/(crm)/admin/reportes/` (`page.tsx` server + `reportes-client.tsx` con los charts recharts).
- Nueva `lib/crm-reports.ts` (cálculos puros) + `lib/crm-reports.test.ts`.
</code_context>

<specifics>
## Specific Ideas

- El mock `06-reportes.png` es la referencia visual exacta: header con 5 KPIs (cada uno con valor + delta de color), fila de 2 (Evolución MRR barras / MRR por plan donut), fila de 2 (Embudo de conversión / Ranking tabla), toggle 3/6/12m + Export arriba a la derecha.
- Acento amarillo `#f4c543` para series principales, azul `#2a5fa5` para info, rojo solo para churn/peligro (paleta CRM LOCKED §12).
- Reusar el patrón de Phase 4 al planear: `/gsd:plan-phase 5 --skip-ui --ws crm` (mock = contrato, sin UI-SPEC).
</specifics>

<deferred>
## Deferred Ideas

- **"Ingresos del mes" cobrado real** (persistir monto/fecha/estado de cada pago desde el webhook de MercadoPago) → v2. Depende de research de qué expone MP y de un cambio de webhook + migración. En Phase 5 va el proxy recurrente (D-03).
- **Exportar (CSV/PDF)** del dashboard → v2. Hay un feature de export/import en el milestone `gestion-rebrand` — coordinar para no duplicar. El botón puede quedar visible deshabilitado o salir del scope (decisión del planner; preferible no mostrar acción muerta).
- **Churn % preciso desde el primer día** — NO es un feature diferido sino una degradación honesta: el % se vuelve real cuando `mrr_snapshots` acumule ≥1 mes previo (D-05).
- **Backfill histórico de MRR desde audit_log** — descartado (aproximado y complejo); la historia arranca limpia desde el deploy del snapshot.

### Reviewed Todos (not folded)
None — discussion stayed within phase scope.
</deferred>

---

*Phase: 05-reportes-de-ventas*
*Context gathered: 2026-06-22*
