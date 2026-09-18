---
phase: 23-el-panel-que-organiza-el-cat-logo
fixed_at: 2026-09-18T00:00:00Z
review_path: .planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-REVIEW.md
iteration: 3
findings_in_scope: 6
fixed: 6
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
  - id: 3
    fixed_at: 2026-09-18
    scope: "pasada incremental 23-09 + 23-10 — WR-05..WR-10"
    findings_in_scope: 6
    fixed: 6
    skipped: 0
    status: all_fixed
---

# Phase 23: Reporte de corrección del code review

> Este archivo tiene **tres pasadas**. La pasada 1 (abajo) cubre los planes 23-01..23-07 y quedó
> tal como se escribió el 2026-09-16. La **pasada 2** cubre sólo el plan 23-08 / G-23-20. La
> **pasada 3** (al final del archivo) cubre los planes 23-09 y 23-10 (WR-05..WR-10). Ninguna pisa a
> las otras.

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

---
---

## Pasada 3 — planes 23-09 y 23-10 (WR-05..WR-10)

**Corregido:** 2026-09-18
**Review de origen:** sección `## Pasada incremental — 23-09 + 23-10 (G-23-21, G-23-23, G-23-22, G-23-25)` de `23-REVIEW.md`
**Iteración:** 3
**Archivos tocados:** `app/(dashboard)/settings/settings-client.tsx`, `lib/panel-draft.ts` (nuevo),
`test/panel-draft.test.ts` (nuevo), `23-UI-SPEC.md`

**Resumen:**
- Hallazgos en alcance (los **6 warnings** de la pasada 3): 6
- Corregidos: **6**
- Salteados: **0**
- **Medio hallazgo de WR-05 queda ABIERTO a propósito** (el pre-chequeo de bajada de cupo en el
  guardado del diálogo): el motivo, medido, está en la sección de WR-05.
- Los 6 Info de esta pasada (IN-09..IN-14) quedan **fuera de alcance**, por decisión del usuario.
- Los hallazgos abiertos de las pasadas 1 y 2 (WR-01, WR-02, IN-01..IN-08) **siguen abiertos**: no se
  tocó `components/dashboard/categorias-manager.tsx` ni `app/[slug]/booking-client.tsx`.

### Verificación

- **Dónde corrió:** en el **checkout principal** (`workflow.use_worktrees=false`, rama `main`). Sin
  worktree: los números se reproducen desde este mismo árbol.
- `./node_modules/.bin/tsc --noEmit -p tsconfig.json`: **0 líneas `error TS`** fuera de `.next/`,
  leído de la SALIDA y no del exit code (en este repo `npx tsc` sale 0 aunque haya errores). Corrido
  después de cada fix, no sólo al final.
- `npx vitest run` (suite completa, después del último commit): **96 archivos, 1325 passed,
  4 expected fail, 1 skipped** (1330 casos). El piso era 95 archivos / 1301 passed; los **24** de más
  son `test/panel-draft.test.ts`. Dos de las cuatro corridas tiraron un
  `Worker exited unexpectedly`; la última salió **limpia** (96/96), así que es la flakiness conocida
  de Windows y no una regresión — en una de esas corridas el conteo de casos igual dio completo.
- `npx eslint "app/(dashboard)/settings/settings-client.tsx"`: **11 errores**, exactamente el piso
  preexistente (los mismos `react-hooks/purity|immutability|set-state-in-effect` de siempre).
  `npx eslint lib/panel-draft.ts test/panel-draft.test.ts`: **0 problemas**.
- `git diff --check` por commit: **limpio en los seis**. Las tres líneas con espacios finales que
  marca IN-13 son preexistentes y siguen ahí (Info, fuera de alcance).
- Sin paquetes nuevos y sin migraciones.

**Lo que NO se verificó:** no hay confirmación visual en navegador. WR-07 y WR-08 son de
comportamiento y el detalle de qué mirar está al final de esta sección.

### Fixed Issues

#### WR-05: ir a "Individual" y volver degradaba el cupo (12 → 2) y ensuciaba el borrador

**Archivos modificados:** `app/(dashboard)/settings/settings-client.tsx` (después, la regla se mudó a
`lib/panel-draft.ts` en el commit de WR-09)
**Commits:** `691d5da` (el fix) · `880d0dc` (extracción a `capacityModePatch` + tests)
**Status:** fixed

**Qué estaba mal.** El patch del toggle era
`capacity: o.key === 'individual' ? 1 : normalizeCapacity(capacity, 2)`. Ir a individual **pisaba** el
cupo con 1, y volver a un modo compartido sólo aplicaba el **piso**: una clase de 12 lugares quedaba
en 2. Con la guarda de G-23-25 eso además marcaba el borrador como sucio, el aviso decía "Guardá para
conservarlos", y siguiendo esa instrucción `saveEditService` escribía `capacity: 2` sobre la clase de
12 — la agenda pasa a mostrar `12/2 lleno` y el motor rechaza toda reserva nueva con `slot_full`.

**Qué se cambió.** El cupo se **conserva** al ir a individual. Verifiqué la premisa que el review
daba por buena, y es correcta: `saveEditService` (`:1687` antes del refactor) ya fuerza
`capacity: capacity_mode === 'individual' ? 1 : normalizeCapacity(capacity, 2)` por su cuenta, el alta
hace lo mismo y la propia huella también, así que conservar el número en el borrador **no puede**
producir una combinación que rechace el CHECK `services_capacity_matches_mode_chk` de la migr. 068. Y
el campo "Cuántos lugares" ni siquiera se renderiza en modo individual, así que el número conservado
no se ve.

En el commit de WR-09 la regla salió a `capacityModePatch(next, capacity)` para poder testearla. Hay
test de regresión explícito: `grupal → individual → grupal` conserva 12, y la huella del borrador
vuelve a ser la de partida (o sea el diálogo vuelve a cerrar con un click afuera).

**ABIERTO a propósito — la segunda mitad de WR-05.** El review pedía además llevar el pre-chequeo de
bajada de cupo (`maxFutureSeatsOf` + `askCapacityDowngrade`) al guardado del diálogo, que hoy sólo
existe en el stepper de la tarjeta (`saveCapacityInline`). **No se aplicó**, y el motivo no es
esfuerzo: el aviso de bajada es un `ConfirmDialog`, y dispararlo desde `saveEditService` lo abre
**encima** del diálogo de edición que está abierto. Eso es un **modal anidado**, que `CLAUDE.md`
prohíbe explícitamente y que el propio comentario de G-23-25 cita como límite de diseño. Cerrar esa
asimetría bien exige decidir otra superficie para el aviso (un paso dentro del mismo diálogo, o mover
la confirmación al pie), y eso es diseño, no una corrección de review. Con el fix aplicado, el camino
que WR-05 describía —el dueño que sólo fue a comparar los modos— ya no llega nunca a esa escritura;
lo que queda abierto es el caso en que el dueño **tipea a mano** un cupo menor en el diálogo, que es
preexistente y no lo introdujo esta ronda.

#### WR-06: `saveEditLocation` era la única escritura de edición sin `.eq('business_id', …)`

**Archivos modificados:** `app/(dashboard)/settings/settings-client.tsx`
**Commit:** `dbee8e9`
**Status:** fixed

**Qué estaba mal.** `supabase.from('locations').update(payload).eq('id', editLoc.id)` — sin el filtro
por tenant. Sus dos hermanas del mismo archivo lo llevan (`saveEditService`, `saveEditPro`), y la
convención del proyecto (`.claude/CLAUDE.md` + skill `supabase-multitenant-rls`) es defensa en
profundidad: RLS **y** filtro explícito.

**Qué se cambió.** Se agregó `.eq('business_id', business.id)` con el mismo comentario que usan sus
hermanas. No es explotable hoy —la policy `"business access" ON public.locations` no declara
`WITH CHECK` propio, así que Postgres reusa su `USING` para el UPDATE y un id ajeno no escribe nada—,
pero dejaba la única barrera del lado de la base. Es exactamente la clase de defecto que la
convención existe para evitar.

Verificado que no hay nada más en el delta: `from('services')` sigue en 6 líneas y las tres
escrituras de edición del panel llevan ahora el filtro.

#### WR-07: "Editar sede" con el nombre vacío se leía como trabada

**Archivos modificados:** `app/(dashboard)/settings/settings-client.tsx`
**Commit:** `41ee31f`
**Status:** fixed

**Qué estaba mal.** `saveEditLocation` arrancaba con `if (!editLoc || !editLocForm.name.trim()) return`
—sin toast y sin marcar el campo— y el botón sólo estaba `disabled={savingEditLoc}`. Con el nombre
vacío el borrador está sucio por definición, así que la guarda de G-23-25 bloqueaba el click afuera y
el Escape con un aviso que empuja a "Guardar"… y "Guardar" no hacía **nada**. Este diálogo tampoco
tiene "Cancelar".

**Qué se cambió.** Espejo literal del diálogo de servicio: `disabled={savingEditLoc || !editLocForm.name.trim()}`
y el early return dejó de ser silencioso (`toast.error('Escribí un nombre para guardar.')`). La copy
no nombra la entidad porque `locWord` cambia por rubro (sede/consultorio/local/sucursal) y el género
del artículo con ella; el aviso sirve para los cuatro sin inventar concordancia.

La salida sigue siendo la ✕, que es lo que el aviso nombra. **No contradice el `23-UI-SPEC`**: el
contrato ya decía que con el nombre vacío "Guardar" queda deshabilitado y la única salida es la ✕ —
sólo que eso valía para el diálogo de servicio y no para éste. Igual se dejó escrito en el UI-SPEC
(commit de WR-08, que toca el mismo párrafo).

#### WR-08: el aviso del cierre bloqueado vivía en una región que el modal marca inerte

**Archivos modificados:** `app/(dashboard)/settings/settings-client.tsx`, `23-UI-SPEC.md`
**Commit:** `846a68b`
**Status:** fixed

**Qué estaba mal.** El único canal del aviso era el toast de sonner, y el `<Toaster />` se monta en
`app/layout.tsx`, o sea **fuera** del portal del diálogo. Con el diálogo modal, Base UI aplica
`markOthers` sobre los hermanos del popup en `<body>` y los deja `inert`: la región `aria-live` del
toaster queda dentro de ese subárbol. Quien cierra con **Escape** —camino de teclado, y uno de los dos
motivos que la guarda mira— percibe que la tecla no hace nada y no recibe ningún anuncio.

**Qué se cambió.**
1. `guardDraftOnDismiss` ya no llama al toast: recibe `onBlocked` y lo llama. La función queda pura
   (lo que además la hizo testeable en WR-09) y la pantalla decide los canales.
2. La pantalla da **dos** canales: el toast de siempre y una región viva `sr-only`
   (`role="status"` + `aria-live="assertive"`) **adentro de cada uno de los tres popups**, que es lo
   único que el modal no marca. Un nodo por diálogo: no agrega un modal anidado.
3. La región se apaga al **abrir** cualquiera de los tres diálogos, para que nunca se monte con el
   texto ya puesto.

**Desvío consciente respecto de la propuesta del review, y por qué.** La primera versión apagaba la
región sola con un `setTimeout` guardado en un `useRef`, para que un segundo intento bloqueado
volviera a anunciar (una región viva cuyo texto no cambia no habla). Eso **sumó 3 errores de eslint**
(`react-hooks/refs`: el render lee el ref al armar el handler de cierre) y el piso del archivo es 11,
inamovible. Se sacó el ref y el timer. **Límite aceptado y documentado en el código y en el UI-SPEC:**
dos intentos bloqueados seguidos dentro del mismo diálogo anuncian una sola vez. El primer anuncio es
el que comunica el estado nuevo, y el toast se vuelve a ver en cada intento.

`sr-only` es `position: absolute`, así que el nodo nuevo **no** reclama una fila del grid del diálogo
de servicio (`grid-rows-[auto_minmax(0,1fr)_auto]`) ni mueve nada en los otros dos.

**Contrato actualizado en el mismo commit:** `23-UI-SPEC.md`, entrada G-23-25, que hasta ahora
nombraba al toast como único canal. Se le sumaron las dos correcciones (WR-08 y WR-07).

#### WR-09: la lógica pura más riesgosa quedó dentro del componente, sin tests

**Archivos modificados:** `lib/panel-draft.ts` (nuevo), `test/panel-draft.test.ts` (nuevo),
`app/(dashboard)/settings/settings-client.tsx`
**Commit:** `880d0dc`
**Status:** fixed

**Qué estaba mal.** `guardDraftOnDismiss`, las tres huellas y `locToPayload` son funciones puras, pero
vivían en un módulo `'use client'` de 4.100 líneas y sin exportar: el runner (environment `node`) no
las puede importar. Las coberturas D7..D10 del `23-10-SUMMARY` quedaban en `human_judgment` + un gate
de `grep`, para un arreglo cuyo modo de falla el plan clasifica como GRAVE. **WR-05 es la prueba de
que el gate no alcanzaba**: dio verde sobre un caso que rompía.

**Qué se cambió.** Nuevo módulo `lib/panel-draft.ts`, con el molde de `lib/catalog-panel.ts` de esta
misma fase. Se mudaron:

- la guarda (`guardDraftOnDismiss`) y el tipo estructural de su detalle (`DraftDismissDetails`, con el
  `reason` tomado de la unión real de Base UI vía `import type`, así un motivo mal escrito sigue sin
  compilar y el módulo sigue sin runtime de UI);
- las tres huellas (`serviceFormFingerprint`, `locationFormFingerprint`, `proFormFingerprint`) con sus
  tipos y sus normalizadores compartidos con los guardados (`locToPayload`, `proToPayload`);
- las reglas de cupo que la huella comparte con las escrituras: `CapacityMode`, `minCapacityFor`,
  `MAX_CAPACITY`, `normalizeCapacity`;
- y `capacityModePatch`, la regla de WR-05, extraída del `onClick` justamente para poder testearla.

En `settings-client.tsx` quedaron **sólo la copy y el cableado**, con un comentario que apunta al
módulo y a su suite.

**Tests: `test/panel-draft.test.ts`, 24 casos, carril `pure`** (no importa `./env` ni fixtures, así
que `test/suite-split.ts` lo deja en el carril paralelo). Cubre:

- los **cuatro falsos positivos** que el plan declaraba cubiertos: normalizar al salir de un campo,
  prender y apagar una sede, ir y volver de modo de cupo (el de WR-05) y un servicio con la categoría
  borrada;
- la **regresión de WR-05** (`grupal → individual → grupal` conserva 12) y el techo/piso del cupo;
- que la guarda mira **exactamente** dos motivos y que la ✕ (`close-press`) cierra **siempre**, que es
  lo que impide encerrar al dueño con el nombre vacío;
- que la huella **no** se calcula en un cierre que igual va a pasar.

Un test falló al escribirlo y el que estaba mal era el test, no el código: asumí que
`normalizeCapacity(Infinity, 2)` daba el techo, y `Number.isFinite` lo manda al piso. Queda escrito
así, con el porqué.

#### WR-10: los comentarios nuevos citaban tres números que no son los que se midieron

**Archivos modificados:** `app/(dashboard)/settings/settings-client.tsx`
**Commit:** `b9d6491`
**Status:** fixed

**Qué estaba mal y qué dice ahora** (contrastado contra el `23-09-SUMMARY`, cobertura D8, y el
`23-10-SUMMARY`, no contra el review):

1. `33px del botón a "Se ofrece en:"` → **32px**. La sonda registró `línea→botón 33/33` y
   `botón→"Se ofrece en:" 32/32`. No es decorativo: ése es el ritmo que sostiene la zona de exclusión
   de G-04, que el mismo comentario invoca dos párrafos más abajo.
2. `343px de alto` → **346px** (medido `346 → 346`, sin cambio).
3. `(aparece "Cuántos lugares", +126px medidos)` → reformulado **sin cifra**. Los 126px son el alto
   del **radiogroup** en la variante nueva (46 → 126, o sea +80), no lo que aporta el bloque "Cuántos
   lugares", que la sonda nunca midió por separado. El número era real pero estaba atribuido a otra
   caja.

Diff de comentarios puro: **0 líneas de código**.

### Qué necesita confirmación visual

Ningún fix de esta pasada se abrió en un navegador. Lo que conviene mirar en `/servicios`:

1. **WR-05 (el que más importa):** abrir "Editar servicio" de una clase grupal con cupo 12, tocar
   "Individual", volver a "Clase grupal" y confirmar que el campo "Cuántos lugares" vuelve a decir
   **12** y que un click afuera **cierra** el diálogo (sin el aviso de cambios sin guardar).
2. **WR-07:** en "Editar sede", borrar el nombre. "Guardar" tiene que verse **deshabilitado**; si se
   llega a clickear, tiene que aparecer el aviso. La ✕ sigue cerrando.
3. **WR-08:** con un lector de pantalla (o con el inspector de accesibilidad), escribir algo en
   cualquiera de los tres diálogos y apretar **Escape**: además del toast, se tiene que anunciar
   "Tenés cambios sin guardar…" desde adentro del diálogo.
4. **Sin regresiones de la ronda:** el nombre largo sigue envolviendo en mobile (G-23-21), el modo y
   el cupo siguen compartiendo línea en desktop (G-23-23), el hueco de la barra de scroll sigue
   reservado y el toggle apilado (G-23-22), y la guarda sigue funcionando en los tres diálogos
   (G-23-25).

---

_Corregido: 2026-09-18_
_Fixer: Claude (gsd-code-fixer)_
_Iteración: 3_
