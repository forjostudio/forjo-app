-- ─────────────────────────────────────────────────────────────────────────────
-- seed.sql — SOLO LOCAL. Lo corre `supabase db reset` DESPUÉS de las migraciones
-- (config.toml → [db.seed] enabled=true, sql_paths=["./seed.sql"]). NUNCA se aplica
-- a prod: a prod solo se aplican las migraciones a mano. No poner acá datos reales.
--
-- Objetivo: dejar SIEMPRE un negocio de prueba estable para verificar el panel en
-- local sin tener que re-onboardear tras cada `db reset`. Todo con UUIDs fijos →
-- idempotente (borra-y-recrea) y con ids predecibles.
--
--   Login:  test@forjo.local  /  Forjo1234!
--   Negocio "Negocio de Prueba" (slug negocio-prueba), vertical general.
--   Servicio Corte (30min) · Profesional Ana · Cliente Juan · horarios L-D 08:00-20:00.
-- ─────────────────────────────────────────────────────────────────────────────

-- UUIDs fijos (predecibles, permiten el borra-y-recrea idempotente)
--   usuario  = 00000000-0000-0000-0000-0000000000a1
--   negocio  = 00000000-0000-0000-0000-0000000000b1

-- Limpieza previa (idempotencia si el seed corre sin un reset limpio).
-- Borrar el negocio CASCADEA a location/service/professional/time_blocks/client/abonos.
delete from public.businesses where id = '00000000-0000-0000-0000-0000000000b1';
delete from auth.identities where user_id = '00000000-0000-0000-0000-0000000000a1';
delete from auth.users where id = '00000000-0000-0000-0000-0000000000a1';

-- ── Usuario de auth (password login) ─────────────────────────────────────────
-- encrypted_password con bcrypt vía pgcrypto (extensions.crypt + gen_salt('bf')).
-- email_confirmed_at = now() → confirmado, puede loguear ya.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-0000000000a1',
  'authenticated', 'authenticated',
  'test@forjo.local',
  extensions.crypt('Forjo1234!', extensions.gen_salt('bf')),
  now(), now(),
  '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), '', '', '', ''
);

-- identidad email (provider_id NOT NULL en GoTrue actual)
insert into auth.identities (
  id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000a1',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"test@forjo.local"}'::jsonb,
  'email', now(), now(), now()
);

-- ── Negocio + estructura mínima para el flujo de abonos ──────────────────────
insert into public.businesses (id, owner_id, slug, name, buffer_minutes)
values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1',
        'negocio-prueba', 'Negocio de Prueba', 0);

insert into public.locations (id, business_id, name)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'Sede Central');

insert into public.services (id, business_id, name, duration_minutes, price, active)
values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', 'Corte', 30, 5000, true);

insert into public.professionals (id, business_id, name, active)
values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'Ana', true);

-- horarios abiertos todos los días 08:00-20:00 (capacity 1) → cualquier día/hora
-- que se elija en el abono cae en horario abierto y genera turnos.
insert into public.time_blocks (business_id, day_of_week, start_time, end_time, location_id, capacity)
select '00000000-0000-0000-0000-0000000000b1', d, '08:00', '20:00',
       '00000000-0000-0000-0000-0000000000c1', 1
from generate_series(0, 6) as d;

insert into public.clients (id, business_id, name, phone, email)
values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b1',
        'Juan Cliente', '1122334455', 'juan@cliente.local');
