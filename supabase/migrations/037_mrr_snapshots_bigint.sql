-- ============================================================
-- 037 · mrr_snapshots.mrr → bigint (WR-04, fix de overflow silencioso)
-- ============================================================
-- POR QUÉ: en 036 `mrr` quedó como `integer` (máx 2.147.483.647). El MRR está en ARS (moneda de alto
--   nominal) y price_ars es editable hacia arriba: el plan `pro` (50.000) desborda el int a ~42.949
--   cuentas activas. Un overflow tira 22003 en el upsert, que el cron traga como best-effort (loguea y
--   devuelve 0) → el snapshot del mes se pierde en silencio, sin señal visible para el operador. `bigint`
--   (máx ~9,2×10^18) elimina ese borde por completo. `active_count` se queda en integer: la cantidad de
--   negocios nunca se acerca al límite de int.
--
-- Se aplica A MANO y EN ORDEN (última aplicada antes de esta: 036 → este es 037). El repo NO corre
--   `supabase db push`: cada migración se ejecuta a mano en el SQL Editor de Supabase, coordinada con el
--   deploy (regla CLAUDE.md). NOTA: 036 YA está aplicada en la DB viva; esta migración la altera in-place.
--
-- TODO operativo post-deploy: tras aplicar 037 a mano, regenerar `supabase/schema.sql` con
--   `supabase db dump` para mantenerlo en sync (igual que tras 034/035/036).
-- ============================================================

alter table public.mrr_snapshots
  alter column mrr type bigint;
