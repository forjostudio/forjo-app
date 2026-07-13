---
phase: 02-cupos-grupales
plan: 03
subsystem: booking
tags: [availability, capacity, multi-tenant, non-leak, d-06, next16]

# Dependency graph
requires:
  - phase: 02-cupos-grupales
    provides: "Migración 041: time_blocks.capacity + appointments.seat/is_group + book_slot_atomic (espinazo de integridad)"
provides:
  - "availability capacity-aware: count por slot vs time_blocks.capacity → `full: string[]`"
  - "Contrato de respuesta `{ ok, busy, full }` (sin count, D-06) — base para el test no-leak de Plan 05"
  - "booking-client saltea slots llenos vía `full` del endpoint"
affects: [02-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Colapsar la ocupación a un booleano por slot (count >= capacity) y nunca serializar el conteo (D-06)"
    - "capacityFor(time) en el server: time_blocks por day_of_week (getUTCDay = EXTRACT(dow)) + ventana, MAX capacity, default 1"

key-files:
  created: []
  modified:
    - app/api/booking/availability/route.ts
    - app/[slug]/booking-client.tsx

key-decisions:
  - "Se mantiene `busy` y se AGREGA `full` (no se reemplaza): para capacity=1 coinciden, minimiza el blast radius en el client"
  - "dow vía new Date(`${date}T00:00:00Z`).getUTCDay() — mismo patrón LOCKED de lib/booking-core.ts, coincide con EXTRACT(dow) de la DB y con book_slot_atomic"
  - "capacityFor resuelto en memoria: una sola query de time_blocks del dow, luego MAX por ventana que cubre cada slot (consistente con COALESCE(MAX(tb.capacity),1) del RPC)"

patterns-established:
  - "El client confía en `full` y NUNCA recomputa ocupación contra capacity (no tiene ni debe tener el count)"

requirements-completed: [CUPOS-02]

# Metrics
duration: 9min
completed: 2026-06-27
status: complete
---

# Phase 2 Plan 03: Availability Capacity-Aware (No-Leak D-06) Summary

**`/api/booking/availability` ahora cuenta ocupantes por slot contra `time_blocks.capacity` y devuelve solo `full: string[]` (horarios llenos) junto al `busy` existente — el público ve disponible/lleno y JAMÁS cuántos lugares quedan (D-06 LOCKED); `booking-client` saltea los slots en `full`.**

## Performance

- **Tasks:** 2
- **Files modified:** 2
- **Duration:** ~9 min
- **Completed:** 2026-06-27

## Accomplishments
- **availability capacity-aware:** el endpoint suma una query de `time_blocks` del negocio (`day_of_week + start_time/end_time + capacity`) y construye `capacityFor(time)` (MAX de la capacity de los bloques cuya ventana cubre el slot, default 1). Cuenta ocupantes por `time` en el MISMO bucket `COALESCE(professional_id, SENTINEL)` y con el MISMO descarte de holds vencidos que `busy`, y devuelve `full = horarios con count >= capacity`.
- **No-leak (D-06):** la respuesta es `{ ok: true, busy, full }`. El conteo por horario (`countByTime`) se computa en memoria y **jamás se serializa** — no hay `remaining`, ni count, ni entrada por inscripto. El público solo recibe libre/lleno.
- **Cero regresión cupo 1:** `busy` se conserva intacto; para capacity=1, `full` y `busy` coinciden (1 ocupante = lleno). El client mantiene su `conflict` por solapamiento (duraciones variables del cupo individual) y AGREGA el skip por `full`.
- **booking-client:** captura `full` del fetch de availability y saltea el slot cuando su `time` está en `full`. `full` ausente → `[]` (defensivo, no rompe respuestas viejas). No recomputa ocupación ni muestra contador.

## Contrato de respuesta de availability (LOCKED — para el test no-leak de Plan 05)

```jsonc
// GET /api/booking/availability?slug=&date=&professionalId=
{
  "ok": true,
  "busy": [ { "time": "10:00:00", "status": "confirmed", "expires_at": null, "duration_minutes": 30 } ],
  "full": ["10:00:00", "11:00:00"]   // SOLO horarios llenos — NUNCA count/remaining/roster
}
```
El test CUPOS-02 (Plan 05) debe aseverar que la respuesta NO contiene el conteo por slot ni lugares restantes: solo `busy` (forma legacy, sin datos de cliente) y `full: string[]`.

## Task Commits

1. **Task 1: availability capacity-aware → full:string[] (non-leak D-06)** — `b535199` (feat)
2. **Task 2: booking-client saltea slots llenos por `full`** — `3cf08ec` (feat)

## Files Modified
- `app/api/booking/availability/route.ts` — query de `time_blocks` + `capacityFor(time)` + `full` por slot (count >= capacity); response `{ ok, busy, full }`.
- `app/[slug]/booking-client.tsx` — captura `full` del endpoint y `if (full.includes(time)) continue` en el loop de generación de slots.

## Decisions Made
- **Mantener `busy` + agregar `full`:** no se reemplaza `busy` (compatibilidad/minimizar blast radius). Para capacity=1 ambos coinciden, así el caso individual no cambia de comportamiento.
- **dow vía `getUTCDay()`:** se reusó el patrón LOCKED de `lib/booking-core.ts:125` (`new Date(\`${date}T00:00:00Z\`).getUTCDay()`), que coincide con `EXTRACT(dow)` de la DB y con `book_slot_atomic`. Garantiza que availability resuelva la MISMA capacity que el RPC.
- **`capacityFor` en memoria:** una sola query de `time_blocks` del dow, luego MAX por ventana que cubre cada slot — evita N queries por slot y replica `COALESCE(MAX(tb.capacity), 1)` del RPC.

## Deviations from Plan

None - plan executed exactly as written. (Ajuste menor de redacción: el comentario que explica el no-leak se reformuló para no contener literalmente la palabra `remaining`, evitando un falso positivo del grep de verificación — mismo patrón que el Issue de 02-01. No afecta el código ni la respuesta.)

## Known Stubs
None.

## Threat Flags
None — el plan no introduce superficie de seguridad nueva fuera del `<threat_model>`. El endpoint sigue resolviendo el tenant por slug con service-role (sin confiar en IDs del cliente) y el `full` colapsa la ocupación, cumpliendo T-02-10 (mitigate).

## Issues Encountered
- Falso positivo del grep de no-leak: la cadena `remaining` aparecía en un comentario explicando la prohibición. Se reformuló el comentario a "lugares restantes"; `Response.json` siempre devolvió solo `{ ok, busy, full }`.

## User Setup Required
None.

## Next Phase Readiness
- **Plan 02-05:** el contrato `{ ok, busy, full }` está fijado; el test CUPOS-02 (no-leak) puede aseverar que la respuesta no expone el conteo por slot. La autoridad del count vive en el server; el client solo consume `full`.

## Self-Check: PASSED

- Files: 2/2 found (availability/route.ts, booking-client.tsx) + SUMMARY.md
- Commits: 2/2 found (b535199, 3cf08ec)
- Response shape verified: `Response.json({ ok: true, busy, full }, ...)` — no count/remaining/roster
- `npx tsc --noEmit` exit 0 (proyecto completo limpio)

---
*Phase: 02-cupos-grupales*
*Completed: 2026-06-27*
