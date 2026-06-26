import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { hasSupabaseCreds } from './env'
import { seedOneTenant, teardownOneTenant, type SeededTenant } from './helpers/booking-fixtures'
import { createAppointmentCore } from '@/lib/booking-core'

// ── No-regresión del endpoint público tras consumir el core ───────────────────────────
// El refactor del Plan 01 movió la cadena de validación+insert de app/api/booking/create/route.ts
// a lib/booking-core.ts. El riesgo crítico (RESEARCH Pitfall 2 / T-01-04) es que la rama de SEÑA
// del público regrese: que un turno con seña deje de quedar pending_payment con expires_at.
//
// Testear el route handler público completo es inviable sin servidor (reCAPTCHA, secrets, cookies).
// Acá testeamos el CONTRATO del core con requireDeposit:true como proxy de esa rama: el core debe
// devolver status='pending_payment' y la fila insertada debe tener expires_at NO nulo. El guard
// real de la suite existente es TEST-01 (isolation) + webhook-deposit + webhook-subscription, que
// siguen verdes en `npm run test` y prueban el resto del flujo público end-to-end.
//
// describe.skipIf(!hasSupabaseCreds): sin creds Supabase, se skipea (igual que el resto).
const DATE = '2031-04-04'

describe.skipIf(!hasSupabaseCreds)('booking público: no-regresión del core (rama seña)', () => {
  let t: SeededTenant

  beforeAll(async () => {
    t = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })
  })

  afterAll(async () => {
    if (t) await teardownOneTenant(t)
  })

  afterEach(async () => {
    if (t) await t.admin.from('appointments').delete().eq('business_id', t.businessId)
  })

  function baseInput() {
    return {
      supabase: t.admin,
      business: { id: t.businessId, buffer_minutes: t.bufferMinutes },
      serviceId: t.serviceId,
      professionalId: t.professionalId,
      locationId: t.locationId,
      date: DATE,
      clientId: null,
      clientName: 'Cliente Público',
      clientPhone: null,
      clientEmail: null,
      notes: null,
    }
  }

  // Rama SEÑA sobrevive al refactor: requireDeposit=true → pending_payment + expires_at no nulo.
  it('con seña: crea pending_payment con expires_at no nulo', async () => {
    const res = await createAppointmentCore({ ...baseInput(), time: '14:00', requireDeposit: true, depositExpiryHours: 2 })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.status).toBe('pending_payment')
      const { data } = await t.admin
        .from('appointments')
        .select('status, expires_at')
        .eq('id', res.appointmentId)
        .single()
      expect(data?.status).toBe('pending_payment')
      expect(data?.expires_at).not.toBeNull()
    }
  })

  // Rama SIN seña sobrevive al refactor: requireDeposit=false → confirmed + expires_at null.
  it('sin seña: crea confirmed con expires_at null', async () => {
    const res = await createAppointmentCore({ ...baseInput(), time: '15:00', requireDeposit: false })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.status).toBe('confirmed')
      const { data } = await t.admin
        .from('appointments')
        .select('status, expires_at')
        .eq('id', res.appointmentId)
        .single()
      expect(data?.status).toBe('confirmed')
      expect(data?.expires_at).toBeNull()
    }
  })
})
