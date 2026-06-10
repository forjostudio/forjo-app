-- Integración con Google Calendar. El dueño conecta su cuenta (OAuth) y guardamos el
-- refresh_token; con él pedimos access_tokens para crear/borrar eventos de sus turnos.
-- google_event_id en el turno permite borrar el evento si el turno se cancela.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS google_refresh_token text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS google_event_id text;
