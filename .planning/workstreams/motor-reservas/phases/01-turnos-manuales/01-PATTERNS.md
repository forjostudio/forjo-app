# Phase 1: Turnos Manuales - Pattern Map

**Mapped:** 2026-06-26
**Files analyzed:** 7 (3 create, 3 modify, 1 migration)
**Analogs found:** 7 / 7

> Builds on `01-RESEARCH.md` (do not contradict). Research already mapped the core extraction and route-handler design; this file fixes the per-file analog + concrete excerpts the planner copies from, and **corrects two research assumptions verified this session:**
> - **A1 RESOLVED:** `components/ui/drawer.tsx` EXISTS (vendoreado). Use it for mobile.
> - **A2 RESOLVED:** `components/ui/command.tsx` does NOT exist. Combobox = `Input` + in-memory filter (pattern from `clients-client.tsx`), as the context note states.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `lib/booking-core.ts` (CREATE) | utility / service | transform (validate→insert) | validation chain in `app/api/booking/create/route.ts:81-241` | exact (extraction) |
| `app/api/appointments/create/route.ts` (CREATE) | route / controller | request-response (CRUD) | `app/api/booking/create/route.ts` (pipeline) + `app/(dashboard)/clients/page.tsx:5-16` (session+owner) | exact + role-match |
| `components/dashboard/nuevo-turno-form.tsx` (CREATE) | component | request-response | modal `appointments-client.tsx:545-639` + filter `clients-client.tsx:176-191` | role-match |
| `app/api/booking/create/route.ts` (MODIFY) | route / controller | request-response | itself (refactor to consume core) | self |
| `app/(dashboard)/appointments/appointments-client.tsx` (MODIFY) | component | request-response | own `handleCreate:288-330` → swap to `fetch` (pattern `agenda-client.tsx:83-86`) | self + role-match |
| `app/(dashboard)/agenda/agenda-client.tsx` (MODIFY) | component | request-response | own button + `router.refresh()` pattern `agenda-client.tsx:85,97` | self |
| `supabase/migrations/040-*.sql` (CREATE) | migration | DDL | `fixed_expenses` `FOR INSERT WITH CHECK` `baseline.sql:1272-1274` | exact |

## Pattern Assignments

### `lib/booking-core.ts` (utility, transform) — CREATE

**Analog:** `app/api/booking/create/route.ts` — extract the validation+insert chain into a role-agnostic helper that receives the already-built Supabase client (admin for public, server/anon for manual). Signature locked in RESEARCH Pattern 1.

**Module shape** (named export, kebab-case file, per repo convention):
```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
const SENTINEL = '00000000-0000-0000-0000-000000000000' // booking/create/route.ts:9
function timeToMinutes(t: string): number { /* route.ts:11-14 */ }
export async function createAppointmentCore(input: CreateAppointmentInput): Promise<CreateAppointmentResult>
```

**Anti-tampering of service** (extract from `route.ts:83-91`):
```typescript
const { data: service } = await supabase
  .from('services')
  .select('id, name, active, duration_minutes, location_id')
  .eq('id', serviceId)
  .eq('business_id', business.id)   // tenant re-validation — never trust client
  .single()
if (!service || service.active === false) return { ok: false, error: 'invalid_service', status: 400 }
```

**Anti-tampering of professional** (`route.ts:94-104`) and **location** (`route.ts:197-211`): same `.eq('business_id', business.id)` pattern; `professionalId === 'none'` → `proId = null`.

**Overlap re-check with buffer + sentinel** (extract from `route.ts:106-134`):
```typescript
const bucket = proId ?? SENTINEL
const buffer = Number(business.buffer_minutes) || 0
const reqStart = timeToMinutes(time)
const reqEnd = reqStart + Number(service.duration_minutes || 30)
const { data: clashes } = await supabase
  .from('appointments')
  .select('id, status, expires_at, professional_id, time, duration_minutes')
  .eq('business_id', business.id).eq('date', date)
  .in('status', ['confirmed', 'pending_payment'])
const overlaps = (a) => {
  const aStart = timeToMinutes(a.time); const aEnd = aStart + Number(a.duration_minutes || 30)
  return reqStart < aEnd + buffer && reqEnd > aStart - buffer
}
const sameBucket = (clashes || []).filter(a => (a.professional_id ?? SENTINEL) === bucket && overlaps(a))
const taken = sameBucket.some(a => a.status === 'confirmed' || a.expires_at == null || new Date(a.expires_at).getTime() > Date.now())
if (taken) return { ok: false, error: 'slot_taken', status: 409 }
```

**Expired-hold release** (extract from `route.ts:140-149`): cancel expired `pending_payment` holds that overlap, filtered by `business_id`. **Return `cancelledHoldIds` — do NOT send emails from the core** (the public caller sends hold emails in its own `after()`; manual caller ignores them). This is the regression boundary called out in RESEARCH Pitfall 2.

**INSERT + atomic constraint translation** (extract from `route.ts:213-241`):
```typescript
const { data: appt, error: insertErr } = await supabase
  .from('appointments')
  .insert({ business_id: business.id, client_id, client_name, /* ... */, status, expires_at })
  .select('id, cancel_token').single()
if (insertErr || !appt) {
  if (insertErr?.code === '23505' || insertErr?.code === '23P01') return { ok: false, error: 'slot_taken', status: 409 } // 011 / 013
  console.error('[booking-core] insert error:', insertErr?.message)
  return { ok: false, error: 'insert_failed', status: 500 }
}
```

**Do NOT migrate into the core:** reCAPTCHA, plan gate, `getBusinessSecrets`, emails, Google Calendar. (RESEARCH Pitfall 2 — if the core imports `lib/email` or `lib/recaptcha`, it migrated too much.)

---

### `app/api/appointments/create/route.ts` (route, request-response) — CREATE

**Analogs:** `app/api/booking/create/route.ts` (pipeline/after/gcal) + `app/(dashboard)/clients/page.tsx:5-16` (auth.getUser + business by owner_id).

**Imports pattern** (mix of both analogs):
```typescript
import { after } from 'next/server'                 // route.ts:1
import { createClient } from '@/lib/supabase/server' // page.tsx:1 — anon+RLS, NOT admin
import { getBusinessSecrets } from '@/lib/business-secrets'
import { createCalendarEvent } from '@/lib/google-calendar'
import { createAppointmentCore } from '@/lib/booking-core'
```

**Auth + tenant-by-owner pattern** (from `clients/page.tsx:6-16`, adapted to a route handler returning JSON not redirect):
```typescript
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })
const { data: business } = await supabase
  .from('businesses').select('id, name, address, buffer_minutes')
  .eq('owner_id', user.id)   // tenant = ACTOR, not slug
  .single()
if (!business) return Response.json({ ok: false, error: 'not_found' }, { status: 404 })
```

**Defensive body parse** (copy style from `route.ts:22-43`): `try { raw = await request.json() } catch { return 400 'bad_request' }`, then `typeof body.x === 'string' ? ... : default` narrowing. Errors `{ ok: false, error: '<snake>' }`.

**Core call** (D-01: manual is always confirmed):
```typescript
const result = await createAppointmentCore({
  supabase, business, serviceId, professionalId, locationId,
  date, time, clientId, clientName, clientPhone, clientEmail, notes,
  requireDeposit: false,   // D-01 — no seña, status='confirmed', expires_at=null
})
if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: result.status })
```

**GCal best-effort in after()** (copy structure from `route.ts:247-265`; token read via `getBusinessSecrets` = server-only service-role, the ONE allowed admin read per RESEARCH anti-pattern note). **No email** (D-01).

---

### `components/dashboard/nuevo-turno-form.tsx` (component, request-response) — CREATE (suggested)

**Analogs:** modal markup `appointments-client.tsx:545-639` (fields/Select/Label/Input layout to reproduce visually) + in-memory client filter `clients-client.tsx:176-191`.

**Responsive shell (D-09):** `Dialog` (`@/components/ui/dialog`) on `≥768px`, `Drawer` (`@/components/ui/drawer`, vaul) on `<768px`. **Both components exist** (verified `ls components/ui/`). Reproduce the field layout exactly from the existing modal (grid-cols-2 gap-3, `Label` + `Input`/`Select`, `space-y-3 mt-2`).

**Client combobox (D-03/D-04):** `command.tsx` does NOT exist → build with `Input` + in-memory filtered list over `initialClients` (already loaded by `business_id`). Dedupe normalization to mirror server authority (copy from `clients-client.tsx:180-181`):
```typescript
// email → toLowerCase(); phone → replace(/\D/g, '')
if (c.email) { const k = c.email.toLowerCase() }
if (c.phone) { const k = c.phone.replace(/\D/g, '') }
```
Plus a "Crear nuevo cliente" inline branch (name + contact). Server is the dedupe authority; UI is optimistic suggestion.

**Submit:** `fetch('/api/appointments/create', { method: 'POST', body: JSON.stringify(...) })` then `toast` + `router.refresh()` (NOT a direct supabase insert).

---

### `app/api/booking/create/route.ts` (route) — MODIFY (refactor to consume core)

Replace the inline chain `route.ts:81-241` with a call to `createAppointmentCore(...)`. **Keep OUTSIDE the core** (lines stay in this file): reCAPTCHA `:74-79`, plan gate `:63-65`, `getBusinessSecrets` `:69`, expired-hold emails `:152-176`, pending-payment email `:271-294`, GCal `:247-265`. Pass `requireDeposit`/`depositExpiryHours` from `business`. Consume `result.cancelledHoldIds` to drive the hold emails in this file's `after()`. **Regression guard:** Vitest TEST-01 must stay green (RESEARCH Pitfall 2 / Wave 0).

---

### `app/(dashboard)/appointments/appointments-client.tsx` (component) — MODIFY

Replace `handleCreate` (`:288-330`) direct anon+RLS inserts with `fetch('/api/appointments/create')`. **Keep** the 23505/23P01 → toast translation already at `:320-323` as the client-side message; the server now returns `slot_taken` (409). Keep the modal markup (`:545-639`) — only the submit changes. After success: `router.refresh()` (or optimistic push as today `:326`) + close + reset form `:328`.

**fetch + toast pattern to copy** (from `agenda-client.tsx:83-86`):
```typescript
const res = await fetch('/api/...', { method: 'POST' })
if (res.ok) { toast.success('...'); router.refresh() } else toast.error('...')
```

---

### `app/(dashboard)/agenda/agenda-client.tsx` (component) — MODIFY

Add "Nuevo turno" button rendering the shared `NuevoTurnoForm`. Scope decision (RESEARCH Open Q1 / Pitfall 3): **NO hour-grid** — Agenda is a weekly summary, not an hour×day grid. "Click en slot" = click a day in the weekly summary pre-fills the date (acotado). After create: `router.refresh()` (pattern `:85,97`).

---

### `supabase/migrations/040-*.sql` (migration, DDL) — CREATE (hardening, optional)

**Analog:** `fixed_expenses` `FOR INSERT WITH CHECK` (`baseline.sql:1272-1274`):
```sql
CREATE POLICY "fixed_expenses tenant insert" ON "public"."fixed_expenses"
  FOR INSERT WITH CHECK (("business_id" IN (
    SELECT "businesses"."id" FROM "public"."businesses"
    WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));
```

**Current state of target tables** (verified `baseline.sql:1203-1217`): `appointments` and `clients` have `CREATE POLICY "business member access" ... USING(business_id IN <owner's businesses>)` with **no command clause (= FOR ALL) and no WITH CHECK**. Per Postgres, `FOR ALL` without `WITH CHECK` reuses `USING` as the insert check → **owner INSERT already works tenant-safe** (RESEARCH Summary / Pitfall 1 — this is NOT a functional blocker). Migration 040 adds explicit `FOR INSERT ... WITH CHECK (business_id = ...)` on both tables for clarity/hardening per the RLS skill. New migration number = **040+** on top of the replayable baseline (per MEMORY infra-testing-roadmap). Verify with `supabase db reset` + cross-tenant insert (must fail).

## Shared Patterns

### Tenant isolation (defense in depth)
**Source:** `.claude/skills/supabase-multitenant-rls/SKILL.md` + `app/api/booking/create/route.ts` (every entity `.eq('business_id', business.id)`).
**Apply to:** core, route handler, migration. Business resolved by `owner_id` (manual) / `slug` (public) — never from client. Every service/professional/location ID re-validated against `business_id` before use.

### Error shape
**Source:** repo convention + `route.ts:234-241`.
**Apply to:** core + route handler.
```typescript
Response.json({ ok: false, error: '<snake_case>' }, { status })
// codes: bad_request(400) missing_fields(400) invalid_service(400) invalid_professional(400)
//        unauthorized(401) not_found(404) slot_taken(409) insert_failed(500)
```

### Best-effort side effects in after()
**Source:** `route.ts:247-265`.
**Apply to:** GCal in the new route handler; hold emails in the refactored public route.
```typescript
after(async () => { try { /* ... */ } catch (e) { console.error('[appointments/create] gcal FALLÓ:', e instanceof Error ? e.message : e) } })
```

### Authenticated session guard
**Source:** `clients/page.tsx:6-16` (page redirect) → route-handler variant returns 401 JSON.
**Apply to:** the new route handler.

## No Analog Found

None — every file maps to an existing in-repo pattern. (The shared `lib/booking-core.ts` is an extraction of existing code, not a new abstraction.)

## Metadata

**Analog search scope:** `app/api/booking/`, `app/(dashboard)/{appointments,agenda,clients}/`, `components/ui/`, `supabase/migrations/`.
**Files scanned:** booking/create/route.ts (full), appointments-client.tsx (ranges), clients/page.tsx (full), clients-client.tsx (range), agenda-client.tsx (range), baseline.sql (RLS sections), components/ui/ listing.
**Verified this session:** `drawer.tsx` exists; `command.tsx` does not; `appointments`/`clients` policies are `FOR ALL USING` without `WITH CHECK`; `fixed_expenses` insert policy at baseline:1272.
**Pattern extraction date:** 2026-06-26
