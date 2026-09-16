---
phase: 23-el-panel-que-organiza-el-cat-logo
fixed_at: 2026-09-16T00:00:00Z
review_path: .planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 23: Reporte de corrección del code review

**Corregido:** 2026-09-16
**Review de origen:** `.planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-REVIEW.md`
**Iteración:** 1

**Resumen:**
- Hallazgos en alcance (critical + warning): 6
- Corregidos: 6
- Salteados: 0
- Los 5 Info (IN-01 a IN-05) quedaron fuera de alcance. IN-05 quedó cubierto en parte: se agregaron tests para las reglas nuevas.

Cada propuesta del REVIEW se tomó como hipótesis. Las seis se confirmaron leyendo el código antes de tocarlo. En WR-02 y WR-03 el fix aplicado **difiere** de la propuesta literal; el motivo está en cada sección.

## Verificación

- **Dónde corrió:** en el checkout principal (`workflow.use_worktrees=false`, rama `main`). Sin worktree: los números se reproducen desde este árbol.
- `./node_modules/.bin/tsc --noEmit` (filtrando `.next/`): 0 errores después de cada fix. Antes se comprobó que tsc detecta errores reales con un archivo trampa, que después se borró.
- `npx vitest run test/catalog-panel.test.ts test/service-categories.test.ts`: 100/100 (eran 79 antes; se sumaron 21 tests de las reglas puras nuevas).
- `npx vitest run` completo: 1278 passed, 4 expected fail, 1 skipped. La primera corrida tiró un "Worker exited unexpectedly" en un archivo; la segunda salió limpia, así que es flaky y no una regresión.
- `eslint` sobre los 4 archivos tocados: 11 errores, todos en `settings-client.tsx` y en líneas que estos fixes no tocan (731-1131 y 1714: `set-state-in-effect`, `immutability`, `purity`). Ya estaban antes.
- Sin migraciones nuevas y sin paquetes nuevos.

Invariantes de la fase, verificadas contra el diff:
1. **Ningún servicio sin categoría desaparece:** WR-04 pasa la lista por `groupCatalog`, que conserva cada servicio exactamente una vez. CR-01 sólo puede convertir un uuid borrado en `null`.
2. **Cambiar el modo escribe sólo esa columna:** no se tocó `saveCategorySortMode` ni `saveServiceSortMode`.
3. **Los reordenamientos renumeran la lista de hermanas completa con `.eq('business_id')`, y 0 filas cuenta como fallo:** no se cambió ningún mutador de orden. La "posición de llegada" de WR-02 escribe una sola fila con `max + 1`, en la misma sentencia que la categoría y acotada por `business_id`, sin renumerar a nadie. Por eso tampoco pisa el arreglo manual en modo alfabético o por precio.

## Fixed Issues

### CR-01: El form de servicio manda el id de una categoría borrada mientras muestra "Sin categoría"

**Archivos modificados:** `lib/catalog-panel.ts`, `test/catalog-panel.test.ts`, `app/(dashboard)/settings/settings-client.tsx`
**Commit:** 1ece2c8
**Status:** fixed
**Fix aplicado:** nuevo helper puro `liveCategoryValue(value, liveIds)`. Si el uuid no está entre las categorías vivas, devuelve `SIN_CATEGORIA`. `addService` y `saveEditService` lo aplican antes de `categoryPatch`, que sigue siendo la única traducción a la columna. Así se escribe lo mismo que muestra el Select. Si se borró la última categoría, el alta vuelve a funcionar sin recargar. Se eligió sanear al escribir, y no un callback `onCategoryDeleted`, porque cubre cualquier camino que deje un uuid colgado y no sólo el borrado desde el organizador.

### WR-01: Una categoría nueva puede aparecer arriba o en el medio en vez de al final

**Archivos modificados:** `lib/catalog-panel.ts`, `test/catalog-panel.test.ts`, `components/dashboard/categorias-manager.tsx`
**Commit:** a861065
**Status:** fixed
**Fix aplicado:** nuevo helper `nextSortOrder(rows)`, que devuelve la posición más alta más uno, o 0 si la lista está vacía. `createCategory` lo usa en lugar de `categories.length`. Hay tests para los casos con huecos (`[2] ⇒ 3`), empate en 0 y lista vacía.

### WR-02: Servicios nuevos o reasignados sin renumerar caen en una posición arbitraria dentro del grupo

**Archivos modificados:** `lib/catalog-panel.ts`, `test/catalog-panel.test.ts`, `app/(dashboard)/settings/settings-client.tsx`, `components/dashboard/categorias-manager.tsx`
**Commit:** fe68385
**Status:** fixed: requires human verification
**Fix aplicado:** nuevo helper `categorySiblings(services, value, liveIds, excludeId?)`. Devuelve los servicios del grupo destino con el mismo reparto que `groupCatalog`: nulos y colgados cuentan como sueltos. Las tres superficies escriben `sort_order = nextSortOrder(hermanas)` **en la misma sentencia** que la categoría:
- el INSERT del alta, siempre;
- el UPDATE de la edición, sólo si la categoría cambia (si no cambia, la posición no se toca);
- `assignServiceCategory`, que usan el drop sobre la fila y el diálogo "Mover …", y actualiza también el espejo en memoria.

**Diferencia con la propuesta:** el REVIEW proponía llamar a `persistServiceOrder([...grupo, id])` después de asignar por fila. No se hizo así por dos razones. Primero, son dos escrituras y abren la ventana de fallo parcial que D-10.2 prohíbe. Segundo, `idsDelGrupoDestino` usa el orden **visible**: con un modo alfabético o por precio, renumerar desde ese orden destruiría el orden manual del grupo destino (CAT-06). `max + 1` en la misma fila no renumera a nadie y vale en cualquier modo. Los caminos que eligen una posición explícita (el diálogo y el drop sobre un chip) siguen aplicándola después con `persistServiceOrder`, como antes.

### WR-03: Soltar un chip sobre otro chip nunca lo lleva al último lugar, y "bajar uno" no hace nada

**Archivos modificados:** `lib/catalog-panel.ts`, `test/catalog-panel.test.ts`, `components/dashboard/categorias-manager.tsx`
**Commit:** 094f7be
**Status:** fixed: requires human verification
**Fix aplicado:** nuevos helpers `placeOnTarget(groupIds, movedId, targetId)` y `sameOrder(a, b)`.
- **Mismo grupo visible:** `placeOnTarget` usa `moveWithinList(grupo, from, índice del destino)`, igual que las filas. Con `[A,B,C]`, A sobre B da `[B,A,C]` y A sobre C da `[B,C,A]`.
- **Otro grupo:** inserta en el índice del destino.
- Si la categoría no cambia y el orden resultante es igual al actual, no se escribe nada.
- Dentro del mismo grupo visible ya no se escribe la categoría. Antes, un destino con categoría colgada rebotaba con 23503.

**Corrección sobre el REVIEW:** IN-05 dice que el diálogo "Mover …" comparte el defecto. No lo comparte: ahí `draftPos` es el índice dentro del grupo completo y `moveWithinList([...base, id], base.length, draftPos)` produce la posición correcta (con `[A,B,C]` y Bajar da `[B,A,C]`). Por eso no se tocó `confirmMove`.

### WR-04: La lista de servicios bajo el selector "Orden de los servicios" ignora el modo y queda intercalada después de reordenar

**Archivos modificados:** `app/(dashboard)/settings/settings-client.tsx`
**Commit:** f232b1a
**Status:** fixed: requires human verification
**Fix aplicado:** `manageableServices` pasa por `groupCatalog(..., serviceCategories, { categories: categorySortMode, services: serviceSortMode }).flatMap(g => g.services)`, con los dos modos y las categorías en las deps del `useMemo`. `useActiveTabs` filtra conservando el orden, así que la Card de servicios muestra el mismo orden que la página pública y reacciona al cambio de modo sin recargar. Se usó la opción principal del REVIEW. No se movió el selector al organizador porque es un cambio de diseño que no le toca decidir al fixer.

**Residual conocido, sin arreglar:** en el camino de identidad (ninguna categoría con servicios, por ejemplo después de borrar todas), `groupCatalog` devuelve la lista como llegó del RSC, ordenada globalmente por `sort_order`. Si antes hubo reordenamientos por grupo, ese orden puede quedar intercalado. Arreglarlo implicaría ordenar fuera de `groupCatalog` o cambiar la lectura del RSC, y las dos cosas contradicen D-08/CAT-07. Queda como decisión de producto.

### WR-05: Escribir en el reorden de categorías con una lista vieja convierte cambios concurrentes en errores o los pisa

**Archivos modificados:** `components/dashboard/categorias-manager.tsx`
**Commit:** 231ce5d
**Status:** fixed: requires human verification
**Fix aplicado:**
- `persistCategoryOrder` ya no reemplaza la lista entera. El optimista y la reversión sin relectura son `setCategories(prev => prev.map(...))` y mergean **sólo la posición** por id, así un alta o un renombrado confirmados en el medio no se pierden.
- Con el reorden en vuelo (`savingOrder`), "Agregar" y "Eliminar" quedan deshabilitados (`disabled` + `aria-disabled`).
- `createCategory` también corta con un guard en la función: el botón es la señal y el guard es la defensa. Un Enter en el campo durante el reorden no hace nada, sin aviso. La ventana dura lo que tarda el guardado.

## Qué necesita confirmación visual (sin navegador en esta corrida)

1. **CR-01:** elegir una categoría en el alta, borrarla desde el organizador y dar de alta. Tiene que guardarse "Sin categoría" sin toast de error, también si era la última categoría.
2. **WR-01:** con `[A, B, C]`, borrar A y B y crear D. D tiene que aparecer debajo de C, en el panel y en `/[slug]`.
3. **WR-02:** dar de alta, editar la categoría y soltar un chip sobre una fila. En los tres casos el servicio tiene que quedar **último** en su grupo nuevo, también después de recargar.
4. **WR-03:** en modo "Como los ordené yo" con agrupación, soltar A sobre B y sobre C dentro del mismo grupo (tiene que bajar uno y llegar al final), y soltar sobre un chip de otro grupo.
5. **WR-04:** cambiar "Orden de los servicios" a Alfabético y a Por precio. La lista de abajo tiene que reordenarse al instante, agrupada por categoría. Después de reordenar y recargar no puede quedar intercalada.
6. **WR-05:** mientras se guarda un reorden de categorías, los botones Eliminar y Agregar tienen que verse deshabilitados. Conviene confirmar que el estado disabled se lee bien en los temas claro y oscuro.

---

_Corregido: 2026-09-16_
_Fixer: Claude (gsd-code-fixer)_
_Iteración: 1_
