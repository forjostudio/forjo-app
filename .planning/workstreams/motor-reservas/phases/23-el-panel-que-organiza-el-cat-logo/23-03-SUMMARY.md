---
phase: 23-el-panel-que-organiza-el-cat-logo
plan: 03
subsystem: ui
tags: [nextjs, react, supabase, rls, drag-and-drop, catalogo, categorias]

requires:
  - phase: 23-el-panel-que-organiza-el-cat-logo
    provides: "plan 23-01: lib/catalog-panel.ts (moveWithinList, categoryPatch, SIN_CATEGORIA, classifyCategoryWriteError, CATEGORY_WRITE_REJECT_COPY), persistCategoryOrder y assignServiceCategory en categorias-manager.tsx"
  - phase: 22-el-modelo-del-catalogo
    provides: "migr. 078 (FK compuesta con ON DELETE SET NULL (category_id)) y 079 (índice normalizado + CHECK de no-blanco)"
provides:
  - "Renombrado in situ de una categoría: Enter guarda, Escape cancela, blur guarda; duplicado y blanco inline por fila"
  - "Borrado de categoría con ConfirmDialog único (risk medio) y las tres variantes de descripción por conteo en memoria"
  - "Arrastre nativo de filas (reorden por moveWithinList + el mismo mutador de las flechas) y de chips (asignar por assignServiceCategory)"
  - "reorderCategory: la regla única de reorden que comparten flechas y arrastre"
affects: [23-04, 24]

actuals:
  tokens: 7285
  tasks: 3
  commits: 3
plan_head_before: 7b2d5dbb8071a9f278b6c52d6cf4c9913f94e6ce

tech-stack:
  added: []
  patterns:
    - "Arrastre nativo HTML5: ids por estado de React, preventDefault en todo onDragOver y onDrop, guarda contains en dragleave, estados limpios antes del await y en el colapso"
    - "Estados del arrastre sin color solo ni transparencia: border-dashed (arrastrado), border-t-2 border-t-primary sobre el borde existente (inserción), bg-secondary + ring-2 (drop de chip)"
    - "Acción de ConfirmDialog que falla: throw + onConfirmError con copy propia, así el diálogo queda abierto y nada se saca del estado"

key-files:
  created: []
  modified:
    - components/dashboard/categorias-manager.tsx

key-decisions:
  - "El chip es arrastrable SOLO con service_sort_mode personalizado (lectura del plan y de E3), no con la fórmula del snippet del UI-SPEC (`custom || categories.length > 0`): sin el modo, el chip pierde grip y draggable y sigue abriendo Mover"
  - "Si falla el borrado, deleteCategory tira y el ConfirmDialog queda abierto; el toast lo da onConfirmError con la copy genérica de categoría (nunca el texto de la base)"
  - "La fila no es arrastrable mientras se renombra (el campo necesita seleccionar texto) ni con un reorden en vuelo; el botón del nombre se deshabilita con un renombrado en vuelo, lo que evita la carrera blur de A + click en B"
  - "Soltar un chip sobre otro chip corta la propagación solo si el gesto era de un chip: un arrastre de fila soltado encima de un chip sigue llegando a su fila"

patterns-established:
  - "Un solo reorderCategory(from, to) detrás de las flechas y del drop: announce + moveWithinList + persistCategoryOrder"

requirements-completed: [CAT-01, CAT-02, CAT-03]

coverage:
  - id: D1
    description: "Gates automáticos del plan: typecheck filtrado, escrituras con business_id, sin texto de la base en pantalla, tres variantes de copy, sin next/navigation, preventDefault >= onDragOver, sin opacity, D-07 gates 1 y 3, deps 26/13 sin paquetes de arrastre, suite completa"
    requirement: CAT-01
    verification:
      - kind: other
        ref: "./node_modules/.bin/tsc --noEmit filtrado (0 error TS fuera de .next/), tras cada task"
        status: pass
      - kind: other
        ref: "gates del <verify> de los Tasks 1-3 (TENANT=[], MSG=[], COPY FALTANTE vacío, NAV=[], onDragOver=3 preventDefault=9, OPACITY=[], D07-1 FUERA=[] DENTRO=1, D07-3 N=1 INSIDE=1, deps=26 13)"
        status: pass
      - kind: unit
        ref: "npx vitest run (93 archivos, 1245 pasados, 4 expected fail, 1 skip)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Renombrado in situ en /servicios: Enter/Escape/blur, no-op sin cambios, duplicado y blanco inline sin tocar el estado, flujo completo con teclado"
    requirement: CAT-01
    verification: []
    human_judgment: true
    rationale: "Foco, selección, blur y el slot inline solo se ven en el navegador; el ejecutor no puede abrirlo"
  - id: D3
    description: "Borrado con confirmación: variante correcta por conteo, chips a Sin categoría sin recargar, servicios siguen reservables en /[slug], fallo offline deja la fila, nombres de 60+ envuelven a 375px"
    requirement: CAT-01
    verification: []
    human_judgment: true
    rationale: "La elección de variante por conteo, el booking público y los dos backstop de E11 (error, long-text) requieren UAT visual"
  - id: D4
    description: "Arrastre de filas y de chips en desktop: borde punteado, indicador de inserción, sin parpadeo sobre hijos, orden persistido, asignación y desasignación por chip, colapso a mitad de gesto, offline y ausencia de arrastre en mobile"
    requirement: CAT-03
    verification: []
    human_judgment: true
    rationale: "El arrastre nativo sobre este componente no está probado (assumption CAT-03 del plan); solo la UAT visual lo confirma"

duration: 5min
completed: 2026-09-16
status: complete
---

# Phase 23 Plan 03: Renombrar, borrar y arrastrar en el organizador Summary

**El organizador de `/servicios` suma el renombrado in situ de categorías (duplicado y blanco traducidos por código, inline en la fila), el borrado con un ConfirmDialog que dice cuántos servicios quedan sueltos y que siguen reservables, y el arrastre nativo de HTML5: filas que reordenan por la misma regla y el mismo mutador que las flechas, y chips que asignan por `assignServiceCategory`.**

## Performance

- **Duration:** ~5 min (edición + gates; la suite completa tardó 79 s)
- **Started:** 2026-09-16T13:21:05Z
- **Completed:** 2026-09-16T13:26:09Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments

- **Renombrar (Task 1):** el nombre de la fila pasa a ser un `<button>` con `aria-label="Renombrar “…”"`. Al activarlo aparece un `Input h-8 text-sm` con autofoco y el texto seleccionado. Enter guarda, Escape cancela y blur guarda (un ref evita el doble guardado del blur que llega tras Enter o Escape). Sin cambios es un no-op. El recorte se hace al guardar. `.update({ name }).eq('id').eq('business_id').select('id')` trata 0 filas como fallo. `23505` y `23514` van al slot inline de esa fila (`role="status"`, `aria-invalid`, `aria-describedby`) y el resto va al toast. Ante un rechazo, el estado local no se toca.
- **Borrar (Task 2):** botón `Trash2` siempre visible y un único `ConfirmDialog` hermano de la Card (`risk="medio"`, `destructive`, nivel simple). La descripción se arma antes del render con el conteo en memoria, en tres variantes literales. El delete va acotado por tenant y trata 0 filas como fallo. La fila recién sale del estado cuando la base confirma. El espejo en memoria esparce `categoryPatch(SIN_CATEGORIA)` sobre los servicios afectados. No hay ninguna navegación.
- **Arrastre (Task 3):** la `<li>` entera es `draggable` solo con `category_sort_mode` personalizado. El drop calcula `from`/`to` y llama a `reorderCategory`, que ahora comparten las flechas: anuncio polite + `moveWithinList` + `persistCategoryOrder`. El chip es `draggable` solo con `service_sort_mode` personalizado y se puede soltar en una fila, en el grupo de sueltos o en otro chip. En todos los casos escribe `assignServiceCategory(service, valor)`, sin toast repetido. Los cuatro estados se limpian en dragend, en cada drop antes del `await` y al colapsar la Card.

## Task Commits

1. **Task 1: renombrar una categoría in situ** - `f1fa122` (feat)
2. **Task 2: borrar con confirmación y conteo** - `d791e64` (feat)
3. **Task 3: arrastre nativo de filas y chips** - `2ec045b` (feat)

## Files Created/Modified

- `components/dashboard/categorias-manager.tsx`: estado y handlers de renombrado, borrado y arrastre, `ServiceChip` con props de arrastre, `reorderCategory`, `resetDrag` y el `ConfirmDialog`. Es el único archivo tocado (`git diff --name-only 7b2d5db HEAD`).

## Decisions Made

- **Chip arrastrable solo con el modo de servicios personalizado.** El snippet del UI-SPEC decía `draggable={serviceMode === 'custom' || categories.length > 0}`, pero el plan (E3 y el done "el arrastre solo se renderiza con el modo personalizado de su eje") manda gatearlo. Se siguió el plan. Sin el modo, el chip sigue abriendo "Mover …".
- **Fallo del borrado:** `deleteCategory` tira y el diálogo queda abierto. `onConfirmError` muestra `No se pudo guardar la categoría. Probá de nuevo.`. El `console.error` del ConfirmDialog loguea el mensaje del `Error` propio (`borrar-categoria`), no el de Postgres.
- **Carreras de UI:** la fila no se arrastra mientras se renombra ni con un reorden en vuelo. Los botones de nombre se deshabilitan durante un renombrado en vuelo. Un drop de chip con otra asignación en vuelo se ignora (T-23-19).
- **Drop sobre chip:** corta la propagación solo si el gesto era de un chip. Si no, el drop de fila sigue llegando a la `<li>`.

## Deviations from Plan

None - plan executed exactly as written.

Notas de ejecución (no cambian el alcance):
- **Suite completa:** `npx vitest run` salió verde en la primera corrida: 93 archivos, 1245 pasados, 4 expected fail, 1 skip (piso 1209). No aparecieron los timeouts conocidos de `abono-generation` / `abono-cron`.
- **eslint** sobre `categorias-manager.tsx`: exit 0, sin hallazgos.
- `package.json` / `package-lock.json` sin cambios (deps `26 13`, ningún paquete de arrastre). Siguen 41 migraciones.
- Limitación conocida: el grupo `Sin categoría` solo se renderiza si hay al menos un servicio suelto (comportamiento del 23-01). Si todos los servicios tienen categoría, no hay destino de arrastre para desasignar. El diálogo "Mover …" sigue cubriendo ese caso.

## Issues Encountered

None

## UAT visual pendiente

No se abrió un navegador: nada de esto se verificó visualmente, arrastre incluido. Pasos con `npm run dev` y `test@forjo.local` / `Forjo1234!` en `/servicios`.

**Renombrar (Task 1)**, con `Color` y `Uñas` creadas:
1. Tocar el nombre `Color`: se abre el campo con el texto seleccionado.
2. Escribir `Coloración` + Enter: queda renombrada. Recargar: sigue así.
3. Tocar, cambiar, Escape: vuelve el nombre anterior y no se escribe nada.
4. Tocar, cambiar, click afuera: guarda.
5. Renombrar `Uñas` a `  coloración `: aparece `Ya tenés una categoría con ese nombre.` bajo esa fila, el campo sigue abierto con lo escrito y no se ve ningún nombre de constraint.
6. Vaciar + Enter: aparece `Escribí un nombre para la categoría.` y no se escribe.
7. Solo con teclado (Tab al nombre, Enter, escribir, Enter): el flujo completo funciona.

**Borrar (Task 2)**, con `Color` (3 servicios), `Uñas` (1) y `Vacía` (0):
1. Eliminar `Color`: el diálogo nombra la categoría, dice **3 servicios** y que siguen activos y reservables.
2. Eliminar `Uñas`: variante en singular, sin el número.
3. Eliminar `Vacía`: `No tiene ningún servicio asignado.`
4. Confirmar `Color`: la fila desaparece y los 3 chips pasan a `Sin categoría` sin recargar.
5. En `/[slug]`: los 3 servicios siguen y se pueden reservar.
6. Offline + confirmar un borrado: aparece el toast genérico, el diálogo queda abierto y la categoría sigue en la lista (backstop E11 error).
7. Categoría de 60+ caracteres a 375px: título y descripción envuelven sin desbordar (backstop E11 long-text).

**Arrastre (Task 3)**, en desktop:
1. Arrastrar la tercera fila sobre la primera: la tomada tiene borde punteado (no se atenúa) y la de destino engrosa y tiñe su borde superior.
2. Soltar: queda en la posición de destino. Recargar: el orden se mantiene.
3. Pasar por encima de un botón de una fila durante el arrastre: el resaltado no parpadea.
4. Chip de `Sin categoría` a una fila: aparece bajo esa categoría y los conteos se actualizan (la fila se realza con relleno + anillo).
5. Chip de vuelta a `Sin categoría`: queda sin categoría.
6. Empezar un arrastre y colapsar la Card con el header: al reabrir, ninguna fila queda con borde punteado. Ojo: con el puntero ocupado por el gesto puede no ser posible clickear el header. Si no se puede, probar con Escape para cancelar y después colapsar.
7. Offline, soltar un chip en otra categoría: aparece `No se pudo mover “…”. Probá de nuevo.` y el chip vuelve a su grupo.
8. Mobile (375px): no hay arrastre, y las flechas y el diálogo siguen funcionando.
9. Con `service_sort_mode` distinto de `custom` (se configura en el 23-04, o a mano en la base local): los chips no tienen grip ni se arrastran, y siguen abriendo "Mover …".

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 23-04 (modos de orden + sección "Posición") encuentra `serviceCustom`/`categoryCustom` ya gateando el arrastre, y el hook de "drop sobre chip" (`dropServiceOnChip`) listo para sumarle la posición. Si el cambio de modo ocurre a mitad de un gesto, llamar a `resetDrag()` (UI-SPEC nota 6).
- Los gates de D-07 siguen en 1/1: el único update suelto de la columna es el de `assignServiceCategory`.
- Cero migraciones y cero paquetes nuevos.

---
*Phase: 23-el-panel-que-organiza-el-cat-logo*
*Completed: 2026-09-16*

## Self-Check: PASSED
