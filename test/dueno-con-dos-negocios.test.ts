import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { hasSupabaseCreds } from './env'
import { seedTwoTenants, teardown, type SeededTenants } from './helpers/supabase-fixtures'
import { cleanupOrThrow } from './helpers/cleanup'

// ── Quick 261124-ubl — un dueño con DOS negocios: las rutas del panel actúan sobre el más viejo ─────
//
// POR QUÉ EXISTE. Desde 261124-neg el panel de un dueño con dos negocios muestra siempre el MÁS VIEJO
// (`negocioDelDueno`: order created_at + limit 1). Pero las rutas de app/api resolvían el negocio por su
// cuenta con `.eq('owner_id', user.id).single()`, y con 2 filas eso da error ⇒ 404: el dueño no podía
// crear un cliente ni desconectar MercadoPago. Peor: el UPDATE de mp_user_id del disconnect filtraba
// SÓLO por owner_id, así que, si la lectura hubiera pasado, desconectaba LOS DOS negocios.
//
// QUÉ CONGELA. Con la sesión real del dueño A (anon key + signInWithPassword → rol authenticated, RLS
// activo), cada ruta actúa sobre bizA (el más viejo) y no toca bizA2 (el más nuevo de A) ni bizB (de
// otro dueño). Pega contra la base porque lo que importa es la elección real de Postgres + RLS, no un
// fake.
//
// SERVICE-ROLE SÓLO PARA SEMBRAR, LIMPIAR Y EL CHEQUEO INDEPENDIENTE DEL EFECTO (Pitfall 12). La
// llamada a la ruta va SIEMPRE con la sesión de A.

const h = vi.hoisted(() => ({
  // Cliente que devuelve `@/lib/supabase/server`: el anon autenticado como el dueño A.
  session: { current: null as SupabaseClient | null },
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => h.session.current,
}))

import { POST as disconnectMpPOST } from '@/app/api/mercadopago/disconnect/route'
import { POST as createClientPOST } from '@/app/api/clients/create/route'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

describe.skipIf(!hasSupabaseCreds)('dueño con dos negocios: las rutas actúan sobre el más viejo (quick 261124-ubl)', () => {
  let seeded: SeededTenants
  let sesionA: SupabaseClient
  let bizA2 = ''
  const run = crypto.randomUUID().slice(0, 8)
  // mp_user_id únicos por corrida: el índice único parcial de la 082 no admite repetidos.
  const cuenta = { a: `__test_ubl_${run}_a`, a2: `__test_ubl_${run}_a2`, b: `__test_ubl_${run}_b` }
  const token = { a: `tok_${run}_a`, a2: `tok_${run}_a2`, b: `tok_${run}_b` }

  async function estadoMp(bizId: string) {
    const biz = await seeded.admin.from('businesses').select('mp_user_id').eq('id', bizId).single()
    if (biz.error) throw new Error(`check: leer businesses falló: ${biz.error.code ?? biz.error.message}`)
    const sec = await seeded.admin
      .from('business_secrets')
      .select('mp_access_token, mp_refresh_token, mp_token_expires_at')
      .eq('business_id', bizId)
      .maybeSingle()
    if (sec.error) throw new Error(`check: leer business_secrets falló: ${sec.error.code ?? sec.error.message}`)
    return { mp_user_id: biz.data.mp_user_id as string | null, secretos: sec.data }
  }

  beforeAll(async () => {
    seeded = await seedTwoTenants()
    const { admin } = seeded

    // bizA2: el segundo negocio de A, 60 s más nuevo que bizA. Se parte del created_at que puso la base
    // (no del reloj de Node, que en Docker puede diferir) para que el orden sea el que se quiere probar.
    const a = await admin.from('businesses').select('created_at').eq('id', seeded.bizA).single()
    if (a.error || !a.data?.created_at) throw new Error(`seed: leer created_at de A falló: ${a.error?.message}`)
    const createdA2 = new Date(new Date(a.data.created_at as string).getTime() + 60_000).toISOString()
    const ins = await admin
      .from('businesses')
      .insert({ owner_id: seeded.userA, slug: `__test_${run}_a2`, name: `__test_${run}_a2`, created_at: createdA2 })
      .select('id')
      .single()
    if (ins.error || !ins.data) throw new Error(`seed: insert bizA2 falló: ${ins.error?.message}`)
    bizA2 = ins.data.id

    // Los tres conectados a MP, con cuentas y tokens distintos.
    for (const [bizId, mp, tok] of [
      [seeded.bizA, cuenta.a, token.a],
      [bizA2, cuenta.a2, token.a2],
      [seeded.bizB, cuenta.b, token.b],
    ] as const) {
      const up = await admin.from('businesses').update({ mp_user_id: mp }).eq('id', bizId)
      if (up.error) throw new Error(`seed: setear mp_user_id falló: ${up.error.code ?? up.error.message}`)
      const sec = await admin.from('business_secrets').upsert(
        {
          business_id: bizId,
          mp_access_token: tok,
          mp_refresh_token: `${tok}_r`,
          mp_token_expires_at: '2031-01-01T00:00:00Z',
        },
        { onConflict: 'business_id' },
      )
      if (sec.error) throw new Error(`seed: upsert business_secrets falló: ${sec.error.code ?? sec.error.message}`)
    }

    sesionA = createClient(url, anonKey, { auth: { persistSession: false } })
    const sign = await sesionA.auth.signInWithPassword({ email: seeded.emailA, password: seeded.password })
    if (sign.error) throw new Error(`signIn A falló: ${sign.error.message}`)
    h.session.current = sesionA
  })

  afterAll(async () => {
    h.session.current = null
    if (sesionA) await sesionA.auth.signOut()
    if (!seeded) return
    try {
      if (bizA2) {
        await cleanupOrThrow(
          'businesses bizA2 del tenant A (CASCADE limpia sus hijos)',
          seeded.admin.from('businesses').delete().eq('id', bizA2),
        )
      }
    } finally {
      await teardown(seeded)
    }
  })

  it('POST /api/mercadopago/disconnect desconecta sólo el más viejo', async () => {
    const res = await disconnectMpPOST()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    const a = await estadoMp(seeded.bizA)
    expect(a.mp_user_id).toBeNull()
    expect(a.secretos).toMatchObject({ mp_access_token: null, mp_refresh_token: null, mp_token_expires_at: null })

    const a2 = await estadoMp(bizA2)
    expect(a2.mp_user_id, 'el negocio más nuevo de A NO se desconecta').toBe(cuenta.a2)
    expect(a2.secretos?.mp_access_token).toBe(token.a2)

    const b = await estadoMp(seeded.bizB)
    expect(b.mp_user_id, 'el negocio de otro dueño no cambia').toBe(cuenta.b)
    expect(b.secretos?.mp_access_token).toBe(token.b)
  })

  it('POST /api/clients/create da de alta el cliente en el más viejo', async () => {
    const nombre = `__test_ubl_${run}_cliente`
    const res = await createClientPOST(
      new Request('http://localhost/api/clients/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nombre, phone: '1155550000' }),
      }),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })

    const creados = await seeded.admin.from('clients').select('business_id').eq('name', nombre)
    if (creados.error) throw new Error(`check: leer clients falló: ${creados.error.code ?? creados.error.message}`)
    expect(creados.data).toEqual([{ business_id: seeded.bizA }])

    const enA2 = await seeded.admin.from('clients').select('id', { count: 'exact', head: true }).eq('business_id', bizA2)
    if (enA2.error) throw new Error(`check: contar clients de bizA2 falló: ${enA2.error.code ?? enA2.error.message}`)
    expect(enA2.count, 'el negocio más nuevo de A sigue sin clientes').toBe(0)
  })
})
