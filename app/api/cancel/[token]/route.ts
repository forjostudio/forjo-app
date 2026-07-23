import { createAdminClient } from '@/lib/supabase/admin'
import { getBusinessSecrets } from '@/lib/business-secrets'
import { sendClientCancelEmail, sendAdminNotification, emailBrandInputs } from '@/lib/email'
import { deleteCalendarEvent } from '@/lib/google-calendar'
import type { NextRequest } from 'next/server'

// Cancelación pública por TOKEN (no por id). El token impredecible resuelve el turno y su
// negocio → no confiamos en ningún parámetro del cliente para el aislamiento por tenant.
// service role es server-only (este route handler). RLS no aplica acá, así que el filtro
// por cancel_token (+ id) es la única autorización.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token) return Response.json({ ok: false, reason: 'invalid' }, { status: 400 })

  const supabase = createAdminClient()

  // Pitfall E: el nested join businesses(...) NO puede traer business_secrets (no hay FK
  // embebible desde appointments hacia esa tabla). El join queda con columnas NO secretas; los
  // secretos (resend_*, google_refresh_token) se obtienen con un fetch separado a business_secrets.
  const { data: appt } = await supabase
    .from('appointments')
    .select('id, date, time, status, client_name, client_phone, client_email, deposit_amount, google_event_id, services(name, price), businesses(id, name, slug, palette, theme, font, landing_config, logo_url, notification_email)')
    .eq('cancel_token', token)
    .single()

  // Sin token válido → no se cancela nada (ni se revela si existe).
  if (!appt) return Response.json({ ok: false, reason: 'not_found' }, { status: 404 })

  if (appt.status === 'cancelled') {
    return Response.json({ ok: false, reason: 'already_cancelled' })
  }

  const todayStr = new Date().toISOString().slice(0, 10)
  if (appt.date < todayStr) {
    return Response.json({ ok: false, reason: 'past' })
  }

  // Política: solo se puede cancelar/reprogramar hasta 24 h antes del turno. Enforcement
  // server-side (no bypasseable). El turno se guarda en hora local AR (UTC-3, sin DST).
  const apptMs = new Date(`${appt.date}T${String(appt.time).slice(0, 5)}:00-03:00`).getTime()
  if (apptMs - Date.now() < 24 * 60 * 60 * 1000) {
    return Response.json({ ok: false, reason: 'too_late' })
  }

  // Cancelar = status 'cancelled' → libera el horario (la disponibilidad excluye cancelled).
  const { error } = await supabase
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('id', appt.id)
    .eq('cancel_token', token)

  if (error) {
    console.error(`[cancel] error cancelando turno ${appt.id}:`, error.message)
    return Response.json({ ok: false, reason: 'error' }, { status: 500 })
  }

  console.log(`[cancel] turno ${appt.id} cancelado vía token`)

  // Email "cancelado por el cliente": AWAIT (en serverless, sin await el fetch a Resend se
  // corta al hacer return). El branding/remitente sale del propio negocio del turno
  // (aislamiento por tenant: no se confía en ningún input del cliente). Best-effort: si
  // falla, se logea el motivo real y NO se rompe la cancelación, que ya está confirmada.
  const business = appt.businesses as { id?: string; name?: string; slug?: string; palette?: string | null; theme?: string | null; font?: string | null; landing_config?: unknown; logo_url?: string | null; notification_email?: string | null } | null
  // Branding del mail desde la misma fuente de verdad que la página pública (paleta/override del
  // landing + fuente). Con business null los send* no corren (guardados abajo); {} cae al default.
  const brand = emailBrandInputs(business ?? {})

  // Secretos por tenant desde business_secrets (Pitfall E: no venían en el join). Fallback a
  // businesses durante la transición 027→028 lo provee getBusinessSecrets.
  const secrets = business?.id ? await getBusinessSecrets(business.id) : null

  // Google Calendar: si el turno tenía evento, lo borramos del calendario del dueño.
  if (secrets?.google_refresh_token && appt.google_event_id) {
    try {
      await deleteCalendarEvent(secrets.google_refresh_token, appt.google_event_id)
    } catch (e) {
      console.error(`[cancel] gcal borrar evento FALLÓ (turno ${appt.id}):`, e instanceof Error ? e.message : e)
    }
  }
  if (appt.client_email && business) {
    try {
      await sendClientCancelEmail({
        to: appt.client_email,
        clientName: appt.client_name,
        service: (appt.services as { name?: string } | null)?.name || '',
        date: appt.date,
        time: appt.time,
        businessName: business.name || '',
        businessSlug: business.slug || '',
        theme: brand.theme,
        palette: brand.palette,
        font: brand.font,
        primaryOverride: brand.primaryOverride,
        logoUrl: business.logo_url,
        resendApiKey: secrets?.resend_api_key,
        resendFrom: secrets?.resend_from,
      })
    } catch (e) {
      console.error(`[cancel] email cliente FALLÓ (turno ${appt.id}):`, e instanceof Error ? e.message : e)
    }
  }

  // Aviso al DUEÑO: el cliente canceló su turno por el link público. Best-effort, solo si
  // tiene configurado el email de notificaciones.
  if (business?.notification_email) {
    try {
      await sendAdminNotification({
        to: business.notification_email,
        clientName: appt.client_name,
        clientPhone: appt.client_phone,
        clientEmail: appt.client_email,
        service: (appt.services as { name?: string } | null)?.name || '',
        price: Number((appt.services as { price?: number } | null)?.price || 0),
        deposit: Number(appt.deposit_amount || 0),
        date: appt.date,
        time: appt.time,
        businessName: business.name || '',
        theme: brand.theme,
        palette: brand.palette,
        font: brand.font,
        primaryOverride: brand.primaryOverride,
        logoUrl: business.logo_url,
        resendApiKey: secrets?.resend_api_key,
        resendFrom: secrets?.resend_from,
        cancelled: true,
      })
    } catch (e) {
      console.error(`[cancel] aviso al dueño FALLÓ (turno ${appt.id}):`, e instanceof Error ? e.message : e)
    }
  }

  return Response.json({ ok: true })
}
