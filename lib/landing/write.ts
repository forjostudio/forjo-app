import { landingConfigSchema, type LandingConfig } from '@/lib/landing/schema'

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
// Se escribe SOLO `r.data`: `landingConfigSchema` es un `z.object` de Zod v4 que ESTRIPA las claves
// desconocidas del envelope por default (sin `.strict`/`.passthrough`), así un payload con campos extra
// (re-abrir la fuga de secretos de v0.9) queda limpio antes de tocar la DB. El `motion` roto degrada a
// undefined vía su `.catch(undefined)` (permisivo per-campo, D-03c), no invalida el config entero.
export function parseLandingConfigForWrite(
  input: unknown
): { ok: true; data: LandingConfig } | { ok: false; error: 'invalid_config' } {
  const r = landingConfigSchema.safeParse(input)
  return r.success ? { ok: true, data: r.data } : { ok: false, error: 'invalid_config' }
}
