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

    if (appt.client_email) {
      sendConfirmationEmail({
        to: appt.client_email,
        clientName: appt.client_name,
        service: serviceName,
        price: servicePrice,
        deposit: 0,
        date: appt.date,
        time: appt.time,
        businessName: String(business.name || ''),
        businessSlug: String(business.slug || ''),
        resendApiKey: business.resend_api_key as string | null,
      }).catch(e => console.error('Email cliente error:', e))
    }

    const notifEmail = business.notification_email as string | null
    if (notifEmail) {
      sendAdminNotification({
        to: notifEmail,
        clientName: appt.client_name,
        clientPhone: appt.client_phone,
        clientEmail: appt.client_email,
        service: serviceName,
        price: servicePrice,
        deposit: 0,
        date: appt.date,
        time: appt.time,
        resendApiKey: business.resend_api_key as string | null,
      }).catch(e => console.error('Admin notification error:', e))
    }

    return Response.json({ ok: true })
  } catch (e) {
    console.error('Notify error:', e)
    return Response.json({ ok: false }, { status: 500 })
  }
}
