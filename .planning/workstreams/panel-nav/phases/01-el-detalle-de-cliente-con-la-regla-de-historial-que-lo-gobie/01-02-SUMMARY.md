---
phase: 01-el-detalle-de-cliente-con-la-regla-de-historial-que-lo-gobie
plan: 02
subsystem: testing
tags: [vitest, invariantes, source-grep, history-api, multi-tenant, nav-05, nav-06]

requires: ["01-01"]
provides:
  - "`test/panel-history-clients.test.ts`: los invariantes del CABLEADO que ninguna suite pura puede ver — 12 casos, 0 dependencias nuevas"
  - "C-1 con candado medido: degradar la causa del borrado, o saltear el helper y escribir historial a mano, pone la suite en ROJO (verificado con dos mutaciones reales)"
  - "El criterio 4 del ROADMAP convertido en invariante permanente: cero mutaciones crudas de historial y cero segunda fuente de verdad en `app/(dashboard)/clients/`"
  - "La convivencia con `lib/overlay-history.ts` clavada: la clave `frjOverlay` no puede derivar en silencio entre los dos módulos"
  - "La mitigación de T-01-01 (los tres filtros por tenant de `page.tsx`) vigilada por test, no por memoria"
affects: [panel-nav Phase 2 (hereda el molde de invariantes de cableado para los tabs)]

actuals:
  tokens: 14200
  tasks: 2
  commits: 2
plan_head_before: 9c52a94cad04345d24c411173ea79ee62bccbe5c

tech-stack:
  added: []
  patterns:
    - "Invariante de cableado por REGIÓN: `recorte(fuente, marcador)` balanceando llaves + `sinComentarios` + guarda de 'no encontró nada' (molde `test/catalog-public.test.ts`)"
    - "Los gates que dependen de la historia de git viven en `<verify>` (bash), no en un `it`: el CI clona a profundidad 1"

key-files:
  created:
    - test/panel-history-clients.test.ts
  modified: []

key-decisions:
  - "El invariante de NAV-06 'los tres archivos intocables siguen en su commit original' quedó como gate de bash y NO como `it`: los commits pineados están a 14 / 287 / 286 commits de HEAD y el CI usa `actions/checkout@v4` sin `fetch-depth` (profundidad 1) ⇒ como test sería rojo en cada push por falta de historia, no por el invariante. El plan autoriza explícitamente este movimiento"
  - "La región del `onClick` de abrir se recorta sobre el cuerpo del `.map(client => …)` de la lista y no sobre el literal del call site: recortar por el propio `applyPanelView(` haría la aserción tautológica"
  - "La fusión se afirma con `setMergedInto` (el registrador real) en vez de `mergedInto`: el identificador que existe en el código es el setter"
  - "Cero código de producción tocado, como manda el plan. Los dos únicos cambios al fuente fueron las mutaciones de prueba, aplicadas y revertidas con `git checkout --`"

requirements-completed: [NAV-05, NAV-06]

coverage:
  - id: D5
    description: "C-1 tiene un candado y no una advertencia: si el call site del borrado degrada su causa, o si alguien escribe historial a mano ahí, la suite se pone roja"
    requirement: NAV-06
    verification:
      - kind: unit
        ref: "test/panel-history-clients.test.ts — '(a) el borrado declara la causa del commit concurrente — ES C-1' y '(b) el borrado no escribe historial a mano'"
        status: pass
      - kind: other
        ref: "prueba de mutación manual: `'concurrent'` → `'programmatic'` ⇒ (a) ROJO; `window.history.replaceState(...)` dentro de `deleteClient` ⇒ (b) y (f) ROJOS. Ambas revertidas"
        status: pass
    human_judgment: false
  - id: D6
    description: "Criterio 4 del ROADMAP permanente: cero mutaciones crudas de historial en la pantalla y ninguna segunda fuente de verdad del cliente abierto"
    requirement: NAV-05
    verification:
      - kind: unit
        ref: "test/panel-history-clients.test.ts — '(f) cero mutaciones crudas de historial en toda la pantalla' y '(g) no sobrevive ninguna segunda fuente de verdad del cliente abierto'"
        status: pass
    human_judgment: false
  - id: D7
    description: "Cada cambio de vista declara SU causa, verificado sobre su región y no sobre el archivo: abrir `user-open`, cerrar `user-close`, borrar `concurrent`, la fusión no escribe y registra la redirección"
    requirement: NAV-05
    verification:
      - kind: unit
        ref: "test/panel-history-clients.test.ts — casos (a), (c), (d), (e), cada uno sobre el recorte de su región con guarda de recorte no vacío"
        status: pass
    human_judgment: false
  - id: D8
    description: "La convivencia con `lib/overlay-history.ts` no puede derivar en silencio, y los tres archivos que NAV-06 declara intocables siguen en su commit original"
    requirement: NAV-06
    verification:
      - kind: unit
        ref: "test/panel-history-clients.test.ts — '(b) la clave del marcador de overlay no derivó entre los dos módulos' + '(a) el helper nunca compone el state por propagación'"
        status: pass
      - kind: other
        ref: "gate de bash: `git status --porcelain` vacío y último commit `ed4d986` / `505667a` / `1460f25`; `npx vitest run test/overlay-history.test.ts` → 27 passed"
        status: pass
    human_judgment: false

duration: 13min
completed: 2026-09-29
status: complete
---

# Phase 1 Plan 02: El candado de C-1 — los invariantes del cableado del historial de `/clients` Summary

**Los tres invariantes que ninguna suite pura puede ver quedaron convertidos en tests que fallan: cada cambio de vista de `/clients` verificado sobre SU región del fuente, cero historial crudo en la pantalla, y la convivencia con `lib/overlay-history.ts` clavada contra la deriva — con la prueba de mutación corrida de verdad para demostrar que el candado existe.**

## Performance

- **Duration:** 13 min
- **Tasks:** 2/2
- **Commits:** 2 (1 de código + 1 de docs)

## Accomplishments

- **`test/panel-history-clients.test.ts` (nuevo, 12 casos, 0 paquetes).** Suite pura (`node:fs` + regex), que cae sola en el carril paralelo `pure` sin tocar `vitest.config.mts`. Tres helpers: `read`, `sinComentarios` (copiada tal cual de `test/catalog-public.test.ts:35-40`) y `recorte(fuente, marcador)`, que recorta la región balanceando llaves desde el primer `{` del marcador y **devuelve vacío si no la encuentra** — cada `it` lo afirma no vacío antes de seguir.
- **Las cuatro regiones recortadas, medidas:** `deleteClient` (960 chars), `mergeGroup` (947), el cuerpo del `.map(client => …)` de la lista (2290) y el mount condicional de `<ClientDetail>` (755). Ninguna es el archivo entero: `clients-client.tsx` tiene ~1400 líneas y afirmar sobre el archivo pasaría por casualidad.
- **El caso que el dueño pidió por nombre** lleva escrito el mecanismo completo de C-1 en su comentario: los dos cierres en el mismo lote, el `back()` asincrónico del overlay, la entrada de arriba que es del `<Dialog>`, y la ficha de un cliente recién borrado como consecuencia.
- **El invariante de NAV-06 que dependía de git** quedó como gate de bash con el motivo **medido** escrito dentro del propio archivo de test, para que nadie lo "arregle" moviéndolo a un `it`.

## Qué invariantes quedaron fijados, y qué se pone rojo con cada uno

| # | Invariante | Se pone rojo si… |
|---|---|---|
| (a) | El borrado declara `'concurrent'` y **ninguna** de las otras cinco causas | alguien degrada la causa a `programmatic`, `user-close`, `user-open`, `stale` o `filter` — **verificado con la mutación** |
| (b) | El cuerpo de `deleteClient` no contiene `pushState` / `replaceState` / `history.back` / `history.forward` / `history.go` | alguien saltea el helper y "limpia la URL" a mano ahí — **verificado con la mutación** |
| (c) | `mergeGroup` contiene `setMergedInto`, y **no** contiene `applyPanelView`, ni ninguna causa, ni historial crudo | alguien "arregla" la fusión escribiendo historial con el modal abierto (entrada huérfana + atrás muerto) |
| (d) | La región de la lista llama al ejecutor con `'user-open'` y sin historial crudo | alguien cambia abrir-cliente a `replace`, o lo cablea a mano |
| (e) | El mount de `<ClientDetail>` llama al ejecutor con `'user-close'` | alguien vuelve a decidir política en el call site del "Volver" |
| (f) | Cero mutaciones crudas de historial en los **dos** archivos de `app/(dashboard)/clients/` | aparece un segundo dialecto de historial en la pantalla (criterio 4 del ROADMAP, permanente) — **verificado con la mutación** |
| (g) | Cero `setSelectedId` en esos dos archivos | reaparece la segunda fuente de verdad del cliente abierto y el atrás vuelve a mentir |
| (h) | `page.tsx` importa `Suspense` y el mount queda entre `<Suspense>` y `</Suspense>` | alguien saca el boundary (hoy inocuo porque la ruta es dinámica; protege el día que se vuelva estática — C-2) |
| (i) | `page.tsx` tiene exactamente **3** `.eq('business_id'` | una de las tres lecturas pierde su filtro y `?c=<id>` pasa a ser un oracle de existencia cross-tenant (T-01-01 / T-01-07) |
| (2a) | `lib/panel-history.ts` contiene el punto de escritura y **no** contiene `...history.state` / `...window.history.state` | alguien compone el state "con cuidado" propagando el actual: arrastra `__NA`, el parche de Next toma su rama temprana, `useSearchParams` no se actualiza y **no hay ni un error en consola** |
| (2b) | `frjOverlay` aparece en `lib/panel-history.ts` **y** en `lib/overlay-history.ts` | el módulo de overlays renombra su marcador: la regla 0 se vuelve inerte en silencio y el borrado vuelve a competir con su back |
| (2c) | El encabezado de `lib/panel-history.ts` no declara la directiva de cliente | alguien marca el módulo como frontera y arrastra sus funciones puras adentro |

## Prueba de mutación — corrida de verdad, y revertida

Es la verificación que decide si este plan cumplió. Se corrieron **dos**, no una:

| # | Qué se degradó | Qué cayó | Mensaje real |
|---|---|---|---|
| 1 | En `deleteClient`: `cause: 'concurrent'` → `cause: 'programmatic'` (`clients-client.tsx:645`) | **(a)** — `1 failed \| 11 passed`, `rc=1` | `AssertionError: expected 'async function deleteClient() {…' to contain "'concurrent'"` |
| 2 | En `deleteClient`: se insertó `window.history.replaceState({}, '', '/clients')` antes de `setConfirmDelete(false)` | **(b)** y **(f)** — `2 failed \| 10 passed`, `rc=1` | `expected 'async function deleteClient() {…' not to contain 'replaceState'` · `expected 'clients-client.tsx: true' to be 'clients-client.tsx: false'` |

Las dos se revirtieron con `git checkout -- "app/(dashboard)/clients/clients-client.tsx"`; `git status --porcelain` sobre ese directorio quedó **vacío**, y la suite completa volvió a `rc=0`. **Nada de esto se commiteó.**

> La mutación 1 es la prueba dura de que el candado existe: `lib/panel-history.test.ts` (53 casos, política) queda **verde** con esa mutación aplicada — la política no cambió, cambió la declaración. Sin esta suite, C-1 volvía sin que nada se pusiera rojo.

## Verificación — salida real

| Gate | Resultado |
|------|-----------|
| `npx vitest run test/panel-history-clients.test.ts` | `rc=0` — **12 passed (12)**, 1 archivo, 282ms |
| Gate de honestidad del archivo | `descuento de comentarios=8 (>0) · IMPORTS de entorno/datos=0 · recortes de región=5 (>0) · guardas=11 (≥5)` → `rc=0` |
| `npx vitest run` (suite completa) | `rc=0` — **Test Files 100 passed (100)** · **Tests 1460 passed \| 4 expected fail \| 1 skipped (1465)** · 59.53s. Piso de 01-01 era 1448/99 ⇒ **+12 casos, +1 archivo**, exacto |
| `./node_modules/.bin/tsc --noEmit` (⚠ nunca `npx tsc`) | **0 líneas `error TS`** fuera de `^\.next/` |
| `./node_modules/.bin/eslint test/panel-history-clients.test.ts` | `rc=0`, **salida vacía — 0 problemas** |
| `npx vitest run test/overlay-history.test.ts` | `rc=0` — **27 passed (27)** |
| Gate NAV-06 (bash) | `sin commitear=[] · overlay=ed4d986 · unsaved=505667a · guard=1460f25` → coinciden con los pineados, `rc=0` |
| `npm run build` | `rc=0` (ver nota abajo) |
| `ls supabase/migrations/*.sql \| wc -l` | **41** (la próxima libre sigue siendo la 080) |
| `git diff --name-only -- package.json package-lock.json` | vacío — cero paquetes nuevos |

> ⚠ `npm run lint` (todo el repo) sale `rc=1` por **deuda preexistente** de `react-hooks` en archivos ajenos a este plan. Lo medido acá es `eslint` sobre el archivo tocado: **0 problemas**.
>
> ⚠ **Flake de build medido, no atribuible a este plan.** La primera corrida de `npm run build` salió `rc=1` con `module-not-found` sobre el CSS generado de la fuente de Google (`mulish_*.module.css`) — después de `✓ Compiled successfully` y de generar las 62 páginas. Las **dos** corridas siguientes salieron `rc=0` con **cero** líneas de error. Este plan no agrega código de producción (sólo un archivo en `test/`, que no entra al grafo del build), y hay un dev server del dueño corriendo en el puerto 80 sobre el mismo `.next`. Se deja anotado como ruido de entorno, no como regresión.

## Deviations from Plan

### 1. [Autorizado por el plan] El invariante de NAV-06 basado en git quedó como gate de bash, no como `it`

- **Found during:** Task 2, punto (d)
- **Motivo medido:** los commits pineados están a **14 / 287 / 286** commits de HEAD (`git rev-list --count <hash>..HEAD`, medido hoy), y `.github/workflows/test.yml` usa `actions/checkout@v4` **sin `fetch-depth`**, o sea profundidad 1. Un `it` con `git log -n 1 -- <archivo>` devolvería vacío en CI y sería **rojo en cada push** por falta de historia, no por el invariante.
- **Qué se hizo:** el caso vive en el gate de bash del `<verify>` del Task 2 (que corrió en verde), y el archivo de test lleva el motivo escrito arriba del segundo `describe` para que nadie lo "arregle" moviéndolo adentro. Lo que el plan prohíbe —dejarlo como un `it` que pasa siempre— no se hizo.
- **Autorización:** el propio plan lo contempla textual (`<action>` del Task 2, punto (d), y §Riesgos).

### 2. [Forma] La región de "abrir un cliente" se recorta sobre el `.map(...)` de la lista, no sobre el `onClick`

- **Found during:** Task 1, punto (d)
- **Motivo:** recortar usando `onClick={() => applyPanelView(` como marcador haría que la aserción "la región contiene `applyPanelView` y `'user-open'`" sea **tautológica** (el marcador ya trae medio literal adentro). Se recorta el cuerpo del `.map(client => {` — 2290 chars, el ítem entero de la lista — y se afirma sobre eso. Sigue siendo una región y no el archivo.

### 3. [Forma] La fusión se afirma con `setMergedInto` y no con `mergedInto`

- **Found during:** Task 1, punto (c)
- **Motivo medido:** el `<action>` nombra `mergedInto`, pero el registro real dentro de `mergeGroup` se hace con el setter `setMergedInto(prev => …)`; el identificador `mergedInto` **no aparece** en esa región (`.includes('mergedInto')` → `false`, medido). Afirmar el nombre que no existe habría sido un rojo permanente. Se afirma el registrador real.

### 4. [Forma] Los dos tasks salieron en un solo commit de código

- **Found during:** Task 2
- **Motivo:** ambos escriben **el mismo archivo nuevo**, y el archivo se escribió de una sola vez con sus dos `describe`. Separarlos habría requerido `git add -p` (interactivo, no disponible acá) o un commit intermedio con un archivo a medias. Commit único: `483c36f`.

## Auth Gates

Ninguno.

## Known Stubs

Ninguno. No quedó ningún `it.skip`, ningún `todo`, ningún caso que pase sin afirmar: las 5 llamadas a `recorte(` tienen 11 guardas de "no encontró nada" cubriéndolas, y el gate del plan lo verifica (`GUARDAS ≥ CORTES`).

## Threat Flags

Ninguna. Este plan no agrega código de producción: no toca datos, no abre superficie, no lee secretos, no instala nada. Las dos amenazas que **sostiene** (T-01-07 la mitigación de tenant de `page.tsx`, T-01-08 el retorno de C-1) quedaron con su caso de test permanente, y T-01-09 (un test que pasa sin mirar nada) está cerrado por la guarda por recorte más su gate.

## Pendiente: UAT en celular real

La UAT de fin de fase la corre el dueño en el teléfono, una sola vez para toda la Phase 1, con los dos guiones `<human-check>` del plan 01-01. **No se corrió acá.**

## Self-Check: PASSED

- `test/panel-history-clients.test.ts` — **FOUND**
- commit `483c36f` — **FOUND** (`test(01-02): el candado de C-1 …`)
- `git status --porcelain` de `app/(dashboard)/clients/` y de los tres archivos de NAV-06 — **vacío** (las dos mutaciones revertidas)
