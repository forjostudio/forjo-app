-- ============================================================
-- 028 · Cierre del agujero: lock de tablas base + DROP de columnas-secreto — MITAD DESTRUCTIVA
-- ============================================================
-- ⚠⚠ MIGRACIÓN DESTRUCTIVA — ROMPE DELIBERADAMENTE LA CONVENCIÓN "NADA DESTRUCTIVO" DEL README.
-- Esta es la MITAD DESTRUCTIVA del fix de aislamiento de secretos (SEC-01). La mitad aditiva
-- es 027 (crea business_secrets + copia los datos + vistas acotadas public_services /
-- public_business_hours). Acá se cierra el agujero de raíz:
--   1. DROP de las policies abiertas USING(true) que le daban a anon lectura de las tablas
--      base `services` y `business_hours` (el hueco que exponía toda la fila).
--   2. DROP de las 7 columnas-secreto en `businesses` (los datos ya están en business_secrets
--      desde 027; 026 ya quitó la lectura anon de la fila entera de businesses → "copiar no es
--      mover", Pitfall G: si no se dropean, los secretos siguen FÍSICAMENTE en businesses).
--
-- ⚠ ORDEN SEGURO — NO CORRER ANTES DE TIEMPO (D-02, additive-first):
--   028 SOLO debe aplicarse DESPUÉS de que:
--     a. 027 esté aplicada (business_secrets poblada, vistas creadas), y
--     b. el código de las olas 2 (planes 01-02 / 01-03 / 01-04) que lee de business_secrets
--        (con fallback transitorio a businesses) y lee servicios de public_services esté
--        DEPLOYADO en Vercel, y
--     c. el smoke test live haya pasado (checkpoint:human-verify del plan 01-05): /[slug]
--        carga, un pago de seña confirma, settings guarda/lee secretos, Google Calendar OK.
--   Correr 028 antes de (b)+(c) rompe pagos/emails en silencio (Pitfall B): el código viejo
--   leería columnas que ya no existen. El checkpoint blocking del plan gatea esto.
--
-- Idempotente: DROP POLICY IF EXISTS, DROP COLUMN IF EXISTS. Correr dos veces no rompe.
-- IRREVERSIBLE en datos: DROP COLUMN borra las columnas-secreto de businesses para siempre.
--   Tomar un backup/snapshot de la base (Supabase → Database → Backups) ANTES de correr.
-- ============================================================

-- ── 1. Cerrar la lectura anon de `services` ────────────────────────────────────────────
-- El schema base creó "public read services" ON services FOR SELECT USING (true) (schema.sql:144),
-- que le daba al rol anon lectura de la tabla base entera. La lectura pública pasa a la vista
-- acotada public_services (creada en 027). Quitar la policy abierta cierra el acceso directo.
-- ⚠ NOMBRE EXACTO: "public read services" (verificado en schema.sql:144). Un nombre equivocado
-- haría del DROP un no-op silencioso y dejaría el hueco abierto (Pitfall A).
DROP POLICY IF EXISTS "public read services" ON services;

-- ── 2. Cerrar la lectura anon de `business_hours` ──────────────────────────────────────
-- Idéntico: "public read hours" ON business_hours FOR SELECT USING (true) (schema.sql:147).
-- Hoy ningún path público lee business_hours (la reserva usa time_blocks), pero la policy
-- abierta igual exponía la tabla a anon. La vista public_business_hours (027) queda como
-- lectura pública si algún día se necesita.
-- ⚠ NOMBRE EXACTO: "public read hours" — NO el nombre largo derivado del nombre de la tabla.
-- El nombre equivocado deja el DROP como no-op silencioso y el hueco abierto (Pitfall A,
-- verificado en schema.sql:147; la policy NUNCA se llamó por el nombre de la tabla).
DROP POLICY IF EXISTS "public read hours" ON business_hours;

-- ── 3. DROP de las 7 columnas-secreto en `businesses` ──────────────────────────────────
-- Los valores ya viven en business_secrets (copiados por 027) y 026 ya quitó la lectura anon
-- de businesses. Dropear las columnas hace la exposición estructuralmente imposible: aunque
-- alguien recuperara una policy de lectura, no hay columna-secreto que leer (defensa en
-- profundidad). RESEARCH §3 paso 4 recomienda DROP COLUMN sobre UPDATE NULL.
-- NO se dropean mp_user_id (id de cuenta MP, flag de UI, no es secreto), recaptcha_site_key
-- (pública por diseño, va al browser) ni notification_email (contacto interno, no credencial).
ALTER TABLE businesses DROP COLUMN IF EXISTS mp_access_token;
ALTER TABLE businesses DROP COLUMN IF EXISTS mp_refresh_token;
ALTER TABLE businesses DROP COLUMN IF EXISTS mp_token_expires_at;
ALTER TABLE businesses DROP COLUMN IF EXISTS resend_api_key;
ALTER TABLE businesses DROP COLUMN IF EXISTS resend_from;
ALTER TABLE businesses DROP COLUMN IF EXISTS recaptcha_secret_key;
ALTER TABLE businesses DROP COLUMN IF EXISTS google_refresh_token;

-- ============================================================
-- Verificación (correr a mano tras aplicar; NO son parte de la migración)
-- ============================================================
-- 1. Las policies abiertas ya NO existen:
--    SELECT polname FROM pg_policy WHERE polrelid = 'services'::regclass;        -- sin "public read services"
--    SELECT polname FROM pg_policy WHERE polrelid = 'business_hours'::regclass;  -- sin "public read hours"
--
-- 2. RLS sigue habilitada en las tres tablas:
--    SELECT relrowsecurity FROM pg_class WHERE relname IN ('services','business_hours','business_secrets');  -- todas true
--
-- 3. Las 7 columnas-secreto ya no existen en businesses (mp_user_id / recaptcha_site_key /
--    notification_email SIGUEN):
--    \d businesses
--    -- o:
--    SELECT column_name FROM information_schema.columns
--      WHERE table_name = 'businesses'
--        AND column_name IN (
--          'mp_access_token','mp_refresh_token','mp_token_expires_at',
--          'resend_api_key','resend_from','recaptcha_secret_key','google_refresh_token'
--        );  -- 0 filas
--
-- 4. Probe de aislamiento real con la ANON key (vía REST):
--    select=mp_access_token sobre businesses  → falla (columna inexistente)
--    select=*               sobre services    → vacío/denegado (sin policy de lectura)
--    /[slug] debe seguir cargando (lee public_businesses / public_services / public_professionals).
-- ============================================================
