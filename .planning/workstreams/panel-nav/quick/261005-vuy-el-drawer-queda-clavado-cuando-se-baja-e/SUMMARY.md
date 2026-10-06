---
quick_id: 261005-vuy
slug: el-drawer-queda-clavado-cuando-se-baja-e
date: 2026-10-05
status: complete
uat: PENDIENTE (celular del dueno, los DOS drawers)
commits:
  - e4cfe4a
  - 962dd6d
plan_head_before: ec477ddb7761604787e751ce5cb0eceb77a049d1
actuals:
  commits: 2
  tasks: 2
key-files:
  modified:
    - components/ui/drawer.tsx
    - app/layout.tsx
    - app/globals.css
---

# El drawer queda clavado cuando se baja el teclado

Dos arreglos independientes, un commit cada uno. La causa raiz ya venia medida de la sesion de
debug (`.planning/debug/drawer-no-vuelve-al-bajar-teclado.md`): **no se re-investigo**, se uso. Lo
que se midio en este quick es el **arreglo** sobre la app real, antes y despues, con las mismas
sondas de esa sesion.

---

## Task 1 - Backstop de limpieza en el wrapper de Drawer (`e4cfe4a`)

### Como quedo la condicion de limpieza

Un listener de `visualViewport.resize` en `DrawerContent` (`components/ui/drawer.tsx`), enganchado al
**nodo** del contenido, con tres guardas en este orden:

1. `if (vv.height < window.innerHeight - 1) return` -> el teclado todavia esta arriba: **territorio
   de vaul, no se toca nada**. El `-1` absorbe el redondeo del browser.
2. `if (!node.style.height && !node.style.bottom) return` -> vaul no dejo nada clavado: no-op, no se
   escribe en el DOM en cada resize (barra de URL, rotacion). Si vaul algun dia arregla el toggle,
   el backstop entero cae por esta guarda.
3. `removeProperty('height')` + `removeProperty('bottom')`. **Nunca** `transform`: eso es del gesto
   de arrastre y lo maneja `resetDrawerDrag` (romperia el rebote del veto de `260929-g4d`).

`removeProperty` y no "setear el valor correcto": con el teclado abajo el estado correcto es el del
CSS (`h-auto` + `max-h-[80vh]`), asi que lo unico que hay que hacer es **sacar** el inline.

### Por que no interfiere con el teclado abierto

Dos razones, las dos verificadas:

- **Por construccion:** la primera guarda sale antes de tocar el nodo mientras el viewport este
  encogido. El unico trabajo util que hace vaul aca es justamente ese reposicionamiento.
- **Medido** (un solo paso de teclado de 300px sobre un drawer sano, sonda 14):

| | con el teclado ARRIBA |
|---|---|
| inline que escribio vaul | `height: 497px; bottom: 300px` -> **intactos** |
| caja del drawer | `26..523` = exactamente el visual viewport (`vvh 523`) |
| campo Hora tras el scroll de foco del browser | `top 297`, **visible sobre el teclado** |

El `height: 497px` sale de la cuenta propia de vaul (`vv 523 - WINDOW_TOP_OFFSET 26`), no de nosotros.

### Medicion antes / despues

App real, 412x823, el flujo del dueno: QWERTY 320 -> numerico 240 -> Enter (blurea) -> teclado abajo.

| | ANTES | DESPUES |
|---|---|---|
| `top` del drawer | **-75.4** (fuera de pantalla por arriba) | **164.6** (su lugar) |
| hueco abajo (`gapBelow`) | **240px** | **0** |
| la X alcanzable | **false** (`top -66.4`) | **true** |
| inline que quedo | `height: 658.391px; bottom: 240px` | `-` / `-` (limpio) |
| `transform` | `-` (vacio, nunca se toco) | `-` (vacio, nunca se toco) |
| **2do ciclo de teclado** | **CLAVADO**, hueco **300px** | **RECUPERADO**, `top 164.6`, hueco **0** |

### El otro drawer tambien, medido

El arreglo vive en el wrapper, asi que cubre los 4 drawers del panel. Se midio explicitamente el de
**"Nuevo abono"** (`/abonos`, shell identico y el mismo `TimeField`), misma secuencia:

| | resultado |
|---|---|
| teclado ABIERTO | `top -75.4`, inline `h 658.391px / bottom 240px` (vaul, sin interferencia) |
| teclado CERRADO | **RECUPERADO** `top=164.6` `gapBelow=0` **X alcanzable** inline `-` / `-` |

### Lo que NO se toco (estaba descartado con evidencia en el debug)

`resetDrawerDrag`, el `blur()` de `time-field.tsx:275`, `vaul` (ni patch ni update), el cableado del
scroller, `lib/panel-draft.ts`, `overlay-history.ts`, `panel-history.ts`.

---

## Task 2 - El toaster responsivo (`962dd6d`)

### Como se resolvio

`position` de sonner es **una prop de render**: no puede ser responsiva por media query, y duplicar
el `<Toaster>` montaria dos viewports (los toasts saldrian en los dos, o habria que elegir destino
en cada `toast()`). Asi que: **un solo `<Toaster>`**, se declara el valor **mobile-first** en
`app/layout.tsx` (`position="top-center"`) y el **desktop** se corrige por CSS en `app/globals.css`:

```css
@media (min-width: 768px) {
  [data-sonner-toaster][data-x-position="center"][data-y-position="top"] {
    left: auto; right: var(--offset-right); transform: none;
  }
}
```

Dos detalles que **no** son cosmeticos:

- **Especificidad, no orden.** sonner inyecta su CSS con `head.appendChild(<style>)` en tiempo de
  modulo (`dist/index.mjs:2-9`), o sea **despues** de nuestra hoja: en un empate gana el. La regla a
  vencer (`[data-sonner-toaster][data-x-position=center]`) es `0,2,0`, asi que el selector suma el
  `[data-y-position]` y queda en `0,3,0`. Gana venga antes o despues en la cascada.
- **`swipeDirections={["top","right"]}` explicito.** sonner las deriva de `position`
  (`getDefaultSwipeDirections`, `index.mjs:429`): con `top-center` se habria perdido **en silencio**
  el descarte por swipe a la derecha que hay hoy. Declarado, el gesto queda igual que antes en todos
  los anchos.

No se toco duracion, estilos, `richColors` ni el id fijo del toast.

### Medicion antes / despues (el aviso real de cambios sin guardar)

| ancho | ANTES | DESPUES |
|---|---|---|
| **412** (celular) | `x=16 w=380` centrado, `rightGap 16` | `x=16 w=380` centrado, `rightGap 16` -> **identico** |
| **700** (mobile del proyecto) | `x=320 w=356` **pegado a la derecha** (`rightGap 24`) | `x=172 w=356` **CENTRADO** |
| **1280** (desktop) | `x=900 w=356` `rightGap 24` | `x=900 w=356` `rightGap 24` -> **identico** |

### Hallazgo: a 412px no habia nada que arreglar

Medido: **la media query propia de sonner (`max-width: 600px`) ya estira el toaster a todo el ancho
entre sus `--mobile-offset-*`, sea cual sea la posicion declarada**, asi que en un celular el toast
ya era una banda centrada de ancho casi completo (`x=16 w=380` de 412). El `position="top-right"`
no se notaba ahi.

Donde **si** se violaba la guia era en **601-767px**, que es mobile para el proyecto (breakpoint
768) y queda fuera del rango de sonner: ahi el toast era una caja de 356px pegada a la derecha.
Eso es lo que cambio. En 412 y en 1280 la geometria quedo **bit a bit igual que antes**, o sea cero
riesgo de regresion visual en los dos anchos que se usan de verdad.

Lo que si cambia en el celular, aunque no se vea: `data-x-position` pasa de `right` a `center`, que
es lo que hace que la intencion quede declarada en el codigo y no dependa de un detalle interno del
paquete.

---

## Verificacion (salida real)

- `./node_modules/.bin/tsc --noEmit` -> **exit 0, 0 lineas de salida**, **0 ocurrencias de
  `error TS`** (filtrando `^\.next/`). Corrido con el binario local, nunca `npx tsc`.
- `npx vitest run` -> **Test Files 102 passed (102)** | **Tests 1515 passed | 4 expected fail |
  1 skipped (1520)**. Es exactamente el piso. Corrido 23:06 y 23:09 AR, dentro de
  `[01:00, 23:30]`, asi que los dos canarios de reloj no aplican.
- `./node_modules/.bin/eslint components/ui/drawer.tsx app/layout.tsx` -> **exit 0, cero problemas**.
  (`app/globals.css` no lo cubre eslint.)
- **Cero paquetes nuevos.** `package.json` sin tocar.
- **Cero migraciones**: siguen **41** archivos en `supabase/migrations/`.
- Cero archivos borrados por los dos commits (`git diff --diff-filter=D ec477dd..HEAD` vacio).
- Las sondas usaron CDP en el 9333 y Chrome headless con perfil propio; **el dev server del puerto
  80 quedo vivo** (verificado al final: responde 307 en `/appointments`).

## Desvios

1. **Las sondas pegaron contra el dev server del puerto 80 en vez de levantar uno aparte.** Motivo:
   todo el harness de la sesion de debug (`probe/boot.cjs`, `lib-login.cjs`) y la linea de base
   medida estan fijados a `http://localhost`, y los numeros de "antes" solo son comparables contra
   el mismo servidor. **No se lo mato ni se lo reinicio**: las sondas solo navegan y leen. Efecto
   lateral: el servidor recompilo con HMR, que es justo lo que hace falta para que la UAT del dueno
   vea el arreglo. Verificado vivo al cierre.
2. **Task 2 resulto mas chico de lo que el plan asumia en mobile** (ver "Hallazgo" arriba): a 412px
   no habia nada que corregir porque sonner ya centra la banda por su cuenta. Se aplico igual la
   regla de la guia y se gano la banda 601-767. Queda documentado con numeros para que nadie
   "re-arregle" los 412px despues.
3. **Se agrego una prop que el plan no pedia** (`swipeDirections`). Motivo medido en el codigo de
   sonner: sin ella, cambiar `position` habria borrado un gesto de descarte existente. Es
   preservacion, no feature.

## Lo que la UAT tiene que mirar (no la corri)

1. `/appointments` -> "Nuevo turno" -> cliente **escribiendo** (QWERTY) -> **Hora** (numerico) ->
   **OK**: el teclado baja **y el drawer vuelve**, sin hueco abajo.
2. La **X** se ve y se toca.
3. Scrollear dentro del drawer no dispara el aviso.
4. El ciclo de teclado dos veces seguidas.
5. **Lo mismo en "Nuevo abono"**.
6. El aviso de cambios sin guardar, centrado arriba y legible entero.

## Self-Check: PASSED

- `components/ui/drawer.tsx`, `app/layout.tsx`, `app/globals.css`: existen en disco y estan en los
  commits.
- `e4cfe4a` y `962dd6d`: existen en el historial (`git log`).
- SUMMARY.md: escrito en el directorio del quick.
- Cero borrados de archivos en el rango del quick.
