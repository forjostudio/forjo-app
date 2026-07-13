---
phase: 04-pipeline-tags-timeline
plan: 03
subsystem: crm
status: complete
tags: [crm, timeline, notes, tasks, tags, directory]
requires:
  - "04-01 (foundation: _tag-actions, lib/crm-timeline, lib/crm-tags, tag-chip, schemas, migración 034)"
provides:
  - "Tab Timeline real en la ficha (TL-01) leído por session client RLS-gated"
  - "Server actions de notas/tareas (_content-actions.ts) con contrato de 6 pasos"
  - "components/crm/timeline-entry.tsx (entrada presentacional del timeline)"
  - "Filtro por tag (OR) en el directorio de negocios (PIPE-04 lado directorio)"
  - "Fila de tags +Tag en el Resumen de la ficha (assignTag/removeTag compartidos)"
affects:
  - "app/(crm)/admin/auditoria/auditoria-client.tsx (ahora importa ACTION_LABEL central)"
tech-stack:
  added: []
  patterns:
    - "Lectura de VIEW security_invoker con session client (createClient) para heredar RLS admin-read"
    - "Contrato de 6 pasos de server action (requireAdmin → parse → service-role → mutar → logAudit → revalidate)"
    - "ACTION_LABEL central único (lib/crm-timeline) compartido por audit y timeline"
key-files:
  created:
    - "app/(crm)/admin/_content-actions.ts"
    - "app/(crm)/admin/_content-actions.test.ts"
    - "components/crm/timeline-entry.tsx"
  modified:
    - "app/(crm)/admin/negocios/[id]/page.tsx"
    - "app/(crm)/admin/negocios/[id]/ficha-client.tsx"
    - "app/(crm)/admin/negocios/page.tsx"
    - "app/(crm)/admin/negocios/negocios-client.tsx"
    - "app/(crm)/admin/auditoria/auditoria-client.tsx"
decisions:
  - "Notas borrables se leen aparte (con id) porque la VIEW crm_timeline no expone el id de cada nota"
  - "auditoria-client deja de tener ACTION_LABEL local y consume el mapa central de lib/crm-timeline (sin duplicar copy)"
metrics:
  duration: "~10 min"
  completed: "2026-06-22"
  tasks: 3
  files: 7
---

# Phase 4 Plan 03: Timeline, notas/tareas y filtro de tags del directorio — Summary

Tab Timeline real en la ficha (TL-01) leído de la VIEW `crm_timeline` con el **session client** (RLS-gated por `security_invoker`), server actions de notas/tareas con el contrato de 6 pasos y auditadas, fila de tags `+Tag` en el Resumen y filtro por tag (OR) en el directorio de negocios (PIPE-04 lado directorio).

## Qué se construyó

- **Task 1 — `_content-actions.ts` (TDD):** `createNote`/`editNote`/`deleteNote` + `createTask`/`completeTask`, cada una con `requireAdmin()` primera línea → `zod.parse()` (schemas de Plan 01) → `createAdminClient()` write → throw `update_failed` → `logAudit()` (codes `note.create/edit/delete`, `task.create/complete`) → `revalidatePath(fichaPath)`. `completeTask` setea `completed_at = now()` con `done=true` y `null` al desmarcar; `deleteNote` risk medio. RED (8 tests fallando por módulo ausente) → GREEN (8/8).
- **Task 2 — Tab Timeline:** `page.tsx` agrega la lectura de `crm_timeline` con `createClient()` (session, NO service-role) `.eq('business_id', id) .order('occurred_at' desc) .limit(100)`, más las tags asignadas + catálogo (service-role) y las notas con id (lista borrable). `timeline-entry.tsx` presentacional: icono por kind, badge de actor (OPERADOR/CLIENTE/IA/SISTEMA), título legible vía `actionLabel` central, ts relativo (Hoy/Ayer · HH:MM). `ficha-client.tsx`: tabs reales (Timeline ya no PRONTO), input `+Nota`, alta de tarea, chips de filtro con empty state para Mensajes/Llamadas (D-13), banner "Ir a Bandeja", fila de tags `+Tag` (assignTag/removeTag del foundation), deleteNote detrás de ConfirmDialog. `auditoria-client.tsx` importa el `ACTION_LABEL` central (sin duplicar copy).
- **Task 3 — Filtro de tags del directorio:** `page.tsx` lee `tags` + `entity_tags` (entity_type='business'), mapea `tagIds` por negocio. `negocios-client.tsx` agrega fila de chips compartidos + `filterByTags` (OR) combinado con el filtro tab+query (AND entre dimensiones); "Limpiar filtros" resetea las tags. Export CSV y navegación de filas intactos.

## Verificación

- `npx vitest run` → **172 passed (16 files)**, incluidos los 8 nuevos de `_content-actions.test.ts`.
- `npx tsc --noEmit -p tsconfig.json` → **sin errores**.
- `npm run build` → **Compiled successfully**; rutas `/admin/negocios`, `/admin/negocios/[id]`, `/admin/auditoria` presentes.

## Seguridad (threat register)

- **T-04-10 (Info disclosure):** `crm_timeline` se lee con session client (`createClient`) → hereda la RLS admin-read vía `security_invoker`; `.eq('business_id', id)` evita fuga cross-entidad. NUNCA service-role en esa lectura.
- **T-04-11 (Tampering):** todas las content actions con `requireAdmin()` primera línea + `zod.parse()` segunda.
- **T-04-12 (Repudiation):** `logAudit` en cada content action; las entradas caen en el propio timeline del negocio.
- **T-04-14 (Tampering destructivo):** `deleteNote` risk medio detrás de ConfirmDialog + requireAdmin.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Lectura de notas con id para el deleteNote**
- **Found during:** Task 2
- **Issue:** El plan pide `deleteNote` detrás de ConfirmDialog, pero la VIEW `crm_timeline` no expone el id de cada nota → no había forma de identificar qué nota borrar.
- **Fix:** Se agregó una lectura adicional en `page.tsx` (`notes.select('id, body, created_at').eq('business_id', id)`, service-role tras el guard) y una sección de notas borrables en el tab Timeline. Aditivo, no rompe el timeline.
- **Files modified:** `app/(crm)/admin/negocios/[id]/page.tsx`, `ficha-client.tsx`
- **Commit:** 32dd8b1

**2. [Decisión] ACTION_LABEL central en vez de extender el mapa local**
- El plan (Task 2) describía extender el `ACTION_LABEL` local de `auditoria-client.tsx`. El foundation (Plan 01) ya exportaba el mapa central completo en `lib/crm-timeline.ts` con todos los codes de Phase 4. Para respetar la prohibición "no inventar etiquetas en dos lugares", se importó `actionLabel` central en `auditoria-client` y `timeline-entry` (single source of truth), en vez de duplicar el mapa.
- **Files modified:** `app/(crm)/admin/auditoria/auditoria-client.tsx`, `components/crm/timeline-entry.tsx`
- **Commit:** 32dd8b1

## Known Stubs

- **Banner "Ir a Bandeja"** (timeline) y filtros **Mensajes/Llamadas** muestran empty state intencional (D-13): la fuente de datos llega con la Bandeja (Phase 6). Documentado en el plan, no bloquea TL-01.

## Self-Check: PASSED

- Archivos creados verificados en disco (FOUND): `_content-actions.ts`, `_content-actions.test.ts`, `timeline-entry.tsx`.
- Archivos modificados verificados (FOUND): `page.tsx` (ficha), `ficha-client.tsx`, `negocios/page.tsx`, `negocios-client.tsx`, `auditoria-client.tsx`.
- Commits verificados: `06f3f2f` (test RED), `5bffd6e` (content actions), `32dd8b1` (timeline tab), `42cc4ee` (filtro tags directorio).
