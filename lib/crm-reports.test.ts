import { describe, it, expect } from 'vitest'
import { mrrByPlan, arpa, funnel, churn, ranking, computeSnapshotRows } from '@/lib/crm-reports'
import type { BizRow } from '@/lib/crm-reports'

// ── Fixtures ──────────────────────────────────────────────────────────────────────────────
// `now` fijo para determinismo (Pitfall 5: zona AR). 2026-06-18T12:00:00Z = mediodía UTC.
const NOW = new Date('2026-06-18T12:00:00.000Z')
const PRICES: Record<string, number> = { basic: 15000, studio: 30000, pro: 50000 }

function biz(partial: Partial<BizRow> & { id: string }): BizRow {
  return {
    id: partial.id,
    name: partial.name ?? `Negocio ${partial.id}`,
    plan: partial.plan ?? 'basic',
    plan_status: partial.plan_status ?? 'active',
  }
}

// ── mrrByPlan ──────────────────────────────────────────────────────────────────────────────
describe('mrrByPlan', () => {
  it('agrupa MRR y count por plan, solo sobre activos', () => {
    const rows: BizRow[] = [
      biz({ id: '1', plan: 'basic', plan_status: 'active' }),
      biz({ id: '2', plan: 'basic', plan_status: 'active' }),
      biz({ id: '3', plan: 'studio', plan_status: 'active' }),
      biz({ id: '4', plan: 'studio', plan_status: 'trial' }), // no suma
      biz({ id: '5', plan: 'pro', plan_status: 'cancelled' }), // no suma
    ]
    const out = mrrByPlan(rows, PRICES)
    expect(out.basic).toEqual({ mrr: 30000, count: 2 })
    expect(out.studio).toEqual({ mrr: 30000, count: 1 })
    expect(out.pro).toBeUndefined() // ningún pro activo
  })

  it('un plan activo sin fila de precio suma 0 (no NaN)', () => {
    const rows: BizRow[] = [biz({ id: '1', plan: 'legacy', plan_status: 'active' })]
    const out = mrrByPlan(rows, PRICES)
    expect(out.legacy).toEqual({ mrr: 0, count: 1 })
    expect(Number.isNaN(out.legacy.mrr)).toBe(false)
  })

  it('input vacío → objeto vacío (no NaN)', () => {
    expect(mrrByPlan([], PRICES)).toEqual({})
  })
})

// ── arpa ───────────────────────────────────────────────────────────────────────────────────
describe('arpa', () => {
  it('arpa = mrr / activos', () => {
    expect(arpa(60000, 3)).toBe(20000)
  })

  it('divide-by-zero → 0 (no NaN/Infinity)', () => {
    expect(arpa(60000, 0)).toBe(0)
    expect(Number.isNaN(arpa(0, 0))).toBe(false)
    expect(Number.isFinite(arpa(60000, 0))).toBe(true)
  })
})

// ── funnel ─────────────────────────────────────────────────────────────────────────────────
describe('funnel', () => {
  it('deal en etapa N cuenta en las etapas 1..N (etapa alcanzada)', () => {
    const steps = funnel([{ stage: 'trial', status: 'open' }])
    // trial = order 2 → cuenta en lead(0), calificado(1), trial(2); no en propuesta/pago
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s.count]))
    expect(byKey.lead).toBe(1)
    expect(byKey.calificado).toBe(1)
    expect(byKey.trial).toBe(1)
    expect(byKey.propuesta).toBe(0)
    expect(byKey.pago).toBe(0)
  })

  it("status 'won' cuenta hasta pago, sin importar su stage", () => {
    const steps = funnel([{ stage: 'calificado', status: 'won' }])
    expect(steps.every((s) => s.count === 1)).toBe(true)
  })

  it("status 'lost' corta en su última etapa alcanzada", () => {
    const steps = funnel([{ stage: 'calificado', status: 'lost' }])
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s.count]))
    expect(byKey.lead).toBe(1)
    expect(byKey.calificado).toBe(1)
    expect(byKey.trial).toBe(0)
  })

  it('pct[N] = count[N]/count[N-1]; primera etapa pct=null', () => {
    const steps = funnel([
      { stage: 'lead', status: 'open' },
      { stage: 'lead', status: 'open' },
      { stage: 'calificado', status: 'open' }, // alcanza lead+calificado
      { stage: 'calificado', status: 'open' },
    ])
    // lead = 4 (todos lo alcanzan), calificado = 2
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s]))
    expect(byKey.lead.count).toBe(4)
    expect(byKey.lead.pct).toBeNull()
    expect(byKey.calificado.count).toBe(2)
    expect(byKey.calificado.pct).toBe(0.5)
  })

  it('sin deals → todas las etapas en 0, sin NaN', () => {
    const steps = funnel([])
    expect(steps).toHaveLength(5)
    for (const s of steps) {
      expect(s.count).toBe(0)
      // pct entre etapas con denom 0 → null (no NaN)
      if (s.key !== 'lead') expect(s.pct).toBeNull()
    }
  })

  it('respeta el orden de STAGES (lead → … → pago)', () => {
    const steps = funnel([])
    expect(steps.map((s) => s.key)).toEqual(['lead', 'calificado', 'trial', 'propuesta', 'pago'])
  })
})

// ── churn ──────────────────────────────────────────────────────────────────────────────────
describe('churn', () => {
  it('bajas = count(suspend) - count(reactivate)', () => {
    const events = [
      { action: 'business.suspend' },
      { action: 'business.suspend' },
      { action: 'business.suspend' },
      { action: 'business.reactivate' },
    ]
    const r = churn(events, 100)
    expect(r.bajas).toBe(2)
    expect(r.pct).toBe(2 / 100)
  })

  it('prevActiveCount null → pct null (sin historia, nunca NaN)', () => {
    const r = churn([{ action: 'business.suspend' }], null)
    expect(r.bajas).toBe(1)
    expect(r.pct).toBeNull()
  })

  it('prevActiveCount 0 → pct null (nunca Infinity)', () => {
    const r = churn([{ action: 'business.suspend' }], 0)
    expect(r.bajas).toBe(1)
    expect(r.pct).toBeNull()
  })

  it('sin eventos → bajas 0', () => {
    const r = churn([], 50)
    expect(r.bajas).toBe(0)
    expect(r.pct).toBe(0)
  })
})

// ── ranking ────────────────────────────────────────────────────────────────────────────────
describe('ranking', () => {
  it('ordena desc por MRR; solo activos tienen MRR', () => {
    const rows: BizRow[] = [
      biz({ id: 'a', name: 'Alfa', plan: 'basic', plan_status: 'active' }),
      biz({ id: 'b', name: 'Beta', plan: 'pro', plan_status: 'active' }),
      biz({ id: 'c', name: 'Gama', plan: 'studio', plan_status: 'active' }),
    ]
    const r = ranking(rows, PRICES)
    expect(r.map((x) => x.id)).toEqual(['b', 'c', 'a']) // 50000, 30000, 15000
    expect(r[0]).toMatchObject({ name: 'Beta', plan: 'pro', mrr: 50000 })
  })

  it('VAR = null cuando no hay snapshot previo del negocio', () => {
    const rows: BizRow[] = [biz({ id: 'a', plan: 'pro', plan_status: 'active' })]
    const r = ranking(rows, PRICES)
    expect(r[0].var).toBeNull()
  })

  it('VAR = mrr actual - mrr previo cuando hay snapshot previo', () => {
    const rows: BizRow[] = [biz({ id: 'a', plan: 'pro', plan_status: 'active' })]
    const r = ranking(rows, PRICES, { a: 30000 })
    expect(r[0].var).toBe(20000) // 50000 - 30000
  })

  it('negocio no activo → mrr 0, sin NaN', () => {
    const rows: BizRow[] = [biz({ id: 'a', plan: 'pro', plan_status: 'cancelled' })]
    const r = ranking(rows, PRICES)
    expect(r[0].mrr).toBe(0)
    expect(Number.isNaN(r[0].mrr)).toBe(false)
  })
})

// ── computeSnapshotRows ──────────────────────────────────────────────────────────────────────
describe('computeSnapshotRows', () => {
  it('una fila por plan activo con month en zona AR (primer día del mes)', () => {
    const rows: BizRow[] = [
      biz({ id: '1', plan: 'basic', plan_status: 'active' }),
      biz({ id: '2', plan: 'basic', plan_status: 'active' }),
      biz({ id: '3', plan: 'pro', plan_status: 'active' }),
      biz({ id: '4', plan: 'pro', plan_status: 'trial' }), // no entra
    ]
    const snap = computeSnapshotRows(rows, PRICES, NOW)
    // NOW = 2026-06-18 → mes AR = 2026-06-01
    const byPlan = Object.fromEntries(snap.map((s) => [s.plan, s]))
    expect(byPlan.basic).toEqual({ month: '2026-06-01', plan: 'basic', mrr: 30000, active_count: 2 })
    expect(byPlan.pro).toEqual({ month: '2026-06-01', plan: 'pro', mrr: 50000, active_count: 1 })
    expect(snap).toHaveLength(2)
  })

  it('idempotente por forma: misma entrada → mismas filas', () => {
    const rows: BizRow[] = [biz({ id: '1', plan: 'basic', plan_status: 'active' })]
    const a = computeSnapshotRows(rows, PRICES, NOW)
    const b = computeSnapshotRows(rows, PRICES, NOW)
    expect(a).toEqual(b)
  })

  it('month en borde de mes: 1ro a las 00:00 AR cae en el mes correcto', () => {
    // 2026-07-01T02:00:00Z = 2026-06-30T23:00 AR → mes AR = junio (2026-06-01)
    const borderUtc = new Date('2026-07-01T02:00:00.000Z')
    const rows: BizRow[] = [biz({ id: '1', plan: 'basic', plan_status: 'active' })]
    const snap = computeSnapshotRows(rows, PRICES, borderUtc)
    expect(snap[0].month).toBe('2026-06-01')
  })

  it('sin activos → sin filas (no NaN)', () => {
    const rows: BizRow[] = [biz({ id: '1', plan: 'basic', plan_status: 'cancelled' })]
    expect(computeSnapshotRows(rows, PRICES, NOW)).toEqual([])
  })
})
