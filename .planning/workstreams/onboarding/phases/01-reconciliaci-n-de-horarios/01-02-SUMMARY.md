---
phase: 01-reconciliaci-n-de-horarios
plan: 02
subsystem: api
tags: [time_blocks, whatsapp-agent, supabase, vitest, tdd]

# Dependency graph
requires:
  - phase: 01-reconciliaci-n-de-horarios (Plan 01)
    provides: onboarding escribe time_blocks (no business_hours) como fuente única de horarios
provides:
  - El endpoint del agente (/api/agent/context) deriva horarios de time_blocks
  - Mapeo puro mapTimeBlocks(time_blocks → hours[] del HANDOFF, 7 días con ranges HH:MM)
  - 0 lectores/escritores vivos de business_hours en app/lib/components (habilita el DROP del Plan 03)
affects: [01-03 (DROP business_hours), secure-phase, agente WhatsApp]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Derivar horario por día agrupando time_blocks por day_of_week acumulando TODOS los ranges (horario partido); día sin bloques = cerrado (sin is_open)"
    - "Mapeo puro (sin Supabase/React) testeado con Vitest; el route handler queda delgado (solo I/O)"

key-files:
  created: []
  modified:
    - lib/agent-context.ts
    - app/api/agent/context/route.ts
    - lib/agent-context.test.ts

key-decisions:
  - "mapBusinessHours renombrado a mapTimeBlocks; TimeBlockRow (day_of_week/start_time/end_time) reemplaza a BusinessHourRow"
  - "Shape del HANDOFF (hours[] = 7 días con ranges HH:MM) preservado idéntico → el bot no requiere cambios"
  - "Mapper GREEN (agent-context.ts) + route commiteados juntos para mantener tsc verde en cada commit (el rename rompe atómicamente el route)"

patterns-established:
  - "Migración de lector business_hours→time_blocks: agrupar por day_of_week, cada bloque = un range, sin is_open"

requirements-completed: [SCHED-02]

# Metrics
duration: ~12min
completed: 2026-07-03
status: complete
---

# Phase 01 Plan 02: El agente de WhatsApp deriva horarios de time_blocks Summary

**El endpoint del agente (/api/agent/context) migra de business_hours a time_blocks vía mapTimeBlocks, agrupando por día con horario partido y preservando idéntico el contrato del HANDOFF hacia el bot.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-03T16:10:00Z (aprox.)
- **Completed:** 2026-07-03T16:22:00Z
- **Tasks:** 2 (ambas TDD)
- **Files modified:** 3

## Accomplishments
- `lib/agent-context.ts`: `mapBusinessHours` → `mapTimeBlocks` — agrupa filas de `time_blocks` (day_of_week/start_time/end_time) por día, acumulando cada bloque como un range (horario partido). Sin `is_open`: bloque presente = abierto; día sin bloques = cerrado (`ranges:[]`). Recorte a HH:MM vía slice(0,5). Tolerante a null/undefined.
- `app/api/agent/context/route.ts`: lee `from('time_blocks').select('day_of_week, start_time, end_time').eq('business_id', ...)` en vez de `business_hours`. Resto del endpoint (service-role por slug, force-dynamic, shape de respuesta, headers no-store) intacto.
- Contrato del HANDOFF (`hours[]` = 7 días con `ranges HH:MM`) idéntico → el bot NO cambia.
- 0 referencias vivas a `business_hours`/`mapBusinessHours`/`BusinessHourRow` en los archivos del agente (SCHED-02 completo; habilita el DROP del Plan 03).

## Task Commits

Ambas tasks son TDD (test → feat):

1. **Task 1 (RED): mapTimeBlocks agrupa time_blocks por día** — `7c80643` (test)
2. **Task 1+2 (GREEN): agente deriva horarios de time_blocks** — `931299f` (feat)

_Nota: el mapper (Task 1 GREEN) y el route (Task 2) se commitearon juntos en `931299f` porque el rename `mapBusinessHours`→`mapTimeBlocks` rompe el route de forma atómica; separarlos dejaría un commit intermedio con `tsc` roto. El test RED (`7c80643`) cubre la nueva entrada antes de la implementación._

## Files Created/Modified
- `lib/agent-context.ts` - `mapBusinessHours`/`BusinessHourRow` → `mapTimeBlocks`/`TimeBlockRow`; agrupa time_blocks por día en el shape del HANDOFF (horario partido, sin is_open)
- `app/api/agent/context/route.ts` - lee `time_blocks` en vez de `business_hours`; llama `mapTimeBlocks`
- `lib/agent-context.test.ts` - describe de horarios reescrito a entrada time_blocks (day_of_week/start_time/end_time); casos: horario partido, día sin bloques = cerrado, null-tolerancia. `mapServices` intacto

## Decisions Made
- Renombre semántico `mapBusinessHours`→`mapTimeBlocks` y `BusinessHourRow`→`TimeBlockRow` para alinear con la fuente real (el plan lo pedía explícitamente).
- Se quitó el caso de test "ignora is_open=false" (ya no existe `is_open` en time_blocks) y se reemplazó por "día sin bloques = cerrado", conservando el resto de las aserciones de salida.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. El único matiz de ejecución fue commitear el mapper GREEN y el route juntos (documentado arriba) para no dejar un commit intermedio con `tsc` roto por el rename atómico.

## Verificación
- `npx vitest run lib/agent-context.test.ts` → 8/8 verde (mockeado, sin tocar DB).
- `npx tsc --noEmit` → sin errores.
- `npx eslint lib/agent-context.ts lib/agent-context.test.ts app/api/agent/context/route.ts` → 0 problemas en los archivos tocados (el repo tiene 460 errores lint PRE-EXISTENTES fuera de scope — no se tocaron; SCOPE BOUNDARY).
- grep repo-wide de `business_hours`/`mapBusinessHours`/`BusinessHourRow` en los 3 archivos del agente → 0 referencias (las 2 menciones restantes en `lib/landing/derive.ts` y `components/landing/hours.tsx` son comentarios "NO business_hours", no lecturas).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SCHED-02 completo: el agente ya lee time_blocks (misma fuente que panel/booking/landing).
- Tras Plan 01 + Plan 02, no quedan lectores/escritores vivos de `business_hours` en `app/`, `lib/`, `components/`. **Plan 03 puede ejecutar el DROP de `business_hours` (migración 046) con seguridad.**
- El bot de WhatsApp no requiere cambios (contrato del HANDOFF preservado).

## Self-Check: PASSED

- FOUND: lib/agent-context.ts
- FOUND: app/api/agent/context/route.ts
- FOUND: lib/agent-context.test.ts
- FOUND: 01-02-SUMMARY.md
- FOUND commit: 7c80643 (test RED)
- FOUND commit: 931299f (feat GREEN)

---
*Phase: 01-reconciliaci-n-de-horarios*
*Completed: 2026-07-03*
