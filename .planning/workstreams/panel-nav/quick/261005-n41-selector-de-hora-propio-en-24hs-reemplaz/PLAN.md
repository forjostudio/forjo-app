---
quick_id: 261005-n41
slug: selector-de-hora-propio-en-24hs-reemplaz
date: 2026-10-05
type: quick
surface: panel + onboarding — los 9 campos de hora
files_modified:
  - components/ui/time-field.tsx
  - components/ui/time-field.test.tsx
  - app/(dashboard)/agenda/agenda-client.tsx
  - app/(onboarding)/onboarding/page.tsx
  - components/dashboard/nuevo-turno-form.tsx
  - components/dashboard/nuevo-abono-form.tsx
---

# Un campo de hora propio, en 24hs, que reemplaza los 9 nativos

## Por qué, y por qué no alcanza con una prop

El dueño pidió la grilla de horarios de Agenda **en formato 24hs**. Medido: **no hay forma de
conseguirlo con el input nativo.** `<input type="time">` decide 12 vs 24 horas por el **locale del
sistema operativo**, no por el HTML — no existe atributo para forzarlo. La prueba está en el repo:
`app/layout.tsx:56` ya declara `lang="es"` y aun así el celular del dueño lo muestra en 12hs.

**Y hay un segundo reclamo, ya anotado en el backlog de la v0.22:** en mobile el input nativo abre la
**ruedita del reloj** en vez del teclado para tipear. Un campo propio cierra **los dos** de una.

Señal de que el nativo ya venía molestando: cuatro call sites traen
`max-sm:[&::-webkit-calendar-picker-indicator]:hidden`, o sea que **ya se estaba escondiendo** parte
del control nativo a mano.

## ⚠ Las tres restricciones que mandan

### 1. El valor VACÍO es funcional, no un caso borde

`app/(onboarding)/onboarding/page.tsx:397-401` documenta, con el bug ya pagado, que un campo de hora
**se puede vaciar** y que entonces la comparación de orden miente (es lexicográfica: `'18:00' <= ''`
da `false`), y que del otro lado el `::time` del RPC **revienta con 22007** antes de llegar a su
backstop. Por eso `validateHours()` valida **forma antes que orden**.

⇒ El componente **tiene que seguir pudiendo emitir `''`**. Si lo impide, cambia la semántica de
validación de dos pantallas y el plan falló.

### 2. Los 9 call sites comparten contrato

Todos: `value` es un string `"HH:MM"` y el handler usa `e.target.value`. Repartidos así:
`agenda-client.tsx` (4) · `onboarding/page.tsx` (3) · `nuevo-turno-form.tsx` (1) ·
`nuevo-abono-form.tsx` (1).

**Decisión de API:** el componente expone `onValueChange(v: string)` en vez de un evento. Son 9
ediciones mecánicas en cualquier caso, y pasar el string es lo honesto — hoy cada call site hace
`e.target.value` para llegar a lo mismo. Mantené `value`, `disabled` y `className` tal cual para no
tocar el layout de ninguna fila.

### 3. Cero cambio de layout

Las filas están medidas y peleadas: `agenda-client.tsx:1262-1283` explica que los dos inputs son
`flex-1` y que a 375px cada uno pasó de ~78px a ~115px. **El componente nuevo tiene que ocupar lo
mismo.** Si cambia el alto o el ancho, rompe una fila que ya costó.

## Tareas

### Task 1 — `components/ui/time-field.tsx`

Un campo de texto que se comporta como campo de hora, **siempre en 24hs**.

- **Teclado numérico en mobile**: `inputMode="numeric"` (es lo que mata el ítem del backlog). Pensá
  si además conviene `pattern`.
- **Siempre 24hs**, sin AM/PM, independiente del dispositivo.
- **Puede quedar vacío** (restricción 1).
- **Normalizá al salir del campo** (`onBlur`), no en cada tecla: escribir es más importante que
  corregir. Horas 0-23, minutos 0-59. Decidí qué hacés con entradas parciales (`9`, `930`, `9:3`) y
  **dejalo escrito** — es el corazón del componente.
- **Estados obligatorios**: default, focus visible, disabled, y error (`aria-invalid`). El `Input` de
  `components/ui/input.tsx` ya trae los estilos de todos: **construí sobre él**, no al lado.
- **Accesibilidad**: el nativo regalaba semántica; un `<input type="text">` no. Hacete cargo —
  `aria-label` cuando no hay label visible, y que el formato esperado se anuncie.
- **44×44 de área táctil** (regla de CLAUDE.md) **sin cambiar el alto visual de la fila**. Si
  chocan, ampliá el área sin agrandar la caja y dejá dicho cómo.

⚠ **No inventes un dropdown ni un picker nuevo.** Es un campo de texto disciplinado. Un selector con
rueda propia es otra tarea y otra discusión.

**Tests** (`components/ui/time-field.test.tsx`): el entorno de Vitest es **`node`**, sin jsdom ni
Testing Library — **no agregues ninguno**. Testeá la **lógica pura** (normalización, qué entra y qué
sale, el vacío) extrayéndola a funciones puras, igual que `lib/panel-history.ts` separa política de
mecánica. Para el render, el molde del repo es `renderToStaticMarkup`
(`components/dashboard/categorias-manager.test.tsx`).

### Task 2 — Reemplazar los 9 call sites

Mecánico: cambiar el componente y pasar de `onChange={e => f(e.target.value)}` a
`onValueChange={v => f(v)}`. **Conservá cada `className` tal cual**, y aprovechá para sacar el
`max-sm:[&::-webkit-calendar-picker-indicator]:hidden`, que deja de tener sentido.

⚠ **Verificá que no quede ningún `type="time"` suelto**: un gate con `grep -rn 'type="time"' app components` tiene que dar **0**, si no queda un dialecto por pantalla.

⚠ **No toques la lógica de validación** de `validateHours()` ni la del panel. El componente cambia
**cómo se escribe** la hora, no qué se considera válido.

## Prohibiciones

- **Cero paquetes nuevos** (ni máscara, ni date-picker, ni jsdom).
- **Cero migraciones** (siguen **41**).
- **No** toques `lib/overlay-history.ts`, `lib/panel-history.ts` ni el guard de cambios sin guardar.
- **No** cambies el layout de las filas de horario ni de los formularios de alta.

## Verificación

- `./node_modules/.bin/tsc --noEmit` — ⚠ **nunca `npx tsc`** (sale 0 falsamente). Buscá `error TS` en
  la SALIDA, filtrando `^\.next/`.
- `npx vitest run` — piso **1486 passed / 101 archivos** más tus casos. ⚠ Dos canarios de reloj
  fallan a propósito fuera de `[01:00, 23:30]` AR: mirá la hora antes de culpar a tu cambio.
- `./node_modules/.bin/eslint <archivos>` → 0 problemas. ⚠ `npm run lint` global da rc=1 por deuda
  **preexistente**, no tuya.
- **Medí a 375px** que la fila de horarios de Agenda **no cambió de alto ni de ancho**. ⚠ Chrome
  headless **ignora `--window-size` con `--dump-dom`**: montá la sonda en un **iframe** del ancho
  pedido (molde reusable en el scratchpad del quick `260929-g4d`).
- ⚠ Hay un **dev server en el puerto 80** que el dueño usa. **NO lo mates.**

## UAT (celular)

1. `/agenda` → la grilla muestra las horas en **24hs**, sin AM/PM.
2. Tocar un campo → abre **teclado numérico**, no la ruedita del reloj.
3. Escribir una hora y salir del campo → se normaliza bien. Probá parciales (`9`, `930`).
4. **Vaciar** un campo → se puede, y al guardar aparece el error de validación de siempre.
5. La fila se ve **igual** que antes (alto, ancho, el `→` entre los dos campos).
6. Lo mismo en alta de turno, alta de abono y onboarding.
