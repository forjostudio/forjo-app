---
quick_id: 261005-n41
slug: selector-de-hora-propio-en-24hs-reemplaz
date: 2026-10-05
status: complete
uat: PENDIENTE (celular del dueño)
commits:
  - 6207c7d
  - 30d7ebf
  - 550637b
plan_head_before: 240e6bb3b31a5c6bd657d67506080c13a3d6b394
actuals:
  commits: 3
  tasks: 2
key-files:
  created:
    - components/ui/time-field.tsx
    - components/ui/time-field.test.tsx
  modified:
    - app/(dashboard)/agenda/agenda-client.tsx
    - app/(onboarding)/onboarding/page.tsx
    - components/dashboard/nuevo-turno-form.tsx
    - components/dashboard/nuevo-abono-form.tsx
---

# Un campo de hora propio, en 24hs, que reemplaza los nativos

`components/ui/time-field.tsx`: un `<input type="text">` con `inputMode="numeric"` construido **sobre
`components/ui/input.tsx`** (un solo nodo, sin wrapper). Reemplaza **los 8** campos de hora nativos
del panel y del onboarding. Siempre 24hs, independiente del locale del sistema operativo, y en mobile
abre el **teclado numérico** en vez de la ruedita del reloj — que era el otro ítem, el del backlog de
la v0.22.

## La normalización, y por qué cada regla

Se corre **al salir del campo** (`onBlur`) y también con **Enter** (en mobile el "listo" del teclado
no siempre dispara blur, y así la hora queda completa antes de que el dueño toque Guardar). Mientras
se tipea NO corrige: sólo filtra lo que no puede ser una hora (dígitos y a lo sumo un `:`). No hay
máscara que escriba sola — una máscara pelea con el cursor, y acá escribir importa más que corregir.

| Entra | Sale | Por qué |
|---|---|---|
| vacío | vacío | **El vacío es funcional.** Es el caso que `validateHours()` e `isValidBlockTime()` necesitan (el bug 22007 del `::time` ya pagado). El campo lo sigue emitiendo. |
| `9` · `18` | `09:00` · `18:00` | 1-2 dígitos = hora en punto. Es la intención obvia. |
| `930` · `0930` · `123` | `09:30` · `09:30` · `01:23` | 3-4 dígitos = posicional desde la derecha, los dos últimos son minutos. Es la convención de cualquier reloj digital y es el **camino de primera clase**: el teclado numérico de mobile no trae `:`. |
| `9:3` | `09:03` | Con `:` el minuto es **literal**. Asimetría a propósito contra `930`: quien escribió el separador ya declaró que lo que sigue es el campo de minutos. |
| `9:` | `09:00` | Falta el minuto y completar a la hora en punto es la única lectura razonable. |
| `:30` | vacío | Falta la **hora** y eso no se adivina (inventar la medianoche es un invento). |
| `25:00` · `9:70` · `12345` | vacío | Fuera de rango o ilegible. **No se clampea a `23:00`**: inventar una hora que nadie pidió es peor que vaciar. |

**La decisión de contrato:** el padre sólo recibe el vacío o un `'HH:MM'` válido — nunca un parcial
como `'09'` o `'0930'`. Es **exactamente el contrato que daba el nativo**, y es lo que esperan los
consumidores de esos valores (validaciones, chequeo de disponibilidad, payload del RPC). Para eso el
componente guarda un borrador local: lo que se ve mientras se escribe es el borrador, lo que viaja al
padre es siempre una hora completa. Y vaciar ante lo ilegible no es una semántica nueva: dispara el
mismo mensaje de validación que ya estaba escrito para el vacío. **Ninguna validación se tocó.**

## 44×44 sin mover la fila

**Chocan, y ganó la fila** (restricción 3 del plan): el alto se queda en `h-8` (32px), **el mismo que
tenía el nativo** — no hay regresión del área táctil, hay empate. Y no se puede hacer mejor sin tocar
la caja ni agregar DOM: **los pseudo-elementos no se renderizan en un `<input>`**, así que el truco de
`-my-3` que el repo ya usa en los *botones* (el `btn-merge` del detalle de cliente) no aplica acá; y
un `<span>` envolvente con overlay rompería el `flex-1`, que tiene que caer en el input.

Lo que sí mejora, medido:

- **A lo ancho son 124.31px** en la fila de Agenda a 375px — muy por encima de 44.
- **Toda la caja es superficie de tipeo.** El nativo gastaba ~20px en el ícono del reloj (tanto que 4
  call sites lo escondían a mano con `max-sm:[&::-webkit-calendar-picker-indicator]:hidden`) y partía
  el resto en segmentos hora/minuto que había que acertar por separado. Ahora un toque en cualquier
  parte del campo entra.
- **`touch-manipulation`**: saca el delay de doble-tap del navegador, así el primer toque registra.

## Medición a 375px — la fila no se movió

Sonda en **iframe** dentro de Chrome headless (Chrome ignora `--window-size` con `--dump-dom`), CSS
compilado del `app/globals.css` real, cadena de contenedores real (`p-4` del layout → `Card p-6`).
Viewport 375, `sm:` no aplica. El markup de ambas variantes se generó con el `Input` y el `TimeField`
reales vía `renderToStaticMarkup`, no escrito a mano.

| Fila | Antes | Después |
|---|---|---|
| Agenda, grilla de horarios | fila **293×32** · inputs **124.31×32** y **124.33×32** | **idéntico** |
| Agenda, horario especial | **343×32** | **idéntico** |
| Onboarding, franjas | **96×32** | **idéntico** |
| Alta de turno / alta de abono | **343×32** | **idéntico** |

## Accesibilidad

El nativo regalaba semántica y un `<input type="text">` no, así que:

- **Nombre accesible** donde no hay label visible: `aria-label` en las 4 filas de Agenda y en las 2 de
  onboarding, que **antes no tenían ninguno** (`Hora de inicio del bloque 2 de Martes`). Los dos
  formularios de alta siguen con su `<Label htmlFor>`.
- **Formato anunciado** sin agregar un nodo al DOM: `title="Hora en formato 24 horas (HH:MM)"` queda
  como descripción accesible, más `placeholder="HH:MM"` visible. No se puede envolver el input
  (`flex-1`), así que la descripción tenía que viajar por atributo.
- **Sin `pattern`** a propósito: engancharía el campo a la validez *nativa* del form y un parcial
  legítimo como `0930` podría frenar un submit que la app valida por su cuenta.
- Foco visible, `disabled` y `aria-invalid` se heredan del `Input` del repo (hay test de los tres).

## Desvíos del plan, con motivo

1. **Son 8 call sites, no 9.** El plan decía onboarding (3); medido, onboarding tiene **2**
   (`page.tsx:1141` y `1149`). El tercer hit del grep era el **comentario** de `validateHours()` en la
   línea 397. Total real: Agenda 4 + onboarding 2 + alta de turno 1 + alta de abono 1 = **8**.

2. **El onboarding pasó de `w-auto min-w-24` a `w-24`** (el plan pedía conservar cada `className` tal
   cual). Motivo medido: con un input de texto, `w-auto` es un ancho **intrínseco que depende de la
   tipografía**, no del control. Medido a 375px, el intrínseco del nativo era **88.69px** y el del
   `TimeField` **84px** — los dos por debajo del piso de 96px, así que el piso decidía en ambos casos.
   `w-24` fija esos mismos **96px** y saca a la fuente de la ecuación. Además, la razón por la que
   `w-auto` existía (el locale de 12hs del SO recortaba "9:00 a. m." y el sufijo quedaba cortado en
   Android Chrome) **desapareció con el control nativo**. El comentario del archivo quedó actualizado
   con los números.

3. **`size={5}`** en el componente (no estaba en el plan): es lo que mantiene sano cualquier call site
   futuro que no fije ancho por clase. Donde hay `w-full`, `flex-1` o `w-24`, la clase gana.

## Verificación — salidas reales

- **`./node_modules/.bin/tsc --noEmit`** → filtrando `^\.next/` y buscando `error TS`: **0 errores**.
  (En el camino dio 2 `TS2304: Cannot find name 'TimeField'` por los imports que faltaban en los dos
  formularios; corregidos antes del commit.)
- **`npx vitest run`** → **`Test Files 102 passed (102)`** · **`Tests 1510 passed | 4 expected fail |
  1 skipped (1515)`**. Piso del plan: 1486/101 → **+24 tests y +1 archivo**, exactamente los nuevos.
  Corrido 17:03 AR, dentro de `[01:00, 23:30]`, así que los canarios de reloj no aplican.
- **`./node_modules/.bin/eslint`** sobre los 6 archivos → **0 problemas nuevos**. Quedan 3
  **preexistentes**, verificados contra `git show HEAD:…`: `agenda-client.tsx:853`
  `react-hooks/purity` (el `Date.now()` dentro del memo, intacto), `onboarding/page.tsx:14`
  `no-unused-vars` (`Badge` importado y sin usar, ya así antes) y `onboarding/page.tsx:204`
  `set-state-in-effect` (el efecto del slug, intacto). Los dos archivos nuevos: **0 problemas**.
- **Gate `grep -rn 'type="time"' app components`** → **1 hit**, y es el assert que prueba la ausencia:
  `components/ui/time-field.test.tsx:161`. **0 call sites JSX.** Los comentarios que mencionaban el
  atributo se reescribieron sin las comillas para que el gate quede legible.
- **Cero paquetes nuevos** (ni jsdom, ni Testing Library, ni máscara). **Cero migraciones**: siguen 41.
- El dev server del puerto 80 **no se tocó**: la medición corrió sobre archivos `file://`.
- No se tocó `lib/overlay-history.ts`, `lib/panel-history.ts` ni `unsaved-changes-guard.tsx` (el otro
  agente estaba leyéndolos).

## Tests nuevos

`components/ui/time-field.test.tsx`, 24 casos, entorno `node` sin DOM: 5 suites de **funciones puras**
(`normalizeTimeOnBlur`, `sanitizeTimeTyping`, `isCompleteTime` — la política separada de la mecánica,
molde de `lib/panel-history.ts`) y 1 suite de **render** con `renderToStaticMarkup` (molde de
`components/dashboard/categorias-manager.test.tsx`). Dos de esos casos son invariantes, no ejemplos:
la salida de la normalización **siempre** es el vacío o algo que `isCompleteTime` acepta, y nada de lo
tipeable puede producir un valor intermedio raro.

## Lo que falta

**La UAT en el celular del dueño** (los 6 pasos del plan). Lo que ninguna sonda headless puede
responder: si el teclado que abre Android es el numérico, y si la fila *se siente* igual.

## Self-Check: PASSED

- Los 2 archivos nuevos existen en disco.
- Los 3 commits existen en el historial (`6207c7d`, `30d7ebf`, `550637b`); `git rev-list --count 240e6bb..HEAD` = **3**.
- Sin archivos nuevos sin trackear en `app/`, `components/` ni `lib/` (el instrumento temporal de medición se borró).
- Migraciones: siguen **41** (la última es `079_service_categories_name_normalized.sql`).
