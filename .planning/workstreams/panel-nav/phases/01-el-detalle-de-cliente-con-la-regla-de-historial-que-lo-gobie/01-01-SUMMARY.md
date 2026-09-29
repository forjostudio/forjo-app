---
phase: 01-el-detalle-de-cliente-con-la-regla-de-historial-que-lo-gobie
plan: 01
subsystem: ui
tags: [next16, app-router, history-api, useSearchParams, multi-tenant, vitest]

requires: []
provides:
  - "`lib/panel-history.ts`: la política de historial del panel en UN módulo — 4 acciones (push | replace | none | consume) × 6 causas (user-open | user-close | programmatic | filter | stale | concurrent), puras y testeadas"
  - "El ejecutor único `applyPanelView`: la sola función que toca `window.history` en la superficie de `/clients`"
  - "El detalle de cliente derivado de `/clients?c=<id>`: recargable, compartible, y con el atrás devolviendo el listado con búsqueda y filtros intactos"
  - "La regla de reconciliación URL ↔ vista que cierra a la vez el saneo post-borrado, el id inexistente, el id de otro negocio y la convergencia de la fusión"
  - "`<Suspense fallback={null}>` alrededor del consumidor de `useSearchParams` en `/clients`"
affects: [panel-nav Phase 2 (tabs de /negocio, /settings, /finances), T-3 (activeLoc de Agenda)]

actuals:
  tokens: 12690
  tasks: 2
  commits: 2
plan_head_before: 25ee8b226de88c6c949f974545770293911157f6

tech-stack:
  added: []
  patterns:
    - "Decisión pura en `lib/`, mecánica en un único ejecutor (molde `lib/unsaved-changes.ts` + `lib/overlay-history.ts`)"
    - "El call site declara la CAUSA; el módulo decide la ACCIÓN (un solo dialecto de historial en el panel)"
    - "Tabla de redirección en estado para evitar escribir historial mientras un overlay es dueño de la entrada de arriba"

key-files:
  created:
    - lib/panel-history.ts
    - lib/panel-history.test.ts
  modified:
    - app/(dashboard)/clients/page.tsx
    - app/(dashboard)/clients/clients-client.tsx

key-decisions:
  - "① Cambiar de cliente A→B empuja (no reemplaza): el módulo es agnóstico del viewport, en mobile A→B sin pasar por el listado es imposible, y una política `replace` obligaría a una séptima causa ⇒ dos dialectos"
  - "② El saneo corre en un efecto con guarda de idempotencia doble (`sanitizeAction` + regla 0), y la memoria se resetea vía `reconciledMemo` para que el forward del navegador se reconcilie igual que la primera vez"
  - "La fusión de duplicados NO llama al ejecutor: registra una redirección `idBorrado → idConservado` y la reconciliación aplica el `replace` cuando el modal suelta la entrada. El RESEARCH tenía este punto al revés"
  - "La regla 0 (`overlayOwnsTop ⇒ none`) es absoluta y se evalúa antes que todo: debilitarla cambiaría una regresión por un defecto (entrada huérfana + atrás muerto)"
  - "La resolución del detalle es contra `clients` (lista ya filtrada por tenant en el server) y nunca contra la base ⇒ no hay oracle de existencia cross-tenant"

patterns-established:
  - "Marcador de entrada propio (`frjView: '<param>'`) con el NOMBRE del parámetro, no el valor: distingue superficies sin cambiar al pasar de A a B, y la Phase 2 lo hereda"
  - "Objeto de state FRESCO siempre: propagar `window.history.state` arrastra `__NA` y el parche de Next deja de sincronizar `useSearchParams`, sin ningún error"
  - "Gate de código que audita el PRIMER ARGUMENTO en el punto de escritura (aserción positiva) en vez de negar la palabra 'spread'"

requirements-completed: [NAV-01, NAV-02, NAV-05, NAV-06]

coverage:
  - id: D1
    description: "El módulo de política de historial del panel: 4 acciones × 6 causas, con las reglas en orden y el switch exhaustivo que no compila si la Phase 2 agrega una causa sin decidirla"
    requirement: NAV-05
    verification:
      - kind: unit
        ref: "lib/panel-history.test.ts (53 casos, `npx vitest run lib/panel-history.test.ts`)"
        status: pass
    human_judgment: false
  - id: D2
    description: "C-1 cerrado por regla pura: mientras la entrada de arriba pertenezca a un overlay, esta superficie no escribe historial para NINGUNA causa; la escritura queda diferida, no perdida"
    requirement: NAV-06
    verification:
      - kind: unit
        ref: "lib/panel-history.test.ts#panelHistoryAction — regla 0 (6 casos, uno por causa) + 'la escritura queda DIFERIDA, no perdida'"
        status: pass
      - kind: unit
        ref: "lib/panel-history.test.ts#la ACCIÓN EFECTIVA — 'post-borrado, con el diálogo todavía consumiendo su entrada' / 'post-borrado ya asentado: CONSUME'"
        status: pass
      - kind: other
        ref: "gate de código: cuerpo de `deleteClient` declara 'concurrent' y ninguna otra causa"
        status: pass
    human_judgment: false
  - id: D3
    description: "El detalle de cliente vive en `/clients?c=<id>`: abrir empuja entrada, el atrás devuelve el listado con búsqueda y los tres filtros intactos, y la URL se recarga y se comparte"
    requirement: NAV-01
    verification:
      - kind: other
        ref: "npm run build (rc=0) · ./node_modules/.bin/tsc --noEmit (0 errores) · gate: 4 llamadas al ejecutor, 0 mutaciones crudas, 0 setters sobrevivientes"
        status: pass
    human_judgment: true
    rationale: "Es el botón atrás del sistema en un celular real. Ni vitest (environment node, sin jsdom) ni el build pueden observar el stack de historial del navegador ni la preservación de búsqueda/filtros. La UAT la corre el dueño."
  - id: D4
    description: "Un id inexistente, uno de otro negocio y uno recién borrado producen exactamente el mismo resultado observable (el listado): no hay oracle de existencia cross-tenant"
    requirement: NAV-02
    verification:
      - kind: unit
        ref: "lib/panel-history.test.ts#resolveViewParam — 'un id inexistente, uno de OTRO NEGOCIO y uno recién borrado son INDISTINGUIBLES'"
        status: pass
      - kind: other
        ref: "gate: las tres queries de page.tsx conservan `.eq('business_id', business.id)`"
        status: pass
    human_judgment: true
    rationale: "El test fija la indistinguibilidad de la REGLA; falta confirmar en el navegador que pegar `/clients?c=<id de otro negocio>` y `/clients?c=inventado` dan lo mismo end-to-end."

duration: 12min
completed: 2026-09-29
status: complete
---

# Phase 1 Plan 01: El detalle de cliente, con la regla de historial que lo gobierna — Summary

**El detalle de cliente pasó de `useState` a `/clients?c=<id>`, y esa navegación la gobierna un solo módulo puro (`lib/panel-history.ts`) que decide empujar, reemplazar, no hacer nada o consumir — con la regla que hace que el borrado y los overlays dejen de competir por la misma entrada de historial.**

## Performance

- **Duration:** 12 min
- **Tasks:** 2/2
- **Commits:** 2

## Accomplishments

- **`lib/panel-history.ts` (nuevo, 0 dependencias, sin frontera de cliente).** La tabla de decisiones de NAV-05: 4 acciones × 6 causas, con las reglas EN ORDEN (0: `overlayOwnsTop` ⇒ `none` · 1: `concurrent` ⇒ `none` · 2: `from === to` ⇒ `none` · después el `switch` por causa con rama `never`). Además: el marcador de entrada propio (`panelViewState` / `isPanelViewEntry`), el predicado de convivencia con los overlays (`isOverlayOwnedEntry`), el armado de URL (`panelViewUrl`), la regla de reconciliación (`resolveViewParam`), la guarda de idempotencia (`sanitizeAction` + `reconciledMemo`) y el ejecutor único `applyPanelView`.
- **`lib/panel-history.test.ts` (nuevo, 53 casos).** La tabla fijada caso por caso, incluida la regla 0 con **un caso por cada una de las seis causas** para que no se pueda debilitar "sólo para una", la **acción efectiva compuesta** (`resolveViewParam` → `panelHistoryAction`) que mide los escenarios reales, y la secuencia del forward del navegador.
- **`app/(dashboard)/clients/page.tsx`.** `<Suspense fallback={null}>` alrededor de `<ClientsClient>`, molde literal de `app/(dashboard)/layout.tsx:60-62`. Las tres queries y sus filtros por tenant quedaron intactos.
- **`app/(dashboard)/clients/clients-client.tsx`.** El `useState` del cliente abierto se borró; el detalle se deriva de la URL pasando antes por la tabla de redirección `mergedInto`. Los cuatro cambios de vista declaran al ejecutor: abrir (`user-open`), cerrar (`user-close`), borrar (`concurrent`) y reconciliar (la causa que devuelve `resolveViewParam`). La fusión no declara: redirige.

## Cómo quedó la tabla de decisiones

Reglas en orden, evaluadas antes del `switch`:

| # | Condición | Acción | Por qué |
|---|-----------|--------|---------|
| 0 | `overlayOwnsTop: true`, **cualquier** causa | `none` | Escribir sobre la entrada de un overlay le borra hash y marca ⇒ deja de deshacerla ⇒ entrada huérfana + atrás muerto. La escritura queda **diferida**, no perdida. |
| 1 | `cause: 'concurrent'` | `none` | Declaración del call site del borrado. Candado independiente de la regla 0. |
| 2 | `from === to` (incluido `null === null`) | `none` | Cicatriz 1: empujar la misma URL colapsa la entrada y el atrás se lleva la página. |

Y el `switch` por causa:

| Causa | `holding: true` | `holding: false` |
|-------|-----------------|------------------|
| `user-open` | `push` | `push` |
| `user-close` | `consume` | `replace` (un back sobre entrada ajena saca del sitio) |
| `programmatic` | `replace` | `replace` |
| `filter` (T-3) | `replace` | `replace` |
| `stale` | **`consume`** (arreglo del atrás muerto) | `replace` |
| `concurrent` | `none` (regla 1) | `none` (regla 1) |

## Cómo se cerró C-1 (la carrera del borrado)

Con **dos candados independientes más una tercera defensa estructural**:

1. **La regla 0 del helper**, leída de `history.state`: cubre el overlay cuyo `back()` está **en vuelo** — el borrado apaga `confirmDelete` en el mismo lote, pero la entrada de arriba todavía es del `<Dialog>`.
2. **`hayOverlayAbierto`** (`confirmDelete || mergeModal || importOpen || newClientOpen`), la verdad de React: cubre el overlay **abierto y estable** — el modal de fusión sigue abierto mientras su botón corre y puede cerrarse sin que la URL cambie.
3. **La resolución contra `clients`**: el cliente borrado ya no está en la lista, así que su ficha no se puede volver a mostrar aunque el saneo entero fallara. La limpieza de la URL es cosmética; el invariante duro lo sostiene la resolución.

Y después del borrado, cuando el `back()` del overlay asienta, la reconciliación resuelve `'stale'` con `holding: true` ⇒ **`consume`**, no `replace`: consumir **borra** nuestra entrada en vez de dejar `/clients` encima de `/clients`, que sería la entrada basura que obliga a apretar atrás dos veces.

**Qué se pone rojo si alguien lo debilita:**

| Si alguien… | Se pone rojo |
|---|---|
| Debilita la regla 0 a una sola causa | `lib/panel-history.test.ts` → `describe('panelHistoryAction — regla 0 …')`, **6 casos**, uno por causa |
| Deja pasar el `replace` de la fusión con el modal abierto | `'fusión con el modal de fusión ABIERTO: no escribe nada — es DIFERIDO, no perdido'` |
| Degrada la causa del borrado a `programmatic` / `user-close` / `user-open` / `stale` | El gate de código sobre el cuerpo de `deleteClient` (exige `'concurrent'` y prohíbe las otras cuatro) |
| Resuelve `'stale'` con `holding: true` como `replace` | `'el saneo CONSUME cuando la entrada es nuestra: reemplazar dejaría el atrás muerto'` y `'post-borrado ya asentado: CONSUME'` |
| Borra `hayOverlayAbierto` "limpiando deps que no se usan" | El gate de código que exige la derivación con los cuatro flags y **≥3 apariciones** (declaración + lectura en el cuerpo + dep). `eslint` **no** lo cazaría: `exhaustive-deps` es warning acá |
| Reintroduce una mutación cruda de historial o un setter de selección | El gate de `clients-client.tsx`: `crudas=0`, `setter=0`, `llamadas=4` |
| Arma el state propagando `window.history.state` | El gate del helper: aserción positiva sobre el **primer argumento** de cada escritura (`BAD=0`) + cuerpo del constructor sin `...` |

## Verificación — salida real

| Gate | Resultado |
|------|-----------|
| `npx vitest run lib/panel-history.test.ts` (RED previo) | `rc=1` — `Cannot find package '@/lib/panel-history'`, `no tests` |
| `npx vitest run lib/panel-history.test.ts` (GREEN) | `rc=0` — **53 passed (53)**, 1 archivo |
| `npx vitest run` (suite completa) | `rc=0` — **Test Files 99 passed (99)** · **Tests 1448 passed | 4 expected fail | 1 skipped (1453)** · 66.09s. Piso 1395/98 superado; 1395 + 53 = 1448 exacto |
| `./node_modules/.bin/tsc --noEmit` (⚠ nunca `npx tsc`) | **0 líneas `error TS`** fuera de `^\.next/` |
| `./node_modules/.bin/eslint` sobre los 4 archivos | `rc=0`, **salida vacía — 0 problemas** (0 errores, 0 warnings) |
| `npm run build` | `rc=0` |
| Gate del helper | `escrituras=2 · no auditables=0 · índice dinámico=0 · spreads en el constructor=0 · use client=0 · marcador overlay=4` |
| Gate de `clients-client.tsx` | `crudas=0 · setter=0 · llamadas al ejecutor=4 · causas faltantes=[]` |
| Gate del segundo disparador | `hayOverlayAbierto` con los 4 flags · **3 apariciones** |
| Gate de `deleteClient` | declara `'concurrent'` y ninguna otra causa |
| Gate de `page.tsx` | `Suspense=4` (≥2) · `eq('business_id', business.id)=3` (intactos) |
| `ls supabase/migrations/*.sql \| wc -l` | **41** (próxima libre sigue siendo la 080) |
| `git diff --name-only -- package.json package-lock.json` | vacío |
| `git status --porcelain` de los tres intocables | vacío. Último commit de cada uno: `ed4d986` / `505667a` / `1460f25` — **sin cambios** |

> ⚠ `npm run lint` (todo el repo) sale en `rc=1` por **deuda preexistente** de las reglas nuevas de `react-hooks` en archivos ajenos a este plan. Lo medido acá es `eslint` sobre los archivos tocados: **0 problemas**.

## Deviations from Plan

### 1. [Forma, no contenido] Los dos tasks se ejecutaron en el mismo turno y `clients-client.tsx` fue a un solo commit

- **Found during:** Task 1, punto (d)
- **Motivo medido:** el plan declara que el estado intermedio entre Task 1 y Task 2 deja el árbol **rojo en TypeScript** (los tres call sites llaman al setter borrado) y autoriza explícitamente hacer los dos tasks en el mismo turno para evitarlo. Se tomó esa opción, así que las ediciones de Task 1 (d) y de Task 2 sobre el mismo archivo no se podían separar en dos commits sin `git add -p` (interactivo, no disponible acá).
- **Resultado:** commit 1 = helper + suite + `page.tsx` (artefactos (a), (b), (c) del Task 1); commit 2 = `clients-client.tsx` entero (el cableado completo). `tsc` quedó en 0 después de cada commit, nunca en el estado rojo intermedio.
- **Commits:** `ea9ab22`, `71457a5`

### 2. [Rule 2 - Robustez] `isOverlayOwnedEntry` exige además que la marca sea numérica

- **Found during:** Task 1, punto (a)
- **Motivo medido:** `lib/overlay-history.ts:81` declara `OverlayHistoryState = { frjOverlay: number }` y `:93-95` lo construye con un id monotónico. Chequear sólo la presencia de la clave haría que un `{ frjOverlay: undefined }` cualquiera bloqueara **toda** escritura de historial de la pantalla en silencio (la regla 0 es absoluta). Se comprueba `typeof === 'number'`, que es lo que ese módulo garantiza.
- **Impacto:** ninguno sobre el comportamiento real; endurece el predicado. Cubierto por `isOverlayOwnedEntry({ frjOverlay: 3 })` ⇒ `true` y `isOverlayOwnedEntry({ frjView: 'c' })` / `null` ⇒ `false`.

### 3. [Forma] `resolveViewParam` devuelve siempre las cuatro claves

- **Found during:** Task 1, punto (a)
- **Motivo medido:** el `<behavior>` describe salidas parciales (`{ selected, reconcile }` cuando no hay reconciliación). Con `strict: true` un tipo con `cause?`/`to?` obligaría al call site a estrecharlo antes de pasarlo al ejecutor, que es exactamente el "el call site vuelve a decidir política" que NAV-05 evita. Devuelve `cause: null` y `to: <lo mostrado>` en el caso sin reconciliación; los tests usan `toMatchObject`, así que la tabla del plan se verifica igual, clave por clave.

### 4. [Forma] `mergeGroup` registra la redirección de **todos** los duplicados absorbidos

- **Found during:** Task 2, punto (b)
- **Motivo medido:** el código viejo re-apuntaba la selección sólo si el cliente abierto era uno de los borrados. Registrar el mapa completo es más barato que condicionarlo y cubre el caso de dos fusiones encadenadas. No cambia nada observable cuando el cliente abierto no participa.

## Auth Gates

Ninguno.

## Known Stubs

Ninguno. No quedó ningún valor hardcodeado, placeholder ni componente sin fuente de datos.

## Threat Flags

Ninguna superficie de seguridad nueva fuera del `<threat_model>` del plan: cero migraciones, cero policies, cero endpoints, cero service role, cero superficie anónima. Lo único que cambió de naturaleza —un id de cliente viajando por la URL— está cubierto por T-01-01/02/03 y se cierra con la resolución contra la lista ya filtrada por tenant.

## Pendiente: UAT en celular real

**No se corrió — la hace el dueño**, y `auto_advance` está en `false` en el workstream a propósito. Este milestone **es** el botón atrás de un celular: sin abrir el navegador en un teléfono real no hay evidencia de nada. Los dos guiones están en el plan (`<human-check>` del Task 1 y del Task 2) e incluyen:

1. Finanzas → Clientes (con búsqueda y filtros puestos) → abrir un cliente → **la URL muestra `?c=…`** y el atrás devuelve el listado **con búsqueda y filtros intactos**. Si la URL cambia y el detalle **no** abre, es la trampa del `__NA`.
2. Recarga y URL compartida; `?c=inventado` y `?c=<id de otro negocio>` dando **lo mismo**.
3. El recorrido del borrado **con su chequeo de atrás muerto** (mirar la URL después de borrar: cuando deja de tener `?c=…`, el siguiente atrás tiene que hacer algo visible).
4. Cancelar el diálogo de borrado con el atrás del sistema (Bug A sigue arreglado, NAV-06).
5. El "Volver" desde una URL pegada: cierra el detalle **sin sacar del sitio**.
6. La fusión de duplicados: el detalle pasa al conservado **en el acto**, la URL puede seguir diciendo el id viejo **mientras el modal está abierto** (es el diferimiento correcto), y converge a `?c=<conservado>` **al cerrar el modal**.

## Self-Check: PASSED

- `lib/panel-history.ts` — FOUND
- `lib/panel-history.test.ts` — FOUND
- `app/(dashboard)/clients/page.tsx` — FOUND (modificado)
- `app/(dashboard)/clients/clients-client.tsx` — FOUND (modificado)
- Commit `ea9ab22` — FOUND
- Commit `71457a5` — FOUND
- `git rev-list --count 25ee8b2..HEAD` = **2**, coincide con `actuals.commits`
