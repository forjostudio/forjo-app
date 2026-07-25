---
phase: 09-asignaci-n-autom-tica-at-mica-de-profesional
plan: 02
subsystem: motor-reservas / verificación ejecutable de la asignación "cualquiera"
tags: [test, concurrency, race, security-verification, multi-staff, book_slot_atomic]
status: complete
requires:
  - "book_slot_atomic (migr. 058, 09-01) — rama 'cualquiera' + lock ampliado ya en la DB local"
  - "lib/booking-core.ts flag autoAssign + ANY_PROFESSIONAL (09-01)"
  - "professional_services (migr. 057) — mapeo staff↔servicios"
  - "test/concurrency.test.ts — molde de carrera real (Promise.all + occupantsAt)"
provides:
  - "test/helpers/booking-fixtures.ts::seedProfessionalService — siembra el mapeo puente (service-role)"
  - "test/staff-assignment.test.ts — 7 tests: ASIGN-02/03/03b/04 + desempate + paridad-comodín + sede"
  - "evidencia ejecutable de atomicidad + anti-tampering para el secure-phase (D-12)"
affects:
  - "ningún archivo de producción — solo tests + fixtures"
tech-stack:
  added: []
  patterns:
    - "carrera real (Promise.all) con aserción sobre el ESTADO de la DB (occupantsAt/assignedProAt), no sobre los retornos del core"
    - "afterEach que deja EXACTAMENTE 1 profesional + resetea el default → la vía 'cualquiera' (todos los activos son candidatos) es reproducible"
    - "leer el pro asignado de appointments.professional_id (el RPC no cambió el RETURNS)"
key-files:
  created:
    - test/staff-assignment.test.ts
    - .planning/workstreams/motor-reservas/phases/09-asignaci-n-autom-tica-at-mica-de-profesional/deferred-items.md
  modified:
    - test/helpers/booking-fixtures.ts
decisions:
  - "seedProfessionalService copia el molde EXACTO de seedAgendaSpace (service-role, sin retorno, throw en error) — puente 057 de 3 columnas NOT NULL"
  - "afterEach borra los profesionales extra y resetea el default (active/location_id/service_id) porque en la vía 'cualquiera' TODOS los activos son candidatos → contaminarían el siguiente test"
  - "carga y libre se leen de la DB con assignedProAt (el RETURNS no expone el pro; Phase 10 lo hará)"
metrics:
  tasks_completed: 3
  files_created: 2
  files_modified: 1
  tests_added: 7
  suite_total: "762 passed | 1 skipped (763) — full suite verde con --no-file-parallelism"
  completed: 2026-07-25
---

# Phase 9 Plan 02: Verificación ejecutable de la asignación "cualquiera" — Summary

Prueba, contra la DB local con la migración 058 aplicada, que la asignación automática de profesional ("cualquiera") funciona y es atómica: agrega el fixture `seedProfessionalService` y una suite nueva de 7 tests (`test/staff-assignment.test.ts`) que verifica ASIGN-02/03/03b/04 + desempate + paridad-comodín + sede leyendo el ESTADO de la DB (no los retornos del core), con carrera real (`Promise.all`) para la atomicidad. La suite completa queda verde (762/763, 1 skip de storage) — cero regresión de los 4 caminos del motor (D-11).

## What Was Built

### Task 1 — Fixture `seedProfessionalService` (commit 9dac1c7)
- `test/helpers/booking-fixtures.ts`: `export async function seedProfessionalService(seeded, { professionalId, serviceId })` con el molde EXACTO de `seedAgendaSpace`: insert por service-role en `professional_services` con `{ business_id, professional_id, service_id }` (las 3 columnas NOT NULL de la migr. 057), sin retorno (PK compuesta), `throw` si `ins.error`. Firmas de los helpers existentes intactas.
- Verificación: `grep -c "export async function seedProfessionalService"` == 1; `npx tsc --noEmit` exit 0.

### Task 2 — Suite `test/staff-assignment.test.ts` (commit 56f8850)
Copia el esqueleto de `concurrency.test.ts` (`describe.skipIf(!hasSupabaseCreds)`, `seedOneTenant({ bufferMinutes: 0, serviceDurationMinutes: 30 })`, `occupantsAt`, `Promise.all`) y agrega:
- `baseInput()` con `professionalId: null` + `autoAssign: true` (el core pasa el UUID mágico al RPC).
- `assignedProAt(id)`: lee `appointments.professional_id` de la fila (el RPC no cambió el RETURNS).
- `afterEach` reforzado: limpia `appointments`, `professional_services`, `agenda_spaces`, `spaces`, `time_blocks`; **borra los profesionales extra** (deja solo `t.professionalId`) y **resetea el default** (`active/location_id/service_id`). Clave porque en la vía "cualquiera" TODOS los activos son candidatos.

Los 7 tests (todos asertan contra el estado de la DB):
1. **ASIGN-02** — 2 pros comodín, cap 1; un `autoAssign` en 09:00 → `professional_id` REAL ∈ {proA, proB} (nunca el mágico ni el sentinel), `occupantsAt === 1`.
2. **ASIGN-03** — 2 pros libres, cap 1; `Promise.all` de dos `autoAssign` en 09:00 → 2 ok, `professional_id` DISTINTOS, `occupantsAt('09:00') === 2` (no 3). Carrera real: el lock ampliado serializa en la DB y la 2ª ve a proA ya ocupado.
3. **ASIGN-03b** — proB pre-ocupado en 09:00; `Promise.all` de dos `autoAssign` → 1 ok (cae en proA, el único libre) + 1 `slot_taken` (409, D-10), `occupantsAt === 2`.
4. **ASIGN-04** — proA con 2 turnos ese día en otras horas, proB con 0; `autoAssign` en 09:00 → cae en proB (menos carga del día completo, D-02).
5. **ASIGN-04 (desempate)** — empate 0-0 → gana `created_at` asc (proA, el del seed = más viejo). Determinístico (D-01).
6. **paridad-comodín** — proA mapeado SOLO a un 2º servicio (`seedProfessionalService`), proB comodín; `autoAssign` del servicio del fixture → cae en proB, proA NUNCA (paridad exacta con `lib/staff-services.ts`).
7. **sede (D-07)** — proA anclado a L1, proB sin sede; reserva en L2 → proA excluido, proB candidato (sin-sede vale para todas).

`npx vitest run test/staff-assignment.test.ts` → **1 archivo, 7 tests, 7 passed** contra la DB local con 058.

### Task 3 — Regresión completa de los 4 caminos (D-11)
- **Suite motor-consumer junta (evidencia D-11 directa):** `concurrency` + `booking-core` + `manual-booking` + `booking-public-regression` + `canchas-booking` + `canchas-provision` + `booking-window-exemption` + `staff-assignment` → **8 archivos, 50 tests, 50 passed.** Los 4 caminos que comparten `book_slot_atomic` (profesional específico/cupos, cancha/espacio, alta manual, core público) pasan SIN editar ningún test → cero regresión. El flag `autoAssign` es aditivo (falsy → `v_effective_pro = p_professional_id` → byte-idéntico).
- **Suite COMPLETA determinística:** `npx vitest run --no-file-parallelism` → **59 archivos, 762 passed | 1 skipped, 0 failed.** El 1 skip es el test de storage (skip limpio sin `RUN_STORAGE_TESTS`, esperado). Ninguna suite existente fue modificada.

## Verification Results

- `grep -c "export async function seedProfessionalService" test/helpers/booking-fixtures.ts` == 1.
- `npx tsc --noEmit` exit 0 (tras Task 1 y Task 2).
- `test/staff-assignment.test.ts` → 7/7 verde contra la DB local con 058.
- Suite motor-consumer junta → 50/50 verde (D-11 directo).
- Suite completa (`--no-file-parallelism`) → **762 passed | 1 skipped (763)**, 0 fallos.
- Atomicidad (ASIGN-03) y degradación graciosa (ASIGN-03b) verificadas por carrera real + estado de la DB — evidencia válida para el secure-phase (D-12).

## Deviations from Plan

Ninguna funcional. Ajuste dentro de lo previsto por el plan (Task 2 pedía "afterEach que además limpia `professional_services`"): se reforzó el `afterEach` para además **borrar los profesionales extra y resetear el default**, porque en la vía "cualquiera" TODOS los profesionales activos del negocio son candidatos y, sin esa limpieza, un pro sembrado en un test contaminaría la selección del siguiente (los tests de asignación no serían reproducibles). Es la traducción fiel del molde de `concurrency.test.ts` a un escenario donde el conjunto de candidatos es dinámico.

## Deferred Issues (out of scope — no causadas por este plan)

**D-INFRA-01 — Tests de abono flaky bajo `npm test` paralelo (pre-existente).** Con la paralelización de archivos por defecto de vitest, 7–11 tests de los archivos de abono (`abono-generation`, `abono-cron`, `abono-create`) fallan de forma NO determinística (el conteo varía entre corridas) por contención/cross-contaminación contra el Postgres local COMPARTIDO (generación rolling-window relativa a `now()`). No es una regresión de 09-02 ni de la 058:
- Reproduce **sin ninguno de los archivos de este plan** en la corrida (los 3 archivos de abono solos → falla).
- `abono-generation.test.ts` **solo** → 11/11 verde.
- Suite completa con `--no-file-parallelism` → **762/763, 0 fallos.**

Detalle y recomendación en `deferred-items.md` del directorio de la fase. No se tocaron los tests de abono ni `vitest.config.mts` (fuera de alcance: este plan solo agrega un fixture + un test file). El motor (`book_slot_atomic`) NO está regresado.

## Notes for secure-phase (D-12)

- ASIGN-03 es la carrera real exigida (`Promise.all` + `occupantsAt` contra la DB), no lectura de código.
- El aislamiento por tenant del conjunto de candidatos está cubierto por los tests de paridad-comodín y sede (los candidatos salen server-side de `business_id` + `professional_services` + sede; el cliente solo manda `autoAssign: true`).
- La degradación graciosa sin candidato libre (D-10 → `slot_taken` 409) está cubierta por ASIGN-03b.

## Self-Check: PASSED

- FOUND: test/staff-assignment.test.ts
- FOUND: test/helpers/booking-fixtures.ts
- FOUND: .planning/workstreams/motor-reservas/phases/09-asignaci-n-autom-tica-at-mica-de-profesional/deferred-items.md
- FOUND commit: 9dac1c7 (Task 1)
- FOUND commit: 56f8850 (Task 2)
