-- ============================================================
-- 007 · Profesionales: datos ampliados + aislamiento del contacto del staff
-- ============================================================
-- Campos nuevos: apellido, especialidad, matrícula, teléfono, email.
-- Seguridad (skill RLS, regla #4): la lectura pública pasa de la tabla ENTERA a una vista
-- acotada, para no exponer teléfono/email/matrícula del staff al rol anon.
-- Idempotente: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE VIEW, DROP POLICY IF EXISTS.
-- No destructivo de datos (sin DROP TABLE / DROP COLUMN / DELETE).
-- ============================================================

ALTER TABLE professionals ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS specialty TEXT;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS license_number TEXT;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS email TEXT;

-- Vista pública acotada: la reserva pública solo necesita id, nombre y especialidad para
-- el paso "elegí profesional". La vista corre como su dueño (bypassa la RLS de la tabla)
-- y expone únicamente columnas no sensibles.
CREATE OR REPLACE VIEW public_professionals AS
  SELECT id, business_id, name, specialty, active
  FROM professionals
  WHERE active = true;
GRANT SELECT ON public_professionals TO anon, authenticated;

-- ⚠ Quita la lectura pública directa de la tabla ENTERA (la policy "public read
-- professionals" creada en el schema base, que exponía toda la fila a anon). Es un
-- DROP POLICY (no de datos) e idempotente. Tras esto, anon lee SOLO la vista de arriba.
DROP POLICY IF EXISTS "public read professionals" ON professionals;
