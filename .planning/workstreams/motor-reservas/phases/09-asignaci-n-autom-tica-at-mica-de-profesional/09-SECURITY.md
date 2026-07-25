# Phase 9 — Asignación automática atómica de profesional — Security Verification

**Workstream:** motor-reservas
**Verified:** 2026-07-25
**ASVS Level:** 1
**block_on:** high
**Register origin:** authored at plan time (`register_authored_at_plan_time: true`) — verification confirms each declared mitigation exists in the shipped code; no blind scan for new threats.
**Migration status:** 058 already applied to LOCAL and PROD.

**Result:** SECURED — 6/6 threats closed (5 mitigate + 1 accept).

---

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-09-01 | Tampering / DoS (integridad) | mitigate | CLOSED | `058:82-83` widened advisory lock `hashtextextended(p_business_id::text \|\| p_date::text \|\| p_time::text, 0)` (v_bucket removed); selection `058:88-137` runs AFTER the lock and BEFORE the space block (`058:143+`); INSERT `058:213-222` writes `v_effective_pro` through unchanged índice 011 / EXCLUDE 013 backstop; real race proven in `test/staff-assignment.test.ts:138-160` (ASIGN-03, Promise.all → 2 distinct pros, `occupantsAt===2`). |
| T-09-02 | Tampering (integridad) | mitigate | CLOSED | Signature `058:44-59` byte-identical to `042:126-141` (14 params + `RETURNS TABLE ("id" uuid, "cancel_token" uuid)`); no `DROP FUNCTION` statement (only a comment mention at `058:28`, anchored grep `^\s*DROP\s+FUNCTION` == 0) → pure `CREATE OR REPLACE`; 4 callers do NOT set `autoAssign` → `v_effective_pro = p_professional_id`: `app/api/booking/create/route.ts:151-166`, `app/api/appointments/create/route.ts:82-96`, `lib/abono-generation.ts:196-210` (2 caller paths, one call site). Regression suite 762/763 green (09-02-SUMMARY). |
| T-09-03 | Spoofing / Tampering | mitigate | CLOSED | `lib/booking-core.ts:109-121` — with `autoAssign` the core sets `proId = ANY_PROFESSIONAL` and SKIPS the client `professionalId` resolution entirely; candidate SELECT `058:89-130` derives 100% server-side from `professionals.business_id = p_business_id` + `professional_services` mapping + sede + active. Client only sends the `autoAssign` boolean (D-06). Parity/sede coverage: `test/staff-assignment.test.ts:231-286`. A client-sent magic UUID via the specific path is rejected as `invalid_professional` (`booking-core.ts:112-119`). |
| T-09-04 | Elevation of Privilege | mitigate | CLOSED | Every new subquery inside the SECURITY DEFINER function carries an explicit tenant filter: candidate `p.business_id = p_business_id` (`058:92`), wildcard `NOT EXISTS`/`EXISTS` `ps.business_id = p_business_id` (`058:101`, `058:103`), "libre" `a.business_id = p_business_id` (`058:109`), load-count `a2.business_id = p_business_id` (`058:122`). (D-08). |
| T-09-05 | DoS / Integridad | mitigate | CLOSED | Holds guard `(status='confirmed' OR expires_at IS NULL OR expires_at > now())` present in "libre" (`058:113`) and in load count (`058:126`); no-candidate path → `RAISE EXCEPTION 'slot_taken' USING ERRCODE = 'P0001'` (`058:132-136`, D-10). Graceful degradation proven in `test/staff-assignment.test.ts:166-192` (ASIGN-03b: 1 ok + 1 slot_taken/409, `occupantsAt===2`). |
| T-09-SC | Tampering (supply chain) | accept | CLOSED | See Accepted Risks Log below. Phase 9 code commits (`ca3a7d2`, `dad421b`, `9dac1c7`, `56f8850`) touch only `058_professional_auto_assignment.sql`, `supabase/schema.sql`, `lib/booking-core.ts`, `test/helpers/booking-fixtures.ts`, `test/staff-assignment.test.ts` — `package.json` untouched (last change `0cced7e`, papaparse from Phase 03-01, unrelated). No new dependency surface. |

---

## Supporting checks

- **schema.sql regenerated:** the new RPC body is present in `supabase/schema.sql` (widened lock at `:128`, magic UUID at `:113`, `v_effective_pro` at `:111/135/180/190/258`, parity subqueries at `:142/144`). Single definition of `book_slot_atomic`.
- **Widened lock is strictly coarser (never looser):** removing `v_bucket` from the slot-lock key makes all buckets at the same `(business_id, date, time)` serialize on one lock instead of per-bucket locks. Slot lock is taken first, then per-space locks in ascending order (`058:156-158`) — same ordering as 042, no new deadlock surface. `slot_full` (count vs capacity, `058:184-211`) and `slot_taken` (índice 011 / EXCLUDE 013 / space EXISTS) logic unchanged.
- **Magic UUID never inserted:** the INSERT column is `v_effective_pro` (`058:219`), and the test asserts the stored `professional_id` is neither the magic UUID nor the zero sentinel (`test/staff-assignment.test.ts:127-128`).

---

## Accepted Risks Log

| ID | Threat | Rationale | Accepted |
|----|--------|-----------|----------|
| T-09-SC | Supply-chain tampering via npm/pip/cargo installs | Phase 9 installs no packages: only `supabase db reset` + `vitest` (already present). `package.json` is untouched across all Phase 9 code commits (verified via `git show --stat`). No supply-chain attack surface is introduced by this phase. | 2026-07-25 |

---

## Unregistered Flags

None. Neither `09-01-SUMMARY.md` nor `09-02-SUMMARY.md` contains a `## Threat Flags` section, and no new attack surface appeared during implementation beyond the registered threats. The single deferred item (`D-INFRA-01` — pre-existing abono-test flakiness under parallel vitest) is a test-infrastructure note, not new attack surface; the motor (`book_slot_atomic`) is not regressed (full suite green with `--no-file-parallelism`).

---

## Deployment note (already satisfied)

Migration 058 is applied to LOCAL and PROD (per task instructions). The plan documented the prod apply as a manual, non-scripted deploy step (`user_setup` + `NOTIFY pgrst, 'reload schema'`); no `supabase db push`/`--linked` was added to any script (D-09).
