import { addDays } from 'date-fns'

// ── Tipos de dominio ──────────────────────────────────────────────────────────────────────
// Subconjunto de columnas de `businesses` que necesitan los KPIs/alertas del CRM (ADM-07/ALERT-01).
// Funciones PURAS: sin DB ni React, `now` inyectable como último parámetro para determinismo en test.
export type BizRow = {
  id: string
  name: string
  plan: string
  plan_status: string
  trial_ends_at: string | null
}

// Mapa plan_key → precio ARS (lo provee getPlanPrices, leído de plan_prices). D-02: ARS, no USD.
export type Prices = Record<string, number>

export type Kpis = {
  mrr: number
  negociosActivos: number
  trialsPorVencer: number
  pagosFallidos: number
}

export type AlertType = 'pago_fallido' | 'trial_por_vencer'

export type Alert = {
  businessId: string
  name: string
  tipo: AlertType
}

// Zona AR fija (UTC-3 sin DST). Para "fin del día AR" usamos el offset literal -03:00 (Pitfall 7).
const AR_OFFSET = '-03:00'
const SEVEN_DAYS_MS = 7 * 86_400_000

// Estado que se considera "fuente de pago fallido" (D-10: derivado de plan_status, no de un evento).
function esPagoFallido(planStatus: string): boolean {
  return planStatus === 'cancelled' || planStatus === 'expired'
}

// Trial cuyo fin cae dentro de la ventana [now, now+7d] — el mismo criterio de ≤7d que el
// PlanBanner del dashboard del dueño (app/(dashboard)/layout.tsx:26-28).
function esTrialPorVencer(row: BizRow, nowMs: number): boolean {
  if (row.plan_status !== 'trial' || !row.trial_ends_at) return false
  const endMs = new Date(row.trial_ends_at).getTime()
  return endMs >= nowMs && endMs - nowMs <= SEVEN_DAYS_MS
}

/**
 * KPIs del dashboard del operador, derivados en vivo de un solo select de businesses + plan_prices.
 * MRR = Σ(precio del plan × negocios activos por plan) — snapshot actual, no histórico (D-03).
 */
export function computeKpis(rows: BizRow[], prices: Prices, now: Date = new Date()): Kpis {
  const nowMs = now.getTime()
  const activos = rows.filter((r) => r.plan_status === 'active')
  // `?? 0`: un plan activo sin fila de precio suma 0, nunca NaN.
  const mrr = activos.reduce((sum, r) => sum + (prices[r.plan] ?? 0), 0)
  const trialsPorVencer = rows.filter((r) => esTrialPorVencer(r, nowMs)).length
  const pagosFallidos = rows.filter((r) => esPagoFallido(r.plan_status)).length
  return { mrr, negociosActivos: activos.length, trialsPorVencer, pagosFallidos }
}

/**
 * Alertas urgentes derivadas en vivo (ALERT-01). Cada alerta lleva businessId para navegar a la
 * ficha (D-12). pago_fallido (cancelled/expired) tiene prioridad sobre trial_por_vencer.
 */
export function deriveAlerts(rows: BizRow[], now: Date = new Date()): Alert[] {
  const nowMs = now.getTime()
  const alerts: Alert[] = []
  for (const r of rows) {
    if (esPagoFallido(r.plan_status)) {
      alerts.push({ businessId: r.id, name: r.name, tipo: 'pago_fallido' })
    } else if (esTrialPorVencer(r, nowMs)) {
      alerts.push({ businessId: r.id, name: r.name, tipo: 'trial_por_vencer' })
    }
  }
  return alerts
}

export type ResolveTrialInput = {
  preset?: '7' | '14' | '30'
  exactDate?: string // ISO de fecha (YYYY-MM-DD o ISO completo) — se toma el día calendario
}

/**
 * Resuelve la nueva `trial_ends_at` (ISO UTC) al extender un trial (D-07).
 * - preset 7/14/30 → now + N días.
 * - exactDate → fin del día AR (23:59:59.999 -03:00) de esa fecha, para no recortar un día por el
 *   offset UTC-3 (Pitfall 7).
 * - ni preset ni exactDate → lanza 'preset_or_date_required'.
 */
export function resolveTrialEndsAt(input: ResolveTrialInput, now: Date = new Date()): string {
  if (input.preset) {
    return addDays(now, Number(input.preset)).toISOString()
  }
  if (input.exactDate) {
    // Tomar solo el día calendario (primeros 10 chars: YYYY-MM-DD) y fijar el fin del día AR.
    const day = input.exactDate.slice(0, 10)
    return new Date(`${day}T23:59:59.999${AR_OFFSET}`).toISOString()
  }
  throw new Error('preset_or_date_required')
}
