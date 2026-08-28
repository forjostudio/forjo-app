---
phase: quick-260828-lpg
plan: 01
subsystem: dashboard-settings-servicios
tags: [ui, mobile, responsive, a11y, tailwind, quick-task]
status: complete
requires:
  - "Tarjeta de servicio de /servicios (fase 19, motor-reservas)"
  - "Invariante de 32px de G-04 (control de cupo inline)"
provides:
  - "Tarjeta de servicio con layout responsive de una sola pasada: columna en mobile con acciones al final, grilla de 2 columnas en desktop"
affects:
  - "app/(dashboard)/settings/settings-client.tsx (bloque visibleServices.map)"
tech-stack:
  added: []
  patterns:
    - "Un solo markup para mobile y desktop: flex-col + sm:grid con colocación explícita de columnas (sin duplicado hidden/sm:hidden)"
    - "Zona de exclusión táctil de 32px entre texto inerte y el primer botón (G-04), ahora aplicada a DOS filas"
key-files:
  created: []
  modified:
    - "app/(dashboard)/settings/settings-client.tsx"
decisions:
  - "Las acciones bajan al final del DOM en las dos vistas; en desktop se re-anclan a fila 1 / columna 2 con grid en vez de duplicar markup"
  - "Los cinco sm:col-start-1 son correctitud del auto-placement de grid, no decoración"
  - "El desfase entre posición visual y orden de tabulación en desktop se documenta, no se compensa con tabIndex positivo"
metrics:
  duration: "~25 min"
  completed: "2026-08-28"
  tasks: 2
  files_modified: 1
---

# Quick Task 260828-lpg: Tarjeta de servicios — acciones al final en mobile — Summary

Layout responsive de una sola pasada en la tarjeta de servicio: en mobile el nombre se lleva el ancho interior entero y las 3 acciones caen a su propia fila al final; en desktop la tarjeta pasa a ser una grilla de 2 columnas y se ve igual que siempre.

## Qué se construyó

**El defecto.** Reportado desde un navegador móvil real con captura: a 375px el nombre del servicio truncaba duro ("Mechas califo…", "Alisado perma…") porque los 3 botones de acción le comían el ancho en el mismo renglón. Con nombres largos el dueño no podía distinguir dos servicios en una pantalla que usa mucho desde el celular.

**La solución (elegida por el usuario entre 4 mockups, no relitigada).**

- El contenedor de la tarjeta pasa de bloque con ritmo por margen a `flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center`.
- La "Fila A" se disuelve: el div de acciones sale de ahí y pasa a ser el **último hijo directo** de la tarjeta. Markup **único** — no hay duplicado `hidden`/`sm:hidden`.
- El título pasa de `truncate` a `break-words sm:truncate`: envuelve en mobile, trunca en desktop igual que antes.
- Los cinco hijos de contenido fijan `sm:col-start-1`; las acciones fijan `sm:col-start-2 sm:row-start-1`.
- Blindaje táctil de la nueva fila: `pt-6 sm:pt-0` (zona de exclusión), los 3 botones a 44px en mobile (`h-11 w-11 sm:h-8 sm:w-8` en los de icono, `min-h-11 sm:min-h-0` en Desactivar), `ml-auto sm:ml-0` en Editar para empujar el par Editar+Eliminar al borde derecho, y `aria-label` con el nombre del servicio en el botón de estado.

## Tareas completadas

| Task | Nombre | Commit | Archivos |
|------|--------|--------|----------|
| 1 | Sacar las acciones de la Fila A y hacer la tarjeta responsive de una sola pasada | `5e96453` | `app/(dashboard)/settings/settings-client.tsx` |
| 2 | Blindaje táctil y accesible de la nueva fila de acciones en mobile | `0afa917` | `app/(dashboard)/settings/settings-client.tsx` |

## Para el próximo que lea esta tarjeta

**1. La invariante de 32px de G-04 ahora aplica a DOS filas, no a una.**
Hasta hoy la única adyacencia peligrosa era la línea de datos contra el control de cupo. Al bajar las acciones al final, el texto inerte que queda encima (la línea de datos, "Se ofrece en:", "Lo hacen: …") pasa a tener un botón a 8px — la **misma** adyacencia que produjo el defecto original, pero ahora el interactivo más cercano es "Desactivar" o el tacho de borrar, o sea una mutación de estado del negocio en vez de un stepper. Por eso la fila de acciones se lleva su propia zona de exclusión (`pt-6` = 24px propios + 8px del ritmo de la tarjeta = 32). La derivación es la ya escrita en el archivo: piso táctil de 44px → radio de contacto de 22px → un dedo centrado en un renglón de 18px llega 31px más abajo → 32 es el primer paso de la escala que lo supera. **Bajar ese padding reabre el defecto en la fila de acciones.**

**2. Los cinco `sm:col-start-1` son correctitud, no decoración.**
Con las acciones colocadas explícitamente en `sm:col-start-2 sm:row-start-1`, el algoritmo *sparse* de auto-placement ubicaría el hijo 1 en (fila 1, col 1), saltearía (fila 1, col 2) por estar ocupada, pondría el hijo 2 en (fila 2, col 1) y el hijo 3 caería en **(fila 2, col 2)** — o sea un bloque de contenido se iría a la columna de las acciones en desktop. **Un hijo de contenido nuevo TIENE que declarar su columna igual que los cinco que ya están.** Dos de esas cinco anclas viven en envoltorios creados para eso: `CapacityInlineControl` no acepta `className`, y el bloque de cobertura tiene dos ramas excluyentes (una sola ancla para las dos).

**3. El desfase de orden de tabulación en desktop es decisión escrita, no olvido.**
Con las acciones al final del DOM, el recorrido de la tarjeta es contenido → acciones en las dos vistas. En mobile eso *alinea* foco y orden visual (mejora WCAG 2.4.3 / 1.3.2). En desktop la posición visual (arriba a la derecha) y el orden de tabulación (último) no coinciden: es una secuencia significativa y habitual para una tarjeta —contenido primero, acciones después— y queda desambiguada por los tres `aria-label` con el nombre del servicio. **Prohibido compensarlo con `tabindex` positivo**: es antipatrón y rompería el orden del resto de la página (hay un gate automatizado que lo verifica).

**4. Lo que NO se movió, a propósito.**
La pill "Sin cobertura" sigue en el bloque del nombre (el comentario de la línea de datos anticipa esa "mejora" y responde que no). El `py-6` del control de cupo está intacto. El `ritmo` de 8px es el mismo (`space-y-2` → `gap-2` son los mismos 8px). El aviso de borrado de la fase 19 (rango ~1207-1270) no se tocó.

## Verificación

**Gates automatizados (todos PASS, `GATE_OK` impreso en las dos tareas):**

- `./node_modules/.bin/tsc --noEmit` → exit 0 (binario local; `npx tsc` es falso verde en este repo).
- `./node_modules/.bin/eslint` sobre el archivo → sigue en **`11 problems (11 errors, 0 warnings)`**, los mismos `react-hooks/purity` preexistentes de las líneas 1115 y 1594, fuera del rango tocado. **Cero hallazgos nuevos.** Baseline guardado en `eslint-baseline.txt`.
- Conteos estructurales exactos: `sm:grid-cols-[minmax(0,1fr)_auto]`=1 · `sm:col-start-1`=5 · `sm:col-start-2 sm:row-start-1`=1 · `sm:truncate`=1 · `sm:items-center`=1 · `py-6 text-xs text-muted-foreground`=1 · `pt-6 sm:pt-0`=1 · `h-11 w-11 sm:h-8 sm:w-8`=4 · `ml-auto sm:ml-0`=1 · `min-h-11 sm:min-h-0`=7 · `tabIndex` positivo=0.
- `git diff HEAD~2 HEAD --name-only` → **un solo archivo**, sin borrados de archivos, sin tocar el rango ~1207-1270 ni las tarjetas de profesionales/consultorios (todos los hunks caen entre las líneas 2491 y 2650).
- Conteo de llamadas a handlers idéntico antes/después: `toggleService` 3/3 · `openEditService` 2/2 · `openDeleteService` 3/3 · `setServiceLocations` 3/3 · `toggleServiceLocation` 2/2 · `saveCapacityInline` 2/2. **Cero cambios de lógica.**

**Verificación visual: PENDIENTE — la hace el usuario, no el ejecutor.**

Es la única que puede confirmar el resultado y NO se puede reclamar desde acá. ⚠ **`auto_advance: true` NO auto-aprueba este checkpoint**: hay que abrir el navegador. Dev server en `http://localhost:3000` contra el Supabase LOCAL, login `test@forjo.local` / `Forjo1234!`, pantalla Ajustes → Servicios (ya sembrada con 8 servicios de largos variados: "Barba", "Mechas californianas con tono", "Alisado permanente" inactivo).

Lista completa en el `<human-check>` de la Task 2 del PLAN. Los puntos que más importan:

- **Mobile 375px:** nombre largo en 2 líneas sin puntos suspensivos · acciones en su propia fila al final, "Desactivar" a la izquierda y lápiz+tacho contra el borde derecho · aire visible entre el último contenido y la fila de acciones.
- **Prueba de dedo (G-04, la regresión más cara):** tocar "150min · $42.000", "Se ofrece en:" y "Lo hacen: …" no puede disparar Desactivar, ni abrir edición, ni abrir el borrado. Y con `capMode != 'individual'`: **tocar la duración no baja el cupo y tocar el rótulo del modo no lo sube**.
- **Desktop ≥640px:** la tarjeta tiene que verse **indistinguible** de antes del cambio (acciones inline a la derecha del título, centradas con él, nombre truncando con ellipsis, botones del mismo tamaño de siempre).

## Desviaciones del plan

Ninguna regla 1-4 aplicada. Dos precisiones de implementación dentro de lo que el plan ya pedía:

**1. El bloque de cobertura se envolvió en un div para llevar el ancla de columna.**
El plan lo lista como "un" hijo de contenido, pero en el código son **dos ramas excluyentes** (`covered ? <p> : <p role="status">`). Ponerle la clase a cada rama habría dado 6 ocurrencias y roto el gate de 5. Se resolvió con el mismo patrón que el plan ya manda para `CapacityInlineControl`: un envoltorio sin estilos propios que declara la columna una sola vez. Sin efecto visual (un div de bloque conteniendo un elemento de bloque).

**2. El comentario original de la "Fila A" se reescribió, no se borró.**
Conserva el *por qué* documentado (los 61px de desborde medidos a 375px, G-02, el precedente de la fila mobile de Finanzas / POLISH-10, D-14) y suma el motivo nuevo y la advertencia de correctitud del auto-placement. Las advertencias sobre la pill (D-14/D-07) y sobre G-04 quedaron intactas donde estaban.

## Auth gates

Ninguno.

## Threat surface

Sin superficie nueva. Cambio 100 % presentacional dentro de un componente cliente ya existente: cero rutas, cero queries, cero handlers, cero props de datos, cero red. El aislamiento por `business_id` de esta pantalla no se toca.

- **T-lpg-01 (Tampering, corrección del punto de toque):** mitigado con la zona de exclusión de 32px. Confirmación final = punto 4 del human-check, pendiente.
- **T-lpg-02 (Tampering, control de cupo):** mitigado — `py-6` intacto (gate automatizado) y ritmo de 8px sin cambio de valor. Confirmación final = punto 8 del human-check, pendiente.
- **T-lpg-03/04/05:** aceptados como en el plan (el borrado sólo cambia de posición y tamaño; sin superficie de DoS ni de divulgación).

## Self-Check: PASSED

- `app/(dashboard)/settings/settings-client.tsx` — FOUND (modificado, en el árbol)
- `.planning/quick/260828-lpg-tarjeta-de-servicios-acciones-al-final-e/eslint-baseline.txt` — FOUND
- Commit `5e96453` — FOUND en `git log`
- Commit `0afa917` — FOUND en `git log`
