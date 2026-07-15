-- 051 — landing-assets: gatear el UPLOAD por has_web_custom (Phase 17 / PUB-01 · SC2, 4ª superficie del CMS).
--
-- Contexto:
--   El editor CMS (Phase 14) sube imágenes DIRECTO a Supabase Storage desde el browser con el session
--   client (ver app/(dashboard)/web/_sections/image-controls.tsx). NO pasa por Server Action, así que
--   su ÚNICO gate no-bypasseable es la RLS del bucket `landing-assets`. Hasta hoy (migr. 030) esa RLS
--   gatea `owner_id` (aislamiento cross-tenant: OK) pero NO el add-on `has_web_custom`: un dueño SIN el
--   add-on puede subir objetos a su propio prefijo `landing-assets/{business_id}/`. Al retirar el
--   kill-switch global `CMS_ENABLED` (plan 17-01), el gate único `has_web_custom` tiene que sostener en
--   las 4 superficies del CMS (guardar, publicar, descartar y UPLOAD). Las 3 primeras ya lo gatean en la
--   Server Action; esta migración cierra la 4ª (el upload) en la RLS del bucket.
--
-- Qué hace:
--   Re-crea SOLO las policies INSERT y UPDATE del bucket `landing-assets`, agregando
--   `AND has_web_custom = true` al subquery de businesses. El add-on real está protegido por el trigger
--   `businesses_protect_admin_columns` (el dueño no puede auto-otorgárselo por anon key → verificado en
--   test/isolation.test.ts). Nombres de policy EXACTOS y mismas cláusulas de 030 (solo se suma el AND).
--
-- Qué NO hace:
--   - NO toca la policy DELETE ("landing-assets owner delete"): queda owner-only (sin has_web_custom).
--     Gatearla impediría que un negocio recién desactivado limpie sus propios objetos, y borrar assets
--     propios no es escalada ni pone contenido en la web pública (RESEARCH Open Q2 / T-17-07 = accept).
--   - NO rompe la skill del operador: el writer usa service-role, que bypassa RLS → inmune a este cambio.
--   - NO afecta la subida del LOGO de Configuración: usa OTRO bucket, no `landing-assets`.
--   - NO agrega policy de SELECT/anon: el bucket es público, se lee por URL (la lectura no toca esta RLS).
--
-- Por qué el guard `to_regclass('storage.objects') IS NOT NULL`:
--   El Storage está DESHABILITADO en el baseline local (`supabase/config.toml` → `[storage] enabled =
--   false`) y `storage.objects` NO existe en el reset local. DDL crudo sobre `storage.objects` rompería
--   `supabase db reset`. Envolviendo TODO el DDL en un guard de existencia, el reset local lo corre como
--   NO-OP (baseline sigue replayable) y en prod/staging (donde `storage.objects` SÍ existe) el gate se
--   materializa de verdad. Los DROP/CREATE POLICY van por SQL dinámico dentro del bloque DO.
--
-- Aplicación (convención del repo):
--   La ÚNICA validación autónoma es `supabase db reset` local (PG17), donde esta migración no-opea. A
--   STAGING (forjo-staging) y PROD se aplica A MANO y en orden, coordinado con el deploy del código de
--   17-01 (no exponer el CMS sin el gate del upload aplicado). NO se hace db push remoto por la CLI.
--   051 = primera libre (050 es la última). No renumera ni edita ninguna migración ajena (040..050).

DO $mig$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    -- INSERT: subir un asset solo dentro del propio prefijo {business_id}/ Y con el add-on activo.
    EXECUTE $sql$ DROP POLICY IF EXISTS "landing-assets owner insert" ON storage.objects $sql$;
    EXECUTE $sql$
      CREATE POLICY "landing-assets owner insert" ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (
          bucket_id = 'landing-assets'
          AND (storage.foldername(name))[1] IN (
            SELECT id::text FROM businesses
            WHERE owner_id = auth.uid() AND has_web_custom = true
          )
        )
    $sql$;

    -- UPDATE: reemplazar/mover un asset solo dentro del propio prefijo {business_id}/ Y con el add-on activo.
    EXECUTE $sql$ DROP POLICY IF EXISTS "landing-assets owner update" ON storage.objects $sql$;
    EXECUTE $sql$
      CREATE POLICY "landing-assets owner update" ON storage.objects
        FOR UPDATE TO authenticated
        USING (
          bucket_id = 'landing-assets'
          AND (storage.foldername(name))[1] IN (
            SELECT id::text FROM businesses
            WHERE owner_id = auth.uid() AND has_web_custom = true
          )
        )
        WITH CHECK (
          bucket_id = 'landing-assets'
          AND (storage.foldername(name))[1] IN (
            SELECT id::text FROM businesses
            WHERE owner_id = auth.uid() AND has_web_custom = true
          )
        )
    $sql$;

    -- DELETE: NO se toca (queda owner-only, migr. 030). Ver cabecera (Open Q2 / T-17-07).
  END IF;
END
$mig$;

-- ============================================================
-- Verificación (correr a mano tras aplicar; NO son parte de la migración)
-- ============================================================
-- Sesión authenticated de un dueño con has_web_custom = false:
--   upload 'landing-assets' → '{propio_business_id}/probe.png' → RECHAZADO (403 / violación de policy).
-- Setear has_web_custom = true en ese negocio (toggle admin CRM, service-role) y repetir:
--   upload 'landing-assets' → '{propio_business_id}/probe.png' → OK (el editor de Phase 14 no se rompe).
-- service_role sube a cualquier prefijo: bypassa RLS por diseño (skill del operador intacta).
-- Tras aplicar en prod/staging: NOTIFY pgrst, 'reload schema';  (refresca el schema cache de PostgREST).
-- ============================================================
