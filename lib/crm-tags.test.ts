import { describe, it, expect } from 'vitest'
import { filterByTags } from '@/lib/crm-tags'

type Row = { id: string; tagIds: string[] }

const ROWS: Row[] = [
  { id: '1', tagIds: ['vip', 'salud'] },
  { id: '2', tagIds: ['belleza'] },
  { id: '3', tagIds: [] },
  { id: '4', tagIds: ['vip'] },
]

describe('filterByTags (semántica OR, D-09)', () => {
  it('selección vacía devuelve TODAS las filas (filtro inactivo)', () => {
    expect(filterByTags(ROWS, [])).toHaveLength(4)
  })

  it('una tag matchea cualquier fila que la tenga', () => {
    expect(filterByTags(ROWS, ['vip']).map((r) => r.id)).toEqual(['1', '4'])
  })

  it('varias tags devuelven la UNIÓN (OR, no AND)', () => {
    expect(filterByTags(ROWS, ['salud', 'belleza']).map((r) => r.id).sort()).toEqual(['1', '2'])
  })

  it('ninguna coincidencia devuelve vacío', () => {
    expect(filterByTags(ROWS, ['inexistente'])).toEqual([])
  })

  it('una fila con varias tags aparece UNA sola vez aunque matchee varias seleccionadas', () => {
    const out = filterByTags(ROWS, ['vip', 'salud'])
    expect(out.map((r) => r.id)).toEqual(['1', '4'])
  })

  it('filas sin tags solo aparecen con selección vacía', () => {
    expect(filterByTags(ROWS, ['vip']).some((r) => r.id === '3')).toBe(false)
    expect(filterByTags(ROWS, []).some((r) => r.id === '3')).toBe(true)
  })
})
