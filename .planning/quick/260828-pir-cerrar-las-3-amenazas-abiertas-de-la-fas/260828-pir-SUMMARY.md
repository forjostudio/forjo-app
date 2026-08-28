---
quick_id: 260828-pir
phase: quick-260828-pir
plan: 01
workstream: motor-reservas
subsystem: seguridad / base de datos / panel de ajustes
tags: [multi-tenant, rls, foreign-key, fail-closed, migracion, testing]
requires:
  - "migr. 073 (UNIQUE compuestos + FK compuestas de time_block_services)"
  - "migr. 074 (save_agenda_blocks, YA aplicada en produccion)"
  - "test/helpers/supabase-fixtures.ts — seedTwoTenants()"
  - "vitest.config.mts — split pure/db (quick 260827-ion)"
provides:
  - "supabase/migrations/075_time_block_location_same_tenant.sql — FK compuesta tb_location_same_tenant (NO aplicada a prod)"
  - "guard fail-closed de 5 counts en el pre-check de borrado de servicio"
  - "test/settings-delete-precheck-tenant.test.ts — contra-caso cross-tenant del 5o count"
affects:
  - "app/(dashboard)/settings/settings-client.tsx"
  - ".planning/workstreams/motor-reservas/phases/19-el-panel/19-SECURITY.md"
tech-stack:
  added: []
  patterns:
    - "ON DELETE SET NULL (columna) — lista de columnas en la accion referencial (PG >= 15)"
    - "guard de backfill con RAISE EXCEPTION P0001 antes del DROP, dentro de BEGIN/COMMIT explicito"
    - "control negativo con RLS desactivada para probar que la capa explicita muerde sola"
key-files:
  created:
    - supabase/migrations/075_time_block_location_same_tenant.sql
    - test/settings-delete-precheck-tenant.test.ts
  modified:
    - app/(dashboard)/settings/settings-client.tsx
    - .planning/workstreams/motor-reservas/phases/19-el-panel/19-SECURITY.md
decisions:
  - "La lista de columnas del ON DELETE es obligatoria: sin ella, borrar un consultorio nulea tambien business_id y huerfaniza la franja EN SILENCIO (business_id es NULLABLE, no hay error)"
  - "El guard de backfill ABORTA (P0001), no es una consulta previa recomendada: la migracion se aplica a mano y una recomendacion se saltea"
  - "supabase/schema.sql NO se toca hasta que la 075 este aplicada en produccion (precedente 19-06)"
  - "La 075 NO lleva suite de Vitest: en CI la suite corre contra staging, donde la migracion no esta aplicada, y un skipIf seria un falso verde"
  - "El guard fail-closed se extiende a los CINCO counts, no a los 3 del fix propuesto: regla uniforme para que no vuelva a fallar al agregar un sexto"
metrics:
  duration: "~35 min"
  completed: 2026-08-28
  tasks: 3
  commits: 4
status: complete
---

# Quick 260828-pir: Cerrar las 3 amenazas abiertas de la Phase 19 — Summary

Las tres deudas abiertas del audit de seguridad de la Phase 19 quedaron cerradas o accionables con
una sola tarea del operador: migración **075** escrita y validada por replay (T-19-36, con el SQL
del audit **corregido**), guard fail-closed extendido de 1 a 5 counts (T-19-39, **CLOSED**), y el
contra-caso cross-tenant del 5º count convertido en un test permanente cuya **mordida se ejecutó**
(T-19-14).

## Qué se construyó

### Task 1 — Migración 075 (T-19-36 / WR-04) · commit `89949a9`

`supabase/migrations/075_time_block_location_same_tenant.sql`: `locations_id_business_uq`
(UNIQUE `(id, business_id)`) + reemplazo de la FK simple `time_blocks_location_id_fkey` por
`tb_location_same_tenant`, compuesta sobre el par `(location_id, business_id)`. La base pasa a
rechazar una franja cuyo consultorio pertenece a otro negocio, de forma **declarativa**: ningún
consumidor tiene que acordarse.

**El SQL propuesto por el audit en `19-SECURITY.md` §4.1 estaba mal y no se copió.** Dos correcciones
medidas contra PG 17.6:

1. `ON DELETE SET NULL` **sin lista de columnas** nulea las dos columnas de la FK. Como
   `time_blocks.business_id` es NULLABLE, borrar un consultorio **no da error** y deja la franja
   huérfana: fuera de la RLS de su dueño, invisible en el panel, comodín para siempre (RA-02). La
   075 usa `ON DELETE SET NULL ("location_id")`.
2. El chequeo de backfill con `JOIN … WHERE l.business_id <> tb.business_id` no cuenta las filas con
   nulos (`<>` contra NULL devuelve NULL) ni las que apuntan a un consultorio inexistente. La 075
   usa `NOT EXISTS` sobre el par, dentro de un `DO $$` que **aborta** con `P0001` y el count exacto,
   **antes** del `DROP`, y todo dentro de un `BEGIN`/`COMMIT` explícito (sin él, un `ADD` que falla
   deja la tabla sin ninguna FK a `locations`).

Cierra de paso **T-19-32**: el archivo termina con `NOTIFY pgrst, 'reload schema';` después del
`COMMIT`.

### Task 2 — El guard fail-closed pasa de 1 a 5 counts (T-19-39 / WR-07) · commit `52e87d2`

`app/(dashboard)/settings/settings-client.tsx:1259-1265`. Una condición más en el `if` que ya
existía, no una rama nueva. **Extendido a los cinco**, no a los tres del fix propuesto por el audit:
le faltaban `futDias` (alimenta `future` → `delBlocked`: mismo fail-open de borrado bloqueado →
confirmable) y `futHoy` (un count nulo además **desactiva el fail-closed de paginación**, porque
`countDeHoy > filasDeHoy.length` nunca se cumple con `countDeHoy = 0`).

No se tocaron los `?? 0`, ni `bridgeIncompleto`, ni `delBlocked`, ni el JSX.

### Task 3 — El contra-caso que muerde (T-19-14) · commits `7ef6c64` + `33b2db4`

`test/settings-delete-precheck-tenant.test.ts`, 4 casos, proyecto vitest `db`. El caso 3 usa
service-role **a propósito**: el contra-caso "tal cual" que describía el audit **no muerde** —con la
RLS activa el count da 0 igual, así que borrarle el filtro explícito a la query dejaría el test
verde. Apagando la RLS, el `.eq('business_id', …)` queda como única capa y su ausencia se vuelve
observable.

`19-SECURITY.md` actualizado sin reescribir la prosa del auditor: sólo líneas apendidas y fechadas
`Actualización 2026-08-28 (quick 260828-pir)`.

## Evidencia — salidas CRUDAS

### `supabase db reset` — la 075 se APLICA, no se saltea

```
Applying migration 073_tenant_integrity_and_default_privs.sql...
NOTICE (00000): 073: sin permiso para alterar los default privileges de supabase_admin — se deja como estaba. El creador efectivo de este proyecto es postgres (CLI + editor SQL), ya cubierto arriba.
NOTICE (00000): 073: sin permiso para alterar los default privileges de supabase_admin (TRUNCATE/authenticated) — ver la nota de arriba.
Applying migration 074_save_agenda_blocks.sql...
NOTICE (00000): 074: sin permiso para alterar los default privileges de supabase_admin (EXECUTE/anon) — se deja como estaba. El creador efectivo de este proyecto es postgres (CLI + editor SQL), ya cubierto arriba.
Applying migration 075_time_block_location_same_tenant.sql...
Seeding data from supabase/seed.sql...
Skipping migration README.md... (file name must match pattern "<timestamp>_name.sql")
Restarting containers...
Finished supabase db reset on branch main.
```

### Constraints tras el reset — exactamente dos filas

```
locations_id_business_uq :: UNIQUE (id, business_id)
tb_location_same_tenant :: FOREIGN KEY (location_id, business_id) REFERENCES locations(id, business_id) ON DELETE SET NULL (location_id)
```

`time_blocks_location_id_fkey` **no aparece**: se reemplazó.

### Probe de los cuatro casos, contra la base ya migrada

```
BEGIN
CREATE TABLE
INSERT 0 1
INSERT 0 1
INSERT 0 1
INSERT 0 1
=== CASO 1: franja de A con consultorio de A (debe ACEPTAR) ===
SAVEPOINT
INSERT 0 1
                              resultado
---------------------------------------------------------------------
 CASO 1 -> ACEPTADA, time_block 2bb0144b-0f3e-4041-85ea-33c3ea6fa7ce
(1 row)


=== CASO 2: franja de A con consultorio de B (debe RECHAZAR) ===
SAVEPOINT
psql:/tmp/probe075.sql:20: ERROR:  insert or update on table "time_blocks" violates foreign key constraint "tb_location_same_tenant"
DETAIL:  Key (location_id, business_id)=(f9f51c00-61a7-4913-a14c-8a59c3f14aae, 2cd3b14b-31c7-4994-a596-20da5b0e4b66) is not present in table "locations".
ROLLBACK

=== CASO 3: franja de A con location_id NULL (debe ACEPTAR - MATCH SIMPLE) ===
SAVEPOINT
            caso3_aceptada
--------------------------------------
 8ad6abf1-1cdf-4f36-82a5-a21ea57c5d3e
(1 row)

INSERT 0 1

=== CASO 4: DELETE del consultorio de A (location_id -> NULL, business_id INTACTO) ===
DELETE 1
              time_block              | location_quedo_null | business_id_quedo_null |             business_id
--------------------------------------+---------------------+------------------------+--------------------------------------
 2bb0144b-0f3e-4041-85ea-33c3ea6fa7ce | t                   | f                      | 2cd3b14b-31c7-4994-a596-20da5b0e4b66
(1 row)

ROLLBACK
```

Caso 4 es el que prueba la corrección del SQL del audit: `location_quedo_null = t` y
`business_id_quedo_null = **f**`.

### Idempotencia — el archivo aplicado una segunda vez sobre la base ya migrada

```
BEGIN
DO
DO
psql:/tmp/075.sql:157: NOTICE:  constraint "time_blocks_location_id_fkey" of relation "time_blocks" does not exist, skipping
ALTER TABLE
DO
COMMIT
NOTIFY
```

Y el segundo `supabase db reset` completo:

```
Seeding data from supabase/seed.sql...
Skipping migration README.md... (file name must match pattern "<timestamp>_name.sql")
Restarting containers...
Finished supabase db reset on branch main.
```

### Prueba de mordida — ROJA (sin el `.eq('business_id', …)` en el helper)

```
 ❯ |db| test/settings-delete-precheck-tenant.test.ts (4 tests | 1 failed) 695ms
     × 3. LA MORDIDA — con la RLS DESACTIVADA, el filtro explícito por business_id sostiene solo 34ms
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  |db| test/settings-delete-precheck-tenant.test.ts > pre-check de borrado de servicio: aislamiento cross-tenant (T-19-14) > 3. LA MORDIDA — con la RLS DESACTIVADA, el filtro explícito por business_id sostiene solo
AssertionError: expected 1 to be +0 // Object.is equality
- Expected
+ Received
- 0
+ 1
 ❯ test/settings-delete-precheck-tenant.test.ts:172:23
    170|     // abajo es lo único que hace observable la mordida.
    171|     const conFiltro = await contarFranjasMapeadas(seeded.admin, seeded…
    172|     expect(conFiltro).toBe(0)
       |                       ^
    173|
    174|     // Y la prueba de que ese 0 lo produce EL FILTRO y no la ausencia …
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
VITEST_EXIT=1
```

Los casos 1, 2 y 4 quedan **verdes** con el filtro borrado — que es exactamente el punto que la
cabecera del archivo declara: la RLS los tapa, y sólo el caso 3 observa la capa explícita aislada.

### Prueba de mordida — VERDE (filtro restaurado)

```
130:      .eq('business_id', businessId)
--- rerun ---
 RUN  v4.1.9 C:/Users/franc/Desktop/Forjo Studio/forjo-app
 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  18:46:46
   Duration  1.33s (transform 64ms, setup 45ms, import 101ms, tests 1.00s, environment 0ms)
VITEST_EXIT=0
```

### eslint sobre `settings-client.tsx` — antes / después

| | Hallazgos |
|---|---|
| **Antes** del cambio | `✖ 11 problems (11 errors, 0 warnings)` |
| **Después** del cambio | `✖ 11 problems (11 errors, 0 warnings)` |

**Cero hallazgos nuevos.** Los 11 son preexistentes (`react-hooks/purity` por `Date.now()` en
`:1115` y `:1594`, entre otros), todos fuera del rango editado.

### `npm test` completo

```
 Test Files  82 passed (82)
      Tests  1067 passed | 4 expected fail | 1 skipped (1072)
   Duration  76.24s
```

Suite nueva clasificada en el proyecto `db` (verificado con `--reporter=verbose`: `✓ |db| test/settings-delete-precheck-tenant.test.ts …`)
y `test/suite-split.test.ts` en **6/6**.

### `tsc` y gates de alcance

```
./node_modules/.bin/tsc --noEmit   → exit 0
git diff --stat -- supabase/migrations/074_save_agenda_blocks.sql   → (vacío)
git diff --stat -- supabase/schema.sql                              → (vacío)
git diff --name-only -- package.json package-lock.json              → (vacío)
git diff --name-only -- .planning/.../phases/19-el-panel/ | grep -v 19-SECURITY.md | wc -l  → 0
```

## Desviaciones del plan

**Una, y es de medición, no de alcance.**

**[Rule 3 — gate mal calibrado] El `grep -cE` del plan devuelve 6, no 5**
- **Encontrado en:** Task 2, verificación.
- **Qué pasa:** `grep -c` cuenta **líneas que matchean**, no ocurrencias. El regex
  `(futDias|futHoy|abo|hist|blocks)\.count === null` matchea las 5 condiciones nuevas
  (`:1260-1264`, una por línea) **más** la línea de comentario `:1227`, que cita
  `` `blocks.count === null` `` en prosa y **existía antes de esta tarea** (es el comentario original
  de la Phase 19, que el plan pedía extender, no reemplazar).
- **Resolución:** las 5 condiciones en código están, una por línea, verificado con `grep -nE`:

  ```
  1227:    // `blocks.count === null` va en el MISMO guard (no es una rama nueva, es una condición más de la
  1260:        || futDias.count === null
  1261:        || futHoy.count === null
  1262:        || abo.count === null
  1263:        || hist.count === null
  1264:        || blocks.count === null
  ```

  El `if` se escribió con una condición por línea (en vez de agrupadas) precisamente para que el
  gate del plan fuera legible línea a línea; la columna vertical además refuerza visualmente la
  regla uniforme. No se tocó el comentario preexistente `:1227` para no destruir prosa que el plan
  mandaba conservar.
- **Commit:** `52e87d2`

Nada más se desvió: no hubo bugs que arreglar, ni funcionalidad crítica faltante, ni decisiones
arquitectónicas nuevas.

## Amenazas — estado

| ID | Antes | Ahora |
|---|---|---|
| T-19-32 | 🔴 OPEN | 🔴 OPEN — se cierra sola al aplicar la 075 (`NOTIFY pgrst` final) |
| T-19-36 | 🔴 OPEN | 🔴 OPEN — fix escrito y validado; **la propiedad no existe en prod hasta aplicar la 075** |
| T-19-39 | 🔴 OPEN | ✅ **CLOSED** |
| T-19-14 | CLOSED sin prueba | ✅ CLOSED **con test que muerde** |
| Deuda de verificación #1 (§6) | pendiente | ✅ saldada |

`19-SECURITY.md`: `threats_closed: 38`, `threats_open: 2`, `status: open_threats`.

Las amenazas del propio quick task (`T-Q28-01` … `T-Q28-SC`) quedaron todas mitigadas: la FK
compuesta muerde (caso 2 del probe), la lista de columnas está (caso 4), el guard de backfill aborta,
el fail-open del pre-check se cerró, el test usa service-role sólo donde está declarado, y ni la 074
ni `schema.sql` ni `package*.json` tienen una línea de diff.

## Pendiente HUMANO — runbook de la migración 075 en producción

**La 075 NO se aplicó a producción en esta tarea.** Sin aplicarla, T-19-36 y T-19-32 siguen abiertas.
El runbook completo vive en la cabecera del propio archivo; resumen:

1. **Pre-flight** en el SQL editor de producción — tiene que devolver **0**:

   ```sql
   SELECT count(*) FROM "public"."time_blocks" tb
    WHERE tb."location_id" IS NOT NULL
      AND tb."business_id" IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM "public"."locations" l
                       WHERE l."id" = tb."location_id" AND l."business_id" = tb."business_id");
   ```

   (En local devuelve 0. El guard de la migración lo vuelve a correr y aborta si no lo es.)

2. **Pegar y ejecutar `075_time_block_location_same_tenant.sql` COMPLETO, de una sola vez.** Nunca
   statement por statement: el `DROP` + `ADD` viven en un `BEGIN`/`COMMIT` explícito, y correrlo en
   pedazos puede dejar `time_blocks` sin ninguna FK a `locations`.

3. **Verificar:**

   ```sql
   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
    WHERE conname IN ('tb_location_same_tenant', 'locations_id_business_uq',
                      'time_blocks_location_id_fkey');
   ```

   Esperado: **dos** filas (el UNIQUE y la FK compuesta con `ON DELETE SET NULL (location_id)`).
   `time_blocks_location_id_fkey` no debe aparecer.

4. **Recién después:** espejar `supabase/schema.sql` a mano y de forma quirúrgica (nunca `db dump`)
   — el UNIQUE en el bloque de constraints de `locations` (~`schema.sql:1620`) y el reemplazo de la
   línea de `time_blocks_location_id_fkey` (~`schema.sql:2164`) — y pasar **T-19-36** y **T-19-32** a
   CLOSED en `19-SECURITY.md`.

Última migración aplicada en prod: **074**. La 075 es la siguiente; la próxima migración nueva es la
**076**.

## Commits

| Hash | Tipo | Descripción |
|---|---|---|
| `89949a9` | feat | migr. 075: FK compuesta `tb_location_same_tenant` (T-19-36) |
| `52e87d2` | fix | el guard fail-closed pasa de 1 a 5 counts (T-19-39) |
| `7ef6c64` | test | contra-caso cross-tenant del 5º count del pre-check (T-19-14) |
| `33b2db4` | docs | `19-SECURITY.md` al día — 38/40 cerradas, 2 abiertas |

## Known Stubs

Ninguno.

## Threat Flags

Ninguna superficie de seguridad nueva fuera del `<threat_model>` del plan. La 075 **reduce**
superficie de escritura (una validación declarativa más en la base); el guard de 5 counts y el test
no agregan endpoints, rutas de auth, acceso a archivos ni cambios de esquema en un límite de
confianza más allá del ya declarado.

## Self-Check: PASSED

Los 3 artefactos existen en disco y los 4 commits existen en `git log`.
