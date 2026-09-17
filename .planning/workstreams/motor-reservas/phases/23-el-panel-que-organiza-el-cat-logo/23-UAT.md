---
status: complete
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
expected: Acomodás categorías y servicios a mano. En "Orden de las categorías" elegís Alfabético: las filas se reordenan A-Z y desaparecen flechas/grip de las filas. En "Orden de los servicios" elegís Alfabético o Por precio: la lista de servicios de abajo se reordena al instante agrupada por categoría y desaparecen grip/arrastre del chip. Volvés a "Como los ordené yo" en ambos: vuelve exactamente tu orden manual, también tras recargar.
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
  artifacts: []
  missing: []
- gap_id: G-23-6b
  truth: "La tarjeta del servicio en el panel muestra al menos una línea de la descripción y un link subrayado Editar que abre el mismo diálogo que el lápiz"
  status: failed
  reason: "User reported: en el panel, estaría bueno que la tarjeta muestre al menos una línea de la descripción y un link subrayado de editar que abra lo mismo que el botón del lápiz"
  severity: minor
  test: 6
  artifacts: []
  missing: []
- gap_id: G-23-10a
  truth: "Con el orden de categorías en Alfabético, el dueño igual puede pasar un servicio de una categoría a otra arrastrando el chip (el modo de categorías no debería bloquear la asignación)"
  status: failed
  reason: "User reported: si elijo alfabético en las categorías ya no puedo pasar servicios de una a otra; los chips sólo se mueven haciéndoles clic y eligiendo en el modal"
  severity: minor
  test: 10
  artifacts: []
  missing: []
- gap_id: G-23-10b
  truth: "El dueño puede acomodar a mano el orden de los servicios (no sólo por orden de alta)"
  status: withdrawn
  reason: "User reported: los servicios nunca se pudieron acomodar a mano, sólo quedan por orden de agregado"
  withdrawn_reason: "El usuario aclaró que el orden manual sí funciona dentro de los chips de cada categoría (Posición y chip sobre chip); había entendido que se refería a la lista principal. No es un gap."
  severity: major
  test: 10
  artifacts: []
  missing: []
