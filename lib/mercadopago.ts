export const MP_API = 'https://api.mercadopago.com'

// Sandbox switch: 'test' uses the test credentials and test plan IDs,
// 'production' uses the real ones. Defaults to production for safety.
export const MP_MODE = process.env.MP_MODE === 'test' ? 'test' : 'production'

export function isMPTestMode(): boolean {
  return MP_MODE === 'test'
}

// Always uses the Forjo platform token (never the client business token).
export function getMPAccessToken(): string {
  if (MP_MODE === 'test') {
    return process.env.MP_FORJO_ACCESS_TOKEN_TEST || ''
  }
  return process.env.MP_FORJO_ACCESS_TOKEN || ''
}

// Secret used to validate the x-signature header MercadoPago sends on webhooks.
// Per MP_MODE so test and production notifications validate against their own secret.
export function getMPWebhookSecret(): string {
  if (MP_MODE === 'test') {
    return process.env.MP_WEBHOOK_SECRET_TEST || ''
  }
  return process.env.MP_WEBHOOK_SECRET || ''
}

export function getMPPlanId(plan: 'basic' | 'studio' | 'pro'): string | null {
  if (MP_MODE === 'test') {
    return {
      basic: process.env.MP_PLAN_BASIC_ID_TEST,
      studio: process.env.MP_PLAN_STUDIO_ID_TEST,
      pro: process.env.MP_PLAN_PRO_ID_TEST,
    }[plan] || null
  }
  return {
    basic: process.env.MP_PLAN_BASIC_ID,
    studio: process.env.MP_PLAN_STUDIO_ID,
    pro: process.env.MP_PLAN_PRO_ID,
  }[plan] || null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function mpFetch(path: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${MP_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getMPAccessToken()}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  return res.json()
}
