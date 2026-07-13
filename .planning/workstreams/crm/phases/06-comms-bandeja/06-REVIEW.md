---
phase: 06-comms-bandeja
reviewed: 2026-06-24T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
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
  - app/(crm)/admin/bandeja/page.tsx
  - app/(crm)/admin/bandeja/bandeja-client.tsx
  - components/crm/crm-sidebar.tsx
  - lib/crm-timeline.ts
findings:
  critical: 1
  warning: 5
  info: 4
  total: 10
status: issues_found
---

# Phase 6: Code Review Report — Comms (Bandeja)

**Reviewed:** 2026-06-24
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

The highest-stakes path — cross-tenant isolation of the ingest endpoint — is **sound**. The `inboundSchema` carries no `business_id`; the tenant is derived server-side from the validated `slug` (`inbox/route.ts:51-56`) and that server-derived `business.id` is the only value written into `conversations.business_id` and `messages.business_id`. A malicious POST cannot write into another tenant's `business_id`. Auth is fail-closed on `FORJO_AGENT_TOKEN`, evaluated before the body is touched. RLS on the new tables is mixed owner-OR-admin SELECT with no insert/update/delete policy, never `using(true)`, and `business_id` is denormalized on `messages` as documented. The bandeja page reads via the session client (RLS-gated), not service-role. Takeover actions follow the `requireAdmin → zod → service-role → audit → revalidate` pattern verbatim.

The one **BLOCKER** is a cross-tenant data-loss vector: the `messages` idempotency index is global on `external_id` alone, so a bot id collision across businesses silently drops a real message via `ignoreDuplicates`. Several WARNINGs concern upsert-on-conflict overwriting good data with stale/null values, and a non-constant-time token comparison.

## Critical Issues

### CR-01: Global `external_id` uniqueness causes cross-tenant message loss

**File:** `supabase/migrations/038_conversations_messages.sql:78` + `app/api/agent/inbox/route.ts:98-109`
**Issue:** The idempotency index is `create unique index messages_external_id_idx on public.messages (external_id)` — **global, not scoped to `business_id` or `conversation_id`**. The comment defines `external_id` as "id del mensaje en el SQLite del bot". Different businesses are served by different bot instances (each with its own SQLite), so their message ids are independent sequences and **will** collide (e.g. both emit `msg-1`, `1`, autoincrement ids). When tenant B posts a message whose `external_id` already exists for tenant A, the ingest upsert with `ignoreDuplicates: true` (line 108) treats it as a duplicate and **silently drops a legitimate message from tenant B** — returning `{ ok: true }`, so the bot never retries. This is silent cross-tenant data loss in the inbox, the core deliverable of the phase. The "idempotencia en reintentos" guarantee only holds within a single global id space, which the data model does not have.
**Fix:** Scope the uniqueness to the tenant (or conversation), and match the `onConflict` target:
```sql
-- migration 039 (new)
drop index if exists messages_external_id_idx;
create unique index messages_business_external_id_idx
  on public.messages (business_id, external_id);
```
```ts
// inbox/route.ts
.upsert(
  { conversation_id: convo.id, business_id: business.id, external_id: msg.external_id, /* ... */ },
  { onConflict: 'business_id,external_id', ignoreDuplicates: true },
)
```
Scoping by `conversation_id` is also acceptable and slightly tighter; whichever is chosen, the `onConflict` string in the upsert must reference the exact same column tuple as the unique index or the upsert will error / not dedupe.

## Warnings

### WR-01: Conversation upsert overwrites `contact_name` and `lead_id` with stale/null data on every message

**File:** `app/api/agent/inbox/route.ts:75-89`
**Issue:** The conversation upsert runs on **every** inbound message and, on conflict, overwrites the existing row's `contact_name` and `lead_id`. Two concrete regressions: (1) if a later message arrives with `contact.name` absent, `contact_name` is set back to `null` (line 82 → `msg.contact.name ?? null`), erasing a previously-known name. (2) `lead_id` is recomputed from the current payload; if the lead was matched once by email and a later message lacks the email, or the lead row was edited, `lead_id` can flip to `null`, silently un-linking the conversation from the pipeline. An outbound bot message (`direction: 'outbound'`, no real contact name) will routinely clobber the inbound-derived name.
**Fix:** Either restrict the upsert's `update` set to only `last_message_at` (e.g. via a DB trigger or a separate update path that uses `coalesce`), or guard the overwrite app-side: only overwrite `contact_name`/`lead_id` when the new value is non-null. With Supabase upsert this typically means splitting into an insert-or-fetch for the conversation and a targeted `update` that only touches `last_message_at` plus `coalesce`-style non-null fields.

### WR-02: Token comparison is not constant-time

**File:** `app/api/agent/inbox/route.ts:25` and `app/api/agent/inbox/state/route.ts:17`
**Issue:** `got === expected` compares the bearer token with a short-circuiting string equality, which leaks length/prefix timing information. The webhook signing path elsewhere in the codebase is the reference for secret comparison; a shared bearer token guarding a service-role write/ingest deserves constant-time comparison to avoid a (remote, but real) timing oracle on the secret.
**Fix:** Compare with a timing-safe primitive:
```ts
import { timingSafeEqual } from 'node:crypto'
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a); const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}
// ...
return Boolean(got) && safeEqual(got!, expected)
```
(Both ingest and state endpoints duplicate `authOk` — see IN-03; fixing once in a shared helper covers both.)

### WR-03: `sender` not constrained to `direction` — outbound 'contact' / inbound 'ai' accepted

**File:** `lib/conversations.ts:42-44` + `app/api/agent/inbox/route.ts:103-105`
**Issue:** `inboundSchema` validates `direction` and `sender` independently. Nothing rejects incoherent combinations like `direction:'inbound'` + `sender:'ai'`, or `direction:'outbound'` + `sender:'contact'`. The bandeja client renders bubble side and "Vos / Agente IA" labels off these two fields (`bandeja-client.tsx:382-383`), so an incoherent payload produces a mislabeled/misplaced bubble. Since the bot is untrusted input per CLAUDE.md, the schema should enforce the invariant rather than trust the bot to keep them consistent.
**Fix:** Add a `superRefine`/`refine` on `inboundSchema`: inbound ⇒ sender must be `'contact'`; outbound ⇒ sender must be `'ai' | 'human'`. Reject otherwise with `missing_fields`.

### WR-04: `state` endpoint can read another tenant's conversation handled_by if a phone collides

**File:** `app/api/agent/inbox/state/route.ts:40-45`
**Issue:** The query filters `.eq('business_id', business.id).eq('contact_phone', normalizedPhone)` — this is correctly tenant-scoped, so cross-tenant leak is **not** present here (good). The real issue is robustness: `.maybeSingle()` will throw if two rows match. The unique index `(business_id, channel, contact_phone)` includes `channel`, but this query omits `channel`. Today `channel` is fixed to `'whatsapp'` by a CHECK, so at most one row matches — but the moment a second channel is added (the migration comments explicitly anticipate mail), two rows can share `(business_id, contact_phone)` and `.maybeSingle()` will error, breaking the bot's pause-detection (fail-open: bot keeps answering a conversation a human took over).
**Fix:** Add `.eq('channel', 'whatsapp')` to the state query to match the uniqueness tuple and keep `.maybeSingle()` total.

### WR-05: Takeover/release update is not scoped to a tenant and ignores current state

**File:** `app/(crm)/admin/bandeja/actions.ts:36-40, 61-65`
**Issue:** Two sub-issues. (1) The update is keyed only on `.eq('id', data.conversationId)` with service-role (RLS bypassed). This is acceptable for an admin-only action, but there is no verification that the row exists: Supabase `update` of a non-existent id returns no error, so a bogus `conversationId` (valid uuid, wrong row) succeeds silently and still writes an audit entry claiming a takeover that touched nothing. (2) `isValidHandledByTransition` exists and is unit-tested but is **never called** here — the action sets `handled_by='human'` unconditionally even if it was already `'human'`, producing a redundant audit log and a spurious "Tomaste la conversación" toast. The phase built a transition validator and then bypassed it.
**Fix:** Add `.select('id').single()` (or check `count`) after the update to confirm a row was affected, throwing `update_failed` if not; and gate the write on the current `handled_by` (read-then-validate with `isValidHandledByTransition`, or add `.neq('handled_by', 'human')` and treat zero rows as a no-op rather than success).

## Info

### IN-01: `filter` state is a dead dependency in the conversation list filter

**File:** `app/(crm)/admin/bandeja/bandeja-client.tsx:142-153`
**Issue:** The `useMemo` lists `filter` in its dependency array but never reads it inside the callback (the body only uses `query`). The comment acknowledges the WhatsApp tab is "equivalente a 'todas' hoy". The tab toggles state and re-runs the memo for nothing. Harmless, but it's dead logic that will mislead the next editor into thinking channel filtering works.
**Fix:** Either drop `filter` from the deps and the `Tabs` until a second channel exists, or actually filter by channel once `channel` is on `ConversationRow`.

### IN-02: `direction`/`sender`/`handled_by` re-narrowed defensively in page.tsx despite DB CHECK constraints

**File:** `app/(crm)/admin/bandeja/page.tsx:75-76, 94`
**Issue:** The page coerces `m.direction === 'outbound' ? 'outbound' : 'inbound'` and similar ternaries because the typed columns come back as `string`. These DB columns already have CHECK constraints, so the values are guaranteed — the ternaries silently map any unexpected value to a default rather than surfacing it. Not a bug, but the "silently coerce to inbound/contact/ai" behavior would mask a real data anomaly. Acceptable defensive coding; noting for awareness.
**Fix:** Optional — type the select result and narrow once, or leave as-is.

### IN-03: `authOk` duplicated verbatim across two route handlers

**File:** `app/api/agent/inbox/route.ts:21-26` and `app/api/agent/inbox/state/route.ts:13-18`
**Issue:** The fail-closed token check is copy-pasted in both agent endpoints. Duplication means a security fix (e.g. WR-02 constant-time compare) must be applied in two places and can drift.
**Fix:** Extract to `lib/agent-auth.ts` (`export function agentAuthOk(request: NextRequest): boolean`) and import in both routes.

### IN-04: `context` endpoint is unauthenticated by design — confirm intent

**File:** `app/api/agent/context/route.ts:13-15`
**Issue:** Unlike the ingest and state endpoints, the context endpoint has **no** `FORJO_AGENT_TOKEN` check. The header comment justifies it ("Devuelve lo MISMO que ya muestra la página pública del negocio ... sin secretos, T-06-08 accept"), and the selected columns are non-secret. This is a documented accept, not a defect — flagging only so the reviewer confirms the threat-model decision still holds (the endpoint enumerates services/hours per slug to any caller). No fix required if T-06-08 stands.
**Fix:** None required; verify T-06-08 acceptance is current.

---

_Reviewed: 2026-06-24_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
