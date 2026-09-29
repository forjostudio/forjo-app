---
quick_id: 260929-g4d
slug: los-drawers-de-alta-confirm-intocable-y-
date: 2026-09-29
status: complete
uat: PASS (celular real, 2026-09-29)
commits:
  - 1e3b56f
  - 7958dbd
---

# Los drawers de alta: el confirm intocable, y los chips que se salen

Las dos cosas salieron de la **UAT en celular real** del quick `260928-seo`. Ninguna era regresión de
aquel arreglo: se verificó que sus commits no tocaron estos archivos.

## Problema 1 — el "¿Descartar?" del drawer no se podía tocar

**Causa:** el `<Dialog>` de descarte era **hermano** del drawer y base-ui lo portalea a
`document.body`; vaul monta el drawer en modo modal y marca inerte todo lo que está fuera de su
subárbol. El confirm quedaba visible pero muerto. Es el mismo bug que el repo ya tenía documentado
para los popups de `Select` en `components/ui/drawer.tsx`.

**Salida:** no se hizo funcionar el anidamiento — **se sacó**. CLAUDE.md prohíbe modales anidados, y
el repo ya tenía el patrón correcto (`guardDraftOnDismiss`, los tres diálogos de Ajustes).

**El modelo que quedó**, idéntico en los dos formularios y en los dos viewports:
- Cierre **accidental** (click afuera · Escape · atrás del celular · arrastrar) con datos ⇒ **no
  cierra**, avisa por dos canales (`toast.warning` + región viva `sr-only` **adentro** del overlay —
  los dos hacen falta: el `aria-live` del toast vive fuera del portal y el modal lo marca `inert`).
- **✕** y **"Cancelar"** ⇒ cierran y descartan siempre.
- Form limpio ⇒ todo cierra sin fricción, arrastre incluido.

⚠ **Desktop también cambió**, a propósito: el `<Dialog>` de escritorio adoptó el mismo modelo. El
dueño pidió que la protección fuera *igual* a la de editar servicio; dejar un dialecto por viewport
era volver al problema.

## ⚠ El hallazgo que no estaba previsto: vetar el arrastre no alcanzaba

`vaul@1.1.2` no entrega motivo de cierre (`onOpenChange?: (open: boolean) => void`), así que todo
cierre suyo se trata como accidental. Pero además: **vaul escribe un `transform` inline mientras
arrastrás y sólo lo resetea si soltás SIN cruzar el umbral.** Si lo cruzás y nosotros vetamos, el
drawer **quedaba clavado a media pantalla**. Hizo falta `resetDrawerDrag(node)` en
`components/ui/drawer.tsx` (aditivo), que espeja el reset privado de vaul con sus mismos valores de
transición.

## Problema 2 — los chips se salían de la tarjeta

**Causa:** el span del chip tenía `whitespace-nowrap` sin ancho máximo ni truncado, y como item de un
`flex flex-wrap` su `min-width: auto` le impedía encoger. Es el mismo servicio larguísimo que ya había
roto una tarjeta en la UAT de v0.29 — allá se arreglaron las tarjetas del catálogo, los chips del
panel quedaron afuera.

**Arreglo:** `min-w-0 max-w-full` en la cadena de contenedores, el nombre en **su propio span** con
`truncate` (`text-overflow` no actúa sobre hijos de un contenedor flex, por eso necesita nodo propio),
y `shrink-0` en el asidero de arrastre. El drag no se tocó. El nombre completo sigue accesible por
`aria-label`, `title` y el diálogo "Mover…".

**Medido a 375px** con la sonda en un iframe (⚠ Chrome headless ignora `--window-size` con
`--dump-dom`): desborde **+85px → −9px**.

## Desvíos del plan, todos con motivo

1. **`px-8` en el `DrawerHeader`, no `pr-8`**: el título del drawer va centrado, y despejar un solo
   lado lo corría 8px del centro.
2. **"Cancelar" pasó a ser salida deliberada**, además de la ✕: sin eso quedaba inutilizable justo
   cuando se usa (con datos cargados).
3. **Se tocó `components/ui/drawer.tsx`** (aditivo) y `settings-client.tsx` (imports), fuera del
   `files_modified`: motivos en el hallazgo de arriba y en el punto de la copy.
4. **Copy nueva**: `UNSAVED_CHANGES_HINT` dice "Guardá para conservarlos", que en un alta no tiene
   sentido (no hay nada guardado y el botón dice "Agregar turno"). Se agregó `UNSAVED_NEW_HINT`.
   `MESSAGE` y `TOAST_ID` se reusan verbatim: una sola voz, un solo toast vivo.

## Verificación (medida por el orquestador, no tomada del reporte)

- `./node_modules/.bin/tsc --noEmit` → **0** `error TS`.
- `npx vitest run` → **1395 passed / 98 archivos** (piso 1392 + 3 tests nuevos de `panel-draft`).
- `npm run build` → verde. Migraciones **41**, cero paquetes nuevos.
- ⚠ `npm run lint` da **rc=1** en el repo entero: es **deuda preexistente** de las reglas nuevas de
  `react-hooks`. Medido archivo por archivo: los 5 tocados dan **0 problemas**, y
  `settings-client.tsx` da **11 antes y 11 después** del cambio. Cero agregados.

## UAT — PASS (celular real, 2026-09-29)

El dueño probó los 5 recorridos, incluido el del arrastre con datos cargados (el que ejercita el
rebote nuevo) y el del alta de abono, que era el que estaba peor. **Todo pasó.**
