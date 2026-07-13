---
phase: 02-mp-webhook-signature-amount-check
audited: 2026-06-16
auditor: gsd-security-auditor
asvs_level: 1
block_on: high
threats_total: 8
threats_closed: 8
threats_open: 0
unregistered_flags: 0
status: SECURED
---

# Phase 2 — MP Webhook Signature + Amount Check (SEC-02): Security Audit

**Mode:** VERIFY (register authored at plan time). Each declared mitigation verified against implemented code by grep/read — documentation and intent not accepted as evidence. No scan for new threats. Implementation files unmodified.

**Verdict:** SECURED — 8/8 threats CLOSED. No open mitigations, no unregistered attack surface.

## Threat Register Source

- `02-01-PLAN.md` `<threat_model>`: T-02-01, T-02-02, T-02-SC
- `02-02-PLAN.md` `<threat_model>`: T-02-03, T-02-04, T-02-05, T-02-06, T-02-07, T-02-SC

T-02-SC appears in both plans with identical disposition (`accept`, no installs); counted once. Unique total = 8.

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-02-01 | Spoofing | mitigate | CLOSED | Verbatim HMAC verifier in `lib/mercadopago.ts:37-73`: manifest `id;request-id;ts` (63-66), id lowercasing (62), length guard (71), `crypto.timingSafeEqual` (72), fail-closed on absent secret (39-42), absent signature (46), absent ts/v1 (59). Algorithm preserved (no logic change). |
| T-02-02 | Tampering | accept | CLOSED | Subscription webhook is import-only refactor: imports shared verifier `app/api/subscription/webhook/route.ts:3`, call site intact (23), 401 on invalid signature (24), 200 on bad JSON (19). Grep `createHmac\|timingSafeEqual\|function verifyMPSignature` → 0 matches (no inline copy). Grep `getMPWebhookSecret\|import crypto` → 0 matches (no dead imports). Observable behavior unchanged. |
| T-02-03 | Spoofing / Tampering | mitigate | CLOSED | Fail-closed signature gate `app/api/payment/webhook/[slug]/route.ts:33-35` returns `401 Invalid signature`. Fires BEFORE type guard (39) and BEFORE `after()` (47) — a forged `type:payment`/`status:approved` POST never triggers work. `data.id` resolved from query string first (20), passed as `dataIdQuery ?? body.data?.id` (33), not body-only (Pitfall 1 avoided). |
| T-02-04 | Tampering / Elevation | mitigate | CLOSED | Amount check inside `approved` branch: `expectedCents = Math.round(Number(appt.deposit_amount\|\|0)*100)` (133), `paidCents = Math.round(Number(payment.transaction_amount\|\|0)*100)` (134), exact `!==` (135). `transaction_amount` sourced from MP API GET `/v1/payments/${paymentId}` (93-96), never the body. Mismatch → `payment_status:'amount_mismatch'` only (140-143, `status` untouched → stays `pending_payment`), `console.error` with cents (144), `return` (145) BEFORE email (170) and GCal (224). `payment_status` column has no CHECK constraint (`schema.sql:84` TEXT DEFAULT 'unpaid'; grep migrations → 0) so the write succeeds. |
| T-02-05 | Tampering / Replay | accept (partial) | CLOSED | Status-guard idempotency `route.ts:122` — `if (appt.status !== 'pending_payment') return`; a re-fired `approved` over an already-confirmed/completed/cancelled turn does not re-confirm or re-send mail. `ts` anti-replay explicitly deferred to backlog v2 (documented accepted risk, CONTEXT §83, outside SEC-02). |
| T-02-06 | DoS (self-inflicted) | mitigate | CLOSED | `getMPWebhookSecret()` keys the secret by `MP_MODE` (`lib/mercadopago.ts:24-29`) → no test/prod cross. Pre-deploy human checkpoint (02-02-PLAN Task 3, blocking-human) completed — user confirmed `MP_WEBHOOK_SECRET[_TEST]` set in Vercel and matches MP app secret (02-02-SUMMARY T3), preventing silent total fail-closed. |
| T-02-07 | Information Disclosure | mitigate | CLOSED | `crypto.timingSafeEqual` (`lib/mercadopago.ts:72`) preceded by length guard `if (a.length !== b.length) return false` (71) — inherited from the verbatim extraction. No timing side-channel in signature comparison. |
| T-02-SC | Tampering (supply chain) | accept | CLOSED | No package installs this phase. Phase commits (367c2c8, 032e083, bf4d2a5, 6c32a04) modify only `lib/mercadopago.ts` and `app/api/payment/webhook/[slug]/route.ts`; `crypto` is a Node built-in. No slopsquatting surface. Declared `accept` in both plans. |

## Accepted Risks Log

| Threat ID | Risk Accepted | Rationale | Owner |
|-----------|---------------|-----------|-------|
| T-02-02 | Subscription webhook refactor could regress | Import-only change; behavior bounded by tsc + lint + untouched call site; verified zero inline HMAC remains | Phase plan author |
| T-02-05 (partial) | No `ts`-based anti-replay window | Status-guard prevents the impactful replay (double-confirm/double-mail). Timestamp-freshness anti-replay deferred to backlog v2; outside SEC-02 scope (CONTEXT §83) | Phase plan author |
| T-02-SC | No supply-chain scanning performed | Phase installs no packages; `crypto` is Node built-in | Phase plan author |

## Unregistered Flags

None. Both `## Threat Flags` / threat sections in the SUMMARYs report no new attack surface:
- `02-01-SUMMARY.md` "Threat Model Compliance": T-02-01, T-02-02, T-02-SC accounted for.
- `02-02-SUMMARY.md` "Threat Flags": "Ninguna nueva. T-02-03 (forged approved) y T-02-04 (wrong amount) mitigadas."

No new exports, entry points, or data flows appeared during implementation that lack a threat mapping.

## Notes

- All 6 `mitigate` threats verified by locating the actual mitigating code (not structure inference). The two webhooks share a single verifier; both entry points (`payment/webhook/[slug]`, `subscription/webhook`) call the same fail-closed `verifyMPSignature` — the mitigation applies to ALL signature entry points, not just one.
- The 3 `accept` threats (T-02-02, T-02-05 partial, T-02-SC) are recorded in the Accepted Risks Log above per the audit's `accept` verification method.
- `block_on: high` — zero open threats, nothing to block.
