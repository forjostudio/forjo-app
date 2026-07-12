import { z } from 'zod'

// ── Schema de la landing config (envelope tolerante) ───────────────────────────
// Fuente de verdad del shape de `landing_config` (jsonb en businesses / public_businesses).
// La meta de este módulo es ser TOTAL y fail-safe: ningún input puede 500ear `/[slug]`.

// 7 secciones fijas + booking (D-04). El enum es el discriminador de section.type.
export const SECTION_TYPES = ['hero', 'about', 'services', 'gallery', 'location', 'hours', 'cta', 'booking'] as const

// z.object() en Zod v4 estripa por defecto las claves desconocidas (D-06): el config queda
// válido y forward-compatible sin .strict()/.passthrough().
// F8 (D8-06): `preset` se mantiene como z.string() — NO un enum cerrado de THEME ids. Un preset
// desconocido NO debe invalidar todo el config; degrada a 'forjo' en la RESOLUCIÓN
// (resolveLandingTheme → normalizeTheme), no acá. `overrides` queda como record forward-compatible
// (mismo espíritu fail-safe que F7 usó con .catch por campo): la validación estricta de cada
// override (palette/font acotados al set permitido, primary por allowlist de hex) vive en
// lib/landing/theme.ts, NO en el envelope. Así un override roto no tira el config al DEFAULT.
const themeSchema = z.object({
  preset: z.string(),
  // ⚠ Zod v4: z.record exige DOS args (key, value). Un solo arg rompe el build (Pitfall 5).
  overrides: z.record(z.string(), z.string()).optional(),
})

// Tipo derivado del themeSchema (D-07, mismo patrón que LandingConfig): lo consume
// lib/landing/theme.ts para no duplicar el shape a mano. Forma: { preset: string;
// overrides?: Record<string, string> }. Los overrides CONOCIDOS (palette/font/primary) se leen
// por clave en resolveLandingTheme — el record forward-compatible no los cierra a propósito.
export type LandingTheme = z.infer<typeof themeSchema>

// `data` queda permisivo en esta fase (D-04): Phase 7 tipa el data de cada sección.
// No cerramos internals ahora.
const sectionSchema = z.object({
  type: z.enum(SECTION_TYPES),
  enabled: z.boolean(),
  order: z.number(),
  data: z.unknown().optional(),
})

export const landingConfigSchema = z.object({
  theme: themeSchema,
  sections: z.array(sectionSchema),
  // motion (F12, MOTION-01): nivel de movimiento premium data-driven del renderer.
  // .optional() SIN .default() → el default 'subtle' es de AUTORÍA (lo setea la skill al
  // escribir el config), NO de parse (D-04): un config existente sin `motion` renderiza
  // estático, byte-idéntico a hoy. El .catch(undefined) es OBLIGATORIO (fail-safe): sin él un
  // `motion` basura invalidaría el safeParse del envelope y tiraría TODO el config al
  // DEFAULT_LANDING_CONFIG, perdiendo theme/sections reales. Con .catch, un motion roto
  // degrada a undefined → normalizeMotion → 'none' (estático), preservando el resto.
  motion: z.enum(['none', 'subtle', 'premium']).optional().catch(undefined),
})

// Derivamos el tipo del schema (D-07) — no se escribe una interface a mano.
export type LandingConfig = z.infer<typeof landingConfigSchema>

// Fallback SOLO para input presente-pero-inválido (D-02). NO es lo que se renderiza en null
// (eso es legacy: un negocio que nunca optó por una landing → passthrough byte-idéntico, LAND-06).
export const DEFAULT_LANDING_CONFIG: LandingConfig = {
  theme: { preset: 'default' },
  sections: [
    { type: 'hero', enabled: true, order: 0 },
    { type: 'booking', enabled: true, order: 1 },
  ],
}

// Contrato D-03. Las DOS rutas de fallback en una sola función total:
// 1) null/undefined → null PRIMERO (la invariante sutil del milestone, Pitfall 4): es la
//    señal de "negocio legacy, renderizá igual que hoy", NO el DEFAULT.
// 2) presente-pero-inválido → DEFAULT_LANDING_CONFIG (CFG-03): cualquier falla tira el config
//    entero al default (granularidad whole-config, D-05; sin rescate por-sección en esta fase).
// Usar SOLO safeParse — un .parse() throw 500earía `/[slug]` y violaría CFG-03 (Pitfall 2).
export function parseLandingConfig(raw: unknown): LandingConfig | null {
  if (raw === null || raw === undefined) return null
  const result = landingConfigSchema.safeParse(raw)
  return result.success ? result.data : DEFAULT_LANDING_CONFIG
}

// ── Tipos `data` por sección (Phase 7, D7-Discretion) ────────────────────────────
// El envelope de arriba (sectionSchema.data = z.unknown().optional()) queda PERMISIVO a
// propósito: cerrarlo con discriminatedUnion re-introduciría el riesgo de que un `data`
// roto tire TODO el config al DEFAULT (whole-config fallback, D-05). En cambio, cada sección
// parsea SU `data` con estos esquemas DENTRO del componente. Todos llevan `.catch({})`:
// si el data está malformado → devuelve `{}` → la sección usa sus fallbacks (o se oculta),
// NUNCA tira ni cierra el envelope F6. Defensa por-sección, no por-config.
// booking NO lee data; Hours deriva solo de time_blocks → ninguno tiene esquema acá.

export const heroData = z
  .object({
    headline: z.string().optional(),
    // kicker: eyebrow editorial del hero (ej. la ciudad/zona del negocio). Reemplaza al rubro
    // genérico; la skill lo puebla con la ciudad y la saca del headline.
    kicker: z.string().optional(),
    subhead: z.string().optional(),
    image: z.string().url().optional(),
    cta_label: z.string().optional(),

    // ── Ajustes de PRESENTACIÓN del hero (editables desde el CMS) ──────────────────────
    // POR QUÉ .catch(undefined) EN CADA CAMPO y no alcanza el .catch({}) del objeto: ese catch
    // es whole-object — un solo número basura tiraría TODO el heroData a {} y el dueño perdería
    // headline/kicker/subhead/image de una. Con el catch por campo, un valor roto degrada SOLO
    // ese ajuste a su default y el copy sobrevive.
    // Ausente = el look de hoy (opacidad 100, escala 100) ⇒ cero regresión en configs existentes.

    // Opacidad de la foto de portada, 0-100 (100 = foto a full). ACOTADO a propósito: el hero
    // garantiza contraste AA del texto vía el scrim (D7-03); dejar el rango libre permitiría
    // fondos ilegibles.
    image_opacity: z.number().int().min(0).max(100).optional().catch(undefined),

    // Tamaño de cada texto del hero en % (100 = el de hoy). Se aplica como MULTIPLICADOR sobre
    // el clamp() responsive de cada uno — no como px fijos — para no romper el escalado por
    // viewport. Acotado 70-160: fuera de ese rango el bloque editorial desborda o desaparece.
    headline_scale: z.number().int().min(70).max(160).optional().catch(undefined),
    kicker_scale: z.number().int().min(70).max(160).optional().catch(undefined),
    subhead_scale: z.number().int().min(70).max(160).optional().catch(undefined),
  })
  .catch({})
export type HeroData = z.infer<typeof heroData>

export const aboutData = z
  .object({
    title: z.string().optional(),
    body: z.string().optional(),
    image: z.string().url().optional(),
  })
  .catch({})
export type AboutData = z.infer<typeof aboutData>

// La LISTA de servicios viene de la tabla `services` (D7-06): el data solo aporta título/subtítulo.
export const servicesData = z
  .object({
    title: z.string().optional(),
    subtitle: z.string().optional(),
  })
  .catch({})
export type ServicesData = z.infer<typeof servicesData>

export const galleryData = z
  .object({
    title: z.string().optional(),
    images: z.array(z.string().url()).optional(),
  })
  .catch({})
export type GalleryData = z.infer<typeof galleryData>

// Data de la galería de la RESERVA (F12, RSV — la CONSUME el Plan 02). Campo dedicado, NO
// reusa `galleryData` (D-03b: fotos de confianza de la sucursal/ambiente ANTES de reservar).
// Espejo VERBATIM del patrón de galleryData: z.object({...}).catch({}) — un data roto degrada
// a {} → empty-state (RSV-01, la sección booking queda byte-idéntica a hoy). NO usar record
// dinámico (Pitfall 4 / Zod v4 exige 2 args). `images` con z.string().url() (control V5 input
// validation): evita renderizar URL no-http en el Plan 02 — una url inválida invalida el
// objeto entero → {} (el .catch({}) lo captura).
export const rsvData = z
  .object({
    header: z.string().optional(),
    intro: z.string().optional(),
    images: z.array(z.string().url()).optional(),
  })
  .catch({})
export type RsvData = z.infer<typeof rsvData>

// Las locations vienen de la tabla (D7-06); map_url/show_address vienen del config (Assumption A2).
export const locationData = z
  .object({
    title: z.string().optional(),
    map_url: z.string().url().optional(),
    show_address: z.boolean().optional(),
  })
  .catch({})
export type LocationData = z.infer<typeof locationData>

// ⚠ SEGURIDAD — por qué NO alcanza z.string().url() para el href de un botón.
// `z.url()` valida que el string PARSEE como URL, y `javascript:alert(1)` parsea perfecto. En una
// imagen daba igual (un src javascript: no ejecuta), pero estos valores van a un <a href> del sitio
// PÚBLICO: un href javascript: es XSS directo, y el dueño de un negocio podría pegarlo sin saber
// lo que hace (o alguien podría inyectarlo si mañana se abre otro camino de escritura).
// Acá acotamos por PROTOCOLO con una allowlist (http/https), que es la única defensa que sirve.
// Mismo espíritu que isSafeColor con los hex.
const safeLinkUrl = z.string().refine(
  (v) => {
    try {
      const u = new URL(v)
      return u.protocol === 'https:' || u.protocol === 'http:'
    } catch {
      return false
    }
  },
  { message: 'La URL debe empezar con https://' },
)

// Botón extra del CTA (ej. Instagram, la carta, cómo llegar). Label + destino externo.
const ctaLink = z.object({
  label: z.string().min(1),
  url: safeLinkUrl,
})
export type CtaLink = z.infer<typeof ctaLink>

export const ctaData = z
  .object({
    headline: z.string().optional(),
    // Texto del botón que ancla a la reserva (#reservar). Ausente → 'Reservar turno'.
    primary_label: z.string().optional(),
    // Botones extra, en orden. Tope 3: el CTA tiene UN objetivo (reservar) y llenarlo de botones
    // compite con él. El de WhatsApp NO se cuenta acá — sale solo de businesses.whatsapp.
    //
    // El preprocess FILTRA los ítems inválidos en vez de dejar caer el array entero. La diferencia
    // importa en el editor: sin esto, apenas tocás "Agregar botón" nace un ítem vacío (inválido) →
    // el array falla → el .catch lo tira a undefined → los botones que YA tenías cargados
    // DESAPARECEN del preview mientras tipeás. Con el filtro, el botón a medio escribir simplemente
    // todavía no se muestra, y los válidos siguen ahí. En el render público hace lo mismo con un
    // link corrupto: se cae ese, no todos.
    links: z
      .preprocess(
        (v) => (Array.isArray(v) ? v.filter((x) => ctaLink.safeParse(x).success) : v),
        z.array(ctaLink).max(3).optional(),
      )
      .catch(undefined),
  })
  .catch({})
export type CtaData = z.infer<typeof ctaData>
