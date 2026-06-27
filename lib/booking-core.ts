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
  | { ok: false; error: 'invalid_service' | 'invalid_professional' | 'slot_taken' | 'slot_full' | 'insert_failed'; status: 400 | 409 | 500 }

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

  // Capacity del bloque que cubre este slot. MISMO join que book_slot_atomic (plantilla semanal:
  // day_of_week + ventana start/end), MISMA convención de dow que EXTRACT(dow): 0=domingo..6=sábado
  // (new Date('yyyy-MM-dd') parsea a medianoche UTC → getUTCDay() coincide con EXTRACT(dow) de la DB).
  // Si no hay bloque que lo cubra → capacity 1 (comportamiento individual). El RPC es la AUTORIDAD
  // atómica del cupo; este query es solo para decidir si el re-check JS (UX) debe rechazar temprano.
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay()
  const { data: capBlocks } = await supabase
    .from('time_blocks')
    .select('capacity')
    .eq('business_id', business.id)
    .eq('day_of_week', dow)
    .lte('start_time', time)
    .gt('end_time', time)
  const slotCapacity = (capBlocks || []).reduce((max, b) => Math.max(max, Number(b.capacity) || 1), 1)

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
  // Re-check JS capacity-aware (Pitfall 5 / A5): el rechazo temprano `slot_taken` por SOLAPAMIENTO
  // solo aplica a bloques cupo 1, donde es el anti-doble-booking de duración variable de v0.9 (un
  // turno de 60' que pisa parcialmente a otro de 30' — el RPC NO lo cubre, solo cuenta el slot exacto).
  // En bloques GRUPALES (capacity > 1) NO rechazamos acá: todos los inscriptos comparten el MISMO slot
  // exacto (D-03, duración fija) y un solape "consigo mismos" no es conflicto — la autoridad del cupo
  // es el RPC (advisory lock + count vs capacity → slot_full). Rechazar acá bloquearía falsamente al
  // 2º+ inscripto de la clase. Para cupo 1, capacity-aware ⇒ comportamiento byte-idéntico a hoy.
  if (taken && slotCapacity <= 1) {
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

  // Alta del turno vía book_slot_atomic (migración 041). REEMPLAZA el INSERT autocommit directo:
  // el .insert() del client JS es su propia transacción, y entre el re-check de arriba y el insert
  // hay una ventana de carrera (TOCTOU) que dos requests concurrentes del mismo slot podían cruzar →
  // sobrecupo. El RPC encapsula advisory-lock + count vs capacity + INSERT con seat en UNA transacción
  // server-side: serializa SOLO las reservas que pelean este mismo slot+bucket y asigna el asiento
  // atómicamente. La garantía real del cupo vive acá (DB), no en el re-check JS (que es solo UX).
  // El anti-tampering de tenant (service/professional/location por business_id) ya corrió ARRIBA; el
  // RPC recibe ids ya validados y re-impone el filtro por p_business_id internamente (SECURITY DEFINER).
  const { data: appt, error: rpcErr } = await supabase
    .rpc('book_slot_atomic', {
      p_business_id: business.id,
      p_professional_id: proId,
      p_service_id: service.id,
      p_location_id: validLocationId,
      p_date: date,
      p_time: time,
      p_duration: Number(service.duration_minutes || 30),
      p_client_id: clientId,
      p_client_name: clientName,
      p_client_phone: clientPhone,
      p_client_email: clientEmail,
      p_notes: notes,
      p_status: initialStatus,
      p_expires_at: expiresAt,
    })
    .single()

  if (rpcErr || !appt) {
    // (a) RAISE 'slot_full' (ERRCODE P0001 — cupo grupal lleno) llega en `message` → slot_full (409).
    if (rpcErr?.message?.includes('slot_full')) {
      return { ok: false, error: 'slot_full', status: 409 }
    }
    // (b) 23505 = índice único de seat (cupo 1: 2ª reserva del slot, doble-booking clásico);
    //     23P01 = exclusion constraint 013 (solape de duración variable, cupo 1) → slot_taken (409).
    if (rpcErr?.code === '23505' || rpcErr?.code === '23P01') {
      return { ok: false, error: 'slot_taken', status: 409 }
    }
    console.error('[booking-core] rpc error:', rpcErr?.message)
    return { ok: false, error: 'insert_failed', status: 500 }
  }
  const apptRow = appt as { id: string; cancel_token: string }

  return {
    ok: true,
    appointmentId: apptRow.id,
    cancelToken: apptRow.cancel_token,
    status: initialStatus,
    serviceName: (service.name as string) || '',
    durationMinutes: Number(service.duration_minutes || 30),
    cancelledHoldIds,
  }
}
