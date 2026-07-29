---
phase: 12-cupo-por-solape-recurso-simult-neo
plan: 03
subsystem: dashboard
tags: [typescript, nextjs, react, supabase, rls, multi-tenant, ui, agenda, settings]

# Dependency graph
requires:
  - phase: 12-01
    provides: "services.capacity_mode/capacity (migr. 062) + Service.capacity_mode/capacity en lib/types.ts"
  - phase: 12-02
    provides: "runtime mode-aware (booking-core + availability + booking-client) que respeta el modo que este plan permite SETEAR"
provides:
  - "settings-client: componente CapacityModeFields (segmented control 'Clase grupal / Recurso simultáneo' + microcopy fija + campo de cupo N solo en simultáneo), reusado en alta y edición de servicio, con persistencia por browser client + RLS + business_id"
  - "agenda-client: overlapFullById — ocupación por SOLAPE del mismo service_id + badge 'N/N lleno' en la fila del turno para servicios simultáneos (D-11)"
  - "agenda/page.tsx: service_id en el select de appointments (habilita resolver capacity_mode por turno)"
affects: [12-04 tests de carrera CUPO-04, secure-phase 12, UAT visual de la fase]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Componente de campos compartido entre el form inline de alta y el Dialog de edición (una sola fuente de copy/estilo para las dos superficies)"
    - "Cómputo de ocupación por intersección de intervalos en memoria, espejando el conjunto que gatea el RPC (business_id + service_id + date + estados que ocupan)"

key-files:
  created: []
  modified:
    - app/(dashboard)/settings/settings-client.tsx
    - app/(dashboard)/agenda/agenda-client.tsx
    - app/(dashboard)/agenda/page.tsx

key-decisions:
  - "El campo de cupo N NO se muestra en 'Clase grupal': ahí el cupo vive en time_blocks.capacity (la grilla de la agenda), así que mostrarlo mentiría sobre de dónde sale el número"
  - "En group_class el insert/update escribe capacity = 1 (no el valor tipeado), para que la columna no quede con un número que nadie lee"
  - "Labels y microcopy FIJOS para todos los verticales (D-10): CapacityModeFields NO se rutea por lib/use-terminology"
  - "Un servicio simultáneo NO abre el roster grupal del slot: isGroup se calcula como `!isSimultaneous && capacityFor(...) > 1` — el contador 8/15 por franja no aplica a horarios escalonados (D-11)"
  - "La ocupación por solape se cuenta sin buffer y con COALESCE de duración a 30, igual que el gate del RPC 062 — el read del admin no puede divergir del motor"

patterns-established:
  - "Aviso 'lleno' por-turno (badge en la fila) como alternativa al contador por-franja cuando el modelo de cupo es por solape y no por hora de inicio"

requirements-completed: [CUPO-01]

# Metrics
duration: 12min
completed: 2026-07-29
status: complete
---

# Phase 12 Plan 03: UI del panel para el modo de cupo Summary

**El dueño ya puede declarar desde /servicios si un servicio es una clase grupal o un recurso simultáneo (con su cupo N), y la agenda del admin distingue los dos modelos: badge "2/2 lleno" por solape en el recurso, contador "8/15" por franja intacto en el grupal.**

## Performance

- **Duration:** ~12 min (13:26 → 13:38, incluyendo la reanudación post-checkpoint)
- **Tasks:** 3 (2 de código + 1 checkpoint)
- **Files modified:** 3

## Accomplishments

- **Editor de servicio con modo de cupo (CUPO-01, D-09/D-10).** `CapacityModeFields` es un `role="radiogroup"` con dos píldoras — "Clase grupal" / "Recurso simultáneo" — moldeado sobre el segmented control de "Preselección del profesional" (misma píldora activa `bg-primary`, mismo contenedor bordeado), con touch target `min-h-11` y `focus-visible:ring`. Debajo va microcopy fija que explica la diferencia en términos del dueño ("todos empiezan a la misma hora y comparten el cupo del horario" vs. "los turnos arrancan escalonados y se superponen, porque atendés varios a la vez"). El componente se reusa tal cual en el form inline de alta y en el `Dialog` de edición, así que las dos superficies no se pueden desincronizar.
- **Campo de cupo N condicional.** "Cuántos a la vez" (`Input type="number"`, `min=1`, `step=1`, `onFocus → select()`) aparece **solo** en modo simultáneo. En clase grupal no se muestra a propósito: ese cupo vive en `time_blocks.capacity` (la grilla de la agenda), no en el servicio.
- **Persistencia por tenant.** `newService` y `editSvcForm` llevan `capacity_mode` (default `'group_class'`, espejo del default de la DB) y `capacity` (default 1); `addService` inserta y `saveEditService` actualiza con `.eq('business_id', business.id)` por **browser client + RLS** (nunca service-role en el panel, skill supabase-multitenant-rls). `normalizeCapacity` fuerza entero `>= 1` — mismo invariante que el CHECK de la 062. `openEditService` rellena modo y cupo desde el service, así que al reabrir vuelve lo guardado.
- **Agenda mode-aware (D-11).** `overlapFullById` agrupa los turnos VIVOS por carril `service_id|date` (solo servicios `simultaneous_resource`) y, por turno, cuenta cuántos del mismo carril **intersectan** su intervalo `[inicio, inicio+duración)`. Cuando el conteo alcanza `capacity`, la fila del turno gana un `Badge` "N/N lleno" (`tabular-nums`, tono warning, con `title` explicativo). Es el **mismo conjunto** que gatea el RPC de la 062 (`business_id + service_id + date` + estados que ocupan), sin buffer y con duración `?? 30` como el `COALESCE` del motor.
- **Cero regresión del grupal.** `isGroup` pasó a `!isSimultaneous && capacityFor(ds, a.time) > 1`: un servicio simultáneo deja de abrir el roster del slot (su contador "8/15" por franja no significa nada con horarios escalonados), y para `group_class` / cupo 1 el mapa `overlapFullById` queda **vacío** por construcción — el roster y el contador quedan idénticos.
- **Read-path habilitado.** `agenda/page.tsx` suma `service_id` al `select` de `appointments` (el join `services(name)` solo traía el nombre). Es aditivo y el set ya venía filtrado por `business_id`.

## Task Commits

1. **Task 1: settings-client.tsx — segmented control de modo + campo de cupo N en alta y edición** — `66e90c1` (feat)
2. **Task 2: agenda-client.tsx — indicador "lleno" por solape para servicios simultáneos (D-11)** — `67920a9` (feat)
3. **Task 3: checkpoint de verificación visual** — sin código; cerrado con verificación automatizada (ver abajo) y **UAT visual auto-aprobada / pendiente**. Queda registrado en el commit de docs de este plan.

## Files Created/Modified

- `app/(dashboard)/settings/settings-client.tsx` — `type CapacityMode`, `normalizeCapacity()`, componente `CapacityModeFields`; `capacity_mode`/`capacity` sumados a los state shapes `newService` y `editSvcForm`, a `openEditService`, y al payload de `addService` (insert) y `saveEditService` (update `.eq('business_id', ...)`). El CRUD de nombre/minutos/precio/consultorios no se tocó.
- `app/(dashboard)/agenda/agenda-client.tsx` — `service_id` en `AgendaAppt`; `serviceById` (index en memoria) y `overlapFullById` (ocupación por intersección de intervalos por carril `service_id|date`); `isGroup` gateado por `!isSimultaneous`; `Badge` "N/N lleno" en el cuerpo del chip del turno.
- `app/(dashboard)/agenda/page.tsx` — `service_id` agregado al `.select(...)` de `appointments`.

## Verificación automatizada (re-corrida en esta sesión)

Números propios de esta corrida, no heredados del ejecutor anterior:

- `./node_modules/.bin/tsc --noEmit` → **exit 0, limpio**.
- Suites del motor (`test/concurrency.test.ts`, `test/booking-core.test.ts`, `test/canchas-booking.test.ts`, `test/staff-assignment.test.ts`) → **4 archivos / 22 tests, 22 passed** (vitest 4.1.9, 4.54s).
- Nota de entorno: se usó **`./node_modules/.bin/tsc`**, no `npx tsc` (los bloques `<automated>` del plan escriben `npx tsc --noEmit`, que en este proyecto resuelve `tsc@2.0.4` del registry y siempre sale 0 — trampa ya documentada y repetida de los planes 12-01/12-02).
- El dev server que el ejecutor anterior había dejado escuchando en el **puerto 3000** (PID 7224, `node.exe`) fue **terminado**; el puerto quedó libre (`netstat` sin listener).

## Pendiente de UAT visual

**Task 3 era un `checkpoint:human-verify` con gate `blocking`. Fue AUTO-APROBADA por el orquestador** porque el proyecto tiene `workflow.auto_advance = true`. **Ningún humano ejercitó el editor ni la agenda en un navegador.** Las 4 acceptance criteria de comportamiento del checkpoint (segmented control + microcopy, campo de cupo condicional, persistencia al reabrir, badge "lleno" y cero regresión del grupal) están respaldadas por lectura de código, `tsc` y las suites del motor — **no por observación visual**.

Los 5 pasos manuales siguen **OUTSTANDING**. Copiados textuales del `<how-to-verify>` del plan (requieren Supabase LOCAL con la migración 062 aplicada por el Plan 12-01 y `npm run dev`; login local `test@forjo.local` / `Forjo1234!`):

1. Ir a /servicios, editar un servicio: aparece el segmented control "Clase grupal / Recurso simultáneo" + microcopy; al elegir "Recurso simultáneo" aparece el campo de cupo. Poner cupo 2, guardar.
2. Reabrir ese servicio: el modo "Recurso simultáneo" y el cupo 2 siguen seleccionados (CUPO-01 persistencia).
3. Editar un servicio dejándolo "Clase grupal": el campo de cupo NO aparece; el editor funciona como antes.
4. En la agenda, cargar 2 turnos escalonados que se pisen sobre el servicio simultáneo cupo 2 (ej. 16:00 y 16:15): se ven como filas individuales y, al alcanzar el cupo en el intervalo solapado, aparece el indicador "lleno" (ej. "2/2 camillas") — NO un contador "8/15".
5. Verificar que una clase grupal existente sigue mostrando su roster/contador "8/15" sin cambios.

Si alguno falla, el desvío (paso, esperado, observado) se cierra en un plan de gap propio — no reabriendo este plan.

**Desvío de copy a chequear en el paso 4:** el plan ejemplificaba el indicador como "2/2 camillas". Lo implementado dice **"2/2 lleno"** (con el detalle "2 de 2 a la vez" en el `title`), porque "camillas" es terminología de un rubro y D-10 manda labels fijos para todos los verticales. Es una decisión consciente, pero es exactamente el tipo de cosa que la UAT visual tiene que ratificar.

## Decisions Made

- **El campo de cupo no existe en modo grupal.** Mostrarlo sugeriría que el número sale del servicio, cuando en el grupal sale del bloque de agenda (`time_blocks.capacity`). Además, en `group_class` el insert/update escribe `capacity = 1` en vez del valor tipeado, para no dejar en la columna un número que ningún camino lee.
- **Labels y microcopy fijos (D-10).** `CapacityModeFields` no consulta `lib/use-terminology`: "Clase grupal" y "Recurso simultáneo" son iguales en salud, belleza, general y canchas.
- **El servicio simultáneo no abre el roster del slot.** El roster agrupa por `(date, time)` exacto; con turnos escalonados eso mostraría "1/1" en cada horario y escondería el solape real. Por eso el aviso es **por turno** (badge en la fila) y no por franja (D-11).
- **El conteo del admin espeja el gate del RPC.** Mismo conjunto (`business_id + service_id + date` + estados que ocupan), mismo criterio de intersección, sin buffer y con `duration ?? 30`. Un criterio distinto haría que la agenda dijera "lleno" donde el motor todavía acepta, o al revés.
- **Cómputo en memoria, no query nueva.** `initialAppointments` ya llega filtrado por `business_id` desde el server component; el único cambio en el read-path es la columna `service_id`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `appointments.service_id` faltaba en el read-path de la agenda**
- **Found during:** Task 2
- **Issue:** el plan pedía resolver `capacity_mode`/`capacity` por turno, pero el `select` de `agenda/page.tsx` solo traía `services(name)` — sin `service_id` no había forma de mapear el turno a su servicio y el mapa de ocupación habría quedado siempre vacío.
- **Fix:** `service_id` sumado al `.select(...)`. Aditivo, dato del propio tenant (el set ya viene con `.eq('business_id', ...)`), superficie de admin autenticada.
- **Files modified:** `app/(dashboard)/agenda/page.tsx`
- **Commit:** `67920a9`

**2. [Rule 3 - Blocking] Verificación con el binario local de TypeScript, no con `npx tsc`**
- **Found during:** Tasks 1-3
- **Issue:** los bloques `<automated>` del plan escriben `npx tsc --noEmit`; en este proyecto eso resuelve `tsc@2.0.4` del registry (no es el compilador, siempre sale 0). Trampa documentada del entorno.
- **Fix:** se ejecutó `./node_modules/.bin/tsc --noEmit` en las 3 tasks.
- **Files modified:** ninguno
- **Commit:** n/a (cambio de procedimiento de verificación)

### Desvío de proceso (no auto-fix)

**3. El checkpoint bloqueante de Task 3 se cerró sin verificación humana.** `workflow.auto_advance = true` hizo que el orquestador respondiera "approved" automáticamente. No es un fallo de implementación, pero **degrada la evidencia** de las 4 acceptance criteria del checkpoint de "observadas" a "inferidas del código + tipos + suites". Ver "Pendiente de UAT visual".

---

**Total deviations:** 2 auto-fixed (2 blocking) + 1 desvío de proceso documentado
**Impact on plan:** ninguno sobre el alcance — los 2 artefactos de código son exactamente los del plan (más la columna `service_id` que los habilita). Sin scope creep.

## Issues Encountered

- **Flakiness pre-existente de `test/abono-*.test.ts`** (2-4 fallas intermitentes contra la DB local bajo paralelismo, verdes en aislamiento). El Plan 12-01 la probó A/B como anterior a esta fase; no se persiguió y no se cuenta como regresión de este plan. Por eso la verificación de este plan corrió las **suites del motor** acotadas, no `npm run test` completo.
- **Dev server huérfano en el puerto 3000** dejado por el ejecutor anterior — terminado en esta sesión (ver "Verificación automatizada").

## Known Stubs

Ninguno. Las dos superficies quedan funcionales: el modo se puede setear desde el panel (ya no hace falta SQL) y la agenda lo refleja. Lo que falta de la fase (tests de carrera CUPO-04) es alcance explícito del plan 12-04.

## Threat Flags

Ninguna superficie nueva fuera del `<threat_model>` del plan: no se agregaron endpoints, rutas de auth ni columnas. Las escrituras nuevas (`capacity_mode`/`capacity`) van por browser client + RLS + `.eq('business_id', ...)` (T-12-14) y el enum lo valida el CHECK de la 062 a nivel DB (T-12-13). El indicador de ocupación vive en la agenda autenticada, no en el público (T-12-15, disposición `accept`).

## User Setup Required

Ninguna nueva. La migración **062** (Plan 12-01) sigue siendo el único paso manual pendiente en prod (última aplicada = 061), coordinada con el deploy + `NOTIFY pgrst, 'reload schema'`. **Además: correr los 5 pasos de UAT visual de arriba** contra el Supabase local antes de dar la fase por cerrada.

## Next Phase Readiness

- **12-04 (tests CUPO-04):** el fixture debe setear `capacity_mode='simultaneous_resource'` + `capacity` sobre el service sembrado. Vale cubrir también el LANDMINE de 12-02 (2ª reserva escalonada en simultáneo cap 2 debe volver `ok`).
- **secure-phase 12:** T-12-13/T-12-14/T-12-15 quedan verificables sobre `settings-client.tsx` y `agenda-client.tsx`.
- **UAT de fase:** los 5 pasos de este plan entran al pool de verificación visual junto con lo de 12-01/12-02.

## Self-Check: PASSED

- `app/(dashboard)/settings/settings-client.tsx` — existe y contiene `capacity_mode` / `simultaneous_resource`
- `app/(dashboard)/agenda/agenda-client.tsx` — existe y contiene `capacity_mode` / `simultaneous_resource`
- `app/(dashboard)/agenda/page.tsx` — existe y contiene `service_id` en el select
- Commits `66e90c1`, `67920a9` — presentes en el historial (`git log --grep="12-03"`)
- `./node_modules/.bin/tsc --noEmit` — exit 0
- Suites del motor — 22/22 verdes
- Puerto 3000 — sin listener

---
*Phase: 12-cupo-por-solape-recurso-simult-neo*
*Completed: 2026-07-29*
