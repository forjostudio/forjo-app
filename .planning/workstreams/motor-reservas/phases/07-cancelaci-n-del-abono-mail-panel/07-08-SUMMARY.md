---
phase: 07-cancelaci-n-del-abono-mail-panel
plan: 08
subsystem: database
tags: [postgres, supabase, migrations, unique-index, cancel-token, rls]

requires:
  - phase: 06-abonos-modelo-alta-generacion
    provides: "tabla public.abonos con cancel_token (migración 054) y el CHECK de abono_window_weeks (055, aún no en prod)"
provides:
  - "migración 056: índice ÚNICO abonos_cancel_token_idx sobre public.abonos (cancel_token)"
  - "bloque DO $$ de verificación previa de duplicados que aborta con mensaje accionable"
  - "supabase/schema.sql reflejando el índice nuevo (edición quirúrgica, sin dump)"
  - "instrucción operativa de deploy: prod está en 054 → aplicar 055 → 056 → NOTIFY pgrst"
affects: [deploy de v0.24, secure-phase 07, cualquier plan futuro que numere migraciones]

tech-stack:
  added: []
  patterns:
    - "índice único sobre credencial pública verificado con bloque de duplicados previo"

key-files:
  created:
    - supabase/migrations/056_abonos_cancel_token_unique.sql
  modified:
    - supabase/schema.sql

key-decisions:
  - "Migración NUEVA 056 en archivo aparte: ni la 054 (ya en prod) ni la 055 (en repo, sin aplicar) se enmiendan en el lugar"
  - "Verificación de duplicados ANTES del CREATE UNIQUE INDEX, con RAISE EXCEPTION propio: el error nativo de Postgres no dice qué hacer"
  - "schema.sql editado a mano (+4/−0, 1 línea funcional): el CLI v2.107 reordena el archivo entero si se regenera con dump"

patterns-established:
  - "Migración de constraint sobre datos existentes: validar primero con DO $$ + RAISE EXCEPTION accionable, después el DDL idempotente"

requirements-completed: [ABONO-04, ABONO-05]

duration: 26min
completed: 2026-07-21
status: complete
---

# Phase 07 Plan 08: índice único sobre `abonos.cancel_token` (WR-03) Summary

**La credencial de la vía pública de baja del abono ahora está garantizada por la base: `abonos_cancel_token_idx` UNIQUE, con verificación previa de duplicados, validada dos veces contra el baseline replayable local.**

---

## ⚠ INSTRUCCIÓN DE DEPLOY — LEER ANTES DE SALIR A PRODUCCIÓN

Producción tiene aplicada hasta la **054**. Al deployar, aplicar **A MANO** en el SQL editor del Supabase de prod, **en este orden**:

1. `supabase/migrations/055_abono_window_bounds.sql`
2. `supabase/migrations/056_abonos_cancel_token_unique.sql`
3. `NOTIFY pgrst, 'reload schema';`

La **055 no se saltea**: la 056 no depende de ella, pero el repo asume que el orden numerado se respeta y la 055 lleva el CHECK de `abono_window_weeks` que cierra el GAP-01 de la Phase 6.

**Pre-check de producción ya hecho (checkpoint Task 4, operador, 2026-07-21):** la consulta de duplicados
`SELECT cancel_token, count(*) FROM public.abonos GROUP BY cancel_token HAVING count(*) > 1;` devolvió **0 filas** en prod → el `CREATE UNIQUE INDEX` se puede crear sin riesgo.

**Confirmado también:** la 056 es la ÚNICA migración de este cierre de code review. Los planes 07-06, 07-07 y 07-09..07-12 no requieren ninguna otra.

---

## Performance

- **Duration:** 26 min
- **Started:** 2026-07-21T21:35Z
- **Completed:** 2026-07-21T22:01Z
- **Tasks:** 4 (3 auto + 1 checkpoint aprobado)
- **Files modified:** 2

## Accomplishments

- **WR-03 cerrado.** `abonos.cancel_token` era la credencial única de la vía pública de baja (link del mail + `/abono/cancelar/[token]`) y no tenía ninguna restricción de unicidad: la garantía descansaba en la suerte del default `gen_random_uuid()`. Ahora la impone Postgres, igual que la tabla hermana `appointments`.
- **Efecto secundario deseado:** cada click de link público deja de ser un seq scan sobre `abonos` y pasa a ser una búsqueda por índice.
- **Migración defensiva:** el bloque `DO $$` cuenta los tokens duplicados y aborta con un mensaje que dice cuántos hay y qué hacer, en vez de dejar el error genérico de Postgres del `CREATE UNIQUE INDEX`.
- **Cero superficie nueva:** ni columnas, ni funciones, ni RPC, ni policies. Solo el índice.

## Task Commits

1. **Task 1: crear la migración 056 con verificación previa de duplicados** — `b5a3886` (feat)
2. **Task 2: validar la 056 contra la base local con `supabase db reset`** — sin commit (tarea de verificación, no produce cambios de archivo)
3. **Task 3: actualizar `supabase/schema.sql` quirúrgicamente** — `f20fd82` (chore)
4. **Task 4: checkpoint humano (duplicados en prod + orden de aplicación)** — aprobado por el operador, sin cambios de código

## Files Created/Modified

- `supabase/migrations/056_abonos_cancel_token_unique.sql` (nuevo, 72 líneas) — cabecera doctrinal en español (contexto WR-03, qué hace, qué NO hace, cómo se aplica con el orden 055 → 056 → `NOTIFY pgrst`), bloque `DO $$` de verificación de duplicados con `RAISE EXCEPTION`, y `CREATE UNIQUE INDEX IF NOT EXISTS "abonos_cancel_token_idx" ON "public"."abonos" ("cancel_token")`.
- `supabase/schema.sql` (+4 / −0) — `CREATE UNIQUE INDEX "abonos_cancel_token_idx" ON "public"."abonos" USING "btree" ("cancel_token");` junto a los otros índices de `abonos`, con la forma exacta de `appointments_cancel_token_idx` (sin `IF NOT EXISTS`, con `USING "btree"`).

## Verificación ejecutada

| Criterio | Resultado |
|---|---|
| `supabase db reset` local (replay baseline + 040..056) | OK, **corrido dos veces**; la salida muestra `Applying migration 056_abonos_cancel_token_unique.sql...` sin error en ambas |
| Idempotencia real (re-aplicar el archivo sobre la misma base con `psql`) | `NOTICE: relation "abonos_cancel_token_idx" already exists, skipping` → no-op |
| `pg_indexes` local | 1 fila: `CREATE UNIQUE INDEX abonos_cancel_token_idx ON public.abonos USING btree (cancel_token)` — `UNIQUE` confirmado |
| `./node_modules/.bin/vitest run test/abono-cancel.test.ts --no-file-parallelism` | **13/13 verdes** con el índice puesto (el fixture crea varias series por negocio) |
| `grep -c 'CREATE UNIQUE INDEX IF NOT EXISTS "abonos_cancel_token_idx"...'` en la migración | 1 |
| `grep -c "RAISE EXCEPTION"` / `grep -c "HAVING count(\*) > 1"` | 1 / 1 |
| `grep -c "ALTER TABLE\|CREATE POLICY\|CREATE FUNCTION\|DROP "` en la migración | **0** (sin superficie nueva) |
| `git diff --numstat supabase/migrations/054_abonos.sql 055_abono_window_bounds.sql` | vacío (intactas) |
| `git diff supabase/schema.sql` líneas borradas | 0, sin reordenamiento |
| Duplicados en PRODUCCIÓN (operador) | **0 filas** |

## Decisions Made

- **Migración nueva 056, archivo aparte.** Decisión LOCKED del usuario en el plan. La 054 ya está aplicada en prod (2026-07-21) y una migración aplicada no se edita en el lugar; la 055 tampoco se enmienda aunque todavía no esté en prod, porque el repo trabaja con orden numerado inmutable.
- **Verificación de duplicados PRIMERO, con mensaje propio.** `CREATE UNIQUE INDEX` sobre una tabla con duplicados falla con un error de Postgres que no dice qué hacer. El `RAISE EXCEPTION` informa el conteo y la acción correctiva (reasignar `gen_random_uuid()` a cada serie repetida). En una base sana es un no-op.
- **`schema.sql` a mano, no por dump.** Decisión registrada del proyecto (STATE.md, Phase 06): el CLI v2.107 reordena el archivo entero y el diff se vuelve irrevisable.

## Deviations from Plan

### 1. [Presentación] `supabase/schema.sql` quedó en +4 / −0 en vez de "≤3 líneas agregadas"

- **Found during:** Task 3 (actualizar `supabase/schema.sql`)
- **Issue:** el criterio de aceptación pedía a lo sumo 3 líneas agregadas, pero el archivo separa cada `CREATE INDEX` con **3 líneas en blanco**. Insertar una sentencia respetando ese formato son 1 línea funcional + 3 blancos = 4 líneas.
- **Fix:** se priorizó el formato del archivo (que el mismo plan exige respetar) sobre el número literal. El invariante real del criterio se cumple: **1 sola sentencia funcional, 0 líneas borradas, cero reordenamiento**.
- **Files modified:** `supabase/schema.sql`
- **Verification:** `git diff --numstat` → `4 0`; `git diff | grep '^-[^-]'` → sin resultados.
- **Committed in:** `f20fd82`
- **Estado:** desvío **aceptado explícitamente por el orquestador** en el checkpoint.

---

**Total deviations:** 1 (de presentación, aceptada). Ningún desvío funcional.
**Impact on plan:** nulo. El contenido entregado es exactamente el especificado.

## Issues Encountered

Ninguno. La migración corrió limpia en el primer intento sobre el baseline local; el seed no genera tokens duplicados y los tests contra la DB local siguieron verdes con la constraint puesta.

## Threat Model — dispositions cumplidas

| Threat ID | Disposition | Cómo quedó cerrado |
|---|---|---|
| T-07-33 (Spoofing: credencial sin unicidad) | mitigate | `CREATE UNIQUE INDEX "abonos_cancel_token_idx"` en la 056 |
| T-07-34 (DoS: el índice falla si hay duplicados) | mitigate | bloque `DO $$` con `RAISE EXCEPTION` accionable + checkpoint humano con verificación contra prod (0 filas) |
| T-07-35 (DoS: seq scan por click de link) | mitigate | resolución por token pasa a búsqueda indexada |
| T-07-36 (Tampering: enmendar migración aplicada) | mitigate | `git diff --numstat` sobre 054 y 055 vacío |
| T-07-37 (EoP: DDL que amplíe superficie) | mitigate | 0 matches de `ALTER TABLE` / `CREATE POLICY` / `CREATE FUNCTION` / `DROP ` en el archivo |
| T-07-SC (npm installs) | mitigate | cero dependencias agregadas o actualizadas; se usó el Supabase CLI ya presente (v2.107) |

## User Setup Required

Sí — **acción manual en producción, coordinada con el deploy**: aplicar `055` → `056` → `NOTIFY pgrst, 'reload schema';` (ver el bloque destacado al principio de este documento). No hay variables de entorno ni configuración de servicios externos.

## Known Stubs

Ninguno.

## Next Phase Readiness

- WR-03 cerrado. La vía pública de baja del abono (`app/api/abonos/cancel/[token]/route.ts` y `app/abono/cancelar/[token]/page.tsx`) queda respaldada por la base.
- **Blocker operativo abierto hasta el deploy:** prod sigue en 054. Mientras no se apliquen 055 y 056 a mano, el índice único y el CHECK de la ventana NO existen en producción.
- La numeración de migraciones queda en **056**; la próxima migración del repo debe ser la **057**.

## Self-Check: PASSED

- `supabase/migrations/056_abonos_cancel_token_unique.sql` — FOUND
- `supabase/schema.sql` — FOUND
- `.planning/.../07-08-SUMMARY.md` — FOUND
- Commits `b5a3886`, `f20fd82`, `504a8e0` — FOUND en el historial

---
*Phase: 07-cancelaci-n-del-abono-mail-panel*
*Completed: 2026-07-21*
