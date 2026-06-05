-- ============================================================
-- 001 · Pagos, señas y notificaciones
-- ============================================================
-- businesses: credenciales de MercadoPago, config de seña, notificaciones (Resend)
-- y anti-spam (reCAPTCHA). appointments: estado de seña / pago.
-- Idempotente: ADD COLUMN IF NOT EXISTS. No destructivo.
-- ============================================================

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS mp_access_token TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS require_deposit BOOLEAN DEFAULT FALSE;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS deposit_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS deposit_expiry_hours INTEGER DEFAULT 1;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS notification_email TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS resend_api_key TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS recaptcha_site_key TEXT;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS recaptcha_secret_key TEXT;

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS deposit_paid BOOLEAN DEFAULT FALSE;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS deposit_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS mp_payment_id TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
