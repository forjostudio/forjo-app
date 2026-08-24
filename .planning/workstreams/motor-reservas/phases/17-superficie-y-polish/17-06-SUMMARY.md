---
phase: 17-superficie-y-polish
plan: 06
subsystem: ui
tags: [react, nextjs, tailwind, mobile, layout, a11y, gap-closure]

# Dependency graph
requires:
  - phase: 17-superficie-y-polish
    plan: 03
    provides: "`CapacityInlineControl` + `saveCapacityInline` + la línea de datos convertida en contenedor `flex-wrap`; este plan recompone esa superficie sin tocar su lógica"
  - phase: 17-superficie-y-polish
    plan: 02
    provides: "el archivo `settings-client.tsx` con el diálogo de edición ya resuelto (D-05), que este plan deja intacto"
provides:
  - "La fila de la tarjeta de servicio partida en dos: nombre + acciones agrupadas arriba, línea de datos a ancho completo abajo (cierra G-02)"
  - "`CapacityInlineControl` devolviendo DOS items de flex: el label de modo como dato inline y el bloque del stepper con base de flex a ancho completo (cierra G-02b)"
  - "El precedente medido de 'el dato nuevo no le pide ancho al que ya estaba: se lleva su propia línea', aplicable a 17-07 (G-03)"
affects: [17-08, segunda-ronda-de-uat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Agrupar las acciones de una fila de lista en UN item de flex y bajarles el hueco entre ellas: recupera ancho para el texto sin tocar ningún target táctil"
    - "Cuando un bloque tiene que ocupar su propio renglón dentro de un contenedor que envuelve, la base de flex a ancho completo lo hace determinista en vez de dejarlo librado a dónde caiga el wrap"
    - "Un sufijo de unidad puede ceder su ancho en mobile mientras la unidad siga viajando por las etiquetas accesibles del control"

key-files:
  created: []
  modified:
    - "app/(dashboard)/settings/settings-client.tsx"

key-decisions:
  - "Las acciones dejan de compartir renglón con la línea de datos: la aritmética a 375px daba 271px de tarjeta contra ~186px de acciones, o sea ~85px para una columna que necesitaba 146px sólo para el stepper — 61px de desborde real, no una ilusión óptica"
  - "El centrado vertical de la fila se CONSERVA: sin la línea de datos adentro vuelve a ser un renglón corto, y alinear arriba habría movido las tarjetas de los servicios `individual`, que son el 100 % de producción y no tienen ningún defecto"
  - "El label de modo se queda arriba como tercer dato de la línea y sólo baja el bloque del stepper — desviación medida del UI-SPEC §1.1/§1.2, ver Deviations"
  - "La línea propia del bloque del stepper es determinista (base de flex a ancho completo), no un efecto colateral del wrap: así no depende del largo de la duración y el precio de cada servicio"
  - "El sufijo `lugares` cede sus ~40px al botón `Guardar` sólo en mobile y sólo con la fila sucia: 146 + 8 + 96 = 250px ≤ 271px, que es el renglón único que pidió el dueño"
  - "El label de modo cambió de POSICIÓN, no de naturaleza: sigue siendo un `span` de texto plano sin manejador, sin rol y sin índice de tabulación (D-09 intacta)"
  - "Las tarjetas de profesionales no se tocaron aunque comparten la clase base de la fila: nadie las reportó y ampliar el arreglo es superficie extra para volver a mirar en la UAT"

patterns-established:
  - "La regla de composición del cierre de gaps de esta fase: a 375px, un dato nuevo no le pide ancho al que ya estaba — se lleva su propia línea. Es lo que hizo POLISH-10 en Finanzas, la única de las tres superficies que pasó la UAT sin issues"

requirements-completed: [POLISH-08]

# Metrics
duration: 21min
completed: 2026-08-24
status: complete
---

# Phase 17 Plan 06: La tarjeta de servicio deja de superponer botones sobre el texto Summary

Recomposición de layout de la tarjeta de `/servicios` a 375px: las acciones salen del renglón del dato
y el control de cupo se parte en dos items de flex, de modo que el stepper y su botón `Guardar` entran
en un solo renglón de 250px. Cero cambios de lógica, de estado o de escritura.

## Qué se construyó

### G-02 — las acciones y el dato dejan de competir por el mismo renglón

La tarjeta tenía **un solo hijo-fila** (`items-center`) con una columna `flex-1 min-w-0` que anidaba
dos cosas: el bloque del nombre y la línea de datos. Al recibir el control en 17-03 esa columna creció
de alto, y los tres botones —centrados verticalmente contra un bloque alto— quedaron flotando encima
del texto del modo.

La aritmética que confirma que era desborde real y no una ilusión: a 375px el interior de la tarjeta
mide **271px** (375 − 32 del `p-4` del layout − 48 del `p-6` de la `Card` − 24 del `p-3` de la
tarjeta). Las acciones consumían 86 + 32 + 32 + 3 huecos de 12px = **186px**, dejando ~85px para una
columna cuyo stepper mide **146px**: **61px de desborde**.

Ahora la tarjeta tiene **dos hijos hermanos** (el `space-y-2` del contenedor ya los separa):

1. **Fila A** — el bloque del nombre (intacto, incluida la pill de "Sin cobertura") más un contenedor
   nuevo que agrupa los tres botones de acción sin cambiarles una sola clase por dentro. El hueco de la
   fila baja a 8px y el de las acciones entre sí a 4px: las acciones pasan de 186px a **166px** y el
   nombre de ~85px a **~105px**.
2. **Fila B** — la línea de datos, movida tal cual (misma clase, mismos hijos, sólo cambia de padre).
   Ahí adentro dispone de los **271px** completos.

El centrado vertical se conservó a propósito: sin la línea de datos adentro, la fila A vuelve a ser un
renglón corto.

### G-02b — el modo es dato, el stepper es línea

Todo el control junto pedía ~372px de renglón (label 74 + stepper 146 + sufijo 40 + botón 96 + huecos),
por eso caía en tres niveles. `CapacityInlineControl` pasa a devolver un **fragmento con dos items**
para el contenedor `flex-wrap` de la línea de datos:

- **Item 1** — el `span` del label de modo, sin manejadores, inline con `30min · $5.000 ·`. La línea
  completa mide 92 + 8 + 6 + 8 + 74 = **188px ≤ 271** ✓.
- **Item 2** — un `span` con base de flex a ancho completo que aloja el grupo del stepper, el sufijo y
  el botón `Guardar`. Con la fila sucia: **146 + 8 + 96 = 250px ≤ 271** ✓.

El `onKeyDown` de Escape se mudó al item 2, que es donde vive todo lo focusable. El sufijo `lugares`
se oculta sólo en mobile y sólo cuando hay un guardado pendiente; la unidad sigue viajando por las
etiquetas accesibles del input y del grupo, y a los ≥640px vuelve porque ahí el stepper baja a 104px.

La máquina de estados (`value`, `text`, `rejected`, `apply`, `revert`, `handleSave`, el timer y los dos
`useEffect`) quedó **byte-idéntica**. `saveCapacityInline` no se tocó.

## Tareas y commits

| Task | Nombre | Commit |
|---|---|---|
| 1 | Las acciones salen de la fila del dato — la línea de datos recupera los 271px | `cbbd0a5` |
| 2 | El control se parte en dos — el modo es dato, el stepper es línea | `2e359f5` |

## Criterios de aceptación medidos

| Gate | Base | Después | Esperado |
|---|---|---|---|
| Línea de `<CapacityInlineControl` vs. línea de `openDeleteService(s)` | 2145 vs 2160 (inverso) | **2176 vs 2153** (control después) | control > borrar ✓ |
| `grep -cF 'className="flex items-center gap-3"'` | 3 | **2** | 2 ✓ |
| `grep -cF 'flex shrink-0 items-center gap-1'` | 0 | **1** | 1 ✓ |
| `grep -cF 'openEditService(s)'` / `openDeleteService(s)` | 1 / 1 | **1 / 1** | 1 / 1 ✓ |
| `grep -cE 'basis-full'` | 0 | **1** | 1 ✓ |
| `grep -cE 'hidden sm:inline'` | 0 | **1** | 1 ✓ |
| `grep -cF 'h-11 w-11 sm:h-8 sm:w-8'` (piso táctil) | 2 | **2** | 2 ✓ |
| `grep -cE 'min-w-24'` | 1 | **1** | 1 ✓ |
| `grep -cE 'tabIndex='` / `role="button"` | 0 / 0 | **0 / 0** | 0 / 0 ✓ |
| `.update({ capacity })` dentro de `saveCapacityInline` | 1 | **1** | 1 ✓ |
| `.eq('business_id', business.id)` dentro de `saveCapacityInline` | 1 | **1** | 1 ✓ |

**Prueba estructural del movimiento:** el `<CapacityInlineControl` quedó en la línea **2176**, después
del `openDeleteService(s)` de la línea **2153**. Antes era al revés (2145 vs 2160), que es exactamente
la forma que tenía el defecto: el control vivía *dentro* de la columna que compartía renglón con los
botones.

## Verificación

- `./node_modules/.bin/tsc --noEmit` → **exit 0** (el binario local; `npx tsc` siempre sale 0 en esta
  máquina y no sirve como gate).
- `npm run build` → **compila**, sin warnings nuevos. `/servicios` y `/settings` siguen dinámicas.
- `npx vitest run test/agenda-occupancy.test.ts --no-file-parallelism` → **20 passed**.
- `git diff --stat` sobre los dos commits → **un solo archivo de código**:
  `app/(dashboard)/settings/settings-client.tsx` (151 inserciones, 116 borrados).
- `git diff -- package.json package-lock.json components/ui/ lib/verticals.ts "app/(dashboard)/agenda/" "app/(dashboard)/finances/"` → **vacío** (0 líneas).
- Sin archivos sin trackear ni borrados.

## Deviations from Plan

### Desviación medida del UI-SPEC §1.1/§1.2 — el label de modo NO baja con el control

**Declarada en el plan, no descubierta acá.** El UI-SPEC §1.1 dice que a 375px "el control **baja a su
propia línea**" y §1.2 dibuja la composición como un solo renglón `Clase grupal [−][6][+] lugares
[Guardar]`. Medido contra la tarjeta real:

| Pieza | mobile |
|---|---|
| label del modo (`Clase grupal`) | ~74px |
| grupo del stepper | 146px |
| sufijo `lugares` | ~40px |
| `Guardar` | 96px |

El control entero en reposo mide 74 + 146 + 40 + 2 huecos = **~278px** contra los **271px** reales de
la tarjeta: **no entra ni siquiera limpio**, y con el botón sube a ~372px. Por eso el label se queda
arriba, inline con la duración y el precio —que es literalmente lo que D-07 dice que es: el **tercer
dato** de la línea, mismo registro que los otros dos— y sólo baja el bloque que necesita ancho.

Es una **corrección medida del contrato**, no un incumplimiento: el objetivo del spec (que el control
no se parta en niveles y que el piso táctil se cumpla de verdad) se cumple mejor así. El §1.3 queda
intacto: los botones conservan sus 44px en mobile y su molde de 32px desde `sm:`.

### Corolario sobre §2.2 (cero reflow)

El "cero reflow" de §2.2 ya no aplica literalmente a esta superficie: la línea de datos ahora cambia de
alto cuando el bloque del stepper toma su renglón. Está absorbido por el scroll interno del diálogo
(D-05), que ya pasó la UAT (test 2). No es regresión: es la consecuencia esperada de la regla de
composición de este cierre de gaps.

### Sin auto-fixes de las reglas 1-3

No hubo bugs, funcionalidad crítica faltante ni bloqueos. El plan se ejecutó tal como está escrito.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. El plan es composición de JSX: no agrega superficie de red, ni rutas de auth, ni acceso a
archivos, ni cambios de esquema. Los cinco riesgos del registro (T-17-29…T-17-32 y T-17-SC) quedan
cubiertos por sus gates: el label sigue sin ser control (0 / 0), el write path sigue con payload de una
clave y filtro por tenant (1 / 1, con el `sed` acotado a la función), y no se instaló ningún paquete.

## Lo que queda pendiente

La confirmación **visual** a 375px no es tarea de este plan: va a la segunda ronda de UAT, cuyo guion
sale de `17-08-PLAN.md`. Lo que este plan garantiza es la prueba estructural y aritmética; lo que falta
es que el dueño lo vea.

⚠ Se corrió `npm run build` con el servidor de desarrollo levantado en el puerto 3000. Si el dev server
quedó raro, alcanza con reiniciarlo: la carpeta `.next` es la única compartida y el build la reescribió.

## Self-Check: PASSED

- `app/(dashboard)/settings/settings-client.tsx` — existe.
- `.planning/workstreams/motor-reservas/phases/17-superficie-y-polish/17-06-SUMMARY.md` — existe.
- Commits `cbbd0a5` y `2e359f5` — presentes en el historial.
