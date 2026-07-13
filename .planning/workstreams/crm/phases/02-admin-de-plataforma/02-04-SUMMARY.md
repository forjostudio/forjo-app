---
phase: 02-admin-de-plataforma
plan: 04
subsystem: crm-frontend-mutations
tags: [next16, rsc, client, server-actions, base-ui, confirm-dialog, switch, calendar, multi-tenant]

# Dependency graph
requires:
  - phase: 02-admin-de-plataforma
    plan: 02
    provides: "las 6 server actions ('use server'): changePlan/suspendBusiness/reactivateBusiness/extendTrial/toggleAddon/updatePlanPrice + resolveTrialEndsAt"
  - phase: 02-admin-de-plataforma
    plan: 03
    provides: "StatusBadge; directorio /admin/negocios cuyas filas enlazan a /admin/negocios/{id} (esta ficha es el destino); sidebar link a /admin/planes"
  - phase: 02-admin-de-plataforma
    plan: 01
    provides: "getPlanPrices() (ARS, plan_prices); columnas has_web_custom/has_whatsapp"
  - phase: 01-cimientos-auditor-a
    provides: "ConfirmDialog escalonado (+ helpers puros computeConfirmState/buildSubmitGuard/confirmButtonClass); RiskBadge; shell CRM dark"
provides:
  - "components/crm/addon-toggle.tsx (AddonToggle — switch @base-ui/react optimista + revert → toggleAddon)"
  - "components/crm/extend-trial-dialog.tsx (ExtendTrialDialog — presets 7/14/30 + calendario → extendTrial)"
  - "components/crm/plan-price-card.tsx (PlanPriceCard — editor ARS type-to-confirm CONFIRMAR → updatePlanPrice)"
  - "Ficha /admin/negocios/[id] (RSC dynamic param + client): contacto, suscripción MP, plan/estado, acciones, add-ons"
  - "Editor /admin/planes (RSC + client): 3 PlanPriceCard reales + banner truthful D-04"
affects: ["verificación/UAT de Phase 2", "gate UI-SPEC post-wave"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AddonToggle compone el primitivo @base-ui/react/switch (root + thumb) — NO existe @/components/ui/switch; cero paquetes nuevos"
    - "Optimistic UI con re-sincronización del prop DURANTE el render (prevChecked), NO useEffect (evita react-hooks/set-state-in-effect)"
    - "PlanPriceCard reusa los helpers PUROS exportados del ConfirmDialog (computeConfirmState/buildSubmitGuard/confirmButtonClass) sobre el Dialog base, porque necesita un input de monto en el cuerpo (el componente <ConfirmDialog> no expone slot de children)"
    - "RSC con param dinámico Next 16: params es Promise → await params; notFound() si no existe"
    - "Preview de fecha de trial con resolveTrialEndsAt (misma fn que la action) → la preview coincide con lo persistido"

key-files:
  created:
    - components/crm/addon-toggle.tsx
    - components/crm/extend-trial-dialog.tsx
    - components/crm/plan-price-card.tsx
    - app/(crm)/admin/negocios/[id]/page.tsx
    - app/(crm)/admin/negocios/[id]/ficha-client.tsx
    - app/(crm)/admin/planes/page.tsx
    - app/(crm)/admin/planes/planes-client.tsx
  modified: []

decisions:
  - "Cambiar plan = rotación basic→studio→pro→basic; el ConfirmDialog (simple) nombra el plan destino en la descripción antes de confirmar. changePlan recibe el plan destino explícito; no hay selector de plan en el mock ni en el UI-SPEC, así que se rota al siguiente y se confirma"
  - "AddonToggle re-sincroniza el prop durante el render (patrón 'adjusting state when a prop changes') en vez de useEffect, para no disparar el lint react-hooks/set-state-in-effect (cascading renders)"
  - "PlanPriceCard NO usa el componente <ConfirmDialog> directo (no tiene slot de children para el input de monto): reusa sus funciones puras exportadas sobre el Dialog base → el contrato de gating/loading/no-cerrar-en-fallo es idéntico"
  - "Estado de cobro de la ficha: 'Al día' (active) / 'Suspendido' (suspended) / 'Vencido' (cancelled|expired, o subscription_ends_at pasado); trial sin cobro activo → '—'"

requirements-completed: [ADM-02, ADM-03, ADM-04, ADM-05, ADM-06]

# Metrics
duration: ~6min
completed: 2026-06-18
status: complete
---

# Phase 2 Plan 04: Pantallas de mutación del CRM (Ficha de negocio + Editor de precios) Summary

**La ficha `/admin/negocios/[id]` (contacto + suscripción MP + acciones plan/suspender/reactivar/extender-trial + 2 toggles de add-ons) y el editor `/admin/planes` (3 cards de plan editables en ARS), donde cada acción peligrosa pasa por el ConfirmDialog escalonado de Phase 1 al tier locked y dispara la server action correspondiente de Plan 02 — más los 3 componentes de acción nuevos (AddonToggle sobre @base-ui/react/switch, ExtendTrialDialog con presets+calendario, PlanPriceCard con type-to-confirm CONFIRMAR).**

## Performance
- **Duration:** ~6 min
- **Started:** 2026-06-18T15:39:48Z
- **Completed:** 2026-06-18T15:45:07Z
- **Tasks:** 3 de 3 autónomas completas
- **Files created/modified:** 7 creados

## Accomplishments
- **AddonToggle** (`components/crm/addon-toggle.tsx`): switch sobre el primitivo `@base-ui/react/switch` (root track verde `--crm-success` on / `--secondary` off + thumb cream + focus ring amarillo + hit area ≥44px). UI OPTIMISTA (set local + revert si la action lanza) + `toast.success`/`toast.error`, spinner en loading. Riesgo bajo → SIN ConfirmDialog; dispara `toggleAddon` directo. `aria-label` por el nombre del add-on.
- **ExtendTrialDialog** (`components/crm/extend-trial-dialog.tsx`): sobre el Dialog base (mismo chrome que ConfirmDialog, confirmación simple). Presets `+7/+14/+30 días` (toggle-group amarillo) Y calendario `@/components/ui/calendar.tsx` mutuamente excluyentes (D-07). Preview "Nuevo fin de trial: {fecha}" con `resolveTrialEndsAt` (la misma fn que la action → coincide al persistir). Loading no cerrable (spinner + "Confirmando…") → `extendTrial`.
- **PlanPriceCard** (`components/crm/plan-price-card.tsx`): card por plan (nombre + "{N} negocios activos" + precio `text-4xl` ARS + "/mes" + features ✓ read-only de plans.ts + botón "Editar precio"). Editor con type-to-confirm "CONFIRMAR" + input de monto (mono, ARS, numérico) reusando los helpers puros del ConfirmDialog → `updatePlanPrice`. Card `pro` con pill "MÁS ELEGIDO" + borde de acento (atado a la key real, no al "Equipo" del mock).
- **Ficha `/admin/negocios/[id]`** (RSC dynamic param + client): RSC lee el negocio por id con service-role, resuelve el email del dueño acotado (`getUserById` fallback `notification_email`), `getPlanPrices()`, `notFound()` si no existe. Client: hero (back + h1 único + StatusBadge + meta mono) + tabs Resumen/Timeline(PRONTO) + dos columnas — izquierda Contacto (WhatsApp→wa.me / Email, micro-labels mono, "—"+"Sin dato" si falta) + Suscripción·MercadoPago (estado de cobro pill, plan actual con precio ARS, ID suscripción); derecha Acciones (Cambiar plan / Extender trial / ZONA SENSIBLE → Suspender|Reactivar) + Add-ons (EXACTAMENTE 2: Web a medida / Recordatorios WhatsApp).
- **Editor `/admin/planes`** (RSC + client): RSC con `getPlanPrices` + conteo de activos por plan + features de plans.ts. Client: banner truthful D-04 (editar NO altera suscripciones activas sin aviso) + grid de 3 PlanPriceCard reales (basic/studio/pro = Básico/Estudio/Pro, ARS). Sin bloque de precios de add-ons (deferido v2).

## Task Commits
1. **Task 1: AddonToggle + ExtendTrialDialog + PlanPriceCard** — `ce980f2` (feat)
2. **Task 2: ficha /admin/negocios/[id] (RSC + client)** — `a16c231` (feat)
3. **Fix lint AddonToggle (set-state-in-effect)** — `cb6f3af` (fix)
4. **Task 3: editor /admin/planes (RSC + client)** — `2befdb2` (feat)

## Files Created/Modified
- `components/crm/addon-toggle.tsx` — switch de add-on optimista (@base-ui/react/switch) → toggleAddon
- `components/crm/extend-trial-dialog.tsx` — dialog de extender trial (presets + calendario) → extendTrial
- `components/crm/plan-price-card.tsx` — card de plan + editor de precio (type-to-confirm CONFIRMAR) → updatePlanPrice
- `app/(crm)/admin/negocios/[id]/page.tsx` — ficha RSC (dynamic param, email acotado, precio del plan)
- `app/(crm)/admin/negocios/[id]/ficha-client.tsx` — ficha client (contacto/suscripción/acciones/add-ons)
- `app/(crm)/admin/planes/page.tsx` — editor de precios RSC
- `app/(crm)/admin/planes/planes-client.tsx` — banner D-04 + grid de 3 cards

## Decisions Made
- **Cambiar plan = rotación basic→studio→pro→basic:** ni el mock ni el UI-SPEC definen un selector de plan en la ficha; el botón "Cambiar plan" abre el ConfirmDialog simple que NOMBRA el plan destino (el siguiente del ciclo) en su descripción antes de confirmar, y `changePlan` recibe ese destino explícito. Si más adelante se quiere un selector, el wiring de la action ya lo soporta (recibe `plan`).
- **AddonToggle re-sincroniza el prop durante el render** (`prevChecked` + comparación en render) en vez de `useEffect`, porque eslint (`react-hooks/set-state-in-effect`) marca como error el `setState` síncrono dentro de un effect (cascading renders). Es el patrón "adjusting state when a prop changes" de la doc de React.
- **PlanPriceCard no usa `<ConfirmDialog>` directo:** el componente no expone un slot de children y necesitábamos un input de monto en el cuerpo del dialog. Se reusan sus funciones PURAS exportadas (`computeConfirmState`/`buildSubmitGuard`/`confirmButtonClass`) sobre el Dialog base → el contrato de confirmación (palabra exacta case-sensitive, anti doble-submit, loading no cerrable, toast de error, no-cerrar-en-fallo) es idéntico.
- **Estado de cobro de la ficha** derivado de `plan_status` (+ `subscription_ends_at` para detectar vencido en estados no terminales): active→"Al día" (verde), suspended→"Suspendido" (rojo), cancelled/expired o sub vencida→"Vencido" (rojo), resto→"—".

## Deviations from Plan

### Auto-fixed (Rule 1)

**1. [Rule 1 - Bug] AddonToggle: setState síncrono en useEffect → cascading renders**
- **Found during:** Task 3 (lint de los 7 archivos antes de cerrar)
- **Issue:** El `useEffect(() => setOn(checked), [checked])` que re-sincroniza el estado optimista con el prop tras un revalidate disparaba el error de eslint `react-hooks/set-state-in-effect` (cascading renders).
- **Fix:** Re-sincronización DURANTE el render con `prevChecked` (patrón "adjusting state when a prop changes" de React), sin useEffect.
- **Files modified:** `components/crm/addon-toggle.tsx`
- **Commit:** `cb6f3af`

Resto: plan ejecutado tal cual fue escrito.

## Threat Mitigations Aplicadas (del threat_model del plan)
- **T-02-12 (EoP / IDOR en [id]):** la autorización es `requireAdmin` (layout guard + cada action), NO el id de la URL. El operador es super-admin y puede ver cualquier negocio; el RSC lee con service-role tras el guard, las mutaciones re-validan admin en la action. ✔
- **T-02-13 (toggle/cambio de plan sin guard):** AddonToggle/ConfirmDialog SOLO invocan las actions; cada action corre `requireAdmin()` server-side (Plan 02). La UI es refuerzo. ✔
- **T-02-14 (email del dueño vía getUserById):** el RSC extrae SOLO el string email (fallback notification_email); el objeto user de auth completo no se propaga al client. ✔
- **T-02-15 (moneda equivocada):** precios desde `getPlanPrices` (ARS, plan_prices); features read-only de plans.ts; verify negativo de "Equipo" y del mock pasa. ✔
- **T-02-SC (npm installs):** cero paquetes nuevos; AddonToggle usa el primitivo `@base-ui/react/switch` ya instalado. ✔

## Issues Encountered
None bloqueante. Advertencias `LF will be replaced by CRLF` de git son cosméticas (Windows). El artefacto de line-endings de `app/[slug]/booking-client.tsx` mencionado en el prompt nunca apareció en `git status`; se commiteó solo con adds explícitos de los archivos de cada task. El init del SDK resolvió por defecto al workstream `web-builder`; se trabajó con los paths explícitos del workstream `crm` del prompt.

## Self-Check: PASSED
- 7 archivos creados verificados en disco (FOUND).
- 4 commits verificados en git (ce980f2, a16c231, cb6f3af, 2befdb2).
- `tsc --noEmit` exit 0 (sin errores); `eslint` de los 7 archivos exit 0 (sin warnings tras el fix).
- Verifies de los 3 tasks OK: 3 componentes de acción; ficha con 2 add-ons sin SMS; planes con 3 keys reales + copy D-04 sin "Equipo".

---
*Phase: 02-admin-de-plataforma · Plan 04*
*Completed: 2026-06-18*
