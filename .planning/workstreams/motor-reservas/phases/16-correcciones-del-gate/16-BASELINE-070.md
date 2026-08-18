# 16-BASELINE-070 — Control negativo A/B de los dos gates de servicio

> **Para qué existe.** Tres veces entre v0.26 y v0.27 el fix propuesto estaba mal y se salvó porque
> alguien lo midió antes de aplicarlo (el `BEFORE UPDATE` de la 067, el enfoque de WR-B3, el
> `capacity >= 2` del review de la 069). Este archivo mide el comportamiento **vigente** de
> `services_block_delete` (migr. 065) y `services_block_mode_change` (migr. 068) **antes** de que
> exista la 070, y vuelve a medirlo **después** con el **mismo script**. Sin la mitad de arriba, la
> mitad de abajo no prueba nada.

| | |
|---|---|
| **Fase / plan** | `16-correcciones-del-gate` / `16-01` |
| **Requisitos** | GATE-01 · GATE-02 · GATE-03 |
| **Base** | Postgres **local** (`supabase_db_forjo-app`, PG17), migraciones **001–069** aplicadas |
| **Commit del repo al medir** | `06229f1` |
| **Fecha de la corrida ANTES** | 2026-08-18, **17:25:04 hora AR** (`America/Argentina/Buenos_Aires`) |
| **Fecha de la corrida DESPUÉS** | _(pendiente: la escribe la Task 2)_ |

**Cómo se corre** (idéntico en las dos pasadas):

```bash
docker exec -i supabase_db_forjo-app psql -U postgres -d postgres -v ON_ERROR_STOP=1 < repro-070.sql
```

---

## El script de repro

Tres cosas lo hacen usable como evidencia y no como anécdota:

1. **Guard de medianoche.** Los casos 5 y 6 usan horas fijas de madrugada (`00:00` / `00:30`) para
   representar "hoy a hora **ya pasada**", y el 7 usa `23:59` para "hoy a hora que **todavía no
   llegó**". Fuera de la ventana `[01:00, 23:30]` en hora AR el script mediría lo contrario de lo que
   dice medir, así que aborta con un `RAISE EXCEPTION` antes de tocar nada. Un repro no determinista
   es peor que ninguno.
2. **La evidencia vuelve como FILAS.** Una tabla temporal `_repro(caso, esperado_hoy, medido)` y un
   `SELECT` al cierre. `RAISE NOTICE` no sirve de evidencia: en el SQL Editor de Supabase ni siquiera
   se ve.
3. **Anti-falso-verde doble.** Un `UPDATE`/`DELETE` que no matchea ninguna fila sale **"Success" sin
   que el trigger corra**, así que (a) cada intento reporta su `ROW_COUNT`, y (b) el caso `0` es un
   control positivo que cuenta el fixture: si no dice `8 servicios / 8 turnos`, el resto de la tabla
   no mide nada.

Cada intento va adentro de un bloque `DO ... EXCEPTION WHEN others`, que abre una **subtransacción**:
un rechazo no aborta el resto del script. Y el archivo entero abre con `BEGIN;` y cierra con
`ROLLBACK;` — no deja una sola fila en la base local.

```sql
-- ── Repro A/B de los dos gates de servicio (Phase 16, plan 16-01) ────────────────────────────────
-- Mide el comportamiento de `services_block_mode_change` (068) y `services_block_delete` (065)
-- caso por caso contra el Postgres LOCAL. Se corre IGUAL antes y despues de la 070: es el control
-- negativo del plan. No deja una sola fila (BEGIN ... ROLLBACK).
--
-- Se ejecuta con:
--   docker exec -i supabase_db_forjo-app psql -U postgres -d postgres -v ON_ERROR_STOP=1 < repro-070.sql

BEGIN;

-- ── Guard de medianoche ─────────────────────────────────────────────────────────────────────────
-- Los casos 5 y 6 usan horas fijas de madrugada (00:00 / 00:30) para representar "hoy a hora YA
-- PASADA", y el 7 usa 23:59 para "hoy a hora que todavia no llego". Fuera de la ventana
-- [01:00, 23:30] hora AR el script mediria lo contrario de lo que dice medir, y un repro no
-- determinista es peor que ninguno.
DO $guard$
DECLARE
  v_ar_time time := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::time;
BEGIN
  IF v_ar_time < time '01:00' OR v_ar_time > time '23:30' THEN
    RAISE EXCEPTION 'GUARD DE MEDIANOCHE: son las % en AR. El repro solo es determinista entre 01:00 y 23:30.', v_ar_time;
  END IF;
  RAISE NOTICE 'Guard de medianoche OK. Hora AR de la corrida: %', v_ar_time;
END $guard$;

-- La evidencia vuelve como FILAS, no como NOTICE (un NOTICE no se ve en el SQL Editor de Supabase).
CREATE TEMP TABLE _repro (caso text, esperado_hoy text, medido text) ON COMMIT DROP;

-- ── Fixture ─────────────────────────────────────────────────────────────────────────────────────
-- `businesses.owner_id` es NULLABLE, asi que no hace falta un usuario de `auth`.
INSERT INTO businesses (id, slug, name)
VALUES ('aaaaaaaa-0070-4000-8000-000000000001', 'repro-070-gates', 'Repro 070 (desechable)');

-- Un servicio POR CASO, ya nacido en el modo que el caso necesita: el INSERT no pasa por el gate
-- (es un trigger de UPDATE), asi que sembrar el modo evita que el propio fixture rebote contra el
-- gate que se esta midiendo.
INSERT INTO services (id, business_id, name, duration_minutes, price, active, capacity_mode, capacity) VALUES
  ('aaaaaaaa-0070-4000-8000-000000000101', 'aaaaaaaa-0070-4000-8000-000000000001', 'C1 individual', 30, 100, true, 'individual',            1),
  ('aaaaaaaa-0070-4000-8000-000000000102', 'aaaaaaaa-0070-4000-8000-000000000001', 'C2 grupal',     30, 100, true, 'group_class',           2),
  ('aaaaaaaa-0070-4000-8000-000000000103', 'aaaaaaaa-0070-4000-8000-000000000001', 'C3 grupal',     30, 100, true, 'group_class',           2),
  ('aaaaaaaa-0070-4000-8000-000000000104', 'aaaaaaaa-0070-4000-8000-000000000001', 'C4 grupal',     30, 100, true, 'group_class',           2),
  ('aaaaaaaa-0070-4000-8000-000000000105', 'aaaaaaaa-0070-4000-8000-000000000001', 'C5 grupal',     30, 100, true, 'group_class',           2),
  ('aaaaaaaa-0070-4000-8000-000000000106', 'aaaaaaaa-0070-4000-8000-000000000001', 'C6 individual', 30, 100, true, 'individual',            1),
  ('aaaaaaaa-0070-4000-8000-000000000107', 'aaaaaaaa-0070-4000-8000-000000000001', 'C7 individual', 30, 100, true, 'individual',            1),
  ('aaaaaaaa-0070-4000-8000-000000000108', 'aaaaaaaa-0070-4000-8000-000000000001', 'C8 individual', 30, 100, true, 'individual',            1);

-- Un turno por caso, cada uno en HORA DISTINTA: el EXCLUDE gist `appointments_no_overlap` mira
-- business_id + profesional coalescido + solape de intervalos, y aca el profesional queda NULL para
-- todos, asi que dos turnos vivos solapados del mismo negocio moririan con 23P01 y el script
-- fallaria por el motivo equivocado.
INSERT INTO appointments (business_id, service_id, client_name, date, time, duration_minutes, status) VALUES
  -- FUTUROS (dentro de 7 dias)
  ('aaaaaaaa-0070-4000-8000-000000000001', 'aaaaaaaa-0070-4000-8000-000000000101', 'C1', (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date + 7, '09:00', 30, 'confirmed'),
  ('aaaaaaaa-0070-4000-8000-000000000001', 'aaaaaaaa-0070-4000-8000-000000000102', 'C2', (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date + 7, '10:00', 30, 'confirmed'),
  ('aaaaaaaa-0070-4000-8000-000000000001', 'aaaaaaaa-0070-4000-8000-000000000103', 'C3', (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date + 7, '11:00', 30, 'confirmed'),
  ('aaaaaaaa-0070-4000-8000-000000000001', 'aaaaaaaa-0070-4000-8000-000000000104', 'C4', (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date + 7, '12:00', 30, 'completed'),
  ('aaaaaaaa-0070-4000-8000-000000000001', 'aaaaaaaa-0070-4000-8000-000000000108', 'C8', (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date + 7, '13:00', 30, 'completed'),
  -- HOY a hora YA PASADA (madrugada; el guard garantiza que ya paso)
  ('aaaaaaaa-0070-4000-8000-000000000001', 'aaaaaaaa-0070-4000-8000-000000000105', 'C5', (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,     '00:00', 30, 'confirmed'),
  ('aaaaaaaa-0070-4000-8000-000000000001', 'aaaaaaaa-0070-4000-8000-000000000106', 'C6', (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,     '00:30', 30, 'confirmed'),
  -- HOY a hora que TODAVIA NO LLEGO (frontera que tiene que seguir bloqueando)
  ('aaaaaaaa-0070-4000-8000-000000000001', 'aaaaaaaa-0070-4000-8000-000000000107', 'C7', (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,     '23:59', 30, 'confirmed');

-- Control POSITIVO del fixture: si esto no devuelve 8 servicios y 8 turnos, el resto no mide nada.
INSERT INTO _repro
SELECT '0 - control del fixture',
       '8 servicios / 8 turnos',
       format('%s servicios / %s turnos',
              (SELECT count(*) FROM services     WHERE business_id = 'aaaaaaaa-0070-4000-8000-000000000001'),
              (SELECT count(*) FROM appointments WHERE business_id = 'aaaaaaaa-0070-4000-8000-000000000001'));

-- ── Los ocho intentos ───────────────────────────────────────────────────────────────────────────
-- Cada uno adentro de un bloque con EXCEPTION: eso abre una subtransaccion, asi que un rechazo no
-- aborta el resto del script. `GET DIAGNOSTICS ... ROW_COUNT` es el anti-falso-verde: un UPDATE o
-- DELETE que no matchea ninguna fila sale "Success" SIN que el trigger corra.

-- Caso 1 - GATE-01, direccion segura: individual -> group_class con turno FUTURO vivo.
DO $c1$
DECLARE v_n int;
BEGIN
  UPDATE services SET capacity_mode = 'group_class', capacity = 2 WHERE id = 'aaaaaaaa-0070-4000-8000-000000000101';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO _repro VALUES ('1 - GATE-01 direccion segura (individual -> group_class)', 'RECHAZO', format('PASA (%s fila/s)', v_n));
EXCEPTION WHEN others THEN
  INSERT INTO _repro VALUES ('1 - GATE-01 direccion segura (individual -> group_class)', 'RECHAZO', format('RECHAZO %s / %s', SQLSTATE, SQLERRM));
END $c1$;

-- Caso 2 - GATE-01, direccion peligrosa: group_class -> individual con turno FUTURO vivo (R-1).
DO $c2$
DECLARE v_n int;
BEGIN
  UPDATE services SET capacity_mode = 'individual', capacity = 1 WHERE id = 'aaaaaaaa-0070-4000-8000-000000000102';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO _repro VALUES ('2 - GATE-01 direccion peligrosa (group_class -> individual)', 'RECHAZO', format('PASA (%s fila/s)', v_n));
EXCEPTION WHEN others THEN
  INSERT INTO _repro VALUES ('2 - GATE-01 direccion peligrosa (group_class -> individual)', 'RECHAZO', format('RECHAZO %s / %s', SQLSTATE, SQLERRM));
END $c2$;

-- Caso 3 - GATE-01, cambio de eje de conteo: group_class -> simultaneous_resource.
DO $c3$
DECLARE v_n int;
BEGIN
  UPDATE services SET capacity_mode = 'simultaneous_resource', capacity = 2 WHERE id = 'aaaaaaaa-0070-4000-8000-000000000103';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO _repro VALUES ('3 - GATE-01 cambio de eje (group_class -> simultaneous_resource)', 'RECHAZO', format('PASA (%s fila/s)', v_n));
EXCEPTION WHEN others THEN
  INSERT INTO _repro VALUES ('3 - GATE-01 cambio de eje (group_class -> simultaneous_resource)', 'RECHAZO', format('RECHAZO %s / %s', SQLSTATE, SQLERRM));
END $c3$;

-- Caso 4 - GATE-02 (R-15-A): unico turno FUTURO marcado `completed` deja pasar el cambio de modo.
DO $c4$
DECLARE v_n int;
BEGIN
  UPDATE services SET capacity_mode = 'individual', capacity = 1 WHERE id = 'aaaaaaaa-0070-4000-8000-000000000104';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO _repro VALUES ('4 - GATE-02 completed futuro y el gate de modo (R-15-A)', 'PASA', format('PASA (%s fila/s)', v_n));
EXCEPTION WHEN others THEN
  INSERT INTO _repro VALUES ('4 - GATE-02 completed futuro y el gate de modo (R-15-A)', 'PASA', format('RECHAZO %s / %s', SQLSTATE, SQLERRM));
END $c4$;

-- Caso 5 - GATE-03 en el gate de MODO: unico turno de HOY a hora ya pasada (00:00).
DO $c5$
DECLARE v_n int;
BEGIN
  UPDATE services SET capacity_mode = 'individual', capacity = 1 WHERE id = 'aaaaaaaa-0070-4000-8000-000000000105';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO _repro VALUES ('5 - GATE-03 en el gate de modo (turno de HOY 00:00, ya pasado)', 'RECHAZO', format('PASA (%s fila/s)', v_n));
EXCEPTION WHEN others THEN
  INSERT INTO _repro VALUES ('5 - GATE-03 en el gate de modo (turno de HOY 00:00, ya pasado)', 'RECHAZO', format('RECHAZO %s / %s', SQLSTATE, SQLERRM));
END $c5$;

-- Caso 6 - GATE-03 en el gate de BORRADO: unico turno de HOY a hora ya pasada (00:30).
DO $c6$
DECLARE v_n int;
BEGIN
  DELETE FROM services WHERE id = 'aaaaaaaa-0070-4000-8000-000000000106';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO _repro VALUES ('6 - GATE-03 en el gate de borrado (turno de HOY 00:30, ya pasado)', 'RECHAZO', format('PASA (%s fila/s)', v_n));
EXCEPTION WHEN others THEN
  INSERT INTO _repro VALUES ('6 - GATE-03 en el gate de borrado (turno de HOY 00:30, ya pasado)', 'RECHAZO', format('RECHAZO %s / %s', SQLSTATE, SQLERRM));
END $c6$;

-- Caso 7 - frontera conservada: turno de HOY a las 23:59, que TODAVIA no llego. Tiene que bloquear.
DO $c7$
DECLARE v_n int;
BEGIN
  DELETE FROM services WHERE id = 'aaaaaaaa-0070-4000-8000-000000000107';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO _repro VALUES ('7 - frontera conservada (turno de HOY 23:59, todavia no llego)', 'RECHAZO', format('PASA (%s fila/s)', v_n));
EXCEPTION WHEN others THEN
  INSERT INTO _repro VALUES ('7 - frontera conservada (turno de HOY 23:59, todavia no llego)', 'RECHAZO', format('RECHAZO %s / %s', SQLSTATE, SQLERRM));
END $c7$;

-- Caso 8 - divergencia de estados (D-03): para el BORRADO un `completed` futuro es historia.
DO $c8$
DECLARE v_n int;
BEGIN
  DELETE FROM services WHERE id = 'aaaaaaaa-0070-4000-8000-000000000108';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO _repro VALUES ('8 - divergencia D-03 (completed futuro NO bloquea el borrado)', 'PASA', format('PASA (%s fila/s)', v_n));
EXCEPTION WHEN others THEN
  INSERT INTO _repro VALUES ('8 - divergencia D-03 (completed futuro NO bloquea el borrado)', 'PASA', format('RECHAZO %s / %s', SQLSTATE, SQLERRM));
END $c8$;

\pset format aligned
SELECT * FROM _repro ORDER BY caso;

ROLLBACK;

-- Control de limpieza: despues del ROLLBACK no puede quedar ni el negocio desechable.
SELECT count(*) AS negocios_desechables_que_quedaron FROM businesses WHERE slug = 'repro-070-gates';
```

---

## ANTES (predicado vigente: 065 + 068)

Corrida del **2026-08-18 17:25:04 AR**, con el repo en `06229f1` y **sin un solo archivo de
`supabase/` tocado** — esa es la condición que hace de esto un control negativo y no una descripción
del mundo ya modificado.

Estado instalado en el momento de medir (verificación **por instalación**, sobre `pg_proc.prosrc`):

```
$ docker exec supabase_db_forjo-app psql -U postgres -d postgres -tAc \
    "select proname, position('v_now_time' in prosrc)>0, position('a.\"date\" >= v_today' in prosrc)>0 \
       from pg_proc where proname in ('services_block_delete','services_block_mode_change');"
services_block_mode_change|f|t
services_block_delete|f|t
```

Las dos funciones traen el predicado viejo (`a."date" >= v_today`) y ninguna conoce `v_now_time`.

### Salida literal

```
BEGIN
NOTICE:  Guard de medianoche OK. Hora AR de la corrida: 17:25:04.83482
DO
CREATE TABLE
INSERT 0 1
INSERT 0 8
INSERT 0 8
INSERT 0 1
DO
DO
DO
DO
DO
DO
DO
DO
Output format is aligned.
                               caso                                |      esperado_hoy      |                        medido
-------------------------------------------------------------------+------------------------+------------------------------------------------------
 0 - control del fixture                                           | 8 servicios / 8 turnos | 8 servicios / 8 turnos
 1 - GATE-01 direccion segura (individual -> group_class)          | RECHAZO                | RECHAZO P0001 / service_mode_has_future_appointments
 2 - GATE-01 direccion peligrosa (group_class -> individual)       | RECHAZO                | RECHAZO P0001 / service_mode_has_future_appointments
 3 - GATE-01 cambio de eje (group_class -> simultaneous_resource)  | RECHAZO                | RECHAZO P0001 / service_mode_has_future_appointments
 4 - GATE-02 completed futuro y el gate de modo (R-15-A)           | PASA                   | PASA (1 fila/s)
 5 - GATE-03 en el gate de modo (turno de HOY 00:00, ya pasado)    | RECHAZO                | RECHAZO P0001 / service_mode_has_future_appointments
 6 - GATE-03 en el gate de borrado (turno de HOY 00:30, ya pasado) | RECHAZO                | RECHAZO P0001 / service_has_future_appointments
 7 - frontera conservada (turno de HOY 23:59, todavia no llego)    | RECHAZO                | RECHAZO P0001 / service_has_future_appointments
 8 - divergencia D-03 (completed futuro NO bloquea el borrado)     | PASA                   | PASA (1 fila/s)
(9 rows)

ROLLBACK
 negocios_desechables_que_quedaron
-----------------------------------
                                 0
(1 row)
```

### Los ocho casos, medidos

| Caso | Fixture | Intento | Esperado HOY | **Medido** | ¿Coincide? |
|---|---|---|---|---|---|
| **1** — GATE-01, dirección segura | `individual`/1 + turno FUTURO `confirmed` 09:00 | `capacity_mode='group_class', capacity=2` | RECHAZO `P0001 / service_mode_has_future_appointments` | `RECHAZO P0001 / service_mode_has_future_appointments` | ✅ |
| **2** — GATE-01, dirección peligrosa hacia `individual` | `group_class`/2 + turno FUTURO `confirmed` 10:00 | `capacity_mode='individual', capacity=1` | RECHAZO | `RECHAZO P0001 / service_mode_has_future_appointments` | ✅ |
| **3** — GATE-01, cambio de eje de conteo | `group_class`/2 + turno FUTURO `confirmed` 11:00 | `capacity_mode='simultaneous_resource', capacity=2` | RECHAZO | `RECHAZO P0001 / service_mode_has_future_appointments` | ✅ |
| **4** — GATE-02 (R-15-A) | `group_class`/2 + ÚNICO turno FUTURO `completed` 12:00 | `capacity_mode='individual', capacity=1` | PASA (**el agujero**) | `PASA (1 fila/s)` | ✅ |
| **5** — GATE-03 en el gate de modo | `group_class`/2 + ÚNICO turno de HOY `confirmed` `00:00` | `capacity_mode='individual', capacity=1` | RECHAZO (**el bug**) | `RECHAZO P0001 / service_mode_has_future_appointments` | ✅ |
| **6** — GATE-03 en el gate de borrado | `individual`/1 + ÚNICO turno de HOY `confirmed` `00:30` | `DELETE FROM services` | RECHAZO `P0001 / service_has_future_appointments` | `RECHAZO P0001 / service_has_future_appointments` | ✅ |
| **7** — frontera conservada | `individual`/1 + turno de HOY `confirmed` `23:59` | `DELETE` | RECHAZO | `RECHAZO P0001 / service_has_future_appointments` | ✅ |
| **8** — divergencia de estados (D-03) | `individual`/1 + ÚNICO turno FUTURO `completed` 13:00 | `DELETE` | PASA | `PASA (1 fila/s)` | ✅ |

**Los ocho coinciden con la predicción del plan.** La premisa de la fase se sostiene: los casos 1, 5 y
6 rechazan de más y el 4 pasa de más, que es exactamente lo que la 070 viene a corregir.

Y las dos lecturas que **no** son el objetivo del cambio pero que importan tanto como él: el caso 2 y
el 3 —las dos direcciones peligrosas, donde vive **R-1**— rechazan hoy, y el punto de la sección
