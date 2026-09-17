---
phase: 23-el-panel-que-organiza-el-cat-logo
verified: 2026-09-17T13:20:00Z
status: human_needed
score: 6/6 must-haves verified (0 gaps de código; UAT visual de 23-05/23-06/23-07 pendiente)
covered_files:
  - ".planning/workstreams/motor-reservas/REQUIREMENTS.md"
  - ".planning/workstreams/motor-reservas/ROADMAP.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-01-PLAN.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-01-SUMMARY.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-02-PLAN.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-02-SUMMARY.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-03-PLAN.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-03-SUMMARY.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-04-PLAN.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-04-SUMMARY.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-05-PLAN.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-05-SUMMARY.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-06-PLAN.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-06-SUMMARY.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-07-PLAN.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-07-SUMMARY.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-REVIEW.md"
  - ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-UAT.md"
  - "app/(dashboard)/servicios/page.tsx"
  - "app/(dashboard)/settings/settings-client.tsx"
  - "app/[slug]/booking-client.tsx"
  - "components/booking/service-description.test.tsx"
  - "components/booking/service-description.tsx"
  - "components/dashboard/categorias-manager.test.tsx"
  - "components/dashboard/categorias-manager.tsx"
  - "components/landing/services.tsx"
  - "lib/catalog-panel.ts"
  - "lib/service-categories.ts"
  - "test/catalog-panel.test.ts"
  - "test/service-categories.test.ts"
covered_digest: "v1:sha256:ec25d60c13cfd66c8d8e8b67bb921eecc836bf12bc8a88e9fd3c7912801605f8"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 5/6
  gaps_closed:
    - "CR-01 (VERIFICATION.md previa, truth CAT-02): newService.category/editSvcForm.category saneados contra serviceCategories vigente vía liveCategoryValue/nextSortOrder/categorySiblings — confirmado leyendo settings-client.tsx L1409/L1413/L1521/L1525/L1527"
    - "G-23-6 (23-UAT.md): la descripción de 120 caracteres se lee entera en la tarjeta pública — ServiceDescription compartido (tres renglones a ancho completo + Ver más/Ver menos medido), tarjeta del booking como contenedor con botón estirado, web de marca con el mismo componente (23-05)"
    - "G-23-6b (23-UAT.md): renglón de descripción + link Editar/Agregar descripción en la tarjeta de /servicios, abre el mismo diálogo que el lápiz, sin write path nuevo (23-07)"
    - "G-23-10a (23-UAT.md): el chip se arrastra para asignar con cualquier modo de orden de servicios (chipDragGates/chipDropIntent separan asignar de ubicar); soltar en el propio grupo sin modo personalizado no escribe ni resalta (23-06)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Tarjeta pública del booking (paso 1) y web de marca con una descripción de 120 caracteres (23-05, Task 1 y 2)"
    expected: "A 375px/360px el texto se lee ENTERO a ancho completo sin botón; una palabra de 120 letras sin espacios parte en renglones y muestra 'Ver más', que expande la tarjeta sin avanzar al paso 2 ni seleccionar el servicio; tocar nombre/precio/texto sí selecciona; en desktop (≥640px, dos columnas y la columna de 48ch de la web de marca) aparece 'Ver más'; teclado: Tab enfoca la tarjeta con anillo completo y luego 'Ver más' con su propio anillo; un servicio deshabilitado muestra el motivo y su 'Ver más' igual abre; sin descripción la tarjeta es idéntica a antes; consola sin avisos de hidratación."
    why_human: "Medición real de overflow (ResizeObserver + document.fonts.ready), foco por teclado y ausencia de warnings de hidratación sólo se observan en un navegador; el ejecutor de 23-05 no abrió uno (23-05-SUMMARY.md, 'Pending human checks')."
  - test: "Arrastre de chips con distintas combinaciones de modo de orden en /servicios (23-06)"
    expected: "Con categorías en personalizado y servicios en Alfabético o Por precio, los chips muestran grip y arrastrar uno a otra fila lo asigna sin abrir el diálogo; con categorías en Alfabético las filas pierden grip/flechas pero los chips los conservan; con servicios en Alfabético, 'Mover…' no muestra la sección 'Posición'; con DevTools→Network, pasar un chip sobre su propia fila NO la resalta y soltarlo ahí (o sobre otro chip del mismo grupo) no dispara ningún request; soltarlo sobre otra categoría sí asigna con un solo request; el viaje de ida y vuelta (acomodar a mano, pasar a Alfabético, arrastrar un chip ajeno al grupo, volver a personalizado) conserva el orden manual con el recién llegado último, también tras recargar (CAT-06); con servicios en personalizado, soltar un chip sobre otro del mismo grupo lo sigue reordenando (regresión del Test 9 de la UAT)."
    why_human: "Drag-and-drop nativo, resaltado de filas y ausencia/presencia de requests de red sólo se observan en el navegador; el ejecutor de 23-06 no abrió uno (23-06-SUMMARY.md, 'Human checks pendientes')."
  - test: "Tarjeta de servicio en /servicios (lista del panel) y ayuda del campo Descripción corta (23-07)"
    expected: "Con una descripción de 120 caracteres: un renglón recortado con '…' debajo del nombre y el link subrayado 'Editar' debajo, sin desbordar ni abrir scroll horizontal con una palabra de 120 letras sin espacios; 'Editar' abre el mismo diálogo que el lápiz con la descripción cargada; sin descripción sólo aparece 'Agregar descripción', que abre el mismo diálogo, y al guardar el renglón aparece y el link pasa a 'Editar' sin recargar; teclado: Tab llega al link con anillo visible, Enter abre; en desktop el renglón y el link quedan en la columna izquierda sin correrse a la de acciones; tocar el centro de la línea de duración/precio no abre el diálogo; mismo comportamiento en la pestaña Desactivados; en el alta y en la edición, la ayuda del campo muestra la oración nueva completa con el contador 0/120 sin superponerse a 375px."
    why_human: "Layout responsive, foco por teclado y superposición de texto a 375px no son verificables por grep; el ejecutor de 23-07 no abrió un navegador (23-07-SUMMARY.md, 'Pending human checks')."
---

# Phase 23: El panel que organiza el catálogo — Reporte de re-verificación

**Phase Goal:** Que el dueño pueda usar lo que la Phase 22 volvió declarable, en la pantalla donde ya administra sus servicios: crea, renombra y borra categorías; asigna una o ninguna a cada servicio (nunca obligatorio); las reordena arrastrando y con ▲/▼; elige los dos modos de orden para todo el negocio; y escribe la descripción corta (CAT-11, tope 120 con contador) que el cliente ve en el booking.
**Verified:** 2026-09-17
**Status:** human_needed
**Re-verification:** Sí — después del cierre de gaps (23-05, 23-06, 23-07)

## Goal Achievement

### Observable Truths

| # | Truth (Roadmap SC) | Status | Evidencia |
|---|---|---|---|
| 1 | CAT-01: crear/renombrar/borrar categorías; duplicado case-insensitive lo rechaza la base con copy propia | ✓ VERIFIED | Sin cambios de código en esta ronda; `classifyCategoryWriteError`/`CATEGORY_WRITE_REJECT_COPY` siguen en `lib/catalog-panel.ts`, 73/73 tests verdes; los Tests 1, 7 y 8 de `23-UAT.md` (crear, renombrar in situ, borrar con confirmación) ya se corrieron en navegador con resultado `pass` |
| 2 | CAT-02: asignar una categoría o ninguna a cada servicio, nunca obligatorio | ✓ VERIFIED | **CR-01 cerrado**: `liveCategoryValue`/`nextSortOrder`/`categorySiblings` (importados en `settings-client.tsx:20`) sanean `newService.category`/`editSvcForm.category` contra `serviceCategories` vigente antes de escribir (L1409, L1413, L1521, L1525, L1527) — confirmado leyendo el código, no sólo el texto del review. **G-23-10a cerrado**: `chipDragGates`/`chipDropIntent` (`lib/catalog-panel.ts:190-222`) separan "puede arrastrar para asignar" (`categoryCount > 0`) de "puede ubicar" (`serviceCustom && hasGrouping`); los dos `ServiceChip` toman `canDrag={chipGates.canDrag}` (`categorias-manager.tsx:900,950`); matriz de render de servidor (`categorias-manager.test.tsx`) congela 5 chips arrastrables en las 5 combinaciones de modos. Advertencia no bloqueante nueva: **WR-01** (rama `'place'` del drop sobre chip sigue usando `target.category_id` en vez del grupo visible — ver Anti-Patrones) |
| 3 | CAT-03: reordenar categorías arrastrando y con ▲/▼; el orden persiste renumerando la lista completa de hermanas | ✓ VERIFIED | Sin cambios de código en esta ronda; `renumber`/`moveWithinList`/`persistCategoryOrder`/`reorderCategory` intactos y testeados. Los fixes del review anterior (WR-01..WR-05 de esa ronda) siguen en pie, confirmados por `23-REVIEW.md` de este round ("Los fixes del review anterior están bien... No encontré regresiones"). Advertencia no bloqueante nueva: **WR-02** (ventana de carrera entre `confirmMove` y un drop en vuelo sobre `savingServiceOrder` — ver Anti-Patrones) |
| 4 | CAT-04/CAT-05: dos modos de orden por negocio; con modo ≠ personalizado los controles de reordenar desaparecen | ✓ VERIFIED | Sin cambios funcionales; `saveCategorySortMode`/`saveServiceSortMode`/`sortCategories` intactos. G-23-10a *alinea* la tabla de gates del `23-UI-SPEC.md` (líneas 355-360) con la regla real: el arrastre del **chip** (asignar) ya no depende del modo de servicios — sólo **ubicar** (chip sobre chip, sección "Posición") sigue detrás de `service_sort_mode === 'custom'`, gate que `posicionDisponible = chipGates.canPlace` sigue cumpliendo exactamente igual que antes |
| 5 | CAT-11: descripción corta con tope duro de 120 y contador, igual a lo que la tarjeta del booking ya renderiza | ✓ VERIFIED | **G-23-6 cerrado**: `ServiceDescription` (`components/booking/service-description.tsx`) recorta a tres renglones a ancho completo con "Ver más"/"Ver menos" sólo si desborda medido (`ResizeObserver` + `document.fonts.ready`, nunca contando caracteres); la tarjeta del paso 1 del booking pasa de `<button>` a contenedor con el botón de selección estirado (`after:absolute after:-inset-px`) y la descripción/el motivo como hermanos por `aria-describedby` — gate por región confirma 0 controles anidados dentro del botón de selección; la web de marca (`components/landing/services.tsx`) usa el mismo componente. **G-23-6b cerrado**: la tarjeta de `/servicios` muestra un renglón (`line-clamp-1` + `break-words`) y un link `Editar`/`Agregar descripción` que llama a `openEditService(s)` — la misma función que el lápiz, cero escrituras nuevas (`from('services')` sigue en 6 líneas). Ayuda del campo actualizada en alta y edición para describir "Ver más". 9 tests nuevos de `ServiceDescription` + 8 de la matriz de render, todos verdes |
| 6 | Invariante D-07 (arquitectura interna, condición dura de todos los planes): un único productor (`categoryPatch`) y un único traductor (`mapCategoryWriteError`) de `services.category_id`, con exactamente un `update` suelto (`assignServiceCategory`) | ✓ VERIFIED | Sigue habiendo exactamente un `update` de la columna vía `categoryPatch`, dentro de `assignServiceCategory` — confirmado con el mismo gate `awk` que usa el plan 23-06 (N=1, INSIDE=1); ninguna de las tres ramas nuevas del drop de chip (`'place'`/`'assign'`/`'none'`) agrega un escritor propio |

**Score:** 6/6 truths verificadas por código + tests (el gap de código que bloqueaba a CAT-02 en la ronda anterior, CR-01, está cerrado y confirmado leyendo el código actual; los tres gaps de la UAT — G-23-6, G-23-6b, G-23-10a — también). Ningún truth quedó `behavior_unverified`: la lógica de decisión de cada comportamiento nuevo (helpers puros `chipDragGates`/`chipDropIntent`/`descriptionOverflows`/`showDescriptionToggle`, más una matriz de render de servidor) está testeada de forma exhaustiva. Lo que sigue pendiente es la confirmación visual en navegador de las tres superficies que tocaron los planes de gaps (booking público + web de marca, arrastre de chips, tarjeta del panel) — nadie abrió uno durante 23-05/23-06/23-07 — y por eso el status de esta verificación es `human_needed`, no `passed`.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `lib/catalog-panel.ts` | Reglas puras existentes + `chipDragGates`, `chipDropIntent` (G-23-10a) | ✓ VERIFIED | Los dos helpers nuevos existen (`:190`, `:214`), con JSDoc y sin imports de React/Supabase/next |
| `test/catalog-panel.test.ts` | Tablas de verdad de `chipDragGates`/`chipDropIntent` | ✓ VERIFIED | 8 casos nuevos, corridos ahora: verdes junto con el resto (86/86 en la corrida focalizada) |
| `components/dashboard/categorias-manager.tsx` | Chips cableados a `chipGates.canDrag`, `posicionDisponible` derivado de `canPlace`, drop gobernado por `chipDropIntent` | ✓ VERIFIED | Confirmado: `chipGates` en L238, `canDrag={chipGates.canDrag}` en L900/L950, `chipDropIntent(` usado en L535/L782/L926, `grupoVisibleDe` en L254 y 3+ usos |
| `components/dashboard/categorias-manager.test.tsx` | Matriz de render de servidor de los 5 modos + cero categorías | ✓ VERIFIED (NUEVO) | Existe, co-ubicado, `renderToStaticMarkup`, corrido ahora: verde |
| `components/booking/service-description.tsx` | Párrafo recortado a 3 renglones + toggle medido | ✓ VERIFIED (NUEVO) | Existe, `'use client'`, exporta `descriptionOverflows`, `showDescriptionToggle`, `ServiceDescription`; sin `dangerouslySetInnerHTML` |
| `components/booking/service-description.test.tsx` | Helpers puros + render de servidor sin botón/con auto-escape | ✓ VERIFIED (NUEVO) | 9 casos, corridos ahora: verdes |
| `app/[slug]/booking-client.tsx` | Tarjeta del paso 1 como contenedor con botón estirado; `ServiceDescription` como hermana | ✓ VERIFIED | Confirmado leyendo la región completa del `map` (L568-663): 0 controles anidados dentro del botón de selección, `aria-describedby` presente, import correcto |
| `components/landing/services.tsx` | Misma descripción con `ServiceDescription` | ✓ VERIFIED | Import + uso confirmados, sigue siendo Server Component (sin `'use client'`), sin `line-clamp-2` residual |
| `app/(dashboard)/settings/settings-client.tsx` | Cableado del organizador + campos del form + renglón/link en la tarjeta (G-23-6b) + ayuda actualizada | ✓ VERIFIED | Bloque nuevo confirmado en la región de la tarjeta (L2758-2770): dos aperturas del diálogo (lápiz + link), `sm:col-start-1` en 6 hijos, `line-clamp-1`+`break-words`; ayuda nueva en L2965 y L3068; `from('services')` sigue en 6 |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `app/(dashboard)/servicios/page.tsx` | `components/dashboard/categorias-manager.tsx` | prop `initialServiceCategories` → `SettingsClient` → organizador | ✓ WIRED | Sin cambios; confirmado en la ronda anterior |
| Chip de servicio | `chipDragGates`/`chipDropIntent` | `canDrag={chipGates.canDrag}` en las dos llamadas a `ServiceChip`; `chipDropIntent(...)` en el resaltado y el drop | ✓ WIRED | Confirmado por grep en `categorias-manager.tsx` (`chipDropIntent(` ×3, `grupoVisibleDe(` ×6+) |
| Tarjeta del paso 1 del booking | `ServiceDescription` | hermana del botón de selección, `aria-describedby` hacia su `id` | ✓ WIRED | Confirmado leyendo la región completa: la descripción está fuera del `<button>`, referenciada por `aria-describedby` |
| Botón de selección de la tarjeta | toda la superficie de la tarjeta | pseudo-elemento `after:absolute after:-inset-px` dentro de `relative isolate` | ✓ WIRED | Confirmado; el toggle usa `relative z-10` para quedar por encima |
| `components/landing/services.tsx` | `ServiceDescription` | import desde `@/components/booking/service-description` | ✓ WIRED | Confirmado, mismo componente que el booking |
| Link "Editar"/"Agregar descripción" de la tarjeta del panel | diálogo de edición del servicio | `onClick={() => openEditService(s)}`, la misma llamada que el lápiz | ✓ WIRED | Confirmado: 2 aperturas del diálogo en la región de la tarjeta (lápiz + link), cero accesos nuevos a `services` |
| Form de alta/edición, arrastre, diálogo Mover | `services.category_id` | `categoryPatch` como única fuente, saneado por `liveCategoryValue` | ✓ WIRED (gap cerrado) | A diferencia de la ronda anterior, el borrador que alimenta `categoryPatch` ya no puede quedar obsoleto: `liveCategoryValue` lo sanea contra `serviceCategories` vigente antes de escribir |

### Anti-Patrones encontrados (del code review de esta ronda, `23-REVIEW.md`, 0 críticos / 2 warnings / 4 info)

| Archivo | Severidad | Hallazgo | Impacto en must-haves |
|---|---|---|---|
| `categorias-manager.tsx:545-556` (WR-01, nuevo) | ⚠️ Warning | La rama `'place'` del drop sobre chip (modo personalizado con agrupación) sigue calculando el destino con `fromCategoryId(target.category_id)` en vez del grupo visible que sí usa la rama `'assign'`; con un destino "suelto" que tiene una categoría colgada, puede rebotar con 23503 en vez de asignar "Sin categoría" | Caso de borde dentro de CAT-02/CAT-03: sólo se alcanza soltando un chip **sobre otro chip** (no sobre la fila) cuando el destino tiene una categoría borrada colgada; el camino principal (soltar sobre la fila, o el diálogo "Mover…") no lo pisa |
| `categorias-manager.tsx:453-454, 559-564, 669-687` (WR-02, nuevo) | ⚠️ Warning | `persistServiceOrder` sale en silencio (`return` sin toast) si `savingServiceOrder` ya está en `true`; `confirmMove` y la rama `'place'` de un drop no comparten una sola bandera antes del primer `await`, así que dos escrituras de orden casi simultáneas (un drop en vuelo + confirmar "Mover…") pueden hacer que la segunda se descarte sin avisar | Ventana de carrera de baja probabilidad (requiere dos gestos casi simultáneos del mismo dueño); no rompe el camino feliz de CAT-03 |
| `settings-client.tsx:2762-2769` (IN-03) | ℹ️ Info | El link "Editar descripción de X" abre el diálogo completo sin enfocar el campo de descripción | Cosmético de accesibilidad, no bloquea CAT-11 |
| `booking-client.tsx:590-599, 640-646` (IN-04) | ℹ️ Info | El hover de "selecciona el servicio" se pinta también al pasar el mouse por "Ver más"; el texto de la descripción no es seleccionable (el pseudo-elemento del botón lo cubre) | Señal visual ambigua en desktop, no bloquea CAT-11 |
| `categorias-manager.tsx:131-135, 773-786, 920-928` (IN-01) | ℹ️ Info | Con intent `'none'` el `onDragOver` sigue sin poner `dropEffect = 'none'`: el cursor muestra "mover" donde el drop no hace nada | Cosmético, no bloquea CAT-02/CAT-05 |
| `categorias-manager.tsx:458, 472-476` (IN-02) | ℹ️ Info | Doble fallo (asignación guardada + reorden fallido + relectura fallida) puede dejar el estado local con la categoría nueva pero la posición vieja hasta la próxima carga | Ventana de borde, se autocorrige al recargar |

Warnings de la ronda anterior (CR-01 y el WR-01..WR-05 del `23-REVIEW.md` original) confirmados **cerrados** por `23-REVIEW.md` de esta ronda ("Los fixes del review anterior están bien... No encontré regresiones") y re-confirmados leyendo el código: `liveCategoryValue`/`nextSortOrder`/`categorySiblings` en uso, sin re-implementaciones locales.

No se encontraron `TBD`/`FIXME`/`XXX` en los archivos tocados por esta fase (incluidos los de los tres planes de gaps).

**Documentación no bloqueante, pre-existente y sin cambios en esta ronda:** la tabla de Traceability de `REQUIREMENTS.md` (líneas 95-105) sigue diciendo "Pendiente" para los 6 requisitos de la fase, y los checkboxes del bloque "Modelo y panel" quedan en un estado mixto (`CAT-02`/`CAT-05`/`CAT-06` marcados, `CAT-01`/`CAT-03`/`CAT-04`/`CAT-11` sin marcar) — un estado que ya existía antes de esta ronda de gaps y que 23-07 dejó intacto a propósito ("no se marca ningún checkbox, eso lo hace el cierre de la fase"). No afecta ningún must-have.

### Requirements Coverage

| Requirement | Source Plan | Descripción | Status | Evidencia |
|---|---|---|---|---|
| CAT-01 | 23-01, 23-03 | Crear/renombrar/borrar categorías; duplicado rechazado por la base | ✓ SATISFIED | Sin cambios; código + tests + UAT en navegador (Tests 1, 7, 8) |
| CAT-02 | 23-01, 23-02, 23-03, 23-06 | Asignar una categoría o ninguna, nunca obligatorio | ✓ SATISFIED | CR-01 cerrado (saneamiento del borrador) + G-23-10a cerrado (arrastre del chip en cualquier modo) |
| CAT-03 | 23-01, 23-03, 23-04, 23-06 | Reordenar arrastrando y con ▲/▼, renumerando la lista completa | ✓ SATISFIED | Mecánica intacta y testeada; WR-01/WR-02 son advertencias de borde, no bloquean el camino principal |
| CAT-04 | 23-04 | Elegir los dos modos de orden para todo el negocio | ✓ SATISFIED | Sin cambios funcionales |
| CAT-05 | 23-01, 23-04, 23-06 | Controles de reordenar desaparecen fuera de modo personalizado | ✓ SATISFIED | Tabla de gates alineada: ubicar sigue detrás del modo; asignar (chip) ya no, por decisión explícita del usuario (G-23-10a) |
| CAT-11 | 23-02, 23-05, 23-07 | Descripción corta con tope de 120 y contador, igual a lo que el cliente lee | ✓ SATISFIED | G-23-6 (tarjeta pública) + G-23-6b (tarjeta del panel) cerrados; ayuda del campo alineada |

Sin requisitos huérfanos: los 6 IDs de la fase están declarados en el frontmatter de al menos un PLAN (incluidos los 3 planes de gaps) y en `REQUIREMENTS.md`.

### Behavioral Spot-Checks

| Comportamiento | Comando | Resultado | Status |
|---|---|---|---|
| Tests de los tres archivos nuevos/tocados por los gaps (`catalog-panel`, `categorias-manager`, `service-description`) | `npx vitest run components/booking/service-description.test.tsx test/catalog-panel.test.ts components/dashboard/categorias-manager.test.tsx` | 3 archivos, 86 tests, 0 fallos | ✓ PASS |
| Typecheck filtrado | `./node_modules/.bin/tsc --noEmit \| grep -v '^\.next/' \| grep "error TS"` | Sin salida | ✓ PASS |
| Cero migraciones nuevas (D-09) | `ls supabase/migrations/*.sql \| wc -l` | 41 | ✓ PASS |
| Cero paquetes nuevos | `git diff -- package.json package-lock.json` | Sin salida | ✓ PASS |
| CR-01 reproducible ya NO lo es | lectura directa de `liveCategoryValue`/`addService`/`saveEditService` | El borrador se sanea contra `serviceCategories` vigente antes de escribir | ✓ CONFIRMADO (fix real) |
| Sin write path nuevo en la tarjeta del panel (G-23-6b) | `grep -c "from('services')" settings-client.tsx` | 6 (igual que antes del plan) | ✓ PASS |
| WR-01 (nuevo) reproducible en código | lectura directa de `dropServiceOnChip`, rama `'place'` | `const destino = fromCategoryId(target.category_id)`, no `grupoDestino` | ✓ CONFIRMADO (defecto de borde, no bloqueante) |

Suite completa (`npx vitest run`) no se volvió a correr en esta verificación: el orquestador ya la corrió sobre este mismo HEAD (5063038) con resultado 95 archivos / 1301 pasados / 4 expected fail / 1 skipped, evitando una segunda corrida completa redundante. Se corrió sí, de forma focalizada, la suite de los tres archivos que tocan los planes de gaps (86/86, arriba) como evidencia independiente de este verificador.

### Probe Execution

No aplica — la fase no declara probes (`scripts/*/tests/probe-*.sh`) ni los planes de gaps los mencionan.

## Human Verification Required

Ningún plan de gaps (23-05, 23-06, 23-07) tuvo UAT visual: los tres SUMMARY lo dejan explícito en su sección "Pending human checks" / "Human checks pendientes", y así lo confirma el contexto de este run. Las truths de código ya están VERIFIED (helpers puros, matrices de render y gates de wiring cubren la lógica de decisión), pero las tres superficies que tocaron los planes de gaps necesitan confirmación visual antes de dar el cierre por terminado de punta a punta:

### 1. Tarjeta pública del booking y web de marca (23-05)
**Test:** Cargar una descripción de 120 caracteres con espacios en un servicio; abrir `/negocio-prueba` a 375px/360px y en desktop; probar también una palabra de 120 letras sin espacios.
**Expected:** El texto de 120 se lee entero sin botón a mobile; el texto que desborda muestra "Ver más", expande la tarjeta y nunca selecciona el servicio ni avanza al paso 2; tocar el resto de la tarjeta sí selecciona; foco por teclado con anillos propios en tarjeta y toggle; sin avisos de hidratación en consola.
**Why human:** Medición real de overflow (`ResizeObserver` + `document.fonts.ready`) y foco por teclado sólo se observan en un navegador.

### 2. Arrastre de chips con los cinco modos combinados (23-06)
**Test:** En `/servicios` con 3 categorías y servicios repartidos, combinar los dos ejes de modo (categorías: personalizado/alfabético; servicios: personalizado/alfabético/precio) y arrastrar chips; con DevTools→Network abierto, soltar sobre el propio grupo y sobre otro.
**Expected:** El chip siempre tiene grip y se puede arrastrar a otra categoría si hay al menos una; el reorden chip-sobre-chip y la sección "Posición" sólo aparecen con servicios en personalizado; soltar en el propio grupo sin ese modo no resalta ni dispara request; el viaje de ida y vuelta (CAT-06) conserva el orden manual.
**Why human:** Drag-and-drop nativo, resaltado de filas y tráfico de red no son verificables por grep.

### 3. Tarjeta del panel y ayuda del campo (23-07)
**Test:** En `/servicios`, pestañas Activos y Desactivados, ver la tarjeta de un servicio con y sin descripción, a 375px y en desktop; abrir el alta y la edición para leer la ayuda del campo.
**Expected:** Un renglón recortado + link "Editar"/"Agregar descripción" que abre el mismo diálogo que el lápiz y se actualiza sin recargar; sin desborde con una palabra larga; nada se corre a la columna de acciones en desktop; la ayuda nueva se lee completa sin superponerse al contador a 375px.
**Why human:** Layout responsive y foco por teclado no son verificables por grep.

## Gaps Summary

No hay gaps de código en esta ronda. El único gap formal de la `VERIFICATION.md` anterior (CR-01, que bloqueaba CAT-02) está cerrado y confirmado leyendo el código actual (`liveCategoryValue` saneando los dos borradores del form). Los tres gaps que salieron de la UAT (G-23-6, G-23-6b, G-23-10a — G-23-10b fue retirado por el usuario) también están cerrados en código, con tests unitarios y de render de servidor verdes, `tsc` limpio, cero migraciones y cero paquetes nuevos, y sin ningún write path nuevo sobre `services`.

El code review de esta ronda (`23-REVIEW.md`) encontró 0 críticos y 2 warnings nuevos (WR-01, WR-02), ambos casos de borde de baja probabilidad que no rompen el camino principal de ningún must-have — se documentan arriba como deuda menor, en la misma categoría que los WR-01..05/IN-01..05 que ya quedaron registrados (y varios de ellos cerrados) en la ronda anterior.

Lo único que falta para un `passed` de punta a punta es la UAT visual de las tres superficies que tocaron los planes de gaps: nadie abrió un navegador durante 23-05, 23-06 ni 23-07. Por eso el status de este reporte es `human_needed`. **Camino recomendado:** correr los tres bloques de Human Verification de arriba (o el checkpoint humano de `/gsd-verify-work`) antes de cerrar la fase; si aparece algo, es candidato a un cuarto plan chico de gap closure. Los warnings WR-01/WR-02 pueden quedar como deuda a revisar en un cierre de backlog posterior — no bloquean ningún must-have de este verificador.

---

_Verified: 2026-09-17_
_Verifier: Claude (gsd-verifier)_
