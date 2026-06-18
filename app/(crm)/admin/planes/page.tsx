import { createAdminClient } from '@/lib/supabase/admin'
import { getPlanPrices, type PlanKey } from '@/lib/plan-prices'
import { PLANS } from '@/lib/plans'
import { PlanesClient, type PlanCardData } from './planes-client'

/**
 * Editor de precios de la Consola CRM (/admin/planes) — ADM-05.
 *
 * RSC que lee con service-role (createAdminClient) DENTRO del server component: `plan_prices` y el
 * conteo de negocios activos por plan no tienen policy "is_admin lee todo" para el rol de sesión →
 * lectura tras el guard del layout (crm). El service-role NUNCA cruza al cliente: se pasan SOLO los
 * datos derivados (precio ARS, count, features read-only).
 *
 * Precios desde getPlanPrices (ARS, tabla plan_prices), NUNCA el price_usd de lib/plans.ts (Pitfall 1).
 * Las features son read-only de lib/plans.ts (topes/beneficios, no precio).
 */

const PLAN_ORDER: PlanKey[] = ['basic', 'studio', 'pro']

export default async function PlanesPage() {
  const admin = createAdminClient()
  const prices = await getPlanPrices()

  // Conteo de negocios ACTIVOS por plan (solo plan_status='active' suma a "negocios activos").
  const { data, error } = await admin.from('businesses').select('plan, plan_status')
  if (error) {
    console.error('[crm/planes] read error:', error.message)
  }

  const activeCounts: Record<PlanKey, number> = { basic: 0, studio: 0, pro: 0 }
  for (const row of data ?? []) {
    if (row.plan_status === 'active' && PLAN_ORDER.includes(row.plan as PlanKey)) {
      activeCounts[row.plan as PlanKey] += 1
    }
  }

  const cards: PlanCardData[] = PLAN_ORDER.map((key) => ({
    planKey: key,
    name: PLANS[key].name,
    priceArs: prices[key],
    activeCount: activeCounts[key],
    features: PLANS[key].features,
  }))

  return <PlanesClient cards={cards} />
}
