---
phase: 06
slug: comms-bandeja
status: secured
threats_open: 0
threats_closed: 11
asvs_level: 1
block_on: high
created: 2026-06-24
---

# Phase 06 — Security: Comms / Bandeja (CRM)

**Workstream:** crm
**Phase:** 06-comms-bandeja
**Audited:** 2026-06-24
**ASVS Level:** 1
**Block-on:** high
**Register source:** authored at plan-time (PLAN.md `<threat_model>` blocks 06-01 / 06-02)
**Verification mode:** State-B — register built from plan threat models, mitigations verified against the working-tree code POST code-review-fix (incluye CR-01/WR-01..05). No new-threat scan.

**Result: SECURED — 11/11 threats CLOSED (10 mitigate, 1 accept). No OPEN threats, no unregistered flags.**

La superficie más sensible del milestone: un endpoint de ingest EXTERNO (el bot de WhatsApp POSTea conversaciones/mensajes), RLS MIXTA (dueño business-scoped OR is_admin) en las tablas nuevas, y un takeover auditado. El code-review encontró 1 BLOCKER (CR-01: pérdida cross-tenant por índice `external_id` global) + 5 WARNINGs — TODOS arreglados (commits 09e849e..a0cd775) y verificados en el código vivo; el fix de CR-01 (migración 039) refuerza T-06-04 y cierra el agujero cross-tenant.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| bot (otro repo, VPS) → `/api/agent/inbox` + `/state` | Input NO confiable: solo posee `FORJO_AGENT_TOKEN`, sin sesión Supabase. El payload (incl. cualquier business_id) es no confiable. | mensajes/conversaciones (texto, contacto) |
| operador (sesión is_admin) → server action takeover | Invocable directo (curl/devtools) sin pasar por el layout → re-guard `requireAdmin` obligatorio. | conversationId (uuid) |
| service-role → DB | El admin client (ingest + takeover) bypassa RLS; el aislamiento se garantiza por el slug validado + business_id derivado server-side. | escritura conversations/messages |
| dueño (sesión, RLS) → conversations/messages | El dueño SOLO ve su business_id (RLS owner — base del add-on Mensajes de gestion-rebrand). | filas de su negocio |
| RSC bandeja (server) → bandeja-client (browser) | Solo columnas no sensibles; el admin client nunca cruza. | lista/thread (no secretos) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-06-01 | Information Disclosure | RLS mixta conversations/messages | mitigate | `038:88,106` RLS on en ambas; 2 policies SELECT por tabla (owner `business_id in (select … owner_id=(select auth.uid()))` OR admin `is_admin` JWT); CERO write policy; nunca `using(true)`. | closed |
| T-06-02 | Spoofing | ingest POST | mitigate | `lib/agent-auth.ts:13-27` `agentAuthOk` fail-CLOSED + constant-time `timingSafeEqual` con length guard (fix WR-02); 1ª línea de `inbox/route.ts` → 401 antes de leer el body. | closed |
| T-06-03 | Tampering | resolución de tenant en el ingest | mitigate | `inbox/route.ts:45-50` tenant vía `.eq('slug', msg.slug)` → `business.id`; `inboundSchema` (conversations.ts) SIN campo `business_id` → el body no puede setear tenant; business_id escrito solo del slug validado. | closed |
| T-06-04 | Tampering / Integridad | reintento del bot / colisión CROSS-TENANT | mitigate | **Fix CR-01:** `039` dropea el índice global `external_id` y lo recrea `unique (business_id, external_id)`; `inbox/route.ts:119` `onConflict:'business_id,external_id'` matchea la tupla tenant-scoped. El índice global (pérdida silenciosa cross-tenant) ya no existe. | closed |
| T-06-05 | Elevation of Privilege | service-role en lectura del operador | mitigate | `bandeja/page.tsx` usa `createClient()` (session); `createAdminClient` solo en `actions.ts` (mutación legítima, no hay write policy). 0 en page/client; override admin vive en la RLS de 038. | closed |
| T-06-06 | Repudiation | takeover sin traza | mitigate | `actions.ts` `logAudit('conversation.takeover'/'release')` + registrado en `ACTION_LABEL` (`crm-timeline.ts:94-95`); audita solo en transición real (guard WR-05). | closed |
| T-06-07 | Information Disclosure | `FORJO_AGENT_TOKEN` filtrado al cliente | mitigate | Leído solo vía `process.env` en `agent-auth.ts` (server-only); sin `NEXT_PUBLIC_`. Nunca llega al cliente. | closed |
| T-06-08 | Information Disclosure | context endpoint | accept | `context/route.ts` devuelve solo lo que la página pública `/[slug]` ya muestra (name/slug/address/maps/bookingUrl + services + hours); sin secretos ni datos privados. Residual aceptado (ver Accepted Risks). | closed |
| T-06-09 | Information Disclosure | filas crudas / sensibles al cliente | mitigate | `page.tsx` SELECT explícito de columnas no sensibles (sin `select('*')`); solo lo necesario para lista/thread. Defensa en profundidad: layout guard `is_admin` + RLS. | closed |
| T-06-10 | Tampering | composer / envío manual no autorizado | mitigate | `bandeja-client.tsx` composer (Input/Send/adjuntar) `disabled` sin submit cableado (D-03 diferido). Sin superficie de envío en v1. | closed |
| T-06-SC | Tampering (supply-chain) | npm installs | mitigate | `tech-stack.added: []` en ambos SUMMARY; cero deps nuevas (node:crypto/zod/sonner/shadcn ya en el repo). | closed |

*Status: open · closed* · *Disposition: mitigate · accept · transfer*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| T-06-08 | T-06-08 | `GET /api/agent/context?slug=` devuelve name/slug/address/maps_url/bookingUrl + servicios activos + horarios — los MISMOS datos que la página pública de reservas `/[slug]` ya expone. Sin secretos, sin datos privados del tenant (ni clientes, ni finanzas, ni historia clínica). Riesgo residual bajo, aceptado por diseño (el bot necesita estos datos para armar su prompt). | CRM operator (dueño) | 2026-06-24 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-24 | 11 | 11 | 0 | gsd-security-auditor (opus) |

Nota: la auditoría se corrió DESPUÉS del code-review-fix cycle (CR-01 + WR-01..05). El fix de CR-01 (migración 039, aplicada a mano por el operador) cierra la pérdida silenciosa de mensajes cross-tenant y refuerza T-06-04.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log (T-06-08)
- [x] `threats_open: 0` confirmed
- [x] `status: secured` set in frontmatter

**Approval:** verified 2026-06-24
