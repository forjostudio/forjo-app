---
quick_id: 261006-dzr
slug: el-atras-cierra-el-selector-abierto-en-v
date: 2026-10-06
status: complete
uat: PENDIENTE (celular del dueno, los 6 puntos del PLAN) - medido antes en Chrome headless sobre la app real 65/65
commits:
  - b678d27
  - 9c3c2fc
plan_head_before: 772b0921a90961b4516b0d7e55f5c901b2293e33
actuals:
  commits: 2
  tasks: 1
key-files:
  modified:
    - components/ui/select.tsx
    - test/overlay-history.test.ts
---

# El atras cierra el selector abierto, no el drawer

Un solo Task del plan, dos commits (el wrapper y sus tests). Nada fuera de esos dos archivos: cero
paquetes, cero migraciones (siguen 41), cero cambio de markup/clases, y los 23 call sites de `<Select>`
quedaron SIN TOCAR.

---

## Lo de controlado/no-controlado, sin tocar los call sites (`b678d27`)

`components/ui/select.tsx:10` era `const Select = SelectPrimitive.Root`: un re-export, sin lugar donde
colgar el hook. Ahora es un wrapper con la misma forma que `components/ui/dialog.tsx`.

El nudo: `useOverlayHistory` solo participa si el overlay es controlado
(`participates = open !== undefined && dismiss !== undefined`), y los 23 `<Select>` son no controlados
(0 de 23 pasa `open`). Enganchar el hook tal cual no hubiera hecho nada.

**La salida: el dueno del estado de apertura pasa a ser el wrapper.** `useState(defaultOpen ?? false)`
adentro, y al primitivo se le pasa un `open` SIEMPRE definido. Para el primitivo el Select queda
controlado (y el hook participa); para el caller nada cambio, porque `open` nunca estuvo en su API de
uso. Si el caller SI pasa `open` (hoy ninguno, el tipo lo permite) manda el caller: `controlled` deja
el estado interno dormido y no se pisa el valor de afuera.

Dos detalles que no son cosmeticos:

- **El orden de `handleOpenChange` espeja a `SelectRoot.setOpen`**: `onOpenChange?.(...)` ->
  `if (details.isCanceled) return` -> recien entonces el estado. Al reves, un `cancel()` del caller se
  perderia (en no-controlado el primitivo SI lo respetaba). Hay un test que lo congela.
- **`defaultOpen` se consume en el wrapper y NO se reenvia al primitivo**: con `open` definido el
  primitivo lo ignoraria igual (`useControlled` solo lo usa en la rama no controlada), asi que el unico
  dueno del valor inicial es el estado del wrapper.

### Por que pasar de no-controlado a controlado no degrada el primitivo (leido, no supuesto)

`esm/select/root/SelectRoot.js` resuelve la apertura con
`useControlled({ controlled: openProp, default: defaultOpen })`, y la UNICA diferencia entre las dos
ramas es de donde sale el valor de `open`: `setOpenUnwrapped` es un no-op cuando esta controlado. Todo
lo demas se alimenta del `open` ya resuelto: `useTransitionStatus(open)` (la animacion de cierre),
`useOpenChangeComplete`, el foco, `useDismiss`, `useListNavigation` y `useTypeahead`. Y
`useControlled` fija `isControlled` en una ref del PRIMER render: como aca `open` siempre va definido,
el primitivo nunca ve un cambio de modo y no dispara su warning de dev.

Delta real, chico y declarado: el cierre por atras no pasa por el `setOpen` interno del primitivo
(baja `open` desde afuera, que es el camino controlado normal), asi que se saltea su workaround de
Floating UI que pone tabindex -1 en la opcion activa al cerrar. Ese workaround existe para
`keepMounted=true` al tabular afuera; el `SelectContent` de este repo no usa `keepMounted`.

---

## Que se midio que NO se degrado en los 23 Selects

Chrome 153 headless por CDP (sin paquetes nuevos: node 24 trae `WebSocket` global), contra el dev
server del puerto 80 del dueno (**no se lo mato ni se lo reinicio**; Chrome propio en el puerto 9333,
perfil descartable en el scratchpad), logueado con el negocio de prueba local. **65/65 y cero errores
de consola.**

| Sonda | Donde | Resultado |
|---|---|---|
| A, 19/19 | desktop 1280x900, filtros de `/appointments` | abre con mouse (`mousedown`, que es el evento que usa base-ui), elige una opcion, Escape, tocar afuera, abre Y elige con el teclado (ArrowDown/Enter); el popup cierra con `data-closed` puesto (la animacion de cierre sigue viva); `#modal` se empuja y se consume sin acumular; el atras cierra el selector sin navegar y, con el selector cerrado, el atras vuelve a navegar (`/dashboard`) |
| B, 13/13 | mobile 412x823, drawer de Nuevo turno | el selector abre DENTRO del subarbol del drawer (`drawer.contains(popup) === true`: el fix del portal de v0.24 intacto) y la opcion recibe el puntero donde se ve; hash propio `#modal-2` |
| B4, 8/8 | idem, con el borrador SUCIO | elegir un servicio cierra el selector y consume su entrada; UN solo atras llega al drawer y AVISA (toast + region sr-only), el drawer no se cierra y la entrada VUELVE; la X cierra y limpia |
| C, 13/13 | desktop, barrido `/appointments` `/clients` `/agenda` | abre, empuja `#modal`, Escape cierra y limpia, el atras cierra el selector sin navegar |
| D, 12/12 | desktop, Select dentro del DIALOG de Nuevo turno | el mismo LIFO que en el drawer: el atras cierra el selector y el dialogo QUEDA; el siguiente atras cierra el dialogo con el borrador limpio y AVISA con el borrador sucio |

### El anidamiento, verificado (no supuesto)

Los dos casos medidos (dentro del Drawer y dentro del Dialog) dan lo mismo y por la razon que el modulo
documenta: el selector empuja `#modal-2` encima del `#modal` del overlay de abajo, y al volver atras el
handler del de abajo ve que la entrada que quedo arriba ES LA SUYA (`popstateAction` devuelve ignore),
asi que no se cierra de fantasma. En el historial falso quedan 3 tests nuevos para el mismo escenario.

---

## Los tests (`9c3c2fc`)

11 casos nuevos en `test/overlay-history.test.ts` (35 -> 46 `it`), entorno `node`, historial falso, sin
jsdom ni Testing Library: `montarSelect` reconstruye el wrapper (estado propio + el orden
`onOpenChange` -> `isCanceled` -> estado) y lo enchufa al `montarOverlay` que ya modelaba el hook, que
es el molde que ya tenia la suite.

Cubren: el selector sin `open` del caller igual participa (con la contraprueba del antes) - selector
dentro de un drawer (cierra el, el drawer queda) - elegir una opcion sin dejar entrada huerfana -
Escape y tocar afuera - 23 selectores cerrados son inertes para el historial - `defaultOpen` -
caller controlado - `cancel()` vetando - abrir/cerrar 5 veces sin acumular - la gracia del teclado.

---

## El riesgo del teclado: MEDIDO, con su ventana exacta

El plan pedia medir abrir un `Select` justo despues de tipear. Tocar el trigger del selector desenfoca
el input y BAJA el teclado, lo que arranca la ventana de gracia de 300ms del quick 261005-x91. **Un
atras que caiga dentro de esa ventana se ABSORBE: no cierra el selector.**

No se toco el modulo compartido por eso, y la razon esta medida: el costo maximo es UN atras muerto
(la entrada vuelve, nunca se pierde la pagina), la ventana son 300ms contados desde que el teclado bajo,
y entre tocar el trigger, la animacion de apertura y mirar las opciones no hay gesto humano que entre
ahi (un segundo apreton deliberado no baja de ~400ms, el numero con el que se eligio la gracia).
Queda congelado en un test, con el nombre marcado MEDIDO para que nadie lo arregle sin leer el porque.

---

## Verificacion

- `./node_modules/.bin/tsc --noEmit` -> **exit 0, cero lineas de salida, cero `error TS`**. Importa
  porque el wrapper es un componente generico (`<Value, Multiple>`) y los 23 call sites dependen de que
  la inferencia siga funcionando (`v ?? 'all'`, `v as PlanKey`, `String(...)`): si se hubiera roto,
  tsc lo decia ahi.
- `npx vitest run` -> **102 archivos, 1534 passed, 4 expected fail, 1 skipped**. El piso del plan
  (1516) era viejo: la base real era 1523 y los 11 nuevos dan 1534.
  **Reloj: 10:16 AR**, o sea DENTRO de 01:00-23:30 -> los dos canarios de reloj no aplican a esta
  corrida (los 4 expected fail son `it.fails` preexistentes, ninguno en los archivos tocados).
- `./node_modules/.bin/eslint components/ui/select.tsx test/overlay-history.test.ts` -> **exit 0**.
- Dev server del puerto 80: vivo al terminar (307). El Chrome de las sondas (puerto 9333) se mato por
  linea de comandos, filtrando por su propio `--remote-debugging-port`.

---

## Sin verificar

1. **La UAT en el celular del dueno** (los 6 puntos del plan). Lo medido es Chrome headless con
   emulacion 412x823: el gesto atras se sintetizo con `history.back()`, no con el boton real del
   sistema, y el teclado de software de Android no se emula.
2. **Los `<Select>` de `/finances` y `/settings`** no se ejercitaron de a uno: viven dentro de dialogos
   y pestanas que el barrido no abrio (0 triggers visibles al cargar). El patron que los contiene SI
   esta medido (sonda D: Select dentro de un Dialog).
3. **Cerrar un selector y abrir OTRO en el mismo frame.** `history.back()` es asincronico: si el push
   del segundo le gana a la traversal del primero, el `popstate` diferido puede cerrar el segundo
   selector solo. No se pudo provocar con clicks reales (la traversal tarda unos ms y un gesto humano
   mucho mas) y es un hazard PREEXISTENTE del modulo, igual para dialogos y drawers desde el quick
   260928-seo; no lo introduce este cambio, pero los selectores se abren mas seguido que los dialogos,
   asi que queda anotado.
4. **El `#modal` en la barra de URL del desktop** mientras un selector esta abierto. Es el mismo
   comportamiento que ya tenian los 35 dialogos; no se evaluo si molesta al abrir un filtro.
5. **El campo Fecha (`dateOpen`)**, fuera de alcance por decision del plan: es estado local de cada
   formulario, no un componente compartido.

## Self-Check: PASSED

- `components/ui/select.tsx` existe y contiene el wrapper (verificado con grep).
- `test/overlay-history.test.ts` existe con 46 `it` (35 antes).
- commits `b678d27` y `9c3c2fc` existen en `git log`.
