---
phase: 02-mp-webhook-signature-amount-check
plan: 02
subsystem: api
tags: [mercadopago, webhook, signature, hmac, security, payments]
requires: [02-01]
completed: 2026-06-16
status: complete
---

# Phase 2 Plan 02: endurecer el webhook de seña (firma + monto)

Cierre de SEC-02 en `app/api/payment/webhook/[slug]/route.ts`: firma `x-signature` fail-closed + chequeo de monto exacto. El secreto de webhook fue confirmado en el entorno (checkpoint humano).

## Qué se hizo

- **Gate de firma (T1, commit `bf4d2a5`):** importa `verifyMPSignature` de `@/lib/mercadopago` (extraído en 02-01); resuelve `data.id` del query string primero (`searchParams.get('data.id') ?? get('id')`, fallback al body); verifica la firma ANTES del guard `body.type !== 'payment'` y del `after()`. Firma ausente/inválida → `401 Invalid signature`. Fail-closed (sin `MP_WEBHOOK_SECRET` → false → 401). Bad-JSON y non-payment siguen devolviendo `200`.
- **Chequeo de monto (T2, commit `6c32a04`):** dentro del branch `approved`, tras el status-guard de idempotencia y antes del update a `confirmed`: `Math.round(transaction_amount*100) !== Math.round(deposit_amount*100)` → `payment_status='amount_mismatch'`, turno queda `pending_payment` (no se cancela), `console.error` con `{paymentId, expected_cents, paid_cents}`, `return` antes de email/GCal. Confirmado en `schema.sql:84` que `payment_status` es TEXT DEFAULT 'unpaid' sin CHECK constraint.
- **Checkpoint de env (T3, human-verify):** el usuario confirmó que el `MP_WEBHOOK_SECRET[_TEST]` del modo activo está seteado en Vercel y coincide con el secret de la app en MP, antes de deployar.

## Verificación

- `npx tsc --noEmit` limpio.
- Firma fail-closed antes de `after()`; `data.id` query-string-primero (mirror del webhook de suscripción).
- Mismatch de monto no confirma el turno ni dispara side-effects; deja rastro distintivo en `payment_status`.

## Threat Flags
- Ninguna nueva. T-02-03 (forged approved) y T-02-04 (wrong amount) mitigadas.

## Self-Check: PASSED
