'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-guard'
import { logAudit } from '@/lib/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  createDealSchema,
  moveStageSchema,
  markLostSchema,
  markWonSchema,
  convertLeadSchema,
  linkLeadOnSignupSchema,
} from './_crm-actions.schemas'

// ── Server Actions del pipeline / conversión (Phase 4, Plan 02) ───────────────────────────────────
//
// Patrón OBLIGATORIO por action (calcado VERBATIM de _actions.ts, mismo orden siempre):
//   1) const actor = await requireAdmin()   ← PRIMERA línea: una action es un endpoint POST invocable
//      directo (curl, devtools) SIN pasar por el ConfirmDialog ni el layout; el guard del layout NO la
//      protege (Pitfall 2 / T-04-07). requireAdmin() LANZA si no es admin. Su id es el actorId del audit.
//   2) const data = <schema>.parse(input)    ← input no confiable, validado antes de mutar (T-04-07).
//   3) createAdminClient() (service-role): bypassa RLS — las tablas del CRM son admin-only sin policy
//      de write (migración 034), así nada es falsificable ni accesible por el dueño de un negocio.
//   4) leer estado previo si el audit necesita {from,to} → mutar → si error, throw 'update_failed'.
//   5) logAudit con el action code EXACTO que reconoce el visor / timeline (NO inventar otros):
//      'deal.create', 'deal.stage_change', 'deal.mark_lost', 'lead.convert'.
//   6) revalidatePath('/admin/pipeline') del tablero afectado.
//
// EXCEPCIÓN: linkLeadOnSignup NO llama requireAdmin() — corre bajo la SESIÓN DEL DUEÑO en el
// onboarding (un flujo no-admin). Su guard es la re-derivación del email del owner server-side
// (anti-tampering del booking) + el uso de service-role para escribir. Ver su comentario.
//
// NOTA: las tag actions (createTag/assignTag/removeTag) NO viven acá — son foundation compartido en
// _tag-actions.ts (Plan 01, D-08). El tablero las IMPORTA de ahí para asignar/quitar tags.

const PIPELINE_PATH = '/admin/pipeline'

// ── moveStage ─────────────────────────────────────────────────────────────────────────────────
// Mueve un deal a otra etapa (DnD del tablero). Lee el stage previo para el metadata {from,to} del
// audit antes de actualizar. Si el deal no existe o el update falla → throw 'update_failed'.
export async function moveStage(input: unknown): Promise<void> {
  const actor = await requireAdmin()
  const data = moveStageSchema.parse(input)
  const admin = createAdminClient()

  // Estado previo para metadata {from,to} (calca el patrón de changePlan en _actions.ts).
  const { data: prev } = await admin.from('deals').select('stage').eq('id', data.dealId).single()

  const { error } = await admin
    .from('deals')
    .update({ stage: data.stage, updated_at: new Date().toISOString() })
    .eq('id', data.dealId)
  if (error) throw new Error('update_failed')

  await logAudit({
    actorId: actor.id,
    action: 'deal.stage_change',
    targetType: 'deal',
    targetId: data.dealId,
    risk: 'bajo',
    metadata: { from: (prev as { stage?: string } | null)?.stage ?? null, to: data.stage },
  })

  revalidatePath(PIPELINE_PATH)
}

// ── createDeal ────────────────────────────────────────────────────────────────────────────────
// Alta de un deal. Reusa un lead existente por email (normalizado a lowercase por el schema) o crea
// uno nuevo; luego inserta el deal en la etapa indicada. Audita 'deal.create' (riesgo bajo).
export async function createDeal(input: unknown): Promise<void> {
  const actor = await requireAdmin()
  const data = createDealSchema.parse(input)
  const admin = createAdminClient()

  // Resolver el lead: si hay email, intentar reusar uno existente (case-insensitive ya normalizado).
  // DECIDIDO POR EL USUARIO (gap 4b): no reusar leads convertidos — solo se reusa un lead ACTIVO
  // (business_id null); si no hay, se crea uno nuevo con el nombre del formulario. El reuse se acota
  // con .is('business_id', null), así un email de un lead ya convertido no permite re-vincular ni
  // renombrar un lead ajeno (el lookup no lo encuentra → cae a la rama de crear uno nuevo).
  let leadId: string | null = null
  if (data.leadEmail) {
    const { data: existing } = await admin
      .from('leads')
      .select('id')
      .eq('email', data.leadEmail)
      .is('business_id', null)
      .limit(1)
      .maybeSingle()
    leadId = (existing as { id?: string } | null)?.id ?? null
  }

  if (!leadId) {
    const { data: created, error: leadErr } = await admin
      .from('leads')
      .insert({ name: data.leadName, email: data.leadEmail ?? null })
      .select('id')
      .single()
    if (leadErr) throw new Error('update_failed')
    leadId = (created as { id: string }).id
  }

  const { data: createdDeal, error: dealErr } = await admin
    .from('deals')
    .insert({ lead_id: leadId, title: data.leadName, value_ars: data.valueArs, stage: data.stage, status: 'open' })
    .select('id')
    .single()
  if (dealErr) throw new Error('update_failed')

  await logAudit({
    actorId: actor.id,
    action: 'deal.create',
    targetType: 'deal',
    targetId: (createdDeal as { id: string }).id, // WR-01: el deal creado se linkea en el visor/timeline
    risk: 'bajo',
    metadata: { leadName: data.leadName, valueArs: data.valueArs, stage: data.stage },
  })

  revalidatePath(PIPELINE_PATH)
}

// ── markLost ──────────────────────────────────────────────────────────────────────────────────
// Marca un deal como perdido con motivo. Setea status='lost' + lost_reason → el deal sale del tablero
// (las queries del tablero filtran status='open'). Audita 'deal.mark_lost' (riesgo medio).
export async function markLost(input: unknown): Promise<void> {
  const actor = await requireAdmin()
  const data = markLostSchema.parse(input)
  const admin = createAdminClient()

  const { error } = await admin
    .from('deals')
    .update({ status: 'lost', lost_reason: data.reason, updated_at: new Date().toISOString() })
    .eq('id', data.dealId)
  if (error) throw new Error('update_failed')

  await logAudit({
    actorId: actor.id,
    action: 'deal.mark_lost',
    targetType: 'deal',
    targetId: data.dealId,
    risk: 'medio',
    metadata: { reason: data.reason },
  })

  revalidatePath(PIPELINE_PATH)
}

// ── markWon ───────────────────────────────────────────────────────────────────────────────────
// Marca un deal como ganado (status='won'). Espejo de markLost pero risk 'bajo' (ganar NO es
// destructivo) y SIN tocar stage (D-04: stage y status son ortogonales — markWon solo toca status,
// no acopla stage↔status). Audita 'deal.won' para alimentar el visor / timeline.
export async function markWon(input: unknown): Promise<void> {
  const actor = await requireAdmin()
  const data = markWonSchema.parse(input)
  const admin = createAdminClient()

  const { error } = await admin
    .from('deals')
    .update({ status: 'won', updated_at: new Date().toISOString() })
    .eq('id', data.dealId)
  if (error) throw new Error('update_failed')

  await logAudit({
    actorId: actor.id,
    action: 'deal.won',
    targetType: 'deal',
    targetId: data.dealId,
    risk: 'bajo',
  })

  revalidatePath(PIPELINE_PATH)
}

// ── convertLead ───────────────────────────────────────────────────────────────────────────────
// Conversión MANUAL desde el tablero (D-05, complementaria a la automática del onboarding): el operador
// asocia un lead a un negocio ya creado. Set deal→won + leads.business_id. Audita 'lead.convert' (medio).
export async function convertLead(input: unknown): Promise<void> {
  const actor = await requireAdmin()
  const data = convertLeadSchema.parse(input)
  const admin = createAdminClient()

  const { error: leadErr } = await admin
    .from('leads')
    .update({ business_id: data.businessId })
    .eq('id', data.leadId)
  if (leadErr) throw new Error('update_failed')

  // Los deals open de ese lead pasan a won (el lead convirtió).
  await admin
    .from('deals')
    .update({ status: 'won', business_id: data.businessId, updated_at: new Date().toISOString() })
    .eq('lead_id', data.leadId)
    .eq('status', 'open')

  await logAudit({
    actorId: actor.id,
    action: 'lead.convert',
    targetType: 'lead',
    targetId: data.leadId,
    businessId: data.businessId,
    risk: 'medio',
  })

  revalidatePath(PIPELINE_PATH)
}

// ── linkLeadOnSignup ────────────────────────────────────────────────────────────────────────────
// Conversión AUTOMÁTICA al alta de un negocio (onboarding handleFinish, D-05). Esta es la ÚNICA vía
// donde un flujo NO-admin (la sesión del dueño recién registrado) toca tablas admin-only (leads/deals)
// → debe cruzar a service-role server-side (T-04-05). Por eso NO usa requireAdmin().
//
// ANTI-TAMPERING (T-04-06, regla del booking): el email del owner se RE-DERIVA de la sesión
// server-side con supabase.auth.getUser(); NUNCA se confía en un email/leadId del input (el schema
// solo acepta businessId, y aunque llegue basura extra por un POST directo, se ignora). Así un atacante
// no puede vincular un lead arbitrario a su negocio.
//
// BEST-EFFORT (T-04-09): si algo falla, console.error y retornar — NUNCA romper el onboarding (el
// negocio ya se creó; un lead sin vincular se re-vincula a mano, D-06). Mismo criterio que los efectos
// no críticos del repo (emails / Google Calendar en after()).
export async function linkLeadOnSignup(input: unknown): Promise<void> {
  try {
    // Parse defensivo DENTRO del try: solo businessId; ignora cualquier email/leadId que venga en el
    // input. Si el input llega malformado, el ZodError cae al catch best-effort y NUNCA rompe el
    // onboarding (CR-01: antes el parse estaba fuera del try y la excepción escapaba al handleFinish).
    const data = linkLeadOnSignupSchema.parse(input)

    // Email del owner re-derivado de la SESIÓN (no del input). createClient = cliente con cookies del dueño.
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !user.email) return // best-effort: sin sesión no hay a quién vincular.

    const email = user.email.toLowerCase()
    const admin = createAdminClient() // service-role: única vía de escritura a tablas admin-only.

    // Buscar un lead por el email autenticado (la columna se guarda lowercase a nivel app).
    const { data: lead } = await admin
      .from('leads')
      .select('id')
      .eq('email', email)
      .limit(1)
      .maybeSingle()

    const existingLeadId = (lead as { id?: string } | null)?.id ?? null

    if (existingLeadId) {
      // Lead existente → vincularlo al negocio y ganar sus deals open.
      await admin.from('leads').update({ business_id: data.businessId }).eq('id', existingLeadId)
      await admin
        .from('deals')
        .update({ status: 'won', business_id: data.businessId, updated_at: new Date().toISOString() })
        .eq('lead_id', existingLeadId)
        .eq('status', 'open')
    } else {
      // No había lead → crear uno YA convertido con un deal ganado en 'pago' (D-06).
      const { data: created } = await admin
        .from('leads')
        .insert({ name: email, email, business_id: data.businessId })
        .select('id')
        .single()
      const newLeadId = (created as { id?: string } | null)?.id ?? null
      if (newLeadId) {
        await admin
          .from('deals')
          .insert({ lead_id: newLeadId, stage: 'pago', status: 'won', business_id: data.businessId, value_ars: 0 })
      }
    }

    // actorId = el dueño (no un admin): es quien disparó la conversión automática.
    await logAudit({
      actorId: user.id,
      action: 'lead.convert',
      targetType: 'lead',
      businessId: data.businessId,
      risk: 'medio',
      metadata: { auto: true },
    })
  } catch (e) {
    // Best-effort: una falla de conversión NUNCA debe tumbar el onboarding.
    console.error('[pipeline/link-lead-on-signup]', e instanceof Error ? e.message : e)
  }
}
