---
phase: 04-pipeline-tags-timeline
plan: 04
subsystem: crm-pipeline
tags: [pipeline, server-actions, tdd, gap-closure, audit]
status: complete
requires:
  - "_pipeline-actions.ts (markLost como espejo)"
  - "_crm-actions.schemas.ts (id = z.uuid)"
  - "lib/crm-timeline.ts (ACTION_LABEL central)"
  - "lib/audit.ts (logAudit)"
provides:
  - "markWon server action (status='won', audita 'deal.won' risk bajo, sin tocar stage)"
  - "markWonSchema + MarkWonInput"
  - "label 'deal.won' en ACTION_LABEL (single source of truth del copy)"
  - "createDeal con reuse-by-email acotado a leads activos (business_id IS NULL)"
affects:
  - "Plan 04-06 (UI: botón Marcar ganado + wonTotal server-side)"
  - "visor de auditoría / timeline (consume 'deal.won')"
tech-stack:
  added: []
  patterns:
    - "Contrato de 6 pasos de server action (requireAdmin -> zod.parse -> service-role -> mutar -> logAudit -> revalidatePath)"
    - "reuse-by-email acotado con .is('business_id', null) para no resucitar leads convertidos"
    - "mock makeQuery extendido con .is() + QueryCtx para distinguir lookups por filtro en tests"
key-files:
  created: []
  modified:
    - "app/(crm)/admin/_pipeline-actions.ts"
    - "app/(crm)/admin/_pipeline-actions.test.ts"
    - "app/(crm)/admin/_crm-actions.schemas.ts"
    - "lib/crm-timeline.ts"
decisions:
  - "markWon es una acción explícita (espejo de markLost), NO se acopla stage<->status (D-04: ortogonales)"
  - "markWon audita con risk 'bajo' (ganar no es destructivo, a diferencia de mark_lost = medio)"
  - "createDeal NO reusa leads convertidos: el reuse-by-email se acota a business_id IS NULL; sin lead activo se crea uno nuevo con data.leadName"
metrics:
  duration: "~12 min"
  completed: "2026-06-22"
  tasks: 2
  files: 4
  commits: 2
---

# Phase 04 Plan 04: Cierre de gaps backend del pipeline (markWon + reuse-by-email acotado) Summary

`markWon` (espejo de `markLost`, status='won', audita 'deal.won' risk bajo sin tocar stage) más `createDeal` con reuse-by-email acotado a leads activos (`business_id IS NULL`), todo cubierto por TDD RED→GREEN — cierra los gaps test 5 (ganados) y test 4b (reuse de lead convertido) del 04-UAT.

## Qué se construyó

Cierre de dos gaps del UAT en la capa de server actions del pipeline:

- **Gap test 5 (ganados):** no existía ninguna acción para marcar un deal como ganado, por lo que `$ ganados` quedaba siempre en $0. Se implementó `markWon({ dealId })` siguiendo el contrato de 6 pasos verbatim (espejo de `markLost`): setea `status='won'`, audita `'deal.won'` con `risk: 'bajo'` y `targetId` del deal, y NO toca `stage` (D-04: stage y status son ortogonales). La UI (botón "Marcar ganado" + `wonTotal` server-side) llega en 04-06.
- **Gap test 4b (reuse de lead):** `createDeal` reusaba cualquier lead con ese email, incluso uno ya convertido, y nunca actualizaba el nombre. Se acotó el lookup de reuse con `.is('business_id', null)`: solo se reusa un lead activo; si no hay, se cae a la rama existente que crea un lead nuevo con `data.leadName`. Un email de un lead convertido ya no permite re-vincular ni renombrar un lead ajeno.

Soporte: `markWonSchema` en `_crm-actions.schemas.ts`, label `'deal.won': 'Marcó ganado'` en el `ACTION_LABEL` central de `lib/crm-timeline.ts` (single source of truth del copy).

## Tasks completadas

| Task | Nombre | Commit | Archivos |
| ---- | ------ | ------ | -------- |
| 1 (RED) | Schema + label + tests RED de markWon | 333a0e5 | _crm-actions.schemas.ts, lib/crm-timeline.ts, _pipeline-actions.test.ts |
| 2 (GREEN) | Implementar markWon + acotar createDeal reuse | fb400ec | _pipeline-actions.ts, _pipeline-actions.test.ts |

## TDD Gate Compliance

- RED: commit `test(04-04)` con 5 tests fallando (4 de markWon por `markWon is not a function` + 1 del lead convertido reusado incorrectamente).
- GREEN: commit `feat(04-04)` — 16/16 verdes en `_pipeline-actions.test.ts`, suite completa 172 passed, `tsc --noEmit` exit 0.
- Secuencia de gates verificada en git log (test() antes de feat()).

## Decisiones

- **markWon explícito, no acoplado a stage:** decisión del usuario (D-04). markWon solo toca `status`; el `stage` queda donde estaba.
- **risk 'bajo' para markWon:** ganar no es una operación destructiva (a diferencia de `mark_lost` que es `medio`).
- **reuse acotado server-side:** el cliente no controla qué lead se reusa; el filtro `business_id IS NULL` se aplica en el query (T-04-16 mitigado).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Lógica del mock del test del lead convertido corregida en GREEN**
- **Found during:** Task 2
- **Issue:** El mock del caso "lead YA CONVERTIDO" (escrito en el commit RED) discriminaba al revés: con el lookup acotado (`.is('business_id', null)`) devolvía un id, haciendo que `createDeal` lo reusara y nunca insertara un lead nuevo — el test fallaba incluso con la implementación correcta.
- **Fix:** El handler ahora devuelve `null` cuando se aplica el filtro `.is('business_id', null)` (lookup acotado: no hay lead activo con ese email) y el id nuevo solo en el insert posterior (que no aplica el filtro). Esto mantiene el comportamiento RED (sin `.is`, el lookup encuentra el convertido y lo reusa → falla) y GREEN (con `.is`, no lo encuentra → inserta → pasa).
- **Files modified:** app/(crm)/admin/_pipeline-actions.test.ts
- **Commit:** fb400ec

## Verification

- `npx vitest run app/(crm)/admin/_pipeline-actions.test.ts` → 16/16 verde.
- `npx vitest run` (suite completa) → 172 passed | 6 skipped.
- `npx tsc --noEmit -p tsconfig.json` → exit 0.
- `grep "deal.won"` presente en `lib/crm-timeline.ts` (label) y `_pipeline-actions.ts` (audit action).
- `markWon` no contiene ningún update de `stage` (verificado: 0 referencias a stage en el cuerpo de la action).

## Known Stubs

Ninguno. La UI que consume `markWon` (botón + `wonTotal`) es scope explícito de 04-06 (Wave 2, depends_on 04-04); este plan es solo el backbone de mutación + auditoría.

## Self-Check: PASSED
- markWon exportada en _pipeline-actions.ts: FOUND
- markWonSchema en _crm-actions.schemas.ts: FOUND
- label 'deal.won' en lib/crm-timeline.ts: FOUND
- commit 333a0e5 (RED): FOUND
- commit fb400ec (GREEN): FOUND
