-- ============================================================
-- 024 · Lectura pública de consultorios (anon)
-- ============================================================
-- La reserva pública (cliente anon) necesita leer los consultorios para mostrar el paso de
-- selección y el nombre/dirección del consultorio del turno. Faltaba la policy anon (como sí
-- tienen schedule_exceptions y time_blocks), así que llegaban vacíos. Datos no sensibles.
-- El dueño sigue gestionando con su propia policy (owner). Idempotente.
-- ============================================================

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read locations" ON locations;
CREATE POLICY "public read locations" ON locations
  FOR SELECT TO anon
  USING (true);
