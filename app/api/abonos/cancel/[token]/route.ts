import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBusinessSecrets, type BusinessSecrets } from '@/lib/business-secrets'
import { cancelAbonoSeries, abonoDayLabel } from '@/lib/abono-cancel'
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
  // Etiqueta plural del día desde el motor compartido (IN-01): convención EXTRACT(dow)
  // 0=domingo..6=sábado, con el MISMO fallback único que usa la vía del panel. Antes esta ruta tenía
  // su propia copia de la tabla, con fallback vacío: el mail de la MISMA baja decía cosas distintas
  // según quién la ejecutara. El prefijo 'todos ' lo arma el caller, como siempre.
  const dayLabel = `todos ${abonoDayLabel(dow)}`
  const time = String(abono.start_time ?? '')

  // ── LOS DOS MAILS SALEN FUERA DEL REQUEST PATH (WR-05, T-07-41) ───────────────────────────────
  //
  // Se despachan con `after` de next/server, EXACTAMENTE el mismo criterio que la vía del panel
  // (app/api/abonos/cancel/route.ts). El comentario anterior afirmaba lo contrario — que "en
  // serverless el fetch a Resend se corta al hacer return si no se espera" — y era falso en Next 16
  // sobre Vercel: `after` existe justamente para esto y el callback corre con la respuesta ya enviada.
  //
  // Con los dos POST a Resend esperados EN SERIE dentro del handler, una degradación del proveedor
  // colgaba la respuesta hasta el límite de la función: el cliente veía "No pudimos dar de baja el
  // turno fijo" para una baja que SÍ se había ejecutado, y al reintentar caía en 'already_cancelled'.
  // Sumado al timeout duro de `resendSend` (Plan 07-07), ni un proveedor colgado puede consumir el
  // presupuesto de la función.
  //
  // Un solo callback con los dos envíos en secuencia: fuera del request path el orden ya no importa.
  // Todo lo que el closure necesita se captura ANTES en consts; los secretos Resend por tenant se
  // leen ADENTRO (no venían en el join, Pitfall E).
  const abonoId = abono.id as string
  const businessId = business?.id ?? ''
  const clientEmail = client?.email ?? ''
  const clientName = client?.name || ''
  const clientPhone = client?.phone ?? undefined
  const businessName = business?.name || ''
  const businessSlug = business?.slug || ''
  const primaryColor = business?.primary_color ?? null
  const logoUrl = business?.logo_url ?? null
  const whatsapp = business?.whatsapp ?? null
  const notificationEmail = business?.notification_email ?? ''

  after(async () => {
    let secrets: BusinessSecrets | null = null
    try {
      secrets = businessId ? await getBusinessSecrets(businessId) : null
    } catch (e) {
      // Sin secretos por tenant los envíos igual se intentan con la configuración global; la baja,
      // que ya está confirmada en la base, nunca se rompe por esto.
      console.error(`[abonos/cancel] secretos Resend FALLÓ (abono ${abonoId}):`, e instanceof Error ? e.message : e)
    }

    // (1) UN mail al cliente, sólo si tiene email cargado.
    if (clientEmail && businessId) {
      try {
        await sendAbonoCancelledEmail({
          to: clientEmail,
          clientName,
          service: serviceName,
          dayLabel,
          time,
          cancelledCount,
          lastDate,
          businessName,
          businessSlug,
          primaryColor,
          logoUrl,
          whatsapp,
          resendApiKey: secrets?.resend_api_key,
          resendFrom: secrets?.resend_from,
        })
      } catch (e) {
        console.error(`[abonos/cancel] email cliente FALLÓ (abono ${abonoId}):`, e instanceof Error ? e.message : e)
      }
    }

    // (2) UN aviso al dueño (D-13): la baja la hizo el cliente por el link público, el negocio tiene
    // que enterarse. Sólo si tiene configurado el email de notificaciones.
    if (notificationEmail) {
      try {
        await sendAbonoCancelledAdminNotification({
          to: notificationEmail,
          clientName,
          clientPhone,
          clientEmail: clientEmail || undefined,
          service: serviceName,
          dayLabel,
          time,
          cancelledCount,
          lastDate,
          businessName,
          logoUrl,
          resendApiKey: secrets?.resend_api_key,
          resendFrom: secrets?.resend_from,
        })
      } catch (e) {
        console.error(`[abonos/cancel] aviso al dueño FALLÓ (abono ${abonoId}):`, e instanceof Error ? e.message : e)
      }
    }
  })

  return Response.json({ ok: true, cancelledCount, lastDate })
}
