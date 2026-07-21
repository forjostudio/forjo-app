import { describe, it, expect, afterEach, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  todayISOInAR,
  toISODate,
  abonoDayLabel,
  selectFutureOccurrences,
  summarizeOccurrences,
  previewAbonoCancellation,
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

// Doble mínimo del cliente Supabase: reproduce la cadena EXACTA que arma previewAbonoCancellation
// (.from().select().eq().eq().neq().gte()) y resuelve con el shape que devuelve postgrest. No hace
// falta mockear el paquete: el motor recibe el cliente por parámetro (contrato rol-agnóstico, D-07).
function fakeSupabase(result: { data: unknown; error: unknown }): SupabaseClient {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = () => chain
  chain.neq = () => chain
  chain.gte = () => Promise.resolve(result)
  return { from: () => chain } as unknown as SupabaseClient
}

describe('previewAbonoCancellation — degradación (WR-04)', () => {
  const BASE = { businessId: 'biz-1', abonoId: 'abono-1', todayStr: '2031-03-17' }

  it('ante un error de DB devuelve unknown: true (no un cero indistinguible de "no hay turnos")', async () => {
    // El cero silencioso hacía que la pantalla pública ocultara el aviso previo y el cliente
    // confirmara una acción irreversible sin el dato que D-03/D-11 declaran obligatorio.
    const supabase = fakeSupabase({ data: null, error: { message: 'boom' } })
    const res = await previewAbonoCancellation({ supabase, ...BASE })
    expect(res).toEqual({ count: 0, lastDate: null, unknown: true })
  })

  it('cuando la query anda, el resultado NO viene marcado como unknown', async () => {
    const supabase = fakeSupabase({ data: [{ date: '2031-03-24', status: 'confirmed' }], error: null })
    const res = await previewAbonoCancellation({ supabase, ...BASE })
    expect(res.count).toBe(1)
    expect(res.lastDate).toBe('2031-03-24')
    expect(res.unknown ?? false).toBe(false)
  })
})

describe('abonoDayLabel (IN-01)', () => {
  it('devuelve la etiqueta plural de los 7 dow (convención EXTRACT(dow) 0=domingo)', () => {
    expect(abonoDayLabel(0)).toBe('los domingos')
    expect(abonoDayLabel(1)).toBe('los lunes')
    expect(abonoDayLabel(2)).toBe('los martes')
    expect(abonoDayLabel(3)).toBe('los miércoles')
    expect(abonoDayLabel(4)).toBe('los jueves')
    expect(abonoDayLabel(5)).toBe('los viernes')
    expect(abonoDayLabel(6)).toBe('los sábados')
  })

  it('fallback ÚNICO para cualquier dow inválido: las dos vías dicen lo mismo', () => {
    // Antes, la vía pública dejaba '' y la del panel 'los días': el mail de la MISMA baja decía cosas
    // distintas según quién la ejecutara.
    for (const bad of [-1, 7, 99, NaN, 1.5]) {
      expect(abonoDayLabel(bad)).toBe('los días')
    }
  })
})

describe('toISODate (IN-02)', () => {
  it('serializa por componentes LOCALES del Date, no por su representación UTC', () => {
    // Medianoche local del 1 de enero: en un runner al este de UTC, el ISO string cae en el 31/12 del
    // año anterior. La comparación de fechas del motor es sobre 'yyyy-MM-dd' local, así que ahí el
    // corte se correría una jornada entera.
    const d = new Date(2031, 0, 1, 0, 0, 0)
    expect(toISODate(d)).toBe('2031-01-01')
    const utcSlice = d.toISOString().slice(0, 10)
    if (utcSlice !== '2031-01-01') expect(toISODate(d)).not.toBe(utcSlice)
  })

  it('zero-padea mes y día a 2 dígitos', () => {
    expect(toISODate(new Date(2026, 1, 5, 12, 0, 0))).toBe('2026-02-05')
    expect(toISODate(new Date(2026, 11, 31, 23, 59, 0))).toBe('2026-12-31')
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
