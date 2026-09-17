---
status: diagnosed
phase: 23-el-panel-que-organiza-el-cat-logo
source: [23-01-SUMMARY.md, 23-02-SUMMARY.md, 23-03-SUMMARY.md, 23-04-SUMMARY.md, 23-VERIFICATION.md, 23-REVIEW-FIX.md]
started: 2026-09-16T16:30:00Z
updated: 2026-09-17T13:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Crear categoría y rechazo de duplicado
expected: En /servicios creás "Cortes" y aparece en la lista. Intentar "  cortes " no la crea y muestra un mensaje propio inline, sin texto de Postgres; lo escrito queda en el campo.
result: pass

### 2. Reordenar categorías con flechas y que sobreviva al reload
expected: Con 3 categorías, las flechas ▲/▼ mueven la fila al instante; el primer ▲ y el último ▼ están deshabilitados. Al recargar la página el orden es el mismo. Una categoría nueva creada después de borrar otras entra siempre al final.
result: pass

### 3. Chips por grupo, "Sin categoría" y diálogo Mover
expected: Los servicios aparecen como chips bajo su categoría; "Sin categoría" va último (sólo si hay servicios sueltos). Tocar un chip abre "Mover …": elegir una categoría lo mueve con un solo guardado y queda último en ese grupo (también tras recargar); elegir "Sin categoría" lo saca. Escape cierra sin guardar nada. A 375px no hay scroll horizontal aunque haya nombres largos.
result: pass

### 4. Campo Categoría en el formulario de servicio
expected: Con cero categorías el campo Categoría no aparece en el alta ni en la edición. Con categorías, el selector muestra el nombre (nunca un id), "Sin categoría" es la opción por defecto, y al reabrir la edición conserva lo guardado. Un servicio dado de alta o editado hacia una categoría queda último en ese grupo.
result: pass
note: "El usuario notó que la lista principal de servicios también se agrupa por categoría (sueltos al final); comportamiento esperado por el fix WR-04."

### 5. CR-01: formulario abierto con una categoría que se borra
expected: Elegís una categoría en el formulario de alta (sin guardar), la borrás desde el organizador y das de alta el servicio: se guarda en "Sin categoría" sin toast de error. Si era la última categoría, el campo desaparece y el alta igual funciona.
result: pass

### 6. Descripción corta (120 caracteres)
expected: El campo arranca en 0/120, no deja tipear más de 120 y el contador cambia de peso/color al acercarse al tope. Guardado con 120 caracteres, en la página pública /[slug] la tarjeta del servicio lo muestra en dos líneas a 375px sin romper el layout. Vaciarlo y guardar deja la tarjeta sin descripción.
result: issue
reported: "En pagina publica queda cortado en una linea. En el panel, estaría bueno acomodar la tarjeta para que se vea al menos una linea de la descripcion y un link subrayado de editar que abra lo mismo que abre el boton del lapiz."
severity: minor
note: "Re-probado con texto real con espacios: se ve en dos líneas pero NO entra completo (se corta con …). La hipótesis de la palabra sin espacios queda descartada: el tope de 120 no coincide con lo que entra en line-clamp-2 a 375px (assumption flagueada en 23-02-PLAN CAT-11)."

### 7. Renombrar una categoría in situ
expected: Tocar el nombre abre un campo. Enter guarda, Escape cancela, salir del campo guarda; sin cambios no guarda nada. Un nombre duplicado o vacío muestra el aviso debajo de esa fila y no cambia nada. Todo se puede hacer con teclado.
result: pass

### 8. Borrar una categoría con confirmación
expected: Eliminar abre una confirmación cuyo texto dice cuántos servicios quedan en "Sin categoría" (variantes: varios / uno / ninguno) y que se siguen vendiendo. Al confirmar, la fila desaparece y sus chips pasan a "Sin categoría" sin recargar; esos servicios siguen reservables en /[slug].
result: pass

### 9. Arrastre nativo (desktop)
expected: En desktop, arrastrar una fila de categoría la reordena (con indicador de inserción, sin parpadeo) y el orden persiste al recargar. Arrastrar un chip a otra fila lo asigna (queda último); soltarlo sobre otro chip del mismo grupo lo pone en ese lugar y puede llevarlo al último. Mientras se guarda un reorden, Agregar y Eliminar se ven deshabilitados (claro y oscuro). En mobile no hay arrastre.
result: pass
note: "En mobile no hay arrastre pero se ven los puntitos (grip). Queda como follow-up diferido."

### 10. Modos de orden: ida y vuelta sin perder tu orden
expected: Acomodás categorías y servicios a mano. En "Orden de las categorías" elegís Alfabético: las filas se reordenan A-Z y desaparecen flechas/grip de las filas. En "Orden de los servicios" elegís Alfabético o Por precio: la lista de servicios de abajo se reordena al instante agrupada por categoría y desaparecen el reorden chip sobre chip y la sección "Posición"; el chip conserva el grip y se sigue pudiendo arrastrar a otra categoría (G-23-10a). Volvés a "Como los ordené yo" en ambos: vuelve exactamente tu orden manual, también tras recargar.
result: issue
reported: "Pass. Lo que no me gusta es que si elijo alfabetico en las categorías, ya no puedo pasar servicios de una a otra, los chips de servicios se pueden mover solo haciendole clic y eligiendo del modal. Y los servicios nunca se pudieron acomodar a mano, solo por orden de agregado."
severity: minor
note: "La ida y vuelta de modos funciona (pass del comportamiento probado). Los dos reclamos se registran como gaps G-23-10a y G-23-10b."

### 11. Sección "Posición" del diálogo Mover
expected: Con al menos un servicio dentro de una categoría y el orden de servicios en personalizado, "Mover …" muestra "Posición" con contador y Subir/Bajar; el cambio se ve al confirmar y persiste al recargar. Si ningún servicio tiene categoría, o el modo no es personalizado, "Posición" no aparece.
result: pass

### 12. Fallo de red al guardar (offline)
expected: Con DevTools en Offline, reordenar con flechas (o cambiar un modo) muestra un aviso de que no se pudo guardar y el panel vuelve al estado real (el selector de modo vuelve al valor anterior). Al volver online y recargar, nada quedó a medias.
result: pass

### 13. Módulo puro del panel (lib/catalog-panel.ts)
expected: Renumeración, movimiento, categoryPatch y mapeo de errores cubiertos por test/catalog-panel.test.ts
result: pass
source: automated
coverage_id: 23-01-D1

### 14. Gates automatizados de los planes 23-01..23-04
expected: Typecheck limpio, escrituras con business_id, sin migraciones ni paquetes nuevos, suite completa en verde
result: pass
source: automated
coverage_id: 23-01-D2, 23-03-D1

### 15. Campos del formulario — escritura única y normalización
expected: categoryPatch/mapCategoryWriteError en alta y edición; descripción normalizada al guardar
result: pass
source: automated
coverage_id: 23-02-D1, 23-02-D2

### 16. sortCategories comparte la regla de groupCatalog
expected: Misma regla del eje categorías, incluye vacías, estable, no muta
result: pass
source: automated
coverage_id: 23-04-D2

## Summary

total: 16
passed: 14
issues: 2
pending: 0
skipped: 0
blocked: 0

## Deferred Follow-Ups

- test: 9
  idea: "En mobile no hay arrastre pero figuran los puntitos de arrastre; me interesa que se puedan ordenar con el dedo en móvil en algún momento (en web cms funcionó con el panel de inmobiliarias para ordenar fotos). Después lo vemos."
  deferred_at: 2026-09-17

## Gaps

- gap_id: G-23-6
  truth: "Una descripción corta de hasta 120 caracteres se lee completa en la tarjeta pública a 375px (el tope coincide con lo que entra)"
  status: failed
  reason: "User reported: primero cortada en una línea (palabra sin espacios); re-probado con texto real: muestra dos líneas pero no se ve completa, se corta con … a 375px"
  severity: minor
  test: 6
  root_cause: "El tope de 120 nunca se midió (CAT-11 lo daba por cierto; 23-02-PLAN lo marcaba unresolved). En app/[slug]/booking-client.tsx:607-619 la descripción comparte fila con precio (text-lg) y duración, en text-xs con line-clamp-2: a 375px quedan 181-229px y entran 59-84 caracteres en 2 líneas. 120 ocupa 3-5 líneas y siempre se corta. Además falta break-words (una palabra sin espacios se recorta sin puntos suspensivos)."
  artifacts:
    - path: "app/[slug]/booking-client.tsx"
      issue: "descripción en columna angosta junto a precio/duración, text-xs + line-clamp-2, sin break-words (L607-619)"
    - path: "app/(dashboard)/settings/settings-client.tsx"
      issue: "maxLength 120 y copy de ayuda (Se ven 2 líneas) no calibrados"
    - path: "components/landing/services.tsx"
      issue: "misma descripción con line-clamp-2 en la web de marca (L74-77), no medido"
  missing:
    - "Decidir: bajar el tope a lo medido (~55-60), o sacar la descripción a ancho completo con 3 líneas (entra 120 a 360/375px), o aflojar el clamp"
    - "Agregar break-words al párrafo de la descripción"
    - "Alinear el copy de ayuda del campo con el resultado"
  debug_session: .planning/debug/descripcion-120-no-entra-tarjeta-publica.md
  user_decision: "Mantener el tope de 120. Portar el patrón de forjo-tiendas (components/tienda/CatalogoLista.tsx, FilaDeProducto L449-601, diseño agualaboca mobile): descripción a 2-3 líneas (line-clamp) con botón Ver más / Ver menos que aparece SOLO si el texto desborda medido en pantalla (scrollHeight > clientHeight + 1 con ResizeObserver, arranca en false), aria-expanded, target 44px con márgenes negativos, y al expandir cambia el alto de la tarjeta. Sumar break-words."
- gap_id: G-23-6b
  truth: "La tarjeta del servicio en el panel muestra al menos una línea de la descripción y un link subrayado Editar que abre el mismo diálogo que el lápiz"
  status: failed
  reason: "User reported: en el panel, estaría bueno que la tarjeta muestre al menos una línea de la descripción y un link subrayado de editar que abra lo mismo que el botón del lápiz"
  severity: minor
  test: 6
  root_cause: "No es un bug: la fase no le pidió nada a la tarjeta de la lista (23-CONTEXT D-06: la lista de servicios de abajo NO se toca; UI-SPEC limita CAT-11 al formulario). La tarjeta (settings-client.tsx:2692-2865) nunca lee s.description y la única vía de edición es el lápiz (:2858, openEditService(s))."
  artifacts:
    - path: "app/(dashboard)/settings/settings-client.tsx"
      issue: "tarjeta de servicio sin línea de descripción ni link de texto Editar (L2692-2865; lápiz en L2858)"
  missing:
    - "Línea de descripción después del bloque del nombre (sm:col-start-1), text-xs text-muted-foreground, 1 línea truncada con break-words, nada si es null"
    - "Botón-link Editar (underline underline-offset-2) que llama openEditService(s), con aria-label, focus visible y target 44px en mobile, en su propia línea"
    - "Decidir qué mostrar si no hay descripción"
  debug_session: .planning/debug/tarjeta-panel-sin-descripcion-ni-link-editar.md
  user_decision: "Mostrar la línea de descripción y el link subrayado Editar; si el servicio no tiene descripción, mostrar un link Agregar descripción que abre el mismo diálogo de edición."
- gap_id: G-23-10a
  truth: "Con el orden de categorías en Alfabético, el dueño igual puede pasar un servicio de una categoría a otra arrastrando el chip (el modo de categorías no debería bloquear la asignación)"
  status: failed
  reason: "User reported: si elijo alfabético en las categorías ya no puedo pasar servicios de una a otra; los chips sólo se mueven haciéndoles clic y eligiendo en el modal"
  severity: minor
  test: 10
  root_cause: "El arrastre del chip NO depende del modo de categorías sino del de servicios: canDrag={serviceCustom} (categorias-manager.tsx:869,914; draggable :117, grip :146) apaga también la asignación a otra categoría cuando Orden de los servicios no es personalizado. En la captura el modo de servicios estaba en no-personalizado (en la base local service_sort_mode=alpha). Fue decisión de diseño (23-03-PLAN E3, 23-04-PLAN :236) que contradice el snippet de 23-UI-SPEC:314 y D-05/D-06."
  artifacts:
    - path: "components/dashboard/categorias-manager.tsx"
      issue: "canDrag={serviceCustom} (L869, L914) mezcla puede asignar con puede reordenar"
    - path: ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-UI-SPEC.md"
      issue: "tabla de gates (:352/:630) ata el arrastre del chip al modo de servicios"
  missing:
    - "Separar el inicio del arrastre (habilitado si hay al menos una categoría) del reorden chip-sobre-chip (sigue detrás de posicionDisponible, :231)"
    - "Actualizar la tabla de gates del UI-SPEC y el expected del Test 10"
    - "Decidir si el grip se muestra cuando sólo se puede asignar y qué pasa al soltar en el propio grupo en modo no personalizado"
  debug_session: .planning/debug/chips-no-arrastrables-con-categorias-alfabetico.md
  user_decision: "Asignar siempre: el chip se puede arrastrar a otra categoría (con grip) aunque el orden de servicios no sea personalizado; el reorden chip-sobre-chip sigue sólo en Como los ordené yo; soltar en su propio grupo en modo no personalizado no hace nada. Actualizar tabla de gates del UI-SPEC."
- gap_id: G-23-10b
  truth: "El dueño puede acomodar a mano el orden de los servicios (no sólo por orden de alta)"
  status: withdrawn
  reason: "User reported: los servicios nunca se pudieron acomodar a mano, sólo quedan por orden de agregado"
  withdrawn_reason: "El usuario aclaró que el orden manual sí funciona dentro de los chips de cada categoría (Posición y chip sobre chip); había entendido que se refería a la lista principal. No es un gap."
  severity: major
  test: 10
  artifacts: []
  missing: []
