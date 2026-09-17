---
phase: 23-el-panel-que-organiza-el-cat-logo
plan: 06
subsystem: ui
tags: [react, drag-and-drop, vitest, renderToStaticMarkup, catalogo, gap-closure]

requires:
  - phase: 23-el-panel-que-organiza-el-cat-logo
    provides: "organizador de categorías con arrastre de chips (23-03), modos de orden y sección Posición (23-04), assignServiceCategory con llegada max+1 (23-REVIEW-FIX WR-02)"
provides:
  - "chipDragGates: separa puede arrastrar (asignar, hay categorías) de puede ubicar (modo personalizado + agrupación)"
  - "chipDropIntent: place | assign | none para cada drop de chip"
  - "chip arrastrable para asignar con cualquier modo de orden de servicios"
  - "drop en el propio grupo visible sin modo personalizado = no-op sin resaltado"
  - "matriz de render de servidor de CategoriasManager automatizada (test co-ubicado)"
  - "UI-SPEC (tabla de gates, snippet, E3, sección Cambios post-UAT) y expected del Test 10 alineados"
affects: [23-07, verify-work 23, UAT Test 10]

actuals:
  tokens: 7600
  tasks: 3
  commits: 5
plan_head_before: a1c02a5204983222d80527e5932e874814894fc2

tech-stack:
  added: []
  patterns:
    - "gate de gesto partido en dos flags puros (asignar vs ubicar) en lib/catalog-panel"
    - "test de render de servidor co-ubicado que cuenta atributos (draggable, íconos) sobre el HTML"

key-files:
  created:
    - components/dashboard/categorias-manager.test.tsx
  modified:
    - lib/catalog-panel.ts
    - test/catalog-panel.test.ts
    - components/dashboard/categorias-manager.tsx
    - .planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-UI-SPEC.md
    - .planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-UAT.md

key-decisions:
  - "G-23-10a: el arrastre del chip (asignar) depende sólo de categories.length > 0; el reorden chip sobre chip y la sección Posición siguen en service_sort_mode custom + agrupación (asignar no es reordenar)"
  - "El no-op del drop sin modo personalizado mira el grupo VISIBLE (grupoVisibleDe), no sólo category_id: una categoría colgada se pinta entre los sueltos"
  - "Sin modo personalizado, la fila del propio grupo no se resalta como zona de drop; con modo personalizado el resaltado se conserva (Test 9)"
  - "La rama assign del drop sobre chip asigna al grupo visible del destino, así un destino con categoría colgada asigna Sin categoría en vez de rebotar con 23503"

patterns-established:
  - "Asignar vs ubicar: todo gate de arrastre del catálogo sale de chipDragGates/chipDropIntent, nunca de un flag de modo suelto en el componente"

requirements-completed: [CAT-02, CAT-05]

coverage:
  - id: D1
    description: "chipDragGates: tabla de verdad de asignar vs ubicar"
    requirement: CAT-05
    verification:
      - kind: unit
        ref: "test/catalog-panel.test.ts#chipDragGates — asignar no es reordenar (G-23-10a)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Matriz de render: 5 chips arrastrables en las cinco combinaciones de modos, filas arrastrables 3/0 según el modo de categorías, grips 5+filas, nada arrastrable con cero categorías"
    requirement: CAT-02
    verification:
      - kind: unit
        ref: "components/dashboard/categorias-manager.test.tsx#CategoriasManager — el chip se arrastra para asignar con cualquier modo (G-23-10a)"
        status: pass
    human_judgment: false
  - id: D3
    description: "chipDropIntent: place con posición, none en el propio grupo visible sin posición, assign en otro grupo"
    requirement: CAT-05
    verification:
      - kind: unit
        ref: "test/catalog-panel.test.ts#chipDropIntent — el propio grupo sin modo personalizado no hace nada (G-23-10a)"
        status: pass
      - kind: other
        ref: "gate grep: chipDropIntent=3, grupoVisibleDe=6, mutadores de orden=2, updates de categoryPatch=1 dentro de assignServiceCategory"
        status: pass
    human_judgment: false
  - id: D4
    description: "Gesto real en desktop: arrastrar un chip a otra fila con servicios en Alfabético/Por precio lo asigna; la fila propia no se resalta; soltar en el propio grupo no emite request; viaje de ida y vuelta CAT-06 conserva el orden manual con el recién llegado último; Test 9 sin regresión"
    requirement: CAT-02
    verification: []
    human_judgment: true
    rationale: "UAT visual pendiente (human-check de los Tasks 1 y 2 del plan): drag and drop nativo, resaltado y requests de red sólo se observan en un navegador"
  - id: D5
    description: "UI-SPEC y Test 10 de la UAT describen la regla nueva"
    verification:
      - kind: other
        ref: "gates awk del Task 3 (tabla de gates, E3 partial, sección post-UAT, expected del Test 10, gap intacto)"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-09-17
status: complete
---

# Phase 23 Plan 06: El chip se arrastra para asignar con cualquier modo Summary

**`chipDragGates` y `chipDropIntent` separan asignar de reordenar: el chip se arrastra a otra categoría con cualquier modo de orden de servicios, el reorden sigue sólo en "Como los ordené yo" y soltar en el propio grupo sin modo personalizado no escribe ni resalta (G-23-10a)**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-09-17T15:50:40Z
- **Completed:** 2026-09-17T15:55:05Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- `chipDragGates` en `lib/catalog-panel.ts`: `canDrag = categoryCount > 0`, `canPlace = serviceCustom && hasGrouping`. Los dos `ServiceChip` toman `canDrag` del helper y `posicionDisponible` sale de `canPlace`. El gate de las filas no cambió.
- `chipDropIntent` gobierna el resaltado de las filas y del grupo de sueltos y el drop sobre un chip. `grupoVisibleDe` hace que el no-op mire el grupo donde el servicio se pinta.
- Sin escrituras nuevas: siguen siendo exactamente dos `.update({ sort_order` y un solo `update` de la columna de categoría dentro de `assignServiceCategory` (D-07). `persistServiceOrder` sólo corre con `'place'`.
- Test co-ubicado `components/dashboard/categorias-manager.test.tsx`: la matriz de la sesión de debug queda automatizada con `renderToStaticMarkup`.
- UI-SPEC: dos filas de gate nuevas, la línea "asignar no es reordenar", snippet y bullet del chip, fila `partial` de E3 y la sección `## Cambios post-UAT` con la entrada de G-23-10a. UAT: sólo el `expected:` del Test 10.

## Task Commits

1. **Task 1: chip arrastrable con los servicios en Alfabético (tracer, TDD)**
   - `8759702` test: tests en rojo (la matriz falló con 0 chips en `custom/alpha`, `alpha/alpha` y `alpha/price`: el bug del reporte)
   - `e4cff13` feat: `chipDragGates` y cableado
2. **Task 2: soltar en el propio grupo sin modo personalizado no hace nada (TDD)**
   - `dccc40f` test: tests en rojo de `chipDropIntent`
   - `2c0ebca` feat: `chipDropIntent`, `grupoVisibleDe`, resaltado y drop sobre chip
3. **Task 3: UI-SPEC y Test 10** - `9e29458` (docs)

## Files Created/Modified

- `lib/catalog-panel.ts` - `chipDragGates`, `chipDropIntent` y el tipo `ChipDropIntent`, puros, con JSDoc
- `test/catalog-panel.test.ts` - las dos tablas de verdad (8 casos)
- `components/dashboard/categorias-manager.tsx` - cableado a los helpers, `grupoVisibleDe`, comentarios de la regla nueva
- `components/dashboard/categorias-manager.test.tsx` - matriz de render de servidor (5 modos + cero categorías)
- `23-UI-SPEC.md` - tabla de gates, snippet, bullet, E3 `partial`, sección post-UAT
- `23-UAT.md` - `expected:` del Test 10

## Verificación corrida

- `npx vitest run test/catalog-panel.test.ts components/dashboard/categorias-manager.test.tsx`: 2 archivos, 77 tests en verde, 0 salteados.
- `./node_modules/.bin/tsc --noEmit` filtrando `^\.next/`: sin `error TS`.
- `eslint` sobre los 4 archivos de código: rc=0 (después de cada task).
- Gates grep de cableado: canDrag por el helper=2, `posicionDisponible = chipGates.canPlace`=1, redefinición local=0; `chipDropIntent(`=3, `grupoVisibleDe(`=6, mutadores de orden=2, updates vía `categoryPatch`=1 dentro de `assignServiceCategory`.
- Gates awk del Task 3: todos en PASS.
- Suite completa: NO se corrió acá (según el plan la corre 23-07).

## Human checks pendientes (para /gsd-verify-work)

En `/servicios` (desktop), con 3 categorías y servicios repartidos:

1. Servicios en **Alfabético (A-Z)** y categorías en personalizado: los chips muestran grip; arrastrar un chip a otra fila lo asigna sin abrir el diálogo. Las filas conservan grip y flechas.
2. Categorías en **Alfabético (A-Z)** y servicios en **Por precio**: los chips muestran grip y arrastrar uno a otra fila lo asigna; las filas no tienen grip ni flechas.
3. Con los servicios en Alfabético, "Mover …" desde un chip: la sección "Posición" no aparece.
4. Con DevTools → Network y servicios en Alfabético: pasar un chip sobre **su propia** fila no la resalta; soltarlo ahí o sobre otro chip del mismo grupo no hace nada (sin toast, sin request a `services`).
5. Mismo modo: soltarlo sobre un chip de **otra** categoría lo asigna (un solo request) y ningún otro chip cambia de lugar.
6. Viaje de ida y vuelta (CAT-06): acomodar a mano un grupo en "Como los ordené yo", pasar a Alfabético, arrastrar un chip de otro grupo a ese grupo, volver a "Como los ordené yo": el orden manual quedó intacto y el recién llegado está último. Recargar y confirmar.
7. Servicios en "Como los ordené yo": soltar un chip sobre otro del mismo grupo lo reordena como antes (Test 9) y la fila propia se sigue resaltando.

## Decisions Made

- Se siguieron las decisiones de discreción del plan (grupo visible, sin resaltado donde nada pasa, matriz automatizada).
- La rama `'assign'` del drop sobre chip usa el grupo visible del destino y no su `category_id` (evita el 23503 con una categoría colgada), tal como pedía el plan.

## Deviations from Plan

None - plan executed exactly as written.

## TDD Gate Compliance

- Task 1: RED `8759702` → GREEN `e4cff13`. En RED la matriz de render falló por aserción sobre el comportamiento pedido (`expected +0 to be 5`); los 4 casos del helper fallaron con `TypeError: chipDragGates is not a function` (el export todavía no existía).
- Task 2: RED `dccc40f` → GREEN `2c0ebca`. Los 4 casos fallaron con `TypeError: chipDropIntent is not a function`: el RED del helper es por ausencia del export, no por aserción. `workflow.tdd_mode` está en false, así que no se corrió `check tdd-red-evidence`.
- Sin REFACTOR: no hizo falta.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- G-23-10a cerrado en código, tests y contrato; queda la UAT visual de arriba.
- Listo para 23-07 (suite completa + G-23-10b según su plan).

---
*Phase: 23-el-panel-que-organiza-el-cat-logo*
*Completed: 2026-09-17*

## Self-Check: PASSED
