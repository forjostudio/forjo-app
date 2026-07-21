import type { SupabaseClient } from '@supabase/supabase-js'
import { todayInAR } from './booking-window'

// ── Motor compartido de BAJA de serie del abono (Plan 07-01, ABONO-04/ABONO-05) ─────────────
// Ésta es la ÚNICA implementación de "dar de baja un abono" del repo. Las DOS vías de la fase la
// llaman igual: el link del mail (cliente, resuelto por cancel_token con service role) y el panel del
// dueño (sesión autenticada, anon+RLS). La única diferencia entre ambas es CÓMO se autoriza y a quién
// se le avisa por mail — el efecto sobre los turnos sale de acá y por lo tanto es idéntico (D-07). Dos
// implementaciones que puedan divergir en el efecto son una falla de la fase, no un detalle.
//
// Qué hace, y nada más:
//   1. Marca la fila del abono como 'cancelled' + cancelled_at, de forma IDEMPOTENTE (D-05). Eso solo
//      ya frena la generación forward: el cron diario únicamente procesa abonos con status='active',
//      así que la baja NO necesita tocar el cron.
//   2. Cancela EN MASA los turnos futuros de esa serie (D-01), con la frontera de D-02.
//   3. Informa cuántos turnos canceló y cuál era el último, para el aviso previo/posterior (D-03).
//
// Qué NO hace (invariantes):
//   - NO manda mails (D-14). Cada vía dispara UN solo mail al cliente y UN solo aviso al dueño; si el
//     envío viviera acá, cualquier caller nuevo duplicaría avisos y una serie de 7 turnos podría
//     terminar en 7 mails. El caller decide y envía.
//   - NO aplica la regla de las 24 horas ('too_late') del cancel de turno SUELTO (D-06). Trabar la baja
//     de una serie indefinida por un turno puntual de hoy no tiene sentido, y el alta manual del dueño
//     tampoco chequea horario. La regla no rige acá por NINGUNA de las dos vías.
//   - NO ofrece reactivación: 'cancelled' es TERMINAL (D-04). Este módulo no exporta ninguna función ni
//     tiene ninguna rama que escriba status 'active' sobre un abono. Si el cliente vuelve, el dueño crea
//     un abono nuevo (el alta ya existe y es rápida).
//   - NO instancia clientes Supabase: recibe el cliente por parámetro (mismo contrato rol-agnóstico que
//     lib/abono-generation.ts). Así la vía pública lo llama con service role y la del panel con anon+RLS
//     sin bifurcar una sola línea de lógica.
//   - NO borra eventos de Google Calendar: los turnos generados por abono no crean eventos gcal
//     (lib/abono-generation.ts no llama a createCalendarEvent). Si eso cambiara, la baja tendría que
//     limpiarlos.
//
// LA BAJA NO ES ATÓMICA, PERO SÍ ES RECUPERABLE POR REINTENTO (CR-01). Los pasos 1 y 2 son DOS
// escrituras separadas: si la segunda falla, la serie queda dada de baja con sus turnos futuros vivos.
// Por eso la rama que detecta "esta serie ya estaba cancelada" NO se limita a informarlo: vuelve a
// emitir la cancelación en masa antes de responder (barrido de reparación). El UPDATE es idempotente
// por construcción — su `.neq('status','cancelled')` hace que, si no quedó nada pendiente, afecte 0
// filas — así que reintentar REPARA en vez de tapar. Consecuencia directa sobre el vocabulario del
// módulo: `alreadyCancelled: true` significa "esta llamada no fue la que volteó la serie" (y por lo
// tanto no debe re-disparar mails, D-05/D-14), NUNCA "no hay nada que hacer". Cualquier reintento, por
// cualquiera de las dos vías, deja el estado convergido.
//
// POR QUÉ EL UPDATE MASIVO LLEVA DOS FILTROS Y NO UNO (D-24): con service role no hay RLS, así que el
// aislamiento lo dan EXCLUSIVAMENTE los filtros de la query. `.eq('abono_id', …)` sola alcanzaría para
// no pisar otra serie, pero deja el tenant a merced de que el abonoId recibido sea realmente del
// negocio; `.eq('business_id', …)` sola cancelaría TODOS los turnos futuros del negocio. Van SIEMPRE
// las dos: acota por serie Y por tenant. Es la mitigación central de la fase (T-07-01).

// Entrada común de las dos operaciones del módulo. `businessId` YA viene resuelto por el caller (por
// cancel_token en la vía pública, por owner_id de la sesión en la vía panel): el motor no lo deriva de
// ningún input crudo ni confía en un id que llegue del browser.
export type AbonoCancelInput = {
  // Rol-agnóstico como lib/abono-generation.ts: se usa tal cual llega (service-role por token,
  // anon+RLS por panel). El motor no crea su propio cliente.
  supabase: SupabaseClient
  businessId: string
  abonoId: string
  // Corte 'yyyy-MM-dd' inyectable (los tests lo fijan para no depender del reloj). Ausente → hoy en AR.
  todayStr?: string
}

// Resumen del efecto (o del preview) de la baja: cuántos turnos futuros hay/hubo y cuál es el último.
// Es lo que consumen el aviso previo de D-03 y la pantalla de éxito.
export type AbonoCancelSummary = { count: number; lastDate: string | null }

export type CancelAbonoSeriesResult =
  // La serie YA estaba dada de baja: no se tocó ningún turno y el caller NO debe re-disparar mails (D-05).
  | { ok: true; alreadyCancelled: true; cancelledCount: 0; lastDate: null }
  // Baja efectiva: esta llamada es la que volteó la serie. `cancelledCount`/`lastDate` son el efecto REAL.
  | { ok: true; alreadyCancelled: false; cancelledCount: number; lastDate: string | null }
  // 'not_found' = no existe, o es de otro tenant (a propósito no se distingue). 'update_failed' = error de DB.
  | { ok: false; error: 'not_found' | 'update_failed' }

/**
 * "Hoy" como 'yyyy-MM-dd' del día calendario ARGENTINO (D-02).
 *
 * `todayInAR()` (lib/booking-window) es la única fuente de verdad del día AR y devuelve medianoche
 * LOCAL de ese día. La serialización se arma con los componentes LOCALES del Date
 * (getFullYear / getMonth+1 / getDate) y NO con la representación UTC del instante: en Vercel el
 * proceso corre en UTC, así que recortar los 10 primeros caracteres del ISO string de esa medianoche
 * local devuelve el día equivocado en toda la franja cercana a la medianoche AR — y ahí el corte se
 * correría una jornada entera, dejando vivo (o matando de más) el turno del día. Mismo `toISODate`
 * que ya viven duplicados en app/api/abonos/create y en el cron; acá queda centralizado.
 */
export function todayISOInAR(): string {
  const d = todayInAR()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Las ocurrencias que la baja considera FUTURAS. PURA (sin DB): es la regla, en un solo lugar.
 *
 * - `date >= todayStr` INCLUSIVE (D-02): el turno de HOY más tarde también se cancela. Comparación
 *   lexicográfica de 'yyyy-MM-dd', que equivale a comparar fechas.
 * - `status !== 'cancelled'`: los turnos que ya fueron cancelados individualmente no se cuentan ni se
 *   vuelven a tocar (si no, el número que se le muestra al usuario mentiría respecto del efecto real).
 *   Si `status` viene `undefined` la fila se conserva: significa que la query del caller ya filtró.
 * - `date` nulo → se descarta (no hay forma de ubicarlo respecto del corte).
 */
export function selectFutureOccurrences<T extends { date: string | null; status?: string | null }>(
  rows: T[],
  todayStr: string,
): T[] {
  return rows.filter(r => {
    if (!r.date) return false
    if (r.date < todayStr) return false
    return r.status !== 'cancelled'
  })
}

/**
 * Conteo + última fecha de un set de ocurrencias. PURA. `lastDate` es el máximo 'yyyy-MM-dd' (string
 * compare) o null si no hay filas — es el "el último el 15/09" del aviso previo (D-03).
 */
export function summarizeOccurrences(rows: { date: string | null }[]): AbonoCancelSummary {
  let lastDate: string | null = null
  for (const r of rows) {
    if (r.date && (lastDate === null || r.date > lastDate)) lastDate = r.date
  }
  return { count: rows.length, lastDate }
}

/**
 * Preview de la baja (D-03/D-11): cuántos turnos futuros se cancelarían y cuál es el último, SIN
 * escribir nada. Lo consumen la página pública antes de confirmar y el detalle del abono en el panel.
 *
 * Lee únicamente `date, status` del par (business_id, abono_id) recibido — ni ids ni datos del cliente
 * (T-07-05). El resultado igual pasa por selectFutureOccurrences + summarizeOccurrences aunque la query
 * ya filtre: la regla de "qué es futuro" vive en UN solo lugar y el preview no puede divergir del efecto.
 */
export async function previewAbonoCancellation(input: AbonoCancelInput): Promise<AbonoCancelSummary> {
  const { supabase, businessId, abonoId } = input
  const cutoff = input.todayStr ?? todayISOInAR()

  const { data, error } = await supabase
    .from('appointments')
    .select('date, status')
    .eq('business_id', businessId)
    .eq('abono_id', abonoId)
    .neq('status', 'cancelled')
    .gte('date', cutoff)

  // Degrada limpio: el preview es informativo, no puede romper la pantalla que lo muestra.
  if (error) {
    console.error('[abonos/cancel] preview error:', error instanceof Error ? error.message : error)
    return { count: 0, lastDate: null }
  }

  const rows = (data ?? []) as { date: string | null; status?: string | null }[]
  return summarizeOccurrences(selectFutureOccurrences(rows, cutoff))
}

/**
 * Da de baja la serie completa. ÚNICA implementación de la baja (D-07): la llaman las dos vías.
 *
 * Secuencia: (a) gate atómico de estado sobre la fila del abono, (b) desambiguación si no volteó nada,
 * (c) cancelación en masa de los turnos futuros de ESA serie y ESE tenant, (d) resumen del efecto real.
 */
export async function cancelAbonoSeries(input: AbonoCancelInput): Promise<CancelAbonoSeriesResult> {
  const { supabase, businessId, abonoId } = input
  const cutoff = input.todayStr ?? todayISOInAR()

  // (a) GATE ATÓMICO DE ESTADO (D-05, T-07-03). El filtro `.neq('status','cancelled')` va DENTRO del
  // UPDATE y no en un `if` previo a propósito: si primero se leyera el estado y después se escribiera,
  // dos requests simultáneas sobre el mismo token pasarían las dos el chequeo y las dos seguirían →
  // dos mails de baja al cliente. Con el filtro adentro, sólo la request que efectivamente VOLTEA la
  // fila recibe filas de vuelta y continúa; las demás caen en la rama alreadyCancelled y no notifican.
  // Nótese que `.neq('status','cancelled')` deja pasar 'completed': un finito que ya juntó sus N
  // sesiones se da de baja por este MISMO camino (completed → cancelled, D-21).
  const { data: flipped, error: abonoErr } = await supabase
    .from('abonos')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', abonoId)
    .eq('business_id', businessId)
    .neq('status', 'cancelled')
    .select('id')

  if (abonoErr) {
    console.error(
      `[abonos/cancel] update abono FALLÓ (abono ${abonoId}):`,
      abonoErr instanceof Error ? abonoErr.message : abonoErr,
    )
    return { ok: false, error: 'update_failed' }
  }

  // (b) El UPDATE no volteó nada: o la serie ya estaba cancelada, o el par (abonoId, businessId) no
  // existe. Se desambigua con una lectura acotada por los MISMOS dos filtros.
  if (!flipped || flipped.length === 0) {
    const { data: existing } = await supabase
      .from('abonos')
      .select('id, status')
      .eq('id', abonoId)
      .eq('business_id', businessId)
      .maybeSingle()

    // Sin fila: no existe, O existe pero es de OTRO negocio. Se devuelve lo mismo a propósito — no se
    // revela la existencia de un abono ajeno (D-22).
    if (!existing) return { ok: false, error: 'not_found' }

    // BARRIDO DE REPARACIÓN (CR-01, T-07-23). La serie ya estaba en 'cancelled', pero eso NO garantiza
    // que sus turnos futuros hayan quedado cancelados: si una ejecución anterior falló entre (a) y (c),
    // la fila está volteada y los turnos siguen vivos, y el gate atómico impide que un reintento vuelva
    // a entrar por (c). Así que se re-emite acá el MISMO UPDATE, con los MISMOS cuatro filtros: los dos
    // `.eq` son el doble scoping de D-24 (sin ellos el barrido alcanzaría otra serie del negocio o, con
    // service role y sin RLS, otro tenant), `.gte('date', cutoff)` es la frontera INCLUSIVE de D-02 (no
    // toca el pasado) y `.neq('status','cancelled')` es lo que lo vuelve idempotente: si no quedó nada
    // pendiente afecta 0 filas. Nunca escribe un status distinto de 'cancelled': no resucita turnos ni
    // reabre slots (D-04), así que no introduce ventana nueva de doble-booking.
    const { error: repairErr } = await supabase
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('business_id', businessId)
      .eq('abono_id', abonoId)
      .gte('date', cutoff)
      .neq('status', 'cancelled')

    if (repairErr) {
      console.error(
        `[abonos/cancel] barrido de reparación FALLÓ (abono ${abonoId}):`,
        repairErr instanceof Error ? repairErr.message : repairErr,
      )
      return { ok: false, error: 'update_failed' }
    }

    // Ya estaba dada de baja: el caller no re-dispara mails (D-05). `cancelledCount` se mantiene en 0 A
    // PROPÓSITO aunque el barrido haya reparado filas: el número que informa esta rama es "cuántos
    // canceló ESTA baja", y la baja la ejecutó (o intentó) otra llamada. Devolver acá lo reparado haría
    // que el panel y la pantalla pública le anuncien al usuario un efecto que él no produjo.
    return { ok: true, alreadyCancelled: true, cancelledCount: 0, lastDate: null }
  }

  // (c) CANCELACIÓN EN MASA (D-01/D-24). Los dos `.eq` son la mitigación central de la fase (T-07-01):
  // sin ambos, la baja podría alcanzar turnos de otra serie del mismo negocio o, peor, de otro tenant.
  // `.gte('date', cutoff)` implementa la frontera INCLUSIVE de D-02 (el turno de hoy entra, el de ayer
  // no); `.neq('status','cancelled')` deja fuera los ya cancelados a mano para que el número informado
  // sea el efecto real y coincida con el preview.
  const { data: affected, error: apptErr } = await supabase
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('business_id', businessId)
    .eq('abono_id', abonoId)
    .gte('date', cutoff)
    .neq('status', 'cancelled')
    .select('date')

  if (apptErr) {
    // La fila del abono YA quedó cancelada, así que la garantía crítica (frenar la generación forward)
    // se sostiene aunque este UPDATE falle. Pero la serie queda dada de baja CON turnos futuros vivos:
    // este estado es inconsistente y hay que repararlo. El camino de recuperación es el barrido de la
    // rama (b): como el gate atómico ya no vuelve a matchear, cualquier reintento — por el link del
    // mail o por el panel — cae ahí y re-aplica esta misma cancelación en masa hasta dejarla en 0.
    console.error(
      `[abonos/cancel] cancelación en masa FALLÓ (abono ${abonoId}):`,
      apptErr instanceof Error ? apptErr.message : apptErr,
    )
    return { ok: false, error: 'update_failed' }
  }

  // (d) El resumen sale de las filas REALMENTE afectadas por el UPDATE, no de un conteo previo: así el
  // número que se informa es el efecto real, sin ventana de carrera entre el preview y la baja.
  const { count, lastDate } = summarizeOccurrences((affected ?? []) as { date: string | null }[])
  return { ok: true, alreadyCancelled: false, cancelledCount: count, lastDate }
}
