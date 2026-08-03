// ── Corte "pasado / próximo" de un turno (hora AR) ──────────────────────────────────────────
// Fuente ÚNICA de verdad del límite entre los tabs "Próximos" y "Pasados" de /turnos.
//
// Por qué existe: el filtro comparaba SOLO `a.date` contra el día de hoy, así que un turno de HOY
// a una hora ya pasada seguía apareciendo en "Próximos" y no aparecía NUNCA en "Pasados". El corte
// necesita fecha Y hora.
//
// Hora AR (D-07, misma convención que lib/booking-window.ts): la app trabaja en
// America/Argentina/Buenos_Aires (UTC-3, sin DST) y el server de Vercel corre en UTC. "Ahora" NUNCA
// se toma de `new Date()` crudo: a las 22:00 de Buenos Aires el reloj UTC ya está en el día
// siguiente y el corte se correría un día entero.
//
// Funciones PURAS: sin React ni Supabase → testeables sin DB (test/appointment-time.test.ts).
//
// DIVERGENCIA CONOCIDA con el gate de borrado (migración 065, `services_block_delete`, D-08): ese
// trigger define "futuro" como `date >= today` en hora AR SIN la hora. O sea: un turno de hoy a una
// hora ya pasada se ve en "Pasados" pero sigue bloqueando el borrado de su servicio. Es a propósito
// — el gate es conservador y cambiarlo pide una migración nueva.

/** Par de strings comparables lexicográficamente con las columnas `date` y `time` de appointments. */
export interface ARNow {
  /** 'yyyy-MM-dd' */
  date: string
  /** 'HH:mm:ss' */
  time: string
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Normaliza una hora de Postgres a 'HH:mm:ss' para que la comparación de strings sea válida:
 *  `time` puede llegar como '13:00:00' o '13:00', y '13:00' < '13:00:00' compararía mal. */
function hhmmss(raw: string): string {
  const [h = '0', m = '0', s = '0'] = raw.split(':')
  return `${pad2(Number(h) || 0)}:${pad2(Number(m) || 0)}:${pad2(Number(s) || 0)}`
}

/**
 * "Ahora" en hora AR, como fecha + hora de pared en strings.
 *
 * Se desplaza el instante -3h para obtener la pared-reloj argentina expresada en campos UTC y se
 * leen sus componentes (mismo truco que `todayInAR` de lib/booking-window.ts). `at` se inyecta en
 * los tests para no depender del reloj de la máquina.
 */
export function nowInAR(at: Date = new Date()): ARNow {
  const ar = new Date(at.getTime() - 3 * 60 * 60 * 1000)
  return {
    date: `${ar.getUTCFullYear()}-${pad2(ar.getUTCMonth() + 1)}-${pad2(ar.getUTCDate())}`,
    time: `${pad2(ar.getUTCHours())}:${pad2(ar.getUTCMinutes())}:${pad2(ar.getUTCSeconds())}`,
  }
}

/**
 * ¿El turno ya pasó respecto de `now` (hora AR)?
 *
 * Distinto día → manda la fecha. Mismo día → manda la hora. Un turno SIN hora (columna nula o
 * vacía) se trata como del final del día: sigue contando como próximo hasta que cambia la fecha.
 * Esa asimetría es deliberada — el turno tiene que caer siempre de UN lado del corte, nunca
 * desaparecer de los dos tabs.
 *
 * El límite es estricto (`<`): el turno de la hora exacta todavía no pasó.
 */
export function isPastAppointment(
  appt: { date: string; time?: string | null },
  now: ARNow,
): boolean {
  if (appt.date !== now.date) return appt.date < now.date
  const t = appt.time
  if (!t) return false
  return hhmmss(t) < hhmmss(now.time)
}
