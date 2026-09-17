---
phase: 23-el-panel-que-organiza-el-cat-logo
reviewed: 2026-09-17T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - app/(dashboard)/settings/settings-client.tsx
  - app/[slug]/booking-client.tsx
  - components/booking/service-description.test.tsx
  - components/booking/service-description.tsx
  - components/dashboard/categorias-manager.test.tsx
  - components/dashboard/categorias-manager.tsx
  - components/landing/services.tsx
  - lib/catalog-panel.ts
  - test/catalog-panel.test.ts
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 23: Code Review Report

**Reviewed:** 2026-09-17
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Se revisó el diff `41a69ba..HEAD` de los 9 archivos: los fixes del review anterior (CR-01, WR-01..WR-05) y los planes de cierre de gaps 23-05 (`ServiceDescription` + tarjeta del booking como contenedor con botón estirado + web de marca), 23-06 (`chipDragGates`/`chipDropIntent`, soltar en el propio grupo no hace nada) y 23-07 (renglón de descripción + link en la tarjeta de `/servicios`, copy de ayuda).

Verificación: `./node_modules/.bin/tsc --noEmit` sale con 0 y los 3 archivos de test de la fase pasan (86/86).

Los fixes del review anterior están bien. `liveCategoryValue` sanea el alta y la edición, `nextSortOrder` + `categorySiblings` reemplazan bien a `length`, la reversión del reorden mergea por id y el listado respeta `groupCatalog`. Todas las escrituras siguen acotadas por `.eq('business_id', business.id)` y la FK compuesta sigue siendo la barrera del tenant. La descripción se pinta como texto (React la escapa, cubierto por test). No encontré regresiones de aislamiento multi-tenant ni de seguridad.

Quedan dos defectos de lógica en el organizador:
1. El drop "place" (chip sobre chip) no recibió el arreglo de categoría colgada que sí recibió la rama "assign".
2. La guarda `savingServiceOrder` es chequear-y-después-usar: un orden elegido por el dueño se puede descartar en silencio.

## Warnings

### WR-01: Soltar un chip sobre otro con posición disponible sigue usando el `category_id` del destino, no su grupo visible

**File:** `components/dashboard/categorias-manager.tsx:545-556`
**Issue:** En G-23-10a la rama `'assign'` pasó a usar `grupoDestino = grupoVisibleDe(target.id)`. Así, un destino con una categoría colgada (pintado entre los sueltos) asigna "Sin categoría" en vez de rebotar con 23503. El comentario de la línea 539-540 lo dice explícitamente. La rama `'place'` (modo personalizado con agrupación) hace otra cosa: calcula `const destino = fromCategoryId(target.category_id)`.

Pasa esto cuando el destino es un suelto con categoría colgada y el servicio arrastrado viene de otra categoría:
- `mismoGrupo` es `false` y `cambiaCategoria` es `true`.
- `idsDelGrupoDestino(destino, service)` devuelve `[]` (el uuid colgado no está en `serviciosPorCategoria`).
- `assignServiceCategory(service, <uuid colgado>)` escribe un uuid inexistente, la base lo rechaza con 23503 y el dueño ve "Esa categoría ya no existe. Recargá la página…".

El dueño soltó el chip sobre un servicio que en pantalla está en "Sin categoría". Si la base lo aceptara, la lista a renumerar (`[service]`) tampoco sería la del grupo donde lo soltó. Es exactamente la clase de bug que 23-06 decía cerrar, pero cerrada sólo en una de las dos ramas.
**Fix:** Usar el grupo visible ya calculado como destino en las dos ramas:
```tsx
resetDrag()
const service = services.find(s => s.id === serviceId)
if (!service || service.id === target.id || assigning || savingServiceOrder) return true
const destino = grupoDestino // no fromCategoryId(target.category_id)
```
`idsDelGrupoDestino(SIN_CATEGORIA, service)` devuelve `sueltos`, así que el orden también sale del grupo correcto. Conviene sumar un test del intent/destino con un servicio con categoría colgada.

### WR-02: `persistServiceOrder` puede descartar en silencio el orden de "Mover …" o de un drop con posición

**File:** `components/dashboard/categorias-manager.tsx:453-454, 559-564, 669-687`
**Issue:** `persistServiceOrder` arranca con `if (savingServiceOrder) return`: sale sin toast y sin valor de retorno. Los dos callers compuestos (`confirmMove` y la rama `'place'` de `dropServiceOnChip`) chequean `savingServiceOrder` ANTES de `await assignServiceCategory(...)` y llaman a `persistServiceOrder` DESPUÉS de ese await.

`confirmMove` no mira `assigning`, y el chip sigue clickeable mientras un drop está en vuelo, así que se puede dar esta secuencia:
1. Un drop "place" de X está en la fase de asignar (`assigning=true`, `savingServiceOrder=false`).
2. El dueño abre "Mover" sobre Y y confirma una categoría + posición.
3. Las dos cadenas llegan a `persistServiceOrder`. La segunda encuentra `savingServiceOrder=true` y retorna.

`confirmMove` cierra el diálogo como si hubiera guardado, pero la posición elegida nunca se escribió. Y ya se escribió la llegada al final (`assignServiceCategory`), así que el servicio queda en un lugar distinto al que el dueño eligió y sin ningún aviso. Además, cada cadena calculó su lista sobre el `groups` anterior a la otra, así que la que sí escribe puede renumerar un grupo al que le falta el servicio de la otra y dejar empates de `sort_order`.
**Fix:** Que un orden no guardado nunca pase por éxito, y serializar los tres caminos de escritura de servicios con una sola bandera:
```tsx
async function persistServiceOrder(idsEnOrden: string[]): Promise<boolean> {
  if (savingServiceOrder) { toast.error(ORDER_REJECT_COPY); return false }
  // ...
}
// y en confirmMove / openMove:
if (!moving || savingMove || savingServiceOrder || assigning) return
```
Otra opción: un único `busyRef` (ref, no estado, para que la guarda no lea un closure viejo) que tomen `dropServiceOn`, `dropServiceOnChip` y `confirmMove` antes del primer await y liberen en `finally`.

## Info

### IN-01: Soltar en el propio grupo sin modo personalizado sigue anunciando un drop válido

**File:** `components/dashboard/categorias-manager.tsx:131-135, 773-786, 920-928`
**Issue:** 23-06 quitó el resaltado de la fila propia cuando `chipDropIntent` da `'none'`. Pero tanto el `onDragOver` del chip como el de la fila/sueltos siguen llamando `e.preventDefault()` sin condición. El navegador muestra el cursor de "mover" (drop aceptado) justo donde el drop no hace nada, que es la sensación de "roto" que D-12 aplicado al destino quería evitar.
**Fix:** Cuando el intent es `'none'`, poner `e.dataTransfer.dropEffect = 'none'`. Para el chip, pasarle el intent o un `canDropHere` por prop.

### IN-02: Si la asignación se guardó pero el reorden falla y tampoco se puede releer, el estado local queda distinto de la base

**File:** `components/dashboard/categorias-manager.tsx:458, 472-476`
**Issue:** En `confirmMove`/drop "place", `assignServiceCategory` ya escribió `category_id` + `sort_order` de llegada y lo espejó en memoria. Después, `persistServiceOrder` toma `antes` del closure de `services`, que es anterior a la asignación. Si el update falla Y la relectura falla, la reversión le vuelve a poner al servicio movido su `sort_order` del grupo VIEJO pero conserva la categoría nueva. Ese par no existe en la base (que tiene la posición de llegada). Es un doble fallo y la próxima carga lo corrige, pero la promesa de "se pinta lo que está guardado" no se cumple.
**Fix:** Para el servicio recién asignado, revertir a la posición de llegada, o forzar `router.refresh()` en esa rama.

### IN-03: El link "Editar descripción" abre el diálogo completo sin llevar al campo

**File:** `app/(dashboard)/settings/settings-client.tsx:2762-2769`
**Issue:** El nombre accesible es "Editar descripción de X" / "Agregar descripción a X", pero el botón llama a `openEditService(s)`, igual que el lápiz. El foco queda al principio del diálogo, y en mobile el textarea de la descripción queda más abajo, dentro de un cuerpo con scroll. Un lector de pantalla anuncia una acción más específica que la que ocurre, y el dueño tiene que buscar el campo.
**Fix:** Pasar una opción (`openEditService(s, { focus: 'description' })`) y enfocar/scrollear el `Textarea` de `editSvcDescId` al abrir. Si no, alinear la etiqueta con lo que hace ("Editar X").

### IN-04: En la tarjeta del booking, pasar el mouse por "Ver más" pinta el hover de selección

**File:** `app/[slug]/booking-client.tsx:590-599, 640-646`
**Issue:** `hover:border-primary` vive en el contenedor, así que pasar el puntero por el toggle "Ver más" (que NO selecciona) tiñe el borde igual que al apuntar la zona de selección. Además, el pseudo-elemento `after:absolute` del botón cubre el párrafo de la descripción, así que ese texto no se puede seleccionar ni copiar (cualquier arrastre del mouse arranca una selección de servicio). Ninguna de las dos cosas rompe el flujo, pero la señal visual dice "esto elige el servicio" donde no lo hace.
**Fix:** Mover el hover al botón: `has-[button:not([data-toggle]):hover]:border-primary` en el contenedor, o `group` + `group-hover` sobre el botón de selección. Opcional: `select-text` + `relative z-10` en el párrafo si se quiere que la descripción sea copiable (a costa de que tocar el texto ya no seleccione).

---

_Reviewed: 2026-09-17_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
