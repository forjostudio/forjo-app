import { createAdminClient } from '@/lib/supabase/admin'
import { sendClientCancelEmail } from '@/lib/email'
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

  const { data: appt } = await supabase
    .from('appointments')
    .select('id, date, time, status, client_name, client_email, google_event_id, services(name), businesses(name, slug, primary_color, logo_url, resend_api_key, resend_from, google_refresh_token)')
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
  const business = appt.businesses as { name?: string; slug?: string; primary_color?: string | null; logo_url?: string | null; resend_api_key?: string | null; resend_from?: string | null; google_refresh_token?: string | null } | null

  // Google Calendar: si el turno tenía evento, lo borramos del calendario del dueño.
  if (business?.google_refresh_token && appt.google_event_id) {
    try {
      await deleteCalendarEvent(business.google_refresh_token, appt.google_event_id)
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
        primaryColor: business.primary_color,
        logoUrl: business.logo_url,
        resendApiKey: business.resend_api_key,
        resendFrom: business.resend_from,
      })
    } catch (e) {
      console.error(`[cancel] email cliente FALLÓ (turno ${appt.id}):`, e instanceof Error ? e.message : e)
    }
  }

  return Response.json({ ok: true })
}
