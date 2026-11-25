import { describe, it, expect, vi, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Ida y vuelta de los cuatro route handlers del OAuth (quick 261119-q8v) ─────────────────────
// Carril `pure`: sin red ni Supabase. Nada del helper de entorno de test/, ni fixtures, ni el cliente
// de Supabase (ver test/suite-split.ts). Los proveedores y el session client van mockeados; la lista
// cerrada de `@/lib/oauth-return` NO se mockea: se prueba la real (T-q8v-01).
//
// Se asserta sobre `pathname + search` del `Location`, nunca sobre el host: la base sale del entorno
// que carga vitest.setup.ts y además difiere entre el default de MP y el de Google.
const h = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  mpConfiguredMock: vi.fn(() => true),
  buildMpAuthUrlMock: vi.fn((state: string) => `https://auth.mercadopago.test/authorization?state=${state}`),
  exchangeMpCodeMock: vi.fn(),
  googleConfiguredMock: vi.fn(() => true),
  buildAuthUrlMock: vi.fn((state: string) => `https://accounts.google.test/o/oauth2/auth?state=${state}`),
  exchangeCodeMock: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: h.createClientMock }))
vi.mock('@/lib/mercadopago', () => ({
  mpConnectConfigured: h.mpConfiguredMock,
  buildMpAuthUrl: h.buildMpAuthUrlMock,
  exchangeMpCode: h.exchangeMpCodeMock,
}))
vi.mock('@/lib/google-calendar', () => ({
  googleConfigured: h.googleConfiguredMock,
  buildAuthUrl: h.buildAuthUrlMock,
  exchangeCode: h.exchangeCodeMock,
}))

import { GET as mpConnect } from '@/app/api/mercadopago/connect/route'
import { GET as mpCallback } from '@/app/api/mercadopago/callback/route'
import { GET as googleConnect } from '@/app/api/google/connect/route'
import { GET as googleCallback } from '@/app/api/google/callback/route'
import { MP_ERROR_REASONS } from '@/lib/oauth-return'

// Session client mínimo: el dueño `user-1` con su negocio `biz-1`; updates y upserts sanos. Registra
// cada `eq` sobre `businesses` y cada `upsert` sobre `business_secrets` (IN-01): sin eso, un callback
// que dejara de filtrar por `owner_id` seguiría en verde (T-q8v-03).
//
// Opciones (quick 261124-obs): `updateError` es lo que devuelve el update de businesses (p. ej. el 23505
// del índice de la 082) y `bizRead` lo que devuelve la lectura del negocio. El `eq` del select expone
// SÓLO la cadena `order → limit → maybeSingle` de `negocioDelDueno`, que usan los dos callbacks (MP desde
// 261124-obs, Google desde 261124-ubl); cada paso queda registrado en `readChain`. No expone `single` a
// propósito: una regresión al single de PostgREST tiene que tirar, no pasar en verde.
type FakeOpts = {
  updateError?: { code: string; message: string } | null
  bizRead?: { data: unknown; error: { code: string; message: string } | null }
}
function fakeSupabase(opts: FakeOpts = {}) {
  const eqCalls: Array<{ op: 'select' | 'update'; args: unknown[] }> = []
  const readChain: Array<{ step: 'order' | 'limit' | 'maybeSingle'; args: unknown[] }> = []
  const upserts: unknown[] = []
  const bizRead = opts.bizRead ?? { data: { id: 'biz-1' }, error: null }
  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: vi.fn((table: string) => {
      if (table === 'businesses') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((...args: unknown[]) => {
              eqCalls.push({ op: 'select', args })
              return {
                order: vi.fn((...orderArgs: unknown[]) => {
                  readChain.push({ step: 'order', args: orderArgs })
                  return {
                    limit: vi.fn((...limitArgs: unknown[]) => {
                      readChain.push({ step: 'limit', args: limitArgs })
                      return {
                        maybeSingle: vi.fn(async () => {
                          readChain.push({ step: 'maybeSingle', args: [] })
                          return bizRead
                        }),
                      }
                    }),
                  }
                }),
              }
            }),
          })),
          // Builder encadenable y awaitable: cada `eq` se registra y devuelve el mismo builder.
          update: vi.fn(() => {
            const builder = {
              eq: vi.fn((...args: unknown[]) => {
                eqCalls.push({ op: 'update', args })
                return builder
              }),
              then: (resolve: (v: { error: unknown }) => unknown, reject?: (e: unknown) => unknown) =>
                Promise.resolve({ error: opts.updateError ?? null }).then(resolve, reject),
            }
            return builder
          }),
        }
      }
      // business_secrets
      return {
        upsert: vi.fn(async (payload: unknown) => {
          upserts.push(payload)
          return { error: null }
        }),
      }
    }),
  }
  return Object.assign(client, { eqCalls, readChain, upserts })
}

// Todo `eq` del select sobre `businesses` filtra por el `owner_id` de la sesión; el update filtra por el
// id del negocio resuelto Y por `owner_id` (un callback que soltara owner_id sigue en rojo, T-q8v-03).
// Hubo al menos un `eq` por cada op pedida.
function expectOwnerScoped(sb: ReturnType<typeof fakeSupabase>, ops: Array<'select' | 'update'>) {
  for (const op of ops) expect(sb.eqCalls.some(c => c.op === op), `no hubo ${op} sobre businesses`).toBe(true)
  for (const c of sb.eqCalls.filter(c => c.op === 'select')) expect(c.args).toEqual(['owner_id', 'user-1'])
  if (ops.includes('update')) {
    const updateEqs = sb.eqCalls.filter(c => c.op === 'update').map(c => c.args)
    expect(updateEqs).toContainEqual(['id', 'biz-1'])
    expect(updateEqs).toContainEqual(['owner_id', 'user-1'])
  }
}

// El `motivo` de un Location, si existe, sale de la lista cerrada REAL.
function expectMotivoCerrado(res: Response) {
  const motivo = new URL(res.headers.get('location')!).searchParams.get('motivo')
  if (motivo !== null) expect(MP_ERROR_REASONS as readonly string[]).toContain(motivo)
}

function req(url: string, cookie?: string) {
  return new NextRequest(url, cookie ? { headers: { cookie } } : undefined)
}

// `pathname + search` del Location (sin host).
function dest(res: Response) {
  const loc = res.headers.get('location')
  expect(loc).toBeTruthy()
  const u = new URL(loc!)
  return u.pathname + u.search
}

// Línea `Set-Cookie` de una cookie por nombre.
function setCookieLine(res: Response, name: string) {
  return res.headers.getSetCookie().find(l => l.startsWith(`${name}=`))
}

// «Borrada» = valor vacío o expiración en el pasado.
function expectDeleted(res: Response, name: string) {
  const line = setCookieLine(res, name)
  expect(line, `${name} no se borró`).toBeTruthy()
  const value = line!.slice(name.length + 1).split(';')[0]
  const expires = /expires=([^;]+)/i.exec(line!)?.[1]
  const pasado = expires ? new Date(expires).getTime() <= Date.now() : false
  expect(value === '' || pasado).toBe(true)
}

function expectOAuthCookieAttrs(res: Response, name: string) {
  const line = setCookieLine(res, name)
  expect(line, `${name} no se seteó`).toBeTruthy()
  expect(line!).toMatch(/HttpOnly/i)
  expect(line!).toMatch(/SameSite=lax/i)
  expect(line!).toMatch(/Max-Age=600/i)
  expect(line!).toMatch(/Path=\/(;|$)/i)
}

const cookieValue = (res: Response, name: string) => setCookieLine(res, name)?.slice(name.length + 1).split(';')[0]

afterEach(() => {
  vi.clearAllMocks()
  h.mpConfiguredMock.mockReturnValue(true)
  h.googleConfiguredMock.mockReturnValue(true)
})

const MP_CONNECT = 'https://gestion.forjo.studio/api/mercadopago/connect'
const MP_CALLBACK = 'https://gestion.forjo.studio/api/mercadopago/callback?code=abc&state=xyz'
const G_CONNECT = 'https://gestion.forjo.studio/api/google/connect'
const G_CALLBACK = 'https://gestion.forjo.studio/api/google/callback?code=abc&state=xyz'

// ── MercadoPago connect ──────────────────────────────────────────────────────────────────────────
describe('MP connect', () => {
  it('?from=onboarding → va a la autorización de MP y guarda el token en mp_oauth_from', async () => {
    h.createClientMock.mockResolvedValue(fakeSupabase())
    const res = await mpConnect(req(`${MP_CONNECT}?from=onboarding`))

    expect(res.headers.get('location')).toMatch(/^https:\/\/auth\.mercadopago\.test\/authorization\?state=/)
    expect(h.buildMpAuthUrlMock).toHaveBeenCalledTimes(1)
    expect(cookieValue(res, 'mp_oauth_from')).toBe('onboarding')
    expectOAuthCookieAttrs(res, 'mp_oauth_from')
    // El state anti-CSRF sigue igual: misma cookie, mismos atributos, y es el que viaja a MP.
    expectOAuthCookieAttrs(res, 'mp_oauth_state')
    expect(cookieValue(res, 'mp_oauth_state')).toBe(h.buildMpAuthUrlMock.mock.calls[0][0])
  })

  it.each([
    ['sin from', ''],
    ['from=agenda (MP no lo acepta)', '?from=agenda'],
    ['from=https://evil.example', '?from=https%3A%2F%2Fevil.example'],
  ])('%s → mp_oauth_from=negocio', async (_label, qs) => {
    h.createClientMock.mockResolvedValue(fakeSupabase())
    const res = await mpConnect(req(`${MP_CONNECT}${qs}`))
    expect(cookieValue(res, 'mp_oauth_from')).toBe('negocio')
  })

  it('sin configuración y ?from=onboarding → /onboarding/integraciones?mp=error', async () => {
    h.mpConfiguredMock.mockReturnValue(false)
    const res = await mpConnect(req(`${MP_CONNECT}?from=onboarding`))
    expect(dest(res)).toBe('/onboarding/integraciones?mp=error')
  })
})

// ── MercadoPago callback ─────────────────────────────────────────────────────────────────────────
describe('MP callback', () => {
  const tokens = { access_token: 'at', refresh_token: 'rt', user_id: 12345, expires_in: 3600 }

  it('cookie mp_oauth_from=onboarding y flujo sano → /onboarding/integraciones?mp=connected y borra las cookies', async () => {
    const sb = fakeSupabase()
    h.createClientMock.mockResolvedValue(sb)
    h.exchangeMpCodeMock.mockResolvedValue(tokens)
    const res = await mpCallback(req(MP_CALLBACK, 'mp_oauth_state=xyz; mp_oauth_from=onboarding'))

    expect(dest(res)).toBe('/onboarding/integraciones?mp=connected')
    expectDeleted(res, 'mp_oauth_from')
    expectDeleted(res, 'mp_oauth_state')
    // Tenant (T-q8v-03): el negocio se lee y se actualiza por el owner_id de la sesión, y los
    // secretos van al business_id que salió de esa lectura.
    expectOwnerScoped(sb, ['select', 'update'])
    expect(sb.upserts).toEqual([expect.objectContaining({ business_id: 'biz-1' })])
  })

  it('sin la cookie mp_oauth_state → /onboarding/integraciones?mp=error sin canjear el code', async () => {
    h.createClientMock.mockResolvedValue(fakeSupabase())
    const res = await mpCallback(req(MP_CALLBACK, 'mp_oauth_from=onboarding'))

    expect(dest(res)).toBe('/onboarding/integraciones?mp=error')
    expect(h.exchangeMpCodeMock).not.toHaveBeenCalled()
    expectDeleted(res, 'mp_oauth_from')
  })

  it.each([
    ['sin mp_oauth_from', 'mp_oauth_state=xyz'],
    ['con mp_oauth_from=__proto__', 'mp_oauth_state=xyz; mp_oauth_from=__proto__'],
  ])('%s → /negocio?mp=connected (el panel no cambia)', async (_label, cookie) => {
    h.createClientMock.mockResolvedValue(fakeSupabase())
    h.exchangeMpCodeMock.mockResolvedValue(tokens)
    const res = await mpCallback(req(MP_CALLBACK, cookie))
    expect(dest(res)).toBe('/negocio?mp=connected')
  })

  it('state distinto de la cookie → /onboarding/integraciones?mp=error sin canjear el code', async () => {
    h.createClientMock.mockResolvedValue(fakeSupabase())
    const res = await mpCallback(req(MP_CALLBACK, 'mp_oauth_state=otro; mp_oauth_from=onboarding'))

    expect(dest(res)).toBe('/onboarding/integraciones?mp=error')
    expect(h.exchangeMpCodeMock).not.toHaveBeenCalled()
    expectDeleted(res, 'mp_oauth_from')
  })

  // ── Cuenta de MP ya conectada a otro negocio (quick 261124-obs, migración 082) ──
  const dup = { code: '23505', message: 'duplicate key value violates unique constraint "businesses_mp_user_id_key"' }

  it.each([
    ['mp_oauth_from=onboarding', 'mp_oauth_state=xyz; mp_oauth_from=onboarding', '/onboarding/integraciones?mp=error&motivo=cuenta-en-uso'],
    ['sin mp_oauth_from', 'mp_oauth_state=xyz', '/negocio?mp=error&motivo=cuenta-en-uso'],
  ])('update con 23505 y %s → %s, sin secretos y con las cookies borradas', async (_label, cookie, expected) => {
    const sb = fakeSupabase({ updateError: dup })
    h.createClientMock.mockResolvedValue(sb)
    h.exchangeMpCodeMock.mockResolvedValue(tokens)
    const res = await mpCallback(req(MP_CALLBACK, cookie))

    expect(dest(res)).toBe(expected)
    expectMotivoCerrado(res)
    // Nada de la cuenta rechazada llega a business_secrets: el negocio conserva sus tokens anteriores.
    expect(sb.upserts).toEqual([])
    expectDeleted(res, 'mp_oauth_state')
    expectDeleted(res, 'mp_oauth_from')
  })

  it('update con otro error (42501) → /negocio?mp=error sin motivo y sin secretos', async () => {
    const sb = fakeSupabase({ updateError: { code: '42501', message: 'permission denied' } })
    h.createClientMock.mockResolvedValue(sb)
    h.exchangeMpCodeMock.mockResolvedValue(tokens)
    const res = await mpCallback(req(MP_CALLBACK, 'mp_oauth_state=xyz'))

    expect(dest(res)).toBe('/negocio?mp=error')
    expect(sb.upserts).toEqual([])
  })

  it('flujo sano → lee el negocio más viejo con maybeSingle y el update va por id + owner_id', async () => {
    const sb = fakeSupabase()
    h.createClientMock.mockResolvedValue(sb)
    h.exchangeMpCodeMock.mockResolvedValue(tokens)
    const res = await mpCallback(req(MP_CALLBACK, 'mp_oauth_state=xyz'))

    expect(dest(res)).toBe('/negocio?mp=connected')
    expectMotivoCerrado(res)
    // Nunca el single de PostgREST: con dos negocios del mismo dueño daba error y no conectaba.
    expect(sb.readChain).toEqual([
      { step: 'order', args: ['created_at', { ascending: true }] },
      { step: 'limit', args: [1] },
      { step: 'maybeSingle', args: [] },
    ])
    expectOwnerScoped(sb, ['select', 'update'])
    const updateEqs = sb.eqCalls.filter(c => c.op === 'update').map(c => c.args)
    expect(updateEqs).toEqual([['id', 'biz-1'], ['owner_id', 'user-1']])
    expect(sb.upserts).toEqual([expect.objectContaining({ business_id: 'biz-1', mp_access_token: 'at' })])
  })

  it.each([
    ['falla la lectura', { data: null, error: { code: 'PGRST000', message: 'boom' } }],
    ['el dueño no tiene negocio', { data: null, error: null }],
  ])('%s → /negocio?mp=error sin update ni upsert', async (_label, bizRead) => {
    const sb = fakeSupabase({ bizRead })
    h.createClientMock.mockResolvedValue(sb)
    h.exchangeMpCodeMock.mockResolvedValue(tokens)
    const res = await mpCallback(req(MP_CALLBACK, 'mp_oauth_state=xyz'))

    expect(dest(res)).toBe('/negocio?mp=error')
    expect(sb.eqCalls.some(c => c.op === 'update')).toBe(false)
    expect(sb.upserts).toEqual([])
  })
})

// ── Google connect ───────────────────────────────────────────────────────────────────────────────
describe('Google connect', () => {
  it.each([
    ['?from=onboarding', 'onboarding', '?from=onboarding'],
    ['?from=negocio', 'negocio', '?from=negocio'],
    ['sin from', 'agenda', ''],
    ['?from=//evil.example', 'agenda', '?from=%2F%2Fevil.example'],
    ['?from=__proto__', 'agenda', '?from=__proto__'],
  ])('%s → g_oauth_from=%s', async (_label, expected, qs) => {
    h.createClientMock.mockResolvedValue(fakeSupabase())
    const res = await googleConnect(req(`${G_CONNECT}${qs}`))
    expect(res.headers.get('location')).toMatch(/^https:\/\/accounts\.google\.test\//)
    expect(cookieValue(res, 'g_oauth_from')).toBe(expected)
    expectOAuthCookieAttrs(res, 'g_oauth_from')
  })

  it('sin configuración y ?from=onboarding → /onboarding/integraciones?google=error', async () => {
    h.googleConfiguredMock.mockReturnValue(false)
    const res = await googleConnect(req(`${G_CONNECT}?from=onboarding`))
    expect(dest(res)).toBe('/onboarding/integraciones?google=error')
  })
})

// ── Google callback ──────────────────────────────────────────────────────────────────────────────
describe('Google callback', () => {
  it.each([
    ['g_oauth_from=onboarding', '/onboarding/integraciones?google=connected', 'g_oauth_state=xyz; g_oauth_from=onboarding'],
    ['sin g_oauth_from', '/agenda?google=connected', 'g_oauth_state=xyz'],
    ['g_oauth_from=negocio', '/negocio?google=connected', 'g_oauth_state=xyz; g_oauth_from=negocio'],
    ['g_oauth_from=__proto__', '/agenda?google=connected', 'g_oauth_state=xyz; g_oauth_from=__proto__'],
  ])('%s → %s', async (_label, expected, cookie) => {
    const sb = fakeSupabase()
    h.createClientMock.mockResolvedValue(sb)
    h.exchangeCodeMock.mockResolvedValue({ refresh_token: 'rt' })
    const res = await googleCallback(req(G_CALLBACK, cookie))
    expect(dest(res)).toBe(expected)
    expectDeleted(res, 'g_oauth_from')
    expectDeleted(res, 'g_oauth_state')
    expectOwnerScoped(sb, ['select'])
    expect(sb.upserts).toEqual([{ business_id: 'biz-1', google_refresh_token: 'rt' }])
  })

  it('flujo sano → lee el negocio más viejo con maybeSingle, nunca con single (quick 261124-ubl)', async () => {
    const sb = fakeSupabase()
    h.createClientMock.mockResolvedValue(sb)
    h.exchangeCodeMock.mockResolvedValue({ refresh_token: 'rt' })
    const res = await googleCallback(req(G_CALLBACK, 'g_oauth_state=xyz'))

    expect(dest(res)).toBe('/agenda?google=connected')
    // Con el single de PostgREST, un dueño con dos negocios no podía conectar Google (2+ filas = error).
    expect(sb.readChain).toEqual([
      { step: 'order', args: ['created_at', { ascending: true }] },
      { step: 'limit', args: [1] },
      { step: 'maybeSingle', args: [] },
    ])
    expect(sb.upserts).toEqual([{ business_id: 'biz-1', google_refresh_token: 'rt' }])
  })

  it.each([
    ['falla la lectura', { data: null, error: { code: 'PGRST000', message: 'boom' } }],
    ['el dueño no tiene negocio', { data: null, error: null }],
  ])('%s → /agenda?google=error sin upsert', async (_label, bizRead) => {
    const sb = fakeSupabase({ bizRead })
    h.createClientMock.mockResolvedValue(sb)
    h.exchangeCodeMock.mockResolvedValue({ refresh_token: 'rt' })
    const res = await googleCallback(req(G_CALLBACK, 'g_oauth_state=xyz'))

    expect(dest(res)).toBe('/agenda?google=error')
    expect(sb.upserts).toEqual([])
    expectDeleted(res, 'g_oauth_state')
  })

  it('sin la cookie g_oauth_state → /onboarding/integraciones?google=error sin canjear el code', async () => {
    h.createClientMock.mockResolvedValue(fakeSupabase())
    const res = await googleCallback(req(G_CALLBACK, 'g_oauth_from=onboarding'))
    expect(dest(res)).toBe('/onboarding/integraciones?google=error')
    expect(h.exchangeCodeMock).not.toHaveBeenCalled()
    expectDeleted(res, 'g_oauth_from')
  })

  it.each([
    ['onboarding', '/onboarding/integraciones?google=error'],
    ['negocio', '/negocio?google=error'],
  ])('state inválido con g_oauth_from=%s → %s sin canjear el code', async (from, expected) => {
    h.createClientMock.mockResolvedValue(fakeSupabase())
    const res = await googleCallback(req(G_CALLBACK, `g_oauth_state=otro; g_oauth_from=${from}`))
    expect(dest(res)).toBe(expected)
    expect(h.exchangeCodeMock).not.toHaveBeenCalled()
  })
})
