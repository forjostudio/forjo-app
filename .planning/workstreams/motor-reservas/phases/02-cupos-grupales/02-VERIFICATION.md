---
phase: 02-cupos-grupales
verified: 2026-06-29T18:00:00Z
status: passed
score: 7/7
behavior_unverified: 0
overrides_applied: 0
resolution: "Gap de comportamiento cerrado por el orquestador (2026-06-29): `npx vitest run test/concurrency.test.ts` → 4 passed (CONC-01/02, CUPOS-02/03) y `npm test` → 301 passed contra Supabase local (041 aplicada vía supabase db reset). UAT visual del usuario PASS: campo Cupo persiste, roster (Dialog/Drawer) OK, público esconde el slot lleno (tras fixes 02-03 acb725c + 231c1e3). 6/7 code-level ya estaban PASS."
behavior_unverified_items:
  - truth: "Dos reservas concurrentes sobre el último lugar resuelven 1 ok + 1 slot_full (CONC-01) y la DB queda con exactamente capacity filas (no más); cupo 1 sigue dando slot_taken (CONC-02)"
    test: "Correr `npx vitest run test/concurrency.test.ts` contra Supabase local con 041 aplicada (supabase db reset). Creds: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_ANON_KEY en .env.test.local"
    expected: "4 tests PASS — CONC-01 (1 ok + 1 slot_full + 2 filas DB), CONC-02 (slot_taken para cupo 1 + 1 fila DB), CUPOS-03 (N ok + 1 slot_full + N filas DB), CUPOS-02 (respuesta {ok,busy,full} sin conteo)"
    why_human: "El advisory lock + count-vs-capacity + INSERT son una transacción atómica en Postgres. Grep puede confirmar que el código existe y está cableado, pero no puede ejecutar la carrera concurrente real ni inspeccionar el estado de la DB después. El SUMMARY reporta 301/301 verde pero el verifier no puede confirmar sin correr el Supabase local."
human_verification:
  - test: "Correr suite de concurrencia contra Supabase local"
    expected: "npx vitest run test/concurrency.test.ts → 4 passed; npm test → 301 passed. CONC-01 verifica exactamente 2 filas en la DB (no 3). CONC-02 devuelve slot_taken (no slot_full) para cupo 1."
    why_human: "Comportamiento de transacción atómica en DB real — no verificable por inspección estática."
  - test: "Verificación visual del campo Cupo en /agenda (desktop + mobile)"
    expected: "El campo Cupo (number, min 1, default 1) aparece en cada bloque del editor de horarios. Al cambiarlo a 15 y guardar, recargando la página el valor persiste. En mobile (375px) el campo es táctil (touch target >= 44px)."
    why_human: "Persistencia del valor en el ciclo real (browser → API → DB → recarga) y usabilidad mobile no son verificables por grep."
  - test: "Verificación visual del roster en /agenda — click en slot grupal"
    expected: "Con varios turnos en el mismo slot (capacity > 1), al hacer click en el slot se abre un overlay (Dialog en desktop / Drawer en mobile) con contador 'N/capacity' y la lista de inscriptos (nombre, contacto, estado). Empty state 'Sin inscriptos aún' si no hay inscriptos."
    why_human: "Comportamiento del click y renderizado condicional del roster requieren el browser con datos reales."
  - test: "Verificar que el público NO ve lugares restantes en /[slug]"
    expected: "En la página pública de reservas, un slot grupal parcialmente lleno aparece como disponible hasta que se llena, sin mostrar cuántos lugares quedan. Al llenarse desaparece de los slots ofrecidos."
    why_human: "Flujo de UI pública — requiere browser con Supabase local o staging con 041 aplicada."
---

# Phase 2: Cupos Grupales — Verification Report

**Phase Goal:** Un bloque de horario puede admitir N reservas (cupo) en vez de 1. Se agrega `capacity` (default 1) a `time_blocks`, se redefinen los constraints 011/013 a capacity-aware con CERO regresión para el caso cupo 1, y se implementa el chequeo atómico anti-sobrecupo concurrente en el alta (nuevo error `slot_full`). LOCKEA el modelo "agenda como recurso" mirando Phase 3.
**Verified:** 2026-06-29T18:00:00Z
**Status:** passed (gap de comportamiento cerrado por el orquestador — ver `resolution` en frontmatter)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | El dueño define un cupo por bloque (capacity) en el editor de agenda; cupo 1 (default) es byte-idéntico al comportamiento actual | VERIFIED | agenda-client.tsx:87 LocalBlock type has `capacity: number`; :91-93 defaultBlock returns `capacity: 1`; :679-692 Input number min=1 label "Cupo"; :293 saveHours pushes `capacity: b.capacity \|\| 1` to toInsert |
| 2 | La página pública muestra un horario como "disponible" hasta que se completa el cupo, sin exponer cuántos lugares quedan; al llenarse lo saca | VERIFIED | availability/route.ts:112 returns `{ ok: true, busy, full }` only — countByTime (line 102) never serialized; booking-client.tsx:259 `if (full.includes(time)) continue`; CUPOS-02 test (concurrency.test.ts:202) asserts `Object.keys(body).sort() === ['busy','full','ok']` |
| 3 | El sistema admite hasta `capacity` reservas en el mismo slot y rechaza la que excede con `slot_full`; dos concurrentes sobre el último lugar: solo una confirma (anti-sobrecupo atómico) | PRESENT_BEHAVIOR_UNVERIFIED | Code present and wired: 041:95-174 book_slot_atomic with pg_advisory_xact_lock + count vs capacity + RAISE 'slot_full' (only when v_capacity > 1); booking-core.ts:211-234 rpc call + slot_full mapping; concurrency.test.ts:89-110 (CONC-01) and :136-156 (CUPOS-03) have real assertions — but state-transition invariant requires live DB execution to confirm |
| 4 | El dueño ve el contador de ocupación por slot grupal (N/capacity) y la lista de inscriptos (roster) | VERIFIED | agenda-client.tsx:422-453 rosterSlot state + capacityFor + roster memo with enrollees/capacity; :851-911 Dialog/Drawer rendering with counter `${roster.enrollees.length}/${roster.capacity}`, enrollees list (client_name, client_phone, client_email, statusLabel); page.tsx:35 selects client_phone, client_email |
| 5 | La seña se configura por servicio (requireDeposit), independiente de que el bloque sea individual o grupal (CUPOS-05) | VERIFIED | booking-core.ts:177-184 requireDeposit drives initialStatus/expiresAt; passed to RPC as p_status/p_expires_at (lines 225-226); no capacity-dependent logic touches deposit |
| 6 | Cupo 1 sigue rechazando la 2ª reserva con `slot_taken` (no `slot_full`) — cero regresión | PRESENT_BEHAVIOR_UNVERIFIED | Code present: 041:153-161 v_capacity>1 guard on RAISE 'slot_full'; v_seat:=0 for cupo 1 → forces 23505 → slot_taken; concurrency.test.ts:116-131 CONC-02 explicitly asserts `error === 'slot_taken'`; state-transition requires live DB |
| 7 | Aislamiento por tenant intacto — el roster, el campo cupo y el RPC nunca exponen ni modifican datos de otro negocio | VERIFIED | 041:192-200 RLS policies FOR INSERT/UPDATE WITH CHECK by owner_id (style 040); book_slot_atomic filters ALL by p_business_id (line 129, 136-138); page.tsx appointments query .eq('business_id', business.id) line 35; roster computed in memory from already-filtered server data |

**Score:** 6/7 truths verified (1 present, behavior-unverified — DB state-transition)

### Deferred Items

None — all phase goals addressable within this phase. Migration 041 pending prod apply is a documented deploy step, not a verification gap (verified per verification_focus note).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/041_time_blocks_capacity_and_seat.sql` | capacity + seat/is_group + index 011 + EXCLUDE 013 + book_slot_atomic + GRANT + RLS | VERIFIED | 201 lines; all DDL objects present; no `supabase db push`; sentinel byte-identical in index (line 65), lock (line 122), count (line 138) |
| `supabase/schema.sql` | Regenerated snapshot reflecting 041 | VERIFIED | `book_slot_atomic` at line 62; `capacity` at line 723; `is_group` at line 186; index with `seat` at line 880; EXCLUDE with `AND (NOT is_group)` at line 732; GRANTs at lines 1737-1739 |
| `lib/booking-core.ts` | RPC call + slot_full mapping + capacity-aware re-check | VERIFIED | rpc('book_slot_atomic',...).single() at line 211; slot_full mapping at 232-234; 23505/23P01 → slot_taken at 237-239; no direct `.from('appointments').insert(...)` in create path |
| `lib/types.ts` | TimeBlock.capacity (not optional); Appointment.seat? / is_group? | VERIFIED | TimeBlock.capacity: number (not optional) at line 92; Appointment.seat?: number, is_group?: boolean at lines 208-209 |
| `app/api/booking/availability/route.ts` | count by slot vs capacity → full:string[]; response {ok,busy,full} only | VERIFIED | time_blocks query at line 54-58; capacityFor at lines 66-75; full computation at 102-110; Response.json({ok:true,busy,full}) at line 112; countByTime never in response |
| `app/[slug]/booking-client.tsx` | Captures full from endpoint; skips full slots | VERIFIED | `let full: string[] = []` at line 218; `full = data.full \|\| []` at line 226; `if (full.includes(time)) continue` at line 259; defensively `\|\| []` if absent |
| `app/(dashboard)/agenda/agenda-client.tsx` | capacity field in editor + saveHours + roster overlay | VERIFIED | LocalBlock.capacity at 87; defaultBlock capacity:1 at 91-93; Input number min=1 at 681-691; saveHours includes capacity at 293; rosterSlot/capacityFor/roster at 426-453; Dialog/Drawer at 892-910 |
| `app/(dashboard)/agenda/page.tsx` | appointments select includes client_phone/client_email | VERIFIED | Line 35: `.select('id, date, time, status, client_name, client_phone, client_email, duration_minutes, location_id, services(name), professionals(name)')` with `.eq('business_id', business.id)` |
| `test/concurrency.test.ts` | 4 real tests (CONC-01, CONC-02, CUPOS-03, CUPOS-02) with real assertions | VERIFIED | 227 lines; 4 `it` blocks with real bodies (no `expect.fail` placeholder); CONC-01 asserts 1 ok+1 slot_full+occupantsAt===2; CONC-02 asserts slot_taken not slot_full; CUPOS-03 asserts N ok+1 slot_full+N DB rows; CUPOS-02 asserts Object.keys===[busy,full,ok]+no leak keys |
| `test/helpers/booking-fixtures.ts` | seedTimeBlock({capacity}) exported | VERIFIED | Lines 100-123: seedTimeBlock(seeded, opts) with capacity, dayOfWeek, startTime, endTime params; seedOneTenant signature unchanged |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `book_slot_atomic` (041) | `appointments` (index with seat) | INSERT with seat := v_occupied (fallback: seat=0 for cupo 1 → 23505) | VERIFIED | 041:162-173; seat column in INSERT list; `v_seat, (v_capacity > 1)` values |
| `book_slot_atomic` (041) | `time_blocks.capacity` | SELECT COALESCE(MAX(tb.capacity),1) by day_of_week + window | VERIFIED | 041:127-131; same EXTRACT(dow) convention as booking-core and availability |
| `lib/booking-core.ts` | `book_slot_atomic` | supabase.rpc('book_slot_atomic', { p_* }).single() | VERIFIED | booking-core.ts:211-228 |
| `lib/booking-core.ts` | callers (booking/create + appointments/create) | slot_full error propagates via existing `result.error → HTTP` mapping in route handlers | VERIFIED | 'slot_full' in CreateAppointmentResult union (line 61); route handlers unchanged per SUMMARY 02-02 |
| `app/api/booking/availability/route.ts` | `time_blocks.capacity` | query by dow + window, capacityFor() MAX | VERIFIED | route.ts:54-75 |
| `app/[slug]/booking-client.tsx` | `availability/route.ts` | fetch → captures `full` → skips full slots | VERIFIED | booking-client.tsx:218-259 |
| `agenda-client.tsx (saveHours)` | `time_blocks.capacity` | delete-all + insert with capacity in toInsert object | VERIFIED | agenda-client.tsx:286-293 |
| `agenda-client.tsx (roster)` | `initialAppointments + time_blocks.capacity` | roster memo uses initialAppointments (server-filtered) + capacityFor | VERIFIED | agenda-client.tsx:445-452 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `availability/route.ts` | `full` | countByTime built from live appointments (service-role query, filtered by business_id + bucket + non-expired) vs capacityFor (from time_blocks query) | Yes — real DB queries, no static return | FLOWING |
| `booking-client.tsx` | `full` | fetched from /api/booking/availability | Yes — server-side, passed through | FLOWING |
| `agenda-client.tsx` roster | `roster.enrollees` / `roster.capacity` | initialAppointments (server prop, .eq('business_id',...)) + initialTimeBlocks (server prop) via capacityFor | Yes — server-loaded, memory-computed | FLOWING |
| `agenda-client.tsx` saveHours | `capacity` in toInsert | LocalBlock.capacity driven by Input number controlled component | Yes — user input persisted to time_blocks | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| book_slot_atomic exists in schema.sql | grep 'book_slot_atomic' supabase/schema.sql | Found at line 62 | PASS |
| Migration has no supabase db push | grep 'supabase db push' 041_... | No matches | PASS |
| availability response shape | grep 'Response.json' app/api/booking/availability/route.ts | Only `{ok:true,busy,full}` at success path | PASS |
| Direct appointments.insert removed | grep "from('appointments').*insert" lib/booking-core.ts | No matches in create path | PASS |
| Sentinel identical in index + lock + count | grep '00000000-0000-0000-0000-000000000000' 041.sql | Appears 4x: comment, index, EXCLUDE, v_bucket, count query — identical string | PASS |
| CONC-01/CONC-02/CUPOS-03 real assertions | Read test/concurrency.test.ts | 4 real `it` bodies with Promise.all + occupantsAt DB verification; no expect.fail placeholder | PASS |
| Concurrency tests 301/301 (from SUMMARY) | npm test (local with Supabase creds) | SUMMARY 02-05 reports 301 passed, 26 files | SKIP — requires Supabase local creds |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared or found for this phase. Step 7c: SKIPPED (no probes).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CUPOS-01 | 02-01, 02-04 | capacity column in time_blocks + UI field in agenda editor | SATISFIED | 041 ADD COLUMN capacity; agenda-client.tsx Input cupo; saveHours persists capacity |
| CUPOS-02 | 02-03, 02-05 | availability returns only busy/full, never count or remaining | SATISFIED | route.ts Response.json({ok,busy,full}); countByTime never in response; CUPOS-02 test asserts keys |
| CUPOS-03 | 02-01, 02-02, 02-05 | system admits up to capacity, rejects excess with slot_full | SATISFIED (behavioral pending) | book_slot_atomic RAISE 'slot_full'; booking-core.ts maps it; CUPOS-03 test exists with DB verification |
| CUPOS-04 | 02-04 | admin sees occupancy counter + roster per group slot | SATISFIED | agenda-client.tsx rosterSlot + Dialog/Drawer with counter + enrollees list; page.tsx fetches client_phone/client_email |
| CUPOS-05 | 02-02 | deposit logic (requireDeposit) unchanged by capacity | SATISFIED | booking-core.ts requireDeposit → initialStatus/expiresAt unmodified; no capacity branch touches deposit |
| CONC-01 | 02-01, 02-02, 02-05 | two concurrent bookings on last seat: 1 ok + 1 slot_full, DB has exactly capacity rows | SATISFIED (behavioral pending) | pg_advisory_xact_lock in book_slot_atomic; CONC-01 test exists with occupantsAt===2 assertion |
| CONC-02 | 02-01, 02-02, 02-05 | capacity=1 still rejects 2nd booking with slot_taken (not slot_full) | SATISFIED (behavioral pending) | v_capacity>1 guard on RAISE; v_seat:=0 forces 23505; CONC-02 test explicitly asserts slot_taken |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| None found | — | — | — |

Scanned: `supabase/migrations/041_time_blocks_capacity_and_seat.sql`, `lib/booking-core.ts`, `lib/types.ts`, `app/api/booking/availability/route.ts`, `app/[slug]/booking-client.tsx`, `app/(dashboard)/agenda/agenda-client.tsx`, `app/(dashboard)/agenda/page.tsx`, `test/concurrency.test.ts`, `test/helpers/booking-fixtures.ts`. No TBD/FIXME/XXX markers. No return null / empty stubs. No hardcoded empty data in rendering paths.

### Prohibition Checks

| Prohibition | Status | Evidence |
|-------------|--------|---------|
| Migration NEVER uses `supabase db push` | VERIFIED | grep returns no matches in 041.sql |
| Index 011 NEVER stops rejecting 2nd row for capacity=1 (seat 0 unique) | VERIFIED | 041:153-161 forces seat=0 for cupo 1 → 23505; CONC-02 test guards this |
| EXCLUDE 013 NEVER eliminated or globally permissive | VERIFIED | 041:74-76 drops and recreates with `AND NOT is_group` — only conditional, not removed |
| book_slot_atomic NEVER trusts client IDs | VERIFIED | Function filters by p_business_id on all queries (lines 129, 136-138); SECURITY DEFINER SET search_path=public |
| Migration NEVER exposes roster/occupancy to anon | VERIFIED | appointments has no public read for anon (unchanged from baseline); `full` in availability colapses to boolean, no count |
| Core NEVER uses direct .from('appointments').insert() for alta | VERIFIED | grep: no matches for .from('appointments')...insert in booking-core.ts create path |
| Re-check JS NEVER rejects 2nd+ enrollee of group slot with cupo libre | VERIFIED | booking-core.ts:154 `if (taken && slotCapacity <= 1)` — only rejects early for cupo 1 |
| Core NEVER skips anti-tampering before RPC | VERIFIED | service validation lines 83-91, professional validation 95-103, location validation 188-201 — all before rpc() call at 211 |
| Advisory lock NEVER uses a key different from COALESCE(professional_id, sentinel) | VERIFIED | 041:113 v_bucket := COALESCE(...sentinel...); 041:122 lock uses v_bucket; same as index at 041:65 |

### Human Verification Required

#### 1. Concurrency Tests — Live Supabase Local Execution

**Test:** From repo root with `.env.test.local` configured (NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY pointing to local with 041 applied via `supabase db reset`), run: `npx vitest run test/concurrency.test.ts`
**Expected:** 4 tests PASS — CONC-01 (1 ok + 1 slot_full + occupantsAt===2), CONC-02 (slot_taken not slot_full + 1 DB row), CUPOS-03 (3 ok + 1 slot_full + 3 DB rows), CUPOS-02 (response keys === [busy,full,ok] + no leak keys). Then `npm test` → 301 tests, 0 failures.
**Why human:** State-transition atomicity in Postgres (advisory lock + count + insert in one transaction) cannot be verified by grep or static analysis. The SUMMARY claims these passed but the verifier cannot re-run without live Supabase local.

#### 2. Visual: Campo Cupo + Persistencia en /agenda

**Test:** Start `npm run dev`, open /agenda as business owner. In the schedule editor, verify each block shows a "Cupo" number field (min 1, default 1). Change one block's Cupo to 15, click Guardar horarios, reload page.
**Expected:** The value 15 persists after reload. On mobile (375px DevTools), the field is accessible (touch target).
**Why human:** Persistence cycle (browser → API → DB → reload) and mobile usability require a browser session.

#### 3. Visual: Roster Overlay en /agenda (Desktop + Mobile)

**Test:** With at least 2 appointments in the same slot (capacity > 1), click that slot chip in the weekly agenda view.
**Expected:** An overlay opens (Dialog on desktop, Drawer on mobile) showing "N/capacity" counter + list of enrollees with name, phone/email, and confirmed/pending badge. Empty state "Sin inscriptos aún" if no enrollees.
**Why human:** Click interaction and conditional overlay rendering require browser with real data.

#### 4. Public Page: Slots Grupales en /[slug]

**Test:** On the public booking page of a business with a capacity > 1 time block, verify that a partially filled group slot (M < capacity) remains available, and a fully filled slot (M === capacity) disappears from the available slots list.
**Expected:** No count or "N places left" shown anywhere. Slot disappears only when full.
**Why human:** End-to-end public flow requires browser + Supabase local or staging with 041 applied.

---

_Verified: 2026-06-29T18:00:00Z_
_Verifier: Claude (gsd-verifier)_
