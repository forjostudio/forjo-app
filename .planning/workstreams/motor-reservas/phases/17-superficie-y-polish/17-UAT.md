---
status: testing
phase: 17-superficie-y-polish
workstream: motor-reservas
milestone: v0.27
source: [17-01-SUMMARY.md, 17-02-SUMMARY.md, 17-03-SUMMARY.md, 17-04-SUMMARY.md, 17-05-SUMMARY.md, 17-VERIFICATION.md]
started: 2026-08-20
updated: 2026-08-20
---

> **Fixture YA SEMBRADO** en el Supabase local (por el ejecutor de 17-05, el 2026-08-20).
> Negocio `Negocio de Prueba` · login `test@forjo.local` / `Forjo1234!` · abrí `/agenda` en la semana
> del **viernes 21 de agosto de 2026**:
>
> - **Yoga grupal** — `group_class`, cupo **6**, 3 turnos a las **09:00** (Ana Gomez y Bruno Diaz
>   confirmados; Carla Ruiz con **seña pendiente** y hold vivo)
> - **Pilates reformer** — `group_class`, cupo **4**, 1 turno a las **09:00** — el MISMO horario que
>   Yoga, a propósito: son la prueba de que dos clases distintas **no se fusionan**
> - **Corte** — `individual`, 1 turno a las **11:00** (Elsa Mora)
> - **Color** — `simultaneous_resource`, cupo 2 (venía del seed)
>
> ⚠ Si corriste `supabase db reset` después del 2026-08-20, la siembra se perdió (`seed.sql` recrea el
> negocio pero no estos turnos) y hay que rehacerla a mano.
>
> **Todo se mira a 375px**, salvo el test 10.

## Current Test

number: R2-5
name: Modo oscuro y otra paleta
expected: |
  Repetir R2-1 (tarjeta de servicio) y R2-4 (agenda) en oscuro y con otra paleta. Ningún texto pierde
  contraste y el layout se comporta igual. Acá se mira el LAYOUT, no el color.
awaiting: user response

## Ronda 2 — cierre de gaps (2026-08-24)

Los tres gaps de la ronda 1 se cerraron con los planes 17-06, 17-07 y 17-08. Esta ronda verifica sólo
eso. Fixture resembrado en el **viernes 28 de agosto** (la semana del 21 quedó en el pasado).

### R2-1. G-02 — la tarjeta ya no se superpone
expected: 375px · /servicios. Acciones en el renglón del nombre sin montarse; nombre legible completo; línea de datos con el modo; control debajo; ningún `·` huérfano. Individual sin badge ni stepper.
result: pass

### R2-2. G-02b — `Guardar` en la misma línea que el stepper
expected: |
  En esa misma tarjeta, tocá `+`. Aparece `Guardar` A LA DERECHA del stepper, mismo renglón (la palabra
  `lugares` le cede el lugar mientras haya algo pendiente). Bajar al valor original hace desaparecer el
  botón solo. Guardar dice `Guardando…`, sale el toast `Cupo actualizado`, la fila queda limpia con
  `lugares` de vuelta.
  NEGATIVO: tocar el texto `Clase grupal` no abre ni cambia nada.
result: [pending]

### R2-3. G-01 — el explicador ya no abruma
expected: |
  `/servicios` → editar un servicio (el lápiz) → bloque `Cómo se ocupa el cupo`.
  SÓLO el modo seleccionado muestra eje + ejemplo + advertencia ámbar. Los otros dos son UNA línea cada
  uno: nombre en negrita, dos puntos, y su eje de conteo. Los tres conservan su barrita a la izquierda.
  Tocar otro modo: el nuevo se expande y el anterior se colapsa, sin animación de alto.
  ⚠ Si abrís un servicio `individual`, su versión expandida NO lleva advertencia ámbar — ese modo no la
  tiene por diseño (D-01). No es defecto.
  NEGATIVO: tocar el texto del explicador (no los botones) no hace nada.
  REGRESIÓN: el `Guardar` del diálogo sigue alcanzable.
result: pass
notes: |
  El dueño propuso además llevar el MISMO stepper +/− de la tarjeta al campo "Cuántos lugares" del
  modal, que hoy es un `Input` pelado. Verificado: el stepper de la tarjeta lleva un
  `<input type="number" inputMode="numeric">` en el medio, así que el cambio conservaría lo que arregló
  D-06 (poder tipear) y sumaría targets de 44px. NO es un gap — es capacidad nueva, registrada aparte.

### R2-4. G-03 — en la agenda se lee el nombre del servicio
expected: |
  `/agenda`, semana del vie 28 de ago, celda del viernes.
  Dos filas de las 09:00, una por clase, y en cada una SE LEE el nombre: `09:00 Yoga grupal` con
  `👥 3/6 · 1 sin seña` DEBAJO, dentro del chip; y `09:00 Pilates reformer` con su contador debajo.
  Ningún badge se sale del borde redondeado.
  NEGATIVO: el turno individual de las 11:00 (Elsa Mora) se ve como siempre y no es clickeable.
  REGRESIÓN: tocar la fila de Yoga abre el roster con Ana, Bruno y Carla — y NO con Dora Paz.
result: pass
notes: |
  `09:00 Yoga grupal` arriba y `3/6 · 1 sin seña` en ámbar debajo, DENTRO del chip y sin desbordar el
  borde redondeado. Roster confirmado con Ana/Bruno/Carla y sin Dora Paz.
  `Pilates refor…` sigue truncado con puntos suspensivos y eso es lo ESPERADO: el nombre es largo y el
  chip mide ~115px. El defecto era que el nombre tenía CERO píxeles (Yoga aparecía sin nombre); ahora
  tiene ~77px y trunca como corresponde.
  ⚠ **Primer intento fallido por el FIXTURE, no por el código.** El badge mostró `2/6` neutro sin el
  sufijo porque el hold de Carla había vencido (expiraba 18:05, se miró 19:25). Un hold vencido no
  ocupa lugar, así que `2/6` era correcto y el badge neutro también. Se extendió el hold a 30 días y el
  caso pasó. Lección de fixture: **sembrar holds con vigencia larga si el fixture sobrevive más de una
  sesión.**
  De ese falso positivo salió un hallazgo REAL, registrado aparte: el roster dice "Seña pendiente"
  también cuando el hold venció, y eso se lee como "me debe la seña" en vez de "esa reserva caducó"
  (todo `2026-08-24-el-roster-no-distingue-sena-pendiente-de-hold-vencido`).

### R2-5. Modo oscuro y otra paleta
expected: |
  Repetir R2-1 y R2-4 en oscuro y con otra paleta. Ningún texto pierde contraste y el layout se
  comporta igual. (El contraste ya está medido —7.07:1 oscuro / 5.12:1 claro—: acá se mira el LAYOUT.)
result: [pending]

## Tests

### 1. El editor explica la diferencia entre los dos modos
expected: 375px · /settings → editar servicio. Tres bloques paralelos legibles, no nueve líneas. Se entiende grupal vs simultáneo sin abrir nada más.
result: issue — G-01
notes: |
  Se lee y se entiende (la parte explicativa FUNCIONA), pero mostrar los tres completos a la vez es
  demasiado ruido a 375px. Palabras del dueño: "creo que fue decision que se vea todo pero es mucho
  ruido, podemos hacer que aparezca la explicación segun lo seleccionado?"
  Decisión tomada en la UAT: **el seleccionado completo, los otros dos en UNA línea con solo su eje de
  conteo.** Baja el ruido a la mitad y conserva la comparación sin obligar a tocar botones — que era
  el motivo de D-02, porque cada botón de modo escribe `capacity_mode` + `capacity` en el formulario.
  Esto REVISA D-02 del CONTEXT, con la pantalla a la vista.

### 2. El diálogo scrollea y el "Guardar" siempre se alcanza
expected: 375px · mismo diálogo. El botón "Guardar" es alcanzable siempre; el título queda fijo arriba mientras el cuerpo scrollea.
result: pass

### 3. El campo de cupo se puede editar con el teclado
expected: 375px · mismo diálogo. Se puede BORRAR el número de lugares y escribir otro. (Este es el defecto exacto que reportaste en la UAT anterior.)
result: pass
notes: |
  Confirmado además el piso por modo: escribir `1` en un servicio grupal lo devuelve a `2` al salir
  del campo (`minCapacityFor`). Es correcto — el CHECK `services_capacity_matches_mode_chk` de la
  migr. 068 exige `capacity >= 2` fuera de `individual`, así que el editor corrige antes de que la
  base rechace.

### 4. La tarjeta muestra el modo, y sólo cuando corresponde
expected: 375px · lista de servicios. El servicio `individual` se ve IGUAL que antes (sin badge). El grupal muestra `Clase grupal · [−] 6 [+] lugares`.
result: issue — G-02
notes: |
  Reportado por el dueño antes de llegar a este test: "en las tarjetas de servicios se superponen
  botones, titulos, etc en 375px".
  DIAGNÓSTICO (no es ambigüedad de diseño, es un defecto de layout): la fila de la tarjeta es
  `flex items-center` con una columna `min-w-0 flex-1` (nombre + línea de datos) y, al lado,
  `Desactivar` + los dos botones de icono. Al insertar `CapacityInlineControl` esa columna CRECIÓ EN
  ALTO, y los botones —centrados verticalmente contra un bloque alto— quedan flotando a mitad de
  camino, encima del texto del modo. A 375px no hay ancho para absorberlo.
  El servicio `individual` (tarjeta "Testing" en la captura) se ve bien: confirma que D-07 está OK y
  que el defecto lo introduce el control.
  La parte funcional de este test SÍ pasa, medida sobre las capturas del dueño: `individual` sin badge,
  `Color` y `Pilates reformer` con su modo y su stepper. Lo único que falla es el layout (G-02).

### 5. El control inline guarda, revierte y no congela a los demás
expected: |
  375px · tarjeta de un servicio de cupo compartido.
  · Subir el cupo con `+` → aparece el botón "Guardar".
  · Bajarlo de vuelta al valor original → el botón DESAPARECE sin guardar nada.
  · Subirlo y guardar → dice "Guardando…", sale el toast `Cupo actualizado`, la fila queda limpia.
  · Mientras uno guarda, el stepper del OTRO servicio de cupo compartido sigue usable.
  · El control entero (label + stepper + "lugares") baja a su propia línea sin partirse.
  Y dos que tienen que NO pasar: tocar el label `Clase grupal` no abre ni cambia nada (D-09), y la
  tarjeta nunca crece con un mensaje de error adentro (los errores salen por toast).
result: pass
notes: |
  La mecánica completa funciona. El dueño agregó una observación de layout que se suma a G-02:
  "hay lugar para que el botón Guardar aparezca en la misma línea que el selector de cupo y no abajo".

### 6. El alta de servicio confirma al final
expected: 375px · alta de servicio. El botón "Agregar servicio" está al FINAL del formulario y rotulado — ya no es un `+` en el medio de la grilla.
result: pass

### 7. Dos clases a la misma hora no se fusionan
expected: |
  375px · /agenda, semana del vie 21 de ago. En la celda del viernes tiene que haber DOS filas de
  las 09:00, una por clase:
  · `09:00 · Pilates reformer · 👥 1/4` (badge neutro)
  · `09:00 · Yoga grupal · 👥 3/6 · 1 sin seña` (badge ámbar)
  Cada una ocupa UNA sola fila. El contador se ve AUNQUE NO esté lleno. El nombre del servicio se
  trunca sin recortar el contador. La semana sigue legible.
  A las 11:00, el turno individual de Elsa Mora se ve como siempre y NO es clickeable.
result: issue — G-03
notes: |
  **La lógica pasa entera:** dos filas separadas para las 09:00 (Pilates y Yoga no se fusionan), el
  contador visible sin estar lleno, el badge ámbar sólo en Yoga por la seña pendiente, y el turno
  individual de Elsa Mora intacto y no clickeable.
  **Confirmación no prevista de POLISH-09:** el contador de Pilates mostró `1/6`, no `1/4` (el cupo sembrado), porque el
  dueño le cambió el cupo desde la tarjeta en el test 5 y **la agenda lo siguió**. Es la prueba de que
  la grilla lee `services.capacity` y no `time_blocks.capacity` — el requisito que no era cosmético.
  **Lo que falla es visual**, palabras del dueño: "Está todo, pero visualmente quedó mal. No se ve el
  título y el badge ámbar se desborda".

### 8. El roster corresponde a la clase que tocaste
expected: |
  375px · /agenda. Tocar la fila de Yoga: el título dice `Yoga grupal · vie 21 de ago · 09:00` y lista
  a Ana, Bruno y Carla — y NO a Dora Paz, que es de Pilates. El contador del diálogo dice `3/6` y
  "lugares ocupados".
  ⚠ Es el ÚNICO paso que ningún agente pudo medir: abrir el roster es JS de cliente y no había
  navegador en el entorno.
result: pass
notes: |
  Palabras del dueño: "Queda perfecto". Verificado en iPhone SE (375×667): título
  `Yoga Grupal · Vie 21 De Ago · 09:00`, contador `3/6 lugares ocupados`, y Ana Gomez / Bruno Diaz
  (Confirmado) + Carla Ruiz (Seña pendiente). **Dora Paz NO aparece** — es la confirmación del cambio
  de comportamiento que 17-05 predijo: el roster filtra por SERVICIO además de fecha y hora. Con el
  modelo viejo habría listado a Dora y contado 4.
  Es también el único paso del guion que quedaba sin medir por nadie: ahora está cerrado por un humano.

### 9. Finanzas mobile muestra el servicio
expected: 375px · /finances → Turnos. Se ve el servicio bajo el nombre del cliente. La fecha, el precio y el botón quedaron donde estaban.
result: pass
notes: |
  Limpio a 375px: fecha+hora a la izquierda, cliente con el servicio debajo, precio y "Cobrar" a la
  derecha. Nada apretado.
  **Contraste útil para los fixes de G-02 y G-03:** ésta es la única de las tres superficies que NO se
  rompió, y la diferencia es estructural — acá el dato nuevo entró en SU PROPIA LÍNEA bajo el nombre,
  en vez de pelear por ancho horizontal dentro de una fila que ya estaba llena. Los dos gaps de layout
  hicieron lo contrario.

### 10. Modo oscuro y otra paleta
expected: Repetir los tests 4, 7 y 9 en modo oscuro y con otra paleta. Ningún texto pierde contraste.
result: pass
notes: |
  Verificado en tema `modern` claro (paleta coral) y `modern` oscuro (paleta cyan), a 375px.
  **Contraste MEDIDO, no estimado.** El badge ámbar sobre su propio `bg-warning/10`:
  · modern oscuro (card `#18202f`): **7.07:1**
  · modern claro (card blanco): **5.12:1**
  AA normal exige 4.5:1 ⇒ pasa en los dos. `--warning` no se redeclara por paleta y no hace falta: el
  `#e6b53f` de `.dark` sirve sobre cualquier fondo oscuro y el `#8a5a12` de `:root` sobre los claros.
  El explicador en oscuro se lee bien y la jerarquía se sostiene.
  **Dato útil para el fix de G-03:** el defecto se reproduce IDÉNTICO en los dos temas — el nombre de
  Yoga desaparece en claro y en oscuro. Confirma que es puramente de layout, no de tokens.
  Observación menor (no defecto): el contador está en 9px, heredado del badge preexistente del recurso
  simultáneo. Es consistente con el repo, pero es el tamaño más chico de la app y por eso "se ve flojo"
  aunque el contraste dé bien.

## Summary

ronda_1: 10 tests — 7 passed, 3 issues (G-01, G-02+G-02b, G-03), todos cerrados por 17-06/07/08
ronda_2: 5 tests — 4 passed, 0 issues, 1 pending
total: 15
passed: 11
issues: 3
pending: 1
skipped: 0

## Gaps

### G-01 — El explicador de modos es demasiado ruido a 375px
severity: media
surface: `app/(dashboard)/settings/settings-client.tsx` → `CapacityModeFields`
symptom: Los tres bloques completos y simultáneos ocupan ~10 líneas dentro del modal. Se entiende, pero abruma.
decision: El modo SELECCIONADO se muestra completo (eje + ejemplo + advertencia); los otros dos quedan en UNA línea con solo su eje de conteo. Al cambiar de modo, el que se selecciona se expande y el anterior se colapsa.
why_not_only_selected: Ocultar los no seleccionados obligaría a tocar cada botón para compararlos, y cada toque escribe `capacity_mode` + `capacity` en el formulario. Leer no puede tener efecto de escritura — ése fue el motivo original de D-02.
revises: D-02 del `17-CONTEXT.md`
constraint: `individual` no tiene capa de advertencia; su versión colapsada es igual de corta que su versión expandida.

### G-02 — Las tarjetas de servicio se superponen a 375px
severity: alta
surface: `app/(dashboard)/settings/settings-client.tsx` → la fila de la tarjeta (~2135-2160)
symptom: `Desactivar` y los botones de icono se montan sobre el texto del modo (`Recurso simultáneo`, `Clase grupal`). El nombre del servicio se trunca (`Pilates refo...`) mientras los botones ocupan ancho al lado. También se ve un separador `·` colgando solo en una línea.
root_cause: La fila es `flex items-center`: la columna `min-w-0 flex-1` creció en alto al recibir `CapacityInlineControl`, y los botones de acción se centran verticalmente contra ese bloque alto en vez de anclarse arriba. A 375px no hay ancho para que convivan en la misma fila.
regression_of: 17-03 (introducido por el control inline; el servicio `individual` no está afectado)
note: El UI-SPEC decía que el control baja a su propia línea — lo que no se resolvió es qué hacen los botones de acción cuando eso pasa.

#### G-02b — el apilado vertical dentro del propio control (misma causa raíz)
Observado por el dueño en el test 5: *"hay lugar para que el botón Guardar aparezca en la misma línea
que el selector de cupo y no abajo"*.
Hoy, a 375px, el control se apila en TRES niveles: el stepper `[−] 7 [+]`, la palabra `lugares`
huérfana debajo, y `Guardar` como un bloque grande al final.
Es consecuencia de lo mismo: `Desactivar` + los dos iconos se comen el ancho de la fila, así que la
columna del control queda angosta y todo cae en vertical. **Al mover los botones de acción fuera de
esa fila, el ancho alcanza para `[−] 7 [+] lugares  [Guardar]` en una sola línea** — que es además
lo que el UI-SPEC §1 describe.
El fix de G-02 tiene que resolver los dos niveles a la vez: la fila de la tarjeta Y la composición
interna del control.

### G-03 — En la agenda a 375px el badge se come el nombre del servicio
severity: alta
surface: `app/(dashboard)/settings/...` NO — es `app/(dashboard)/agenda/agenda-client.tsx` → el chip del slot agrupado y `OccupancyBadge`
symptom: |
  En la celda del viernes, `Pilates reformer` queda truncado a `Pila…` y **Yoga grupal desaparece por
  completo**: la fila muestra sólo `09:00` y el badge ámbar, sin nombre. El badge ámbar además se
  desborda del borde redondeado del chip.
root_cause: |
  La grilla semanal es de DOS columnas a 375px, así que la celda del día mide ~130-155px. El chip es
  `flex` con el nombre en `min-w-0 flex-1 truncate` y el badge en `flex-shrink-0`. El badge ámbar
  (`👥 3/6 · 1 sin seña`) necesita ~110px, así que al nombre le quedan ~20px y se trunca a nada.
  El badge nunca cede ancho porque es `flex-shrink-0` — correcto para no recortar el contador, pero a
  este ancho deja al nombre sin nada que mostrar.
regression_of: 17-05
note: |
  Mismo patrón que G-01 y G-02: **piezas diseñadas para un ancho que a 375px no existe**. Es el tercer
  caso de la fase, así que el fix conviene pensarlo como una decisión de composición a este ancho, no
  como tres parches sueltos.
options_to_weigh: |
  (a) El badge baja a su propia línea dentro del chip cuando no entra.
  (b) A este ancho el sufijo `· 1 sin seña` se reduce a un punto/ícono, y el texto queda en el
      `title`/`aria-label` (que ya lo tiene).
  (c) La grilla semanal pasa a UNA columna a 375px — más invasivo, toca una superficie que hoy
      funciona.
  Elegir midiendo, no a ojo.
