import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasSupabaseCreds } from './env'
import {
  seedOneTenant,
  teardownOneTenant,
  seedTimeBlock,
  seedProfessional,
  seedProfessionalService,
  type SeededTenant,
} from './helpers/booking-fixtures'
import { createAppointmentCore } from '@/lib/booking-core'

// ── Tests de asignación automática de profesional ("cualquiera") — Phase 9 (ASIGN-02/03/04) ──
//
// Criterio de éxito DURO del milestone (secure-phase OBLIGATORIO, D-12). La garantía real de la
// asignación "cualquiera" vive en la DB: la elección de un profesional capaz+libre ocurre DENTRO de
// book_slot_atomic (migr. 058), bajo el advisory lock AMPLIADO a (business_id+date+time). Por eso la
// verificación de ASIGN-03 es una CARRERA REAL (Promise.all) y las aserciones leen el ESTADO de la DB
// (occupantsAt + assignedProAt), NO los retornos del core — exactamente el molde de concurrency.test.ts.
//
// El único input que viaja del cliente por la vía "cualquiera" es `autoAssign: true` (nunca una lista
// de professionalId): los candidatos salen 100% server-side de business_id + professional_services +
// sede (anti-tampering D-06). Los tests de paridad-comodín y sede lo confirman.
//
// describe.skipIf(!hasSupabaseCreds): sin las 3 creds de Supabase se skipean (igual que concurrency).
// Corren contra Supabase LOCAL (supabase db reset PG17, con 058 aplicada → v_is_any en el RPC).
//
// Fecha futura fija (lunes) alineada con el day_of_week del time_block sembrado (seedTimeBlock default
// day_of_week=1) y sin chocar con turnos pasados.
const DATE = '2031-03-03' // lunes → EXTRACT(dow) = 1

const SENTINEL_NONE = '00000000-0000-0000-0000-000000000000'

describe.skipIf(!hasSupabaseCreds)('asignación automática: cualquiera', () => {
  let t: SeededTenant
  let supabase: SupabaseClient

  beforeAll(async () => {
    // Buffer 0 y servicio de 30'. proA = t.professionalId (creado en el seed → el MÁS VIEJO por
    // created_at, gana los desempates D-01). Cada test siembra su propio time_block y proB.
    t = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })
    supabase = t.admin
  })

  afterAll(async () => {
    if (t) await teardownOneTenant(t)
  })

  // Limpieza entre tests. Clave para la vía "cualquiera": TODOS los profesionales activos del negocio
  // son candidatos, así que hay que dejar EXACTAMENTE 1 (t.professionalId) tras cada test — si no, los
  // pros extra de un test anterior contaminarían la selección del siguiente. Además se resetea el pro
  // default (active/location_id/service_id) por si un test lo mutó (ej. el test de sede).
  afterEach(async () => {
    if (!t) return
    await t.admin.from('appointments').delete().eq('business_id', t.businessId)
    await t.admin.from('professional_services').delete().eq('business_id', t.businessId)
    await t.admin.from('agenda_spaces').delete().eq('business_id', t.businessId)
    await t.admin.from('spaces').delete().eq('business_id', t.businessId)
    await t.admin.from('time_blocks').delete().eq('business_id', t.businessId)
    // Borrar los profesionales extra (dejar solo el default) → estado inicial reproducible.
    await t.admin.from('professionals').delete().eq('business_id', t.businessId).neq('id', t.professionalId)
    // Resetear el pro default a su estado del seed (comodín, activo, sin sede/servicio).
    await t.admin.from('professionals').update({ active: true, location_id: null, service_id: null }).eq('id', t.professionalId)
  })

  // baseInput: molde de concurrency.test.ts pero con professionalId: null + autoAssign: true → el core
  // saltea la resolución de professionalId y pasa el UUID mágico al RPC, que elige el pro bajo el lock.
  function baseInput() {
    return {
      supabase,
      business: { id: t.businessId, buffer_minutes: t.bufferMinutes },
      serviceId: t.serviceId,
      professionalId: null as string | null,
      locationId: t.locationId as string | null,
      date: DATE,
      clientId: null,
      clientName: 'Cliente Test',
      clientPhone: null,
      clientEmail: null,
      notes: null,
      requireDeposit: false,
      autoAssign: true,
    }
  }

  // occupantsAt: cuenta independiente (t.admin) de filas que OCUPAN un slot (confirmed+pending_payment),
  // sin filtrar por profesional → captura la ocupación total del instante a través de todas las agendas.
  // Es la verificación que NO confía en los retornos del core sino en el estado real de la DB.
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

  // assignedProAt: lee el profesional REAL asignado desde la fila (Phase 9 NO cambia el RETURNS del RPC,
  // así que el pro elegido se lee de appointments.professional_id — Phase 10 lo expondrá en la UI).
  async function assignedProAt(appointmentId: string): Promise<string | null> {
    const { data } = await t.admin
      .from('appointments')
      .select('professional_id')
      .eq('id', appointmentId)
      .single()
    return (data?.professional_id as string | null) ?? null
  }

  // ASIGN-02 — asigna un capaz libre. 2 pros activos comodín (0 filas en la puente), cap 1; un autoAssign
  // en '09:00' → confirma con un professional_id CONCRETO ∈ {proA, proB} (nunca el UUID mágico ni null) y
  // exactamente 1 fila ocupa el slot. Prueba que "cualquiera" resuelve a una persona real capaz+libre.
  it('ASIGN-02 — asigna automáticamente un profesional capaz y libre', async () => {
    await seedTimeBlock(t, { capacity: 1 })
    const proA = t.professionalId
    const proB = await seedProfessional(t, { name: '__test_proB' })

    const res = await createAppointmentCore({ ...baseInput(), time: '09:00' })
    expect(res.ok).toBe(true)
    if (!res.ok) return

    const assigned = await assignedProAt(res.appointmentId)
    // El pro asignado es REAL (uno de los dos activos), nunca el mágico ni el sentinel de "sin profesional".
    expect([proA, proB]).toContain(assigned)
    expect(assigned).not.toBe('00000000-0000-0000-0000-000000000001')
    expect(assigned).not.toBe(SENTINEL_NONE)
    expect(await occupantsAt('09:00')).toBe(1)
  })

  // ASIGN-03 — dos "cualquiera" concurrentes → profesionales DISTINTOS. 2 pros libres, cap 1; Promise.all
  // de dos autoAssign sobre el MISMO '09:00'. El lock ampliado (biz+date+time) serializa la carrera EN LA
  // DB: la 1ª toma el lock y elige proA (menos carga, más viejo) e inserta; la 2ª espera, recomputa (proA
  // ya no está libre a las 09:00) y elige proB. Aserción DURA contra la DB: los dos professional_id son
  // distintos y occupantsAt === 2 (nunca 3, nunca el mismo pro dos veces). Es la prueba de atomicidad
  // exigida por D-12 — carrera real, no lectura de código.
  it('ASIGN-03 — dos reservas concurrentes de "cualquiera" caen en profesionales distintos', async () => {
    await seedTimeBlock(t, { capacity: 1 })
    await seedProfessional(t, { name: '__test_proB' })

    const [a, b] = await Promise.all([
      createAppointmentCore({ ...baseInput(), time: '09:00' }),
      createAppointmentCore({ ...baseInput(), time: '09:00' }),
    ])

    const oks = [a, b].filter(r => r.ok)
    expect(oks.length).toBe(2)

    // Los dos profesionales asignados (leídos de la DB) deben ser DISTINTOS → nunca doble-asignación.
    const ids = await Promise.all(
      oks.map(r => (r.ok ? assignedProAt(r.appointmentId) : Promise.resolve(null)))
    )
    expect(ids[0]).not.toBeNull()
    expect(ids[1]).not.toBeNull()
    expect(ids[0]).not.toBe(ids[1])

    // Exactamente 2 filas ocupan el slot (no 3): sin sobrecupo.
    expect(await occupantsAt('09:00')).toBe(2)
  })

  // ASIGN-03b — solo queda uno libre → 1 ok + 1 slot_taken. 2 pros pero proB pre-ocupado en '09:00';
  // Promise.all de dos autoAssign → una confirma (elige proA, el único libre), la otra RAISE 'slot_taken'
  // (D-10: sin candidato libre, el error de disponibilidad de siempre → 409). occupantsAt === 2 (el pre
  // + 1). Nunca se asigna a alguien ocupado, nunca se cae con una excepción no controlada.
  it('ASIGN-03b — con un solo profesional libre: una confirma y la otra recibe slot_taken', async () => {
    await seedTimeBlock(t, { capacity: 1 })
    const proB = await seedProfessional(t, { name: '__test_proB' })

    // Pre-ocupar proB en '09:00' por la vía ESPECÍFICA (autoAssign implícito false) → deja solo a proA libre.
    const pre = await createAppointmentCore({ ...baseInput(), autoAssign: false, professionalId: proB, time: '09:00' })
    expect(pre.ok).toBe(true)

    const [a, b] = await Promise.all([
      createAppointmentCore({ ...baseInput(), time: '09:00' }),
      createAppointmentCore({ ...baseInput(), time: '09:00' }),
    ])

    const oks = [a, b].filter(r => r.ok)
    const taken = [a, b].filter(r => !r.ok && r.error === 'slot_taken')
    expect(oks.length).toBe(1)
    expect(taken.length).toBe(1)
    const rejected = taken[0]
    if (!rejected.ok) expect(rejected.status).toBe(409)

    // La que confirmó cayó en proA (el único libre), nunca en proB (ya ocupado).
    const okRes = oks[0]
    if (okRes.ok) expect(await assignedProAt(okRes.appointmentId)).toBe(t.professionalId)

    // Exactamente 2 filas ocupan el slot: el pre-ocupado (proB) + la única que confirmó (proA).
    expect(await occupantsAt('09:00')).toBe(2)
  })

  // ASIGN-04 — reparto de carga: elige el de MENOS turnos ese día. proA con 2 turnos ese día en OTRAS
  // horas (10:00, 11:00), proB con 0; un autoAssign en '09:00' (ambos libres a esa hora) → cae en proB
  // (menos carga). El conteo de carga es del DÍA COMPLETO (D-02), no del slot pedido.
  it('ASIGN-04 — asigna al profesional con menos turnos ese día', async () => {
    await seedTimeBlock(t, { capacity: 1 })
    const proA = t.professionalId
    const proB = await seedProfessional(t, { name: '__test_proB' })

    // proA acumula 2 turnos ese día en horas que NO solapan las 09:00 → sigue libre a las 09:00 pero
    // con más carga. Vía específica (no autoAssign) para forzar que caigan en proA.
    for (const time of ['10:00', '11:00']) {
      const r = await createAppointmentCore({ ...baseInput(), autoAssign: false, professionalId: proA, time })
      expect(r.ok).toBe(true)
    }

    const res = await createAppointmentCore({ ...baseInput(), time: '09:00' })
    expect(res.ok).toBe(true)
    if (res.ok) expect(await assignedProAt(res.appointmentId)).toBe(proB)
  })

  // ASIGN-04 (desempate) — empate 0-0 → gana created_at ASC (el pro sembrado primero, D-01). Dos pros
  // libres, ambos con 0 turnos ese día; un autoAssign en '09:00' → cae SIEMPRE en proA (t.professionalId,
  // el del seed = más viejo). Determinístico (tests reproducibles) + self-balancing.
  it('ASIGN-04 (desempate) — empate en carga se resuelve por created_at (alta más vieja)', async () => {
    await seedTimeBlock(t, { capacity: 1 })
    const proA = t.professionalId
    await seedProfessional(t, { name: '__test_proB' })

    const res = await createAppointmentCore({ ...baseInput(), time: '09:00' })
    expect(res.ok).toBe(true)
    if (res.ok) expect(await assignedProAt(res.appointmentId)).toBe(proA)
  })

  // Paridad-comodín — respeta el mapeo professional_services. proA mapeado SOLO a otro servicio (≥1 fila
  // → capaz solo de lo mapeado), proB comodín (0 filas → capaz de todo); un autoAssign del servicio del
  // fixture → NUNCA cae en proA (no es capaz de ese servicio), cae en proB. Es la paridad EXACTA con
  // lib/staff-services.ts replicada en el SQL del RPC (anti-tampering: candidatos server-side, D-06/D-07).
  it('paridad-comodín — un profesional mapeado a otro servicio no es candidato del servicio pedido', async () => {
    await seedTimeBlock(t, { capacity: 1 })
    const proA = t.professionalId
    const proB = await seedProfessional(t, { name: '__test_proB' })

    // 2º servicio del negocio; proA queda mapeado SOLO a él → deja de ser comodín para t.serviceId.
    const run = crypto.randomUUID().slice(0, 8)
    const insSvc2 = await t.admin
      .from('services')
      .insert({ business_id: t.businessId, name: `__test_svc2_${run}`, duration_minutes: 30, price: 100, active: true })
      .select('id')
      .single()
    expect(insSvc2.error).toBeNull()
    const svc2 = insSvc2.data!.id as string
    await seedProfessionalService(t, { professionalId: proA, serviceId: svc2 })

    // autoAssign para el servicio del fixture (t.serviceId): proA NO es capaz (mapeado solo a svc2) → proB.
    const res = await createAppointmentCore({ ...baseInput(), time: '09:00' })
    expect(res.ok).toBe(true)
    if (res.ok) {
      const assigned = await assignedProAt(res.appointmentId)
      expect(assigned).toBe(proB)
      expect(assigned).not.toBe(proA)
    }
  })

  // Sede (D-07) — filtra candidatos por la sede de la reserva; sin-sede vale para todas. proA anclado a
  // la sede L1, proB sin sede; una reserva en L2 → proA excluido (L1 ≠ L2), proB candidato (location NULL
  // vale para cualquier sede) → cae en proB. Confirma el filtro de sede del set de candidatos.
  it('sede — un profesional de otra sede no es candidato; el sin-sede sí', async () => {
    await seedTimeBlock(t, { capacity: 1 })
    const proA = t.professionalId
    const proB = await seedProfessional(t, { name: '__test_proB' }) // sin sede (location_id NULL)

    // Dos sedes nuevas del negocio (L1, L2). proA se ancla a L1; la reserva se pide en L2.
    const run = crypto.randomUUID().slice(0, 8)
    const insL = await t.admin
      .from('locations')
      .insert([
        { business_id: t.businessId, name: `__test_L1_${run}` },
        { business_id: t.businessId, name: `__test_L2_${run}` },
      ])
      .select('id')
    expect(insL.error).toBeNull()
    const [L1, L2] = (insL.data || []).map(r => r.id as string)
    await t.admin.from('professionals').update({ location_id: L1 }).eq('id', proA)

    // Reserva en L2 → proA (anclado a L1) queda fuera; proB (sin sede) es el único candidato.
    const res = await createAppointmentCore({ ...baseInput(), locationId: L2, time: '09:00' })
    expect(res.ok).toBe(true)
    if (res.ok) {
      const assigned = await assignedProAt(res.appointmentId)
      expect(assigned).toBe(proB)
      expect(assigned).not.toBe(proA)
    }
  })
})
