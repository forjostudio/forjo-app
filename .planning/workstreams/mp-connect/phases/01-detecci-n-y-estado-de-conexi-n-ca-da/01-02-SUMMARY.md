---
phase: 01-detecci-n-y-estado-de-conexi-n-ca-da
plan: 02
subsystem: payments
tags: [mercadopago, oauth, token-refresh, resolver, multi-tenant, service-role]

# Dependency graph
requires:
  - "01-01: setMpConnectionStatus(businessId, status) — helper server-only, service-role, keyed por business_id"
  - "01-01: columna businesses.mp_connection_status (migración 053, no auto-aplicada)"
provides:
  - "getValidMpAccessToken sin fallback mudo: refresh rechazado o persist-fail → marca 'error' + devuelve null (nunca token vencido/no persistido)"
  - "Auto-heal: refresh OK + persistencia OK → marca 'connected' (D-05)"
  - "createDepositPreference detecta 401 del POST a /checkout/preferences → marca 'error' + log motivo real (D-04, MPCONN-06)"
  - "Callback OAuth sana el flag: mp_connection_status:'connected' en el update owner-scoped (MPCONN-05, D-06)"
affects: [phase-2-dashboard, mercadopago-connect, booking-con-sena]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Resolver de token fail-closed: ante refresh rechazado o persistencia fallida NO se cobra con un token dudoso; se marca la conexión caída y se devuelve null"
    - "Detección de token revocado por 401 en el cobro (no detectable por expiración)"
    - "Auto-heal idempotente del flag tras un refresh/persistencia OK"

key-files:
  created:
    - test/mp-token-resolver.test.ts
    - test/mp-cobro-callback.test.ts
  modified:
    - lib/payment.ts
    - app/api/mercadopago/callback/route.ts

key-decisions:
  - "D-03: refresh rechazado (refreshMpToken→null) y persist-fail del token rotado → setMpConnectionStatus('error') + return null; fin del fallback mudo"
  - "D-05: refresh OK + persist OK → setMpConnectionStatus('connected') (auto-heal idempotente)"
  - "D-04: 401 del POST /checkout/preferences → marca 'error' + log; devuelve ok:false status 502; NO cambia el flujo público (D-08)"
  - "D-06: callback OAuth agrega mp_connection_status:'connected' al update owner-scoped (.eq('owner_id', user.id)) — sana solo el negocio del dueño"

patterns-established:
  - "Capturar el { error } del .update() del token rotado single-use: si falla la persistencia, la conexión se trata como rota"
  - "Logs con business.id + motivo real, NUNCA valores de token (T-01-08)"

requirements-completed: [MPCONN-01, MPCONN-02, MPCONN-05, MPCONN-06]

# Metrics
duration: ~15min
completed: 2026-07-19
status: complete
---

# Phase 1 Plan 02: Resolver de token sin fallback mudo + detección de caída — Summary

**`getValidMpAccessToken` deja de devolver el token vencido/no persistido: refresh rechazado o persist-fail del rotado single-use → marca la conexión `'error'` y devuelve `null`; un refresh OK auto-sana a `'connected'`; un 401 en el cobro marca la caída; la reconexión OAuth limpia el flag. Todo fallo queda logueado server-side con el motivo real, sin exponer tokens.**

## Performance
- **Duration:** ~15 min
- **Tasks:** 2 auto (Task 1 con TDD)
- **Files modified:** 4 (2 modificados, 2 creados)

## Accomplishments
- **Fin del fallback mudo (MPCONN-01):** cuando `refreshMpToken` devuelve `null`, `getValidMpAccessToken` marca `'error'` y devuelve `null` — ya NO cobra con el token vencido.
- **Persist-fail cerrado (MPCONN-02):** el `.update()` de la rotación a `business_secrets` ahora captura su `{ error }`; si falla, se marca `'error'` y se devuelve `null` (el refresh single-use consumido sin reemplazo = conexión rota, nunca se devuelve el token nuevo).
- **Auto-heal (D-05):** refresh + persistencia OK → `setMpConnectionStatus('connected')` idempotente.
- **Detección por 401 (D-04, MPCONN-06):** `createDepositPreference` detecta el `401` del POST a `/checkout/preferences` (token revocado por el negocio, no detectable por expiración) → marca `'error'`, loguea el motivo, devuelve `ok:false` status 502. El flujo público NO cambia (D-08).
- **Heal en la reconexión (MPCONN-05, D-06):** el callback OAuth agrega `mp_connection_status:'connected'` al mismo update owner-scoped (`.eq('owner_id', user.id)`) — sana solo el negocio del dueño.
- **Cero regresión:** los caminos de token sano (>24h) y token manual (sin refresh_token) quedan intactos y NO escriben el flag.
- Tests: `mp-token-resolver.test.ts` (5 casos), `mp-cobro-callback.test.ts` (2 casos) — todos verdes.

## Task Commits
1. **Task 1: getValidMpAccessToken sin fallback mudo + auto-heal (TDD)** — `46665fe` (feat)
2. **Task 2: detección 401 en el cobro + heal del flag en la reconexión OAuth** — `9374c1e` (feat)

## Files Created/Modified
- `lib/payment.ts` — `getValidMpAccessToken` endurecido (refresh-fail/persist-fail → error+null; persist-OK → connected+token) e import de `setMpConnectionStatus`; `createDepositPreference` con rama del `401` antes de parsear la preferencia.
- `app/api/mercadopago/callback/route.ts` — `mp_connection_status:'connected'` sumado al payload del `.update({ mp_user_id })` owner-scoped, con comentario del heal.
- `test/mp-token-resolver.test.ts` — 5 casos (refresh-null, persist-fail, heal, token sano, token manual) con mocks izados de `refreshMpToken`/`setMpConnectionStatus` + admin falso.
- `test/mp-cobro-callback.test.ts` — 401 del cobro marca `'error'`; callback exitoso escribe `mp_connection_status:'connected'`.

## Decisions Made
- Seguido el plan tal cual (D-03/D-04/D-05/D-06/D-08/D-09). Orden interno elegido: persistir → marcar `'connected'` (auto-heal después de confirmar la persistencia). El observable coincide con `<behavior>`.
- 401 devuelve `status: 502` con mensaje neutro server-side; el flujo de booking público no se toca (D-08).

## Deviations from Plan
None — el plan se ejecutó como fue escrito.

## Threat Model Compliance
- **T-01-06 (persist-fail):** cubierto — se captura el `{ error }` del `.update()`, se devuelve `null` y se marca `'error'` (test persist-fail).
- **T-01-07 (fallo mudo):** cubierto — cada rama de fallo (refresh rechazado, persist-fail, 401) loguea con prefijo `[mp/...]` el motivo real.
- **T-01-08 (info disclosure):** cubierto — los logs contienen `business.id` + motivo, NUNCA valores de token/refresh.
- **T-01-09 (heal cross-tenant):** cubierto — el heal del callback usa el session client `.eq('owner_id', user.id)`.
- **T-01-10 (regresión token sano):** cubierto — early-returns de token sano/manual intactos, tests de cero-regresión.
- **T-01-11 (401 marca el negocio equivocado):** cubierto — `setMpConnectionStatus(business.id, ...)` usa el id ya resuelto server-side (D-09).

## Verification
- `npx vitest run test/mp-token-resolver.test.ts` → 5/5 verde.
- `npx vitest run test/mp-cobro-callback.test.ts` → 2/2 verde.
- `npx vitest run` (suite completa) → 566 passed | 50 skipped; los 9 archivos fallidos son tests de integración que requieren Supabase local (ECONNREFUSED 127.0.0.1:54321, Docker apagado) — pre-existentes, ambientales, fuera de scope de este plan (ninguno toca los archivos modificados).
- `npx tsc --noEmit` → exit 0.
- `npx eslint` sobre los 4 archivos → exit 0.
- Inspección: ningún log contiene valores de token; el callback sana solo con owner-scope; el booking público no cambió (D-08).

## Known Stubs
None.

## Next Phase Readiness
- El flag `mp_connection_status` ya se escribe en las 3 rutas (resolver, cobro, callback). Phase 2 (dashboard) puede leerlo de `business` para avisar al dueño que reconecte.
- **Blocker operativo heredado de 01-01:** la migración 053 debe estar aplicada a prod para que las escrituras del flag persistan (best-effort: si la columna no existe, el cobro NO se rompe, pero el estado no persiste).

## Self-Check: PASSED
- Archivos verificados en disco: `test/mp-token-resolver.test.ts`, `test/mp-cobro-callback.test.ts`, `lib/payment.ts`, `app/api/mercadopago/callback/route.ts` — presentes.
- Commits verificados en `gsd/mp-connect`: `46665fe`, `9374c1e` — ambos presentes.

---
*Phase: 01-detecci-n-y-estado-de-conexi-n-ca-da*
*Completed: 2026-07-19*
