---
phase: 12-cupo-por-solape-recurso-simult-neo
plan: 02
subsystem: booking
tags: [typescript, nextjs, supabase, service-role, multi-tenant, availability, react]

# Dependency graph
requires:
  - phase: 12-01
    provides: "services.capacity_mode/capacity (migr. 062) + book_slot_atomic mode-aware (gate por solape, lock service-day) + public_services.capacity_mode + Service.capacity_mode/capacity en lib/types.ts"
  - phase: 09-asignaci-n-autom-tica-at-mica-de-profesional
    provides: "flag autoAssign en createAppointmentCore + selección 'cualquiera' dentro del RPC"
  - phase: 10-cualquiera-p-blico
    provides: "rama `any` de /api/booking/availability (molde overlap-aware) + gating showAny/isAny en booking-client"
provides:
  - "booking-core: SELECT del service con capacity_mode/capacity + early-return de solape gateado por modo (el recurso simultáneo ya no se corta en el 2º turno)"
  - "/api/booking/availability: rama overlap-aware para simultaneous_resource (full por solape del mismo service_id, busy:[])"
  - "booking-client: 'Cualquiera' oculta en simultáneo (D-13) + serviceId en la rama específica de availability"
affects: [12-03 UI del panel (editor de servicio + roster), 12-04 tests de carrera CUPO-04, secure-phase 12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read-path que espeja el gate del RPC colapsado a booleano-por-slot (no-leak de lugares restantes)"
    - "Rama de runtime gateada por capacity_mode con fallback al camino histórico (cero regresión por construcción)"

key-files:
  created: []
  modified:
    - lib/booking-core.ts
    - app/api/booking/availability/route.ts
    - app/[slug]/booking-client.tsx

key-decisions:
  - "El conteo por solape del read-path NO bucketea por profesional: espeja el gate del RPC (business_id + service_id + date), que es el carril del SERVICIO (D-03/D-04)"
  - "En la rama simultánea `busy` va SIEMPRE vacío: el client trata cada entrada de `busy` como conflicto por solapamiento, así que mandar los solapes legales ahí borraría el 2º lugar del recurso"
  - "La re-validación del serviceId por business_id devuelve invalid_service (400) si no resuelve (T-12-09), aunque sea un read: el endpoint corre con service-role"
  - "El gate del early-return de booking-core se expresa como `taken && slotCapacity <= 1 && !isSimultaneousResource` — una sola condición extra, para que group_class quede byte-idéntico"

patterns-established:
  - "Rama nueva de runtime que retorna temprano y deja el camino histórico intacto debajo (mismo molde que la rama `any` de Phase 10)"

requirements-completed: [CUPO-02, CUPO-05]

# Metrics
duration: 12min
completed: 2026-07-29
status: complete
---

# Phase 12 Plan 02: Camino de reserva pública mode-aware Summary

**El recurso simultáneo funciona end-to-end en runtime: el re-check JS de `booking-core` deja de cortar el 2º turno solapado (la autoridad pasa a ser el RPC), el grid público marca "lleno" por SOLAPE del mismo `service_id` sin filtrar lugares restantes, y el selector público oculta "Cualquiera" para servicios simultáneos.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-29T13:14:00-03
- **Completed:** 2026-07-29T13:26:00-03
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- **LANDMINE cerrado (CUPO-02).** `lib/booking-core.ts` traía la duración del servicio pero no su modo: el early-return `taken && slotCapacity <= 1 → slot_taken` disparaba en el 2º turno solapado de un recurso simultáneo (cuyo `time_block` tiene capacity 1), así que el recurso **nunca se llenaba**. El `SELECT` ahora trae `capacity_mode`/`capacity` (re-validados por `business_id`) y el rechazo temprano se gatea por modo — exactamente como el grupal ya se exceptúa. En simultáneo decide el RPC (advisory lock service-day + count por solape → `slot_full`).
- **Read-path overlap-aware (D-12).** `/api/booking/availability` gana una rama gateada por `serviceId` + `capacity_mode`: enumera los start-times de la grilla a paso = duración y marca `full` cuando el intervalo ya tiene `capacity` turnos VIVOS del mismo `service_id` que lo solapan. Espeja el conjunto exacto del gate del RPC (`062:309-322`: `business_id + service_id + date` + estados que ocupan), sin bucketear por profesional.
- **No-leak preservado (D-06/D-12).** La ocupación colapsa a booleano-por-slot en `full`; jamás viajan counts, lugares restantes ni `capacity` (que sigue server-side, fuera de `public_services`). `busy` va vacío en esa rama a propósito.
- **Anti-tampering (T-12-09).** El `serviceId` que llega del browser se re-valida por `business_id` con el service-role antes de usarse; un service ajeno devuelve `invalid_service` (400).
- **"Cualquiera" gateada (D-13).** `showAny` se fuerza a `false` para `simultaneous_resource`: la asignación automática del RPC no es capacity-aware (marca ocupado a quien tenga cualquier solape) y no sabría usar la 2ª camilla. Combo diferido a v2.
- **Cero regresión (CUPO-05).** `group_class` (default de toda fila existente), cupo 1 y canchas quedan idénticos: `canchas-booking-client.tsx` NO se tocó y nunca manda `serviceId`, así que ni entra a la rama nueva. Suites del motor verdes: `concurrency`, `booking-core`, `canchas-booking`, `staff-assignment`, `booking-cualquiera-public` → 27/27.

## Task Commits

1. **Task 1: booking-core.ts — SELECT con capacity_mode + early-return de solape mode-aware (LANDMINE)** — `52fbc87` (feat)
2. **Task 2: availability/route.ts — rama específica overlap-aware para simultaneous_resource (D-12)** — `d3d9106` (feat)
3. **Task 3: booking-client.tsx — ocultar "Cualquiera" en simultáneo (D-13) + mandar serviceId** — `8d8a821` (feat)

## Files Created/Modified

- `lib/booking-core.ts` — `.select('id, name, active, duration_minutes, location_id, capacity_mode, capacity')` y `const isSimultaneousResource = service.capacity_mode === 'simultaneous_resource'` sumado como tercera condición del early-return (`taken && slotCapacity <= 1 && !isSimultaneousResource`). El re-check de ESPACIO compartido, la liberación de holds y el mapeo de errores del RPC quedaron intactos.
- `app/api/booking/availability/route.ts` — `service_id` agregado al `select` de `appointments` (aditivo, nunca se serializa) + rama nueva antes del bucketing específico: lee `duration_minutes, capacity_mode, capacity` del service re-validado por `business_id`, y si el modo es simultáneo calcula `full` por solape y retorna `{ ok: true, busy: [], full }` con `Cache-Control: no-store`. `group_class` sigue de largo al camino de siempre.
- `app/[slug]/booking-client.tsx` — `isSimultaneousResource` derivado de `selectedService?.capacity_mode`; `showAny = capaces.length >= 2 && !isSimultaneousResource`; `params.set('serviceId', ...)` en la rama específica cuando el servicio es simultáneo.

## Decisions Made

- **El conteo del read-path NO bucketea por profesional.** El gate del RPC (062) cuenta `business_id + service_id + date` sin `professional_id`, así que el grid tiene que mirar el mismo conjunto o divergiría (mostraría libre lo que el RPC rechaza, o al revés).
- **`busy: []` en la rama simultánea (no es un descuido).** El client aplica cada entrada de `busy` como conflicto por solapamiento; los solapes del propio servicio son LEGALES hasta el cupo. Consecuencia asumida y consistente con D-04 (carriles independientes): en simultáneo el grid no bloquea por otros servicios de la misma agenda ni por espacio compartido — el RPC sigue siendo el backstop (`slot_taken`/`slot_full`).
- **Divergencia de buffer documentada en el código:** el read-path usa `[inicio-buffer, fin+buffer)` (UX) y el RPC `tsrange &&` sin buffer. Mismo caveat que ya tenía la rama `any`; la autoridad es el RPC.
- **Caveat de horarios especiales:** la grilla se enumera desde `time_blocks` (como la rama `any`), así que un horario especial que EXTIENDE el día no se evalúa acá — respaldado por el RPC. Anotado en el comentario.
- **Los `serviceId` se mandan solo en simultáneo** (no para todos los servicios): mantiene la request del camino group_class byte-idéntica y evita estrenar la validación 400 en rutas que hoy no la tienen.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `appointments.service_id` faltaba en el `select` del endpoint**
- **Found during:** Task 2
- **Issue:** el plan pedía contar los turnos solapados "del MISMO `service_id`", pero el `select` de `appointments` (línea 48) no traía esa columna — el filtro habría sido siempre falso y `full` habría quedado vacío (el grid ofrecería horarios llenos).
- **Fix:** agregar `service_id` al `.select(...)`. Es aditivo y NO se serializa en la respuesta (el mapeo de `busy` sigue exponiendo solo `time/status/expires_at/duration_minutes`), así que el contrato público y el no-leak no cambian.
- **Files modified:** `app/api/booking/availability/route.ts`
- **Verification:** `./node_modules/.bin/tsc --noEmit` limpio + suites del motor verdes.
- **Committed in:** `d3d9106` (commit de Task 2)

**2. [Rule 3 - Blocking] Verificación con el binario local de TypeScript, no con `npx tsc`**
- **Found during:** Tasks 1-3
- **Issue:** los bloques `<automated>` del plan escriben `npx tsc --noEmit`; en este proyecto eso puede resolver el paquete `tsc@2.0.4` del registry (que NO es el compilador y siempre sale 0). Trampa ya documentada del entorno y repetida del Plan 12-01.
- **Fix:** se ejecutó `./node_modules/.bin/tsc --noEmit` en las 3 tasks.
- **Files modified:** ninguno
- **Verification:** salida real y limpia en cada task.
- **Committed in:** n/a (cambio de procedimiento de verificación)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** ninguna sobre el alcance — los 3 artefactos son exactamente los del plan. Sin scope creep.

## Issues Encountered

- **`test/abono-create.test.ts` y `test/abono-generation.test.ts` fallan 2 tests en la corrida COMPLETA (`npm run test`: 2 failed | 774 passed | 1 skipped) y pasan 24/24 corridos en aislamiento.** Es la flakiness pre-existente por carga/paralelismo contra la DB local que el Plan 12-01 ya verificó A/B (restaurando la función de la 058 fallan los mismos tests). Ajena a esta fase y a estos 3 archivos — no se tocó (fuera de scope).
- **Hook de diseño (`impeccable`) reportó 2 hallazgos `side-tab` en `app/[slug]/booking-client.tsx` (L621/L749).** Son tarjetas preexistentes del selector, muy lejos de las líneas editadas (L117-134 y L254-264) y fuera del alcance del plan (cero regresión visual). Se dejan sin cambiar y SIN suprimir, para que un pase de diseño futuro las siga viendo.

## Known Stubs

Ninguno. Los 3 artefactos quedan funcionales end-to-end; lo que falta de la fase (editor de servicio en el panel para SETEAR el modo, roster del admin, tests de carrera) es alcance explícito de los planes 12-03 y 12-04.

## Threat Flags

Ninguna superficie nueva fuera del `<threat_model>` del plan: no se agregaron endpoints, rutas de auth ni columnas. El único parámetro nuevo aceptado (`serviceId` en la rama específica de availability) está cubierto por T-12-09 y se re-valida por `business_id`.

## User Setup Required

Ninguna. La migración 062 (Plan 12-01) sigue siendo el único paso manual pendiente en prod; este plan es solo código de app.

## Next Phase Readiness

- **12-03 (UI del panel):** falta el segmented control "Clase grupal / Recurso simultáneo" + el campo de cupo N en el editor de servicio (D-09) y el roster con aviso "lleno" (D-11). Sin eso, el modo solo se puede setear por SQL — el runtime ya lo respeta.
- **12-04 (tests):** el fixture debe setear `capacity_mode='simultaneous_resource'` + `capacity` sobre el service sembrado. Además del test de carrera CUPO-04, conviene cubrir el LANDMINE de este plan: 2ª reserva ESCALONADA en simultáneo cap 2 debe volver `ok` (antes volvía `slot_taken` desde el JS, sin llegar al RPC).
- **secure-phase 12:** T-12-08..T-12-12 quedan verificables sobre estos 3 archivos.

## Self-Check: PASSED

- `lib/booking-core.ts` — existe y contiene `capacity_mode` / `simultaneous_resource`
- `app/api/booking/availability/route.ts` — existe y contiene `capacity_mode` / `simultaneous_resource`
- `app/[slug]/booking-client.tsx` — existe y contiene `capacity_mode` / `simultaneous_resource`
- Commits `52fbc87`, `d3d9106`, `8d8a821` — presentes en el historial
- `./node_modules/.bin/tsc --noEmit` — limpio
- Suites del motor (`concurrency`, `booking-core`, `canchas-booking`, `staff-assignment`, `booking-cualquiera-public`) — 27/27 verdes

---
*Phase: 12-cupo-por-solape-recurso-simult-neo*
*Completed: 2026-07-29*
