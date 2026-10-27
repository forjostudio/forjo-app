import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mpFetch, verifyMPSignature } from '@/lib/mercadopago'
import { SUBSCRIPTION_PLANS, type SubscriptionPlanKey } from '@/lib/subscription-plans'
import type { NextRequest } from 'next/server'

// 35 days = monthly cycle + grace period
function nextRenewal(): string {
  return new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString()
}

export async function POST(request: NextRequest) {
  // data.id for the signature manifest comes from the query string.
  const dataIdQuery = request.nextUrl.searchParams.get('data.id') ?? request.nextUrl.searchParams.get('id')

  let body: { type?: string; action?: string; data?: { id?: string } }
  try {
    body = await request.json()
  } catch {
    return new Response('OK', { status: 200 })
  }

  // Reject forged requests before trusting anything or doing any work.
  if (!verifyMPSignature(request, dataIdQuery ?? body.data?.id)) {
    return new Response('Invalid signature', { status: 401 })
  }

  const type = body.type || body.action || ''
  const dataId = body.data?.id

  after(async () => {
    try {
      await processWebhook(type, dataId)
    } catch (e) {
      console.error('Subscription webhook error:', e)
    }
  })

  return new Response('OK', { status: 200 })
}

type Admin = ReturnType<typeof createAdminClient>
type MPSubscription = {
  id?: string
  status?: string
  external_reference?: string
  preapproval_plan_id?: string
  auto_recurring?: { transaction_amount?: number }
}

/**
 * Negocio de una suscripción de MP. Las de antes (preapproval con payer_email) traen
 * external_reference = business.id; las que nacen del link del plan del negocio no traen nada y
 * se reconocen por el id de suscripción ya guardado o por el plan (businesses.mp_plan_id_active).
 * Las dos columnas son admin (migr. 080): el dueño no puede apuntarlas a la suscripción de otro.
 */
async function businessForSubscription(admin: Admin, sub: MPSubscription | null): Promise<string | null> {
  if (!sub) return null
  if (sub.external_reference) return sub.external_reference
  if (sub.id) {
    const { data } = await admin.from('businesses').select('id').eq('mp_subscription_id', sub.id).maybeSingle()
    if (data) return data.id
  }
  if (sub.preapproval_plan_id) {
    const { data } = await admin.from('businesses').select('id').eq('mp_plan_id_active', sub.preapproval_plan_id).maybeSingle()
    if (data) return data.id
  }
  console.error(`[subscription/webhook] suscripción ${sub.id} sin negocio (plan ${sub.preapproval_plan_id ?? '—'})`)
  return null
}

// Tier que pagó, por el monto de la suscripción. Si no coincide con ningún precio actual (un
// precio que cambió después) devuelve null y el plan del negocio no se toca.
function tierForAmount(amount: number | undefined): SubscriptionPlanKey | null {
  const hit = Object.entries(SUBSCRIPTION_PLANS).find(([, p]) => p.price_ars === amount)
  return hit ? (hit[0] as SubscriptionPlanKey) : null
}

async function processWebhook(type: string, dataId?: string) {
  if (!dataId) return
  const admin = createAdminClient()

  // ── Cobro de una suscripción (topic subscription_authorized_payment) ─────
  // Va ANTES del caso `payment`: el tipo también contiene "payment", pero su id es de
  // /authorized_payments, no de /v1/payments. Es el único aviso de cobro que traen las
  // suscripciones del plan (sus pagos no llevan external_reference).
  if (type.includes('authorized_payment')) {
    const ap = await mpFetch(`/authorized_payments/${dataId}`)
    if (!ap?.preapproval_id) return
    const sub = await mpFetch(`/preapproval/${ap.preapproval_id}`)
    const businessId = await businessForSubscription(admin, sub)
    const status = ap.payment?.status ?? ap.status
    if (businessId && status) await applyPayment(admin, businessId, status, ap.transaction_amount)
    return
  }

  // ── Subscription status changes ──────────────────────────────────────────
  if (type.includes('subscription_preapproval') || type === 'preapproval') {
    const sub: MPSubscription = await mpFetch(`/preapproval/${dataId}`)
    const businessId = await businessForSubscription(admin, sub)
    if (!businessId) return

    if (sub.status === 'authorized') {
      // El tier sale de lo que MP confirma que se cobra, no de lo que eligió el cliente en el modal.
      const tier = tierForAmount(sub.auto_recurring?.transaction_amount)
      await admin.from('businesses').update({
        plan_status: 'active',
        mp_subscription_id: sub.id,
        subscription_ends_at: nextRenewal(),
        ...(tier && { plan: tier }),
      }).eq('id', businessId)
      console.log(`✅ Suscripción autorizada — negocio ${businessId} (${tier ?? 'tier sin cambio'})`)
    } else if (sub.status === 'cancelled' || sub.status === 'paused') {
      await admin.from('businesses').update({ plan_status: 'cancelled' }).eq('id', businessId)
      console.log(`⚠️ Suscripción ${sub.status} — negocio ${businessId}`)
    }
    return
  }

  // ── Pago suelto (topic payment) ──────────────────────────────────────────
  // Las suscripciones de antes lo traen con external_reference; las del plan se procesan arriba
  // por authorized_payment.
  if (type.includes('payment')) {
    const payment = await mpFetch(`/v1/payments/${dataId}`)
    const businessId = payment.external_reference
    if (businessId && payment.status) await applyPayment(admin, businessId, payment.status, payment.transaction_amount)
  }
}

/** Cobro mensual: aprobado → renueva; reverso → cancela; rechazado + gracia vencida → expired. */
async function applyPayment(admin: Admin, businessId: string, status: string, amount: number | undefined) {
  if (status === 'approved') {
    await admin.from('businesses').update({
      plan_status: 'active',
      subscription_ends_at: nextRenewal(),
    }).eq('id', businessId)
    console.log(`💳 Cobro mensual aprobado — negocio ${businessId} ($${amount})`)
  } else if (['refunded', 'charged_back', 'cancelled'].includes(status)) {
    // Definitive money-returned / disputed events: cancel the linked preapproval
    // at MP so it stops charging, and drop the plan. The refund/chargeback is
    // itself the MP-confirmed change, so lowering plan_status is not optimistic.
    const { data: biz } = await admin
      .from('businesses')
      .select('mp_subscription_id')
      .eq('id', businessId)
      .single()
    if (biz?.mp_subscription_id) {
      // mpFetch uses the platform token per MP_MODE.
      const result = await mpFetch(`/preapproval/${biz.mp_subscription_id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'cancelled' }),
      })
      if (result?.status !== 'cancelled') {
        console.error(`⚠️ No se pudo cancelar la preapproval ${biz.mp_subscription_id}:`, JSON.stringify(result))
      }
    }
    await admin.from('businesses').update({ plan_status: 'cancelled' }).eq('id', businessId)
    console.log(`↩️ Pago ${status} — suscripción cancelada para negocio ${businessId}`)
  } else if (status === 'rejected') {
    // Soft decline: expire only if grace period already elapsed (proxy for repeated failures)
    const { data: biz } = await admin
      .from('businesses')
      .select('subscription_ends_at')
      .eq('id', businessId)
      .single()
    const expired = biz?.subscription_ends_at && new Date(biz.subscription_ends_at) < new Date()
    if (expired) {
      await admin.from('businesses').update({ plan_status: 'expired' }).eq('id', businessId)
      console.log(`❌ Pago fallido fuera de período de gracia — negocio ${businessId} expirado`)
    } else {
      console.log(`⚠️ Pago fallido pero dentro del período de gracia — negocio ${businessId}`)
    }
  }
}
