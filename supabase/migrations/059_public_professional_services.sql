-- 059 — public_professional_services: vista acotada anon del mapeo staff↔servicios (DISP/ASIGN, Phase 10).
--
-- Contexto (motor-reservas / Phase 10 — reservar con "Cualquiera" desde /[slug]):
--   La página pública `/[slug]` necesita saber, del lado del cliente (anon, no autenticado), QUÉ
--   profesional es capaz de QUÉ servicio, para dos cosas: (a) filtrar la lista de profesionales del
--   step 2 al servicio elegido, y (b) gatear la tarjeta "Cualquiera" solo cuando hay ≥2 capaces del
--   servicio (D-02). Ese mapeo vive en la tabla puente `professional_services` (migr. 057), que NO
--   tiene policy `anon` (D-11/057): el público no puede leerla directo. El patrón del repo para
--   exponer datos no sensibles al anon es una VISTA ACOTADA `public_*` (molde de
--   public_services/public_professionals baseline + public_canchas migr. 044): una VIEW owner
--   `postgres` que corre como DEFINER y expone SOLO columnas no sensibles con GRANT a anon.
--
-- Qué hace:
--   CREATE OR REPLACE VIEW public.public_professional_services: SELECT directo de las 3 columnas de la
--   puente (business_id, professional_id, service_id) — SIN JOIN, la puente ya tiene exactamente esas
--   tres. Owner postgres + GRANT ALL a anon/authenticated/service_role (mismo patrón que
--   public_services/public_canchas, para no divergir del repo; el anon solo lee de hecho). El RSC
--   `app/[slug]/page.tsx` la lee filtrando por `.eq('business_id', ...)` (aislamiento por tenant) y la
--   pasa a `BookingClient`, que la interpreta con `lib/staff-services.ts` (regla del comodín).
--
-- Reglas duras (D-06/D-07 + threat model T-10-02):
--   - NO usa `security_invoker=true` (Pitfall 5, mismo motivo que public_canchas 044:23-25): con
--     invoker la vista heredaría la RLS de `professional_services` que el anon NO cumple (057 no tiene
--     policy anon) → el anon leería 0 filas → "Cualquiera" NUNCA se mostraría y la lista de capaces
--     quedaría vacía. El molde correcto es owner postgres (DEFINER), igual que public_services.
--   - Solo 3 columnas, todas NO sensibles: es el mapeo capaz-de que el propio selector del wizard
--     revela igual. NO se expone nada más del profesional ni del servicio. La tabla puente
--     `professional_services` SIGUE sin policy anon (057): no se abre la tabla base, solo esta vista.
--   - Regla del comodín preservada SOLA (cero backfill): un profesional SIN filas en la puente
--     simplemente NO aparece en la vista, y `professionalsForService` (lib/staff-services.ts:48-52) lo
--     interpreta como capaz de TODOS los servicios (comodín, D-01). No hay que sembrar ninguna fila.
--
-- Qué NO hace (invariantes del proyecto):
--   - NO agrega policy RLS ni habilita RLS: es una vista definer (owner postgres); el aislamiento
--     efectivo lo da el `.eq('business_id', ...)` que hace el RSC al leerla, igual que
--     public_services/public_professionals/public_canchas.
--   - NO agrega tablas ni columnas: es aditiva, solo una VIEW de solo-lectura.
--   - NO se aplica vía push remoto. La baseline en prod es la 058; la 059 es la próxima. La ÚNICA
--     validación local es `supabase db reset` (PG17), que replaya el baseline numerado 001→059 en
--     orden (esa validación de replay corre en el Plan 04 — BLOCKING; este plan solo escribe la
--     migración y el snapshot). Prod se aplica A MANO coordinado con el deploy + `NOTIFY pgrst,
--     'reload schema';` (sin esto PostgREST no expone la vista al RSC anon → la lista de capaces vuelve
--     vacía → "Cualquiera" nunca se muestra; fail-safe: el booking de hoy sigue funcionando). Tras
--     aplicar, regenerar `supabase/schema.sql` (patrón del repo, igual que 042/044/057).

-- ── public_professional_services: vista acotada anon del mapeo staff↔servicios ──────────────────
CREATE OR REPLACE VIEW "public"."public_professional_services" AS
 SELECT "business_id",
    "professional_id",
    "service_id"
   FROM "public"."professional_services";


ALTER VIEW "public"."public_professional_services" OWNER TO "postgres";


-- GRANT (mismo patrón que public_services/public_canchas del baseline: GRANT ALL a los 3 roles, para
-- no divergir del repo; el anon solo lee de hecho, la vista no tiene otra operación posible).
GRANT ALL ON TABLE "public"."public_professional_services" TO "anon";
GRANT ALL ON TABLE "public"."public_professional_services" TO "authenticated";
GRANT ALL ON TABLE "public"."public_professional_services" TO "service_role";
