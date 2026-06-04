import { createClient } from '@/lib/supabase/server'
import { mpFetch, isMPTestMode } from '@/lib/mercadopago'
import { getSubscriptionPlan, FORJO_APP_URL } from '@/lib/subscription-plans'
import type { NextRequest } from 'next/server'

const VALID = ['basic', 'studio', 'pro']

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })

  let body: { plan?: string; payer_email?: string }
  try { body = await request.json() } catch { return Response.json({ error: 'JSON inválido' }, { status: 400 }) }

  const plan = body.plan
  if (!plan || !VALID.includes(plan)) return Response.json({ error: 'Plan inválido' }, { status: 400 })

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, plan_status, mp_subscription_id')
    .eq('owner_id', user.id)
    .single()
  if (!business) return Response.json({ error: 'Negocio no encontrado' }, { status: 404 })

  // Idempotent retry guard: if the business is already active with a live
  // subscription, do NOT create another preapproval. Any other state (trial,
  // pending, cancelled, expired) falls through and generates a fresh preapproval,
  // so a rejected first attempt retries automatically — no manual SQL reset.
  if (business.plan_status === 'active' && business.mp_subscription_id) {
    return Response.json({ ok: false, error: 'Ya tenés una suscripción activa.' })
  }

  const planConfig = getSubscriptionPlan(plan)

  // payer_email is mandatory at MP. It must match the buyer's own MercadoPago
  // account, NOT the Forjo account email — a mismatch breaks the checkout. So we
  // use the email the client enters in the modal. In test mode we force the MP
  // test buyer so payer and collector are both test accounts.
  let payerEmail: string | undefined
  if (isMPTestMode()) {
    payerEmail = process.env.MP_TEST_PAYER_EMAIL
    if (!payerEmail) {
      return Response.json({ error: 'Falta configurar MP_TEST_PAYER_EMAIL para el modo prueba' }, { status: 500 })
    }
  } else {
    payerEmail = body.payer_email?.trim()
    if (!payerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) {
      return Response.json({ error: 'Ingresá el email de tu cuenta de MercadoPago' }, { status: 400 })
    }
  }

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
      payer_email: payerEmail,
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

  // Deliberately DO NOT persist plan_status / mp_subscription_id here. The business
  // stays in 'trial' until the webhook confirms the preapproval is `authorized`.
  // Writing state before payment confirmation left businesses in a dirty state that
  // blocked retries when the first card was rejected.
  return Response.json({ ok: true, init_point: preapproval.init_point })
}
