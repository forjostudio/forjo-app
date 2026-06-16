import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mpFetch, verifyMPSignature } from '@/lib/mercadopago'
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

async function processWebhook(type: string, dataId?: string) {
  if (!dataId) return
  const admin = createAdminClient()

  // ── Subscription status changes ──────────────────────────────────────────
  if (type.includes('subscription_preapproval') || type === 'preapproval') {
    const sub = await mpFetch(`/preapproval/${dataId}`)
    const businessId = sub.external_reference
    if (!businessId) return

    if (sub.status === 'authorized') {
      await admin.from('businesses').update({
        plan_status: 'active',
        mp_subscription_id: sub.id,
        subscription_ends_at: nextRenewal(),
      }).eq('id', businessId)
      console.log(`✅ Suscripción autorizada — negocio ${businessId}`)
    } else if (sub.status === 'cancelled' || sub.status === 'paused') {
      await admin.from('businesses').update({ plan_status: 'cancelled' }).eq('id', businessId)
      console.log(`⚠️ Suscripción ${sub.status} — negocio ${businessId}`)
    }
    return
  }

  // ── Monthly payment events ───────────────────────────────────────────────
  if (type.includes('payment')) {
    const payment = await mpFetch(`/v1/payments/${dataId}`)
    const businessId = payment.external_reference
    if (!businessId) return

    if (payment.status === 'approved') {
      await admin.from('businesses').update({
        plan_status: 'active',
        subscription_ends_at: nextRenewal(),
      }).eq('id', businessId)
      console.log(`💳 Cobro mensual aprobado — negocio ${businessId} ($${payment.transaction_amount})`)
    } else if (['refunded', 'charged_back', 'cancelled'].includes(payment.status)) {
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
      console.log(`↩️ Pago ${payment.status} — suscripción cancelada para negocio ${businessId}`)
    } else if (payment.status === 'rejected') {
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
}
