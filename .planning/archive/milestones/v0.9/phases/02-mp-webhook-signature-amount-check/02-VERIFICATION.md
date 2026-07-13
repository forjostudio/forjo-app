---
phase: 02-mp-webhook-signature-amount-check
verified: 2026-06-16T21:30:00Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification: null
---

# Phase 2: MP Webhook Signature + Amount Check — Verification Report

**Phase Goal:** El webhook de seña rechaza firmas inválidas (fail-closed) y no confirma turnos cuando el monto pagado no coincide con la seña esperada; ambos webhooks comparten un único verificador de firma
**Verified:** 2026-06-16T21:30:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Una notificación al webhook de seña con firma `x-signature` ausente o inválida es rechazada (fail-closed), sin confirmar el turno | VERIFIED | `route.ts:33` — `if (!verifyMPSignature(...)) return new Response('Invalid signature', { status: 401 })` fires before `after()` (line 47) and before the type guard (line 39). `verifyMPSignature` in `lib/mercadopago.ts:38-41` returns `false` when `getMPWebhookSecret()` is empty — fail-closed confirmed. |
| 2 | Un pago aprobado por un monto distinto a la seña esperada (`transaction_amount` ≠ `deposit_amount`, comparado en enteros-centavos) NO confirma el turno | VERIFIED | `route.ts:133-146` — `expectedCents = Math.round(Number(appt.deposit_amount \|\| 0) * 100)`, `paidCents = Math.round(Number(payment.transaction_amount \|\| 0) * 100)`, on mismatch: sets `payment_status='amount_mismatch'`, leaves `status='pending_payment'` (no update to `confirmed`), returns before email/GCal side-effects. `payment.transaction_amount` comes from the MP API fetch at line 93-96, never from the webhook body. |
| 3 | La firma se valida con el `data.id` tomado del query string (lowercased, manifest correcto), igual que el webhook de suscripción ya validado | VERIFIED | `route.ts:20` — `const dataIdQuery = request.nextUrl.searchParams.get('data.id') ?? request.nextUrl.searchParams.get('id')`. `route.ts:33` passes `dataIdQuery ?? body.data?.id` to `verifyMPSignature`. Inside `lib/mercadopago.ts:62` the id is lowercased: `const id = dataId ? String(dataId).toLowerCase() : undefined`. Identical pattern to `app/api/subscription/webhook/route.ts:13+23`. |
| 4 | `verifyMPSignature` vive en `lib/mercadopago.ts` y es el único verificador importado por ambos webhooks (suscripción y seña), sin duplicación inline | VERIFIED | `lib/mercadopago.ts:37` — `export function verifyMPSignature(...)`. Both webhooks import it: `app/api/payment/webhook/[slug]/route.ts:7` — `import { verifyMPSignature } from '@/lib/mercadopago'`; `app/api/subscription/webhook/route.ts:3` — `import { mpFetch, verifyMPSignature } from '@/lib/mercadopago'`. The subscription webhook has zero inline HMAC/timingSafeEqual/createHmac usage — confirmed by grep returning no matches. |

**Score: 4/4 truths verified**

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/mercadopago.ts` | Exports `verifyMPSignature` (HMAC-SHA256, manifest, timingSafeEqual, fail-closed) | VERIFIED | Lines 37-73; full implementation present, exported, substantive |
| `app/api/payment/webhook/[slug]/route.ts` | Imports shared verifier; verifies signature fail-closed before `after()` and type guard; checks amount in integer-cents | VERIFIED | Lines 7, 20, 33-35, 39, 133-146 — all checks present, ordered correctly |
| `app/api/subscription/webhook/route.ts` | Imports shared verifier; no inline copy | VERIFIED | Line 3 imports from shared module; no HMAC/timingSafeEqual/createHmac found inline |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `app/api/payment/webhook/[slug]/route.ts` | `lib/mercadopago.ts` | `import { verifyMPSignature }` | WIRED | Line 7; called at line 33 with `(request, dataIdQuery ?? body.data?.id)` |
| `app/api/subscription/webhook/route.ts` | `lib/mercadopago.ts` | `import { mpFetch, verifyMPSignature }` | WIRED | Line 3; called at line 23 |
| `verifyMPSignature` → `getMPWebhookSecret` | `lib/mercadopago.ts` internal | Direct call | WIRED | Line 38 calls `getMPWebhookSecret()`; empty string → returns false (fail-closed) |

---

### Verification Checks (per task specification)

**Check 1 — `verifyMPSignature` exported and imported by BOTH webhooks, no inline copy in subscription webhook:**
- `lib/mercadopago.ts:37`: exported — PASS
- `app/api/payment/webhook/[slug]/route.ts:7,33`: imported and called — PASS
- `app/api/subscription/webhook/route.ts:3,23`: imported and called — PASS
- Grep for `createHmac|timingSafeEqual|HMAC` in `app/api/subscription/webhook/route.ts`: 0 matches — no inline copy — PASS

**Check 2 — Deposit webhook: signature check BEFORE `after()` and BEFORE type guard; `data.id` from query string; fail-closed:**
- Line 20: `dataIdQuery` resolved from `searchParams.get('data.id') ?? searchParams.get('id')` — PASS
- Line 33: `verifyMPSignature` call — returns 401 at line 34 — BEFORE `after()` at line 47 and BEFORE type guard at line 39 — PASS (ordering by line number confirmed)
- `lib/mercadopago.ts:38-41`: `if (!secret) { ...; return false }` — fail-closed — PASS

**Check 3 — Amount check: integer-cents, uses MP-fetched `transaction_amount`, inside `approved` branch after pending_payment guard, before confirm update:**
- Line 93-96: `payment` fetched from `${MP_API}/v1/payments/${paymentId}` using the business's MP token — source is MP API, not webhook body — PASS
- Line 122: `if (appt.status !== 'pending_payment') return` — idempotency guard before amount check — PASS
- Lines 133-134: `Math.round(Number(...) * 100)` on both sides — integer-cents comparison — PASS
- Lines 135-146: mismatch branch runs before line 148 (the `update` to `confirmed`) — PASS

**Check 4 — Mismatch: sets `payment_status='amount_mismatch'`, leaves `pending_payment`, no email/GCal, logs amounts:**
- Line 142: `.update({ payment_status: 'amount_mismatch' })` — PASS
- Status column not touched (`.update` at line 142 only updates `payment_status`, not `status`) — turno stays `pending_payment` — PASS
- Line 144: `console.error('[payment/webhook] monto incorrecto', { paymentId, expected_cents, paid_cents })` — PASS
- Line 145: `return` before the email block (line 165) and GCal block (line 222) — no side effects — PASS

**Check 5 — `npx tsc --noEmit` clean:**
- Ran `npx tsc --noEmit` — exited with code 0, no output — PASS

**Check 6 — No migration introduced; no new runtime deps:**
- No `.sql` files in phase commits (commits `367c2c8`, `032e083`, `bf4d2a5`, `6c32a04`). Only `lib/mercadopago.ts` and `app/api/payment/webhook/[slug]/route.ts` modified in phase 2. `crypto` is Node.js built-in — no new npm packages — PASS

---

### Behavioral Spot-Checks

Step 7b: SKIPPED — webhook behavior requires live HTTP requests with signed payloads. No runnable entry points testable without a live MP webhook call. The ordering and logic checks above constitute the maximum programmatically-verifiable evidence. Phase 5 (Vitest Test Suite) is the designated phase for behavioral test coverage of these webhooks (ROADMAP.md success criteria SC-4 of Phase 5 explicitly covers this).

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SEC-02 | 02-01-PLAN.md, 02-02-PLAN.md | Firma x-signature fail-closed + chequeo de monto en webhook de seña | SATISFIED | All 4 success criteria verified above |

---

### Anti-Patterns Found

Scanned files modified in this phase: `lib/mercadopago.ts`, `app/api/payment/webhook/[slug]/route.ts`, `app/api/subscription/webhook/route.ts`.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None found | — | — | — | — |

No TBD/FIXME/XXX markers, no placeholder returns (`return null`, `return []`, `return {}`), no console.log-only handlers, no hardcoded empty state passed to rendering. All `return new Response('OK', ...)` calls are intentional webhook acknowledgment responses, not stubs.

---

### Human Verification Required

None. All success criteria are verifiable from static code analysis. The env precondition (`MP_WEBHOOK_SECRET` set in Vercel) was confirmed by the user at the human checkpoint documented in `02-02-SUMMARY.md` (T3).

---

### Gaps Summary

No gaps found. All four ROADMAP success criteria are verified by direct code evidence with no overrides needed.

---

_Verified: 2026-06-16T21:30:00Z_
_Verifier: Claude (gsd-verifier)_
