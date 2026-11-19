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

// Session client mínimo: el dueño `user-1` con su negocio `biz-1`; updates y upserts sanos.
function fakeSupabase() {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: vi.fn((table: string) => {
      if (table === 'businesses') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: 'biz-1' } })) })),
          })),
          update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
        }
      }
      // business_secrets
      return { upsert: vi.fn(async () => ({ error: null })) }
    }),
  }
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
    h.createClientMock.mockResolvedValue(fakeSupabase())
    h.exchangeMpCodeMock.mockResolvedValue(tokens)
    const res = await mpCallback(req(MP_CALLBACK, 'mp_oauth_state=xyz; mp_oauth_from=onboarding'))

    expect(dest(res)).toBe('/onboarding/integraciones?mp=connected')
    expectDeleted(res, 'mp_oauth_from')
    expectDeleted(res, 'mp_oauth_state')
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
  ])('%s → %s', async (_label, expected, cookie) => {
    h.createClientMock.mockResolvedValue(fakeSupabase())
    h.exchangeCodeMock.mockResolvedValue({ refresh_token: 'rt' })
    const res = await googleCallback(req(G_CALLBACK, cookie))
    expect(dest(res)).toBe(expected)
    expectDeleted(res, 'g_oauth_from')
    expectDeleted(res, 'g_oauth_state')
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
