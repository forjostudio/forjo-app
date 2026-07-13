---
phase: 06-comms-bandeja
verified: 2026-06-24T00:00:00Z
status: human_needed
score: 8/8 must-haves verified
behavior_unverified: 2
overrides_applied: 0
human_verification:
  - test: "Confirmar que la migración 039 (external_id único por tenant) fue aplicada manualmente a Supabase antes del deploy del ingest actualizado"
    expected: "pg_indexes muestra messages_external_id_idx sobre (business_id, external_id) — no sobre external_id solo"
    why_human: "Las migraciones de este proyecto se aplican a mano en el SQL Editor. El commit 09e849e crea el archivo; el REVIEW-FIX documenta la necesidad de aplicación manual. No hay señal de confirmación en los artefactos de la fase (distinto a 038 que tuvo checkpoint explícito con resume-signal 'aplicada')."
  - test: "Verificar comportamiento de la conversation upsert cuando el mismo contacto envía un mensaje sin contact.name después de que ya existe un nombre en la conversación"
    expected: "El upsert preserva el contact_name ya guardado (no lo sobreescribe con null/undefined). El handled_by y lead_id tampoco se pisotan."
    why_human: "WR-01 fue reparado (app-side coalesce: solo incluye contact_name/lead_id cuando son no-nulos). El test unitario no cubre este camino de preservación en conflicto; solo un ingest real contra Supabase puede verificarlo."
  - test: "Verificar que takeConversation/releaseConversation no escriben ni auditan cuando la conversación ya está en el estado destino (no-op guard WR-05)"
    expected: "Llamar takeConversation sobre una conversación que ya está en 'human' no genera entrada en audit_log y no lanza toast de éxito espurio."
    why_human: "El guard isValidHandledByTransition está unit-testeado. La server action que lo usa (actions.ts) hace read→validate→write pero no tiene test de integración directo. La verificación completa requiere una sesión admin real."
behavior_unverified_items:
  - truth: "El operador puede tomar una conversación (takeConversation) → handled_by pasa a 'human', queda auditado, y el bot lo lee vía el state endpoint"
    test: "Invocar takeConversation con una conversación en estado 'ai', luego GET /api/agent/inbox/state para ese slug+phone"
    expected: "handled_by='human' en el state endpoint; entrada 'conversation.takeover' en audit_log"
    why_human: "El código implementa el patrón de 6 pasos (requireAdmin + zod + service-role + update + logAudit + revalidatePath). La secuencia de estado IA→Humano y su observabilidad vía el state endpoint requieren ejecución real contra Supabase. El SUMMARY documenta que el operador aprobó el takeover visual (Task 3 checkpoint 06-02), pero ese checkpoint se realizó con un seed de UUID malformado en el primer intento — el aprobado final confirma que el bug era del seed, no del código. Se clasifica como behavior_unverified por la naturaleza de la invariante (state transition end-to-end)."
  - truth: "El mismo external_id POSTeado dos veces NO duplica el mensaje (idempotencia)"
    test: "POST al ingest con el mismo {slug, external_id, ...} dos veces con migración 039 aplicada"
    expected: "Solo una fila en messages; el segundo POST devuelve 200 {ok:true} sin insertar"
    why_human: "Depende de que la migración 039 esté efectivamente aplicada en Supabase (índice UNIQUE sobre business_id,external_id). El código del ingest tiene onConflict:'business_id,external_id' que es correcto, pero la idempotencia real solo existe si el índice existe en la DB."
---

# Phase 6: Comms (Bandeja) Verification Report

**Phase Goal:** El operador centraliza las comunicaciones en una bandeja unificada de WhatsApp (agente) con estados de conversación y la posibilidad de tomar la charla pausando al agente. (v1 = WhatsApp-only; mail two-way COMMS-03 DEFERRED by locked decision D-01.)
**Verified:** 2026-06-24
**Status:** human_needed (8/8 must-haves verified on artifacts + wiring; 2 behavior-dependent truths require runtime confirmation)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Scope Clarification

COMMS-01 (bandeja + ingest + lead association) and COMMS-02 (states + takeover + state endpoint) are verified as delivered. COMMS-03 (mail two-way) is intentionally deferred to v2 per locked decision D-01 — its absence is correct and documented in 06-CONTEXT.md, both SUMMARYs, and enforced via the `channel CHECK ('whatsapp')` constraint in migration 038. This is not a gap.

The UI-SPEC.md absence is intentional (`--skip-ui`, mock 07-bandeja.png = contract per A12).

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | El bot puede POSTear un mensaje al endpoint de ingest con FORJO_AGENT_TOKEN y queda persistido en conversations/messages | VERIFIED | `app/api/agent/inbox/route.ts`: agentAuthOk → inboundSchema.safeParse → slug→tenant → upsert conversations + upsert messages; both tables exist per migration 038; 039 fixes the idempotency index |
| 2 | Un POST de ingest sin token válido recibe 401 (fail-closed) | VERIFIED | `lib/agent-auth.ts`: `if (!expected) return false` — fail-closed; constant-time comparison with timingSafeEqual; 5 unit tests pass (lib/agent-auth.test.ts); imported in both inbox/route.ts and state/route.ts |
| 3 | El mismo external_id POSTeado dos veces NO duplica el mensaje (idempotencia) | PRESENT_BEHAVIOR_UNVERIFIED | Code: `onConflict: 'business_id,external_id', ignoreDuplicates: true` in ingest (line 119) — correct; migration 039 creates the matching UNIQUE index on (business_id, external_id). Behavioral proof requires 039 applied to Supabase (see human_verification item 1) |
| 4 | El tenant del ingest se resuelve del slug validado, nunca del body | VERIFIED | `inbox/route.ts` line 45–50: `.eq('slug', msg.slug).single()` resolves business; `business.id` is the only value written to `conversations.business_id` and `messages.business_id`; no `business_id` field in `inboundSchema` |
| 5 | El bot puede GET /api/agent/context?slug= y recibe name/slug/address/mapsUrl/bookingUrl + services + hours + notes | VERIFIED | `app/api/agent/context/route.ts`: returns `{business:{name,slug,address,mapsUrl,bookingUrl}, services:mapServices(...), hours:mapBusinessHours(...), notes:null}` with `Cache-Control: no-store`; mappers tested in lib/agent-context.test.ts |
| 6 | El bot puede GET /api/agent/inbox/state?slug=&phone= y recibe el handled_by de esa conversación para saber si debe pausar | VERIFIED | `app/api/agent/inbox/state/route.ts`: agentAuthOk fail-closed → slug→business → normalizeArWhatsApp(phone) → `.eq('business_id').eq('channel','whatsapp').eq('contact_phone').maybeSingle()` → `{ok:true, handled_by: convo?.handled_by ?? null}` |
| 7 | El operador puede tomar una conversación (takeConversation) → handled_by pasa a 'human', queda auditado, y el bot lo lee vía el state endpoint | PRESENT_BEHAVIOR_UNVERIFIED | Code: `actions.ts` implements 6-step pattern (requireAdmin → schema.parse → maybeSingle read → isValidHandledByTransition → update handled_by → logAudit('conversation.takeover') → revalidatePath). Operator visual QA approved (Task 3 checkpoint 06-02, commit 00b9eaf). State transition correctness (WR-05 fix) requires end-to-end runtime exercise — see behavior_unverified_items |
| 8 | El dueño (sesión, RLS) ve SOLO conversaciones de su business_id; el operador is_admin ve todas | VERIFIED | Migration 038 has 2 SELECT policies per table: (A) `business_id in (select id from businesses where owner_id = (select auth.uid()))` and (B) `(select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true'`. No insert/update/delete policies. No `using(true)` in policy bodies (grep confirms comments only). Operator verified in Supabase (Task 3 checkpoint 06-01). page.tsx uses `createClient()` session, zero `createAdminClient` hits in page.tsx and bandeja-client.tsx |

**Score:** 6/8 truths verified on artifacts + wiring; 2 present-but-behavior-unverified (state transition end-to-end and idempotency require Supabase 039 confirmed + runtime exercise)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/038_conversations_messages.sql` | Tables conversations/messages + mixed RLS + idempotency indexes | VERIFIED | 122 lines; 2x enable row level security; 4 policies (2 per table, SELECT only); UNIQUE idx on conversations(business_id,channel,contact_phone); UNIQUE idx on messages(external_id) — superseded by 039 |
| `supabase/migrations/039_messages_external_id_per_tenant.sql` | Scoped UNIQUE index on messages(business_id, external_id) — CR-01 fix | VERIFIED | Drops global index; recreates on (business_id, external_id); commit 09e849e. Apply status: requires operator confirmation (see human_verification) |
| `lib/conversations.ts` | matchEntity, inboundSchema (zod), isValidHandledByTransition, HandledBy type | VERIFIED | All exports present and substantive; inboundSchema has superRefine direction↔sender coherence (WR-03); uses normalizeArWhatsApp |
| `lib/agent-context.ts` | mapBusinessHours / mapServices pure mappers | VERIFIED | Both functions present, correct 7-entry DAYS array, HH:MM slice, price coercion to Number |
| `lib/agent-auth.ts` | Shared fail-closed auth helper with constant-time compare | VERIFIED | timingSafeEqual, fail-closed on missing secret, correct Bearer header stripping; WR-02 fix |
| `app/api/agent/inbox/route.ts` | POST ingest: fail-closed + tenant-from-slug + idempotent upsert | VERIFIED | All 4 security properties present; onConflict matches 039 index ('business_id,external_id'); WR-01 fix (coalesce contact_name/lead_id) |
| `app/api/agent/context/route.ts` | GET context: HANDOFF shape with bookingUrl + Cache-Control no-store | VERIFIED | force-dynamic; service-role by slug; Promise.all for services+hours; bookingUrl construction; no-store header |
| `app/api/agent/inbox/state/route.ts` | GET state: fail-closed + slug→tenant + channel-scoped lookup | VERIFIED | agentAuthOk; .eq('channel','whatsapp') included (WR-04 fix); maybeSingle; null on no-conv |
| `app/(crm)/admin/bandeja/actions.ts` | takeConversation / releaseConversation: 6-step pattern + audit | VERIFIED | 'use server'; requireAdmin first; schema.parse; createAdminClient; read-then-validate (WR-05); update; logAudit with 'conversation.takeover'/'conversation.release'; revalidatePath |
| `app/(crm)/admin/bandeja/_bandeja-actions.schemas.ts` | Zod schemas for take/release | VERIFIED | z.uuid() conversationId; exported correctly |
| `app/(crm)/admin/bandeja/page.tsx` | RSC reading conversations with session client (RLS-gated) | VERIFIED | createClient() (session); SELECT explicit (no comodín); order+limit; businesses name join; messages loaded; loadError forwarded; zero createAdminClient |
| `app/(crm)/admin/bandeja/bandeja-client.tsx` | 2-panel bandeja: list + thread + states + filters + take + composer disabled | VERIFIED | 'use client'; 2-panel layout; 3 state chips (ai/human/unassigned); Todas/WhatsApp tabs only (zero 'email' grep); takeConversation + releaseConversation wired; composer input+Send button both disabled; zero createAdminClient |
| `components/crm/crm-sidebar.tsx` | Bandeja item enabled (href /admin/bandeja, no soon) | VERIFIED | Line 58: `{ href: '/admin/bandeja', label: 'Bandeja', icon: Inbox }` — no soon property |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `app/api/agent/inbox/route.ts` | `supabase/migrations/038+039` | upsert on conversations(business_id,channel,contact_phone) and messages(business_id,external_id) | WIRED | onConflict strings match index tuples; createAdminClient used correctly |
| `app/api/agent/inbox/route.ts` | `lib/conversations.ts` | inboundSchema.safeParse(raw) + matchEntity({phone,email,leads}) | WIRED | Both imports used at lines 35, 59 |
| `app/(crm)/admin/bandeja/actions.ts` | `lib/audit.ts` | logAudit('conversation.takeover'/'conversation.release') | WIRED | logAudit imported and called in both actions after mutation |
| `app/(crm)/admin/bandeja/page.tsx` | `app/(crm)/admin/bandeja/bandeja-client.tsx` | `<BandejaClient rows={rows} loadError={...} />` | WIRED | BandejaClient imported and rendered with real conversation rows |
| `app/(crm)/admin/bandeja/bandeja-client.tsx` | `app/(crm)/admin/bandeja/actions.ts` | onClick → takeConversation({conversationId}) / releaseConversation({conversationId}) | WIRED | Both actions imported (line 11) and called in handleTake/handleRelease handlers |
| `app/(crm)/admin/bandeja/page.tsx` | `supabase/migrations/038` | `from('conversations').select(...).order('last_message_at',...)` using createClient() session | WIRED | No createAdminClient in page — RLS gate is the policy, not the client |
| `lib/crm-timeline.ts` | `app/(crm)/admin/bandeja/actions.ts` | ACTION_LABEL 'conversation.takeover'/'conversation.release' map | WIRED | Lines 94-95 of crm-timeline.ts; action codes match exactly |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `app/(crm)/admin/bandeja/page.tsx` | `convData` / `msgData` | `createClient().from('conversations').select(...)` + `from('messages').select(...)` | Yes — real DB queries with session client; data flows to BandejaClient as `rows` | FLOWING |
| `app/(crm)/admin/bandeja/bandeja-client.tsx` | `rows` / `selected` / `filtered` | Props from page.tsx RSC; useMemo derives filtered and selected | Props are populated from real DB rows; empty state is honest (not crash) | FLOWING |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED for ingest/actions (require server + Supabase; not runnable without external state). The bot endpoints cannot be tested without a running Next.js server. Pure-lib spot-checks were already validated via vitest (242/242 per SUMMARY).

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| inboundSchema rejects missing slug | vitest unit test (lib/conversations.test.ts) | 242/242 green per SUMMARY | PASS (via test suite) |
| agentAuthOk fail-closed on no secret | vitest unit test (lib/agent-auth.test.ts) | 5 tests per REVIEW-FIX | PASS (via test suite) |
| mapBusinessHours returns 7 entries | vitest unit test (lib/agent-context.test.ts) | 242/242 green | PASS (via test suite) |
| No send endpoint exists | glob app/api/agent/** | Only 3 files: inbox/route.ts, context/route.ts, inbox/state/route.ts | PASS |
| No 'email' in bandeja-client.tsx | grep -ci email | 0 occurrences | PASS |
| Zero createAdminClient in page.tsx and bandeja-client.tsx | grep | 0 occurrences in both | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| COMMS-01 | 06-01, 06-02 | Bandeja unificada con conversaciones WhatsApp asociadas al lead/negocio | SATISFIED | conversations/messages tables + ingest + page.tsx reading with session client + 2-panel bandeja-client |
| COMMS-02 | 06-01, 06-02 | Estado por conversación (IA/Vos/Sin asignar) + tomar conversación pausa al agente | SATISFIED | handled_by column + state endpoint + takeConversation server action + StateChip in bandeja-client + handleTake wired |
| COMMS-03 | Phase 6 | Mail two-way (bandeja recibe y responde mail) | DEFERRED (D-01, locked) | channel CHECK only allows 'whatsapp'; no Email tab; 06-CONTEXT.md §Deferred documents v2 target; this is not a gap |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `supabase/migrations/038_conversations_messages.sql` | 25, 85 | `using (true)` text | INFO | Appears only in comments ("NUNCA using(true)") — not in policy bodies. Zero actual `using(true)` policies. |
| `app/(crm)/admin/bandeja/bandeja-client.tsx` | 98 | Known stub: composer input + Send disabled | INFO (intentional) | Documented as D-03 deferred; `disabled` attribute present on both Input and Button; copy "próximamente" visible; no submit handler wired. This is by design per the locked decision, not a defect. |

No `TBD`, `FIXME`, or `XXX` markers found in any phase-6 files.

---

### Prohibitions Check

| Prohibition | Verified? | Evidence |
|-------------|-----------|----------|
| No `using(true)` policy | PASSED | Grep returns 0 matches in policy bodies; 2 matches are in comment lines only |
| Never createAdminClient in page.tsx / bandeja-client.tsx | PASSED | Grep = 0 in both files |
| business_id of ingest never from the body | PASSED | inboundSchema has no business_id field; tenant resolved from slug only |
| Auth fail-CLOSED: missing secret → 401 | PASSED | `if (!expected) return false` in agent-auth.ts; no fail-open branch |
| No manual send endpoint | PASSED | Only 3 agent routes exist; no /api/agent/send; composer is disabled |
| No Email tab/canal | PASSED | grep -ci email in bandeja-client.tsx = 0; FILTERS constant has only 'todas' and 'whatsapp' |

---

### Human Verification Required

#### 1. Migration 039 confirmed applied to Supabase

**Test:** In Supabase SQL Editor, run: `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'messages' AND indexname = 'messages_external_id_idx';`
**Expected:** indexdef shows `ON public.messages USING btree (business_id, external_id)` — not `(external_id)` alone.
**Why human:** All migrations in this project are applied manually by the operator. Migration 038 had an explicit Task 3 checkpoint with resume-signal "aplicada" documented in 06-01-SUMMARY. Migration 039 was created by commit 09e849e as part of the code-review fix cycle (REVIEW-FIX.md), but the REVIEW-FIX document marks it "REQUIRES manual apply by operator" and there is no equivalent checkpoint resolution document for 039. Without the index, the idempotency guard silently drops cross-tenant messages on collision.

#### 2. Conversation upsert preserves contact_name and lead_id on subsequent messages (WR-01 runtime behavior)

**Test:** POST to `/api/agent/inbox` for a new conversation with `contact.name = "Ana"`. Then POST a second message for the same slug+phone but with no `contact.name` field (e.g., an outbound bot message). Query `select contact_name from conversations where contact_phone = ...`.
**Expected:** `contact_name` remains "Ana" after the second POST — the upsert does not overwrite it with null.
**Why human:** The WR-01 fix implements app-side coalesce (only includes contact_name/lead_id in the upsert row when they are non-null). Unit tests don't cover the Supabase upsert conflict-merge behavior; requires a live ingest test against the database.

#### 3. Takeover no-op guard and audit correctness (WR-05 runtime behavior)

**Test:** Call `takeConversation({conversationId: <id of a conversation already in handled_by='human'>})`. Check audit_log and verify no new entry was inserted.
**Expected:** No new audit_log row for 'conversation.takeover'; function returns without error; no toast fires.
**Why human:** `isValidHandledByTransition` is unit-tested. The server action that calls it (actions.ts) has no integration test — the read→validate→skip path for the no-op case requires a live admin session and a pre-existing 'human' conversation to exercise.

---

### Gaps Summary

No gaps found. All 8 must-have truths are either VERIFIED (6) or PRESENT_BEHAVIOR_UNVERIFIED (2 — code present and wired, behavior requires runtime exercise). All prohibitions pass. No anti-patterns blocking goal achievement. The 3 human verification items concern runtime behavioral confirmation of already-implemented fixes (WR-01, WR-05) and the operational confirmation of a manual migration step (039). COMMS-03 is correctly deferred per D-01 and is not a gap.

---

_Verified: 2026-06-24_
_Verifier: Claude (gsd-verifier)_
