---
gsd_state_version: 1.0
milestone: v0.22
milestone_name: "— Turnos: alta manual y ventana de reserva"
status: executing
stopped_at: Phase 5 context gathered
last_updated: "2026-07-19T05:14:09.934Z"
last_activity: 2026-07-18 -- Phase 04 execution started
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 18
  completed_plans: 18
  percent: 80
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-16)

**Core value:** Un negocio NUNCA puede leer ni modificar datos de otro y los pagos no pueden falsificarse; el núcleo de integridad anti-doble-booking (v0.9/v0.12) no puede regresar. v0.22 agrega la ventana de reserva pública (con backstop server anti-tampering) y un aviso opt-in por mail al alta manual, sin reconstruir nada de v0.12.
**Current focus:** Phase 04 — ventana-de-reserva-p-blica

## Current Position

Phase: 04 (ventana-de-reserva-p-blica) — EXECUTING
Plan: 2 of 4
Status: Ready to execute
Last activity: 2026-07-18 -- Phase 04 execution started

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity (workstream, histórico v0.12):**

- Total plans completed: 14 (Phases 1-3, v0.12 shipped 2026-06-30)
- v0.22: 0 plans completados

**By Phase (v0.22):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 4 | TBD | - | - |
| 5 | TBD | - | - |

*Updated after each plan completion*
| Phase 04 P03 | ~15m | 2 tasks | 2 files |

## Accumulated Context

### Decisions

Decisiones LOCKED de v0.22 (ver REQUIREMENTS.md):

- Ventana de reserva = **global por negocio** (`businesses.max_advance_days`, vacío/0 = sin límite), NO por servicio; **anticipación mínima** diferida.
- La ventana aplica **SOLO al público** (dos calendarios + backstop server); el **alta manual autenticada NO se limita**.
- BOOK-WINDOW-03 = **backstop anti-tampering** en `app/api/booking/create` (no confiar en el cliente).
- El **alta manual YA existe** (v0.12, MANUAL-01/02/03: `app/api/appointments/create` + form "Nuevo turno" `nuevo-turno-form.tsx`); v0.22 NO la reconstruye.
- Aviso al cliente = checkbox **opt-in destildado por defecto** (respeta la decisión de v0.12 de no mandar mail); Google Calendar ya sincroniza, no cambia.

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 4] La migración `businesses.max_advance_days` es aditiva pero se aplica A MANO al Supabase de prod (baseline de migraciones: últimas aplicadas 050/051 de v0.18 → la próxima es **052**), coordinada con el deploy + `NOTIFY pgrst, 'reload schema'` si toca cache. Debe preservar RLS y no exponer columnas de `businesses` a `anon`: el valor de la ventana viaja al público por el read-path acotado ya existente.
- [Phase 4] Los dos calendarios públicos son gemelos (`booking-client.tsx` + `canchas-booking-client.tsx`, react-day-picker): el cap de navegación de mes + días deshabilitados hay que aplicarlo en AMBOS con el mismo comportamiento.
- [Phase 5] El mail debe usar los secretos de email acotados por tenant (`business_secrets` vía `getBusinessSecrets`, patrón v0.9) y salir como efecto best-effort en `after()`; si falla, el alta NO se rompe.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Ventana | Anticipación **mínima** (espejo del máximo) | v2 | 2026-07-18 |
| Ventana | Ventana **por servicio** (se eligió global por negocio) | v2 | 2026-07-18 |
| Alta manual | Seña en el alta manual (MANUAL-04) | v2 | 2026-06-25 |
| Plan | Enforcement server-side de límites de plan ([[plan-model-agendas]]) | backlog | 2026-07-18 |

## Session Continuity

Last session: 2026-07-19T05:14:09.920Z
Stopped at: Phase 5 context gathered
Resume file: .planning/workstreams/motor-reservas/phases/05-aviso-al-cliente-en-el-alta-manual/05-CONTEXT.md

## Operator Next Steps

- Planificar la Phase 4 con `/gsd:plan-phase 4 --ws motor-reservas` (o `/gsd:discuss-phase 4 --ws motor-reservas` si querés fijar contexto antes de planear).
