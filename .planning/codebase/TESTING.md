# Patrones de Testing

**Fecha de análisis:** 2026-06-15

## Estado actual: NO hay framework de tests

**Este proyecto no tiene tests automatizados ni framework de testing instalado.**

Evidencia (verificada el 2026-06-15):
- `package.json` no declara ningún runner de tests: no hay `jest`, `vitest`, `mocha`, `@testing-library/*`, `playwright`, ni `cypress` en `dependencies` ni `devDependencies`.
- No existe script `test` en `package.json`. Los únicos scripts son `dev`, `build`, `start` y `lint`.
- No hay archivos `*.test.ts(x)` ni `*.spec.ts(x)` en el repositorio (excluyendo `node_modules`).
- No hay archivos de configuración de tests (`jest.config.*`, `vitest.config.*`, `playwright.config.*`, `cypress.config.*`).
- No hay pipeline de CI con tests: el único `vercel.json` define un cron (`/api/cron/cancel-expired`), no un workflow de testing. No existe `.github/workflows/`.

**Único gate automático de calidad existente:** `npm run lint` (ESLint con `eslint-config-next`). Sirve como verificación estática, no como suite de tests.

## Cómo se valida hoy (manual)

La validación es manual / en runtime, apoyada en garantías a nivel de base de datos:
- **Verificación de tipos:** TypeScript en modo `strict` (`tsconfig.json`) + `next build`.
- **Linting:** `npm run lint`.
- **Garantías de integridad delegadas a Postgres:** índices únicos y exclusion constraints (ej. índice 011 / constraint 013 anti doble-booking) que el código captura por `error.code` (`'23505'`, `'23P01'`) y traduce a `slot_taken`. Ver `app/api/booking/create/route.ts`. Esto cubre, a nivel de DB, escenarios de carrera que en otro proyecto serían tests de integración.

## Recomendación si se introduce testing

Dado el stack (Next.js 16 App Router + TS + Supabase), una elección coherente sería:

**Runner sugerido:**
- **Vitest** — compatible con el tooling moderno, rápido, buen soporte TS/ESM.
- Config: crear `vitest.config.ts` y agregar script `"test": "vitest"` en `package.json`.

**Qué priorizar para tests (mayor riesgo primero):**
1. **Lógica pura de dominio** (sin DB, fácil de testear como unit): `timeToMinutes` / cálculo de solapamiento y buffer en `app/api/booking/create/route.ts`, `lib/plan-limits.ts`, `lib/booking-code.ts`, `lib/plans.ts`, normalización de `lib/whatsapp.ts`.
2. **Aislamiento por tenant** (crítico de seguridad): tests de integración que verifiquen que ninguna query devuelve datos de otro `business_id`. Requiere instancia de Supabase de test o mocks del cliente.
3. **Flujos de pago/webhook MercadoPago** (no idempotentes, fail-closed): firma de webhook, estados de `plan_status`, expiración de holds.

**Mocking sugerido:**
- Mockear el cliente de Supabase (`@/lib/supabase/server`, `@/lib/supabase/admin`) y los efectos externos (`@/lib/email`, `@/lib/google-calendar`, `@/lib/recaptcha`, `@/lib/mercadopago`).
- NO mockear la lógica pura de cálculo de slots/fechas: testearla directa.

**E2E (opcional, más adelante):**
- **Playwright** para el flujo público de booking en `/[slug]` (camino crítico de negocio) y el onboarding.

## Framework de Tests

**Runner:** Ninguno instalado.

**Librería de aserciones:** Ninguna.

**Comandos de ejecución:**
```bash
# No existe comando de tests. Gate de calidad disponible:
npm run lint          # ESLint (eslint-config-next)
npm run build         # next build (incluye type-check estricto)
```

## Organización de Archivos de Test

No aplica — no hay tests. Si se agregan, convención sugerida coherente con el repo:
- Co-locar `*.test.ts` junto al módulo (`lib/plan-limits.test.ts`) para lógica de `lib/`.
- Nombres en kebab-case igual que el resto del proyecto.

## Mocking

No aplica actualmente. Ver "Recomendación" arriba para el enfoque sugerido.

## Fixtures y Factories

No aplica — no existen fixtures de test en el repo.

## Cobertura

**Requisitos:** Ninguno definido ni medido. Sin herramienta de cobertura instalada.

## Tipos de Test

- **Unit:** No existen.
- **Integración:** No existen.
- **E2E:** No usado.

---

*Análisis de testing: 2026-06-15*
