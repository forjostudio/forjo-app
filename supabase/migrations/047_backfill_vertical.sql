-- 047 — Backfill de businesses.vertical desde `type` (rework del selector de rubro, v0.14 Phase 3).
--
-- ✅ MIGRACIÓN ADITIVA Y NO DESTRUCTIVA — no elimina ni reestructura nada. Segura de correr.
--
-- Contexto (rework del selector de rubro — Phase 3, D-07/D-08):
--   Hasta ahora el `type` granular (subtipo: 'Peluquería', 'Médico', 'Cancha de pádel', …) era la
--   fuente de resolución del vertical vía getVerticalKeyByType() (lib/verticals.ts). Esta fase invierte
--   el modelo: el RUBRO elegido se guarda en la columna `vertical` (salud/belleza/general/canchas) y el
--   `type` pasa a ser texto libre de display (la categoría visible en la página pública de reservas).
--   Para eso, el código de 03-02/03-03 VACÍA los arrays VERTICALS[*].types. Una vez vacíos,
--   getVerticalKeyByType() ya NO puede recuperar el vertical de un `type` granular (p. ej. 'Peluquería'
--   dejaría de resolver 'belleza'). Este backfill escribe `vertical` para los negocios existentes ANTES
--   de ese vaciado, de modo que sigan resolviendo su vertical vía la columna `vertical`. Cero regresión.
--
-- Por qué es SEGURO (aditiva, aislada por fila — D-08):
--   - Solo escribe la columna `vertical` donde está NULL; NO modifica `type` de ninguna fila (D-08 lo
--     prohíbe explícitamente: el `type` guardado sigue mostrándose como categoría en el booking).
--   - Deriva el nuevo `vertical` del `type` de CADA fila individualmente (CASE por valor). No cruza
--     filas ni tenants: es una data-migration por fila, dentro del aislamiento por business_id vigente.
--   - `WHERE vertical IS NULL` → no pisa verticales ya elegidos en onboarding/settings.
--   - Idempotente: correrla dos veces no rompe (la 2da vez no hay filas con vertical NULL que tocar).
--   - CASE total (`ELSE 'general'`) → post-condición: NINGUNA fila queda con vertical NULL. Validar con
--     `SELECT count(*) FROM businesses WHERE vertical IS NULL;` → debe dar 0.
--
-- Qué NO hace (invariantes del proyecto):
--   - NO agrega restricción alguna a la columna `vertical` (fuera de scope; no existe en el baseline).
--   - NO toca la columna `type`, ni ninguna otra tabla.
--   - NO se aplica vía push remoto. La ÚNICA validación es `supabase db reset` local (PG17), que replaya
--     el baseline numerado + 040..047 en orden. Prod se aplica A MANO, coordinada con el deploy del
--     código de esta fase (Vercel Hobby). NUNCA correr `supabase db push`. El backfill es data-only ⇒
--     `supabase/schema.sql` NO cambia estructuralmente (no hace falta regenerarlo por esta migración).
--
-- Mapping derivado 1:1 de lib/verticals.ts:43,67,88,106 (VERTICALS[*].types) + :129-135 (LEGACY_TYPE_VERTICAL).

UPDATE public.businesses
SET vertical = CASE type
  -- salud (VERTICALS.salud.types + legacy salud)
  WHEN 'Médico' THEN 'salud'
  WHEN 'Psicólogo' THEN 'salud'
  WHEN 'Kinesiólogo' THEN 'salud'
  WHEN 'Odontólogo' THEN 'salud'
  WHEN 'Nutricionista' THEN 'salud'
  WHEN 'Centro médico' THEN 'salud'
  WHEN 'Psicología' THEN 'salud'
  WHEN 'Odontología' THEN 'salud'
  WHEN 'Kinesiología' THEN 'salud'
  -- belleza (VERTICALS.belleza.types + legacy 'Estética')
  WHEN 'Peluquería' THEN 'belleza'
  WHEN 'Barbería' THEN 'belleza'
  WHEN 'Centro de estética' THEN 'belleza'
  WHEN 'Manicura' THEN 'belleza'
  WHEN 'Spa' THEN 'belleza'
  WHEN 'Estética' THEN 'belleza'
  -- canchas (VERTICALS.canchas.types)
  WHEN 'Cancha de fútbol' THEN 'canchas'
  WHEN 'Cancha de pádel' THEN 'canchas'
  WHEN 'Cancha de tenis' THEN 'canchas'
  WHEN 'Cancha de básquet' THEN 'canchas'
  -- general (VERTICALS.general.types) + 'Otro' + texto libre viejo + type NULL → 'general'
  ELSE 'general'
END
WHERE vertical IS NULL;
