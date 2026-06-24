import {
  THEMES,
  THEME_DEFAULT_PAL,
  normalizeTheme,
  normalizePalette,
  normalizeFont,
} from '@/lib/theme-config'
import { isSafeColor } from '@/lib/landing/theme'
import type { LandingConfig, LandingTheme } from '@/lib/landing/schema'

// ── Builder puro de la landing (Phase 10 · skill forjo-web-builder) ───────────────
// Por qué este módulo: la skill F10 arma un `landing_config` a partir de materia prima
// (scrape de IG o input manual) y recomienda un tema desde la marca del negocio. Esa
// lógica de mapeo (materia prima → secciones con campos EXACTOS, marca → preset+overrides)
// se extrae acá para verificarla con `npm test`, dejando finos el script de escritura (10-02)
// y el SKILL.md (10-03). Este módulo es la GARANTÍA de que lo que se escribe SIEMPRE pasa
// el gate Zod `parseLandingConfig` sin pérdida (SKILL-04).
//
// Reglas duras (mismo patrón que lib/landing/derive.ts / theme.ts / seo.ts): SIN React,
// SIN Supabase, SIN Playwright, SIN fetch — solo tipos públicos. NO descarga ni sube nada:
// las image/images[]/map_url que llegan acá YA son URLs públicas de Storage (las resuelve
// 10-02 antes de llamar al builder) o están ausentes. NO resuelve el slug.
//
// Reuso obligatorio (NO duplicar shapes ni sets): los TIPOS LandingConfig/LandingTheme de
// @/lib/landing/schema; THEMES/THEME_DEFAULT_PAL/normalize* de @/lib/theme-config; isSafeColor
// de @/lib/landing/theme (el regex de hex vive ahí, no se re-declara).

// ── Tipos de entrada ──────────────────────────────────────────────────────────────
// Materia prima YA normalizada por la skill (NO el shape crudo de instagram-data.json).
export interface BuilderInput {
  business: { name: string; whatsapp?: string | null } // para fallbacks/decisiones
  hero?: { headline?: string; kicker?: string; subhead?: string; image?: string; cta_label?: string }
  about?: { title?: string; body?: string; image?: string }
  // services SOLO aporta título/subtítulo: la LISTA viene de la tabla `services` (D10-04).
  services?: { title?: string; subtitle?: string }
  gallery?: { title?: string; images?: string[] }
  location?: { title?: string; map_url?: string; show_address?: boolean }
  hours?: { title?: string }
  cta?: { headline?: string }
}

// Pistas de marca para recommendTheme. Todo opcional: el operador puede no expresar nada.
export interface BrandHints {
  vertical?: string | null // salud | belleza | general | otro
  primary_color?: string | null // candidato a overrides.primary (validar con isSafeColor)
  theme?: string | null // preferencias explícitas opcionales del operador
  palette?: string | null
  font?: string | null
}

// ── Helpers locales ─────────────────────────────────────────────────────────────────

// isHttpUrl: una URL inválida disparada hacia un campo z.string().url() del esquema haría caer
// el `.catch({})` de esa sección → se perdería TODO el data de la sección, no solo la URL mala.
// Por eso filtramos acá: solo dejamos pasar URLs http/https bien formadas. Se valida con new URL()
// (mismo criterio que z.string().url() para protocolo), envuelto en try/catch.
function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value === '') return false
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

// str: normaliza un string opcional. Devuelve el string solo si es no-vacío; undefined si no.
// Sirve para OMITIR claves vacías: Zod v4 estripa claves desconocidas en silencio, así que
// emitir `headline: ''` no rompe, pero ensucia el config; preferimos no setear la clave.
function str(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

// onlyValidUrls: filtra un array de candidatas dejando solo URLs http/https válidas.
function onlyValidUrls(images: unknown): string[] | undefined {
  if (!Array.isArray(images)) return undefined
  const valid = images.filter(isHttpUrl)
  return valid.length > 0 ? valid : undefined
}

// pick: arma un objeto `data` descartando las claves cuyo valor sea undefined. Mantener
// las claves vacías fuera del config (menos ruido, output predecible para los tests).
function pick<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v
  }
  return out as Partial<T>
}

// Una sección del envelope (sin booking: la inyecta orderedSections — LAND-02, research Q3).
type Section = LandingConfig['sections'][number]

// ── buildLandingConfig (SKILL-01) ─────────────────────────────────────────────────
// Materia prima + tema recomendado → LandingConfig { theme, sections: [...] }.
// Orden FIJO: hero(0) → about(1) → services(2) → gallery(3) → location(4) → hours(5) → cta(6).
// NO incluye booking: es core y la inyecta orderedSections sola (D research Q3); meterla acá
// la duplicaría. Cada sección setea SOLO las claves que reconoce el esquema de schema.ts
// (heroData/aboutData/servicesData/galleryData/locationData/ctaData) — cualquier otra clave la
// estriparía Zod, y una URL inválida dispararía el `.catch({})` por sección que vacía TODO el data.
//
// Regla de inclusión: hero SIEMPRE va (nunca se oculta, aunque venga vacío). services SIEMPRE va
// (la lista la pone el renderer desde la tabla; si no hay servicios la oculta shouldHideServices,
// no el builder). Las demás (about/gallery/location/hours/cta) se OMITEN si quedarían 100% vacías
// (sin data) — menos ruido en el config; el renderer igual las ocultaría con sus predicados.
export function buildLandingConfig(input: BuilderInput, theme: LandingTheme): LandingConfig {
  const sections: Section[] = []
  let order = 0

  // hero — SIEMPRE presente. Claves del esquema: headline, subhead, image, cta_label.
  const heroData = pick({
    headline: str(input.hero?.headline),
    kicker: str(input.hero?.kicker),
    subhead: str(input.hero?.subhead),
    image: isHttpUrl(input.hero?.image) ? input.hero!.image : undefined,
    cta_label: str(input.hero?.cta_label),
  })
  sections.push({ type: 'hero', enabled: true, order: order++, data: heroData })

  // about — claves: title, body, image. Se omite si quedaría vacío.
  const aboutData = pick({
    title: str(input.about?.title),
    body: str(input.about?.body),
    image: isHttpUrl(input.about?.image) ? input.about!.image : undefined,
  })
  if (Object.keys(aboutData).length > 0) {
    sections.push({ type: 'about', enabled: true, order: order++, data: aboutData })
  }

  // services — SIEMPRE presente. SOLO title/subtitle: NUNCA una lista de servicios (D10-04).
  const servicesData = pick({
    title: str(input.services?.title),
    subtitle: str(input.services?.subtitle),
  })
  sections.push({ type: 'services', enabled: true, order: order++, data: servicesData })

  // gallery — claves: title, images. Se omite si no hay título ni imágenes válidas.
  const galleryData = pick({
    title: str(input.gallery?.title),
    images: onlyValidUrls(input.gallery?.images),
  })
  if (Object.keys(galleryData).length > 0) {
    sections.push({ type: 'gallery', enabled: true, order: order++, data: galleryData })
  }

  // location — claves: title, map_url, show_address. Se omite si quedaría vacío.
  const locationData = pick({
    title: str(input.location?.title),
    map_url: isHttpUrl(input.location?.map_url) ? input.location!.map_url : undefined,
    show_address:
      typeof input.location?.show_address === 'boolean' ? input.location.show_address : undefined,
  })
  if (Object.keys(locationData).length > 0) {
    sections.push({ type: 'location', enabled: true, order: order++, data: locationData })
  }

  // hours — Hours no tiene esquema en schema.ts; solo `title` defensivo. Se omite si vacío.
  const hoursData = pick({ title: str(input.hours?.title) })
  if (Object.keys(hoursData).length > 0) {
    sections.push({ type: 'hours', enabled: true, order: order++, data: hoursData })
  }

  // cta — clave: headline. Se omite si no hay headline.
  const ctaData = pick({ headline: str(input.cta?.headline) })
  if (Object.keys(ctaData).length > 0) {
    sections.push({ type: 'cta', enabled: true, order: order++, data: ctaData })
  }

  return { theme, sections }
}

// ── recommendTheme (SKILL-04) ─────────────────────────────────────────────────────
// Marca → LandingTheme { preset, overrides? }, SIEMPRE dentro del set cerrado de theme-config.ts.
// - preset: si brand.theme es un id válido (THEMES) se usa; si no, se elige por vertical —
//   salud/belleza → 'spa', general/otro → 'forjo' (default de marca). normalizeTheme acota
//   cualquier valor fuera de THEMES a 'forjo', así que nunca sale un id inventado.
// - overrides.palette: acotada al set del preset con normalizePalette. Solo se incluye si DIFIERE
//   del default del preset (THEME_DEFAULT_PAL) — si es el default, se omite (menos ruido).
// - overrides.font: normalizeFont. Por vertical sin preferencia: salud/belleza → 'elegante',
//   tech-ish → 'tech', resto → 'auto'. Se omite si queda 'auto' (es el default, no setea data-font).
// - overrides.primary: SOLO si isSafeColor(brand.primary_color) (allowlist de hex). Cualquier otro
//   valor (null, nombre CSS, rgb(), hex inválido) → NO se incluye. NUNCA se propaga color sin validar
//   (T-10-01: anti CSS-injection). La palette del preset alcanza si no hay primary seguro.
// Si overrides queda vacío, se omite la clave entera → theme = { preset } a secas.
const THEME_IDS = new Set(THEMES.map((t) => t.id))

function presetForVertical(vertical?: string | null): string {
  if (vertical === 'salud' || vertical === 'belleza') return 'spa'
  return 'forjo' // general / otro / null → default de marca
}

function fontForVertical(vertical?: string | null): string {
  if (vertical === 'salud' || vertical === 'belleza') return 'elegante'
  if (vertical === 'tech') return 'tech'
  return 'auto'
}

export function recommendTheme(brand: BrandHints): LandingTheme {
  // preset: preferencia explícita válida → usar; si no → por vertical. normalizeTheme garantiza
  // que el resultado siempre esté en THEMES (degrada a 'forjo').
  const preset =
    brand.theme && THEME_IDS.has(brand.theme)
      ? brand.theme
      : normalizeTheme(presetForVertical(brand.vertical))

  const overrides: Record<string, string> = {}

  // palette: acotada al set del preset; solo se incluye si difiere del default del preset.
  const palette = normalizePalette(preset, brand.palette)
  if (palette !== (THEME_DEFAULT_PAL[preset] ?? THEME_DEFAULT_PAL.forjo)) {
    overrides.palette = palette
  }

  // font: preferencia explícita normalizada o sugerencia por vertical; se omite si es 'auto'.
  const font = normalizeFont(brand.font ?? fontForVertical(brand.vertical))
  if (font !== 'auto') {
    overrides.font = font
  }

  // primary: solo si pasa la allowlist de hex. Nunca propagar un color crudo.
  if (isSafeColor(brand.primary_color)) {
    overrides.primary = brand.primary_color as string
  }

  // overrides vacío → omitir la clave entera (theme = { preset }).
  return Object.keys(overrides).length > 0 ? { preset, overrides } : { preset }
}
