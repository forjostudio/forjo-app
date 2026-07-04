-- ============================================================
--  app_settings — flags globales de la app (single row).
--  Primer flag: `maintenance` (modo mantenimiento / kill switch).
--  El middleware lo lee con anon (lectura pública) para gatear la app;
--  el toggle del panel super-admin lo escribe con service-role tras requireAdmin().
-- ============================================================

create table if not exists public.app_settings (
  id          text primary key default 'default',
  maintenance boolean not null default false,
  updated_at  timestamptz not null default now()
);

-- Fila única.
insert into public.app_settings (id) values ('default') on conflict (id) do nothing;

alter table public.app_settings enable row level security;

-- Lectura pública: el middleware lee el flag con anon para decidir si corta la app.
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings for select using (true);

-- Escritura: SIN policy → solo service_role (bypassa RLS) escribe, desde el panel.
grant select on public.app_settings to anon, authenticated;
grant all    on public.app_settings to service_role;
