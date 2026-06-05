-- ============================================================
-- 009 · Token de cancelación por turno
-- ============================================================
-- Token único e impredecible por turno para el link de cancelación del email.
-- NO se cancela por id secuencial: la página pública resuelve el turno por este token.
-- Default gen_random_uuid() → se autogenera en cada INSERT y backfillea los turnos
-- existentes (cada fila recibe un uuid distinto). Índice único para lookup O(1).
-- Vive en appointments (ya con RLS) → no requiere policy nueva.
-- Idempotente: ADD COLUMN IF NOT EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS. No destructivo.
-- ============================================================

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS cancel_token UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS appointments_cancel_token_idx ON appointments(cancel_token);
