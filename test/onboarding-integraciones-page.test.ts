import { describe, it, expect, vi, afterEach } from 'vitest'

// ── Quick 261119-q8v, WR-03: la page del paso 5 nunca manda al wizard a un dueño que ya tiene negocio ─
//
// `/onboarding/integraciones` aparece justo después de crear el negocio y es adonde vuelven los dos
// OAuth. El wizard (`/onboarding`) no verifica si el usuario ya tiene negocio, así que mandar ahí a un
// dueño que SÍ lo tiene abre la puerta a un segundo negocio (no hay unique en `owner_id`).
//
// Lo que este test congela:
// - 0 filas (sin error)            → `/onboarding` (el único caso que corresponde al wizard).
// - error de lectura (red, PostgREST) o más de una fila (PostgREST devuelve error con `maybeSingle`)
//                                  → `/dashboard`, nunca `/onboarding`.
// - el negocio se busca por `owner_id` de la sesión (T-q8v-03).
//
// Carril `pure`: Supabase, los helpers de configuración y el cliente de la pantalla van mockeados.
const h = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  integrationStatusMock: vi.fn(async () => ({ mercadopago: false, google: true })),
}))

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: h.createClientMock }))
vi.mock('@/lib/mercadopago', () => ({ mpConnectConfigured: () => true }))
vi.mock('@/lib/google-calendar', () => ({ googleConfigured: () => true }))
vi.mock('@/lib/business-secrets', () => ({ getBusinessIntegrationStatus: h.integrationStatusMock }))
vi.mock('@/app/(onboarding)/onboarding/integraciones/integraciones-client', () => ({
  IntegracionesClient: () => null,
}))

import IntegracionesPage from '@/app/(onboarding)/onboarding/integraciones/page'

type Lectura = { data: unknown; error: { code?: string; message: string } | null }

/**
 * Session client con la lectura de `businesses` según lo que devolvería PostgREST en cada método:
 * `.single()` da error con 0 filas; `.maybeSingle()` da `data: null` sin error con 0 filas. Con 2+ filas
 * los dos dan error (PGRST116).
 */
function fakeSupabase({ single, maybeSingle }: { single: Lectura; maybeSingle: Lectura }) {
  const eqCalls: unknown[][] = []
  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn((...args: unknown[]) => {
          eqCalls.push(args)
          return { single: vi.fn(async () => single), maybeSingle: vi.fn(async () => maybeSingle) }
        }),
      })),
    })),
  }
  return { client, eqCalls }
}

async function destino(): Promise<string | null> {
  try {
    await IntegracionesPage()
    return null
  } catch (e) {
    const m = /^REDIRECT:(.*)$/.exec(e instanceof Error ? e.message : '')
    if (!m) throw e
    return m[1]
  }
}

const NEGOCIO = { id: 'biz-1', vertical: 'general', type: null, mp_user_id: '123', mp_connection_status: 'connected' }
const CERO_FILAS = { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('IntegracionesPage: resolución del negocio (WR-03)', () => {
  it('sin negocio (0 filas) → /onboarding', async () => {
    const { client } = fakeSupabase({
      single: { data: null, error: CERO_FILAS },
      maybeSingle: { data: null, error: null },
    })
    h.createClientMock.mockResolvedValue(client)
    expect(await destino()).toBe('/onboarding')
  })

  it.each([
    ['error transitorio de lectura', { message: 'fetch failed' }],
    ['más de un negocio del mismo dueño', CERO_FILAS],
  ])('%s → /dashboard, nunca al wizard', async (_label, error) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeSupabase({
      single: { data: null, error },
      maybeSingle: { data: null, error },
    })
    h.createClientMock.mockResolvedValue(client)
    expect(await destino()).toBe('/dashboard')
  })

  it('con negocio → renderiza la pantalla con los booleanos del server, buscando por owner_id', async () => {
    const { client, eqCalls } = fakeSupabase({
      single: { data: NEGOCIO, error: null },
      maybeSingle: { data: NEGOCIO, error: null },
    })
    h.createClientMock.mockResolvedValue(client)
    const el = (await IntegracionesPage()) as { props: Record<string, unknown> }
    expect(eqCalls).toEqual([['owner_id', 'user-1']])
    expect(h.integrationStatusMock).toHaveBeenCalledWith('biz-1')
    expect(el.props).toMatchObject({ mpEnabled: true, mpConnected: true, googleEnabled: true, googleConnected: true })
  })
})
