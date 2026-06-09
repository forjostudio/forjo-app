-- ============================================================
-- 014 · Estilo visual (theme) + tipografía (font) por negocio
-- ============================================================
-- Acompañan a `palette` (006). Tiñen el panel Y la página pública vía
-- data-theme / data-font en <html> (ver components/palette-script.tsx).
--   theme: forjo | modern | spa | cyber     (forjo = sin atributo, default)
--   font:  auto  | geometrica | bauhaus | elegante | tech | suave
--          (auto = fuente nativa del theme, sin atributo)
-- Viven en businesses (RLS owner-only), no requieren policy nueva.
-- Idempotente: ADD COLUMN IF NOT EXISTS. No destructivo.
-- ============================================================

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'forjo';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS font  TEXT NOT NULL DEFAULT 'auto';
