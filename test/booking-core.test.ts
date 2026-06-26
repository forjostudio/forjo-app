import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasSupabaseCreds } from './env'
import { seedOneTenant, teardownOneTenant, type SeededTenant } from './helpers/booking-fixtures'
import { createAppointmentCore } from '@/lib/booking-core'

// ── Tests del core de creación de turno (lib/booking-core.ts) ─────────────────────────
// Cubre MANUAL-01 (pipeline reusable) y MANUAL-03 (respeta disponibilidad real, no sobre-reserva).
// El core es el corazón anti-doble-booking que v0.9 endureció: estos tests son el guard de que el
// refactor no regresó y de que el alta manual (Plan 02) reusa la MISMA lógica.
//
// describe.skipIf(!hasSupabaseCreds): sin las 3 creds de Supabase, se skipean (igual que isolation).
// Se usa el cliente service-role del helper como el `supabase` del core: el core es rol-agnóstico y
// acá NO se asierta RLS (eso es de isolation.test.ts) sino la lógica del core. El service-role aísla
// el test del core de la cuestión de permisos.
//
// Fecha futura fija para no chocar con lógica de turnos pasados ni con la suite de aislamiento.
const DATE = '2031-03-03'

describe.skipIf(!hasSupabaseCreds)('booking-core: createAppointmentCore', () => {
  let t: SeededTenant
  let other: SeededTenant
  let supabase: SupabaseClient

  beforeAll(async () => {
    // Tenant principal: buffer 0, servicio de 30'. El test E reseed con buffer propio.
    t = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })
    // Segundo tenant: para el test de anti-tampering (serviceId de OTRO negocio).
    other = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })
    supabase = t.admin
  })

  afterAll(async () => {
    if (t) await teardownOneTenant(t)
    if (other) await teardownOneTenant(other)
  })

  // Cada test limpia los appointments que sembró para no contaminar al siguiente (mismo business/date).
  afterEach(async () => {
    if (t) await t.admin.from('appointments').delete().eq('business_id', t.businessId)
  })

  function baseInput() {
    return {
      supabase,
      business: { id: t.businessId, buffer_minutes: t.bufferMinutes },
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

  // Test A — anti-tampering: un serviceId que NO es de este business → invalid_service (400).
  it('A — rechaza un serviceId de otro business (invalid_service)', async () => {
    const res = await createAppointmentCore({
      ...baseInput(),
      serviceId: other.serviceId, // servicio del OTRO tenant
      time: '09:00',
    })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toBe('invalid_service')
      expect(res.status).toBe(400)
    }
  })

  // Test C — confirmed directo: requireDeposit=false sobre slot libre → ok, confirmed, expires_at null.
  it('C — inserta confirmed directo con expires_at null (requireDeposit=false)', async () => {
    const res = await createAppointmentCore({ ...baseInput(), serviceId: t.serviceId, time: '10:00' })
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.status).toBe('confirmed')
      expect(res.appointmentId).toBeTruthy()
      // Verificación independiente: la fila insertada está confirmed con expires_at null.
      const { data } = await t.admin
        .from('appointments')
        .select('status, expires_at')
        .eq('id', res.appointmentId)
        .single()
      expect(data?.status).toBe('confirmed')
      expect(data?.expires_at).toBeNull()
    }
  })

  // Test B — slot_taken por re-check JS: con un confirmed existente, un horario solapado del mismo
  // bucket (profesional) → slot_taken (409). No debe llegar siquiera al insert.
  it('B — rechaza un horario solapado con un confirmed existente (slot_taken por re-check)', async () => {
    const first = await createAppointmentCore({ ...baseInput(), serviceId: t.serviceId, time: '11:00' })
    expect(first.ok).toBe(true)
    // 11:15 cae dentro de [11:00, 11:30) del primero → solapa.
    const second = await createAppointmentCore({ ...baseInput(), serviceId: t.serviceId, time: '11:15' })
    expect(second.ok).toBe(false)
    if (!second.ok) {
      expect(second.error).toBe('slot_taken')
      expect(second.status).toBe(409)
    }
  })

  // Test D — constraint atómica (mapeo 23505/23P01 → slot_taken): se fuerza la CARRERA. El re-check
  // JS de arriba ve el slot libre (le pasamos un cliente cuyo SELECT de clashes devuelve vacío),
  // pero la fila ocupante YA existe en la DB → el INSERT choca con la constraint 011/013 y el core
  // traduce 23505/23P01 a slot_taken. Esto prueba el respaldo ATÓMICO, no el re-check de UX.
  it('D — traduce el choque de constraint (23505/23P01) a slot_taken', async () => {
    // Sembrar el ocupante directo en la DB (confirmed, mismo business/pro/date/time).
    const occ = await t.admin
      .from('appointments')
      .insert({
        business_id: t.businessId,
        client_name: 'Ocupante',
        service_id: t.serviceId,
        professional_id: t.professionalId,
        date: DATE,
        time: '12:00',
        duration_minutes: 30,
        status: 'confirmed',
      })
      .select('id')
      .single()
    expect(occ.error).toBeNull()

    // Cliente "ciego": intercepta el SELECT de clashes de appointments y devuelve [] (simula la
    // ventana de carrera donde el ocupante aparece DESPUÉS del re-check). El resto de las llamadas
    // (services/professionals/locations/insert) pasan al cliente real. Así el core pasa el re-check
    // y llega al INSERT, que choca con la constraint viva → 23505/23P01.
    const blindSupabase = {
      from(table: string) {
        const real = t.admin.from(table)
        if (table !== 'appointments') return real
        // Envolver solo el SELECT de re-check: in('status', ...) → Promise<{ data: [] }>.
        const wrapped: Record<string, unknown> = {}
        for (const key of ['select', 'eq', 'in', 'insert', 'update', 'single', 'maybeSingle']) {
          wrapped[key] = (...args: unknown[]) => {
            // El re-check termina la cadena con .in('status', [...]) y la await-ea directamente.
            if (key === 'in') {
              return Promise.resolve({ data: [], error: null })
            }
            const out = (real as unknown as Record<string, (...a: unknown[]) => unknown>)[key](...args)
            return out === real ? wrapped : out
          }
        }
        return wrapped
      },
    } as unknown as SupabaseClient

    const res = await createAppointmentCore({
      ...baseInput(),
      supabase: blindSupabase,
      serviceId: t.serviceId,
      time: '12:00', // mismo slot que el ocupante → choca con 011/013
    })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toBe('slot_taken')
      expect(res.status).toBe(409)
    }
  })

  // Test E — buffer: con buffer_minutes > 0, un turno que NO se solapa nominalmente pero cae dentro
  // del buffer del turno ocupado → slot_taken. Reseed un tenant con buffer 15'.
  it('E — rechaza un turno dentro del buffer (slot_taken)', async () => {
    const bt = await seedOneTenant({ bufferMinutes: 15, serviceDurationMinutes: 30 })
    try {
      const input = {
        supabase: bt.admin,
        business: { id: bt.businessId, buffer_minutes: bt.bufferMinutes },
        professionalId: bt.professionalId,
        locationId: bt.locationId,
        date: DATE,
        clientId: null,
        clientName: 'Cliente Buffer',
        clientPhone: null,
        clientEmail: null,
        notes: null,
        requireDeposit: false,
      }
      // Ocupante 09:00–09:30. Con buffer 15', el rango ocupado efectivo es [08:45, 09:45).
      const first = await createAppointmentCore({ ...input, serviceId: bt.serviceId, time: '09:00' })
      expect(first.ok).toBe(true)
      // 09:35 NO se solapa nominalmente con [09:00, 09:30), pero cae dentro del buffer (< 09:45) → taken.
      const second = await createAppointmentCore({ ...input, serviceId: bt.serviceId, time: '09:35' })
      expect(second.ok).toBe(false)
      if (!second.ok) expect(second.error).toBe('slot_taken')
    } finally {
      await teardownOneTenant(bt)
    }
  })
})
