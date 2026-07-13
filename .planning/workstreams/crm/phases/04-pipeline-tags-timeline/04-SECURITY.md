---
phase: 04
slug: pipeline-tags-timeline
status: secured
threats_open: 0
threats_closed: 17
asvs_level: 1
block_on: high
created: 2026-06-21
updated: 2026-06-22
---

# SECURITY.md — Phase 4: Pipeline, Tags & Timeline (CRM)

**Workstream:** crm
**Phase:** 04-pipeline-tags-timeline
**Audited:** 2026-06-21 (initial 16) · 2026-06-22 (update: +T-04-16 from gap-plans 04-08/04-09 + fix 530fd2b)
**ASVS Level:** 1
**Block-on:** high
**Register source:** authored at plan-time (PLAN.md `<threat_model>` blocks 04-01 / 04-02 / 04-03 / 04-08 / 04-09)
**Verification mode:** State-A — verify declared mitigations exist in working-tree code (no new-threat scan)

**Result: SECURED — 17/17 threats CLOSED. No OPEN threats, no unregistered flags.**

This phase is the most security-sensitive surface of the system: admin-only CRM tables (RLS-gated by `is_admin` JWT claim) plus a single service-role write triggered from the public onboarding flow (`linkLeadOnSignup`). All four high-severity threats (T-04-01, T-04-02, T-04-05, T-04-10) were verified with direct code evidence.

---

## Threat Verification (all `mitigate`)

| Threat ID | Severity | Category | Disposition | Status | Evidence |
|-----------|----------|----------|-------------|--------|----------|
| T-04-01 | HIGH | Information Disclosure | mitigate | CLOSED | `supabase/migrations/034_crm_pipeline_tags_timeline.sql:213-214` — `create or replace view public.crm_timeline with (security_invoker = true)`; comment L205-211 + `comment on view` L254-255 forbid removing the flag. Plain CREATE VIEW (security-definer) is NOT used. |
| T-04-02 | HIGH | Elevation of Privilege | mitigate | CLOSED | Migration L153-198: all 6 tables `enable row level security` + exactly one `for select using ((select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true')` policy each; NO insert/update/delete policy. `using(true)` appears only on comment lines L23 and L150 (prohibition reminders) — zero in live policy code (grep confirmed). |
| T-04-03 | MED | Tampering | mitigate | CLOSED | Migration L69-72: `deals.stage text ... check (stage in ('lead','calificado','trial','propuesta','pago'))` and `deals.status text ... check (status in ('open','won','lost'))`. `lib/crm-pipeline.ts:16-22` STAGES single source of truth; `_crm-actions.schemas.ts:17-18` `stageEnum` derived from `STAGES.map(s => s.key)` (no duplicated literal). |
| T-04-04 | MED | Information Disclosure | mitigate | CLOSED | Migration L104 `entity_type text not null check (entity_type in ('lead','business'))`; L111-112 `create unique index entity_tags_unique_idx on (tag_id, entity_type, entity_id)`; L177-182 admin-only SELECT policy on entity_tags. |
| T-04-05 | HIGH | Elevation of Privilege | mitigate | CLOSED | `app/(crm)/admin/_pipeline-actions.ts:186-245` — `linkLeadOnSignup` writes leads/deals only via `createAdminClient()` (service-role, L197); it is the single non-admin-flow path touching admin-only tables; isolated in its own function with best-effort try/catch. |
| T-04-06 | HIGH | Spoofing | mitigate | CLOSED | `_pipeline-actions.ts:188` parses `linkLeadOnSignupSchema` (only `businessId`); owner email re-derived at L192-196 from `supabase.auth.getUser()` then `.toLowerCase()`; input email/leadId never read. Schema in `_crm-actions.schemas.ts:52-54` accepts `businessId` only. |
| T-04-07 | MED | Tampering | mitigate | CLOSED | `_pipeline-actions.ts` — `moveStage` (L43-44), `createDeal` (L72-73), `markLost` (L118-119), `convertLead` (L144-145) each: `requireAdmin()` first line + `<schema>.parse(input)` second. `lib/admin-guard.ts:14-26` throws on non-admin. |
| T-04-08 | LOW | Repudiation | mitigate | CLOSED | `_pipeline-actions.ts` — `logAudit` on each mutation: `deal.stage_change` w/ `metadata {from,to}` (L56-63), `deal.create` (L103-109), `deal.mark_lost` w/ `{reason}` (L128-135), `lead.convert` (L161-168). |
| T-04-09 | MED | Denial of Service | accept/mitigate | CLOSED | `_pipeline-actions.ts:190-244` linkLeadOnSignup body wrapped in try/catch → `console.error` on failure, never throws. Consumed in `app/(onboarding)/onboarding/page.tsx:219-223` inside try/catch; failure does not block `router.push('/dashboard')` (L226). Accepted residual: an unlinked lead is re-linked by hand (D-06). |
| T-04-10 | HIGH | Information Disclosure | mitigate | CLOSED | `app/(crm)/admin/negocios/[id]/page.tsx:73-79` — `crm_timeline` read via `createClient()` (session/anon+cookies, NOT `createAdminClient`) with `.eq('business_id', id)`. `lib/supabase/server.ts` uses ANON key; `lib/supabase/admin.ts` uses SERVICE_ROLE — confirmed distinct clients. |
| T-04-11 | MED | Tampering | mitigate | CLOSED | `app/(crm)/admin/_content-actions.ts` — `createNote` (L44-46), `editNote` (L71-73), `deleteNote` (L94-96), `createTask` (L114-116), `completeTask` (L142-144) each: `requireAdmin()` first + `.parse()` second. |
| T-04-12 | LOW | Repudiation | mitigate | CLOSED | `_content-actions.ts` — `logAudit` per action: `note.create` (L56), `note.edit` (L82), `note.delete` (L102), `task.create` (L128), `task.complete` (L156), with `businessId` where applicable so entries feed the business timeline. |
| T-04-13 | MED | Information Disclosure | mitigate | CLOSED | `entity_tags` admin-only (migration L177-182). Directory read `negocios/page.tsx:61-79` and ficha read `negocios/[id]/page.tsx:89-108` use service-role after layout guard (`app/(crm)/layout.tsx:22-29` redirects non-admins); only non-sensitive tagIds/label/color cross to client. |
| T-04-14 | MED | Tampering | mitigate | CLOSED | `_content-actions.ts:94-109` `deleteNote` logs `risk: 'medio'` and is gated by `requireAdmin()` (the guarantee); ConfirmDialog in the UI is reinforcement per SUMMARY 04-03. |
| T-04-15 | HIGH-surface | Tampering | mitigate | CLOSED | `app/(crm)/admin/_tag-actions.ts` — `createTag` (L34-36), `assignTag` (L58-60), `removeTag` (L86-88) each: `requireAdmin()` first + `.parse()` second; writes via `createAdminClient()`. `assignTag` idempotent: L69 `if (error && error.code !== '23505') throw` (unique_violation treated as success). |
| T-04-16 | MED | Tampering | mitigate | CLOSED | `app/(crm)/admin/_tag-actions.ts:96-120` — `removeTag`: L97 `requireAdmin()` FIRST → L98 `removeTagSchema.parse(input)` → L99 `createAdminClient()` (service-role) → L101-106 delete → L109-116 `logAudit('tag.remove', risk:'bajo')` → L118-119 revalidate. Schema `_crm-actions.schemas.ts:75-79`: `tagId`/`entityId` uuid, `entityType` `z.enum(['lead','business'])` (no se confía en el cliente). UI solo invoca: `tag-manager-dialog.tsx:79-91` `handleRemove` sin autorización client-side. `requireAdmin` lanza (`lib/admin-guard.ts:18/22`) → el diálogo no puede bypassear. Verificado en AMBOS montajes: pipeline `pipeline-client.tsx` (entityType='lead') y ficha `ficha-client.tsx:567-573` ('business'). El fix 530fd2b solo cambia qué estado client lee el diálogo (`activeTagDeal` = fila viva de `deals`), misma forma id/label/color/tagIds → sin exposición nueva (T-04-13 intacto). |
| T-04-SC | LOW | Tampering (supply-chain) | mitigate | CLOSED | `git log -- package.json package-lock.json` → last manifest change `d9c45dd (05-01)`, BEFORE Phase 4. None of the Phase 4 commits (e9d5964..42cc4ee) touched manifests. Native HTML5 DnD used; zero new deps (SUMMARY 04-02 `tech-stack.added: []`). |

---

## Defense-in-depth notes

- **Two independent admin gates.** Every CRM write goes through `requireAdmin()` (server action, throws on non-admin — `lib/admin-guard.ts`). Every CRM read of base tables is RLS-gated by the `is_admin` SELECT policy. The layout guard (`app/(crm)/layout.tsx`) is a third, render-time gate. Service-role reads (businesses/entity_tags/tags/notes by id) sit behind the layout guard and only emit non-sensitive columns to the client.
- **VIEW privilege model.** `crm_timeline` is `security_invoker = true`, so it runs with the caller's privileges and inherits the admin-read RLS of `audit_log`/`notes`/`tasks`. This is the opposite of the migration-027 public views (intentionally security-definer for anon). The read site uses the session client, not service-role — required for the inheritance to act as the gate.
- **Anti-tampering at the cross-boundary write.** `linkLeadOnSignup` is the only place a non-admin session reaches admin-only tables. It accepts `businessId` only and re-derives the owner email from `auth.getUser()`, mirroring the booking-route anti-tampering rule. A direct POST injecting `email`/`leadId` is ignored (covered by `_pipeline-actions.test.ts` per SUMMARY 04-02).

---

## Threat Flags (from SUMMARYs)

- 04-01 `## Threat Flags`: "Ninguno nuevo" — all plan threats mapped, `tech-stack.added: []`.
- 04-02 / 04-03: security sections map each threat to its register ID; no new attack surface declared.

**Unregistered flags:** none.

---

## Accepted Risks Log

| ID | Risk | Rationale | Owner |
|----|------|-----------|-------|
| T-04-09 | A lead may remain unlinked if the best-effort conversion fails during onboarding | Onboarding integrity (business creation + redirect) takes priority over conversion; an unlinked lead is re-linked manually via `convertLead` from the board (D-06). Failure is logged via `console.error('[onboarding/link-lead]', ...)`. | CRM operator |

---

## Operational follow-ups (not blocking, not security gaps)

- **Migration 034 is applied manually** (repo convention — no `supabase db push`). Operator confirmed "aplicada" in the 04-01 checkpoint; the auditor cannot query Supabase directly. The DB-side facts verified here are the migration *source* (RLS enable, single SELECT policy per table, `security_invoker=true`, CHECK constraints), which is what ships in the repo. The runtime confirmation (pg_policies / pg_class reloptions) was the operator's checkpoint responsibility.
- **Regenerate `supabase/schema.sql`** with `supabase db dump` to keep it in sync with 034 (noted in 04-01 SUMMARY; cosmetic, not a security gap).

---

## Security Audit 2026-06-22 (update)

Trigger: gap-closure plans 04-08 / 04-09 (+ UAT fix 530fd2b) añadieron la superficie de gestión de tags (diálogo compartido + quitar tag desde el pipeline). State-A update audit.

| Metric | Count |
|--------|-------|
| Threats verified this pass | 3 (T-04-16 nuevo + T-04-13 + T-04-15 re-verificados) |
| Closed | 3 |
| Open | 0 |
| Total register | 17 (16 previos intactos + 1 nuevo) |

- **T-04-16 (nuevo): CLOSED.** `removeTag` enforce `requireAdmin()` + `removeTagSchema.parse()` server-side (enum entityType, uuid entityId) antes de mutar; la UI solo invoca. El diálogo no puede bypassear el gate. Verificado en pipeline (lead) y ficha (business).
- **T-04-13 / T-04-15: sin regresión.** El fix 530fd2b solo cambia el origen del estado client (`activeTagDeal` = fila viva de `deals`); misma forma de datos (id/label/color/tagIds), sin exposición nueva. Las 3 tag actions mantienen `requireAdmin` + zod + service-role + logAudit.
- Los 14 threats restantes no fueron tocados por 04-08/04-09 → siguen CLOSED.

---

## Verdict

All 17 declared threats (16 STRIDE + 1 supply-chain) resolve to **CLOSED** with direct code evidence. No mitigation is absent or contradicted in the working tree. Phase 4 clears the `block_on: high` gate.
