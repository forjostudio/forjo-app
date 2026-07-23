import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { hasSupabaseCreds } from './env'
import { seedOneTenant, teardownOneTenant, type SeededTenant } from './helpers/booking-fixtures'

// ── Tests a nivel RUTA de las DOS vías de baja del abono (WR-08) ────────────────────────────────
//
// QUÉ PRUEBA ESTE ARCHIVO: el CONTRATO DE LOS HANDLERS, que es lo único que no cubre ninguna de las
// suites existentes. En concreto:
//   - `app/api/abonos/cancel/[token]/route.ts` (vía pública, cliente) bajo CARRERA REAL: dos POST
//     simultáneos sobre el MISMO token producen exactamente UN mail al cliente y UN aviso al dueño
//     (D-14 / T-07-15). Éste es el invariante estrella de la fase y hasta ahora estaba verificado
//     sólo por lectura del código.
//   - Que la rama `already_cancelled` NO dispara ningún mail por ninguna de las dos vías (D-05/D-14).
//   - Que "no existe", "formato de token inválido" y "es de otro negocio" devuelven el MISMO 404
//     genérico, sin revelar si la serie existe (D-22).
//   - Los cuatro caminos de rechazo de la vía del panel (401 / 400 x2 / 404) y que una baja del panel
//     no puede alcanzar NI UNA fila del otro tenant (D-23/D-24).
//
// QUÉ **NO** PRUEBA (y dónde vive):
//   - Las reglas puras de la baja (qué es futuro, conteo, última fecha) → `lib/abono-cancel.test.ts`.
//   - El efecto del motor sobre la base (frontera D-02, scoping por serie/tenant, barrido de
//     reparación de CR-01) → `test/abono-cancel.test.ts`.
//   - El HTML/subject de los mails → `test/abono-cancel-email.test.ts`. Acá los dos templates son
//     SPIES: sirven de CONTADOR del anti-avalancha, no se asierta su contenido.
//
// CÓMO CORRE. Contra el Supabase LOCAL, con fixtures y teardown, igual que el resto de la suite; sin
// las tres credenciales los dos bloques SKIPEAN limpio (`describe.skipIf(!hasSupabaseCreds)`). La
// carrera se ejercita contra Postgres de verdad: un doble del cliente no podría probar nada sobre el
// gate atómico, que es lo que serializa las dos requests.
//
// EL MOCK DE `after()`. Después del Plan 07-09 las dos vías despachan los mails dentro de `after()` de
// next/server, que necesita un request scope real y no existe cuando se invoca el handler directo
// desde Vitest. Por eso se mockea `next/server` PARCIALMENTE (`importOriginal`, todos los exports
// reales) y se reemplaza SÓLO `after` por un ejecutor que corre el callback y guarda su promesa, para
// poder esperarla antes de asertar sobre los mails.

const h = vi.hoisted(() => ({
  // Promesas de los callbacks que el handler pasó a `after()`. El test las drena con flushAfter().
  afterTasks: [] as Promise<unknown>[],
  sendClientMail: vi.fn(async () => {}),
  sendAdminMail: vi.fn(async () => {}),
  // Cliente que devuelve `@/lib/supabase/server` en la vía panel: el autenticado como el dueño o el
  // anon SIN sesión, según el caso.
  session: { current: null as SupabaseClient | null },
}))

// Mock PARCIAL de next/server: se conservan todos los exports reales (NextRequest, NextResponse, …) y
// se sustituye únicamente `after`.
vi.mock('next/server', async importOriginal => {
  const actual = await importOriginal<typeof import('next/server')>()
  return {
    ...actual,
    after: (task: unknown) => {
      const p = typeof task === 'function' ? Promise.resolve().then(task as () => unknown) : task
      h.afterTasks.push(Promise.resolve(p))
    },
  }
})

// Se mockea la FACTORY, no el comportamiento: `createAdminClient` devuelve un cliente Supabase REAL
// con la service-role key del entorno (misma construcción que test/helpers/booking-fixtures.ts). Las
// queries de la vía pública golpean la DB local de verdad — lo único que puede probar una carrera.
vi.mock('@/lib/supabase/admin', async () => {
  const { createClient: create } = await import('@supabase/supabase-js')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return { createAdminClient: () => create(url, serviceKey, { auth: { persistSession: false } }) }
})

// Vía panel: el handler pide el cliente con la sesión del dueño. Se le entrega el que arma cada caso.
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => h.session.current,
}))

// Los dos templates de baja son spies: son el CONTADOR del anti-avalancha (D-14).
vi.mock('@/lib/email', () => ({
  sendAbonoCancelledEmail: h.sendClientMail,
  sendAbonoCancelledAdminNotification: h.sendAdminMail,
  // Helper puro de branding (no toca red); acá no se asiertan colores/fuentes, stub inocuo.
  emailBrandInputs: () => ({ palette: null, theme: null, font: null, primaryOverride: null }),
}))

// Secretos Resend por tenant: se leen dentro del after() de las dos vías. No se testean acá.
vi.mock('@/lib/business-secrets', () => ({
  getBusinessSecrets: async () => ({
    mp_access_token: null,
    mp_refresh_token: null,
    mp_token_expires_at: null,
    resend_api_key: 'test_resend_key',
    resend_from: 'Test <test@forjo.test>',
    recaptcha_secret_key: null,
    google_refresh_token: null,
  }),
}))

import { POST as cancelByToken } from '@/app/api/abonos/cancel/[token]/route'
import { POST as cancelByPanel } from '@/app/api/abonos/cancel/route'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Fechas FIJAS en el futuro lejano (2031) — las rutas NO aceptan `todayStr`, así que el corte lo pone
// el reloj real: todo 2031 es futuro y el turno de 2025 es pasado, sin importar el día en que corra.
// 2031-03-03 es LUNES; las fechas van de a 7 días.
const PAST = '2025-01-06'
const FUT_1 = '2031-03-03'
const FUT_2 = '2031-03-10'
const FUT_3 = '2031-03-17'
const FUT_4 = '2031-03-24'
const FUTURE_DATES = [FUT_1, FUT_2, FUT_3, FUT_4]
const SERIES_DATES = [PAST, ...FUTURE_DATES]
const FUTURE_FLOOR = '2031-01-01' // piso para contar "lo futuro" sin depender del reloj

// Drena las tareas que el handler encoló en `after()`. Sin esto los mails todavía no salieron cuando
// el test asierta sobre los spies.
async function flushAfter() {
  const tasks = h.afterTasks.splice(0)
  await Promise.all(tasks)
}

// Segundo argumento del handler por token, tal como se lo pasa Next 16 (params es una Promise).
function tokenCtx(token: string) {
  return { params: Promise.resolve({ token }) }
}

function tokenReq(): NextRequest {
  return new Request('http://localhost/api/abonos/cancel/token', { method: 'POST' }) as unknown as NextRequest
}

function panelReq(body: unknown, opts?: { raw?: string }): Request {
  return new Request('http://localhost/api/abonos/cancel', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: opts?.raw ?? JSON.stringify(body),
  })
}

// ── Helpers de siembra / conteo compartidos por los dos bloques ────────────────────────────────

async function seedClient(tenant: SeededTenant, email: string): Promise<string> {
  const ins = await tenant.admin
    .from('clients')
    .insert({ business_id: tenant.businessId, name: 'Cliente Abono', phone: '1122334455', email })
    .select('id')
    .single()
  if (ins.error || !ins.data) throw new Error(`seed client: ${ins.error?.message}`)
  return ins.data.id as string
}

async function seedAbono(
  tenant: SeededTenant,
  clientId: string,
  startTime: string,
): Promise<{ id: string; token: string }> {
  const ins = await tenant.admin
    .from('abonos')
    .insert({
      business_id: tenant.businessId,
      client_id: clientId,
      service_id: tenant.serviceId,
      professional_id: tenant.professionalId,
      location_id: tenant.locationId,
      day_of_week: 1,
      start_time: startTime,
    })
    .select('id, cancel_token')
    .single()
  if (ins.error || !ins.data) throw new Error(`seed abono: ${ins.error?.message}`)
  return { id: ins.data.id as string, token: ins.data.cancel_token as string }
}

// Inserts directos: acá no se prueba el anti-doble-booking (ya cubierto por Phase 6), sino que los
// turnos queden etiquetados con su abono_id y su business_id.
async function seedSeriesAppointments(tenant: SeededTenant, abonoId: string, time: string) {
  const rows = SERIES_DATES.map(date => ({
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

// Turnos de la serie que siguen VIVOS de 2031 en adelante. Si tras una baja esto no da 0, la serie
// quedó dada de baja con turnos futuros ocupándole la agenda al negocio.
async function liveFutureCount(tenant: SeededTenant, abonoId: string): Promise<number> {
  const { data, error } = await tenant.admin
    .from('appointments')
    .select('id')
    .eq('business_id', tenant.businessId)
    .eq('abono_id', abonoId)
    .gte('date', FUTURE_FLOOR)
    .neq('status', 'cancelled')
  if (error) throw new Error(`liveFutureCount: ${error.message}`)
  return (data || []).length
}

async function cancelledFutureCount(tenant: SeededTenant, abonoId: string): Promise<number> {
  const { data, error } = await tenant.admin
    .from('appointments')
    .select('id')
    .eq('business_id', tenant.businessId)
    .eq('abono_id', abonoId)
    .gte('date', FUTURE_FLOOR)
    .eq('status', 'cancelled')
  if (error) throw new Error(`cancelledFutureCount: ${error.message}`)
  return (data || []).length
}

async function statusOf(tenant: SeededTenant, abonoId: string): Promise<string> {
  const { data } = await tenant.admin
    .from('abonos')
    .select('status')
    .eq('id', abonoId)
    .eq('business_id', tenant.businessId)
    .single()
  return (data?.status ?? '') as string
}

// Estado limpio antes de CADA test: la baja escribe, así que se re-siembran los turnos y el abono
// vuelve a 'active'.
async function resetTenant(tenant: SeededTenant, abonoId: string, time: string) {
  await tenant.admin.from('appointments').delete().eq('business_id', tenant.businessId)
  await tenant.admin
    .from('abonos')
    .update({ status: 'active', cancelled_at: null })
    .eq('business_id', tenant.businessId)
  await seedSeriesAppointments(tenant, abonoId, time)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// BLOQUE 1 — VÍA PÚBLICA POR TOKEN (ABONO-04)
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe.skipIf(!hasSupabaseCreds)('POST /api/abonos/cancel/[token] — vía pública (ABONO-04)', () => {
  let t: SeededTenant
  let abonoId: string
  let token: string

  beforeAll(async () => {
    t = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })
    // notification_email cargado → el aviso al dueño (D-13) se dispara y se puede contar.
    const upd = await t.admin
      .from('businesses')
      .update({ notification_email: 'duenio@forjo.test' })
      .eq('id', t.businessId)
    if (upd.error) throw new Error(`seed notification_email: ${upd.error.message}`)

    const clientId = await seedClient(t, 'abono-token@test.com')
    const abono = await seedAbono(t, clientId, '10:00')
    abonoId = abono.id
    token = abono.token
    if (!token) throw new Error('GUARD: la fila del abono no trajo cancel_token')
  })

  afterAll(async () => {
    if (t) await teardownOneTenant(t)
  })

  beforeEach(async () => {
    h.sendClientMail.mockClear()
    h.sendAdminMail.mockClear()
    h.afterTasks.length = 0
    await resetTenant(t, abonoId, '10:00')
  })

  // (1) EL INVARIANTE ESTRELLA (D-14 / T-07-15). Dos POST simultáneos sobre el MISMO token: el gate
  // atómico del motor deja pasar a UNA sola, así que sale UN mail al cliente y UN aviso al dueño.
  it('1 — carrera: dos POST sobre el mismo token → UN mail al cliente y UN aviso al dueño (D-14)', async () => {
    const [resA, resB] = await Promise.all([
      cancelByToken(tokenReq(), tokenCtx(token)),
      cancelByToken(tokenReq(), tokenCtx(token)),
    ])
    const [bodyA, bodyB] = await Promise.all([resA.json(), resB.json()])
    await flushAfter()

    // Exactamente una ganó; la otra cae en already_cancelled y NO notifica.
    const oks = [bodyA, bodyB].filter(b => b.ok === true)
    const dupes = [bodyA, bodyB].filter(b => b.ok === false && b.reason === 'already_cancelled')
    expect(oks).toHaveLength(1)
    expect(dupes).toHaveLength(1)

    expect(h.sendClientMail).toHaveBeenCalledTimes(1)
    expect(h.sendAdminMail).toHaveBeenCalledTimes(1)

    // Y la baja quedó completa: ningún turno futuro de la serie sigue vivo.
    expect(await liveFutureCount(t, abonoId)).toBe(0)
    expect(await statusOf(t, abonoId)).toBe('cancelled')
  })

  // (2) El número que informa la respuesta ganadora es el efecto REAL en la base.
  it('2 — el cancelledCount de la respuesta ok coincide con los turnos que pasaron a cancelled', async () => {
    const [resA, resB] = await Promise.all([
      cancelByToken(tokenReq(), tokenCtx(token)),
      cancelByToken(tokenReq(), tokenCtx(token)),
    ])
    const bodies = await Promise.all([resA.json(), resB.json()])
    await flushAfter()

    const winner = bodies.find(b => b.ok === true)!
    expect(winner.cancelledCount).toBe(FUTURE_DATES.length)
    expect(winner.cancelledCount).toBe(await cancelledFutureCount(t, abonoId))
    expect(winner.lastDate).toBe(FUT_4)
  })

  // (3) Idempotencia sin mails (D-05): un POST posterior no re-dispara nada.
  it('3 — el reintento sobre el mismo token devuelve already_cancelled y NO manda mails nuevos', async () => {
    const first = await cancelByToken(tokenReq(), tokenCtx(token))
    expect((await first.json()).ok).toBe(true)
    await flushAfter()
    expect(h.sendClientMail).toHaveBeenCalledTimes(1)
    expect(h.sendAdminMail).toHaveBeenCalledTimes(1)

    const second = await cancelByToken(tokenReq(), tokenCtx(token))
    await flushAfter()
    expect(second.status).toBe(200)
    expect(await second.json()).toEqual({ ok: false, reason: 'already_cancelled' })
    expect(h.sendClientMail).toHaveBeenCalledTimes(1)
    expect(h.sendAdminMail).toHaveBeenCalledTimes(1)
  })

  // (4) Serie ya dada de baja ANTES de la request: gate de estado del handler, sin tocar el motor.
  it('4 — una serie ya cancelada devuelve already_cancelled sin disparar ningún mail', async () => {
    await t.admin
      .from('abonos')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', abonoId)
      .eq('business_id', t.businessId)

    const res = await cancelByToken(tokenReq(), tokenCtx(token))
    await flushAfter()

    expect(await res.json()).toEqual({ ok: false, reason: 'already_cancelled' })
    expect(h.sendClientMail).not.toHaveBeenCalled()
    expect(h.sendAdminMail).not.toHaveBeenCalled()
  })

  // (5) Token inexistente → 404 genérico, sin mails.
  it('5 — un token uuid que no corresponde a ninguna serie devuelve 404 not_found', async () => {
    const res = await cancelByToken(tokenReq(), tokenCtx('00000000-0000-0000-0000-000000000000'))
    await flushAfter()

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ ok: false, reason: 'not_found' })
    expect(h.sendClientMail).not.toHaveBeenCalled()
    expect(h.sendAdminMail).not.toHaveBeenCalled()
    // Y no tocó nada: la serie sigue viva.
    expect(await liveFutureCount(t, abonoId)).toBe(FUTURE_DATES.length)
  })

  // (6) D-22 / T-07-13: el formato inválido NO se distingue del inexistente, y NO es un 500.
  it('6 — un token con formato inválido devuelve EXACTAMENTE el mismo 404 que el inexistente (D-22)', async () => {
    const inexistente = await cancelByToken(tokenReq(), tokenCtx('00000000-0000-0000-0000-000000000000'))
    const malFormado = await cancelByToken(tokenReq(), tokenCtx('esto-no-es-un-uuid'))
    await flushAfter()

    expect(malFormado.status).toBe(inexistente.status)
    expect(await malFormado.json()).toEqual(await inexistente.json())
    expect(malFormado.status).toBe(404)
    expect(h.sendClientMail).not.toHaveBeenCalled()
    expect(h.sendAdminMail).not.toHaveBeenCalled()
  })

  // (7) Token vacío → 400 antes de tocar la base.
  it('7 — un token vacío devuelve 400 invalid', async () => {
    const res = await cancelByToken(tokenReq(), tokenCtx(''))
    await flushAfter()

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ ok: false, reason: 'invalid' })
    expect(h.sendClientMail).not.toHaveBeenCalled()
    expect(await liveFutureCount(t, abonoId)).toBe(FUTURE_DATES.length)
  })
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// BLOQUE 2 — VÍA PANEL AUTENTICADA (ABONO-05)
// ══════════════════════════════════════════════════════════════════════════════════════════════

describe.skipIf(!hasSupabaseCreds)('POST /api/abonos/cancel — vía panel del dueño (ABONO-05)', () => {
  let own: SeededTenant
  let other: SeededTenant
  let ownAbono: string
  let otherAbono: string
  // Cliente anon autenticado como el dueño de `own`: es el que corre las aserciones de la vía panel.
  let ownedSession: SupabaseClient
  // Cliente anon SIN login: el caso 401.
  let noSession: SupabaseClient

  beforeAll(async () => {
    own = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })
    other = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })

    ownAbono = (await seedAbono(own, await seedClient(own, 'panel-own@test.com'), '10:00')).id
    otherAbono = (await seedAbono(other, await seedClient(other, 'panel-other@test.com'), '10:00')).id

    ownedSession = createClient(url, anonKey, { auth: { persistSession: false } })
    noSession = createClient(url, anonKey, { auth: { persistSession: false } })

    const sign = await ownedSession.auth.signInWithPassword({ email: own.email, password: own.password })
    if (sign.error) throw new Error(`signIn dueño falló: ${sign.error.message}`)

    // GUARD anti-falso-verde (patrón de test/isolation.test.ts): si el cliente de aserción quedara
    // configurado con la service-role key, no habría sesión y estaríamos testeando un bypass de RLS.
    const sess = await ownedSession.auth.getSession()
    if (!sess.data.session?.access_token) {
      throw new Error('GUARD: el cliente de la vía panel NO tiene sesión anon autenticada (no usar service-role)')
    }
    if (anonKey === process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('GUARD: NEXT_PUBLIC_SUPABASE_ANON_KEY == SUPABASE_SERVICE_ROLE_KEY — config rota, abortar')
    }
  })

  afterAll(async () => {
    if (own) await teardownOneTenant(own)
    if (other) await teardownOneTenant(other)
  })

  beforeEach(async () => {
    h.sendClientMail.mockClear()
    h.sendAdminMail.mockClear()
    h.afterTasks.length = 0
    await resetTenant(own, ownAbono, '10:00')
    await resetTenant(other, otherAbono, '10:00')
    h.session.current = ownedSession
  })

  it('1 — sin sesión devuelve 401 y no toca ninguna fila (D-23)', async () => {
    h.session.current = noSession

    const res = await cancelByPanel(panelReq({ abonoId: ownAbono }))
    await flushAfter()

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ ok: false, error: 'unauthorized' })
    expect(await statusOf(own, ownAbono)).toBe('active')
    expect(await liveFutureCount(own, ownAbono)).toBe(FUTURE_DATES.length)
    expect(h.sendClientMail).not.toHaveBeenCalled()
  })

  it('2 — un body que no es JSON devuelve 400 bad_request', async () => {
    const res = await cancelByPanel(panelReq(null, { raw: 'esto no es json' }))
    await flushAfter()

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ ok: false, error: 'bad_request' })
    expect(await statusOf(own, ownAbono)).toBe('active')
  })

  it('3 — un body sin abonoId devuelve 400 missing_fields', async () => {
    const res = await cancelByPanel(panelReq({}))
    await flushAfter()

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ ok: false, error: 'missing_fields' })
    expect(await statusOf(own, ownAbono)).toBe('active')
  })

  it('4 — el abonoId de OTRO negocio devuelve 404 y no cambia NI UNA fila del otro negocio (D-24)', async () => {
    const liveAntes = await liveFutureCount(other, otherAbono)
    const statusAntes = await statusOf(other, otherAbono)
    expect(liveAntes).toBe(FUTURE_DATES.length)
    expect(statusAntes).toBe('active')

    const res = await cancelByPanel(panelReq({ abonoId: otherAbono }))
    await flushAfter()

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ ok: false, error: 'not_found' })

    // La aserción que importa: el otro negocio quedó EXACTAMENTE como estaba.
    expect(await liveFutureCount(other, otherAbono)).toBe(liveAntes)
    expect(await statusOf(other, otherAbono)).toBe(statusAntes)
    expect(await cancelledFutureCount(other, otherAbono)).toBe(0)
    expect(h.sendClientMail).not.toHaveBeenCalled()
  })

  it('5 — un abonoId inexistente devuelve el MISMO 404 que el de otro negocio (D-22)', async () => {
    const ajeno = await cancelByPanel(panelReq({ abonoId: otherAbono }))
    const fantasma = await cancelByPanel(panelReq({ abonoId: '00000000-0000-0000-0000-000000000000' }))
    await flushAfter()

    expect(fantasma.status).toBe(ajeno.status)
    expect(await fantasma.json()).toEqual(await ajeno.json())
    expect(fantasma.status).toBe(404)
  })

  it('6 — baja válida: 200 con el conteo real de la base y UN solo mail al cliente', async () => {
    const res = await cancelByPanel(panelReq({ abonoId: ownAbono }))
    const body = await res.json()
    await flushAfter()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ ok: true, alreadyCancelled: false, lastDate: FUT_4 })
    expect(body.cancelledCount).toBe(FUTURE_DATES.length)
    expect(body.cancelledCount).toBe(await cancelledFutureCount(own, ownAbono))
    expect(await liveFutureCount(own, ownAbono)).toBe(0)
    expect(h.sendClientMail).toHaveBeenCalledTimes(1)
  })

  it('7 — la vía panel NO le manda el aviso al dueño (D-13)', async () => {
    await cancelByPanel(panelReq({ abonoId: ownAbono }))
    await flushAfter()

    expect(h.sendClientMail).toHaveBeenCalledTimes(1)
    expect(h.sendAdminMail).not.toHaveBeenCalled()
  })

  it('8 — el reintento devuelve alreadyCancelled: true y no manda un mail nuevo (D-05)', async () => {
    const first = await cancelByPanel(panelReq({ abonoId: ownAbono }))
    expect((await first.json()).alreadyCancelled).toBe(false)
    await flushAfter()
    expect(h.sendClientMail).toHaveBeenCalledTimes(1)

    const second = await cancelByPanel(panelReq({ abonoId: ownAbono }))
    await flushAfter()

    expect(second.status).toBe(200)
    expect(await second.json()).toEqual({ ok: true, alreadyCancelled: true, cancelledCount: 0, lastDate: null })
    expect(h.sendClientMail).toHaveBeenCalledTimes(1)
    expect(h.sendAdminMail).not.toHaveBeenCalled()
  })

  it('9 — la baja del panel no alcanza los turnos del otro negocio (D-24)', async () => {
    const liveAntes = await liveFutureCount(other, otherAbono)

    await cancelByPanel(panelReq({ abonoId: ownAbono }))
    await flushAfter()

    expect(await liveFutureCount(other, otherAbono)).toBe(liveAntes)
    expect(await statusOf(other, otherAbono)).toBe('active')
  })
})
