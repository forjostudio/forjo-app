import { describe, it, expect } from 'vitest'
import { mapBusinessHours, mapServices, DAYS } from '@/lib/agent-context'

// ── mapBusinessHours ────────────────────────────────────────────────────────────────────────────
// Agrupa filas de business_hours por day_of_week (0..6) en el shape del HANDOFF:
// 7 entradas [{ day, ranges:[{open,close}] }], con open/close en HH:MM. is_open=false o times null
// → la fila se ignora (ese día queda con ranges:[]).
describe('mapBusinessHours', () => {
  it('devuelve 7 entradas en orden domingo..sábado', () => {
    const out = mapBusinessHours([])
    expect(out).toHaveLength(7)
    expect(out.map((h) => h.day)).toEqual([...DAYS])
  })

  it('agrupa por day_of_week y recorta a HH:MM', () => {
    const out = mapBusinessHours([
      { day_of_week: 1, open_time: '09:00:00', close_time: '13:00:00', is_open: true },
      { day_of_week: 1, open_time: '17:00:00', close_time: '21:00:00', is_open: true },
    ])
    const lunes = out[1]
    expect(lunes.day).toBe('lunes')
    expect(lunes.ranges).toEqual([
      { open: '09:00', close: '13:00' },
      { open: '17:00', close: '21:00' },
    ])
  })

  it('ignora filas con is_open=false', () => {
    const out = mapBusinessHours([
      { day_of_week: 2, open_time: '09:00:00', close_time: '18:00:00', is_open: false },
    ])
    expect(out[2].ranges).toEqual([])
  })

  it('ignora filas con open_time o close_time null', () => {
    const out = mapBusinessHours([
      { day_of_week: 3, open_time: null, close_time: '18:00:00', is_open: true },
      { day_of_week: 3, open_time: '09:00:00', close_time: null, is_open: true },
    ])
    expect(out[3].ranges).toEqual([])
  })

  it('tolera input null/undefined → 7 días con ranges vacíos', () => {
    expect(mapBusinessHours(null)).toHaveLength(7)
    expect(mapBusinessHours(undefined)).toHaveLength(7)
    expect(mapBusinessHours(null).every((h) => h.ranges.length === 0)).toBe(true)
  })
})

// ── mapServices ─────────────────────────────────────────────────────────────────────────────────
// Mapea filas de services al shape del bot: name/durationMinutes/price(number|null)/description.
describe('mapServices', () => {
  it('mapea name/durationMinutes/price/description', () => {
    const out = mapServices([
      { name: 'Corte', duration_minutes: 30, price: 1500, description: 'Corte de pelo' },
    ])
    expect(out).toEqual([
      { name: 'Corte', durationMinutes: 30, price: 1500, description: 'Corte de pelo' },
    ])
  })

  it('convierte price string/decimal a number', () => {
    const out = mapServices([
      { name: 'Color', duration_minutes: 60, price: '2500.50', description: null },
    ])
    expect(out[0].price).toBe(2500.5)
    expect(typeof out[0].price).toBe('number')
  })

  it('tolera price null → null', () => {
    const out = mapServices([
      { name: 'Consulta', duration_minutes: null, price: null, description: null },
    ])
    expect(out[0].price).toBeNull()
    expect(out[0].durationMinutes).toBeNull()
    expect(out[0].description).toBeNull()
  })

  it('tolera input null/undefined → []', () => {
    expect(mapServices(null)).toEqual([])
    expect(mapServices(undefined)).toEqual([])
  })
})
