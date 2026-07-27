import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { hasSupabaseCreds } from './env'
import { seedOneTenant, teardownOneTenant, type SeededTenant } from './helpers/booking-fixtures'
import type { Professional } from '@/lib/types'

// ── public_professionals NUNCA incluye canchas — hardening cierre Phase 10 (migr. 060) ──────────
//
// Contexto: en el vertical canchas (v0.13, migr. 043) una CANCHA es una fila de `professionals` con
// `service_id` NOT NULL. Un profesional de STAFF real tiene `service_id` NULL. Si un negocio cambió de
// vertical canchas → staff, sus filas-cancha siguen vivas (active=true, service_id NOT NULL) y, sin el
// filtro de la migr. 060, se filtrarían a `public_professionals` (la vista que el RSC del booking público
// lee como anon) apareciendo como profesionales reservables.
//
// Este test asegura, contra la DB LOCAL (misma vista acotada que el RSC), que:
//   - una fila-cancha (service_id NOT NULL, active) NO aparece en public_professionals para ese business.
//   - un profesional de staff (service_id NULL, active) SÍ aparece.
//
// describe.skipIf(!hasSupabaseCreds): sin las 3 creds de Supabase se skipea (igual que el resto de la suite).

describe.skipIf(!hasSupabaseCreds)('public_professionals excluye canchas (hardening migr. 060)', () => {
  let t: SeededTenant
  let canchaId: string // fila-cancha: professional con service_id NOT NULL

  beforeAll(async () => {
    // El seed deja 1 service (t.serviceId) + 1 professional STAFF (t.professionalId, service_id NULL).
    t = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })

    // Sembramos una CANCHA: un professional activo con service_id apuntando a un service (patrón migr. 043).
    const run = crypto.randomUUID().slice(0, 8)
    const ins = await t.admin
      .from('professionals')
      .insert({ business_id: t.businessId, name: `__test_cancha_${run}`, active: true, service_id: t.serviceId })
      .select('id')
      .single()
    expect(ins.error).toBeNull()
    canchaId = ins.data!.id as string
  })

  afterAll(async () => {
    if (t) await teardownOneTenant(t)
  })

  it('una cancha activa (service_id NOT NULL) NO aparece; el staff (service_id NULL) SÍ', async () => {
    const { data, error } = await t.admin
      .from('public_professionals')
      .select('*')
      .eq('business_id', t.businessId)
    expect(error).toBeNull()

    const ids = ((data || []) as Professional[]).map((p) => p.id)
    expect(ids).toContain(t.professionalId) // staff real (service_id NULL) → visible
    expect(ids).not.toContain(canchaId) // cancha (service_id NOT NULL) → excluida
  })
})
