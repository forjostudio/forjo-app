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
// 21:00 cae FUERA de la grilla semanal del fixture (lunes 08:00–20:00): D-06′ dice que igual se genera.
const START_LATE = '21:00'

// Espejo del tope duro del motor (MAX_OCCURRENCES_PER_RUN en lib/abono-generation.ts, GAP-01). Se
// duplica acá a propósito: el test asierta el CONTRATO (el motor nunca recorre más de N ocurrencias en
// una corrida), no el símbolo. Si el tope cambia, este número tiene que cambiar con intención.
const MAX_OCCURRENCES_PER_RUN = 520

describe.skipIf(!hasSupabaseCreds)('abono-generation: generateAbonoOccurrences', () => {
  let t: SeededTenant
  let other: SeededTenant
  let supabase: SupabaseClient
  let clientId: string
  let abonoId: string
  let abonoLateId: string // abono a las 21:00 — FUERA de la grilla semanal (D-06′: ya no se saltea)

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

    // Segundo abono, MISMA serie pero a las 21:00 — fuera del bloque semanal 08:00–20:00. Existe para
    // probar D-06′: el abono del dueño ya NO se gatea por horario semanal (antes daba out_of_hours).
    const insAbonoLate = await t.admin
      .from('abonos')
      .insert({
        business_id: t.businessId,
        client_id: clientId,
        service_id: t.serviceId,
        professional_id: t.professionalId,
        location_id: t.locationId,
        day_of_week: 1,
        start_time: START_LATE,
      })
      .select('id')
      .single()
    if (insAbonoLate.error || !insAbonoLate.data) throw new Error(`seed abono late: ${insAbonoLate.error?.message}`)
    abonoLateId = insAbonoLate.data.id
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

  // (5) D-06′ — el abono del dueño NO se gatea por horario semanal: una serie a las 21:00, SIN ningún
  // time_block que la cubra (la grilla del fixture es 08:00–20:00), SE GENERA igual. Antes esto daba
  // out_of_hours; ese skip se eliminó porque el alta manual de turno del dueño tampoco chequea horario
  // (el abono era MÁS restrictivo que poner el turno a mano). El anti-doble-booking del core no se toca.
  it('5 — genera fuera de la grilla semanal (21:00 sin time_block): ya no hay skip out_of_hours', async () => {
    const res = await generateAbonoOccurrences({
      supabase,
      business: business(),
      abono: { ...abono(), id: abonoLateId, start_time: START_LATE },
      fromDate: FROM,
      toDate: TO,
    })
    expect(res.skipped).toEqual([])
    expect([...res.created].sort()).toEqual(MONDAYS)

    const { data: appts } = await t.admin
      .from('appointments')
      .select('date, time')
      .eq('business_id', t.businessId)
      .eq('abono_id', abonoLateId)
      .order('date')
    expect(appts?.length).toBe(5)
    expect(appts?.every(a => (a.time as string).slice(0, 5) === START_LATE)).toBe(true)
  })

  // (5b) Mismo D-06′ del lado de las excepciones: una schedule_exception closed=false con ventana
  // 14:00–18:00 (que EXCLUYE las 10:00 del abono) ya NO saltea. Sólo closed=true corta (test 4).
  it('5b — el horario especial (closed=false) que excluye la hora ya no saltea: genera igual', async () => {
    const specialDate = '2031-03-17'
    const insExc = await t.admin
      .from('schedule_exceptions')
      .insert({ business_id: t.businessId, date: specialDate, closed: false, start_time: '14:00', end_time: '18:00', location_id: null })
    expect(insExc.error).toBeNull()

    const res = await generateAbonoOccurrences({ supabase, business: business(), abono: abono(), fromDate: FROM, toDate: TO })
    expect(res.skipped).toEqual([])
    expect([...res.created].sort()).toEqual(MONDAYS)

    const { data: onSpecial } = await t.admin
      .from('appointments')
      .select('id')
      .eq('business_id', t.businessId)
      .eq('abono_id', abonoId)
      .eq('date', specialDate)
    expect(onSpecial?.length).toBe(1)
  })

  // (5c) D-07′ — abono FINITO: maxCreated acota cuántos turnos REALES junta esta corrida. Con
  // maxCreated=2 sobre un rango de 5 lunes se generan exactamente los 2 primeros y el loop CORTA
  // (no se tocan las semanas siguientes; el resto lo extiende el cron con maxCreated = N − generados).
  it('5c — maxCreated=2 sobre 5 semanas: genera exactamente 2 y corta', async () => {
    const res = await generateAbonoOccurrences({
      supabase,
      business: business(),
      abono: abono(),
      fromDate: FROM,
      toDate: TO,
      maxCreated: 2,
    })
    expect(res.skipped).toEqual([])
    expect(res.created).toEqual(MONDAYS.slice(0, 2))

    const { data: appts } = await t.admin
      .from('appointments')
      .select('date')
      .eq('business_id', t.businessId)
      .eq('abono_id', abonoId)
      .order('date')
    expect(appts?.map(a => a.date)).toEqual(MONDAYS.slice(0, 2))
  })

  // (5d) D-07′ — un CHOQUE no consume sesión: con el 2º lunes ocupado por un turno ajeno y maxCreated=2,
  // el motor saltea esa fecha (slot_taken) y sigue hasta juntar 2 turnos REALES (lunes 1 y 3).
  it('5d — un choque no consume sesión: maxCreated=2 junta 2 turnos reales salteando el ocupado', async () => {
    const busyDate = MONDAYS[1]
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

    const res = await generateAbonoOccurrences({
      supabase,
      business: business(),
      abono: abono(),
      fromDate: FROM,
      toDate: TO,
      maxCreated: 2,
    })
    expect(res.skipped).toEqual([{ date: busyDate, reason: 'slot_taken' }])
    expect(res.created).toEqual([MONDAYS[0], MONDAYS[2]])
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

  // ── GAP-01 (T-06-08/17/24): el motor NO puede loopear sin fin con NINGUNA entrada ─────────────
  // (7) Rango con formato inválido → vacío al toque, sin tocar la DB. El caso canónico es
  // 'NaN-NaN-NaN': el toISODate de los callers arma el string a mano desde getFullYear()/getMonth()/
  // getDate(), así que un Date inválido NO tira — produce esa cadena. Y la vieja guarda
  // `fromDate > toDate` compara STRINGS: '2031-03-03' > 'NaN-NaN-NaN' es false ('2' < 'N'), así que
  // no disparaba y el `for` iteraba para siempre. La validación de formato mata la clase entera.
  it('7 — rango con formato inválido (incl. NaN-NaN-NaN) → devuelve vacío sin tocar la DB', async () => {
    const bad: [string, string][] = [
      ['NaN-NaN-NaN', 'NaN-NaN-NaN'],
      [FROM, 'NaN-NaN-NaN'], // el caso explotable: from válido + to degenerado = loop infinito
      ['NaN-NaN-NaN', TO],
      ['', TO],
      [FROM, ''],
      ['2031-3-3', TO], // sin zero-pad: no es 'yyyy-MM-dd'
      ['abc', 'def'],
    ]
    for (const [fromDate, toDate] of bad) {
      const res = await generateAbonoOccurrences({ supabase, business: business(), abono: abono(), fromDate, toDate })
      expect(res).toEqual({ created: [], skipped: [] })
    }

    // Ni un solo turno creado por ninguna de esas corridas.
    const { count } = await t.admin
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', t.businessId)
    expect(count).toBe(0)
  }, 60_000)

  // (8) Tope duro de iteraciones: aunque el rango sea válido pero absurdo (50 años ≈ 2600 lunes), el
  // motor corta en MAX_OCCURRENCES_PER_RUN. Backstop puro: con la ventana clampeada a ≤52 semanas
  // nunca se toca. Se usa el service de OTRO tenant para que el core corte en invalid_service (1
  // query, sin insert): así el tope se cuenta barato y sin materializar 520 turnos reales.
  it('8 — tope duro: un rango de 50 años termina y no supera MAX_OCCURRENCES_PER_RUN', async () => {
    const res = await generateAbonoOccurrences({
      supabase,
      business: business(),
      abono: { ...abono(), service_id: other.serviceId, professional_id: null, location_id: null },
      fromDate: FROM,
      toDate: '2081-03-03', // ~2609 lunes: 5x por encima del tope
    })
    expect(res.created).toEqual([])
    expect(res.skipped.length).toBe(MAX_OCCURRENCES_PER_RUN)
    expect(res.skipped.every((s) => s.reason === 'invalid_service')).toBe(true)

    // El service ajeno nunca pudo reservar nada en este negocio.
    const { count } = await t.admin
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', t.businessId)
    expect(count).toBe(0)
  }, 180_000)
})
