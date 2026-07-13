---
phase: 06-comms-bandeja
fixed_at: 2026-06-24T00:00:00Z
review_path: .planning/workstreams/crm/phases/06-comms-bandeja/06-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 6: Code Review Fix Report — Comms (Bandeja)

**Fixed at:** 2026-06-24
**Source review:** .planning/workstreams/crm/phases/06-comms-bandeja/06-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (1 BLOCKER + 5 WARNING; 4 INFO out of scope)
- Fixed: 6
- Skipped: 0
- tsc: clean · vitest: 242/242 green (20 files)

> ACCIÓN DEL OPERADOR REQUERIDA: la migración `039_messages_external_id_per_tenant.sql` (CR-01)
> debe aplicarse A MANO en el SQL Editor de Supabase, en orden, antes/junto al deploy. El código del
> ingest ya referencia `onConflict: 'business_id,external_id'`, que requiere el índice nuevo. Hasta
> aplicarla, el upsert dará error (o no deduplicará). Resume-signal: 'aplicada'.

## Fixed Issues

### CR-01: Global `external_id` uniqueness causes cross-tenant message loss

**Files modified:** `supabase/migrations/039_messages_external_id_per_tenant.sql` (new), `app/api/agent/inbox/route.ts`
**Commit:** 09e849e
**Status:** fixed (migration 039 created) — REQUIRES manual apply by operator
**Applied fix:** Created migration 039 que dropea el índice global `messages_external_id_idx` y lo
recrea sobre `(business_id, external_id)`. Cambié el `onConflict` del upsert del ingest de
`'external_id'` a `'business_id,external_id'` para que coincida con la tupla del índice. Comentario
en SQL explicando la colisión cross-tenant (cada negocio = bot distinto = secuencia de external_id
independiente). **La 039 NO la puedo aplicar yo** (migraciones a mano del operador).

### WR-01: Conversation upsert overwrites `contact_name`/`lead_id` with stale/null

**Files modified:** `app/api/agent/inbox/route.ts`
**Commit:** aff79df
**Status:** fixed: requires human verification (comportamiento de ruta, no cubierto por unit test)
**Applied fix:** El upsert ahora incluye `contact_name`/`lead_id` en el set SOLO cuando vienen no
nulos (coalesce app-side: si son null se omiten del objeto, y el upsert preserva el valor existente
en conflicto; en el insert inicial la columna queda en su default null). Un mensaje saliente del bot
o uno entrante sin nombre ya no borra el nombre/lead conocido. `last_message_at` se sigue refrescando
en cada mensaje.

### WR-02: Token comparison is not constant-time

**Files modified:** `lib/agent-auth.ts` (new), `lib/agent-auth.test.ts` (new), `app/api/agent/inbox/route.ts`, `app/api/agent/inbox/state/route.ts`
**Commits:** 925fed8 (helper + test + ingest), efbfbaf (state route)
**Status:** fixed
**Applied fix:** Extraje `agentAuthOk` a `lib/agent-auth.ts` con comparación constant-time
(`timingSafeEqual` sobre buffers de igual longitud, con guarda de longitud previa), manteniendo el
fail-closed sobre `FORJO_AGENT_TOKEN`. Ambos route handlers (ingest + state) ahora importan el helper
en vez de duplicar `authOk` (resuelve además IN-03 de paso). Agregué `lib/agent-auth.test.ts`
(5 tests: fail-closed sin secreto, token correcto, token incorrecto misma longitud, longitud distinta
sin lanzar, header ausente).

### WR-03: `sender` not constrained to `direction`

**Files modified:** `lib/conversations.ts`, `lib/conversations.test.ts`
**Commit:** 33d9b4e
**Status:** fixed
**Applied fix:** Agregué un `.superRefine` a `inboundSchema`: `inbound ⇒ sender 'contact'`,
`outbound ⇒ sender 'ai'|'human'`; rechaza combinaciones incoherentes. Actualicé el test del payload
mínimo (antes era outbound + default 'contact', ahora incoherente) a entrante, y agregué 3 tests
nuevos (outbound+ai válido, inbound+ai rechazado, outbound+contact rechazado).

### WR-04: `state` endpoint omits `channel` in lookup

**Files modified:** `app/api/agent/inbox/state/route.ts`
**Commit:** efbfbaf
**Status:** fixed
**Applied fix:** Agregué `.eq('channel', 'whatsapp')` a la query del state para que matchee la tupla
del índice único `(business_id, channel, contact_phone)` y `.maybeSingle()` siga siendo total cuando
se agregue un segundo canal (mail diferido).

### WR-05: Takeover/release ignores current state and doesn't verify row exists

**Files modified:** `app/(crm)/admin/bandeja/actions.ts`
**Commit:** a0cd775
**Status:** fixed: requires human verification (server action, no cubierta por unit test directo)
**Applied fix:** `takeConversation`/`releaseConversation` ahora LEEN el `handled_by` actual primero:
si la conversación no existe → `update_failed` (no se audita un takeover fantasma); si la transición
no es válida (`isValidHandledByTransition` ya unit-testeado), se retorna sin escribir ni auditar
(no-op → sin audit redundante ni toast espurio). Recién entonces se ejecuta el update + audit +
revalidate. Se mantiene el patrón de 6 pasos y el fail-closed.

## Skipped Issues

Ninguno — los 6 findings en scope se aplicaron.

Los 4 INFO quedaron fuera de scope (`critical_warning`). Nota: IN-03 (auth duplicada) quedó resuelto
de hecho al extraer el helper compartido en WR-02.

---

_Fixed: 2026-06-24_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
