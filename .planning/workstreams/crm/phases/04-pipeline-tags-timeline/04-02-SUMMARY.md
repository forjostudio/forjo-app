---
phase: 04-pipeline-tags-timeline
plan: 02
subsystem: crm-pipeline
tags: [crm, pipeline, kanban, dnd, drag-and-drop, server-actions, conversion, onboarding, tags, audit, vitest]

# Dependency graph
requires:
  - phase: 04-pipeline-tags-timeline
    plan: 01
    provides: "STAGES/stageTotals/pipelineSummary (lib/crm-pipeline), filterByTags (lib/crm-tags), schemas zod (_crm-actions.schemas.ts), _tag-actions.ts (assignTag/removeTag), tag-chip.tsx, tablas leads/deals/tags/entity_tags (migración 034)"
  - phase: 02-admin-de-plataforma
    provides: "contrato de 6 pasos de server actions (_actions.ts), requireAdmin/logAudit/createAdminClient, ConfirmDialog"
provides:
  - "app/(crm)/admin/_pipeline-actions.ts: server actions moveStage/createDeal/markLost/convertLead + linkLeadOnSignup (conversión automática aislada)"
  - "app/(crm)/admin/pipeline/page.tsx: RSC service-role que lee deals open + leads + tags + entity_tags y pasa filas no sensibles al client"
  - "app/(crm)/admin/pipeline/pipeline-client.tsx: tablero kanban con DnD nativo HTML5 + filtro de tags OR + resumen $ + Nuevo deal + Marcar perdido"
  - "Conversión automática lead→business en onboarding handleFinish (best-effort, email re-derivado server-side)"
  - "Entrada 'Pipeline' del sidebar activa (/admin/pipeline)"
affects: [04-03-ficha-timeline, 05-reportes-de-ventas]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DnD nativo HTML5 (draggable + dataTransfer + onDragOver/onDrop) con movimiento optimista que se REVIERTE si la server action falla (Pitfall 6: no mentir) — cero dependencias de drag-and-drop"
    - "Conversión cross-boundary aislada: una action que corre bajo sesión no-admin (onboarding) cruza a service-role y re-deriva el email del owner de la sesión (anti-tampering del booking), best-effort try/catch para no romper el flujo"
    - "Contrato de 6 pasos VERBATIM de _actions.ts para las actions auditables (requireAdmin → zod.parse → service-role → leer-prev → mutar/throw → logAudit code exacto → revalidatePath)"

key-files:
  created:
    - "app/(crm)/admin/_pipeline-actions.ts"
    - "app/(crm)/admin/_pipeline-actions.test.ts"
    - "app/(crm)/admin/pipeline/page.tsx"
    - "app/(crm)/admin/pipeline/pipeline-client.tsx"
  modified:
    - "app/(onboarding)/onboarding/page.tsx"
    - "components/crm/crm-sidebar.tsx"

decisions:
  - "DnD nativo HTML5 sin librería (prohibición del plan: zero-install). El drop hace moveStage optimista y revierte el estado local + toast si la action rechaza."
  - "createDeal en el cliente usa un <select> nativo para la etapa (no se introdujo un nuevo Select component) y un Dialog de @/components/ui/dialog para el alta."
  - "Marcar perdido reusa el ConfirmDialog compartido con requireReason (motivo obligatorio); al confirmar saca la tarjeta del tablero optimistamente (status pasa a 'lost')."
  - "linkLeadOnSignup NO usa requireAdmin (corre bajo la sesión del dueño); su guard es la re-derivación del email server-side + service-role. actorId del audit = el owner (no un admin), metadata {auto:true}."

metrics:
  duration: ~16 min
  completed: 2026-06-21
  tasks: 3
  files: 6

status: complete
---

# Phase 4 Plan 02: Tablero de Pipeline, Conversión y Tags Summary

Tablero kanban operable de 5 columnas (las STAGES) con drag-and-drop nativo HTML5, filtro de tags con semántica OR y resumen `$ abiertos · $ ganados`, respaldado por server actions del pipeline (moveStage/createDeal/markLost/convertLead) que siguen el contrato de 6 pasos con auditoría, más la conversión automática lead→business disparada al finalizar el onboarding — aislada bajo service-role con el email del owner re-derivado server-side.

## Qué se construyó

1. **Server actions del pipeline (`_pipeline-actions.ts`, TDD)** — `moveStage` (lee stage previo y audita `deal.stage_change` con metadata `{from,to}`), `createDeal` (reusa lead por email o lo crea, audita `deal.create`), `markLost` (status→lost + lost_reason, audita `deal.mark_lost` riesgo medio), `convertLead` (conversión manual desde el tablero, audita `lead.convert`), y `linkLeadOnSignup` (conversión automática aislada). Las tag actions NO se redefinen acá — se importan del foundation compartido `_tag-actions.ts` (Plan 01, D-08).
2. **Tablero (`pipeline/page.tsx` RSC + `pipeline-client.tsx`)** — el RSC lee con service-role los deals open + sus leads + el catálogo de tags + entity_tags (SELECT explícito, filas no sensibles al client). El client reproduce el mock `02-pipeline.png`: header con resumen `$`, fila de chips de tags (toggle, filtro OR), 5 columnas con su total `$` por columna y tarjetas con contacto/valor/tags, DnD nativo con movimiento optimista revertible, CTA "+ Nuevo deal" y "Marcar perdido".
3. **Hook de conversión en el onboarding (`onboarding/page.tsx`)** — tras el insert exitoso de `businesses` (+ services/professionals/hours), llama `linkLeadOnSignup({ businessId })` en un try/catch best-effort que nunca bloquea el `router.push('/dashboard')`.
4. **Sidebar activado** — la entrada "Pipeline" dejó de ser `soon/#` y apunta a `/admin/pipeline`.

## Verificación

- `npx vitest run` → **164/164** tests verdes (15 archivos; incluye el nuevo `_pipeline-actions.test.ts` con 10 tests: contrato de 6 pasos, metadata {from,to}, y la batería anti-tampering de linkLeadOnSignup).
- `npx tsc --noEmit -p tsconfig.json` → exit 0.
- `npm run build` → pasa; la ruta `/admin/pipeline` aparece en el output. `package.json`/`package-lock.json` sin cambios (cero deps nuevas de DnD).

## Decisiones y notas de seguridad

- **Anti-tampering (T-04-06):** `linkLeadOnSignup` solo acepta `businessId` por schema; el email del owner se re-deriva de `supabase.auth.getUser()` server-side. Aunque un POST directo inyecte `email`/`leadId`, se ignoran (test explícito lo cubre).
- **Elevation of privilege (T-04-05):** la única vía donde un flujo no-admin (sesión del dueño) toca tablas admin-only es `linkLeadOnSignup`, que cruza a service-role; mínima y aislada.
- **DoS del onboarding (T-04-09):** la conversión es best-effort; un fallo hace `console.error` y no rompe la creación del negocio ni el redirect.
- **No mentir en el DnD (Pitfall 6):** el movimiento optimista se revierte al estado previo + toast si `moveStage` rechaza.

## Deviations from Plan

None — plan executed as written. La asignación/quita de tags por tarjeta desde el tablero queda disponible vía las actions importadas (`assignTag`/`removeTag`); el plan priorizó el filtro y los chips por tarjeta para reproducir el mock, que es lo construido. El sidebar, el resumen `$`, el DnD revertible y la conversión dual quedaron tal cual el spec.

## TDD Gate Compliance

Task 1 (`tdd="true"`) cumplió RED→GREEN: commit `test(04-02)` con la suite fallando (módulo inexistente) → commit `feat(04-02)` con la implementación y 10/10 verdes. No hubo fase REFACTOR (no necesaria).

## Self-Check: PASSED
