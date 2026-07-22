---
phase: 07-cancelaci-n-del-abono-mail-panel
verified: 2026-07-22T12:44:00Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 7: Cancelación del abono (mail + panel) Verification Report

**Phase Goal:** Tanto el cliente (desde un link en el mail) como el dueño (desde el panel del negocio)
pueden dar de baja el abono completo. La baja deja de generar turnos futuros de la serie; el manejo de
los turnos ya generados se aplica de forma consistente por ambas vías. Reusa el patrón del cancel-token
de turno actual, pero elevado a nivel serie.

**Verified:** 2026-07-22T12:44:00Z
**Status:** passed
**Re-verification:** No — initial verification (this is the first VERIFICATION.md for this phase; 12
plans across 3 waves — build (07-01..05) + gap closure of `07-REVIEW.md`'s 15 findings (07-06..12))

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | El cliente recibe un mail con un link para cancelar la suscripción; abrir el link da de baja la SERIE COMPLETA | ✓ VERIFIED | `app/api/abonos/create/route.ts:265-267` fills `cancelUrl` from `abono.cancel_token`; `lib/email.ts` `sendAbonoConfirmation` renders the button when `cancelUrl` is set (`:448-450`); `app/abono/cancelar/[token]/page.tsx` resolves the series (not a single appointment) by `cancel_token` with service role; `app/api/abonos/cancel/[token]/route.ts` delegates 100% to `cancelAbonoSeries` (no local `appointments` writes — grep confirms zero `.from('appointments')` in this route). Route-level test `test/abono-cancel-routes.test.ts` block 1 (7 cases) exercises this live against local DB — all pass. |
| 2 | El dueño puede dar de baja el abono desde el panel del negocio | ✓ VERIFIED | `app/api/abonos/cancel/route.ts` — session-authenticated (`auth.getUser()` → 401 if absent), business resolved by `owner_id` (never client input), abono re-validated by `id + business_id` before touching anything, delegates to the same `cancelAbonoSeries`. UI wired: `app/(dashboard)/abonos/abonos-client.tsx` "Dar de baja" button (only inside the detail Dialog/Drawer, D-18) → `ConfirmDialog` (D-19, shows real count + last date) → `POST /api/abonos/cancel`. Route-level test block 2 (9 cases) exercises this live against local DB, including cross-tenant isolation (case 4/9) — all pass. |
| 3 | Al darse de baja por cualquiera de las dos vías, el sistema deja de generar turnos futuros de esa serie (el cron ya no la extiende) | ✓ VERIFIED | `cancelAbonoSeries` flips `abonos.status` to `'cancelled'` (idempotent gate). `app/api/cron/cancel-expired/route.ts:136` filters generation strictly to `.eq('status', 'active')` — a cancelled series is structurally excluded, no cron code change needed. Confirmed by grep and unchanged since Phase 6. |
| 4 | Los turnos futuros ya generados se manejan de forma CONSISTENTE entre la baja por mail y la baja por panel | ✓ VERIFIED | Both routes call **only** `cancelAbonoSeries` (`lib/abono-cancel.ts`) for the mass-cancel effect — grep confirms neither route contains a direct `appointments` UPDATE. The engine's mass-cancel step is scoped by `business_id` AND `abono_id` AND `date >= cutoff` AND `status != cancelled`, identical for both callers. CR-01 (critical finding: partial-failure left orphaned live appointments and lied "success" on retry) is fixed via an idempotent repair sweep in the `alreadyCancelled` branch — verified by 5 dedicated cases in `test/abono-cancel.test.ts` (##9-13: repair on retry, doesn't touch the past, doesn't cross series/tenants, idempotent on 3rd call, `not_found` doesn't sweep) plus the **real concurrency race test** in `test/abono-cancel-routes.test.ts` (case 1, block 1): `Promise.all` of two POSTs on the same token against live Postgres → exactly 1 mail, 0 live future appointments, `status='cancelled'`. Ran this file in isolation during this verification: **16/16 passed**. |

**Score:** 4/4 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/abono-cancel.ts` | Single shared cancellation engine (`cancelAbonoSeries`), idempotent, dual-scoped | ✓ VERIFIED | Exists, substantive, wired — both routes import and call it exclusively; no local appointments writes in callers. Includes CR-01 repair sweep. |
| `app/api/abonos/cancel/[token]/route.ts` | Public token-based cancel (client path) | ✓ VERIFIED | New route (D-10 honored — does not touch `/cancelar/[token]` or `/api/cancel/[token]`), resolves tenant from token row only, delegates to engine, sends 2 mails via `after()`. |
| `app/abono/cancelar/[token]/page.tsx` + `abono-cancel-client.tsx` | Public cancellation page (tenant-branded) | ✓ VERIFIED | New route, `PaletteScript` branding, server-computed preview via `previewAbonoCancellation`, `noindex` (IN-04 fix), contrast-safe accent text (IN-05 fix), server-authoritative post-action count (WR-01 fix). |
| `app/api/abonos/cancel/route.ts` | Authenticated owner cancel (panel path) | ✓ VERIFIED | Session-authenticated, `owner_id`-resolved tenant, delegates to engine, single client mail via `after()`, no admin mail to self (D-13). |
| `app/(dashboard)/abonos/abonos-client.tsx` + `page.tsx` | Panel UX: Archivados filter, confirm dialog, copy-link | ✓ VERIFIED | Tab filter (D-20: `active` vs `cancelled`+`completed`), destructive button only in detail (D-18), `ConfirmDialog` shows real count/last date (D-19), `completed` abonos can still be cancelled (D-21). Preview query bounded by date (WR-06 fix). |
| `app/api/abonos/cancel-link/[id]/route.ts` | On-demand token resolution for "Copiar link de baja" | ✓ VERIFIED | New endpoint (WR-07 fix), session-authenticated, dual-scoped, returns only a URL (not the raw token in the listing payload). `cancel_token` confirmed removed from `AbonoRow` type and from `page.tsx`'s select. |
| `lib/email.ts` (`sendAbonoCancelledEmail`, `sendAbonoCancelledAdminNotification`) | Templates for the single client + admin cancellation mail (D-14) | ✓ VERIFIED | Both exist, both escape all dynamic HTML values via `esc()` (WR-02 fix), both log without PII (IN-03 fix, scoped to the new templates), `resendSend` has a 10s `AbortSignal` timeout shared by all templates (WR-05 fix). |
| `supabase/migrations/056_abonos_cancel_token_unique.sql` | Unique index closing the token authorization model at the DB level (WR-03) | ✓ VERIFIED | Exists, idempotent, includes a pre-check for existing duplicates that aborts with an actionable message. Deploy order (055 → 056 → `NOTIFY pgrst`) is recorded in the migration file header itself — the place an operator applying migrations by hand will see it — and repeated in 07-12's SUMMARY "Deuda anotada". Applied and validated against local baseline only; **manual application to prod is a known, explicitly-tracked pending step**, not a gap. |
| `test/abono-cancel-routes.test.ts` | Route-level coverage of both cancel paths, including a real concurrency race (WR-08) | ✓ VERIFIED | 540 lines, 16 cases across 2 `describe.skipIf(!hasSupabaseCreds)` blocks. Ran in isolation during this verification: `npx vitest run test/abono-cancel-routes.test.ts` → **16 passed (16)**. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `app/api/abonos/create/route.ts` | `lib/email.ts` `sendAbonoConfirmation` | `cancelUrl` filled from `abono.cancel_token`, pointing at `/abono/cancelar/[token]` | ✓ WIRED | D-16 closed. |
| `app/api/abonos/cancel/[token]/route.ts` | `lib/abono-cancel.ts` `cancelAbonoSeries` | direct call, `businessId` from the token-resolved row | ✓ WIRED | Client path delegates fully. |
| `app/api/abonos/cancel/route.ts` | `lib/abono-cancel.ts` `cancelAbonoSeries` | direct call, `businessId` from session `owner_id` | ✓ WIRED | Panel path delegates fully — same engine, same effect (D-07). |
| `lib/abono-cancel.ts` (status flip to `cancelled`) | `app/api/cron/cancel-expired/route.ts` (generation loop) | cron's `.eq('status','active')` filter | ✓ WIRED | No cron code change required or made; verified unchanged. |
| `app/(dashboard)/abonos/abonos-client.tsx` "Copiar link de baja" | `app/api/abonos/cancel-link/[id]/route.ts` | `fetch` on click, clipboard write on success | ✓ WIRED | On-demand, session-scoped; token no longer travels with the listing (WR-07). |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `abono-cancel-client.tsx` preview block | `cancelledCount`/`lastDate` (initial render) | `previewAbonoCancellation()` — real query against `appointments` filtered by `business_id`+`abono_id`+`date>=cutoff`+`status!=cancelled` | Yes | ✓ FLOWING |
| `abono-cancel-client.tsx` post-action block | `result.count`/`result.lastDate` | `POST` response from `cancelAbonoSeries`'s real affected-rows count | Yes | ✓ FLOWING (WR-01 fix: server is authoritative, preview discarded once the real result exists) |
| `abonos-client.tsx` `ConfirmDialog` description | `futureTurnoCounts[id]`/`lastFutureDates[id]` | `page.tsx` server query, date-bounded (WR-06 fix) | Yes | ✓ FLOWING |
| `abonos-client.tsx` copy-link button | clipboard `url` | `GET /api/abonos/cancel-link/[id]` real DB lookup, not a client-held value | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Route-level suite for both cancel paths (existence + single-run) | `npx vitest run test/abono-cancel-routes.test.ts` | `Test Files 1 passed (1)`, `Tests 16 passed (16)` | ✓ PASS |
| Type-check clean on current tree | `./node_modules/.bin/tsc --noEmit` | exit 0, no output | ✓ PASS |
| Neither cancel route writes `appointments` directly (star invariant D-07) | `grep -n "from('appointments')" app/api/abonos/cancel/route.ts app/api/abonos/cancel/[token]/route.ts` | no matches | ✓ PASS |
| Cron only extends `active` series | `grep -n "eq('status', 'active')" app/api/cron/cancel-expired/route.ts` | match at line 136 | ✓ PASS |

Full suite (723 passed / 1 skipped) and `npm run build` were reported clean by the execution session and were not re-run here per instructions (already verified, long-running).

### Probe Execution

No `scripts/*/tests/probe-*.sh` declared or discovered for this phase. N/A.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| ABONO-04 | 07-01, 07-02, 07-03, 07-06, 07-07, 07-08, 07-09, 07-11, 07-12 | Client mail with series-level cancel token/link | ✓ SATISFIED | See truth #1 above. |
| ABONO-05 | 07-01, 07-04, 07-06, 07-10, 07-11, 07-12 | Owner panel cancels the abono | ✓ SATISFIED | See truth #2 above. |

No orphaned requirements — `REQUIREMENTS.md` traceability table maps exactly ABONO-04/05 to Phase 7 and both are claimed and satisfied.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `lib/email.ts` | ~611, ~740 (new templates) | none — PII removed from `console.log` for the two templates this phase added | — | IN-03 closed for in-scope code |
| `lib/email.ts` | ~233, ~352, ~471, ~859, ~975, ~1077, ~1190, ~1292 (pre-existing templates) | `console.log` with recipient email (PII) | ℹ️ INFO (pre-existing, out of phase scope) | Documented as tracked debt in 07-12 SUMMARY ("Deuda anotada", item 3); not introduced by this phase and not touching any of the two new templates. |
| `app/cancelar/[token]/page.tsx` | — | missing `robots: noindex` on the sibling single-appointment cancel page | ℹ️ INFO (pre-existing, out of phase scope) | D-10 explicitly forbids touching this file/route in this phase (locked decision, to avoid regressing a route live in prod); documented as tracked debt. |
| `components/crm/risk-badge.tsx` | ~55 | dot color relies on `--crm-danger`, scoped to `.crm-shell` only, so it's transparent in non-CRM `ConfirmDialog` usages (including the new abono cancel dialog) | ℹ️ INFO (pre-existing, global, surfaced by 07-05 UAT) | Found during the phase's human checkpoint (07-05), explicitly scoped as pre-existing and affecting all non-CRM `ConfirmDialog` usage, not introduced by this phase. Cosmetic only — the confirm dialog itself functions correctly (title/description/buttons all render; only the risk dot fails to tint). |

No `TBD`/`FIXME`/`XXX` unresolved-debt markers found in the phase's changed files.

### Human Verification Required

None required for phase sign-off. Two items are open but explicitly deferred/out-of-scope, not phase gaps:

1. Mail delivery in production (Resend) for the two new templates — could not be confirmed by receipt in the local checkpoint (07-05), same class of pending verification as v0.22's manual-booking mail. Covered by 14 payload tests + the route-level test's spy-based call-count assertions. Recommend confirming by receipt after the production deploy.
2. Production migration application — `055_abono_window_bounds.sql` then `056_abonos_cancel_token_unique.sql` then `NOTIFY pgrst, 'reload schema'`, in that order, is a manual deploy step (documented in the migration file and in 07-12's SUMMARY). Not a code gap; an operational step to execute at ship time.

## Gaps Summary

No blocking gaps. All 4 roadmap success criteria are observably true in the codebase, both cancellation
paths delegate exclusively to a single shared engine (the phase's star invariant, D-07), and the critical
finding from the code review (CR-01) has both unit-level and — importantly — a **real** route-level
concurrency test that was independently run during this verification and passed (16/16).

One item is worth a WARNING flag for follow-up, not a phase failure:

- **T-07-55 (mutation test) not run.** The review asked for a mutation test — comment out the
  `.neq('status','cancelled')` gate in `lib/abono-cancel.ts` and confirm the race test then fails —
  as an extra proof that the passing race test would actually catch a regression. 07-12's SUMMARY
  honestly reports this was never executed (the executor stalled before Task 3, and the continuation
  agent declined to run it to avoid re-triggering the stall by editing production code and re-running
  the suite). This is legitimate residual risk to flag, but it does **not** leave the invariant itself
  unverified: the race test is not a mock — it runs `Promise.all` of two real POSTs against a live local
  Postgres instance and asserts on real DB state (0 live future appointments, `status='cancelled'`,
  exactly 1 mail call) plus 5 additional unit-level repair-sweep cases in `lib/abono-cancel.ts`'s own
  test file. Recommend `/gsd:secure-phase 07` close T-07-55 with the mutation test as a final rigor
  step before or shortly after the milestone ships, but it should not block phase completion.

Both partially-closed code review findings (IN-03, IN-04) were re-verified against the actual review
scope: they only ever asked for the surfaces this phase touches (the two new mail templates, the new
public cancellation page). Both are fully fixed for that surface. The remaining PII-in-logs and
missing-noindex items live in pre-existing files this phase's own locked decision (D-10) forbids
touching (`lib/email.ts`'s older templates, `/cancelar/[token]`) — correctly scoped as tracked debt,
not phase gaps.

---

_Verified: 2026-07-22T12:44:00Z_
_Verifier: Claude (gsd-verifier)_
