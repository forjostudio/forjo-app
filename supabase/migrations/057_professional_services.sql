-- 057 — Equipo: mapeo staff↔servicios. Tabla puente professional_services + RLS por tenant.
--
-- Contexto (motor-reservas / Phase 8 — STAFF-01/02/03, v0.25 multi-staff):
--   Un negocio con varias personas necesita declarar QUÉ servicios sabe hacer cada una. Esta
--   migración crea la tabla puente muchos-a-muchos `professional_services` (profesional ↔ servicio),
--   hermana exacta de `agenda_spaces` (migr. 042): mismo molde de tenant (business_id NOT NULL + FKs
--   NOT NULL + PK compuesta + ON DELETE CASCADE), misma RLS habilitada + 4 policies por operación,
--   sin acceso `anon`. La regla del comodín (D-01) NO vive en la DB: un profesional SIN filas en la
--   puente se considera capaz de TODOS los servicios (default sensato, cero backfill, no obliga a
--   configurar). Esa regla la encierra el helper puro `lib/staff-services.ts` (D-12), fuente única
--   consumida por la UI de esta fase, el RPC de la Phase 9 y la grilla pública de la Phase 10.
--
-- Qué hace:
--   1. Crea `professional_services`: puente professional ↔ service por negocio. business_id +
--      professional_id + service_id todos NOT NULL FK, PK compuesta (professional_id, service_id),
--      ON DELETE CASCADE en las tres FK. Datos de tenant (RLS + 4 policies por op WITH CHECK).
--   2. Habilita RLS en la MISMA migración y crea las 4 policies por operación (tenant por owner_id).
--   3. Crea el índice inverso `professional_services_by_service (service_id, professional_id)` que
--      `agenda_spaces` no necesitó — para la query de cobertura (STAFF-02: "quiénes ofrecen el
--      servicio X") y la Phase 9 (candidatos por servicio dentro del RPC).
--
-- Qué NO hace (invariantes del proyecto):
--   - CERO backfill: la regla del comodín (D-01) hace que "sin filas = capaz de todo", así que NO
--     hay que sembrar ninguna fila. Un negocio recién migrado se comporta idéntico a hoy (todos los
--     profesionales capaces de todos los servicios), cero regresión.
--   - NO toca `professionals.service_id` (canchas, migr. 043): esa columna es el mecanismo *single*
--     del vertical canchas y no se reusa ni se modifica acá.
--   - NO modifica el motor de reservas: NO redefine el RPC / la función atómica de booking, NO toca
--     el índice único 011 (appointments_no_double_booking) ni el EXCLUDE gist 013
--     (appointments_no_overlap) ni ningún trigger/constraint de `appointments`. Solo CREATE TABLE +
--     RLS + policies + índice sobre una tabla nueva.
--   - NO da read a `anon` sobre `professional_services` (D-11, espejo de agenda_spaces D-06): el
--     público nunca lee la puente. La Phase 10 resuelve quién puede hacer qué server-side; si hiciera
--     falta exponerlo, será una vista acotada (molde `public_professionals`) en una migración
--     posterior, nunca abriendo esta tabla a `anon`.
--   - NO se aplica vía push remoto ni por el flujo GSD. La ÚNICA validación es `supabase db reset`
--     local (PG17), que replaya el baseline numerado 001→057 en orden y prueba que la 057 es
--     idempotente, ordena bien y no choca con constraints previos. Prod se aplica A MANO coordinado
--     con el deploy + `NOTIFY pgrst, 'reload schema';` (PostgREST refresca su schema cache). Tras
--     aplicar, regenerar `supabase/schema.sql` (patrón del repo, igual que 042/054/056).

-- ── 1. professional_services: puente profesional ↔ servicio ────────────────────────────────
-- Mapea qué servicios sabe hacer cada persona del equipo. Las tres columnas NOT NULL FK con
-- ON DELETE CASCADE: borrar el negocio, el profesional o el servicio limpia solo las filas
-- correspondientes de la puente (D-17 gratis, igual que agenda_spaces). PK (professional_id,
-- service_id) evita duplicar el mapeo del mismo servicio a la misma persona. Sin created_at
-- (espejo exacto de agenda_spaces). Idempotente: create table if not exists.
CREATE TABLE IF NOT EXISTS "public"."professional_services" (
  "business_id"     uuid NOT NULL REFERENCES "public"."businesses"("id") ON DELETE CASCADE,
  "professional_id" uuid NOT NULL REFERENCES "public"."professionals"("id") ON DELETE CASCADE,
  "service_id"      uuid NOT NULL REFERENCES "public"."services"("id") ON DELETE CASCADE,
  PRIMARY KEY ("professional_id", "service_id")
);
ALTER TABLE "public"."professional_services" ENABLE ROW LEVEL SECURITY;

-- 4 policies por operación, predicado de tenant idéntico al de 042 (owner_id = auth.uid()).
-- select/delete con USING; insert con WITH CHECK; update con USING + WITH CHECK (regla 3 de la
-- skill supabase-multitenant-rls: una policy por op con la cláusula correcta). SIN policy anon
-- (D-11): el público nunca lee la puente. Precedidas por drop policy if exists (idempotencia).
DROP POLICY IF EXISTS "professional_services tenant select" ON "public"."professional_services";
DROP POLICY IF EXISTS "professional_services tenant insert" ON "public"."professional_services";
DROP POLICY IF EXISTS "professional_services tenant update" ON "public"."professional_services";
DROP POLICY IF EXISTS "professional_services tenant delete" ON "public"."professional_services";

CREATE POLICY "professional_services tenant select" ON "public"."professional_services" FOR SELECT USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "professional_services tenant insert" ON "public"."professional_services" FOR INSERT WITH CHECK (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "professional_services tenant update" ON "public"."professional_services" FOR UPDATE USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));

CREATE POLICY "professional_services tenant delete" ON "public"."professional_services" FOR DELETE USING (("business_id" IN ( SELECT "businesses"."id"
   FROM "public"."businesses"
  WHERE ("businesses"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))));

-- ── 2. Índice inverso para la query de cobertura (STAFF-02) ─────────────────────────────────
-- La PK (professional_id, service_id) sirve "qué hace el profesional P"; la cobertura y la Phase 9
-- preguntan al revés ("quiénes ofrecen el servicio X"), así que se agrega el índice inverso que
-- agenda_spaces no necesitó. Idempotente.
CREATE INDEX IF NOT EXISTS "professional_services_by_service" ON "public"."professional_services" ("service_id", "professional_id");
