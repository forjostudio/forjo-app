import { describe, it, expect } from 'vitest'
import { computeKpis, deriveAlerts, resolveTrialEndsAt } from '@/lib/crm-metrics'
import type { BizRow, Prices } from '@/lib/crm-metrics'

// ── Fixtures ──────────────────────────────────────────────────────────────────────────────
// `now` fijo para determinismo (Pitfall 7: zona AR). 2026-06-18T12:00:00Z = mediodía UTC.
const NOW = new Date('2026-06-18T12:00:00.000Z')
const PRICES: Prices = { basic: 15000, studio: 30000, pro: 50000 }

// helper: una fecha ISO a N días desde NOW
function daysFromNow(n: number): string {
  return new Date(NOW.getTime() + n * 86_400_000).toISOString()
}

function biz(partial: Partial<BizRow> & { id: string }): BizRow {
  return {
    id: partial.id,
    name: partial.name ?? `Negocio ${partial.id}`,
    plan: partial.plan ?? 'basic',
    plan_status: partial.plan_status ?? 'active',
    trial_ends_at: partial.trial_ends_at ?? null,
  }
}

// ── computeKpis ─────────────────────────────────────────────────────────────────────────
describe('computeKpis', () => {
  it('MRR = Σ(precio del plan × activos por plan); negociosActivos = activos', () => {
    const rows: BizRow[] = [
      biz({ id: '1', plan: 'basic', plan_status: 'active' }),
      biz({ id: '2', plan: 'basic', plan_status: 'active' }),
      biz({ id: '3', plan: 'studio', plan_status: 'active' }),
    ]
    const k = computeKpis(rows, PRICES, NOW)
    expect(k.mrr).toBe(60000) // 15000 + 15000 + 30000
    expect(k.negociosActivos).toBe(3)
  })

  it('solo los plan_status==="active" suman al MRR (trial/cancelled no)', () => {
    const rows: BizRow[] = [
      biz({ id: '1', plan: 'pro', plan_status: 'active' }),
      biz({ id: '2', plan: 'pro', plan_status: 'trial' }),
      biz({ id: '3', plan: 'pro', plan_status: 'cancelled' }),
    ]
    const k = computeKpis(rows, PRICES, NOW)
    expect(k.mrr).toBe(50000)
    expect(k.negociosActivos).toBe(1)
  })

  it('trialsPorVencer cuenta trial con trial_ends_at dentro de los próximos 7 días', () => {
    const rows: BizRow[] = [
      biz({ id: '1', plan_status: 'trial', trial_ends_at: daysFromNow(3) }), // cuenta
      biz({ id: '2', plan_status: 'trial', trial_ends_at: daysFromNow(10) }), // NO (>7d)
      biz({ id: '3', plan_status: 'trial', trial_ends_at: daysFromNow(-1) }), // NO (ya vencido)
    ]
    const k = computeKpis(rows, PRICES, NOW)
    expect(k.trialsPorVencer).toBe(1)
  })

  it('pagosFallidos = cancelled + expired; active/trial no cuentan', () => {
    const rows: BizRow[] = [
      biz({ id: '1', plan_status: 'cancelled' }),
      biz({ id: '2', plan_status: 'expired' }),
      biz({ id: '3', plan_status: 'active' }),
      biz({ id: '4', plan_status: 'trial', trial_ends_at: daysFromNow(20) }),
    ]
    const k = computeKpis(rows, PRICES, NOW)
    expect(k.pagosFallidos).toBe(2)
  })

  it('un plan activo sin fila de precio suma 0 (no NaN)', () => {
    const rows: BizRow[] = [biz({ id: '1', plan: 'legacy', plan_status: 'active' })]
    const k = computeKpis(rows, PRICES, NOW)
    expect(k.mrr).toBe(0)
    expect(Number.isNaN(k.mrr)).toBe(false)
    expect(k.negociosActivos).toBe(1)
  })
})

// ── deriveAlerts ────────────────────────────────────────────────────────────────────────
describe('deriveAlerts', () => {
  it('cancelled → pago_fallido; expired → pago_fallido, con businessId+name', () => {
    const rows: BizRow[] = [
      biz({ id: 'a', name: 'Acme', plan_status: 'cancelled' }),
      biz({ id: 'b', name: 'Beta', plan_status: 'expired' }),
    ]
    const alerts = deriveAlerts(rows, NOW)
    expect(alerts).toHaveLength(2)
    expect(alerts[0]).toMatchObject({ businessId: 'a', name: 'Acme', tipo: 'pago_fallido' })
    expect(alerts[1]).toMatchObject({ businessId: 'b', name: 'Beta', tipo: 'pago_fallido' })
  })

  it('trial a 3 días → trial_por_vencer; trial a 10 días → ninguna alerta', () => {
    const rows: BizRow[] = [
      biz({ id: 'c', name: 'Cerca', plan_status: 'trial', trial_ends_at: daysFromNow(3) }),
      biz({ id: 'd', name: 'Lejos', plan_status: 'trial', trial_ends_at: daysFromNow(10) }),
    ]
    const alerts = deriveAlerts(rows, NOW)
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ businessId: 'c', tipo: 'trial_por_vencer' })
  })

  it('cada alerta lleva businessId para navegar a la ficha (D-12)', () => {
    const rows: BizRow[] = [biz({ id: 'xyz', plan_status: 'cancelled' })]
    const alerts = deriveAlerts(rows, NOW)
    expect(alerts[0].businessId).toBe('xyz')
  })

  it('un negocio active sin trial por vencer no genera alerta', () => {
    const rows: BizRow[] = [biz({ id: 'z', plan_status: 'active' })]
    expect(deriveAlerts(rows, NOW)).toHaveLength(0)
  })
})

// ── resolveTrialEndsAt ────────────────────────────────────────────────────────────────────
describe('resolveTrialEndsAt', () => {
  it('preset 7 → now + 7 días', () => {
    const r = resolveTrialEndsAt({ preset: '7' }, NOW)
    expect(new Date(r).getTime()).toBe(NOW.getTime() + 7 * 86_400_000)
  })

  it('preset 14 → now + 14 días; preset 30 → now + 30 días', () => {
    expect(new Date(resolveTrialEndsAt({ preset: '14' }, NOW)).getTime()).toBe(NOW.getTime() + 14 * 86_400_000)
    expect(new Date(resolveTrialEndsAt({ preset: '30' }, NOW)).getTime()).toBe(NOW.getTime() + 30 * 86_400_000)
  })

  it('exactDate → fin del día AR (UTC-3) de esa fecha, sin recortar un día por el offset', () => {
    // 2026-07-01 en AR debe terminar a las 23:59:59.999 -03:00 = 2026-07-02T02:59:59.999Z
    const r = resolveTrialEndsAt({ exactDate: '2026-07-01' }, NOW)
    expect(r).toBe('2026-07-02T02:59:59.999Z')
  })

  it('ni preset ni exactDate → lanza preset_or_date_required', () => {
    expect(() => resolveTrialEndsAt({}, NOW)).toThrow('preset_or_date_required')
  })

  it('exactDate en el pasado → lanza date_in_past (WR-01: extender no puede ir hacia atrás)', () => {
    // 2026-06-17 termina (fin de día AR) antes de NOW (2026-06-18T12:00Z) → rechazado.
    expect(() => resolveTrialEndsAt({ exactDate: '2026-06-17' }, NOW)).toThrow('date_in_past')
  })

  it('exactDate = hoy (fin del día AR aún futuro respecto de NOW) → válido', () => {
    // 2026-06-18 fin de día AR = 2026-06-19T02:59:59.999Z > NOW → no se rechaza.
    expect(resolveTrialEndsAt({ exactDate: '2026-06-18' }, NOW)).toBe('2026-06-19T02:59:59.999Z')
  })
})
