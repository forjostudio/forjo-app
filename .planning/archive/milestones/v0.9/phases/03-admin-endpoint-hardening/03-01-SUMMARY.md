---
phase: 03-admin-endpoint-hardening
plan: 01
subsystem: admin / mercadopago
status: complete
tags: [security, admin, mercadopago, timing-safe, SEC-03]
requirements: [SEC-03]
dependency_graph:
  requires:
    - lib/mercadopago.ts (mpFetch, MP_MODE)
    - lib/subscription-plans.ts (SUBSCRIPTION_PLANS)
  provides:
    - "Admin set-plan con auth header-only timing-safe (hash-both-sides SHA-256)"
    - "scripts/setup-mp-plans.ts: re-setup local de preapproval_plan sin auth web"
    - "npm script setup:mp-plans + tsx devDependency"
  affects:
    - app/api/admin/set-plan/route.ts
    - app/api/admin/setup-plans/route.ts (eliminado)
tech_stack:
  added:
    - "tsx ^4 (devDependency, runner local de TypeScript)"
  patterns:
    - "Comparación de secretos en tiempo constante hash-both-sides (crypto.timingSafeEqual sobre SHA-256)"
    - "Re-setup operacional como script local en vez de endpoint web"
key_files:
  created:
    - scripts/setup-mp-plans.ts
  modified:
    - app/api/admin/set-plan/route.ts
    - package.json
  deleted:
    - app/api/admin/setup-plans/route.ts
decisions:
  - "set-plan usa helper timing-safe inline (no lib compartida): con setup-plans borrado es el único endpoint admin web (D-02)"
  - "setup-plans se borra entero en vez de solo arreglar el compare: elimina la superficie web y el agujero del ?secret= (D-01)"
  - "tsx + alias @/* preferido sobre script autocontenido: reusa la lógica de lib sin duplicar (CONTEXT discreción)"
metrics:
  duration: ~1 min
  completed: 2026-06-16
  tasks: 3
  files: 4
---

# Phase 03 Plan 01: Admin Endpoint Hardening Summary

Endurecimiento de los endpoints admin (SEC-03): `set-plan` ahora compara el `x-admin-secret` en tiempo constante con hash-both-sides SHA-256 (sin side-channel de timing ni 500 por longitud), y el endpoint web `setup-plans` —que filtraba el secreto por `?secret=`— se eliminó por completo, moviendo su lógica a un script local sin auth (`scripts/setup-mp-plans.ts`).

## What Was Built

**Task 1 — `set-plan` timing-safe (commit f6f2b6e):**
Reemplazó `secret !== process.env.ADMIN_SECRET` por un helper inline `adminSecretMatches(provided, expected)` que:
- devuelve `false` sin llamar a `timingSafeEqual` si cualquier lado es nulo/vacío (request sin/con header vacío → 401);
- hashea ambos lados a SHA-256 (`crypto.createHash('sha256').update(...).digest()`, 32 bytes fijos) y compara con `crypto.timingSafeEqual`.
Hashear a longitud fija evita el `RangeError ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH` (un header de longitud distinta da 401, no 500) y no filtra la longitud del secreto real. Se mantuvo el shape exacto `Response.json({ error: 'Unauthorized' }, { status: 401 })` y la lectura header-only (`x-admin-secret`). Se borró el comentario vestigial "will be called by Stripe webhook" y se reemplazó por un comentario en español explicando el porqué del timing-safe.

**Task 2 — borrar setup-plans web + script local (commit 156bf89):**
`git rm app/api/admin/setup-plans/route.ts` (elimina toda la superficie web, incluido el `?secret=`). Se creó `scripts/setup-mp-plans.ts` que importa `mpFetch`/`MP_MODE` de `@/lib/mercadopago` y `SUBSCRIPTION_PLANS` de `@/lib/subscription-plans`, recorre los planes haciendo `POST /preapproval_plan` (reason, auto_recurring mensual, transaction_amount=price_ars, currency_id ARS, back_url) y imprime los IDs + la env-var donde copiarlos. Respeta `MP_MODE`/sufijo `_TEST`. Sin auth web, sin escribir `plan_status`, sin tocar la DB. Entry point `main().catch(...)` con `process.exitCode = 1` en error.

**Task 3 — runner (commit f807b71):**
`package.json`: `tsx` `^4` en devDependencies + `"setup:mp-plans": "tsx scripts/setup-mp-plans.ts"` en scripts. Solo se agregaron esas dos entradas; el resto del archivo intacto.

## How To Use The Script

El script NO se ejecuta como parte de esta fase (no cambia nada en producción — los IDs ya viven en las env vars actuales). Para usarlo el usuario debe:
1. `npm install` (instala `tsx`; el lockfile se actualiza ahí — `npm install` NO se corrió en esta fase).
2. Cargar los secretos de MP en el entorno (`.env.local` o exportados).
3. `npm run setup:mp-plans` — imprime los IDs de plan; copiarlos a las env vars de Vercel y redesplegar.

## Verification

- `set-plan`: `crypto.timingSafeEqual` sobre SHA-256 presente; ya no hay `secret !== ADMIN_SECRET`. ✓
- `app/api/admin/setup-plans/route.ts` no existe; no queda `searchParams.get('secret')` en `app/api/admin/`. ✓
- `scripts/setup-mp-plans.ts` existe, importa `mpFetch`/`SUBSCRIPTION_PLANS`, hace POST a `/preapproval_plan`, respeta `MP_MODE`/`_TEST`. ✓
- `package.json` válido con `tsx` (devDep) + `setup:mp-plans`. ✓
- `npx tsc --noEmit`: sin errores en `set-plan/route.ts` ni en `scripts/setup-mp-plans.ts`. ✓

## Deviations from Plan

None — plan executed exactly as written.

## Deferred Issues

`npx tsc --noEmit` reporta 2 errores en archivos GENERADOS de Next.js (`.next/dev/types/validator.ts` y `.next/types/validator.ts`) que aún referencian el `setup-plans/route.js` borrado. Son artefactos stale del cache de Next, fuera del código fuente trackeado; se regeneran en el próximo `next dev`/`next build`. No son código de esta fase y están fuera de scope (no se tocan archivos en `.next/`).

## Threat Mitigations Applied

- **T-03-01 (Information Disclosure):** `!==` → `timingSafeEqual` hash-both-sides. Mitigado.
- **T-03-02 (Information Disclosure):** endpoint web `setup-plans` borrado; el `?secret=` ya no existe. Mitigado.
- **T-03-03 (DoS por RangeError):** hash a 32 bytes fijos antes de comparar → 401 en vez de 500. Mitigado.
- **T-03-04 (Spoofing):** guard de nulo/vacío antes de hashear. Mitigado.
- **T-03-05 (EoP por Edge):** sin cambio de runtime (handlers admin siguen en Node). Aceptado según plan.

## Self-Check: PASSED

- FOUND: app/api/admin/set-plan/route.ts (modificado, commit f6f2b6e)
- FOUND: scripts/setup-mp-plans.ts (creado, commit 156bf89)
- FOUND: package.json (tsx + setup:mp-plans, commit f807b71)
- CONFIRMED DELETED: app/api/admin/setup-plans/route.ts
- Commits f6f2b6e, 156bf89, f807b71 presentes en git log.
