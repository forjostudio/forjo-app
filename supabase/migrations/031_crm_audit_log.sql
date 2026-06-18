-- ============================================================
-- 031 · audit_log del CRM super-admin (FND-02)
-- ============================================================
-- QUÉ agrega esta migración:
--   Una tabla GLOBAL `public.audit_log` que registra cada acción sensible que el operador
--   (super-admin) ejecuta sobre cualquier negocio del CRM: actor, acción, target afectado,
--   nivel de riesgo y motivo opcional. Es la base no negociable de la auditoría del milestone.
--
-- Se aplica A MANO y EN ORDEN (última aplicada antes de esta: 030). El número correcto es 031:
--   030 ya está tomado por el workstream web-builder (030_landing_config_and_storage.sql).
--
-- NO crea ninguna columna `is_admin` en `businesses` (decisión D1): el flag is_admin es propiedad
--   del USUARIO y vive en `auth.users.app_metadata` (no editable por el dueño, solo service-role /
--   admin API; aparece en el JWT). Por eso la policy de lectura lo lee del JWT, no de una columna.
--
-- Aislamiento: `audit_log` es GLOBAL cross-tenant a propósito. `business_id` es SOLO una referencia
--   a la entidad afectada, NO un scope de aislamiento por tenant. La lectura se restringe a is_admin;
--   la escritura es exclusiva del service-role (sin policy de insert para usuarios → no falsificable).
--
-- TODO operativo post-deploy (Runtime State Inventory): tras aplicar 031 a mano en Supabase,
--   regenerar `supabase/schema.sql` con `supabase db dump` para mantenerlo en sync.
-- ============================================================

-- ── 1. Tabla audit_log (FND-02, D5) ─────────────────────────────────────────────────────
create table if not exists public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  -- actor que ejecutó la acción. on delete set null: si se borra el usuario, el registro
  -- de auditoría se preserva (la historia no se pierde, solo queda huérfano el actor).
  actor_id     uuid not null references auth.users(id) on delete set null,
  action       text not null,                 -- ej: 'business.suspend', 'user.impersonate'
  target_type  text not null,                 -- ej: 'business', 'appointment', 'user'
  target_id    text,                          -- texto: el target puede no ser un uuid
  -- referencia de la entidad/negocio afectado. NO es scope de aislamiento (audit es global).
  -- on delete set null: borrar un negocio no debe borrar su historial de auditoría.
  business_id  uuid references public.businesses(id) on delete set null,
  risk         text not null default 'medio' check (risk in ('alto','medio','bajo')),
  reason       text,                          -- obligatorio a nivel app (impersonación), no en DB
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

-- ── 2. Índices ──────────────────────────────────────────────────────────────────────────
create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);
create index if not exists audit_log_business_id_idx on public.audit_log (business_id);
create index if not exists audit_log_action_idx      on public.audit_log (action);

-- ── 3. RLS — habilitada en ESTA misma migración (D5, lección 029) ────────────────────────
-- Sin RLS habilitada, una tabla con GRANT a authenticated quedaría abierta. La habilitamos acá
-- mismo y solo creamos la policy de SELECT restringida a is_admin.
alter table public.audit_log enable row level security;

-- SELECT solo para super-admin. is_admin se lee del JWT (app_metadata, D1), NO de una columna
-- de businesses que el tenant pueda tocar. NUNCA usar using(true) (agujero de la migración 029):
-- eso abriría el log a cualquier autenticado.
drop policy if exists "admin read audit_log" on public.audit_log;
create policy "admin read audit_log" on public.audit_log
  for select
  using ((select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true');

-- NO se crea ninguna policy de insert/update/delete para authenticated/anon: solo el service-role
-- (que bypassa RLS vía createAdminClient en lib/audit.ts) escribe en audit_log. Así el registro de
-- auditoría no es falsificable ni borrable por un cliente.
