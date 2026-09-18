---
phase: 23-el-panel-que-organiza-el-cat-logo
reviewed: 2026-09-17T00:00:00Z
updated: 2026-09-18T00:00:00Z
depth: standard
passes:
  - id: 1
    date: 2026-09-17
    scope: "planes 23-01..23-07 (diff 41a69ba..5063038)"
    files: 9
    findings: { critical: 0, warning: 2, info: 4 }
  - id: 2
    date: 2026-09-18
    scope: "plan 23-08 / G-23-20 (diff 5063038..HEAD, sólo app/(dashboard)/settings/settings-client.tsx)"
    files: 1
    findings: { critical: 0, warning: 2, info: 4 }
files_reviewed: 9
files_reviewed_list:
  - app/(dashboard)/settings/settings-client.tsx
  - app/[slug]/booking-client.tsx
  - components/booking/service-description.test.tsx
  - components/booking/service-description.tsx
  - components/dashboard/categorias-manager.test.tsx
  - components/dashboard/categorias-manager.tsx
  - components/landing/services.tsx
  - lib/catalog-panel.ts
  - test/catalog-panel.test.ts
findings:
  critical: 0
  warning: 4
  info: 8
  total: 12
status: issues_found
---

# Phase 23: Code Review Report

**Reviewed:** 2026-09-17 (pasada 1) · **Actualizado:** 2026-09-18 (pasada 2, incremental)
**Depth:** standard
**Files Reviewed:** 9 (pasada 1) + 1 re-revisado en el delta de 23-08
**Status:** issues_found

## Summary

Se revisó el diff `41a69ba..HEAD` de los 9 archivos: los fixes del review anterior (CR-01, WR-01..WR-05) y los planes de cierre de gaps 23-05 (`ServiceDescription` + tarjeta del booking como contenedor con botón estirado + web de marca), 23-06 (`chipDragGates`/`chipDropIntent`, soltar en el propio grupo no hace nada) y 23-07 (renglón de descripción + link en la tarjeta de `/servicios`, copy de ayuda).

Verificación: `./node_modules/.bin/tsc --noEmit` sale con 0 y los 3 archivos de test de la fase pasan (86/86).

Los fixes del review anterior están bien. `liveCategoryValue` sanea el alta y la edición, `nextSortOrder` + `categorySiblings` reemplazan bien a `length`, la reversión del reorden mergea por id y el listado respeta `groupCatalog`. Todas las escrituras siguen acotadas por `.eq('business_id', business.id)` y la FK compuesta sigue siendo la barrera del tenant. La descripción se pinta como texto (React la escapa, cubierto por test). No encontré regresiones de aislamiento multi-tenant ni de seguridad.

Quedan dos defectos de lógica en el organizador:
1. El drop "place" (chip sobre chip) no recibió el arreglo de categoría colgada que sí recibió la rama "assign".
2. La guarda `savingServiceOrder` es chequear-y-después-usar: un orden elegido por el dueño se puede descartar en silencio.

## Warnings

### WR-01: Soltar un chip sobre otro con posición disponible sigue usando el `category_id` del destino, no su grupo visible

**File:** `components/dashboard/categorias-manager.tsx:545-556`
**Issue:** En G-23-10a la rama `'assign'` pasó a usar `grupoDestino = grupoVisibleDe(target.id)`. Así, un destino con una categoría colgada (pintado entre los sueltos) asigna "Sin categoría" en vez de rebotar con 23503. El comentario de la línea 539-540 lo dice explícitamente. La rama `'place'` (modo personalizado con agrupación) hace otra cosa: calcula `const destino = fromCategoryId(target.category_id)`.

Pasa esto cuando el destino es un suelto con categoría colgada y el servicio arrastrado viene de otra categoría:
- `mismoGrupo` es `false` y `cambiaCategoria` es `true`.
- `idsDelGrupoDestino(destino, service)` devuelve `[]` (el uuid colgado no está en `serviciosPorCategoria`).
- `assignServiceCategory(service, <uuid colgado>)` escribe un uuid inexistente, la base lo rechaza con 23503 y el dueño ve "Esa categoría ya no existe. Recargá la página…".

El dueño soltó el chip sobre un servicio que en pantalla está en "Sin categoría". Si la base lo aceptara, la lista a renumerar (`[service]`) tampoco sería la del grupo donde lo soltó. Es exactamente la clase de bug que 23-06 decía cerrar, pero cerrada sólo en una de las dos ramas.
**Fix:** Usar el grupo visible ya calculado como destino en las dos ramas:
```tsx
resetDrag()
const service = services.find(s => s.id === serviceId)
if (!service || service.id === target.id || assigning || savingServiceOrder) return true
const destino = grupoDestino // no fromCategoryId(target.category_id)
```
`idsDelGrupoDestino(SIN_CATEGORIA, service)` devuelve `sueltos`, así que el orden también sale del grupo correcto. Conviene sumar un test del intent/destino con un servicio con categoría colgada.

### WR-02: `persistServiceOrder` puede descartar en silencio el orden de "Mover …" o de un drop con posición

**File:** `components/dashboard/categorias-manager.tsx:453-454, 559-564, 669-687`
**Issue:** `persistServiceOrder` arranca con `if (savingServiceOrder) return`: sale sin toast y sin valor de retorno. Los dos callers compuestos (`confirmMove` y la rama `'place'` de `dropServiceOnChip`) chequean `savingServiceOrder` ANTES de `await assignServiceCategory(...)` y llaman a `persistServiceOrder` DESPUÉS de ese await.

`confirmMove` no mira `assigning`, y el chip sigue clickeable mientras un drop está en vuelo, así que se puede dar esta secuencia:
1. Un drop "place" de X está en la fase de asignar (`assigning=true`, `savingServiceOrder=false`).
2. El dueño abre "Mover" sobre Y y confirma una categoría + posición.
3. Las dos cadenas llegan a `persistServiceOrder`. La segunda encuentra `savingServiceOrder=true` y retorna.

`confirmMove` cierra el diálogo como si hubiera guardado, pero la posición elegida nunca se escribió. Y ya se escribió la llegada al final (`assignServiceCategory`), así que el servicio queda en un lugar distinto al que el dueño eligió y sin ningún aviso. Además, cada cadena calculó su lista sobre el `groups` anterior a la otra, así que la que sí escribe puede renumerar un grupo al que le falta el servicio de la otra y dejar empates de `sort_order`.
**Fix:** Que un orden no guardado nunca pase por éxito, y serializar los tres caminos de escritura de servicios con una sola bandera:
```tsx
async function persistServiceOrder(idsEnOrden: string[]): Promise<boolean> {
  if (savingServiceOrder) { toast.error(ORDER_REJECT_COPY); return false }
  // ...
}
// y en confirmMove / openMove:
if (!moving || savingMove || savingServiceOrder || assigning) return
```
Otra opción: un único `busyRef` (ref, no estado, para que la guarda no lea un closure viejo) que tomen `dropServiceOn`, `dropServiceOnChip` y `confirmMove` antes del primer await y liberen en `finally`.

## Info

### IN-01: Soltar en el propio grupo sin modo personalizado sigue anunciando un drop válido

**File:** `components/dashboard/categorias-manager.tsx:131-135, 773-786, 920-928`
**Issue:** 23-06 quitó el resaltado de la fila propia cuando `chipDropIntent` da `'none'`. Pero tanto el `onDragOver` del chip como el de la fila/sueltos siguen llamando `e.preventDefault()` sin condición. El navegador muestra el cursor de "mover" (drop aceptado) justo donde el drop no hace nada, que es la sensación de "roto" que D-12 aplicado al destino quería evitar.
**Fix:** Cuando el intent es `'none'`, poner `e.dataTransfer.dropEffect = 'none'`. Para el chip, pasarle el intent o un `canDropHere` por prop.

### IN-02: Si la asignación se guardó pero el reorden falla y tampoco se puede releer, el estado local queda distinto de la base

**File:** `components/dashboard/categorias-manager.tsx:458, 472-476`
**Issue:** En `confirmMove`/drop "place", `assignServiceCategory` ya escribió `category_id` + `sort_order` de llegada y lo espejó en memoria. Después, `persistServiceOrder` toma `antes` del closure de `services`, que es anterior a la asignación. Si el update falla Y la relectura falla, la reversión le vuelve a poner al servicio movido su `sort_order` del grupo VIEJO pero conserva la categoría nueva. Ese par no existe en la base (que tiene la posición de llegada). Es un doble fallo y la próxima carga lo corrige, pero la promesa de "se pinta lo que está guardado" no se cumple.
**Fix:** Para el servicio recién asignado, revertir a la posición de llegada, o forzar `router.refresh()` en esa rama.

### IN-03: El link "Editar descripción" abre el diálogo completo sin llevar al campo

**File:** `app/(dashboard)/settings/settings-client.tsx:2762-2769`
**Issue:** El nombre accesible es "Editar descripción de X" / "Agregar descripción a X", pero el botón llama a `openEditService(s)`, igual que el lápiz. El foco queda al principio del diálogo, y en mobile el textarea de la descripción queda más abajo, dentro de un cuerpo con scroll. Un lector de pantalla anuncia una acción más específica que la que ocurre, y el dueño tiene que buscar el campo.
**Fix:** Pasar una opción (`openEditService(s, { focus: 'description' })`) y enfocar/scrollear el `Textarea` de `editSvcDescId` al abrir. Si no, alinear la etiqueta con lo que hace ("Editar X").

### IN-04: En la tarjeta del booking, pasar el mouse por "Ver más" pinta el hover de selección

**File:** `app/[slug]/booking-client.tsx:590-599, 640-646`
**Issue:** `hover:border-primary` vive en el contenedor, así que pasar el puntero por el toggle "Ver más" (que NO selecciona) tiñe el borde igual que al apuntar la zona de selección. Además, el pseudo-elemento `after:absolute` del botón cubre el párrafo de la descripción, así que ese texto no se puede seleccionar ni copiar (cualquier arrastre del mouse arranca una selección de servicio). Ninguna de las dos cosas rompe el flujo, pero la señal visual dice "esto elige el servicio" donde no lo hace.
**Fix:** Mover el hover al botón: `has-[button:not([data-toggle]):hover]:border-primary` en el contenedor, o `group` + `group-hover` sobre el botón de selección. Opcional: `select-text` + `relative z-10` en el párrafo si se quiere que la descripción sea copiable (a costa de que tocar el texto ya no seleccione).

---
---

## Pasada incremental — 23-08 (G-23-20)

**Reviewed:** 2026-09-18
**Depth:** standard
**Alcance:** `git diff 5063038..HEAD -- "app/(dashboard)/settings/settings-client.tsx"` — un solo archivo fuente. Los hallazgos de la pasada 1 (WR-01, WR-02, IN-01..IN-04) **siguen abiertos**: no hubo commits de fix entre `5063038` y `HEAD`, los tres commits del rango son el plan 23-08 y sus docs.
**Status de esta pasada:** issues_found (0 críticos · 2 warnings · 4 info)

### Resumen de la pasada

Cambio puro de layout: dos `<p>` nuevos en la columna derecha de la grilla (precio en `sm:row-start-1`, duración en `sm:row-start-2`), la línea de datos convertida en renglón de mobile con `sm:hidden`, y el bloque de acciones movido de `sm:row-start-1` a `sm:row-start-3 sm:self-start`. Más dos constantes derivadas (`durationLabel`, `priceLabel`) y reescritura de tres comentarios.

Lo que verifiqué y **está bien**:

- **Sin duplicación visible ni en el árbol de accesibilidad.** El par es excluyente: `hidden … sm:block` en los dos bloques nuevos y `sm:hidden` en el renglón de mobile y en su separador. Los dos usan `display:none`, no `visibility`/`sr-only`/`opacity`, así que el nodo oculto sale del árbol de accesibilidad y ningún lector repite el precio. En el breakpoint exacto (640px) `sm:` ya aplica, así que no hay ancho donde se solapen. Confirmado por conteo sobre la región: `hidden … sm:block`=2, `sm:hidden`=3.
- **Una sola derivación.** `toLocaleString` aparece **1 vez** en la región; `durationLabel` y `priceLabel` se usan 3 veces cada una (derivación + renglón de mobile + celda de desktop). El texto de mobile queda idéntico al anterior (`60min · $5.000`).
- **Sin colisión de auto-placement.** Derivé la colocación con el algoritmo de §8.5 de CSS Grid: los tres items con fila y columna definidas (precio r1, duración r2, acciones r3, todos en col 2) se colocan primero; los hijos de contenido, todos con columna definida y fila automática, se reparten las filas 1,2,3,… de la columna 1 en orden de DOM con cursor disperso. Ninguno cae en la columna derecha y ninguno pisa otro.
- **Sin fila vacía para el servicio individual.** El contenedor de la línea de datos lleva `sm:hidden` condicional, y `display:none` lo saca de la grilla, no deja celda. Y `capacityModeLabel` nunca puede quedar vacío: `CAPACITY_MODE_HELP` cubre las **tres** claves de `Service['capacity_mode']`, así que no existe el caso "contenedor visible en desktop sin contenido".
- **Invariantes preservadas.** Rótulo del modo y `CapacityInlineControl` siguen en `sm:col-start-1` con el envoltorio sin padding (invariante de 32px de G-04 intacta); `pt-4 border-t border-border/60 sm:pt-0 sm:border-t-0` del bloque de acciones sin tocar (zona de exclusión y divisoria de mobile); el bloque de acciones sigue siendo el **último** hijo del DOM (no hay reordenamiento de DOM que ponga acciones antes del contenido); 2 aperturas de `openEditService`, 1 `line-clamp-1`, 1 `CapacityInlineControl`.
- **Mobile sin cambios efectivos.** Las clases base (sin prefijo) de los hijos existentes son las mismas; lo único que se agregó por debajo de 640px es `hidden` en dos nodos nuevos, que no participan del `flex flex-col gap-2`.
- **Truncado del nombre.** La columna 1 sigue siendo `minmax(0,1fr)` y el nombre `min-w-0` + `sm:truncate`. La columna 2 es `auto`, dimensionada por el max-content más ancho: el grupo de acciones (~160px) contra el precio (~70px para 7 dígitos), así que el nombre no pierde ancho con precios reales (ver IN-07 para el borde).
- **Cero superficie de seguridad.** El diff no toca ninguna lectura ni escritura: `from('services')` sigue en 6 líneas, no hay `dangerouslySetInnerHTML`, no hay interpolación en HTML (React escapa `s.name`/`s.description`), no se tocó el diálogo de edición ni el alta, y no hay nada relacionado con `business_id` en el delta. Sin paquetes ni migraciones nuevas.
- **Gates duros:** `tsc --noEmit` sale limpio (0 líneas `error TS` fuera de `.next/`) y `eslint` sobre el archivo reporta **11 errores**, exactamente el piso preexistente.

Lo que **no** está bien está abajo.

## Warnings (pasada 2)

### WR-03: En desktop las acciones quedan ancladas a la fila 3, así que hay contenido de la tarjeta **debajo** de los botones (y el foco salta hacia atrás)

**File:** `app/(dashboard)/settings/settings-client.tsx:2933` (con `2854-2865`, `2866-2874`, `2878-2891`)
**Issue:** `sm:row-start-3` es un número fijo, pero la cantidad de filas de la columna izquierda es **variable**: depende de `capMode`, de `activeLocations.length` y de `showCoverage`. Cuando la izquierda pasa de tres filas, las acciones dejan de cerrar la tarjeta y quedan en el medio, con contenido por debajo.

Derivación del auto-placement (columna 1, fila automática, en orden de DOM):

| Caso | Filas de la columna izquierda | Fila de las acciones | Qué queda **debajo** de los botones |
|---|---|---|---|
| Individual, sin sedes, <2 pros | nombre(1), descripción(2) | 3 | nada ✅ |
| **Individual, con sedes, ≥2 pros** | nombre(1), descripción(2), sedes(3), **cobertura(4)** | 3 | la línea de cobertura |
| **Cupo compartido, con sedes, ≥2 pros** | nombre(1), descripción(2), línea de datos(3), **cupo(4), sedes(5), cobertura(6)** | 3 | el stepper de cupo, las píldoras de sedes y la cobertura |

Los dos últimos son configuraciones normales de producción (multi-staff con sedes). Dos consecuencias:

1. **Visual:** el bloque de acciones flota a media tarjeta y la mitad inferior derecha queda vacía — que es literalmente el síntoma que G-23-20 venía a corregir, sólo que corrido hacia abajo. El `human-check` 2 del plan ("debajo de las dos, las tres acciones") pasa igual, porque ninguno de los cinco checks usa una tarjeta con cobertura o con cupo compartido **y** sedes al mismo tiempo. El check 3 sí menciona cupo compartido pero sólo mira el rótulo y el hueco, no dónde terminan los botones.
2. **Foco (WCAG 2.4.3 / 1.3.2):** el recorrido con Tab en desktop pasa por el link "Editar" (fila 2), después por los botones del stepper de cupo (fila 4), las píldoras de sedes (fila 5) y el `Link href="/equipo"` de la rama sin cobertura (fila 6) — todos **visualmente por debajo** — y recién ahí sube a Desactivar/lápiz/tacho (fila 3). Es un salto hacia atrás. El párrafo "ORDEN DE FOCO" del propio archivo (líneas 2921-2932) sigue justificando el desfase con "es una secuencia significativa y habitual para una tarjeta —contenido primero, acciones después—", y en desktop eso ya **no** describe lo que se ve: hay contenido después de las acciones. La decisión escrita cubría el layout viejo (acciones arriba a la derecha), no éste.

No pude renderizarlo (la UAT visual del plan quedó pendiente), pero la colocación es determinista y se deriva del algoritmo de grilla, no de una impresión.

**Fix:** que la fila de las acciones sea la **última**, no la 3 fija. La cuenta ya existe en el cuerpo del `map`, así que sale sin envolver ningún hijo (la prohibición del plan se respeta):

```tsx
// Filas de la columna izquierda en desktop: nombre + descripción + [línea de datos] + [cupo]
// + [sedes] + [cobertura]. Las acciones cierran la tarjeta: van a la ÚLTIMA, nunca antes de la 3
// (abajo del precio y de la duración, que ocupan las filas 1 y 2).
const leftRows = 2
  + (capMode !== 'individual' ? 2 : 0)
  + (activeLocations.length > 0 ? 1 : 0)
  + (showCoverage ? 1 : 0)
const actionsRow = Math.max(3, leftRows)
```

```tsx
<div
  style={{ '--actions-row': actionsRow } as React.CSSProperties}
  className="flex shrink-0 items-center gap-1 pt-4 border-t border-border/60 sm:pt-0 sm:border-t-0 sm:col-start-2 sm:[grid-row-start:var(--actions-row)] sm:self-start"
>
```

(La variable CSS es necesaria porque `sm:row-start-${n}` con valor dinámico no lo genera el JIT de Tailwind; el `style` inline no puede gatearse por viewport, pero la clase que lo consume sí, así que en mobile la variable se ignora y el bloque sigue siendo el último hijo del flex.)

Si en cambio se decide **aceptar** el layout tal como está, entonces hay que hacer dos cosas antes de cerrar el gap: (a) agregar a la UAT un check explícito sobre una tarjeta con cupo compartido + sedes + cobertura, y (b) corregir el párrafo ORDEN DE FOCO y la entrada G-23-20 del `23-UI-SPEC`, que hoy afirman lo contrario. Lo que no puede quedar es el layout así **y** la justificación escrita diciendo que las acciones van después del contenido.

### WR-04: Quedaron comentarios que describen el layout viejo, en un archivo donde el comentario es el contrato de la región

**File:** `app/(dashboard)/settings/settings-client.tsx:2919`, `2809-2811`, `2945-2946`
**Issue:** La acción (e) del 23-08-PLAN hacía de los comentarios parte del entregable ("Los comentarios que dejaron de ser ciertos… son parte del entregable, no un extra") y el `must_have` correspondiente pide que los comentarios del layout viejo describan el nuevo. Tres frases sobrevivieron sin actualizar y ahora afirman cosas falsas:

1. **Línea 2919** — "En desktop se resetean a cero tanto el padding como el borde, **y la primera fila queda idéntica a como estaba**." Falso: la primera fila ya no es *nombre + acciones*, ahora es *nombre + precio*, y este bloque no está en la primera fila. Es la frase que más puede desorientar, porque está en el comentario de G-04 que el próximo lector va a tomar como invariante.
2. **Líneas 2809-2811** — "El modo de cupo entra acá como **TERCER dato** —mismo registro que duración y precio—". En desktop la duración y el precio ya no están en esa línea, así que el rótulo es el **único** dato y no comparte registro con nada. El párrafo nuevo de abajo lo aclara, pero la frase de apertura contradice al resto del bloque.
3. **Líneas 2945-2946** — "En desktop la columna se dimensiona al contenido… y **esta fila se ve igual que siempre**." La fila cambió de la 1 a la 3 y ahora comparte banda con las píldoras de sedes (ver WR-03).

**Fix:** tres ediciones de una línea cada una:
- 2919 → "En desktop el padding y el borde se resetean a cero: la separación la da el ritmo de la grilla, y este bloque queda en la tercera fila de la columna derecha (G-23-20)."
- 2809-2811 → "El modo de cupo entra acá como tercer dato de la línea de mobile —mismo registro que la duración y el precio, que en ese viewport siguen acá—; en desktop es el único que queda."
- 2945-2946 → "…así que nunca hubo espacio libre que repartir y el grupo se ve igual que siempre, ahora en la tercera fila."

## Info (pasada 2)

### IN-05: El gate estructural de la región quedó midiendo otra cosa y va a fallar en falso en la re-verificación

**File:** `app/(dashboard)/settings/settings-client.tsx:2836` (instrumento en `23-08-PLAN.md`, verify del Task 1)
**Issue:** Al envolver el `className` de la línea de datos en `cn()`, el gate `grep -cE 'className="[^"]*sm:col-start-1'` pasó a devolver **5** contra el **6** que exige. Lo confirmé: `className="…"` literal = 5, `sm:col-start-1` = 6. El desvío está documentado en el `23-08-SUMMARY` y el código es correcto, pero el instrumento quedó roto para todo el que lo vuelva a correr (empezando por `/gsd-verify-work`), y un gate que falla en falso se termina ignorando — que es justo lo que este gate existe para evitar.
**Fix:** corregir la regex del gate a `grep -cE 'sm:col-start-1'` en el plan y en el `23-VERIFICATION`, o mejor, contar sobre el atributo ya normalizado (`grep -oE "(className=\"|cn\(')[^\"']*sm:col-start-1"`). Vale para las otras anclas también: en cuanto otro hijo necesite una clase condicional, el mismo gate se rompe igual.

### IN-06: La exclusión mutua de viewports se sostiene con el breakpoint repetido en cinco lugares y ningún gate la verifica

**File:** `app/(dashboard)/settings/settings-client.tsx:2769-2770, 2836-2837, 2846`
**Issue:** Que el precio no se vea dos veces depende de que los cinco gates usen el mismo breakpoint: `hidden … sm:block` en dos nodos y `sm:hidden` en tres. Los gates del plan cuentan ocurrencias (`hidden … sm:block` = 2, `sm:hidden` ≥ 3) pero no verifican que sean el **mismo** breakpoint ni que se muevan juntos: cambiar uno solo a `md:` deja el precio duplicado entre 640 y 768px, y los conteos siguen dando lo mismo. El comentario lo advierte en prosa; nada lo hace cumplir.
**Fix:** si esta región vuelve a tocarse, derivar los dos pares de una constante local de clases (p. ej. `const ONLY_DESKTOP = 'hidden sm:block'` / `const ONLY_MOBILE = 'sm:hidden'`) y usarla en los cinco lugares. Con eso el gate pasa a ser "la constante se usa N veces", que sí falla cuando alguien desalinea un breakpoint.

### IN-07: La afirmación "el nombre no pierde ni un píxel de ancho" es una suposición, no una restricción

**File:** `app/(dashboard)/settings/settings-client.tsx:2755-2758, 2769`
**Issue:** La columna derecha es `auto`, o sea se dimensiona al max-content del item más ancho. Hoy ése es el grupo de acciones (~160px con "Desactivar", ~140px con "Activar" en la pestaña Desactivados) contra ~70px del precio de 7 dígitos, así que la afirmación se cumple. Pero nada la enforcea: el precio no tiene `max-w` ni `truncate`, y `normalizeServicePrice` no tiene tope superior (sólo rechaza negativos, y ni siquiera los bloquea: conserva lo tipeado). Un precio absurdo tipeado a mano ensancha la columna derecha y le roba ancho al nombre, que es exactamente el defecto que G-02 costó dos gaps cerrar.
**Fix:** `sm:max-w-[10ch] sm:truncate` en el `<p>` del precio, o dejar escrito el umbral en el comentario ("mientras el precio sea más angosto que el grupo de acciones") para que el próximo sepa qué está asumiendo.

### IN-08: En desktop el precio y la duración se anuncian sueltos entre el nombre y la descripción

**File:** `app/(dashboard)/settings/settings-client.tsx:2769-2770`
**Issue:** El orden de lectura en desktop pasa a ser *nombre → "$5.000" → "60min" → descripción → "Editar"*. Antes los dos datos viajaban juntos en un renglón después de la descripción. No es una regresión fuerte (el signo de peso y el sufijo "min" son autodescriptivos) y no hay duplicación, pero son dos nodos de texto sin relación explícita con el servicio, intercalados antes de su descripción.
**Fix:** si se quiere cerrar del todo, `<span className="sr-only">Precio: </span>` / `"Duración: "` dentro de cada `<p>` — quedan dentro del nodo gateado, así que no se anuncian en mobile y la exclusión mutua se conserva. Alternativa sin markup: `aria-label` en los dos `<p>`.

---

_Reviewed: 2026-09-17 (pasada 1) · 2026-09-18 (pasada 2, incremental sobre 23-08)_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
