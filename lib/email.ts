import { normalizeArWhatsApp } from '@/lib/whatsapp'
import { onAccentText } from '@/lib/contrast'
import { isSafeColor, resolveLandingTheme } from '@/lib/landing/theme'
import type { LandingTheme } from '@/lib/landing/schema'
import { THEME_PALETTES, normalizeTheme, normalizePalette } from '@/lib/theme-config'

// ── Branding del mail: color + fuente desde la MISMA fuente de verdad que la página pública ────────
// Antes el acento salía de `businesses.primary_color` (un hex huérfano que el dueño no edita) y la
// fuente estaba clavada. Ahora los mails espejan la precedencia de la página de reservas
// (override del landing → paleta/fuente del theme del negocio) vía brandEmail + emailBrandInputs.

// COLOR (theme-aware): el acento sale del MISMO motor que resuelve la og:image (brandedHex de
// app/[slug]/opengraph-image.tsx): normalizeTheme → normalizePalette → THEME_PALETTES[theme] por id →
// swatches[0]. Es la barrera anti style-injection (T-tma-01): el color cruza a atributos style= del
// HTML, así que sale SOLO de la tabla literal (allowlist), NUNCA crudo de la DB. El mail va SIEMPRE
// sobre fondo claro; los swatches[0] de cada paleta son las variantes de acento ya usadas por la web.
function themeAccentHex(theme?: string | null, palette?: string | null): string {
  const t = normalizeTheme(theme)
  const palId = normalizePalette(t, palette)
  const list = THEME_PALETTES[t] || THEME_PALETTES.forjo
  const pal = list.find((p) => p.id === palId) ?? list[0]
  return pal?.swatches[0] ?? '#d94a2b'
}

// Mapa FONT id → familia de títulos + segmento fijo de la URL de Google Fonts (allowlist, T-wxt-02).
// La URL SOLO se arma desde `googleFamily` (literal de este mapa); jamás desde el valor crudo de
// `businesses.font`. Un id fuera de este mapa ('auto', null, desconocido) cae a la fuente del THEME.
const EMAIL_HEADING_FONT: Record<string, { googleFamily: string; familyStack: string }> = {
  geometrica: { googleFamily: 'Plus+Jakarta+Sans', familyStack: "'Plus Jakarta Sans',Arial,sans-serif" },
  bauhaus: { googleFamily: 'Archivo', familyStack: "'Archivo',Arial,sans-serif" },
  elegante: { googleFamily: 'Cormorant+Garamond', familyStack: "'Cormorant Garamond',Georgia,serif" },
  tech: { googleFamily: 'Orbitron', familyStack: "'Orbitron',Arial,sans-serif" },
  suave: { googleFamily: 'Sora', familyStack: "'Sora',Arial,sans-serif" },
}

// Mapa THEME → fuente de títulos (mismo patrón y garantía de allowlist que EMAIL_HEADING_FONT,
// T-tma-02). Cuando el negocio no fijó un id de fuente explícito ('auto'/null/desconocido), el mail
// usa la fuente NATIVA de su theme — igual que su página pública. Valores verificados contra
// app/layout.tsx (next/font: Archivo, Plus_Jakarta_Sans, Cormorant_Garamond, Orbitron),
// app/themes.css (--font-heading por theme) y THEME_HEADING_FONT de theme-config.
const THEME_EMAIL_FONT: Record<string, { googleFamily: string; familyStack: string }> = {
  forjo: { googleFamily: 'Archivo', familyStack: "'Archivo',Arial,sans-serif" },
  modern: { googleFamily: 'Plus+Jakarta+Sans', familyStack: "'Plus Jakarta Sans',Arial,sans-serif" },
  spa: { googleFamily: 'Cormorant+Garamond', familyStack: "'Cormorant Garamond',Georgia,serif" },
  cyber: { googleFamily: 'Orbitron', familyStack: "'Orbitron',Arial,sans-serif" },
}

const EMAIL_DEFAULT_HEADING = "'Helvetica Neue',Arial,sans-serif"

// Tokens de marca puros para un mail (unit-testeable). NO lee la DB: recibe ya resuelto el
// palette/font/override (ver emailBrandInputs).
export function brandEmail({
  theme,
  palette,
  font,
  primaryOverride,
}: {
  theme?: string | null
  palette?: string | null
  font?: string | null
  primaryOverride?: string | null
}): { accent: string; accentText: string; accentTextMuted: string; fontLink: string; headingFontFamily: string } {
  // accent: un override REVALIDADO por isSafeColor (defensa en profundidad) gana; si no, el acento
  // del theme+paleta resuelto por el motor (allowlist THEME_PALETTES). Nunca un valor crudo.
  const accent = primaryOverride && isSafeColor(primaryOverride)
    ? primaryOverride
    : themeAccentHex(theme, palette)
  const accentText = onAccentText(accent)
  // Variante translúcida del texto de contraste para subtítulos/footers (menor jerarquía).
  const accentTextMuted = accentText === '#ffffff' ? 'rgba(255,255,255,.7)' : 'rgba(26,23,20,.6)'

  // Fuente de títulos por allowlist, con precedencia: (a) un `font` que es id explícito de
  // EMAIL_HEADING_FONT gana (elección manual del dueño); (b) si no ('auto'/null/desconocido), la
  // fuente NATIVA del theme (THEME_EMAIL_FONT, normalizeTheme siempre da una key válida); (c) red de
  // seguridad última: fallback Helvetica sin <link>. En los tres casos la URL se arma SOLO desde el
  // `googleFamily` literal del allowlist — jamás desde el valor crudo de theme/font (T-tma-02).
  const fontDef = (font ? EMAIL_HEADING_FONT[font] : undefined) ?? THEME_EMAIL_FONT[normalizeTheme(theme)]
  let fontLink = ''
  let headingFontFamily = EMAIL_DEFAULT_HEADING
  if (fontDef) {
    const { googleFamily, familyStack } = fontDef
    // La URL interpola SOLO googleFamily (literal del mapa), NUNCA el argumento `font` crudo.
    fontLink = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${googleFamily}:wght@400;600;700;800&display=swap"/>`
    headingFontFamily = familyStack
  }

  return { accent, accentText, accentTextMuted, fontLink, headingFontFamily }
}

// Fila de negocio → inputs de brandEmail, ESPEJO EXACTO de app/[slug]/layout.tsx: el override del
// landing pisa a la paleta del negocio (misma precedencia que ve la página pública). A PROPÓSITO
// NO lee primary_color: ese campo huérfano deja de ser fuente de color del mail (T-wxt-04).
export function emailBrandInputs(row: {
  palette?: string | null
  theme?: string | null
  font?: string | null
  landing_config?: unknown
}): { palette: string; theme: string; font: string; primaryOverride: string | null } {
  const landingTheme = (row.landing_config as { theme?: LandingTheme } | null)?.theme
  const t = resolveLandingTheme(landingTheme, { theme: row.theme, palette: row.palette, font: row.font })
  // `theme` viaja para que brandEmail resuelva color+fuente por theme (espejo de la página pública).
  return { palette: t.palette, theme: t.theme, font: t.font, primaryOverride: t.primary ?? null }
}

// Decide con qué key y qué "from" mandar, según la config del negocio:
// - Key propia del negocio → hay que mandar desde SU dominio verificado (resend_from).
//   Sin resend_from, mandar con @forjo.studio daría 403 (dominio no verificado en su
//   cuenta) → NO enviamos y tiramos un error claro en vez de fallar silencioso.
// - Sin key propia → key global de Forjo + from @forjo.studio (dominio verificado).
// Sanitiza el nombre para el display name del header From (sin saltos de línea ni
// caracteres que rompan/inyecten el header). Fallback "Forjo Gestión".
function fromDisplayName(name?: string | null): string {
  const safe = (name || '').replace(/[\r\n"<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 64)
  return safe || 'Forjo Gestión'
}

function resolveSender(businessName?: string | null, resendApiKey?: string | null, resendFrom?: string | null): { key: string; from: string } {
  const ownKey = resendApiKey?.trim()
  if (ownKey) {
    const ownFrom = resendFrom?.trim()
    if (!ownFrom) {
      throw new Error('negocio con key Resend propia sin email remitente (resend_from) configurado: no se envía con @forjo.studio para evitar 403 por dominio no verificado')
    }
    return { key: ownKey, from: ownFrom }
  }
  const globalKey = process.env.RESEND_API_KEY
  if (!globalKey) {
    throw new Error('sin RESEND_API_KEY global y el negocio no tiene key propia: no hay con qué enviar')
  }
  // Key global de Forjo: display name = nombre del negocio, dirección verificada de Forjo.
  return { key: globalKey, from: `"${fromDisplayName(businessName)}" <notificaciones@forjo.studio>` }
}

// Escapa un valor dinámico ANTES de interpolarlo dentro del HTML de un mail (WR-02).
// Por qué existe: `clients.name` (y de ahí el nombre que muestran los mails) sale de la superficie
// ANÓNIMA de booking — `POST /api/booking/create` lo toma del body sin sanitizar — y termina
// renderizado en el aviso que EL DUEÑO lee como confiable. Sin escapar, cualquiera puede plantar un
// ancla a un dominio propio dentro de un mensaje con el branding del negocio (inyección de contenido
// y de links / phishing dirigido), y un `<` legítimo rompe el layout.
// El ampersand va PRIMERO: si no, se doble-escapan las entidades que producen los reemplazos que siguen.
// Solo para HTML: el `text` plano y el `subject` NO se escapan (ahí las entidades se verían como basura).
function esc(s: unknown): string {
  if (s === null || s === undefined) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function fmtDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `${DAYS[dt.getDay()]} ${dt.getDate()} de ${MONTHS[dt.getMonth()]}`
}

function fmtPrice(n: number) {
  return '$' + Number(n).toLocaleString('es-AR')
}

// Header del email: logo + nombre del negocio JUNTOS cuando hay logo (antes mostraba solo
// el logo). Sin logo, el nombre en grande + subtítulo (fallback de siempre). El nombre
// siempre presente para reforzar la marca. Compartido por confirmación y cancelaciones.
// `opts` trae el color de contraste y la fuente de títulos ya resueltos por brandEmail (mismos para
// todos los templates). El nombre del negocio se pinta con el texto de contraste sobre el acento
// (legible en cualquier paleta) y con la fuente de títulos del negocio.
function renderEmailHeader(
  businessName: string,
  logoUrl: string | null | undefined,
  opts: { fontFamily: string; textColor: string; mutedColor: string },
): string {
  const safeName = businessName || 'Forjo Gestión'
  // Nombre local que NO empieza con 'font'/'palette'/'primary_color': el grep de seguridad de la
  // Task 3 rechaza `${font...}` en un style= y `${opts.fontFamily}` lo matchearía por prefijo.
  const headingFont = opts.fontFamily
  const textColor = opts.textColor
  const mutedColor = opts.mutedColor
  // Escapado ANTES de interpolar (WR-02): este header lo comparten TODOS los templates del módulo,
  // así que el control queda en un solo lugar. Se escapa el resultado de `toUpperCase()`, no al revés:
  // mayusculizar una entidad ya escapada produciría `&AMP;`.
  if (logoUrl) {
    return `<table cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;"><tr>
        <td style="padding-right:12px;vertical-align:middle;"><img src="${esc(logoUrl)}" alt="${esc(safeName)}" height="44" style="max-height:44px;border-radius:8px;display:block;"/></td>
        <td style="vertical-align:middle;"><div style="font-size:20px;font-weight:800;letter-spacing:1px;color:${textColor};font-family:${headingFont};">${esc(safeName.toUpperCase())}</div></td>
      </tr></table>`
  }
  return `<div style="font-size:22px;font-weight:800;letter-spacing:2px;color:${textColor};font-family:${headingFont};">${esc(safeName.toUpperCase())}</div>
        <div style="font-size:12px;color:${mutedColor};margin-top:4px;letter-spacing:1px;text-transform:uppercase;">Gestión de turnos</div>`
}

// POST crudo a Resend. Tira error con el detalle si Resend responde !ok (para que el
// caller logee el motivo real y persista el fallo). No traga nada.
async function resendSend(key: string, payload: Record<string, unknown>) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    // Timeout duro (WR-05). Sin abortar, una degradación de Resend cuelga al handler que espera
    // este POST hasta el límite de la función serverless; en la vía pública eso hace que el cliente
    // vea "no pudimos dar de baja el turno fijo" para una baja que SÍ se ejecutó. 10 s es holgado
    // para un POST a una API de mail y queda muy por debajo del límite de la función.
    // Al abortar, fetch rechaza con TimeoutError: resendSend ya propaga cualquier error al caller y
    // los dos call sites de la baja lo envuelven en try/catch con console.error → no hace falta
    // manejo nuevo acá.
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Resend ${res.status}: ${err}`)
  }
  return res.json()
}

export async function sendConfirmationEmail({
  to,
  clientName,
  service,
  price,
  deposit,
  date,
  time,
  businessName,
  businessSlug,
  theme,
  palette,
  font,
  primaryOverride,
  logoUrl,
  whatsapp,
  cancelToken,
  resendApiKey,
  resendFrom,
}: {
  to: string
  clientName: string
  service: string
  price: number
  deposit: number
  date: string
  time: string
  businessName: string
  businessSlug: string
  theme?: string | null
  palette?: string | null
  font?: string | null
  primaryOverride?: string | null
  logoUrl?: string | null
  whatsapp?: string | null
  cancelToken?: string | null
  resendApiKey?: string | null
  resendFrom?: string | null
}) {
  // Resuelve key + from (display name = nombre del negocio; tira error claro si usa key
  // propia sin remitente).
  const { key, from } = resolveSender(businessName, resendApiKey, resendFrom)
  const fecha = fmtDate(date)
  const hora = time.slice(0, 5)
  const saldo = price - deposit

  // Branding parametrizado desde la MISMA fuente de verdad que la página pública (paleta/override
  // del landing) + fuente de títulos + texto de contraste legible en cualquier paleta.
  const brand = brandEmail({ theme, palette, font, primaryOverride })
  const accent = brand.accent
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gestion.forjo.studio'
  const cancelUrl = cancelToken ? `${baseUrl}/cancelar/${cancelToken}` : ''
  // Normaliza por las dudas (idempotente): cubre valores viejos sin normalizar. Si no es
  // un número usable, se omite el link.
  const waDigits = normalizeArWhatsApp(whatsapp)
  const waUrl = waDigits ? `https://wa.me/${waDigits}` : ''
  // Header: logo + nombre del negocio juntos (o solo el nombre si no hay logo).
  const headerInner = renderEmailHeader(businessName, logoUrl, { fontFamily: brand.headingFontFamily, textColor: brand.accentText, mutedColor: brand.accentTextMuted })

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>${brand.fontLink}</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

      <tr><td style="background:${accent};padding:32px 40px;border-radius:12px 12px 0 0;text-align:center;">
        ${headerInner}
      </td></tr>

      <tr><td style="background:#ffffff;padding:40px 40px 32px;">
        <p style="font-size:22px;font-weight:700;color:#1a1a1a;font-family:${brand.headingFontFamily};margin:0 0 8px;">¡Tu turno está confirmado!</p>
        <p style="font-size:15px;color:#555;margin:0 0 32px;line-height:1.6;">
          Hola <strong>${esc(clientName)}</strong>, aquí está el resumen de tu reserva en <strong>${esc(businessName)}</strong>.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-left:4px solid ${accent};border-radius:0 8px 8px 0;margin-bottom:24px;">
          <tr><td style="padding:20px 22px 6px;">
            <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;font-weight:600;margin-bottom:14px;">Detalle del turno</div>
          </td></tr>
          <tr><td style="padding:0 22px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:12px;color:#999;padding:8px 0;border-bottom:1px solid #eee;">Servicio</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${esc(service)}</td>
              </tr>
              <tr>
                <td style="font-size:12px;color:#999;padding:8px 0;border-bottom:1px solid #eee;">Fecha</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${fecha}</td>
              </tr>
              <tr>
                <td style="font-size:12px;color:#999;padding:8px 0;border-bottom:1px solid #eee;">Hora</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${hora} hs</td>
              </tr>
              <tr>
                <td style="font-size:12px;color:#999;padding:10px 0 0;">Total</td>
                <td style="font-size:20px;font-weight:900;color:${accent};padding:10px 0 0;text-align:right;">${fmtPrice(price)}</td>
              </tr>
              ${deposit > 0 ? `
              <tr>
                <td style="font-size:12px;color:#999;padding:6px 0 0;">Seña abonada</td>
                <td style="font-size:13px;font-weight:600;color:#16a34a;padding:6px 0 0;text-align:right;">${fmtPrice(deposit)}</td>
              </tr>
              ${saldo > 0 ? `
              <tr>
                <td style="font-size:12px;color:#999;padding:6px 0 0;">Saldo en el local</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:6px 0 0;text-align:right;">${fmtPrice(saldo)}</td>
              </tr>` : ''}` : ''}
            </table>
          </td></tr>
        </table>

        <p style="font-size:13px;color:#777;line-height:1.7;margin:0 0 16px;">¿Necesitás cancelar o reprogramar tu turno?</p>
        ${cancelUrl ? `<table cellpadding="0" cellspacing="0" style="margin:0;"><tr><td style="border-radius:8px;background:${accent};">
          <a href="${cancelUrl}" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:700;color:${brand.accentText};text-decoration:none;border-radius:8px;">Cancelar turno</a>
        </td></tr></table>` : ''}
        ${waUrl ? `<p style="margin:14px 0 0;font-size:13px;"><a href="${waUrl}" style="color:#16a34a;font-weight:600;text-decoration:none;">Escribinos por WhatsApp →</a></p>` : ''}
      </td></tr>

      <tr><td style="background:${accent};padding:20px 40px;border-radius:0 0 12px 12px;text-align:center;">
        <div style="font-size:11px;color:${brand.accentTextMuted};">Enviado por Forjo Gestión · forjo.studio/${esc(businessSlug)}</div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`

  await resendSend(key, {
    from,
    to: [to],
    subject: `✅ Turno confirmado — ${businessName} · ${fecha} ${hora} hs`,
    html,
    text: `¡Hola ${clientName}! Tu turno en ${businessName} está confirmado.\n\nServicio: ${service}\nFecha: ${fecha}\nHora: ${hora} hs\nTotal: ${fmtPrice(price)}${deposit > 0 ? `\nSeña abonada: ${fmtPrice(deposit)}` : ''}`,
  })
  console.log(`📧 Confirmación enviada a ${to}`)
}

// Email al cliente cuando EL DUEÑO carga un turno a mano desde el panel y tildó "avisar al cliente"
// (BOOK-NOTIFY-01 / D-03). Confirmación LIMPIA: servicio, fecha, hora, negocio + link de cancelar.
// A DIFERENCIA de sendConfirmationEmail, NO recibe ni muestra precio/seña/saldo: el alta manual no
// maneja seña, así que reusar aquel template mostraría "$0 de seña" y un total confuso. Reusa los
// helpers del módulo (resolveSender, fmtDate, renderEmailHeader, normalizeArWhatsApp, resendSend) para
// mantener idéntico el branding/marca y no duplicar el resolver de sender ni el POST a Resend.
export async function sendManualBookingConfirmation({
  to,
  clientName,
  service,
  date,
  time,
  businessName,
  businessSlug,
  theme,
  palette,
  font,
  primaryOverride,
  logoUrl,
  whatsapp,
  cancelToken,
  resendApiKey,
  resendFrom,
}: {
  to: string
  clientName: string
  service: string
  date: string
  time: string
  businessName: string
  businessSlug: string
  theme?: string | null
  palette?: string | null
  font?: string | null
  primaryOverride?: string | null
  logoUrl?: string | null
  whatsapp?: string | null
  // Opcional: si el core no devolvió cancelToken, el mail va sin botón de cancelar (degradación D-04).
  cancelToken?: string | null
  resendApiKey?: string | null
  resendFrom?: string | null
}) {
  // Resuelve key + from (display name = nombre del negocio; el resolver ya sanitiza el header From →
  // cubre header-injection, T-05-04). Tira error claro si usa key propia sin remitente.
  const { key, from } = resolveSender(businessName, resendApiKey, resendFrom)
  const fecha = fmtDate(date)
  const hora = time.slice(0, 5)

  // Branding parametrizado idéntico al resto de los mails (paleta/override del landing + fuente).
  const brand = brandEmail({ theme, palette, font, primaryOverride })
  const accent = brand.accent
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gestion.forjo.studio'
  // Botón de cancelar SOLO si hay token (D-04): sin token, se omite en vez de romper el envío.
  const cancelUrl = cancelToken ? `${baseUrl}/cancelar/${cancelToken}` : ''
  // Normaliza por las dudas (idempotente): si no es un número usable, se omite el link.
  const waDigits = normalizeArWhatsApp(whatsapp)
  const waUrl = waDigits ? `https://wa.me/${waDigits}` : ''
  const headerInner = renderEmailHeader(businessName, logoUrl, { fontFamily: brand.headingFontFamily, textColor: brand.accentText, mutedColor: brand.accentTextMuted })

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>${brand.fontLink}</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

      <tr><td style="background:${accent};padding:32px 40px;border-radius:12px 12px 0 0;text-align:center;">
        ${headerInner}
      </td></tr>

      <tr><td style="background:#ffffff;padding:40px 40px 32px;">
        <p style="font-size:22px;font-weight:700;color:#1a1a1a;font-family:${brand.headingFontFamily};margin:0 0 8px;">¡Tu turno está confirmado!</p>
        <p style="font-size:15px;color:#555;margin:0 0 32px;line-height:1.6;">
          Hola <strong>${esc(clientName)}</strong>, aquí está el resumen de tu reserva en <strong>${esc(businessName)}</strong>.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-left:4px solid ${accent};border-radius:0 8px 8px 0;margin-bottom:24px;">
          <tr><td style="padding:20px 22px 6px;">
            <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;font-weight:600;margin-bottom:14px;">Detalle del turno</div>
          </td></tr>
          <tr><td style="padding:0 22px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:12px;color:#999;padding:8px 0;border-bottom:1px solid #eee;">Servicio</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${esc(service)}</td>
              </tr>
              <tr>
                <td style="font-size:12px;color:#999;padding:8px 0;border-bottom:1px solid #eee;">Fecha</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${fecha}</td>
              </tr>
              <tr>
                <td style="font-size:12px;color:#999;padding:8px 0;">Hora</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:8px 0;text-align:right;">${hora} hs</td>
              </tr>
            </table>
          </td></tr>
        </table>

        ${cancelUrl ? `<p style="font-size:13px;color:#777;line-height:1.7;margin:0 0 16px;">¿Necesitás cancelar o reprogramar tu turno?</p>
        <table cellpadding="0" cellspacing="0" style="margin:0;"><tr><td style="border-radius:8px;background:${accent};">
          <a href="${cancelUrl}" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:700;color:${brand.accentText};text-decoration:none;border-radius:8px;">Cancelar turno</a>
        </td></tr></table>` : ''}
        ${waUrl ? `<p style="margin:14px 0 0;font-size:13px;"><a href="${waUrl}" style="color:#16a34a;font-weight:600;text-decoration:none;">Escribinos por WhatsApp →</a></p>` : ''}
      </td></tr>

      <tr><td style="background:${accent};padding:20px 40px;border-radius:0 0 12px 12px;text-align:center;">
        <div style="font-size:11px;color:${brand.accentTextMuted};">Enviado por Forjo Gestión · forjo.studio/${esc(businessSlug)}</div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`

  await resendSend(key, {
    from,
    to: [to],
    subject: `✅ Turno confirmado — ${businessName} · ${fecha} ${hora} hs`,
    html,
    text: `¡Hola ${clientName}! Tu turno en ${businessName} está confirmado.\n\nServicio: ${service}\nFecha: ${fecha}\nHora: ${hora} hs${cancelUrl ? `\n\n¿Necesitás cancelar? ${cancelUrl}` : ''}`,
  })
  console.log(`📧 Confirmación (alta manual) enviada a ${to}`)
}

// Email al cliente cuando EL DUEÑO da de alta un ABONO (serie de turnos FIJOS recurrentes) desde el
// panel (ABONO-01 / D-08). A diferencia de un turno suelto, NO describe una fecha puntual: describe el
// turno fijo SEMANAL — "todos los lunes 10:00 hs" — que el negocio le reservó al cliente todas las
// semanas. Se manda UNA sola vez, al crear el abono (los turnos que la generación forward materializa
// semana a semana NO mandan mail cada uno, D-08). NO muestra precio/seña: v0.24 no cobra el abono (D-08).
// Reusa los helpers del módulo (resolveSender, renderEmailHeader, normalizeArWhatsApp, resendSend) para
// mantener idéntico el branding y no duplicar el resolver de sender (que ya sanitiza el header From) ni
// el POST a Resend. `cancelUrl` queda OPCIONAL y HOY no se pasa: el link de cancelar la SERIE es Phase 7;
// el template ya lo contempla para sumarlo sin reescribir nada (degradación: sin url, no se muestra botón).
export async function sendAbonoConfirmation({
  to,
  clientName,
  service,
  dayLabel,
  time,
  businessName,
  businessSlug,
  theme,
  palette,
  font,
  primaryOverride,
  logoUrl,
  whatsapp,
  cancelUrl,
  resendApiKey,
  resendFrom,
}: {
  to: string
  clientName: string
  service: string
  dayLabel: string // ej. "todos los lunes" (derivado de day_of_week por el caller)
  time: string
  businessName: string
  businessSlug: string
  theme?: string | null
  palette?: string | null
  font?: string | null
  primaryOverride?: string | null
  logoUrl?: string | null
  whatsapp?: string | null
  // Opcional y SIN uso en v0.24: el link de cancelar la serie llega en Phase 7. Sin url → sin botón.
  cancelUrl?: string | null
  resendApiKey?: string | null
  resendFrom?: string | null
}) {
  // Resuelve key + from (display name = nombre del negocio; el resolver ya sanitiza el header From →
  // cubre header-injection). Tira error claro si usa key propia sin remitente.
  const { key, from } = resolveSender(businessName, resendApiKey, resendFrom)
  const hora = time.slice(0, 5)

  // Branding parametrizado idéntico al resto de los mails (paleta/override del landing + fuente).
  const brand = brandEmail({ theme, palette, font, primaryOverride })
  const accent = brand.accent
  const cancel = cancelUrl && cancelUrl.trim() ? cancelUrl.trim() : ''
  // Normaliza por las dudas (idempotente): si no es un número usable, se omite el link.
  const waDigits = normalizeArWhatsApp(whatsapp)
  const waUrl = waDigits ? `https://wa.me/${waDigits}` : ''
  const headerInner = renderEmailHeader(businessName, logoUrl, { fontFamily: brand.headingFontFamily, textColor: brand.accentText, mutedColor: brand.accentTextMuted })

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>${brand.fontLink}</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

      <tr><td style="background:${accent};padding:32px 40px;border-radius:12px 12px 0 0;text-align:center;">
        ${headerInner}
      </td></tr>

      <tr><td style="background:#ffffff;padding:40px 40px 32px;">
        <p style="font-size:22px;font-weight:700;color:#1a1a1a;font-family:${brand.headingFontFamily};margin:0 0 8px;">Tu turno fijo quedó agendado</p>
        <p style="font-size:15px;color:#555;margin:0 0 32px;line-height:1.6;">
          Hola <strong>${esc(clientName)}</strong>, <strong>${esc(businessName)}</strong> te reservó un turno fijo <strong>todas las semanas</strong>. Este es el horario que quedó guardado para vos.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-left:4px solid ${accent};border-radius:0 8px 8px 0;margin-bottom:24px;">
          <tr><td style="padding:20px 22px 6px;">
            <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;font-weight:600;margin-bottom:14px;">Tu turno fijo semanal</div>
          </td></tr>
          <tr><td style="padding:0 22px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:12px;color:#999;padding:8px 0;border-bottom:1px solid #eee;">Servicio</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${esc(service)}</td>
              </tr>
              <tr>
                <td style="font-size:12px;color:#999;padding:8px 0;border-bottom:1px solid #eee;">Se repite</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:8px 0;border-bottom:1px solid #eee;text-align:right;text-transform:capitalize;">${dayLabel}</td>
              </tr>
              <tr>
                <td style="font-size:12px;color:#999;padding:8px 0;">Hora</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:8px 0;text-align:right;">${hora} hs</td>
              </tr>
            </table>
          </td></tr>
        </table>

        <p style="font-size:13px;color:#777;line-height:1.7;margin:0;">Todas las semanas te vamos a esperar en ese mismo horario. Si algún día no vas a poder venir, avisanos y lo coordinamos.</p>
        ${cancel ? `<table cellpadding="0" cellspacing="0" style="margin:16px 0 0;"><tr><td style="border-radius:8px;background:${accent};">
          <a href="${cancel}" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:700;color:${brand.accentText};text-decoration:none;border-radius:8px;">Cancelar turno fijo</a>
        </td></tr></table>` : ''}
        ${waUrl ? `<p style="margin:14px 0 0;font-size:13px;"><a href="${waUrl}" style="color:#16a34a;font-weight:600;text-decoration:none;">Escribinos por WhatsApp →</a></p>` : ''}
      </td></tr>

      <tr><td style="background:${accent};padding:20px 40px;border-radius:0 0 12px 12px;text-align:center;">
        <div style="font-size:11px;color:${brand.accentTextMuted};">Enviado por Forjo Gestión · forjo.studio/${esc(businessSlug)}</div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`

  await resendSend(key, {
    from,
    to: [to],
    subject: `Tu turno fijo quedó agendado — ${businessName}`,
    html,
    text: `¡Hola ${clientName}! ${businessName} te agendó un turno fijo semanal.\n\nServicio: ${service}\nSe repite: ${dayLabel}\nHora: ${hora} hs${cancel ? `\n\n¿Necesitás cancelar el turno fijo? ${cancel}` : ''}`,
  })
  console.log(`📧 Confirmación de abono enviada a ${to}`)
}

// Email al CLIENTE cuando su ABONO (turno fijo semanal) se da de BAJA (ABONO-04 / ABONO-05).
// Se manda UNA SOLA VEZ por baja de serie y NUNCA uno por turno cancelado: dar de baja un abono
// cancela N turnos futuros de una, y mandar N mails sería una avalancha (D-14 LOCKED). Por eso el
// template recibe `cancelledCount` + `lastDate` YA CALCULADOS por el caller y los muestra como
// RESUMEN — no itera fechas ni lista turno por turno (D-03/D-11).
// Lo disparan las DOS vías: la del cliente (link de baja del mail) y la del dueño (panel). El cliente
// se entera SIEMPRE de que su fijo desapareció, sin checkbox opt-in (D-15): tenía un horario semanal
// reservado y que se esfume sin aviso es peor que un mail de más.
// NO menciona importe de ningún tipo (ni precio ni seña): v0.24 no cobra el abono.
// Reusa los helpers del módulo (resolveSender, fmtDate, renderEmailHeader, normalizeArWhatsApp,
// resendSend) para no duplicar el resolver del header From (que ya sanitiza) ni el POST a Resend.
export async function sendAbonoCancelledEmail({
  to,
  clientName,
  service,
  dayLabel,
  time,
  cancelledCount,
  lastDate,
  businessName,
  businessSlug,
  theme,
  palette,
  font,
  primaryOverride,
  logoUrl,
  whatsapp,
  resendApiKey,
  resendFrom,
}: {
  to: string
  clientName: string
  // Puede llegar vacío: el caller no siempre tiene el servicio de la serie. Con '' el mail se
  // renderiza igual, sin fila de detalle huérfana.
  service: string
  dayLabel: string // ej. "todos los lunes" (derivado de day_of_week por el caller)
  time: string
  cancelledCount: number // cuántos turnos futuros se cancelaron (ya contados por el caller)
  lastDate?: string | null // ISO 'yyyy-MM-dd' del último turno cancelado; sin dato → no se muestra
  businessName: string
  businessSlug: string
  theme?: string | null
  palette?: string | null
  font?: string | null
  primaryOverride?: string | null
  logoUrl?: string | null
  whatsapp?: string | null
  resendApiKey?: string | null
  resendFrom?: string | null
}) {
  // Mismo preámbulo que el resto de los templates del módulo (branding por tenant: paleta/override
  // del landing + fuente + texto de contraste). El escapado de clientName/businessName/rows YA está.
  const { key, from } = resolveSender(businessName, resendApiKey, resendFrom)
  const hora = time.slice(0, 5)
  const brand = brandEmail({ theme, palette, font, primaryOverride })
  const accent = brand.accent
  const waDigits = normalizeArWhatsApp(whatsapp)
  const waUrl = waDigits ? `https://wa.me/${waDigits}` : ''
  const headerInner = renderEmailHeader(businessName, logoUrl, { fontFamily: brand.headingFontFamily, textColor: brand.accentText, mutedColor: brand.accentTextMuted })
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gestion.forjo.studio'
  const bookingUrl = `${baseUrl}/${businessSlug}`

  const servicio = (service || '').trim()
  const ultimo = lastDate && lastDate.trim() ? fmtDate(lastDate.trim()) : ''
  // Concordancia de número: 1 turno / N turnos.
  const turnosLabel = cancelledCount === 1 ? '1 turno' : `${cancelledCount} turnos`

  // Las filas se arman como lista para que las opcionales (servicio, última fecha) no dejen una
  // fila vacía ni un borde colgando: el borde inferior se omite en la última fila real.
  // Los `value` van ESCAPADOS (WR-02): estas filas se interpolan crudas dentro del HTML. Las
  // versiones sin escapar (servicio, dayLabel, turnosLabel, ultimo) se siguen usando en el `text`.
  const rows: { label: string; value: string; capitalize?: boolean }[] = []
  if (servicio) rows.push({ label: 'Servicio', value: esc(servicio) })
  rows.push({ label: 'Se repetía', value: esc(dayLabel), capitalize: true })
  rows.push({ label: 'Hora', value: `${esc(hora)} hs` })
  rows.push({ label: 'Turnos cancelados', value: esc(turnosLabel) })
  if (ultimo) rows.push({ label: 'Último turno cancelado', value: esc(ultimo) })

  const rowsHtml = rows
    .map((r, i) => {
      const border = i < rows.length - 1 ? 'border-bottom:1px solid #eee;' : ''
      const caps = r.capitalize ? 'text-transform:capitalize;' : ''
      return `              <tr>
                <td style="font-size:12px;color:#999;padding:8px 0;${border}">${r.label}</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:8px 0;${border}text-align:right;${caps}">${r.value}</td>
              </tr>`
    })
    .join('\n')

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>${brand.fontLink}</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

      <tr><td style="background:${accent};padding:32px 40px;border-radius:12px 12px 0 0;text-align:center;">
        ${headerInner}
      </td></tr>

      <tr><td style="background:#ffffff;padding:40px 40px 32px;">
        <p style="font-size:22px;font-weight:700;color:#1a1a1a;font-family:${brand.headingFontFamily};margin:0 0 8px;">Tu turno fijo fue dado de baja</p>
        <p style="font-size:15px;color:#555;margin:0 0 32px;line-height:1.6;">
          Hola <strong>${esc(clientName)}</strong>, tu turno fijo semanal en <strong>${esc(businessName)}</strong> se dio de baja. Ese horario ya no queda reservado para vos todas las semanas.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-left:4px solid ${accent};border-radius:0 8px 8px 0;margin-bottom:24px;">
          <tr><td style="padding:20px 22px 6px;">
            <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;font-weight:600;margin-bottom:14px;">Turno fijo dado de baja</div>
          </td></tr>
          <tr><td style="padding:0 22px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0">
${rowsHtml}
            </table>
          </td></tr>
        </table>

        <p style="font-size:14px;color:#444;line-height:1.7;margin:0 0 18px;">Podés seguir reservando turnos sueltos cuando quieras.</p>
        <table cellpadding="0" cellspacing="0" style="margin:0;"><tr><td style="border-radius:8px;background:${accent};">
          <a href="${esc(bookingUrl)}" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:700;color:${brand.accentText};text-decoration:none;border-radius:8px;">Reservar un turno</a>
        </td></tr></table>
        ${waUrl ? `<p style="margin:14px 0 0;font-size:13px;"><a href="${waUrl}" style="color:#16a34a;font-weight:600;text-decoration:none;">Escribinos por WhatsApp →</a></p>` : ''}
      </td></tr>

      <tr><td style="background:${accent};padding:20px 40px;border-radius:0 0 12px 12px;text-align:center;">
        <div style="font-size:11px;color:${brand.accentTextMuted};">Enviado por Forjo Gestión · forjo.studio/${esc(businessSlug)}</div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`

  await resendSend(key, {
    from,
    to: [to],
    subject: `Tu turno fijo fue dado de baja — ${businessName}`,
    html,
    text: `Hola ${clientName}, tu turno fijo semanal en ${businessName} se dio de baja.\n${servicio ? `\nServicio: ${servicio}` : ''}\nSe repetía: ${dayLabel}\nHora: ${hora} hs\nTurnos cancelados: ${turnosLabel}${ultimo ? `\nÚltimo turno cancelado: ${ultimo}` : ''}\n\nPodés reservar un turno suelto cuando quieras: ${bookingUrl}`,
  })
  // Log SIN PII (IN-03): no se interpola el destinatario. La convención del proyecto pide prefijo de
  // módulo y nada de datos personales en los logs (la app maneja el vertical salud, Ley 25.326). El
  // contexto por abono lo aportan los console.error de los route handlers, que solo loguean ids.
  console.log('📧 [abonos/cancel] mail de baja enviado al cliente')
}

// Aviso al DUEÑO de que EL CLIENTE dio de baja su turno fijo desde el link público del mail (D-13).
// Sale ÚNICAMENTE por esa vía: cuando la baja la hace el propio dueño desde el panel NO se manda
// (ya la hizo él, avisarle de su propia acción es ruido).
// Es un template PROPIO y no un flag más de sendAdminNotification: esa función está atada a
// date/price/deposit de un turno suelto, y la baja de una serie no tiene ninguno de los tres.
// Igual que el mail al cliente: UN solo aviso por baja, con el conteo y la última fecha como
// resumen (D-14) y sin importes (v0.24 no cobra el abono).
export async function sendAbonoCancelledAdminNotification({
  to,
  clientName,
  clientPhone,
  clientEmail,
  service,
  dayLabel,
  time,
  cancelledCount,
  lastDate,
  businessName,
  theme,
  palette,
  font,
  primaryOverride,
  logoUrl,
  resendApiKey,
  resendFrom,
}: {
  to: string
  clientName: string
  clientPhone?: string | null
  clientEmail?: string | null
  service: string
  dayLabel: string
  time: string
  cancelledCount: number
  lastDate?: string | null
  businessName?: string | null
  theme?: string | null
  palette?: string | null
  font?: string | null
  primaryOverride?: string | null
  logoUrl?: string | null
  resendApiKey?: string | null
  resendFrom?: string | null
}) {
  const { key, from } = resolveSender(businessName, resendApiKey, resendFrom)
  const hora = time.slice(0, 5)
  // UNIFICACIÓN con los mails al cliente: el aviso al dueño deja de usar el header oscuro fijo
  // #1a1714 y pasa a la marca del negocio (paleta/override + fuente + texto de contraste).
  const brand = brandEmail({ theme, palette, font, primaryOverride })
  const servicio = (service || '').trim()
  const ultimo = lastDate && lastDate.trim() ? fmtDate(lastDate.trim()) : ''
  const turnosLabel = cancelledCount === 1 ? '1 turno' : `${cancelledCount} turnos`
  const statusLabel = '❌ Turno fijo dado de baja'
  const eyebrow = '❌ Turno fijo dado de baja'
  const badgeBg = '#fee2e2'
  const badgeColor = '#991b1b'
  const subject = `❌ Turno fijo dado de baja — ${clientName} · ${dayLabel} ${hora} hs`

  // Solo dígitos: el valor que va DENTRO del href de wa.me ya queda reducido por este reemplazo,
  // así que no necesita `esc` (no es un olvido). El teléfono que se MUESTRA sí se escapa abajo.
  const waPhone = clientPhone ? clientPhone.replace(/\D/g, '') : null

  // Los `value` van ESCAPADOS (WR-02) por el mismo motivo que en el mail al cliente: este aviso es
  // el destinatario que busca la cadena de ataque (el dueño lo lee como confiable).
  const rows: { label: string; value: string; capitalize?: boolean }[] = []
  if (servicio) rows.push({ label: 'Servicio', value: esc(servicio) })
  rows.push({ label: 'Se repetía', value: esc(dayLabel), capitalize: true })
  rows.push({ label: 'Hora', value: `${esc(hora)} hs` })
  rows.push({ label: 'Turnos cancelados', value: esc(turnosLabel) })
  if (ultimo) rows.push({ label: 'Último turno cancelado', value: esc(ultimo) })

  const rowsHtml = rows
    .map((r, i) => {
      const border = i < rows.length - 1 ? 'border-bottom:1px solid #eee;' : ''
      const caps = r.capitalize ? 'text-transform:capitalize;' : ''
      return `              <tr>
                <td style="font-size:12px;color:#999;padding:7px 0;${border}">${r.label}</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:7px 0;${border}text-align:right;${caps}">${r.value}</td>
              </tr>`
    })
    .join('\n')

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/>${brand.fontLink}</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
  <tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">

      <tr><td style="background:${brand.accent};padding:28px 36px;border-radius:12px 12px 0 0;text-align:center;">
        <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${brand.accentTextMuted};margin-bottom:10px;">${eyebrow}</div>
        ${renderEmailHeader(businessName || '', logoUrl, { fontFamily: brand.headingFontFamily, textColor: brand.accentText, mutedColor: brand.accentTextMuted })}
      </td></tr>

      <tr><td style="background:#ffffff;padding:32px 36px;">
        <div style="display:inline-block;background:${badgeBg};color:${badgeColor};font-size:12px;font-weight:700;padding:6px 14px;border-radius:20px;margin-bottom:20px;">${statusLabel}</div>

        <p style="font-size:14px;color:#555;margin:0 0 20px;line-height:1.6;">El cliente dio de baja su turno fijo desde el link del mail. El horario semanal quedó liberado.</p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-left:4px solid ${brand.accent};border-radius:0 8px 8px 0;margin-bottom:20px;">
          <tr><td style="padding:18px 20px;">
            <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;font-weight:600;margin-bottom:12px;">Turno fijo</div>
            <table width="100%" cellpadding="0" cellspacing="0">
${rowsHtml}
            </table>
          </td></tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:8px;">
          <tr><td style="padding:16px 18px;">
            <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#999;margin-bottom:10px;">Cliente</div>
            <div style="font-size:15px;font-weight:700;color:#1a1a1a;margin-bottom:6px;">${esc(clientName)}</div>
            ${waPhone ? `<div style="font-size:13px;margin-bottom:6px;"><a href="https://wa.me/${waPhone}" style="color:#16a34a;font-weight:600;text-decoration:none;">📱 ${esc(clientPhone)} — Abrir WhatsApp →</a></div>` : ''}
            ${clientEmail ? `<div style="font-size:13px;color:#555;">✉️ ${esc(clientEmail)}</div>` : ''}
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="background:${brand.accent};padding:18px 36px;border-radius:0 0 12px 12px;text-align:center;">
        <div style="font-size:11px;color:${brand.accentTextMuted};">Forjo Gestión · Panel de administración</div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`

  await resendSend(key, {
    from,
    to: [to],
    subject,
    html,
    text: `${statusLabel}\n\nCliente: ${clientName}\nTeléfono: ${clientPhone || '—'}\nEmail: ${clientEmail || '—'}\n${servicio ? `\nServicio: ${servicio}` : ''}\nSe repetía: ${dayLabel}\nHora: ${hora} hs\nTurnos cancelados: ${turnosLabel}${ultimo ? `\nÚltimo turno cancelado: ${ultimo}` : ''}`,
  })
  // Log SIN PII (IN-03), mismo criterio que el mail al cliente.
  console.log('🔔 [abonos/cancel] aviso de baja enviado al dueño')
}

export async function sendAdminNotification({
  to,
  clientName,
  clientPhone,
  clientEmail,
  service,
  price,
  deposit,
  date,
  time,
  businessName,
  theme,
  palette,
  font,
  primaryOverride,
  logoUrl,
  resendApiKey,
  resendFrom,
  pending = false,
  cancelled = false,
}: {
  to: string
  clientName: string
  clientPhone?: string | null
  clientEmail?: string | null
  service: string
  price: number
  deposit: number
  date: string
  time: string
  businessName?: string | null
  theme?: string | null
  palette?: string | null
  font?: string | null
  primaryOverride?: string | null
  logoUrl?: string | null
  resendApiKey?: string | null
  resendFrom?: string | null
  pending?: boolean
  // true → aviso al dueño de que un turno se canceló (en vez de uno nuevo).
  cancelled?: boolean
}) {
  const { key, from } = resolveSender(businessName, resendApiKey, resendFrom)
  const fecha = fmtDate(date)
  const hora = time.slice(0, 5)
  // UNIFICACIÓN con los mails al cliente: el aviso al dueño deja de usar el header oscuro fijo
  // #1a1714 y pasa a la marca del negocio (paleta/override + fuente + texto de contraste).
  const brand = brandEmail({ theme, palette, font, primaryOverride })
  const statusLabel = cancelled ? '❌ Turno cancelado' : (pending ? '⏳ Pendiente de pago' : '✅ Pago confirmado')
  const eyebrow = cancelled ? '❌ Turno cancelado' : (pending ? '⏳ Reserva pendiente' : '✅ Reserva confirmada')
  const badgeBg = cancelled ? '#fee2e2' : (pending ? '#fef3c7' : '#dcfce7')
  const badgeColor = cancelled ? '#991b1b' : (pending ? '#92400e' : '#166534')
  const subject = cancelled
    ? `❌ Turno cancelado — ${clientName} · ${fecha} ${hora} hs`
    : pending
      ? `⏳ Nueva reserva sin pagar — ${clientName} · ${fecha} ${hora} hs`
      : `✅ Nuevo turno confirmado — ${clientName} · ${fecha} ${hora} hs`

  const waPhone = clientPhone ? clientPhone.replace(/\D/g, '') : null

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/>${brand.fontLink}</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
  <tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">

      <tr><td style="background:${brand.accent};padding:28px 36px;border-radius:12px 12px 0 0;text-align:center;">
        <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${brand.accentTextMuted};margin-bottom:10px;">${eyebrow}</div>
        ${renderEmailHeader(businessName || '', logoUrl, { fontFamily: brand.headingFontFamily, textColor: brand.accentText, mutedColor: brand.accentTextMuted })}
      </td></tr>

      <tr><td style="background:#ffffff;padding:32px 36px;">
        <div style="display:inline-block;background:${badgeBg};color:${badgeColor};font-size:12px;font-weight:700;padding:6px 14px;border-radius:20px;margin-bottom:20px;">${statusLabel}</div>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-left:4px solid ${brand.accent};border-radius:0 8px 8px 0;margin-bottom:20px;">
          <tr><td style="padding:18px 20px;">
            <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;font-weight:600;margin-bottom:12px;">Turno</div>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:12px;color:#999;padding:7px 0;border-bottom:1px solid #eee;">Servicio</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:7px 0;border-bottom:1px solid #eee;text-align:right;">${esc(service)}</td>
              </tr>
              <tr>
                <td style="font-size:12px;color:#999;padding:7px 0;border-bottom:1px solid #eee;">Fecha</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:7px 0;border-bottom:1px solid #eee;text-align:right;">${fecha}</td>
              </tr>
              <tr>
                <td style="font-size:12px;color:#999;padding:7px 0;border-bottom:1px solid #eee;">Hora</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:7px 0;border-bottom:1px solid #eee;text-align:right;">${hora} hs</td>
              </tr>
              <tr>
                <td style="font-size:12px;color:#999;padding:8px 0 0;">Total</td>
                <td style="font-size:18px;font-weight:900;color:${brand.accent};padding:8px 0 0;text-align:right;">${fmtPrice(price)}${deposit > 0 ? ` <span style="font-size:12px;color:#16a34a;font-weight:600;">(seña: ${fmtPrice(deposit)})</span>` : ''}</td>
              </tr>
            </table>
          </td></tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:8px;">
          <tr><td style="padding:16px 18px;">
            <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#999;margin-bottom:10px;">Cliente</div>
            <div style="font-size:15px;font-weight:700;color:#1a1a1a;margin-bottom:6px;">${esc(clientName)}</div>
            ${waPhone ? `<div style="font-size:13px;margin-bottom:6px;"><a href="https://wa.me/${waPhone}" style="color:#16a34a;font-weight:600;text-decoration:none;">📱 ${esc(clientPhone)} — Abrir WhatsApp →</a></div>` : ''}
            ${clientEmail ? `<div style="font-size:13px;color:#555;">✉️ ${esc(clientEmail)}</div>` : ''}
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="background:${brand.accent};padding:18px 36px;border-radius:0 0 12px 12px;text-align:center;">
        <div style="font-size:11px;color:${brand.accentTextMuted};">Forjo Gestión · Panel de administración</div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`

  await resendSend(key, {
    from,
    to: [to],
    subject,
    html,
    text: `${statusLabel}\n\nCliente: ${clientName}\nTeléfono: ${clientPhone || '—'}\nEmail: ${clientEmail || '—'}\n\nServicio: ${service}\nFecha: ${fecha}\nHora: ${hora} hs\nTotal: ${fmtPrice(price)}${deposit > 0 ? `\nSeña: ${fmtPrice(deposit)}` : ''}`,
  })
  console.log(`🔔 Notificación admin enviada a ${to} (${cancelled ? 'cancelado' : pending ? 'pendiente' : 'confirmado'})`)
}

// Email al cliente cuando EL NEGOCIO cancela el turno desde el panel de administración.
// Si había seña abonada, avisa que el negocio se va a contactar para coordinar la
// devolución/reprogramación — la devolución es MANUAL, NO se promete reintegro automático.
export async function sendBusinessCancelEmail({
  to,
  clientName,
  service,
  date,
  time,
  businessName,
  businessSlug,
  theme,
  palette,
  font,
  primaryOverride,
  logoUrl,
  whatsapp,
  depositPaid,
  depositAmount,
  resendApiKey,
  resendFrom,
}: {
  to: string
  clientName: string
  service: string
  date: string
  time: string
  businessName: string
  businessSlug: string
  theme?: string | null
  palette?: string | null
  font?: string | null
  primaryOverride?: string | null
  logoUrl?: string | null
  whatsapp?: string | null
  depositPaid?: boolean
  depositAmount?: number
  resendApiKey?: string | null
  resendFrom?: string | null
}) {
  const { key, from } = resolveSender(businessName, resendApiKey, resendFrom)
  const fecha = fmtDate(date)
  const hora = time.slice(0, 5)
  const brand = brandEmail({ theme, palette, font, primaryOverride })
  const accent = brand.accent
  const headerInner = renderEmailHeader(businessName, logoUrl, { fontFamily: brand.headingFontFamily, textColor: brand.accentText, mutedColor: brand.accentTextMuted })
  const waDigits = normalizeArWhatsApp(whatsapp)
  const waUrl = waDigits ? `https://wa.me/${waDigits}` : ''
  // Solo mencionamos la devolución si efectivamente hubo seña abonada.
  const hadDeposit = !!depositPaid && Number(depositAmount) > 0

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>${brand.fontLink}</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

      <tr><td style="background:${accent};padding:32px 40px;border-radius:12px 12px 0 0;text-align:center;">
        ${headerInner}
      </td></tr>

      <tr><td style="background:#ffffff;padding:40px 40px 32px;">
        <p style="font-size:22px;font-weight:700;color:#1a1a1a;font-family:${brand.headingFontFamily};margin:0 0 8px;">Tu turno fue cancelado</p>
        <p style="font-size:15px;color:#555;margin:0 0 28px;line-height:1.6;">
          Hola <strong>${esc(clientName)}</strong>, lamentamos avisarte que <strong>${esc(businessName)}</strong> canceló el siguiente turno.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-left:4px solid ${accent};border-radius:0 8px 8px 0;margin-bottom:24px;">
          <tr><td style="padding:20px 22px 6px;">
            <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;font-weight:600;margin-bottom:14px;">Turno cancelado</div>
          </td></tr>
          <tr><td style="padding:0 22px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:12px;color:#999;padding:8px 0;border-bottom:1px solid #eee;">Servicio</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${esc(service)}</td>
              </tr>
              <tr>
                <td style="font-size:12px;color:#999;padding:8px 0;border-bottom:1px solid #eee;">Fecha</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${fecha}</td>
              </tr>
              <tr>
                <td style="font-size:12px;color:#999;padding:8px 0;">Hora</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:8px 0;text-align:right;">${hora} hs</td>
              </tr>
            </table>
          </td></tr>
        </table>

        ${hadDeposit ? `
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;margin-bottom:20px;">
          <tr><td style="padding:16px 18px;">
            <div style="font-size:13px;font-weight:700;color:#9a3412;margin-bottom:6px;">Sobre tu seña (${fmtPrice(Number(depositAmount))})</div>
            <div style="font-size:13px;color:#7c2d12;line-height:1.6;">El negocio se va a contactar con vos para coordinar la <strong>devolución o la reprogramación</strong> del turno. No hace falta que hagas nada por ahora.</div>
          </td></tr>
        </table>` : ''}

        <p style="font-size:13px;color:#777;line-height:1.7;margin:0;">Si tenés dudas, podés comunicarte directamente con el negocio.</p>
        ${waUrl ? `<p style="margin:14px 0 0;font-size:13px;"><a href="${waUrl}" style="color:#16a34a;font-weight:600;text-decoration:none;">Escribinos por WhatsApp →</a></p>` : ''}
      </td></tr>

      <tr><td style="background:${accent};padding:20px 40px;border-radius:0 0 12px 12px;text-align:center;">
        <div style="font-size:11px;color:${brand.accentTextMuted};">Enviado por Forjo Gestión · forjo.studio/${esc(businessSlug)}</div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`

  await resendSend(key, {
    from,
    to: [to],
    subject: `Turno cancelado — ${businessName} · ${fecha} ${hora} hs`,
    html,
    text: `Hola ${clientName}, ${businessName} canceló tu turno.\n\nServicio: ${service}\nFecha: ${fecha}\nHora: ${hora} hs${hadDeposit ? `\n\nTenías una seña abonada de ${fmtPrice(Number(depositAmount))}. El negocio se va a contactar con vos para coordinar la devolución o la reprogramación.` : ''}`,
  })
  console.log(`📧 Cancelación (negocio) enviada a ${to}`)
}

// Email al cliente cuando ÉL MISMO cancela el turno desde /cancelar/[token].
// Confirma la cancelación e invita a reprogramar con un botón a la página pública de
// booking del negocio (/[slug]).
export async function sendClientCancelEmail({
  to,
  clientName,
  service,
  date,
  time,
  businessName,
  businessSlug,
  theme,
  palette,
  font,
  primaryOverride,
  logoUrl,
  resendApiKey,
  resendFrom,
}: {
  to: string
  clientName: string
  service: string
  date: string
  time: string
  businessName: string
  businessSlug: string
  theme?: string | null
  palette?: string | null
  font?: string | null
  primaryOverride?: string | null
  logoUrl?: string | null
  resendApiKey?: string | null
  resendFrom?: string | null
}) {
  const { key, from } = resolveSender(businessName, resendApiKey, resendFrom)
  const fecha = fmtDate(date)
  const hora = time.slice(0, 5)
  const brand = brandEmail({ theme, palette, font, primaryOverride })
  const accent = brand.accent
  const headerInner = renderEmailHeader(businessName, logoUrl, { fontFamily: brand.headingFontFamily, textColor: brand.accentText, mutedColor: brand.accentTextMuted })
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gestion.forjo.studio'
  const bookingUrl = `${baseUrl}/${businessSlug}`

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>${brand.fontLink}</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

      <tr><td style="background:${accent};padding:32px 40px;border-radius:12px 12px 0 0;text-align:center;">
        ${headerInner}
      </td></tr>

      <tr><td style="background:#ffffff;padding:40px 40px 32px;">
        <p style="font-size:22px;font-weight:700;color:#1a1a1a;font-family:${brand.headingFontFamily};margin:0 0 8px;">Turno cancelado</p>
        <p style="font-size:15px;color:#555;margin:0 0 28px;line-height:1.6;">
          Hola <strong>${esc(clientName)}</strong>, confirmamos que cancelaste tu turno en <strong>${esc(businessName)}</strong>. El horario quedó liberado.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-left:4px solid ${accent};border-radius:0 8px 8px 0;margin-bottom:24px;">
          <tr><td style="padding:20px 22px 6px;">
            <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;font-weight:600;margin-bottom:14px;">Turno cancelado</div>
          </td></tr>
          <tr><td style="padding:0 22px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:12px;color:#999;padding:8px 0;border-bottom:1px solid #eee;">Servicio</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${esc(service)}</td>
              </tr>
              <tr>
                <td style="font-size:12px;color:#999;padding:8px 0;border-bottom:1px solid #eee;">Fecha</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${fecha}</td>
              </tr>
              <tr>
                <td style="font-size:12px;color:#999;padding:8px 0;">Hora</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:8px 0;text-align:right;">${hora} hs</td>
              </tr>
            </table>
          </td></tr>
        </table>

        <p style="font-size:14px;color:#444;line-height:1.7;margin:0 0 18px;">¿Cambió tu plan? Podés sacar un nuevo turno cuando quieras.</p>
        <table cellpadding="0" cellspacing="0" style="margin:0;"><tr><td style="border-radius:8px;background:${accent};">
          <a href="${esc(bookingUrl)}" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:700;color:${brand.accentText};text-decoration:none;border-radius:8px;">Reservar otro turno</a>
        </td></tr></table>
      </td></tr>

      <tr><td style="background:${accent};padding:20px 40px;border-radius:0 0 12px 12px;text-align:center;">
        <div style="font-size:11px;color:${brand.accentTextMuted};">Enviado por Forjo Gestión · forjo.studio/${esc(businessSlug)}</div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`

  await resendSend(key, {
    from,
    to: [to],
    subject: `Turno cancelado — ${businessName} · ${fecha} ${hora} hs`,
    html,
    text: `Hola ${clientName}, confirmamos que cancelaste tu turno en ${businessName}.\n\nServicio: ${service}\nFecha: ${fecha}\nHora: ${hora} hs\n\n¿Querés reprogramar? Reservá otro turno: ${bookingUrl}`,
  })
  console.log(`📧 Cancelación (cliente) enviada a ${to}`)
}

// Email al cliente cuando reservó un turno con seña y queda PENDIENTE de pago. Ofrece
// completar el pago (link de retry por token) y cancelar (link por token). Avisa que si no
// se paga, el turno se cancela solo en ~expiryHours. Se dispara al crear el pending_payment.
export async function sendPendingPaymentEmail({
  to,
  clientName,
  service,
  date,
  time,
  businessName,
  theme,
  palette,
  font,
  primaryOverride,
  logoUrl,
  depositAmount,
  expiryHours,
  token,
  resendApiKey,
  resendFrom,
}: {
  to: string
  clientName: string
  service: string
  date: string
  time: string
  businessName: string
  theme?: string | null
  palette?: string | null
  font?: string | null
  primaryOverride?: string | null
  logoUrl?: string | null
  depositAmount: number
  expiryHours: number
  token: string
  resendApiKey?: string | null
  resendFrom?: string | null
}) {
  const { key, from } = resolveSender(businessName, resendApiKey, resendFrom)
  const fecha = fmtDate(date)
  const hora = time.slice(0, 5)
  const brand = brandEmail({ theme, palette, font, primaryOverride })
  const accent = brand.accent
  const headerInner = renderEmailHeader(businessName, logoUrl, { fontFamily: brand.headingFontFamily, textColor: brand.accentText, mutedColor: brand.accentTextMuted })
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gestion.forjo.studio'
  const payUrl = `${baseUrl}/api/payment/retry/${token}`
  const cancelUrl = `${baseUrl}/cancelar/${token}`
  const horas = expiryHours === 1 ? '1 hora' : `${expiryHours} horas`

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>${brand.fontLink}</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

      <tr><td style="background:${accent};padding:32px 40px;border-radius:12px 12px 0 0;text-align:center;">
        ${headerInner}
      </td></tr>

      <tr><td style="background:#ffffff;padding:40px 40px 32px;">
        <p style="font-size:22px;font-weight:700;color:#1a1a1a;font-family:${brand.headingFontFamily};margin:0 0 8px;">Falta pagar la seña</p>
        <p style="font-size:15px;color:#555;margin:0 0 28px;line-height:1.6;">
          Hola <strong>${esc(clientName)}</strong>, tu turno en <strong>${esc(businessName)}</strong> quedó reservado pero <strong>todavía no está confirmado</strong>: falta abonar la seña.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-left:4px solid ${accent};border-radius:0 8px 8px 0;margin-bottom:24px;">
          <tr><td style="padding:20px 22px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:12px;color:#999;padding:8px 0;border-bottom:1px solid #eee;">Servicio</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${esc(service)}</td>
              </tr>
              <tr>
                <td style="font-size:12px;color:#999;padding:8px 0;border-bottom:1px solid #eee;">Fecha</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${fecha}</td>
              </tr>
              <tr>
                <td style="font-size:12px;color:#999;padding:8px 0;border-bottom:1px solid #eee;">Hora</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${hora} hs</td>
              </tr>
              <tr>
                <td style="font-size:12px;color:#999;padding:10px 0 0;">Seña a pagar</td>
                <td style="font-size:20px;font-weight:900;color:${accent};padding:10px 0 0;text-align:right;">${fmtPrice(depositAmount)}</td>
              </tr>
            </table>
          </td></tr>
        </table>

        <table cellpadding="0" cellspacing="0" style="margin:0 0 14px;"><tr><td style="border-radius:8px;background:${accent};">
          <a href="${payUrl}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:700;color:${brand.accentText};text-decoration:none;border-radius:8px;">Completar pago</a>
        </td></tr></table>

        <p style="font-size:13px;color:#777;line-height:1.7;margin:0 0 16px;">
          Si no completás el pago, el turno se cancela automáticamente en aproximadamente <strong>${horas}</strong> y el horario queda libre para otra persona.
        </p>
        <p style="margin:0;font-size:13px;"><a href="${cancelUrl}" style="color:#999;text-decoration:underline;">Prefiero cancelar este turno</a></p>
      </td></tr>

      <tr><td style="background:${accent};padding:20px 40px;border-radius:0 0 12px 12px;text-align:center;">
        <div style="font-size:11px;color:${brand.accentTextMuted};">Enviado por Forjo Gestión</div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`

  await resendSend(key, {
    from,
    to: [to],
    subject: `Falta pagar la seña — ${businessName} · ${fecha} ${hora} hs`,
    html,
    text: `Hola ${clientName}, tu turno en ${businessName} quedó reservado pero falta abonar la seña (${fmtPrice(depositAmount)}).\n\nServicio: ${service}\nFecha: ${fecha}\nHora: ${hora} hs\n\nCompletá el pago: ${payUrl}\n\nSi no pagás, el turno se cancela en ~${horas}.\nCancelar: ${cancelUrl}`,
  })
  console.log(`📧 Seña pendiente enviada a ${to}`)
}

// Email al cliente cuando el SISTEMA cancela su reserva por no haberse pagado la seña dentro
// del plazo (lo dispara el cron cancel-expired). Avisa que se liberó el horario y ofrece
// reservar de nuevo. Distinto del "cancelado por el cliente": acá nadie canceló a mano.
export async function sendExpiredHoldEmail({
  to,
  clientName,
  service,
  date,
  time,
  businessName,
  businessSlug,
  theme,
  palette,
  font,
  primaryOverride,
  logoUrl,
  resendApiKey,
  resendFrom,
}: {
  to: string
  clientName: string
  service: string
  date: string
  time: string
  businessName: string
  businessSlug: string
  theme?: string | null
  palette?: string | null
  font?: string | null
  primaryOverride?: string | null
  logoUrl?: string | null
  resendApiKey?: string | null
  resendFrom?: string | null
}) {
  const { key, from } = resolveSender(businessName, resendApiKey, resendFrom)
  const fecha = fmtDate(date)
  const hora = time.slice(0, 5)
  const brand = brandEmail({ theme, palette, font, primaryOverride })
  const accent = brand.accent
  const headerInner = renderEmailHeader(businessName, logoUrl, { fontFamily: brand.headingFontFamily, textColor: brand.accentText, mutedColor: brand.accentTextMuted })
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gestion.forjo.studio'
  const bookingUrl = `${baseUrl}/${businessSlug}`

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>${brand.fontLink}</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

      <tr><td style="background:${accent};padding:32px 40px;border-radius:12px 12px 0 0;text-align:center;">
        ${headerInner}
      </td></tr>

      <tr><td style="background:#ffffff;padding:40px 40px 32px;">
        <p style="font-size:22px;font-weight:700;color:#1a1a1a;font-family:${brand.headingFontFamily};margin:0 0 8px;">Tu reserva se canceló</p>
        <p style="font-size:15px;color:#555;margin:0 0 28px;line-height:1.6;">
          Hola <strong>${esc(clientName)}</strong>, tu reserva en <strong>${esc(businessName)}</strong> se canceló automáticamente porque no se completó el pago de la seña dentro del plazo. El horario quedó liberado.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-left:4px solid ${accent};border-radius:0 8px 8px 0;margin-bottom:24px;">
          <tr><td style="padding:20px 22px 6px;">
            <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;font-weight:600;margin-bottom:14px;">Reserva cancelada</div>
          </td></tr>
          <tr><td style="padding:0 22px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:12px;color:#999;padding:8px 0;border-bottom:1px solid #eee;">Servicio</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${esc(service)}</td>
              </tr>
              <tr>
                <td style="font-size:12px;color:#999;padding:8px 0;border-bottom:1px solid #eee;">Fecha</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${fecha}</td>
              </tr>
              <tr>
                <td style="font-size:12px;color:#999;padding:8px 0;">Hora</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:8px 0;text-align:right;">${hora} hs</td>
              </tr>
            </table>
          </td></tr>
        </table>

        <p style="font-size:14px;color:#444;line-height:1.7;margin:0 0 18px;">¿Lo querés intentar de nuevo? Reservá otro turno y completá la seña a tiempo.</p>
        <table cellpadding="0" cellspacing="0" style="margin:0;"><tr><td style="border-radius:8px;background:${accent};">
          <a href="${esc(bookingUrl)}" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:700;color:${brand.accentText};text-decoration:none;border-radius:8px;">Reservar otro turno</a>
        </td></tr></table>
      </td></tr>

      <tr><td style="background:${accent};padding:20px 40px;border-radius:0 0 12px 12px;text-align:center;">
        <div style="font-size:11px;color:${brand.accentTextMuted};">Enviado por Forjo Gestión · forjo.studio/${esc(businessSlug)}</div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`

  await resendSend(key, {
    from,
    to: [to],
    subject: `Reserva cancelada (sin seña) — ${businessName} · ${fecha} ${hora} hs`,
    html,
    text: `Hola ${clientName}, tu reserva en ${businessName} se canceló porque no se completó el pago de la seña a tiempo. El horario quedó liberado.\n\nServicio: ${service}\nFecha: ${fecha}\nHora: ${hora} hs\n\n¿Reintentar? Reservá otro turno: ${bookingUrl}`,
  })
  console.log(`📧 Cancelación por seña vencida enviada a ${to}`)
}
