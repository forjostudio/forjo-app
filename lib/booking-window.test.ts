import { describe, it, expect, afterEach, vi } from 'vitest'
import { addDays, format, startOfDay } from 'date-fns'
import { todayInAR, effectiveBookingCutoff, isDateOutOfWindow } from '@/lib/booking-window'

// La ventana de reserva se computa en hora Argentina (UTC-3 sin DST, D-07). El server corre en UTC
// (Vercel), así que estos tests fijan la hora del sistema en el borde de medianoche para probar que
// "hoy" se resuelve al día AR, no al día UTC. Todo se compara en medianoche LOCAL (parseISO de un
// 'yyyy-mm-dd' devuelve medianoche local), por eso los tests son independientes del TZ del runner.

describe('todayInAR', () => {
  afterEach(() => vi.useRealTimers())

  it('resuelve el día AR (no el UTC) en el borde de medianoche', () => {
    // 02:30 UTC del 2026-07-20 = 23:30 AR del 2026-07-19 → debe dar el 19, no el 20.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-20T02:30:00.000Z'))
    const d = todayInAR()
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(6) // julio (0-indexed)
    expect(d.getDate()).toBe(19)
    expect(d.getHours()).toBe(0)
    expect(d.getMinutes()).toBe(0)
    expect(d.getSeconds()).toBe(0)
  })

  it('mismo día calendario cuando UTC y AR coinciden (mediodía AR)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-19T15:00:00.000Z')) // 12:00 AR
    const d = todayInAR()
    expect(d.getMonth()).toBe(6)
    expect(d.getDate()).toBe(19)
  })
})

describe('effectiveBookingCutoff', () => {
  afterEach(() => vi.useRealTimers())

  it('modo fecha fija tiene precedencia sobre días (D-03 red de seguridad)', () => {
    const c = effectiveBookingCutoff({ max_advance_days: 30, max_advance_date: '2026-08-15' })
    expect(c).toEqual(startOfDay(new Date(2026, 7, 15))) // parseISO → medianoche local del 15/08
  })

  it('modo rolling: hoy AR + N días', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-19T15:00:00.000Z'))
    const c = effectiveBookingCutoff({ max_advance_days: 30 })
    expect(c).toEqual(startOfDay(addDays(new Date(2026, 6, 19), 30)))
  })

  it('sin límite: ambos null → null', () => {
    expect(effectiveBookingCutoff({ max_advance_days: null, max_advance_date: null })).toBeNull()
  })

  it('sin límite: max_advance_days = 0 → null', () => {
    expect(effectiveBookingCutoff({ max_advance_days: 0 })).toBeNull()
  })
})

describe('isDateOutOfWindow', () => {
  afterEach(() => vi.useRealTimers())

  it('corte INCLUSIVE en modo rolling: hoy+30 permitido, hoy+31 rechazado (D-02)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-19T15:00:00.000Z'))
    const b = { max_advance_days: 30 }
    const cutoff = effectiveBookingCutoff(b)! // hoy+30
    const atCutoff = format(cutoff, 'yyyy-MM-dd')
    const past = format(addDays(cutoff, 1), 'yyyy-MM-dd')
    expect(isDateOutOfWindow(b, atCutoff)).toBe(false) // inclusive: el día del corte se puede reservar
    expect(isDateOutOfWindow(b, past)).toBe(true)
  })

  it('sin límite (cutoff null) → nunca fuera de ventana', () => {
    expect(isDateOutOfWindow({ max_advance_days: null, max_advance_date: null }, '2099-12-31')).toBe(false)
  })

  it('modo fecha fija: el día del corte permitido, el siguiente rechazado', () => {
    const b = { max_advance_date: '2026-08-15' }
    expect(isDateOutOfWindow(b, '2026-08-14')).toBe(false)
    expect(isDateOutOfWindow(b, '2026-08-15')).toBe(false) // inclusive
    expect(isDateOutOfWindow(b, '2026-08-16')).toBe(true)
  })
})
