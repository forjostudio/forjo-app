-- 071 — La agenda por servicio: tabla puente time_block_services + RLS por tenant + vista acotada anon.
--
-- Contexto (motor-reservas / Phase 18 — AGENDA-01/AGENDA-04, v0.28 "La agenda por servicio"):
--   Hoy una franja horaria (`time_blocks`) declara CUÁNDO se atiende, pero no QUÉ se da en ella:
--   el peluquero que corta de 9 a 13 y hace color de 14 a 18 no tiene forma de decirlo, y la grilla
--   pública ofrece cualquier servicio en cualquier franja. Desde la migr. 068 (v0.27) `time_blocks`
--   ya no decide cupo —eso vive en `services.capacity`—, así que la tabla quedó reducida a declarar
--   el cuándo, lo que libera el lugar para declarar el qué.
--
--   Esta migración crea la tabla puente muchos-a-muchos `time_block_services` (franja ↔ servicio),
--   hermana exacta de `professional_services` (migr. 057) y de `agenda_spaces` (migr. 042): mismo
--   molde de tenant (business_id NOT NULL + FKs NOT NULL + PK compuesta + ON DELETE CASCADE), misma
--   RLS habilitada + 4 policies por operación, sin acceso `anon` a la tabla base. Y crea la vista
--   acotada `public_time_block_services` (molde migr. 059) para que el público lea el mapeo sin que
--   se abra la tabla.
--
--   La regla del comodín (D-01) NO vive en la DB: una franja SIN filas en la puente se considera
--   apta para TODOS los servicios. Esa regla la encierra el helper puro `lib/time-block-services.ts`
--   (Plan 18-02, molde `lib/staff-services.ts`), fuente única consumida por la disponibilidad
--   (Plan 18-03), el backstop del create (Plan 18-04), la UI de la Phase 19 y el público de la
--   Phase 20.
--
-- Qué hace:
--   1. Crea `time_block_services`: puente time_block ↔ service por negocio. business_id +
--      time_block_id + service_id todos NOT NULL FK, PK compuesta (time_block_id, service_id),
--      ON DELETE CASCADE en las tres FK: borrar el negocio, la franja o el servicio limpia solo las
--      filas correspondientes del mapeo.
--   2. Habilita RLS en la MISMA migración y crea las 4 policies por operación (tenant por owner_id).
--   3. Crea el índice inverso `time_block_services_by_service (service_id, time_block_id)` — la PK
--      sirve "qué servicios da la franja X" y el índice sirve la pregunta al revés, "qué franjas
--      cubren el servicio Y", que es la que necesitan la disponibilidad y las Phases 19/20.
--   4. Crea la vista acotada `public_time_block_services` (owner postgres, DEFINER) con GRANT a
--      anon/authenticated/service_role — el camino por el que el público lee el mapeo.
--
-- ⚠ La divergencia obligada del molde 057 — `time_blocks.business_id` es NULLABLE:
--   En `professional_services` las tres FK son NOT NULL porque `professionals.business_id` es NOT
--   NULL. Acá NO: `business_id` es la ÚNICA columna nullable de `time_blocks` (verificado contra el
--   Postgres local con \d public.time_blocks). La decisión de esta migración es explícita: **la
--   puente exige `business_id` NOT NULL igual que el molde**, y la consecuencia se escribe acá en
--   vez de asumirse en silencio:
--     - Una franja huérfana (con `business_id` nulo) NUNCA puede recibir mapeo, porque su propio
--       dueño ni siquiera la ve: la policy de tenant de `time_blocks` es `business_id IN (SELECT
--       ...)`, y `NULL IN (...)` evalúa a NULL, que USING trata como falso.
--     - Y eso ES el comportamiento correcto: sin filas en la puente, esa franja queda COMODÍN para
--       siempre — o sea, exactamente como se comporta hoy. La divergencia falla hacia el lado seguro.
--     - Medido en el Postgres local al escribir esta migración: 0 franjas huérfanas sobre 9
--       (`select count(*) from time_blocks where business_id is null` = 0).
--   Alternativa descartada: hacer NULLABLE el `business_id` de la puente para "heredar" el nulo del
--   padre. Se descartó porque volvería inútil el predicado de tenant de las 4 policies para esas
--   filas (`business_id IN (...)` con nulo no matchea ⇒ filas que nadie puede leer, escribir ni
--   borrar por RLS, pero que sí existirían), y porque dejaría la vista pública sin columna con la
--   que filtrar por negocio en el RSC.
--
-- Qué NO hace (invariantes del proyecto):
--   - CERO backfill: no siembra ni una fila. La regla del comodín (D-01) hace que "sin filas = sirve
--     para cualquier servicio", así que el día que esto se aplique TODOS los negocios tienen 0 filas
--     ⇒ todas las franjas son comodín ⇒ nada cambia (AGENDA-04 / D-02: la cero regresión es POR
--     CONSTRUCCIÓN, no por cuidado). Sembrar una sola fila rompería esa garantía.
--   - NO toca `time_blocks`: ni columnas, ni policies, ni su `public read` con qual: true (evaluado
--     y dejado explícitamente afuera de esta fase; es preexistente y su revisión es un todo propio).
--   - NO toca `services` ni `services.capacity` (migr. 068), ni `professional_services` (057).
--   - NO modifica el motor de reservas: NO redefine `book_slot_atomic` ni ninguna función atómica,
--     NO toca el índice único 011 (appointments_no_double_booking) ni el EXCLUDE gist 013
--     (appointments_no_overlap) ni ningún trigger/constraint de `appointments`. Solo CREATE TABLE +
--     RLS + policies + índice + vista, todo sobre objetos nuevos.
--   - NO da acceso `anon` a la TABLA `time_block_services` (molde 057/D-11): el público nunca lee la
--     puente; para eso está la vista acotada de la sección 3.
--   - NO se aplica vía push remoto ni por el flujo GSD. La baseline en prod es la 070; la 071 es la
--     próxima y no se saltea ningún número. La ÚNICA validación es `supabase db reset` LOCAL (PG17),
--     que replaya el baseline numerado 001→071 en orden y prueba que la 071 es idempotente, ordena
--     bien y no choca con constraints previos. Prod se aplica A MANO coordinado con el deploy +
--     `NOTIFY pgrst, 'reload schema';` (sin eso PostgREST no expone ni la tabla ni la vista en su
--     cache: la Phase 19 no podría escribir el mapeo y el público leería vacío; fail-safe: sin filas
--     legibles todo queda comodín ⇒ el booking de hoy sigue funcionando). Tras aplicar, regenerar
--     `supabase/schema.sql` (patrón del repo, igual que 042/057/059).

-- ── 1. time_block_services: puente franja ↔ servicio ───────────────────────────────────────
-- Declara QUÉ servicios se dan en cada franja. Las tres columnas NOT NULL FK con ON DELETE CASCADE:
-- borrar el negocio, la franja o el servicio limpia solo las filas correspondientes de la puente.
-- PK (time_block_id, service_id) evita mapear dos veces el mismo servicio a la misma franja. Sin
-- created_at (espejo exacto de professional_services). Idempotente: create table if not exists.
CREATE TABLE IF NOT EXISTS "public"."time_block_services" (
  "business_id"    uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE CASCADE,
  "time_block_id"  uuid NOT NULL REFERENCES "public"."time_blocks"("id") ON DELETE CASCADE,
  "service_id"     uuid NOT NULL REFERENCES "public"."services"("id") ON DELETE CASCADE,
  PRIMARY KEY ("time_block_id", "service_id")
);
ALTER TABLE "public"."time_block_services" ENABLE ROW LEVEL SECURITY;

-- 4 policies por operación, predicado de tenant idéntico al de 057 (owner_id = auth.uid()).
-- select/delete con USING; insert con WITH CHECK; update con USING + WITH CHECK (regla 3 de la
-- skill supabase-multitenant-rls: una policy por op con la cláusula correcta). SIN policy anon: el
-- público nunca lee la puente. Precedidas por drop policy if exists (idempotencia del baseline).
DROP POLICY IF EXISTS "time_block_services tenant select" ON "public"."time_block_services";
DROP POLICY IF EXISTS "time_block_services tenant insert" ON "public"."time_block_services";
DROP POLICY IF EXISTS "time_block_services tenant update" ON "public"."time_block_services";
DROP POLICY IF EXISTS "time_block_services tenant delete" ON "public"."time_block_services";

CREATE POLICY "time_block_services tenant select" ON "public"."time_block_services" FOR SELECT USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "time_block_services tenant insert" ON "public"."time_block_services" FOR INSERT WITH CHECK (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "time_block_services tenant update" ON "public"."time_block_services" FOR UPDATE USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "time_block_services tenant delete" ON "public"."time_block_services" FOR DELETE USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));

-- ── 2. Índice inverso: "qué franjas cubren el servicio Y" ───────────────────────────────────
-- La PK (time_block_id, service_id) sirve "qué servicios se dan en la franja X"; la disponibilidad
-- (Plan 18-03) y las Phases 19/20 preguntan al revés ("qué franjas cubren el servicio Y", y el
-- aviso de servicio sin cobertura de D-06), así que se agrega el índice inverso, espejo exacto de
-- professional_services_by_service (057). Idempotente.
CREATE INDEX IF NOT EXISTS "time_block_services_by_service" ON "public"."time_block_services" ("service_id", "time_block_id");

-- ── 3. public_time_block_services: vista acotada anon del mapeo franja ↔ servicio ───────────
-- La tabla base NO tiene policy anon (sección 1), así que el público no puede leerla directo. El
-- patrón del repo para exponer datos no sensibles al anon es una VISTA ACOTADA `public_*` (molde
-- public_services/public_professionals del baseline, public_canchas migr. 044,
-- public_professional_services migr. 059): una VIEW owner `postgres` que corre como DEFINER y expone
-- SOLO columnas no sensibles con GRANT a anon. Acá son las tres columnas de la puente, sin JOIN (la
-- puente ya tiene exactamente esas tres). El aislamiento efectivo lo da el `.eq('business_id', ...)`
-- que hace el RSC al leerla, igual que las otras vistas public_*.
--
-- ⚠ Pitfall 5 (documentado en la 044 y repetido en la 059; este repo ya cometió el error una vez):
-- la vista es DEFINER y NO lleva la opción de invocador. Con la RLS del invocador aplicando adentro
-- de la vista, `anon` —que no tiene policy sobre la tabla base— leería 0 filas SIEMPRE, en silencio:
-- el resultado observable sería "ninguna franja tiene servicios mapeados" para TODO negocio,
-- indistinguible del comodín. Un bug invisible en QA superficial. Owner postgres, sin excepción.
--
-- Todavía NO tiene consumidor en esta fase: `/api/booking/availability` corre con service role y lee
-- la tabla base directo; la vista es para el RSC público de la Phase 20. Se crea acá igual y a
-- propósito, porque las migraciones se aplican a prod A MANO y partir la tabla y su vista en dos
-- aplicaciones manuales separadas duplica el riesgo operativo por cero beneficio. Es aditiva e
-- inerte mientras no tenga consumidor.
CREATE OR REPLACE VIEW "public"."public_time_block_services" AS
 SELECT "business_id",
    "time_block_id",
    "service_id"
   FROM "public"."time_block_services";


ALTER VIEW "public"."public_time_block_services" OWNER TO "postgres";


-- GRANT (mismo patrón que public_professional_services/public_canchas: GRANT ALL a los 3 roles, para
-- no divergir del repo; el anon solo lee de hecho, la vista no tiene otra operación posible).
GRANT ALL ON TABLE "public"."public_time_block_services" TO "anon";
GRANT ALL ON TABLE "public"."public_time_block_services" TO "authenticated";
GRANT ALL ON TABLE "public"."public_time_block_services" TO "service_role";
