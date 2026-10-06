---
quick_id: 261005-x91
slug: apagar-el-manejo-de-teclado-de-vaul-y-qu
date: 2026-10-05
type: quick
surface: el wrapper de Drawer (alcanza a los 4)
files_modified:
  - components/ui/drawer.tsx
  - lib/overlay-history.ts
  - test/overlay-history.test.ts
---

# Apagar el manejo de teclado de vaul, y que el atrás cierre el teclado y no el drawer

Tercera ronda sobre el mismo drawer. **Cambio de estrategia, decidido por el dueño:** dejamos de
parchear síntomas y apagamos la función rota en el origen.

## Por qué cambiamos de estrategia

Tres rondas, tres manifestaciones del **mismo** bug de `vaul@1.1.2`:
1. Quick `260929-g4d` — el rebote del arrastre vetado.
2. Quick `261005-vuy` — el drawer clavado **después** de bajar el teclado.
3. **Ahora** — el drawer mal calculado **con el teclado todavía arriba** (captura del dueño en
   `/agenda#modal`, campo Notas enfocado, teclado abierto, medio drawer en blanco).

La raíz, ya medida en `.planning/debug/drawer-no-vuelve-al-bajar-teclado.md`:
`node_modules/vaul/dist/index.mjs:1131-1133` usa un **toggle** (`keyboardIsOpen.current =
!keyboardIsOpen.current`) en vez de un set, así que cualquier paso de viewport `>60px` lo invierte. Y
`:1117` pone **todo** su manejo de teclado detrás de una guarda que con la bandera invertida no entra.

El backstop del quick anterior sólo cubre "teclado ya abajo". La manifestación 3 ocurre con el teclado
**arriba**, donde el backstop no interviene a propósito. **Cada parche cubre un caso y aparece el
siguiente.**

## Task 1 — `repositionInputs={false}`

En `components/ui/drawer.tsx`, pasarle `repositionInputs={false}` al `DrawerPrimitive.Root`.

**Qué hace:** `index.mjs:1115` → `if (!drawerRef.current || !repositionInputs) return`. Con la prop en
false **el bloque entero no corre nunca**: vaul deja de escribir `height` y `bottom`, y el toggle roto
deja de importar. Es una prop pública (`index.d.ts:96`), default `true`, que el repo **no pisaba**.

**Qué pasa en su lugar:** el navegador scrollea el campo enfocado a la vista dentro del
`overflow-y-auto` que el shell ya tiene. El drawer conserva su `max-h-[80vh]` del CSS.

⚠ **El riesgo a MEDIR, que es la razón de ser de este task:** que al enfocar un campo del fondo del
formulario (Notas, o el checkbox de avisar por mail) **quede tapado por el teclado**. Medilo en los
dos drawers y con los campos de abajo de todo, no sólo con los de arriba. **Si queda tapado, decilo
en vez de maquillarlo** — la prop se revierte con un carácter y pasamos al plan B (parchear vaul).

⚠ **Segundo efecto, no obvio:** `repositionInputs` aparece también en `index.mjs:940`, dentro del
`isDisabled` del scroll-lock. Apagarla **también** cambia eso. Averiguá qué hace esa rama y verificá
que no rompa el bloqueo de scroll del fondo con el drawer abierto.

**Y decidí qué pasa con el backstop del quick `261005-vuy`** (el listener de `visualViewport` que
limpia `height`/`bottom`): si vaul ya no los escribe, su segunda guarda lo vuelve un **no-op
permanente**. Dejar código muerto es una deuda; borrarlo pierde la red si alguien vuelve a prender la
prop. **Elegí y justificá**, y si lo dejás, que el comentario diga que ahora es una red de la red.

## Task 2 — El atrás tiene que cerrar el teclado, no el drawer

**Lo que reportó el dueño:** escribiendo el nombre del cliente, aprieta **atrás para bajar el
teclado** —gesto habitual en Android— y **se le cierra el drawer**.

Eso es **nuestro**, no de vaul: `lib/overlay-history.ts` escucha `popstate` y pide el cierre. En
Android la convención del sistema es que el atrás con el teclado abierto **cierra el teclado y nada
más**.

- **Primero medí si `popstate` llega.** Es la pregunta que decide el arreglo. Si llega: absorberlo
  cuando el teclado está abierto (no cerrar, **re-empujar** la entrada — el módulo ya sabe hacerlo
  cuando un cierre se veta). Si **no** llega, el cierre viene de otro lado y **todo este task cambia**:
  decilo y pará.
- **Cómo saber si el teclado está abierto:** `window.visualViewport.height < window.innerHeight - <umbral>`.
  Elegí el umbral y justificalo. ⚠ Tiene que haber una **ventana de gracia** después de que el teclado
  baja: si el usuario aprieta atrás justo cuando terminó de bajar, sigue siendo "quise cerrar el
  teclado".
- ⚠ **No rompas el caso bueno:** con el teclado cerrado, el atrás **tiene que seguir cerrando el
  overlay** (es el arreglo de Bug A, verificado en celular y con 27 tests). Y con un borrador sucio
  tiene que seguir **avisando y no cerrando**.
- `lib/overlay-history.ts` era intocable **sólo dentro del alcance de la Phase 1**. Esta es una tarea
  aparte y el dueño pidió el arreglo: se puede tocar, con sus tests al día.

**Tests:** espejá el molde de `test/overlay-history.test.ts` (entorno `node`, historial falso, **sin
jsdom ni Testing Library** — no agregues ninguno). Casos mínimos: teclado abierto ⇒ no cierra y
re-empuja · teclado cerrado ⇒ cierra como siempre · borrador sucio ⇒ sigue avisando · la ventana de
gracia.

## ⚠ El límite que hay que declarar, no esquivar

**El teclado de software de Android no se puede emular.** Lo que sí se puede sintetizar es el resize
de `visualViewport`, que es lo que lee tanto vaul como nuestro código. Medí con eso y **decí
claramente qué quedó sin verificar**.

Si no podés determinar si `popstate` llega en el celular real, **proponé una instrumentación que el
dueño pueda leer en su teléfono** (por ejemplo un panel de debug detrás de un flag, que muestre los
eventos de `popstate`, la altura del viewport y el elemento con foco). Es un bug que sólo existe en
hardware real: medirlo ahí es legítimo y es mejor que adivinar.

## Prohibiciones

- **No** parchees ni actualices `vaul` — es el plan B si el Task 1 falla, y es decisión del dueño.
- **No** agregues `clientSearch` a `isDirty` de `nuevo-turno-form.tsx`. Decidido: **buscar no es
  trabajo que valga proteger**, y contarlo haría que tipear tres letras pida confirmación al salir.
- **No** toques `lib/panel-history.ts`, `unsaved-changes-guard.tsx` ni `resetDrawerDrag`.
- **Cero paquetes nuevos**, **cero migraciones** (siguen **41**), cero cambio visual.

## Verificación

- `./node_modules/.bin/tsc --noEmit` — ⚠ **nunca `npx tsc`** (sale 0 falsamente). Buscá `error TS` en
  la SALIDA, filtrando `^\.next/`.
- `npx vitest run` — piso **1515 passed / 102 archivos** más tus casos. ⚠ Dos canarios de reloj fallan
  a propósito fuera de `[01:00, 23:30]` AR: **mirá el reloj** antes de culpar a tu cambio.
- `./node_modules/.bin/eslint <archivos>` → 0 problemas nuevos.
- **Medí en los dos drawers** (turno y abono) y con los campos del **fondo** del formulario: que al
  enfocarlos no queden tapados por el teclado. Hay sondas reusables en `…/scratchpad/probe/`.
- ⚠ Hay un **dev server en el puerto 80** que el dueño usa. **NO lo mates.**

## UAT (celular, los dos drawers)

1. Abrir "Nuevo turno" → tocar el nombre → **atrás** ⇒ se cierra **el teclado**, el drawer **queda**.
2. Repetir con algo escrito ⇒ igual: el drawer queda.
3. Con el teclado **cerrado**, atrás ⇒ cierra el drawer (o avisa, si hay datos cargados).
4. Abrir y cerrar el teclado **dos o tres veces** seguidas ⇒ el drawer nunca queda desplazado ni con
   espacio en blanco.
5. Enfocar **Notas** y el checkbox de avisar por mail ⇒ se ven, no quedan tapados por el teclado.
6. Lo mismo en **"Nuevo abono"**.
