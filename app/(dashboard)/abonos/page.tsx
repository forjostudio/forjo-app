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

  // Corte del preview de la baja: frontera INCLUSIVE del día de hoy en hora AR (D-02). Se calcula UNA
  // sola vez, ANTES de las queries, para que todas las series se midan contra el mismo día y para que
  // la query de turnos futuros ya salga acotada desde la base.
  const cutoff = todayISOInAR()

  // Datos del negocio en paralelo. Toda query filtra por business.id (tenant). Los abonos traen los
  // nombres (cliente / servicio / cancha) por join para la lista; los appointments con abono_id que se
  // traen acá son SÓLO los futuros, y alimentan únicamente el preview de la baja.
  const [{ data: abonos }, { data: apptRows }, { data: services }, { data: professionals }, { data: locations }, { data: clients }] = await Promise.all([
    supabase
      .from('abonos')
      // La CREDENCIAL DE BAJA de la serie NO viaja con el listado (WR-07). Antes venía en este select
      // para que el dueño pudiera copiar el link y mandárselo a su cliente por WhatsApp (D-17), pero
      // eso repartía el secreto de TODAS las series en CADA render: quedaba en el HTML serializado, en
      // la caché del navegador y en cualquier captura de DOM, y no rota ni vence (D-09). Ahora el link
      // se le pide al servidor recién cuando el dueño toca "Copiar link de baja"
      // (GET /api/abonos/cancel-link/[id]): D-17 sigue cubierto sin repartir la credencial (D-25).
      .select('id, day_of_week, start_time, status, total_occurrences, generated_until, skipped_occurrences, created_at, cancelled_at, clients(name), services(name), professionals(name)')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false }),
    // Turnos FUTUROS etiquetados con un abono, acotados por fecha en la BASE (WR-06). Antes esta query
    // traía todos los turnos de abono de toda la historia del negocio, sin filtro de fecha ni límite:
    // con abonos indefinidos ese set crece sin techo y el tope de filas de PostgREST podía recortarlo
    // EN SILENCIO, haciendo que el diálogo de confirmación subestimara el alcance de una acción
    // irreversible. El set futuro, en cambio, tiene techo real: la ventana de generación está limitada
    // a 52 semanas por el CHECK de la migración 055.
    supabase
      .from('appointments')
      .select('abono_id, date')
      .eq('business_id', business.id)
      .not('abono_id', 'is', null)
      .neq('status', 'cancelled')
      .gte('date', cutoff),
    supabase.from('services').select('*').eq('business_id', business.id).eq('active', true),
    supabase.from('professionals').select('*').eq('business_id', business.id).eq('active', true),
    supabase.from('locations').select('*').eq('business_id', business.id).order('created_at'),
    supabase.from('clients').select('*').eq('business_id', business.id).order('name', { ascending: true }),
  ])

  const abonoRows = (abonos || []) as unknown as AbonoRow[]

  // Conteo de turnos generados por serie + fecha del ÚLTIMO turno real (D-09′). Los dos son de TODA la
  // historia de la serie, así que ya no pueden salir de la query acotada de arriba. Se resuelven con
  // UNA query por serie que trae las dos cosas de un solo viaje: el `count` de PostgREST es exacto
  // sobre todas las filas que matchean (el `limit` no lo afecta) y la única fila devuelta, ordenada
  // descendente, trae el máximo `date`.
  //
  // Por qué una query por serie y no traer las filas para contarlas en memoria: el conteo tiene que ser
  // EXACTO — es el número que se le muestra al dueño — y traer filas para contarlas es justamente lo
  // que podía recortarse en silencio (WR-06). El número de series por negocio es chico y todas las
  // queries van en paralelo. El "último" es el max `date` de los turnos NO cancelados de la serie — NO
  // `generated_until`, que es la frontera de la ventana y cae cualquier día de la semana (por eso un
  // abono de los jueves mostraba un martes).
  const aggregates = await Promise.all(
    abonoRows.map(async (a) => {
      const { data, count } = await supabase
        .from('appointments')
        .select('date', { count: 'exact' })
        .eq('business_id', business.id)
        .eq('abono_id', a.id)
        .neq('status', 'cancelled')
        .order('date', { ascending: false })
        .limit(1)
      const top = ((data ?? []) as { date: string | null }[])[0]
      return { id: a.id, count: count ?? 0, lastDate: top?.date ?? null }
    }),
  )
  const turnoCounts: Record<string, number> = {}
  const lastTurnoDates: Record<string, string> = {}
  for (const r of aggregates) {
    turnoCounts[r.id] = r.count
    if (r.lastDate) lastTurnoDates[r.id] = r.lastDate
  }

  // Agrupación por serie del set FUTURO (ya acotado en la base) para derivar el preview de la baja.
  const rowsByAbono: Record<string, { date: string | null }[]> = {}
  for (const r of apptRows || []) {
    const { abono_id: id, date } = r as { abono_id: string | null; date: string | null }
    if (!id) continue
    ;(rowsByAbono[id] ??= []).push({ date })
  }

  // Preview de la baja por serie (D-03): cuántos turnos FUTUROS se cancelarían y cuál sería el último.
  // Se reusan los helpers del motor de baja (selectFutureOccurrences + summarizeOccurrences) en vez de
  // comparar fechas a mano a propósito: la regla de "qué turno se cancela" — frontera INCLUSIVE del día
  // de hoy en hora AR (D-02), turnos ya cancelados fuera — tiene que ser LA MISMA que ejecuta la baja.
  // Si acá se reimplementara, el número que ve el dueño en la confirmación podría no coincidir con el
  // efecto real (justo en el borde de medianoche, que es cuando más duele). El filtro de la query es el
  // mismo corte, pero el recorte fino sigue siendo del motor: una sola regla, un solo lugar.
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
      abonos={abonoRows}
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
