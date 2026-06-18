import { z } from 'zod'

// Schemas zod de las server actions del CRM, en un MÓDULO PURO (SIN 'use server') para poder
// importarlos desde un test node (Vitest) — las server actions no son importables en un test
// porque 'use server' las marca como endpoints. Las actions de _actions.ts importan estos schemas
// y hacen `.parse(input)` como segunda línea (tras requireAdmin), mitigando T-02-05 (tampering del
// input: plan/status/addon/monto fuera de rango llegan por POST directo sin pasar por la UI).

// Enum de planes y estados: se CALCAN de app/api/admin/set-plan/route.ts (única fuente del enum)
// para no divergir. 'suspended' ya fue sumado a VALID_STATUSES en Plan 01 (D-05).
export const VALID_PLANS = ['basic', 'studio', 'pro'] as const
export const VALID_STATUSES = ['trial', 'active', 'expired', 'cancelled', 'suspended'] as const

// Set FIJO de add-ons (D-08): solo estas dos columnas existen (migración 032). Nunca SMS.
export const ADDON_KEYS = ['has_web_custom', 'has_whatsapp'] as const

// businessId siempre es un uuid de la columna businesses.id — z.uuid() (zod 4) rechaza cualquier
// string que no sea uuid antes de tocar la DB.
const businessId = z.uuid()

// ── changePlan ──────────────────────────────────────────────────────────────────────────────
export const changePlanSchema = z.object({
  businessId,
  plan: z.enum(VALID_PLANS),
})

// ── suspend / reactivate (status) ─────────────────────────────────────────────────────────────
// Un solo schema para el set de estados; las actions de suspend/reactivate fijan el status server-side,
// pero exponemos el schema completo para validaciones de estado genéricas si hicieran falta.
export const setStatusSchema = z.object({
  businessId,
  status: z.enum(VALID_STATUSES),
})

// ── extendTrial ──────────────────────────────────────────────────────────────────────────────
// D-07: preset 7/14/30 días O fecha exacta (ISO). Al menos uno es obligatorio (refine).
export const extendTrialSchema = z
  .object({
    businessId,
    preset: z.enum(['7', '14', '30']).optional(),
    exactDate: z.iso.datetime().optional(),
  })
  .refine((d) => d.preset !== undefined || d.exactDate !== undefined, {
    message: 'preset_or_date_required',
  })

// ── toggleAddon ──────────────────────────────────────────────────────────────────────────────
export const toggleAddonSchema = z.object({
  businessId,
  addon: z.enum(ADDON_KEYS),
  value: z.boolean(),
})

// ── updatePlanPrice ──────────────────────────────────────────────────────────────────────────
// priceArs es un monto ARS entero >= 0 (D-04: edita plan_prices, NO toca MercadoPago).
export const updatePlanPriceSchema = z.object({
  planKey: z.enum(VALID_PLANS),
  priceArs: z.int().min(0),
})

// Tipos inferidos para tipar el input parseado en _actions.ts.
export type ChangePlanInput = z.infer<typeof changePlanSchema>
export type SetStatusInput = z.infer<typeof setStatusSchema>
export type ExtendTrialInput = z.infer<typeof extendTrialSchema>
export type ToggleAddonInput = z.infer<typeof toggleAddonSchema>
export type UpdatePlanPriceInput = z.infer<typeof updatePlanPriceSchema>
