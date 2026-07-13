---
phase: 02-admin-de-plataforma
plan: 02
subsystem: crm-mutations
tags: [server-actions, zod, audit, multi-tenant, security, booking, dashboard-guard]

# Dependency graph
requires:
  - phase: 02-admin-de-plataforma (plan 01)
    provides: "plan_prices + has_web_custom/has_whatsapp (migr. 032), getPlanPrices(), resolveTrialEndsAt(), 'suspended' en VALID_STATUSES de set-plan"
  - phase: 01-cimientos-auditor-a
    provides: "requireAdmin() (lib/admin-guard.ts), logAudit() (lib/audit.ts), action codes del visor"
provides:
  - "app/(crm)/admin/_actions.ts — las 6 server actions del CRM ('use server', primer patron de actions del repo): changePlan/suspendBusiness/reactivateBusiness/extendTrial/toggleAddon/updatePlanPrice"
  - "app/(crm)/admin/_actions.schemas.ts — schemas zod puros (importables en test node) + VALID_PLANS/VALID_STATUSES/ADDON_KEYS"
  - "Corte real de 'suspended' (D-06): booking/create 403 plan_inactive + redirect del dashboard del dueno a /suspendido"
  - "app/suspendido/page.tsx — landing del dueno suspendido"
affects: ["02-03", "02-04", "pantallas CRM (ficha negocio, editor de planes) que invocan estas actions"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server actions con guard server-side: requireAdmin() PRIMERA linea + zod parse + mutacion + logAudit + revalidatePath"
    - "Schemas zod en modulo puro (sin 'use server') para testear validacion en node"
    - "Blocklist-not-allowlist extendido por suma de valor, preservando el comentario SEC-04"

key-files:
  created:
    - app/(crm)/admin/_actions.schemas.ts
    - app/(crm)/admin/_actions.schemas.test.ts
    - app/(crm)/admin/_actions.ts
    - app/suspendido/page.tsx
  modified:
    - app/api/booking/create/route.ts
    - app/(dashboard)/layout.tsx

key-decisions:
  - "z.uuid() / z.iso.datetime() / z.int() (API top-level de zod 4.4.3), no las formas deprecadas z.string().uuid()"
  - "suspendBusiness/reactivateBusiness parsean con setStatusSchema.pick({businessId:true}) y fijan el status server-side (el cliente no elige el estado)"
  - "extendTrial actualiza SOLO trial_ends_at — NO toca plan_status (extender un trial nunca reactiva ni cambia el estado); un negocio suspended sigue suspended"
  - "reactivateBusiness replica la logica de set-plan/route.ts: active -> trial_ends_at=null (no se borra ni mueve set-plan)"
  - "updatePlanPrice escribe plan_prices (price_ars + updated_at + updated_by); NO crea preapprovals ni toca MercadoPago (D-04, T-02-08 aceptado)"

requirements-completed: [ADM-03, ADM-04, ADM-05, ADM-06]

# Metrics
duration: 4min
completed: 2026-06-18
status: complete
---

# Phase 2 Plan 02: Capa de mutacion del CRM (server actions + corte real de suspended) Summary

**Las 6 server actions del CRM (`'use server'`, primer patron de actions del repo) que cambian plan, suspenden/reactivan, extienden trial, togglean add-ons y editan precios — cada una con `requireAdmin()` primera linea + zod + `logAudit()` — mas el corte REAL de `'suspended'` (booking 403 + dashboard redirige a `/suspendido`).**

## Performance
- **Duration:** ~4 min
- **Started:** 2026-06-18T15:21:56Z
- **Completed:** 2026-06-18T15:25:40Z
- **Tasks:** 3/3 autonomas completas
- **Files created/modified:** 6

## Accomplishments
- `_actions.schemas.ts`: schemas zod en modulo puro (sin `'use server'`) — `changePlanSchema`, `setStatusSchema`, `extendTrialSchema` (refine `preset_or_date_required`), `toggleAddonSchema`, `updatePlanPriceSchema` + constantes `VALID_PLANS`/`VALID_STATUSES`/`ADDON_KEYS`. 19 tests Vitest verdes (aceptacion/rechazo de cada schema).
- `_actions.ts`: 6 server actions, todas con el orden obligatorio requireAdmin() -> parse -> mutacion -> logAudit -> revalidatePath. Action codes exactos que reconoce el visor (`plan.change`, `business.suspend`, `business.reactivate`, `trial.extend`, `addon.toggle`, `plan.price_edit`).
- Corte real de `'suspended'` (D-06): `'suspended'` sumado al blocklist SEC-04 de `booking/create` (403 `plan_inactive`); guard en `(dashboard)/layout.tsx` que redirige a `/suspendido`; pagina `/suspendido` sobria (h1 unico, mobile-first, contacto).

## Task Commits
1. **Task 1: schemas zod + test puro (TDD)** - `79b6e7a` (feat)
2. **Task 2: 6 server actions** - `e897dcc` (feat)
3. **Task 3: corte real de 'suspended'** - `095fa7c` (feat)

## Files Created/Modified
- `app/(crm)/admin/_actions.schemas.ts` - schemas zod puros + constantes de enum
- `app/(crm)/admin/_actions.schemas.test.ts` - 19 tests Vitest (node)
- `app/(crm)/admin/_actions.ts` - las 6 server actions del CRM
- `app/suspendido/page.tsx` - landing del dueno suspendido
- `app/api/booking/create/route.ts` - +'suspended' en el blocklist (solo el valor; comentario SEC-04 intacto)
- `app/(dashboard)/layout.tsx` - guard redirect a /suspendido si plan_status==='suspended'

## Decisions Made
- **API top-level de zod 4** (`z.uuid()`, `z.iso.datetime()`, `z.int()`) en vez de las formas deprecadas `z.string().uuid()`. El proyecto corre zod 4.4.3.
- **suspend/reactivate fijan el status server-side** y validan con `setStatusSchema.pick({businessId:true})`: el cliente nunca elige el estado destino de estas dos actions.
- **extendTrial actualiza SOLO `trial_ends_at`** — NO muta `plan_status` (constraint del prompt y del plan: extender un trial no reactiva). reactivateBusiness es la unica que pone `active` + `trial_ends_at=null`, replicando set-plan/route.ts sin moverlo ni borrarlo.
- **updatePlanPrice escribe `plan_prices`** (`price_ars`, `updated_at=now()`, `updated_by=actor.id`) y NO toca MercadoPago (D-04); el comentario aclara que el precio nuevo aplica a cobros futuros, no muta suscripciones MP activas (T-02-08 aceptado).

## Threat Model Compliance
- **T-02-04 (EoP):** `requireAdmin()` es la PRIMERA linea de las 6 actions (verificado `grep -c "requireAdmin()"` = 8 ocurrencias, ≥6). El guard del layout NO autoriza actions invocadas directo.
- **T-02-05 (Tampering):** cada action hace `<schema>.parse(input)` antes de mutar (enums de plan/estado/addon, priceArs int>=0).
- **T-02-06 (Repudiation):** `logAudit()` service-role tras cada mutacion con action code reconocido.
- **T-02-07 (integridad):** booking blocklist += 'suspended' (403) + redirect del dashboard a /suspendido.
- **T-02-08 / T-02-SC:** aceptados — updatePlanPrice no toca MP; no se instalaron paquetes nuevos.
- **D-10 respetado:** no se toco `app/api/subscription/webhook/route.ts`. set-plan/route.ts intacto (su logica se replico).

## Deviations from Plan
None - plan ejecutado tal cual fue escrito. El blocklist de booking se extendio por suma de valor (comentario SEC-04 preservado), extendTrial no muta plan_status, y el webhook MP no se toco.

## Issues Encountered
None. Las advertencias `LF will be replaced by CRLF` de git son cosmeticas (Windows). El artefacto de line-endings de `app/[slug]/booking-client.tsx` mencionado en el prompt nunca aparecio en `git status`; se commiteo solo con adds explicitos de los archivos de cada task. El init del SDK resolvio por defecto al workstream `web-builder`; se trabajo con los paths explicitos del workstream `crm` del prompt.

## Self-Check: PASSED
- 6 archivos creados/modificados verificados en disco (FOUND).
- 3 commits verificados en git (79b6e7a, e897dcc, 095fa7c).
- 19/19 tests Vitest verdes; `tsc --noEmit` sin errores nuevos en los archivos de la fase.
- `grep -c "requireAdmin()"` = 8 (>=6); action codes presentes; blocklist con 'suspended'; guard + /suspendido presentes.

---
*Phase: 02-admin-de-plataforma*
*Completed: 2026-06-18*
