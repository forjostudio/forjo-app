# Phase 2: Admin de Plataforma - Research

**Researched:** 2026-06-18
**Domain:** Super-admin lifecycle management sobre app multi-tenant Next.js 16 + Supabase RLS — directorio/ficha de negocios, server actions de plan/suspensión/trial/add-ons, editor de precios en DB, KPIs/alertas derivados en vivo. Se monta sobre los cimientos de Phase 1.
**Confidence:** HIGH (todo verificado contra el codebase real; cero dependencias nuevas; un hallazgo crítico de fuente-de-precios documentado abajo)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Precios, moneda y MRR (ADM-05, ADM-07)**
- **D-01:** Los precios editables se mueven de `lib/plans.ts` a DB/config, editables desde `/admin` (pantalla "Planes y precios", mockup `08-planes.png`). `lib/plans.ts` queda como **seed/fallback** (los topes `max_professionals`/`max_locations` + `features` siguen viviendo ahí; lo que pasa a DB es el **precio** editable). Requiere migración nueva (próxima = **032**).
- **D-02:** Moneda del panel = **ARS** (como el mock, no USD). Precios se editan y muestran en ARS. El `price_usd` actual de `lib/plans.ts` NO es la fuente del panel.
- **D-03:** **MRR = Σ(precio del plan × negocios activos por plan)** — MRR **actual** (snapshot calculado), NO histórico. No se persiste el monto cobrado por suscripción en v1 (ver Deferred).
- **D-04:** Editar un precio NO altera suscripciones ya activas sin aviso explícito (ADM-05): el `ConfirmDialog` "Editar precio" (type-to-confirm "CONFIRMAR", contrato locked en `01-UI-SPEC.md`) lo deja claro en su copy; en v1 el precio nuevo aplica a cobros futuros, no muta las suscripciones MP vigentes.

**Suspensión y extensión de trial (ADM-04)**
- **D-05:** `suspended` se agrega como **nuevo valor de `plan_status`** (NO columna aparte). Universo de estados: `trial` / `active` / `expired` / `cancelled` / **`suspended`**. Sumar `'suspended'` a `VALID_STATUSES` en `app/api/admin/set-plan/route.ts`.
- **D-06:** Suspender **corta de verdad** (efecto real, no solo marca en el CRM), reusando el gate de plan de v0.9 (SEC-04):
  - **Booking público:** sumar `'suspended'` a la blocklist de `app/api/booking/create/route.ts:63` (hoy `['expired','cancelled']` → 403 `plan_inactive`).
  - **Dashboard del dueño:** nuevo check `plan_status === 'suspended'` en `app/(dashboard)/layout.tsx` que bloquea el acceso (hoy ese layout solo renderiza `<PlanBanner>` para trial/expired — NO bloquea; el bloqueo en `suspended` es comportamiento NUEVO).
- **D-07:** Extender trial: **presets 7/14/30 días + opción de fecha exacta**. Opera sobre `businesses.trial_ends_at`.

**Add-ons (ADM-06)**
- **D-08:** Add-ons = **flags booleanas por negocio**, columnas nuevas en `businesses`: `has_web_custom`, `has_whatsapp`. NO jsonb / NO tabla aparte — set chico y fijo. No existen hoy → migración nueva (032). Activación auditada (`logAudit`), cobro manual fuera de la app.
- **D-09:** `has_whatsapp` es la **MISMA flag** que gatea la Bandeja de Mensajes del milestone *Gestión rebrand* → naming consistente entre milestones, NO crear una flag distinta. El add-on se muestra como **"Recordatorios WhatsApp"**, NUNCA "SMS" (fix brief §11).

**Alertas y KPIs (ADM-07, ALERT-01)**
- **D-10:** Alertas **derivadas en vivo** al cargar `/admin` (de `plan_status` + `trial_ends_at`), SIN tabla de eventos y **SIN tocar el webhook de suscripción** (lo que v0.9 endureció no se toca). "Pagos fallidos" se deriva de `plan_status` (`cancelled`/`expired`), no de un evento discreto.
- **D-11:** KPIs (MRR, negocios activos, trials por vencer, pagos fallidos) = **cálculo en vivo** al abrir `/admin` (un solo operador, bajo tráfico → no necesita cron; respeta el límite de Vercel Hobby de cron diario — no se agrega cron).
- **D-12:** Alertas **clickeables → navegan a la ficha** del negocio afectado.

### Claude's Discretion
- **Acción de cambiar plan desde el CRM (ADM-03):** nueva server action con `requireAdmin()` + `logAudit()` (patrón D4 de Phase 1), NO el route `set-plan` con `ADMIN_SECRET` (ese queda para el actor externo). Reusar la lógica de update (`plan` / `plan_status` / `trial_ends_at = null` al activar) de `app/api/admin/set-plan/route.ts`.
- **Fuente del "contacto email" en la ficha (ADM-02):** email del dueño en `auth.users` (cuenta real) vs `businesses.notification_email`. WhatsApp = `businesses.whatsapp`. Resolver en research/plan.
- **Filtros/búsqueda del directorio (ADM-01):** seguir el mockup `03-negocios.png`; dimensiones sugeridas — filtro por plan, por estado (incluido `suspended`, que sigue visible y marcado), trials por vencer, pagos fallidos; búsqueda por nombre/email/slug. Los suspendidos NUNCA se ocultan.
- Nombre exacto de la tabla/config de precios y de las columnas/índices dentro del schema de la migración 032.
- Estructura de archivos dentro de `app/(crm)/admin/`, `components/crm/`, `lib/`.
- Cero paquetes npm nuevos (confirmado en Phase 1 / research).

### Deferred Ideas (OUT OF SCOPE)
- **Persistir monto cobrado por suscripción + MRR histórico** → v2 (habilitaría MRR histórico real en vez del snapshot de D-03).
- **Evento discreto "pago falló" persistido** (tabla notifications/events) → v2; relacionado con NOTIF-EXT-01 (canal externo de alertas).
- **Cobro automático de add-ons** → v2 (ADDON-PAY-01). En v1 add-ons son flags on/off, cobro manual.
- Impersonación read-only (IMP-01..03) = Phase 3; Pipeline/tags/timeline = Phase 4; Reportes = Phase 5; Bandeja = Phase 6.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADM-01 | Directorio de negocios buscable/filtrable; suspendidos visibles + marcados | RSC `page.tsx` con `createAdminClient()` (sin sesión-de-tenant) → `select` global de `businesses`; búsqueda/filtros client-side sobre las filas (bajo volumen, un operador). Patrón `page.tsx` async + `*-client.tsx`. Ver §Architecture Patterns / Pattern 1. |
| ADM-02 | Ficha de negocio: plan, `plan_status`, estado MP, contacto (email+whatsapp), add-ons | Contacto: WhatsApp = `businesses.whatsapp`; email = resolver (ver §Open Question 1 + §Architecture). Estado MP derivado de `plan_status`+`subscription_ends_at`+`mp_subscription_id`. Add-ons = nuevas columnas `has_web_custom`/`has_whatsapp`. |
| ADM-03 | Cambiar plan desde la ficha (confirmación + auditoría) | Server action nueva `requireAdmin()` + update `businesses.plan/plan_status` + `logAudit()`. Reusa la lógica de `set-plan/route.ts:50-57`. §Pattern 2. |
| ADM-04 | Suspender / extender trial desde la ficha (doble confirmación + auditoría) | Suspender = set `plan_status='suspended'` + efecto real en booking/dashboard (D-06). Extender trial = update `trial_ends_at` (presets/fecha). Ambas server actions con `requireAdmin()`+`logAudit()`. §Pattern 2, §Pattern 4. |
| ADM-05 | Editar precios de planes (doble confirmación + auditoría); no altera suscripciones activas sin aviso | Tabla `plan_prices` nueva (migración 032); editor lee/escribe esa tabla; copy del ConfirmDialog avisa. §Decisión crítica precios + §Schema 032. |
| ADM-06 | Activar/desactivar add-ons por negocio (flags booleanas, auditado, cobro manual) | Toggle → server action que setea `has_web_custom`/`has_whatsapp` + `logAudit()`. §Pattern 3. |
| ADM-07 | Dashboard con KPIs (negocios activos, trials por vencer, pagos fallidos, MRR) arriba | Cálculo en vivo en el RSC del dashboard a partir de un solo `select` de `businesses` + tabla `plan_prices`. §Pattern 5 (KPIs in-memory). |
| ALERT-01 | Alertas de eventos urgentes (pago falló, trial por vencer), reusando lógica de webhooks | Derivadas en vivo de `plan_status` (cancelled/expired/suspended) + `trial_ends_at` (≤7d). SIN tabla de eventos, SIN tocar webhook. Clickeables → ficha. §Pattern 5. |
</phase_requirements>

## Summary

Phase 2 es la primera fase del CRM que **escribe** sobre datos de negocios y agrega superficie de datos real. Phase 1 dejó listos todos los cimientos verificados: `requireAdmin()` (`lib/admin-guard.ts`, lee `app_metadata.is_admin`), `logAudit()` (`lib/audit.ts`, service-role, best-effort), `ConfirmDialog` escalonado con niveles ya lockeados (simple / "SUSPENDER" / "CONFIRMAR"), `RiskBadge`, el shell `app/(crm)/layout.tsx` (guard + dark + accent amarillo), el `CrmSidebar` agrupado (con slots **Negocios** y **Planes y precios** hoy en `soon: true` que esta fase debe cablear), y la tabla `audit_log` (migración 031, RLS admin-only). **No hay ninguna server action `'use server'` en el repo todavía** — Phase 2 introduce el primer patrón de server actions del proyecto.

El **hallazgo más importante** es que existen DOS módulos de planes con distinta moneda: `lib/plans.ts` (`price_usd`: 12/25/40 + topes + features, consumido por `getPlanLimits`) y `lib/subscription-plans.ts` (`price_ars`: 15000/30000/50000, consumido por el **checkout de MercadoPago** y `setup:mp-plans`). El CONTEXT habla de mover "el precio de `lib/plans.ts`", pero el precio en ARS que el panel debe editar/mostrar y que MRR debe sumar es el de **`subscription-plans.ts`** (ese es el que cobra MP), no el `price_usd` de `plans.ts`. La migración 032 + el editor de precios deben usar ARS y la nueva tabla `plan_prices` se convierte en la fuente para mostrar/calcular; `subscription-plans.ts` queda como seed/fallback de ARS y los `price_ars` literales que hoy alimentan el alta de preapproval **siguen** gobernando el cobro MP en v1 (D-04: editar precio no muta suscripciones activas). El planner debe cerrar esto explícitamente (ver §Decisión crítica + Open Question 2).

**Primary recommendation:** Migración `032_crm_admin.sql` con (1) tabla `plan_prices(plan_key pk, price_ars int, updated_at, updated_by)` seedeada desde los `price_ars` de `subscription-plans.ts`, RLS admin-read; (2) `has_web_custom`/`has_whatsapp boolean not null default false` en `businesses`. Cinco server actions en `app/(crm)/admin/_actions.ts` (`'use server'`), todas `requireAdmin()` primero + `logAudit()` después: changePlan, suspendBusiness, extendTrial, toggleAddon, updatePlanPrice. Directorio + ficha como RSC con `createAdminClient()` (lectura global cross-tenant intencional, igual que el visor de auditoría usa la sesión pero acá hace falta ver TODOS los negocios). KPIs/alertas derivados en memoria de un solo `select` de `businesses` join lógico con `plan_prices`. Extender la blocklist SEC-04 y el guard del dashboard para que `suspended` corte de verdad. Cero paquetes nuevos.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Directorio + ficha (lectura de TODOS los negocios) (ADM-01/02) | Frontend Server (RSC `page.tsx`) | Database (`businesses`, `plan_prices`) | La lectura global cross-tenant es legítima del super-admin; va server-side con service-role acotado (no hay `business_id` de sesión). El filtrado/búsqueda fino es client-side sobre las filas (bajo volumen). |
| Cambiar plan / suspender / extender trial / toggle add-on (ADM-03/04/06) | API/Backend (server action `'use server'`) | Database (`businesses` update) + `audit_log` | Mutaciones sensibles: `requireAdmin()` server-side es la garantía (Pitfall 2 de Phase 1), `logAudit()` el registro. El ConfirmDialog es solo UX. |
| Editar precio de plan (ADM-05) | API/Backend (server action) | Database (`plan_prices`) | El precio editable vive en DB (D-01); la action lo escribe con service-role + audita. No toca MP (D-04). |
| KPIs + alertas en vivo (ADM-07/ALERT-01) | Frontend Server (RSC dashboard) | Database (un `select` de `businesses` + `plan_prices`) | Derivación pura en memoria al cargar; sin cron, sin tabla de eventos (D-10/D-11). |
| Efecto real de `suspended` (D-06) | API/Backend (booking route) + Frontend Server (dashboard layout) | Database (`plan_status`) | El corte de booking vive en el route handler público (blocklist SEC-04); el bloqueo del dashboard en su layout RSC. |

## Standard Stack

Phase 2 **no instala nada nuevo**. Todo verificado en `package.json` y en uso productivo.

### Core (ya instalado — reuso)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 16.2.7 | RSC pages, **server actions** (`'use server'`), `redirect()`, `revalidatePath` | Framework del proyecto; middleware = `proxy.ts` (Next 16) `[VERIFIED: package.json, proxy.ts]` |
| `@supabase/supabase-js` | ^2.106.2 | `createAdminClient()` service-role para lectura global + escritura de mutaciones del CRM | Factory existente `lib/supabase/admin.ts` `[VERIFIED: lib/supabase/admin.ts]` |
| `@supabase/ssr` | ^0.10.3 | `createClient()` para leer sesión/actor en server actions vía `requireAdmin()` | `lib/admin-guard.ts` ya lo usa `[VERIFIED: lib/admin-guard.ts]` |
| `@base-ui/react` | ^1.5.0 | Dialog (ConfirmDialog ya construido), Tabs (filtros del directorio) | `components/ui/dialog.tsx`, `tabs.tsx` `[VERIFIED]` |
| `sonner` | ^2.0.7 | Toasts de éxito/error de cada acción (`CrmToaster` dark ya montado) | `components/crm/crm-toaster.tsx` `[VERIFIED: existe en (crm)/layout.tsx]` |
| `lucide-react` | ^1.17.0 | Iconos del directorio/ficha/KPIs | `iconLibrary` del proyecto `[VERIFIED]` |
| `recharts` | ^3.8.1 | Sparklines de las KPI cards (UI-SPEC menciona sparkline por métrica) | Ya usado en finanzas `[VERIFIED: package.json]` |
| `react-day-picker` | ^10.0.1 | Selector de **fecha exacta** para extender trial (D-07) | Ya usado en booking; `components/ui/calendar.tsx` existe `[VERIFIED]` |
| `date-fns` | ^4.4.0 | Cálculo de días hasta `trial_ends_at`, presets 7/14/30, formato es-AR | Patrón del proyecto (zona AR fija) `[VERIFIED: package.json]` |
| `zod` | ^4.4.3 | Validar input de cada server action (plan, status, monto, addon key) | Patrón de validación del proyecto `[CITED: .claude/CLAUDE.md]` |

### Supporting (ya instalado)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-hook-form` + `@hookform/resolvers` | ^7.77 / ^5.4 | Form del editor de precio / extender trial si se quiere validación rica | Opcional; `useState` simple alcanza para un input de monto |
| `tailwind-merge` / `clsx` / `cva` | varios | `cn()` + variantes de badges de estado (Activo/Trial/Suspendido/Churn) | Componer estilos del directorio (reusar patrón de `RiskBadge`) |
| `vitest` | (devDep) | Tests de helpers puros (cálculo de KPIs, derivación de alertas, gating de validación) | Environment `node`; testear la lógica de MRR/alertas como funciones puras (ver §Validation Architecture) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Tabla `plan_prices` (fila por plan) | Columna `price_ars` por plan en una tabla `plans` nueva | `plan_prices` (3 filas, pk = plan_key) es lo más chico y mapea 1:1 a las 3 keys reales; una tabla `plans` completa duplicaría lo que ya vive en `lib/plans.ts` (topes/features). Recomendado: `plan_prices`. |
| Server actions (`'use server'`) | Route handlers `app/api/admin/crm/*` con sesión | Las server actions son el patrón idiomático de Next 16 para mutaciones desde RSC/forms y evitan boilerplate de fetch+JSON. Pero el repo NO tiene ninguna `'use server'` aún (todo es route handlers). Ambas válidas; las server actions encajan mejor con el flujo ficha→ConfirmDialog→mutación. Decisión del planner (Open Question 3). |
| Filtros/búsqueda client-side | Query server-side con `ilike`/filtros SQL | Con un operador y pocos negocios, traer todo y filtrar en cliente es más simple y reactivo (como el mock). Server-side filter solo se justifica con miles de negocios (no es el caso en v1). Recomendado: client-side. |
| `createAdminClient()` para el directorio | `createClient()` (sesión) + RLS que permita a is_admin leer todo | El visor de auditoría (Phase 1) lee con sesión + RLS admin. Para `businesses` NO existe una policy "is_admin lee todo" hoy (las policies son tenant-scoped por `owner_id`). Crear esa policy sería trabajo extra y otra superficie; `createAdminClient()` server-side acotado al RSC del CRM (ya tras el guard) es el patrón del proyecto para lectura global server-only. Recomendado: service-role en el RSC del CRM, NUNCA en cliente. |

**Installation:** Ninguna. `npm install` no se ejecuta en esta fase.

## Package Legitimacy Audit

> **No aplica.** Phase 2 no instala ningún paquete externo nuevo. Todas las librerías usadas (`next`, `@supabase/supabase-js`, `@supabase/ssr`, `@base-ui/react`, `sonner`, `lucide-react`, `recharts`, `react-day-picker`, `date-fns`, `zod`, `react-hook-form`, `vitest`) ya están en `package.json` y en uso productivo en el repo.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Decisión crítica: dónde viven los precios editables (D-01/D-02/D-03)

**Estado verificado del codebase:**
- `lib/plans.ts` → `PLANS = { basic, studio, pro }` con `price_usd` (12/25/40) + `max_professionals`/`max_locations` + `features`. Consumido por `getPlanLimits()` en: `lib/plan-limits.ts`, `components/dashboard/sidebar.tsx`, `components/dashboard/plan-modal.tsx`, `app/api/admin/set-plan/route.ts`, `app/(dashboard)/settings/settings-client.tsx`. **Ningún consumidor usa `price_usd`** — solo usan `name`, `max_*`, `features`. `[VERIFIED: grep price_usd|PLANS|getPlanLimits]`
- `lib/subscription-plans.ts` → `SUBSCRIPTION_PLANS = { basic, studio, pro }` con **`price_ars`** (15000/30000/50000) + `mp_plan_id` getter. Consumido por `components/dashboard/plan-modal.tsx` (precio mostrado al dueño) y `scripts/setup-mp-plans.ts` (crea los planes en MP con ese monto). **Este es el monto que MercadoPago cobra.** `[VERIFIED: lib/subscription-plans.ts, plan-modal.tsx:134, setup-mp-plans.ts:32]`

**Implicación para el planner (debe quedar explícito):**
1. El "precio editable" del panel (ADM-05) y el factor de MRR (D-03) deben ser el **`price_ars`** (lo que se cobra), NO el `price_usd` de `plans.ts`. El CONTEXT dice "se mueven de `lib/plans.ts`" pero la fuente real de ARS es `subscription-plans.ts`. **Recomendación:** la tabla `plan_prices` se seedea con los `price_ars` de `subscription-plans.ts` (15000/30000/50000) y se vuelve la **fuente de lectura** para: el editor de precios (ADM-05), el precio mostrado en la ficha (ADM-02 "Plan actual"), el `plan-modal` del dueño (si se quiere unificar) y el cálculo de MRR (ADM-07). `[ASSUMED — confirmar con el operador / planner, ver Open Question 2]`
2. `lib/plans.ts` y `lib/subscription-plans.ts` quedan como **seed/fallback**: los topes/features (`plans.ts`) NO se tocan; el `price_ars` literal de `subscription-plans.ts` queda como fallback si `plan_prices` no tiene fila, y como seed inicial de la migración.
3. **D-04 (no mutar suscripciones activas):** editar `plan_prices` NO re-crea preapprovals en MP. El cobro de una suscripción ya `authorized` lo administra MP con el monto con que se creó. El precio nuevo solo afecta: (a) lo que se muestra/cobra en **altas futuras** (cuando `setup:mp-plans` re-cree planes o se cree una preapproval nueva — fuera de runtime web) y (b) el cálculo de MRR. La pantalla "Planes y precios" debe avisar esto en su copy (ya lockeado en el ConfirmDialog "Editar precio" y en el warning del mock `08-planes.png`).
4. **Las 3 keys reales son `basic`/`studio`/`pro`** (display: Básico/Estudio/Pro). El mock `08-planes.png` muestra "Básico/Pro/**Equipo**" con $12.000/$24.000/$48.000 — esos labels y montos del mock NO son la verdad de datos (el mock es un MOCK). Usar las 3 keys reales y los `price_ars` reales (15000/30000/50000) como seed. `[VERIFIED: lib/subscription-plans.ts vs 08-planes.png]`

## System Architecture Diagram

```text
  ┌──────────────────────── /admin (RSC, tras guard de Phase 1) ───────────────────────┐
  │                                                                                     │
  │  app/(crm)/admin/page.tsx (Dashboard, RSC)                                          │
  │    createAdminClient().from('businesses').select(...todos)                          │
  │    + plan_prices (precios ARS)                                                      │
  │         │                                                                           │
  │         ▼  derivación PURA en memoria (lib/crm-metrics.ts)                          │
  │    ┌───────────────────────────────────────────────┐                               │
  │    │ computeKpis(businesses, prices)  → MRR, activos,│  (ADM-07)                     │
  │    │   trials≤7d, pagos fallidos                     │                               │
  │    │ deriveAlerts(businesses)         → [{biz, tipo}]│  (ALERT-01, clickeable→ficha) │
  │    └───────────────────────────────────────────────┘                               │
  │                                                                                     │
  │  app/(crm)/admin/negocios/page.tsx (Directorio, RSC)  ──────────────► negocios-client│
  │    select global de businesses ───────────────────────► filtros/búsqueda client-side│
  │                                                          (ADM-01; suspendidos visibles)│
  │                                                                                     │
  │  app/(crm)/admin/negocios/[id]/page.tsx (Ficha, RSC)  ─────────────►  ficha-client   │
  │    business + auth.users email (admin API) + plan_prices              (ADM-02)       │
  │         │  acciones (ConfirmDialog → server action):                                 │
  │         ▼                                                                            │
  │  app/(crm)/admin/_actions.ts ('use server')                                          │
  │    changePlan / suspendBusiness / extendTrial / toggleAddon / updatePlanPrice        │
  │      1) requireAdmin()        ← garantía real (Pitfall 2)                             │
  │      2) zod validate input                                                           │
  │      3) createAdminClient().update(businesses | plan_prices)                         │
  │      4) logAudit({actor, action, target, risk, ...})  (FND-02)                       │
  │      5) revalidatePath('/admin/...') para refrescar el RSC                           │
  └─────────────────────────────────────────────────────────────────────────────────────┘
            │ plan_status='suspended' produce EFECTO REAL fuera del CRM (D-06):
            ├──► app/api/booking/create/route.ts:63   blocklist += 'suspended'  → 403
            └──► app/(dashboard)/layout.tsx           if plan_status==='suspended' → bloqueo

  NO se toca:  app/api/subscription/webhook/route.ts  (solo escribe plan_status; D-10 lectura)
```

## Architecture Patterns

### Recommended Project Structure
```text
app/(crm)/admin/
├── page.tsx                      # Dashboard: KPIs + alertas (ADM-07, ALERT-01) — RSC
├── _actions.ts                   # 'use server' — las 5 server actions del CRM (D4)
├── negocios/
│   ├── page.tsx                  # Directorio (ADM-01) — RSC, select global
│   ├── negocios-client.tsx       # filtros/búsqueda/tabla (client)
│   └── [id]/
│       ├── page.tsx              # Ficha (ADM-02) — RSC
│       └── ficha-client.tsx      # acciones + add-ons + ConfirmDialogs (client)
└── planes/
    ├── page.tsx                  # Editor de precios (ADM-05) — RSC
    └── planes-client.tsx         # cards + Editar precio (client)
components/crm/
├── kpi-card.tsx                  # KPI card (mono label + display + sparkline) — UI-SPEC
├── status-badge.tsx             # Activo/Trial/Suspendido/Churn (reusa patrón RiskBadge)
└── (reusa) confirm-dialog.tsx, risk-badge.tsx, crm-sidebar.tsx, crm-topbar.tsx
lib/
├── crm-metrics.ts                # computeKpis() + deriveAlerts() — funciones PURAS (testeables)
└── plan-prices.ts                # getPlanPrices() (lee plan_prices con fallback a subscription-plans)
supabase/migrations/
└── 032_crm_admin.sql             # plan_prices + has_web_custom/has_whatsapp + RLS
```

### Pattern 1: RSC de lectura global con service-role (ADM-01/02)
**What:** El directorio y la ficha leen TODOS los negocios (cross-tenant a propósito — el operador no es tenant). Como no hay `business_id` de sesión ni una policy "is_admin lee todo" en `businesses`, se usa `createAdminClient()` server-side DENTRO del RSC del CRM (ya protegido por el guard del layout).
**When to use:** Toda página RSC del CRM que necesite leer datos de negocios.
**Example:**
```typescript
// app/(crm)/admin/negocios/page.tsx — RSC
import { createAdminClient } from '@/lib/supabase/admin'
import { NegociosClient } from './negocios-client'

export default async function NegociosPage() {
  const admin = createAdminClient()  // service-role, server-only (nunca al cliente)
  // SELECT explícito de columnas no secretas. NO traer business_secrets ni tokens.
  const { data: businesses } = await admin
    .from('businesses')
    .select('id, name, slug, owner_id, plan, plan_status, trial_ends_at, subscription_ends_at, mp_subscription_id, whatsapp, notification_email, has_web_custom, has_whatsapp, created_at')
    .order('created_at', { ascending: false })
  return <NegociosClient businesses={businesses ?? []} />
}
```
Nota: el RSC del CRM ya corre tras el guard de `app/(crm)/layout.tsx` (redirige a no-admins antes de render). Aun así, el service-role NUNCA cruza al componente client — solo se pasan las filas ya leídas. (Mismo principio que `T-01-09` de Phase 1: el cliente no importa ningún cliente supabase.)

### Pattern 2: Server action del CRM — `requireAdmin()` + mutación + `logAudit()` (ADM-03/04/06)
**What:** El patrón canónico de toda mutación del CRM. **Es el primer `'use server'` del repo** — establece el patrón para Phases 3+.
**When to use:** changePlan, suspendBusiness, extendTrial, toggleAddon, updatePlanPrice.
**Example:**
```typescript
// app/(crm)/admin/_actions.ts
'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/audit'

const VALID_PLANS = ['basic', 'studio', 'pro'] as const
// 'suspended' SUMADO al universo de Phase 1 (D-05):
const VALID_STATUSES = ['trial', 'active', 'expired', 'cancelled', 'suspended'] as const

const changePlanSchema = z.object({
  businessId: z.string().uuid(),
  plan: z.enum(VALID_PLANS),
})

export async function changePlan(input: unknown) {
  const actor = await requireAdmin()           // 1) GARANTÍA real (lanza forbidden si no admin)
  const { businessId, plan } = changePlanSchema.parse(input)  // 2) validar
  const admin = createAdminClient()

  // leer estado previo para el audit (transición plan viejo → nuevo)
  const { data: prev } = await admin.from('businesses').select('plan').eq('id', businessId).single()
  const { error } = await admin.from('businesses').update({ plan }).eq('id', businessId)  // 3) mutar
  if (error) throw new Error('update_failed')

  await logAudit({                              // 4) auditar (best-effort, no rollback)
    actorId: actor.id, action: 'plan.change', targetType: 'business', targetId: businessId,
    businessId, risk: 'medio',
    metadata: { from: prev?.plan ?? null, to: plan },
  })
  revalidatePath(`/admin/negocios/${businessId}`)  // 5) refrescar el RSC de la ficha
}
```
La lógica reusable de `set-plan/route.ts:50-55` (al pasar a `active` → `trial_ends_at = null`) se replica en la action de cambio de estado. `set-plan/route.ts` NO se borra (lo usa el actor externo con `ADMIN_SECRET`); se replica/extrae su lógica, no se mueve.

### Pattern 3: Toggle de add-on (ADM-06)
**What:** Switch on/off de una flag booleana por negocio. Cada toggle es una acción auditada.
**Example:**
```typescript
// _actions.ts
const ADDONS = { has_web_custom: 'Web a medida', has_whatsapp: 'Recordatorios WhatsApp' } as const
const toggleAddonSchema = z.object({
  businessId: z.string().uuid(),
  addon: z.enum(['has_web_custom', 'has_whatsapp']),  // set chico y fijo (D-08)
  value: z.boolean(),
})
export async function toggleAddon(input: unknown) {
  const actor = await requireAdmin()
  const { businessId, addon, value } = toggleAddonSchema.parse(input)
  const admin = createAdminClient()
  const { error } = await admin.from('businesses').update({ [addon]: value }).eq('id', businessId)
  if (error) throw new Error('update_failed')
  await logAudit({
    actorId: actor.id, action: value ? 'addon.enable' : 'addon.disable',
    targetType: 'business', targetId: businessId, businessId, risk: 'bajo',
    metadata: { addon, label: ADDONS[addon], value },
  })
  revalidatePath(`/admin/negocios/${businessId}`)
}
```
**D-09:** `has_whatsapp` es la MISMA flag que gatea la Bandeja del milestone Gestión rebrand — usar exactamente ese nombre de columna, no inventar otra. Display SIEMPRE "Recordatorios WhatsApp", nunca "SMS".

### Pattern 4: Extender trial — presets + fecha exacta (D-07)
**What:** Set `trial_ends_at` a `now + {7|14|30} días` (preset) o a una fecha exacta del calendario. Si el negocio no estaba en trial, esto también puede implicar `plan_status='trial'` (decidir en plan: el mock solo extiende la fecha).
**Example:**
```typescript
const extendTrialSchema = z.object({
  businessId: z.string().uuid(),
  // o un preset de días, o una fecha ISO exacta (uno de los dos)
  preset: z.enum(['7', '14', '30']).optional(),
  exactDate: z.string().datetime().optional(),
}).refine(d => d.preset || d.exactDate, { message: 'preset_or_date_required' })
// resolver newEndsAt con date-fns: addDays(new Date(), Number(preset)) | new Date(exactDate)
// update { trial_ends_at: newEndsAt.toISOString() } + logAudit risk 'bajo'
```
Cuidado con la zona horaria: la app es AR fija (UTC-3 sin DST). Para "fecha exacta" usar el fin del día AR para no recortar un día por el offset. `[CITED: .claude/CLAUDE.md — date-fns + zona AR]`

### Pattern 5: KPIs y alertas derivados en memoria — funciones puras (ADM-07/ALERT-01)
**What:** Toda la métrica se calcula al cargar el RSC del dashboard a partir de un solo `select` de `businesses` + las filas de `plan_prices`. Sin cron, sin tabla de eventos (D-10/D-11). Las funciones son PURAS → testeables sin DB.
**Example:**
```typescript
// lib/crm-metrics.ts (funciones puras, testeables en vitest node)
type BizRow = { plan: string; plan_status: string; trial_ends_at: string | null }
type Prices = Record<string, number>  // { basic: 15000, studio: 30000, pro: 50000 }

export function computeKpis(rows: BizRow[], prices: Prices, now = new Date()) {
  const activos = rows.filter(r => r.plan_status === 'active')
  // MRR = Σ(precio del plan × negocios activos por plan) (D-03)
  const mrr = activos.reduce((sum, r) => sum + (prices[r.plan] ?? 0), 0)
  const SEVEN_DAYS = 7 * 86_400_000
  const trialsPorVencer = rows.filter(r =>
    r.plan_status === 'trial' && r.trial_ends_at &&
    new Date(r.trial_ends_at).getTime() - now.getTime() <= SEVEN_DAYS &&
    new Date(r.trial_ends_at).getTime() >= now.getTime()
  ).length
  // "pagos fallidos" se DERIVA de plan_status (D-10): cancelled + expired (no un evento discreto)
  const pagosFallidos = rows.filter(r => r.plan_status === 'cancelled' || r.plan_status === 'expired').length
  return { mrr, negociosActivos: activos.length, trialsPorVencer, pagosFallidos }
}

export function deriveAlerts(rows: (BizRow & { id: string; name: string })[], now = new Date()) {
  // cada alerta es clickeable → /admin/negocios/{id} (D-12)
  const alerts: { businessId: string; name: string; tipo: 'pago_fallido' | 'trial_por_vencer' }[] = []
  for (const r of rows) {
    if (r.plan_status === 'cancelled' || r.plan_status === 'expired')
      alerts.push({ businessId: r.id, name: r.name, tipo: 'pago_fallido' })
    else if (r.plan_status === 'trial' && r.trial_ends_at &&
      new Date(r.trial_ends_at).getTime() - now.getTime() <= 7 * 86_400_000)
      alerts.push({ businessId: r.id, name: r.name, tipo: 'trial_por_vencer' })
  }
  return alerts
}
```
**Nota sobre las sparklines del mock:** las KPI cards del mock (`01-dashboard.png`) muestran un sparkline con tendencia y un delta "+12.4% vs mes anterior". Eso requiere **datos históricos** que NO se persisten en v1 (MRR histórico está deferred a v2). El planner debe decidir: (a) mostrar el sparkline con datos planos/placeholder, (b) omitir el delta histórico, o (c) mostrar solo el número actual sin tendencia. **Recomendación:** mostrar el número actual real (MRR/activos/etc.) y omitir o neutralizar el delta "vs mes anterior" (no hay fuente). Documentarlo como límite conocido v1.

### Anti-Patterns to Avoid
- **Service-role en el cliente:** pasar `createAdminClient()` o sus resultados crudos con columnas secretas al componente client. Leer en el RSC, pasar solo columnas no sensibles. (Regla 5 de `supabase-multitenant-rls`.)
- **Mutación sin `requireAdmin()`:** una server action del CRM sin `requireAdmin()` en su primera línea es un agujero (Pitfall 2 de Phase 1; el guard del layout NO protege actions invocadas directo).
- **Tocar el webhook de suscripción:** D-10 lo prohíbe explícitamente. Las KPIs/alertas LEEN `plan_status`, no modifican el webhook.
- **Allowlist en vez de blocklist para el corte de `suspended`:** el comentario de `booking/create/route.ts:56-62` explica por qué es blocklist (un negocio en trial/legacy/sin estado debe seguir reservando). SUMAR `'suspended'` al array, no reescribir la lógica.
- **Editar `plan_prices` y asumir que muta MP:** D-04 — no re-crea preapprovals. El copy debe avisar.
- **Usar los labels/montos del mock como datos:** "Equipo $48.000" del mock no existe; las keys reales son basic/studio/pro con 15000/30000/50000.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Guard de admin en cada action | re-leer `app_metadata` a mano | `requireAdmin()` (`lib/admin-guard.ts`) | Ya resuelto en Phase 1; lanza forbidden/unauthorized |
| Registrar auditoría | insert manual a `audit_log` | `logAudit()` (`lib/audit.ts`) | Service-role + best-effort + shape estable ya hecho |
| Doble confirmación / type-to-confirm | modal nuevo | `ConfirmDialog` (`components/crm/confirm-dialog.tsx`) | Niveles "SUSPENDER"/"CONFIRMAR"/simple ya lockeados + anti doble-submit testeado |
| Badge de riesgo/estado | pill nuevo | `RiskBadge` + un `StatusBadge` que calque su patrón | Variantes amarillo/rojo/neutral ya resueltas con los tokens del CRM |
| Selector de fecha (extender trial) | date input propio | `components/ui/calendar.tsx` (react-day-picker) | Ya en el repo, a11y resuelta |
| Sparkline KPI | SVG a mano | `recharts` | Ya instalado; usado en finanzas |
| Toasts del CRM | toast propio | `sonner` vía `CrmToaster` (dark, ya montado) | Tema dark del CRM ya configurado |
| Validar input de actions | narrowing manual | `zod` schemas | Patrón del proyecto; previene tampering del shape |

**Key insight:** Phase 2 es composición de los cimientos de Phase 1 + el patrón de mutación nuevo. El único código genuinamente nuevo es: la migración 032, las 5 server actions, las 3 páginas (directorio/ficha/planes), las funciones puras de métricas, y los 2 puntos de "efecto real" de `suspended`. Todo lo demás se reusa.

## Runtime State Inventory

> Phase 2 NO renombra nada, pero AGREGA estado (columnas + tabla) y CAMBIA comportamiento de runtime (corte por `suspended`). Se documenta lo que el deploy debe coordinar.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `has_web_custom`/`has_whatsapp` y tabla `plan_prices` no existen hoy (grep verificado). `plan_status='suspended'` es un valor nuevo no usado por ninguna fila existente. | Migración `032_crm_admin.sql` aplicada A MANO y en orden (última = 031). Seedear `plan_prices` con los `price_ars` de `subscription-plans.ts`. |
| Live service config | El webhook de MP escribe `plan_status` (active/cancelled/expired) — NO se toca (D-10). MP nunca escribirá `'suspended'` (ese valor solo lo setea el operador desde el CRM). | None — verificar que el webhook no tenga un `enum`/check que rechace valores; `plan_status` es `text` libre (`schema.sql:110`), así que `'suspended'` entra sin migración de constraint. |
| OS-registered state | Ningún cron/task relacionado. El cron diario `cancel-expired` (`vercel.json`) NO toca `plan_status` de negocios. | None. |
| Secrets/env vars | `SUPABASE_SERVICE_ROLE_KEY` (admin client) ya existe. No se agregan secrets. | None. |
| Build artifacts | `supabase/schema.sql` ya está desactualizado vs migraciones (MEMORY + nota de 031). Tras 032 quedará más desactualizado. | Tras aplicar 032, regenerar `schema.sql` con `supabase db dump` (TODO operativo, no de runtime). |

**Comportamiento de runtime que cambia (no es "estado" pero el deploy debe coordinar):** al deployar el código que suma `'suspended'` a la blocklist de booking y el bloqueo del dashboard, cualquier negocio que el operador marque como `suspended` dejará de operar inmediatamente. Coordinar el deploy del código con la migración 032 (el código que escribe `'suspended'` y el que lo bloquea deben ir juntos).

## Schema SQL propuesto — migración `032_crm_admin.sql`

> Próximo número: **032** (verificado: existen `030_landing_config_and_storage.sql` del workstream web-builder y `031_crm_audit_log.sql`; ninguno 032). Aplicar la skill `supabase-multitenant-rls`.

```sql
-- 032: admin de plataforma — precios editables + flags de add-ons (ADM-05, ADM-06)
-- Aplicar a mano y en orden (última aplicada: 031). Coordinar con el deploy del código
-- que suma 'suspended' a la blocklist de booking y bloquea el dashboard.

-- ── 1. Add-ons como flags booleanas en businesses (D-08) ─────────────────────────────────
-- has_whatsapp es la MISMA flag que gatea la Bandeja del milestone Gestión rebrand (D-09):
-- naming consistente, NO crear otra. Display = "Recordatorios WhatsApp" (nunca "SMS").
alter table public.businesses
  add column if not exists has_web_custom boolean not null default false,
  add column if not exists has_whatsapp   boolean not null default false;

-- ── 2. Tabla de precios editables (D-01/D-02) — ARS, 3 planes reales ──────────────────────
-- Seed con los price_ars reales de lib/subscription-plans.ts (lo que cobra MercadoPago),
-- NO el price_usd de lib/plans.ts. plan_prices es la fuente de lectura del editor (ADM-05),
-- del "Plan actual" de la ficha (ADM-02) y del cálculo de MRR (ADM-07).
create table if not exists public.plan_prices (
  plan_key    text primary key check (plan_key in ('basic','studio','pro')),
  price_ars   integer not null check (price_ars >= 0),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

insert into public.plan_prices (plan_key, price_ars) values
  ('basic',  15000),
  ('studio', 30000),
  ('pro',    50000)
on conflict (plan_key) do nothing;

-- ── 3. RLS de plan_prices (admin-only read; escritura solo service-role) ──────────────────
-- Mismo patrón que audit_log (031): RLS habilitada en la misma migración, SELECT solo para
-- is_admin (vía app_metadata JWT, D1 de Phase 1), SIN policy de write para users → solo el
-- service-role (createAdminClient en la server action updatePlanPrice) escribe. NUNCA using(true).
alter table public.plan_prices enable row level security;

drop policy if exists "admin read plan_prices" on public.plan_prices;
create policy "admin read plan_prices" on public.plan_prices
  for select
  using ((select auth.jwt() -> 'app_metadata' ->> 'is_admin') = 'true');
-- Sin policy de insert/update/delete: la escritura es exclusiva del service-role.
```

**Notas de seguridad (checklist `supabase-multitenant-rls`):**
- [x] `plan_prices` lleva RLS habilitada en la misma migración.
- [x] SELECT restringido a `is_admin` (no `using(true)` — lección 029/031).
- [x] Sin policy de write para users → solo service-role escribe el precio (no falsificable).
- [x] `has_web_custom`/`has_whatsapp` viven en `businesses` (ya con RLS tenant-scoped existente): el DUEÑO podrá LEER sus propias flags vía las policies de businesses (correcto — el dueño debe saber si tiene WhatsApp habilitado), pero NO podrá escribirlas si las policies de update de businesses no incluyen estas columnas en un `with check` que el dueño controle. **VERIFICAR en plan-phase:** que las policies de UPDATE de `businesses` no permitan al dueño auto-asignarse add-ons (cobro manual, D-08). Si el dueño puede hacer `update businesses set has_whatsapp=true` vía RLS, eso es un bypass del cobro. La escritura de add-ons SOLO debe venir del operador (service-role en `toggleAddon`).
- Nota: `plan_status` es `text` sin check constraint (`schema.sql:110`), así que `'suspended'` no requiere migración de constraint. Si en algún momento se agrega un `check`, debe incluir los 5 valores.

**Open question de RLS (para el planner):** confirmar las policies actuales de UPDATE sobre `businesses` (no estaban en los archivos leídos). Si el dueño puede actualizar columnas arbitrarias de su propio business, las flags de add-on quedarían auto-asignables → el plan debe restringir las columnas que el dueño puede tocar o mover los add-ons fuera del alcance del UPDATE del dueño.

## Common Pitfalls

### Pitfall 1: Confundir las dos fuentes de precio (usd vs ars)
**What goes wrong:** Editar/mostrar/sumar el `price_usd` de `lib/plans.ts` en vez del `price_ars` de `subscription-plans.ts` → MRR en dólares, precios que no coinciden con lo que MP cobra.
**Why it happens:** El CONTEXT dice "mover de `lib/plans.ts`" pero la fuente ARS real es otro módulo.
**How to avoid:** Seed `plan_prices` con `price_ars` (15000/30000/50000). MRR y "Plan actual" leen `plan_prices`. Ver §Decisión crítica.
**Warning signs:** Un `$56.000` o `$3.24M` que no cierra con 15000/30000/50000 × negocios; o un signo `$` que en realidad es USD.

### Pitfall 2: Server action sin `requireAdmin()`
**What goes wrong:** Una mutación del CRM invocada directo (fetch a la action endpoint, devtools) sin pasar por el guard del layout → elevación de privilegio.
**Why it happens:** Asumir que el ConfirmDialog o el guard del layout protege la action. NO lo hacen.
**How to avoid:** `requireAdmin()` PRIMERA línea de cada action (Pattern 2). Es el primer `'use server'` del repo — sentar el patrón bien.
**Warning signs:** Una `export async function` en `_actions.ts` sin `await requireAdmin()` arriba.

### Pitfall 3: `suspended` que marca pero no corta
**What goes wrong:** Setear `plan_status='suspended'` sin extender la blocklist de booking ni el bloqueo del dashboard → el negocio sigue operando, contradiciendo D-06.
**Why it happens:** Tratar la suspensión como un flag de CRM en vez de un gate de plan real.
**How to avoid:** DOS ediciones obligatorias y verificables: `booking/create/route.ts:63` (`['expired','cancelled']` → `['expired','cancelled','suspended']`) y `app/(dashboard)/layout.tsx` (nuevo `if (planStatus === 'suspended')` que bloquea, no solo banner). Verificación: un negocio suspendido recibe 403 en booking y no entra al dashboard.
**Warning signs:** El test/UAT de suspensión no prueba el corte real, solo el cambio de estado.

### Pitfall 4: Filtrar suspendidos fuera del directorio
**What goes wrong:** Aplicar un filtro "solo activos/trial" que oculta los suspendidos → contradice ADM-01 ("suspendidos siguen visibles y marcados").
**Why it happens:** Pensar el directorio como "negocios operativos".
**How to avoid:** El filtro "Suspendidos" es una pestaña MÁS (mock `03-negocios.png` muestra tab "Suspendidos 1"); "Todos" los incluye; nunca un default que los esconda. Badge de estado distintivo (rojo) en la fila.
**Warning signs:** Un negocio suspendido desaparece de la lista "Todos".

### Pitfall 5: revalidatePath olvidado tras la mutación
**What goes wrong:** La server action muta pero el RSC de la ficha/directorio sigue mostrando el estado viejo (cache de Next 16).
**Why it happens:** Server actions no invalidan el cache de RSC automáticamente.
**How to avoid:** `revalidatePath('/admin/negocios/[id]')` (o el path afectado) al final de cada action. Para el editor de precios, revalidar `/admin/planes` y `/admin` (KPIs dependen del precio).
**Warning signs:** El operador cambia algo, ve toast de éxito, pero la pantalla no refleja el cambio hasta recargar.

### Pitfall 6: Email de contacto desde la columna equivocada
**What goes wrong:** Mostrar `notification_email` (puede ser null o un email de notificaciones distinto de la cuenta) cuando ADM-02 pide el contacto del dueño.
**Why it happens:** Dos fuentes posibles: `auth.users.email` (cuenta real, requiere admin API) vs `businesses.notification_email` (columna, puede faltar).
**How to avoid:** Resolver en plan (Open Question 1). Recomendación: mostrar el email de la cuenta (`auth.users` vía `admin.auth.admin.getUserById(owner_id)` o un join) como contacto primario, con fallback a `notification_email`. WhatsApp = `businesses.whatsapp` (claro).
**Warning signs:** Ficha con "email: —" para negocios que sí tienen dueño con email.

### Pitfall 7: Zona horaria al extender trial / contar trials por vencer
**What goes wrong:** `addDays(now, 7)` en UTC recorta o adelanta un día respecto al horario AR (UTC-3).
**Why it happens:** `trial_ends_at` es `timestamptz`; mezclar `Date.now()` UTC con expectativas AR.
**How to avoid:** Reusar el patrón de zona AR del proyecto (date-fns + offset fijo). Para "fecha exacta" del calendario, fijar el fin del día AR. El conteo de "trials por vencer ≤7d" usa el mismo criterio que el `PlanBanner` del dashboard (`daysLeft` en `app/(dashboard)/layout.tsx:26`).
**Warning signs:** Un trial que vence "hoy" cuenta como vencido, o un preset de 7 días que da 6.

## Code Examples

Ver los bloques en §Architecture Patterns (Pattern 1-5) — todos derivados de patrones verificados del codebase (`app/(dashboard)/layout.tsx`, `lib/admin-guard.ts`, `lib/audit.ts`, `app/api/admin/set-plan/route.ts`, `app/api/booking/create/route.ts`, `lib/subscription-plans.ts`).

### Extender la blocklist SEC-04 (D-06, ADM-04)
```typescript
// app/api/booking/create/route.ts:63 — SUMAR 'suspended', no reescribir la lógica.
// El comentario de :56-62 explica por qué es blocklist (no allowlist) — preservarlo.
if (['expired', 'cancelled', 'suspended'].includes(business.plan_status)) {
  return Response.json({ ok: false, error: 'plan_inactive' }, { status: 403 })
}
```

### Bloqueo del dashboard del dueño suspendido (D-06)
```typescript
// app/(dashboard)/layout.tsx — NUEVO check. Hoy (:25-40) solo alimenta <PlanBanner>.
// Decidir el destino del bloqueo en plan: redirect a una página "negocio suspendido"
// (recomendado, da contexto) o redirect('/login'). NO render parcial del dashboard.
const planStatus = business.plan_status ?? 'trial'
if (planStatus === 'suspended') redirect('/suspendido')  // fuera de try/catch (lanza)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Mutaciones vía route handler `app/api/*` + fetch | Server actions `'use server'` invocadas desde RSC/forms | Next 13+/16 | Phase 2 introduce el primer `'use server'` del repo; menos boilerplate, integra con `revalidatePath` `[CITED: node_modules/next/dist/docs/ — consultar antes de implementar]` |
| `middleware.ts` | `proxy.ts` (Next 16) | Next 16 | `/admin` ya está en `KNOWN_PREFIXES` (Phase 1) `[VERIFIED: proxy.ts:16]` |

**Deprecated/outdated:** nada relevante nuevo para Phase 2. **Acción requerida:** consultar `node_modules/next/dist/docs/` para la API exacta de server actions + `revalidatePath`/`revalidateTag` en Next 16.2.7 antes de implementar (breaking changes vs versiones viejas, regla del proyecto).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | El precio editable/MRR usa `price_ars` de `subscription-plans.ts` (15000/30000/50000), no `price_usd` de `plans.ts` | Decisión crítica precios | Alto impacto: MRR y precios mostrados en moneda/valor equivocado. Verificado que MP cobra ARS; falta confirmar que el panel debe reflejar exactamente eso. |
| A2 | `plan_prices` (tabla, fila por plan) es la forma correcta vs columna en una tabla `plans` | Schema 032 | Bajo riesgo técnico; ambas funcionan. Afecta el shape de la migración. |
| A3 | Server actions (`'use server'`) es el patrón elegido vs route handlers con sesión | Architecture / Pattern 2 | Medio: cambia la estructura de archivos y el patrón que heredan Phases 3+. El repo no tiene precedente. |
| A4 | Email de contacto = `auth.users.email` (cuenta) con fallback a `notification_email` | Pitfall 6 / ADM-02 | Bajo: cosmético, pero define un acceso a admin API (getUserById) en la ficha. |
| A5 | El dueño NO puede auto-asignarse add-ons vía las policies de UPDATE de `businesses` | Schema 032 / RLS | Alto si falla: bypass de cobro manual. Requiere verificar las policies actuales de businesses (no leídas). |
| A6 | El delta histórico de las KPI cards ("vs mes anterior") se omite/neutraliza en v1 (no hay MRR histórico) | Pattern 5 | Bajo: cosmético; el mock lo muestra pero la fuente no existe en v1. |
| A7 | Extender trial sobre un negocio no-trial también setea `plan_status='trial'` (o solo cambia la fecha) | Pattern 4 | Bajo: el mock solo extiende fecha; el plan debe decidir si re-activa el estado trial. |

**Las assumptions A1, A3 y A5 son las que el planner debe cerrar antes de implementar.**

## Open Questions (RESOLVED)

> Las 4 quedaron resueltas en plan-phase (2026-06-18) e implementadas concretamente en los PLAN.md:
> - **RESOLVED Q1:** email de la cuenta (`admin.auth.admin.getUserById(owner_id)`) como primario, fallback a `notification_email` — plans 02-03/02-04.
> - **RESOLVED Q2:** `plan_prices` es la fuente del CRM (editor + MRR + ficha) en v1, seedeada desde `subscription-plans.ts` `price_ars`; el `plan-modal` del dueño y `setup:mp-plans` quedan fuera de scope de esta fase.
> - **RESOLVED Q3:** server actions `'use server'` (plan 02-02).
> - **RESOLVED Q4:** página `/suspendido` con contexto, no `redirect` mudo (plan 02-02 Task 3).

1. **¿Email de contacto de la ficha (ADM-02): `auth.users.email` o `businesses.notification_email`?**
   - What we know: WhatsApp = `businesses.whatsapp` (claro). `notification_email` existe pero puede ser null. El email de la cuenta requiere admin API (`admin.auth.admin.getUserById(owner_id)`) o un join a `auth.users`.
   - Recommendation: email de la cuenta como primario (es "el dueño real"), fallback a `notification_email`. Mostrar ambos si difieren. Confirmar en discuss/plan.

2. **¿`plan_prices` reemplaza a `subscription-plans.ts` como fuente de display en TODO, o solo en el CRM?**
   - What we know: `subscription-plans.ts` alimenta el `plan-modal` del dueño y `setup:mp-plans`. Si el editor cambia `plan_prices` pero el `plan-modal` sigue leyendo el literal de `subscription-plans.ts`, el dueño vería un precio viejo.
   - Recommendation: en v1, `plan_prices` es la fuente del CRM (editor + MRR + ficha). Decidir si el `plan-modal` del dueño también pasa a leer `plan_prices` (consistencia) o queda con el literal (menos scope, pero precio potencialmente desfasado). `setup:mp-plans` debería leer `plan_prices` para que las altas futuras usen el precio editado — pero eso toca un script fuera del runtime web (confirmar alcance).

3. **¿Server actions (`'use server'`) o route handlers con sesión para las mutaciones?**
   - What we know: el repo NO tiene ningún `'use server'`; todo es route handlers (`set-plan` usa `ADMIN_SECRET`, no sesión). El CRM necesita sesión + `is_admin` (no `ADMIN_SECRET`).
   - Recommendation: server actions (idiomático Next 16, integra con el flujo ficha→ConfirmDialog→revalidate). Consultar `node_modules/next/dist/docs/` para la API exacta. Si el planner prefiere route handlers por consistencia con `app/api/*`, también es válido — pero pierde `revalidatePath` directo y agrega fetch boilerplate.

4. **¿Qué pasa con el negocio suspendido en el dashboard del dueño — redirect a dónde?**
   - What we know: hoy el layout solo muestra banner. D-06 pide bloqueo real.
   - Recommendation: una página `/suspendido` con contexto ("tu cuenta está suspendida, contactá a Forjo") en vez de un `redirect('/login')` mudo. Decidir en plan (puede ser UI mínima).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase (Postgres + Auth) | directorio, ficha, actions, plan_prices | ✓ | proyecto activo | — |
| `SUPABASE_SERVICE_ROLE_KEY` | `createAdminClient` (lectura global + writes + logAudit) | ✓ (env) | — | sin él, bloqueante |
| Migración aplicada a mano | `032_crm_admin.sql` | manual | — | aplicar antes/junto con el deploy del código que la usa |
| Vitest | tests de funciones puras (KPIs/alertas/validación) | ✓ | (`vitest.config.mts`, environment node) | — |
| Phase 1 cimientos | requireAdmin/logAudit/ConfirmDialog/RiskBadge/shell | ✓ (shipped) | tag v0.11 P1 | — |

**Missing dependencies with no fallback:** ninguna — todo el stack está disponible.

## Validation Architecture

> `workflow.nyquist_validation` no está explícito como `false` → se incluye. El proyecto testea con Vitest environment `node` lógica PURA (no UI), como en Phase 1 (`lib/audit.test.ts`, `confirm-dialog.test.tsx` con helpers puros).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4 (environment `node`) `[VERIFIED: vitest.config.mts]` |
| Config file | `vitest.config.mts` (+ `vitest.setup.ts` carga `.env.local`) |
| Quick run command | `npx vitest run lib/crm-metrics.test.ts` |
| Full suite command | `npm test` (`vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADM-07 | `computeKpis` calcula MRR=Σ(precio×activos por plan), activos, trials≤7d, pagos fallidos | unit (puro) | `npx vitest run lib/crm-metrics.test.ts` | ❌ Wave 0 |
| ALERT-01 | `deriveAlerts` emite pago_fallido (cancelled/expired) + trial_por_vencer (≤7d), con businessId para navegar | unit (puro) | `npx vitest run lib/crm-metrics.test.ts` | ❌ Wave 0 |
| ADM-03/04/06 | validación zod de input de actions (plan/status/addon/preset) rechaza valores inválidos | unit (puro) | `npx vitest run app/(crm)/admin/_actions.schemas.test.ts` | ❌ Wave 0 (extraer schemas a un módulo puro testeable) |
| ADM-04 (trial) | resolución de `trial_ends_at` por preset/fecha respeta zona AR | unit (puro) | `npx vitest run lib/crm-metrics.test.ts` | ❌ Wave 0 |
| ADM-01 | filtro/búsqueda del directorio (helper puro `filterBusinesses`) incluye suspendidos en "Todos" | unit (puro) | `npx vitest run lib/crm-directory.test.ts` | ❌ Wave 0 |
| D-06 (corte real) | blocklist booking incluye 'suspended' / dashboard bloquea | manual/UAT | (verificación manual: 403 en booking, no-entry al dashboard) | manual |

### Sampling Rate
- **Per task commit:** `npx vitest run` del módulo tocado (funciones puras corren en <2s).
- **Per wave merge:** `npm test` (suite completa).
- **Phase gate:** suite verde + UAT del corte real de `suspended` antes de `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `lib/crm-metrics.ts` + `lib/crm-metrics.test.ts` — `computeKpis`/`deriveAlerts`/resolución de trial (cubre ADM-07, ALERT-01, ADM-04).
- [ ] `lib/crm-directory.ts` + `lib/crm-directory.test.ts` — `filterBusinesses` (cubre ADM-01, garantiza suspendidos visibles).
- [ ] Extraer los zod schemas de las actions a un módulo importable sin `'use server'` para testearlos en node (las funciones `'use server'` no se testean directo; se testea su validación).
- [ ] `MOCK` reminder: el corte real de `suspended` (D-06) es manual/UAT — no hay framework de integración HTTP en el repo.

## Security Domain

> `security_enforcement: true`, ASVS L1. El CRM es la superficie más sensible del sistema (core value: cero fuga cross-tenant). Phase 2 es la primera que MUTA datos de negocios desde el CRM.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | Defensa en profundidad: guard del layout (Phase 1) + `requireAdmin()` en CADA server action (Pattern 2) |
| V2 Authentication | yes | Sesión Supabase; `is_admin` en `app_metadata` (no self-serve, Phase 1) |
| V4 Access Control | yes | `requireAdmin()` server-side; service-role solo en RSC/actions server-only; RLS admin-read en `plan_prices`; verificar que el dueño no auto-asigne add-ons (A5) |
| V5 Input Validation | yes | `zod` en cada action (plan/status/addon/preset/monto); narrowing defensivo |
| V7 Logging | yes | `logAudit()` en cada mutación (cambio plan/estado/suspensión/trial/add-on/precio) — control central de FND-02 |

### Known Threat Patterns for esta fase
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Server action del CRM invocada directo sin guard | Elevation of Privilege | `requireAdmin()` primera línea de cada action (Pitfall 2) |
| Dueño se auto-asigna add-ons vía RLS UPDATE de businesses | Elevation of Privilege / fraude | Restringir columnas que el dueño puede actualizar; add-ons solo vía service-role (A5 — verificar policies) |
| Service-role o columnas secretas filtradas al cliente | Information Disclosure | Leer en RSC, pasar solo columnas no sensibles; cliente nunca importa supabase admin |
| `plan_prices` leído/escrito por no-admin | Information Disclosure / Tampering | RLS admin-read; write exclusivo del service-role (sin policy de write para users) |
| `suspended` que no corta (negocio sigue operando) | (integridad de negocio) | Extender blocklist SEC-04 + bloqueo dashboard (Pitfall 3); UAT del corte real |
| Falsificar auditoría de una mutación | Repudiation | `logAudit` service-role-only (Phase 1, no falsificable); cada action audita |
| Tampering del input de una action (plan/monto fuera de rango) | Tampering | `zod` schemas (enum de planes, monto ≥ 0, addon en set fijo) |

## Sources

### Primary (HIGH confidence)
- `lib/admin-guard.ts` / `lib/audit.ts` — `requireAdmin()` + `logAudit()` (cimientos verificados de Phase 1)
- `components/crm/confirm-dialog.tsx` / `risk-badge.tsx` — ConfirmDialog escalonado + RiskBadge (contratos lockeados)
- `app/(crm)/layout.tsx` / `components/crm/crm-sidebar.tsx` — shell + sidebar con slots Negocios/Planes (soon:true a cablear)
- `app/api/admin/set-plan/route.ts` — VALID_PLANS/VALID_STATUSES + lógica de update (reuso; NO borrar)
- `app/api/booking/create/route.ts:56-65` — blocklist SEC-04 (extender con 'suspended')
- `app/(dashboard)/layout.tsx:25-40` — plan_status → PlanBanner (agregar bloqueo suspended)
- `app/api/subscription/webhook/route.ts:51-113` — escribe plan_status (NO TOCAR, D-10; solo lectura para KPIs)
- `lib/plans.ts` + `lib/subscription-plans.ts` — DOS fuentes de precio (usd vs ars) — hallazgo crítico
- `supabase/migrations/031_crm_audit_log.sql` — convención de migración + patrón RLS admin-read (calcar para plan_prices)
- `supabase/schema.sql:91-123` — columnas reales de `businesses` (plan_status text sin check; no hay has_web_custom/has_whatsapp)
- `proxy.ts:16` — `/admin` ya en KNOWN_PREFIXES (Phase 1)
- `.claude/skills/supabase-multitenant-rls/SKILL.md` — checklist RLS (D5/032)
- `.claude/skills/mercadopago-suscripciones/SKILL.md` — fuente de verdad del cobro = webhook; price_ars es lo que cobra MP
- `vitest.config.mts` — environment node, helpers puros (patrón de test de Phase 1)
- Mockups `crm-design/01-dashboard.png`, `03-negocios.png`, `04-ficha-resumen.png`, `08-planes.png` — verdad visual (con los caveats: "Equipo"/montos del mock y "SMS"→"WhatsApp" son fixes)

### Secondary (MEDIUM confidence)
- `01-RESEARCH.md` / `01-CONTEXT.md` / `01-UI-SPEC.md` / `01-SECURITY.md` de Phase 1 — patrones, decisiones y threat register heredados
- `forjo-crm-admin-brief.md` (no en repo, referenciado por CONTEXT) — §7/§9/§11/§12

### Tertiary (LOW confidence)
- API exacta de server actions + `revalidatePath` en Next 16.2.7 — `[ASSUMED]` conocimiento general; **consultar `node_modules/next/dist/docs/` en plan/build** (regla del proyecto: Next 16 tiene breaking changes)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — cero paquetes nuevos, todo verificado en package.json/codebase
- Architecture: HIGH — patrones calcados de archivos reales + cimientos shipped de Phase 1
- Precios (usd vs ars): HIGH en el hallazgo (verificado por grep), MEDIUM en la decisión final (requiere confirmación del planner — A1/Open Q2)
- Pitfalls: HIGH — derivados del código real (blocklist, dashboard layout, dos módulos de precio, RLS de businesses)
- Server actions vs route handlers: MEDIUM — sin precedente en el repo; consultar docs de Next 16

**Research date:** 2026-06-18
**Valid until:** 2026-07-18 (stack estable; revalidar si cambia el modelo de planes/precios o se persiste MRR histórico)
