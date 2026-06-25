-- 033_audit_actor_nullable.sql
--
-- QUÉ: hace `audit_log.actor_id` NULLABLE para registrar acciones del SISTEMA / callers
--      externos que NO tienen un usuario de auth.users (ej. el endpoint `set-plan` gateado
--      por `x-admin-secret`, sin sesión). Un `actor_id` NULL = "Sistema" en el visor de
--      auditoría (la tabla de Phase 1 ya contempla el actor "Sistema").
--
-- POR QUÉ (CR-01, code review Phase 2): `set-plan/route.ts` escribe plan/plan_status vía
--      service-role (la migración 032 no lo revierte) sin quedar en auditoría. Para auditar
--      ese path (decisión del operador: "Auditar set-plan") `logAudit` debe poder insertar
--      sin un actor humano. La 031 dejó `actor_id uuid not null references auth.users(id)
--      on delete set null` — contradicción latente (not null + on delete set null): este
--      cambio la resuelve dejando la columna nullable, consistente con el `on delete set null`.
--
-- Se aplica A MANO y EN ORDEN — última aplicada: 032. Coordinar con el deploy del código
-- que llama logAudit({ actorId: null }) desde set-plan.
--
-- TODO post-deploy (operativo, no bloqueante): regenerar supabase/schema.sql con `supabase db dump`.

alter table public.audit_log
  alter column actor_id drop not null;
