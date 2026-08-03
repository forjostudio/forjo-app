---
phase: 13-borrado-de-servicio-preservando-historial
plan: 01
subsystem: database
tags: [migration, postgres, trigger, security-definer, multi-tenant, snapshot, referential-integrity]
status: complete

dependency_graph:
  requires: []
  provides:
    - "appointments.service_name / appointments.service_price (snapshot inmutable del servicio)"
    - "abonos.service_name (snapshot del nombre del servicio)"
    - "appointments_service_id_fkey ON DELETE SET NULL"
    - "abonos_service_id_fkey ON DELETE SET NULL (antes RESTRICT)"
    - "public.appointments_service_snapshot() + appointments_service_snapshot_trg"
    - "public.abonos_service_snapshot() + abonos_service_snapshot_trg"
    - "public.services_block_delete() + services_block_delete_trg"
    - "codigos de dominio: service_has_future_appointments / service_has_active_abono (P0001)"
  affects:
    - "13-02 (read-paths de historial: COALESCE(snapshot, services.…))"
    - "13-03 (modal de borrado: mapea los dos messages del RAISE)"
    - "13-04 (tests de integracion del gate y del snapshot)"
    - "13-05 (aplicacion a prod, coordinada a mano con el deploy)"

tech_stack:
  added: []
  patterns:
    - "Trigger BEFORE INSERT como write-path invisible: el snapshot se escribe sin tocar un solo archivo de lib/ ni de app/"
    - "Gate de borrado como trigger BEFORE DELETE en la misma transaccion del DELETE (sin ventana TOCTOU)"
    - "Guard de cascada por ausencia del padre: el negocio ya no existe cuando cascadea a services"
    - "Filtro explicito por business_id dentro de SECURITY DEFINER (la RLS no aplica ahi)"
    - "Backfill guardado por IS NULL para volverlo re-corrible sin pisar snapshots ya escritos"

key_files:
  created:
    - supabase/migrations/065_service_snapshot_and_delete_gate.sql
  modified:
    - supabase/schema.sql

decisions:
  - "Columnas NULLABLE sin DEFAULT (divergencia consciente del molde 055/061/062): un DEFAULT '' ganaria el COALESCE del fallback de D-05 y lo romperia"
  - "El snapshot se sobrescribe SIEMPRE, nunca se respeta el valor entrante: el cliente no puede dictar su propia facturacion (T-13-02)"
  - "Sin match el snapshot queda NULL y NO se hace RAISE: fail-safe, el historial cae al join de fallback"
  - "IS DISTINCT FROM 'cancelled' y no <>: appointments.status es NULLABLE y con <> esas filas ABREN el gate"
  - "Dos messages distintos sobre el mismo ERRCODE P0001, para que el modal de 13-03 pueda distinguir abono de turnos"
  - "En schema.sql los cuerpos de las funciones van con comentarios comprimidos, para respetar el techo de diff quirurgico"

metrics:
  duration: "~35 min"
  completed: 2026-08-03
  tasks: 3
  commits: 2
  files_created: 1
  files_modified: 1
---

# Phase 13 Plan 01: Migracion 065 — snapshot de servicio, FK desacoplado y gate de borrado — Summary

Migracion 065 que desacopla el historial de `services` por snapshot inmutable (trigger `BEFORE INSERT`), pasa los dos FKs relevantes a `ON DELETE SET NULL` y mete el gate de borrado en un trigger `BEFORE DELETE`, validada contra el Supabase local (PG17) con `supabase db reset`.

## Que se construyo

Una sola migracion de base, sin una linea de TypeScript. Es el espinazo de la fase: los planes 13-02 (read-paths) y 13-03 (modal) no tienen nada que leer ni que mapear sin esto.

| Seccion | Contenido |
|---------|-----------|
| 1 | 3 columnas de snapshot NULLABLE: `appointments.service_name`, `appointments.service_price`, `abonos.service_name` |
| 2 | Backfill idempotente de lo historico, guardado por `IS NULL` |
| 3 | `appointments_service_id_fkey` (NO ACTION → SET NULL) y `abonos_service_id_fkey` (RESTRICT → SET NULL) |
| 4 | `appointments_service_snapshot()` + trigger `BEFORE INSERT` |
| 5 | `abonos_service_snapshot()` + trigger `BEFORE INSERT` |
| 6 | `services_block_delete()` + trigger `BEFORE DELETE` con guard de cascada |
| 7 | `NOTIFY pgrst, 'reload schema';` |

Los otros dos FKs a `services` quedaron intactos: `professional_services_service_id_fkey` sigue en CASCADE (`confdeltype = 'c'`) y `professionals_service_id_fkey` sigue en SET NULL desde la migr. 043.

## Tareas completadas

| Tarea | Nombre | Commit | Archivos |
|-------|--------|--------|----------|
| 1 | Escribir la migracion 065 | `10a5490` | `supabase/migrations/065_service_snapshot_and_delete_gate.sql` |
| 2 | Validar contra el Supabase local con `db reset` | (sin cambios en disco) | — |
| 3 | Reflejar la 065 en `supabase/schema.sql` | `47febc2` | `supabase/schema.sql` |

La Tarea 2 no produce commit propio: es una tarea de validacion pura, no modifica ningun archivo del repo. Su evidencia se registra abajo.

## Comprobaciones de humo (Tarea 2)

### `npx supabase db reset` — dos corridas

Primera corrida: exit code 0, `Applying migration 065_service_snapshot_and_delete_gate.sql...`, sin `ERROR` en la salida. Los unicos `NOTICE` de la 065 son los tres `DROP TRIGGER IF EXISTS` sobre triggers todavia inexistentes (esperado en una DB de cero):

```
Applying migration 065_service_snapshot_and_delete_gate.sql...
NOTICE (00000): trigger "appointments_service_snapshot_trg" for relation "public.appointments" does not exist, skipping
NOTICE (00000): trigger "abonos_service_snapshot_trg" for relation "public.abonos" does not exist, skipping
NOTICE (00000): trigger "services_block_delete_trg" for relation "public.services" does not exist, skipping
Seeding data from supabase/seed.sql...
Finished supabase db reset on branch main.
{"target":"local","version":"","message":"Reset local database."}
EXIT=0
```

Segunda corrida: exit code 0, sin `ERROR`. Reproducible.

### (a) `\d appointments` — columnas nuevas

```
 abono_id         | uuid                     |           |          |
 service_name     | text                     |           |          |
 service_price    | numeric(10,2)            |           |          |
```

Y en `information_schema.columns` las tres columnas nuevas figuran `is_nullable = YES`, sin DEFAULT:

```
  column_name  | data_type | is_nullable
---------------+-----------+-------------
 service_name  | text      | YES          (abonos)
 service_name  | text      | YES          (appointments)
 service_price | numeric   | YES          (appointments)
```

### (b) `pg_constraint.confdeltype` — los cuatro FKs a `services`

```
                conname                | confdeltype
---------------------------------------+-------------
 abonos_service_id_fkey                | n            <- SET NULL (antes RESTRICT)
 appointments_service_id_fkey          | n            <- SET NULL (antes NO ACTION)
 professional_services_service_id_fkey | c            <- CASCADE, INTACTO
 professionals_service_id_fkey         | n            <- SET NULL de la 043, INTACTO
(4 rows)
```

### (c) `pg_trigger` — los tres triggers nuevos

```
    tabla     |              tgname
--------------+-----------------------------------
 appointments | appointment_spaces_cleanup_trg     (preexistente)
 appointments | appointment_spaces_populate_trg    (preexistente)
 appointments | appointments_service_snapshot_trg  <- nuevo
 services     | services_block_delete_trg          <- nuevo
 abonos       | abonos_service_snapshot_trg        <- nuevo
(5 rows)
```

### (d) Idempotencia real: re-correr la 065 sobre si misma

`db reset` replaya desde cero, asi que no prueba que la migracion sea no-op sobre una DB que ya la tiene. Se ejecuto la 065 completa una segunda vez contra la DB ya migrada, con `ON_ERROR_STOP=1`:

```
ALTER TABLE / UPDATE 0 / UPDATE 0 / ALTER TABLE / DO / ALTER TABLE / DO
CREATE FUNCTION / ALTER FUNCTION / DROP TRIGGER / CREATE TRIGGER   (x3)
NOTIFY
EXIT=0
```

Los dos `UPDATE 0` son la prueba directa de que el guard `IS NULL` funciona: el backfill no vuelve a tocar ninguna fila que ya tenga snapshot (respeta D-03).

### (e) Comprobaciones funcionales (agregadas, no pedidas por el plan)

Los greps y el `db reset` prueban que la migracion aplica, no que el mecanismo se comporte. Se corrieron siete escenarios contra la DB local en transacciones revertidas (residuo verificado en 0 despues):

| # | Escenario | Resultado |
|---|-----------|-----------|
| 1 | INSERT de turno con `service_name='HACKEADO'`, `service_price=1.00` | El trigger sobrescribe: `Corte A` / `5000.00` (T-13-02 cerrado en vivo) |
| 2 | INSERT con `service_id` de OTRO tenant | Snapshot en NULL, sin RAISE (T-13-01, fail-safe) |
| 3 | DELETE de servicio con solo turnos pasados | `DELETE 1`; el turno sobrevive con `service_id` NULL y snapshot intacto (HIST-01 + HIST-03) |
| 4 | DELETE con turno futuro de `status = NULL` | `ERROR: service_has_future_appointments` — prueba en vivo de por que `IS DISTINCT FROM` y no `<>` |
| 5 | DELETE con abono `status='active'` | `ERROR: service_has_active_abono` |
| 6 | DELETE con turno futuro pero CANCELADO | `DELETE 1` — no bloquea (D-08) |
| 7 | `DELETE FROM businesses` con turno futuro vivo | `DELETE 1` — el guard de cascada deja pasar (T-13-07) |

El snapshot de `abonos` tambien quedo verificado: insertar un abono devuelve `service_name = 'Corte C'` sin que el caller lo pida.

## Deviaciones del plan

Ninguna deviacion de comportamiento. Dos ajustes de forma, ambos para cumplir criterios de aceptacion del propio plan:

**1. [Forma] La cabecera no repite el literal `NOTIFY pgrst, 'reload schema';` ni `DROP TRIGGER IF EXISTS`.**
El plan pide documentar ambas cosas en la cabecera, pero los criterios de aceptacion exigen `grep -c` exactamente 1 y exactamente 3 respectivamente. Se redacto la prosa de la cabecera evitando los literales ("el NOTIFY de recarga del schema cache de PostgREST (seccion 7)", "un `DROP TRIGGER ... IF EXISTS`"): el contenido documental esta, los conteos dan.

**2. [Forma] En `supabase/schema.sql` los cuerpos de las tres funciones van con comentarios comprimidos.**
Con los comentarios completos de la migracion el diff daba 108 lineas, por encima del techo de 90 que fija el criterio de aceptacion del Task 3. Se comprimieron los comentarios y los `EXISTS` a una forma mas densa, semanticamente identica; el diff quedo en 86 lineas. El razonamiento largo vive en la migracion, que es la fuente de verdad. Los tres cuerpos comprimidos se verificaron parseables ejecutandolos contra PG17 en una transaccion revertida (3x `CREATE FUNCTION`, exit 0).

## Verificacion

| # | Criterio del plan | Resultado |
|---|-------------------|-----------|
| 1 | `npx supabase db reset` termina 0 dos veces | OK (dos corridas, sin `ERROR`) |
| 2 | `confdeltype = 'n'` en los dos FKs tocados | OK (ver (b)) |
| 3 | Los tres triggers existen en `pg_trigger` | OK (ver (c)) |
| 4 | `schema.sql` con diff acotado | OK: 86 lineas (83 insertions, 3 deletions), techo 90 |
| 5 | Ninguna migracion anterior modificada | OK: `git diff --name-only supabase/migrations/` vacio; el 065 es el unico archivo nuevo |

Criterios de aceptacion de la Tarea 1 (todos verificados por grep):

| Patron | Esperado | Real |
|--------|----------|------|
| `ADD COLUMN IF NOT EXISTS` | 3 | 3 |
| `ON DELETE SET NULL` | 2 | 2 |
| `SECURITY DEFINER SET search_path = public` | 3 | 3 |
| `DROP TRIGGER IF EXISTS` | 3 | 3 |
| `DROP CONSTRAINT IF EXISTS` | 2 | 2 |
| `IS DISTINCT FROM` | >= 1 | 3 |
| `RETURN OLD` | >= 2 | 3 |
| `America/Argentina/Buenos_Aires` | >= 1 | 1 |
| `NOTIFY pgrst, 'reload schema';` | 1 | 1 |
| `service_has_future_appointments\|service_has_active_abono` | >= 2 | 2 |
| `FROM businesses` | >= 1 | 2 |
| `^\s*ALTER TABLE .*"professional_services"` | 0 | 0 |

Criterios de la Tarea 3: `"service_name" "text"` = 2, `"service_price" numeric(10,2)` = 1, `ON DELETE RESTRICT` pasa de **1 a 0**, simbolos nuevos = 9 (>= 6), los dos `ADD CONSTRAINT` terminan en `ON DELETE SET NULL`.

## Regresion de la suite

`npx vitest run` con la 065 aplicada: **788 passed, 1 skipped, 4 failed (63 archivos)**.

Las 4 fallas NO las causa esta migracion. Se verifico moviendo la 065 fuera de `supabase/migrations/`, corriendo `db reset` y repitiendo exactamente el mismo combo de archivos: **falla identico sin la 065**. Dos son timeouts de 5000ms que pasan al re-correr (flakes), y la tercera es `abono-generation.test.ts > 8` (`expect(count).toBe(0)` recibe 6 o 16, no deterministico) que solo se manifiesta cuando el archivo corre en paralelo con `abono-create` y `abono-cron` — aislado pasa 11/11 con la 065 aplicada. Es contaminacion entre archivos de test, preexistente y fuera del alcance de este plan.

Lo relevante para esta fase: **el guard de cascada funciona**. `teardownOneTenant` borra `businesses` y cascadea a `services`; si el guard estuviera mal, los 63 archivos de test se caerian en el cleanup. Corren igual que antes.

## Notas para la proxima fase

- **La 065 NO esta en produccion.** La ultima migracion aplicada en prod sigue siendo la **064**. La 065 se aplica **a mano**, coordinada con el deploy, mas el `NOTIFY pgrst, 'reload schema';` — eso es el plan **13-05**, no este.
- **13-02** ya puede leer `service_name` / `service_price` con `COALESCE(snapshot, services.…)` (D-05). Con el backfill el snapshot esta siempre poblado en local; el join queda de red de seguridad.
- **13-03** mapea los dos messages del `RAISE` (`service_has_future_appointments`, `service_has_active_abono`, ambos `P0001`) a los dos estados del modal. Molde: el mapeo `23505`/`23P01` → `slot_taken` de `lib/booking-core.ts`.
- **13-04** tiene tres cosas que asertar que aca solo se probaron a mano: que el servicio efectivamente DESAPARECE tras un borrado permitido (T-13-06: `RETURN OLD`, no NULL), que un `service_id` cross-tenant deja el snapshot en NULL, y que el snapshot ignora el valor entrante del cliente.
- **T-13-03 queda en `accept`** y anotado para secure-phase: no hay trigger de `BEFORE UPDATE` sobre el snapshot. Un dueño puede editar `service_name`/`service_price` de sus propios turnos via PostgREST. Sin cruce entre tenants, y un `BEFORE UPDATE` mal escrito romperia el `service_id := NULL` que escribe la accion referencial.

## Threat Flags

Ninguna superficie de seguridad nueva fuera del `<threat_model>` del plan. Las tres funciones `SECURITY DEFINER` estan cubiertas por T-13-01, T-13-04 y T-13-08, y las tres llevan filtro explicito por `business_id` mas `SET search_path = public`.

## Self-Check: PASSED

- `supabase/migrations/065_service_snapshot_and_delete_gate.sql` — FOUND
- `supabase/schema.sql` — FOUND (modificado)
- Commit `10a5490` — FOUND
- Commit `47febc2` — FOUND
