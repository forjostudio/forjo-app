import { describe, it, expect, vi, afterEach, type Mock } from 'vitest'
import { sendManualBookingConfirmation } from '@/lib/email'

// ── Test PURO del contenido del mail del alta manual (BOOK-NOTIFY-01 / D-03) ────────────────────────
// La función manda el mail con `fetch` CRUDO a api.resend.com (mismo mecanismo que el resto de
// lib/email.ts). Acá NO tocamos red ni Supabase: stubbeamos global.fetch, capturamos el payload que
// se le pasa a Resend y asertamos SOBRE EL STRING RENDERIZADO (html/text/subject). Las verificaciones
// de "sin precio/seña" son assertions en memoria sobre el payload capturado — NUNCA greps sobre
// lib/email.ts (ese archivo contiene esas palabras legítimamente en OTRAS funciones).
//
// Pasamos `resendApiKey` + `resendFrom` propios para que `resolveSender` tome el path de key propia y
// el test NO dependa de process.env.RESEND_API_KEY.

// Base común de params. Cada test la extiende con lo que necesita.
const BASE = {
  to: 'cliente@example.com',
  clientName: 'Juana Cliente',
  service: 'Corte de pelo',
  date: '2026-08-15',
  time: '14:30:00',
  businessName: 'Peluquería Test',
  businessSlug: 'peluqueria-test',
  primaryColor: '#123456',
  logoUrl: null,
  whatsapp: null,
  resendApiKey: 're_test_key',
  resendFrom: '"Peluquería Test" <turnos@peluqueria.test>',
}

// Stub de fetch que responde OK como Resend. Devuelve el mock para inspeccionar el body capturado.
function stubFetchOk(): Mock {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ id: 'email-id-x' }),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

// Parsea el body JSON del primer POST capturado.
function capturedPayload(fetchMock: Mock): { html: string; text: string; subject: string } {
  const body = (fetchMock.mock.calls[0][1] as { body: string }).body
  return JSON.parse(body)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sendManualBookingConfirmation — confirmación limpia del alta manual (D-03/D-04)', () => {
  it('Test 1 — hace UN POST a api.resend.com', async () => {
    const fetchMock = stubFetchOk()
    await sendManualBookingConfirmation({ ...BASE })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.resend.com/emails')
  })

  it('Test 2 — el html incluye servicio, fecha (fmtDate), hora y negocio', async () => {
    const fetchMock = stubFetchOk()
    await sendManualBookingConfirmation({ ...BASE })
    const { html } = capturedPayload(fetchMock)
    expect(html).toContain('Corte de pelo')
    // fmtDate('2026-08-15') → "Sábado 15 de agosto"
    expect(html).toContain('Sábado 15 de agosto')
    expect(html).toContain('14:30')
    expect(html).toContain('Peluquería Test')
  })

  it('Test 3 — con cancelToken, el html incluye el link /cancelar/{token}', async () => {
    const fetchMock = stubFetchOk()
    await sendManualBookingConfirmation({ ...BASE, cancelToken: 'tok-abc-123' })
    const { html } = capturedPayload(fetchMock)
    expect(html).toContain('/cancelar/tok-abc-123')
  })

  it('Test 4 — SIN cancelToken, el mail se manda igual pero sin botón de cancelar (D-04)', async () => {
    const fetchMock = stubFetchOk()
    await sendManualBookingConfirmation({ ...BASE }) // sin cancelToken
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const { html } = capturedPayload(fetchMock)
    expect(html).not.toContain('/cancelar/')
  })

  it('Test 5 — el corazón de D-03: NI html NI text muestran precio/seña/saldo/total', async () => {
    const fetchMock = stubFetchOk()
    await sendManualBookingConfirmation({ ...BASE, cancelToken: 'tok-abc-123' })
    const { html, text } = capturedPayload(fetchMock)
    for (const rendered of [html, text]) {
      // Ni un signo de importe...
      expect(rendered).not.toContain('$')
      // ...ni los conceptos de dinero (case-insensitive).
      expect(rendered.toLowerCase()).not.toContain('seña')
      expect(rendered.toLowerCase()).not.toContain('sena')
      expect(rendered.toLowerCase()).not.toContain('saldo')
      expect(rendered.toLowerCase()).not.toContain('total')
      expect(rendered.toLowerCase()).not.toContain('precio')
    }
  })
})
