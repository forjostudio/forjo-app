---
phase: 03-rework-del-selector-de-rubro
plan: 01
subsystem: database
tags: [supabase, migration, verticals, backfill, vitest]

requires:
  - phase: 02-rework-ux-del-onboarding
    provides: auto-hide de canchas por vertical (D-03) que 03-02 re-keyea
provides:
  - "Migración 047: backfill aditivo de businesses.vertical desde type (WHERE vertical IS NULL, CASE total)"
  - "lib/verticals.ts: label belleza 'Belleza/Estética/Spa', VERTICALS[*].types vacíos, ALL_BUSINESS_TYPES borrado"
  - "Helpers RUBRO_PLACEHOLDERS (D-06) y getVerticalLabel (D-03) exportados desde lib/verticals.ts"
affects: [03-02-selector, 03-03-booking-fallback]

tech-stack:
  added: []
  patterns:
    - "Backfill SQL aditivo (UPDATE ... WHERE col IS NULL, CASE total con ELSE) previo a vaciar la fuente de derivación en código"
    - "Test que congela el CASE de una migración como snapshot manual (documentación viva del contrato)"

key-files:
  created:
    - supabase/migrations/047_backfill_vertical.sql
    - test/verticals.test.ts
  modified:
    - lib/verticals.ts

key-decisions:
  - "vertical = fuente de resolución; type = texto libre de display (D-07). Backfill preserva existentes antes de vaciar los types (D-08)."
  - "ALL_BUSINESS_TYPES era código muerto (0 importadores) — borrado, no adaptado. La 'sugerencia por IA' del comentario no existía en código."
  - "getVerticalKeyByType y LEGACY_TYPE_VERTICAL se conservan como fallback para filas sin vertical."

patterns-established:
  - "Migración data-only no regenera schema.sql (confirmado: git diff schema.sql vacío)."

requirements-completed: [ONB-RUBRO-01, ONB-RUBRO-02]  # cobertura parcial; se completan al cerrar 03-02/03-03

duration: 20 min
completed: 2026-07-04
status: complete
---

# Phase 3 Plan 01: Base de datos + lib del selector de rubro — Summary

**Migración 047 de backfill de `businesses.vertical` desde `type` + rework de `lib/verticals.ts` (label belleza, `types` vacíos, dead code borrado, helpers `RUBRO_PLACEHOLDERS`/`getVerticalLabel`), con test que congela el CASE.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-04
- **Tasks:** 3 auto + 1 checkpoint (human-verify, aprobado)
- **Files modified:** 3 (1 migración nueva, 1 lib modificada, 1 test nuevo)

## Accomplishments
- Migración 047 aditiva/no destructiva: escribe `vertical` donde falta derivándolo del `type` por fila; no toca `type`; `WHERE vertical IS NULL`; CASE total (`ELSE 'general'`) → cero filas huérfanas.
- `lib/verticals.ts` reworkeado: label belleza → "Belleza/Estética/Spa", los 4 `VERTICALS[*].types` vacíos, `ALL_BUSINESS_TYPES` (dead code) borrado, helpers `RUBRO_PLACEHOLDERS` + `getVerticalLabel` agregados; `resolveVertical`/`getVerticalKeyByType`/`LEGACY_TYPE_VERTICAL` intactos.
- 10 tests (Vitest) congelan el label, los placeholders D-06, el fallback de filas viejas y el CASE de 047.
- Validación local: `supabase db reset` exit 0 + backfill probado en PG real (Peluquería→belleza, Estética→belleza, Cancha de pádel→canchas, Médico→salud, libre→general) + 0 filas con vertical NULL.

## Task Commits

1. **Task 1: Migración 047 backfill** - `edd90a1` (feat)
2. **Task 2: Rework lib/verticals.ts** - `eb681ce` (refactor)
3. **Task 3: Test que congela el CASE** - `c3cbaab` (test)

## Files Created/Modified
- `supabase/migrations/047_backfill_vertical.sql` - Backfill aditivo de `vertical` desde `type` (CASE, WHERE vertical IS NULL).
- `lib/verticals.ts` - Label belleza, `types` vacíos, dead code borrado, `RUBRO_PLACEHOLDERS` + `getVerticalLabel`.
- `test/verticals.test.ts` - Congela label + placeholders + CASE de 047 (10 tests).

## Decisions Made
- `type` deja de ser semántico para el sistema; el vertical se resuelve por la columna `vertical` (D-07). El backfill es el seguro de cero regresión para filas existentes antes de vaciar los `types` (D-08).
- Borrar `ALL_BUSINESS_TYPES` en vez de adaptarlo: el research confirmó 0 importadores y que la "sugerencia por IA" del comentario no existe en el código.

## Deviations from Plan

### Auto-fixed Issues

**1. [Scope boundary] `npm run lint` (project-wide) no puede pasar por baseline de lint pre-existente**
- **Found during:** Task 2 (verify de acceptance_criteria)
- **Issue:** El proyecto tiene ~460 errores de lint PRE-EXISTENTES no relacionados con esta fase (React Compiler `preserve-manual-memoization` en componentes del dashboard + `design_handoff_forjo_rebrand/preview/app.js`). El acceptance criterion literal `npm run lint` (todo el proyecto) devuelve exit≠0 independientemente de este cambio.
- **Fix:** Verifiqué que MI archivo introduce cero errores nuevos: `npx eslint lib/verticals.ts` → exit 0, y `npx tsc --noEmit` → exit 0. No toqué los issues pre-existentes (regla de scope boundary: no auto-fixear problemas ajenos a la tarea). Convención del proyecto = "lint sin nuevos" (igual que Phase 2).
- **Files modified:** ninguno adicional
- **Verification:** `npx eslint lib/verticals.ts` exit 0; `npx tsc --noEmit` exit 0.
- **Committed in:** eb681ce (Task 2)

---

**Total deviations:** 1 (scope boundary — lint baseline pre-existente).
**Impact on plan:** Ninguno. El cambio de esta fase es lint-clean; solo se documenta la imposibilidad de un `npm run lint` global verde por deuda pre-existente ajena.

## Issues Encountered
None.

## User Setup Required
**Requiere configuración manual.** Ver [03-USER-SETUP.md](./03-USER-SETUP.md): aplicar la migración 047 a la base de PRODUCCIÓN a mano (data-only, coordinada con el deploy). NUNCA `supabase db push`.

## Next Phase Readiness
- Fundación lista: `RUBRO_PLACEHOLDERS`, `getVerticalLabel`, `VERTICALS` (types vacíos, label belleza actualizado) disponibles para 03-02 (selector) y 03-03 (fallback booking).
- Orden crítico respetado: el backfill precede al vaciado de types; 03-02/03-03 (Wave 2) dependen de este plan.

---
*Phase: 03-rework-del-selector-de-rubro*
*Completed: 2026-07-04*
