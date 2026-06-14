-- ============================================================
-- 023 · Días especiales por consultorio
-- ============================================================
-- Hasta ahora una excepción era global por (negocio, fecha). Ahora puede ser por consultorio:
--   location_id NULL → aplica a TODO el negocio (global, como antes).
--   location_id = X  → aplica solo a ese consultorio ese día.
-- Reemplaza la unicidad (business_id,date) por (business_id,date,location_id), tratando NULL
-- como un valor (NULLS NOT DISTINCT, Postgres 15+) para que no haya dos globales del mismo día.
-- ON DELETE CASCADE: si se borra el consultorio, se borran sus excepciones.
-- ============================================================

ALTER TABLE schedule_exceptions ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES locations(id) ON DELETE CASCADE;

ALTER TABLE schedule_exceptions DROP CONSTRAINT IF EXISTS schedule_exceptions_business_id_date_key;

CREATE UNIQUE INDEX IF NOT EXISTS schedule_exceptions_biz_date_loc
  ON schedule_exceptions (business_id, date, location_id) NULLS NOT DISTINCT;
