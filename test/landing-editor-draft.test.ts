import { describe, it, expect } from 'vitest'
import {
  moveSection,
  toggleSection,
  setSectionData,
  setTheme,
  setMotion,
  isDirty,
  normalizeSections,
  stripPrimary,
  configsEqual,
  deriveEditorState,
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

// Config parcial (como lo emite el builder / el DEFAULT): NO trae las 8 secciones. El panel del
// editor debe ver siempre las 8, así que normalizeSections las materializa.
function partialConfig(): LandingConfig {
  return {
    theme: { preset: 'forjo' },
    sections: [
      { type: 'hero', enabled: true, order: 0, data: { headline: 'Hola' } },
      { type: 'services', enabled: true, order: 1 },
    ],
  }
}

describe('normalizeSections (garantiza las 8 secciones fijas)', () => {
  it('materializa las secciones faltantes hasta completar las 8 fijas', () => {
    const r = normalizeSections(partialConfig())
    expect(r.sections).toHaveLength(8)
    expect(new Set(r.sections.map((s) => s.type))).toEqual(new Set(SECTION_TYPES))
  })

  it('reasigna order contiguo 0..7 en orden canónico e inserta las faltantes en su lugar', () => {
    const r = normalizeSections(partialConfig())
    const byOrder = [...r.sections].sort((a, b) => a.order - b.order).map((s) => s.type)
    expect(byOrder).toEqual([...SECTION_TYPES])
    expect(r.sections.map((s) => s.order).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('las faltantes arrancan ocultas salvo hero/booking (núcleo)', () => {
    const r = normalizeSections(partialConfig())
    const enabledByType = Object.fromEntries(r.sections.map((s) => [s.type, s.enabled]))
    expect(enabledByType.booking).toBe(true) // núcleo, materializada visible
    expect(enabledByType.about).toBe(false) // faltante vacía → oculta
    expect(enabledByType.gallery).toBe(false)
  })

  it('preserva el data y el enabled de las secciones existentes', () => {
    const r = normalizeSections(partialConfig())
    const hero = r.sections.find((s) => s.type === 'hero')!
    expect(hero.data).toEqual({ headline: 'Hola' })
    expect(hero.enabled).toBe(true)
  })

  it('es idempotente sobre un config ya-completo (no cambia el caso de 8)', () => {
    const cfg = baseConfig()
    expect(normalizeSections(cfg)).toEqual(cfg)
  })

  it('no muta el config de entrada (pureza)', () => {
    const cfg = partialConfig()
    const snapshot = JSON.stringify(cfg)
    normalizeSections(cfg)
    expect(JSON.stringify(cfg)).toBe(snapshot)
  })
})

describe('mutadores sobre config parcial (upsert vía normalize)', () => {
  it('toggleSection sobre una sección ausente la crea y la prende', () => {
    const r = toggleSection(partialConfig(), 'about')
    const about = r.sections.find((s) => s.type === 'about')!
    // about arranca oculta (false) al materializarse → toggle la deja visible.
    expect(about.enabled).toBe(true)
    expect(r.sections).toHaveLength(8)
  })

  it('setSectionData sobre una sección ausente la crea con su data', () => {
    const r = setSectionData(partialConfig(), 'cta', { headline: 'Reservá ahora' })
    const cta = r.sections.find((s) => s.type === 'cta')!
    expect(cta.data).toEqual({ headline: 'Reservá ahora' })
    expect(r.sections).toHaveLength(8)
  })

  it('moveSection sobre config parcial opera sobre las 8 materializadas', () => {
    const r = moveSection(partialConfig(), 'booking', 'up')
    expect(r.sections).toHaveLength(8)
    // booking estaba última (order 7); tras subir queda en 6 y cta baja a 7.
    expect(r.sections.find((s) => s.type === 'booking')!.order).toBe(6)
    expect(r.sections.find((s) => s.type === 'cta')!.order).toBe(7)
  })
})

// ── setTheme: fuente (overrides.font) ────────────────────────────────────────────────
// El renderer YA resolvía overrides.font → data-font (resolveLandingTheme); el editor no lo
// exponía. setTheme lo trata igual que palette: setear escribe, undefined borra.
describe('setTheme — fuente', () => {
  const cfg = (overrides?: Record<string, string>): LandingConfig => ({
    theme: { preset: 'forjo', ...(overrides ? { overrides } : {}) },
    sections: [],
  })

  it('escribe overrides.font', () => {
    expect(setTheme(cfg(), { font: 'elegante' }).theme.overrides?.font).toBe('elegante')
  })

  it('font: undefined BORRA el override (vuelve a la fuente del preset)', () => {
    const out = setTheme(cfg({ font: 'tech' }), { font: undefined })
    expect(out.theme.overrides).not.toHaveProperty('font')
  })

  it('no pisa los otros overrides al tocar la fuente', () => {
    const out = setTheme(cfg({ palette: 'lima', primary: '#db2800' }), { font: 'suave' })
    expect(out.theme.overrides).toMatchObject({ palette: 'lima', primary: '#db2800', font: 'suave' })
  })
})

// ── stripPrimary: se quitó el control "Color principal" del editor ───────────────────
// Un primary custom pisa el acento de CUALQUIER paleta. Sacar SOLO la UI dejaría a los negocios
// que ya lo tienen guardado pisados PARA SIEMPRE y sin control que lo borre. El editor normaliza
// el config al cargarlo.
describe('stripPrimary', () => {
  it('saca overrides.primary y deja el resto del theme intacto', () => {
    const out = stripPrimary({
      theme: { preset: 'cyber', overrides: { palette: 'lima', font: 'tech', primary: '#db2800' } },
      sections: [],
      motion: 'premium',
    })
    expect(out.theme.overrides).not.toHaveProperty('primary')
    expect(out.theme.overrides).toMatchObject({ palette: 'lima', font: 'tech' })
    expect(out.theme.preset).toBe('cyber')
    // No pierde el resto del config: el write es overwrite-total (L5), perder motion acá sería
    // perderlo en la DB al guardar.
    expect(out.motion).toBe('premium')
  })

  // Identidad referencial cuando no hay nada que sacar: el seed alimenta draft Y baseline, y el
  // editor NO debe abrir marcado como "cambios sin guardar".
  it('sin primary devuelve el MISMO objeto (no ensucia el isDirty del editor)', () => {
    const cfg: LandingConfig = { theme: { preset: 'forjo', overrides: { palette: 'lima' } }, sections: [] }
    expect(stripPrimary(cfg)).toBe(cfg)
    expect(isDirty(stripPrimary(cfg), cfg)).toBe(false)
  })

  it('tolera un theme sin overrides', () => {
    const cfg: LandingConfig = { theme: { preset: 'forjo' }, sections: [] }
    expect(stripPrimary(cfg)).toBe(cfg)
  })
})

// El estilo visual es la decisión de PRIMER ORDEN: elegirlo resetea lo que haya debajo.
// Bug reportado: con una fuente elegida a mano, cambiar de estilo NO cambiaba la letra — el
// override viejo seguía pisando la tipografía de diseño del theme nuevo.
describe('setTheme — elegir un preset resetea los overrides de abajo', () => {
  it('borra el override de font y baja la palette del preset nuevo', () => {
    const out = setTheme(
      { theme: { preset: 'forjo', overrides: { font: 'tech', palette: 'red' } }, sections: [] },
      { preset: 'spa', palette: 'sage', font: undefined },
    )
    expect(out.theme.preset).toBe('spa')
    expect(out.theme.overrides?.palette).toBe('sage')
    expect(out.theme.overrides).not.toHaveProperty('font') // sin override → manda la fuente del theme
  })
})

// ── Compare CANÓNICO draft-vs-published (Phase 15 / PUB-05, D-03) ──────────────────────────
// El caso que da sentido a todo esto es el primero: lo publicado vuelve de un round-trip por jsonb
// (Postgres REORDENA las claves) y el borrador vive en memoria con el orden que le dejaron los
// mutadores. Con JSON.stringify crudo, dos configs IDÉNTICOS serializan distinto → "Guardado — sin
// publicar" eterno. Sin el canónico, este primer test falla: es la prueba de que la mitigación sirve.
describe('configsEqual (compare canónico, insensible al orden de claves)', () => {
  it('dos configs con las MISMAS claves en distinto orden son iguales', () => {
    const a = {
      theme: { preset: 'forjo', overrides: { palette: 'red', mode: 'light' } },
      motion: 'subtle',
      sections: [{ type: 'hero', enabled: true, order: 0, data: { title: 'Hola', subtitle: 'X' } }],
    } as unknown as LandingConfig
    // Mismo contenido, claves emitidas en otro orden (top-level, theme.overrides y section.data).
    const b = {
      motion: 'subtle',
      sections: [{ order: 0, data: { subtitle: 'X', title: 'Hola' }, type: 'hero', enabled: true }],
      theme: { overrides: { mode: 'light', palette: 'red' }, preset: 'forjo' },
    } as unknown as LandingConfig

    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b)) // el stringify crudo los ve distintos…
    expect(configsEqual(a, b)).toBe(true) // …y el canónico, iguales
    expect(isDirty(a, b)).toBe(false) // isDirty queda montado encima
  })

  it('una diferencia real de valor los hace distintos', () => {
    const a = baseConfig()
    const b = setMotion(baseConfig(), 'premium')
    expect(configsEqual(a, b)).toBe(false)
    expect(isDirty(a, b)).toBe(true)
  })

  it('distinta longitud de array los hace distintos', () => {
    const a = baseConfig()
    const b: LandingConfig = { ...a, sections: a.sections.slice(0, -1) }
    expect(configsEqual(a, b)).toBe(false)
  })

  it('el ORDEN de un array SÍ es significativo (las secciones no se ordenan)', () => {
    const a = baseConfig()
    const b: LandingConfig = { ...a, sections: [...a.sections].reverse() }
    expect(configsEqual(a, b)).toBe(false)
  })
})

// ── deriveEditorState: los 3 estados excluyentes con precedencia (D-03 / D-06) ─────────────
describe('deriveEditorState (máquina de 3 estados, derivada del contenido)', () => {
  it('draft ≠ savedBaseline ⇒ "unsaved" (precede a todo lo demás)', () => {
    const saved = baseConfig()
    const draft = setMotion(baseConfig(), 'premium')
    // published === saved: aun así manda "unsaved".
    expect(deriveEditorState({ draft, savedBaseline: saved, published: saved })).toBe('unsaved')
    // …y también cuando encima hay cambios sin publicar (excluyentes, con precedencia).
    expect(deriveEditorState({ draft, savedBaseline: saved, published: null })).toBe('unsaved')
  })

  it('guardado pero savedBaseline ≠ published ⇒ "unpublished"', () => {
    const cfg = baseConfig()
    const published = setMotion(baseConfig(), 'none')
    expect(deriveEditorState({ draft: cfg, savedBaseline: cfg, published })).toBe('unpublished')
  })

  it('published === null (nunca publicó) ⇒ NUNCA devuelve "published"', () => {
    const cfg = baseConfig()
    expect(deriveEditorState({ draft: cfg, savedBaseline: cfg, published: null })).toBe(
      'unpublished',
    )
  })

  it('draft == savedBaseline == published ⇒ "published"', () => {
    const cfg = baseConfig()
    expect(deriveEditorState({ draft: cfg, savedBaseline: cfg, published: baseConfig() })).toBe(
      'published',
    )
  })

  it('"published" tolera el reordenamiento de claves del jsonb (usa el compare canónico)', () => {
    const cfg = baseConfig()
    // Lo publicado vuelve de la DB con las claves en otro orden: sigue siendo el MISMO config.
    const fromDb = {
      sections: cfg.sections.map((s) => ({ order: s.order, enabled: s.enabled, type: s.type })),
      motion: cfg.motion,
      theme: { overrides: cfg.theme.overrides, preset: cfg.theme.preset },
    } as unknown as LandingConfig
    expect(deriveEditorState({ draft: cfg, savedBaseline: cfg, published: fromDb })).toBe(
      'published',
    )
  })
})
