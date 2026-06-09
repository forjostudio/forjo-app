-- ============================================================
-- 017 · Excepciones de horario por fecha (Capa 1)
-- ============================================================
-- Permite anular o cambiar el horario de un DÍA puntual, por encima de la grilla
-- semanal (time_blocks). Ej: "el 23/06 no trabajo" o "el 24/06 abro 10-14".
--   closed = true  → ese día NO hay disponibilidad (cerrado completo).
--   closed = false → horario especial ese día (usa start_time/end_time).
-- Una excepción por (negocio, fecha). RLS owner-only; la reserva pública las lee
-- server-side con service role (admin), no necesita policy anon.
-- Idempotente (IF NOT EXISTS / DROP POLICY IF EXISTS). No destructivo.
-- ============================================================

CREATE TABLE IF NOT EXISTS schedule_exceptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  date        date NOT NULL,
  closed      boolean NOT NULL DEFAULT true,
  start_time  time,
  end_time    time,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, date)
);

CREATE INDEX IF NOT EXISTS schedule_exceptions_business_date
  ON schedule_exceptions (business_id, date);

ALTER TABLE schedule_exceptions ENABLE ROW LEVEL SECURITY;

-- El dueño (businesses.owner_id = auth.uid()) gestiona las excepciones de su negocio.
DROP POLICY IF EXISTS "owner manage schedule_exceptions" ON schedule_exceptions;
CREATE POLICY "owner manage schedule_exceptions" ON schedule_exceptions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = schedule_exceptions.business_id AND b.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM businesses b WHERE b.id = schedule_exceptions.business_id AND b.owner_id = auth.uid()));

-- Lectura pública (anon) para que la reserva oculte días cerrados/especiales. Solo SELECT,
-- solo anon (los dueños usan la policy de arriba, acotada a su negocio). Dato no sensible.
DROP POLICY IF EXISTS "public read schedule_exceptions" ON schedule_exceptions;
CREATE POLICY "public read schedule_exceptions" ON schedule_exceptions
  FOR SELECT TO anon
  USING (true);
