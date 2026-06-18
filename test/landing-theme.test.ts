import { describe, it, expect } from 'vitest'
import { isSafeColor, resolveLandingTheme } from '@/lib/landing/theme'

// ── Tests puros de resolución/validación de tema (Fase 8, THEME-01/02) ────────────
// Espejan test/landing-derive.test.ts: describe/it/expect, import desde @/lib/...,
// SIN Supabase ni creds (no van bajo skipIf), environment 'node'. Cubren la barrera
// anti CSS-injection (isSafeColor) y el mapeo landing_config.theme → motor existente
// con fallback legacy a businesses.* (D8-03).
//
// Los strings de ATAQUE CSS viven SOLO acá (no en el fuente): es donde tiene sentido
// probar que isSafeColor los rechaza. El módulo theme.ts nunca los menciona.

// ── isSafeColor: allowlist regex de hex estricto (T-08-01) ────────────────────────
describe('isSafeColor (allowlist hex estricto)', () => {
  it('acepta hex válidos de 3/4/6/8 dígitos', () => {
    expect(isSafeColor('#fff')).toBe(true) // caso 11: hex corto
    expect(isSafeColor('#d94a2b')).toBe(true)
    expect(isSafeColor('#00e5ff')).toBe(true) // caso 7
    expect(isSafeColor('#abcd')).toBe(true) // 4 dígitos (con alpha corto)
    expect(isSafeColor('#d94a2b80')).toBe(true) // 8 dígitos (con alpha)
    expect(isSafeColor('#ABCDEF')).toBe(true) // mayúsculas válidas
  })

  it('rechaza vacío / undefined / null (caso 13)', () => {
    expect(isSafeColor('')).toBe(false)
    expect(isSafeColor(undefined)).toBe(false)
    expect(isSafeColor(null)).toBe(false)
  })

  it('rechaza hex de largo inválido', () => {
    expect(isSafeColor('#')).toBe(false)
    expect(isSafeColor('#ff')).toBe(false) // 2 dígitos
    expect(isSafeColor('#fffff')).toBe(false) // 5 dígitos
    expect(isSafeColor('#fffffff')).toBe(false) // 7 dígitos
    expect(isSafeColor('#fffffffff')).toBe(false) // 9 dígitos
  })

  it('rechaza hex con caracteres no-hex (caso 12)', () => {
    expect(isSafeColor('#zzzzzz')).toBe(false)
    expect(isSafeColor('#gggggg')).toBe(false)
    expect(isSafeColor('d94a2b')).toBe(false) // sin "#"
  })

  it('rechaza payloads de CSS/style-injection', () => {
    expect(isSafeColor('red; }')).toBe(false) // caso 8: ";" + espacio + "}"
    expect(isSafeColor('url(x)')).toBe(false) // caso 9: "url" + paréntesis
    expect(isSafeColor('var(--evil)')).toBe(false) // caso 10: "var" + paréntesis
    expect(isSafeColor('expression(alert(1))')).toBe(false)
    expect(isSafeColor('#fff; background:url(x)')).toBe(false)
    expect(isSafeColor('#fff }')).toBe(false)
    expect(isSafeColor('rgb(0,0,0)')).toBe(false)
    expect(isSafeColor('#fff\n')).toBe(false) // salto de línea
    expect(isSafeColor('  #fff  ')).toBe(false) // espacios alrededor
    expect(isSafeColor('<script>')).toBe(false)
  })
})

// ── resolveLandingTheme: mapeo preset/overrides → motor + fallback (D8-03/05) ──────
describe('resolveLandingTheme (mapeo + fallback legacy)', () => {
  const fb = { theme: 'modern', palette: 'indigo', font: 'auto' }

  it('caso 1 · landingTheme=null → fallback puro normalizado, primary undefined', () => {
    expect(resolveLandingTheme(null, fb)).toEqual({
      theme: 'modern',
      palette: 'indigo',
      font: 'auto',
      primary: undefined,
    })
  })

  it('caso 2 · landingTheme=undefined → idéntico al fallback puro', () => {
    expect(resolveLandingTheme(undefined, fb)).toEqual({
      theme: 'modern',
      palette: 'indigo',
      font: 'auto',
      primary: undefined,
    })
  })

  it('caso 3 · preset:spa sin overrides → theme spa, palette default del theme (sage), no la del fallback', () => {
    const r = resolveLandingTheme({ preset: 'spa' }, { theme: 'forjo', palette: 'red', font: 'auto' })
    expect(r.theme).toBe('spa')
    expect(r.palette).toBe('sage') // default del theme spa, NO 'red' del fallback
    expect(r.font).toBe('auto')
    expect(r.primary).toBeUndefined()
  })

  it('caso 4 · preset:cyber + overrides palette/font → todos acotados al set del theme', () => {
    const r = resolveLandingTheme(
      { preset: 'cyber', overrides: { palette: 'magenta', font: 'tech' } },
      fb,
    )
    expect(r.theme).toBe('cyber')
    expect(r.palette).toBe('magenta')
    expect(r.font).toBe('tech')
  })

  it('caso 5 · override de palette inexistente → cae al default del theme (modern → indigo)', () => {
    const r = resolveLandingTheme({ preset: 'modern', overrides: { palette: 'NO_EXISTE' } }, fb)
    expect(r.theme).toBe('modern')
    expect(r.palette).toBe('indigo') // default del theme modern, no rompe
  })

  it('caso 6 · preset desconocido → theme forjo (normalizeTheme defensivo), no propaga el string', () => {
    const r = resolveLandingTheme({ preset: '__hacker__' }, fb)
    expect(r.theme).toBe('forjo')
  })

  it('caso 7 · overrides.primary hex válido → se devuelve tal cual', () => {
    const r = resolveLandingTheme({ preset: 'cyber', overrides: { primary: '#00e5ff' } }, fb)
    expect(r.primary).toBe('#00e5ff')
  })

  it('caso 8 · overrides.primary "red; }" → undefined (no-hex, ";" + espacio)', () => {
    const r = resolveLandingTheme({ preset: 'forjo', overrides: { primary: 'red; }' } }, fb)
    expect(r.primary).toBeUndefined()
  })

  it('caso 9 · overrides.primary "url(x)" → undefined', () => {
    const r = resolveLandingTheme({ preset: 'forjo', overrides: { primary: 'url(x)' } }, fb)
    expect(r.primary).toBeUndefined()
  })

  it('caso 10 · overrides.primary "var(--evil)" → undefined', () => {
    const r = resolveLandingTheme({ preset: 'forjo', overrides: { primary: 'var(--evil)' } }, fb)
    expect(r.primary).toBeUndefined()
  })

  it('caso 11 · overrides.primary "#fff" (hex corto) → se devuelve tal cual', () => {
    const r = resolveLandingTheme({ preset: 'forjo', overrides: { primary: '#fff' } }, fb)
    expect(r.primary).toBe('#fff')
  })

  it('caso 12 · overrides.primary "#zzzzzz" → undefined (caracteres no-hex)', () => {
    const r = resolveLandingTheme({ preset: 'forjo', overrides: { primary: '#zzzzzz' } }, fb)
    expect(r.primary).toBeUndefined()
  })

  it('resultado nunca contiene valores fuera del set del motor (fallback inválido)', () => {
    // fallback con valores basura → todo se normaliza igual (cero crash, defensivo)
    const r = resolveLandingTheme(null, { theme: 'basura', palette: 'basura', font: 'basura' })
    expect(r.theme).toBe('forjo') // normalizeTheme defensivo
    expect(r.palette).toBe('red') // default de forjo
    expect(r.font).toBe('auto') // normalizeFont defensivo
    expect(r.primary).toBeUndefined()
  })

  it('fallback con campos null/undefined no rompe (negocio legacy mínimo)', () => {
    const r = resolveLandingTheme(undefined, { theme: null, palette: null, font: null })
    expect(r.theme).toBe('forjo')
    expect(r.palette).toBe('red')
    expect(r.font).toBe('auto')
  })

  it('override de palette sin override de font → font cae al fallback', () => {
    const r = resolveLandingTheme(
      { preset: 'cyber', overrides: { palette: 'lime' } },
      { theme: 'modern', palette: 'indigo', font: 'tech' },
    )
    expect(r.theme).toBe('cyber')
    expect(r.palette).toBe('lime')
    expect(r.font).toBe('tech') // del fallback, porque no hubo override.font
  })
})
