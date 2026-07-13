---
phase: 01-rls-lockdown-secret-isolation
plan: 02
subsystem: payments
tags: [rls, supabase, secrets, mercadopago, payment, select-star, business_secrets]

# Dependency graph
requires:
  - phase: 01-rls-lockdown-secret-isolation (plan 01-01)
    provides: getBusinessSecrets() helper, BusinessSecrets type, business_secrets table (migration 027)
provides:
  - "Webhook de seña lee secretos vía getBusinessSecrets (sin select('*')); guard sobre secrets.mp_access_token"
  - "lib/payment.ts escribe los tokens MP rotados en business_secrets (no en businesses)"
  - "payment/create y payment/retry obtienen el MP token desde business_secrets antes de crear la preferencia"
affects: [01-05 (drop destructivo de columnas-secreto en businesses), dashboard/settings repoint]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Selects explícitos de columnas no secretas en lugar de select('*')/businesses(*) en lectores de pago"
    - "Fetch separado de secretos vía getBusinessSecrets(business.id) después de resolver el negocio"
    - "Write de rotación de tokens MP a business_secrets keyed por business_id"

key-files:
  created: []
  modified:
    - lib/payment.ts
    - app/api/payment/webhook/[slug]/route.ts
    - app/api/payment/create/route.ts
    - app/api/payment/retry/[token]/route.ts

key-decisions:
  - "El write de rotación (getValidMpAccessToken) se mueve a business_secrets; la lectura del access_token la resuelve el caller vía getBusinessSecrets y la pasa en BusinessForDeposit/MpTokenBusiness"
  - "El join embebido de payment/retry se acota a columnas no secretas en vez de eliminarse: los secretos se traen con un fetch separado de business_secrets (Pitfall E)"
  - "El fallback transitorio a businesses NO se removió (lo provee getBusinessSecrets; su remoción es del plan 01-05 post-028)"

patterns-established:
  - "Anti select('*') en lectores de secretos: columnas explícitas para que un drop de columna falle ruidoso, no devuelva undefined silencioso (D-03)"
  - "Guard de 'sin MP token' evalúa secrets.mp_access_token del fetch de business_secrets, no business.* de un select('*')"

requirements-completed: [SEC-01]

# Metrics
duration: ~20min
completed: 2026-06-15
status: complete
---

# Phase 01 Plan 02: Repoint de lectores/escritores de secretos de pago a business_secrets

**Los 4 archivos de pago (webhook de seña, lib/payment, payment/create, payment/retry) leen los secretos MP desde business_secrets vía getBusinessSecrets y escriben los tokens rotados en business_secrets, cerrando las 3 trampas select('*')/businesses(*) que romperían los pagos en silencio tras el drop de columnas de la migración 028.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-06-15
- **Completed:** 2026-06-15
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- Webhook de seña: `select('*')` reemplazado por columnas no secretas explícitas; secretos (mp_access_token, resend_api_key/from, google_refresh_token) vía `getBusinessSecrets(business.id)`; el guard ahora corta sobre `secrets.mp_access_token` (D-03 / T-01-05).
- `lib/payment.ts`: el write de la rotación de tokens MP (access/refresh/expires) apunta a `business_secrets` keyed por `business_id`, no a `businesses` (T-01-07). Lógica de decisión intacta (umbral 24h, token manual, fallback al actual si el refresh falla).
- `payment/create`: `select('*')` → select explícito + `getBusinessSecrets`; arma `BusinessForDeposit` con los `mp_*` de business_secrets (T-01-06).
- `payment/retry`: el join `businesses(*)` se acotó a columnas no secretas; el MP token viene de un fetch separado de business_secrets (Pitfall E).
- Fallback transitorio (027→028) preservado: lo provee `getBusinessSecrets`; su remoción queda para el plan 01-05.

## Task Commits

Cada tarea se commiteó atómicamente:

1. **Task 1: lib/payment.ts — leer y escribir tokens MP en business_secrets** - `3d2e7a2` (fix)
2. **Task 2: Webhook de seña — eliminar select('*'), secretos vía getBusinessSecrets** - `d23aa80` (fix)
3. **Task 3: payment/create y payment/retry — MP token desde business_secrets** - `d9c489a` (fix)

_Nota: las tareas estaban marcadas `tdd="true"`, pero el proyecto no tiene framework de tests (devDeps sin vitest/jest) y `tdd_mode: false` en config; el orquestador no pasó TDD_MODE. La verificación se hizo con los grep automatizados del plan + `npx tsc --noEmit` (la propia sección `<verification>` del plan es grep + tsc, no tests)._

## Files Created/Modified
- `lib/payment.ts` - getValidMpAccessToken escribe la rotación en business_secrets; createDepositPreference recibe el token resuelto desde business_secrets vía el caller.
- `app/api/payment/webhook/[slug]/route.ts` - select explícito de columnas no secretas + getBusinessSecrets; guard sobre secrets.mp_access_token; email/gcal leen sus secretos de business_secrets.
- `app/api/payment/create/route.ts` - select explícito + getBusinessSecrets; BusinessForDeposit con mp_* de business_secrets.
- `app/api/payment/retry/[token]/route.ts` - join embebido acotado a columnas no secretas + fetch separado de getBusinessSecrets.

## Decisions Made
- La firma de `getValidMpAccessToken`/`createDepositPreference` no cambió: los callers (webhook, create, retry) resuelven el secreto con `getBusinessSecrets` y lo pasan en el objeto MP. Así `lib/payment.ts` solo lee del objeto recibido y escribe a `business_secrets`, sin acoplarse a la fuente del read (con o sin fallback).
- En `payment/retry` se prefirió acotar el join embebido a columnas no secretas (en vez de partirlo en dos queries) para no cambiar la resolución del turno por `cancel_token`; el secreto se trae aparte.
- Comentarios en español documentando que el cambio de select-estrella a columnas explícitas es para que un drop de columna se note (D-03).

## Deviations from Plan

None - plan executed exactly as written. (Los grep de verificación del plan dieron falsos positivos al matchear comentarios en español que mencionaban literalmente `select('*')`/`businesses(*)`; se reformularon esos comentarios para que el grep verbatim quede limpio sin cambiar la lógica. No es una desviación de implementación.)

## Issues Encountered
- **Verify regex `\.from\('businesses'\)\s*$` (Task 2):** la lectura explícita encadena `.from('businesses')` y `.select(...)` en líneas separadas, así que ese clause del grep da falso positivo. La intención real (sin `select('*')`, con getBusinessSecrets) se confirmó con greps acotados. No es un defecto del código.
- **`npx tsc --noEmit` reporta 7 errores en `app/(dashboard)/settings/settings-client.tsx`** (lee mp_access_token/resend_*/recaptcha_secret_key del tipo `Business`, que el plan 01-01 vació). Ese archivo NO está en el scope de este plan (es el repoint de dashboard/settings, de otro plan de la fase) y no fue tocado por 01-01 ni 01-02. Mis 4 archivos compilan limpios. Registrado en `deferred-items.md`.

## User Setup Required
None - no external service configuration required. (El deploy debe ser atómico con la migración 027 y antes del drop de 028 — ver blocker en STATE.md.)

## Next Phase Readiness
- Los 3 lectores/escritores CRÍTICOS de pago están repuntados a business_secrets con fallback. El webhook sobrevive al drop de columnas de 028 sin romperse en silencio.
- Pendiente en la fase: repoint de dashboard/settings (settings-client.tsx) y el drop destructivo + remoción del fallback (plan 01-05).
- Smoke funcional (un pago de seña de prueba confirma el turno) se valida en el checkpoint del plan 01-05.

## Self-Check: PASSED

- lib/payment.ts → FOUND, write a business_secrets confirmado, sin .from('businesses')
- app/api/payment/webhook/[slug]/route.ts → FOUND, getBusinessSecrets x2, sin select('*'), sin business.<secret>
- app/api/payment/create/route.ts → FOUND, getBusinessSecrets, sin select('*')
- app/api/payment/retry/[token]/route.ts → FOUND, getBusinessSecrets, sin businesses(*)
- Commits 3d2e7a2 / d23aa80 / d9c489a → FOUND en git log
- Los 4 archivos del plan compilan limpios bajo tsc --noEmit (errores restantes son out-of-scope, registrados en deferred-items.md)

---
*Phase: 01-rls-lockdown-secret-isolation*
*Completed: 2026-06-15*
