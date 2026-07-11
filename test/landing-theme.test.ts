import { describe, it, expect } from 'vitest'
import { isSafeColor, resolveLandingTheme, normalizeMotion } from '@/lib/landing/theme'
import { normalizeTheme, THEME_DEFAULT_PAL } from '@/lib/theme-config'

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

  // ⚠ Este test afirmaba lo contrario ("font cae al fallback") y se CAMBIÓ a propósito: heredar
  // la fuente del panel le pisaba al theme del landing su tipografía de diseño. La palette SÍ
  // sigue cayendo al fallback (acotada al set del theme); la font no. Ver el describe de abajo.
  it('override de palette sin override de font → la font NO cae al fallback (manda el theme)', () => {
    const r = resolveLandingTheme(
      { preset: 'cyber', overrides: { palette: 'lime' } },
      { theme: 'modern', palette: 'indigo', font: 'tech' },
    )
    expect(r.theme).toBe('cyber')
    expect(r.palette).toBe('lime')
    expect(r.font).toBe('auto') // NO 'tech' del panel: sin override manda la fuente del theme
  })
})

// ── normalizeMotion: resolución del nivel de motion (D-04, espejo de normalizeTheme) ─
// El default 'subtle' es de AUTORÍA (lo setea la skill), NO de render. El resolver degrada
// defensivamente: solo 'subtle'/'premium' pasan; ausente/inválido/'none'/no-string → 'none'
// (estático). Espejo exacto de la filosofía de normalizeTheme (default en la resolución, no
// en el parse) → un config existente sin motion renderiza byte-idéntico a hoy.
describe('normalizeMotion (resolución de nivel, D-04)', () => {
  it('"subtle" → "subtle"', () => {
    expect(normalizeMotion('subtle')).toBe('subtle')
  })

  it('"premium" → "premium"', () => {
    expect(normalizeMotion('premium')).toBe('premium')
  })

  it('"none" → "none"', () => {
    expect(normalizeMotion('none')).toBe('none')
  })

  it('undefined → "none" (sin default de render, D-04)', () => {
    expect(normalizeMotion(undefined)).toBe('none')
  })

  it('string inválido → "none"', () => {
    expect(normalizeMotion('basura')).toBe('none')
  })

  it('no-string (número) → "none"', () => {
    expect(normalizeMotion(42)).toBe('none')
  })

  it('null → "none"', () => {
    expect(normalizeMotion(null)).toBe('none')
  })
})

// ── normalizeTheme como active-match del grid del editor (14-04, landmine L8) ──────
// El grid de presets del editor (theme-controls.tsx) resalta el preset activo comparando
// normalizeTheme(theme.preset) contra el id de cada card. La razón: el DEFAULT sembrado de
// una landing es { preset: 'default' } (schema.ts) — un valor de AUTORÍA, NO un id de theme.
// Sin normalizar, un config null-sembrado no resaltaría NINGÚN swatch (nada activo). Con
// normalizeTheme, 'default'/ausente/desconocido degrada a 'forjo' → el editor resalta Forjo,
// igual que lo que verá el visitante (resolveLandingTheme usa el mismo normalizeTheme).
describe('normalizeTheme como active-match del editor (L8)', () => {
  it("'default' (config null-sembrado) → 'forjo' (resalta Forjo, no nada)", () => {
    expect(normalizeTheme('default')).toBe('forjo')
  })

  it('undefined → forjo (sin preset guardado)', () => {
    expect(normalizeTheme(undefined)).toBe('forjo')
  })

  it('preset desconocido → forjo (defensivo)', () => {
    expect(normalizeTheme('__hacker__')).toBe('forjo')
  })

  it('preset conocido se preserva (modern → modern)', () => {
    expect(normalizeTheme('modern')).toBe('modern')
  })

  it("la paleta default del active-match de 'default' es la de forjo ('red')", () => {
    expect(THEME_DEFAULT_PAL[normalizeTheme('default')]).toBe('red')
  })
})

// ── La fuente del theme NO la pisa la del panel ───────────────────────────────────────
// Bug real: `businesses.font` es la fuente del PANEL. El landing la heredaba como fallback y le
// pisaba al theme su tipografía de diseño → elegías "Cyber" (Orbitron) y seguías viendo Archivo.
// Peor: el editor mostraba "Automática · Según estilo" seleccionada mientras renderizaba otra cosa.
describe('resolveLandingTheme — la fuente del panel no pisa la del theme del landing', () => {
  it('con landing y SIN override de font → auto (manda la fuente que define el theme)', () => {
    const r = resolveLandingTheme(
      { preset: 'cyber' },
      { theme: 'forjo', palette: 'red', font: 'bauhaus' }, // el negocio tiene Archivo en el panel
    )
    expect(r.theme).toBe('cyber')
    expect(r.font).toBe('auto') // NO 'bauhaus' → PaletteScript no emite data-font → manda cyber
  })

  it('un override explícito de font sigue mandando', () => {
    const r = resolveLandingTheme(
      { preset: 'cyber', overrides: { font: 'elegante' } },
      { theme: 'forjo', palette: 'red', font: 'bauhaus' },
    )
    expect(r.font).toBe('elegante')
  })

  // El fallback sigue vivo para el caso LEGACY (negocio SIN landing: renderiza la página de
  // reservas de siempre, donde la fuente del panel es la correcta). Sacarlo sería una regresión.
  it('SIN landing (legacy) sigue tomando la fuente del negocio', () => {
    const r = resolveLandingTheme(null, { theme: 'forjo', palette: 'red', font: 'bauhaus' })
    expect(r.font).toBe('bauhaus')
  })
})
