'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-guard'
import { logAudit } from '@/lib/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { isValidHandledByTransition, type HandledBy } from '@/lib/conversations'
import {
  takeConversationSchema,
  releaseConversationSchema,
} from './_bandeja-actions.schemas'

// ── Server Actions del takeover de la bandeja (Phase 6, Plan 01, D-03) ─────────────────────────────
//
// "Tomar conversación" setea el estado IA→Humano (conversations.handled_by). El bot lee el resultado
// vía GET /api/agent/inbox/state y pasa a Modo Humano (PAUSA). El envío manual saliente está DIFERIDO
// (composer "próximamente") hasta que el bot exponga un endpoint `send`.
//
// Patrón OBLIGATORIO por action (calcado VERBATIM de _content-actions.ts, mismo orden SIEMPRE):
//   1) const actor = await requireAdmin()   ← PRIMERA línea: la action es un endpoint POST invocable
//      directo (curl/devtools) SIN pasar por el layout; el guard del layout NO la protege. LANZA si no
//      es admin. Su id es el actorId del audit.
//   2) const data = <schema>.parse(input)    ← input no confiable, validado antes de mutar.
//   3) createAdminClient() (service-role): no hay policy de update para usuarios (D-04, solo service-role).
//   4) mutar → si error, throw new Error('update_failed').
//   5) logAudit con el action code EXACTO que mapea ACTION_LABEL (lib/crm-timeline.ts).
//   6) revalidatePath('/admin/bandeja').

// ── takeConversation ──────────────────────────────────────────────────────────────────────────────
// El operador toma el hilo: handled_by → 'human'. Riesgo bajo (solo cambia el estado de atención; no
// toca cobro ni datos del negocio). El bot lee 'human' y pausa.
export async function takeConversation(input: unknown): Promise<void> {
  const actor = await requireAdmin()
  const data = takeConversationSchema.parse(input)
  const admin = createAdminClient()

  // El update con service-role bypassa RLS y NO falla sobre un id inexistente (escribiría 0 filas
  // "con éxito"). Por eso primero LEEMOS el estado actual: confirma que la conversación existe
  // (si no → update_failed) y permite validar la transición con isValidHandledByTransition para no
  // auditar un no-op (tomar algo ya en 'human' generaría un audit redundante y un toast espurio) (WR-05).
  const { data: convo, error: readErr } = await admin
    .from('conversations')
    .select('handled_by')
    .eq('id', data.conversationId)
    .maybeSingle()
  if (readErr) throw new Error('update_failed')
  if (!convo) throw new Error('update_failed') // id inexistente → no se audita un takeover fantasma

  // No-op: ya estaba en 'human'. No se escribe ni se audita (evita log redundante + toast espurio).
  if (!isValidHandledByTransition(convo.handled_by as HandledBy, 'human')) return

  const { error } = await admin
    .from('conversations')
    .update({ handled_by: 'human' })
    .eq('id', data.conversationId)
  if (error) throw new Error('update_failed')

  await logAudit({
    actorId: actor.id,
    action: 'conversation.takeover',
    targetType: 'conversation',
    targetId: data.conversationId,
    risk: 'bajo',
    reason: 'Operador tomó la conversación',
  })

  revalidatePath('/admin/bandeja')
}

// ── releaseConversation ─────────────────────────────────────────────────────────────────────────────
// El operador libera el hilo: handled_by → 'ai'. Simétrico de takeConversation. El bot retoma (Modo IA).
export async function releaseConversation(input: unknown): Promise<void> {
  const actor = await requireAdmin()
  const data = releaseConversationSchema.parse(input)
  const admin = createAdminClient()

  // Simétrico de takeConversation (WR-05): leer-validar-escribir. Confirma existencia y evita auditar
  // un no-op (liberar algo ya en 'ai').
  const { data: convo, error: readErr } = await admin
    .from('conversations')
    .select('handled_by')
    .eq('id', data.conversationId)
    .maybeSingle()
  if (readErr) throw new Error('update_failed')
  if (!convo) throw new Error('update_failed')

  if (!isValidHandledByTransition(convo.handled_by as HandledBy, 'ai')) return

  const { error } = await admin
    .from('conversations')
    .update({ handled_by: 'ai' })
    .eq('id', data.conversationId)
  if (error) throw new Error('update_failed')

  await logAudit({
    actorId: actor.id,
    action: 'conversation.release',
    targetType: 'conversation',
    targetId: data.conversationId,
    risk: 'bajo',
    reason: 'Operador liberó la conversación',
  })

  revalidatePath('/admin/bandeja')
}
