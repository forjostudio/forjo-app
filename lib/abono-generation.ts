import type { SupabaseClient } from '@supabase/supabase-js'
import { createAppointmentCore } from './booking-core'

// ── Motor de generación forward del abono (Plan 06-02, ABONO-02) ─────────────────────────
// Dado un abono (serie recurrente semanal) y un rango de fechas, materializa un turno por cada
// ocurrencia semanal que cae en su `day_of_week`, SIEMPRE pasando por createAppointmentCore — el
// MISMO núcleo atómico del booking (advisory lock + count vs capacity + EXISTS de espacio +
// constraints 011/013, D-04). NUNCA se hace un insert directo a `appointments`: eso abriría una
// grieta de doble-booking porque saltearía el respaldo atómico de la DB. El único acceso directo a
// appointments permitido acá es (a) el UPDATE acotado que etiqueta el turno con abono_id tras el
// insert atómico (D-03), y (b) las lecturas de idempotencia. Ante conflicto (slot tomado / cupo lleno
// / conflicto de espacio / día cerrado / fuera de horario) la ocurrencia se SALTEA y se registra en
// `skipped`; jamás se pisa un turno ajeno pre-existente (D-06).
//
// El motor es PURO respecto de la fila del abono: NO persiste generated_until ni appendea
// skipped_occurrences. Eso lo hacen los callers (Plan 03 alta manual, Plan 04 cron) con el resultado
// devuelto — así el motor queda testeable en aislamiento.

// Business ya resuelto por el caller (por owner_id en el alta, por iteración en el cron). El core solo
// necesita id (tenant) + buffer. Mismo shape que BusinessForBooking de booking-core.
type BusinessForGeneration = { id: string; buffer_minutes: number | null }

// La fila del abono que el motor consume. Subconjunto de interface Abono (lib/types.ts) con lo que
// se necesita para generar: identidad de la serie + coordenadas de cada ocurrencia.
type AbonoForGeneration = {
  id: string
  client_id: string | null
  day_of_week: number // convención EXTRACT(dow): 0=domingo..6=sábado (idéntica a time_blocks / booking-core)
  start_time: string // 'HH:mm' | 'HH:mm:ss'
  service_id: string | null
  professional_id: string | null
  location_id: string | null
}

export type GenerateAbonoInput = {
  // Rol-agnóstico como booking-core: el motor lo usa tal cual lo recibe (service-role en el cron,
  // anon+RLS en el alta autenticada). No crea su propio cliente.
  supabase: SupabaseClient
  business: BusinessForGeneration
  abono: AbonoForGeneration
  fromDate: string // 'yyyy-MM-dd' inclusive
  toDate: string // 'yyyy-MM-dd' inclusive
}

export type GenerateAbonoResult = {
  created: string[] // fechas 'yyyy-MM-dd' de las ocurrencias generadas OK
  skipped: { date: string; reason: string }[] // ocurrencias salteadas + razón (D-06)
}

// timeToMinutes: 'HH:mm' o 'HH:mm:ss' → minutos desde medianoche. time_blocks/schedule_exceptions
// vienen como 'HH:mm:ss'; start_time del abono puede venir con o sin segundos. Ignoramos los segundos
// (la grilla del negocio es a nivel minuto).
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// addDaysUTC: aritmética de fechas en UTC puro para no cruzar DST ni desfasar el día. Devuelve
// 'yyyy-MM-dd'. Comparar strings 'yyyy-MM-dd' lexicográficamente equivale a comparar fechas.
function addDaysUTC(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function generateAbonoOccurrences(input: GenerateAbonoInput): Promise<GenerateAbonoResult> {
  const { supabase, business, abono, fromDate, toDate } = input
  const created: string[] = []
  const skipped: { date: string; reason: string }[] = []

  // Rango vacío o invertido → nada que generar (guarda defensiva; el caller acota la ventana, T-06-08).
  if (fromDate > toDate) return { created, skipped }

  // (1) Resolver una vez el cliente de la serie para copiar name/phone/email al core (el core NO
  // inserta la fila de clients, solo copia campos). Se filtra por business_id (aislamiento, T-06-07).
  // Si el abono no tiene client_id (no debería pasar: el Plan 03 lo garantiza), pasamos name vacío + null.
  let clientName = ''
  let clientPhone: string | null = null
  let clientEmail: string | null = null
  if (abono.client_id) {
    const { data: client } = await supabase
      .from('clients')
      .select('name, phone, email')
      .eq('id', abono.client_id)
      .eq('business_id', business.id)
      .maybeSingle()
    if (client) {
      clientName = (client.name as string) || ''
      clientPhone = (client.phone as string) ?? null
      clientEmail = (client.email as string) ?? null
    }
  }

  const reqMinutes = timeToMinutes(abono.start_time)
  const timeHHmm = abono.start_time.slice(0, 5) // el core espera 'HH:mm'

  // Grilla semanal del negocio para este day_of_week (fallback cuando NO hay excepción especial ese día).
  // Se lee UNA vez (no cambia por fecha, solo por day_of_week). Filtra por business_id (aislamiento).
  const { data: weeklyBlocks } = await supabase
    .from('time_blocks')
    .select('start_time, end_time')
    .eq('business_id', business.id)
    .eq('day_of_week', abono.day_of_week)
  const withinWeeklyGrid = (weeklyBlocks || []).some(
    b => timeToMinutes(b.start_time as string) <= reqMinutes && reqMinutes < timeToMinutes(b.end_time as string)
  )

  // (2) Iterar SOLO las fechas del rango cuyo dow == abono.day_of_week. Se calcula la primera fecha
  // que matchea desde fromDate y se avanza de a 7 días (NO día a día: acota el loop, T-06-08).
  const fromDow = new Date(`${fromDate}T00:00:00Z`).getUTCDay()
  const firstDelta = (abono.day_of_week - fromDow + 7) % 7
  let date = addDaysUTC(fromDate, firstDelta)

  for (; date <= toDate; date = addDaysUTC(date, 7)) {
    // (3) Guardas de "el negocio abre a esta hora" que el core NO evalúa (el core valida disponibilidad
    // de slot, no si el negocio está abierto). Precedencia por fecha:
    //   schedule_exception (día puntual) SOBRE la grilla semanal (time_blocks).
    // Se traen TODAS las excepciones de esa fecha aplicables al abono (global location_id=null O el
    // location del abono) y se elige la MÁS específica (la que matchea el location gana sobre la global).
    const { data: exceptions } = await supabase
      .from('schedule_exceptions')
      .select('closed, start_time, end_time, location_id')
      .eq('business_id', business.id)
      .eq('date', date)

    const applicable = (exceptions || []).filter(
      e => e.location_id == null || e.location_id === abono.location_id
    )
    // La excepción específica del location del abono tiene prioridad sobre la global.
    const exc =
      applicable.find(e => e.location_id === abono.location_id) ??
      applicable.find(e => e.location_id == null) ??
      null

    if (exc) {
      // Excepción presente: es la ÚNICA autoridad de horario para ESE día (anula la grilla semanal).
      if (exc.closed === true) {
        // Día cerrado por excepción (global o del location del abono) → saltear, no llamar al core.
        skipped.push({ date, reason: 'day_closed' })
        continue
      }
      // closed=false → horario ESPECIAL: la ventana abierta de ese día es EXACTAMENTE [start_time,
      // end_time), y OVERRIDE la grilla semanal. Si start_time del abono queda fuera de esa ventana
      // especial (aunque cayera dentro del bloque semanal), la ocurrencia va fuera de horario. No se
      // exige además un time_block: la excepción manda sola ese día (D-06 / precedencia por fecha).
      const start = exc.start_time as string | null
      const end = exc.end_time as string | null
      const withinSpecial =
        start != null && end != null && timeToMinutes(start) <= reqMinutes && reqMinutes < timeToMinutes(end)
      if (!withinSpecial) {
        skipped.push({ date, reason: 'out_of_hours' })
        continue
      }
    } else {
      // Sin excepción ese día → cae la grilla semanal (time_blocks): start_time debe caer en la ventana
      // [start_time, end_time) de al menos un bloque de ese day_of_week; si no, fuera de horario.
      if (!withinWeeklyGrid) {
        skipped.push({ date, reason: 'out_of_hours' })
        continue
      }
    }

    // (4) Idempotencia: si ya existe un turno (business_id, abono_id, date) NO cancelado, esta fecha ya
    // fue materializada → no se regenera (ni created ni skipped). Hace re-correr el motor sobre el mismo
    // rango un no-op (el cron rolling y el reintento del alta dependen de esto).
    const { data: existing } = await supabase
      .from('appointments')
      .select('id')
      .eq('business_id', business.id)
      .eq('abono_id', abono.id)
      .eq('date', date)
      .neq('status', 'cancelled')
      .limit(1)
    if (existing && existing.length > 0) continue

    // (5) Alta de la ocurrencia por el núcleo atómico. El core re-valida service/professional/location
    // por business_id y traduce cualquier choque a slot_taken/slot_full. requireDeposit=false (los
    // turnos del abono se confirman directo; la seña/pagá-o-liberá es v0.25, diferida).
    const result = await createAppointmentCore({
      supabase,
      business,
      serviceId: abono.service_id as string,
      professionalId: abono.professional_id,
      locationId: abono.location_id,
      date,
      time: timeHHmm,
      clientId: abono.client_id,
      clientName,
      clientPhone,
      clientEmail,
      notes: null,
      requireDeposit: false,
    })

    if (result.ok) {
      // Etiquetar el turno con la serie. UPDATE acotado por id + business_id (tenant, T-06-07): el turno
      // ya está creado atómicamente y abono_id NO participa de ninguna constraint (011/013/cupos/espacio),
      // así que setearla acá NO relaja el anti-doble-booking (D-04/D-10 — por eso no vive en el RPC).
      await supabase
        .from('appointments')
        .update({ abono_id: abono.id })
        .eq('id', result.appointmentId)
        .eq('business_id', business.id)
      created.push(date)
    } else {
      // Conflicto o dato inválido → SALTEAR + REGISTRAR, nunca pisar el turno ajeno (D-06). slot_taken/
      // slot_full son el caso esperado (slot ocupado / cupo lleno / espacio tomado). invalid_service/
      // invalid_professional/insert_failed se registran igual (defensivo) y la serie CONTINÚA.
      skipped.push({ date, reason: result.error })
    }
  }

  return { created, skipped }
}
