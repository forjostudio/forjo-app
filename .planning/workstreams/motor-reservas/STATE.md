---
gsd_state_version: 1.0
milestone: v0.24
milestone_name: — Turnos fijos / Abonos recurrentes
status: executing
stopped_at: Completed 06-01-PLAN.md
last_updated: "2026-07-20T23:16:09.372Z"
last_activity: 2026-07-20 -- Phase 06 execution started
progress:
  total_phases: 7
  completed_phases: 5
  total_plans: 25
  completed_plans: 22
  percent: 71
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-16)

**Core value:** Un negocio NUNCA puede leer ni modificar datos de otro y los pagos no pueden falsificarse; el núcleo de integridad anti-doble-booking (v0.9/v0.12) no puede regresar. v0.24 agrega abonos semanales (turno fijo recurrente): alta manual por el dueño + generación forward de los turnos respetando 011/013 + cupos + espacio compartido + cancelación por link en el mail / panel. **Solo reserva** (el cobro recurrente es futuro; el modelo se diseña extensible).
**Current focus:** Phase 06 — modelo-del-abono-alta-manual-generaci-n-forward

## Current Position

Phase: 06 (modelo-del-abono-alta-manual-generaci-n-forward) — EXECUTING
Plan: 3 of 5
Status: Ready to execute
Last activity: 2026-07-20 -- Phase 06 execution started

## Performance Metrics

**Velocity (workstream, histórico):**

- v0.12 (Phases 1-3, shipped 2026-06-30): 14 plans completados
- v0.22 (Phases 4-5, shipped 2026-07-19): 6 plans completados
- v0.24 (Phases 6-7): 0 plans completados

**By Phase (v0.24):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 6 | TBD | - | - |
| 7 | TBD | - | - |

*Updated after each plan completion*
| Phase 06 P01 | 20min | 2 tasks | 3 files |
| Phase 06 P02 | 18min | 2 tasks | 2 files |

## Accumulated Context

### Decisions

Decisiones LOCKED de v0.24 (ver REQUIREMENTS.md + PROJECT.md):

- **Solo reserva, sin cobro.** El cobro recurrente automático (MP preapproval por cliente) es milestone FUTURO; v0.24 deja el **modelo de datos extensible** para sumarlo sin re-migrar.
- **Alta manual por el dueño** (no pública en v1), reusando el pipeline de alta de turno existente (validación + anti-tampering de tenant, `.eq('business_id', ...)`, re-validar service/professional/location/cancha).
- **Recurrencia semanal** (mismo día y hora), **indefinido hasta cancelar**. No quincenal/mensual en v1.
- **Generación forward** = ventana rolling de N semanas, primera tanda al crear el abono + extendida por el **cron DIARIO existente** de Vercel (Hobby: sin crons más frecuentes).
- **Cancelación** por **link en el mail** (token a nivel serie, patrón del cancel-token de turno actual) + **baja desde el panel** del dueño.
- **Faseo por integridad:** Phase 6 (modelo + alta + generación forward, núcleo anti-doble-booking → **secure-phase**) → Phase 7 (cancelación mail + panel).

Heredadas del workstream (siguen vigentes):

- Núcleo anti-doble-booking = RPC atómico `book_slot_atomic` (cupos capacity-aware + advisory lock por espacio compartido). La generación forward del abono DEBE insertar por este mismo camino atómico, nunca por insert directo.
- Cupo por `time_blocks.capacity` (default 1 = cero regresión); público ve "disponible/lleno" sin lugares restantes.
- [Phase 06]: book_slot_atomic intacto: abono_id se setea con UPDATE post-insert fuera del RPC (etiqueta no-constraint)
- [Phase 06]: schema.sql editado quirúrgicamente (no dump) porque el CLI v2.107 reordena el archivo entero
- [Phase ?]: 06-02: motor de abono materializa cada ocurrencia vía createAppointmentCore (nunca insert directo); skip-and-record ante conflicto
- [Phase ?]: 06-02: schedule_exception closed=false (horario especial) OVERRIDE la grilla semanal para ese dia (autoridad unica de horario)

### Pending Todos

None yet.

### Blockers/Concerns

- **[Phase 6 — migración]** Migración nueva **054** (idempotente, numerada) crea la tabla del abono (recurring booking) + el vínculo turno→abono, con RLS habilitada + policies por operación con `with check` por `business_id`/`owner_id`. Baseline de migraciones: última aplicada = **053** (`mp_connection_status`, v0.23) → la próxima es **054**. Se aplica **A MANO** al Supabase de prod, coordinada con el deploy (+ `NOTIFY pgrst, 'reload schema'` si toca cache) — **NO** por el flujo GSD. Diseñar el esquema **extensible** para cobro recurrente futuro sin re-migrar.
- **[Phase 6 — integridad]** La generación forward inserta cada ocurrencia por el RPC atómico existente (capacity-aware + advisory lock por espacio) → cero grieta de doble-booking / sobrecupo / conflicto de espacio bajo concurrencia con reservas públicas o manuales. **secure-phase obligatorio.**
- **[Phase 6 — cron]** La extensión de la ventana corre en el **cron diario existente** (`vercel.json` → `0 3 * * *`, `/api/cron/cancel-expired` o un cron análogo). Vercel Hobby NO permite crons más frecuentes que diario — no agregar ninguno.
- **[Phase 6 — comportamiento]** Manejo exacto de una ocurrencia que choca (turno existente / día cerrado / excepción de horario): saltear y/o avisar — **cerrar en discuss-phase**.
- **[Phase 7 — token]** El token del link de cancelación debe scopear a la serie correcta (no adivinable + `timingSafeEqual`, patrón del cancel-token de turno) sin permitir cancelar el abono de otro tenant.
- **[Phase 7 — turnos ya generados]** Qué pasa con los turnos futuros ya generados al dar de baja (cancelarlos o dejarlos), consistente entre baja por mail y por panel — **cerrar en discuss-phase**.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Abono | Cobro recurrente automático (MP preapproval por cliente) — modelo queda extensible | milestone futuro | 2026-07-20 |
| Abono | Recurrencia no-semanal (quincenal / mensual / custom) | v2 | 2026-07-20 |
| Abono | Alta pública del abono por el cliente (desde `/[slug]`) | v2 | 2026-07-20 |
| Abono | Waitlist si el slot del abono está ocupado | v2 | 2026-07-20 |
| Abono | Editar / reprogramar una serie viva (cambiar día/hora) | v2 | 2026-07-20 |
| Ventana | Anticipación **mínima** (espejo del máximo) | v2 | 2026-07-18 |
| Ventana | Ventana **por servicio** (se eligió global por negocio) | v2 | 2026-07-18 |
| Alta manual | Seña en el alta manual (MANUAL-04) | v2 | 2026-06-25 |
| Plan | Enforcement server-side de límites de plan ([[plan-model-agendas]]) | backlog | 2026-07-18 |

## Session Continuity

Last session: 2026-07-20T23:15:41.058Z
Stopped at: Completed 06-01-PLAN.md
Resume file: .planning/workstreams/motor-reservas/phases/06-modelo-del-abono-alta-manual-generaci-n-forward/06-CONTEXT.md

## Operator Next Steps

- Planificar la primera fase: `/gsd-plan-phase 6 --ws motor-reservas`
- Phase 6 es **security-sensitive** (secure-phase obligatorio): toca el núcleo anti-doble-booking + crea entidad de tenant nueva (migración 054).
