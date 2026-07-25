---
phase: 10-reservar-con-cualquiera-desde-la-p-gina-p-blica
plan: 01
subsystem: api
tags: [supabase, postgres, view, booking, availability, multi-tenant, next]

# Dependency graph
requires:
  - phase: 08-equipo-qu-servicios-hace-cada-profesional
    provides: "tabla puente professional_services (057) + lib/staff-services (regla del comodín)"
  - phase: 09-asignaci-n-autom-tica-at-mica-de-profesional
    provides: "book_slot_atomic con ANY_PROFESSIONAL (058) + flag autoAssign en booking-core"
provides:
  - "Vista acotada public_professional_services (migr. 059) que expone capaz-de a anon (D-07)"
  - "Rama de agregación across-staff en /api/booking/availability (any=1&serviceId) — unión de disponibilidad en full con busy:[] (DISP-01/03)"
  - "Wiring del boolean anyProfessional → autoAssign en /api/booking/create (ASIGN-01/D-05)"
affects: [booking-client, page.tsx, mail-confirmacion, secure-phase]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Rama gateada por query param que retorna antes del camino existente para garantizar cero regresión byte-idéntica"
    - "Unión de disponibilidad across-staff computada server-side y colapsada a booleano-por-slot en full (nunca per-pro/counts)"

key-files:
  created:
    - supabase/migrations/059_public_professional_services.sql
  modified:
    - supabase/schema.sql
    - app/api/booking/availability/route.ts
    - app/api/booking/create/route.ts

key-decisions:
  - "Vista 059 definer (owner postgres, sin security_invoker) — molde exacto de 044; con invoker el anon leería 0 filas"
  - "La agregación se devuelve en full (no concatenando busy) porque concatenar busy daría la intersección, lo opuesto a la unión DISP-01"
  - "Rama any NO filtra por sede (public_professionals no expone location, el front no la manda); backstopeada por el RPC 058 que sí filtra (RESEARCH A3)"
  - "Freeness con buffer + capacity-aware + espacio compartido por-pro, espejando el re-check del core y el criterio de candidatos del RPC 058"

patterns-established:
  - "Vista pública acotada anon: SELECT de columnas no sensibles, owner postgres, GRANT ALL a los 3 roles, edición quirúrgica de schema.sql"
  - "Agregación across-staff acotada (D-06): busy:[] + full con la unión, sin exponer per-pro/counts/agenda interna"

requirements-completed: [ASIGN-01, DISP-01, DISP-02, DISP-03]

# Metrics
duration: ~20 min
completed: 2026-07-25
status: complete
---

# Phase 10 Plan 01: Superficie de servidor de "Cualquiera" Summary

**Vista acotada `public_professional_services` (059) + rama de agregación `any=1` en availability (unión de disponibilidad en `full`, `busy:[]`) + wiring `anyProfessional → autoAssign` en create — el motor de Phase 9 queda expuesto sin tocarlo.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-25T21:17:00Z (aprox)
- **Completed:** 2026-07-25T21:37:18Z
- **Tasks:** 3
- **Files modified:** 4 (1 creado, 3 modificados)

## Accomplishments
- Migración 059: vista definer `public_professional_services` (3 columnas no sensibles) que sirve el mapeo capaz-de a `anon` sin abrir la tabla puente (D-07); `schema.sql` actualizado quirúrgicamente junto a `public_canchas`.
- Rama `any=1&serviceId` en `availability/route.ts`: computa la UNIÓN de disponibilidad de los profesionales capaces (libre si al menos uno lo tiene libre) y la devuelve en `full` con `busy:[]` (DISP-01/03, contrato acotado D-06). El camino sin `any` retorna después → respuesta byte-idéntica (DISP-02/D-08).
- `create/route.ts` lee `body.anyProfessional === true` (boolean estricto) y pasa `autoAssign` al core; el RPC 058 asigna el profesional bajo el advisory lock. Ningún `professionalId` del body se usa como asignación (D-05).

## Task Commits

Cada task se commiteó atómicamente (commits normales, hooks corridos):

1. **Task 1: Migración 059 — vista acotada public_professional_services** - `ccfd7e6` (feat)
2. **Task 2: Rama de agregación across-staff en availability (any=1)** - `ae3e14c` (feat)
3. **Task 3: Wiring anyProfessional → autoAssign en create** - `f7ace7f` (feat)

## Files Created/Modified
- `supabase/migrations/059_public_professional_services.sql` (creado) - Vista acotada anon del mapeo staff↔servicios (molde 044, definer, sin security_invoker, GRANT a los 3 roles).
- `supabase/schema.sql` (modificado) - Bloque de la vista `public_professional_services` + sus GRANT, insertados junto a `public_canchas` sin reordenar el resto.
- `app/api/booking/availability/route.ts` (modificado) - Rama `any=1&serviceId` con la agregación across-staff; imports de `professionalsForService` y tipos; `buffer_minutes` sumado al select del negocio (respuesta del camino específico sin cambios).
- `app/api/booking/create/route.ts` (modificado) - Boolean `anyProfessional` + `autoAssign` pasado al `createAppointmentCore`; guards y path canchas intactos.

## Decisions Made
- **Vista 059 definer, sin `security_invoker=true`** (molde 044): con invoker heredaría la RLS de `professional_services` (sin policy anon) → 0 filas para anon → "Cualquiera" nunca se mostraría.
- **Unión devuelta en `full`, no concatenando `busy`:** el client aplica `busy` como solape (bloquea si alguna entrada solapa) → concatenar daría la intersección; la unión se computa server-side a nivel start-time y colapsa a booleano-por-slot en `full`.
- **Rama `any` sin filtro por sede** (public_professionals no expone location; el front no la manda): divergencia aceptada y documentada, backstopeada por el RPC 058 que sí filtra por sede (RESEARCH A3).
- **Freeness de la rama `any` con buffer + capacity-aware + espacio compartido por-pro:** espeja el re-check del core (`booking-core.ts:165-169`) y el criterio de candidatos del RPC 058; es más conservador que el RPC (que no aplica buffer con autoAssign), lo que sólo oculta slots, nunca ofrece uno no reservable.
- **Anti-tampering en la rama `any` aunque sea read:** `serviceId` re-validado por `business_id` (invalid_service/400 si es ajeno); profesionales capaces resueltos por `business_id`.

## Deviations from Plan

None - plan executed exactly as written.

Nota: la migración 059 extendió el `select` del negocio en availability con `buffer_minutes` (necesario para la freeness con buffer de la rama `any`). No es una desviación: es parte de la rama nueva y la respuesta del camino específico no cambia (traer una columna extra no toca `busy`/`full`), consistente con DISP-02/D-08.

## Issues Encountered
None. `tsc --noEmit` limpio; `test/booking-public-regression.test.ts` 2/2 verde (no skipeado — corrió contra Supabase real), `test/booking-core.test.ts` 5/5 verde.

## User Setup Required
None en este plan. La aplicación de la migración 059 a prod (a mano + `NOTIFY pgrst, 'reload schema';`) y la validación de replay por `supabase db reset` están diferidas al Plan 04 (BLOCKING), según el plan.

## Next Phase Readiness
- El backend de "Cualquiera" está expuesto: la vista sirve los capaces, `availability?any=1` da la unión, `create` dispara `autoAssign`.
- Pendiente en planes siguientes de la fase: superficie de frontend (`page.tsx` lee la vista y la pasa a `BookingClient`; tarjeta "Cualquiera" + gating ≥2; señal `anyProfessional`) y el nombre del profesional en el mail de confirmación (los dos paths: `notify/booking` y `payment/webhook`).
- Validación de replay de la migración 059 (`supabase db reset`) diferida al Plan 04 (BLOCKING).

## Self-Check: PASSED

- Archivos verificados en disco: `059_public_professional_services.sql`, `10-01-SUMMARY.md` (FOUND).
- Commits verificados en git: `ccfd7e6`, `ae3e14c`, `f7ace7f` (FOUND).
- `schema.sql` contiene el bloque `public_professional_services` (vista + OWNER + 3 GRANT).

---
*Phase: 10-reservar-con-cualquiera-desde-la-p-gina-p-blica*
*Completed: 2026-07-25*
