---
phase: 10-reservar-con-cualquiera-desde-la-p-gina-p-blica
plan: 04
subsystem: tests/verification
tags: [vitest, booking, availability, multi-staff, supabase-local, regression]

# Dependency graph
requires:
  - phase: 10-reservar-con-cualquiera-desde-la-p-gina-p-blica
    plan: 01
    provides: "Vista public_professional_services (059) + rama any=1&serviceId en availability + wiring anyProfessional→autoAssign en create"
  - phase: 10-reservar-con-cualquiera-desde-la-p-gina-p-blica
    plan: 03
    provides: "professionalName en sendConfirmationEmail + join professionals(name) en los dos paths de mail"
  - phase: 09-asignaci-n-autom-tica-at-mica-de-profesional
    provides: "book_slot_atomic con ANY_PROFESSIONAL (058) — la asignación real bajo el lock"
provides:
  - "Migr. 059 replayada en la DB local (public_professional_services viva, definer, anon-SELECT-able)"
  - "test/booking-cualquiera-public.test.ts — cobertura DISP-01/02/03 + ASIGN-05 + wiring anyProfessional→autoAssign contra la DB local"
  - "Verificación de cero regresión de los 4 caminos compartidos (canchas + booking público + staff-assignment + core) y de la suite completa"
affects: [secure-phase, verify-phase (Plan 05)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tests de integración contra la DB local (patrón staff-assignment): seed service-role + invocación del route handler real (availabilityGET/createPOST) + aserciones sobre el estado real de la DB"
    - "Rama any verificada por contrato acotado (busy:[] + full booleano-por-slot), no por concatenación de busy"

key-files:
  created:
    - test/booking-cualquiera-public.test.ts
  modified: []

key-decisions:
  - "Ocupar slots por la vía específica (createAppointmentCore autoAssign:false, professionalId concreto) para armar los escenarios DISP-01/03 de forma determinística"
  - "DISP-02 se verifica por-agenda (professionalId concreto → contrato {ok,busy,full} de esa agenda, sin agregación across-staff), anclado en la forma exacta del contrato"
  - "El wiring (Pitfall 2) se prueba por CONTRASTE: anyProfessional:true → professional_id REAL; sin el flag → professional_id NULL (sentinel)"

patterns-established:
  - "Verificación end-to-end de una feature multi-staff contra la Supabase local con la migración nueva viva (db reset como paso BLOCKING previo)"

requirements-completed: [DISP-01, DISP-02, DISP-03, ASIGN-05]

# Metrics
duration: ~10 min
completed: 2026-07-25
status: complete
---

# Phase 10 Plan 04: Verificación end-to-end de "Cualquiera" (DISP-01/02/03 + ASIGN-05) Summary

**Migr. 059 replayada limpio en la DB local (vista `public_professional_services` viva y anon-SELECT-able, definer probado con datos) + `test/booking-cualquiera-public.test.ts` (5 casos) que cubre la unión de disponibilidad (DISP-01), el ocultado cuando ningún capaz libre (DISP-03), el camino específico por-agenda sin regresión (DISP-02) y el wiring `anyProfessional → autoAssign` (professional_id real vs. sentinel NULL, ASIGN-05) — todo contra la DB local. Cero regresión de los 4 caminos compartidos ni de la suite completa (767/768).**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-07-25
- **Tasks:** 3
- **Files modified:** 1 (1 creado)

## Accomplishments

- **Task 1 [BLOCKING] — migr. 059 aplicada en local:** `npx supabase db reset` replayó 001→059 en el Postgres local (PG17) sin error. La vista `public_professional_services` quedó viva y **anon-SELECT-able**: un `SELECT` como `anon` devuelve HTTP 200 (no error de permiso). **Prueba de definer decisiva (Pitfall 5):** insertando una fila real en `professional_services` (que NO tiene policy anon) via service-role, el `anon` la lee A TRAVÉS de la vista (`security_invoker` habría devuelto `[]`). Molde 044 confirmado.
- **Task 2 — `test/booking-cualquiera-public.test.ts` (5/5 verde):**
  - **DISP-01:** 2 pros comodín, proA ocupado a las 10:00 → la rama `any=1&serviceId` NO oculta las 10:00 (proB libre); `busy:[]` (contrato acotado D-06).
  - **DISP-03:** ambos pros ocupados a las 10:00 → 10:00 va a `full` (ningún capaz libre).
  - **DISP-02:** con `professionalId` específico (sin `any`), la disponibilidad es la de ESA agenda (forma exacta `{ok,busy,full}`, la ocupación de proA no se filtra a la agenda de proB) — cero regresión (D-08).
  - **ASIGN-05 / wiring:** `POST create` con `anyProfessional:true` → turno con `professional_id` REAL (∈ {proA, proB}, nunca NULL/sentinel/UUID mágico) + nombre resoluble por el join `professionals(name)`; create SIN el flag → `professional_id` NULL (sentinel, sin nombre). El contraste prueba que es el boolean el que dispara la asignación (Pitfall 2).
- **Task 3 — cero regresión verificada:**
  - Suites compartidas (`--no-file-parallelism`): `canchas-booking` + `booking-public-regression` + `staff-assignment` + `booking-core` → **18/18 verde**. El camino específico y canchas (que nunca mandan `any`/`anyProfessional`) intactos.
  - Suite completa (`npx vitest run --no-file-parallelism`): **767 passed / 1 skipped (768 total), 60 files**. Sin flakiness de los `abono-*` bajo la señal limpia (trap D-INFRA-01 evitado).

## Task Commits

- **Task 1:** sin commit — aplicación local de la DB (`supabase db reset`), no toca el repo.
- **Task 2:** `d8d1c41` (test) — `test/booking-cualquiera-public.test.ts`.
- **Task 3:** sin commit — corrida de las suites de regresión, no produce artefactos.

## Files Created/Modified

- `test/booking-cualquiera-public.test.ts` (creado) — 5 casos contra la DB local: DISP-01/02/03 + ASIGN-05 (wiring + sentinel). Reusa `seedOneTenant`/`seedTimeBlock`/`seedProfessional` e invoca los route handlers reales (`availabilityGET`, `createPOST`).

## Decisions Made

- **Escenarios DISP-01/03 armados por la vía específica** (`createAppointmentCore` con `professionalId` concreto, `autoAssign:false`): inserta turnos vivos determinísticos en cada agenda, base limpia para asertar la unión.
- **DISP-02 verificado por-agenda:** consultar por `professionalId=proA` (ocupado) vs `proB` (libre) demuestra que el camino específico sigue siendo por-agenda (sin agregación across-staff) y con la forma exacta del contrato — la esencia de D-08.
- **Ventana de reserva neutralizada en los tests de create** (`max_advance_days=null`): la DATE sentinela (`2031-03-03`) está 5 años en el futuro; sin esto el backstop de ventana (migr. 052) devolvería `date_out_of_window`. Mismo ajuste que `canchas-booking.test.ts`.

## Deviations from Plan

None - plan executed exactly as written.

## Apply manual a PROD pendiente (deploy, fuera de scope — D-09 histórico)

La migr. 059 se aplicó SOLO a la DB local (via `db reset`). Para prod es un paso **MANUAL** de deploy:
1. Aplicar `supabase/migrations/059_public_professional_services.sql` a mano en el Postgres de prod.
2. `NOTIFY pgrst, 'reload schema';` (sin esto PostgREST no expone la vista al RSC `anon` → la lista de capaces vuelve vacía → "Cualquiera" nunca se muestra; fail-safe: no rompe el booking de hoy).
3. Regenerar `supabase/schema.sql` (ya actualizado en el repo por el Plan 01).

## Threat surface

Sin superficie nueva. El plan es de verificación: los tests asertan las mitigaciones ya construidas (T-10-10 contrato acotado `busy:[]`/`full`; T-10-11 wiring `anyProfessional`→`autoAssign` sin bucket SENTINEL; T-10-12 cero regresión de canchas + single-pro). No se instalaron paquetes.

## Known Stubs

Ninguno. El test file no introduce stubs; asierta contra el estado real de la DB local.

## Self-Check: PASSED

- Archivo verificado en disco: `test/booking-cualquiera-public.test.ts` (FOUND).
- Commit verificado en git: `d8d1c41` (FOUND).
- Migr. 059 replayada en local: vista `public_professional_services` anon-SELECT-able (HTTP 200 + definer probado con datos reales).
- `npx vitest run test/booking-cualquiera-public.test.ts` → 5/5 verde.
- Regresión: 4 suites compartidas 18/18 + suite completa 767 passed / 1 skipped (768) verde.
- `./node_modules/.bin/tsc --noEmit` → exit 0.

---
*Phase: 10-reservar-con-cualquiera-desde-la-p-gina-p-blica*
*Completed: 2026-07-25*
