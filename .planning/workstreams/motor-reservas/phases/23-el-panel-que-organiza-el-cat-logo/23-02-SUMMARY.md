---
phase: 23-el-panel-que-organiza-el-cat-logo
plan: 02
subsystem: ui
tags: [nextjs, react, supabase, base-ui, catalogo, categorias, formularios]

requires:
  - phase: 23-el-panel-que-organiza-el-cat-logo
    provides: "plan 23-01: lib/catalog-panel.ts (SIN_CATEGORIA, categoryPatch, fromCategoryId, mapCategoryWriteError) y el estado serviceCategories en settings-client.tsx"
  - phase: 22-el-modelo-del-catalogo
    provides: "services.category_id con FK compuesta same-tenant (23503) y services.description ya expuesta por la vista publica"
provides:
  - "Campo 'Categoría (opcional)' espejado en el alta y en el diálogo de edicion del servicio, con 'Sin categoría' primero y por defecto"
  - "Campo 'Descripción corta (opcional)' espejado, con tope duro de 120, contador 0/120 y anuncio polite unico al limite"
  - "Alta y edicion siguen siendo UNA escritura cada una: categoryPatch esparcido + description normalizada al guardar"
  - "Rechazo 23503 de la columna de categoría traducido por mapCategoryWriteError en los dos handlers"
affects: [23-03, 23-04, 24]

actuals:
  tokens: 2855
  tasks: 2
  commits: 2
plan_head_before: e47dbf4c5abb6e4442485b37de6fe6b14fd75885

tech-stack:
  added: []
  patterns:
    - "El estado del form guarda el valor del control (sentinel o uuid); la clave de la columna solo aparece al escribir, via categoryPatch esparcido en la unica fila (D-07)"
    - "Texto libre del dueño: sin normalizacion en onBlur; trim() y '' => null solo en la escritura"

key-files:
  created: []
  modified:
    - app/(dashboard)/settings/settings-client.tsx

key-decisions:
  - "El SelectValue de categoría envuelve la etiqueta en un span truncate con min-w-0: un nombre de 40+ caracteres se corta dentro del disparador en vez de ensanchar el diálogo (backstop de E9)"
  - "Un id de categoría que ya no existe en el estado se muestra como 'Sin categoría' en el disparador; si se guarda, la base rechaza con 23503 y se ve la copy de mapCategoryWriteError"
  - "Un useId por superficie (alta y edicion) para label/ayuda/control de la descripcion, porque las dos pueden estar montadas a la vez"
  - "El umbral del contador es length >= 120 (el tope duro hace que nunca supere 120)"

patterns-established:
  - "Campo nuevo del servicio = espejo literal en alta y diálogo de edicion, en el orden Nombre → Min./Precio → Categoría → Descripción → modo de cupo → sedes → CTA"

requirements-completed: [CAT-02, CAT-11]

coverage:
  - id: D1
    description: "Campo Categoría espejado en alta y edicion; estado con el valor del control, escritura unica con categoryPatch y rechazo por mapCategoryWriteError"
    requirement: CAT-02
    verification:
      - kind: other
        ref: "./node_modules/.bin/tsc --noEmit filtrado (0 error TS fuera de .next/)"
        status: pass
      - kind: other
        ref: "gate espejo (Categoría (opcional)=2, Sin categoría=5, fromCategoryId(=1) + gates D-07 1/2/3 del <verify> del Task 1"
        status: pass
      - kind: unit
        ref: "test/catalog-panel.test.ts (categoryPatch/fromCategoryId/mapCategoryWriteError, plan 23-01) dentro de npx vitest run"
        status: pass
    human_judgment: false
  - id: D2
    description: "Campo Descripción corta con maxLength 120, contador, anuncio polite, normalizacion solo al guardar y superficie publica intacta"
    requirement: CAT-11
    verification:
      - kind: other
        ref: "gate espejo de Task 2 (maxLength={120}=2, label=2, tabular-nums=4, anuncio=2, placeholder=2)"
        status: pass
      - kind: other
        ref: "git status --porcelain -- app/[slug] components/landing (vacio)"
        status: pass
      - kind: unit
        ref: "npx vitest run (93 archivos, 1245 pasados, 4 expected fail, 1 skip)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Comportamiento visible en /servicios: campo oculto con cero categorías, etiqueta (no uuid) en el disparador, persistencia al reabrir, rechazo 23503 sin guardado a medias, 375px con nombres largos"
    requirement: CAT-02
    verification: []
    human_judgment: true
    rationale: "El ejecutor no puede abrir un navegador; el render-prop del Select, el layout a 375px y el flujo con otra pestaña solo se ven en la UAT visual"
  - id: D4
    description: "Contador que arranca en 0/120, frena el tipeo en 120, cambia peso y color, y lo escrito entra entero en las dos lineas de la tarjeta del booking a 375px"
    requirement: CAT-11
    verification: []
    human_judgment: true
    rationale: "Que 120 caracteres entren en el line-clamp-2 real de la tarjeta a 375px (assumption no re-medida) y el comportamiento del contador solo se confirman a ojo"

duration: 5min
completed: 2026-09-16
status: complete
---

# Phase 23 Plan 02: Los campos Categoría y Descripción corta del servicio Summary

**El formulario de servicio de `/servicios` suma, espejados en el alta y en el diálogo de edición, un selector `Categoría (opcional)` con `Sin categoría` primero y por defecto, y una `Descripción corta (opcional)` con tope duro de 120 y contador; cada Guardar sigue siendo una sola escritura, con la columna armada por `categoryPatch` y su rechazo traducido por `mapCategoryWriteError`.**

## Performance

- **Duration:** ~5 min (edición + gates; la suite completa tardó 94 s)
- **Started:** 2026-09-16T13:11:06Z
- **Completed:** 2026-09-16T13:16:35Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- `newService` y `editSvcForm` suman `category` (valor del `Select`: sentinel o uuid) y `description` (texto). El alta arranca en `SIN_CATEGORIA`; la edición hidrata con `fromCategoryId(s.category_id)` y `s.description ?? ''`.
- Campo `Categoría (opcional)` en las dos superficies, entre el precio y el modo de cupo, con `SelectValue` en forma render-prop (muestra el nombre, nunca el uuid). Con cero categorías no se renderiza.
- `addService` inserta `...categoryPatch(newService.category)` y `description: trim() || null` en el mismo `.insert`. Su `if (error)` muestra `mapCategoryWriteError(error.code) ?? 'Error'`.
- `saveEditService` suma las dos columnas al `payload` único. En el `if (error)` hay una rama nueva para `mapCategoryWriteError`, después del gate de cambio de modo y antes del toast genérico. El merge al estado local (`{ ...s, ...payload }`) recibe la columna también por `categoryPatch`.
- Campo `Descripción corta (opcional)` con `Textarea rows={2} maxLength={120}`, ayuda enlazada por `aria-describedby`, contador `{n}/120` `aria-hidden` con `tabular-nums` (al límite pasa a `font-medium text-foreground`), y un `role="status"` `sr-only` con `Llegaste al máximo de 120 caracteres.`. No hay `onBlur`.

## Task Commits

1. **Task 1: campo Categoría espejado** - `93e8da6` (feat)
2. **Task 2: campo Descripción corta con tope y contador** - `713dbd5` (feat)

## Files Created/Modified

- `app/(dashboard)/settings/settings-client.tsx`: import de `@/lib/catalog-panel` y de `Textarea`, los dos shapes de formulario, la hidratación, las dos escrituras y los cuatro bloques de UI. Todo con `Edit` puntuales; la tarjeta de servicio de la lista no se tocó.

## Decisions Made

- `SelectValue className="min-w-0"` con la etiqueta dentro de `<span className="truncate">`. Sin eso, el valor (`flex-1`, `whitespace-nowrap` heredado del trigger) no puede achicarse por debajo de su contenido, y un nombre de 40+ caracteres ensancharía el disparador o el diálogo (backstop de E9).
- Si el id seleccionado ya no está en `serviceCategories`, el disparador muestra `Sin categoría`. Si igual se guarda, la base rechaza con 23503 y se ve la copy de `mapCategoryWriteError`.
- Un `useId()` por superficie para la descripción.

## Deviations from Plan

None - plan executed exactly as written.

Notas de ejecución (no cambian el alcance):
- **TDD:** el Task 1 lleva `tdd="true"`, pero su `<behavior>` dice explícitamente que no hay test unitario nuevo: la lógica pura (`categoryPatch`, `fromCategoryId`, `mapCategoryWriteError`) ya está cubierta por `test/catalog-panel.test.ts` desde el 23-01. Por eso no hay commit `test(23-02)`. El control de este plan fueron los gates automáticos (tsc, espejo y D-07 1/2/3).
- **Typecheck:** `./node_modules/.bin/tsc --noEmit` filtrado, 0 `error TS`, después de cada task.
- **Suite completa:** `npx vitest run` salió verde en la primera corrida: 93 archivos, 1245 pasados, 4 expected fail, 1 skip (piso 1209). No aparecieron los timeouts conocidos de la base.
- **eslint** sobre `settings-client.tsx` (formato json, porque el formatter `unix` ya no viene en ESLint 9): 11 hallazgos, igual que la línea de base de ~11. Son todos preexistentes (`set-state-in-effect` en 730/962/976, `immutability` en 984-1006, `purity` por `Date.now` en 1130 y en 1685, este último en `uploadProPhoto`). Ninguno está en código de este plan.
- `git diff --name-only e47dbf4 HEAD` = solo `app/(dashboard)/settings/settings-client.tsx`. `package.json`/`package-lock.json` sin cambios. Cero migraciones.

## Issues Encountered

None

## UAT visual pendiente

No se abrió un navegador: nada de esto se verificó visualmente. Pasos con `npm run dev` y `test@forjo.local` / `Forjo1234!` en `/servicios`, a 375px y en desktop.

**Categoría (Task 1)**
1. Con cero categorías, ni el alta ni el diálogo de edición muestran el campo `Categoría`.
2. Crear una categoría desde el organizador: el campo aparece en **las dos** superficies, con `Sin categoría` primero y seleccionado en el alta.
3. Crear un servicio sin tocar el campo: se crea sin error ni aviso y aparece en el grupo `Sin categoría` del organizador.
4. Editar ese servicio, elegir una categoría y guardar: el chip pasa al grupo de esa categoría y su conteo sube.
5. Reabrir el diálogo: la categoría guardada vuelve seleccionada y el disparador muestra **el nombre**, no un identificador.
6. Volver a `Sin categoría` y guardar: el chip vuelve a los sueltos.
7. A 375px, con una categoría de 40+ caracteres, el disparador no desborda ni empuja el diálogo (fila `backstop` de E9; el nombre se corta con elipsis).
8. En el diálogo de edición cambiar el nombre **y** elegir una categoría. En otra pestaña, borrar esa categoría. Volver y `Guardar`: aparece `Esa categoría ya no existe. Recargá la página y elegí otra.` y, al recargar, el servicio **conserva el nombre anterior**. La escritura es una sola y no quedó nada a medias.
   - Ojo: el organizador de la primera pestaña sigue mostrando la categoría borrada hasta recargar. Por eso el disparador sigue mostrando su nombre y el 23503 salta recién al guardar.

**Descripción corta (Task 2)**
1. El contador arranca en `0/120` con el campo vacío.
2. Al escribir, el contador sube. En 120 el navegador no deja escribir más y el contador cambia de peso y color.
3. Guardar un servicio con la descripción vacía funciona, y en `/[slug]` la tarjeta no muestra un párrafo en blanco.
4. Guardar con descripción: en `/[slug]` el texto aparece bajo el nombre, recortado a dos líneas, y **lo escrito entra entero en esas dos líneas a 375px**.
5. Reabrir el diálogo de edición: vuelve la descripción guardada.
6. Escribir espacios al final y guardar: se guarda recortado, y el campo no se corrige ni mientras se escribe ni al salir.

Anotaciones para la UAT y el UI-SPEC:
- La copy `Esa categoría ya no existe. Recargá la página y elegí otra.` (23503) es nueva y no está en el Copywriting Contract del UI-SPEC. Ya la había introducido el 23-01; acá también aparece en el alta y en la edición.
- La ayuda de la descripción quedó literal aunque el texto también sale en la web de marca (`components/landing/services.tsx`). Esa superficie usa el mismo recorte de dos líneas, así que la promesa de la ayuda sigue siendo cierta.
- Limitación aceptada (T-23-09): el tope de 120 lo controla el cliente. `services.description` no tiene CHECK de longitud, así que un UPDATE directo por API puede pasarlo. El daño es cosmético.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 23-03 (renombrar, borrar, arrastre en `categorias-manager.tsx`) no depende de este archivo. El gate 3 de D-07 sigue en 1: el único update suelto de la columna es el de `assignServiceCategory`.
- 23-04 (modos de orden + sección "Posición") encuentra el form con el orden de campos del UI-SPEC ya aplicado.
- Siguen 41 migraciones y ningún paquete nuevo.

---
*Phase: 23-el-panel-que-organiza-el-cat-logo*
*Completed: 2026-09-16*

## Self-Check: PASSED
