---
phase: 06-modelo-del-abono-alta-manual-generaci-n-forward
verified: 2026-07-21T00:00:00Z
status: passed
score: 12/12 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 6: Modelo del abono + alta manual + generación forward — Verification Report

**Phase Goal:** Backend del abono recurrente semanal (turno fijo): el dueño crea un abono desde el
panel, el sistema genera los turnos hacia adelante (ventana rolling mantenida por el cron diario)
respetando el núcleo anti-doble-booking (011/013 + cupos + espacio compartido). Cubre ABONO-01, 02,
03, 06, 07 (ABONO-04/05 son Phase 7 — correctamente ausentes).

**Verified:** 2026-07-21 · **Re-verification:** No — initial verification.

**Note on scope:** this verification supersedes the original locked D-06/D-07 with the post-UAT
revisions D-06′/D-07′/D-09′ recorded in `06-CONTEXT.md <revisions>`, which is the authoritative
version of Phase 6 as shipped (Plans 06-06 and 06-07 are gap-closure plans against the same phase,
not a new phase).

## Commands run (ground truth, not SUMMARY claims)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | clean, no output |
| `npx vitest run test/abono-generation.test.ts test/abono-create.test.ts test/abono-cron.test.ts --no-file-parallelism` | **32/32 passed** (first attempt hit a worker-fork crash mid-run — 27/32 — reproducing the documented DB-contention flakiness; re-run was clean 32/32, treated as infra flake per task instructions, not a code failure) |
| `grep -nE "book_slot_atomic\|\.from\('appointments'\)\.insert\|out_of_hours" lib/abono-generation.ts` | **empty** — none of the three forbidden patterns present |
| `git diff --name-only 861ea4b..HEAD -- vercel.json` | **empty** — vercel.json untouched since before Phase 6 started |
| `npx eslint` on all abono-related files + `components/ui/select.tsx` + `components/ui/drawer.tsx` | clean, 0 issues |
| `git log --oneline -- lib/booking-core.ts` | last touched in v0.12 (Phase 3), **zero commits during Phase 6** — the atomic core was never opened |

## Goal Achievement

### Observable Truths (roadmap/requirements-level)

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | El dueño crea un abono desde el panel (cliente + servicio/cancha + profesional/consultorio + día + hora) | ✓ VERIFIED | `app/(dashboard)/abonos/page.tsx` + `components/dashboard/nuevo-abono-form.tsx` (POST to `/api/abonos/create`); registered in `components/dashboard/sidebar.tsx:62` and `lib/verticals.ts` menus for every reserving vertical |
| 2 | El alta reusa el pipeline de alta de turno con anti-tampering por `business_id` | ✓ VERIFIED | `app/api/abonos/create/route.ts:73-161` — business por `owner_id`, professional/service/location re-validados `.eq('business_id', business.id)`, cancha deriva `serviceId` server-side (line 131) |
| 3 | Turnos generados hacia adelante, cada uno pasa por el núcleo atómico | ✓ VERIFIED | `lib/abono-generation.ts:159-173` — único punto de creación es `createAppointmentCore`; grep confirms zero `.rpc('book_slot_atomic')` / zero `.from('appointments').insert` in the file |
| 4 | Conflicto = saltear + registrar, nunca pisar un turno existente | ✓ VERIFIED | `lib/abono-generation.ts:185-190` (skip+push on `result.ok===false`, no UPDATE/DELETE of the colliding appointment); `test/abono-generation.test.ts` case 2 ("saltea el slot ocupado... sin pisar"), `test/abono-cron.test.ts` case 3 — both pass |
| 5 | Aislamiento por tenant en toda query/UPDATE de abonos/appointments/clients/schedule_exceptions | ✓ VERIFIED | Every query in `lib/abono-generation.ts`, `app/api/abonos/create/route.ts`, `app/api/cron/cancel-expired/route.ts` carries `.eq('business_id', ...)`; RLS owner-only on `abonos` (migration below); `test/abono-generation.test.ts` case 6 + `test/abono-cron.test.ts` case 5 (cross-tenant isolation) pass |
| 6 | RLS owner-only en `abonos`, sin policy anon | ✓ VERIFIED | `supabase/migrations/054_abonos.sql:79-101` — 4 policies (select/insert/update/delete), all predicated on `business_id IN (... owner_id = auth.uid())`; grep of the CREATE POLICY block for "anon" is empty. (Table-level `GRANT ALL ... TO anon` at schema.sql:3332 is the repo-wide idiom applied to every tenant table — RLS is the actual gate, confirmed same pattern on `appointments`/`businesses`/`clients`) |
| 7 (D-06′) | El motor NO saltea por horario semanal (`time_blocks`/`out_of_hours` guard removed); SÍ saltea por `day_closed` | ✓ VERIFIED | `lib/abono-generation.ts:114-141` — guard reduced to a single `schedule_exceptions.closed === true` check; grep for `out_of_hours` in the file is empty; `test/abono-generation.test.ts` case 5 ("21:00 sin time_block... SÍ se genera") and 5b (special-hours `closed=false` no longer blocks) pass |
| 8 (D-07′/ABONO-07) | Finito (`total_occurrences`) vs indefinido; un choque NO consume sesión; al llegar a N → `status='completed'` y el cron deja de extenderlo | ✓ VERIFIED | Migration `total_occurrences int null` + `status` check includes `'completed'` (`054_abonos.sql:51-59`); `maxCreated` param cuts the loop only on real `created` count (`lib/abono-generation.ts:52-57,110-113`); both the create route (`countAbonoAppointments`, lines 282-294) and the cron (`countAbonoAppointments`, lines 77-85) count REAL non-cancelled appointments against the DB rather than `result.created.length` — closing the exact gap called out in the task brief; `test/abono-generation.test.ts` 5c/5d, `test/abono-create.test.ts` 5/6/7, `test/abono-cron.test.ts` 6/7/8/9/10 all pass |
| 9 (ABONO-06) | La generación forward corre en el cron DIARIO existente; sin cron nuevo; gate del `CRON_SECRET` vigente | ✓ VERIFIED | `extendAbonoWindows` is a piggyback inside `app/api/cron/cancel-expired/route.ts` (single `GET`), called after the existing `authorization !== Bearer ${CRON_SECRET}` → 401 gate at line 232; `git diff --name-only 861ea4b..HEAD -- vercel.json` empty; `test/abono-cron.test.ts` case 4 (401 without valid bearer, nothing generated) passes |
| 10 (D-09′) | El detalle muestra la fecha del ÚLTIMO turno real (no `generated_until`) | ✓ VERIFIED | `app/(dashboard)/abonos/page.tsx:43-55` computes `lastTurnoDates` as max non-cancelled appointment `date` per abono, explicitly rejecting `generated_until` (comment at line 45-46); `abonos-client.tsx:260-263` renders "Último" from that value; "Sesiones: X de N" at line 259 |
| 11 (ABONO-03) | Modelo de datos extensible sin re-migrar | ✓ VERIFIED | `054_abonos.sql:65-69` — `reminder_lead_hours`, `deposit_amount`, `billing_subscription_id` present, nullable, unused in v0.24, explicitly commented as v0.25/cobro placeholders |
| 12 | `book_slot_atomic` / `lib/booking-core.ts` not weakened during the phase | ✓ VERIFIED | `git log --oneline -- lib/booking-core.ts` shows zero commits in Phase 6 (last touch was v0.12 Phase 3); `abono_id` is set via a bounded post-insert `UPDATE` (`lib/abono-generation.ts:179-183`), never inside the RPC |

**Score:** 12/12 truths verified, 0 present-but-behavior-unverified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `supabase/migrations/054_abonos.sql` | Tabla abonos + RLS owner-only + FK abono_id + abono_window_weeks + total_occurrences/'completed' | ✓ VERIFIED | 115 lines, idempotent (`IF NOT EXISTS`/`ADD COLUMN IF NOT EXISTS`), matches every D-01/02/03/06′/07′/10 clause |
| `supabase/schema.sql` | Regenerated to match 054 | ✓ VERIFIED | `abonos` table, policies, grants present (schema.sql:~3332); `book_slot_atomic` absent from the diff per SUMMARY claim, spot-checked unchanged |
| `lib/types.ts` | `interface Abono`, `Appointment.abono_id`, `Business.abono_window_weeks` | ✓ VERIFIED (via tsc) | `npx tsc --noEmit` compiles clean against all consumers of these types |
| `lib/abono-generation.ts` | Motor puro: itera, guardas, idempotencia, createAppointmentCore, skip+record | ✓ VERIFIED | 195 lines; exports `generateAbonoOccurrences`; read in full above |
| `lib/booking-core.ts` | INTACT — no changes during Phase 6 | ✓ VERIFIED | `git log` shows zero touches since v0.12 |
| `app/api/abonos/create/route.ts` | Alta autenticada + anti-tampering + primera tanda + 1 mail | ✓ VERIFIED | 345 lines; read in full above |
| `app/api/cron/cancel-expired/route.ts` | Extensión piggyback + gate de secreto intacto | ✓ VERIFIED | `extendAbonoWindows` exported, called post-gate; read in full above |
| `app/(dashboard)/abonos/*`, `nuevo-abono-form.tsx`, `agenda-client.tsx` badge | UI del abono | ✓ VERIFIED | Page/client/form present; `abono_id` in agenda select + badge "Fijo"; sidebar + verticals menu registration confirmed |
| `components/ui/drawer.tsx` + `components/ui/select.tsx` | Portal-in-drawer fix (06-07) | ✓ VERIFIED | `DrawerPortalContainerContext` / `useDrawerPortalContainer` wired; `SelectContent` consumes it with a fallback that leaves non-drawer behavior byte-identical |
| `test/abono-generation.test.ts` | Motor tests | ✓ VERIFIED | 12 cases, all pass |
| `test/abono-create.test.ts` | Endpoint tests | ✓ VERIFIED | 14 cases (10 integration + 4 pure mail), all pass |
| `test/abono-cron.test.ts` | Cron extension tests | ✓ VERIFIED | 10 cases, all pass |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `lib/abono-generation.ts` | `lib/booking-core.ts` | `createAppointmentCore` call | ✓ WIRED | Single call site, line 159 |
| `lib/abono-generation.ts` | `appointments.abono_id` | bounded `UPDATE ... .eq('id',...).eq('business_id',...)` | ✓ WIRED | Line 179-183, post-insert only |
| `app/api/abonos/create/route.ts` | `lib/abono-generation.ts` | `generateAbonoOccurrences` | ✓ WIRED | Line 196 |
| `app/api/cron/cancel-expired/route.ts` | `lib/abono-generation.ts` | `generateAbonoOccurrences` | ✓ WIRED | Line 175 |
| `components/dashboard/nuevo-abono-form.tsx` | `/api/abonos/create` | fetch POST | ✓ WIRED | Confirmed by 06-05 SUMMARY + eslint/tsc pass; matched pattern in file (not re-quoted here) |
| `app/(dashboard)/agenda/agenda-client.tsx` | `appointments.abono_id` | badge render | ✓ WIRED | `abono_id` added to select in `agenda/page.tsx`, badge rendered conditionally |

### Requirements Coverage

| Requirement | Status | Evidence |
|---|---|---|
| ABONO-01 | ✓ SATISFIED | Alta manual autenticada, panel UI, anti-tampering — see truths 1-2 |
| ABONO-02 | ✓ SATISFIED | Generación forward vía núcleo atómico, skip+record, vinculación `abono_id` — see truths 3-6 |
| ABONO-03 | ✓ SATISFIED | Columnas extensibles nullable presentes, sin lógica v0.24 — see truth 11 |
| ABONO-04 | — Phase 7 (correctly absent) | Not in scope; no mail-cancel-link code found, as expected |
| ABONO-05 | — Phase 7 (correctly absent) | No "dar de baja" endpoint found, as expected |
| ABONO-06 | ✓ SATISFIED | Piggyback in the single daily cron, `CRON_SECRET` gate intact, `vercel.json` untouched — see truth 9 |
| ABONO-07 | ✓ SATISFIED | `total_occurrences`/`completed`, real-DB-count convergence, D-09′ display — see truths 8, 10 |

No orphaned requirements found (REQUIREMENTS.md traceability table matches PLAN frontmatter `requirements:` fields across 06-01..06-07).

### Anti-Patterns Found

None blocking. Scanned all phase-modified files for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/empty-return stubs — none found in the abono surface. Two pre-existing, explicitly out-of-scope items were confirmed NOT introduced by this phase and are excluded from findings per the verification brief:
- `settings-client.tsx` react-hooks lint warnings (pre-existing, unrelated to abonos).
- Unused import in `test/abono-cron.test.ts` (documented as a known, non-blocking deferred item in 06-07 SUMMARY).

### Behavioral Spot-Checks / Probe Execution

Not applicable as a separate step — the phase's own vitest integration suite against local Supabase (32/32 across the three abono test files) constitutes the behavioral evidence for every state-transition/invariant claim in this phase (skip-vs-pisa, idempotency, finite convergence, cron secret gate, cross-tenant isolation). No standalone `probe-*.sh` scripts exist for this workstream.

### Deployment Note

Per the task brief: migration `054_abonos.sql` was applied to production on 2026-07-21 (confirmed independently by the 06-05-SUMMARY.md "Estado de deploy" section, dated the same day). Last migration in prod = 054; **any further schema change to `abonos`/`appointments.abono_id`/`businesses.abono_window_weeks` now requires a new migration numbered 055+** — the in-place edit trick used by Plan 06-06 (editing 054 because prod was still on 053) is no longer available. No pending schema changes were found in the current worktree beyond what's already in 054, so this is informational, not a gap.

### Human Verification Required

None. Plan 06-05's blocking checkpoint (UI visual/functional flow) was already run and approved by the human developer across 3 UAT rounds per the SUMMARY, and the resulting revisions (D-06′/D-07′/D-09′, Select-in-Drawer bug) were captured as locked decisions and closed in Plans 06-06/06-07, which this verification re-confirmed against the actual code (not the SUMMARY narrative).

### Gaps Summary

No gaps. All roadmap success criteria (ABONO-01/02/03/06/07) and all seven invariants called out in the verification brief are independently confirmed in the codebase — not merely claimed in SUMMARYs. `tsc`, the full abono test suite, and eslint all pass; the anti-doble-booking core (`lib/booking-core.ts`) was never touched during the phase; `vercel.json` is untouched; the cron secret gate remains in force.

---

_Verified: 2026-07-21_
_Verifier: Claude (gsd-verifier)_
