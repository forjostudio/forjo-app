import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { selectFutureOccurrences, summarizeOccurrences, todayISOInAR } from '@/lib/abono-cancel'
import { AbonosClient, type AbonoRow } from './abonos-client'

// Página de abonos del panel (ABONO-01, D-04). Server Component: espeja agenda/page.tsx — resuelve el
// negocio por owner_id de la sesión y carga TODO filtrado por business.id (aislamiento por tenant, T-06-20).
// El público NUNCA lee abonos (RLS owner-only), así que acá sólo corre con la sesión del dueño (anon+RLS).
export default async function AbonosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('*')
    .eq('owner_id', user.id)
    .single()

  if (!business) redirect('/onboarding')

  // Datos del negocio en paralelo. Toda query filtra por business.id (tenant). Los abonos traen los
  // nombres (cliente / servicio / cancha) por join para la lista; los appointments con abono_id se usan
  // para contar cuántos turnos generó cada serie (no cancelados) y para saber la FECHA DEL ÚLTIMO turno
  // real de cada una (D-09′) — por eso se trae también `date`.
  const [{ data: abonos }, { data: apptRows }, { data: services }, { data: professionals }, { data: locations }, { data: clients }] = await Promise.all([
    supabase
      .from('abonos')
      // `cancel_token` viaja al browser del DUEÑO para que pueda copiar el link de baja y mandárselo
      // a su cliente por WhatsApp (D-17: el caso frecuente del cliente sin mail). Es aceptable porque
      // es owner de la serie, PERO sólo puede salir por acá (D-25): esta página resuelve el negocio
      // por owner_id, todas sus queries filtran por business_id y la tabla `abonos` tiene RLS
      // owner-only. El token NUNCA se agrega a una vista pública, a un endpoint anónimo ni a ninguna
      // superficie compartida.
      .select('id, day_of_week, start_time, status, total_occurrences, generated_until, skipped_occurrences, created_at, cancel_token, cancelled_at, clients(name), services(name), professionals(name)')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('appointments')
      .select('abono_id, date')
      .eq('business_id', business.id)
      .not('abono_id', 'is', null)
      .neq('status', 'cancelled'),
    supabase.from('services').select('*').eq('business_id', business.id).eq('active', true),
    supabase.from('professionals').select('*').eq('business_id', business.id).eq('active', true),
    supabase.from('locations').select('*').eq('business_id', business.id).order('created_at'),
    supabase.from('clients').select('*').eq('business_id', business.id).order('name', { ascending: true }),
  ])

  // Conteo de turnos generados por abono + fecha del ÚLTIMO turno real (D-09′), ambos en memoria: el
  // set ya viene acotado por business_id (T-06-25). El "último" es el max `date` de los turnos NO
  // cancelados de la serie — NO `generated_until`, que es la frontera de la ventana y cae cualquier día
  // de la semana (por eso un abono de los jueves mostraba un martes). Como las fechas son ISO
  // 'yyyy-MM-dd', comparar strings alcanza (orden lexicográfico = orden cronológico).
  const turnoCounts: Record<string, number> = {}
  const lastTurnoDates: Record<string, string> = {}
  // Mismo recorrido, sin queries nuevas: se agrupan las filas por serie para poder derivar después el
  // preview de la baja (D-03) sobre el set que YA está en memoria.
  const rowsByAbono: Record<string, { date: string | null }[]> = {}
  for (const r of apptRows || []) {
    const { abono_id: id, date } = r as { abono_id: string | null; date: string | null }
    if (!id) continue
    turnoCounts[id] = (turnoCounts[id] ?? 0) + 1
    if (date && (!lastTurnoDates[id] || date > lastTurnoDates[id])) lastTurnoDates[id] = date
    ;(rowsByAbono[id] ??= []).push({ date })
  }

  // Preview de la baja por serie (D-03): cuántos turnos FUTUROS se cancelarían y cuál sería el último.
  // Se reusan los helpers del motor de baja (selectFutureOccurrences + summarizeOccurrences) en vez de
  // comparar fechas a mano a propósito: la regla de "qué turno se cancela" — frontera INCLUSIVE del día
  // de hoy en hora AR (D-02), turnos ya cancelados fuera — tiene que ser LA MISMA que ejecuta la baja.
  // Si acá se reimplementara, el número que ve el dueño en la confirmación podría no coincidir con el
  // efecto real (justo en el borde de medianoche, que es cuando más duele). El corte se calcula UNA vez
  // para que todas las series se midan contra el mismo día.
  const cutoff = todayISOInAR()
  const futureTurnoCounts: Record<string, number> = {}
  const lastFutureDates: Record<string, string | null> = {}
  for (const [id, rows] of Object.entries(rowsByAbono)) {
    const { count, lastDate } = summarizeOccurrences(selectFutureOccurrences(rows, cutoff))
    futureTurnoCounts[id] = count
    lastFutureDates[id] = lastDate
  }

  return (
    <AbonosClient
      business={business}
      abonos={(abonos || []) as unknown as AbonoRow[]}
      turnoCounts={turnoCounts}
      lastTurnoDates={lastTurnoDates}
      futureTurnoCounts={futureTurnoCounts}
      lastFutureDates={lastFutureDates}
      clients={clients || []}
      services={services || []}
      professionals={professionals || []}
      locations={locations || []}
    />
  )
}
