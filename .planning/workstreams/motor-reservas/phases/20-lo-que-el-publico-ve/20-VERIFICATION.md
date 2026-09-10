---
phase: 20-lo-que-el-publico-ve
verified: 2026-09-10T23:15:00Z
status: passed
score: 8/8 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 20: Lo que el público ve — Verification Report

**Phase Goal:** Que el mapeo franja↔servicio que la Phase 19 volvió configurable llegue al cliente. El
que elige un servicio ve solo los horarios donde ese servicio se da; y un servicio que ninguna franja
cubre queda deshabilitado con el motivo a la vista, en vez de dejarlo avanzar hasta un calendario mudo.

**Verified:** 2026-09-10T23:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | [ROADMAP SC1] El cliente que elige un servicio ve **solo** los horarios donde ese servicio se da (hora + día) | ✓ VERIFIED | Hora: `app/api/booking/availability/route.ts` ya filtraba por `startTimesNotOffered` desde Phase 18 (no tocado, no regresión). Día: `booking-client.tsx:196-208` — `serviceBlocks = blocksForService(selectedService.id, timeBlocks, timeBlockServices ?? [])`, `openDaysSet` deriva de `serviceBlocks` en vez de `timeBlocks` crudo. UAT humana confirmó: "Cerámica" (solo martes) → calendario solo muestra martes clickeables. |
| 2 | [ROADMAP SC2] Un servicio sin franjas que lo cubran se lee como no disponible desde el selector, con el motivo, y no se puede elegir | ✓ VERIFIED | `booking-client.tsx:585-586,593,598,637-639` — `scheduled = timeBlocks.length === 0 \|\| isServiceScheduled(...)`, `enabled = scheduled && staffed`, `disabled={!enabled}` en el `<button>`, párrafo condicional con "Sin horarios disponibles". UAT: tarjeta "Yoga" atenuada, motivo visible, clic no avanza a paso 2. |
| 3 | [PLAN 20-01] `public_time_block_services` llega al RSC y viaja como prop `timeBlockServices`, molde de `professionalServices`, sin filtrar server-side | ✓ VERIFIED | `app/[slug]/page.tsx:75` (8va query del `Promise.all`), `:176` (`timeBlockServices={timeBlockServices \|\| []}` a `BookingClient`), `:217` (misma prop a `LandingRenderer`). |
| 4 | [PLAN 20-01] `page.tsx` deja de ocultar servicios con `bookableServices`; pasa el catálogo completo | ✓ VERIFIED | `grep -c "staffBookableServices" page.tsx` = 0; `grep -c "from '@/lib/staff-services'" page.tsx` = 0; `services={services \|\| []}` línea 170. |
| 5 | [PLAN 20-01] `isServiceStaffed` existe, exportada, guard sentinel byte-idéntico; `bookableServices` delega y sus 3 tests siguen en verde sin tocar aserciones | ✓ VERIFIED | `lib/staff-services.ts` exporta `isServiceStaffed` (línea ~90) + `bookableServices` delega (`services.filter(s => isServiceStaffed(...))`). `npx vitest run test/service-coverage-public.test.ts` → 3/3 passed. |
| 6 | [PLAN 20-01] El eje franja está verificado contra DB local con `anon` key, no solo por lectura de código | ✓ VERIFIED | `test/schedule-coverage-public.test.ts` lee con `persistSession: false` (cliente anon sin sesión) y ejercita `isServiceScheduled` sobre `public_time_block_services`. `npx vitest run` → passed (2 casos DB-backed). |
| 7 | [PLAN 20-02] Un servicio con franja pero sin staff se deshabilita con un motivo DISTINTO ("Sin profesional disponible") | ✓ VERIFIED | `booking-client.tsx:592-593,639` — `staffed = isServiceStaffed(...)`, motivo condicional `!scheduled ? 'Sin horarios disponibles' : 'Sin profesional disponible'`. UAT humana: tarjeta "Masaje" (franja OK, sin staff) muestra el segundo motivo, distinguible y simultáneo al de "Yoga" en la misma pantalla. |
| 8 | [PLAN 20-02 + REVIEW CR-01] Un servicio con cobertura completa se reserva igual que antes — cero regresión, incluido el caso "negocio sin ninguna franja cargada" que el propio cambio de esta fase podía romper | ✓ VERIFIED | Code review encontró CR-01 (con `timeBlocks=[]`, `isServiceScheduled` da `false` para TODO servicio, apagando el catálogo entero — alcanzable por lectura fallida o negocio configurado solo con `schedule_exceptions`). **Fix aplicado y verificado en el código actual**: commit `42bd134` antepone `timeBlocks.length === 0 \|\|` en `booking-client.tsx:585-586`, con regresión test agregado en `test/time-block-services.test.ts` (`'SIN NINGUNA FRANJA devuelve false para todo — el helper no guarda, guarda el CALLER'`). UAT: reserva de "Corte" de punta a punta sin cambios de comportamiento. |

**Score:** 8/8 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/[slug]/page.tsx` | 8va query `public_time_block_services` + prop `timeBlockServices`, catálogo sin pre-filtrar | ✓ VERIFIED | Confirmado por lectura directa: query en `Promise.all` (línea 75), prop pasada a `BookingClient` y `LandingRenderer`, `services \|\| []` sin `bookableServices`. |
| `lib/staff-services.ts` | `isServiceStaffed` exportada, guard sentinel reusado | ✓ VERIFIED | `export function isServiceStaffed` presente; `bookableServices` delega en ella. |
| `test/schedule-coverage-public.test.ts` | Verificación DB-backed del eje franja con `anon` | ✓ VERIFIED | Archivo existe, usa `persistSession: false`, pasa (`npx vitest run` confirmado en esta verificación). |
| `app/[slug]/booking-client.tsx` | Prop `timeBlockServices`, derivación `serviceBlocks`, tarjeta paso 1 con `disabled`+motivo por dos ejes | ✓ VERIFIED | Los tres elementos presentes y wired (ver truths 1, 2, 7 arriba). Incluye el fix de CR-01. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `app/[slug]/page.tsx` | `app/[slug]/booking-client.tsx` | prop `timeBlockServices` | ✓ WIRED | Prop desestructurada en `BookingClient` (línea 70) y consumida en `serviceBlocks`/`scheduled` (líneas 196-197, 585-586). |
| `app/[slug]/booking-client.tsx` | `lib/time-block-services.ts` | `isServiceScheduled`/`blocksForService` | ✓ WIRED | Importados (línea 11) y usados en los dos call sites (paso 1 y `serviceBlocks`). Cero `.filter(r => r.service_id ===...)` inline confirmado (`grep` = 0). |
| `app/[slug]/booking-client.tsx` | `lib/staff-services.ts` | `isServiceStaffed` | ✓ WIRED | Importado (línea 10) y usado en el paso 1 (línea 592). |
| `app/[slug]/page.tsx` (landing branch) | `components/landing/landing-renderer.tsx` → `bookingSlot` | El `BookingClient` real (con `timeBlockServices` completo) se pasa como `bookingSlot`, no el fallback interno del renderer | ✓ WIRED | `page.tsx:159-178` construye `bookingNode` (el `BookingClient` real, con `timeBlockServices`) UNA sola vez y lo pasa como `bookingSlot` tanto en la rama legacy como en la rama con landing (línea 217). El visitante público, con o sin landing habilitada, siempre recibe el mismo `BookingClient` correctamente gateado — ver "Scope: landing" abajo. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `tsc --noEmit` sobre el estado actual del repo | `./node_modules/.bin/tsc --noEmit` | exit 0 | ✓ PASS |
| Suites DB-backed + unitarias relevantes a la fase | `npx vitest run test/time-block-services.test.ts test/service-coverage-public.test.ts test/schedule-coverage-public.test.ts` | 3 files, 36 tests, 0 failed | ✓ PASS |
| CR-01 fix presente en disco (no solo en el SUMMARY) | `git show 42bd134` + lectura de `booking-client.tsx:585-586` | guard `timeBlocks.length === 0 \|\|` presente, regresión test en `test/time-block-services.test.ts` | ✓ PASS |
| Debt markers en los archivos tocados | `grep -n "TBD\|FIXME\|XXX"` sobre los 6 archivos de la fase | 0 matches | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| AGENDA-07 | 20-01, 20-02 | El cliente que elige un servicio ve solo los horarios donde se da; vacío se explica en vez de calendario mudo | ✓ SATISFIED | Truths 1, 2, 6, 7 arriba; UAT humana 4/4 (ya reportada, no re-ejecutada). REQUIREMENTS.md ya lo marca `[x]` y `Complete` en la tabla de traceability — consistente con la evidencia de código. |

No hay requisitos huérfanos: AGENDA-07 es el único ID declarado en ambos PLAN frontmatters y es el único que REQUIREMENTS.md mapea a la Phase 20 como completo (AGENDA-08 es de la Phase 21, fuera de este phase dir).

## Scope: la superficie de la landing (foco explícito de esta verificación)

El `Alcance` original de la fase nombraba dos superficies de lectura para un anónimo: el booking
público y la landing. El `20-CONTEXT.md` (D-03, decisión LOCKED al planificar) sacó a
`lib/landing/derive.ts` del alcance: esa función solo deriva "horarios de atención" (la unión de
`time_blocks`, es decir *cuándo abre el negocio*), un dato que **no depende de qué servicio se elige**
y que la fase decidió deliberadamente no tocar — la landing sigue sin tener una sección propia de
"qué servicio se da cuándo"; esa pregunta la responde el booking, siempre.

Verifiqué si ese fence deja un agujero real revisando **el único punto donde un anónimo real puede
llegar a un `BookingClient` distinto del principal**: la landing compuesta (`landing !== null` en
`page.tsx`). Resultado: **no hay agujero**. `page.tsx` arma `bookingNode` (el `BookingClient` real, con
`timeBlockServices` y `professionalServices` completos) una sola vez, y lo pasa como `bookingSlot` a
`LandingRenderer` tanto si hay landing como si no (`page.tsx:159-178,217`). El fallback interno de
`LandingRenderer` (el que arma su propio `BookingClient` con `professionalServices = []` y sin
`timeBlockServices`) **nunca se ejecuta en la ruta pública real**, porque `bookingSlot` siempre viene
seteado. Es "un camino muerto" — cita literal del comentario de `landing-renderer.tsx:67-68` — para el
tráfico anónimo.

**Donde SÍ se ejecuta ese fallback:** `app/(dashboard)/web/web-client.tsx:419` (el preview en vivo del
editor CMS, dentro del panel del dueño, autenticado). Ese call site renderiza `<LandingRenderer>`
**sin** `bookingSlot` y **sin** `professionalServices`/`timeBlockServices`, así que el preview cae en el
`BookingClient` de fallback con las dos puentes vacías ⇒ regla del comodín ⇒ **todo servicio se ve
habilitado en el preview**, mientras que la página real ya deshabilita "Yoga" y "Masaje". El code
review de la fase lo capturó como **WR-04** (warning, no crítico) y tiene razón: es una regresión real
en la fidelidad del preview del dueño (que además tiene un comentario propio, preexistente de otra
fase, afirmando "ahora el preview muestra exactamente lo que verá el visitante" — esa afirmación quedó
falsa).

**Conclusión sobre este punto:** no es un gap de AGENDA-07 ni del `Alcance` de la Phase 20 tal como lo
resolvió D-03 — el actor que ve el preview divergente es el **dueño autenticado en su propio panel**,
no el "cliente anónimo" que es el sujeto de las dos verdades del roadmap. Es, sin embargo, un bug real
y **pre-existente en su mecanismo** (el `LandingRenderer` siempre tuvo un fallback separado del
call site principal) que esta fase **amplió** al agregar una segunda prop que ese fallback tampoco
recibe. Queda como hallazgo abierto en `20-REVIEW.md` (WR-04), correctamente clasificado como warning:
no bloquea el objetivo de esta fase, pero merece una corrección de alcance chico (pasar las dos props
al preview, o exigir `bookingSlot` siempre) antes de que un dueño confíe en ese preview para configurar
su agenda por servicio.

## Anti-Patterns / Open Findings (no bloqueantes para el objetivo de esta fase)

El `20-REVIEW.md` de la fase (ya ejecutado, 1 crítico + 6 warnings + 5 info) queda como el registro de
detalle. Cross-check contra el objetivo de esta verificación:

- **CR-01** (catálogo entero apagado con `timeBlocks=[]`) — **CERRADO**: fix + test verificados en el
  código actual (ver truth 8).
- **WR-01** (sin backstop server-side para el eje staff) — deuda de seguridad **pre-existente y
  aceptada explícitamente** en el threat model de ambos planes (T-20-04 del Plan 20-01, T-20-05/T-20-07
  del Plan 20-02, disposición `accept`, con el mismo agujero ya presente antes de esta fase para el
  camino de profesional específico). No bloquea las dos verdades del roadmap, que son sobre lo que el
  cliente **ve**, no sobre la validación server-side de lo que puede forzar. Recomendado como candidato
  a un `todos/pending` o una fase de seguridad futura.
- **WR-02/WR-03** (contraste del motivo bajo `opacity-60`, tarjeta deshabilitada fuera del tab order) —
  hallazgo legítimo contra el estándar de accesibilidad no-negociable del proyecto (CLAUDE.md, WCAG AA).
  No invalida la verdad literal "el motivo está en el DOM y es el texto correcto" (confirmado por UAT
  visual en condiciones normales), pero sí compromete la legibilidad para usuarios con baja visión o
  navegación por teclado — el mismo eje que la fase existe para arreglar (que el vacío sea legible).
  Recomendado corregir en un quick-fix de seguimiento.
- **WR-05** (`isServiceStaffed`, el path de producción real, no tiene test directo; solo se ejercita
  indirectamente a través de los 3 tests de `bookableServices`, que ahora delega en ella y que ya no
  tiene llamadores en producción) — hallazgo de higiene de tests válido. No es un gap funcional: la
  lógica se ejercita transitivamente y además está confirmada por UAT humana con datos reales. Vale la
  pena repuntar los 3 tests a `isServiceStaffed` directamente en un seguimiento chico.
- **WR-06** (sin caso de test para `blocks=[]` en `schedule-coverage-public.test.ts`) — el caso SÍ quedó
  cubierto, pero en `test/time-block-services.test.ts` (el fix de CR-01 lo agregó ahí, no en el archivo
  DB-backed). Cierra el mismo riesgo señalado por la warning.
- **WR-07** (sin empty-state cuando TODOS los servicios están deshabilitados) — escenario posible pero
  no ejercitado por la UAT de esta fase (el escenario sembrado siempre tuvo servicios habilitados).
  Fuera del texto literal de las dos verdades del roadmap (que hablan de "un servicio", no de "todos");
  válido como mejora de UX de seguimiento.

Ninguno de estos ítems abre un `gaps:` en esta verificación porque ninguno contradice las dos verdades
observables que el roadmap fija como criterio de éxito de la Phase 20, y todos están ya documentados
—con disposición explícita— en el `20-REVIEW.md` de la propia fase.

### Human Verification Required

Ninguno nuevo. La UAT humana ya ejecutada (Task 3 del Plan 20-02, reportada en el SUMMARY y confirmada
en el contexto de esta verificación) cubre las 4 verdades observables en navegador: D-02 (Yoga
deshabilitado, motivo franja), D-05 (Masaje deshabilitado, motivo staff distinto, visible junto al
anterior), D-04 (calendario de Cerámica solo martes) y cero regresión (reserva de Corte de punta a
punta). No quedan verdades ⚠️ PRESENT_BEHAVIOR_UNVERIFIED.

### Gaps Summary

No hay gaps. Las dos verdades del roadmap para AGENDA-07 están verificadas por código y por UAT humana
con datos reales; el único hallazgo crítico del code review (CR-01) fue encontrado, corregido y
verificado en el commit `42bd134`, con test de regresión agregado. El fence de D-03 sobre
`lib/landing/derive.ts` está correctamente scopeado: no deja un agujero en lo que ve un cliente
anónimo, porque la landing pública siempre delega el booking real al mismo `BookingClient` completo.
El único hallazgo de superficie relacionado (WR-04, divergencia del preview del dueño en el CMS) afecta
a un actor autenticado, no al "cliente" sujeto de AGENDA-07, y queda correctamente registrado como
warning no bloqueante en `20-REVIEW.md` para un seguimiento aparte.

---

_Verified: 2026-09-10T23:15:00Z_
_Verifier: Claude (gsd-verifier)_
