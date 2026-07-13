---
phase: 01-reconciliaci-n-de-horarios
plan: 01
subsystem: ui
tags: [onboarding, time_blocks, supabase, react, horarios, multi-tenant]

# Dependency graph
requires: []
provides:
  - "Paso de horarios del onboarding escribe time_blocks (fuente única canónica) en vez de business_hours"
  - "Soporte de horario partido en el alta: N bloques por día (día → { enabled, blocks[] })"
  - "0 referencias a business_hours en app/(onboarding)/onboarding/page.tsx"
affects: [01-02, 01-03, drop-business_hours, landing-hours, agent-context, onboarding-rework]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Estado día→{ enabled, blocks[] } para horarios (patrón del panel agenda-client.tsx, sin location/consultorio)"
    - "Insert de time_blocks con business_id de la sesión (business.id), capacity=1, location_id=null, label=null"

key-files:
  created: []
  modified:
    - app/(onboarding)/onboarding/page.tsx

key-decisions:
  - "Modelo de horarios del onboarding pasa de una ventana open/close por día a lista de bloques por día (D-04 horario partido)"
  - "capacity=1, location_id=null, label=null fijos en el insert: el onboarding no maneja sedes ni cupos"
  - "Día sin bloques = cerrado = no se inserta fila (día cerrado por ausencia, no por flag)"
  - "validateHours() bloquea Finalizar si algún bloque tiene fin <= inicio (error inline)"

patterns-established:
  - "Onboarding replica el patrón de bloques del panel (agenda-client.tsx) adaptado a un solo eje día"

requirements-completed: [SCHED-01]

# Metrics
duration: 5min
completed: 2026-07-03
status: complete
---

# Phase 01 Plan 01: Onboarding escribe time_blocks (con horario partido) Summary

**El paso "Horarios de atención" del onboarding ahora inserta `time_blocks` (fuente única que ya leen panel y booking) con soporte de horario partido, en vez de escribir la tabla huérfana `business_hours`.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-07-03T16:11:25Z
- **Completed:** 2026-07-03T16:16:07Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- El estado del paso de horarios pasó de `HourConfig[]` (una ventana open/close por día) a `DayState[]` (día → `{ enabled, blocks[] }`), habilitando horario partido (ej. Lun 9-12 y 15-19).
- `handleFinish` inserta `time_blocks` con `business_id: business.id`, `day_of_week`, `start_time`, `end_time`, `label: null`, `location_id: null`, `capacity: 1` — el shape exacto del panel (`agenda-client.tsx:saveHours`). Los horarios del alta ahora llegan al panel de agenda y al booking público (cierre de la brecha SCHED-01).
- Días sin bloques no generan filas (día cerrado por ausencia). Insert único solo si hay bloques.
- `validateHours()` valida fin > inicio por bloque con error inline y bloquea el Finalizar si hay un bloque inválido.
- 0 referencias a `business_hours` en el módulo del onboarding.

## Task Commits

Cada task se commiteó atómicamente:

1. **Task 1: Modelar el estado de horarios como bloques por día (split)** - `4a6edca` (feat)
2. **Task 2: Insertar time_blocks en handleFinish (reemplazando business_hours)** - `620123e` (feat)

**Plan metadata:** `.planning/` está gitignored en este proyecto → el commit de docs (SUMMARY/STATE/ROADMAP) se saltea intencionalmente (skipped_gitignored, path de éxito esperado).

## Files Created/Modified
- `app/(onboarding)/onboarding/page.tsx` — Nuevo estado `DayState[]`/`HourBlock`, helpers `toggleDay`/`addBlock`/`removeBlock`/`updateBlock`/`validateHours`, Step 4 rehecho con bloques (inputs time + "Agregar bloque" Plus + quitar Trash2), y `handleFinish` insertando `time_blocks`. Eliminados `HourConfig`, `DEFAULT_HOURS`, `updateHour` y el insert a `business_hours`.

## Decisions Made
- Se siguió el patrón de bloques del panel (`agenda-client.tsx`) adaptado a un solo eje día — el onboarding no maneja consultorios, así que `location_id` es siempre `null` y no se validó solapamiento (solo fin > inicio).
- Interim commit de Task 1: como ambas tasks tocan el mismo archivo y no compilan por separado, Task 1 se committeó con un stub `TODO(Task 2)` (`void dayStates`) para dejar un commit atómico que compila; Task 2 reemplazó el stub por el insert real. Sin churn residual en el archivo final.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `npm run lint` reporta ~590 problemas en el repo, 3 de ellos en `onboarding/page.tsx`. Verificado con `git stash` + re-lint del baseline: **los 3 son pre-existentes** (`react-hooks/immutability` en `selectPalette`/`document.documentElement`, `react-hooks/set-state-in-effect` en el `setSlug` del slugify) y **NO fueron introducidos por este plan** (el conteo se mantuvo en 3 antes y después). Fuera de scope (SCOPE BOUNDARY). Registrados en `deferred-items.md`. Candidatos al rework de onboarding de Phase 2. `npx tsc --noEmit` pasa limpio.

## Threat Flags

Ninguna superficie nueva. El insert usa `business.id` de la sesión (T-01-01 mitigado: business_id nunca del cliente); RLS de `time_blocks` por `business_id` ya vigente; sin service-role, sin superficie anónima.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Escritor migrado (onboarding → time_blocks). Los 3 **lectores** de `business_hours` (landing derive, landing hours component, agent-context) migran en 01-02 (D-05) **antes** del DROP.
- El DROP de `business_hours` (migración 046, D-03) es 01-03: debe correr DESPUÉS de que 01-01 + 01-02 dejen 0 lectores/escritores vivos de la tabla. Este plan ya deja el onboarding sin referencias.

## Self-Check: PASSED

- FOUND: `app/(onboarding)/onboarding/page.tsx`
- FOUND: `01-01-SUMMARY.md`
- FOUND commit: `4a6edca` (Task 1)
- FOUND commit: `620123e` (Task 2)

---
*Phase: 01-reconciliaci-n-de-horarios*
*Completed: 2026-07-03*
