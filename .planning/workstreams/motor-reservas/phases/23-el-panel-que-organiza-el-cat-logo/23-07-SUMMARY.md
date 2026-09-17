---
phase: 23-el-panel-que-organiza-el-cat-logo
plan: 07
subsystem: ui
tags: [panel, servicios, accesibilidad, react, tailwind, gap-closure, contratos]
gap_closure: true
gap_ids: [G-23-6b, G-23-6]

requires:
  - phase: 23-el-panel-que-organiza-el-cat-logo
    provides: "ServiceDescription con tres renglones y Ver más medido en la tarjeta pública (23-05); entrada G-23-10a en Cambios post-UAT (23-06)"
provides:
  - "renglón de la descripción (line-clamp-1 + break-words) y link Editar / Agregar descripción en la tarjeta de servicio del panel, abriendo openEditService(s)"
  - "ayuda del campo Descripción corta alineada con la tarjeta pública, en alta y edición"
  - "UI-SPEC, criterio 4 de la Phase 24 y CAT-11 sin la promesa de dos renglones"
affects: [phase-24-CAT-10, verify-work-23]

actuals:
  tokens: 5200
  tasks: 2
  commits: 2
plan_head_before: a48350352cf5789ae1f5be7b4ddc66eda19d6bfd

tech-stack:
  added: []
  patterns:
    - "Botón con estilo de link del panel: <button type=button> + underline underline-offset-2, 44px táctiles en mobile con -my-3 para no agregar un renglón vacío"
    - "Recorte de un renglón con line-clamp-1 + break-words (no truncate, que fuerza nowrap)"

key-files:
  created: []
  modified:
    - app/(dashboard)/settings/settings-client.tsx
    - .planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-UI-SPEC.md
    - .planning/workstreams/motor-reservas/ROADMAP.md
    - .planning/workstreams/motor-reservas/REQUIREMENTS.md

key-decisions:
  - "G-23-6b: la tarjeta del panel muestra un renglón de la descripción y un link Editar / Agregar descripción que llama a openEditService(s); supera a D-06 sólo en ese punto"
  - "G-23-6b: el link no lleva zona de exclusión G-04 porque sólo abre un diálogo que no escribe; si aparece un toque errado, el arreglo es pb-4 en el bloque"
  - "G-23-6: la ayuda del campo pasa a 'Si no entra entera, tu cliente la abre con “Ver más”.' y los contratos (UI-SPEC, Phase 24 criterio 4, CAT-11) dejan de afirmar el recorte a dos renglones"

patterns-established:
  - "Hijo de contenido nuevo en la tarjeta de servicio: siempre con sm:col-start-1 (ahora son seis)"

requirements-completed: [CAT-11]

coverage:
  - id: D1
    description: "Tarjeta del panel: renglón de la descripción recortado y link Editar / Agregar descripción que abre el mismo diálogo que el lápiz, con columna declarada y sin write path nuevo"
    requirement: CAT-11
    verification:
      - kind: other
        ref: "gate por región awk sobre settings-client.tsx (EDIT=2 DESC=4 COL=6 CLAMP=1 BRK=1 UL=2 ADD=2 AL=1)"
        status: pass
      - kind: other
        ref: "from('services') = 6; ./node_modules/.bin/tsc --noEmit sin error TS; eslint 11 errores (piso 11)"
        status: pass
    human_judgment: true
    rationale: "UAT visual pendiente (human-check del Task 1): 375px y desktop, con y sin descripción, palabra larga, teclado, toque sobre la línea de datos, pestaña Desactivados"
  - id: D2
    description: "Ayuda del campo Descripción corta en alta y edición describe el Ver más de la tarjeta pública"
    requirement: CAT-11
    verification:
      - kind: other
        ref: "gate grep: ayuda vieja 0 en panel y UI-SPEC, ayuda nueva 2 en panel y 2 en UI-SPEC"
        status: pass
    human_judgment: true
    rationale: "UAT visual pendiente (human-check del Task 2): la oración completa y el contador 0/120 sin superponerse a 375px"
  - id: D3
    description: "UI-SPEC (copy, E10, Fuera de contrato, entradas G-23-6 / G-23-6b junto a G-23-10a), nota en el criterio 4 de la Phase 24 y en CAT-11 sin tocar su checkbox"
    requirement: CAT-11
    verification:
      - kind: other
        ref: "gates de presencia: G6=1 G6B=1 G10=1 E10=1 P24=1 C11=1 BOX=1"
        status: pass
    human_judgment: false
  - id: D4
    description: "Cierre de los tres planes de gaps: suite completa, migraciones y paquetes"
    verification:
      - kind: unit
        ref: "npx vitest run — 95 archivos, 1301 pasados, 4 expected fail, 1 skipped (piso 1278)"
        status: pass
      - kind: other
        ref: "ls supabase/migrations/*.sql = 41; git diff package.json package-lock.json vacío"
        status: pass
    human_judgment: false

duration: 3min
completed: 2026-09-17
status: complete
---

# Phase 23 Plan 07: Renglón de descripción y link en la tarjeta del panel Summary

**La tarjeta de servicio de `/servicios` muestra un renglón de la descripción (`line-clamp-1` + `break-words`) y un link subrayado `Editar` / `Agregar descripción` que llama a `openEditService(s)` (G-23-6b); la ayuda del campo pasa a decir que el cliente abre el texto largo con "Ver más", y UI-SPEC, Phase 24 y CAT-11 dejan de prometer dos renglones (G-23-6).**

## Performance

- **Duración:** ~3 min
- **Inicio:** 2026-09-17T15:58:21Z
- **Fin:** 2026-09-17T16:01:14Z
- **Tareas:** 2
- **Archivos:** 4 modificados

## Accomplishments

- Tarjeta del panel: un hijo de contenido nuevo debajo del nombre, con `sm:col-start-1`. Con descripción, el renglón recortado y el link `Editar` (`aria-label` `Editar descripción de {servicio}`); sin descripción, sólo `Agregar descripción` (`aria-label` `Agregar descripción a {servicio}`). El lápiz sigue, el diálogo no cambió y no hay acceso nuevo a `services`. El comentario de la estructura dice ahora "seis" hijos.
- Ayuda del campo en alta y edición: `Aparece debajo del nombre en tu página de reservas. Si no entra entera, tu cliente la abre con “Ver más”.`
- UI-SPEC: snippet y fila de copy con la ayuda nueva, filas nuevas para el toggle público y el link del panel, párrafo del 120 / viñeta de superficie pública / fila `long-text` de E10 actualizados, blockquote bajo "Fuera de este contrato", y entradas G-23-6 y G-23-6b en `## Cambios post-UAT` junto a la de G-23-10a.
- ROADMAP (criterio 4 de la Phase 24) y CAT-11 con la nota del contrato nuevo; el checkbox de CAT-11 no se tocó.
- Suite completa en verde como cierre de 23-05, 23-06 y 23-07.

## Task Commits

1. **Task 1: renglón de descripción y link en la tarjeta** - `da07d5a` (feat)
2. **Task 2: ayuda del campo, contratos y suite completa** - `1955323` (feat)

## Files Created/Modified

- `app/(dashboard)/settings/settings-client.tsx` - bloque nuevo en la tarjeta de servicio + ayuda del campo en las dos superficies del form.
- `.planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-UI-SPEC.md` - copy, E10, nota de alcance y entradas post-UAT.
- `.planning/workstreams/motor-reservas/ROADMAP.md` - nota bajo el criterio 4 de la Phase 24.
- `.planning/workstreams/motor-reservas/REQUIREMENTS.md` - nota al final del bullet de CAT-11.

## Decisions Made

Se siguió el plan tal cual: copy literal, `line-clamp-1` + `break-words`, `<button>` y no `<Link>`, sin zona de exclusión G-04 (decisión escrita del plan, documentada en el comentario del código y en el UI-SPEC).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Suite completa: 95 archivos, 1301 pasados, 4 expected fail, 1 skipped, exit 0. No aparecieron los rojos conocidos (timeouts de `test/abono-*.test.ts` ni "Worker exited unexpectedly"), así que no hizo falta re-correr nada aislado.
- eslint sobre `settings-client.tsx`: 11 errores, los preexistentes (ninguno en las líneas tocadas).

## Pending human checks (UAT visual)

No se pudo verificar en navegador; quedan para `/gsd-verify-work` (local, login `test@forjo.local` / `Forjo1234!`):

**Task 1 (`/servicios`, pestaña Activos, a 375px y en desktop):**
1. Con una descripción de 120 caracteres: un solo renglón recortado con "…" debajo del nombre y el link subrayado **Editar** debajo. Con una palabra de 120 letras sin espacios, sin desborde ni scroll horizontal.
2. **Editar** abre el mismo diálogo que el lápiz con la descripción cargada; el lápiz sigue y hace lo mismo.
3. Sin descripción: sólo **Agregar descripción**, abre el mismo diálogo; al guardar una descripción aparece el renglón y el link pasa a **Editar** sin recargar.
4. Teclado: Tab llega al link con anillo de foco visible; Enter abre el diálogo.
5. Desktop: nombre y acciones en la primera fila; renglón y link en la columna izquierda; nada se corre a la columna de acciones.
6. Mobile: tocar el centro de la línea de duración y precio no abre el diálogo.
7. Pestaña Desactivados: mismo comportamiento.

**Task 2:** en el alta y en el diálogo de edición, la ayuda debajo de "Descripción corta" muestra la oración nueva completa y el contador `0/120` a la derecha sin superponerse a 375px.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Los tres planes de gaps de la Phase 23 (23-05, 23-06, 23-07) están ejecutados; falta la UAT visual listada arriba y en 23-05/23-06.
- La Phase 24 ya lee el contrato nuevo de la tarjeta pública (tres renglones, "Ver más" medido, nada interactivo anidado en el botón de selección).

---
*Phase: 23-el-panel-que-organiza-el-cat-logo*
*Completed: 2026-09-17*

## Self-Check: PASSED
