---
phase: 04-plan-gating-public-booking
plan: 01
subsystem: api
tags: [booking, plan-gating, multi-tenant, security, supabase, mercadopago]

# Dependency graph
requires:
  - phase: 01-business-secrets
    provides: lookup de negocio por slug en booking/create (service-role, business_secrets aparte)
provides:
  - Gate de plan_status (blocklist expired/cancelled) en POST /api/booking/create
  - Reserva publica contra negocio vencido/cancelado responde 403 plan_inactive sin crear turno
affects: [public-booking-ux, testing, availability-gating]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Plan gating por blocklist explicito (no allowlist) para no sobre-bloquear trial/null/legacy"
    - "Early-return de gating reusando el lookup por slug existente (sin round-trip extra)"

key-files:
  created: []
  modified:
    - app/api/booking/create/route.ts

key-decisions:
  - "Blocklist explicito ['expired','cancelled'] en vez de allowlist !== 'active' (Pitfall 11): trial/null/legacy siguen recibiendo reservas"
  - "403 (no 404/409): el negocio existe pero no esta habilitado para recibir reservas (D-03)"
  - "plan_status agregado al select por slug existente (sin query nueva, D-02), leido por service-role server-trusted"

patterns-established:
  - "Plan gating: blocklist explicito de estados que cierran el booking, todo lo demas permitido por defecto"
  - "Gating temprano: corre tras if(!business) y antes de reCAPTCHA/servicio/slot"

requirements-completed: [SEC-04]

# Metrics
duration: 6min
completed: 2026-06-17
status: complete
---

# Phase 4 Plan 01: Plan Gating on Public Booking Summary

**Booking publico (`POST /api/booking/create`) rechaza con 403 `plan_inactive` a negocios con `plan_status` `expired`/`cancelled` via blocklist explicito, reusando el lookup por slug existente sin query extra.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-06-17T10:56:00Z
- **Completed:** 2026-06-17T11:02:16Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- `plan_status` agregado a la lista de columnas del `.select(...)` del lookup de negocio por slug (sin round-trip extra).
- Early-return gate inmediatamente despues del `if (!business)`: `['expired','cancelled'].includes(business.plan_status)` -> `403 { ok:false, error:'plan_inactive' }`, antes de reCAPTCHA/servicio/slot.
- Blocklist explicito: `active`/`trial`/`null`/legacy/desconocido siguen recibiendo reservas (mitigacion de Pitfall 11, evita sobre-bloqueo).
- Comentario en espanol justificando blocklist-no-allowlist, redactado por concepto (sin listar estados permitidos como tokens).

## Task Commits

Each task was committed atomically:

1. **Task 1: Gate de plan_status (blocklist expired/cancelled) en booking/create** - `d728373` (feat)

**Plan metadata:** `.planning/` gitignored -> SUMMARY/STATE/ROADMAP no se commitean (skipped_gitignored, esperado; persisten en disco).

## Files Created/Modified
- `app/api/booking/create/route.ts` - Select por slug ampliado con `plan_status`; early-return gate 403 `plan_inactive` con blocklist `['expired','cancelled']`.

## Decisions Made
- None - followed plan as specified (D-01 blocklist, D-02 implementacion sin query nueva, D-03 respuesta 403).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. `npx tsc --noEmit` paso limpio en el primer intento; todas las comprobaciones automatizadas (plan_status >=2 ocurrencias, `.includes(business.plan_status)`, `plan_inactive`+`status: 403`, tsc) pasaron.

## Threat Mitigations Applied
- **T-04-01 (Elevation of Privilege):** mitigado por el early-return blocklist tras `if (!business)`.
- **T-04-02 (DoS auto-infligido / sobre-bloqueo):** mitigado eligiendo blocklist explicito de dos valores, no allowlist.
- **T-04-03 (Tampering en `plan_status`):** mitigado leyendo `plan_status` por service-role del mismo lookup server-trusted por slug, nunca de vista anon ni input del cliente.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- SEC-04 cerrado: ultimo agujero de pre-lanzamiento (v0.9) en el booking publico.
- Fase 5 (tests Vitest) puede validar: `trial`/`active`/`null`/legacy NO entran al blocklist; `expired`/`cancelled` -> 403.
- Diferido (fuera de scope): UX de `/[slug]` para negocios vencidos; gating en `availability`.

## Self-Check: PASSED

- FOUND: app/api/booking/create/route.ts (modificado, plan_status en select+gate)
- FOUND: commit d728373 (feat 04-01)
- FOUND: .planning/phases/04-plan-gating-public-booking/04-01-SUMMARY.md

---
*Phase: 04-plan-gating-public-booking*
*Completed: 2026-06-17*
