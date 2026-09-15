---
phase: 22-el-modelo-del-cat-logo
verified: 2026-09-15T17:40:00Z
status: passed
score: 5/5 must-haves verificados (roadmap) + 2/2 requisitos (CAT-06, CAT-07)
covered_files:
  - ".planning/workstreams/motor-reservas/REQUIREMENTS.md"
  - ".planning/workstreams/motor-reservas/phases/22-el-modelo-del-cat-logo/22-01-PLAN.md"
  - ".planning/workstreams/motor-reservas/phases/22-el-modelo-del-cat-logo/22-01-SUMMARY.md"
  - ".planning/workstreams/motor-reservas/phases/22-el-modelo-del-cat-logo/22-02-PLAN.md"
  - ".planning/workstreams/motor-reservas/phases/22-el-modelo-del-cat-logo/22-02-SUMMARY.md"
  - ".planning/workstreams/motor-reservas/phases/22-el-modelo-del-cat-logo/22-03-PLAN.md"
  - ".planning/workstreams/motor-reservas/phases/22-el-modelo-del-cat-logo/22-03-SUMMARY.md"
  - ".planning/workstreams/motor-reservas/phases/22-el-modelo-del-cat-logo/22-04-PLAN.md"
  - ".planning/workstreams/motor-reservas/phases/22-el-modelo-del-cat-logo/22-04-SUMMARY.md"
  - ".planning/workstreams/motor-reservas/phases/22-el-modelo-del-cat-logo/22-REVIEW.md"
  - "lib/service-categories.ts"
  - "lib/types.ts"
  - "supabase/migrations/078_service_categories.sql"
  - "supabase/schema.sql"
  - "test/isolation.test.ts"
  - "test/service-categories-model.test.ts"
  - "test/service-categories.test.ts"
covered_digest: "v1:sha256:6decb9c29bb4228eed142b66eac3186f53ac1bdd45c78adc9fca47f0cb3fc4b0"
behavior_unverified: 0
overrides_applied: 0
human_verification: []
---

# Phase 22: El modelo del catálogo — Verification Report

**Phase Goal:** Que el catálogo de un negocio pueda declarar cómo se lee —categorías propias, con su
orden y su modo de orden— sin que eso cambie nada para quien no declare nada. Modelo: tabla
`service_categories` por negocio (migr. 078) + `services.category_id` nullable, con la regla del
comodín "la ausencia de dato significa 'se muestra como hoy', nunca 'no se muestra'" — lo que hace
CAT-07 verdadero por construcción.

**Verified:** 2026-09-15T17:40:00Z
**Status:** passed
**Re-verification:** No — verificación inicial

**Naturaleza de la fase:** infraestructura/fundación (modelo de datos, sin superficie de UI — el
panel es la Phase 23 y la página pública la 24). No hay elementos user-facing que verificar a mano.

## Goal Achievement

### Observable Truths (5 criterios de ROADMAP.md)

| # | Truth (criterio de ROADMAP) | Status | Evidencia |
|---|---|---|---|
| 1 | Cero categorías produce la lista de hoy — plana, sin títulos, sin "Otros", mismo orden — demostrado con control negativo sobre el camino real (CAT-07) | ✓ VERIFIED | Re-corrido en vivo: `npx vitest run test/service-categories-model.test.ts` → `Tests 3 passed (3)`. El Caso 1 lee `public_service_categories`/`public_services` con cliente anon puro **antes** de crear ninguna categoría y asierta que `groupCatalog` devuelve un único grupo con `title`/`categoryId` nulos y la lista de ids idéntica en orden y contenido a la que devolvió la vista. `groupCatalog` (lib/service-categories.ts:264-266) decide por el **resultado del reparto** (`porCategoria.size === 0`), no por `categories.length`, y sale **antes** de tocar cualquier comparador — confirmado leyendo el código. `test/service-categories.test.ts` (22 casos, re-corrido: `Tests 22 passed (22)`) agrega el caso que muerde: con cero categorías, `alpha` y `price` dan la **misma** salida que `custom` |
| 2 | El arreglo manual no se pierde al cambiar de modo: el modo elige un comparador dentro de una función pura que no escribe; volver a personalizado devuelve el arreglo intacto, con un test que lo muerde (CAT-06) | ✓ VERIFIED | `lib/service-categories.ts` no importa nada de Supabase/`next/`/React; `ordenadas()` (línea 177-179) es la única llamada a `.sort()` del módulo y opera siempre sobre `[...arr]` (copia), nunca sobre el parámetro — confirmado por lectura directa. `test/service-categories.test.ts` incluye el caso "custom → alpha → price → custom devuelve el arreglo del dueño IDÉNTICO" y el caso que además asierta que los arreglos de **entrada** quedan intactos tras las tres corridas. Re-corrido: 22/22 passed |
| 3 | La regla de agrupar y ordenar —incluido "Otros" al final— vive en un solo módulo puro con tests; ningún consumidor la reimplementa; el default ante ausencia es la lista plana | ✓ VERIFIED | Único módulo: `lib/service-categories.ts` (`groupCatalog`). Sin consumidores todavía (Phase 23/24 pendientes) — confirmado por `grep` cruzado: sólo `test/` importa `groupCatalog`/`OTHER_GROUP_TITLE`/`DEFAULT_SORT_MODES`, tal como documenta el propio 22-REVIEW.md (IN-05). Nada reimplementa la regla en otro archivo |
| 4 | Un servicio sin categoría y un negocio sin categorías son estados válidos y permanentes: `category_id` nullable y borrar una categoría no borra ni desactiva servicios (`ON DELETE SET NULL`) | ✓ VERIFIED | Migración 078 (líneas 227-231, 238-257): `category_id` uuid **nullable**, FK compuesta `services_category_same_tenant` con `ON DELETE SET NULL (category_id)` — confirmado con lista de columnas medida en vivo contra el catálogo de Postgres (ver abajo) y contra `test/isolation.test.ts` Caso 9, re-corrido: `npx vitest run test/isolation.test.ts` → `Tests 31 passed \| 1 skipped (32)` (el único skip es el gate de Storage de la Phase 15, preexistente y no relacionado). El caso 9 asierta las tres propiedades tras el borrado (servicio existe, `category_id` null, `business_id` intacto) más su presencia en `public_services` leída por un anon puro |
| 5 | El anon lee las categorías por `public_service_categories`; la tabla base no tiene policy `anon`; `services.category_id` sólo apunta a una categoría del mismo negocio (FK compuesta), probado con caso cross-tenant | ✓ VERIFIED | Medido en vivo contra el Postgres local (no sólo leído del SQL): 4 policies en `service_categories` (ninguna para `anon`), RLS activa, vista `public_service_categories` DEFINER sin `security_invoker`, 0 permisos distintos de `SELECT` para `anon`/`authenticated` en las tres vistas tocadas, FK con `ON DELETE SET NULL (category_id)` — las 8 mediciones del gate del catálogo se re-ejecutaron independientemente en esta verificación y la consulta devolvió **vacío** (las 8 pasan). `test/isolation.test.ts` Caso 8 + su control positivo prueban el cross-tenant contra la FK (no la RLS, que sí permitiría el update) |

**Score:** 5/5 truths verificadas (0 present-behavior-unverified)

### Requirements Coverage

| Requirement | Source Plan | Descripción | Status | Evidencia |
|---|---|---|---|---|
| CAT-06 | 22-01, 22-02 | El orden manual sobrevive a elegir alfabético/precio; volver a personalizado devuelve el arreglo del dueño intacto | ✓ SATISFIED | `lib/service-categories.ts` (función pura, ordena sobre copias) + `test/service-categories.test.ts` (ida y vuelta de modo, 22/22 passed en re-corrida) |
| CAT-07 | 22-01, 22-02, 22-03 | Negocio sin categorías ve exactamente la lista de hoy — cero regresión, por construcción | ✓ SATISFIED | `groupCatalog` regla de identidad (lib/service-categories.ts:260-266) + `test/service-categories-model.test.ts` (control negativo sobre camino real, 3/3 passed) + `test/service-categories.test.ts` (modos ni se miran con cero categorías) + `test/isolation.test.ts` (borrado no saca servicios de la venta, 31/32 passed) |

REQUIREMENTS.md marca ambos como `[x]` completos y los asigna exclusivamente a la Phase 22 en la tabla
de trazabilidad (`.planning/workstreams/motor-reservas/REQUIREMENTS.md:97-98`). No hay requisitos
huérfanos: ningún otro ID de esa tabla apunta a la Phase 22.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `supabase/migrations/078_service_categories.sql` | Tabla + RLS + 4 policies + índices + columnas nuevas + vista acotada + redefinición de 2 vistas + NOTIFY | ✓ VERIFIED | Leído íntegro; contiene las 7 secciones declaradas. Único `.sql` nuevo (39→40 confirmado con `ls`) |
| `lib/service-categories.ts` | `groupCatalog` — regla de agrupar con identidad ante cero categorías | ✓ VERIFIED | Leído íntegro; implementación real, sin stubs. Ver Warnings más abajo para matices de robustez ante datos ya bloqueados por NOT NULL en la base hoy |
| `test/service-categories-model.test.ts` | Prueba end-to-end: base → vista anon → módulo puro → catálogo agrupado | ✓ VERIFIED (WIRED, comportamiento ejecutado en esta verificación) | Re-corrida: 3/3 passed |
| `test/service-categories.test.ts` | Suite pura que congela la regla | ✓ VERIFIED | Re-corrida: 22/22 passed, sin imports de DB (clasificación de carril confirmada por `test/suite-split.test.ts` en el SUMMARY) |
| `test/isolation.test.ts` (bloque nuevo) | Aislamiento, permisos de las 3 vistas, FK cross-tenant, borrado no destructivo | ✓ VERIFIED | Re-corrida: 31 passed \| 1 skipped (32) — mismo resultado que el SUMMARY |
| `supabase/schema.sql` | Espejo quirúrgico del modelo | ✓ VERIFIED | Los 9 identificadores clave presentes (`grep -qF` re-ejecutado, lista `FALTAN` vacía) |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `services.category_id` | `service_categories (id, business_id)` | FK compuesta `ON DELETE SET NULL (category_id)` | ✓ WIRED | Confirmado leyendo `pg_get_constraintdef` en vivo contra el Postgres local: termina en `ON DELETE SET NULL (category_id)` |
| `public_service_categories` | `service_categories` | Vista DEFINER (owner postgres) + GRANT SELECT a anon | ✓ WIRED | Medido: 0 vistas con `reloptions` de invocador entre las 3 tocadas; lectura anon real vía `test/isolation.test.ts` (caso 5, ≥1 fila) |
| `public_services.category_id` | consumidor (`groupCatalog`, futuro RSC de Phase 24) | columna agregada al final de la vista existente | ✓ WIRED (a nivel de dato; el consumidor de UI es Phase 23/24, fuera de alcance) | `public_services` redefinida con `category_id`/`sort_order` al final, columnas viejas verbatim, `WHERE active = true` conservado |

### Anti-Patrones Encontrados

No se encontraron marcadores de deuda (`TBD`/`FIXME`/`XXX`) en ningún archivo tocado por la fase
(`grep` re-ejecutado sobre los 7 archivos de código/migración: sin resultados). No hay stubs: `groupCatalog`
implementa de verdad las tres reglas de agrupado y está probado end-to-end.

**Hallazgos del code review (22-REVIEW.md, ya documentados, no BLOCKER):** confirmé leyendo el código
actual que las 7 WARNINGs siguen presentes tal como las dejó el reviewer (el último commit de la fase
es el propio `docs(22): add code review report`, no hubo commits de fix posteriores):

- WR-01/WR-02: `porPrecio`/`porNombre` no manejan `null`/`''` de forma defensiva (un precio roto
  ordena primero como si fuera gratis; un nombre nulo puede tirar una excepción). Confirmado no
  alcanzable hoy: medí en vivo que `services.name`, `services.price` y `service_categories.name` son
  `NOT NULL` en la base local.
- WR-03: una categoría duplicada en la entrada emitiría el mismo servicio en dos grupos (viola la
  invariante de conservación). No alcanzable hoy: no hay ningún consumidor todavía (Phase 23/24
  pendientes), y `public_service_categories.id` es PK.
- WR-04: el merge `{ ...DEFAULT_SORT_MODES, ...modes }` no restaura el default ante un campo
  explícitamente `undefined`. Hoy no falla por accidente (los dos comparadores caen a `porOrden` por
  default de `if`), pero es un riesgo latente para el call site natural de Phase 23/24 (`business.category_sort_mode`
  es opcional en `lib/types.ts`).
- WR-05/WR-06/WR-07: fidelidad del espejo de `schema.sql` (grants de tabla base), normalización de
  espacios en el índice de nombre único, y orden de ejecución de un test DB-backed.

Ninguno de estos 7 ítems es un **must-have** de la Phase 22 tal como los define ROADMAP.md o el
frontmatter de los 4 planes — los 5 criterios de la fase están sostenidos por invariantes de la base
(`NOT NULL`) que hacen los caminos rotos inalcanzables **hoy**, y el propio review los clasificó
`warning`/`info`, no `critical`. Los dejo señalados como **WARNING** de esta verificación porque son
defectos reales en un módulo cuyo contrato declarado es "recibe filas de un tercero que no puede
validar", y su ventana de exposición se abre exactamente cuando la Phase 23/24 conecte el primer
consumidor real. Recomiendo cerrarlos como parte del plan de la Phase 23 antes (o junto con) el primer
call site, no reabrir la Phase 22 para esto.

### Requisito de evidencia (Step 7c — Probes)

No aplica: esta fase no declara ni usa `scripts/*/tests/probe-*.sh`; su verificación de comportamiento
son los tests de Vitest re-corridos arriba.

## Human Verification

N/A — Fase de infraestructura/fundación (modelo de datos), sin elementos user-facing. Los 5 criterios
del ROADMAP se verificaron programáticamente re-ejecutando los tests contra el Postgres local real
(no sólo leyendo SUMMARY.md) y midiendo el catálogo de Postgres en vivo. No hay ninguna verdad marcada
⚠️ PRESENT_BEHAVIOR_UNVERIFIED.

## Gaps Summary

Ninguno. Los 5 criterios de ROADMAP.md y los 2 requisitos (CAT-06, CAT-07) están sostenidos por
evidencia re-ejecutada en esta verificación: 3 corridas de Vitest independientes (22/22, 3/3, 31/32
passed — los mismos números que reportan los SUMMARY, confirmados de forma independiente) y una
consulta directa al catálogo de Postgres local que reprodujo las 8 mediciones del plan 22-01 con
resultado vacío (todas pasan). El typecheck y la suite completa fueron medidos por el orquestador
(`npm run build` exit 0, `npm test` 92 archivos / 1198 passed / 4 expected-fail / 1 skipped, exit 0) y
no encontré motivo para dudar de esa medición dado que los subconjuntos que sí re-corrí coinciden
exactamente.

Los 7 WARNINGs del code review (22-REVIEW.md) siguen sin fix en el código — confirmado por lectura
directa de `lib/service-categories.ts` — pero ninguno es alcanzable desde el camino real hoy (las
columnas `NOT NULL` de la base los bloquean, y no hay consumidor todavía). Quedan documentados arriba
como advertencia para la Phase 23, no como gap de esta fase.

**Pendiente operativo, no un gap:** la migración 078 no está aplicada a producción (prod sigue en la
077). Es explícitamente un paso manual de deploy fuera del alcance de este plan, documentado en el
runbook de la cabecera de la migración y en los tres SUMMARY.

---

_Verified: 2026-09-15T17:40:00Z_
_Verifier: Claude (gsd-verifier)_
