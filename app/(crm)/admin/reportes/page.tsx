import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPlanPrices } from '@/lib/plan-prices'
import { SUBSCRIPTION_PLANS, type SubscriptionPlanKey } from '@/lib/subscription-plans'
import {
  mrrByPlan,
  arpa,
  funnel,
  churn,
  ranking,
  arMonthKey,
  type BizRow,
  type SnapshotRow,
} from '@/lib/crm-reports'
import { STAGES, type StageKey, type DealStatus } from '@/lib/crm-pipeline'
import {
  ReportesClient,
  type KpiVar,
  type MrrPoint,
  type PlanSlice,
  type FunnelBar,
  type RankingItem,
} from './reportes-client'

/**
 * Pantalla de Reportes de Ventas del CRM (/admin/reportes) — RPT-01 / RPT-02.
 *
 * RSC que lee las fuentes con un SPLIT de cliente deliberado (D-10):
 *  - `createClient()` (SESIÓN del operador, anon key + cookies, RLS-gated) para `deals`,
 *    `audit_log` y `mrr_snapshots` — esas tablas tienen policy admin-read (migr. 034/031/036);
 *    el gate REAL es la RLS, NO el cliente. Leerlas con service-role bypassaría la policy
 *    (lección T-04-10 / T-01-09), por eso se evita en lectura.
 *  - `createAdminClient()` (SERVICE-ROLE, server-only) SOLO para `businesses` (sin policy
 *    "is_admin lee todo") + `getPlanPrices()`. El admin client y las filas crudas de businesses
 *    NUNCA cruzan al cliente (T-01-09 / T-02-09): a <ReportesClient/> solo se le pasan AGREGADOS
 *    serializables (KPIs, serie, MRR por plan, embudo, ranking name/plan/mrr/var).
 *
 * Aislamiento por `is_admin`, NO por `business_id`: los reportes son datos del operador,
 * cross-tenant POR DISEÑO (D-10). El layout `(crm)` ya redirige al no-admin server-side
 * (FND-01) → defensa en profundidad, sin re-guardar acá; aun si llegara, la RLS no
 * devolvería filas de las tablas admin-only.
 *
 * Los cálculos viven en la lib pura `@/lib/crm-reports` (testeada en Wave 1). La fórmula de MRR
 * = Σ(precio del plan × activos) reusa `mrrByPlan`. Las etiquetas de plan salen de
 * `SUBSCRIPTION_PLANS[plan].name` (fuente de verdad: basic→Básico, studio→Estudio, pro→Pro),
 * NUNCA del texto del mock.
 */

export const dynamic = 'force-dynamic'

const DAY_MS = 86_400_000
const PLAN_KEYS: SubscriptionPlanKey[] = ['basic', 'studio', 'pro']

// Etiqueta de plan desde la fuente de verdad; fallback al key crudo si no es un plan conocido.
function planLabel(plan: string): string {
  return SUBSCRIPTION_PLANS[plan as SubscriptionPlanKey]?.name ?? plan
}

// Nombre de mes corto en español (Ene, Feb, …) desde una month-key 'YYYY-MM-01'.
const MONTH_ABBR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
function monthLabelFromKey(key: string): string {
  // key = 'YYYY-MM-01'; el índice de mes es 1-based en la key.
  const m = Number(key.slice(5, 7))
  return MONTH_ABBR[m - 1] ?? key
}

export default async function ReportesPage() {
  const supabase = await createClient() // session, RLS-gated → deals / audit_log / mrr_snapshots
  const admin = createAdminClient() // service-role tras el guard del layout → businesses

  const now = new Date()
  const nowMs = now.getTime()
  const window90Start = new Date(nowMs - 90 * DAY_MS).toISOString()
  const monthKey = arMonthKey(now) // 'YYYY-MM-01' del mes actual en zona AR
  const monthStart = new Date(`${monthKey}T00:00:00-03:00`).toISOString()

  // Lectura combinada: tres tablas con session (RLS) + businesses con service-role + precios.
  const [dealsRes, auditRes, snapsRes, bizRes, prices] = await Promise.all([
    supabase.from('deals').select('stage, status, created_at').gte('created_at', window90Start),
    supabase
      .from('audit_log')
      .select('action, created_at')
      .in('action', ['business.suspend', 'business.reactivate'])
      .gte('created_at', monthStart),
    supabase.from('mrr_snapshots').select('month, plan, mrr, active_count').order('month', { ascending: true }),
    admin.from('businesses').select('id, name, plan, plan_status'),
    getPlanPrices(),
  ])

  if (dealsRes.error) console.error('[crm/reportes] deals read error:', dealsRes.error.message)
  if (auditRes.error) console.error('[crm/reportes] audit_log read error:', auditRes.error.message)
  if (snapsRes.error) console.error('[crm/reportes] mrr_snapshots read error:', snapsRes.error.message)
  if (bizRes.error) console.error('[crm/reportes] businesses read error:', bizRes.error.message)

  const dealRows = (dealsRes.data ?? []) as { stage: StageKey; status: DealStatus }[]
  const auditRows = (auditRes.data ?? []) as { action: string }[]
  const snaps = (snapsRes.data ?? []) as SnapshotRow[]
  const bizRows = (bizRes.data ?? []) as BizRow[]

  // ── MRR / activos del mes actual (estado vivo, D-02) ───────────────────────────────────────────
  const byPlan = mrrByPlan(bizRows, prices)
  const mrrNow = Object.values(byPlan).reduce((s, e) => s + e.mrr, 0)
  const activosNow = Object.values(byPlan).reduce((s, e) => s + e.count, 0)
  const arpaNow = arpa(mrrNow, activosNow)

  // ── Serie histórica por mes (agrega snapshots por mes: MRR total + active_count total) ──────────
  const byMonth = new Map<string, { mrr: number; active: number }>()
  for (const s of snaps) {
    const e = byMonth.get(s.month) ?? { mrr: 0, active: 0 }
    e.mrr += s.mrr
    e.active += s.active_count
    byMonth.set(s.month, e)
  }
  // Aseguramos que el mes actual esté en la serie con el MRR vivo (el snapshot puede no haber corrido hoy).
  byMonth.set(monthKey, { mrr: mrrNow, active: activosNow })

  const monthsSorted = Array.from(byMonth.keys()).sort()
  const series: MrrPoint[] = monthsSorted.map((key) => ({
    monthKey: key,
    label: monthLabelFromKey(key),
    mrr: byMonth.get(key)!.mrr,
  }))

  // Mes previo (penúltimo de la serie) para los deltas (VAR). null si no hay historia.
  const prevKey = monthsSorted.length >= 2 ? monthsSorted[monthsSorted.length - 2] : null
  const prevMonth = prevKey ? byMonth.get(prevKey)! : null
  const prevMrr = prevMonth?.mrr ?? null
  const prevActive = prevMonth?.active ?? null

  // ── KPI deltas (VAR): pct vs mes previo; null = "—" sin historia (D-05) ─────────────────────────
  function pctVar(curr: number, prev: number | null): number | null {
    if (prev === null || prev <= 0) return null
    return (curr - prev) / prev
  }

  const prevArpa = prevMrr !== null && prevActive ? arpa(prevMrr, prevActive) : null

  const mrrKpi: KpiVar = { value: mrrNow, deltaPct: pctVar(mrrNow, prevMrr) }
  // "Ingresos del mes" = proxy de facturación recurrente (= MRR del mes), NO cobrado real (D-03).
  const ingresosKpi: KpiVar = { value: mrrNow, deltaPct: pctVar(mrrNow, prevMrr) }
  const arpaKpi: KpiVar = { value: arpaNow, deltaPct: pctVar(arpaNow, prevArpa) }

  // Conversión Lead→Activo: deals ganados (won) ÷ leads de la ventana de 90 días (D-05).
  const leadsWindow = dealRows.length
  const wonWindow = dealRows.filter((d) => d.status === 'won').length
  const convNow = leadsWindow > 0 ? wonWindow / leadsWindow : 0
  const convKpi: KpiVar = { value: convNow, deltaPct: null } // sin serie histórica de conversión → sin VAR

  // Churn del mes: cuenta neta de bajas SIEMPRE; pct null sin snapshot previo (D-05, empty-state honesto).
  const churnResult = churn(auditRows, prevActive)

  // ── MRR por plan (donut, D-06) ─────────────────────────────────────────────────────────────────
  const planSlices: PlanSlice[] = PLAN_KEYS.filter((k) => byPlan[k] && byPlan[k].count > 0).map((k) => {
    const e = byPlan[k]
    return {
      plan: k,
      label: planLabel(k),
      mrr: e.mrr,
      count: e.count,
      pct: mrrNow > 0 ? e.mrr / mrrNow : 0,
    }
  })

  // ── Embudo de conversión (D-04) ────────────────────────────────────────────────────────────────
  const funnelBars: FunnelBar[] = funnel(dealRows).map((step) => {
    const stage = STAGES.find((s) => s.key === step.key)
    return { key: step.key, label: step.label, count: step.count, pct: step.pct, color: stage?.color ?? 'var(--primary)' }
  })

  // ── Ranking de cuentas por MRR (D-07) ──────────────────────────────────────────────────────────
  // VAR por negocio se difiere: no hay snapshot por-negocio (mrr_snapshots agrega por plan), así que
  // la VAR del ranking es null ("—") hasta tener esa historia. La lib soporta prevMrrByBiz (Wave 1).
  const rankingRows = ranking(bizRows, prices).slice(0, 10)
  const rankingItems: RankingItem[] = rankingRows.map((r) => ({
    id: r.id,
    name: r.name,
    plan: r.plan,
    label: planLabel(r.plan),
    mrr: r.mrr,
    var: r.var,
  }))

  // Mes actual en español para el subtítulo del header.
  const mesActual = `${monthLabelFromKey(monthKey).toLowerCase()} ${monthKey.slice(0, 4)}`

  return (
    <ReportesClient
      mes={mesActual}
      mrr={mrrKpi}
      ingresos={ingresosKpi}
      arpa={arpaKpi}
      conversion={convKpi}
      churnBajas={churnResult.bajas}
      churnPct={churnResult.pct}
      series={series}
      planSlices={planSlices}
      totalMrr={mrrNow}
      funnel={funnelBars}
      ranking={rankingItems}
    />
  )
}
