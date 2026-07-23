import { describe, it, expect } from 'vitest'
import { brandEmail, emailBrandInputs } from '@/lib/email'

// ── Test PURO de los helpers de branding del mail (BRAND-EMAIL-01) ────────────────────────────────
// brandEmail y emailBrandInputs son funciones PURAS (sin red, sin Supabase): mapean paleta/override/
// fuente del negocio a los tokens de marca que consumen los 10 templates. Acá se prueban las dos
// barreras de seguridad del linaje WR-02:
//   · el color solo sale del mapa de literales o de un override revalidado por isSafeColor (T-wxt-01)
//   · la URL de Google Fonts solo se arma desde el allowlist fijo, nunca desde el valor crudo (T-wxt-02)

describe('brandEmail — mapa de color por paleta', () => {
  it('cada paleta del theme forjo mapea a su hex claro', () => {
    expect(brandEmail({ palette: 'red' }).accent).toBe('#d94a2b')
    expect(brandEmail({ palette: 'blue' }).accent).toBe('#2a5fa5')
    expect(brandEmail({ palette: 'yellow' }).accent).toBe('#c8901a')
    expect(brandEmail({ palette: 'green' }).accent).toBe('#2f8a5b')
    expect(brandEmail({ palette: 'ink' }).accent).toBe('#1a1714')
  })

  it('paleta null / desconocida cae al rojo Forjo por defecto', () => {
    expect(brandEmail({ palette: null }).accent).toBe('#d94a2b')
    expect(brandEmail({ palette: undefined }).accent).toBe('#d94a2b')
    expect(brandEmail({ palette: 'indigo' }).accent).toBe('#d94a2b') // paleta de otro theme SIN theme
    expect(brandEmail({}).accent).toBe('#d94a2b')
  })
})

describe('brandEmail — color THEME-AWARE (themes no-forjo)', () => {
  it('el acento sale de THEME_PALETTES según theme+palette, no del rojo Forjo', () => {
    expect(brandEmail({ theme: 'cyber', palette: 'cyan' }).accent).toBe('#00e5ff')
    expect(brandEmail({ theme: 'cyber', palette: 'amber' }).accent).toBe('#ffd23d')
    expect(brandEmail({ theme: 'modern', palette: 'indigo' }).accent).toBe('#5b6ef5')
    expect(brandEmail({ theme: 'spa', palette: 'sage' }).accent).toBe('#7e9b82')
  })

  it('theme forjo mantiene su color (cero regresión)', () => {
    expect(brandEmail({ theme: 'forjo', palette: 'red' }).accent).toBe('#d94a2b')
  })

  it('theme/palette inválido cae al default del theme (allowlist, nunca crudo)', () => {
    // theme desconocido → forjo; palette desconocida dentro del theme → default del theme.
    expect(brandEmail({ theme: 'inexistente', palette: 'zzz' }).accent).toBe('#d94a2b')
    expect(brandEmail({ theme: 'cyber', palette: 'zzz' }).accent).toBe('#00e5ff') // default cyber = cyan
  })

  it('el override válido sigue ganando sobre el color del theme', () => {
    expect(brandEmail({ theme: 'cyber', palette: 'cyan', primaryOverride: '#abcdef' }).accent).toBe('#abcdef')
  })
})

describe('brandEmail — override de color (defensa isSafeColor)', () => {
  it('un override hex válido gana sobre la paleta', () => {
    expect(brandEmail({ palette: 'blue', primaryOverride: '#abcdef' }).accent).toBe('#abcdef')
    expect(brandEmail({ palette: 'red', primaryOverride: '#111' }).accent).toBe('#111')
  })

  it('un override inválido se ignora y cae a la paleta', () => {
    expect(brandEmail({ palette: 'blue', primaryOverride: 'red' }).accent).toBe('#2a5fa5')
    expect(brandEmail({ palette: 'blue', primaryOverride: 'javascript:alert(1)' }).accent).toBe('#2a5fa5')
    expect(brandEmail({ palette: 'blue', primaryOverride: '#zzz' }).accent).toBe('#2a5fa5')
    expect(brandEmail({ palette: 'green', primaryOverride: '  #fff  ' }).accent).toBe('#2f8a5b')
  })
})

describe('brandEmail — texto de contraste (onAccentText)', () => {
  it('yellow (#c8901a) usa near-black legible', () => {
    expect(brandEmail({ palette: 'yellow' }).accentText).toBe('#1a1714')
  })

  it('red usa blanco', () => {
    expect(brandEmail({ palette: 'red' }).accentText).toBe('#ffffff')
  })

  it('accentTextMuted deriva del texto: translúcido del blanco o del near-black', () => {
    expect(brandEmail({ palette: 'red' }).accentTextMuted).toBe('rgba(255,255,255,.7)')
    expect(brandEmail({ palette: 'yellow' }).accentTextMuted).toBe('rgba(26,23,20,.6)')
  })
})

describe('brandEmail — fuente de títulos (allowlist)', () => {
  it('bauhaus arma link a Archivo y stack con Archivo', () => {
    const b = brandEmail({ font: 'bauhaus' })
    expect(b.fontLink).toContain('Archivo')
    expect(b.headingFontFamily).toContain('Archivo')
  })

  it('elegante cae a un stack serif', () => {
    expect(brandEmail({ font: 'elegante' }).headingFontFamily).toContain('serif')
  })

  it('sin id de fuente explícito (auto/null/desconocido) resuelve la fuente del THEME', () => {
    // font 'auto' + theme cyber → Orbitron (familia + link del allowlist del theme).
    const cyber = brandEmail({ font: 'auto', theme: 'cyber' })
    expect(cyber.headingFontFamily).toContain('Orbitron')
    expect(cyber.fontLink).toContain('Orbitron')
    // theme forjo + font auto → Archivo.
    const forjo = brandEmail({ font: 'auto', theme: 'forjo' })
    expect(forjo.headingFontFamily).toContain('Archivo')
    expect(forjo.fontLink).toContain('Archivo')
    // theme spa + font null → stack serif (Cormorant Garamond).
    expect(brandEmail({ font: null, theme: 'spa' }).headingFontFamily).toContain('serif')
  })

  it('SEGURIDAD: un font desconocido nunca se interpola crudo en el link', () => {
    const evil = 'Orbitron:400");@import url(evil'
    // Sin theme → forjo: el link se arma desde el allowlist del theme (Archivo), NUNCA del valor crudo.
    const b = brandEmail({ font: evil })
    expect(b.fontLink).toContain('Archivo')
    expect(b.fontLink).not.toContain(evil)
    expect(b.fontLink).not.toContain('evil')
  })
})

describe('emailBrandInputs — fila de negocio → inputs (espejo de app/[slug]/layout.tsx)', () => {
  it('landing_config con overrides.primary válido setea primaryOverride', () => {
    const out = emailBrandInputs({
      palette: 'blue',
      theme: 'forjo',
      font: 'auto',
      landing_config: { theme: { preset: 'forjo', overrides: { primary: '#abcdef' } } },
    })
    expect(out.primaryOverride).toBe('#abcdef')
  })

  it('sin landing_config usa la paleta del negocio y primaryOverride null', () => {
    const out = emailBrandInputs({ palette: 'blue', theme: 'forjo', font: 'auto' })
    expect(out.palette).toBe('blue')
    expect(out.primaryOverride).toBeNull()
  })

  it('devuelve el theme resuelto para que brandEmail lo use', () => {
    expect(emailBrandInputs({ palette: 'cyan', theme: 'cyber', font: 'auto' }).theme).toBe('cyber')
    expect(emailBrandInputs({ palette: 'sage', theme: 'spa', font: 'auto' }).theme).toBe('spa')
  })

  it('landing_config basura ({} o string) no rompe: cae al fallback', () => {
    expect(() => emailBrandInputs({ palette: 'red', landing_config: {} })).not.toThrow()
    expect(() => emailBrandInputs({ palette: 'red', landing_config: 'garbage' })).not.toThrow()
    const out = emailBrandInputs({ palette: 'green', landing_config: 'garbage' })
    expect(out.palette).toBe('green')
    expect(out.primaryOverride).toBeNull()
  })
})
