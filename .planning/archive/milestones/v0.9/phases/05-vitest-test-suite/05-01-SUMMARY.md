---
phase: 05-vitest-test-suite
plan: 01
subsystem: testing
tags: [vitest, mercadopago, webhook, hmac, signature, next16, vitest4]

# Dependency graph
requires:
  - phase: 01-secrets-hardening
    provides: business_secrets + verifyMPSignature fail-closed (los webhooks que se testean)
  - phase: 03-payment-integrity
    provides: chequeo de monto amount_mismatch en el webhook de seña
provides:
  - "Runner de tests Vitest 4 ejecutable (npm test = vitest run)"
  - "Config base reutilizable (vitest.config.mts + vitest.setup.ts + test/env.ts)"
  - "Helpers de test: craftSignature (HMAC) y makeWebhookRequest (NextRequest)"
  - "Tests unitarios de ambos webhooks MP: firma fail-closed + under-payment"
affects: [05-02-isolation-ci, future-test-phases]

# Tech tracking
tech-stack:
  added: [vitest@^4.1, vite-tsconfig-paths@^5, "@vitejs/plugin-react@^5"]
  patterns:
    - "Webhook handler testeado importando POST + NextRequest crafteado (sin servidor Next)"
    - "Mock parcial de next/server para drenar after() fuera del request lifecycle"
    - "Mock por-superficie según el webhook: global.fetch (seña, fetch crudo) vs mpFetch (suscripción)"

key-files:
  created:
    - vitest.config.mts
    - vitest.setup.ts
    - test/env.ts
    - test/helpers/mp-signature.ts
    - test/helpers/next-request.ts
    - test/webhook-deposit.test.ts
    - test/webhook-subscription.test.ts
  modified:
    - package.json

key-decisions:
  - "Carga de .env.local via dotenv (transitive) en setup file, no --env-file: cero deps runtime + sin recordar flag"
  - "after() de next/server TIRA fuera de request scope (no es no-op): se resuelve con mock parcial de next/server que drena el callback de forma determinista"
  - "Assert del under-payment vía las llamadas registradas en el admin client mockeado (no se exportó processWebhook): el route quedó intacto"

patterns-established:
  - "Webhook test: import { POST }, NextRequest a mano, verifyMPSignature REAL contra secret de test stubeado"
  - "Mock parcial con importOriginal preservando el gate de firma; solo se mockea la I/O de red"

requirements-completed: [TEST-01]

# Metrics
duration: 18min
completed: 2026-06-17
status: complete
---

# Phase 5 Plan 01: Vitest Bootstrap + Webhook Unit Tests Summary

**Runner Vitest 4 ejecutable (npm test) con 7 tests unitarios que blindan ambos webhooks de MercadoPago: firma HMAC fail-closed (401) y under-payment de seña (amount_mismatch sin confirmar), sin DB ni red.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-06-17T09:08:00Z
- **Completed:** 2026-06-17T09:11:30Z
- **Tasks:** 3
- **Files modified:** 8 (7 creados + package.json)

## Accomplishments
- Vitest 4 + `vite-tsconfig-paths` + `@vitejs/plugin-react@^5` (no ^6) instalados como devDeps; `npm test` = `vitest run`, exit 0.
- Config base con resolución del alias `@/*`, environment `node` y carga de `.env.local`.
- Helpers deterministas: `craftSignature` (HMAC-SHA256 replicando el manifest de producción) y `makeWebhookRequest`.
- Webhook de seña: 401 sin firma, 401 firma inválida, 200 firma válida, y monto distinto → `update({payment_status:'amount_mismatch'})` sin nunca `status:'confirmed'`.
- Webhook de suscripción: 401 sin/con firma inválida, 200 con firma válida, `mpFetch` mockeado y `verifyMPSignature` real.
- Cero llamadas a la API real de MercadoPago en toda la suite.

## Task Commits

1. **Task 1: Instalar Vitest + config + carga de env** - `d9c45dd` (chore)
2. **Task 2: Helpers HMAC/NextRequest + tests webhook de seña** - `9ab8542` (test)
3. **Task 3: Tests webhook de suscripción (mock parcial mpFetch)** - `1afd0c2` (test)

## Files Created/Modified
- `vitest.config.mts` - Config: tsconfigPaths + environment node + setupFiles
- `vitest.setup.ts` - Carga `.env.local` con dotenv (transitive, sin dep runtime)
- `test/env.ts` - Flags `hasSupabaseCreds` / `hasWebhookSecret` para skip graceful (D-03)
- `test/helpers/mp-signature.ts` - `craftSignature`: HMAC-SHA256 determinista del manifest
- `test/helpers/next-request.ts` - `makeWebhookRequest`: NextRequest con headers + query
- `test/webhook-deposit.test.ts` - Tests del webhook de seña (firma + under-payment)
- `test/webhook-subscription.test.ts` - Tests del webhook de suscripción (firma)
- `package.json` - devDeps + scripts `test` / `test:watch`

## Decisions Made

- **Carga de `.env.local` (Open Q2):** elegido `dotenv` en el setup file en vez del flag `node --env-file`. `dotenv` ya está disponible transitivamente → cero deps de runtime nuevas (D-01), y no obliga a recordar el flag al correr `npx vitest run`/`npm test` ni en CI.
- **Drenado de `after()` (Open Q1) — resuelto empíricamente:** `after()` de `next/server` **lanza** `"after was called outside a request scope"` cuando se invoca fuera del request lifecycle de Next (NO es un no-op silencioso). Esto hacía fallar los tests de 200 y de under-payment. Solución: **mock parcial de `next/server`** (vía `importOriginal`) preservando `NextRequest` y reemplazando `after` por una versión que ejecuta el callback en un microtask y guarda la promesa. Así el trabajo de `processWebhook` drena de forma determinista y se asierta con `vi.waitFor`. **No se exportó `processWebhook`** — el route de producción quedó intacto; el assert es vía las llamadas registradas en el admin client mockeado.
- **Superficie de mock por webhook:** seña mockea `global.fetch` (usa `fetch` crudo, Pitfall 13); suscripción mockea solo `mpFetch` (mock parcial de `@/lib/mercadopago`). En ambos `verifyMPSignature`/`getMPWebhookSecret` corren REALES.

## Deviations from Plan

None - plan executed exactly as written. La duda abierta del plan sobre `after()` (assert vía mock vs export de `processWebhook`) se resolvió por el camino recomendado (assert vía mock del admin client), añadiendo el mock parcial de `next/server` necesario para que `after()` no tire fuera de scope — comportamiento contemplado por el plan ("decidir empíricamente").

## Issues Encountered
- `after()` de `next/server` arroja error fuera del request scope (no no-op). Resuelto con mock parcial de `next/server`. Documentado arriba (Open Q1).

## User Setup Required
None - los tests stubean su propio `MP_WEBHOOK_SECRET`; no requieren configuración de servicios externos. (CI / tests de aislamiento del plan 05-02 sí pedirán GitHub Secrets.)

## Next Phase Readiness
- Config y helpers listos para reuso en 05-02 (tests de aislamiento RLS + `.github/workflows/test.yml`).
- `test/env.ts` ya expone `hasSupabaseCreds` para el `describe.skipIf` del plan 05-02.
- Suite verde sin creds de DB ni red → segura para CI con skip graceful.

## Self-Check: PASSED
- Todos los archivos creados existen en disco (verificado).
- Commits `d9c45dd`, `9ab8542`, `1afd0c2` presentes en `git log`.
- `npm test` → 7 passed, exit 0.

---
*Phase: 05-vitest-test-suite*
*Completed: 2026-06-17*
