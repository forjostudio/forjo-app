---
phase: 18-el-modelo-y-la-disponibilidad
plan: 01
subsystem: database
tags: [supabase, postgres, rls, multi-tenant, migration, view]

# Dependency graph
requires:
  - phase: 08-equipo-que-servicios-hace-cada-profesional
    provides: "el molde completo de la tabla puente con RLS por tenant (migr. 057) y el de la vista acotada anon (migr. 059), incluido el Pitfall 5 de `security_invoker`"
  - phase: 15-modelo-de-cupo-unificado
    provides: "la migr. 068 que sacó el cupo de `time_blocks` y dejó a la tabla declarando sólo el CUÁNDO — el lugar que esta fase usa para declarar el QUÉ"
provides:
  - "`time_block_services`: tabla puente franja ↔ servicio por negocio (business_id/time_block_id/service_id NOT NULL, PK compuesta, 3 FK ON DELETE CASCADE)"
  - "RLS habilitada + 4 policies por operación con predicado de tenant por `owner_id`, sin acceso `anon` a la tabla base"
  - "`time_block_services_by_service (service_id, time_block_id)`: el índice que sirve «qué franjas cubren el servicio Y»"
  - "`public_time_block_services`: vista acotada DEFINER (owner postgres) con GRANT a anon/authenticated/service_role — el único camino público al mapeo"
  - "La regla del comodín viva por CONSTRUCCIÓN: 0 filas el día de la migración ⇒ toda franja sirve para cualquier servicio ⇒ cero regresión"
affects: [18-02, 18-03, 18-04, phase-19-ui-de-configuracion, phase-20-booking-publico]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tabla puente de tenant: molde 057 (FKs NOT NULL + ON DELETE CASCADE + PK compuesta + RLS en la MISMA migración + 4 policies por operación + índice inverso)"
    - "Exposición a `anon` por vista acotada DEFINER (molde 059), nunca abriendo la tabla base"
    - "Divergencia del molde documentada en la cabecera de la migración con su consecuencia y su alternativa descartada, en vez de asumida en silencio"
    - "Verificación por INSTALACIÓN contra el catálogo de Postgres + control negativo real, en vez de `grep` sobre el `.sql`"

key-files:
  created:
    - "supabase/migrations/071_time_block_services.sql"
  modified:
    - "supabase/schema.sql"

key-decisions:
  - "La puente exige `business_id` NOT NULL igual que el molde 057, aunque `time_blocks.business_id` sea NULLABLE: una franja huérfana nunca puede recibir mapeo (su propio dueño no la ve, porque `NULL IN (...)` evalúa a NULL y `USING` lo trata como falso) ⇒ queda COMODÍN para siempre, que es su comportamiento de hoy. La divergencia falla hacia el lado seguro. Medido: 0 franjas huérfanas sobre 9 en local"
  - "Descartado hacer NULLABLE el `business_id` de la puente para heredar el nulo del padre: volvería inútil el predicado de tenant de las 4 policies para esas filas y dejaría la vista pública sin columna con la que filtrar por negocio"
  - "La vista es DEFINER (owner postgres) sin la opción de invocador — verificado contra `pg_class.reloptions` (NULL) y contra el comportamiento real (`SET LOCAL ROLE anon` lee 1 fila). Con invoker el anon leería 0 filas siempre y el mapeo sería indistinguible del comodín para TODO negocio"
  - "La tabla y su vista van en la MISMA migración aunque la vista todavía no tenga consumidor (es de la Phase 20): las migraciones se aplican a prod A MANO y partirlas en dos aplicaciones duplica el riesgo operativo por cero beneficio. La vista es aditiva e inerte sin consumidor"
  - "Cero backfill, ni una fila: el estado neutro ES el estado actual (AGENDA-04 / D-02). Sembrar una sola fila rompería la cero regresión por construcción"
  - "`schema.sql` se editó QUIRÚRGICAMENTE (85 líneas agregadas, 0 borradas), nunca por `supabase db dump`, que reordena el archivo entero"

patterns-established:
  - "Cuando una tabla nueva copia un molde pero el padre no da la misma garantía (columna nullable), la divergencia se escribe en la cabecera con: qué se eligió, cuál es la consecuencia observable, por qué falla hacia el lado seguro, qué se midió y qué alternativa se descartó"
  - "Control negativo doble para toda tabla con vista pública: (a) el anon LEE la vista y devuelve ≥1 fila sobre un fixture sembrado en transacción, (b) el anon ESCRIBE la tabla base y el INSERT falla. Las dos transacciones terminan en ROLLBACK"

requirements-completed: [AGENDA-01, AGENDA-04]

# Metrics
duration: 22min
completed: 2026-08-25
status: complete
---

# Phase 18 Plan 01: El modelo — tabla puente franja ↔ servicio Summary

**Una franja horaria ya puede declarar qué servicios se dan en ella, con la regla del comodín viva por ausencia de filas: la migr. 071 crea `time_block_services` con RLS por tenant y su vista acotada `public_time_block_services`, y como el día de la migración todos los negocios tienen 0 filas, ningún negocio cambia de comportamiento.**

## Performance

- **Duration:** ~22 min
- **Completed:** 2026-08-25
- **Tasks:** 2 (1 de implementación + 1 de verificación por instalación, BLOCKING)

## What Was Built

### Task 1 — La migración 071 (commit `8ab7ef1`)

`supabase/migrations/071_time_block_services.sql`, tres secciones:

1. **`time_block_services`** — `business_id` + `time_block_id` + `service_id`, las tres `uuid NOT NULL` con FK `ON DELETE CASCADE`; PK compuesta `(time_block_id, service_id)`; sin `created_at` (espejo exacto de la 057). `ENABLE ROW LEVEL SECURITY` en la MISMA migración y **4 policies por operación** —`SELECT`/`DELETE` con `USING`, `INSERT` con `WITH CHECK`, `UPDATE` con **las dos**— cada una precedida de su `DROP POLICY IF EXISTS`, todas con el predicado de tenant por `owner_id = auth.uid()`. **Ninguna policy para `anon`.**
2. **`time_block_services_by_service (service_id, time_block_id)`** — el índice inverso: la PK sirve «qué servicios se dan en la franja X», el índice sirve «qué franjas cubren el servicio Y», que es la pregunta de los Planes 02-04 y de las Phases 19/20.
3. **`public_time_block_services`** — `CREATE OR REPLACE VIEW` de las tres columnas sin JOIN, `OWNER TO "postgres"` (DEFINER) + `GRANT ALL` a los tres roles.

La cabecera documenta, además del formato habitual del repo (contexto → qué hace → qué NO hace → el párrafo invariante de aplicación manual), **las dos cosas que el plan exigía no asumir en silencio**: la divergencia del molde por el `business_id` NULLABLE de `time_blocks`, y por qué la vista es DEFINER.

`supabase/schema.sql` se reflejó quirúrgicamente en las 8 secciones que corresponden (tabla, vista, PK, índice, 3 FK, RLS + 4 policies, GRANT de tabla, GRANT de vista): **85 líneas agregadas, 0 borradas**.

### Task 2 — Verificación por instalación (sin cambios de archivo, no genera commit)

`npx supabase db reset` replayó el baseline `00000000000000_baseline` → 040 → … → **071** sin un solo `ERROR:` de SQL.

## Mediciones (catálogo de Postgres, PG17 local)

Consulta compuesta del `<verify>` → **`t`**. Desglose medido:

| Medición | Fuente | Esperado | Obtenido |
|---|---|---|---|
| Policies de `time_block_services` | `pg_policies` | 4 | **4** (`select` / `insert` / `update` / `delete`) |
| RLS activa | `pg_class.relrowsecurity` | `t` | **`true`** |
| Índices de la tabla | `pg_indexes` | 2 | **2** (`time_block_services_pkey`, `time_block_services_by_service`) |
| Vista `public_time_block_services` | `pg_views` | 1 | **1** |
| Opción de invocador en la vista | `pg_class.reloptions` | 0 coincidencias | **`reloptions = NULL`** |
| FK con CASCADE | `pg_constraint.confdeltype` | 3 × `c` | **3 × `c`** (business, time_block, service) |
| Filas en la puente | `select count(*)` | 0 | **0** (cero backfill) |
| Franjas huérfanas en local | `time_blocks where business_id is null` | — | **0** sobre 9 |

### Control negativo de LECTURA (T-18-02)

Transacción que siembra una fila derivada de un `time_block` + `service` del mismo negocio del `seed.sql`, luego `SET LOCAL ROLE anon`:

```
CTRL_LECTURA_seeded_rows=1
CTRL_LECTURA_anon_view_rows=1
ROLLBACK
```

**1 fila leída por `anon` a través de la vista.** Este es exactamente el caso que devolvería **0** si la vista se hubiera creado con la opción de invocador — o sea, el control que distingue «funciona» de «falla en silencio». Un `grep` sobre el `.sql` no habría detectado la diferencia.

### Control negativo de ESCRITURA (T-18-04)

Transacción con `SET LOCAL ROLE anon`:

```
CTRL_ESCRITURA_anon_base_table_rows=0
ERROR:  new row violates row-level security policy for table "time_block_services"
ROLLBACK
```

El `anon` **no lee** la tabla base (0 filas, aunque había 1 sembrada en la otra transacción) y su `INSERT` **rebota** contra la RLS. Los dos resultados son los esperados.

Fuera de transacción, `select count(*) from public.time_block_services` = **0**: las dos transacciones terminaron en `ROLLBACK` y la cero regresión sigue intacta.

## ⚠ Pendiente de aplicación MANUAL a producción

**La 071 NO está en prod.** La baseline en producción es la **070**; este plan sólo la validó en LOCAL. El deploy es un paso manual fuera del alcance de este plan:

1. Aplicar `supabase/migrations/071_time_block_services.sql` **a mano** en el SQL editor de Supabase, coordinado con el deploy del código (no hay `supabase db push`, no hay `supabase link`).
2. Ejecutar `NOTIFY pgrst, 'reload schema';` — **sin esto PostgREST no expone ni la tabla ni la vista en su cache**, y la Phase 19 no podría escribir el mapeo. Fail-safe: sin filas legibles todo queda comodín ⇒ el booking de hoy sigue funcionando (T-18-06).
3. Confirmar que `supabase/schema.sql` quedó reflejado (ya lo está en este commit).

## Deviations from Plan

Ninguna — el plan se ejecutó exactamente como estaba escrito. No se aplicó ninguna regla de desviación (1-4), no hubo gates de autenticación, y no se tocó ningún archivo fuera de los dos declarados.

**Nota de proceso:** el Task 2 es de verificación pura y no modifica archivos, así que no generó commit propio; su evidencia es este SUMMARY (estándar del workstream: la medición se registra, no se inventa un commit vacío).

## Threat Model — estado

| Threat ID | Disposition | Estado al cerrar el plan |
|---|---|---|
| T-18-01 | accept | Sin cambios: la vista expone sólo `business_id`/`time_block_id`/`service_id`, ningún dato de cliente, precio ni ocupación |
| T-18-02 | mitigate | **Cerrado por medición doble**: `reloptions = NULL` + control negativo real (anon lee 1 fila) |
| T-18-03 | mitigate | Pendiente de sus consumidores: el helper del Plan 02 recibe sólo bloques ya acotados por `business_id`, así que un `time_block_id` ajeno nunca matchea. **Nota para la Phase 19: su write path debe validar que el bloque pertenezca al negocio antes de insertar** |
| T-18-04 | mitigate | **Cerrado**: RLS activa + 4 policies con predicado de tenant + ninguna policy anon; el `INSERT` anónimo falla con el error de RLS transcrito arriba |
| T-18-05 | accept | Documentado en la cabecera de la migración con la medición (0 huérfanas) y la alternativa descartada |
| T-18-06 | mitigate | El párrafo invariante lo exige en la cabecera y esta SUMMARY lo repite como paso manual de deploy |
| T-18-SC | accept | **Cero paquetes nuevos**: `git diff -- package.json package-lock.json` vacío |

## Verification Results

| # | Criterio del plan | Resultado |
|---|---|---|
| 1 | `npx supabase db reset` replaya 001→071 sin `ERROR:` | ✅ |
| 2 | Consulta compuesta al catálogo devuelve `t` | ✅ |
| 3 | Control negativo de lectura anon ≥ 1 fila | ✅ (1) |
| 4 | Control negativo de escritura anon falla | ✅ (violates RLS policy) |
| 5 | `count(*)` de la puente = 0 fuera de transacción | ✅ |
| 6 | El diff toca exactamente los 2 archivos declarados | ✅ |
| 7 | `git diff -- package.json package-lock.json` vacío | ✅ |
| — | 4 `CREATE POLICY` / 4 `DROP POLICY IF EXISTS` / 3 `CREATE (TABLE\|INDEX\|OR REPLACE VIEW)` / 0 sentencias destructivas | ✅ |
| — | `git diff --stat -- supabase/schema.sql`: sólo líneas agregadas | ✅ (85 / 0) |

## Known Stubs

Ninguno. Este plan no crea código de aplicación; el helper puro, la disponibilidad y el backstop son los Planes 02, 03 y 04.

## Next Plan

**18-02** — `lib/types.ts` (`TimeBlockService`) + `lib/time-block-services.ts` (helper puro con la regla del comodín, molde `lib/staff-services.ts`) + `test/time-block-services.test.ts`.
