---
phase: 01-reconciliaci-n-de-horarios
plan: 03
subsystem: database
tags: [postgres, supabase, migration, drop-table, rls, schema, types]

# Dependency graph
requires:
  - phase: 01-reconciliaci-n-de-horarios (Plan 01)
    provides: onboarding escribe time_blocks (dejó de escribir business_hours)
  - phase: 01-reconciliaci-n-de-horarios (Plan 02)
    provides: agente lee time_blocks (dejó de leer business_hours)
provides:
  - "Migración 046_drop_business_hours.sql: DROP idempotente de business_hours + public_business_hours"
  - "schema.sql regenerado sin business_hours (tabla, vista, PK, FK, policy, RLS, grants)"
  - "lib/types.ts sin el tipo BusinessHour"
  - "SCHED-02 saldado: fuente única de horarios (time_blocks), cero divergencia posible"
affects: [onboarding-phase-2, secure-phase, deploy-prod]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Primera migración destructiva del repo (DROP TABLE) documentada con header ⚠ y IF EXISTS idempotente"
    - "Cutover limpio sin backfill (D-02): DROP de tabla legacy en vez de deprecación transitoria"

key-files:
  created:
    - supabase/migrations/046_drop_business_hours.sql
  modified:
    - supabase/schema.sql
    - lib/types.ts

key-decisions:
  - "DROP directo de business_hours (D-03), no deprecación transitoria — no hay datos que preservar"
  - "Editar quirúrgicamente el snapshot schema.sql (Edit parcial) en vez de db dump — Supabase local no levantado en la sesión"
  - "Aplicación del DROP a prod DIFERIDA al usuario, coordinada con el deploy (checkpoint T3)"

patterns-established:
  - "Migración destructiva: header ⚠ explicando por qué es segura (readers migrados, sin data), DROP con IF EXISTS, vista antes que tabla"

requirements-completed: [SCHED-02]

# Metrics
duration: ~12min
completed: 2026-07-03
status: complete
---

# Phase 1 Plan 3: DROP business_hours — Reconciliación de horarios Summary

**Migración 046 (primera destructiva del repo) que dropea `business_hours` + `public_business_hours`, schema.sql regenerado sin la tabla/vista/policy/grants, y tipo `BusinessHour` removido — deja `time_blocks` como fuente única de horarios (SCHED-02).**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-03T16:19:00Z
- **Completed:** 2026-07-03T16:31:36Z
- **Tasks:** 2 auto completadas / 1 checkpoint humano pendiente (T3)
- **Files modified:** 3 (1 creado, 2 modificados)

## Accomplishments
- Migración `046_drop_business_hours.sql` idempotente: `DROP VIEW` (public_business_hours, dependía de la tabla) → `DROP POLICY` (defensivo) → `DROP TABLE` (se lleva PK, FK, RLS, grants). Header ⚠ que documenta por qué es segura (readers ya migrados en Plans 01/02, cutover limpio sin backfill — D-02).
- `supabase/schema.sql` regenerado quirúrgicamente: eliminados los 8 bloques de business_hours/public_business_hours (tabla + OWNER, vista + OWNER, PK, FK, policy, RLS, grants de tabla y vista). Grep = 0 referencias.
- `lib/types.ts`: `interface BusinessHour` removida; `TimeBlock` intacto.
- Gate de orden verificado ANTES de escribir: grep repo-wide de `business_hours` en app/lib/components = 0 referencias vivas (solo 2 comentarios "NO de business_hours" en la landing).

## Task Commits

Cada task auto committeada atómicamente:

1. **Task 1: Migración 046_drop_business_hours.sql** - `237ddff` (feat)
2. **Task 2: schema.sql sin business_hours + quitar tipo BusinessHour** - `daa452f` (feat)
3. **Task 3: Checkpoint humano — aplicar DROP a prod** - PENDIENTE (bloqueante, ver §User Setup)

**Plan metadata:** (commit docs final tras este SUMMARY)

## Files Created/Modified
- `supabase/migrations/046_drop_business_hours.sql` - DROP idempotente de la vista, la policy y la tabla business_hours (⚠ única migración destructiva del repo)
- `supabase/schema.sql` - snapshot regenerado: quitados CREATE TABLE/VIEW, PK, FK, policy "business member access", ENABLE RLS, y GRANTs de business_hours + public_business_hours
- `lib/types.ts` - removida `interface BusinessHour`

## Decisions Made
- **DROP directo (D-03):** se elimina la tabla en vez de dejar un `-- deprecated` transitorio, porque no hay datos que preservar (D-02, sin clientes en prod).
- **Editar el snapshot en vez de `db dump`:** Supabase local no estaba levantado en la sesión de ejecución (guardrail de concurrencia del prompt: no correr `db reset` destructivo). Se editó `schema.sql` quirúrgicamente con Edit parcial; el `db reset` de validación queda diferido al operador.
- **Aplicación a prod diferida:** el DROP a la base de prod es manual y coordinado con el deploy — no lo corre el executor (checkpoint T3).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- **`npm run lint` sale con exit 1 (460 errores):** verificado con stash/compare que son **idénticos** antes y después de los cambios de este plan (590 problemas / 460 errores en ambos casos). Ninguno toca `lib/types.ts` ni `supabase/schema.sql`. Son deuda pre-existente del repo (React Compiler memoization en `components/dashboard/*`, `no-unused-vars` en `design_handoff_forjo_rebrand/preview/*`). `npx tsc --noEmit` pasa limpio (exit 0). Documentado en `deferred-items.md`. Fuera de scope (scope boundary).

## Verification
- Gate de orden: grep de `business_hours` en app/lib/components = 0 referencias vivas ✔
- Migración creada con `DROP VIEW` → `DROP POLICY` → `DROP TABLE`, todos `IF EXISTS` (idempotente) ✔
- grep `business_hours` en `supabase/schema.sql` = 0 ✔
- grep `BusinessHour` (tipo) en lib/app = 0; `TimeBlock` intacto (types.ts:81) ✔
- `npx tsc --noEmit` = exit 0 ✔
- `npm run lint` = sin errores NUEVOS (460 pre-existentes, ajenos) ✔
- `supabase db reset` local = DIFERIDO al operador (guardrail de concurrencia) — ver §User Setup

## User Setup Required

**El DROP a prod es MANUAL y bloqueante (checkpoint T3). SECUENCIA EXACTA — el orden importa (T-01-07):**

1. **Deployar primero el código de Wave 1 (Plans 01+02)** a prod (Vercel). Tras el deploy, el onboarding escribe `time_blocks` y el agente lee `time_blocks`; nada lee/escribe `business_hours`.
2. **Recién después, correr `046_drop_business_hours.sql`** en el SQL editor de Supabase (prod). Si se dropea ANTES del deploy, cualquier path que aún leyera business_hours en prod fallaría.
3. **Verificar el DROP:** un `SELECT * FROM business_hours` debe dar "does not exist"; ídem `public_business_hours`.
4. **Smoke checks post-deploy:** la landing pública de un negocio muestra horarios (lee time_blocks), `/api/agent/context?slug=...` devuelve `hours[]` sin error, y un alta nueva en el onboarding con horario partido aparece en el panel de agenda.
5. **Validación local (opcional, cuando Supabase local esté libre):** `supabase db reset` debe replayar baseline + 040..046 sin error.

> El executor NO corrió `supabase db reset` ni aplicó el DROP a prod (guardrail de concurrencia: el usuario puede tener Supabase local abierto). La migración quedó escrita y revisada; `schema.sql` ya refleja el estado post-DROP.

## Next Phase Readiness
- `time_blocks` es la fuente única de horarios; SCHED-02 saldado (cero divergencia posible al no existir business_hours).
- **Blocker de deploy:** hasta que el usuario aplique el DROP a prod (checkpoint T3), la tabla `business_hours` sigue viva en prod (huérfana, sin readers). No rompe nada porque nadie la lee, pero la reconciliación no está 100% cerrada en prod hasta correr la 046.
- Phase 2 (ONB-01/02): rework de UX del onboarding + botón "Omitir" — construye sobre este esquema limpio.

---
*Phase: 01-reconciliaci-n-de-horarios*
*Completed: 2026-07-03*

## Self-Check: PASSED
- FOUND: supabase/migrations/046_drop_business_hours.sql
- FOUND commit 237ddff (Task 1)
- FOUND commit daa452f (Task 2)
- schema.sql: 0 referencias a business_hours
- BusinessHour type: 0 referencias en lib/app; TimeBlock intacto
