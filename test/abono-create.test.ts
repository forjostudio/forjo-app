import { describe, it, expect, beforeAll, afterAll, afterEach, vi, type Mock } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { hasSupabaseCreds } from './env'
import { seedOneTenant, teardownOneTenant, seedTimeBlock, type SeededTenant } from './helpers/booking-fixtures'
import { generateAbonoOccurrences } from '@/lib/abono-generation'
import { sendAbonoConfirmation } from '@/lib/email'

// ── Tests del alta MANUAL del abono (app/api/abonos/create) ──────────────────────────────────────
// Cubre ABONO-01 (alta autenticada del dueño), el anti-tampering por business_id, la PRIMERA TANDA de
// generación vía el motor (Plan 02) y el mail único de alta (D-08).
//
// El route handler HTTP no se puede invocar end-to-end sin levantar el server (usa createClient() con
// cookies de la sesión), así que — igual que test/manual-booking.test.ts — replicamos la MISMA secuencia
// que ejecuta el handler con el cliente autenticado del dueño (anon+RLS): validar service/professional
// por business_id → resolver cliente → insertar la fila abonos → correr generateAbonoOccurrences →
// persistir generated_until + skipped. Es la lógica exacta del handler, así que valida el contrato sin
// un server vivo. El mail (que en el handler va en after()) se prueba aparte, PURO, stubbeando fetch.
//
// describe.skipIf(!hasSupabaseCreds): sin las creds de Supabase, se skipean (igual que el resto).
//
// Rango fijo de marzo/2031 (LUNES) para no chocar con lógica de turnos pasados: los lunes de
// [2031-03-03, 2031-03-31] son 03/10/17/24/31 (5 ocurrencias).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const FROM = '2031-03-03'
const TO = '2031-03-31'
const MONDAYS = ['2031-03-03', '2031-03-10', '2031-03-17', '2031-03-24', '2031-03-31']
const DOW_MON = 1
const START = '10:00'

// Réplica del anti-tampering + insert + primera tanda del handler (app/api/abonos/create/route.ts).
// `supabase` = sesión anon+RLS del dueño (como corre el handler en prod). Devuelve el resultado del
// motor + el id/row del abono, o un error de dominio si la validación de tenant rechaza.
async function altaAbono(
  supabase: SupabaseClient,
  businessId: string,
  bufferMinutes: number,
  input: {
    serviceId: string
    professionalId: string | null
    locationId: string | null
    dayOfWeek: number
    time: string
    clientId: string
    fromDate: string
    toDate: string
  },
): Promise<
  | { ok: false; error: string }
  | { ok: true; abonoId: string; created: string[]; skipped: { date: string; reason: string }[] }
> {
  // (a) professional/cancha por business_id + derivación de service en canchas.
  let proId: string | null = null
  let resolvedServiceId = input.serviceId
  if (input.professionalId) {
    const { data: pro } = await supabase
      .from('professionals')
      .select('id, service_id')
      .eq('id', input.professionalId)
      .eq('business_id', businessId)
      .maybeSingle()
    if (!pro) return { ok: false, error: 'invalid_professional' }
    proId = pro.id as string
    if (pro.service_id) resolvedServiceId = pro.service_id as string
  }
  if (!resolvedServiceId) return { ok: false, error: 'invalid_service' }

  // (b) service por business_id + activo.
  const { data: service } = await supabase
    .from('services')
    .select('id, duration_minutes, active')
    .eq('id', resolvedServiceId)
    .eq('business_id', businessId)
    .maybeSingle()
  if (!service || service.active === false) return { ok: false, error: 'invalid_service' }

  // (c) location por business_id.
  let validLocationId: string | null = null
  if (input.locationId) {
    const { data: loc } = await supabase
      .from('locations')
      .select('id')
      .eq('id', input.locationId)
      .eq('business_id', businessId)
      .maybeSingle()
    validLocationId = loc ? input.locationId : null
  }

  // insert abonos (anon+RLS).
  const { data: abono, error: insErr } = await supabase
    .from('abonos')
    .insert({
      business_id: businessId,
      client_id: input.clientId,
      service_id: service.id,
      professional_id: proId,
      location_id: validLocationId,
      day_of_week: input.dayOfWeek,
      start_time: input.time,
      duration_minutes: Number(service.duration_minutes) || null,
      status: 'active',
    })
    .select('id, cancel_token, client_id, day_of_week, start_time, service_id, professional_id, location_id')
    .single()
  if (insErr || !abono) return { ok: false, error: 'insert_failed' }

  // primera tanda vía el motor.
  const result = await generateAbonoOccurrences({
    supabase,
    business: { id: businessId, buffer_minutes: bufferMinutes },
    abono: {
      id: abono.id as string,
      client_id: abono.client_id as string | null,
      day_of_week: abono.day_of_week as number,
      start_time: abono.start_time as string,
      service_id: abono.service_id as string | null,
      professional_id: abono.professional_id as string | null,
      location_id: abono.location_id as string | null,
    },
    fromDate: input.fromDate,
    toDate: input.toDate,
  })

  // persistir generated_until + skipped (capado a 50).
  await supabase
    .from('abonos')
    .update({ generated_until: input.toDate, skipped_occurrences: result.skipped.slice(-50) })
    .eq('id', abono.id)
    .eq('business_id', businessId)

  return { ok: true, abonoId: abono.id as string, created: result.created, skipped: result.skipped }
}

describe.skipIf(!hasSupabaseCreds)('alta manual del abono (auth + anti-tampering + primera tanda)', () => {
  let t: SeededTenant
  let other: SeededTenant
  let ownerAnon: SupabaseClient
  let clientId: string

  beforeAll(async () => {
    t = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })
    other = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })

    // Grilla semanal: lunes 08:00–20:00, cupo 1 → 10:00 cae dentro y el slot es individual.
    await seedTimeBlock(t, { capacity: 1, dayOfWeek: DOW_MON, startTime: '08:00', endTime: '20:00' })

    // Cliente del negocio (el abono queda con client_id).
    const insClient = await t.admin
      .from('clients')
      .insert({ business_id: t.businessId, name: 'Cliente Abono', phone: '1122334455', email: 'abono@test.com' })
      .select('id')
      .single()
    if (insClient.error || !insClient.data) throw new Error(`seed client: ${insClient.error?.message}`)
    clientId = insClient.data.id

    // Sesión anon autenticada como el dueño (molde manual-booking.test.ts): corre con RLS como en prod.
    ownerAnon = createClient(url, anonKey, { auth: { persistSession: false } })
    const sign = await ownerAnon.auth.signInWithPassword({ email: t.email, password: t.password })
    if (sign.error) throw new Error(`signIn dueño falló: ${sign.error.message}`)
    const sess = await ownerAnon.auth.getSession()
    if (!sess.data.session?.access_token) throw new Error('GUARD: el cliente de aserción no tiene sesión anon autenticada')
    if (anonKey === process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('GUARD: ANON_KEY == SERVICE_ROLE_KEY — config rota')
  })

  afterAll(async () => {
    if (t) await teardownOneTenant(t)
    if (other) await teardownOneTenant(other)
  })

  // Limpieza entre tests: abonos + appointments de AMBOS tenants (config persistente se deja).
  afterEach(async () => {
    if (t) {
      await t.admin.from('appointments').delete().eq('business_id', t.businessId)
      await t.admin.from('abonos').delete().eq('business_id', t.businessId)
    }
    if (other) {
      await other.admin.from('appointments').delete().eq('business_id', other.businessId)
      await other.admin.from('abonos').delete().eq('business_id', other.businessId)
    }
  })

  // ── (1) Alta feliz: inserta el abono + genera la primera tanda, todos con abono_id ────────────
  it('1 — alta feliz: crea el abono (status active) y genera N turnos con abono_id + generated_until', async () => {
    const res = await altaAbono(ownerAnon, t.businessId, t.bufferMinutes, {
      serviceId: t.serviceId,
      professionalId: t.professionalId,
      locationId: t.locationId,
      dayOfWeek: DOW_MON,
      time: START,
      clientId,
      fromDate: FROM,
      toDate: TO,
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.skipped).toEqual([])
    expect([...res.created].sort()).toEqual(MONDAYS)

    // La fila abonos quedó activa con día/hora correctos y generated_until seteado.
    const { data: abono } = await t.admin
      .from('abonos')
      .select('status, day_of_week, start_time, generated_until, client_id')
      .eq('id', res.abonoId)
      .single()
    expect(abono?.status).toBe('active')
    expect(abono?.day_of_week).toBe(DOW_MON)
    expect((abono?.start_time as string).slice(0, 5)).toBe(START)
    expect(abono?.generated_until).toBe(TO)
    expect(abono?.client_id).toBe(clientId)

    // 5 turnos, en las fechas correctas, a las 10:00, todos etiquetados con el abono. Ninguno con mail
    // marcado (el motor NO manda mail por ocurrencia — el único mail es el de alta, aparte).
    const { data: appts } = await t.admin
      .from('appointments')
      .select('date, time, abono_id, email_sent')
      .eq('business_id', t.businessId)
      .eq('abono_id', res.abonoId)
      .order('date')
    expect(appts?.length).toBe(5)
    expect(appts?.map((a) => a.date)).toEqual(MONDAYS)
    expect(appts?.every((a) => (a.time as string).slice(0, 5) === START)).toBe(true)
    expect(appts?.every((a) => a.abono_id === res.abonoId)).toBe(true)
    expect(appts?.every((a) => !a.email_sent)).toBe(true)
  })

  // ── (2) Anti-tampering: service/professional de OTRO negocio → rechazo, sin crear nada cross-tenant ──
  it('2 — rechaza serviceId de otro tenant (invalid_service) sin crear el abono', async () => {
    const res = await altaAbono(ownerAnon, t.businessId, t.bufferMinutes, {
      serviceId: other.serviceId, // entidad de OTRO negocio
      professionalId: null,
      locationId: null,
      dayOfWeek: DOW_MON,
      time: START,
      clientId,
      fromDate: FROM,
      toDate: TO,
    })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toBe('invalid_service')

    // No se creó ningún abono con el service ajeno en el negocio del dueño.
    const { data: abonos } = await t.admin
      .from('abonos')
      .select('id')
      .eq('business_id', t.businessId)
      .eq('service_id', other.serviceId)
    expect((abonos ?? []).length).toBe(0)
  })

  it('2b — rechaza professionalId de otro tenant (invalid_professional) sin crear el abono', async () => {
    const res = await altaAbono(ownerAnon, t.businessId, t.bufferMinutes, {
      serviceId: t.serviceId,
      professionalId: other.professionalId, // agenda de OTRO negocio
      locationId: null,
      dayOfWeek: DOW_MON,
      time: START,
      clientId,
      fromDate: FROM,
      toDate: TO,
    })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toBe('invalid_professional')

    const { count } = await t.admin
      .from('abonos')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', t.businessId)
    expect(count).toBe(0)
  })

  // ── (3) Auth ─────────────────────────────────────────────────────────────────────────────────
  it('3 — sin sesión, un anon NO autenticado no puede insertar un abono (RLS)', async () => {
    const noSession = createClient(url, anonKey, { auth: { persistSession: false } })
    const { data, error } = await noSession
      .from('abonos')
      .insert({ business_id: t.businessId, client_id: clientId, service_id: t.serviceId, day_of_week: DOW_MON, start_time: START, status: 'active' })
      .select('id')
    // RLS deniega el insert (sin fila devuelta). El handler además cortaría en el 401 antes de llegar acá.
    expect(data ?? []).toEqual([])
    expect(error).not.toBeNull()

    const { count } = await t.admin
      .from('abonos')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', t.businessId)
    expect(count).toBe(0)
  })

  it('3b — sin business para el owner → el lookup por owner_id no encuentra negocio (404 del handler)', async () => {
    const { data: business } = await t.admin.from('businesses').select('id').eq('owner_id', crypto.randomUUID()).maybeSingle()
    expect(business).toBeNull()
  })

  // ── (4) Un solo mail: el motor NO manda mail por ocurrencia (contraparte del mail único de alta) ──
  it('4 — la primera tanda (5 turnos) NO dispara ningún mail: el único mail es el de alta, aparte', async () => {
    const res = await altaAbono(ownerAnon, t.businessId, t.bufferMinutes, {
      serviceId: t.serviceId,
      professionalId: t.professionalId,
      locationId: t.locationId,
      dayOfWeek: DOW_MON,
      time: START,
      clientId,
      fromDate: FROM,
      toDate: TO,
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.created.length).toBe(5)

    // Ningún turno de la serie quedó con email_sent (el motor/booking-core no manda mail por ocurrencia).
    const { data: appts } = await t.admin
      .from('appointments')
      .select('email_sent')
      .eq('business_id', t.businessId)
      .eq('abono_id', res.abonoId)
    expect(appts?.length).toBe(5)
    expect(appts?.every((a) => !a.email_sent)).toBe(true)
  })
})

// ── Test PURO del mail de alta del abono (sendAbonoConfirmation, D-08) ────────────────────────────
// Sin red ni DB: stub de global.fetch, se captura el payload de Resend y se asierta sobre el string
// renderizado. Prueba que UNA llamada = UN POST (mail único) y que el contenido es correcto SIN
// precio/seña. Pasamos key/from propios para no depender de process.env.RESEND_API_KEY.
describe('sendAbonoConfirmation — mail único de alta del abono (D-08)', () => {
  const BASE = {
    to: 'cliente@example.com',
    clientName: 'Juana Cliente',
    service: 'Kinesiología',
    dayLabel: 'todos los lunes',
    time: '10:00',
    businessName: 'Consultorio Test',
    businessSlug: 'consultorio-test',
    primaryColor: '#123456',
    logoUrl: null,
    whatsapp: null,
    resendApiKey: 're_test_key',
    resendFrom: '"Consultorio Test" <turnos@consultorio.test>',
  }

  function stubFetchOk(): Mock {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'email-id-x' }) })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }
  function capturedPayload(fetchMock: Mock): { html: string; text: string; subject: string } {
    const body = (fetchMock.mock.calls[0][1] as { body: string }).body
    return JSON.parse(body)
  }

  afterEach(() => vi.unstubAllGlobals())

  it('m1 — una llamada hace UN solo POST a api.resend.com', async () => {
    const fetchMock = stubFetchOk()
    await sendAbonoConfirmation({ ...BASE })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.resend.com/emails')
  })

  it('m2 — el html muestra el día recurrente (dayLabel) + hora + servicio + negocio', async () => {
    const fetchMock = stubFetchOk()
    await sendAbonoConfirmation({ ...BASE })
    const { html } = capturedPayload(fetchMock)
    expect(html).toContain('todos los lunes')
    expect(html).toContain('10:00')
    expect(html).toContain('Kinesiología')
    expect(html).toContain('Consultorio Test')
  })

  it('m3 — NI html NI text muestran precio/seña (D-08: v0.24 no cobra el abono)', async () => {
    const fetchMock = stubFetchOk()
    await sendAbonoConfirmation({ ...BASE })
    const { html, text } = capturedPayload(fetchMock)
    for (const rendered of [html, text]) {
      expect(rendered).not.toContain('$')
      expect(rendered.toLowerCase()).not.toContain('seña')
      expect(rendered.toLowerCase()).not.toContain('sena')
      expect(rendered.toLowerCase()).not.toContain('precio')
    }
  })

  it('m4 — sin cancelUrl (v0.24), no se renderiza botón de cancelar la serie', async () => {
    const fetchMock = stubFetchOk()
    await sendAbonoConfirmation({ ...BASE }) // sin cancelUrl
    const { html } = capturedPayload(fetchMock)
    expect(html).not.toContain('Cancelar turno fijo')
  })
})
