-- ============================================================
-- 018 · Consultorios en la agenda (Capa 2a)
-- ============================================================
-- Cada bloque de horario puede pertenecer a un consultorio/sucursal, y cada turno
-- guarda en qué consultorio quedó. Ambos nullable (negocio de una sola sede sigue
-- igual, con location_id = NULL). ON DELETE SET NULL: borrar un consultorio no rompe
-- bloques/turnos, solo los deja sin sede.
-- Idempotente y no destructivo.
-- ============================================================

ALTER TABLE time_blocks  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES locations(id) ON DELETE SET NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS time_blocks_location ON time_blocks (location_id);
