---
phase: 14-cierre-de-backlog
plan: 04
subsystem: database
tags: [postgres, plpgsql, trigger, rls, supabase, abonos, vitest, migracion]

# Dependency graph
requires:
  - phase: 13-borrado-de-servicio-preservando-historial
    provides: "molde del gate BEFORE DELETE (migr. 065 §6), guard de cascada, RAISE con ERRCODE fijo, snapshot de servicio en el historial"
  - phase: 06-abonos
    provides: "tabla abonos con RLS + 4 policies por tenant, y appointments.abono_id en ON DELETE SET NULL (migr. 054)"
provides:
  - "migración 066: función public.abonos_block_delete() + trigger abonos_block_delete_trg (BEFORE DELETE sobre public.abonos)"
  - "contrato de error del gate: message 'abono_is_active' sobre ERRCODE 'P0001' — lo mapea la UI del plan 14-06"
  - "test/abono-delete-gate.test.ts: 7 casos de integración contra el Supabase LOCAL"
  - "helper test/helpers/booking-fixtures.ts → purgeAbonos(): archivar + borrar, compatible con el gate"
  - "runbook del apply manual de la 066 en producción (lo consume el checkpoint bloqueante del plan 14-07)"
affects: [14-06, 14-07, abonos, borrado, migraciones]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "gate de borrado en la base (trigger BEFORE DELETE) con código de dominio fijo + ERRCODE P0001"
    - "guard de cascada por ausencia del negocio padre, para no romper el cierre de cuenta ni teardownOneTenant"
    - "cleanup de tests que respeta el gate: archivar la serie antes de borrarla (purgeAbonos)"

key-files:
  created:
    - supabase/migrations/066_abono_delete_gate.sql
    - test/abono-delete-gate.test.ts
  modified:
    - supabase/schema.sql
    - test/helpers/booking-fixtures.ts
    - test/abono-create.test.ts
    - test/abono-cron.test.ts
    - test/canchas-delete-integration.test.ts
    - test/service-snapshot.test.ts

key-decisions:
  - "El gate rechaza SOLO status='active'. Sin rama IS NULL: abonos.status es NOT NULL con CHECK sobre tres valores (054:59), a diferencia de appointments.status que sí es nullable."
  - "D-17 descartado confirmado en la base: borrar la serie no toca sus turnos futuros; sobreviven vivos y con su estado original, desvinculados por el ON DELETE SET NULL de la 054."
  - "La 066 no crea FK, ni policy, ni columna: solo la función y su trigger. Verificado con greps de aceptación (0 ALTER TABLE / CREATE POLICY / ADD CONSTRAINT)."
  - "Los cleanups de tests que borraban series activas directo pasan por purgeAbonos (archivar + borrar), el mismo recorrido que hace el dueño en el panel — el gate no se relaja para los tests."

patterns-established:
  - "Contrato de rechazo del gate: code='P0001' + message.includes('<codigo_dominio>'), sin nombres, fechas ni conteos (el texto llega al navegador)."
  - "Prueba de mutación sobre el trigger: comentar el RAISE, replayar con db reset y verificar que el caso 1 se cae."

requirements-completed: [EXTRA-B]

# Metrics
duration: 62min
completed: 2026-08-04
status: complete
---

# Phase 14 Plan 04: Gate de borrado de abonos en la base Summary

**Migración 066 con el trigger `BEFORE DELETE` sobre `abonos` que rechaza el borrado de una serie activa con `abono_is_active` / `P0001`, deja pasar las archivadas y conserva sus turnos desvinculados — probado en 7 casos de integración contra el Postgres local.**

## Performance

- **Duration:** ~62 min
- **Started:** 2026-08-04T20:14Z (aprox.)
- **Completed:** 2026-08-04T21:16Z (aprox.)
- **Tasks:** 3 (+1 desviación auto-corregida)
- **Files modified:** 8 (2 creados, 6 modificados)

## Accomplishments

- La base es la autoridad sobre qué serie de abono se puede borrar: el trigger corre dentro de la misma transacción del DELETE, así que un request que saltee la UI se rechaza igual (T-14-12).
- El historial sobrevive intacto: los turnos de la serie borrada quedan con `abono_id` en NULL y con su snapshot de nombre/precio de servicio, y los futuros **no** se cancelan (D-16 + D-17 descartado, probado en el caso 4).
- Cerrar la cuenta de un negocio con series activas sigue funcionando (guard de cascada, T-14-15) — el mismo T-13-07 que la 065 ya había pagado para servicios.
- Aislamiento por tenant verificado con sesión anon REAL de otro dueño (0 filas, sin error) más su contrapeso (el propio dueño sí borra), con los dos guards anti-falso-verde.

## Task Commits

1. **Task 1: migración 066 — trigger BEFORE DELETE sobre abonos** — `6aeb7a0` (feat)
2. **Task 2: validación local + espejo del schema** — `38f59db` (chore)
3. **Desviación (Regla 3): cleanups de tests compatibles con el gate** — `fd5a257` (fix)
4. **Task 3: suite de integración del gate** — `bacb89a` (test)

## Files Created/Modified

- `supabase/migrations/066_abono_delete_gate.sql` — **nuevo.** Función `public.abonos_block_delete()` (plpgsql, `SECURITY DEFINER SET search_path = public`) + trigger `abonos_block_delete_trg`. 101 líneas, cierre con el `NOTIFY` de recarga del schema cache.
- `supabase/schema.sql` — espejo quirúrgico de la función y el trigger nuevos (30 líneas agregadas, **0 borradas**; sin `db dump`).
- `test/abono-delete-gate.test.ts` — **nuevo.** 7 casos de integración contra el Supabase LOCAL.
- `test/helpers/booking-fixtures.ts` — nuevo helper `purgeAbonos()` (archivar + borrar).
- `test/abono-create.test.ts`, `test/abono-cron.test.ts`, `test/canchas-delete-integration.test.ts`, `test/service-snapshot.test.ts` — sus cleanups pasan por `purgeAbonos()`.

## Contrato para el plan 14-06

Esto es lo que el cliente tiene que mapear, literal:

| Qué | Valor exacto |
|---|---|
| `error.code` | `'P0001'` |
| `error.message` contiene | `'abono_is_active'` |
| Cuándo se dispara | `OLD.status = 'active'` (serie viva) |
| Cuándo NO se dispara | `status` = `'cancelled'` o `'completed'` |

Molde de mapeo (calco de `settings-client.tsx:620-643`, que ya lo hace con los dos códigos de la 065):

```ts
const { data, error } = await supabase
  .from('abonos').delete().eq('id', id).eq('business_id', business.id).select('id')
if (error) {
  if (error.code === 'P0001' && error.message?.includes('abono_is_active')) return { ok: false, error: 'is_active' }
  return { ok: false, error: 'unknown' }
}
if (!data || data.length === 0) return { ok: false, error: 'unknown' }  // la RLS filtró la fila
```

⚠ **Aviso al 14-06 (ya señalado por 14-PATTERNS §3.c):** el predicado de "Archivado" de la UI
(`isAbonoActivo(a, counts)`) **no** es el del trigger. El gate rechaza exactamente `status = 'active'`.
Si la pantalla muestra en Archivados alguna serie cuyo `status` siga siendo `'active'`, el botón de
borrar va a aparecer sobre una fila que la base va a rechazar. Hay que alinear el predicado de la UI
con el del trigger, o dejar que el `onConfirm` que **lanza** haga de backstop (el molde de 13-03).

El `.select('id')` no es cosmético: si la RLS filtra la fila, el DELETE vuelve **sin error y con 0
filas**, y sin ese select la UI diría "eliminado" sin haber borrado nada.

## Runbook — apply manual de la 066 en producción (para el checkpoint del plan 14-07)

`supabase db push` está **PROHIBIDO**. La 066 **no** se aplicó a producción desde este plan.

**Pre-check (obligatorio, antes de tocar nada).** En el SQL Editor del proyecto de **producción**:

```sql
-- (a) La última migración aplicada en prod debe ser la 065.
select version from supabase_migrations.schema_migrations order by version desc limit 3;
-- esperado: 065, 064, 063

-- (b) El trigger de la 066 NO debe existir todavía.
select tgname from pg_trigger where tgname = 'abonos_block_delete_trg';
-- esperado: 0 filas
```

Si (a) no devuelve `065` como máximo, **parar**: hay migraciones fuera de orden y el apply no puede
seguir.

**Aplicar.**

1. Copiar el contenido **completo** de `supabase/migrations/066_abono_delete_gate.sql` y ejecutarlo
   en el SQL Editor del proyecto de producción, en una sola pasada. El archivo es idempotente
   (`CREATE OR REPLACE FUNCTION` + `DROP TRIGGER IF EXISTS` antes del `CREATE TRIGGER`): re-correrlo
   es un no-op.
2. La última sentencia del archivo ya es `NOTIFY pgrst, 'reload schema';`. Si por lo que sea se
   ejecutó por partes, correrlo aparte al final para refrescar el schema cache de PostgREST.

**Señal de éxito.** La salida del editor debe mostrar, en este orden y sin ningún `ERROR`:

```
CREATE FUNCTION
ALTER FUNCTION
DROP TRIGGER      -- (o el NOTICE "does not exist, skipping" en la primera pasada)
CREATE TRIGGER
NOTIFY
```

**Verificación post-apply** (misma sesión):

```sql
select tgname, tgenabled from pg_trigger where tgname = 'abonos_block_delete_trg';
-- esperado: 1 fila, tgenabled = 'O'
```

**Coordinación con el deploy.** El gate es más restrictivo que el estado actual: aplicarlo **antes**
de deployar el botón del 14-06 es seguro (nadie puede borrar abonos hoy, porque el botón todavía no
existe). Aplicarlo **después** del deploy dejaría una ventana en la que el botón borraría series
activas sin que la base lo impida. **Orden correcto: primero la 066, después el deploy.**

**Rollback.** Si hiciera falta desarmar el gate sin revertir código:

```sql
drop trigger if exists "abonos_block_delete_trg" on "public"."abonos";
notify pgrst, 'reload schema';
```

## Evidencia — idempotencia (re-ejecución real, no inferida)

Con la base ya reseteada, el archivo completo se volvió a ejecutar dentro del contenedor de Postgres
local (`supabase_db_forjo-app`), por stdin a `psql -v ON_ERROR_STOP=1 -U postgres -d postgres`:

```
CREATE FUNCTION
ALTER FUNCTION
DROP TRIGGER
CREATE TRIGGER
NOTIFY
EXIT=0
```

Exit 0, sin `ERROR:`. **Idempotencia verificada, no PENDIENTE.**

`npx supabase migration list --local` muestra la `066` aplicada (`{"local":"066","remote":"066"}`),
después de un `npx supabase db reset` que replayó el baseline + `040..066` sin ningún `ERROR`.

## Evidencia — prueba de mutación (caso 1)

Se comentó la línea del `RAISE` en la 066 (reemplazada por un `NULL;` para que el bloque `IF` siguiera
siendo plpgsql válido), se corrió `npx supabase db reset` y después la suite:

```
FAIL  test/abono-delete-gate.test.ts > 1 — una serie activa NO se puede borrar (P0001 / abono_is_active)
AssertionError: expected null not to be null       (test:129 → expect(del.error).not.toBeNull())

FAIL  test/abono-delete-gate.test.ts > 5 — cerrar la cuenta del negocio funciona … (guard de cascada)
AssertionError: expected undefined to be 'P0001'   (test:208, el sanity check del caso 5)

Tests  2 failed | 5 passed (7)
```

El caso 1 falla, como debía. Se restauró el archivo (`git diff` limpio contra el commit `6aeb7a0`),
se volvió a correr `npx supabase db reset` y la suite quedó en **7/7 verde**.

## Decisions Made

- **Sin rama `IS NULL` en el predicado del gate.** `services_block_delete` la necesita porque
  `appointments.status` es nullable y un `NOT IN` sobre NULL abre el gate. En `abonos`, `status` es
  `NOT NULL` con `CHECK` sobre los tres valores (054:59), así que la comparación por igualdad ya es
  fail-closed: cualquier estado distinto de `'active'` se considera archivado a propósito.
- **El guard de cascada solo pregunta "¿existe el negocio?".** Dentro de una función `SECURITY
  DEFINER` la RLS no aplica, así que el único predicado admisible sobre otra tabla es uno que no
  pueda devolver datos de un tenant ajeno (T-14-13). El `EXISTS` mira `businesses` por PK contra la
  propia columna de la fila borrada y no selecciona ni una columna.
- **Los cleanups de tests se adaptan al gate, el gate no se relaja para los tests.** `purgeAbonos()`
  archiva y después borra: es el mismo recorrido que hace el dueño en el panel.

## Deviations from Plan

### Auto-fixed Issues

**1. [Regla 3 - Blocking] Cinco cleanups de la suite borraban series ACTIVAS directo y el gate nuevo los rechazaba**

- **Found during:** Task 3 (verificación `npx vitest run` completo)
- **Issue:** `test/abono-create.test.ts` (`afterEach` de los dos tenants + el cleanup del caso 7),
  `test/abono-cron.test.ts` (`afterEach`), `test/canchas-delete-integration.test.ts:253` y
  `test/service-snapshot.test.ts:219` hacían `from('abonos').delete()` sobre series con
  `status='active'`. Desde la 066 ese DELETE vuelve con `P0001` y la fila **sobrevive**, contaminando
  el caso siguiente. Se manifestaba como fallos **deterministas**: `abono-create` casos 2b y 3, y
  `abono-cron` caso 5, idénticos en 2 corridas consecutivas.
- **Diagnóstico (para no confundirlo con la flakiness pre-existente):** se dropeó el trigger en el
  Postgres local (`drop trigger abonos_block_delete_trg`) y las dos suites pasaron **23/23**; al
  reinstalar el trigger volvieron a fallar los mismos 3 tests. Regresión causada por este plan, no
  flakiness.
- **Fix:** nuevo helper `purgeAbonos(seeded, opts?)` en `test/helpers/booking-fixtures.ts` que
  primero archiva la serie (`status='cancelled'`, con filtro por `business_id` en las dos
  operaciones) y recién después la borra. Consumido en los cinco sitios.
- **Files modified:** `test/helpers/booking-fixtures.ts`, `test/abono-create.test.ts`,
  `test/abono-cron.test.ts`, `test/canchas-delete-integration.test.ts`, `test/service-snapshot.test.ts`
- **Verification:** las cinco suites afectadas + la nueva → **40/40 verde**; `tsc --noEmit` sale 0.
- **Committed in:** `fd5a257`

---

**Total deviations:** 1 auto-corregida (Regla 3 — blocking).
**Impact on plan:** necesaria para que el gate pudiera convivir con la suite existente. Sin scope
creep: el gate no se relajó, se adaptaron los cleanups. Ningún `.tsx` tocado, como exigía el plan.

## Issues Encountered

**Flakiness pre-existente del entorno local (NO causada por este plan).** El `npx vitest run` completo
sigue mostrando entre 4 y 7 tests en rojo, con **conjuntos distintos en cada corrida**, siempre dentro
de la familia `abono-{create,cron,generation,cancel}`:

| Corrida completa | Fallos |
|---|---|
| post-fix #1 | 7 (abono-cancel 12, abono-create 7, abono-cron 1/2/3, abono-generation 7/8) |
| post-fix #2 | 4 (abono-create 7, abono-cron 1/5, abono-generation 8) |

Criterio de distinción aplicado (según la consigna del ejecutor): **conjunto que varía entre corridas
= flakiness; mismo test fallando siempre = regresión.** Las suites que el plan nombra explícitamente
como criterio de aceptación se corrieron **aisladas, 3 veces seguidas**, y dieron verde las 3:

```
npx vitest run test/service-delete-gate.test.ts test/abono-cancel.test.ts \
  test/abono-cancel-routes.test.ts test/abono-cancel-link.test.ts \
  test/abono-cancel-email.test.ts test/concurrency.test.ts test/abono-delete-gate.test.ts

corrida 1 → Test Files 7 passed (7) · Tests 95 passed | 1 expected fail (96)
corrida 2 → idéntico
corrida 3 → idéntico
```

Y las cuatro suites que este plan tocó por la desviación también dan verde aisladas (40/40, incluida
`abono-delete-gate`). El criterio de aceptación "`npx vitest run` completo sale 0" **no se cumple en
el entorno local** por esta flakiness pre-existente, ya reproducida por los tres ejecutores previos de
la fase. Queda documentado, no arreglado: está fuera del alcance de este plan.

## User Setup Required

**Sí — apply manual de la migración 066 en producción.** Ver el runbook de arriba. Lo ejecuta el
checkpoint humano bloqueante del plan **14-07**, coordinado con el deploy. Este plan **no** aplicó
nada a producción y **no** ejecutó ningún `db push` (T-14-18 cumplido).

## Next Phase Readiness

- **El plan 14-06 (Wave 2) está desbloqueado:** el contrato del error (`P0001` / `abono_is_active`)
  está fijado y documentado arriba. Debe alinear el predicado de "Archivado" de la UI con
  `status = 'active'` del trigger, y usar el `onConfirm` que **lanza** como backstop (molde 13-03).
- **El plan 14-07** tiene el runbook completo para su checkpoint de apply en producción.
- Última migración aplicada en **prod** sigue siendo la **065**. En **local** ya está la **066**.

## Self-Check: PASSED

Archivos verificados en disco:
- `supabase/migrations/066_abono_delete_gate.sql` — FOUND (101 líneas)
- `test/abono-delete-gate.test.ts` — FOUND (247 líneas)
- `supabase/schema.sql` — FOUND, `abonos_block_delete` × 3, `git diff --numstat` = `30 0`

Commits verificados con `git log`:
- `6aeb7a0` — FOUND
- `38f59db` — FOUND
- `fd5a257` — FOUND
- `bacb89a` — FOUND

Verificaciones ejecutadas:
- `npx supabase db reset` → exit 0, sin `ERROR`
- `npx supabase migration list --local` → `066` aplicada
- re-ejecución del archivo en el contenedor → exit 0
- `npx vitest run test/abono-delete-gate.test.ts` → **7 passed (7)**, 0 skipped
- `./node_modules/.bin/tsc --noEmit` → exit 0 (nunca `npx tsc`)
- ningún comando `db push` ejecutado
- ningún archivo `.tsx` en el diff de este plan

---
*Phase: 14-cierre-de-backlog*
*Completed: 2026-08-04*
