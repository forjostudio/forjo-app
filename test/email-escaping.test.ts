import { describe, it, expect, vi, afterEach, type Mock } from 'vitest'
import { sendConfirmationEmail, sendAdminNotification } from '@/lib/email'

// ── Cobertura WR-02 de los templates NO-abono (BRAND-EMAIL-01) ────────────────────────────────────
// clientName/service/clientEmail salen del form ANÓNIMO de /api/booking/create y terminan en el mail
// que el DUEÑO lee como confiable (sendAdminNotification). Sin escapar, un nombre con markup planta
// links de terceros dentro de un mensaje con el branding del negocio (phishing dirigido). Acá se
// asierta sobre el HTML renderizado (más robusto que el grep): el html NO trae el markup crudo, el
// text plano SÍ (convención del módulo). Mismo patrón que test/abono-cancel-email.test.ts: se stubbea
// fetch y se pasan resendApiKey/resendFrom propios para no depender de process.env.

const EVIL_NAME = 'Ana <a href="https://evil.example/phish">Actualizá tus datos</a>'

const CONFIRM_BASE = {
  to: 'cliente@example.com',
  clientName: 'Juana Cliente',
  service: 'Corte de pelo',
  price: 5000,
  deposit: 0,
  date: '2026-09-15',
  time: '20:00:00',
  businessName: 'Peluquería Test',
  businessSlug: 'peluqueria-test',
  palette: 'blue',
  logoUrl: null,
  whatsapp: null,
  cancelToken: 'tok-123',
  resendApiKey: 're_test_key',
  resendFrom: '"Peluquería Test" <turnos@peluqueria.test>',
}

const ADMIN_BASE = {
  to: 'duenio@example.com',
  clientName: 'Juana Cliente',
  clientPhone: '+54 9 11 5555-4444',
  clientEmail: 'cliente@example.com',
  service: 'Corte de pelo',
  price: 5000,
  deposit: 0,
  date: '2026-09-15',
  time: '20:00:00',
  businessName: 'Peluquería Test',
  palette: 'blue',
  logoUrl: null,
  resendApiKey: 're_test_key',
  resendFrom: '"Peluquería Test" <turnos@peluqueria.test>',
}

function stubFetchOk(): Mock {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'email-id-x' }) })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function capturedPayload(fetchMock: Mock): { html: string; text: string; subject: string } {
  const body = (fetchMock.mock.calls[0][1] as { body: string }).body
  return JSON.parse(body)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('WR-02 — sendConfirmationEmail (mail al cliente)', () => {
  it('un nombre con markup NO llega como link al html; el text lo muestra crudo', async () => {
    const fetchMock = stubFetchOk()
    await sendConfirmationEmail({ ...CONFIRM_BASE, clientName: EVIL_NAME })
    const { html, text } = capturedPayload(fetchMock)
    expect(html).not.toContain('href="https://evil.example')
    expect(html).not.toContain('<a href="https://evil.example')
    expect(html).toContain('&lt;a href=&quot;')
    // El text plano NO se escapa (ahí las entidades se verían como basura).
    expect(text).toContain(EVIL_NAME)
  })

  it('un servicio con comillas no rompe ningún atributo del html', async () => {
    const fetchMock = stubFetchOk()
    await sendConfirmationEmail({ ...CONFIRM_BASE, service: `Corte "premium" de Jo's & Co` })
    const { html, text } = capturedPayload(fetchMock)
    expect(html).toContain('Corte &quot;premium&quot; de Jo&#39;s &amp; Co')
    expect(html).not.toContain('Corte "premium"')
    expect(text).toContain(`Corte "premium" de Jo's & Co`)
  })
})

describe('WR-02 — sendAdminNotification (mail que lee el DUEÑO)', () => {
  it('un nombre con markup NO llega como link al aviso del dueño', async () => {
    const fetchMock = stubFetchOk()
    await sendAdminNotification({ ...ADMIN_BASE, clientName: EVIL_NAME })
    const { html, text } = capturedPayload(fetchMock)
    expect(html).not.toContain('href="https://evil.example')
    expect(html).not.toContain('<a href="https://evil.example')
    expect(html).toContain('&lt;a href=&quot;')
    expect(text).toContain(EVIL_NAME)
  })

  it('un clientEmail con <script> sale escapado en el html', async () => {
    const fetchMock = stubFetchOk()
    await sendAdminNotification({ ...ADMIN_BASE, clientEmail: 'ana<script>@example.com' })
    const { html } = capturedPayload(fetchMock)
    expect(html).not.toContain('<script>')
    expect(html).toContain('ana&lt;script&gt;@example.com')
  })

  it('un servicio con markup sale escapado en el bloque de detalle del dueño', async () => {
    const fetchMock = stubFetchOk()
    await sendAdminNotification({ ...ADMIN_BASE, service: 'Corte <b>gratis</b>' })
    const { html } = capturedPayload(fetchMock)
    expect(html).not.toContain('<b>gratis</b>')
    expect(html).toContain('Corte &lt;b&gt;gratis&lt;/b&gt;')
  })
})
