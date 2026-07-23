import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { makeWebhookRequest } from './helpers/next-request'
import { craftSignature } from './helpers/mp-signature'

// ── Mocks de módulos ──────────────────────────────────────────────────────────
// El webhook de SEÑA usa `fetch` CRUDO a /v1/payments/{id} (route.ts:93), NO mpFetch (Pitfall 2 /
// Pitfall 13 del milestone). Por eso interceptamos global.fetch, no @/lib/mercadopago. Y NO mockeamos
// @/lib/mercadopago: verifyMPSignature debe correr DE VERDAD contra el secret de test (si lo mockeáramos
// la verificación de firma quedaría saltada y el test daría falsa seguridad — T-05-02).
//
// Mockeamos el admin client para (a) no tocar la DB real y (b) registrar las llamadas a .update(...)
// y poder asertar el efecto del chequeo de monto (T-05-03). El resto de side-effects (email, calendar)
// se mockean a no-ops para que processWebhook no explote ni mande mails reales.

// Spies del admin client, recreados en cada test (beforeEach) para aislar las aserciones.
// Mock callable concreto: `ReturnType<typeof vi.fn>` resuelve a `Mock<Procedure | Constructable>`
// en Vitest 4 y TS lo trata como posiblemente-constructable → `updateSpy(payload)` tiraba TS2348.
// Tipar la firma de llamada lo deja callable y preserva `.mock`/`toHaveBeenCalledWith`.
let updateSpy: Mock<(payload: Record<string, unknown>) => unknown>
let fakeAdmin: { from: ReturnType<typeof vi.fn> }

// `after()` de next/server LANZA "called outside a request scope" cuando se invoca fuera del
// request lifecycle de Next (verificado empíricamente — Open Q1 del RESEARCH): no es un no-op,
// tira error. Mockeamos next/server PARCIALMENTE preservando NextRequest (lo usa el helper) y
// reemplazando `after` por una versión que ejecuta el callback de inmediato y guarda la promesa,
// para drenar el trabajo de processWebhook de forma determinista y poder asertar el chequeo de monto.
// El callback corre dentro de un try/catch interno del handler, así que un throw acá no rompe el test.
const afterPromises: Promise<unknown>[] = []
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return {
    ...actual,
    after: (cb: () => unknown) => {
      const p = Promise.resolve().then(() => cb())
      afterPromises.push(p)
    },
  }
})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => fakeAdmin,
}))
vi.mock('@/lib/business-secrets', () => ({
  getBusinessSecrets: vi.fn().mockResolvedValue({ mp_access_token: 'tok' }),
}))
vi.mock('@/lib/payment', () => ({
  getValidMpAccessToken: vi.fn().mockResolvedValue('tok'),
}))
vi.mock('@/lib/email', () => ({
  sendConfirmationEmail: vi.fn(),
  sendAdminNotification: vi.fn(),
  // Helper puro de branding (no toca red); acá no se asiertan colores/fuentes, stub inocuo.
  emailBrandInputs: () => ({ palette: null, font: null, primaryOverride: null }),
}))
vi.mock('@/lib/google-calendar', () => ({
  createCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
}))

// El secret de test debe estar seteado ANTES de importar el handler/verifyMPSignature, porque MP_MODE
// se captura en module-load. Lo seteamos a nivel top-level (antes del import dinámico de abajo) y además
// con vi.stubEnv en beforeEach para robustez. MP_MODE sin setear → default 'production' → lee MP_WEBHOOK_SECRET.
const SECRET = 'test_webhook_secret_deposit'
process.env.MP_WEBHOOK_SECRET = SECRET

// Import del handler. verifyMPSignature corre real (no está mockeado).
import { POST } from '@/app/api/payment/webhook/[slug]/route'

const PARAMS = { params: Promise.resolve({ slug: '__test_slug' }) }

beforeEach(() => {
  vi.stubEnv('MP_WEBHOOK_SECRET', SECRET)
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

// Helper: arma un admin client falso cuyo .from().select()...single() devuelve, en orden, el business
// y luego el appointment. update() registra la llamada en updateSpy y permite encadenar .eq().select().
function buildFakeAdmin(appointment: Record<string, unknown>) {
  updateSpy = vi.fn(() => ({
    eq: vi.fn().mockReturnValue({
      // .select() existe para el path de cancelación; devuelve filas vacías por defecto.
      select: vi.fn().mockResolvedValue({ data: [] }),
      // resolución directa de update().eq() (path de amount_mismatch / confirmación)
      then: undefined,
    }),
  }))
  // update().eq() se usa también sin .select() (await directo) → devolvemos un thenable simple.
  const eqResolvable = () => Promise.resolve({ data: null })

  const singleQueue = [
    { data: { id: 'biz', name: 'B', slug: '__test_slug', primary_color: null, logo_url: null, whatsapp: null, address: null, notification_email: null } },
    { data: appointment },
  ]

  fakeAdmin = {
    from: vi.fn(() => {
      const chain: Record<string, unknown> = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        single: vi.fn(() => Promise.resolve(singleQueue.shift() ?? { data: null })),
        update: vi.fn((payload: Record<string, unknown>) => {
          updateSpy(payload)
          return {
            eq: vi.fn(() => {
              const r: Record<string, unknown> = {
                select: vi.fn(() => Promise.resolve({ data: [] })),
              }
              // permite `await update().eq()` directo
              return Object.assign(eqResolvable(), r)
            }),
          }
        }),
      }
      return chain
    }),
  }
}

describe('webhook de seña — verificación de firma', () => {
  it('sin x-signature → 401 (firma se valida antes de after())', async () => {
    buildFakeAdmin({ id: 'appt', status: 'pending_payment', deposit_amount: 1500, services: { name: 's', price: 3000 } })
    const req = makeWebhookRequest({
      dataIdQuery: '123',
      body: { type: 'payment', data: { id: '123' } },
    })
    const res = await POST(req, PARAMS)
    expect(res.status).toBe(401)
  })

  it('x-signature con v1 de un secret equivocado → 401', async () => {
    buildFakeAdmin({ id: 'appt', status: 'pending_payment', deposit_amount: 1500, services: { name: 's', price: 3000 } })
    const { xSignature, xRequestId } = craftSignature({ secret: 'secret_equivocado', dataId: '123', requestId: 'req-1' })
    const req = makeWebhookRequest({
      dataIdQuery: '123',
      xSignature,
      xRequestId,
      body: { type: 'payment', data: { id: '123' } },
    })
    const res = await POST(req, PARAMS)
    expect(res.status).toBe(401)
  })

  it('firma válida → 200', async () => {
    buildFakeAdmin({ id: 'appt', status: 'pending_payment', deposit_amount: 1500, services: { name: 's', price: 3000 } })
    // fetch a MP no debería pegarle a nada real igual; lo mockeamos por las dudas (no se asierta acá).
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ status: 'approved', external_reference: 'appt', transaction_amount: 1500 }),
    }))
    const { xSignature, xRequestId } = craftSignature({ secret: SECRET, dataId: '123', requestId: 'req-1' })
    const req = makeWebhookRequest({
      dataIdQuery: '123',
      xSignature,
      xRequestId,
      body: { type: 'payment', data: { id: '123' } },
    })
    const res = await POST(req, PARAMS)
    expect(res.status).toBe(200) // la firma se valida ANTES de after() → el status no depende del callback
  })
})

describe('webhook de seña — chequeo de monto (under-payment)', () => {
  it('pago approved por monto distinto → update(amount_mismatch) y NUNCA status:confirmed', async () => {
    // appointment espera $1500 de seña; MP reporta $1 pagado → mismatch (T-05-03, under-payment).
    buildFakeAdmin({ id: 'appt', status: 'pending_payment', deposit_amount: 1500, services: { name: 's', price: 3000 } })

    // fetch CRUDO a /v1/payments/{id}: approved pero transaction_amount=1 (≠ 1500 esperado).
    // Mockear global.fetch — NO mpFetch (este route usa fetch crudo, Pitfall 13). Cero llamadas a MP real.
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ status: 'approved', external_reference: 'appt', transaction_amount: 1 }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { xSignature, xRequestId } = craftSignature({ secret: SECRET, dataId: '123', requestId: 'req-1' })
    const req = makeWebhookRequest({
      dataIdQuery: '123',
      xSignature,
      xRequestId,
      body: { type: 'payment', data: { id: '123' } },
    })
    const res = await POST(req, PARAMS)
    expect(res.status).toBe(200)

    // El chequeo de monto vive dentro de after(). Esperamos a que el callback drene y registre el update.
    // vi.waitFor reintenta hasta que la aserción pase o expire (no asume drenado sincrónico de after()).
    await vi.waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith({ payment_status: 'amount_mismatch' })
    }, { timeout: 2000, interval: 10 })

    // CRÍTICO (T-05-03): el monto incorrecto NUNCA debe confirmar el turno.
    const confirmedCall = updateSpy.mock.calls.find(
      ([payload]) => payload && typeof payload === 'object' && (payload as Record<string, unknown>).status === 'confirmed'
    )
    expect(confirmedCall).toBeUndefined()

    // Sanity: el fetch a MP fue el mock, no una llamada real.
    expect(fetchMock).toHaveBeenCalled()
  })
})
