import { describe, it, expect } from 'vitest'
import { STAGES, stageTotals, pipelineSummary } from '@/lib/crm-pipeline'
import type { DealTotalsInput, StageKey } from '@/lib/crm-pipeline'

// Factory de deal para los tests de totales.
function deal(partial: Partial<DealTotalsInput> & { stage: StageKey }): DealTotalsInput {
  return {
    stage: partial.stage,
    value_ars: partial.value_ars ?? 0,
    status: partial.status ?? 'open',
  }
}

describe('STAGES', () => {
  it('tiene exactamente 5 entradas', () => {
    expect(STAGES).toHaveLength(5)
  })

  it('keys correctas en orden (coinciden con el CHECK de deals.stage en 034)', () => {
    expect(STAGES.map((s) => s.key)).toEqual(['lead', 'calificado', 'trial', 'propuesta', 'pago'])
  })

  it('order es 0..4 secuencial', () => {
    expect(STAGES.map((s) => s.order)).toEqual([0, 1, 2, 3, 4])
  })

  it('cada etapa tiene label y color (token CSS, no hex hardcodeado)', () => {
    for (const s of STAGES) {
      expect(s.label.length).toBeGreaterThan(0)
      expect(s.color).toMatch(/^var\(--/)
    }
  })
})

describe('stageTotals', () => {
  it('suma value_ars de los deals open por etapa', () => {
    const out = stageTotals([
      deal({ stage: 'lead', value_ars: 1000 }),
      deal({ stage: 'lead', value_ars: 500 }),
      deal({ stage: 'trial', value_ars: 3000 }),
    ])
    expect(out.lead).toBe(1500)
    expect(out.trial).toBe(3000)
    expect(out.calificado).toBe(0)
    expect(out.propuesta).toBe(0)
    expect(out.pago).toBe(0)
  })

  it('ignora deals won/lost (ya salieron del embudo activo)', () => {
    const out = stageTotals([
      deal({ stage: 'pago', value_ars: 9000, status: 'won' }),
      deal({ stage: 'propuesta', value_ars: 2000, status: 'lost' }),
      deal({ stage: 'propuesta', value_ars: 1000, status: 'open' }),
    ])
    expect(out.pago).toBe(0)
    expect(out.propuesta).toBe(1000)
  })

  it('devuelve todas las keys de STAGES aunque no haya deals', () => {
    const out = stageTotals([])
    expect(Object.keys(out).sort()).toEqual(['calificado', 'lead', 'pago', 'propuesta', 'trial'])
  })
})

describe('pipelineSummary', () => {
  it('separa $ abiertos (open) de $ ganados (won); lost no suma a ninguno', () => {
    const out = pipelineSummary([
      deal({ stage: 'lead', value_ars: 1000, status: 'open' }),
      deal({ stage: 'trial', value_ars: 2000, status: 'open' }),
      deal({ stage: 'pago', value_ars: 5000, status: 'won' }),
      deal({ stage: 'propuesta', value_ars: 4000, status: 'lost' }),
    ])
    expect(out.openTotal).toBe(3000)
    expect(out.wonTotal).toBe(5000)
  })

  it('arreglo vacío → 0 y 0', () => {
    expect(pipelineSummary([])).toEqual({ openTotal: 0, wonTotal: 0 })
  })
})
