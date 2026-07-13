---
gsd_state_version: 1.0
milestone: v0.13
milestone_name: Vertical Canchas
status: Awaiting next milestone
stopped_at: Completed 03-02-PLAN.md
last_updated: "2026-07-02T19:53:04.004Z"
last_activity: 2026-07-02 — Milestone v0.13 completed and archived
progress:
  total_phases: 3
  completed_phases: 3
  total_plans: 6
  completed_plans: 6
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (compartido por todos los workstreams)
Requirements: .planning/workstreams/canchas/REQUIREMENTS.md
Roadmap: .planning/workstreams/canchas/ROADMAP.md

**Core value:** Un negocio NUNCA puede leer ni modificar datos de otro, y los flujos de pago no pueden ser forzados ni falsificados (aislamiento multi-tenant + integridad de pagos).
**Current focus:** Phase 03 — Booking público de alquiler

## Current Position

Phase: Milestone v0.13 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-07-02 — Milestone v0.13 completed and archived

## Milestone Context

v0.13 construye ENCIMA del motor de espacio compartido de v0.12 (YA LIVE en prod: `spaces`/`agenda_spaces`/`appointment_spaces` + `book_slot_atomic` + EXCLUDE gist, migraciones 040/041/042). NO se re-construye ni se re-migra el motor. Eje de agenda = fila de `professionals` (cada cancha = bucket/agenda); anti-solape por duración → duración variable por cancha ya soportada.

Faseo: vertical-scaffold (P1) → cancha-config (P2) → booking-público (P3).

## Accumulated Context

### Decisions

Decisiones de negocio LOCKED (del milestone_context, no re-litigar en discuss):

- Cancha = entidad reservable unificada: nombre + precio propio + duración fija seteada por el dueño (variable entre canchas). Por debajo = agenda (`professionals`) + espacios.
- Vertical canchas QUITA "Profesionales/Equipo" del dashboard (el bookable es la cancha; no hay staff en el 99%).
- Booking público: el cliente elige cancha + horario; NO elige duración (es la fija de la cancha). Más tiempo = dos turnos consecutivos. Sin picker custom.
- Exclusión por espacio de v0.12 aplica al booking público de canchas.

Decisiones de fase ABIERTAS (resolver en discuss-phase, NO lockeadas en el roadmap):

- P1: ¿`VerticalKey` nuevo `canchas` con menú/terminología propios vs elevar el `TYPE_TERMINOLOGY_OVERRIDE` actual (hoy label-only)?
- P2: ¿dónde viven precio + duración fija de la cancha? — reusar `services` vs columnas nuevas en la agenda vs tabla dedicada. (Flag de migración: toda tabla/columna nueva = RLS + policies por op con WITH CHECK business_id.)
- P3: qué vista acotada (`public_*`) expone la cancha a `anon` sin filtrar config interna (depende del modelo de P2).
- [Phase ?]: Vertical canchas = VerticalKey de primera clase (Opción A); TYPE_TERMINOLOGY_OVERRIDE eliminado, cada vertical dueña su terminología
- [Phase ?]: Guard server-side en /equipo redirige negocios canchas a /dashboard antes de las queries (D-05, anti-leak)
- [Phase ?]: D-06 materializado: professionals.service_id (migr. 043) es el puntero 1:1 cancha↔agenda; lib/canchas.ts empareja por service_id, nunca por nombre
- [Phase 03]: public_canchas: GRANT ALL (patrón baseline) y NO expone service_id (solo JOIN+WHERE, D-01)
- [Phase 03]: schema.sql editado a mano junto a public_services porque el guardrail prohíbe correr supabase db reset
- [Phase ?]: Canchas create deriva service de professionals.service_id re-validado por business_id; serviceId del body ignorado en canchas

### Pending Todos

None yet.

### Blockers/Concerns

None yet.

## Deferred Items (v2 / future — NO en v0.13)

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Staff | STAFF-CANCHAS-01 (profesionales para canchas, add-on) | Deferred | v0.13 scoping |
| Servicios-espacio | SERVICIOS-ESPACIO-01 (gym/consultorio que comparten espacios) | Deferred | v0.13 scoping |
| Pricing | PRICING-FRANJA-01 (pricing dinámico peak/off-peak) | Deferred | v0.13 scoping |

## Session Continuity

Last session: 2026-07-01T21:59:00.458Z
Stopped at: Completed 03-02-PLAN.md
Resume file: None
Next: `/gsd:discuss-phase 1 --ws canchas`

## Performance Metrics

| Phase | Plan | Duration | Notes |
|-------|------|----------|-------|
| Phase 01 P01 | ~7 min | 3 tasks | 3 files |
| Phase 02 P01 | 15 min | 3 tasks | 5 files |
| Phase 03 P01 | 18min | 2 tasks | 4 files |
| Phase 03 P02 | 12min | 1 tasks | 1 files |

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
