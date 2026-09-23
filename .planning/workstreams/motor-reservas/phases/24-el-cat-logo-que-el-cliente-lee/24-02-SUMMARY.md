---
phase: 24-el-cat-logo-que-el-cliente-lee
plan: 02
subsystem: ui
tags: [nextjs16, rsc, supabase, dashboard, multi-tenant, vitest, rls]

requires:
  - phase: 24-el-cat-logo-que-el-cliente-lee
    provides: "`serviceCategories?: CatalogCategory[]` como prop pública de `BookingClient`, con su `?? []` en el punto de consumo y el render agrupado del paso 1 (plan 24-01)"
  - phase: 22-el-modelo-del-cat-logo
    provides: "la tabla base `service_categories` con RLS y sus 4 policies de tenant, y las dos columnas de modo de orden en `businesses` (migr. 078)"
  - phase: 23-el-panel-que-organiza-el-cat-logo
    provides: "el analog de lectura de `app/(dashboard)/servicios/page.tsx:35` — el doble `.order` con su motivo escrito"
provides:
  - "El preview del panel (`/web`) muestra el catálogo AGRUPADO y con el ancho nuevo, igual que `/{slug}` (CAT-08, D-13)"
  - "Los dos modos de orden llegan al preview: el select del negocio del panel pide `category_sort_mode` y `service_sort_mode`, igual que el del público (D-09)"
  - "Tres invariantes de cableado del preview en `test/catalog-public.test.ts` (11 casos en total), incluido el conteo de call sites de `BookingClient`"
  - "El caso de paridad de categorías preview ↔ público en `test/preview-booking-parity.test.ts` — el backstop `long-text / E4` del UI-SPEC, CORRIDO contra la DB real"
affects: [secure-phase 24, UAT visual de la fase 24, /gsd-verify-work 24]

actuals:
  tokens: 3881
  tasks: 2
  commits: 2
plan_head_before: 34610c4670d46b381038f869f944b20ebcd858e6

tech-stack:
  added: []
  patterns:
    - "La asimetría legítima de las dos lecturas de la fase: el público ordena por UNA clave (la vista proyecta 4 columnas), el panel por DOS (tabla base, `created_at` existe). Invertirla en cualquiera de los dos sentidos rompe algo distinto"
    - "Barrido de call sites como invariante medido: contar los montajes del componente sobre TODAS las fuentes del repo y exigir que cada archivo que monta pase la prop — un tercer montaje sin la prop es una regresión, no una variante"
    - "Marca por concatenación (`'<Booking' + 'Client'`) para que la suite de cableado no se matchee a sí misma en su propio barrido"

key-files:
  created: []
  modified:
    - app/(dashboard)/web/page.tsx
    - test/catalog-public.test.ts
    - test/preview-booking-parity.test.ts

key-decisions:
  - "Las dos columnas de modo de orden se agregan al select del panel EN LA MISMA PASADA que las del público: el comentario del propio archivo declara que su lista es 'misma lista que app/[slug]/page.tsx', así que agregarlas en uno solo rompe una invariante escrita en el repo, además de D-13"
  - "La lectura del preview va contra la TABLA BASE `service_categories` (nunca la vista `public_service_categories`): la vista es DEFINER sin `security_invoker` y desde una superficie autenticada dejaría el aislamiento por tenant en UNA sola capa. La base suma la RLS al `.eq('business_id', …)`: las dos"
  - "Columnas explícitas también en la lectura nueva (`id, business_id, name, sort_order`), no `select('*')` como el analog de /servicios: son las cuatro que consume el módulo puro y esta fila viaja al bundle del cliente"
  - "El caso de paridad lee con el rol del DUEÑO (anon-key autenticado), nunca con `t.admin`: el service-role bypassa RLS y haría pasar el caso con las policies rotas, que es exactamente el modo de falla a cazar"
  - "Cero CSS propio para el preview (D-14, G-24-7): `BookingClient` lleva su `max-w-lg mx-auto`, así que montado en el contenedor del panel ya se renderiza a 512px centrados. Lo único que le faltaba era el dato"

patterns-established:
  - "Cuando dos superficies montan el mismo componente, el gate no verifica 'el call site pasa la prop' sino 'los call sites son exactamente N y los N la pasan' — la cardinalidad es parte del invariante"

requirements-completed: [CAT-08, CAT-09, CAT-10]

coverage:
  - id: D1
    description: "El select de negocio del PANEL pide los dos modos de orden, igual que el del público (D-09/D-13)"
    requirement: CAT-08
    verification:
      - kind: unit
        ref: "test/catalog-public.test.ts#el select de negocio del PANEL pide LOS DOS modos de orden, igual que el del público"
        status: pass
    human_judgment: false
  - id: D2
    description: "La lectura de `service_categories` del preview va contra la tabla base, con filtro por tenant y el doble orden del analog de /servicios, y el archivo no lee la vista DEFINER"
    requirement: CAT-08
    verification:
      - kind: unit
        ref: "test/catalog-public.test.ts#el preview lee las categorías de la TABLA BASE, por tenant y con el doble orden del panel"
        status: pass
      - kind: other
        ref: "./node_modules/.bin/tsc --noEmit (filtrado, sin `error TS` fuera de .next/)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Los call sites de `BookingClient` son exactamente dos y los dos pasan `serviceCategories={serviceCategories || []}` (D-15, criterio 5 de la fase)"
    requirement: CAT-09
    verification:
      - kind: unit
        ref: "test/catalog-public.test.ts#los call sites de BookingClient son exactamente DOS y los dos pasan la prop"
        status: pass
    human_judgment: false
  - id: D4
    description: "El conjunto de categorías que el preview lee de la tabla base como dueño es el mismo que el público lee por la vista acotada, para el mismo tenant"
    requirement: CAT-08
    verification:
      - kind: integration
        ref: "test/preview-booking-parity.test.ts#(4) el set de categorías es el mismo leído como dueño (tabla base) que como anónimo (vista acotada)"
        status: pass
    human_judgment: false
  - id: D5
    description: "El preview es fiel sin una línea de CSS propio: `lib/preview-booking.ts` y `components/landing/landing-renderer.tsx` intactos, 41 migraciones, cero paquetes (D-14)"
    verification:
      - kind: other
        ref: "git diff --name-only -- package.json package-lock.json components/landing/landing-renderer.tsx: vacío · ls supabase/migrations/*.sql | wc -l = 41"
        status: pass
    human_judgment: false
  - id: D6
    description: "En pantalla: `/web` muestra el catálogo agrupado bajo títulos y a 512px centrados, se reordena igual que `/{slug}` al cambiar los dos modos, y con un negocio sin categorías vuelve a la lista plana"
    requirement: CAT-10
    verification: []
    human_judgment: true
    rationale: "Los 5 puntos del `<human-check>` piden abrir `/web` y `/{slug}` en paralelo con datos reales y comparar. La fidelidad visual del preview (que nada quede achicado ni estirado) y la paridad de orden entre las dos pantallas no tienen aserción automática posible en un entorno Vitest `node`. La UAT visual queda para el cierre de fase (`workflow.human_verify_mode: end-of-phase`), junto con los 10 puntos que dejó pendientes el plan 24-01."

duration: 6 min
completed: 2026-09-23
status: complete
---

# Phase 24 Plan 02: El preview del panel deja de mentir sobre el catálogo — Summary

**`/web` ahora muestra el catálogo exactamente como lo ve el cliente —agrupado bajo títulos, en el orden que el dueño configuró y a los 512px reales— porque el preview recibió el dato que le faltaba: las categorías leídas de la tabla base con la sesión del dueño y las dos columnas de modo de orden en su select. Cero CSS propio.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-09-23T04:08:48Z
- **Completed:** 2026-09-23T04:14:42Z
- **Tasks:** 2 de 2
- **Files modified:** 3 (3 modificados, 0 creados)

## Accomplishments

- **Los tres toques del RSC del panel, en una sola pasada.** (1) `category_sort_mode` y `service_sort_mode` al final del select explícito de `businesses` — las mismas dos que el plan 24-01 agregó al select del público, porque el comentario de ese archivo declara textualmente que su lista es *"misma lista que `app/[slug]/page.tsx`"*: agregarlas en uno solo rompe una invariante escrita en el repo. (2) La lectura de `service_categories` al final del `Promise.all`, contra la **tabla base** con RLS + `.eq('business_id', …)` y el doble `.order` del analog de `/servicios`. (3) `serviceCategories={serviceCategories || []}` en el mount de la rama que no es canchas.
- **La asimetría entre las dos lecturas de la fase quedó escrita donde vive.** El público ordena por **una** clave (`public_service_categories` proyecta cuatro columnas y `created_at` no está entre ellas: copiarla haría fallar la query y desagruparía el catálogo en silencio); el panel ordena por **dos**, porque es la tabla base y el desempate es lo que lo mantiene en el mismo orden que `/servicios`. El comentario nuevo explica las dos mitades, no solo la que aplica acá.
- **Ni una línea de CSS.** D-14 se confirmó en la práctica: `BookingClient` lleva su propio `max-w-lg mx-auto`, así que montado dentro del contenedor ancho del panel ya se renderiza a 512px centrados. No hubo `transform: scale()`, ni wrapper de ancho distinto, ni variante compacta del paso 1. `lib/preview-booking.ts` y `components/landing/landing-renderer.tsx` quedaron sin tocar, medido.
- **El conteo de call sites pasó a ser un invariante medido, no una afirmación.** El caso nuevo barre **todas** las fuentes del repo, exige que los montajes de `BookingClient` sean exactamente **dos** y que cada archivo que monta pase la prop con su `|| []`. Es el criterio 5 de la fase verificado por los dos caminos que existen — no apuntándole al `LandingRenderer`, que desde el quick 260913-3tv recibe `bookingSlot` como `ReactNode` requerido y ya no monta el componente.
- **El backstop `long-text / E4` del UI-SPEC está cerrado y CORRIÓ DE VERDAD.** El caso de paridad siembra dos categorías con service-role y después lee por los **dos caminos reales con los dos roles reales**: como dueño contra la tabla base (RLS activa, el camino del preview) y como anónimo sin sesión contra la vista acotada (el camino del público). Assertea primero que las dos lecturas **trajeron filas** —un `[]` de RLS es indistinguible de una proyección correcta— y después que el conjunto de ids es el mismo.

## Task Commits

1. **Task 1: El preview del panel recibe las categorías y los dos modos de orden** — `114848b` (feat)
2. **Task 2: Los invariantes del preview y la paridad de categorías, medidos** — `bc1bb6b` (test)

## Files Created/Modified

- `app/(dashboard)/web/page.tsx` — las dos columnas al final del select explícito de `businesses` (con el comentario que explica por qué van en los dos selects o no van), la lectura de `service_categories` al final del `Promise.all` (tabla base, columnas explícitas, filtro por tenant, doble orden, y el comentario con las cuatro razones: por qué la base y no la vista, por qué no se pierde fidelidad, por qué el desempate, qué pasa si falla) y la prop en el mount. La rama de `CanchasBookingClient` **no** se tocó.
- `test/catalog-public.test.ts` — tres casos más (de 8 a **11**) en un `describe` propio del preview, más dos marcas nuevas: `MONTAJE` (por concatenación, para que el archivo no se matchee a sí mismo en su propio barrido) y `PROP_CON_DEFAULT`.
- `test/preview-booking-parity.test.ts` — la siembra de dos categorías en el `beforeAll`, su borrado explícito en el `afterAll` (antes del teardown, aunque el `ON DELETE CASCADE` de la FK ya las alcanzaría) y el caso **(4)** de paridad de categorías.

## Decisions Made

Todas las decisiones de diseño venían LOCKED del `24-CONTEXT.md` (D-13, D-14, D-15) y del `24-UI-SPEC.md` (G-24-7). Se ejecutaron tal cual. Lo único que el plan delegaba y se resolvió acá:

- **Columnas explícitas en la lectura nueva** (`id, business_id, name, sort_order`) en vez del `select('*')` del analog de `/servicios`: son las cuatro que consume el módulo puro, y esta fila viaja al bundle del cliente. Ordenar por `created_at` sin proyectarla es legal en PostgREST sobre una tabla base (verificado: `tsc` limpio y el caso de paridad devolvió las dos filas sembradas).
- **Dónde caen las dos columnas nuevas del select:** al final de la lista, después de `landing_draft`. Viajan solas por la desestructuración que arma `publicBusiness`, tal como decía el plan — no hizo falta tocar nada más ni castear.
- **El borrado explícito de las categorías en el `afterAll`** aunque el CASCADE ya las alcance: deja la limpieza del fixture sin depender de que el borrado del negocio siga siendo el que limpia.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0.
**Impact on plan:** ninguno. Los anclajes que el plan verificó en la sesión anterior (el `.select(` del negocio, las dos puentes del `Promise.all`, la desestructuración de `publicBusiness`, el mount de la rama que no es canchas) estaban donde decía, y los tres toques entraron sin ningún eslabón sorpresa — a diferencia del plan 24-01, donde la desestructuración en la firma del componente obligó a un Rule 3.

## Issues Encountered

None.

## El caso de paridad: CORRIÓ, no se skipeó

> El plan exigía declararlo explícitamente, para que una suite salteada no se lea como cobertura.

`npx vitest run test/preview-booking-parity.test.ts` → **`Test Files 1 passed (1)` · `Tests 4 passed (4)`**, en 994ms. **Cuatro** casos, no tres: los tres de canchas/servicios/puentes que ya existían más el **(4)** de categorías de este plan. Las tres credenciales de Supabase estaban presentes (Supabase local levantado), así que el `describe.skipIf(!hasSupabaseCreds)` **no** se disparó y el caso pegó contra la base real, sembrando y leyendo con los dos roles. **El backstop `long-text / E4` del UI-SPEC queda efectivamente verificado, no pendiente.**

## Verificación del plan, punto por punto

| # | Criterio | Resultado |
|---|---|---|
| 1 | `tsc --noEmit` filtrado sin `error TS` fuera de `.next/` | ✅ vacío |
| 2 | El select del panel pide los dos modos de orden (D-09/D-13) | ✅ medido |
| 3 | La lectura del preview: tabla base, filtro por tenant, las dos claves de orden, sin la vista DEFINER | ✅ medido (bloque impreso en el gate) |
| 4 | Los **dos** call sites pasan la prop, y son exactamente dos | ✅ `call sites=2 · archivos con prop=2` |
| 5 | Cero CSS propio: `preview-booking.ts` y `landing-renderer.tsx` sin tocar (D-14) | ✅ `git diff` vacío |
| 6 | `eslint` en 0 sobre los tres archivos, 41 migraciones, cero paquetes | ✅ `rc=0 · 41 · []` |
| 7 | `test/catalog-public.test.ts` en 11 casos verdes, sin skips | ✅ **11 passed**, 0 skipped |
| 8 | El caso de paridad corre (o se declara skipeado) | ✅ **corrió**: 4 passed |
| 9 | `npx vitest run` ≥ 1325 | ✅ **1337 passed** \| 4 expected fail \| 1 skipped, **97 files passed, exit 0** |
| 10 | UAT visual de los 5 puntos | ⏳ **PENDIENTE** — diferida al cierre de fase por `human_verify_mode: end-of-phase` |

**Nota sobre la suite completa:** corrió a las **01:13 AR**, dentro de la ventana `[01:00, 23:30]` que exigen los dos canarios horarios (`test/service-delete-gate.test.ts` y `test/capacity-mode-change-gate.test.ts`). Los dos pasaron; los 2 rojos que reportó el plan 24-01 eran la guarda de reloj disparándose a las 00:40, no una regresión. El total subió de 1326 a 1337 por esos casos horarios que fuera de la ventana se saltean, más los 4 casos nuevos de este plan.

## Deuda y asunciones declaradas

- **La UAT visual de los 5 puntos de este plan no se corrió** (ni los 10 del plan 24-01). Es el único criterio de la fase sin medir, y es el que cubre la comparación lado a lado de `/web` contra `/{slug}` y el control negativo del negocio sin categorías en pantalla real. Queda para el cierre de fase.
- **Las dos asunciones declaradas del UI-SPEC siguen abiertas a propósito** y NO son huecos de esta fase, por decisión explícita del usuario del 2026-09-22: (1) con cero **servicios** el paso 1 queda en blanco debajo del `h2` (preexistente); (2) un nombre de servicio de 40+ caracteres **sin espacios** se sale a 375px (arreglarlo violaría D-07, que está LOCKED).
- **La rama de canchas del preview no recibió categorías**, por decisión escrita de la Phase 23: `CanchasBookingClient` es otro componente y el vertical quedó fuera de alcance.

## Known Stubs

Ninguno. La prop nueva tiene su lectura real, su filtro por tenant y su fail-safe declarado; no quedó ningún valor vacío cableado a la UI ni ningún componente sin fuente de datos.

## Threat Flags

Ninguna superficie de seguridad nueva fuera del `<threat_model>` del plan. La lectura agregada va contra la tabla base con la sesión del dueño (RLS + filtro explícito, las dos capas — T-24-07), el select sólo suma dos flags de presentación de enum acotado y nunca un comodín (T-24-08), la paridad quedó pinchada contra la base real (T-24-09) y el `|| []` conserva el fail-safe direccional (T-24-10). Cero migraciones (41, medido), cero `GRANT`, cero endpoints, cero escrituras, cero paquetes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **La Phase 24 está completa en código:** los dos planes ejecutados, los dos call sites de `BookingClient` reciben el catálogo agrupado y los dos ordenan con los mismos dos modos.
- **Lo que queda de la fase es la UAT visual** (10 puntos del plan 24-01 + 5 de éste, con la comparación `/web` ↔ `/{slug}` y el control negativo de cero categorías primero) y el `secure-phase 24`.

---
*Phase: 24-el-cat-logo-que-el-cliente-lee*
*Completed: 2026-09-23*

## Self-Check: PASSED

- Archivos declarados en `key-files`: los 3 existen en disco (+ este SUMMARY).
- Commits declarados: `114848b` y `bc1bb6b` existen en el historial.
- `commits: 2` es MEDIDO (`git rev-list --count 34610c4..HEAD`), no narrado.
