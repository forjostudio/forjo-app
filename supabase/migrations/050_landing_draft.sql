-- 050 — businesses.landing_draft: separar BORRADOR de PUBLICADO (v0.18 / PUB-03..PUB-08).
--
-- Contexto:
--   Hasta hoy `landing_config` era a la vez "lo que edito" y "lo que está al aire": cada guardado del
--   CMS salía publicado al instante. Esta migración parte el dato en dos:
--     · landing_config → LO PUBLICADO   (lo único que leen /[slug], su layout y su opengraph-image)
--     · landing_draft  → LO QUE SE EDITA (lo único que escribe el editor del dueño)
--   Publicar = copia server-side draft → config. Descartar = copia server-side config → draft.
--
-- Qué hace:
--   1. ADD COLUMN IF NOT EXISTS landing_draft jsonb  (nullable, sin DEFAULT — igual que landing_config).
--   2. Backfill: landing_draft := landing_config para TODAS las filas donde el draft todavía no existe.
--      Esto es PUB-08: el negocio que ya tiene su landing al aire abre el editor y ve una COPIA FIEL de
--      lo publicado, y su web sigue idéntica (la columna publicada no se toca). El negocio legacy
--      (landing_config NULL) queda con draft NULL → `/[slug]` sigue mostrando su reserva simple (PUB-07).
--
-- Racional D-02 (lockeado):
--   - Publicar deja el borrador INTACTO (post-publish draft == published). No hay flag ni timestamp de
--     publicación: "hay cambios sin publicar" se DERIVA de comparar las dos columnas (D-03). Por eso no
--     se agrega ninguna columna de estado más: el estado ES el contenido.
--   - Columna (no tabla `landing_drafts` aparte): la columna HEREDA la RLS ya probada de `businesses`.
--     Una tabla nueva significaría RLS nueva, policies nuevas, grants nuevos y una superficie de
--     aislamiento a probar desde cero.
--
-- Por qué NO lleva DEFAULT:
--   Un DEFAULT '{}'::jsonb rompería el fail-safe: `parseLandingConfig(null) → null` es la señal de
--   "negocio legacy". Un objeto vacío parsearía como inválido → DEFAULT_LANDING_CONFIG → le cambiaría
--   la página a todos los negocios sin landing. NULL es semántico acá, no es "falta un dato".
--
-- Qué NO hace (invariantes del proyecto):
--   - NO toca la vista `public_businesses`. Es la ÚNICA puerta de `anon` a esta tabla y corre
--     security-DEFINER (bypassa RLS) con columnas EXPLÍCITAS. Meter landing_draft ahí expondría el
--     borrador de TODOS los negocios a cualquier visitante y a cualquier usuario autenticado. NUNCA.
--   - NO agrega policy ni permiso nuevo: `businesses` ya tiene RLS activa con la policy `owner access`
--     (owner_id = auth.uid()) como ÚNICA policy. La columna nueva hereda ese aislamiento fila-a-fila.
--     No hay permisos por columna en este schema; los permisos a nivel tabla para anon/authenticated no
--     otorgan nada, porque RLS filtra todas las filas para un auth.uid() que no es dueño.
--   - NO toca el trigger businesses_protect_admin_columns (protege has_web_custom/has_whatsapp/plan/
--     plan_status). landing_draft NO va ahí: el dueño SÍ debe poder escribir su propio borrador.
--   - NO renumera ni edita ninguna migración ajena (045..049 ya tomadas). 050 = primera libre.
--   - NO se aplica vía push remoto de la CLI. La ÚNICA validación autónoma es `supabase db reset` local
--     (PG17), que replaya el baseline numerado + 040..050 en orden. Staging (forjo-staging) y prod se
--     aplican A MANO coordinado con el deploy + `NOTIFY pgrst, 'reload schema';` (PostgREST refresca su
--     schema cache; sin eso, "column businesses.landing_draft does not exist" aunque la columna exista).
--     Tras aplicar, regenerar `supabase/schema.sql` (patrón del repo, igual que 037/039/042/043).

-- ── businesses.landing_draft: el borrador del editor (nullable, sin valor por defecto) ───────
ALTER TABLE "public"."businesses"
  ADD COLUMN IF NOT EXISTS "landing_draft" jsonb;

-- Backfill idempotente: solo siembra el borrador donde todavía no hay uno (correr dos veces no pisa
-- un borrador que el dueño ya empezó a editar).
UPDATE "public"."businesses"
   SET "landing_draft" = "landing_config"
 WHERE "landing_draft" IS NULL
   AND "landing_config" IS NOT NULL;
