import crypto from 'crypto'
import type { NextRequest } from 'next/server'

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

// Validates the x-signature header MercadoPago sends with every webhook. Without
// this, anyone who discovers the URL could POST a forged event and flip a business
// to 'active' without paying. Algorithm (per MP docs):
//   manifest = "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"  (omit absent parts)
//   HMAC-SHA256(manifest, secret) must equal the v1 value inside x-signature.
// Respects MP_MODE through getMPWebhookSecret(). Fails closed if the secret is unset.
export function verifyMPSignature(request: NextRequest, dataId: string | null | undefined): boolean {
  const secret = getMPWebhookSecret()
  if (!secret) {
    console.error('MP_WEBHOOK_SECRET no configurado — webhook rechazado')
    return false
  }

  const signature = request.headers.get('x-signature')
  const requestId = request.headers.get('x-request-id')
  if (!signature) return false

  // x-signature: "ts=<unix>,v1=<hex hmac>"
  let ts: string | undefined
  let v1: string | undefined
  for (const part of signature.split(',')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const key = part.slice(0, idx).trim()
    const val = part.slice(idx + 1).trim()
    if (key === 'ts') ts = val
    else if (key === 'v1') v1 = val
  }
  if (!ts || !v1) return false

  // data.id is lowercased when alphanumeric (no-op for numeric ids).
  const id = dataId ? String(dataId).toLowerCase() : undefined
  let manifest = ''
  if (id) manifest += `id:${id};`
  if (requestId) manifest += `request-id:${requestId};`
  manifest += `ts:${ts};`

  const computed = crypto.createHmac('sha256', secret).update(manifest).digest('hex')
  const a = Buffer.from(computed, 'hex')
  const b = Buffer.from(v1, 'hex')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
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
    // scope explícito (D-07): garantiza que MP emita refresh_token (raíz de este milestone; sin él el
    // refresh dependería de un grant default frágil). No altera negocios ya conectados (su token/refresh
    // ya existen); aplica a conexiones/reconexiones nuevas.
    scope: 'offline_access read write',
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

// Refresca el access_token con el refresh_token. MP ROTA el refresh_token en cada uso, así que
// el caller debe persistir el nuevo refresh_token que vuelve acá.
export async function refreshMpToken(refreshToken: string): Promise<MpOAuthTokens | null> {
  const res = await fetch(`${MP_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: process.env.MP_CLIENT_ID || '',
      client_secret: process.env.MP_CLIENT_SECRET || '',
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok) {
    console.error('[mp/oauth] refresh falló:', res.status, await res.text().catch(() => ''))
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
