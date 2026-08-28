-- 075 — El consultorio de una franja tiene que ser del MISMO negocio que la franja
--       (motor-reservas / Phase 19 — cierre de T-19-36 / WR-04 del `19-SECURITY.md`, v0.28).
--
-- ── Contexto ────────────────────────────────────────────────────────────────────────────────────
--   El audit de seguridad de la Phase 19 (`19-SECURITY.md` §4.1) encontró que `save_agenda_blocks`
--   (migr. 074) escribe `time_blocks.location_id` con el valor que viene del payload y **nadie lo
--   valida**: ni la función (que sólo garantiza que la FILA sea del negocio que llama), ni la RLS
--   (que mira el `business_id` de la fila, no el del consultorio referenciado), ni la FK simple
--   `time_blocks_location_id_fkey` (que garantiza EXISTENCIA, no PERTENENCIA). Un dueño autenticado
--   puede mandar el `location_id` de otro negocio desde la consola del navegador y la base lo acepta.
--
--   CORRECCIÓN DE ALCANCE de la cabecera de la 074 — se escribe acá porque **la 074 no se toca: ya
--   está aplicada en producción** (verificada por humano el 2026-08-26). Donde la 074 dice que las
--   FK compuestas de la 073 cubren la pertenencia al tenant del payload, hay que leer: cubren la
--   FRANJA y el SERVICIO de `time_block_services` (`tbs_block_same_tenant` / `tbs_service_same_tenant`),
--   y **no** cubrían el CONSULTORIO de `time_blocks`. Esta migración cierra ese hueco con el mismo
--   molde declarativo: UNIQUE compuesto en el padre + FK compuesta en el hijo.
--
-- ── Qué hace ────────────────────────────────────────────────────────────────────────────────────
--   1. Guard de backfill que ABORTA si ya hay franjas que violan la invariante (ver abajo).
--   2. `locations_id_business_uq`: UNIQUE (id, business_id) sobre `locations`.
--   3. Reemplaza `time_blocks_location_id_fkey` (FK simple) por `tb_location_same_tenant`
--      (FK compuesta sobre el par (location_id, business_id)).
--
-- ── POR QUÉ LA LISTA DE COLUMNAS DEL `ON DELETE` ES OBLIGATORIA ─────────────────────────────────
--   El SQL propuesto en `19-SECURITY.md` §4.1 usa `ON DELETE SET NULL` **sin** lista de columnas.
--   Medido contra este mismo motor (PG 17.6, contenedor local, dentro de una transacción con
--   ROLLBACK) el 2026-08-28:
--
--     -- con `ON DELETE SET NULL` a secas, y después DELETE FROM locations WHERE id = '<locA>':
--     business_id_quedo_null | location_quedo_null
--     -----------------------+---------------------
--     t                      | t
--
--   O sea: borrar un consultorio nulea **las dos** columnas de la FK y la franja pierde su
--   `business_id`. Y como `time_blocks.business_id` es **NULLABLE** (medido: `is_nullable = YES`),
--   **no hay error**: el borrado de consultorios sigue "funcionando" y el daño es invisible. Una
--   franja sin `business_id` sale de la RLS de su dueño (que filtra por esa columna), no aparece en
--   ninguna pantalla del panel, no se puede recuperar desde la app, y queda comodín para siempre
--   (RA-02 de la Phase 18).
--
--   Con la lista de columnas —`ON DELETE SET NULL (location_id)`, soportada desde PG 15— sólo se
--   nulea el consultorio y el `business_id` queda INTACTO. Medido: tras borrar el consultorio,
--   `location_id IS NULL` y `business_id IS NOT NULL`. El borrado de consultorios de
--   `settings-client.tsx` sigue funcionando igual que hoy.
--
-- ── RESIDUO CONOCIDO: MATCH SIMPLE ──────────────────────────────────────────────────────────────
--   Una franja con `business_id` NULL y `location_id` seteado **NO** es validada por esta FK: con
--   MATCH SIMPLE (el default), si alguna de las columnas de la clave es nula la FK no se evalúa.
--   Es exactamente el mismo residuo que la 073 ya documentó para `time_blocks.business_id` nullable,
--   y REFUERZA —no contradice— la decisión aceptada RA-02: una franja huérfana nunca recibe mapeo y
--   queda comodín para siempre, que es su comportamiento de hoy. No se agrega ningún chequeo extra
--   para taparlo: hacerlo sería inventar una regla que el resto del esquema no sostiene.
--
-- ── RUNBOOK DE PRODUCCIÓN (esta migración NO se aplicó allá) ────────────────────────────────────
--   (a) PRE-FLIGHT — correr primero esto en el SQL editor de producción y confirmar que devuelve 0:
--
--         SELECT count(*) FROM "public"."time_blocks" tb
--          WHERE tb."location_id" IS NOT NULL
--            AND tb."business_id" IS NOT NULL
--            AND NOT EXISTS (SELECT 1 FROM "public"."locations" l
--                             WHERE l."id" = tb."location_id" AND l."business_id" = tb."business_id");
--
--       (En local devuelve 0. El guard de abajo lo vuelve a correr y aborta si no lo es, así que el
--       pre-flight es para SABER antes, no para autorizar.)
--
--   (b) Pegar y ejecutar este archivo **COMPLETO, de una sola vez** — nunca statement por statement.
--       El `DROP` + `ADD` van dentro de un BEGIN/COMMIT explícito: sin la transacción, cada statement
--       autocommitea y un `ADD CONSTRAINT` que falla deja `time_blocks` **sin ninguna FK a
--       `locations`**. Correrlo a mano en pedazos reintroduce exactamente ese riesgo.
--
--   (c) VERIFICACIÓN POSTERIOR:
--
--         SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--          WHERE conname IN ('tb_location_same_tenant', 'locations_id_business_uq',
--                            'time_blocks_location_id_fkey');
--
--       Esperado: DOS filas. `locations_id_business_uq :: UNIQUE (id, business_id)` y
--       `tb_location_same_tenant :: FOREIGN KEY (location_id, business_id) REFERENCES
--        locations(id, business_id) ON DELETE SET NULL (location_id)`.
--       `time_blocks_location_id_fkey` NO debe aparecer: se reemplazó.
--
--   (d) RECIÉN DESPUÉS de aplicarla, espejar `supabase/schema.sql` A MANO y de forma QUIRÚRGICA
--       —nunca con `db dump` (decisión del repo desde la Phase 06)—: el UNIQUE nuevo va en el bloque
--       de constraints de `locations` (~`schema.sql:1620`) y la línea de `time_blocks_location_id_fkey`
--       (~`schema.sql:2164`) se reemplaza por la FK compuesta. Y pasar T-19-36 a CLOSED en
--       `19-SECURITY.md`. Antes de aplicarla, `schema.sql` NO se toca: es el espejo del estado REAL
--       de producción, y reflejar una migración no aplicada lo convierte en mentira.
--
--   Última migración aplicada en prod: 074.
--
--   BONUS: el `NOTIFY pgrst, 'reload schema';` del final cierra de paso el Paso 4 sin confirmar de
--   **T-19-32** (el reload del schema cache de PostgREST tras el DDL de la 074). Es idempotente:
--   correrlo de más no rompe nada.
--
-- Idempotente (molde 065): `DROP ... IF EXISTS` + `ADD` guardado por `pg_constraint`. Sin datos que
-- migrar y sin downtime.

BEGIN;

-- ── 0. Guard de backfill: ABORTA si hay filas que ya violan la invariante ────────────────────────
-- Aborta, no avisa: esta migración se aplica A MANO y una "consulta previa recomendada" se saltea.
-- Además el mensaje de dominio trae el count exacto y dice qué hacer, mientras que dejar fallar al
-- `ALTER TABLE` da un error crudo de Postgres sin ningún número.
--
-- La forma es `NOT EXISTS` sobre el PAR, acotada a las filas con las dos columnas no-nulas: coincide
-- EXACTAMENTE con lo que la FK va a validar. La forma con `JOIN ... WHERE l.business_id <> tb.business_id`
-- tiene dos agujeros: `<>` contra un nulo devuelve NULL (la fila no se cuenta) y el `JOIN` descarta
-- las franjas cuyo `location_id` no existe en `locations`.
DO $$
DECLARE
  "v_huerfanas" bigint;
BEGIN
  SELECT count(*) INTO "v_huerfanas"
    FROM "public"."time_blocks" tb
   WHERE tb."location_id" IS NOT NULL
     AND tb."business_id" IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM "public"."locations" l
        WHERE l."id" = tb."location_id" AND l."business_id" = tb."business_id"
     );

  IF "v_huerfanas" > 0 THEN
    RAISE EXCEPTION '075: hay % franja(s) de time_blocks cuyo location_id NO pertenece a su mismo business_id. La FK compuesta no se puede crear sobre esos datos. Revisalas A MANO antes de reintentar (poner location_id en NULL, o apuntarlo a un consultorio del negocio correcto). Para listarlas: SELECT tb.id, tb.business_id, tb.location_id FROM public.time_blocks tb WHERE tb.location_id IS NOT NULL AND tb.business_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.locations l WHERE l.id = tb.location_id AND l.business_id = tb.business_id);', "v_huerfanas"
      USING ERRCODE = 'P0001';
  END IF;
END
$$;

-- ── 1. UNIQUE compuesto en el padre ──────────────────────────────────────────────────────────────
-- Requisito de Postgres para poder referenciar el par (id, business_id): la FK compuesta necesita un
-- índice único sobre las columnas referenciadas. Redundante con la PK en cuanto a unicidad — su
-- única razón de existir es habilitar la FK compuesta. Misma frase, mismo motivo y mismo molde que
-- `services_id_business_uq` / `time_blocks_id_business_uq` de la 073.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM "pg_constraint"
     WHERE "conname" = 'locations_id_business_uq'
       AND "conrelid" = '"public"."locations"'::"regclass"
  ) THEN
    ALTER TABLE "public"."locations"
      ADD CONSTRAINT "locations_id_business_uq" UNIQUE ("id", "business_id");
  END IF;
END
$$;

-- ── 2. La FK simple se reemplaza por la compuesta ────────────────────────────────────────────────
-- El nombre `tb_location_same_tenant` sigue deliberadamente la familia `tbs_block_same_tenant` /
-- `tbs_service_same_tenant` que la 073 inauguró para esta clase de garantía.
--
-- Ningún consumidor depende del nombre ni de la forma de la FK vieja: las cuatro lecturas de
-- `time_blocks` en `app/` + `lib/` usan `select('*')` y CERO embeds de PostgREST hacia `locations`
-- (los dos embeds `locations(name, address)` que existen salen de `appointments`, cuya FK no se toca).
ALTER TABLE "public"."time_blocks"
  DROP CONSTRAINT IF EXISTS "time_blocks_location_id_fkey";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM "pg_constraint"
     WHERE "conname" = 'tb_location_same_tenant'
       AND "conrelid" = '"public"."time_blocks"'::"regclass"
  ) THEN
    ALTER TABLE "public"."time_blocks"
      ADD CONSTRAINT "tb_location_same_tenant"
      FOREIGN KEY ("location_id", "business_id")
      REFERENCES "public"."locations" ("id", "business_id")
      ON DELETE SET NULL ("location_id");
  END IF;
END
$$;

COMMIT;

-- ── Recargar el schema cache de PostgREST (obligatorio tras DDL) ─────────────────────────────────
-- Cierra de paso el Paso 4 sin confirmar de T-19-32.
NOTIFY pgrst, 'reload schema';
