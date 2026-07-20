import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasSupabaseCreds } from './env'
import { seedOneTenant, teardownOneTenant, seedTimeBlock, type SeededTenant } from './helpers/booking-fixtures'
import { generateAbonoOccurrences } from '@/lib/abono-generation'

// ── Tests del motor de generación forward del abono (lib/abono-generation.ts) ─────────────
// Prueban contra la DB local (Supabase, migr. 054 aplicada) la garantía sensible de la fase: crear
// turnos programáticamente NO abre una grieta de doble-booking. Cada ocurrencia pasa por
// createAppointmentCore (mismo núcleo atómico del booking); ante conflicto se SALTEA + registra sin
// pisar; queda etiquetada por abono_id; es idempotente; y solo toca filas del business del abono.
//
// describe.skipIf(!hasSupabaseCreds): sin las creds de Supabase, se skipean (igual que booking-core).
// Se usa el service-role del fixture como el `supabase` del motor: es rol-agnóstico y acá NO se asierta
// RLS (eso es de isolation.test.ts) sino la lógica del motor.
//
// Rango fijo de agosto→marzo en el futuro para no chocar con lógica de turnos pasados. El fixture usa
// 2031-03-03 = LUNES (dow=1). Los lunes del rango [2031-03-03, 2031-03-31] son 03/10/17/24/31 (5).
const FROM = '2031-03-03'
const TO = '2031-03-31'
const MONDAYS = ['2031-03-03', '2031-03-10', '2031-03-17', '2031-03-24', '2031-03-31']
const START = '10:00'

describe.skipIf(!hasSupabaseCreds)('abono-generation: generateAbonoOccurrences', () => {
  let t: SeededTenant
  let other: SeededTenant
  let supabase: SupabaseClient
  let clientId: string
  let abonoId: string

  beforeAll(async () => {
    t = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })
    other = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })
    supabase = t.admin

    // Grilla semanal: lunes 08:00–20:00, cupo 1 (así 10:00 cae dentro y el slot es individual).
    await seedTimeBlock(t, { capacity: 1, dayOfWeek: 1, startTime: '08:00', endTime: '20:00' })
    // El OTHER también necesita su grilla para el test de aislamiento (su turno pre-existente vive ahí).
    await seedTimeBlock(other, { capacity: 1, dayOfWeek: 1, startTime: '08:00', endTime: '20:00' })

    // Cliente + abono reales: abono_id es FK a abonos(id), así que la fila DEBE existir para el UPDATE.
    const insClient = await t.admin
      .from('clients')
      .insert({ business_id: t.businessId, name: 'Cliente Abono', phone: '1122334455', email: 'abono@test.com' })
      .select('id')
      .single()
    if (insClient.error || !insClient.data) throw new Error(`seed client: ${insClient.error?.message}`)
    clientId = insClient.data.id

    const insAbono = await t.admin
      .from('abonos')
      .insert({
        business_id: t.businessId,
        client_id: clientId,
        service_id: t.serviceId,
        professional_id: t.professionalId,
        location_id: t.locationId,
        day_of_week: 1,
        start_time: START,
      })
      .select('id')
      .single()
    if (insAbono.error || !insAbono.data) throw new Error(`seed abono: ${insAbono.error?.message}`)
    abonoId = insAbono.data.id
  })

  afterAll(async () => {
    if (t) await teardownOneTenant(t)
    if (other) await teardownOneTenant(other)
  })

  // Limpieza entre tests: appointments + schedule_exceptions de AMBOS tenants (config persistente —
  // time_block/client/abono — se deja). Así cada test arranca con la agenda vacía y sin excepciones.
  afterEach(async () => {
    if (t) {
      await t.admin.from('appointments').delete().eq('business_id', t.businessId)
      await t.admin.from('schedule_exceptions').delete().eq('business_id', t.businessId)
    }
    if (other) await other.admin.from('appointments').delete().eq('business_id', other.businessId)
  })

  function abono() {
    return {
      id: abonoId,
      client_id: clientId,
      day_of_week: 1,
      start_time: START,
      service_id: t.serviceId,
      professional_id: t.professionalId,
      location_id: t.locationId,
    }
  }
  function business() {
    return { id: t.businessId, buffer_minutes: t.bufferMinutes }
  }

  // (1) Iteración: 1 turno por semana en la fecha/hora correctas, cada uno etiquetado con abono_id.
  it('1 — genera 1 turno por lunes del rango, cada uno con abono_id', async () => {
    const res = await generateAbonoOccurrences({ supabase, business: business(), abono: abono(), fromDate: FROM, toDate: TO })
    expect(res.skipped).toEqual([])
    expect([...res.created].sort()).toEqual(MONDAYS)

    // Verificación independiente contra la DB: 5 turnos, en las fechas correctas, a las 10:00, con abono_id.
    const { data: appts } = await t.admin
      .from('appointments')
      .select('date, time, abono_id')
      .eq('business_id', t.businessId)
      .eq('abono_id', abonoId)
      .order('date')
    expect(appts?.length).toBe(5)
    expect(appts?.map(a => a.date)).toEqual(MONDAYS)
    expect(appts?.every(a => (a.time as string).slice(0, 5) === START)).toBe(true)
    expect(appts?.every(a => a.abono_id === abonoId)).toBe(true)
  })

  // (2) Paso por booking-core / no-pisa: un turno ajeno ocupa un slot; esa fecha se saltea (slot_taken),
  // el ocupante queda INTACTO (mismo id, sin abono_id) y las demás fechas SÍ se generan.
  it('2 — saltea el slot ocupado (slot_taken) sin pisar el turno pre-existente', async () => {
    const busyDate = '2031-03-17'
    const occ = await t.admin
      .from('appointments')
      .insert({
        business_id: t.businessId,
        client_name: 'Ocupante Ajeno',
        service_id: t.serviceId,
        professional_id: t.professionalId,
        location_id: t.locationId,
        date: busyDate,
        time: START,
        duration_minutes: 30,
        status: 'confirmed',
      })
      .select('id')
      .single()
    expect(occ.error).toBeNull()
    const occId = occ.data!.id

    const res = await generateAbonoOccurrences({ supabase, business: business(), abono: abono(), fromDate: FROM, toDate: TO })
    // La fecha ocupada cae en skipped con slot_taken; las otras 4 se generan.
    expect(res.skipped).toEqual([{ date: busyDate, reason: 'slot_taken' }])
    expect([...res.created].sort()).toEqual(MONDAYS.filter(d => d !== busyDate))

    // El ocupante queda INTACTO: mismo id, sin reasignar, con abono_id null (no es del abono).
    const { data: occAfter } = await t.admin
      .from('appointments')
      .select('id, abono_id, client_name')
      .eq('id', occId)
      .single()
    expect(occAfter?.id).toBe(occId)
    expect(occAfter?.abono_id).toBeNull()
    expect(occAfter?.client_name).toBe('Ocupante Ajeno')
    // Ningún turno del abono cayó en la fecha ocupada.
    const { data: abonoOnBusy } = await t.admin
      .from('appointments')
      .select('id')
      .eq('business_id', t.businessId)
      .eq('abono_id', abonoId)
      .eq('date', busyDate)
    expect(abonoOnBusy?.length).toBe(0)
  })

  // (3) Idempotencia: correr dos veces sobre el mismo rango no duplica turnos.
  it('3 — es idempotente: la 2ª corrida no crea duplicados', async () => {
    const first = await generateAbonoOccurrences({ supabase, business: business(), abono: abono(), fromDate: FROM, toDate: TO })
    expect(first.created.length).toBe(5)

    const second = await generateAbonoOccurrences({ supabase, business: business(), abono: abono(), fromDate: FROM, toDate: TO })
    // La 2ª corrida no crea (todas idempotent-skip) ni registra skipped.
    expect(second.created).toEqual([])
    expect(second.skipped).toEqual([])

    // Count total del abono sigue en 5 (no duplicó).
    const { count } = await t.admin
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', t.businessId)
      .eq('abono_id', abonoId)
    expect(count).toBe(5)
  })

  // (4) Día cerrado: una schedule_exception closed=true saltea esa fecha SIN llamar al alta.
  it('4 — saltea la fecha con schedule_exception closed=true (day_closed), sin crear turno', async () => {
    const closedDate = '2031-03-17'
    const insExc = await t.admin
      .from('schedule_exceptions')
      .insert({ business_id: t.businessId, date: closedDate, closed: true, location_id: null })
    expect(insExc.error).toBeNull()

    const res = await generateAbonoOccurrences({ supabase, business: business(), abono: abono(), fromDate: FROM, toDate: TO })
    expect(res.skipped).toEqual([{ date: closedDate, reason: 'day_closed' }])
    expect([...res.created].sort()).toEqual(MONDAYS.filter(d => d !== closedDate))

    // NO se creó ningún turno esa fecha (el core no fue llamado).
    const { data: onClosed } = await t.admin
      .from('appointments')
      .select('id')
      .eq('business_id', t.businessId)
      .eq('date', closedDate)
    expect(onClosed?.length).toBe(0)
  })

  // (5) Horario especial (augmentation): schedule_exception closed=false cuya ventana EXCLUYE start_time
  // → esa fecha cae en out_of_hours (la excepción OVERRIDE la grilla semanal), el core NO se llama, y el
  // resto de la serie SÍ se genera. Prueba la precedencia por fecha del horario especial.
  it('5 — saltea la fecha con horario especial (closed=false) que excluye la hora (out_of_hours)', async () => {
    const specialDate = '2031-03-17'
    // Ventana especial 14:00–18:00: 10:00 del abono queda FUERA, aunque caiga dentro del bloque semanal 08–20.
    const insExc = await t.admin
      .from('schedule_exceptions')
      .insert({ business_id: t.businessId, date: specialDate, closed: false, start_time: '14:00', end_time: '18:00', location_id: null })
    expect(insExc.error).toBeNull()

    const res = await generateAbonoOccurrences({ supabase, business: business(), abono: abono(), fromDate: FROM, toDate: TO })
    expect(res.skipped).toEqual([{ date: specialDate, reason: 'out_of_hours' }])
    expect([...res.created].sort()).toEqual(MONDAYS.filter(d => d !== specialDate))

    // NO se creó turno esa fecha (el core no fue llamado por estar fuera del horario especial).
    const { data: onSpecial } = await t.admin
      .from('appointments')
      .select('id')
      .eq('business_id', t.businessId)
      .eq('date', specialDate)
    expect(onSpecial?.length).toBe(0)
  })

  // (6) Aislamiento (D-10): un turno de OTRO business en el mismo slot/fecha NO bloquea ni se toca.
  it('6 — no cruza tenants: un turno de otro business en el mismo slot no bloquea ni se altera', async () => {
    const sameDate = '2031-03-17'
    const otherOcc = await other.admin
      .from('appointments')
      .insert({
        business_id: other.businessId,
        client_name: 'Turno Otro Negocio',
        service_id: other.serviceId,
        professional_id: other.professionalId,
        location_id: other.locationId,
        date: sameDate,
        time: START,
        duration_minutes: 30,
        status: 'confirmed',
      })
      .select('id')
      .single()
    expect(otherOcc.error).toBeNull()
    const otherId = otherOcc.data!.id

    const res = await generateAbonoOccurrences({ supabase, business: business(), abono: abono(), fromDate: FROM, toDate: TO })
    // El turno ajeno NO bloquea: las 5 fechas se generan igual.
    expect(res.skipped).toEqual([])
    expect([...res.created].sort()).toEqual(MONDAYS)

    // El turno del otro negocio queda intacto (no se leyó ni escribió).
    const { data: otherAfter } = await other.admin
      .from('appointments')
      .select('id, abono_id, client_name')
      .eq('id', otherId)
      .single()
    expect(otherAfter?.id).toBe(otherId)
    expect(otherAfter?.abono_id).toBeNull()
    expect(otherAfter?.client_name).toBe('Turno Otro Negocio')
  })
})
