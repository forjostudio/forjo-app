---
phase: 17-superficie-y-polish
plan: 09
subsystem: ui
tags: [react, nextjs, tailwind, mobile, a11y, cupo, refactor, consistencia]

# Dependency graph
requires:
  - phase: 17-superficie-y-polish
    plan: 03
    provides: "`CapacityInlineControl` — el stepper `[−] N [+]` de la tarjeta de servicio con sus targets de 44px, su anillo de foco en el contenedor y sus `title` de piso/techo. Este plan lo extrae; no lo rediseña"
  - phase: 17-superficie-y-polish
    plan: 06
    provides: "La composición de la tarjeta que cerró G-02/G-02b (label de modo como tercer dato, bloque con base de flex a ancho completo, sufijo que cede su ancho, `Guardar` a la derecha). Este plan la conserva entera"
  - phase: 17-superficie-y-polish
    plan: 02
    provides: "La maquinaria de D-06 en `CapacityModeFields`: texto crudo local, ref de foco y efecto que resincroniza sólo con el campo sin foco. Este plan la mueve de forma, no de fondo"
provides:
  - "`CapacityStepper`: el control `[−] N [+]` como pieza presentacional única del archivo, consumida por la tarjeta de servicio y por el campo `Cuántos lugares` del modal"
  - "El campo `Cuántos lugares` del modal operable con el dedo en mobile (targets de 44px), no sólo tipeable"
  - "El precedente de 'compartir el dibujo sin compartir el commit': la pieza recibe valor + texto y devuelve intenciones; el clamp y el guardado quedan en cada caller"
  - "Una sola fuente para el piso del cupo del modal: sale del modo con el helper, ya no de un `2` escrito a mano"
affects: [tercera-ronda-de-uat, 17-UI-SPEC, secure-phase-17, code-review-17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Componente presentacional compartido que NO clampea: propone el vecino (`value ± 1`) y cada caller aplica su propio piso, porque las semánticas de guardado son distintas"
    - "El caller avisa el foco ANTES de que el componente seleccione el contenido, para que cualquier efecto del caller que dependa del foco ya vea la bandera encendida"
    - "La pieza compartida vive en el MISMO archivo que sus dos consumidores: sacarla a `components/` agregaba un archivo, un import y superficie de revisión sin ganar nada"

key-files:
  created: []
  modified:
    - "app/(dashboard)/settings/settings-client.tsx"

key-decisions:
  - "ESTO NO CERRÓ UN GAP. Nada estaba roto: el test 3 de la ronda 1 de UAT verificó que el campo del modal funcionaba (se podía vaciar, tipear y el piso corregía al salir). Es una mejora de consistencia y de target táctil que pidió el dueño en la ronda 2 ('por ahí estaría bueno llevar el mismo selector +- de la tarjeta de servicios al editor') y que entró en esta fase, y no después, para que `secure-phase` y `code-review` la cubran en el mismo ciclo en vez de pagar un ciclo entero por una sola pieza de UI"
  - "SE COMPARTE EL DIBUJO Y EL TIPEO, NUNCA EL GUARDADO. La tarjeta persiste directo en `services` con su propio botón (`saveCapacityInline`); el modal propaga al estado del formulario y lo guarda el botón del diálogo. Por eso `CapacityStepper` recibe `value`/`text` y emite intenciones (`onStep` / `onTextChange` / `onInputBlur`), y por eso el clamp vive en los callers: cada uno tiene su propio piso"
  - "`CapacityStepper` no conoce el MODO: sólo un número. No lo recibe y no lo puede escribir, así que la tarjeta sigue sin poder despachar el trigger del gate de la migr. 070 desde una pantalla que no explica nada (D-09 sostenido por construcción, no por convención)"
  - "`atMin` / `atMax` salen de `CapacityInlineControl` y pasan a calcularse adentro de la pieza compartida contra `value`/`min`/`max`. Dejarlos en la tarjeta los volvía código muerto"
  - "El contenedor del campo del modal pierde su ancho máximo de 11rem: acotaba un input suelto, pero el control compartido se dimensiona solo por sus tres piezas, así que quedaba como restricción fantasma"
  - "El piso del modal deja de ser el `2` literal y se deriva del modo con el helper (`minCapacityFor` sube de 5 a 6 usos, exactamente uno). En esta rama el modo nunca es individual, así que el número no cambia — lo que cambia es que deja de haber dos fuentes para la misma regla"
  - "El stepper de cupo por bloque de `agenda-client.tsx` sigue siendo un TERCER control aparte, a propósito: otra superficie, otro dato, fuera del alcance de esta fase. Anotado, no tocado"

patterns-established:
  - "Un dato, un control: cuando el mismo campo de la base se edita desde dos superficies, el control se extrae; lo que no se unifica es el camino de escritura"

requirements-completed: [CUPO-09]

# Metrics
duration: 22min
completed: 2026-08-24
status: complete
---

# Phase 17 Plan 09: El selector de cupo del modal pasa a ser el mismo de la tarjeta Summary

`services.capacity` se editaba con dos controles distintos: en la tarjeta un stepper `[−] N [+]` con
targets de 44px, y en el modal un campo numérico pelado con los spinners nativos ocultos —o sea, un
campo que en mobile sólo se podía tipear—. Ahora el control existe **una sola vez** en el archivo
(`CapacityStepper`) y las dos superficies lo consumen, cada una conservando su propia semántica de
guardado.

## Qué se hizo

**Task 1 — `refactor(17-09)` · `07f4df7`**
El `span` con rol de grupo de `CapacityInlineControl` (contenedor con anillo de foco, botón menos,
input numérico, botón más) se extrajo a `CapacityStepper`, una función de nivel superior ubicada entre
el final de `spacesBlockSharedCapacity` y el inicio de `CapacityModeFields`. La constante de clases de
los botones se mudó adentro con su comentario íntegro (el razonamiento de por qué usa el prefijo de
estado habilitado en vez de apagar los eventos de puntero: un botón deshabilitado tiene que poder
mostrar su `title`). `saving` → `disabled`, `rejected` → `invalid`, `dirty` por prop; `atMin`/`atMax`
se calculan adentro. Las etiquetas accesibles, los `title` de piso y techo, las clases de target
táctil, el `overflow-hidden`, el anillo de foco y los spinners ocultos se copiaron textualmente.

Lo que quedó afuera y no se movió: el label de modo, el `span` con base de flex y su manejador de
Escape, el sufijo `lugares` y el botón `Guardar`. `saved`, `value`, `text`, `rejected`, el timer, los
dos efectos, `dirty`, `apply`, `revert` y `handleSave` no se tocaron. `saveCapacityInline` no cambió
en una sola línea.

**Task 2 — `feat(17-09)` · `cd43646`**
El input crudo del campo `Cuántos lugares` se reemplazó por la pieza compartida. El condicional de
no-individual, el contenedor y la etiqueta visible se quedaron (un servicio `individual` sigue sin
campo de cupo, D-07). El cableado: `value` es el cupo del formulario, `text` es el texto crudo local
—lo que se ve es `text`, nunca el prop—, `min` sale del modo con el helper, `groupLabel` es la misma
frase que muestra la etiqueta visible. `dirty` e `invalid` no se pasan: en el modal no existe la fila
sucia ni la marca transitoria de rechazo, que son de la tarjeta.

`onTextChange` conserva el cuerpo del `onChange` de hoy sin una coma de diferencia (guarda el string
crudo, corta si está vacío, propaga sin clampear). `onInputBlur` conserva el cuerpo del `onBlur` en el
mismo orden (apaga el ref de foco, parsea, cae al valor vigente, normaliza con el piso del modo y el
techo, escribe el texto local y propaga). `onStep` normaliza el vecino y escribe en los dos lados.
`onInputFocus` enciende el ref de foco — la pieza más frágil del plan, y la que el gate mide.

## Cómo se probó que las dos semánticas de guardado siguen separadas

- **La tarjeta persiste en la base:** acotando con `sed` al cuerpo de `saveCapacityInline`, el payload
  sigue llevando **una sola clave** (`.update({ capacity })` → 1) y el filtro por tenant sigue ahí
  (`.eq('business_id', business.id)` → 1). La función no aparece en el diff.
- **El modal propaga al formulario:** los tres manejadores del campo llaman `onChange({ capacity })`,
  que es el `patch` del formulario del diálogo; no hay ninguna escritura a Supabase en esa rama.
- **El clamp quedó en los callers:** `normalizeCapacity(base, minCapacityFor(value))` sigue existiendo
  exactamente una vez (el clamp al salir del modal) y `CapacityStepper` no llama a `normalizeCapacity`
  ni una vez — propone el vecino y nada más.
- **`onStep={apply}` → 1:** la tarjeta sigue clampeando con SU piso, que sale de SU modo.

## Gates medidos (base → después)

| Gate | Base | Después | Esperado |
|---|---|---|---|
| `^function CapacityStepper\(` | 0 | 1 | 1 (y su línea < la de `CapacityModeFields`) |
| `<CapacityStepper` | 0 | 2 | 2 |
| `capacityFocusedRef.current` | 3 | **3** | 3 |
| `onInputFocus={` | 0 | **1** | 1 |
| `h-11 w-11 sm:h-8 sm:w-8` | 2 | 2 | 2 |
| `aria-label="Un lugar ` | 2 | 2 | 2 |
| `aria-label="Cantidad de lugares"` | 1 | 1 | 1 |
| `role="group"` | 2 | 2 | 2 |
| `aria-invalid` | 1 | 1 | 1 |
| `type="number"` | 7 | 6 | 6 |
| `inputMode="numeric"` | 3 | 2 | 2 |
| `[appearance:textfield]` | 2 | 1 | 1 |
| `max-w-[11rem]` | 1 | 0 | 0 |
| `minCapacityFor(` | 5 | 6 | 6 |
| `text={capacityText}` | 0 | 1 | 1 |
| `if (raw.trim() === '') return` | 1 | 1 | 1 |
| `normalizeCapacity(base, minCapacityFor(value))` | 1 | 1 | 1 |
| `const dirty = value !== saved` | 1 | 1 | 1 |
| `onStep={apply}` | 0 | 1 | 1 |
| `basis-full` / `hidden sm:inline` / `min-w-24` | 1/1/1 | 1/1/1 | 1/1/1 |
| `CAPACITY_MODE_HELP.map` / `border-l-primary` / grid del radiogroup | 2/1/1 | 2/1/1 | 2/1/1 |
| `tabIndex=` / `role="button"` | 0/0 | 0/0 | 0/0 |

Los dos gates que importan —`capacityFocusedRef.current` en **3** y `onInputFocus={` en **1**— son la
guarda del efecto, el encendido al entrar y el apagado al salir. Si el encendido no hubiera quedado
cableado, el conteo del ref habría bajado a 2 y el gate lo habría marcado.

## Verificación

- `./node_modules/.bin/tsc --noEmit` → **exit 0** (con el binario local; `npx tsc` acá siempre sale 0
  y no sirve como gate).
- `npm run build` → **compila**, exit 0, sin warnings nuevos. El dev server del puerto 3000 siguió
  vivo y respondiendo 200 después del build (Next 16 separa `.next/dev` de `.next/build`).
- `npx vitest run test/agenda-occupancy.test.ts --no-file-parallelism` → **20 passed**. El
  `vitest run` completo es flaky por las suites de abono (pre-existente); no se corrió como gate.
- `git diff --stat` → **un solo archivo de código**: `app/(dashboard)/settings/settings-client.tsx`.
- `git diff -- package.json package-lock.json components/ui/ lib/ test/ app/(dashboard)/agenda/ app/(dashboard)/finances/` → **vacío**. Cero dependencias nuevas (T-17-SC cerrado).

## ⚠ No hay prueba automática del comportamiento de este control

El runner de vitest corre en `environment: 'node'` y el repo no tiene librería de render de
componentes. Agregar una es una dependencia nueva y una decisión de infraestructura que excede este
plan, así que **no se agregó y no se simuló una prueba que pretenda cubrirlo**. Los gates de conteo
cubren lo estructural (que las etiquetas accesibles y los targets táctiles sobrevivieron sin
duplicarse, que el ref de foco sigue cableado). Lo vivencial va al guion de UAT:

> **El paso 2 del guion de UAT es el único gate real de D-06.** Es el defecto que el dueño reportó
> personalmente en la ronda anterior. Ninguna herramienta de este repo lo puede detectar.

## Nota para el que venga después

El stepper de **cupo por bloque** de `agenda-client.tsx` (~L781-800) sigue siendo un **tercer control
aparte, a propósito**: otra superficie, otro dato (`time_blocks.capacity`, no `services.capacity`) y
fuera del alcance de esta fase. Unificarlo con `CapacityStepper` es una decisión de otro ciclo — está
anotado acá para que no se descubra dos veces.

## Deviations from Plan

**1. [Rule 3 - Blocker] `atMin` / `atMax` se borraron de `CapacityInlineControl`**
- **Found during:** Task 1
- **Issue:** al mudar el JSX del stepper a la pieza compartida, los dos `const` de la tarjeta quedaban
  sin ningún consumidor. El plan los lista en `read_first` pero no los nombra en la lista de "cero
  cambios", y dejarlos habría metido código muerto que `eslint` marca en `npm run build`.
- **Fix:** se borraron de la tarjeta; la pieza compartida los calcula adentro contra `value`/`min`/`max`,
  que es lo que el plan pide en el cuerpo de la Task 1.
- **Files modified:** `app/(dashboard)/settings/settings-client.tsx`
- **Verification:** `tsc --noEmit` en 0 y `npm run build` en 0.
- **Commit:** `07f4df7`

**2. [Rule 3 - Blocker] El piso del modal se hoistó a un `const` en vez de llamar al helper en cada uso**
- **Found during:** Task 2
- **Issue:** el plan pide que `min` se derive del modo con el helper **y** que `onStep` normalice con
  "el piso del modo", pero también fija el gate `minCapacityFor(` en **6** (base 5, o sea exactamente
  **un** call site nuevo). Llamar al helper en las dos props daba 7 y rompía el gate; el `onBlur` no
  se puede cambiar porque su expresión literal es otro gate.
- **Fix:** un solo `const capacityMin = minCapacityFor(value)` en el cuerpo del componente, consumido
  por la prop del piso y por `onStep`. El `onInputBlur` conserva su expresión textual intacta.
- **Files modified:** `app/(dashboard)/settings/settings-client.tsx`
- **Verification:** `minCapacityFor(` → 6 y `normalizeCapacity(base, minCapacityFor(value))` → 1.
- **Commit:** `cd43646`

**Total deviations:** 2 auto-fixed (2 × Rule 3 — blockers de gate/compilación).
**Impact:** ninguno sobre el comportamiento. Las dos son consecuencias mecánicas de la extracción; el
resultado en pantalla y las dos semánticas de guardado son las que el plan pide.

## Nota sobre el entorno (no fue deviation)

El plan advertía que el archivo tiene finales de línea **CRLF**. En el árbol de trabajo actual el
archivo está en **LF** (`grep -c $'\r'` → 0); `core.autocrlf=true` normaliza al escribir en el índice
(git avisa "LF will be replaced by CRLF"). Los reemplazos se hicieron por rango de líneas igual, que
era la recomendación del plan y es indiferente al final de línea.

## `<uat_script>` — sin cambios

El guion de tres pasos del plan describe exactamente lo que se construyó y se dejó tal cual:

- **Paso 1** (el modal usa el mismo selector, el `−` apagado en el piso muestra su cartelito): el
  control comparte el `title` de piso y el prefijo de estado habilitado que lo deja aparecer aunque el
  botón esté deshabilitado. El negativo de `individual` sigue valiendo: el condicional no se tocó.
- **Paso 2** (D-06: vaciar, tipear `1` → sale `2`, tipear `007` → sale `7` sin reescribir bajo el
  cursor): `onTextChange` corta en vacío sin propagar, `onInputFocus` enciende el ref y `onInputBlur`
  normaliza con el piso del modo. Es el paso que importa y describe el comportamiento real.
- **Paso 3** (R2-2: `Guardar` aparece al ensuciar, desaparece al revertir, guarda con toast; tocar
  `Clase grupal` no hace nada): ninguna de esas piezas se movió.

## Issues Encountered

Ninguno.

## Next Phase Readiness

Última plan de la fase. La Phase 17 cierra con la **tercera ronda de UAT** del guion de este plan:
tres pasos, a 375px, sobre el dev server que ya está corriendo en el puerto 3000 (sigue vivo y
respondiendo). Después de la UAT, la fase queda lista para `secure-phase` y `code-review`, que ahora
cubren también esta pieza.

## Self-Check: PASSED

- `app/(dashboard)/settings/settings-client.tsx` existe en disco.
- `17-09-SUMMARY.md` existe en disco.
- Commits `07f4df7` (Task 1) y `cd43646` (Task 2) presentes en `git log`.
- Los criterios de aceptación de las DOS tasks se re-corrieron enteros después del último cambio: todos PASS.
