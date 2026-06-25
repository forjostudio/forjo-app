-- ============================================================
-- 039 · external_id de messages UNIQUE por tenant (BLOCKER CR-01)
-- ============================================================
-- QUÉ corrige:
--   El índice de idempotencia de messages era GLOBAL sobre external_id solo
--   (migración 038, línea 78). Como cada negocio lo sirve una instancia de bot
--   DISTINTA (cada una con su propio SQLite), los external_id son secuencias
--   independientes y COLISIONAN entre negocios (ambos emiten 'msg-1', '1',
--   autoincrement). Cuando el negocio B postea un mensaje cuyo external_id ya
--   existe para el negocio A, el upsert del ingest con ignoreDuplicates lo trata
--   como duplicado y DESCARTA SILENCIOSAMENTE un mensaje real del negocio B
--   (devuelve { ok: true }, el bot nunca reintenta). Pérdida de datos
--   cross-tenant en la bandeja (el core deliverable de la fase).
--
--   La idempotencia "id del mensaje en el bot" solo es única DENTRO de un negocio,
--   así que la unicidad debe estar scopeada al tenant: (business_id, external_id).
--
-- Se aplica A MANO y EN ORDEN (última aplicada antes de esta: 038). El número
--   correcto es 039. Coordinada con el deploy del cambio de onConflict en
--   app/api/agent/inbox/route.ts (el onConflict debe referenciar la MISMA tupla
--   de columnas que el índice único, o el upsert no deduplica / da error).
--
-- TODO operativo post-deploy: tras aplicar 039 a mano, regenerar
--   `supabase/schema.sql` (igual que 038, NO bloqueante).
-- ============================================================

-- Reemplaza el índice global por uno scopeado al tenant. drop if exists para que
-- sea idempotente al re-aplicar.
drop index if exists public.messages_external_id_idx;
create unique index if not exists messages_external_id_idx
  on public.messages (business_id, external_id);
