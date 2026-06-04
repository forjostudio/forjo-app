import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendConfirmationEmail, sendAdminNotification } from '@/lib/email'
import type { NextRequest } from 'next/server'

const MP_API = 'https://api.mercadopago.com'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  let body: { type?: string; data?: { id?: string } }
  try {
    body = await request.json()
  } catch {
    return new Response('OK', { status: 200 })
  }

  if (body.type !== 'payment' || !body.data?.id) {
    return new Response('OK', { status: 200 })
  }

  const { slug } = await params
  const paymentId = String(body.data.id)

  // Respond 200 immediately so MP doesn't retry, then process async
  after(async () => {
    try {
      await processWebhook(slug, paymentId)
    } catch (e) {
      console.error('Webhook processing error:', e)
    }
  })

  return new Response('OK', { status: 200 })
}

async function processWebhook(slug: string, paymentId: string) {
  const supabase = createAdminClient()

  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('slug', slug)
    .single()

  if (!business?.mp_access_token) {
    console.log(`Webhook: negocio ${slug} sin MP token`)
    return
  }

  const mpRes = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${business.mp_access_token}` },
  })
  const payment = await mpRes.json()

  const appointmentId = payment.external_reference
  if (!appointmentId) {
    console.log('Webhook: payment sin external_reference', paymentId)
    return
  }

  const { data: appt } = await supabase
    .from('appointments')
    .select('*, services(name, price)')
    .eq('id', appointmentId)
    .single()

  if (!appt) {
    console.log('Webhook: turno no encontrado', appointmentId)
    return
  }

  if (payment.status === 'approved') {
    if (appt.status === 'confirmed') {
      console.log(`Turno #${appointmentId} ya confirmado, ignorando webhook`)
      return
    }

    await supabase
      .from('appointments')
      .update({
        status: 'confirmed',
        deposit_paid: true,
        mp_payment_id: paymentId,
        payment_status: 'paid',
      })
      .eq('id', appointmentId)

    console.log(`✅ Pago aprobado — turno ${appointmentId}`)

    const serviceName = (appt.services as { name?: string; price?: number } | null)?.name || ''
    const servicePrice = Number((appt.services as { name?: string; price?: number } | null)?.price || 0)
    const depositAmt = Number(appt.deposit_amount || 0)

    if (appt.client_email) {
      sendConfirmationEmail({
        to: appt.client_email,
        clientName: appt.client_name,
        service: serviceName,
        price: servicePrice,
        deposit: depositAmt,
        date: appt.date,
        time: appt.time,
        businessName: business.name,
        businessSlug: slug,
        resendApiKey: business.resend_api_key,
      }).catch(e => console.error('Email cliente error:', e))
    }

    if (business.notification_email) {
      sendAdminNotification({
        to: business.notification_email,
        clientName: appt.client_name,
        clientPhone: appt.client_phone,
        clientEmail: appt.client_email,
        service: serviceName,
        price: servicePrice,
        deposit: depositAmt,
        date: appt.date,
        time: appt.time,
        resendApiKey: business.resend_api_key,
        pending: false,
      }).catch(e => console.error('Admin notification error:', e))
    }
  } else if (['rejected', 'cancelled', 'refunded', 'charged_back'].includes(payment.status)) {
    await supabase
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', appointmentId)

    console.log(`❌ Pago ${payment.status} — turno ${appointmentId} cancelado`)
  }
}
