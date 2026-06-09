-- ============================================================
-- 016 · Link de Google Maps del local (opcional)
-- ============================================================
-- El dueño puede pegar el link de Google Maps de su local. Si está, los botones
-- "Ver en el mapa" / "Cómo llegar" de la confirmación llevan exactamente ahí, en vez
-- de una búsqueda por texto de la dirección. Dato no sensible.
-- Idempotente y no destructivo.
-- ============================================================

ALTER TABLE businesses ADD COLUMN IF NOT EXISTS maps_url TEXT;
