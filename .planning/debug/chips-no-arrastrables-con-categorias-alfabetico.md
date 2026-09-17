---
status: diagnosed
trigger: "G-23-10a (chips-no-arrastrables-con-categorias-alfabetico): con el orden de categorías en Alfabético, el dueño ya no puede arrastrar un chip de servicio a otra categoría; sólo funciona el modal Mover …"
created: 2026-09-17T00:00:00Z
updated: 2026-09-17T00:20:00Z
goal: find_root_cause_only
---

## Current Focus

bug_class: Bohrbug (determinista: gate de render por prop; no hay timing)
hypothesis: CONFIRMADA (H2) — el ORIGEN del gesto de asignación (el chip) está gateado SÓLO por el modo de SERVICIOS (`canDrag={serviceCustom}`, L869/L914 → L117/L146). El modo de categorías no participa. El usuario tenía el eje servicios en no-personalizado (captura sin grip en chips; DB local con service_sort_mode=alpha; orden de chips de la captura = precio ascendente) y atribuyó la pérdida al selector de categorías, que es el único que está en la misma Card que los chips.
next_action: devolver ROOT CAUSE FOUND (goal: find_root_cause_only)

reasoning_checkpoint:
  hypothesis: "El arrastre del chip entre categorías se pierde porque `ServiceChip` recibe `canDrag={serviceCustom}` (serviceSortMode === 'custom'), y ese flag apaga `draggable` y el grip del chip — el origen del gesto de ASIGNACIÓN — siempre que el eje SERVICIOS esté en Alfabético o Por precio, aunque asignar no sea reordenar. El modo de categorías no influye."
  confirming_evidence:
    - "Matriz SSR: categorías=alpha + servicios=custom ⇒ 5/5 chips draggable; servicios=alpha|price ⇒ 0/5, con cualquier modo de categorías."
    - "Destinos del chip (fila L748-761, sueltos L889-897, dropServiceOn L496-507, dropServiceOnChip L513-516) sin gate de modo; dropServiceOnChip ya degrada a sólo-asignar sin posición."
    - "Captura sin grip en chips ⇒ canDrag false ⇒ servicios ≠ custom; DB local del negocio de la UAT: service_sort_mode = alpha persistido; orden de chips de la captura coincide con precio ascendente."
    - "Contrato: 23-03-PLAN E3 / 23-04-PLAN L236 / UI-SPEC L352 y L630 mandan gatear el drag del chip por el eje servicios; el snippet UI-SPEC L314 (`|| categories.length > 0`) lo dejaba vivo y 23-03-SUMMARY L117 declara que se descartó."
  falsification_test: "En el navegador, con 'Orden de las categorías' = Alfabético y 'Orden de los servicios' = 'Como los ordené yo', arrastrar un chip a otra fila: si NO asigna, la hipótesis cae (habría un bloqueo en runtime que el SSR no ve). Y con categorías = personalizado y servicios = Alfabético, si el chip SÍ se arrastra, también cae."
  fix_rationale: "(sólo dirección, modo diagnóstico) Separar el gate del ORIGEN del gesto chip del gate de REORDEN: el chip arrastrable cuando hay a dónde asignarlo (≥1 categoría), y la posición (chip sobre chip del mismo grupo) sigue gateada por `posicionDisponible`, que ya existe. Ataca la causa (gate del eje equivocado para la asignación), no el síntoma."
  blind_spots: "No se ejecutó un arrastre nativo real en navegador con categorías=alpha + servicios=custom (no hay Playwright en el repo); el SSR prueba el atributo `draggable`, no el gesto. Riesgo bajo: el `<li>` no arrastrable no impide arrastrar un hijo `draggable=true`, y el test 9 probó que el botón-chip arrastra en el navegador del usuario. Tampoco se sabe con certeza si el usuario llegó a probar el arrastre con servicios en personalizado y categorías en alfabético."
  candidate_causes:
    - "code: `canDrag={serviceCustom}` en L869/L914 (gate del eje servicios sobre el gesto de asignación) — CONFIRMADA"
    - "code: destino fila/chip compartiendo el gate `categoryCustom` del reorden de filas — ELIMINADA (H1)"
    - "config/data: `service_sort_mode` persistido en alpha/price en el negocio de la UAT (el usuario no lo tenía en personalizado) — CONFIRMADA como condición disparadora"
    - "spec/diseño: contradicción UI-SPEC (snippet L314 vs tabla L352/estado L630), resuelta en 23-03 hacia 'el drag del chip es sólo atajo de reorden' — causa de origen del gate"
    - "UX/config de pantalla: el selector 'Orden de los servicios' vive en otra Card (settings-client L2634-2648), lejos de los chips — explica la atribución errónea al selector de categorías"
  and_gate: "sí — el síntoma requiere (1) el gate `canDrag = serviceCustom` Y (2) el eje servicios en no-personalizado. El modo de categorías en Alfabético es coincidente (el flujo del test 10 pone los dos ejes en no-personalizado), no contribuyente."

## Symptoms

expected: El modo de orden de las categorías sólo decide cómo se ordenan las FILAS. Asignar un servicio a otra categoría arrastrando su chip a otra fila (o sobre un chip de otro grupo) debería seguir funcionando con "Orden de las categorías" en Alfabético (A-Z): cambiar la categoría de un servicio no es reordenar categorías.
actual: El usuario reportó: si elijo alfabético en las categorías, ya no puedo pasar servicios de una a otra; los chips sólo se mueven haciéndoles clic y eligiendo en el modal. Screenshot: "Orden de las categorías: Alfabético (A-Z)", filas Barba / Color / Cortes con chips (Premium; Prueba, Barba, ASADdD; Corte), sin grip en chips ni en filas. (Reordenar servicios dentro de una categoría funciona vía Posición y chip sobre chip — fuera de alcance.)
errors: ninguno
reproduction: Test 10 de la UAT (.planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-UAT.md)
started: descubierto en la UAT de la phase 23 (2026-09-17)

## Eliminated

- hypothesis: H1 — el modo de categorías en Alfabético apaga el gesto de asignación (el destino "fila" comparte el gate del reorden de filas, o el `draggable` del chip combina los dos modos)
  evidence: onDragOver/onDrop de la fila (L748-761), del grupo sueltos (L889-897), `dropServiceOn` (L496-507) y `dropServiceOnChip` (L513-516) no leen `categoryCustom`; `canDrag` del chip sólo lee `serviceCustom` (L869/L914). Matriz SSR: categorías=alpha + servicios=custom ⇒ 5/5 chips draggable="true" con grip. Sólo `draggable` de la FILA (L741) y `dropCategoryOn` (L485) leen `categoryCustom`, y ninguno interviene cuando el gesto es de un chip (L759).
  timestamp: 2026-09-17T00:15:00Z

- hypothesis: H3 — `serviceSortMode` llega `undefined`/desactualizado al organizador y `serviceCustom` queda false aunque el negocio esté en personalizado
  evidence: settings-client.tsx L1161 inicializa con `business.service_sort_mode ?? 'custom'` y L2625 pasa el estado vivo; ae36e76 reemplazó la lectura de `business` por la prop. El test 9 (chip→fila asigna) y el 11 (Posición visible en personalizado) pasaron en la UAT.
  timestamp: 2026-09-17T00:16:00Z

## Evidence

- timestamp: 2026-09-17T00:00:00Z
  checked: .planning/debug/knowledge-base.md y resolved/
  found: no existe knowledge-base.md; resolved/ sólo tiene gcal-orphan-on-delete.md (sin relación). MemPalace no consultado (no disponible en este entorno).
  implication: sin patrón conocido; investigación abierta.

- timestamp: 2026-09-17T00:05:00Z
  checked: components/dashboard/categorias-manager.tsx — gates del ORIGEN del gesto chip
  found: |
    L223 `const categoryCustom = categorySortMode === 'custom'`; L225 `const serviceCustom = serviceSortMode === 'custom'`.
    Chips de categoría: L869 `canDrag={serviceCustom}`; chips de sueltos: L914 `canDrag={serviceCustom}`.
    En ServiceChip: L117 `draggable={canDrag}`, L138 cursor-grab con canDrag, L146 `{canDrag && <GripVertical …/>}`.
    Ningún prop del chip lee `categoryCustom`/`categorySortMode`.
  implication: el chip deja de ser arrastrable EXACTAMENTE cuando el modo de SERVICIOS no es 'custom'; el modo de categorías no participa en el origen del gesto (b).

- timestamp: 2026-09-17T00:06:00Z
  checked: categorias-manager.tsx — DESTINOS del gesto chip (fila, sueltos, chip) y sus handlers
  found: |
    Fila de categoría L741 `draggable={categoryCustom && renamingId !== c.id && !savingOrder}` (gesto (a), correcto por D-12).
    Pero onDragOver L748-755 y onDrop L757-761 NO tienen gate de modo: con `draggingServiceId` llaman a `setDropTargetId` / `dropServiceOn(c.id)`.
    Grupo "Sin categoría" L889-897: sin gate de modo.
    `dropServiceOn` L496-507: sin gate de modo (sólo `assigning` y no-op si ya está en ese destino).
    `dropServiceOnChip` L513-516: si `!posicionDisponible` (L231 = serviceCustom && hayAgrupacion) cae a `dropServiceOn` (sólo asigna); nunca rechaza por modo de categorías.
    `dropCategoryOn` L485 sí corta con `!categoryCustom`, pero sólo se llama si NO hay `draggingServiceId` (L759-760).
  implication: con categorías=alpha el destino sigue aceptando chips. Si el chip arranca el gesto, la asignación funciona. El único bloqueo posible del gesto (b) es el origen (canDrag = serviceCustom).

- timestamp: 2026-09-17T00:07:00Z
  checked: captura del usuario (descrita en symptoms) vs. L146
  found: "sin grip en chips ni en filas". El grip del chip se pinta iff `canDrag` iff `serviceSortMode === 'custom'` (L146 + L869/L914).
  implication: en el momento de la captura el modo de SERVICIOS NO era personalizado (alpha o price). La captura contradice que el único modo no-custom fuera el de categorías. Filas sin grip = categorías alpha (L778), coherente.

- timestamp: 2026-09-17T00:08:00Z
  checked: app/(dashboard)/settings/settings-client.tsx L1160-1161, L2616-2626, L2634-2648, L1872-1891
  found: los dos modos son estado del padre con `?? 'custom'` (undefined no puede apagar `serviceCustom`); `serviceSortMode` se pasa en vivo al organizador. El selector "Orden de los servicios" vive en OTRA Card, debajo del organizador (L2627-2648), fuera del colapso; el de categorías vive dentro de la Card del organizador (L704-717).
  implication: no hay acoplamiento entre modos ni prop desactualizada. Al estar el selector de servicios fuera de la Card donde se arrastra, es fácil atribuir el efecto al selector de categorías, que es el único visible junto a los chips.

- timestamp: 2026-09-17T00:09:00Z
  checked: contrato — 23-UI-SPEC.md L314, L329, L351-355, L630; 23-03-PLAN.md L31, L390, L452; 23-04-PLAN.md L24, L233-237, L273-275; 23-03-SUMMARY.md L38, L117; 23-CONTEXT.md D-05/D-06/D-07 (L62-87), D-12 (L140-141)
  found: |
    UI-SPEC snippet L314: `draggable={serviceMode === 'custom' || categories.length > 0}` (el chip seguía arrastrable para ASIGNAR con categorías aunque el modo de servicios no fuera custom).
    UI-SPEC tabla L352 y estado L630: "Grip del chip … service_sort_mode === 'custom'"; "lo que desaparece es el atajo de arrastre" — contradice el snippet.
    23-03-PLAN E3 (L31) y done L452 ("el arrastre y sus controles de reorden sólo con el modo personalizado de su eje") mandan gatear. 23-03-SUMMARY L38/L117: desviación declarada, se siguió el plan y NO el snippet.
    23-04-PLAN L236: "el grip del chip y su atributo de arrastre … solo con el eje servicios en personalizado".
    CONTEXT D-05/D-06: el arrastre de chips es un camino de ASIGNACIÓN (incluso "asignar en lote"); D-12 apunta a "controles de reordenar". Asignar no es reordenar.
  implication: el contrato tiene una contradicción interna (snippet vs tabla/estado) y el plan resolvió hacia el lado que trata el arrastre del chip SOLO como reorden. El gesto de asignación quedó gateado por el eje servicios por decisión de plan, no por un bug de implementación. REVIEW-FIX WR-02/WR-03 no tocaron los gates (sólo posición de llegada y placeOnTarget).

- timestamp: 2026-09-17T00:15:00Z
  checked: EXPERIMENTO — matriz de render SSR (renderToStaticMarkup vía tsx, script en el scratchpad, sin tocar código) de CategoriasManager con 3 categorías Cortes/Barba/Color (sort_order no alfabético) y 5 servicios con los nombres de la captura
  found: |
    categorias=custom servicios=custom | chipsDraggable=5/5 | filasDraggable=3/3 | grips=8
    categorias=alpha  servicios=custom | chipsDraggable=5/5 | filasDraggable=0/3 | grips=5 (los 5 de chip)
    categorias=custom servicios=alpha  | chipsDraggable=0/5 | filasDraggable=3/3 | grips=3
    categorias=alpha  servicios=alpha  | chipsDraggable=0/5 | filasDraggable=0/3 | grips=0
    categorias=alpha  servicios=price  | chipsDraggable=0/5 | filasDraggable=0/3 | grips=0
  implication: CONFIRMADO por observación directa: el modo de categorías NO cambia la arrastrabilidad de los chips (5/5 con categorías alpha + servicios custom). Sólo el modo de servicios la apaga. La captura "sin grip en chips ni en filas" corresponde únicamente a las filas 4 o 5 de la matriz (servicios ≠ custom).

- timestamp: 2026-09-17T00:17:00Z
  checked: DB local (docker supabase_db_forjo-app) — businesses con categorías
  found: único negocio con categorías = `negocio-prueba` (el de la UAT), con `category_sort_mode = custom` y `service_sort_mode = alpha` PERSISTIDO. Categorías en orden manual Color / Barba / Cortes (la captura muestra Barba / Color / Cortes = A-Z).
  implication: el eje servicios del negocio de la UAT quedó en no-personalizado (el usuario no lo devolvió a "Como los ordené yo", o lo volvió a cambiar). Hoy mismo, con categorías en personalizado, los chips de ese negocio NO son arrastrables — el síntoma no depende del modo de categorías.

- timestamp: 2026-09-17T00:18:00Z
  checked: orden de los chips en la captura ("Prueba, Barba, ASADdD" dentro de un mismo grupo) vs. precios actuales en la DB local
  found: precios Prueba 0.00 · Barba 150.00 · ASADdD 300.00 ⇒ "Prueba, Barba, ASADdD" es exactamente precio ascendente. En A-Z sería "ASADdD, Barba, Prueba".
  implication: corroborante (no concluyente: los precios o asignaciones pudieron cambiar después — los servicios ya no están en los mismos grupos que en la captura): al momento de la captura el eje servicios estaba en "Por precio", no en personalizado ni en alfabético.

- timestamp: 2026-09-17T00:19:00Z
  checked: git show de los commits que tocaron los gates (2ec045b, ae36e76, 543d393, fe68385, 094f7be, 231ce5d)
  found: `canDrag={serviceCustom}` nace en 2ec045b (23-03 Task 3, con `business.service_sort_mode`); ae36e76 (23-04) sólo lo pasa a la prop viva `serviceSortMode`; 543d393 agrega `posicionDisponible` y la degradación a sólo-asignar en `dropServiceOnChip`. Los fixes WR-02 (fe68385), WR-03 (094f7be), WR-05 (231ce5d) no tocan ningún gate.
  implication: el gate es original del diseño 23-03/23-04, no una regresión del review-fix.

## Resolution

root_cause: "El chip de servicio sólo es arrastrable con el eje SERVICIOS en personalizado: `canDrag={serviceCustom}` (components/dashboard/categorias-manager.tsx L869 y L914 → `draggable={canDrag}` L117 y grip L146). Ese flag apaga el ORIGEN del gesto de asignación entre categorías, que no es reordenar; los destinos (fila, Sin categoría, chip) y `dropServiceOn`/`dropServiceOnChip` no tienen gate de modo y seguirían funcionando. El modo de CATEGORÍAS no interviene: con categorías=alpha + servicios=custom los 5 chips son draggable. El usuario tenía el eje servicios en Alfabético/Por precio (captura sin grip en chips; DB local negocio-prueba service_sort_mode=alpha; orden de chips = precio ascendente) y lo atribuyó al selector de categorías, el único dentro de la Card de los chips. Origen del gate: decisión de 23-03-PLAN E3 / 23-04-PLAN (drag del chip = atajo de reorden del eje servicios), que resolvió la contradicción del UI-SPEC (snippet L314 `serviceMode === 'custom' || categories.length > 0` vs tabla L352/estado L630) hacia el lado que no distingue asignar de reordenar."
fix: "(no aplicado — goal: find_root_cause_only)"
verification: "Diagnóstico verificado por matriz SSR de 5 combos de modos, lectura de gates con file:line, estado persistido en DB local y git show de los commits que crearon el gate. Pendiente (humano): arrastre real con categorías=Alfabético + servicios=personalizado."
files_changed: []
