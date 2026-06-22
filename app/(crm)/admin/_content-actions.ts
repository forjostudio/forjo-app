'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-guard'
import { logAudit } from '@/lib/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createNoteSchema,
  editNoteSchema,
  deleteNoteSchema,
  createTaskSchema,
  completeTaskSchema,
} from './_crm-actions.schemas'

// ── Server Actions de notas y tareas livianas del CRM (Phase 4, Plan 03, D-12) ────────────────────
//
// Alimentan el timeline unificado (crm_timeline): cada nota es una rama 'nota' de la VIEW, cada tarea
// una rama 'tarea', y cada logAudit de acá una rama 'cambio'. POR QUÉ viven en su PROPIO archivo (no en
// _tag-actions.ts ni _pipeline-actions.ts): las notas/tareas son el surface de "contenido" de la ficha
// (Plan 03), paralelo al tablero (Plan 02) — ambos solo dependen del foundation 04-01, sin overlap.
//
// Patrón OBLIGATORIO por action (calcado VERBATIM de _actions.ts, mismo orden SIEMPRE):
//   1) const actor = await requireAdmin()   ← PRIMERA línea: una action es un endpoint POST invocable
//      directo (curl, devtools) SIN pasar por el layout; el guard del layout NO la protege. LANZA si no
//      es admin. Su id es el actorId del audit (T-04-11).
//   2) const data = <schema>.parse(input)    ← input no confiable, validado antes de mutar (T-04-11).
//   3) createAdminClient() (service-role): bypassa RLS — notes/tasks son admin-only sin policy de write.
//   4) mutar → si error, throw new Error('update_failed').
//   5) logAudit con el action code EXACTO que mapea ACTION_LABEL (lib/crm-timeline / auditoria-client),
//      con businessId cuando aplica para que la entrada caiga en el timeline del negocio (T-04-12).
//   6) revalidatePath de la ficha del negocio cuando businessId está presente.
//
// Action codes EXACTOS (registrados en el ACTION_LABEL central de lib/crm-timeline.ts):
//   note.create, note.edit, note.delete, task.create, task.complete.

// Path de la ficha del negocio (igual que _actions.ts: literal, sin segmento [id]).
function fichaPath(businessId: string): string {
  return `/admin/negocios/${businessId}`
}

// ── createNote ────────────────────────────────────────────────────────────────────────────────
// Inserta una nota libre sobre un lead y/o negocio. Riesgo bajo (alimenta el timeline, no toca cobro
// ni estado del negocio). revalida la ficha del negocio si la nota cuelga de uno.
export async function createNote(input: unknown): Promise<void> {
  const actor = await requireAdmin()
  const data = createNoteSchema.parse(input)
  const admin = createAdminClient()

  const { error } = await admin.from('notes').insert({
    business_id: data.businessId ?? null,
    lead_id: data.leadId ?? null,
    body: data.body,
  })
  if (error) throw new Error('update_failed')

  await logAudit({
    actorId: actor.id,
    action: 'note.create',
    targetType: 'note',
    businessId: data.businessId ?? null,
    risk: 'bajo',
    metadata: { leadId: data.leadId ?? null },
  })

  if (data.businessId) revalidatePath(fichaPath(data.businessId))
}

// ── editNote ──────────────────────────────────────────────────────────────────────────────────
// Actualiza notes.body + updated_at. Riesgo bajo. No revalida una ficha puntual (no recibe businessId):
// el revalidate de la ficha lo dispara el create/delete; editar refresca al volver a entrar.
export async function editNote(input: unknown): Promise<void> {
  const actor = await requireAdmin()
  const data = editNoteSchema.parse(input)
  const admin = createAdminClient()

  const { error } = await admin
    .from('notes')
    .update({ body: data.body, updated_at: new Date().toISOString() })
    .eq('id', data.noteId)
  if (error) throw new Error('update_failed')

  await logAudit({
    actorId: actor.id,
    action: 'note.edit',
    targetType: 'note',
    targetId: data.noteId,
    risk: 'bajo',
  })
}

// ── deleteNote ────────────────────────────────────────────────────────────────────────────────
// Borra la nota. Riesgo MEDIO: acción destructiva → en la UI va detrás de ConfirmDialog (refuerzo);
// requireAdmin es la garantía real (T-04-14).
export async function deleteNote(input: unknown): Promise<void> {
  const actor = await requireAdmin()
  const data = deleteNoteSchema.parse(input)
  const admin = createAdminClient()

  const { error } = await admin.from('notes').delete().eq('id', data.noteId)
  if (error) throw new Error('update_failed')

  await logAudit({
    actorId: actor.id,
    action: 'note.delete',
    targetType: 'note',
    targetId: data.noteId,
    risk: 'medio',
  })
}

// ── createTask ────────────────────────────────────────────────────────────────────────────────
// Inserta una tarea liviana (done=false, due opcional). SIN asignación/recordatorios/recurrencia (D-12).
// Riesgo bajo.
export async function createTask(input: unknown): Promise<void> {
  const actor = await requireAdmin()
  const data = createTaskSchema.parse(input)
  const admin = createAdminClient()

  const { error } = await admin.from('tasks').insert({
    business_id: data.businessId ?? null,
    lead_id: data.leadId ?? null,
    title: data.title,
    due_date: data.dueDate ?? null,
    done: false,
  })
  if (error) throw new Error('update_failed')

  await logAudit({
    actorId: actor.id,
    action: 'task.create',
    targetType: 'task',
    businessId: data.businessId ?? null,
    risk: 'bajo',
    metadata: { title: data.title, dueDate: data.dueDate ?? null },
  })

  if (data.businessId) revalidatePath(fichaPath(data.businessId))
}

// ── completeTask ──────────────────────────────────────────────────────────────────────────────
// Marca/desmarca una tarea: done + completed_at (now si done, null si se desmarca). Riesgo bajo.
export async function completeTask(input: unknown): Promise<void> {
  const actor = await requireAdmin()
  const data = completeTaskSchema.parse(input)
  const admin = createAdminClient()

  // completed_at refleja el done: se setea al completar, se limpia al re-abrir la tarea.
  const completedAt = data.done ? new Date().toISOString() : null

  const { error } = await admin
    .from('tasks')
    .update({ done: data.done, completed_at: completedAt })
    .eq('id', data.taskId)
  if (error) throw new Error('update_failed')

  await logAudit({
    actorId: actor.id,
    action: 'task.complete',
    targetType: 'task',
    targetId: data.taskId,
    risk: 'bajo',
    metadata: { done: data.done },
  })
}
