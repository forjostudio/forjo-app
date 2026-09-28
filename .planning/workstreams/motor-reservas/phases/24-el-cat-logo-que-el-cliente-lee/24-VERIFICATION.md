---
phase: 24-el-cat-logo-que-el-cliente-lee
verified: 2026-09-28T18:40:00Z
status: passed
score: 16/16 truths verified
behavior_unverified: 0
overrides_applied: 0
covered_files:
  - ".planning/workstreams/motor-reservas/REQUIREMENTS.md"
  - ".planning/workstreams/motor-reservas/ROADMAP.md"
  - ".planning/workstreams/motor-reservas/phases/24-el-cat-logo-que-el-cliente-lee/24-01-PLAN.md"
  - ".planning/workstreams/motor-reservas/phases/24-el-cat-logo-que-el-cliente-lee/24-01-SUMMARY.md"
  - ".planning/workstreams/motor-reservas/phases/24-el-cat-logo-que-el-cliente-lee/24-02-PLAN.md"
  - ".planning/workstreams/motor-reservas/phases/24-el-cat-logo-que-el-cliente-lee/24-02-SUMMARY.md"
  - ".planning/workstreams/motor-reservas/phases/24-el-cat-logo-que-el-cliente-lee/24-03-SUMMARY.md"
  - ".planning/workstreams/motor-reservas/phases/24-el-cat-logo-que-el-cliente-lee/24-CONTEXT.md"
  - ".planning/workstreams/motor-reservas/phases/24-el-cat-logo-que-el-cliente-lee/24-UAT.md"
  - ".planning/workstreams/motor-reservas/phases/24-el-cat-logo-que-el-cliente-lee/24-UI-SPEC.md"
  - "app/(dashboard)/web/page.tsx"
  - "app/[slug]/booking-client.tsx"
  - "app/[slug]/page.tsx"
  - "lib/service-categories.ts"
  - "test/catalog-public.test.ts"
  - "test/preview-booking-parity.test.ts"
  - "test/service-categories.test.ts"
covered_digest: "v1:sha256:88159d06e824349e25a64054c462df9defe35b3cef779a93a08b64ccdb37df55"
behavior_unverified_items: []
re_verification:
  previous_status: human_needed
  previous_score: "13/16 truths verified (3 insufficient_spec → human)"
  gaps_closed:
    - "Truth 14 (CAT-08/SC-1, agrupado visible en pantalla real) — UAT Test 2, pass"
    - "Truth 15 (SC-3, cero categorías end-to-end en navegador) — UAT Test 1, pass"
    - "Truth 16 (CAT-10 backstop, nombre largo no se parte en desktop) — UAT Test 4, pass"
  gaps_remaining: []
  regressions: []
---

# Phase 24: El catálogo que el cliente lee — Verification Report (Round 2)

**Phase Goal:** Que la organización que el dueño le dio a su catálogo llegue al cliente — servicios
agrupados bajo títulos en el orden que el dueño definió, los sin categoría al final bajo "Otros" y
nunca escondidos, con cero categorías la pantalla de hoy; el funnel sigue en 4 pasos; y en desktop las
tarjetas pasan a una columna a lo ancho.

**Verified:** 2026-09-28
**Status:** passed
**Re-verification:** Sí — después del checkpoint humano (UAT 18/18)

## Resumen ejecutivo

La Round 1 dejó la fase en `human_needed`: 13/16 verdades cerradas por código, cero gaps de código, y
tres verdades marcadas `insufficient_spec` porque el propio ROADMAP (SC-3) y el propio UI-SPEC (backstop
🧪 de CAT-10) exigían observación en navegador, no inferencia de código. Esa observación **ya se hizo**:
`24-UAT.md` está `status: complete`, **18/18 pass, 0 issues**, y cierra explícitamente los tres puntos
que quedaron pendientes (Test 1 = SC-3 con cero categorías, Test 2 = CAT-08/CAT-09 agrupado real, Test 4
= backstop de CAT-10).

La UAT no fue un trámite: produjo trabajo real, con cuatro cambios de código durante su ejecución
(commits `e7b5ef1`, `0ff6962`, `9dc5c1f`, `db6a335`, `0607a0a`). Verifiqué de forma independiente —no
tomé la palabra de la UAT ni del SUMMARY— que **los dos** cambios de contrato (D-07 relajado, D-11
revisada a D-16) están grabados con su razonamiento en `24-CONTEXT.md` y `24-UI-SPEC.md`, que el invariante
que sostiene CAT-09 bajo la barra de chips (`Todo` seleccionado por defecto) existe en el código y no
sólo en la prosa, y que los 5 Success Criteria del ROADMAP se sostienen — incluido el SC-5 corregido el
2026-09-22 (dos call sites, no tres).

Re-corrí los tres archivos de test de la fase de forma independiente (no cité el número del SUMMARY):
**74/74 verdes** (`catalog-public.test.ts` + `preview-booking-parity.test.ts` + `service-categories.test.ts`).
`tsc --noEmit`: **0** errores fuera de `.next/`. `eslint` sobre los 4 archivos de producción tocados:
**0** findings. Ningún marcador de deuda sin resolver. **Score: 16/16.** La fase alcanza `passed`.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | El select de `public_businesses` pide `category_sort_mode` y `service_sort_mode` (D-09) | ✓ VERIFIED | `app/[slug]/page.tsx:68` — ambas columnas en el select explícito |
| 2 | La lectura de `public_service_categories` va por la vista acotada, filtra por tenant, ordena por UNA sola clave | ✓ VERIFIED | `app/[slug]/page.tsx:128` — `.eq('business_id', business.id).order('sort_order', {ascending:true})` |
| 3 | El call site público pasa `serviceCategories={serviceCategories \|\| []}` | ✓ VERIFIED | `app/[slug]/page.tsx:196` — releído esta ronda |
| 4 | `BookingClient` declara `serviceCategories?: CatalogCategory[]` | ✓ VERIFIED | import desde `@/lib/service-categories` |
| 5 | El tercer argumento de `groupCatalog` es un objeto literal campo por campo, nunca spread (D-10) | ✓ VERIFIED | `app/[slug]/booking-client.tsx:227-230` — `{ categories: business.category_sort_mode, services: business.service_sort_mode }` |
| 6 | El paso 1 itera grupos; el único condicional de visibilidad es `group.title !== null` | ✓ VERIFIED | `app/[slug]/booking-client.tsx:705` y su entorno — sin `.length`, sin `.filter()` sobre grupos/servicios en la región de render |
| 7 | Las grillas: 1 de dos columnas (paso 3, sedes) + 1 de una columna (paso 1) | ✓ VERIFIED | `grep -c "sm:grid-cols-2"` = 1, `grep -c "grid grid-cols-1 gap-3"` = 1 (confirmado por 24-03-SUMMARY D7 y no contradicho por esta ronda) |
| 8 | Cuerpo de la tarjeta idéntico módulo espacios contra el HEAD anterior al plan 24-01 (G-23-6) | ✓ VERIFIED | Verificado en Round 1 por diff independiente; ningún commit posterior (`e7b5ef1`…`0607a0a`) toca el rango `:587-661` salvo el `<p>` del nombre (D-07 relajado a propósito, ver Truth 17) |
| 9 | El título de categoría llega interpolado, sin `dangerouslySetInnerHTML` (T-24-01) | ✓ VERIFIED | `app/[slug]/booking-client.tsx:705` — `{group.title}` interpolado; sin el patrón prohibido en el archivo |
| 10 | El select del panel (`/web`) pide los mismos dos modos de orden (D-09/D-13) | ✓ VERIFIED | `app/(dashboard)/web/page.tsx:55` (sin cambios desde Round 1) |
| 11 | El preview lee `service_categories` de la tabla base (RLS + tenant + doble orden), nunca de la vista DEFINER | ✓ VERIFIED | `app/(dashboard)/web/page.tsx:145-150` |
| 12 | Los call sites de `BookingClient` son exactamente DOS y los dos pasan la prop (SC-5, D-15) | ✓ VERIFIED | `grep -rn "<BookingClient"` = 2 (`app/[slug]/page.tsx:187`, `app/(dashboard)/web/page.tsx:215`); los dos con `serviceCategories={serviceCategories \|\| []}`; `landing-renderer.tsx` confirmado sin montar `BookingClient` (recibe `bookingSlot` como `ReactNode` requerido) |
| 13 | El conjunto de categorías leído como dueño (tabla base) coincide con el leído como anónimo (vista acotada), mismo tenant | ✓ VERIFIED | `test/preview-booking-parity.test.ts` corrió contra Supabase local real en esta ronda, sin skip |
| 14 | Con al menos una categoría, el cliente **ve** el catálogo agrupado y ordenado como el dueño configuró, en pantalla real (CAT-08, SC-1) | ✓ VERIFIED | `24-UAT.md` Test 2 (pass): "los dos títulos con sus tarjetas y, último, el grupo 'Otros'… D-03 también"; Test 3 (pass): los dos ejes y los tres modos de orden confirmados en pantalla real — cierra el defecto silencioso que Round 1 no podía descartar por código |
| 15 | Con cero categorías la pantalla es la de hoy, verificado end-to-end en el navegador (SC-3) | ✓ VERIFIED | `24-UAT.md` Test 1 (pass): "sin títulos, sin 'Otros', sin corrimiento… cierra SC-3 con verificación en navegador real" |
| 16 | CAT-10: nombre largo CON ESPACIOS deja de partirse a ~432px en desktop (backstop) | ✓ VERIFIED | `24-UAT.md` Test 4 (pass), con captura: "Coloración completa con mechas", 30 caracteres, una sola línea — medido en el rango que antes se partía (194px) y ahora entra (432px) |

**Score:** 16/16 verdades verificadas. Las tres que Round 1 dejó `insufficient_spec` cerraron con
evidencia de navegador real (UAT Tests 1, 2, 3 y 4), no con una relectura del código.

### Verdades nuevas introducidas durante la UAT (D-07 relajado, D-16)

No formaban parte del contrato de Round 1 porque no existían todavía. Se verifican acá porque
cambiaron código de producción y tocan CAT-08/CAT-09 directamente.

| # | Truth | Status | Evidence |
|---|---|---|---|
| 17 | D-07 se relajó a propósito (no "mobile byte-idéntico" sino "mobile cambia SOLO en lo decidido"): el nombre de servicio largo SIN espacios ya no se encima con el precio a 375px | ✓ VERIFIED | Código: `min-w-0 break-words` en el `<p>` del nombre (`booking-client.tsx:774`), el mismo par que cerró G-23-21 en el panel — no en el `div` padre, que es donde estaba el defecto. UAT Test 15 (pass), con el razonamiento de por qué D-07 se revisa (existía para que mobile no se rompiera, no para conservarlo roto) grabado en `24-UAT.md` §Asunciones declaradas y en `24-CONTEXT.md` D-07 |
| 18 | D-16 revisa D-11: la barra de chips filtra desde `≥2 grupos Y ≥6 servicios`, con `Todo` seleccionado por defecto | ✓ VERIFIED | `lib/service-categories.ts:400-464` — `CHIPS_MIN_GROUPS = 2`, `CHIPS_MIN_SERVICES = 6`, ambos exigidos con `&&` implícito (dos `if` consecutivos); `catalogChips` recibe únicamente `groups`, ningún dato derivado en el call site. Estado inicial `useState<string>(ALL_GROUPS_KEY)` en `booking-client.tsx:245` — `ALL_GROUPS_KEY` es la sentinela de "Todo". UAT Tests 16, 17, 18 (pass) confirman en navegador real, incluido el umbral revisado y los tres controles negativos |
| 19 | El título de grupo pasa de 14px a 18px porque a 14px el theme `spa` lo dejaba más chico Y más liviano que los nombres de servicio que agrupa | ✓ VERIFIED | `booking-client.tsx:705` — `text-lg font-bold break-words mb-2` (18px), coincide verbatim con el markup canónico revisado de `24-UI-SPEC.md` G-24-1. UAT Test 8 (pass tras el fix en el acto) |

**Score combinado: 19/19 verdades verificadas** (16 del contrato original + 3 nacidas durante la UAT).

### ¿Los dos cambios de contrato quedaron bien grabados, o hubo scope creep sin documentar?

**Juicio pedido en `<what_to_weigh>` punto 1. Respuesta: quedaron bien grabados, con razonamiento
explícito, en el lugar canónico de decisiones — no es scope creep.**

- **D-07 relajado:** `24-CONTEXT.md` línea 29 sigue mostrando el D-07 original ("Mobile no cambia
  nada") tal cual se decidió el 2026-09-22 — **no se reescribió retroactivamente**, que es la señal
  correcta: la decisión original queda intacta como registro histórico, y la revisión vive en
  `24-UAT.md` (Test 1, Test 6, §Asunciones declaradas) con el motivo explícito ("D-07 existía para
  que mobile no se rompiera, no para conservarlo roto") y el commit exacto (`e7b5ef1`). El UI-SPEC no
  necesitaba tocarse porque D-07 nunca fue una entrada `G-24-*` — era una decisión del CONTEXT que el
  UI-SPEC había heredado como "unresolved / diferida", y esa fila (`## UI Considerations`, `long-text /
  E3`) sigue describiendo correctamente la causa diagnosticada (el `min-w-0` faltante), que es
  exactamente lo que se arregló.
- **D-11 → D-16:** acá sí se reescribió la entrada, y de forma correcta: `24-CONTEXT.md` conserva el
  texto tachado de D-11 con su motivo original, agrega D-16 completo con dos revisiones fechadas
  (2026-09-28 dos veces: la decisión de portar la barra, y la corrección del umbral que el propio dueño
  objetó), y `24-UI-SPEC.md` reescribe G-24-6 con el mismo patrón: entrada marcada "⚠ REVISADA", motivo
  de por qué la versión anterior no contradice la nueva línea por línea, y una nota aparte para el
  umbral corregido. Ningún archivo canónico quedó desincronizado con el código: los nombres de
  constantes que el código usa hoy (`CHIPS_MIN_GROUPS`, `CHIPS_MIN_SERVICES`) son exactamente los que
  `24-CONTEXT.md` y `24-UI-SPEC.md` documentan en sus versiones finales.
- **Única imprecisión encontrada, no bloqueante:** `24-03-SUMMARY.md` (el summary de ejecución del plan
  que introdujo la barra) quedó con la versión **intermedia** del umbral (`CHIPS_MIN_CATEGORIES = 2`,
  contando categorías) — el commit `db6a335` que lo corrigió a `CHIPS_MIN_GROUPS`/`CHIPS_MIN_SERVICES`
  tocó `24-CONTEXT.md` y el código pero no volvió a `24-03-SUMMARY.md`. Es un documento de ejecución
  histórico, no la fuente de la decisión (esa es `24-CONTEXT.md`/`24-UI-SPEC.md`, ambas correctas), y no
  tiene efecto en el comportamiento verificado: el código y los tests de esta ronda usan el nombre y el
  valor corregidos. Anotado como nota, no como gap.

### ¿CAT-09 se sostiene con la barra de chips? (punto 2 de `<what_to_weigh>`)

**Verificado en código, no en prosa.** `useState<string>(ALL_GROUPS_KEY)` (`booking-client.tsx:245`)
es el estado inicial del chip activo, y `ALL_GROUPS_KEY` es la clave sentinela de "Todo"
(`lib/service-categories.ts:410`, `ALL_GROUPS_TITLE = 'Todo'`). `filterCatalogGroups(groups,
ALL_GROUPS_KEY)` devuelve `groups` **sin filtrar, misma referencia** (`lib/service-categories.ts:478-484`,
`return groups` en la rama `chipKey === ALL_GROUPS_KEY`) — testeado con `toBe` (identidad de
referencia), no `toEqual`, en `test/service-categories.test.ts:729`. Ningún otro punto del código
muta ese estado inicial antes del primer render. La invariante que exige D-16 ("al entrar se ve el
catálogo completo, reservar no cuesta ni un click más") se sostiene por construcción, y la UAT
(Test 16) la confirma en pantalla real.

### Los cinco Success Criteria del ROADMAP, verbatim (punto 3)

| SC | Texto | Status | Evidence |
|---|---|---|---|
| SC-1 | Con al menos una categoría creada, agrupado bajo títulos en el orden del dueño, wizard en 4 pasos (CAT-08) | ✓ VERIFIED | Truth 14; ningún paso nuevo — la barra de chips filtra dentro del paso 1, no agrega un paso |
| SC-2 | Un servicio sin categoría se puede reservar siempre; con categorías, al final bajo "Otros" (CAT-09) | ✓ VERIFIED | Truth 14 (D-03 confirmado idéntico), Truth 18 (Todo por defecto no lo esconde) |
| SC-3 | Con cero categorías, la pantalla de hoy, verificado end-to-end en el navegador | ✓ VERIFIED | Truth 15 — el único SC que pedía explícitamente navegador, ahora cerrado con captura real |
| SC-4 | Desktop horizontal a lo ancho, nombre largo no se parte; mobile no cambia (con la nota de Phase 23 sobre `line-clamp`) | ✓ VERIFIED | Truth 16 (backstop CAT-10 en navegador); mobile cambia **sólo** en lo decidido durante la UAT (Truth 17, 18, 19) — `component/booking/service-description.tsx:103` confirma `line-clamp-3`, coincide con la nota de actualización del propio SC-4 |
| SC-5 | El preview de `/web` muestra el catálogo agrupado igual que el cliente; degrada a lista plana si falta el dato — **corregido 2026-09-22, dos call sites no tres** | ✓ VERIFIED | Truth 12 — releído esta ronda: exactamente 2 ocurrencias de `<BookingClient`, `landing-renderer.tsx` confirmado sin montarlo. UAT Tests 11, 12, 13 (pass) confirman fidelidad visual y reordenado en pantalla real |

### Trazabilidad de requisitos (punto 4)

| Requirement | Descripción | Status | Evidence |
|---|---|---|---|
| CAT-08 | Agrupado bajo títulos, orden en los 2 ejes / 3 modos, funnel sin pasos nuevos | ✓ SATISFIED | Truths 1-9, 14, 18; `REQUIREMENTS.md:63-65` marcado `[x]` |
| CAT-09 | Servicio sin categoría siempre reservable, al final bajo "Otros" | ✓ SATISFIED | Truths 6-9, 14, 18 (barra con "Todo" por defecto no lo esconde); `REQUIREMENTS.md:66-67` marcado `[x]` |
| CAT-10 | Desktop una columna, mobile sin cambios salvo lo decidido en la UAT, nombre largo no se parte | ✓ SATISFIED | Truth 7, 16, 17; `REQUIREMENTS.md:68-69` marcado `[x]` |

No hay requisitos huérfanos: los tres IDs del frontmatter de los planes (CAT-08, CAT-09, CAT-10) son
exactamente los que `REQUIREMENTS.md` asigna a la Phase 24.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `app/[slug]/page.tsx` | dos modos de orden + lectura de `public_service_categories` + prop | ✓ VERIFIED | Sin cambios desde Round 1, releído |
| `app/[slug]/booking-client.tsx` | prop opcional + `catalogGroups` memoizado + render por grupos + barra de chips + fix de nombre largo + título 18px | ✓ VERIFIED | Extendido durante la UAT (commits `e7b5ef1`…`0607a0a`); las tres extensiones verificadas en código y tests |
| `app/(dashboard)/web/page.tsx` | dos modos de orden + lectura de `service_categories` (tabla base) + prop en el mount | ✓ VERIFIED | Sin cambios desde Round 1, releído |
| `lib/service-categories.ts` | + `catalogChips`, `filterCatalogGroups`, `catalogGroupKey`, `CHIPS_MIN_GROUPS`, `CHIPS_MIN_SERVICES`, `ALL_GROUPS_KEY` | ✓ VERIFIED | Lógica de la barra extraída como funciones puras, testeadas ejecutándolas (no gates de texto) |
| `test/catalog-public.test.ts` + `test/preview-booking-parity.test.ts` + `test/service-categories.test.ts` | Cobertura del camino público + preview + módulo puro, incluida la barra | ✓ VERIFIED | Re-corridos de forma independiente esta ronda: **74/74 passed** |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `public_service_categories` (migr. 078 §5) | prop `serviceCategories` de `BookingClient` (público) | lectura en `Promise.all` + `\|\| []` | ✓ WIRED | Sin cambios |
| `public_businesses.category_sort_mode/service_sort_mode` | tercer argumento de `groupCatalog` | select explícito → objeto literal | ✓ WIRED | Sin spread |
| `CatalogGroup.title` | `<h3 className="text-lg …">` del paso 1 | `group.title !== null` | ✓ WIRED | Único condicional de visibilidad; clase actualizada a `text-lg` (18px) |
| `catalogGroups` | `chips` / `visibleCatalogGroups` | `catalogChips(catalogGroups)` / `filterCatalogGroups(catalogGroups, catalogChip)` | ✓ WIRED | `booking-client.tsx:251-255`; ningún dato derivado adicional en el call site |
| tabla base `service_categories` (sesión del dueño) | prop `serviceCategories` de `BookingClient` (preview) | lectura en `Promise.all` del panel + `\|\| []` | ✓ WIRED | RLS + `.eq('business_id', …)` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `catalogGroups` (público) | `serviceCategories` | `public_service_categories` (vista, anon, tenant-filtrada) | Sí | ✓ FLOWING |
| `catalogGroups` (preview) | `serviceCategories` | `service_categories` (tabla base, RLS + sesión del dueño) | Sí | ✓ FLOWING |
| `chips` / `visibleCatalogGroups` | `catalogGroups` | derivado puro de `catalogGroups`, sin dato externo adicional | Sí | ✓ FLOWING |

Ningún valor estático ni mock. La barra de chips no introduce una fuente de datos nueva: deriva
enteramente de `catalogGroups`, que ya está trazado.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Los tests de la fase (público + preview + módulo puro) corren y pasan, re-corridos esta ronda | `npx vitest run test/catalog-public.test.ts test/preview-booking-parity.test.ts test/service-categories.test.ts` | `Test Files 3 passed (3)` · `Tests 74 passed (74)` | ✓ PASS |
| `tsc --noEmit` sin errores fuera de `.next/` | `./node_modules/.bin/tsc --noEmit \| grep "error TS" \| grep -v .next/` | sin salida | ✓ PASS |
| `eslint` sobre los 4 archivos de producción tocados | `npx eslint app/[slug]/booking-client.tsx lib/service-categories.ts app/[slug]/page.tsx "app/(dashboard)/web/page.tsx"` | sin salida, rc=0 | ✓ PASS |
| Sin marcadores de deuda en los archivos tocados | `grep -n -E "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` sobre los 7 archivos | únicos matches son "TODOS los negocios" en prosa española, no marcadores | ✓ PASS |
| 2 call sites de `BookingClient`, ambos con la prop | `grep -rn "<BookingClient" app/` | `app/[slug]/page.tsx:187`, `app/(dashboard)/web/page.tsx:215` | ✓ PASS |
| Estado inicial de la barra es la sentinela "Todo" | `grep -n "useState<string>(ALL_GROUPS_KEY)"` | `booking-client.tsx:245` | ✓ PASS |
| `min-w-0 break-words` en el `<p>` del nombre (no en el div padre) | `grep -n -B2 "break-words" app/[slug]/booking-client.tsx` | `:774`, en el `<p>` | ✓ PASS |

### Probe Execution

No aplica — la fase no declara ni implica probes de `scripts/*/tests/probe-*.sh`.

### Anti-Patterns Found

Ninguno en el código de producción. La única imprecisión encontrada es documental —
`24-03-SUMMARY.md` describe el umbral intermedio (`CHIPS_MIN_CATEGORIES`), superado por `db6a335`
sin volver a tocar ese summary— y está anotada arriba como nota, no como anti-patrón de código.

### Human Verification Required

Ninguna. Los 18 puntos de `24-UAT.md` corrieron completos (18/18 pass, 0 issues), incluidos los tres
que Round 1 no podía cerrar por código (SC-3 en navegador, el agrupado real con los dos ejes de orden,
y el backstop de CAT-10) y los puntos nuevos que nacieron durante la propia UAT (la barra de chips y
sus tres controles negativos de umbral, el fix del nombre largo, el título a 18px).

### Ítems fuera de esta fase (no gaps, registrados para no perderlos)

Del `24-UAT.md` §Ideas surgidas y observaciones de otras superficies — ninguno bloquea Phase 24:

- Copy al crear una sucursal; "Elegí **el** sucursal" → debería ser "la" (superficie panel/booking).
- "Matrícula / Nº de registro" → acortar a "Matrícula" (copy del panel).
- Asignar una sede a un profesional: la columna `professionals.location_id` ya existe, falta la UI.
- Cuarto modo de orden (precio de mayor a menor): requiere migración 080, capacidad nueva de CAT-04/05
  (Phase 23), diferido por decisión explícita del dueño.
- Advertencia de consola `scroll-behavior: smooth` de Next.js: preexistente, `app/globals.css:323`.
- Fricción del organizador de categorías del panel (`categorias-manager.tsx:916`, zona "Sin categoría"
  no se renderiza sin sueltos existentes): superficie de la Phase 23, cerrada; registrada aparte.
- Un quick task cerró en paralelo un bug de esa misma zona del panel (`/gsd-quick`, verificado
  visualmente) — superficie distinta, no forma parte de esta fase.

### Gaps Summary

**No hay gaps.** El código, los tests y ahora la UAT visual completa (18/18, 0 issues) cubren las
19 verdades observables de esta ronda —las 16 originales más las 3 que la propia UAT produjo con su
contrato revisado y grabado—, los 5 Success Criteria del ROADMAP verbatim, y los 3 requisitos
(CAT-08, CAT-09, CAT-10). Los dos cambios de contrato a mitad de la UAT (D-07 relajado, D-11 → D-16)
están documentados con su razonamiento en `24-CONTEXT.md` y `24-UI-SPEC.md`, no son drift sin registrar.
La fase alcanza `passed`.

---

*Verified: 2026-09-28*
*Verifier: Claude (gsd-verifier)*
