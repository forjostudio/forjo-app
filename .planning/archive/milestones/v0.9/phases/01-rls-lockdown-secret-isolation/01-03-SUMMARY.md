---
phase: 01-rls-lockdown-secret-isolation
plan: 03
subsystem: booking-notifications
tags: [rls, supabase, secrets, recaptcha, email, resend, booking, business_secrets]

# Dependency graph
requires:
  - phase: 01-rls-lockdown-secret-isolation (plan 01-01)
    provides: getBusinessSecrets() helper, BusinessSecrets type, business_secrets table (migration 027)
provides:
  - "verifyRecaptcha resuelve el secret por tenant desde business_secrets (slug→business_id→getBusinessSecrets), fail-open/fail-closed intactos"
  - "booking/create lee resend_*/google_refresh_token desde business_secrets (no del select de businesses)"
  - "cancel/[token] y cron/cancel-expired leen secretos vía fetch separado a business_secrets (Pitfall E), sin arrastrarlos por el nested join"
  - "notify/booking y notify/cancel leen secretos Resend desde business_secrets (businesses(*) acotado a columnas no secretas)"
affects: [01-05 (drop destructivo de columnas-secreto en businesses + remoción del fallback)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Resolver business_id por slug (columna no secreta) y leer el secret por tenant vía getBusinessSecrets"
    - "Nested join businesses(...) acotado a columnas no secretas + fetch separado de business_secrets (Pitfall E)"
    - "Map business_id→BusinessSecrets para resolver secretos una vez por negocio en loops (cron)"

key-files:
  created: []
  modified:
    - lib/recaptcha.ts
    - app/api/booking/create/route.ts
    - app/api/cancel/[token]/route.ts
    - app/api/cron/cancel-expired/route.ts
    - app/api/notify/booking/route.ts
    - app/api/notify/cancel/route.ts

key-decisions:
  - "verifyRecaptcha resuelve business_id por slug con un select de id (no secreto) y luego lee recaptcha_secret_key vía getBusinessSecrets; el override por tenant pisa al global solo si hay secret; fail-open con rastro y fail-closed preservados exactamente"
  - "cancel/[token] y cron/cancel-expired no pueden unir business_secrets al nested join (Pitfall E): los joins quedan con columnas no secretas + un fetch separado de getBusinessSecrets"
  - "cron/cancel-expired resuelve los secretos una sola vez por business_id distinto (Map) para no llamar getBusinessSecrets por turno en un job que itera muchos"
  - "notify/* cambian businesses(*) por columnas no secretas explícitas y resuelven los secretos Resend con getBusinessSecrets(appt.business_id); el flujo de auth/ownership de notify/cancel y los flags email_sent/email_error no se tocan"
  - "El fallback transitorio a businesses NO se removió (lo provee getBusinessSecrets; su remoción es del plan 01-05 post-028)"

patterns-established:
  - "Lookup por slug → id (columna no secreta) cuando el caller no tiene el business_id a mano (recaptcha)"
  - "Cacheo en Map de secretos por tenant en loops para evitar N fetches redundantes (cron)"

requirements-completed: [SEC-01]

# Metrics
duration: ~18min
completed: 2026-06-15
status: complete
---

# Phase 01 Plan 03: Repoint de lectores de secretos email/reCAPTCHA/calendar en booking y cancelación a business_secrets

**Los 6 archivos de booking/cancelación (recaptcha, booking/create, cancel/[token], cron/cancel-expired, notify/booking, notify/cancel) leen ahora los secretos de email (Resend), reCAPTCHA y calendar desde business_secrets vía getBusinessSecrets — los dos nested-join (cancel/[token], cron) con un fetch separado (Pitfall E) — sin arrastrar credenciales por joins ni selects, de modo que ningún flujo se rompa en silencio tras el drop de columnas de la migración 028.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-06-15
- **Completed:** 2026-06-15
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- `lib/recaptcha.ts`: el lookup por slug ahora trae solo `id` (no secreto) y el `recaptcha_secret_key` por tenant sale de `getBusinessSecrets(business.id)`. El override por tenant pisa al global solo si hay secret; el fail-open con warning (negocio sin secret) y el fail-closed (secret presente) quedan exactamente igual (T-01-10 accept: comportamiento preservado).
- `app/api/booking/create/route.ts`: el `select` de businesses pierde `resend_api_key, resend_from, google_refresh_token` (deja columnas no secretas); `const secrets = await getBusinessSecrets(business.id)` alimenta los 3 call sites (email hold vencido, evento gcal, email seña pendiente). La lógica de reCAPTCHA-gate y de seña no cambia.
- `app/api/cancel/[token]/route.ts`: el nested join `businesses(...)` deja de traer los 3 secretos (mantiene `id, name, slug, primary_color, logo_url, notification_email`); tras resolver el turno, `getBusinessSecrets(business.id)` alimenta `deleteCalendarEvent`, `sendClientCancelEmail` y el `sendAdminNotification` del aviso al dueño (Pitfall E / T-01-08).
- `app/api/cron/cancel-expired/route.ts`: el nested join pierde `resend_api_key, resend_from` (mantiene `id` para keyear); un `Map<business_id, BusinessSecrets>` resuelve los secretos una sola vez por negocio distinto en el loop. Best-effort y conteo `emailed` intactos (T-01-09).
- `app/api/notify/booking/route.ts` y `app/api/notify/cancel/route.ts`: `businesses(*)` → columnas no secretas explícitas; secretos Resend vía `getBusinessSecrets(appt.business_id)`. En notify/cancel el flujo de auth+ownership (session client, validación `business_id`) y la cancelación idempotente (service role) no se tocan; los flags `email_sent`/`email_error`/`reason` se preservan.
- Fallback transitorio (027→028) preservado en los 6: lo provee `getBusinessSecrets`; su remoción queda para el plan 01-05.

## Task Commits

Cada tarea se commiteó atómicamente:

1. **Task 1: lib/recaptcha.ts + booking/create — secretos por tenant desde business_secrets** - `ec9f893` (fix)
2. **Task 2: cancel/[token] y cron/cancel-expired — fetch separado (Pitfall E)** - `74ed6af` (fix)
3. **Task 3: notify/booking y notify/cancel — secretos Resend desde business_secrets** - `4dba346` (fix)

_Nota: las tareas estaban marcadas `tdd="true"`, pero el proyecto no tiene framework de tests (devDeps sin vitest/jest) y `tdd_mode: false` en config; el orquestador no pasó TDD_MODE (mismo caso que 01-02). La verificación se hizo con los grep automatizados de cada `<verify>` del plan + `npx tsc --noEmit` filtrado a los 6 archivos (la propia sección `<verification>` del plan es grep + tsc, no tests)._

## Files Created/Modified
- `lib/recaptcha.ts` - lookup por slug acotado a `id`; `recaptcha_secret_key` vía getBusinessSecrets; fail-open/fail-closed intactos.
- `app/api/booking/create/route.ts` - select de businesses sin los 3 secretos; `getBusinessSecrets(business.id)` alimenta email/gcal.
- `app/api/cancel/[token]/route.ts` - nested join sin secretos; fetch separado de getBusinessSecrets para email cliente / aviso dueño / borrado gcal.
- `app/api/cron/cancel-expired/route.ts` - nested join sin secretos; Map de secretos por business_id distinto; pasa Resend a sendExpiredHoldEmail.
- `app/api/notify/booking/route.ts` - businesses(*) acotado; Resend vía getBusinessSecrets(appt.business_id); flags email_sent/email_error preservados.
- `app/api/notify/cancel/route.ts` - businesses(*) acotado; Resend vía getBusinessSecrets(appt.business_id); auth/ownership y body con email_sent/reason intactos.

## Decisions Made
- En `recaptcha.ts` se resolvió el `business_id` con un select de `id` por slug (columna no secreta) en vez de mover la fuente del lookup, porque el caller (booking/create) pasa el slug, no el id. El secret se obtiene aparte vía getBusinessSecrets, que ya tiene el fallback transitorio.
- En los dos nested-join (cancel/[token], cron) se mantuvo el join acotado a columnas no secretas (incluyendo `id`) en lugar de partirlo en dos queries, para no cambiar la resolución del turno por `cancel_token`/filtro; los secretos van por el fetch separado (Pitfall E, mismo criterio que payment/retry en 01-02).
- En `cron/cancel-expired` se agregó un `Map<business_id, BusinessSecrets>` con un helper `secretsFor()` para resolver los secretos una vez por negocio distinto: el cron itera muchos turnos y N fetches redundantes serían innecesarios.
- En `notify/*` se usó `appt.business_id` (presente por el `select('*')`) para el fetch de secretos, evitando depender de un `business.id` del join.

## Deviations from Plan

None - plan executed exactly as written. (Los tres `<verify>` del plan pasaron con su redacción literal; no hizo falta reformular comentarios como en 01-02.)

## Issues Encountered
- **`npx tsc --noEmit` reporta 7 errores en `app/(dashboard)/settings/settings-client.tsx`** (lee mp_access_token/resend_*/recaptcha_secret_key del tipo `Business`, que el plan 01-01 vació). Ese archivo NO está en el scope de este plan (es el repoint de dashboard/settings, de otro plan de la fase) y ya estaba registrado en `deferred-items.md` por 01-02. Mis 6 archivos compilan limpios bajo tsc. Sin cambios nuevos en deferred-items.

## User Setup Required
None - no external service configuration required. (El deploy debe ser atómico con la migración 027 y antes del drop de 028 — ver blocker en STATE.md, heredado de 01-02.)

## Next Phase Readiness
- Toda la superficie de lectura de secretos de email/reCAPTCHA/calendar en booking y cancelación está repuntada a business_secrets con fallback; ningún join arrastra credenciales.
- Pendiente en la fase: repoint de dashboard/settings (settings-client.tsx, fuera de scope de este plan) y el drop destructivo de columnas (028) + remoción del fallback transitorio (plan 01-05).
- Verificación funcional (un alta de turno + una cancelación que disparen email) se valida en el checkpoint del plan 01-05.

## Known Stubs
None - todos los lectores quedan cableados a getBusinessSecrets con su fuente real (business_secrets + fallback transitorio). No se introdujeron valores placeholder ni datos mock.

## Self-Check: PASSED

- lib/recaptcha.ts → FOUND, getBusinessSecrets presente, lookup por slug acotado a id, sin select('recaptcha_secret_key')
- app/api/booking/create/route.ts → FOUND, getBusinessSecrets, sin los 3 secretos en el select de businesses
- app/api/cancel/[token]/route.ts → FOUND, getBusinessSecrets, nested join sin secretos
- app/api/cron/cancel-expired/route.ts → FOUND, getBusinessSecrets + Map, nested join sin secretos
- app/api/notify/booking/route.ts → FOUND, getBusinessSecrets, sin businesses(*)
- app/api/notify/cancel/route.ts → FOUND, getBusinessSecrets, sin businesses(*), auth/ownership intacto
- Commits ec9f893 / 74ed6af / 4dba346 → FOUND en git log
- Los 6 archivos del plan compilan limpios bajo tsc --noEmit (los 7 errores restantes son out-of-scope en settings-client.tsx, ya registrados en deferred-items.md)

---
*Phase: 01-rls-lockdown-secret-isolation*
*Completed: 2026-06-15*
