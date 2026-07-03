-- ============================================================
--  CMS de la landing forjo.studio (reusa este Supabase)
--  - landing_content: contenido editable de la landing (singleton JSON).
--  - landing_leads:   mensajes del formulario de contacto.
--
--  OJO seguridad: este proyecto tiene muchos usuarios `authenticated`
--  (los clientes de gestión). Por eso NO se dan políticas de edición/lectura
--  a `authenticated`: el panel de la landing hace las operaciones de admin con
--  la service_role (previa verificación del email admin en el server). El rol
--  anon solo lee el contenido (público) e inserta leads (form público).
-- ============================================================

create table if not exists public.landing_content (
  id         text primary key default 'forjo',
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.landing_leads (
  id         uuid primary key default gen_random_uuid(),
  name       text,
  email      text,
  message    text not null,
  source     text not null default 'landing',
  created_at timestamptz not null default now()
);

alter table public.landing_content enable row level security;
alter table public.landing_leads   enable row level security;

-- Contenido: lectura pública (para renderizar la landing). La escritura NO
-- tiene policy: solo la service_role (que bypassa RLS) edita, desde el panel.
drop policy if exists landing_content_public_read on public.landing_content;
create policy landing_content_public_read on public.landing_content
  for select using (true);

-- Leads: cualquiera puede insertar (formulario público). La lectura NO tiene
-- policy: solo la service_role lee, desde el panel (no otros usuarios del proyecto).
drop policy if exists landing_leads_public_insert on public.landing_leads;
create policy landing_leads_public_insert on public.landing_leads
  for insert with check (true);

-- Grants explícitos (Supabase no auto-otorga a los roles de la Data API).
grant select on public.landing_content to anon, authenticated;
grant insert on public.landing_leads   to anon, authenticated;
grant all    on public.landing_content to service_role;
grant all    on public.landing_leads   to service_role;
