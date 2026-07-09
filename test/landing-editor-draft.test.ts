import { describe, it, expect } from 'vitest'
import {
  moveSection,
  toggleSection,
  setSectionData,
  setTheme,
  setMotion,
  isDirty,
} from '@/lib/landing/editor-draft'
import { SECTION_TYPES } from '@/lib/landing/schema'
import type { LandingConfig } from '@/lib/landing/schema'

// ── Tests puros del reducer del borrador del editor CMS (Phase 14, EDIT-03/06) ────
// Espejan test/landing-derive.test.ts: describe/it/expect, import desde @/lib/...,
// environment 'node', SIN Supabase ni creds. Cubren reorder/toggle/set-data/set-theme/
// set-motion/isDirty y la invariante clave: el set fijo de 8 secciones se preserva y los
// mutadores NUNCA mutan el argumento (pureza — landmine L5 de overwrite-total).

// Config base con las 8 secciones fijas en orden 0..7 (el shell siembra algo así al cargar).
function baseConfig(): LandingConfig {
  return {
    theme: { preset: 'forjo', overrides: { palette: 'red' } },
    motion: 'subtle',
    sections: SECTION_TYPES.map((type, i) => ({
      type,
      enabled: true,
      order: i,
    })),
  }
}

describe('moveSection (reorder — intercambia order de vecinas adyacentes)', () => {
  it('mover "about" hacia arriba intercambia su order con "hero"', () => {
    const cfg = baseConfig()
    const r = moveSection(cfg, 'about', 'up')
    const hero = r.sections.find((s) => s.type === 'hero')!
    const about = r.sections.find((s) => s.type === 'about')!
    // hero estaba en 0, about en 1 → tras subir about, about=0 y hero=1
    expect(about.order).toBe(0)
    expect(hero.order).toBe(1)
  })

  it('mover "hero" hacia abajo intercambia su order con "about"', () => {
    const cfg = baseConfig()
    const r = moveSection(cfg, 'hero', 'down')
    const hero = r.sections.find((s) => s.type === 'hero')!
    const about = r.sections.find((s) => s.type === 'about')!
    expect(hero.order).toBe(1)
    expect(about.order).toBe(0)
  })

  it('mover la primera sección hacia arriba es no-op (borde)', () => {
    const cfg = baseConfig()
    const r = moveSection(cfg, 'hero', 'up')
    expect(r).toEqual(cfg)
  })

  it('mover la última sección hacia abajo es no-op (borde)', () => {
    const cfg = baseConfig()
    // "booking" es la última (order 7)
    const r = moveSection(cfg, 'booking', 'down')
    expect(r).toEqual(cfg)
  })

  it('preserva el set fijo de 8 secciones tras reordenar', () => {
    const r = moveSection(baseConfig(), 'about', 'up')
    expect(r.sections).toHaveLength(8)
    expect(new Set(r.sections.map((s) => s.type))).toEqual(new Set(SECTION_TYPES))
  })

  it('no muta el config de entrada (pureza)', () => {
    const cfg = baseConfig()
    const snapshot = JSON.stringify(cfg)
    moveSection(cfg, 'about', 'up')
    expect(JSON.stringify(cfg)).toBe(snapshot)
  })
})

describe('toggleSection (invierte enabled)', () => {
  it('invierte el enabled de la sección objetivo', () => {
    const cfg = baseConfig()
    const r = toggleSection(cfg, 'gallery')
    expect(r.sections.find((s) => s.type === 'gallery')!.enabled).toBe(false)
    const r2 = toggleSection(r, 'gallery')
    expect(r2.sections.find((s) => s.type === 'gallery')!.enabled).toBe(true)
  })

  it('mantiene las 8 secciones y no toca las demás', () => {
    const r = toggleSection(baseConfig(), 'cta')
    expect(r.sections).toHaveLength(8)
    // solo cta cambió
    expect(r.sections.filter((s) => !s.enabled).map((s) => s.type)).toEqual(['cta'])
  })

  it('no muta el config de entrada (pureza)', () => {
    const cfg = baseConfig()
    const snapshot = JSON.stringify(cfg)
    toggleSection(cfg, 'cta')
    expect(JSON.stringify(cfg)).toBe(snapshot)
  })
})

describe('setSectionData (merge shallow del data)', () => {
  it('mergea el data preservando claves previas de esa sección', () => {
    let cfg = baseConfig()
    cfg = setSectionData(cfg, 'hero', { headline: 'Hola' })
    cfg = setSectionData(cfg, 'hero', { subhead: 'Mundo' })
    const hero = cfg.sections.find((s) => s.type === 'hero')!
    expect(hero.data).toEqual({ headline: 'Hola', subhead: 'Mundo' })
  })

  it('preserva theme, motion y las otras secciones intactas (L5)', () => {
    const cfg = baseConfig()
    const r = setSectionData(cfg, 'about', { title: 'Nosotros' })
    expect(r.theme).toEqual(cfg.theme)
    expect(r.motion).toBe(cfg.motion)
    // hero (otra sección) queda igual
    expect(r.sections.find((s) => s.type === 'hero')).toEqual(
      cfg.sections.find((s) => s.type === 'hero'),
    )
  })

  it('no muta el config de entrada (pureza)', () => {
    const cfg = baseConfig()
    const snapshot = JSON.stringify(cfg)
    setSectionData(cfg, 'hero', { headline: 'x' })
    expect(JSON.stringify(cfg)).toBe(snapshot)
  })
})

describe('setTheme (preset + overrides sin pisar otros overrides)', () => {
  it('cambia el preset sin borrar overrides existentes', () => {
    const cfg = baseConfig() // overrides.palette = 'red'
    const r = setTheme(cfg, { preset: 'modern' })
    expect(r.theme.preset).toBe('modern')
    expect(r.theme.overrides?.palette).toBe('red')
  })

  it('setea primary sin pisar la palette existente', () => {
    const cfg = baseConfig()
    const r = setTheme(cfg, { primary: '#d94a2b' })
    expect(r.theme.overrides?.primary).toBe('#d94a2b')
    expect(r.theme.overrides?.palette).toBe('red')
  })

  it('pasar primary undefined borra la clave (vuelve al derivado del preset)', () => {
    const cfg = setTheme(baseConfig(), { primary: '#d94a2b' })
    const r = setTheme(cfg, { primary: undefined })
    expect(r.theme.overrides?.primary).toBeUndefined()
    // palette sigue
    expect(r.theme.overrides?.palette).toBe('red')
  })

  it('preserva sections y motion intactos', () => {
    const cfg = baseConfig()
    const r = setTheme(cfg, { palette: 'blue' })
    expect(r.sections).toEqual(cfg.sections)
    expect(r.motion).toBe(cfg.motion)
  })

  it('no muta el config de entrada (pureza)', () => {
    const cfg = baseConfig()
    const snapshot = JSON.stringify(cfg)
    setTheme(cfg, { preset: 'spa', primary: '#fff' })
    expect(JSON.stringify(cfg)).toBe(snapshot)
  })
})

describe('setMotion', () => {
  it('setea el nivel de motion preservando el resto', () => {
    const cfg = baseConfig()
    const r = setMotion(cfg, 'premium')
    expect(r.motion).toBe('premium')
    expect(r.sections).toEqual(cfg.sections)
    expect(r.theme).toEqual(cfg.theme)
  })

  it('no muta el config de entrada (pureza)', () => {
    const cfg = baseConfig()
    const snapshot = JSON.stringify(cfg)
    setMotion(cfg, 'none')
    expect(JSON.stringify(cfg)).toBe(snapshot)
  })
})

describe('isDirty', () => {
  it('false para configs estructuralmente iguales', () => {
    expect(isDirty(baseConfig(), baseConfig())).toBe(false)
  })

  it('true cuando difiere un data de sección', () => {
    const saved = baseConfig()
    const current = setSectionData(saved, 'hero', { headline: 'x' })
    expect(isDirty(current, saved)).toBe(true)
  })

  it('true cuando difiere el theme', () => {
    const saved = baseConfig()
    const current = setTheme(saved, { preset: 'cyber' })
    expect(isDirty(current, saved)).toBe(true)
  })

  it('true cuando difiere el orden de una sección', () => {
    const saved = baseConfig()
    const current = moveSection(saved, 'about', 'up')
    expect(isDirty(current, saved)).toBe(true)
  })
})
