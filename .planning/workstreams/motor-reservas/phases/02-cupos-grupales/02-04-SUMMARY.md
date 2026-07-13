---
phase: 02-cupos-grupales
plan: 04
subsystem: ui
tags: [react, nextjs, time_blocks, capacity, roster, dialog, vaul, drawer, tailwind, multi-tenant]

# Dependency graph
requires:
  - phase: 02-01
    provides: "migración 041 — time_blocks.capacity (NOT NULL DEFAULT 1, CHECK >= 1) + appointments.seat/is_group"
  - phase: 02-02
    provides: "lib/types.ts — TimeBlock.capacity + Appointment.seat/is_group"
  - phase: 02-03
    provides: "availability capacity-aware (count por slot vs capacity, full/busy sin exponer lugares restantes)"
provides:
  - "Campo 'Cupo' (capacity) por bloque en el editor de horarios de agenda-client.tsx (CUPOS-01, D-01)"
  - "Persistencia de capacity en saveHours (delete-all + insert de time_blocks)"
  - "Roster del admin: overlay Dialog (desktop) / Drawer vaul (mobile) con contador N/cupo + lista (nombre, contacto, estado)"
  - "page.tsx select de appointments con client_phone/client_email (por business_id)"
affects: [cupos-grupales, motor-reservas, agenda, roster, espacio-compartido]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shell responsive Dialog/Drawer vía useMediaQuery + useSyncExternalStore (espejado de NuevoTurnoForm)"
    - "capacityFor(date, time) en el client: getUTCDay + ventana [start,end), MAX capacity (mismo criterio que availability/RPC)"
    - "Celda interactiva con hijos-botón: contenedor <div> + header-botón en vez de <button> anidando botones (HTML válido / a11y)"

key-files:
  created: []
  modified:
    - "app/(dashboard)/agenda/agenda-client.tsx"
    - "app/(dashboard)/agenda/page.tsx"

key-decisions:
  - "El campo cupo vive en el editor REAL de time_blocks (agenda-client.tsx), no en settings-client.tsx (corrección de PATTERNS sobre canonical_refs)."
  - "Sin dependencias nuevas para el overlay: se reusan dialog (shadcn) + drawer (vaul) ya instalados (D-04)."
  - "Solo los slots grupales (capacity > 1) abren el roster; los individuales quedan idénticos al comportamiento actual."
  - "La celda de día pasó de <button> a <div> + header-botón para no anidar los chips-botón del roster dentro de un botón (HTML inválido / a11y rota)."

patterns-established:
  - "Pattern 1: overlay responsive Dialog/Drawer compartiendo un body común y estado (rosterSlot !== null), useMediaQuery('(min-width: 768px)')."
  - "Pattern 2: contador/roster computados en memoria sobre initialAppointments (ya filtrado por business_id en el server) — sin queries extra cross-tenant."

requirements-completed: [CUPOS-01, CUPOS-04]

# Metrics
duration: ~3 días (cal.) · trabajo efectivo ~45 min con 3 iteraciones de hover por feedback del usuario
completed: 2026-06-29
status: complete
---

# Phase 2 Plan 04: UI — Campo cupo + Roster del admin Summary

**Campo "Cupo" (capacity) por bloque en el editor de horarios de la agenda y roster del admin (overlay Dialog desktop / Drawer mobile con contador N/cupo + lista nombre·contacto·estado), reusando dialog/drawer ya instalados y sin tocar el aislamiento por tenant.**

## Performance

- **Duration:** ~45 min de trabajo efectivo (3 iteraciones de hover por feedback visual del usuario)
- **Started:** 2026-06-27T12:12:04-03:00
- **Completed:** 2026-06-29T14:49:26-03:00
- **Tasks:** 2 de código + 1 checkpoint humano (PASS)
- **Files modified:** 2

## Accomplishments
- Campo "Cupo" (`<Input type="number" min={1}>`, default 1) por bloque en la grilla de `agenda-client.tsx`, persistido en `saveHours` (delete-all + insert de `time_blocks`) — CUPOS-01, D-01.
- Roster del admin: click en un slot grupal (capacity > 1) abre un overlay con contador "ocupados/cupo" + lista de inscriptos (nombre, contacto, estado confirmado/seña pendiente) — CUPOS-04, D-04.
- Overlay responsive Dialog (desktop ≥768px) / Drawer vaul (mobile) espejando el shell de `NuevoTurnoForm`, sin dependencias nuevas.
- `page.tsx` sumó `client_phone, client_email` al select de appointments, conservando `.eq('business_id', business.id)`.

## Task Commits

1. **Task 1: Campo "cupo" (capacity) por bloque + persistencia** - `ba8efdc` (feat)
2. **Task 2: Roster del admin — overlay contador N/cupo + inscriptos** - `6a2871f` (feat)
3. **Iteraciones de hover de la celda de día (post-checkpoint, por feedback del usuario):**
   - `48eb250` (style) — hover sutil al pasar de `<button>` a `<div>`
   - `ba85c1e` (style) — hover más oscuro (header `bg-secondary` opaco)
   - `f87a13b` (style) — ~15% más oscuro final (celda `/85`, header `brightness-[0.85]`)

**Plan metadata:** `.planning/` está gitignored → SUMMARY/STATE/ROADMAP persisten en disco, no se commitean (esperado).

## Files Created/Modified
- `app/(dashboard)/agenda/agenda-client.tsx` - Campo "Cupo" por bloque (LocalBlock/defaultBlock/mapeo/addBlock/applyCopyDay/toInsert ganan `capacity`); `updateBlock` acepta `value: string | number`; roster overlay (estado `rosterSlot`, `capacityFor`, `roster` memo, helper `useMediaQuery`, `statusLabel`, Dialog/Drawer); celda de día reestructurada a `<div>` + header-botón; hover de la celda/header.
- `app/(dashboard)/agenda/page.tsx` - Select de appointments con `client_phone, client_email` para el roster, filtro `business_id` intacto.

## Decisions Made
- **Editor real de time_blocks** = `agenda-client.tsx` (no `settings-client.tsx`): corrección de PATTERNS sobre los canonical_refs, confirmada leyendo ambos archivos.
- **Sin deps nuevas** (D-04): el overlay reusa `@/components/ui/dialog` + `@/components/ui/drawer` (vaul) ya presentes.
- **Slot grupal = capacity > 1**: solo esos chips abren el roster; los individuales no cambian.
- **Hover en el theme Bauhaus dark**: `--secondary` y `--muted` son el mismo tono y `--accent` es brillante, así que para oscurecer el header no alcanza con cambiar token ni subir opacidad sobre un fondo opaco → se usó `hover:brightness-[0.85]` (15% más oscuro). La transición se acotó a `background-color`/`filter` (sin animar layout).

## Deviations from Plan

### Cambio de interacción aprobado por el usuario

**1. Celda de día `<button>` → `<div>` + header-botón**
- **Found during:** Task 2 (roster)
- **Issue:** Los chips del roster deben ser botones clickeables; anidarlos dentro del `<button>` de la celda es HTML inválido y rompe la a11y (interactive content anidado).
- **Fix:** La celda pasó a `<div>` contenedor; el "Nuevo turno" quedó en un header-botón propio; los chips de slots grupales son botones que abren el roster. Comportamiento "click para agregar turno" preservado en el header.
- **Files modified:** `app/(dashboard)/agenda/agenda-client.tsx`
- **Verification:** tsc + eslint limpios; UAT visual humano PASS; el usuario aprobó explícitamente el cambio de interacción y pidió reforzar el hover (3 iteraciones hasta el visto bueno).
- **Committed in:** `6a2871f` (cambio estructural) + `48eb250`/`ba85c1e`/`f87a13b` (hover)

---

**Total deviations:** 1 cambio estructural necesario para a11y/HTML válido (aprobado por el usuario).
**Impact on plan:** Sin scope creep. El campo cupo y el roster se entregaron como en el plan; el único cambio fuera del texto literal fue la reestructura de la celda, requerida por la a11y del propio roster.

## Issues Encountered
- Durante el UAT visual aparecieron 2 bugs en `app/api/booking/availability/route.ts` (slot grupal no reservable / slot lleno seguía visible). Pertenecen a **Plan 02-03** y fueron corregidos fuera de este plan (commits `acb725c`, `231c1e3`); no son parte de 02-04.

## User Setup Required
None - sin configuración de servicios externos. La migración 041 (capacity) ya está en el Supabase local; el UAT se corrió contra local.

## Next Phase Readiness
- CUPOS-01 (cupo por bloque) y CUPOS-04 (roster del admin) completos y verificados visualmente (desktop + mobile, hover, focus).
- Falta en la fase: 02-05 (pendiente). El motor anti-sobrecupo (CUPOS-03/CONC-*) vive en el core de booking, no en este plan de UI.

## Self-Check: PASSED

- Files: `agenda-client.tsx`, `page.tsx`, `02-04-SUMMARY.md` — all FOUND.
- Commits: `ba8efdc`, `6a2871f`, `48eb250`, `ba85c1e`, `f87a13b` — all FOUND.
- tsc + eslint clean; UAT visual humano PASS (campo cupo persiste, roster desktop+mobile, hover, focus) contra Supabase local.

---
*Phase: 02-cupos-grupales*
*Completed: 2026-06-29*
