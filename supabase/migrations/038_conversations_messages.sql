-- ============================================================
-- 038 · Conversaciones y mensajes de la Bandeja (COMMS-01/COMMS-02)
-- ============================================================
-- QUÉ agrega esta migración:
--   Las tablas canónicas de la bandeja de WhatsApp del CRM (Phase 6, D-04):
--     · conversations — un hilo por (negocio, canal, contacto). handled_by = estado de atención
--                       (unassigned/ai/human); el bot lee 'human' y PAUSA (D-03).
--     · messages      — mensajes del hilo, idempotentes por external_id (id del mensaje en el bot).
--
--   El bot externo (whatsapp-ai-agent-kit, otro repo, VPS) POSTea a /api/agent/inbox con el
--   FORJO_AGENT_TOKEN; Forjo valida slug→negocio y escribe con service-role (el bot NO tiene sesión
--   Supabase). Espejo del ingest del webhook de pago.
--
-- Se aplica A MANO y EN ORDEN (última aplicada antes de esta: 037). El número correcto es 038.
--   El repo NO corre `supabase db push` automatizado: cada migración se ejecuta a mano en el SQL
--   Editor de Supabase, en orden, coordinada con el deploy (regla CLAUDE.md).
--
-- Aislamiento (LA PIEZA LOAD-BEARING) — RLS MIXTA owner OR is_admin:
--   A diferencia del resto del CRM (admin-only, 034) y del dashboard (business-scoped), conversations
--   y messages son la PRIMERA tabla del CRM que el DUEÑO también lee (base del add-on "Mensajes" de
--   gestion-rebrand). Por eso cada tabla lleva DOS policies permissive de SELECT que Postgres OR-ea:
--     (A) owner read  → el dueño ve SOLO conversaciones de su business_id (vía businesses.owner_id).
--     (B) admin read  → el operador is_admin (JWT app_metadata) ve TODAS (igual que el resto del CRM).
--   NO se crea policy de insert/update/delete para usuarios: SOLO el service-role escribe (ingest del
--   bot + takeover), así nada es falsificable (lección 029, espejo 034:158). NUNCA using(true).
--
--   `messages` DENORMALIZA business_id (no solo conversation_id) para que sus policies sean
--   byte-idénticas a las de conversations y baratas en runtime (sin subselect anidado por fila,
--   RESEARCH Pitfall 2). El ingest copia business.id al insertar el mensaje.
--
-- TODO operativo post-deploy: tras aplicar 038 a mano en Supabase, regenerar `supabase/schema.sql`
--   con `supabase db dump` para mantenerlo en sync (igual que 034/036, NO bloqueante).
-- ============================================================

-- ── 1. Tabla conversations (COMMS-01, D-04) ───────────────────────────────────────────────────────
-- Un hilo por (business_id, channel, contact_phone). channel fijo 'whatsapp' (mail diferido, D-01).
-- contact_phone se guarda normalizado (normalizeArWhatsApp). lead_id matchea un lead del pipeline por
-- phone/email (nullable: sin match la conversación igual está asignada al negocio). on delete:
--   - business_id cascade: si se borra el negocio, se borran sus conversaciones.
--   - lead_id set null: si se borra el lead, la conversación se preserva (solo se desliga).
create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  channel         text not null default 'whatsapp' check (channel in ('whatsapp')), -- mail diferido (D-01)
  contact_phone   text not null,                  -- normalizado (normalizeArWhatsApp)
  contact_name    text,
  lead_id         uuid references public.leads(id) on delete set null,  -- match por phone/email (D-04)
  handled_by      text not null default 'ai' check (handled_by in ('unassigned','ai','human')),
  unread_count    integer not null default 0,
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- Índice UNIQUE = onConflict del upsert del ingest (idempotencia de la conversación): un solo hilo por
-- negocio + canal + contacto.
create unique index if not exists conversations_tenant_contact_idx
  on public.conversations (business_id, channel, contact_phone);
create index if not exists conversations_business_idx on public.conversations (business_id);
create index if not exists conversations_last_msg_idx on public.conversations (last_message_at desc);

-- ── 2. Tabla messages (COMMS-01, D-05) ────────────────────────────────────────────────────────────
-- Mensajes del hilo. external_id = id del mensaje en el SQLite del bot → idempotencia en reintentos.
-- business_id DENORMALIZADO (copiado del conversation) para RLS barata e idéntica a conversations
-- (Pitfall 2). on delete cascade en ambos FK: al borrar la conversación/negocio se van los mensajes.
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  business_id     uuid not null references public.businesses(id) on delete cascade, -- denormalizado p/ RLS (Pitfall 2)
  external_id     text not null,                  -- id del mensaje en el bot → idempotencia (D-05)
  direction       text not null check (direction in ('inbound','outbound')),
  sender          text not null default 'contact' check (sender in ('contact','ai','human')),
  body            text not null,
  sent_at         timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- Índice UNIQUE sobre external_id = onConflict del upsert del ingest (idempotencia del mensaje).
create unique index if not exists messages_external_id_idx on public.messages (external_id);
create index if not exists messages_conversation_idx on public.messages (conversation_id, sent_at);

-- ── 3. RLS MIXTA (owner OR is_admin) — LA PIEZA LOAD-BEARING ──────────────────────────────────────
-- Dos policies permissive de SELECT por tabla que Postgres combina con OR: dueño (su business_id) O
-- admin (is_admin del JWT). SIN policy de insert/update/delete para usuarios → solo el service-role
-- escribe (ingest + takeover). auth.uid() y auth.jwt() envueltos en subselect (evaluados una vez por
-- query — regla de perf del SKILL rls). NUNCA using(true) (agujero de 029).

-- conversations
alter table public.conversations enable row level security;

drop policy if exists "owner read conversations" on public.conversations;
-- Policy A — dueño: ve SOLO conversaciones de su negocio (base del add-on "Mensajes" gestion-rebrand).
create policy "owner read conversations" on public.conversations
  for select using (
    business_id in (select id from public.businesses where owner_id = (select auth.uid()))
  );

drop policy if exists "admin read conversations" on public.conversations;
-- Policy B — operador admin (permissive → OR con A): ve TODAS (igual que el resto del CRM, mig 034).
create policy "admin read conversations" on public.conversations
  for select using (
    (select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true'
  );
-- Sin policy de insert/update/delete: solo el service-role escribe conversations (ingest + takeover).

-- messages (policies byte-idénticas gracias al business_id denormalizado)
alter table public.messages enable row level security;

drop policy if exists "owner read messages" on public.messages;
-- Policy A — dueño: ve SOLO mensajes de su negocio.
create policy "owner read messages" on public.messages
  for select using (
    business_id in (select id from public.businesses where owner_id = (select auth.uid()))
  );

drop policy if exists "admin read messages" on public.messages;
-- Policy B — operador admin (permissive → OR con A): ve TODOS.
create policy "admin read messages" on public.messages
  for select using (
    (select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true'
  );
-- Sin policy de insert/update/delete: solo el service-role escribe messages (ingest del bot).
