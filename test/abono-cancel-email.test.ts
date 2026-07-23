import { describe, it, expect, vi, afterEach, type Mock } from 'vitest'
import { sendAbonoCancelledEmail, sendAbonoCancelledAdminNotification } from '@/lib/email'

// ── Test PURO de los dos mails de la BAJA DE SERIE del abono (ABONO-04 / ABONO-05) ──────────────────
// Los templates mandan con `fetch` CRUDO a api.resend.com (mismo mecanismo que el resto de
// lib/email.ts). Acá NO tocamos red ni Supabase: stubbeamos global.fetch, capturamos el payload que
// se le pasa a Resend y asertamos SOBRE EL STRING RENDERIZADO (html/text/subject). Las verificaciones
// de "sin precio/seña" son assertions en memoria sobre el payload capturado — NUNCA greps sobre
// lib/email.ts (ese archivo contiene esas palabras legítimamente en OTRAS funciones).
//
// Lo más importante que se prueba acá es la política D-14 (LOCKED): una baja que cancela N turnos
// produce UN solo mail por vía, nunca N. Por eso los templates reciben `cancelledCount` como número
// y lo muestran como resumen, en vez de iterar fechas.
//
// Pasamos `resendApiKey` + `resendFrom` propios para que `resolveSender` tome el path de key propia y
// el test NO dependa de process.env.RESEND_API_KEY.

// Base común del mail al CLIENTE. Cada test la extiende con lo que necesita.
const BASE = {
  to: 'cliente@example.com',
  clientName: 'Juana Cliente',
  service: 'Corte de pelo',
  dayLabel: 'todos los martes',
  time: '20:00:00',
  cancelledCount: 3,
  lastDate: '2026-09-15',
  businessName: 'Peluquería Test',
  businessSlug: 'peluqueria-test',
  primaryOverride: '#123456',
  logoUrl: null,
  whatsapp: null,
  resendApiKey: 're_test_key',
  resendFrom: '"Peluquería Test" <turnos@peluqueria.test>',
}

// Base común del aviso al DUEÑO.
const ADMIN_BASE = {
  to: 'duenio@example.com',
  clientName: 'Juana Cliente',
  clientPhone: '+54 9 11 5555-4444',
  clientEmail: 'cliente@example.com',
  service: 'Corte de pelo',
  dayLabel: 'todos los martes',
  time: '20:00:00',
  cancelledCount: 3,
  lastDate: '2026-09-15',
  businessName: 'Peluquería Test',
  logoUrl: null,
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

// Parsea el body JSON del POST número `i` capturado. Cuando un test hace MÁS DE UN envío, leer
// siempre la llamada 0 deja el segundo caso sin asertar (falsa confianza, WR-09): por eso el índice.
function payloadAt(fetchMock: Mock, i: number): { html: string; text: string; subject: string } {
  const call = fetchMock.mock.calls[i]
  if (!call) throw new Error(`no hay POST capturado en el índice ${i}`)
  const body = (call[1] as { body: string }).body
  return JSON.parse(body)
}

// Parsea el body JSON del primer POST capturado (azúcar para los tests de un solo envío).
function capturedPayload(fetchMock: Mock): { html: string; text: string; subject: string } {
  return payloadAt(fetchMock, 0)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sendAbonoCancelledEmail — mail de baja de serie al cliente (D-03/D-11/D-14/D-15)', () => {
  it('Test 1 — hace UN POST a api.resend.com', async () => {
    const fetchMock = stubFetchOk()
    await sendAbonoCancelledEmail({ ...BASE })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.resend.com/emails')
  })

  it('Test 2 — el subject nombra al negocio y refiere a la baja del turno fijo', async () => {
    const fetchMock = stubFetchOk()
    await sendAbonoCancelledEmail({ ...BASE })
    const { subject } = capturedPayload(fetchMock)
    expect(subject).toContain('Peluquería Test')
    expect(subject.toLowerCase()).toContain('turno fijo')
    expect(subject.toLowerCase()).toContain('baja')
  })

  it('Test 3 — el html describe la SERIE: día fijo, hora hh:mm y conteo de turnos cancelados', async () => {
    const fetchMock = stubFetchOk()
    await sendAbonoCancelledEmail({ ...BASE, cancelledCount: 3 })
    const { html } = capturedPayload(fetchMock)
    expect(html).toContain('todos los martes')
    expect(html).toContain('20:00')
    expect(html).toContain('Turnos cancelados')
    expect(html).toContain('3 turnos')
  })

  it('Test 4 — con lastDate, el html muestra la última fecha en español (D-03/D-11)', async () => {
    const fetchMock = stubFetchOk()
    await sendAbonoCancelledEmail({ ...BASE, lastDate: '2026-09-15' })
    const { html, text } = capturedPayload(fetchMock)
    // fmtDate('2026-09-15') → "Martes 15 de septiembre"
    expect(html).toContain('Martes 15 de septiembre')
    expect(text).toContain('Martes 15 de septiembre')
  })

  it('Test 5 — sin lastDate: LOS DOS casos (null en el envío 0, undefined en el 1) se asiertan por índice', async () => {
    const fetchMock = stubFetchOk()
    await sendAbonoCancelledEmail({ ...BASE, lastDate: null })
    await sendAbonoCancelledEmail({ ...BASE, lastDate: undefined })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // El caso `undefined` viaja en el POST 1: leer siempre el 0 lo dejaba sin cubrir (WR-09).
    for (const i of [0, 1]) {
      const { html, text } = payloadAt(fetchMock, i)
      expect(html, `envío ${i}`).not.toContain('Último turno cancelado')
      expect(text, `envío ${i}`).not.toContain('Último turno cancelado')
      // El resto del resumen sigue estando.
      expect(html, `envío ${i}`).toContain('Turnos cancelados')
    }
  })

  it('Test 6 — el html linkea a la página pública del negocio con el businessSlug (D-12)', async () => {
    const fetchMock = stubFetchOk()
    await sendAbonoCancelledEmail({ ...BASE })
    const { html, text } = capturedPayload(fetchMock)
    expect(html).toContain('/peluqueria-test"')
    expect(text).toContain('/peluqueria-test')
  })

  it('Test 7 — con service vacío no queda fila de detalle huérfana y el mail se manda igual', async () => {
    const fetchMock = stubFetchOk()
    await sendAbonoCancelledEmail({ ...BASE, service: '' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const { html, text } = capturedPayload(fetchMock)
    expect(html).not.toContain('>Servicio<')
    expect(text).not.toContain('Servicio:')
    // Y el resto del detalle sigue intacto.
    expect(html).toContain('todos los martes')
    expect(html).toContain('Turnos cancelados')
  })

  it('Test 8 — v0.24 no cobra el abono: NI html NI text mencionan importes', async () => {
    const fetchMock = stubFetchOk()
    await sendAbonoCancelledEmail({ ...BASE })
    const { html, text } = capturedPayload(fetchMock)
    for (const rendered of [html, text]) {
      expect(rendered).not.toContain('$')
      expect(rendered.toLowerCase()).not.toContain('seña')
      expect(rendered.toLowerCase()).not.toContain('sena')
      expect(rendered.toLowerCase()).not.toContain('saldo')
      expect(rendered.toLowerCase()).not.toContain('total')
      expect(rendered.toLowerCase()).not.toContain('precio')
    }
  })
})

describe('sendAbonoCancelledAdminNotification — aviso al dueño (D-13)', () => {
  it('Test 9 — hace UN POST y el subject incluye el cliente y el día fijo', async () => {
    const fetchMock = stubFetchOk()
    await sendAbonoCancelledAdminNotification({ ...ADMIN_BASE })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.resend.com/emails')
    const { subject } = capturedPayload(fetchMock)
    expect(subject).toContain('Juana Cliente')
    expect(subject).toContain('todos los martes')
    expect(subject).toContain('20:00')
  })

  it('Test 10 — el html trae el conteo y el teléfono del cliente con solo dígitos en el link de WhatsApp', async () => {
    const fetchMock = stubFetchOk()
    await sendAbonoCancelledAdminNotification({ ...ADMIN_BASE, cancelledCount: 5 })
    const { html } = capturedPayload(fetchMock)
    expect(html).toContain('Turnos cancelados')
    expect(html).toContain('5 turnos')
    expect(html).toContain('https://wa.me/5491155554444')
  })

  it('Test 11 — sin lastDate (null en el envío 0, undefined en el 1) no aparece el bloque de última fecha', async () => {
    const fetchMock = stubFetchOk()
    await sendAbonoCancelledAdminNotification({ ...ADMIN_BASE, lastDate: null })
    await sendAbonoCancelledAdminNotification({ ...ADMIN_BASE, lastDate: undefined })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // Espejo del Test 5: el aviso al dueño también tiene que tolerar `undefined` (WR-09).
    for (const i of [0, 1]) {
      const { html, text } = payloadAt(fetchMock, i)
      expect(html, `envío ${i}`).not.toContain('Último turno cancelado')
      expect(text, `envío ${i}`).not.toContain('Último turno cancelado')
      expect(html, `envío ${i}`).toContain('Turnos cancelados')
    }
  })
})

// ── Escapado de HTML (WR-02) ────────────────────────────────────────────────────────────────────────
// `clients.name` viene de la superficie ANÓNIMA de booking (POST /api/booking/create) y termina
// renderizado en el mail que el DUEÑO lee como confiable. Sin escapar, un nombre con markup planta
// links de terceros dentro de un mensaje con el branding del negocio (inyección de contenido +
// phishing dirigido), y cualquier `<` legítimo rompe el layout.
const EVIL_NAME = 'Ana <a href="https://evil.example/phish">Actualizá tus datos</a>'

describe('Escapado de HTML de los valores dinámicos (WR-02)', () => {
  it('Test 15 — escapado: un nombre con markup NO llega como link al mail del cliente', async () => {
    const fetchMock = stubFetchOk()
    await sendAbonoCancelledEmail({ ...BASE, clientName: EVIL_NAME })
    const { html } = capturedPayload(fetchMock)
    // El dominio del atacante no queda dentro de ningún href...
    expect(html).not.toContain('href="https://evil.example')
    // ...y la etiqueta de apertura viaja como TEXTO escapado.
    expect(html).not.toContain('<a href="https://evil.example')
    expect(html).toContain('&lt;a href=&quot;https://evil.example/phish&quot;&gt;')
  })

  it('Test 16 — escapado: un nombre con markup NO llega como link al aviso del dueño', async () => {
    const fetchMock = stubFetchOk()
    await sendAbonoCancelledAdminNotification({ ...ADMIN_BASE, clientName: EVIL_NAME })
    const { html } = capturedPayload(fetchMock)
    expect(html).not.toContain('href="https://evil.example')
    expect(html).not.toContain('<a href="https://evil.example')
    expect(html).toContain('&lt;a href=&quot;https://evil.example/phish&quot;&gt;')
  })

  it('Test 17 — escapado: un servicio con comillas dobles y simples no rompe ningún atributo', async () => {
    const fetchMock = stubFetchOk()
    await sendAbonoCancelledEmail({ ...BASE, service: `Corte "premium" de Jo's & Co` })
    const { html, text } = capturedPayload(fetchMock)
    expect(html).toContain('Corte &quot;premium&quot; de Jo&#39;s &amp; Co')
    expect(html).not.toContain('Corte "premium"')
    // El text plano lo muestra tal cual (ahí las entidades se verían como basura).
    expect(text).toContain(`Corte "premium" de Jo's & Co`)
  })

  it('Test 18 — escapado: un `<` legítimo sale como texto legible y no rompe el layout', async () => {
    const fetchMock = stubFetchOk()
    await sendAbonoCancelledEmail({ ...BASE, clientName: 'Ana < Bea' })
    const { html, text } = capturedPayload(fetchMock)
    expect(html).toContain('Ana &lt; Bea')
    expect(html).not.toContain('Ana < Bea')
    // El cuerpo `text` NO se escapa.
    expect(text).toContain('Ana < Bea')
  })

  it('Test 19 — escapado: el teléfono y el email del cliente se escapan en el bloque Cliente del dueño', async () => {
    const fetchMock = stubFetchOk()
    await sendAbonoCancelledAdminNotification({
      ...ADMIN_BASE,
      clientEmail: 'ana<script>@example.com',
    })
    const { html } = capturedPayload(fetchMock)
    expect(html).not.toContain('<script>')
    expect(html).toContain('ana&lt;script&gt;@example.com')
  })
})

describe('Timeout duro del POST a Resend (WR-05)', () => {
  it('Test 20 — el POST a Resend viaja con un AbortSignal (no puede colgar el request path)', async () => {
    const fetchMock = stubFetchOk()
    await sendAbonoCancelledEmail({ ...BASE })
    const opts = fetchMock.mock.calls[0][1] as { signal?: AbortSignal }
    expect(opts.signal).toBeDefined()
    expect(opts.signal).toBeInstanceOf(AbortSignal)
    expect(opts.signal!.aborted).toBe(false)
  })

  it('Test 21 — el aviso al dueño también viaja con AbortSignal', async () => {
    const fetchMock = stubFetchOk()
    await sendAbonoCancelledAdminNotification({ ...ADMIN_BASE })
    const opts = fetchMock.mock.calls[0][1] as { signal?: AbortSignal }
    expect(opts.signal).toBeDefined()
  })
})

describe('Política anti-avalancha D-14 (LOCKED) — N turnos cancelados ≠ N mails', () => {
  it('Test 12 — una baja de 7 turnos manda UN solo mail al cliente', async () => {
    const fetchMock = stubFetchOk()
    await sendAbonoCancelledEmail({ ...BASE, cancelledCount: 7, lastDate: '2026-09-15' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const { html } = capturedPayload(fetchMock)
    expect(html).toContain('7 turnos')
  })

  it('Test 13 — una baja de 7 turnos manda UN solo aviso al dueño', async () => {
    const fetchMock = stubFetchOk()
    await sendAbonoCancelledAdminNotification({ ...ADMIN_BASE, cancelledCount: 7 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const { html } = capturedPayload(fetchMock)
    expect(html).toContain('7 turnos')
  })

  it('Test 14 — con 1 solo turno, el texto concuerda en singular', async () => {
    const fetchMock = stubFetchOk()
    await sendAbonoCancelledEmail({ ...BASE, cancelledCount: 1 })
    const { html } = capturedPayload(fetchMock)
    expect(html).toContain('1 turno<')
    expect(html).not.toContain('1 turnos')
  })
})
