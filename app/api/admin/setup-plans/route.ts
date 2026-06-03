import { mpFetch, MP_MODE } from '@/lib/mercadopago'
import { SUBSCRIPTION_PLANS } from '@/lib/subscription-plans'
import type { NextRequest } from 'next/server'

const BACK_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://gestion.forjo.studio') + '/dashboard'
const SUFFIX = MP_MODE === 'test' ? '_TEST' : ''
const ENV_KEYS: Record<string, string> = {
  basic: `MP_PLAN_BASIC_ID${SUFFIX}`,
  studio: `MP_PLAN_STUDIO_ID${SUFFIX}`,
  pro: `MP_PLAN_PRO_ID${SUFFIX}`,
}

// One-time setup: creates the 3 preapproval plans in MercadoPago.
// Protected with ADMIN_SECRET. Returns the plan IDs to copy into Vercel env vars.
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret') || request.headers.get('x-admin-secret')
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: Record<string, unknown> = {}

  for (const [key, plan] of Object.entries(SUBSCRIPTION_PLANS)) {
    const res = await mpFetch('/preapproval_plan', {
      method: 'POST',
      body: JSON.stringify({
        reason: `Forjo Gestión — Plan ${plan.name}`,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: plan.price_ars,
          currency_id: 'ARS',
        },
        back_url: BACK_URL,
      }),
    })
    results[key] = res.id
      ? { id: res.id, env_var: ENV_KEYS[key], status: res.status }
      : { error: res.message || res, raw: res }
  }

  return Response.json({
    ok: true,
    mode: MP_MODE,
    message: `Planes creados en modo ${MP_MODE}. Copiá estos IDs en Vercel como variables de entorno y volvé a desplegar`,
    plans: results,
  })
}
