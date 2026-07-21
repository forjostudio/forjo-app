import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  todayISOInAR,
  selectFutureOccurrences,
  summarizeOccurrences,
} from '@/lib/abono-cancel'

// ── Tests PUROS de las REGLAS de la baja de serie (lib/abono-cancel.ts) ───────────────────────
// Acá se prueba QUÉ decide el motor, sin DB ni red: qué ocurrencia se considera futura (frontera
// inclusive de D-02), qué se excluye (las ya canceladas individualmente), cómo se resuelve "hoy" en
// hora argentina (D-02) y cómo se derivan el conteo y la última fecha del aviso previo (D-03).
//
// El EFECTO real contra la base (scoping por serie y por tenant, idempotencia del gate atómico,
// completed → cancelled) se prueba aparte en test/abono-cancel.test.ts, que sí necesita Supabase.
//
// Igual que lib/booking-window.test.ts: el reloj se fija con vi.setSystemTime() para poder pararse en
// el borde de medianoche, y las aserciones son independientes del timezone del runner.

describe('todayISOInAR', () => {
  afterEach(() => vi.useRealTimers())

  it('resuelve el día AR (no el UTC) en el borde de medianoche', () => {
    // 02:30 UTC del 2026-07-20 = 23:30 AR del 2026-07-19 → el corte es el 19, no el 20. Si el corte se
    // corriera al 20, la baja dejaría VIVO el turno del 19 (que todavía es "hoy" para el negocio).
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-20T02:30:00.000Z'))
    expect(todayISOInAR()).toBe('2026-07-19')
  })

  it('mismo día calendario cuando UTC y AR coinciden (mediodía AR)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-19T15:00:00.000Z')) // 12:00 AR
    expect(todayISOInAR()).toBe('2026-07-19')
  })

  it('devuelve siempre el formato yyyy-MM-dd con zero-pad', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-05T15:00:00.000Z'))
    expect(todayISOInAR()).toBe('2026-02-05')
    expect(todayISOInAR()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('selectFutureOccurrences', () => {
  const TODAY = '2026-07-19'

  it('frontera INCLUSIVE: el turno de HOY se conserva (D-02)', () => {
    const rows = [{ date: TODAY, status: 'confirmed' }]
    expect(selectFutureOccurrences(rows, TODAY)).toEqual(rows)
  })

  it('descarta un date anterior a hoy', () => {
    const rows = [{ date: '2026-07-18', status: 'confirmed' }]
    expect(selectFutureOccurrences(rows, TODAY)).toEqual([])
  })

  it('descarta los ya cancelados individualmente aunque sean futuros', () => {
    const rows = [
      { date: '2026-07-26', status: 'cancelled' },
      { date: '2026-08-02', status: 'confirmed' },
    ]
    expect(selectFutureOccurrences(rows, TODAY)).toEqual([{ date: '2026-08-02', status: 'confirmed' }])
  })

  it('conserva la fila sin status (la query del caller ya filtró)', () => {
    const rows = [{ date: '2026-07-26' }]
    expect(selectFutureOccurrences(rows, TODAY)).toEqual(rows)
  })

  it('descarta las filas con date null', () => {
    const rows = [
      { date: null, status: 'confirmed' },
      { date: '2026-07-26', status: 'confirmed' },
    ]
    expect(selectFutureOccurrences(rows, TODAY)).toEqual([{ date: '2026-07-26', status: 'confirmed' }])
  })
})

describe('summarizeOccurrences', () => {
  it('lista vacía → count 0 y lastDate null', () => {
    expect(summarizeOccurrences([])).toEqual({ count: 0, lastDate: null })
  })

  it('fechas desordenadas → lastDate es el máximo y count el largo', () => {
    const rows = [{ date: '2026-08-02' }, { date: '2026-09-13' }, { date: '2026-07-26' }]
    expect(summarizeOccurrences(rows)).toEqual({ count: 3, lastDate: '2026-09-13' })
  })

  it('ignora los date null al calcular lastDate pero los cuenta en count', () => {
    // count = filas recibidas; el filtrado de nulos es responsabilidad de selectFutureOccurrences.
    expect(summarizeOccurrences([{ date: null }, { date: '2026-08-02' }])).toEqual({
      count: 2,
      lastDate: '2026-08-02',
    })
  })
})

describe('composición selectFutureOccurrences + summarizeOccurrences', () => {
  it('sobre un set mixto devuelve el conteo y la última fecha del aviso previo (D-03)', () => {
    const TODAY = '2026-07-19'
    const rows = [
      { date: '2026-07-05', status: 'confirmed' }, // pasado → fuera
      { date: '2026-07-12', status: 'cancelled' }, // pasado + cancelado → fuera
      { date: TODAY, status: 'confirmed' }, // hoy → DENTRO (frontera inclusive)
      { date: '2026-07-26', status: 'cancelled' }, // futuro pero ya cancelado a mano → fuera
      { date: '2026-08-02', status: 'confirmed' }, // futuro → dentro
      { date: '2026-08-09', status: 'pending' }, // futuro no cancelado → dentro
      { date: null, status: 'confirmed' }, // sin fecha → fuera
    ]
    expect(summarizeOccurrences(selectFutureOccurrences(rows, TODAY))).toEqual({
      count: 3,
      lastDate: '2026-08-09',
    })
  })
})
