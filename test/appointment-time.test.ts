import { describe, it, expect } from 'vitest'
import { nowInAR, isPastAppointment } from '@/lib/appointment-time'

// ── Tests PUROS del corte pasado/próximo de un turno (hora AR) ────────────────────
// Sin Supabase ni creds: el helper no toca la base, así que no van bajo
// `describe.skipIf(!hasSupabaseCreds)`. Mismo estilo que test/appointment-service.test.ts.
//
// Lo que se protege acá: que un turno de HOY a una hora ya pasada caiga en "Pasados" y NO en
// "Próximos" (bug del tab de /turnos, que comparaba solo la fecha), y que ningún turno pueda
// quedar afuera de los dos tabs por el corte.

describe('nowInAR', () => {
  it('devuelve la pared-reloj argentina (UTC-3), no la UTC', () => {
    // 2026-08-03T02:30:00Z = 2026-08-02 23:30 en Buenos Aires → el día AR es el 2, no el 3.
    expect(nowInAR(new Date('2026-08-03T02:30:00Z'))).toEqual({ date: '2026-08-02', time: '23:30:00' })
  })

  it('padea mes, día y hora a dos dígitos', () => {
    expect(nowInAR(new Date('2026-01-05T12:04:07Z'))).toEqual({ date: '2026-01-05', time: '09:04:07' })
  })

  it('cruza el cambio de día hacia atrás (00:30 UTC = 21:30 AR del día anterior)', () => {
    expect(nowInAR(new Date('2026-03-01T00:30:00Z'))).toEqual({ date: '2026-02-28', time: '21:30:00' })
  })
})

describe('isPastAppointment', () => {
  const now = { date: '2026-08-03', time: '13:00:00' }

  it('un turno de un día anterior ya pasó', () => {
    expect(isPastAppointment({ date: '2026-08-02', time: '23:59:00' }, now)).toBe(true)
  })

  it('un turno de un día posterior no pasó', () => {
    expect(isPastAppointment({ date: '2026-08-04', time: '00:01:00' }, now)).toBe(false)
  })

  it('HOY a una hora ya pasada cuenta como pasado (el bug: antes quedaba en "Próximos")', () => {
    expect(isPastAppointment({ date: '2026-08-03', time: '11:30:00' }, now)).toBe(true)
  })

  it('HOY a una hora futura NO cuenta como pasado', () => {
    expect(isPastAppointment({ date: '2026-08-03', time: '14:00:00' }, now)).toBe(false)
  })

  it('el turno de la hora exacta todavía no pasó (límite estricto)', () => {
    expect(isPastAppointment({ date: '2026-08-03', time: '13:00:00' }, now)).toBe(false)
  })

  it("acepta 'HH:mm' además de 'HH:mm:ss' (no compara '13:00' contra '13:00:00' como strings crudos)", () => {
    expect(isPastAppointment({ date: '2026-08-03', time: '13:00' }, now)).toBe(false)
    expect(isPastAppointment({ date: '2026-08-03', time: '12:59' }, now)).toBe(true)
  })

  it('sin hora (null / vacío) se trata como fin del día: hoy sigue siendo próximo', () => {
    expect(isPastAppointment({ date: '2026-08-03', time: null }, now)).toBe(false)
    expect(isPastAppointment({ date: '2026-08-03', time: '' }, now)).toBe(false)
    expect(isPastAppointment({ date: '2026-08-03' }, now)).toBe(false)
    // …pero si el día ya pasó, pasó igual (la fecha decide sola).
    expect(isPastAppointment({ date: '2026-08-02', time: null }, now)).toBe(true)
  })

  it('particiona: ningún turno queda afuera de los dos tabs por el corte', () => {
    const turnos = [
      { date: '2026-08-02', time: '10:00:00' },
      { date: '2026-08-03', time: '09:00:00' },
      { date: '2026-08-03', time: '13:00:00' },
      { date: '2026-08-03', time: '18:00:00' },
      { date: '2026-08-04', time: '08:00:00' },
      { date: '2026-08-03', time: null as string | null },
    ]
    // "pasados" = past, "próximos" (sin cancelados) = !past → la unión es el total y no se solapan.
    const pasados = turnos.filter(t => isPastAppointment(t, now))
    const proximos = turnos.filter(t => !isPastAppointment(t, now))
    expect(pasados.length + proximos.length).toBe(turnos.length)
    expect(pasados.filter(t => proximos.includes(t))).toEqual([])
  })
})
