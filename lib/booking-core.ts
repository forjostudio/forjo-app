import type { SupabaseClient } from '@supabase/supabase-js'

// ── Core rol-agnóstico de creación de turno ──────────────────────────────────────────
// Única fuente de verdad de la cadena de validación + insert de un turno. Extraído de
// app/api/booking/create/route.ts para que lo consuman DOS callers distintos sin duplicar:
//   - el booking PÚBLICO (service role, tenant por slug) → app/api/booking/create/route.ts
//   - el alta MANUAL autenticada (anon + RLS, tenant por owner_id) → Plan 02
// Por eso el core NO crea su propio cliente Supabase: lo recibe por parámetro y es agnóstico
// al rol. Tampoco manda mails, ni hace reCAPTCHA, ni lee secretos (eso es específico de cada
// caller). El core re-valida TODA entidad (service/professional/location) por business_id —
// nunca confía en lo que llega del cliente — y traduce el choque de constraint a slot_taken.

// Mismo sentinela que el índice 011 / el endpoint de disponibilidad: el bucket "sin profesional"
// se representa con este UUID cero para que coalesce(professional_id, sentinel) agrupe igual.
const SENTINEL = '00000000-0000-0000-0000-000000000000'

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// Business ya resuelto por el caller (por slug en el público, por owner_id en el manual).
// Solo se necesita el id (tenant) y el buffer entre turnos.
type BusinessForBooking = { id: string; buffer_minutes: number | null }

export type CreateAppointmentInput = {
  // admin (público) | server/anon (manual) — rol-agnóstico: el core lo usa tal cual lo recibe.
  supabase: SupabaseClient
  business: BusinessForBooking
  serviceId: string
  professionalId: string | null // 'none'/null → bucket SENTINEL
  locationId: string | null
  date: string // 'yyyy-MM-dd'
  time: string // 'HH:mm'
  // El cliente ya fue resuelto/creado por el caller (el core NO inserta la fila de clients):
  // el público inserta siempre uno nuevo, el manual deduplica. El core solo copia los campos.
  clientId: string | null
  clientName: string
  clientPhone: string | null
  clientEmail: string | null
  notes: string | null
  // En Phase 1 el alta manual SIEMPRE pasa requireDeposit=false → status='confirmed', expires=null.
  // El público lo deja como hoy (seña ⇒ pending_payment + expires_at). MANUAL-04 diferido a v2:
  // no se agrega el branch de seña al manual.
  requireDeposit?: boolean
  depositExpiryHours?: number
}

export type CreateAppointmentResult =
  | {
      ok: true
      appointmentId: string
      cancelToken: string
      status: 'confirmed' | 'pending_payment'
      serviceName: string
      durationMinutes: number
      // ids de holds vencidos que el core liberó (cancelled). El core NO manda mails: devuelve
      // los ids para que el caller público dispare sus mails de hold-vencido en su propio after().
      cancelledHoldIds: string[]
    }
  | { ok: false; error: 'invalid_service' | 'invalid_professional' | 'slot_taken' | 'insert_failed'; status: 400 | 409 | 500 }

export async function createAppointmentCore(input: CreateAppointmentInput): Promise<CreateAppointmentResult> {
  const {
    supabase,
    business,
    serviceId,
    professionalId,
    locationId,
    date,
    time,
    clientId,
    clientName,
    clientPhone,
    clientEmail,
    notes,
    requireDeposit = false,
    depositExpiryHours = 1,
  } = input

  // Anti-tampering de tenant: el servicio debe ser de ESTE negocio y estar activo. De acá
  // sale la duración real (no se confía en nada del cliente).
  const { data: service } = await supabase
    .from('services')
    .select('id, name, active, duration_minutes, location_id')
    .eq('id', serviceId)
    .eq('business_id', business.id)
    .single()
  if (!service || service.active === false) {
    return { ok: false, error: 'invalid_service', status: 400 }
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
    if (!pro) return { ok: false, error: 'invalid_professional', status: 400 }
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
    return { ok: false, error: 'slot_taken', status: 409 }
  }

  // Liberar "holds" vencidos que se solapan (pending_payment con seña expirada): la
  // disponibilidad ya los muestra libres, pero las constraints los siguen contando hasta que
  // el cron los cancele. Sin esto el slot se ve libre pero el insert choca. Los cancelamos
  // acá mismo (consistente con cancel-expired), filtrando por business_id (tenant). El core
  // NO manda mails: devuelve los ids cancelados en cancelledHoldIds y el caller decide qué hacer.
  const expiredHoldIds = sameBucket
    .filter(a => a.status === 'pending_payment' && a.expires_at != null && new Date(a.expires_at as string).getTime() <= nowMs)
    .map(a => a.id)
  let cancelledHoldIds: string[] = []
  if (expiredHoldIds.length > 0) {
    const { data: cancelledHolds } = await supabase
      .from('appointments')
      .update({ status: 'cancelled' })
      .in('id', expiredHoldIds)
      .eq('business_id', business.id)
      .select('id')
    cancelledHoldIds = (cancelledHolds || []).map(h => h.id as string)
  }

  const initialStatus: 'confirmed' | 'pending_payment' = requireDeposit ? 'pending_payment' : 'confirmed'
  // pending_payment SIEMPRE con expires_at: si la reserva se abandona antes de iniciar el
  // pago, el cron la libera. payment/create lo reescribe con su propia ventana. Sin esto, un
  // hold sin expires_at quedaría ocupando el slot para siempre (el cron solo cancela vencidos).
  const expiryHours = Number(depositExpiryHours) || 1
  const expiresAt = requireDeposit
    ? new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString()
    : null

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

  // Insert del turno. El índice 011 es el respaldo ATÓMICO: si dos requests pasan el re-check
  // en la misma carrera, Postgres rechaza el segundo con 23505 (o 23P01 por la exclusion 013)
  // y lo traducimos a slot_taken. El re-check JS de arriba es solo UX; la garantía real es la DB.
  const { data: appt, error: insertErr } = await supabase
    .from('appointments')
    .insert({
      business_id: business.id,
      client_id: clientId,
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
      return { ok: false, error: 'slot_taken', status: 409 }
    }
    console.error('[booking-core] insert error:', insertErr?.message)
    return { ok: false, error: 'insert_failed', status: 500 }
  }

  return {
    ok: true,
    appointmentId: appt.id as string,
    cancelToken: appt.cancel_token as string,
    status: initialStatus,
    serviceName: (service.name as string) || '',
    durationMinutes: Number(service.duration_minutes || 30),
    cancelledHoldIds,
  }
}
