import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPlanPrices } from '@/lib/plan-prices'
import { FichaClient, type FichaData } from './ficha-client'

/**
 * Ficha de negocio de la Consola CRM (/admin/negocios/[id]) — ADM-02..06.
 *
 * RSC con param dinámico (Next 16: `params` es un Promise → `await params`). Lee el negocio por id con
 * service-role (createAdminClient) DENTRO del server component: `businesses` NO tiene policy "is_admin
 * lee todo" → la lectura cross-tenant del super-admin va con service-role tras el guard del layout (crm).
 *
 * Aislamiento de datos al cliente (anti-pattern T-01-09 / T-02-09 / T-02-12): el id viene de la URL
 * (cliente), pero NO es autorización — la garantía es requireAdmin (layout guard + cada server action).
 * Al cliente cruzan SOLO columnas no sensibles + el email del dueño resuelto + el precio del plan.
 * Jamás el cliente admin, tokens ni el objeto user completo de auth.
 *
 * Email del dueño (Pitfall 6 / T-02-14): admin.auth.admin.getUserById(owner_id) ACOTADO — se extrae
 * solo el string email, con fallback a notification_email; el objeto user completo nunca se propaga.
 */

type BusinessSelect = {
  id: string
  name: string
  slug: string
  owner_id: string
  plan: string | null
  plan_status: string | null
  trial_ends_at: string | null
  subscription_ends_at: string | null
  mp_subscription_id: string | null
  whatsapp: string | null
  notification_email: string | null
  has_web_custom: boolean | null
  has_whatsapp: boolean | null
  created_at: string
}

export default async function FichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('businesses')
    .select(
      'id, name, slug, owner_id, plan, plan_status, trial_ends_at, subscription_ends_at, mp_subscription_id, whatsapp, notification_email, has_web_custom, has_whatsapp, created_at'
    )
    .eq('id', id)
    .maybeSingle<BusinessSelect>()

  if (error) {
    console.error('[crm/ficha] read error:', error.message)
  }
  if (!data) notFound()

  // Email del dueño acotado: solo el string, fallback a notification_email (nunca el user completo).
  let ownerEmail: string | null = data.notification_email ?? null
  try {
    const { data: userData } = await admin.auth.admin.getUserById(data.owner_id)
    if (userData?.user?.email) ownerEmail = userData.user.email
  } catch (e) {
    console.error('[crm/ficha] getUserById error:', e instanceof Error ? e.message : e)
  }

  const prices = await getPlanPrices()
  const plan = (data.plan ?? 'basic') as FichaData['plan']

  const ficha: FichaData = {
    id: data.id,
    name: data.name,
    slug: data.slug,
    ownerEmail,
    whatsapp: data.whatsapp,
    plan,
    plan_status: data.plan_status ?? 'trial',
    trial_ends_at: data.trial_ends_at,
    subscription_ends_at: data.subscription_ends_at,
    mp_subscription_id: data.mp_subscription_id,
    has_web_custom: Boolean(data.has_web_custom),
    has_whatsapp: Boolean(data.has_whatsapp),
    created_at: data.created_at,
    planPriceArs: prices[plan],
  }

  return <FichaClient data={ficha} />
}
