-- ============================================================
-- 015 · Exponer la foto del profesional en la vista pública
-- ============================================================
-- La columna professionals.photo_url ya existe (schema base). La reserva pública lee
-- public_professionals (vista acotada, 007) que NO la incluía. La agregamos para mostrar
-- el avatar del profesional en el paso "elegí profesional". Es un dato no sensible.
-- photo_url va AL FINAL: CREATE OR REPLACE VIEW solo permite añadir columnas al final.
-- Idempotente y no destructivo.
-- ============================================================

CREATE OR REPLACE VIEW public_professionals AS
  SELECT id, business_id, name, specialty, active, photo_url
  FROM professionals
  WHERE active = true;
GRANT SELECT ON public_professionals TO anon, authenticated;
