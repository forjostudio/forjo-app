---
phase: 03-admin-endpoint-hardening
audit_type: secure-phase (verify mode)
asvs_level: 1
block_on: high
threats_total: 6
threats_closed: 6
threats_open: 0
status: SECURED
audited: 2026-06-16
auditor: gsd-security-auditor
---

# Phase 3: Admin Endpoint Hardening — Security Audit (SEC-03)

**Mode:** VERIFY (`register_authored_at_plan_time: true`) — confirm each declared mitigation is present in implemented code. No blind scan for new threats. No implementation files modified.

**Result:** SECURED — 6/6 threats resolved (4 mitigated + verified, 2 accepted + verified). No blockers under `block_on: high`.

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence (file:line) |
|-----------|----------|-------------|--------|----------------------|
| T-03-01 | Information Disclosure (timing side-channel on admin compare) | mitigate | CLOSED | `app/api/admin/set-plan/route.ts:18-20` — `crypto.createHash('sha256').update(provided).digest()` + `...update(expected).digest()` then `crypto.timingSafeEqual(a, b)`. Independent grep for `secret (===\|!==\|==)` and any direct comparison against `ADMIN_SECRET` in the route → 0 matches. The only `ADMIN_SECRET` reference in `app/` is the timing-safe helper call at line 27. |
| T-03-02 | Information Disclosure (secret in query-string / logs / Referer) | mitigate | CLOSED | `app/api/admin/setup-plans/route.ts` AND the `setup-plans/` directory confirmed non-existent (`ls` errors; only `set-plan/` remains under `app/api/admin/`). Deleted in commit `156bf89`. Grep for `searchParams` / `nextUrl` / `?secret=` / `.get('secret')` across `app/api/admin` → 0 matches. `set-plan` reads the secret exclusively from `request.headers.get('x-admin-secret')` (`set-plan/route.ts:26`). |
| T-03-03 | Denial of Service (`timingSafeEqual` RangeError on length mismatch → 500) | mitigate | CLOSED | `set-plan/route.ts:18-19` — both inputs hashed to fixed 32-byte SHA-256 buffers before `timingSafeEqual`, so unequal string lengths never reach the comparator. `:17` null/empty guard returns `false` before any hash/compare. Failure path returns `Response.json({ error: 'Unauthorized' }, { status: 401 })` (`:28`) — never 500. |
| T-03-04 | Spoofing (missing / empty `x-admin-secret`) | mitigate | CLOSED | `set-plan/route.ts:17` — `if (!provided \|\| !expected) return false` fires before `timingSafeEqual`; absent or empty header → 401 at `:28`. |
| T-03-05 | Elevation of Privilege (Edge runtime would lose sync `crypto`) | accept | CLOSED | No `export const runtime = 'edge'` (or any `runtime` override) in `set-plan/route.ts` → stays Node default. `import crypto from 'crypto'` (`:1`) is the Node builtin. Accepted-risk disposition documented; verified the runtime was NOT changed. See Accepted Risks Log below. |
| T-03-SC | Tampering (supply-chain: install of `tsx`) | accept | CLOSED | `package.json:45` — `"tsx": "^4"` present in `devDependencies` only (NOT in `dependencies`), so it does not enter the production bundle/runtime. `setup:mp-plans` script at `:10` invokes it for local-only use. Accepted-risk disposition documented. See Accepted Risks Log below. |

**Score:** 6/6 closed. 0 open.

## Supporting Verification (non-threat success criteria)

| Check | Status | Evidence |
|-------|--------|----------|
| Local script reuses lib, no web auth | PASS | `scripts/setup-mp-plans.ts:18-19` imports `mpFetch`/`MP_MODE` (`lib/mercadopago.ts:167`, `:8`) and `SUBSCRIPTION_PLANS` (`lib/subscription-plans.ts:3`). No `ADMIN_SECRET`, no `x-admin-secret`, no query-string read. POSTs `/preapproval_plan` (`:33`); respects `MP_MODE`/`_TEST` suffix (`:22`). No DB writes / no `plan_status`. |
| Stripe vestigial comment removed (D-03) | PASS | Grep for `Stripe` in `set-plan/route.ts` → 0 matches. Header comment is Spanish, explains timing-safe rationale (`:9-15, :24-25`). |
| Runner wiring | PASS | `package.json:10` `"setup:mp-plans": "tsx scripts/setup-mp-plans.ts"`; `:45` `"tsx": "^4"` devDep; valid JSON. |

## Accepted Risks Log

- **T-03-05 — EoP via Edge runtime regression (accepted).** Moving the admin handlers to Edge runtime would drop access to synchronous Node `crypto` (`createHash`/`timingSafeEqual`), breaking the timing-safe compare. Disposition: keep handlers on the Node runtime (no `runtime` override present). RESEARCH (`STACK.md`) explicitly warns against an Edge move. Verified: runtime unchanged this phase. Residual risk owner: future maintainers must not add `export const runtime = 'edge'` to `app/api/admin/**` without re-introducing a constant-time compare compatible with the target runtime.
- **T-03-SC — Supply-chain: `tsx` devDependency (accepted).** `tsx` is a widely-used local TypeScript runner (esbuild ecosystem). It is a devDependency, never bundled into production, and `npm install` is not run in CI for this phase — the operator installs it locally only when running `npm run setup:mp-plans`. No new runtime dependencies were added. Verified: `tsx` present in `devDependencies` only.

## Unregistered Flags

None. SUMMARY.md exposes a `## Threat Mitigations Applied` section (T-03-01..05, all mapped to the register) and no `## Threat Flags` section. No new attack surface appeared during implementation that lacks a threat mapping. The deletion of `setup-plans` removed surface rather than adding it.

## Implementation Files Reviewed (read-only)

- `app/api/admin/set-plan/route.ts`
- `scripts/setup-mp-plans.ts`
- `package.json`
- `lib/mercadopago.ts` (import-target confirmation)
- `lib/subscription-plans.ts` (import-target confirmation)
- Confirmed deleted: `app/api/admin/setup-plans/route.ts` (and its directory)

No implementation files were modified by this audit.
