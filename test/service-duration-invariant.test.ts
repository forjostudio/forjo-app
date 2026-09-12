import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { hasSupabaseCreds } from './env'
import { seedOneTenant, seedTimeBlock, teardownOneTenant, type SeededTenant } from './helpers/booking-fixtures'

// ── La invariante de duración vive en la BASE (migr. 077, G-21-11) ──────────────────────────────
//
// QUÉ SE ROMPE SI ESTE ARCHIVO SE PONE ROJO: `book_slot_atomic` arma TODOS sus chequeos de solape
// como `tsrange(p_date + p_time, ... + make_interval(mins => p_duration))`. Con `p_duration = 0` ese
// rango es **vacío**, y un rango vacío NO SOLAPA CON NADA: los seis gates anti-doble-booking pasan
// en silencio y el turno se inserta encima de cualquier otro. Eso es el Core Value del proyecto
// fallando sin producir un solo error visible — un turno creado, ningún mensaje, y dos clientes en
// el mismo horario.
//
// POR QUÉ ESTO SE PRUEBA CONTRA LA BASE Y NO CON UN DOBLE. Lo que se verifica acá no es una función
// de TypeScript: son dos CHECK constraints y un `RAISE EXCEPTION` adentro de una función
// `SECURITY DEFINER`. Un mock del cliente de Supabase no puede rechazar nada — probaría el mock.
// Mismo criterio que `test/book-slot-atomic-anon-revoke.test.ts` y los dos triggers de la 065.
//
// POR QUÉ EL CAMINO FELIZ ES UNA SOLA ASERCIÓN DE HUMO. Que una reserva normal siga funcionando ya
// lo cubren `concurrency`, `booking-core`, `staff-assignment` y `canchas-booking`. Acá sólo hace
// falta descartar que el guard sea un "no" universal disfrazado de invariante; duplicar el camino
// feliz sería otra suite que mantener diciendo lo mismo.

// Fecha fija: 2031-03-03 es LUNES (EXTRACT(dow) = 1), alineada con el `day_of_week` default de
// `seedTimeBlock`. Misma constante que test/concurrency.test.ts.
const DATE = '2031-03-03'

describe.skipIf(!hasSupabaseCreds)('duración: la invariante está en la base (migr. 077)', () => {
  let t: SeededTenant

  beforeAll(async () => {
    t = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })
    await seedTimeBlock(t)
  }, 60_000)

  afterAll(async () => {
    if (t) await teardownOneTenant(t)
  }, 60_000)

  // ── 1. services: una duración <= 0 es IRREPRESENTABLE ──────────────────────────────────────────
  // El insert va con el SERVICE-ROLE, que bypassa la RLS: lo que rechaza la fila es el CHECK y nada
  // más. Si se hiciera con un cliente anon, un rechazo de la RLS sería indistinguible del rechazo
  // del CHECK y el test pasaría verde por el motivo equivocado.
  it('services rechaza duration_minutes 0 con 23514 (CHECK violation)', async () => {
    const { error } = await t.admin.from('services').insert({
      business_id: t.businessId, name: '__test_dur_cero', duration_minutes: 0, price: 100,
    })

    expect(error).not.toBeNull()
    expect(error?.code).toBe('23514')
  }, 30_000)

  it('services rechaza también los negativos', async () => {
    const { error } = await t.admin.from('services').insert({
      business_id: t.businessId, name: '__test_dur_negativa', duration_minutes: -30, price: 100,
    })

    expect(error?.code).toBe('23514')
  }, 30_000)

  // Control positivo: sin él, los dos casos de arriba podrían estar verdes porque el insert falla
  // por cualquier otro motivo (RLS, columna faltante) y el CHECK ni existiría.
  it('control positivo: una duración legítima SIGUE entrando', async () => {
    const { data, error } = await t.admin.from('services').insert({
      business_id: t.businessId, name: '__test_dur_ok', duration_minutes: 30, price: 100,
    }).select('id').single()

    expect(error).toBeNull()
    expect(data?.id).toBeTruthy()
    if (data?.id) await t.admin.from('services').delete().eq('id', data.id)
  }, 30_000)

  // ── 2. appointments: el 0 se rechaza, el NULL es LEGAL ─────────────────────────────────────────
  // Las dos mitades son el contrato, y el segundo caso existe para que nadie lo "arregle": los seis
  // chequeos de solape del motor dependen de `COALESCE(a.duration_minutes, 30)`. Volver la columna
  // NOT NULL rompería ese contrato, y el test lo FIJA en vez de dejarlo escrito en un comentario.
  it('appointments rechaza duration_minutes 0', async () => {
    const { error } = await t.admin.from('appointments').insert({
      business_id: t.businessId, service_id: t.serviceId, professional_id: t.professionalId,
      date: DATE, time: '15:00', duration_minutes: 0, client_name: '__test_dur', status: 'confirmed',
    })

    expect(error).not.toBeNull()
    expect(error?.code).toBe('23514')
  }, 30_000)

  it('appointments ACEPTA duration_minutes NULL (lo que el COALESCE del EXCLUDE necesita)', async () => {
    const { data, error } = await t.admin.from('appointments').insert({
      business_id: t.businessId, service_id: t.serviceId, professional_id: t.professionalId,
      date: DATE, time: '16:00', duration_minutes: null, client_name: '__test_dur_null', status: 'confirmed',
    }).select('id').single()

    expect(error).toBeNull()
    expect(data?.id).toBeTruthy()
    if (data?.id) await t.admin.from('appointments').delete().eq('id', data.id)
  }, 30_000)

  // ── 3. book_slot_atomic: el parámetro degenerado se rechaza en vez de armar un rango vacío ─────
  // ESTE es el caso, y está MEDIDO, no argumentado. Contra el Postgres local, revirtiendo las dos
  // piezas de la 077 (la función sin el guard y `appointments` sin su CHECK), con un turno
  // `confirmed` de 60 minutos a las 14:00 ya sembrado:
  //
  //     book_slot_atomic(..., p_time => '14:30', p_duration => 0)
  //       NOTICE: RPC DEVOLVIO TURNO: 77e0dd6f-…
  //       NOTICE: FILAS INTRUSAS CREADAS ENCIMA DEL TURNO DE 14:00: 1
  //
  // O sea: turno creado ENCIMA de otro, cero errores. La falla silenciosa que justifica la
  // migración entera es real, no teórica.
  //
  // Las dos piezas de la 077 la atajan por separado, y la aserción sobre `invalid_duration` es lo
  // que distingue una de la otra: sin el guard, el 0 igual rebota — pero contra el CHECK de
  // `appointments`, con un error crudo de Postgres y DESPUÉS de haber tomado los locks. El guard es
  // el que falla temprano y con un código que alguien puede leer. Si un día se borrara, este test se
  // pone rojo aunque la fila siga sin crearse (verificado revirtiendo sólo la función: 2 rojos).
  //
  // El conteo contra la base va igual: un `error != null` puede venir de mil motivos que no son
  // "el guard rechazó el parámetro".
  async function book(duration: number | null, time: string) {
    return t.admin.rpc('book_slot_atomic', {
      p_business_id: t.businessId,
      p_professional_id: t.professionalId,
      p_service_id: t.serviceId,
      p_location_id: t.locationId,
      p_date: DATE,
      p_time: time,
      p_duration: duration,
      p_client_id: null,
      p_client_name: '__test_dur_rpc',
      p_client_phone: '1122334455',
      p_client_email: null,
      p_notes: null,
      p_status: 'confirmed',
      p_expires_at: null,
    })
  }

  async function countAt(time: string): Promise<number> {
    const { data, error } = await t.admin
      .from('appointments').select('id')
      .eq('business_id', t.businessId).eq('date', DATE).eq('time', time)
    if (error) throw new Error(`countAt falló: ${error.message}`)
    return (data ?? []).length
  }

  it('book_slot_atomic con p_duration 0 falla con el código de dominio y NO deja fila', async () => {
    const { error } = await book(0, '09:00')

    expect(error).not.toBeNull()
    expect(error?.message).toContain('invalid_duration')
    expect(await countAt('09:00')).toBe(0)
  }, 30_000)

  it('book_slot_atomic con p_duration NULL también falla cerrado', async () => {
    const { error } = await book(null, '09:30')

    expect(error).not.toBeNull()
    expect(error?.message).toContain('invalid_duration')
    expect(await countAt('09:30')).toBe(0)
  }, 30_000)

  it('humo: una reserva con duración real sigue funcionando (el guard no es un no universal)', async () => {
    const { error } = await book(t.serviceDurationMinutes, '10:00')

    expect(error).toBeNull()
    expect(await countAt('10:00')).toBe(1)
  }, 30_000)
})
