---
quick_id: 261005-vuy
slug: el-drawer-queda-clavado-cuando-se-baja-e
date: 2026-10-05
type: quick
surface: el wrapper de Drawer (alcanza a los 4) + la posición del toaster en mobile
files_modified:
  - components/ui/drawer.tsx
  - app/layout.tsx
---

# El drawer queda clavado cuando se baja el teclado

Encontrado en la **UAT en celular real** (2026-10-05). El dueño queda **encerrado** en el drawer de
alta de turno: no puede llegar a la ✕, y el aviso que le dice *"cerrá con la ✕ para descartarlo"* le
señala justo la salida que no alcanza.

**Causa raíz medida** (sesión completa en `.planning/debug/drawer-no-vuelve-al-bajar-teclado.md`), es
un **AND de dos condiciones** — ninguna alcanza sola:

**(1) vaul 1.1.2 no tiene camino de limpieza incondicional.** Todo su manejo de teclado está detrás
de una sola guarda (`node_modules/vaul/dist/index.mjs:1117`):
`if (isInput(focusedElement) || keyboardIsOpen.current)`. Con las dos en false **no hace nada**, ni
para poner ni para sacar. Y `keyboardIsOpen` es un **TOGGLE, no un set** (`:1131-1133`): cualquier
paso de viewport `> 60px` con el teclado abierto **lo deja invertido**. En Android lo dispara el swap
QWERTY↔numérico (el flujo real: cliente primero, hora después), la barra de sugerencias, o la barra
de URL de Chrome. **Barrido medido del umbral: 59px recupera, 61px queda clavado** — el borde cae
exacto en el `> 60` literal.

**(2) `components/ui/time-field.tsx:275` hace `input.blur()`** al confirmar con Enter. Verificado: es
el **único `.blur()` de toda la app**. Por eso, cuando llega el resize del cierre, no hay input con
foco y la guarda de (1) no entra.

⇒ `height` y `bottom` inline quedan con los valores del teclado abierto. Medido en el estado clavado:
`height: 658.391px; bottom: 240px`, el drawer en `top: -75.4`, **240px en blanco abajo**, y la ✕ en
`top: -66.4` ⇒ fuera de pantalla **por arriba**.

⚠ **Scrollear no la recupera**, y eso también está medido: la ✕ es `absolute` sobre el
`DrawerContent`, **fuera** del `overflow-y-auto`. Cuando el scroller llega a `scrollTop 0`, el
siguiente gesto hacia abajo es —correctamente— un arrastre de cierre; el veto lo frena, avisa, y
`resetDrawerDrag` lo devuelve **a su posición rota**. Eso es el "salta y vuelve".

## Descartado con evidencia — no vayas por ahí

- **`resetDrawerDrag` NO es el culpable.** En el estado clavado, *antes de cualquier gesto*, el
  `transform` está vacío y el drawer ya está desplazado. Además sólo escribe `transform`/`transition`,
  nunca `height`/`bottom`.
- **`repositionInputs` está bien** (default `true`, el repo no lo pisa) y vaul **sí** reacciona al
  abrir. El problema no es que no reaccione: es que **no deshace**.
- **El scroller está bien cableado** (`nuevo-turno-form.tsx:223`): medido `scrollHeight 750` >
  `clientHeight 581`. Vaul **no** está confundiendo scroll con arrastre.

## Task 1 — Backstop de limpieza en el wrapper

En `components/ui/drawer.tsx`: un listener de `visualViewport.resize` que, **cuando el teclado ya está
totalmente abajo**, saca los estilos inline que vaul dejó clavados.

- Condición de "teclado abajo": `visualViewport.height >= window.innerHeight - 1` (el `-1` absorbe el
  redondeo). **Sólo ahí** se limpia — con el teclado arriba no se toca nada, porque ahí el
  posicionamiento de vaul es correcto y necesario.
- Sacar **`height` y `bottom`** del nodo del `DrawerContent` (`removeProperty`, no setear a `''`
  desde una lectura). Con el teclado abajo el estado correcto es el del CSS (`h-auto` +
  `max-h-[80vh]`).
- ⚠ **Nunca tocar `transform`**: eso es del gesto de arrastre y lo maneja `resetDrawerDrag`. Pisarlo
  rompería el rebote del veto.
- Va en el **wrapper** porque: cubre los **4 drawers** de una, es el mismo lugar donde ya vive
  `resetDrawerDrag` limpiando estado huérfano de vaul, y no ata un componente de `components/ui` a
  otro.
- Dejá escrito el **porqué** con las dos condiciones del AND y las líneas de vaul: el próximo que lea
  esto tiene que entender que estamos pisando estado ajeno **a propósito y acotado**, y que si vaul
  arregla el toggle esto pasa a ser no-op.

**Validado en runtime por el diagnóstico** (contra el bug real, sin escribir al repo):
con el arreglo y teclado **abierto** no interfiere (el campo Hora sigue visible sobre el teclado); con
el teclado **cerrado** recupera (`top=164.6`, `gapBelow=0`, ✕ alcanzable); y el **segundo ciclo** de
teclado abre y cierra bien.

## Task 2 — El toaster en mobile

`app/layout.tsx:65` usa `position="top-right"` **sin variante mobile**. A 412px el toast es una franja
casi de ancho completo pegada arriba.

⚠ **Esto es un papercut preexistente, NO la causa del solape** (eso era la geometría rota del drawer).
Entra igual porque **lo pide la guía del propio proyecto**: *"Notificaciones/toasts: posición
top-right desktop / top-center mobile"*.

- Aplicá esa regla. Si `sonner` no permite una posición responsiva por prop, resolvelo por CSS sin
  duplicar el `<Toaster>`, y decí cómo.
- **No** toques duración, estilos ni el `UNSAVED_CHANGES_TOAST_ID` (el id fijo es lo que hace que
  sonner actualice en el lugar en vez de apilar).

## Prohibiciones

- **No** parchees ni actualices `vaul` (1.1.2 es la última 1.x; mantener un patch es otra decisión).
- **No** revertas el `blur()` de `time-field.tsx`: resolvió un reclamo real del dueño y el bug no es
  suyo. ⚠ Si lo tocás, volvés a traer el teclado tapando media pantalla.
- **No** toques `resetDrawerDrag`, `lib/panel-draft.ts`, `overlay-history.ts` ni `panel-history.ts`.
- **Cero paquetes nuevos**, **cero migraciones** (siguen **41**).

## Verificación

- `./node_modules/.bin/tsc --noEmit` — ⚠ **nunca `npx tsc`** (sale 0 falsamente). Buscá `error TS` en
  la SALIDA, filtrando `^\.next/`.
- `npx vitest run` — piso **1515 passed / 102 archivos**. ⚠ Dos canarios de reloj fallan a propósito
  fuera de `[01:00, 23:30]` AR.
- `./node_modules/.bin/eslint <archivos>` → 0 problemas **nuevos**.
- **Reproducí el bug y el arreglo** sintetizando el resize de `visualViewport` (que es exactamente lo
  que vaul lee, `index.mjs:1119`/`:1163`): override del getter de `height` + `dispatchEvent('resize')`.
  Hay sondas reusables en `…/scratchpad/probe/`. Medí **antes y después**: `gapBelow` y si la ✕ es
  alcanzable.
- ⚠ Hay un **dev server en el puerto 80** que el dueño usa. **NO lo mates.**

## UAT (celular — los DOS drawers)

1. `/appointments` → "Nuevo turno" → elegí un cliente **escribiendo** (teclado QWERTY) → después tocá
   **Hora** (teclado numérico) → **OK** ⇒ el teclado baja **y el drawer vuelve a su lugar**, sin
   espacio en blanco abajo.
2. La **✕** se ve y se toca.
3. Scrollear dentro del drawer no dispara el aviso.
4. Repetí el ciclo de teclado dos veces seguidas.
5. **Lo mismo en "Nuevo abono"**, que tiene el shell idéntico.
6. El aviso de cambios sin guardar aparece centrado arriba y se lee entero.
