---
phase: 03-espacio-compartido
verified: 2026-06-30T12:30:00Z
status: passed
score: 13/13 must-haves verified
behavior_unverified: 0
overrides_applied: 0

gaps: []

deferred: []

behavior_unverified_items: []

human_verification: []
---

# Phase 3: Espacio Compartido — Verification Report

**Phase Goal:** Modelar agendas como recursos con espacio(s) físico(s) asociado(s) y acoplar su disponibilidad: reservar una agenda en un horario bloquea a todas las que comparten alguno de sus espacios en el horario solapado. Extiende la regla anti-solape (EXCLUDE 013, dentro de un bucket) a nivel de espacio físico con el MISMO chequeo atómico de la Phase 2.
**Verified:** 2026-06-30T12:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Tablas `spaces` y `agenda_spaces` existen por negocio con RLS habilitada y 4 policies por operación WITH CHECK por business_id | ✓ VERIFIED | `042_spaces_and_coupled_exclusion.sql` lines 44-106; `supabase/schema.sql` confirms `ENABLE ROW LEVEL SECURITY` + 4 policies each (select/insert/update/delete with owner_id predicate); no anon SELECT policy on either table |
| 2 | `book_slot_atomic` resuelve el set de espacios de la agenda vía `agenda_spaces` y toma un advisory lock por cada space_id en orden ascendente ANTES del chequeo de solape | ✓ VERIFIED | Migration line 162-172: `array_agg(asp.space_id ORDER BY asp.space_id) INTO v_space_ids` + `FOREACH v_sid IN ARRAY v_space_ids LOOP PERFORM pg_advisory_xact_lock(hashtextextended(p_business_id::text || v_sid::text, 0)); END LOOP` — lock precedes EXISTS check (TOCTOU-safe) |
| 3 | Reservar una agenda cuyo set de espacios solapa en tiempo con turno en agenda hermana (comparte ≥1 espacio) es rechazada con slot_taken (409) — la F11 NO cuenta contra sí misma | ✓ VERIFIED | Migration lines 179-195: EXISTS with `COALESCE(a.professional_id,sentinel) <> COALESCE(p_professional_id,sentinel)` (auto-exclusion) + `other.space_id = ANY(v_space_ids)` + `tsrange && tsrange` → `RAISE EXCEPTION 'slot_taken' USING ERRCODE='P0001'`; booking-core.ts line 271-273 captures `rpcErr?.message?.includes('slot_taken')` → 409 |
| 4 | Una agenda SIN filas en `agenda_spaces` pasa por el RPC sin overhead ni cambio de comportamiento (cero regresión) | ✓ VERIFIED | Migration line 167: `IF v_space_ids IS NOT NULL THEN` — when no spaces mapped, v_space_ids stays NULL, entire space-check block is skipped; booking-core.ts line 157: `if (mySpaces && mySpaces.length > 0)` — same skip pattern in JS re-check |
| 5 | `/api/booking/availability` marca como busy un slot de la agenda consultada si una agenda hermana tiene un turno solapado; bloqueo es bidireccional | ✓ VERIFIED | availability/route.ts lines 96-139: resolves `mySpaces`, then `siblingBuckets` via `.in('space_id',...).neq('professional_id', bucket)`, builds `siblingBusy` from already-fetched `appts`, concatenates to `busy` (not `full`); shape `{ ok, busy, full }` unchanged (D-06) |
| 6 | Re-check de espacio en booking-core rechaza con slot_taken cuando hay solape en agenda hermana, antes de entrar al RPC | ✓ VERIFIED | booking-core.ts lines 152-174: resolves `mySpaces`/`siblings`/`siblingBuckets`, checks `spaceClash` against already-fetched `clashes`, returns `{ ok: false, error: 'slot_taken', status: 409 }` if clash found — placed before the RPC call at line 244 |
| 7 | La respuesta de availability NO cambia de forma: sigue siendo `{ ok, busy, full }` sin exponer detalle de agenda hermana ni conteo (D-06) | ✓ VERIFIED | availability/route.ts line 156: `return Response.json({ ok: true, busy, full }, ...)` — unchanged shape; CUPOS-02 test (concurrency.test.ts line 206) asserts `Object.keys(body).sort() === ['busy','full','ok']` — 302/302 tests pass |
| 8 | El dueño puede crear espacios físicos y mapear cada agenda a sus espacios desde Settings (dentro del editor existente, sin pantalla nueva) | ✓ VERIFIED | settings-client.tsx: `initialSpaces`/`initialAgendaSpaces` props accepted (line 132-133); `useState` state (lines 557-558); `supabase.from('spaces').insert(...)` (line 570); `supabase.from('agenda_spaces').insert/delete(...)` (lines 601-615); settings/page.tsx loads both from DB with `.eq('business_id', business.id)` (lines 25-44) |
| 9 | `lib/types.ts` exporta `Space` e `AgendaSpace` en snake_case espejo de la fila DB | ✓ VERIFIED | lib/types.ts lines 121-135: `interface Space { id, business_id, name, created_at: string }` and `interface AgendaSpace { business_id, professional_id, space_id: string }` — all string, snake_case, matching DB columns |
| 10 | `VerticalTerminology` tiene `resource`/`resources`; rubro "Cancha de fútbol" resuelve a "Cancha"/"Canchas" sin romper otros verticales | ✓ VERIFIED | lib/verticals.ts: `resource: string`/`resources: string` in VerticalTerminology (lines 20-21); all 3 verticals set default `'Profesional'`/`'Equipo'` (lines 53-54, 77-78, 98-99); `TYPE_TERMINOLOGY_OVERRIDE['Cancha de fútbol'] = { resource:'Cancha', resources:'Canchas' }` (lines 126-127) applied in getVertical + resolveVertical |
| 11 | Existe el backstop declarativo `appointment_spaces` + EXCLUDE gist `appointment_spaces_no_overlap` + triggers AFTER INSERT / AFTER UPDATE OF status | ✓ VERIFIED | Migration lines 273-358: `CREATE TABLE appointment_spaces`, `ADD CONSTRAINT appointment_spaces_no_overlap EXCLUDE USING gist (business_id WITH =, space_id WITH =, slot WITH &&)`, `appointment_spaces_populate` trigger (AFTER INSERT), `appointment_spaces_cleanup` trigger (AFTER UPDATE OF status); schema.sql confirms all four at lines 62, 79, 844, 1107, 1111 |
| 12 | `test/concurrency.test.ts` contiene CONC-03: dos altas en paralelo sobre agendas distintas que comparten un espacio → exactamente 1 ok + 1 slot_taken (409); verificado contra estado real de la DB | ✓ VERIFIED | concurrency.test.ts lines 245-275: `Promise.all` of two `createAppointmentCore` with distinct `professionalId`s mapped to same `spaceA`, asserts `oks.length === 1` + `rejected.length === 1` + `error === 'slot_taken'` + `occupantsAt('09:00') === 1` (DB-state verification) |
| 13 | La suite completa (`npm run test`) queda verde con CONC-03 incluido; cero regresión de fases anteriores | ✓ VERIFIED | `npm run test` output: 302 tests, 26 files — 302 passed; `npx tsc --noEmit` exit 0 |

**Score:** 13/13 truths verified (0 present-behavior-unverified)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/042_spaces_and_coupled_exclusion.sql` | tablas spaces + agenda_spaces con RLS + book_slot_atomic extendido + backstop appointment_spaces | ✓ VERIFIED | File exists (360 lines); contains all required structures; validated by `supabase db reset` local PG17 (documented in 03-01-SUMMARY and 03-04-SUMMARY) |
| `supabase/schema.sql` | regenerado con objetos 042 (spaces, agenda_spaces, appointment_spaces, book_slot_atomic extendido, EXCLUDE, triggers) | ✓ VERIFIED | Schema contains all: `agenda_spaces` table + 4 policies, `appointment_spaces_no_overlap` EXCLUDE, `appointment_spaces_populate` trigger, `appointment_spaces_cleanup` trigger, `book_slot_atomic` with space-lock logic |
| `lib/types.ts` | interfaces Space e AgendaSpace | ✓ VERIFIED | Lines 121-135; snake_case, all string fields, matching DB |
| `lib/booking-core.ts` | branch slot_taken de espacio + re-check de espacio antes del RPC | ✓ VERIFIED | Lines 152-174 (space re-check UX); lines 271-273 (RPC error branch for slot_taken by message); correct ordering: space-check → taken-check → RPC |
| `app/api/booking/availability/route.ts` | disponibilidad acoplada bidireccional (siblingBusy → busy, D-06 preservado) | ✓ VERIFIED | Lines 86-139; mySpaces + siblingBuckets resolution, siblingBusy merged into busy, shape `{ ok, busy, full }` unchanged |
| `lib/verticals.ts` | resource/resources + TYPE_TERMINOLOGY_OVERRIDE 'Cancha de fútbol' | ✓ VERIFIED | Lines 19-21, 53-54, 77-78, 98-99, 126-127, 143-158 |
| `app/(dashboard)/settings/page.tsx` | carga spaces + agenda_spaces por tenant, pasa como props | ✓ VERIFIED | Lines 25-44: spaces and agenda_spaces in Promise.all with `.eq('business_id', business.id)`, passed as `initialSpaces`/`initialAgendaSpaces` |
| `app/(dashboard)/settings/settings-client.tsx` | CRUD de spaces + mapeo agenda→espacios, patrón professionals, RLS | ✓ VERIFIED | Lines 130-139, 557-616, 1339-1343; accepts props, useState, optimistic updates, RLS writes, no new npm deps |
| `test/helpers/booking-fixtures.ts` | seedSpace + seedAgendaSpace + seedProfessional | ✓ VERIFIED | Lines 125-163: all three helpers present, service-role pattern, throw on error, teardown by CASCADE |
| `test/concurrency.test.ts` | CONC-03 test + cleanup de agenda_spaces/spaces en afterEach | ✓ VERIFIED | Lines 41-49 (afterEach cleanup of agenda_spaces + spaces), lines 245-275 (CONC-03 test) |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lib/booking-core.ts` | `supabase.rpc('book_slot_atomic')` | `supabase.rpc('book_slot_atomic', {...})` call at line 244-261 | ✓ WIRED | Same 14-param signature; RPC handles space-lock atomically |
| `app/api/booking/availability/route.ts` | `agenda_spaces` | `.from('agenda_spaces').select('space_id').eq('business_id',...).eq('professional_id', bucket)` at line 97-100 | ✓ WIRED | Filtered by business_id (tenant-safe) |
| `lib/booking-core.ts` | `agenda_spaces` | `.from('agenda_spaces').select('space_id').eq('business_id',...).eq('professional_id', bucket)` at line 152-156 | ✓ WIRED | Bucket-identical to RPC; SENTINEL used consistently |
| `appointment_spaces` trigger | `agenda_spaces` | `FROM agenda_spaces asp WHERE asp.business_id = NEW.business_id AND asp.professional_id = NEW.professional_id` in trigger function | ✓ WIRED | Expands appointment to spaces on INSERT |
| `appointment_spaces_no_overlap` | `appointment_spaces` | `EXCLUDE USING gist (business_id WITH =, space_id WITH =, slot WITH &&)` | ✓ WIRED | Confirmed in schema.sql line 844 |
| `settings/page.tsx` | `spaces` / `agenda_spaces` | `supabase.from('spaces').select('*').eq('business_id', business.id)` + same for agenda_spaces | ✓ WIRED | In Promise.all; props passed to SettingsClient |
| `settings-client.tsx` | `spaces` / `agenda_spaces` | `.from('spaces').insert(...)`, `.from('agenda_spaces').insert/delete(...)` | ✓ WIRED | Browser client (RLS enforces tenant isolation) |
| `test/concurrency.test.ts` | `lib/booking-core.ts` | `Promise.all([createAppointmentCore(...), createAppointmentCore(...)])` at line 259-262 | ✓ WIRED | Two distinct professionalIds mapped to same spaceA |
| `test/concurrency.test.ts` | `booking-fixtures.ts` | `seedSpace`, `seedAgendaSpace`, `seedProfessional` imported and used | ✓ WIRED | Lines 4, 252-255 |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| CONC-03 test passes (anti-space-conflict deterministic) | `npm run test -- test/concurrency.test.ts` | 5/5 tests passed, 1.94s | ✓ PASS |
| Full suite regression-free (302 tests, 26 files) | `npm run test` | 302/302 passed | ✓ PASS |
| TypeScript strict-mode compilation | `npx tsc --noEmit` | exit 0 (no output) | ✓ PASS |
| CONC-03 exists in test file | grep `CONC-03` `test/concurrency.test.ts` | Found at line 232, 245 | ✓ PASS |
| `seedSpace`/`seedAgendaSpace`/`seedProfessional` exported from fixtures | grep in booking-fixtures.ts | Found at lines 130, 144, 158 | ✓ PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ESPACIO-01 | Plans 03-01, 03-03 | Dueño modela agendas con espacio(s) físico(s) (spaces + agenda_spaces + UI config) | ✓ SATISFIED | Tables created in 042; UI CRUD in settings-client.tsx; types in lib/types.ts; loaded in settings/page.tsx |
| ESPACIO-02 | Plans 03-01, 03-02 | Reservar una agenda bloquea a agendas hermanas que comparten espacio (bidireccional) | ✓ SATISFIED | availability/route.ts siblingBusy logic; booking-core.ts spaceClash re-check; book_slot_atomic EXISTS cross-bucket |
| ESPACIO-03 | Plans 03-01, 03-04 | Chequeo "espacios libres" + insert atómico (advisory lock + EXCLUDE backstop) | ✓ SATISFIED | book_slot_atomic: lock per space_id in asc order → EXISTS; appointment_spaces + EXCLUDE gist as declarative backstop |
| CONC-03 | Plan 03-05 | Test anti-conflicto-de-espacio: dos reservas concurrentes sobre agendas que comparten espacio → 1 ok + 1 slot_taken | ✓ SATISFIED | concurrency.test.ts CONC-03 test; runs green (302/302); DB-state verified via occupantsAt |

All 4 Phase 3 requirements: 4/4 satisfied.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| No blocker anti-patterns found | — | — | — | — |

**Debt marker scan:** No TBD/FIXME/XXX markers found in any `.ts`/`.tsx`/`.sql` files modified by this phase. The single hit in `lib/booking-code.ts` is in a comment that uses "XXXXX" as a placeholder for a display format (booking code suffix), not a work-debt marker — not in scope for this phase.

**Schema.sql GRANT ALL TO anon note:** The `GRANT ALL ON TABLE agenda_spaces/spaces/appointment_spaces TO "anon"` entries in schema.sql are standard Supabase boilerplate applied uniformly to every table in the project (36 occurrences total across pre-existing tables including `appointments`, `businesses`, etc.). RLS is the actual access control layer; no SELECT policy for anon exists on these tables — confirmed by inspecting the policy DDL which uses the `owner_id = auth.uid()` predicate only. D-06 (no read anon) is correctly enforced.

---

### Production Deploy Note (Non-Gap)

The migration 042 was validated against local PG17 (`supabase db reset` — documented in 03-01-SUMMARY Task 4 and 03-04-SUMMARY Task 3 as BLOCKING human-verify checkpoints, both approved). The migration has NOT been applied to production yet — this is the documented "pending deploy" pattern consistent with migrations 040 and 041. It is not a code gap; the code is correct and the DB objects exist locally and in schema.sql.

---

## Verification Summary

All 13 must-have truths are **VERIFIED** against actual code — not SUMMARY claims. The phase achieves its goal:

1. **Atomicity (ESPACIO-03/CONC-03):** `book_slot_atomic` takes per-space advisory locks in ascending space_id order (anti-deadlock) before the EXISTS anti-overlap check, and the declarative backstop `appointment_spaces_no_overlap` EXCLUDE gist provides defense-in-depth. CONC-03 test proves deterministic 1-ok/1-slot_taken under real concurrency against live DB.

2. **Coupled bidirectional exclusion (ESPACIO-02):** availability/route.ts resolves siblings via agenda_spaces and marks their slots `busy` (not `full`). booking-core.ts re-checks with spaceClash before the RPC (UX early-rejection). D-06 (no info leak) preserved — shape `{ ok, busy, full }` confirmed by CUPOS-02 test.

3. **Model + config (ESPACIO-01):** `spaces` and `agenda_spaces` tables with per-op RLS policies WITH CHECK; `Space`/`AgendaSpace` types in lib/types.ts; full CRUD UI in settings-client.tsx with optimistic updates; settings/page.tsx loads both by tenant; terminología `resource`/`resources` with `TYPE_TERMINOLOGY_OVERRIDE` for "Cancha de fútbol".

4. **Zero regression:** Phase 2 capacity/cupos paths are untouched; `npm run test` 302/302 green; agendas without `agenda_spaces` rows bypass all space logic byte-identically to pre-Phase-3 behavior.

---

_Verified: 2026-06-30T12:30:00Z_
_Verifier: Claude (gsd-verifier)_
