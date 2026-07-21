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
// / conflicto de espacio / día cerrado) la ocurrencia se SALTEA y se registra en `skipped`; jamás se
// pisa un turno ajeno pre-existente (D-06).
//
// POR QUÉ NO HAY GUARDA DE HORARIO (D-06′): el abono del dueño NO se gatea por la grilla semanal
// (`time_blocks`) ni por el horario especial de una excepción `closed=false`. Razón: el alta MANUAL de
// un turno (app/api/appointments/create) tampoco chequea horario — con la guarda puesta, el abono era
// MÁS restrictivo que poner el mismo turno a mano, y el dueño no podía armar series fuera de horario
// (turno a las 21:00, sábado sin bloque cargado, etc.). Se conserva SÓLO el skip `day_closed`
// (excepción `closed=true` = feriado): ahí el negocio explícitamente NO abre. Quitar una guarda
// PRE-core no relaja el anti-doble-booking: 011/013/cupo/espacio siguen siendo atómicos en la DB y un
// slot tomado sigue devolviendo slot_taken (T-06-22).
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
  // Tope de turnos REALES a crear en esta corrida (D-07′, abono FINITO de N sesiones). El caller pasa
  // `maxCreated = N − generados`; al alcanzarlo el loop CORTA. Ausente → indefinido (recorre todo el
  // rango). Sólo `created` cuenta: un CHOQUE (skipped) NO consume sesión, así que el finito sigue a la
  // semana siguiente hasta juntar N turnos reales. maxCreated sólo ACOTA la generación, nunca la fuerza:
  // no altera ninguna validación del core (T-06-23).
  maxCreated?: number
}

export type GenerateAbonoResult = {
  created: string[] // fechas 'yyyy-MM-dd' de las ocurrencias generadas OK
  skipped: { date: string; reason: string }[] // ocurrencias salteadas + razón (D-06)
}

// addDaysUTC: aritmética de fechas en UTC puro para no cruzar DST ni desfasar el día. Devuelve
// 'yyyy-MM-dd'. Comparar strings 'yyyy-MM-dd' lexicográficamente equivale a comparar fechas.
function addDaysUTC(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function generateAbonoOccurrences(input: GenerateAbonoInput): Promise<GenerateAbonoResult> {
  const { supabase, business, abono, fromDate, toDate, maxCreated } = input
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

  const timeHHmm = abono.start_time.slice(0, 5) // el core espera 'HH:mm'

  // (2) Iterar SOLO las fechas del rango cuyo dow == abono.day_of_week. Se calcula la primera fecha
  // que matchea desde fromDate y se avanza de a 7 días (NO día a día: acota el loop, T-06-08).
  const fromDow = new Date(`${fromDate}T00:00:00Z`).getUTCDay()
  const firstDelta = (abono.day_of_week - fromDow + 7) % 7
  let date = addDaysUTC(fromDate, firstDelta)

  for (; date <= toDate; date = addDaysUTC(date, 7)) {
    // (2b) Tope del abono FINITO (D-07′): ya juntamos las sesiones pedidas en esta corrida → cortar.
    // Se evalúa sobre `created` (turnos REALES), NO sobre las fechas recorridas: un choque no consume
    // sesión. Va ANTES de cualquier query para no gastar viajes a la DB de más.
    if (maxCreated != null && created.length >= maxCreated) break

    // (3) Única guarda pre-core que queda (D-06′): DÍA CERRADO. Se traen las schedule_exceptions de esa
    // fecha aplicables al abono (global location_id=null O el location del abono) y se elige la MÁS
    // específica (la del location gana sobre la global). Si esa excepción dice `closed=true`, el negocio
    // explícitamente NO abre ese día → se saltea sin llamar al core. Cualquier otro caso (sin excepción,
    // excepción closed=false con horario especial que no cubre la hora, hora fuera de la grilla semanal)
    // SIGUE DE LARGO hacia el core: el dueño puede armar la serie a la hora que quiera, igual que cuando
    // carga un turno a mano. El core es el que decide si el slot está libre.
    const { data: exceptions } = await supabase
      .from('schedule_exceptions')
      .select('closed, location_id')
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

    // Día cerrado por excepción (global o del location del abono) → saltear, no llamar al core.
    if (exc?.closed === true) {
      skipped.push({ date, reason: 'day_closed' })
      continue
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
