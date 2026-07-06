import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { hasSupabaseCreds } from './env'
import { seedOneTenant, teardownOneTenant, type SeededTenant } from './helpers/booking-fixtures'
import { validateClientBody, buildClientInsert } from '@/lib/clients-create'

// ── Tests del alta MANUAL de cliente (app/api/clients/create) ─────────────────────────────────
// Cubre CLIENT-01: alta autenticada (anon+RLS) que inserta en `clients` con business_id derivado
// de la sesión (owner_id), origin='manual' fijado server-side, y gating de obra social por vertical.
//
// describe.skipIf(!hasSupabaseCreds): sin las 3 creds de Supabase, se skipean (igual que isolation).
//
// CLAVE (molde manual-booking.test.ts / Pitfall 12): las aserciones usan un cliente ANON-KEY
// AUTENTICADO COMO EL DUEÑO (no el service-role del seed), porque ese es el `supabase` real con el
// que corre el route handler (anon+RLS). El service-role del seed se usa solo para sembrar/limpiar.
//
// El route handler HTTP no se puede invocar end-to-end sin levantar el server, así que replicamos la
// MISMA lógica de validación + construcción del insert que ejecuta el handler, con el cliente
// autenticado del dueño. Es la lógica exacta del handler (validar body → buildClientInsert → insert
// en clients con origin='manual'), por lo que valida el contrato sin un server vivo.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// validateClientBody y buildClientInsert son la lógica PURA compartida por el handler
// (app/api/clients/create/route.ts) y este test — misma fuente de verdad, cero réplica divergente.

describe.skipIf(!hasSupabaseCreds)('alta manual de cliente (origin=manual + tenant por sesión + gating obra social)', () => {
  let t: SeededTenant
  // ownerAnon: cliente anon-key AUTENTICADO como el dueño → corre con RLS como en producción.
  let ownerAnon: SupabaseClient

  beforeAll(async () => {
    t = await seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })

    // Sesión anon autenticada como el dueño (molde manual-booking.test.ts / isolation.test.ts).
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
  })

  // Cada test limpia los clientes que sembró.
  afterEach(async () => {
    await t.admin.from('clients').delete().eq('business_id', t.businessId)
    // Restaurar el vertical del negocio a general (los tests de salud lo pisan).
    await t.admin.from('businesses').update({ vertical: null, type: null }).eq('id', t.businessId)
  })

  // ── Validación: nombre vacío → missing_fields ────────────────────────────────────────────────
  it('missing_fields — nombre vacío es rechazado antes de escribir', () => {
    expect(validateClientBody({ name: '', phone: '1122334455', email: null })).toBe('missing_fields')
  })

  // ── Validación: nombre presente pero sin contacto → missing_fields ───────────────────────────
  it('missing_fields — nombre sin teléfono NI email es rechazado', () => {
    expect(validateClientBody({ name: 'Juan Pérez', phone: null, email: null })).toBe('missing_fields')
  })

  // ── Validación: nombre + al menos un contacto → válido ───────────────────────────────────────
  it('válido — nombre + teléfono (o email) pasa la validación', () => {
    expect(validateClientBody({ name: 'Juan Pérez', phone: '1122334455', email: null })).toBeNull()
    expect(validateClientBody({ name: 'Ana Gómez', phone: null, email: 'ana@test.com' })).toBeNull()
  })

  // ── Insert: origin='manual' + business_id de la sesión ───────────────────────────────────────
  it('origin=manual — el cliente creado queda con origin=manual y business_id del negocio de la sesión', async () => {
    const payload = buildClientInsert(
      { id: t.businessId },
      { name: 'Cliente Manual', phone: '11 5555-6666', email: null, notes: 'nota de prueba', insurance_name: null, insurance_number: null },
    )
    const { data: created, error } = await ownerAnon.from('clients').insert(payload).select('*').single()
    expect(error).toBeNull()
    expect(created).toBeTruthy()
    expect(created!.origin).toBe('manual')
    expect(created!.business_id).toBe(t.businessId)
    expect(created!.name).toBe('Cliente Manual')
    expect(created!.notes).toBe('nota de prueba')
  })

  // ── Insert: business_id del body es IGNORADO (tenant siempre de la sesión) ────────────────────
  it('anti-tampering — un business_id ajeno en el "body" no cambia el tenant del insert', async () => {
    // El handler NUNCA lee business_id del body: siempre usa business.id resuelto por owner_id.
    // buildClientInsert refleja eso — el id ajeno ni siquiera entra en la función. Aserción:
    // el payload construido usa el business de la sesión, no uno arbitrario.
    const attacker = '00000000-0000-0000-0000-000000000000'
    const payload = buildClientInsert(
      { id: t.businessId },
      { name: 'Sin Tampering', phone: '1199990000', email: null, notes: null, insurance_name: null, insurance_number: null },
    )
    expect(payload.business_id).toBe(t.businessId)
    expect(payload.business_id).not.toBe(attacker)
    const { data: created } = await ownerAnon.from('clients').insert(payload).select('business_id').single()
    expect(created!.business_id).toBe(t.businessId)
  })

  // ── Gating obra social: vertical NO salud → insurance_* se ignora ────────────────────────────
  it('obra social ignorada — en vertical general los insurance_* NO se persisten', async () => {
    // Negocio general (vertical=null → resolveVertical cae a general).
    const payload = buildClientInsert(
      { id: t.businessId, vertical: null, type: null },
      { name: 'Cliente General', phone: '1177778888', email: null, notes: null, insurance_name: 'OSDE', insurance_number: '12345' },
    )
    expect(payload.insurance_name).toBeUndefined()
    expect(payload.insurance_number).toBeUndefined()
    const { data: created } = await ownerAnon.from('clients').insert(payload).select('insurance_name, insurance_number').single()
    expect(created!.insurance_name).toBeNull()
    expect(created!.insurance_number).toBeNull()
  })

  // ── Gating obra social: vertical salud → insurance_* SÍ se persiste ──────────────────────────
  it('obra social persistida — en vertical salud los insurance_* se guardan', async () => {
    // Pisar el negocio a salud (service-role) para ejercer el gate.
    await t.admin.from('businesses').update({ vertical: 'salud' }).eq('id', t.businessId)
    const payload = buildClientInsert(
      { id: t.businessId, vertical: 'salud', type: null },
      { name: 'Paciente Salud', phone: '1166665555', email: null, notes: null, insurance_name: 'Swiss Medical', insurance_number: '99887' },
    )
    expect(payload.insurance_name).toBe('Swiss Medical')
    expect(payload.insurance_number).toBe('99887')
    const { data: created } = await ownerAnon.from('clients').insert(payload).select('insurance_name, insurance_number').single()
    expect(created!.insurance_name).toBe('Swiss Medical')
    expect(created!.insurance_number).toBe('99887')
  })
})
