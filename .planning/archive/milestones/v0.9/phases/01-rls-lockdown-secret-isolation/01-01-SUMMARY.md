---
phase: 01-rls-lockdown-secret-isolation
plan: 01
subsystem: database
tags: [rls, supabase, multi-tenant, secrets, migration, postgres, security]

# Dependency graph
requires:
  - phase: (milestone baseline)
    provides: "migración 026 (public_businesses + DROP de la policy abierta de businesses), schema base con policies owner-only y public read USING(true)"
provides:
  - "Migración aditiva 027: tabla business_secrets (RLS solo-dueño, sin acceso anon) + copia de datos desde businesses"
  - "Vistas públicas acotadas public_services (WHERE active=true) y public_business_hours, con GRANT a anon/authenticated"
  - "Helper server-only getBusinessSecrets(businessId) con fallback a businesses durante la transición 027->028"
  - "Tipo BusinessSecrets (7 campos) y Business sin campos secretos en lib/types.ts"
affects: [01-02, 01-03, 01-04, 01-05, payment-webhook, settings-dashboard, recaptcha, email, google-calendar]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Separación física de secretos por tenant en business_secrets (owner-only RLS, sin policy anon)"
    - "Vistas públicas acotadas security-definer (sin security_invoker) gemelas de 026/007"
    - "Migración en dos mitades: 027 aditiva (deploy backward-compatible) + 028 destructiva (DROP policies/columns)"
    - "Helper compartido con fallback de transición leído solo por service role (server-only)"

key-files:
  created:
    - supabase/migrations/027_business_secrets_and_public_views.sql
    - lib/business-secrets.ts
  modified:
    - lib/types.ts

key-decisions:
  - "El único DROP en 027 es el guard de idempotencia de su propia policy nueva (owner access secrets); ningún DROP toca objetos pre-existentes (D-02: lo destructivo va en 028)"
  - "BusinessSecrets se define en lib/business-secrets.ts y se re-exporta desde lib/types.ts (punto único de referencia, sin duplicar)"
  - "PublicBusiness Omit se redujo a 'notification_email' (los 7 campos secretos ya no existen en Business → no se pueden omitir)"

patterns-established:
  - "getBusinessSecrets(businessId): lee business_secrets vía service role, fallback a businesses pre-028"
  - "Vista pública acotada + GRANT a anon/authenticated, security-definer por default (replica 026/007)"

requirements-completed: []  # SEC-01 NO se completa en este plan: requiere aplicar 027 (checkpoint) + olas 2/3 (repunte) + 028 (drop). Este plan entrega solo la fundación aditiva.

# Metrics
duration: ~6min (autónomo, hasta el checkpoint)
completed: 2026-06-16
status: complete
---

# Phase 1 Plan 01: business_secrets + vistas públicas acotadas — Fundación aditiva

**Migración aditiva 027 (tabla business_secrets owner-only + vistas public_services/public_business_hours + copia de datos), más el helper server-only getBusinessSecrets() con fallback de transición y el split de secretos fuera de la interface Business. PAUSADO en el checkpoint [BLOCKING] para aplicar 027 a mano en Supabase.**

## Performance

- **Duration:** ~6 min (tareas autónomas, hasta el checkpoint)
- **Started:** 2026-06-16T02:00:30Z
- **Completed (autónomo):** 2026-06-16 (pausado en checkpoint human-action)
- **Tasks:** 2 de 3 (Task 3 es el checkpoint [BLOCKING], no ejecutable por el agente)
- **Files modified:** 3 (2 creados, 1 modificado)

## Accomplishments
- Migración 027 aditiva pura: business_secrets (7 secretos, PK business_id FK ON DELETE CASCADE), RLS habilitada, única policy owner-only, sin acceso anon; copia idempotente de datos desde businesses; vistas public_services (10 cols, WHERE active=true) y public_business_hours (6 cols) con GRANT a anon/authenticated, sin security_invoker.
- Helper lib/business-secrets.ts (server-only): getBusinessSecrets() + interface BusinessSecrets + EMPTY, lee business_secrets con fallback a businesses para la ventana 027->028.
- lib/types.ts: 7 campos secretos retirados de Business (conserva mp_user_id, recaptcha_site_key, notification_email); PublicBusiness Omit reducido; re-export de BusinessSecrets.

## Task Commits

1. **Task 1: Migración 027 aditiva** - `7affef9` (feat)
2. **Task 2: Helper getBusinessSecrets + split de tipos** - `d81ab0a` (feat)

**Task 3:** checkpoint:human-action [BLOCKING] — aplicar 027 a mano en Supabase. NO ejecutado (requiere acción humana). El plan reanuda tras "027 aplicada".

## Files Created/Modified
- `supabase/migrations/027_business_secrets_and_public_views.sql` - Tabla business_secrets owner-only + copia de datos + vistas públicas acotadas (aditiva pura).
- `lib/business-secrets.ts` - Helper server-only getBusinessSecrets() con fallback de transición; interface BusinessSecrets.
- `lib/types.ts` - Business sin los 7 campos secretos; re-export de BusinessSecrets; PublicBusiness Omit reducido.

## Decisions Made
- El `DROP POLICY IF EXISTS "owner access secrets"` de 027 es el guard de idempotencia de la propia policy nueva de la tabla (patrón canónico de schema.sql/README.md), no una operación destructiva sobre estado pre-existente. Todo DROP destructivo (policies services/business_hours, columnas businesses) se difiere a 028 (D-02).
- `BusinessSecrets` vive en `lib/business-secrets.ts` y se re-exporta desde `lib/types.ts` para cumplir "types.ts contiene BusinessSecrets" sin duplicar la definición.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug en el comando de verificación] El grep del `<verify>` de Task 1 marca falso positivo sobre el guard de idempotencia**
- **Found during:** Task 1 (verificación de migración 027)
- **Issue:** El comando automatizado del plan (`grep ... 'drop[[:space:]]+(policy|column|table)' ... grep -qx 0`) cuenta como "op destructiva" la línea `DROP POLICY IF EXISTS "owner access secrets" ON business_secrets;`, que es el guard de idempotencia de la PROPIA policy nueva que 027 crea dos líneas después. La acción del plan (Task 1 paso 3) MANDA escribir exactamente ese `DROP POLICY IF EXISTS ...; CREATE POLICY ...` — el plan se contradice: el `<action>` exige el patrón y el `<verify>` lo marca como destructivo.
- **Fix:** Se confirmó manualmente la intención real de la prohibición (no tocar destructivamente objetos PRE-EXISTENTES: policies de services/business_hours, columnas de businesses — eso es 028). Verificación corregida: excluir el guard de la propia policy nueva antes de contar → 0 ops destructivas reales. La migración NO contiene ningún DROP/DELETE sobre objetos pre-existentes.
- **Files modified:** ninguno (la migración ya era correcta; el falso positivo está en el comando del plan)
- **Verification:** `grep -vE '^\s*--' 027....sql | grep -ivE 'drop policy if exists "owner access secrets" on business_secrets' | grep -ciE 'drop (policy|column|table)|^delete' == 0`
- **Committed in:** `7affef9` (migración correcta tal como exige el `<action>`)

---

**Total deviations:** 1 (Rule 1 — bug en el comando de verificación del plan, no en el artefacto)
**Impact on plan:** Ninguno sobre el código. La migración cumple el `<action>` y las prohibiciones reales (aditiva pura, sin DROP de objetos pre-existentes). Solo se ajustó la lectura del verify para no bloquear por un falso positivo autoinfligido por el propio plan.

## Issues Encountered
- `tsc --noEmit` reporta 7 errores, TODOS en `app/(dashboard)/settings/settings-client.tsx` (referencias a `mp_access_token`, `resend_api_key`, `resend_from`, `recaptcha_secret_key` ya retirados de `Business`). Es exactamente lo esperado y documentado por el plan: ese archivo es el repunte de dashboard de las olas 2/3 (RESEARCH §4 blast-radius, D-05). `lib/business-secrets.ts` y `lib/types.ts` (los archivos tocados en este plan) compilan limpios.

## User Setup Required
**Acción humana requerida AHORA (checkpoint Task 3, [BLOCKING]):** aplicar la migración 027 a mano en el SQL editor de Supabase (este proyecto NO usa `supabase db push`). Ver el bloque "CHECKPOINT REACHED" devuelto por el ejecutor para el runbook completo y las queries de verificación. NO correr nada destructivo todavía (las columnas-secreto siguen en businesses hasta 028, plan 01-05).

**Pendiente operativo (D-06, fuera de este plan):** rotar las credenciales por-tenant expuestas mientras la app estuvo live con el agujero USING(true) (mp_access_token, mp_refresh_token, resend_api_key, recaptcha_secret_key, google_refresh_token).

## Next Phase Readiness
- Fundación lista para las olas 2/3: `getBusinessSecrets()` y `BusinessSecrets` ya se pueden importar; los lectores de secretos (≈20 archivos, incluido el landmine `select('*')` del webhook D-03) se repuntan en esos planes.
- **Bloqueador activo:** 027 debe estar APLICADA en la base antes de que las olas 2/3 deployen código que lee de business_secrets (aunque el fallback a businesses cubre la ventana si 027 aún no corrió).
- 028 (plan 01-05, mitad destructiva) sólo después de confirmar el código live.

---
*Phase: 01-rls-lockdown-secret-isolation*
*Completed (parcial, hasta checkpoint): 2026-06-16*
