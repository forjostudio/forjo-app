import { describe, it, expect } from 'vitest'
import {
  getVerticalLabel,
  RUBRO_PLACEHOLDERS,
  type VerticalKey,
} from '@/lib/verticals'

// ── Phase 3 (rework del selector de rubro) — tests puros de lib/verticals.ts ──────
// Espejan test/landing-derive.test.ts: describe/it/expect, import desde @/lib/...,
// SIN Supabase ni creds. Congelan el rename de belleza (D-01), los placeholders por
// rubro (D-06) y — sobre todo — el CASE de la migración 047 de backfill de `vertical`.

// ── Suite 1: label del rubro vía getVerticalLabel (prefiere la columna `vertical`) ─
describe('getVerticalLabel — label por VerticalKey', () => {
  it('belleza usa el label nuevo "Belleza/Estética/Spa" (D-01)', () => {
    expect(getVerticalLabel({ vertical: 'belleza' })).toBe('Belleza/Estética/Spa')
  })
  it('resuelve los otros 3 rubros a su label', () => {
    expect(getVerticalLabel({ vertical: 'salud' })).toBe('Salud')
    expect(getVerticalLabel({ vertical: 'canchas' })).toBe('Canchas')
    expect(getVerticalLabel({ vertical: 'general' })).toBe('General')
  })
})

// ── Suite 2: fallback de filas viejas (sin `vertical`, solo `type`) ────────────────
// Documenta POR QUÉ existe la migración 047: tras vaciar VERTICALS[*].types (D-08),
// el código ya NO recupera el vertical de un `type` granular salvo los que sobreviven
// en LEGACY_TYPE_VERTICAL. La columna `vertical` backfilleada es la que salva a los demás.
describe('getVerticalLabel — fallback de filas sin vertical (post-vaciado de types)', () => {
  it('un type que SIGUE en LEGACY_TYPE_VERTICAL ("Estética") resuelve belleza', () => {
    expect(getVerticalLabel({ vertical: null, type: 'Estética' })).toBe('Belleza/Estética/Spa')
  })
  it('un type granular ya NO mapeado ("Peluquería") cae a General → por eso hace falta el backfill 047', () => {
    // 'Peluquería' salió de VERTICALS.belleza.types (ahora []) y no está en LEGACY_TYPE_VERTICAL,
    // así que sin la columna `vertical` backfilleada resolvería 'general'. La migración 047 le
    // escribe vertical='belleza' a esas filas ANTES del vaciado, evitando la regresión.
    expect(getVerticalLabel({ vertical: null, type: 'Peluquería' })).toBe('General')
  })
})

// ── Suite 3: placeholders por rubro (D-06) ────────────────────────────────────────
describe('RUBRO_PLACEHOLDERS — sugerencia por rubro (D-06)', () => {
  it('tiene exactamente las 4 keys VerticalKey', () => {
    expect(Object.keys(RUBRO_PLACEHOLDERS).sort()).toEqual(['belleza', 'canchas', 'general', 'salud'])
  })
  it('los strings son los literales dictados en D-06', () => {
    expect(RUBRO_PLACEHOLDERS.salud).toBe('Ej: Lic. en Psicología, Kinesiólogo')
    expect(RUBRO_PLACEHOLDERS.belleza).toBe('Ej: Barbería, Masajista, Depilación')
    expect(RUBRO_PLACEHOLDERS.general).toBe('Ej: Lavaautos, Tatuajes, Fotógrafo')
    expect(RUBRO_PLACEHOLDERS.canchas).toBe('Ej: Canchas de fútbol')
  })
})

// ── Suite 4: CASE de la migración 047 (congelado) ─────────────────────────────────
// Snapshot manual del contrato de supabase/migrations/047_backfill_vertical.sql:
// cada `type` legacy → el `vertical` que la migración le escribe. Documentación viva;
// NO llama a getVerticalKeyByType (post-vaciado daría 'general' para casi todos).
describe('CASE de la migración 047 — mapping type→vertical congelado', () => {
  const CASE_047: Record<string, VerticalKey> = {
    // salud (5 actuales + 4 legacy)
    'Médico': 'salud',
    'Psicólogo': 'salud',
    'Kinesiólogo': 'salud',
    'Odontólogo': 'salud',
    'Nutricionista': 'salud',
    'Centro médico': 'salud',
    'Psicología': 'salud',
    'Odontología': 'salud',
    'Kinesiología': 'salud',
    // belleza (5 actuales + 1 legacy 'Estética')
    'Peluquería': 'belleza',
    'Barbería': 'belleza',
    'Centro de estética': 'belleza',
    'Manicura': 'belleza',
    'Spa': 'belleza',
    'Estética': 'belleza',
    // canchas (4)
    'Cancha de fútbol': 'canchas',
    'Cancha de pádel': 'canchas',
    'Cancha de tenis': 'canchas',
    'Cancha de básquet': 'canchas',
  }

  it('congela los 9 strings de salud', () => {
    const salud = Object.entries(CASE_047).filter(([, v]) => v === 'salud').map(([k]) => k)
    expect(salud).toHaveLength(9)
  })
  it('congela los 6 strings de belleza (incluida la legacy "Estética")', () => {
    const belleza = Object.entries(CASE_047).filter(([, v]) => v === 'belleza').map(([k]) => k)
    expect(belleza).toHaveLength(6)
    expect(belleza).toContain('Estética')
  })
  it('congela los 4 strings de canchas', () => {
    const canchas = Object.entries(CASE_047).filter(([, v]) => v === 'canchas').map(([k]) => k)
    expect(canchas).toHaveLength(4)
  })
  it("todo lo demás cae a 'general' por el ELSE del CASE (no está en el mapa)", () => {
    // El ELSE cubre VERTICALS.general.types, 'Otro', texto libre y NULL → 'general'.
    expect(CASE_047['Otro']).toBeUndefined()
    expect(CASE_047['Estudio de tatuajes']).toBeUndefined()
  })
})
