---
phase: 04-pipeline-tags-timeline
plan: 08
subsystem: crm-tags
tags: [crm, tags, pipeline, directorio, gap-closure]
status: complete
requires:
  - "_tag-actions.ts (createTag/assignTag/removeTag genéricos, Plan 01)"
  - "TagChip, ConfirmDialog, shadcn Dialog/Button/Input (existentes)"
provides:
  - "components/crm/tag-manager-dialog.tsx (diálogo compartido de tags parametrizado por entityType)"
  - "createTag → Promise<string> (devuelve id para encadenar assignTag)"
  - "afordance +Tag por tarjeta en el pipeline (entityType='lead')"
  - "control Limpiar filtros siempre visible en el directorio"
affects:
  - "app/(crm)/admin/_tag-actions.ts"
  - "app/(crm)/admin/pipeline/page.tsx"
  - "app/(crm)/admin/pipeline/pipeline-client.tsx"
  - "app/(crm)/admin/negocios/[id]/ficha-client.tsx"
  - "app/(crm)/admin/negocios/negocios-client.tsx"
tech-stack:
  added: []
  patterns:
    - "Extracción de UI duplicada a componente compartido parametrizado (entityType)"
    - "createTag.select('id').single() para devolver el id de la fila creada"
    - "Auto-asignación en un paso: createTag → assignTag encadenados dentro del diálogo"
key-files:
  created:
    - "components/crm/tag-manager-dialog.tsx"
  modified:
    - "app/(crm)/admin/_tag-actions.ts"
    - "app/(crm)/admin/pipeline/page.tsx"
    - "app/(crm)/admin/pipeline/pipeline-client.tsx"
    - "app/(crm)/admin/negocios/[id]/ficha-client.tsx"
    - "app/(crm)/admin/negocios/negocios-client.tsx"
decisions:
  - "createTag devuelve el id (Promise<string>) en vez de void, para encadenar la auto-asignación"
  - "El diálogo de tags se extrae VERBATIM del bloque de la ficha a un componente compartido reusado por ficha (business) y pipeline (lead)"
  - "removeTag NO entra al diálogo compartido: quitar tag queda en la ficha con su ConfirmDialog ya verificado"
  - "El control Limpiar filtros del directorio vive en su propio contenedor (hasActiveFilters), independiente del catálogo de tags y del empty-state"
metrics:
  duration: "~25 min"
  completed: "2026-06-22"
  tasks: 3
  files: 6
requirements: [PIPE-04]
---

# Phase 4 Plan 08: Cierre de gaps de Pipeline/Tags/Directorio Summary

Diálogo de tags compartido (`TagManagerDialog` parametrizado por `entityType`) que cierra los 3 gaps del re-test de la Phase 4: tags asignables por tarjeta en el pipeline (gap 7), creación de tag con auto-asignación en un paso (gap 13), y control "Limpiar filtros" siempre visible en el directorio (gap 14).

## Qué se construyó

- **Task 1 — backend + diálogo compartido (commit 21b0322):**
  - `createTag` pasa de `Promise<void>` a `Promise<string>`: el `.insert(...)` encadena `.select('id').single<{ id: string }>()` y devuelve `row.id`. El 23505 (label duplicado) sigue lanzando `update_failed` — createTag NO es idempotente (a diferencia de assignTag).
  - Nuevo `components/crm/tag-manager-dialog.tsx` (`'use client'`), modelado verbatim sobre el bloque de tags embebido en la ficha (mismo markup, tokens del shell CRM dark, TagChip, Input/Button, `<input type="color">`). Props: `open`, `onOpenChange`, `entityType`, `entityId`, `assignedTags`, `catalogTags`, `onChanged`. "Asignar existente" (chips toggle → assignTag) + "Crear nueva" (createTag → assignTag encadenado, auto-asignación gap 13). No incluye removeTag.

- **Task 2 — pipeline page + client (commit fd44834):**
  - `pipeline/page.tsx` pasa `catalogTags={tags}` al `PipelineClient` (mismo catálogo que la fila de filtro; solo id/label/color, no sensible, T-04-13).
  - `pipeline-client.tsx`: prop `catalogTags`, estado `tagDeal`, botón "+ Tag" por tarjeta en la fila de acciones (junto a Marcar ganado/perdido), y UN `TagManagerDialog` a nivel board (`entityType='lead'`, `entityId=tagDeal.leadId`, `assignedTags` derivado de `tagById`, `onChanged=router.refresh()`). El re-sync `prevInitialDeals` ya existente propaga las tagIds nuevas a los chips y al filtro OR.

- **Task 3 — ficha + directorio (commit 6ebfa5e):**
  - `ficha-client.tsx`: el diálogo de tags embebido se reemplaza por `<TagManagerDialog entityType="business" entityId={data.id} assignedTags={tags} catalogTags={catalogTags} onChanged={router.refresh} />`. Se eliminaron handlers/estados/imports muertos (`handleAssignTag`, `handleCreateTag`, `newTagLabel`/`newTagColor`, `assignedIds`/`availableTags`, imports `createTag`/`assignTag`/`toast`). El flujo de "Quitar tag" (chips del Resumen + ConfirmDialog) queda intacto.
  - `negocios-client.tsx`: flag `hasActiveFilters` (`query.trim() !== '' || tab !== 'todos' || selectedTagIds.length > 0`) + botón "Limpiar filtros" (variant outline, size sm) en su propio contenedor, visible siempre que haya filtro activo, independiente del empty-state.

## Verificación

- `npx tsc --noEmit -p tsconfig.json` → exit 0 (en cada task).
- `npm run build` → compila; rutas `/admin/pipeline`, `/admin/negocios`, `/admin/negocios/[id]` presentes en el output.
- `npx eslint` sobre los 4 archivos client/componente → 0 errores, 0 warnings (tras quitar el import muerto `toast` de la ficha).
- greps del plan: `Promise<string>` (1), `entityType` en el diálogo (7), `TagManagerDialog` en pipeline-client (4) y ficha (2), `catalogTags` en pipeline/page (2), `hasActiveFilters` en negocios-client (2).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Import muerto `toast` en la ficha tras borrar handlers de tags**
- **Found during:** Task 3 (eslint post-edit)
- **Issue:** `toast` (sonner) solo lo usaba `handleCreateTag`, eliminado al refactorizar a TagManagerDialog → quedaba como import sin uso (warning eslint `no-unused-vars`).
- **Fix:** Se quitó `import { toast } from 'sonner'` de `ficha-client.tsx`.
- **Files modified:** app/(crm)/admin/negocios/[id]/ficha-client.tsx
- **Commit:** 6ebfa5e

El resto del plan se ejecutó exactamente como fue escrito.

## Known Stubs

Ninguno. El feature de tags del pipeline queda funcional end-to-end (asignar → filtrar); la creación es de un solo paso en ambos surfaces; el directorio tiene clear-filters siempre visible.

## Threat Flags

Ninguna superficie nueva fuera del threat_model del plan. El diálogo compartido invoca las mismas server actions ya verificadas (createTag/assignTag con requireAdmin+zod server-side); solo id/label/color y tagIds cruzan al cliente (T-04-13). Cero dependencias nuevas (T-04-SC).

## Self-Check: PASSED

- FOUND: components/crm/tag-manager-dialog.tsx
- FOUND commit 21b0322 (Task 1)
- FOUND commit fd44834 (Task 2)
- FOUND commit 6ebfa5e (Task 3)
