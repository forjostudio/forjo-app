-- ============================================================
-- 034 · Pipeline, tags y timeline del CRM (PIPE-01..04, TL-01)
-- ============================================================
-- QUÉ agrega esta migración:
--   Los cimientos de datos de la Phase 4 del CRM super-admin:
--     · leads        — prospecto que entra al pipeline (puede no tener negocio aún)
--     · deals        — oportunidad/negociación de un lead (un lead → N deals, D-01)
--     · tags         — catálogo GLOBAL de etiquetas color+texto (D-07/D-08)
--     · entity_tags  — join único tag ↔ entidad (lead|business) con discriminador de tipo (D-08)
--     · notes        — notas libres sobre un lead/negocio (fuente del timeline, D-12)
--     · tasks        — tareas livianas (título + due opcional + flag done), D-12
--   Y la VIEW agregada `crm_timeline` (security_invoker) que UNE audit_log + notes + tasks
--   en un historial cronológico unificado (TL-01, D-11) SIN tabla materializada.
--
-- Se aplica A MANO y EN ORDEN (última aplicada antes de esta: 033). El número correcto es 034 (D-15).
--   El repo NO corre `supabase db push` automatizado: cada migración se ejecuta a mano en el SQL
--   Editor de Supabase, en orden, coordinada con el deploy (regla CLAUDE.md).
--
-- Aislamiento (D-14, lección 029): TODAS las tablas nuevas del CRM son admin-only por RLS, espejando
--   exactamente 031_crm_audit_log.sql: se habilita RLS en ESTA misma migración y se crea SOLO una
--   policy de SELECT que lee is_admin del JWT (app_metadata). NO se crea policy de insert/update/delete
--   para authenticated/anon → solo el service-role (createAdminClient) escribe, así nada es falsificable
--   ni accesible por el dueño de un negocio. NUNCA using(true) (agujero de la migración 029).
--   `business_id` acá NO es un scope de aislamiento por tenant: es una referencia a la entidad
--   afectada; el aislamiento real lo da el gate is_admin.
--
-- TODO operativo post-deploy (Runtime State Inventory): tras aplicar 034 a mano en Supabase,
--   regenerar `supabase/schema.sql` con `supabase db dump` para mantenerlo en sync.
-- ============================================================

-- ── 1. Tabla leads (PIPE-01) ──────────────────────────────────────────────────────────────────
-- Prospecto que entra al pipeline. Puede NO tener negocio asociado todavía: business_id queda NULL
-- hasta que el lead convierte (se da de alta como negocio). on delete set null: si se borra el negocio
-- ya convertido, el lead se preserva (la historia del pipeline no se pierde, solo se desliga).
create table if not exists public.leads (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  -- email/whatsapp del prospecto. email se normaliza a lowercase a nivel app (no en DB).
  email        text,
  whatsapp     text,
  -- negocio resultante si el lead convirtió; NULL mientras es solo prospecto.
  business_id  uuid references public.businesses(id) on delete set null,
  source       text,                          -- de dónde vino el lead (ej: 'web', 'referido')
  created_at   timestamptz not null default now()
);

-- Índice sobre lower(email) para búsqueda case-insensitive y para detectar duplicados a nivel app.
create index if not exists leads_email_idx       on public.leads (lower(email));
create index if not exists leads_business_id_idx on public.leads (business_id);

-- ── 2. Tabla deals (PIPE-01/02, D-01/D-03/D-04) ─────────────────────────────────────────────────
-- Oportunidad/negociación de un lead. D-01: un lead → N deals (el FK lead_id habilita varios deals
-- por lead; ej. un prospecto que vuelve por otro servicio). on delete cascade: si se borra el lead,
-- se borran sus deals (no hay deal huérfano sin lead).
--
-- D-03: `stage` es el PROGRESO en el embudo — text + CHECK con 5 etapas fijas en código (NO enum
--   nativo de Postgres: las etapas viven en la constante STAGES de lib/crm-pipeline.ts, única fuente
--   de verdad, calcada en los schemas zod). Las keys del CHECK coinciden EXACTAMENTE con STAGES.
-- D-04: `status` es ortogonal al stage — text + CHECK (open/won/lost). 'won' al llegar a pago o
--   convertir; 'lost' manual con lost_reason. Separar stage de status evita perder el progreso
--   cuando un deal se gana/pierde.
create table if not exists public.deals (
  id                  uuid primary key default gen_random_uuid(),
  lead_id             uuid not null references public.leads(id) on delete cascade,
  title               text,
  value_ars           integer not null default 0,   -- monto en ARS (entero, sin decimales)
  probability         integer,                       -- % estimado de cierre (opcional)
  expected_close_date date,
  stage               text not null default 'lead'
                        check (stage in ('lead','calificado','trial','propuesta','pago')),
  status              text not null default 'open'
                        check (status in ('open','won','lost')),
  lost_reason         text,                          -- motivo al marcar 'lost' (obligatorio a nivel app)
  business_id         uuid references public.businesses(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists deals_lead_id_idx     on public.deals (lead_id);
create index if not exists deals_stage_idx        on public.deals (stage);
create index if not exists deals_status_idx       on public.deals (status);
create index if not exists deals_business_id_idx on public.deals (business_id);

-- ── 3. Tabla tags (PIPE-04, D-07/D-08) ──────────────────────────────────────────────────────────
-- Catálogo GLOBAL compartido de etiquetas (color + texto). UN SOLO catálogo (D-08) que consumen tanto
-- los leads (tablero) como los negocios (directorio/ficha): no se duplica por tipo de entidad.
create table if not exists public.tags (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  color       text not null,                   -- color de la tag (hex o token; se valida a nivel app)
  created_at  timestamptz not null default now()
);

-- Índice único sobre lower(label) para evitar dos tags con la misma etiqueta (case-insensitive).
create unique index if not exists tags_label_unique_idx on public.tags (lower(label));

-- ── 4. Tabla entity_tags (PIPE-04, D-08) ────────────────────────────────────────────────────────
-- Join único tag ↔ entidad con discriminador de tipo (D-08): una sola tabla de asignación sirve para
-- leads y negocios, distinguidos por entity_type. on delete cascade en tag_id: al borrar una tag del
-- catálogo, se borran todas sus asignaciones.
create table if not exists public.entity_tags (
  id           uuid primary key default gen_random_uuid(),
  tag_id       uuid not null references public.tags(id) on delete cascade,
  entity_type  text not null check (entity_type in ('lead','business')),
  entity_id    uuid not null,                  -- id del lead o del business según entity_type
  created_at   timestamptz not null default now()
);

-- Índice único: una misma tag no puede asignarse dos veces a la misma entidad. assignTag se apoya en
-- este índice para ser idempotente (el conflicto 23505 se trata como éxito a nivel app).
create unique index if not exists entity_tags_unique_idx
  on public.entity_tags (tag_id, entity_type, entity_id);
-- Índice para listar todas las tags de una entidad (filtro del directorio / chips de la ficha).
create index if not exists entity_tags_entity_idx on public.entity_tags (entity_type, entity_id);

-- ── 5. Tabla notes (TL-01, D-12) ────────────────────────────────────────────────────────────────
-- Notas libres sobre un lead y/o negocio. Fuente del timeline (rama 'nota' de crm_timeline, D-12).
-- on delete cascade en ambos FK: al borrar el lead/negocio, sus notas se van con él.
create table if not exists public.notes (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid references public.businesses(id) on delete cascade,
  lead_id      uuid references public.leads(id) on delete cascade,
  body         text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists notes_business_id_idx on public.notes (business_id);

-- ── 6. Tabla tasks (TL-01, D-12) ────────────────────────────────────────────────────────────────
-- Tareas LIVIANAS (D-12): título + due opcional + flag done. SIN asignación a usuarios, SIN
-- recordatorios, SIN recurrencia (eso es alcance futuro). Fuente del timeline (rama 'tarea').
create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid references public.businesses(id) on delete cascade,
  lead_id       uuid references public.leads(id) on delete cascade,
  title         text not null,
  due_date      date,
  done          boolean not null default false,
  completed_at  timestamptz,                   -- se setea al marcar done = true
  created_at    timestamptz not null default now()
);

create index if not exists tasks_business_id_idx on public.tasks (business_id);

-- ── 7. RLS admin-only para las 6 tablas (D-14, espejo verbatim de 031) ───────────────────────────
-- Para CADA tabla: habilitar RLS en ESTA misma migración y crear SOLO una policy de SELECT que lee
-- is_admin del JWT (app_metadata). NO se crea policy de insert/update/delete: solo el service-role
-- (que bypassa RLS vía createAdminClient) escribe, así ningún dato es falsificable ni accesible por
-- el dueño de un negocio. NUNCA using(true) (agujero de la migración 029).

-- leads
alter table public.leads enable row level security;
drop policy if exists "admin read leads" on public.leads;
create policy "admin read leads" on public.leads
  for select
  using ((select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true');
-- Sin policy de insert/update/delete: solo el service-role escribe leads.

-- deals
alter table public.deals enable row level security;
drop policy if exists "admin read deals" on public.deals;
create policy "admin read deals" on public.deals
  for select
  using ((select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true');
-- Sin policy de insert/update/delete: solo el service-role escribe deals.

-- tags
alter table public.tags enable row level security;
drop policy if exists "admin read tags" on public.tags;
create policy "admin read tags" on public.tags
  for select
  using ((select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true');
-- Sin policy de insert/update/delete: solo el service-role escribe el catálogo de tags.

-- entity_tags
alter table public.entity_tags enable row level security;
drop policy if exists "admin read entity_tags" on public.entity_tags;
create policy "admin read entity_tags" on public.entity_tags
  for select
  using ((select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true');
-- Sin policy de insert/update/delete: solo el service-role asigna/desasigna tags.

-- notes
alter table public.notes enable row level security;
drop policy if exists "admin read notes" on public.notes;
create policy "admin read notes" on public.notes
  for select
  using ((select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true');
-- Sin policy de insert/update/delete: solo el service-role escribe notas.

-- tasks
alter table public.tasks enable row level security;
drop policy if exists "admin read tasks" on public.tasks;
create policy "admin read tasks" on public.tasks
  for select
  using ((select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true');
-- Sin policy de insert/update/delete: solo el service-role escribe tareas.

-- ── 8. VIEW crm_timeline (TL-01, D-11) ──────────────────────────────────────────────────────────
-- Historial cronológico unificado: UNION ALL de tres ramas con shape común — audit_log (cambios),
-- notes (notas) y tasks (tareas). Vista AGREGADA on-the-fly, SIN tabla materializada timeline_events
-- (D-11): no hay estado que mantener sincronizado, la verdad vive en las tablas base.
--
-- WITH (security_invoker = true) es CRÍTICO (Pitfall 1): por default un CREATE VIEW corre
-- security-DEFINER (con privilegios del dueño de la view) y BYPASSARÍA la RLS admin-only de las
-- tablas base — un agujero de elevación de privilegio. Con security_invoker = true la view corre con
-- los privilegios del CALLER, así HEREDA la RLS admin-read de audit_log/notes/tasks: solo un operador
-- (is_admin del JWT) lee el timeline, leído con el session client en Plan 03. Es lo OPUESTO de las
-- public views de 027 (que SÍ usan security-definer a propósito, para exponer datos acotados a anon).
--
-- NO se ordena dentro de la view: el consumidor ordena por occurred_at desc.
create or replace view public.crm_timeline
  with (security_invoker = true)
  as (
    -- Rama 1: cambios de auditoría. actor null = acción del sistema; si no, un operador.
    select
      'cambio'::text                                                          as kind,
      (case when actor_id is null then 'sistema' else 'operador' end)::text   as actor_type,
      action                                                                  as title,
      reason                                                                  as body,
      created_at                                                              as occurred_at,
      metadata                                                                as metadata,
      business_id                                                             as business_id
    from public.audit_log

    union all

    -- Rama 2: notas libres sobre un lead/negocio.
    select
      'nota'::text                                                            as kind,
      'operador'::text                                                        as actor_type,
      'Nota'::text                                                            as title,
      body                                                                    as body,
      created_at                                                              as occurred_at,
      '{}'::jsonb                                                             as metadata,
      business_id                                                             as business_id
    from public.notes

    union all

    -- Rama 3: tareas. occurred_at = cuándo se completó (si está done) o cuándo se creó.
    select
      'tarea'::text                                                           as kind,
      'operador'::text                                                        as actor_type,
      (case when done then 'Tarea completada' else 'Tarea creada' end)::text  as title,
      title                                                                   as body,
      coalesce(completed_at, created_at)                                      as occurred_at,
      '{}'::jsonb                                                             as metadata,
      business_id                                                             as business_id
    from public.tasks
  );

comment on view public.crm_timeline is
  'Timeline unificado (audit_log + notes + tasks) con security_invoker=true: hereda la RLS admin-only de las tablas base. NUNCA quitar el flag (correría security-definer y bypassaría el gate admin).';
