# Phase 2: MP Webhook Signature + Amount Check - Discussion Log

> **Audit trail only.** Las decisiones canónicas están en CONTEXT.md.

**Date:** 2026-06-16
**Phase:** 2-MP Webhook Signature + Amount Check
**Mode:** interactive (default)
**Areas discussed:** Tolerancia del monto, Acción ante mismatch

---

## Tolerancia / método de comparación del monto

| Option | Description | Selected |
|--------|-------------|----------|
| Exacto en centavos enteros | round(x*100) en ambos, comparar enteros; cualquier diferencia → mismatch | ✓ |
| Pagar ≥ esperado | aceptar igual o de más; solo underpayment → mismatch | |
| Margen ±1 unidad | tolerar ~1 peso de redondeo | |

**Decisión:** Exacto en centavos enteros. La preferencia la arma el server, así que deben coincidir exacto; se usa `transaction_amount` traído de MP, no del body.

---

## Acción ante mismatch de monto

| Option | Description | Selected |
|--------|-------------|----------|
| pending_payment + indicador | turno NO confirmado, queda pending_payment, payment_status='amount_mismatch' + log; distingue de "sin intento" | ✓ |
| Cancelar el turno | marcar cancelled | |
| Solo loguear | confirmar igual pero loguear | |

**Decisión (texto del usuario):** "el turno queda en pending_payment con algún indicador (un log o un campo) que distinga 'pago intentado con monto incorrecto' de 'sin intento de pago'". → `payment_status='amount_mismatch'` + `console.error`, sin tocar `status`. Sin email ni evento de calendar en ese caso.

## Claude's Discretion
- Nombre exacto del valor `payment_status` para el mismatch.

## Deferred Ideas
- `webhook_events` para idempotencia fuerte → v2.
- Anti-replay del `ts` → research opcional, fuera del criterio de SEC-02.
