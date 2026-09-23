---
phase: 24-el-cat-logo-que-el-cliente-lee
plan: 01
subsystem: ui
tags: [nextjs16, rsc, supabase, tailwind4, react19, booking, multi-tenant, vitest]

requires:
  - phase: 22-el-modelo-del-cat-logo
    provides: "la tabla `service_categories`, la vista acotada `public_service_categories` (migr. 078 §5, GRANT SELECT a anon) y las dos columnas de modo de orden en `public_businesses`"
  - phase: 22-el-modelo-del-cat-logo
    provides: "`lib/service-categories.ts` — `groupCatalog`, `CatalogCategory`, `CatalogGroup`, `OTHER_GROUP_TITLE` y la regla de los dos ejes de orden, con 43 casos en test"
  - phase: 23-el-panel-que-organiza-el-cat-logo
    provides: "el panel donde el dueño crea categorías, asigna servicios y elige los dos modos de orden — el dato que esta fase hace visible"
provides:
  - "El catálogo público de `/{slug}` agrupado bajo títulos, en el orden que el dueño configuró en los dos ejes y con los tres modos (CAT-08)"
  - "El grupo de los sueltos al final, idéntico a una categoría real y siempre reservable (CAT-09)"
  - "Las tarjetas del paso 1 en una sola columna en desktop (~432px útiles), mobile byte-idéntico (CAT-10)"
  - "`serviceCategories?: CatalogCategory[]` como prop pública de `BookingClient` — el mismo dato que va a consumir el preview del panel en el plan 24-02"
  - "`test/catalog-public.test.ts` — ocho invariantes de cableado del camino público, carril paralelo"
affects: [24-02 preview del panel, secure-phase 24, UAT visual de la fase 24]

actuals:
  tokens: 10037
  tasks: 2
  commits: 2
plan_head_before: 887ac7117b3f0c0b4a480de495c6e859e31b1e06

tech-stack:
  added: []
  patterns:
    - "Fail-safe DIRECCIONAL de tres eslabones para una lectura pública nueva: `|| []` en el RSC + prop opcional + `?? []` en el punto de consumo. Un error de lectura DESAGRUPA el catálogo, nunca lo apaga"
    - "Render agrupado del paso 1: `div.space-y-6` > `div` (uno por grupo) > `h3.mb-2` + `div.grid`. El envoltorio por grupo es obligatorio (con Fragment el aire de 24px cae entre el título y sus propias tarjetas)"
    - "El tercer argumento de `groupCatalog` es SIEMPRE un objeto literal campo por campo, nunca un spread — invariante ahora medido sobre todas las fuentes del repo"

key-files:
  created:
    - test/catalog-public.test.ts
  modified:
    - app/[slug]/page.tsx
    - app/[slug]/booking-client.tsx

key-decisions:
  - "Las dos columnas de modo de orden se agregan al select EXPLÍCITO de `public_businesses` (nunca un select con comodín): sin nombrarlas los modos viajan `undefined` y el catálogo ordena igual que hoy por casualidad, sin un solo error visible"
  - "La lectura pública de categorías ordena por UNA sola clave (`sort_order`): copiar el `.order('created_at')` del panel haría fallar la query contra una vista de cuatro columnas y desagruparía el catálogo en silencio"
  - "La prop se tipa con `CatalogCategory` (del módulo puro) y no con `ServiceCategory` (de `lib/types`), que exige una columna que la vista pública deliberadamente no expone"
  - "El `<h3>` se condiciona SÓLO por `group.title !== null`: la regla de 'sin títulos' vive en el dato, no en un `if` sobre el largo de un arreglo"
  - "La jerarquía del título descansa en el TAMAÑO (14px contra 20px del `h2`), no en el peso: `themes.css` se importa sin capa y reescribe el peso del `h3` en 2 de los 5 themes"
  - "El gate de la grilla CUENTA 2 → 1 en vez de exigir la ausencia de la clase: la segunda ocurrencia es el picker de sedes del paso 3 y está fuera de alcance"

patterns-established:
  - "Gate de re-indentado: `git diff -w` contra HEAD sobre el rango de la tarjeta tiene que quedar vacío — convierte 'no toqué el cuerpo' en algo medido y no opinable"
  - "Suite de cableado con `sinComentarios()`: toda aserción negativa sobre código fuente descuenta comentarios primero, porque si no se satisface (o se rompe) con un comentario que mencione el término"

requirements-completed: [CAT-08, CAT-09, CAT-10]

coverage:
  - id: D1
    description: "El select público del negocio pide los dos modos de orden, y la lectura de `public_service_categories` entra al `Promise.all` con filtro por tenant y una sola clave de orden"
    requirement: CAT-08
    verification:
      - kind: unit
        ref: "test/catalog-public.test.ts#el select de public_businesses pide LOS DOS modos de orden"
        status: pass
      - kind: unit
        ref: "test/catalog-public.test.ts#la lectura de categorías va por la vista acotada, filtra por tenant y ordena por UNA sola clave"
        status: pass
      - kind: unit
        ref: "test/catalog-public.test.ts#el call site público pasa la prop con su red de seguridad"
        status: pass
    human_judgment: false
  - id: D2
    description: "`BookingClient` declara la prop opcional tipada con `CatalogCategory`, aplica el default en el punto de consumo y agrupa con los dos modos campo por campo en un objeto literal"
    requirement: CAT-08
    verification:
      - kind: unit
        ref: "test/catalog-public.test.ts#declara la prop OPCIONAL con el tipo del módulo puro y aplica el default en el punto de consumo"
        status: pass
      - kind: unit
        ref: "test/catalog-public.test.ts#ningún call site del repo compone los modos por propagación"
        status: pass
      - kind: other
        ref: "./node_modules/.bin/tsc --noEmit (filtrado, sin `error TS` fuera de .next/)"
        status: pass
    human_judgment: false
  - id: D3
    description: "El paso 1 itera grupos y pinta el `<h3>` sólo cuando el grupo trae título; el único condicional nuevo de la región es ése"
    requirement: CAT-08
    verification:
      - kind: unit
        ref: "test/catalog-public.test.ts#itera GRUPOS y el único condicional nuevo es el del título"
        status: pass
    human_judgment: false
  - id: D4
    description: "La grilla del paso 1 quedó en una columna y la del paso 3 (selector de sede) sigue en dos"
    requirement: CAT-10
    verification:
      - kind: unit
        ref: "test/catalog-public.test.ts#la grilla del paso 1 quedó en UNA columna y la del paso 3 sigue en DOS"
        status: pass
    human_judgment: false
  - id: D5
    description: "El cuerpo de la tarjeta de servicio no cambió: sólo se re-indentó un nivel (G-23-6, D-08, D-12 intactos)"
    verification:
      - kind: other
        ref: "diff contra HEAD del rango `key={service.id}` → 'Sin profesional disponible', normalizado por espacios: vacío"
        status: pass
    human_judgment: false
  - id: D6
    description: "El nombre de categoría, texto del dueño leído por un anónimo, llega interpolado en JSX y la pantalla pública no inyecta marcado crudo (T-24-01)"
    verification:
      - kind: unit
        ref: "test/catalog-public.test.ts#el título del dueño llega interpolado: la pantalla pública no inyecta marcado crudo"
        status: pass
    human_judgment: false
  - id: D7
    description: "En pantalla: los títulos se ven, el orden de los dos ejes y los tres modos coincide con el panel, el grupo de los sueltos se ve igual que una categoría real, el nombre largo deja de partirse a ~432px, el paso 3 queda intacto y con cero categorías la pantalla es la de hoy"
    requirement: CAT-09
    verification: []
    human_judgment: true
    rationale: "Los 10 puntos del `<human-check>` del plan sólo se pueden medir mirando la pantalla con datos reales: el backstop de CAT-10 (el nombre largo que deja de partirse) no tiene aserción automática posible en un entorno Vitest `node`, y el control negativo de cero categorías y la paridad de orden con el panel piden el navegador. La UAT visual queda para el cierre de fase (`workflow.human_verify_mode: end-of-phase`)."

duration: 46 min
completed: 2026-09-23
status: complete
---

# Phase 24 Plan 01: El catálogo agrupado, de la vista de Postgres a la pantalla del cliente — Summary

**La organización que el dueño le dio a su catálogo en el panel (Phase 23) ahora llega a `/{slug}`: los servicios se ven agrupados bajo títulos, en el orden que él configuró en los dos ejes, con los sueltos al final y nunca escondidos, y en desktop las tarjetas pasaron a una sola columna a lo ancho.**

## Performance

- **Duration:** 46 min
- **Started:** 2026-09-23T03:16:00Z
- **Completed:** 2026-09-23T04:02:00Z
- **Tasks:** 2 de 2
- **Files modified:** 3 (2 modificados, 1 creado)

## Accomplishments

- **El dato viaja de verdad, de punta a punta.** `public_businesses` ahora pide `category_sort_mode` y `service_sort_mode`; `public_service_categories` entra al `Promise.all` con `.eq('business_id', …)` y una sola clave de orden; la prop llega a `BookingClient` con su `|| []`. **Era el toque más importante del plan**: los dos RSC usan columnas explícitas a propósito, así que sin nombrar esas dos columnas los modos habrían viajado `undefined` y el catálogo habría ordenado igual que hoy *por casualidad*, para todos los negocios y sin un solo error a la vista.
- **El paso 1 se pinta por grupos** con `catalogGroups` (memoizado, porque el componente re-renderiza en cada tecla del paso 4) y un `<h3 className="text-sm font-bold break-words mb-2">` condicionado **sólo** por `group.title !== null`. Con cero categorías —o con categorías creadas pero ninguna asignada— `groupCatalog` devuelve un único grupo sin título y la pantalla vuelve a ser la de hoy, sin que nadie tenga que acordarse de escribir un `if`.
- **CAT-10 en la misma pasada:** la grilla del paso 1 pasó de `grid grid-cols-1 sm:grid-cols-2 gap-3` a `grid grid-cols-1 gap-3` — se borró **un modificador**, el ancho útil de la tarjeta pasó de 194px a 432px y en mobile no cambia nada porque la grilla ya era de una columna por debajo de 640px. La segunda grilla byte-idéntica del archivo (el selector de sede/consultorio del paso 3) **sigue en dos columnas**, medido.
- **El cuerpo de la tarjeta se movió un nivel adentro y nada más.** El diff del rango `key={service.id}` → `Sin profesional disponible`, normalizado por espacios contra `HEAD`, quedó **vacío**: el contenedor `relative isolate`, el botón estirado con su pseudo-elemento, `ServiceDescription` como hermana con su `toggleClassName` y el párrafo del motivo con su `aria-describedby` están intactos (G-23-6, D-08, D-12).
- **Ocho invariantes durables** en `test/catalog-public.test.ts`, incluido un barrido sobre **todas** las fuentes del repo que prohíbe componer el tercer argumento de `groupCatalog` por propagación (D-10 / CAT-07) — el único cambio que volvería equivocado el orden de todos los negocios en silencio.

## Task Commits

1. **Task 1 (tracer): El catálogo agrupado, de la vista de Postgres a la pantalla del cliente** — `c5cd01d` (feat)
2. **Task 2: Los invariantes durables del camino público** — `a871fbf` (test)

## Files Created/Modified

- `app/[slug]/page.tsx` — dos columnas más en el select explícito del negocio, la lectura de `public_service_categories` al final del `Promise.all` (con el comentario que explica qué vista, qué migración, por qué no la tabla base y qué pasa si falla) y la prop nueva en el call site de `BookingClient`. La rama de canchas **no** se tocó.
- `app/[slug]/booking-client.tsx` — import de `groupCatalog` + `CatalogCategory`, la prop opcional `serviceCategories?: CatalogCategory[]`, el `useMemo` `catalogGroups` y el render del paso 1 por grupos en una sola columna.
- `test/catalog-public.test.ts` — **nuevo**. Suite pura (carril paralelo), ocho casos, cada uno con su comentario `Previene: …`.

## Decisions Made

Todas las decisiones de diseño venían LOCKED del `24-CONTEXT.md` (D-01..D-15) y del `24-UI-SPEC.md` (G-24-1..G-24-8). Se ejecutaron tal cual, sin reinterpretarlas. Lo único que el plan delegaba y se resolvió acá:

- **Dónde cae el `useMemo`:** junto a los otros valores derivados, inmediatamente antes de `serviceBlocks` — es un derivado del paso 1 y `serviceBlocks` es del paso 3.
- **La key del grupo:** `group.categoryId ?? '__sueltos__'`, único por construcción porque el módulo emite como máximo un grupo con id de categoría nulo. Nunca el índice: con modo alfabético la posición de un grupo cambia entre renders.
- **El comentario de la región:** se escribió explicando el *por qué* (el envoltorio obligatorio, la escalera 8 < 12 < 24, la key estable, la columna única), no el *qué*. El comentario caduco del molde (`timeBlockServices` citando un fallback del `LandingRenderer` que ya no existe) **no** se copió.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] El componente desestructura props en la firma: la prop nueva no llegaba al cuerpo**

- **Found during:** Task 1
- **Issue:** `BookingClient` no recibe `props` como objeto, desestructura en la firma (`export function BookingClient({ business, services, … }: Props)`). Declarar `serviceCategories` en `interface Props` y usarla en el `useMemo` compiló en rojo: `error TS2304: Cannot find name 'serviceCategories'` (dos veces). Ni el PLAN ni PATTERNS nombran este eslabón — el camino de la prop que documenta PATTERNS §3a lista import / declaración / consumo / call site, pero no la desestructuración.
- **Fix:** agregar `serviceCategories` al final de la lista desestructurada de la firma, exactamente donde está `timeBlockServices`.
- **Files modified:** `app/[slug]/booking-client.tsx`
- **Verification:** `./node_modules/.bin/tsc --noEmit` filtrado pasó de 2 líneas `error TS` a cero.
- **Committed in:** `c5cd01d` (parte del commit del task)

**2. [Rule 2 - Missing critical] Timeout explícito en el barrido de todas las fuentes del repo**

- **Found during:** Task 2
- **Issue:** el caso que barre los ~370 archivos del repo corre en ~200ms **en caliente**, pero en la primera corrida de la sesión (árbol frío, antivirus de Windows tocando todo el árbol por primera vez) tardó **60.9 segundos** y reventó contra el `testTimeout` default de 5s de Vitest. Medido, no supuesto: la misma suite, sin cambios, pasó en 175ms en la corrida siguiente.
- **Fix:** timeout explícito de 60s **sólo para ese caso**, con el comentario que explica por qué. No se debilitó ni una aserción.
- **Files modified:** `test/catalog-public.test.ts`
- **Verification:** `npx vitest run test/catalog-public.test.ts` → 8/8 verdes, 201ms.
- **Committed in:** `a871fbf` (parte del commit del task)
- **Por qué es Rule 2 y no cosmética:** un gate durable que falla por el clima no es un gate — es ruido que alguien termina borrando, y con él se va el invariante que protege.

---

**Total deviations:** 2 auto-fixed (1 × Rule 3 bloqueante, 1 × Rule 2 correctitud del gate).
**Impact on plan:** ninguno sobre el alcance. Las dos son eslabones que el plan no podía ver desde afuera del archivo. Cero scope creep: no se tocó `lib/service-categories.ts`, ni `service-description.tsx`, ni el `landing-renderer`, ni la segunda grilla del paso 3, ni el cuerpo de la tarjeta.

## Issues Encountered

**Dos canarios de medianoche en rojo en la corrida de la suite completa — ajenos a este plan, verificados.**
`npx vitest run` cerró en **1326 passed** (piso de la fase: 1325) con exit 1 por dos casos: `test/service-delete-gate.test.ts` y `test/capacity-mode-change-gate.test.ts`, los dos en el caso `0 — canario: esta corrida cubre los casos horarios de GATE-03`. Son **guardas de reloj** que el propio repo escribió: fuera de la ventana `[01:00:00, 23:30:00]` en hora AR, sus casos horarios se saltean y el canario falla a propósito para que nadie dé la fase por verde sin enterarse. La corrida cayó a las 00:40 AR.

**No se dio por supuesto: se midió.** Se volvió a correr esos dos archivos a las **01:02 AR**, dentro de la ventana → **2 files passed, 31 passed | 1 expected fail, exit 0**. Ninguno de los dos toca los archivos de este plan. La suite completa está verde módulo la ventana horaria.

**Una corrida intermedia con 10 archivos en rojo por timeout fue ruido de arranque en frío** (esa corrida reportó 744s de `import` contra 31s en la siguiente). Re-corrida en caliente: 2 archivos en rojo, los dos canarios de arriba.

## Verificación del plan, punto por punto

| # | Criterio | Resultado |
|---|---|---|
| 1 | `tsc --noEmit` filtrado sin `error TS` | ✅ limpio |
| 2 | Camino del dato público completo (dos modos + vista con filtro de tenant, sin la clave que la vista no expone + prop con `|| []`) | ✅ medido |
| 3 | Cableado del cliente (import, prop opcional `CatalogCategory`, default en el punto de consumo, dos modos campo por campo) | ✅ medido |
| 4 | El paso 1 itera grupos, `<h3>` condicionado sólo por el dato, grillas 1 de dos columnas + 1 de una | ✅ `dos=1 · una=1 · h3=1` |
| 5 | Cuerpo de la tarjeta idéntico módulo espacios contra `HEAD` | ✅ diff vacío |
| 6 | `eslint` en 0 sobre los dos archivos, 41 migraciones, cero paquetes | ✅ `rc=0 · 41 · []` |
| 7 | `npx vitest run test/catalog-public.test.ts` verde, sin salteados | ✅ 8/8 |
| 8 | Suite completa ≥ 1325 | ✅ **1326 passed** |
| 9 | UAT visual de los 10 puntos | ⏳ **PENDIENTE** — diferida al cierre de fase por `human_verify_mode: end-of-phase` |

## Deuda y asunciones declaradas

- **La UAT visual de los 10 puntos no se corrió.** Es el único criterio de la fase sin medir, y **es el que cubre el backstop de CAT-10** (que el nombre largo deje de partirse a ~432px) y el control negativo de cero categorías en pantalla real. Queda para el cierre de fase.
- **Las dos asunciones declaradas del UI-SPEC siguen abiertas a propósito** y NO son huecos de este plan: (1) con cero servicios el paso 1 queda en blanco debajo del `h2` (preexistente); (2) un nombre de servicio de 40+ caracteres **sin espacios** se sale a 375px (arreglarlo violaría D-07, que está LOCKED).
- **Un hallazgo del hook de diseño, fuera de alcance:** `impeccable` marca un `broken-image` en el paso 2 de `booking-client.tsx` (hoy en la línea 775). Es **preexistente**, está en una región que este plan tiene prohibido tocar y no se modificó.

## Known Stubs

Ninguno. Esta fase no dejó ningún valor vacío cableado a la UI, ningún texto placeholder y ningún componente sin fuente de datos: la prop nueva tiene su lectura real y su fail-safe declarado.

## Threat Flags

Ninguna superficie de seguridad nueva fuera del `<threat_model>` del plan. Esta fase **consume** la vista que abrió la Phase 22: cero migraciones (41 archivos, medido), cero `GRANT`/`REVOKE`, cero endpoints, cero escrituras. Las dos columnas que se suman al select público son flags de presentación de enum acotado, ya expuestas por la vista.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Listo para el plan 24-02 (el preview del panel).** `BookingClient` ya acepta `serviceCategories` con su tipo público y su fail-safe; al preview de `/web` le falta exactamente lo mismo que le faltaba al público: **el dato**. Las dos columnas hay que agregarlas también al select de negocio de `app/(dashboard)/web/page.tsx` — mismo defecto silencioso, misma forma de arreglarlo (G-24-7, P-5).
- **Pendiente de la fase:** la UAT visual de los 10 puntos, con el control negativo de cero categorías primero.

---
*Phase: 24-el-cat-logo-que-el-cliente-lee*
*Completed: 2026-09-23*

## Self-Check: PASSED

- Archivos declarados en `key-files`: los 4 existen en disco.
- Commits declarados: `c5cd01d` y `a871fbf` existen en el historial.
- `commits: 2` es MEDIDO (`git rev-list --count 887ac71..HEAD`), no narrado.
