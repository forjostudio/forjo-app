import { Resend } from 'resend'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const FROM = 'Forjo Gestión <notificaciones@forjo.studio>'

function getResend(apiKey?: string | null) {
  return new Resend(apiKey || process.env.RESEND_API_KEY!)
}

function formatDateTime(date: string, time: string) {
  const [y, m, d] = date.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  const dt = new Date(y, m - 1, d, h, min)
  return {
    fecha: format(dt, "EEEE d 'de' MMMM 'de' yyyy", { locale: es }),
    hora: format(dt, 'HH:mm'),
  }
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
}) {
  const resend = getResend(resendApiKey)
  const { fecha, hora } = formatDateTime(date, time)
  const saldo = price - deposit

  return resend.emails.send({
    from: FROM,
    to,
    subject: `✅ Turno confirmado — ${businessName}`,
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px">
        <h2 style="color:#1a1714;margin-bottom:4px">¡Tu turno está confirmado!</h2>
        <p style="color:#666;margin-top:0">Hola ${clientName}, aquí está el resumen de tu reserva en <strong>${businessName}</strong>:</p>
        <div style="background:#f5f5f5;border-radius:8px;padding:16px;margin:20px 0">
          <p style="margin:0 0 8px"><strong>Servicio:</strong> ${service}</p>
          <p style="margin:0 0 8px"><strong>Fecha:</strong> ${fecha}</p>
          <p style="margin:0 0 8px"><strong>Hora:</strong> ${hora} hs</p>
          <p style="margin:0 0 8px"><strong>Precio total:</strong> $${Number(price).toLocaleString('es-AR')}</p>
          ${deposit > 0 ? `
          <p style="margin:0 0 8px;color:#22c55e"><strong>Seña abonada:</strong> $${Number(deposit).toLocaleString('es-AR')}</p>
          ${saldo > 0 ? `<p style="margin:0"><strong>Saldo a abonar en el local:</strong> $${Number(saldo).toLocaleString('es-AR')}</p>` : ''}
          ` : ''}
        </div>
        <p style="color:#666;font-size:14px">Si necesitás cancelar o modificar tu turno, comunicate con el negocio.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
        <p style="color:#999;font-size:12px">Enviado por Forjo Gestión · forjo.studio/${businessSlug}</p>
      </div>
    `,
  })
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
}) {
  const resend = getResend(resendApiKey)
  const { fecha, hora } = formatDateTime(date, time)

  return resend.emails.send({
    from: FROM,
    to,
    subject: '🔔 Nuevo turno confirmado',
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px">
        <h2 style="color:#1a1714">Nuevo turno confirmado</h2>
        <div style="background:#f5f5f5;border-radius:8px;padding:16px;margin:20px 0">
          <p style="margin:0 0 8px"><strong>Cliente:</strong> ${clientName}</p>
          ${clientPhone ? `<p style="margin:0 0 8px"><strong>Teléfono:</strong> ${clientPhone}</p>` : ''}
          ${clientEmail ? `<p style="margin:0 0 8px"><strong>Email:</strong> ${clientEmail}</p>` : ''}
          <hr style="border:none;border-top:1px solid #ddd;margin:12px 0">
          <p style="margin:0 0 8px"><strong>Servicio:</strong> ${service}</p>
          <p style="margin:0 0 8px"><strong>Fecha:</strong> ${fecha}</p>
          <p style="margin:0 0 8px"><strong>Hora:</strong> ${hora} hs</p>
          <p style="margin:0 0 8px"><strong>Precio:</strong> $${Number(price).toLocaleString('es-AR')}</p>
          ${deposit > 0 ? `<p style="margin:0;color:#22c55e"><strong>Seña cobrada:</strong> $${Number(deposit).toLocaleString('es-AR')}</p>` : ''}
        </div>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
        <p style="color:#999;font-size:12px">Enviado por Forjo Gestión</p>
      </div>
    `,
  })
}
