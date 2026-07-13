---
phase: 05-vitest-test-suite
threats_total: 10
threats_closed: 10
threats_open: 0
status: secured
asvs_level: 1
block_on: high
verified: 2026-06-17
auditor: gsd-security-auditor
register_authored_at_plan_time: true
mode: verify
---

# Phase 5 — Vitest Test Suite (TEST-01): Security Verification

**Scope:** These are TEST-VALIDITY threats. A broken or false-green test gives a false
security assurance, so each mitigation was verified by reading the actual test code AND by
running the suite, not by trusting the SUMMARY/VERIFICATION docs.

**Result:** 10/10 threats CLOSED. The full suite runs `10 passed (10)` — the 3 isolation
tests now execute against the dev Supabase project (real creds present in `.env.local`),
so the RLS isolation control is exercised at runtime, not merely static-checked.

---

## Threat Verification — 05-01-PLAN (webhooks)

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-05-01 | Tampering (test-validity) — wrong mock surface | mitigate | CLOSED | Deposit webhook uses RAW `fetch` (not `mpFetch`): `app/api/payment/webhook/[slug]/route.ts:93`. Test mocks `global.fetch` via `vi.stubGlobal('fetch', ...)`: `test/webhook-deposit.test.ts:148,173`. Subscription webhook uses `mpFetch` (`app/api/subscription/webhook/route.ts:47,67,88`); its test mocks `mpFetch` via partial `vi.mock`: `test/webhook-subscription.test.ts:10-16`. Mock surface matches each handler's real I/O — no live MP call possible. |
| T-05-02 | Repudiation (test-validity) — signature check skipped | mitigate | CLOSED | Deposit test does NOT mock `@/lib/mercadopago` (grep: only `next/server`, `admin`, `business-secrets`, `payment`, `email`, `google-calendar` mocked) → `verifyMPSignature` runs REAL: `test/webhook-deposit.test.ts:5-53`. Subscription test uses partial mock preserving `verifyMPSignature` + `getMPWebhookSecret`: `test/webhook-subscription.test.ts:10-16`. `craftSignature` replicates the production manifest byte-for-byte (`id:…;request-id:…;ts:…;` + HMAC-SHA256): `test/helpers/mp-signature.ts:20-26` vs `lib/mercadopago.ts` manifest. Runtime: no-sig→401, wrong-secret→401, valid→200 all pass for both webhooks. |
| T-05-03 | Information Disclosure (test-validity) — confirms without verifying effect | mitigate | CLOSED | Under-payment test asserts on admin-client mock CALLS, not just HTTP 200: asserts `update({ payment_status: 'amount_mismatch' })` was called AND that NO call carried `status: 'confirmed'`: `test/webhook-deposit.test.ts:187-195`. Matches production guard at `route.ts:135-146` (return before confirm/email/calendar on mismatch). Runtime log confirms path hit: `monto incorrecto { expected_cents: 150000, paid_cents: 100 }`. `vi.waitFor` drains `after()` deterministically. |
| T-05-04 | Denial of Service (CI) — live MP call → flaky/offline | mitigate | CLOSED | No `mercadopago.com` / `api.mercadopago.com` string anywhere under `test/` (grep: no matches). Deposit mocks `global.fetch`; subscription mocks `mpFetch`. Sanity assert `expect(fetchMock).toHaveBeenCalled()` confirms the mock — not the network — served the request: `test/webhook-deposit.test.ts:198`. Suite runs in 2.34s with no network. |
| T-05-SC | Tampering — devDep supply chain | mitigate | CLOSED | RESEARCH §Package Legitimacy Audit (`05-RESEARCH.md:93-104`): `vitest`, `vite-tsconfig-paths`, `@vitejs/plugin-react` all Approved; `postinstall: null` for all three (VERIFIED via package-legitimacy seam); vitest `too-new` flag documented as false positive (canonical runner, 70M dl/wk, official repo). Pinned with `^` (not exact) in `package.json:44,50,51`: `@vitejs/plugin-react@^5.2.0` (NOT ^6 — peer-conflict avoided), `vite-tsconfig-paths@^5.1.4`, `vitest@^4.1.9`. No human checkpoint required, as planned. |

## Threat Verification — 05-02-PLAN (isolation + CI)

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-05-05 | Information Disclosure (test-validity) — assertion via service-role (Pitfall 12, THE trap) | mitigate | CLOSED | `createAdminClient` is ABSENT from `test/isolation.test.ts` entirely (grep). Assertions run via `anonA` (anon-key, `signInWithPassword`'d): lines 71, 81-87, 103-108. `seeded.admin` (service-role) appears only at line 91 as a POST-assertion data-integrity check, after the RLS assertion at line 87 already ran with anon. Anti-false-green GUARD present (lines 45-59): (a) both anon sessions must hold `access_token` (a service-role client produces none via signIn); (b) `anonKey !== SUPABASE_SERVICE_ROLE_KEY` — throws loudly in `beforeAll` before any assertion. |
| T-05-06 | Tampering (test-validity) — `.eq('business_id')` in assertion query | mitigate | CLOSED | No `.eq('business_id'` in any assertion query (grep + manual read). cross-READ does `anonA.from('appointments').select('id')` with NO business_id filter: line 71. cross-WRITE targets B's row by `.eq('id', seeded.apptB)` (by row id, not business_id): line 84. RLS is the denier, not a WHERE clause. Comment at lines 69-70 documents the deliberate omission. |
| T-05-07 | Tampering (test-validity) — cross-write via INSERT on public-insert tables | mitigate | CLOSED | cross-WRITE uses UPDATE of B's existing appointment (lines 81-87), NOT INSERT — `appointments`/`clients` have `public insert WITH CHECK(true)` (booking) so an anon INSERT passes by design (Pitfall 6). cross-INSERT denial is tested on `services` (lines 103-108), which has no public-insert policy. Both runtime tests pass against the real DB. |
| T-05-08 | Information Disclosure — fixtures leak after a failure | mitigate | CLOSED | `teardown()` in try/finally: deletes both businesses (CASCADE) then `auth.admin.deleteUser` for both users in `finally` — runs even if a delete throws: `test/helpers/supabase-fixtures.ts:100-111`. Unique per-run prefix `__test_<uuid8>` avoids cross-run collision on the unique slug/email: line 45. `afterAll` invokes teardown: `isolation.test.ts:62-65`. |
| T-05-09 | Spoofing (operational CI) — Supabase secrets absent in CI → false all-green | accept | CLOSED | Accepted risk documented and operational mitigation in place: `describe.skipIf(!hasSupabaseCreds)` (`isolation.test.ts:22`) skips cleanly (not error-skip) when creds missing; `test/env.ts:17-22` emits a non-silent `console.warn` so the skip is visible; webhook tests always run. CI injects 4 secrets as `env` (`.github/workflows/test.yml:31-37`); operational note to load GitHub repo secrets recorded in `05-02-SUMMARY.md`. Skip is graceful by design (D-03), not a silent pass. See Accepted Risks below. |

---

## Accepted Risks Log

- **T-05-09 (Spoofing, operational CI):** When Supabase repo secrets are not loaded (e.g. a
  PR from a fork where GitHub does not expose secrets), the isolation tests skip via
  `describe.skipIf(!hasSupabaseCreds)` and CI still passes on the webhook tests alone. This
  is accepted per D-03: the skip is non-silent (`console.warn` from `test/env.ts`), the
  workflow injects the 4 secrets when available (`test.yml`), and the operational step to
  load `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `MP_WEBHOOK_SECRET` into GitHub repo secrets is documented in
  `05-02-SUMMARY.md`. Residual risk: a fork PR could report green without exercising
  isolation — mitigated operationally, not in code, and bounded (webhook coverage always
  runs; main-branch pushes with secrets do exercise isolation).

---

## Runtime Evidence (this audit)

`npx vitest run` (with real `.env.local` creds present):

```
Test Files  3 passed (3)
     Tests  10 passed (10)
  Duration  2.34s
```

- 7 webhook tests pass (signature fail-closed + under-payment) with no network.
- 3 isolation tests pass against the dev Supabase project — cross-READ (0 rows of B),
  cross-WRITE UPDATE (denied, data intact), cross-INSERT on `services` (denied). The RLS
  control is exercised at runtime, stronger than the static/skip evidence in the SUMMARY.
- No live MercadoPago call (no MP host in `test/`; mocks asserted as the caller).

---

## Unregistered Flags

None. Neither SUMMARY has a `## Threat Flags` section. No new attack surface appeared
during implementation that lacks a threat mapping. The migration-029 fix referenced in the
phase context (a real cross-tenant read hole, fixed in commit `d728883`) was an existing
production-policy gap CAUGHT by this phase's isolation test — it is the test control
working as intended, not new attack surface introduced by the test code, and lives outside
the Phase 5 implementation files (a DB migration, not a test artifact).

---

## Constraints Compliance

- (a) No `createAdminClient` / service_role in isolation ASSERTION code — VERIFIED
  (`createAdminClient` absent from `isolation.test.ts`; `seeded.admin` used only as
  post-assertion integrity check; assertions exclusively via `anonA`).
- (b) No live MP calls — VERIFIED (no `mercadopago.com` in `test/`; `global.fetch` + `mpFetch`
  mocked; mock asserted as caller).
- (c) Anti-false-green guard present — VERIFIED (`isolation.test.ts:45-59`, dual guard).
- Implementation files were NOT modified (read-only audit; only this SECURITY.md written).
