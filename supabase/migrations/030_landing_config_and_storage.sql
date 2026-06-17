-- ============================================================
-- 030 · landing_config (dato) + vista acotada extendida + bucket público de assets
-- ============================================================
-- QUÉ agrega esta migración (web-builder, fase 06 — schema/storage seguro):
--   1. Una columna `landing_config jsonb` en `businesses` para guardar la config de la
--      landing como DATO (editable sin deploy) — CFG-01 / LAND-06. Nullable, default null:
--      los negocios legacy quedan intactos.
--   2. Extiende la vista acotada `public_businesses` para EXPONER landing_config a anon,
--      por columna explícita, SIN reabrir la fuga de secretos de v0.9 — CFG-02. Se re-lista
--      verbatim las 18 columnas de 026 + landing_config (19 en total). Los secretos que 028
--      dropeó/movió (mp_access_token, resend_api_key, google_refresh_token, …) NUNCA aparecen.
--   3. Un bucket de Storage `landing-assets` PÚBLICO (lectura por URL pública) con escritura
--      acotada por dueño y namespaceada por `{business_id}/` — CFG-04 / D-08 / D-09.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE VIEW, GRANT (re-aplicable),
--   INSERT ... ON CONFLICT DO NOTHING, DROP POLICY IF EXISTS antes de cada CREATE POLICY.
-- NO destructivo: no borra tablas, columnas ni filas (cero sentencias destructivas). El único
--   DROP es de policies de storage (DROP POLICY IF EXISTS), necesario para poder recrearlas.
-- ============================================================

-- ── 1. Columna landing_config (CFG-01 / LAND-06) ───────────────────────────────────────
-- Debe ir ANTES de la vista, porque la vista la referencia. Nullable + default null:
-- los negocios existentes no se ven afectados (siguen con landing_config = null).
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS landing_config jsonb;

-- ── 2. Vista acotada extendida (CFG-02) ────────────────────────────────────────────────
-- Re-crea public_businesses re-listando VERBATIM las 18 columnas de 026 + landing_config (19).
-- Reglas que se mantienen (skill RLS #4, Pitfall 1):
--   · Columnas EXPLÍCITAS, nunca el comodín de todas las columnas (eso volvería a arrastrar
--     lo que se agregue a la tabla base, reabriendo la fuga).
--   · SIN la cláusula de invocador (NO se usa WITH security-invoker): la vista corre como su
--     dueño y bypassa la RLS de la tabla base bloqueada (027 Pitfall D — con esa cláusula
--     correría como anon contra la tabla base lockeada y rompería /[slug]).
--   · Los secretos por tenant NO van en la lista: mp_access_token, mp_refresh_token,
--     mp_token_expires_at, resend_api_key, resend_from, recaptcha_secret_key,
--     google_refresh_token. (recaptcha_site_key SÍ va: es pública por diseño.)
CREATE OR REPLACE VIEW public_businesses AS
  SELECT
    id,
    owner_id,
    slug,
    name,
    type,
    vertical,
    logo_url,
    primary_color,
    whatsapp,
    address,
    instagram,
    require_deposit,
    deposit_amount,
    deposit_expiry_hours,
    recaptcha_site_key,
    default_slot_duration,
    buffer_minutes,
    created_at,
    landing_config
  FROM businesses;
GRANT SELECT ON public_businesses TO anon, authenticated;

-- ── 3. Bucket público de assets de la landing (CFG-04 / D-08) ──────────────────────────
-- public = true: las imágenes de la landing se sirven por URL pública (la lectura NO pasa
-- por RLS de storage.objects). Es lo opuesto al bucket `attachments` (003, public = false),
-- porque acá el contenido es justamente público (logos/fotos de la landing). NUNCA se guardan
-- secretos en este bucket. ON CONFLICT DO NOTHING lo hace re-aplicable.
INSERT INTO storage.buckets (id, name, public)
  VALUES ('landing-assets', 'landing-assets', true)
  ON CONFLICT (id) DO NOTHING;

-- ── 4. Escritura acotada por dueño en storage.objects (CFG-04 / D-09) ──────────────────
-- Mismo namespacing que 003: la primera carpeta del path (storage.foldername(name))[1] debe
-- ser un business_id que le pertenezca al usuario autenticado. Un upload fuera del propio
-- prefijo {business_id}/ es RECHAZADO por la policy (Pitfall 3 — anti-tampering cross-tenant).
--
-- Por qué policies POR OPERACIÓN (INSERT/UPDATE/DELETE) en lugar de un solo FOR ALL:
--   el bucket es público, así que la LECTURA se sirve por la URL pública y NO toca la RLS
--   de SELECT de storage.objects → solo las escrituras necesitan policy. Per-operación es la
--   forma más explícita (RESEARCH Open Q2) y deja claro que no hay policy de SELECT/anon.
-- NO se agrega policy de SELECT para anon: para un bucket público es innecesaria y solo
--   ampliaría la superficie (RESEARCH anti-pattern).
-- service_role bypassa RLS: el escritor F10 (skill writer) no necesita policy, pero igual
--   debe namespacear bajo {business_id}/ por convención (Pitfall 3).

-- INSERT: subir un asset solo dentro del propio prefijo {business_id}/.
DROP POLICY IF EXISTS "landing-assets owner insert" ON storage.objects;
CREATE POLICY "landing-assets owner insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'landing-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM businesses WHERE owner_id = auth.uid()
    )
  );

-- UPDATE: reemplazar/mover un asset solo dentro del propio prefijo {business_id}/.
DROP POLICY IF EXISTS "landing-assets owner update" ON storage.objects;
CREATE POLICY "landing-assets owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'landing-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM businesses WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'landing-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM businesses WHERE owner_id = auth.uid()
    )
  );

-- DELETE: borrar un asset solo dentro del propio prefijo {business_id}/.
DROP POLICY IF EXISTS "landing-assets owner delete" ON storage.objects;
CREATE POLICY "landing-assets owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'landing-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM businesses WHERE owner_id = auth.uid()
    )
  );

-- ============================================================
-- Verificación (correr a mano tras aplicar; NO son parte de la migración)
-- ============================================================
-- 1. La columna existe:
--    SELECT landing_config FROM public_businesses LIMIT 1;  -- devuelve fila/null, no "column does not exist"
-- 2. El bucket existe y es público:
--    SELECT id, public FROM storage.buckets WHERE id = 'landing-assets';  -- 1 fila, public = t
-- 3. La vista sigue negando secretos:
--    SELECT mp_access_token FROM public_businesses LIMIT 1;  -- error "column ... does not exist"
-- 4. Smoke cross-prefix (CFG-04 / SC#4), sesión authenticated del dueño B:
--    upload 'landing-assets'  →  '{bizA}/probe.png'         → RECHAZADO (no es su prefijo)
--    upload 'landing-assets'  →  '{ownerB_business_id}/probe.png' → OK + legible por URL pública
--    (service_role sube a cualquier prefijo: bypassa RLS por diseño.)
-- ============================================================
