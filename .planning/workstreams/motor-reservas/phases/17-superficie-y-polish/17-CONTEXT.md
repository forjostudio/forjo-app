# Phase 17: Superficie y polish - Context

**Gathered:** 2026-08-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Que el dueño **entienda en pantalla** lo que la Phase 15 volvió declarable, y que las superficies del
panel dejen de leer la fuente equivocada.

Esta fase **no toca el motor, ni los constraints, ni una migración**. Todo lo funcional del cupo ya
está en producción: los tres modos, el número en un solo lugar, el piso por modo, el bloqueo por
espacio compartido, la copy propia del rechazo del gate, y desde el 2026-08-20 también la 070 con el
gate corregido por dirección.

**Requisitos:** CUPO-09, POLISH-08, POLISH-09, POLISH-10 — **más una ampliación de alcance explícita**
(edición inline del cupo, ver D-08).

⚠ **POLISH-09 no es cosmético y no hay que tratarlo como tal.** `agenda-client.tsx:467` calcula la
ocupación con `time_blocks.capacity`, columna que **desde la migración 068 no decide nada**. La grilla
del panel está diciendo "lleno" con un número que el motor ignora. Hoy no se nota porque todo vale 1;
**miente en cuanto se declare la primera clase de cupo > 1**, que es justo lo que esta fase invita a
hacer al explicar los modos. Es la **cuarta** lectura del cupo, la que D-08 de la Phase 15 dejó a
propósito para acá.

</domain>

## Implementation Decisions

### D-01 — El editor explica los tres modos con **eje + ejemplo + qué sale mal**

Las tres capas, no dos. La tercera es la que justifica el requisito: sin ella el dueño lee dos
definiciones correctas y sigue sin saber cuál le conviene.

```
Clase grupal
  Todos arrancan a la misma hora y comparten los lugares.
  Ej: yoga de 9:00 — 6 personas, todas a las 9:00.
  ⚠ Si elegís simultáneo por error, alguien puede reservar 9:30 y sumarse a mitad de clase.

Recurso simultáneo
  Entran escalonados; se cuentan los turnos que se pisan.
  Ej: 3 camillas — una a las 9:00, otra a las 9:30.
  ⚠ Si elegís grupal por error, se te llena la agenda antes de tiempo: solo entran a la hora en punto.
```

El texto de arriba es **la decisión sobre qué se dice**, no la redacción final palabra por palabra —
el planner puede ajustar la prosa, no las tres capas ni los ejemplos.

**`individual` no lleva la capa de advertencia**: no tiene contra qué equivocarse. Una línea alcanza
("un turno por vez").

### D-02 — Las tres explicaciones **visibles siempre**, no solo la del modo elegido

Elegir bien exige **comparar**, y no se compara lo que no se ve. Mostrar solo la del modo activo
obliga a ir tocando cada botón para leer — y cada toque **escribe en el formulario** (el handler manda
`capacity_mode` + `capacity` juntos). Leer no puede tener efecto de escritura.

### D-03 — Los labels **no se tocan**: "Individual", "Clase grupal", "Recurso simultáneo"

Ya están en producción y viven en más de un lugar: la copy del rechazo del gate, el aviso de espacio
compartido, los comentarios del código y ahora el badge de la tarjeta (D-07). Renombrarlos arrastra
todo eso, y el texto explicativo de D-01 ya hace el trabajo que un label renombrado haría a medias.

### D-04 — Ejemplos **fijos**, iguales para todos los verticales

Yoga y camillas se entienden desde cualquier rubro. Meter ejemplos por vertical en `lib/verticals.ts`
suma dos strings por rubro y obliga a inventar el caso de `canchas`, donde el cupo compartido casi no
aplica. **No se agregan claves nuevas a `lib/verticals.ts` en esta fase.**

### D-05 — El modal **scrollea por dentro**, con el "Guardar" anclado abajo

`DialogContent` **no tiene `max-h` ni `overflow-y`** en el componente base (verificado en
`components/ui/dialog.tsx`): el modal no scrollea, crece. Con los tres bloques de D-01 sumados, a
375×667 el botón "Guardar" —hoy el último hijo del `DialogContent`— **queda fuera del viewport sin
forma de alcanzarlo**.

El arreglo es **local a este modal**, no al componente base: `max-h` en el `DialogContent`, el cuerpo
con `overflow-y`, y el `Guardar` fuera del área que scrollea.

Esto además cierra un desborde que **ya existe hoy**: un negocio con muchas sedes llena el bloque "Se
ofrece en" y empuja el botón igual, sin que nadie lo haya reportado todavía.

**Descartadas y por qué:** mostrar solo el modo activo en mobile mata la comparación de D-02 justo en
la pantalla donde más falta hace; portear el editor a un Drawer convierte "arreglar el alto" en
"cambiar de contenedor", y este repo ya pagó el bug de los `Select` adentro del `Drawer`.

### D-06 — El input de cupo: **se deja vaciar, se corrige al salir (`onBlur`)**

El defecto que levantó la UAT: no se puede borrar el `2` para escribir otro número. La causa está en
`settings-client.tsx:247` — `parseInt('')` da `NaN`, `normalizeCapacity` lo lleva al piso y **reescribe
el campo en la misma tecla**.

Mientras el foco está adentro el campo acepta cualquier cosa, incluido el vacío. Al salir se normaliza
al piso del modo (`minCapacityFor`). Es el patrón de validación inline que el proyecto ya usa en sus
formularios (`onBlur`, no `onChange`).

### D-07 — El badge de modo va en la **línea de datos**, y **solo** para cupo compartido

En la tarjeta de `/servicios`, junto a duración y precio: `30min · $5000 · Clase grupal · 6 lugares`.
El modo es un **dato**, mismo registro que los otros dos — no una alarma. Las pills junto al nombre
están reservadas para advertencias (hoy "Sin cobertura") y mezclar los dos registros le sube el
volumen a un dato normal.

**Los servicios `individual` no llevan badge.** Son el default de la base y el 100 % de producción:
badgearlos es ruido en todas las tarjetas de hoy. Sin badge, el badge se vuelve señal.

### D-08 — ⚠ **AMPLIACIÓN DE ALCANCE, decidida por el dueño: la edición inline del cupo ENTRA**

El pedido salió de la UAT de la Phase 15 (*"hay forma de poner ahí mismo un selector de +- con el cupo
y un botón de guardar?"*) y estaba registrado como todo aparte precisamente porque **es capacidad
nueva, no presentación**: cambia el patrón de la pantalla, que hoy es *ver en la lista, editar en el
modal*. Se decidió meterlo igual. Queda escrito como ampliación, no colado como polish.

Consecuencias que el planner **tiene que tratar como trabajo real, no como un `+` y un `−`**:

- Es un **segundo camino de escritura** sobre `services`. Tiene que mapear el rechazo del gate a copy
  propia igual que el modal (T-14-25 / T-13-09: **nunca** interpolar el mensaje de la base) y respetar
  el piso por modo.
- Necesita estado de guardado **por tarjeta** (varias tarjetas en pantalla, cada una con su request).
- El gate que puede rebotarlo es el de **cupo**, no el de modo — y por D-09 desde la tarjeta no se
  cambia el modo, así que `services_block_mode_change` no debería dispararse nunca por acá. Si se
  dispara, algo está mandando `capacity_mode` de más.

**El badge ES el control** (D-07 + D-08 son el mismo elemento, no dos): `Clase grupal · [−] 6 [+]
lugares`. Un solo lugar donde vive el número en la tarjeta — la misma lección que la Phase 15 aplicó
en la base, aplicada a la pantalla.

### D-09 — Desde la tarjeta se cambia **el número, nunca el modo**

Cambiar de modo es la operación peligrosa: es la que el gate bloquea y la que necesita las tres
explicaciones de D-01. Eso vive en el modal, donde hay lugar para explicarlo. La tarjeta ajusta el
cupo, que es la operación cotidiana.

### D-10 — La grilla: contador **siempre visible**, `3/6`, **una vez por slot**

- **Siempre, no solo al llenarse.** El simultáneo hoy muestra su badge solo cuando está lleno, y ahí
  tiene sentido porque el solape no se lee de un vistazo. En una clase grupal el dato de todos los días
  es *cuántos lugares quedan*, no *ya no queda ninguno*.
- **Una vez por slot, no por chip.** El cupo es del **slot**, no de cada persona: una clase con 6
  inscriptos renderiza 6 chips y repetir `3/6` en los seis es la misma información seis veces.

⚠ **Esto es cambio de estructura de la columna del día, no un badge más.** Hoy cada chip grupal es
**clickeable por separado** para abrir el roster (`setRosterSlot({ date, time })`). Agrupar por horario
convierte al grupo en **una sola unidad clickeable** — mejor UX, y trabajo distinto del que sugiere la
palabra "badge". Presupuestarlo como tal.

### D-11 — La ocupación sale de **`services.capacity`**, y `capacityFor()` sobre `time_blocks` se va

`agenda-client.tsx:467` deja de existir en su forma actual. La fuente pasa a ser la del motor.

Y con eso cae también la deducción de la línea siguiente:

```ts
const isGroup = !isSimultaneous && capacityFor(ds, a.time) > 1   // ← deduce el modo del NÚMERO
```

El modo se **lee**, no se deduce: `serviceById.get(a.service_id)?.capacity_mode === 'group_class'`,
igual que ya hace `isSimultaneous` en la línea de arriba. Deducir el modo del número es la misma clase
de error que el review de la 069 propuso en la base y que se descartó midiéndolo.

### D-12 — Sin servicio resoluble → **se trata como individual**

Un turno cuyo `service_id` es nulo, o cuyo servicio fue borrado (el historial se preserva desde la
Phase 13), no tiene modo ni cupo que leer. Cae en `individual`: **sin contador y sin roster**. No se
inventa un número ni se abre una lista que no corresponde a ninguna clase.

### D-13 — Los toggles: se alinea **el bloque de modo**, nada más

Es el que la UAT señaló y el que se reescribe igual por D-01/D-02. El bloque "Se ofrece en" usa el
mismo patrón de pills envolviendo, pero nadie lo reportó y ampliar el arreglo es superficie extra para
volver a mirar en la UAT.

### Claude's Discretion

- **POLISH-10 (Finanzas mobile)** se resuelve sin consultar: es sacar el `hidden sm:block` y ubicar el
  servicio en la fila mobile sin apretar el resto. Si desplazar otro dato resultara inevitable, decidir
  y **dejarlo anotado en el SUMMARY**, no inventar una pantalla nueva.
- La **redacción final** de los textos de D-01 (las tres capas y los ejemplos son la decisión; la prosa
  no).
- Dónde exactamente cae el contador `3/6` dentro del grupo de slot, y el tratamiento visual del estado
  lleno.
- El tamaño y variante del badge/control de D-07, respetando el design system y `min-h-11` en los
  targets táctiles (el mismo piso que la Phase 14 fijó).

### Folded Todos

Estos todos del workstream **son** esta fase y se cierran con ella:

| Todo | Requisito |
|---|---|
| `2026-07-30-indicador-de-modo-en-la-lista-de-servicios` | POLISH-08 / D-07 |
| `2026-07-30-ocupacion-grupal-no-visible-en-la-grilla-de-la-agenda` | POLISH-09 / D-10 |
| `2026-08-03-finanzas-mobile-oculta-el-servicio` | POLISH-10 |
| `2026-08-16-editor-de-servicios-input-de-cupo-y-boton-guardar` | CUPO-09 / D-06 |
| `2026-08-14-edicion-inline-del-cupo-en-la-tarjeta-de-servicio` | **D-08 (ampliación)** |

**Cerrado antes de empezar:** `2026-08-16-el-gate-de-cambio-de-modo-bloquea-de-mas` lo entregó GATE-01
de la Phase 16 (migración 070, en prod desde el 2026-08-20).

## Noted for Later

Fuera de alcance de esta fase, ya registrados como todos propios. **No tocarlos acá.**

- **`book_slot_atomic` es ejecutable por `anon`** (`X-16-A`, severidad **alta**, pre-existente desde la
  migr. 041): saltea la ventana de reserva, el gate de plan y el reCAPTCHA, que viven solo en el route
  handler. Fase propia.
- **El filtro por tenant del gate se esquiva moviendo `services.business_id`** (`X-16-B`, media).
- **Las suites de abono son flaky en paralelo** — hoy `vitest run` completo **no sirve como gate**.
  Correr las suites específicas.
- **Un turno `completed` futuro no tiene salida en el panel** (WR-02 de la Phase 16): la copy ya dice
  la verdad; darle la salida necesita UI nueva y toca Finanzas.
- **Una persona puede ocupar todos los cupos de una clase** — capacidad nueva.
- **La agenda no sabe qué servicio se da en cada franja** — del tamaño de un milestone, no de una fase.
  Es el pedido de fondo del dueño ("los martes y jueves de 15 a 16 doy cerámica"), y esta fase lo roza
  sin resolverlo: **no dejarse arrastrar**.

## Canonical References

### Alcance y criterios

- `ROADMAP.md` → `### Phase 17: Superficie y polish` (goal + 5 success criteria)
- `REQUIREMENTS.md` → CUPO-09, POLISH-08, POLISH-09, POLISH-10

### Precedentes a leer ANTES de codear

- **`16-SECURITY.md` §6 y §7** — por qué una premisa fáctica se mide cada vez que cambia el código que
  la sostiene. Esta fase tiene poca superficie de seguridad, pero hereda el estándar.
- **La copy del rechazo del gate ya existe** desde 15-02: no reescribirla, no interpolar el error de la
  base. El único agregado posible es el del camino nuevo de D-08.

### Skills obligatorias

- `convenciones-forjo` — stack, arquitectura multi-tenant, naming.
- Reglas de UI/UX del proyecto: mobile-first a 375px, targets ≥ 44px, contraste WCAG AA, tokens del
  design system (nunca hex sueltos), estados obligatorios en interactivos.

## Existing Code Insights

### Lo que hay hoy, medido

| Superficie | Estado |
|---|---|
| `settings-client.tsx` → `CapacityModeFields` | Radiogroup de 3 botones **solo con labels**. Una única línea debajo mete grupal y simultáneo en la misma bolsa: *"varios lugares por turno, y el número lo ponés acá abajo"* |
| `settings-client.tsx:247` | `onChange={... normalizeCapacity(parseInt(e.target.value), ...)}` — normaliza en cada tecla. **Es la causa del defecto de la UAT** |
| `components/ui/dialog.tsx` | `DialogContent` **sin `max-h` ni `overflow-y`**. El modal no scrollea |
| Tarjeta de `/servicios` | Nombre + pill de alarma arriba; `30min · $5000` como línea de datos. **Sin modo, sin cupo** |
| `agenda-client.tsx:467` | `capacityFor()` sobre `time_blocks.capacity` — **la fuente que la 068 jubiló** |
| `agenda-client.tsx` (chips) | El **simultáneo** ya tiene badge `N/M lleno` (warning, solo al llenarse) y no abre roster. El **grupal** abre roster y **no muestra ocupación en ningún lado** |
| Finanzas mobile | El servicio oculto con `hidden sm:block` |

### La asimetría que POLISH-09 viene a cerrar

No es que al grupal le falte un badge: es que **el simultáneo tiene tratamiento de ocupación y el
grupal no tiene ninguno**, aunque el grupal es el modo donde el dueño más necesita saber cuántos
lugares quedan. Y el poco tratamiento que tiene (`isGroup`) se apoya en la columna equivocada.

### El patrón de esta fase, en una línea

Las tres superficies (editor, tarjeta, grilla) tienen el mismo defecto de fondo: **muestran o deducen
el cupo desde donde no vive**. La base ya se unificó en la Phase 15; esto es la pantalla poniéndose al
día. Cuando dudes entre dos formas de mostrar algo, elegí la que lee `services.capacity` y
`services.capacity_mode` directo.
