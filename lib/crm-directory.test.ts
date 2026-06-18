import { describe, it, expect } from 'vitest'
import { filterBusinesses } from '@/lib/crm-directory'
import type { DirectoryRow } from '@/lib/crm-directory'

function row(partial: Partial<DirectoryRow> & { id: string }): DirectoryRow {
  return {
    id: partial.id,
    name: partial.name ?? `Negocio ${partial.id}`,
    slug: partial.slug ?? `negocio-${partial.id}`,
    email: partial.email ?? null,
    plan: partial.plan ?? 'basic',
    plan_status: partial.plan_status ?? 'active',
    trial_ends_at: partial.trial_ends_at ?? null,
  }
}

const ROWS: DirectoryRow[] = [
  row({ id: '1', name: 'Acme Studio', slug: 'acme', email: 'hola@acme.com', plan_status: 'active' }),
  row({ id: '2', name: 'Bella Peluquería', slug: 'bella', email: 'info@bella.com', plan_status: 'trial' }),
  row({ id: '3', name: 'Consultorio Sur', slug: 'sur', email: 'sur@mail.com', plan_status: 'suspended' }),
  row({ id: '4', name: 'Delta', slug: 'delta', email: 'd@delta.com', plan_status: 'cancelled' }),
  row({ id: '5', name: 'Epsilon', slug: 'epsilon', email: 'e@eps.com', plan_status: 'expired' }),
]

describe('filterBusinesses', () => {
  it('tab "todos" INCLUYE los suspendidos (Pitfall 4 — nunca un default que los oculte)', () => {
    const out = filterBusinesses(ROWS, { query: '', tab: 'todos' })
    expect(out).toHaveLength(5)
    expect(out.some((r) => r.plan_status === 'suspended')).toBe(true)
  })

  it('tab "suspendidos" devuelve solo plan_status==="suspended"', () => {
    const out = filterBusinesses(ROWS, { query: '', tab: 'suspendidos' })
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('3')
  })

  it('tab "activos" solo active; tab "trial" solo trial', () => {
    expect(filterBusinesses(ROWS, { query: '', tab: 'activos' }).map((r) => r.id)).toEqual(['1'])
    expect(filterBusinesses(ROWS, { query: '', tab: 'trial' }).map((r) => r.id)).toEqual(['2'])
  })

  it('tab "churn" devuelve cancelled + expired', () => {
    const out = filterBusinesses(ROWS, { query: '', tab: 'churn' })
    expect(out.map((r) => r.id).sort()).toEqual(['4', '5'])
  })

  it('query matchea por nombre/email/slug case-insensitive', () => {
    expect(filterBusinesses(ROWS, { query: 'acme', tab: 'todos' }).map((r) => r.id)).toEqual(['1'])
    expect(filterBusinesses(ROWS, { query: 'BELLA', tab: 'todos' }).map((r) => r.id)).toEqual(['2'])
    expect(filterBusinesses(ROWS, { query: 'acme.com', tab: 'todos' }).map((r) => r.id)).toEqual(['1'])
    expect(filterBusinesses(ROWS, { query: 'sur', tab: 'todos' }).map((r) => r.id)).toEqual(['3'])
  })

  it('query vacío devuelve todo el tab', () => {
    expect(filterBusinesses(ROWS, { query: '', tab: 'churn' })).toHaveLength(2)
    expect(filterBusinesses(ROWS, { query: '   ', tab: 'todos' })).toHaveLength(5)
  })

  it('la búsqueda se aplica DENTRO del tab (combina ambos filtros)', () => {
    const out = filterBusinesses(ROWS, { query: 'delta', tab: 'activos' })
    expect(out).toHaveLength(0) // Delta es churn, no aparece en activos
  })
})
