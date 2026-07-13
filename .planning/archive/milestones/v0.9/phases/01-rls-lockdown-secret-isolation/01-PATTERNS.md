# Phase 1: RLS Lockdown + Secret Isolation - Pattern Map

**Mapped:** 2026-06-15
**Files analyzed:** 1 new (migration 027) + ~12 changed (libs/routes/types)
**Analogs found:** 13 / 13 (every artifact has an in-repo analog — this is a twin of work already done in migrations 007/026)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `supabase/migrations/027_*.sql` (NEW) | migration | transform (DDL) | `026_public_businesses_view.sql` + `007_professionals_extended.sql` | exact |
| ↳ `public_services` / `public_business_hours` views | migration | bounded read | `public_businesses` (026:27-48), `public_professionals` (007:20-24) | exact |
| ↳ `DROP POLICY` on `services` / `business_hours` | migration | DDL | 026:54, 007:29 | exact |
| ↳ `CREATE TABLE business_secrets` + owner-only RLS | migration | DDL | `businesses` table (schema 14-26) + `"owner access"` policy (schema 102-103) | role-match |
| `lib/payment.ts` | service lib | CRUD (read+write secrets) | itself — repoint `.from('businesses')` (47-55) to `business_secrets` | self |
| `lib/recaptcha.ts` | service lib | request-response | itself — repoint select (16-24) | self |
| `lib/email.ts` | service lib | transform | callers pass secrets in; type-only change | self |
| `lib/google-calendar.ts` | service lib | request-response | itself — secrets arrive as args; callers repoint | self |
| `app/api/payment/webhook/[slug]/route.ts` | route | event-driven | itself — `select('*')` landmine (43-52) | self (D-03) |
| `app/api/booking/create/route.ts` | route | request-response | itself — targeted select (47-52) | self |
| `lib/types.ts` | model | n/a | existing `PublicBusiness` Omit (98) | self |
| `lib/supabase/admin.ts` | config | n/a | unchanged — the canonical service-role plane | reuse as-is |

## Pattern Assignments

### `supabase/migrations/027_*.sql` — bounded views (services + business_hours)

**Analog:** `supabase/migrations/026_public_businesses_view.sql:27-54` and `007_professionals_extended.sql:20-29`

**Exact template to replicate** (007:20-29):
```sql
CREATE OR REPLACE VIEW public_professionals AS
  SELECT id, business_id, name, specialty, active
  FROM professionals
  WHERE active = true;
GRANT SELECT ON public_professionals TO anon, authenticated;
DROP POLICY IF EXISTS "public read professionals" ON professionals;
```

**Policy names to DROP** (verified in `schema.sql`):
- `services`: `DROP POLICY IF EXISTS "public read services" ON services;` (schema.sql:145-146 created it `USING (true)`)
- `business_hours`: `DROP POLICY IF EXISTS "public read hours" ON business_hours;` (schema.sql:147-149)

**Columns the bounded views must expose** (non-secret; from `lib/types.ts` Service/BusinessHour and schema):
- `public_services`: `id, business_id, name, duration_minutes, price, description, active, location_id, location_ids, created_at` (Service shape, types.ts:114-127). Note `active = true` filter mirrors 007.
- `public_business_hours`: `id, business_id, day_of_week, open_time, close_time, is_open` (BusinessHour shape, types.ts:129-136). All columns are non-sensitive — no filter needed beyond the view.

**Idempotency invariants** (header comment in 026:16-17, repeat verbatim style): `CREATE OR REPLACE VIEW`, `GRANT` (re-appliable), `DROP POLICY IF EXISTS`, `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`. No `DROP TABLE / DROP COLUMN / DELETE` until the final coordinated step (D-02 step d).

---

### `supabase/migrations/027_*.sql` — `business_secrets` table + owner-only RLS

**Analog for table shape:** `businesses` CREATE TABLE (schema.sql:14-26) — same `id UUID DEFAULT gen_random_uuid() PRIMARY KEY` + `business_id UUID REFERENCES businesses(id) ON DELETE CASCADE` FK pattern used by every child table (e.g. services schema.sql:41).

**Analog for owner-only RLS:** the `businesses` `"owner access"` policy (schema.sql:102-103) is the canonical owner-only gate:
```sql
CREATE POLICY "owner access" ON businesses
  FOR ALL USING (owner_id = auth.uid());
```
For a child table keyed by `business_id`, the canonical owner-only shape is the `"business member access"` subquery (schema.sql:112-114, used by services/business_hours/clients/appointments):
```sql
CREATE POLICY "business member access" ON services
  FOR ALL USING (business_id IN (
    SELECT id FROM businesses WHERE owner_id = auth.uid()
  ));
```
**Pattern to replicate for `business_secrets`:** `ENABLE ROW LEVEL SECURITY` + ONE owner-only policy using the `business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid())` subquery. **Critically: do NOT create any `"public read ..." FOR SELECT USING (true)` policy** — that omission is the whole point (contrast schema.sql:139-149 which is the bug being fixed). `anon` gets no policy → no read. Service-role reads bypass RLS.

**Columns to host** (the secret fields lifted off `businesses`, per types.ts:26-48): `mp_access_token, mp_refresh_token, mp_token_expires_at, resend_api_key, resend_from, recaptcha_secret_key, google_refresh_token`. Keyed by `business_id` (unique, FK `ON DELETE CASCADE`).

**Data-move pattern (additive-first, D-02):** `INSERT INTO business_secrets (business_id, ...) SELECT id, mp_access_token, ... FROM businesses` inside the same migration, BEFORE any column drop. Drop of the `businesses` secret columns is deferred to step (d) — a separate later migration or the final block, only after code repoint + fallback are confirmed live (PITFALLS "mover-no-copiar" / migration-order).

---

### `lib/payment.ts` (service, CRUD — read AND write)

**Analog:** itself. Current read/write both target `businesses` via `createAdminClient()`.

**Write path to repoint** (payment.ts:47-56):
```typescript
const supabase = createAdminClient()
await supabase
  .from('businesses')
  .update({ mp_access_token: ..., mp_refresh_token: ..., mp_token_expires_at: ... })
  .eq('id', business.id)
```
→ becomes `.from('business_secrets').update({...}).eq('business_id', business.id)`. **MP rotates the refresh token every use (ARCHITECTURE blast-radius row), so this write is load-bearing — it must move, not just the read.** The `MpTokenBusiness` interface (payment.ts:24-29) stays the same shape; only the source table changes.

---

### `lib/recaptcha.ts` (service, request-response)

**Analog:** itself (recaptcha.ts:16-24):
```typescript
const supabase = createAdminClient()
const { data: business } = await supabase
  .from('businesses')
  .select('recaptcha_secret_key')
  .eq('slug', slug)
  .single()
if (business?.recaptcha_secret_key) secretKey = business.recaptcha_secret_key
```
**Repoint pattern:** resolve `business_id` from `slug` first (the public lookup), then `.from('business_secrets').select('recaptcha_secret_key').eq('business_id', id)`. Keep fail-open-when-absent behavior (recaptcha.ts:26-30) intact — with fallback to `businesses` during the transition window (D-02 step b).

---

### `lib/email.ts` & `lib/google-calendar.ts` (service libs — secrets arrive as args)

**Analog:** itself. Verified: neither lib queries the DB for secrets — `email.ts` takes `resendApiKey`/`resendFrom` as function params (e.g. `resolveSender`, email.ts:15-30; every `send*` signature, e.g. 104-105) and `google-calendar.ts` takes `refreshToken` as the first arg of every fn (e.g. `createCalendarEvent`, google-calendar.ts:103). **No change inside these libs** — the change is at the CALL SITES that fetch those secrets off `businesses` and pass them in (webhook route, booking route, etc.). This narrows the blast radius: the repoint is concentrated in the callers.

---

### `app/api/payment/webhook/[slug]/route.ts` (route, event-driven) — THE LANDMINE (D-03)

**Analog:** itself. The trap (route.ts:43-52):
```typescript
const { data: business } = await supabase
  .from('businesses')
  .select('*')          // ← returns undefined for dropped secret cols, NO SQL error
  .eq('slug', slug)
  .single()
if (!business?.mp_access_token) {   // ← silently true after drop → stops confirming paid turns
  console.log(`Webhook: negocio ${slug} sin MP token`); return
}
```
Then it reads `business.mp_access_token` (55), `business.resend_api_key`/`resend_from` (127-128, 155-156), `business.google_refresh_token` (165, 195). **Repoint pattern:** keep the non-secret `businesses` read (rename `select('*')` to an explicit non-secret column list to make the dependency visible — anti-`select('*')`), add a second `business_secrets.select('mp_access_token, resend_api_key, resend_from, google_refresh_token').eq('business_id', business.id)` read, and merge. Must ship with a `businesses` fallback (D-02) so it never silently breaks during the coordinated deploy.

---

### `app/api/booking/create/route.ts` (route, request-response)

**Analog:** itself. Already uses a targeted select (route.ts:47-52) — the good pattern, contrast the webhook's `select('*')`:
```typescript
.from('businesses')
.select('id, name, slug, address, require_deposit, deposit_amount, deposit_expiry_hours, buffer_minutes, primary_color, logo_url, resend_api_key, resend_from, google_refresh_token')
```
**Repoint pattern:** drop `resend_api_key, resend_from, google_refresh_token` from this select; add a `business_secrets` read keyed by `business.id` (the row is already fetched, `business.id` is in scope at line 52). Secrets are consumed downstream at email/gcal call sites (149-153, 230-247, 270-271) — pass them through from the new source. Tenant re-validation pattern (`.eq('business_id', business.id)`, used throughout 70/83/99/131/184) is exactly how `business_secrets` should be queried.

---

### `lib/types.ts` (model)

**Analog:** the existing `PublicBusiness` Omit (types.ts:98):
```typescript
export type PublicBusiness = Omit<Business, 'mp_access_token' | 'mp_refresh_token' | 'notification_email' | 'resend_api_key' | 'recaptcha_secret_key' | 'google_refresh_token'>
```
**Pattern to replicate:** introduce `BusinessSecrets` carrying the 7 lifted fields (mp_access_token, mp_refresh_token, mp_token_expires_at, resend_api_key, resend_from, recaptcha_secret_key, google_refresh_token) + `business_id`, and strip those fields from the `Business` interface (types.ts:26-48). snake_case preserved (no camelCase rename — code_context Established Patterns). `PublicBusiness` Omit can then shrink since the secret fields no longer live on `Business`. Keep `recaptcha_site_key` on `Business` — it is public by design (026:24).

## Shared Patterns

### Service-role access plane (the ONLY client that may touch `business_secrets`)
**Source:** `lib/supabase/admin.ts:3-8`
**Apply to:** every secret read/write in payment.ts, recaptcha.ts, webhook route, booking route, google/* routes, mercadopago/* routes.
```typescript
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
```
Never read `business_secrets` from `lib/supabase/public.ts` or `server.ts` (ARCHITECTURE Anti-Pattern 2). Dashboard owner reads expose presence/booleans only (D-05), via service role.

### Tenant re-validation by `business_id`
**Source:** `app/api/booking/create/route.ts:70, 83, 99, 131` (`.eq('business_id', business.id)`)
**Apply to:** every `business_secrets` query → `.eq('business_id', id)`, never `.eq('slug', ...)` directly on secrets (resolve slug→id off `businesses`/`public_businesses` first).

### Idempotent, non-destructive migration header
**Source:** `026_public_businesses_view.sql:16-17`, `007_professionals_extended.sql:7-8`
**Apply to:** migration 027 — `CREATE OR REPLACE VIEW`, `GRANT`, `DROP POLICY IF EXISTS`, `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`; no destructive ops until the final coordinated drop step.

## No Analog Found

None. Every artifact is a twin of existing work (migrations 007/026, the established owner-only RLS policies, the service-role plane, and the existing `PublicBusiness` Omit). The planner should NOT fall back to RESEARCH.md generic examples — the in-repo analogs are exact.

## Caveats for the Planner

- **`select('*')` is the silent landmine** (D-03 / ARCHITECTURE:113-123): the webhook repoint MUST replace `select('*')` with an explicit non-secret column list and ship in the same coordinated deploy as the migration, with a `businesses` fallback during transition (D-02).
- **Write path matters** in `lib/payment.ts:47-56` — MP rotates refresh tokens; the update must move to `business_secrets`, not just the read.
- **email.ts / google-calendar.ts need NO internal change** — secrets arrive as args; repoint only the callers. This shrinks the perceived 20-file blast radius.
- **Column completeness of the views** (PITFALLS #5): verify `/[slug]` public page reads everything it needs from `public_services` / `public_business_hours` before dropping the `USING(true)` policies.

## Metadata

**Analog search scope:** `supabase/migrations/`, `supabase/schema.sql`, `lib/`, `lib/supabase/`, `app/api/payment/`, `app/api/booking/`
**Files scanned:** 11 read in full/targeted + schema grep
**Pattern extraction date:** 2026-06-15
