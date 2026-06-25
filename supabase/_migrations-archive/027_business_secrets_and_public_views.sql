-- ============================================================
-- 027 · Aislamiento de secretos por tenant — MITAD ADITIVA (no destructiva)
-- ============================================================
-- Continúa el fix iniciado en 026 (que acotó la lectura pública de `businesses`).
-- Esta migración es la MITAD ADITIVA del aislamiento de secretos (SEC-01):
--   1. Crea la tabla `business_secrets` (RLS solo-dueño, SIN acceso anon) y mueve allí
--      la lectura/escritura de los 7 secretos por negocio que hoy viven en `businesses`.
--   2. Copia (no mueve) los valores actuales desde `businesses` a `business_secrets`.
--   3. Crea las vistas públicas acotadas `public_services` / `public_business_hours`
--      (gemelas de `public_businesses`/`public_professionals`), con GRANT a anon/authenticated.
--
-- La MITAD DESTRUCTIVA va en 028 (plan 01-05): DROP de las policies "public read services" /
-- "public read hours" (USING(true), el agujero anon) y DROP de las columnas-secreto en
-- `businesses`. Se difiere a 028 para poder desplegar primero el código que lee de
-- `business_secrets` con fallback a `businesses` (deploy backward-compatible, D-02).
--
-- Idempotente: CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS antes de CREATE POLICY,
-- CREATE OR REPLACE VIEW, GRANT (re-aplicable), INSERT ... ON CONFLICT DO NOTHING.
-- No destructivo de datos (sin DROP TABLE / DROP COLUMN / DELETE). Correr dos veces no rompe.
-- ============================================================

-- ── 1. Tabla business_secrets: una fila por negocio, keyed por business_id ──────────
-- Aloja los 7 secretos por tenant. NO incluye mp_user_id (id de cuenta MP, no es secreto,
-- el dashboard lo usa como flag), recaptcha_site_key (pública por diseño, se renderiza en
-- el browser) ni notification_email (contacto del dueño, interno pero no credencial): esos
-- se quedan en `businesses`.
CREATE TABLE IF NOT EXISTS business_secrets (
  business_id UUID PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  mp_access_token TEXT,
  mp_refresh_token TEXT,
  mp_token_expires_at TIMESTAMPTZ,
  resend_api_key TEXT,
  resend_from TEXT,
  recaptcha_secret_key TEXT,
  google_refresh_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Regla dura #1 del skill RLS: toda tabla con business_id SIEMPRE con RLS habilitada.
ALTER TABLE business_secrets ENABLE ROW LEVEL SECURITY;

-- ── 2. Policy owner-only ────────────────────────────────────────────────────────────
-- El dueño accede SOLO a los secretos de SUS negocios. Mismo shape que la policy
-- "business member access" de services/business_hours (subselect por owner_id, ver
-- schema.sql:111-121), porque business_secrets no tiene columna owner_id (joina por businesses).
--
-- IMPORTANTE: NO se crea NINGUNA policy de lectura para anon. El rol anon (que viaja al
-- browser con la anon key) no tiene ninguna policy que matchee → RLS deniega por defecto
-- → no puede leer ni una fila. El service role (lib/supabase/admin.ts) bypassa RLS y es el
-- único que lee/escribe estos secretos server-side; el dueño logueado accede a SU fila por
-- esta policy. Esto hace la exposición de columnas secretas estructuralmente imposible (D-01).
DROP POLICY IF EXISTS "owner access secrets" ON business_secrets;
CREATE POLICY "owner access secrets" ON business_secrets
  FOR ALL USING (business_id IN (
    SELECT id FROM businesses WHERE owner_id = auth.uid()
  ));

-- ── 3. Copia de datos (no mueve) desde businesses ────────────────────────────────────
-- Copia los valores actuales de los 7 secretos. ON CONFLICT DO NOTHING la hace idempotente:
-- re-correrla NO pisa un valor ya migrado. Los valores SIGUEN también en `businesses` hasta
-- 028 (doble red durante la transición; el DROP de esas columnas se difiere a 028, D-02).
INSERT INTO business_secrets (
  business_id, mp_access_token, mp_refresh_token, mp_token_expires_at,
  resend_api_key, resend_from, recaptcha_secret_key, google_refresh_token
)
SELECT
  id, mp_access_token, mp_refresh_token, mp_token_expires_at,
  resend_api_key, resend_from, recaptcha_secret_key, google_refresh_token
FROM businesses
ON CONFLICT (business_id) DO NOTHING;

-- ── 4. Vista pública acotada: public_services ─────────────────────────────────────────
-- services no tiene columnas secretas, pero la lectura pública (/[slug] hace select('*')
-- contra la tabla base hoy) pasa a esta vista acotada, igual que 026 para businesses y 007
-- para professionals. Corre como su dueño (security-definer, default Postgres → bypassa la
-- RLS de la tabla base tras el DROP de 028). Incluye WHERE active = true como 007.
-- NO usar WITH (security_invoker = true): correría como anon contra la tabla bloqueada tras
-- 028 y devolvería cero filas → página de reserva en blanco (Pitfall D).
CREATE OR REPLACE VIEW public_services AS
  SELECT
    id,
    business_id,
    name,
    duration_minutes,
    price,
    description,
    active,
    location_id,
    location_ids,
    created_at
  FROM services
  WHERE active = true;
GRANT SELECT ON public_services TO anon, authenticated;

-- ── 5. Vista pública acotada: public_business_hours ───────────────────────────────────
-- NOTA: hoy NINGÚN path público lee business_hours (la reserva pública usa time_blocks).
-- Esta vista es consistencia + defensa en profundidad: si algún día un path público lee
-- horarios, que lea la vista y no la tabla. El cierre real del agujero anon sobre la tabla
-- base es el DROP POLICY "public read hours" de 028. Sin security_invoker (mismo motivo
-- que public_services).
CREATE OR REPLACE VIEW public_business_hours AS
  SELECT
    id,
    business_id,
    day_of_week,
    open_time,
    close_time,
    is_open
  FROM business_hours;
GRANT SELECT ON public_business_hours TO anon, authenticated;
