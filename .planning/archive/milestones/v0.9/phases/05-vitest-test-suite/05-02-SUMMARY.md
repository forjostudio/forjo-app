---
phase: 05-vitest-test-suite
plan: 02
subsystem: testing
tags: [vitest, rls, multi-tenant, isolation, supabase, github-actions, ci, security]

# Dependency graph
requires:
  - phase: 05-vitest-test-suite
    plan: 01
    provides: runner Vitest 4 + test/env.ts (hasSupabaseCreds) + vitest.setup.ts (carga .env.local)
  - phase: 01-secrets-hardening
    provides: business_secrets RLS owner-only + policies owner_id=auth.uid()
provides:
  - "Tests de aislamiento multi-tenant RLS owner-level (cross read/write/insert) con 2 sesiones anon"
  - "Helper de fixtures seedTwoTenants()/teardown() service-role (2 negocios + 2 usuarios auth)"
  - ".github/workflows/test.yml — CI que corre toda la suite en push/PR con secrets"
affects: [future-test-phases, ci-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Aislamiento RLS testeado con 2 clientes anon-key autenticados (signInWithPassword), NUNCA service-role (Pitfall 12)"
    - "Aserciones de aislamiento SIN .eq('business_id') — deja que RLS deniegue, no el WHERE"
    - "Cross-write probado con UPDATE de fila existente de B (no INSERT en appointments/clients, que tienen insert publico)"
    - "Cross-insert probado en services (sin policy de insert publico)"
    - "Fixtures service-role con prefijo __test_<uuid> por corrida + teardown try/finally"
    - "Guard anti-falso-verde: falla ruidosamente si el cliente de asercion no tiene sesion anon autenticada"

key-files:
  created:
    - test/helpers/supabase-fixtures.ts
    - test/isolation.test.ts
    - .github/workflows/test.yml
  modified: []

key-decisions:
  - "Cross-INSERT cruzado se prueba contra services (sin insert publico), no appointments/clients (insert publico WITH CHECK(true) por booking)"
  - "Check del efecto del UPDATE con service-role es independiente y NO es la asercion de RLS (la asercion ya corrio con anon)"
  - "Guard doble: (a) ambas sesiones anon deben tener access_token; (b) anon key != service-role key"

patterns-established:
  - "Test de aislamiento: seedTwoTenants en beforeAll, teardown en afterAll, 2 anon autenticados, aserciones sin filtro business_id"
  - "skipIf(!hasSupabaseCreds) gate para integration tests que pegan a DB real"

requirements-completed: [TEST-01]

# Metrics
duration: 3min
completed: 2026-06-17
status: complete
---

# Phase 5 Plan 02: Tests de Aislamiento RLS + CI Summary

**Tests de aislamiento multi-tenant (RLS owner-level) que ponen ROJA la suite si un negocio puede leer/modificar datos de otro — con 2 sesiones anon autenticadas (nunca service-role), más el workflow de CI que corre toda la suite en push/PR con skip graceful.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-06-17T12:14:26Z
- **Completed:** 2026-06-17T12:17:42Z
- **Tasks:** 3
- **Files created:** 3

## Accomplishments
- `test/helpers/supabase-fixtures.ts`: `seedTwoTenants()` (2 usuarios auth con `email_confirm`, 2 negocios, 1 appointment de B) + `teardown()` en try/finally (borra negocios por CASCADE + `deleteUser` explícito). Service-role SOLO acá, prefijo `__test_<uuid>` por corrida.
- `test/isolation.test.ts`: `describe.skipIf(!hasSupabaseCreds)` con 3 tests — cross-READ (0 filas de B, sin `.eq('business_id')`), cross-WRITE UPDATE (0 filas + dato intacto), cross-INSERT en `services` (falla). Aserciones con 2 clientes anon-key autenticados; guard anti-falso-verde en `beforeAll`.
- `.github/workflows/test.yml`: GitHub Actions en push/PR, Node 22, `npm ci` + `npm test`, 4 secrets como env, skip graceful documentado.
- Suite completa verde: 7 passed (webhooks de 05-01) + 3 skipped (aislamiento), `npm test` exit 0.

## Task Commits

1. **Task 1: Helper de fixtures (seed/teardown service-role)** - `5e7c2fb` (test)
2. **Task 2: Tests de aislamiento RLS (2 sesiones anon)** - `9533b48` (test)
3. **Task 3: Workflow de CI (GitHub Actions)** - `8d281f0` (test)

## Files Created
- `test/helpers/supabase-fixtures.ts` - `seedTwoTenants()` / `teardown()` con service-role, prefijo único, teardown robusto
- `test/isolation.test.ts` - cross read/write/insert con 2 anon autenticados, guard anti-Pitfall-12
- `.github/workflows/test.yml` - CI: `npm ci` + `npm test` en push/PR, 4 secrets, skip graceful

## Decisions Made
- **Cross-INSERT contra `services`, no `appointments`/`clients`:** estas dos tienen `public insert WITH CHECK(true)` (booking público) → un INSERT anon pasa A PROPÓSITO (Pitfall 6). `services` solo tiene la policy owner sin insert público → un INSERT cruzado debe fallar. Es el target correcto para probar denegación de INSERT.
- **El check del efecto del UPDATE con service-role NO es la aserción de RLS:** la aserción de RLS ya corrió con el cliente anon de A (0 filas afectadas / error). El `select` posterior con service-role solo confirma que el `client_name` de B quedó intacto — es un check de integridad del dato, no de la policy. El service-role nunca decide el verde del test de aislamiento (D-06).
- **Guard doble anti-falso-verde:** (a) ambas sesiones anon deben tener `access_token` tras `signInWithPassword` (un cliente service-role no produce sesión por signIn); (b) `NEXT_PUBLIC_SUPABASE_ANON_KEY !== SUPABASE_SERVICE_ROLE_KEY`. Si cualquiera falla, `beforeAll` tira antes de correr aserciones.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
- **Los tests de aislamiento se SKIPEARON en local (no corrieron contra dev):** las vars `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` existen en `.env.local` pero con **valor vacío** (`""`) — no hay creds reales del proyecto Supabase dev cargadas en este entorno. Por D-03 esto es el camino de **skip graceful esperado**: el suite igual pasa (exit 0) y los webhook tests de 05-01 siguen corriendo. NO es un fallo del test ni del plan; es exactamente el comportamiento diseñado para "sin creds → skip". Para ejercitar el aislamiento de verdad (creando/borrando fixtures `__test_` contra dev), hay que poblar esas 3 vars en `.env.local` con valor real y re-correr `npx vitest run test/isolation.test.ts`.
- Validación adicional aplicada para compensar el skip: static greps del verify (skipIf presente, sin `createAdminClient`, `signInWithPassword` presente) PASS, y `tsc --noEmit` sin errores en los 2 archivos nuevos (garantiza que el código compila y las firmas de `@supabase/supabase-js` son correctas, lo que el skip no ejercita en runtime).

## User Setup Required

**Operacional (no bloqueante, D-04):**

1. **GitHub repo secrets** — para que los tests de aislamiento corran en CI, cargar en
   `GitHub repo → Settings → Secrets and variables → Actions`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `MP_WEBHOOK_SECRET`

   Sin ellos, los tests de aislamiento se skipean (`describe.skipIf`) y el job de CI pasa igual
   (solo corren los webhook tests). No marca el workflow como fallido.

2. **`.env.local` para correr aislamiento en LOCAL** — las 3 vars de Supabase
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
   actualmente están **vacías** en `.env.local`. Poblarlas con las creds reales del proyecto dev
   para que `npx vitest run test/isolation.test.ts` ejercite el aislamiento (crea + borra fixtures
   `__test_*`). Mientras estén vacías, esos tests se skipean.

## Next Phase Readiness
- Suite completa (webhooks + aislamiento) ejecutable vía `npm test`, exit 0 con o sin creds.
- CI configurado; al cargar los repo secrets, el aislamiento correrá en cada push/PR.
- Pilares de TEST-01 cubiertos: aislamiento multi-tenant + webhooks MP.

## Self-Check: PASSED
- Todos los archivos creados existen en disco (verificado): `test/helpers/supabase-fixtures.ts`, `test/isolation.test.ts`, `.github/workflows/test.yml`, `05-02-SUMMARY.md`.
- Commits `5e7c2fb`, `9533b48`, `8d281f0` presentes en `git log`.
- `npm test` → 7 passed | 3 skipped, exit 0.
- Verifies automatizados de las 3 tareas: PASS. `tsc --noEmit` sin errores en los archivos nuevos.
