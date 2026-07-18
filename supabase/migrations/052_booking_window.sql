-- 052 — businesses.max_advance_days / max_advance_date: ventana de reserva pública (BOOK-WINDOW-01).
--
-- Contexto (Phase 4 motor-reservas — BOOK-WINDOW-01/02/03):
--   Un negocio limita cuánto en el futuro puede reservar un cliente en la página pública. El límite
--   tiene 3 modos mutuamente excluyentes (D-01): (a) días de anticipación rolling, (b) fecha límite fija,
--   (c) sin límite. El dato es config PÚBLICA (no secreta): el calendario público lo necesita para capar
--   la navegación de mes y deshabilitar días fuera de ventana, y el backstop server lo valida.
--
-- Qué hace:
--   1. ALTER TABLE businesses:
--      - max_advance_days integer DEFAULT 30 → D-02: backfillea TODAS las filas existentes a 30 días de
--        una sola vez (arregla el bug de reservas a años; no hay clientes reales → sin riesgo). Queda
--        NULLABLE (no NOT NULL) para poder setear null = "sin límite" desde el UI (Plan 02) aunque el
--        default sea 30.
--      - max_advance_date date NULLABLE → modo fecha fija; null si no se usa.
--   2. CREATE OR REPLACE VIEW public_businesses agregando ambas columnas AL FINAL del select.
--      El público lee la VISTA acotada `public_businesses` (creada en 026 para cerrar la fuga de
--      secretos entre tenants), NUNCA la tabla `businesses` con anon. Si la columna no está en la vista,
--      el .select() de app/[slug]/page.tsx contra public_businesses falla (Pitfall 1 del research).
--      Regla de CREATE OR REPLACE VIEW: las columnas nuevas van SOLO al final del select.
--      Se agregan EXCLUSIVAMENTE estas 2 columnas config-públicas (análogas a buffer_minutes); ninguna
--      columna sensible de businesses entra a la vista (los secretos viven en business_secrets).
--
-- Qué NO hace (invariantes del proyecto):
--   - NO se aplica vía push remoto. La ÚNICA validación es `supabase db reset` local (PG17), que replaya
--     el baseline numerado + migraciones en orden hasta la 052. Prod se aplica A MANO coordinado con el
--     deploy + `NOTIFY pgrst, 'reload schema';` (PostgREST refresca su schema cache para servir las
--     columnas nuevas en public_businesses). Tras aplicar, regenerar `supabase/schema.sql` (patrón del
--     repo, igual que 037/039/042/043).
--   - NO agrega policy RLS nueva: businesses YA tiene RLS + policies owner-only. Las columnas son
--     aditivas y el update lo hace el dueño con su sesión (Plan 02). Agregar una policy sería un error.
--   - NO toca appointments/clients. D-06: la migración es aditiva y NO toca turnos ya reservados —
--     cambiar el límite afecta solo reservas nuevas; los turnos existentes fuera de ventana quedan intactos.

-- ── businesses.max_advance_days / max_advance_date: ventana de reserva pública ──────────────
ALTER TABLE "public"."businesses"
  ADD COLUMN IF NOT EXISTS "max_advance_days" integer DEFAULT 30,  -- D-02: 30 para todos (backfill por DEFAULT)
  ADD COLUMN IF NOT EXISTS "max_advance_date" date;                -- modo fecha fija; null si no se usa

-- ── Extender la vista pública acotada (Pitfall 1). Columnas nuevas al FINAL ──────────────────
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
    "max_advance_date"
   FROM "public"."businesses";

-- GRANT idempotente (la vista ya se expone a anon/authenticated desde 026).
GRANT SELECT ON "public"."public_businesses" TO "anon", "authenticated";
