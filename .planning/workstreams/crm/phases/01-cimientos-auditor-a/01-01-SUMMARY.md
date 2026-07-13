---
phase: 01-cimientos-auditor-a
plan: 01
subsystem: crm-foundations
tags: [security, audit, rls, supabase, guard]
status: complete
requires: []
provides:
  - "tabla audit_log (RLS admin-only read, write solo service-role)"
  - "logAudit() helper de auditoría con service-role"
  - "requireAdmin() guard server-side reutilizable"
affects:
  - supabase/migrations/031_crm_audit_log.sql
  - lib/audit.ts
  - lib/admin-guard.ts
tech-stack:
  added: []
  patterns:
    - "RLS SELECT gateada por app_metadata JWT (is_admin), nunca using(true)"
    - "service-role write-only para tablas no falsificables por el cliente"
    - "guard que LANZA (no redirige) para actions/route handlers"
key-files:
  created:
    - supabase/migrations/031_crm_audit_log.sql
    - lib/audit.ts
    - lib/admin-guard.ts
    - lib/audit.test.ts
  modified: []
decisions:
  - "Migración numerada 031 (030 ya tomado por workstream web-builder)"
  - "is_admin leído de app_metadata, no de columna en businesses (D1)"
  - "audit_log sin policy de insert/update/delete para usuarios (D5)"
metrics:
  duration: "~12 min"
  completed: 2026-06-17
  tasks: 3
  files: 4
---

# Phase 1 Plan 01: Cimientos de Seguridad & Auditoría Summary

Migración `031_crm_audit_log.sql` (tabla `audit_log` global admin-only con RLS gateada por `app_metadata` JWT), helper `logAudit()` que escribe auditoría best-effort con service-role, y guard `requireAdmin()` que re-valida `is_admin` server-side en cada action/route handler del CRM.

## What Was Built

- **`supabase/migrations/031_crm_audit_log.sql`** — Tabla `public.audit_log` (10 columnas: id, actor_id→auth.users, action, target_type, target_id text, business_id→businesses, risk con check 'alto'|'medio'|'bajo', reason, metadata jsonb, created_at). RLS habilitada en la misma migración. Una sola policy SELECT restringida a `is_admin` vía `(select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true'`. SIN policy de write para usuarios → solo service-role escribe. 3 índices (created_at desc, business_id, action). NO crea columna is_admin en businesses (D1).
- **`lib/audit.ts`** — `logAudit(input)` recibe un objeto único, escribe en audit_log con `createAdminClient()` (service-role, bypassa RLS), mapea a snake_case, opcionales→null/metadata{}. Error de insert es best-effort: `console.error('[audit/log] insert error:', ...)` sin lanzar. Exporta type `Risk`.
- **`lib/admin-guard.ts`** — `requireAdmin()` async: `createClient()` + `auth.getUser()`; `!user`→throw 'unauthorized'; `user.app_metadata?.is_admin !== true`→throw 'forbidden'; éxito→`return user`. Lee app_metadata, NO consulta businesses. LANZA (no redirige) para uso en actions/handlers.
- **`lib/audit.test.ts`** — 3 tests Vitest (mapeo snake_case, opcionales→null, error best-effort) mockeando `@/lib/supabase/admin`. El contrato de tipo de `Risk` lo enforce TypeScript en compile-time.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Migración 031 audit_log con RLS | 03c6e52 | supabase/migrations/031_crm_audit_log.sql |
| 2 (RED) | Test fallando de logAudit | a28d079 | lib/audit.test.ts |
| 2 (GREEN) | Implementación logAudit() | de027bf | lib/audit.ts, lib/audit.test.ts |
| 3 | requireAdmin() guard | 6c1fafa | lib/admin-guard.ts |

## Verification

- `npx vitest run lib/audit.test.ts` → 3 tests verdes.
- `npx tsc --noEmit` → sin errores en archivos del plan.
- `npx eslint` sobre lib/audit.ts, lib/audit.test.ts, lib/admin-guard.ts → limpio.
- Migración: RLS habilitada (1 ocurrencia), 0 `using(true)`, gate `app_metadata` presente.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Typing del mock para tsc strict**
- **Found during:** Task 2 (GREEN)
- **Issue:** `vi.fn()` sin parametrizar produce un tipo `Mock<Procedure | Constructable>` no-callable bajo `strict: true` → 2 errores TS2348 en `lib/audit.test.ts`.
- **Fix:** Tipar `insertSpy`/`fromSpy` con `vi.fn<(...args) => ...>()` explícito.
- **Files modified:** lib/audit.test.ts
- **Commit:** de027bf

### Nota de path
El test se ubicó en `lib/audit.test.ts` (según frontmatter del plan), no en el directorio `test/` donde viven los otros 4 tests del repo. Vitest lo recoge igual (glob default `**/*.test.ts`). Sin impacto funcional.

## TODO Operativo Post-Deploy (acción humana)

1. **Aplicar la migración 031 a mano en Supabase** (SQL editor o `supabase db push`). El executor NO la aplicó — aplicarla es acción del operador.
2. **Regenerar `supabase/schema.sql`** con `supabase db dump` tras aplicar 031, para mantenerlo en sync (Runtime State Inventory del research).
3. (Plan futuro / D2) Bootstrap de `is_admin`: setear `app_metadata: { is_admin: true }` al usuario operador vía script local con service-role — sin esto, la policy SELECT de audit_log devuelve 0 filas a todos.

## Known Stubs

Ninguno. Los tres artefactos están completos y wireados; los planes 02-04 los consumen.

## Self-Check: PASSED

- FOUND: supabase/migrations/031_crm_audit_log.sql
- FOUND: lib/audit.ts
- FOUND: lib/admin-guard.ts
- FOUND: lib/audit.test.ts
- FOUND commit: 03c6e52, a28d079, de027bf, 6c1fafa
