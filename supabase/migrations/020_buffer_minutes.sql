-- Tiempo de descanso entre turnos (minutos). Se aplica como gap mínimo entre turnos
-- consecutivos al calcular la disponibilidad pública. 0 = sin buffer (comportamiento actual).
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS buffer_minutes integer NOT NULL DEFAULT 0;
