# Phase 5: Reportes de Ventas - Research

**Researched:** 2026-06-23
**Domain:** Admin BI dashboard — recharts v3 charting + Postgres aggregation + cron piggyback (idempotent monthly snapshot)
**Confidence:** HIGH

## Summary

Phase 5 es una pantalla read-only de inteligencia comercial (`/admin/reportes`) con UNA escritura: un snapshot mensual de MRR. Todas las decisiones de arquitectura están LOCKED (D-01..D-11); esta investigación documenta el **cómo**, no el qué. Tres frentes técnicos: (1) **recharts v3** — primer uso de charts en la app, `^3.8.1` ya instalado (verificado 3.8.1 en `node_modules`), peer React 19 OK, cero dependencias nuevas; (2) **cron piggyback idempotente** dentro de `/api/cron/cancel-expired` con upsert dedupe por `(month, plan)`; (3) **queries agregadas** reusando patrones ya probados en `crm-metrics.ts`, `auditoria/page.tsx` y `negocios/page.tsx`.

El proyecto ya tiene toda la infra de soporte: lib pura + vitest (espejo de `crm-pipeline.ts`/`crm-metrics.ts` — verificado, 5 test files en `lib/`), formato ARS `Intl.NumberFormat('es-AR', { style:'currency', currency:'ARS', maximumFractionDigits:0 })` (pipeline-client.tsx:50), el patrón session-client-RLS-gated para `audit_log`/`deals` y service-role-tras-layout-guard para agregados. La migración nueva es **036** (última aplicada: 035).

**Primary recommendation:** Crear `lib/crm-reports.ts` (cálculos puros: MRR, ARPA, churn, embudo, ranking, MRR-por-plan) + `lib/crm-reports.test.ts`; migración `036_mrr_snapshots.sql` (tabla + RLS admin-read espejo de 034 + seed del mes actual); bloque idempotente en el cron diario; `app/(crm)/admin/reportes/page.tsx` (server, lee datos) + `reportes-client.tsx` (`'use client'`, charts recharts v3). Charts SIEMPRE en componente `'use client'` con `ResponsiveContainer` envuelto en un contenedor con altura fija.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cálculo MRR/ARPA/churn/embudo/ranking | lib pura (`lib/crm-reports.ts`) | — | Testeable sin DB/React; espejo de `crm-metrics.ts`/`crm-pipeline.ts` (D-11) |
| Lectura de `audit_log` (churn) | Frontend Server (RSC, session client) | Database (RLS admin-read) | El gate real es la policy RLS admin-read (T-01-09); espejar `auditoria/page.tsx` (D-10) |
| Lectura de `deals` (embudo) | Frontend Server (RSC, session client) | Database (RLS admin-read 034) | `deals` tiene policy admin-read; session client la hereda (T-04-10) |
| Lectura agregada `businesses`×`plan_prices` (MRR/ranking) | Frontend Server (RSC, service-role tras guard) | Database | `businesses` NO tiene policy "is_admin lee todo" → service-role tras layout guard (`negocios/page.tsx`) |
| Lectura `mrr_snapshots` (evolución, churn denom) | Frontend Server (RSC, session client) | Database (RLS admin-read 036) | Nueva tabla con policy admin-read → session client la gatea |
| Escritura snapshot mensual | Backend (cron, service-role) | Database (sin policy de write) | No hay sesión admin en el cron; solo service-role escribe (D-01/D-10) |
| Render de charts | Browser / Client (`reportes-client.tsx`) | — | recharts depende de DOM/SVG → `'use client'`, nunca RSC |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| recharts | `^3.8.1` (instalado 3.8.1) | Bar chart (Evolución MRR), donut (MRR por plan), barras horizontales (Embudo) | Ya bundleado, peer React 19 OK. D-09: cero deps nuevas `[VERIFIED: node_modules/recharts/package.json]` |
| vitest | `^4.1.9` | Tests de la lib pura de cálculos | Runner ya configurado (`vitest.config.mts`, `npm test` = `vitest run`) `[VERIFIED: package.json]` |
| Intl.NumberFormat | nativo | Formato ARS y % | Ya usado en `pipeline-client.tsx:50`; cero deps `[VERIFIED: codebase]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns | `^4.4.0` | Manejo de meses/ventana 90d en la lib pura | Ya en stack (usado en `crm-metrics.ts:1`); zona AR vía offset literal `-03:00` (no date-fns-tz) `[VERIFIED: codebase]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| recharts | nivo / visx / chart.js | LOCKED D-09 — recharts ya bundleado; cualquier alternativa = dep nueva, prohibido |
| Tabla snapshot | backfill desde audit_log | LOCKED — descartado (aproximado y complejo, ver Deferred CONTEXT) |

**Installation:** Ninguna. recharts `^3.8.1` ya está en `dependencies` e instalado (3.8.1). Cero `npm install`.

**Version verification:** `recharts: ^3.8.1` en package.json; `node_modules/recharts/package.json` reporta `3.8.1` con peer `react: ^19`. `[VERIFIED: npm/local]`

## Package Legitimacy Audit

> No se instalan paquetes nuevos en esta fase (D-09). Todos los paquetes usados ya están en el repo y verificados en milestones previos.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| recharts | npm | ~9 yrs | ~10M/wk | github.com/recharts/recharts | OK | Ya instalado, sin cambios |
| vitest | npm | establecido | millones/wk | github.com/vitest-dev/vitest | OK | Ya instalado |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                          ┌─────────────────────────────────────────────┐
   Cron diario (Vercel)   │  /api/cron/cancel-expired (GET, Bearer)      │
   "0 3 * * *"  ─────────▶│  1. cancela holds vencidos (existente)       │
                          │  2. [NUEVO] snapshot mensual idempotente:    │
                          │     ¿ya existe fila de este mes? → skip       │
                          │     si no → computeSnapshotRows() + upsert    │
                          │        (service-role, onConflict month,plan)  │
                          └───────────────┬─────────────────────────────┘
                                          │ escribe
                                          ▼
   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
   │ plan_prices  │   │  businesses  │   │   mrr_snap-  │   │   deals      │
   │ (ARS edit.)  │   │ (plan,status)│   │   shots (036)│   │ (stage,status)│
   └──────┬───────┘   └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
          │ service-role     │ service-role     │ session(RLS)     │ session(RLS)
          ▼                  ▼                  ▼                  ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │  app/(crm)/admin/reportes/page.tsx  (RSC, tras layout guard is_admin) │
   │  · lee fuentes  · llama lib/crm-reports.ts (cálculos PUROS)           │
   │  · audit_log → churn count  · mrr_snapshots → serie + denom churn     │
   └───────────────────────────────┬─────────────────────────────────────┘
                                    │ props (sólo agregados, NO sensibles)
                                    ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │  reportes-client.tsx  ('use client')                                 │
   │  5 KPIs · BarChart(MRR) · PieChart donut(MRR×plan) · barras(embudo)  │
   │  · tabla ranking · toggle 3/6/12m (re-filtra serie en memoria)        │
   └─────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure
```
app/(crm)/admin/reportes/
├── page.tsx              # RSC: lee fuentes (mix session/service-role), llama lib pura, pasa props
└── reportes-client.tsx   # 'use client': KPIs + charts recharts + toggle 3/6/12m
lib/
├── crm-reports.ts        # PURO: computeMrr, arpa, churn, funnel, ranking, mrrByPlan, snapshotRows
└── crm-reports.test.ts   # vitest, espejo de crm-metrics.test.ts
supabase/migrations/
└── 036_mrr_snapshots.sql # tabla + RLS admin-read (espejo 034) + seed mes actual
app/api/cron/cancel-expired/route.ts  # + bloque snapshot idempotente
```

### Pattern 1: recharts v3 en componente `'use client'` (Next 16 RSC)
**What:** Los charts recharts manipulan DOM/SVG → deben vivir en un Client Component. El RSC `page.tsx` calcula los datos y los pasa como props serializables; `reportes-client.tsx` con `'use client'` renderiza los charts.
**When to use:** Todo chart. Nunca importar recharts en un archivo sin `'use client'`.
**Example:**
```tsx
// reportes-client.tsx  — Source: recharts v3 + Next 16 RSC (in-repo client pattern, auditoria-client.tsx)
'use client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

// ResponsiveContainer necesita un padre con ALTURA EXPLÍCITA (Pitfall 1). width=100% OK.
<div className="h-72 w-full">
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={serie} accessibilityLayer>
      <XAxis dataKey="mes" tickLine={false} axisLine={false} />
      <YAxis tickFormatter={(v) => fmtCompactArs(v)} tickLine={false} axisLine={false} width={56} />
      <Tooltip content={<MrrTooltip />} cursor={{ fill: 'var(--secondary)' }} />
      <Bar dataKey="mrr" radius={[4,4,0,0]} fill="var(--primary)" />
    </BarChart>
  </ResponsiveContainer>
</div>
```

### Pattern 2: Donut con label central (MRR por plan, v3)
**What:** Pie con `innerRadius` > 0 = donut. El total al centro va con `<Label>` posicionado, o un `<text>`/div absoluto sobre el contenedor.
**When to use:** Widget "MRR por plan".
**Example:**
```tsx
// Source: recharts v3 API (Pie + Cell + Label). Colores = tokens CSS (NO hex hardcodeado).
<PieChart>
  <Pie data={porPlan} dataKey="mrr" nameKey="plan" innerRadius={70} outerRadius={100} strokeWidth={0}>
    {porPlan.map((p) => <Cell key={p.plan} fill={PLAN_COLOR[p.plan]} />)}
    {/* Label central: total MRR del mes */}
    <Label value={fmtArs(totalMrr)} position="center" className="fill-foreground" />
  </Pie>
  <Tooltip content={<PlanTooltip />} />
</PieChart>
```
Nota v3: `activeShape`/`inactiveShape`/`activeIndex` deprecados — usar `isActive` del callback de shape si se necesita hover-shape. Para este mock no hace falta.

### Pattern 3: Embudo como barras horizontales
**What:** El embudo del mock = barras horizontales por etapa (lead→pago). En recharts = `BarChart layout="vertical"` con `XAxis type="number"` y `YAxis type="category" dataKey="etapa"`.
**When to use:** Widget "Embudo de conversión".
**Example:**
```tsx
<BarChart layout="vertical" data={funnel}>
  <XAxis type="number" hide />
  <YAxis type="category" dataKey="label" width={90} tickLine={false} axisLine={false} />
  <Tooltip content={<FunnelTooltip />} />
  <Bar dataKey="count" radius={[0,4,4,0]} fill="var(--primary)">
    <LabelList dataKey="pct" position="right" />
  </Bar>
</BarChart>
```

### Pattern 4: Cron piggyback idempotente (snapshot mensual)
**What:** Dentro del handler diario existente, tras la lógica de cancel-expired, escribir el snapshot del mes solo si todavía no existe (dedupe). El cron corre TODOS los días pero el snapshot se escribe 1×/mes.
**When to use:** D-01.
**Example:**
```ts
// app/api/cron/cancel-expired/route.ts — DESPUÉS del bloque existente, antes del return.
// Guard "¿es un mes nuevo?": calcular la key de mes AR y upsert con onConflict dedupe.
// El upsert es la garantía de idempotencia: aunque corra 30 veces en el mes, escribe la misma fila.
const monthKey = arMonthKey(new Date())   // 'YYYY-MM-01' en zona AR
try {
  const rows = await computeSnapshotRows(supabase, monthKey)  // service-role; lee businesses×plan_prices
  // onConflict (month, plan) + ignoreDuplicates:false → re-escribe el mes en curso con datos frescos.
  const { error: snapErr } = await supabase
    .from('mrr_snapshots')
    .upsert(rows, { onConflict: 'month,plan' })
  if (snapErr) console.error('[cron/mrr-snapshot] upsert error:', snapErr.message)
} catch (e) {
  console.error('[cron/mrr-snapshot] FALLÓ:', e instanceof Error ? e.message : e)
}
// IMPORTANTE: envuelto en try/catch propio — un fallo del snapshot NO debe romper cancel-expired
// (mismo criterio best-effort que los emails del cron).
```
Decisión de diseño (Claude's Discretion): re-escribir el mes en curso cada día (upsert real, no skip) mantiene el snapshot del mes actual fresco a medida que cambian activos/precios; los meses pasados quedan congelados porque su `monthKey` ya no se vuelve a calcular. Alternativa: `ignoreDuplicates:true` para escribir-una-vez-y-congelar — pero entonces el mes en curso quedaría fijado al día 1. **Recomendado: upsert que re-escribe el mes actual** (refleja el estado vivo del mes hasta que cierra).

### Anti-Patterns to Avoid
- **Importar recharts en un RSC:** rompe el build/hydration (recharts necesita DOM). Siempre `'use client'`.
- **ResponsiveContainer sin altura en el padre:** colapsa a 0px → chart invisible (Pitfall 1).
- **Leer `audit_log`/`deals`/`mrr_snapshots` con service-role:** bypassa la RLS admin-read y rompe la lección T-04-10/T-01-09. Usar session client para lo que tiene policy admin-read.
- **Crear un cron nuevo:** Vercel Hobby = 1 cron/día; un segundo cron rompe el deploy (`vercel.json`). Piggyback, no nuevo cron.
- **Hex hardcodeado en charts:** usar tokens CSS (`var(--primary)`, `var(--crm-info)`, `var(--crm-success)`, `var(--crm-danger)`) — paleta LOCKED §12. Espejar `STAGES` de `crm-pipeline.ts` que ya mapea etapas→tokens.
- **% de churn inventado sin historia:** D-05 — hasta tener ≥1 snapshot previo, mostrar "— / sin historia suficiente", nunca un % falso.
- **Persistir estado optimista de pagos:** "Ingresos del mes" es proxy recurrente (= MRR), NO cobrado real (D-03). Relabelar la tarjeta.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Formato moneda ARS | string concat con `$` | `Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0})` | Ya en `pipeline-client.tsx:50`; maneja separadores de miles AR |
| Charts SVG | dibujar barras/donut a mano | recharts v3 (ya bundleado) | D-09; recharts maneja ejes, tooltips, responsive, a11y |
| Orden de etapas del embudo | array local nuevo | `STAGES` de `lib/crm-pipeline.ts` | Fuente de verdad única (D-04); ya mapea label+color por etapa |
| Precios de plan | leer subscription-plans.ts directo | `getPlanPrices()` de `lib/plan-prices.ts` | Lee `plan_prices` editable con fallback; D-02 |
| Cálculo MRR/activos | recalcular en el RSC | reusar la fórmula de `computeKpis` (`crm-metrics.ts:53`) en la lib pura | MRR = Σ(precio × activos por plan) ya resuelto y testeado |
| Insert auditado | insert directo | `logAudit()` de `lib/audit.ts` | (No aplica a Phase 5 salvo que se audite algo; el snapshot del cron NO se audita) |

**Key insight:** Casi todos los cálculos ya existen en forma parcial (`computeKpis` hace MRR + activos). La lib `crm-reports.ts` debe **reusar/extender** esas fórmulas, no reimplementarlas — el churn y el embudo son lo genuinamente nuevo.

## Common Pitfalls

### Pitfall 1: ResponsiveContainer colapsa a 0px
**What goes wrong:** El chart no se ve; el SVG tiene height 0.
**Why it happens:** `ResponsiveContainer width="100%" height="100%"` mide al padre; si el padre no tiene altura explícita, mide 0.
**How to avoid:** Envolver en `<div className="h-72 w-full">` (o altura fija en px). NUNCA height en % sin padre dimensionado.
**Warning signs:** Chart vacío en dev pero datos presentes en props.

### Pitfall 2: recharts v3 breaking vs v2 (training data desactualizada)
**What goes wrong:** Código copiado de tutoriales v2 falla o se comporta distinto.
**Why it happens:** v3 reescribió el state interno. Cambios concretos `[CITED: github.com/recharts/recharts/wiki/3.0-migration-guide]`:
- `accessibilityLayer` ahora es **true por default** (era false en v2) — bien, pero los eventos de teclado ya no pasan por `onMouseMove`.
- `Tooltip` con `content` custom: el tipo pasó de `TooltipProps` a `TooltipContentProps`; `label` puede ser `undefined | string | number`.
- `XAxis/YAxis` muestran la línea de eje aunque no haya ticks; múltiples Y axes ordenan alfabéticamente por `yAxisId`.
- `Pie`: `activeShape`/`inactiveShape`/`activeIndex`, `blendStroke` removidos/deprecados — usar `stroke="none"` y el `isActive` del shape callback.
- `CartesianGrid` requiere `x/yAxisId` que matcheen.
**How to avoid:** Usar los snippets de este RESEARCH (escritos para v3). Tipar tooltips custom con `TooltipContentProps`. No copiar de StackOverflow v2.
**Warning signs:** Errores de tipo en el `content` del Tooltip; ejes que aparecen donde no se esperaban.

### Pitfall 3: Cron NO idempotente → snapshots duplicados
**What goes wrong:** El cron corre 30 veces/mes; sin dedupe escribiría 30 filas por mes/plan, inflando la serie.
**Why it happens:** Olvidar el `onConflict` o el unique index `(month, plan)`.
**How to avoid:** Unique index `(month, plan)` en la migración + `.upsert(rows, { onConflict: 'month,plan' })`. La idempotencia es por la DB, no por un guard frágil de fecha.
**Warning signs:** Más de 3 filas por mes (basic/studio/pro) en `mrr_snapshots`.

### Pitfall 4: Leer metadata JSON de audit_log
**What goes wrong:** `metadata` es `jsonb`; tratarlo como string o asumir shape rompe.
**Why it happens:** Para el churn NO se necesita metadata — basta contar `action='business.suspend'` neto de `'business.reactivate'` en el mes. `metadata` viene como `Record<string, unknown> | null` (auditoria-client.tsx:29).
**How to avoid:** Para churn, filtrar por `action` + `created_at` dentro del mes; NO leer metadata. Si en el futuro se necesita un campo de metadata, narrowing defensivo (`typeof x === ...`).
**Warning signs:** Acceso a `metadata.algo` sin guard.

### Pitfall 5: Zona AR en el límite de mes
**What goes wrong:** Un evento del 30/06 23:30 AR (= 01/07 02:30 UTC) cae en el mes equivocado si se usa UTC.
**Why it happens:** `new Date().toISOString()` es UTC; AR es UTC-3.
**How to avoid:** Calcular la month-key y los rangos de mes/ventana en zona AR usando el offset literal `-03:00` (patrón `crm-metrics.ts:33` `AR_OFFSET`). `now` inyectable en la lib pura para tests deterministas (espejo `crm-metrics.test.ts:7`).
**Warning signs:** Conteos de churn/MRR que "saltan" un día alrededor de medianoche.

### Pitfall 6: Churn % sin denominador
**What goes wrong:** Dividir por 0 (sin snapshot previo) → NaN/Infinity en la tarjeta.
**Why it happens:** El denominador es `active_count` del mes anterior de `mrr_snapshots`; el primer mes no existe.
**How to avoid:** D-05 — si no hay snapshot del mes previo, la tarjeta muestra la cuenta de bajas y el % como "— / sin historia suficiente". La lib pura debe devolver `pct: null` y el cliente renderiza el empty-state honesto.
**Warning signs:** "NaN%" o "Infinity%" en la tarjeta de churn.

## Code Examples

### Lib pura: shape de cálculos (espejo de crm-metrics.ts / crm-pipeline.ts)
```ts
// lib/crm-reports.ts — Source: in-repo (crm-metrics.ts:53 computeKpis, crm-pipeline.ts STAGES)
import { STAGES, type StageKey, type DealStatus } from '@/lib/crm-pipeline'

export type SnapshotRow = { month: string; plan: string; mrr: number; active_count: number }
export type FunnelStep = { key: StageKey; label: string; count: number; pct: number | null }
export type ChurnResult = { bajas: number; pct: number | null }  // pct null = sin historia (D-05)

// MRR del mes = Σ(precio del plan × activos de ese plan). Reusa la fórmula de computeKpis.
export function mrrByPlan(rows: { plan: string; plan_status: string }[], prices: Record<string, number>) {
  const out: Record<string, { mrr: number; count: number }> = {}
  for (const r of rows) {
    if (r.plan_status !== 'active') continue
    const e = (out[r.plan] ??= { mrr: 0, count: 0 })
    e.mrr += prices[r.plan] ?? 0
    e.count += 1
  }
  return out
}

// Embudo: deal en etapa N cuenta en 1..N (etapa alcanzada). won→hasta 'pago'; lost→corta en su etapa.
// pct[N] = count[N] / count[N-1]; la primera etapa pct=null. (D-04)
export function funnel(deals: { stage: StageKey; status: DealStatus }[]): FunnelStep[] { /* ... */ }

// Churn: count(business.suspend) - count(business.reactivate) en el mes; denom = active_count mes previo.
export function churn(events: { action: string }[], prevActiveCount: number | null): ChurnResult { /* ... */ }
```

### Migración 036 (espejo verbatim de la policy de 034)
```sql
-- supabase/migrations/036_mrr_snapshots.sql
-- Tabla snapshot mensual de MRR (D-01). Admin-only por RLS (espejo de 034). Se aplica A MANO, en
-- orden (última aplicada: 035). Tras aplicar, regenerar supabase/schema.sql con supabase db dump.
create table if not exists public.mrr_snapshots (
  month         date not null,                 -- primer día del mes (YYYY-MM-01) en zona AR
  plan          text not null check (plan in ('basic','studio','pro')),
  mrr           integer not null default 0,    -- ARS, entero
  active_count  integer not null default 0,
  created_at    timestamptz not null default now(),
  primary key (month, plan)                    -- unique (month,plan) = idempotencia del upsert del cron
);

alter table public.mrr_snapshots enable row level security;
drop policy if exists "admin read mrr_snapshots" on public.mrr_snapshots;
create policy "admin read mrr_snapshots" on public.mrr_snapshots
  for select
  using ((select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true');
-- Sin policy de insert/update/delete: solo el service-role (cron) escribe (NUNCA using(true), lección 029).

-- Seed del mes actual para que el chart no arranque vacío (D-01). Calcula MRR×plan desde el estado vivo.
-- date_trunc('month', now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = primer día del mes AR.
insert into public.mrr_snapshots (month, plan, mrr, active_count)
select
  date_trunc('month', (now() at time zone 'America/Argentina/Buenos_Aires'))::date as month,
  b.plan,
  coalesce(pp.price_ars, 0) * count(*)                                              as mrr,
  count(*)                                                                          as active_count
from public.businesses b
left join public.plan_prices pp on pp.plan_key = b.plan
where b.plan_status = 'active' and b.plan in ('basic','studio','pro')
group by b.plan, pp.price_ars
on conflict (month, plan) do nothing;
```

### Lectura mixta en el RSC (session client + service-role)
```tsx
// app/(crm)/admin/reportes/page.tsx — Source: in-repo (auditoria/page.tsx + negocios/page.tsx)
import { createClient } from '@/lib/supabase/server'        // session, RLS-gated
import { createAdminClient } from '@/lib/supabase/admin'    // service-role tras layout guard
import { getPlanPrices } from '@/lib/plan-prices'

export default async function ReportesPage() {
  const supabase = await createClient()         // para deals, audit_log, mrr_snapshots (RLS admin-read)
  const admin = createAdminClient()             // para businesses (sin policy is_admin-lee-todo)

  const [{ data: deals }, { data: auditRows }, { data: snapshots }, { data: bizRows }, prices] =
    await Promise.all([
      supabase.from('deals').select('stage, status, created_at').gte('created_at', windowStart90d),
      supabase.from('audit_log').select('action, created_at')
        .in('action', ['business.suspend','business.reactivate']).gte('created_at', monthStart),
      supabase.from('mrr_snapshots').select('month, plan, mrr, active_count').order('month'),
      admin.from('businesses').select('id, name, plan, plan_status'),
      getPlanPrices(),
    ])
  // ... llamar lib/crm-reports.ts con estos datos, pasar SOLO agregados a reportes-client.
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| recharts v2 API (`activeIndex`, `TooltipProps`, accessibilityLayer=false) | recharts v3 (`isActive` shape callback, `TooltipContentProps`, accessibilityLayer=true) | v3.0.0 (2025) | Snippets v2 de training data pueden fallar — usar los de este RESEARCH `[CITED: 3.0-migration-guide]` |
| `recharts-scale` dep separada | `getNiceTickValues` exportado del paquete principal | v3.0.0 | No afecta esta fase (no se usa scale custom) |

**Deprecated/outdated:**
- `Pie activeShape`/`inactiveShape`/`activeIndex`: deprecados en v3 — no usar para el donut (no se necesita).
- `Bar/Pie activeIndex`: removido en v3.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | El widget "Embudo" del mock son barras horizontales (no un funnel-shape) | Pattern 3 | Bajo — si el mock muestra forma de embudo trapezoidal, recharts tiene `<Funnel>`/`<FunnelChart>`; verificar contra `06-reportes.png` al planear. Ambos son recharts (cero deps). |
| A2 | Re-escribir el mes en curso cada día (vs congelar al día 1) | Pattern 4 | Bajo — es Claude's Discretion (D-01 solo exige idempotencia/dedupe). El planner puede elegir `ignoreDuplicates:true` si se prefiere congelar. |
| A3 | El label central del donut se hace con `<Label position="center">` | Pattern 2 | Bajo — alternativa robusta: div absoluto centrado sobre el contenedor del chart. |
| A4 | El churn solo necesita `action` + `created_at` (no metadata) de audit_log | Pitfall 4 | Bajo — confirmado por la semántica de D-05 (count neto suspend/reactivate). |

## Open Questions (RESOLVED)

1. **Forma exacta del embudo en el mock** — RESOLVED en el plan: 05-02/T2 incluye `crm-design/06-reportes.png` en `<read_first>` (canonical ref) y el ejecutor elige `BarChart layout="vertical"` o `<FunnelChart>` de recharts (ambos cero deps) al leer el PNG. Riesgo bajo, resuelto en ejecución.
   - What we know: D-04 define el cálculo (etapa alcanzada, 90d). El mock define la forma visual.
   - Recommendation: barras horizontales (`BarChart layout="vertical"`) salvo que el PNG muestre trapecio.

2. **Tooltip styling con el shell dark del CRM** — RESOLVED en el plan: 05-02/T2 implementa tooltips custom tipados `TooltipContentProps` con tokens CSS dark.
   - What we know: El CRM corre en `.dark .crm-shell` (layout.tsx:47); recharts Tooltip default es claro.
   - Recommendation: Tooltip custom (`content`) con `var(--card)`/`var(--border)`/`var(--foreground)` — patrón estándar v3.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| recharts | Charts | ✓ | 3.8.1 | — (LOCKED, no alternativa) |
| vitest | Tests lib pura | ✓ | 4.1.9 | — |
| Supabase (Postgres) | mrr_snapshots, queries | ✓ | remoto | — |
| Vercel cron | snapshot mensual | ✓ | Hobby (1/día) | — (piggyback obligatorio) |

**Missing dependencies with no fallback:** ninguna.
**Missing dependencies with fallback:** ninguna.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest `^4.1.9` |
| Config file | `vitest.config.mts` (environment node, tsconfigPaths + react plugins) |
| Quick run command | `npx vitest run lib/crm-reports.test.ts` |
| Full suite command | `npm test` (`vitest run`) — actualmente 178 tests verdes |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RPT-01 | MRR = Σ(precio×activos), ARPA, serie por mes, MRR×plan | unit | `npx vitest run lib/crm-reports.test.ts` | ❌ Wave 0 |
| RPT-01 | Snapshot rows idempotentes (1 fila por mes/plan) | unit | `npx vitest run lib/crm-reports.test.ts` | ❌ Wave 0 |
| RPT-02 | Embudo: etapa alcanzada 1..N, won→pago, lost corta; pct entre etapas | unit | `npx vitest run lib/crm-reports.test.ts` | ❌ Wave 0 |
| RPT-02 | Churn: count neto suspend/reactivate; pct null sin historia | unit | `npx vitest run lib/crm-reports.test.ts` | ❌ Wave 0 |
| RPT-02 | Ranking top cuentas por MRR (VAR "—" sin snapshot previo) | unit | `npx vitest run lib/crm-reports.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run lib/crm-reports.test.ts`
- **Per wave merge:** `npm test` (suite completa)
- **Phase gate:** suite verde + `npx tsc --noEmit` + `npm run build` antes de `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `lib/crm-reports.test.ts` — cubre RPT-01/RPT-02 (MRR, ARPA, embudo, churn, ranking, snapshot rows). Espejo de `lib/crm-metrics.test.ts` (`now` inyectable, fixtures deterministas).
- Framework: ya instalado, sin gap de install.

## Security Domain

> `security_enforcement` activo (default). El CRM es la superficie MÁS sensible (core value).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Layout guard `is_admin` server-side (`(crm)/layout.tsx:29`); el cron usa `Bearer ${CRON_SECRET}` (route.ts:8) |
| V4 Access Control | yes | RLS admin-read en `mrr_snapshots` (espejo 034); session client hereda RLS para audit_log/deals; service-role SOLO tras el guard y nunca cruza al cliente |
| V5 Input Validation | parcial | Read-only mayormente; el cron no recibe input de usuario. Snapshot rows derivados de DB, no de request |
| V6 Cryptography | no | No se maneja cripto en esta fase |

### Known Threat Patterns for {Next 16 + Supabase RLS multi-tenant cross-tenant admin}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| service-role leak al cliente (datos cross-tenant del operador) | Information Disclosure | Pasar SOLO agregados/no sensibles a `reportes-client`; nunca el admin client ni filas crudas de businesses (T-01-09/T-02-09) |
| Leer tabla admin-only con service-role bypaseando RLS | Elevation of Privilege | Usar session client para audit_log/deals/mrr_snapshots (T-04-10); service-role solo para businesses (sin policy is_admin) y el snapshot del cron |
| `mrr_snapshots` con policy `using(true)` | Elevation of Privilege | Policy admin-read explícita (`is_admin` JWT); sin policy de write — lección 029 (NUNCA using(true)) |
| Snapshot falsificable por el dueño | Tampering | Sin policy insert/update/delete → solo service-role del cron escribe |
| Cron invocable sin auth | Spoofing | `Authorization: Bearer ${CRON_SECRET}` ya validado en el handler (route.ts:8); el snapshot hereda esa barrera |

## Sources

### Primary (HIGH confidence)
- Codebase in-repo: `auditoria/page.tsx`, `auditoria-client.tsx`, `negocios/page.tsx`, `crm-metrics.ts`, `crm-pipeline.ts`, `plan-prices.ts`, `audit.ts`, `_actions.ts`, `cancel-expired/route.ts`, `vercel.json`, migr. 032/034, `(crm)/layout.tsx`, `pipeline-client.tsx`, `vitest.config.mts` — patrones, versiones, line refs.
- `node_modules/recharts/package.json` (3.8.1) + export inspection — versión instalada, peer React 19, exports presentes.
- `package.json` — recharts `^3.8.1`, vitest `^4.1.9`, next `16.2.7`, react `19.2.4`.

### Secondary (MEDIUM confidence)
- recharts 3.0 migration guide (github.com/recharts/recharts/wiki/3.0-migration-guide) — breaking changes v2→v3.

### Tertiary (LOW confidence)
- WebSearch sobre recharts v3 breaking changes (cross-checked con el migration guide oficial).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — recharts/vitest verificados instalados, cero deps nuevas confirmado.
- Architecture: HIGH — todos los patrones existen en el repo y se citan con file:line; decisiones LOCKED en CONTEXT.
- Pitfalls: HIGH — derivados de lecciones del propio proyecto (T-04-10, lección 029, AR_OFFSET) + migration guide oficial de recharts.
- recharts v3 syntax: MEDIUM-HIGH — exports verificados localmente; breaking changes del migration guide oficial.

**Research date:** 2026-06-23
**Valid until:** 2026-07-23 (stack estable; recharts 3.8.x fijado en lockfile)
