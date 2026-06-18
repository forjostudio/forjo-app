import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBusinessSecrets } from '@/lib/business-secrets'
import { deleteCalendarEvent } from '@/lib/google-calendar'
import { sendBusinessCancelEmail } from '@/lib/email'

// Cancela un turno desde el panel y avisa al cliente por email ("cancelado por el negocio").
// El endpoint es la ÚNICA autoridad del flujo: valida sesión + ownership, CANCELA él mismo
// el turno y RECIÉN envía el mail, en ese orden. Hace la cancelación acá (no la delega al
// cliente) para NO depender de re-leer un status recién escrito por el browser: eso era una
// carrera (el POST podía llegar antes de que el update se reflejara, o el update quedaba en
// 0 filas por RLS) y devolvía 200 sin enviar nada. El email se awaitea (en serverless, sin
// await el fetch a Resend se corta al hacer return). El resultado real del envío va en el
// body (email_sent + reason/email_error) y se logea server-side: el 200 ya no miente.
export async function POST(request: Request) {
  try {
    const { appointmentId } = await request.json()
    if (!appointmentId) {
      return Response.json({ ok: false, error: 'missing_appointment_id' }, { status: 400 })
    }

    // Auth + ownership: solo el dueño del negocio dueño del turno puede cancelar/avisar.
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

    // Traemos el turno por id, SIN filtrar por status (el endpoint no depende de que ya esté
    // cancelado). businesses → solo columnas NO secretas: los secretos Resend viven en
    // business_secrets (D-02) y se traen aparte vía getBusinessSecrets, no por el join.
    // maybeSingle() distingue "no hay fila" (null sin error) de un error de query real (que se
    // logea y devuelve 500, no un 404 mentiroso).
    const { data: appt, error: apptErr } = await supabase
      .from('appointments')
      .select('*, services(name), businesses(id, name, slug, primary_color, logo_url, whatsapp)')
      .eq('id', appointmentId)
      .maybeSingle()

    if (apptErr) {
      console.error(`[notify/cancel] error leyendo turno ${appointmentId}:`, apptErr.message)
      return Response.json({ ok: false, error: 'query_failed', detail: apptErr.message }, { status: 500 })
    }
    if (!appt) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })

    // Defensa en profundidad: además de la sesión, el turno debe pertenecer al negocio del
    // dueño logueado o no se toca ni se envía nada (403).
    if (appt.business_id !== ownedBusiness.id) {
      return Response.json({ ok: false, error: 'No autorizado' }, { status: 403 })
    }

    // Cancelación en el mismo flujo, idempotente: si ya estaba cancelado no reescribimos.
    // Filtramos por id + business_id (aislamiento por tenant aunque sea service role).
    if (appt.status !== 'cancelled') {
      const { error: cancelErr } = await supabase
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('id', appt.id)
        .eq('business_id', ownedBusiness.id)
      if (cancelErr) {
        console.error(`[notify/cancel] no se pudo cancelar turno ${appointmentId}:`, cancelErr.message)
        return Response.json({ ok: false, error: 'cancel_failed' }, { status: 500 })
      }

      // Consistencia con el cancel público (cancel/[token]): al cancelar también borramos el
      // evento de Google Calendar. Best-effort en after() (no demora la respuesta ni rompe la
      // cancelación, que ya está confirmada). 404/410 dentro de deleteCalendarEvent = éxito.
      if (appt.google_event_id) {
        after(async () => {
          const s = await getBusinessSecrets(appt.business_id as string)
          if (!s.google_refresh_token) return
          try {
            await deleteCalendarEvent(s.google_refresh_token, appt.google_event_id as string)
          } catch (e) {
            console.error(`[notify/cancel] gcal borrar evento FALLÓ (turno ${appointmentId}):`, e instanceof Error ? e.message : e)
          }
        })
      }
    }

    const business = appt.businesses as unknown as Record<string, string | null | boolean | number> | null
    if (!business) {
      return Response.json({ ok: true, cancelled: true, email_sent: false, reason: 'no_business_data' })
    }

    // Sin email del cliente no hay a quién avisar: cancelado igual, email no enviado.
    if (!appt.client_email) {
      return Response.json({ ok: true, cancelled: true, email_sent: false, reason: 'no_client_email' })
    }

    // Secretos Resend por tenant desde business_secrets (vía getBusinessSecrets, service-role).
    const secrets = await getBusinessSecrets(appt.business_id as string)

    // Envío del mail: el resultado real va en el body. Si Resend falla, queda
    // email_sent:false con el motivo (reason 'send_failed' + email_error) y se logea.
    let emailSent = false
    let emailError: string | null = null
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
        resendApiKey: secrets.resend_api_key,
        resendFrom: secrets.resend_from,
      })
      emailSent = true
    } catch (e) {
      emailError = e instanceof Error ? e.message : String(e)
      console.error(`[notify/cancel] email negocio FALLÓ (turno ${appointmentId}):`, emailError)
    }

    return Response.json({
      ok: true,
      cancelled: true,
      email_sent: emailSent,
      reason: emailSent ? 'sent' : 'send_failed',
      email_error: emailError,
    })
  } catch (e) {
    console.error('Notify cancel error:', e)
    return Response.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
