---
gsd_state_version: 1.0
milestone: v0.23
milestone_name: — Resiliencia de MercadoPago Connect
current_plan: N/A
status: Roadmap ready
stopped_at: Phase 1 context gathered
last_updated: "2026-07-19T19:00:04.809Z"
last_activity: 2026-07-19 — Roadmap creado (2 fases, cobertura 6/6)
progress:
  total_phases: 2
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (sección "Current Milestone (workstream `mp-connect`)")

**Core value:** Un negocio NUNCA puede leer ni modificar datos de otro y los pagos no pueden falsificarse. v0.23 endurece la resiliencia del token OAuth **del negocio** (MercadoPago Connect / cobro de señas): un fallo de refresh deja de degradar en silencio — se detecta, se persiste, se avisa en el dashboard y se limpia al reconectar. NO toca el flujo de suscripciones de los planes (token de plataforma).
**Current focus:** Phase 1 — Detección y estado de conexión caída (backend, integridad de pagos)

## Current Position

Phase: Not started (roadmap listo)
Plan: —
Status: Roadmap ready — próximo paso planificar Phase 1
Last activity: 2026-07-19 — Roadmap creado (2 fases, cobertura 6/6)

## Progress

**Phases Complete:** 0/2
**Current Plan:** N/A

## Performance Metrics

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | TBD | - | - |
| 2 | TBD | - | - |

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisiones (propuestas del diagnóstico, confirmables en discuss-phase):

- Flag durable `businesses.mp_connection_status text default 'connected'` (sano=`'connected'`, caído=`'error'`) — en `businesses` porque el dashboard ya lee `business` y `mp_user_id` vive ahí.
- Migración **053** idempotente, NO aplicada por el flujo — orden coordinado con el deploy (baseline: última aplicada 052 de v0.22 → la próxima es 053).
- **Phase 1 pasa por secure-phase** (integridad de pagos + tokens single-use + RLS). Aplican skills `mercadopago-connect` + `supabase-multitenant-rls`.
- El resolver (`getValidMpAccessToken`, `lib/payment.ts`) NO cobra con token vencido ni con token rotado sin persistir; loguea el motivo real (fin del "fallback mudo").
- La reconexión OAuth exitosa (callback `app/api/mercadopago/callback/route.ts`) limpia el flag a sano.

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 1] La migración `053` (`businesses.mp_connection_status`) es idempotente y aditiva pero se aplica **A MANO** al Supabase de prod, coordinada con el deploy; NO se dispara por el flujo. Debe preservar RLS y no exponer la columna a `anon`; keyed por `business_id`/`owner_id` — un negocio no puede leer/cambiar el estado de otro.
- [Phase 1] El `refresh_token` de MP es **single-use**: si el refresh es exitoso pero falla persistir el token rotado, la conexión queda caída — hay que marcarla, no dejarla muda (MPCONN-02).
- [Phase 1] NO tocar el flujo de suscripciones de los planes (token de plataforma `MP_FORJO_ACCESS_TOKEN`) — es otro flujo.
- [Phase 2] El dashboard (`settings-client.tsx`) marca "Conectado" solo por `mp_user_id`; el aviso de reconexión debe leer el flag real sin exponer secretos de token en la UI. Depende de la columna + lógica de escritura de la Phase 1.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Tokens | Cifrado de los tokens en `business_secrets` (deuda #3) | v2 | 2026-07-19 |
| Cobros | Reintento automático de cobros fallidos | v2 | 2026-07-19 |
| Aviso | Notificación por mail al negocio de la caída (v0.23 avisa solo en dashboard) | futuro | 2026-07-19 |
| OAuth | `scope=offline_access read write` explícito en la URL de autorización (deuda #2) | discuss | 2026-07-19 |

## Session Continuity

Last session: 2026-07-19T19:00:04.801Z
Stopped at: Phase 1 context gathered
Resume file: .planning/workstreams/mp-connect/phases/01-detecci-n-y-estado-de-conexi-n-ca-da/01-CONTEXT.md

## Operator Next Steps

- Planificar la Phase 1 con `/gsd:discuss-phase 1 --ws mp-connect` (o `/gsd:plan-phase 1 --ws mp-connect`).
