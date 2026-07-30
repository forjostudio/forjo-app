import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasSupabaseCreds } from './env'
import {
  seedOneTenant,
  teardownOneTenant,
  seedTimeBlock,
  seedProfessional,
  seedProfessionalService,
  seedSimultaneousService,
  type SeededTenant,
} from './helpers/booking-fixtures'
import { createAppointmentCore } from '@/lib/booking-core'
import { GET as availabilityGET } from '@/app/api/booking/availability/route'
import { POST as createPOST } from '@/app/api/booking/create/route'

// ── Verificación end-to-end de "Cualquiera" en la reserva pública — Phase 10 (DISP-01/02/03 + ASIGN-05) ──
//
// Corre contra la DB LOCAL (supabase db reset PG17, con la migr. 059 aplicada → vista
// public_professional_services viva). Prioriza aserciones sobre el ESTADO REAL de la DB por sobre dobles
// de Supabase (patrón STATE 07-12 / staff-assignment.test.ts): la agregación de disponibilidad la sirve
// el route handler real de availability con service-role, y la asignación "Cualquiera" la resuelve el
// RPC 058 bajo el advisory lock.
//
// Qué se cubre:
//   - DISP-01: 2 pros capaces, uno ocupado a las 10:00 → la rama any NO oculta 10:00 (el otro libre); busy:[].
//   - DISP-03: 2 pros, ambos ocupados a las 10:00 → 10:00 va a `full` (ningún capaz libre).
//   - DISP-02: con un professionalId específico (sin any), la disponibilidad es la de ESA agenda
//              (contrato {ok,busy,full} por-agenda, cero diff de la fase — D-08).
//   - ASIGN-05 / wiring: un POST create con anyProfessional:true deja el turno con professional_id NO nulo
//              (lo asignó el RPC 058, NO cae al bucket SENTINEL — Pitfall 2) y su nombre es resoluble por
//              el join professionals(name); un create SIN anyProfessional (professionalId:null) queda con
//              professional_id NULL (sentinel → sin nombre).
//
// Caveat conocido (documentado, no es bug): la enumeración server de la rama any usa la grilla semanal
// del dow; un horario ESPECIAL que EXTIENDE el día (schedule_exceptions) podría ofrecer un start-time
// fuera de esa grilla. Ese caso raro lo respalda el RPC (RAISE slot_taken → 409/toast normal): el RPC es
// la autoridad. No se testea como bug.
//
// describe.skipIf(!hasSupabaseCreds): sin las 3 creds de Supabase se skipea (igual que el resto de la suite).
const DATE = '2031-03-03' // lunes → EXTRACT(dow) = 1, alineado con seedTimeBlock default (day_of_week=1)
const SENTINEL_NONE = '00000000-0000-0000-0000-000000000000'

// GET al route handler real de availability (lee request.url, resuelve tenant por slug, service-role).
// Mirror de cómo concurrency.test.ts invoca availabilityGET(new Request(url)).
async function getAvailability(
  slug: string,
  params: { professionalId?: string; any?: boolean; serviceId?: string },
): Promise<{ ok: boolean; busy: { time: string }[]; full: string[] }> {
  const sp = new URLSearchParams({ slug, date: DATE })
  if (params.professionalId) sp.set('professionalId', params.professionalId)
  if (params.any) sp.set('any', '1')
  if (params.serviceId) sp.set('serviceId', params.serviceId)
  const url = `https://test.local/api/booking/availability?${sp.toString()}`
  const res = await availabilityGET(new Request(url) as unknown as NextRequest)
  return (await res.json()) as { ok: boolean; busy: { time: string }[]; full: string[] }
}

// Igual que getAvailability pero SIN asumir el contrato feliz: devuelve status + body crudo. Lo necesita
// T-12-11, donde la rama "Cualquiera" ya no responde una grilla sino un rechazo { ok:false, error } 400.
async function getAvailabilityRaw(
  slug: string,
  params: { professionalId?: string; any?: boolean; serviceId?: string },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const sp = new URLSearchParams({ slug, date: DATE })
  if (params.professionalId) sp.set('professionalId', params.professionalId)
  if (params.any) sp.set('any', '1')
  if (params.serviceId) sp.set('serviceId', params.serviceId)
  const res = await availabilityGET(new Request(`https://test.local/api/booking/availability?${sp.toString()}`) as unknown as NextRequest)
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

// POST al route handler real de create (mismo patrón que canchas-booking.test.ts). Ejercita el wiring
// real body.anyProfessional === true → autoAssign (Pitfall 2). reCAPTCHA: el negocio fixture no tiene
// secret → verifyRecaptcha permite sin token, igual que el resto de la suite.
async function postCreate(
  body: Record<string, unknown>,
): Promise<{ status: number; body: { ok: boolean; error?: string; appointmentId?: string } }> {
  const res = await createPOST(
    new Request('https://test.local/api/booking/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
  const parsed = (await res.json()) as { ok: boolean; error?: string; appointmentId?: string }
  return { status: res.status, body: parsed }
}

describe.skipIf(!hasSupabaseCreds)('reserva "Cualquiera" pública (DISP-01/02/03 + ASIGN-05)', () => {
  let t: SeededTenant
  let supabase: SupabaseClient
  let slug: string

  beforeAll(async () => {
    // buffer 0, servicio 30'. proA = t.professionalId (el más viejo por created_at → gana los desempates).
    t = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })
    supabase = t.admin
    // time_block del lunes 08:00-20:00, capacity 1 (individual → busy y full coinciden por-agenda).
    await seedTimeBlock(t, { capacity: 1 })
    // Quitar la ventana de reserva (migr. 052 default max_advance_days=30): la DATE sentinela está 5 años
    // en el futuro; sin esto el create devolvería date_out_of_window (mismo ajuste que canchas-booking).
    await t.admin.from('businesses').update({ max_advance_days: null, max_advance_date: null }).eq('id', t.businessId)
    const { data: bizRow } = await t.admin.from('businesses').select('slug').eq('id', t.businessId).single()
    slug = bizRow?.slug as string
  })

  afterAll(async () => {
    if (t) await teardownOneTenant(t)
  })

  // Limpieza entre tests: dejar EXACTAMENTE el estado del seed (1 pro comodín, sin turnos, sin puente).
  // Igual que staff-assignment.test.ts: por la vía "Cualquiera" TODOS los pros activos son candidatos, así
  // que un pro extra de un test previo contaminaría la agregación/asignación del siguiente.
  afterEach(async () => {
    if (!t) return
    await t.admin.from('appointments').delete().eq('business_id', t.businessId)
    await t.admin.from('professional_services').delete().eq('business_id', t.businessId)
    await t.admin.from('professionals').delete().eq('business_id', t.businessId).neq('id', t.professionalId)
    await t.admin.from('professionals').update({ active: true, location_id: null, service_id: null }).eq('id', t.professionalId)
    // (Phase 12 / T-12-11) Los casos de recurso simultáneo mutan el service del fixture; el tenant y el
    // service son COMPARTIDOS por todo el archivo, así que hay que devolverlos a los DEFAULT de la 062
    // ('group_class'/1) o los casos DISP-01/02/03 y ASIGN-05 medirían el otro modo (molde concurrency.test.ts).
    await t.admin
      .from('services')
      .update({ capacity_mode: 'group_class', capacity: 1 })
      .eq('id', t.serviceId)
      .eq('business_id', t.businessId)
  })

  // Ocupa un slot por la vía ESPECÍFICA (autoAssign:false, professionalId concreto) → inserta un turno
  // vivo en la agenda de ese pro. Molde de staff-assignment (pre-ocupar por professionalId).
  function occupyInput(professionalId: string, time: string) {
    return {
      supabase,
      business: { id: t.businessId, buffer_minutes: t.bufferMinutes },
      serviceId: t.serviceId,
      professionalId,
      locationId: t.locationId as string | null,
      date: DATE,
      time,
      clientId: null,
      clientName: 'Ocupa',
      clientPhone: null,
      clientEmail: null,
      notes: null,
      requireDeposit: false,
      autoAssign: false,
    }
  }

  // Nombre del profesional resuelto por el join (mismo camino que turno/[token] y el mail ASIGN-05).
  async function proNameFor(appointmentId: string): Promise<string | null> {
    const { data } = await t.admin
      .from('appointments')
      .select('professional_id, professionals(name)')
      .eq('id', appointmentId)
      .eq('business_id', t.businessId)
      .single()
    return (data?.professionals as { name?: string } | null)?.name ?? null
  }
  async function assignedProAt(appointmentId: string): Promise<string | null> {
    const { data } = await t.admin
      .from('appointments')
      .select('professional_id')
      .eq('id', appointmentId)
      .eq('business_id', t.businessId)
      .single()
    return (data?.professional_id as string | null) ?? null
  }

  // ── DISP-01 — un horario aparece disponible si ALGÚN capaz lo tiene libre (unión, no intersección) ──
  // 2 pros comodín (0 filas en la puente = capaz de todo); proA ocupado a las 10:00, proB libre. La rama
  // any (any=1&serviceId) NO debe ocultar las 10:00 (proB sigue libre). Contrato acotado D-06: busy:[].
  it('DISP-01 — con un capaz ocupado y otro libre, la rama any NO oculta el horario', async () => {
    const proA = t.professionalId
    await seedProfessional(t, { name: '__test_proB' }) // proB comodín, libre

    // Ocupar SOLO a proA a las 10:00.
    const occ = await createAppointmentCore({ ...occupyInput(proA, '10:00') })
    expect(occ.ok).toBe(true)

    const body = await getAvailability(slug, { any: true, serviceId: t.serviceId })
    expect(body.ok).toBe(true)
    // D-06: la rama any colapsa la unión a booleano-por-slot en `full`; busy SIEMPRE vacío.
    expect(body.busy).toEqual([])
    // 10:00 sigue ofreciéndose porque proB está libre (unión de disponibilidad).
    expect(body.full).not.toContain('10:00')
    // Un slot sin nadie ocupado tampoco se oculta (sanity).
    expect(body.full).not.toContain('09:00')
  })

  // ── DISP-03 — si NINGÚN capaz tiene lugar en ese start-time, NO se ofrece (va a `full`) ──
  // 2 pros, AMBOS ocupados a las 10:00 (individual, cap 1) → ningún capaz libre a esa hora → 10:00 en full.
  it('DISP-03 — con todos los capaces ocupados, el horario se oculta (full)', async () => {
    const proA = t.professionalId
    const proB = await seedProfessional(t, { name: '__test_proB' })

    const a = await createAppointmentCore({ ...occupyInput(proA, '10:00') })
    const b = await createAppointmentCore({ ...occupyInput(proB, '10:00') })
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)

    const body = await getAvailability(slug, { any: true, serviceId: t.serviceId })
    expect(body.ok).toBe(true)
    expect(body.busy).toEqual([])
    // Ningún capaz libre a las 10:00 → el start-time se oculta.
    expect(body.full).toContain('10:00')
    // Otro horario (sin ocupar) sigue disponible.
    expect(body.full).not.toContain('11:00')
  })

  // ── DISP-02 — camino ESPECÍFICO (sin any) = disponibilidad de ESA agenda, byte-idéntica a hoy (D-08) ──
  // proA ocupado a las 10:00. Consultar por professionalId=proA refleja SOLO su agenda (10:00 lleno);
  // consultar por proB (libre) devuelve su agenda vacía. La fase NO tocó este camino: sigue por-agenda y
  // con la forma exacta { ok, busy, full } (sin agregación across-staff).
  it('DISP-02 — la disponibilidad por professionalId específico es la de esa agenda (cero regresión)', async () => {
    const proA = t.professionalId
    const proB = await seedProfessional(t, { name: '__test_proB' })

    const occ = await createAppointmentCore({ ...occupyInput(proA, '10:00') })
    expect(occ.ok).toBe(true)

    // Agenda de proA (ocupada a las 10:00): forma exacta del contrato + 10:00 lleno en SU agenda.
    const aBody = await getAvailability(slug, { professionalId: proA })
    expect(Object.keys(aBody).sort()).toEqual(['busy', 'full', 'ok'])
    expect(aBody.ok).toBe(true)
    expect(aBody.full).toContain('10:00') // individual (cap 1): busy y full coinciden en ese slot
    expect(aBody.busy.map(x => x.time.slice(0, 5))).toContain('10:00')

    // Agenda de proB (libre): la ocupación de proA NO se filtra a la agenda de proB (per-agenda, no unión).
    const bBody = await getAvailability(slug, { professionalId: proB })
    expect(bBody.ok).toBe(true)
    expect(bBody.full).not.toContain('10:00')
    expect(bBody.busy).toEqual([])
  })

  // ── ASIGN-05 / wiring — "Cualquiera" (anyProfessional:true) asigna un pro REAL; sentinel queda NULL ──
  // El POST create con anyProfessional:true pasa autoAssign al RPC 058, que elige un capaz+libre bajo el
  // lock e inserta el professional_id REAL: el turno NO cae al bucket SENTINEL (Pitfall 2) y su nombre es
  // resoluble por el join. Un create SIN anyProfessional (professionalId:null) queda en el sentinel de hoy
  // (professional_id NULL → sin nombre), lo que prueba que es el FLAG el que dispara la asignación.
  it('ASIGN-05 — un turno "Cualquiera" queda con professional_id NO nulo y nombre resoluble', async () => {
    const proA = t.professionalId
    const proB = await seedProfessional(t, { name: '__test_proB' }) // 2 capaces comodín → hay a quién asignar

    const { status, body } = await postCreate({
      slug,
      serviceId: t.serviceId,
      professionalId: null, // el front NUNCA manda un id como asignación (D-05)
      anyProfessional: true, // el boolean dispara autoAssign
      date: DATE,
      time: '09:00',
      clientName: 'Cliente Cualquiera',
      clientPhone: null,
      clientEmail: null,
    })
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.appointmentId).toBeTruthy()

    // El turno quedó con un pro REAL (no NULL, no el sentinel, no el UUID mágico) → wiring OK (Pitfall 2).
    const assigned = await assignedProAt(body.appointmentId!)
    expect(assigned).not.toBeNull()
    expect([proA, proB]).toContain(assigned)
    expect(assigned).not.toBe(SENTINEL_NONE)
    expect(assigned).not.toBe('00000000-0000-0000-0000-000000000001')
    // El nombre es resoluble por el join professionals(name) → disponible para confirmación/mail (ASIGN-05).
    const name = await proNameFor(body.appointmentId!)
    expect(name).toBeTruthy()
  })

  it('ASIGN-05 (sentinel) — sin anyProfessional el turno queda en el sentinel (professional_id NULL, sin nombre)', async () => {
    // Sin el flag: professionalId:null cae al bucket SENTINEL de hoy (D-08). Es el contraste que prueba
    // que la asignación la dispara anyProfessional, no la ausencia de professionalId.
    const { status, body } = await postCreate({
      slug,
      serviceId: t.serviceId,
      professionalId: null,
      // anyProfessional AUSENTE (sentinel / "sin preferencia" de hoy)
      date: DATE,
      time: '11:00',
      clientName: 'Cliente Sentinela',
    })
    expect(status).toBe(200)
    expect(body.ok).toBe(true)

    const assigned = await assignedProAt(body.appointmentId!)
    expect(assigned).toBeNull() // sentinel → sin profesional
    const name = await proNameFor(body.appointmentId!)
    expect(name).toBeNull() // sin profesional → sin nombre en confirmación/mail
  })

  // ── T-12-11 (secure-phase) — el combo "Cualquiera" + recurso simultáneo se rechaza EN EL SERVIDOR ──
  // D-13 dice que la combinación no está soportada (la asignación automática del RPC no es capacity-aware
  // para un recurso simultáneo). Hasta este fix el ÚNICO gate era la tarjeta oculta del selector
  // (booking-client.tsx) — una decisión de UI, no un control de seguridad: un POST forjado con
  // `anyProfessional:true` entraba igual y degradaba la disponibilidad (el 2º lugar del recurso quedaba
  // inalcanzable, con slot_taken espurio). El punto del test es EXACTAMENTE ese: la request que la UI
  // nunca manda tiene que morir en el server.
  it('T-12-11 — un create con anyProfessional:true sobre un servicio SIMULTÁNEO se rechaza server-side', async () => {
    await seedProfessional(t, { name: '__test_proB' }) // 2 capaces: el rechazo NO es "no hay a quién asignar"
    await seedSimultaneousService(t, { capacity: 2 })

    const forged = {
      slug,
      serviceId: t.serviceId,
      professionalId: null,
      anyProfessional: true, // el flag que la UI (D-13) jamás manda para este servicio
      date: DATE,
      time: '09:00',
      clientName: 'Cliente Forjado',
    }
    const { status, body } = await postCreate(forged)
    // 400 (request no soportada), NO 409: no es un conflicto de horario. Código PROPIO: colapsarlo en
    // slot_taken haría indistinguible un error de configuración de un choque real.
    expect(status).toBe(400)
    expect(body.ok).toBe(false)
    expect(body.error).toBe('any_professional_unsupported')

    // Fail-closed de verdad: no quedó NINGUNA fila (el rechazo corre antes del RPC).
    const { data: rows } = await t.admin
      .from('appointments')
      .select('id')
      .eq('business_id', t.businessId)
      .eq('date', DATE)
    expect((rows || []).length).toBe(0)

    // Cero regresión de "Cualquiera" (Phase 10): el MISMO POST sobre un servicio `group_class` sigue
    // entrando ⇒ lo que gatea es el MODO del servicio, no el flag.
    await t.admin
      .from('services')
      .update({ capacity_mode: 'group_class', capacity: 1 })
      .eq('id', t.serviceId)
      .eq('business_id', t.businessId)
    const grupal = await postCreate(forged)
    expect(grupal.status).toBe(200)
    expect(grupal.body.ok).toBe(true)
    expect(await assignedProAt(grupal.body.appointmentId!)).not.toBeNull()
  })

  // ── T-12-11 (read-path) — availability y create tienen que ESTAR DE ACUERDO ──────────────────────
  // Si el write-path rechaza el combo, el read-path no puede seguir sirviendo una grilla agregada para
  // él: sería ofrecerle al público un horario que después falla. A/B en el mismo test: la respuesta con
  // `group_class` se captura ANTES, se compara contra la de DESPUÉS de volver al modo default y tiene que
  // ser idéntica (cero regresión de la rama `any`, el invariante de la fase).
  it('T-12-11 (read) — availability con any=1 sobre un servicio SIMULTÁNEO devuelve el error, no la grilla', async () => {
    await seedProfessional(t, { name: '__test_proB' })

    // (A) group_class (default de toda fila existente): grilla agregada de hoy.
    const antes = await getAvailability(slug, { any: true, serviceId: t.serviceId })
    expect(antes.ok).toBe(true)
    expect(antes.busy).toEqual([])

    // (B) mismo request con el service en modo simultáneo → rechazo, mismo código que el write-path.
    await seedSimultaneousService(t, { capacity: 2 })
    const rechazo = await getAvailabilityRaw(slug, { any: true, serviceId: t.serviceId })
    expect(rechazo.status).toBe(400)
    expect(rechazo.body).toEqual({ ok: false, error: 'any_professional_unsupported' })

    // (C) de vuelta a group_class: la grilla `any` es BYTE-IDÉNTICA a (A).
    await t.admin
      .from('services')
      .update({ capacity_mode: 'group_class', capacity: 1 })
      .eq('id', t.serviceId)
      .eq('business_id', t.businessId)
    const despues = await getAvailability(slug, { any: true, serviceId: t.serviceId })
    expect(despues).toEqual(antes)

    // Y el camino ESPECÍFICO (sin `any`) del servicio simultáneo sigue sirviendo su grilla: el gate es
    // sólo sobre "Cualquiera", no sobre el modo (D-13 exige elegir profesional, no prohíbe reservar).
    await seedSimultaneousService(t, { capacity: 2 })
    const especifico = await getAvailability(slug, { professionalId: t.professionalId, serviceId: t.serviceId })
    expect(especifico.ok).toBe(true)
  })
})
