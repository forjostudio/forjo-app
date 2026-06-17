import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { makeWebhookRequest } from './helpers/next-request'
import { craftSignature } from './helpers/mp-signature'

// ── Mocks de módulos ──────────────────────────────────────────────────────────
// A DIFERENCIA del webhook de seña (que usa fetch crudo), el de SUSCRIPCIÓN llama a MP vía `mpFetch`
// (route.ts:47,67,88). Por eso acá el target de mock es @/lib/mercadopago.mpFetch, NO global.fetch.
// Mock PARCIAL (importOriginal): mockeamos SOLO mpFetch y preservamos verifyMPSignature +
// getMPWebhookSecret REALES — la firma debe verificarse de verdad o el test daría falsa seguridad (T-05-02).
vi.mock('@/lib/mercadopago', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mercadopago')>()
  return {
    ...actual,
    mpFetch: vi.fn().mockResolvedValue({ status: 'authorized', id: 'sub', external_reference: 'biz' }),
  }
})

// Admin client falso: acepta update().eq() y select()...single() sin tocar la DB real.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: vi.fn(() => ({
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null }) }),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: {} }),
    })),
  }),
}))

// `after()` de next/server tira "called outside a request scope" fuera del request lifecycle de Next
// (igual que en el webhook de seña). Para los tests de firma basta con que no rompa: la firma se valida
// ANTES de after(), así que el status (401/200) no depende del callback. Mockeamos after a un drenado
// best-effort para que el 200 no explote.
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return {
    ...actual,
    after: (cb: () => unknown) => {
      Promise.resolve().then(() => cb()).catch(() => {})
    },
  }
})

// Secret de test seteado antes del import del handler (MP_MODE se captura en module-load → default
// 'production' → lee MP_WEBHOOK_SECRET).
const SECRET = 'test_webhook_secret_subscription'
process.env.MP_WEBHOOK_SECRET = SECRET

import { POST } from '@/app/api/subscription/webhook/route'

const BASE = 'https://gestion.forjo.studio/api/subscription/webhook'

beforeEach(() => {
  vi.stubEnv('MP_WEBHOOK_SECRET', SECRET)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('webhook de suscripción — verificación de firma', () => {
  it('sin x-signature → 401', async () => {
    const req = makeWebhookRequest({
      baseUrl: BASE,
      dataIdQuery: 'sub-1',
      body: { type: 'subscription_preapproval', data: { id: 'sub-1' } },
    })
    // POST de suscripción toma UN solo arg (NextRequest), sin params (diverge del de seña).
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('x-signature con v1 de un secret equivocado → 401', async () => {
    const { xSignature, xRequestId } = craftSignature({ secret: 'secret_equivocado', dataId: 'sub-1', requestId: 'req-1' })
    const req = makeWebhookRequest({
      baseUrl: BASE,
      dataIdQuery: 'sub-1',
      xSignature,
      xRequestId,
      body: { type: 'subscription_preapproval', data: { id: 'sub-1' } },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('firma válida → 200', async () => {
    const { xSignature, xRequestId } = craftSignature({ secret: SECRET, dataId: 'sub-1', requestId: 'req-1' })
    const req = makeWebhookRequest({
      baseUrl: BASE,
      dataIdQuery: 'sub-1',
      xSignature,
      xRequestId,
      body: { type: 'subscription_preapproval', data: { id: 'sub-1' } },
    })
    const res = await POST(req)
    expect(res.status).toBe(200) // firma válida verificada con HMAC real; mpFetch mockeado, cero red
  })
})
