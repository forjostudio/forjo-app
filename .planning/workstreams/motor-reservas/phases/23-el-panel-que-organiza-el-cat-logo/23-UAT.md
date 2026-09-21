---
status: complete
phase: 23-el-panel-que-organiza-el-cat-logo
source: [23-01-SUMMARY.md, 23-02-SUMMARY.md, 23-03-SUMMARY.md, 23-04-SUMMARY.md, 23-05-SUMMARY.md, 23-06-SUMMARY.md, 23-07-SUMMARY.md, 23-08-SUMMARY.md, 23-09-SUMMARY.md, 23-10-SUMMARY.md, 23-11-SUMMARY.md, 23-VERIFICATION.md, 23-REVIEW.md, 23-REVIEW-FIX.md]
started: 2026-09-16T16:30:00Z
updated: 2026-09-21T00:00:00Z
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
result: pass
reclassified: Reclasificado a pass el 2026-09-21 al cierre de la UAT. El comportamiento probado por el test (contador 0/120, tope duro, guardado y borrado) pasó; el `issue` era el pedido derivado que se registró como G-23-6 y G-23-6b. G-23-6 quedó resolved (planes 23-05/23-07) y re-verificado en navegador real por los Tests 17 y 18, ambos pass.
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
result: pass
reclassified: Reclasificado a pass el 2026-09-21 al cierre de la UAT. El propio reporte abre con `Pass.`: la ida y vuelta de modos funciona. Los dos reclamos derivados se registraron aparte — G-23-10a resolved (plan 23-06) y re-verificado por el Test 19 (pass), y G-23-10b withdrawn por decisión.
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
result: pass
reclassified: Reclasificado a pass el 2026-09-21 al cierre de la UAT. El propio reporte abre con `pass.`: G-23-6b (renglón, link Editar/Agregar descripción, diálogo, teclado) pasó. El `issue` era el pedido de layout nuevo, registrado como G-23-20, hoy resolved (plan 23-08 + WR-03) y confirmado en navegador real en el Test 21.
reported: "pass. Lo unico que veo que me gustaría corregir, es sacar el campo de precio y duración de ese lado y pasarlo al lado derecho, a la altura del título el precio y abajo la duración más chico parecido a la página publica o a la jerarquia entre titulo y descripcion. Y abajo de eso los botones, de desactivar lapit y tacho. Creo que lo deja más legible al servicio."
severity: cosmetic
note: "El comportamiento de G-23-6b pasó (renglón, link Editar / Agregar descripción, diálogo, teclado). El issue es un pedido de layout NUEVO sobre la misma tarjeta, registrado como G-23-20."

### 21. Layout nuevo de la tarjeta de /servicios en desktop y su equivalente en mobile (G-23-20, 23-08)
expected: Mobile a 375px: la tarjeta es idéntica a antes de 23-08 — nombre, renglón de descripción + link, la línea con duración y precio en UN renglón (con el modo de cupo detrás del punto medio si corresponde), sedes, cobertura, y al final la divisoria con las tres acciones. El precio NO aparece dos veces, sin scroll horizontal. Desktop (>=640px): a la derecha del nombre y a su misma altura, el precio; debajo la duración, más chica y en gris; debajo de las dos, Desactivar / lápiz / tacho — en la ÚLTIMA fila de esa columna, nunca con contenido de la izquierda por debajo. Servicio con cupo compartido + sedes + cobertura (la configuración que WR-03 encontró rota): las acciones cierran la tarjeta, sin la línea de cobertura ni las píldoras de sedes colgando debajo de los botones. Nombre de 40+ caracteres y precio de 7 dígitos: sigue truncando en desktop sin robarle ancho al nombre, y envolviendo en mobile. Foco por teclado: Tab recorre link Editar → Desactivar → lápiz → tacho con anillo visible, en las dos vistas y también en la pestaña Desactivados.
result: pass
reclassified: Reclasificado a pass el 2026-09-21 al cierre de la UAT. El test ya traía `confirmed_pass` de G-23-20 en la app real, incluida la configuración que WR-03 había roto. El `issue` eran los cuatro hallazgos derivados: G-23-21 y G-23-23 (cerrados y verificados en el Test 23), G-23-22 (Test 25) y G-23-24 (Test 30). Los cuatro resolved.
reported: "Salvo lo del nombre en +40 caracteres en movil: pass. Encontre un par de cosas a corregir. El modal de edición, cuando elijo recurso simultáneo cambia el ancho y en el toggle clase grupal pasa a tener dos lineas. La tarjeta en desktop: Recurso compartido y el selector terminan tomando una línea cada uno, cuando podriamos ponerlos en una misma línea y compactar un poco la tarjeta."
severity: cosmetic
confirmed_pass: "G-23-20 quedó confirmado en la app real, incluida la configuración que WR-03 había roto (cupo compartido + sedes + cobertura): en desktop el precio está a la altura del nombre, la duración debajo en gris, y Desactivar / lápiz / tacho cierran la tarjeta en la última fila, sin la línea de cobertura ni las píldoras de sedes colgando debajo. Mobile sin precio duplicado y sin scroll horizontal."
note: "Un gap del contrato del propio test (el nombre largo en mobile, G-23-21) y dos hallazgos nuevos fuera de 23-08: el modal de edición (G-23-22) y la compactación de la tarjeta en desktop (G-23-23)."

### 22. Lectura de la entrada G-23-20 del 23-UI-SPEC.md
expected: Alguien que no vio la UAT del 2026-09-17 puede responder, leyendo sólo esa entrada, qué ve el dueño en desktop, qué ve en mobile, y por qué no son lo mismo (los dos motivos medidos: G-02 y G-04).
result: pass
reported: "se entiende"
note: "La legibilidad —el criterio del test— pasó. Aparte, durante la presentación del checkpoint detecté que la entrada quedó DESACTUALIZADA respecto del fix de WR-03: describe las acciones en una fila fija ('debajo de las dos') y su 'Regla para el que toque esta región' no advierte que la fila de las acciones no puede ser un número fijo, que es justo el defecto que ya ocurrió una vez. Registrado como G-23-24."

<!-- ── Tercera ronda de gaps: planes 23-09, 23-10, 23-11 + code review pasada 3 (WR-05..WR-10) ── -->

### 23. Tarjeta de /servicios — nombre largo en mobile y modo/cupo en una línea en desktop (G-23-21, G-23-23, plan 23-09)
expected: A 375px un nombre de 40+ caracteres sin espacios envuelve adentro de la tarjeta (no se sale, sin scroll horizontal), también con la píldora "Sin cobertura". En desktop el rótulo del modo de cupo y el selector comparten UNA línea y la tarjeta queda más compacta. Las acciones siguen cerrando la tarjeta abajo de todo, sin cobertura ni sedes colgando debajo.
result: pass
reported: "pass"
evidence: "Dos capturas del dueño (mobile 375px y desktop) con el servicio `SupercalifragilisticoEspialidoso123456` en Clase grupal y Sin cobertura. Mobile: el nombre envuelve en dos renglones adentro de la tarjeta, con la píldora al lado, sin desborde ni scroll horizontal. Desktop: `Clase grupal` comparte línea con el stepper `− 2 + lugares`; precio a la altura del nombre y duración debajo; Desactivar / lápiz / tacho en la última fila, con la línea de cobertura a su izquierda y NADA colgando por debajo."
closes: G-23-21, G-23-23

### 24. El resto de la tarjeta en mobile quedó igual que antes (regresión de 23-09)
expected: Con la configuración más cargada (cupo compartido + sedes + cobertura), mobile se ve idéntico a antes del cambio: mismo ritmo vertical, mismas separaciones, mismo alto. El foco por teclado recorre la tarjeta igual, y el cupo se sigue editando y guardando desde la tarjeta sin recargar.
result: pass
reported: "pass"
note: "Confirma que mudar el gate `capMode === 'individual' && 'sm:hidden'` al envoltorio no corrió el ritmo vertical de mobile, y que la zona de exclusión táctil de G-04 (`py-6 sm:py-0`) sigue vigente donde hay dedo."

### 25. Diálogo Editar servicio — ancho estable y toggle apilado (G-23-22, plan 23-10)
expected: Al cambiar entre los tres modos de cupo, los campos del diálogo NO se angostan ni se ensanchan: el borde del popup sigue alineado con el borde derecho de los inputs en los tres modos. Las tres etiquetas del toggle ("Individual", "Clase grupal", "Recurso simultáneo") entran enteras en una línea cada una, apiladas una debajo de la otra, en desktop y en mobile. Probar en Windows, que es donde aparece la barra de scroll clásica que causaba el defecto.
result: pass
reported: "pass"
note: "Confirmado en Windows, la plataforma del dueño y la única donde la barra de scroll clásica de 15px materializaba el defecto. Cierra el reporte original ('cuando elijo recurso simultáneo cambia el ancho y en el toggle clase grupal pasa a tener dos líneas') por sus dos causas medidas: el hueco del scrollbar sin reservar en el cuerpo scrolleable, y el ancho de celda que nunca alcanzaba para 'Recurso simultáneo' (133.58px necesarios contra 111.33px de celda)."
closes: G-23-22

### 26. Un click afuera ya no descarta el borrador (G-23-25, plan 23-10)
expected: En los tres diálogos de edición (servicio, sede, profesional) — (a) tocá un campo y hacé click afuera: NO cierra, avisa y el borrador queda; (b) lo mismo con Escape; (c) sin tocar nada, click afuera / Escape / ✕ cierran igual que siempre, sin fricción; (d) la ✕ siempre cierra, aun con cambios.
result: pass
reported: "si, pass"
note: "Los cuatro sub-casos (a/b/c/d) en los tres diálogos. Confirma la integración real con Base UI —qué `reason` entrega un click afuera y un Escape de verdad— que ningún test unitario podía cubrir: `test/panel-draft.test.ts` sólo ejercita la lógica de decisión con motivos mockeados. El sub-caso (c) es el que prueba que la guarda no agregó fricción donde no hay nada que perder."
closes: G-23-25

### 27. Los cuatro falsos positivos de la guarda (G-23-25 + WR-05)
expected: Estas cuatro operaciones NO deben ensuciar el borrador (o sea, después de hacerlas el click afuera tiene que cerrar normalmente) — (a) entrar y salir de un campo que se normaliza solo; (b) prender y apagar una sede dejándola como estaba; (c) ir a "Individual" y volver a "Clase grupal": **el cupo tiene que seguir en su número original** (antes una clase de 12 volvía con 2 — es el fix WR-05); (d) abrir un servicio cuya categoría fue borrada.
result: pass
reported: "pass"
note: "El sub-caso (c) es la confirmación en navegador real del fix de WR-05 (commit 691d5da): `capacityModePatch` conserva el número al ir a Individual en vez de pisarlo con 1, así que volver a un modo compartido ya no degrada una clase de 12 a 2. Cierra el camino de pérdida de datos que la guarda de G-23-25 había vuelto alcanzable (bloqueaba el cierre y el aviso empujaba a guardar la pérdida, por una ruta que además no tiene el pre-chequeo de bajada de cupo). Cubierto también por `test/panel-draft.test.ts` (`grupal → individual → grupal conserva 12`)."
closes: WR-05

### 28. "Editar sede" con el nombre vacío no queda trabada (WR-07)
expected: Borrá el nombre de una sede: el botón Guardar queda deshabilitado (no un botón que parece activo y no hace nada), la ✕ sigue cerrando, y queda claro qué falta. No debe leerse como un diálogo trabado.
result: pass
reported: "Se entiende, se podría poner un texto rojo abajo del nombre como en otros lugares pero se entiende"
note: "El criterio del test —que no se lea como trabada— pasó. Aparte, el dueño señala que falta el error inline en rojo debajo del campo, que es el patrón que el resto del panel ya usa y que las reglas de diseño del proyecto exigen ('errores inline e inmediatos', validación onBlur). Registrado como follow-up de consistencia, no como gap: el diálogo es usable y la salida existe."

### 29. El aviso de cierre bloqueado se escucha, no sólo se ve (WR-08)
expected: Con un lector de pantalla (o el inspector de accesibilidad del navegador), repetí el caso del test 26 usando **Escape**: el aviso tiene que anunciarse, no sólo aparecer como toast visual. El toast vive fuera del portal del modal, así que la vía visual sola no alcanzaba.
result: pass
reported: "se anuncia"
note: "Confirma la región `sr-only role=status aria-live=assertive` montada DENTRO de cada popup (commit 846a68b). Sin ella el aviso era inalcanzable para lector de pantalla: el toast de sonner vive en app/layout.tsx, fuera del portal, y el modal marca esa región inert/aria-hidden. Límite aceptado y documentado: la región no se auto-apaga (un timer en useRef sumaba 3 errores de eslint contra un piso fijo), así que dos cierres bloqueados seguidos dentro del mismo diálogo anuncian una sola vez."

### 30. Lectura de la entrada G-23-20 del 23-UI-SPEC.md, ya corregida (G-23-24, plan 23-11)
expected: Leyendo SÓLO esa entrada, alguien que no vio esta UAT puede responder: qué ve el dueño en desktop, qué ve en mobile, por qué no son lo mismo, y —lo nuevo— que la fila de las acciones se DERIVA de cuántos hijos rinde la columna izquierda (no es un número fijo) y qué se rompe si alguien la vuelve a clavar.
result: pass
reported: "Se entiende"
note: "Segunda lectura humana de esta entrada: el Test 22 aprobó la versión anterior ('se entiende') y ahí mismo se detectó que había quedado desactualizada respecto del fix de WR-03. El plan 23-11 corrigió dos cosas —un bullet nuevo, 'La fila de las acciones se DERIVA, no se fija', y la regla final, que ahora nombra WR-03 como un defecto que YA ocurrió y no como una precaución teórica— y además puso la entrada al día con la tarjeta post-23-09 (cinco hijos en la columna izquierda, no seis). Cierra G-23-24."
closes: G-23-24

## Summary

total: 30
passed: 30
issues: 0
pending: 0
skipped: 0
blocked: 0

## Deferred Follow-Ups

- test: 9
  idea: "En mobile no hay arrastre pero figuran los puntitos de arrastre; me interesa que se puedan ordenar con el dedo en móvil en algún momento (en web cms funcionó con el panel de inmobiliarias para ordenar fotos). Después lo vemos."
  deferred_at: 2026-09-17
- test: 23
  idea: "El link a Equipo que hoy aparece SÓLO cuando no hay cobertura ('Nadie lo ofrece — asignalo en Equipo') podría aparecer también cuando SÍ hay cobertura, con el texto 'Cambiar', para tener acceso directo a reasignar desde la tarjeta."
  deferred_at: 2026-09-21
  note: "Capacidad nueva, no un defecto del Test 23 (que pasó). Es un cambio de la línea de cobertura de la tarjeta de /servicios — la misma región bajo contrato de G-23-20, así que quien lo tome tiene que respetar la fila derivada de las acciones."
- test: 28
  idea: "En 'Editar sede' con el nombre vacío, sumar el error inline en rojo debajo del campo, como ya hace el resto del panel. Hoy sólo se deshabilita Guardar."
  deferred_at: 2026-09-21
  note: "El test pasó (no se lee como trabada). Es consistencia con el patrón que el proyecto ya exige: 'errores inline e inmediatos', validación onBlur y no al enviar. Cambio chico, acotado al diálogo de sede."

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
  status: resolved
  resolved_by: 23-09-PLAN.md
  resolved_at: 2026-09-21
  verify_test: 23
  reason: "User reported con captura: 'Salvo lo del nombre en +40 caracteres en movil'. Un servicio llamado Premiumssssss… (40+ caracteres sin espacios) no envuelve en mobile."
  severity: minor
  test: 21
  root_cause: "settings-client.tsx:2758 — el <p> del nombre no declara `min-w-0`. Es flex item y en mobile `sm:truncate` no aplica, así que su overflow queda `visible` y el tamaño mínimo automático de flex item (Flexbox §4.5) resuelve a min-content. `break-words` (overflow-wrap: break-word) NO reduce el min-content: medido, 307.88px con `normal` y 307.88px con `break-word` (vs 12px con `anywhere` o `break-all`). El item no puede encoger. Interior de la tarjeta a 375px = 271px exactos → DESBORDE de 36.88px, y 147px cuando está la pill 'Sin cobertura'. Desktop no funciona por mérito propio: funciona porque `sm:truncate` pone overflow:hidden, que es lo que anula el mínimo automático. El `min-w-0` del PADRE (2756) ya existe y no tiene nada que ver. La descripción (2819) se salvó del mismo defecto por accidente: `line-clamp-1` también implica overflow:hidden (ya habían chocado con esto en G-23-6; al nombre nunca le llegó el mismo tratamiento — es el mismo defecto, segunda vez)."
  artifacts:
    - path: "app/(dashboard)/settings/settings-client.tsx"
      issue: "L2758 — el <p> del nombre es `text-sm font-medium break-words sm:truncate`, sin `min-w-0`"
  missing:
    - "Agregar `min-w-0` al <p> de 2758 CONSERVANDO `break-words` — los dos son necesarios juntos: min-w-0 deja encoger la caja, break-words parte la palabra una vez acotada (medido: min-w-0 solo deja width=271 pero scrollWidth=308)"
  fix_decision: "Opción A (`min-w-0` + `break-words`). Las 4 candidatas eliminan el desborde (271px / 2 líneas / 0); se deciden por el daño colateral. `break-all` parte nombres NORMALES a mitad de palabra ('Masaje descontracturant|e', 'Depilación definitiva Pre|mium') — descartada. `min-w-0` y `overflow-wrap: anywhere` son indistinguibles en resultado medido, pero min-w-0 tiene 73 usos en el repo (dos en este mismo archivo sobre el mismo shape: :3305 y :3418) contra CERO de break-all/anywhere/overflow-wrap. Regresión de desktop verificada a 640px: las 5 candidatas dan colIzq=363.31, truncando=true, sin scroll horizontal."

- gap_id: G-23-22
  truth: "El diálogo Editar servicio conserva el mismo ancho al cambiar el modo de cupo, y las tres etiquetas del toggle mantienen columnas de ancho estable"
  status: resolved
  resolved_by: 23-10-PLAN.md
  resolved_at: 2026-09-21
  verify_test: 25
  reason: "User reported con dos capturas: 'El modal de edición, cuando elijo recurso simultáneo cambia el ancho y en el toggle clase grupal pasa a tener dos lineas.' Con Individual seleccionado la que envuelve es 'Recurso simultáneo'; con Recurso simultáneo seleccionado, la que envuelve es 'Clase grupal'."
  severity: cosmetic
  test: 21
  found_outside_scope: true
  root_cause: "SON DOS, y las dos premisas del reporte resultaron falsas al medirlas. (1) EL DIÁLOGO NO CAMBIA DE ANCHO: popup.offsetWidth = 384.00px idéntico en los tres estados (dialog.tsx:69 declara `sm:max-w-sm`, ancho FIJO no derivado del contenido). Lo que cambia es el ancho ÚTIL del cuerpo: settings-client.tsx:3126 tiene `overflow-y-auto` SIN `scrollbar-gutter`; al elegir un modo compartido aparece el bloque 'Cuántos lugares' (:590), el cuerpo pasa de 609 a 735px de alto, supera el disponible (648) y Chrome/Windows materializa un scrollbar clásico de 15px → body 384→369, radiogroup 350→335, celda 111.33→106.33. El header (:3117) y el footer (:3195) NO están dentro de ese contenedor (son filas hermanas del grid de :3116), así que conservan 384 mientras los campos se angostan: el borde del popup deja de alinear con el de los inputs y se lee como 'el diálogo se ensanchó'. (2) LAS TRES COLUMNAS SÍ SON IGUALES: 111.33/111.33/111.34 y 106.33/106.33/106.34 — `sm:grid-cols-3` funciona perfecto, no hay desbalance. El flip es de UN píxel: 'Clase grupal' necesita 83.33px y con scrollbar quedan 82.33 (sin scrollbar hay 87.33). `px-3` (:487) se come 24px de la celda."
  artifacts:
    - path: "app/(dashboard)/settings/settings-client.tsx"
      issue: "L3126 — `overflow-y-auto` sin `scrollbar-gutter: stable`"
    - path: "app/(dashboard)/settings/settings-client.tsx"
      issue: "L463 toggle `sm:grid-cols-3` + L487 `px-3` y `sm:h-9`: el ancho de celda (87.33/82.33) nunca alcanzó para las etiquetas"
  also_found:
    - "'Recurso simultáneo' NUNCA entró en una línea a 384px: necesita 133.58px de celda, o sea un popup de ≥522.74px. El comentario de L462 ('tres columnas iguales en desktop, donde Recurso simultáneo entra en una línea') es FALSO desde que se escribió. Medido: max-w-md (448) sigue dando 2 líneas; recién max-w-xl (576) da 1/1/1."
    - "Defecto no reportado: `sm:h-9` fija 36px y dos líneas miden 40 → button.scrollHeight=40 vs clientHeight=36 con overflow visible. El texto SOBRESALE 2px arriba y abajo de la píldora; en el estado B la que desborda es la seleccionada (bg-primary)."
  origin: "Phase 17 puso la bomba, Phase 23 la movió al escritorio del usuario. Causa (2) y el comentario falso: 228fa13 feat(17-01). Causa (1) el mecanismo: 3991789 fix(17-02). El DISPARADOR: 93e8da6 + 713dbd5 feat(23-02) (Categoría + Descripción corta) sumaron +188px al cuerpo y corrieron la ventana del flip de ~[535,605] a ~[801,901]px de alto de viewport — justo encima de un laptop 1440x900. NO es regresión de 23-08 (el diálogo no se tocó ahí), pero tampoco es ajeno a la Phase 23."
  and_gate: "El flip requiere TRES condiciones simultáneas: scrollbar clásico (Windows — en macOS con overlay scrollbars es 0px y el flip NO existe) + viewport de ~801 a ~901px de alto + el contenido post-23. El wrap de 'Recurso simultáneo' en cambio es de causa única y se ve siempre, en todas las plataformas. Descartado que sea la fuente del tema: medidas las cinco familias --font-sans del panel, 'Recurso simultáneo' es en todas ~1.6x 'Clase grupal'."
  missing:
    - "`scrollbar-gutter: stable` en L3126 — cierra la causa (1) para siempre"
    - "Quitar `sm:grid-cols-3` de L463 — el toggle queda apilado también en desktop"
    - "Corregir el comentario de L462, que afirma lo contrario de lo que el layout puede cumplir"
  user_decision: "Apilar en desktop (opción C, 2026-09-18). Quitar `sm:grid-cols-3` de L463: las tres opciones una debajo de otra como ya se ven en mobile. Las tres etiquetas enteras en una línea, ancho estable, cero reflow horizontal, y la lectura vertical rima con el explicador de abajo (:539) que ya son tres grupos apilados. Cuesta +80px de alto (46→126), aceptado: con el `scrollbar-gutter: stable` puesto, más scroll ya no cambia el ancho. Descartadas: conservar el segmented horizontal (obligaría a asumir por escrito 'Recurso simultáneo' en dos líneas) y ensanchar el diálogo a max-w-xl (rompe la consistencia con los ~15 diálogos del panel y no toca la causa del ancho). Aplica a las DOS instancias del componente: la tarjeta de alta (:3064) y el diálogo de edición (:3167)."
  invariants_to_preserve:
    - "Target táctil de 44px en mobile: `min-h-11 sm:min-h-0` (:487) — la rama base queda intacta"
    - "Accesibilidad del radiogroup: role=radiogroup + role=radio + aria-checked + aria-describedby={helpId(o.key)} (:475-480). La etiqueta tiene que quedar VISIBLE COMPLETA: es el ancla del aria-describedby hacia el explicador. Nada de text-ellipsis."
    - "Los ids por instancia (useId, :432): el componente se monta DOS veces a la vez (alta :3064 + diálogo :3167). Volver a ids literales revive el WR-03 de la Phase 17 — el aria-describedby del diálogo resuelve al bloque del alta."
    - "Leer no puede escribir (D-02, :523-528): el explicador NO es interactivo. Al apilar el toggle, NO fusionarlo con el explicador ni hacer clickeable cada grupo — cada lectura pasaría a disparar onChange."
    - "El patch lleva SIEMPRE capacity_mode + capacity juntos (D-06, :485). Separarlos rebota el INSERT/UPDATE contra services_capacity_matches_mode_chk (migr. 068)."
    - "Los labels son fuente única (CAPACITY_MODE_HELP, :221). El arreglo es de CSS: acortar el texto lo desincroniza con la copy del gate, el aviso de espacio compartido y los comentarios (D-03, :196-198)."
    - "El patrón de scroll es POR CALLER, no del componente (:3099-3101). El `scrollbar-gutter` va en settings-client.tsx:3126, NO en components/ui/dialog.tsx — ahí dejaría de ser byte-idéntico para los ~15 diálogos restantes, que es lo que la Phase 17 decidió evitar."

- gap_id: G-23-23
  truth: "En desktop, el rótulo del modo de cupo y el control inline del cupo comparten una misma línea en vez de ocupar una fila cada uno"
  status: resolved
  resolved_by: 23-09-PLAN.md
  resolved_at: 2026-09-21
  verify_test: 23
  reason: "User reported con captura: 'La tarjeta en desktop: Recurso compartido y el selector terminan tomando una línea cada uno, cuando podriamos ponerlos en una misma línea y compactar un poco la tarjeta.'"
  severity: cosmetic
  test: 21
  found_outside_scope: true
  root_cause: "SON DOS causas que aportan en simultáneo — un fix que atienda una sola deja la otra en pie. (1) settings-client.tsx:2859 y :2881 — el rótulo del modo vive en la línea de datos y el control en su envoltorio hermano: dos hijos distintos de la grilla, los dos en `sm:col-start-1`, así que la ubicación automática les da una fila a cada uno. (2) settings-client.tsx:806 — el contenedor interno de CapacityInlineControl lleva `py-6` SIN gate de viewport, así que los 48px de zona de exclusión táctil de G-04 se renderizan también en desktop. Medido a 1280px con cupo compartido + sedes + cobertura: grid-template-rows = [20 36 16 82 24 32], alto de tarjeta 274px, separación rótulo→stepper 32px, y el 82px de esa fila descompone en 24 (py-6) + 34 (stepper) + 24 (py-6). El 'hueco vertical grande' que reportó el dueño ES la zona de exclusión de G-04 renderizándose en un viewport que no tiene dedo."
  artifacts:
    - path: "app/(dashboard)/settings/settings-client.tsx"
      issue: "L2859 (línea de datos) y L2881 (envoltorio del control): dos hijos de grilla, una fila cada uno"
    - path: "app/(dashboard)/settings/settings-client.tsx"
      issue: "L806 — `py-6` sin gate de viewport en el contenedor interno de CapacityInlineControl"
  missing:
    - "Envolver la línea de datos y el envoltorio del control en un único hijo de grilla: `flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2 sm:col-start-1`"
    - "Mudar el gate `capMode === 'individual' && 'sm:hidden'` de la línea de datos AL ENVOLTORIO"
    - "En L806: `py-6` → `py-6 sm:py-0` (nunca `py-0` a secas)"
    - "Actualizar `leftRows` (L2714-2717): cupo compartido pasa a sumar 1 en vez de 2, y el comentario de L2711-2713 que explica los sumandos"
  fix_decision: "Opción 1 (envoltorio + `sm:py-0`): alto de tarjeta 274 → 202px (−26%), mobile BIT-IDÉNTICO. Se puede juntarlos sólo en desktop sin reabrir G-04: medido a 375px, el `flex-col gap-2` del envoltorio reproduce exactamente el ritmo de hoy (líneaDatos→botón 33px y botón→'Se ofrece en:' 33px, iguales con y sin envoltorio; alto 343px en los dos), y el `py-6` sigue vigente por debajo de 640px, que es donde existe el dedo. Descartadas: juntar sin tocar el py-6 sólo baja a 250px; duplicar el rótulo viola 'una sola pasada, sin markup duplicado' (L2721) y no ahorra nada; meter el rótulo adentro del control rompe D-07 (deja de ser el tercer dato del renglón de mobile) y pone texto inerte pegado horizontalmente a los botones del stepper; misma fila explícita es inviable (los dos son col-start-1 → superposición)."
  actions_row_verified: "Con la fórmula actualizada, las 5 configuraciones a 1280px dan las acciones en la ÚLTIMA fila y ningún hijo de la izquierda queda después: individual 2→r3 (126px), compartido 3→r3 (128px), individual+sedes+cobertura 4→r4 (156px), compartido+sedes 4→r4 (168px), compartido+sedes+cobertura 5→r5 (198px). WR-03 no se reabre."
  failure_modes:
    - "GRAVE — olvidar mudar el gate `sm:hidden` al envoltorio: con cupo individual queda un envoltorio VACÍO reclamando una fila de 0px (+8 de gap) que desfasa todo hacia abajo mientras actionsRow se queda donde estaba. Medido: filas=[20 34 0 32 16], acciones en r4 y la cobertura en r5 → WR-03 REABIERTO, con el salto hacia atrás en el orden de foco."
    - "No grave — olvidar actualizar `leftRows` (sigue sumando 2): no queda contenido debajo de las acciones, pero los botones se van a una fila fantasma y se pierde la compactación (compartido sin sedes 128→168px, compartido+sedes+cobertura 198→222px)."
    - "De contrato — el `py-6` NO se toca por debajo de 640px. El gate tiene que ser `sm:py-0`, nunca `py-0`. El comentario de L789-798 es el contrato: el control se separó porque el navegador corregía el punto de toque y tocar la duración bajaba el cupo."

- gap_id: G-23-24
  truth: "La entrada G-23-20 del 23-UI-SPEC.md describe el layout REAL, incluida la fila derivada de las acciones, y su regla previene el defecto que ya ocurrió"
  status: resolved
  resolved_by: 23-11-PLAN.md
  resolved_at: 2026-09-21
  verify_test: 30
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

- gap_id: G-23-25
  truth: "Un diálogo de edición con cambios sin guardar no se descarta por un click afuera o un Escape accidental; sin cambios, cierra como siempre"
  status: resolved
  resolved_by: 23-10-PLAN.md, 23-REVIEW-FIX.md (WR-05)
  resolved_at: 2026-09-21
  verify_test: 26, 27
  reason: "User reported (2026-09-18, DESPUÉS de cerrar la UAT): 'Al editar un servicio, si toco fuera del modal por accidente se cierra sin guardar ni warning.'"
  severity: minor
  reported_post_uat: true
  root_cause: "settings-client.tsx:3098 — `<Dialog open={!!editSvc} onOpenChange={open => { if (!open) setEditSvc(null) }}>`. El handler descarta el borrador ante CUALQUIER motivo de cierre sin mirar si hay cambios. Base UI (`@base-ui/react/dialog`) cierra por outside-press por default: `DialogRootProps.disablePointerDismissal` es `false`. Verificado en node_modules/@base-ui/react/dialog/root/DialogRoot.d.ts."
  precedent: "NINGUNO. Cero ocurrencias de onInteractOutside / onPointerDownOutside / dismissible / disablePointerDismissal en todo app/ y components/. La suposición de que 'ya se usa en otro lado del panel' no se sostiene."
  artifacts:
    - path: "app/(dashboard)/settings/settings-client.tsx"
      issue: "L3098 diálogo Editar servicio: onOpenChange descarta sin mirar si el form está sucio"
    - path: "app/(dashboard)/settings/settings-client.tsx"
      issue: "L3556 diálogo Editar sede: misma forma, mismo par original+borrador (editLoc / editLocForm)"
  user_decision: "Bloquear SÓLO si hay cambios (2026-09-18). Sin cambios: cierra como siempre por click afuera, Escape y X — cero fricción, y respeta la regla de CLAUDE.md ('Modales: cerrar con Escape, click fuera y botón X'). Con cambios sin guardar: el click afuera y Escape NO cierran y sale un toast 'Tenés cambios sin guardar' (sonner ya está importado en :10). La X SÍ cierra: es intención explícita. SIN modales anidados — la regla de CLAUDE.md los prohíbe, y por eso se descartó la confirmación '¿Descartar cambios?'."
  how: "`disablePointerDismissal={sucio}` en el <Dialog> (el wrapper de components/ui/dialog.tsx reenvía props a DialogPrimitive.Root sin tocar nada, así que NO hay que modificar dialog.tsx) + guarda por `eventDetails.reason === 'escape-key'` en onOpenChange. Los reasons de Base UI están en node_modules/@base-ui/react/internals/reason-parts.d.ts: 'outside-press', 'escape-key', 'close-press'."
  scope:
    - "Editar servicio (:3098) — lo que reportó el usuario"
    - "Editar sede (:3556) — misma forma y el par editLoc/editLocForm ya existe, sale gratis"
    - "Editar profesional (:3867) — VERIFICAR si tiene estado de borrador separado; si no lo tiene, dejarlo documentado como follow-up en vez de inventar uno"
    - "FUERA: cancelar suscripción (:3847) — es una confirmación, no un formulario"
  missing:
    - "Derivar `sucio` comparando el borrador contra el original, con la MISMA normalización que usa el guardado (normalizeServiceDuration / normalizeServicePrice / trim), o un campo recién normalizado en onBlur va a marcar sucio un form que nadie tocó"
    - "El toast no puede spamear: un click afuera sostenido o repetido no debe apilar toasts"
