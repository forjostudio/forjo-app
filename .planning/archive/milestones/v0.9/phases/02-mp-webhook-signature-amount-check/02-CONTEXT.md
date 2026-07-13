# Phase 2: MP Webhook Signature + Amount Check - Context

**Gathered:** 2026-06-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Endurecer el webhook de seña `app/api/payment/webhook/[slug]/route.ts` (SEC-02):
1. **Validar la firma `x-signature` fail-closed** — hoy el webhook NO valida firma (procesa cualquier POST con `type:'payment'`). Reusar el `verifyMPSignature` ya validado del webhook de suscripción, extrayéndolo a `lib/mercadopago.ts`.
2. **Comparar el monto pagado contra la seña esperada** — hoy confirma el turno solo con `payment.status === 'approved'`, sin mirar `transaction_amount`. Agregar la comparación contra `appt.deposit_amount` antes de confirmar.

**Fuera de scope:** el webhook de suscripción ya valida firma (solo se refactoriza para importar la función compartida, sin cambiar su comportamiento); idempotencia fuerte vía `webhook_events` (backlog v2); las fases 3/4/5.
</domain>

<decisions>
## Implementation Decisions

### Comparación de monto
- **D-01:** Comparación **exacta en centavos enteros**: `Math.round(payment.transaction_amount * 100) === Math.round(appt.deposit_amount * 100)`. Cualquier diferencia (de más o de menos) cuenta como monto incorrecto. Se usa el `transaction_amount` traído de MP (`GET /v1/payments/{id}`, ya se hace en el handler), NUNCA un monto del body del webhook. Se evita comparar floats directos (bug 1500.00 !== 1499.999).

### Acción ante mismatch de monto
- **D-02:** Si el monto no coincide (firma válida, pago `approved`, pero monto ≠ esperado): **NO confirmar el turno**. El turno queda en `pending_payment` (no se cancela), y se setea `payment_status = 'amount_mismatch'` (valor distintivo) + `console.error('[payment/webhook] monto incorrecto', { paymentId, expected, paid })`. Esto distingue claramente "intentó pagar con monto incorrecto" (`payment_status='amount_mismatch'`) de "nunca intentó pagar" (`payment_status` nulo). No se manda email de confirmación ni se crea evento de Google Calendar en este caso.

### Firma `x-signature` (carried-forward / locked desde PROJECT.md + Fase 1)
- **D-03:** Extraer `verifyMPSignature` a `lib/mercadopago.ts` (donde ya vive `getMPWebhookSecret`) con la misma firma `(request, dataId)`, e importarlo en AMBOS webhooks (seña + suscripción). El de suscripción solo cambia el import — su comportamiento no cambia. Elimina la duplicación (Key Decision de PROJECT.md).
- **D-04:** Fail-closed: sin `MP_WEBHOOK_SECRET[_TEST]` o firma inválida → `401`, antes de tocar nada (no procesar en `after()`). Patrón ya validado (ver [[webhook-mp-signature]]).
- **D-05:** `data.id` para el manifest se resuelve del **query string primero** (`searchParams.get('data.id') ?? searchParams.get('id')`), con fallback al `body.data.id`, lowercased — exactamente como el webhook de suscripción. Llamar `verifyMPSignature` con `body.data.id` solo haría fallar toda llamada real de MP (Pitfall de research).

### Claude's Discretion
- Nombre exacto del valor de `payment_status` para el mismatch (`'amount_mismatch'` propuesto) y si conviene un comentario en español denso explicando el porqué (convención del repo). El planner/executor lo definen siguiendo convenciones.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Implementación de referencia (la firma ya validada)
- `app/api/subscription/webhook/route.ts` §18-54 — `verifyMPSignature` validado (manifest `id;request-id;ts`, HMAC-SHA256, `timingSafeEqual`, fail-closed); §57-70 — resolución de `data.id` del query string + verificación antes de procesar. ESTE es el patrón a extraer y replicar.
- `lib/mercadopago.ts` — destino de la extracción; ya exporta `getMPWebhookSecret()` (respeta `MP_MODE` vía `MP_WEBHOOK_SECRET` / `MP_WEBHOOK_SECRET_TEST`).

### Archivo objetivo a endurecer
- `app/api/payment/webhook/[slug]/route.ts` — hoy: sin firma, confirma en `payment.status==='approved'` (§98) sin chequear `transaction_amount`; `data.id` solo del body (§22,27); `deposit_amount` ya disponible (§124); el payment ya se trae de MP (§76-79).

### Docs de proyecto / research / skills
- `.planning/research/PITFALLS.md` — pitfalls 8-10 (fuente de `data.id`, fail-open, comparación de monto por float/fuente equivocada).
- `.planning/research/ARCHITECTURE.md` §Pattern 3 — extract-and-reuse del verifier; §Anti-Pattern 4 — no confiar en el monto del body.
- `.planning/security-hardening-brief.md` §Fase 2 — goal y criterio de éxito.
- Skill `.claude/skills/mercadopago-suscripciones/SKILL.md` — patrón MP validado en producción y errores a no repetir.
- Memoria [[webhook-mp-signature]] — el webhook exige `MP_WEBHOOK_SECRET[_TEST]` o tira 401 (fail-closed).
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `verifyMPSignature` (subscription webhook §18-54): copiar tal cual a `lib/mercadopago.ts`, sin cambios de lógica. Su única dependencia (`getMPWebhookSecret`) ya está en el archivo destino.
- El handler de seña ya hace `GET /v1/payments/{paymentId}` con el token del negocio (§76) → `payment.transaction_amount` está disponible para la comparación sin un fetch extra.
- `appt.deposit_amount` ya se lee y normaliza (`depositAmt`, §124).
- Columna `payment_status` ya existe en `appointments` (se usa con `'paid'`); `'amount_mismatch'` es un valor nuevo del mismo campo.

### Established Patterns
- Fail-closed + verificar firma ANTES de `after()` (subscription webhook).
- Idempotencia por status-guard: solo procesar si `appt.status === 'pending_payment'` (§105) — se mantiene.
- Comentarios densos en español explicando el porqué (concurrencia, seguridad).

### Integration Points
- Ambos webhooks importan de `lib/mercadopago.ts` tras la extracción.
- El chequeo de monto va DENTRO del branch `payment.status === 'approved'`, antes del `update` a `confirmed` (§110).
</code_context>

<specifics>
## Specific Ideas

- El mismatch deja rastro en `payment_status='amount_mismatch'` + log con `{ paymentId, expected_cents, paid_cents }`, sin cancelar el turno (queda `pending_payment`).
</specifics>

<deferred>
## Deferred Ideas

- Tabla `webhook_events` para idempotencia fuerte (procesar cada evento una sola vez) → backlog v2.
- Validación anti-replay del `ts` de la firma (rechazar timestamps viejos con ventana de tolerancia) → no pedido; evaluar en research como hardening opcional, fuera del criterio de éxito de SEC-02.
</deferred>

<research_flags>
## Para que research confirme (decisión técnica, no del usuario)
- **Secreto de firma en el flujo Connect (per-negocio):** el webhook de seña recibe notificaciones de cuentas conectadas por OAuth. Confirmar que la firma se valida con el `MP_WEBHOOK_SECRET` global de la aplicación (lo que usa `getMPWebhookSecret`) y NO con un secreto por-negocio. Si MP usa un secreto distinto para notificaciones de Connect, ajustar la fuente del secreto.
- **Fuente de `data.id` en notificaciones de pago de Connect:** confirmar que MP manda `data.id` en el query string para estas notificaciones (como en suscripción), para no romper la verificación.
</research_flags>

---

*Phase: 2-MP Webhook Signature + Amount Check*
*Context gathered: 2026-06-16*
