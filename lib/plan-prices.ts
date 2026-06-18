import { createAdminClient } from '@/lib/supabase/admin'
import { SUBSCRIPTION_PLANS } from '@/lib/subscription-plans'

// Las 3 keys reales de plan (display: Básico/Estudio/Pro).
export type PlanKey = 'basic' | 'studio' | 'pro'
export type PlanPrices = Record<PlanKey, number>

// Fallback = los price_ars literales de lib/subscription-plans.ts (lo que cobra MercadoPago).
// CRÍTICO (Pitfall 1): la fuente es price_ars, NUNCA el price_usd de lib/plans.ts.
const FALLBACK_PRICES: PlanPrices = {
  basic: SUBSCRIPTION_PLANS.basic.price_ars,
  studio: SUBSCRIPTION_PLANS.studio.price_ars,
  pro: SUBSCRIPTION_PLANS.pro.price_ars,
}

const PLAN_KEYS: PlanKey[] = ['basic', 'studio', 'pro']

/**
 * Lee los precios editables (ARS) de la tabla `plan_prices` con service-role (server-only).
 * Si falta una fila o hay error de DB, cae al price_ars literal de subscription-plans.ts —
 * mismo patrón de fallback que getSubscriptionPlan. Devuelve siempre las 3 keys.
 */
export async function getPlanPrices(): Promise<PlanPrices> {
  const prices: PlanPrices = { ...FALLBACK_PRICES }
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.from('plan_prices').select('plan_key, price_ars')
    if (error) {
      console.error('[plan-prices] read error:', error.message)
      return prices
    }
    for (const row of data ?? []) {
      if (PLAN_KEYS.includes(row.plan_key as PlanKey) && typeof row.price_ars === 'number') {
        prices[row.plan_key as PlanKey] = row.price_ars
      }
    }
    return prices
  } catch (e) {
    console.error('[plan-prices] unexpected error:', e instanceof Error ? e.message : e)
    return prices
  }
}
