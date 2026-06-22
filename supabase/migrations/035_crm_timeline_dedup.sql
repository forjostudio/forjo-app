-- ── 035: de-duplicar crm_timeline (TL-01, gap del 04-UAT) ───────────────────────────────────────
-- POR QUÉ: la VIEW crm_timeline (migr.034) ya trae notas y tareas por sus propias ramas (notes/tasks).
-- Pero _content-actions.ts también escribe en audit_log vía logAudit con codes note.create/note.edit/
-- note.delete/task.create/task.complete, así que cada nota/tarea entraba DOS veces al timeline: una por
-- su tabla base y otra por la rama audit_log. Resultado: cada nota/tarea aparecía duplicada.
--
-- FIX: redefinir la VIEW con create or replace (las migraciones son inmutables — NO se toca la 034)
-- agregando un filtro en la rama 1 (audit_log) que excluye esos action codes. audit_log queda INTACTO:
-- el visor de auditoría sigue mostrando esos eventos; solo dejan de aparecer por partida doble en el
-- timeline (que ya los muestra vía las ramas notes/tasks). Las ramas notes y tasks son idénticas a 034.
--
-- WITH (security_invoker = true) es CRÍTICO (T-04-10 / Pitfall 1): sin el flag la VIEW correría
-- security-DEFINER y BYPASSARÍA la RLS admin-only de las tablas base. Con security_invoker = true la
-- view corre con los privilegios del CALLER y HEREDA la RLS admin-read de audit_log/notes/tasks. El
-- WHERE solo filtra filas duplicadas; NO amplía visibilidad. NUNCA quitar el flag.
--
-- NO se ordena dentro de la view: el consumidor ordena por occurred_at desc.
create or replace view public.crm_timeline
  with (security_invoker = true)
  as (
    -- Rama 1: cambios de auditoría. actor null = acción del sistema; si no, un operador.
    -- Se excluyen los codes note.*/task.* porque ya entran al timeline por sus propias ramas (notes/tasks).
    select
      'cambio'::text                                                          as kind,
      (case when actor_id is null then 'sistema' else 'operador' end)::text   as actor_type,
      action                                                                  as title,
      reason                                                                  as body,
      created_at                                                              as occurred_at,
      metadata                                                                as metadata,
      business_id                                                             as business_id
    from public.audit_log
    where action not in ('note.create','note.edit','note.delete','task.create','task.complete')

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
  'Timeline unificado (audit_log + notes + tasks) con security_invoker=true: hereda la RLS admin-only de las tablas base. NUNCA quitar el flag (correría security-definer y bypassaría el gate admin). La rama audit_log excluye los codes note.*/task.* para no duplicar notas/tareas que ya entran por sus propias ramas (035).';
