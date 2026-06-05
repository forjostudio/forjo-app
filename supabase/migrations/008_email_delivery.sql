-- ============================================================
-- 008 · Confiabilidad del email de confirmación
-- ============================================================
-- appointments: flag de envío del email de confirmación (para detectar fallos sin
-- reintentos) + motivo del último error.
-- businesses: email remitente propio, para negocios que usan su PROPIA key de Resend
-- (deben mandar desde un dominio verificado en SU cuenta, no @forjo.studio).
-- Viven en tablas que ya tienen RLS → no requieren policy nueva.
-- Idempotente: ADD COLUMN IF NOT EXISTS. No destructivo.
-- ============================================================

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS email_sent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS email_error TEXT;

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS resend_from TEXT;
