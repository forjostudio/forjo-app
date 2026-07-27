-- 061 — businesses.public_selector_default: default del paso "Profesional" de la reserva pública (EXTRA-B).
--
-- Contexto (motor-reservas / Phase 11 — cierre de backlog, ítem EXTRA-B):
--   El paso 2 del booking público (elegir profesional) ofrece hoy la tarjeta "Cualquiera" primero,
--   preseleccionada por defecto (comportamiento de Phase 10, D-01). Este setting hace ese default
--   CONFIGURABLE por negocio, con dos valores acotados:
--     - 'any'    = default. Comportamiento de Phase 10 byte-idéntico (Cualquiera primero,
--                  preseleccionada). CERO regresión para cualquier negocio existente (D-06).
--     - 'choose' = sin preselección: el cliente ve primero a las personas. "Cualquiera" SIGUE
--                  disponible con ≥2 profesionales capaces (D-07), solo cambia orden/prominencia.
--   `NOT NULL DEFAULT 'any'` ⇒ todas las filas existentes Y las nuevas nacen en 'any' sin backfill
--   manual: el DEFAULT cubre las filas ya existentes (D-06).
--
-- Qué hace (idempotente — re-correr la migración es no-op):
--   1. ADD COLUMN IF NOT EXISTS public_selector_default text NOT NULL DEFAULT 'any'.
--   2. Agrega el CHECK `businesses_public_selector_default_chk` (public_selector_default IN
--      ('any','choose')) SOLO si no existe (consulta pg_constraint por conname). Fail-closed a
--      nivel DB: la escritura del panel (anon+RLS PostgREST) no puede meter un valor fuera del enum
--      (T-11-04). Molde: `abono_window_weeks` (migr. 055).
--   3. CREATE OR REPLACE VIEW public_businesses agregando la columna al final del SELECT. El
--      read-path público (`app/[slug]/page.tsx`) lee la VISTA acotada `public_businesses`, NO la
--      tabla base (leerla con anon filtraría secretos por tenant). Sin exponerla en la vista, el
--      `.select('...,public_selector_default')` de page.tsx erroraría y rompería el booking. La
--      columna es un flag de PRESENTACIÓN del propio negocio, no dato sensible ni PII (enum acotado)
--      ⇒ está bien que viaje a anon. NO se toca ninguna otra vista pública ni el contrato de
--      disponibilidad {ok,busy,full} (D-08). Molde del REPLACE de vista: migr. 060.
--
-- Qué NO hace (invariantes del proyecto):
--   - NO toca `book_slot_atomic`, `appointments`, `professional_services`, `public_professionals`
--     ni ninguna policy RLS. El setting es de presentación (D-08).
--   - NO se aplica vía push remoto. La ÚNICA validación es `supabase db reset` local (PG17), que
--     replaya el baseline numerado + 040..061 en orden. Prod se aplica A MANO coordinado con el
--     deploy + `NOTIFY pgrst, 'reload schema';`. La última migración en prod = 060. Tras aplicar,
--     regenerar `supabase/schema.sql` (patrón del repo).

-- ── 1. Columna: NOT NULL DEFAULT 'any' (cubre filas existentes sin backfill, D-06) ───────────────
ALTER TABLE "public"."businesses"
  ADD COLUMN IF NOT EXISTS "public_selector_default" "text" NOT NULL DEFAULT 'any';

-- ── 2. CHECK del enum. Idempotente: sólo se crea si no existe (re-correr = no-op) ─────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM "pg_constraint"
     WHERE "conname" = 'businesses_public_selector_default_chk'
       AND "conrelid" = '"public"."businesses"'::"regclass"
  ) THEN
    ALTER TABLE "public"."businesses"
      ADD CONSTRAINT "businesses_public_selector_default_chk"
      CHECK ("public_selector_default" IN ('any', 'choose'));
  END IF;
END
$$;

-- ── 3. Exponer la columna en la vista pública acotada (read-path del booking, molde migr. 060) ────
-- CREATE OR REPLACE: agrega la columna al FINAL del SELECT (Postgres solo permite añadir columnas al
-- final, no reordenar/quitar). Preserva OWNER y GRANTs; se re-emiten por idempotencia/claridad.
CREATE OR REPLACE VIEW "public"."public_businesses" AS
 SELECT "id",
    "owner_id",
    "slug",
    "name",
    "type",
    "vertical",
    "logo_url",
    "primary_color",
    "whatsapp",
    "address",
    "instagram",
    "require_deposit",
    "deposit_amount",
    "deposit_expiry_hours",
    "recaptcha_site_key",
    "default_slot_duration",
    "buffer_minutes",
    "created_at",
    "landing_config",
    "max_advance_days",
    "max_advance_date",
    "public_selector_default"
   FROM "public"."businesses";


ALTER VIEW "public"."public_businesses" OWNER TO "postgres";


-- GRANT (mismo patrón que el baseline: GRANT ALL a los 3 roles, para no divergir del repo).
GRANT ALL ON TABLE "public"."public_businesses" TO "anon";
GRANT ALL ON TABLE "public"."public_businesses" TO "authenticated";
GRANT ALL ON TABLE "public"."public_businesses" TO "service_role";

-- ── 4. Recargar el schema cache de PostgREST (obligatorio tras DDL) ───────────────────────────────
NOTIFY pgrst, 'reload schema';
