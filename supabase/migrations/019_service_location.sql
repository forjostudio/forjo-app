-- Consultorio por servicio: cada servicio puede prestarse en un consultorio
-- (locations) determinado. Opcional; null = se presta en cualquier consultorio /
-- sede única. Si el bloque de horario no tiene consultorio propio (Capa 2a), este
-- valor define el consultorio del turno. ON DELETE SET NULL: borrar el consultorio
-- no rompe el servicio, solo lo deja sin consultorio asignado.
ALTER TABLE services ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS services_location ON services (location_id);
