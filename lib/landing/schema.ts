import { z } from 'zod'

// ── Schema de la landing config (envelope tolerante) ───────────────────────────
// Fuente de verdad del shape de `landing_config` (jsonb en businesses / public_businesses).
// La meta de este módulo es ser TOTAL y fail-safe: ningún input puede 500ear `/[slug]`.

// 7 secciones fijas + booking (D-04). El enum es el discriminador de section.type.
export const SECTION_TYPES = ['hero', 'about', 'services', 'gallery', 'location', 'hours', 'cta', 'booking'] as const

// z.object() en Zod v4 estripa por defecto las claves desconocidas (D-06): el config queda
// válido y forward-compatible sin .strict()/.passthrough().
const themeSchema = z.object({
  preset: z.string(),
  // ⚠ Zod v4: z.record exige DOS args (key, value). Un solo arg rompe el build (Pitfall 5).
  overrides: z.record(z.string(), z.string()).optional(),
})

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
