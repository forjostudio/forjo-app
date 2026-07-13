---
gsd_state_version: 1.0
milestone: v0.12
milestone_name: Motor de Reservas
status: Awaiting next milestone
stopped_at: Phase 3 context gathered
last_updated: "2026-06-30T15:33:40.906Z"
last_activity: 2026-06-30 — Milestone v0.12 completed and archived
progress:
  total_phases: 3
  completed_phases: 3
  total_plans: 14
  completed_plans: 14
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-25)

**Core value:** El núcleo de integridad anti-doble-booking que endureció v0.9 NO puede regresar; agregar capacidad (cupos) y espacio físico nunca puede permitir sobrecupo, doble-reserva ni conflicto de espacio, ni bajo concurrencia. Cero regresión para 1-turno-por-slot.
**Current focus:** Phase 03 — espacio-compartido

## Current Position

Phase: Milestone v0.12 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-06-30 — Milestone v0.12 completed and archived

## Performance Metrics

**Velocity:**

- Total plans completed: 9
- Average duration: — min
- Total execution time: — hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 4 | - | - |
| 03 | 5 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01 P01 | 5 | 3 tasks | 5 files |
| Phase 01-turnos-manuales P02 | 8 | 2 tasks | 3 files |
| Phase 01 P03 | 35min | 3 tasks | 3 files |
| Phase 01 P04 | 14 | 4 tasks | 5 files |
| Phase 02 P01 | 18min | 3 tasks | 4 files |
| Phase 02 P02 | 40 | 2 tasks | 7 files |
| Phase 02-cupos-grupales P03 | 9min | 2 tasks | 2 files |
| Phase 02 P04 | 45min | 2 tasks | 2 files |
| Phase 02 P05 | 12min | 1 tasks | 1 files |
| Phase 03 P03-02 | 10min | 2 tasks | 2 files |
| Phase 03 P03-05 | 12min | 2 tasks | 2 files |

## Accumulated Context

### Decisions

Decisiones LOCKED del milestone (ver PROJECT.md → "Current Milestone (workstream `motor-reservas`)"):

- Cupo **por profesional/horario** en `time_blocks` (default 1 = cero regresión), NO en el servicio.
- Concurrencia anti-sobrecupo = **chequeo atómico deliberado** (lock por slot / `SELECT … FOR UPDATE` / serializable), nunca `count` simple.
- Público ve "disponible/lleno", NO ve lugares restantes; admin ve contador + roster.
- Faseo LOCKED: manual (C) → cupos (A) → espacio (B); B recortable como fase final.
- El modelo "agenda como recurso" se decide **una vez en la Phase 2 (cupos)** contemplando ya el espacio compartido (Phase 3), para no pagar una migración después.
- [Phase ?]: El core no inserta clients: el caller pasa clientId (publico siempre nuevo, manual dedupe)
- [Phase ?]: El core devuelve cancelledHoldIds y NO manda mails; los mails de holds vencidos quedan en el after() del caller publico (frontera de no-regresion)
- [Phase ?]: Plan 01-02: dedupe de cliente inline en el route handler; el core sigue sin tocar la tabla clients
- [Phase ?]: 040 es hardening RLS (FOR INSERT WITH CHECK), no fix funcional; migraciones post-baseline usan underscore no guion
- [Phase ?]: 01-04: form de alta manual = shell Dialog/Drawer + cuerpo remontado por key={open}; useMediaQuery con useSyncExternalStore (lint-clean)
- [Phase ?]: 01-04: alta de turno desde el dashboard SIEMPRE via /api/appointments/create (sin insert client-side); D-08 acotado a click-en-dia->fecha
- [Phase ?]: Plan 02-02: el RAISE slot_full del RPC se gatea a capacity>1; cupo 1 -> seat 0 fijo -> 23505 -> slot_taken (cero regresion)
- [Phase ?]: Plan 02-02: re-check JS capacity-aware (resuelve la capacity del slot, solo rechaza temprano cupo 1); el alta del core va por supabase.rpc(book_slot_atomic). Tests de integracion contra Supabase local.
- [Phase ?]: 02-04: campo cupo en agenda-client.tsx (no settings); roster reusa dialog+drawer sin deps; celda de dia <div>+header-boton por a11y de los chips-boton del roster
- [Phase ?]: Suite Vitest = 301 tests (26 files) tras 02-05; CONC-01/02 + CUPOS-03/02 verdes contra Supabase local con 041 aplicada
- [Phase ?]: 03-01: exclusión de espacio IN-PLACE en book_slot_atomic (no RPC nuevo); reusa slot_taken 409; agenda_spaces keya por professional_id real; sin read anon (D-06); backstop appointment_spaces diferido a Plan 03-04
- [Phase ?]: 03-01: PENDIENTE deploy — aplicar migr.042 a mano al Supabase de prod + NOTIFY pgrst 'reload schema' coordinado con el deploy (igual que 041); validación local PG17 ya hecha, NO re-correr
- [Phase ?]: Disponibilidad acoplada 03-02: siblingBusy a busy (no full), respuesta { ok, busy, full } sin leak (D-06), re-check JS es UX (autoridad = RPC Plan 01)

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 2] Discuss-phase pendientes del encuadre §5: bloque grupal atado a clase/servicio vs capacidad genérica del slot; estrategia Google Calendar (1 evento N asistentes vs N eventos); modelo de recurso genérico vs `professionals`+tipo (decide §8/Phase 3).
- [Phase 2/3] Toca el core que v0.9 endureció (constraints 011/013). Cada fase que cambie el alta o los constraints debe preservar aislamiento por tenant + anti-doble-booking. Extender la suite Vitest (molde TEST-01) con los tests de concurrencia es la ingeniería real del milestone.
- [Phase 2 · Plan 02-02 · RESUELTO] Los tests de integración ahora corren contra el Supabase LOCAL vía `.env.test.local` (gitignored) + `config({ path: '.env.test.local', override: true })` en vitest.setup.ts (commit cee4a70). `booking-core.test.ts` 5/5 verde (incl. Test D = slot_taken cupo 1, confirma el fix 88dcffb). NO se aplicó la 041 a prod.
- [Phase 2 · PENDIENTE de deploy] La migración 041 (con el fix de cupo-1, commit 88dcffb: slot_full gateado a capacity>1; cupo 1 → seat 0 fijo → 23505 → slot_taken) debe aplicarse A MANO al proyecto Supabase de producción, coordinado con el deploy, + recargar el schema cache de PostgREST (`NOTIFY pgrst, 'reload schema';`). Hasta entonces book_slot_atomic solo existe en local.

## Deferred Items

Items reconocidos pero diferidos a v2 (de REQUIREMENTS.md):

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Waitlist | WAIT-01 lista de espera al llenarse el cupo | v2 | 2026-06-25 |
| Cancelación | CANCEL-REOPEN-01 re-apertura automática del lugar al cancelar | v2 | 2026-06-25 |
| Google Calendar | GCAL-GROUP-01 estrategia GCal para clases grupales | v2 | 2026-06-25 |

## Session Continuity

Last session: 2026-06-30T15:09:57.996Z
Stopped at: Phase 3 context gathered
Resume file: .planning/workstreams/motor-reservas/phases/03-espacio-compartido/03-CONTEXT.md

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
