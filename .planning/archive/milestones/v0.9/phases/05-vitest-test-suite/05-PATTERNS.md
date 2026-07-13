# Phase 5: Vitest Test Suite (TEST-01) - Pattern Map

**Mapped:** 2026-06-17
**Files analyzed:** test infra (greenfield) — no test analogs exist; mapping is of the PRODUCTION symbols the tests import + reuse
**Analogs found:** N/A (no prior tests) — instead: 9 production symbols mapped to source:line + test usage

> NOTE: There is NO existing test infra in the repo. This is greenfield for tests. Per the task focus, this document maps the **production code/symbols the new tests will import, mock, and assert against** — not test-file analogs. The planner uses this to write the suite without re-discovering signatures.

---

## File Classification (new test files to create)

| New File | Role | Data Flow | What it touches (no analog — greenfield) |
|----------|------|-----------|------------------------------------------|
| `vitest.config.mts` | config | n/a | `vite-tsconfig-paths` (resolve `@/*`), `environment: 'node'`, `.env.local` load |
| `test/webhook-deposit.test.ts` | test (unit) | request-response | imports deposit `POST`, mocks `mpFetch`/`createAdminClient`, crafts HMAC `x-signature` |
| `test/webhook-subscription.test.ts` | test (unit) | request-response | imports subscription `POST`, mocks `mpFetch`, crafts HMAC `x-signature` |
| `test/tenant-isolation.test.ts` | test (integration) | CRUD | `createAdminClient` (fixtures), two anon clients (assertions) against dev Supabase |
| `.github/workflows/test.yml` | config (CI) | n/a | runs `vitest run`; Supabase keys + `MP_WEBHOOK_SECRET` as GitHub Secrets |

---

## Pattern Assignments — production symbols under test

### Webhook handler: deposit (test target, request-response)

**Source:** `app/api/payment/webhook/[slug]/route.ts`

**Export signature** (lines 12-15):
```typescript
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
)
```
> Test MUST pass `{ params: Promise.resolve({ slug }) }` as the 2nd arg. `params` is a **Promise** (Next 16).

**Return shape** (raw `Response`, NOT `Response.json`):
- forged/bad signature → `new Response('Invalid signature', { status: 401 })` (line 34)
- bad JSON body, or `type !== 'payment'`, or missing `data.id`, or valid+queued → `new Response('OK', { status: 200 })` (lines 26, 40, 55)
- Tests assert on `res.status` (401 vs 200), NOT on a JSON body.

**Signature is checked FIRST, before any work** (lines 33-35): a forged `type:'payment'/approved` POST gets 401 and `after()` never runs. Test: invalid/absent `x-signature` → 401, zero DB writes.

**`data.id` source for the manifest** (line 20): query string first (`?data.id=` / `?id=`), fallback `body.data.id`. **Test crafting the HMAC must put `data.id` in the query string** (or body) and sign that exact value.

**Amount-mismatch path** (lines 133-146): `expectedCents = round(deposit_amount*100)`, `paidCents = round(payment.transaction_amount*100)`; if `!==` → updates `payment_status:'amount_mismatch'` and returns WITHOUT confirming. The amount comes from the **mocked `mpFetch`/fetch `GET /v1/payments/{id}`** (`payment.transaction_amount`), never the webhook body. Test: valid sig + approved + wrong amount → appointment NOT confirmed.
> NOTE: this handler fetches MP via raw `fetch(`${MP_API}/v1/payments/${paymentId}`)` (line 93), NOT `mpFetch`. To intercept it the test mocks **`global.fetch`** (or the whole module). It also calls `createAdminClient` (line 59), `getBusinessSecrets`, `getValidMpAccessToken`, `sendConfirmationEmail`, `createCalendarEvent` — all in the `after()` callback. For the 401/200 status assertions none of these run; only the amount/confirm assertions need them mocked.

---

### Webhook handler: subscription (test target, request-response)

**Source:** `app/api/subscription/webhook/route.ts`

**Export signature** (line 11): `export async function POST(request: NextRequest)` — **single arg**, no params.

**Return shape**: identical raw-`Response` pattern — `401` `'Invalid signature'` (line 24), else `200` `'OK'` (lines 19, 38).

**Signature checked first** (lines 23-25), then `after(() => processWebhook(...))`. Test: forged → 401; valid → 200.

**MP calls go through `mpFetch`** (lines 47, 67, 88) — this is the clean `vi.mock('@/lib/mercadopago')` target for this file (deposit uses raw fetch instead). Also uses `createAdminClient` (line 43).

---

### `verifyMPSignature` (the function both webhooks gate on — test must satisfy it)

**Source:** `lib/mercadopago.ts:37-73`

**Signature:** `verifyMPSignature(request: NextRequest, dataId: string | null | undefined): boolean`

**Manifest format the test HMAC must reproduce** (lines 62-68):
```
id:<dataId lowercased>;request-id:<x-request-id>;ts:<ts>;
```
- Omit any absent part (no `id` → skip `id:`; no `x-request-id` header → skip `request-id:`).
- `dataId` is `.toLowerCase()`'d (no-op for numeric ids).

**Header format read** (lines 44-59): `x-signature: "ts=<unix>,v1=<hexhmac>"` + `x-request-id` header. Missing `x-signature` or missing `ts`/`v1` → `false`.

**Compare** (lines 68-72): `crypto.createHmac('sha256', secret).update(manifest).digest('hex')` then `crypto.timingSafeEqual`. **Test builds the valid `v1` the same way** with the known test secret. For the invalid case, send a garbage/short `v1` (length-mismatch → `false`, line 71).

**Fail-closed** (lines 39-42): secret unset → logs + returns `false` → 401. Test for "missing `MP_WEBHOOK_SECRET`" deletes the env var and expects 401.

---

### `getMPWebhookSecret` (MP_MODE keying — drives which env the test sets)

**Source:** `lib/mercadopago.ts:24-29` + `MP_MODE` const at line 8.

```typescript
export const MP_MODE = process.env.MP_MODE === 'test' ? 'test' : 'production'
export function getMPWebhookSecret(): string {
  if (MP_MODE === 'test') return process.env.MP_WEBHOOK_SECRET_TEST || ''
  return process.env.MP_WEBHOOK_SECRET || ''
}
```
> `MP_MODE` is evaluated at **module load** (top-level const). Default (no `MP_MODE`) = `production` → reads `MP_WEBHOOK_SECRET`. Test must set the secret matching its `MP_MODE`. Simplest: leave `MP_MODE` unset and set `MP_WEBHOOK_SECRET` to the known test value (the GitHub Secret per D-04). Because the const is captured at import time, set the env BEFORE importing the route, or stub via `vi.stubEnv` + module reset.

---

### `mpFetch` (mock target for the subscription webhook)

**Source:** `lib/mercadopago.ts:167-177` — `export async function mpFetch(path, options?): Promise<any>` → `fetch(`${MP_API}${path}`)` `.json()`.
**Test use:** `vi.mock('@/lib/mercadopago', ...)` returning a controlled `mpFetch` so `processWebhook` sees a crafted `payment`/`sub` object (`external_reference`, `status`, `transaction_amount`) without hitting MP. Keep the real `verifyMPSignature` (partial mock with `importActual`) so the signature gate still runs.

---

### Supabase client factories

| Factory | Source | Role | Test use |
|---------|--------|------|----------|
| `createAdminClient()` | `lib/supabase/admin.ts:3-8` | **service-role** (`SUPABASE_SERVICE_ROLE_KEY`), bypasses RLS | Fixtures ONLY: `beforeAll` seed 2 businesses (`__test_<uuid>`), `afterAll` teardown. NEVER for isolation assertions (D-06). |
| `createClient()` | `lib/supabase/client.ts:3-8` | anon (`createBrowserClient` from `@supabase/ssr`, anon key) | Browser-flavored anon client. |
| `createPublicServerClient()` | `lib/supabase/public.ts:6-11` | anon (`createClient` from `@supabase/supabase-js`, anon key, no cookies) | Closest shape for the isolation assertions: plain anon `supabase-js` client. |

> **Isolation assertions need an authenticated anon session per owner**, which none of these factories provide directly (client.ts uses ssr cookies; public.ts has no auth wiring). Per D-06 + research flag, the test creates two `@supabase/supabase-js` anon clients directly and `signInWithPassword` as each fixture owner (owners created via `admin.auth.admin.createUser`). The factories above document the **anon-key shape** (URL + `NEXT_PUBLIC_SUPABASE_ANON_KEY`) the test client must mirror. `createAdminClient` is the literal fixture-setup client.

---

## Shared Patterns

### Owner RLS — what the isolation test asserts against

**Source:** `supabase/schema.sql:92-133`

RLS enabled on: `businesses, professionals, services, business_hours, clients, appointments` (lines 92-97).

Two policy shapes:
- `businesses` — direct owner (line 102-103): `FOR ALL USING (owner_id = auth.uid())`
- member tables (`professionals`, `services`, `business_hours`, `clients`, `appointments`) — indirect (lines 106-133):
```sql
FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()))
```

**Test assertions (anon, authenticated as owner A):**
- (read) `select` from `services`/`appointments`/`clients` filtered to business B → returns **0 rows** (RLS hides them; not an error).
- (write) `update`/`insert` on business B's `services`/`appointments` → **fails / affects 0 rows**.
- Direct `businesses` row of B → not visible to A.

> Public anon access is via bounded VIEWS only (lines 135-156); base tables have NO open `SELECT` policy for anon. Only `public insert appointments`/`public insert clients` exist (`WITH CHECK (true)`). The isolation test targets the **owner-level** `auth.uid()` policies, so it must use authenticated anon sessions, not bare anon.

### Test secret = production HMAC (deterministic)

`verifyMPSignature` is pure given the secret. The test computes `v1` with the identical `crypto.createHmac('sha256', SECRET).update(manifest).digest('hex')` and a known `ts` → reproducible valid signature. No fixture/network needed for webhook tests.

### Error/return convention to assert

Webhooks return raw `new Response(body, { status })` (not `Response.json({ok})`). Assert `res.status`. (Booking/other routes use `Response.json({ ok, error })` — out of scope here.)

---

## Tooling slots (package.json / tsconfig)

**`package.json`** (`devDependencies` at lines 37-47; `scripts` at 5-11): add `vitest ^4.1`, `vite-tsconfig-paths ^5`, `@vitejs/plugin-react ^5` to devDeps; add `"test": "vitest run"` (and optionally `"test:watch": "vitest"`). `tsx ^4` already present (line 46). No new runtime deps.

**`tsconfig.json`** (lines 21-23): `"paths": { "@/*": ["./*"] }` — this alias is why `vite-tsconfig-paths` is mandatory; without it every `@/lib/...` / `@/app/...` import in a test fails to resolve. `"module": "esnext"`, `"moduleResolution": "bundler"`, `strict: true` — ESM/TS native, fits Vitest. `**/*.mts` already in `include` (line 31) so `vitest.config.mts` typechecks.

---

## No Analog Found

| File | Role | Reason |
|------|------|--------|
| all `test/*.test.ts`, `vitest.config.mts`, `.github/workflows/test.yml` | test/config/CI | No test runner, config, or CI workflow exists in the repo today. Planner uses STACK.md §Installation + the symbol map above; there is no in-repo test to copy. |

---

## Metadata

**Analog search scope:** `app/api/payment/webhook`, `app/api/subscription/webhook`, `lib/mercadopago.ts`, `lib/supabase/{admin,client,public}.ts`, `supabase/schema.sql`, `package.json`, `tsconfig.json`, `.planning/research/{STACK,ARCHITECTURE}.md`
**Files scanned:** 11
**Pattern extraction date:** 2026-06-17
