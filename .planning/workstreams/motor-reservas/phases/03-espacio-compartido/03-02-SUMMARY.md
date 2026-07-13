---
phase: 03-espacio-compartido
plan: 02
subsystem: booking
tags: [availability, booking-core, multi-tenant, supabase, coupled-exclusion, read-path]

# Dependency graph
requires:
  - phase: 03-espacio-compartido
    plan: 01
    provides: "tablas spaces + agenda_spaces (RLS, sin read anon), book_slot_atomic extendido con advisory lock por espacio + EXISTS anti-solape (AUTORIDAD del write), tipos Space/AgendaSpace, rama slot_taken de espacio en booking-core, migración 042"
provides:
  - "disponibilidad acoplada bidireccional en /api/booking/availability: siblingBusy (turnos de agendas hermanas que comparten espacio) mergeado en busy, NUNCA en full (D-06)"
  - "re-check de espacio (UX, rechazo temprano slot_taken) en lib/booking-core.ts antes del RPC"
affects: [03-03-ui-espacios, 03-04-appointment_spaces-backstop, 03-05-test-CONC-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read-path acoplado: resolver agendas hermanas por espacio compartido (agenda_spaces .in(space_id).neq(professional_id)) con service-role y marcar siblingBusy → busy, sin cambiar la forma de la respuesta (D-06)"
    - "Re-check JS de espacio como rechazo temprano de UX, reusando los clashes ya traídos del re-check de bucket (cero queries extra de appointments)"

key-files:
  created: []
  modified:
    - app/api/booking/availability/route.ts
    - lib/booking-core.ts

key-decisions:
  - "siblingBusy va a busy, NUNCA a full: el bloqueo de espacio es un solape 1-a-la-vez (Pitfall 5); full queda reservado para count>=capacity del propio bucket"
  - "El bloqueo es independiente de la capacity de la agenda hermana (un espacio físico no se comparte como un cupo); por eso el re-check de espacio va aparte del taken && slotCapacity<=1"
  - "La respuesta de availability NO cambia de forma — sigue { ok, busy, full } (D-06): el público no infiere qué agenda hermana bloqueó ni cuántos espacios hay"
  - "El re-check JS de booking-core NO es la autoridad: la garantía atómica vive en el RPC del Plan 01; reusa slot_taken (no space_taken)"
  - "Bidireccionalidad cae sola de la simetría del set de espacios: consultar la F11 refleja las cruzadas y viceversa, sin código direccional extra"

patterns-established:
  - "Agenda sin filas en agenda_spaces → skip total (siblingBusy=[] / ninguna query de siblings): comportamiento cupos/individual byte-idéntico"
  - "agenda_spaces siempre filtrado por .eq('business_id', business.id): las agendas hermanas son del mismo tenant por construcción (un space de otro tenant no entra al set)"

requirements-completed: [ESPACIO-02]

# Metrics
duration: ~10min
completed: 2026-06-30
status: complete
---

# Phase 3 Plan 02: Disponibilidad acoplada (read-path) Summary

**Cierre del READ PATH de la exclusión acoplada por espacio compartido (ESPACIO-02): `/api/booking/availability` ahora refleja el bloqueo cruzado bidireccional — un slot aparece ocupado (`busy`) si una agenda hermana que comparte ≥1 espacio físico tiene un turno solapado — manteniendo D-06 (`{ ok, busy, full }` sin filtrar detalle interno), más un re-check de espacio (UX) en `booking-core` que rechaza temprano con `slot_taken` antes de entrar al RPC (cuya autoridad atómica del Plan 01 se preserva intacta).**

## Performance

- **Duration:** ~10 min
- **Tasks:** 2 (ambas de implementación)
- **Files modified:** 2 (0 creados, 2 modificados)

## Accomplishments

- **`app/api/booking/availability/route.ts`** — disponibilidad acoplada bidireccional. Tras resolver `bucket`, resuelve `mySpaces` (espacios de la agenda consultada) y `siblingBuckets` (agendas hermanas que comparten ≥1 espacio, vía `agenda_spaces .in('space_id', ...).neq('professional_id', bucket)`, todo con `.eq('business_id', business.id)`). Construye `siblingBusy` de los `appts` ya traídos del negocio (mismo descarte de holds vencidos que `live`) y lo concatena a `busy`. La respuesta NO cambia de forma: sigue `{ ok, busy, full }`.
- **`lib/booking-core.ts`** — re-check de espacio (UX) entre el `sameBucket` y el chequeo `taken`. Resuelve `mySpaces`/`siblings` con el mismo estilo de query y bucketización byte-idéntica (SENTINEL), marca `spaceClash` contra los `clashes` YA traídos (cero queries extra de appointments) y rechaza con `slot_taken` 409 si hay solape vivo en una agenda hermana. No altera el camino capacity-aware existente.

## Task Commits

1. **Task 1: availability — bloqueo acoplado bidireccional (siblingBusy → busy)** - `6ee0b36` (feat)
2. **Task 2: booking-core — re-check de espacio (UX) antes del RPC** - `b0c7e22` (feat)

## Files Created/Modified

- `app/api/booking/availability/route.ts` - resolución de `mySpaces`/`siblingBuckets` + `siblingBusy` mergeado en `busy` (44 inserciones)
- `lib/booking-core.ts` - re-check de espacio (UX) con `spaceClash` → `slot_taken` antes del RPC (33 inserciones)

## Decisions Made

- **siblingBusy → busy, nunca full:** el bloqueo de espacio es un solape 1-a-la-vez; el client lo trata como `conflict` (horario no disponible), igual que un slot individual ocupado. `full` queda reservado para "cupo lleno" (count>=capacity del propio bucket).
- **Independiente de la capacity de la agenda hermana:** un espacio físico no se comparte como un cupo (Pitfall 5). Una agenda hermana grupal parcial (1/N ocupado) igual bloquea el espacio por el camino de espacio, no por el de cupos.
- **D-06 (no-leak) preservado:** la respuesta sigue `{ ok, busy, full }`. Cada entrada de `siblingBusy` expone solo `time/status/expires_at/duration_minutes` — idéntico a una entrada normal de `busy`; el público no infiere qué agenda hermana bloqueó ni cuántos espacios hay. El re-check de `booking-core` devuelve el genérico `slot_taken` (no `space_taken`).
- **El re-check JS no es la autoridad:** la garantía atómica vive en el RPC del Plan 01 (advisory lock por espacio + EXISTS anti-solape). El re-check solo evita entrar al RPC para un rechazo más rápido y mejor UX.
- **Skip total sin espacios:** una agenda sin filas en `agenda_spaces` no agrega `siblingBusy` ni hace queries extra de siblings → comportamiento cupos/individual byte-idéntico.

## Deviations from Plan

### TDD (Task 1 marcada `tdd="true"`): tests de comportamiento sibling-blocking DIFERIDOS a Plan 03-05

**Encontrado durante:** arranque de Task 1 (gate MVP/TDD no activo: `tdd_mode=false` en config).

**Situación:** el `<behavior>` de Task 1 describe 5 tests de integración (bidireccional F11↔cruzadas, no-leak, sin-espacios, CUPOS-02). Los tres tests nuevos (Test 1, 2, 4 de sibling-blocking) requieren:
1. Las tablas `spaces`/`agenda_spaces` **en la DB destino de los tests** — que es el Supabase **DEV remoto** (`NEXT_PUBLIC_SUPABASE_URL` es remoto), donde la migración 042 **NO está aplicada** (el SUMMARY de 03-01 documenta que 042 se validó SOLO en local PG17 y el deploy a prod/dev es a mano). Verificado en vivo: `spaces`/`agenda_spaces` devuelven `Could not find the table` contra el DEV remoto.
2. Las fixtures `seedSpace` / `seedAgendaSpace`, que **el propio ROADMAP/Plan asigna a 03-05** ("[P05] fixtures seedSpace/seedAgendaSpace + CONC-03") y todavía no existen en `test/helpers/booking-fixtures.ts`.

**Decisión:** NO escribir tests RED que no pueden pasar en este wave (romperían la suite de forma permanente y referenciarían fixtures inexistentes). Se respetó el contrato runnable que el propio plan codifica en los `<verify>` de ambas tareas: **cero-regresión sobre las suites existentes** — CUPOS-02 (no-leak, `concurrency.test.ts`) y `booking-core.test.ts` verdes, más `npx tsc --noEmit`. La validación funcional bidireccional del sibling-blocking se ejercita en **Plan 03-05** (CONC-03), que construye las fixtures y corre contra la DB con 042 aplicada.

**Mitigación de la brecha de cobertura:** el código nuevo es defensivo ante la ausencia de las tablas — `if (mySpaces && mySpaces.length > 0)` hace skip si la query de `agenda_spaces` falla o no devuelve filas, por lo que CUPOS-02 (que corre sin espacios) confirma el camino de skip total y el contrato `{ ok, busy, full }` intacto. La autoridad del write (RPC) ya está testeada por el camino del Plan 01.

**Archivos:** ninguno extra; sin tests nuevos en este wave.
**Commits:** los de tarea (6ee0b36, b0c7e22).

## Issues Encountered

None. Ambas suites de verificación (`concurrency.test.ts` 4/4, `booking-core.test.ts` 5/5) y la suite completa (301/301) verdes; `tsc --noEmit` limpio.

## Known Stubs

None. No hay valores hardcodeados ni placeholders; el camino sin-espacios es intencional (skip total) y queda documentado.

## Next Phase Readiness

- **Plan 03-03** (UI alta de espacios + mapeo en settings + terminología resource) puede construirse: el read-path y el re-check ya consumen `agenda_spaces`, falta la UI que las puebla.
- **Plan 03-04** (backstop `appointment_spaces` EXCLUDE gist + trigger) es ortogonal a este plan (es el cinturón-y-tiradores del write).
- **Plan 03-05** (fixtures `seedSpace`/`seedAgendaSpace` + CONC-03) es el que CIERRA la cobertura de los tests de comportamiento sibling-blocking diferidos acá (ver Deviations).
- **Blocker de prod (heredado de 03-01):** la migración 042 debe aplicarse a mano a DEV remoto + prod + `NOTIFY pgrst` antes de que estos caminos de `agenda_spaces` tengan efecto en esos entornos (hoy hacen skip si la tabla no existe).

## Self-Check: PASSED

Ambos archivos modificados existen en disco y los 2 commits de tarea (6ee0b36, b0c7e22) están en el historial. Greps de verificación confirman: `agenda_spaces` filtrado por `business_id` en ambos archivos, `siblingBusy` mergeado en `busy` (no `full`), `spaceClash` → `slot_taken`, y la respuesta de availability conserva `{ ok, busy, full }`.

---
*Phase: 03-espacio-compartido*
*Completed: 2026-06-30*
