-- ============================================================
-- 013 · Anti-solapamiento: exclusion constraint por rango horario
-- ============================================================
-- El índice 011 solo impedía dos turnos con el MISMO time de inicio. Esto cierra el
-- solapamiento real: dos turnos del mismo profesional cuyos rangos [inicio, fin) se pisan,
-- aunque empiecen en horarios distintos (ej. uno de 60min a las 10:00 y otro de 30min a las
-- 10:30). Para poder construir el rango se denormaliza la duración en la fila del turno
-- (hoy vive en services). El alta (pública y admin) ya escribe duration_minutes.
--
-- MODELO: por profesional (coalesce sentinel, igual que 011). Rango [inicio, fin) con tsrange
-- '[)' → los turnos pegados (10:00-10:30 y 10:30-11:00) NO se consideran solapados (correcto).
-- Estados que ocupan: confirmed + pending_payment (cancelled/completed/pending no).
--
-- El índice 011 queda SUBSUMIDO por esta constraint (el mismo inicio exacto es un caso de
-- solapamiento) pero se MANTIENE: es redundante e inocuo, y la app sigue capturando tanto su
-- 23505 como el 23P01 de esta constraint.
--
-- ⚠ NO idempotente por sí solo el ADD CONSTRAINT → va en un DO con guard por pg_constraint.
-- El resto (extension, ADD COLUMN, backfill) sí es idempotente. NO destructivo.
--
-- ⚠ La constraint FALLA si ya hay turnos activos solapados. Correr ANTES la detección (abajo)
-- DESPUÉS del backfill; si hay solapados, resolverlos a mano (no se borran acá).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Duración denormalizada (minutos). El alta la escribe; acá se backfillea lo existente.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;

-- Backfill: duración del servicio del turno; sin servicio, el slot por defecto del negocio;
-- último fallback 30. Solo toca filas sin duración seteada.
UPDATE appointments a
SET duration_minutes = COALESCE(
  (SELECT s.duration_minutes FROM services s WHERE s.id = a.service_id),
  (SELECT b.default_slot_duration FROM businesses b WHERE b.id = a.business_id),
  30
)
WHERE a.duration_minutes IS NULL;

-- Detección de solapamientos ANTES de crear la constraint (correr por separado tras el
-- backfill; debe devolver 0 filas):
--
--   SELECT a1.id AS id_1, a2.id AS id_2, a1.business_id, a1.date,
--          a1.time AS inicio_1, a1.duration_minutes AS dur_1,
--          a2.time AS inicio_2, a2.duration_minutes AS dur_2
--   FROM appointments a1
--   JOIN appointments a2
--     ON a1.business_id = a2.business_id
--    AND COALESCE(a1.professional_id, '00000000-0000-0000-0000-000000000000'::uuid)
--      = COALESCE(a2.professional_id, '00000000-0000-0000-0000-000000000000'::uuid)
--    AND a1.date = a2.date
--    AND a1.id < a2.id
--   WHERE a1.status IN ('confirmed','pending_payment')
--     AND a2.status IN ('confirmed','pending_payment')
--     AND tsrange((a1.date + a1.time), (a1.date + a1.time) + (COALESCE(a1.duration_minutes,30) || ' minutes')::interval)
--      && tsrange((a2.date + a2.time), (a2.date + a2.time) + (COALESCE(a2.duration_minutes,30) || ' minutes')::interval);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_no_overlap') THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_no_overlap
    EXCLUDE USING gist (
      business_id WITH =,
      COALESCE(professional_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
      tsrange(
        (date + time),
        (date + time) + (COALESCE(duration_minutes, 30) || ' minutes')::interval
      ) WITH &&
    ) WHERE (status IN ('confirmed', 'pending_payment'));
  END IF;
END $$;
