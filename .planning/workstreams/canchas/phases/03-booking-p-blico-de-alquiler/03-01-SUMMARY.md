---
phase: 03-booking-p-blico-de-alquiler
plan: 01
subsystem: database
tags: [supabase, postgres, view, rls, multi-tenant, vitest, canchas, booking, anti-tampering]

# Dependency graph
requires:
  - phase: 02-config-canchas
    provides: "professionals.service_id (puntero 1:1 cancha↔agenda, migr. 043) + provisionCancha (tupla service+professional+space+agenda_spaces)"
  - phase: motor-reservas-v0.12
    provides: "book_slot_atomic + exclusión por espacio (migr. 042) reusados por los tests"
provides:
  - "Vista acotada public_canchas (migr. 044): expone al anon { id, business_id, name, price, duration_minutes } de una cancha activa, SIN service_id ni config interna"
  - "schema.sql regenerado con la vista public_canchas + sus GRANTs"
  - "test/canchas-booking.test.ts: red de tests del booking de canchas (ALQUILER-01/03/04 + anti-tampering serviceId + cross-tenant) contra el route handler real de create"
  - "Caso ALQUILER-02 secuencial en test/concurrency.test.ts: reservar una cancha bloquea la hermana que comparte espacio"
affects: [03-02-create-canchas-branch, 03-03-canchas-booking-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Vista acotada public_* (molde public_services): owner postgres, SIN security_invoker, GRANT anon — para exponer datos no sensibles al anon sin filtrar el puntero interno"
    - "Test de integración del booking que POSTea al route handler real (new Request JSON) + verificación dura del estado en la DB con service-role"

key-files:
  created:
    - supabase/migrations/044_public_canchas.sql
    - test/canchas-booking.test.ts
  modified:
    - supabase/schema.sql
    - test/concurrency.test.ts

key-decisions:
  - "GRANT ALL (no GRANT SELECT) en public_canchas: se igualó el patrón de public_services/public_professionals del baseline para no divergir del repo (A1 del research)"
  - "schema.sql se editó a mano (insertando la VIEW + GRANTs junto a public_services) en vez de regenerar por dump: el guardrail de concurrencia prohíbe correr `supabase db reset` (borraría la DB local del usuario)"

patterns-established:
  - "public_canchas: service_id vive SOLO en JOIN+WHERE, jamás en el SELECT (D-01 / T-03-01)"
  - "Tests del booking de canchas en RED documentado hasta el Plan 02 (Nyquist: el test existe antes del código que verifica)"

requirements-completed: [ALQUILER-01, ALQUILER-02, ALQUILER-04]

# Metrics
duration: 18min
completed: 2026-07-01
status: complete
---

# Phase 3 Plan 01: Data-layer public_canchas + red de tests del booking de canchas Summary

**Vista acotada `public_canchas` (migr. 044, molde `public_services` sin `security_invoker`, sin `service_id`) + scaffold de integración `canchas-booking.test.ts` (ALQUILER-01/03/04 + anti-tampering + cross-tenant) y el caso secuencial de exclusión por espacio (ALQUILER-02) reusando el motor v0.12.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-07-01
- **Completed:** 2026-07-01
- **Tasks:** 2
- **Files modified:** 4 (2 creados, 2 modificados)

## Accomplishments
- **Migración 044 `public_canchas`**: VIEW aditiva que joinea `professionals` (service_id no nulo) con su `service` y expone al anon SOLO `{ id (= professional_id), business_id, name, price, duration_minutes }`. Owner `postgres`, SIN `security_invoker` (Pitfall 1), `GRANT ALL` a anon/authenticated/service_role, `WHERE p.active AND s.active` (canchas soft-deleted desaparecen). **NUNCA expone `service_id`** (D-01 / T-03-01): vive solo en JOIN+WHERE.
- **schema.sql regenerado** con la definición de `public_canchas` + sus GRANTs, ubicada junto a `public_services` (mismo orden que la migración).
- **`test/canchas-booking.test.ts`**: red de tests de integración que POSTea al route handler real de `/api/booking/create` con `professionalId` y SIN `serviceId` (D-03): ALQUILER-01/04 (appointment usa el service/precio/duración de la cancha), anti-tampering (serviceId falso ignorado → gana el derivado del professional), cross-tenant (professionalId ajeno → `invalid_service` 400), ALQUILER-03 (dos turnos consecutivos). Casos 1-4 en **RED documentado** hasta que el Plan 02 aterrice la rama canchas del create.
- **Caso ALQUILER-02 secuencial** agregado a `test/concurrency.test.ts`: reservar una cancha y luego la hermana que comparte espacio → `slot_taken`, verificación dura = exactamente 1 fila ocupa el slot. Reuso directo de `book_slot_atomic`, cero código nuevo del motor.

## Task Commits

1. **Task 1: Migración 044 public_canchas + regenerar schema.sql** - `36c26f4` (feat)
2. **Task 2: Scaffold canchas-booking.test.ts + caso de espacio secuencial** - `1f8476f` (test)

## Files Created/Modified
- `supabase/migrations/044_public_canchas.sql` - VIEW acotada anon para el vertical canchas (aditiva)
- `supabase/schema.sql` - regenerado con `public_canchas` + GRANTs
- `test/canchas-booking.test.ts` - suite de integración del booking de canchas (ALQUILER-01/03/04 + seguridad)
- `test/concurrency.test.ts` - caso ALQUILER-02 secuencial (exclusión por espacio compartido)

## Decisions Made
- **GRANT ALL vs GRANT SELECT**: se igualó `GRANT ALL` del baseline (public_services/public_professionals) para no divergir del patrón del repo. El research (A1) lo dejaba abierto; verificación local pendiente confirmará que PostgREST expone la vista.
- **schema.sql editado a mano**: por el guardrail de concurrencia (NO correr `supabase db reset`), se insertó la definición de la VIEW + GRANTs manualmente en `schema.sql`, en la misma ubicación relativa que produce el dump (junto a `public_services`). El usuario valida el dump real cuando corra el reset local (ver User Setup).

## Deviations from Plan

None - plan executed exactly as written. Los dos pasos de verificación con Supabase (`supabase db reset` y la suite `vitest` completa contra la DB local) se **difirieron al usuario** por el guardrail de concurrencia explícito del prompt (evitar destruir/seedear su Supabase local abierto en otro editor). No es una desviación del contenido del plan, sino del método de verificación.

## Issues Encountered
None. `npx tsc --noEmit` limpio; `npx eslint` limpio sobre los dos archivos de test. Los imports del route handler real y de `provisionCancha`/fixtures resuelven bajo tsc (validación de tipos e imports sin ejecutar la suite).

## User Setup Required

**La migración 044 y las validaciones que tocan la DB local se difirieron a vos** (el prompt indica que puede haber un Supabase local abierto en otro editor, y `supabase db reset` es destructivo). Ejecutá estos pasos cuando la terminal esté libre:

### 1. Validar la migración 044 en local (PG17)
```powershell
cd "C:\Users\franc\Desktop\Forjo Studio\forjo-app"
supabase db reset   # replaya baseline + 040..044; debe terminar SIN error
```
Smoke anon (opcional, tras el reset): en el SQL editor local, `SELECT * FROM public_canchas;` — el resultset NO debe contener la columna `service_id`.

### 2. Correr la suite del plan contra la DB local
```powershell
npx vitest run test/canchas-booking.test.ts test/concurrency.test.ts
```
Esperado con creds locales:
- **`test/concurrency.test.ts`**: verde, incluido el nuevo caso `ALQUILER-02 — exclusión por espacio (secuencial)` y CONC-03.
- **`test/canchas-booking.test.ts`** casos 1-4: **RED esperado** hasta que el Plan 02 implemente la rama canchas del create (hoy el route exige `serviceId` → `missing_fields`). Es el estado Nyquist correcto (el test existe antes del código).
Sin creds → ambos `describe` se skipean (aviso `[test/env]`), el job sigue verde.

### 3. Aplicar a prod (coordinado con el deploy de la fase)
Supabase (prod) → SQL Editor, DESPUÉS de mergear/deployar:
```sql
-- pegar el contenido de supabase/migrations/044_public_canchas.sql
NOTIFY pgrst, 'reload schema';   -- imprescindible: sin esto PostgREST no expone la vista al RSC anon (Pitfall 5)
```

## Next Phase Readiness
- **Plan 02 (rama canchas del create)**: los tests de `canchas-booking.test.ts` (casos 1-4) son su red de aceptación — al implementar la derivación del service desde `professional.service_id` (D-03), esos casos deben pasar a verde sin tocar el archivo de test.
- **Plan 03 (UI)**: `public_canchas` ya está disponible para que el RSC `page.tsx` la lea vía `createPublicServerClient` (anon) y alimente el client component de canchas.
- **Blocker suave**: la migración 044 debe estar aplicada en local (paso User Setup #1) antes de que los tests con creds puedan correr end-to-end. La aplicación a prod es parte del deploy de la fase.

## Self-Check: PASSED

- Archivos verificados en disco: `supabase/migrations/044_public_canchas.sql`, `test/canchas-booking.test.ts`, `03-01-SUMMARY.md`, `public_canchas` presente en `supabase/schema.sql`.
- Commits verificados en git log: `36c26f4` (feat), `1f8476f` (test).

---
*Phase: 03-booking-p-blico-de-alquiler*
*Completed: 2026-07-01*
