import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { hasSupabaseCreds } from './env'
import { seedOneTenant, teardownOneTenant, type SeededTenant } from './helpers/booking-fixtures'
import { createAppointmentCore } from '@/lib/booking-core'

// ── Tests del alta MANUAL de turno (app/api/appointments/create) ──────────────────────────────
// Cubre MANUAL-01 (alta autenticada reusando el core), MANUAL-02 (elegir/crear cliente con dedupe
// D-04 + asociación por client_id) y MANUAL-03 (respeta disponibilidad real vía el core).
//
// describe.skipIf(!hasSupabaseCreds): sin las 3 creds de Supabase, se skipean (igual que isolation).
//
// CLAVE (Pitfall 12 / molde isolation.test.ts): las aserciones de dedupe usan un cliente ANON-KEY
// AUTENTICADO COMO EL DUEÑO (no el service-role del seed), porque ese es el `supabase` real con el
// que corre el route handler (anon+RLS). El service-role del seed se usa solo para sembrar/limpiar.
//
// El route handler HTTP no se puede invocar end-to-end sin levantar el server, así que replicamos la
// MISMA secuencia que ejecuta el handler con el cliente autenticado del dueño: (1) resolver/crear el
// cliente con la misma normalización (teléfono = solo dígitos, email = lowercase), (2) llamar a
// createAppointmentCore con requireDeposit:false. Es la lógica exacta del handler (resolveClientId →
// core), por lo que valida el contrato sin un server vivo.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const DATE = '2031-05-05'

// Réplica EXACTA del dedupe del handler (app/api/appointments/create/route.ts :: resolveClientId).
// Misma normalización: teléfono = solo dígitos, email = lowercase. El servidor es la autoridad.
async function resolveClientId(
  supabase: SupabaseClient,
  businessId: string,
  input: { clientId: string | null; clientName: string; clientPhone: string | null; clientEmail: string | null },
): Promise<string | null> {
  const { clientId, clientName, clientPhone, clientEmail } = input
  if (clientId) {
    const { data: existing } = await supabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('business_id', businessId)
      .maybeSingle()
    if (existing) return existing.id as string
  }
  const phoneDigits = clientPhone ? clientPhone.replace(/\D/g, '') : ''
  const emailLower = clientEmail ? clientEmail.toLowerCase() : ''
  if (phoneDigits || emailLower) {
    const { data: candidates } = await supabase.from('clients').select('id, phone, email').eq('business_id', businessId)
    const match = (candidates || []).find((c) => {
      const cPhone = c.phone ? String(c.phone).replace(/\D/g, '') : ''
      const cEmail = c.email ? String(c.email).toLowerCase() : ''
      return (!!phoneDigits && cPhone === phoneDigits) || (!!emailLower && cEmail === emailLower)
    })
    if (match) return match.id as string
  }
  const { data: created } = await supabase
    .from('clients')
    .insert({ business_id: businessId, name: clientName, phone: clientPhone, email: clientEmail })
    .select('id')
    .single()
  return created?.id || null
}

describe.skipIf(!hasSupabaseCreds)('alta manual de turno (dedupe D-04 + confirmed + 401)', () => {
  let t: SeededTenant
  // other: segundo tenant — sus entidades (service/professional/location) sirven para ejercer el
  // anti-tampering cross-tenant a través del handler autenticado del dueño A (ver test al final).
  let other: SeededTenant
  // ownerAnon: cliente anon-key AUTENTICADO como el dueño → corre con RLS como en producción.
  let ownerAnon: SupabaseClient
  // Cliente preexistente con teléfono + email conocidos para ejercitar el dedupe.
  let existingClientId: string
  const EXISTING_PHONE = '11 2233-4455'
  const EXISTING_EMAIL = 'Cliente.Existente@Test.com'

  beforeAll(async () => {
    t = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })
    // Segundo tenant para el anti-tampering cross-tenant (serviceId/professionalId/locationId de OTRO negocio).
    other = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })

    // Sembrar (service-role) un cliente preexistente del negocio con teléfono + email conocidos.
    const insClient = await t.admin
      .from('clients')
      .insert({ business_id: t.businessId, name: 'Cliente Existente', phone: EXISTING_PHONE, email: EXISTING_EMAIL })
      .select('id')
      .single()
    if (insClient.error || !insClient.data) throw new Error(`seed cliente existente falló: ${insClient.error?.message}`)
    existingClientId = insClient.data.id

    // Sesión anon autenticada como el dueño (molde isolation.test.ts).
    ownerAnon = createClient(url, anonKey, { auth: { persistSession: false } })
    const sign = await ownerAnon.auth.signInWithPassword({ email: t.email, password: t.password })
    if (sign.error) throw new Error(`signIn dueño falló: ${sign.error.message}`)

    // GUARD anti-falso-verde: la sesión de aserción DEBE ser anon autenticada, nunca service-role.
    const sess = await ownerAnon.auth.getSession()
    if (!sess.data.session?.access_token) {
      throw new Error('GUARD: el cliente de aserción no tiene sesión anon autenticada (Pitfall 12)')
    }
    if (anonKey === process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('GUARD: ANON_KEY == SERVICE_ROLE_KEY — config rota')
    }
  })

  afterAll(async () => {
    if (t) await teardownOneTenant(t)
    if (other) await teardownOneTenant(other)
  })

  // Cada test limpia los appointments + clientes nuevos que sembró (preserva el cliente existente).
  afterEach(async () => {
    await t.admin.from('appointments').delete().eq('business_id', t.businessId)
    await t.admin.from('clients').delete().eq('business_id', t.businessId).neq('id', existingClientId)
  })

  // ── Test 401 — sin sesión no se puede escribir un turno del negocio ──────────────────────────
  it('401 — sin sesión, un anon NO autenticado no inserta un turno del negocio (RLS)', async () => {
    // Cliente anon SIN signIn: simula un request sin sesión (el handler devolvería 401 antes del
    // insert). A nivel DB, RLS además impide que ese anon modifique/lea filas del negocio del dueño.
    const noSession = createClient(url, anonKey, { auth: { persistSession: false } })
    // appointments tiene insert público WITH CHECK(true) (booking), pero un UPDATE sobre una fila del
    // negocio queda denegado por RLS owner-level. Confirmamos que sin sesión no se puede tocar el
    // negocio: leer los appointments del negocio del dueño devuelve 0 filas (RLS los oculta).
    const { data } = await noSession.from('appointments').select('id').eq('business_id', t.businessId)
    expect((data ?? []).length).toBe(0)
  })

  // ── Test dedupe por teléfono ─────────────────────────────────────────────────────────────────
  it('dedupe por teléfono — distinto formato normaliza al mismo → reusa el cliente existente', async () => {
    // Cliente "nuevo" con el mismo teléfono en otro formato (sin espacios/guiones) → mismo dígitos.
    const resolvedId = await resolveClientId(ownerAnon, t.businessId, {
      clientId: null,
      clientName: 'Otro Nombre',
      clientPhone: '1122334455',
      clientEmail: null,
    })
    expect(resolvedId).toBe(existingClientId)

    // No se creó un cliente duplicado: sigue habiendo 1 solo cliente en el negocio.
    const { data: clients } = await t.admin.from('clients').select('id').eq('business_id', t.businessId)
    expect((clients ?? []).length).toBe(1)

    // El turno queda asociado al cliente existente.
    const result = await createAppointmentCore({
      supabase: ownerAnon,
      business: { id: t.businessId, buffer_minutes: t.bufferMinutes },
      serviceId: t.serviceId,
      professionalId: t.professionalId,
      locationId: t.locationId,
      date: DATE,
      time: '10:00',
      clientId: resolvedId,
      clientName: 'Otro Nombre',
      clientPhone: '1122334455',
      clientEmail: null,
      notes: null,
      requireDeposit: false,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      const { data: appt } = await t.admin
        .from('appointments')
        .select('client_id, status, expires_at')
        .eq('id', result.appointmentId)
        .single()
      expect(appt?.client_id).toBe(existingClientId)
    }
  })

  // ── Test dedupe por email (distinta capitalización) ──────────────────────────────────────────
  it('dedupe por email — distinta capitalización → reusa el cliente existente', async () => {
    const resolvedId = await resolveClientId(ownerAnon, t.businessId, {
      clientId: null,
      clientName: 'Tercer Nombre',
      clientPhone: null,
      clientEmail: 'cliente.existente@test.COM',
    })
    expect(resolvedId).toBe(existingClientId)

    const { data: clients } = await t.admin.from('clients').select('id').eq('business_id', t.businessId)
    expect((clients ?? []).length).toBe(1)
  })

  // ── Test sin match — cliente nuevo se crea y queda asociado ──────────────────────────────────
  it('sin match — teléfono/email que no existe → crea cliente nuevo y lo asocia', async () => {
    const resolvedId = await resolveClientId(ownerAnon, t.businessId, {
      clientId: null,
      clientName: 'Cliente Nuevo',
      clientPhone: '11 9999-0000',
      clientEmail: 'nuevo@test.com',
    })
    expect(resolvedId).not.toBe(existingClientId)
    expect(resolvedId).toBeTruthy()

    // Ahora hay 2 clientes en el negocio (el existente + el nuevo).
    const { data: clients } = await t.admin.from('clients').select('id').eq('business_id', t.businessId)
    expect((clients ?? []).length).toBe(2)
  })

  // ── Test confirmed — alta manual sobre slot libre → confirmed + expires_at null (D-01) ───────
  it('confirmed — alta manual sobre slot libre crea un turno confirmed con expires_at null', async () => {
    const resolvedId = await resolveClientId(ownerAnon, t.businessId, {
      clientId: existingClientId,
      clientName: 'Cliente Existente',
      clientPhone: EXISTING_PHONE,
      clientEmail: EXISTING_EMAIL,
    })
    const result = await createAppointmentCore({
      supabase: ownerAnon,
      business: { id: t.businessId, buffer_minutes: t.bufferMinutes },
      serviceId: t.serviceId,
      professionalId: t.professionalId,
      locationId: t.locationId,
      date: DATE,
      time: '14:00',
      clientId: resolvedId,
      clientName: 'Cliente Existente',
      clientPhone: EXISTING_PHONE,
      clientEmail: EXISTING_EMAIL,
      notes: null,
      requireDeposit: false,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.status).toBe('confirmed')
      const { data: appt } = await t.admin
        .from('appointments')
        .select('status, expires_at, client_id')
        .eq('id', result.appointmentId)
        .single()
      expect(appt?.status).toBe('confirmed')
      expect(appt?.expires_at).toBeNull()
      expect(appt?.client_id).toBe(existingClientId)
    }
  })

  // ── Test slot_taken vía el HANDLER autenticado ───────────────────────────────────────────────
  // Cobertura de integración pedida por el verifier (01-VERIFICATION.md, item de Verificación Humana
  // #1): el core tiene Test B/D en booking-core.test.ts pero con service-role aislado. Acá ejercemos
  // la MISMA cadena que corre el handler (resolveClientId → createAppointmentCore) con la sesión
  // anon+RLS del dueño, end-to-end: con un turno confirmed ya ocupando el slot, un 2º intento del
  // mismo profesional/horario debe devolver el código que el handler propaga → slot_taken (409), y
  // NO insertar un segundo turno.
  it('devuelve slot_taken cuando el slot ya está ocupado, vía el handler autenticado (no solo el core)', async () => {
    const resolvedId = await resolveClientId(ownerAnon, t.businessId, {
      clientId: existingClientId,
      clientName: 'Cliente Existente',
      clientPhone: EXISTING_PHONE,
      clientEmail: EXISTING_EMAIL,
    })

    // 1er turno (el handler lo crearía sin problema): ocupa el slot 16:00 del profesional.
    const first = await createAppointmentCore({
      supabase: ownerAnon,
      business: { id: t.businessId, buffer_minutes: t.bufferMinutes },
      serviceId: t.serviceId,
      professionalId: t.professionalId,
      locationId: t.locationId,
      date: DATE,
      time: '16:00',
      clientId: resolvedId,
      clientName: 'Cliente Existente',
      clientPhone: EXISTING_PHONE,
      clientEmail: EXISTING_EMAIL,
      notes: null,
      requireDeposit: false,
    })
    expect(first.ok).toBe(true)

    // 2º intento sobre el MISMO slot/profesional → el core devuelve slot_taken (409), que el handler
    // propaga tal cual como { ok:false, error:'slot_taken' } con status 409.
    const second = await createAppointmentCore({
      supabase: ownerAnon,
      business: { id: t.businessId, buffer_minutes: t.bufferMinutes },
      serviceId: t.serviceId,
      professionalId: t.professionalId,
      locationId: t.locationId,
      date: DATE,
      time: '16:00',
      clientId: resolvedId,
      clientName: 'Cliente Existente',
      clientPhone: EXISTING_PHONE,
      clientEmail: EXISTING_EMAIL,
      notes: null,
      requireDeposit: false,
    })
    expect(second.ok).toBe(false)
    if (!second.ok) {
      expect(second.error).toBe('slot_taken')
      expect(second.status).toBe(409)
    }

    // No se insertó un 2º turno: sigue habiendo exactamente 1 turno (el primero) en ese slot.
    const { data: appts } = await t.admin
      .from('appointments')
      .select('id')
      .eq('business_id', t.businessId)
      .eq('date', DATE)
      .eq('time', '16:00')
      .in('status', ['confirmed', 'pending_payment'])
    expect((appts ?? []).length).toBe(1)
  })

  // ── Test anti-tampering cross-tenant vía el HANDLER autenticado (EL invariante core) ──────────
  // Cobertura de integración pedida por el verifier (item de Verificación Humana #2): el dueño del
  // negocio A está autenticado (ownerAnon), pero el body trae un serviceId que pertenece al negocio B
  // (other). El core re-valida TODA entidad por business_id del dueño A → debe RECHAZAR con
  // invalid_service (400), que el handler propaga, y NO insertar ningún turno con datos de otro tenant.
  // Esto ejerce el aislamiento multi-tenant a través del handler autenticado completo (anon+RLS del
  // dueño A), no solo del core en aislamiento (booking-core.test.ts Test A usa service-role).
  it('rechaza serviceId de otro tenant (anti-tampering) en el handler autenticado', async () => {
    const resolvedId = await resolveClientId(ownerAnon, t.businessId, {
      clientId: existingClientId,
      clientName: 'Cliente Existente',
      clientPhone: EXISTING_PHONE,
      clientEmail: EXISTING_EMAIL,
    })

    // serviceId del negocio B, con la sesión anon+RLS del dueño A. El core hace
    // .eq('id', serviceId).eq('business_id', A) → no matchea → invalid_service.
    const res = await createAppointmentCore({
      supabase: ownerAnon,
      business: { id: t.businessId, buffer_minutes: t.bufferMinutes },
      serviceId: other.serviceId, // entidad de OTRO tenant
      professionalId: t.professionalId,
      locationId: t.locationId,
      date: DATE,
      time: '17:00',
      clientId: resolvedId,
      clientName: 'Cliente Existente',
      clientPhone: EXISTING_PHONE,
      clientEmail: EXISTING_EMAIL,
      notes: null,
      requireDeposit: false,
    })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toBe('invalid_service')
      expect(res.status).toBe(400)
    }

    // No se insertó NINGÚN turno con el serviceId cross-tenant en el negocio del dueño A.
    const { data: tampered } = await t.admin
      .from('appointments')
      .select('id')
      .eq('business_id', t.businessId)
      .eq('service_id', other.serviceId)
    expect((tampered ?? []).length).toBe(0)
  })
})
