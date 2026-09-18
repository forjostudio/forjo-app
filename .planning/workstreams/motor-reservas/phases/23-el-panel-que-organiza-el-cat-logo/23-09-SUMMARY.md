---
phase: 23-el-panel-que-organiza-el-cat-logo
plan: 09
subsystem: ui
tags: [tailwind, flexbox, css-grid, responsive, settings-client, layout]

requires:
  - phase: 23-el-panel-que-organiza-el-cat-logo
    provides: "la tarjeta de servicio con la grilla de dos columnas de G-23-20, la fila derivada de las acciones (WR-03) y la zona de exclusión táctil de G-04"
provides:
  - "el `<p>` del nombre del servicio envuelve en mobile en vez de desbordar la tarjeta (G-23-21)"
  - "el rótulo del modo de cupo y el stepper comparten UNA línea en desktop, con la tarjeta 26% más baja (G-23-23)"
  - "el padding vertical del control de cupo gateado al viewport donde hay dedo (`py-6 sm:py-0`)"
  - "la fórmula de la fila de las acciones actualizada al envoltorio único"
affects: [23-10, uat-visual-fase-23, tarjeta-de-servicio]

actuals:
  tokens: 4875
  tasks: 3
  commits: 3   # MEDIDO: git rev-list --count ${plan_head_before}..HEAD (2 de código + 1 de este SUMMARY)

plan_head_before: b3c5d0c4c65f7301cf4c4e0cce682c899837e688

tech-stack:
  added: []
  patterns:
    - "min-w-0 + break-words como par indivisible en un `<p>` que es flex item sin recorte"
    - "un envoltorio flex-col/sm:flex-row como único hijo de grilla para dos bloques que apilan en mobile y comparten línea en desktop"
    - "el gate de viewport viaja con el envoltorio, no con su contenido: un envoltorio vacío reclama fila"

key-files:
  created: []
  modified:
    - "app/(dashboard)/settings/settings-client.tsx"

key-decisions:
  - "G-23-21 se cierra con `min-w-0` y NO con `break-all` ni `overflow-wrap:anywhere`: los tres candidatos resuelven el desborde, pero `break-all` parte nombres normales a mitad de palabra y ninguna de las dos reglas agresivas tiene un solo precedente en el repo (0 usos contra 73 de `min-w-0`, dos de ellos en este mismo archivo sobre el mismo shape)"
  - "El gate `capMode === 'individual' && 'sm:hidden'` se MUDA al envoltorio en vez de quedarse en la línea de datos: con el gate en el lugar viejo, el envoltorio vacío reclama una fila de 0px + 8px de hueco y manda la cobertura POR DEBAJO de los botones (WR-03 reabierto)"
  - "El padding del control se gatea con `sm:py-0` y NUNCA con `py-0` a secas: abajo de 640px esos 24px son la zona de exclusión de G-04, sin la cual un toque corregido por el navegador escribe el cupo"
  - "La sonda de medición vive fuera del repo y no se commitea: es un instrumento, no un artefacto del proyecto"

patterns-established:
  - "Sonda de layout en iframes de ancho fijo: Chrome headless IGNORA --window-size, así que montar la sonda en un iframe del ancho pedido es lo único que hace evaluar las media queries de `sm:` contra el viewport correcto; el resultado vuelve por postMessage"
  - "La sonda renderiza HOY y NUEVO en la MISMA corrida: el antes/después se mide con el mismo instrumento, sin tocar git"

requirements-completed: [CAT-11]

coverage:
  - id: D1
    description: "G-23-21 — a 375px un nombre de 41 caracteres sin espacios envuelve adentro de la tarjeta en vez de salirse 36.88px"
    requirement: CAT-11
    verification:
      - kind: automated_ui
        ref: "scratchpad/probe-23-09.html + check-23-09.js — 375 nombre 41ch: 307.88px/1 renglón/36.88 afuera → 271px/2 renglones/0 afuera"
        status: pass
      - kind: other
        ref: "gate de región: el `<p>` del nombre lleva min-w-0 + break-words + sm:truncate y la región no tiene reglas de corte agresivas"
        status: pass
    human_judgment: false
  - id: D2
    description: "G-23-21 — el mismo nombre con la pill 'Sin cobertura' al lado tampoco desborda (hoy 147px afuera)"
    requirement: CAT-11
    verification:
      - kind: automated_ui
        ref: "check-23-09.js — 375 nombre 41ch + pill: 151px afuera → 0; scrollWidth-clientWidth de la tarjeta = 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "El nombre sigue truncando en UNA línea en desktop y la columna izquierda no pierde ancho"
    verification:
      - kind: automated_ui
        ref: "check-23-09.js — 640 nombre 82ch: trunca=true, 1 renglón, colIzq 368.48 → 368.48 (sin cambio)"
        status: pass
    human_judgment: false
  - id: D4
    description: "G-23-23 — en desktop el rótulo del modo y el stepper del cupo comparten UNA línea"
    requirement: CAT-11
    verification:
      - kind: automated_ui
        ref: "check-23-09.js — 1280 compartido+sedes+cobertura: mismaLínea false → true (mismo centro vertical)"
        status: pass
    human_judgment: false
  - id: D5
    description: "La tarjeta con cupo compartido + sedes + cobertura se compacta 72px en desktop"
    requirement: CAT-11
    verification:
      - kind: automated_ui
        ref: "check-23-09.js — 1280: 276.5 → 204.5 (−72px, idéntico al −72px del reporte de debug); filas [20,36,34,26.5,32] sin la de 82px ni la de 16px suelta"
        status: pass
    human_judgment: false
  - id: D6
    description: "Con cupo individual en desktop NO queda ninguna fila vacía ni de 0px"
    verification:
      - kind: automated_ui
        ref: "check-23-09.js — 1280 cfg1 filas [20,36,32] y cfg3 filas [20,36,26.5,32], hasZeroRow=false en las dos"
        status: pass
    human_judgment: false
  - id: D7
    description: "Las acciones caen en la ÚLTIMA fila en las 5 configuraciones y ningún hijo de la columna izquierda queda por debajo (WR-03 no se reabre)"
    verification:
      - kind: automated_ui
        ref: "check-23-09.js — filas de las acciones 3/3/4/4/5 exactas; ultimaIzq <= acciones en las 5"
        status: pass
      - kind: other
        ref: "gate de región: la fila de las acciones sigue derivada por variable CSS, no anclada a un número fijo"
        status: pass
    human_judgment: false
  - id: D8
    description: "Mobile bit-idéntico: el ritmo de 8px, las separaciones de 33px y el alto de la tarjeta no cambiaron"
    verification:
      - kind: automated_ui
        ref: "check-23-09.js — 375: línea→botón 33/33, botón→'Se ofrece en:' 32/32, alto 346 → 346; 4 combinaciones de nombre normal con ancho y alto idénticos"
        status: pass
    human_judgment: false
  - id: D9
    description: "El padding vertical del control de cupo sigue vigente por debajo de 640px (zona de exclusión de G-04 donde hay dedo)"
    verification:
      - kind: other
        ref: "gate: `py-6 sm:py-0` aparece una sola vez y el conteo total de paddings verticales de 24px del archivo sigue siendo 1"
        status: pass
      - kind: automated_ui
        ref: "check-23-09.js — el ritmo de 33px de mobile se conserva, que es el padding renderizándose"
        status: pass
    human_judgment: false
  - id: D10
    description: "La tarjeta se ve y se opera bien en el navegador real: nombre largo en el teléfono, modo+cupo en una línea en la compu, foco por teclado y el cupo editable desde la tarjeta"
    verification: []
    human_judgment: true
    rationale: "Los siete `human-check` del Task 3 son juicio visual y de interacción sobre un navegador real con el negocio de prueba. La sonda mide geometría sobre una reconstrucción de la caja; no ve el render de React, ni el foco, ni el guardado del cupo."

duration: 30min
completed: 2026-09-18
status: complete
---

# Phase 23 Plan 09: G-23-21 y G-23-23 — el nombre que envuelve y la tarjeta que se compacta Summary

**El `<p>` del nombre gana `min-w-0` (su mínimo automático de flex item era lo que le impedía encoger) y la línea de datos se fusiona con el control del cupo en un único hijo de grilla con el padding táctil gateado a mobile: el nombre de 41 caracteres deja de salirse 36.88px de la tarjeta y la tarjeta de cupo compartido baja 72px en desktop.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-09-18T18:02Z (aprox.)
- **Completed:** 2026-09-18T18:32Z
- **Tasks:** 3 de 3
- **Files modified:** 1

## Accomplishments

- **G-23-21 cerrado y medido.** El `<p>` del nombre lleva ahora `min-w-0` junto a `break-words` y `sm:truncate`. A 375px el párrafo pasa de 307.88px en un renglón (36.88px afuera de la tarjeta) a 271px en dos renglones con 0 de desborde, y con la pill "Sin cobertura" al lado pasa de 151px afuera a 0. La tarjeta ya no gana scroll horizontal en ninguno de los dos casos.
- **G-23-23 cerrado y medido.** La línea de datos y el control del cupo son un único hijo de grilla que apila en mobile y alinea en fila en desktop, y el padding vertical del control tiene su contraparte de desktop en cero. El rótulo del modo y el stepper comparten centro vertical, y la configuración de la captura del dueño baja de 276.5px a 204.5px: **−72px, exactamente la compactación que midió la sesión de debug**. Las filas de la grilla pasan de tener una de 16px (el rótulo solo) y otra de 82px (el control con 48px de padding) a una sola de 34px.
- **WR-03 no se reabrió, y está medido en las cinco configuraciones.** El gate de cupo individual se mudó al envoltorio y el sumando de `leftRows` bajó de 2 a 1: las acciones caen en las filas 3/3/4/4/5, ningún hijo de la columna izquierda queda en una fila posterior, y con cupo individual no queda ninguna fila de 0px.
- **Mobile es bit-idéntico y también está medido.** Los 33px de la línea de datos al botón (−), la separación al bloque de sedes y el alto de 346px de la configuración más cargada dan igual antes y después, y las cuatro combinaciones de nombre normal tienen ancho de párrafo y alto de tarjeta idénticos al centésimo de píxel.
- **Sonda nueva, reusable y con un hallazgo propio:** Chrome headless **ignora `--window-size`**, así que una sonda que mida media queries tiene que montarse en un `<iframe>` del ancho pedido. La sonda renderiza HOY y NUEVO en la misma corrida, lo que hace el antes/después con un solo instrumento y sin tocar git.

## Task Commits

1. **Task 1: G-23-21 — el nombre largo envuelve en mobile** — `24087b7` (fix)
2. **Task 2: G-23-23 — el modo y el cupo comparten una línea en desktop** — `3259e60` (fix)
3. **Task 3: medición en Chrome headless + cierre del repo** — sin commit de código (tarea de medición; la sonda vive fuera del repo por decisión del plan)

**Plan metadata:** ver el commit `docs(23-09)` de este SUMMARY.

## Files Created/Modified

- `app/(dashboard)/settings/settings-client.tsx` — el `<p>` del nombre con `min-w-0`; el envoltorio nuevo que unifica la línea de datos y el control del cupo (y que se lleva el gate de viewport y la declaración de columna); el div intermedio del control eliminado; `py-6 sm:py-0` en el contenedor interno de `CapacityInlineControl`; el sumando de `leftRows` para cupo compartido de 2 a 1; los comentarios de D-07, G-04 y "ESTRUCTURA DE LA TARJETA" actualizados.

**Fuera del repo (instrumento, no artefacto):**
- `scratchpad/probe-23-09.html` — la sonda: reproduce la cadena real de contenedores (main p-4 → Card p-6 → tarjeta p-3 = 271px de interior a 375px) con el **CSS del build de producción** (`.next/static/chunks/*.css`) y las fuentes reales, y renderiza cada caso en las dos variantes.
- `scratchpad/probe-host-23-09.html` — el host con los tres iframes (375 / 640 / 1280).
- `scratchpad/check-23-09.js` — el comparador contra los umbrales del plan.
- `scratchpad/measured-23-09.txt` — la salida completa de la última corrida.

## La medición (Task 3)

Corrida con Chrome headless (`--dump-dom`), cero paquetes nuevos. **54/54 mediciones dentro de umbral, exit 0.** Los números que cita el plan:

| Medición | Viewport | HOY | NUEVO | Umbral |
|---|---|---|---|---|
| `<p>` del nombre de 41ch | 375 | 307.88px, 1 renglón, 36.88 afuera | **271px, 2 renglones, 0 afuera** | 271 / 2 / 0 ✅ |
| lo mismo con la pill | 375 | 151px afuera | **0 afuera** | 0 ✅ |
| `scrollWidth − clientWidth` de la tarjeta | 375 | — | **0** (con y sin pill) | 0 ✅ |
| 4 combinaciones de nombre normal | 375 | 37.38/185 · 258.39/185 · 37.38/191.5 · 156.66/205 | **idénticos al centésimo** | sin cambio ✅ |
| nombre de 82ch: truncado y ancho de la columna izquierda | 640 | 368.48px, truncando | **368.48px, truncando, 1 renglón** | sin cambio ✅ |
| rótulo y stepper, ¿misma línea? | 1280 | no | **sí** | sí ✅ |
| alto con compartido + sedes + cobertura | 1280 | 276.5px | **204.5px (−72px)** | ≤210 ✅ |
| filas de la grilla en esa configuración | 1280 | [20 36 16 82 26.5 32] | **[20 36 34 26.5 32]** | sin la de 82 ni la de 16 ✅ |
| fila de las acciones en las 5 configuraciones | 1280 | — | **3 · 3 · 4 · 4 · 5**, ningún hijo de la izquierda por debajo | exacto ✅ |
| cupo individual: ¿alguna fila de 0px? | 1280 | — | **no** ([20 36 32] y [20 36 26.5 32]) | no ✅ |
| línea de datos → botón (−) · botón → "Se ofrece en:" | 375 | 33px · 32px | **33px · 32px** | sin cambio ✅ |
| alto compartido + sedes + cobertura | 375 | 346px | **346px** | sin cambio ✅ |

### Números que NO coinciden con el reporte de debug, y por qué (se reportan, no se improvisan)

El plan pide reportar cualquier número que contradiga el reporte. Hay tres, y los tres son **diferencias entre dos reconstrucciones**, no efectos del cambio — se dan **idénticos en la variante HOY de esta misma sonda**, sobre filas que este plan no toca:

1. **Altos absolutos de las 5 configuraciones de desktop.** Esta sonda mide 128 / 130 / 162.5 / 170 / 204.5 contra los 126 / 128 / 156 / 168 / 198 de la sesión de debug: un offset constante de +2px, que sube a +6.5px en las dos configuraciones que llevan cobertura (la fila de las píldoras de sedes mide 26.5px acá y 24px allá). **Lo vinculante sí coincide y con precisión**: la compactación de la configuración de la captura da **−72.0px**, el mismo número del reporte, y la tabla de filas de las acciones da exacta en las cinco. Por eso los altos absolutos quedan como informativos con su offset impreso, y lo que se asserta es la compactación HOY→NUEVO medida con el mismo instrumento.
2. **Desborde con la pill:** 151px acá contra los 147px del reporte (ancho de la pill reconstruida). El signo y el cierre son los mismos: >0 → 0.
3. **Ancho de la columna izquierda a 640px:** 368.48px acá contra 363.31px allá. Lo que el plan exige es que **no cambie**, y no cambia: 368.48 → 368.48.

También hubo **tres defectos de la sonda misma**, encontrados y corregidos antes de dar ningún número por bueno: el iframe traía barra de scroll y dejaba el interior de la tarjeta en 256px en vez de 271 (`html { overflow: hidden }`), el conteo de renglones usaba `getClientRects()` sobre un bloque (siempre 1) y luego un `Range` que devuelve 2 sobre texto recortado con `nowrap` (pasó a derivarse del alto contra la altura de línea), y la separación al bloque de sedes se anclaba al span del rótulo en vez de a la caja.

## Cierre del repo

- `npm run build` — **verde**.
- Suite completa — **95 archivos / 1301 casos pasados** (+ 4 expected fail, 1 skipped). Pisos del plan: 95 / 1301.
- `eslint` sobre el archivo — **11 errores**, exactamente el piso preexistente medido. El cambio no agregó ninguno.
- **41 migraciones**, `package.json` y `package-lock.json` intactos.
- `tsc --noEmit` sin `error TS` fuera de `.next/` después de cada tarea.

## Gates de región

Todos los greps van sobre la clase sola, **sin prefijo de atributo**, para no repetir IN-05 (el gate de 23-08 que fallaba en falso en cuanto un hijo pasaba a componer clases con `cn()`).

| Gate | Medido | Exigido |
|---|---|---|
| hijos de la columna izquierda | 5 | 5 |
| celdas de la columna derecha | 3 | 3 |
| envoltorios en fila (`sm:flex-row`) | 1 | 1 |
| el envoltorio declara su columna | 1 | 1 |
| gates de cupo individual en la región | 1 | 1 |
| **de esos, en el envoltorio (gate crítico)** | **1** | **1** |
| gates de viewport (`sm:hidden`) | 3 | 3 |
| sumando de `leftRows` para cupo compartido | `? 1 : 0` | 1 |
| sumandos viejos sin actualizar | 0 | 0 |
| fila de las acciones derivada por variable CSS | 1 | 1 |
| padding gateado del control | 1 | 1 |
| paddings verticales de 24px en todo el archivo | 1 | 1 |
| renglón de descripción recortado (23-07) | 1 | 1 |
| aperturas del diálogo (lápiz + link) | 2 | 2 |
| divisoria y zona de exclusión de mobile | 1 | 1 |
| control de cupo montado | 1 | 1 |
| derivación única del precio | 1 | 1 |
| líneas con `from('services')` | 6 | 6 |

## Decisions Made

Ver `key-decisions` en el frontmatter. En corto: `min-w-0` y no una regla de corte agresiva; el gate de viewport viaja con el envoltorio y no con su contenido; el padding táctil se gatea a desktop y jamás se saca de mobile; la sonda no se commitea.

## Deviations from Plan

None — el plan se ejecutó exactamente como estaba escrito. Las cuatro ediciones del Task 2 y la única del Task 1 son las que el plan describe, y no hizo falta ningún arreglo fuera de guion. El único trabajo no previsto fue **dentro de la sonda** (los tres defectos de instrumento del Task 3), que es un archivo fuera del repo y forma parte de "medir", no del entregable.

## Issues Encountered

- **Chrome headless ignora `--window-size` con `--dump-dom`.** Probado con `--headless`, `--headless=old` y `--headless=new`: el viewport quedaba en 500px en los tres, así que las media queries de `sm:` se evaluaban contra un ancho equivocado. Resuelto montando la sonda en un `<iframe>` del ancho pedido, con el resultado de vuelta por `postMessage`. Queda anotado como patrón: es una trampa que se va a repetir en cualquier medición de layout responsive de este proyecto.
- **El CSS de producción no está en `.next/static/css/`** sino en `.next/static/chunks/*.css` (Turbopack): las utilidades y globals en uno de 152KB, los `@font-face` en otro de 58KB. Se linkean desde su ubicación real para que las `url()` relativas de las fuentes resuelvan solas.

## User Setup Required

None — cambio puro de layout, sin servicios externos, sin variables de entorno, sin migraciones.

## Next Phase Readiness

- **Listo para `23-10`**, que es el plan del diálogo de edición y el toggle del modo de cupo. Este plan no tocó ninguno de los dos, por contrato.
- **Los siete `human-check` del Task 3 quedan pendientes para la UAT visual** de `/gsd-verify-work`: (1) nombre de 41 caracteres a 375px, con y sin la pill; (2) mobile sin cambios en el resto de la tarjeta; (3) modo y cupo en una línea en desktop; (4) la configuración que WR-03 había roto, con cupo compartido y con individual; (5) nombre largo y precio de 7 dígitos en desktop; (6) orden de foco por teclado en las dos vistas y en la pestaña Desactivados; (7) el cupo se sigue editando y guardando desde la tarjeta.
- Sin blockers.

## Self-Check: PASSED

- `23-09-SUMMARY.md` existe en disco.
- `app/(dashboard)/settings/settings-client.tsx` existe en disco.
- Los tres commits existen en el árbol: `24087b7`, `3259e60`, `732d398`.
- `git rev-list --count b3c5d0c..HEAD` = 3, igual al `commits:` del frontmatter.

---
*Phase: 23-el-panel-que-organiza-el-cat-logo*
*Completed: 2026-09-18*
