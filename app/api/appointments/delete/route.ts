import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBusinessSecrets } from '@/lib/business-secrets'
import { deleteCalendarEvent } from '@/lib/google-calendar'

// Borrado de turnos desde el panel del dueño. El borrado NO puede hacerse client-side: es
// hard-delete y el evento de Google Calendar quedaría huérfano (el google_refresh_token es
// server-only — vive en business_secrets — y el sync inverso GCal→app no puede limpiar una
// fila que ya no existe). Este endpoint es la única autoridad: valida sesión + ownership,
// borra el evento de Google (best-effort, en after()) y RECIÉN borra la fila.
//
// Acepta dos modos (mutuamente excluyentes):
//   { appointmentId }  → borra un turno puntual.
//   { clientId }       → borra TODOS los turnos del cliente y luego el cliente (usado al
//                        eliminar un cliente desde el panel; cada turno puede tener evento).
export async function POST(request: Request) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return Response.json({ ok: false, error: 'bad_request' }, { status: 400 })
    }
    const appointmentId = typeof (body as { appointmentId?: unknown })?.appointmentId === 'string'
      ? (body as { appointmentId: string }).appointmentId
      : null
    const clientId = typeof (body as { clientId?: unknown })?.clientId === 'string'
      ? (body as { clientId: string }).clientId
      : null

    if (!appointmentId && !clientId) {
      return Response.json({ ok: false, error: 'missing_target' }, { status: 400 })
    }

    // Auth + ownership: solo el dueño del negocio puede borrar. Sesión vía cliente que
    // respeta RLS (mismo patrón que el resto del dashboard y que /api/notify/cancel).
    const ssr = await createClient()
    const { data: { user } } = await ssr.auth.getUser()
    if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const { data: ownedBusiness } = await ssr
      .from('businesses')
      .select('id')
      .eq('owner_id', user.id)
      .single()
    if (!ownedBusiness) return Response.json({ ok: false, error: 'no_business' }, { status: 403 })

    const businessId = ownedBusiness.id as string
    const supabase = createAdminClient()

    // Resolvemos los turnos a borrar y sus google_event_id. Filtramos SIEMPRE por business_id
    // (aislamiento por tenant aunque sea service role): nunca borramos turnos de otro negocio.
    let query = supabase
      .from('appointments')
      .select('id, google_event_id')
      .eq('business_id', businessId)
    query = appointmentId ? query.eq('id', appointmentId) : query.eq('client_id', clientId as string)

    const { data: appts, error: readErr } = await query
    if (readErr) {
      console.error('[appointments/delete] error leyendo turnos:', readErr.message)
      return Response.json({ ok: false, error: 'query_failed' }, { status: 500 })
    }

    // appointmentId que no pertenece al negocio (o no existe) → no se borra nada (404).
    if (appointmentId && (!appts || appts.length === 0)) {
      return Response.json({ ok: false, error: 'not_found' }, { status: 404 })
    }

    const eventIds = (appts ?? [])
      .map(a => a.google_event_id as string | null)
      .filter((id): id is string => !!id)

    // Borrado de la(s) fila(s). Doble filtro por business_id: el aislamiento no depende del
    // input del cliente.
    let delQuery = supabase.from('appointments').delete().eq('business_id', businessId)
    delQuery = appointmentId ? delQuery.eq('id', appointmentId) : delQuery.eq('client_id', clientId as string)
    const { error: delErr } = await delQuery
    if (delErr) {
      console.error('[appointments/delete] error borrando turno(s):', delErr.message)
      return Response.json({ ok: false, error: 'delete_failed' }, { status: 500 })
    }

    // En modo clientId, borramos también el cliente (mismo flujo que tenía el panel).
    if (clientId) {
      const { error: clientErr } = await supabase
        .from('clients')
        .delete()
        .eq('id', clientId)
        .eq('business_id', businessId)
      if (clientErr) {
        console.error('[appointments/delete] turnos borrados pero falló borrar cliente:', clientErr.message)
        return Response.json({ ok: false, error: 'client_delete_failed' }, { status: 500 })
      }
    }

    // Google Calendar: best-effort en after() para no demorar la respuesta. deleteCalendarEvent
    // trata 404/410 (evento ya borrado) como éxito → doble delete o turno sin evento no rompe.
    if (eventIds.length > 0) {
      after(async () => {
        const secrets = await getBusinessSecrets(businessId)
        if (!secrets.google_refresh_token) return
        for (const eventId of eventIds) {
          try {
            await deleteCalendarEvent(secrets.google_refresh_token, eventId)
          } catch (e) {
            console.error('[appointments/delete] gcal borrar evento FALLÓ:', e instanceof Error ? e.message : e)
          }
        }
      })
    }

    return Response.json({ ok: true, deleted: (appts ?? []).length })
  } catch (e) {
    console.error('[appointments/delete] error:', e instanceof Error ? e.message : e)
    return Response.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
