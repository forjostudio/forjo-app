import { createAdminClient } from '@/lib/supabase/admin'
import { getPlanLimits } from '@/lib/plans'
import type { NextRequest } from 'next/server'

const VALID_PLANS = ['basic', 'studio', 'pro']
const VALID_STATUSES = ['trial', 'active', 'expired', 'cancelled']

export async function POST(request: NextRequest) {
  // Authenticate with admin secret — will be called by Stripe webhook
  const secret = request.headers.get('x-admin-secret')
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { businessId?: string; plan?: string; status?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { businessId, plan, status } = body

  if (!businessId) return Response.json({ error: 'businessId requerido' }, { status: 400 })
  if (plan && !VALID_PLANS.includes(plan)) return Response.json({ error: 'plan inválido' }, { status: 400 })
  if (status && !VALID_STATUSES.includes(status)) return Response.json({ error: 'status inválido' }, { status: 400 })

  const supabase = createAdminClient()

  // Verify business exists
  const { data: business } = await supabase.from('businesses').select('id, name').eq('id', businessId).single()
  if (!business) return Response.json({ error: 'Negocio no encontrado' }, { status: 404 })

  const update: Record<string, string | null> = {}
  if (plan) update.plan = plan
  if (status) {
    update.plan_status = status
    if (status === 'active') update.trial_ends_at = null
  }

  const { error } = await supabase.from('businesses').update(update).eq('id', businessId)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const limits = getPlanLimits(plan || 'basic')
  console.log(`[set-plan] ${business.name} → plan=${plan ?? '-'} status=${status ?? '-'} limits=${JSON.stringify(limits)}`)

  return Response.json({ ok: true, business: business.name, plan, status, limits })
}
