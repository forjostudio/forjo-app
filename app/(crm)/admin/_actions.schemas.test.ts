import { describe, it, expect } from 'vitest'
import {
  changePlanSchema,
  setStatusSchema,
  extendTrialSchema,
  toggleAddonSchema,
  updatePlanPriceSchema,
  VALID_PLANS,
  VALID_STATUSES,
  ADDON_KEYS,
} from './_actions.schemas'

// UUID v4 válido de prueba (los schemas usan z.uuid()).
const UUID = '11111111-1111-4111-8111-111111111111'

// ── constantes exportadas ───────────────────────────────────────────────────────────────────
describe('constantes', () => {
  it('VALID_PLANS calca el enum de set-plan', () => {
    expect(VALID_PLANS).toEqual(['basic', 'studio', 'pro'])
  })
  it('VALID_STATUSES incluye suspended (D-05)', () => {
    expect(VALID_STATUSES).toEqual(['trial', 'active', 'expired', 'cancelled', 'suspended'])
  })
  it('ADDON_KEYS es el set fijo de add-ons (D-08, nunca SMS)', () => {
    expect(ADDON_KEYS).toEqual(['has_web_custom', 'has_whatsapp'])
  })
})

// ── changePlanSchema ────────────────────────────────────────────────────────────────────────
describe('changePlanSchema', () => {
  it('acepta plan dentro del enum + businessId uuid', () => {
    expect(changePlanSchema.safeParse({ businessId: UUID, plan: 'studio' }).success).toBe(true)
  })
  it('rechaza plan fuera del enum', () => {
    expect(changePlanSchema.safeParse({ businessId: UUID, plan: 'enterprise' }).success).toBe(false)
  })
  it('rechaza businessId no-uuid', () => {
    expect(changePlanSchema.safeParse({ businessId: 'abc', plan: 'basic' }).success).toBe(false)
  })
})

// ── setStatusSchema ─────────────────────────────────────────────────────────────────────────
describe('setStatusSchema', () => {
  it('acepta cada status válido', () => {
    for (const status of VALID_STATUSES) {
      expect(setStatusSchema.safeParse({ businessId: UUID, status }).success).toBe(true)
    }
  })
  it('rechaza status fuera del set', () => {
    expect(setStatusSchema.safeParse({ businessId: UUID, status: 'paused' }).success).toBe(false)
  })
})

// ── extendTrialSchema ───────────────────────────────────────────────────────────────────────
describe('extendTrialSchema', () => {
  it('acepta preset', () => {
    expect(extendTrialSchema.safeParse({ businessId: UUID, preset: '14' }).success).toBe(true)
  })
  it('acepta exactDate ISO', () => {
    expect(
      extendTrialSchema.safeParse({ businessId: UUID, exactDate: '2026-07-15T00:00:00.000Z' }).success
    ).toBe(true)
  })
  it('rechaza preset fuera del set', () => {
    expect(extendTrialSchema.safeParse({ businessId: UUID, preset: '90' }).success).toBe(false)
  })
  it('rechaza cuando faltan preset y exactDate (refine)', () => {
    const res = extendTrialSchema.safeParse({ businessId: UUID })
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(JSON.stringify(res.error)).toContain('preset_or_date_required')
    }
  })
})

// ── toggleAddonSchema ───────────────────────────────────────────────────────────────────────
describe('toggleAddonSchema', () => {
  it('acepta addon dentro del set fijo + value boolean', () => {
    expect(toggleAddonSchema.safeParse({ businessId: UUID, addon: 'has_whatsapp', value: true }).success).toBe(true)
    expect(toggleAddonSchema.safeParse({ businessId: UUID, addon: 'has_web_custom', value: false }).success).toBe(true)
  })
  it('rechaza addon fuera del set (D-08)', () => {
    expect(toggleAddonSchema.safeParse({ businessId: UUID, addon: 'has_sms', value: true }).success).toBe(false)
  })
  it('rechaza value no-boolean', () => {
    expect(toggleAddonSchema.safeParse({ businessId: UUID, addon: 'has_whatsapp', value: 'si' }).success).toBe(false)
  })
})

// ── updatePlanPriceSchema ───────────────────────────────────────────────────────────────────
describe('updatePlanPriceSchema', () => {
  it('acepta planKey + priceArs int >= 0', () => {
    expect(updatePlanPriceSchema.safeParse({ planKey: 'pro', priceArs: 50000 }).success).toBe(true)
    expect(updatePlanPriceSchema.safeParse({ planKey: 'basic', priceArs: 0 }).success).toBe(true)
  })
  it('rechaza priceArs negativo', () => {
    expect(updatePlanPriceSchema.safeParse({ planKey: 'basic', priceArs: -1 }).success).toBe(false)
  })
  it('rechaza priceArs no entero', () => {
    expect(updatePlanPriceSchema.safeParse({ planKey: 'basic', priceArs: 100.5 }).success).toBe(false)
  })
  it('rechaza planKey fuera del enum', () => {
    expect(updatePlanPriceSchema.safeParse({ planKey: 'enterprise', priceArs: 1000 }).success).toBe(false)
  })
})
