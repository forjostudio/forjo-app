---
phase: 04-pipeline-tags-timeline
plan: 07
subsystem: frontend
tags: [crm, ficha, tags, tareas, timeline, confirm-dialog, gap-closure, uat]

# Dependency graph
requires:
  - phase: 04-pipeline-tags-timeline
    provides: "04-05 (migr.035): VIEW crm_timeline de-duplicada — cada nota/tarea aparece una sola vez"
  - phase: 04-pipeline-tags-timeline
    provides: "04-01/04-03: server actions compartidas createTag/assignTag (_tag-actions.ts) y createTask/completeTask (_content-actions.ts)"
provides:
  - "UI de creación de tags en la ficha (desbloquea el deadlock de catálogo vacío)"
  - "affordance de completar tareas desde la ficha (checkbox por tarea → completeTask)"
  - "fix cosmético del badge de riesgo del ConfirmDialog (no se superpone a la X)"
affects: [crm-ficha, crm-pipeline-filtros, crm-directorio-filtros, confirm-dialog]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lectura aparte de tasks con id (service-role tras el guard) para affordances que la VIEW crm_timeline no soporta (no expone id) — espejo de la lectura de notas"
    - "Sub-bloque 'Crear nueva' dentro del diálogo de tags para romper el deadlock de catálogo vacío"
    - "Manejo de unique-violation (23505 → 'update_failed') en el cliente con toast.error en lugar de propagar"

key-files:
  created: []
  modified:
    - app/(crm)/admin/negocios/[id]/page.tsx
    - app/(crm)/admin/negocios/[id]/ficha-client.tsx
    - components/crm/confirm-dialog.tsx

key-decisions:
  - "Botón +Tag: quitar availableTags.length===0 del disabled (dejar solo pending). El catálogo vacío ya no deshabilita el acceso al diálogo, que ahora también crea tags."
  - "Diálogo de tags con dos secciones (Asignar existente / Crear nueva). Tras createTag el diálogo queda abierto y router.refresh recarga el catálogo, para que el operador asigne la tag recién creada."
  - "Color picker nativo <input type=color> (default #6366f1) — única excepción de hex hardcodeado permitida por el plan; el resto usa tokens CSS del shell CRM."
  - "Tareas leídas con id por separado de la VIEW (la VIEW no expone id) — espejo de fichaNotes; solo id/title/done/completed_at/created_at cruzan al cliente."
  - "Sección Tareas con checkbox por tarea (label clickeable, min-h-11 para touch target) que invoca completeTask vía handleCompleteTask; título tachado si done."
  - "ConfirmDialog header: justify-between gap-2 → gap-2 pr-8. El badge queda pegado al título y pr-8 reserva el espacio de la X (que es absolute en dialog.tsx, fuera del flujo). No se tocó dialog.tsx (X global)."

patterns-established:
  - "Para affordances que la VIEW crm_timeline no soporta (necesitan el id de la fila), leer la tabla base con service-role tras el guard del layout y pasar solo columnas no sensibles al cliente."

requirements-completed: [PIPE-04, TL-01]

# Metrics
duration: 18min
completed: 2026-06-22
status: complete
---

# Phase 04 Plan 07: Cierre de gaps del UAT (tags, tareas, badge) Summary

Cierra tres gaps del UAT de Phase 4 en la ficha del negocio y el ConfirmDialog compartido: el deadlock de tags (catálogo vacío deshabilitaba +Tag para siempre), la falta de affordance para completar tareas, y el badge de riesgo que se superponía a la X de cerrar.

## What Was Built

### Task 1 — page.tsx: lectura de tasks con id (test 11)
Espejo exacto de la lectura de notas: lectura service-role de `tasks` (`id, title, done, completed_at, created_at`) filtrada por `business_id`, tras el guard del layout (is_admin). El timeline sigue mostrando las tareas por su rama propia de la VIEW; esta lectura aparte existe solo para tener el `id` que el affordance de completar necesita (la VIEW no lo expone). Prop `tasks={fichaTasks}` al `FichaClient`. Commit `2feef37`.

### Task 2 — ficha-client.tsx: desbloqueo de tags + completar tareas (test 13, test 11)
- **Tags (test 13):** import de `createTag`; el botón +Tag ya no nace `disabled` por catálogo vacío (`disabled={pending}`). El diálogo pasó de "Asignar tag" a "Tags" con dos secciones: *Asignar existente* (chips del catálogo no asignadas) y *Crear nueva* (color picker nativo + input de nombre + botón "Crear tag"). `handleCreateTag` invoca `createTag`, limpia el input, hace `router.refresh()` y deja el diálogo abierto para asignar la tag recién creada; maneja el label duplicado (23505 → `update_failed`) con `toast.error`.
- **Tareas (test 11):** type `FichaTask` exportado; props `tasks` + `onCompleteTask` al `TimelineTab`. Nueva sección "Tareas" (visible con filtro Tareas/Todo cuando hay tareas) con un checkbox por tarea — label clickeable de `min-h-11` (touch target), checkbox `accent-[var(--primary)]`, título tachado si `done` — que invoca `completeTask` vía `handleCompleteTask`.

Commit `edcb4f4`.

### Task 3 — confirm-dialog.tsx: fix cosmético del badge (test 12)
Header del `DialogHeader`: `flex items-center justify-between gap-2` → `flex items-center gap-2 pr-8`. `justify-between` mandaba el `RiskBadge` al extremo derecho, colisionando con la X (`absolute top-2 right-2` en dialog.tsx, fuera del flujo → no reserva espacio). Con `gap-2 pr-8` el badge queda pegado al título y el padding-right reserva el lugar de la X. `dialog.tsx` intacto (la X es global). Commit `346d99f`.

## Verification

- `npx tsc --noEmit -p tsconfig.json` → exit 0.
- `npm run build` → fase TypeScript: "Compiled successfully" + "Finished TypeScript" (mi código compila). El build completo falla DESPUÉS, en el prerender de `/login`, por ausencia de `.env.local` en el worktree (env vars de Supabase no presentes) — fallo de entorno del worktree, ajeno a mis cambios (los 3 archivos editados no tocan auth/login). Ver Deferred Issues.
- `npx eslint` sobre los 3 archivos → exit 0 (sin warnings).
- `grep -c "FichaTask" page.tsx` → 3.
- `grep -c "createTag\|onCompleteTask\|completeTask(" ficha-client.tsx` → 11.
- `grep -c "items-center gap-2 pr-8" confirm-dialog.tsx` → 1; `justify-between gap-2` removido (0).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Import de `toast` faltante en ficha-client.tsx**
- **Found during:** Task 2
- **Issue:** El plan pide manejar el label duplicado con `toast.error(...)`, pero `toast` (sonner) no estaba importado en ficha-client.tsx (solo lo usaba confirm-dialog).
- **Fix:** Agregado `import { toast } from 'sonner'`.
- **Files modified:** app/(crm)/admin/negocios/[id]/ficha-client.tsx
- **Commit:** edcb4f4

## Deferred Issues

**Build prerender de /login falla por falta de `.env.local` en el worktree.** El worktree de ejecución paralela no tiene el `.env.local` (gitignored) del checkout principal, así que `@supabase/ssr` lanza "URL and API key are required" al prerenderizar `/login`. Es un fallo de entorno del worktree, NO de los cambios de este plan — la compilación TypeScript pasa limpia y ninguno de los 3 archivos editados toca el flujo de auth. El build pasa en un entorno con `.env.local` (checkout principal / Vercel).

## Known Stubs

Ninguno. Los tres affordances quedan cableados a server actions reales (createTag/completeTask) y a datos reales (lectura service-role de tasks).

## Self-Check: PASSED

- FOUND: app/(crm)/admin/negocios/[id]/page.tsx (modificado, en commit 2feef37)
- FOUND: app/(crm)/admin/negocios/[id]/ficha-client.tsx (modificado, en commit edcb4f4)
- FOUND: components/crm/confirm-dialog.tsx (modificado, en commit 346d99f)
- FOUND commit 346d99f (Task 3)
- FOUND commit 2feef37 (Task 1)
- FOUND commit edcb4f4 (Task 2)
