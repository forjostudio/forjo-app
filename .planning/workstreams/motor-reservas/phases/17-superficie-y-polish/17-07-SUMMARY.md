---
phase: 17-superficie-y-polish
plan: 07
subsystem: ui
tags: [agenda, tailwind, mobile, layout, 375px, badge, ocupacion]

requires:
  - phase: 17-superficie-y-polish
    provides: "17-05 llevó el contador de ocupación a la grilla de la agenda (el chip de una sola fila que rompió a 375px)"
provides:
  - "El chip del slot grupal en dos niveles: hora + nombre arriba, contador de ocupación abajo"
  - "El contador acotado al ancho del chip, sin poder desbordar el borde redondeado"
  - "La medición del ancho real de la celda del día a 375px, anotada en el código y acá"
affects: [agenda, grilla semanal, mobile, futuras superficies con dato nuevo a 375px]

tech-stack:
  added: []
  patterns:
    - "El dato nuevo se lleva su propia línea en vez de pelear por ancho horizontal (precedente: fila mobile de Finanzas, POLISH-10)"
    - "Tope duro de ancho en el call-site del Badge, apoyado en el recorte que la base del componente ya trae"

key-files:
  created: []
  modified:
    - "app/(dashboard)/agenda/agenda-client.tsx"

key-decisions:
  - "Se eligió bajar el contador a su propia línea (opción a de la UAT) porque la medición le devuelve ~77px al nombre; acortar el aviso de seña recuperaba ~48px y seguía truncando, y pasar la grilla a una columna tocaba una superficie que hoy funciona"
  - "Cero cambios de color: el defecto se reproduce idéntico en claro y oscuro, lo que confirma que es puro layout; el contraste del badge ya estaba medido (7.07:1 oscuro, 5.12:1 claro)"
  - "El nivel 1 del chip es un span, no un control: el slot sigue siendo un único clickeable"
  - "lib/agenda-occupancy.ts y su suite quedaron sin diff — el arreglo es de pintura, no de cálculo"

patterns-established:
  - "Composición a 375px: cuando una fila ya está llena, el dato nuevo baja de nivel; no se recorta información ni se rehace la grilla"

requirements-completed: [POLISH-09]

duration: 12min
completed: 2026-08-24
status: complete
---

# Phase 17 Plan 07: Cierre de G-03 — el nombre de la clase vuelve a leerse en la agenda Summary

**El chip del slot grupal pasó a dos niveles (hora + nombre arriba, contador abajo) y el contador quedó acotado al ancho del chip: a 375px el nombre pasó de ~0px a ~77px y el badge ámbar ya no puede desbordar el borde redondeado.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-24 15:33 -03
- **Completed:** 2026-08-24 15:45 -03
- **Tasks:** 2 de 2
- **Files modified:** 1

## La medición, para que nadie la vuelva a deducir

Anotado también en el código, junto al chip:

| Magnitud | Valor a 375px |
|---|---|
| Ancho de la ventana | 375px |
| Menos el relleno del layout (`p-4`) y el de la Card (`p-6`) | 375 − 32 − 48 = 295px |
| La grilla semanal es de **dos** columnas, con su separación | ~143px por celda de día |
| Menos el relleno de la celda y el del chip | **~115px de contenido útil** |
| La hora | ~32px |
| El contador ámbar `3/6 · 1 sin seña` | ~93px |
| **Total en un solo renglón** | 32 + 93 + separaciones = **~137px contra 115** |

De ahí el síntoma que reportó la UAT: al nombre le quedaba cero y `Yoga grupal` **no se veía**, mientras el contador se salía del borde.

**Después del cambio:** el primer renglón tiene los 115px para sí, la hora se lleva ~32px y la separación ~6px ⇒ **el nombre dispone de ~77px**, que alcanza para `Yoga grupal` entero. El contador ocupa el segundo renglón completo.

## Accomplishments

- **G-03 cerrado en el nivel de composición**, no con un parche de texto: el nombre recuperó ancho real en vez de perder información.
- **El desborde tiene ahora un tope duro.** El caso peor del contador (`6/6 lleno · 1 sin seña`, ~119px) supera igual los ~115px del chip; con el ancho acotado ese exceso se recorta **adentro** del badge —la base del componente ya es de recorte— en vez de salirse del borde redondeado. Y como el cupo va primero en el orden fijo del UI-SPEC §4.4, lo que cede en ese extremo es la cola del aviso de seña, **nunca la cifra**.
- **La accesibilidad no dependió del arreglo:** el `aria-label` del botón dice la ocupación y el aviso de seña con palabras y **no se tocó**, así que el recorte visual del caso peor no puede dejar al dueño sin el dato (T-17-34).
- **Se retiró una redundancia del call-site:** el badge declaraba que no encoge cuando la base del componente ya lo trae — era justamente lo que hacía que desbordara en vez de ceder.

## Task Commits

1. **Task 1: El chip del slot grupal pasa a dos niveles** — `4093abf` (fix)
2. **Task 2: El badge no puede volver a desbordar el chip** — `bfcd3ed` (fix)

## Files Created/Modified

- `app/(dashboard)/agenda/agenda-client.tsx` — rama `entry.kind === 'group'` de la celda del día: el `<button>` apila en lugar de alinear en un renglón, se agregó un `span` envolvente para hora + nombre, y la invocación de `OccupancyBadge` de esa rama quedó acotada al ancho del chip. Único archivo de código tocado.

## Lo que NO se tocó (y se verificó que no cambió)

- `lib/agenda-occupancy.ts` y `test/agenda-occupancy.test.ts`: `git diff --stat` **vacío**, suite en **20/20** (T-17-33).
- El chip del **recurso simultáneo** y el del **turno individual** (D-12): sin cambios. El badge del simultáneo conserva su `mt-0.5` — ya vivía en su propia línea y por eso nunca se rompió; es el precedente, no el objetivo.
- `statusChip`, los colores, `--warning` y las opacidades: intactos.
- El `aria-label` del botón y el `title` del badge: intactos.
- `package.json` / `package-lock.json`: sin diff — la fase no agregó dependencias (T-17-SC).
- `app/(dashboard)/settings/` y `app/(dashboard)/finances/`: sin diff (17-06 acababa de aterrizar en settings).

## Comportamiento que se sostuvo

- **Un solo clickeable por slot** (D-10): el nivel 1 es un `span`, no un control; sigue habiendo exactamente una llamada a `setRosterSlot` en la rama de grupo y dos consumidores del badge en el archivo (T-17-35).
- **El roster sigue abriéndose con `{date, time, serviceId}`**, así que el filtrado por servicio que la UAT confirmó a mano (test 8: Dora Paz no aparece bajo Yoga) no se vio afectado — no se tocó ni el `onClick` ni el `key`.
- **La agrupación no se tocó**: `buildDayEntries` sigue siendo la única fuente de las filas, así que dos clases a la misma hora siguen sin fusionarse (test 7).
- **El contador sigue siempre visible** aunque el cupo no esté lleno (D-10) y sigue saliendo de `services.capacity` (D-11) — el cálculo no se rozó.

## Decisions Made

Ninguna decisión nueva: el plan traía la opción elegida con la aritmética que la sostiene y se ejecutó tal cual.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- El archivo tiene finales de línea CRLF, así que el primer intento de reemplazo por anclas exactas no encontró el texto. Se ajustaron las anclas y se aplicó igual. Sin impacto en el resultado.

## Verificación

| Gate | Resultado |
|---|---|
| `./node_modules/.bin/tsc --noEmit` | exit **0** |
| `npx vitest run test/agenda-occupancy.test.ts --no-file-parallelism` | **20 passed** |
| `npm run build` | compila |
| El chip apila | 1 (base: 0) |
| El nivel 1 existe | 1 (base: 0) |
| Contenedores en columna del archivo | **4** (base: 3) |
| El nombre conserva su truncado | 1 |
| `setRosterSlot({ date: entry.date` | 1 |
| `<OccupancyBadge` | 2 |
| `capacityFor(` | 0 (sigue jubilada por la migr. 068) |
| El tope de ancho | 1 (base: 0) |
| La redundancia retirada | **8** (base: 9) |
| El badge del simultáneo | 1, sin cambios |
| `git diff --stat` sobre el módulo puro y su suite | vacío |
| `git diff --stat` | un solo archivo de código |

## Known Stubs

Ninguno.

## Next Phase Readiness

- **Falta la confirmación visual a 375px**, que por diseño **no es tarea de este plan**: va a la segunda ronda de UAT (guion en `17-08-PLAN.md`). Hay que mirar el chip de Yoga en la celda del viernes 21 de agosto, en claro y en oscuro, y confirmar que el nombre se lee entero y que el contador queda adentro del borde.
- El servidor de desarrollo del puerto 3000 quedó vivo para esa ronda.
- ⚠ Si se corrió `supabase db reset` después del 2026-08-20, el fixture de la UAT se perdió y hay que resembrarlo (ver la cabecera de `17-UAT.md`).

---
*Phase: 17-superficie-y-polish*
*Completed: 2026-08-24*

## Self-Check: PASSED

Archivos y commits verificados en disco y en `git log`.
