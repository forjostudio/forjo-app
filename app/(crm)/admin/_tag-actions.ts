'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-guard'
import { logAudit } from '@/lib/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { createTagSchema, assignTagSchema, removeTagSchema } from './_crm-actions.schemas'

// ── Server Actions del catálogo COMPARTIDO de tags (Phase 4, foundation D-08) ─────────────────────
//
// POR QUÉ viven en su PROPIO archivo (no en _pipeline-actions.ts ni _content-actions.ts): las tags son
// UN SOLO catálogo global compartido (D-07/D-08) que consumen TANTO el tablero (Plan 02: filtro y
// asignación en el pipeline) COMO la ficha y el directorio (Plan 03: fila "+ Tag" + filtro del
// directorio). Centralizarlas acá permite que ambos surfaces de Wave 2 importen de un foundation común
// y queden PARALELOS sin acoplarse entre sí (ambos depends_on solo de 04-01, cero overlap).
//
// Patrón OBLIGATORIO por action (calcado VERBATIM de _actions.ts, mismo orden siempre):
//   1) const actor = await requireAdmin()   ← PRIMERA línea: una action es un endpoint POST invocable
//      directo (curl, devtools) SIN pasar por el layout; el guard del layout NO la protege. LANZA si no
//      es admin. Su id es el actorId del audit.
//   2) const data = <schema>.parse(input)    ← input no confiable, validado antes de mutar.
//   3) createAdminClient() (service-role): bypassa RLS — las tablas son admin-only sin policy de write.
//   4) mutar → si error, throw new Error('update_failed').
//   5) logAudit con el action code EXACTO ('tag.create'/'tag.assign'/'tag.remove') que el visor mapea.
//   6) revalidatePath del surface afectado.

// Path del directorio de negocios (filtro de tags vive ahí, Plan 03). Las tags se ven tanto en el
// pipeline como en el directorio/ficha; revalidamos las superficies que listan tags.
const PIPELINE_PATH = '/admin/pipeline'
const NEGOCIOS_PATH = '/admin/negocios'

// ── createTag ─────────────────────────────────────────────────────────────────────────────────
// Crea una tag en el catálogo global. Riesgo bajo (no toca datos de un negocio, solo el catálogo).
export async function createTag(input: unknown): Promise<void> {
  const actor = await requireAdmin()
  const data = createTagSchema.parse(input)
  const admin = createAdminClient()

  const { error } = await admin.from('tags').insert({ label: data.label, color: data.color })
  if (error) throw new Error('update_failed')

  await logAudit({
    actorId: actor.id,
    action: 'tag.create',
    targetType: 'tag',
    risk: 'bajo',
    metadata: { label: data.label, color: data.color },
  })

  revalidatePath(PIPELINE_PATH)
  revalidatePath(NEGOCIOS_PATH)
}

// ── assignTag ─────────────────────────────────────────────────────────────────────────────────
// Asigna una tag a una entidad (lead|business). IDEMPOTENTE respecto al índice único de entity_tags
// (tag_id, entity_type, entity_id): si la tag ya estaba asignada, el insert choca con el 23505 y lo
// tratamos como ÉXITO (no propagamos el error) — evita estados inconsistentes y dobles clics.
export async function assignTag(input: unknown): Promise<void> {
  const actor = await requireAdmin()
  const data = assignTagSchema.parse(input)
  const admin = createAdminClient()

  const { error } = await admin.from('entity_tags').insert({
    tag_id: data.tagId,
    entity_type: data.entityType,
    entity_id: data.entityId,
  })
  // 23505 = unique_violation: la tag ya estaba asignada a esta entidad → idempotente, es éxito.
  if (error && error.code !== '23505') throw new Error('update_failed')

  await logAudit({
    actorId: actor.id,
    action: 'tag.assign',
    targetType: data.entityType,
    targetId: data.entityId,
    risk: 'bajo',
    metadata: { tagId: data.tagId, entityType: data.entityType },
  })

  revalidatePath(PIPELINE_PATH)
  revalidatePath(NEGOCIOS_PATH)
}

// ── removeTag ─────────────────────────────────────────────────────────────────────────────────
// Desasigna una tag de una entidad (borra la fila de entity_tags). No borra la tag del catálogo.
export async function removeTag(input: unknown): Promise<void> {
  const actor = await requireAdmin()
  const data = removeTagSchema.parse(input)
  const admin = createAdminClient()

  const { error } = await admin
    .from('entity_tags')
    .delete()
    .eq('tag_id', data.tagId)
    .eq('entity_type', data.entityType)
    .eq('entity_id', data.entityId)
  if (error) throw new Error('update_failed')

  await logAudit({
    actorId: actor.id,
    action: 'tag.remove',
    targetType: data.entityType,
    targetId: data.entityId,
    risk: 'bajo',
    metadata: { tagId: data.tagId, entityType: data.entityType },
  })

  revalidatePath(PIPELINE_PATH)
  revalidatePath(NEGOCIOS_PATH)
}
