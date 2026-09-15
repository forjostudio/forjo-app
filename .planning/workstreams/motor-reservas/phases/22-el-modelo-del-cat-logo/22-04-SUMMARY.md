---
phase: 22-el-modelo-del-cat-logo
plan: 04
subsystem: database
tags: [postgres, supabase, schema, rls, multi-tenant, documentacion]

# Dependency graph
requires:
  - phase: 22-el-modelo-del-cat-logo
    provides: "la migración 078 ya aplicada y verificada contra el catálogo de Postgres local (plan 22-01, `MEDICIONES FALLIDAS: []`)"
provides:
  - "`supabase/schema.sql` describe el modelo del catálogo: tabla `service_categories` con RLS + 4 policies + 4 índices, las dos columnas nuevas de `services` con la FK compuesta, las dos de `businesses` con sus CHECK, la vista acotada `public_service_categories` con sus permisos, y las dos vistas redefinidas"
  - "La cláusula `ON DELETE SET NULL (category_id)` documentada CON su lista de columnas, en la forma exacta que imprime `pg_get_constraintdef`"
  - "Los GRANT de la vista nueva documentados en la forma de la migr. 072 (SELECT-only para anon/authenticated)"
affects: [23-el-panel-del-catalogo, 24-el-catalogo-publico]

# Actuals (#2632) — estimateTokens (chars/4) sobre el diff realizado, no tokens de harness.
actuals:
  tokens: 2053
  tasks: 1
  commits: 1
plan_head_before: 2cd4b507547c8bd6baff98984f9861b10b9f6967

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "El espejo de `schema.sql` se hace DESPUÉS del gate de catálogo y de forma quirúrgica: inserciones localizadas al lado de la familia de cada bloque, nunca un `supabase db dump`"
    - "La lista de columnas del `ON DELETE` se escribe sin comillas, igual que la imprime `pg_get_constraintdef`, para que el espejo sea comparable con el catálogo"

key-files:
  created: []
  modified:
    - supabase/schema.sql

key-decisions:
  - "El espejo NO lleva GRANT de tabla base para `service_categories`: medido contra el catálogo, `anon` sólo tiene SELECT ahí (el bloque de `ALTER DEFAULT PRIVILEGES` de la migr. 073 le revoca INSERT/UPDATE/DELETE/TRUNCATE a toda tabla futura). Copiar el `GRANT ALL ... TO anon` de `time_block_services` habría documentado permisos que la base no da"
  - "La lista de columnas del `ON DELETE` va SIN comillas (`ON DELETE SET NULL (category_id)`), a diferencia de `tb_location_same_tenant` que sí las lleva: es la forma exacta de `pg_get_constraintdef`, o sea el texto con el que se compara el espejo"
  - "Las columnas nuevas de `businesses` llevan un comentario inline explicando por qué el default es 'custom' y no alfabético — es la decisión que sostiene CAT-07 y no se lee de la declaración"

patterns-established:
  - "Espejo verificado, no transcripto: cada bloque se re-midió contra `information_schema` / `pg_constraint` / `pg_class` antes de commitear, en vez de copiarse a ojo desde el archivo de migración"

requirements-completed: [CAT-07]

coverage:
  - id: D1
    description: "`supabase/schema.sql` contiene los nueve identificadores del modelo del catálogo — tabla, vista acotada, FK de tenant, los tres índices, las dos columnas de modo de orden, y la cláusula de borrado CON su lista de columnas"
    requirement: "CAT-07"
    verification:
      - kind: other
        ref: "grep -qF de los 9 identificadores sobre supabase/schema.sql → FALTAN EN schema.sql: (vacío)"
        status: pass
    human_judgment: false
  - id: D2
    description: "La edición es quirúrgica y el diff se puede revisar línea por línea: nada del archivo se reordenó"
    verification:
      - kind: other
        ref: "git diff --numstat -- supabase/schema.sql → 148 agregadas / 3 borradas (gate: ≥25 agregadas, ≤5 borradas)"
        status: pass
      - kind: other
        ref: "git diff -U0 → 13 hunks, todos inserciones salvo 3 líneas que ganan una coma al dejar de ser la última de su lista"
        status: pass
    human_judgment: false
  - id: D3
    description: "El espejo coincide con el catálogo real: columnas, tipos, nulabilidad y defaults de `service_categories`; las 2 columnas nuevas de `services` y las 2 de `businesses`; las listas de columnas de las tres vistas; la vista sin `security_invoker` y con owner postgres; RLS activa con 4 policies"
    verification:
      - kind: integration
        ref: "psql contra el PG local: information_schema.columns + pg_class.reloptions + pg_policies + pg_constraint"
        status: pass
    human_judgment: false
  - id: D4
    description: "El espejo no tocó nada fuera de `supabase/schema.sql` ni agregó dependencias"
    verification:
      - kind: other
        ref: "git diff --name-only → supabase/schema.sql ; git diff -- package.json package-lock.json → vacío"
        status: pass
    human_judgment: false

# Metrics
duration: 14 min
completed: 2026-09-15
status: complete
---

# Phase 22 Plan 04: El espejo quirúrgico de la 078 en schema.sql Summary

**`supabase/schema.sql` ya describe el modelo del catálogo — tabla `service_categories` con RLS y sus
4 policies, la FK compuesta con la lista de columnas en el `ON DELETE`, la vista acotada con los
permisos de la 072 y las dos vistas redefinidas — en 13 inserciones localizadas que no reordenan una
sola línea del archivo.**

## Performance

- **Duration:** 14 min
- **Completed:** 2026-09-15T19:58:07Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Los seis bloques del plan reflejados al lado de su familia en `schema.sql`, respetando la
  organización estilo dump del archivo: la tabla y su OWNER en la sección de tablas, la PK y el
  UNIQUE compuesto en la de constraints, los dos índices en la de índices, las dos FK en la de claves
  foráneas, la RLS y las 4 policies en la de policies, la vista en la de vistas y sus permisos en la
  de GRANT.
- La cláusula de borrado quedó documentada **con su lista de columnas** —
  `ON DELETE SET NULL (category_id)` — que es lo que separa la implementación correcta de la variante
  que saca servicios de la venta (T-22-05). El espejo lleva además un comentario que le pide al
  próximo que la lea que NO la "corrija" a la forma con comillas de `tb_location_same_tenant`.
- Los permisos de `public_service_categories` quedaron en la forma de la migr. 072 (SELECT para
  `anon`/`authenticated`, ALL para `service_role`), con el porqué escrito al lado para que la Phase 23
  o la 24 no lo pisen con el molde roto de la 059/061/071 (T-22-03).
- El espejo se **midió**, no se transcribió: antes de commitear, cada bloque se comparó contra el
  catálogo real del PG local (`information_schema.columns`, `pg_constraint`, `pg_indexes`,
  `pg_class.reloptions`, `pg_policies`). Esa medición es la que atrapó los dos ajustes de abajo.

## Task Commits

1. **Task 1: El espejo quirúrgico de la 078 en schema.sql** — `004a6a2` (docs)

## Files Created/Modified

- `supabase/schema.sql` — +148 / −3. Las tres bajas son líneas que ganan una coma al dejar de ser la
  última de su lista (el `CONSTRAINT` final de `businesses`, y la última columna de `public_services`
  y de `public_businesses`).

## Decisions Made

**1. El espejo NO lleva GRANT de tabla base para `service_categories`.**
El plan pedía seguir "la forma en que quedó espejada `time_block_services`", y ese espejo incluye un
`GRANT ALL ON TABLE ... TO "anon"`. Copiarlo habría sido una mentira: medido contra el catálogo,
`service_categories` le da a `anon` sólo `SELECT`/`REFERENCES`/`TRIGGER`, porque el bloque de
`ALTER DEFAULT PRIVILEGES` de la migr. 073 (línea ~4461 de `schema.sql`) revoca
`INSERT, UPDATE, DELETE, TRUNCATE` a **toda tabla futura** del schema. `time_block_services` es
anterior a ese bloque y por eso conserva los permisos amplios. La sección de default privileges ya
documenta lo que recibe una tabla nueva, así que el espejo calla en vez de afirmar algo falso.

**2. La lista de columnas del `ON DELETE` va sin comillas.**
`pg_get_constraintdef` imprime `ON DELETE SET NULL (category_id)`, y el `<done>` del plan exige
identidad con esa salida. La forma con comillas (`("category_id")`) es SQL igualmente válido y es la
que usa `tb_location_same_tenant` dos bloques más abajo, así que el riesgo real es que alguien la
"unifique" por simetría y rompa la comparación — por eso el motivo quedó escrito en el propio archivo.

**3. Comentario inline en las dos columnas de `businesses`.**
El `DEFAULT 'custom'` no se explica solo: parece una elección estética y en realidad es lo que sostiene
CAT-07 (la lectura pública de hoy no tiene `ORDER BY`, así que "el mismo orden que hoy" sólo es
reproducible si el modelo no reordena nada). Es el tipo de decisión que el resto del archivo también
comenta.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] El gate de los nueve identificadores salió rojo por la forma de la cláusula de borrado**

- **Found during:** Task 1 (verificación)
- **Issue:** La primera escritura usó el estilo dump del archivo vecino,
  `ON DELETE SET NULL ("category_id")` con comillas. El gate del plan busca la subcadena literal
  `ON DELETE SET NULL (category_id)`, así que salió `FALTAN EN schema.sql: [ON DELETE SET NULL (category_id)]`.
- **Fix:** Se reescribió sin comillas — que además es la forma exacta que imprime
  `pg_get_constraintdef`, o sea justo lo que el `<done>` del plan pide — y se dejó un comentario
  explicando por qué no debe "unificarse" con el vecino.
- **Files modified:** `supabase/schema.sql`
- **Verification:** El gate volvió a correr y la lista `FALTAN` salió vacía.
- **Committed in:** `004a6a2` (parte del commit de la tarea)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** El arreglo acerca el espejo al catálogo en vez de alejarlo. Sin scope creep.

## Issues Encountered

Ninguno. El plan 22-01 ya había dejado la 078 aplicada y verificada, así que la precondición se
cumplió sin trabajo extra.

## User Setup Required

Ninguno — no hay servicios externos que configurar. **Recordatorio operativo heredado de la 078, no de
este plan:** la migración 078 sigue sin aplicarse a producción (prod está en 077). `schema.sql`
describe ahora el estado que la base tendrá después de aplicarla, que es el criterio del repo desde la
Phase 06: el espejo se hace una vez que la migración está verificada, y la aplicación a prod es un
paso manual con el runbook de la cabecera de la 078.

## Threat Flags

Ninguno — el plan no agrega superficie: modifica un único archivo de documentación, sin código
ejecutable, sin endpoints y sin dependencias.

## Next Phase Readiness

- El documento de referencia ya está al día: la Phase 23 (panel del catálogo) y la 24 (catálogo
  público) pueden leer `schema.sql` para saber qué columnas, qué vista y qué permisos tienen
  disponibles, sin abrir las 78 migraciones.
- Los dos moldes que la próxima fase NO debe pisar quedaron escritos en el propio archivo: los GRANT
  de las vistas en la forma de la 072, y la lista de columnas del `ON DELETE`.
- Queda abierto el plan 22-03 de esta fase (tests de aislamiento); este plan no bloquea nada porque no
  participa del corte vertical.

## Self-Check: PASSED

- `supabase/schema.sql` existe en disco.
- `.planning/workstreams/motor-reservas/phases/22-el-modelo-del-cat-logo/22-04-SUMMARY.md` existe en disco.
- El commit `004a6a2` existe en `git log`.
- Los dos gates del plan vuelven a salir verdes sobre el árbol commiteado: lista `FALTAN` vacía y
  `numstat` de 148/3.

---
*Phase: 22-el-modelo-del-cat-logo*
*Completed: 2026-09-15*
