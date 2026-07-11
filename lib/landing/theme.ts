import { normalizeTheme, normalizePalette, normalizeFont } from '@/lib/theme-config'
import type { LandingTheme } from '@/lib/landing/schema'

// ── Lógica pura de resolución/validación de tema de la landing (Phase 8) ──────────
// Por qué este módulo: el cableado real (app/[slug]/layout.tsx → PaletteScript) va en la
// Wave 2 y no es unit-testeable fácil (RSC, environment 'node'). La estrategia Nyquist es
// EXTRAER acá la lógica de mapeo (landing_config.theme → motor existente) y de validación
// (barrera anti CSS-injection) a funciones PURAS y testear esas.
// Reglas duras (igual que lib/landing/derive.ts): SIN React, SIN Supabase, SIN admin client.
// Reusa el motor existente (D8-01): normalizeTheme/normalizePalette/normalizeFont de
// lib/theme-config.ts — NO duplica THEMES/THEME_PALETTES/FONTS ni inventa presets.

// ── isSafeColor: barrera anti CSS/style-injection (T-08-01) ───────────────────────
// overrides.primary es un color CRUDO que viene del config (dato no confiable: lo escribe la
// skill F10 o una edición futura). En la Wave 2 cruza al <html> como CSS var inline (--primary).
// Si se interpolara sin validar, un valor con declaraciones CSS extra (separadores, paréntesis,
// funciones CSS, o caracteres de cierre/markup) permitiría inyectar reglas arbitrarias en el
// style del documento. Por eso validamos por ALLOWLIST de regex de hex
// estricto — NO por blocklist de caracteres peligrosos (una blocklist siempre deja huecos).
// Solo pasa "#" seguido de exactamente 3, 4, 6 u 8 dígitos hex; cualquier otra cosa → false.
const HEX_COLOR = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

export function isSafeColor(value: string | undefined | null): boolean {
  if (typeof value !== 'string') return false
  return HEX_COLOR.test(value)
}

// El tema resuelto que consume el cableado (Wave 2). theme/palette/font SIEMPRE pertenecen a los
// sets del motor (theme-config.ts); primary es un hex válido o undefined — nunca un string crudo.
export interface ResolvedTheme {
  theme: string
  palette: string
  font: string
  primary?: string
  // Modo claro/oscuro DEL LANDING (no del visitante). Ver normalizeMode.
  mode: LandingMode
}

export type LandingMode = 'light' | 'dark'

// ── normalizeMode: el modo del landing es AUTORÍA, no preferencia del visitante ────────
// Hasta ahora el landing heredaba la clase .dark que next-themes pone en <html> según lo que el
// VISITANTE tenga guardado — o sea que la misma página se veía clara u oscura según quién entrara,
// y el dueño no podía decidirlo. Ahora el modo es parte del config (overrides.mode) y el <main>
// del landing lo declara, así que la página se ve como el dueño la dejó.
// Default 'light' (ausente/basura → light): es el defaultTheme de la app, así que un landing ya
// publicado sin la clave sigue viéndose como hoy para el visitante típico.
export function normalizeMode(raw: unknown): LandingMode {
  return raw === 'dark' ? 'dark' : 'light'
}

// El fallback legacy: los valores per-negocio de businesses.theme/palette/font. Pueden venir
// null/inválidos desde la DB → las funciones normalize* los acotan defensivamente.
interface ThemeFallback {
  theme?: string | null
  palette?: string | null
  font?: string | null
}

// ── resolveLandingTheme: landing_config.theme → motor, con fallback a businesses.* ─
// Mapeo D8-05: preset → theme (→ data-theme); overrides.palette → palette (→ data-palette);
// overrides.font → font (→ data-font); overrides.primary → primary (→ CSS var inline en Wave 2).
// Cada valor se ACOTA/NORMALIZA acá: ningún string del config llega crudo a un atributo data-*
// ni a una CSS var. Fallback (D8-03, cero regresión): con landingTheme ausente/null se resuelve
// 100% desde businesses.* — un negocio legacy ve EXACTAMENTE lo de hoy.
export function resolveLandingTheme(
  landingTheme: LandingTheme | null | undefined,
  fallback: ThemeFallback,
): ResolvedTheme {
  // preset desconocido/ausente → normalizeTheme degrada a 'forjo' (defensivo, D8-02). El theme
  // resuelto manda sobre la palette default y sobre el set de palettes/fonts permitidos.
  const theme = normalizeTheme(landingTheme?.preset ?? fallback.theme)

  const overrides = landingTheme?.overrides

  // palette: override acotado al set del theme; sin override → la del fallback (también acotada).
  // Un override inexistente cae al default del theme (normalizePalette), no rompe.
  const palette = normalizePalette(theme, overrides?.palette ?? fallback.palette)

  // font: override normalizado. SIN override, la fuente sale del THEME, no del negocio.
  //
  // POR QUÉ NO cae a fallback.font cuando hay landing (bug real): `businesses.font` es la fuente
  // del PANEL. Heredarla acá le PISABA al theme del landing su tipografía de diseño — elegías
  // "Cyber" (Orbitron) y seguías viendo la Archivo del panel. El editor encima mostraba
  // "Automática · Según estilo" seleccionada, o sea que decía una cosa y renderizaba otra.
  // Ahora, con landing: sin override → 'auto' → PaletteScript NO emite data-font → manda el
  // --font-heading que define el theme en themes.css. Eso es lo que "Automática" promete.
  //
  // El fallback SIGUE vivo para el caso LEGACY (landingTheme ausente: negocio sin landing, que
  // renderiza la página de reservas de siempre). Ahí la fuente del panel es la correcta y sacarla
  // sería una regresión visible (D8-03).
  const font = landingTheme
    ? normalizeFont(overrides?.font)
    : normalizeFont(fallback.font)

  // primary: SOLO si pasa la allowlist de hex (isSafeColor). En cualquier otro caso → undefined.
  // Nunca propagamos un color sin validar (T-08-01).
  const primary = isSafeColor(overrides?.primary) ? overrides!.primary : undefined

  // mode: solo del config. NO cae al negocio: businesses no tiene un modo claro/oscuro persistido
  // (eso es preferencia del usuario del panel, no del negocio).
  const mode = normalizeMode(overrides?.mode)

  return { theme, palette, font, primary, mode }
}

// ── normalizeMotion: resolución del nivel de motion (F12, MOTION-01/D-04) ──────────
// POR QUÉ vive acá y no en el parse: espejo EXACTO de la filosofía de normalizeTheme — el
// default de un config nuevo es de AUTORÍA, no de render. La skill (Phase 11) setea
// `motion: 'subtle'` EXPLÍCITO al crear/reescribir una landing; `parseLandingConfig` NUNCA
// inyecta un default de motion (D-04). Por eso el render NORMALIZA el valor leído acá y
// degrada defensivamente: un config existente SIN `motion` (o con valor inválido/'none') →
// 'none' → render estático byte-idéntico a hoy (cero regresión para landings ya publicadas).
// Función PURA (regla del módulo: SIN React, SIN Supabase), named export.
export function normalizeMotion(raw: unknown): 'none' | 'subtle' | 'premium' {
  return raw === 'subtle' || raw === 'premium' ? raw : 'none'
}
