import { describe, it, expect } from 'vitest'
import { parseLandingConfig, DEFAULT_LANDING_CONFIG, rsvData } from '@/lib/landing/schema'

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

// ── Campo motion en el envelope (MOTION-01, D-04 fail-safe) ────────────────────────
// El campo es fail-safe: un valor válido se preserva; un valor basura degrada a undefined
// (por .catch(undefined)) SIN tirar el resto del config al DEFAULT; ausente → undefined
// (D-04: el parse NUNCA inyecta un default de motion — el default 'subtle' es de AUTORÍA,
// lo setea la skill al escribir el config). Un config sin motion renderiza estático.
describe('motion en el envelope (MOTION-01, D-04)', () => {
  it('motion "premium" válido se preserva en el config resuelto', () => {
    const cfg = {
      theme: { preset: 'x' },
      sections: [{ type: 'hero', enabled: true, order: 0 }],
      motion: 'premium',
    }
    expect(parseLandingConfig(cfg)).toEqual(cfg)
  })

  it('motion "subtle" válido se preserva', () => {
    const cfg = { theme: { preset: 'x' }, sections: [], motion: 'subtle' }
    expect(parseLandingConfig(cfg)).toMatchObject({ motion: 'subtle' })
  })

  it('motion basura → cae a undefined SIN tirar theme/sections reales al DEFAULT', () => {
    // El .catch(undefined) del campo evita que un motion roto invalide el envelope entero
    // (whole-config fallback) y pierda theme/sections reales.
    const r = parseLandingConfig({
      theme: { preset: 'realpreset' },
      sections: [{ type: 'about', enabled: true, order: 2 }],
      motion: 'basura',
    })
    expect(r).not.toBeNull()
    expect(r).not.toEqual(DEFAULT_LANDING_CONFIG) // el resto del config se preservó
    expect(r?.theme.preset).toBe('realpreset')
    expect(r?.sections).toEqual([{ type: 'about', enabled: true, order: 2 }])
    expect((r as { motion?: unknown }).motion).toBeUndefined()
  })

  it('sin campo motion → parsea OK y motion queda undefined (D-04: sin default en parse)', () => {
    const cfg = { theme: { preset: 'x' }, sections: [{ type: 'hero', enabled: true, order: 0 }] }
    const r = parseLandingConfig(cfg)
    expect(r).not.toBeNull()
    expect((r as { motion?: unknown }).motion).toBeUndefined()
  })

  it('null sigue devolviendo null (legacy passthrough intacto, no regresiona)', () => {
    expect(parseLandingConfig(null)).toBeNull()
  })
})

// ── rsvData: espejo de galleryData (.catch({}), sin z.record) ──────────────────────
// Data de la galería de la reserva (Plan 02): un objeto tolerante que degrada a {} ante
// cualquier input roto. Las images usan z.string().url() (control V5): una URL inválida
// invalida el objeto entero → {} → empty-state.
describe('rsvData (espejo de galleryData)', () => {
  it('preserva un objeto válido con header + images http', () => {
    const r = rsvData.parse({ header: 'x', images: ['https://cdn/a.jpg'] })
    expect(r).toEqual({ header: 'x', images: ['https://cdn/a.jpg'] })
  })

  it('url inválida → cae a {} (url no-http invalida el objeto)', () => {
    expect(rsvData.parse({ images: ['no-url'] })).toEqual({})
  })

  it('input no-objeto ("basura") → {}', () => {
    expect(rsvData.parse('basura')).toEqual({})
  })

  it('objeto vacío → {} (todos los campos opcionales)', () => {
    expect(rsvData.parse({})).toEqual({})
  })
})
