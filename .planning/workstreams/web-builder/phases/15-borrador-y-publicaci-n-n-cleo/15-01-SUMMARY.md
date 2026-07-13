---
phase: 15-borrador-y-publicaci-n-n-cleo
plan: 01
subsystem: database
tags: [postgres, supabase, rls, multi-tenant, jsonb, migration, vitest, landing-cms]

# Dependency graph
requires:
  - phase: 13-cms-foundation-write-path-owner-only-flag
    provides: "write path owner-only (saveLandingConfig), RLS `owner access` de businesses, vista public_businesses con columnas explícitas, test/isolation.test.ts"
  - phase: 14-cms-editor-ui
    provides: "editor visual (web-client.tsx) que hoy escribe landing_config directo"
provides:
  - "Columna businesses.landing_draft (jsonb, nullable, sin DEFAULT) — el BORRADOR, separado de lo PUBLICADO"
  - "Backfill idempotente landing_draft := landing_config (PUB-08: la web al aire no se mueve y el editor abre con copia fiel)"
  - "4 tests de aislamiento del borrador en test/isolation.test.ts (vista pública, cross-read, cross-write, same-tenant)"
affects: [15-02, 15-03, 16-skill-escribe-el-borrador, 17-publish-go-live]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Columna nueva en tabla con RLS existente → hereda el aislamiento fila-a-fila; NO se agrega policy ni permiso"
    - "NULL semántico (no DEFAULT) como señal de 'negocio legacy' que alimenta el fail-safe parseLandingConfig(null) → null"
    - "El aislamiento de una columna se PRUEBA (4 casos anon-key), no se asume"

key-files:
  created:
    - supabase/migrations/050_landing_draft.sql
  modified:
    - test/isolation.test.ts

key-decisions:
  - "landing_draft es una COLUMNA de businesses (no una tabla 1:1): hereda la RLS ya probada; una tabla nueva sería una superficie de aislamiento a probar desde cero"
  - "Columna nullable SIN DEFAULT: un '{}'::jsonb rompería la señal semántica NULL = nunca tuvo landing (PUB-07)"
  - "La migración NO toca la vista public_businesses (security-DEFINER): el borrador queda protegido POR CONSTRUCCIÓN, y un test lo pone rojo si alguien la 'completa por simetría'"
  - "Backfill con WHERE landing_draft IS NULL: correr la migración dos veces no pisa un borrador ya editado"
  - "Validación autónoma = supabase db reset local (PG17). Prod se aplica A MANO, coordinado con el deploy (ver runbook)"

patterns-established:
  - "Migración aditiva de 2 sentencias con molde 049 (contexto / qué hace / racional / qué NO hace)"
  - "Test de fuga de vista: select de la columna sobre public_businesses DEBE errar (espeja el caso D-10b)"

requirements-completed: [PUB-03, PUB-07, PUB-08]

# Metrics
duration: 18min
completed: 2026-07-13
status: complete
---

# Phase 15 Plan 01: Borrador y publicación (núcleo) — esquema y aislamiento Summary

**`businesses.landing_draft` (jsonb nullable, migración 050) con backfill idempotente desde `landing_config`, y 4 tests anon-key que prueban —no asumen— que el borrador es invisible para `anon` y para cualquier otro tenant.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-07-13T09:15:00Z
- **Completed:** 2026-07-13T09:33:00Z
- **Tasks:** 3 (Task 2 es validación bloqueante, no produce archivos)
- **Files modified:** 2 (1 creado, 1 editado)

## Accomplishments

- **Migración 050 aditiva y no destructiva:** `ADD COLUMN IF NOT EXISTS landing_draft jsonb` + `UPDATE … SET landing_draft = landing_config WHERE landing_draft IS NULL AND landing_config IS NOT NULL`. Sin vistas, sin policies, sin permisos, sin tocar el trigger `businesses_protect_admin_columns`.
- **Validada contra Postgres 17 local:** `npx supabase db reset` replayó baseline + 040..050 en verde (exit 0). **Ningún comando empujó el esquema al Supabase remoto.**
- **Fuga de la vista probada ausente, dos veces:** (a) `information_schema.columns` sobre `public_businesses` + `landing_draft` → **0 filas**; (b) test anon-key que exige que ese `select` **erre**.
- **Forma de la columna verificada en la DB real:** `businesses.landing_draft` → `jsonb`, `is_nullable = YES`, `column_default` vacío.
- **4 casos nuevos de aislamiento en VERDE (no skipeados):** `test/isolation.test.ts` corre **13 passed / 0 skipped**; suite completa **488/488** + `tsc --noEmit` OK.

## Task Commits

1. **Task 1: Migración 050 — businesses.landing_draft** — `9ded2dd` (feat)
2. **Task 2: Validación bloqueante `supabase db reset` + no-fuga en la vista** — sin commit propio (no produce archivos; evidencia abajo)
3. **Task 3: 4 casos de aislamiento del borrador** — `1beb344` (test)

## Files Created/Modified

- `supabase/migrations/050_landing_draft.sql` — **NUEVO.** Columna `landing_draft jsonb` + backfill idempotente. Cabecera densa en español con el bloque "Qué NO hace (invariantes del proyecto)" que declara los cuatro invariantes (vista, policies/permisos, trigger, validación local).
- `test/isolation.test.ts` — **EDIT.** Bloque nuevo `landing_draft: aislamiento del BORRADOR (Phase 15 / PUB-03, migración 050)` con 4 `it`, respetando la disciplina del archivo (aserciones solo con `anonA`/`anonB`; `seeded.admin` solo para el check independiente de efecto) y el orden obligatorio cross-WRITE → same-tenant.

## Evidencia de verificación

```
npx supabase db reset                                   → exit 0 (baseline + 040..050)
information_schema.columns / public_businesses+draft    → 0 filas        (sin fuga)
information_schema.columns / businesses+landing_draft   → jsonb | YES | (none)
npx vitest run test/isolation.test.ts                   → 13 passed, 0 skipped
npx tsc --noEmit                                        → OK
npx vitest run (suite completa)                         → 488 passed / 36 files
```

Greps de aceptación: `ADD COLUMN IF NOT EXISTS "landing_draft" jsonb` = 1 · `SET "landing_draft" = "landing_config"` = 1 · SQL efectivo con `view|policy|grant|default|enum` = 0 · `public_businesses` fuera de comentarios = 0 · `landing_draft` en el test = 14 · `from('public_businesses')` 3 → 4.

## Decisions Made

Ninguna decisión nueva: el plan y el RESEARCH ya traían el SQL y los 4 tests redactados. Se copiaron verbatim, con dos ajustes de forma sin impacto semántico:

- El bloque "Qué NO hace" evita las palabras `GRANT`/`DEFAULT` en mayúsculas dentro de líneas SQL efectivas (los comentarios sí las nombran, como exige el plan) — necesario para que el criterio de aceptación *"SQL efectivo limpio"* dé 0.
- Se añadió un párrafo `Racional D-02 (lockeado)` al molde 049 (por qué columna y no tabla, por qué no hay flag de publicación).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. El stack local ya estaba levantado y `.env.test.local` ya tenía las 3 credenciales del Supabase local, así que los tests corrieron en verde sin skip a la primera.

## User Setup Required

**Sí — la migración se aplica a producción A MANO.** Runbook completo abajo.

---

## Runbook de deploy a producción (MANUAL)

Este repo **no** empuja migraciones al remoto desde la CLI. Se aplican a mano, en este orden, y el
orden **no es negociable**:

1. Aplicar `supabase/migrations/050_landing_draft.sql` a **prod** desde el SQL editor de Supabase (a mano).
2. `NOTIFY pgrst, 'reload schema';` en el mismo bloque SQL. **Sin esto, PostgREST sigue con su schema
   cache viejo y las acciones del editor fallan con "column businesses.landing_draft does not exist"
   aunque la columna exista.**
3. Deploy del código (Vercel) — recién a partir de acá el editor escribe el borrador.
4. Regenerar `supabase/schema.sql` y commitearlo (patrón del repo, igual que tras 037/039/042/043).

Entre los pasos 1-2 y el 3 hay una **ventana segura**: la columna nueva es invisible para el código
viejo, que sigue escribiendo `landing_config` y publicando al instante (comportamiento de hoy). Al
revés se rompe el editor (cada guardado daría `update_failed` contra una columna inexistente).

**Nota para el operador (ventana 15 ↔ 16):** entre el deploy de la Phase 15 y el de la Phase 16,
`scripts/setup-landing.ts` **sigue escribiendo lo publicado** (la web armada por la skill sale al aire
al instante). No correr la skill sobre un negocio nuevo en esa ventana, o pegar la Phase 16 a la 15.

## Next Phase Readiness

- **15-02 / 15-03 desbloqueados:** el esquema existe y su aislamiento está probado. Lo que sigue son las 3 Server Actions (`saveLandingDraft` / `publishLanding` / `discardLandingDraft`), el compare canónico (`configsEqual`, Pitfall 7) y la barra de publish con sus 3 estados.
- **Riesgo aceptado heredado (Pitfall 12 / Phase 13):** con la policy `owner access` siendo `FOR ALL`, el dueño puede escribir **su propia** `landing_config` con la anon-key desde la consola del browser, salteando la semántica de "publicar". No viola el Core Value (sigue siendo owner-only) — declararlo de nuevo en `/gsd:secure-phase 15`.
- **Sin blockers.**

## Self-Check: PASSED

- `supabase/migrations/050_landing_draft.sql` — FOUND
- `test/isolation.test.ts` — FOUND
- `15-01-SUMMARY.md` — FOUND
- Commits `9ded2dd`, `1beb344` — FOUND en `git log`

---
*Phase: 15-borrador-y-publicaci-n-n-cleo*
*Completed: 2026-07-13*
