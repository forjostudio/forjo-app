import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { hasSupabaseCreds } from './env'
import { seedTwoTenants, teardown, type SeededTenants } from './helpers/supabase-fixtures'

// ── businesses_mp_user_id_key (migr. 082): una cuenta de MercadoPago, un negocio ────────────────
//
// POR QUÉ PEGA CONTRA LA BASE. Lo que promete la 082 es que Postgres rechaza la cuenta repetida AUNQUE
// el cliente de sesión del segundo dueño no vea el primer negocio por RLS: el callback del OAuth escribe
// con ese cliente y no hay un SELECT previo que pueda encontrar el choque. Un fake no puede probar eso;
// sólo el índice real, con una sesión real (anon key + signInWithPassword → rol `authenticated`).
//
// SERVICE-ROLE SÓLO PARA SEMBRAR Y PARA EL CHEQUEO INDEPENDIENTE (Pitfall 12). El admin del helper de
// fixtures pone y saca cuentas, y lee de afuera el efecto de una escritura rechazada; nunca es el cliente
// de la aserción de RLS (bypassa RLS y daría un falso verde). El caso (b) usa el admin a propósito: el
// índice manda incluso para el service-role.
//
// Cuentas únicas por corrida (`__test_mp_<uuid8>`): el Postgres local es compartido con otras corridas.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

describe.skipIf(!hasSupabaseCreds)('businesses_mp_user_id_key (082): una cuenta de MP por negocio', () => {
  let seeded: SeededTenants
  let sesionA: SupabaseClient
  let sesionB: SupabaseClient
  const run = crypto.randomUUID().slice(0, 8)
  const cuentaX = `__test_mp_${run}_x`
  const cuentaY = `__test_mp_${run}_y`

  async function setCuenta(bizId: string, mpUserId: string | null) {
    const { error } = await seeded.admin.from('businesses').update({ mp_user_id: mpUserId }).eq('id', bizId)
    if (error) throw new Error(`seed: setear mp_user_id falló: ${error.code ?? error.message}`)
  }

  async function cuentaDe(bizId: string) {
    const { data, error } = await seeded.admin.from('businesses').select('mp_user_id').eq('id', bizId).single()
    if (error) throw new Error(`check: leer mp_user_id falló: ${error.code ?? error.message}`)
    return data.mp_user_id as string | null
  }

  beforeAll(async () => {
    seeded = await seedTwoTenants()
    sesionA = createClient(url, anonKey, { auth: { persistSession: false } })
    sesionB = createClient(url, anonKey, { auth: { persistSession: false } })
    const signA = await sesionA.auth.signInWithPassword({ email: seeded.emailA, password: seeded.password })
    if (signA.error) throw new Error(`signIn A falló: ${signA.error.message}`)
    const signB = await sesionB.auth.signInWithPassword({ email: seeded.emailB, password: seeded.password })
    if (signB.error) throw new Error(`signIn B falló: ${signB.error.message}`)
  })

  // Cada caso arranca con los dos negocios sin cuenta.
  beforeEach(async () => {
    await setCuenta(seeded.bizA, null)
    await setCuenta(seeded.bizB, null)
  })

  afterAll(async () => {
    if (seeded) await teardown(seeded)
  })

  it('(a) varios negocios sin cuenta (NULL) conviven, y volver a escribir NULL no choca', async () => {
    const a = await sesionA.from('businesses').update({ mp_user_id: null }).eq('id', seeded.bizA)
    const b = await sesionB.from('businesses').update({ mp_user_id: null }).eq('id', seeded.bizB)
    expect(a.error).toBeNull()
    expect(b.error).toBeNull()
    expect(await cuentaDe(seeded.bizA)).toBeNull()
    expect(await cuentaDe(seeded.bizB)).toBeNull()
  })

  it('(b) service-role: A toma la cuenta X y B no puede tomarla (23505)', async () => {
    const a = await seeded.admin.from('businesses').update({ mp_user_id: cuentaX }).eq('id', seeded.bizA)
    expect(a.error).toBeNull()
    const b = await seeded.admin.from('businesses').update({ mp_user_id: cuentaX }).eq('id', seeded.bizB)
    expect(b.error?.code).toBe('23505')
  })

  it('(c) sesión de B: no ve el negocio de A, igual choca con 23505 y conserva su cuenta anterior', async () => {
    await setCuenta(seeded.bizA, cuentaX)
    await setCuenta(seeded.bizB, cuentaY)

    // RLS: la sesión de B no ve el negocio de A, así que no podría detectar el choque leyendo.
    const ver = await sesionB.from('businesses').select('id').eq('id', seeded.bizA)
    expect(ver.error).toBeNull()
    expect(ver.data).toEqual([])

    const upd = await sesionB
      .from('businesses')
      .update({ mp_user_id: cuentaX, mp_connection_status: 'connected' })
      .eq('id', seeded.bizB)
      .eq('owner_id', seeded.userB)
    expect(upd.error?.code).toBe('23505')

    // El update es atómico: B sigue con su cuenta Y.
    expect(await cuentaDe(seeded.bizB)).toBe(cuentaY)
    expect(await cuentaDe(seeded.bizA)).toBe(cuentaX)
  })

  it('(d) reconexión de la misma cuenta: A vuelve a escribir X en su negocio sin choque', async () => {
    await setCuenta(seeded.bizA, cuentaX)
    const upd = await sesionA
      .from('businesses')
      .update({ mp_user_id: cuentaX, mp_connection_status: 'connected' })
      .eq('id', seeded.bizA)
      .eq('owner_id', seeded.userA)
    expect(upd.error).toBeNull()
    expect(await cuentaDe(seeded.bizA)).toBe(cuentaX)
  })

  it('(e) cuando A suelta la cuenta, B la puede tomar', async () => {
    await setCuenta(seeded.bizA, cuentaX)
    await setCuenta(seeded.bizA, null)
    const upd = await sesionB
      .from('businesses')
      .update({ mp_user_id: cuentaX, mp_connection_status: 'connected' })
      .eq('id', seeded.bizB)
      .eq('owner_id', seeded.userB)
    expect(upd.error).toBeNull()
    expect(await cuentaDe(seeded.bizB)).toBe(cuentaX)
  })
})
