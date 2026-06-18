'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-guard'
import { logAudit } from '@/lib/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTrialEndsAt } from '@/lib/crm-metrics'
import {
  changePlanSchema,
  setStatusSchema,
  extendTrialSchema,
  toggleAddonSchema,
  updatePlanPriceSchema,
} from './_actions.schemas'

// ── Server Actions del CRM super-admin (Phase 2) ──────────────────────────────────────────────
//
// Toda escritura sensible de la fase vive detrás de estas actions. Patrón OBLIGATORIO por action
// (mismo orden siempre):
//   1) const actor = await requireAdmin()   ← PRIMERA línea (Pitfall 2 / T-02-04). Una action es un
//      endpoint POST invocable directo (curl, devtools) SIN pasar por el ConfirmDialog ni el layout;
//      el guard del layout NO la protege. requireAdmin() LANZA si no es admin.
//   2) const data = <schema>.parse(input)    ← T-02-05: input no confiable, validado antes de mutar.
//   3) createAdminClient() (service-role) + leer estado previo si el audit necesita {from,to}.
//   4) admin.from(...).update(...) → si error, throw new Error('update_failed').
//   5) await logAudit({...}) con el action code EXACTO que reconoce el visor (auditoria-client.tsx).
//   6) revalidatePath(...) del path afectado (la ficha y/o el dashboard del operador).
//
// Action codes reconocidos por el visor (NO inventar otros): plan.change, business.suspend,
// business.reactivate, trial.extend, addon.toggle, plan.price_edit.

// Path de la ficha del negocio (Plan 03/04 la construye). Literal, sin type='page' (no es patrón
// con segmento dinámico [id]: pasamos el id resuelto, no '/admin/negocios/[id]').
function fichaPath(businessId: string): string {
  return `/admin/negocios/${businessId}`
}

// Etiquetas legibles de cada add-on para el metadata del audit (nunca SMS — D-08).
const ADDON_LABELS: Record<string, string> = {
  has_web_custom: 'Web a medida',
  has_whatsapp: 'Recordatorios WhatsApp',
}

// ── changePlan ────────────────────────────────────────────────────────────────────────────────
// Cambia businesses.plan. MRR depende del plan → revalida también el dashboard del operador.
export async function changePlan(input: unknown): Promise<void> {
  const actor = await requireAdmin()
  const data = changePlanSchema.parse(input)
  const admin = createAdminClient()

  // Estado previo para metadata {from,to} del audit.
  const { data: prev } = await admin.from('businesses').select('plan').eq('id', data.businessId).single()

  const { error } = await admin.from('businesses').update({ plan: data.plan }).eq('id', data.businessId)
  if (error) throw new Error('update_failed')

  await logAudit({
    actorId: actor.id,
    action: 'plan.change',
    targetType: 'business',
    targetId: data.businessId,
    businessId: data.businessId,
    risk: 'medio',
    metadata: { from: prev?.plan ?? null, to: data.plan },
  })

  revalidatePath(fichaPath(data.businessId))
  revalidatePath('/admin')
}

// ── suspendBusiness ──────────────────────────────────────────────────────────────────────────
// Pone plan_status='suspended'. D-06: el corte REAL (booking 403 + dashboard bloqueado) vive en
// Task 3; acá solo se setea el estado. Riesgo ALTO (deja al negocio sin operar).
export async function suspendBusiness(input: unknown): Promise<void> {
  const actor = await requireAdmin()
  const data = setStatusSchema.pick({ businessId: true }).parse(input)
  const admin = createAdminClient()

  const { error } = await admin
    .from('businesses')
    .update({ plan_status: 'suspended' })
    .eq('id', data.businessId)
  if (error) throw new Error('update_failed')

  await logAudit({
    actorId: actor.id,
    action: 'business.suspend',
    targetType: 'business',
    targetId: data.businessId,
    businessId: data.businessId,
    risk: 'alto',
  })

  revalidatePath(fichaPath(data.businessId))
  revalidatePath('/admin')
}

// ── reactivateBusiness ─────────────────────────────────────────────────────────────────────────
// Pone plan_status='active'. Replica la lógica de set-plan/route.ts: al pasar a 'active',
// trial_ends_at = null (el trial dejó de aplicar; ya es un negocio pago).
export async function reactivateBusiness(input: unknown): Promise<void> {
  const actor = await requireAdmin()
  const data = setStatusSchema.pick({ businessId: true }).parse(input)
  const admin = createAdminClient()

  const { error } = await admin
    .from('businesses')
    .update({ plan_status: 'active', trial_ends_at: null })
    .eq('id', data.businessId)
  if (error) throw new Error('update_failed')

  await logAudit({
    actorId: actor.id,
    action: 'business.reactivate',
    targetType: 'business',
    targetId: data.businessId,
    businessId: data.businessId,
    risk: 'medio',
  })

  revalidatePath(fichaPath(data.businessId))
  revalidatePath('/admin')
}

// ── extendTrial ────────────────────────────────────────────────────────────────────────────────
// D-07: presets 7/14/30 días o fecha exacta. Resuelve la nueva fecha con resolveTrialEndsAt (Plan 01)
// y actualiza ÚNICAMENTE trial_ends_at. NO muta plan_status: extender un trial nunca reactiva ni
// cambia el estado del negocio (un negocio suspended sigue suspended aunque se le extienda el trial).
export async function extendTrial(input: unknown): Promise<void> {
  const actor = await requireAdmin()
  const data = extendTrialSchema.parse(input)
  const admin = createAdminClient()

  // Leer el fin de trial vigente: el preset EXTIENDE desde esa fecha (si aún es futura), no desde hoy.
  const { data: prev } = await admin
    .from('businesses')
    .select('trial_ends_at')
    .eq('id', data.businessId)
    .single()
  const newEndsAt = resolveTrialEndsAt(
    { preset: data.preset, exactDate: data.exactDate },
    new Date(),
    prev?.trial_ends_at ?? null,
  )

  const { error } = await admin
    .from('businesses')
    .update({ trial_ends_at: newEndsAt })
    .eq('id', data.businessId)
  if (error) throw new Error('update_failed')

  await logAudit({
    actorId: actor.id,
    action: 'trial.extend',
    targetType: 'business',
    targetId: data.businessId,
    businessId: data.businessId,
    risk: 'bajo',
    metadata: { newEndsAt, preset: data.preset ?? null, exactDate: data.exactDate ?? null },
  })

  revalidatePath(fichaPath(data.businessId))
  revalidatePath('/admin')
}

// ── toggleAddon ────────────────────────────────────────────────────────────────────────────────
// Setea businesses.has_web_custom / has_whatsapp (set fijo, D-08). El service-role bypassa el trigger
// businesses_protect_admin_columns (Plan 01) que impide al dueño tocar estas columnas.
export async function toggleAddon(input: unknown): Promise<void> {
  const actor = await requireAdmin()
  const data = toggleAddonSchema.parse(input)
  const admin = createAdminClient()

  const { error } = await admin
    .from('businesses')
    .update({ [data.addon]: data.value })
    .eq('id', data.businessId)
  if (error) throw new Error('update_failed')

  await logAudit({
    actorId: actor.id,
    action: 'addon.toggle',
    targetType: 'business',
    targetId: data.businessId,
    businessId: data.businessId,
    risk: 'bajo',
    metadata: { addon: data.addon, label: ADDON_LABELS[data.addon], value: data.value },
  })

  revalidatePath(fichaPath(data.businessId))
}

// ── updatePlanPrice ────────────────────────────────────────────────────────────────────────────
// D-04: edita plan_prices.price_ars. NO crea preapprovals ni toca MercadoPago: el precio nuevo aplica
// a COBROS FUTUROS (nuevas suscripciones), no muta las suscripciones MP ya activas. Riesgo de negocio
// aceptado y documentado (T-02-08); el copy de la pantalla (Plan 04) lo avisa.
export async function updatePlanPrice(input: unknown): Promise<void> {
  const actor = await requireAdmin()
  const data = updatePlanPriceSchema.parse(input)
  const admin = createAdminClient()

  // Estado previo para metadata {from,to}.
  const { data: prev } = await admin
    .from('plan_prices')
    .select('price_ars')
    .eq('plan_key', data.planKey)
    .single()

  const { error } = await admin
    .from('plan_prices')
    .update({ price_ars: data.priceArs, updated_at: new Date().toISOString(), updated_by: actor.id })
    .eq('plan_key', data.planKey)
  if (error) throw new Error('update_failed')

  await logAudit({
    actorId: actor.id,
    action: 'plan.price_edit',
    targetType: 'plan_price',
    targetId: data.planKey,
    risk: 'medio',
    metadata: { planKey: data.planKey, from: prev?.price_ars ?? null, to: data.priceArs },
  })

  revalidatePath('/admin/planes')
  revalidatePath('/admin')
}
