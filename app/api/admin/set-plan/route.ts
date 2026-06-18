import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPlanLimits } from '@/lib/plans'
import { logAudit } from '@/lib/audit'
import type { NextRequest } from 'next/server'

const VALID_PLANS = ['basic', 'studio', 'pro']
const VALID_STATUSES = ['trial', 'active', 'expired', 'cancelled', 'suspended']

// Compara el secreto admin en tiempo constante (hash-both-sides). Un `!==` directo
// filtra por timing cuántos bytes coinciden, permitiendo adivinar el secreto byte a
// byte; timingSafeEqual evita ese side-channel. Hasheamos ambos lados a SHA-256 (32
// bytes fijos) ANTES de comparar: así un header de longitud distinta no dispara el
// RangeError ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH (que devolvería 500) y tampoco se
// filtra la longitud real del secreto. Nulo/vacío de cualquier lado → false sin
// llamar a timingSafeEqual.
function adminSecretMatches(provided: string | null | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false
  const a = crypto.createHash('sha256').update(provided).digest()
  const b = crypto.createHash('sha256').update(expected).digest()
  return crypto.timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  // set-plan lo invoca un actor externo con el header `x-admin-secret` (header-only;
  // nunca por query string para no filtrarlo a logs/Referer). Comparación timing-safe.
  const secret = request.headers.get('x-admin-secret')
  if (!adminSecretMatches(secret, process.env.ADMIN_SECRET)) {
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

  // CR-01 (code review Phase 2): este path corre como service-role (la migración 032 NO lo
  // revierte) y antes no quedaba en auditoría. Toda mutación de plan/estado por este endpoint
  // externo se registra ahora con actor NULL = "Sistema" (no hay sesión; gateado por
  // x-admin-secret). Best-effort: logAudit no lanza si falla. suspended → risk 'alto' (igual que
  // la acción auditada del CRM); resto → 'medio'.
  if (plan || status) {
    await logAudit({
      actorId: null,
      action: status === 'suspended' ? 'business.suspend' : 'plan.change',
      targetType: 'business',
      targetId: businessId,
      businessId,
      risk: status === 'suspended' ? 'alto' : 'medio',
      metadata: { plan: plan ?? null, status: status ?? null, via: 'set-plan-route' },
    })
  }

  const limits = getPlanLimits(plan || 'basic')
  console.log(`[set-plan] ${business.name} → plan=${plan ?? '-'} status=${status ?? '-'} limits=${JSON.stringify(limits)}`)

  return Response.json({ ok: true, business: business.name, plan, status, limits })
}
