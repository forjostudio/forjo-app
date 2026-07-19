---
phase: 01-detecci-n-y-estado-de-conexi-n-ca-da
plan: 01
subsystem: payments
tags: [mercadopago, oauth, supabase, service-role, migration, multi-tenant]

# Dependency graph
requires: []
provides:
  - "Columna durable businesses.mp_connection_status (migración 053, idempotente, no auto-aplicada)"
  - "Helper server-only setMpConnectionStatus(businessId, status) keyed por business_id (service-role, best-effort)"
  - "Campo mp_connection_status en interface Business (lib/types.ts)"
  - "scope=offline_access read write explícito en buildMpAuthUrl (garantiza refresh_token de MP)"
affects: [01-02, phase-2-dashboard, mercadopago-connect, resolver-de-token]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Escritura del flag de estado con service-role keyed por business_id (nunca id del cliente, D-09)"
    - "Side-effect best-effort: loguea con prefijo [mp/connection] y no re-lanza"

key-files:
  created:
    - supabase/migrations/053_mp_connection_status.sql
    - lib/mp-connection.ts
    - test/mp-connection.test.ts
  modified:
    - lib/types.ts
    - lib/mercadopago.ts

key-decisions:
  - "D-01: text-enum ('connected'|'error') sobre boolean, por extensibilidad barata a 'revoked' sin re-migrar"
  - "D-02: migración 053 no auto-aplicada; se aplica a mano a prod ANTES del deploy del código"
  - "D-07: scope explícito offline_access read write para garantizar que MP emita refresh_token"
  - "D-09: toda escritura del flag es service-role keyed por business_id resuelto server-side"

patterns-established:
  - "Módulo server-only con cabecera de advertencia (no importar desde client/public/server.ts), igual que lib/business-secrets.ts"
  - "Escritura del flag best-effort: no debe romper el cobro/refresh; try/catch + console.error, sin re-throw"

requirements-completed: [MPCONN-03]

# Metrics
duration: ~20min
completed: 2026-07-19
status: complete
---

# Phase 1 Plan 01: Base durable del estado de conexión de MercadoPago Connect — Summary

**Columna durable `businesses.mp_connection_status` (migración 053) + primitiva server-only `setMpConnectionStatus` keyed por business_id + `scope` OAuth explícito para garantizar `refresh_token`.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2 auto completadas + 1 checkpoint humano aprobado (con validación local diferida)
- **Files modified:** 5 (2 modificados, 3 creados)

## Accomplishments
- Columna durable `businesses.mp_connection_status text NOT NULL DEFAULT 'connected'` vía migración 053 idempotente, aditiva, sin tocar la vista pública ni policies RLS.
- Helper `setMpConnectionStatus(businessId, status)` (server-only, service-role, keyed por `.eq('id', businessId)`, best-effort) — listo para que 01-02 lo consuma.
- Campo `mp_connection_status?: string | null` expuesto en `interface Business` para que la Phase 2 lo lea sin query nuevo.
- `scope=offline_access read write` explícito en `buildMpAuthUrl` (cierra la deuda #2 de la skill: garantiza que MP emita `refresh_token`).
- Test `test/mp-connection.test.ts` con 5 casos (keyed-by-id, acepta `connected`, swallow-error en throw, swallow-error en `{ error }`, scope presente) — todos verdes.

## Task Commits

Cada task se commiteó atómicamente:

1. **Task 1: Migración 053 + campo en Business** — `14ee4b7` (feat)
2. **Task 2: setMpConnectionStatus + scope OAuth + test** — `e76e55d` (feat)
3. **Task 3: Checkpoint humano** — aceptado con validación local diferida (ver Deviations / Issues)

## Files Created/Modified
- `supabase/migrations/053_mp_connection_status.sql` — columna durable idempotente (`ADD COLUMN IF NOT EXISTS ... text NOT NULL DEFAULT 'connected'`), no toca vista pública ni policies, no auto-aplicada.
- `lib/mp-connection.ts` — `setMpConnectionStatus` server-only, service-role, keyed por business_id, best-effort.
- `lib/types.ts` — campo `mp_connection_status?: string | null` en `interface Business` (bloque MercadoPago Connect, junto a `mp_user_id`).
- `lib/mercadopago.ts` — `scope: 'offline_access read write'` sumado a los `URLSearchParams` de `buildMpAuthUrl`.
- `test/mp-connection.test.ts` — cobertura Vitest del helper y del scope.

## Decisions Made
- Seguido el plan tal cual (D-01, D-02, D-07, D-09). Sin decisiones nuevas de implementación.
- Nota de implementación: se reescribió un comentario de la migración 053 que mencionaba el nombre literal de la vista pública, porque la verificación automatizada del plan (`! grep -qi "public_businesses"`) es literal y fallaba por el comentario. La migración sigue sin tocar la vista; solo cambió la redacción del comentario.

## Deviations from Plan

None de código — el plan se ejecutó como fue escrito. La única variación es procedimental, en el checkpoint (ver Issues).

## Issues Encountered

**Checkpoint (Task 3) aprobado con validación local DIFERIDA.**
- **Base de la aprobación:** revisión ESTÁTICA de la migración 053 (idempotente, `ADD COLUMN IF NOT EXISTS`, no toca vista pública ni policies) + reconocimiento del orden de deploy D-02.
- **Pendiente (NO hecho):** el `supabase db reset` LOCAL (PG17) **no se corrió** — el Docker/Supabase local no estaba levantado y el usuario estaba remoto. Queda como acción del usuario: correr `supabase db reset` en su máquina para validar el replay del baseline + migraciones hasta la 053 ANTES de aplicar la 053 a prod.
- **La migración NO se aplicó a ninguna base** (ni local ni prod), según el constraint del plan.

## User Setup Required

**Acción del usuario coordinada con el deploy de esta fase (D-02):**
1. Validar en LOCAL: `supabase db reset` (PG17) — confirmar que replaya hasta la 053 sin error y que `mp_connection_status` queda en `businesses` con default `'connected'`. **[PENDIENTE — no corrido en esta sesión]**
2. Aplicar `053_mp_connection_status.sql` a mano al Postgres de PROD **ANTES** de desplegar el código de esta fase (si la columna no existe, las escrituras del flag fallan best-effort — el cobro no se rompe, pero el estado no persiste).
3. Tras aplicar en prod: `NOTIFY pgrst, 'reload schema';` y regenerar `supabase/schema.sql` (patrón del repo).

## Next Phase Readiness
- Artefactos listos para el Plan 01-02 (resolver de token / callback): `setMpConnectionStatus` disponible como escritura del flag; columna + campo en `Business` en su lugar.
- **Blocker operativo antes de ir a prod:** la migración 053 debe estar validada en local y aplicada a prod (arriba). No bloquea el desarrollo de 01-02 (que consume el helper, no la columna aplicada).

## Self-Check: PASSED

- Archivos verificados en disco: `supabase/migrations/053_mp_connection_status.sql`, `lib/mp-connection.ts`, `test/mp-connection.test.ts` — todos presentes.
- Commits verificados en git: `14ee4b7`, `e76e55d` — ambos presentes en `gsd/mp-connect`.

---
*Phase: 01-detecci-n-y-estado-de-conexi-n-ca-da*
*Completed: 2026-07-19*
