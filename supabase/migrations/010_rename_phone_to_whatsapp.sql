-- ============================================================
-- 010 · Renombrar businesses.phone -> whatsapp
-- ============================================================
-- El campo de contacto del negocio pasa a ser WhatsApp (se normaliza a formato wa.me al
-- guardar). Solo afecta businesses.phone; clients/professionals/locations.phone y
-- appointments.client_phone NO se tocan.
-- Idempotente: el rename corre SOLO si todavía existe `phone` y no existe `whatsapp`
-- (correrlo dos veces no rompe). No destructivo: RENAME preserva los datos.
--
-- ⚠ COORDINACIÓN: el rename y el deploy del código que usa `whatsapp` están acoplados.
-- Corré esta migración junto con el deploy (idealmente inmediatamente después) para
-- minimizar la ventana en que el código nuevo lee `whatsapp` y la columna aún es `phone`.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'phone'
      )
     AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'businesses' AND column_name = 'whatsapp'
      )
  THEN
    ALTER TABLE businesses RENAME COLUMN phone TO whatsapp;
  END IF;
END $$;
