-- 029: eliminar policy "public read appointments" (agujero de aislamiento multi-tenant)
--
-- La policy "public read appointments" FOR SELECT USING(true) fue omitida por la migración 028,
-- que sí cerró las policies abiertas de services y business_hours. Al existir esta policy,
-- cualquier usuario autenticado podía leer todos los appointments de todos los negocios
-- (PostgreSQL combina permissive policies con OR → la policy abierta ganaba sobre la restrictiva).
--
-- La table ya tiene "business member access" FOR ALL USING(business_id IN (
--   SELECT id FROM businesses WHERE owner_id = auth.uid()
-- )) que cubre la lectura legítima del dueño. La ruta de disponibilidad pública
-- (booking/availability) usa service_role (createAdminClient), no depende de esta policy.

DROP POLICY IF EXISTS "public read appointments" ON appointments;
