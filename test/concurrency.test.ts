import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasSupabaseCreds } from './env'
import { seedOneTenant, teardownOneTenant, seedTimeBlock, seedSpace, seedAgendaSpace, seedProfessional, seedSimultaneousService, seedService, seedExpiredHold, type SeededTenant } from './helpers/booking-fixtures'
import { createAppointmentCore } from '@/lib/booking-core'
import { GET as availabilityGET } from '@/app/api/booking/availability/route'
import type { NextRequest } from 'next/server'

// ── Tests de concurrencia: cupos grupales (Phase 2 — CONC-01, CONC-02, CUPOS-03, CUPOS-02) ──
//
// Criterio de éxito DURO de la fase. La garantía atómica anti-sobrecupo y la cero-regresión cupo 1
// viven en la DB (book_slot_atomic, migración 041): estos tests son la única prueba de que funcionan
// bajo concurrencia real. El advisory lock del RPC serializa en la DB independientemente del orden de
// llegada → CONC-01 es DETERMINISTA (siempre 1 ok + 1 full), no flaky.
//
// describe.skipIf(!hasSupabaseCreds): sin las 3 creds de Supabase, se skipean (igual que booking-core).
// Corren contra Supabase LOCAL (supabase db reset PG17, con 041 aplicada → book_slot_atomic existe).
// Se usa el cliente service-role del helper como el `supabase` del core: el core es rol-agnóstico y
// acá NO se asierta RLS sino la lógica del cupo (advisory lock + count vs capacity en la DB).
//
// Fecha futura fija (lunes) para alinear con el day_of_week del time_block sembrado (seedTimeBlock
// default day_of_week=1) y no chocar con turnos pasados.
const DATE = '2031-03-03' // lunes → EXTRACT(dow) = 1

describe.skipIf(!hasSupabaseCreds)('concurrencia: cupos grupales', () => {
  let t: SeededTenant
  let supabase: SupabaseClient

  beforeAll(async () => {
    // Tenant con buffer 0 y servicio de 30'. El time_block lo siembra cada test con su capacity
    // (CONC-01/CUPOS-03 cupo N; CONC-02 cupo 1), así que acá NO se siembra el bloque por defecto.
    t = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })
    supabase = t.admin
  })

  afterAll(async () => {
    if (t) await teardownOneTenant(t)
  })

  // Cada test limpia appointments + time_blocks para no contaminar al siguiente (mismo business/date).
  afterEach(async () => {
    if (t) {
      await t.admin.from('appointments').delete().eq('business_id', t.businessId)
      await t.admin.from('time_blocks').delete().eq('business_id', t.businessId)
      // CONC-03 mapea agendas a espacios: limpiar para no contaminar otros tests del mismo business
      // (agenda_spaces antes que spaces por la FK; appointment_spaces cae por CASCADE de appointments).
      await t.admin.from('agenda_spaces').delete().eq('business_id', t.businessId)
      await t.admin.from('spaces').delete().eq('business_id', t.businessId)
      // (Phase 12) Los casos CUPO-04/CUPO-02 ponen el service en modo RECURSO SIMULTÁNEO. El tenant y
      // el service son COMPARTIDOS por todo el archivo, así que hay que devolverlos al DEFAULT o los
      // casos siguientes (CONC-01/02, CUPOS-02/03) medirían el otro modo.
      //
      // (Phase 15 / migr. 068) El DEFAULT pasó a ser 'individual'/1. La combinación vieja
      // ('group_class'/1) ya NO se puede escribir: el CHECK de coherencia la rechaza con 23514 porque
      // un grupal de cupo 1 era indistinguible de un individual.
      await t.admin
        .from('services')
        .update({ capacity_mode: 'individual', capacity: 1 })
        .eq('id', t.serviceId)
        .eq('business_id', t.businessId)
    }
  })

  // baseInput: el molde EXACTO de booking-core.test.ts. professionalId fijo (NO null) para que las
  // distintas reservas del mismo slot caigan SIEMPRE en el mismo bucket — Pitfall 1: nunca mezclar
  // professional_id null y la sentinela entre reservas del mismo slot (el advisory lock y el índice
  // bucketizan por COALESCE(professional_id, sentinel); mezclar rompería la serialización).
  function baseInput() {
    return {
      supabase,
      business: { id: t.businessId, buffer_minutes: t.bufferMinutes },
      serviceId: t.serviceId,
      professionalId: t.professionalId,
      locationId: t.locationId,
      date: DATE,
      clientId: null,
      clientName: 'Cliente Test',
      clientPhone: null,
      clientEmail: null,
      notes: null,
      requireDeposit: false,
    }
  }

  // Cuenta independiente (con t.admin) de filas que OCUPAN un slot: confirmed + pending_payment.
  // Es la verificación que NO confía en los resultados del core sino en el estado real de la DB.
  async function occupantsAt(time: string): Promise<number> {
    const { data } = await t.admin
      .from('appointments')
      .select('id')
      .eq('business_id', t.businessId)
      .eq('date', DATE)
      .eq('time', time)
      .in('status', ['confirmed', 'pending_payment'])
    return (data || []).length
  }

  // ── Phase 12 (recurso simultáneo): assert DURO por INTERVALO, no por hora exacta ──────────────
  // occupantsAt() sirve para el grupal (todos arrancan en el mismo `time`), pero el cupo del recurso
  // simultáneo se decide por SOLAPE: los turnos escalonados (16:00 / 16:10 / 16:20) tienen `time`
  // distinto y aun así comparten el instante [16:20,16:30). Este helper cuenta las filas del MISMO
  // service_id cuyo intervalo [time, time + duration) CONTIENE el instante — el mismo conjunto que
  // mira el gate del RPC (062:309-322: business_id + service_id + date + estados que ocupan). Se
  // cuenta con t.admin contra la DB REAL, nunca con los retornos de createAppointmentCore: si el
  // advisory lock service-day fallara habría N+1 filas y este assert es lo único que lo detecta.
  function minutesOf(t24: string): number {
    const [h, m] = t24.split(':').map(Number) // 'HH:MM' o 'HH:MM:SS' (Postgres devuelve con segundos)
    return h * 60 + m
  }
  async function occupantsCovering(instant: string): Promise<number> {
    const { data } = await t.admin
      .from('appointments')
      .select('time, duration_minutes')
      .eq('business_id', t.businessId)
      .eq('service_id', t.serviceId)
      .eq('date', DATE)
      .in('status', ['confirmed', 'pending_payment'])
    const at = minutesOf(instant)
    return (data || []).filter(a => {
      const start = minutesOf(a.time as string)
      const end = start + Number(a.duration_minutes ?? 30)
      return at >= start && at < end // [inicio, fin) — mismo criterio semiabierto que tsrange &&
    }).length
  }

  // Variante por AGENDA (bucket), sin filtrar por servicio: cuenta TODOS los turnos que ocupan la
  // agenda del profesional del fixture en un instante dado. Es el assert del caso CR-02: la garantía
  // que se prueba ahí no es "cuántos turnos de este servicio" (eso es el carril del cupo) sino
  // "cuántos turnos, de cualquier servicio, se pisan en la MISMA agenda" — el anti-doble-booking de
  // v0.9/v0.12 que el modo simultáneo NO puede desactivar.
  async function occupantsOfBucketCovering(instant: string): Promise<number> {
    const { data } = await t.admin
      .from('appointments')
      .select('time, duration_minutes')
      .eq('business_id', t.businessId)
      .eq('professional_id', t.professionalId)
      .eq('date', DATE)
      .in('status', ['confirmed', 'pending_payment'])
    const at = minutesOf(instant)
    return (data || []).filter(a => {
      const start = minutesOf(a.time as string)
      const end = start + Number(a.duration_minutes ?? 30)
      return at >= start && at < end
    }).length
  }

  // CONC-01 — anti-sobrecupo bajo concurrencia. Con capacity=2 y 1 lugar ya ocupado, dos altas EN
  // PARALELO sobre el último lugar deben resolver exactamente 1 ok + 1 slot_full. El advisory lock
  // del RPC (book_slot_atomic) serializa la carrera DENTRO de la DB: aunque las dos llamadas lleguen
  // a la vez, la 1ª toma el lock, cuenta (1 < 2) e inserta seat 1; la 2ª espera el lock, recuenta
  // (2 >= 2) y RAISE 'slot_full'. Por eso es DETERMINISTA, no flaky. La verificación clave es el
  // estado de la DB: exactamente 2 filas ocupando el slot (no 3) — la prueba real de que no hubo
  // sobrecupo (T-02-16).
  it('CONC-01 — anti-sobrecupo: dos reservas concurrentes sobre el último lugar, solo una confirma', async () => {
    await seedTimeBlock(t, { capacity: 2 })

    // Ocupa el seat 0 (deja exactamente 1 lugar libre).
    const seed = await createAppointmentCore({ ...baseInput(), time: '09:00' })
    expect(seed.ok).toBe(true)

    // Dos altas EN PARALELO peleando por el último lugar.
    const [a, b] = await Promise.all([
      createAppointmentCore({ ...baseInput(), time: '09:00' }),
      createAppointmentCore({ ...baseInput(), time: '09:00' }),
    ])

    const oks = [a, b].filter(r => r.ok)
    const fulls = [a, b].filter(r => !r.ok && r.error === 'slot_full')
    expect(oks.length).toBe(1)
    expect(fulls.length).toBe(1)

    // Verificación independiente del estado de la DB: exactamente capacity (2) filas ocupando el
    // slot — NO 3. Si el advisory lock fallara, habría 3 (sobrecupo) y este assert lo detectaría.
    expect(await occupantsAt('09:00')).toBe(2)
  })

  // CONC-02 — no-regresión cupo 1: con capacity=1, la 2ª reserva del mismo slot debe dar slot_taken
  // (NO slot_full). Para cupo 1, el índice único de seat (seat 0 único por slot) rechaza la 2ª con
  // 23505 → el core lo traduce a slot_taken, igual que el anti-doble-booking de v0.9. Es la guarda
  // de cero-regresión: si esto diera slot_full, enmascararía una regresión del camino cupo 1 (T-02-17).
  it('CONC-02 — no-regresion: capacity=1 sigue rechazando la 2ª con slot_taken', async () => {
    await seedTimeBlock(t, { capacity: 1 })

    const first = await createAppointmentCore({ ...baseInput(), time: '10:00' })
    expect(first.ok).toBe(true)

    const second = await createAppointmentCore({ ...baseInput(), time: '10:00' })
    expect(second.ok).toBe(false)
    if (!second.ok) {
      // Explícitamente slot_taken, NUNCA slot_full: cupo 1 es doble-booking clásico, no cupo lleno.
      expect(second.error).toBe('slot_taken')
      expect(second.status).toBe(409)
    }
    // Y la DB conserva exactamente 1 fila (la 2ª no entró).
    expect(await occupantsAt('10:00')).toBe(1)
  })

  // CUPOS-03 — admite hasta capacity y rechaza el excedente. Con capacity=N, las primeras N altas
  // secuenciales confirman (seats 0..N-1) y la (N+1)ª da slot_full. Verificación DB: exactamente N
  // filas ocupando el slot.
  it('CUPOS-03 — admite hasta capacity y rechaza el excedente con slot_full', async () => {
    const N = 3
    await seedTimeBlock(t, { capacity: N })

    // N altas secuenciales: todas ok.
    for (let i = 0; i < N; i++) {
      const res = await createAppointmentCore({ ...baseInput(), time: '11:00' })
      expect(res.ok).toBe(true)
    }

    // La (N+1)ª excede la capacity → slot_full.
    const extra = await createAppointmentCore({ ...baseInput(), time: '11:00' })
    expect(extra.ok).toBe(false)
    if (!extra.ok) {
      expect(extra.error).toBe('slot_full')
      expect(extra.status).toBe(409)
    }

    // Exactamente N filas ocupando el slot (no N+1).
    expect(await occupantsAt('11:00')).toBe(N)
  })

  // CUPOS-02 — availability no filtra lugares restantes (D-06). El público SOLO recibe disponible/
  // lleno: la respuesta es `{ ok, busy, full }` y NUNCA contiene el conteo de ocupantes por slot, ni
  // `remaining`, ni una entrada por inscripto que permita inferir cuántos lugares quedan (T-02-18).
  //
  // Además fija las dos regresiones del UAT:
  //   (a) un slot GRUPAL LLENO aparece en `full` en formato 'HH:MM' (no 'HH:MM:SS') para que el
  //       client lo matchee por igualdad de string.
  //   (b) un slot GRUPAL PARCIAL (M < capacity) NO está en `busy` (la ocupación grupal no debe
  //       removerse por el camino de solapamiento) NI en `full` (sigue reservable).
  //   (c) para capacity=1, el slot ocupado SÍ está en busy y en full (coinciden).
  it('CUPOS-02 — availability no filtra lugares restantes (busy/full sin conteo)', async () => {
    // Bloque grupal capacity=3 en la ventana default; un slot individual lo modelamos con su propio
    // bloque capacity=1 que se solapa en otra franja horaria (12:00..13:00) sin chocar con el grupal.
    await seedTimeBlock(t, { capacity: 3, startTime: '08:00', endTime: '12:00' })
    await seedTimeBlock(t, { capacity: 1, startTime: '12:00', endTime: '20:00' })

    // Slot grupal PARCIAL: 2 de 3 lugares en '09:00' (M < capacity → reservable, no lleno).
    for (let i = 0; i < 2; i++) {
      const r = await createAppointmentCore({ ...baseInput(), time: '09:00' })
      expect(r.ok).toBe(true)
    }
    // Slot grupal LLENO: 3 de 3 en '10:00'.
    for (let i = 0; i < 3; i++) {
      const r = await createAppointmentCore({ ...baseInput(), time: '10:00' })
      expect(r.ok).toBe(true)
    }
    // Slot INDIVIDUAL ocupado: 1 de 1 en '12:30' (cupo 1 → busy y full coinciden).
    const ind = await createAppointmentCore({ ...baseInput(), time: '12:30' })
    expect(ind.ok).toBe(true)

    // El slug del fixture no se expone en SeededTenant: lo leemos de la DB con t.admin (el endpoint
    // resuelve el tenant por slug). NO modificamos el fixture (este plan solo toca concurrency.test.ts).
    const { data: bizRow } = await t.admin.from('businesses').select('slug').eq('id', t.businessId).single()
    const slug = bizRow?.slug as string

    // Invocar el route handler real (lee request.url, resuelve tenant por slug, service-role).
    const url = `https://test.local/api/booking/availability?slug=${slug}&date=${DATE}&professionalId=${t.professionalId}`
    const res = await availabilityGET(new Request(url) as unknown as NextRequest)
    const body = (await res.json()) as { ok: boolean; busy: unknown[]; full: unknown[] }

    // Forma del contrato: SOLO ok/busy/full. Ninguna clave que revele ocupación restante.
    expect(body.ok).toBe(true)
    expect(Array.isArray(body.busy)).toBe(true)
    expect(Array.isArray(body.full)).toBe(true)
    expect(Object.keys(body).sort()).toEqual(['busy', 'full', 'ok'])

    // No-leak: ninguna entrada de busy expone count/remaining/seat/capacity ni nada que cuente lugares.
    const leakKeys = ['count', 'remaining', 'seat', 'capacity', 'occupied', 'available', 'spots', 'roster']
    for (const entry of body.busy as Record<string, unknown>[]) {
      for (const k of leakKeys) expect(entry).not.toHaveProperty(k)
    }
    // full es un array de strings 'HH:MM' (no objetos con conteo).
    const full = body.full as string[]
    for (const f of full) expect(typeof f).toBe('string')

    // (a) el slot grupal LLENO '10:00' está en full como 'HH:MM' (no 'HH:MM:SS').
    expect(full).toContain('10:00')
    expect(full).not.toContain('10:00:00')

    // (b) el slot grupal PARCIAL '09:00' (2/3) NO está en full (sigue reservable) NI en busy (la
    //     ocupación grupal no se remueve por solapamiento — sino el público no podría reservar el 3º).
    expect(full).not.toContain('09:00')
    const busyTimes = (body.busy as { time: string }[]).map(b => b.time.slice(0, 5))
    expect(busyTimes).not.toContain('09:00')

    // (c) el slot INDIVIDUAL ocupado '12:30' está en busy Y en full (cupo 1 → coinciden).
    expect(busyTimes).toContain('12:30')
    expect(full).toContain('12:30')
  })

  // CONC-03 — anti-conflicto-de-espacio bajo concurrencia (criterio de éxito DURO de Phase 3).
  // Dos reservas EN PARALELO sobre agendas DISTINTAS (dos professional_id reales) que comparten un
  // mismo espacio físico (cancha A), al MISMO horario solapado, no pueden ambas confirmar: exactamente
  // 1 ok + 1 slot_taken.
  //
  // Por qué es DETERMINISTA (no flaky): el RPC book_slot_atomic (migración 042) toma un advisory lock
  // por CADA space_id de la agenda reservada antes de chequear solapes. La 1ª llamada toma el lock de A,
  // inserta y mapea appointment_spaces; la 2ª espera el MISMO lock de A (lo comparten porque ambas
  // agendas están en agenda_spaces→A), recuenta y ve el solape por espacio en la agenda hermana →
  // RAISE slot_taken. El lock por espacio serializa la carrera DENTRO de la DB, igual que el de cupo en
  // CONC-01. La verificación dura no son los retornos del core sino el estado real de la DB: exactamente
  // 1 fila ocupa el slot solapado a través de AMBAS agendas (no 2). Si la exclusión de espacio se
  // rompiera (2 ok), este assert lo detecta (T-03-16).
  it('CONC-03 — anti-conflicto-de-espacio: dos reservas concurrentes sobre agendas que comparten espacio, solo una confirma', async () => {
    // Canchas = cupo 1: el conflicto es por SOLAPE DE ESPACIO, no por cupo lleno (D-03). El time_block
    // capacity=1 cubre a ambas agendas (la ventana/día es del business, no por professional).
    await seedTimeBlock(t, { capacity: 1 })

    // Un espacio físico compartido (cancha A) y una 2ª agenda hermana (professional_id REAL distinto,
    // nunca null/sentinela — Pitfall 1). Mapear AMBAS agendas al MISMO espacio A.
    const spaceA = await seedSpace(t, { name: 'A' })
    const agendaB = await seedProfessional(t, { name: '__test_agenda_B' })
    await seedAgendaSpace(t, { professionalId: t.professionalId, spaceId: spaceA })
    await seedAgendaSpace(t, { professionalId: agendaB, spaceId: spaceA })

    // Dos altas EN PARALELO al MISMO horario '09:00' (misma duración → solapan en tiempo) sobre las dos
    // agendas que comparten A. Overrideamos professionalId distinto en cada una (Pitfall 1).
    const [a, b] = await Promise.all([
      createAppointmentCore({ ...baseInput(), professionalId: t.professionalId, time: '09:00' }),
      createAppointmentCore({ ...baseInput(), professionalId: agendaB, time: '09:00' }),
    ])

    const oks = [a, b].filter(r => r.ok)
    const rejected = [a, b].filter(r => !r.ok && r.error === 'slot_taken')
    expect(oks.length).toBe(1)
    expect(rejected.length).toBe(1)
    const taken = rejected[0]
    if (!taken.ok) expect(taken.status).toBe(409)

    // Verificación independiente del estado de la DB: exactamente 1 fila ocupa el slot solapado a través
    // de AMBAS agendas hermanas (no 2). occupantsAt cuenta por business+date+time+status sin filtrar por
    // agenda, así que captura las dos agendas que comparten el espacio. Si ambas hubieran entrado → 2.
    expect(await occupantsAt('09:00')).toBe(1)
  })

  // ALQUILER-02 — exclusión por espacio compartido SECUENCIAL (booking de canchas, Phase 3).
  // Complementa a CONC-03 (que prueba la carrera concurrente): acá el escenario es SECUENCIAL —
  // reservar una cancha y DESPUÉS intentar la cancha HERMANA que comparte el mismo espacio físico en
  // un horario solapado → la 2ª recibe slot_taken. Es el caso de uso real del booking de alquiler:
  // dos canchas cruzadas (ej. F11 y una de sus componentes A) comparten espacio, reservar una bloquea
  // la otra. La garantía la da el motor v0.12 (book_slot_atomic: advisory lock por espacio + EXISTS
  // cross-bucket), no un check suelto — reuso directo vía createAppointmentCore, cero código nuevo del
  // motor. Verificación DURA: exactamente 1 fila ocupa el slot a través de AMBAS agendas.
  it('ALQUILER-02 — exclusión por espacio (secuencial): reservar una cancha bloquea la hermana que comparte espacio', async () => {
    await seedTimeBlock(t, { capacity: 1 }) // canchas = cupo 1; el conflicto es por espacio.

    // Espacio físico compartido (cancha A) + una 2ª agenda-cancha hermana (professional_id REAL, nunca
    // sentinela — Pitfall 1). Ambas agendas mapeadas al MISMO espacio A → comparten espacio.
    const spaceA = await seedSpace(t, { name: 'A' })
    const agendaB = await seedProfessional(t, { name: '__test_agenda_B_seq' })
    await seedAgendaSpace(t, { professionalId: t.professionalId, spaceId: spaceA })
    await seedAgendaSpace(t, { professionalId: agendaB, spaceId: spaceA })

    // 1ª reserva: cancha A en '09:00' → ok.
    const first = await createAppointmentCore({ ...baseInput(), professionalId: t.professionalId, time: '09:00' })
    expect(first.ok).toBe(true)

    // 2ª reserva: cancha HERMANA (agendaB) en el MISMO '09:00' (solapa en tiempo) → comparten espacio A
    // → slot_taken. La exclusión la impone el RPC (EXISTS cross-bucket por espacio), no un check JS.
    const second = await createAppointmentCore({ ...baseInput(), professionalId: agendaB, time: '09:00' })
    expect(second.ok).toBe(false)
    if (!second.ok) {
      expect(second.error).toBe('slot_taken')
      expect(second.status).toBe(409)
    }

    // Verificación DURA en la DB: exactamente 1 fila ocupa el slot a través de AMBAS agendas hermanas
    // (no 2). Si la exclusión por espacio se rompiera, habría 2 y este assert lo detecta.
    expect(await occupantsAt('09:00')).toBe(1)
  })

  // ── Phase 12 — cupo por SOLAPE del RECURSO SIMULTÁNEO (CUPO-04 / CUPO-02) ─────────────────────
  //
  // CUPO-04 — criterio de éxito DURO de la fase (D-08). Es el test que prueba la RE-GRANULARIZACIÓN
  // del advisory lock (D-06), no solo el conteo por solape.
  //
  // Escenario: servicio 'simultaneous_resource' con capacity=2 (una kinesióloga con 2 camillas),
  // duración 30'. TRES reservas ESCALONADAS lanzadas EN PARALELO cuyos intervalos comparten el
  // instante [16:20,16:30):
  //     A 16:00-16:30   B 16:10-16:40   C 16:20-16:50      (las 3 solapan entre sí de a pares)
  // Como las 3 se pisan mutuamente, el resultado es DETERMINISTA sin importar quién gane la carrera:
  // la 1ª ve 0 solapes, la 2ª ve 1 (< 2) y la 3ª ve 2 (>= 2) → exactamente 2 ok + 1 slot_full.
  //
  // Por qué prueba la re-granularización: con el lock VIEJO (hash(business_id+date+time), 058:82-83)
  // los tres `time` distintos toman locks DISTINTOS, así que las tres transacciones cuentan el solape
  // A LA VEZ (todas ven 0 ó 1 < 2) y las TRES insertan → 3 filas = SOBRECUPO (el bug de la fase 07).
  // Con el lock service-day de la 062 (hash(business_id+service_id+date)) las tres serializan dentro
  // de la DB y la última ve el estado ya comprometido → slot_full. Verificado A/B contra la DB local:
  // restaurando el lock fino en la función, este mismo test devuelve 3 ok / 3 filas (falla); con la
  // 062 devuelve 2 ok + 1 slot_full / 2 filas (pasa).
  //
  // Cada createAppointmentCore dispara su propio .rpc → request HTTP separado → transacción/conexión
  // propia: la carrera es real y el lock de Postgres es lo ÚNICO que la serializa (T-12-16).
  it('CUPO-04 — anti-sobrecupo por SOLAPE: tres reservas escalonadas concurrentes sobre cupo 2 dejan exactamente 2', async () => {
    // El time_block define el DÍA/ventana (el modo simultáneo NO lee su capacity: su cupo es
    // services.capacity — cada modo lee SU fuente, Pitfall 3). Se siembra con capacity 1 a propósito:
    // es el caso real (un servicio individual que pasa a recurso simultáneo) y además probaría el
    // LANDMINE del re-check JS si volviera (con slotCapacity=1 el early-return cortaría el 2º turno).
    await seedTimeBlock(t, { capacity: 1 })
    await seedSimultaneousService(t, { capacity: 2 })

    // WARM-UP OBLIGATORIO (si no, el test es un falso verde). Cada createAppointmentCore hace 5
    // round-trips HTTP ANTES del .rpc; con el pool de conexiones frío, el 1er carril abre el socket y
    // los otros dos esperan a que se abran los suyos → llegan al RPC ESCALONADOS y la carrera nunca
    // ocurre (medido: sin warm-up, este mismo test PASA incluso con el lock viejo). Tres lecturas
    // triviales en paralelo abren los 3 sockets sin tocar el estado, y a partir de ahí los tres
    // carriles llegan al RPC juntos (medido: con el lock viejo, 3/3 corridas dan 3 ok = sobrecupo).
    await Promise.all([1, 2, 3].map(() => t.admin.from('services').select('id').eq('id', t.serviceId)))

    const [a, b, c] = await Promise.all([
      createAppointmentCore({ ...baseInput(), time: '16:00' }),
      createAppointmentCore({ ...baseInput(), time: '16:10' }),
      createAppointmentCore({ ...baseInput(), time: '16:20' }),
    ])

    const oks = [a, b, c].filter(r => r.ok)
    const fulls = [a, b, c].filter(r => !r.ok && r.error === 'slot_full')
    expect(oks.length).toBe(2)
    expect(fulls.length).toBe(1)
    for (const f of fulls) if (!f.ok) expect(f.status).toBe(409)

    // Assert DURO contra el estado REAL de la DB: exactamente 2 turnos del servicio ocupan el instante
    // compartido [16:20] — NUNCA 3. No se confía en los retornos del core (si el core mintiera o el
    // lock fallara, acá aparecerían 3 filas).
    expect(await occupantsCovering('16:20')).toBe(2)
  })

  // CUPO-02 — la 2ª/3ª reserva SOLAPADA se rechaza cuando el intervalo ya tiene `capacity` turnos, y
  // NO por hora de inicio exacta. Versión SECUENCIAL (complemento de CUPO-04, que prueba la carrera):
  // con cupo 2 las dos primeras escalonadas ENTRAN (antes del fix la 2ª moría en el re-check JS con
  // slot_taken sin llegar al RPC — LANDMINE del Plan 12-02) y la 3ª, que solapa a ambas, recibe
  // slot_full/409. Ningún `time` se repite: si el gate contara por hora exacta, las tres pasarían.
  it('CUPO-02 — recurso simultáneo cupo 2: la 3ª reserva solapada se rechaza con slot_full', async () => {
    await seedTimeBlock(t, { capacity: 1 })
    await seedSimultaneousService(t, { capacity: 2 })

    const first = await createAppointmentCore({ ...baseInput(), time: '16:00' })
    expect(first.ok).toBe(true)
    // La 2ª solapa a la 1ª y DEBE entrar (2ª camilla): es el caso que el early-return de booking-core
    // cortaba con slot_taken antes de la 062/12-02.
    const second = await createAppointmentCore({ ...baseInput(), time: '16:10' })
    expect(second.ok).toBe(true)

    // La 3ª pisa a las dos ([16:20,16:30) está ocupado por ambas) → cupo lleno.
    const third = await createAppointmentCore({ ...baseInput(), time: '16:20' })
    expect(third.ok).toBe(false)
    if (!third.ok) {
      expect(third.error).toBe('slot_full')
      expect(third.status).toBe(409)
    }

    // Estado real: exactamente 2 filas ocupan el instante compartido (no 3) y la 3ª no entró.
    expect(await occupantsCovering('16:20')).toBe(2)
  })

  // (Phase 15 / migr. 068) Este caso PROBABA que un recurso simultáneo de cupo 1 se comportara como un
  // servicio individual: la 2ª reserva solapada moría con slot_full/409. Ese escenario dejó de existir
  // POR CONSTRUCCIÓN DEL MODELO, no por regresión — el CHECK de coherencia `services_capacity_matches_mode_chk`
  // prohíbe `simultaneous_resource` con cupo 1, porque un "recurso simultáneo" de un solo lugar era
  // exactamente la ambigüedad que la fase vino a eliminar (mismo is_group=false, mismo EXCLUDE gist 013
  // que un individual: dos representaciones del MISMO estado).
  //
  // El caso NO se borra: se convierte en el GUARD de que sigue sin existir. Lo que probaba antes ya está
  // cubierto por CONC-02 (la 2ª reserva del cupo 1 se rechaza) y por el caso del 23P01.
  //
  // ⚠ El intento va con un UPDATE DIRECTO por t.admin, NO por seedSimultaneousService: el helper hace
  // `throw` ante error, y acá el error ES el sujeto del test.
  it('simultáneo cupo 1 — la base RECHAZA la configuración (23514) y el servicio no cambia de modo', async () => {
    // Estado de partida LEÍDO de la DB, no asumido (el afterEach devuelve el service al DEFAULT).
    const { data: antes } = await t.admin
      .from('services').select('capacity_mode, capacity')
      .eq('id', t.serviceId).eq('business_id', t.businessId).single()
    expect(antes?.capacity_mode).toBe('individual')

    const { error } = await t.admin
      .from('services')
      .update({ capacity_mode: 'simultaneous_resource', capacity: 1 })
      .eq('id', t.serviceId)
      .eq('business_id', t.businessId)

    expect(error).not.toBeNull()
    expect(error?.code).toBe('23514') // check_violation
    expect(`${error?.message ?? ''} ${error?.details ?? ''}`).toContain('services_capacity_matches_mode_chk')

    // NO se confía en el error: se relee la fila. El servicio quedó en su modo anterior.
    const { data: despues } = await t.admin
      .from('services').select('capacity_mode, capacity')
      .eq('id', t.serviceId).eq('business_id', t.businessId).single()
    expect(despues?.capacity_mode).toBe(antes?.capacity_mode)
    expect(despues?.capacity).toBe(antes?.capacity)
  })

  // ── Phase 12 / code-review — regresiones de los dos defectos REALES de reserva (CR-01, CR-02) ────

  // CR-02 — el cupo del recurso NO reemplaza la exclusión por agenda (doble-booking real).
  //
  // Con la 062 sola caían las TRES capas a la vez para un simultáneo con cupo > 1: el early-return JS
  // se desactivaba por el flag, el gate SQL solo miraba el MISMO service_id, y la fila nacía
  // is_group = true → fuera del EXCLUDE gist 013. Resultado: un turno de "camilla" se montaba encima
  // de una consulta normal ya confirmada en la MISMA agenda.
  //
  // Decisión del producto (fail-closed): un servicio simultáneo SÍ puede compartir agenda con turnos
  // individuales, pero un solape con OTRO servicio del mismo bucket se RECHAZA. Hacerlo configurable
  // por el dueño (flag por servicio) es un follow-up deliberadamente fuera de alcance: el default
  // tiene que bloquear, porque shippear "permitir" antes de que el dueño decida nada es shippear el
  // doble-booking.
  //
  // A/B verificado contra la DB local: con la función de la 062 este test da 2 turnos solapados en la
  // agenda (la reserva ENTRA, `camilla.ok === true`); con la 063 da slot_taken en los DOS caminos y
  // 1 sola fila. Se aserta el gate en las dos capas porque el camino `autoAssign` saltea el JS por
  // completo (booking-core.ts:135) y la autoridad tiene que estar en la DB.
  it('CR-02 — recurso simultáneo: un solape de OTRO servicio en la MISMA agenda se rechaza', async () => {
    await seedTimeBlock(t, { capacity: 1 })
    const otroServicio = await seedService(t, { durationMinutes: 30, name: '__test_svc_consulta' })

    // 1) Turno normal (group_class, cupo 1) de OTRO servicio en la agenda del profesional: 16:00-16:30.
    const consulta = await createAppointmentCore({ ...baseInput(), serviceId: otroServicio, time: '16:00' })
    expect(consulta.ok).toBe(true)

    // 2) El servicio del fixture pasa a RECURSO SIMULTÁNEO cupo 2 ("2 camillas").
    await seedSimultaneousService(t, { capacity: 2 })

    // 3) Reserva simultánea 16:10-16:40 en la MISMA agenda: solapa a la consulta. El cupo 2 es del
    //    recurso contra SÍ MISMO; nunca autoriza pisar un turno de otro servicio.
    const camilla = await createAppointmentCore({ ...baseInput(), time: '16:10' })
    expect(camilla.ok).toBe(false)
    if (!camilla.ok) {
      expect(camilla.error).toBe('slot_taken')
      expect(camilla.status).toBe(409)
    }

    // 4) Gate SQL (la autoridad): mismo intento llamando al RPC DIRECTO, sin pasar por el core — es lo
    //    que ve el camino autoAssign, que saltea todos los re-checks JS.
    const { error: rpcErr } = await t.admin.rpc('book_slot_atomic', {
      p_business_id: t.businessId,
      p_professional_id: t.professionalId,
      p_service_id: t.serviceId,
      p_location_id: t.locationId,
      p_date: DATE,
      p_time: '16:10',
      p_duration: 30,
      p_client_id: null,
      p_client_name: '__test_rpc_directo',
      p_client_phone: null,
      p_client_email: null,
      p_notes: null,
      p_status: 'confirmed',
      p_expires_at: null,
    })
    expect(rpcErr?.message ?? '').toContain('slot_taken')

    // Assert DURO contra la DB: la agenda conserva UN solo turno cubriendo las 16:10 (no 2).
    expect(await occupantsOfBucketCovering('16:10')).toBe(1)
  })

  // CR-01 — un hold VENCIDO no consume cupo del carril simultáneo.
  //
  // El gate por solape de la 062 filtraba por status IN ('confirmed','pending_payment') sin descartar
  // los `pending_payment` cuya seña ya venció. La justificación del camino grupal ("el core ya liberó
  // los holds vencidos antes del RPC") NO aplica acá: el core libera los del SU bucket, y el carril
  // simultáneo cuenta por service_id a través de TODAS las agendas. Un hold vencido de otro
  // profesional restaba cupo hasta que corriera el cron diario → `slot_full` falso (availability
  // mostraba el horario libre) y reserva perdida hasta 24 h.
  //
  // A/B verificado contra la DB local: con la 062 este test devuelve slot_full/409; con la 063 (que
  // agrega la misma guarda `expires_at` que ya usaba la función 80 líneas más arriba) devuelve ok.
  //
  // (Phase 15 / migr. 068) El escenario subió de cupo 1 a cupo 2 —el mínimo legal de un recurso
  // simultáneo desde el CHECK de coherencia— y los conteos corrieron UN LUGAR. El invariante que se
  // prueba es idéntico y el fixture seedExpiredHold no cambia: con el hold vencido sembrado, las DOS
  // reservas vivas entran (si el hold contara, la 2ª moriría con slot_full) y una TERCERA solapada
  // muere con slot_full.
  it('CR-01 — un hold VENCIDO no consume cupo del carril del recurso simultáneo', async () => {
    await seedTimeBlock(t, { capacity: 1 })
    await seedSimultaneousService(t, { capacity: 2 })

    // Hold vencido del MISMO servicio en OTRA agenda: el core solo libera los holds vencidos de SU
    // bucket antes del RPC, así que este llega VIVO al gate SQL (que cuenta cross-bucket).
    const agendaB = await seedProfessional(t, { name: '__test_agenda_B_hold' })
    await seedExpiredHold(t, { professionalId: agendaB, serviceId: t.serviceId, date: DATE, time: '16:00' })

    // 1ª reserva viva 16:10-16:40: el carril está en 0 de 2 (el hold vencido no cuenta).
    const primera = await createAppointmentCore({ ...baseInput(), time: '16:10' })
    expect(primera.ok).toBe(true)

    // 2ª reserva viva 16:20-16:50: solapa a la 1ª y AL HOLD VENCIDO. Éste es el assert discriminante —
    // si el hold contara, el instante [16:20,16:30) tendría 2 ocupantes y esta reserva moriría con
    // slot_full sobre un cupo de 2.
    const segunda = await createAppointmentCore({ ...baseInput(), time: '16:20' })
    expect(segunda.ok).toBe(true)

    // 3ª reserva 16:30-17:00: solapa a las DOS vivas ⇒ el carril sí está lleno.
    const tercera = await createAppointmentCore({ ...baseInput(), time: '16:30' })
    expect(tercera.ok).toBe(false)
    if (!tercera.ok) {
      expect(tercera.error).toBe('slot_full')
      expect(tercera.status).toBe(409)
    }

    // Y las dos entraron de verdad: 2 filas vivas en la agenda del fixture cubren el instante
    // compartido (el hold vencido vive en agendaB, así que este conteo por bucket no lo mira).
    expect(await occupantsOfBucketCovering('16:20')).toBe(2)
  })

  // ── Phase 12 / code-review 2 — CR2-01 y los gaps que la 064 cierra ───────────────────────────
  //
  // Contexto de por qué estos tests existen: `is_group` hace DOBLE TRABAJO (cupo > 1 Y exención del
  // EXCLUDE gist 013), así que el invariante anti-solape de un recurso simultáneo hay que imponerlo
  // DENTRO de book_slot_atomic — y para eso el lock tiene que cubrir el EJE del invariante, que es
  // AGENDA-DÍA. Los locks de la 063 (instante + servicio-día) no lo cubren. La 064 los reemplaza por
  // UN solo lock de NEGOCIO-DÍA y agrega el gate espejo en la rama grupal.

  // Warm-up del pool: es OBLIGATORIO en TODO test concurrente de este archivo o el test es un falso
  // verde. Cada createAppointmentCore hace ~5 round-trips HTTP ANTES del .rpc; con el pool frío el
  // 1er carril abre el socket y los demás esperan el suyo → llegan al RPC escalonados y la carrera
  // nunca ocurre (medido en CUPO-04: sin warm-up el test pasaba incluso con el lock viejo). Lecturas
  // triviales en paralelo abren los sockets sin tocar el estado.
  async function warmUpPool(lanes = 3) {
    await Promise.all(
      Array.from({ length: lanes }, () => t.admin.from('services').select('id').eq('id', t.serviceId)),
    )
  }

  // Llama al route handler REAL de disponibilidad para un (servicio, agenda) y devuelve busy/full.
  // Molde de CUPOS-02 (:250-257): el slug del fixture no está en SeededTenant, se lee con t.admin.
  async function availabilityFor(serviceId: string, professionalId: string) {
    const { data: bizRow } = await t.admin.from('businesses').select('slug').eq('id', t.businessId).single()
    const slug = bizRow?.slug as string
    const url = `https://test.local/api/booking/availability?slug=${slug}&date=${DATE}&professionalId=${professionalId}&serviceId=${serviceId}`
    const res = await availabilityGET(new Request(url) as unknown as NextRequest)
    return (await res.json()) as { ok: boolean; busy: { time: string }[]; full: string[] }
  }

  // CR2-01 (EL BLOCKER) — dos reservas CONCURRENTES de servicios DISTINTOS, en la MISMA agenda, con
  // horarios ESCALONADOS que se pisan. Es el caso de uso central de la feature y el que la 063 dejaba
  // abierto: R1 tomaba hash(B+date+'16:00') y R2 hash(B+camilla+date)+hash(B+date+'16:10') → CERO
  // intersección de locks ⇒ el gate cross-servicio de R2 no veía la fila sin commitear de R1 y pasaba;
  // la fila de R2 nace is_group=true (fuera del EXCLUDE 013) y el índice 011 no choca (`time` distinto)
  // ⇒ dos turnos solapados en una misma agenda. La 064 lo cierra con el lock de NEGOCIO-DÍA (único eje
  // que cubre agenda-día) + el gate espejo en la rama grupal (para el orden inverso de la carrera).
  //
  // A/B medido contra la DB local (misma suite, mismo warm-up, 3 corridas de cada lado):
  //   · con la función de la 063 → 2 ok / 2 turnos solapados en la agenda (FALLA, doble-booking).
  //   · con la función de la 064 → 1 ok + 1 slot_taken / 1 turno (PASA).
  it('CR2-01 — cross-servicio ESCALONADO concurrente: la agenda nunca queda con 2 turnos solapados', async () => {
    await seedTimeBlock(t, { capacity: 1 })
    const otroServicio = await seedService(t, { durationMinutes: 30, name: '__test_svc_consulta_conc' })
    await seedSimultaneousService(t, { capacity: 2 })
    await warmUpPool()

    // R1 "consulta" (group_class) 16:00-16:30 vs R2 "camilla" (simultáneo cupo 2) 16:10-16:40.
    const [r1, r2] = await Promise.all([
      createAppointmentCore({ ...baseInput(), serviceId: otroServicio, time: '16:00' }),
      createAppointmentCore({ ...baseInput(), time: '16:10' }),
    ])

    // Gane quien gane la carrera, la garantía es la misma en los dos sentidos: la que pierde ve la
    // agenda ocupada por OTRO servicio (gate cross-servicio si es la simultánea, gate ESPEJO si es la
    // grupal) → slot_taken, nunca slot_full (no es cupo lleno) ni insert_failed (no es un 500).
    const oks = [r1, r2].filter(r => r.ok)
    const taken = [r1, r2].filter(r => !r.ok && r.error === 'slot_taken')
    expect(oks.length).toBe(1)
    expect(taken.length).toBe(1)

    // Assert DURO contra el estado REAL de la DB (no contra los retornos del core): el instante
    // [16:10,16:30) es el que comparten los dos intervalos — la agenda no puede tener 2 filas ahí.
    expect(await occupantsOfBucketCovering('16:20')).toBe(1)
  })

  // CR2-01, eje INVERSO (gap 2) — el gate ESPEJO de la rama grupal. Hasta la 064 este eje no tenía
  // NINGÚN chequeo: una fila is_group=true de un recurso simultáneo es invisible para el EXCLUDE 013,
  // así que un turno grupal se le montaba encima. Con `time_blocks.capacity > 1` entraba incluso SIN
  // concurrencia, porque el re-check JS tampoco frena (`rejectEarly = taken && slotCapacity <= 1` →
  // false con capacity 3). Se asierta en las DOS capas (core y RPC directo) porque el camino
  // autoAssign saltea el JS entero y la autoridad tiene que estar en la DB.
  //
  // A/B medido: con la 063 la 2ª reserva ENTRA (ok) y la agenda queda con 2 turnos solapados; con la
  // 064 devuelve slot_taken en los dos caminos y queda 1 turno.
  it('CR2-01 (eje inverso) — un turno grupal no se puede montar sobre un recurso simultáneo', async () => {
    // Bloque GRUPAL (cupo 3): es lo que desactivaba el early-return JS y dejaba pasar el solape.
    await seedTimeBlock(t, { capacity: 3 })
    await seedSimultaneousService(t, { capacity: 2 })
    const otroServicio = await seedService(t, { durationMinutes: 30, name: '__test_svc_grupal_inverso' })

    // 1) "camilla" (simultáneo cupo 2) 16:00-16:30 → entra y nace is_group = true (fuera del gist 013).
    const camilla = await createAppointmentCore({ ...baseInput(), time: '16:00' })
    expect(camilla.ok).toBe(true)
    const { data: camillaRow } = await t.admin
      .from('appointments').select('is_group').eq('business_id', t.businessId).eq('service_id', t.serviceId).eq('date', DATE).single()
    expect(camillaRow?.is_group).toBe(true) // si esto fuera false, el gist ya lo cubriría y el test no probaría nada

    // 2) Turno de OTRO servicio 16:10-16:40 en la MISMA agenda: solapa → rechazo por el gate espejo.
    const grupal = await createAppointmentCore({ ...baseInput(), serviceId: otroServicio, time: '16:10' })
    expect(grupal.ok).toBe(false)
    if (!grupal.ok) {
      expect(grupal.error).toBe('slot_taken')
      expect(grupal.status).toBe(409)
    }

    // 3) El gate SQL es la AUTORIDAD (el camino autoAssign no pasa por el core): mismo intento por RPC
    //    directo. El mensaje es slot_taken (P0001), NO un 23P01 del gist — el gist no ve esa fila.
    const { error: rpcErr } = await t.admin.rpc('book_slot_atomic', {
      p_business_id: t.businessId,
      p_professional_id: t.professionalId,
      p_service_id: otroServicio,
      p_location_id: t.locationId,
      p_date: DATE,
      p_time: '16:10',
      p_duration: 30,
      p_client_id: null,
      p_client_name: '__test_rpc_inverso',
      p_client_phone: null,
      p_client_email: null,
      p_notes: null,
      p_status: 'confirmed',
      p_expires_at: null,
    })
    expect(rpcErr?.message ?? '').toContain('slot_taken')

    expect(await occupantsOfBucketCovering('16:20')).toBe(1)
  })

  // NO-DRIFT (a) — el gate espejo NO puede cambiar el camino `group_class` de cupo 1. Ahí la fila nace
  // is_group = false, o sea que sigue DENTRO del EXCLUDE gist 013, y el rechazo del solape lo tiene que
  // seguir dando el gist con 23P01 (traducido a slot_taken por el core) — exactamente como antes de la
  // 064. Se asierta el SQLSTATE crudo por RPC directo: si el espejo se "comiera" este caso, el código
  // pasaría a P0001 y el assert lo detecta.
  it('no-drift — group_class cupo 1: el solape cross-servicio lo sigue rechazando el EXCLUDE 013 (23P01)', async () => {
    await seedTimeBlock(t, { capacity: 1 })
    const otroServicio = await seedService(t, { durationMinutes: 30, name: '__test_svc_nodrift_cap1' })

    const first = await createAppointmentCore({ ...baseInput(), time: '16:00' })
    expect(first.ok).toBe(true)
    const { data: row } = await t.admin
      .from('appointments').select('is_group').eq('business_id', t.businessId).eq('date', DATE).single()
    expect(row?.is_group).toBe(false)

    // Por el core: slot_taken/409 (lo corta el re-check JS, capacity 1 — comportamiento histórico).
    const second = await createAppointmentCore({ ...baseInput(), serviceId: otroServicio, time: '16:10' })
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.error).toBe('slot_taken')

    // Por RPC directo (sin el JS): lo rechaza el EXCLUDE gist 013 → SQLSTATE 23P01, NO P0001.
    const { error: rpcErr } = await t.admin.rpc('book_slot_atomic', {
      p_business_id: t.businessId,
      p_professional_id: t.professionalId,
      p_service_id: otroServicio,
      p_location_id: t.locationId,
      p_date: DATE,
      p_time: '16:10',
      p_duration: 30,
      p_client_id: null,
      p_client_name: '__test_rpc_nodrift',
      p_client_phone: null,
      p_client_email: null,
      p_notes: null,
      p_status: 'confirmed',
      p_expires_at: null,
    })
    expect(rpcErr?.code).toBe('23P01')
    expect(await occupantsOfBucketCovering('16:10')).toBe(1)
  })

  // NO-DRIFT (b) — el caso que obligó a ACOTAR el gate espejo. `time_blocks.capacity` es del BLOQUE
  // (business + day_of_week + ventana), NO del servicio: en un negocio con un bloque de cupo N TODAS
  // las filas nacen is_group = true, y dos SERVICIOS DISTINTOS en el mismo slot de ese bloque (Corte
  // 10:00 + Color 10:00, mismo profesional) son LEGALES hoy — es lo que "cupo N" significa. Por eso el
  // espejo exige además que el servicio de la fila preexistente esté en modo simultaneous_resource.
  // Con el predicado literal del review (solo is_group = true) este test FALLA: la 2ª reserva sería
  // rechazada y sería drift de group_class.
  it('no-drift — dos servicios grupales distintos siguen entrando en el mismo slot de un bloque de cupo N', async () => {
    await seedTimeBlock(t, { capacity: 3 })
    const otroServicio = await seedService(t, { durationMinutes: 30, name: '__test_svc_nodrift_grupal' })

    const a = await createAppointmentCore({ ...baseInput(), time: '10:00' })
    expect(a.ok).toBe(true)
    const b = await createAppointmentCore({ ...baseInput(), serviceId: otroServicio, time: '10:00' })
    expect(b.ok).toBe(true)

    // Las dos filas conviven en el slot (cupo 3), con seats distintos asignados por el RPC.
    expect(await occupantsAt('10:00')).toBe(2)
    const { data: seats } = await t.admin
      .from('appointments').select('seat').eq('business_id', t.businessId).eq('date', DATE).eq('time', '10:00')
    expect(new Set((seats || []).map(s => s.seat)).size).toBe(2)
  })

  // CR-03 (a) — el lock de NEGOCIO-DÍA sigue serializando `v_seat`. El seat se deriva contando el slot
  // EXACTO del bucket; si dos transacciones concurrentes lo cuentan sin compartir lock, derivan el
  // MISMO seat y la 2ª muere con 23505 (que el core traduce a un slot_taken ESPURIO en un bloque que
  // todavía tiene lugares). El lock de la 064 es más grueso que el de instante de 058, así que la
  // garantía §GA1 se preserva por construcción — este test es el guard que lo prueba y que impide que
  // un futuro "optimicemos el lock" la reabra en silencio.
  //
  // A/B medido contra un MUTANTE de la 064 sin el PERFORM del lock: 3 corridas → aparecen slot_taken
  // espurios y seats repetidos (FALLA). Con la 064 → 3 ok, seats {0,1,2} (PASA). Contra la 063 también
  // pasa: CR-03 ya estaba cerrado ahí; esto es un guard, no un repro.
  it('CR-03 (a) — el lock de negocio-día serializa v_seat: 3 reservas concurrentes en un bloque de cupo 3', async () => {
    await seedTimeBlock(t, { capacity: 3 })
    await warmUpPool()

    const results = await Promise.all([
      createAppointmentCore({ ...baseInput(), time: '17:00' }),
      createAppointmentCore({ ...baseInput(), time: '17:00' }),
      createAppointmentCore({ ...baseInput(), time: '17:00' }),
    ])
    // NINGUNA puede fallar: hay 3 lugares para 3 reservas. Un slot_taken acá sería el 23505 espurio.
    expect(results.filter(r => r.ok).length).toBe(3)

    const { data: seats } = await t.admin
      .from('appointments').select('seat').eq('business_id', t.businessId).eq('date', DATE).eq('time', '17:00')
    expect((seats || []).length).toBe(3)
    expect(new Set((seats || []).map(s => s.seat)).size).toBe(3) // seats distintos = seat serializado
  })

  // CR-03 (b) — el lock de NEGOCIO-DÍA sigue serializando la selección de "cualquiera" (058 §GA1). Sin
  // lock compartido, dos requests concurrentes ven al MISMO profesional libre y ambas lo eligen →
  // doble-booking real (y el EXCLUDE 013 no las cruza si una nace is_group=true). El lock de la 064 es
  // un prefijo más grueso del de 058, así que las dos transacciones siguen convergiendo.
  //
  // A/B medido contra el MUTANTE sin lock: las dos eligen el mismo profesional (professional_id
  // repetido / 23505) → FALLA. Con la 064 → 2 ok con profesionales distintos (PASA).
  it('CR-03 (b) — dos autoAssign concurrentes del mismo instante nunca eligen el mismo profesional', async () => {
    await seedTimeBlock(t, { capacity: 1 })
    await seedProfessional(t, { name: '__test_pro_any_2' })
    await warmUpPool(2)

    const [a, b] = await Promise.all([
      createAppointmentCore({ ...baseInput(), professionalId: null, autoAssign: true, time: '18:00' }),
      createAppointmentCore({ ...baseInput(), professionalId: null, autoAssign: true, time: '18:00' }),
    ])
    expect([a, b].filter(r => r.ok).length).toBe(2)

    // Estado real: 2 filas en el instante, en agendas DISTINTAS (nunca la misma).
    const { data: rows } = await t.admin
      .from('appointments').select('professional_id').eq('business_id', t.businessId).eq('date', DATE).eq('time', '18:00')
    expect((rows || []).length).toBe(2)
    expect(new Set((rows || []).map(r => r.professional_id)).size).toBe(2)
  })

  // CR-04 (a) — el read-path del modo simultáneo refleja la agenda ocupada por OTRO servicio y el
  // carril lleno, y NO oculta el slot donde el recurso todavía tiene lugar. Es la cobertura que el
  // fix de CR-04 shippeó sin test (WR-01). Se invoca el route handler REAL (molde de CUPOS-02).
  it('CR-04 (a) — availability simultánea: agenda ocupada por otro servicio y carril lleno van a full', async () => {
    await seedTimeBlock(t, { capacity: 1 })
    const otroServicio = await seedService(t, { durationMinutes: 30, name: '__test_svc_disp_otro' })

    // Turno de OTRO servicio en la agenda 09:00-09:30 (antes de pasar el fixture a simultáneo).
    const otro = await createAppointmentCore({ ...baseInput(), serviceId: otroServicio, time: '09:00' })
    expect(otro.ok).toBe(true)

    await seedSimultaneousService(t, { capacity: 2 })
    // Carril a medio llenar en 10:00 (1 de 2) y LLENO en 12:00 (2 de 2, mismo start).
    expect((await createAppointmentCore({ ...baseInput(), time: '10:00' })).ok).toBe(true)
    expect((await createAppointmentCore({ ...baseInput(), time: '12:00' })).ok).toBe(true)
    expect((await createAppointmentCore({ ...baseInput(), time: '12:00' })).ok).toBe(true)

    const body = await availabilityFor(t.serviceId, t.professionalId)
    expect(body.ok).toBe(true)
    // (i) la agenda ocupada por otro servicio bloquea el horario aunque el carril esté vacío…
    expect(body.full).toContain('09:00')
    // (ii) …pero el 2º lugar del recurso NO se oculta (1 de 2 sigue reservable) — el punto de CR-04:
    //      la unión de condiciones no puede borrar los lugares libres del propio carril.
    expect(body.full).not.toContain('10:00')
    // (iii) el carril lleno sí va a full.
    expect(body.full).toContain('12:00')
    // Contrato intacto: sin conteos y con busy vacío en esta rama (D-06/D-12).
    expect(Object.keys(body).sort()).toEqual(['busy', 'full', 'ok'])
    expect(body.busy).toEqual([])
  })

  // CR-04 (b) — el read-path del modo simultáneo sobre una agenda con ESPACIO compartido.
  //
  // ⚠ QUÉ ESCENARIO SE PERDIÓ Y POR QUÉ (Phase 15 / migr. 068). Este caso usaba cupo 1 A PROPÓSITO:
  // con cupo 1 la fila nace is_group = false, el espacio funcionaba como en v0.12 y el bloqueo por
  // agenda hermana aparecía en `full` SOLO en los horarios que realmente pisaba (11:00 sí, 12:00 no),
  // y la reserva del horario libre entraba. Desde el CHECK de coherencia, un `simultaneous_resource`
  // de cupo 1 es ILEGAL, así que ese sub-caso desaparece POR CONSTRUCCIÓN DEL MODELO, no por
  // regresión: TODO servicio simultáneo tiene cupo >= 2, y cupo >= 2 sobre una agenda con espacio
  // mapeado es la configuración imposible que la 064 rechaza de entrada (gap 3,
  // `simultaneous_space_conflict`).
  //
  // Lo que el caso asierta ahora, y que el de gap 3 NO cubre (ahí no hay agenda hermana): con el
  // espacio compartido por dos agendas y una de ellas ocupándolo, el read-path deja de distinguir
  // horarios pisados de horarios libres — van TODOS a full, porque el write-path rechaza siempre.
  it('CR-04 (b) — availability simultánea: cupo 2 + espacio compartido con una hermana deja TODO en full', async () => {
    await seedTimeBlock(t, { capacity: 1 })
    await seedSimultaneousService(t, { capacity: 2 })
    const otroServicio = await seedService(t, { durationMinutes: 30, name: '__test_svc_disp_hermana' })

    const spaceA = await seedSpace(t, { name: 'A' })
    const agendaB = await seedProfessional(t, { name: '__test_agenda_B_disp' })
    await seedAgendaSpace(t, { professionalId: t.professionalId, spaceId: spaceA })
    await seedAgendaSpace(t, { professionalId: agendaB, spaceId: spaceA })

    // La HERMANA ocupa el espacio 11:00-11:30 con OTRO servicio (si fuera el mismo, el bloqueo vendría
    // del carril y el test no probaría el camino de espacio).
    const sib = await createAppointmentCore({ ...baseInput(), professionalId: agendaB, serviceId: otroServicio, time: '11:00' })
    expect(sib.ok).toBe(true)

    const body = await availabilityFor(t.serviceId, t.professionalId)
    expect(body.ok).toBe(true)
    expect(body.full).toContain('11:00')  // el horario que la hermana pisa…
    expect(body.full).toContain('12:00')  // …y también los que NO: la config entera es irreservable
    expect(body.full).toContain('09:00')
    expect(body.full).toContain('16:00')

    // Y el write-path coincide: el horario "libre" tampoco entra, y no por choque de espacio sino por
    // el código PROPIO de configuración imposible.
    const res = await createAppointmentCore({ ...baseInput(), time: '12:00' })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toBe('simultaneous_space_conflict')
      expect(res.status).toBe(409)
    }
  })

  // GAP 3 — recurso simultáneo de cupo > 1 sobre una agenda con ESPACIO físico mapeado: configuración
  // IMPOSIBLE, rechazada de entrada con un código PROPIO. Un espacio es una sala/cancha física y
  // appointment_spaces_no_overlap (042) impone un turno por espacio a la vez, o sea capacidad 1: un
  // cupo ≥ 2 sobre ese mismo espacio es una contradicción semántica, no algo a parchear relajando ese
  // EXCLUDE (relajarlo borraría el invariante de espacio compartido de v0.12).
  //
  // A/B medido: con la 063 la 1ª reserva ENTRA y la 2ª muere con 23P01 → slot_taken (indistinguible de
  // "horario ocupado") mientras availability publicaba el horario libre; con la 064 la 1ª ya devuelve
  // simultaneous_space_conflict, no queda ninguna fila y el read-path oculta los horarios.
  it('gap 3 — simultáneo cupo > 1 + espacio mapeado se rechaza con simultaneous_space_conflict', async () => {
    await seedTimeBlock(t, { capacity: 1 })
    await seedSimultaneousService(t, { capacity: 2 })
    const spaceA = await seedSpace(t, { name: 'A' })
    await seedAgendaSpace(t, { professionalId: t.professionalId, spaceId: spaceA })

    const res = await createAppointmentCore({ ...baseInput(), time: '16:00' })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      // Código PROPIO: NO slot_taken (no es un horario ocupado) ni slot_full (no es cupo lleno).
      expect(res.error).toBe('simultaneous_space_conflict')
      expect(res.status).toBe(409)
    }
    // Fail-closed de verdad: NO entró ni la 1ª reserva.
    expect(await occupantsOfBucketCovering('16:00')).toBe(0)

    // El RPC es la autoridad (autoAssign saltea el core): mismo rechazo por RPC directo.
    const { error: rpcErr } = await t.admin.rpc('book_slot_atomic', {
      p_business_id: t.businessId,
      p_professional_id: t.professionalId,
      p_service_id: t.serviceId,
      p_location_id: t.locationId,
      p_date: DATE,
      p_time: '16:00',
      p_duration: 30,
      p_client_id: null,
      p_client_name: '__test_rpc_gap3',
      p_client_phone: null,
      p_client_email: null,
      p_notes: null,
      p_status: 'confirmed',
      p_expires_at: null,
    })
    expect(rpcErr?.message ?? '').toContain('simultaneous_space_conflict')

    // Y el read-path deja de mentir: si el write-path rechaza SIEMPRE, no se puede seguir ofreciendo
    // el horario como libre (coherencia de la 064 en availability).
    const body = await availabilityFor(t.serviceId, t.professionalId)
    expect(body.full).toContain('16:00')
    expect(body.full).toContain('09:00')
  })
})
