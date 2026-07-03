-- 046 — ⚠ DROP business_hours: elimina la tabla PERDEDORA de la reconciliación de horarios (SCHED-02).
--
-- ⚠⚠⚠ MIGRACIÓN DESTRUCTIVA — la ÚNICA con `DROP TABLE` del repo. Leer antes de correr. ⚠⚠⚠
--
-- Contexto (reconciliación de horarios v0.14 — Phase 1):
--   La app tenía DOS fuentes de horarios divergentes: `business_hours` (1 ventana/día + is_open,
--   la leían onboarding + landing + agente) y `time_blocks` (N bloques/día → horario partido,
--   capacity, location_id; la fuente del motor v0.12 availability/book_slot_atomic). D-01 fija
--   `time_blocks` como la fuente ÚNICA canónica. Los Plans 01+02 de esta fase ya migraron el único
--   escritor (onboarding) y los 3 lectores (landing derive + hours component + agent-context) a
--   `time_blocks`. Por lo tanto `business_hours` quedó sin lectores/escritores vivos y se ELIMINA
--   (D-03, fold de SCHED-DROP-01). Al no existir la tabla, no puede haber divergencia → salda SCHED-02.
--
-- Por qué es SEGURO el DROP (cutover limpio, sin backfill — D-02):
--   - No hay clientes en producción; el usuario confirmó "si queda todo en 0 no hay problema".
--     No hay datos de horarios que preservar → NO se hace backfill business_hours → time_blocks.
--   - Los 2 readers/writers vivos ya migraron a time_blocks en Plans 01/02 (grep repo-wide de
--     `business_hours` en app/lib/components = 0 referencias vivas antes de escribir esta migración).
--   - ORDEN OBLIGATORIO (D-03, T-01-07): este DROP se aplica a prod SOLO DESPUÉS de deployar el
--     código de Plans 01+02. Si se dropea antes, el path que aún leyera business_hours en prod
--     fallaría. La aplicación a prod es MANUAL, coordinada con el deploy (ver user_setup del plan).
--
-- Qué hace (idempotente — todos los DROP usan IF EXISTS; correrla dos veces no rompe):
--   1. DROP de la vista `public_business_hours` PRIMERO (depende de la tabla; tenía GRANT a anon →
--      es la única superficie pública colgada de business_hours, hay que eliminarla explícitamente).
--   2. DROP de la policy "business member access" (defensivo; el DROP TABLE se lleva las policies
--      igual, pero lo dejamos explícito para que quede claro qué RLS se elimina — T-01-09).
--   3. DROP de la tabla `business_hours` (esto elimina tabla, PK, FK a businesses, RLS y grants
--      asociados en una sola operación).
--
-- Qué NO hace (invariantes del proyecto):
--   - NO toca `time_blocks` ni el motor (availability / book_slot_atomic) — solo cambió de dónde
--     salen los horarios, no cómo se consumen.
--   - NO hace backfill de datos (D-02).
--   - NO se aplica vía push remoto. La ÚNICA validación es `supabase db reset` local (PG17), que
--     replaya el baseline numerado + 040..046 en orden. Prod se aplica A MANO coordinado con el
--     deploy. Tras aplicar en prod, regenerar `supabase/schema.sql` (patrón del repo, igual que
--     037/039/042/043/044).

-- 1) La vista depende de la tabla → dropearla PRIMERO. Tenía GRANT a anon (superficie pública).
DROP VIEW IF EXISTS "public"."public_business_hours";

-- 2) Policy RLS explícita (defensivo; el DROP TABLE la elimina igual — T-01-09).
DROP POLICY IF EXISTS "business member access" ON "public"."business_hours";

-- 3) La tabla: se lleva PK, FK a businesses (ON DELETE CASCADE), RLS y grants asociados.
DROP TABLE IF EXISTS "public"."business_hours";
