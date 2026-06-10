import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyRecaptcha } from '@/lib/recaptcha'
import { sendPendingPaymentEmail, sendExpiredHoldEmail } from '@/lib/email'
import { createCalendarEvent } from '@/lib/google-calendar'

// Mismo sentinela que el índice 011 / el endpoint de disponibilidad.
const SENTINEL = '00000000-0000-0000-0000-000000000000'

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// Creación de un turno PÚBLICO server-side. Reemplaza el insert directo con anon key.
// Cierra de una: reCAPTCHA fail-closed (no bypasseable desde el cliente), validación de que
// service/professional sean del negocio (anti-tampering de tenant), re-check de disponibilidad
// y, como respaldo atómico ante la carrera, captura del 23505 del índice anti doble-booking.
// service role server-only; el negocio se resuelve por slug → aislamiento por tenant.
export async function POST(request: Request) {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ ok: false, error: 'bad_request' }, { status: 400 })
  }
  const body = (raw ?? {}) as Record<string, unknown>
  const slug = typeof body.slug === 'string' ? body.slug : ''
  const serviceId = typeof body.serviceId === 'string' ? body.serviceId : ''
  const professionalId = typeof body.professionalId === 'string' ? body.professionalId : null
  const locationId = typeof body.locationId === 'string' ? body.locationId : null
  const date = typeof body.date === 'string' ? body.date : ''
  const time = typeof body.time === 'string' ? body.time : ''
  const clientName = typeof body.clientName === 'string' ? body.clientName.trim() : ''
  const clientPhone = typeof body.clientPhone === 'string' && body.clientPhone.trim() ? body.clientPhone.trim() : null
  const clientEmail = typeof body.clientEmail === 'string' && body.clientEmail.trim() ? body.clientEmail.trim() : null
  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 1000) : null
  const recaptchaToken = typeof body.recaptchaToken === 'string' ? body.recaptchaToken : ''

  if (!slug || !serviceId || !date || !time || !clientName) {
    return Response.json({ ok: false, error: 'missing_fields' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Negocio por slug (tenant).
  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, slug, address, require_deposit, deposit_amount, deposit_expiry_hours, buffer_minutes, primary_color, logo_url, resend_api_key, resend_from, google_refresh_token')
    .eq('slug', slug)
    .single()
  if (!business) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })

  const requireDeposit = Boolean(business.require_deposit) && Number(business.deposit_amount) > 0

  // reCAPTCHA fail-closed, salvo flujo con seña (ahí el gate es el pago, igual que hoy).
  if (!requireDeposit) {
    const rc = await verifyRecaptcha({ token: recaptchaToken, slug })
    if (!rc.ok) {
      return Response.json({ ok: false, error: 'recaptcha_failed', reason: rc.reason }, { status: 403 })
    }
  }

  // Anti-tampering de tenant: el servicio debe ser de ESTE negocio y estar activo. De acá
  // sale la duración real (no se confía en nada del cliente).
  const { data: service } = await supabase
    .from('services')
    .select('id, name, active, duration_minutes, location_id')
    .eq('id', serviceId)
    .eq('business_id', business.id)
    .single()
  if (!service || service.active === false) {
    return Response.json({ ok: false, error: 'invalid_service' }, { status: 400 })
  }

  // El profesional (si se eligió) también debe ser del negocio.
  let proId: string | null = null
  if (professionalId && professionalId !== 'none') {
    const { data: pro } = await supabase
      .from('professionals')
      .select('id')
      .eq('id', professionalId)
      .eq('business_id', business.id)
      .single()
    if (!pro) return Response.json({ ok: false, error: 'invalid_professional' }, { status: 400 })
    proId = pro.id
  }

  // Re-check de disponibilidad por SOLAPAMIENTO (rango [inicio, fin), consistente con la
  // exclusion constraint 013), no solo inicio exacto. Bucket por coalesce(sentinel).
  const bucket = proId ?? SENTINEL
  const nowMs = Date.now()
  const buffer = Number(business.buffer_minutes) || 0
  const reqStart = timeToMinutes(time)
  const reqEnd = reqStart + Number(service.duration_minutes || 30)
  const { data: clashes } = await supabase
    .from('appointments')
    .select('id, status, expires_at, professional_id, time, duration_minutes')
    .eq('business_id', business.id)
    .eq('date', date)
    .in('status', ['confirmed', 'pending_payment'])

  // Buffer (descanso entre turnos): ensancha cada turno ocupado para exigir un hueco mínimo.
  const overlaps = (a: { time: string; duration_minutes: number | null }) => {
    const aStart = timeToMinutes(a.time)
    const aEnd = aStart + Number(a.duration_minutes || 30)
    return reqStart < aEnd + buffer && reqEnd > aStart - buffer
  }
  const sameBucket = (clashes || []).filter(a => (a.professional_id ?? SENTINEL) === bucket && overlaps(a))

  // ¿Ocupado de verdad? confirmed, o pending_payment cuya seña NO venció (o aún sin setear).
  const taken = sameBucket.some(a =>
    a.status === 'confirmed' || a.expires_at == null || new Date(a.expires_at as string).getTime() > nowMs
  )
  if (taken) {
    return Response.json({ ok: false, error: 'slot_taken' }, { status: 409 })
  }

  // Liberar "holds" vencidos que se solapan (pending_payment con seña expirada): la
  // disponibilidad ya los muestra libres, pero las constraints los siguen contando hasta que
  // el cron los cancele. Sin esto el slot se ve libre pero el insert choca. Los cancelamos
  // acá mismo (consistente con cancel-expired), filtrando por business_id (tenant).
  const expiredHoldIds = sameBucket
    .filter(a => a.status === 'pending_payment' && a.expires_at != null && new Date(a.expires_at as string).getTime() <= nowMs)
    .map(a => a.id)
  if (expiredHoldIds.length > 0) {
    const { data: cancelledHolds } = await supabase
      .from('appointments')
      .update({ status: 'cancelled' })
      .in('id', expiredHoldIds)
      .eq('business_id', business.id)
      .select('id, client_name, client_email, date, time, services(name)')
    // Avisar a los clientes de los holds vencidos que recién liberamos (no los agarra el cron
    // porque ya quedan cancelados). after() para no demorar la reserva en curso.
    const holds = cancelledHolds || []
    if (holds.length > 0) {
      after(async () => {
        for (const h of holds) {
          if (!h.client_email) continue
          try {
            await sendExpiredHoldEmail({
              to: h.client_email,
              clientName: h.client_name,
              service: (h.services as { name?: string } | null)?.name || '',
              date: h.date,
              time: h.time,
              businessName: String(business.name || ''),
              businessSlug: String(business.slug || ''),
              primaryColor: business.primary_color as string | null,
              logoUrl: business.logo_url as string | null,
              resendApiKey: business.resend_api_key as string | null,
              resendFrom: business.resend_from as string | null,
            })
          } catch (e) {
            console.error(`[booking/create] email hold vencido FALLÓ (turno ${h.id}):`, e instanceof Error ? e.message : e)
          }
        }
      })
    }
  }

  const initialStatus = requireDeposit ? 'pending_payment' : 'confirmed'
  // pending_payment SIEMPRE con expires_at: si la reserva se abandona antes de iniciar el
  // pago, el cron la libera. payment/create lo reescribe con su propia ventana. Sin esto, un
  // hold sin expires_at quedaría ocupando el slot para siempre (el cron solo cancela vencidos).
  const expiryHours = Number(business.deposit_expiry_hours) || 1
  const expiresAt = requireDeposit
    ? new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString()
    : null

  const { data: client } = await supabase
    .from('clients')
    .insert({ business_id: business.id, name: clientName, phone: clientPhone, email: clientEmail })
    .select('id')
    .single()

  // Insert del turno. El índice 011 es el respaldo ATÓMICO: si dos requests pasan el re-check
  // en la misma carrera, Postgres rechaza el segundo con 23505 y lo traducimos a slot_taken.
  // Consultorio: solo aceptamos un location_id que sea de ESTE negocio (aislamiento por tenant).
  let validLocationId: string | null = null
  if (locationId) {
    const { data: loc } = await supabase
      .from('locations')
      .select('id')
      .eq('id', locationId)
      .eq('business_id', business.id)
      .maybeSingle()
    validLocationId = loc ? locationId : null
  }
  // Fallback al consultorio del servicio (ya validado como del negocio por el select de arriba):
  // si el cliente no mandó consultorio o no era válido, manda el del servicio.
  if (!validLocationId && service.location_id) {
    validLocationId = service.location_id as string
  }

  const { data: appt, error: insertErr } = await supabase
    .from('appointments')
    .insert({
      business_id: business.id,
      client_id: client?.id || null,
      client_name: clientName,
      client_phone: clientPhone,
      client_email: clientEmail,
      service_id: service.id,
      professional_id: proId,
      location_id: validLocationId,
      date,
      time,
      duration_minutes: Number(service.duration_minutes || 30),
      notes,
      status: initialStatus,
      expires_at: expiresAt,
    })
    .select('id, cancel_token')
    .single()

  if (insertErr || !appt) {
    // 23505 = índice 011 (mismo inicio); 23P01 = exclusion constraint 013 (solapamiento).
    if (insertErr?.code === '23505' || insertErr?.code === '23P01') {
      return Response.json({ ok: false, error: 'slot_taken' }, { status: 409 })
    }
    console.error('[booking/create] insert error:', insertErr?.message)
    return Response.json({ ok: false, error: 'insert_failed' }, { status: 500 })
  }

  // Google Calendar: si el turno queda confirmado de una (sin seña) y el negocio sincroniza,
  // creamos el evento en su calendario y guardamos el event id. after() para no demorar la
  // respuesta; best-effort (si falla, el turno igual queda creado). El flujo con seña crea el
  // evento recién en el webhook de pago aprobado.
  if (initialStatus === 'confirmed' && business.google_refresh_token && appt.id) {
    const refresh = business.google_refresh_token as string
    const apptId = appt.id as string
    after(async () => {
      try {
        const eventId = await createCalendarEvent(refresh, {
          summary: `${service.name || 'Turno'} · ${clientName}`,
          description: [`Cliente: ${clientName}`, clientPhone ? `Tel: ${clientPhone}` : '', clientEmail ? `Email: ${clientEmail}` : '', notes ? `Notas: ${notes}` : '', 'Reserva vía Forjo'].filter(Boolean).join('\n'),
          location: (business.address as string | null) || undefined,
          date,
          time,
          durationMinutes: Number(service.duration_minutes || 30),
        })
        if (eventId) await supabase.from('appointments').update({ google_event_id: eventId }).eq('id', apptId)
      } catch (e) {
        console.error(`[booking/create] gcal event FALLÓ (turno ${apptId}):`, e instanceof Error ? e.message : e)
      }
    })
  }

  // Turno con seña: mail "falta pagar la seña" con link para completar el pago y para
  // cancelar (ambos por cancel_token). Se manda al crear el pending_payment → cubre tanto el
  // pago rechazado como el abandono en MercadoPago. after() para no demorar la respuesta
  // (el cliente necesita el appointmentId ya para redirigir al checkout). Errores logeados.
  if (requireDeposit && clientEmail && appt.cancel_token) {
    const token = appt.cancel_token as string
    after(async () => {
      try {
        await sendPendingPaymentEmail({
          to: clientEmail,
          clientName,
          service: service.name || '',
          date,
          time,
          businessName: String(business.name || ''),
          primaryColor: business.primary_color as string | null,
          logoUrl: business.logo_url as string | null,
          depositAmount: Number(business.deposit_amount || 0),
          expiryHours,
          token,
          resendApiKey: business.resend_api_key as string | null,
          resendFrom: business.resend_from as string | null,
        })
      } catch (e) {
        console.error(`[booking/create] email seña pendiente FALLÓ (turno ${appt.id}):`, e instanceof Error ? e.message : e)
      }
    })
  }

  return Response.json({ ok: true, appointmentId: appt.id, cancelToken: appt.cancel_token, requiresPayment: requireDeposit })
}
