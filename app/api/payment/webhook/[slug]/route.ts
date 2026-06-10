import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendConfirmationEmail, sendAdminNotification } from '@/lib/email'
import { createCalendarEvent, deleteCalendarEvent } from '@/lib/google-calendar'
import { getValidMpAccessToken } from '@/lib/payment'
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

  // Token válido (refresca el de OAuth si está por vencer; el manual pasa de largo).
  const mpToken = await getValidMpAccessToken(business)

  const mpRes = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${mpToken}` },
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
    // Idempotencia: solo procesamos el pago cuando el turno está ESPERÁNDOLO
    // (pending_payment). Si ya está confirmed/completed/cancelled, el pago ya se procesó o
    // el turno terminó/se canceló. MP puede re-disparar el webhook con 'approved' tiempo
    // después (ej. liberación de la seña a los ~15 días): NO hay que re-confirmar ni
    // reenviar el mail de un turno ya procesado o ya pasado. (Antes solo se filtraba
    // 'confirmed' → un turno 'completed' que ya pasó disparaba un mail duplicado.)
    if (appt.status !== 'pending_payment') {
      console.log(`Turno #${appointmentId} en estado '${appt.status}' (no pending_payment): webhook 'approved' ignorado`)
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

    // Estamos dentro de after() → el 200 a MP ya se envió. Acá AWAIT: sin await el fetch
    // a Resend se corta cuando la función se congela. Si falla, se logea y se persiste flag.
    if (appt.client_email) {
      let emailSent = false
      let emailError: string | null = null
      try {
        await sendConfirmationEmail({
          to: appt.client_email,
          clientName: appt.client_name,
          service: serviceName,
          price: servicePrice,
          deposit: depositAmt,
          date: appt.date,
          time: appt.time,
          businessName: business.name,
          businessSlug: slug,
          primaryColor: business.primary_color,
          logoUrl: business.logo_url,
          whatsapp: business.whatsapp,
          cancelToken: appt.cancel_token,
          resendApiKey: business.resend_api_key,
          resendFrom: business.resend_from,
        })
        emailSent = true
      } catch (e) {
        emailError = e instanceof Error ? e.message : String(e)
        console.error(`[email] confirmación cliente FALLÓ (turno ${appointmentId}):`, emailError)
      }
      await supabase
        .from('appointments')
        .update({ email_sent: emailSent, email_error: emailError })
        .eq('id', appointmentId)
    }

    if (business.notification_email) {
      try {
        await sendAdminNotification({
          to: business.notification_email,
          clientName: appt.client_name,
          clientPhone: appt.client_phone,
          clientEmail: appt.client_email,
          service: serviceName,
          price: servicePrice,
          deposit: depositAmt,
          date: appt.date,
          time: appt.time,
          businessName: business.name,
          resendApiKey: business.resend_api_key,
          resendFrom: business.resend_from,
          pending: false,
        })
      } catch (e) {
        console.error(`[email] notif admin FALLÓ (turno ${appointmentId}):`, e instanceof Error ? e.message : e)
      }
    }

    // Google Calendar: turno confirmado por seña → crear el evento en el calendario del dueño.
    if (business.google_refresh_token) {
      try {
        const eventId = await createCalendarEvent(business.google_refresh_token, {
          summary: `${serviceName || 'Turno'} · ${appt.client_name}`,
          description: [`Cliente: ${appt.client_name}`, appt.client_phone ? `Tel: ${appt.client_phone}` : '', appt.client_email ? `Email: ${appt.client_email}` : '', appt.notes ? `Notas: ${appt.notes}` : '', 'Reserva vía Forjo'].filter(Boolean).join('\n'),
          location: business.address || undefined,
          date: appt.date,
          time: appt.time,
          durationMinutes: Number(appt.duration_minutes || 30),
        })
        if (eventId) await supabase.from('appointments').update({ google_event_id: eventId }).eq('id', appointmentId)
      } catch (e) {
        console.error(`[gcal] evento FALLÓ (turno ${appointmentId}):`, e instanceof Error ? e.message : e)
      }
    }
  } else if (['rejected', 'cancelled', 'refunded', 'charged_back'].includes(payment.status)) {
    // Solo cancelamos turnos que TODAVÍA no pasaron (pending_payment o confirmed). Si el
    // turno ya está 'completed', NO lo pisamos: el servicio se prestó. Un contracargo tardío
    // (charged_back semanas después) no debe convertir un turno realizado en cancelado y
    // ensuciar el historial/stats. El filtro por estado lo hace en el WHERE.
    const { data: cancelledRows } = await supabase
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('id', appointmentId)
      .in('status', ['pending_payment', 'confirmed'])
      .select('id')

    if (cancelledRows && cancelledRows.length > 0) {
      console.log(`❌ Pago ${payment.status} — turno ${appointmentId} cancelado`)
      // Si ya había evento en Google Calendar (turno antes confirmado), lo borramos.
      if (business.google_refresh_token && appt.google_event_id) {
        try { await deleteCalendarEvent(business.google_refresh_token, appt.google_event_id) } catch (e) { console.error('[gcal] borrar evento:', e instanceof Error ? e.message : e) }
      }
    } else {
      console.log(`Pago ${payment.status} — turno ${appointmentId} ya pasó/no estaba activo, no se toca (estado: ${appt.status})`)
    }
  }
}
