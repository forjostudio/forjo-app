-- ============================================================
-- 032 · admin de plataforma — precios editables + add-ons + cierre del agujero RLS del owner
-- ============================================================
-- QUÉ agrega esta migración:
--   1. Dos flags booleanas de add-on por negocio en `public.businesses`:
--        has_web_custom (Web a medida) y has_whatsapp (Recordatorios WhatsApp).
--   2. La tabla `public.plan_prices`: la fuente editable de precios del panel /admin,
--        en ARS (lo que cobra MercadoPago), seedeada con los price_ars reales de
--        lib/subscription-plans.ts (basic 15000 / studio 30000 / pro 50000).
--   3. RLS de plan_prices: SELECT solo para super-admin (is_admin via JWT app_metadata);
--        la escritura es exclusiva del service-role (sin policy de write para usuarios).
--   4. CIERRE DEL AGUJERO RLS (A5, crítico): hoy la policy "owner access" sobre businesses
--        es FOR ALL sin WITH CHECK ni restricción de columnas, así que el dueño podría
--        ejecutar `update businesses set has_whatsapp=true where owner_id = auth.uid()`
--        y auto-asignarse add-ons (o cambiarse plan/plan_status), salteando el cobro manual
--        (D-08) y el control del operador. Un BEFORE UPDATE trigger revierte cualquier cambio
--        del dueño a has_web_custom / has_whatsapp / plan / plan_status; solo el service-role
--        (createAdminClient en las server actions del CRM) puede escribir esas columnas.
--
-- Razón: D-01/D-02 (precios editables en DB, ARS), D-08/D-09 (add-ons como flags, cobro
--   manual, has_whatsapp = misma flag que la Bandeja del milestone Gestión rebrand), D-05
--   ('suspended' como valor nuevo de plan_status, que el operador setea y NO el dueño).
--
-- Se aplica A MANO y EN ORDEN (última aplicada antes de esta: 031). El número correcto es 032
--   (030 = web-builder landing_config, 031 = crm_audit_log; ninguno 032).
--
-- ADVERTENCIA DE DEPLOY: coordinar con el deploy del código que suma 'suspended' a la blocklist
--   de booking (app/api/booking/create/route.ts) y al guard del dashboard del dueño
--   (app/(dashboard)/layout.tsx). El valor 'suspended' debe cortar de verdad apenas exista.
--   plan_status es `text` libre (sin check constraint) → 'suspended' NO requiere migración de
--   constraint y NO se agrega ninguno acá.
--
-- TODO operativo post-deploy: tras aplicar 032 a mano en Supabase, regenerar
--   `supabase/schema.sql` con `supabase db dump` para mantenerlo en sync.
-- ============================================================

-- ── 1. Add-ons como flags booleanas en businesses (D-08) ─────────────────────────────────
-- has_whatsapp es la MISMA flag que gatea la Bandeja del milestone Gestión rebrand (D-09):
-- naming consistente entre milestones, NO crear otra. Display = "Recordatorios WhatsApp"
-- (NUNCA "SMS"). Default false: nadie tiene add-ons hasta que el operador los active y los cobre.
alter table public.businesses
  add column if not exists has_web_custom boolean not null default false,
  add column if not exists has_whatsapp   boolean not null default false;

-- ── 2. Tabla de precios editables (D-01/D-02) — ARS, 3 planes reales ──────────────────────
-- Seed con los price_ars reales de lib/subscription-plans.ts (lo que cobra MercadoPago),
-- NO el price_usd de lib/plans.ts. plan_prices es la fuente de lectura del editor (ADM-05),
-- del "Plan actual" de la ficha (ADM-02) y del cálculo de MRR (ADM-07).
create table if not exists public.plan_prices (
  plan_key    text primary key check (plan_key in ('basic','studio','pro')),
  price_ars   integer not null check (price_ars >= 0),
  updated_at  timestamptz not null default now(),
  -- on delete set null: borrar el usuario no borra la fila de precio (la historia del precio
  -- se preserva; solo queda huérfano quién lo editó por última vez).
  updated_by  uuid references auth.users(id) on delete set null
);

insert into public.plan_prices (plan_key, price_ars) values
  ('basic',  15000),
  ('studio', 30000),
  ('pro',    50000)
on conflict (plan_key) do nothing;

-- ── 3. RLS de plan_prices (admin-only read; escritura solo service-role) ──────────────────
-- Mismo patrón que audit_log (031): RLS habilitada en la misma migración, SELECT solo para
-- is_admin (vía app_metadata JWT, D1 de Phase 1), SIN policy de write para users → solo el
-- service-role (createAdminClient en la server action updatePlanPrice) escribe. NUNCA using(true)
-- (lección de las migraciones 029/031: un predicado siempre-verdadero abriría la tabla a
-- cualquier autenticado). El predicado SIEMPRE chequea is_admin.
alter table public.plan_prices enable row level security;

drop policy if exists "admin read plan_prices" on public.plan_prices;
create policy "admin read plan_prices" on public.plan_prices
  for select
  using ((select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true');
-- Sin policy de insert/update/delete: la escritura es exclusiva del service-role.

-- ── 4. Cierre del agujero RLS del owner sobre columnas administrativas (A5, T-02-01) ──────
-- La policy "owner access" ON public.businesses USING (owner_id = auth.uid()) es FOR ALL y no
-- restringe columnas (Postgres no permite restringir columnas dentro de una policy RLS). Eso deja
-- al dueño escribir CUALQUIER columna de su propia fila — incluidas has_web_custom / has_whatsapp
-- (auto-asignarse add-ons sin pagar) y plan / plan_status (auto-cambiarse de plan o reactivarse).
-- Solución idiomática en Postgres: un BEFORE UPDATE trigger que, si la sesión NO es service-role,
-- revierte esas 4 columnas a su valor previo (set NEW.col = OLD.col). El service-role (las server
-- actions del CRM: toggleAddon / changePlan / suspendBusiness) bypassa RLS y corre con
-- role 'service_role', por lo que SÍ puede escribirlas; el dueño (role 'authenticated') queda
-- bloqueado en silencio sin romper sus updates legítimos (onboarding, settings, palette, etc.).
create or replace function public.businesses_protect_admin_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.role() devuelve el role del JWT actual: 'service_role' para el admin client,
  -- 'authenticated' para el dueño con sesión, 'anon' para el público. Solo el service-role
  -- puede tocar las columnas administrativas; cualquier otro role las ve revertidas.
  if coalesce(auth.role(), '') <> 'service_role' then
    new.has_web_custom := old.has_web_custom;
    new.has_whatsapp   := old.has_whatsapp;
    new.plan           := old.plan;
    new.plan_status    := old.plan_status;
  end if;
  return new;
end;
$$;

drop trigger if exists businesses_protect_admin_columns on public.businesses;
create trigger businesses_protect_admin_columns
  before update on public.businesses
  for each row
  execute function public.businesses_protect_admin_columns();
