# Phase 4: Plan Gating on Public Booking - Discussion Log

> **Audit trail only.** Decisiones canónicas en CONTEXT.md.

**Date:** 2026-06-17
**Phase:** 4-Plan Gating on Public Booking
**Mode:** interactive (default)
**Areas discussed:** Manejo de plan_status NULL/legacy (las otras dos micro-decisiones se tomaron con el default recomendado)

---

## Manejo de plan_status NULL/legacy

| Option | Description | Selected |
|--------|-------------|----------|
| Blocklist: permitir null | solo bloquea expired/cancelled; null/legacy/desconocido permitido | ✓ |
| Allowlist: bloquear null | solo permite active/trial; resto bloqueado | |

**Decisión:** Blocklist — solo `expired`/`cancelled` bloquean; null/legacy → permitido (no bloquear negocios legítimos, Pitfall 11).

## Decisiones tomadas con el default recomendado (no seleccionadas para discutir)
- Código de rechazo: `403` + `{ ok:false, error:'plan_inactive' }`.
- UX de la página pública: fuera de scope (solo el endpoint, como pide el brief) → deferred.

## Deferred Ideas
- UX página pública para negocios vencidos.
- Gating en availability u otros endpoints de booking.
