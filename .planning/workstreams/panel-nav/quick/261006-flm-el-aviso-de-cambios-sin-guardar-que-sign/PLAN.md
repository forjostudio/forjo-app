---
quick_id: 261006-flm
slug: el-aviso-de-cambios-sin-guardar-que-sign
date: 2026-10-06
type: quick
requirements: [NAV-09, NAV-10, NAV-11]
surface: el aviso de cambios sin guardar (Agenda + /web) y su guard
files_modified:
  - app/(dashboard)/agenda/agenda-client.tsx
  - components/dashboard/unsaved-changes-guard.tsx
  - lib/dirty-history.ts
  - test/dirty-history.test.ts
---

# Que "cambios sin guardar" signifique distinto de verdad, y que el atrás frene

El dueño pidió que **el atrás lo frene** cuando hay horarios sin guardar. Es viable —el diagnóstico
está en `.planning/debug/interceptar-atras-aviso-sin-guardar.md`— pero **hay que hacerlo en orden**, y
ese orden es lo que define este plan.

## ⚠ Por qué NAV-09 va PRIMERO, y no es negociable

`hoursDirty` es un **latch por gesto**, no una comparación: lo prenden **ocho** call sites
(`agenda-client.tsx`, `setHoursDirty(true)`), y uno de ellos es **abrir o cerrar un día**. El propio
código lo dice (`:389-392`): *"prender un chip y volver a apagarlo deja la bandera encendida, así que
el aviso puede aparecer aunque el estado final sea idéntico al que había"*.

Hoy casi no molesta porque sólo salta al clickear un link. **Con el atrás interceptado saltaría en
cada gesto reflejo**: desplegás el Lunes para mirar a qué hora abrís, volvés, y te pide confirmación.
Medido en el diagnóstico: dos backs seguidos, dos diálogos.

⇒ **Si NAV-10 entra sin NAV-09, el arreglo es peor que el bug.**

NAV-09 además arregla algo que **ya está mal hoy**: el aviso actual miente.

## Task 1 — NAV-09: sucio = distinto del baseline

- Capturar el estado inicial de los horarios al cargarlos y comparar contra él, en vez de contar
  gestos. Los ocho `setHoursDirty(true)` se van.
- ⚠ **La comparación tiene que ser del MODELO, no del render**: el orden de los bloques, los
  `service_ids`, los días habilitados. Dos estados equivalentes pero con las listas en otro orden
  **no** son un cambio. Decidí cómo normalizás y dejalo escrito.
- ⚠ **El baseline se re-captura al guardar** (`saveHours`), que hoy es el único que apaga la bandera.
  Y al cambiar de sucursal (`activeLoc`) **ojo**: el editor muestra otra cosa; decidí si eso re-captura
  o si el baseline es por sucursal, y justificalo.
- **Extraé la comparación a una función pura y testeala.** Es el corazón de los tres requisitos.
- El indicador visual que ya existe al lado de Guardar no cambia de lugar ni de copy: cambia **cuándo**
  aparece.

**Verify:** casos puros — sin tocar nada ⇒ limpio · tocar y deshacer ⇒ **limpio** (es el caso que hoy
falla) · abrir/cerrar un día ⇒ **limpio** · cambio real ⇒ sucio · guardar ⇒ limpio.

## Task 2 — NAV-10: el atrás avisa

Sólo después de que el Task 1 esté verde.

- `lib/dirty-history.ts` nuevo, **calcado de `lib/overlay-history.ts`**: marca propia, predicado,
  acción por render, acción al desmontar, `popstateAction`. Decisiones **puras** y testeadas; el efecto
  de React no decide nada.
- **Cuándo se empuja la entrada:** en la transición **limpio→sucio**. Con NAV-09 eso ocurre **una vez**
  y por un cambio real. El efecto que ya existe (`useUnsavedChanges`) corre justo en esas transiciones.
- **Al limpiarse (guardado):** consumir la entrada, como hace `overlay-history` al cerrar.
- ⚠ **MARCA NUEVA OBLIGATORIA.** Las dos que existen tienen dueño: `frjOverlay`
  (`overlay-history.ts:93-95`) y `frjView` (`panel-history.ts:165-167`). **Reusar cualquiera es el peor
  error posible**: el otro módulo reconocería la entrada como propia y haría su `back()` ⇒ doble
  consumo ⇒ el dueño fuera del sitio.
- ⚠ **Antes de cada `back()`, re-verificar la marca.** El `replace` del sidebar
  (`sidebar.tsx:152`) pasa por `completeSoftNavigation`, que setea `preserveCustomHistoryState: false`
  ⇒ **borra nuestras claves**. Es la misma guarda que `overlay-history.ts:333,374` ya tiene, y el
  diagnóstico la midió funcionando.
- ⚠ **Anidado LIFO:** sucio + un overlay abierto ⇒ el atrás cierra **sólo el overlay**; nuestro handler
  ve que la entrada de arriba no es suya y **tiene que ignorar**. Copiá esa regla o el aviso aparece al
  cerrar cada modal.
- ⚠ **El hash no puede ser `#modal` ni `#modal-N`** (colisionaría con `nextOverlayHash`), ni puede
  existir un elemento con ese `id` en la página (scroll parásito).
- ⚠ **Extender la regla 0 de `panel-history.ts`**: `isOverlayOwnedEntry` (`:212-219`) sólo conoce
  `frjOverlay`, así que `applyPanelView` **escribiría encima** de nuestra entrada nueva. Hoy no pasa
  (Agenda no lo llama), **pero la Phase 2 planea cablear el `activeLoc` de Agenda** ⇒ rompe ese día.
  Arreglalo ahora, con el gate que audita el literal duplicado (`panel-history.ts:206-211`).

**Alcance ampliado, declarado:** `web-client.tsx` **también** usa `useUnsavedChanges`, así que
engancharlo en el hook enciende el atrás en `/agenda` **y** en `/web`. **Es deseable y queda dicho**
— el docblock que afirma "hoy lo hace SÓLO Agenda" está desactualizado y hay que corregirlo.

## Task 3 — NAV-11: la continuación respeta la regla de secciones

`confirmLeave()` (`unsaved-changes-guard.tsx:84-92`) hace `router.push` **siempre**, ignorando
`panelNavMode`. **Ya rompe NAV-07 hoy**, sin relación con el atrás.

- Que elija como el sidebar: `panelNavMode({ from, to })`.
- ⚠ Y con nuestra marca arriba, el diagnóstico midió que la continuación correcta es **`replace` sobre
  el sentinel** (medido: destino correcto y **un solo** atrás vuelve a la agenda). Las otras tres
  variantes dejan basura o se pierden —`history.back()` es **asíncrono**, encadenar no funciona—.
- El `popstate` **no trae destino**, así que la forma de "navegación pendiente" necesita una variante
  sin `href`.

## Prohibiciones

- **No** toques `lib/overlay-history.ts` ni `resetDrawerDrag`: están verificados en celular.
- **No** cambies la copy ni la posición del indicador de cambios sin guardar.
- **Cero paquetes nuevos**, **cero migraciones** (siguen **41**), cero cambio visual.
- **No** inventes un `beforeunload`: ya existe (`agenda-client.tsx:401-410`) y **no sirve** acá — el
  atrás es navegación client-side.

## Verificación

- `./node_modules/.bin/tsc --noEmit` — ⚠ **nunca `npx tsc`**. Buscá `error TS` en la SALIDA, filtrando
  `^\.next/`.
- `npx vitest run` — piso **1534 passed / 102 archivos** más tus casos. ⚠ **Dos canarios de reloj
  fallan a propósito fuera de `[01:00, 23:30]` AR** y lo anuncian: **mirá el reloj**.
- `./node_modules/.bin/eslint <archivos>` → 0 problemas nuevos.
- Medí la secuencia completa con el historial sintetizado, como el diagnóstico: sucio + atrás ⇒ avisa
  y **no** sale · decide quedarse ⇒ la entrada **vuelve** · decide salir ⇒ aterriza bien y **sin**
  atrás muerto · guardado ⇒ consume sin aviso espurio · una escritura ajena pisa el state ⇒ **no** se
  hace `back()`.
- ⚠ Hay un **dev server en el puerto 80** que el dueño usa. **NO lo mates.** Corre desacoplado.
- ⚠ **Otro ejecutor trabaja en paralelo** sobre `nuevo-turno-form.tsx` y `nuevo-abono-form.tsx`
  (quick `261006-fln`). **No los toques.**

## UAT (celular)

1. Agenda → **abrir y cerrar un día sin cambiar nada** → atrás ⇒ **sale sin preguntar**. ← NAV-09
2. Cambiar un horario → atrás ⇒ **avisa y no sale**. "Seguir editando" ⇒ sigue ahí, y el atrás vuelve
   a avisar.
3. Lo mismo, pero "Salir sin guardar" ⇒ sale, y **un solo** atrás vuelve a la agenda.
4. Cambiar un horario y **guardar** → atrás ⇒ sale sin preguntar.
5. Con un modal abierto en Agenda y horarios sucios → atrás ⇒ cierra **el modal**, sin aviso.
6. Salir por el **menú** con cambios ⇒ avisa igual que siempre; al confirmar, el atrás cae en el
   **dashboard** (NAV-11).
7. `/web` con el editor sucio → atrás ⇒ avisa.
