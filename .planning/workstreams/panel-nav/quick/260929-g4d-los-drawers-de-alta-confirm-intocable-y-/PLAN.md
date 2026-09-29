---
quick_id: 260929-g4d
slug: los-drawers-de-alta-confirm-intocable-y-
date: 2026-09-29
type: quick
surface: panel — los dos formularios de alta + los chips del manager de categorías
files_modified:
  - components/dashboard/nuevo-turno-form.tsx
  - components/dashboard/nuevo-abono-form.tsx
  - components/dashboard/categorias-manager.tsx
---

# Los drawers de alta: el confirm intocable, y los chips que se salen de la caja

Las dos cosas salieron de la **UAT en celular real** del quick `260928-seo` (2026-09-29). Ninguna es
regresión de aquel arreglo: se verificó que sus commits tocaron sólo `lib/overlay-history.ts`,
`lib/panel-draft.ts`, los tests y los dos wrappers de `components/ui/` — **nunca** estos archivos.

---

## Problema 1 — El "¿Descartar?" del drawer no se puede tocar

**Lo que reportó el dueño:** con el drawer de alta abierto y datos cargados, al salir aparece el
diálogo de descarte, pero **no se puede tocar**. En el de abono, nunca. En el de turno, después de
mandar el navegador al fondo y volver. Lo que se toca son los elementos del drawer de abajo.

**Causa, medida:** el `<Dialog open={discardOpen}>` es **hermano** del drawer
(`nuevo-turno-form.tsx:145`, `nuevo-abono-form.tsx:156`) y base-ui lo portalea a `document.body`.
vaul monta el drawer en **modo modal**: marca inerte y bloquea los pointer-events de todo lo que está
**fuera de su subárbol del DOM**. El confirm queda visible pero muerto.

⚠ **Este bug ya estaba documentado en el repo** — el encabezado de `components/ui/drawer.tsx` lo
explica para los popups de `Select`, y existe un `DrawerPortalContainerContext` que lo resuelve
montando el popup ADENTRO del drawer. **El único consumidor es `components/ui/select.tsx:81`.**

### La salida elegida: no hacer que el anidamiento funcione — sacarlo

Se podría montar el confirm en el contenedor del drawer y listo. **No es lo que se va a hacer**, por
dos razones:

1. **CLAUDE.md prohíbe anidar modales.** Parchear el portal deja el anidamiento en pie y sólo tapa su
   síntoma más visible.
2. **Ya existe el patrón correcto en el repo, y el dueño pidió exactamente ése**: los tres diálogos de
   edición de Ajustes (servicio, sede, profesional) usan `guardDraftOnDismiss`
   (`lib/panel-draft.ts:119`), que **no abre ningún segundo modal**: veta el cierre y avisa.

### El modelo que queda (y por qué la ✕ es la pieza que lo cierra)

En el patrón de Ajustes la guarda mira **exactamente** los motivos accidentales
(`outside-press`, `escape-key`, `history-back`) y **deja pasar la ✕** (`close-press`). O sea: la ✕
**es** la salida deliberada. Por eso la ✕ que pidió el dueño no es decoración — es lo que hace que el
modelo cierre, y sin ella el formulario sucio no tendría cómo descartarse.

- Cierre **accidental** (click afuera · Escape · atrás del celular · arrastrar el drawer) con el form
  sucio ⇒ **no cierra**, avisa.
- **✕** ⇒ cierra y descarta, siempre.
- Form **limpio** ⇒ todo cierra sin fricción, igual que hoy (incluido arrastrar).

⚠ **Decisión que el plan tiene que tomar y dejar escrita:** vaul **no entrega motivo de cierre**
(`onOpenChange?: (open: boolean) => void`, verificado en `vaul/dist/index.d.ts` durante el quick
anterior), así que **arrastrar hacia abajo y tocar el fondo llegan iguales**. No se pueden separar.
La propuesta es tratar **todo cierre originado por vaul como accidental** y dejar la ✕ como única
salida deliberada — con el form limpio no molesta a nadie, porque la guarda sólo muerde si hay datos.
Si el ejecutor encuentra que vaul sí los distingue, que lo mida y lo diga.

⚠ **Desktop también cambia, y es intencional.** El shell de escritorio es un `<Dialog>` y hoy abre el
mismo confirm anidado. Pasa al mismo modelo, porque el dueño pidió que la protección sea **igual** a
la de editar servicio. No se deja un dialecto por viewport.

### Tareas

**Task 1 — Portar la guarda a los dos formularios de alta.**

- Sacar el `<Dialog open={discardOpen}>` de `nuevo-turno-form.tsx` y `nuevo-abono-form.tsx`, con su
  estado (`discardOpen`, `confirmDiscard`) y lo que quede huérfano.
- El cierre accidental con `dirtyRef.current === true` **veta y avisa**. El aviso copia el molde de
  Ajustes: `toast.warning(...)` **más** la región viva `sr-only` **adentro** del overlay
  (`settings-client.tsx:1575-1583`). ⚠ Los dos canales son necesarios y está escrito por qué en
  `lib/panel-draft.ts`: el `aria-live` del toast vive fuera del portal y el modal lo marca `inert`,
  así que el toast se ve pero **no se anuncia**.
- Reusar las constantes de copy que ya existen (`UNSAVED_CHANGES_MESSAGE` / `_HINT` / `_ANNOUNCE`) en
  vez de inventar texto nuevo. Si no encajan para "turno"/"abono", decirlo y proponer.
- En el shell **Dialog** (desktop) usar `guardDraftOnDismiss` tal cual. En el shell **Drawer** hace
  falta una adaptación, **no un import**: vaul no da motivo. Que el ejecutor decida dónde vive esa
  adaptación y lo justifique — si es reusable, `lib/panel-draft.ts` es el lugar natural.

**Task 2 — La ✕ en los dos drawers.**

- Espejar **exactamente** la ✕ del `DialogContent` (`components/ui/dialog.tsx:111-121`):
  `<Button variant="ghost" size="icon-sm" className="absolute top-2 right-2">` + `<XIcon />` +
  `<span className="sr-only">Close</span>`.
- El `DrawerHeader` necesita `pr-8` para que el título no pase por debajo de la ✕ — es la misma nota
  que ya está escrita para el diálogo de servicio en `settings-client.tsx:3283-3284`.
- La ✕ cierra **sin** pasar por la guarda (es la salida deliberada).
- **No** sacar el arrastre para cerrar de vaul: el dueño dijo explícitamente que el drawer le gusta.
- Touch target **mínimo 44×44** (regla de CLAUDE.md). Si `size="icon-sm"` no llega, ampliá el área
  táctil sin cambiar el tamaño visual del icono, y dejá dicho cómo.

**Verify:** `./node_modules/.bin/tsc --noEmit` · `npm run lint` · `npx vitest run` (piso **1392
passed / 98 archivos**) · `npm run build`.

---

## Problema 2 — Los chips de servicio se salen de la tarjeta

**Lo que reportó el dueño:** en `/servicios`, en "Categorías del catálogo", un chip con un nombre muy
largo se pasa del borde derecho de la caja. Con captura a 375px.

**Causa, medida:** el span del chip tiene `whitespace-nowrap` **sin ancho máximo ni truncado**
(`categorias-manager.tsx:146`), y como es un item de un `flex flex-wrap` (`:894`) su
`min-width: auto` le impide encoger por debajo del contenido.

⚠ **Es el mismo servicio larguísimo que ya rompió una tarjeta en la UAT de v0.29.** Allá se arreglaron
las tarjetas del catálogo público con `break-words`; **los chips del panel quedaron afuera**.

**Task 3 — Que el chip no se pase.**

- `min-w-0` + `max-w-full` en el item/botón y truncado en el span. `truncate` de Tailwind ya incluye
  `whitespace-nowrap`, así que **no** hay que dejar el nowrap duplicado.
- ⚠ **No romper el arrastre**: el chip es origen y destino de drag (`:99-102`). Cambiar su caja no
  puede alterar los handlers ni el `GripVertical`.
- El nombre completo tiene que seguir siendo accesible (`title` o `aria-label`) si se trunca
  visualmente: un chip que dice "Supercalifragilistico Espiali…" y nada más no sirve para elegir.

**Verify:** medir a **375px** que ningún chip excede el ancho de su tarjeta. ⚠ Chrome headless
**ignora `--window-size` con `--dump-dom`** (trampa documentada): hay que montar la sonda en un
iframe del ancho pedido. Más `tsc`, `lint` y la suite.

---

## Prohibiciones (las dos mitades)

- **Cero migraciones** (siguen **41**) · **cero paquetes nuevos**.
- **No** tocar `lib/overlay-history.ts` ni `components/ui/drawer.tsx`/`dialog.tsx` salvo que el
  ejecutor demuestre que hace falta: el arreglo del back se verificó en celular y no se toca.
- **No** convertir el drawer en modal: el dueño eligió conservarlo.
- **No** cambiar el layout ni el flujo de los formularios de alta más allá de lo dicho acá.
- ⚠ **Nunca `npx tsc`** (sale 0 falsamente). Va `./node_modules/.bin/tsc --noEmit`, buscando
  `error TS` en la SALIDA.
- ⚠ Dos **canarios de reloj** fallan a propósito fuera de `[01:00, 23:30]` AR: mirar la hora antes de
  culpar al cambio.

## UAT (en el celular, que es donde apareció)

1. Alta de **turno**: cargar algo → tocar el fondo → **no cierra**, avisa. → arrastrar hacia abajo →
   **no cierra**, avisa. → atrás del celular → **no cierra**, avisa.
2. Con lo mismo cargado → **✕** → cierra y descarta.
3. Form **vacío** → tocar el fondo, arrastrar y atrás → cierra sin fricción las tres veces.
4. Lo mismo en el alta de **abono** (es el que estaba peor).
5. **Desktop**: el mismo modelo en el `<Dialog>`; ya no aparece ningún "¿Descartar?" anidado.
6. `/servicios` → "Categorías del catálogo" → el chip largo **no** se pasa de la tarjeta, y se puede
   arrastrar igual que antes.
