import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasSupabaseCreds } from './env'
import { seedOneTenant, teardownOneTenant, seedTimeBlock, seedSpace, seedAgendaSpace, seedProfessional, type SeededTenant } from './helpers/booking-fixtures'
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
})
