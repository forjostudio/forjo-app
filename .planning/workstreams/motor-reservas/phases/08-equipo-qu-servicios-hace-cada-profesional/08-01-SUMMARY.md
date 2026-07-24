---
phase: 08-equipo-qu-servicios-hace-cada-profesional
plan: 01
subsystem: database
tags: [supabase, rls, postgres, multi-tenant, staff-services, migration, vitest, typescript]

# Dependency graph
requires:
  - phase: 03-espacio-compartido
    provides: "molde de tabla puente per-tenant + RLS (agenda_spaces, migr. 042) que 057 replica"
provides:
  - "Tabla puente professional_services (migr. 057): profesional↔servicio muchos-a-muchos por negocio, RLS + 4 policies por op, índice inverso, sin anon"
  - "interface ProfessionalService en lib/types.ts (snake_case espejo de la fila DB)"
  - "lib/staff-services.ts: helper puro de la regla del comodín (D-01/D-12) — fuente única para UI/RPC/grilla pública"
  - "test/staff-services.test.ts: suite vitest que congela la regla del comodín y la cobertura"
affects: [09-asignacion-atomica-book-slot-atomic, 10-reserva-publica-cualquiera, "app/(dashboard)/equipo", "app/(dashboard)/servicios", settings-client]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tabla puente per-tenant hermana de agenda_spaces (business_id/FKs NOT NULL, PK compuesta, ON DELETE CASCADE, RLS + 4 policies WITH CHECK, sin anon)"
    - "Regla de dominio (comodín D-01) encerrada en un helper puro testeable sin DB, consumido idéntico por 3 capas (molde lib/booking-window.ts)"

key-files:
  created:
    - supabase/migrations/057_professional_services.sql
    - lib/staff-services.ts
    - test/staff-services.test.ts
  modified:
    - lib/types.ts
    - supabase/schema.sql

key-decisions:
  - "057 es idempotente (create table if not exists, drop policy if exists) y se aplica A MANO a prod (+ NOTIFY pgrst 'reload schema'), nunca por el flujo GSD (D-11b)"
  - "La regla del comodín NO vive en la DB: cero backfill; sin filas = capaz de todo. La encierra lib/staff-services.ts (D-12)"
  - "Índice inverso professional_services_by_service (service_id, professional_id) que agenda_spaces no necesitó, para la query de cobertura (STAFF-02) y la Phase 9"
  - "057 no toca professionals.service_id (canchas, migr. 043) ni el motor (RPC/constraints 011/013)"

patterns-established:
  - "Puente per-tenant + RLS por op WITH CHECK sin anon (057 = agenda_spaces con service en vez de space)"
  - "Helper puro como fuente única de una regla compartida entre UI, RPC y superficie pública"

requirements-completed: [STAFF-01, STAFF-02, STAFF-03]

# Metrics
duration: ~18min
completed: 2026-07-24
status: complete
---

# Phase 8 Plan 01: Modelo staff↔servicios (migr. 057) + regla del comodín Summary

**Tabla puente `professional_services` (migr. 057) con RLS por tenant + índice inverso, la interface `ProfessionalService`, y el helper puro `lib/staff-services.ts` que encierra la regla del comodín (D-01) con 8 tests verdes — 057 validada con `supabase db reset` local (replay 001→057 limpio, aplicada) y confirmada en schema.sql.**

## Performance

- **Duration:** ~18 min
- **Completed:** 2026-07-24
- **Tasks:** 3 de 3
- **Files modified:** 5

## Accomplishments
- Migración 057: tabla puente `professional_services` (business_id/professional_id/service_id NOT NULL, PK compuesta, ON DELETE CASCADE) + RLS habilitada en la misma migración + 4 policies por operación (select/delete USING, insert WITH CHECK, update ambas), sin policy anon + índice inverso `professional_services_by_service`.
- `interface ProfessionalService` en `lib/types.ts`, snake_case espejo de la fila DB, junto a `AgendaSpace`.
- `lib/staff-services.ts`: helper puro (sin React/Supabase) con `servicesForProfessional`, `professionalsForService`, `isServiceCovered` — fuente única de la regla del comodín (D-01/D-12).
- `test/staff-services.test.ts`: 8 tests que congelan comodín (0 filas = todo), mapeo explícito, último desmarcado = sin cobertura, comodín presente = todo cubierto, inactivo excluido, y consistencia entre `isServiceCovered` y `professionalsForService`.
- `supabase/schema.sql` actualizado quirúrgicamente (tabla + PK + 3 FKs + índice + ENABLE RLS + 4 policies + grants), coherente con la 057.

## Task Commits

1. **Task 1: Migración 057 + tipo TS + schema.sql** - `77b3508` (feat)
2. **Task 2 (TDD RED): tests de la regla del comodín** - `57deac4` (test)
3. **Task 2 (TDD GREEN): helper puro lib/staff-services.ts** - `19e8e01` (feat)
4. **Task 3: [BLOCKING] validar 057 con `supabase db reset`** - APROBADO (checkpoint human-action, sin commit de código)

## Files Created/Modified
- `supabase/migrations/057_professional_services.sql` - Tabla puente + RLS + 4 policies + índice inverso, idempotente, header denso en español.
- `lib/types.ts` - Interface `ProfessionalService`.
- `supabase/schema.sql` - Sección `professional_services` agregada quirúrgicamente.
- `lib/staff-services.ts` - Helper puro de la regla del comodín (3 funciones).
- `test/staff-services.test.ts` - Suite vitest (8 tests) de la regla + cobertura.

## Decisions Made
- Ninguna desviación de diseño: se siguió el plan y el patrón de `agenda_spaces` (migr. 042) al pie.
- `isServiceCovered` se define como `professionalsForService(...).length > 0` para garantizar por construcción que ambas funciones nunca deriven (un test lo verifica explícitamente).

## Deviations from Plan

None - plan executed exactly as written (porción autónoma).

## Issues Encountered

- **`npx vitest run` completo:** 748 passed, 1 skipped, **7 failed** — los 7 fallos están todos en `test/abono-*.test.ts` (integración contra la Supabase LOCAL). Son PRE-EXISTENTES / ambientales: el estado de la DB local está desactualizado y su reset es exactamente el Task 3 pendiente. Los cambios de este plan son aditivos (tabla nueva NO aplicada aún al DB local, helper puro, interface) y ningún archivo `abono-*` importa `staff-services`, así que no pueden ser causados por este trabajo. Fuera de alcance (SCOPE BOUNDARY). La suite `staff-services` (objetivo de este plan) pasa 8/8 y `tsc --noEmit` está limpio.

## Verification (autónoma)
- `npx vitest run test/staff-services.test.ts` → 8/8 verdes.
- `node ./node_modules/typescript/bin/tsc --noEmit` → limpio.
- Greps de acceptance Task 1: 4 policies, `with check` ≥ 2, ENABLE RLS = 1, índice inverso presente, `create or replace function` = 0, `book_slot_atomic` = 0, `interface ProfessionalService` = 1, `professional_services` en schema.sql.

## Task 3 — Validación de la migración 057 (checkpoint [BLOCKING] APROBADO)
El operador corrió `npx supabase db reset` y el coordinador validó la evidencia:
- `supabase migration list --local` muestra la **057 aplicada** (replayó 001→057 sin abortar; si el SQL fallara, el reset abortaba y la 057 no figuraría) — prueba que es idempotente, ordena bien y no choca con constraints previos.
- `supabase/schema.sql` (refleja la DB local post-reset) confirma: tabla `professional_services`, `ENABLE ROW LEVEL SECURITY`, **4 policies** tenant (select/insert/update/delete, insert con `WITH CHECK`, gateadas por `business_id IN (SELECT businesses.id ...)`), e índice inverso `professional_services_by_service (service_id, professional_id)`.
- El `GRANT ALL ... TO anon` es el auto-grant estándar de Supabase (idéntico en `agenda_spaces`/`clients`); **0 policies mencionan el rol `anon`**, así que anon no matchea ninguna fila — sin exposición real.

**Aplicación a PRODUCCIÓN = paso manual/out-of-band aparte** que hace el dueño en el deploy (+ `NOTIFY pgrst, 'reload schema';`), nunca por el flujo GSD. Este plan no incluye ningún comando que escriba en la Supabase remota.

## Next Phase Readiness
- El modelo + la regla del comodín quedan listos como espinazo para la UI del resto de la Phase 8 (Plan 02: `/equipo` y `/servicios` con chips optimistas + cobertura) y para la Phase 9 (asignación atómica dentro de `book_slot_atomic`) y Phase 10 (grilla pública).
- 08-01 **completo** (3/3 tasks). Pendiente operativo aguas abajo: aplicar la 057 a prod a mano en el próximo deploy.

## Self-Check: PASSED

Todos los archivos creados existen (057, lib/staff-services.ts, test, SUMMARY) y los 3 commits (77b3508, 57deac4, 19e8e01) están en el historial.

---
*Phase: 08-equipo-qu-servicios-hace-cada-profesional*
*Completed: 2026-07-24 — 3/3 tasks (Task 3 checkpoint aprobado con evidencia del reset local)*
