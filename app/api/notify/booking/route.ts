import { createAdminClient } from '@/lib/supabase/admin'
import { sendConfirmationEmail, sendAdminNotification } from '@/lib/email'

export async function POST(request: Request) {
  try {
    const { appointmentId } = await request.json()
    if (!appointmentId) {
      return Response.json({ ok: false }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: appt } = await supabase
      .from('appointments')
      .select('*, services(name, price), businesses(*)')
      .eq('id', appointmentId)
      .eq('status', 'confirmed')
      .single()

    if (!appt) return Response.json({ ok: false })

    const business = appt.businesses as Record<string, string | null | boolean | number> | null
    if (!business) return Response.json({ ok: false })

    const serviceName = (appt.services as { name?: string; price?: number } | null)?.name || ''
    const servicePrice = Number((appt.services as { name?: string; price?: number } | null)?.price || 0)

    const resendKey = business.resend_api_key as string | null
    const resendFrom = business.resend_from as string | null

    // Email al cliente: AWAIT. En serverless, sin await el fetch a Resend se corta al
    // hacer return. Si falla, se logea el motivo real y se persiste el flag (no se traga).
    let emailSent = false
    let emailError: string | null = null
    if (appt.client_email) {
      try {
        await sendConfirmationEmail({
          to: appt.client_email,
          clientName: appt.client_name,
          service: serviceName,
          price: servicePrice,
          deposit: 0,
          date: appt.date,
          time: appt.time,
          businessName: String(business.name || ''),
          businessSlug: String(business.slug || ''),
          primaryColor: business.primary_color as string | null,
          logoUrl: business.logo_url as string | null,
          whatsapp: business.whatsapp as string | null,
          cancelToken: appt.cancel_token as string | null,
          resendApiKey: resendKey,
          resendFrom,
        })
        emailSent = true
      } catch (e) {
        emailError = e instanceof Error ? e.message : String(e)
        console.error(`[email] confirmación cliente FALLÓ (turno ${appointmentId}):`, emailError)
      }
      // Flag en el turno para detectar fallos (sin reintentos). Filtra por id.
      await supabase
        .from('appointments')
        .update({ email_sent: emailSent, email_error: emailError })
        .eq('id', appointmentId)
    }

    // Notificación al dueño: best-effort, no afecta el flag del cliente.
    const notifEmail = business.notification_email as string | null
    if (notifEmail) {
      try {
        await sendAdminNotification({
          to: notifEmail,
          clientName: appt.client_name,
          clientPhone: appt.client_phone,
          clientEmail: appt.client_email,
          service: serviceName,
          price: servicePrice,
          deposit: 0,
          date: appt.date,
          time: appt.time,
          businessName: String(business.name || ''),
          logoUrl: business.logo_url as string | null,
          resendApiKey: resendKey,
          resendFrom,
        })
      } catch (e) {
        console.error(`[email] notif admin FALLÓ (turno ${appointmentId}):`, e instanceof Error ? e.message : e)
      }
    }

    // ok = la request se procesó; email_sent refleja la verdad (sin falso éxito).
    return Response.json({ ok: true, email_sent: emailSent })
  } catch (e) {
    console.error('Notify error:', e)
    return Response.json({ ok: false }, { status: 500 })
  }
}
