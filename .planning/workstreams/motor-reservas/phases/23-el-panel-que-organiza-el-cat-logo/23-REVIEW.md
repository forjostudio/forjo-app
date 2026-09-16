---
phase: 23-el-panel-que-organiza-el-cat-logo
reviewed: 2026-09-16T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - app/(dashboard)/servicios/page.tsx
  - app/(dashboard)/settings/settings-client.tsx
  - components/dashboard/categorias-manager.tsx
  - lib/catalog-panel.ts
  - lib/service-categories.ts
  - test/catalog-panel.test.ts
  - test/service-categories.test.ts
findings:
  critical: 1
  warning: 5
  info: 5
  total: 11
status: issues_found
---

# Phase 23: Code Review Report

**Reviewed:** 2026-09-16
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Revisé el organizador del catálogo (`categorias-manager.tsx`), las reglas puras (`lib/catalog-panel.ts`, `sortCategories` en `lib/service-categories.ts`), la integración en `settings-client.tsx` (solo el diff de la fase y lo que toca), la lectura de `/servicios` y los tests.

Las tres invariantes centrales se cumplen:
1. **Un servicio sin categoría nunca desaparece:** `groupCatalog` conserva cada servicio, y al borrar una categoría el espejo en memoria pasa por `categoryPatch(SIN_CATEGORIA)`.
2. **Cambiar el modo escribe solo esa columna:** `saveCategorySortMode` y `saveServiceSortMode` hacen `update({ <modo> })` y nada más. Las dos columnas quedan fuera del trigger `businesses_protect_admin_columns`, así que no se revierten en silencio.
3. **Reordenar renumera la lista de hermanas completa:** cada update va acotado por `.eq('business_id')` + RLS, y si vuelven 0 filas cuenta como fallo, con relectura.

Tenant scoping: todas las escrituras llevan `.eq('business_id', business.id)` (las de `businesses` van por `.eq('id', business.id)` + RLS del dueño). No encontré fugas entre tenants.

Los defectos son de **corrección del estado y del orden**:
- El form de alta puede mostrar "Sin categoría" y a la vez mandar el id de una categoría borrada. Eso bloquea el alta hasta recargar.
- Las nuevas filas (categorías y servicios) entran en posiciones arbitrarias.
- Soltar un chip sobre otro chip no puede llevarlo al último lugar.
- La lista de servicios que está justo debajo del selector "Orden de los servicios" no respeta ni el modo ni los grupos, y después de reordenar queda intercalada.

## Critical Issues

### CR-01: El form de servicio manda el id de una categoría borrada mientras muestra "Sin categoría"

**File:** `app/(dashboard)/settings/settings-client.tsx:1406`, `:2871-2885`, `:2980-2993`; `components/dashboard/categorias-manager.tsx:330-344`
**Issue:** `newService.category` guarda el uuid que eligió el dueño. Si después borra esa categoría desde el organizador (misma pantalla, sin recargar), `deleteCategory` actualiza `serviceCategories` y `services`, pero **no** el borrador del alta. Pasan dos cosas:
- Si quedan otras categorías, el `SelectValue` usa el fallback `?? 'Sin categoría'` y muestra "Sin categoría", pero el valor sigue siendo el uuid borrado. Al guardar, `categoryPatch` escribe ese uuid, la FK compuesta rechaza con 23503 y el dueño ve "Esa categoría ya no existe. Recargá la página y elegí otra.", con un control que dice que no eligió ninguna.
- Si era la última categoría, `serviceCategories.length > 0` oculta el Select. No queda ningún control para corregir el valor, y **todas** las altas fallan hasta recargar.

La UI muestra un valor y escribe otro, y el flujo principal (dar de alta un servicio) queda bloqueado.
**Fix:** sanear el valor al escribir, contra las categorías vivas, y/o resetear el borrador al borrar:
```tsx
// settings-client.tsx, addService / saveEditService
const categoriaVigente = (v: string) =>
  v !== SIN_CATEGORIA && !serviceCategories.some(c => c.id === v) ? SIN_CATEGORIA : v
...categoryPatch(categoriaVigente(newService.category))
```
Si no, exponer un callback `onCategoryDeleted(id)` desde `CategoriasManager` que haga `setNewService(f => f.category === id ? { ...f, category: SIN_CATEGORIA } : f)`. El mismo saneo va en `editSvcForm`.

## Warnings

### WR-01: Una categoría nueva puede aparecer arriba o en el medio en vez de al final

**File:** `components/dashboard/categorias-manager.tsx:254`
**Issue:** `sort_order: categories.length` supone que las posiciones son 0..n-1 sin huecos. Borrar deja huecos. Ejemplo: con `[A:0, B:1, C:2]`, borrar A y B deja `[C:2]`, y la nueva D se inserta con `sort_order: 1`. `sortCategories` (modo custom) la pinta **antes** que C, en pantalla y en la página pública. El dueño agrega una categoría y la ve aparecer arriba de otra.
**Fix:**
```ts
const siguiente = categories.reduce((m, c) => Math.max(m, c.sort_order ?? 0), -1) + 1
.insert({ business_id: business.id, name, sort_order: siguiente })
```

### WR-02: Servicios nuevos o reasignados sin renumerar caen en una posición arbitraria dentro del grupo

**File:** `app/(dashboard)/settings/settings-client.tsx:1406`; `components/dashboard/categorias-manager.tsx:482-493`
**Issue:** en un grupo ya renumerado (0..n-1), estos caminos dejan un `sort_order` que no corresponde al grupo destino:
- El alta con categoría no manda `sort_order`, así que la base pone 0. El servicio empata con el primero del grupo y queda **segundo** (desempate por orden de llegada o `created_at`), no al final.
- La edición del form y `dropServiceOn` (soltar un chip sobre la **fila** de una categoría) llaman solo a `assignServiceCategory`. El servicio arrastra el `sort_order` de su grupo anterior y aterriza en cualquier lugar del nuevo, aunque `posicionDisponible` sea true.

El diálogo "Mover …" sí renumera. Resultado: tres caminos para asignar categoría y tres posiciones de llegada distintas.
**Fix:** en modo custom con agrupación, después de asignar por fila, llamar a `persistServiceOrder([...idsDelGrupoDestino(value, service), service.id])`, como hace `confirmMove`. En el alta y la edición con cambio de categoría, mandar `sort_order: max(sort_order del grupo destino) + 1` dentro del mismo INSERT/UPDATE.

### WR-03: Soltar un chip sobre otro chip nunca lo lleva al último lugar, y "bajar uno" no hace nada

**File:** `components/dashboard/categorias-manager.tsx:508-510`
**Issue:** `base` excluye el servicio arrastrado y `lista = moveWithinList([...base, service.id], base.length, base.indexOf(target.id))`, así que el servicio siempre se inserta **antes** del chip destino. Con `[A, B, C]`:
- Soltar A sobre B da `[A, B, C]`: no cambia nada, pero igual escribe N updates.
- Soltar A sobre C da `[B, A, C]`.

No hay ningún drop de chip que deje A último. Soltar sobre la fila tampoco sirve: en el mismo grupo es un no-op. Esto no es consistente con el arrastre de filas de categoría, donde `moveWithinList(ids, from, target)` sí permite bajar y llegar al final.
**Fix:** dentro del mismo grupo, usar los índices del grupo visible (`from = indiceActual(service)`, `to = índice de target`) con `moveWithinList(idsDelGrupoCompleto, from, to)`, que es la misma semántica que las filas. Entre grupos, mantener "insertar en el índice del destino". Además, cortar antes de escribir si la lista resultante es igual a la actual.

### WR-04: La lista de servicios bajo el selector "Orden de los servicios" ignora el modo y queda intercalada después de reordenar

**File:** `app/(dashboard)/servicios/page.tsx:24` (orden por `sort_order, created_at`); `app/(dashboard)/settings/settings-client.tsx:2603-2640`
**Issue:** el selector se pinta arriba de la Card de servicios (`visibleServices.map`), pero esa lista no pasa por `groupCatalog` ni por el modo. Toma el orden del arreglo de estado, que es:
- el del RSC, que ahora es **global** por `sort_order`;
- con los `push` del alta al final.

Como `persistServiceOrder` renumera **por grupo** desde 0, después de reordenar y recargar la lista queda intercalada (`Color#0, Uñas#0, Barbería#0, Color#1…`): no es ni el orden de antes (`created_at`) ni el de los grupos. Si el dueño elige "Alfabético" o "Por precio", la lista que tiene debajo no cambia. Lo mismo pasa si después borra todas las categorías: el camino de identidad devuelve ese orden intercalado, no el que tenía antes.
**Fix:** ordenar `manageableServices` con la misma regla, por ejemplo `groupCatalog(manageableServices, serviceCategories, { categories: categorySortMode, services: serviceSortMode }).flatMap(g => g.services)` antes de `useActiveTabs`. Otra opción: mover el selector al organizador y dejar la lista en `created_at`.

### WR-05: Escribir en el reorden de categorías con una lista vieja convierte cambios concurrentes en errores o los pisa

**File:** `components/dashboard/categorias-manager.tsx:364-397`
**Issue:** `persistCategoryOrder` captura `antes = categories` y hace `setCategories(...)` **no funcional**. Ni el alta ni el borrado se bloquean mientras `savingOrder` está en true. Hay dos casos:
- **Borrar durante un reorden en vuelo:** el update de la fila borrada vuelve con 0 filas y se trata como fallo. Aparece el toast "No se pudo guardar el orden", aunque el resto del orden sí se guardó.
- **Alta durante el reorden:** si además falla la relectura, `setCategories(antes)` borra de la pantalla la categoría recién creada, aunque existe en la base.
**Fix:** deshabilitar "Agregar" y "Eliminar" mientras `savingOrder` está en true, y usar `setCategories(prev => …)` para el optimista y la reversión, mergeando por id en vez de reemplazar la lista entera.

## Info

### IN-01: El tope de 120 caracteres de la descripción es solo del cliente

**File:** `app/(dashboard)/settings/settings-client.tsx:2894`, `:2997`
**Issue:** `maxLength={120}` es el único límite. `services.description` no tiene un `CHECK` de longitud en `schema.sql`, así que una escritura directa por PostgREST con la sesión del dueño guarda cualquier largo. El impacto es acotado: son datos propios y la tarjeta los recorta a dos líneas.
**Fix:** agregar `CHECK (char_length(description) <= 120)` en una migración futura (080+) si el tope es contrato del producto.

### IN-02: Un error de renombrado puede aparecer en la fila equivocada

**File:** `components/dashboard/categorias-manager.tsx:172-176`, `:305`
**Issue:** `renameError` es un único slot que se pinta en la fila `renamingId`. Si el blur de la fila 1 dispara `saveRename(c1)` y el dueño abre la fila 2 antes de que vuelva la respuesta, un rechazo de c1 (por ejemplo, duplicado) se muestra debajo de c2.
**Fix:** guardar el error como `{ id, message }` y pintarlo solo si `id === c.id`.

### IN-03: Doble Enter en el alta de categoría muestra "Ya tenés una categoría con ese nombre"

**File:** `components/dashboard/categorias-manager.tsx:248`, `:900`
**Issue:** el guard `if (creating) return` lee estado de la clausura. Dos Enter antes del re-render mandan dos INSERT: el segundo rebota con 23505 y pinta el error de duplicado sobre una alta que salió bien.
**Fix:** usar un `useRef` como guard síncrono (`creatingRef.current`).

### IN-04: El Label "Categoría (opcional)" no está asociado a su control

**File:** `app/(dashboard)/settings/settings-client.tsx:2873`, `:2982`
**Issue:** `<Label>` no tiene `htmlFor` y el `SelectTrigger` no tiene `id`, así que el lector de pantalla anuncia el disparador sin nombre. La descripción sí usa `useId`.
**Fix:** `const newSvcCatId = useId()` → `<Label htmlFor={newSvcCatId}>` + `<SelectTrigger id={newSvcCatId}>` (y lo mismo en la edición).

### IN-05: Los tests no cubren la regla que produce los bugs de posición

**File:** `test/catalog-panel.test.ts`
**Issue:** se testean `renumber` y `moveWithinList` sueltos, pero no la construcción `moveWithinList([...base, id], base.length, to)` que usan el arrastre de chips y el diálogo (WR-03), ni el cálculo del `sort_order` de una alta (WR-01). Los dos defectos pasan con la suite en verde.
**Fix:** extraer a `lib/catalog-panel.ts` una función pura `insertIntoGroup(groupIds, serviceId, targetIndex)` y `nextSortOrder(rows)`, y testear los casos "al último", "bajar uno" y "con huecos".

---

_Reviewed: 2026-09-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
