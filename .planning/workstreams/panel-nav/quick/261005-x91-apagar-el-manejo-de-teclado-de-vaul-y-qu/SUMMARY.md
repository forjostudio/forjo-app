---
quick_id: 261005-x91
slug: apagar-el-manejo-de-teclado-de-vaul-y-qu
date: 2026-10-06
status: complete
uat: PENDIENTE (celular del dueno, los DOS drawers) - el punto 5 de la UAT es el que DECIDE si la prop se queda
commits:
  - 87ac7ba
  - 32cf56c
plan_head_before: d091497327b74fc7094d28407879f4005ea4e54c
actuals:
  commits: 2
  tasks: 2
key-files:
  modified:
    - components/ui/drawer.tsx
    - lib/overlay-history.ts
    - test/overlay-history.test.ts
---

# Apagar el manejo de teclado de vaul, y que el atras cierre el teclado y no el drawer

Dos arreglos independientes, un commit cada uno. La causa raiz venia medida de la sesion de debug
(`.planning/debug/drawer-no-vuelve-al-bajar-teclado.md`): no se re-investigo, se uso. Lo que se midio
en este quick son los DOS arreglos sobre la app real (dev server del puerto 80, Chrome 153 headless,
emulacion mobile 412x823, logueado), con las sondas de esa sesion: 16 (antes), 17/18/19 (despues).

**Hay un resultado que conviene leer antes de nada: los campos del fondo del formulario quedan TAPADOS
por el teclado si Chrome no panea el visual viewport, y eso ultimo no se puede medir aca.** Esta medido
con numeros en "El riesgo del Task 1".

---

## Task 1 - `repositionInputs={false}` (`87ac7ba`)

Una prop en el `DrawerPrimitive.Root` de `components/ui/drawer.tsx`, antes del spread (es un default
nuestro, no una imposicion: un caller puede volver a prenderla).

### Que apaga, leido en el paquete

`node_modules/vaul/dist/index.mjs:1115` abre el listener de teclado con
`if (!drawerRef.current || !repositionInputs) return`. Con la prop en false el bloque **entero** no
corre nunca: vaul no vuelve a escribir `height`/`bottom` inline y su latch roto
(`keyboardIsOpen.current = !keyboardIsOpen.current`, un TOGGLE, :1132) deja de importar porque nadie
lo lee mas.

### Lo medido (sonda 17, los dos drawers)

| escenario | antes (sondas 06/07 de la sesion de debug) | despues |
|---|---|---|
| swap QWERTY 320 -> numerico 240 (delta 80) | `height: 658.391px; bottom: 240px`, drawer top **-75.4**, X en -66.4 **inalcanzable** | inline `-` / `-`, top **164.6**, X en 173.6 visible |
| 3 ciclos de teclado (turno) | quedaba clavado | top 164.6 en los 3, inline siempre `-` |
| 2 ciclos de teclado (abono) | mismo shell, misma exposicion | top 164.6 en los 2, inline siempre `-` |

Las manifestaciones 2 (drawer clavado despues de bajar el teclado) y 3 (drawer mal calculado con el
teclado arriba) **desaparecen**, y no por un parche que las persiga una por una: el codigo que las
producia no corre.

### El riesgo del Task 1, MEDIDO: los campos del fondo quedan tapados

Linea del teclado = 503 (823 - 320 del QWERTY). Scroller interno llevado a su maximo:

| drawer | campo | rect | sobre el teclado? |
|---|---|---|---|
| Turno | Notas | 655..687 | **NO** |
| Turno | checkbox "Avisar al cliente por mail" | 701..717 | **NO** |
| Abono | Hora | 501..533 | **NO** (el borde de arriba llega justo, el campo no) |
| Abono | Sesiones | 642..678 | **NO** |

Y es estructural, no cuestion de scrollear mas: el drawer ocupa 164.6..823, asi que el teclado le tapa
**320px**, y el rango del scroller interno es de **76px** (turno) y **184px** (abono). Nunca alcanza.

Lo que se resigno, en numeros: con vaul prendido el drawer se encogia a **26..503**, entero arriba del
teclado, con un scroller de 400px de alto para 657 de contenido -> **todos** los campos alcanzables.

**Lo que NO se pudo medir, y es lo que decide:** con `interactive-widget=resizes-visual` (el default
que rige en la app, medido en la sesion de debug), al enfocar un campo que el teclado taparia Chrome
**panea el visual viewport**, y el paneo mueve tambien los elementos `position: fixed` -> el drawer
entero se ve subir y el campo queda visible. Ese mecanismo **no se emula**: la sonda sintetiza
`visualViewport.height` (lo que leen vaul y nuestro codigo) pero no el visual viewport real, que es el
que usa el scroll-into-view del browser. Es el **punto 5 de la UAT** y define si la prop se queda.

**Si queda tapado en el celular, el plan B que recomiendo NO es parchear vaul:** es hacer el
reposicionamiento nosotros en el mismo wrapper, deterministico y sin latch -
`inset = innerHeight - vvHeight`; con `inset > umbral`, poner `bottom: inset` y
`height: vvHeight - top`; si no, `removeProperty` de los dos. Son ~15 lineas al lado del backstop que
ya vive ahi, no hay patch de dependencia que mantener, y no tiene el toggle que causo las tres rondas.
Mantener un patch de `vaul` 1.1.2 (ultima 1.x) es mas caro y arregla lo mismo.

### El otro efecto de la prop, el no obvio (`index.mjs:940`)

`usePreventScroll({ isDisabled: ... || !repositionInputs || !disablePreventScroll })`. Con la prop en
false, `isDisabled` es siempre true y ese hook no se activa nunca mas. **No rompe el bloqueo de scroll
del fondo**, por dos razones leidas en el paquete:

1. `usePreventScroll` solo hace algo `if (isIOS())` (:144). En Android y en desktop es un **no-op
   completo**, prendido o apagado.
2. El bloqueo real no depende de el: lo da el `RemoveScroll` de Radix Dialog (vaul monta
   `DialogPrimitive.Overlay` y `@radix-ui/react-dialog` lo envuelve en `react-remove-scroll`) mas
   `usePositionFixed` (:770, `position: fixed` en el body). Ninguno de los dos esta gateado por
   `repositionInputs` (el suyo es `noBodyStyles`, default false).

Lo unico que se pierde, y **solo en iPhone/iPad**, son los refinamientos de
`preventScrollMobileSafari` (overscroll del contenedor y centrado del input al enfocar).
**NO MEDIDO: no hay iOS en el banco de pruebas.**

### Decision sobre el backstop del quick 261005-vuy: SE QUEDA

Con la prop apagada vaul ya no escribe `height`/`bottom`, asi que la segunda guarda del backstop
(`if (!node.style.height && !node.style.bottom) return`) lo vuelve un no-op en el camino normal. Se
deja, y el comentario ahora lo dice: es una **red de la red**. Por que:

- **No es codigo inalcanzable.** `Drawer` es pass-through (`{...props}`) y la prop va **antes** del
  spread: cualquier caller puede volver a prender `repositionInputs` y el backstop vuelve a tener
  trabajo el mismo dia.
- **El plan B lo necesita.** Si los campos del fondo quedan tapados, la primera medida es volver a
  prender la prop. Borrar la red hoy seria borrarla justo antes de necesitarla.
- **Cuesta un listener pasivo** que lee dos strings y sale, y es el unico lugar del repo donde queda
  documentado con numeros el latch roto de vaul.

Si algun dia se borra `repositionInputs={false}` sin borrar el backstop, el drawer sigue cubierto. Si
se borran los dos, vuelve el bug del quick 261005-vuy tal cual.

---

## Task 2 - El atras con el teclado arriba cierra el teclado, no el overlay (`32cf56c`)

### Llega el `popstate`? - lo que se pudo y lo que no

**No se pudo medir directamente** (el teclado de software de Android no se emula; lo sintetizable es el
resize de `visualViewport`). Lo que si se midio es el reparto de culpas, y deja un solo camino posible
(sonda 16, antes de cualquier cambio):

| escenario | resultado medido |
|---|---|
| teclado baja, **sin** popstate, input todavia enfocado | drawer **ABIERTO** y encima recuperado: top 164.6, inline `-`/`-` |
| idem con el paso extra >60px antes de bajar | se ve roto **mientras** el teclado esta arriba (top -75.4) y **recupera** al bajar |
| teclado arriba + `popstate` | drawer **CERRADO**, hash `#modal` -> `""`, **sin ningun aviso** |

La tercera fila es el reporte del dueno palabra por palabra, incluido el detalle de que **no avisa**:
`clientSearch` no cuenta como borrador sucio (decision suya: buscar no es trabajo que valga proteger),
asi que la guarda no veta y el cierre pasa limpio. Y las dos primeras filas descartan la explicacion
alternativa: **bajar el teclado, por si solo, no cierra el drawer ni lo deja pareciendo cerrado.**

Conclusion honesta: **el unico camino medido que produce el sintoma es un `popstate`**. Si el atras del
celular real no lo emitiera, este arreglo es un no-op y el cierre viene de otro lado.

**Como se zanja sin escribir una linea mas de codigo:** el arreglo es su propio discriminador. En la
UAT, si el atras mientras se tipea el nombre **ya no cierra** el drawer -> el `popstate` llegaba y
ahora se absorbe. Si **sigue cerrando** -> no era el `popstate` y el task cambia entero (ahi si vale el
panel de debug detras de un flag: los `popstate`, `visualViewport.height`/`innerHeight` y
`document.activeElement`, leidos en el telefono).

### Como quedo

`popstateAction` gana un tercer resultado, `'absorb'`: ni cerrar ni ignorar. El browser **ya** consumio
la entrada, asi que lo que se hace es **devolverla**, por el mismo `tick` de re-push que usa el veto del
borrador (un solo mecanismo). El segundo back, con el teclado abajo, cierra como siempre. El orden
importa: `topIsOurs` se evalua primero, asi que un pop de limpieza nuestro con el teclado arriba sigue
siendo un no-op y nunca un re-push.

Deteccion por `visualViewport`, con dos constantes justificadas:

- **Umbral 120px** (`SOFT_KEYBOARD_MIN_INSET`). Tiene que caer en la tierra de nadie: **arriba** de lo
  que encoge el viewport sin ser teclado (la barra de URL de Chrome son ~56-72px; vaul usa `> 60` para
  lo mismo) y **abajo** del teclado mas chico medido (240px el keypad numerico, 320 el QWERTY, sobre
  823). 120 es el doble de la banda de la barra y la mitad del teclado mas chico. En desktop el inset
  es 0, asi que fuera de mobile no cambia nada.
- **Gracia 300ms** (`SOFT_KEYBOARD_GRACE_MS`). El atras y el teclado bajando son el **mismo** gesto y
  el orden de los dos eventos no esta garantizado: si el resize que restaura el viewport le gana al
  `popstate`, sin gracia cerrariamos el overlay. La animacion de ocultado del IME de Android es de
  ~250ms, mas un par de frames; y 300 queda por debajo de un segundo apreton deliberado (~400ms), asi
  que "atras, atras" sigue cerrando en el segundo.

Un solo rastreador de `visualViewport` por **documento**, no uno por overlay: con 39 overlays serian 39
listeners midiendo lo mismo, y el dato tiene que sobrevivir a que el overlay de arriba se desmonte
mientras el teclado todavia esta bajando.

### El bug que encontro la medicion (y por eso se midio)

La primera version contaba la gracia desde **"la ultima vez que se vio el teclado arriba"**. Medido en
la sonda 18: con apenas **350ms** de teclado abierto, el back dentro de la ventana **cerraba el drawer
igual**. La razon: el teclado quieto **no emite resizes**, asi que ese timestamp se queda con el
momento en que el teclado se **abrio** - tipeando 5 segundos, la gracia ya estaba vencida antes del
gesto. Se corrigio a la **transicion de bajada** (primer resize sin inset despues de haberlo tenido) y
quedo congelado en el test, con 5 segundos de tipeo adentro, que es la asercion que importa.

### Lo medido despues del arreglo (sondas 18 y 19)

| escenario | turno | abono |
|---|---|---|
| teclado arriba + atras | abierto, hash vuelve a `#modal` | abierto, hash vuelve a `#modal` |
| segundo atras, teclado abajo | cierra, hash `""` | cierra, hash `""` |
| gracia: 2s de teclado, baja y atras en el mismo tick | **abierto** (absorbe) | - |
| 600ms despues del anterior | cierra | - |
| control: sin teclado nunca, primer atras | cierra | - |
| borrador sucio (Notas) + teclado **abajo** | **avisa** "Tenes cambios sin guardar", queda abierto, entrada re-empujada | - |
| borrador sucio + teclado **arriba** | absorbe en silencio: no avisa, no cierra | - |

Las dos ultimas filas son los dos casos buenos que el plan marcaba como intocables: el arreglo de Bug A
(el atras cierra el overlay) y la guarda G-23-25 (el borrador sucio avisa y no cierra). Los dos siguen.

### Tests

8 nuevos en `test/overlay-history.test.ts` (**27 -> 35**), con el molde del archivo: entorno `node`,
historial falso, cero jsdom y cero Testing Library. El viewport falso (`ViewportFalso`) espeja al
rastreador real, incluida la transicion de bajada, y tiene reloj manual para afirmar los bordes de la
gracia sin temporizadores. Casos: absorbe con teclado arriba y la entrada vuelve; el segundo back
cierra; sucio + teclado arriba no avisa; los dos bordes de la gracia (con los 5s de tipeo); el control
de que sin teclado el back sigue cerrando; el umbral contra la barra de URL y los dos teclados medidos;
y que `topIsOurs` le gana al teclado.

---

## Verificacion

```
./node_modules/.bin/tsc --noEmit      -> ninguna linea con "error TS" (filtrando ^\.next/)
./node_modules/.bin/eslint components/ui/drawer.tsx lib/overlay-history.ts test/overlay-history.test.ts
                                      -> 0 problemas (exit 0)
npx vitest run                        -> Test Files 2 failed | 100 passed (102)
                                         Tests 2 failed | 1516 passed | 4 expected fail | 6 skipped
npx vitest run test/overlay-history.test.ts -> 35 passed (35)
```

**Los 2 failed son los dos canarios de reloj**, no una regresion: eran las **00:20 AR**, fuera de la
ventana `[01:00, 23:30]`, y el propio mensaje de cada uno lo dice
(`test/capacity-mode-change-gate.test.ts`, `test/service-delete-gate.test.ts`). La cuenta cierra
exacto contra el piso: 1515 (en ventana) + 8 nuevos - 2 canarios que pasan a fallar - 5 casos que se
saltean fuera de la ventana = **1516**.

Cero paquetes nuevos. Cero migraciones (siguen **41**). Cero cambio visual: no se toco ni una clase ni
un estilo. No se toco `lib/panel-history.ts`, ni `unsaved-changes-guard.tsx`, ni `resetDrawerDrag`, ni
se agrego `clientSearch` a `isDirty`, ni se parcheo/actualizo `vaul`. El dev server del puerto 80 sigue
vivo: las sondas se conectan a el como cliente, desde un Chrome aparte con su propio puerto de debug.

## Lo que queda SIN verificar

1. **Que los campos del fondo (Notas, el checkbox, Hora, Sesiones) queden visibles sobre el teclado en
   el celular real.** Medido que **sin** el paneo del visual viewport quedan tapados; el paneo de
   Chrome no se emula. **Es el punto 5 de la UAT y es el que decide si la prop se queda.**
2. **Que el atras del Android real emita `popstate` con el teclado arriba.** Medido que es el unico
   camino que reproduce el sintoma; no medido que ocurra en el telefono. La UAT (puntos 1 y 2) lo
   zanja: si ya no cierra, llegaba.
3. **iOS.** Apagar la prop deshabilita `usePreventScroll`, que solo actua en iOS. No hay iPhone/iPad en
   el banco de pruebas.
4. **El teclado de software en si.** Todo lo sintetizado es el resize de `visualViewport` (que es lo
   que leen vaul y nuestro codigo), no el IME.
5. La UAT completa del plan: no se corrio (la hace el dueno en su celular, los dos drawers).

## Self-Check: PASSED
