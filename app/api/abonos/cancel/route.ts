import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getBusinessSecrets } from '@/lib/business-secrets'
import { cancelAbonoSeries, abonoDayLabel } from '@/lib/abono-cancel'
import { sendAbonoCancelledEmail } from '@/lib/email'

// BAJA de la SERIE completa de un abono desde el PANEL del dueño (ABONO-05, D-23). Da de baja la
// serie ENTERA — la fila `abonos` pasa a 'cancelled' (lo que frena la generación forward del cron) y
// se cancelan en masa sus turnos FUTUROS. No es el cancel de un turno suelto: para eso ya está
// app/api/cancel/[token] (que esta fase NO toca, D-10).
//
// Corre con la SESIÓN DEL DUEÑO — cliente anon + RLS (lib/supabase/server) y el negocio resuelto por
// owner_id, NUNCA por un business_id que venga del body. El service role queda PROHIBIDO en esta ruta,
// con la ÚNICA excepción acotada de leer los secretos Resend del propio tenant (ya resuelto) dentro
// del after() para mandar el mail — mismo molde que app/api/abonos/create (T-07-20).
//
// COMPARTE EL MOTOR DE BAJA CON LA VÍA DEL MAIL (D-07): todo el efecto sobre los turnos sale del
// motor de lib/abono-cancel, que es la ÚNICA implementación de la baja del repo. Este
// handler NO ejecuta ninguna query de cancelación propia: es una cáscara de autorización + mail. Si
// acá hubiera un UPDATE sobre `appointments`, las dos vías podrían divergir — que es exactamente lo
// que la fase prohíbe (D-24).
//
// La regla de las 24 horas ('too_late') del cancel de turno suelto NO APLICA acá (D-06): trabar la
// baja de una serie indefinida por un turno puntual de hoy no tiene sentido, y además el dueño es el
// dueño de su agenda. La regla no rige por NINGUNA de las dos vías de la fase.
//
// Diferencia de notificación con la vía del cliente: acá la baja la hizo el DUEÑO, así que NO se le
// manda aviso a sí mismo (el aviso al dueño es exclusivo de la vía del cliente, D-13). Al cliente sí
// se le avisa SIEMPRE que tenga email cargado, sin checkbox opt-in (D-15): tenía un fijo semanal
// reservado y que desaparezca sin aviso es peor que un mail de más. UN solo mail por baja, nunca uno
// por turno cancelado (D-14).

// La etiqueta plural del día sale del motor compartido (IN-01): es la MISMA para las dos vías de baja
// y para el alta, incluido su fallback. Tenerla copiada acá hacía que el mail de la misma baja dijera
// cosas distintas según quién la ejecutara.

// Forma de la fila que devuelve el select del abono. Los joins de Supabase llegan como objeto (o
// null) cuando la FK es a-uno; se tipa acá para no arrastrar `any` hasta el mail.
type AbonoDetailRow = {
  id: string
  status: string
  day_of_week: number
  start_time: string
  clients: { name: string | null; email: string | null } | null
  services: { name: string | null } | null
}

export async function POST(request: Request) {
  // (1) Cliente anon+RLS con las cookies de la sesión del dueño. NO admin (T-07-20).
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  // (2) Tenant = ACTOR: el negocio sale de owner_id de la sesión, jamás de un identificador del body.
  // Sólo columnas NO secretas (los secretos viven en business_secrets); el branding es para el mail.
  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, slug, primary_color, logo_url, whatsapp')
    .eq('owner_id', user.id)
    .single()
  if (!business) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })

  // (3) Parseo defensivo del body: no se confía en el shape del cliente.
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ ok: false, error: 'bad_request' }, { status: 400 })
  }
  const body = (raw ?? {}) as Record<string, unknown>
  const abonoId = typeof body.abonoId === 'string' && body.abonoId.trim() ? body.abonoId.trim() : ''
  if (!abonoId) return Response.json({ ok: false, error: 'missing_fields' }, { status: 400 })

  // (4) ANTI-TAMPERING DE TENANT (D-23, T-07-21): el abono se re-lee acotado por id + business_id
  // ANTES de tocar nada. Un abono inexistente y uno de OTRO negocio devuelven exactamente el mismo
  // 404 — no se revela la existencia de una serie ajena (D-22). Esta lectura además provee los datos
  // del mail (cliente / servicio / día / hora) sin un segundo viaje a la base.
  const { data: abonoRow } = await supabase
    .from('abonos')
    .select('id, status, day_of_week, start_time, clients(name, email), services(name)')
    .eq('id', abonoId)
    .eq('business_id', business.id)
    .maybeSingle()
  if (!abonoRow) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })
  const abono = abonoRow as unknown as AbonoDetailRow

  // (5) La baja la ejecuta el motor compartido, con el businessId ya resuelto por la sesión. El
  // doble scoping (business_id + abono_id) del UPDATE masivo vive adentro (D-24, T-07-22).
  const result = await cancelAbonoSeries({ supabase, businessId: business.id, abonoId })

  // (6) Falla de DB. El motor ya logueó el detalle; acá se registra el contexto de la ruta.
  if (!result.ok) {
    console.error(`[abonos/cancel] baja FALLÓ (abono ${abonoId}): ${result.error}`)
    // 'not_found' del motor también cae acá: es una carrera (la serie dejó de existir entre la
    // re-lectura y el update). Se responde 500/404 según el caso, sin distinguir tenants.
    if (result.error === 'not_found') return Response.json({ ok: false, error: 'not_found' }, { status: 404 })
    return Response.json({ ok: false, error: 'cancel_failed' }, { status: 500 })
  }

  // (7) La serie YA estaba dada de baja (D-05): no se tocó ningún turno y NO se re-dispara el mail.
  // Se responde 200 igual — la idempotencia es un éxito desde el punto de vista del que la pidió.
  if (result.alreadyCancelled) {
    return Response.json({ ok: true, alreadyCancelled: true, cancelledCount: 0, lastDate: null })
  }

  // (8) Baja efectiva → UN solo mail, y va SOLO al cliente (D-14/D-15, enmendadas 2026-07-22). El
  // aviso al dueño es el RECIBO de algo que le OCURRIÓ, no de algo que él ejecutó: acá la baja la
  // ejecuta el propio dueño, así que avisarle sería redundante. Por eso ese aviso existe únicamente
  // en la vía pública, donde la baja la inicia el CLIENTE.
  // Best-effort en after() para no demorar la respuesta del panel. Todo lo que el closure necesita se
  // captura ANTES en consts. Si el mail falla se loguea y la baja NO se rompe: los turnos ya quedaron
  // cancelados.
  const clientEmail = abono.clients?.email?.trim() || ''
  if (clientEmail) {
    const businessId = business.id as string
    const clientName = abono.clients?.name || 'Cliente'
    const serviceName = abono.services?.name || ''
    const dayLabel = `todos ${abonoDayLabel(abono.day_of_week)}`
    const time = String(abono.start_time).slice(0, 5)
    const cancelledCount = result.cancelledCount
    const lastDate = result.lastDate
    after(async () => {
      try {
        const secrets = await getBusinessSecrets(businessId)
        await sendAbonoCancelledEmail({
          to: clientEmail,
          clientName,
          service: serviceName,
          dayLabel,
          time,
          cancelledCount,
          lastDate,
          businessName: business.name,
          businessSlug: business.slug,
          primaryColor: business.primary_color,
          logoUrl: business.logo_url,
          whatsapp: business.whatsapp,
          resendApiKey: secrets.resend_api_key,
          resendFrom: secrets.resend_from,
        })
      } catch (e) {
        console.error(`[abonos/cancel] email baja abono FALLÓ (abono ${abonoId}):`, e instanceof Error ? e.message : e)
      }
    })
  }

  // (9) El servidor es la autoridad del número: el panel muestra ESTE conteo, no su preview.
  return Response.json({
    ok: true,
    alreadyCancelled: false,
    cancelledCount: result.cancelledCount,
    lastDate: result.lastDate,
  })
}
