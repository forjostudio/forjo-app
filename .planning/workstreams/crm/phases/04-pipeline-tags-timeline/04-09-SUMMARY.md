---
phase: 04-pipeline-tags-timeline
plan: 09
subsystem: crm-tags
tags: [crm, tags, pipeline, gap-closure]
requires:
  - components/crm/tag-manager-dialog.tsx (04-08)
  - components/crm/tag-chip.tsx (removable/onRemove)
  - app/(crm)/admin/_tag-actions.ts (removeTag)
provides:
  - Sección "Asignadas" en TagManagerDialog con afordance de quitar (X) para ambos entityType
affects:
  - /admin/pipeline (entityType='lead')
  - /admin/negocios/[id] (entityType='business', afordance adicional)
tech-stack:
  added: []
  patterns:
    - TagChip removable + onRemove → removeTag({ tagId, entityType, entityId }) + onChanged()
    - handler espejado verbatim sobre handleAssignExisting (pending/try-catch/finally/toast)
key-files:
  created: []
  modified:
    - components/crm/tag-manager-dialog.tsx
decisions:
  - "Remove aplica para AMBOS entityType (lead|business), no gateado a 'lead': removeTag es riesgo bajo (borra fila de entity_tags, auditado server-side), evita rama condicional y asimetría confusa"
  - "Sin ConfirmDialog en el diálogo: afordance directo de bajo riesgo, espejo del patrón TagChip removable de la ficha"
  - "La fila de chips removable + ConfirmDialog de la ficha (entity_type='business', test 13) queda INTACTA: superficie distinta, no se reemplaza ni duplica"
metrics:
  duration: ~10m
  completed: 2026-06-22
status: complete
---

# Phase 4 Plan 09: Sección "Asignadas" en TagManagerDialog Summary

Cierre del gap test 7 (MAJOR): el `TagManagerDialog` compartido ahora tiene una sección "Asignadas" que renderiza las tags ya puestas en la entidad como `TagChip` removable (X) y las quita vía `removeTag` — dándole al pipeline (`entityType='lead'`) el surface de quitar que no existía, con cero dependencias nuevas y un solo archivo modificado.

## What Was Built

**Task 1 — Sección "Asignadas" en TagManagerDialog (gap test 7)** — commit `525627c`

Tres cambios en `components/crm/tag-manager-dialog.tsx` (único archivo tocado):

1. **Import `removeTag`** — `import { createTag, assignTag, removeTag } from '@/app/(crm)/admin/_tag-actions'`. El server action ya existía y es genérico (`entityType: 'lead' | 'business'`); no se tocó.
2. **Handler `handleRemove(tag)`** — modelado verbatim sobre `handleAssignExisting`: misma guarda `if (pending) return`, `setPending(true)`, try/catch, `finally { setPending(false) }`. Dentro: `await removeTag({ tagId: tag.id, entityType, entityId })` + `onChanged?.()`. Catch con `console.error('[crm/tags] removeTag error:', ...)` + `toast.error('No se pudo quitar la tag. Probá de nuevo.')`.
3. **Sección "Asignadas" en el markup** — bloque nuevo ANTES de "Asignar existente", con la misma estructura visual (wrapper `space-y-2`, label mono `text-[11px] uppercase`, contenedor de chips `flex flex-wrap gap-1.5`). Si `assignedTags.length === 0` → "Sin tags asignadas."; si hay → `assignedTags.map(t => <TagChip ... removable onRemove={() => handleRemove(t)} />)` (solo `removable`/`onRemove`, sin `onToggle`, para mostrar la X estática). A "Asignar existente" se le agregó `border-t border-border pt-4` (espejo de "Crear nueva") para la jerarquía Asignadas → Asignar existente → Crear nueva.

El comentario de cabecera (líneas 14-16) se reescribió: el diálogo AHORA incluye `removeTag` (riesgo bajo, afordance directo sin ConfirmDialog) para ambos entityType, y se documenta que la fila de chips + ConfirmDialog de la ficha (`entity_type='business'`, test 13) sigue intacta como surface adicional.

## Verification

- `tsc --noEmit -p tsconfig.json` → exit **0** (corrido con el typescript del repo principal; el worktree no tiene node_modules propio).
- `grep -c "removeTag"` → 7 · `grep -c "removable"` → 3 · `grep -c "Asignadas"` → 4.
- El comentario de cabecera ya NO afirma que el diálogo "NO incluye removeTag".
- Commit sin deletions ni untracked.

Manual (downstream UAT, no ejecutado acá): en el pipeline, +Tag en una tarjeta con tags → la sección "Asignadas" muestra los chips con X → click en X quita la tag → tras `onChanged`→`router.refresh()` el chip desaparece de la tarjeta y deja de matchear el filtro OR. En la ficha, la fila "Quitar tag" (ConfirmDialog) sigue igual.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None. No se introdujo superficie de seguridad nueva: `removeTag` ya existía y revalida `requireAdmin()` + `removeTagSchema.parse()` server-side (T-04-16, mitigada); la prop `assignedTags` (id/label/color) ya cruzaba al cliente desde 04-08 (T-04-13, sin cambio). Cero dependencias nuevas (T-04-SC).

## Self-Check: PASSED

- FOUND: components/crm/tag-manager-dialog.tsx (modified, tsc clean)
- FOUND commit: 525627c
