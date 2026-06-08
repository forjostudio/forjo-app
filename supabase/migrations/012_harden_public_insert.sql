-- ============================================================
-- 012 · Endurecer el insert público de turnos
-- ============================================================
-- La creación de turnos públicos pasó a un route handler server-side
-- (/api/booking/create, service role) que verifica reCAPTCHA fail-closed, valida que el
-- servicio/profesional sean del negocio, re-chequea disponibilidad e inserta capturando el
-- índice anti doble-booking (011). Con eso, el insert ANÓNIMO DIRECTO desde el cliente ya no
-- debe existir: quitamos las policies que lo permitían (WITH CHECK (true)).
--
-- Tras esto, anon NO puede insertar appointments ni clients. El endpoint usa service role
-- (bypassa RLS), así que la reserva pública sigue funcionando. El alta desde el panel sigue
-- cubierta por la policy "business member access" (el dueño autenticado).
--
-- La lectura pública de appointments NUNCA existió (no había policy de SELECT para anon): la
-- disponibilidad ahora la sirve /api/booking/availability (service role, solo
-- time/status/expires_at). No hay nada que revocar en lectura.
--
-- ⚠ COORDINACIÓN con el deploy: aplicar ESTA migración DESPUÉS de deployar el código nuevo.
-- Si se aplica antes, el cliente viejo (que todavía inserta con anon key) queda sin poder
-- reservar. Al revés es inocuo: el código nuevo no usa el insert anónimo.
--
-- ⚠ Idempotente (DROP POLICY IF EXISTS) y reversible (se podría recrear con WITH CHECK
-- (true)). NO destructivo de datos.
-- ============================================================

DROP POLICY IF EXISTS "public insert appointments" ON appointments;
DROP POLICY IF EXISTS "public insert clients" ON clients;
