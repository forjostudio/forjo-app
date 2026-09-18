---
phase: 23-el-panel-que-organiza-el-cat-logo
reviewed: 2026-09-17T00:00:00Z
updated: 2026-09-18T23:00:00Z
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
    fixed: "WR-03 (13629dd), WR-04 (cdf0c79) — 2026-09-18, ver 23-REVIEW-FIX.md pasada 2"
    open: "IN-05, IN-06, IN-07, IN-08"
  - id: 3
    date: 2026-09-18
    scope: "planes 23-09 y 23-10 / G-23-21, G-23-23, G-23-22, G-23-25 (diff 9bbe98b..HEAD, sólo app/(dashboard)/settings/settings-client.tsx). 23-11 no tocó código fuente."
    files: 1
    findings: { critical: 0, warning: 6, info: 6 }
    open: "WR-05..WR-10, IN-09..IN-14"
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
  warning: 10
  info: 14
  total: 24
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
**Corrección aplicada (2026-09-18):** los **2 warnings de esta pasada están RESUELTOS** — WR-03
(`13629dd`) y WR-04 (`cdf0c79`). Los 4 Info de esta pasada (IN-05..IN-08) y todos los hallazgos de la
pasada 1 (WR-01, WR-02, IN-01..IN-04) **siguen abiertos**. Detalle y evidencia en `23-REVIEW-FIX.md`.

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

**Status: RESUELTO** (2026-09-18, commit `13629dd` — ver `23-REVIEW-FIX.md`, pasada 2). Se aplicó la
opción de la fila dinámica. Al medirlo en Chrome headless resultó **peor de lo descrito acá**: no
hace falta multi-staff con sedes, con **cupo compartido solo** (4 filas) el stepper de cupo ya
quedaba debajo de los botones. Las cinco configuraciones medidas dan ahora las acciones en la última
fila, sin contenido por debajo.

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

**Status: RESUELTO** (2026-09-18, commit `cdf0c79` — ver `23-REVIEW-FIX.md`, pasada 2). Las tres
frases actualizadas + el párrafo ORDEN DE FOCO, que con WR-03 resuelto ya no tiene desfase que
justificar en desktop. Diff de comentarios puro, 0 líneas de código.

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
---

## Pasada incremental — 23-09 + 23-10 (G-23-21, G-23-23, G-23-22, G-23-25)

**Reviewed:** 2026-09-18
**Depth:** standard
**Alcance:** `git diff 9bbe98b..HEAD -- "app/(dashboard)/settings/settings-client.tsx"` — **un solo archivo fuente** (298 inserciones / 78 borrados; commits `24087b7`, `3259e60`, `bba8f94`, `25655ec`, `f11307c`). El plan 23-11 sólo tocó documentos de planificación: fuera del review de código.
**Status de esta pasada:** issues_found (**0 críticos · 6 warnings · 6 info**)
**Arrastre:** siguen abiertos WR-01, WR-02, IN-01..IN-04 (pasada 1) e IN-05..IN-08 (pasada 2). No hubo commits de fix sobre ellos en este rango.

### Resumen de la pasada

Cuatro cambios en la pantalla de servicios: `min-w-0` en el `<p>` del nombre (G-23-21); la fusión de la línea de datos y el control de cupo en un único hijo de grilla, con el gate de viewport mudado al envoltorio y `py-6 sm:py-0` en el control (G-23-23); la reserva del hueco del scrollbar en el cuerpo del diálogo más el toggle de cupo apilado también en desktop (G-23-22); y la guarda compartida contra el descarte accidental del borrador en los tres diálogos de edición (G-23-25).

**Gates duros re-corridos por mí, no tomados del SUMMARY:**

- `npx tsc --noEmit` → **0 líneas `error TS`** fuera de `.next/`.
- `npx eslint` sobre el archivo → **11 errores**, los mismos 11 preexistentes (859, 1098, 1112, 1120×2, 1121×2, 1133, 1142, 1266, 1868 — todos `react-hooks/purity|immutability`). **Ninguno cae en código nuevo.**
- `git diff --check` → 3 líneas con espacios finales (ver IN-13).

Lo que verifiqué a mano y **está bien**:

- **La huella NO es un falso positivo en el caso general, y lo comprobé campo por campo.** `serviceFormFingerprint` (`:203-212`) corre exactamente los mismos normalizadores que `saveEditService` (`:1674-1696`): `normalizeServiceDuration`, `normalizeServicePrice`, el clamp del cupo contra el piso del modo, `liveCategoryValue` y los `trim()`. El punto de partida sale del **mismo objeto** que inicializa el borrador (`:1643-1658`), así que los dos lados no se pueden desincronizar por un segundo mapeo. Tres de los cuatro falsos positivos que el plan declara cubiertos lo están de verdad: **normalizar al salir de un campo** no ensucia (los dos lados normalizan y el `onBlur` reescribe el texto al mismo valor); **prender y apagar una sede** no ensucia (`[...f.location_ids].sort()`); y un **servicio con la categoría borrada** tampoco (`liveCategoryValue` colapsa el uuid muerto al centinela en los dos lados). El cuarto **no** está cubierto: ver WR-05.
- **La guarda deja siempre una salida.** Los tres `DialogContent` usan el `showCloseButton` por defecto (`components/ui/dialog.tsx:75-90`) y la ✕ emite `close-press`, motivo que la guarda no mira. El caso “nombre vacío + Guardar deshabilitado” del diálogo de servicio tiene salida por la ✕, tal como está documentado.
- **Los motivos se tipan contra la unión real del paquete.** `DialogRootChangeEventReason` (`node_modules/@base-ui/react/dialog/root/DialogRoot.d.ts:85`) incluye `outside-press`, `escape-key`, `close-press`, `trigger-press`, `focus-out`, `imperative-action` y `none`: un motivo mal escrito no compila. El descarte de `disablePointerDismissal` está bien fundado (la prop existe en `DialogRootProps:47` y corta antes del handler).
- **Todas las aperturas pasan por el `openEdit*` que setea la huella.** `setEditSvc(` fuera de `openEditService` aparece 1 sola vez y es el cierre del guardado (`:1719`); ídem sede y profesional. No hay camino que abra un diálogo con la huella de partida en `''`, que dejaría el borrador sucio desde el primer render.
- **Aritmética de la grilla correcta.** Con el envoltorio único la columna izquierda rinde 5 hijos y `leftRows = 2 + (compartido?1:0) + sedes + cobertura` los cuenta bien: el envoltorio con `sm:hidden` es `display:none` y no reclama fila, y el renglón de la descripción (`:3003`) se renderiza **siempre**, así que el sumando base de 2 es correcto. Las acciones caen en las filas 3/3/4/4/5 en las cinco configuraciones: WR-03 **no** se reabre.
- **`min-w-0 break-words sm:truncate` no tiene conflicto de utilidades.** `truncate` y `break-words` caen en grupos distintos de tailwind-merge y además viajan con prefijos distintos; `flex flex-col` y `sm:hidden` tampoco colisionan dentro de `cn()`.
- **Cero superficie de seguridad nueva.** El diff no agrega ninguna lectura ni escritura a Supabase: `from('services')` sigue en 6 líneas, `saveEditService` conserva su `.eq('business_id', business.id)` (`:1698`), no hay `dangerouslySetInnerHTML`, ni interpolación de HTML, ni secretos, ni paquetes, ni migraciones. El único roce con el aislamiento por tenant es por omisión y es preexistente: WR-06.

Lo que **no** está bien está abajo.

## Warnings (pasada 3)

### WR-05: Ir a “Individual” y volver deja el borrador sucio **y** baja el cupo a 2 en silencio — el único falso positivo de los cuatro que el plan declara cubiertos

**File:** `app/(dashboard)/settings/settings-client.tsx:612` (el `onClick` del toggle), con `:203-212` (la huella) y `:1687` (el guardado)
**Issue:** El patch del toggle es `capacity: o.key === 'individual' ? 1 : normalizeCapacity(capacity, 2)`. Pasar a **individual pisa el cupo con 1**, y al volver a un modo compartido el piso lo levanta a **2**, no al valor original: el cupo se pierde en el camino de ida.

Escenario concreto, con una clase de 12 lugares:

1. El dueño abre “Editar servicio” de una clase grupal con `capacity = 12`. Huella de partida: `capacity: 12`.
2. Toca “Individual” (el explicador invita a **comparar** los tres modos, y la pill es el control obvio para hacerlo). El borrador queda `{individual, capacity: 1}`.
3. Vuelve a “Clase grupal”. El borrador queda `{group_class, capacity: 2}` — **los 12 se perdieron**.
4. La huella da distinta ⇒ `isEditSvcDirty()` devuelve `true` ⇒ el click afuera y el Escape quedan **bloqueados** con el aviso, aunque el dueño no haya querido cambiar nada.
5. El aviso le dice literalmente **“Guardá para conservarlos”** (`UNSAVED_CHANGES_HINT`, `:175`). Si sigue esa instrucción, `saveEditService` escribe `capacity: 2` sobre una clase de 12.

El paso 5 es el que importa: ese camino de guardado **no tiene** el pre-chequeo de bajada de cupo que sí tiene la tarjeta (`maxFutureSeatsOf` se llama sólo desde `saveCapacityInline`, `:1780`). La clase queda con `12/2 lleno` en la agenda y el motor rechazando toda reserva nueva con `slot_full`, sin un solo aviso. El toggle lossy es **preexistente**; lo que agrega este plan es que (a) la huella reporta como “cambios sin guardar” una operación que el dueño vivió como lectura, y (b) el texto del aviso empuja al guardado que consuma la pérdida.

Contradice de frente la cobertura **D9** del `23-10-SUMMARY` (“ir y volver de modo de cupo … dejan el diálogo cerrable”), declarada cubierta por un gate de región. El gate mira que la huella use los normalizadores; no puede ver este caso, porque el defecto no está en la huella sino en el patch del toggle. Con `capacity ≤ 2` el round-trip sí es inocuo — que es probablemente por qué nadie lo vio.

**Fix (mínimo y del lado correcto):** no pisar el cupo al ir a individual. El piso de 1 ya lo imponen el guardado (`:1687`), el alta y la propia huella (`:204`), así que conservar el número mientras el modo es individual no puede producir una combinación que el CHECK de la migr. 068 rechace, y el campo “Cuántos lugares” ni siquiera se renderiza en ese modo:

```tsx
// El cupo sólo se toca al ENTRAR a un modo compartido, para respetar su piso. Al ir a individual se
// CONSERVA: el 1 lo impone el guardado, y pisarlo acá hace que ir y volver degrade 12 → 2.
onClick={() => onChange({
  capacity_mode: o.key,
  capacity: o.key === 'individual' ? capacity : normalizeCapacity(capacity, 2),
})}
```

Con eso el round-trip vuelve a dar la huella de partida y el diálogo cierra con un click afuera, sin tocar la guarda. Aparte, conviene llevar el pre-chequeo de bajada de cupo también al guardado del diálogo, hoy exclusivo de la tarjeta.

### WR-06: `saveEditLocation` es la única de las tres escrituras de edición sin el filtro por `business_id`

**File:** `app/(dashboard)/settings/settings-client.tsx:2238`
**Issue:** El plan mudó el payload de la sede a `locToPayload` y dejó la sentencia como estaba:

```tsx
const { error } = await supabase.from('locations').update(payload).eq('id', editLoc.id)
```

Sus dos hermanas del mismo archivo, tocadas por el mismo plan, sí lo llevan: `saveEditService` (`:1698`, con el comentario “defensa en profundidad — la RLS es la segunda capa, no la única”) y `saveEditPro` (`:1953-1957`). La convención del proyecto (`.claude/CLAUDE.md`: “toda query del dashboard filtra por `.eq('business_id', business.id)`. Nunca omitir”) y la skill `supabase-multitenant-rls` piden las dos capas.

**No es explotable hoy:** la policy `"business access" ON public.locations` (`supabase/schema.sql:2555`) es `USING (business_id IN (SELECT id FROM businesses WHERE owner_id = auth.uid()))` y, al no declarar un `WITH CHECK` propio, Postgres reusa ese predicado para el `UPDATE`, así que un id de otro negocio no escribe nada. Es exactamente la clase de defecto que la convención existe para evitar: la única barrera queda del lado de la base, y si mañana esa policy se relaja o aparece un rol nuevo, este call site no avisa.
**Fix:**

```tsx
const { error } = await supabase.from('locations').update(payload).eq('id', editLoc.id).eq('business_id', business.id)
```

### WR-07: En “Editar sede”, con el nombre vacío el diálogo se percibe **trabado**: el click afuera queda bloqueado, “Guardar” no hace nada y no hay “Cancelar”

**File:** `app/(dashboard)/settings/settings-client.tsx:3786` (el botón), con `:2233` (el early return) y `:3776` (la guarda)
**Issue:** `saveEditLocation` arranca con `if (!editLoc || !editLocForm.name.trim()) return` — **sin toast y sin marcar el campo**. Y a diferencia del diálogo de servicio, el botón sólo está `disabled={savingEditLoc}`: con el nombre vacío se puede clickear y **no pasa absolutamente nada**.

Antes de este plan eso era un no-op molesto con una salida obvia (el click afuera). Ahora, con el nombre vacío el borrador está sucio por definición (`''` contra el nombre original), así que:

- click afuera o Escape → bloqueados, con el aviso “Guardá para conservarlos, o cerrá con la ✕”;
- “Guardar” → no hace nada, ni un mensaje;
- no hay botón “Cancelar” en este diálogo (el de profesional sí lo tiene, `:4125`).

Queda la ✕, que el aviso nombra. Pero el primer reflejo del dueño va a ser el botón grande que dice Guardar, y ése es el que le devuelve silencio: es la combinación que hace que una pantalla se lea como rota.
**Fix:** espejar lo que ya hace el diálogo de servicio (`:3416`), que es el patrón del propio archivo:

```tsx
<Button onClick={saveEditLocation} disabled={savingEditLoc || !editLocForm.name.trim()}>
```

Y, ya que el aviso empuja a “Guardar”, que el early return de `:2233` deje de ser silencioso (`toast.error('Poné un nombre para la sede')`).

### WR-08: El único feedback del cierre bloqueado vive en una región que el propio diálogo modal marca como inerte

**File:** `app/(dashboard)/settings/settings-client.tsx:218` (el `toast.warning` de la guarda)
**Issue:** El diálogo se monta con `modal` por defecto, y Base UI lo resuelve con `FloatingFocusManager modal` (`node_modules/@base-ui/react/dialog/popup/DialogPopup.js:115-122`), que aplica `markOthers` sobre los hermanos del popup en `<body>` poniéndoles `inert` (o `aria-hidden` donde no haya soporte) — `floating-ui-react/utils/markOthers.js:76-81`. El `<Toaster />` de sonner se monta en `app/layout.tsx:65`, o sea **fuera** del portal del diálogo: mientras el diálogo está abierto, su región `aria-live` cae dentro del subárbol marcado.

Consecuencia concreta: quien cierra con **Escape** —camino de teclado, y uno de los dos motivos que la guarda mira— percibe que la tecla “no hace nada” y no recibe ningún anuncio. Visualmente el toast sí se ve (`inert` no oculta), así que el usuario con puntero y vista queda cubierto; el de teclado + lector de pantalla, no. Es el mismo eje que WR-03 de la pasada 2 (WCAG 1.3.2 / 4.1.3): un estado nuevo que se comunica por un solo canal.
**Fix:** duplicar el mensaje **adentro** del popup, que es lo único que el modal no marca. Un nodo por diálogo alcanza y no agrega un modal anidado (que `CLAUDE.md` prohíbe):

```tsx
// dentro de cada DialogContent, arriba del cuerpo
<p role="status" aria-live="assertive" className="sr-only">{dismissBlocked ? `${UNSAVED_CHANGES_MESSAGE}. ${UNSAVED_CHANGES_HINT}` : ''}</p>
```

con un `useState` que la guarda prenda al cancelar y que cualquier `onChange` de campo apague. Alternativa más barata: mover el foco al Guardar (o a la ✕) al cancelar el cierre, para que el lector anuncie algo.

### WR-09: La lógica pura más riesgosa del cambio quedó dentro del componente cliente, sin exportar y sin un solo test

**File:** `app/(dashboard)/settings/settings-client.tsx:181-225` (`guardDraftOnDismiss`, `serviceFormFingerprint`, `locToPayload`, `locationFormFingerprint`, `proFormFingerprint`)
**Issue:** Las cinco funciones son **puras** y no dependen de React ni del DOM, pero viven en un módulo `'use client'` de 4.100 líneas y no se exportan: **no se pueden testear**. El resultado es que las coberturas D7, D8, D9 y D10 del `23-10-SUMMARY` quedan todas en `human_judgment: true` + un gate de `grep`, para un arreglo cuyo modo de falla el propio plan clasifica como GRAVE (T-23-49: “una huella mal normalizada encierra al dueño en un diálogo que ya no cierra”).

El repo tiene el patrón opuesto y a mano: `lib/catalog-panel.ts` + `test/catalog-panel.test.ts` nacieron en esta misma fase justamente para poder testear `liveCategoryValue`, `categoryPatch` y `nextSortOrder` — las mismas funciones que la huella reusa. La suite tiene 1.301 casos y **ninguno** puede tocar la huella. WR-05 es la prueba de que el gate de `grep` no alcanza: dio verde sobre un caso que rompe.
**Fix:** mover las cinco a `lib/panel-draft.ts` (o extender `lib/catalog-panel.ts`) y agregar `test/panel-draft.test.ts` con, como mínimo, los cuatro falsos positivos declarados: normalizar al salir de un campo, prender y apagar una sede, ir y volver de modo de cupo (el de WR-05) y un servicio con y otro sin categoría. Son tests de función pura: no hace falta jsdom ni montar el componente.

### WR-10: Los comentarios nuevos citan tres números que **no** son los que se midieron

**File:** `app/(dashboard)/settings/settings-client.tsx:3021-3022` y `:3338`
**Issue:** En este archivo el comentario es el contrato de la región — WR-04 de la pasada 2 se abrió y se arregló exactamente por esto, y el propio plan 23-10 se jacta de haber corregido “el comentario que mentía, con el número que lo desmiente”. Los comentarios nuevos reintroducen el problema:

1. **`:3021-3022`** — “medido bit a bit: 33px de la línea al botón, **33px del botón a “Se ofrece en:”**, **343px de alto**”. La medición registrada en el `23-09-SUMMARY` (cobertura D8) dice `línea→botón 33/33`, **`botón→"Se ofrece en:" 32/32`** y **alto `346 → 346`**. Dos de los tres números están mal, y el de 32px no es decorativo: es el ritmo que sostiene la invariante de la zona de exclusión de G-04, que el mismo comentario invoca dos párrafos más abajo.
2. **`:3338`** — “(aparece “Cuántos lugares”, **+126px medidos**)”. Los 126px que midió la sonda son el **alto del radiogroup** en la variante nueva (46 → 126, o sea +80), no lo que aporta el bloque “Cuántos lugares”, que la sonda nunca midió por separado. El número es real pero está atribuido a otra caja.

**Fix:** tres correcciones de texto, sin tocar código: `33px` → `32px` y `343px` → `346px` en `:3021-3022`; y en `:3338`, o el número que corresponda al bloque “Cuántos lugares”, o reformular (“el cuerpo crece al aparecer ‘Cuántos lugares’ y cruza el alto disponible”) sin citar una cifra que no se midió.

## Info (pasada 3)

### IN-09: Quitar `: ServiceEditForm` sí pierde algo concreto: el chequeo de propiedades en exceso

**File:** `app/(dashboard)/settings/settings-client.tsx:1641-1655`
**Issue:** La desviación declarada (Rule 3) quitó la anotación para que el gate de “el nombre del tipo aparece 3 veces” diera. Lo que se conserva: un campo **faltante** o **mal tipado** sigue reventando en `setEditSvcForm(inicial)` y en `serviceFormFingerprint(inicial, …)`. Lo que se pierde: al ser una variable y no un literal fresco, TypeScript ya **no** aplica excess property checking, así que un campo de más (un `sort_order`, o un `descripcion` mal escrito **junto** al `description` correcto) pasa en silencio y termina en el borrador. `tsc --noEmit` confirma que hoy no hay ninguno.
**Fix:** `const inicial = { … } satisfies ServiceEditForm` recupera las dos cosas sin re-anotar, y el gate —que es un instrumento del plan, no una restricción del código— se corrige a 4. Un conteo de ocurrencias de un identificador no es razón suficiente para bajar el tipado: el gate está para proteger al código, no al revés.

### IN-10: `scrollbar-gutter: stable` no elimina el desalineado, lo vuelve permanente (y la UAT corre justo en la plataforma donde se ve)

**File:** `app/(dashboard)/settings/settings-client.tsx:3346`
**Issue:** El arreglo congela el ancho útil en 369px, pero el header y el pie —filas hermanas del grid, no hijas del contenedor scrolleable— siguen midiendo 384. O sea que en Windows/Linux (scrollbar clásico) los campos quedan **siempre** 15px adentro del borde derecho del popup, también en los modos que no scrollean, donde antes alineaban. En macOS/iOS (scrollbar overlay) el hueco es 0 y no se nota. El defecto reportado (“el diálogo se ensanchó”) desaparece porque ya no *cambia*; el desalineado en sí queda fijo.
**Fix:** ninguno obligatorio — es el trade-off que el usuario aceptó. Pero el check visual de la UAT a 1440×900 conviene que mire explícitamente el borde derecho de los inputs contra el del pie, porque el entorno del dueño es Windows y es donde el hueco se materializa. Si molesta, la alternativa es llevar la reserva al popup y sacarle el sangrado `-mx-4 px-4` a la fila scrolleable, para que header, cuerpo y pie compartan el mismo borde.

### IN-11: “Cancelar” descarta sin aviso lo que un click 2px más afuera sí protege

**File:** `app/(dashboard)/settings/settings-client.tsx:4125`
**Issue:** En “Editar profesional”, “Cancelar” llama a `setEditingPro(null)` directo, sin pasar por la guarda. Es coherente con la decisión (“descartar explícito no cobra fricción”), pero deja el modelo mental partido: el mismo borrador se pierde sin chistar por un botón y queda retenido con aviso por un click en el backdrop. Y el texto del aviso sólo nombra la ✕, no el “Cancelar” que está a la vista en ese diálogo.
**Fix:** decidirlo y dejarlo escrito. Si “Cancelar” es descarte explícito, alcanza con que `UNSAVED_CHANGES_HINT` lo contemple (“…o descartá con Cancelar / la ✕”). Si no, cablearlo a la misma guarda.

### IN-12: El aviso en español manda a un control cuyo nombre accesible está en inglés

**File:** `components/ui/dialog.tsx:88` (consumido por los tres diálogos)
**Issue:** `UNSAVED_CHANGES_HINT` dice “cerrá con la ✕ para descartarlos”, y el nombre accesible de esa ✕ es `<span className="sr-only">Close</span>`. Un lector de pantalla en español anuncia “Close”. Es preexistente y compartido por ~15 diálogos, pero este plan es el primero que convierte a ese botón en **la única salida documentada** de un estado.
**Fix:** `Cerrar` en `components/ui/dialog.tsx` (una palabra, no toca layout), o pasar el label por prop desde el caller si se quiere mantener el componente compartido byte-idéntico.

### IN-13: Tres líneas con espacios finales en los comentarios re-indentados

**File:** `app/(dashboard)/settings/settings-client.tsx:3042, 3047, 3056`
**Issue:** `git diff --check` marca tres líneas en blanco del bloque de comentario que se re-indentó al entrar en el envoltorio nuevo. Sin efecto de runtime; ensucia el próximo diff de esa región.
**Fix:** borrar los espacios finales de esas tres líneas.

### IN-14: El diálogo “Mover …” del organizador quedó afuera de la guarda, en la misma pantalla

**File:** `components/dashboard/categorias-manager.tsx:1000`
**Issue:** G-23-25 se definió como “los tres diálogos de edición del panel”, y así se implementó. Pero en `/servicios` hay un cuarto diálogo con borrador: “Mover …”, que sostiene la categoría destino **y** la posición elegidas, y se descarta con `onOpenChange={o => { if (!o && !savingMove) setMoving(null) }}`. Para el dueño es la misma pantalla y el mismo tipo de pérdida. (“Cancelar suscripción”, `settings-client.tsx:4067`, sí está bien afuera: no tiene borrador.)
**Fix:** decidirlo explícitamente. Si entra, `guardDraftOnDismiss` es reusable tal cual en cuanto se exporte (ver WR-09), y su huella sería `JSON.stringify({ categoria, posicion })` contra lo capturado en `openMove`. Si no entra, que quede escrito en el `23-UI-SPEC` para que el próximo no lo lea como un olvido.

---

_Reviewed: 2026-09-17 (pasada 1) · 2026-09-18 (pasada 2, incremental sobre 23-08) · 2026-09-18 (pasada 3, incremental sobre 23-09 + 23-10)_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
