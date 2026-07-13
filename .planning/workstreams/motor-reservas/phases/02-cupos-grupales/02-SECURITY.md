---
phase: 02-cupos-grupales
status: secured
threats_total: 19
threats_closed: 19
threats_open: 0
asvs_level: 1
block_on: high
audited: 2026-06-29
---

# SECURITY — Phase 02 (cupos-grupales / Motor de Reservas v0.12)

**Audited:** 2026-06-29
**ASVS Level:** 1
**block_on:** high
**Disposition:** SECURED — 19/19 threats closed (14 mitigate verified in code, 4 accept documented, 1 supply-chain verified)

This phase touches the v0.9-hardened booking integrity core (unique index ex-011 + EXCLUDE gist ex-013 + concurrency). The threat register was authored at plan time; this audit verifies each declared mitigation EXISTS in the implementation (file:line evidence below), confirms each accepted risk is reasonable, and does NOT scan for net-new threats.

> **Deploy note (NOT a security gap):** Migration `041` is validated on LOCAL Supabase (`supabase db reset`, PG17). Per project constraint, it is applied to production by hand, coordinated with the deploy, and requires `NOTIFY pgrst, 'reload schema';` afterward. Until applied, `book_slot_atomic` returns `PGRST202` (function not found) — fail-closed (no booking succeeds), not a silent bypass. This is the documented deploy step.

---

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-02-01 | Tampering | mitigate | CLOSED | `book_slot_atomic` is `SECURITY DEFINER SET search_path = public` (migration 041:111) and filters ALL queries by `p_business_id` — capacity lookup `tb.business_id = p_business_id` (041:129), occupancy count `a.business_id = p_business_id` (041:137), INSERT writes `business_id = p_business_id` (041:168). Core re-validates service/professional/location by `business_id` BEFORE the RPC (booking-core.ts:87, 100, 193) and passes already-validated ids. |
| T-02-02 | Tampering | mitigate | CLOSED | Unique index `appointments_no_double_booking` recreated with `seat` as last bucket column (041:65); for cap 1, RPC forces `v_seat := 0` (041:160) so the 2nd row collides → 23505. EXCLUDE `appointments_no_overlap` re-added with `AND NOT is_group` (041:76) — cap-1 (is_group=false) keeps the variable-duration anti-overlap. CONC-02 guards it (concurrency.test.ts:116-131). |
| T-02-03 | Tampering | mitigate | CLOSED | `pg_advisory_xact_lock(hashtextextended(p_business_id || v_bucket || p_date || p_time, 0))` serializes per slot+bucket BEFORE count→insert (041:121-122); `v_bucket` uses the same `COALESCE(professional_id, sentinel)` as the index (041:113). Unique `seat` index is the atomic backstop. CONC-01 asserts exactly 2 DB rows (no 3) via `t.admin` (concurrency.test.ts:97-109). |
| T-02-04 | Elevation of Privilege | mitigate | CLOSED | `GRANT EXECUTE ... TO anon, authenticated, service_role` (041:183) is scoped; not a vector because `p_business_id` is resolved by the caller (slug→business / owner→business), never by the client, and the function re-imposes the tenant filter internally (041:129/137/168). |
| T-02-05 | Information Disclosure | accept | CLOSED (accepted) | `capacity` is the STATIC cap (template ceiling), not live occupancy. Anon public read of `time_blocks` is intentionally left intact (041:34-36, 191); D-06 only forbids exposing remaining seats. Live occupancy lives in `appointments` (no anon read). Reasonable: a static cap reveals nothing about who/how-many are booked. |
| T-02-06 | Tampering | mitigate | CLOSED | `time_blocks` hardened with `FOR INSERT WITH CHECK` (041:192-194) and `FOR UPDATE USING/WITH CHECK` (041:196-200), both `business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())` — prevents reassigning a block's capacity to another tenant. |
| T-02-07 | Tampering | mitigate | CLOSED | JS re-check is UX-only and explicitly capacity-aware: early `slot_taken` ONLY when `slotCapacity <= 1` (booking-core.ts:154-156); for capacity>1 it delegates to the RPC (the atomic authority). It rejects neither too much (group slot) nor too little (RPC always decides). |
| T-02-08 | Tampering | mitigate | CLOSED | Service revalidated by `business_id` (booking-core.ts:84-88), professional (96-104), location (189-195), ALL before the `.rpc('book_slot_atomic', ...)` call (211-228). Anti-tampering preserved across the RPC refactor. |
| T-02-09 | Information Disclosure | mitigate | CLOSED | Core returns only snake_case domain codes — `slot_full` (booking-core.ts:233), `slot_taken` (238), `insert_failed` (241); the raw RPC error goes to `console.error('[booking-core] rpc error:', rpcErr?.message)` (240), never to the client. |
| T-02-10 | Information Disclosure | mitigate | CLOSED | `availability` returns `{ ok, busy, full }` (availability/route.ts:112). `countByTime` is computed in memory and NEVER serialized; `full` is collapsed to a string[] of full times via `n >= capacityFor(time)` (104-110). No count/remaining/per-enrollee entry. Client trusts `full` and never recomputes (booking-client.tsx, verified via 02-03 contract). |
| T-02-11 | Information Disclosure | accept | CLOSED (accepted) | The cap is inferable but it is static data already public-readable in `time_blocks` (consistent with T-02-05). D-06 forbids only live occupancy/remaining seats, which IS hidden. Reasonable and consistent. |
| T-02-12 | Tampering | mitigate | CLOSED | availability uses the same `COALESCE(professional_id, SENTINEL)` bucket (availability/route.ts:11, 80-83), the same expired-hold discard (84), and resolves capacity with `MAX` over covering blocks (66-74) — consistent with the RPC's `COALESCE(MAX(tb.capacity), 1)`. |
| T-02-13 | Information Disclosure | mitigate | CLOSED | `initialAppointments` is fetched with `.eq('business_id', business.id)` in page.tsx:36; the roster filters that set in memory only (agenda-client.tsx:449-451, comment at 423-424 cites T-02-13). No extra cross-tenant query. |
| T-02-14 | Tampering | mitigate | CLOSED | `saveHours` does delete-all + insert scoped to `.eq('business_id', business.id)` (agenda-client.tsx:284) and every `toInsert` row carries `business_id: business.id` + `capacity` (286, 293); reinforced by the `time_blocks` WITH CHECK policies from migration 041 (T-02-06). |
| T-02-15 | Information Disclosure | accept | CLOSED (accepted) | client_phone/client_email shown in the roster (agenda-client.tsx:872-876) are the business's OWN clients' data, fetched filtered by `business_id` (page.tsx:35-36). Same criterion as today's agenda showing client_name. Reasonable: admin viewing its own clients. |
| T-02-16 | Tampering | mitigate | CLOSED | CONC-01 verifies DB state with `t.admin` via `occupantsAt('09:00') === 2` (concurrency.test.ts:71-80, 109), not just core results — would catch a 3-row oversell. |
| T-02-17 | Tampering | mitigate | CLOSED | CONC-02 asserts `second.error === 'slot_taken'` explicitly (NOT slot_full) for the 2nd cap-1 booking (concurrency.test.ts:124-128). |
| T-02-18 | Information Disclosure | mitigate | CLOSED | CUPOS-02 asserts `Object.keys(body).sort() === ['busy','full','ok']` and `expect(entry).not.toHaveProperty(k)` for `count/remaining/seat/capacity/occupied/available/spots/roster` over every busy entry (concurrency.test.ts:202-208). |
| T-02-SC | Tampering | mitigate | CLOSED | No package changes across the phase 02 commits: `git log f387b77^..HEAD -- package.json package-lock.json` returns empty. btree_gist is a native, already-enabled extension. No new dependency vector. |

---

## Accepted Risks Log

| Threat ID | Risk | Why Accepted |
|-----------|------|--------------|
| T-02-05 | anon can read `time_blocks.capacity` (static cap) via public read | Static template ceiling, not live occupancy. D-06 only forbids remaining-seats. Live occupancy (appointments) has no anon read. Documented in migration 041 header (lines 34-36, 191). |
| T-02-11 | the cap is inferable from the availability/public surface | Same static cap already public-readable; D-06 hides only occupancy/remaining seats, which IS collapsed to a boolean. Consistent with T-02-05. |
| T-02-15 | client contact (phone/email) exposed in the admin roster | Business's own clients' data, fetched by `business_id`; same trust level as the existing agenda (client_name). Admin context only (owner session, anon+RLS). |

---

## Unregistered Flags

None. SUMMARY `## Threat Flags` sections (02-03, 02-05) explicitly state "None"; 02-01/02/04 introduced no new attack surface beyond the per-plan `<threat_model>`. No new entry points, exports, or data flows appeared during implementation without a mapped threat ID. Every threat in the register maps to verified implementation or a documented accepted risk.

---

## Verification Notes

- Implementation files were read-only throughout; only this SECURITY.md was written.
- Sentinel `00000000-0000-0000-0000-000000000000` is byte-identical across the index (041:65), advisory lock key (041:113/122), occupancy count (041:138), and the core/availability buckets (booking-core.ts:15, availability/route.ts:11).
- Migration 041 was validated by `supabase db reset` (PG17 local) per 02-01-SUMMARY; full suite is 301/301 green per 02-05-SUMMARY (CONC-01/02, CUPOS-02/03 included).
- One plan-time RPC bug (slot_full returned for cap 1) was self-fixed during 02-02 before deploy (commit 88dcffb) and is reflected in the current migration 041:153-161 — cap 1 forces seat=0 → 23505 → slot_taken. Verified present.

**threats_open: 0**
