---
phase: 01-turnos-manuales
plan: 04
subsystem: ui
tags: [ui, dashboard, modal, drawer, vaul, combobox, agenda, appointments, react]

# Dependency graph
requires:
  - phase: 01-turnos-manuales (Plan 02)
    provides: "app/api/appointments/create/route.ts (POST) — alta manual autenticada con dedupe + core + slot_taken"
provides:
  - "components/dashboard/nuevo-turno-form.tsx — form compartido modal(desktop)/drawer(mobile) con combobox de cliente + crear-inline, alta vía el endpoint autenticado"
  - "Alta manual operable desde Turnos y Agenda corriendo el pipeline server-side completo (sin insert client-side directo)"
  - "Agenda: botón 'Nuevo turno' + click-en-día del resumen semanal que pre-llena la fecha (D-08 acotado)"
affects: [motor-reservas, cupos-grupales, turnos-manuales]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shell responsive Dialog/Drawer con cuerpo de estado remontado vía key={open} (reset + prefill como estado inicial, sin reset-effect)"
    - "useMediaQuery con useSyncExternalStore (suscripción a matchMedia sin setState-in-effect, SSR-safe vía getServerSnapshot)"
    - "Combobox sin command.tsx: Input + filtro en memoria sobre datos cargados por business_id en el server component"
    - "Form que NO inserta a supabase: arma el body y postea al endpoint autenticado; mapea errores snake_case del endpoint a toasts del UI-SPEC"

key-files:
  created:
    - components/dashboard/nuevo-turno-form.tsx
  modified:
    - app/(dashboard)/appointments/page.tsx
    - app/(dashboard)/appointments/appointments-client.tsx
    - app/(dashboard)/agenda/page.tsx
    - app/(dashboard)/agenda/agenda-client.tsx

key-decisions:
  - "Shell (NuevoTurnoForm) separado del cuerpo con estado (TurnoFormBody) remontado por key={open}: el prefill se aplica como estado inicial y se evita el reset-effect (idiomático + lint-clean)"
  - "useMediaQuery con useSyncExternalStore en vez de useState+useEffect para no introducir react-hooks/set-state-in-effect"
  - "Combobox = Input + filtro en memoria (command.tsx no existe); dedupe optimista en UI, la autoridad es el server (D-04)"
  - "D-08 acotado: la celda de día del resumen semanal pre-llena solo la FECHA (no hay grilla hora x día — RESEARCH Pitfall 3)"

patterns-established:
  - "Modal-on-desktop / drawer-on-mobile compartido por dos superficies vía un único componente (D-09)"
  - "Alta de turno desde el dashboard SIEMPRE vía el endpoint autenticado (anti-tampering + anti-doble-booking + dedupe server-side)"

requirements-completed: [MANUAL-01, MANUAL-02, MANUAL-03]

# Metrics
duration: 14min
completed: 2026-06-26
status: complete
---

# Phase 1 Plan 04: Form compartido de alta manual (modal/drawer) cableado en Turnos y Agenda Summary

**Form compartido `NuevoTurnoForm` (Dialog en desktop / Drawer vaul en mobile) con combobox de cliente + crear-inline, cableado en Turnos y Agenda, que crea el turno vía el endpoint autenticado `/api/appointments/create` (reemplaza el insert client-side directo) y refresca la vista.**

## Performance

- **Duration:** ~14 min (build) + fix de UAT
- **Tasks:** 4 (3 de build autónomas + 1 checkpoint human-verify aprobado)
- **Files creados/modificados:** 5 (1 creado, 4 modificados)

## Accomplishments

- `components/dashboard/nuevo-turno-form.tsx`: componente responsive (Dialog ≥768px / Drawer vaul <768px) con combobox de clientes (filtro en memoria por nombre/teléfono/email), crear-nuevo inline con dedupe optimista, hora libre (D-06) y sin control de seña (D-01).
- **Turnos** (`appointments-client.tsx`): se eliminó el `handleCreate` con `supabase.from('appointments').insert(...)` client-side directo; el alta ahora corre el pipeline server-side completo vía el endpoint. `page.tsx` carga `clients` + `locations` por `business_id`.
- **Agenda** (`agenda-client.tsx`): botón "Nuevo turno" en el header + celdas de día del resumen semanal convertidas en `<button>` con `aria-label` que pre-llenan la fecha del form (D-08 acotado, sin grilla horaria). `page.tsx` carga `services`/`professionals`/`clients` por `business_id`.
- Errores del endpoint mapeados a los toasts del UI-SPEC (`slot_taken` → "Ese horario ya está ocupado. Elegí otro.", etc.). Éxito → "Turno agregado" + cierre + `router.refresh()`.

## Task Commits

1. **Task 1: Componente compartido NuevoTurnoForm** — `efceb61` (feat) + **`806bb19`** (refactor lint-clean: key-remount + useSyncExternalStore)
2. **Task 2: Cablear el form en Turnos** — `1abfc08` (feat)
3. **Task 3: Cablear el form en Agenda** — `ba746d1` (feat)
4. **Task 4: Verificación visual (checkpoint human-verify)** — APROBADO; derivó en el fix de copy **`c413753`** (fix)

_`.planning/` está gitignored: SUMMARY/STATE/ROADMAP se escriben a disco, no se commitean._

## Files Created/Modified

- `components/dashboard/nuevo-turno-form.tsx` (nuevo) — Form compartido modal/drawer + combobox + crear-inline + fetch al endpoint.
- `app/(dashboard)/appointments/page.tsx` — Carga `clients` + `locations` por `business_id` para el form.
- `app/(dashboard)/appointments/appointments-client.tsx` — Usa `NuevoTurnoForm`; elimina el insert client-side directo.
- `app/(dashboard)/agenda/page.tsx` — Carga `services`/`professionals`/`clients` por `business_id`.
- `app/(dashboard)/agenda/agenda-client.tsx` — Botón "Nuevo turno" + click-en-día que pre-llena la fecha.

## Decisions Made

- **Shell + cuerpo remontado por key:** `NuevoTurnoForm` (shell con `open`/`isDesktop`/Dialog|Drawer) renderiza `<TurnoFormBody key={open ? 'open':'closed'}>`; el remount resetea el estado y aplica el `prefill` como estado inicial, eliminando el reset-effect. Idiomático y lint-clean.
- **`useMediaQuery` con `useSyncExternalStore`** (suscripción a `matchMedia`), SSR-safe vía `getServerSnapshot` que devuelve `false` — evita `react-hooks/set-state-in-effect`.
- **Combobox = Input + filtro en memoria** (`command.tsx` no existe); dedupe optimista en UI, autoridad en el server (D-04).
- **D-08 acotado:** click-en-día → fecha; sin grilla hora x día (RESEARCH Pitfall 3).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Refactor de NuevoTurnoForm para no introducir errores nuevos de lint (`react-hooks/set-state-in-effect`)**
- **Found during:** Task 1 (validación pre-checkpoint con `npx eslint`)
- **Issue:** La versión inicial reseteaba el estado en un `useEffect` que observaba `open`, y `useMediaQuery` hacía `setState` síncrono dentro de un effect — ambos disparaban `react-hooks/set-state-in-effect` (2 errores nuevos en mi archivo). El `eslint .` global del repo ya está rojo por ~462 errores pre-existentes (carpeta `design_handoff/` y el mismo patrón en otros 10 componentes), fuera de alcance; pero no correspondía sumar errores nuevos en código nuevo.
- **Fix:** Separación shell/cuerpo con remount por `key={open}` (estado inicial desde `prefill`, sin reset-effect) + `useMediaQuery` reescrito con `useSyncExternalStore`.
- **Files modified:** components/dashboard/nuevo-turno-form.tsx
- **Verification:** `npx eslint` del archivo → 0 errores; `npx tsc --noEmit` → 0; comportamiento sin cambios.
- **Committed in:** `806bb19`

**2. [UAT copy fix] Mensaje claro cuando hay cliente nuevo sin confirmar**
- **Found during:** Task 4 (verificación visual humana, paso 3/dedupe)
- **Issue:** Con un cliente nuevo en progreso sin confirmar (`creatingClient === true`, típico cuando el contacto matchea un cliente existente y el form solo ofrece "Usar existente"), tocar "Agregar turno" mostraba el toast genérico "Completá el cliente, el servicio y el horario." — engañoso, porque el contacto ya estaba cargado y solo faltaba confirmarlo.
- **Fix:** Rama específica en `handleSubmit` antes del guard genérico: con `dedupeMatch` → "Ese contacto ya existe. Usá el cliente existente o cambiá el contacto."; sin match → "Confirmá o cancelá el cliente nuevo antes de agregar el turno." Sin cambios al comportamiento de dedupe (forzar "Usar existente" es correcto por D-04).
- **Files modified:** components/dashboard/nuevo-turno-form.tsx
- **Verification:** `npx tsc --noEmit` → 0; `npx eslint` del archivo → 0; `npm run test` → 295/295.
- **Committed in:** `c413753`

---

**Total deviations:** 2 (1 blocker de lint auto-resuelto, 1 fix de copy pedido en UAT).
**Impact on plan:** Sin scope creep. El refactor no cambió comportamiento; el fix de copy es solo el mensaje del toast.

## UAT (Checkpoint human-verify) — APROBADO

Resultado del testing visual humano (desktop modal + mobile drawer):

- **Paso 1 (login + datos):** OK.
- **Paso 2 (alta en Turnos: combobox filtra, crear-inline, servicio+fecha+hora, "Turno agregado", aparece en la lista):** OK.
- **Paso 3 (dedupe):** OK funcionalmente — derivó en el fix de copy `c413753` (el toast genérico era engañoso cuando el cliente nuevo no estaba confirmado). El forzado de "Usar existente" (D-04) se mantiene.
- **Paso 4 (Agenda click-en-día):** OK — fue un malentendido del usuario; el comportamiento es correcto. Sin cambios.
- **Paso 5 (Agenda: botón "Nuevo turno" abre con fecha vacía; click-en-día pre-llena; sin grilla horaria):** OK.
- **Paso 6 (mobile <768px abre como drawer vaul, touch targets, labels visibles):** OK.

## Verification

- `npx tsc --noEmit` → **0 errores**. (Nota operativa: una corrida transitoria reportó errores en `.next/dev/types/routes.d.ts`, un artefacto generado y gitignored corrompido por el `npm run dev` del UAT; tras limpiar `.next/dev/types` el typecheck vuelve a 0 contra el código fuente.)
- `npx eslint components/dashboard/nuevo-turno-form.tsx` → **0 errores**. Los 5 archivos tocados quedan lint-clean (el `eslint .` global arrastra errores pre-existentes fuera de alcance).
- `npm run test` (vitest) → **295/295 verde** (25 archivos), sin regresiones.

## Threat Surface

Sin superficie nueva fuera del threat register del plan. Mitigaciones aplicadas:
- **T-01-13 (Tampering):** el form NO inserta directo a supabase (`grep` 0 `supabase.from` en el componente); todo va por el endpoint autenticado que re-valida server-side.
- **T-01-14 (Information Disclosure):** `clients`/`services`/`professionals`/`locations` se cargan en los `page.tsx` con `.eq('business_id', business.id)` (server components con sesión del dueño).
- **T-01-15 (Tampering / doble-booking):** el endpoint reusa el core (re-check + constraints 011/013); el form muestra `slot_taken` (UAT paso 3). Sin bypass UI.
- **T-01-SC (accept):** sin paquetes nuevos (combobox = Input+filtro; drawer/dialog ya vendoreados; sin import de `command`).

## Next Phase Readiness

- MANUAL-01/02/03 operables end-to-end desde la UI (Turnos + Agenda); MANUAL-04 (seña) ausente de la UI por D-01.
- Este es el ÚLTIMO plan de la fase 01-turnos-manuales. La fase queda cerrada end-to-end (build + UAT humano PASS).

## Self-Check: PASSED

- FOUND: components/dashboard/nuevo-turno-form.tsx
- FOUND: app/(dashboard)/appointments/page.tsx (modificado)
- FOUND: app/(dashboard)/appointments/appointments-client.tsx (modificado)
- FOUND: app/(dashboard)/agenda/page.tsx (modificado)
- FOUND: app/(dashboard)/agenda/agenda-client.tsx (modificado)
- FOUND commit efceb61 (Task 1), 1abfc08 (Task 2), ba746d1 (Task 3), 806bb19 (refactor), c413753 (fix UAT)

---
*Phase: 01-turnos-manuales*
*Completed: 2026-06-26*
