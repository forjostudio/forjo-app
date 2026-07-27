---
phase: 10-reservar-con-cualquiera-desde-la-p-gina-p-blica
verified: 2026-07-27T12:10:00Z
status: passed
score: 8/8 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 10: Reservar con "cualquiera" desde la página pública — Verification Report

**Phase Goal:** En la página pública el cliente elige un profesional específico O "cualquiera"; con "cualquiera" un horario está libre si ALGÚN profesional capaz lo tiene libre (DISP-01/03); elegir específico se comporta idéntico a hoy (DISP-02, cero regresión single-pro); al confirmar ve quién le tocó en pantalla + mail (ASIGN-05); el gemelo canchas sigue sin "cualquiera" e igual que hoy (SC5).

**Verified:** 2026-07-27
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | ASIGN-01: en la reserva pública el cliente puede elegir un profesional específico o "cualquiera" | ✓ VERIFIED | `app/[slug]/booking-client.tsx:507-536` renders "Cualquiera" card above the professional list, gated on `showAny = capaces.length >= 2` (line 126); specific professionals still selectable via `capaces.map` (line 537). |
| 2 | DISP-01: un horario aparece disponible si algún profesional capaz lo tiene libre | ✓ VERIFIED | `app/api/booking/availability/route.ts:207-226` — `someoneFree` is an OR (`.some(...)`) across capable pros; test `booking-cualquiera-public.test.ts` DISP-01 case (2 pros, one busy at 10:00 → 10:00 still offered) — reran independently, green. |
| 3 | DISP-02: elegido un profesional específico, disponibilidad = comportamiento actual sin cambios | ✓ VERIFIED | The `any` branch (route.ts:101-231) returns before the specific-path bucketing (line 233+); specific/omitted path is untouched code. `test/booking-public-regression.test.ts` (byte-identical contract) green; `test/booking-cualquiera-public.test.ts` DISP-02 case confirms per-agenda isolation. |
| 4 | DISP-03: si ningún profesional capaz tiene lugar, el horario no se ofrece | ✓ VERIFIED | route.ts:226 `if (!someoneFree) fullAny.push(hhmm)`; test DISP-03 case (both pros busy at 10:00 → 10:00 in `full`) — reran, green. |
| 5 | ASIGN-05: el cliente ve qué profesional le tocó en pantalla de confirmación y en el mail | ✓ VERIFIED | `components/booking/confirmation-view.tsx:163-165` renders "Te atiende"/vertical label row conditionally on `professionalName`; `lib/email.ts:313-316,366` renders the same conditionally-escaped row in HTML + plaintext; both mail callers (`app/api/notify/booking/route.ts`, `app/api/payment/webhook/[slug]/route.ts`) join `professionals(name)` from the persisted appointment (never from the client) and pass `professionalName`/`professionalLabel`. Wiring test in `booking-cualquiera-public.test.ts` confirms `anyProfessional:true` → non-null `professional_id` resolvable to a name; sentinel → null. |
| 6 | El gemelo canchas sigue sin "cualquiera" e igual que hoy (SC5) | ✓ VERIFIED | `canchas-booking-client.tsx` not touched in any Phase 10 commit (confirmed via `git log` on the touched-file list); `page.tsx` passes `professionalServices` only to `<BookingClient>`, never to `<CanchasBookingClient>` (page.tsx:144-162); canchas path in `create/route.ts` (professionalId=cancha.id, no `anyProfessional`) is untouched; `test/canchas-booking.test.ts` green. |
| 7 | anyProfessional boolean (never an id) drives assignment, server is authority (D-05) | ✓ VERIFIED | `create/route.ts:38` `body.anyProfessional === true` (strict boolean) passed as `autoAssign` to `createAppointmentCore` (line 173); front sends `professionalId: isAny ? null : proId` + `anyProfessional: isAny` (booking-client.tsx:349-350). |
| 8 | Vista acotada expone capaz-de sin abrir la tabla puente a anon (D-07) | ✓ VERIFIED | `supabase/migrations/059_public_professional_services.sql` — definer view (no `security_invoker`), 3 non-sensitive columns, `professional_services` retains no anon policy. `supabase/schema.sql` reflects the view (lines 870-877) + grants (3656-3658). |

**Score:** 8/8 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/059_public_professional_services.sql` | Vista acotada anon staff↔servicios | ✓ VERIFIED | Definer, 3 cols, GRANT ALL x3 roles, idempotent `CREATE OR REPLACE VIEW`. |
| `supabase/migrations/060_public_professionals_exclude_canchas.sql` | Hardening: excluye canchas de public_professionals | ✓ VERIFIED | Additional hardening migration (not in original 5 plans, requested post-UAT). `WHERE active=true AND service_id IS NULL`. |
| `app/api/booking/availability/route.ts` | Rama `any=1&serviceId` con agregación across-staff | ✓ VERIFIED | Lines 25-29 gate params, 86-231 aggregation branch, returns `{ ok, busy:[], full }`, `Cache-Control: no-store`. |
| `app/api/booking/create/route.ts` | Wiring `anyProfessional` → `autoAssign` | ✓ VERIFIED | Line 38 strict boolean parse, line 173 passed to core. |
| `app/[slug]/page.tsx` | Read-path `public_professional_services` → prop a BookingClient (no a CanchasBookingClient) | ✓ VERIFIED | Line 97 select, line 160 prop to `<BookingClient>` only. |
| `app/[slug]/booking-client.tsx` | Tarjeta "Cualquiera" + gating + señal | ✓ VERIFIED | Lines 120-130 derivation, 507-519 card, 349-350 signal. |
| `lib/email.ts` | Param `professionalName` + fila condicional | ✓ VERIFIED | Lines 225-226, 249, 252 (types), 313-316 (HTML row, escaped), 366 (plaintext). |
| `app/api/notify/booking/route.ts` | select `professionals(name)` + call site | ✓ VERIFIED | Line 19 select, 37 derive, 62-63 pass. |
| `app/api/payment/webhook/[slug]/route.ts` | select `professionals(name)` + call site | ✓ VERIFIED | Line 111 select, 170 derive, 189-190 pass. |
| `components/booking/confirmation-view.tsx` | professionalName + vertical-aware label | ✓ VERIFIED | Lines 29-33 props, 163-165 conditional row; callers (`turno/[token]/page.tsx`, `pago/exitoso/page.tsx`) resolve `professionalLabel` by vertical (canchas → resource terminology, staff → "Te atiende"). |
| `lib/staff-services.ts` | `professionalsForService`, `bookableServices` (gap-closure guard) | ✓ VERIFIED | Wildcard rule (0 rows = capable of all); `bookableServices` hides 0-coverage services only when ≥1 named professional exists (sentinel guard, lines 74-87). |
| `test/booking-cualquiera-public.test.ts` | DISP-01/02/03 + ASIGN-05 coverage | ✓ VERIFIED | 5 cases, re-ran independently: green. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `app/api/booking/create/route.ts` | `lib/booking-core.ts` | `autoAssign:true` when `anyProfessional===true` | ✓ WIRED | Line 173: `autoAssign: anyProfessional`; `booking-core.ts` untouched (Phase 9 already implements). |
| `app/api/booking/availability/route.ts` | `lib/staff-services.ts` | `professionalsForService` | ✓ WIRED | Line 130-134, single source of truth reused (not reimplemented). |
| `app/[slug]/page.tsx` | `public_professional_services` (vista 059) | `.from('public_professional_services').select` | ✓ WIRED | Line 97, filtered by `business_id` (line 97), fail-safe `|| []` at prop pass (line 160). |
| `app/[slug]/booking-client.tsx` | `app/api/booking/availability/route.ts` | `any=1&serviceId` when `isAny` | ✓ WIRED | Lines 255-258 (request), route.ts line 101 consumes it. |
| `app/api/notify/booking/route.ts` / `payment/webhook` | `lib/email.ts` | `professionalName` param | ✓ WIRED | Both callers derive from persisted join and pass through; verified above. |

### Behavioral Spot-Checks / Test Re-run

Independently re-ran (not trusting SUMMARY claims) the full Phase 10-relevant suite plus the full workspace suite once:

| Suite | Command | Result | Status |
|-------|---------|--------|--------|
| `test/booking-cualquiera-public.test.ts` | `npx vitest run ... --no-file-parallelism` | 15/15 passed (bundled with the 4 other Phase-10-relevant files below) | ✓ PASS |
| `test/service-coverage-public.test.ts` | (same run) | passed | ✓ PASS |
| `test/public-professionals-excludes-canchas.test.ts` | (same run) | passed | ✓ PASS |
| `test/canchas-booking.test.ts` | (same run) | passed | ✓ PASS |
| `test/booking-public-regression.test.ts` | (same run) | passed | ✓ PASS |
| Full workspace suite | `npx vitest run --no-file-parallelism` | 771 passed / 1 skipped (772), 62 files | ✓ PASS |
| Typecheck | `./node_modules/.bin/tsc --noEmit` (local binary, not `npx tsc` — project memory: `npx tsc` is unreliable and can exit 0 spuriously) | exit 0 | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` conventioned probes exist in this repo and none were declared in the Phase 10 PLANs/SUMMARYs. Skipped — not applicable to this phase's verification method (Vitest + `supabase db reset`, not shell probes).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ASIGN-01 | 10-01, 10-02 | Cliente elige específico o "cualquiera" | ✓ SATISFIED | Card + signal wired end to end (Truths 1, 7). |
| ASIGN-05 | 10-03 | Nombre del profesional en pantalla + mail | ✓ SATISFIED | Truth 5. |
| DISP-01 | 10-01, 10-02 | Horario disponible si algún capaz libre | ✓ SATISFIED | Truth 2. |
| DISP-02 | 10-01, 10-02 | Específico = comportamiento actual | ✓ SATISFIED | Truth 3. |
| DISP-03 | 10-01, 10-02 | Ningún capaz libre → horario oculto | ✓ SATISFIED | Truth 4. |

No orphaned requirements: REQUIREMENTS.md traceability table maps exactly these 5 IDs to Phase 10, and all 5 appear in at least one plan's `requirements:` frontmatter (10-01: ASIGN-01/DISP-01/02/03; 10-02: same 4; 10-03: ASIGN-05; 10-04: DISP-01/02/03/ASIGN-05 verification; 10-05: all 5, human checkpoint).

Note (non-blocking, informational): `REQUIREMENTS.md`'s per-requirement checkboxes and the Traceability table still show these 5 IDs as "Pending" rather than "Complete" — this is a documentation-sync item (typically updated at `/gsd:complete-milestone` or a housekeeping pass), not evidence of incomplete implementation; the codebase and test evidence above independently confirm all 5 are implemented and covered.

### Anti-Patterns Found

None. Grepped all files touched by Phase 10 (`availability/route.ts`, `create/route.ts`, `booking-client.tsx`, `page.tsx`, `staff-services.ts`, `email.ts`, `notify/booking/route.ts`, `payment/webhook/[slug]/route.ts`, `confirmation-view.tsx`, both migrations) for `TODO|FIXME|XXX|TBD|placeholder|coming soon|not yet implemented`. The only hits were false positives: Spanish prose using "todo"/"todos" (= "all"/"every", not the English marker) and legitimate form-field `placeholder=` HTML attributes. No debt markers, no empty-implementation stubs, no hardcoded-empty props flowing to render.

### Human Verification Required

None outstanding. Plan 10-05 was a blocking human-verify checkpoint (`checkpoint:human-verify`, `autonomous: false`) covering the 5 visual/behavioral success criteria (card visibility + gating, aggregated grid respecting libre/lleno, confirmation showing the assigned professional, zero regression for specific-professional and canchas). Per the orchestrator's context, the operator ran this checkpoint and approved all 5 criteria; three gap-closure fixes were subsequently shipped and are reflected in the code verified above (vertical-aware professional label, `bookableServices` hiding uncovered services, step-4 summary showing the chosen professional). No 10-05-SUMMARY.md file exists on disk (checkpoint plans do not always emit one), which is a minor documentation-completeness note but does not block phase closure given the human approval is independently corroborated by the subsequent gap-closure commits (`48e418c`, `43a9c40`, `f0b383f`) and by the hardening commit (`fd8031c`, migr. 060) that was requested as a direct result of that same closure loop.

### Gaps Summary

No gaps found. All 8 derived must-haves (roadmap success criteria + PLAN frontmatter truths merged) verified against the actual codebase — not just SUMMARY.md claims:
- Server surface (migr. 059, `any=1` aggregation branch, `autoAssign` wiring) — code inspected directly.
- Frontend surface (card, gating, signal, canchas non-regression) — code inspected directly.
- Mail/confirmation surface (ASIGN-05, vertical-aware label) — code inspected directly across 4 files (email.ts + 2 route handlers + confirmation-view.tsx + 2 page callers).
- Test evidence — independently re-ran (not trusted from SUMMARY): 5 targeted files green, full suite 771/1 skipped green, tsc (local binary) exit 0.
- Hardening migration 060 (post-UAT, user-requested) — verified in both the migration file and the regenerated `schema.sql`, with a dedicated regression test (`public-professionals-excludes-canchas.test.ts`) green.
- Security-sensitive phase: per instructions, absence of a SECURITY.md is expected — `secure-phase` is a mandatory separate follow-up, not part of this verification's scope.

---

*Verified: 2026-07-27*
*Verifier: Claude (gsd-verifier)*
