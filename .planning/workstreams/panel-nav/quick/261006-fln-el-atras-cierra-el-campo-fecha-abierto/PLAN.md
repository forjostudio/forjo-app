---
quick_id: 261006-fln
slug: el-atras-cierra-el-campo-fecha-abierto
date: 2026-10-06
type: quick
surface: el campo Fecha de los dos formularios de alta
files_modified:
  - components/dashboard/nuevo-turno-form.tsx
  - components/dashboard/nuevo-abono-form.tsx
---

# El atrás cierra el campo Fecha abierto

Último de la tanda del gesto "atrás para cerrar cosas". Ya está resuelto para **diálogos**, **drawers**
(quick `260928-seo`) y **selectores** (quick `261006-dzr`, UAT pasada). Falta el calendario.

## Por qué éste es distinto de los otros tres

Los tres anteriores se arreglaron **en un componente compartido** de `components/ui/`, así que un
wrapper cubría todas las instancias. El calendario **no tiene componente propio**: es estado local de
cada formulario — `const [dateOpen, setDateOpen] = useState(false)`
(`nuevo-turno-form.tsx:254` y su gemelo en `nuevo-abono-form.tsx`) con un `<button>` que togglea y una
expansión **en el lugar**, no un portal.

⇒ Son **dos cableados**, uno por formulario. Y por eso quedó fuera del alcance del quick anterior.

## Task 1 — Que el calendario participe del historial

- Enganchar `useOverlayHistory` (de `lib/overlay-history.ts`) al estado `dateOpen` de **los dos**
  formularios, igual que lo consumen los wrappers de `Dialog` y `Drawer`. Mirá cómo lo hace
  `components/ui/dialog.tsx` — ése es el molde.
- ⚠ **El hook sólo participa si el overlay es CONTROLADO** (`open !== undefined && dismiss !== undefined`).
  Acá `dateOpen` ya es estado explícito, así que sale natural — a diferencia del `Select`, que no lo era.
- ⚠ **Anidamiento con lo que ya hay:** el calendario vive **dentro** del drawer/diálogo del alta. El
  atrás tiene que cerrar **el calendario** y dejar el formulario abierto. El módulo ya resuelve LIFO
  (id monotónico + hash por profundidad) — **verificalo, no lo supongas**.
- ⚠ **Elegir una fecha cierra el calendario**: ese cierre tiene que **consumir** su entrada, o queda un
  atrás muerto (apretar atrás y que no pase nada visible). Es el defecto que ya se pagó antes.
- ⚠ **El cruce con la ventana de gracia del teclado.** El quick `261005-x91` hace que el atrás con el
  teclado abierto se **absorba** durante 300ms después de que baja. Tocar el botón de Fecha desenfoca
  lo que estabas escribiendo ⇒ baja el teclado ⇒ arranca la gracia. **Es el mismo cruce que el quick
  del `Select` midió y declaró**: costo máximo un atrás muerto. Medilo y decí si acá es igual o peor.
- **Cero cambio visual**: el botón, el `aria-expanded` y la expansión quedan como están.

## Prohibiciones

- **No** toques `lib/overlay-history.ts` (está verificado en celular y lo comparten 39+ overlays).
- **No** conviertas el calendario en un portal ni en un componente nuevo: es una expansión en el lugar
  y así se queda.
- **Cero paquetes nuevos**, **cero migraciones** (siguen **41**).
- ⚠ **Otro ejecutor trabaja en paralelo** sobre `agenda-client.tsx`, `unsaved-changes-guard.tsx` y
  `lib/panel-history.ts` (quick `261006-flm`). **No toques ninguno de esos.**

## Verificación

- `./node_modules/.bin/tsc --noEmit` — ⚠ **nunca `npx tsc`**. Buscá `error TS` en la SALIDA, filtrando
  `^\.next/`.
- `npx vitest run` — piso **1534 passed / 102 archivos**. ⚠ **Dos canarios de reloj fallan a propósito
  fuera de `[01:00, 23:30]` AR** y lo anuncian: **mirá el reloj** antes de culpar a tu cambio.
- `./node_modules/.bin/eslint <archivos>` → 0 problemas nuevos.
- Tests con el molde de `test/overlay-history.test.ts` (entorno `node`, historial falso, **sin jsdom ni
  Testing Library**): calendario abierto ⇒ el atrás lo cierra y el formulario queda · elegir fecha ⇒ no
  deja entrada huérfana.
- ⚠ Hay un **dev server en el puerto 80** que el dueño usa. **NO lo mates.** Corre desacoplado de la
  sesión.

## UAT (celular)

1. "Nuevo turno" → abrir **Fecha** → **atrás** ⇒ cierra el **calendario**, el formulario queda.
2. Abrir Fecha y **elegir un día** → después atrás ⇒ cierra el formulario de una, sin un atrás muerto.
3. Escribir el nombre del cliente y **enseguida** tocar Fecha → atrás ⇒ ver si cierra el calendario o
   se come el gesto (es el cruce con la gracia del teclado).
4. Lo mismo en **"Nuevo abono"**.
