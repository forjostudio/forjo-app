---
phase: 09-asignaci-n-autom-tica-at-mica-de-profesional
verified: 2026-07-25T00:00:00Z
status: passed
score: 7/7 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 9: Asignación automática atómica de profesional — Verification Report

**Phase Goal:** Una reserva que NO elige profesional queda asignada a uno LIBRE y CAPAZ dentro del RPC atómico `book_slot_atomic` (misma transacción que serializa anti-sobrecupo y exclusión por espacio compartido — nunca leer-libres→insertar); entre candidatos gana el de menos turnos ese día; CERO regresión en los 4 caminos del motor (profesional específico, cancha, ocurrencia de abono, cupo grupal). Punto de máximo riesgo del milestone.

**Verified:** 2026-07-25
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `book_slot_atomic` conserva firma de 14 params + `RETURNS TABLE (id, cancel_token)` byte-idéntica, `CREATE OR REPLACE` puro, sin `DROP FUNCTION` | ✓ VERIFIED | `supabase/migrations/058_professional_auto_assignment.sql:44-59` signature matches `042:126-142` verbatim (14 params, same types, same RETURNS clause). `grep -c "DROP FUNCTION"` = 0. |
| 2 | Con el UUID mágico `ANY_PROFESSIONAL` el RPC selecciona, bajo el advisory lock, un profesional capaz (paridad-comodín)+sede+activo+libre, e inserta el `professional_id` real elegido, nunca el mágico | ✓ VERIFIED | Migration lines 85-137: `IF v_is_any THEN SELECT p.id INTO v_effective_pro ... business_id/active/service_id IS NULL/location/NOT EXISTS-OR-EXISTS(professional_services)/NOT EXISTS(solape)`. Line 219: `INSERT ... v_effective_pro ... -- (058) el pro REAL, nunca el mágico`. Live test ASIGN-02 asserts `assigned !== ANY_PROFESSIONAL && assigned !== SENTINEL_NONE`. |
| 3 | Sin candidato capaz libre, el RPC hace `RAISE 'slot_taken'` (D-10) | ✓ VERIFIED | Migration lines 132-136: `IF v_effective_pro IS NULL THEN RAISE EXCEPTION 'slot_taken' ...`. Live test ASIGN-03b: `Promise.all` of two autoAssign with only 1 free pro → 1 ok + 1 `slot_taken` (409), `occupantsAt === 2`. Independently re-run: 7/7 pass. |
| 4 | Advisory lock del slot ampliado a hash(business_id+date+time), sin `v_bucket` — no degrada slot_full/slot_taken | ✓ VERIFIED | Migration lines 82-83: `pg_advisory_xact_lock(hashtextextended(p_business_id::text || p_date::text || p_time::text, 0))` — no `v_bucket` in the hash expression. Regression suites (concurrency: CONC-01/02/03, CUPOS) pass unchanged — independently re-run 24/24 green across concurrency+booking-core+booking-public-regression+manual-booking+canchas-booking. |
| 5 | Toda subquery nueva filtra por `business_id = p_business_id` explícito (D-08, SECURITY DEFINER) | ✓ VERIFIED | Candidate SELECT (line 92), professional_services subqueries (lines 100-104), overlap NOT EXISTS (line 109), load ORDER BY subquery (line 122) — all filter `business_id = p_business_id` explicitly. |
| 6 | `lib/booking-core.ts` expone `autoAssign?: boolean` + constante `ANY_PROFESSIONAL`; los 4 callers actuales se comportan byte-idéntico | ✓ VERIFIED | `lib/booking-core.ts:21` (`ANY_PROFESSIONAL = '...0001'`), `:57` (`autoAssign?: boolean`), `:134` (`if (!autoAssign) { ... }` gates JS re-checks). Independently confirmed via grep: no production caller (`app/api/appointments/create/route.ts`, `app/api/booking/create/route.ts`, `lib/abono-generation.ts`) sets `autoAssign` — all 4 real callers keep the flag falsy → unchanged path. |
| 7 | `supabase db reset` replaya 001→058 limpio; suites existentes de concurrencia + core pasan sin cambios (cero regresión) | ✓ VERIFIED | 058 is the latest file in `supabase/migrations/` (after 057). SUMMARY reports clean local reset + smoke green. Independently re-run: `test/concurrency.test.ts` + `test/booking-core.test.ts` + `test/booking-public-regression.test.ts` + `test/manual-booking.test.ts` + `test/canchas-booking.test.ts` → 5 files, 24/24 passed. `test/abono-generation.test.ts` isolated → 11/11 passed. `test/staff-assignment.test.ts` → 7/7 passed. `npx tsc --noEmit` → exit 0. |

**Score:** 7/7 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/058_professional_auto_assignment.sql` | `book_slot_atomic` modificado: lock ampliado + selección "cualquiera" + UUID mágico | ✓ VERIFIED | Exists, substantive (231 lines, full RPC body), contains all required elements (grep checks pass: signature==1, DROP FUNCTION==0, magic UUID>=1). |
| `supabase/schema.sql` | Snapshot regenerado del RPC (058) | ✓ VERIFIED | Single `book_slot_atomic` definition (line 104), body byte-matches migration 058's new lock+selection logic. Surgical replacement confirmed — no full-file reorder artifacts observed around the RPC block. |
| `lib/booking-core.ts` | Flag `autoAssign` + constante `ANY_PROFESSIONAL`; re-checks JS envueltos en `if (!autoAssign)` | ✓ VERIFIED | Constant at line 21, type field at line 57, gating `if (!autoAssign)` at line 134, RPC call (lines 273-290) retains all 14 `p_*` keys unchanged — only value of `p_professional_id` varies. |
| `test/helpers/booking-fixtures.ts` | Fixture `seedProfessionalService` | ✓ VERIFIED | Function present at line 172, mirrors `seedAgendaSpace` mold exactly (service-role insert, no return, throws on error). |
| `test/staff-assignment.test.ts` | Tests de asignación + carrera real (ASIGN-02/03/03b/04 + paridad-comodín + sede) | ✓ VERIFIED | 7 `it(...)` blocks covering ASIGN-02, ASIGN-03 (race via `Promise.all`), ASIGN-03b, ASIGN-04, ASIGN-04 tie-break, wildcard-parity, sede. Independently re-run: 7/7 pass. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `lib/booking-core.ts` | `supabase/migrations/058...sql` | `rpc('book_slot_atomic')` con `p_professional_id = ANY_PROFESSIONAL` cuando `autoAssign` | ✓ WIRED | `lib/booking-core.ts:109-111` sets `proId = ANY_PROFESSIONAL` when `autoAssign`; passed as `p_professional_id` in the `.rpc('book_slot_atomic', {...})` call (line 276). Migration reads `p_professional_id` to detect the magic UUID (`v_is_any`, line 66). |
| `supabase/migrations/058...sql` | `lib/staff-services.ts` | Query de candidatos con paridad-comodín exacta (NOT EXISTS / EXISTS sobre professional_services) | ✓ WIRED | SQL (lines 99-105) mirrors `professionalsForService` (staff-services.ts:43-53) 1:1: 0 rows in bridge → wildcard capable; ≥1 row → capable only if mapped. Live test "paridad-comodín" confirms this behavior against the DB. |

### Behavioral Spot-Checks / Independent Re-runs

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| staff-assignment suite (7 tests: ASIGN-02/03/03b/04+tie-break/wildcard/sede) | `npx vitest run test/staff-assignment.test.ts` | 1 file, 7/7 passed | ✓ PASS |
| 5 motor-consumer suites (zero-regression check) | `npx vitest run test/concurrency.test.ts test/booking-core.test.ts test/booking-public-regression.test.ts test/manual-booking.test.ts test/canchas-booking.test.ts` | 5 files, 24/24 passed | ✓ PASS |
| abono-generation isolated | `npx vitest run test/abono-generation.test.ts` | 1 file, 11/11 passed | ✓ PASS |
| type-check | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| no production caller sets autoAssign | `grep -rln "createAppointmentCore(" app/ lib/` + inspection | `app/api/appointments/create/route.ts`, `app/api/booking/create/route.ts`, `lib/abono-generation.ts` — none pass `autoAssign` | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|--------------|-------------|-------------|--------|----------|
| ASIGN-02 | 09-01, 09-02 | Con "cualquiera", el sistema asigna automáticamente un profesional libre que sepa hacer el servicio | ✓ SATISFIED | Migration candidate SELECT (capable + free) + live test `ASIGN-02` (2 wildcard pros, one gets assigned, real id, occupantsAt=1). |
| ASIGN-03 | 09-01, 09-02 | La asignación automática es atómica: dos reservas concurrentes de "cualquiera" nunca reciben el mismo profesional ni sobre-reservan | ✓ SATISFIED | Advisory lock widened to (business_id+date+time), selection runs under the lock. Live `Promise.all` race test `ASIGN-03` → 2 distinct professional_ids, `occupantsAt === 2`; `ASIGN-03b` → 1 ok + 1 `slot_taken`, `occupantsAt === 2`. Both independently re-run, both pass. |
| ASIGN-04 | 09-01, 09-02 | La asignación elige el profesional con menos turnos ese día | ✓ SATISFIED | `ORDER BY (load count) ASC, created_at ASC, id ASC` in migration; live test `ASIGN-04` (2 turnos vs 0 → less-loaded wins) + tie-break test (0-0 → created_at asc). |

No orphaned requirement IDs for this phase — REQUIREMENTS.md maps exactly ASIGN-02/03/04 to Phase 9, and both plans declare exactly these three IDs.

### Anti-Patterns Found

None. Scanned `supabase/migrations/058_professional_auto_assignment.sql`, `lib/booking-core.ts`, `test/staff-assignment.test.ts`, `test/helpers/booking-fixtures.ts` for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` — the only "TODO" hits are the Spanish word "todo" (= "all") inside comments ("borra TODO lo creado", "capaz de TODO"), not debt markers. No stub patterns, no empty implementations, no hardcoded empty data flowing to production code.

### Deferred Items (documented, not gaps)

`deferred-items.md` in the phase directory documents **D-INFRA-01**: pre-existing abono-suite flakiness under full parallel `npm test` (cross-contamination against the shared local Postgres, unrelated to this phase's RPC change). Independently confirmed: `test/abono-generation.test.ts` alone → 11/11 green. This is infra pollution, not a Phase 9 regression, and does not affect this phase's goal achievement.

### Human Verification Required

None. All must-haves are backed by direct code inspection (migration SQL, booking-core.ts) plus independently re-executed test evidence (not just SUMMARY claims) against the local DB with migration 058 applied.

### Gaps Summary

No gaps. All 7 must-have truths verified against the actual codebase (not SUMMARY narrative): the migration signature is byte-identical, the lock is genuinely widened, the candidate-selection SQL mirrors the wildcard rule with explicit business_id filtering, `slot_taken` fires correctly with no free candidate, `lib/booking-core.ts` gates the new path behind `autoAssign` with zero production caller opting in yet, and both the new 7-test suite and the pre-existing motor-consumer suites pass when independently re-run. ASIGN-02/03/04 are all satisfied with executable evidence, not just static presence.

**Note (D-12, not a gap):** This phase touches the anti-double-booking core (`book_slot_atomic`) and is explicitly flagged security-sensitive. Per phase instructions, secure-phase is a **mandatory separate follow-up gate** — its absence here is expected and does not block this verification's `passed` status.

---

_Verified: 2026-07-25_
_Verifier: Claude (gsd-verifier)_
