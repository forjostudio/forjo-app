-- ============================================================
-- 025 · Servicio ofrecido en varios consultorios
-- ============================================================
-- Un servicio puede prestarse en uno o varios consultorios (según equipamiento).
-- location_ids = array de consultorios donde se ofrece. NULL o vacío = en todos.
-- Reemplaza al location_id único (que queda como legacy; la reserva prioriza location_ids).
-- Sin FK por elemento: si se borra un consultorio, los ids viejos quedan inertes (la reserva
-- filtra por consultorios existentes). services ya se lee público, no hace falta RLS nueva.
-- ============================================================

ALTER TABLE services ADD COLUMN IF NOT EXISTS location_ids uuid[];
