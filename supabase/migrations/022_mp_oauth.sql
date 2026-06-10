-- MercadoPago Connect (OAuth): el negocio conecta su cuenta de MP con un botón y guardamos
-- su access_token (en mp_access_token, igual que el manual) + el refresh_token, su user_id y
-- la expiración. El flujo de seña sigue usando mp_access_token sin cambios.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS mp_refresh_token text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS mp_user_id text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS mp_token_expires_at timestamptz;
