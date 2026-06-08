-- ============================================================
-- 011 · Anti doble-booking: índice único parcial
-- ============================================================
-- Red de seguridad en la BASE contra dos turnos ACTIVOS en el mismo slot del mismo
-- profesional. La unicidad NO debe depender solo de la lógica client-side (el insert
-- público es read-then-insert con anon key, sin atomicidad). Esta es la última línea: si
-- dos requests se cuelan en la misma carrera, Postgres rechaza el segundo INSERT (error
-- 23505), y la app lo traduce a "ese horario se acaba de ocupar".
--
-- MODELO (verificado): los turnos son slots PUNTUALES — appointments.time es TIME y la
-- duración vive en services, NO en la fila del turno. Por eso un índice único sobre
-- (business_id, professional_id, date, time) es lo correcto y más simple. Un exclusion
-- constraint por rango (btree_gist + tstzrange) requeriría denormalizar la duración en la
-- tabla, lo cual no está modelado (sería otra etapa). appointments NO tiene location_id
-- (sucursal no está modelada en turnos), así que la constraint no la incluye.
--   ⚠ LIMITACIÓN conocida: esto impide dos turnos con el MISMO time de inicio. NO cubre
--   solapamientos con inicios distintos (ej. un servicio de 60min y otro de 30min que se
--   pisan). Ese caso sigue dependiendo de la lógica de la app y requeriría denormalizar la
--   duración + exclusion constraint en una etapa futura.
--
-- professional_id NULLABLE: cuando es null (negocio de 1 prof sin profesionales cargados, o
-- "sin preferencia"), dos NULL no colisionan en un índice único común (en SQL NULL != NULL).
-- Por eso usamos COALESCE a un UUID centinela: así dos turnos sin profesional en el mismo
-- slot también chocan y quedan protegidos. Ningún negocio queda sin red por no tener
-- profesionales cargados.
--
-- ESTADOS que ocupan el slot: 'confirmed' y 'pending_payment'. Se excluyen 'cancelled'
-- (libera el horario), 'completed' y 'pending'. Los pending_payment vencidos los pasa a
-- 'cancelled' el cron cancel-expired, con lo que salen del índice y liberan el slot.
--
-- TENANT: el índice incluye business_id como primera columna → la unicidad es por negocio;
-- dos negocios distintos nunca chocan entre sí. Aislamiento por tenant intacto.
--
-- ⚠ Idempotente (CREATE UNIQUE INDEX IF NOT EXISTS) y NO destructivo. PERO la creación
-- FALLA si ya existen duplicados activos en la tabla. Correr ANTES la query de detección
-- (ver README / el bloque comentado de abajo). Si hay duplicados, resolverlos a mano
-- (cancelar/eliminar el sobrante) — esta migración NO borra datos.
-- ============================================================

-- Detección de duplicados ANTES de aplicar (correr por separado; debe devolver 0 filas):
--
--   SELECT business_id,
--          COALESCE(professional_id, '00000000-0000-0000-0000-000000000000'::uuid) AS prof,
--          date, time, COUNT(*) AS n, array_agg(id) AS ids
--   FROM appointments
--   WHERE status IN ('confirmed', 'pending_payment')
--   GROUP BY business_id,
--            COALESCE(professional_id, '00000000-0000-0000-0000-000000000000'::uuid),
--            date, time
--   HAVING COUNT(*) > 1
--   ORDER BY n DESC;

CREATE UNIQUE INDEX IF NOT EXISTS appointments_no_double_booking
  ON appointments (
    business_id,
    COALESCE(professional_id, '00000000-0000-0000-0000-000000000000'::uuid),
    date,
    time
  )
  WHERE status IN ('confirmed', 'pending_payment');
