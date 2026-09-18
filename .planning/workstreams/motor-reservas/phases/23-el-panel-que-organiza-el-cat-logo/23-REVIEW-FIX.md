---
phase: 23-el-panel-que-organiza-el-cat-logo
fixed_at: 2026-09-18T00:00:00Z
review_path: .planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-REVIEW.md
iteration: 2
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
passes:
  - id: 1
    fixed_at: 2026-09-16
    scope: "pasada 1 — CR-01 + WR-01..WR-05 (planes 23-01..23-07)"
    findings_in_scope: 6
    fixed: 6
    skipped: 0
    status: all_fixed
  - id: 2
    fixed_at: 2026-09-18
    scope: "pasada incremental 23-08 / G-23-20 — WR-03, WR-04"
    findings_in_scope: 2
    fixed: 2
    skipped: 0
    status: all_fixed
---

# Phase 23: Reporte de corrección del code review

> Este archivo tiene **dos pasadas**. La pasada 1 (abajo) cubre los planes 23-01..23-07 y quedó
> tal como se escribió el 2026-09-16. La **pasada 2** (al final del archivo, después del separador)
> cubre sólo el plan 23-08 / G-23-20. Ninguna pisa a la otra.

## Pasada 1 — planes 23-01..23-07

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

---
---

## Pasada 2 — plan 23-08 / G-23-20 (WR-03, WR-04)

**Corregido:** 2026-09-18
**Review de origen:** sección `## Pasada incremental — 23-08 (G-23-20)` de `23-REVIEW.md`
**Iteración:** 2
**Archivo tocado:** `app/(dashboard)/settings/settings-client.tsx` (único)

**Resumen:**
- Hallazgos en alcance (critical + warning de esta pasada): 2
- Corregidos: 2
- Salteados: 0
- Los 4 Info de esta pasada (IN-05..IN-08) quedan **abiertos**, fuera de alcance.
- Los hallazgos de la pasada 1 que seguían abiertos (WR-01, WR-02, IN-01..IN-04) **siguen abiertos**:
  no se tocó `components/dashboard/categorias-manager.tsx` ni `app/[slug]/booking-client.tsx`.

### Verificación

- **Dónde corrió:** en el **checkout principal** (`workflow.use_worktrees=false`, rama `main`). Sin
  worktree, así que los números se reproducen desde este mismo árbol.
- `./node_modules/.bin/tsc --noEmit`: **0 líneas `error TS`** fuera de `.next/`, leído de la salida
  (no del exit code: en este repo `npx tsc` sale 0 aunque haya errores).
- `./node_modules/.bin/eslint "app/(dashboard)/settings/settings-client.tsx"`: **11 errores** antes y
  **11 después**, exactamente el piso preexistente. Medido antes de tocar nada.
- `npm test`: **95 archivos, 1301 passed, 4 expected fail, 1 skipped**. Idéntico al piso.
- `npm run build`: **✓ Compiled successfully**, 61/61 páginas estáticas generadas.
- Sin paquetes nuevos y sin migraciones.

**Medición propia de la grilla (Chrome headless, no derivación de escritorio).** Antes de elegir la
forma del fix armé una réplica de la tarjeta con la misma grilla
(`grid-template-columns: minmax(0,1fr) auto`, `align-items:center`, `gap:8px`), los mismos hijos en
el mismo orden de DOM y las mismas condiciones de render, y medí en qué fila cae cada item leyendo
`gridTemplateRows` computado. Tres variantes × cinco configuraciones:

| Configuración | Filas izquierda | `row-start-3` (antes) | fila dinámica (aplicada) |
|---|---|---|---|
| individual, sin sedes, sin cobertura | 2 | fila 3 ✅ nada debajo | fila 3 ✅ |
| individual, con sedes, con cobertura | 4 | fila 3 ❌ **cobertura debajo** | fila 4 ✅ |
| **compartido, sin sedes, sin cobertura** | 4 | fila 3 ❌ **cupo debajo** | fila 4 ✅ |
| compartido, con sedes, sin cobertura | 5 | fila 3 ❌ cupo + sedes debajo | fila 5 ✅ |
| compartido, con sedes, con cobertura | 6 | fila 3 ❌ cupo + sedes + cobertura debajo | fila 6 ✅ |

El defecto es **peor que lo que decía el REVIEW**: no hace falta multi-staff con sedes, alcanza con
**cupo compartido solo** (fila 3 de la tabla) para que el stepper quede debajo de los botones. El
único caso sano era la tarjeta mínima. Con la fila dinámica, las acciones caen en la última fila en
las cinco configuraciones y ningún hijo de contenido queda por debajo.

### Fixed Issues

#### WR-03: en desktop las acciones quedaban ancladas a la fila 3 con contenido debajo

**Archivos modificados:** `app/(dashboard)/settings/settings-client.tsx`
**Commit:** `13629dd`
**Status:** fixed
**Fix aplicado:** se deriva la fila dentro del `map`, con los booleanos que ya existían en ese scope:

```tsx
const leftRows = 2
  + (capMode !== 'individual' ? 2 : 0)
  + (activeLocations.length > 0 ? 1 : 0)
  + (showCoverage ? 1 : 0)
const actionsRow = Math.max(3, leftRows)
```

y el bloque de acciones pasó de `sm:row-start-3` a
`style={{ ['--actions-row']: actionsRow } as CSSProperties}` +
`sm:[grid-row-start:var(--actions-row)]`.

`Math.max(3, …)` **verificado, no asumido**: `leftRows` nunca baja de 2 (nombre y descripción son
incondicionales), y el piso de 3 es el que mantiene las acciones por debajo del precio (fila 1) y de
la duración (fila 2) en la tarjeta mínima. Medido: en esa configuración la fila medida es 3 y la
última fila de contenido es la 2.

Cosas que verifiqué en vez de asumirlas:

1. **La variable CSS llega intacta.** React, para claves que empiezan con `--`, usa
   `style.setProperty(name, value)` y **no** le agrega `px` a los números — leído en el runtime
   instalado (`node_modules/react-dom/cjs/react-dom-client.development.js`, rama `isCustomProperty`,
   y la rama equivalente del render de servidor, que concatena `("" + value).trim()`). Por eso el
   número va como número y no hace falta `String()`.
2. **Tailwind emite la clase.** No había precedente de propiedad arbitraria en el repo, así que lo
   medí sobre el CSS construido: la regla emitida es
   `.sm\:\[grid-row-start\:var\(--actions-row\)\]{grid-row-start:var(--actions-row)}`.
3. **Mobile no cambia.** Esa regla queda **dentro** de `@media (min-width:40rem)` (verificado
   contando llaves desde la apertura del `@media` hasta la regla). Por debajo de 640px la tarjeta
   sigue siendo `flex flex-col` y la variable queda sin consumir.
4. **Prohibiciones del plan respetadas:** no se reordenó el DOM (las acciones siguen siendo el último
   hijo), no se envolvió ningún hijo existente, el rótulo del modo y `CapacityInlineControl` siguen
   en la columna izquierda con la invariante de 32px de G-04 intacta, y `pt-4 border-t
   border-border/60 sm:pt-0 sm:border-t-0` (divisoria + zona de exclusión de 24px de mobile) quedó
   igual. No se tocó el diálogo de edición, ni el alta, ni ningún camino de escritura sobre
   `services`.

**Alternativa más simple que medí y descarté (con motivo).** Borrar `sm:row-start-3` y no poner nada
también funciona: por el cursor de auto-colocación de CSS Grid (§8.5), un item con columna definida y
fila automática que es el último del DOM cae en la fila del último hermano de la columna 1. Lo medí y
dio **idéntico** a la fila dinámica en las cinco configuraciones. Lo descarté igual por dos razones:

- El modo de falla es **silencioso y es exactamente el defecto de hoy**: cualquier motor que reinicie
  el cursor colocaría las acciones en el primer hueco libre de la columna derecha, que es la fila 3.
  Acá sólo puedo medir Blink; no tengo Gecko ni WebKit para confirmarlo.
- La fila dinámica **degrada a esa misma alternativa**: si la variable faltara, `grid-row-start` cae
  en `auto`, o sea el comportamiento medido como correcto. Es decir, es estrictamente mejor o igual.
- Además el comentario de la región ya tenía escrito el contrato "cada hijo de la columna derecha
  declara su columna **y** su fila, o la tarjeta se desarma sola". La fila dinámica lo respeta; la
  alternativa implícita lo contradice.

**Comentario extra actualizado en este mismo commit** (no es WR-04, es el comentario que el propio
fix vuelve falso): el bloque que decía que las acciones quedan "ancladas a la TERCERA fila" ahora
dice que cierran la tarjeta en la última y apunta a `actionsRow`.

#### WR-04: comentarios que describían el layout viejo

**Archivos modificados:** `app/(dashboard)/settings/settings-client.tsx`
**Commit:** `cdf0c79`
**Status:** fixed
**Fix aplicado:** diff de comentarios puro — **0 líneas de código tocadas** (verificado sobre el diff
antes de commitear). Los tres que marcaba el REVIEW:

1. *"…y la primera fila queda idéntica a como estaba"* → ahora dice que en desktop el padding y el
   borde se resetean a cero, la separación la da el ritmo de la grilla y el bloque no comparte
   renglón con el nombre: se va a la última fila de la columna derecha.
2. *"El modo de cupo entra acá como TERCER dato —mismo registro que duración y precio—"* → ahora
   aclara que es el tercer dato del **renglón de mobile**, donde la duración y el precio siguen
   estando, y que en desktop el modo queda como único dato de esa línea.
3. *"…y esta fila se ve igual que siempre"* → ahora dice que el **grupo** se ve igual que siempre,
   pero en la última fila de la columna en vez de compartir la primera con el nombre.

**Párrafo ORDEN DE FOCO (pedido explícito).** Justificaba un desfase entre posición visual y orden de
tabulación en desktop. Con la fila dinámica ese desfase **desaparece**: leyendo la tarjeta de arriba
abajo y de izquierda a derecha, los botones son lo último, igual que en el orden de tabulación. El
párrafo ahora describe el mecanismo real (`actionsRow` manda el bloque a la última fila), deja
escrito qué pasaba antes (con 4+ filas el foco bajaba al stepper/sedes/Equipo y volvía a subir: un
salto hacia atrás, no un desfase aceptado) y deja la condición que lo rompe ("si alguien vuelve a
anclar esta fila a un número fijo, hay que reescribir este párrafo"). La prohibición de compensar con
`tabindex` positivo se conserva textual.

### Qué necesita confirmación visual

La colocación está medida en un motor real, pero sobre una réplica de la grilla, no sobre la app
corriendo con datos reales. Falta abrir `/servicios` en el navegador y confirmar, en desktop:

1. Un servicio con **cupo compartido** (sin sedes ni cobertura): los tres botones tienen que quedar
   a la derecha del stepper de cupo, **no** encima.
2. Un servicio con **cupo compartido + sedes + ≥2 profesionales**: los botones tienen que cerrar la
   tarjeta, con la línea de cobertura a su izquierda y **nada** por debajo.
3. Un servicio **individual sin sedes ni cobertura**: sin cambios respecto de lo que ya se vio en la
   UAT (precio, duración, botones debajo).
4. **Mobile a 375px**: la tarjeta tiene que verse exactamente igual que antes de esta corrección
   (divisoria, hueco de 24px y orden de bloques sin tocar).

---

_Corregido: 2026-09-18_
_Fixer: Claude (gsd-code-fixer)_
_Iteración: 2_
