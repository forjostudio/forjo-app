---
phase: 01-rls-lockdown-secret-isolation
requirement: SEC-01
audited: 2026-06-16
auditor: gsd-security-auditor
asvs_level: 1
block_on: high
threats_total: 19
threats_closed: 19
threats_open: 0
status: secured
---

# Security Audit — Phase 1: RLS Lockdown + Secret Isolation (SEC-01)

**Audited:** 2026-06-16
**Auditor:** gsd-security-auditor (VERIFY MODE — register authored at plan time)
**ASVS Level:** 1 | **block_on:** high
**Result:** SECURED — 19/19 threats closed (18 STRIDE + T-01-SC)

Scope: verify each declared mitigation in the 5 PLAN `<threat_model>` blocks is present in the
implemented code. Implementation files were NOT modified. DB-state conclusions rest on the
migration files (027 additive, 028 destructive) plus the user-confirmed live evidence
(as `anon`: base `services`/`business_hours` return 0 rows, `public_services` returns rows,
the 7 secret columns dropped from `businesses`).

---

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence (file:line) |
|-----------|----------|-------------|--------|----------------------|
| T-01-01 | Information Disclosure | mitigate | CLOSED | `supabase/migrations/027_...sql:41` RLS ENABLE; `:53-57` single owner-only policy `business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())`; zero anon policy. Confirmed live (anon denied). |
| T-01-02 | Information Disclosure (cross-tenant) | mitigate | CLOSED | Policy filters by owner_id (027:55-56). Service-role reads always `.eq('business_id', businessId)`: `lib/business-secrets.ts:41`; cron per-business Map `cancel-expired/route.ts:42-49`. |
| T-01-03 | Information Disclosure (view config) | mitigate | CLOSED | `027:80-94` `public_services` and `:102-111` `public_business_hours` — no `WITH (security_invoker)`; expose only non-sensitive columns. |
| T-01-04 | Tampering (data copy) | accept | CLOSED | `027:63-71` `INSERT ... ON CONFLICT (business_id) DO NOTHING` (idempotent, non-overwriting). Documented as accepted low risk in plan 01-01; double-net during transition. |
| T-01-05 | DoS of payments (webhook select('*')) | mitigate | CLOSED | `payment/webhook/[slug]/route.ts:46-50` explicit non-secret columns (no `select('*')`); `:58` `getBusinessSecrets`; `:62` guard on `secrets.mp_access_token`. |
| T-01-06 | Information Disclosure (select('*') leaks token) | mitigate | CLOSED | Webhook + `payment/create/route.ts:26,45` + `payment/retry/[token]/route.ts:19,43,51` use explicit selects + separate `getBusinessSecrets`. No `select('*')`/`businesses(*)` carrying secrets (grep: 0 hits). |
| T-01-07 | Tampering (rotated token write) | mitigate | CLOSED | `lib/payment.ts:54-61` rotated MP tokens `.from('business_secrets').update(...).eq('business_id', ...)`. No `businesses.update({...secret...})` anywhere (multiline grep: 0 hits). |
| T-01-08 | Information Disclosure (nested join leaks) | mitigate | CLOSED | Joins scoped to non-secret cols: `cancel/[token]:22`, `cron/cancel-expired:20`, `notify/booking:18`, `notify/cancel:43`, `payment/retry:19`. Secrets via separate `getBusinessSecrets` (Pitfall E). |
| T-01-09 | DoS of notifications (undefined post-drop) | mitigate | CLOSED | Repointed to `getBusinessSecrets` with best-effort try/catch preserved: `cancel-expired:46,57-74`, `cancel/[token]:67-72`, `notify/*`. Deployed before drop (028 gated). |
| T-01-10 | Information Disclosure (recaptcha repoint) | accept | CLOSED | `lib/recaptcha.ts:29-30` reads `recaptcha_secret_key` via `getBusinessSecrets`; fail-open preserved `:35-37`; fail-closed `:41-67`; secret never returned to client. Behavior documented as accepted. |
| T-01-11 | Information Disclosure (anon reads base services) | mitigate | CLOSED | `app/[slug]/page.tsx:37` reads `public_services`; no `.from('services')` with anon/public client (grep: 0 hits). `028:36` DROP POLICY closes base table. Confirmed live (anon 0 rows). |
| T-01-12 | Elevation of Privilege (owner save fails) | mitigate | CLOSED | `settings-client.tsx:614,652,669` session-client `.from('business_secrets').upsert(...)` authorized by owner-only policy (Pitfall F). |
| T-01-13 | Information Disclosure (raw token to client) | mitigate | CLOSED | `agenda/page.tsx:49` `googleConnected={!!secrets.google_refresh_token}` (boolean). Raw values only in owner's own settings edit form (`settings-client.tsx:561,589-601`). |
| T-01-14 | Tampering (owner write to old table) | mitigate | CLOSED | `mercadopago/callback:55-62`, `mercadopago/disconnect:27`, `google/callback:40-42`, `google/disconnect:27`, settings — all upsert to `business_secrets`. `mp_user_id` stays in businesses (`mp/callback:44-47`). |
| T-01-15 | Information Disclosure (wrong policy name) | mitigate | CLOSED | `028:36` `DROP POLICY IF EXISTS "public read services" ON services`; `:46` `"public read hours" ON business_hours`. No `"public read business_hours"` (grep: 0 hits). |
| T-01-16 | Information Disclosure (028 before code live) | mitigate | CLOSED | `01-05-PLAN.md` `checkpoint:human-verify` BLOCKING smoke test gated 028; user honored it (`01-05-SUMMARY.md:21-24`, `01-VERIFICATION.md:94`). |
| T-01-17 | Information Disclosure (secrets stay in businesses) | mitigate | CLOSED | `028:55-61` 7× `ALTER TABLE businesses DROP COLUMN IF EXISTS`. Confirmed live (columns gone). |
| T-01-18 | Post-exposure (leaked keys still valid) | transfer | CLOSED | `ROTATION-RUNBOOK.md` documents rotation of MP/Google/Resend/reCAPTCHA per-tenant + ADMIN_SECRET/CRON_SECRET with regen/update/verify per key. Operational action transferred to user; documented. |
| T-01-SC | Tampering (npm installs) | accept | CLOSED | No package installs this phase (`tech-stack.added: []` in all 5 SUMMARYs). No legitimacy gate applies. |

---

## Defense-in-depth confirmations (beyond per-threat checks)

- `lib/business-secrets.ts` is service-role only (`createAdminClient`, no `'use client'`), reads
  only `business_secrets`, no `businesses` fallback (removed in commit `d53fed0`), returns EMPTY
  when no row — matches plan 01-05 Task 2. The fallback shim no longer exists.
- No client component imports the `getBusinessSecrets` function. Only `agenda/page.tsx` and
  `settings/page.tsx` (both server components) import it; `settings-client.tsx` imports only the
  `BusinessSecrets` *type* and receives values as a prop from its server page.
- `lib/types.ts` Business interface declares none of the 7 secret fields (lines 25-29 document the
  split); `BusinessSecrets` re-exported at line 95; `mp_user_id` / `recaptcha_site_key` /
  `notification_email` correctly retained as non-secrets.

---

## Unregistered Flags

None. No SUMMARY.md contains a `## Threat Flags` section; no new attack surface was reported
during implementation that lacks a threat mapping. The INFO-level anti-patterns noted in
`01-VERIFICATION.md` (stale "fallback" comments; `select('*')` on businesses via service-role or
authenticated owner session in dashboard/layout paths) were reviewed and are not exploitable via
the `anon` key post-028 (secret columns no longer exist; those clients are not anon). They are
non-blocking and do not constitute new unregistered attack surface.

---

## Accepted Risks Log

| Threat ID | Risk | Rationale |
|-----------|------|-----------|
| T-01-04 | Idempotent data copy could in theory skip an already-migrated row | `ON CONFLICT DO NOTHING` never overwrites; values also remained in businesses until 028 (double-net). Severity: low. |
| T-01-10 | reCAPTCHA repoint could turn fail-open into exposure/breakage | Fail-open/fail-closed behavior preserved verbatim; secret never sent to client. Severity: low. |
| T-01-SC | Supply-chain via npm installs | No installs this phase. |

---

## Verdict

All 19 threats resolve to CLOSED. No declared mitigation is absent from the implementation. No
high-severity gap remains; per `block_on: high` the phase has no blockers. SEC-01 is satisfied on
the code side; T-01-18 rotation is an operational action documented in the runbook and marked
done for the per-tenant keys (ADMIN_SECRET/CRON_SECRET pending per the runbook checklist).
