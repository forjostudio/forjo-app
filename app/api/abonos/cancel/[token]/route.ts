import { createAdminClient } from '@/lib/supabase/admin'
import { getBusinessSecrets } from '@/lib/business-secrets'
import { cancelAbonoSeries } from '@/lib/abono-cancel'
import { sendAbonoCancelledEmail, sendAbonoCancelledAdminNotification } from '@/lib/email'
import type { NextRequest } from 'next/server'

// ── BAJA PÚBLICA DE LA SERIE DEL ABONO por TOKEN (ABONO-04, vía cliente) ────────────────────────
//
// Da de baja el TURNO FIJO COMPLETO — la serie entera y todos sus turnos futuros — y NO una
// ocurrencia suelta. El cliente llega acá desde el botón del mail de alta del abono (D-16).
//
// AUTORIZACIÓN: el `cancel_token` (uuid impredecible de la migr. 054) es la ÚNICA credencial. De la
// fila que resuelve ese token sale el `business_id` que se le pasa al motor de baja: NINGÚN dato de
// la request participa del aislamiento por tenant (D-22, T-07-12/T-07-14). El service role es
// server-only (este route handler) y RLS no aplica, así que el filtro por `cancel_token` es toda la
// autorización que hay — igual que en app/api/cancel/[token]/route.ts, del que copiamos el patrón.
//
// LA REGLA DE LAS 24 HORAS NO RIGE ACÁ (D-06). El cancel de turno SUELTO devuelve 'too_late' dentro
// de las 24 h previas; trabar la baja de una serie indefinida por un turno puntual de hoy no tiene
// sentido, así que esta ruta no tiene ese branch ni el de 'past'. Se cancela todo lo futuro,
// incluido el turno de hoy más tarde (D-02, frontera inclusive, resuelta dentro del motor).
//
// UN SOLO MAIL POR BAJA (D-13/D-14, T-07-10). Cancelar 7 turnos manda 1 mail al cliente y 1 aviso al
// dueño, NUNCA uno por turno. Los dos son best-effort: si fallan se loguean y la baja — que ya está
// confirmada en la base — no se rompe.
//
// POR QUÉ ES UNA RUTA NUEVA Y NO UN BRANCH DEL CANCEL DE TURNO (D-10): `/cancelar/[token]` y
// `POST /api/cancel/[token]` están vivos en producción para el turno suelto. Meterles un condicional
// "¿es abono o turno?" pondría un flujo crítico probado a merced de una regresión de esta fase. Esta
// ruta no toca ni un byte de aquellos archivos.
//
// EL TOKEN NO SE ROTA NI SE INVALIDA (D-09). Ninguna rama de este handler escribe `cancel_token`. El
// link deja de operar por ESTADO (el gate de abajo corta cuando la serie ya está 'cancelled'), no por
// vencimiento: así el cliente que vuelva a abrir el mail sigue viendo la pantalla informativa en vez
// de un error.
//
// NO hay limpieza de Google Calendar: los turnos generados por abono no crean eventos gcal
// (lib/abono-generation.ts no llama a createCalendarEvent), así que no hay nada que borrar.

// Etiquetas de día (plural) para el mail: convención EXTRACT(dow) 0=domingo..6=sábado, la MISMA que
// usa el alta (app/api/abonos/create) para armar el "todos los martes" del mail de confirmación.
const DAY_LABELS = ['los domingos', 'los lunes', 'los martes', 'los miércoles', 'los jueves', 'los viernes', 'los sábados']

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  // Next 16: `params` es una Promise y hay que await-earla.
  const { token } = await params
  if (!token) return Response.json({ ok: false, reason: 'invalid' }, { status: 400 })

  const supabase = createAdminClient()

  // Resolución de la serie Y de su tenant por el token. Pitfall E (documentado en el analog): el join
  // anidado a businesses(...) NO puede traer business_secrets — sólo columnas NO secretas; los
  // secretos Resend salen aparte con getBusinessSecrets.
  //
  // `cancel_token` es una columna uuid: un token con formato inválido hace fallar el casteo en
  // Postgres y la query vuelve con `data` nula. Ese camino tiene que terminar en el MISMO 404
  // genérico que el token inexistente — nunca en un 500 que revele que el input llegó a la base
  // (D-22, T-07-13). Por eso se usa `.maybeSingle()` y se ignora el error: sólo se mira `data`.
  const { data: abono } = await supabase
    .from('abonos')
    .select(
      'id, business_id, status, day_of_week, start_time, clients(name, email, phone), services(name), businesses(id, name, slug, primary_color, logo_url, notification_email, whatsapp)',
    )
    .eq('cancel_token', token)
    .maybeSingle()

  // Sin fila → no se da de baja nada (ni se revela si la serie existe). Mismo cuerpo y mismo status
  // para "no existe", "formato inválido" y cualquier otro fallo de resolución: no se distingue.
  if (!abono) return Response.json({ ok: false, reason: 'not_found' }, { status: 404 })

  // Serie ya dada de baja → idempotencia (D-05): no se toca ningún turno y no sale ningún mail.
  // 'completed' NO corta acá a propósito (D-21): un finito que ya juntó sus N sesiones puede tener
  // turnos futuros por delante y se da de baja por este mismo camino, igual que en el panel.
  if (abono.status === 'cancelled') {
    return Response.json({ ok: false, reason: 'already_cancelled' })
  }

  // Toda la baja pasa por el motor compartido (D-07/D-24): esta ruta NO ejecuta ninguna query de
  // cancelación propia. El `businessId` sale SIEMPRE de la fila resuelta por el token, jamás de la
  // request. Idempotencia y doble scoping (abono_id + business_id) viven adentro del motor.
  const result = await cancelAbonoSeries({
    supabase,
    businessId: abono.business_id as string,
    abonoId: abono.id as string,
  })

  if (!result.ok) {
    console.error(`[abonos/cancel] baja FALLÓ (abono ${abono.id}):`, result.error)
    return Response.json({ ok: false, reason: 'error' }, { status: 500 })
  }

  // Carrera con otra request sobre el mismo token: el gate atómico del motor la dejó afuera. Se
  // responde como ya-cancelada y NO se mandan mails (D-05, T-07-15: el token no sirve de amplificador).
  if (result.alreadyCancelled) {
    return Response.json({ ok: false, reason: 'already_cancelled' })
  }

  const { cancelledCount, lastDate } = result

  const business = abono.businesses as {
    id?: string
    name?: string
    slug?: string
    primary_color?: string | null
    logo_url?: string | null
    notification_email?: string | null
    whatsapp?: string | null
  } | null
  const client = abono.clients as { name?: string | null; email?: string | null; phone?: string | null } | null
  const serviceName = (abono.services as { name?: string } | null)?.name || ''
  const dow = Number(abono.day_of_week)
  const dayLabel = DAY_LABELS[dow] ? `todos ${DAY_LABELS[dow]}` : ''
  const time = String(abono.start_time ?? '')

  // Mails con AWAIT y no con after(): en serverless, sobre esta superficie pública, el fetch a Resend
  // se corta al hacer return si no se espera. Mismo criterio que el cancel de turno suelto.
  // Secretos por tenant desde business_secrets (no venían en el join, Pitfall E).
  const secrets = business?.id ? await getBusinessSecrets(business.id) : null

  // (1) UN mail al cliente, sólo si tiene email cargado.
  if (client?.email && business) {
    try {
      await sendAbonoCancelledEmail({
        to: client.email,
        clientName: client.name || '',
        service: serviceName,
        dayLabel,
        time,
        cancelledCount,
        lastDate,
        businessName: business.name || '',
        businessSlug: business.slug || '',
        primaryColor: business.primary_color,
        logoUrl: business.logo_url,
        whatsapp: business.whatsapp,
        resendApiKey: secrets?.resend_api_key,
        resendFrom: secrets?.resend_from,
      })
    } catch (e) {
      console.error(`[abonos/cancel] email cliente FALLÓ (abono ${abono.id}):`, e instanceof Error ? e.message : e)
    }
  }

  // (2) UN aviso al dueño (D-13): la baja la hizo el cliente por el link público, el negocio tiene que
  // enterarse. Sólo si tiene configurado el email de notificaciones.
  if (business?.notification_email) {
    try {
      await sendAbonoCancelledAdminNotification({
        to: business.notification_email,
        clientName: client?.name || '',
        clientPhone: client?.phone,
        clientEmail: client?.email,
        service: serviceName,
        dayLabel,
        time,
        cancelledCount,
        lastDate,
        businessName: business.name || '',
        logoUrl: business.logo_url,
        resendApiKey: secrets?.resend_api_key,
        resendFrom: secrets?.resend_from,
      })
    } catch (e) {
      console.error(`[abonos/cancel] aviso al dueño FALLÓ (abono ${abono.id}):`, e instanceof Error ? e.message : e)
    }
  }

  return Response.json({ ok: true, cancelledCount, lastDate })
}
