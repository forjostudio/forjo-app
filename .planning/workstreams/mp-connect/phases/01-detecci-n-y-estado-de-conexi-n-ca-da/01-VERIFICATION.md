---
phase: 01-detecci-n-y-estado-de-conexi-n-ca-da
verified: 2026-07-19T18:00:00Z
status: passed
score: 10/10 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 1: Detección y estado de conexión caída — Verification Report

**Phase Goal:** El resolver deja de caer en fallback mudo (refresh rechazado o token rotado sin persistir → conexión caída, no cobra), estado persistido durable en `businesses` (migr. 053 idempotente, sin aplicar), log del motivo real, y limpieza del flag al reconectar por OAuth.
**Verified:** 2026-07-19T18:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

Verificación goal-backward contra el CÓDIGO real (no las tasks). Todas las verdades son *behavior-dependent* (transiciones de estado del resolver: token vencido→null, error→connected). Cada una tiene un test que ejerce la transición y pasa — por eso se marcan VERIFIED y no PRESENT_BEHAVIOR_UNVERIFIED.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | MPCONN-01: refresh rechazado (`refreshMpToken`→null) → `getValidMpAccessToken` devuelve `null` (no el token vencido) y marca `'error'` | ✓ VERIFIED | `lib/payment.ts:51-57` (`if (!refreshed?.access_token) { console.error(...); await setMpConnectionStatus(business.id,'error'); return null }`). Test `mp-token-resolver.test.ts:60-68` asserta `result===null`, `not.toBe('current-tok')`, `setStatus(...,'error')`. |
| 2 | MPCONN-02: refresh OK pero falla persistir el token rotado → devuelve `null` + `'error'`; nunca el token nuevo | ✓ VERIFIED | `lib/payment.ts:61-76` captura `{ error: persistErr }` del `.update()`; si `persistErr` → log + `setMpConnectionStatus('error')` + `return null`. Test `:70-80` asserta `null`, `not.toBe('new-tok')`, `'error'` y NO `'connected'`. |
| 3 | Auto-heal (D-05): refresh + persistencia OK → devuelve el token nuevo y marca `'connected'` | ✓ VERIFIED | `lib/payment.ts:77-80`. Test `:82-92` asserta `'new-tok'`, `.eq('business_id','biz-1')`, `setStatus(...,'connected')`, NO `'error'`. |
| 4 | MPCONN-03: columna durable `businesses.mp_connection_status text NOT NULL DEFAULT 'connected'` (053 idempotente) + campo en interface Business | ✓ VERIFIED | `053_mp_connection_status.sql:33-34` (`ADD COLUMN IF NOT EXISTS ... text NOT NULL DEFAULT 'connected'`); sin `public_businesses`, sin `create policy`. `lib/types.ts:54` `mp_connection_status?: string \| null`. |
| 5 | MPCONN-05: callback OAuth exitoso setea `mp_connection_status:'connected'` owner-scoped | ✓ VERIFIED | `callback/route.ts:47-53` `.update({ mp_user_id, mp_connection_status:'connected' }).eq('owner_id', user.id)`. Test `mp-cobro-callback.test.ts:105-107` asserta el payload incluye ambos campos. |
| 6 | MPCONN-06 / D-04: 401 del POST `/checkout/preferences` → loguea motivo real (sin token) + marca `'error'`, `ok:false` 502 | ✓ VERIFIED | `lib/payment.ts:155-159`. Test `mp-cobro-callback.test.ts:45-68` asserta `result.ok===false` + `setStatus('biz-1','error')`. Log no contiene token (solo `business.id`). |
| 7 | Cero regresión: token sano (>24h) y token manual (sin refresh_token) devuelven el actual, NO refrescan ni escriben el flag | ✓ VERIFIED | `lib/payment.ts:46,48` early-returns intactos. Tests `:94-100` y `:102-113` asertan `refreshMock` y `setStatusMock` NO llamados. |
| 8 | D-09 aislamiento: toda escritura del flag keyed por business_id/id resuelto server-side, service-role (helper) / owner-scoped (callback), nunca id del cliente | ✓ VERIFIED | `mp-connection.ts:16-31` `createAdminClient().update().eq('id', businessId)`; callback usa session client `.eq('owner_id', user.id)`; `createDepositPreference` usa `business.id` ya resuelto. |
| 9 | D-07 scope OAuth: `scope=offline_access read write` en `buildMpAuthUrl`, wired al connect route | ✓ VERIFIED | `lib/mercadopago.ts:117`; `connect/route.ts:16` invoca `buildMpAuthUrl(state)`. Test `mp-connection.test.ts:77-84`. |
| 10 | No se toca el flujo de suscripciones (MP_FORJO_ACCESS_TOKEN) ni el booking público (D-08) | ✓ VERIFIED | `MP_FORJO_ACCESS_TOKEN` ausente en los 4 archivos modificados; `createDepositPreference` solo agrega la rama 401 + log, el resto del cobro intacto. |

**Score:** 10/10 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/053_mp_connection_status.sql` | Columna durable idempotente | ✓ VERIFIED | `ADD COLUMN IF NOT EXISTS`, `text NOT NULL DEFAULT 'connected'`, sin vista pública/policies. Correctamente NO aplicada a ninguna DB (patrón del repo: a mano ANTES del deploy). |
| `lib/mp-connection.ts` | `setMpConnectionStatus` server-only keyed por business_id | ✓ VERIFIED | 31 líneas, service-role, best-effort try/catch, cabecera server-only. |
| `lib/payment.ts` | Resolver sin fallback mudo + detección 401 | ✓ VERIFIED | Importa `setMpConnectionStatus`; 3 ramas de fallo + heal + 401. |
| `app/api/mercadopago/callback/route.ts` | Heal owner-scoped | ✓ VERIFIED | `mp_connection_status:'connected'` en el update owner-scoped. |
| `lib/types.ts` | Campo en interface Business | ✓ VERIFIED | `mp_connection_status?: string \| null`. |
| `lib/mercadopago.ts` | scope explícito | ✓ VERIFIED | `scope: 'offline_access read write'`. |

### Key Link Verification

| From | To | Status | Details |
|------|-----|--------|---------|
| `payment.ts getValidMpAccessToken` | `mp-connection.ts setMpConnectionStatus` | ✓ WIRED | `setMpConnectionStatus(business.id, 'error'\|'connected')` en refresh-fail/persist-fail/heal. |
| `payment.ts createDepositPreference` | `setMpConnectionStatus` | ✓ WIRED | `if (mpRes.status === 401)` → `setMpConnectionStatus(business.id, 'error')`. |
| `callback/route.ts` | `businesses.mp_connection_status` | ✓ WIRED | `.update({ mp_connection_status:'connected' }).eq('owner_id', user.id)`. |
| `mp-connection.ts` | `businesses` (columna) | ✓ WIRED | `.update({ mp_connection_status: status }).eq('id', businessId)`. |
| `connect/route.ts` | `buildMpAuthUrl` (scope) | ✓ WIRED | `NextResponse.redirect(buildMpAuthUrl(state))`. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Resolver + 401 + callback + scope | `npx vitest run test/mp-token-resolver.test.ts test/mp-cobro-callback.test.ts test/mp-connection.test.ts` | 3 files / 12 tests passed | ✓ PASS |
| Tipado | `npx tsc --noEmit` | exit 0 | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Status | Evidence |
|-------------|-------------|--------|----------|
| MPCONN-01 | 01-02 | ✓ SATISFIED | Truth 1 |
| MPCONN-02 | 01-02 | ✓ SATISFIED | Truth 2 |
| MPCONN-03 | 01-01 | ✓ SATISFIED | Truth 4 |
| MPCONN-05 | 01-02 | ✓ SATISFIED | Truth 5 |
| MPCONN-06 | 01-02 | ✓ SATISFIED | Truth 6 |

MPCONN-04 (dashboard) es Phase 2 — fuera de scope, correctamente no reclamado por ningún plan de Phase 1.

### Prohibitions (must-NOT) — todas cumplidas

- ✓ `setMpConnectionStatus` nunca escribe con un id del cliente (keyed `.eq('id', businessId)` server-side).
- ✓ Migración 053 NO toca `public_businesses` ni policies RLS (grep confirma ausencia).
- ✓ `lib/mp-connection.ts` server-only (service-role), no importado desde client/public/server.
- ✓ Resolver nunca devuelve el token vencido tras refresh rechazado ni el token nuevo tras persist-fail.
- ✓ Ningún log contiene valores de token (solo `business.id` + motivo).
- ✓ Callback nunca sana otro negocio (`.eq('owner_id', user.id)`, RLS owner-only).
- ✓ No se toca booking público (D-08) ni suscripciones (MP_FORJO_ACCESS_TOKEN).

### Anti-Patterns Found

Ninguno. Sin TODO/FIXME/XXX en los archivos modificados. Sin stubs, sin retornos vacíos hardcodeados que fluyan a rendering.

## Operational Note (no bloquea el goal de código)

La migración 053 **NO está aplicada a ninguna base** — esperado y correcto (patrón del repo: migraciones a mano, en orden, ANTES del deploy). El ARCHIVO de migración fue verificado (idempotente, aditivo, sin vista/policies). Pendiente operativo documentado en 01-01-SUMMARY para el deploy: (1) `supabase db reset` local (diferido en la sesión — Docker abajo), (2) aplicar 053 a PROD antes del código, (3) `NOTIFY pgrst, 'reload schema'` + regenerar `schema.sql`. Estas son acciones de deploy, no gaps de código de esta fase.

## Gaps Summary

Ninguno. Los 10 must-haves están verificados con evidencia de código y tests behaviorales que pasan (12/12). El fallback mudo del resolver quedó cerrado en ambas ramas (refresh-fail + persist-fail), el estado se persiste durable, el motivo real se loguea sin exponer tokens, y el flag se limpia por OAuth y por auto-heal. Aislamiento por tenant intacto; cero regresión en tokens sano/manual.

---

_Verified: 2026-07-19T18:00:00Z_
_Verifier: Claude (gsd-verifier)_
