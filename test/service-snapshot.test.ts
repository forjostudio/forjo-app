import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { hasSupabaseCreds } from './env'
import { seedOneTenant, teardownOneTenant, purgeAbonos, type SeededTenant } from './helpers/booking-fixtures'
import { createAppointmentCore } from '@/lib/booking-core'

// ── Tests del snapshot de servicio (migr. 065, triggers BEFORE INSERT) ────────────────────────
// Cubren HIST-01/HIST-02: la historia de un turno deja de depender de que la fila de `services`
// siga viva. El mecanismo entero vive en la BASE (D-02), así que no hay función de TypeScript que
// testear: lo único que prueba que funciona es insertar de verdad y releer la fila.
//
// Cuatro propiedades del trigger `appointments_service_snapshot_trg`:
//   (1) escribe el snapshot sin que el write-path lo pida  → prueba directa de D-02
//   (2) nunca se refresca                                  → D-03 (foto, no espejo)
//   (3) ignora lo que manda el cliente                     → T-13-02 (anti-tampering)
//   (4) no cruza tenants                                   → T-13-01
// Más el snapshot de `abonos` (D-09), que es el mismo patrón sobre otra tabla.
//
// Sin las creds de Supabase el bloque entero se skipea (mismo molde que booking-core.test.ts y
// abono-cancel.test.ts). Se usa el cliente service-role del fixture tanto para sembrar como para releer: el trigger corre
// igual sea cual sea el rol (es la DB la que lo dispara), y acá NO se asierta RLS.
//
// Fecha futura fija (lunes) como en el resto de la suite, y un horario DISTINTO por caso para no
// chocar con el índice único 011 ni con la exclusion constraint 013.
const DATE = '2031-03-03'

describe.skipIf(!hasSupabaseCreds)('065: snapshot de servicio en appointments y abonos', () => {
  let t: SeededTenant
  let other: SeededTenant
  let svcName: string
  let svcPrice: number

  beforeAll(async () => {
    t = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })
    // Segundo tenant: SOLO para el caso 4 (service_id ajeno). Su servicio nunca debe filtrarse.
    other = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })

    const { data, error } = await t.admin
      .from('services')
      .select('name, price')
      .eq('id', t.serviceId)
      .single()
    if (error || !data) throw new Error(`no se pudo leer el servicio sembrado: ${error?.message}`)
    svcName = data.name as string
    svcPrice = Number(data.price)
  })

  afterAll(async () => {
    if (t) await teardownOneTenant(t)
    if (other) await teardownOneTenant(other)
  })

  // Cada caso limpia sus turnos: los horarios ya son distintos, pero así ningún caso hereda estado.
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
      clientName: 'Cliente Snapshot',
      clientPhone: null,
      clientEmail: null,
      notes: null,
      requireDeposit: false,
    }
  }

  async function snapshotOf(appointmentId: string) {
    const { data, error } = await t.admin
      .from('appointments')
      .select('service_id, service_name, service_price')
      .eq('id', appointmentId)
      .single()
    if (error || !data) throw new Error(`no se pudo releer el turno: ${error?.message}`)
    return {
      serviceId: data.service_id as string | null,
      name: data.service_name as string | null,
      price: data.service_price === null ? null : Number(data.service_price),
    }
  }

  // (1) D-02: el snapshot lo escribe la DB, no el caller. `createAppointmentCore` es el camino que
  // comparten los cuatro consumidores (booking público, alta manual, forward de abonos, canchas) y
  // NO se tocó en toda la fase: si el snapshot igual aparece, la promesa de "cero cambios en el
  // write-path" está cumplida de verdad.
  it('1 — createAppointmentCore deja el snapshot escrito sin pedirlo (D-02)', async () => {
    const res = await createAppointmentCore({ ...baseInput(), time: '09:00' })
    expect(res.ok).toBe(true)
    if (!res.ok) return

    const snap = await snapshotOf(res.appointmentId)
    expect(snap.name).toBe(svcName)
    expect(snap.price).toBe(svcPrice)
  }, 20000)

  // (2) D-03: el snapshot es una FOTO, no un espejo. Cambiarle el precio al servicio no puede
  // reescribir la facturación histórica: un turno de marzo conserva el precio de marzo.
  it('2 — cambiar precio y nombre del servicio NO altera el snapshot ya escrito (D-03)', async () => {
    const res = await createAppointmentCore({ ...baseInput(), time: '09:30' })
    expect(res.ok).toBe(true)
    if (!res.ok) return

    try {
      const upd = await t.admin
        .from('services')
        .update({ price: 777.77, name: '__test_svc_renombrado' })
        .eq('id', t.serviceId)
        .eq('business_id', t.businessId)
      expect(upd.error).toBeNull()

      const snap = await snapshotOf(res.appointmentId)
      expect(snap.name).toBe(svcName)
      expect(snap.price).toBe(svcPrice)
      expect(snap.price).not.toBe(777.77)
    } finally {
      // Restaurar el servicio: los demás casos (y el resto de la suite) esperan los valores del seed.
      await t.admin
        .from('services')
        .update({ price: svcPrice, name: svcName })
        .eq('id', t.serviceId)
        .eq('business_id', t.businessId)
    }
  }, 20000)

  // (3) T-13-02: el snapshot se SOBRESCRIBE siempre, nunca se respeta el valor entrante. Si no,
  // un dueño podría insertar por PostgREST con un `service_price` inventado e inflar su propia
  // facturación histórica.
  it('3 — un insert directo con service_name/service_price inventados es sobrescrito (T-13-02)', async () => {
    const ins = await t.admin
      .from('appointments')
      .insert({
        business_id: t.businessId,
        service_id: t.serviceId,
        professional_id: t.professionalId,
        location_id: t.locationId,
        date: DATE,
        time: '10:00',
        duration_minutes: 30,
        client_name: 'Cliente Tampering',
        status: 'confirmed',
        service_name: 'HACKEADO',
        service_price: 1,
      })
      .select('id')
      .single()
    expect(ins.error).toBeNull()

    const snap = await snapshotOf(ins.data!.id as string)
    expect(snap.name).toBe(svcName)
    expect(snap.name).not.toBe('HACKEADO')
    expect(snap.price).toBe(svcPrice)
    expect(snap.price).not.toBe(1)
  }, 20000)

  // (4) T-13-01: la función es SECURITY DEFINER, así que adentro NO hay RLS. Sin el filtro por
  // `business_id` un `service_id` de otro negocio resolvería y filtraría su nombre y su precio.
  // El comportamiento correcto es fail-safe: snapshot NULL y sin RAISE (el historial cae al join).
  it('4 — un service_id de OTRO tenant deja el snapshot en NULL, no filtra nada (T-13-01)', async () => {
    const ins = await t.admin
      .from('appointments')
      .insert({
        business_id: t.businessId, // tenant A
        service_id: other.serviceId, // servicio del tenant B
        professional_id: t.professionalId,
        location_id: t.locationId,
        date: DATE,
        time: '10:30',
        duration_minutes: 30,
        client_name: 'Cliente Cross-Tenant',
        status: 'confirmed',
      })
      .select('id')
      .single()
    expect(ins.error).toBeNull()

    const snap = await snapshotOf(ins.data!.id as string)
    expect(snap.name).toBeNull()
    expect(snap.price).toBeNull()

    // Y para que quede explícito qué NO se filtró: el nombre del servicio ajeno.
    const { data: otherSvc } = await other.admin
      .from('services')
      .select('name')
      .eq('id', other.serviceId)
      .single()
    expect(snap.name).not.toBe(otherSvc?.name)
  }, 20000)

  // (5) D-09: los abonos archivados dejan de bloquear el borrado, así que su detalle también
  // necesita sobrevivir al servicio. Mismo trigger, misma regla: lo escribe la DB sola.
  it('5 — un abono nuevo queda con el service_name del servicio (D-09)', async () => {
    const ins = await t.admin
      .from('abonos')
      .insert({
        business_id: t.businessId,
        service_id: t.serviceId,
        professional_id: t.professionalId,
        location_id: t.locationId,
        day_of_week: 1,
        start_time: '10:00',
      })
      .select('id')
      .single()
    expect(ins.error).toBeNull()

    const { data } = await t.admin
      .from('abonos')
      .select('service_name')
      .eq('id', ins.data!.id)
      .single()
    expect(data?.service_name).toBe(svcName)

    // Desde la migr. 066 la base rechaza el borrado de una serie 'active': se archiva primero.
    await purgeAbonos(t, { id: ins.data!.id })
  }, 20000)
})
