export const PLANS = {
  basic: {
    name: 'Básico',
    price_usd: 12,
    max_professionals: 1,
    max_locations: 1,
    features: ['Reservas online', 'Panel de admin', 'Soporte 24hs'],
  },
  studio: {
    name: 'Estudio',
    price_usd: 25,
    max_professionals: 5,
    max_locations: 3,
    features: ['Todo lo del Básico', 'Soporte 12hs', 'Dominio propio opcional'],
  },
  pro: {
    name: 'Pro',
    price_usd: 40,
    max_professionals: 15,
    max_locations: 10,
    features: ['Todo lo del Estudio', 'Setup incluido', 'Dominio propio incluido'],
  },
} as const

export type PlanKey = keyof typeof PLANS

// Modo test: con NEXT_PUBLIC_PLANS_UNLIMITED=true se levantan los topes (consultorios y
// profesionales) para poder probar features multi-consultorio sin cambiar el pricing real.
export function getPlanLimits(plan: string) {
  const base = PLANS[(plan as PlanKey)] ?? PLANS.basic
  if (process.env.NEXT_PUBLIC_PLANS_UNLIMITED === 'true') {
    return { ...base, max_professionals: 99, max_locations: 99 }
  }
  return base
}

export const UPGRADE_URL = 'https://forjo.studio/#servicios'
