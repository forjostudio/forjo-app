---
phase: 01-el-detalle-de-cliente-con-la-regla-de-historial-que-lo-gobie
plan: 04
subsystem: panel-clientes
tags: [uat-gap, mobile, 375px, responsive, overflow, break-all, min-w-0, area-tactil, nav-01]

requires: ["01-01"]
provides:
  - "El modal 'Fusionar duplicados' legible a 375px: nombre / teléfono / mail en TRES FILAS y el mail entero (peor desborde medido +36.4px → −13.0px)"
  - "La acción de fusionar al alcance con una ficha abierta en mobile, y sólo cuando el cliente abierto ES duplicado"
  - "La redirección `mergedInto` de la Phase 1 pasa a ser PROBABLE a mano en el celular: hasta ahora su único camino de entrada estaba oculto"
  - "Prop `onMerge?` en `ClientDetail`: el control existe sólo si el padre lo pasa (`undefined` lo apaga)"
affects: [panel-nav Phase 2 (hereda el instrumento de medición a 375px con iframe)]

actuals:
  tokens: 2401
  tasks: 2
  commits: 4
plan_head_before: 23d836d2ddefb05e2509963c3094a1467e0c77c7
commits_note: "`git rev-list --count 23d836d..HEAD` da **6**, no 4: el ejecutor del plan `01-03` corrió en paralelo sobre la misma rama `main` y commiteó `34b5115` y `6db682d` entre los míos. Los 3 de este plan, medidos por ruta (`git rev-list --count 23d836d..HEAD -- <clients-client.tsx> <01-04-SUMMARY.md>`): `0ad7f04` (Task A), `acc3bf7` (Task B), `346545b` (SUMMARY + STATE + ROADMAP) y el commit de cierre de este SUMMARY (hash no citado a propósito: citarse a sí mismo es imposible)."

tech-stack:
  added: []
  patterns:
    - "Anti-desborde de texto sin espacios: `min-w-0` en TODA la cadena de contenedores + `break-all` en el nodo del mail (un item de flex no encoge por debajo de su contenido: `min-width:auto`)"
    - "`lg:hidden` en la FILA y no en el botón: una acción exclusiva de mobile sin tocar una sola pulgada del desktop"
    - "Medición a 375px con la sonda en un IFRAME (Chrome headless ignora `--window-size` con `--dump-dom`) + CSS de Tailwind compilada vía `postcss` + `@tailwindcss/postcss` sobre `app/globals.css`"

key-files:
  created: []
  modified:
    - app/(dashboard)/clients/clients-client.tsx

key-decisions:
  - "Task A: candidato en tres filas con `divide-y` entre candidatos. Sin la hairline, dos fichas de 3 renglones se leen como una sola de 6 — el reflow arreglaría el corte del mail y rompería la lectura del grupo"
  - "Task A: SIN iconos de teléfono/mail. La fase declara que la única adición visual es la de Task B; un teléfono (dígitos) y un mail (con `@`) no son ambiguos, y agregar iconografía habría sido una segunda adición sin pedido"
  - "Task A: el mail va con `break-all` y NO con `truncate`. Truncar es exactamente el bug: el modal autoriza un borrado y el dueño necesita el mail COMPLETO para confirmar identidad"
  - "Task B: se tomó la recomendación del plan (misma acción en el header del detalle, sólo si el cliente abierto es duplicado) sin desvío. El `lg:hidden` se mudó del botón 'Volver' a la fila contenedora ⇒ a 1280px la fila da `display:none` y el detalle de escritorio queda idéntico"
  - "Task B: control ESPEJADO, no inventado — mismo `GitMerge`, mismo `w-4 h-4`, mismo `title='Fusionar duplicados'`. Se le agregó `aria-label` (el `title` como único nombre accesible es frágil) y 44×44 de caja con `-my-3` para no engordar la fila"
  - "El botón 'Fusionar' del modal pasó de `h-7` (28px) a `h-11` (44px) en LOS DOS viewports: el plan pide 44×44 y dejar un dialecto por viewport es la deuda que el quick `260929-g4d` ya vino a cerrar"

requirements-completed: [NAV-01]

coverage:
  - id: A
    description: "El modal de fusión deja confirmar qué se fusiona a 375px: nombre, teléfono y mail en tres filas, el mail entero y nada fuera de la caja"
    requirement: NAV-01
    verification:
      - kind: other
        ref: "sonda a 375px en iframe (Chrome headless `--headless=new --dump-dom`, CSS real compilada desde `app/globals.css`): peor desborde del mail `+36.4px` (antes) → `−13.0px` (después); nombre de 4 renglones → 1; mail largo envuelve en 2 renglones sin cortarse; `scrollWidth-clientWidth=0` en el nodo del mail"
        status: pass
      - kind: other
        ref: "área táctil del botón 'Fusionar' medida: `285.0 × 44.0` a 375px y `93.0 × 44.0` a 1280px"
        status: pass
    human_judgment: true
  - id: B
    description: "Con una ficha abierta en mobile la acción de fusionar existe, aparece SÓLO si ese cliente es duplicado, no se pisa con 'Volver' y el desktop no cambia"
    requirement: NAV-01
    verification:
      - kind: other
        ref: "sonda a 375px: fila=`20.0px` de alto (igual que antes del cambio), botón=`44.0 × 44.0`, solape con 'Volver' = `−247.9px` (negativo ⇒ no se pisan), `right=367.0` contra un viewport de 375 ⇒ no se clipea"
        status: pass
      - kind: other
        ref: "sonda a 1280px: la fila de acciones de mobile da `display:none`, `alto=0.0` ⇒ desktop intacto"
        status: pass
      - kind: other
        ref: "condicionalidad por TIPO y no por `if` de presentación: `onMerge?: () => void` y el padre pasa `undefined` cuando la ficha no es duplicada ⇒ sin handler no hay botón. Verificado por `tsc --noEmit` (0 `error TS`); el paso 4 de la UAT lo confirma a ojo"
        status: pass
    human_judgment: true
  - id: C
    description: "Cero regresión del cableado de historial de la Phase 1"
    requirement: NAV-01
    verification:
      - kind: unit
        ref: "`npx vitest run test/panel-history-clients.test.ts` → 12 passed (12): incluye (f) cero `pushState`/`replaceState`/`history.*` en `app/(dashboard)/clients/`, (g) cero `setSelectedId` y (i) los 3 `.eq('business_id'` de `page.tsx`"
        status: pass
    human_judgment: false

duration: 40min
completed: 2026-09-29
status: complete
---

# Phase 1 Plan 04: La pantalla de Clientes — el modal de fusionar, y poder llegar a él desde una ficha Summary

**Los dos gaps de la UAT en celular quedaron cerrados y medidos a 375px: el modal de fusión pasó de tres columnas que cortaban el mail (`+36.4px` fuera de la caja) a tres filas con el mail entero (`−13.0px`), y con una ficha abierta la acción de fusionar existe en el teléfono —espejada del control que ya había, y sólo cuando ese cliente es duplicado— sin que el detalle de escritorio cambie un píxel.**

## Performance

- **Duration:** ~40 min
- **Tasks:** 2/2
- **Commits:** 4 — `0ad7f04` (Task A) · `acc3bf7` (Task B) · `346545b` (SUMMARY + STATE + ROADMAP) · el de cierre de este SUMMARY (conteo real)

## A — El modal de fusión, en tres filas

El candidato pasó de un `flex items-center` de tres columnas a un bloque de tres renglones:

| | Antes | Después |
|---|---|---|
| Nombre | columna que se parte en renglones | fila propia, `break-words`, junto a la insignia |
| Teléfono | columna | fila propia |
| Mail | columna, **cortada** | fila propia, `break-all` ⇒ **entero** |
| Separación entre candidatos | `space-y-2` | `divide-y divide-border` (hairline) |
| Botón "Fusionar" | `h-7` (28px) | `h-11` (44px) + `w-full sm:w-auto` |

Lo que hace que no vuelva a desbordar son **tres cosas juntas**, y ninguna sola alcanza:

1. `min-w-0` en la cadena de contenedores — un item de flex no encoge por debajo de su contenido (`min-width:auto`), que es la razón exacta por la que las columnas se salían.
2. `break-all` en el nodo del mail — un mail largo no tiene espacios donde `break-words` pueda cortar.
3. El mail en **su propio nodo de bloque** (`<p>`), no como hermano flex del nombre.

La insignia **CONSERVAR** lleva `shrink-0`: es la única señal de qué ficha sobrevive y no puede encogerse ni envolverse.

### Medición a 375px — números reales

Instrumento: la sonda montada en un **iframe de 375px** (⚠ Chrome headless **ignora `--window-size` con `--dump-dom`**), con la CSS real compilada desde `app/globals.css` vía `postcss` + `@tailwindcss/postcss`. El mismo molde del quick `260929-g4d`.

Caja de contenido del modal a 375px: `343.0px` de ancho, contenido `16.0..327.0` = **311.0px**.

| | Antes (3 columnas) | Después (3 filas) |
|---|---|---|
| `francovellani@gmail.com` | `right=350.2` ⇒ desborde **+23.2px** (cortado — exactamente lo que vio el dueño) | `right=314.0` ⇒ **−13.0px**, 1 renglón, entero |
| mail largo (54 chars) | `right=363.4` ⇒ desborde **+36.4px** | `right=314.0` ⇒ **−13.0px**, envuelve en **2 renglones** |
| nombre corto ("Tamara Godoy") | **2 renglones** | **1 renglón** |
| nombre largo (30 chars) | **4 renglones** | **1 renglón** |
| **Peor desborde del mail** | **+36.4px — SE_PASA** | **−13.0px — OK** |

Los `−13.0px` no son holgura arbitraria: son el `p-3` del grupo (12px) + su `border` (1px). El nodo del mail queda clavado a los 285px disponibles (`scrollWidth = clientWidth = 285`), o sea que **el desborde es estructuralmente imposible**, no una cuestión de qué tan largo sea el mail.

Botón "Fusionar": **285.0 × 44.0** a 375px, **93.0 × 44.0** a 1280px.

## B — Qué se decidió para llegar a fusionar con la ficha abierta, y por qué

**Se tomó la recomendación del plan, sin desvío:** la misma acción en el header del **detalle**, **sólo** cuando el cliente abierto pertenece a un grupo de duplicados.

**Por qué esa y no el alternativo obvio** (dejar visible el header del panel izquierdo en mobile): eso habría tocado el split master-detail, que el plan prohíbe explícitamente, y habría traído de vuelta a la pantalla el header entero (título, contador, Exportar, Importar, Nuevo cliente) por una sola acción.

**Por qué contextual y no global:** en el 99% de las fichas no hay duplicado. Un botón permanente sería ruido en todas para servir a unas pocas; contextual, aparece justo cuando sirve. Además es lo que hace verificable el paso 4 de la UAT (abrir un cliente que no es duplicado ⇒ la acción **no** aparece).

**Cómo quedó, en tres decisiones:**

- **El `lg:hidden` se mudó del botón `"Volver"` a la FILA que ahora los contiene.** Es lo que garantiza "en desktop no cambia nada": a 1280px la fila entera da `display:none` (medido: `alto=0.0`), así que el detalle de escritorio es idéntico al de antes — y ahí el listado nunca se oculta, con lo cual el botón global sigue al alcance.
- **Control espejado, no inventado:** mismo icono `GitMerge`, mismo `w-4 h-4`, mismo `title="Fusionar duplicados"`. Ni menú, ni patrón nuevo, ni texto. Se le sumó `aria-label` (el `title` como único nombre accesible es frágil) y el foco visible con los tokens de `buttonVariants` (`focus-visible:ring-3 focus-visible:ring-ring/50`).
- **44×44 sin engordar la fila:** la caja mide `44.0 × 44.0` y los `-my-3` le devuelven 12px arriba y abajo, así que la fila sigue midiendo los mismos **20.0px** de alto que tenía el "Volver" solo. `justify-between` + solape medido de **−247.9px** ⇒ no se pisan. `right=367.0` contra un viewport de 375 ⇒ no se clipea.

El control se apaga por el tipo: `onMerge?: () => void`, y el padre pasa `undefined` cuando la ficha no es duplicada. No hay un `if` de presentación que alguien pueda "simplificar": si no hay handler, no hay botón.

## Verificación — salida real

| Gate | Resultado |
|------|-----------|
| `npx vitest run` (suite completa) | `rc=0` — **Test Files 101 passed (101)** · **Tests 1486 passed \| 4 expected fail \| 1 skipped (1491)** · 94.04s. Piso del plan: 1460/100 ⇒ **por encima** (el `+1` archivo y los `+26` casos son del plan `01-03`, que corrió en paralelo) |
| `npx vitest run test/panel-history-clients.test.ts` | `rc=0` — **12 passed (12)**. El candado de C-1 sigue verde: cero historial crudo, cero `setSelectedId`, 3 filtros por `business_id` en `page.tsx` |
| `./node_modules/.bin/tsc --noEmit` (⚠ nunca `npx tsc`) | **0** líneas `error TS` fuera de `^\.next/` |
| `./node_modules/.bin/eslint "app/(dashboard)/clients/clients-client.tsx"` | `rc=0`, **salida vacía — 0 problemas** |
| Sonda a 375px (iframe) | `PEOR_DESBORDE_MAIL=−13.0px  OK` (antes: `+36.4px  SE_PASA`) |
| Sonda a 1280px (iframe) | fila de acciones de mobile: `display:none`, `alto=0.0` ⇒ desktop intacto |
| `ls supabase/migrations/*.sql \| wc -l` | **41** — cero migraciones nuevas |
| `git diff --name-only HEAD~2 HEAD -- package.json package-lock.json` | vacío — **cero paquetes nuevos** |
| `git diff --name-only HEAD~2 HEAD` | **un solo archivo**: `app/(dashboard)/clients/clients-client.tsx` — no se tocó nada del plan `01-03` |
| `git diff --diff-filter=D --name-only HEAD~2 HEAD` | vacío — cero borrados |
| `git rev-list --count 23d836d..HEAD` | **6** — 4 de este plan (`0ad7f04`, `acc3bf7`, `346545b` + el de cierre de este SUMMARY) + **2 ajenos** del ejecutor de `01-03`, que corrió en paralelo sobre la misma `main` (`34b5115`, `6db682d`). Medido por ruta, los de este plan son **4** |

> ⚠ **Flake de la suite medido, no atribuible a este plan.** Tres corridas completas intermedias dieron entre 1 y 8 casos rojos, **todos por timeout** (`Hook timed out in 10000ms` / `Test timed out in 5000ms`) y en **archivos distintos en cada corrida** (`abono-generation`, `manual-booking`, `clients-import`, `schedule-coverage-public`, `abono-create`, `shell-scope`). Cada archivo corrido **solo** pasó en verde (`abono-generation` + `manual-booking` → 18 passed; `shell-scope` → 13 passed; `panel-history-clients` → 12 passed). Causa: contención de máquina — el ejecutor del plan `01-03` corría su propio `vitest` y su propio `tsc` en paralelo sobre el mismo Postgres local. La corrida final, ya sin contención, dio **101/101 archivos y 0 rojos**.
>
> ⚠ `npm run lint` (repo entero) sigue en `rc=1` por deuda preexistente de `react-hooks` en archivos ajenos. Lo medido acá es `eslint` sobre el archivo tocado: **0 problemas**.
>
> ⚠ El dev server del dueño en el puerto **80** no se tocó.

## Reglas de UI del proyecto — cómo se cumplieron

- **Espaciados en múltiplos de 4px:** `space-y-3` (12), `space-y-1` (4), `py-2` (8), `gap-2` (8), `p-3` (12), `h-11` (44), `-my-3` (12). El único no-múltiplo del bloque es el `gap-1.5` que trae `buttonVariants` por su `size` default, que no se tocó.
- **Tokens, cero hex sueltos:** `border-border`, `divide-border`, `text-muted-foreground`, `bg-primary/20`, `text-primary`, `ring-ring/50`. No se agregó ni un valor de color literal.
- **Contraste:** los pares de tokens son los que ya estaban en uso en este mismo modal y en el header del listado; el reflow no cambió ningún par foreground/background.
- **44×44:** los dos controles nuevos o modificados quedaron medidos (`285.0 × 44.0` / `93.0 × 44.0` el del modal, `44.0 × 44.0` el del detalle).
- **Foco visible:** el del modal lo trae `buttonVariants`; el del detalle lo declara explícito con los mismos tokens.

## Deviations from Plan

### 1. [Forma, con motivo medido] El botón "Fusionar" del modal también creció en desktop

- **Found during:** Task 1
- **Qué pasó:** el plan pide **44×44** de área táctil para "Fusionar". El botón era `h-7` (28px) y quedó `h-11` (44px) en **los dos** viewports (medido: `93.0 × 44.0` a 1280px).
- **Por qué no se acotó a mobile:** dejar `h-7` en desktop y `h-11` en mobile crea un dialecto por viewport, que es exactamente la deuda que el quick `260929-g4d` cerró a mano (§"Desktop también cambió, a propósito") a pedido del dueño. Un solo control, un solo tamaño.

### 2. [Forma] `divide-y` entre candidatos — un elemento visual que el plan no nombra

- **Found during:** Task 1
- **Motivo:** el reflow a tres filas resuelve el corte del mail y rompe otra cosa: cada candidato pasa a ocupar 3+ renglones, y con la separación anterior (`space-y-2`) dos fichas se leen como **una sola de seis renglones**. En un modal que pide autorizar un borrado, no distinguir dónde termina un candidato y empieza el otro es el mismo defecto que se vino a arreglar. Es una hairline con el token `divide-border`, sin color ni espesor nuevos.

### 3. [Omisión deliberada] Sin iconos de teléfono/mail en las filas nuevas

- **Found during:** Task 1
- **Motivo:** el plan declara que **la única adición visual de la fase es la de Task B**. Iconos en Task A habrían sido una segunda adición, sin pedido, y además habrían necesitado un fudge de alineación vertical fuera de la escala de 4px para el mail que envuelve. Un teléfono (dígitos) y un mail (con `@`) se distinguen sin ayuda.

### 4. [Forma] `aria-label` en el control nuevo, que el espejo no tenía

- **Found during:** Task 2
- **Motivo:** el control del panel izquierdo se apoya sólo en `title` como nombre accesible, que es un fallback frágil. Al agregar el control nuevo se le puso `aria-label="Fusionar duplicados"` explícito. **No se tocó el control original** (está fuera del `files_modified`, y además el plan `01-03` corre en paralelo sobre archivos vecinos); queda anotado como ítem de limpieza, no como bug.

## Auth Gates

Ninguno.

## Known Stubs

Ninguno. Cero `TODO`/`FIXME`/placeholders agregados, cero datos de mentira, cero componente sin fuente de datos: el `onMerge` nuevo abre el modal que ya existía y consume el mismo `duplicates` que ya alimentaba el botón global.

## Threat Flags

Ninguna. Este plan no abre superficie: no toca queries, ni policies, ni route handlers, ni el filtro por `business_id`; no lee secretos; no agrega endpoints. `selectedIsDuplicate` se deriva del array `clients` que `page.tsx` ya trajo filtrado por tenant, así que el control nuevo no puede referirse a un cliente de otro negocio. El invariante de aislamiento (los 3 `.eq('business_id'` de `page.tsx`) sigue verificado por `test/panel-history-clients.test.ts` caso (i), verde.

## Pendiente: UAT en celular real

**No se corrió acá, por instrucción explícita.** Los cuatro pasos del `## UAT (celular)` del plan quedan para el dueño, con el detalle de que el paso 4 (abrir un cliente que **no** es duplicado ⇒ la acción **no** aparece) es el que verifica la condicionalidad, y el paso 3 es el primero que puede ejercitar a mano la redirección `mergedInto` de la Phase 1.

## Self-Check: PASSED

- `app/(dashboard)/clients/clients-client.tsx` — **FOUND** (modificado, idéntico byte a byte al archivo sobre el que corrieron `tsc`, `eslint` y `vitest`: verificado con `diff -q` antes de commitear)
- commit `0ad7f04` — **FOUND** (`fix(01-04): el modal de fusionar duplicados, en tres filas y con el mail entero`)
- commit `acc3bf7` — **FOUND** (`feat(01-04): fusionar al alcance con la ficha abierta, solo si es duplicada`)
- `git rev-list --count 23d836d..HEAD` = **6**; medido por ruta, los de este plan son **4** — los 2 restantes (`34b5115`, `6db682d`) son del ejecutor de `01-03`, que corrió en paralelo sobre la misma `main`. Anotado en `commits_note`
- Archivos del plan `01-03` (`components/dashboard/sidebar.tsx`, `lib/panel-history.ts`, `lib/panel-history.test.ts`) — **NO tocados** (`git diff --name-only HEAD~2 HEAD` devuelve un solo archivo)
