-- 062 — Cupo por SOLAPE (recurso simultáneo) vs cupo por HORA EXACTA (clase grupal), por servicio.
--
-- Contexto (motor-reservas / Phase 12 — CUPO-01..CUPO-05, v0.26):
--   Hoy "cupo N" significa UNA sola cosa: N inscriptos que arrancan a la MISMA hora exacta (clase
--   grupal, 041: cupo en `time_blocks.capacity` + count por date+time exacto). Eso NO modela un
--   RECURSO SIMULTÁNEO: una kinesióloga con 2 camillas atiende turnos ESCALONADOS (16:00 y 16:15)
--   que se solapan en el tiempo pero arrancan en instantes distintos. Con el motor vigente esos dos
--   turnos toman advisory locks DISTINTOS (el lock es hash(business_id+date+time), 058:82-83) y el
--   conteo mira `date+time` exacto sin tocar nunca `duration_minutes` → el 3er turno escalonado se
--   cuela y hay SOBRECUPO (bug reproducido en el UAT de la fase 07).
--
--   La corrección: cada SERVICIO declara qué significa su cupo (`capacity_mode`), y el RPC atómico
--   bifurca por modo:
--     - 'group_class'          = comportamiento ACTUAL, byte-idéntico: cupo de `time_blocks.capacity`
--                                contado por hora de inicio exacta. Es el DEFAULT ⇒ cero regresión.
--     - 'simultaneous_resource'= cupo de `services.capacity` contado por SOLAPE de intervalos
--                                (`tsrange &&`) entre turnos del MISMO service_id (D-02/D-03), con el
--                                advisory lock re-granularizado a hash(business_id+service_id+date)
--                                para que las reservas ESCALONADAS de ese servicio-día serialicen (D-06).
--
-- Qué hace:
--   1. services.capacity_mode text NOT NULL DEFAULT 'group_class' — enum extensible vía CHECK (D-01,
--      elegido sobre boolean para sumar modos futuros sin re-migrar). El DEFAULT cubre TODAS las filas
--      existentes (incluidas las CANCHAS, que usan `services` desde la 043 — D-14) ⇒ NO hay backfill
--      y ningún negocio cambia de semántica (CUPO-05).
--   2. services.capacity smallint NOT NULL DEFAULT 1 — el cupo N del recurso simultáneo (D-02). Lo lee
--      SOLO la rama simultánea; la clase grupal sigue leyendo `time_blocks.capacity` INTACTO (el cupo
--      del grupal es de LA CLASE/slot: yoga 16:00=10, 18:00=15; no se puede mover al servicio).
--   3. Los 2 CHECK fail-closed a nivel DB (ASVS V5): el panel escribe estas columnas con anon+RLS vía
--      PostgREST, así que el enum y el `capacity >= 1` se validan en la base, no solo en la UI.
--   4. public_services expone `capacity_mode` (columna al FINAL del SELECT): el selector público
--      necesita saber el modo para ocultar "Cualquiera" en servicios simultáneos (D-13). Es un flag de
--      PRESENTACIÓN (enum acotado, no PII) ⇒ está bien que viaje a anon.
--   5. book_slot_atomic REDEFINIDO in-place, mode-aware (ver el bloque 5 más abajo).
--
-- Qué NO hace (invariantes del proyecto):
--   - NO expone `capacity` (el N) en la vista pública: mantener "cuántos lugares quedan" server-side
--     es el no-leak ya establecido (D-06 de Phase 2 / D-12). El público solo ve libre/lleno.
--   - NO cambia la firma del RPC: mismos 14 params + el RETURNS TABLE (id, cancel_token) BYTE-idénticos
--     a 041/042/058 → CREATE OR REPLACE puro, SIN DROP FUNCTION (cambiar params o el RETURNS obliga a
--     recrearla y rompería los 4 callers que entran por createAppointmentCore).
--   - NO toca `time_blocks`, `appointments`, el índice único 011, el EXCLUDE 013, ni ninguna policy RLS.
--   - NO se aplica vía push remoto. La ÚNICA validación es `supabase db reset` local (PG17), que
--     replaya el baseline numerado + 040..062 en orden. Prod se aplica A MANO coordinado con el
--     deploy + `NOTIFY pgrst, 'reload schema';`. La última migración en prod = 061. Tras aplicar,
--     regenerar `supabase/schema.sql` (patrón del repo, igual que 042/055/058/061).

-- ── 1. Columnas: NOT NULL DEFAULT (cubren las filas existentes sin backfill, D-01/D-02/D-14) ──────
ALTER TABLE "public"."services"
  ADD COLUMN IF NOT EXISTS "capacity_mode" "text" NOT NULL DEFAULT 'group_class';

ALTER TABLE "public"."services"
  ADD COLUMN IF NOT EXISTS "capacity" smallint NOT NULL DEFAULT 1;

-- ── 2. CHECK del enum. Idempotente: sólo se crea si no existe (re-correr = no-op). Molde 055/061 ───
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM "pg_constraint"
     WHERE "conname" = 'services_capacity_mode_chk'
       AND "conrelid" = '"public"."services"'::"regclass"
  ) THEN
    ALTER TABLE "public"."services"
      ADD CONSTRAINT "services_capacity_mode_chk"
      CHECK ("capacity_mode" IN ('group_class', 'simultaneous_resource'));
  END IF;
END
$$;

-- ── 3. CHECK del cupo: al menos 1 lugar. Mismo molde idempotente ──────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM "pg_constraint"
     WHERE "conname" = 'services_capacity_positive'
       AND "conrelid" = '"public"."services"'::"regclass"
  ) THEN
    ALTER TABLE "public"."services"
      ADD CONSTRAINT "services_capacity_positive"
      CHECK ("capacity" >= 1);
  END IF;
END
$$;

-- ── 4. Exponer SOLO capacity_mode en la vista pública acotada (D-13, molde migr. 061) ─────────────
-- CREATE OR REPLACE: agrega la columna al FINAL del SELECT (Postgres solo permite añadir columnas al
-- final, no reordenar/quitar). El `WHERE active = true` queda intacto. `capacity` NO se expone: el N
-- de lugares es server-side (no-leak D-06/D-12); el read-path de disponibilidad usa service-role y
-- lee `services` directo, así que no necesita la vista. Preserva OWNER/GRANT; se re-emiten por
-- idempotencia/claridad.
CREATE OR REPLACE VIEW "public"."public_services" AS
 SELECT "id",
    "business_id",
    "name",
    "duration_minutes",
    "price",
    "description",
    "active",
    "location_id",
    "location_ids",
    "created_at",
    "capacity_mode"
   FROM "public"."services"
  WHERE ("active" = true);


ALTER VIEW "public"."public_services" OWNER TO "postgres";


-- GRANT (mismo patrón que el baseline: GRANT ALL a los 3 roles, para no divergir del repo).
GRANT ALL ON TABLE "public"."public_services" TO "anon";
GRANT ALL ON TABLE "public"."public_services" TO "authenticated";
GRANT ALL ON TABLE "public"."public_services" TO "service_role";
