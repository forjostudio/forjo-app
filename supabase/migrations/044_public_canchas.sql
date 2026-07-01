-- 044 — public_canchas: vista acotada para el booking PÚBLICO del vertical canchas (ALQUILER-01/04).
--
-- Contexto (canchas / Phase 3 — booking público de alquiler):
--   El cliente final (anon, no autenticado) de un negocio de canchas necesita ver, en la página
--   pública `/[slug]`, las canchas reservables: su NOMBRE, su PRECIO propio y su DURACIÓN FIJA (la que
--   seteó el dueño en Phase 2). El anon NO puede leer `professionals`/`services` directo (RLS por
--   business_id). El patrón del repo para exponer datos no sensibles al anon es una VISTA ACOTADA
--   `public_*` (molde de `public_services`/`public_professionals`, baseline:546/577): una VIEW owner
--   `postgres` que corre como DEFINER y expone SOLO columnas no sensibles con GRANT a anon.
--
-- Qué hace:
--   CREATE OR REPLACE VIEW public.public_canchas: joinea la agenda-cancha (`professionals` con
--   service_id no nulo, migr. 043) con su `service` (precio + duración) y expone SOLO lo
--   reservable+mostrable: id (= professional_id, lo que el cliente manda como professionalId al
--   create/availability), business_id, name, price, duration_minutes. Owner postgres + GRANT ALL a
--   anon/authenticated/service_role (igual patrón que public_services, para no divergir del repo).
--
-- Reglas duras (D-01 + threat model T-03-01/02/03):
--   - NUNCA expone `service_id` (puntero interno — D-01): el service_id vive SOLO en el JOIN y el
--     WHERE, jamás en la lista del SELECT. Filtrarlo dejaría al cliente inferir el service para
--     tampearlo (reservar al precio/duración de otra cancha).
--   - NO usa `security_invoker=true` (Pitfall 1): el molde correcto es el de public_services (owner
--     postgres, definer). Con security_invoker=true la vista heredaría la RLS de professionals/services
--     que el anon NO cumple → el anon leería 0 filas y la página pública quedaría vacía. NO copiar el
--     molde de crm_timeline (ese sí usa security_invoker a propósito, para heredar la RLS admin-only).
--   - NO expone columnas sensibles del professional (specialty/license_number/phone/email/photo_url)
--     ni del service (description/location_id/location_ids). Solo nombre + precio + duración.
--   - Solo canchas ACTIVAS: WHERE p.active = true AND s.active = true. El soft-delete de una cancha
--     desactiva professional Y service (lib/canchas.ts:170-174) → filtrar por ambos es correcto y
--     redundante-seguro. Una cancha soft-deleted desaparece de la vista.
--
-- Qué NO hace (invariantes del proyecto):
--   - NO se aplica vía push remoto. La ÚNICA validación es `supabase db reset` local (PG17), que
--     replaya el baseline numerado + 040..044 en orden. Prod se aplica A MANO coordinado con el deploy
--     + `NOTIFY pgrst, 'reload schema';` (PostgREST refresca su schema cache — sin esto la vista existe
--     en Postgres pero PostgREST no la expone al RSC anon). Tras aplicar, regenerar `supabase/schema.sql`
--     (patrón del repo, igual que 037/039/042/043).
--   - NO agrega policy RLS ni habilita RLS: es una vista definer (owner postgres); el aislamiento
--     efectivo lo da el filtro por business_id que hace el RSC al leerla (.eq('business_id', ...)),
--     igual que public_services/public_professionals.
--   - NO agrega tablas ni columnas: es aditiva, solo una VIEW de solo-lectura.

-- ── public_canchas: vista acotada anon para el vertical canchas ──────────────────────────────
CREATE OR REPLACE VIEW "public"."public_canchas" AS
 SELECT "p"."id",                    -- = professional_id: lo reservable (el client lo manda como professionalId)
    "p"."business_id",
    "p"."name",
    "s"."price",
    "s"."duration_minutes"
   FROM ("public"."professionals" "p"
     JOIN "public"."services" "s" ON (("s"."id" = "p"."service_id")))
  WHERE (("p"."service_id" IS NOT NULL)   -- solo filas-cancha (índice parcial 043)
    AND ("p"."active" = true)             -- cancha (agenda) activa
    AND ("s"."active" = true));           -- service activo (el soft-delete desactiva ambos)


ALTER VIEW "public"."public_canchas" OWNER TO "postgres";


-- GRANT (mismo patrón que public_services/public_professionals del baseline: GRANT ALL a los 3 roles,
-- para no divergir del repo; el anon solo lee de hecho, la vista no tiene otra operación posible).
GRANT ALL ON TABLE "public"."public_canchas" TO "anon";
GRANT ALL ON TABLE "public"."public_canchas" TO "authenticated";
GRANT ALL ON TABLE "public"."public_canchas" TO "service_role";
