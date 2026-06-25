-- ============================================================
-- 006 · Paleta de color por negocio (rebrand Forjo)
-- ============================================================
-- Tiñe el panel y la página pública vía data-palette. Valores: red|blue|yellow|green|ink.
-- Vive en businesses (RLS owner-only), no requiere policy nueva.
-- Idempotente: ADD COLUMN IF NOT EXISTS. No destructivo.
-- ============================================================

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS palette TEXT NOT NULL DEFAULT 'red';
