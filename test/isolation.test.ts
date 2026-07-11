import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { hasSupabaseCreds } from './env'
import { seedTwoTenants, teardown, type SeededTenants } from './helpers/supabase-fixtures'

// ── Tests de aislamiento multi-tenant (RLS owner-level) — D-02 + D-03 + D-06 ─────────────
// Este es el control de seguridad central del milestone (V4 Access Control): la suite se
// pone ROJA si una policy de aislamiento se cae y un negocio puede leer/modificar datos de otro.
//
// describe.skipIf(!hasSupabaseCreds) (D-03): sin las 3 creds de Supabase en el entorno, estos
// tests se SKIPEAN (test/env.ts ya emitió un console.warn). Los webhook tests no dependen de
// esto → la suite igual corre verde. Así CI no falla en un fork sin secrets.
//
// LA TRAMPA (Pitfall 12 / D-06): las ASERCIONES de aislamiento usan SOLO clientes anon-key
// autenticados como cada dueño — NUNCA el service-role (que bypassa RLS y daría falso verde).
// El service-role del helper de fixtures se usa exclusivamente para sembrar/limpiar y para un
// check independiente del efecto de un UPDATE (que NO es la aserción de RLS, ver más abajo).

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

describe.skipIf(!hasSupabaseCreds)('aislamiento multi-tenant (RLS owner-level)', () => {
  let seeded: SeededTenants
  // anonA / anonB: 2 clientes anon-key DISTINTOS, autenticados como dueño A y dueño B.
  // Son los ÚNICOS clientes que tocan las aserciones de aislamiento.
  let anonA: SupabaseClient
  let anonB: SupabaseClient

  beforeAll(async () => {
    seeded = await seedTwoTenants()

    // 2 clientes anon-key (misma forma que lib/supabase/client.ts: URL + ANON_KEY).
    // persistSession: false → cada cliente mantiene su propia sesión en memoria sin pisarse.
    anonA = createClient(url, anonKey, { auth: { persistSession: false } })
    anonB = createClient(url, anonKey, { auth: { persistSession: false } })

    // Autenticar cada sesión como su dueño. signInWithPassword funciona de inmediato porque los
    // usuarios se crearon con email_confirm: true. A partir de acá, auth.uid() de cada cliente
    // es userA / userB → las policies owner_id = auth.uid() aplican como en producción.
    const signA = await anonA.auth.signInWithPassword({ email: seeded.emailA, password: seeded.password })
    if (signA.error) throw new Error(`signIn A falló: ${signA.error.message}`)
    const signB = await anonB.auth.signInWithPassword({ email: seeded.emailB, password: seeded.password })
    if (signB.error) throw new Error(`signIn B falló: ${signB.error.message}`)

    // GUARD anti-falso-verde (Pitfall 12 / Success Criteria 2 del ROADMAP): si por error el
    // cliente de aserción quedó configurado con la service-role key, fallamos RUIDOSAMENTE acá
    // antes de correr ninguna aserción. Una sesión anon autenticada SIEMPRE tiene access_token
    // (JWT del usuario logueado); un cliente service-role no produce sesión por signIn.
    const sessA = await anonA.auth.getSession()
    const sessB = await anonB.auth.getSession()
    if (!sessA.data.session?.access_token || !sessB.data.session?.access_token) {
      throw new Error(
        'GUARD: el cliente de aserción NO tiene sesión anon autenticada — no debe usarse service-role en las aserciones (Pitfall 12)'
      )
    }
    // Defensa extra: la anon key NO debe coincidir con la service-role key.
    if (anonKey === process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('GUARD: NEXT_PUBLIC_SUPABASE_ANON_KEY == SUPABASE_SERVICE_ROLE_KEY — config rota, abortar')
    }
  })

  afterAll(async () => {
    // teardown robusto (try/finally adentro): borra negocios + usuarios aunque un test haya fallado.
    if (seeded) await teardown(seeded)
  })

  it('cross-READ: A no ve los appointments de B (RLS deniega, SIN filtro business_id)', async () => {
    // CLAVE (Pitfall 12): NO agregamos .eq('business_id', ...). Si filtráramos por business_id,
    // testearíamos NUESTRO WHERE, no RLS — y pasaría aunque la policy estuviera rota. Dejamos que
    // RLS sea quien oculte las filas de B. La sesión de A solo debe ver filas de SUS negocios (0 de B).
    const { data, error } = await anonA.from('appointments').select('id')
    expect(error).toBeNull()
    // El appointment de B NO debe aparecer en lo que ve A.
    expect((data ?? []).some((r) => r.id === seeded.apptB)).toBe(false)
  })

  it('cross-WRITE (UPDATE): A no puede modificar un appointment de B', async () => {
    // Cross-write se prueba con UPDATE de una fila EXISTENTE de B (no INSERT): appointments tiene
    // policy "public insert WITH CHECK(true)" para el booking público, así que un INSERT anon ahí
    // pasa A PROPÓSITO (Pitfall 6). El UPDATE, en cambio, choca con la policy owner USING(...) → 0 filas.
    const { data, error } = await anonA
      .from('appointments')
      .update({ client_name: 'hacked' })
      .eq('id', seeded.apptB) // .eq por id, NO por business_id: apuntamos a la fila concreta de B
      .select('id')
    // RLS puede devolver error o simplemente 0 filas afectadas; ambas son denegación válida.
    expect(error !== null || (data ?? []).length === 0).toBe(true)

    // Check INDEPENDIENTE del efecto con service-role: esto NO es la aserción de RLS (esa ya fue
    // arriba con anon). Es solo para confirmar que el dato de B quedó intacto (no se escribió 'hacked').
    const { data: check } = await seeded.admin
      .from('appointments')
      .select('client_name')
      .eq('id', seeded.apptB)
      .single()
    expect(check?.client_name).toBe(seeded.apptBClientName)
  })

  it('cross-INSERT en tabla SIN insert público: A no inserta un service para B', async () => {
    // services NO tiene policy de insert público (a diferencia de appointments/clients) → un INSERT
    // anon para el business_id de B debe FALLAR por RLS. Elegimos services justamente porque su única
    // policy es la owner USING(...) sin WITH CHECK(true) público (Pitfall 6 / A3).
    const { data, error } = await anonA
      .from('services')
      .insert({ business_id: seeded.bizB, name: '__test_x', duration_minutes: 30, price: 10 })
      .select('id')
    // Denegación = error de RLS, o 0 filas devueltas. Cualquiera de las dos es correcta.
    expect(error !== null || (data ?? []).length === 0).toBe(true)
  })

  // ── SC2: aislamiento cross-tenant del write path del CMS (landing_config) — Phase 13 ──────────
  // La garantía de SC2 es RLS (no la Server Action, que ni siquiera acepta un bizA del body). Se
  // prueba con el UPDATE directo anon-key, idéntico al caso de appointments: apuntamos por `id` a la
  // fila de A y dejamos que la policy `owner_id = auth.uid()` deniegue. anon-key SOLO en la aserción;
  // seeded.admin únicamente para el check independiente del efecto (Pitfall 3, NO es la aserción RLS).

  it('cross-WRITE landing_config: B no puede escribir el config de A (SC2)', async () => {
    // anonB (sesión de B) apunta EXPLÍCITAMENTE a la fila de A (por id, NO por owner/business_id):
    // dejamos que RLS deniegue. Un config válido cualquiera como payload.
    const { data, error } = await anonB
      .from('businesses')
      .update({ landing_config: { theme: { preset: 'forjo' }, sections: [] } })
      .eq('id', seeded.bizA)
      .select('id')
    // Denegación RLS: error, o 0 filas afectadas. Cualquiera de las dos es válida.
    expect(error !== null || (data ?? []).length === 0).toBe(true)

    // Check INDEPENDIENTE del efecto con service-role (NO es la aserción de RLS): A nunca escribió su
    // config (el fixture lo deja null) y el intento de B tampoco lo tocó → sigue null.
    const { data: check } = await seeded.admin
      .from('businesses')
      .select('landing_config')
      .eq('id', seeded.bizA)
      .single()
    expect(check?.landing_config).toBeNull()
  })

  it('same-tenant WRITE landing_config: A SÍ escribe el suyo (happy path)', async () => {
    // anonA escribe SU propio landing_config: la policy owner_id = auth.uid() lo permite. Va DESPUÉS
    // del cross-write de B para que el "quedó null tras el intento de B" del it anterior sea limpio.
    const cfg = { theme: { preset: 'forjo' }, sections: [] }
    const { error } = await anonA
      .from('businesses')
      .update({ landing_config: cfg })
      .eq('id', seeded.bizA)
      .select('id')
    expect(error).toBeNull()

    // Check de efecto con service-role (no es la aserción RLS): el config quedó persistido en la fila de A.
    const { data: check } = await seeded.admin
      .from('businesses')
      .select('landing_config')
      .eq('id', seeded.bizA)
      .single()
    expect(check?.landing_config).toMatchObject(cfg)
  })

  // ── Entitlement del CMS (PUB-01): el dueño NO puede auto-otorgarse has_web_custom ──────────────
  // El gate del editor (page + saveLandingConfig) exige has_web_custom = true. Ese gate solo sirve
  // si el dueño no puede prendérselo solo. Quien lo protege es el trigger
  // businesses_protect_admin_columns: ante cualquier UPDATE que no sea service_role, revierte
  // has_web_custom/has_whatsapp/plan/plan_status al valor viejo. Ojo con el falso verde: el UPDATE
  // NO devuelve error (el trigger no lanza, REVIERTE en silencio) → la aserción real es que el
  // valor EFECTIVO en la fila sigue en false. Aserción con anon-key; service-role solo para leer.
  it('entitlement: A NO puede auto-otorgarse has_web_custom (trigger lo revierte)', async () => {
    // Estado de partida: el fixture crea los negocios con has_web_custom = false (DEFAULT).
    const { data: before } = await seeded.admin
      .from('businesses')
      .select('has_web_custom')
      .eq('id', seeded.bizA)
      .single()
    expect(before?.has_web_custom).toBe(false)

    // A (sesión anon del dueño) intenta prendérselo sobre SU PROPIA fila. La policy RLS `owner access`
    // le permite el UPDATE de su fila, así que esto NO falla por RLS — lo ataja el trigger.
    await anonA
      .from('businesses')
      .update({ has_web_custom: true })
      .eq('id', seeded.bizA)
      .select('id')

    // La aserción que importa: el valor efectivo NO cambió. Sin esto, el dueño desbloquearía el CMS
    // (y su write path) por su cuenta.
    const { data: after } = await seeded.admin
      .from('businesses')
      .select('has_web_custom')
      .eq('id', seeded.bizA)
      .single()
    expect(after?.has_web_custom).toBe(false)
  })

  // ── D-10: la vista acotada public_businesses tras agregar landing_config (migración 030) ──────
  // CFG-02: public_businesses ahora expone landing_config a anon por columna explícita, SIN
  // re-abrir la fuga de secretos de v0.9. Estos 3 casos usan SOLO anon-key (anonA/anonB), nunca
  // seeded.admin (Pitfall 12). Solo corren contra el DB real con la migración 030 ya aplicada.

  it('D-10a — public_businesses expone landing_config a anon (anonA)', async () => {
    // Selectabilidad (no valor): los fixtures dejan landing_config en null, pero la columna debe
    // existir en la vista y poder leerse sin error. Si la vista no se extendió, PostgREST tira error.
    const { data, error } = await anonA
      .from('public_businesses')
      .select('landing_config')
      .eq('id', seeded.bizA)
      .single()
    expect(error).toBeNull()
    expect(data).toHaveProperty('landing_config')
  })

  it('D-10b — los secretos SIGUEN denegados tras agregar landing_config a la vista (anonA)', async () => {
    // Anti-regresión (Pitfall 1 / T-06-04): mp_access_token NO está en la vista acotada → PostgREST
    // debe errar. Prueba que extender la vista con landing_config NO re-abrió la fuga de v0.9.
    const { error } = await anonA
      .from('public_businesses')
      .select('mp_access_token')
      .eq('id', seeded.bizA)
      .single()
    expect(error).not.toBeNull()
  })

  it('D-10c — cross-tenant: el anon del negocio B tampoco obtiene secretos del negocio A', async () => {
    // El secreto está estructuralmente AUSENTE de la vista para TODO tenant, así que un read
    // cross-tenant (dueño B leyendo la fila de bizA) tampoco alcanza mp_access_token → error.
    // Usa anonB leyendo seeded.bizA; nunca seeded.admin. Cierra la 3ª pata de D-10.
    const { error } = await anonB
      .from('public_businesses')
      .select('mp_access_token')
      .eq('id', seeded.bizA)
      .single()
    expect(error).not.toBeNull()
  })
})
