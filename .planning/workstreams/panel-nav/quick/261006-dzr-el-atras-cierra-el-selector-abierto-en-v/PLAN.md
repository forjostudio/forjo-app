---
quick_id: 261006-dzr
slug: el-atras-cierra-el-selector-abierto-en-v
date: 2026-10-06
type: quick
surface: el wrapper de Select (alcanza a los 23 de la app)
files_modified:
  - components/ui/select.tsx
  - test/overlay-history.test.ts
---

# El atrás cierra el selector abierto, no el drawer

Pedido del dueño en la UAT: *"el gesto hacia atrás para los selectores de servicio y profesional. Es
un gesto común el atrás para cerrar cosas."*

Hoy, con un `Select` abierto, el atrás **se salta el selector** y actúa sobre el overlay de abajo. Es
el mismo hueco que Bug A cerró para diálogos y drawers, con el `Select` afuera.

## Lo medido (no lo re-descubras)

- **Sólo `dialog.tsx` y `drawer.tsx` usan `useOverlayHistory`.** El `Select` nunca se enganchó.
- ⚠ **`components/ui/select.tsx:10` es `const Select = SelectPrimitive.Root`** — un **re-export
  directo**, no un wrapper. No hay dónde colgar un hook: hay que convertirlo en wrapper, con la misma
  forma que ya tienen `Dialog` y `Drawer`.
- `SelectRoot` **sí** acepta `open` y `onOpenChange(open, eventDetails)`
  (`node_modules/@base-ui/react/esm/select/root/SelectRoot.d.ts:73,81`), o sea que es enganchable
  igual que el `Dialog`.
- ⚠ **Los 23 `<Select>` de la app son NO CONTROLADOS**: ninguno pasa `open` (medido, 0 de 23). Usan
  sólo `value` + `onValueChange`.

## ⚠ La diferencia que define el trabajo

`useOverlayHistory` hoy sólo participa si el overlay es **controlado**
(`participates = open !== undefined && dismiss !== undefined`). Con los 23 sin controlar, enganchar el
hook tal cual **no haría nada**.

⇒ El wrapper tiene que **manejar él mismo el estado de apertura** y seguir aceptando que el caller no
lo pase. **La API externa no cambia: ninguno de los 23 call sites se toca.**

- Si el caller **sí** pasa `open`/`onOpenChange` (hoy ninguno, pero el tipo lo permite), el wrapper
  tiene que respetarlo y no pisarlo. Resolvelo bien, no asumas que nunca pasa.
- ⚠ **Riesgo real a medir:** pasar de no-controlado a controlado puede cambiar comportamiento sutil de
  base-ui (animaciones de cierre, `onOpenChangeComplete`, el foco al cerrar, la selección por teclado).
  **Los `Select` están en TODA la app, no sólo en los drawers** — 23 instancias, también en desktop.
  Medí que no se degrade nada, y si algo cambia, decilo.

## Task 1 — El `Select` participa del historial

- Convertir el re-export en un wrapper con la misma forma que `components/ui/dialog.tsx` (mirá cómo
  está escrito ahí: props del primitivo + el hook, con el comentario explicando el porqué).
- Enganchar `useOverlayHistory` para que **el atrás cierre el selector y no toque lo de abajo**.
- ⚠ **El anidamiento ya está resuelto en el módulo** (LIFO, id monotónico por instancia, hash por
  profundidad): un `Select` abierto **dentro** de un drawer tiene que cerrarse él y dejar el drawer
  abierto. Es exactamente el caso que `overlay-history.ts` documenta. Verificalo, no lo supongas.
- ⚠ **No rompas la convivencia con el teclado:** el quick `261005-x91` hizo que el atrás con el
  teclado abierto se **absorba** (no cierra nada). Un `Select` abierto no tiene teclado, así que no
  debería cruzarse — **pero medí el caso de abrir un `Select` justo después de tipear**, que es donde
  la ventana de gracia de 300ms podría comerse el gesto.
- ⚠ `select.tsx` ya consume `useDrawerPortalContainer` (`:7`) para montarse **dentro** del subárbol del
  drawer. No toques eso: es el arreglo de v0.24 que hace que las opciones sean clickeables en mobile.

**Tests:** ampliar `test/overlay-history.test.ts` (entorno `node`, historial falso, **sin jsdom ni
Testing Library**). Casos mínimos: selector solo ⇒ el atrás lo cierra · selector **dentro** de un
drawer ⇒ cierra el selector y el drawer **queda** · cerrar el selector eligiendo una opción ⇒ no deja
entrada huérfana (no hace falta apretar atrás dos veces).

## Fuera de alcance, anotado

- **El campo Fecha** (`dateOpen` en `nuevo-turno-form.tsx:254` y su gemelo en abonos) también se abre
  y cierra, y el mismo gesto aplicaría. Pero es **estado local de cada formulario**, no un componente
  compartido ⇒ es otra forma de trabajo y otra decisión. El dueño está avisado.
- El combobox de cliente: no tiene estado de apertura propio, no aplica.

## Prohibiciones

- **No** cambies la API externa del `Select`: los 23 call sites quedan **sin tocar**.
- **No** toques `useDrawerPortalContainer` ni el portal del `SelectContent`.
- **No** toques `lib/panel-history.ts`, `unsaved-changes-guard.tsx` ni `resetDrawerDrag`.
- **Cero paquetes nuevos**, **cero migraciones** (siguen **41**), **cero cambio visual**.

## Verificación

- `./node_modules/.bin/tsc --noEmit` — ⚠ **nunca `npx tsc`** (sale 0 falsamente). Buscá `error TS` en
  la SALIDA, filtrando `^\.next/`.
- `npx vitest run` — piso **1516 passed / 102 archivos** más tus casos. ⚠ **Dos canarios de reloj
  fallan a propósito fuera de `[01:00, 23:30]` AR** y lo anuncian en su propio mensaje: **mirá el
  reloj** antes de culpar a tu cambio.
- `./node_modules/.bin/eslint <archivos>` → 0 problemas nuevos.
- Medí que los 23 `Select` siguen funcionando igual: abrir, elegir con el dedo, elegir con teclado,
  cerrar con Escape, cerrar tocando afuera. **En los drawers y en desktop.**
- ⚠ Hay un **dev server en el puerto 80** que el dueño usa. **NO lo mates.**

## UAT (celular)

1. "Nuevo turno" → abrir **Servicio** → **atrás** ⇒ se cierra el **selector**, el drawer **queda**.
2. Lo mismo con **Profesional** y **Consultorio**.
3. Con el selector cerrado, atrás ⇒ cierra el drawer (o avisa si hay datos).
4. Abrir un selector y **elegir una opción** → después atrás ⇒ cierra el drawer de una, sin un atrás
   muerto en el medio.
5. Un `Select` **fuera** de un drawer (Agenda: "Duración del turno") → atrás ⇒ cierra el selector, no
   navega.
6. Lo mismo en **"Nuevo abono"**.
