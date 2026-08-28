---
phase: quick-260828-lpg
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - app/(dashboard)/settings/settings-client.tsx
autonomous: true
requirements: ["LPG-01"]

must_haves:
  truths:
    - "En mobile (375px) el nombre del servicio se lleva el 100% del ancho interior de la tarjeta y envuelve en varias lineas en vez de truncarse."
    - "En mobile las 3 acciones (Desactivar/Activar, Editar, Eliminar) estan en su propia fila al FINAL de la tarjeta, con Desactivar a la izquierda y Eliminar en el borde derecho."
    - "En desktop (>=640px) la tarjeta se ve exactamente igual que hoy: acciones inline a la derecha del titulo, en la primera fila, y el titulo sigue truncando con ellipsis."
    - "El markup de las acciones existe UNA sola vez (no hay duplicado mobile/desktop)."
    - "Tocar texto inerte de la tarjeta en mobile (la linea de datos, 'Se ofrece en:', 'Lo hacen:') NO dispara ninguna accion: la invariante de 32px entre texto inerte y el primer pixel de un boton (G-04) se conserva y se extiende a la nueva fila de acciones."
    - "El stepper de cupo (capMode != 'individual') conserva intactos su py-6 y los 8px del ritmo de la tarjeta: tocar la duracion no cambia el numero."
    - "La pill 'Sin cobertura' sigue en el bloque del nombre, no baja a la linea de datos."
    - "Los 3 botones de accion tienen area tactil >=44px en mobile y siguen midiendo lo mismo que hoy en desktop."
    - "Cero cambios de logica: mismos handlers (toggleService, openEditService, openDeleteService), mismas queries, mismo aviso de borrado de la fase 19."
  artifacts:
    - path: "app/(dashboard)/settings/settings-client.tsx"
      provides: "Tarjeta de servicio con layout responsive de una sola pasada: flex-col en mobile con acciones al final, grid de 2 columnas en desktop con acciones ancladas en fila 1 / columna 2"
      contains: "sm:grid-cols-[minmax(0,1fr)_auto]"
  key_links:
    - from: "contenedor de la tarjeta de servicio (visibleServices.map)"
      to: "los 5 hijos de contenido + el div de acciones"
      via: "auto-placement de CSS grid: cada hijo de contenido fija sm:col-start-1 y las acciones fijan sm:col-start-2 sm:row-start-1"
      pattern: "sm:col-start-(1|2)"
    - from: "div de acciones (ahora ultimo en el DOM)"
      to: "el texto inerte que queda encima en mobile"
      via: "pt-6 sm:pt-0 = 24px propios + 8px del gap de la tarjeta = los 32px de la invariante G-04"
      pattern: "pt-6 sm:pt-0"
---

<objective>
En la tarjeta de servicio de Ajustes (`/servicios`), mover las 3 acciones al final de la tarjeta en mobile y dejarlas inline al lado del titulo en desktop, **sin duplicar markup**, para que el nombre del servicio deje de truncarse a 375px ("Mechas califo...", "Alisado perma...").

Purpose: es una pantalla que el dueno usa mucho desde el celular y hoy no puede distinguir dos servicios con nombres largos. Reportado desde navegador real con captura.

Output: `app/(dashboard)/settings/settings-client.tsx` con la tarjeta reestructurada. Un solo archivo, cero logica nueva, cero componentes nuevos, cero dependencias.
</objective>

<execution_context>
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/workflows/execute-plan.md
@C:/Users/franc/Desktop/Forjo Studio/forjo-app/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/workstreams/motor-reservas/STATE.md
@CLAUDE.md
@AGENTS.md
@.claude/CLAUDE.md
@.claude/skills/convenciones-forjo/SKILL.md

# La tarjeta a tocar vive en `visibleServices.map(...)`, aprox. lineas 2490-2601.
# LEER TODOS LOS COMENTARIOS DE ESE BLOQUE ANTES DE EDITAR: documentan G-02, G-04, D-07, D-14,
# R2-1 y POLISH-10, y al menos dos de esas decisiones son las que este cambio puede reabrir.
@app/(dashboard)/settings/settings-client.tsx
</context>

<decisiones_ya_tomadas_no_reabrir>
El usuario eligio este enfoque entre 4 alternativas con mockups. **NO** proponer un kebab `...`, **NO** apilar
tambien en desktop, **NO** duplicar el markup de las acciones con `hidden`/`sm:hidden`. Descartadas
explicitamente y con motivo:

- Kebab: suma un tap a toda accion y seria el primer menu de la app (`@base-ui/react/menu` no se usa en
  ningun lado del repo), con su propia superficie de a11y.
- Apilar en desktop: el desktop tiene ancho de sobra y hoy no tiene ningun defecto. Tocarlo es riesgo sin beneficio.

Layout aprobado:

MOBILE (<640px): nombre (ancho entero, envuelve) / linea de datos / stepper de cupo si aplica /
"Se ofrece en:" / cobertura / **fila de acciones al final** (Desactivar a la izquierda, lapiz y tacho
agrupados a la derecha).

DESKTOP (>=640px): **identico a hoy** — titulo a la izquierda con truncate, las 3 acciones inline a su
derecha en la primera fila; la linea de datos y el resto debajo, en la columna del titulo.
</decisiones_ya_tomadas_no_reabrir>

<hallazgos_de_lectura>
Verificado contra el codigo real antes de escribir este plan. El enfoque propuesto en el brief **funciona**,
con cuatro precisiones que el ejecutor necesita:

1. **El enfoque del brief se confirma.** Hoy el contenedor es un bloque (`p-3 rounded-lg bg-secondary/50 space-y-2`)
   y el div de acciones esta anidado dentro de la "Fila A". `order` solo no alcanza porque opera entre hermanos
   del mismo contenedor flex: hay que sacar el div de acciones de la Fila A y volverlo hijo directo de la tarjeta,
   ultimo en el DOM.

2. **`sm:col-start-1` es obligatorio en LOS CINCO hijos de contenido, no opcional.** Con las acciones colocadas
   explicitamente en `sm:col-start-2 sm:row-start-1` y el resto en auto-placement, el algoritmo sparse de grid
   ubicaria el hijo 1 en (fila1,col1), saltearia (fila1,col2) por estar ocupada, pondria el hijo 2 en (fila2,col1)
   y el hijo 3 caeria en **(fila2,col2)**. Fijando la columna en cada hijo de contenido, cada uno se lleva su
   propia fila y los hijos condicionales (`capMode`, `activeLocations`, `showCoverage`) siguen funcionando por
   posicion, no por indice.

3. **`CapacityInlineControl` no acepta `className`.** Para darle `sm:col-start-1` hay que **envolverlo en un div**;
   no agregarle un prop al componente. El wrapper no tiene padding propio, asi que la distancia desde la linea de
   datos hasta el primer boton del stepper sigue siendo 8px (gap) + 24px (`py-6` interno) = **32px**. La invariante
   de G-04 queda intacta y el bloque de comentarios del componente no se toca.

4. **`space-y-2` -> `gap-2` conserva exactamente los 8px.** `space-y-2` es margin-top 8px entre hermanos; `gap-2`
   es 8px de row-gap tanto en flex-col como en grid. Los dos sumandos de la invariante de 32px (24 de `py-6` +
   8 del ritmo) quedan iguales. Como los hijos condicionales renderizan `false` (no un nodo `hidden`), el selector
   de `space-y` y el `gap` son equivalentes aca.

**RIESGO NUEVO que el brief no nombra y este plan cierra (Task 2).** Al bajar las acciones al final, en mobile
queda un boton a **8px** por debajo de texto inerte ("150min · $42.000", "Se ofrece en:", "Lo hacen: ..."). Esa es
la MISMA adyacencia que produjo el defecto de G-04 — los navegadores moviles corrigen el punto de toque hacia el
interactivo mas cercano — y ahora el interactivo mas cercano es "Desactivar" o el tacho, no un stepper. El bloque
de comentarios del control declara la invariante como propiedad **de la tarjeta entera**: "entre cualquier texto
inerte de esta tarjeta y el primer pixel de un boton hay 32px". Por eso la fila de acciones se lleva su propia
zona de exclusion en mobile (`pt-6`), con la misma derivacion y el mismo numero. En desktop `sm:pt-0` deja la
fila 1 identica a hoy.

**Baselines medidos** (para los gates automatizados de abajo): eslint sobre el archivo da hoy exactamente
`11 problems (11 errors, 0 warnings)`, todos `react-hooks/purity` en las lineas 1115 y 1594 — **fuera** del rango
a tocar. Ocurrencias actuales: `sm:col-start-1` 0 · `sm:col-start-2` 0 · `sm:grid-cols-[minmax(0,1fr)_auto]` 0 ·
`sm:truncate` 0 · `pt-6 sm:pt-0` 0 · `ml-auto sm:ml-0` 0 · `break-words` 0 · `sm:items-center` 0 ·
`h-11 w-11 sm:h-8 sm:w-8` **2** (precedente vivo: los botones del `CapacityStepper`, lineas 359 y 397) ·
`py-6 text-xs text-muted-foreground` 1 (el control de cupo, que NO se toca).
</hallazgos_de_lectura>

<tasks>

<task type="auto">
  <name>Task 1: Sacar las acciones de la Fila A y hacer la tarjeta responsive de una sola pasada</name>
  <files>app/(dashboard)/settings/settings-client.tsx</files>
  <action>
Alcance exclusivo: el bloque de la tarjeta de servicio dentro de `visibleServices.map(s => ...)`, aprox. lineas
2490-2601. Las tarjetas de profesionales (~2835) y consultorios (~3002) usan clases parecidas y **no se tocan**.
Tampoco se toca nada del rango ~1207-1270 (pre-check de borrado, fase 19 con UAT abierta).

Paso 0 — baseline de lint, ANTES de editar nada:
`./node_modules/.bin/eslint "app/(dashboard)/settings/settings-client.tsx" 2>&1 | tail -3 > .planning/quick/260828-lpg-tarjeta-de-servicios-acciones-al-final-e/eslint-baseline.txt`
Tiene que decir `11 problems (11 errors, 0 warnings)`. Si dice otra cosa, PARAR y reportar: el gate de "cero
hallazgos nuevos" depende de ese numero.

Paso 1 — contenedor de la tarjeta. La className pasa de `p-3 rounded-lg bg-secondary/50` + ritmo vertical por
margin, a `p-3 rounded-lg bg-secondary/50 flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center`.
Notas que NO son opcionales:
  - el ritmo pasa a `gap-2`, que son los mismos 8px: es el sumando que, junto al `py-6` propio del control de cupo,
    forma la invariante de 32px de G-04. No cambiar ese valor por `gap-1` ni `gap-3`.
  - `sm:items-center` restituye el centrado vertical que hoy aporta el `items-center` de la Fila A. Sin el, la
    fila 1 mide lo que miden los botones (32px) y el nombre quedaria pegado arriba en desktop. Va con prefijo `sm:`
    a proposito: en el flex-col de mobile, un `items-center` sin prefijo centraria todo horizontalmente.
  - `minmax(0,1fr)` en la columna 1 es lo que le saca el piso de min-content y habilita el truncate del titulo en
    desktop.

Paso 2 — disolver la Fila A. Hoy hay tres niveles: el flex de la fila, un div intermedio `flex-1 min-w-0`, y
adentro el flex del nombre+pill. Con las acciones afuera, los dos primeros ya no tienen trabajo: colapsar a UN
solo hijo directo de la tarjeta con `flex items-center gap-2 min-w-0 sm:col-start-1`, que contiene el `<p>` del
nombre y la pill condicional.
  - `min-w-0` es load-bearing y se queda: un grid item tiene `min-width: auto` por defecto y desbordaria.
  - `flex-1` desaparece con el div que lo llevaba (en un flex-col significaria crecer en vertical, que no es lo
    que se quiere).
  - la pill "Sin cobertura" NO se mueve: sigue dentro de este bloque. El comentario de la linea de datos anticipa
    que el proximo lector va a querer bajarla y responde que no. Respetarlo.

Paso 3 — titulo. La className del `<p>` del nombre pasa de `text-sm font-medium truncate` a
`text-sm font-medium break-words sm:truncate`.
  - `truncate` implica `white-space: nowrap`, que es justamente lo que impide envolver: por eso queda condicionado
    a `sm:`. En mobile el nombre tiene el ancho entero y envuelve; en desktop trunca igual que hoy.
  - `break-words` cubre el caso de un nombre de una sola palabra larguisima, que sin `nowrap` desbordaria la
    tarjeta. En desktop es inerte (con `nowrap` el `overflow-wrap` no aplica), asi que no cambia nada alli.

Paso 4 — anclar los hijos de contenido en la columna 1. Agregar `sm:col-start-1` a **cinco** hijos directos de la
tarjeta, en este orden de DOM: (a) el bloque nombre+pill del paso 2, (b) la linea de datos, (c) el control de cupo,
(d) el bloque "Se ofrece en:", (e) el bloque de cobertura.
  - (c) `CapacityInlineControl` no acepta `className`: envolverlo en `<div className="sm:col-start-1">` y dejar el
    componente **byte-identico**, incluido su bloque de comentarios. El wrapper no lleva padding: los 32px de la
    invariante los siguen dando su `py-6` interno mas el `gap-2` de la tarjeta.
  - (d) y (e) ya vienen envueltos en su propio div/`<p>` condicional: se les agrega la clase al elemento que ya existe.
  - los cinco son obligatorios: sin ellos el auto-placement de grid manda uno de los bloques a la columna 2
    (ver hallazgo 2). Si en el futuro se agrega un sexto bloque de contenido, tambien lo necesita.

Paso 5 — mover las acciones. El div `flex shrink-0 items-center gap-1` con los tres botones sale de la Fila A y
pasa a ser el **ultimo** hijo directo de la tarjeta, despues del bloque de cobertura, con
`sm:col-start-2 sm:row-start-1` agregado. En esta tarea **no se toca nada del interior de los botones**: mismos
handlers, mismas variantes, mismos aria-label, mismo texto.

Paso 6 — comentarios. El bloque que hoy describe la "Fila A" ya no describe la estructura: reescribirlo
conservando el POR QUE que documenta (el desbordamiento medido de 61px a 375px, G-02, y el precedente de la fila
mobile de Finanzas, POLISH-10) y sumando el motivo nuevo: en mobile el nombre se lleva el ancho entero porque las
acciones bajaron; en desktop la tarjeta es una grilla de dos columnas y las acciones estan ancladas a la fila 1.
Dejar escrito que los cinco `sm:col-start-1` son una condicion de correctitud del auto-placement, no decoracion.
No borrar ni recortar la advertencia sobre la pill (D-14/D-07) ni la de G-04.

Restriccion de comentarios: los gates de abajo cuentan ocurrencias literales de tokens de clase en TODO el
archivo. No escribir esos tokens dentro de comentarios; referirse a ellos por concepto ("la columna 1", "la
segunda columna", "el ancla de fila").

Cero logica: ni un handler, ni una query, ni un estado, ni un import nuevo.
  </action>
  <verify>
    <automated>cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && F="app/(dashboard)/settings/settings-client.tsx" && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint "$F" 2>&1 | grep -q '11 problems (11 errors, 0 warnings)' && [ "$(grep -cF 'sm:grid-cols-[minmax(0,1fr)_auto]' "$F")" = "1" ] && [ "$(grep -cF 'sm:col-start-1' "$F")" = "5" ] && [ "$(grep -cF 'sm:col-start-2 sm:row-start-1' "$F")" = "1" ] && [ "$(grep -cF 'sm:truncate' "$F")" = "1" ] && [ "$(grep -cF 'sm:items-center' "$F")" = "1" ] && [ "$(grep -cF 'py-6 text-xs text-muted-foreground' "$F")" = "1" ] && echo GATE_OK</automated>
  </verify>
  <done>
`tsc --noEmit` sale 0 (con el binario local: `npx tsc` da falso verde en este repo). eslint sobre el archivo sigue
reportando exactamente 11 errores / 0 warnings — cero hallazgos nuevos. La grilla de desktop existe una sola vez,
los cinco hijos de contenido estan anclados en la columna 1, las acciones estan ancladas en fila 1 / columna 2 y
aparecen una sola vez en el DOM. El `py-6` del control de cupo sigue intacto (invariante G-04). El comando imprime
GATE_OK.
  </done>
</task>

<task type="auto">
  <name>Task 2: Blindaje tactil y accesible de la nueva fila de acciones en mobile</name>
  <files>app/(dashboard)/settings/settings-client.tsx</files>
  <action>
Todo lo de esta tarea es **mobile-only por construccion**: cada clase nueva lleva su reset con prefijo `sm:` para
que el desktop quede pixel a pixel igual que hoy.

Paso 1 — zona de exclusion de 32px. Agregar `pt-6 sm:pt-0` al div de acciones. Justificacion, que va escrita como
comentario junto a la clase: al bajar las acciones al final, el texto inerte que queda encima (la linea de datos,
"Se ofrece en:", "Lo hacen: ...") pasa a tener un boton a 8px. Es la misma adyacencia que produjo el defecto de
G-04 y ahora el interactivo mas cercano no es un stepper sino "Desactivar" y el tacho. Se replica la derivacion ya
documentada en este archivo: piso tactil de 44px -> radio de contacto de 22px -> un dedo centrado en un renglon de
18px llega 31px mas abajo -> 32 es el primer paso de la escala que lo supera. 24px propios (`pt-6`) + 8px del ritmo
de la tarjeta = 32. Va como padding y no como margen por el mismo motivo que en el control de cupo: el padding
suma al ritmo de forma determinista, un margen pelearia con el.

Paso 2 — targets de 44px en mobile. Hoy los tres botones estan por debajo del piso del proyecto: los de icono
declaran `h-8 w-8` (32px) y "Desactivar" usa `size="sm"`, que en este design system es `h-7` (28px). Se corrige
con el molde que YA existe en este mismo archivo:
  - los dos botones de icono (Editar y Eliminar): la porcion `h-8 w-8` de su className pasa a
    `h-11 w-11 sm:h-8 sm:w-8` — literalmente el mismo token que usan los botones del `CapacityStepper` (lineas
    359 y 397) para el mismo fin.
  - el boton Desactivar/Activar: agregarle `min-h-11 sm:min-h-0` a su className, que es el molde del boton
    "Guardar" del control de cupo. No cambiar su `size="sm"` ni su texto.

Paso 3 — reparto horizontal en mobile. En mobile el div de acciones es hijo de un flex-col y ocupa el ancho
entero, asi que sin nada quedaria todo apretado a la izquierda. Agregar `ml-auto sm:ml-0` al boton de **Editar**:
eso empuja el par Editar+Eliminar al borde derecho y deja Desactivar a la izquierda, que es el layout aprobado.
En desktop la columna 2 se dimensiona al contenido (`auto`), asi que no hay espacio libre y el `sm:ml-0` deja el
reparto exactamente como hoy. NO usar `justify-between` en el contenedor: separaria tambien Editar de Eliminar,
que son un par.

Paso 4 — nombre accesible del boton de estado. Editar y Eliminar ya llevan el nombre del servicio en su
`aria-label`. El boton Desactivar/Activar es el unico que no: hasta ahora se apoyaba en estar en el mismo renglon
que el titulo, y ese renglon deja de existir en mobile. Agregarle
`aria-label={`${s.active ? 'Desactivar' : 'Activar'} ${s.name}`}`. El nombre accesible sigue conteniendo el texto
visible, asi que cumple WCAG 2.5.3 (Label in Name); el texto visible del boton no cambia.

Paso 5 — orden de foco: **no compensar, documentar**. Con las acciones al final del DOM, el recorrido de Tab
dentro de la tarjeta pasa a ser contenido -> acciones en las dos vistas, no solo en mobile. En mobile eso alinea
foco y orden visual (mejora WCAG 2.4.3 / 1.3.2). En desktop queda un desfase entre posicion visual (arriba a la
derecha) y orden de tabulacion (ultimo), que es una secuencia significativa y habitual para una tarjeta —contenido
primero, acciones despues— y que ademas queda desambiguada por los tres `aria-label` con el nombre del servicio.
**Prohibido** compensar con `tabindex` positivo: es un antipatron y romperia el orden del resto de la pagina.
Dejar esta decision escrita en el comentario de la fila de acciones.

Sigue valiendo: cero logica, cero componentes nuevos, cero dependencias, y ningun hex ni px sueltos (todo sale de
la escala de Tailwind y de los tokens de `app/globals.css`).
  </action>
  <verify>
    <automated>cd "C:/Users/franc/Desktop/Forjo Studio/forjo-app" && F="app/(dashboard)/settings/settings-client.tsx" && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint "$F" 2>&1 | grep -q '11 problems (11 errors, 0 warnings)' && [ "$(grep -cF 'pt-6 sm:pt-0' "$F")" = "1" ] && [ "$(grep -cF 'h-11 w-11 sm:h-8 sm:w-8' "$F")" = "4" ] && [ "$(grep -cF 'ml-auto sm:ml-0' "$F")" = "1" ] && [ "$(grep -cF 'min-h-11 sm:min-h-0' "$F")" = "7" ] && [ "$(grep -c 'tabindex=\|tabIndex={[1-9]' "$F")" = "0" ] && echo GATE_OK</automated>
    <human-check>
Verificacion VISUAL en navegador, que es la unica que puede confirmar esto. `npm run dev` y entrar a `/servicios`.
Ojo: `auto_advance` esta en `true` en este proyecto, asi que esta lista NO se auto-aprueba sola — hay que abrirla.

MOBILE, DevTools a 375px de ancho:
  1. Un servicio con nombre largo (ej. "Mechas californianas con tono"): el nombre usa el ancho entero de la
     tarjeta y envuelve en 2 lineas. **Cero puntos suspensivos.**
  2. Las 3 acciones estan en su propia fila, al final de la tarjeta: "Desactivar" pegado a la izquierda, lapiz y
     tacho juntos contra el borde derecho.
  3. Hay aire visible entre el ultimo contenido y la fila de acciones (los 32px de la zona de exclusion).
  4. **Prueba de dedo (G-04):** tocar el texto "150min · $42.000", tocar "Se ofrece en:" y tocar "Lo hacen: ..."
     — ninguno de los tres puede disparar Desactivar, abrir el modal de edicion ni abrir el de borrado.
  5. Los tres botones se tocan comodo con el pulgar (44px). El tacho, que es el destructivo, sigue abriendo el
     aviso de borrado de la fase 19 sin cambios.
  6. Un servicio con nombre corto: la tarjeta no quedo desproporcionadamente alta ni rara.

MOBILE, caso `capMode != 'individual'` (crear/editar un servicio a "clase grupal" o "cupo compartido"):
  7. La fila del cupo (`Clase grupal · [-] 6 [+] lugares`) sigue con su separacion de siempre.
  8. **Tocar la duracion NO baja el cupo y tocar el rotulo del modo NO lo sube.** Es la regresion mas cara de
     este archivo: si vuelve, el cambio no va.
  9. El stepper sigue guardando: subir el numero muestra "Guardar", guardar limpia la fila.

MOBILE, estados condicionales (revisar que ninguno rompa el orden):
  10. Servicio SIN cobertura con >=2 profesionales activos: la pill "Sin cobertura" sigue **arriba, al lado del
      nombre** (no bajo a la linea de datos), y el aviso "Nadie lo ofrece — asignalo en Equipo" sigue encima de
      la fila de acciones.
  11. Negocio con sedes activas: los pills "Todos"/"Sede" siguen clickeables y no se solapan con las acciones.
  12. Tab con teclado: el foco recorre el contenido y termina en las 3 acciones; el anillo de foco se ve en las
      tres.

DESKTOP, >=640px:
  13. La tarjeta se ve **igual que antes del cambio**: acciones inline a la derecha del titulo, en la primera
      fila, verticalmente centradas con el.
  14. Un nombre largo vuelve a truncar con ellipsis (no envuelve).
  15. Los tres botones miden lo mismo que antes (no se agrandaron a 44px).
  16. Las mismas combinaciones del punto 10-11 (con/sin pill, con/sin sedes, con/sin cobertura) se ven como hoy.

Ideal: comparar 13-16 contra una captura previa o `git stash` para confirmar que el desktop no se movio ni un pixel.
    </human-check>
  </verify>
  <done>
`tsc --noEmit` sale 0, eslint sigue en 11/0 (cero hallazgos nuevos), no se introdujo ningun `tabIndex` positivo, y
los cuatro tokens responsive estan presentes con el conteo esperado (2 preexistentes del `CapacityStepper` + 2
nuevos para los botones de icono; 6 preexistentes de `min-h-11` + 1 nuevo para Desactivar). La verificacion visual
de arriba paso en mobile 375px y en desktop, incluido el caso `capMode != 'individual'`.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| ninguna nueva | El cambio es 100% presentacional dentro de un componente cliente ya existente. No se agregan rutas, queries, handlers, props de datos ni superficie de red. El aislamiento por `business_id` de esta pantalla no se toca. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-lpg-01 | Tampering | Tarjeta de servicio en mobile — correccion del punto de toque del navegador | mitigate | La fila de acciones se lleva 32px de zona de exclusion (`pt-6` + `gap-2`), replicando la invariante de G-04. Sin esto, tocar texto inerte puede disparar "Desactivar" o abrir el borrado — una mutacion de estado no intencionada del negocio. Verificado en el punto 4 del human-check. |
| T-lpg-02 | Tampering | `CapacityInlineControl` (cupo) | mitigate | Su `py-6` y los 8px del ritmo quedan intactos: el ritmo migra de `space-y-2` a `gap-2`, que es el mismo valor. Gate automatizado cuenta el `py-6` del control; punto 8 del human-check reproduce el defecto original. |
| T-lpg-03 | Elevation of Privilege | Borrado de servicio (aviso D-07, fase 19) | accept | El boton de borrado solo cambia de posicion y de tamano; su handler (`openDeleteService`), su pre-check de turnos/abonos/franjas y su dialogo de confirmacion no se tocan. El rango ~1207-1270 queda fuera del alcance por constraint explicito. |
| T-lpg-04 | Denial of Service | — | accept | Cambio solo de CSS/JSX: sin loops, sin fetch, sin estado nuevo. No hay superficie de agotamiento. |
| T-lpg-05 | Information Disclosure | — | accept | No se renderiza ningun dato que la tarjeta no muestre ya. El nombre del servicio que entra al `aria-label` de Desactivar ya esta visible en la misma tarjeta. |

Sin instalaciones de paquetes en este plan (npm/pip/cargo): no aplica el gate de legitimidad ni el checkpoint bloqueante.
</threat_model>

<verification>
1. `./node_modules/.bin/tsc --noEmit` sale 0. **Usar el binario local**: `npx tsc` es falso verde en este repo.
2. eslint acotado al archivo tocado sigue en `11 problems (11 errors, 0 warnings)`. El gate es **cero hallazgos
   nuevos**, no cero hallazgos: los 11 son `react-hooks/purity` preexistentes en las lineas 1115 y 1594, fuera del
   rango a tocar. No correr `npm run lint` completo: no puede dar exit 0 y se corta por timeout a los 2 minutos.
3. `git diff --stat` toca **un solo archivo**: `app/(dashboard)/settings/settings-client.tsx`.
4. `git diff` no muestra ningun cambio en el rango ~1207-1270 (aviso de borrado, fase 19 con UAT abierta) ni en
   las tarjetas de profesionales (~2835) ni de consultorios (~3002).
5. `git diff` no agrega ni quita ninguna llamada a `toggleService`, `openEditService`, `openDeleteService`,
   `setServiceLocations`, `toggleServiceLocation` ni `saveCapacityInline`.
6. La verificacion visual del `<human-check>` de la Task 2 paso en mobile 375px y en desktop, incluyendo el caso
   `capMode != 'individual'`.
</verification>

<success_criteria>
- A 375px, un servicio con nombre largo muestra el nombre completo en varias lineas, sin ellipsis, y las 3
  acciones estan al final de la tarjeta en su propia fila.
- A >=640px la tarjeta es indistinguible de como se veia antes del cambio.
- El markup de las acciones aparece **una sola vez** en el archivo (sin duplicado `hidden`/`sm:hidden`).
- Tocar texto inerte de la tarjeta en mobile no dispara ninguna accion, ni las nuevas ni el stepper de cupo.
- La pill "Sin cobertura" sigue arriba, junto al nombre.
- Los 3 botones tienen >=44px de area tactil en mobile y el mismo tamano de hoy en desktop.
- tsc limpio y cero hallazgos nuevos de eslint.
- Un solo archivo modificado, cero logica nueva, cero dependencias.
</success_criteria>

<output>
Create `.planning/quick/260828-lpg-tarjeta-de-servicios-acciones-al-final-e/260828-lpg-SUMMARY.md` when done.

En el SUMMARY dejar registrado, para el proximo que lea esta tarjeta:
- que la invariante de 32px de G-04 ahora aplica a DOS filas (el control de cupo y la fila de acciones), y por que;
- que los cinco `sm:col-start-1` son correctitud del auto-placement y no decoracion: un hijo de contenido nuevo
  sin esa clase se va a la columna 2 en desktop;
- que el desfase entre posicion visual y orden de tabulacion en desktop es una decision escrita, no un olvido.
</output>
