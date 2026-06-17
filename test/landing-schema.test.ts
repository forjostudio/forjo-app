import { describe, it, expect } from 'vitest'
import { parseLandingConfig, DEFAULT_LANDING_CONFIG } from '@/lib/landing/schema'

// ── Tests del parser fail-safe de landing config (D-10) ──────────────────────────
// Puros: NO dependen de Supabase ni de las 3 creds, así que corren SIEMPRE (no van bajo
// skipIf como los de aislamiento). Prueban las dos rutas de fallback distintas del milestone:
// null (legacy passthrough, LAND-06) vs presente-pero-inválido (DEFAULT seguro, CFG-03).

describe('parseLandingConfig', () => {
  it('null devuelve null (passthrough legacy, LAND-06)', () => {
    expect(parseLandingConfig(null)).toBeNull()
  })

  it('undefined devuelve null', () => {
    expect(parseLandingConfig(undefined)).toBeNull()
  })

  it('config malformado cae al DEFAULT seguro sin tirar (CFG-03)', () => {
    // theme con tipo incorrecto: el safeParse falla y se devuelve el DEFAULT, nunca un throw.
    expect(parseLandingConfig({ theme: 123 })).toEqual(DEFAULT_LANDING_CONFIG)
  })

  it('config válido se parsea y se devuelve igual', () => {
    const cfg = { theme: { preset: 'x' }, sections: [{ type: 'hero', enabled: true, order: 0 }] }
    expect(parseLandingConfig(cfg)).toEqual(cfg)
  })

  it('claves desconocidas se estripan y el config queda válido (D-06)', () => {
    const r = parseLandingConfig({ theme: { preset: 'x', bogus: 1 }, sections: [], extra: 'drop' })
    expect(r).not.toBeNull()
    expect(r as object).not.toHaveProperty('extra')
  })

  it('nunca tira ante input arbitrario: siempre devuelve un valor (no-500)', () => {
    // Garantía de disponibilidad: cualquier basura presente devuelve el DEFAULT, no una excepción.
    expect(() => parseLandingConfig('basura')).not.toThrow()
    expect(parseLandingConfig('basura')).toEqual(DEFAULT_LANDING_CONFIG)
    expect(parseLandingConfig(42)).toEqual(DEFAULT_LANDING_CONFIG)
    expect(parseLandingConfig([])).toEqual(DEFAULT_LANDING_CONFIG)
  })
})
