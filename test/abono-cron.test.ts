import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { type SupabaseClient } from '@supabase/supabase-js'
import { hasSupabaseCreds } from './env'
import { seedOneTenant, teardownOneTenant, seedTimeBlock, type SeededTenant } from './helpers/booking-fixtures'
import { createAppointmentCore } from '@/lib/booking-core'
import { extendAbonoWindows, GET } from '@/app/api/cron/cancel-expired/route'
import { todayInAR } from '@/lib/booking-window'
import type { NextRequest } from 'next/server'

// ── Tests de la extensión de la ventana rolling de abonos en el cron DIARIO (app/api/cron/cancel-expired) ──
// Cubre ABONO-06: el cron existente (NO se agrega uno nuevo — Vercel Hobby) extiende cada abono `active`
// hacia adelante por su ventana, reusando el motor atómico del Plan 02. Casos: frontera rolling, idempotencia,
// conflicto-no-pisa, gate del secreto (401) y aislamiento por tenant.
//
// El cron computa "hoy" internamente con todayInAR() (no recibe fromDate/toDate como el alta), así que los
// tests usan fechas RELATIVAS a hoy: se elige un day_of_week 2 días adelante del de hoy (→ primera ocurrencia
// SIEMPRE futura) y se enumeran las ocurrencias esperadas con la MISMA aritmética del motor (avance de a 7
// días desde la 1ª fecha que matchea el dow). extendAbonoWindows(admin) se llama directo (service-role, como
// el cron en prod); el gate del secreto se prueba invocando el GET real con un Bearer incorrecto.
//
// describe.skipIf(!hasSupabaseCreds): sin las creds de Supabase, se skipean (igual que el resto de la suite).

const WINDOW_WEEKS = 8 // default de businesses.abono_window_weeks (migr. 054) — seedOneTenant no lo setea.
const TIME = '10:00'

// 'yyyy-MM-dd' por componentes LOCALES (idéntico al helper del cron/alta: todayInAR = medianoche local AR).
function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Suma días a un 'yyyy-MM-dd' en UTC puro (comparar strings 'yyyy-MM-dd' equivale a comparar fechas).
function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// dow de un 'yyyy-MM-dd' con la convención EXTRACT(dow) (0=domingo..6=sábado) — misma que usa el motor.
function dowOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay()
}

// Enumera las ocurrencias 'yyyy-MM-dd' en [fromStr, toStr] cuyo dow == dow: réplica exacta del avance del
// motor (1ª fecha que matchea desde fromStr, luego de a 7 días).
function occurrences(fromStr: string, toStr: string, dow: number): string[] {
  const firstDelta = (dow - dowOf(fromStr) + 7) % 7
  const out: string[] = []
  for (let date = addDaysISO(fromStr, firstDelta); date <= toStr; date = addDaysISO(date, 7)) out.push(date)
  return out
}

// Siembra una fila `abonos` con service-role (bypassa RLS, correcto para fixtures) y devuelve su id.
// `totalOccurrences` (D-07′): null/ausente = INDEFINIDO (rolling sin fin); N = FINITO de N sesiones.
// `status` permite sembrar un abono ya 'completed' (para probar que el cron NO lo vuelve a tocar).
async function seedAbono(
  t: SeededTenant,
  args: {
    clientId: string
    dayOfWeek: number
    time: string
    generatedUntil: string | null
    totalOccurrences?: number | null
    status?: 'active' | 'cancelled' | 'completed'
  }
): Promise<string> {
  const ins = await t.admin
    .from('abonos')
    .insert({
      business_id: t.businessId,
      client_id: args.clientId,
      service_id: t.serviceId,
      professional_id: t.professionalId,
      location_id: t.locationId,
      day_of_week: args.dayOfWeek,
      start_time: args.time,
      duration_minutes: t.serviceDurationMinutes,
      total_occurrences: args.totalOccurrences ?? null,
      status: args.status ?? 'active',
      generated_until: args.generatedUntil,
    })
    .select('id')
    .single()
  if (ins.error || !ins.data) throw new Error(`seed abono: ${ins.error?.message}`)
  return ins.data.id
}

async function seedClient(t: SeededTenant, name: string): Promise<string> {
  const ins = await t.admin
    .from('clients')
    .insert({ business_id: t.businessId, name, phone: null, email: null })
    .select('id')
    .single()
  if (ins.error || !ins.data) throw new Error(`seed client: ${ins.error?.message}`)
  return ins.data.id
}

describe.skipIf(!hasSupabaseCreds)('cron: extensión de la ventana rolling de abonos (ABONO-06)', () => {
  let t: SeededTenant
  let other: SeededTenant
  let clientId: string
  let otherClientId: string

  // Fechas relativas a HOY (el cron computa hoy internamente). abonoDow = hoy + 2 días → 1ª ocurrencia futura.
  let todayStr: string
  let toDate: string
  let abonoDow: number

  beforeAll(async () => {
    t = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })
    other = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })

    const today = todayInAR()
    todayStr = toISODate(today)
    toDate = toISODate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + WINDOW_WEEKS * 7))
    abonoDow = (dowOf(todayStr) + 2) % 7 // 1ª ocurrencia = hoy + 2 días (estrictamente futura)

    // Grilla semanal para abonoDow en ambos negocios: 08:00–20:00, cupo 1 → 10:00 cae dentro (slot individual).
    await seedTimeBlock(t, { capacity: 1, dayOfWeek: abonoDow, startTime: '08:00', endTime: '20:00' })
    await seedTimeBlock(other, { capacity: 1, dayOfWeek: abonoDow, startTime: '08:00', endTime: '20:00' })

    clientId = await seedClient(t, 'Cliente Abono')
    otherClientId = await seedClient(other, 'Cliente Otro')
  })

  afterAll(async () => {
    if (t) await teardownOneTenant(t)
    if (other) await teardownOneTenant(other)
  })

  // Limpieza entre tests: appointments + abonos de AMBOS tenants (los time_blocks/clients persisten).
  afterEach(async () => {
    for (const tenant of [t, other]) {
      if (!tenant) continue
      await tenant.admin.from('appointments').delete().eq('business_id', tenant.businessId)
      await tenant.admin.from('abonos').delete().eq('business_id', tenant.businessId)
    }
  })

  // ── (1) Extensión: una corrida genera la cola nueva hasta hoy+ventana y avanza generated_until ──────
  it('1 — extiende la ventana: genera la cola hasta hoy+ventana y avanza generated_until', async () => {
    // generated_until en el pasado cercano → la cola es [hoy, hoy+ventana].
    const abonoId = await seedAbono(t, { clientId, dayOfWeek: abonoDow, time: TIME, generatedUntil: addDaysISO(todayStr, -3) })
    const expected = occurrences(todayStr, toDate, abonoDow)
    expect(expected.length).toBeGreaterThan(0)

    const res = await extendAbonoWindows(t.admin)
    expect(res.abonosExtended).toBeGreaterThanOrEqual(1)

    // generated_until avanzó al borde de la ventana.
    const { data: abono } = await t.admin.from('abonos').select('generated_until, skipped_occurrences').eq('id', abonoId).single()
    expect(abono?.generated_until).toBe(toDate)
    expect(abono?.skipped_occurrences).toEqual([])

    // Se materializó un turno por ocurrencia esperada, todos a las 10:00 y etiquetados con el abono.
    const { data: appts } = await t.admin
      .from('appointments')
      .select('date, time, abono_id')
      .eq('business_id', t.businessId)
      .eq('abono_id', abonoId)
      .order('date')
    expect(appts?.map((a) => a.date)).toEqual(expected)
    expect(appts?.every((a) => (a.time as string).slice(0, 5) === TIME)).toBe(true)
    expect(appts?.every((a) => a.abono_id === abonoId)).toBe(true)
  })

  // ── (2) Idempotencia: correr el cron dos veces no crea duplicados ────────────────────────────────
  it('2 — idempotente: una 2ª corrida no genera turnos nuevos (la ventana ya está cubierta)', async () => {
    const abonoId = await seedAbono(t, { clientId, dayOfWeek: abonoDow, time: TIME, generatedUntil: addDaysISO(todayStr, -3) })

    await extendAbonoWindows(t.admin)
    const { data: after1 } = await t.admin.from('appointments').select('id').eq('business_id', t.businessId).eq('abono_id', abonoId)
    const count1 = after1?.length ?? 0
    expect(count1).toBeGreaterThan(0)

    await extendAbonoWindows(t.admin)
    const { data: after2 } = await t.admin.from('appointments').select('id').eq('business_id', t.businessId).eq('abono_id', abonoId)
    expect(after2?.length).toBe(count1) // sin duplicados

    const { data: abono } = await t.admin.from('abonos').select('generated_until').eq('id', abonoId).single()
    expect(abono?.generated_until).toBe(toDate) // sigue cubierta hasta el mismo borde
  })

  // ── (3) Conflicto: la ocurrencia que choca se saltea + acumula, sin pisar el turno ajeno ─────────
  it('3 — conflicto: la ocurrencia ocupada se saltea (skipped_occurrences), sin pisar, y el resto se genera', async () => {
    const expected = occurrences(todayStr, toDate, abonoDow)
    const clash = expected[0] // 1ª ocurrencia: la ocupamos con un turno ajeno pre-existente.

    // Turno ajeno pre-existente en el slot (cupo 1 → el slot queda lleno). Va por el core (no abono_id).
    const seed = await createAppointmentCore({
      supabase: t.admin,
      business: { id: t.businessId, buffer_minutes: t.bufferMinutes },
      serviceId: t.serviceId,
      professionalId: t.professionalId,
      locationId: t.locationId,
      date: clash,
      time: TIME,
      clientId: null,
      clientName: 'Turno Ajeno',
      clientPhone: null,
      clientEmail: null,
      notes: null,
      requireDeposit: false,
    })
    expect(seed.ok).toBe(true)
    if (!seed.ok) return
    const clashApptId = seed.appointmentId

    const abonoId = await seedAbono(t, { clientId, dayOfWeek: abonoDow, time: TIME, generatedUntil: addDaysISO(todayStr, -3) })
    await extendAbonoWindows(t.admin)

    // La fecha en conflicto quedó registrada en skipped_occurrences (D-06).
    const { data: abono } = await t.admin.from('abonos').select('skipped_occurrences').eq('id', abonoId).single()
    const skipped = (abono?.skipped_occurrences ?? []) as { date: string; reason: string }[]
    expect(skipped.some((s) => s.date === clash)).toBe(true)

    // El turno ajeno NO fue pisado: sigue existiendo, sin abono_id.
    const { data: clashAppt } = await t.admin.from('appointments').select('id, abono_id').eq('id', clashApptId).single()
    expect(clashAppt?.id).toBe(clashApptId)
    expect(clashAppt?.abono_id).toBeNull()

    // El resto de las ocurrencias (todas menos la del conflicto) se generó con abono_id.
    const { data: appts } = await t.admin
      .from('appointments')
      .select('date')
      .eq('business_id', t.businessId)
      .eq('abono_id', abonoId)
      .order('date')
    expect(appts?.map((a) => a.date)).toEqual(expected.filter((d) => d !== clash))
  })

  // ── (4) Secreto: un GET sin Bearer correcto → 401 y no se genera nada ────────────────────────────
  it('4 — gate del secreto: GET sin Bearer válido → 401 y no genera turnos', async () => {
    process.env.CRON_SECRET = 'test-cron-secret-xyz'
    const abonoId = await seedAbono(t, { clientId, dayOfWeek: abonoDow, time: TIME, generatedUntil: addDaysISO(todayStr, -3) })

    const req = new Request('http://localhost/api/cron/cancel-expired', {
      headers: { authorization: 'Bearer incorrecto' },
    }) as unknown as NextRequest
    const res = await GET(req)
    expect(res.status).toBe(401)

    // No se generó ningún turno del abono (el gate cortó antes de crear el admin client).
    const { count } = await t.admin
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', t.businessId)
      .eq('abono_id', abonoId)
    expect(count).toBe(0)
  })

  // ── (5) Aislamiento: dos abonos de negocios distintos → cada uno genera solo en su negocio ───────
  it('5 — aislamiento por tenant: cada abono genera solo en su propio business, sin cruce', async () => {
    const abonoT = await seedAbono(t, { clientId, dayOfWeek: abonoDow, time: TIME, generatedUntil: addDaysISO(todayStr, -3) })
    const abonoOther = await seedAbono(other, { clientId: otherClientId, dayOfWeek: abonoDow, time: TIME, generatedUntil: addDaysISO(todayStr, -3) })
    const expected = occurrences(todayStr, toDate, abonoDow)

    await extendAbonoWindows(t.admin)

    // El abono de t generó solo en el negocio de t; el de other solo en other. Ningún turno cruzado.
    const { data: apptsT } = await t.admin.from('appointments').select('date, business_id').eq('abono_id', abonoT)
    const { data: apptsOther } = await other.admin.from('appointments').select('date, business_id').eq('abono_id', abonoOther)
    expect(apptsT?.every((a) => a.business_id === t.businessId)).toBe(true)
    expect(apptsOther?.every((a) => a.business_id === other.businessId)).toBe(true)
    expect([...(apptsT ?? [])].map((a) => a.date).sort()).toEqual(expected)
    expect([...(apptsOther ?? [])].map((a) => a.date).sort()).toEqual(expected)

    // Cross-check: en el negocio de t NO hay turnos etiquetados con el abono de other.
    const { count: crossCount } = await t.admin
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', t.businessId)
      .eq('abono_id', abonoOther)
    expect(crossCount).toBe(0)
  })

  // ── (6) FINITO (D-07′): el cron genera SOLO N turnos reales y marca el abono 'completed' ─────────
  it('6 — finito de N sesiones: genera exactamente N turnos y pasa a status completed', async () => {
    const N = 2
    const abonoId = await seedAbono(t, {
      clientId,
      dayOfWeek: abonoDow,
      time: TIME,
      generatedUntil: addDaysISO(todayStr, -3),
      totalOccurrences: N,
    })
    const expected = occurrences(todayStr, toDate, abonoDow)
    expect(expected.length).toBeGreaterThan(N) // la ventana da de sobra: el tope lo pone N, no el rango

    await extendAbonoWindows(t.admin)

    // Exactamente N turnos, y son las N PRIMERAS ocurrencias del rango (el motor corta al llegar al tope).
    const { data: appts } = await t.admin
      .from('appointments')
      .select('date')
      .eq('business_id', t.businessId)
      .eq('abono_id', abonoId)
      .order('date')
    expect(appts?.map((a) => a.date)).toEqual(expected.slice(0, N))

    // Al juntar sus N sesiones, el abono queda 'completed' (el cron deja de extenderlo).
    const { data: abono } = await t.admin.from('abonos').select('status, total_occurrences').eq('id', abonoId).single()
    expect(abono?.status).toBe('completed')
    expect(abono?.total_occurrences).toBe(N)
  })

  // ── (7) El cron NO vuelve a tocar un abono 'completed' ───────────────────────────────────────────
  it('7 — no toca los abonos completed: no genera turnos nuevos ni los cuenta como extendidos', async () => {
    const abonoId = await seedAbono(t, {
      clientId,
      dayOfWeek: abonoDow,
      time: TIME,
      generatedUntil: addDaysISO(todayStr, -3),
      totalOccurrences: 2,
      status: 'completed',
    })

    const res = await extendAbonoWindows(t.admin)
    expect(res.abonosExtended).toBe(0)

    const { count } = await t.admin
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', t.businessId)
      .eq('abono_id', abonoId)
    expect(count).toBe(0)

    // Sigue completed y su generated_until NO avanzó (el cron ni lo miró).
    const { data: abono } = await t.admin.from('abonos').select('status, generated_until').eq('id', abonoId).single()
    expect(abono?.status).toBe('completed')
    expect(abono?.generated_until).toBe(addDaysISO(todayStr, -3))
  })

  // ── (8) Finito que YA juntó sus N (quedó 'active' por lo que sea) → se marca completed sin generar ─
  it('8 — finito con N ya generados: lo marca completed y no genera ni un turno más', async () => {
    const N = 2
    const abonoId = await seedAbono(t, {
      clientId,
      dayOfWeek: abonoDow,
      time: TIME,
      generatedUntil: addDaysISO(todayStr, -3),
      totalOccurrences: N,
    })

    // 1ª corrida: junta sus N y queda completed.
    await extendAbonoWindows(t.admin)
    const { data: appts1 } = await t.admin.from('appointments').select('id').eq('abono_id', abonoId)
    expect(appts1?.length).toBe(N)

    // Se lo vuelve a poner 'active' a mano (simula el abono que ya llegó a N pero sigue marcado activo):
    // el cron debe reconocer que gen >= N, marcarlo completed y NO generar nada nuevo.
    await t.admin.from('abonos').update({ status: 'active' }).eq('id', abonoId)

    await extendAbonoWindows(t.admin)
    const { data: appts2 } = await t.admin.from('appointments').select('id').eq('abono_id', abonoId)
    expect(appts2?.length).toBe(N) // sin turnos nuevos

    const { data: abono } = await t.admin.from('abonos').select('status').eq('id', abonoId).single()
    expect(abono?.status).toBe('completed')
  })

  // ── (9) Un CHOQUE no consume sesión: el finito sigue a la semana siguiente hasta juntar N reales ──
  it('9 — finito con conflicto: el choque no consume sesión, junta N turnos REALES y queda completed', async () => {
    const N = 2
    const expected = occurrences(todayStr, toDate, abonoDow)
    expect(expected.length).toBeGreaterThan(N + 1)
    const clash = expected[0] // ocupamos la 1ª ocurrencia con un turno ajeno (cupo 1 → slot lleno)

    const seed = await createAppointmentCore({
      supabase: t.admin,
      business: { id: t.businessId, buffer_minutes: t.bufferMinutes },
      serviceId: t.serviceId,
      professionalId: t.professionalId,
      locationId: t.locationId,
      date: clash,
      time: TIME,
      clientId: null,
      clientName: 'Turno Ajeno',
      clientPhone: null,
      clientEmail: null,
      notes: null,
      requireDeposit: false,
    })
    expect(seed.ok).toBe(true)

    const abonoId = await seedAbono(t, {
      clientId,
      dayOfWeek: abonoDow,
      time: TIME,
      generatedUntil: addDaysISO(todayStr, -3),
      totalOccurrences: N,
    })

    await extendAbonoWindows(t.admin)

    // El choque NO consumió sesión: se generaron las ocurrencias 2ª y 3ª (N turnos reales).
    const { data: appts } = await t.admin
      .from('appointments')
      .select('date')
      .eq('business_id', t.businessId)
      .eq('abono_id', abonoId)
      .order('date')
    expect(appts?.map((a) => a.date)).toEqual(expected.slice(1, 1 + N))

    const { data: abono } = await t.admin.from('abonos').select('status, skipped_occurrences').eq('id', abonoId).single()
    expect(abono?.status).toBe('completed')
    const skipped = (abono?.skipped_occurrences ?? []) as { date: string; reason: string }[]
    expect(skipped.some((s) => s.date === clash)).toBe(true)
  })

  // ── (10) INDEFINIDO: sin total_occurrences sigue rolling (toda la ventana) y NUNCA se completa ────
  it('10 — indefinido: genera toda la ventana y sigue active (nunca pasa a completed)', async () => {
    const abonoId = await seedAbono(t, {
      clientId,
      dayOfWeek: abonoDow,
      time: TIME,
      generatedUntil: addDaysISO(todayStr, -3),
      totalOccurrences: null,
    })
    const expected = occurrences(todayStr, toDate, abonoDow)

    await extendAbonoWindows(t.admin)

    const { data: appts } = await t.admin
      .from('appointments')
      .select('date')
      .eq('business_id', t.businessId)
      .eq('abono_id', abonoId)
      .order('date')
    expect(appts?.map((a) => a.date)).toEqual(expected)

    const { data: abono } = await t.admin.from('abonos').select('status, total_occurrences').eq('id', abonoId).single()
    expect(abono?.status).toBe('active')
    expect(abono?.total_occurrences).toBeNull()
  })
})
