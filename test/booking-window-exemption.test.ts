import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { hasSupabaseCreds } from './env'
import { seedOneTenant, teardownOneTenant, type SeededTenant } from './helpers/booking-fixtures'
import { createAppointmentCore } from '@/lib/booking-core'
import { isDateOutOfWindow } from '@/lib/booking-window'

// ── Exención del alta MANUAL respecto de la ventana de reserva (BOOK-WINDOW-03) ────────────────
// La ventana de reserva vive SOLO en el route público (app/api/booking/create, backstop del Plan 04).
// El núcleo compartido lib/booking-core.ts NO conoce la ventana a propósito: el alta manual autenticada
// (app/api/appointments/create) reusa ese mismo core → el dueño puede cargar turnos con CUALQUIER
// anticipación (exención por diseño). Este test lo demuestra por construcción: el core acepta una fecha
// muy lejana igual que cualquier otra, así que el alta manual —que es core sin ventana encima— queda exenta.
//
// Nota de honestidad de scope (mismo criterio que booking-public-regression.test.ts): el route handler
// público completo (reCAPTCHA, secrets, cookies, service-role) es inviable de invocar sin server; por eso
// el RECHAZO del backstop se cubre como UNIDAD del predicado en lib/booking-window.test.ts (Plan 01) y acá
// se cubre la EXENCIÓN vía el core + el contrato del predicado que el route consume.
//
// describe.skipIf(!hasSupabaseCreds): el caso con DB se skipea sin creds; el caso unitario del predicado
// corre siempre (no toca DB).

const FAR_DATE = '2031-05-05' // fecha muy lejana, mismo estilo que el harness (manual-booking usa la misma)

describe.skipIf(!hasSupabaseCreds)('alta manual exenta de la ventana: el core acepta fecha lejana', () => {
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

  // El core (que usa el alta manual) NO aplica ninguna ventana: una fecha lejana entra igual → confirmed.
  it('createAppointmentCore acepta una fecha muy lejana y crea un turno confirmed', async () => {
    const res = await createAppointmentCore({
      supabase: t.admin,
      business: { id: t.businessId, buffer_minutes: t.bufferMinutes },
      serviceId: t.serviceId,
      professionalId: t.professionalId,
      locationId: t.locationId,
      date: FAR_DATE,
      time: '10:00',
      clientId: null,
      clientName: 'Alta Manual Lejana',
      clientPhone: null,
      clientEmail: null,
      notes: null,
      requireDeposit: false,
    })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.status).toBe('confirmed')
      const { data } = await t.admin
        .from('appointments')
        .select('status')
        .eq('id', res.appointmentId)
        .single()
      expect(data?.status).toBe('confirmed')
    }
  })
})

// ── Contrato del predicado que ejerce el backstop del route público ────────────────────────────
// Deja explícito el comportamiento que app/api/booking/create consume: rechaza fuera de ventana, permite
// dentro, y sin límite nunca rechaza. Complementa lib/booking-window.test.ts (que cubre hora AR e inclusive)
// dejando pegado al test de exención el contrato exacto del backstop. Sin DB → corre siempre.
describe('contrato del backstop: isDateOutOfWindow', () => {
  it('rechaza una fecha fuera de la ventana (max_advance_days)', () => {
    expect(isDateOutOfWindow({ max_advance_days: 30 }, FAR_DATE)).toBe(true)
  })

  it('permite una fecha dentro de la ventana (hoy → siempre <= corte)', () => {
    // "Hoy" siempre cae dentro de una ventana rolling de 30 días (corte = hoy+30, inclusive).
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    expect(isDateOutOfWindow({ max_advance_days: 30 }, `${y}-${m}-${d}`)).toBe(false)
  })

  it('sin límite (business sin columnas de ventana) → nunca fuera de ventana', () => {
    expect(isDateOutOfWindow({}, FAR_DATE)).toBe(false)
  })
})
