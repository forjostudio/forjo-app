---
phase: 08
slug: equipo-qu-servicios-hace-cada-profesional
status: secured
threats_open: 0
threats_total: 11
asvs_level: 1
created: 2026-07-25
---

# SECURITY.md — Phase 08 (equipo / qué servicios hace cada profesional)

**Workstream:** motor-reservas
**Phase:** 08 — equipo-qu-servicios-hace-cada-profesional
**ASVS Level:** 1 · **block_on:** high
**Register origin:** authored at plan time (verify-only; no new-threat scan)
**Audited:** 2026-07-25
**Result:** SECURED — 11/11 threats closed (10 mitigate + 1 accept)

Migration 057 is already applied to prod by hand and validated locally via `supabase db reset` (001→057). Polish commit `2f68c0d` (settings-client.tsx) is cosmetic and does not alter the write path or RLS.

---

## Threat verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-08-01 | Information Disclosure | mitigate | CLOSED | `select` policy `USING (business_id IN owner's businesses)` — `057_professional_services.sql:65-67`; mirrored in `schema.sql:1587-1589`. RLS enabled `057:54`. |
| T-08-02 | Tampering / Elevation | mitigate | CLOSED | `insert WITH CHECK` `057:69-71`; `update USING + WITH CHECK` `057:73-77`. FKs NOT NULL `057:49-51` + composite PK `(professional_id, service_id)` `057:52`. |
| T-08-03 | Elevation (anon surface) | mitigate | CLOSED | Zero anon-scoped policy. All 4 policies are tenant-predicated on `auth.uid()` (`schema.sql:1572-1597`). `GRANT ALL … TO anon` (`schema.sql:3412`) is Supabase's standard per-table auto-grant — harmless: RLS is enabled and the tenant predicate fails closed for anon (`auth.uid()` = NULL → `business_id IN ()` → 0 rows), same posture as `agenda_spaces`/`clients`. |
| T-08-04 | Tampering (engine / canchas) | mitigate | CLOSED | Migration is only CREATE TABLE + ENABLE RLS + 4 policies + index. No `create or replace function`, no `book_slot_atomic`, no ALTER on `professionals`/`appointments`, no touch to `professionals.service_id` (043) or constraints 011/013. Git stat confirms 057 is the sole migration in the phase. |
| T-08-05 | Tampering (migration→prod) | mitigate | CLOSED | Idempotent constructs present: `create table if not exists` `057:48`, `drop policy if exists` x4 `057:60-63`, `create index if not exists` `057:87`. Numbered 057 (last prod = 056). Validated via local `supabase db reset` (08-01-SUMMARY Task 3 approved); prod applied out-of-band by hand, never via GSD. |
| T-08-06 | Tampering / Elevation (IDOR) | mitigate | CLOSED | Chip `onClick` passes `p.id`/`s.id` sourced ONLY from tenant-scoped lists — `professionals.filter(active)` and `services` (`settings-client.tsx:1526,1540,1546`), both loaded `.eq('business_id')` in the read-paths. Delete is scoped `.eq('business_id').eq('professional_id').eq('service_id')` (`settings-client.tsx:672-677`) + RLS `WITH CHECK` (Plan 01). |
| T-08-07 | Spoofing / Elevation (write plane) | mitigate | CLOSED | `supabase = createClient()` from `@/lib/supabase/client` (browser client, anon key + RLS) `settings-client.tsx:10,161`; write path `settings-client.tsx:667-704`. `createAdminClient`/`service_role` occurrences in file = 0. |
| T-08-08 | Information Disclosure (read-paths) | mitigate | CLOSED | Both loads scoped by tenant + RLS: `equipo/page.tsx:29` and `servicios/page.tsx:27` (`.eq('business_id', business.id)`); `business` resolved by `owner_id` + session guard (`equipo/page.tsx:9-18`, `servicios/page.tsx:9-13`). `services` uses `select('*')` like siblings — no over-selection. |
| T-08-09 | Tampering (public surfaces / engine) | mitigate | CLOSED | Git stat: Plan 02 commits (`bd3a4a1`,`23959b6`,`0273fd5`) touch only `settings-client.tsx` + the two authenticated `page.tsx`. No booking público / `book_slot_atomic` / availability / `nuevo-turno-form` (D-04). No writes to `appointments`/abonos (D-15). |
| T-08-10 | Elevation (canchas gate) | mitigate | CLOSED | Bloque A (editor) gated `!isCanchas && professionals.filter(active).length >= 2` (`settings-client.tsx:1511`). Bloque B (coverage) lives in `!isCanchas` branch (`:1266`) + `showCoverage = activePros.length >= 2` (`:1294`). `/equipo` also redirects on canchas BEFORE queries (`equipo/page.tsx:18`). |
| T-08-SC | Tampering (package install) | accept | CLOSED (accepted) | No packages/deps added: `tech-stack.added: []` in both SUMMARYs; git stat shows no `package.json`/`package-lock.json` changes. UI-SPEC Registry Safety honored. See accepted-risks log below. |

---

## Load-bearing multi-tenant invariants (special attention)

- **T-08-02 (cross-tenant write):** insert AND update both carry `WITH CHECK` on the owner→business predicate; a row cannot be created in, or moved to, another tenant. Composite PK + NOT NULL FKs block malformed rows.
- **T-08-06 (IDOR):** the client cannot inject a foreign `professional_id`/`service_id` — every ID that reaches `toggleProfessionalService` originates from server-rendered, tenant-scoped `professionals`/`services`. Delete is triple-scoped incl. `business_id`; RLS is the backstop.
- **T-08-07 (no service-role):** the write plane uses the authenticated browser client (anon key + RLS) exclusively. No `createAdminClient`/`service_role` anywhere in the write surface.

---

## Accepted risks log

| ID | Risk | Rationale | Owner |
|----|------|-----------|-------|
| T-08-SC | Supply-chain surface from package installs | Phase adds no npm/pip/cargo deps (`tech-stack.added: []`, no lockfile diff). No new supply-chain surface to review. | motor-reservas / phase 08 |

---

## Unregistered flags

None. 08-02-SUMMARY "Threat Surface" declares "Sin flags de amenaza nuevos (ninguna superficie de red/auth/schema nueva)"; 08-01-SUMMARY declares no new tech (`added: []`). No new attack surface appeared during implementation without a threat mapping.

---

## Scope boundaries confirmed

- Migration 057 does not touch the reservation engine (`book_slot_atomic`, constraints 011/013) or `professionals.service_id` (canchas, migr. 043).
- Bridge table `professional_services` is never exposed to `anon` (no anon policy; if Phase 10 needs public read it will be a bounded view, per the migration header).
- The mapping does not affect the owner panel, manual booking, or abonos in this phase (D-04/D-15); it feeds the public booking engine only in Phases 9/10.
