import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendConfirmationEmail, sendAdminNotification } from '@/lib/email'
import { createCalendarEvent, deleteCalendarEvent } from '@/lib/google-calendar'
import { getValidMpAccessToken } from '@/lib/payment'
import { getBusinessSecrets } from '@/lib/business-secrets'
import { verifyMPSignature } from '@/lib/mercadopago'
import type { NextRequest } from 'next/server'

const MP_API = 'https://api.mercadopago.com'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  // data.id para el manifest de la firma sale del QUERY STRING primero (MP lo manda ahí en las
  // notificaciones), con fallback al body. Llamar verifyMPSignature solo con body.data.id haría
  // fallar TODA llamada real de MP → fail-closed → los deposits dejarían de confirmarse (Pitfall 1).
  // searchParams es síncrono vía request.nextUrl; el slug (params) sigue siendo Promise y se await abajo.
  const dataIdQuery = request.nextUrl.searchParams.get('data.id') ?? request.nextUrl.searchParams.get('id')

  let body: { type?: string; data?: { id?: string } }
  try {
    body = await request.json()
  } catch {
    return new Response('OK', { status: 200 })
  }

  // Verificar la firma PRIMERO, antes de confiar en el body o hacer cualquier trabajo (igual que el
  // webhook de suscripción): un POST forjado con type:'payment'/status:'approved' recibe 401 y NUNCA
  // dispara el after(). El verificador ya es fail-closed (secreto ausente → false → 401), por eso acá
  // no hay lógica de "if secret" (no fail-open, D-04).
  if (!verifyMPSignature(request, dataIdQuery ?? body.data?.id)) {
    return new Response('Invalid signature', { status: 401 })
  }

  // Recién con la firma validada aplican los guards de negocio: type != payment o data.id ausente → 200
  // (no es un evento que nos interese; preservamos el comportamiento previo, no es un rechazo de firma).
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

  // Columnas NO secretas explícitas (en vez del viejo select-estrella): así un drop de columna se
  // nota en vez de devolver undefined silencioso y dejar de confirmar turnos pagados (D-03 / T-01-05).
  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, slug, primary_color, logo_url, whatsapp, address, notification_email')
    .eq('slug', slug)
    .single()

  if (!business) {
    console.log(`Webhook: negocio ${slug} no encontrado`)
    return
  }

  // Secretos del tenant desde business_secrets (vía getBusinessSecrets, service-role).
  const secrets = await getBusinessSecrets(business.id)

  // El guard corta solo si el negocio realmente no tiene MP configurado, no por un cambio de
  // esquema: lee secrets.mp_access_token, no un business.* de una lectura sin columnas (D-03).
  if (!secrets.mp_access_token) {
    console.log(`Webhook: negocio ${slug} sin MP token`)
    return
  }

  // Token válido (refresca el de OAuth si está por vencer; el manual pasa de largo).
  // Construimos el shape MpTokenBusiness con el id del negocio + los mp_* de business_secrets.
  const mpToken = await getValidMpAccessToken({
    id: business.id,
    mp_access_token: secrets.mp_access_token,
    mp_refresh_token: secrets.mp_refresh_token,
    mp_token_expires_at: secrets.mp_token_expires_at,
  })

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
          resendApiKey: secrets.resend_api_key,
          resendFrom: secrets.resend_from,
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
          logoUrl: business.logo_url,
          resendApiKey: secrets.resend_api_key,
          resendFrom: secrets.resend_from,
          pending: false,
        })
      } catch (e) {
        console.error(`[email] notif admin FALLÓ (turno ${appointmentId}):`, e instanceof Error ? e.message : e)
      }
    }

    // Google Calendar: turno confirmado por seña → crear el evento en el calendario del dueño.
    if (secrets.google_refresh_token) {
      try {
        const eventId = await createCalendarEvent(secrets.google_refresh_token, {
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
      if (secrets.google_refresh_token && appt.google_event_id) {
        try { await deleteCalendarEvent(secrets.google_refresh_token, appt.google_event_id) } catch (e) { console.error('[gcal] borrar evento:', e instanceof Error ? e.message : e) }
      }
    } else {
      console.log(`Pago ${payment.status} — turno ${appointmentId} ya pasó/no estaba activo, no se toca (estado: ${appt.status})`)
    }
  }
}
