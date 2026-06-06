import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendBusinessCancelEmail } from '@/lib/email'

// Notifica al cliente que EL NEGOCIO canceló su turno desde el panel de administración.
// La cancelación en sí la hace el panel (update a status='cancelled', con RLS). Este
// endpoint solo dispara el email server-side y awaiteado, mismo patrón que notify/booking
// (sin await, el fetch a Resend se corta al hacer return en serverless).
export async function POST(request: Request) {
  try {
    const { appointmentId } = await request.json()
    if (!appointmentId) {
      return Response.json({ ok: false }, { status: 400 })
    }

    // Auth + ownership: solo el dueño del negocio dueño del turno puede disparar el aviso.
    // Sesión vía cliente que respeta RLS (mismo patrón que el resto del dashboard).
    const ssr = await createClient()
    const { data: { user } } = await ssr.auth.getUser()
    if (!user) return Response.json({ ok: false, error: 'No autenticado' }, { status: 401 })

    const { data: ownedBusiness } = await ssr
      .from('businesses')
      .select('id')
      .eq('owner_id', user.id)
      .single()
    if (!ownedBusiness) return Response.json({ ok: false, error: 'Sin negocio' }, { status: 403 })

    const supabase = createAdminClient()

    // Solo mandamos si el turno está efectivamente cancelado. El branding/remitente y la
    // info de seña salen del propio negocio del turno → aislamiento por tenant.
    const { data: appt } = await supabase
      .from('appointments')
      .select('id, business_id, date, time, client_name, client_email, deposit_paid, deposit_amount, services(name), businesses(name, slug, primary_color, logo_url, whatsapp, resend_api_key, resend_from)')
      .eq('id', appointmentId)
      .eq('status', 'cancelled')
      .single()

    if (!appt) return Response.json({ ok: false })

    // Defensa en profundidad: además de la sesión, filtro explícito por tenant. El turno
    // debe pertenecer al negocio del dueño logueado o no se envía nada (403).
    if (appt.business_id !== ownedBusiness.id) {
      return Response.json({ ok: false, error: 'No autorizado' }, { status: 403 })
    }

    const business = appt.businesses as unknown as Record<string, string | null | boolean | number> | null
    if (!business) return Response.json({ ok: false })

    if (!appt.client_email) return Response.json({ ok: true, email_sent: false })

    let emailSent = false
    try {
      await sendBusinessCancelEmail({
        to: appt.client_email,
        clientName: appt.client_name,
        service: (appt.services as { name?: string } | null)?.name || '',
        date: appt.date,
        time: appt.time,
        businessName: String(business.name || ''),
        businessSlug: String(business.slug || ''),
        primaryColor: business.primary_color as string | null,
        logoUrl: business.logo_url as string | null,
        whatsapp: business.whatsapp as string | null,
        depositPaid: appt.deposit_paid as boolean,
        depositAmount: Number(appt.deposit_amount || 0),
        resendApiKey: business.resend_api_key as string | null,
        resendFrom: business.resend_from as string | null,
      })
      emailSent = true
    } catch (e) {
      console.error(`[notify/cancel] email negocio FALLÓ (turno ${appointmentId}):`, e instanceof Error ? e.message : e)
    }

    return Response.json({ ok: true, email_sent: emailSent })
  } catch (e) {
    console.error('Notify cancel error:', e)
    return Response.json({ ok: false }, { status: 500 })
  }
}
