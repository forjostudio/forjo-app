import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getBusinessSecrets } from '@/lib/business-secrets'
import { createCalendarEvent } from '@/lib/google-calendar'
import { createAppointmentCore } from '@/lib/booking-core'
import { sendManualBookingConfirmation, emailBrandInputs } from '@/lib/email'

// Alta MANUAL de turno desde el dashboard (autenticada). A diferencia del booking PÚBLICO
// (app/api/booking/create — service role, tenant por slug), este endpoint corre con la SESIÓN
// DEL DUEÑO: cliente anon + RLS (lib/supabase/server) y el negocio se resuelve por owner_id, NUNCA
// por un business_id que venga del cliente. El service role queda PROHIBIDO para el insert: la única
// excepción acotada es leer el google_refresh_token del propio tenant (ya resuelto) dentro del after().
//
// Diferencias con el público (D-01/D-02): NO hay seña/pago (requireDeposit:false → turno siempre
// 'confirmed', expires_at null), NO hay reCAPTCHA (el actor es el dueño autenticado, no un anónimo),
// y NO se manda mail (el alta manual la hace el negocio, no avisa al cliente como el booking público).
// Lo que SÍ reusamos: createAppointmentCore (anti-tampering por business_id + re-check de solapamiento
// con buffer + liberación de holds vencidos + insert + traducción 23505/23P01 → slot_taken). Cero
// duplicación de esa cadena; el camino manual no abre un bypass del re-check de disponibilidad.
export async function POST(request: Request) {
  // Cliente anon+RLS con las cookies de la sesión del dueño. NO admin: el aislamiento por tenant lo
  // garantiza RLS + el filtro por business_id resuelto por owner_id (defensa en profundidad).
  const supabase = await createClient()

  // Auth gate (T-01-05): sin sesión autenticada → 401. El proxy ya refresca la sesión sobre /api/*.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  // Tenant = ACTOR: el negocio se resuelve por owner_id de la sesión, no por slug ni por un id del
  // cliente (T-01-06). Solo columnas NO secretas (los secretos viven en business_secrets, D-02).
  // El branding del mail (slug, primary_color, logo_url, whatsapp) es aditivo y NO secreto; pasar el
  // objeto ampliado a createAppointmentCore es inocuo (el core solo usa id/buffer_minutes por tipado).
  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, address, buffer_minutes, slug, palette, theme, font, landing_config, logo_url, whatsapp')
    .eq('owner_id', user.id)
    .single()
  if (!business) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })

  // Branding del mail desde la misma fuente de verdad que la página pública (paleta/override del
  // landing + fuente). Ya no se alimenta desde primary_color.
  const brand = emailBrandInputs(business)

  // Parseo defensivo del body (molde de booking/create/route.ts): no se confía en el shape del cliente.
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ ok: false, error: 'bad_request' }, { status: 400 })
  }
  const body = (raw ?? {}) as Record<string, unknown>
  const serviceId = typeof body.serviceId === 'string' ? body.serviceId : ''
  const professionalId = typeof body.professionalId === 'string' ? body.professionalId : null
  const locationId = typeof body.locationId === 'string' ? body.locationId : null
  const date = typeof body.date === 'string' ? body.date : ''
  const time = typeof body.time === 'string' ? body.time : ''
  const clientId = typeof body.clientId === 'string' && body.clientId.trim() ? body.clientId.trim() : null
  const clientName = typeof body.clientName === 'string' ? body.clientName.trim() : ''
  const clientPhone = typeof body.clientPhone === 'string' && body.clientPhone.trim() ? body.clientPhone.trim() : null
  const clientEmail = typeof body.clientEmail === 'string' && body.clientEmail.trim() ? body.clientEmail.trim() : null
  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 1000) : null
  // Aviso opt-in al cliente (D-01): default OFF; el server re-gatea igual por clientEmail presente.
  const notify = body.notify === true

  if (!clientName || !serviceId || !date || !time) {
    return Response.json({ ok: false, error: 'missing_fields' }, { status: 400 })
  }

  // ── Resolver/crear el cliente con dedupe (D-04) ────────────────────────────────────────────
  // Toda escritura/lectura de clients corre con `supabase` (anon+RLS), NUNCA admin. RLS + el filtro
  // por business_id garantizan que solo se toque el negocio del dueño.
  const resolvedClientId = await resolveClientId(supabase, business.id, {
    clientId,
    clientName,
    clientPhone,
    clientEmail,
  })

  // ── Core compartido (D-01: manual SIEMPRE confirmed, sin seña) ──────────────────────────────
  const result = await createAppointmentCore({
    supabase,
    business,
    serviceId,
    professionalId,
    locationId,
    date,
    time,
    clientId: resolvedClientId,
    clientName,
    clientPhone,
    clientEmail,
    notes,
    requireDeposit: false, // D-01 — sin seña, status='confirmed', expires_at=null
  })
  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: result.status })
  }

  // ── Google Calendar best-effort en after() — SIN mail (D-01) ────────────────────────────────
  // Única excepción de service-role permitida: leer el google_refresh_token del propio tenant (ya
  // resuelto por owner_id) con getBusinessSecrets. El token jamás sale del server (T-01-08). Si el
  // negocio no sincroniza Google, no hacemos nada. after() para no demorar la respuesta; si falla,
  // el turno ya quedó creado igual (best-effort).
  if (result.appointmentId) {
    const apptId = result.appointmentId
    const serviceName = result.serviceName
    const durationMinutes = result.durationMinutes
    after(async () => {
      try {
        const secrets = await getBusinessSecrets(business.id)
        if (!secrets.google_refresh_token) return
        const eventId = await createCalendarEvent(secrets.google_refresh_token, {
          summary: `${serviceName || 'Turno'} · ${clientName}`,
          description: [
            `Cliente: ${clientName}`,
            clientPhone ? `Tel: ${clientPhone}` : '',
            clientEmail ? `Email: ${clientEmail}` : '',
            notes ? `Notas: ${notes}` : '',
            'Turno manual vía Forjo',
          ]
            .filter(Boolean)
            .join('\n'),
          location: (business.address as string | null) || undefined,
          date,
          time,
          durationMinutes,
        })
        if (eventId) await supabase.from('appointments').update({ google_event_id: eventId }).eq('id', apptId)
      } catch (e) {
        console.error(`[appointments/create] gcal FALLÓ (turno ${apptId}):`, e instanceof Error ? e.message : e)
      }
    })
  }

  // ── Aviso opt-in al cliente por mail — after() SEPARADO y best-effort (D-02) ─────────────────
  // Espeja el patrón del booking público (app/api/booking/create): secretos acotados al propio
  // tenant vía getBusinessSecrets, envío en after() para no demorar la respuesta, try/catch propio.
  // Gate: solo si el dueño tildó el opt-in (notify) Y el cliente tiene email. Si el mail falla, se
  // loguea y el alta NO se rompe (el turno ya quedó creado). Mail LIMPIO sin precio/seña (Plan 01).
  if (notify && clientEmail && result.appointmentId) {
    const apptId = result.appointmentId
    const serviceName = result.serviceName
    const cancelToken = result.cancelToken
    after(async () => {
      try {
        const secrets = await getBusinessSecrets(business.id)
        await sendManualBookingConfirmation({
          to: clientEmail,
          clientName,
          service: serviceName,
          date,
          time,
          businessName: business.name,
          businessSlug: business.slug,
          theme: brand.theme,
          palette: brand.palette,
          font: brand.font,
          primaryOverride: brand.primaryOverride,
          logoUrl: business.logo_url,
          whatsapp: business.whatsapp,
          cancelToken, // si es falsy, Plan 01 degrada y manda sin botón de cancelar (D-04)
          resendApiKey: secrets.resend_api_key,
          resendFrom: secrets.resend_from,
        })
      } catch (e) {
        console.error(`[appointments/create] email confirmación FALLÓ (turno ${apptId}):`, e instanceof Error ? e.message : e)
      }
    })
  }

  return Response.json({ ok: true, appointmentId: result.appointmentId })
}

// ── Helper de dedupe de cliente (D-04) ────────────────────────────────────────────────────────
// Devuelve el client_id a asociar al turno, todo dentro del negocio del dueño (business_id):
//   1. Si llegó un clientId, se re-valida por (id + business_id) — anti-tampering (T-01-07). Si es
//      de otro negocio o no existe, se ignora y se sigue con el flujo de datos nuevos.
//   2. Si hay teléfono o email, se busca un cliente existente del negocio cuyo teléfono normalizado
//      (solo dígitos) o email (lowercase) coincida → se reusa su id (no se crea duplicado).
//   3. Si no hay match, se inserta un cliente nuevo (anon+RLS) y se usa su id.
// La normalización (dígitos / lowercase) es la AUTORIDAD del servidor; la UI solo sugiere.
async function resolveClientId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  input: { clientId: string | null; clientName: string; clientPhone: string | null; clientEmail: string | null },
): Promise<string | null> {
  const { clientId, clientName, clientPhone, clientEmail } = input

  // (1) clientId explícito → re-validar por tenant antes de confiar en él (T-01-07).
  if (clientId) {
    const { data: existing } = await supabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('business_id', businessId)
      .maybeSingle()
    if (existing) return existing.id as string
    // clientId inválido / de otro negocio → caemos al flujo de dedupe por datos nuevos.
  }

  // Normalización (autoridad del servidor): teléfono = solo dígitos; email = lowercase.
  const phoneDigits = clientPhone ? clientPhone.replace(/\D/g, '') : ''
  const emailLower = clientEmail ? clientEmail.toLowerCase() : ''

  // (2) Dedupe: buscar un cliente del negocio que matchee por teléfono o email normalizado. Traemos
  // los candidatos del business (filtrados por business_id) y comparamos normalizado en memoria —
  // así el match es robusto a formatos distintos (espacios/guiones en el teléfono, mayúsculas en el mail).
  if (phoneDigits || emailLower) {
    const { data: candidates } = await supabase
      .from('clients')
      .select('id, phone, email')
      .eq('business_id', businessId)
    const match = (candidates || []).find((c) => {
      const cPhone = c.phone ? String(c.phone).replace(/\D/g, '') : ''
      const cEmail = c.email ? String(c.email).toLowerCase() : ''
      return (!!phoneDigits && cPhone === phoneDigits) || (!!emailLower && cEmail === emailLower)
    })
    if (match) return match.id as string
  }

  // (3) Sin match → cliente nuevo (anon+RLS, NUNCA admin).
  const { data: created } = await supabase
    .from('clients')
    .insert({ business_id: businessId, name: clientName, phone: clientPhone, email: clientEmail })
    .select('id')
    .single()
  return created?.id || null
}
