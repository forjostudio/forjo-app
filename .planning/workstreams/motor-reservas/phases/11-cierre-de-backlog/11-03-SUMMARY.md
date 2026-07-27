---
phase: 11-cierre-de-backlog
plan: 03
subsystem: database
tags: [supabase, postgres, migration, rls, public-view, booking, multi-tenant]

# Dependency graph
requires:
  - phase: 10 (motor-reservas)
    provides: "selector de profesional del booking público (paso 2, tarjeta 'Cualquiera' preseleccionada)"
provides:
  - "Columna businesses.public_selector_default (enum 'any'|'choose', migr 061) con default 'any' (cero regresión)"
  - "CHECK businesses_public_selector_default_chk IN ('any','choose') fail-closed a nivel DB"
  - "public_businesses (vista pública) expone la columna → read-path server-side hasta BookingClient"
  - "Campo public_selector_default en Business/PublicBusiness (lib/types.ts)"
affects: [11-04, booking-client, settings-client, motor-reservas]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ADD COLUMN IF NOT EXISTS + CHECK vía pg_constraint (idempotente, molde abono_window_weeks/055)"
    - "CREATE OR REPLACE VIEW re-emitiendo OWNER+GRANTs para exponer columna al read-path (molde 060)"

key-files:
  created:
    - supabase/migrations/061_public_selector_default.sql
  modified:
    - supabase/schema.sql
    - lib/types.ts
    - app/[slug]/page.tsx

key-decisions:
  - "public_selector_default se agrega TAMBIÉN a la vista public_businesses (no solo al .select): el booking lee la vista, no la tabla base — sin esto el read-path rompía (deviation Rule 3)"
  - "default 'any' vía NOT NULL DEFAULT ⇒ filas existentes nacen en 'any' sin backfill (D-06, cero regresión Phase 10)"
  - "La columna viaja a anon a propósito: es flag de presentación, enum acotado, sin PII (D-08 intacto)"

patterns-established:
  - "Setting de presentación por negocio: columna en businesses + exposición en public_businesses + campo en Business → PublicBusiness"

requirements-completed: [EXTRA-B]

# Metrics
duration: ~12min
completed: 2026-07-27
status: complete
---

# Phase 11 Plan 03: EXTRA-B backend — public_selector_default (migr 061) + read-path Summary

**Columna de primera clase `businesses.public_selector_default` (enum 'any'|'choose', default 'any') con CHECK fail-closed, expuesta en la vista `public_businesses` y cableada por el read-path server-side hasta `BookingClient` — sin tocar el motor de reservas.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-07-27
- **Tasks:** 2 (1 código + 1 gate [BLOCKING] db reset)
- **Files modified:** 4

## Accomplishments
- Migración 061 idempotente: `ADD COLUMN IF NOT EXISTS public_selector_default text NOT NULL DEFAULT 'any'` + CHECK `IN ('any','choose')` vía `pg_constraint` + `CREATE OR REPLACE VIEW public_businesses` (expone la columna) + `NOTIFY pgrst`.
- `schema.sql` reflejado quirúrgicamente: columna + constraint en el bloque `businesses` y columna en la vista `public_businesses`.
- `Business` (→ `PublicBusiness` por `Omit`) tipa `public_selector_default?: 'any' | 'choose'`.
- `app/[slug]/page.tsx` trae la columna en el `.select()` de `public_businesses`; el valor viaja gratis como parte de `business` a `BookingClient`.
- **Gate [BLOCKING] cumplido:** `supabase db reset` replayó 001→061 limpio; la 061 figura aplicada; el negocio seedeado lee `'any'`; la vista expone la columna; el CHECK rechaza `'invalid'`.

## Task Commits

1. **Task 1: Migración 061 + schema.sql + read-path (tipo + select)** — `951098e` (feat)
2. **Task 2: [BLOCKING] supabase db reset + verificación** — gate de validación, sin cambios de archivos (incluido en `951098e`)

**Plan metadata:** SUMMARY commit (docs)

## Files Created/Modified
- `supabase/migrations/061_public_selector_default.sql` — columna + CHECK enum + REPLACE de la vista pública, idempotente
- `supabase/schema.sql` — snapshot: columna+constraint en `businesses` y columna en `public_businesses`
- `lib/types.ts` — campo `public_selector_default` en `Business`
- `app/[slug]/page.tsx` — columna agregada al `.select()` de `public_businesses`

## Decisions Made
- **Exponer la columna en la vista `public_businesses`, no solo en el `.select()`.** El plan/RESEARCH/PATTERNS describían el select "sobre businesses", pero el código real lee la VISTA acotada `public_businesses` (leer la tabla base con anon filtraría secretos por tenant). Sin agregar la columna a la vista, PostgREST erroraría y el booking caería a `notFound()`. Se agregó vía `CREATE OR REPLACE VIEW` (molde migr 060), consistente con cómo ya viaja `max_advance_days`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Exponer public_selector_default en la vista public_businesses**
- **Found during:** Task 1 (read-path)
- **Issue:** El plan indicaba agregar la columna solo al `.select()` "sobre businesses". El read-path real (`app/[slug]/page.tsx:61-63`) consulta la vista `public_businesses`, no la tabla. Agregar la columna al select sin exponerla en la vista habría hecho que PostgREST retorne error → `business` null → `notFound()`, rompiendo todo el booking público. El objetivo del plan ("la columna viaja server-side hasta BookingClient") es inalcanzable sin este paso.
- **Fix:** `CREATE OR REPLACE VIEW public_businesses` en la migr 061 (columna al final del SELECT, re-emitiendo OWNER+GRANTs, molde migr 060) + columna agregada a la definición de la vista en `schema.sql`.
- **Files modified:** supabase/migrations/061_public_selector_default.sql, supabase/schema.sql
- **Verification:** `SELECT public_selector_default FROM public_businesses` devuelve `'any'` tras `db reset`.
- **Committed in:** `951098e`

---

**Total deviations:** 1 auto-fixed (1 blocking).
**Impact on plan:** Necesario para que el read-path funcione (es el objetivo declarado del plan). Sin scope creep: solo la vista pública que ya es la fuente de lectura del booking; no se abrió ninguna tabla puente a anon ni se tocó el contrato `{ok,busy,full}` (D-08 intacto).

## Issues Encountered
- `psql` no está en el PATH de Windows; la verificación DB se corrió vía `docker exec supabase_db_forjo-app psql`. Sin impacto.

## User Setup Required
La migración 061 debe aplicarse **A MANO** al Supabase de prod, coordinada con el deploy, seguida de `NOTIFY pgrst, 'reload schema';` (última migración en prod = 060). NO es tarea de esta fase; es paso de deploy. En local ya validada con `supabase db reset`.

## Next Phase Readiness
- **Gate cumplido para el Plan 11-04:** la columna existe en local (NOT NULL DEFAULT 'any' + CHECK), la vista la expone y el tipo la transporta. El Plan 11-04 puede consumir `business.public_selector_default` en `booking-client.tsx` (orden/prominencia del paso 2) y agregar el toggle en `settings-client.tsx`.
- Motor de reservas (`book_slot_atomic`/availability/create) intacto (D-08).

## Self-Check: PASSED
- `supabase/migrations/061_public_selector_default.sql` — FOUND
- Commit `951098e` — FOUND
- Columna en local con NOT NULL DEFAULT 'any' + CHECK — VERIFIED (docker psql)
- Vista public_businesses expone la columna — VERIFIED
- `tsc --noEmit` limpio — VERIFIED

---
*Phase: 11-cierre-de-backlog*
*Completed: 2026-07-27*
