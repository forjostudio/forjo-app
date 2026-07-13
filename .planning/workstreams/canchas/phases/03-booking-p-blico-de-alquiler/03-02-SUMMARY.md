---
phase: 03-booking-p-blico-de-alquiler
plan: 02
subsystem: api
tags: [booking, canchas, multi-tenant, anti-tampering, supabase, service-role, next16]

# Dependency graph
requires:
  - phase: 03-01
    provides: "Vista public_canchas (migr. 044) + test/canchas-booking.test.ts en RED documentado (casos 1-4)"
  - phase: motor-reservas (v0.12)
    provides: "createAppointmentCore + book_slot_atomic (anti-tampering + atomicidad cupo + exclusión por espacio); professionals.service_id (migr. 043)"
provides:
  - "Rama canchas en /api/booking/create: deriva el service_id desde professionals.service_id server-side, re-validado por business_id, e ignora cualquier serviceId del body en canchas"
  - "Guard de campos requeridos ampliado a (serviceId || professionalId) sin regresión del path legacy"
affects: [03-03, canchas-booking-client, secure-phase-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Derivación server-side del service desde el professional (canchas) con doble barrera de anti-tampering (derivación re-validada por business_id + re-validación en el core)"
    - "Discriminación canchas-vs-legacy por professionals.service_id no-nulo (no por vertical): robusto a vertical mal seteado, cero query extra a businesses"

key-files:
  created: []
  modified:
    - app/api/booking/create/route.ts

key-decisions:
  - "El caso canchas se distingue por professionals.service_id NO nulo (la fila-cancha), no por vertical ni solo por 'serviceId ausente'"
  - "En canchas el serviceId del body se IGNORA SIEMPRE: gana el service derivado del professional (D-03 / Pitfall 2)"
  - "professionalId ajeno/inventado sin serviceId legacy → invalid_service (400); professional genérico (service_id null) + serviceId → path legacy intacto"

patterns-established:
  - "Anti-tampering canchas: leer professionals.service_id con .eq('business_id', business.id) antes del core; el core lo re-valida (doble barrera)"

requirements-completed: [ALQUILER-01, ALQUILER-04]

# Metrics
duration: 12min
completed: 2026-07-01
status: complete
---

# Phase 03 Plan 02: Rama canchas en /api/booking/create Summary

**El create público, en el caso canchas, deriva el service_id desde `professionals.service_id` server-side (re-validado por `business_id`) e ignora cualquier `serviceId` del body — precio y duración salen del service propio de la cancha, con el path legacy byte-idéntico.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-01T18:54:00Z
- **Completed:** 2026-07-01T18:57:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Rama canchas (D-03) en `app/api/booking/create/route.ts`: cuando llega `professionalId` y ese professional es una cancha (`service_id` no nulo), se DERIVA el service server-side re-validado por `business_id`; el `serviceId` del body se descarta.
- Precio (ALQUILER-04) y duración fija (ALQUILER-01) de la reserva salen del service propio de la cancha, nunca del cliente.
- Guard de `missing_fields` ampliado a `(serviceId || professionalId)` — el path legacy (salud/belleza/general, con `serviceId`) queda byte-idéntico.
- Casos 1-4 de `test/canchas-booking.test.ts` pasan de RED documentado a GREEN; regresión (`booking-public-regression`) y core siguen verdes.
- `lib/booking-core.ts` y `book_slot_atomic` sin tocar: la derivación produce un `serviceId` que el core re-valida por `business_id` (doble barrera) y pasa al RPC intacto.

## Task Commits

Cada task committeado atómicamente:

1. **Task 1: Rama canchas en /api/booking/create — derivar el service del professional (D-03)** — `a6f727d` (feat)

## Files Created/Modified
- `app/api/booking/create/route.ts` — (1) guard de campos requeridos ampliado a `(serviceId || professionalId)`; (2) bloque de derivación del service para canchas antes de `createAppointmentCore`, re-validado por `business_id`, con `serviceId` del body ignorado cuando el professional es una cancha.

## Decisions Made
- **Discriminador canchas-vs-legacy por `professionals.service_id` no-nulo** (dentro de la Claude's Discretion de RESEARCH §Q1). En el modelo del motor v0.12 una cancha ES una fila de `professionals` con `service_id` no nulo (migr. 043); los professionals de salud/belleza/general lo tienen NULL. Por eso, con `professionalId` presente se lee su `service_id`: no-nulo → cancha (deriva + ignora el body); null + serviceId del body → legacy intacto; sin fila para este negocio + sin serviceId → `invalid_service`. Este gating es más robusto que "serviceId ausente" (que dejaba pasar un serviceId forjado, ver Issues) y que gatear por vertical (evita una query extra y funciona aunque el vertical esté mal seteado).
- **En canchas el `serviceId` del body se ignora SIEMPRE** (regla dura D-03 / Pitfall 2): nunca merge cliente-provee-service; un serviceId forjado no puede reservar la cancha cara al precio/duración de otra.

## Deviations from Plan

None - plan executed exactly as written. La forma exacta del discriminador (por `professionals.service_id` no-nulo en vez de solo "serviceId ausente") estaba explícitamente delegada al executor por RESEARCH §Q1 / CONTEXT Claude's Discretion, y respeta al pie la regla dura D-03 y las cuatro `must_haves.truths` del plan. No hubo cambios arquitectónicos ni scope creep.

## Issues Encountered
- **Primera implementación gateaba por "serviceId ausente + professionalId presente"** (`if (!resolvedServiceId && professionalId)`), tal como sugería literalmente el snippet de RESEARCH §Q1. El caso 2 de `canchas-booking.test.ts` (anti-tampering) falló: al mandar el body un `serviceId` FALSO junto al `professionalId` real, la condición `!resolvedServiceId` era falsa y la derivación se saltaba → el serviceId forjado se colaba al core. Diagnóstico: el gating por "ausencia" viola la regla dura D-03 (un `serviceId` del body en canchas debe descartarse, no ganar). **Fix (mismo task, antes del commit):** gatear por `professionals.service_id` no-nulo — si el professional es una cancha, el service SIEMPRE se deriva y el body se ignora; sólo se conserva el serviceId del body cuando el professional es genérico (service_id null) → legacy. Tras el fix, los 11 tests (4 canchas + regresión + core) pasan.
- Ninguna falla por "fetch failed": el Supabase LOCAL estaba arriba (el usuario lo levantó con la 044 aplicada), así que los tests que golpean el route real contra `seedOneTenant` corrieron normalmente.

## Verification

- `npx vitest run test/canchas-booking.test.ts test/booking-public-regression.test.ts test/booking-core.test.ts` → **11 passed (3 files)**. Casos ALQUILER-01/04, serviceId-ignorado (anti-tampering) y cross-tenant en GREEN; regresión legacy y core verdes.
- `npx tsc --noEmit` → limpio (0 errores).
- `npx eslint app/api/booking/create/route.ts` → 0 errores (exit 0). `npm run lint` de todo el repo tiene 590 problems pre-existentes en archivos NO tocados por este plan (`components/dashboard/upcoming-appointments.tsx`, `design_handoff_forjo_rebrand/**`, etc.) — fuera de scope (SCOPE BOUNDARY), no introducidos por este cambio.

## Threat Mitigations (del threat_model del plan)
- **T-03-04 (cross-tenant):** la derivación lee `professionals` con `.eq('business_id', business.id)`; cancha ajena → sin fila → `invalid_service` (400). Core re-valida el professional por business_id (doble barrera). Test cross-tenant GREEN.
- **T-03-05 (serviceId/precio forjado):** el service se deriva del professional; el `serviceId` del body se ignora en canchas; el precio nunca llega del cliente. Test "serviceId ignorado" GREEN.
- **T-03-06 (race por espacio compartido):** la derivación sólo produce un `serviceId`; el core → `book_slot_atomic` sin cambios (no se agregó ningún count/check suelto). Sin tocar la atomicidad.
- **T-03-07 (regresión path legacy):** guard AMPLIADO a `(serviceId || professionalId)`; path con serviceId byte-idéntico. `booking-public-regression.test.ts` verde.

## User Setup Required
None - no external service configuration required. (La vista `public_canchas` / migr. 044 ya fue aplicada por el usuario en local y prod en Wave 1.)

## Next Phase Readiness
- El backend de booking de canchas (derivación segura del service) está listo. El siguiente plan (03-03) puede construir el `canchas-booking-client.tsx` y el gateo en `page.tsx`/`landing-renderer.tsx` (D-02/D-05) confiando en que el POST a `/api/booking/create` con `{ slug, professionalId, date, time, ... }` (sin serviceId) crea el turno con el precio+duración de la cancha.
- Sin blockers.

## Self-Check: PASSED

- `app/api/booking/create/route.ts` — FOUND
- `03-02-SUMMARY.md` — FOUND
- Commit `a6f727d` — FOUND

---
*Phase: 03-booking-p-blico-de-alquiler*
*Completed: 2026-07-01*
