---
phase: 24-el-cat-logo-que-el-cliente-lee
verified: 2026-09-23T01:30:00Z
status: human_needed
score: 13/15 truths verified (2 backstop/insufficient_spec → human)
behavior_unverified: 0
overrides_applied: 0
covered_files:
  - ".planning/workstreams/motor-reservas/REQUIREMENTS.md"
  - ".planning/workstreams/motor-reservas/phases/24-el-cat-logo-que-el-cliente-lee/24-01-PLAN.md"
  - ".planning/workstreams/motor-reservas/phases/24-el-cat-logo-que-el-cliente-lee/24-01-SUMMARY.md"
  - ".planning/workstreams/motor-reservas/phases/24-el-cat-logo-que-el-cliente-lee/24-02-PLAN.md"
  - ".planning/workstreams/motor-reservas/phases/24-el-cat-logo-que-el-cliente-lee/24-02-SUMMARY.md"
  - "app/(dashboard)/web/page.tsx"
  - "app/[slug]/booking-client.tsx"
  - "app/[slug]/page.tsx"
  - "test/catalog-public.test.ts"
  - "test/preview-booking-parity.test.ts"
covered_digest: "v1:sha256:dd4684fc314ef28ee9327b9c86e8f5f4720c91acf069e2d680a7072d4b6d093f"
behavior_unverified_items: []
human_verification:
  - test: "Cero categorías (control negativo): abrir /{slug} de un negocio sin ninguna categoría creada"
    expected: "Ni un título de grupo, ni el literal 'Otros', ni desplazamiento vertical respecto de hoy; a 375px el render es idéntico al de antes del plan"
    why_human: "SC-3 del ROADMAP exige explícitamente verificación end-to-end en el navegador ('y no sólo en el módulo puro'); es una propiedad estructural (`groupCatalog` + `space-y-6` sin margen en el último hijo) que nadie midió todavía en una pantalla real"
  - test: "Con categorías: crear 2 categorías desde el panel, asignar algunos servicios y dejar uno sin asignar"
    expected: "Los dos títulos con sus tarjetas y, último, el grupo 'Otros' con el mismo tamaño/peso/tarjetas que una categoría real; el servicio suelto se puede reservar"
    why_human: "D-03/CAT-09 es un juicio visual de igualdad de tratamiento, no inferible de un conteo de clases"
  - test: "Los dos ejes y los tres modos de orden: cambiar categorías entre Personalizado/Alfabético y servicios entre Personalizado/Alfabético/Por precio"
    expected: "La pantalla pública se reordena igual que el panel en cada combinación"
    why_human: "Es el defecto más caro de la fase y no produce ningún error — un select sin las dos columnas ordena igual que hoy por casualidad; sólo se confirma mirando la pantalla con datos reales"
  - test: "Desktop (≥640px): nombre de servicio largo CON ESPACIOS en la tarjeta del paso 1"
    expected: "Entra en una sola línea a ~432px útiles, ya no se parte en dos"
    why_human: "CAT-10 marcado explícitamente 🧪 backstop en 24-UI-SPEC.md (`long-text / E4` / E3): 'se verifica midiendo en el navegador... el repo ya se equivocó dos veces estimando anchos de texto en el pizarrón'. Presencia de la clase `grid-cols-1` no prueba la métrica real de fuente"
  - test: "Paso 3 (selector de sede/consultorio) con negocio de 2+ sedes"
    expected: "Sigue en dos columnas, sin cambios"
    why_human: "Confirmación visual de que el conteo 2→1 de grillas no afectó la grilla equivocada"
  - test: "Mobile (375px): comparar el paso 1 contra un negocio con categorías vs. sin categorías"
    expected: "Byte-idéntico salvo los títulos nuevos: mismo ancho de tarjeta, mismo 'Ver más', mismos motivos"
    why_human: "D-07 es una afirmación de cero-cambio visual; sólo se confirma renderizando"
  - test: "Grupo mudo (D-12): categoría con todos sus servicios deshabilitados"
    expected: "Título normal, en su posición del orden; cada tarjeta con su motivo a la vista"
    why_human: "Juicio visual — el título no debe verse distinto ni moverse"
  - test: "Themes `spa` y `cyber` sobre el negocio de prueba"
    expected: "El título de grupo sigue leyéndose un nivel por debajo de 'Elegí tu servicio' (jerarquía por tamaño, no por peso) y no se rompe con la mayúscula de `cyber`"
    why_human: "`themes.css` se importa sin capa y reescribe peso/mayúscula del `h3`; sólo se confirma con el theme aplicado de verdad"
  - test: "Nombre de categoría con `<script>` adentro"
    expected: "Se ve como texto plano, no ejecuta nada"
    why_human: "Confirmación visual final de la interpolación JSX (el gate de código ya prueba la AUSENCIA de `dangerouslySetInnerHTML`, pero no sustituye la observación en navegador)"
  - test: "Consola del navegador durante el flujo completo"
    expected: "Sin avisos de hidratación ni warnings de `key`"
    why_human: "No medible por grep/tsc/eslint"
  - test: "/web (preview del panel) con negocio con categorías, comparado lado a lado con /{slug}"
    expected: "El preview muestra el catálogo agrupado con el mismo ancho, sin nada achicado/estirado/escalado; a 512px centrados dentro del contenedor ancho del panel"
    why_human: "D-14 es una afirmación de fidelidad visual ('cero CSS propio'); el código lo hace plausible pero no lo prueba con los ojos"
  - test: "/web: cambiar el modo de orden de categorías y de servicios y recargar"
    expected: "El preview se reordena igual que la pantalla pública"
    why_human: "Mismo defecto silencioso que el punto 3, verificado en la superficie del panel"
  - test: "/web con un negocio SIN categorías"
    expected: "Lista plana de siempre, sin títulos y sin 'Otros'"
    why_human: "Control negativo del preview, visual"
  - test: "/web: consola del navegador"
    expected: "Sin avisos nuevos"
    why_human: "No medible por grep/tsc/eslint"
---

# Phase 24: El catálogo que el cliente lee — Verification Report

**Phase Goal:** Que la organización que el dueño le dio a su catálogo llegue al cliente — servicios
agrupados bajo títulos en el orden que el dueño definió, los sin categoría al final bajo "Otros" y
nunca escondidos, con cero categorías la pantalla de hoy; el funnel sigue en 4 pasos; y en desktop las
tarjetas pasan a una columna a lo ancho.

**Verified:** 2026-09-23
**Status:** human_needed
**Re-verification:** No — verificación inicial

## Resumen ejecutivo

El código y los tests de la Phase 24 están **completos y correctos**: los dos planes (24-01 camino
público, 24-02 preview del panel) cablearon el dato de punta a punta, con 15 casos de test que miden
—no narran— cada invariante crítico de la fase, incluido un caso de paridad que corrió de verdad
contra Supabase local con los dos roles reales. Verifiqué de forma independiente (no confié en las
SUMMARY) el código fuente de los tres archivos de producción, re-corrí los dos archivos de test nuevos
(15/15 verdes) y reproduje a mano el gate de "cuerpo de tarjeta idéntico módulo espacios" comparando
contra el HEAD anterior al plan 24-01: **diff vacío**.

Lo que **no** está verificado es lo que la propia fase declaró que no podía medirse por código: la
**UAT visual de 15 puntos** (10 de 24-01 + 5 de 24-02), diferida a propósito por
`human_verify_mode: end-of-phase`, y explícitamente incluye el criterio 3 del ROADMAP ("verificado
**end-to-end en el navegador** y no sólo en el módulo puro") y el backstop 🧪 de CAT-10 ("el repo ya se
equivocó dos veces estimando anchos de texto en el pizarrón"). Ningún archivo de este run abrió un
navegador. Por eso el status es **`human_needed`**, no `passed`: el código no tiene gaps, pero la fase
tiene un checkpoint humano obligatorio y pendiente, y marcarla `passed` sin haberlo corrido escondería
exactamente el tipo de defecto que el UI-SPEC dice que este repo ya pagó dos veces.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | El select de `public_businesses` pide `category_sort_mode` y `service_sort_mode` (D-09) | ✓ VERIFIED | `app/[slug]/page.tsx:68` — leído verbatim, ambas columnas presentes en el select explícito |
| 2 | La lectura de `public_service_categories` va por la vista acotada, filtra por tenant, ordena por UNA sola clave (`sort_order`), sin `created_at` | ✓ VERIFIED | `app/[slug]/page.tsx:128` — `.eq('business_id', business.id).order('sort_order', {ascending:true})`, sin segunda clave |
| 3 | El call site público pasa `serviceCategories={serviceCategories \|\| []}` | ✓ VERIFIED | `app/[slug]/page.tsx:196` |
| 4 | `BookingClient` declara `serviceCategories?: CatalogCategory[]` (tipo del módulo puro, no `ServiceCategory`) | ✓ VERIFIED | `app/[slug]/booking-client.tsx:13,58` — import desde `@/lib/service-categories` |
| 5 | El tercer argumento de `groupCatalog` es un objeto literal campo por campo, nunca spread (D-10/CAT-07) | ✓ VERIFIED | `app/[slug]/booking-client.tsx:219-225` — `{ categories: business.category_sort_mode, services: business.service_sort_mode }`, sin `...` |
| 6 | El paso 1 itera grupos; el único condicional nuevo es `group.title !== null` | ✓ VERIFIED | `app/[slug]/booking-client.tsx:615-620` — sin `.length`, sin `.filter()` sobre grupos/servicios |
| 7 | Las grillas: 1 de dos columnas (paso 3, sedes) + 1 de una columna (paso 1) | ✓ VERIFIED | `grep -n` propio: `:620` una columna, `:805` dos columnas — exactamente 1+1 |
| 8 | Cuerpo de la tarjeta idéntico módulo espacios contra el HEAD anterior al plan (G-23-6, D-08, D-12) | ✓ VERIFIED | Reproducido de forma independiente: `diff` del rango `key={service.id}` → `Sin profesional disponible` entre `c5cd01d^` y `HEAD`, normalizado por espacios → **vacío** |
| 9 | El título de categoría llega interpolado, sin `dangerouslySetInnerHTML` en la región (T-24-01) | ✓ VERIFIED | `app/[slug]/booking-client.tsx:618` — `{group.title}` interpolado; `grep` confirma ausencia del patrón en el archivo |
| 10 | El select del panel (`/web`) pide los mismos dos modos de orden que el público (D-09/D-13) | ✓ VERIFIED | `app/(dashboard)/web/page.tsx:55` |
| 11 | El preview lee `service_categories` de la TABLA BASE (RLS + tenant + doble orden), nunca de la vista DEFINER | ✓ VERIFIED | `app/(dashboard)/web/page.tsx:145-150` — `.from('service_categories')…order('sort_order')…order('created_at')`, sin `public_service_categories` |
| 12 | Los call sites de `BookingClient` son exactamente DOS y los dos pasan la prop (SC-5, D-15) | ✓ VERIFIED | `grep -rn "<BookingClient"` = 2 (`app/[slug]/page.tsx`, `app/(dashboard)/web/page.tsx`); los dos con `serviceCategories={serviceCategories \|\| []}` |
| 13 | El conjunto de categorías leído como dueño (tabla base) coincide con el leído como anónimo (vista acotada), mismo tenant | ✓ VERIFIED | `test/preview-booking-parity.test.ts` caso (4) — **corrió contra Supabase local real**, no se skipeó: `Tests 4 passed (4)`, confirmado en esta corrida (`Test Files 2 passed (2)`, `Tests 15 passed (15)`) |
| 14 | Con al menos una categoría, el cliente **ve** el catálogo agrupado y ordenado como el dueño configuró, en pantalla real (CAT-08, SC-1 del ROADMAP) | ⚠️ insufficient_spec | El mecanismo está 100% cableado y medido (truths 1-9); la observación visual en `/{slug}` con datos reales no se corrió — ver Human Verification |
| 15 | Con cero categorías la pantalla es la de hoy, **verificado end-to-end en el navegador** (SC-3 del ROADMAP, redacción explícita) | ⚠️ insufficient_spec | El ROADMAP exige literalmente la comprobación en navegador ("no sólo en el módulo puro"); nadie abrió uno. La propiedad P1-P3 de G-24-2 está sólo demostrada en el módulo puro (Phase 22) y por inspección de código, no observada |
| 16 | CAT-10: nombre largo CON ESPACIOS deja de partirse a ~432px en desktop | ⚠️ insufficient_spec | Marcado explícitamente `verification: backstop` en el frontmatter del plan 24-01 y 🧪 backstop en `24-UI-SPEC.md` (`long-text / E3`): "se verifica midiendo en el navegador... no derivándolo". Presencia de `grid-cols-1` no prueba la métrica de fuente real |

**Score:** 13/16 verificadas por código+test · 3 marcadas `insufficient_spec` (ruteadas a verificación humana, no cuentan como falladas ni como verificadas — ROADMAP y UI-SPEC las declaran explícitamente no-inferibles del código)

### Deferred Items

Ninguno — no hay gaps reales que otra fase del milestone vaya a cerrar. Lo pendiente es un checkpoint
humano de esta misma fase, no trabajo corrido a una fase futura.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `app/[slug]/page.tsx` | dos modos de orden + lectura de `public_service_categories` + prop | ✓ VERIFIED | Existe, sustantivo, cableado — ver truths 1-3 |
| `app/[slug]/booking-client.tsx` | prop opcional + `catalogGroups` memoizado + render por grupos en una columna | ✓ VERIFIED | Existe, sustantivo, cableado — ver truths 4-9 |
| `app/(dashboard)/web/page.tsx` | dos modos de orden + lectura de `service_categories` (tabla base) + prop en el mount | ✓ VERIFIED | Existe, sustantivo, cableado — ver truths 10-12 |
| `test/catalog-public.test.ts` | 11 invariantes de cableado del camino público + preview | ✓ VERIFIED | Existe, 11 `it()` confirmados por `grep`, corridos: 11 passed (dentro de los 15 de esta corrida) |
| `test/preview-booking-parity.test.ts` (caso 4 nuevo) | paridad de categorías preview↔público, DB real, dos roles | ✓ VERIFIED | Corrió contra Supabase local, no se skipeó — evidencia de integración real, no sólo unitaria |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `public_service_categories` (migr. 078 §5) | prop `serviceCategories` de `BookingClient` (público) | lectura en `Promise.all` + `\|\| []` | ✓ WIRED | Confirmado línea por línea |
| `public_businesses.category_sort_mode/service_sort_mode` | tercer argumento de `groupCatalog` | select explícito → objeto literal | ✓ WIRED | Sin spread, campo por campo |
| `CatalogGroup.title` | `<h3>` del paso 1 | `group.title !== null` | ✓ WIRED | Único condicional de la región |
| tabla base `service_categories` (sesión del dueño) | prop `serviceCategories` de `BookingClient` (preview) | lectura en `Promise.all` del panel + `\|\| []` | ✓ WIRED | RLS + `.eq('business_id', …)`, nunca la vista DEFINER |
| `businesses.category_sort_mode/service_sort_mode` (panel) | `publicBusiness` → prop `business` del preview | desestructuración que arma `publicBusiness` | ✓ WIRED | Las dos columnas sobreviven la desestructuración sin cast |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `catalogGroups` (público) | `serviceCategories` | `public_service_categories` (vista, anon, tenant-filtrada) | Sí | ✓ FLOWING |
| `catalogGroups` (preview) | `serviceCategories` | `service_categories` (tabla base, RLS + sesión del dueño) | Sí | ✓ FLOWING |
| Orden de `catalogGroups` (ambos) | `category_sort_mode`/`service_sort_mode` | `public_businesses`/`businesses` | Sí | ✓ FLOWING |

Ningún valor estático ni mock: las dos rutas terminan en una query real con filtro por tenant, y el
caso de paridad demuestra —contra la base real— que ambas rutas devuelven el mismo conjunto de filas.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Los 15 casos de test nuevos de la fase corren y pasan | `npx vitest run test/catalog-public.test.ts test/preview-booking-parity.test.ts` | `Test Files 2 passed (2)` · `Tests 15 passed (15)` | ✓ PASS |
| El cuerpo de la tarjeta no cambió (G-23-6) — reproducido de forma independiente, no tomado de la SUMMARY | `diff` normalizado por espacios entre `c5cd01d^` y `HEAD` sobre el rango de la tarjeta | vacío | ✓ PASS |
| Ningún archivo prohibido fue tocado | `git diff --name-only 887ac71..HEAD -- components/landing/landing-renderer.tsx lib/preview-booking.ts lib/service-categories.ts` | sin salida | ✓ PASS |
| 41 migraciones, cero cambios de paquetes | `ls supabase/migrations/*.sql \| wc -l` = 41 · `git diff --name-only … package.json package-lock.json` vacío | confirmado | ✓ PASS |
| Sin marcadores de deuda (TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER) en los 5 archivos tocados | `grep -n -E` sobre los 5 archivos | únicos matches son "TODO servicio"/"TODOS los negocios" en prosa española, no marcadores | ✓ PASS |

### Probe Execution

No aplica — la fase no declara ni implica probes de `scripts/*/tests/probe-*.sh`.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| CAT-08 | 24-01, 24-02 | Agrupado bajo títulos, orden en los 2 ejes / 3 modos, funnel sin pasos nuevos | ⚠️ NEEDS HUMAN (mecanismo VERIFIED, visual pendiente) | Truths 1-9, 14 |
| CAT-09 | 24-01 | Servicio sin categoría siempre reservable, al final bajo "Otros" | ✓ SATISFIED | Truth 6-9; D-03 (mismas 4 clases, sin tratamiento distinto) confirmado por código — Regla 3 de `groupCatalog` no se tocó y sigue testeada en `test/service-categories.test.ts` (Phase 22, no re-testeado acá por diseño) |
| CAT-10 | 24-01 | Desktop una columna, mobile sin cambios, nombre largo no se parte | ⚠️ NEEDS HUMAN (grilla VERIFIED, backstop de métrica pendiente) | Truth 7, 16 |

No hay requisitos huérfanos: los tres IDs declarados en el frontmatter de ambos planes (CAT-08, CAT-09,
CAT-10) son exactamente los que `REQUIREMENTS.md` asigna a la Phase 24.

### Anti-Patterns Found

Ninguno. Los cinco archivos tocados están libres de marcadores de deuda, implementaciones vacías,
props con datos hardcodeados y `console.log` de depuración.

### Human Verification Required

Ver el bloque `human_verification` del frontmatter — 14 ítems, consolidando los 10 puntos del
`<human-check>` de 24-01 y los 5 de 24-02 (uno se fusionó por solapamiento exacto: "consola del
navegador"). Ninguno de los 14 se corrió en esta verificación ni en la ejecución de los planes
(`human_verify_mode: end-of-phase` los difirió a propósito al cierre de fase — que es ahora).

### Gaps Summary

**No hay gaps de código.** Los tres archivos de producción y los dos de test están completos,
cableados, medidos de forma independiente por esta verificación (no sólo citando las SUMMARY), y no
tocan ni un archivo fuera del alcance declarado. El `git diff --stat` contra el HEAD anterior a la fase
lista exactamente los 5 archivos de producción/test esperados más los artefactos de planning —nada
más.

Lo que falta para poder marcar la fase `passed` es un **checkpoint humano**, no una corrección de
código: los 14 puntos de UAT visual, con el control negativo de cero categorías primero (es el que
sostiene SC-3 del ROADMAP, redactado explícitamente para exigir navegador) y el backstop de CAT-10
(nombre largo que deja de partirse, marcado 🧪 en el UI-SPEC porque este repo ya midió mal anchos de
texto dos veces antes). Ejecutarlos es la única acción pendiente para cerrar la fase.

---

*Verified: 2026-09-23*
*Verifier: Claude (gsd-verifier)*
