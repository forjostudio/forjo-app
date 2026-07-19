import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'

// ── Mock del admin client ─────────────────────────────────────────────────────────────────
// setMpConnectionStatus escribe con service-role (createAdminClient). Mockeamos @/lib/supabase/admin
// para (a) no tocar la DB real y (b) registrar .update(payload) / .eq(col, val) y asertar que la
// escritura queda keyed por business_id (columna `id`), nunca por un id del cliente (T-01-01 / D-09).
let updateSpy: Mock<(payload: Record<string, unknown>) => unknown>
let eqSpy: Mock<(col: string, val: unknown) => unknown>
let fakeAdmin: { from: ReturnType<typeof vi.fn> }

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => fakeAdmin,
}))

import { setMpConnectionStatus } from '@/lib/mp-connection'
import { buildMpAuthUrl } from '@/lib/mercadopago'

// Arma un admin falso cuyo .from().update(payload).eq(col, val) resuelve a `eqResult`
// (o rechaza si `reject` es true), registrando las llamadas en los spies.
function buildFakeAdmin(opts: { eqResult?: { error: unknown }; reject?: boolean } = {}) {
  eqSpy = vi.fn(() => {
    if (opts.reject) return Promise.reject(new Error('db down'))
    return Promise.resolve(opts.eqResult ?? { error: null })
  })
  updateSpy = vi.fn(() => ({ eq: eqSpy }))
  fakeAdmin = { from: vi.fn(() => ({ update: updateSpy })) }
}

beforeEach(() => {
  buildFakeAdmin()
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('setMpConnectionStatus', () => {
  it('escribe mp_connection_status filtrando por .eq(\'id\', businessId) — keyed por business_id', async () => {
    await setMpConnectionStatus('biz-1', 'error')

    expect(fakeAdmin.from).toHaveBeenCalledWith('businesses')
    expect(updateSpy).toHaveBeenCalledWith({ mp_connection_status: 'error' })
    expect(eqSpy).toHaveBeenCalledWith('id', 'biz-1')
  })

  it('acepta el estado \'connected\' (auto-sanar)', async () => {
    await setMpConnectionStatus('biz-2', 'connected')
    expect(updateSpy).toHaveBeenCalledWith({ mp_connection_status: 'connected' })
    expect(eqSpy).toHaveBeenCalledWith('id', 'biz-2')
  })

  it('es best-effort: si el update rechaza (throw), NO lanza y se resuelve', async () => {
    buildFakeAdmin({ reject: true })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(setMpConnectionStatus('biz-3', 'error')).resolves.toBeUndefined()
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('[mp/connection]'),
      expect.anything(),
    )
  })

  it('es best-effort: si el update devuelve { error }, NO lanza y loguea', async () => {
    buildFakeAdmin({ eqResult: { error: { message: 'column missing' } } })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(setMpConnectionStatus('biz-4', 'error')).resolves.toBeUndefined()
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('[mp/connection]'),
      expect.anything(),
    )
  })
})

describe('buildMpAuthUrl scope (D-07)', () => {
  it('incluye scope=offline_access read write (garantiza refresh_token)', () => {
    const url = buildMpAuthUrl('some-state')
    // URLSearchParams codifica los espacios como '+'.
    expect(url).toContain('scope=offline_access+read+write')

    // Asegura que el scope llega parseado correctamente al leerlo de vuelta.
    const parsed = new URL(url)
    expect(parsed.searchParams.get('scope')).toBe('offline_access read write')
  })
})
