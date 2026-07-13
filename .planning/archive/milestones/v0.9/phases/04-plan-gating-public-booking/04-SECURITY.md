---
phase: 04-plan-gating-public-booking
audited: 2026-06-17
auditor: gsd-security-auditor
asvs_level: 1
block_on: high
threats_total: 5
threats_closed: 5
threats_open: 0
status: SECURED
---

# Phase 4 — Plan Gating on Public Booking (SEC-04): Security Audit

**Mode:** VERIFY (register authored at plan time). Each declared mitigation confirmed present in implemented code — documentation/intent not accepted as evidence.

**Scope of change:** commit `d728373` — single file `app/api/booking/create/route.ts` (12 insertions, 1 deletion). No migration, no new dependencies, no config changes.

**Result:** 5/5 threats resolved. 0 open. No unregistered flags. Phase clears the `block_on: high` gate.

---

## Threat Verification

| Threat ID | Category | Disposition | Result | Evidence (file:line) |
|-----------|----------|-------------|--------|----------------------|
| T-04-01 | Elevation of Privilege | mitigate | CLOSED | `app/api/booking/create/route.ts:63-65` — `if (['expired', 'cancelled'].includes(business.plan_status)) { return Response.json({ ok: false, error: 'plan_inactive' }, { status: 403 }) }`. Early-return sits immediately after `if (!business)` (line 54) and BEFORE reCAPTCHA (line 75), service re-validation (line 83) and slot/availability re-check (line 113). A negocio `expired`/`cancelled` is rejected before any insert path is reachable. |
| T-04-02 | Denial of Service (self-inflicted / over-block) | mitigate | CLOSED | `app/api/booking/create/route.ts:63` — blocklist is a literal two-element array `['expired', 'cancelled']` evaluated with `.includes(business.plan_status)`. Grep over the whole handler for `!== 'active'` / `!= 'active'` returns NO matches: no allowlist form exists anywhere. `trial`, `active`, `null`, `undefined` and any legacy/unknown string evaluate to `false` and fall through (Pitfall 11 mitigation, deliberately avoided anti-pattern). |
| T-04-03 | Tampering | mitigate | CLOSED | `app/api/booking/create/route.ts:51` — `plan_status` is appended to the existing `.select(...)` of the by-slug lookup, executed at line 49 via `supabase = createAdminClient()` (line 45 — service-role, server-trusted, bypasses RLS). Source is the `businesses` table by `slug`, never a client input nor an anon/public view. The gate consumes `business.plan_status` (line 63) from that same object reference — single query, no extra round-trip (key-link WIRED). |
| T-04-04 | Spoofing | accept | CLOSED | See Accepted Risks Log below. Pre-existing anti-tampering pattern, unchanged this phase: `slug` is re-resolved server-side against `businesses` (line 49-54, `if (!business)` → 404) and downstream entities (service line 83-91, professional line 93-104) are re-validated with `.eq('business_id', business.id)`. |
| T-04-SC | Tampering (supply chain) | accept | CLOSED | See Accepted Risks Log below. `git show --stat d728373` confirms only `app/api/booking/create/route.ts` changed — no `package.json`, no `package-lock.json`, no `.sql` migration. The phase installs nothing; package-legitimacy gate does not apply. |

---

## Accepted Risks Log

### T-04-04 — Spoofing: tenant resolution by client-supplied `slug`
The `slug` arrives in the untrusted request body, but the tenant is re-resolved server-side against `businesses` (`if (!business)` → 404), and every referenced entity (service, professional) is re-validated by `business_id` downstream. This is a pre-existing anti-tampering pattern; Phase 4 introduces no change to it. Accepted: no new attack surface added by this phase.

### T-04-SC — Supply chain: package installs
This phase installs no packages (no migration, no new dependencies; it edits one existing handler). Confirmed via `git show --stat d728373` (only `route.ts` modified). Accepted: package-legitimacy verification is not applicable to this change set.

---

## Unregistered Flags

None. `04-01-SUMMARY.md` declares `tech-stack.added: []` and `key-files.created: []`. No new attack surface appeared during implementation that lacks a threat mapping. The three threats SUMMARY records under "Threat Mitigations Applied" (T-04-01/02/03) all map to existing register IDs.

---

## Adversarial Notes

- **Blocklist completeness checked, not assumed.** Grepped the full handler for any allowlist construct (`!== 'active'`, `!= 'active'`) — zero matches. The only plan-status branch in the file is the two-element blocklist at line 63. The starting hypothesis (an allowlist might leak in) is disproven by the grep.
- **Gate placement verified by reading actual call order**, not by trusting the comment: reCAPTCHA (75), service (83), professional (96), slot (113) all execute strictly after the gate (63-65). No insert is reachable for a blocked business.
- **Source of `plan_status` traced to service-role**: `createAdminClient()` at line 45, select at line 51, consumed at line 63 — no client-controlled or anon-view path feeds the gate value.

---

_Audited 2026-06-17 by gsd-security-auditor. Implementation files unmodified (read-only)._
