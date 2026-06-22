'use client'

// TagManagerDialog — diálogo COMPARTIDO de tags (gap test 7 + 13). Extraído VERBATIM del bloque que
// vivía embebido en ficha-client.tsx (mismo markup, mismos tokens del shell CRM dark, mismo TagChip,
// mismo Input/Button de @/components/ui, mismo <input type="color"> nativo) y generalizado por
// `entityType` ('lead' | 'business') para que TANTO la ficha (entityType='business') COMO el pipeline
// (entityType='lead', entityId=leadId) lo reusen sin duplicar UI.
//
// Comportamiento:
//   - "Asignar existente": chips TagChip toggle → assignTag(tagId, entityType, entityId) + onChanged().
//   - "Crear nueva": Input + color picker → createTag (que AHORA devuelve el id) y EN EL MISMO PASO
//     assignTag con ese id (gap test 13: la tag queda asignada sin tener que tocar "asignar existente").
//
// El client NUNCA autoriza: createTag/assignTag revalidan requireAdmin()+zod server-side (T-04-15/16);
// este diálogo es solo el afordance. NO incluye removeTag: quitar una tag queda en cada surface con su
// propio refuerzo (la ficha usa un ConfirmDialog ya verificado; no se mueve acá).

import * as React from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TagChip } from '@/components/crm/tag-chip'
import { createTag, assignTag } from '@/app/(crm)/admin/_tag-actions'

type Tag = { id: string; label: string; color: string }

export function TagManagerDialog({
  open,
  onOpenChange,
  entityType,
  entityId,
  assignedTags,
  catalogTags,
  onChanged,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  entityType: 'lead' | 'business'
  entityId: string
  assignedTags: Tag[]
  catalogTags: Tag[]
  onChanged?: () => void
}) {
  const [pending, setPending] = React.useState(false)
  const [newTagLabel, setNewTagLabel] = React.useState('')
  const [newTagColor, setNewTagColor] = React.useState('#6366f1')

  // Tags ya asignadas (set de ids) para no ofrecer en el catálogo las que ya están.
  const assignedIds = React.useMemo(() => new Set(assignedTags.map((t) => t.id)), [assignedTags])
  const availableTags = React.useMemo(
    () => catalogTags.filter((t) => !assignedIds.has(t.id)),
    [catalogTags, assignedIds],
  )

  async function handleAssignExisting(tag: Tag) {
    if (pending) return
    setPending(true)
    try {
      await assignTag({ tagId: tag.id, entityType, entityId })
      onChanged?.()
    } catch (e) {
      console.error('[crm/tags] assignTag error:', e instanceof Error ? e.message : e)
      toast.error('No se pudo asignar la tag. Probá de nuevo.')
    } finally {
      setPending(false)
    }
  }

  // Crea la tag (createTag devuelve el id) y EN EL MISMO PASO la asigna a esta entidad (gap test 13):
  // así la tag recién creada queda asignada sin tener que volver a tocarla en "asignar existente".
  async function handleCreateTag() {
    const label = newTagLabel.trim()
    const color = newTagColor.trim()
    if (!label || !color || pending) return
    setPending(true)
    try {
      const id = await createTag({ label, color })
      await assignTag({ tagId: id, entityType, entityId })
      setNewTagLabel('')
      onChanged?.()
    } catch (e) {
      // El índice único tags_label_unique_idx (23505) → createTag lanza 'update_failed'.
      console.error('[crm/tags] createTag error:', e instanceof Error ? e.message : e)
      toast.error('No se pudo crear la tag (¿ya existe?).')
    } finally {
      setPending(false)
    }
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tags"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-[family-name:var(--font-heading)] text-base font-bold tracking-[-0.02em]">
          Tags
        </h2>

        {/* Asignar existente */}
        <div className="space-y-2">
          <p className="font-[family-name:var(--font-geist-mono)] text-[11px] uppercase tracking-wide text-muted-foreground">
            Asignar existente
          </p>
          <div className="flex flex-wrap gap-1.5">
            {availableTags.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay tags disponibles. Creá una abajo.</p>
            ) : (
              availableTags.map((t) => (
                <TagChip key={t.id} label={t.label} color={t.color} onToggle={() => handleAssignExisting(t)} />
              ))
            )}
          </div>
        </div>

        {/* Crear nueva */}
        <div className="space-y-2 border-t border-border pt-4">
          <p className="font-[family-name:var(--font-geist-mono)] text-[11px] uppercase tracking-wide text-muted-foreground">
            Crear nueva
          </p>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={newTagColor}
              onChange={(e) => setNewTagColor(e.target.value)}
              aria-label="Color de la tag"
              className="size-9 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
            />
            <Input
              value={newTagLabel}
              onChange={(e) => setNewTagLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleCreateTag()
                }
              }}
              placeholder="Nombre de la tag…"
              aria-label="Nombre de la tag"
              className="flex-1"
            />
          </div>
          <Button
            type="button"
            size="sm"
            className="w-full gap-1"
            disabled={!newTagLabel.trim() || pending}
            onClick={handleCreateTag}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Crear tag
          </Button>
        </div>

        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  )
}
