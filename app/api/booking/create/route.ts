import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBusinessSecrets } from '@/lib/business-secrets'
import { verifyRecaptcha } from '@/lib/recaptcha'
import { sendPendingPaymentEmail, sendExpiredHoldEmail } from '@/lib/email'
import { createCalendarEvent } from '@/lib/google-calendar'
import { createAppointmentCore } from '@/lib/booking-core'
import { isDateOutOfWindow } from '@/lib/booking-window'

// Creación de un turno PÚBLICO server-side. Reemplaza el insert directo con anon key.
// Cierra de una: reCAPTCHA fail-closed (no bypasseable desde el cliente), validación de que
// service/professional sean del negocio (anti-tampering de tenant), re-check de disponibilidad
// y, como respaldo atómico ante la carrera, captura del 23505 del índice anti doble-booking.
// service role server-only; el negocio se resuelve por slug → aislamiento por tenant.
//
// REFACTOR (motor-reservas Phase 1, Plan 01): la cadena anti-tampering + re-check de solapamiento
// + liberación de holds + insert + traducción de constraint vive ahora en lib/booking-core.ts
// (createAppointmentCore), compartida con el alta manual autenticada. Lo que es EXCLUSIVO del
// público se queda acá: reCAPTCHA, gate de plan, secretos, mail de seña, mails de holds vencidos
// y el evento de Google Calendar. El comportamiento del público NO cambia (suite TEST-01 verde).
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
  // Acotado defensivo del input ANÓNIMO (WR-02), mismo patrón que `notes`: este valor persiste en
  // `clients.name` y de ahí lo renderizan los mails que el dueño lee (el escapado vive en lib/email).
  const clientName = typeof body.clientName === 'string' ? body.clientName.trim().slice(0, 120) : ''
  const clientPhone = typeof body.clientPhone === 'string' && body.clientPhone.trim() ? body.clientPhone.trim() : null
  const clientEmail = typeof body.clientEmail === 'string' && body.clientEmail.trim() ? body.clientEmail.trim() : null
  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 1000) : null
  const recaptchaToken = typeof body.recaptchaToken === 'string' ? body.recaptchaToken : ''

  // Guard de campos requeridos. AMPLIADO para el vertical canchas (D-03): el cliente de canchas
  // manda `professionalId` (la cancha) y NO `serviceId` — el service se deriva server-side más abajo.
  // Por eso se exige (serviceId || professionalId) en vez de serviceId a secas. El path legacy
  // (salud/belleza/general, que manda serviceId) queda byte-idéntico: si viene serviceId, pasa igual.
  if (!slug || !(serviceId || professionalId) || !date || !time || !clientName) {
    return Response.json({ ok: false, error: 'missing_fields' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Negocio por slug (tenant). Solo columnas NO secretas: los secretos (resend_api_key,
  // resend_from, google_refresh_token) viven en business_secrets (D-02) y se traen aparte.
  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, slug, address, require_deposit, deposit_amount, deposit_expiry_hours, buffer_minutes, primary_color, logo_url, plan_status, max_advance_days, max_advance_date')
    .eq('slug', slug)
    .single()
  if (!business) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })

  // Gate de plan (SEC-04): un negocio con suscripción vencida o cancelada NO puede seguir
  // captando turnos por su link público. Se usa un BLOCKLIST explícito (no un allowlist): solo
  // se rechazan los estados que sabemos que deben cerrar el booking. Cualquier negocio en periodo
  // de prueba, sin estado seteado todavía, o con un valor legacy/desconocido SIGUE recibiendo
  // reservas a propósito — un allowlist tipo "distinto de activo" barrería esos casos y mataría
  // turnos legítimos de clientes que aún están por pagar. Rechazo temprano: corre antes de
  // reCAPTCHA / servicio / slot. El negocio existe pero no está habilitado → 403 (no 404/409).
  if (['expired', 'cancelled', 'suspended'].includes(business.plan_status)) {
    return Response.json({ ok: false, error: 'plan_inactive' }, { status: 403 })
  }

  // ── Backstop de ventana de reserva (BOOK-WINDOW-03, capa de AUTORIDAD del enforcement en 3 capas) ──
  // El cap del calendario público (Plan 03) es solo UX y se puede saltear manipulando la request; ACÁ
  // el server es la autoridad y NO confía en el cliente. Se valida con el helper compartido en hora AR
  // (D-07: el server corre en UTC en Vercel, el helper resuelve "hoy" en zona Argentina) para coincidir
  // EXACTAMENTE con el corte que ve el calendario (misma fuente de verdad → sin drift). Corte inclusive.
  // Corre TEMPRANO —tras el gate de plan y ANTES del insert de client— para que una fecha fuera de
  // ventana no deje filas `clients` huérfanas (Pitfall 3). 400 = validación de input, consistente con
  // missing_fields. Solo gatea reservas NUEVAS (D-06): no toca turnos ya reservados.
  if (isDateOutOfWindow(business, date)) {
    return Response.json({ ok: false, error: 'date_out_of_window' }, { status: 400 })
  }

  // Secretos email/calendar por tenant desde business_secrets (vía getBusinessSecrets,
  // service-role). Se pasan a los helpers de email/gcal.
  const secrets = await getBusinessSecrets(business.id)

  const requireDeposit = Boolean(business.require_deposit) && Number(business.deposit_amount) > 0

  // reCAPTCHA fail-closed, salvo flujo con seña (ahí el gate es el pago, igual que hoy).
  if (!requireDeposit) {
    const rc = await verifyRecaptcha({ token: recaptchaToken, slug })
    if (!rc.ok) {
      return Response.json({ ok: false, error: 'recaptcha_failed', reason: rc.reason }, { status: 403 })
    }
  }

  // El público SIEMPRE inserta un cliente nuevo (no dedupe — eso es del alta manual, D-04). Se crea
  // ANTES del core y se le pasa el client_id; el core no toca la tabla clients (es rol/caller-agnóstico).
  const { data: client } = await supabase
    .from('clients')
    .insert({ business_id: business.id, name: clientName, phone: clientPhone, email: clientEmail })
    .select('id')
    .single()

  // ── Derivación del service para el vertical CANCHAS (D-03) — la ÚNICA lógica server nueva de la fase ──
  // El cliente de canchas manda `professionalId` (la cancha, = el bucket reservable) pero NUNCA
  // `serviceId` ni precio: precio + duración fija son propios de la cancha y salen del server. En el
  // modelo del motor v0.12 una cancha ES una fila de `professionals` con `service_id` NO nulo (puntero
  // 1:1 cancha↔service, migr. 043); los professionals de salud/belleza/general tienen `service_id` NULL.
  //
  // Por eso, cuando llega `professionalId`, leemos ese professional re-validado por business_id
  // (anti-tampering de tenant) y miramos su `service_id`:
  //   - service_id NO nulo → es una CANCHA: DERIVAMOS ese service y lo usamos SIEMPRE, ignorando por
  //     completo cualquier `serviceId` que venga en el body (regla dura D-03 / Pitfall 2: nunca merge
  //     cliente-provee-service; un serviceId forjado no puede reservar la cancha cara al precio/duración
  //     de otra). El resolvedServiceId va al core, que lo re-valida OTRA VEZ por business_id (doble
  //     barrera) y de él saca precio (ALQUILER-04) y duración fija (ALQUILER-01).
  //   - professional inexistente para ESTE negocio (cross-tenant / id inventado) Y sin serviceId del
  //     body → invalid_service (400): la cancha ajena no se puede reservar contra este slug.
  //   - professional legítimo pero con service_id NULL → es un professional GENÉRICO (legacy): NO se
  //     deriva nada, se mantiene el serviceId del body → el path salud/belleza/general queda byte-idéntico.
  let resolvedServiceId = serviceId
  if (professionalId && professionalId !== 'none') {
    const { data: cancha } = await supabase
      .from('professionals')
      .select('service_id')
      .eq('id', professionalId)
      .eq('business_id', business.id) // anti-tampering: la cancha/agenda DEBE ser de este negocio (por slug)
      .single()
    if (cancha?.service_id) {
      // Es una cancha: el service SIEMPRE se deriva del professional; el serviceId del body se ignora.
      resolvedServiceId = cancha.service_id as string
    } else if (!resolvedServiceId) {
      // No es una cancha de este negocio (o no existe) y el cliente tampoco mandó un serviceId legacy
      // válido → no hay service que reservar. Caso canchas cross-tenant / professionalId inventado.
      return Response.json({ ok: false, error: 'invalid_service' }, { status: 400 })
    }
    // Si cancha.service_id es null pero HAY serviceId del body → professional genérico (legacy): se
    // deja resolvedServiceId = serviceId sin tocar. El core re-valida ambos por business_id.
  }

  // Núcleo compartido: anti-tampering (service/professional/location por business_id) + re-check de
  // solapamiento con buffer + liberación de holds vencidos + insert + traducción 23505/23P01 →
  // slot_taken. Devuelve los ids de holds liberados; los mails de hold vencido se mandan acá abajo.
  const result = await createAppointmentCore({
    supabase,
    business,
    serviceId: resolvedServiceId,
    professionalId,
    locationId,
    date,
    time,
    clientId: client?.id || null,
    clientName,
    clientPhone,
    clientEmail,
    notes,
    requireDeposit,
    depositExpiryHours: Number(business.deposit_expiry_hours) || 1,
  })
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: result.status })
  }

  // Mails de holds vencidos que el core acaba de liberar: el core devuelve solo los ids (no manda
  // mails); acá traemos los datos de cada hold y avisamos a su cliente (no los agarra el cron porque
  // ya quedaron cancelados). after() para no demorar la reserva en curso. Filtrado por business_id.
  if (result.cancelledHoldIds.length > 0) {
    const { data: cancelledHolds } = await supabase
      .from('appointments')
      .select('id, client_name, client_email, date, time, services(name)')
      .in('id', result.cancelledHoldIds)
      .eq('business_id', business.id)
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
              resendApiKey: secrets.resend_api_key,
              resendFrom: secrets.resend_from,
            })
          } catch (e) {
            console.error(`[booking/create] email hold vencido FALLÓ (turno ${h.id}):`, e instanceof Error ? e.message : e)
          }
        }
      })
    }
  }

  // Google Calendar: si el turno queda confirmado de una (sin seña) y el negocio sincroniza,
  // creamos el evento en su calendario y guardamos el event id. after() para no demorar la
  // respuesta; best-effort (si falla, el turno igual queda creado). El flujo con seña crea el
  // evento recién en el webhook de pago aprobado.
  if (result.status === 'confirmed' && secrets.google_refresh_token && result.appointmentId) {
    const refresh = secrets.google_refresh_token
    const apptId = result.appointmentId
    const serviceName = result.serviceName
    const durationMinutes = result.durationMinutes
    after(async () => {
      try {
        const eventId = await createCalendarEvent(refresh, {
          summary: `${serviceName || 'Turno'} · ${clientName}`,
          description: [`Cliente: ${clientName}`, clientPhone ? `Tel: ${clientPhone}` : '', clientEmail ? `Email: ${clientEmail}` : '', notes ? `Notas: ${notes}` : '', 'Reserva vía Forjo'].filter(Boolean).join('\n'),
          location: (business.address as string | null) || undefined,
          date,
          time,
          durationMinutes,
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
  if (requireDeposit && clientEmail && result.cancelToken) {
    const token = result.cancelToken
    const serviceName = result.serviceName
    const expiryHours = Number(business.deposit_expiry_hours) || 1
    after(async () => {
      try {
        await sendPendingPaymentEmail({
          to: clientEmail,
          clientName,
          service: serviceName || '',
          date,
          time,
          businessName: String(business.name || ''),
          primaryColor: business.primary_color as string | null,
          logoUrl: business.logo_url as string | null,
          depositAmount: Number(business.deposit_amount || 0),
          expiryHours,
          token,
          resendApiKey: secrets.resend_api_key,
          resendFrom: secrets.resend_from,
        })
      } catch (e) {
        console.error(`[booking/create] email seña pendiente FALLÓ (turno ${result.appointmentId}):`, e instanceof Error ? e.message : e)
      }
    })
  }

  return Response.json({ ok: true, appointmentId: result.appointmentId, cancelToken: result.cancelToken, requiresPayment: requireDeposit })
}
