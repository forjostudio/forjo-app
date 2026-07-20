---
phase: "01"
phase_name: "Detección y estado de conexión caída"
workstream: mp-connect
milestone: v0.23
status: secured
result: SECURED
asvs_level: 1
block_on: high
threats_total: 13
threats_closed: 13
threats_open: 0
audited: 2026-07-19
---

# SECURITY.md — Phase 1: Detección y estado de conexión caída (mp-connect, v0.23)

**Workstream:** mp-connect
**Phase:** 01 — Detección y estado de conexión caída (Resiliencia de MercadoPago Connect)
**Audited:** 2026-07-19
**ASVS Level:** 1
**block_on:** high
**Result:** SECURED — 13/13 threats resolved (12 mitigate CLOSED + 1 accept documented)
**threats_open:** 0

Verification method: each threat verified against the *implemented code* (file:line), not
documentation or intent. Threat register authored at plan-time in both PLAN.md
`<threat_model>` blocks (STRIDE). No new-vulnerability scan performed (out of scope).

---

## Threat Verification — PLAN 01-01

| Threat ID | Category | Disposition | Status | Evidence (file:line) |
|-----------|----------|-------------|--------|----------------------|
| T-01-01 | Tampering/Elevation | mitigate | CLOSED | `lib/mp-connection.ts:16-26` — `setMpConnectionStatus(businessId, status)` → `.update({ mp_connection_status: status }).eq('id', businessId)`. All three write callers pass a server-resolved id: `lib/payment.ts:55`, `:74`, `:78`, `:157` (`business.id`); callback uses owner-scope (`callback/route.ts:53`). Never accepts a client-supplied id (D-09). Test: `test/mp-connection.test.ts` asserts keyed-by-id. |
| T-01-02 | Information disclosure | mitigate | CLOSED | `lib/mp-connection.ts:27-30` — `console.error` logs only `businessId` + `e instanceof Error ? e.message : e`. No token/secret value. |
| T-01-03 | Elevation of privilege | mitigate | CLOSED | `lib/mp-connection.ts:1-11` server-only header + `createAdminClient()` (service-role). Import graph (grep): consumed only by `lib/payment.ts` (server module) and test files — NOT from any client component, `lib/supabase/public.ts`, or `server.ts`. Not in `NEXT_PUBLIC_*`. |
| T-01-04 | Information disclosure | mitigate | CLOSED | `supabase/migrations/053_mp_connection_status.sql:33-34` — sole DDL is `ALTER TABLE "public"."businesses" ADD COLUMN IF NOT EXISTS "mp_connection_status" ...`. No reference to `public_businesses` in DDL and no view is altered; column stays internal to `businesses` (anon reads only the bounded public view). |
| T-01-05 | Tampering | mitigate | CLOSED | `053_mp_connection_status.sql:33-34` — single additive `ADD COLUMN IF NOT EXISTS` (idempotent). No `CREATE POLICY` / `ALTER POLICY` / RLS change. |
| T-01-SC | Tampering (supply chain) | accept | DOCUMENTED | See Accepted Risks Log below. No new npm packages (both SUMMARY `tech-stack.added: []`; no `package.json`/lockfile in files_modified). |

## Threat Verification — PLAN 01-02

| Threat ID | Category | Disposition | Status | Evidence (file:line) |
|-----------|----------|-------------|--------|----------------------|
| T-01-06 | Tampering | mitigate | CLOSED | `lib/payment.ts:61-76` — `const { error: persistErr } = await supabase.from('business_secrets').update({...}).eq('business_id', business.id)`; on `persistErr` → `setMpConnectionStatus(business.id, 'error')` + `return null`. The single-use rotated refresh is never returned as if the charge could proceed (MPCONN-02). |
| T-01-07 | Repudiation | mitigate | CLOSED | Every failure branch logs the real reason server-side: refresh rejected `payment.ts:54`; persist-fail `payment.ts:73`; 401 on charge `payment.ts:156`. No mute failure (MPCONN-06). |
| T-01-08 | Information disclosure | mitigate | CLOSED | `payment.ts:54`, `:73`, `:79`, `:156` — logs carry `business.id` + reason only; no token/refresh value. |
| T-01-09 | Tampering/Elevation | mitigate | CLOSED | `app/api/mercadopago/callback/route.ts:24` uses the session client (`createClient` from `@/lib/supabase/server`, RLS active); heal write `:47-53` is `.update({ mp_user_id, mp_connection_status: 'connected' }).eq('owner_id', user.id)` — owner-scoped, cannot heal another tenant (MPCONN-05). |
| T-01-10 | Denial of service | mitigate | CLOSED | `payment.ts:46` manual-token early return (`if (!business.mp_refresh_token) return current`) and `:48` healthy-token early return (`expMs > Date.now() + 24h`) — neither refreshes nor writes the flag. Zero regression on healthy charges. Tests cover both paths. |
| T-01-11 | Tampering | mitigate | CLOSED | `payment.ts:157` — `setMpConnectionStatus(business.id, 'error')` uses the already-resolved `BusinessForDeposit.id`, not a client-supplied id (D-09). The 401 branch marks the correct business. |
| T-01-SC | Tampering (supply chain) | accept | DOCUMENTED | Same as PLAN 01-01. See Accepted Risks Log. |

---

## Accepted Risks Log

| Threat ID | Category | Rationale | Verification |
|-----------|----------|-----------|--------------|
| T-01-SC | Tampering (supply chain) | Phase 1 introduces no new npm dependencies — only a DB column, a server-only helper, and edits to existing modules using libraries already present. No new supply-chain surface. | Both SUMMARY declare `tech-stack.added: []` (01-01 line 18, 01-02 line 20); neither phase lists `package.json`/`package-lock.json` in `files_modified`. Accepted as no residual risk. |

---

## Unregistered Flags

None. Neither `01-01-SUMMARY.md` nor `01-02-SUMMARY.md` contains a `## Threat Flags`
section declaring new attack surface. `01-02-SUMMARY.md` has a `## Threat Model
Compliance` section, but every entry maps to an existing registered threat ID
(T-01-06..11) — informational, not a new flag.

---

## Tenant-Isolation & Payment-Integrity Focus (most sensitive)

- **Cross-tenant on the flag (write):** all three write paths key by a server-resolved
  id — `setMpConnectionStatus` filters `.eq('id', businessId)` and every caller passes
  `business.id` resolved server-side; the OAuth callback writes with the session client
  scoped by `.eq('owner_id', user.id)`. No client-supplied id reaches any write. VERIFIED.
- **Payment integrity — single-use refresh:** on refresh reject (`payment.ts:51-57`) and
  on persist-fail of the rotated token (`payment.ts:69-76`) the resolver returns `null`
  and marks `'error'`; it never returns an expired/unpersisted token. The mute fallback
  is closed. VERIFIED.
- **Payment integrity — revoked token:** a 401 from `/checkout/preferences`
  (`payment.ts:155-159`) marks the connection down and logs the real reason. VERIFIED.

---

## Environmental Note (not a threat gap)

Migration `053_mp_connection_status.sql` is **not applied to any database** (local Docker
down; prod pending manual apply before deploy — D-02). This is expected per the phase's
deploy ordering and does not affect any threat disposition: threat verification is against
the migration **file**, which was audited. Operational reminder (from 01-01-SUMMARY): if the
column is absent in prod, flag writes fail best-effort (`console.error`, no re-throw) — the
charge does not break, but the connection state will not persist until 053 is applied.

---

*Auditor: gsd-security-auditor · ASVS L1 · block_on=high · threats_open=0*
