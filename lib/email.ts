// From de la cuenta Resend de Forjo: forjo.studio está verificado ahí.
const GLOBAL_FROM = 'Forjo Gestión <notificaciones@forjo.studio>'

// Decide con qué key y qué "from" mandar, según la config del negocio:
// - Key propia del negocio → hay que mandar desde SU dominio verificado (resend_from).
//   Sin resend_from, mandar con @forjo.studio daría 403 (dominio no verificado en su
//   cuenta) → NO enviamos y tiramos un error claro en vez de fallar silencioso.
// - Sin key propia → key global de Forjo + from @forjo.studio (dominio verificado).
function resolveSender(resendApiKey?: string | null, resendFrom?: string | null): { key: string; from: string } {
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
  return { key: globalKey, from: GLOBAL_FROM }
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
  resendApiKey?: string | null
  resendFrom?: string | null
}) {
  // Resuelve key + from (tira error claro si el negocio usa key propia sin remitente).
  const { key, from } = resolveSender(resendApiKey, resendFrom)
  const fecha = fmtDate(date)
  const hora = time.slice(0, 5)
  const saldo = price - deposit

  const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

      <tr><td style="background:#1a1714;padding:32px 40px;border-radius:12px 12px 0 0;text-align:center;">
        <div style="font-size:22px;font-weight:800;letter-spacing:2px;color:#f3ead8;">${businessName.toUpperCase()}</div>
        <div style="font-size:12px;color:rgba(243,234,216,.4);margin-top:4px;letter-spacing:1px;text-transform:uppercase;">Gestión de turnos</div>
      </td></tr>

      <tr><td style="background:#ffffff;padding:40px 40px 32px;">
        <p style="font-size:22px;font-weight:700;color:#1a1a1a;margin:0 0 8px;">¡Tu turno está confirmado!</p>
        <p style="font-size:15px;color:#555;margin:0 0 32px;line-height:1.6;">
          Hola <strong>${clientName}</strong>, aquí está el resumen de tu reserva en <strong>${businessName}</strong>.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-left:4px solid #1a1714;border-radius:0 8px 8px 0;margin-bottom:24px;">
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
                <td style="font-size:20px;font-weight:900;color:#1a1714;padding:10px 0 0;text-align:right;">${fmtPrice(price)}</td>
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

        <p style="font-size:13px;color:#999;line-height:1.7;margin:0;">
          Si necesitás cancelar o modificar tu turno, comunicate directamente con el negocio.
        </p>
      </td></tr>

      <tr><td style="background:#1a1714;padding:20px 40px;border-radius:0 0 12px 12px;text-align:center;">
        <div style="font-size:11px;color:#666;">Enviado por Forjo Gestión · forjo.studio/${businessSlug}</div>
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
  resendApiKey?: string | null
  resendFrom?: string | null
  pending?: boolean
}) {
  const { key, from } = resolveSender(resendApiKey, resendFrom)
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
