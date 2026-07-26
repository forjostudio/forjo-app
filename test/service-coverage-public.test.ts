import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { hasSupabaseCreds } from './env'
import {
  seedOneTenant,
  teardownOneTenant,
  seedProfessional,
  seedProfessionalService,
  type SeededTenant,
} from './helpers/booking-fixtures'
import { bookableServices } from '@/lib/staff-services'
import type { Service, Professional, ProfessionalService } from '@/lib/types'

// ── Cobertura de servicios en la grilla pública con staff — Phase 10 (gap UAT) ──────────────────
//
// Bug cerrado: un servicio que NINGÚN profesional nombrado hace seguía siendo reservable en público
// (caía al fallback "Sin preferencia" y se reservaba contra el sentinel). El fix filtra la lista que
// `app/[slug]/page.tsx` pasa a BookingClient con `bookableServices` (regla del comodín + guarda de
// modo sentinel). Este test ejercita ese cálculo contra la DB LOCAL leyendo las MISMAS vistas
// acotadas que el RSC (public_services / public_professionals / public_professional_services, migr.
// 059 viva del reset del Plan 04) — no dobles de Supabase: espeja el patrón de staff-assignment.test.ts.
//
// Los 3 casos que blindan el fix + la NO-regresión:
//   (a) con mapeos y un servicio SIN cobertura → ese servicio NO está en la lista reservable.
//   (b) modo comodín (staff nombrado, SIN mapeos) → TODOS los servicios reservables.
//   (c) 0 profesionales nombrados (modo sentinel) → TODOS los servicios reservables (sin regresión).
//
// describe.skipIf(!hasSupabaseCreds): sin las 3 creds de Supabase se skipea (igual que el resto de la suite).

describe.skipIf(!hasSupabaseCreds)('cobertura de servicios en la reserva pública (gap UAT Phase 10)', () => {
  let t: SeededTenant
  let svc2: string // 2º servicio del negocio, usado para probar la cobertura parcial

  beforeAll(async () => {
    // El seed deja 1 servicio (t.serviceId) + 1 profesional (t.professionalId, comodín: 0 filas puente).
    t = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })
    const run = crypto.randomUUID().slice(0, 8)
    const ins = await t.admin
      .from('services')
      .insert({ business_id: t.businessId, name: `__test_svc2_${run}`, duration_minutes: 30, price: 100, active: true })
      .select('id')
      .single()
    expect(ins.error).toBeNull()
    svc2 = ins.data!.id as string
  })

  afterAll(async () => {
    if (t) await teardownOneTenant(t)
  })

  // Estado inicial reproducible entre casos: sin mapeos, solo el pro default activo (comodín).
  afterEach(async () => {
    if (!t) return
    await t.admin.from('professional_services').delete().eq('business_id', t.businessId)
    await t.admin.from('professionals').delete().eq('business_id', t.businessId).neq('id', t.professionalId)
    await t.admin.from('professionals').update({ active: true, location_id: null, service_id: null }).eq('id', t.professionalId)
  })

  // Lee las MISMAS vistas acotadas que consume el RSC público, filtradas por tenant (aislamiento).
  async function readPublicBooking(): Promise<{ services: Service[]; professionals: Professional[]; bridge: ProfessionalService[] }> {
    const [svc, pros, bridge] = await Promise.all([
      t.admin.from('public_services').select('*').eq('business_id', t.businessId),
      t.admin.from('public_professionals').select('*').eq('business_id', t.businessId),
      t.admin.from('public_professional_services').select('*').eq('business_id', t.businessId),
    ])
    return {
      services: (svc.data || []) as Service[],
      professionals: (pros.data || []) as Professional[],
      bridge: (bridge.data || []) as ProfessionalService[],
    }
  }

  // (a) — con mapeos y un servicio sin cobertura, ese servicio NO se ofrece.
  // proA queda mapeado SOLO a svc1 (t.serviceId) → deja de ser comodín; svc2 queda sin ningún capaz.
  it('(a) un servicio que ningún profesional nombrado hace NO es reservable', async () => {
    await seedProfessionalService(t, { professionalId: t.professionalId, serviceId: t.serviceId })

    const { services, professionals, bridge } = await readPublicBooking()
    const bookable = bookableServices(services, professionals, bridge).map((s) => s.id)

    expect(bookable).toContain(t.serviceId) // svc1: cubierto por proA → se ofrece
    expect(bookable).not.toContain(svc2) // svc2: sin cobertura → oculto
  })

  // (b) — modo comodín: staff nombrado SIN mapeos → todos los servicios reservables.
  it('(b) con staff comodín (sin mapeos) todos los servicios son reservables', async () => {
    // Aseguramos ≥1 pro comodín (el default lo es tras el afterEach). Agregamos otro comodín por robustez.
    await seedProfessional(t, { name: '__test_proB' })

    const { services, professionals, bridge } = await readPublicBooking()
    const bookable = bookableServices(services, professionals, bridge).map((s) => s.id)

    expect(bookable).toContain(t.serviceId)
    expect(bookable).toContain(svc2)
    expect(bookable.length).toBe(services.length) // no se oculta nada
  })

  // (c) — modo sentinel: 0 profesionales nombrados → todos los servicios reservables (guarda, sin regresión).
  // Desactivamos el único profesional: public_professionals (WHERE active=true) devuelve [] → guarda activa.
  it('(c) sin profesionales nombrados (sentinel) todos los servicios son reservables', async () => {
    await t.admin.from('professionals').update({ active: false }).eq('id', t.professionalId)

    const { services, professionals, bridge } = await readPublicBooking()
    expect(professionals.length).toBe(0) // modo sentinel confirmado por la vista

    const bookable = bookableServices(services, professionals, bridge).map((s) => s.id)
    expect(bookable).toContain(t.serviceId)
    expect(bookable).toContain(svc2)
    expect(bookable.length).toBe(services.length) // sin regresión: catálogo completo
  })
})
