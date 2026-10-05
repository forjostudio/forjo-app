---
quick_id: 261005-pbj
slug: bajar-el-teclado-al-confirmar-la-hora-y-
date: 2026-10-05
status: complete
uat: PENDIENTE (celular del dueno)
commits:
  - c206330
  - 13a9ed3
  - 84fa2a8
plan_head_before: 229110a2d95fc77a1a667ee615777301c066e29b
actuals:
  commits: 3
  tasks: 2
key-files:
  modified:
    - components/ui/time-field.tsx
    - components/ui/time-field.test.tsx
    - components/agenda/block-services-line.tsx
---

# Bajar el teclado al confirmar la hora, y el chip que se salia de la tarjeta

Las dos salieron de la UAT en celular del quick `261005-n41`. Dos arreglos chicos, independientes,
un commit cada uno. Lo unico que no salio como estaba planteado fue **donde** se suelta el foco: el
blur sincrono mata el submit implicito de Enter, y eso se descubrio midiendolo.

---

## A - Enter baja el teclado (`c206330`)

### Lo que se hizo

`commit()` primero, soltar el foco despues. El `blur()` del input es el unico camino: Android
mantiene el teclado abierto mientras el campo tenga el foco y no hay API para cerrarlo.

Para que la segunda confirmacion no cuente, la decision de que emitir salio a una funcion pura,
`decideTimeCommit(draft, value)`, y el borrador pasa a leerse por **ref** (escritura inmediata) en
vez de por estado (escritura diferida al render):

- sin borrador vivo entonces `null` = no emitir. Idempotente por construccion, no por timing.
- `null` y `''` son distintos a proposito: `''` es un valor legitimo que SI hay que emitir.

La tabla de normalizacion no se toco: `normalizeTimeOnBlur` quedo intacta.

### El desvio: el blur sincrono se come el submit del form

El plan pedia verificar los 4 call sites por si alguno estaba dentro de un `<form>`. Medido:
**ninguno de los 4 tiene `<form>`** (agenda, horario especial, alta de turno, alta de abono; el repo
no tiene un `<form>` alrededor de estos campos). O sea que hoy Enter solo confirma.

Pero al medir el caso hipotetico con un `<form>` de prueba alrededor del componente real, aparecio
esto (Chrome headless, keydown + char + keyUp reales por CDP):

| variante del blur | fuera de form: foco | dentro de form: submits |
|---|---|---|
| sin blur (lo de antes) | queda en el campo | **1** |
| sincrono | soltado | **0** |
| microtask | soltado | **0** |
| `requestAnimationFrame` | soltado | **0** |
| `setTimeout(0)` | soltado | **0** |
| **solo si `!input.form`** (elegida) | **soltado** | **1** |

El submit implicito lo dispara el navegador en el evento de **caracter**, posterior al `keydown`: si
el campo ya se blureo, no ocurre. Y diferirlo no lo salva: las cuatro variantes dieron 0. No hay
"momento correcto", hay que **no** soltar el foco cuando el campo vive en un form.

Por eso el codigo quedo con `if (!input.form) input.blur()`. Hoy no cambia nada (ningun call site
tiene form, el teclado baja en los 4) y el dia que alguien ponga un `TimeField` dentro de un form,
Enter seguira enviando igual. Perder un envio en silencio es peor que un teclado que queda abierto,
que al menos se ve.

### Como se probo la idempotencia

Dos instrumentos, porque miden cosas distintas:

1. **La politica, en Vitest** (`components/ui/time-field.test.tsx`, suite 6, 5 casos nuevos):
   `decideTimeCommit` con y sin borrador, el caso "ya es lo que el padre tiene", una simulacion de
   los dos commits del mismo gesto contando emisiones, y `normalizeTimeOnBlur` aplicada dos veces
   sobre su propia salida (punto fijo en los 12 casos de la tabla del dueno).
2. **La mecanica, en un Chrome real**: se monto el `TimeField` REAL en una pagina (bundle con el
   esbuild del repo), se tipeo por CDP y se mando Enter de verdad. Resultados:

| caso | activeElement despues | valor | `onValueChange` |
|---|---|---|---|
| `930` con el arreglo | `BODY` (foco soltado) | `09:30` | **1** |
| `9` con el arreglo | `BODY` | `09:00` | **1** |
| `25:00` con el arreglo | `BODY` | `''` | 0 (el padre ya tenia `''`) |
| `930` con el borrador solo en el estado | `BODY` | `09:30` | **2** |

El `onBlur` cuenta 1 en todos: el `blur()` lo dispara **sincrono**, dentro del mismo Enter. O sea
que `commit()` corre dos veces de verdad y la segunda no emite. Sin el ref, el mismo gesto emitia
dos veces el mismo valor: el guard es lo que lo evita, no una casualidad de timing.

### Efecto lateral asumido

Confirmar sin borrador ahora es un no-op. Antes, salir de un campo sin haber escrito nada
normalizaba el valor del **padre**; con los valores reales eso ya era un no-op (`''` o `'HH:MM'`,
porque `buildDayStatesFromRows` recorta a HH:MM), pero si alguna vez entrara un `'09:00:00'` de la
base, lo habria **vaciado solo**. Queda documentado en el codigo.

---

## B - El chip de servicio no se sale mas (`13a9ed3`)

Tercera vez del mismo defecto (tarjetas del catalogo en v0.29, chips del manager de categorias en
`260929-g4d`, y este). Se aplico el criterio de `components/dashboard/categorias-manager.tsx`, que
son tres partes que solo funcionan juntas: `max-w-full` en el boton, `min-w-0 max-w-full` en el
pill, y el nombre en su **propio span** con `truncate`, sacando el `whitespace-nowrap` suelto, que
`truncate` ya trae y que era justo lo que impedia encoger.

`min-w-11` se queda y NO se le agrego `min-w-0`: los 44px son el minimo tactil, y un minimo
declarado ya desactiva el `min-width: auto` automatico que causa el desborde.

### Medicion a 375px

Markup **real** server-rendereado con `renderToStaticMarkup` (nada transcrito a mano), montado en un
**iframe de 375px** con el CSS de `app/globals.css` compilado, porque Chrome headless ignora
`--window-size` con `--dump-dom`. Cadena replicada: pagina `p-4`, Card `p-6`, o sea **295px utiles**.

| | antes | despues |
|---|---|---|
| pill del nombre de 74 caracteres | **443px** | **293px** |
| pill del de 76 caracteres | **449px** | **293px** |
| exceso sobre el borde de la tarjeta | **+74 a +85px** | **0** (1px adentro) |
| scroll horizontal de la Card | **54 a 62px** | **0** |
| scroll horizontal del documento | **45px** | **0** |
| "Cualquier servicio" | 138.98px | 138.98px (igual) |
| "Ver todos (8)" / "(9)" | 77.98 / 78.02px | 77.98 / 78.02px (igual) |
| alto del area tactil | 44px | 44px |

El recorte ocurre en el nodo del nombre con elipsis real (`text-overflow: ellipsis`,
`white-space: nowrap`, `overflow: hidden`; `scrollWidth` 417 contra `clientWidth` 267) y el DOM
conserva el texto completo (74 y 76 caracteres), asi que el nombre entero sigue llegando a los
lectores de pantalla. Para el mouse se agrego `title` con el nombre completo en **todos** los chips:
el `ariaLabel` solo existia para los inactivos.

### Un arreglo que rompia otra cosa, corregido en el mismo commit

Con el nombre truncado, en un servicio de baja con nombre largo `truncate` se comia el sufijo
"· inactivo" y el unico indicio que quedaba era el borde punteado. D-11 pide **forma Y palabra**, no
el borde solo. El sufijo paso a su propio span `shrink-0` (lo compone el chip, que ahora recibe el
nombre pelado) y lo que se recorta es el nombre: medido, el nombre baja a 198px y el sufijo queda
entero.

Intactos y verificados en el markup: el `<button>` que togglea, `aria-pressed`, el area tactil de
44px, la tilde del estado seleccionado (ahora `shrink-0`, no se encoge), el `aria-label` explicativo
del inactivo y el `toast` al quitar un servicio dado de baja.

---

## Verificacion (salida real)

- `./node_modules/.bin/tsc --noEmit` da **0 lineas con `error TS`** (filtrando `^\.next/`).
- `npx vitest run` da **102 passed (102) | 1515 passed, 4 expected fail, 1 skipped (1520)**.
  El piso era 1510 passed / 102 archivos: +5 son los casos nuevos de idempotencia.
  AVISO: en dos corridas intermedias un worker del pool murio solo (`Worker exited unexpectedly`,
  101/102 archivos). Es flakiness del pool de Vitest, no un test caido: la corrida con
  `--reporter=json` reporto **102 archivos, 0 failed**, y la ultima corrida limpia dio 102/102.
- `./node_modules/.bin/eslint` sobre los 3 archivos da **rc=0, 0 problemas**.
- Cero paquetes nuevos. Cero migraciones: siguen **41**.
- No se toco `lib/overlay-history.ts`, `lib/panel-history.ts` ni `unsaved-changes-guard.tsx`.
- El dev server del puerto 80 quedo vivo (las sondas usaron 8742-8751 y CDP 9344-9350).

## UAT (pendiente, celular del dueno)

1. `/agenda`, tocar una hora, escribir, **OK del teclado**: la hora queda normalizada **y el teclado
   se baja**.
2. Lo mismo en alta de turno y alta de abono.
3. El chip del servicio larguisimo no se pasa de la tarjeta y se sigue pudiendo tocar.
4. "Ver todos (N)" y "Cualquier servicio" en su lugar.

## Sugerencia (no hecha, fuera del plan)

Este defecto ya se pago tres veces y ninguna superficie tiene test de regresion del markup del chip.
Un caso con `renderToStaticMarkup` que exija `truncate` en el nodo del nombre y la ausencia de
`whitespace-nowrap` suelto en el pill costaria poco y cortaria la cuarta vez. No se agrego porque el
plan fijaba los archivos a tocar.

## Self-Check: PASSED

- 3 archivos de codigo + SUMMARY.md: existen en disco.
- Commits c206330 y 13a9ed3: existen en el historial.
- Cero archivos borrados por los 2 commits.
