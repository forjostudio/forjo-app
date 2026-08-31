---
phase: quick-260831-di2
plan: 01
subsystem: dashboard/agenda
tags: [ui, a11y, estado-sucio, audit-visual, phase-19]
requires:
  - "Phase 19 (El panel) ejecutada y auditada (19-UI-REVIEW.md, 18/24)"
provides:
  - "Los dos Select de duración/descanso adentro del contrato de guardado (ensucian + se congelan)"
  - "Objeto único `hoursConfig`: lo que persiste el botón y lo que lee el UPDATE son el mismo objeto"
  - "Las dos live regions montadas desde el inicio, con el contenido condicionado adentro"
  - "`Ver todos (N)` cuenta servicios del negocio, no el comodín"
  - "19-UI-SPEC.md enmendado (2026-08-31) y 19-UI-REVIEW.md con su sección Resolución"
affects:
  - "app/(dashboard)/agenda/agenda-client.tsx (card de grilla semanal + línea de chips)"
tech-stack:
  added: []
  patterns:
    - "`disabled` en la raíz `<Select>`, no en el `SelectTrigger` (patrón in-repo: app/(crm)/admin/negocios/[id]/ficha-client.tsx:407)"
    - "Live region siempre montada + contenido condicionado; `sr-only` cuando el nodo no puede ser item de un flex"
key-files:
  created: []
  modified:
    - "app/(dashboard)/agenda/agenda-client.tsx"
    - ".planning/workstreams/motor-reservas/phases/19-el-panel/19-UI-SPEC.md"
    - ".planning/workstreams/motor-reservas/phases/19-el-panel/19-UI-REVIEW.md"
decisions:
  - "El congelamiento va en la raíz `<Select>` (patrón vivo del repo), no en el `SelectTrigger` como sugería el audit"
  - "La live region del comodín va `sr-only` (fuera del flujo) en vez de montar siempre el contenedor visible: ese contenedor es item del flex `gap-x-2` y correría la fila 8px"
  - "`total` sigue decidiendo el colapso; sólo cambia el número que se le muestra al dueño"
  - "Se re-arma `hoursDirty` en la rama de `bizError` (agujero que el audit no nombra)"
metrics:
  duration: "~35 min"
  completed: "2026-08-31"
  tasks: 3
  commits: 4
status: complete
---

# Quick 260831-di2: Cerrar los 3 hallazgos del audit visual 6-pilares — Summary

Los dos `Select` que el botón "Guardar horarios" persiste entraron al contrato de guardado (ensucian el
estado y se congelan), las dos live regions de la fase ahora existen antes de tener contenido, y el
trigger de colapso dejó de contar el chip comodín — con el contrato de diseño enmendado para que la
regla no vuelva a quedar escrita como una enumeración.

## Qué se hizo

### Task 1 — Duración y descanso adentro del contrato (`d28654f`)

Cierra **BLOCKER-01** del audit, su causa de raíz y un segundo agujero que el audit no nombra.

- Los dos `useState` sueltos (`slotDuration`, `bufferMinutes`) pasaron a un **objeto único `hoursConfig`**
  con un solo camino de escritura, `updateHoursConfig`, que prende `setHoursDirty(true)` **primero** y
  después mergea — la misma forma que los seis mutadores de la grilla.
- El `UPDATE` a `businesses` lee de ese mismo objeto. Lo que el botón persiste y lo que el editor tiene en
  memoria dejaron de ser dos listas que hay que acordarse de sincronizar.
- `disabled={savingHours}` en la **raíz `<Select>`** de los dos controles (8 → **10** controles congelados
  en la card). Se usó la raíz y no el `SelectTrigger` que sugería el audit: es el patrón vivo del repo
  (`app/(crm)/admin/negocios/[id]/ficha-client.tsx:407`) y el trigger ya trae `disabled:opacity-50` en su
  className base, así que el apagado visual queda consistente con los otros 8 controles.
- **Agujero extra, no reportado por el audit:** `setHoursDirty(false)` corre *antes* del UPDATE. Si el RPC
  salía bien y el UPDATE fallaba, el toast decía la verdad ("los horarios se guardaron, pero no la duración
  ni el descanso") mientras la señal visual ya estaba apagada. La rama de `bizError` ahora vuelve a prender
  `hoursDirty`: `setHoursDirty(true)` pasó de 6 a **8** ocurrencias (6 mutadores + `updateHoursConfig` +
  `bizError`).
- El docblock de `saveHours` se **extendió** (no se reescribió): sube de la enumeración de controles a la
  regla "todo lo que este botón persiste tiene que ensuciar y congelarse". El razonamiento de CR-01 y el de
  "deshabilitar y no `if (savingHours) return`" quedaron intactos.

### Task 2 — Las live regions existen antes de tener contenido (`16f05c6`)

Cierra **WARNING-03**. Una región que se monta junto con su texto no la locuta ningún lector.

- **Comodín:** región `sr-only` **siempre montada** como primer hijo del `div role="group"`, con el texto
  condicionado adentro. El chip visible quedó **byte-idéntico** salvo que perdió el `role="status"` y ganó
  `aria-hidden="true"` para no leerse dos veces.
- **"Cambios sin guardar":** nodo siempre montado, texto condicionado. Acá no hizo falta desacoplar (es el
  último hijo de un flex de ancho completo; vacío no mueve nada visible). Sigue siendo el único lugar de la
  fase que usa el token `--warning`, y sigue siendo polite.
- Los comentarios del chip comodín se reescribieron para que describan el mecanismo real, incluido **por qué
  la región va fuera del flujo**.

### Task 3 — El contador y el contrato al día (`d73c58b`)

- **Código:** el trigger pasa a `Ver todos (${shown.length})`. `total` no se tocó y sigue siendo lo único que
  decide `collapsible`: el comodín cuenta para el **umbral** (ocupa lugar) pero no para el **número mostrado**.
  La distinción quedó escrita en el comentario.
- **`19-UI-SPEC.md`:** enmienda fechada `2026-08-31` al pie de la sección de estados (sin borrar la del
  2026-08-26) + 4 retoques: la fila `Guardando` pasa de enumeración a **regla** con la excepción declarada
  del trigger "Ver todos" (esto cierra además el **WR-07 documental**), los snippets de la live region del
  comodín y del indicador de estado sucio, y el snippet del trigger con la aclaración umbral vs número. El
  checklist de accesibilidad y la fila de D-16 dejaron de decir que el chip lleva `role="status"`.
- **`19-UI-REVIEW.md`:** sección `## Resolución (2026-08-31, quick 260831-di2)` con el mismo formato de tabla
  que `19-REVIEW.md`, y disposición explícita de todo: 3 priorizados + WR-07 fixed, 6 menores no aplicados,
  WR-05/WR-06 fuera de alcance, D-13 diferido, y los `NO VERIFICADO` de los pilares 2/3/5/6 abiertos.

## Divergencias deliberadas respecto del audit

No son deviations del plan: el plan las midió contra el código antes de escribirse y las eligió a propósito.

1. **La corrección que sugería el audit para las live regions rompía el layout.** Montar siempre el
   contenedor *visible* del comodín lo deja como item del flex `gap-x-2`: vacío mide 0 de ancho pero **igual
   consume su gap de 8px**, así que la fila de chips se correría al aparecer y desaparecer el comodín — un
   desplazamiento nuevo justo en la interacción del **escenario #2 de la UAT, ya aprobado el 2026-08-27**.
2. **`disabled` en la raíz, no en el `SelectTrigger`.** Patrón in-repo.
3. **El agujero del `setHoursDirty(false)` prematuro** no está en el audit y se cerró igual: es el mismo
   defecto de clase.

## Deviations from Plan

Una sola, de entorno (Rule 3 — blocking issue):

**1. [Rule 3 - Blocking] El shell recibe el `PATH` de Windows sin convertir y `node` no resuelve**
- **Found during:** Task 1, Paso 0 (baseline de eslint)
- **Issue:** los comandos de verificación del plan prefijan `export PATH="/c/Program Files/Git/usr/bin:$PATH"`
  para tener `grep`/`sed`/`git`, pero eso deja fuera `node`, y `./node_modules/.bin/eslint` moría con
  `exec: node: not found`.
- **Fix:** se agregó `/c/Program Files/nodejs` al prefijo de PATH en todos los comandos de verificación. Cero
  cambios en el código y cero cambios en los gates.
- **Files modified:** ninguno.

Fuera de eso, el plan se ejecutó tal cual está escrito.

## Verificación

| Gate | Resultado |
|---|---|
| `./node_modules/.bin/tsc --noEmit` (binario local) | limpio, exit 0 |
| eslint acotado a `agenda-client.tsx` | `1 problem (1 error, 0 warnings)` — idéntico al baseline (`eslint-baseline.txt`), el `react-hooks/purity` de D-13. **Cero hallazgos nuevos** |
| `npm test` | **82 archivos, 1067 passed** (4 expected fail, 1 skipped) |
| `disabled={savingHours}` | 8 → **10** |
| `setHoursDirty(true)` | 6 → **8** |
| `role="status" className="sr-only"` | **1** |
| `<span aria-hidden="true" className="inline-flex min-h-11 items-center">` | **1** |
| `Ver todos (${shown.length})` en código y en el spec | **1** y **1** |
| `## Resolución` en `19-UI-REVIEW.md` | **1** |
| `git status --porcelain` sobre `19-UAT.md` | **vacío** — la UAT de la fase 19 sigue abierta e intacta |
| Alcance del diff | 3 archivos + el baseline de eslint. Cero cambios en `supabase.rpc`, `buildSaveHoursPayload`, `buildDayStatesFromRows`, `validateBlocks`, `classifySaveHoursError` ni en la vista semanal |

## Verificación humana PENDIENTE (no ejecutada, no aprobada)

El `human-check` de la Task 2 **queda abierto**. Se dejó deliberadamente fuera de un
`checkpoint:human-verify` porque con `auto_advance: true` un checkpoint se auto-aprueba sin que nadie abra
un navegador — trampa ya documentada del proyecto. **Nadie lo ejecutó ni lo aprobó.** Lo cierra una persona,
**después del deploy**, con un lector de pantalla real (NVDA / Narrador / VoiceOver):

1. Panel → **Agenda** → card de la grilla semanal, negocio con servicios cargados.
2. En una franja con al menos un servicio marcado, apagar el **último** chip: el lector tiene que locutar
   **"Cualquier servicio"** cuando reaparece el comodín.
3. Volver a marcar un servicio: el lector **no** debe anunciar nada nuevo.
4. Cambiar un horario o la duración del turno: el lector tiene que locutar **"Cambios sin guardar"**.
5. **No-regresión de layout (protege el escenario #2 de la UAT, ya PASADO el 2026-08-27):** a **375px**, mirar
   la fila de chips de una franja en comodín y marcar el primer servicio. La fila **no** puede saltar de alto
   **ni correrse de lado**. Si se corre, el fix reintrodujo un item de flex donde no debía haberlo.
6. Con el guardado en vuelo ("Guardando..."), los dos `Select` tienen que verse apagados como el resto de la
   card y no abrirse al clickearlos.

También quedó registrado como pendiente en la tabla de Resolución de `19-UI-REVIEW.md`.

## Para el próximo que toque esta pantalla

- **`hoursConfig` ES el contrato.** Agregarle un campo lo hace ensuciar el estado solo (el único camino de
  escritura es `updateHoursConfig`), y el UPDATE lo lee del mismo objeto. **Pero el control nuevo igual
  necesita su `disabled`:** la mitad del congelamiento sigue siendo **manual**, control por control. Esa es
  la única parte que hay que recordar, y es exactamente la que falló hasta hoy.
- **La live region del comodín va `sr-only` a propósito y no puede volver a envolver al chip visible.** Si es
  item del flex, la fila se corre un gap al aparecer/desaparecer el comodín y rompe el escenario #2 de la UAT
  que ya pasó.
- **Umbral ≠ número mostrado.** El comodín cuenta para decidir si la línea colapsa; no cuenta en el `(N)`.

## Threat Flags

Ninguna. El cambio es estado y JSX de un componente cliente del dashboard: sin queries nuevas, sin RPC, sin
migraciones, sin rutas, sin dependencias. Los cruces de confianza del plan (`T-di2-01` tampering del UPDATE y
`T-di2-02` repudiación de la señal ante fallo parcial) quedaron **mitigados** por el congelamiento y el
re-armado de `hoursDirty`; el resto del registro estaba dispuesto como `accept`.

## Known Stubs

Ninguno.

## Commits

| Task | Commit | Qué |
|---|---|---|
| 1 | `d28654f` | Duración y descanso adentro del contrato de guardado |
| 2 | `16f05c6` | Las dos live regions existen antes de tener contenido |
| 3 | `d73c58b` | El contador sin el comodín + spec enmendado + Resolución del review |
| — | (este) | SUMMARY + hash de la Task 3 en la tabla de Resolución |

## Self-Check: PASSED

Los 5 archivos declarados existen en disco y los 4 commits (`d28654f`, `16f05c6`, `d73c58b`, `f986576`)
existen en `git log`. Sin ítems faltantes.
