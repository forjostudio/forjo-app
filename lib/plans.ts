export const PLANS = {
  basic: {
    name: 'Básico',
    max_agendas: 1,
    features: ['Reservas online', 'Panel de admin', 'Soporte diario'],
  },
  studio: {
    name: 'Estudio',
    max_agendas: 5,
    features: ['Todo lo del Básico', 'Soporte diario', 'Web a medida incluida'],
  },
  pro: {
    name: 'Pro',
    max_agendas: 15,
    features: ['Todo lo del Estudio', 'Setup incluido'],
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

// El negocio de demo, en vivo: lo linkean el "Ver demo" del login y el upsell de /web. Una sola
// constante para que el día que cambie el slug no quede un link apuntando al viejo.
export const DEMO_URL = 'https://gestion.forjo.studio/forjo-barbers'

// Add-on "Web a medida": en el Básico se vende aparte; en Estudio y Pro viene incluida. En los dos
// casos la activa el admin desde el CRM (has_web_custom) — todavía no hay cobro automático.
export const WEB_CUSTOM_ADDON = {
  price_ars: 5000,
  demo_url: DEMO_URL,
} as const
