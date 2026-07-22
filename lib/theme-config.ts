// ============================================================
// Estilo visual de Forjo: themes + paletas (por theme) + tipografías.
// Fuente de verdad única para la UI de Apariencia y la validación.
// Se persiste por negocio (businesses.theme/palette/font) y se aplica en
// <html> con data-theme/data-palette/data-font (ver palette-script.tsx).
// Los tokens CSS viven en app/globals.css (Forjo) y app/themes.css (resto).
// ============================================================

export type Swatch = readonly [string, string, string]

export interface ThemeDef {
  id: string
  name: string
  meta: string
  // Mini-preview de la card: fondo + color de texto + 3 chips de acento.
  bg: string
  fg: string
  chips: Swatch
  glow?: boolean
}

export interface PaletteDef {
  id: string
  name: string
  meta: string
  swatches: Swatch
  glow?: boolean
}

export interface FontDef {
  id: string
  name: string
  meta: string
  // font-family para renderizar el "Aa" de muestra en la card.
  css: string
}

export const THEMES: ThemeDef[] = [
  { id: 'forjo', name: 'Forjo', meta: 'Bauhaus · cálido', bg: '#f3ead8', fg: '#1a1714', chips: ['#d94a2b', '#2a5fa5', '#f4c543'] },
  { id: 'modern', name: 'Modern', meta: 'SaaS · limpio', bg: '#eef1f7', fg: '#1d2433', chips: ['#5b6ef5', '#1fbf91', '#f4b740'] },
  { id: 'spa', name: 'Spa', meta: 'Relax · degradé', bg: 'linear-gradient(135deg,#efe9e2,#e3e7e0,#ece0e2)', fg: '#4c443d', chips: ['#7e9b82', '#b79aa0', '#cdb083'] },
  { id: 'cyber', name: 'Cyber', meta: 'Neón · futurista', bg: '#080611', fg: '#dff6ff', chips: ['#00e5ff', '#ff2e7e', '#3dff9e'], glow: true },
]

// La tipografía de títulos que trae CADA theme. ESPEJO de --font-heading en app/themes.css
// (forjo vive en :root/[data-theme='forjo'] de globals.css). Si allá cambia una fuente, cambiarla acá.
//
// Existe para poder RENDERIZAR una muestra de la opción "Automática" del selector de fuentes. Esa
// opción significa "la del estilo visual elegido", y su preview usaba var(--font-heading) — que se
// resuelve CONTRA EL ELEMENTO donde se pinta, o sea contra el PANEL. Resultado: la muestra de
// "Automática" mostraba siempre la fuente del theme del panel (la Orbitron de Cyber), sin importar
// qué theme tuviera elegido el landing. Con este mapa la muestra usa la fuente del theme SELECCIONADO.
export const THEME_HEADING_FONT: Record<string, string> = {
  forjo: 'var(--font-archivo), system-ui, sans-serif',
  modern: 'var(--font-jakarta), system-ui, sans-serif',
  spa: 'var(--font-cormorant), Georgia, serif',
  cyber: 'var(--font-orbitron), system-ui, sans-serif',
}

// Cada theme trae su propia familia de acentos. Las de Forjo son las "clásicas".
export const THEME_PALETTES: Record<string, PaletteDef[]> = {
  forjo: [
    { id: 'red', name: 'Rojo Forjo', meta: 'Principal', swatches: ['#d94a2b', '#1a1714', '#f4c543'] },
    { id: 'blue', name: 'Azul', meta: 'Constructivista', swatches: ['#2a5fa5', '#1a1714', '#f4c543'] },
    { id: 'yellow', name: 'Ocre', meta: 'Cálido', swatches: ['#c8901a', '#1a1714', '#d94a2b'] },
    { id: 'green', name: 'Verde', meta: 'Bosque', swatches: ['#2f8a5b', '#1a1714', '#f4c543'] },
    { id: 'ink', name: 'Tinta', meta: 'Monocromo', swatches: ['#1a1714', '#6b6253', '#d9ceb4'] },
  ],
  modern: [
    { id: 'indigo', name: 'Índigo', meta: 'Por defecto', swatches: ['#5b6ef5', '#1b2334', '#1fbf91'] },
    { id: 'emerald', name: 'Esmeralda', meta: 'Fresco', swatches: ['#10b981', '#1b2334', '#5b6ef5'] },
    { id: 'violet', name: 'Violeta', meta: 'Creativo', swatches: ['#8b5cf6', '#1b2334', '#f4b740'] },
    { id: 'rose', name: 'Rosa', meta: 'Vibrante', swatches: ['#f43f5e', '#1b2334', '#5b6ef5'] },
    { id: 'amber', name: 'Ámbar', meta: 'Cálido', swatches: ['#f59e0b', '#1b2334', '#10b981'] },
  ],
  spa: [
    { id: 'sage', name: 'Salvia', meta: 'Por defecto', swatches: ['#7e9b82', '#b79aa0', '#cdb083'] },
    { id: 'mauve', name: 'Malva', meta: 'Floral', swatches: ['#b08a92', '#cdb083', '#7e9b82'] },
    { id: 'clay', name: 'Arcilla', meta: 'Terroso', swatches: ['#bb8b6b', '#9bb0a0', '#cdb083'] },
    { id: 'ocean', name: 'Océano', meta: 'Sereno', swatches: ['#7e93a6', '#a9b8a0', '#cdb083'] },
    { id: 'lavender', name: 'Lavanda', meta: 'Calmo', swatches: ['#9d8fb0', '#c6b59a', '#7e9b82'] },
  ],
  cyber: [
    { id: 'cyan', name: 'Cian', meta: 'Por defecto', swatches: ['#00e5ff', '#ff2e7e', '#3dff9e'], glow: true },
    { id: 'magenta', name: 'Magenta', meta: 'Synthwave', swatches: ['#ff2e7e', '#00e5ff', '#f5e663'], glow: true },
    { id: 'lime', name: 'Lima', meta: 'Matrix', swatches: ['#3dff9e', '#b06cff', '#00e5ff'], glow: true },
    { id: 'purple', name: 'Púrpura', meta: 'Vapor', swatches: ['#b06cff', '#00e5ff', '#ff2e7e'], glow: true },
    { id: 'amber', name: 'Ámbar', meta: 'Reactor', swatches: ['#ffd23d', '#ff2e7e', '#00e5ff'], glow: true },
  ],
}

export const THEME_DEFAULT_PAL: Record<string, string> = {
  forjo: 'red', modern: 'indigo', spa: 'sage', cyber: 'cyan',
}

// 'auto' = la fuente nativa del theme (no setea data-font). El resto sobreescribe.
export const FONTS: FontDef[] = [
  { id: 'auto', name: 'Automática', meta: 'Según estilo', css: 'var(--font-heading)' },
  { id: 'geometrica', name: 'Geométrica', meta: 'Jakarta Sans', css: 'var(--font-jakarta)' },
  { id: 'bauhaus', name: 'Bauhaus', meta: 'Grotesk · Archivo', css: 'var(--font-archivo)' },
  { id: 'elegante', name: 'Elegante', meta: 'Cormorant · Mulish', css: 'var(--font-cormorant)' },
  { id: 'tech', name: 'Tech', meta: 'Orbitron · Chakra', css: 'var(--font-orbitron)' },
  { id: 'suave', name: 'Suave', meta: 'Sora · Manrope', css: 'var(--font-sora)' },
]

const THEME_IDS = new Set(THEMES.map(t => t.id))
const FONT_IDS = new Set(FONTS.map(f => f.id))

// Normalizan lo que viene de la DB a valores válidos (defensivo).
export function normalizeTheme(theme?: string | null): string {
  return theme && THEME_IDS.has(theme) ? theme : 'forjo'
}
export function normalizeFont(font?: string | null): string {
  return font && FONT_IDS.has(font) ? font : 'auto'
}
export function normalizePalette(theme: string, palette?: string | null): string {
  const list = THEME_PALETTES[theme] || THEME_PALETTES.forjo
  return palette && list.some(p => p.id === palette) ? palette : (THEME_DEFAULT_PAL[theme] || 'red')
}

// ── Overrides de tema por query param (caso EMBED) ────────────────────────────────
// Cuando la reserva pública se embebe en la web del cliente, la web anfitriona manda su
// propio look por la URL (?theme=&palette=&font=) para que el wizard matchee el sitio.
// A diferencia de los normalize* de arriba, acá NO se coerciona a default: lo inválido o
// ausente devuelve undefined, así el caller deja intacto lo que ya resolvió el layout
// (que para un negocio SIN web es su apariencia de panel, y eso debe seguir igual).
// Validación por ALLOWLIST contra los sets del motor — nunca se interpola un valor crudo.
export function parseThemeOverrides(
  sp: Record<string, string | string[] | undefined> | undefined
): { theme?: string; palette?: string; font?: string } {
  if (!sp) return {}
  const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined)

  const rawTheme = one(sp.theme)
  const theme = rawTheme && THEMES.some(t => t.id === rawTheme) ? rawTheme : undefined

  const rawFont = one(sp.font)
  const font = rawFont && FONTS.some(f => f.id === rawFont) ? rawFont : undefined

  // La paleta pertenece a un theme. Si vino theme en la URL se valida contra el suyo;
  // si no, contra la unión (el CSS ignora un combo theme/paleta que no exista, sin romper).
  const rawPalette = one(sp.palette)
  const pool = theme
    ? (THEME_PALETTES[theme] || [])
    : Object.values(THEME_PALETTES).flat()
  const palette = rawPalette && pool.some(p => p.id === rawPalette) ? rawPalette : undefined

  return { theme, palette, font }
}
