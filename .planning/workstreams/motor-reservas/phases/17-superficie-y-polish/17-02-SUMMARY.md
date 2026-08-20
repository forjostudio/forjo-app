---
phase: 17-superficie-y-polish
plan: 02
subsystem: ui
tags: [react, nextjs, tailwind, shadcn, dialog, forms, a11y, mobile]

# Dependency graph
requires:
  - phase: 17-superficie-y-polish
    plan: 01
    provides: "`CapacityModeFields` con el explicador de tres grupos adentro — las ~13 líneas nuevas que convirtieron el scroll interno del diálogo de mejora en necesidad"
  - phase: 15-cupo-unificado
    provides: "el CHECK `services_capacity_matches_mode_chk` (migr. 068), que es lo que obliga a normalizar el cupo en el payload del alta"
provides:
  - "Patrón de diálogo alto aplicado POR CALLER: `max-h` con `svh` + `grid-rows-[auto_minmax(0,1fr)_auto]` + `gap-0` + cuerpo `min-h-0 overflow-y-auto` + `DialogFooter` anclado"
  - "`savingNewSvc`: guard de doble submit del alta de servicio"
  - "Botón 'Agregar servicio' rotulado al final del bloque de alta (CUPO-09)"
affects: [17-03, 17-05, dialogo-copiar-horario, roster-desktop-agenda]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Diálogo alto: el scroll interno se resuelve con clases sobre el `DialogContent` del caller, nunca tocando `components/ui/dialog.tsx`"
    - "Submit asíncrono de formulario en página: estado `saving*` + `try/finally` para que el early return por error también devuelva el botón"

key-files:
  created: []
  modified:
    - "app/(dashboard)/settings/settings-client.tsx"

key-decisions:
  - "El patrón de scroll se aplica por caller y sólo al diálogo 'Editar servicio': el componente base quedó byte-idéntico y los ~15 diálogos restantes del panel no cambiaron (UI-SPEC §3.1)"
  - "Sin sombra ni fade en los bordes del área scrolleable: la frontera de abajo ya la marcan el `border-t` + `bg-muted/50` del pie, y un fade condicional exigiría medir en JS o `scroll-timeline` — superficie nueva por un beneficio marginal en UN diálogo (UI-SPEC §3.2)"
  - "El apagado de `savingNewSvc` va en un `finally` y no antes de cada `return`: el early return por error del INSERT y cualquier excepción de red tienen que devolver el botón, o el alta queda muerta hasta recargar"
  - "El guard `if (!newService.name) return` de la función SE CONSERVA: el botón deshabilitado es la señal, no la defensa (T-17-05)"
  - "Los comentarios en español evitan repetir los literales de clase (`DialogFooter`, `grid-rows-[…]`, `overscroll-contain`) porque los criterios de aceptación cuentan sobre el archivo entero — se dice 'el pie', 'las tres filas del grid', 'el overscroll contenido'"

patterns-established:
  - "Un diálogo que puede crecer se ancla con cuatro piezas solidarias (max-h svh · grid-rows con minmax(0,1fr) · cuerpo min-h-0 overflow-y-auto · gap-0 + pie): ninguna sola alcanza"
  - "El submit de un formulario vive al FINAL del formulario, rotulado con verbo + sustantivo, nunca como un icono en el medio de la grilla de campos"

requirements-completed: [CUPO-09]

# Metrics
duration: 28min
completed: 2026-08-20
status: complete
---

# Phase 17 Plan 02: Diálogo con scroll interno + alta con botón al final Summary

**El editor de servicio deja de crecer y pasa a scrollear por dentro con el "Guardar" anclado abajo — que es lo que evita que el explicador de 17-01 deje el botón fuera del viewport a 375×667 — y el alta deja de confirmarse con un `+` en el medio del formulario para hacerlo con un botón rotulado al final que no admite doble submit.**

## Performance

- **Duration:** ~28 min
- **Completed:** 2026-08-20
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- **El defecto que 17-01 volvió urgente quedó cerrado.** `DialogContent` no tenía `max-h` ni `overflow-y`: el modal no scrolleaba, crecía. Con el explicador adentro, a 375×667 el "Guardar" —que era el último hijo suelto— se iba abajo del viewport sin forma de alcanzarlo. Ahora el título queda fijo arriba, el pie fijo abajo y scrollea únicamente el cuerpo del formulario.
- **Se cerró de paso un desborde que ya existía y nadie había reportado:** un negocio con muchas sedes llena "Se ofrece en" y empujaba el botón igual, sin explicador de por medio.
- **El componente base quedó intacto.** `git diff -- components/ui/dialog.tsx` vacío: los ~15 diálogos restantes del panel son byte-idénticos. Todo el patrón entró como clases sobre el `DialogContent` de este caller.
- **CUPO-09 en el alta.** El `+` de `col-span-1` desapareció; el submit dejó de estar antes del modo de cupo y de las sedes. La grilla se rebalanceó a 6/3/3 en desktop y a un campo por fila en mobile.
- **T-17-05 mitigado.** `addService` admitía doble submit y creaba dos servicios idénticos. Ahora se deshabilita, dice "Agregando…" y se apaga en **todas** las salidas.

## Task Commits

1. **Task 1: El diálogo "Editar servicio" scrollea por dentro con el pie anclado (D-05)** — `3991789` (fix)
2. **Task 2: El alta confirma con "Agregar servicio" al final, y no admite doble submit** — `a86416a` (feat)

## Files Created/Modified

- `app/(dashboard)/settings/settings-client.tsx`
  - **Import:** se suma `DialogFooter` a la línea 21.
  - **Diálogo "Editar servicio":** `DialogContent` con `grid max-h-[calc(100svh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 sm:max-w-sm`; `DialogHeader` con `pb-3 pr-8`; el `<div className="space-y-3">` del cuerpo pasa a `-mx-4 min-h-0 space-y-3 overflow-y-auto overscroll-contain px-4 py-1`; el "Guardar" sale de hijo suelto y entra en `<DialogFooter className="mt-4">` con `min-h-11 w-full sm:min-h-0 sm:w-auto`.
  - **Bloque de alta:** grilla a `col-span-12 sm:col-span-6` / `sm:col-span-3` / `sm:col-span-3`; el `<div className="col-span-1">` con el `Button size="icon"` **eliminado entero**; botón "Agregar servicio" nuevo al final del bloque, después de `CapacityModeFields` y de "Se ofrece en".
  - **Estado y handler:** `savingNewSvc` nuevo junto a `newService`; `addService` envuelto en `try/finally` con guard de reentrada.

## Verificación medida

### `tsc`

`./node_modules/.bin/tsc --noEmit` → **exit 0** después de cada una de las dos tasks. (Nunca `npx tsc`: en este repo siempre sale 0 y no vale como evidencia.)

### Build

`npm run build` → **exit 0**, `/settings` entre las rutas compiladas. Es la evidencia más fuerte disponible sin navegador: valida que el client component completo compila, no sólo que typechequea.

### Dev server

`npm run dev` levantó limpio (Next 16.2.7, ready in 904ms) y `/settings` respondió `307 → /login` sin error de runtime.

### Lint

`npx eslint "app/(dashboard)/settings/settings-client.tsx"` → **10 errores, exactamente los mismos 10 pre-existentes** que registró 17-01 (`react-hooks/purity` por `Date.now()` en la subida de logo/foto, líneas ≥ 528). **Cero errores nuevos.** No se tocaron: scope boundary.

### Gates de grep (antes → después)

| Criterio | Antes | Después | Esperado | |
|---|---|---|---|---|
| `DialogFooter` | 0 | **3** | == 2 | ver Deviations |
| `grid-rows-[auto_minmax(0,1fr)_auto]` | 0 | **1** | == 1 | PASS |
| `max-h-[calc(100svh-2rem)]` | 0 | **1** | == 1 | PASS |
| `overscroll-contain` | 0 | **1** | == 1 | PASS |
| `<DialogContent` | 4 | **4** | == 4 | PASS |
| `Agregar servicio` | 1 | **2** | >= 1 | PASS |
| `Agregando` | 2 | **3** | >= 1 | PASS |
| `savingNewSvc` | 0 | **4** | >= 4 | PASS |
| `col-span-5` | 1 | **0** | == 0 | PASS |
| `size="icon" onClick={addService}` | 1 | **0** | == 0 | PASS |
| `col-span-12 sm:col-span-6` | 0 | **1** | == 1 | PASS |
| `toast.success('Servicio agregado')` | 1 | **1** | == 1 | PASS |

> Los conteos son de **líneas** (`grep -cF`). `savingNewSvc` da 4 y no 6 porque `setSavingNewSvc(true/false)` lleva `S` mayúscula y no matchea la cadena en minúscula: declaración + guard de reentrada + `disabled` + ternario del texto.

### Aislamiento del cambio

| Verificación | Resultado |
|---|---|
| `git diff -- components/ui/dialog.tsx` | **vacío** — componente base byte-idéntico |
| `git diff -- package.json package-lock.json` | **vacío** — cero paquetes nuevos (T-17-SC) |
| `git diff --name-only` (por task) | sólo `app/(dashboard)/settings/settings-client.tsx` |
| `git diff --diff-filter=D HEAD~1 HEAD` (por commit) | sin borrados de archivos |

## Decisions Made

Ninguna decisión propia sobre lo bloqueado. `17-CONTEXT.md` (D-05) y `17-UI-SPEC.md` §3.1 / §3.2 / §5 / §7.2 se implementaron **tal cual**, incluidas las clases literales y la copy (`Agregar servicio` / `Agregando…` / `Guardar` / `Guardando...`). Lo único de discreción fue la redacción de los comentarios en español y la decisión de que **no repitan los literales de clase** (ver la nota en Deviations): es una elección de autoría, no un cambio de implementación.

Se conservó sin tocar la normalización del cupo del insert (`capacity_mode === 'individual' ? 1 : normalizeCapacity(newService.capacity, 2)`) — sigue siendo lo que evita rebotar contra el CHECK de la 068 — y el `business_id: business.id` del payload (T-17-06, `accept`: la RLS es la autoridad).

## Deviations from Plan

**1. [Rule 3 - Criterio de aceptación aritméticamente imposible] `grep -cF 'DialogFooter'` == 2**
- **Found during:** Task 1
- **Issue:** El criterio dice "== 2 (import + uso)". Pero `DialogFooter` **envuelve** al botón, así que su uso son dos líneas: `<DialogFooter className="mt-4">` y `</DialogFooter>`. El 2 sólo sería alcanzable con un elemento auto-cerrado, que no puede tener hijos.
- **Fix:** Se midió y se dejó en **3**, que son exactamente las tres líneas que el criterio describe: import (L21) + apertura (L2034) + cierre (L2036). No hay ninguna cuarta ocurrencia — verificado con `grep -nF`, listado completo arriba. El espíritu del criterio (pasar de **0** a "importado y usado en un solo lugar") se cumple.
- **Verification:** `grep -nF 'DialogFooter' "app/(dashboard)/settings/settings-client.tsx"` → 3 líneas, las tres esperadas.

**2. [Rule 3 - Verificación manual imposible en este entorno] Prueba a 375×667 en `npm run dev`**
- **Found during:** Tasks 1 y 2
- **Issue:** Las dos tasks piden abrir devtools a 375×667 y a) confirmar título fijo / "Guardar" fijo / cuerpo scrolleable y b) confirmar el botón deshabilitado y el "Agregando…". `/settings` exige sesión autenticada y en este entorno no hay automatización de navegador; instalar una violaría T-17-SC (cero paquetes nuevos). Es la misma limitación que registró 17-01.
- **Fix:** Se sustituyó por la evidencia más fuerte disponible sin navegador: `tsc --noEmit` exit 0, **`npm run build` exit 0** con `/settings` compilada, dev server sirviendo `/settings` sin error de runtime, y los gates de grep sobre las clases exactas del UI-SPEC. El comportamiento del scroll no depende de datos ni de estado: las cuatro clases son las que el spec declara y el `DialogContent` ya era `grid`.
- **Impacto:** El chequeo pixel-a-pixel a 375×667 y el doble click real sobre "Agregar servicio" **siguen siendo trabajo del checkpoint de UAT visual de la fase**. Quedan explícitamente pendientes ahí (ver "Next Phase Readiness").

**Nota de autoría (no es deviación):** los comentarios en español se redactaron **evitando repetir los literales de clase** (`DialogFooter`, `grid-rows-[auto_minmax(0,1fr)_auto]`, `overscroll-contain`) porque los criterios cuentan sobre el archivo entero y la primera redacción los inflaba a 6 / 2 / 2. Se dice "el pie", "las tres filas del grid" y "el overscroll contenido". El contenido explicativo es el mismo; el código no cambió.

---

**Total deviations:** 2 auto-fixed (2 × Rule 3 — criterio mal formulado / límite del entorno).
**Impact on plan:** Ninguno sobre el código. El diff toca **un solo archivo** y el componente base quedó intacto. Cero scope creep.

## Issues Encountered

Ninguno. El dev server se cerró por PID del puerto 3000 (`netstat` → `taskkill //F //PID`) antes de correr el build para que no compitieran por `.next`. **No se usó `git stash` en ningún momento** — la trampa que 17-01 registró.

## Known Stubs

Ninguno. El plan no deja valores hardcodeados ni componentes sin fuente de datos: el botón nuevo consume `newService` y `savingNewSvc` reales, y el diálogo sólo cambió de layout.

## Threat Flags

Ninguno nuevo. El plan no agrega superficie de red, de auth ni de esquema. El registro se sostiene:

- **T-17-05 (mitigate)** — `savingNewSvc` deshabilita el botón y le cambia la etiqueta mientras vuela el insert, y se apaga en un `finally` (cubre el early return por error y cualquier excepción). El guard `if (!newService.name) return` se conservó, más un `if (savingNewSvc) return` de reentrada.
- **T-17-06 (accept)** — el payload del insert **no se tocó**: `business_id: business.id` sigue igual y la RLS sigue siendo la autoridad. Evidenciado por el gate `toast.success('Servicio agregado')` == 1 y por la normalización de cupo sin diff.
- **T-17-07 (mitigate)** — `max-h` + `grid-rows` + cuerpo `min-h-0 overflow-y-auto` + pie anclado, aplicados con las clases exactas del UI-SPEC. La confirmación visual a 375×667 queda en la UAT (ver Deviation 2).
- **T-17-08 (mitigate)** — `git diff -- components/ui/dialog.tsx` **vacío**.
- **T-17-SC (accept)** — `git diff -- package.json package-lock.json` **vacío**.

## User Setup Required

None.

## Next Phase Readiness

- **Deuda anotada, no tocada (UI-SPEC §3.3):** "Copiar horario" (`agenda-client.tsx:1130`) y el roster de desktop (`agenda-client.tsx:1110`) tienen el mismo problema potencial y son los próximos candidatos al mismo patrón. Queda un comentario en el código apuntándolo. **Fuera de esta fase.**
- **Pendiente de UAT visual (no bloqueante para 17-03 / 17-05):**
  1. A 375×667, "Editar servicio" de un servicio **grupal** en un negocio con **≥ 2 sedes**: título fijo arriba, "Guardar" fijo abajo y visible, cuerpo scrolleando entre los dos, y el scroll del cuerpo no arrastrando la página de atrás.
  2. Que el "Guardar" del pie siga siendo alcanzable con `Tab` y que el foco no se escape del diálogo.
  3. En el alta: con el nombre vacío el botón está deshabilitado; al crear, dice "Agregando…" y no se puede tocar dos veces.
- `agenda-client.tsx` **no se tocó**: sigue sin cablear a `lib/agenda-occupancy.ts`, que es trabajo de 17-05.

---
*Phase: 17-superficie-y-polish*
*Completed: 2026-08-20*

## Self-Check: PASSED

- `app/(dashboard)/settings/settings-client.tsx` — existe, modificado.
- `.planning/workstreams/motor-reservas/phases/17-superficie-y-polish/17-02-SUMMARY.md` — existe.
- Commits `3991789`, `a86416a` — los dos presentes en `git log`.
