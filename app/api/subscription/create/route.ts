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

  // Subscription WITHOUT an associated plan: with preapproval_plan_id MP forces
  // the on-site card flow (requires card_token_id). Sending the amount inline in
  // auto_recurring — and no preapproval_plan_id / card_token_id / status —
  // returns an init_point for the hosted checkout where MP collects the card and
  // confirms the subscription.
  const preapproval = await mpFetch('/preapproval', {
    method: 'POST',
    body: JSON.stringify({
      reason: `Forjo Gestión — Plan ${planConfig.name}`,
      external_reference: business.id,
      payer_email: user.email,
      back_url: `${FORJO_APP_URL}/dashboard?subscription=success`,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: planConfig.price_ars,
        currency_id: 'ARS',
      },
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
    plan,
    plan_status: 'pending_payment',
  }).eq('id', business.id)

  return Response.json({ ok: true, init_point: preapproval.init_point })
}
