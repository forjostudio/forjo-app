---
quick_id: 261005-pbj
slug: bajar-el-teclado-al-confirmar-la-hora-y-
date: 2026-10-05
type: quick
surface: el campo de hora + los chips de servicio de Agenda
files_modified:
  - components/ui/time-field.tsx
  - components/ui/time-field.test.tsx
  - components/agenda/block-services-line.tsx
---

# Bajar el teclado al confirmar la hora, y el chip de servicio que se sale en Agenda

Las dos salieron de la **UAT en celular** del quick `261005-n41` (2026-10-05). El teclado numérico
funcionó: lo que falta es el cierre del gesto.

---

## A — Al confirmar en el teclado, que se baje

**Lo que reportó el dueño:** el `TimeField` ya normaliza con Enter (y con blur), pero **el teclado
se queda abierto**. En mobile eso tapa media pantalla y obliga a un toque extra afuera para seguir.

### Task 1 — Enter cierra el teclado

- En `components/ui/time-field.tsx`, al confirmar con Enter: **normalizar y después soltar el foco**
  (`blur()` sobre el input). Android cierra el teclado cuando el campo pierde el foco.
- ⚠ **El orden importa:** primero normalizar, después soltar. Si el blur dispara otra vez la
  normalización, tiene que ser **idempotente** — normalizar dos veces no puede cambiar el resultado
  ni emitir dos `onValueChange`. Verificalo, no lo supongas.
- ⚠ **No rompas el Enter dentro de un formulario**: si el campo vive en un `<form>`, Enter podría
  estar enviándolo. Medí qué pasa hoy en los 4 contextos (agenda, horario especial, alta de turno,
  alta de abono) y preservá el comportamiento que ya había.
- El resto de la normalización **no se toca**: la tabla de casos (`9`→`09:00`, `930`→`09:30`,
  `9:3`→`09:03`, `25:00`→vacío, vacío→vacío) quedó validada por el dueño y es contrato.

**Verify:** casos nuevos en `components/ui/time-field.test.tsx` para la idempotencia. El entorno de
Vitest es **`node`** — sin jsdom, sin Testing Library, **no agregues ninguno**: testeá la lógica pura
y, si hace falta render, `renderToStaticMarkup`.

---

## B — El chip de servicio se sale de la tarjeta, otra vez

**Lo que reportó el dueño** (captura a 375px): en la grilla de Agenda, el chip del servicio de nombre
larguísimo se pasa del borde derecho.

**Causa medida — es el MISMO defecto, por tercera vez:**
`components/agenda/block-services-line.tsx:108` → el span del chip tiene `whitespace-nowrap` **sin
ancho máximo ni truncado**, y como es item de un contenedor flex su `min-width: auto` le impide
encoger por debajo del contenido.

⚠ **Historial de este bug — no lo pagues una cuarta vez:**
1. Tarjetas del catálogo público (UAT de v0.29) → se arregló con `break-words`.
2. Chips del manager de categorías (quick `260929-g4d`) → se arregló con `min-w-0` + `truncate`.
3. **Éste.**

Cada superficie escribió su propio chip, así que cada una reintrodujo el defecto.

### Task 2 — Que el chip no se pase

- `min-w-0` + `max-w-full` en la cadena de contenedores y el nombre en **su propio span** con
  `truncate`. ⚠ `truncate` ya incluye `whitespace-nowrap`: **no lo dejes duplicado**, porque el
  `nowrap` suelto es justo lo que impide encoger.
- ⚠ `text-overflow` **no actúa sobre los hijos de un contenedor flex** — por eso el nombre necesita
  nodo propio. Es la cicatriz exacta del quick `260929-g4d`.
- **No rompas lo que el chip ya hace:** es un `<button>` que togglea el servicio, tiene `min-h-11
  min-w-11` (área táctil), estado seleccionado, estado `inactivo` con su sufijo y su `ariaLabel`, y
  un `toast` al quitar un servicio dado de baja. **Nada de eso cambia.**
- **El nombre completo tiene que seguir accesible**: el `ariaLabel` sólo existe para los inactivos,
  así que si se trunca visualmente hay que asegurar el nombre entero por `title` y/o `aria-label`
  **para todos**.
- El elemento "Cualquier servicio" (`:208`) y el botón "Ver todos" (`:234`) comparten la fila:
  verificá que no se deformen.

**Verify:** medí a **375px** que ningún chip excede su tarjeta. ⚠ Chrome headless **ignora
`--window-size` con `--dump-dom`**: montá la sonda en un **iframe** del ancho pedido. Hay moldes
reusables en el scratchpad de los quicks `260929-g4d` y `261005-n41`.

---

## Prohibiciones

- **Cero paquetes nuevos**, **cero migraciones** (siguen **41**).
- **No** toques `lib/overlay-history.ts`, `lib/panel-history.ts` ni `unsaved-changes-guard.tsx`.
- **No** cambies el layout de la fila de horarios ni de la línea de servicios: sólo lo necesario para
  que el texto no desborde.
- ⚠ **Nunca `npx tsc`** (sale 0 falsamente): `./node_modules/.bin/tsc --noEmit`, buscando `error TS`
  en la SALIDA, filtrando `^\.next/`.

## Verificación

- `npx vitest run` — piso **1510 passed / 102 archivos** más tus casos. ⚠ Dos canarios de reloj fallan
  a propósito fuera de `[01:00, 23:30]` AR.
- `./node_modules/.bin/eslint <archivos>` → 0 problemas **nuevos**. ⚠ `npm run lint` global da rc=1
  por deuda **preexistente**, no tuya; y `agenda-client.tsx` ya tiene 1 problema preexistente.
- ⚠ Hay un **dev server en el puerto 80** que el dueño usa para la UAT. **NO lo mates.**

## UAT (celular)

1. `/agenda` → tocar una hora → escribir → **OK del teclado** ⇒ la hora queda normalizada **y el
   teclado se baja**.
2. Lo mismo en alta de turno y alta de abono.
3. El chip del servicio larguísimo **no se pasa** de la tarjeta, y se sigue pudiendo tocar para
   activarlo/desactivarlo.
4. "Ver todos (9)" y "Cualquier servicio" siguen en su lugar.
