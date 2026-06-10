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

// ── MercadoPago Connect (OAuth) ──────────────────────────────────────────────
// El negocio conecta su cuenta de MP con un botón; recibimos su access_token sin que copie
// nada. Usa el client_id (APP_ID) + client_secret de la app de Forjo (env), no el del negocio.
const MP_AUTH_BASE = 'https://auth.mercadopago.com.ar/authorization'

export function mpConnectConfigured(): boolean {
  return !!(process.env.MP_CLIENT_ID && process.env.MP_CLIENT_SECRET)
}

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://gestion.forjo.studio').replace(/\/$/, '')
}

export function mpRedirectUri(): string {
  return `${appBaseUrl()}/api/mercadopago/callback`
}

export function buildMpAuthUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.MP_CLIENT_ID || '',
    response_type: 'code',
    platform_id: 'mp',
    redirect_uri: mpRedirectUri(),
    state,
  })
  return `${MP_AUTH_BASE}?${p.toString()}`
}

export interface MpOAuthTokens {
  access_token?: string
  refresh_token?: string
  user_id?: number | string
  expires_in?: number
  public_key?: string
}

// Canjea el code del callback por las credenciales del negocio (access + refresh + user_id).
export async function exchangeMpCode(code: string): Promise<MpOAuthTokens | null> {
  const res = await fetch(`${MP_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: process.env.MP_CLIENT_ID || '',
      client_secret: process.env.MP_CLIENT_SECRET || '',
      grant_type: 'authorization_code',
      code,
      redirect_uri: mpRedirectUri(),
    }),
  })
  if (!res.ok) {
    console.error('[mp/oauth] exchangeCode falló:', res.status, await res.text().catch(() => ''))
    return null
  }
  return res.json()
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
