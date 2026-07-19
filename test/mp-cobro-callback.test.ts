import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── 401 en el cobro + heal del callback OAuth (D-04/D-06, MPCONN-05/06) ───────────────────────
// Mocks izados (vi.hoisted) porque las factories de vi.mock corren antes de los imports:
//   - @/lib/mp-connection (setMpConnectionStatus): spy del flag; asertamos el marcado a 'error'.
//   - @/lib/mercadopago (exchangeMpCode, refreshMpToken): canje del callback; refresh no se usa
//     en el caso 401 (token manual), pero payment.ts lo importa → hay que exportarlo igual.
//   - @/lib/supabase/server (createClient): session client owner-scoped del callback.
//   - @/lib/supabase/admin (createAdminClient): no se toca en el caso 401 (return antes), mock benigno.
const h = vi.hoisted(() => ({
  setStatusMock: vi.fn(),
  exchangeMock: vi.fn(),
  refreshMock: vi.fn(),
  createClientMock: vi.fn(),
}))

vi.mock('@/lib/mp-connection', () => ({ setMpConnectionStatus: h.setStatusMock }))
vi.mock('@/lib/mercadopago', () => ({
  exchangeMpCode: h.exchangeMock,
  refreshMpToken: h.refreshMock,
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: h.createClientMock }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
  }),
}))

import { createDepositPreference } from '@/lib/payment'
import { GET } from '@/app/api/mercadopago/callback/route'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('createDepositPreference — 401 del cobro (D-04, MPCONN-06)', () => {
  it('POST a /checkout/preferences → 401 → marca conexión error y devuelve ok:false', async () => {
    // Token manual (sin refresh_token) → getValidMpAccessToken devuelve el actual sin refrescar.
    const business = {
      id: 'biz-1',
      name: 'Estudio Test',
      slug: 'estudio-test',
      mp_access_token: 'manual-tok',
      mp_refresh_token: null,
      mp_token_expires_at: null,
      deposit_amount: 1500,
      deposit_expiry_hours: 1,
    }
    const appt = { id: 'appt-1', client_name: 'Cliente', client_email: null, services: { name: 'Corte' } }

    // MP responde 401 (token inválido/revocado).
    const fetchMock = vi.fn().mockResolvedValue({ status: 401, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    const result = await createDepositPreference(appt, business)

    expect(result.ok).toBe(false)
    expect(h.setStatusMock).toHaveBeenCalledWith('biz-1', 'error')
    expect(fetchMock).toHaveBeenCalled()
  })
})

describe('callback OAuth — heal del flag (D-06, MPCONN-05)', () => {
  it('reconexión exitosa escribe mp_connection_status: connected en el update owner-scoped', async () => {
    const bizUpdateSpy = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }))
    const fakeSupabase = {
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
      from: vi.fn((table: string) => {
        if (table === 'businesses') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: 'biz-1' } })) })),
            })),
            update: bizUpdateSpy,
          }
        }
        // business_secrets
        return { upsert: vi.fn(async () => ({ error: null })) }
      }),
    }
    h.createClientMock.mockResolvedValue(fakeSupabase)
    h.exchangeMock.mockResolvedValue({
      access_token: 'at',
      refresh_token: 'rt',
      user_id: 12345,
      expires_in: 3600,
    })

    // state en query == cookie mp_oauth_state → pasa la validación de CSRF.
    const req = new NextRequest(
      'https://gestion.forjo.studio/api/mercadopago/callback?code=abc&state=xyz',
      { headers: { cookie: 'mp_oauth_state=xyz' } },
    )

    await GET(req)

    expect(bizUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ mp_user_id: '12345', mp_connection_status: 'connected' }),
    )
  })
})
