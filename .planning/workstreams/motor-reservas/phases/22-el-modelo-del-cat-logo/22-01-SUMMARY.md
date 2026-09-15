---
phase: 22-el-modelo-del-cat-logo
plan: 01
subsystem: database
tags: [postgres, supabase, rls, migrations, multi-tenant, typescript, vitest]

# Dependency graph
requires:
  - phase: 18-el-modelo-y-la-disponibilidad
    provides: "molde de tabla puente + RLS 4-policies + vista acotada anon (migr. 071) y el hotfix 072 que dejó las vistas public_* en SELECT-only"
  - phase: 19-el-panel-de-la-agenda
    provides: "molde declarativo de pertenencia al tenant (UNIQUE compuesto + FK compuesta) y el ON DELETE SET NULL con lista de columnas (migr. 073/075)"
provides:
  - "Tabla `service_categories` por negocio (RLS + 4 policies + índice UNIQUE sobre lower(name))"
  - "`services.category_id` NULLABLE + `services.sort_order` con la FK compuesta que exige mismo tenant"
  - "`businesses.category_sort_mode` / `businesses.service_sort_mode` (modo de orden por negocio, D-05)"
  - "Vista acotada `public_service_categories` (DEFINER, SELECT-only para anon/authenticated)"
  - "`public_services` y `public_businesses` exponen las columnas nuevas, con los permisos en la forma de la 072"
  - "`lib/service-categories.ts` — `groupCatalog`, la regla de agrupar con la identidad ante cero categorías"
  - "Tipos `ServiceCategory`, `CatalogService`, `CatalogCategory`, `CatalogGroup`, `CatalogSortModes`"
affects: [22-02-comparadores-de-orden, 22-03-tests-de-aislamiento, 22-04-espejo-schema, 23-el-panel-del-catalogo, 24-el-catalogo-publico]

# Actuals (#2632) — estimateTokens (chars/4) sobre el diff realizado, no tokens de harness.
actuals:
  tokens: 11850
  tasks: 2
  commits: 1
plan_head_before: f50e064093a2033617ed34d180671110140e4a81

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "FK compuesta con lista de columnas en el ON DELETE: `ON DELETE SET NULL (category_id)`"
    - "Vista acotada `public_*` DEFINER con REVOKE ALL + GRANT SELECT (forma de la migr. 072)"
    - "Índice UNIQUE sobre expresión `(business_id, lower(name))` para unicidad insensible a mayúsculas"
    - "Módulo puro genérico sobre el shape de la fila, con la regla de la ausencia encerrada una sola vez"

key-files:
  created:
    - supabase/migrations/078_service_categories.sql
    - lib/service-categories.ts
    - test/service-categories-model.test.ts
  modified:
    - lib/types.ts

key-decisions:
  - "La FK a la categoría lleva LISTA DE COLUMNAS (`ON DELETE SET NULL (category_id)`): sin ella, borrar una categoría nulearía también `services.business_id` y el servicio dejaría de venderse en silencio"
  - "Los GRANT de las tres vistas van en la forma de la migr. 072 (REVOKE ALL + GRANT SELECT), nunca en la de la 059/061/071"
  - "`groupCatalog` decide la identidad por el RESULTADO DEL REPARTO, no por `categories.length === 0`"
  - "`groupCatalog` NO recibe todavía el parámetro de modos: los comparadores son del plan 22-02, y con `custom` + `sort_order` en 0 el orden de llegada ya es el correcto"
  - "El default de los dos modos de orden es `custom` y no alfabético: la lectura pública de hoy no tiene ORDER BY, así que el mismo orden sólo es reproducible si el modelo no reordena nada"

patterns-established:
  - "Pertenencia al tenant declarativa: UNIQUE (id, business_id) en el padre + FK compuesta en el hijo, con la lista de columnas en la acción referencial"
  - "Vista pública nueva: DEFINER + REVOKE ALL + GRANT SELECT a anon/authenticated + GRANT ALL a service_role"
  - "Prueba end-to-end del modelo: base → vista anónima pura → módulo puro → salida agrupada, con el control negativo primero"

requirements-completed: [CAT-06, CAT-07]

coverage:
  - id: D1
    description: "Migración 078 aplicable e idempotente sobre el baseline numerado (001→078) en PG17 local"
    requirement: "CAT-06"
    verification:
      - kind: integration
        ref: "npx supabase db reset"
        status: pass
    human_judgment: false
  - id: D2
    description: "Un negocio con CERO categorías obtiene la lista de hoy: misma cantidad, mismo orden, sin títulos — medido sobre el camino real (vista anónima → módulo puro)"
    requirement: "CAT-07"
    verification:
      - kind: integration
        ref: "test/service-categories-model.test.ts#CAT-07: con CERO categorías, el catálogo es la lista de hoy — misma cantidad, mismo orden, sin títulos"
        status: pass
    human_judgment: false
  - id: D3
    description: "Una categoría viaja de la tabla base a la vista acotada anónima y llega agrupada al consumidor, con su `category_id` poblado en `public_services`"
    requirement: "CAT-06"
    verification:
      - kind: integration
        ref: "test/service-categories-model.test.ts#el camino completo: una categoría nace en la base, sale por la vista anónima y llega al catálogo agrupado"
        status: pass
    human_judgment: false
  - id: D4
    description: "Un servicio sin categoría no desaparece: cae en el grupo de los sueltos, último, y la suma de lo agrupado es igual a lo que devolvió la vista (invariante de conservación)"
    requirement: "CAT-07"
    verification:
      - kind: integration
        ref: "test/service-categories-model.test.ts#D-03: un servicio SIN categoría no desaparece — va al grupo de los sueltos, último"
        status: pass
    human_judgment: false
  - id: D5
    description: "La estructura y los permisos del catálogo de Postgres son los declarados: 4 policies, RLS activa, 4 índices, 1 vista nueva, 0 opciones de invocador, 0 permisos distintos de SELECT para anon/authenticated, 4 constraints y la FK CON lista de columnas"
    verification:
      - kind: integration
        ref: "psql: select nombre from (values …) where ok is distinct from true → MEDICIONES FALLIDAS: []"
        status: pass
    human_judgment: false
  - id: D6
    description: "Controles negativos contra el motor real: el anon LEE la vista nueva (≥1 fila), el anon NO puede escribir la tabla base, y el duplicado insensible a mayúsculas lo rechaza la base"
    verification:
      - kind: integration
        ref: "psql en transacciones revertidas (SET LOCAL ROLE anon + INSERT + ROLLBACK)"
        status: pass
    human_judgment: false
  - id: D7
    description: "La migración 078 aplicada a PRODUCCIÓN (paso manual de deploy, fuera del alcance de este plan)"
    verification: []
    human_judgment: true
    rationale: "Este repo aplica las migraciones a prod A MANO y coordinadas con el deploy. Ningún gate automático puede tocar producción; la aplicación y su verificación posterior las hace un humano con el runbook de la cabecera de la 078."

# Metrics
duration: 22 min
completed: 2026-09-15
status: complete
---

# Phase 22 Plan 01: El modelo del catálogo Summary

**Migración 078 con `service_categories` por negocio (RLS + UNIQUE sobre `lower(name)`), `services.category_id` nullable atado por FK compuesta con `ON DELETE SET NULL (category_id)`, los dos modos de orden a nivel negocio, la vista acotada `public_service_categories` y `groupCatalog` — el módulo puro cuya salida ante cero categorías es la identidad.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-09-15T19:06:00Z (aprox.)
- **Completed:** 2026-09-15T19:28:00Z
- **Tasks:** 2
- **Files modified:** 4 (3 creados + 1 modificado)

## Accomplishments

- **CAT-07 quedó cierto POR CONSTRUCCIÓN y medido sobre el camino real.** El primer caso del test
  lee `public_service_categories` y `public_services` con un cliente **anon puro** (anon key, sin
  sesión — el mismo rol que atiende `/[slug]`) ANTES de que exista ninguna categoría, y asierta que
  `groupCatalog` devuelve **un** grupo con `categoryId` nulo, `title` nulo y la lista de ids
  **idéntica en contenido y en orden** a la que devolvió la vista. No es un array inventado: es el
  recorrido completo base → vista anónima → módulo puro.
- **El modelo entero en una sola migración (D-09), aditiva e inerte.** Tabla + RLS + 4 policies + 3
  índices + 2 columnas en `services` + 2 columnas en `businesses` + 1 vista nueva + 2 vistas
  redefinidas + `NOTIFY pgrst`. **Cero backfill**: `select count(*) from public.service_categories`
  devuelve **0** fuera de transacción.
- **La trampa cara del `ON DELETE` quedó cerrada y medida contra el catálogo**, no leída del archivo.
- **Las dos vistas que ya están en producción se redefinieron sin reabrir CR-01**: los permisos se
  re-emitieron en la forma de la 072 y el gate confirma **0** privilegios distintos de `SELECT` para
  `anon`/`authenticated` en las tres vistas.
- **La suite completa quedó verde** (91 archivos, 1166 tests): redefinir `public_services` y
  `public_businesses` no rompió ninguna regresión del booking público.

## Task Commits

1. **Task 1 (tracer): una categoría viaja de la base al catálogo agrupado** — `af5c430` (feat)

**Plan metadata:** ver el commit `docs(22-01)` de este mismo SUMMARY.

**Task 2** (interrogar al catálogo de Postgres) **no produjo commit propio y eso es el resultado
esperado**: es un task de MEDICIÓN cuyo entregable son los números registrados más abajo. Las ocho
mediciones y los tres controles negativos dieron lo esperado en la primera corrida, así que no hubo
nada que corregir en la 078. Si alguna hubiera fallado, el arreglo habría ido en la migración y
habría entrado como un commit `fix(22-01)`.

## Files Created/Modified

- `supabase/migrations/078_service_categories.sql` — el modelo completo. Cabecera densa en español
  con Contexto → Qué hace → Qué NO hace → el razonamiento de la lista de columnas del `ON DELETE` →
  el residuo de MATCH SIMPLE → la advertencia de la copia-y-pega de los GRANT → el Pitfall 5 de la
  vista DEFINER → Runbook de producción con la verificación posterior.
- `lib/service-categories.ts` — `groupCatalog` + `CategorySortMode` / `ServiceSortMode` /
  `CatalogSortModes` / `DEFAULT_SORT_MODES` / `OTHER_GROUP_TITLE` / `CatalogGroup<S>` /
  `CatalogService` / `CatalogCategory`. Puro, genérico sobre el shape de la fila, sin mutar la
  entrada.
- `test/service-categories-model.test.ts` — 3 casos end-to-end, con el control negativo primero.
- `lib/types.ts` — `ServiceCategory`; `category_id?` y `sort_order?` en `Service`;
  `category_sort_mode?` y `service_sort_mode?` en `Business`.

## Mediciones contra el catálogo de Postgres (Task 2)

Gate de las ocho mediciones (una fila por medición FALLADA; `is distinct from true` cuenta el NULL
como falla):

```
MEDICIONES FALLIDAS: []
```

| Medición | Esperado | Medido |
|---|---|---|
| `policies_4` — policies de `service_categories` en `pg_policies` | 4 | 4 |
| `rls_activa` — `pg_class.relrowsecurity` | `t` | `t` |
| `indices_4` — índices en `pg_indexes` | 4 | 4 |
| `vista_existe` — `public_service_categories` en `pg_views` | 1 | 1 |
| `sin_invoker_en_las_3_vistas` — `reloptions` con la opción de invocador | 0 | 0 |
| `anon_solo_select_en_las_3_vistas` — privilegios ≠ `SELECT` para anon/authenticated | 0 | 0 |
| `4_constraints_presentes` | 4 | 4 |
| `fk_con_lista_de_columnas` | `true` | `true` |

Los cuatro índices de `service_categories`: `service_categories_pkey`,
`service_categories_name_uq`, `service_categories_order_idx`, `service_categories_id_business_uq`.

Los seis privilegios de las tres vistas, uno por rol, todos `SELECT`:
`public_businesses|anon|SELECT`, `public_businesses|authenticated|SELECT`,
`public_service_categories|anon|SELECT`, `public_service_categories|authenticated|SELECT`,
`public_services|anon|SELECT`, `public_services|authenticated|SELECT`.

**La definición de la FK, transcripta literal** (sin los paréntesis con el nombre de la columna sería
la variante que saca servicios de la venta, T-22-05):

```
services_category_same_tenant :: FOREIGN KEY (category_id, business_id) REFERENCES service_categories(id, business_id) ON DELETE SET NULL (category_id)
```

### Controles negativos (cada uno en su transacción, revertida)

1. **Lectura anon de la vista nueva** — `INSERT` de una categoría como `postgres` sobre un negocio
   del `seed.sql`, `SET LOCAL ROLE anon`, `select count(*) from public.public_service_categories`:
   **1 fila** (`filas_que_ve_el_anon=1`). Es el caso que daría **0** si la vista hubiera quedado con
   la opción de invocador, o sea el que distingue "funciona" de "falla en silencio" (T-22-02).

2. **Escritura anon rechazada sobre la tabla base** — `SET LOCAL ROLE anon` + `INSERT` sobre
   `public.service_categories`. Mensaje de Postgres, literal:

   ```
   ERROR:  permission denied for table service_categories
   HINT:  Grant the required privileges to the current role with: GRANT INSERT ON public.service_categories TO anon;
   ```

   Rebota **antes** de llegar a la RLS: los default privileges ya desarmados por la 073 hacen que
   `anon` nazca sin ningún privilegio sobre la tabla, y la 078 no le da ninguno. Defensa doble — si
   alguien le diera el GRANT, la RLS sin policy `anon` lo seguiría rechazando (T-22-06).

3. **Duplicado insensible a mayúsculas rechazado por la base** — dos `INSERT` del mismo negocio con
   `'Color'` y `'COLOR'`:

   ```
   ERROR:  duplicate key value violates unique constraint "service_categories_name_uq"
   DETAIL:  Key (business_id, lower(name))=(00000000-0000-0000-0000-0000000000b1, color) already exists.
   ```

   El `DETAIL` muestra la clave como `(business_id, lower(name))`: el índice está sobre la
   **expresión** y no sobre la columna cruda, que es justo lo que hace falta para atrapar la
   diferencia de capitalización (CAT-01 / T-22-07).

4. **Las transacciones revirtieron**: `select count(*) from public.service_categories` fuera de
   transacción devuelve **0**. Cero backfill intacto.

## ⚠ Pendiente de aplicación MANUAL a producción

**La migración 078 NO está aplicada en producción.** La última aplicada allá sigue siendo la **077**.
Aplicarla es un **paso manual del deploy, fuera del alcance de este plan** (este repo nunca hace
`supabase db push` ni `supabase link`):

1. Pegar y ejecutar `supabase/migrations/078_service_categories.sql` **completo, de una sola vez**,
   en el SQL editor de producción.
2. Confirmar que el `NOTIFY pgrst, 'reload schema';` del final corrió. Sin eso PostgREST no expone ni
   la vista nueva ni las columnas nuevas, y la falla es **fail-safe y silenciosa** (T-22-09).
3. Correr la **verificación posterior** de la cabecera (estructura + permisos + cero backfill).
4. El espejo de `supabase/schema.sql` es del plan **22-04**, y se hace DESPUÉS de aplicar.

La 078 es **aditiva e inerte**: ninguna lectura de la app de hoy necesita las columnas ni la vista
nuevas y no hay backfill, así que se puede aplicar antes del deploy sin coordinar nada.

## Decisions Made

- **La FK lleva lista de columnas en el `ON DELETE`.** `ON DELETE SET NULL (category_id)`. Sin la
  lista, Postgres nulea **las dos** columnas de la clave, y como `services.business_id` es NULLABLE
  el servicio quedaría sin negocio: fuera de la RLS de su dueño, fuera de `public_services` y por lo
  tanto fuera de la venta, sin un solo error a la vista. La 075 ya midió ese comportamiento contra
  este mismo motor.
- **Los GRANT van en la forma de la 072.** `REVOKE ALL` + `GRANT SELECT` para `anon`/`authenticated`
  en las tres vistas. El molde de la 059/061/071 termina en `GRANT ALL ... TO anon`, y copiarlo tal
  cual sobre dos vistas que ya están en producción reabriría CR-01.
- **`groupCatalog` decide la identidad por el resultado del reparto**, no por `categories.length`.
  Así el negocio que creó categorías pero todavía no asignó ninguna cae en el mismo camino correcto
  (ve la lista de hoy) en vez de recibir un "Otros" que envuelve el catálogo entero.
- **El default de los dos modos de orden es `custom`.** La lectura pública de hoy no tiene `ORDER BY`,
  así que "el mismo orden que hoy" sólo es reproducible si el modelo no reordena nada. Cualquier otro
  default sería un cambio visible para todos los negocios el día de la migración.
- **`created_at` queda fuera de la vista acotada.** Cuatro columnas y nada más: ningún consumidor lo
  necesita y es metadato de cuándo se configuró el negocio (misma pregunta columna por columna que la
  v0.13 se hizo con `public_canchas`).

## Deviations from Plan

**1. [Alcance de firma] `groupCatalog` no recibe todavía el parámetro de modos**

- **Encontrado durante:** Task 1 (escritura de `lib/service-categories.ts`)
- **Situación:** el plan pide que en este task `groupCatalog` devuelva la identidad "sin mirar los
  modos", y asigna los comparadores de los tres modos al plan 22-02. Un parámetro `modes` aceptado y
  nunca leído es un parámetro muerto.
- **Decisión:** la firma es `groupCatalog(services, categories)` y el parámetro de modos lo agrega el
  22-02 junto con los comparadores que lo usan. Los cinco símbolos que el plan enumera —
  `CategorySortMode`, `ServiceSortMode`, `CatalogSortModes`, `DEFAULT_SORT_MODES`,
  `OTHER_GROUP_TITLE`— **sí** se exportan, y la cabecera del módulo deja escrito el alcance para que
  el 22-02 no lo descubra.
- **Impacto:** ninguno en comportamiento. Agregar un parámetro opcional después es compatible hacia
  atrás y el único call site de hoy es el test.

---

**Total deviations:** 1 (decisión de alcance de firma, sin efecto en comportamiento)
**Impact on plan:** Ninguno. No hubo deviations de las Reglas 1-4: ninguna medición falló, ninguna
verificación requirió corregir la migración, y no se tocó ni un archivo fuera de los cuatro
declarados.

## Issues Encountered

- **`docker exec` sin `-i` no adjunta stdin**, así que el primer intento de correr los controles
  negativos por heredoc salió con exit 0 y **sin imprimir nada** — que es exactamente la forma de
  falla silenciosa que el Task 2 existe para evitar. Se detectó porque la salida esperada
  (`filas_que_ve_el_anon=N`) no apareció, y se corrigió agregando `-i`. Anotado acá para la próxima
  vez que alguien corra psql por heredoc en este repo.
- Ningún otro. La migración aplicó limpia en el primer `supabase db reset` y los tres casos del test
  pasaron en la primera corrida.

## User Setup Required

None - no external service configuration required.

**Salvedad operativa (no es setup de servicio):** la migración 078 requiere una aplicación **manual**
a producción antes de que las Phases 23/24 se deployen. Ver la sección "Pendiente de aplicación
MANUAL a producción" de arriba.

## Known Stubs

Ninguno. `groupCatalog` implementa de verdad las tres reglas del agrupado (identidad, grupo por
categoría con servicios, sueltos al final) y está medido end-to-end; no es un borrador que después se
tira. Lo que falta —los comparadores de los tres modos de orden— **no es un stub**: no existe en el
archivo, está declarado como alcance del plan 22-02 en la cabecera del módulo, y con el default
`custom` de la base el comportamiento actual ya es el correcto.

## Threat Flags

Ninguno. Todos los objetos nuevos y los redefinidos están cubiertos por el `<threat_model>` del plan
(T-22-01 a T-22-10). No se agregó ningún endpoint, ruta de auth, acceso a archivos ni superficie de
red: esta fase no tiene superficie de aplicación (el panel es la Phase 23 y la página pública la 24).

## Next Phase Readiness

**Listo para el plan 22-02** (los comparadores de los tres modos de orden): el módulo puro existe, su
contrato está escrito y el test end-to-end ya recorre el camino real, así que los casos de orden se
expanden desde ahí.

**Lo que este plan deja explícitamente para otros:**

- **22-02** — comparadores `custom`/`alpha`/`price` y el parámetro de modos de `groupCatalog`.
- **22-03** — tests de aislamiento: el caso cross-tenant real contra la FK compuesta (T-22-04), la
  regresión de escritura anónima por las **tres** vistas (T-22-03) y el test de comportamiento
  permanente del borrado de categoría (T-22-05: tras borrar, el servicio conserva `business_id`,
  queda con `category_id` nulo y **sigue apareciendo** en `public_services`).
- **22-04** — el espejo quirúrgico de `supabase/schema.sql`, DESPUÉS de aplicar la 078 a producción.

**Bloqueante conocido:** ninguno para seguir planificando. El único paso que no puede automatizarse es
la aplicación manual de la 078 a producción, que no bloquea a los planes 22-02/22-03 (corren contra el
local).

## Self-Check: PASSED

- `supabase/migrations/078_service_categories.sql` — FOUND
- `lib/service-categories.ts` — FOUND
- `test/service-categories-model.test.ts` — FOUND
- `lib/types.ts` — FOUND (modificado, +51 líneas)
- Commit `af5c430` — FOUND en `git log`
- `git diff --name-only` no toca `supabase/schema.sql` — OK
- `git diff -- package.json package-lock.json` vacío — OK
- Conteo de `.sql` bajo `supabase/migrations/`: 39 → **40** — OK

---
*Phase: 22-el-modelo-del-cat-logo*
*Completed: 2026-09-15*
