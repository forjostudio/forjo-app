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
})
