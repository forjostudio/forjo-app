---
phase: 13-borrado-de-servicio-preservando-historial
workstream: motor-reservas
audited: 2026-08-03
asvs_level: L1
block_on: high
threats_total: 31
threats_closed: 28
threats_accepted: 3
threats_open: 0
status: secured
findings:
  blocker: 0
  warning: 3
  info: 2
---

# Phase 13 — Security Audit (`borrado-de-servicio-preservando-historial`)

**Verdict: SECURED.** 31/31 threats resolve — 28 mitigations verified in code (file + line), 3 accepted
risks logged below. Zero BLOCKERs. Three WARNINGs, none at `high` severity, so none blocks the phase
per `block_on: high`.

Migration `065_service_snapshot_and_delete_gate.sql` is **live in production** (applied by hand
2026-08-03). Its residual risks below are live risk, not hypothetical, and are weighted accordingly.

Every CLOSED verdict was reached by reading the cited line, not by reading a SUMMARY. Where an
empirical check was available it was executed in this session against the **local** Supabase
(`http://127.0.0.1:54321`, resolved from `.env.test.local` with `override: true`); production was
never targeted. No implementation file was modified.

## Verification runs (this session)

| Command | Result |
|---|---|
| `node -e` resolving the suite's Supabase origin | `http://127.0.0.1:54321` (LOCAL — T-13-22 empirical) |
| `npx vitest run test/service-snapshot.test.ts test/service-delete-gate.test.ts --no-file-parallelism` | 17 passed, 1 expected fail (`it.fails` #11 = IN-01 pin, documented) |
| `npx vitest run test/canchas-delete-integration.test.ts --no-file-parallelism` | 5 passed (incl. case 5 = the IN-05 measurement) |
| `git diff --name-only 6e7667b HEAD` (phase base → HEAD) | 26 non-planning files; **no** engine regression test, **no** `package.json` / `package-lock.json` |

## Threat Verification

### Migration 065 — triggers and gate (13-01)

| ID | Category | Disp. | Verdict | Evidence |
|----|----------|-------|---------|----------|
| T-13-01 | Info Disclosure | mitigate | **CLOSED** | `supabase/migrations/065_*.sql:165-169` (`WHERE s.id = NEW.service_id AND s.business_id = NEW.business_id`) + `:191-195` for abonos; mirrored `supabase/schema.sql:128` / `:69`. No-match ⇒ `SELECT … INTO` leaves NULL (fail-safe, no RAISE). Empirical: `test/service-snapshot.test.ts:164` asserts snapshot NULL **and** `≠` the foreign service's name — passed this session. |
| T-13-02 | Tampering | mitigate | **CLOSED** | Trigger body assigns unconditionally into `NEW.service_name/service_price` (`065:165-169`) — no `IF NEW.x IS NULL` guard anywhere, so a forged incoming value is always overwritten. `test/service-snapshot.test.ts:134` passes. Also observed live during UAT (rows sent with `service_price: 1` were rewritten to $5.000, 13-05-SUMMARY §Issues). Scope caveat: INSERT-only — see accepted risk **A-1** (T-13-03). |
| T-13-03 | Tampering | accept | **ACCEPTED** | See accepted risk **A-1**. Verified there is indeed no UPDATE trigger (065 creates only `BEFORE INSERT`; `schema.sql:1453`, `:1465`), as D-03 requires. |
| T-13-04 | Elev. of Privilege | mitigate | **CLOSED** (residual **R-1**) | `065:250-257` — `a.service_id = OLD.id` + `(OLD.business_id IS NULL OR a.business_id = OLD.business_id)`; legacy `services` rows without tenant fail **closed** (count everything). Post-D-08-override predicate `(a.status IS NULL OR a.status NOT IN ('cancelled','completed'))` verified. **Three-way mirror holds:** `065:250-257` ≡ `schema.sql:470-473` ≡ `settings-client.tsx:559-561` (`.gte('date', today).or('status.is.null,and(status.neq.cancelled,status.neq.completed)')` — exact PostgREST equivalent, NULL branch present in all three). Reasoning on IN-05 in **R-1**. |
| T-13-05 | Tampering (TOCTOU) | mitigate | **CLOSED** | Gate is `BEFORE DELETE … FOR EACH ROW` (`065:290-292`; `schema.sql:1473`) → runs inside the DELETE's own transaction, so the RAISE (`065:260`) aborts before any referential `SET NULL`. **Exercised live** 2026-08-03 (13-UAT.md test 1, `13-VERIFICATION.md` frontmatter): with the modal open in confirmable state, a `confirmed` future appointment was inserted by service-role; the DELETE was rejected, the service survived, and the modal re-rendered blocked showing the *new* appointment's date (10/8) — proving it re-read the DB. |
| T-13-06 | Repudiation | mitigate | **CLOSED** | Explicit `RETURN OLD` on both non-raising exits: `065:230` (cascade guard) and `065:282`; mirrored `schema.sql:466`, `:482`. No `RETURN NULL` anywhere in the function. Empirical: `test/service-delete-gate.test.ts:136` asserts `serviceExists(svc) === false` after the DELETE — passed. |
| T-13-07 | Denial of Service | mitigate | **CLOSED** | `065:228-231` — `IF OLD.business_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM businesses …) THEN RETURN OLD`. Runs as definer, so the existence check is global, not RLS-filtered. Empirical: `test/service-delete-gate.test.ts:256` (case 10) deletes the `businesses` row with a live future appointment after asserting the same service alone is rejected with P0001 — passed. `teardownOneTenant` works across the whole suite, which is the same guarantee at scale. |
| T-13-08 | Elev. of Privilege | mitigate | **CLOSED** | `SET search_path = public` on all three: `065:151` (`appointments_service_snapshot`), `065:186` (`abonos_service_snapshot`), `065:216` (`services_block_delete`); mirrored `schema.sql:64`, `:122`, `:458`. All three also `OWNER TO postgres` explicitly. |
| T-13-09 | Info Disclosure | mitigate | **CLOSED** | `065:260` `RAISE EXCEPTION 'service_has_future_appointments'` and `065:276` `'service_has_active_abono'` — fixed literals, no interpolation of names, dates or counts. `schema.sql:474`, `:479` identical. |

### Read paths (13-02)

| ID | Category | Disp. | Verdict | Evidence |
|----|----------|-------|---------|----------|
| T-13-10 | Info Disclosure | mitigate | **CLOSED** | `app/api/export/finances/route.ts:51-52` — `.select('date, service_name, service_price, services(name, price)')` immediately followed by `.eq('business_id', business.id)`; the other two queries keep theirs (`:57`, `:61`). `business_id` still re-derived from the session (`owner_id`), never from a querystring. |
| T-13-11 | Info Disclosure | mitigate | **CLOSED** | `finances-client.tsx:250` (prior period) and `:274` (6-month chart): `.select('service_price, services(price)')` + `.eq('business_id', businessId)` on both. Main query `:220-221` unchanged in scoping. Only own-row columns added. |
| T-13-12 | Info Disclosure | mitigate | **CLOSED** | `grep public_ supabase/migrations/065_*.sql` → **no match** (exit 1). `public_services` (`schema.sql:1047-1061`) and `public_canchas` (`:1066-1075`) unchanged and select from `services`/`professionals` only — the three new columns live on `appointments`/`abonos`, which neither view touches. `anon` gains nothing. |
| T-13-13 | Tampering | mitigate | **CLOSED** | `lib/appointment-service.ts:57`, `:67`, `:75` — every fallback chain uses `??`, never `\|\|` (grep-confirmed: zero `\|\|` in the file). Snapshot-wins tests present and passing: `test/appointment-service.test.ts:34` (name) and `:74` (price, join carries a different value). |
| T-13-14 | Repudiation | mitigate | **CLOSED** | `apptServicePriceOrNull` (`lib/appointment-service.ts:66-71`) returns `0` for a snapshot of 0 and `null` only when both sources are absent. Dedicated tests: `test/appointment-service.test.ts:56` (`price 0` does not fall through to a 5000 join) and `:88` (`0` distinguished from "sin precio"). |

### Delete UX (13-03)

| ID | Category | Disp. | Verdict | Evidence |
|----|----------|-------|---------|----------|
| T-13-15 | Elev. of Privilege | mitigate | **CLOSED** | `settings-client.tsx:652` — `.update({ active }).eq('id', id).eq('business_id', business.id)`, error checked before any local state write. Matches `deleteService` (`:627`) and `deleteProfessional`. See info finding **I-1** for a sibling function still lacking the filter (pre-existing, out of this phase's diff). |
| T-13-16 | Info Disclosure | mitigate | **CLOSED** | All three pre-check queries carry `.eq('business_id', business.id).eq('service_id', s.id)`: `settings-client.tsx:559-562` (future), `:563-564` (active abono), `:565-566` (history). |
| T-13-17 | Tampering | mitigate | **CLOSED** | Authority is the DB trigger (`065:290-292`), unreachable from the client — a direct PostgREST DELETE hits it inside its own transaction. Proven by `test/service-delete-gate.test.ts:94`/`:167`, which issue raw PostgREST DELETEs (service-role, RLS bypassed) and are still rejected with P0001. The modal is explicitly documented as UX-only (`settings-client.tsx:541-544`). |
| T-13-18 | Spoofing | mitigate | **CLOSED** | `settings-client.tsx:627` — `.delete()….select('id')`; `:639` — `if (!data \|\| data.length === 0) return { ok: false, error: 'unknown' }` **before** the optimistic `setServices` filter and the success toast at `:640-641`. |
| T-13-19 | Repudiation | mitigate | **CLOSED** | `deleteService` returns a discriminated `DeleteServiceResult` (`:626-643`); the call-site re-runs the pre-check then `throw`s (`settings-client.tsx:2518-2519`); `ConfirmDialog.handleConfirm` catches without calling `onOpenChange(false)` (`confirm-dialog.tsx:274-281`) so the dialog stays open, and routes the reason to `onConfirmError` (`settings-client.tsx:2502-2509`, distinct copy per domain code). Confirmed live in UAT (see T-13-05). |
| T-13-20 | Info Disclosure | accept | **ACCEPTED** | See accepted risk **A-2**. |
| T-13-21 | Denial of Service | mitigate | **CLOSED** (re-verified post-`0b85f25`) | Mapping now lives at `lib/canchas.ts:231-236` (moved by the CR-01 reorder) and is **stronger** than the register text: `service_has_active_abono` → `has_active_abono`, `service_has_future_appointments` → `has_appointments`, `23503` → `has_appointments`, else `service_delete_failed`; plus a new `rollback_failed` (`:249`). `canchas-manager.tsx:184-193` branches on all four with distinct copy — the generic toast is now the last resort, not the default. Register intent (operator can tell why) exceeded. |

### Trigger tests (13-04)

| ID | Category | Disp. | Verdict | Evidence |
|----|----------|-------|---------|----------|
| T-13-22 | Info Disclosure | mitigate | **CLOSED** | `vitest.setup.ts` loads `.env.local` then `.env.test.local` with `override: true`. **Re-resolved in this session**: origin = `http://127.0.0.1:54321`. Recorded in `13-04-SUMMARY.md:130-131` (`DB_URL … 127.0.0.1:54322`). |
| T-13-23 | Tampering | mitigate | **CLOSED** | `git diff --name-only 6e7667b HEAD` lists **none** of the six engine regression tests (`concurrency`, `booking-public-regression`, `booking-core`, `manual-booking`, `abono-generation`, `canchas-booking`). Re-checked at HEAD, i.e. *after* the nine gap/review-fix commits, not just at 13-04. |
| T-13-24 | Info Disclosure | mitigate | **CLOSED** | `test/service-snapshot.test.ts:164-192` — two tenants seeded in `beforeAll`, asserts `service_name`/`service_price` NULL and `≠` the foreign name. Ran green this session. |
| T-13-25 | Repudiation | mitigate | **CLOSED** | `test/service-delete-gate.test.ts:136-162` (case 4) — `expect(await serviceExists(svc)).toBe(false)` after the DELETE, which is exactly the `RETURN NULL` detector. Ran green. |
| T-13-26 | Denial of Service | mitigate | **CLOSED** | `test/service-delete-gate.test.ts:256-288` (case 10, renumbered from "case 7" after the G5 additions) — deletes the `businesses` row with a live future appointment, after asserting the same service alone is P0001-rejected. Ran green. |

### Production apply (13-05)

| ID | Category | Disp. | Verdict | Evidence |
|----|----------|-------|---------|----------|
| T-13-27 | Denial of Service | mitigate | **CLOSED** (see **W-2**) | Runbook with explicit ordering transcribed at `13-05-SUMMARY.md:178-199` (step 6 = deploy, *after* the migration); `NOTIFY pgrst, 'reload schema';` present both as step 5 and at the tail of the migration itself (`065:295`). **Current state assessed explicitly: schema is AHEAD of code** (065 applied 2026-08-03, phase code not yet deployed). That is the **safe direction** the runbook prescribes — the widened `select`s cannot raise `PGRST204`, because the columns exist before any code that names them. The inverse ordering, which is what T-13-27 describes, did not occur and can no longer occur for this migration. Residual consequence of the window is **W-2**, which is a display-degradation risk, not the DoS this threat describes. |
| T-13-28 | Tampering | mitigate | **CLOSED** | Prohibition in the plan (`13-05-PLAN.md:150-152`, `:186-188`) and in the runbook; explicitly recorded as not-used at `13-05-SUMMARY.md:88` and `:180`. Verified independently: `grep -rn "db push"` across `package.json`, CI/YAML and all TS/MJS (excluding `node_modules`, `.planning`) → **no match**; `package.json` scripts contain no Supabase push/deploy target. No automated path to prod exists. |
| T-13-29 | Repudiation | mitigate | **CLOSED** (see **W-3**) | Both checkpoints are `gate="blocking"` — `13-05-PLAN.md:50` (human-verify) and `:136` (human-action). Evidence transcribed: literal on-screen modal copy for all three states at `13-05-SUMMARY.md:90-102`; the 7-step runbook with literal SQL at `:178-199`; applied/date/`db push` status at `:88`. `13-05-SUMMARY.md:57` records that the checkpoint did **not** auto-approve despite `workflow.auto_advance=true`. All four acceptance criteria of Task 2 (`13-05-PLAN.md:176-181`) are satisfied. Evidence-quality gap noted in **W-3**. |
| T-13-30 | Info Disclosure | mitigate | **CLOSED** (obligation **pending**, see **W-3**) | Runbook step 7 requires the test appointment to be deleted — present verbatim at `13-05-SUMMARY.md:198` and `13-05-PLAN.md:169-170`. Steps 6-7 have **not run yet** (code undeployed, `13-05-SUMMARY.md:246`), so no test appointment currently exists in prod and the risk window has not opened. The instruction must still be honored at deploy time. |

### Cross-cutting

| ID | Category | Disp. | Verdict | Evidence |
|----|----------|-------|---------|----------|
| T-13-SC | Tampering | accept | **ACCEPTED** | See accepted risk **A-3**. Verified empirically: `package.json` / `package-lock.json` absent from `git diff --name-only 6e7667b HEAD`; `tech-stack.added: []` in every SUMMARY frontmatter. |

## Accepted Risks Log

### A-1 — T-13-03: the owner can rewrite their own snapshot via PostgREST UPDATE

The anti-tampering guarantee of T-13-02 is **INSERT-only**. D-03 deliberately ships no UPDATE trigger
(confirmed: `065` creates two `BEFORE INSERT` triggers and one `BEFORE DELETE`, nothing else), so an
authenticated owner can `PATCH /appointments?id=eq.…` and set `service_name` / `service_price` to any
value on their own rows. RLS (`schema.sql:1974`, `FOR ALL` with `USING` doubling as the check) confines
this strictly to their own tenant — no cross-business write, no cross-business read. The only distorted
figure is the owner's own Finanzas report; Forjo's own billing is per-agenda (`plan-model-agendas`), not
revenue-derived, so there is no path from this to platform-level financial fraud. **Accepted as declared.**

### A-2 — T-13-20: the delete modal displays a count and the next appointment's date

`settings-client.tsx:598-599` renders `delInfo.future` and `delInfo.nextDate`. Both come exclusively from
the pre-check queries at `:559-566`, every one of which carries `.eq('business_id', business.id)` on top
of RLS. The data shown belongs to the tenant looking at it, and D-13 asks for exactly this so the owner
can anticipate the outcome. **Accepted as declared.**

### A-3 — T-13-SC: package installation

No plan installed anything; verified against the phase diff and `package.json`. **Accepted as declared.**

### R-1 — residual on T-13-04: IN-05, cross-tenant reference discarded by the gate (LIVE IN PROD, UNFIXED)

**Ruling: T-13-04 stays CLOSED; IN-05 is logged as an accepted residual, not an OPEN threat.** Reasoning,
since the disposition is contested:

- **The declared mitigation is present, verbatim, in all three mirror sites** and does what T-13-04
  claims: the SECURITY DEFINER gate never counts another tenant's rows, so it cannot be used to probe or
  be influenced by foreign data, and legacy `services` rows without a tenant fail closed. T-13-04's own
  threat statement (the definer function counting other tenants' rows) is mitigated.
- **IN-05 is the inverse failure and it is measured, not theoretical.**
  `test/canchas-delete-integration.test.ts:282-337` (ran green this session) proves: an appointment under
  tenant B referencing tenant A's `service_id` is not counted, A's DELETE proceeds, and B's row ends with
  `service_id`, `service_name` and `service_price` all NULL.
- **Why it is not a BLOCKER at `block_on: high`:** (a) no cross-tenant *read* occurs — the test asserts
  nothing of A's leaked into B, which is the project's non-negotiable invariant; (b) B's snapshot was
  already NULL from birth (the insert trigger applies the same tenant filter *by design*, T-13-01) and B
  could never resolve the embed either, since `services` RLS hides A's row from B — so the delete
  destroys a pointer to data B never rendered; (c) creating such a row requires an unguessable v4 UUID
  belonging to another tenant, and the row should not exist at all; (d) the loss is intra-tenant integrity,
  which is the same severity band the repo already accepts for `provisionCancha`/`deleteCancha`
  (documented at `lib/canchas.ts:14-18`).
- **Documentation gap (this is the actionable part):** `065:249` still describes the tenant filter as
  "defensa en profundidad del aislamiento" and does not state that cross-tenant references are knowingly
  discarded — which is the exact remedy the review offered as the cheap option. That comment is now on a
  **production** object. Fixing it needs migration 066 (or a comment-only edit shipped with the next
  migration); the copy in `supabase/schema.sql:471` has the same gap.

**Owner decision required at next migration:** either drop the tenant filter from the *count* (strictly
fail-closed, since `a.service_id = OLD.id` already anchors on a non-guessable PK) or write the discard
down. Do not leave a third state where the comment claims a property the code does not have.

## Findings

### W-1 (WARNING) — IN-05 residual is live in production and undocumented in the migration

Covered in full under **R-1**. Not a blocker; requires a decision, not a hotfix.

### W-2 (WARNING) — schema-ahead-of-code window: a service deleted in prod *right now* reports $0 revenue until the deploy

The ordering is the **safe** one (this is stated for T-13-27), but the window has a concrete, live
consequence that no plan-time threat covers:

- Production already has FK `ON DELETE SET NULL` + the delete gate. A service whose appointments are all
  past/cancelled/completed is now **deletable in prod**, where before migration 065 the FK rejected it.
- The **deployed** code does not read the snapshot. Verified at the phase base:
  `git show 6e7667b:app/(dashboard)/finances/finances-client.tsx` sums
  `(x.services as {price?})?.price || 0` at lines 250/273/288/518 — join only. Same for the CSV export and
  the client card.
- Net effect until deploy: deleting a service in prod today preserves the data in
  `appointments.service_name/service_price` (backfill and insert trigger are live) but makes those turnos
  render as "—" and count as **$0** in Finanzas, the Dashboard month and the CSV.
- Secondary: the deployed `deleteService` (`6e7667b:521-531`) only maps `23503`, so a P0001 rejection
  surfaces as the generic "No se pudo eliminar el servicio".

**Non-destructive and self-healing** — the columns already hold the values, so the numbers come back the
moment the phase code ships. Recommended handling: deploy the phase code promptly, or tell the owner not
to delete services in prod until it lands.

### W-3 (WARNING) — production evidence is partial; runbook steps 6-7 still owe execution

- `13-05-SUMMARY.md` transcribes the *commands* for steps 3 and 4 but not their **outputs** from prod
  (`count = 0`; `confdeltype = n, n`). The `UPDATE 0 / UPDATE 0` evidence cited is from the **local**
  reset. T-13-29's mitigation text calls for "salida de las queries de verificación"; the plan's formal
  acceptance criteria (`13-05-PLAN.md:176-181`) only demand the literal SQL, which is why this is a
  warning and not an OPEN threat. Recommend pasting the two prod query results into the SUMMARY.
- Step 6 (deploy) and step 7 (smoke test) are pending. **T-13-30's obligation — delete the test
  appointment — is therefore still owed** and must not be skipped when step 7 runs on real tenant data.

### I-1 (INFO / unregistered flag) — `setServiceLocations` mutates `services` without an explicit tenant filter

`app/(dashboard)/settings/settings-client.tsx:661` —
`supabase.from('services').update({ location_ids…, location_id: null }).eq('id', id)`, no
`.eq('business_id', business.id)`. This violates the house rule in
`.claude/skills/supabase-multitenant-rls/SKILL.md` ("¿La query de la app filtra explícitamente por
`business_id` además de confiar en RLS?").

**Not introduced by this phase** — `git diff 6e7667b HEAD` shows no change to that function; it dates to
`339bfe9` (2026-06-13). RLS contains it: `schema.sql:1974` is a `FOR ALL` policy whose `USING` clause also
serves as the `WITH CHECK`, so a foreign `id` cannot be updated. Defense-in-depth deviation only; logged
because T-13-15 hardened the sibling function and left this one behind. Suggest folding it into Phase 14
polish.

### I-2 (INFO) — two known predicate divergences, both in the conservative direction

1. `components/dashboard/canchas-manager.tsx:167` pre-check uses `.in('status', ['pending',
   'pending_payment','confirmed'])`, which drops `status IS NULL` rows — the exact form the settings
   pre-check avoids. UX-only: it keys on `professional_id`, not `service_id`, and the DB gate plus the
   `appointments.professional_id` NO ACTION FK still backstop the delete. Already noted as unclosed in
   `13-05-SUMMARY.md`.
2. The gate defines "future" as `date >= today` (no time), while `lib/appointment-time.ts` cuts the
   Pasados/Próximos tabs on date **and** time. A turno earlier today therefore shows as past but still
   blocks the delete. Deliberate and documented (`lib/appointment-time.ts:15-18`); the gate errs toward
   blocking, which is the safe direction.

## Post-register code, checked against existing mitigations

Nine gap-closure / review-fix commits landed after the register was authored. No new threat IDs invented;
each was checked only for whether it undermines a declared mitigation.

| Change | Touches | Result |
|---|---|---|
| `--danger` / `--danger-hover` / `--danger-foreground` indirection (`4f1c9b8`, `7563e5e`) | none of the register | **No leak.** `--crm-danger` is declared **only** inside the `.crm-shell` block (`app/globals.css:248-249`); `:root` sets `--danger: var(--destructive)` (`:99`) and `.crm-shell` re-points `--danger → var(--crm-danger)` (`:253`). Custom properties inherit downward only, so `--crm-danger` cannot resolve outside the shell. `confirm-dialog.tsx:197` references only the neutral tokens. |
| `nonCanchaServices()` (`cef4e19`) | T-13-15, T-13-16 | **Tenant scoping preserved.** Pure `Set`-based filter matching on `service.id` (`lib/canchas.ts:159-162`); its inputs come from `app/(dashboard)/settings/page.tsx:29-33`, all `.eq('business_id', business.id)`. It only *removes* rows — it cannot widen the set. |
| `lib/appointment-time.ts` (`3722efa`) | none | Pure; no Supabase/React import (file read in full). No data access, no tenant surface. |
| `deleteCancha` reorder + rollback (`0b85f25`) | T-13-21 | **Rollback carries the tenant.** The re-insert passes `business_id: businessId` (`lib/canchas.ts:246`) and every `agenda_spaces` re-insert does too (`:251`); the two destructive DELETEs keep `.eq('business_id', businessId)` (`:215`, `:224`). Mapping re-verified under T-13-21. Behavior pinned against the real DB by `test/canchas-delete-integration.test.ts` (5/5 green). |
| Pre-check generation guard + error state (`44b8d99`, `d6c8ef8`) | T-13-16, T-13-19 | **Strengthens both.** `delReqRef` discards stale responses (`settings-client.tsx:546`, `:569`, invalidated on close at `:2488`); a failed pre-check becomes `'error'`, never a silent `0` (`:572-576`), and `hideConfirm` stays true for it (`:2494`) — fail-closed. Tenant filters untouched. |
| `toggleService` hardening (`bb162bb` + earlier) | T-13-15 | Verified under T-13-15; now also returns `boolean` so the modal's secondary action only closes on real success (`:2500`). |
| `secondaryAction` loading/rejection handling (`bb162bb`) | T-13-19 | Own `secLoading` + ref blocks double-submit and dialog close (`confirm-dialog.tsx:228-229`, `:241`, `:344-358`); rejections are logged and toasted, not swallowed. Does not weaken the throw-to-stay-open contract. |
| `test/canchas-delete-integration.test.ts` (`ebb00bb`) | T-13-04 | Adds the IN-05 **measurement** used in R-1. Test-only, local Supabase, seeds and tears down its own two tenants. |

**Executor-declared Threat Flags:** all four SUMMARYs that carry the section declare "ninguna superficie
de seguridad nueva" (`13-01:233`, `13-02:208`, `13-03:228`, `13-04:286`). Per the adversarial stance this
was not taken on faith — the table above is the independent check, and it produced I-1 and W-2, neither
of which any SUMMARY flagged.

## Unregistered Flags

| Flag | Severity | Disposition |
|---|---|---|
| `setServiceLocations` missing explicit `business_id` filter (I-1) | info | Pre-existing, RLS-contained; route to Phase 14 polish |
| `canchas-manager` pre-check drops NULL-status rows (I-2.1) | info | UX-only, DB gate backstops; already in the phase backlog |
| Schema-ahead-of-code display window (W-2) | warning | Operational; resolves on deploy |

---

_Audited: 2026-08-03 · Auditor: Claude (gsd-security-auditor) · ASVS L1 · block_on: high_
_Implementation files: read-only throughout. Only this file was written._
