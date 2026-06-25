-- ============================================================
-- 026 · businesses: aislamiento de secretos por tenant en la lectura pública
-- ============================================================
-- BUG DE SEGURIDAD (CRÍTICO) que corrige esta migración:
-- El schema base creó la policy "public read businesses" ON businesses FOR SELECT
-- USING (true), que le daba al rol `anon` lectura de la fila ENTERA de cada negocio.
-- Como la página pública /[slug] usa la anon key (respeta RLS), cualquiera podía pegarle
-- al REST de Supabase con select=mp_access_token,mp_refresh_token,resend_api_key,
-- recaptcha_secret_key,google_refresh_token,... y sacar las credenciales de TODOS los
-- negocios (fuga entre tenants). Mismo problema que ya se resolvió para `professionals`
-- en la migración 007 — acá se aplica el mismo patrón (skill RLS, regla #4).
--
-- Solución: la lectura pública pasa de la tabla ENTERA a una vista acotada con solo las
-- columnas no sensibles que necesita la reserva, y se quita la policy abierta de la tabla.
--
-- Idempotente: CREATE OR REPLACE VIEW, GRANT (re-aplicable), DROP POLICY IF EXISTS.
-- No destructivo de datos (sin DROP TABLE / DROP COLUMN / DELETE).
-- ============================================================

-- Vista pública acotada: solo lo que la reserva pública necesita mostrar/usar.
-- Excluye TODO secreto por tenant (mp_access_token, mp_refresh_token, mp_user_id,
-- mp_token_expires_at, resend_api_key, resend_from, recaptcha_secret_key,
-- google_refresh_token) y datos internos (notification_email, dashboard_widgets, plan_*).
-- recaptcha_site_key SÍ va: es pública por diseño (se renderiza en el browser).
-- La vista corre como su dueño (bypassa la RLS de la tabla) y expone únicamente estas
-- columnas, así que anon nunca alcanza las sensibles aunque pida otras.
CREATE OR REPLACE VIEW public_businesses AS
  SELECT
    id,
    owner_id,
    slug,
    name,
    type,
    vertical,
    logo_url,
    primary_color,
    whatsapp,
    address,
    instagram,
    require_deposit,
    deposit_amount,
    deposit_expiry_hours,
    recaptcha_site_key,
    default_slot_duration,
    buffer_minutes,
    created_at
  FROM businesses;
GRANT SELECT ON public_businesses TO anon, authenticated;

-- ⚠ Quita la lectura pública directa de la tabla ENTERA (la policy "public read
-- businesses" del schema base, que exponía toda la fila —incluidos los secretos— a anon).
-- Es un DROP POLICY (no de datos) e idempotente. Tras esto, anon NO puede leer `businesses`
-- directo (no le queda ninguna policy que matchee): lee SOLO la vista de arriba.
DROP POLICY IF EXISTS "public read businesses" ON businesses;
