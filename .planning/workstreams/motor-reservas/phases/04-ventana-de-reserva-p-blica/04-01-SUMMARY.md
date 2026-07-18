---
phase: 04-ventana-de-reserva-p-blica
plan: 01
subsystem: booking / multi-tenant read-path
tags: [booking-window, migration, public-view, date-fns, hora-ar, tdd]
status: complete
requires: []
provides:
  - "supabase/migrations/052_booking_window.sql — columnas max_advance_days/max_advance_date + vista public_businesses"
  - "lib/booking-window.ts — todayInAR, effectiveBookingCutoff, isDateOutOfWindow (fuente única UI+server)"
  - "PublicBusiness.max_advance_days/max_advance_date fluyendo por public_businesses → page.tsx"
affects:
  - "Plan 02 (control en Ajustes escribe las columnas)"
  - "Plan 03 (cap de los calendarios usa effectiveBookingCutoff)"
  - "Plan 04 (backstop server usa isDateOutOfWindow)"
tech-stack:
  added: []
  patterns:
    - "Read-path acotado por vista public_businesses (nunca businesses con anon)"
    - "Hora AR con offset literal -03:00 (patrón lib/crm-metrics.ts)"
    - "Corte de ventana inclusive (D-02)"
key-files:
  created:
    - supabase/migrations/052_booking_window.sql
    - lib/booking-window.ts
    - lib/booking-window.test.ts
  modified:
    - supabase/schema.sql
    - lib/types.ts
    - app/[slug]/page.tsx
decisions:
  - "schema.sql editado quirúrgicamente en vez de dump full (evita arrastrar drift pre-existente de 048-051)"
  - "todayInAR materializa medianoche LOCAL para homogeneidad con parseISO (TZ-independiente en tests)"
metrics:
  tasks: 3
  files_created: 3
  files_modified: 3
  completed: 2026-07-18
status_line: "Foundation de la ventana de reserva: migración 052 (columnas + vista) + helper de corte en hora AR testeado + tipos y read-path cableados"
---

# Phase 4 Plan 01: Foundation de la ventana de reserva pública — Summary

Plomería aditiva y de cero regresión que habilita las 3 capas de enforcement de la ventana de reserva: la migración 052 agrega `max_advance_days`/`max_advance_date` a `businesses` y a la vista pública `public_businesses`, un helper puro `lib/booking-window.ts` computa el corte efectivo en hora AR (fuente única para UI y backstop), y los tipos + read-path de `app/[slug]/page.tsx` propagan el valor por la vista acotada.

## What Was Built

### Task 1 — Migración 052 + vista + schema.sql (commit `de7d3df`)
- `ALTER TABLE businesses ADD max_advance_days integer DEFAULT 30` (D-02: backfillea todas las filas existentes a 30 días) `+ max_advance_date date` (ambos nullable → soportan "sin límite").
- `CREATE OR REPLACE VIEW public_businesses` replicando el set exacto de columnas vigente + las 2 nuevas al final + `GRANT SELECT ... TO anon, authenticated`. Ninguna columna sensible entró a la vista.
- Validada con `supabase db reset` local (replay del baseline 001..052, verde).
- `schema.sql` reflejando las 2 columnas en la tabla y en la vista.

### Task 2 — lib/booking-window.ts + tests (TDD: RED `3b320f2` → GREEN `de88631`)
- `todayInAR()`: medianoche del día calendario AR, robusto ante server-UTC (offset -03:00).
- `effectiveBookingCutoff(b)`: 3 modos con precedencia fecha fija > días rolling > sin límite (null).
- `isDateOutOfWindow(b, dateStr)`: predicado inclusive (hoy+N permitido, hoy+N+1 rechazado). Puro, sin React/supabase.
- 9 tests: borde de medianoche AR/UTC, los 3 modos, corte inclusive (rolling y fecha fija), sin límite.

### Task 3 — Tipos + read-path (commit `4c7fb57`)
- `interface Business` gana `max_advance_days`/`max_advance_date` con comentario; `PublicBusiness` los hereda vía el `Omit` (sin tocarlo).
- `.select()` de `app/[slug]/page.tsx` contra `public_businesses` extendido con ambas columnas al final. Sigue usando `createPublicServerClient()` (vista acotada) — nunca la tabla `businesses`.

## Verification

| Comando | Resultado |
|---------|-----------|
| `supabase db reset` (local) | Verde — migración 052 aplicada sobre el baseline (EXIT 0) |
| `npx vitest run lib/booking-window.test.ts` | 9/9 passed |
| `npx tsc --noEmit` | 0 errores |
| grep columnas en migración / vista de schema.sql | OK (8 refs en migración, `max_advance_date` en vista) |
| grep wiring types.ts + page.tsx | OK-WIRED |

## Deviations from Plan

**1. [Método] schema.sql editado quirúrgicamente en vez de dump full**
- **Durante:** Task 1.
- **Motivo:** `supabase db dump --local` reveló que el `schema.sql` committeado en esta rama está desactualizado respecto a migraciones **anteriores** (048 `app_settings`, `landing_content`, `landing_leads`, reorden de vistas, índices) — drift que ningún commit 048-051 reflejó. Un dump full habría barrido ese drift ajeno + reformateo de whitespace en ~200 líneas, contaminando el diff de 04-01.
- **Decisión:** editar `schema.sql` solo con las 2 columnas (tabla + vista), respetando el SCOPE BOUNDARY (solo corregir lo que introduce el cambio actual) y la regla de edits quirúrgicos. El drift pre-existente quedó registrado en `deferred-items.md` para una fase de mantenimiento de schema dedicada.
- **Archivos:** `supabase/schema.sql`, `.planning/.../deferred-items.md`.

Ninguna otra desviación. No hubo Rule 1/2/3 auto-fixes de código ni gates de autenticación.

## Deploy Note (a mano, NO durante execute)

Al deployar: aplicar la 052 al Supabase de prod a mano, ejecutar `NOTIFY pgrst, 'reload schema';` para que PostgREST sirva las columnas nuevas en `public_businesses`, y confirmar el `schema.sql` regenerado (patrón 043).

## Threat Mitigations (del threat_model)

- **T-04-01 (Info Disclosure, vista):** solo `max_advance_days`/`max_advance_date` (config pública, análoga a `buffer_minutes`) entraron a `public_businesses`; verificado contra el set de columnas previo. Ninguna columna sensible.
- **T-04-02 (Info Disclosure, read-path):** `page.tsx` sigue leyendo por `createPublicServerClient()` + `public_businesses`; no se leyó `businesses` con anon.
- **T-04-03 (Tampering, migración):** aditiva, columnas nullable con DEFAULT, sin drop ni cambio de tipo, RLS intacta, validada con `db reset` local.
- **T-04-SC (installs):** cero dependencias nuevas.

## Known Stubs

Ninguno. Las 3 piezas son funcionales; los consumidores (control en Ajustes, cap de calendarios, backstop) llegan en Plans 02/03/04.

## Self-Check: PASSED
- Archivos creados: supabase/migrations/052_booking_window.sql ✓, lib/booking-window.ts ✓, lib/booking-window.test.ts ✓
- Archivos modificados: supabase/schema.sql ✓, lib/types.ts ✓, app/[slug]/page.tsx ✓
- Commits: de7d3df ✓, 3b320f2 ✓, de88631 ✓, 4c7fb57 ✓
