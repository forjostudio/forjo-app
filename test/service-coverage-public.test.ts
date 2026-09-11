import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
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
// (caía al fallback "Sin preferencia" y se reservaba contra el sentinel). El cálculo que lo detecta es
// `bookableServices` (regla del comodín + guarda de modo sentinel), y ESO es lo que verifica este
// archivo: la función pura en sí misma, que sigue existiendo y sigue siendo correcta.
//
// ⚠ Lo que cambió en la Phase 20 (D-05) es QUIÉN la consume y QUÉ hace el público con la respuesta:
// `app/[slug]/page.tsx` ya NO filtra con ella el array que le pasa a BookingClient — pasa el catálogo
// completo, y `booking-client.tsx` deshabilita-con-motivo cada tarjeta usando `isServiceStaffed`
// (misma regla, misma guarda, preguntada por servicio). El comportamiento VISIBLE al público del eje
// staff lo verifica ahora esa superficie (ver Plan 20-02); el contrato de la función no cambió y por
// eso los 3 casos de acá siguen intactos.
//
// Este test ejercita ese cálculo contra la DB LOCAL leyendo las MISMAS vistas acotadas que el RSC
// (public_services / public_professionals / public_professional_services, migr. 059 viva del reset
// del Plan 04) y —desde el 2026-09-11— con el MISMO ROL: `anon` sin sesión. No dobles de Supabase.
// Antes leía con service role, que bypassa la RLS: el archivo pasaba aunque los GRANT estuvieran
// rotos, así que valía como test de `bookableServices` pero NO como evidencia de permisos (WR-05
// del code review de la Phase 20). Ahora vale como las dos cosas.
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

  // Cliente anon SIN sesión: el rol `anon` puro, el que atiende la página pública de reservas.
  // Mismo patrón que `anonPublic()` en test/isolation.test.ts y en el hermano del eje franja.
  const anonPublic = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    })

  // Lee las MISMAS vistas acotadas que consume el RSC público, por la MISMA ruta y con el MISMO rol,
  // filtradas por tenant (el caller filtra, contrato D-16).
  //
  // ⚠ Deliberadamente NO es `t.admin`. Hasta el 2026-09-11 esta función leía con service role
  // mientras el comentario de cabecera decía ejercitar "las MISMAS vistas acotadas que el RSC": el
  // service role BYPASSA la RLS, así que el archivo habría seguido verde con los GRANT de `anon`
  // completamente rotos. Lo marcó el code review de la Phase 20 (WR-05) y lo confirmó el
  // secure-phase, que dictaminó que este archivo no servía como evidencia de permisos. Las
  // ESCRITURAS del seed y del afterEach siguen con `t.admin` (montar el escenario es setup, no lo
  // que se está midiendo); lo que pasó a anon es la LECTURA, que es lo que el público hace.
  //
  // Los `error` se asertan: un fallo de permisos que devolviera `[]` en silencio haría pasar los
  // casos (b) y (c) por el motivo equivocado — todo reservable porque no llegó NADA, no porque la
  // regla del comodín dijera que sí.
  async function readPublicBooking(): Promise<{ services: Service[]; professionals: Professional[]; bridge: ProfessionalService[] }> {
    const pub = anonPublic()
    const [svc, pros, bridge] = await Promise.all([
      pub.from('public_services').select('*').eq('business_id', t.businessId),
      pub.from('public_professionals').select('*').eq('business_id', t.businessId),
      pub.from('public_professional_services').select('*').eq('business_id', t.businessId),
    ])
    expect(svc.error).toBeNull()
    expect(pros.error).toBeNull()
    expect(bridge.error).toBeNull()
    // El catálogo nunca puede venir vacío en estos escenarios: si viniera, la regla se estaría
    // evaluando sobre la nada y los casos (b)/(c) darían verde por el motivo equivocado.
    expect((svc.data || []).length).toBeGreaterThan(0)
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
