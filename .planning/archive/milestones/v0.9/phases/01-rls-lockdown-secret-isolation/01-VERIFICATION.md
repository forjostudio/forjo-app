---
phase: 01-rls-lockdown-secret-isolation
verified: 2026-06-16T04:30:00Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 1: RLS Lockdown + Secret Isolation — Verification Report

**Phase Goal:** El rol `anon` no puede leer columnas sensibles de `businesses`, `services` ni `business_hours`; los datos públicos se exponen solo vía vistas acotadas; los secretos viven en `business_secrets` con RLS solo-dueño; todos los lectores server-side repuntados.
**Verified:** 2026-06-16T04:30:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (Success Criteria from ROADMAP)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `anon` no puede hacer SELECT de columnas sensibles directamente sobre `businesses`, `services` ni `business_hours` | VERIFIED | Migration 028: `DROP POLICY IF EXISTS "public read services" ON services` + `DROP POLICY IF EXISTS "public read hours" ON business_hours` (exact names from schema.sql:144/147). 7 secret columns dropped from `businesses` via `ALTER TABLE businesses DROP COLUMN IF EXISTS`. User-confirmed live: anon gets 0 rows from base services/business_hours; secret columns gone from businesses. |
| 2 | Los 5 secretos principales residen en `business_secrets`, legible solo por el dueño, no por `anon` | VERIFIED | Migration 027: `CREATE TABLE IF NOT EXISTS business_secrets` with `ALTER TABLE business_secrets ENABLE ROW LEVEL SECURITY` and a single owner-only policy. Zero anon policies on the table. `lib/business-secrets.ts` reads exclusively via `createAdminClient()` (service role). No public or browser client ever touches `business_secrets` (grep confirmed). |
| 3 | La página pública `/[slug]` sigue cargando desde vistas acotadas, no desde tablas base | VERIFIED | `app/[slug]/page.tsx` reads `public_businesses` (migration 026), `public_services` (migration 027), `public_professionals` (migration 007) — all via `createPublicServerClient()` (anon key). No `.from('services')` or `.from('business_hours')` with the public client exists anywhere in the slug route. |
| 4 | Todos los lectores de secretos leen de `business_secrets` y la app no rompe | VERIFIED | 25+ call sites of `getBusinessSecrets()` verified across: `lib/payment.ts`, `lib/recaptcha.ts`, `lib/email.ts`, `app/api/booking/create`, `app/api/cancel/[token]`, `app/api/cron/cancel-expired`, `app/api/notify/booking`, `app/api/notify/cancel`, `app/api/payment/webhook/[slug]`, `app/api/payment/create`, `app/api/payment/retry/[token]`, `app/api/google/sync`, `app/api/google/disconnect`, `app/(dashboard)/agenda/page.tsx`, `app/(dashboard)/settings/page.tsx`. Commit `d53fed0` removed the transitional fallback to `businesses` — `getBusinessSecrets()` now returns `EMPTY` if no row in `business_secrets`, no fallback. `npx tsc --noEmit` exits 0 (confirmed by plan 01-05 SUMMARY and re-run in this session). |
| 5 | Se resolvió explícitamente si corresponde rotar claves reales por exposición previa | VERIFIED | D-06 decision: "ROTAR" (confirmed by user 2026-06-15). Full runbook at `.planning/phases/01-rls-lockdown-secret-isolation/ROTATION-RUNBOOK.md`. Action is operational (outside the repo) — repo side of the decision is documented and closed. |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/027_business_secrets_and_public_views.sql` | Additive migration: business_secrets table, public_services view, public_business_hours view | VERIFIED | EXISTS, SUBSTANTIVE, WIRED. Creates business_secrets with RLS + owner-only policy. Creates public_services (10 cols, WHERE active=true) and public_business_hours (6 cols). GRANT to anon/authenticated. INSERT ... ON CONFLICT DO NOTHING for data copy. |
| `supabase/migrations/028_lock_base_tables_and_drop_secret_columns.sql` | Destructive migration: DROP POLICY on services/business_hours, DROP 7 columns from businesses | VERIFIED | EXISTS, SUBSTANTIVE, APPLIED (user-confirmed). Drops `"public read services"` on services, `"public read hours"` on business_hours (exact names). Drops 7 secret columns from businesses with IF EXISTS guards. |
| `lib/business-secrets.ts` | Server-only helper: getBusinessSecrets() reads only business_secrets via service role | VERIFIED | EXISTS, SUBSTANTIVE, WIRED. Reads only `.from('business_secrets')` with `createAdminClient()`. No fallback to businesses (removed in commit d53fed0). Returns EMPTY if no row. |
| `lib/types.ts` (Business interface) | Secret fields removed from Business; BusinessSecrets split | VERIFIED | Business interface has no mp_access_token, mp_refresh_token, mp_token_expires_at, resend_api_key, resend_from, recaptcha_secret_key, or google_refresh_token. Comment on lines 24-29 explicitly documents the split. `type { BusinessSecrets } from './business-secrets'` re-exported at line 95. |
| `app/[slug]/page.tsx` | Reads services from public_services, not base table | VERIFIED | `.from('public_services').select('*').eq('business_id', business.id)` on line 37. No `.from('services')` call with anon/public client. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `app/[slug]/page.tsx` | `public_services` view | `supabase.from('public_services')` with public server client | WIRED | Line 37: explicit, filtered by business_id |
| `lib/business-secrets.ts` | `business_secrets` table | `createAdminClient()` → service role | WIRED | Service role bypasses RLS; only code path to read all 7 secrets |
| `app/api/payment/webhook/[slug]/route.ts` | `business_secrets` | `getBusinessSecrets(business.id)` | WIRED | Line 58; businesses query on line 48 selects only non-secret columns explicitly: `id, name, slug, primary_color, logo_url, whatsapp, address, notification_email` — D-03 landmine resolved |
| `app/(dashboard)/settings/settings-client.tsx` | `business_secrets` | `.from('business_secrets').upsert(...)` with session client | WIRED | Lines 614, 652, 669; session client authorized by owner-only RLS policy; reads via `getBusinessSecrets` passed as prop from server page |
| `app/api/mercadopago/callback/route.ts` | `business_secrets` | `.from('business_secrets').upsert(...)` with session client | WIRED | Line 56; mp_user_id (non-secret) stays in businesses; 3 MP secrets go to business_secrets |
| `app/api/google/callback/route.ts` | `business_secrets` | `.from('business_secrets').upsert(...)` with session client | WIRED | Line 41; google_refresh_token written to business_secrets |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| Multiple route files | Various | Stale comment "fallback transitorio a businesses pre-028" | INFO | Vestigial comments from before commit d53fed0 removed the fallback. Comments do not reflect actual code behavior. `getBusinessSecrets()` has no fallback. Non-blocking. |
| `app/[slug]/layout.tsx` | 13 | `select('*')` on `businesses` via `createAdminClient()` | INFO | Uses admin (service role) client for theme/palette metadata only. Safe post-028: secret columns no longer exist in businesses; this call returns non-sensitive UI fields. Not exploitable via anon key. |
| `app/(dashboard)/*/page.tsx` (multiple) | Various | `select('*')` on `businesses` via authenticated server client | INFO | Owner's own authenticated session; secret columns gone from businesses post-028; these calls return only non-sensitive fields. No security impact. |

No TBD, FIXME, or XXX markers found in phase-modified files (grep confirmed).

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compiles clean | `npx tsc --noEmit` | Exit 0 (no output) | PASS |
| `getBusinessSecrets` has no fallback to businesses | `grep -n "businesses" lib/business-secrets.ts` | Only one match: comment on line 32 (no code path) | PASS |
| No `select('*')` on businesses in API/public paths that could return secrets | grep for `select('*')` on businesses in API routes | Zero hits in any API route or public slug page on businesses with secret columns | PASS |
| `public_services` is the only services read path in public slug | `app/[slug]/page.tsx` services query | `.from('public_services')` confirmed; no `.from('services')` with anon client | PASS |
| All secret references in TS/TSX go through `getBusinessSecrets` | Secret column name grep excluding migrations, types, business-secrets | All 25+ hits are accesses via `secrets.xxx` (result of `getBusinessSecrets`) or settings form fields (UI, writing to business_secrets) | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| SEC-01 | Phase 1 (all 5 plans) | anon cannot read sensitive columns; secrets in business_secrets with owner-only RLS | SATISFIED | Migrations 027+028 applied; all readers repunted; tsc clean; 5/5 success criteria verified |

---

### Human Verification Required

None. All 5 success criteria are verified programmatically via code analysis, migration content, grep evidence, and TypeScript type-check. The DB-side effects (actual RLS enforcement, 0-row queries from anon) were verified live by the user as part of plan 01-05's blocking smoke test gate before migration 028 was applied.

---

## Gaps Summary

No gaps. Phase goal fully achieved.

---

_Verified: 2026-06-16T04:30:00Z_
_Verifier: Claude (gsd-verifier)_
