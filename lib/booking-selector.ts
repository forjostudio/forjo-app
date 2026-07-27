// ── EXTRA-B — orden de la tarjeta "Cualquiera" en el paso 2 del booking (Phase 11) ──────────────
// Función PURA: sin React ni DOM ni Supabase → testeable barata (test/booking-selector.test.ts) y
// reutilizable en el client. Traduce el setting por-negocio `businesses.public_selector_default`
// (enum 'any'|'choose', migr 061) a la ÚNICA palanca observable del paso 2: dónde se rendea la
// tarjeta "Cualquiera" respecto de la lista de profesionales capaces.
//
//   'first' = tarjeta "Cualquiera" ARRIBA de la lista (Phase 10 D-01, byte-idéntico a hoy → D-06).
//   'last'  = tarjeta "Cualquiera" DEBAJO de la lista de profesionales (profesionales primero → D-07).
//
// Fail-safe: SOLO 'choose' reordena. 'any', null, undefined y cualquier valor inesperado caen en
// 'first' (comportamiento actual, cero regresión). El CHECK de la 061 es la barrera real en DB; acá
// solo decidimos presentación — el servidor sigue siendo la autoridad de la asignación (D-08).

export type SelectorDefault = 'any' | 'choose'

export type AnyCardPlacement = 'first' | 'last'

export function anyCardPlacement(setting: string | null | undefined): AnyCardPlacement {
  return setting === 'choose' ? 'last' : 'first'
}
