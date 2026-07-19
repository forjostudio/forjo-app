import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'

// ── Resolver de token de MercadoPago Connect (getValidMpAccessToken) ──────────────────────────
// Espeja el patrón de mocks de webhook-deposit / mp-connection: interceptamos las dependencias del
// resolver para asertar el observable SIN tocar MP ni la DB reales.
//   - @/lib/mercadopago (refreshMpToken): simula que MP acepta o rechaza el refresh.
//   - @/lib/supabase/admin (createAdminClient): la persistencia del token rotado a business_secrets;
//     su .update().eq() resuelve { error } o { error: null } según el caso (persist-fail vs OK).
//   - @/lib/mp-connection (setMpConnectionStatus): spy del flag de estado; asertamos las llamadas
//     (o no-llamadas) con el business.id correcto (D-09).
// Los spies van por vi.hoisted porque las factories de vi.mock se izan por encima de los imports.
const { refreshMock, setStatusMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  setStatusMock: vi.fn(),
}))

vi.mock('@/lib/mercadopago', () => ({ refreshMpToken: refreshMock }))
vi.mock('@/lib/mp-connection', () => ({ setMpConnectionStatus: setStatusMock }))

// Admin client falso: .from('business_secrets').update(payload).eq('business_id', id) → { error }.
let persistEqSpy: Mock<(col: string, val: unknown) => unknown>
let updateSpy: Mock<(payload: Record<string, unknown>) => unknown>
let fakeAdmin: { from: ReturnType<typeof vi.fn> }
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => fakeAdmin,
}))

import { getValidMpAccessToken } from '@/lib/payment'

function buildFakeAdmin(persistError: unknown = null) {
  persistEqSpy = vi.fn(() => Promise.resolve({ error: persistError }))
  updateSpy = vi.fn(() => ({ eq: persistEqSpy }))
  fakeAdmin = { from: vi.fn(() => ({ update: updateSpy })) }
}

// Vence en 1 min → cae dentro de la ventana de 24h y fuerza el refresh.
const SOON = new Date(Date.now() + 60 * 1000).toISOString()
// Vence en 48h → token sano, NO refresca.
const HEALTHY = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

const OAUTH_BIZ = {
  id: 'biz-1',
  mp_access_token: 'current-tok',
  mp_refresh_token: 'rt-old',
  mp_token_expires_at: SOON,
}

beforeEach(() => {
  buildFakeAdmin()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('getValidMpAccessToken — fin del fallback mudo (MPCONN-01/02, D-05)', () => {
  it('refresh rechazado (refreshMpToken→null) → devuelve null y marca error; nunca el token vencido', async () => {
    refreshMock.mockResolvedValue(null)

    const result = await getValidMpAccessToken(OAUTH_BIZ)

    expect(result).toBeNull()
    expect(result).not.toBe('current-tok')
    expect(setStatusMock).toHaveBeenCalledWith('biz-1', 'error')
  })

  it('refresh OK pero persist FALLA → devuelve null y marca error; nunca el token nuevo', async () => {
    refreshMock.mockResolvedValue({ access_token: 'new-tok', refresh_token: 'rt-new', expires_in: 3600 })
    buildFakeAdmin({ message: 'column missing' })

    const result = await getValidMpAccessToken(OAUTH_BIZ)

    expect(result).toBeNull()
    expect(result).not.toBe('new-tok')
    expect(setStatusMock).toHaveBeenCalledWith('biz-1', 'error')
    expect(setStatusMock).not.toHaveBeenCalledWith('biz-1', 'connected')
  })

  it('refresh OK + persist OK → devuelve el token nuevo y auto-sana (connected)', async () => {
    refreshMock.mockResolvedValue({ access_token: 'new-tok', refresh_token: 'rt-new', expires_in: 3600 })

    const result = await getValidMpAccessToken(OAUTH_BIZ)

    expect(result).toBe('new-tok')
    expect(updateSpy).toHaveBeenCalled()
    expect(persistEqSpy).toHaveBeenCalledWith('business_id', 'biz-1')
    expect(setStatusMock).toHaveBeenCalledWith('biz-1', 'connected')
    expect(setStatusMock).not.toHaveBeenCalledWith('biz-1', 'error')
  })

  it('token sano (expira a >24h) → devuelve el actual, NO refresca ni escribe el flag', async () => {
    const result = await getValidMpAccessToken({ ...OAUTH_BIZ, mp_token_expires_at: HEALTHY })

    expect(result).toBe('current-tok')
    expect(refreshMock).not.toHaveBeenCalled()
    expect(setStatusMock).not.toHaveBeenCalled()
  })

  it('token manual (sin mp_refresh_token) → devuelve el actual, NO refresca ni escribe el flag', async () => {
    const result = await getValidMpAccessToken({
      id: 'biz-1',
      mp_access_token: 'manual-tok',
      mp_refresh_token: null,
      mp_token_expires_at: null,
    })

    expect(result).toBe('manual-tok')
    expect(refreshMock).not.toHaveBeenCalled()
    expect(setStatusMock).not.toHaveBeenCalled()
  })
})
