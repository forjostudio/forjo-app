# Phase 2: MP Webhook Signature + Amount Check - Pattern Map

**Mapped:** 2026-06-16
**Files analyzed:** 3 (1 lib extraction, 2 webhook edits)
**Analogs found:** 3 / 3

## File Classification

| New/Modified Symbol | File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|------|-----------|----------------|---------------|
| `verifyMPSignature` (moved + exported) | `lib/mercadopago.ts` | utility (security helper) | request-response (HMAC verify) | inline impl in `app/api/subscription/webhook/route.ts` §18-54 | exact (verbatim move) |
| signature gate + `data.id` query resolution | `app/api/payment/webhook/[slug]/route.ts` (POST) | route (webhook handler) | event-driven (MP push) | `app/api/subscription/webhook/route.ts` §56-70 | exact |
| amount check + `payment_status='amount_mismatch'` | `app/api/payment/webhook/[slug]/route.ts` (processWebhook) | route (webhook handler) | event-driven | the existing `payment_status:'paid'` update + status-guard §98-118 | exact (same file, same branch) |
| import refactor (use shared fn) | `app/api/subscription/webhook/route.ts` | route | event-driven | self (behavior unchanged) | exact |

## Pattern Assignments

### `lib/mercadopago.ts` — extract `verifyMPSignature` (utility, security)

**Analog:** `app/api/subscription/webhook/route.ts` §18-54 (the function to MOVE verbatim).

**Where it lands:** immediately after `getMPWebhookSecret()` (`lib/mercadopago.ts` §21-26) — its only dependency already lives there, so no new imports beyond `crypto` and the `NextRequest` type.

**Imports pattern** — `lib/mercadopago.ts` currently has NO `crypto` / `NextRequest` import. Add at top of file:
```typescript
import crypto from 'crypto'
import type { NextRequest } from 'next/server'
```
(The subscription webhook already imports both — `route.ts` §1, §5 — and will DROP `import crypto` and the inline fn after the move, keeping `getMPWebhookSecret` from its existing `@/lib/mercadopago` import line §4.)

**Core pattern — move verbatim** (subscription webhook §18-54): change `function verifyMPSignature(...)` to `export function verifyMPSignature(...)`. Signature stays `(request: NextRequest, dataId: string | null | undefined): boolean`. Logic unchanged: manifest `id:<id>;request-id:<reqid>;ts:<ts>;` (omit absent), `crypto.createHmac('sha256', secret)`, length-guard + `crypto.timingSafeEqual`. Fail-closed: missing secret → `console.error(...)` + `return false`; missing `x-signature` / `ts` / `v1` → `return false`. The leading español/inglés doc-comment block (§12-17) moves with it.

---

### `app/api/payment/webhook/[slug]/route.ts` — signature gate (route, event-driven)

**Analog:** `app/api/subscription/webhook/route.ts` §56-70.

**`data.id` query-string resolution** (analog §57-58) — add at top of `POST`, before/after the body parse, mirroring the sub webhook:
```typescript
const dataIdQuery = request.nextUrl.searchParams.get('data.id') ?? request.nextUrl.searchParams.get('id')
```
D-05: pass `dataIdQuery ?? body.data?.id` to the verifier. NEVER pass only `body.data.id` (Pitfall — real MP calls fail).

**Verify-before-`after()` gate** (analog §67-70) — insert AFTER the existing `body.type !== 'payment'` guard (target §22-24) and BEFORE the `after(...)` block (target §30):
```typescript
// Rechazar requests forjados antes de confiar en nada o hacer trabajo (fail-closed, D-04).
if (!verifyMPSignature(request, dataIdQuery ?? body.data?.id)) {
  return new Response('Invalid signature', { status: 401 })
}
```
Note divergence from analog: sub webhook returns `200 OK` on bad JSON (§64); target also returns `200 OK` on bad JSON (§19) and on non-payment type (§23) — keep that. Only the forged-signature case is `401`.

**Import** — add `verifyMPSignature` to the existing import is NOT possible (target imports from `@/lib/payment`, not mercadopago). Add a new line:
```typescript
import { verifyMPSignature } from '@/lib/mercadopago'
```

---

### `app/api/payment/webhook/[slug]/route.ts` — amount check (route, event-driven)

**Analog:** same file, the `payment.status === 'approved'` branch §98-118 (status-guard idempotency + update shape).

**Placement** (D per code_context): INSIDE `if (payment.status === 'approved')`, AFTER the `appt.status !== 'pending_payment'` idempotency guard (§105-108), BEFORE the `update({ status: 'confirmed', ... payment_status: 'paid' })` (§110-118). `payment.transaction_amount` is already available from the MP GET at §76-79; `appt.deposit_amount` is read at §124 (move/duplicate the `depositAmt` read up, or read inline).

**Core comparison pattern** (D-01 exact-integer-cents) — replicate the repo's defensive-number convention (`Number(... || 0)`, target §123-124):
```typescript
// Comparación exacta en centavos enteros: evita el bug de floats (1500.00 !== 1499.999).
// Usamos transaction_amount traído de MP (§76), NUNCA un monto del body del webhook (Anti-Pattern 4).
const expectedCents = Math.round(Number(appt.deposit_amount || 0) * 100)
const paidCents = Math.round(Number(payment.transaction_amount || 0) * 100)
if (paidCents !== expectedCents) {
  // Firma válida, pago approved, pero monto != esperado: NO confirmar (D-02). El turno queda
  // pending_payment; marcamos payment_status para distinguir "pagó mal" de "nunca pagó" (null).
  await supabase
    .from('appointments')
    .update({ payment_status: 'amount_mismatch' })
    .eq('id', appointmentId)
  console.error('[payment/webhook] monto incorrecto', { paymentId, expected_cents: expectedCents, paid_cents: paidCents })
  return
}
```

**Update-shape analog** (§110-118) — the mismatch `update` mirrors the existing `payment_status:'paid'` update: same `supabase.from('appointments').update({...}).eq('id', appointmentId)` form, but WITHOUT `status:'confirmed'` / `deposit_paid` / `mp_payment_id`. The `return` short-circuits before email (§128) and Google Calendar (§184) — no confirmation side effects on mismatch (D-02).

---

### `app/api/subscription/webhook/route.ts` — import refactor only

**Analog:** self. Behavior MUST NOT change (out of scope per CONTEXT §13).
- Delete inline `verifyMPSignature` (§18-54) and the now-unused `import crypto from 'crypto'` (§1) IF crypto is used nowhere else in the file (it is not — verify before removing).
- Add `verifyMPSignature` to the existing `@/lib/mercadopago` import (§4): `import { mpFetch, getMPWebhookSecret, verifyMPSignature } from '@/lib/mercadopago'`.
- `getMPWebhookSecret` import can stay (still imported) but is now unused in this file after the move — remove it from the import to avoid an unused-import lint error (ESLint core-web-vitals). Keep `mpFetch`.
- Call site §68 unchanged.

## Shared Patterns

### Fail-closed signature verification
**Source:** `lib/mercadopago.ts` (post-extraction `verifyMPSignature`) + `getMPWebhookSecret` §21-26.
**Apply to:** both webhook route handlers.
**Rule:** verify BEFORE `after()` / before any DB work; missing secret or invalid sig → reject (401 in handler / `false` in fn). Per memory [[webhook-mp-signature]].

### Idempotency by status-guard
**Source:** `app/api/payment/webhook/[slug]/route.ts` §99-108.
```typescript
if (appt.status !== 'pending_payment') {
  console.log(`Turno #${appointmentId} en estado '${appt.status}' ... webhook 'approved' ignorado`)
  return
}
```
**Apply to:** the deposit webhook approved-branch. The amount check sits AFTER this guard, so a re-fired webhook on an already-confirmed turn never re-runs the comparison.

### Defensive number coercion
**Source:** §123-124 (`Number(...?.price || 0)`, `Number(appt.deposit_amount || 0)`).
**Apply to:** the cents comparison — coerce both operands with `Number(... || 0)` before `Math.round(... * 100)`.

### Dense español security comments
**Source:** target §99-104, §126-127, §199-203; analog §12-17.
**Apply to:** the new signature gate and amount-mismatch block — explain the *why* (forged requests, float bug, fuente del monto, distinguir pagó-mal vs nunca-pagó).

### Error/response shape (webhook-specific)
**Source:** both webhooks return raw `new Response('OK'|'Invalid signature', { status })` — NOT the `Response.json({ ok })` dashboard convention. Webhooks answer MP with plain text + status code. Keep this; do not introduce `{ ok: false }` JSON here.

## No Analog Found

None. Every changed symbol has an exact in-repo analog (the sibling subscription webhook or the same deposit webhook file).

## Metadata

**Analog search scope:** `app/api/subscription/webhook/`, `app/api/payment/webhook/[slug]/`, `lib/mercadopago.ts`, `lib/payment.ts`.
**Files scanned:** 5 (4 required reads + CONTEXT).
**Pattern extraction date:** 2026-06-16
