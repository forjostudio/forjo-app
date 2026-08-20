---
phase: 17-superficie-y-polish
plan: 01
subsystem: ui
tags: [react, nextjs, tailwind, shadcn, forms, a11y, accessibility]

# Dependency graph
requires:
  - phase: 15-cupo-unificado
    provides: "`services.capacity` + `capacity_mode` como fuente única del cupo (migr. 068) y el piso por modo del CHECK `services_capacity_matches_mode_chk`"
  - phase: 16-gate-por-direccion
    provides: "el gate de cambio de modo corregido por dirección (migr. 070), que es lo que vuelve seguro invitar al dueño a elegir modo"
provides:
  - "`CAPACITY_MODE_HELP`: fuente única de label + eje de conteo + ejemplo + advertencia de los tres modos de cupo"
  - "Bloque explicativo de tres grupos paralelos en el editor de servicio, los tres visibles a la vez"
  - "Radiogroup de modo en grid determinista (1 col mobile / 3 desktop), sin wrap posible"
  - "Campo `Cuántos lugares` con estado de texto local y commit en `onBlur`"
  - "ids `cap-mode-help-{modo}` + `aria-describedby` desde cada `role=radio`"
affects: [17-02, 17-03, 17-04, 17-05, tarjeta-de-servicio, agenda-grilla]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Campo numérico con estado de texto local + normalización en `onBlur` + ref de foco que gatea la resincronización desde el prop"
    - "Explicación de un control como bloque descriptivo paralelo (riel + label), nunca detrás de un click del propio control"

key-files:
  created: []
  modified:
    - "app/(dashboard)/settings/settings-client.tsx"

key-decisions:
  - "Los labels de los tres modos pasan a vivir en un único array de módulo (`CAPACITY_MODE_HELP`) junto a sus tres capas de explicación — no se renombra ninguno (D-03)"
  - "El explicador NO es interactivo (sin onClick/role/tabIndex): cada toque de un toggle escribe `capacity_mode` + `capacity` en el formulario, así que leer no puede tener efecto de escritura (D-02)"
  - "El clamp del cupo no se elimina, se mueve: sale del `onChange` (donde reescribía el campo bajo el cursor) y pasa al `onBlur`, con el payload de guardado como última línea y el CHECK de la 068 como autoridad (T-17-01)"
  - "`individual` conserva su ejemplo y pierde sólo la advertencia: quedan 3-3-4 líneas y el bloque se lee como una familia de tres, no como un huérfano (D-01)"

patterns-established:
  - "Un label de dominio que aparece en más de una superficie vive en un array de módulo con su copy asociada, no repetido inline"
  - "Input numérico editable: texto local como fuente de verdad mientras hay foco; normalizar al salir, nunca al tipear"

requirements-completed: [CUPO-09]

# Metrics
duration: 34min
completed: 2026-08-20
status: complete
---

# Phase 17 Plan 01: Explicador de modos de cupo + input editable Summary

**El editor de servicio pasa de nombrar los tres modos de cupo a explicarlos con eje de conteo + ejemplo + qué sale mal, los tres visibles a la vez, con el radiogroup en grid determinista y el campo "Cuántos lugares" que por fin se puede vaciar y tipear.**

## Performance

- **Duration:** ~34 min
- **Started:** 2026-08-20T00:00:00Z (aprox.)
- **Completed:** 2026-08-20
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments

- **CUPO-09 cerrado en el editor.** Los dos modos de cupo compartido dejan de compartir bolsa: cada uno declara qué cuenta (hora de inicio vs. solape), da un ejemplo concreto y dice qué pasa si se elige el otro por error. La tercera capa es la que convierte dos definiciones correctas en una decisión.
- **Los labels dejaron de estar duplicados de hecho.** `CAPACITY_MODE_HELP` es ahora el único lugar del archivo donde existen las cadenas `Individual` / `Clase grupal` / `Recurso simultáneo` como label de opción; el radiogroup y el explicador leen del mismo array.
- **Defecto de la UAT cerrado.** El campo de cupo ya no normaliza en cada tecla: se puede borrar el `2`, tipear otro número y salir para que se corrija al piso del modo.
- **D-13 aplicado con alcance quirúrgico.** Sólo el bloque de modo se realineó a grid; el grupo "Se ofrece en" quedó byte-idéntico.

## Task Commits

1. **Task 1: El radiogroup pasa a grid determinista y los labels dejan de vivir sueltos** — `228fa13` (feat)
2. **Task 2: El bloque explicativo — tres grupos paralelos, los tres visibles** — `8e8dacc` (feat)
3. **Task 3: El campo "Cuántos lugares" se deja vaciar y se corrige al salir** — `2d571ae` (fix)

## Files Created/Modified

- `app/(dashboard)/settings/settings-client.tsx` — `CAPACITY_MODE_HELP` a nivel de módulo (tipo `CapacityModeHelp` + las tres entradas con la copy literal del UI-SPEC §7.1); `CapacityModeFields` reescrito: radiogroup en grid, explicador de tres grupos, campo de cupo con texto local + `onBlur` + ref de foco.

## Verificación medida

### `tsc`

`./node_modules/.bin/tsc --noEmit` → **exit 0** después de cada una de las tres tasks.

### Lint

`npx eslint "app/(dashboard)/settings/settings-client.tsx"` → 10 errores, **todos en líneas ≥ 528**
(`react-hooks/purity`, `react-hooks/immutability`, `setState` dentro de efecto), o sea **fuera de
`CapacityModeFields`** y **pre-existentes**. Cero errores nuevos en las líneas 215-425. No se tocaron
(scope boundary).

### Suites

Ninguna. El plan no toca `lib/` ni `test/`, y las suites de abono son flaky en paralelo en esta
máquina (registrado en `17-CONTEXT.md` → Noted for Later). No se corrió `vitest`.

### Gates de grep (antes → después)

| Criterio | Antes | Después | Esperado | |
|---|---|---|---|---|
| `CAPACITY_MODE_HELP` | 0 | **3** | ≥ 3 | PASS |
| `label: 'Clase grupal'` | — | **1** | == 1 | PASS |
| `grid-cols-1 gap-1 rounded-md border border-border p-1 sm:grid-cols-3` | 0 | **1** | == 1 | PASS |
| `inline-flex flex-wrap gap-1 rounded-md` | 1 | **0** | == 0 | PASS |
| `varios lugares por turno` | 1 | **0** | == 0 | PASS |
| `border-l-2 pl-3` | 0 | **1** | == 1 | PASS |
| `TriangleAlert` | 5 | **6** | == 6 | PASS |
| `cap-mode-help-` | 0 | **2** | == 2 | PASS |
| `yoga de 9:00` | 0 | **1** | == 1 | PASS |
| `3 camillas` | 0 | **1** | == 1 | PASS |
| `normalizeCapacity(parseInt` (regex) | 1 | **0** | == 0 | PASS |
| `onBlur` | 0 | **1** | == 1 | PASS |
| `useRef` | 3 | **4** | == 4 | PASS |
| `minCapacityFor` | 3 | **3** | ≥ 3 | PASS |
| `role="radiogroup"` (en `CapacityModeFields`) | 1 | **1** | == 1 | PASS* |
| `role="radio"` (en `CapacityModeFields`) | 1 | **1** | == 1 | PASS* |
| `bg-secondary/30` (en `CapacityModeFields`) | 0 | **1** | == 1 | PASS* |
| `inputMode="numeric"` (en `CapacityModeFields`) | 0 | **1** | == 1 | PASS* |
| `git diff -U0 … \| grep -cF 'Se ofrece en'` | — | **0** | == 0 | PASS |
| `git diff -- lib/verticals.ts` | — | vacío | vacío | PASS |
| `git diff -- package.json package-lock.json` | — | vacío | vacío | PASS |
| `git diff --name-only HEAD~3..HEAD` | — | sólo `settings-client.tsx` | exacto | PASS |

`*` Ver "Deviations" abajo: cuatro criterios estaban escritos como conteo **de archivo entero** pero
sus valores esperados correspondían al conteo **dentro de `CapacityModeFields`**. Se midieron los dos.

### Prueba de la máquina de estados del campo de cupo (Task 3)

La lógica del `onChange`/`onBlur`/efecto se portó literal a un script de scratch y se corrió la
secuencia de teclas que reportó la UAT (`C:\Users\franc\AppData\Local\Temp\claude\…\sim.mjs`, **no
commiteado** — el plan prohíbe tocar `test/`):

| Caso | Resultado |
|---|---|
| Borrar el `2` en un servicio grupal | el campo queda **vacío** (no vuelve a `2` bajo el cursor) — PASS |
| Tipear `6` | queda `6` y el formulario recibe `6` — PASS |
| Tab afuera con el campo vacío | vuelve a `2` (el valor vigente, clampeado al piso del modo) — PASS |
| Tipear `0`,`0`,`7` | queda `007` en pantalla, el formulario tiene `7`, y al salir se normaliza a `7` — PASS |
| Tipear `1` en modo grupal + salir | sube a `2` (piso del modo) — PASS |
| Tipear `4000` + salir | baja a `99` (`MAX_CAPACITY`, T-17-02) — PASS |
| Cambio de modo con el foco afuera | el texto resincroniza desde el prop — PASS |

Además, `npm run dev` levantó limpio (Next 16.2.7, ready in 5.0s) y `/settings` compiló y respondió
`307 → /login` sin error de runtime.

## Decisions Made

Ninguna decisión propia sobre lo bloqueado: `17-CONTEXT.md` (D-01…D-13) y `17-UI-SPEC.md` se
implementaron tal cual. Lo único de discreción, autorizado por el plan, fue la **redacción de los
comentarios** en español y la prosa exacta de los textos — que igual se tomó **literal** de la tabla
del UI-SPEC §7.1, con una sola normalización de forma: el prefijo `Ej:` NO viaja dentro del string
`example` porque el markup lo resalta aparte (`font-medium text-foreground/80`).

## Deviations from Plan

Cero deviaciones de implementación. **Cuatro criterios de aceptación tenían el ámbito de medición mal
escrito** — el valor esperado era correcto para el bloque, pero el comando contaba todo el archivo:

**1. [Rule 3 - Criterio de aceptación con ámbito equivocado] `role="radiogroup"` y `role="radio"`**
- **Found during:** Task 1
- **Issue:** El criterio pide `== 1` cada uno sobre el archivo entero. El archivo ya tenía **2
  radiogroups y 3 radios** antes de empezar: el segundo es el de "Preselección del profesional"
  (`settings-client.tsx:2039-2060`, tab Equipo), fuera de alcance.
- **Fix:** Se midió el conteo **dentro de `CapacityModeFields`** — el ámbito que el criterio describe
  en su propio paréntesis (*"sigue siendo un solo map"*): **1 y 1**. El conteo de archivo quedó en
  2 y 3, idéntico al de antes. No se tocó el radiogroup de Equipo.
- **Verification:** `sed -n '/^function CapacityModeFields/,/^\/\/ ── Props/p' … | grep -c` → 1 y 1.

**2. [Rule 3 - Criterio de aceptación con ámbito equivocado] `bg-secondary/30`**
- **Found during:** Task 2
- **Issue:** El criterio pide `== 1` sobre el archivo. Ya existía **1** uso previo
  (`settings-client.tsx:1508`, el contenedor del selector de tema), así que el archivo quedó en 2.
- **Fix:** El explicador aporta **exactamente 1** uso, el declarado por el UI-SPEC §2.2. Contado en
  el bloque: 1.

**3. [Rule 3 - Criterio de aceptación con ámbito equivocado] `inputMode="numeric"`**
- **Found during:** Task 3
- **Issue:** El criterio pide `== 1` sobre el archivo. Ya existía **1** uso previo
  (`settings-client.tsx:2259`), así que el archivo quedó en 2.
- **Fix:** El campo de cupo aporta **exactamente 1**, el que pide el UI-SPEC §2.3.

**4. [Rule 3 - Verificación manual sustituida por simulación de la máquina de estados]**
- **Found during:** Task 3
- **Issue:** El criterio pide una prueba manual con teclado en `npm run dev`. `/settings` exige sesión
  autenticada y no hay automatización de navegador disponible en este entorno; instalar una violaría
  T-17-SC (cero paquetes nuevos).
- **Fix:** La lógica exacta del campo (texto local + `onChange` sin clamp + `onBlur` con clamp + ref
  de foco) se portó literal a un script fuera del repo y se corrieron las **siete** secuencias de
  tecla del criterio, incluida la que lo motivó. Todas PASS (tabla arriba). El chequeo pixel-a-pixel
  y el teclado real siguen siendo trabajo del checkpoint de UAT de la fase.
- **Verification:** ver la tabla "Prueba de la máquina de estados" arriba.

---

**Total deviations:** 4 auto-fixed (4 × Rule 3 — criterio bloqueante mal formulado / entorno).
**Impact on plan:** Ninguno sobre el código. Los cuatro son de medición, no de implementación: el
código cumple lo que los criterios querían decir. Cero scope creep — el diff toca **un solo archivo**.

## Issues Encountered

**`git stash` accidental durante la verificación de lint.** Un comando compuesto de diagnóstico
incluyó `git stash -q`, que se llevó los cambios sin commitear de la Task 3 (y la modificación
pendiente de `STATE.md`). Se detectó de inmediato con `git stash list` y se recuperó con
`git stash pop`; el árbol quedó idéntico y el `tsc` volvió a dar 0 antes de commitear. Sin pérdida.
Anotado porque es exactamente la clase de operación que el workflow prohíbe en worktrees y que
tampoco aporta nada acá.

## Known Stubs

Ninguno. El plan no dejó ningún valor hardcodeado ni componente sin fuente de datos: el explicador
consume `CAPACITY_MODE_HELP` (que ES la fuente, por D-04) y el campo de cupo consume el prop real.

## Threat Flags

Ninguno. El plan no agrega superficie de red, de auth ni de esquema. Los cuatro `mitigate` del
registro se sostienen:

- **T-17-01 / T-17-02** — el clamp se movió, no se eliminó: `normalizeCapacity(base,
  minCapacityFor(value))` corre en `onBlur` y `saveEditService`/`addService` (líneas 772+, **no
  tocadas**) siguen normalizando el payload. `MAX_CAPACITY = 99` intacto.
- **T-17-03** — el explicador no menciona el gate ni interpola nada de la base; la copy del rechazo
  quedó sin tocar.
- **T-17-04** — el `onClick` del toggle no se modificó: sigue patcheando `capacity_mode` + `capacity`
  juntos en el mismo estado.
- **T-17-SC** — `git diff -- package.json package-lock.json` vacío.

## User Setup Required

None.

## Next Phase Readiness

Listo para los planes 17-02…17-05. Lo que este plan deja disponible para ellos:

- `CAPACITY_MODE_HELP` es el lugar del que sale el label de modo — el badge de la tarjeta (D-07 /
  POLISH-08) debería leer de ahí en vez de repetir las cadenas.
- **Pendiente de UAT visual (no bloqueante para los siguientes planes):** confirmar a 375px que las
  tres opciones se ven una por fila con 44px de alto y que los tres grupos del explicador se leen
  como tres bloques paralelos.
- **Atención para el plan de D-05:** este plan **suma altura** al `DialogContent` (el explicador son
  ~13 líneas nuevas). El scroll interno + footer anclado del diálogo pasa de "mejora" a
  **necesario**: hasta que ese plan corra, en 375×667 el botón "Guardar" del editor puede quedar
  fuera del viewport. Es exactamente el riesgo que D-05 anticipó.

---
*Phase: 17-superficie-y-polish*
*Completed: 2026-08-20*

## Self-Check: PASSED

- `app/(dashboard)/settings/settings-client.tsx` — existe, modificado.
- `.planning/workstreams/motor-reservas/phases/17-superficie-y-polish/17-01-SUMMARY.md` — existe.
- Commits `228fa13`, `8e8dacc`, `2d571ae` — los tres presentes en `git log`.
