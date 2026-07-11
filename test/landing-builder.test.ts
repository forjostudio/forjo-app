import { describe, it, expect } from 'vitest'
import {
  buildLandingConfig,
  recommendTheme,
  type BuilderInput,
} from '@/lib/landing/builder'
import {
  parseLandingConfig,
  DEFAULT_LANDING_CONFIG,
  heroData,
  aboutData,
  servicesData,
  galleryData,
  locationData,
  ctaData,
} from '@/lib/landing/schema'
import { THEMES, THEME_PALETTES, FONTS } from '@/lib/theme-config'
import { isSafeColor } from '@/lib/landing/theme'

// ── Tests puros del builder de la Fase 10 (SKILL-01/04) ───────────────────────────
// Espejan test/landing-derive.test.ts y test/landing-seo.test.ts: describe/it/expect,
// import desde @/lib/..., SIN Supabase ni creds (no van bajo skipIf, environment node).
// Cubren: (1) mapeo por sección con campos exactos, (2) el gate parseLandingConfig
// (pasa sin caer a DEFAULT, el data sobrevive), (3) fail-safe ante input parcial/URL inválida,
// (4) recommendTheme acotado al set cerrado + isSafeColor para primary.

// Tema base reutilizable: el shape mínimo que devuelve recommendTheme.
const THEME = { preset: 'forjo' as const }

// Helper para armar un BuilderInput con defaults razonables (mismo estilo que landing-seo.test.ts).
const input = (over: Partial<BuilderInput> = {}): BuilderInput => ({
  business: { name: 'Peluquería Sol', whatsapp: null },
  ...over,
})

// Sets cerrados del motor de temas (para aserciones de "dentro del set").
const THEME_IDS = new Set(THEMES.map((t) => t.id))
const FONT_IDS = new Set(FONTS.map((f) => f.id))

// ── SKILL-01: buildLandingConfig — mapeo por sección ──────────────────────────────
describe('buildLandingConfig — mapeo por sección (SKILL-01)', () => {
  const full = buildLandingConfig(
    input({
      hero: {
        headline: 'Cortes con onda',
        subhead: 'Reservá online',
        image: 'https://cdn.forjo.studio/hero.png',
        cta_label: 'Reservar',
      },
      about: { title: 'Sobre nosotros', body: 'Somos un equipo', image: 'https://cdn.forjo.studio/about.png' },
      services: { title: 'Servicios', subtitle: 'Lo que ofrecemos' },
      gallery: { title: 'Galería', images: ['https://cdn.forjo.studio/1.png', 'https://cdn.forjo.studio/2.png'] },
      location: { title: 'Dónde estamos', map_url: 'https://maps.google.com/x', show_address: true },
      hours: { title: 'Horarios' },
      cta: { headline: 'Reservá tu turno' },
    }),
    THEME,
  )

  it('arma una sección por bloque presente, en orden fijo ascendente', () => {
    // booking va al final: `full` trae fotos de galería, así que el builder emite el strip de la
    // reserva reusándolas (antes la booking nunca se emitía y el strip quedaba vacío siempre).
    expect(full.sections.map((s) => s.type)).toEqual([
      'hero',
      'about',
      'services',
      'gallery',
      'location',
      'hours',
      'cta',
      'booking',
    ])
    // order ascendente 0..7
    expect(full.sections.map((s) => s.order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    // todas enabled
    expect(full.sections.every((s) => s.enabled === true)).toBe(true)
  })

  // El invariante viejo era "booking NUNCA está en el array". Cambió a propósito: la booking se
  // emite CON `data` (rsvData) para que el strip de confianza tenga fotos. Lo que se conserva es
  // que SIN fotos no se emite → orderedSections la inyecta pelada y el bloque de reserva queda
  // byte-idéntico a hoy.
  it('booking se emite SOLO si hay fotos para el strip (si no, la inyecta orderedSections)', () => {
    expect(full.sections.some((s) => s.type === 'booking')).toBe(true)
    const sinFotos = buildLandingConfig(input({ gallery: undefined, rsv: undefined }), THEME)
    expect(sinFotos.sections.some((s) => s.type === 'booking')).toBe(false)
  })

  it('el theme del envelope es el LandingTheme recibido', () => {
    expect(full.theme).toEqual(THEME)
  })

  it('cada section.data contiene SOLO las claves esperadas del esquema', () => {
    const byType = Object.fromEntries(full.sections.map((s) => [s.type, s.data]))
    expect(Object.keys(byType.hero as object).sort()).toEqual(['cta_label', 'headline', 'image', 'subhead'])
    expect(Object.keys(byType.about as object).sort()).toEqual(['body', 'image', 'title'])
    expect(Object.keys(byType.services as object).sort()).toEqual(['subtitle', 'title'])
    expect(Object.keys(byType.gallery as object).sort()).toEqual(['images', 'title'])
    expect(Object.keys(byType.location as object).sort()).toEqual(['map_url', 'show_address', 'title'])
    expect(Object.keys(byType.hours as object).sort()).toEqual(['title'])
    expect(Object.keys(byType.cta as object).sort()).toEqual(['headline'])
  })

  it('services.data NUNCA lleva una lista de servicios (D10-04)', () => {
    const services = full.sections.find((s) => s.type === 'services')!
    const data = services.data as Record<string, unknown>
    expect('items' in data).toBe(false)
    expect('services' in data).toBe(false)
    expect('list' in data).toBe(false)
  })

  it('gallery.data.images conserva las URLs válidas', () => {
    const gallery = full.sections.find((s) => s.type === 'gallery')!
    expect((gallery.data as { images: string[] }).images).toEqual([
      'https://cdn.forjo.studio/1.png',
      'https://cdn.forjo.studio/2.png',
    ])
  })
})

// ── SKILL-04: gate parseLandingConfig — pasa sin DEFAULT y el data sobrevive ───────
describe('buildLandingConfig — gate parseLandingConfig (SKILL-04)', () => {
  const cfg = buildLandingConfig(
    input({
      hero: { headline: 'Hola', image: 'https://cdn.forjo.studio/h.png' },
      about: { body: 'Texto', image: 'https://cdn.forjo.studio/a.png' },
      services: { title: 'Servicios' },
      gallery: { images: ['https://cdn.forjo.studio/g.png'] },
      location: { map_url: 'https://maps/x', show_address: true },
      cta: { headline: 'Reservá' },
    }),
    THEME,
  )

  it('el output pasa parseLandingConfig y NO cae a DEFAULT', () => {
    const parsed = parseLandingConfig(cfg)
    expect(parsed).not.toBeNull()
    expect(parsed).not.toEqual(DEFAULT_LANDING_CONFIG)
    // el parse no estripa secciones esperadas
    expect(parsed!.sections.map((s) => s.type)).toEqual(cfg.sections.map((s) => s.type))
  })

  it('tras re-parsear cada section con su esquema, el data esperado se conserva', () => {
    const byType = Object.fromEntries(cfg.sections.map((s) => [s.type, s.data]))
    // ninguno se vació por una URL inválida (el .catch({}) NO se disparó)
    expect(heroData.parse(byType.hero)).toEqual({ headline: 'Hola', image: 'https://cdn.forjo.studio/h.png' })
    expect(aboutData.parse(byType.about)).toEqual({ body: 'Texto', image: 'https://cdn.forjo.studio/a.png' })
    expect(servicesData.parse(byType.services)).toEqual({ title: 'Servicios' })
    expect(galleryData.parse(byType.gallery)).toEqual({ images: ['https://cdn.forjo.studio/g.png'] })
    expect(locationData.parse(byType.location)).toEqual({ map_url: 'https://maps/x', show_address: true })
    expect(ctaData.parse(byType.cta)).toEqual({ headline: 'Reservá' })
  })
})

// ── SKILL-04: fail-safe ante input parcial / URL inválida ─────────────────────────
describe('buildLandingConfig — fail-safe ante input parcial/sucio', () => {
  it('input solo con business.name → produce hero válido y pasa el gate', () => {
    const cfg = buildLandingConfig(input(), THEME)
    // hero SIEMPRE va (aunque venga vacío); services SIEMPRE va.
    expect(cfg.sections.some((s) => s.type === 'hero')).toBe(true)
    expect(cfg.sections.some((s) => s.type === 'services')).toBe(true)
    const parsed = parseLandingConfig(cfg)
    expect(parsed).not.toBeNull()
    expect(parsed).not.toEqual(DEFAULT_LANDING_CONFIG)
  })

  it('una image inválida (no-URL) se descarta y la sección NO pierde sus otras claves', () => {
    const cfg = buildLandingConfig(
      input({ hero: { headline: 'Título', image: 'no-es-una-url' } }),
      THEME,
    )
    const hero = cfg.sections.find((s) => s.type === 'hero')!
    const data = hero.data as Record<string, unknown>
    // la URL inválida no se incluyó, pero el headline sí sobrevive
    expect(data.headline).toBe('Título')
    expect('image' in data).toBe(false)
    // tras re-parsear, el .catch({}) NO se disparó: el headline sigue vivo
    expect(heroData.parse(data)).toEqual({ headline: 'Título' })
  })

  it('un map_url inválido descarta la URL pero conserva show_address', () => {
    const cfg = buildLandingConfig(
      input({ location: { map_url: 'javascript:alert(1)', show_address: true } }),
      THEME,
    )
    const loc = cfg.sections.find((s) => s.type === 'location')
    // la sección se incluye porque show_address aporta contenido
    expect(loc).toBeDefined()
    const data = loc!.data as Record<string, unknown>
    expect('map_url' in data).toBe(false)
    expect(data.show_address).toBe(true)
  })

  it('gallery con TODAS las URLs inválidas se omite (no queda sección vacía)', () => {
    const cfg = buildLandingConfig(
      input({ gallery: { images: ['no-url', 'ftp://x/y'] } }),
      THEME,
    )
    expect(cfg.sections.some((s) => s.type === 'gallery')).toBe(false)
    // el config sigue pasando el gate sin caer a DEFAULT
    expect(parseLandingConfig(cfg)).not.toEqual(DEFAULT_LANDING_CONFIG)
  })

  it('secciones opcionales 100% vacías se omiten (about/gallery/location/hours/cta)', () => {
    const cfg = buildLandingConfig(
      input({ about: {}, gallery: {}, location: {}, hours: {}, cta: {} }),
      THEME,
    )
    // solo quedan las que SIEMPRE van: hero + services
    expect(cfg.sections.map((s) => s.type)).toEqual(['hero', 'services'])
  })
})

// ── SKILL-04: recommendTheme — set cerrado + isSafeColor para primary ──────────────
describe('recommendTheme (SKILL-04)', () => {
  it('vertical salud → preset dentro de THEMES (spa)', () => {
    const t = recommendTheme({ vertical: 'salud' })
    expect(THEME_IDS.has(t.preset)).toBe(true)
    expect(t.preset).toBe('spa')
  })

  it('vertical belleza → spa; general/otro → forjo', () => {
    expect(recommendTheme({ vertical: 'belleza' }).preset).toBe('spa')
    expect(recommendTheme({ vertical: 'general' }).preset).toBe('forjo')
    expect(recommendTheme({ vertical: 'otro' }).preset).toBe('forjo')
    expect(recommendTheme({ vertical: null }).preset).toBe('forjo')
  })

  it('preset/palette/font SIEMPRE dentro del set permitido aunque la preferencia sea basura', () => {
    const t = recommendTheme({ theme: 'inventado', palette: 'rosa-fucsia', font: 'comic-sans' })
    // theme basura → degrada a forjo (normalizeTheme)
    expect(THEME_IDS.has(t.preset)).toBe(true)
    if (t.overrides?.palette) {
      const list = THEME_PALETTES[t.preset] ?? THEME_PALETTES.forjo
      expect(list.some((p) => p.id === t.overrides!.palette)).toBe(true)
    }
    if (t.overrides?.font) {
      expect(FONT_IDS.has(t.overrides.font)).toBe(true)
    }
  })

  it('primary_color hex válido → overrides.primary presente', () => {
    const t = recommendTheme({ vertical: 'belleza', primary_color: '#d94a2b' })
    expect(t.overrides?.primary).toBe('#d94a2b')
    expect(isSafeColor(t.overrides!.primary!)).toBe(true)
  })

  it('primary_color inválido → overrides.primary ausente', () => {
    for (const bad of ['red', 'rgb(0,0,0)', 'javascript:x', '#zzz', null, undefined]) {
      const t = recommendTheme({ vertical: 'belleza', primary_color: bad as string | null })
      expect(t.overrides?.primary).toBeUndefined()
    }
  })

  it('un tema sin overrides reales → theme = { preset } sin clave overrides', () => {
    // general → forjo, sin palette/font/primary → overrides queda vacío y se omite.
    const t = recommendTheme({ vertical: 'general' })
    expect(t).toEqual({ preset: 'forjo' })
    expect('overrides' in t).toBe(false)
  })

  it('palette igual al default del preset se omite (menos ruido)', () => {
    // forjo default = 'red' → no debería aparecer en overrides.
    const t = recommendTheme({ vertical: 'general', palette: 'red' })
    expect(t.overrides?.palette).toBeUndefined()
  })

  it('palette distinta del default sí se incluye', () => {
    const t = recommendTheme({ vertical: 'general', palette: 'blue' })
    expect(t.overrides?.palette).toBe('blue')
  })

  it('font auto (default) se omite; font explícita válida se incluye', () => {
    // general sin preferencia → font 'auto' → omitido
    expect(recommendTheme({ vertical: 'general' }).overrides?.font).toBeUndefined()
    // belleza → 'elegante' (sugerencia por vertical) → incluido
    expect(recommendTheme({ vertical: 'belleza' }).overrides?.font).toBe('elegante')
  })
})

// ── El wire-up que faltaba: motion + fotos de la reserva ──────────────────────────────
// Antes de esto, la skill armaba webs que salían ESTÁTICAS (sin `motion`, normalizeMotion
// devolvía 'none') y SIN el strip de confianza arriba de la reserva (nadie poblaba rsvData).
// El renderer tenía las dos features desde v0.16, pero el builder nunca las escribía.
describe('buildLandingConfig — motion de autoría', () => {
  it('escribe motion: premium (sin esta clave la web sale estática: normalizeMotion(undefined) → none)', () => {
    expect(buildLandingConfig(input(), THEME).motion).toBe('premium')
  })
})

describe('buildLandingConfig — fotos de la reserva (rsvData en la sección booking)', () => {
  const bookingOf = (cfg: ReturnType<typeof buildLandingConfig>) =>
    cfg.sections.find((s) => s.type === 'booking')

  it('usa las fotos dedicadas de rsv cuando el operador las pasa', () => {
    const cfg = buildLandingConfig(
      input({
        rsv: { header: 'Vení a conocernos', images: ['https://x.test/a.jpg'] },
        gallery: { images: ['https://x.test/g1.jpg', 'https://x.test/g2.jpg'] },
      }),
      THEME,
    )
    expect(bookingOf(cfg)?.data).toMatchObject({
      header: 'Vení a conocernos',
      images: ['https://x.test/a.jpg'],
    })
  })

  it('sin fotos dedicadas, reusa las primeras 3 de la galería (el strip no sale vacío)', () => {
    const cfg = buildLandingConfig(
      input({
        gallery: {
          images: [
            'https://x.test/1.jpg',
            'https://x.test/2.jpg',
            'https://x.test/3.jpg',
            'https://x.test/4.jpg',
          ],
        },
      }),
      THEME,
    )
    expect(bookingOf(cfg)?.data).toMatchObject({
      images: ['https://x.test/1.jpg', 'https://x.test/2.jpg', 'https://x.test/3.jpg'],
    })
  })

  it('la booking va ÚLTIMA (después del cta), como la que inyecta orderedSections', () => {
    const cfg = buildLandingConfig(
      input({ gallery: { images: ['https://x.test/1.jpg'] }, cta: { headline: 'Reservá' } }),
      THEME,
    )
    const last = [...cfg.sections].sort((a, b) => a.order - b.order).at(-1)
    expect(last?.type).toBe('booking')
  })

  // Sin fotos NO se emite la sección: orderedSections inyecta la booking pelada y el bloque de
  // reserva queda byte-idéntico a hoy (RsvStrip devuelve null con images vacío).
  it('sin ninguna foto no emite la sección booking (el bloque de reserva no cambia)', () => {
    expect(bookingOf(buildLandingConfig(input(), THEME))).toBeUndefined()
  })
})
