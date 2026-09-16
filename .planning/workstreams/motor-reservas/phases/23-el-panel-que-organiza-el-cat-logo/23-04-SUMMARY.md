---
phase: 23-el-panel-que-organiza-el-cat-logo
plan: 04
subsystem: ui
tags: [nextjs, react, supabase, rls, catalogo, categorias, orden]

requires:
  - phase: 23-el-panel-que-organiza-el-cat-logo
    provides: "planes 23-01..23-03: lib/catalog-panel.ts (renumber, moveWithinList, categoryPatch, ORDER_REJECT_COPY), persistCategoryOrder, assignServiceCategory, diálogo Mover, arrastre de filas y chips"
  - phase: 22-el-modelo-del-catalogo
    provides: "migr. 078: businesses.category_sort_mode / service_sort_mode con CHECK, services.sort_order; groupCatalog puro"
provides:
  - "Selector 'Orden de los servicios' arriba de la lista de servicios (fuera del colapso) + ayuda permanente y condicional"
  - "Selector 'Orden de las categorías' dentro del organizador (solo con categorías)"
  - "Modos de orden en el estado de SettingsClient, bajados al organizador por props"
  - "sortCategories(categories, mode) exportada en lib/service-categories.ts y usada por groupCatalog"
  - "persistServiceOrder: el segundo y último mutador de orden de la fase"
  - "Sección Posición del diálogo Mover (contador sobre el borrador, Subir/Bajar)"
  - "Soltar un chip sobre otro chip asigna categoría e inserta en su índice"
affects: [23-verify, 24]

actuals:
  tokens: 6140
  tasks: 3
  commits: 2
plan_head_before: 78d23e5c1a01862779a6aa8dba14ea5bbf1088e7

tech-stack:
  added: []
  patterns:
    - "Cambio de modo = update de UNA columna de businesses con .select('id'): cero filas cuenta como fallo, el Select vuelve al valor anterior y avisa"
    - "El orden mostrado de las filas sale de una función exportada del módulo puro (sortCategories), nunca de un sort en el componente"
    - "Posición del borrador calculada sobre el grupo destino SIN el propio servicio: lista final = moveWithinList([...base, id], base.length, índice)"

key-files:
  created: []
  modified:
    - app/(dashboard)/settings/settings-client.tsx
    - components/dashboard/categorias-manager.tsx
    - lib/service-categories.ts
    - test/service-categories.test.ts

key-decisions:
  - "D-11 (checkpoint, opción A): los handlers de modo escriben una sola columna de businesses y nunca sort_order"
  - "sortCategories exportada en lib/service-categories.ts (groupCatalog la usa) para pintar las filas del organizador según el modo — decisión del usuario 'A + 1 sí + 3 sí'"
  - "La sección Posición y el reorden por chip-sobre-chip solo existen con modo personalizado Y fuera del camino de identidad de groupCatalog — decisión del usuario"
  - "Los handlers de modo agregan .select('id') y tratan cero filas como fallo (más estricto que el molde selectTheme), para no quedar mostrando un modo no guardado"

patterns-established:
  - "Un mutador de orden por eje, exactamente dos en el organizador (categorías y servicios)"

requirements-completed: [CAT-03, CAT-04, CAT-05]

coverage:
  - id: D1
    description: "Handlers de modo que escriben una sola columna de businesses, sin sort_order (D-11)"
    requirement: CAT-04
    verification:
      - kind: other
        ref: "grep gate: from('businesses').update( sin sort_order en settings-client.tsx y categorias-manager.tsx"
        status: pass
    human_judgment: true
    rationale: "El gate mira la cadena de escritura; el viaje de ida y vuelta (acomodar → Alfabético → Personalizado → recargar) solo se prueba en el navegador"
  - id: D2
    description: "sortCategories: misma regla del eje categorías que groupCatalog, incluye vacías, estable, no muta"
    requirement: CAT-04
    verification:
      - kind: unit
        ref: "test/service-categories.test.ts#sortCategories — el eje categorías, con las vacías incluidas"
        status: pass
    human_judgment: false
  - id: D3
    description: "Gates por eje: grip/flechas/draggable de filas, grip/draggable del chip y sección Posición no se renderizan fuera de personalizado"
    requirement: CAT-05
    verification:
      - kind: other
        ref: "grep gate: ningún disabled/aria-disabled depende de sort_mode"
        status: pass
    human_judgment: true
    rationale: "La ausencia visual de los controles y la independencia de los dos ejes requieren UAT en el navegador"
  - id: D4
    description: "persistServiceOrder + sección Posición del diálogo + chip sobre chip"
    requirement: CAT-03
    verification:
      - kind: other
        ref: "gates: exactamente 2 .update({ sort_order en el organizador; ningún reorden lleva name/price/duration_minutes; D-07 1/2/3 verdes"
        status: pass
    human_judgment: true
    rationale: "El contador, el reseteo al cambiar de categoría y la persistencia tras recargar solo se ven en el navegador"

duration: 6min
completed: 2026-09-16
status: complete
---

# Phase 23 Plan 04: Modos de orden, gates por eje y posición dentro del grupo Summary

**Dos selectores de modo de orden (servicios arriba de la lista, categorías en el organizador) que escriben una sola columna de `businesses`, gates de reorden por eje leídos del estado del padre, filas de categoría pintadas por `sortCategories`, y el segundo mutador de orden (`persistServiceOrder`) con la sección Posición del diálogo Mover.**

## Performance

- **Duration:** ~6 min de ejecución (continuación tras el checkpoint D-11)
- **Started:** 2026-09-16T14:55:17Z
- **Completed:** 2026-09-16T15:01:14Z
- **Tasks:** 3 (checkpoint resuelto por el usuario + 2 tasks de código)
- **Files modified:** 4

## Accomplishments

- **Checkpoint D-11 resuelto por el usuario: "A + 1 sí + 3 sí".** Cambiar de modo escribe una sola columna del negocio. Ningún orden manual viaja en esa sentencia, ni antes ni después.
- `Orden de los servicios` va dentro de la Card de servicios, debajo de `ActiveTabs` y arriba de la lista. Se ve siempre, aunque el organizador esté colapsado o no haya categorías. Lleva la ayuda permanente y, **solo** en el camino de identidad (calculado con `groupCatalog`, sin reimplementar la condición), la línea `Se aplica cuando al menos un servicio tenga categoría.`
- `Orden de las categorías` va dentro del cuerpo del organizador y solo existe si hay al menos una categoría.
- Los dos handlers siguen la misma secuencia: guardan el valor anterior, pintan el nuevo, deshabilitan el Select mientras la escritura está en vuelo y hacen `from('businesses').update({ <modo> }).eq('id', business.id).select('id')`. Si falla o vuelven cero filas: `console.error` con el código, el Select vuelve al valor anterior y aparece el toast `No se pudo guardar el orden. Probá de nuevo.` Si sale bien, no hay toast. El de categorías también limpia los estados del arrastre.
- Los modos viven en el estado de `SettingsClient` y bajan al organizador por props (`categorySortMode`, `setCategorySortMode`, `serviceSortMode`). El organizador ya no lee los modos de `business`.
- `persistServiceOrder` copia a `persistCategoryOrder` sobre `services`: `renumber`, una sentencia por fila con solo `sort_order`, `.eq('business_id')` y `.select('id')`. Una fila con error o con cero filas cuenta como fallo, y el fallo relee con el mismo doble orden del RSC (D-10.2) y muestra `ORDER_REJECT_COPY`.
- Diálogo Mover: la sección `Posición` tiene el contador `{n} de {m}` calculado sobre el borrador, y `Subir`/`Bajar` quedan con `disabled` + `aria-disabled` en los bordes. Al cambiar la categoría del borrador, la posición vuelve al final del grupo destino. Guardar asigna primero la categoría (con `assignServiceCategory`, el valor tal cual) y, si eso sale bien, persiste la posición. Si la asignación falla, el orden no se toca.
- Soltar un chip sobre otro chip, con la posición disponible, asigna la categoría del chip destino por `assignServiceCategory` y lo inserta en el índice de ese chip con `moveWithinList` + `persistServiceOrder`. Sin la posición disponible, solo asigna la categoría.

## Task Commits

1. **Checkpoint D-11** — sin código; respuesta del usuario: "A + 1 sí + 3 sí"
2. **Task 1: Los dos selectores de modo y los gates por eje** — `ae36e76` (feat)
3. **Task 2: La posición dentro del grupo — el segundo mutador de orden** — `543d393` (feat)

## Files Created/Modified

- `app/(dashboard)/settings/settings-client.tsx`: estado de los dos modos, `saveServiceSortMode`, el bloque del selector de servicios con sus ayudas, y las props nuevas del organizador.
- `components/dashboard/categorias-manager.tsx`: selector y handler del modo de categorías, gates desde las props, filas con `sortCategories`, `persistServiceOrder`, la sección Posición y el drop de chip sobre chip con posición.
- `lib/service-categories.ts`: export `sortCategories(categories, mode?)`. `groupCatalog` la usa para su eje de categorías y su comportamiento no cambia.
- `test/service-categories.test.ts`: 6 tests nuevos de `sortCategories`: custom estable, alpha, default, vacías sin mutar la entrada, nombre roto, y la misma regla que `groupCatalog`.

## Decisions Made

- Opción A del checkpoint, tal como la escribe el plan.
- Los handlers de modo usan `.select('id')` y tratan cero filas como fallo. Es más estricto que `selectTheme`, pero es lo que exige "nunca queda mostrando un modo que no se guardó": un update que la RLS filtra vuelve sin error.
- Al elegir una categoría en el borrador (incluso si se vuelve a la de origen), la posición va al final del grupo destino. Es la lectura literal del plan y del UI-SPEC.

## Deviations from Plan

### Decisión del usuario en el checkpoint (no son auto-fixes)

**1. [Checkpoint D-11, punto 1 = sí] Las filas de categoría se pintan según el modo, con `sortCategories` exportada**
- **Found during:** checkpoint previo al Task 1, al leer el código real.
- **Issue:** las filas del organizador se pintaban con `categories.map(...)` en el orden guardado, así que elegir `Alfabético (A-Z)` no las reordenaba (lo espera el paso 4 de la UAT). `groupCatalog` omite las categorías vacías, sus comparadores no se exportan y el plan prohíbe ordenar ad hoc en el panel.
- **Fix:** el usuario respondió "A + 1 sí + 3 sí" y autorizó tocar `lib/service-categories.ts`, que no estaba en `files_modified`. Se exportó `sortCategories(categories, mode)`, que reusa `ordenadas` + `comparadorDeCategorias`. `groupCatalog` ahora la llama, así la regla sigue en un solo lugar. Las flechas y el arrastre usan índices sobre esa misma lista pintada. Con el modo personalizado, el único con controles, esa lista está en orden de `sort_order`.
- **Files modified:** lib/service-categories.ts, test/service-categories.test.ts, components/dashboard/categorias-manager.tsx
- **Verification:** 37/37 en `test/service-categories.test.ts`. Los tests existentes de `groupCatalog` siguen verdes sin tocarlos.
- **Committed in:** `ae36e76`

**2. [Checkpoint D-11, punto 3 = sí] La sección Posición solo aparece fuera del camino de identidad**
- **Found during:** checkpoint previo al Task 1.
- **Issue:** en el camino de identidad (ningún servicio asignado a una categoría, que hoy es el caso de todos los negocios de producción), `groupCatalog` devuelve la lista tal cual y no mira `sort_order`. Un Subir/Bajar habría guardado un orden sin ningún efecto visible, o sea una acción inerte, lo que CAT-05 prohíbe.
- **Fix:** `posicionDisponible = serviceSortMode === 'custom' && groups.some(g => g.categoryId !== null)`, evaluado sobre el estado guardado. Gatea la sección Posición del diálogo y el reorden por chip sobre chip. Sin eso, soltar un chip sobre otro solo asigna la categoría.
- **Files modified:** components/dashboard/categorias-manager.tsx
- **Verification:** tsc limpio y gates de Task 2 verdes. Lo visual queda para la UAT.
- **Committed in:** `543d393`

### Auto-fixed Issues

**3. [Rule 2 - Missing Critical] Cero filas en el update del modo cuenta como fallo**
- **Found during:** Task 1
- **Issue:** el molde `selectTheme` solo mira `error`. Un update que la RLS filtra vuelve sin error y con cero filas, y el Select se habría quedado mostrando un modo que no se guardó.
- **Fix:** `.select('id')` y chequeo de `data.length` en los dos handlers, con reversión y toast.
- **Files modified:** los dos archivos de UI
- **Committed in:** `ae36e76`

---

**Total deviations:** 2 por decisión del usuario en el checkpoint y 1 auto-fix (Rule 2).
**Impact on plan:** los tres cambios cumplen CAT-05 y la UAT del plan. No se agregó ninguna migración ni ningún paquete.

## Issues Encountered

None.

Notas de ejecución:
- **Typecheck:** `./node_modules/.bin/tsc --noEmit` filtrado dio 0 `error TS` después de cada task.
- **Gates del plan:** handler de modo sin `sort_order` ✓ · copy completa (8 tokens) ✓ · ningún control deshabilitado por `sort_mode` ✓ · mutadores de orden en el organizador = 2 ✓ · ningún reorden con name/price/duration_minutes ✓ · D-07 gate 1 (FUERA vacío, DENTRO=1) ✓ · D-07 gate 2 (settings 2/2, organizador 3/1, imports 1, redefiniciones 0) ✓ · D-07 gate 3 (N=1, INSIDE=1) ✓ · migraciones = 41 ✓.
- **Suite completa:** `npx vitest run` salió verde en la primera corrida: 93 archivos, 1251 pasados (piso 1209, antes 1245, +6 nuevos), 4 expected fail, 1 skip. No aparecieron los timeouts de `abono-generation` / `abono-cron`.
- **eslint:** 0 hallazgos en `categorias-manager.tsx`, `lib/service-categories.ts` y `test/service-categories.test.ts`. En `settings-client.tsx` quedan los mismos 11 de la línea de base, todos preexistentes (corridos una línea por el import nuevo). Ninguno es de este plan.
- `package.json` / `package-lock.json` sin cambios.

## UAT visual pendiente

No se abrió un navegador: nada de esto se verificó visualmente. Para probar: `npm run dev`, entrar con `test@forjo.local` / `Forjo1234!` y abrir `/servicios`, en desktop y a 375px.

**Modos y gates (Task 1)**, con tres categorías acomodadas a mano en un orden no alfabético (`Uñas`, `Color`, `Barbería`) y servicios repartidos:
1. `Orden de los servicios` está arriba de la lista, fuera del organizador, y se ve con la Card colapsada.
2. `Orden de las categorías` está dentro de la Card y no aparece sin categorías.
3. Los dos disparadores muestran la etiqueta, nunca `custom`/`alpha`/`price`.
4. **Ida y vuelta (CAT-06):** con categorías en `Alfabético (A-Z)`, las filas se reordenan y los grips y las flechas desaparecen (no quedan grises). De vuelta en `Como las ordené yo`, reaparece exactamente `Uñas, Color, Barbería`. **Recargar** y confirmar.
5. **Ejes por separado:** con categorías en alfabético y servicios en personalizado, los chips conservan su grip. Con servicios en `Por precio (de menor a mayor)` y categorías en personalizado, las filas conservan grip y flechas y los chips lo pierden.
6. Con cero categorías, o con categorías pero ningún servicio asignado, aparece la segunda línea de ayuda bajo el selector de servicios.
7. Offline (DevTools → Network → Offline), cambiar un modo: el Select vuelve al valor anterior y aparece el toast.
8. Empezar un arrastre y cambiar de modo en el medio: al volver a personalizado, ninguna fila queda con borde punteado.

**Nota para quien prueba (punto 2 del checkpoint, a propósito sin cambios):** la lista principal de servicios de la Card (debajo del selector) sale de `useActiveTabs` con el orden guardado, no de `groupCatalog`. El modo de servicios **solo se nota en los chips del organizador**. Que la lista de abajo no cambie al elegir `Alfabético` o `Por precio` es lo esperado en esta fase, no un bug.

**Posición (Task 2)**, con servicios en `Como los ordené yo` y una categoría con 4 servicios:
1. Abrir el diálogo desde el tercer chip: aparece `Posición` con `3 de 4`.
2. `Subir` dos veces: `1 de 4`, y `Subir` queda deshabilitado.
3. `Guardar`: el chip queda primero en su grupo. Recargar: sigue primero.
4. Cambiar la categoría en el borrador: el contador se recalcula sobre el grupo destino y la posición arranca al final.
5. `Guardar`: el servicio queda en la categoría nueva, al final. Recargar y confirmar.
6. Con servicios en `Alfabético (A-Z)`, abrir el diálogo: `Posición` no aparece y la sección de categoría sigue.
7. Volver a `Como los ordené yo`: el orden manual del paso 3 vuelve idéntico.
8. Offline, `Guardar` con un cambio de posición: aparece el toast de orden y se ve el orden guardado.
9. **Camino de identidad (decisión 3):** con categorías creadas pero ningún servicio asignado, el diálogo no muestra `Posición`.
10. Arrastrar un chip sobre otro del mismo grupo (desktop, personalizado): queda en el lugar del chip destino. Recargar y confirmar.

## User Setup Required

None. No hace falta configurar servicios externos. Sin migraciones: es un deploy de app puro.

## Next Phase Readiness

- Phase 23 completa en código (4/4 planes). Falta la UAT visual consolidada de los cuatro planes y la verificación de fase.
- La Phase 24 puede verificar el agrupado con categorías y órdenes creados desde el panel.
- `sortCategories` ya está disponible para la página pública si necesita pintar categorías fuera de `groupCatalog`.

## Self-Check: PASSED

- FOUND: app/(dashboard)/settings/settings-client.tsx, components/dashboard/categorias-manager.tsx, lib/service-categories.ts, test/service-categories.test.ts
- FOUND: ae36e76, 543d393

---
*Phase: 23-el-panel-que-organiza-el-cat-logo*
*Completed: 2026-09-16*
