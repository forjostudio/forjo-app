import { getMPPlanId } from '@/lib/mercadopago'

export const SUBSCRIPTION_PLANS = {
  basic: {
    name: 'Básico',
    price_ars: 15000,
    price_usd_ref: 12,
    get mp_plan_id() { return getMPPlanId('basic') },
    recommended: false,
  },
  studio: {
    name: 'Estudio',
    price_ars: 30000,
    price_usd_ref: 25,
    get mp_plan_id() { return getMPPlanId('studio') },
    recommended: true,
  },
  pro: {
    name: 'Pro',
    price_ars: 50000,
    price_usd_ref: 40,
    get mp_plan_id() { return getMPPlanId('pro') },
    recommended: false,
  },
} as const

export type SubscriptionPlanKey = keyof typeof SUBSCRIPTION_PLANS

export function getSubscriptionPlan(plan: string) {
  return SUBSCRIPTION_PLANS[plan as SubscriptionPlanKey] ?? SUBSCRIPTION_PLANS.basic
}

export const MP_API = 'https://api.mercadopago.com'
export const FORJO_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://gestion.forjo.studio'
