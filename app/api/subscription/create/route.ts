import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mpFetch } from '@/lib/mercadopago'
import { getSubscriptionPlan, FORJO_APP_URL } from '@/lib/subscription-plans'
import type { NextRequest } from 'next/server'

const VALID = ['basic', 'studio', 'pro']

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })

  let body: { plan?: string }
  try { body = await request.json() } catch { return Response.json({ error: 'JSON inválido' }, { status: 400 }) }

  const plan = body.plan
  if (!plan || !VALID.includes(plan)) return Response.json({ error: 'Plan inválido' }, { status: 400 })

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name')
    .eq('owner_id', user.id)
    .single()
  if (!business) return Response.json({ error: 'Negocio no encontrado' }, { status: 404 })

  const planConfig = getSubscriptionPlan(plan)
  if (!planConfig.mp_plan_id) {
    return Response.json({ error: 'El plan no está configurado en MercadoPago' }, { status: 500 })
  }

  // With an associated plan, MP inherits the recurring config from the plan.
  // Sending auto_recurring/card_token_id here makes MP treat it as a custom
  // subscription and reject with "card_token_id is required". Omitting both
  // returns an init_point for the hosted checkout where the user adds the card.
  const preapproval = await mpFetch('/preapproval', {
    method: 'POST',
    body: JSON.stringify({
      preapproval_plan_id: planConfig.mp_plan_id,
      reason: `Forjo Gestión — Plan ${planConfig.name}`,
      external_reference: business.id,
      payer_email: user.email,
      back_url: `${FORJO_APP_URL}/dashboard?subscription=success`,
      status: 'pending',
    }),
  })

  if (!preapproval.id || !preapproval.init_point) {
    console.error('MP preapproval error:', JSON.stringify(preapproval))
    return Response.json({ error: 'Error al crear la suscripción en MercadoPago' }, { status: 500 })
  }

  // Persist with admin client (bypasses RLS, reliable server write)
  const admin = createAdminClient()
  await admin.from('businesses').update({
    mp_subscription_id: preapproval.id,
    mp_plan_id_active: planConfig.mp_plan_id,
    plan,
    plan_status: 'pending_payment',
  }).eq('id', business.id)

  return Response.json({ ok: true, init_point: preapproval.init_point })
}
