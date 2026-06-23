'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, ArrowDownRight, ChevronRight } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Label,
  type LabelProps,
} from 'recharts'

/**
 * Pantalla de Reportes de Ventas (client) — RPT-01 / RPT-02. Reproduce el mock LOCKED
 * `crm-design/06-reportes.png` sobre el shell dark del CRM:
 *   - Header: "Reportes de ventas" + subtítulo "Rendimiento comercial del SaaS · {mes}" +
 *     toggle 3/6/12 meses (re-filtra la serie EN MEMORIA, sin inventar meses — D-08). Sin botón
 *     "Exportar" (diferido a v2, D-08): no se renderiza una acción muerta.
 *   - Fila de 5 KPI cards: MRR (amarillo, VAR vs mes previo), Ingresos del mes (proxy recurrente,
 *     NO "cobrado" — D-03), ARPA, Conversión Lead→Activo, Churn mensual (rojo; cuenta de bajas
 *     SIEMPRE + % solo si hay historia, si no "— sin historia suficiente" — D-05, nunca NaN%).
 *   - Fila: Evolución de MRR (barras verticales amarillas) + MRR por plan (donut con total al centro).
 *   - Fila: Embudo de conversión (barras horizontales por etapa, colores de STAGES) + Ranking (tabla).
 *
 * recharts v3 (D-09, ya bundleado): charts SOLO acá ('use client'); ResponsiveContainer SIEMPRE en un
 * padre con altura explícita (Pitfall 1). Tooltips custom dark tipados (Pitfall 2). Cero hex en charts:
 * tokens CSS (var(--primary)/--crm-info/--crm-success/--crm-danger) y STAGES[].color (sin hardcodear).
 */

// ── Tipos de los agregados que envía el RSC (serializables, no sensibles) ────────────────────────
export type KpiVar = { value: number; deltaPct: number | null }
export type MrrPoint = { monthKey: string; label: string; mrr: number }
export type PlanSlice = { plan: string; label: string; mrr: number; count: number; pct: number }
export type FunnelBar = { key: string; label: string; count: number; pct: number | null; color: string }
export type RankingItem = { id: string; name: string; plan: string; label: string; mrr: number; var: number | null }

type ReportesClientProps = {
  mes: string
  mrr: KpiVar
  ingresos: KpiVar
  arpa: KpiVar
  conversion: KpiVar
  churnBajas: number
  churnPct: number | null
  series: MrrPoint[]
  planSlices: PlanSlice[]
  totalMrr: number
  funnel: FunnelBar[]
  ranking: RankingItem[]
}

// ── Formateadores (ARS verbatim de pipeline-client.tsx:50; % y compacto derivados) ───────────────
const arsFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

const pctFormatter = new Intl.NumberFormat('es-AR', {
  style: 'percent',
  maximumFractionDigits: 1,
})

// ARS compacto para los ticks del eje Y / label central del donut (p.ej. "$3,2M", "$22,8K").
function fmtCompactArs(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })}M`
  if (v >= 1_000) return `$${(v / 1_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })}K`
  return arsFormatter.format(v)
}

// Delta firmado (p.ej. "+5.2%"). null → "—". Para puntos porcentuales el caller pasa label propio.
function fmtDelta(pct: number | null): string {
  if (pct === null) return '—'
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${(pct * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`
}

// Donut: color por plan desde tokens (NO hex). basic→gris, studio→azul info, pro→amarillo primary.
const PLAN_COLOR: Record<string, string> = {
  basic: 'var(--muted-foreground)',
  studio: 'var(--crm-info)',
  pro: 'var(--primary)',
}
function planColor(plan: string): string {
  return PLAN_COLOR[plan] ?? 'var(--primary)'
}

// ── KPI card (reproduce el mock: valor grande + delta con flecha de color) ───────────────────────
type KpiTone = 'accent' | 'plain' | 'danger'

function KpiCard({
  label,
  value,
  tone = 'plain',
  delta,
  deltaPositive,
  caption,
}: {
  label: string
  value: string
  tone?: KpiTone
  delta?: string
  deltaPositive?: boolean | null // null = neutro (sin historia); true = sube/bueno; false = baja/malo
  caption?: string
}) {
  return (
    <div className="relative rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      {tone === 'accent' && (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-0.5 rounded-t-xl"
          style={{ backgroundColor: 'var(--primary)' }}
        />
      )}
      {tone === 'danger' && (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-0.5 rounded-t-xl"
          style={{ backgroundColor: 'var(--crm-danger)' }}
        />
      )}
      <p className="font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className="mt-3 font-[family-name:var(--font-heading)] text-3xl leading-[1.1] font-bold tracking-[-0.02em] tabular-nums"
        style={
          tone === 'accent'
            ? { color: 'var(--primary)' }
            : tone === 'danger'
              ? { color: 'var(--crm-danger)' }
              : undefined
        }
      >
        {value}
      </p>
      {delta !== undefined && (
        <div className="mt-2 flex items-center gap-1.5 text-sm">
          {deltaPositive === null ? (
            <span className="text-muted-foreground">{delta}</span>
          ) : (
            <>
              <span
                className="inline-flex items-center"
                style={{ color: deltaPositive ? 'var(--crm-success)' : 'var(--crm-danger)' }}
              >
                {deltaPositive ? (
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                ) : (
                  <ArrowDownRight className="size-3.5" aria-hidden="true" />
                )}
                <span className="ml-0.5 tabular-nums">{delta}</span>
              </span>
            </>
          )}
          {caption && <span className="text-muted-foreground">{caption}</span>}
        </div>
      )}
    </div>
  )
}

// ── Card chrome de un widget de gráfico ──────────────────────────────────────────────────────────
function ChartCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-bold tracking-[-0.02em]">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0 text-sm">{action}</div>}
      </div>
      {children}
    </section>
  )
}

// ── Tooltips custom dark (Pitfall 2: el default de recharts es claro) ────────────────────────────
type TooltipPayloadItem = { payload?: Record<string, unknown>; value?: number | string }
type CustomTooltipProps = { active?: boolean; payload?: TooltipPayloadItem[] }

function tooltipShell(children: React.ReactNode) {
  return (
    <div
      className="rounded-lg px-3 py-2 text-sm shadow-md"
      style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
    >
      {children}
    </div>
  )
}

function MrrTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload as MrrPoint | undefined
  if (!p) return null
  return tooltipShell(
    <>
      <p className="font-medium">{p.label}</p>
      <p className="tabular-nums text-muted-foreground">{arsFormatter.format(p.mrr)}</p>
    </>
  )
}

function PlanTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload as PlanSlice | undefined
  if (!p) return null
  return tooltipShell(
    <>
      <p className="font-medium">{p.label}</p>
      <p className="tabular-nums text-muted-foreground">
        {arsFormatter.format(p.mrr)} · {p.count} neg · {pctFormatter.format(p.pct)}
      </p>
    </>
  )
}

function FunnelTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload as FunnelBar | undefined
  if (!p) return null
  return tooltipShell(
    <>
      <p className="font-medium">{p.label}</p>
      <p className="tabular-nums text-muted-foreground">
        {p.count.toLocaleString('es-AR')}
        {p.pct !== null ? ` · ${pctFormatter.format(p.pct)} vs etapa previa` : ''}
      </p>
    </>
  )
}

const RANGES = [3, 6, 12] as const
type Range = (typeof RANGES)[number]

export function ReportesClient({
  mes,
  mrr,
  ingresos,
  arpa: arpaKpi,
  conversion,
  churnBajas,
  churnPct,
  series,
  planSlices,
  totalMrr,
  funnel,
  ranking,
}: ReportesClientProps) {
  const [range, setRange] = useState<Range>(6)

  // Toggle 3/6/12m: re-filtra la serie EN MEMORIA a los últimos N meses DISPONIBLES (D-08). Si hay
  // menos meses que el rango, se muestran solo los que existen — sin inventar meses faltantes.
  const visibleSeries = useMemo(() => series.slice(Math.max(0, series.length - range)), [series, range])

  // Variación de MRR a lo largo de la serie visible (caption del header "↑ +X% en N meses").
  const seriesDeltaPct = useMemo(() => {
    if (visibleSeries.length < 2) return null
    const first = visibleSeries[0].mrr
    const last = visibleSeries[visibleSeries.length - 1].mrr
    if (first <= 0) return null
    return (last - first) / first
  }, [visibleSeries])

  // Label central del donut: total MRR del mes (Pattern 2 RESEARCH). renderLabel posiciona el texto.
  const renderDonutCenter = (props: LabelProps) => {
    const vb = props.viewBox as { cx?: number; cy?: number } | undefined
    if (!vb?.cx || !vb?.cy) return null
    return (
      <g>
        <text x={vb.cx} y={vb.cy - 6} textAnchor="middle" className="fill-foreground" style={{ fontWeight: 700, fontSize: 22 }}>
          {fmtCompactArs(totalMrr)}
        </text>
        <text x={vb.cx} y={vb.cy + 16} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 11 }}>
          MRR total
        </text>
      </g>
    )
  }

  const churnHasHistory = churnPct !== null

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-2xl font-bold tracking-[-0.02em]">
            Reportes de ventas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Rendimiento comercial del SaaS · <span className="text-foreground">{mes}</span>
          </p>
        </div>
        {/* Toggle 3/6/12 meses (funcional, D-08). El botón "Exportar" se difiere a v2 → no se renderiza. */}
        <div
          role="group"
          aria-label="Rango de meses"
          className="inline-flex items-center gap-1 self-start rounded-lg bg-secondary p-1 ring-1 ring-foreground/10"
        >
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              aria-pressed={range === r}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                range === r
                  ? 'bg-primary text-[color:var(--primary-foreground)]'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {r} meses
            </button>
          ))}
        </div>
      </header>

      {/* ── Fila de 5 KPI cards ────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard
          label="MRR"
          value={arsFormatter.format(mrr.value)}
          tone="accent"
          delta={fmtDelta(mrr.deltaPct)}
          deltaPositive={mrr.deltaPct === null ? null : mrr.deltaPct >= 0}
          caption="vs mes previo"
        />
        <KpiCard
          label="Ingresos del mes"
          value={arsFormatter.format(ingresos.value)}
          delta={fmtDelta(ingresos.deltaPct)}
          deltaPositive={ingresos.deltaPct === null ? null : ingresos.deltaPct >= 0}
          caption="recurrente del mes"
        />
        <KpiCard
          label="ARPA"
          value={arsFormatter.format(arpaKpi.value)}
          delta={fmtDelta(arpaKpi.deltaPct)}
          deltaPositive={arpaKpi.deltaPct === null ? null : arpaKpi.deltaPct >= 0}
          caption="ingreso x cuenta"
        />
        <KpiCard
          label="Conversión Lead→Activo"
          value={pctFormatter.format(conversion.value)}
          delta={fmtDelta(conversion.deltaPct)}
          deltaPositive={conversion.deltaPct === null ? null : conversion.deltaPct >= 0}
          caption="últimos 90 d"
        />
        <KpiCard
          label="Churn mensual"
          value={churnHasHistory ? pctFormatter.format(churnPct!) : '—'}
          tone="danger"
          delta={
            churnHasHistory
              ? `${churnBajas.toLocaleString('es-AR')} ${churnBajas === 1 ? 'baja' : 'bajas'} en el mes`
              : `${churnBajas.toLocaleString('es-AR')} ${churnBajas === 1 ? 'baja' : 'bajas'} · sin historia suficiente`
          }
          deltaPositive={null}
        />
      </div>

      {/* ── Fila: Evolución de MRR + MRR por plan ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <ChartCard
          title="Evolución de MRR"
          subtitle="Recurrente mensual · pesos argentinos"
          action={
            seriesDeltaPct !== null ? (
              <span
                className="inline-flex items-center gap-0.5 tabular-nums"
                style={{ color: seriesDeltaPct >= 0 ? 'var(--crm-success)' : 'var(--crm-danger)' }}
              >
                {seriesDeltaPct >= 0 ? (
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                ) : (
                  <ArrowDownRight className="size-3.5" aria-hidden="true" />
                )}
                {fmtDelta(seriesDeltaPct)} en {visibleSeries.length} meses
              </span>
            ) : null
          }
        >
          {visibleSeries.length === 0 ? (
            <EmptyChart message="Todavía no hay snapshots de MRR." />
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={visibleSeries} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                  />
                  <YAxis
                    tickFormatter={(v) => fmtCompactArs(Number(v))}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                  />
                  <Tooltip content={<MrrTooltip />} cursor={{ fill: 'var(--secondary)' }} />
                  <Bar dataKey="mrr" radius={[4, 4, 0, 0]} fill="var(--primary)" maxBarSize={64} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="MRR por plan" subtitle="Distribución del recurrente">
          {planSlices.length === 0 ? (
            <EmptyChart message="Sin negocios activos para distribuir." />
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={planSlices}
                      dataKey="mrr"
                      nameKey="label"
                      innerRadius={64}
                      outerRadius={92}
                      strokeWidth={0}
                      startAngle={90}
                      endAngle={-270}
                    >
                      {planSlices.map((p) => (
                        <Cell key={p.plan} fill={planColor(p.plan)} />
                      ))}
                      <Label content={renderDonutCenter} position="center" />
                    </Pie>
                    <Tooltip content={<PlanTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Leyenda: plan · negocios · % */}
              <ul className="w-full space-y-2">
                {planSlices.map((p) => (
                  <li key={p.plan} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="inline-block size-2.5 rounded-full"
                        style={{ backgroundColor: planColor(p.plan) }}
                      />
                      <span className="font-medium">{p.label}</span>
                    </span>
                    <span className="flex items-center gap-3 tabular-nums text-muted-foreground">
                      <span>{p.count} neg</span>
                      <span className="w-10 text-right font-medium text-foreground">{pctFormatter.format(p.pct)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ChartCard>
      </div>

      {/* ── Fila: Embudo de conversión + Ranking ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Embudo de conversión" subtitle="Por etapa del pipeline · últimos 90 días">
          {funnel.every((b) => b.count === 0) ? (
            <EmptyChart message="Sin deals en la ventana de 90 días." />
          ) : (
            <div className="space-y-3">
              {funnel.map((b) => {
                const max = Math.max(...funnel.map((f) => f.count), 1)
                const width = `${Math.max(2, (b.count / max) * 100)}%`
                return (
                  <div key={b.key}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-medium">
                        {b.label} <span className="text-muted-foreground tabular-nums">{b.count}</span>
                      </span>
                      {b.pct !== null && (
                        <span className="tabular-nums text-muted-foreground">
                          {pctFormatter.format(b.pct)} <ArrowDownRight className="inline size-3" aria-hidden="true" />
                        </span>
                      )}
                    </div>
                    <div className="mt-1 h-6 w-full overflow-hidden rounded-md bg-secondary">
                      <div
                        className="flex h-full items-center rounded-md px-2 text-xs font-medium tabular-nums"
                        style={{ width, backgroundColor: b.color, color: 'var(--primary-foreground)' }}
                      >
                        {b.count > 0 ? b.count : ''}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Ranking"
          subtitle="Top cuentas por MRR"
          action={
            <Link
              href="/admin/negocios"
              className="inline-flex items-center gap-0.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              Ver negocios <ChevronRight className="size-3.5" aria-hidden="true" />
            </Link>
          }
        >
          {ranking.length === 0 ? (
            <EmptyChart message="Sin cuentas para rankear." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left font-[family-name:var(--font-geist-mono)] text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-2 font-normal">#</th>
                    <th className="py-2 pr-2 font-normal">Negocio</th>
                    <th className="py-2 pr-2 font-normal">Plan</th>
                    <th className="py-2 pr-2 text-right font-normal">MRR</th>
                    <th className="py-2 text-right font-normal">Var</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((r, i) => (
                    <tr key={r.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2.5 pr-2 tabular-nums text-muted-foreground">{i + 1}</td>
                      <td className="py-2.5 pr-2 font-medium">{r.name}</td>
                      <td className="py-2.5 pr-2 text-muted-foreground">{r.label}</td>
                      <td className="py-2.5 pr-2 text-right tabular-nums">{arsFormatter.format(r.mrr)}</td>
                      <td className="py-2.5 text-right tabular-nums">
                        {r.var === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span style={{ color: r.var >= 0 ? 'var(--crm-success)' : 'var(--crm-danger)' }}>
                            {r.var >= 0 ? '+' : ''}
                            {arsFormatter.format(r.var)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

// Empty-state honesto de un widget: nunca un chart roto ni datos inventados.
function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-56 w-full items-center justify-center rounded-lg bg-secondary/40 text-sm text-muted-foreground">
      {message}
    </div>
  )
}
