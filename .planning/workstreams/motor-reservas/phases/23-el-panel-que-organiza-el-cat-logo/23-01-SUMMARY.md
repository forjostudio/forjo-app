---
phase: 23-el-panel-que-organiza-el-cat-logo
plan: 01
subsystem: ui
tags: [nextjs, react, supabase, rls, vitest, catalogo, categorias]

requires:
  - phase: 22-el-modelo-del-catalogo
    provides: "migr. 078/079 (service_categories + services.category_id/sort_order + FK compuesta same-tenant + indice normalizado), groupCatalog() en lib/service-categories.ts"
provides:
  - "lib/catalog-panel.ts: renumber, moveWithinList, SIN_CATEGORIA, categoryPatch, fromCategoryId, mapCategoryWriteError, plurales, classifyCategoryWriteError y la copy de rechazos"
  - "components/dashboard/categorias-manager.tsx: Card colapsable con alta, flechas de reorden, chips, grupo Sin categoría y diálogo Mover"
  - "assignServiceCategory: el unico update suelto de services.category_id (D-07)"
  - "/servicios lee service_categories por tenant y ordena services por sort_order + created_at"
affects: [23-02, 23-03, 23-04, 24]

actuals:
  tokens: 12796
  tasks: 2
  commits: 3
plan_head_before: c3d3c5260726a705b87c4f3f695b73f720f73982

tech-stack:
  added: []
  patterns:
    - "Reorden por N updates de una sola columna sobre la lista completa renumerada, .select('id') con 0 filas = fallo, y re-lectura de la base ante cualquier fallo (D-1 opcion B + D-10.2)"
    - "Todo valor escrito en services.category_id sale de categoryPatch y todo rechazo lo traduce mapCategoryWriteError (D-07)"

key-files:
  created:
    - lib/catalog-panel.ts
    - test/catalog-panel.test.ts
    - components/dashboard/categorias-manager.tsx
  modified:
    - app/(dashboard)/servicios/page.tsx
    - app/(dashboard)/settings/settings-client.tsx

key-decisions:
  - "El sentinel SIN_CATEGORIA vale '__sin_categoria__' (no la cadena vacia): no puede coincidir con un uuid ni con un valor 'vacio' que otra superficie interprete distinto"
  - "Ante fallo del reorden, si la re-lectura TAMBIEN falla se repinta el estado previo al gesto (lo ultimo que la base confirmo) y se avisa igual"
  - "confirmMove no escribe si el borrador no cambio: una escritura por confirmacion real, cero por un Guardar sin cambios"
  - "ServiceChip vive a nivel de modulo (no dentro del componente) para que el arrastre del 23-03 no se corte por remontaje"

patterns-established:
  - "Organizador del catalogo: supabase por prop, par valor+setter compartido con SettingsClient, cada cadena de Supabase en una linea con .eq('business_id', ...)"

requirements-completed: [CAT-01, CAT-02, CAT-03, CAT-05]

coverage:
  - id: D1
    description: "Modulo puro lib/catalog-panel.ts: renumeracion sin huecos ni empates, movimiento sobre copia con no-op en bordes, categoryPatch/fromCategoryId/mapCategoryWriteError (D-07), plurales y clasificacion del rechazo por codigo"
    requirement: CAT-03
    verification:
      - kind: unit
        ref: "test/catalog-panel.test.ts (36 casos)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Gates automatizados del plan: typecheck limpio, escrituras con business_id, reorden sin name/price/duration, 41 migraciones, los tres gates de D-07 y suite completa >= 1209"
    requirement: CAT-01
    verification:
      - kind: other
        ref: "./node_modules/.bin/tsc --noEmit (0 error TS fuera de .next/)"
        status: pass
      - kind: other
        ref: "gates D-07 1/2/3 + tenant + reorden + migraciones=41 (comandos del <verify> del plan)"
        status: pass
      - kind: unit
        ref: "npx vitest run (93 archivos, 1245 pasados)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Crear categoría en /servicios, rechazo de duplicado con copy inline, reordenar con flechas y que el orden sobreviva al reload; aviso y re-lectura con el navegador offline"
    requirement: CAT-03
    verification:
      - kind: manual_procedural
        ref: "psql como authenticated (rollback): insert ok, '  cOLOR ' rechazado por service_categories_name_uq, update de sort_order devuelve la fila"
        status: pass
    human_judgment: true
    rationale: "El hilo RSC -> prop -> componente -> escritura -> reload y el caso offline solo se ven en el navegador; el ejecutor no puede abrirlo"
  - id: D4
    description: "Chips por grupo, grupo Sin categoría ultimo y diálogo Mover que asigna o desasigna con una escritura; Escape no escribe"
    requirement: CAT-02
    verification:
      - kind: manual_procedural
        ref: "psql como authenticated (rollback): asignar y desasignar category_id devuelven UPDATE 1; uuid inexistente rechaza con 23503 services_category_same_tenant"
        status: pass
    human_judgment: true
    rationale: "Interaccion del diálogo, layout a 375px y textos largos requieren UAT visual"

duration: 15min
completed: 2026-09-16
status: complete
---

# Phase 23 Plan 01: El hilo de una categoría + asignar desde el diálogo Mover Summary

**Organizador del catálogo en /servicios: el dueño crea categorías (duplicado rechazado por la base con copy propia), las reordena con flechas que renumeran la lista completa acotada por tenant con re-lectura honesta ante fallo, y asigna o desasigna servicios desde un único diálogo "Mover …" que escribe la columna solo vía `categoryPatch`.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-09-16T12:50:27Z
- **Completed:** 2026-09-16T13:05:06Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- `lib/catalog-panel.ts` (puro, 36 tests): la regla de posiciones que comparten flechas y arrastre, la única fuente del valor de `services.category_id` y la única traducción de sus rechazos (D-07).
- `/servicios` lee `service_categories` por tenant con doble `order` y ordena `services` por `sort_order` + `created_at` (medido en el PG local: sin el desempate, dos categorías empatan en 0 y el orden queda librado a la lectura).
- `CategoriasManager`: Card colapsable (cerrada con cero categorías), alta con error inline por código, flechas con `disabled` + `aria-disabled` en los bordes, región `aria-live` siempre montada.
- Reorden = N updates de una sola columna con `.eq('business_id', …)` y `.select('id')`; un update de 0 filas cuenta como fallo y dispara la re-lectura (D-10.2).
- `assignServiceCategory` es el único update suelto de la columna, con su aviso adentro; chips desde `groupCatalog()`, grupo "Sin categoría" último y diálogo "Mover …" único para la Card.

## Task Commits

1. **Task 1 (RED): test del módulo puro** - `49d5d12` (test)
2. **Task 1 (GREEN): crear, ver y reordenar** - `b15e66a` (feat)
3. **Task 2: chips, grupo Sin categoría y diálogo Mover** - `29447ca` (feat)

## Files Created/Modified

- `lib/catalog-panel.ts` - reglas puras del panel (posiciones, D-07, plurales, copy de rechazos)
- `test/catalog-panel.test.ts` - 36 casos, carril `pure`
- `components/dashboard/categorias-manager.tsx` - el organizador
- `app/(dashboard)/servicios/page.tsx` - lectura de categorías y orden de servicios
- `app/(dashboard)/settings/settings-client.tsx` - prop `initialServiceCategories`, estado y montaje en la rama `!isCanchas` (solo `Edit` parciales)

## Decisions Made

- `SIN_CATEGORIA = '__sin_categoria__'`: un valor que no puede confundirse con un uuid ni con la cadena vacía.
- Si falla el reorden y además falla la re-lectura, se repinta el estado previo al gesto y se avisa igual: nunca queda en pantalla el orden optimista no guardado.
- "Guardar" en el diálogo sin cambiar el borrador cierra sin escribir.
- Las flechas se deshabilitan también mientras hay un reorden en vuelo (T-23-07), no solo en los bordes.

## Deviations from Plan

None - plan executed exactly as written.

Notas de ejecución (no son desvíos de alcance):
- **Evidencia RED:** `check tdd-red-evidence` sólo parsea el resumen TAP de `node --test`. Se corrió vitest con `--reporter=tap-flat` y se agregaron las tres líneas de resumen (`# tests 36 / # pass 20 / # fail 16`) contadas de las propias líneas `ok`/`not ok` de esa salida; veredicto `RED_EVIDENCE_OK` sobre `renumber — tres ids`. El RED fue un esqueleto con las firmas y sin comportamiento (fallas de aserción, no de carga).
- **Suite completa:** la primera corrida salió en rojo SOLO por `test/abono-generation.test.ts` (esta vez un `afterAll` que superó los 10 s, no el caso 5b), con 1245 casos pasados. Ese archivo aislado pasó 11/11 y la segunda corrida completa salió verde: 93 archivos, 1245 pasados, 4 expected fail, 1 skip. No atribuible a esta fase.
- eslint sobre los archivos nuevos/tocados (salvo `settings-client.tsx`, por tiempo): exit 0.

## Issues Encountered

None

## UAT visual pendiente

No se abrió un navegador. Pasos concretos, con `npm run dev` y `test@forjo.local` / `Forjo1234!` en `/servicios`, a 375px y en desktop:

1. Cero categorías: la Card aparece colapsada y la página no crece de alto.
2. Abrirla: empty state `Todavía no tenés categorías` + bloque de alta.
3. Crear `Color`: fila con conteo, pill `1 categoría`, input vacío.
4. Crear `  cOLOR `: error inline `Ya tenés una categoría con ese nombre.`, no se crea nada, ningún nombre de constraint en pantalla.
5. Crear `Uñas` y `Barbería`; subir `Barbería` dos veces con ▲: queda primera.
6. **Recargar**: el orden se mantiene.
7. ▲ de la primera fila y ▼ de la última deshabilitadas.
8. Offline (DevTools → Network → Offline) y tocar una flecha: toast `No se pudo guardar el orden. Volvimos a mostrar el que está guardado.` y la lista vuelve al orden guardado.
9. Con ≥2 categorías y servicios: los sueltos como chips bajo `Sin categoría` (último, borde punteado, sin flechas).
10. Tocar un chip: diálogo `Mover “…”` con `Sin categoría` última; elegir una categoría y `Guardar`: el chip cambia de grupo y los conteos se actualizan.
11. Volver a `Sin categoría`: el chip vuelve a los sueltos.
12. Abrir y cerrar con Escape: no se escribe nada.
13. A 375px el diálogo scrollea por dentro con `Guardar` visible; nombres de 40+ caracteres (categoría, servicio, título del diálogo) envuelven sin scroll horizontal.
14. Offline + `Guardar`: `No se pudo mover “…”. Probá de nuevo.` y el chip sigue en su grupo.

Anotaciones para la UAT y el UI-SPEC:
- La copy `Esa categoría ya no existe. Recargá la página y elegí otra.` (23503) es nueva: el Copywriting Contract no tenía fila para ese rechazo.
- El pill del chip usa `whitespace-nowrap` como dice el contrato: hasta ~40 caracteres entra en los 295px útiles; un nombre de servicio mucho más largo (60+) podría desbordar la fila a 375px. Mirarlo en el paso 13.
- Los chips incluyen servicios desactivados (el organizador trabaja sobre el catálogo completo del estado del padre).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 23-02 (campos Categoría y Descripción del form) puede esparcir `categoryPatch` en el alta y la edición; el gate 1 de D-07 hoy da 0 coincidencias fuera de `lib/catalog-panel.ts`.
- 23-03 (renombrar, borrar, arrastre) reusa `moveWithinList`, `persistCategoryOrder` y `assignServiceCategory`.
- 23-04 (modos de orden + sección "Posición") encuentra el grip y las flechas ya gateados por `category_sort_mode`.
- Cero migraciones (siguen 41) y cero paquetes nuevos.

---
*Phase: 23-el-panel-que-organiza-el-cat-logo*
*Completed: 2026-09-16*

## Self-Check: PASSED
