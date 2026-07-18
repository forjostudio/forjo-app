import { addDays, isAfter, parseISO, startOfDay } from 'date-fns'

// ── Ventana de reserva pública (BOOK-WINDOW) ────────────────────────────────────────────────
// Fuente ÚNICA de verdad del corte de la ventana de reserva, compartida por la UI (los dos
// calendarios públicos capan navegación/días) y por el backstop server (app/api/booking/create).
// Que ambos consuman EXACTAMENTE la misma función evita drift entre lo que el cliente ve y lo
// que el server acepta (D-08 enforcement en 3 capas).
//
// Funciones PURAS: sin React ni Supabase → reutilizables en client y server, testeables sin DB.
//
// D-07 (hora AR): todo se computa en zona Argentina (America/Argentina/Buenos_Aires, UTC-3 sin DST).
// El server corre en UTC en Vercel, así que "hoy" NUNCA se toma de `new Date()` crudo: un cliente
// que reserva 23:30 AR (= 02:30 UTC del día siguiente) vería el corte corrido un día. Se usa el
// offset literal -03:00, mismo patrón que lib/crm-metrics.ts.

// Subconjunto de Business que necesita el cálculo (lo cumplen Business y PublicBusiness).
type BookingWindowBiz = {
  max_advance_days?: number | null
  max_advance_date?: string | null
}

/**
 * "Hoy" en hora AR, a medianoche del día calendario argentino, robusto aunque el server corra en UTC.
 *
 * Se desplaza el instante actual -3h para obtener la pared-reloj AR expresada en campos UTC, se toman
 * sus componentes de fecha (= día calendario AR) y se materializan como medianoche LOCAL con el
 * constructor `new Date(y, m, d)`. Medianoche local es la representación con la que también trabajan
 * `parseISO('yyyy-mm-dd')` y `addDays`, de modo que todas las comparaciones son homogéneas e
 * independientes del timezone del proceso.
 */
export function todayInAR(): Date {
  const now = new Date()
  const ar = new Date(now.getTime() - 3 * 60 * 60 * 1000) // pared-reloj AR en campos UTC
  return new Date(ar.getUTCFullYear(), ar.getUTCMonth(), ar.getUTCDate())
}

/**
 * Fecha de corte efectiva de la ventana (INCLUSIVE). `null` = sin límite (modo c).
 *
 * Precedencia (D-03, red de seguridad): si conviven ambos valores, la fecha fija gana sobre los días
 * rolling. En la práctica el UI escribe una sola columna y nulea la otra (los 3 modos son mutuamente
 * excluyentes), así que la precedencia no debería ejercerse; queda como salvaguarda.
 */
export function effectiveBookingCutoff(b: BookingWindowBiz): Date | null {
  if (b.max_advance_date) return startOfDay(parseISO(b.max_advance_date)) // modo (b) fecha fija
  if (b.max_advance_days && b.max_advance_days > 0) {
    return startOfDay(addDays(todayInAR(), b.max_advance_days)) // modo (a) rolling
  }
  return null // modo (c) sin límite
}

/**
 * ¿La fecha `dateStr` (ISO 'yyyy-mm-dd') cae FUERA de la ventana de reserva?
 *
 * Corte INCLUSIVE (D-02): con max_advance_days=30 se puede reservar hasta hoy+30 inclusive; solo se
 * rechaza lo estrictamente posterior al corte. Sin límite (cutoff null) → nunca fuera de ventana.
 * Este es el predicado que consume el backstop server (Plan 04) para el rechazo anti-tampering.
 */
export function isDateOutOfWindow(b: BookingWindowBiz, dateStr: string): boolean {
  const cutoff = effectiveBookingCutoff(b)
  if (!cutoff) return false
  return isAfter(startOfDay(parseISO(dateStr)), cutoff)
}
