import { z } from 'zod'
import {
  landingConfigSchema,
  SECTION_TYPES,
  heroDataStrict,
  aboutDataStrict,
  servicesDataStrict,
  galleryDataStrict,
  locationDataStrict,
  hoursDataStrict,
  ctaDataStrict,
  rsvDataStrict,
  type LandingConfig,
} from '@/lib/landing/schema'

// ── Validador ESTRICTO de escritura del landing_config (reject-on-invalid, D-03) ──────────────────
//
// POR QUÉ un validador NUEVO y no `parseLandingConfig` (D-03b): son DOS contratos distintos.
//   - `parseLandingConfig` es el contrato de RENDER: ante un input presente-pero-inválido COACCIONA
//     a `DEFAULT_LANDING_CONFIG` (la landing de 2 secciones) para que `/[slug]` nunca 500ee. Eso está
//     bien al LEER, pero al ESCRIBIR sobrescribiría el config real del dueño con el default → viola SC1
//     (perdés theme/sections reales sin darte cuenta). Por eso acá NO se reusa.
//   - Este módulo es el contrato de ESCRITURA: un config inválido se RECHAZA (`invalid_config`), la
//     Server Action retorna antes del `.update` y no toca la fila. Nunca se persiste un default silencioso.
//
// Módulo PURO a propósito (SIN 'use server'): así es importable en Vitest (una 'use server' se marca
// como endpoint y no se puede unit-testear) — mismo motivo que _crm-actions.schemas.ts.
//
// ── T-15-16: el `data` de cada sección TAMBIÉN se valida acá (antes se persistía verbatim) ─────────
// El envelope (`landingConfigSchema`) es un `z.object` de Zod v4 que estripa las claves desconocidas,
// pero su `data` es `z.unknown()` — o sea que la promesa de "un payload con campos extra queda limpio
// antes de tocar la DB" era FALSA justamente para la mayor parte del payload. Era la RAÍZ de clase del
// XSS de `map_url` (CR-02): la allowlist de protocolo vivía SOLO en el render, así que un sink nuevo
// (un export, un mail, un endpoint del agente que leyera el config sin parsearlo) reabría el agujero
// sin tocar una línea del CMS. Ahora un `javascript:` NI SIQUIERA LLEGA A LA DB.
//
// Por qué se usan las variantes `xxxDataStrict` y NO los esquemas de sección del render: esos llevan
// `.catch({})` colgado, así que un `data` inválido safe-parsearía con ÉXITO devolviendo `{}` → el dueño
// perdería la sección entera EN SILENCIO. Peor que el bug. Acá un `data` con la forma equivocada
// RECHAZA el config completo (`invalid_config`) y el dueño ve un error.
export const SECTION_DATA_SCHEMAS: Record<(typeof SECTION_TYPES)[number], z.ZodType> = {
  hero: heroDataStrict,
  about: aboutDataStrict,
  services: servicesDataStrict,
  gallery: galleryDataStrict,
  location: locationDataStrict,
  // hours no tiene esquema de render (deriva de time_blocks); su contrato de escritura es `title?`
  // y nada más — exactamente lo que lee hours.tsx y lo que puede emitir builder.ts (ver schema.ts).
  hours: hoursDataStrict,
  cta: ctaDataStrict,
  // booking → rsvData: el `data` de la sección booking es el copy/fotos del strip RSV (F12, D-03b);
  // el widget de reserva en sí es caja negra y no lee config. El `title` que traen algunos configs
  // viejos ahí adentro es DATO MUERTO (rsvData no lo tiene y el renderer ya lo ignora hoy):
  // estriparlo no pierde nada visible.
  booking: rsvDataStrict,
}

// FAIL-CLOSED por type-check: el Record es EXHAUSTIVO sobre SECTION_TYPES. Si mañana alguien agrega
// un tipo de sección al enum y se olvida de mapearlo acá, esto NO COMPILA — en vez de dejar pasar su
// `data` verbatim, que sería volver exactamente al bug que este módulo cierra.

// Tope de tamaño del config serializado (DoS auto-infligido, T-15-16). `/[slug]` es force-dynamic:
// lee el config en CADA request, así que un jsonb inflado se paga en cada visita. El config real de
// producción pesa ~2,4 KB → 256 KB deja 100× de margen y ningún dueño real lo va a tocar.
// Se mide en BYTES UTF-8 (TextEncoder), no en .length (chars UTF-16): los acentos y emojis del copy
// pesan más de un byte en la DB.
export const MAX_CONFIG_BYTES = 256 * 1024

export type WriteError = 'invalid_config' | 'config_too_large'

export function parseLandingConfigForWrite(
  input: unknown
): { ok: true; data: LandingConfig } | { ok: false; error: WriteError } {
  // 1. El sobre: theme + sections + motion. Estripa las claves desconocidas de ESTE nivel.
  const r = landingConfigSchema.safeParse(input)
  if (!r.success) return { ok: false, error: 'invalid_config' }

  // 2. El `data` de CADA sección, contra el esquema de SU tipo. Se escribe el resultado PARSEADO
  //    (no el crudo): recién ahora es verdad que las claves desconocidas quedan estripadas.
  const sections: LandingConfig['sections'] = []
  for (const { data, ...section } of r.data.sections) {
    // Sección sin data (el `hours` del config real de prod, p.ej.): se preserva tal cual. `null` se
    // trata igual que ausente a propósito — es inerte (ningún componente lo distingue de undefined)
    // y rechazarlo dejaría sin poder guardar a cualquier config que lo tuviera.
    if (data === undefined || data === null) {
      sections.push(section)
      continue
    }
    const parsedData = SECTION_DATA_SCHEMAS[section.type].safeParse(data)
    // reject-on-invalid, NUNCA degradar a {}: un `data` con la forma equivocada (un string donde va
    // un objeto, un número donde va un array de URLs, un `javascript:` en map_url) rechaza el config
    // entero y el dueño ve el error. Degradarlo en silencio le borraría la sección.
    if (!parsedData.success) return { ok: false, error: 'invalid_config' }
    sections.push({ ...section, data: parsedData.data })
  }

  const parsed: LandingConfig = { ...r.data, sections }

  // 3. Tope de tamaño, sobre el config YA NORMALIZADO (lo que realmente se va a persistir).
  if (new TextEncoder().encode(JSON.stringify(parsed)).length > MAX_CONFIG_BYTES) {
    return { ok: false, error: 'config_too_large' }
  }

  return { ok: true, data: parsed }
}
