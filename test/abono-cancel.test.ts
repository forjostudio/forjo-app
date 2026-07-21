import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasSupabaseCreds } from './env'
import { seedOneTenant, teardownOneTenant, type SeededTenant } from './helpers/booking-fixtures'
import { cancelAbonoSeries, previewAbonoCancellation } from '@/lib/abono-cancel'

// ── Tests del motor compartido de BAJA de serie (lib/abono-cancel.ts) ─────────────────────────
// Prueban contra la DB local (Supabase, migr. 054 aplicada) el EFECTO REAL de la baja, que es lo que
// no se puede asertar con funciones puras: que la cancelación en masa alcanza SOLO los turnos futuros
// de SU serie y de SU tenant (D-24, T-07-01), que la frontera de hoy es inclusive (D-02), que el gate
// atómico hace la baja idempotente (D-05) y que un abono 'completed' se da de baja por el mismo camino
// (D-21). Las REGLAS puras (qué es futuro, conteo/última fecha) viven en lib/abono-cancel.test.ts.
//
// describe.skipIf(!hasSupabaseCreds): sin creds de Supabase se skipean en bloque (igual que el resto
// de test/). Se usa el service-role del fixture como el `supabase` del motor: el motor es rol-agnóstico
// y acá se asierta su LÓGICA, no RLS (eso es de isolation.test.ts).
//
// Fechas FIJAS en el futuro lejano (2031) para no chocar con ninguna lógica de turnos pasados, y
// `todayStr` se le pasa SIEMPRE explícito al motor: el test no depende del reloj del runner.
// 2031-03-03 es LUNES; las fechas van de a 7 días.
const PAST_1 = '2031-03-03'
const PAST_2 = '2031-03-10'
const TODAY = '2031-03-17' // corte: este turno TAMBIÉN se cancela (frontera inclusive, D-02)
const FUT_1 = '2031-03-24'
const FUT_2 = '2031-03-31'
const FUT_3 = '2031-04-07'
const SERIES_DATES = [PAST_1, PAST_2, TODAY, FUT_1, FUT_2, FUT_3]
const FUTURE_DATES = [TODAY, FUT_1, FUT_2, FUT_3]

const TIME_A = '10:00'
const TIME_B = '11:00' // distinto horario que A: dos series del mismo negocio que no se solapan

describe.skipIf(!hasSupabaseCreds)('abono-cancel: cancelAbonoSeries / previewAbonoCancellation', () => {
  let t: SeededTenant
  let other: SeededTenant
  let supabase: SupabaseClient
  let clientId: string
  let abonoA: string // la serie que se da de baja
  let abonoB: string // OTRA serie del MISMO negocio: no la puede tocar la baja de A (D-24)
  let abonoOther: string // serie de OTRO tenant: intocable (D-24)

  // Inserta los turnos de una serie con inserts directos (acá NO se está probando el anti-doble-booking,
  // ya cubierto por Phase 6): lo que importa es que queden etiquetados con su abono_id y su business_id.
  async function seedSeriesAppointments(
    tenant: SeededTenant,
    abonoId: string,
    time: string,
    dates: string[] = SERIES_DATES,
  ) {
    const rows = dates.map(date => ({
      business_id: tenant.businessId,
      abono_id: abonoId,
      client_name: 'Cliente Abono',
      service_id: tenant.serviceId,
      professional_id: tenant.professionalId,
      location_id: tenant.locationId,
      date,
      time,
      duration_minutes: 30,
      status: 'confirmed',
    }))
    const ins = await tenant.admin.from('appointments').insert(rows)
    if (ins.error) throw new Error(`seed appointments: ${ins.error.message}`)
  }

  async function statusesOf(tenant: SeededTenant, abonoId: string): Promise<Record<string, string>> {
    const { data } = await tenant.admin
      .from('appointments')
      .select('date, status')
      .eq('business_id', tenant.businessId)
      .eq('abono_id', abonoId)
      .order('date')
    const out: Record<string, string> = {}
    for (const r of data || []) out[r.date as string] = r.status as string
    return out
  }

  async function abonoRow(tenant: SeededTenant, abonoId: string) {
    const { data } = await tenant.admin
      .from('abonos')
      .select('id, status, cancelled_at')
      .eq('id', abonoId)
      .eq('business_id', tenant.businessId)
      .single()
    return data as { id: string; status: string; cancelled_at: string | null }
  }

  beforeAll(async () => {
    t = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })
    other = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })
    supabase = t.admin

    const insClient = await t.admin
      .from('clients')
      .insert({ business_id: t.businessId, name: 'Cliente Abono', phone: '1122334455', email: 'abono@test.com' })
      .select('id')
      .single()
    if (insClient.error || !insClient.data) throw new Error(`seed client: ${insClient.error?.message}`)
    clientId = insClient.data.id

    async function seedAbono(tenant: SeededTenant, startTime: string, client: string | null): Promise<string> {
      const ins = await tenant.admin
        .from('abonos')
        .insert({
          business_id: tenant.businessId,
          client_id: client,
          service_id: tenant.serviceId,
          professional_id: tenant.professionalId,
          location_id: tenant.locationId,
          day_of_week: 1,
          start_time: startTime,
        })
        .select('id')
        .single()
      if (ins.error || !ins.data) throw new Error(`seed abono: ${ins.error?.message}`)
      return ins.data.id as string
    }

    abonoA = await seedAbono(t, TIME_A, clientId)
    abonoB = await seedAbono(t, TIME_B, clientId)
    abonoOther = await seedAbono(other, TIME_A, null)
  })

  afterAll(async () => {
    if (t) await teardownOneTenant(t)
    if (other) await teardownOneTenant(other)
  })

  // Estado limpio antes de CADA test: la baja escribe, así que las series se re-siembran y los abonos
  // vuelven a 'active'. Sin esto, el test de idempotencia contaminaría a los demás.
  beforeEach(async () => {
    await t.admin.from('appointments').delete().eq('business_id', t.businessId)
    await other.admin.from('appointments').delete().eq('business_id', other.businessId)
    await t.admin
      .from('abonos')
      .update({ status: 'active', cancelled_at: null })
      .eq('business_id', t.businessId)
    await other.admin
      .from('abonos')
      .update({ status: 'active', cancelled_at: null })
      .eq('business_id', other.businessId)

    await seedSeriesAppointments(t, abonoA, TIME_A)
    await seedSeriesAppointments(t, abonoB, TIME_B)
    await seedSeriesAppointments(other, abonoOther, TIME_A)
  })

  // (1) Efecto: la baja cancela los turnos futuros de la serie y marca la fila del abono.
  it('1 — cancela los turnos futuros de la serie y marca el abono cancelled + cancelled_at', async () => {
    const res = await cancelAbonoSeries({ supabase, businessId: t.businessId, abonoId: abonoA, todayStr: TODAY })
    expect(res).toEqual({
      ok: true,
      alreadyCancelled: false,
      cancelledCount: FUTURE_DATES.length,
      lastDate: FUT_3,
    })

    const row = await abonoRow(t, abonoA)
    expect(row.status).toBe('cancelled')
    expect(row.cancelled_at).not.toBeNull()
  })

  // (2) Frontera D-02: el turno de HOY se cancela; el anterior a hoy conserva su status.
  it('2 — frontera inclusive: el turno de hoy queda cancelled, los pasados intactos (D-02)', async () => {
    await cancelAbonoSeries({ supabase, businessId: t.businessId, abonoId: abonoA, todayStr: TODAY })

    const st = await statusesOf(t, abonoA)
    expect(st[TODAY]).toBe('cancelled')
    expect(st[FUT_1]).toBe('cancelled')
    expect(st[FUT_2]).toBe('cancelled')
    expect(st[FUT_3]).toBe('cancelled')
    // Los pasados NO se tocan: ya ocurrieron, cancelarlos falsearía el historial.
    expect(st[PAST_1]).toBe('confirmed')
    expect(st[PAST_2]).toBe('confirmed')
  })

  // (3) Scoping por SERIE (D-24): la otra serie del MISMO negocio no cambia en absoluto.
  it('3 — no toca los turnos de OTRA serie del mismo negocio (D-24)', async () => {
    await cancelAbonoSeries({ supabase, businessId: t.businessId, abonoId: abonoA, todayStr: TODAY })

    const stB = await statusesOf(t, abonoB)
    expect(Object.keys(stB).sort()).toEqual([...SERIES_DATES].sort())
    expect(Object.values(stB).every(s => s === 'confirmed')).toBe(true)
    expect((await abonoRow(t, abonoB)).status).toBe('active')
  })

  // (4) Scoping por TENANT (D-24): ni la baja de A ni una invocación cruzada tocan al otro negocio.
  it('4 — no cruza tenants: el abono ajeno no se puede dar de baja con el businessId propio', async () => {
    await cancelAbonoSeries({ supabase, businessId: t.businessId, abonoId: abonoA, todayStr: TODAY })

    // La baja de A dejó al otro tenant intacto.
    let stOther = await statusesOf(other, abonoOther)
    expect(Object.values(stOther).every(s => s === 'confirmed')).toBe(true)
    expect((await abonoRow(other, abonoOther)).status).toBe('active')

    // Invocación cruzada: abonoId del OTRO tenant + businessId propio → not_found, sin efectos. No se
    // distingue de "no existe" a propósito (no se revela la existencia de un abono ajeno, D-22).
    const res = await cancelAbonoSeries({
      supabase,
      businessId: t.businessId,
      abonoId: abonoOther,
      todayStr: TODAY,
    })
    expect(res).toEqual({ ok: false, error: 'not_found' })

    stOther = await statusesOf(other, abonoOther)
    expect(Object.values(stOther).every(s => s === 'confirmed')).toBe(true)
    const otherRow = await abonoRow(other, abonoOther)
    expect(otherRow.status).toBe('active')
    expect(otherRow.cancelled_at).toBeNull()
  })

  // (5) Idempotencia D-05: la 2ª llamada no vuelve a tocar nada ni pisa cancelled_at (→ no re-manda mails).
  it('5 — es idempotente: la 2ª baja devuelve alreadyCancelled sin tocar turnos', async () => {
    const first = await cancelAbonoSeries({ supabase, businessId: t.businessId, abonoId: abonoA, todayStr: TODAY })
    expect(first).toMatchObject({ ok: true, alreadyCancelled: false })
    const cancelledAt = (await abonoRow(t, abonoA)).cancelled_at

    const second = await cancelAbonoSeries({ supabase, businessId: t.businessId, abonoId: abonoA, todayStr: TODAY })
    expect(second).toEqual({ ok: true, alreadyCancelled: true, cancelledCount: 0, lastDate: null })

    // cancelled_at NO se pisa (sería reescribir la fecha real de la baja) y los pasados siguen intactos.
    const row = await abonoRow(t, abonoA)
    expect(row.cancelled_at).toBe(cancelledAt)
    const st = await statusesOf(t, abonoA)
    expect(st[PAST_1]).toBe('confirmed')
    expect(st[PAST_2]).toBe('confirmed')
  })

  // (6) Los turnos futuros ya cancelados a mano NO se cuentan (el número informado = efecto real).
  it('6 — un turno futuro ya cancelado antes de la baja no se cuenta en cancelledCount', async () => {
    await t.admin
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('business_id', t.businessId)
      .eq('abono_id', abonoA)
      .eq('date', FUT_2)

    const res = await cancelAbonoSeries({ supabase, businessId: t.businessId, abonoId: abonoA, todayStr: TODAY })
    expect(res).toEqual({
      ok: true,
      alreadyCancelled: false,
      cancelledCount: FUTURE_DATES.length - 1,
      lastDate: FUT_3,
    })
  })

  // (7) D-21: un finito que ya juntó sus N sesiones ('completed') se da de baja por el MISMO camino.
  it('7 — completed → cancelled: el abono terminado se da de baja igual (D-21)', async () => {
    await t.admin.from('abonos').update({ status: 'completed' }).eq('id', abonoA).eq('business_id', t.businessId)

    const res = await cancelAbonoSeries({ supabase, businessId: t.businessId, abonoId: abonoA, todayStr: TODAY })
    expect(res).toMatchObject({ ok: true, alreadyCancelled: false, cancelledCount: FUTURE_DATES.length })

    const row = await abonoRow(t, abonoA)
    expect(row.status).toBe('cancelled')
    expect(row.cancelled_at).not.toBeNull()
  })

  // (8) D-03: el preview informa exactamente lo que después hace la baja (no puede mentirle al usuario).
  it('8 — el preview coincide con lo que después informa la baja', async () => {
    const preview = await previewAbonoCancellation({
      supabase,
      businessId: t.businessId,
      abonoId: abonoA,
      todayStr: TODAY,
    })
    expect(preview).toEqual({ count: FUTURE_DATES.length, lastDate: FUT_3 })

    const res = await cancelAbonoSeries({ supabase, businessId: t.businessId, abonoId: abonoA, todayStr: TODAY })
    expect(res).toMatchObject({ cancelledCount: preview.count, lastDate: preview.lastDate })

    // Post-baja ya no queda nada futuro que cancelar.
    const after = await previewAbonoCancellation({
      supabase,
      businessId: t.businessId,
      abonoId: abonoA,
      todayStr: TODAY,
    })
    expect(after).toEqual({ count: 0, lastDate: null })
  })
})
