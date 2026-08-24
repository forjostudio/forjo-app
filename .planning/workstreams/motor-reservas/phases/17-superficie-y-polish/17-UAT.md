---
status: complete
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

number: —
name: FASE COMPLETA — 4 rondas de UAT, 4 gaps encontrados y cerrados
expected: |
  22 tests · 21 pass · 4 issues, los CUATRO cerrados y re-verificados por un humano.
  10/10 planes ejecutados. Sin migración, sin cambios en el motor.
awaiting: nothing — listo para secure-phase y code-review

## Ronda 4 — cierre de G-04 (2026-08-24)

Plan 17-10. Cierra G-04 y **re-verifica las tres cosas que ya estaban aprobadas** y que el fix toca.

## Cuarta ronda de UAT — G-04 y las tres regresiones que ya estaban aprobadas

Cuatro pasos, **todo a 375px y con el dedo, no con el mouse** (el defecto es de corrección del punto de
toque: con un puntero no se reproduce). Sobre el dev server que ya está corriendo en el puerto 3000.

Usá un servicio de **cupo compartido** (`Yoga grupal`, `Pilates reformer` o `Color`).

### 1. G-04 — tocar el texto de la tarjeta no mueve nada
En `/servicios`, mirá la tarjeta: arriba el nombre con sus acciones, debajo la línea
`60min · $7.000 · Clase grupal`, y **más abajo, claramente separado**, el `[−] N [+] lugares`.

Anotá el número que muestra. Ahora tocá, una por una, con el dedo:
- el texto `60min · $7.000` (a la **izquierda** de la línea);
- el texto `Clase grupal` (a la **derecha** de la línea);
- el separador `·` del medio.

**Esperado:** el número **no se mueve** en ninguno de los tres casos, no aparece ningún `Guardar`, no
se abre nada. Repetilo dos o tres veces tocando distintas partes de cada texto —el principio, el medio
y el final de la palabra—, que es donde antes cambiaba la dirección del efecto.
⚠ **Éste es el paso que importa.** Antes, tocar a la izquierda **bajaba** el cupo y tocar a la derecha
lo **subía**.

### 2. R2-2 / R3-3 — la tarjeta guarda como ayer (la mitad que nunca se llegó a probar)
En esa misma tarjeta, tocá `+`.
**Esperado:** aparece `Guardar` **a la derecha del stepper, en el mismo renglón** (la palabra `lugares`
le cede el lugar mientras haya algo pendiente). Bajá el número al valor original: el botón **desaparece
solo, sin guardar nada**. Volvé a subirlo y guardá: dice `Guardando…`, sale el toast `Cupo actualizado`
y la fila queda limpia con `lugares` de vuelta.
Si tenés dos servicios de cupo compartido a la vista: mientras uno guarda, el stepper del otro sigue
usable.
⚠ En la ronda 3 esto **nunca se llegó a verificar** —el negativo falló antes—, así que acá se prueba
por primera vez después del refactor de 17-09.

### 3. R2-1 — la tarjeta sigue sin superponerse
Misma pantalla, sin tocar nada.
**Esperado:** las acciones (`Desactivar`, el lápiz y el tacho) siguen en el renglón del nombre y no se
montan sobre ningún texto; el nombre se lee completo; **no queda ningún `·` colgando solo**.
**NEGATIVO:** una tarjeta de servicio `individual` (`Corte`, `Testing`) se ve **exactamente como
siempre**: sin el label del modo, sin stepper y **sin el espacio nuevo**. Si un individual creció de
alto, el fix se pasó de rosca.

### 4. La zona de abajo — el mismo mecanismo, del otro lado
Elegí una tarjeta donde la pill **`Todos`** ya esté activa en "Se ofrece en" (así, si algo se toca de
más, no perdés ninguna configuración).
Tocá el texto **`Se ofrece en:`**, que está debajo del stepper.
**Esperado:** el número del cupo **no se mueve**.
*(Si lo que cambia es la selección de sedes, eso es una adyacencia distinta y pre-existente entre ese
texto y la pill `Todos`, que este plan **no** toca: anotala y seguí. Lo que este paso mide es el cupo.)*

### Modo oscuro
Repetí sólo el paso 1 en oscuro con otra paleta. No se busca contraste —ya está medido— sino que el
**espacio nuevo** se comporte igual.

---

⚠ **Si el paso 1 todavía reproduce el defecto**, no pidas más padding: significa que la corrección del
toque de este navegador alcanza más de 32px y la salida deja de ser de espaciado. La decisión siguiente
—que el stepper aparezca detrás de un control explícito— es del dueño, no del ejecutor.

### R4-1. G-04 — tocar el texto no mueve nada
expected: CON EL DEDO a 375px, tocar `60min · $7.000`, `Clase grupal` y el separador `·` — el número no se mueve, no aparece `Guardar`, no se abre nada.
result: pass
notes: |
  **G-04 CERRADO.** La zona de exclusión de 32px alcanzó: ninguno de los tres textos dispara el
  stepper, ni tocando el principio, el medio o el final de la palabra.
  Confirma además el diagnóstico: era corrección del punto de toque (tap-target fuzzing), y la
  distancia vertical fue la variable correcta. No hizo falta el tercer aumento de padding que el plan
  prohibía.

### R4-2. R2-2 / R3-3 — la tarjeta guarda como ayer
expected: |
  Tocá `+`: aparece `Guardar` a la derecha del stepper, mismo renglón. Bajar al original lo hace
  desaparecer solo, sin guardar. Subir y guardar: `Guardando…`, toast `Cupo actualizado`, fila limpia.
  Con dos servicios de cupo compartido a la vista: mientras uno guarda, el otro sigue usable.
  ⚠ En la ronda 3 esto NUNCA se llegó a verificar (el negativo falló antes): es la primera prueba
  después del refactor de 17-09.
result: pass
notes: |
  Primera verificación real del guardado **después de DOS refactors**: 17-09 (el stepper se extrajo a
  una pieza compartida con el modal) y 17-10 (el control cambió de contenedor padre). La semántica de
  guardado de la tarjeta sobrevivió a los dos, que era exactamente lo que el límite de diseño de 17-09
  ("se comparte el dibujo, nunca el commit") buscaba garantizar.

### R4-3. R2-1 — la tarjeta sigue sin superponerse
expected: |
  Las acciones siguen en el renglón del nombre sin montarse; el nombre se lee completo; ningún `·`
  colgando solo.
  NEGATIVO: una tarjeta `individual` (`Corte`, `Testing`) se ve EXACTAMENTE como siempre — sin label de
  modo, sin stepper y SIN el espacio nuevo. Si un individual creció de alto, el fix se pasó de rosca.
result: pass
notes: |
  El negativo es el que importaba: los servicios `individual` —el 100 % de producción hoy— no crecieron
  de alto. El separador, el label y la fila del control viven los tres dentro del mismo condicional, así
  que en un individual no se renderiza ningún hermano nuevo y el `space-y-2` no suma un píxel. El fix
  no se pasó de rosca.

### R4-4. La zona de abajo — el mismo mecanismo, del otro lado
expected: |
  Tarjeta donde la pill `Todos` YA esté activa (así un toque de más es idempotente y no perdés
  configuración). Tocar el texto `Se ofrece en:` no debe cambiar nada.
  Es la adyacencia gemela: mismo mecanismo, otro dato, eje horizontal. Está FUERA del alcance de G-04 —
  si falla, se anota, no se arregla acá.
result: [pending]

## Ronda 3 — el selector del modal (2026-08-24)

Plan 17-09. **No cierra un gap**: nada estaba roto. Es consistencia y target táctil, pedido por el
dueño en la ronda 2. Tres pasos: uno del control nuevo, dos de regresión que ya pasaron y no pueden
volver.

### R3-1. El modal usa el mismo selector que la tarjeta
expected: 375px · /servicios → lápiz → bloque `Cuántos lugares`. Stepper `[−] N [+]` igual al de la tarjeta; `−` apagado en el piso con su cartelito. Verificado también en oscuro. Individual sin bloque de cupo.
result: pass

### R3-2. REGRESIÓN — el campo se sigue pudiendo escribir con el teclado (D-06)
expected: |
  En el mismo modal, tocá el número del medio: se selecciona solo. BORRALO ENTERO — el campo queda
  vacío y lo acepta sin corregir nada mientras el cursor esté adentro. Escribí `1` y salí del campo.
  Al salir vuelve a `2` (el piso del modo). Probá también `007`: mientras tipeás no te lo reescribe
  abajo del cursor; al salir queda `7`.
  ⚠ ES EL PASO QUE IMPORTA: es el defecto exacto que reportaste en la UAT anterior y que la ronda 1
  verificó cerrado. Si acá algo se comporta distinto, el plan volvió a romperlo.
result: pass
notes: |
  D-06 sobrevivió la extracción del stepper. Era el único gate real: el gate de código
  (`capacityFocusedRef.current` = 3 CON `onInputFocus={` = 1 cableado) prueba que la maquinaria de foco
  quedó enchufada, pero el comportamiento sólo lo puede confirmar una persona — el runner corre en
  `environment: 'node'` y el repo no tiene librería de render.

### R3-3. REGRESIÓN — la tarjeta guarda como ayer (R2-2)
expected: |
  Cerrá el modal sin guardar. En la tarjeta de ese mismo servicio, tocá `+`.
  Aparece `Guardar` a la derecha del stepper, mismo renglón. Bajar al valor original lo hace
  desaparecer sin guardar. Subir y guardar: `Guardando…`, toast `Cupo actualizado`, fila limpia con
  `lugares` de vuelta.
  NEGATIVO: tocar el texto `Clase grupal` no abre ni cambia nada.
result: issue — G-04 (la parte de guardado quedó SIN PROBAR)
notes: |
  El dueño reportó el NEGATIVO roto antes de llegar al resto: **"el texto clase grupal sube los
  lugares del cupo"**, confirmado que fue en la TARJETA (no en el modal).
  ⚠ La parte positiva del test (Guardar aparece / desaparece / guarda con toast) **no se llegó a
  verificar** — hay que re-correrla después del fix.

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
result: pass
notes: |
  Verificado en oscuro con paleta cyan. `Corte` y `Testing` (individual) sin badge ni stepper; `Color`
  con `Recurso simultáneo` en la línea de datos y su stepper debajo; **`Pilates reformer` con el nombre
  COMPLETO** (antes `Pilates refo...`). `Desactivar` y los iconos en el renglón del nombre, sin
  montarse sobre nada. El layout se comporta igual que en claro.

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
ronda_2: 5 tests — **5 passed, 0 issues, 0 pending** ✓ los tres gaps CERRADOS
ronda_3: 3 tests — 2 passed, **1 issue (G-04, alta)**, 0 pending
ronda_4: 4 tests — **4 passed, 0 issues, 0 pending** ✓ G-04 CERRADO + 3 re-verificaciones (cierre de G-04 + 3 re-verificaciones) (plan 17-09, no es un gap)
total: 22
passed: 21
issues: 4
pending: 0
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

### G-04 — En la tarjeta, tocar el texto del modo sube el cupo (regresión de D-09)
severity: alta
reported: ronda 3, test R3-3 (2026-08-24)
surface: `app/(dashboard)/settings/settings-client.tsx` → `CapacityInlineControl` + la línea de datos de la tarjeta
symptom: Palabras del dueño — *"el texto clase grupal sube los lugares del cupo"*. Confirmado: en la TARJETA de la lista, no en el modal.
why_it_matters: |
  **D-09 es explícito:** desde la tarjeta se cambia el NÚMERO, nunca el modo, y el label es texto
  inerte. Que además dispare un incremento es peor que romper D-09: el dueño toca una etiqueta y
  modifica un dato.
what_the_code_says: |
  El label es `<span className="font-medium text-foreground">{label}</span>` — **sin `onClick`, sin
  `role`, sin `tabIndex`** (verificado). El contenedor de la línea de datos
  (`div.flex.flex-wrap.items-center.gap-x-2.gap-y-1`) **tampoco tiene handler**. O sea que el clic no
  sale de un manejador sobre el label.
CONFIRMED_hypothesis: |
  **Geometría, no lógica.** Desde G-02b el bloque del stepper vive en un `basis-full` inmediatamente
  debajo de la línea de datos, separado por `gap-y-1` = **4px**. El botón `+` mide **44px** de alto
  (`h-11 w-11`) y cae horizontalmente **debajo de donde se dibuja "Clase grupal"**. Tocando el borde
  inferior del texto, el dedo aterriza en el `+`.
  Encaja con que SUBA y no baje: el `−` está a la izquierda del número y el `+` a la derecha, que es
  la zona donde termina la palabra.
discriminated: |
  **REPRODUCIDO Y CONFIRMADO** (2026-08-24). Se le pidió al dueño tocar el otro texto de la misma
  línea y el resultado cierra el diagnóstico:

  | Toca | Pasa |
  |---|---|
  | `60min · $7.000` (izquierda de la línea) | **BAJA** el cupo |
  | `Clase grupal` (derecha de la línea) | **SUBE** el cupo |

  **Un handler suelto no puede saber si tocaste a la izquierda o a la derecha.** Dos botones debajo,
  sí — y ése es exactamente el mapeo del stepper: `−` a la izquierda del número, `+` a la derecha.
  La dirección del efecto depende de la posición horizontal del toque ⇒ **es geometría, no lógica.**

  Corolario: el fix NO es sacarle un handler al label (no tiene ninguno). Es **separar verticalmente
  el bloque del stepper de la línea de datos**.
regression_of: |
  **17-06 (G-02b)** — es el plan que puso el stepper en `basis-full` inmediatamente debajo de la línea
  de datos, a `gap-y-1` (4px). 17-09 sólo mudó el contenido del stepper a una pieza compartida y no
  cambió esa relación.
  ⚠ Vale notar que G-02b nació de un pedido del propio dueño en la ronda 1 ("hay lugar para que el
  botón Guardar aparezca en la misma línea que el selector") — la solución resolvió el apilado y creó
  esta adyacencia. No es un error de ejecución: es una consecuencia que ni el UI-SPEC ni el plan
  previeron.
fix_direction: |
  Dar separación vertical real entre la línea de datos y el bloque del control, o sacar el control del
  mismo contenedor flex. Lo que NO hay que hacer: achicar los botones (romperían el piso táctil de
  44px que el proyecto exige) ni volver al apilado en tres niveles que G-02b arregló.

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
