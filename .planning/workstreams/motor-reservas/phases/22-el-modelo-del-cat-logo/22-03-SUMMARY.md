---
phase: 22-el-modelo-del-cat-logo
plan: 03
subsystem: testing
tags: [vitest, supabase, rls, postgres, multi-tenant, regression, security]

# Dependency graph
requires:
  - phase: 22-el-modelo-del-cat-logo
    provides: "la migración 078 (service_categories + FK compuesta con lista de columnas + las tres vistas públicas en SELECT-only) y su espejo en schema.sql"
  - phase: 18-el-modelo-y-la-disponibilidad
    provides: "el molde del bloque `agenda por servicio` en test/isolation.test.ts (fixtures por tenant, anon puro, aserción de denegación, chequeo independiente del efecto) y el hotfix 072 que cerró CR-01"
provides:
  - "Bloque de regresión `el catálogo por categorías: service_categories + sus vistas públicas` en test/isolation.test.ts (10 casos)"
  - "Test de regresión de CR-01 sobre las DOS vistas REDEFINIDAS por la 078 (`public_services` / `public_businesses`), medido con control negativo"
  - "Prueba de que la FK compuesta —y no la RLS— rechaza el `category_id` cross-tenant, con su control positivo"
  - "Prueba de que borrar una categoría deja el servicio vivo, con su `business_id` intacto y todavía visible en `public_services` para un anon puro (CAT-07 / CAT-09)"
affects: [23-el-panel-del-catalogo, 24-el-catalogo-publico]

# Actuals (#2632) — estimateTokens (chars/4) sobre el diff realizado, no tokens de harness.
actuals:
  tokens: 3978
  tasks: 2
  commits: 2
plan_head_before: 09340eaf0ac87d2501bb7c54d7fa69992a03b881

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Control negativo medido: antes de aceptar que un test de seguridad pasa, romper la garantía en el motor real y verificar que el caso se pone ROJO"
    - "Bloque de regresión por migración en test/isolation.test.ts: fixtures propios por tenant, anon puro para el camino público, service-role sólo para sembrar/limpiar/chequear efecto"

key-files:
  created: []
  modified:
    - test/isolation.test.ts

key-decisions:
  - "El control positivo del caso 8 va como `it` propio y no como una aserción más dentro del caso cross-tenant: si compartieran el caso, un fallo del positivo se leería como un fallo de aislamiento"
  - "El caso 3 asierta la SUPERVIVENCIA de las filas y no sólo el error del intento: PostgREST puede devolver 2xx sin borrar nada, y un error de red daría falso verde si sólo se mirara el `error`"
  - "El gate literal del plan (`cero skipeados` a nivel archivo) se ajustó al skip conocido del upload-gate de Storage, que la propia línea de base del plan ya contabiliza"

patterns-established:
  - "Medir el diente del test: cada garantía nueva de seguridad se rompe deliberadamente en el Postgres local (GRANT temporal / constraint re-creado) y se verifica que el caso falle, antes de darlo por bueno"
  - "Las tres aserciones del borrado van juntas y la del `business_id` es la que discrimina: las otras dos pasan igual con la implementación rota"

requirements-completed: [CAT-07]

coverage:
  - id: D1
    description: "El público sin sesión no puede ESCRIBIR ni BORRAR por la vista nueva `public_service_categories`, y tampoco escribir la tabla base `service_categories`"
    requirement: "CAT-07"
    verification:
      - kind: integration
        ref: "test/isolation.test.ts#el público SIN sesión no puede ESCRIBIR por la vista nueva (public_service_categories)"
        status: pass
      - kind: integration
        ref: "test/isolation.test.ts#el público SIN sesión no puede BORRAR por la vista nueva (public_service_categories)"
        status: pass
      - kind: integration
        ref: "test/isolation.test.ts#el público SIN sesión no puede escribir la TABLA BASE service_categories"
        status: pass
    human_judgment: false
  - id: D2
    description: "Las DOS vistas que la 078 REDEFINIÓ (`public_services` y `public_businesses`) siguen siendo de sólo lectura para el anon: CR-01 no se reabrió. Medido con control negativo — con `GRANT DELETE ... TO anon` el caso se pone rojo"
    verification:
      - kind: integration
        ref: "test/isolation.test.ts#CR-01 (regresión): las DOS vistas REDEFINIDAS siguen siendo de sólo lectura para el anon"
        status: pass
      - kind: integration
        ref: "psql: GRANT DELETE ON public.public_services TO anon → el caso falla (expected +0 to be 1); REVOKE → vuelve a verde y los grants quedan en SELECT-only"
        status: pass
    human_judgment: false
  - id: D3
    description: "El público SÍ lee por la vista acotada y recibe filas reales (la vista es DEFINER a propósito): el aislamiento no se logró apagando la lectura"
    verification:
      - kind: integration
        ref: "test/isolation.test.ts#el público SÍ puede LEER por la vista acotada (es el mecanismo de lectura pública)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Aislamiento por tenant del catálogo: A no ve las categorías de B (sin filtro `business_id`) y no puede crear una categoría declarando el `business_id` de B"
    requirement: "CAT-07"
    verification:
      - kind: integration
        ref: "test/isolation.test.ts#cross-READ: A no ve las categorías de B (RLS deniega, SIN filtro business_id)"
        status: pass
      - kind: integration
        ref: "test/isolation.test.ts#cross-WRITE: A no puede crear una categoría declarando el business_id de B"
        status: pass
    human_judgment: false
  - id: D5
    description: "Un dueño no puede apuntar un servicio suyo a la categoría de otro negocio: lo rechaza la FK compuesta (no la RLS, que permitiría el update). Con control positivo: la categoría propia SÍ entra"
    verification:
      - kind: integration
        ref: "test/isolation.test.ts#cross-tenant: la BASE rechaza apuntar un servicio propio a la categoría de otro negocio"
        status: pass
      - kind: integration
        ref: "test/isolation.test.ts#control positivo del caso 8: A SÍ puede apuntar su servicio a su PROPIA categoría"
        status: pass
    human_judgment: false
  - id: D6
    description: "Borrar una categoría deja el servicio VIVO, con `category_id` en null, `business_id` intacto y todavía visible en `public_services` para un anon puro. Medido con control negativo: con la FK sin lista de columnas, SÓLO la aserción del `business_id` se pone roja"
    requirement: "CAT-07"
    verification:
      - kind: integration
        ref: "test/isolation.test.ts#CAT-07 / CAT-09: borrar una categoría NO borra ni desactiva un solo servicio"
        status: pass
      - kind: integration
        ref: "psql: FK re-creada con `ON DELETE SET NULL` a secas → `expected null to be '<bizA>'` en la 3ª aserción, las otras dos pasan; FK restaurada con la lista de columnas"
        status: pass
    human_judgment: false
  - id: D7
    description: "La suite completa no regresionó: 92 archivos · 1198 pasados · 4 expected fail · 1 skipped, por encima de la línea de base (90 · 1163)"
    verification:
      - kind: integration
        ref: "npx vitest run"
        status: pass
    human_judgment: false

# Metrics
duration: 13 min
completed: 2026-09-15
status: complete
---

# Phase 22 Plan 03: Los tests de aislamiento del catálogo Summary

**Diez casos de regresión DB-backed que congelan las cuatro garantías de la migración 078 — y las dos que más duelen están medidas con control negativo contra el Postgres real, no argumentadas.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-09-15T20:00:00Z (aprox.)
- **Completed:** 2026-09-15T20:13:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- **CR-01 no se puede reabrir en silencio.** La 078 redefine dos vistas que YA están en producción, y redefinir obliga a re-emitir permisos. El caso 3 hace un `DELETE` anónimo contra `public_services` y contra `public_businesses` y asierta que el servicio y el negocio de A **sobrevivieron**. Medido: con `GRANT DELETE ON public.public_services TO anon` el caso falla (`expected +0 to be 1` — el servicio desapareció); revocado, vuelve a verde y los grants de las tres vistas quedan en `SELECT` para `anon`/`authenticated`.
- **La aserción que distingue las dos implementaciones de la migración está escrita y medida.** El caso 9 exige las tres propiedades del servicio tras borrar su categoría: existe · `category_id` null · `business_id` intacto. Con la FK re-creada sin lista de columnas (`ON DELETE SET NULL` a secas), **sólo** la tercera se pone roja (`expected null to be '<bizA>'`): las otras dos pasan igual. Es literalmente la única que separa "organizar el catálogo" de "sacar un servicio de la venta".
- **La FK compuesta queda probada como tal, no confundida con la RLS.** El caso 8 actualiza una fila **de A** —que la policy permitiría— apuntándola a la categoría de B, y lo rechaza la base. Su control positivo (la categoría propia sí entra) va en un `it` aparte, para que no se pueda pasar por "nadie escribe esa columna".
- **El control positivo de la lectura anónima** (caso 5, ≥ 1 fila real por la vista acotada) impide el falso verde con forma de aislamiento: una vista con `security_invoker` devolvería 0 filas siempre y en silencio.

## Task Commits

1. **Task 1: El aislamiento del catálogo y los permisos de las tres vistas** — `f588cf4` (test)
2. **Task 2: El tenant de la FK y el borrado que no saca nada de la venta** — `d98518f` (test)

**Plan metadata:** ver el commit `docs(22-03)` que acompaña a este SUMMARY.

## Files Created/Modified

- `test/isolation.test.ts` — bloque nuevo `el catálogo por categorías: service_categories + sus vistas públicas`, con `beforeAll` propio (una categoría `__iso_cat` y un servicio `__iso_cat_svc` por tenant, sembrados con service-role) y 10 casos. El archivo pasó de 529 a 811 líneas.

## Decisiones Made

- **El control positivo del caso 8 va como `it` propio.** Si compartiera el caso con el cross-tenant, un fallo del positivo se leería como un fallo de aislamiento, que es la lectura contraria a la real.
- **El caso 3 asierta supervivencia, no error.** PostgREST puede devolver 2xx sin borrar nada, y un error de red pondría verde un caso que sólo mirara `error !== null`. Se lee el estado con service-role después del intento.
- **`svcB` no se captura.** El `beforeAll` crea la pareja categoría+servicio en los dos tenants por simetría, pero sólo se guardan los ids que los casos usan; capturar uno sin leerlo deja un warning de lint por nada.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] El gate de "cero skipeados" del plan era insatisfacible contra su propia línea de base**

- **Found during:** Task 1 (primera corrida de verificación)
- **Issue:** el `<automated>` de los dos tasks exige `! grep -qE "[1-9][0-9]* skipped"` sobre la corrida de `test/isolation.test.ts`. Pero el archivo **ya traía** un caso skipeado desde la Phase 15: el `it.skipIf(!hasStorageTests)` del upload-gate de `landing-assets`, que skipea a propósito porque el Storage local está apagado (`config.toml [storage] enabled=false`). La línea de base del propio plan lo contabiliza ("90 archivos · 1163 pasados · 4 fallos esperados · **1 skipeado**"), así que el gate a nivel archivo contradice al gate a nivel suite del mismo plan.
- **Fix:** se honró la **intención** declarada en el `<fails_when>` —"`describe.skipIf(!hasSupabaseCreds)` skipea el archivo ENTERO y vitest sale 0"—: lo que se verificó es que el archivo **no** está skipeado entero y que los casos pasados crecieron. Medido antes y después: baseline `21 passed | 1 skipped`, tras Task 1 `28 passed | 1 skipped`, tras Task 2 `31 passed | 1 skipped`. El único skip sigue siendo el de Storage y es el mismo de la línea de base.
- **Files modified:** ninguno (es un ajuste del criterio de verificación, no del código).
- **Verification:** `npx vitest run test/isolation.test.ts` → `Tests 31 passed | 1 skipped (32)`, exit 0; el skip identificado por nombre es `upload-gate: A sin has_web_custom NO puede subir a landing-assets`.
- **Committed in:** n/a (no hubo cambio de código por este ítem).

---

**Total deviations:** 1 auto-fixed (1 bug de criterio de verificación)
**Impact on plan:** ninguno sobre el alcance. No se tocó nada fuera de `test/isolation.test.ts`, no se agregó ni un paquete, y ninguna garantía del plan se relajó: el skip conocido es de Storage, ortogonal al aislamiento del catálogo.

## Issues Encountered

- **La medición del control negativo del caso 9 dejó una fila huérfana en el Postgres local.** Al correr el caso con la FK rota a propósito, el servicio fixture quedó con `business_id = NULL` y por lo tanto fuera del `CASCADE` del teardown. Se limpió a mano (`DELETE FROM public.services WHERE business_id IS NULL AND name LIKE '__iso_cat%'`) y se verificó `count(*) WHERE business_id IS NULL = 0`. La FK quedó restaurada con su lista de columnas, verificada por `pg_get_constraintdef`.
- **`npx vitest run -t "…"` no matchea si el patrón trae paréntesis.** El primer intento de correr un caso aislado skipeó los 29 y salió 0 — el modo de falla silencioso que este plan combate, pero del lado de la herramienta. Se resolvió filtrando por una subcadena sin metacaracteres.
- **Ningún rojo atribuible ni no atribuible.** El flake conocido del caso 5b de `test/abono-generation.test.ts` **no apareció** en esta corrida: la suite completa salió limpia en la primera pasada.

## Verificación

| # | Criterio | Resultado |
|---|----------|-----------|
| 1 | `npx vitest run test/isolation.test.ts` pasa entero, archivo NO skipeado | `Tests 31 passed \| 1 skipped (32)` — el skip es el de Storage, preexistente |
| 2 | Los 9 casos del bloque están, incluido el control positivo del caso 8 | 10 `it` (el control positivo va aparte) |
| 3 | Suite completa ≥ 1163 pasados | `92 archivos · 1198 passed · 4 expected fail · 1 skipped`, exit 0 |
| 4 | Ninguna aserción de aislamiento usa service-role | ✅ declarado y revisado: `seeded.admin` pasó de 28 a 47 apariciones, **todas** en siembra, limpieza o chequeo independiente del efecto. Las aserciones usan `anonA` o el `anonPublic()` sin sesión |
| 5 | Typecheck sin `error TS` fuera de `.next/` | `./node_modules/.bin/tsc --noEmit` → vacío. `npx eslint test/isolation.test.ts` → sin salida |
| 6 | `git diff --name-only` toca exactamente un archivo | `test/isolation.test.ts`. `package.json` / `package-lock.json` sin cambios (T-22-SC) |

## Threat Model — estado

| Threat ID | Disposición | Cerrado por |
|-----------|-------------|-------------|
| T-22-15 (EoP: reabrir CR-01 en las vistas redefinidas) | mitigate | Caso 3 + control negativo medido con `GRANT DELETE` |
| T-22-16 (Tampering: `category_id` ajeno) | mitigate | Caso 8 + su control positivo |
| T-22-17 (pérdida de datos: borrar categoría saca servicios de la venta) | mitigate | Caso 9, tres aserciones + `public_services` anónimo, con control negativo medido |
| T-22-18 (falla silenciosa: la vista con invocador) | mitigate | Caso 5 (≥ 1 fila real) |
| T-22-19 (falso verde del propio test) | mitigate | Aserciones sólo anon-key, sin `.eq('business_id')` en los cross; guards del `beforeAll` raíz intactos |
| T-22-SC (supply chain) | accept | Cero paquetes nuevos, diff de `package.json`/`package-lock.json` vacío |

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Phase 22 cerrada.** El modelo del catálogo está instalado (078), espejado en `schema.sql`, con sus comparadores puros y ahora con el aislamiento probado. CAT-06 y CAT-07 quedan cumplidos.
- **Pendiente operativo heredado del plan 22-01:** la migración 078 **no está aplicada a producción**. Es un paso manual coordinado con el deploy, con runbook en la cabecera del archivo. Las Phases 23 y 24 no pueden deployarse antes.
- **Para la Phase 23 (panel):** el bloque nuevo es el molde de lo que hay que sumar cuando el panel empiece a escribir categorías — cualquier vista pública que se toque ahí tiene que quedar con su caso de borrado anónimo acá.

## Self-Check: PASSED

- `test/isolation.test.ts` existe en disco (811 líneas).
- Commits verificados en `git log`: `f588cf4`, `d98518f`.
- `git rev-list --count 09340ea..HEAD` = 2 al momento de escribir este SUMMARY.

---
*Phase: 22-el-modelo-del-cat-logo*
*Completed: 2026-09-15*
