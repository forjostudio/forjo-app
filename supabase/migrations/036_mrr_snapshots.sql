-- ============================================================
-- 036 · Snapshot mensual de MRR (RPT-01, D-01)
-- ============================================================
-- QUÉ agrega esta migración:
--   La tabla `mrr_snapshots` — una fila por (mes, plan) con el MRR y la cantidad de negocios activos
--   de ese plan en ese mes. Es la fuente del chart "Evolución de MRR" (3/6/12 meses) de la Phase 5:
--   el estado vivo solo conoce el MRR de HOY, así que para graficar la evolución histórica se persiste
--   un snapshot mensual. Se escribe 1×/mes piggybackeando el cron diario existente
--   (/api/cron/cancel-expired) — Vercel Hobby permite 1 cron/día, NO se agrega un cron nuevo. La
--   escritura es IDEMPOTENTE: upsert con onConflict (month, plan) → la PK (month, plan) garantiza
--   1 fila por mes/plan aunque el cron corra todos los días.
--
-- Se aplica A MANO y EN ORDEN (última aplicada antes de esta: 035 → este es 036). El repo NO corre
--   `supabase db push` automatizado: cada migración se ejecuta a mano en el SQL Editor de Supabase,
--   en orden, coordinada con el deploy (regla CLAUDE.md).
--
-- Aislamiento (lección 029): `mrr_snapshots` es admin-only por RLS, espejando 034. Se habilita RLS en
--   ESTA misma migración y se crea SOLO una policy de SELECT que lee is_admin del JWT (app_metadata).
--   NO se crea policy de insert/update/delete → solo el service-role (createAdminClient, desde el cron)
--   escribe, así nadie salvo el cron puede falsificar el MRR histórico. NUNCA using(true) (agujero de
--   la migración 029). Acá NO hay `business_id`: estos son datos del operador, cross-tenant por diseño;
--   el gate de aislamiento es is_admin, no business_id (D-10).
--
-- TODO operativo post-deploy (Runtime State Inventory): tras aplicar 036 a mano en Supabase,
--   regenerar `supabase/schema.sql` con `supabase db dump` para mantenerlo en sync (igual que tras 034/035).
-- ============================================================

-- ── 1. Tabla mrr_snapshots ──────────────────────────────────────────────────────────────────────
-- PK (month, plan): la clave única es la garantía de idempotencia del upsert del cron (onConflict
-- 'month,plan'). `month` = primer día del mes (YYYY-MM-01) en zona AR. `mrr` y `active_count` enteros.
create table if not exists public.mrr_snapshots (
  month         date not null,                                      -- primer día del mes (YYYY-MM-01) en zona AR
  plan          text not null check (plan in ('basic','studio','pro')),
  mrr           integer not null default 0,                         -- ARS, entero (Σ price_ars × activos del plan)
  active_count  integer not null default 0,                         -- negocios activos de ese plan en ese mes
  created_at    timestamptz not null default now(),
  primary key (month, plan)                                          -- unique (month,plan) = idempotencia del upsert
);

-- ── 2. RLS admin-only (espejo verbatim de la policy de deals en 034) ──────────────────────────────
alter table public.mrr_snapshots enable row level security;
drop policy if exists "admin read mrr_snapshots" on public.mrr_snapshots;
create policy "admin read mrr_snapshots" on public.mrr_snapshots
  for select
  using ((select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true');
-- Sin policy de insert/update/delete: solo el service-role (cron) escribe mrr_snapshots.

-- ── 3. Seed del mes actual ────────────────────────────────────────────────────────────────────────
-- Sembrar el mes en curso para que el chart de evolución no arranque vacío (D-01). Calcula MRR×plan
-- desde el estado vivo (businesses activos × plan_prices). date_trunc('month', now() AT TIME ZONE
-- 'America/Argentina/Buenos_Aires')::date = primer día del mes AR. on conflict do nothing: idempotente
-- si la migración se corre dos veces (no pisa lo que el cron ya haya escrito).
insert into public.mrr_snapshots (month, plan, mrr, active_count)
select
  date_trunc('month', (now() at time zone 'America/Argentina/Buenos_Aires'))::date as month,
  b.plan,
  coalesce(pp.price_ars, 0) * count(*)                                              as mrr,
  count(*)                                                                          as active_count
from public.businesses b
left join public.plan_prices pp on pp.plan_key = b.plan
where b.plan_status = 'active' and b.plan in ('basic','studio','pro')
group by b.plan, pp.price_ars
on conflict (month, plan) do nothing;
