---
phase: 06-comms-bandeja
plan: 01
subsystem: api
tags: [supabase, rls, multi-tenant, whatsapp, agent-ingest, zod, postgres, audit]

# Dependency graph
requires:
  - phase: 04-pipeline-tags-timeline
    provides: "leads/business_id model, ACTION_LABEL central en lib/crm-timeline, patrón de 6 pasos de server actions (_content-actions.ts), lib/audit.ts"
  - phase: 02-admin-plataforma
    provides: "RLS admin-read del CRM (auth.jwt -> is_admin), createAdminClient solo server, businesses.slug como tenant key"
provides:
  - "Tablas conversations/messages (migración 038) con RLS MIXTA owner-OR-admin (2 SELECT policies por tabla, 0 write policies)"
  - "lib/conversations.ts puro: matchEntity (lead por phone/email), inboundSchema (zod del ingest), isValidHandledByTransition + tipo HandledBy"
  - "lib/agent-context.ts puro: mapBusinessHours / mapServices para el context endpoint"
  - "Endpoint ingest POST (/api/agent/inbox): token fail-closed + tenant del slug + upsert idempotente"
  - "Endpoint context GET (/api/agent/context): shape del HANDOFF (business + services + hours + bookingUrl)"
  - "Endpoint state GET (/api/agent/inbox/state): handled_by por slug+phone para el polling de pausa del bot"
  - "takeConversation / releaseConversation (server actions auditadas) + ACTION_LABEL conversation.takeover/release"
affects: [06-02 (UI de la bandeja del operador, lee las tablas vivas con session client), whatsapp-ai-agent-kit (bot externo que consume los endpoints)]

# Tech tracking
tech-stack:
  added: []  # Cero dependencias nuevas (zero-install verificado en RESEARCH §Package Legitimacy Audit)
  patterns:
    - "RLS MIXTA: dos policies permissive de SELECT (owner business_id OR is_admin) que Postgres OR-ea — primera tabla del CRM que el dueño también lee"
    - "Ingest no confiable espejo del webhook de pago: auth fail-closed → slug→tenant → service-role write; business_id NUNCA del body"
    - "Idempotencia por índice UNIQUE (messages.external_id) + upsert onConflict ignoreDuplicates (atómico, sin race)"
    - "business_id DENORMALIZADO en messages para que su RLS sea byte-idéntica a conversations"
    - "Libs puras testeables separadas de routes delgadas (lib/conversations, lib/agent-context)"

key-files:
  created:
    - supabase/migrations/038_conversations_messages.sql
    - lib/conversations.ts
    - lib/conversations.test.ts
    - lib/agent-context.ts
    - lib/agent-context.test.ts
    - app/api/agent/inbox/route.ts
    - app/api/agent/context/route.ts
    - app/api/agent/inbox/state/route.ts
    - app/(crm)/admin/bandeja/actions.ts
    - app/(crm)/admin/bandeja/_bandeja-actions.schemas.ts
  modified:
    - lib/crm-timeline.ts

key-decisions:
  - "RLS mixta = dos policies SELECT separadas (owner + admin), NO una condición gigante ni using(true) — Postgres OR-ea las permissive"
  - "messages.business_id denormalizado (NOT NULL) para RLS byte-idéntica a conversations (RESEARCH Pitfall 2)"
  - "Ingest escribe SÍNCRONO (sin after()): el 200 debe significar 'persistido' para el loop de reintento del bot"
  - "state endpoint sin match de conversación devuelve 200 { handled_by: null } (no 404) — el bot lo trata como 'sin pausa'"
  - "COMMS-03 (mail two-way) DIFERIDO a v2 (D-01): channel CHECK solo permite 'whatsapp'; sin tab/columna/endpoint de mail"
  - "Envío manual saliente (composer 'send') DIFERIDO (D-03): no se creó endpoint send; el takeover pausa el bot, el operador responde por el canal del bot"

patterns-established:
  - "RLS mixta owner-OR-admin: base del add-on 'Mensajes' de gestion-rebrand (el dueño lee sus conversaciones, el operador todas)"
  - "Endpoints del agente: auth fail-closed con FORJO_AGENT_TOKEN (server-only, espejo de verifyMPSignature)"

requirements-completed: [COMMS-01, COMMS-02]

# Metrics
duration: ~10min
completed: 2026-06-24
status: complete
---

# Phase 6 Plan 1: Comms (Bandeja) — Cimiento de datos + endpoints del agente Summary

**Tablas conversations/messages con RLS mixta owner-OR-admin (migración 038, aplicada a Supabase), libs puras testeables, y los tres endpoints del agente (ingest fail-closed e idempotente, context con shape del HANDOFF, state para el polling de pausa) + takeover auditado.**

## Performance

- **Duration:** ~10 min (continuación de cierre; build/test en sesión previa)
- **Completed:** 2026-06-24
- **Tasks:** 3 (2 auto TDD + 1 checkpoint human-verify resuelto)
- **Files modified:** 11 (10 creados + 1 editado)

## Accomplishments
- Migración 038: `conversations` + `messages` con RLS MIXTA (2 SELECT policies por tabla: owner business_id + is_admin; CERO write policies — solo service-role escribe), índices UNIQUE de idempotencia (`conversations(business_id,channel,contact_phone)`, `messages(external_id)`), `business_id` denormalizado en messages.
- Libs puras testeables: `lib/conversations.ts` (matchEntity por phone-then-email vía normalizeArWhatsApp, inboundSchema zod, isValidHandledByTransition) y `lib/agent-context.ts` (mapBusinessHours/mapServices).
- Tres endpoints del agente: ingest POST (fail-closed + tenant del slug + upsert idempotente), context GET (HANDOFF shape con bookingUrl), state GET (handled_by para que el bot sepa cuándo pausar).
- takeConversation/releaseConversation auditadas (patrón de 6 pasos) + ACTION_LABEL conversation.takeover/release en el mapa central.
- Migración 038 APLICADA a Supabase y RLS verificada por el operador (checkpoint resuelto).

## Task Commits

1. **Task 1: Migración 038 + libs puras (TDD)** - `057e4ca` (feat)
2. **Task 2: Endpoints del agente + takeover auditado** - `658f6a9` (feat)
3. **Task 3: Checkpoint — aplicar migración 038 a Supabase** - resuelto (manual, sin commit de código)

**Plan metadata:** `.planning/` está gitignored → el commit de metadata se omite (esperado, sequential mode).

_Nota: las tareas TDD pueden tener test→feat intercalados; aquí se consolidaron en el commit feat por tarea._

## Files Created/Modified
- `supabase/migrations/038_conversations_messages.sql` - Tablas conversations/messages + RLS mixta + índices de idempotencia
- `lib/conversations.ts` - matchEntity, inboundSchema (zod), isValidHandledByTransition, tipo HandledBy (puro)
- `lib/conversations.test.ts` - Tests vitest de match/schema/transición
- `lib/agent-context.ts` - mapBusinessHours / mapServices (puro)
- `lib/agent-context.test.ts` - Tests vitest del mapeo hours/services
- `app/api/agent/inbox/route.ts` - Ingest POST (token fail-closed + slug→tenant + upsert idempotente)
- `app/api/agent/context/route.ts` - Context GET read-only por slug (shape del HANDOFF)
- `app/api/agent/inbox/state/route.ts` - State GET handled_by por slug+phone (polling de pausa)
- `app/(crm)/admin/bandeja/actions.ts` - takeConversation / releaseConversation (server actions auditadas)
- `app/(crm)/admin/bandeja/_bandeja-actions.schemas.ts` - Schemas zod de las actions
- `lib/crm-timeline.ts` - ACTION_LABEL += conversation.takeover / conversation.release (edición aditiva)

## Decisions Made
None nuevas más allá del plan — ver `key-decisions` en frontmatter. Decisiones LOCKED del plan (RLS mixta de 2 policies, denormalización de business_id, ingest síncrono, state→null sin match, COMMS-03/send DIFERIDOS) se aplicaron tal cual.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Checkpoint Resolution

**Task 3 (checkpoint:human-verify, gate blocking-human) — RESUELTO.** El operador aplicó a mano `supabase/migrations/038_conversations_messages.sql` en el SQL Editor de Supabase (en orden, tras 037) y verificó:
- Existen `public.conversations` y `public.messages` con RLS habilitada.
- Exactamente 2 policies de SELECT por tabla (owner read + admin read), 0 policies de insert/update/delete.
- Índices UNIQUE presentes: `conversations(business_id, channel, contact_phone)` y `messages(external_id)`.

Resume-signal recibido: "aplicada". Pendiente operativo NO bloqueante: regenerar `supabase/schema.sql` con `supabase db dump --linked` (igual que 034/036/037).

## Deferrals

- **COMMS-03 (mail two-way) — DIFERIDO a v2 (D-01):** el CHECK de `channel` solo admite `'whatsapp'`; no hay tab, columna ni endpoint de mail. Mail entrante requiere infra de inbound (otro servicio/dominio) — fuera de scope de v1.
- **Envío manual saliente (composer 'send') — DIFERIDO (D-03):** no se creó endpoint send. El takeover pausa el bot (vía el state endpoint) y el operador responde por el canal del propio bot.

## Threat Flags

Sin superficie nueva fuera del `<threat_model>` del plan. Todos los threats T-06-xx con disposition `mitigate` están cubiertos por el código de esta fase:

| Threat ID | Mitigación implementada |
|-----------|-------------------------|
| T-06-01 (RLS mixta) | 2 SELECT policies (owner OR is_admin) + subselect auth.uid; sin write policy; verificada en Supabase |
| T-06-02 (ingest spoofing) | authOk fail-CLOSED sobre FORJO_AGENT_TOKEN (sin rama fail-open) |
| T-06-03 (tenant tampering) | business_id del slug validado (`.eq('slug', ...)`), nunca del body |
| T-06-04 (duplicación) | índice UNIQUE messages.external_id + upsert onConflict ignoreDuplicates |
| T-06-05 (service-role en lectura del operador) | createAdminClient prohibido en page/client (lectura va en 06-02 con session client) |
| T-06-06 (takeover sin traza) | logAudit('conversation.takeover'/'conversation.release') en la action |
| T-06-07 (token filtrado) | FORJO_AGENT_TOKEN server-only (NO NEXT_PUBLIC_) |
| T-06-SC (supply-chain) | Cero dependencias nuevas |

T-06-08 (context expone datos de la página pública) — disposition `accept`, riesgo bajo.

## Must-Haves Status

| Must-have | Estado |
|-----------|--------|
| Ingest persiste mensaje del bot con token válido | ✅ ingest POST upsert |
| Ingest sin token válido → 401 (fail-closed) | ✅ authOk fail-closed |
| Mismo external_id no duplica (idempotencia) | ✅ UNIQUE + onConflict |
| Tenant del slug validado, nunca del body | ✅ .eq('slug', ...) |
| GET context devuelve shape del HANDOFF + bookingUrl | ✅ context GET |
| GET state devuelve handled_by para pausar el bot | ✅ state GET |
| takeConversation → handled_by='human', auditado, leído por state | ✅ action + logAudit |
| Dueño ve SOLO su business_id; admin ve todas | ✅ RLS mixta (verificada en Supabase) |

## Next Phase Readiness
- 06-02 (UI de la bandeja del operador) desbloqueado: las tablas viven en Supabase, la RLS mixta está verificada, y 06-02 las lee con session client (NO service-role).
- Pendiente operativo no bloqueante: regenerar `supabase/schema.sql`.

## Self-Check: PASSED

- Artifacts en disco: 11/11 FOUND (10 creados + lib/crm-timeline.ts editado).
- Commits en gsd/crm: `057e4ca` FOUND, `658f6a9` FOUND.
- RLS: `enable row level security` ×2 en migración 038. ACTION_LABEL conversation.takeover/release presentes. FORJO_AGENT_TOKEN en ingest+state.
- tsc --noEmit: limpio (exit 0). vitest: 234/234 (verificado por el executor en sesión previa).

---
*Phase: 06-comms-bandeja*
*Completed: 2026-06-24*
