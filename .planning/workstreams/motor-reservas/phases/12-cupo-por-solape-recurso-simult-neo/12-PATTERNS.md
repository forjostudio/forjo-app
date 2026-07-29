# Phase 12: Cupo por solape (recurso simultáneo) - Pattern Map

**Mapped:** 2026-07-29
**Files analyzed:** 8 (2 new, 6 modify)
**Analogs found:** 8 / 8

> **Ground rule (LOCKED del proyecto):** las migraciones se aplican **A MANO** coordinadas con el deploy. GSD NUNCA aplica migraciones. La ÚNICA validación automatizada es `supabase db reset` local (PG17, replaya baseline + 040..062 en orden) + `npm run test` (vitest contra la DB local). Tras aplicar 062 en prod: correr `NOTIFY pgrst, 'reload schema'` y regenerar `supabase/schema.sql`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/062_*.sql` (NEW) | migration | transform (DDL + stored fn) | `058_professional_auto_assignment.sql` (RPC body) + `061` / `055` (column+CHECK mold) + `042` (space locks) | exact |
| `lib/booking-core.ts` (MODIFY) | service (core) | request-response | itself (mode-aware branch of existing re-check) | self |
| `app/api/booking/availability/route.ts` (MODIFY) | route handler | request-response (read) | itself — rama `any` (líneas 190-231) = molde overlap-aware | self |
| `app/(dashboard)/settings/settings-client.tsx` (MODIFY) | component (form) | CRUD | service edit form (1378-1449) + segmented control radiogroup (1605) | exact (in-file) |
| `app/(dashboard)/agenda/agenda-client.tsx` (MODIFY) | component (grid) | CRUD/read | roster grupal "N/capacity" (999-1013) | role-match |
| `app/[slug]/booking-client.tsx` (MODIFY) | component (selector) | request-response | "Cualquiera" gating (117-134, 506-570) | exact (in-file) |
| `test/concurrency.test.ts` (MODIFY/NEW case) | test | concurrency (DB race) | CONC-01 (86-114) / CONC-03 (245-275) | exact |
| `test/helpers/booking-fixtures.ts` (MODIFY) | test helper | fixture | `seedTimeBlock` (100-123) / `seedProfessional` (130-138) | exact |
| `supabase migration → public_services VIEW` (bounded) | migration (view) | read | `061` VIEW REPLACE (56-91) | exact |

---

## Pattern Assignments

### `supabase/migrations/062_*.sql` (NEW — migration, DDL + `CREATE OR REPLACE FUNCTION`)

**Analogs:** `058` (RPC body to redefine in-place), `061`/`055` (column + idempotent CHECK), `042` (space lock ordering to preserve).

**Migration header + apply-by-hand block** — copy the doc-comment convention from `058:1-39` (dense Spanish header explaining Contexto / Qué hace / Qué NO hace, ending with the "NO push remoto / `supabase db reset` local / prod a mano + `NOTIFY pgrst` + regenerar schema.sql" invariant paragraph — `058:37-39`).

**Column + idempotent CHECK (mold `061:36-54` / `055:50-64`)** — the exact idempotent CHECK-via-`pg_constraint` shape to replicate:
```sql
ALTER TABLE "public"."services" ADD COLUMN IF NOT EXISTS "capacity_mode" text NOT NULL DEFAULT 'group_class';
ALTER TABLE "public"."services" ADD COLUMN IF NOT EXISTS "capacity" smallint NOT NULL DEFAULT 1;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "pg_constraint"
      WHERE "conname" = 'services_capacity_mode_chk' AND "conrelid" = '"public"."services"'::"regclass") THEN
    ALTER TABLE "public"."services" ADD CONSTRAINT "services_capacity_mode_chk"
      CHECK ("capacity_mode" IN ('group_class','simultaneous_resource'));
  END IF;
END $$;
```
`DEFAULT 'group_class'` = zero regression, no backfill (matches `061:11-12` rationale; canchas covered — D-14).

**RPC redefinition (start from `058:44-224`, `CREATE OR REPLACE`, NO DROP).** The 14-param signature + `RETURNS TABLE ("id" uuid, "cancel_token" uuid)` must stay **byte-identical** (`058:44-59`). The branch points:
- **Read mode BEFORE the lock** (new `DECLARE v_mode text; v_svc_cap int;` + `SELECT capacity_mode, COALESCE(capacity,1) FROM services WHERE id=p_service_id AND business_id=p_business_id` — D-07 tenant explícito, fail-safe `COALESCE(v_mode,'group_class')`).
- **Mode-dependent lock (D-06)** — replace the single `PERFORM pg_advisory_xact_lock(...)` at `058:82-83`. `group_class`/cupo1 keep `hash(business_id||date||time)` byte-identical; `simultaneous_resource` uses `hash(business_id||service_id||date)`. Lock stays FIRST, before the space locks (`058:143-158`), preserving the ascending order.
- **Overlap gate (new, `simultaneous` branch)** — the canonical `tsrange && tsrange` predicate lifted verbatim from `058:114-118` / `042` / EXCLUDE 013, but filtered by `service_id` (D-03), not bucket:
```sql
SELECT count(*) INTO v_overlap FROM appointments a
 WHERE a.business_id = p_business_id AND a.service_id = p_service_id AND a.date = p_date
   AND a.status IN ('confirmed','pending_payment')
   AND tsrange(a.date+a.time, a.date+a.time+make_interval(mins => COALESCE(a.duration_minutes,30)))
       && tsrange(p_date+p_time, p_date+p_time+make_interval(mins => p_duration));
IF v_overlap >= v_svc_cap THEN RAISE EXCEPTION 'slot_full' USING ERRCODE = 'P0001'; END IF;
```
- **`seat` unchanged** (exact `date+time+bucket` count — `058:195-200`, D-05).
- **`is_group` LANDMINE** — simultaneous branch must set `v_is_group := (v_svc_cap > 1)` so EXCLUDE 013 (`is_group=false` only, `041:67-76`) doesn't reject legal overlaps. `group_class` keeps `(v_capacity > 1)`.
- **Re-emit OWNER + GRANT with the full signature** — copy verbatim from `058:226-230`.
- **`NOTIFY pgrst, 'reload schema';`** at the end (mold `061:94`).

**Selección "cualquiera" (`058:88-137`) + space exclusion (`058:143-182`) = leave BYTE-IDENTICAL.** D-13 hides "Cualquiera" for simultaneous; a coarser service-day lock only over-serializes (Q1(a)), and the space-lock ordering analysis (`058:148` `ORDER BY asp.space_id` ascending) is preserved.

---

### `lib/booking-core.ts` (MODIFY — service core, the JS re-check LANDMINE)

**Analog:** itself. Two surgical changes, both inside the existing `if (!autoAssign)` block.

**1. Service SELECT must fetch the flag** (`lib/booking-core.ts:95-100`):
```ts
.select('id, name, active, duration_minutes, location_id')   // ADD: capacity_mode, capacity
```

**2. Mode-aware early-return (Pitfall 1 — CRITICAL).** The block at `booking-core.ts:206-218` returns `slot_taken` when `taken && slotCapacity <= 1`. For a `simultaneous_resource` service whose `time_block` capacity is 1, this fires on the 2nd overlapping turn → the resource **never fills**. Mirror the existing grupal exception (the `slotCapacity <= 1` gate at line 216, explained 209-215): if `capacity_mode === 'simultaneous_resource'`, skip the overlap early-return entirely and let the RPC (authority) decide by the overlap count. The RPC error mapping at `booking-core.ts:292-310` (`slot_full`/`slot_taken`) needs NO change — `slot_full` is already handled (294-296).

---

### `app/api/booking/availability/route.ts` (MODIFY — read-path, overlap-aware, D-12)

**Analog:** its own `any` branch (`190-231`) is the exact overlap-aware mold. It already enumerates grid start-times at `paso = dur` (`197-202`), has an `overlaps(a, t)` helper (`182-186`), and collapses to a boolean-per-slot `full` array with `busy: []` (`229-230`) → **no-leak D-06 preserved**.

**Change:** the specific-professional branch (below line 232) currently doesn't receive `serviceId`. For `simultaneous_resource`:
1. Client passes `serviceId` in the specific branch too (`booking-client.tsx:255-259` already has `selectedService.id`).
2. Endpoint (service-role, `createAdminClient`) reads `capacity_mode`, `capacity` from `services` re-validated by `business_id` (same as the `any` branch already does).
3. If simultaneous: enumerate start-times (mold `197-202`), count live same-`service_id` overlapping turns per start-time, push to `full` when `count >= capacity`, return `busy: []` (mold `229-230`). Overlap predicate = the `overlaps()` helper at `182-186`.
4. If `group_class`: byte-identical current behavior (`287-312`).

Keep `{ ok, busy, full }` shape (contract locked; no counts/remaining — `298-310`).

---

### `app/(dashboard)/settings/settings-client.tsx` (MODIFY — service editor form, D-09)

**Analog:** in-file. Both the add form (`1378-1411`) and edit dialog (`1416-1449`) build `newService`/`editSvcForm` state (`383`, `427`) and write via browser client (`390`, `439`). Add `capacity_mode` + `capacity` to both state shapes and inserts/updates.

**Segmented control mold (in-file, `1605`):** the "Preselección del profesional" radiogroup is the exact segmented-control pattern to replicate for "Clase grupal / Recurso simultáneo":
```tsx
<div role="radiogroup" aria-label="Preselección del profesional" className="inline-flex flex-wrap gap-1 rounded-md border border-border p-1">
```
Reuse the same active-pill styling used across the file (`'bg-primary text-primary-foreground'` vs `'text-muted-foreground'`, e.g. `1355`). Show the `capacity` number Input (mold the min. Input at `1387`/`1429`) only when mode is `simultaneous_resource`. Microcopy + fixed labels for all verticals (D-10).

---

### `app/(dashboard)/agenda/agenda-client.tsx` (MODIFY — roster/grid "lleno", D-11)

**Analog:** in-file. The grupal roster counter `` `${roster.enrollees.length}/${roster.capacity}` `` (`agenda-client.tsx:999-1013`) is the pattern NOT to reuse for simultaneous (D-11 says no "8/15" per-franja counter). Instead, simultaneous turns render as individual rows (the normal per-turn render already exists in this file) with a "lleno" indicator when the interval hits `capacity` (e.g. "2/2 camillas"). The clickable slot chip pattern (`596-602`) and the overlay counter styling (`1003-1013`, `tabular-nums`) are the visual molds to adapt. Occupancy = states that occupy (mold `agenda-client.tsx:59`, same WHERE as constraints 011/013).

---

### `app/[slug]/booking-client.tsx` (MODIFY — public selector, hide "Cualquiera", D-13)

**Analog:** in-file. "Cualquiera" is gated by `showAny` (2+ capaces, `117-134`) and placed via `anyCardPlacement(...)` (`506-570`, from `@/lib/booking-selector`). For `simultaneous_resource`, force-hide the "Cualquiera" card regardless of capaces count. Needs `capacity_mode` reaching the client → expose it in `public_services` (see below). The selected-service mode is available where `selectedService` is used (`255-259`).

---

### `test/concurrency.test.ts` (MODIFY — add CUPO-04 case) + `test/helpers/booking-fixtures.ts`

**Analog:** CONC-01 (`concurrency.test.ts:86-114`) and CONC-03 (`245-275`). Same `describe.skipIf(!hasSupabaseCreds)`, same seeded tenant, same `Promise.all([...])` real-connection harness (each `createAppointmentCore` = its own `.rpc` = its own DB transaction), same hard DB-state assertion via `occupantsAt` (`75-84`).

**Fixture helper (mold `seedTimeBlock` 100-123 / `seedProfessional` 130-138):** add `seedSimultaneousService` or inline `t.admin.from('services').update({ capacity_mode: 'simultaneous_resource', capacity: N }).eq('id', t.serviceId)`. Use a FIXED `professionalId` (Pitfall 1 — never mix null/sentinel, `concurrency.test.ts:52-55`). Seed a covering `time_block` (capacity irrelevant for simultaneous, defines the day).

**CUPO-04 shape (N=2, dur 30, staggered sharing an instant):**
```ts
// A 16:00-16:30, B 16:10-16:40, C 16:20-16:50 all overlap [16:20,16:30)
const [a,b,c] = await Promise.all([
  createAppointmentCore({ ...baseInput(), time: '16:00' }),
  createAppointmentCore({ ...baseInput(), time: '16:10' }),
  createAppointmentCore({ ...baseInput(), time: '16:20' }),
])
expect([a,b,c].filter(r => r.ok).length).toBe(2)
expect([a,b,c].filter(r => !r.ok && r.error === 'slot_full').length).toBe(1)
// HARD DB assert: exactly 2 overlapping rows (never 3) — fails BEFORE the lock fix, passes after.
```
CUPO-05 regression cases (same suite): simultaneous cap 1 → `slot_full`/`slot_taken` (no oversell); `group_class` CONC-01/CUPOS-03 stay green byte-identical; `canchas-booking.test.ts` + `staff-assignment.test.ts` stay green (D-14).

---

### `public_services` VIEW (BOUNDED decision — part of migr. 062 or a companion)

**Analog:** `061:56-91` (VIEW REPLACE) — `CREATE OR REPLACE VIEW ... AS SELECT <existing cols>, "capacity_mode" FROM ...` (add col at the END only), then re-emit `ALTER VIEW ... OWNER TO "postgres"` + `GRANT ALL ... TO anon/authenticated/service_role`.

**Decision (from RESEARCH Q4/A3):** expose **only `capacity_mode`** (presentation flag, enum, not PII → OK for anon) for D-13. Do NOT expose `capacity` (the N) — keep it server-side to preserve the no-leak of remaining spots (D-06/D-12). The read-path availability uses service-role and reads `services` directly, so it does NOT need the view.

---

## Shared Patterns

### Tenant isolation inside `SECURITY DEFINER` (skill: supabase-multitenant-rls)
**Source:** `058:92`, `058:150`, `058:170`. **Apply to:** every new query in the RPC.
```sql
WHERE ... business_id = p_business_id   -- explicit; RLS does NOT protect inside SECURITY DEFINER (D-07)
```

### Canonical overlap predicate
**Source:** `058:114-118` (`042:190-191`, EXCLUDE 013). **Apply to:** RPC overlap gate + availability read-path. Reuse `tsrange && tsrange` verbatim — never hand-roll minute comparison.

### Advisory lock before any count (no TOCTOU)
**Source:** `058:82-83`, lock released at xact end (`041:84-88`). **Apply to:** RPC. The overlap count ALWAYS runs after `pg_advisory_xact_lock`. Prohibited: loose `count` to decide availability (`booking-core.ts:265-270`).

### Idempotent column + CHECK, fail-closed at DB
**Source:** `061:36-54`, `055:50-64`. **Apply to:** 062 columns. `ADD COLUMN IF NOT EXISTS ... NOT NULL DEFAULT` + `DO $$ pg_constraint ... $$`. Re-running the migration is a no-op.

### Apply-by-hand + reload cache
**Source:** `058:37-39`, `061:94`. **Apply to:** 062. `supabase db reset` local = only automated validation; prod a mano; `NOTIFY pgrst, 'reload schema'`; regenerate `supabase/schema.sql`.

### Concurrency test harness (real DB race)
**Source:** `concurrency.test.ts:86-114` + hard DB assert `occupantsAt` (`75-84`). **Apply to:** CUPO-04. `Promise.all` of `createAppointmentCore`; assert on real DB row count, not on returns.

---

## No Analog Found

None. Every piece already exists in the repo in another form (RPC body 058, overlap predicate/space locks 042/041, column+CHECK 061/055, VIEW REPLACE 061, concurrency harness CONC-01/03, segmented control 1605). The work is COMPOSITION, not invention.

## Metadata

**Analog search scope:** `supabase/migrations/`, `lib/booking-core.ts`, `app/api/booking/availability/`, `app/(dashboard)/{servicios,settings,agenda,appointments}/`, `app/[slug]/`, `test/`.
**Files scanned:** ~15 read + grep across dashboard/booking client.
**Pattern extraction date:** 2026-07-29
