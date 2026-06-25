-- ============================================================
-- 005 · Widgets del dashboard (selección por negocio)
-- ============================================================
-- Subconjunto de widgets que el negocio elige mostrar en el dashboard. NULL = todos.
-- Vive en businesses (ya con RLS owner-only), así que no requiere policy nueva.
-- Idempotente: ADD COLUMN IF NOT EXISTS. No destructivo.
-- ============================================================

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS dashboard_widgets JSONB;
