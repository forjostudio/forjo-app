import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'
import { hasSupabaseCreds } from './env'
import {
  seedOneTenant,
  teardownOneTenant,
  seedTimeBlock,
  seedService,
  seedProfessional,
  seedTimeBlockService,
  seedSimultaneousService,
  type SeededTenant,
} from './helpers/booking-fixtures'
import { GET as availabilityGET } from '@/app/api/booking/availability/route'

// ── La agenda por servicio en el READ-PATH — Phase 18 (AGENDA-03 / AGENDA-04) ────────────────────
//
// Bug que cierra: `/api/booking/availability` filtraba las franjas (`time_blocks`) por negocio y por
// día de la semana, y NO por servicio — aunque recibe `serviceId` desde la Phase 15. Un negocio de
// clases terminaba ofreciendo cerámica en el horario de yoga. Desde la migr. 071 existe la puente
// `time_block_services` y la regla del comodín vive en `lib/time-block-services.ts` (Plan 18-02);
// este archivo congela que el endpoint la aplique — en sus TRES ramas.
//
// ⚠ POR QUÉ TODOS LOS CASOS QUE IMPORTAN SIEMBRAN FILAS EN LA PUENTE (D-02): con la puente vacía
// TODA franja es comodín y el endpoint se comporta EXACTAMENTE como hoy. O sea: un caso sin filas
// no puede distinguir "la regla está implementada" de "la regla no existe" — sólo prueba que no se
// rompió nada. Los casos que MIDEN son los que tienen mapeo explícito (1, 2, 4, 5, 6); los que no
// (3 y 7) valen únicamente EMPAREJADOS con ellos, como control de no-regresión.
//
// Escenario compartido (buffer 0, servicios de 30'):
//   - franja A 09:00-12:00  ┐ solapadas a propósito: el caso 4 necesita dos franjas que generen
//   - franja C 09:00-12:00  ┘ EL MISMO horario de inicio con mapeos distintos.
//   - franja B 12:00-15:00 → nunca se mapea: es la franja COMODÍN de control.
// Grilla resultante a paso 30': mañana = A/C (09:00…11:30), tarde = B (12:00…14:30).
//
// Los 7 casos:
//   1. filas + servicio NO mapeado           → los horarios de A/C se ocultan, los de B no. (AGENDA-03)
//   2. filas + servicio SÍ mapeado           → no se oculta nada. CONTROL: distingue "aplica la regla"
//                                              de "oculta todo".
//   3. puente vacía (comodín)                → no se oculta nada. CERO REGRESIÓN (D-02), y por sí solo
//                                              NO PRUEBA NADA: vale emparejado con el caso 1.
//   4. franjas solapadas, una SÍ da          → 09:00 NO se oculta. CONTROL NEGATIVO de la resta de
//                                              conjuntos: filtrar por "franja que no lo da" fallaría acá.
//   5. rama "Cualquiera" (any=1)             → la regla también aplica ahí (esa rama retorna temprano).
//   6. rama recurso simultáneo               → la regla también aplica ahí.
//   7. SIN serviceId (canchas / clientes viejos) → no se oculta nada. AGENDA-04: sin saber de qué
//                                              servicio se habla, la regla no se aplica.
//
// Corre contra la DB LOCAL (PG17, migr. 071 aplicada) invocando el route handler REAL con
// service-role, igual que booking-cualquiera-public.test.ts. Sin las 3 creds se skipea.

const DATE = '2031-03-03' // lunes → EXTRACT(dow) = 1, alineado con el default de seedTimeBlock

// Horarios de inicio que genera cada franja a paso = 30' (misma fórmula que el endpoint y el client).
const MANIANA = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30'] // franjas A y C
const TARDE = ['12:00', '12:30', '13:00', '13:30', '14:00', '14:30'] // franja B (siempre comodín)

// GET al route handler real (lee request.url, resuelve el tenant por slug, service-role).
// Mirror exacto de cómo lo invoca booking-cualquiera-public.test.ts.
async function getAvailability(
  slug: string,
  params: { professionalId?: string; any?: boolean; serviceId?: string },
): Promise<{ ok: boolean; busy: { time: string }[]; full: string[] }> {
  const sp = new URLSearchParams({ slug, date: DATE })
  if (params.professionalId) sp.set('professionalId', params.professionalId)
  if (params.any) sp.set('any', '1')
  if (params.serviceId) sp.set('serviceId', params.serviceId)
  const res = await availabilityGET(
    new Request(`https://test.local/api/booking/availability?${sp.toString()}`) as unknown as NextRequest,
  )
  return (await res.json()) as { ok: boolean; busy: { time: string }[]; full: string[] }
}

describe.skipIf(!hasSupabaseCreds)('disponibilidad por servicio: la franja que no lo da deja de ofrecerse (AGENDA-03/04)', () => {
  let t: SeededTenant
  let slug: string
  let svc1: string // el service del seed
  let svc2: string // 2º service del mismo negocio: el que NO va a estar mapeado
  let blockA: string // 09:00-12:00
  let blockB: string // 12:00-15:00 (comodín de control, nunca se mapea)
  let blockC: string // 09:00-12:00, SOLAPA a A a propósito (caso 4)

  beforeAll(async () => {
    t = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })
    svc1 = t.serviceId
    svc2 = await seedService(t, { durationMinutes: 30 })
    blockA = await seedTimeBlock(t, { dayOfWeek: 1, startTime: '09:00', endTime: '12:00' })
    blockB = await seedTimeBlock(t, { dayOfWeek: 1, startTime: '12:00', endTime: '15:00' })
    blockC = await seedTimeBlock(t, { dayOfWeek: 1, startTime: '09:00', endTime: '12:00' })
    const { data: bizRow } = await t.admin.from('businesses').select('slug').eq('id', t.businessId).single()
    slug = bizRow?.slug as string
  })

  afterAll(async () => {
    if (t) await teardownOneTenant(t)
  })

  // Estado inicial reproducible: puente VACÍA (todas las franjas comodín), sin profesionales extra y
  // los dos servicios en el modo DEFAULT. El tenant y sus servicios se comparten entre los casos, así
  // que el caso 6 (que muta svc2 a simultáneo) DEBE devolverlo o los siguientes medirían otra rama —
  // es la advertencia que trae el propio fixture seedSimultaneousService.
  afterEach(async () => {
    if (!t) return
    await t.admin.from('time_block_services').delete().eq('business_id', t.businessId)
    await t.admin.from('professionals').delete().eq('business_id', t.businessId).neq('id', t.professionalId)
    await t.admin
      .from('services')
      .update({ capacity_mode: 'individual', capacity: 1 })
      .eq('business_id', t.businessId)
      .neq('capacity_mode', 'individual')
  })

  // Mapea las dos franjas de la mañana (A y C) al servicio indicado: el estado base de los casos que
  // MIDEN. Deja B sin filas → comodín.
  async function mapMorningTo(serviceId: string) {
    await seedTimeBlockService(t, { timeBlockId: blockA, serviceId })
    await seedTimeBlockService(t, { timeBlockId: blockC, serviceId })
  }

  it('1. CON FILAS, servicio NO mapeado: los horarios de esas franjas dejan de ofrecerse y los de la franja comodín siguen', async () => {
    await mapMorningTo(svc1) // A y C dan svc1 y SOLO svc1; B queda comodín

    const res = await getAvailability(slug, { serviceId: svc2 })

    expect(res.ok).toBe(true)
    // Los 6 horarios de la mañana (que sólo producen franjas que NO dan svc2) se ocultan.
    for (const hhmm of MANIANA) expect(res.full).toContain(hhmm)
    // Los de la tarde salen de B, que sigue siendo comodín → se siguen ofreciendo.
    for (const hhmm of TARDE) expect(res.full).not.toContain(hhmm)
  })

  it('2. CONTROL: con las MISMAS filas, el servicio SÍ mapeado no pierde ningún horario', async () => {
    await mapMorningTo(svc1)

    const res = await getAvailability(slug, { serviceId: svc1 })

    expect(res.ok).toBe(true)
    // Sin ocupación real, `full` no puede contener ningún horario de bloque. Este caso es el que
    // distingue "la regla se aplica al servicio pedido" de "el endpoint oculta todo cuando hay filas".
    for (const hhmm of [...MANIANA, ...TARDE]) expect(res.full).not.toContain(hhmm)
  })

  it('3. COMODÍN (0 filas): no se oculta nada — cero regresión (D-02). ⚠ Por sí solo NO prueba nada: vale sólo emparejado con el caso 1', async () => {
    // Sin sembrar nada: la puente arranca vacía en cada caso (afterEach). Es literalmente el estado
    // del día de la migración — todos los negocios en cero — y por eso el comportamiento es el de HOY.
    const res = await getAvailability(slug, { serviceId: svc2 })

    expect(res.ok).toBe(true)
    for (const hhmm of [...MANIANA, ...TARDE]) expect(res.full).not.toContain(hhmm)
  })

  it('4. CONTROL NEGATIVO (solape): un horario que TAMBIÉN produce una franja que SÍ da el servicio no se oculta', async () => {
    // A da svc1, C da svc2. Las dos generan los MISMOS horarios (09:00-12:00). Pedir svc2:
    // implementar la regla como "los horarios de las franjas que no lo dan" ocultaría la mañana
    // entera por culpa de A — y sería un bug silencioso. La resta de conjuntos del helper salva C.
    await seedTimeBlockService(t, { timeBlockId: blockA, serviceId: svc1 })
    await seedTimeBlockService(t, { timeBlockId: blockC, serviceId: svc2 })

    const res = await getAvailability(slug, { serviceId: svc2 })

    expect(res.ok).toBe(true)
    for (const hhmm of MANIANA) expect(res.full).not.toContain(hhmm)
    for (const hhmm of TARDE) expect(res.full).not.toContain(hhmm)
  })

  it('5. RAMA "Cualquiera" (any=1): la regla también aplica ahí — esa rama retorna ANTES del camino de siempre', async () => {
    // 2º profesional comodín: la agregación across-staff necesita candidatos reales. svc2 sigue en
    // cupo 1, que es lo único soportado por esta rama (T-12-11).
    await seedProfessional(t)
    await mapMorningTo(svc1)

    const res = await getAvailability(slug, { any: true, serviceId: svc2 })

    expect(res.ok).toBe(true)
    for (const hhmm of MANIANA) expect(res.full).toContain(hhmm)
    for (const hhmm of TARDE) expect(res.full).not.toContain(hhmm)
  })

  it('6. RAMA RECURSO SIMULTÁNEO: la regla también aplica ahí', async () => {
    // El modo se declara ANTES de pedir disponibilidad (el afterEach lo devuelve a 'individual').
    await seedSimultaneousService(t, { capacity: 2, serviceId: svc2 })
    await mapMorningTo(svc1)

    const res = await getAvailability(slug, { serviceId: svc2 })

    expect(res.ok).toBe(true)
    for (const hhmm of MANIANA) expect(res.full).toContain(hhmm)
    for (const hhmm of TARDE) expect(res.full).not.toContain(hhmm)
  })

  it('7. SIN serviceId (canchas y clientes viejos): con las filas puestas, la regla NO se aplica (AGENDA-04)', async () => {
    await mapMorningTo(svc1)

    const res = await getAvailability(slug, {})

    expect(res.ok).toBe(true)
    // No se sabe de qué servicio se habla ⇒ no hay nada que ocultar. La respuesta queda idéntica a la
    // de hoy: es el fail-safe que mantiene a canchas (que nunca manda serviceId) sin regresión.
    for (const hhmm of [...MANIANA, ...TARDE]) expect(res.full).not.toContain(hhmm)
  })
})
