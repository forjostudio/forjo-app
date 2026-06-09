import { normalizeArWhatsApp } from '@/lib/whatsapp'

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
function renderEmailHeader(businessName: string, logoUrl?: string | null): string {
  const safeName = businessName || 'Forjo Gestión'
  if (logoUrl) {
    return `<table cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;"><tr>
        <td style="padding-right:12px;vertical-align:middle;"><img src="${logoUrl}" alt="${safeName}" height="44" style="max-height:44px;border-radius:8px;display:block;"/></td>
        <td style="vertical-align:middle;"><div style="font-size:20px;font-weight:800;letter-spacing:1px;color:#ffffff;">${safeName.toUpperCase()}</div></td>
      </tr></table>`
  }
  return `<div style="font-size:22px;font-weight:800;letter-spacing:2px;color:#ffffff;">${safeName.toUpperCase()}</div>
        <div style="font-size:12px;color:rgba(255,255,255,.6);margin-top:4px;letter-spacing:1px;text-transform:uppercase;">Gestión de turnos</div>`
}

// POST crudo a Resend. Tira error con el detalle si Resend responde !ok (para que el
// caller logee el motivo real y persista el fallo). No traga nada.
async function resendSend(key: string, payload: Record<string, unknown>) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
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
  primaryColor,
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
  primaryColor?: string | null
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

  // Branding parametrizado: el acento toma el color del negocio (a futuro, la paleta del
  // theme) sin reescribir el template. Fallback al rojo Forjo.
  const accent = (primaryColor && primaryColor.trim()) || '#d94a2b'
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gestion.forjo.studio'
  const cancelUrl = cancelToken ? `${baseUrl}/cancelar/${cancelToken}` : ''
  // Normaliza por las dudas (idempotente): cubre valores viejos sin normalizar. Si no es
  // un número usable, se omite el link.
  const waDigits = normalizeArWhatsApp(whatsapp)
  const waUrl = waDigits ? `https://wa.me/${waDigits}` : ''
  // Header: logo + nombre del negocio juntos (o solo el nombre si no hay logo).
  const headerInner = renderEmailHeader(businessName, logoUrl)

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

      <tr><td style="background:${accent};padding:32px 40px;border-radius:12px 12px 0 0;text-align:center;">
        ${headerInner}
      </td></tr>

      <tr><td style="background:#ffffff;padding:40px 40px 32px;">
        <p style="font-size:22px;font-weight:700;color:#1a1a1a;margin:0 0 8px;">¡Tu turno está confirmado!</p>
        <p style="font-size:15px;color:#555;margin:0 0 32px;line-height:1.6;">
          Hola <strong>${clientName}</strong>, aquí está el resumen de tu reserva en <strong>${businessName}</strong>.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-left:4px solid ${accent};border-radius:0 8px 8px 0;margin-bottom:24px;">
          <tr><td style="padding:20px 22px 6px;">
            <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;font-weight:600;margin-bottom:14px;">Detalle del turno</div>
          </td></tr>
          <tr><td style="padding:0 22px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:12px;color:#999;padding:8px 0;border-bottom:1px solid #eee;">Servicio</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${service}</td>
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
          <a href="${cancelUrl}" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">Cancelar turno</a>
        </td></tr></table>` : ''}
        ${waUrl ? `<p style="margin:14px 0 0;font-size:13px;"><a href="${waUrl}" style="color:#16a34a;font-weight:600;text-decoration:none;">Escribinos por WhatsApp →</a></p>` : ''}
      </td></tr>

      <tr><td style="background:${accent};padding:20px 40px;border-radius:0 0 12px 12px;text-align:center;">
        <div style="font-size:11px;color:rgba(255,255,255,.7);">Enviado por Forjo Gestión · forjo.studio/${businessSlug}</div>
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
  resendApiKey,
  resendFrom,
  pending = false,
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
  resendApiKey?: string | null
  resendFrom?: string | null
  pending?: boolean
}) {
  const { key, from } = resolveSender(businessName, resendApiKey, resendFrom)
  const fecha = fmtDate(date)
  const hora = time.slice(0, 5)
  const statusLabel = pending ? '⏳ Pendiente de pago' : '✅ Pago confirmado'
  const subject = pending
    ? `⏳ Nueva reserva sin pagar — ${clientName} · ${fecha} ${hora} hs`
    : `✅ Nuevo turno confirmado — ${clientName} · ${fecha} ${hora} hs`

  const waPhone = clientPhone ? clientPhone.replace(/\D/g, '') : null

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
  <tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">

      <tr><td style="background:#1a1714;padding:28px 36px;border-radius:12px 12px 0 0;">
        <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,.4);margin-bottom:4px;">${pending ? '⏳ Reserva pendiente' : '✅ Reserva confirmada'}</div>
        <div style="font-size:26px;font-weight:800;letter-spacing:2px;color:#f3ead8;">Panel de gestión</div>
      </td></tr>

      <tr><td style="background:#ffffff;padding:32px 36px;">
        <div style="display:inline-block;background:${pending ? '#fef3c7' : '#dcfce7'};color:${pending ? '#92400e' : '#166534'};font-size:12px;font-weight:700;padding:6px 14px;border-radius:20px;margin-bottom:20px;">${statusLabel}</div>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-left:4px solid #1a1714;border-radius:0 8px 8px 0;margin-bottom:20px;">
          <tr><td style="padding:18px 20px;">
            <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;font-weight:600;margin-bottom:12px;">Turno</div>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:12px;color:#999;padding:7px 0;border-bottom:1px solid #eee;">Servicio</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:7px 0;border-bottom:1px solid #eee;text-align:right;">${service}</td>
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
                <td style="font-size:18px;font-weight:900;color:#1a1714;padding:8px 0 0;text-align:right;">${fmtPrice(price)}${deposit > 0 ? ` <span style="font-size:12px;color:#16a34a;font-weight:600;">(seña: ${fmtPrice(deposit)})</span>` : ''}</td>
              </tr>
            </table>
          </td></tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:8px;">
          <tr><td style="padding:16px 18px;">
            <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#999;margin-bottom:10px;">Cliente</div>
            <div style="font-size:15px;font-weight:700;color:#1a1a1a;margin-bottom:6px;">${clientName}</div>
            ${waPhone ? `<div style="font-size:13px;margin-bottom:6px;"><a href="https://wa.me/${waPhone}" style="color:#16a34a;font-weight:600;text-decoration:none;">📱 ${clientPhone} — Abrir WhatsApp →</a></div>` : ''}
            ${clientEmail ? `<div style="font-size:13px;color:#555;">✉️ ${clientEmail}</div>` : ''}
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="background:#1a1714;padding:18px 36px;border-radius:0 0 12px 12px;text-align:center;">
        <div style="font-size:11px;color:#555;">Forjo Gestión · Panel de administración</div>
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
  console.log(`🔔 Notificación admin enviada a ${to} (${pending ? 'pendiente' : 'confirmado'})`)
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
  primaryColor,
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
  primaryColor?: string | null
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
  const accent = (primaryColor && primaryColor.trim()) || '#d94a2b'
  const headerInner = renderEmailHeader(businessName, logoUrl)
  const waDigits = normalizeArWhatsApp(whatsapp)
  const waUrl = waDigits ? `https://wa.me/${waDigits}` : ''
  // Solo mencionamos la devolución si efectivamente hubo seña abonada.
  const hadDeposit = !!depositPaid && Number(depositAmount) > 0

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

      <tr><td style="background:${accent};padding:32px 40px;border-radius:12px 12px 0 0;text-align:center;">
        ${headerInner}
      </td></tr>

      <tr><td style="background:#ffffff;padding:40px 40px 32px;">
        <p style="font-size:22px;font-weight:700;color:#1a1a1a;margin:0 0 8px;">Tu turno fue cancelado</p>
        <p style="font-size:15px;color:#555;margin:0 0 28px;line-height:1.6;">
          Hola <strong>${clientName}</strong>, lamentamos avisarte que <strong>${businessName}</strong> canceló el siguiente turno.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-left:4px solid ${accent};border-radius:0 8px 8px 0;margin-bottom:24px;">
          <tr><td style="padding:20px 22px 6px;">
            <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;font-weight:600;margin-bottom:14px;">Turno cancelado</div>
          </td></tr>
          <tr><td style="padding:0 22px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:12px;color:#999;padding:8px 0;border-bottom:1px solid #eee;">Servicio</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${service}</td>
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
        <div style="font-size:11px;color:rgba(255,255,255,.7);">Enviado por Forjo Gestión · forjo.studio/${businessSlug}</div>
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
  primaryColor,
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
  primaryColor?: string | null
  logoUrl?: string | null
  resendApiKey?: string | null
  resendFrom?: string | null
}) {
  const { key, from } = resolveSender(businessName, resendApiKey, resendFrom)
  const fecha = fmtDate(date)
  const hora = time.slice(0, 5)
  const accent = (primaryColor && primaryColor.trim()) || '#d94a2b'
  const headerInner = renderEmailHeader(businessName, logoUrl)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gestion.forjo.studio'
  const bookingUrl = `${baseUrl}/${businessSlug}`

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

      <tr><td style="background:${accent};padding:32px 40px;border-radius:12px 12px 0 0;text-align:center;">
        ${headerInner}
      </td></tr>

      <tr><td style="background:#ffffff;padding:40px 40px 32px;">
        <p style="font-size:22px;font-weight:700;color:#1a1a1a;margin:0 0 8px;">Turno cancelado</p>
        <p style="font-size:15px;color:#555;margin:0 0 28px;line-height:1.6;">
          Hola <strong>${clientName}</strong>, confirmamos que cancelaste tu turno en <strong>${businessName}</strong>. El horario quedó liberado.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-left:4px solid ${accent};border-radius:0 8px 8px 0;margin-bottom:24px;">
          <tr><td style="padding:20px 22px 6px;">
            <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;font-weight:600;margin-bottom:14px;">Turno cancelado</div>
          </td></tr>
          <tr><td style="padding:0 22px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:12px;color:#999;padding:8px 0;border-bottom:1px solid #eee;">Servicio</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${service}</td>
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
          <a href="${bookingUrl}" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">Reservar otro turno</a>
        </td></tr></table>
      </td></tr>

      <tr><td style="background:${accent};padding:20px 40px;border-radius:0 0 12px 12px;text-align:center;">
        <div style="font-size:11px;color:rgba(255,255,255,.7);">Enviado por Forjo Gestión · forjo.studio/${businessSlug}</div>
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
  primaryColor,
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
  primaryColor?: string | null
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
  const accent = (primaryColor && primaryColor.trim()) || '#d94a2b'
  const headerInner = renderEmailHeader(businessName, logoUrl)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gestion.forjo.studio'
  const payUrl = `${baseUrl}/api/payment/retry/${token}`
  const cancelUrl = `${baseUrl}/cancelar/${token}`
  const horas = expiryHours === 1 ? '1 hora' : `${expiryHours} horas`

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

      <tr><td style="background:${accent};padding:32px 40px;border-radius:12px 12px 0 0;text-align:center;">
        ${headerInner}
      </td></tr>

      <tr><td style="background:#ffffff;padding:40px 40px 32px;">
        <p style="font-size:22px;font-weight:700;color:#1a1a1a;margin:0 0 8px;">Falta pagar la seña</p>
        <p style="font-size:15px;color:#555;margin:0 0 28px;line-height:1.6;">
          Hola <strong>${clientName}</strong>, tu turno en <strong>${businessName}</strong> quedó reservado pero <strong>todavía no está confirmado</strong>: falta abonar la seña.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-left:4px solid ${accent};border-radius:0 8px 8px 0;margin-bottom:24px;">
          <tr><td style="padding:20px 22px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:12px;color:#999;padding:8px 0;border-bottom:1px solid #eee;">Servicio</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${service}</td>
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
          <a href="${payUrl}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">Completar pago</a>
        </td></tr></table>

        <p style="font-size:13px;color:#777;line-height:1.7;margin:0 0 16px;">
          Si no completás el pago, el turno se cancela automáticamente en aproximadamente <strong>${horas}</strong> y el horario queda libre para otra persona.
        </p>
        <p style="margin:0;font-size:13px;"><a href="${cancelUrl}" style="color:#999;text-decoration:underline;">Prefiero cancelar este turno</a></p>
      </td></tr>

      <tr><td style="background:${accent};padding:20px 40px;border-radius:0 0 12px 12px;text-align:center;">
        <div style="font-size:11px;color:rgba(255,255,255,.7);">Enviado por Forjo Gestión</div>
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
  primaryColor,
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
  primaryColor?: string | null
  logoUrl?: string | null
  resendApiKey?: string | null
  resendFrom?: string | null
}) {
  const { key, from } = resolveSender(businessName, resendApiKey, resendFrom)
  const fecha = fmtDate(date)
  const hora = time.slice(0, 5)
  const accent = (primaryColor && primaryColor.trim()) || '#d94a2b'
  const headerInner = renderEmailHeader(businessName, logoUrl)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gestion.forjo.studio'
  const bookingUrl = `${baseUrl}/${businessSlug}`

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

      <tr><td style="background:${accent};padding:32px 40px;border-radius:12px 12px 0 0;text-align:center;">
        ${headerInner}
      </td></tr>

      <tr><td style="background:#ffffff;padding:40px 40px 32px;">
        <p style="font-size:22px;font-weight:700;color:#1a1a1a;margin:0 0 8px;">Tu reserva se canceló</p>
        <p style="font-size:15px;color:#555;margin:0 0 28px;line-height:1.6;">
          Hola <strong>${clientName}</strong>, tu reserva en <strong>${businessName}</strong> se canceló automáticamente porque no se completó el pago de la seña dentro del plazo. El horario quedó liberado.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-left:4px solid ${accent};border-radius:0 8px 8px 0;margin-bottom:24px;">
          <tr><td style="padding:20px 22px 6px;">
            <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;font-weight:600;margin-bottom:14px;">Reserva cancelada</div>
          </td></tr>
          <tr><td style="padding:0 22px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:12px;color:#999;padding:8px 0;border-bottom:1px solid #eee;">Servicio</td>
                <td style="font-size:13px;font-weight:600;color:#1a1a1a;padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${service}</td>
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
          <a href="${bookingUrl}" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">Reservar otro turno</a>
        </td></tr></table>
      </td></tr>

      <tr><td style="background:${accent};padding:20px 40px;border-radius:0 0 12px 12px;text-align:center;">
        <div style="font-size:11px;color:rgba(255,255,255,.7);">Enviado por Forjo Gestión · forjo.studio/${businessSlug}</div>
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
