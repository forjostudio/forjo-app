-- 060 — public_professionals: excluir canchas de la lista pública de profesionales (hardening).
--
-- Contexto (staff / reserva pública vs. vertical canchas):
--   La vista acotada `public_professionals` (baseline:546) es la que el RSC del booking público
--   (`app/[slug]/page.tsx`) lee como rol anon para armar la lista de profesionales reservables de un
--   negocio de staff (salud/belleza/general). En el vertical canchas (v0.13, migr. 043) una CANCHA es
--   una fila de `professionals` con `service_id` NOT NULL (puntero 1:1 a su service de precio+duración).
--   Un profesional de STAFF real siempre tiene `service_id` NULL (esa columna solo la pueblan las canchas).
--
-- El problema que cierra (hardening pedido en el cierre de Phase 10):
--   Si un negocio cambió de vertical canchas → staff, sus filas-cancha (active=true, service_id NOT NULL)
--   siguen vivas en `professionals`. Sin filtro, esas canchas se filtrarían a `public_professionals` y
--   aparecerían como "profesionales" en la reserva pública del negocio — datos de otra superficie
--   (canchas, que tienen su propia vista `public_canchas`) contaminando la lista de staff.
--
-- Qué hace:
--   CREATE OR REPLACE VIEW puro (mismas columnas, mismo orden que hoy → NO requiere DROP; preserva
--   OWNER y GRANTs) agregando `AND service_id IS NULL` al WHERE. El filtro NO excluye staff real
--   (service_id NULL) — solo excluye las canchas (service_id NOT NULL). Re-emito ALTER VIEW ... OWNER
--   y los 3 GRANT ALL por idempotencia/claridad, igual molde que 044.
--
-- Qué NO hace (invariantes del proyecto):
--   - NO se aplica vía push remoto. La ÚNICA validación es `supabase db reset` local (PG17), que replaya
--     el baseline numerado + 040..060 en orden. Prod se aplica A MANO coordinado con el deploy +
--     `NOTIFY pgrst, 'reload schema';`. Tras aplicar, regenerar `supabase/schema.sql` (patrón del repo).
--   - NO agrega columnas, tablas ni policies: es solo un REPLACE de la definición de la vista.

-- ── public_professionals: solo staff activo (excluye canchas: service_id IS NULL) ────────────
CREATE OR REPLACE VIEW "public"."public_professionals" AS
 SELECT "id",
    "business_id",
    "name",
    "specialty",
    "active",
    "photo_url"
   FROM "public"."professionals"
  WHERE (("active" = true) AND ("service_id" IS NULL));


ALTER VIEW "public"."public_professionals" OWNER TO "postgres";


-- GRANT (mismo patrón que el baseline: GRANT ALL a los 3 roles, para no divergir del repo).
GRANT ALL ON TABLE "public"."public_professionals" TO "anon";
GRANT ALL ON TABLE "public"."public_professionals" TO "authenticated";
GRANT ALL ON TABLE "public"."public_professionals" TO "service_role";
