---
status: testing
phase: 23-el-panel-que-organiza-el-cat-logo
source: [23-01-SUMMARY.md, 23-02-SUMMARY.md, 23-03-SUMMARY.md, 23-04-SUMMARY.md, 23-05-SUMMARY.md, 23-06-SUMMARY.md, 23-07-SUMMARY.md, 23-08-SUMMARY.md, 23-VERIFICATION.md, 23-REVIEW-FIX.md]
started: 2026-09-16T16:30:00Z
updated: 2026-09-18T14:30:00Z
---

## Current Test

number: 22
name: Lectura de la entrada G-23-20 del 23-UI-SPEC.md
expected: |
  Alguien que no vio la UAT del 2026-09-17 puede responder, leyendo sólo esa entrada, qué ve el dueño
  en desktop, qué ve en mobile, y por qué no son lo mismo (los dos motivos medidos: G-02 y G-04).
awaiting: user response

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

### 17. La descripción larga se lee entera en la tarjeta del booking público (G-23-6)
expected: En /[slug], paso 1, con 120 caracteres: el texto va a ancho completo debajo de la fila nombre/precio y se lee entero a 375px y 360px, sin "…" y sin botón. Con una palabra de 120 letras sin espacios se recorta a tres renglones y aparece "Ver más"; abrirlo/cerrarlo cambia el alto y nunca avanza al paso 2. Tocar nombre, precio o el texto sí selecciona. Teclado: Tab enfoca la tarjeta entera, Enter selecciona, el Tab siguiente enfoca "Ver más". Servicio deshabilitado: motivo visible, no se selecciona, "Ver más" abre. Servicio sin descripción: idéntico a antes. Consola sin avisos de hidratación.
result: pass
note: "Verificado en /negocio-prueba local: descripción de 120 caracteres a ancho completo en tres renglones bajo nombre/precio. Consola sin avisos de hidratación (sólo preloads de Next y Vercel Analytics)."

### 18. La misma descripción en la web de marca (G-23-6)
expected: En la web de marca (o el preview /web), sección Servicios, con 120 caracteres: a 375px se recorta a tres renglones con "Ver más" si no entra, y abre y cierra; el número y el precio siguen centrados. En desktop se lee entero sin botón.
result: pass
note: "Verificado en el preview /web (add-on has_web_custom activado en local con service_role para esta UAT). El recorte a tres renglones con Ver más se comporta igual que en la página pública de reservas."

### 19. El chip se arrastra para asignar con cualquier modo de orden (G-23-10a)
expected: En /servicios (desktop), con 3 categorías y servicios repartidos. (a) Servicios en Alfabético y categorías en personalizado: los chips muestran grip y arrastrar uno a otra fila lo asigna sin abrir el diálogo; las filas conservan grip y flechas. (b) Categorías en Alfabético y servicios en Por precio: los chips siguen con grip y se asignan arrastrando; las filas ya no tienen grip ni flechas. (c) Con servicios en Alfabético, "Mover …" no muestra la sección "Posición". (d) Con DevTools → Network y servicios en Alfabético: pasar un chip sobre su propia fila NO la resalta, y soltarlo ahí o sobre otro chip del mismo grupo no hace nada (sin toast, sin request). (e) Soltarlo sobre un chip de otra categoría lo asigna con un solo request y ningún otro chip se mueve. (f) Ida y vuelta: acomodás un grupo a mano en "Como los ordené yo", pasás a Alfabético, arrastrás un chip ajeno a ese grupo y volvés a "Como los ordené yo": tu orden manual quedó intacto y el recién llegado está último, también tras recargar. (g) Con servicios en "Como los ordené yo", soltar un chip sobre otro del mismo grupo lo sigue reordenando y la fila propia se sigue resaltando (sin regresión del Test 9).
result: pass

### 20. Renglón de descripción y link Editar en la tarjeta del panel (G-23-6b)
expected: En /servicios, pestaña Activos, a 375px y en desktop. Con una descripción de 120 caracteres: un solo renglón recortado con "…" debajo del nombre y el link subrayado "Editar" debajo; con una palabra de 120 letras sin espacios no hay desborde ni scroll horizontal. "Editar" abre el mismo diálogo que el lápiz con la descripción cargada, y el lápiz sigue funcionando. Sin descripción: sólo "Agregar descripción", abre el mismo diálogo, y al guardar aparece el renglón y el link pasa a "Editar" sin recargar. Teclado: Tab llega al link con anillo visible, Enter abre. Desktop: nombre y acciones en la primera fila, renglón y link en la columna izquierda. Mobile: tocar el centro de la línea de duración y precio no abre el diálogo. La pestaña Desactivados se comporta igual. En el alta y en la edición, la ayuda debajo de "Descripción corta" dice la oración nueva completa y el contador 0/120 no se le superpone a 375px.
result: issue
reported: "pass. Lo unico que veo que me gustaría corregir, es sacar el campo de precio y duración de ese lado y pasarlo al lado derecho, a la altura del título el precio y abajo la duración más chico parecido a la página publica o a la jerarquia entre titulo y descripcion. Y abajo de eso los botones, de desactivar lapit y tacho. Creo que lo deja más legible al servicio."
severity: cosmetic
note: "El comportamiento de G-23-6b pasó (renglón, link Editar / Agregar descripción, diálogo, teclado). El issue es un pedido de layout NUEVO sobre la misma tarjeta, registrado como G-23-20."

### 21. Layout nuevo de la tarjeta de /servicios en desktop y su equivalente en mobile (G-23-20, 23-08)
expected: Mobile a 375px: la tarjeta es idéntica a antes de 23-08 — nombre, renglón de descripción + link, la línea con duración y precio en UN renglón (con el modo de cupo detrás del punto medio si corresponde), sedes, cobertura, y al final la divisoria con las tres acciones. El precio NO aparece dos veces, sin scroll horizontal. Desktop (>=640px): a la derecha del nombre y a su misma altura, el precio; debajo la duración, más chica y en gris; debajo de las dos, Desactivar / lápiz / tacho — en la ÚLTIMA fila de esa columna, nunca con contenido de la izquierda por debajo. Servicio con cupo compartido + sedes + cobertura (la configuración que WR-03 encontró rota): las acciones cierran la tarjeta, sin la línea de cobertura ni las píldoras de sedes colgando debajo de los botones. Nombre de 40+ caracteres y precio de 7 dígitos: sigue truncando en desktop sin robarle ancho al nombre, y envolviendo en mobile. Foco por teclado: Tab recorre link Editar → Desactivar → lápiz → tacho con anillo visible, en las dos vistas y también en la pestaña Desactivados.
result: issue
reported: "Salvo lo del nombre en +40 caracteres en movil: pass. Encontre un par de cosas a corregir. El modal de edición, cuando elijo recurso simultáneo cambia el ancho y en el toggle clase grupal pasa a tener dos lineas. La tarjeta en desktop: Recurso compartido y el selector terminan tomando una línea cada uno, cuando podriamos ponerlos en una misma línea y compactar un poco la tarjeta."
severity: cosmetic
confirmed_pass: "G-23-20 quedó confirmado en la app real, incluida la configuración que WR-03 había roto (cupo compartido + sedes + cobertura): en desktop el precio está a la altura del nombre, la duración debajo en gris, y Desactivar / lápiz / tacho cierran la tarjeta en la última fila, sin la línea de cobertura ni las píldoras de sedes colgando debajo. Mobile sin precio duplicado y sin scroll horizontal."
note: "Un gap del contrato del propio test (el nombre largo en mobile, G-23-21) y dos hallazgos nuevos fuera de 23-08: el modal de edición (G-23-22) y la compactación de la tarjeta en desktop (G-23-23)."

### 22. Lectura de la entrada G-23-20 del 23-UI-SPEC.md
expected: Alguien que no vio la UAT del 2026-09-17 puede responder, leyendo sólo esa entrada, qué ve el dueño en desktop, qué ve en mobile, y por qué no son lo mismo (los dos motivos medidos: G-02 y G-04).
result: pass
reported: "se entiende"
note: "La legibilidad —el criterio del test— pasó. Aparte, durante la presentación del checkpoint detecté que la entrada quedó DESACTUALIZADA respecto del fix de WR-03: describe las acciones en una fila fija ('debajo de las dos') y su 'Regla para el que toque esta región' no advierte que la fila de las acciones no puede ser un número fijo, que es justo el defecto que ya ocurrió una vez. Registrado como G-23-24."

## Summary

total: 22
passed: 17
issues: 4
pending: 1
skipped: 0
blocked: 0

## Deferred Follow-Ups

- test: 9
  idea: "En mobile no hay arrastre pero figuran los puntitos de arrastre; me interesa que se puedan ordenar con el dedo en móvil en algún momento (en web cms funcionó con el panel de inmobiliarias para ordenar fotos). Después lo vemos."
  deferred_at: 2026-09-17

## Gaps

- gap_id: G-23-6
  truth: "Una descripción corta de hasta 120 caracteres se lee completa en la tarjeta pública a 375px (el tope coincide con lo que entra)"
  status: resolved
  resolved_by: 23-05-PLAN.md, 23-07-PLAN.md
  resolved_at: 2026-09-17
  verify_test: 17, 18
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
  status: resolved
  resolved_by: 23-07-PLAN.md
  resolved_at: 2026-09-17
  verify_test: 20
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
  status: resolved
  resolved_by: 23-06-PLAN.md
  resolved_at: 2026-09-17
  verify_test: 19
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
- gap_id: G-23-20
  truth: "En desktop, la tarjeta de servicio de /servicios muestra el precio a la altura del título y la duración debajo, más chica, con las acciones (Desactivar, lápiz, tacho) debajo de esos datos — la jerarquía de la página pública"
  status: resolved
  resolved_by: 23-08-PLAN.md, 23-REVIEW-FIX.md (WR-03)
  resolved_at: 2026-09-18
  verify_test: 21
  resolution_note: "Cerrado por código y medido en Chrome headless sobre una réplica de la grilla (5 configuraciones); falta la confirmación visual en la app real (Test 21). El code review incremental encontró WR-03 sobre el propio fix — las acciones quedaban clavadas en sm:row-start-3 mientras la columna izquierda tiene entre 2 y 6 filas, así que con cupo compartido / sedes / cobertura el contenido quedaba DEBAJO de los botones. Corregido en 13629dd con la fila derivada (Math.max(3, leftRows)) aplicada por custom property sólo en sm:."
  reason: "User reported: sacar precio y duración de la columna izquierda y pasarlos a la derecha, el precio a la altura del título y la duración abajo más chica (como en la página pública); los botones Desactivar / lápiz / tacho debajo de eso. Lo deja más legible."
  severity: cosmetic
  test: 20
  root_cause: "No es un bug: es un layout nuevo. La tarjeta (settings-client.tsx:2692) es una columna en mobile y una grilla sm:grid-cols-[minmax(0,1fr)_auto] en desktop, donde CADA hijo de contenido declara sm:col-start-1 y el bloque de acciones —último hijo del DOM— queda anclado a la columna 2 de la primera fila. Duración y precio viven hoy en la línea de datos (D-07, :2791) como un solo nodo de texto en la columna izquierda, junto al modo de cupo cuando el servicio no es individual."
  artifacts:
    - path: "app/(dashboard)/settings/settings-client.tsx"
      issue: "línea de datos (duración · precio · modo de cupo) en la columna izquierda (L2791-2806); acciones ancladas a col-2 fila-1 (L2845+)"
  missing:
    - "Mover duración y precio a la columna derecha en desktop, con el precio a la altura del nombre (jerarquía precio grande / duración chica, como la tarjeta pública) y las acciones debajo"
    - "Mantener el orden del DOM contenido → acciones para no romper el orden de foco, y las anclas sm:col-start-1 del resto de los hijos"
    - "Conservar la zona de exclusión de G-04 y la divisoria de mobile intactas"
  user_decision: "Sólo desktop (≥640px): en mobile la tarjeta sigue igual (columna, acciones al final) para no reabrir el desborde de 375px (G-02) ni los toques errados (G-04). A la columna derecha se mudan SÓLO el precio y la duración; el modo de cupo y su control inline se quedan donde están."

- gap_id: G-23-21
  truth: "En mobile a 375px, un nombre de servicio de 40+ caracteres sin espacios envuelve dentro de la tarjeta — no la desborda ni produce scroll horizontal"
  status: failed
  reason: "User reported con captura: 'Salvo lo del nombre en +40 caracteres en movil'. Un servicio llamado Premiumssssss… (40+ caracteres sin espacios) no envuelve en mobile."
  severity: minor
  test: 21
  root_cause: "[pendiente de diagnóstico]"
  artifacts:
    - path: "app/(dashboard)/settings/settings-client.tsx"
      issue: "el <p> del nombre (~2736) es `break-words sm:truncate` sin `min-w-0`, dentro de un padre flex (~2735)"
  missing:
    - "Que el nombre largo sin espacios envuelva en mobile sin romper el `sm:truncate` de desktop ni robarle ancho al nombre"

- gap_id: G-23-22
  truth: "El diálogo Editar servicio conserva el mismo ancho al cambiar el modo de cupo, y las tres etiquetas del toggle mantienen columnas de ancho estable"
  status: failed
  reason: "User reported con dos capturas: 'El modal de edición, cuando elijo recurso simultáneo cambia el ancho y en el toggle clase grupal pasa a tener dos lineas.' Con Individual seleccionado la que envuelve es 'Recurso simultáneo'; con Recurso simultáneo seleccionado, la que envuelve es 'Clase grupal'."
  severity: cosmetic
  test: 21
  found_outside_scope: true
  root_cause: "[pendiente de diagnóstico]"
  artifacts:
    - path: "app/(dashboard)/settings/settings-client.tsx"
      issue: "toggle `grid grid-cols-1 gap-1 … sm:grid-cols-3` (~463); bloque 'Cuántos lugares' condicional (~592); ancho del contenedor de diálogo"
  missing:
    - "Ancho del diálogo estable entre estados del modo de cupo"
    - "Columnas del toggle de ancho estable, sin re-envoltorio según cuál opción esté seleccionada"
  note: "Preexistente: el plan 23-08 tenía prohibido tocar el diálogo de edición, así que NO es regresión de esta fase. La UAT recién ahora lo miró de cerca."

- gap_id: G-23-23
  truth: "En desktop, el rótulo del modo de cupo y el control inline del cupo comparten una misma línea en vez de ocupar una fila cada uno"
  status: failed
  reason: "User reported con captura: 'La tarjeta en desktop: Recurso compartido y el selector terminan tomando una línea cada uno, cuando podriamos ponerlos en una misma línea y compactar un poco la tarjeta.'"
  severity: cosmetic
  test: 21
  found_outside_scope: true
  root_cause: "[pendiente de diagnóstico]"
  artifacts:
    - path: "app/(dashboard)/settings/settings-client.tsx"
      issue: "el rótulo vive en la línea de datos (~2836) y el control en su envoltorio hermano (~2858): dos hijos distintos de la columna izquierda, una fila cada uno"
  missing:
    - "Juntarlos en una línea en desktop conservando los 32px de zona de exclusión de G-04 en mobile (el control se separó a propósito: el navegador corregía el punto de toque y tocar la duración bajaba el cupo)"
    - "Revisar que el cálculo derivado de la fila de acciones (leftRows / actionsRow, fix de WR-03) siga dando la fila correcta si cambia la cantidad de hijos"

- gap_id: G-23-24
  truth: "La entrada G-23-20 del 23-UI-SPEC.md describe el layout REAL, incluida la fila derivada de las acciones, y su regla previene el defecto que ya ocurrió"
  status: failed
  reason: "Detectado por Claude al presentar el Test 22 (la legibilidad, que era el criterio del test, el usuario la aprobó). La entrada quedó escrita antes del fix de WR-03."
  severity: minor
  test: 22
  root_cause: "El REVIEW-FIX de WR-03 tocó sólo settings-client.tsx y los artefactos del review; la entrada del UI-SPEC —escrita por 23-08 con el layout de fila fija— no se actualizó."
  artifacts:
    - path: ".planning/workstreams/motor-reservas/phases/23-el-panel-que-organiza-el-cat-logo/23-UI-SPEC.md"
      issue: "bullet 'Qué se hizo' (L891) describe las acciones en fila fija; 'Regla para el que toque esta región' (L894) no advierte que la fila de las acciones no puede ser un número fijo"
  missing:
    - "Que el bullet 'Qué se hizo' diga que la fila de las acciones se DERIVA de cuántos hijos rinde la columna izquierda"
    - "Que la regla advierta explícitamente el defecto de WR-03: una fila fija en la columna derecha se rompe cuando la izquierda crece"
