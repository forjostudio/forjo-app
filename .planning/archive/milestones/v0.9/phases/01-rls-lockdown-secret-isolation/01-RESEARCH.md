# Phase 1: RLS Lockdown + Secret Isolation (SEC-01) - Research

**Researched:** 2026-06-15
**Domain:** Supabase Postgres RLS + bounded public views + secret table isolation (Next.js 16 App Router, hand-applied migrations)
**Confidence:** HIGH (every claim verified directly against repo files — schema.sql, migrations 001/007/008/019/021/022/025/026, and the 8 secret-reader files)

## Summary

The domain research (ARCHITECTURE.md / PITFALLS.md) is already phase-1-ready. This document delivers the CONCRETE implementation decisions the planner needs: exact DDL, exact policy names to drop, the exact column lists for the bounded views, the hand-applied migration runbook, and the per-file fallback read pattern. Nothing here is theory — column names and policy names were read from the actual files.

Two facts reshape the plan versus the brief's mental model:

1. **`business_hours` is NOT read by any public/anon path.** The public booking page (`app/[slug]/page.tsx`) reads `time_blocks`, not `business_hours`. `business_hours` is only written in onboarding (authenticated) and read nowhere by anon. Its `public read hours` `USING(true)` policy is still a real anon-read hole on a base table, so we still DROP it — but its bounded view is pure defense-in-depth / consistency, not load-bearing. **Do not break the booking page chasing a `business_hours` view; the booking page never reads it.**
2. **`services` IS read directly by anon today** at `app/[slug]/page.tsx:33` via `supabase.from('services').select('*')` against the base table (anon key). That is the live hole for `services`. The repoint of that one line to `public_services` is the load-bearing change for SEC-01's `services` half.

**Primary recommendation:** Ship migration `027` additive-first (create `business_secrets` + copy data + create `public_services`/`public_business_hours` + GRANT — NO drops). Deploy code that reads secrets from `business_secrets` with a fallback to `businesses`, and reads `services` from `public_services`. Confirm live. THEN run migration `028` (the destructive half: `DROP POLICY` the three `USING(true)` policies, drop/null the secret columns on `businesses`). Splitting into two migrations is what makes the by-hand apply safe.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Lock anon out of `services`/`business_hours` base tables | DB (RLS policy + view) | — | RLS is the only real boundary for the anon PostgREST surface |
| Expose safe public columns | DB (security-definer view) | — | Owner-rights view bypasses base-table RLS, exposes only safe cols |
| Store per-tenant secrets | DB (`business_secrets`, owner-only RLS) | — | Physical separation makes column exposure structurally impossible |
| Read secrets server-side | Shared lib / route handler (service role) | DB | `createAdminClient()` bypasses RLS; only it touches `business_secrets` server-side |
| Owner reads/writes own secrets (dashboard) | Frontend server + session client (owner-RLS) | DB | Settings form edits secrets; owner-`authenticated` RLS lets the session client write |
| Public booking page render | Frontend server (anon/public client) | DB (views) | Reads only bounded views; never the locked base tables |

## Standard Stack

No new runtime dependencies. SEC-01 is pure SQL + repoints using the already-installed `@supabase/supabase-js ^2.106.2` and the existing `createAdminClient()` (service role) / `createClient()` (session) / `createPublicServerClient()` (anon) clients. `crypto` built-ins are not needed in this phase (they're for SEC-02/03).

**Installation:** none.

## Package Legitimacy Audit

Not applicable — this phase installs no external packages. (Verified: no `npm install` in scope; only SQL migrations and edits to existing TS files.)

---

## 1. DDL: `business_secrets` table

Verified secret columns currently on `businesses` and where each was added:

| Column | Added in | Type | Move to `business_secrets`? |
|--------|----------|------|------------------------------|
| `mp_access_token` | `001` | TEXT | YES (secret) |
| `mp_refresh_token` | `022` | text | YES (secret) |
| `mp_token_expires_at` | `022` | timestamptz | YES (companion — read/written next to MP tokens in `lib/payment.ts`) |
| `mp_user_id` | `022` | text | **NO — keep on `businesses`.** Not a secret (it's the MP account id); the dashboard uses it as a non-secret flag (`!!business.mp_user_id` to detect OAuth vs manual). Already excluded from `public_businesses`. |
| `resend_api_key` | `001` | TEXT | YES (secret) |
| `resend_from` | `008` | TEXT | YES (companion — always read alongside `resend_api_key`; the email sender pairs them; keeping them together avoids a split read) |
| `recaptcha_secret_key` | `001` | TEXT | YES (secret) |
| `recaptcha_site_key` | `001` | TEXT | **NO — keep on `businesses`.** Public by design (rendered in the browser; already IN `public_businesses`). |
| `google_refresh_token` | `021` | text | YES (secret) |
| `notification_email` | `001`-era | TEXT | **NO — keep on `businesses`.** Not a credential; it's the owner's contact email. Already excluded from `public_businesses` (internal but not secret). Leave it where it is to avoid widening scope. |

So `business_secrets` holds exactly **7 columns**: `mp_access_token`, `mp_refresh_token`, `mp_token_expires_at`, `resend_api_key`, `resend_from`, `recaptcha_secret_key`, `google_refresh_token`. `[VERIFIED: repo — migrations 001/008/021/022 + lib/payment.ts + email.ts + recaptcha.ts]`

### Recommended DDL (goes in migration 027, additive-first)

```sql
-- business_secrets: una fila por negocio, keyed por business_id. RLS solo-dueño,
-- SIN policy de lectura anon. El service role (lib/supabase/admin.ts) la lee/escribe
-- server-side bypassando RLS; el dueño (session client) accede SOLO a la suya por la
-- policy owner-only de abajo (mismo patrón que "owner access" en businesses).
CREATE TABLE IF NOT EXISTS business_secrets (
  business_id UUID PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  mp_access_token TEXT,
  mp_refresh_token TEXT,
  mp_token_expires_at TIMESTAMPTZ,
  resend_api_key TEXT,
  resend_from TEXT,
  recaptcha_secret_key TEXT,
  google_refresh_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE business_secrets ENABLE ROW LEVEL SECURITY;

-- Owner-only: el dueño accede SOLO a los secretos de SUS negocios. Mismo shape que la
-- policy "business member access" de services/business_hours (subselect por owner_id).
-- NO hay policy para anon → el rol anon no puede leer ni una fila (RLS deniega por defecto).
DROP POLICY IF EXISTS "owner access secrets" ON business_secrets;
CREATE POLICY "owner access secrets" ON business_secrets
  FOR ALL USING (business_id IN (
    SELECT id FROM businesses WHERE owner_id = auth.uid()
  ));

-- Copiar los valores actuales desde businesses (idempotente: ON CONFLICT DO NOTHING para
-- no pisar un valor ya migrado si se re-corre). Solo filas con al menos un secreto seteado.
INSERT INTO business_secrets (
  business_id, mp_access_token, mp_refresh_token, mp_token_expires_at,
  resend_api_key, resend_from, recaptcha_secret_key, google_refresh_token
)
SELECT
  id, mp_access_token, mp_refresh_token, mp_token_expires_at,
  resend_api_key, resend_from, recaptcha_secret_key, google_refresh_token
FROM businesses
ON CONFLICT (business_id) DO NOTHING;
```

**Why `business_id` as PK (not a separate `id`):** one-to-one with `businesses`, every read is `.eq('business_id', id)` / `.single()`, the FK + PK in one column is the simplest shape and matches how every reader queries it. `[VERIFIED: blast-radius reads are all keyed by business id or slug]`

**Why `ON DELETE CASCADE`:** mirrors every other tenant table's FK to `businesses` (`professionals`, `services`, etc. all `ON DELETE CASCADE` in schema.sql). Deleting a business must take its secrets with it. `[VERIFIED: schema.sql lines 31,41,53,...]`

**Why owner-only RLS uses the `business_id IN (SELECT ... owner_id = auth.uid())` shape, not `owner_id = auth.uid()` directly:** `business_secrets` has no `owner_id` column; it joins through `businesses`. This is the EXACT shape the base schema already uses for `services`/`business_hours`/`clients`/`appointments`. `[VERIFIED: schema.sql lines 106-133]`

---

## 2. DDL: bounded public views for `services` and `business_hours`

### `public_services`

Verified `services` columns: base = `id, business_id, name, duration_minutes, price, description, active, created_at` (schema.sql 39-48) + `location_id` (019) + `location_ids` (025). **None are sensitive** — services are public catalog data. The public page needs all of them (it does `select('*')`). So the view is the full column set (no secret to exclude; the value is closing the base-table `USING(true)` hole + consistency with the 026/007 pattern). `[VERIFIED: schema.sql + migrations 019/025 + app/[slug]/page.tsx:33]`

```sql
-- Vista pública acotada de servicios. services no tiene columnas secretas, pero la lectura
-- pública pasa de la tabla ENTERA (policy "public read services" USING(true)) a esta vista,
-- igual que 026 para businesses y 007 para professionals. Corre como su dueño (bypassa RLS),
-- expone solo el catálogo. Incluye id y business_id (filtrado/joins downstream los necesitan).
CREATE OR REPLACE VIEW public_services AS
  SELECT
    id,
    business_id,
    name,
    duration_minutes,
    price,
    description,
    active,
    location_id,
    location_ids,
    created_at
  FROM services
  WHERE active = true;
GRANT SELECT ON public_services TO anon, authenticated;
```

**Note on `WHERE active = true`:** the public page already filters `.eq('active', true)` (line 33), and `public_professionals` (007) bakes `WHERE active = true` into the view. Baking it in matches the established pattern and means the booking page can drop its `.eq('active', true)`. Either is fine; baking it in is more consistent. `[CITED: migration 007 public_professionals pattern]`

### `public_business_hours`

`business_hours` columns: `id, business_id, day_of_week, open_time, close_time, is_open` (schema.sql 51-58). None sensitive. **No public reader exists** (booking uses `time_blocks`), so this view is defense-in-depth + consistency only.

```sql
-- Vista pública acotada de horarios. NOTA: hoy NINGÚN path público lee business_hours (la
-- reserva pública usa time_blocks). Esta vista es consistencia + defensa en profundidad para
-- que, si algún día un path público lee horarios, lea la vista y no la tabla. El DROP de la
-- policy abierta (abajo) es lo que realmente cierra el agujero de anon sobre la tabla base.
CREATE OR REPLACE VIEW public_business_hours AS
  SELECT
    id,
    business_id,
    day_of_week,
    open_time,
    close_time,
    is_open
  FROM business_hours;
GRANT SELECT ON public_business_hours TO anon, authenticated;
```

### Exact policy names to DROP (verified against schema.sql lines 144-149)

```sql
DROP POLICY IF EXISTS "public read services" ON services;
DROP POLICY IF EXISTS "public read hours" ON business_hours;
```

⚠ The policy on `business_hours` is named **`"public read hours"`** (NOT `"public read business_hours"`). Verified at schema.sql:147. Getting this name wrong makes the DROP a silent no-op and leaves the hole open. `[VERIFIED: schema.sql:144-149]`

**Critical (Pitfall 2):** Do NOT add `WITH (security_invoker = true)` to these views. They must run as owner (security-definer, the Postgres default) so they bypass the base-table RLS after the `USING(true)` policy is dropped. With `security_invoker=true`, the view would run as anon against a now-locked table and return zero rows → blank booking page. `[CITED: PostgreSQL CREATE VIEW defaults; PITFALLS.md Pitfall 2]`

---

## 3. Hand-applied migration sequence (NO `supabase db push`)

This project applies migrations BY HAND in the Supabase SQL editor (no CLI adopted — backlog v2). The safe order is **additive-first across TWO migration files**, with the code deploy in between. `[VERIFIED: migrations/README.md "correr ... en el SQL editor de Supabase"; PROJECT.md constraint]`

**Next free migration number: `027`** (last is `026_public_businesses_view.sql`; confirmed via directory listing — files run 001…026 + README). The destructive half is `028`. `[VERIFIED: directory listing of supabase/migrations/]`

### Runbook (PowerShell-friendly — copy SQL into the Supabase SQL editor; no bash)

**Step 1 — apply `027_business_secrets_and_public_views.sql` (additive, non-destructive):**
- `CREATE TABLE IF NOT EXISTS business_secrets` + enable RLS + `CREATE POLICY "owner access secrets"`
- `INSERT ... SELECT ... ON CONFLICT DO NOTHING` (copy values from `businesses`)
- `CREATE OR REPLACE VIEW public_services` + `GRANT SELECT ... TO anon, authenticated`
- `CREATE OR REPLACE VIEW public_business_hours` + `GRANT SELECT ... TO anon, authenticated`
- **NO `DROP POLICY`. NO `DROP COLUMN`.** Old code still works (reads `businesses` and the `services` base table). New table + views now also exist.
- This migration is fully idempotent (`IF NOT EXISTS`, `CREATE OR REPLACE VIEW`, `DROP POLICY IF EXISTS` before `CREATE POLICY`, `ON CONFLICT DO NOTHING`).

**Step 2 — deploy the code (Vercel):**
- All secret readers read from `business_secrets` **with fallback to `businesses`** (see §4).
- `app/[slug]/page.tsx` reads `services` from `public_services`.
- Dashboard settings reads/writes secrets to `business_secrets` (owner session client).

**Step 3 — confirm live (manual checks):**
- Public booking `/[slug]` renders services + the page loads (smoke test).
- A test deposit booking confirms (webhook path reads `business_secrets`).
- Owner settings page shows the existing secret values (read from `business_secrets`) and a save round-trips.
- Anon REST probe: `select=mp_access_token` against `businesses` still returns it ONLY because columns still exist — this is expected until step 4.

**Step 4 — apply `028_lock_base_tables_and_drop_secret_columns.sql` (destructive half):**
- `DROP POLICY IF EXISTS "public read services" ON services;`
- `DROP POLICY IF EXISTS "public read hours" ON business_hours;`
- Drop (or null) the 7 secret columns from `businesses`:
  - **Recommended: `ALTER TABLE businesses DROP COLUMN IF EXISTS <col>;` for the 7 secret columns** (`mp_access_token`, `mp_refresh_token`, `mp_token_expires_at`, `resend_api_key`, `resend_from`, `recaptcha_secret_key`, `google_refresh_token`). This breaks the repo's "no DROP COLUMN" convention deliberately and with review — the whole point of SEC-01 is removing the secrets from the publicly-policied table. Document the exception with a `⚠` comment (the README already documents one such marked exception for the 002 backfill).
  - **Alternative if DROP COLUMN feels too risky for a first pass:** `UPDATE businesses SET <col> = NULL` for all 7. This closes the data exposure but leaves the columns; the fallback reads in §4 then always miss and fall through to `business_secrets`. A follow-up migration drops the columns later. Slightly safer rollback, but leaves dead columns. **Recommend DROP COLUMN** — cleaner, and `026` already removed the anon read policy on `businesses` so the columns are only reachable by service role anyway; dropping them removes the `select('*')` ambiguity entirely.

**Step 5 — after `028` is live, REMOVE the `businesses` fallback** from the readers (cleanup migration of code, not SQL) so the transition shim doesn't linger. This can be a follow-up commit in the same phase or a tracked cleanup task.

### Verification queries (run in SQL editor after `028`)

```sql
SELECT relrowsecurity FROM pg_class WHERE relname IN ('services','business_hours','business_secrets');  -- all true
SELECT polname FROM pg_policy WHERE polrelid = 'services'::regclass;       -- no "public read services"
SELECT polname FROM pg_policy WHERE polrelid = 'business_hours'::regclass; -- no "public read hours"
\d businesses   -- secret columns gone (or null if you chose the UPDATE path)
```

---

## 4. Backward-compatible fallback read pattern (D-02)

During the window between deploy (step 2) and the column drop (step 4), code must read from `business_secrets` first and fall back to `businesses`. After step 4 the `businesses` fields are gone (return `undefined`), so the fallback naturally becomes a no-op. The recommended shape is a single shared helper so the fallback logic lives in one place.

### Recommended helper: `lib/business-secrets.ts` (NEW)

```typescript
import { createAdminClient } from '@/lib/supabase/admin'

export interface BusinessSecrets {
  mp_access_token: string | null
  mp_refresh_token: string | null
  mp_token_expires_at: string | null
  resend_api_key: string | null
  resend_from: string | null
  recaptcha_secret_key: string | null
  google_refresh_token: string | null
}

const EMPTY: BusinessSecrets = {
  mp_access_token: null, mp_refresh_token: null, mp_token_expires_at: null,
  resend_api_key: null, resend_from: null, recaptcha_secret_key: null,
  google_refresh_token: null,
}

// Lee los secretos de un negocio por business_id, SOLO con service role (server-only).
// Durante la transición (027 aplicado, 028 todavía no): si business_secrets no tiene fila,
// cae a las columnas de businesses. Tras 028 esas columnas no existen → fallback es no-op.
export async function getBusinessSecrets(businessId: string): Promise<BusinessSecrets> {
  const supabase = createAdminClient()
  const { data: secrets } = await supabase
    .from('business_secrets')
    .select('mp_access_token, mp_refresh_token, mp_token_expires_at, resend_api_key, resend_from, recaptcha_secret_key, google_refresh_token')
    .eq('business_id', businessId)
    .maybeSingle()
  if (secrets) return { ...EMPTY, ...secrets }

  // Fallback transición: leer de businesses (columnas que aún existen pre-028).
  const { data: biz } = await supabase
    .from('businesses')
    .select('mp_access_token, mp_refresh_token, mp_token_expires_at, resend_api_key, resend_from, recaptcha_secret_key, google_refresh_token')
    .eq('id', businessId)
    .maybeSingle()
  return biz ? { ...EMPTY, ...biz } : EMPTY
}
```

**Owner-side variant for the dashboard** (settings save) needs the session client, not service role, so the write goes through owner RLS. Provide a parallel `upsert` using the session client:

```typescript
// En settings: el dueño guarda SUS secretos. Va por el session client (createClient()),
// la policy "owner access secrets" lo autoriza solo para SU business_id. upsert por la PK.
await supabase.from('business_secrets').upsert({
  business_id: business.id,
  mp_access_token: mpToken || null,
  // ...resto de campos del form de secretos
}, { onConflict: 'business_id' })
```

### Per-file repoint map (the ~20 files — verified selects)

| File | Today | Repoint |
|------|-------|---------|
| `lib/payment.ts` `getValidMpAccessToken` | reads `business.mp_access_token/refresh/expires`; **writes** refreshed tokens to `businesses` (lines 48-55) | Read via `getBusinessSecrets(id)`; **write** the rotated tokens to `business_secrets` (`update().eq('business_id', id)`). The `MpTokenBusiness` interface stays; callers pass secrets from `business_secrets`. |
| `lib/payment.ts` `createDepositPreference` | reads `business.mp_access_token` (line 72) | Caller must supply `mp_access_token` from `business_secrets`. Change `BusinessForDeposit` to receive the token, or fetch secrets inside. |
| `lib/recaptcha.ts` | `businesses.select('recaptcha_secret_key').eq('slug', slug)` (lines 18-23) | Resolve `business_id` by slug (or accept it), then `getBusinessSecrets(id).recaptcha_secret_key`. Fail-open behavior preserved. |
| `lib/email.ts` | receives `resendApiKey`/`resendFrom` as params (no direct DB read) | **No DB change** — callers pass the values from `business_secrets`. Verify every caller updated. |
| `lib/google-calendar.ts` | receives `google_refresh_token` as a param (no direct DB read) | **No DB change** — callers pass it from `business_secrets`. |
| `app/api/payment/webhook/[slug]/route.ts` | `select('*')` then `business.mp_access_token`, `resend_api_key`, `resend_from`, `google_refresh_token` | **THE LANDMINE — see §5.** Replace `select('*')` with explicit non-secret columns + a `getBusinessSecrets(business.id)` call. |
| `app/api/payment/create/route.ts` | `select('*')` then passes whole `business` to `createDepositPreference` (lines 16, 33) | **Second `select('*')` landmine.** Fetch explicit cols + `getBusinessSecrets(business.id)`, pass token into `createDepositPreference`. |
| `app/api/booking/create/route.ts` | targeted `select('... resend_api_key, resend_from, google_refresh_token')` (line 49) | Drop the 3 secret cols from the select; call `getBusinessSecrets(business.id)` and pass to email/gcal helpers. |
| `app/api/cancel/[token]/route.ts` | **nested join** `businesses(... resend_api_key, resend_from, google_refresh_token, notification_email)` (line 18) | Remove the 3 secrets from the embedded `businesses(...)` select (keep `notification_email`, `name`, `slug`, `primary_color`, `logo_url`); after resolving the appt, fetch `getBusinessSecrets(appt.businesses.id)` separately. **PostgREST can't join to `business_secrets` through the appt join easily — do a second query.** |
| `app/api/cron/cancel-expired/route.ts` | **nested join** `businesses(... resend_api_key, resend_from)` (line 16) | Same: strip secrets from the join, fetch per-business secrets after. Note: this loops over many appts across businesses — batch by collecting `business_id`s and fetching secrets once per business, or fetch per-row (low volume cron). |
| `app/api/payment/retry/[token]/route.ts` | reads MP secrets (grep hit) | Repoint to `getBusinessSecrets`. |
| `app/api/notify/booking/route.ts`, `app/api/notify/cancel/route.ts` | read `resend_*` (grep hits) | Repoint to `getBusinessSecrets`. |
| `app/api/google/sync/route.ts` | `select('... resend_api_key, resend_from, google_refresh_token')` (line 17) | Drop secrets from select; `getBusinessSecrets`. |
| `app/api/google/callback/route.ts` | **writes** `google_refresh_token` | Write to `business_secrets` (upsert by business_id). |
| `app/api/google/disconnect/route.ts` | `select('google_refresh_token')` + nulls it | Read + null in `business_secrets`. |
| `app/api/mercadopago/callback/route.ts` | **writes** `mp_access_token/refresh/user_id/expires` | Write MP secret cols to `business_secrets`; keep `mp_user_id` on `businesses` (non-secret). |
| `app/api/mercadopago/disconnect/route.ts` | nulls MP secrets | Null in `business_secrets`; null `mp_user_id` on `businesses`. |
| `app/(dashboard)/settings/page.tsx` + `settings-client.tsx` | server reads `businesses.select('*')` → passes secrets to client component → client renders them in inputs and **writes via session client** `businesses.update(...)` (lines 587, 620-624, 632-635) | **Most complex repoint.** Server: read `businesses` non-secret cols + `getBusinessSecrets(business.id)` (service role, server-side in `page.tsx`), pass secret values to the client. Client writes: change the 3 `supabase.from('businesses').update({...secrets})` calls to `supabase.from('business_secrets').upsert({ business_id, ...secrets }, { onConflict: 'business_id' })` via the session client (owner RLS authorizes it). Keep `recaptcha_site_key` and `mp_user_id` writes on `businesses`. See D-05: dashboard may show secret values to its OWNER (it's an edit form), but the read path is owner-RLS, never anon. |
| `app/(dashboard)/agenda/page.tsx` | `!!business.google_refresh_token` (presence boolean, line 44) | Read presence via `getBusinessSecrets` (server-side) and pass a boolean — never the raw token (D-05). |
| `lib/types.ts` | `Business` interface carries all secret fields (lines 26, 32, 37, 42-48) | Split: keep `Business` for non-secret cols; add `BusinessSecrets` interface (the 7 fields). `PublicBusiness` Omit (line 98) already excludes secrets — update if needed. Keep `mp_user_id` on `Business`. |

**`mp_user_id` stays on `businesses`** — it's not a secret and the dashboard reads it as a flag (`settings-client.tsx:547`). Do not move it. `[VERIFIED: settings-client.tsx:547]`

---

## 5. The `select('*')` landmine handling (D-03)

THREE `select('*')` readers pull secrets off `businesses` today: `payment/webhook/[slug]` (line 45), `payment/create` (line 16), and `payment/create` passes the whole row to `createDepositPreference`. `[VERIFIED: grep + file reads]`

**The trap:** after `028` drops the secret columns, `select('*')` keeps returning a row with NO SQL error — the secret fields are simply absent (`undefined`). The webhook's `if (!business?.mp_access_token)` (line 49) then short-circuits with "negocio sin MP token" and **stops confirming paid turns silently**. No error, no alert, broken payments. `[VERIFIED: payment/webhook/[slug]/route.ts:45-52]`

**Fix (do it in the deploy at step 2, BEFORE the drop at step 4):**

1. Replace each `select('*')` on `businesses` with an **explicit non-secret column list** (so the intent is visible and a missing column would surface, not silently vanish). For the webhook, that list is the columns it actually uses: `id, name, slug, primary_color, logo_url, whatsapp, address, notification_email`.
2. Fetch secrets separately via `getBusinessSecrets(business.id)` and read `mp_access_token` etc. from there.
3. The webhook's guard becomes `if (!secrets.mp_access_token)` (reading from the secrets fetch), so it short-circuits on a genuinely-unconfigured business, not on a schema change.
4. `getValidMpAccessToken` is called with the secrets object (or a shape carrying the MP token fields from `business_secrets`), and its rotation **write** targets `business_secrets`.

Because the fallback (§4) reads `businesses` when `business_secrets` has no row, the webhook keeps working in the gap between 027 and the deploy too. After 028 the explicit select no longer lists secret columns and `getBusinessSecrets` reads them only from `business_secrets`.

---

## Runtime State Inventory

This phase moves secret DATA between tables (a data migration) AND changes how new secrets are written (code edits). Both must be in the plan.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Secret values currently in `businesses` columns (`mp_access_token`, `mp_refresh_token`, `mp_token_expires_at`, `resend_api_key`, `resend_from`, `recaptcha_secret_key`, `google_refresh_token`) for every configured business | **Data migration:** `INSERT ... SELECT ... ON CONFLICT DO NOTHING` in 027 copies them to `business_secrets`. **Code edit:** all writers (`mercadopago/callback`, `google/callback`, settings save, `lib/payment.ts` token rotation) must write NEW values to `business_secrets`. |
| Live service config | None new. The migration runs in the Supabase SQL editor; no external service holds the renamed thing. | None — verified the views/tables are DB-only. |
| OS-registered state | None — no Task Scheduler/cron names reference these. The Vercel cron (`cancel-expired`) references the route path, not the secret columns. | None. |
| Secrets/env vars | Global env-var secrets (`RESEND_API_KEY`, `RECAPTCHA_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, MP/Google OAuth env) are NOT moved — only per-tenant DB columns move. **D-06 (separate): the per-tenant secrets were exposed live and must be ROTATED by the user** (operational, outside this migration). | Migration: none on env vars. D-06 rotation: user runs re-OAuth + key regen + Vercel/DB updates (out of repo). |
| Build artifacts | None — no compiled package carries the column names. TS types (`lib/types.ts`) reference them; updating the type is a code edit, not an artifact rebuild. | Code edit to `lib/types.ts`. |

---

## Common Pitfalls (phase-specific, condensed from PITFALLS.md — verified names/lines)

### Pitfall A: Wrong policy name on the DROP
`business_hours`'s open policy is `"public read hours"`, not `"public read business_hours"`. A wrong name makes `DROP POLICY IF EXISTS` a silent no-op and leaves anon reading the base table. **Verify:** `SELECT polname FROM pg_policy WHERE polrelid='business_hours'::regclass;` returns nothing after 028. `[VERIFIED: schema.sql:147]`

### Pitfall B: `select('*')` silently returns `undefined` secrets (the landmine)
See §5. Three files. Fix the explicit-select + separate-secrets-fetch before dropping columns.

### Pitfall C: Forgetting the base-table DROP (view is decorative)
Creating `public_services` without dropping `"public read services"` leaves anon able to `SELECT *` from `services` directly. The DROP (028), not the view, closes the hole. (For `services` this exposes no secret, but it's still the wrong RLS posture and the milestone's isolation tests will fail on it.)

### Pitfall D: `security_invoker=true` on the views → blank booking page
The views must be security-definer (default). With invoker rights they run as anon against the locked base table and return zero rows. Replicate 026/007 exactly: plain `CREATE OR REPLACE VIEW`.

### Pitfall E: Nested-join secret reads can't repoint in place
`cancel/[token]` and `cron/cancel-expired` read secrets via `appointments → businesses(...)` embedded selects. You cannot add `business_secrets` to that join cleanly — resolve the appt/business first, then a second `getBusinessSecrets(business_id)` query. `[VERIFIED: cancel/[token]/route.ts:18, cron/cancel-expired/route.ts:16]`

### Pitfall F: Dashboard write path uses the session client, not service role
Settings saves secrets via `supabase.from('businesses').update(...)` on the SESSION client (owner RLS). The `business_secrets` owner-only policy (`business_id IN (SELECT ... owner_id=auth.uid())`) authorizes the session client to upsert its own row — so the write keeps working WITHOUT service role. If you only granted service-role access and no owner policy, the dashboard save would break. The DDL in §1 includes the owner policy precisely for this. `[VERIFIED: settings-client.tsx:587,620-635]`

### Pitfall G: Copying not moving (data still exposed)
027 only copies. Until 028 drops/nulls the columns, the secrets still sit in `businesses`. The exposure is closed by 026's already-applied `DROP POLICY "public read businesses"` (anon can't read `businesses` at all anymore) — but defense-in-depth requires 028 to actually remove the columns. Don't stop at 027.

---

## Code Examples

The canonical view+DROP pattern, verified in the repo:

```sql
-- Source: supabase/migrations/007_professionals_extended.sql (read 2026-06-15)
CREATE OR REPLACE VIEW public_professionals AS
  SELECT id, business_id, name, specialty, active
  FROM professionals
  WHERE active = true;
GRANT SELECT ON public_professionals TO anon, authenticated;
DROP POLICY IF EXISTS "public read professionals" ON professionals;
```

```sql
-- Source: supabase/migrations/026_public_businesses_view.sql (read 2026-06-15)
CREATE OR REPLACE VIEW public_businesses AS
  SELECT id, owner_id, slug, name, type, vertical, logo_url, primary_color, whatsapp,
         address, instagram, require_deposit, deposit_amount, deposit_expiry_hours,
         recaptcha_site_key, default_slot_duration, buffer_minutes, created_at
  FROM businesses;
GRANT SELECT ON public_businesses TO anon, authenticated;
DROP POLICY IF EXISTS "public read businesses" ON businesses;
```

Owner-only RLS shape, verified in the repo (the template for `business_secrets`):

```sql
-- Source: supabase/schema.sql:111-115 (read 2026-06-15)
CREATE POLICY "business member access" ON services
  FOR ALL USING (business_id IN (
    SELECT id FROM businesses WHERE owner_id = auth.uid()
  ));
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `businesses` open to anon via `USING(true)` (whole row incl. secrets) | Bounded `public_businesses` view + `DROP POLICY` | migration 026 (applied) | Already done for `businesses`; 027/028 replicate for `services`/`business_hours` |
| Secrets as columns on a publicly-policied `businesses` | Separate `business_secrets` table, owner-only RLS | 027/028 (this phase) | Column-level secret exposure becomes structurally impossible |
| `services` read direct by anon (`select('*')` on base table) | Read via `public_services` view | this phase | The live `services` hole closes |

**Deprecated/outdated:** the `select('*')` reads on `businesses` (3 files) — replace with explicit selects + `business_secrets` fetch.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `notification_email` and `mp_user_id` should STAY on `businesses` (not secrets) | §1 | If the user considers `notification_email` sensitive enough to isolate, the secrets table grows by one column — low risk, easily added. `mp_user_id` is definitively not a secret (it's an account id used as a UI flag). |
| A2 | `DROP COLUMN` (vs `UPDATE ... NULL`) is the preferred destructive step | §3 step 4 | If the user wants a more conservative rollback posture, use the `UPDATE ... NULL` alternative documented in §3. Both close the exposure. Planner should confirm which with the user. |
| A3 | Splitting into TWO migrations (027 additive, 028 destructive) | §3 | This is the safe pattern given by-hand applies; if the user prefers a single coordinated migration+deploy window with zero traffic (pre-launch), one migration is acceptable (PITFALLS.md tech-debt table). Recommend the two-migration split. |
| A4 | `WHERE active = true` baked into `public_services` | §2 | If any public path needs inactive services (none found), the filter would hide them. Verified the booking page already filters active — safe. |

**If this table looks load-bearing:** A1 and A2 are the two the planner should surface to the user (or treat as Claude's-discretion per CONTEXT.md D-04/D-05, which explicitly grant discretion on exact view names and table shape).

---

## Open Questions

1. **DROP COLUMN vs NULL for the destructive half (A2).**
   - What we know: both close the exposure; repo convention avoids DROP COLUMN but documents marked exceptions.
   - What's unclear: user's risk appetite for an irreversible DROP on production data already copied to `business_secrets`.
   - Recommendation: DROP COLUMN in `028` with a `⚠` comment; the data is already in `business_secrets` and `026` already removed anon read on `businesses`. Plan a `checkpoint:human-verify` before running `028`.

2. **Remove-the-fallback timing (§3 step 5).**
   - What we know: the `businesses` fallback in `getBusinessSecrets` becomes dead after 028.
   - Recommendation: leave the fallback in for the deploy that ships with 027, remove it in a follow-up commit after 028 is confirmed live (so a rollback to pre-028 still works during the window).

---

## Environment Availability

> SKIPPED for tooling — no external CLI/runtime dependency is introduced. The only "environment" dependency is access to the Supabase SQL editor for the by-hand migration (already the established process) and a Vercel deploy (established). Both confirmed available via the existing workflow (migrations/README.md, prior migrations through 026).

---

## Validation Architecture

> Per CONTEXT.md, tests are Phase 5 (TEST-01), out of scope for Phase 1. No `nyquist_validation` test framework exists yet (Vitest is introduced in Phase 5 per STACK.md). For THIS phase, validation is manual smoke-testing per the §3 runbook (steps 3 + verification queries). The isolation/RLS tests that assert anon cannot read `business_secrets` or the base tables are written in Phase 5 against the behavior this phase establishes.

### Manual phase-gate checks (from §3 + PITFALLS "Looks Done But Isn't")
- [ ] `/[slug]` renders services after the `public_services` repoint
- [ ] A deposit booking confirms end-to-end (webhook reads `business_secrets`)
- [ ] Owner settings shows + saves secrets (owner RLS upsert to `business_secrets`)
- [ ] Post-028: `SELECT polname FROM pg_policy` shows no `public read services` / `public read hours`
- [ ] Post-028: `\d businesses` shows secret columns gone
- [ ] Anon REST probe `select=mp_access_token` on `businesses` → denied/empty

## Security Domain

`security_enforcement` is the entire point of this milestone — enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | Physical secret separation (`business_secrets`); tenant isolation by RLS |
| V4 Access Control | yes | Postgres RLS owner-only policy on `business_secrets`; `DROP` of `USING(true)` policies; bounded views (security-definer) |
| V6 Cryptography / Secret Mgmt | yes | Secrets stored in an access-controlled table; per-secret at-rest encryption explicitly v2 backlog (out of scope) |
| V5 Input Validation | partial | Not the focus; existing per-`business_id` filtering retained |
| V2 Authentication / V3 Session | no | Unchanged this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Anon reads secret columns via PostgREST `select=` on a `USING(true)` table | Information Disclosure | `DROP POLICY` the open read + move secrets to owner-only `business_secrets` (this phase) |
| Cross-tenant secret read (one business reads another's tokens) | Information Disclosure | Owner-only RLS keyed through `businesses.owner_id`; service-role reads always `.eq('business_id', id)` |
| Silent payment break from `select('*')` after column drop | Denial of Service (of payments) | Explicit selects + separate `business_secrets` fetch; deploy before drop (§5) |
| Leaked-while-live credentials remain valid | (post-exposure) | D-06 rotation (operational, user-run, outside this migration) |

---

## Sources

### Primary (HIGH confidence — read directly this session)
- `supabase/schema.sql` — base tables, RLS, exact policy names (`public read services`/`public read hours`, `owner access`, `business member access`)
- `supabase/migrations/026_public_businesses_view.sql`, `007_professionals_extended.sql` — canonical view+DROP+GRANT pattern
- `supabase/migrations/001`, `008`, `019`, `021`, `022`, `025` — exact secret/services column provenance
- `supabase/migrations/README.md` — hand-apply process, idempotency rules, marked-exception convention
- `lib/payment.ts`, `lib/recaptcha.ts`, `lib/email.ts`, `lib/google-calendar.ts`, `lib/supabase/admin.ts`, `lib/types.ts` — reader/writer shapes
- `app/api/payment/webhook/[slug]/route.ts`, `app/api/payment/create/route.ts`, `app/api/booking/create/route.ts`, `app/api/cancel/[token]/route.ts`, `app/api/cron/cancel-expired/route.ts`, `app/api/google/sync/route.ts` — verified selects, the three `select('*')` landmines, the two nested-join secret reads
- `app/[slug]/page.tsx` — public read path (reads `services` base table directly; uses `time_blocks` not `business_hours`)
- `app/(dashboard)/settings/page.tsx` + `settings-client.tsx`, `app/(dashboard)/agenda/page.tsx` — dashboard secret read/write path (session client)
- Grep across `app/` for the 7 secret column names + `select('*')` + `business_hours`/`from('services')` — blast radius enumeration

### Secondary (HIGH — curated project research)
- `.planning/research/ARCHITECTURE.md`, `PITFALLS.md`, `STACK.md`, `.planning/phases/01-rls-lockdown-secret-isolation/01-CONTEXT.md`

## Metadata

**Confidence breakdown:**
- DDL (`business_secrets`, views): HIGH — column lists and policy shapes verified against the actual schema and the two reference migrations
- Migration sequence: HIGH — matches the documented by-hand process and the 026/012 coordination precedent
- Blast-radius repoints: HIGH — every select read directly; the two nested-join cases and three `select('*')` cases identified by line
- A2 (DROP vs NULL): MEDIUM — a user-policy choice, both correct; recommended DROP

**Research date:** 2026-06-15
**Valid until:** stable (brownfield DB schema; ~30 days). The only volatility is whether more secret columns get added to `businesses` before this lands — re-grep the 7 names if the phase slips.
