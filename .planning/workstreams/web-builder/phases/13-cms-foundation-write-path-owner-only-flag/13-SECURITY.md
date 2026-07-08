---
phase: 13-cms-foundation-write-path-owner-only-flag
audited: 2026-07-08
auditor: gsd-security-auditor
asvs_level: 1
block_on: high
threats_total: 7
threats_closed: 7
threats_open: 0
accepted_risks: 1
status: SECURED
---

# Phase 13: CMS Foundation — Write Path Owner-Only + Flag — Security Audit

Security-sensitive phase (touches the multi-tenant invariant / Core Value). The threat register
was authored at plan time (`register_authored_at_plan_time: true`). This audit VERIFIES each
declared mitigation exists in the shipped code — documentation and intent are not accepted as
evidence. Every claim below is backed by a file:line reference and, where possible, a live test run.

**Result: SECURED — 7/7 threats resolved (6 mitigated + verified, 1 accepted; 0 open).**

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-13-01 | Tampering / Elevation (cross-tenant write via body `business_id`) | mitigate | CLOSED | `_landing-actions.ts:55-59` resolves the tenant via `.eq('owner_id', user.id).single()`; `:73` update uses `.eq('id', business.id)`. Grep: `business_id`/`input.business`/`businessId` appear ONLY in comments (lines 18-19, 54) — never in an executable `.eq()`. RLS `owner access` (baseline.sql:1310, `USING (owner_id = auth.uid())`) is the DB backstop. **Live test:** `test/isolation.test.ts:117-136` — `anonB` targeting `bizA` denied (ran green against real DB, anon-key). |
| T-13-02 | Elevation of Privilege (service-role on web write surface) | mitigate | CLOSED | Grep `createAdminClient\|supabase/admin` in `_landing-actions.ts` = 0 executable (2 hits are comments at lines 14, 45). Only import is `createClient` from `@/lib/supabase/server` (`:3`, `:46`) — session client (anon + cookies, RLS active). **Live:** `npx tsc --noEmit` exits 0. |
| T-13-03 | Tampering / Info Disclosure (unknown-field injection / re-open v0.9 secret leak) | mitigate | CLOSED | `write.ts:23` `landingConfigSchema.safeParse`; only `r.data` is written. `schema.ts:39` is a plain `z.object` — grep confirms NO `.passthrough`/`.catchall`/`.strict` in executable code (Zod v4 strips unknowns by default). **Live tests:** `write.test.ts` case (2) — `'evil' in data === false` && `'__secret' in data === false` (green). `isolation.test.ts` D-10b/c — `mp_access_token` still absent from `public_businesses` view (green). |
| T-13-04 | Info Disclosure / Elevation (CMS exposed without flag) | mitigate | CLOSED | `_landing-actions.ts:33` `const CMS_ENABLED = process.env.CMS_ENABLED === 'true'` (exact-string, fail-closed; grep count 1). `:39` `if (!CMS_ENABLED) return { ok: false, error: 'cms_disabled' }` is the FIRST statement inside the action — before `createClient()`, `getUser`, or any DB effect. No `page.tsx` / nav under `app/(dashboard)/web/` (route-less; VERIFICATION.md confirms no importer of `saveLandingConfig` exists outside the file). |
| T-13-05 | Tampering / data integrity (invalid config corrupts owner save) | mitigate | CLOSED | `write.ts:20-25` reject-on-invalid: `r.success ? {ok,data} : {ok:false, error:'invalid_config'}` — NEVER coerces to `DEFAULT_LANDING_CONFIG` (distinct from `parseLandingConfig`, which is render-only). `_landing-actions.ts:63-64` early-returns before `.update`. **Live tests:** `write.test.ts` cases (1)+(5) — invalid input returns `ok:false`, no `data`, does NOT match `DEFAULT_LANDING_CONFIG` (green). |
| T-13-06 | Test integrity (false-green isolation via service-role in assertion) | mitigate | CLOSED | `isolation.test.ts:29-60` GUARD in `beforeAll` asserts each anon session has an `access_token` AND `anonKey !== SUPABASE_SERVICE_ROLE_KEY` (throws loudly otherwise). New SC2 `it`s (`:117-156`) use `anonA`/`anonB` in the `.update` assertion; `seeded.admin` appears ONLY in the independent effect-check (`:130`, `:150`). Multiline grep for `seeded.admin ... .from('businesses') ... .update` inside any `it` = 0 matches. **Live:** GUARD did not trip on the real-DB run (8/8 green), proving assertions used genuine anon-key. |
| T-13-SC | Tampering (supply chain — npm/pip/cargo installs) | accept | CLOSED | No packages installed this phase. `13-01-SUMMARY.md tech-stack.added: []`; PLAN `<artifacts_produced>` states "sin dependencia nueva". No supply-chain surface introduced. Accepted risk logged below. |

**Behavioral evidence (run during this audit, not taken on faith):**
- `npx vitest run lib/landing/write.test.ts` → 5 passed (validator: reject-no-default, strip-unknowns, valid-passes, motion-broken→undefined, invalid-no-corrupt).
- `npx vitest run test/isolation.test.ts` → 8 passed against a real Supabase DB with anon-key (cross-write denied, same-tenant write permitted, D-10a/b/c). GUARD did not trip.
- `npx tsc --noEmit` → exit 0.
- HEAD of `_landing-actions.ts` = commit `aed6389` (WR-01 rows-affected check + WR-03 try/catch) — confirmed the audited code is the hardened post-review version.

## Accepted Risks

### AR-13-01 — Owner can write their OWN `landing_config` via direct anon-key, bypassing the Server Action's Zod validation

- **Disposition:** ACCEPT (documented, same-tenant only, matches existing production trust model).
- **Origin:** RLS `owner access` policy on `businesses` is `FOR ALL` with `USING (owner_id = auth.uid())` (baseline.sql:1310). The Server Action `saveLandingConfig` adds non-bypassable Zod validation on the OFFICIAL product path only; it is not a DB-level per-column lockdown.
- **Why it is NOT an open threat:**
  1. **Cross-tenant isolation intact.** The same `owner_id = auth.uid()` clause that lets the owner write their own row DENIES writing another tenant's row. Proven green by SC2 (`isolation.test.ts:117-136`, real DB, anon-key). B cannot write A's `landing_config` — the Core Value holds.
  2. **No privilege escalation via the direct path.** The `businesses_protect_admin_columns` BEFORE-UPDATE trigger (baseline.sql:55-71, 897) reverts `has_web_custom` / `has_whatsapp` / `plan` / `plan_status` for any non-service-role update. A raw browser-direct UPDATE cannot elevate plan or features by tampering with the payload.
  3. **No secret re-leak.** The `public_businesses` view is column-scoped; secrets remain structurally absent even after adding `landing_config` (D-10b/c green). An owner writing an unvalidated blob into their own `landing_config` only affects their own render.
  4. **Render path is fail-safe.** `parseLandingConfig` (render contract) coerces a malformed config to `DEFAULT_LANDING_CONFIG` with per-field `.catch`, so a self-corrupted config degrades only the owner's own landing — no 500, no cross-tenant impact.
  5. **Identical to an existing production trust model.** Owners already write `theme`/`palette` on their own `businesses` row via anon-key from `settings-client.tsx`. This introduces no new class of exposure.
- **Deferred hardening:** Per-column DB lockdown (RESEARCH Focus 2) would close the browser-direct bypass. Explicitly deferred as scope creep — it yields zero cross-tenant isolation benefit and is not required for the Core Value. Re-evaluate only if `section.data` (currently `z.unknown()`, permissive per D-04 / IN-01) later carries security-relevant fields.
- **Residual risk:** LOW. Self-inflicted, same-tenant, no data exfiltration, no elevation.

## Unregistered Flags

None. `13-01-SUMMARY.md` `## Threat Flags` reports "None — no security surface introduced outside the plan's `<threat_model>`." Confirmed independently: zero new migration attributable to this phase (Phase 13 files are `lib/landing/write.ts`, `lib/landing/write.test.ts`, `app/(dashboard)/web/_landing-actions.ts`, `test/isolation.test.ts` — commits 207120e/549bf3d/4ab1bd6/aed6389; none touch `supabase/migrations/`), no new endpoint, no service-role path.

> NOTE (out of scope, informational): `supabase/migrations/045_landing_cms.sql` exists in the tree but is
> NOT part of Phase 13. It provisions `landing_content`/`landing_leads` for the **forjo.studio marketing
> site CMS** — a different subsystem from Phase 13's per-business `businesses.landing_config` column. Per
> MEMORY, it is the stray Landing-CMS commit (`e2ea5ce`) from a separate session, slated for independent
> closure. It does not fall under this phase's audit surface and does not affect the tenant-isolation
> verdict for the `landing_config` write path.

## Code-Review Cross-Check

`13-REVIEW.md` raised 0 critical, 3 warnings, 1 info. Security-relevant items resolved:
- **WR-01** (silent no-op / 0 rows → false success): FIXED in HEAD — `.select('id')` + `if (!updated || updated.length === 0) return { ok:false, error:'update_failed' }` (`_landing-actions.ts:74-76`).
- **WR-03** (unhandled throw breaks the `{ok,error}` contract): FIXED in HEAD — try/catch around all network effects returning `{ ok:false, error:'server_error' }` (`_landing-actions.ts:44-81`).
- **WR-02** (test ordering dependency) and **IN-01** (nested `section.data` not stripped): non-security / documentation-only; the `section.data` permissiveness is intentional (D-04) and same-tenant content-only — folded into AR-13-01's deferred-hardening note.

## Conclusion

All 7 register threats resolve: 6 `mitigate` threats verified present in the shipped code with
file:line + live-test evidence, and 1 `accept` (supply chain) confirmed N/A. The one documented
known limitation is assessed as an ACCEPTED same-tenant risk (AR-13-01), not an open threat — it does
not break cross-tenant isolation (SC2 green), cannot escalate privilege (admin-columns trigger), and
matches an existing production trust model. `block_on: high` is satisfied: zero high/critical open
threats.

**Phase 13 is SECURED.**
