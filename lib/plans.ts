export const PLANS = {
  basic: {
    name: 'Básico',
    max_agendas: 1,
    features: ['Reservas online', 'Panel de admin', 'Soporte 24hs'],
  },
  studio: {
    name: 'Estudio',
    max_agendas: 5,
    features: ['Todo lo del Básico', 'Soporte 12hs', 'Dominio propio opcional'],
  },
  pro: {
    name: 'Pro',
    max_agendas: 15,
    features: ['Todo lo del Estudio', 'Setup incluido', 'Dominio propio incluido'],
  },
} as const

export type PlanKey = keyof typeof PLANS

// "Agenda" = recurso reservable (profesional, cancha, box, sala). Es la métrica ÚNICA del plan;
// reemplaza a profesionales + sucursales. Sucursales: sin tope de plan.
// El PRECIO no vive acá: la fuente es price_ars (lib/subscription-plans.ts / tabla plan_prices),
// nunca un valor USD. Modo test: NEXT_PUBLIC_PLANS_UNLIMITED=true levanta el tope de agendas.
export function getPlanLimits(plan: string) {
  const base = PLANS[(plan as PlanKey)] ?? PLANS.basic
  if (process.env.NEXT_PUBLIC_PLANS_UNLIMITED === 'true') {
    return { ...base, max_agendas: 99 }
  }
  return base
}

export const UPGRADE_URL = 'https://forjo.studio/#servicios'
