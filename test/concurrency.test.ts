import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasSupabaseCreds } from './env'
import { seedOneTenant, teardownOneTenant, seedTimeBlock, seedSpace, seedAgendaSpace, seedProfessional, seedSimultaneousService, seedGroupClassService, seedService, seedExpiredHold, type SeededTenant } from './helpers/booking-fixtures'
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
    // (Phase 15 / migr. 068 + plan 15-04) El cupo se DECLARA en el SERVICIO, y el bloque de agenda
    // quedó en su cupo por DEFECTO (1) porque ya no lo lee NADIE: ni el RPC (068) ni el re-check JS de
    // `booking-core` (15-04). Esa discrepancia deliberada —bloque 1, servicio 2— es lo que vuelve a
    // este caso un CONTROL NEGATIVO del plan 15-04: con la lectura vieja del JS
    // (`taken && slotCapacity <= 1` sobre `time_blocks`) la 2ª alta moría con un `slot_taken` del
    // JavaScript sin llegar nunca al RPC. Medido en 15-03: con los bloques bajados, este caso FALLABA.
    await seedTimeBlock(t)
    await seedGroupClassService(t, { capacity: 2 })

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
    // (migr. 068 + plan 15-04) El cupo lo declara el SERVICIO; el bloque queda en su cupo por defecto
    // (1) y solo define día y ventana. Igual que CONC-01, la discrepancia bloque 1 / servicio N es el
    // control negativo de 15-04: con el re-check JS leyendo el bloque, la 2ª alta secuencial moría con
    // `slot_taken` antes del RPC (medido en 15-03).
    await seedTimeBlock(t)
    await seedGroupClassService(t, { capacity: N })

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

  // ── CUPO-07 (migr. 068) — LA FUENTE DEL CUPO ES EL SERVICIO ────────────────────────────────────
  // Estos dos casos son el CONTROL NEGATIVO de la fase, en los DOS sentidos: prueban que el número sale
  // de `services.capacity` y que `time_blocks.capacity` ya NO decide. Son los únicos que pueden hacerlo
  // con el bloque y el servicio DISCREPANDO, y para eso entran (a) por RPC DIRECTO y (b) con un solape
  // que no comparte hora exacta: el re-check JS de `booking-core` sigue leyendo el BLOQUE hasta el plan
  // 15-04, así que en esta ola es el único camino que llega al RPC sin que el JS decida antes.
  //
  // A/B contra la función de la 064 (la que leía el bloque) — es lo que los vuelve discriminantes:
  //   (a) bloque 1 + servicio grupal cupo 3 → con la 064 la 2ª muere con 23505 (seat 0 repetido);
  //       con la 068 entran las 3 y la 4ª da slot_full.
  //   (b) bloque 3 + servicio individual    → con la 064 la 2ª ENTRA (nace is_group = true y el EXCLUDE
  //       gist 013 no la ve); con la 068 muere con 23P01, porque is_group = false la devuelve al gist.
  async function bookByRpc(args: { serviceId: string; time: string; name: string; duration?: number }) {
    return t.admin.rpc('book_slot_atomic', {
      p_business_id: t.businessId,
      p_professional_id: t.professionalId,
      p_service_id: args.serviceId,
      p_location_id: t.locationId,
      p_date: DATE,
      p_time: args.time,
      p_duration: args.duration ?? 30,
      p_client_id: null,
      p_client_name: args.name,
      p_client_phone: null,
      p_client_email: null,
      p_notes: null,
      p_status: 'confirmed',
      p_expires_at: null,
    })
  }

  it('CUPO-07 (a) — el cupo lo pone el SERVICIO aunque el bloque de agenda diga 1', async () => {
    await seedTimeBlock(t) // cupo por DEFECTO = 1: el bloque dice "individual" y ya no le importa a nadie
    await seedGroupClassService(t, { capacity: 3 })

    for (let i = 0; i < 3; i++) {
      const { error } = await bookByRpc({ serviceId: t.serviceId, time: '14:00', name: `__test_cupo07a_${i}` })
      expect(error).toBeNull() // con la 064 (cupo del BLOQUE = 1) la 2ª moriría acá con 23505
    }

    // La 4ª excede el cupo DECLARADO → slot_full, no 23505: el cupo lo gatea la función, no el índice.
    const cuarta = await bookByRpc({ serviceId: t.serviceId, time: '14:00', name: '__test_cupo07a_extra' })
    expect(cuarta.error?.message ?? '').toContain('slot_full')

    expect(await occupantsAt('14:00')).toBe(3)
    const { data: rows } = await t.admin
      .from('appointments').select('seat, is_group').eq('business_id', t.businessId).eq('date', DATE).eq('time', '14:00')
    expect(new Set((rows || []).map(r => r.seat)).size).toBe(3) // seats 0..2, serializados por el lock
    // Cupo >= 2 ⇒ is_group true ⇒ FUERA del EXCLUDE gist 013 A PROPÓSITO: si naciera false, la 2ª fila
    // solapada moriría con 23P01 y el cupo nunca se llenaría (LANDMINE 013).
    expect((rows || []).every(r => r.is_group === true)).toBe(true)
  })

  it('CUPO-07 (b) — control negativo: un bloque de cupo 3 ya NO vuelve grupal a un servicio individual', async () => {
    // El servicio queda en el DEFAULT de la 068 (individual / cupo 1) y el BLOQUE miente con cupo 3.
    //
    // ⚠ ES UNO DE LOS DOS ÚNICOS `seedTimeBlock` DEL ARCHIVO QUE CONSERVAN UN CUPO > 1 —el otro es su
    // hermano (c), sobre la hora EXACTA—, Y NO ES DEUDA: acá el número
    // no DECLARA nada, MIENTE a propósito. Es la mentira lo que se prueba. Bajarlo a 1 dejaría al caso
    // sin poder discriminante: con bloque 1 y servicio individual, la función VIEJA de la 064 (la que
    // leía el bloque) también daría `is_group = false` y el test pasaría contra las dos versiones, o
    // sea que dejaría de detectar una lectura que quedó apuntando a la columna vieja. Es exactamente
    // el uso que declara el helper `seedTimeBlock` desde la migr. 068: control negativo, no fixture.
    await seedTimeBlock(t, { capacity: 3 })

    const primera = await createAppointmentCore({ ...baseInput(), time: '14:30' })
    expect(primera.ok).toBe(true)
    const { data: row } = await t.admin
      .from('appointments').select('seat, is_group').eq('business_id', t.businessId).eq('date', DATE).eq('time', '14:30').single()
    expect(row?.seat).toBe(0)         // cupo 1 ⇒ seat FIJO en 0
    expect(row?.is_group).toBe(false) // ⇒ CAMBIO DE RÉGIMEN: la fila vuelve a entrar al EXCLUDE gist 013

    // El 2º intento SOLAPA sin compartir hora exacta (14:40 pisa a 14:30-15:00). Es a propósito: en la
    // hora EXACTA se violarían a la vez el índice único 011 y el EXCLUDE 013, y cuál de los dos reporta
    // primero no está garantizado. Acá el 011 no aplica (`time` distinto), así que el 23P01 prueba
    // inequívocamente que la fila está DENTRO del gist. Con la 064 la 2ª entraba: cupo 3 del bloque ⇒
    // is_group = true ⇒ invisible para el gist.
    const segunda = await bookByRpc({ serviceId: t.serviceId, time: '14:40', name: '__test_cupo07b_2' })
    expect(segunda.error?.code).toBe('23P01')
    expect(await occupantsAt('14:30')).toBe(1)
  })

  // CUPO-07 (c) — CONTROL NEGATIVO del cupo por bloque sobre la HORA EXACTA. Es el hermano del (b):
  // allá el 2º intento SOLAPA sin compartir hora y lo rechaza el EXCLUDE gist 013 (23P01); acá comparte
  // la hora EXACTA y lo rechaza el índice único 011 (23505 → slot_taken). Son constraints DISTINTOS y
  // hacen falta los dos: el (b) prueba que la fila volvió al gist, éste prueba que el CUPO efectivo
  // sigue siendo 1.
  //
  // ⚠ EL CONTROL NEGATIVO, ESCRITO: si ALGUNA lectura volviera a resolver el cupo desde el BLOQUE de
  // agenda, este test daría 2 FILAS. Con el bloque en 3 la función vieja derivaría v_capacity = 3 ⇒
  // v_occupied (1) < 3 ⇒ `v_seat := 1` ⇒ is_group = true ⇒ la 2ª reserva ENTRA, y el slot quedaría con
  // dos ocupantes sobre un servicio que declaró cupo 1. Es el guard que impide que el cupo vuelva a
  // vivir en dos lugares.
  //
  // Se asierta por los DOS caminos porque el de asignación automática saltea el JS entero
  // (booking-core.ts:135) y la autoridad tiene que estar en la BASE: por `createAppointmentCore`
  // (slot_taken + 409) y por RPC DIRECTO (el 23505 crudo del índice 011).
  it('CUPO-07 (c) — control negativo: con el bloque en 3, un servicio individual sigue dando cupo 1 en la hora exacta', async () => {
    await seedTimeBlock(t, { capacity: 3 }) // el bloque MIENTE; el servicio queda en el DEFAULT de la 068

    // El cupo EFECTIVO se LEE de la fila del SERVICIO, no se asume: es la fuente única desde la 068.
    const { data: svc } = await t.admin
      .from('services').select('capacity_mode, capacity').eq('id', t.serviceId).eq('business_id', t.businessId).single()
    expect(svc?.capacity_mode).toBe('individual')
    expect(svc?.capacity).toBe(1)

    const primera = await createAppointmentCore({ ...baseInput(), time: '15:00' })
    expect(primera.ok).toBe(true)

    // (i) Por el core: la 2ª del slot EXACTO es doble-booking clásico → slot_taken/409, NUNCA slot_full
    //     (slot_full acá sería la firma de un cupo > 1 heredado del bloque).
    const segunda = await createAppointmentCore({ ...baseInput(), time: '15:00' })
    expect(segunda.ok).toBe(false)
    if (!segunda.ok) {
      expect(segunda.error).toBe('slot_taken')
      expect(segunda.status).toBe(409)
    }

    // (ii) Por RPC directo (lo que ve autoAssign, sin ningún re-check JS de por medio): 23505 del
    //      índice único 011 sobre el seat 0 repetido.
    const rpc = await bookByRpc({ serviceId: t.serviceId, time: '15:00', name: '__test_cupo07c_rpc' })
    expect(rpc.error?.code).toBe('23505')

    // Estado REAL de la base: UNA sola fila, seat 0 y nacida is_group = false — si fuera true, el
    // EXCLUDE 013 no la cubriría y el caso no probaría lo que cree probar.
    expect(await occupantsAt('15:00')).toBe(1)
    const { data: row } = await t.admin
      .from('appointments').select('seat, is_group').eq('business_id', t.businessId).eq('date', DATE).eq('time', '15:00').single()
    expect(row?.seat).toBe(0)
    expect(row?.is_group).toBe(false)
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
    // ⚠ REENCUADRE (plan 15-04). Lo que este caso PROTEGE no cambió: que el público no pueda inferir
    // cuántos lugares quedan. Lo que cambió es cómo se ARMA el escenario. Antes se modelaba un slot
    // grupal y uno individual con DOS ventanas horarias de cupos distintos en el bloque de agenda —
    // un truco que muere con el cupo por servicio, porque un servicio tiene UN cupo y el read-path ya
    // no mira `time_blocks.capacity`. Ahora son DOS SERVICIOS y DOS consultas, una por servicio:
    //   · el del fixture, declarado GRUPAL cupo 3
    //   · un segundo servicio, que nace INDIVIDUAL (cupo 1, el DEFAULT de la 068)
    // El bloque de agenda queda con su cupo por defecto y define SOLO la ventana (08:00-20:00).
    await seedGroupClassService(t, { capacity: 3 })
    const svcIndividual = await seedService(t, { durationMinutes: 30, name: '__test_svc_cupos02_ind' })
    await seedTimeBlock(t)

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
    // Slot INDIVIDUAL ocupado: 1 de 1 en '12:30', con el OTRO servicio (cupo 1 → busy y full coinciden).
    const ind = await createAppointmentCore({ ...baseInput(), serviceId: svcIndividual, time: '12:30' })
    expect(ind.ok).toBe(true)

    // El slug del fixture no se expone en SeededTenant: lo leemos de la DB con t.admin (el endpoint
    // resuelve el tenant por slug).
    const { data: bizRow } = await t.admin.from('businesses').select('slug').eq('id', t.businessId).single()
    const slug = bizRow?.slug as string

    // Invocar el route handler REAL, una vez POR SERVICIO (desde 15-04 el cupo lo resuelve el
    // `serviceId` de la consulta, igual que lo manda el booking público).
    async function availabilityFor(serviceId: string) {
      const url = `https://test.local/api/booking/availability?slug=${slug}&date=${DATE}&professionalId=${t.professionalId}&serviceId=${serviceId}`
      const res = await availabilityGET(new Request(url) as unknown as NextRequest)
      return (await res.json()) as { ok: boolean; busy: unknown[]; full: unknown[] }
    }
    const bodyGrupal = await availabilityFor(t.serviceId)
    const bodyIndividual = await availabilityFor(svcIndividual)

    // La forma del contrato y el no-leak se asiertan en LAS DOS respuestas: el público nunca recibe
    // conteos, sea cual sea el servicio por el que pregunte.
    const leakKeys = ['count', 'remaining', 'seat', 'capacity', 'occupied', 'available', 'spots', 'roster']
    for (const body of [bodyGrupal, bodyIndividual]) {
      // Forma del contrato: SOLO ok/busy/full. Ninguna clave que revele ocupación restante.
      expect(body.ok).toBe(true)
      expect(Array.isArray(body.busy)).toBe(true)
      expect(Array.isArray(body.full)).toBe(true)
      expect(Object.keys(body).sort()).toEqual(['busy', 'full', 'ok'])
      // No-leak: ninguna entrada de busy expone count/remaining/seat/capacity ni nada que cuente lugares.
      for (const entry of body.busy as Record<string, unknown>[]) {
        for (const k of leakKeys) expect(entry).not.toHaveProperty(k)
      }
      // full es un array de strings 'HH:MM' (no objetos con conteo).
      for (const f of body.full as string[]) expect(typeof f).toBe('string')
    }

    const fullGrupal = bodyGrupal.full as string[]

    // (a) contra el servicio GRUPAL: el slot LLENO '10:00' está en full como 'HH:MM' (no 'HH:MM:SS').
    expect(fullGrupal).toContain('10:00')
    expect(fullGrupal).not.toContain('10:00:00')

    // (b) contra el servicio GRUPAL: el slot PARCIAL '09:00' (2/3) NO está en full (sigue reservable).
    //
    // ⚠ (code-review de Phase 15, WR-05) ACÁ HABÍA UN CONTROL QUE NO PODÍA FALLAR:
    // `expect(busyGrupal).not.toContain('09:00')` sobre un array que para TODO servicio de cupo > 1 es
    // `[]` POR CONSTRUCCIÓN (`availability`: `busy = (slotCapacity <= 1 ? live : []).concat(siblingBusy)`,
    // y este escenario no tiene espacios mapeados). Era verde pasara lo que pasara con la lógica de
    // cupo grupal, mientras el comentario lo vendía como el guard de "la ocupación grupal no se remueve
    // por solapamiento". Se reemplaza por el INVARIANTE FUERTE —el contrato de la rama de cupo
    // compartido es que `busy` quede VACÍO— más el síntoma que de verdad protege al 3er lugar.
    expect(bodyGrupal.busy).toEqual([])
    expect(fullGrupal).not.toContain('09:00')

    // (b2) (code-review de Phase 15, CR-01 — read-path) El horario donde la MISMA agenda tiene un turno
    //      vivo del servicio INDIVIDUAL sí va a `full` cuando se pregunta por el GRUPAL: el write-path
    //      lo rechaza (una clase no se monta sobre un turno individual), así que el read-path no lo
    //      puede seguir ofreciendo. ANTES del fix este assert fallaba: '12:30' no estaba en `full` para
    //      el grupal (la ocupación de otro servicio no llegaba ni a `busy` —vacío por cupo > 1— ni a
    //      `full` —que sólo contaba count >= capacity del propio carril—) y el público reservaba una
    //      clase encima de un turno confirmado.
    expect(fullGrupal).toContain('12:30')

    // (c) contra el servicio INDIVIDUAL: su horario ocupado '12:30' está en busy Y en full (cupo 1 →
    //     coinciden). Es el mismo assert de antes; lo que cambió es que el cupo 1 ahora lo declara el
    //     SERVICIO por el que se pregunta, no la ventana del bloque en la que cae el horario.
    const fullIndividual = bodyIndividual.full as string[]
    const busyIndividual = (bodyIndividual.busy as { time: string }[]).map(b => b.time.slice(0, 5))
    expect(busyIndividual).toContain('12:30')
    expect(fullIndividual).toContain('12:30')
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
    // ⚠ `otroServicio` DECLARADO GRUPAL cupo 3 no es adorno. Lo que este caso viene a probar es el gate
    // ESPEJO del SQL; si el paso 2 lo cortara antes el re-check JS del core (`taken && slotCapacity <= 1`),
    // el test seguiría pasando —el error es slot_taken en los dos casos— pero ya no probaría nada del
    // gate. Con el servicio en cupo 3 el early-return del JS no aplica y el rechazo llega del SQL.
    // (15-04) El bloque BAJÓ a su cupo por defecto: desde que las dos lecturas salen del servicio,
    // alcanza con declararlo UNA vez y en un solo lugar.
    await seedTimeBlock(t)
    await seedSimultaneousService(t, { capacity: 2 })
    const otroServicio = await seedService(t, { durationMinutes: 30, name: '__test_svc_grupal_inverso' })
    await seedGroupClassService(t, { capacity: 3, serviceId: otroServicio })

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
  it('no-drift — servicio individual: el solape cross-servicio lo sigue rechazando el EXCLUDE 013 (23P01)', async () => {
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

  // NO-DRIFT (b) — el caso que obligó a ACOTAR el gate espejo, REENCUADRADO por la migr. 068 (D-07).
  // Antes el escenario era "un bloque de agenda de cupo N hace nacer is_group = true a TODAS las filas
  // del negocio"; esa premisa murió con el cupo por servicio. El caso legal que el recorte protege
  // SOBREVIVE y ahora es explícito: dos servicios que DECLARAN cupo >= 2 pueden coexistir solapados en
  // la misma agenda — es lo que "cupo N" significa —, y con el predicado literal del review (solo
  // is_group = true) este test FALLA: la 2ª reserva sería rechazada y eso sería drift de group_class.
  //
  // ⚠ LOS DOS servicios tienen que ser GRUPALES. Dejar uno individual rompería el caso de VERDAD y no
  // por drift: un individual deriva v_seat := 0 fijo y chocaría con el índice único 011 contra el
  // asiento 0 del grupal.
  it('no-drift — dos servicios que DECLARAN cupo >= 2 siguen entrando en el mismo slot', async () => {
    // (15-04) Bloque en su cupo por defecto: el cupo lo DECLARAN los dos servicios, en su propia fila.
    await seedTimeBlock(t)
    const otroServicio = await seedService(t, { durationMinutes: 30, name: '__test_svc_nodrift_grupal' })
    await seedGroupClassService(t, { capacity: 3 })
    await seedGroupClassService(t, { capacity: 3, serviceId: otroServicio })

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
  it('CR-03 (a) — el lock de negocio-día serializa v_seat: 3 reservas concurrentes sobre un cupo de 3', async () => {
    // (migr. 068 + 15-04) El cupo lo declara el SERVICIO, y el bloque bajó a su cupo por defecto. El
    // riesgo que el bloque en 3 cubría —que una carrera perdida por milisegundos viera la fila de otra
    // ya commiteada y se comiera un `slot_taken` espurio del JS, volviendo flaky al guard de
    // serialización de `v_seat`— ahora lo cubre el propio servicio: el re-check JS lee `capacity` de la
    // fila grupal (3), así que su early-return sigue sin aplicar.
    await seedTimeBlock(t)
    await seedGroupClassService(t, { capacity: 3 })
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

  // ── Code-review de Phase 15 (WR-06): la casilla que la fase volvió alcanzable y nadie cubría ─────
  // La suite cubría simultáneo↔otro-servicio (CR-02/CR2-01), simultáneo↔espacio (gap 3) y
  // grupal↔grupal (no-drift b), pero NO `group_class` conviviendo con OTRO servicio en la misma
  // agenda ni `group_class` sobre una agenda con espacio. Esos dos huecos son EXACTAMENTE CR-01 y
  // CR-03, y son la razón por la que la fase pasó verde con los dos abiertos: antes de la migr. 068
  // un grupal REAL era indeclarable, así que el cuadrante no existía.

  // CR-01 — un GRUPAL no se monta sobre un turno de otro servicio de cupo 1 en la MISMA agenda.
  //
  // A/B medido contra la 068 (el estado que este test detecta): la reserva grupal ENTRABA —tanto a la
  // misma hora como escalonada— y quedaban 2 y hasta 3 turnos pisándose en una sola agenda, sin un
  // solo error. `is_group = true` saca la fila del EXCLUDE gist 013 y el gate espejo exigía que la
  // PREEXISTENTE fuera de un servicio simultáneo, cosa que un individual no es.
  it('CR-01 — grupal vs individual: un grupal NO se monta sobre un turno individual de la misma agenda', async () => {
    await seedTimeBlock(t)
    const individual = await seedService(t, { durationMinutes: 30, name: '__test_svc_ind_vs_grupal' })

    // Turno real del cliente, con el servicio INDIVIDUAL (nace is_group = false, dentro del gist).
    const ind = await createAppointmentCore({ ...baseInput(), serviceId: individual, time: '16:00' })
    expect(ind.ok).toBe(true)

    // Ahora el servicio del fixture se declara CLASE GRUPAL de cupo 3 y se intenta la misma agenda.
    await seedGroupClassService(t, { capacity: 3 })
    const mismaHora = await createAppointmentCore({ ...baseInput(), time: '16:00' })
    expect(mismaHora.ok).toBe(false)
    if (!mismaHora.ok) {
      // slot_taken (agenda ocupada por otra cosa), NUNCA slot_full: no es cupo lleno.
      expect(mismaHora.error).toBe('slot_taken')
      expect(mismaHora.status).toBe(409)
    }
    // Y ESCALONADO (el caso del repro: 10:15 sobre un 10:00-10:30), que es el que ni el índice único
    // 011 ni el re-check por hora exacta podrían ver.
    const escalonado = await createAppointmentCore({ ...baseInput(), time: '16:15' })
    expect(escalonado.ok).toBe(false)

    // El RPC es la AUTORIDAD (con autoAssign el core se saltea entero): mismo rechazo por RPC directo,
    // y por P0001 —el gate— no por el gist.
    const { error: rpcErr } = await t.admin.rpc('book_slot_atomic', {
      p_business_id: t.businessId,
      p_professional_id: t.professionalId,
      p_service_id: t.serviceId,
      p_location_id: t.locationId,
      p_date: DATE,
      p_time: '16:15',
      p_duration: 30,
      p_client_id: null,
      p_client_name: '__test_rpc_cr01',
      p_client_phone: null,
      p_client_email: null,
      p_notes: null,
      p_status: 'confirmed',
      p_expires_at: null,
    })
    expect(rpcErr?.message ?? '').toContain('slot_taken')
    expect(rpcErr?.code).toBe('P0001')

    // Assert DURO contra el estado real de la base: UNA sola fila ocupa la agenda en ese instante.
    expect(await occupantsOfBucketCovering('16:10')).toBe(1)
  })

  // CR-01 (eje INVERSO) — y tampoco al revés: un turno individual no se monta sobre una CLASE GRUPAL
  // ya reservada en la misma agenda. Es el mismo mecanismo (la fila grupal está fuera del gist) y las
  // otras dos capas ya lo bloqueaban (el re-check JS con `taken`, el read-path mandándolo a `busy`):
  // la base era la única que decía que sí, o sea que write-path y read-path estaban en desacuerdo.
  it('CR-01 (inverso) — un individual NO se monta sobre una clase grupal de la misma agenda', async () => {
    await seedTimeBlock(t)
    const individual = await seedService(t, { durationMinutes: 30, name: '__test_svc_ind_sobre_grupal' })
    await seedGroupClassService(t, { capacity: 3 })

    const clase = await createAppointmentCore({ ...baseInput(), time: '16:00' })
    expect(clase.ok).toBe(true)

    // Por RPC directo: escalonado, que es el único camino que el índice único 011 no ve (a la misma
    // hora exacta chocaría por seat 0 repetido).
    const { error: rpcErr } = await t.admin.rpc('book_slot_atomic', {
      p_business_id: t.businessId,
      p_professional_id: t.professionalId,
      p_service_id: individual,
      p_location_id: t.locationId,
      p_date: DATE,
      p_time: '16:15',
      p_duration: 30,
      p_client_id: null,
      p_client_name: '__test_rpc_cr01_inv',
      p_client_phone: null,
      p_client_email: null,
      p_notes: null,
      p_status: 'confirmed',
      p_expires_at: null,
    })
    expect(rpcErr?.message ?? '').toContain('slot_taken')
    expect(await occupantsOfBucketCovering('16:20')).toBe(1)
  })

  // CR-03 — clase grupal de cupo > 1 sobre una agenda con ESPACIO físico mapeado: configuración
  // IMPOSIBLE, rechazada de entrada, igual que el simultáneo desde la 064 (gap 3).
  //
  // A/B medido contra la 068: la 1ª inscripción ENTRABA y la 2ª moría con 23P01
  // (`appointment_spaces_no_overlap`) → el core lo traducía a `slot_taken` mientras `availability`
  // seguía ofreciendo los N lugares. O sea la mentira exacta que la 064 vino a eliminar.
  it('CR-03 — grupal cupo > 1 + espacio mapeado se rechaza con simultaneous_space_conflict', async () => {
    await seedTimeBlock(t)
    await seedGroupClassService(t, { capacity: 3 })
    const spaceA = await seedSpace(t, { name: 'A' })
    await seedAgendaSpace(t, { professionalId: t.professionalId, spaceId: spaceA })

    const res = await createAppointmentCore({ ...baseInput(), time: '16:00' })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      // Código PROPIO: NO slot_taken (no es un horario ocupado) ni slot_full (no es cupo lleno).
      expect(res.error).toBe('simultaneous_space_conflict')
      expect(res.status).toBe(409)
    }
    // Fail-closed de verdad: NO entró ni la 1ª inscripción (antes entraba y moría la 2ª).
    expect(await occupantsOfBucketCovering('16:00')).toBe(0)

    // El read-path deja de mentir: si el write-path rechaza SIEMPRE, no se ofrece ningún horario.
    const body = await availabilityFor(t.serviceId, t.professionalId)
    expect(body.full).toContain('16:00')
    expect(body.full).toContain('09:00')

    // Cero regresión del camino canchas/F11: con cupo 1 la MISMA agenda con el MISMO espacio reserva.
    await t.admin
      .from('services')
      .update({ capacity_mode: 'individual', capacity: 1 })
      .eq('id', t.serviceId)
      .eq('business_id', t.businessId)
    const cancha = await createAppointmentCore({ ...baseInput(), time: '16:00' })
    expect(cancha.ok).toBe(true)
  })

  // CR-02 — "Cualquiera" + CLASE GRUPAL: combo no soportado, rechazado en el SERVER (write y read).
  //
  // A/B medido contra la 068: con 2 profesionales comodín y un grupal de cupo 3, tres inscripciones
  // "Cualquiera" daban OK (proA) + OK (proB) + slot_taken. O sea: la clase de 3 lugares se llenaba a
  // los 2 Y las dos inscripciones quedaban en agendas DISTINTAS (no es una clase, son dos clases de
  // una persona). El gate existía desde la Phase 12 pero filtraba por `capacity_mode` simultáneo.
  it('CR-02 — "Cualquiera" + clase grupal se rechaza server-side, en el write y en el read', async () => {
    await seedTimeBlock(t)
    await seedProfessional(t, { name: '__test_pro_any_grupal' }) // 2 capaces: el rechazo no es "no hay a quién asignar"
    await seedGroupClassService(t, { capacity: 3 })

    // (write) El core rechaza ANTES de tocar el RPC: 400 y código PROPIO.
    const res = await createAppointmentCore({ ...baseInput(), professionalId: null, autoAssign: true, time: '09:00' })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toBe('any_professional_unsupported')
      expect(res.status).toBe(400)
    }
    // Fail-closed: no quedó ninguna fila.
    const { data: rows } = await t.admin
      .from('appointments').select('id').eq('business_id', t.businessId).eq('date', DATE)
    expect((rows || []).length).toBe(0)

    // (read) El endpoint anónimo TIENE que coincidir: servir la grilla agregada sería ofrecer horarios
    // que después mueren en el create.
    const { data: bizRow } = await t.admin.from('businesses').select('slug').eq('id', t.businessId).single()
    const url = `https://test.local/api/booking/availability?slug=${bizRow?.slug as string}&date=${DATE}&any=1&serviceId=${t.serviceId}`
    const anyRes = await availabilityGET(new Request(url) as unknown as NextRequest)
    expect(anyRes.status).toBe(400)
    expect(await anyRes.json()).toEqual({ ok: false, error: 'any_professional_unsupported' })
  })

  // CUPO-07 (d) — CARRERA GRUPAL con el cupo DECLARADO EN EL SERVICIO. N+1 reservas CONCURRENTES sobre
  // un grupal de cupo N tienen que dejar exactamente N. Los casos (a), (b) y (c) son secuenciales y
  // prueban de dónde sale el número; éste prueba que ese número sigue siendo el gate BAJO CARRERA, o
  // sea que el conteo corre dentro del lock de negocio-día y no como un count suelto (TOCTOU).
  //
  // ⚠ WARM-UP OBLIGATORIO antes del `Promise.all`, con TANTOS carriles como reservas concurrentes:
  // cada `createAppointmentCore` hace ~5 round-trips HTTP ANTES del `.rpc`, y con el pool frío el 1er
  // carril abre el socket y los demás esperan el suyo → llegan al RPC ESCALONADOS y la carrera nunca
  // ocurre. Es un falso verde YA MEDIDO en esta suite (CUPO-04: sin warm-up el test pasaba incluso con
  // el lock viejo).
  //
  // ⚠ EL CONTROL NEGATIVO, ESCRITO: el bloque de agenda queda en su cupo por DEFECTO (1) a propósito.
  // Con la lectura vieja —el cupo saliendo del BLOQUE— este MISMO test daría 1 confirmada y N
  // rechazadas: las filas nacerían con `is_group = false` y `v_seat` FIJO en 0, así que el índice único
  // 011 chocaría en el asiento 0. El A/B es exactamente el que separa las dos fuentes, y está medido
  // contra un MUTANTE de la función que restaura la consulta al bloque (ver 15-05-SUMMARY §A/B).
  it('CUPO-07 (d) — carrera: N+1 reservas concurrentes sobre un grupal de cupo N dejan exactamente N', async () => {
    const N = 3
    await seedTimeBlock(t) // cupo por DEFECTO (1): la fuente VIEJA diría 1 y este test lo detectaría
    await seedGroupClassService(t, { capacity: N })
    await warmUpPool(N + 1)

    const results = await Promise.all(
      Array.from({ length: N + 1 }, () => createAppointmentCore({ ...baseInput(), time: '19:00' })),
    )

    // N confirmadas y UNA sola rechazada, y rechazada por CUPO LLENO (slot_full/409), no por
    // doble-booking: un `slot_taken` acá sería la firma de la fuente vieja (seat 0 repetido → 23505).
    expect(results.filter(r => r.ok).length).toBe(N)
    const rechazadas = results.filter(r => !r.ok)
    expect(rechazadas.length).toBe(1)
    const rechazada = rechazadas[0]
    if (rechazada && !rechazada.ok) {
      expect(rechazada.error).toBe('slot_full')
      expect(rechazada.status).toBe(409)
    }

    // Estado REAL de la base (nunca los retornos del core): N filas, N asientos DISTINTOS —un asiento
    // repetido sería la derivación de asiento rota— y todas `is_group = true`, porque cupo >= 2 tiene
    // que salir del EXCLUDE gist 013 A PROPÓSITO (si naciera false, la 2ª fila del slot moriría).
    expect(await occupantsAt('19:00')).toBe(N)
    const { data: rows } = await t.admin
      .from('appointments').select('seat, is_group').eq('business_id', t.businessId).eq('date', DATE).eq('time', '19:00')
    expect((rows || []).length).toBe(N)
    expect(new Set((rows || []).map(r => r.seat)).size).toBe(N)
    expect((rows || []).every(r => r.is_group === true)).toBe(true)
  })
})
