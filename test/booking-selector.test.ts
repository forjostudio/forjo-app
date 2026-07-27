import { describe, it, expect } from 'vitest'
import { anyCardPlacement } from '@/lib/booking-selector'

// ── Phase 11 EXTRA-B — test puro de lib/booking-selector.ts ────────────────────────
// Espeja test/staff-services.test.ts: describe/it/expect, import desde @/lib/..., SIN DOM
// ni React ni Supabase. Congela la semántica del orden de la tarjeta "Cualquiera" en el
// paso 2 del booking público (Opción A):
//   - 'choose'  → 'last'  (profesionales primero; "Cualquiera" debajo de la lista, D-07).
//   - todo lo demás → 'first' (tarjeta "Cualquiera" arriba, byte-idéntico a Phase 10, D-06).
// El fail-safe hacia 'first' cubre 'any', null, undefined y cualquier valor inesperado: solo
// 'choose' cambia el orden; el CHECK de la migr 061 es la barrera real en DB (D-08 intacto).

describe('anyCardPlacement', () => {
  it("'choose' → 'last' (profesionales primero, D-07)", () => {
    expect(anyCardPlacement('choose')).toBe('last')
  })

  it("'any' → 'first' (byte-idéntico a hoy, D-06)", () => {
    expect(anyCardPlacement('any')).toBe('first')
  })

  it("null → 'first' (default/legacy safety)", () => {
    expect(anyCardPlacement(null)).toBe('first')
  })

  it("undefined → 'first' (default/legacy safety)", () => {
    expect(anyCardPlacement(undefined)).toBe('first')
  })

  it("valor inesperado → 'first' (fail-safe: solo 'choose' reordena)", () => {
    expect(anyCardPlacement('cualquier_otro')).toBe('first')
  })
})
