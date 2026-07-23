import { createAdminClient } from '@/lib/supabase/admin'
import { getBusinessSecrets } from '@/lib/business-secrets'
import { sendConfirmationEmail, sendAdminNotification, emailBrandInputs } from '@/lib/email'

export async function POST(request: Request) {
  try {
    const { appointmentId } = await request.json()
    if (!appointmentId) {
      return Response.json({ ok: false }, { status: 400 })
    }

    const supabase = createAdminClient()

    // businesses(*) → solo columnas NO secretas: los secretos Resend viven en business_secrets
    // (D-02) y se traen aparte vía getBusinessSecrets, no por el join.
    const { data: appt } = await supabase
      .from('appointments')
      .select('*, services(name, price), businesses(id, name, slug, palette, theme, font, landing_config, logo_url, whatsapp, notification_email)')
      .eq('id', appointmentId)
      .eq('status', 'confirmed')
      .single()

    if (!appt) return Response.json({ ok: false })

    const business = appt.businesses as Record<string, string | null | boolean | number> | null
    if (!business) return Response.json({ ok: false })

    // Branding del mail desde la misma fuente de verdad que la página pública (paleta/override del
    // landing + fuente). El cast nombra la forma esperada; landing_config es jsonb (unknown).
    const brand = emailBrandInputs(business as { palette?: string | null; theme?: string | null; font?: string | null; landing_config?: unknown })

    const serviceName = (appt.services as { name?: string; price?: number } | null)?.name || ''
    const servicePrice = Number((appt.services as { name?: string; price?: number } | null)?.price || 0)

    // Secretos Resend por tenant desde business_secrets (vía getBusinessSecrets, service-role).
    const secrets = await getBusinessSecrets(appt.business_id as string)
    const resendKey = secrets.resend_api_key
    const resendFrom = secrets.resend_from

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
          theme: brand.theme,
          palette: brand.palette,
          font: brand.font,
          primaryOverride: brand.primaryOverride,
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
          theme: brand.theme,
          palette: brand.palette,
          font: brand.font,
          primaryOverride: brand.primaryOverride,
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
