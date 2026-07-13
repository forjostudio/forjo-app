---
phase: 02-admin-de-plataforma
verified: 2026-06-18T14:10:00Z
status: passed
human_verification_result: "UAT 4/4 pass (02-UAT.md, 2026-06-18) — corte suspended, audit set-plan (migr 033 aplicada), trigger 032, flujo ficha/precios→auditoría. Migraciones 032 + 033 aplicadas a mano por el operador."
score: 24/24 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Marcar un negocio de prueba como suspended (suspendBusiness desde la ficha) y luego POST /api/booking/create con su slug"
    expected: "El endpoint responde 403 { ok:false, error:'plan_inactive' } antes de reCAPTCHA/slot; el dueño de ese negocio es redirigido a /suspendido y no entra al dashboard"
    why_human: "Corte real de runtime (HTTP 403 + redirect server-side) que requiere base con un negocio suspendido y un request real; grep confirma la blocklist y el guard, no el comportamiento corriendo"
  - test: "Aplicar migración 033 (audit_log.actor_id → nullable) a mano en Supabase, luego POST /api/admin/set-plan con x-admin-secret cambiando plan o status"
    expected: "La mutación queda registrada en audit_log con actor_id NULL (= 'Sistema'); el insert NO falla por NOT NULL en actor_id"
    why_human: "Migración 033 está PENDIENTE de aplicar a mano (convención del repo). El logAudit con actorId:null ya está en el código (CR-01), pero el insert fallará silenciosamente hasta que 033 esté aplicada. Acción humana surfaced, no gap de fase"
  - test: "Aplicar/confirmar migración 032 en Supabase y, como usuario dueño NO-admin, intentar UPDATE businesses SET has_whatsapp=true / plan='pro' / plan_status='active' sobre su propia fila"
    expected: "Las 4 columnas (has_web_custom, has_whatsapp, plan, plan_status) NO cambian — el trigger businesses_protect_admin_columns las revierte; solo el service-role (server actions del CRM) las escribe"
    why_human: "El trigger se ejecuta en Postgres; su efecto (revertir columnas para sesión authenticated) solo es observable corriendo el UPDATE contra la base con la migración aplicada"
  - test: "Como operador, recorrer la ficha de un negocio: cambiar plan, suspender (escribir SUSPENDER), reactivar, extender trial (preset + fecha exacta), togglear los 2 add-ons; luego editar un precio en /admin/planes (escribir CONFIRMAR)"
    expected: "Cada acción muestra el ConfirmDialog correcto por riesgo, se refleja tras revalidatePath, y aparece una entrada en /admin/auditoria con el action code y riesgo correctos"
    why_human: "Flujo de UI end-to-end (dialogs, optimistic toggle, revalidación, aparición en el visor de auditoría) que no se puede ejercitar con grep/tsc; necesita el navegador y la base"
---

# Phase 2: Admin de Plataforma — Verification Report

**Phase Goal:** El operador gestiona el ciclo de vida de cada negocio (plan, suscripción, precios, add-ons, suspensión/trial) desde el panel sin tocar Supabase ni MercadoPago, ve los KPIs de operación arriba de todo y recibe alertas de lo urgente.
**Verified:** 2026-06-18T14:10:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

El sustrato de datos (migración 032), la lógica pura (KPIs/alertas/trial/filtro), las 6 server actions con guard+auditoría, el corte real de 'suspended', y las 4 pantallas (dashboard, directorio, ficha, planes) están todos presentes, sustantivos y cableados. `tsc --noEmit` pasa limpio; 41 tests unitarios de Phase 2 en verde (incluido el guard WR-01 de fecha-en-pasado). El BLOCKER del code review (CR-01: set-plan sin auditoría) fue corregido. La fase queda en `human_needed` por 4 items de comportamiento de runtime (cortes server-side, trigger Postgres, migración 033 pendiente de aplicar, flujo UI→auditoría) que grep/tsc no pueden ejercitar — ninguno es un gap de implementación.

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | Existen columnas businesses.has_web_custom/has_whatsapp (bool not null default false) | ✓ VERIFIED | `032_crm_admin.sql:41-43` alter table add column if not exists, ambas boolean not null default false |
| 2   | Tabla plan_prices con 3 filas ARS (basic 15000/studio 30000/pro 50000), editables/mostradas en ARS | ✓ VERIFIED | `032_crm_admin.sql:49-62` create table + seed; `lib/plan-prices.ts` fallback a `SUBSCRIPTION_PLANS.*.price_ars`; `lib/subscription-plans.ts` price_ars literales |
| 3   | El dueño NO puede auto-asignarse add-ons (solo service-role escribe las flags) | ✓ VERIFIED (presencia) | `032_crm_admin.sql:88-112` trigger `businesses_protect_admin_columns` revierte has_web_custom/has_whatsapp/plan/plan_status si `auth.role() <> 'service_role'`. Efecto runtime → human verification #3 (requiere base) |
| 4   | computeKpis devuelve MRR/negociosActivos/trialsPorVencer(≤7d)/pagosFallidos(cancelled+expired) | ✓ VERIFIED | `lib/crm-metrics.ts:53-61`; test `computeKpis` 3 casos verdes |
| 5   | deriveAlerts emite pago_fallido + trial_por_vencer con businessId | ✓ VERIFIED | `lib/crm-metrics.ts:67-78`; test `deriveAlerts` verde |
| 6   | 'suspended' aceptado en VALID_STATUSES de set-plan | ✓ VERIFIED | `app/api/admin/set-plan/route.ts:8` array incluye 'suspended' |
| 7   | 6 server actions ('use server') c/u con requireAdmin() primera línea | ✓ VERIFIED | `_actions.ts:1` 'use server'; cada action (46/74/101/129/159/187) abre con `await requireAdmin()` |
| 8   | Cada mutación registra logAudit() con action code reconocido | ✓ VERIFIED | `_actions.ts` plan.change/business.suspend/business.reactivate/trial.extend/addon.toggle/plan.price_edit |
| 9   | Negocio suspended → 403 en POST /api/booking/create | ✓ VERIFIED (presencia) | `booking/create/route.ts:63` blocklist `['expired','cancelled','suspended']` → 403 plan_inactive. Runtime → human #1 |
| 10  | Dueño suspended redirigido a /suspendido, no entra al dashboard | ✓ VERIFIED (presencia) | `(dashboard)/layout.tsx:30` `if (planStatus==='suspended') redirect('/suspendido')` antes del JSX. Runtime → human #1 |
| 11  | updatePlanPrice escribe price_ars y NO toca MercadoPago | ✓ VERIFIED | `_actions.ts:187-216` update plan_prices, sin MP; comentario D-04 |
| 12  | Cada action valida input con zod antes de mutar | ✓ VERIFIED | `_actions.ts` `<schema>.parse(input)` 2da línea; `_actions.schemas.ts` 5 schemas; 41 tests |
| 13  | Dashboard /admin: 4 KPI cards con datos reales (computeKpis en vivo) | ✓ VERIFIED | `admin/page.tsx:43-89` createAdminClient + select + computeKpis + 4 KpiCard |
| 14  | Dashboard: lista de alertas clickeables → /admin/negocios/{id} | ✓ VERIFIED | `admin/page.tsx:61-92` deriveAlerts → AlertList; D-12 businessId |
| 15  | Directorio /admin/negocios lista TODOS; suspendidos visibles + StatusBadge rojo | ✓ VERIFIED | `negocios/page.tsx` select global; `crm-directory.ts:30-31` tab 'todos' incluye suspended; StatusBadge en negocios-client |
| 16  | Directorio filtra por tabs + busca; 'Todos' default incluye suspendidos | ✓ VERIFIED | `negocios-client.tsx:101-153` TABS + filterBusinesses, default tab 'todos' |
| 17  | Cada fila navega a ficha y es focusable (≥44px, focus ring) | ✓ VERIFIED | `negocios-client.tsx:273-279` tabIndex=0 + onClick + onKeyDown Enter/Space + focus-visible:ring |
| 18  | Sidebar 'Negocios' y 'Planes y precios' enrutan a páginas reales (sin PRONTO) | ✓ VERIFIED | `crm-sidebar.tsx:65,78` href reales, sin soon:true |
| 19  | Ficha muestra plan, plan_status, suscripción MP, contacto, 2 add-ons | ✓ VERIFIED | `ficha-client.tsx` StatusBadge + billingState + ContactBlock + 2 AddonRow |
| 20  | Operador cambia plan (ConfirmDialog simple → changePlan) + auditoría | ✓ VERIFIED (presencia) | `ficha-client.tsx:246-256` ConfirmDialog → changePlan. Flujo→auditoría → human #4 |
| 21  | Operador suspende/reactiva/extiende trial (presets+fecha exacta) | ✓ VERIFIED | `ficha-client.tsx:258-289`; extendTrial backward-guard test verde |
| 22  | Operador togglea los 2 add-ons (optimista + revert) | ✓ VERIFIED | `addon-toggle.tsx:51` toggleAddon optimista + revert en catch |
| 23  | Editor /admin/planes: 3 PlanPriceCard ARS + editar (ConfirmDialog CONFIRMAR → updatePlanPrice) | ✓ VERIFIED | `planes/page.tsx` 3 cards keys reales; `plan-price-card.tsx` CONFIRMAR → updatePlanPrice |
| 24  | Banner /admin/planes aclara que editar precio NO altera suscripciones activas (D-04) | ✓ VERIFIED | `planes-client.tsx:35-38` copy IN-01 corregida |

**Score:** 24/24 truths verified (0 present, behavior-unverified). 4 truths con asterisco de runtime (#3, #9, #10, #20) tienen su artefacto presente+cableado y además su lógica pura testeada donde aplica; sus efectos de runtime (HTTP 403, redirect, trigger Postgres, flujo UI→auditoría) se ruteán a human verification por requerir base/navegador, no por falta de implementación.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `supabase/migrations/032_crm_admin.sql` | plan_prices + add-on flags + RLS admin-read + trigger anti-escalada | ✓ VERIFIED | 113 líneas; seed 15000/30000/50000; RLS sin using(true); trigger service_role |
| `lib/plan-prices.ts` | getPlanPrices() con fallback price_ars | ✓ VERIFIED | createAdminClient + fallback SUBSCRIPTION_PLANS.price_ars |
| `lib/crm-metrics.ts` | computeKpis/deriveAlerts/resolveTrialEndsAt puras | ✓ VERIFIED | 3 funciones puras + WR-01 guard; tests verdes |
| `lib/crm-directory.ts` | filterBusinesses incluye suspendidos en 'todos' | ✓ VERIFIED | tab 'todos' return true |
| `app/(crm)/admin/_actions.schemas.ts` | 5 schemas zod importables sin 'use server' | ✓ VERIFIED | sin 'use server'; test puro verde |
| `app/(crm)/admin/_actions.ts` | 6 server actions guard+zod+audit+revalidate | ✓ VERIFIED | 6 exports, patrón uniforme |
| `app/suspendido/page.tsx` | landing del dueño suspendido | ✓ VERIFIED | h1 único, mailto+WhatsApp, fuera de (dashboard) |
| `components/crm/kpi-card.tsx` / `alert-list.tsx` / `status-badge.tsx` | presentacionales | ✓ VERIFIED | importados y usados en dashboard/directorio |
| `components/crm/addon-toggle.tsx` / `extend-trial-dialog.tsx` / `plan-price-card.tsx` | acción | ✓ VERIFIED | cablean toggleAddon/extendTrial/updatePlanPrice |
| `app/(crm)/admin/page.tsx` + `negocios/page.tsx` + `negocios/[id]/page.tsx` + `planes/page.tsx` | RSCs lectura service-role | ✓ VERIFIED | select explícito de columnas no sensibles; nada secreto al client |
| `negocios-client.tsx` / `ficha-client.tsx` / `planes-client.tsx` | client wiring | ✓ VERIFIED | filterBusinesses / actions / PlanPriceCard cableados |
| `app/api/admin/set-plan/route.ts` | 'suspended' + CR-01 audit fix | ✓ VERIFIED | VALID_STATUSES + logAudit(actorId:null) |

### Key Link Verification

| From | To | Via | Status |
| ---- | -- | --- | ------ |
| `032_crm_admin.sql` | `subscription-plans.ts` | seed 15000/30000/50000 | ✓ WIRED |
| `plan-prices.ts` | `032` plan_prices | lee tabla via createAdminClient | ✓ WIRED |
| `_actions.ts` | `admin-guard.ts` | requireAdmin() 1ra línea x6 | ✓ WIRED |
| `_actions.ts` | `audit.ts` | logAudit() x6 con action codes reconocidos | ✓ WIRED |
| `booking/create/route.ts` | businesses.plan_status | blocklist += 'suspended' → 403 | ✓ WIRED |
| `admin/page.tsx` | `crm-metrics.ts` | computeKpis + deriveAlerts | ✓ WIRED |
| `negocios-client.tsx` | `crm-directory.ts` | filterBusinesses | ✓ WIRED |
| `crm-sidebar.tsx` | `negocios/page.tsx` + `planes/page.tsx` | items enrutados | ✓ WIRED |
| `ficha-client.tsx` | `_actions.ts` | changePlan/suspend/reactivate/extendTrial/toggleAddon | ✓ WIRED |
| `plan-price-card.tsx` | `_actions.ts` | updatePlanPrice via ConfirmDialog CONFIRMAR | ✓ WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `admin/page.tsx` | kpis/alerts | `admin.from('businesses').select(...)` + getPlanPrices | DB query real (no static) | ✓ FLOWING |
| `negocios/page.tsx` | rows | `admin.from('businesses').select(...)` + getUserById email | DB query real | ✓ FLOWING |
| `negocios/[id]/page.tsx` | ficha | `select().eq('id',id).maybeSingle()` + getPlanPrices | DB query real | ✓ FLOWING |
| `planes/page.tsx` | cards | getPlanPrices + count `select('plan, plan_status')` | DB query real | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Type check | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Phase 2 unit tests | `npx vitest run lib/crm-metrics.test.ts lib/crm-directory.test.ts _actions.schemas.test.ts` | 41 passed | ✓ PASS |
| WR-01 backward-trial guard | `vitest -t "date_in_past"` (incluido en run) | passed | ✓ PASS |
| Suspended booking 403 (runtime) | requires server + suspended business | — | ? SKIP → human #1 |
| Owner trigger revert (runtime) | requires Postgres + applied migration | — | ? SKIP → human #3 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| ADM-01 | 02-03 | Directorio buscable/filtrable, suspendidos visibles/marcados | ✓ SATISFIED | negocios-client + filterBusinesses + StatusBadge |
| ADM-02 | 02-04 | Ficha: plan/plan_status/MP/contacto/add-ons | ✓ SATISFIED | ficha-client.tsx |
| ADM-03 | 02-02/04 | Cambiar plan + confirmación + auditoría | ✓ SATISFIED | changePlan + ConfirmDialog |
| ADM-04 | 02-02/04 | Suspender/extender trial + doble confirmación + auditoría | ✓ SATISFIED | suspendBusiness/extendTrial + ExtendTrialDialog |
| ADM-05 | 02-01/02/04 | Editar precios + doble confirmación + auditoría + sin alterar suscripciones | ✓ SATISFIED | updatePlanPrice + PlanPriceCard CONFIRMAR + banner D-04 |
| ADM-06 | 02-02/04 | Add-ons como flags booleanas, auditado, cobro manual | ✓ SATISFIED | toggleAddon + AddonToggle, 2 flags, sin SMS |
| ADM-07 | 02-01/03 | Dashboard KPIs arriba de todo | ✓ SATISFIED | admin/page.tsx 4 KpiCard computeKpis |
| ALERT-01 | 02-01/03 | Alertas de eventos urgentes | ✓ SATISFIED | deriveAlerts + AlertList clickeable |

Los 8 requirement IDs declarados en frontmatter (ADM-01..07, ALERT-01) coinciden 1:1 con los mapeados a Phase 2 en REQUIREMENTS.md. Cero IDs huérfanos, cero faltantes. (REQUIREMENTS.md aún marca varios como Pending/In progress — eso es estado pre-fase y lo actualiza el cierre de fase, no afecta la verificación de código.)

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (ninguno) | — | — | — | Sin TBD/FIXME/XXX sin referencia; sin stubs; "SMS" solo en comentario prohibitivo; sin placeholder de datos |

Las flags de add-on/precio iniciadas a `[]`/`{}`/default se sobreescriben con DB queries reales (no stubs). El único `console.log` en API (set-plan:79, WR-04) es una violación de convención preexistente fuera del scope nuevo de la fase, no un blocker de goal.

### Probe Execution

Step 7c: SKIPPED — la fase no declara probes (`scripts/*/tests/probe-*.sh`); la verificación se apoya en tsc + vitest + grep estructural.

### Human Verification Required

Ver bloque `human_verification` en frontmatter. Resumen de los 4 items:

1. **Corte real de suspended** — POST /api/booking/create → 403 + redirect del dueño a /suspendido (runtime, requiere base).
2. **Migración 033 (audit_log.actor_id nullable)** — PENDIENTE de aplicar a mano; sin ella el logAudit del path set-plan (CR-01) falla silenciosamente por NOT NULL. Acción de operador surfaced, no gap de fase. (Migración 032 ya aplicada por el operador.)
3. **Trigger anti-escalada del owner** — UPDATE como dueño no-admin no debe cambiar has_*/plan/plan_status (efecto Postgres, requiere base).
4. **Flujo UI → auditoría** — recorrer ficha + planes y confirmar que cada acción aparece en /admin/auditoria.

### Gaps Summary

No hay gaps de implementación. El único BLOCKER del code review (CR-01: set-plan service-role sin auditoría, bypass del trigger 032) fue corregido (commit 9414744): set-plan ahora llama logAudit con actorId NULL para plan/estado. WR-01 (extendTrial fecha en pasado) fue corregido con guard server-side + test (commit 2adff6f). IN-01 (copy del banner de planes) fue corregido (commit f0f58df).

Las findings WR-02 (definiciones de "activo" divergentes entre 3 pantallas), WR-03 (N llamadas secuenciales a getUserById en el directorio), WR-04 (console.log en set-plan), WR-05 (getUserById conflaciona not-found con error transitorio) e IN-02/03/04 permanecen abiertas pero son WARNING/INFO de robustez/consistencia, no blockers del goal de la fase, y ninguna fue clasificada como crítica por el code review. Se recomienda triagearlas como deuda técnica, pero no bloquean el avance de fase.

La fase queda en `human_needed` (no `passed`) únicamente porque la sección de human verification es no vacía: 4 comportamientos de runtime que grep/tsc no pueden ejercitar (incluido el item de la migración 033 pendiente, que es una acción de operador ya surfaced por el entorno).

---

_Verified: 2026-06-18T14:10:00Z_
_Verifier: Claude (gsd-verifier)_
