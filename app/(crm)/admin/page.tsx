import { createAdminClient } from '@/lib/supabase/admin'
import { getPlanPrices } from '@/lib/plan-prices'
import { computeKpis, deriveAlerts, type BizRow } from '@/lib/crm-metrics'
import { KpiCard } from '@/components/crm/kpi-card'
import { AlertList, type AlertItem } from '@/components/crm/alert-list'

/**
 * Dashboard de la Consola CRM (/admin) — ADM-07 / ALERT-01 / D-12.
 *
 * RSC que lee TODOS los negocios con service-role (createAdminClient) DENTRO del server component:
 * `businesses` NO tiene policy "is_admin lee todo" (las policies son tenant-scoped por owner_id),
 * así que la lectura cross-tenant del super-admin va con service-role tras el guard del layout (crm).
 * El service-role NUNCA cruza al cliente (anti-pattern T-01-09): KpiCard/AlertList reciben solo
 * valores ya computados / filas mínimas (id+name+tipo) — jamás el cliente ni columnas secretas.
 *
 * SELECT explícito de columnas no sensibles (calca auditoria/page.tsx). KPIs y alertas se derivan
 * en vivo con las funciones puras de lib/crm-metrics (computeKpis/deriveAlerts) — sin cron ni tabla
 * de eventos (D-10/D-11). NO se renderizan los bloques pipeline/actividad del mock (Phase 4/6).
 *
 * Zona AR (UTC-3 sin DST): el conteo de días restantes de trial usa el mismo criterio que las libs.
 */

// Formatea ARS como string limpio sin overlap (es-AR, agrupación con puntos), p.ej. "$3.240.000".
const arsFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

const DAY_MS = 86_400_000

// Días restantes de trial (>=0, redondeo hacia arriba) para el caption de la alerta.
function diasDeTrial(trialEndsAt: string | null, now: number): number | undefined {
  if (!trialEndsAt) return undefined
  const diff = new Date(trialEndsAt).getTime() - now
  return Math.max(0, Math.ceil(diff / DAY_MS))
}

export default async function AdminPage() {
  const admin = createAdminClient()

  // SELECT explícito de columnas no sensibles (nunca tokens/secrets) — solo lo que necesitan KPIs/alertas.
  const { data, error } = await admin
    .from('businesses')
    .select('id, name, plan, plan_status, trial_ends_at')

  // Error de lectura (best-effort): render con datos vacíos (calca el patrón de auditoria), sin romper.
  if (error) {
    console.error('[crm/dashboard] read error:', error.message)
  }

  const rows: BizRow[] = (data ?? []) as BizRow[]
  const prices = await getPlanPrices()

  const now = new Date()
  const kpis = computeKpis(rows, prices, now)

  // Alertas enriquecidas con los días restantes del trial (sin propagar columnas extra al client).
  const nowMs = now.getTime()
  const trialDiasById = new Map(rows.map((r) => [r.id, diasDeTrial(r.trial_ends_at, nowMs)]))
  const alerts: AlertItem[] = deriveAlerts(rows, now).map((a) =>
    a.tipo === 'trial_por_vencer' ? { ...a, diasRestantes: trialDiasById.get(a.businessId) } : a
  )

  return (
    <div className="space-y-8">
      <h1 className="sr-only">Dashboard</h1>

      {/* Grid de 4 KPI cards con datos reales (computeKpis). Sin deltas/sparklines fabricados (D-03). */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="MRR" value={arsFormatter.format(kpis.mrr)} tone="accent" />
        <KpiCard
          label="NEGOCIOS ACTIVOS"
          value={kpis.negociosActivos.toLocaleString('es-AR')}
          tone="info"
        />
        <KpiCard
          label="TRIALS POR VENCER"
          value={kpis.trialsPorVencer.toLocaleString('es-AR')}
          tone="info"
          sub={kpis.trialsPorVencer > 0 ? 'En los próximos 7 días' : undefined}
        />
        <KpiCard
          label="PAGOS FALLIDOS"
          value={kpis.pagosFallidos.toLocaleString('es-AR')}
          tone="danger"
          sub={kpis.pagosFallidos > 0 ? 'Requieren seguimiento' : undefined}
        />
      </div>

      {/* Alertas clickeables → ficha del negocio (ALERT-01 / D-12). */}
      <AlertList alerts={alerts} />
    </div>
  )
}
