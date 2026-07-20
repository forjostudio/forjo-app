import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getBusinessSecrets } from '@/lib/business-secrets'
import { generateAbonoOccurrences } from '@/lib/abono-generation'
import { sendAbonoConfirmation } from '@/lib/email'
import { todayInAR } from '@/lib/booking-window'

// Alta MANUAL del ABONO (serie de turnos FIJOS recurrentes) desde el panel del dueño (ABONO-01, D-04).
// Espeja app/api/appointments/create (alta manual de turno suelto): corre con la SESIÓN DEL DUEÑO —
// cliente anon + RLS (lib/supabase/server) y el negocio se resuelve por owner_id, NUNCA por un
// business_id que venga del cliente. El service role queda PROHIBIDO para el insert del abono: el
// aislamiento lo dan RLS + el filtro por business_id (defensa en profundidad, T-06-09/T-06-11). La
// única excepción acotada de service-role es leer los secretos Resend del propio tenant (ya resuelto)
// dentro del after() para mandar el mail (T-06-12).
//
// Qué hace, de punta a punta (D-04/D-05/D-08):
//   1. Auth (401) + tenant por owner_id (404).
//   2. Parseo defensivo del body + anti-tampering: re-valida service/professional/location por
//      business_id ANTES de insertar; en el vertical canchas DERIVA el serviceId desde la cancha
//      (professional.service_id) server-side — nunca confía en el serviceId del cliente (T-06-10).
//   3. Resuelve/crea el cliente con dedupe (mismo criterio que appointments/create): el abono queda
//      SIEMPRE con client_id.
//   4. Inserta la fila `abonos` (anon+RLS): la policy INSERT with-check garantiza que sólo se cree en
//      el negocio del dueño.
//   5. Corre la PRIMERA TANDA de generación (hasta el borde de la ventana abono_window_weeks) vía el
//      motor del Plan 02 (generateAbonoOccurrences → createAppointmentCore, T-06-13): CERO insert
//      directo a appointments acá tampoco. Persiste generated_until + skipped_occurrences (capado).
//   6. Manda UN solo mail al cliente al crear (D-08), best-effort en after(); los turnos generados
//      semana a semana NO mandan mail cada uno.

// Cap del array skipped_occurrences persistido: se guarda sólo la cola más reciente (últimas 50). Es la
// MISMA convención que el cron diario (Plan 04), que appendea sobre la vida indefinida del abono →
// mantener el cap idéntico en ambos puntos de escritura evita el crecimiento sin techo del JSONB. Al
// crear el array es chico (acotado por la ventana), así que acá es sólo un guardrail consistente.
const SKIPPED_CAP = 50

// Etiquetas de día (plural) para el mail: convención EXTRACT(dow) 0=domingo..6=sábado, idéntica a
// time_blocks / booking-core / abonos.day_of_week. "todos los <día>".
const DAY_LABELS = ['los domingos', 'los lunes', 'los martes', 'los miércoles', 'los jueves', 'los viernes', 'los sábados']

// 'yyyy-MM-dd' de un Date tomado en sus componentes LOCALES (todayInAR devuelve medianoche local del
// día calendario AR). Consistente con cómo el motor compara strings 'yyyy-MM-dd'.
function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function POST(request: Request) {
  // Cliente anon+RLS con las cookies de la sesión del dueño. NO admin (T-06-11).
  const supabase = await createClient()

  // Auth gate (T-06-09): sin sesión autenticada → 401. El proxy ya refresca la sesión sobre /api/*.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  // Tenant = ACTOR: el negocio se resuelve por owner_id de la sesión, no por un id del cliente
  // (T-06-09). Sólo columnas NO secretas (los secretos viven en business_secrets). abono_window_weeks
  // (migr. 054, D-07) define el borde de la primera tanda; el branding (slug/color/logo/whatsapp) es
  // para el mail.
  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, buffer_minutes, slug, primary_color, logo_url, whatsapp, vertical, abono_window_weeks')
    .eq('owner_id', user.id)
    .single()
  if (!business) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })

  // Parseo defensivo del body (molde de appointments/create): no se confía en el shape del cliente.
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ ok: false, error: 'bad_request' }, { status: 400 })
  }
  const body = (raw ?? {}) as Record<string, unknown>
  const serviceId = typeof body.serviceId === 'string' ? body.serviceId : ''
  const professionalId = typeof body.professionalId === 'string' && body.professionalId !== 'none' ? body.professionalId : null
  const locationId = typeof body.locationId === 'string' ? body.locationId : null
  const dayOfWeek = typeof body.dayOfWeek === 'number' && Number.isInteger(body.dayOfWeek) ? body.dayOfWeek : -1
  const time = typeof body.time === 'string' ? body.time : ''
  const clientId = typeof body.clientId === 'string' && body.clientId.trim() ? body.clientId.trim() : null
  const clientName = typeof body.clientName === 'string' ? body.clientName.trim() : ''
  const clientPhone = typeof body.clientPhone === 'string' && body.clientPhone.trim() ? body.clientPhone.trim() : null
  const clientEmail = typeof body.clientEmail === 'string' && body.clientEmail.trim() ? body.clientEmail.trim() : null

  // Guard de campos mínimos: cliente + día de la semana válido (0..6) + hora, y (serviceId) O
  // (professionalId presente — el vertical canchas manda la cancha y el server deriva el service).
  if (!clientName || dayOfWeek < 0 || dayOfWeek > 6 || !time || !(serviceId || professionalId)) {
    return Response.json({ ok: false, error: 'missing_fields' }, { status: 400 })
  }

  // ── Anti-tampering de tenant (T-06-10) ──────────────────────────────────────────────────────
  // (a) Profesional/cancha: si se eligió, DEBE ser de ESTE negocio. En canchas (professional con
  //     service_id NO nulo, migr. 043) el service se DERIVA de la cancha server-side, ignorando por
  //     completo cualquier serviceId del body (regla dura D-03/canchas): un serviceId forjado no puede
  //     reservar la cancha cara al precio/duración de otra.
  let proId: string | null = null
  let resolvedServiceId = serviceId
  if (professionalId) {
    const { data: pro } = await supabase
      .from('professionals')
      .select('id, service_id')
      .eq('id', professionalId)
      .eq('business_id', business.id)
      .maybeSingle()
    if (!pro) return Response.json({ ok: false, error: 'invalid_professional' }, { status: 400 })
    proId = pro.id as string
    if (pro.service_id) resolvedServiceId = pro.service_id as string // es una cancha → derivar el service
  }

  // Sin service resoluble (ni del body ni derivado de una cancha) → no hay qué reservar.
  if (!resolvedServiceId) {
    return Response.json({ ok: false, error: 'invalid_service' }, { status: 400 })
  }

  // (b) Service: re-validado por business_id + activo. De acá sale la duración snapshot del abono
  //     (la generación usa igual la duración VIVA del service en cada ocurrencia).
  const { data: service } = await supabase
    .from('services')
    .select('id, duration_minutes, active')
    .eq('id', resolvedServiceId)
    .eq('business_id', business.id)
    .maybeSingle()
  if (!service || service.active === false) {
    return Response.json({ ok: false, error: 'invalid_service' }, { status: 400 })
  }

  // (c) Consultorio: sólo aceptamos un location_id que sea de ESTE negocio.
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

  // ── Resolver/crear el cliente con dedupe (mismo criterio que appointments/create) ───────────
  const resolvedClientId = await resolveClientId(supabase, business.id, { clientId, clientName, clientPhone, clientEmail })

  // ── Insert de la fila abonos (anon+RLS; policy INSERT with-check → sólo el negocio del dueño) ──
  const { data: abono, error: insertErr } = await supabase
    .from('abonos')
    .insert({
      business_id: business.id,
      client_id: resolvedClientId,
      service_id: service.id,
      professional_id: proId,
      location_id: validLocationId,
      day_of_week: dayOfWeek,
      start_time: time,
      duration_minutes: Number(service.duration_minutes) || null,
      status: 'active',
    })
    .select('id, cancel_token, client_id, day_of_week, start_time, service_id, professional_id, location_id')
    .single()
  if (insertErr || !abono) {
    console.error('[abonos/create] insert error:', insertErr?.message)
    return Response.json({ ok: false, error: 'insert_failed' }, { status: 500 })
  }

  // ── Primera tanda de generación (D-05): hoy (hora AR) → hoy + abono_window_weeks semanas ───────
  // El motor (Plan 02) materializa cada ocurrencia vía createAppointmentCore (núcleo atómico) y saltea+
  // registra ante conflicto. Rango acotado por la ventana (default 8 semanas, D-07) → sin loop infinito.
  const windowWeeks = Number(business.abono_window_weeks) || 8
  const today = todayInAR()
  const fromDate = toISODate(today)
  const toDate = toISODate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + windowWeeks * 7))

  const result = await generateAbonoOccurrences({
    supabase,
    business,
    abono: {
      id: abono.id as string,
      client_id: abono.client_id as string | null,
      day_of_week: abono.day_of_week as number,
      start_time: abono.start_time as string,
      service_id: abono.service_id as string | null,
      professional_id: abono.professional_id as string | null,
      location_id: abono.location_id as string | null,
    },
    fromDate,
    toDate,
  })

  // Persistir el estado rolling en la fila del abono (el motor es PURO, no lo toca): la frontera de la
  // ventana ya generada (generated_until) y las ocurrencias salteadas (capadas a las últimas 50 — mismo
  // cap que el cron del Plan 04). UPDATE acotado por id + business_id (tenant, T-06-11).
  await supabase
    .from('abonos')
    .update({ generated_until: toDate, skipped_occurrences: result.skipped.slice(-SKIPPED_CAP) })
    .eq('id', abono.id)
    .eq('business_id', business.id)

  // ── UN solo mail al cliente al crear (D-08), best-effort en after() ─────────────────────────
  // Sólo si el cliente tiene email. Secretos Resend del propio tenant vía getBusinessSecrets (única
  // excepción service-role, acotada al negocio ya resuelto — T-06-12). Si el mail falla, se loguea y el
  // alta NO se rompe (el abono y sus turnos ya quedaron creados). Los turnos generados NO mandan mail c/u.
  if (clientEmail) {
    const abonoId = abono.id as string
    after(async () => {
      try {
        const secrets = await getBusinessSecrets(business.id)
        await sendAbonoConfirmation({
          to: clientEmail,
          clientName,
          service: '', // el nombre del service es aditivo; el mail funciona sin él (evita un select extra)
          dayLabel: `todos ${DAY_LABELS[dayOfWeek]}`,
          time,
          businessName: business.name,
          businessSlug: business.slug,
          primaryColor: business.primary_color,
          logoUrl: business.logo_url,
          whatsapp: business.whatsapp,
          resendApiKey: secrets.resend_api_key,
          resendFrom: secrets.resend_from,
        })
      } catch (e) {
        console.error(`[abonos/create] email alta abono FALLÓ (abono ${abonoId}):`, e instanceof Error ? e.message : e)
      }
    })
  }

  return Response.json({
    ok: true,
    abonoId: abono.id,
    generated: result.created.length,
    skipped: result.skipped.length,
  })
}

// ── Helper de dedupe de cliente (mismo criterio que appointments/create :: resolveClientId) ─────
// Devuelve el client_id a asociar al abono, todo dentro del negocio del dueño (business_id):
//   1. Si llegó un clientId, se re-valida por (id + business_id) — anti-tampering (T-06-10). Si es de
//      otro negocio o no existe, se ignora y se sigue con el flujo de datos nuevos.
//   2. Si hay teléfono o email, se busca un cliente existente del negocio cuyo teléfono normalizado
//      (solo dígitos) o email (lowercase) coincida → se reusa su id (no se crea duplicado).
//   3. Si no hay match, se inserta un cliente nuevo (anon+RLS) y se usa su id.
async function resolveClientId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  input: { clientId: string | null; clientName: string; clientPhone: string | null; clientEmail: string | null },
): Promise<string | null> {
  const { clientId, clientName, clientPhone, clientEmail } = input

  // (1) clientId explícito → re-validar por tenant antes de confiar en él (T-06-10).
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

  // (2) Dedupe por teléfono o email normalizado (comparación en memoria, robusta a formatos).
  if (phoneDigits || emailLower) {
    const { data: candidates } = await supabase.from('clients').select('id, phone, email').eq('business_id', businessId)
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
