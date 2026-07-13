# Phase 2: Admin de Plataforma - Context

**Gathered:** 2026-06-18
**Status:** Ready for planning
**Source:** discuss-phase (decisiones del operador sobre las 4 gray areas de datos/comportamiento) + brief LOCKED + Phase 1 (cimientos)

<domain>
## Phase Boundary

El operador gestiona el ciclo de vida de cada negocio (plan, suscripción, precios, add-ons, suspensión/trial) desde `/admin` sin tocar Supabase ni MercadoPago, ve los KPIs de operación arriba de todo y recibe alertas de lo urgente. Se monta sobre los cimientos de Phase 1 (`requireAdmin()`, `logAudit()`, `ConfirmDialog`, shell CRM dark, `audit_log`). Requirements: ADM-01..07, ALERT-01.

**Fuera de scope (otras fases):** impersonación read-only (Phase 3 · IMP), pipeline/tags/timeline (Phase 4), reportes/charts (Phase 5), bandeja/comms (Phase 6). La capa visual ya está cerrada por los mockups + `01-UI-SPEC.md`; esta discusión NO re-decide layout/paleta/tipografía.
</domain>

<decisions>
## Implementation Decisions

Decisiones CERRADAS por el operador en discuss-phase. El research/planner NO las re-litiga.

### Precios, moneda y MRR (ADM-05, ADM-07)
- **D-01:** Los precios editables se mueven de `lib/plans.ts` a DB/config, editables desde `/admin` (pantalla "Planes y precios", mockup `08-planes.png`). `lib/plans.ts` queda como **seed/fallback** (los topes `max_professionals`/`max_locations` + `features` siguen viviendo ahí; lo que pasa a DB es el **precio** editable). Requiere migración nueva (próxima = **032**).
- **D-02:** Moneda del panel = **ARS** (como el mock, no USD). Precios se editan y muestran en ARS. El `price_usd` actual de `lib/plans.ts` NO es la fuente del panel.
- **D-03:** **MRR = Σ(precio del plan × negocios activos por plan)** — MRR **actual** (snapshot calculado), NO histórico. No se persiste el monto cobrado por suscripción en v1 (ver Deferred).
- **D-04:** Editar un precio NO altera suscripciones ya activas sin aviso explícito (ADM-05): el `ConfirmDialog` "Editar precio" (type-to-confirm "CONFIRMAR", contrato locked en `01-UI-SPEC.md`) lo deja claro en su copy; en v1 el precio nuevo aplica a cobros futuros, no muta las suscripciones MP vigentes.

### Suspensión y extensión de trial (ADM-04)
- **D-05:** `suspended` se agrega como **nuevo valor de `plan_status`** (NO columna aparte). Universo de estados: `trial` / `active` / `expired` / `cancelled` / **`suspended`**. Sumar `'suspended'` a `VALID_STATUSES` en `app/api/admin/set-plan/route.ts`.
- **D-06:** Suspender **corta de verdad** (efecto real, no solo marca en el CRM), reusando el gate de plan de v0.9 (SEC-04):
  - **Booking público:** sumar `'suspended'` a la blocklist de `app/api/booking/create/route.ts:63` (hoy `['expired','cancelled']` → 403 `plan_inactive`).
  - **Dashboard del dueño:** nuevo check `plan_status === 'suspended'` en `app/(dashboard)/layout.tsx` que bloquea el acceso (hoy ese layout solo renderiza `<PlanBanner>` para trial/expired — NO bloquea; el bloqueo en `suspended` es comportamiento NUEVO).
- **D-07:** Extender trial: **presets 7/14/30 días + opción de fecha exacta**. Opera sobre `businesses.trial_ends_at`.

### Add-ons (ADM-06)
- **D-08:** Add-ons = **flags booleanas por negocio**, columnas nuevas en `businesses`: `has_web_custom`, `has_whatsapp`. NO jsonb / NO tabla aparte — set chico y fijo. No existen hoy → migración nueva (032). Activación auditada (`logAudit`), cobro manual fuera de la app.
- **D-09:** `has_whatsapp` es la **MISMA flag** que gatea la Bandeja de Mensajes del milestone *Gestión rebrand* → naming consistente entre milestones, NO crear una flag distinta. El add-on se muestra como **"Recordatorios WhatsApp"**, NUNCA "SMS" (fix brief §11).

### Alertas y KPIs (ADM-07, ALERT-01)
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
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements y roadmap de la fase
- `.planning/workstreams/crm/REQUIREMENTS.md` — ADM-01..07, ALERT-01 + Out of Scope + v2 (ADDON-PAY-01, NOTIF-EXT-01)
- `.planning/workstreams/crm/ROADMAP.md` — Phase 2 success criteria + dependencia de Phase 1

### Phase 1 (cimientos que esta fase reusa)
- `.planning/workstreams/crm/phases/01-cimientos-auditor-a/01-CONTEXT.md` — D1..D7 (is_admin en app_metadata, /admin route group, audit_log, requireAdmin, ConfirmDialog, tema CRM)
- `.planning/workstreams/crm/phases/01-cimientos-auditor-a/01-UI-SPEC.md` — contrato visual cerrado: CrmSidebar (slots Dashboard/Negocios/Planes y precios), ConfirmDialog escalonado, tabla + Riesgo badges, KPI cards, copy
- `.planning/workstreams/crm/phases/01-cimientos-auditor-a/01-RESEARCH.md` — patrones verificados, pitfalls, estructura sugerida
- `.planning/workstreams/crm/phases/01-cimientos-auditor-a/01-SECURITY.md` — mitigaciones ASVS de los cimientos

### Brief y diseño (NO en repo)
- `c:\Users\franc\Desktop\Forjo Studio\forjo-crm-admin-brief.md` — §1 (LOCKED A5/A6/A8/A10/A11), §5, §7 (acciones peligrosas), §9 (ambigüedades MRR/pagos), §11 (type-to-confirm + fix "WhatsApp no SMS"), §12 (unificación visual)
- `c:\Users\franc\Desktop\Forjo Studio\crm-design\01-dashboard.png` — KPIs + alertas (ADM-07/ALERT-01)
- `c:\Users\franc\Desktop\Forjo Studio\crm-design\03-negocios.png` — directorio (ADM-01)
- `c:\Users\franc\Desktop\Forjo Studio\crm-design\04-ficha-resumen.png` — ficha de negocio (ADM-02..06)
- `c:\Users\franc\Desktop\Forjo Studio\crm-design\08-planes.png` — editor de precios (ADM-05)
- `c:\Users\franc\Desktop\Forjo Studio\crm-design\Forjo Consola CRM (offline).html` — comportamiento de referencia

### Código del codebase a calcar / extender (rutas reales)
- `lib/plans.ts` — PLANS (basic/studio/pro), `price_usd` (pasa a DB · D-01/D-02), `getPlanLimits()` (queda)
- `app/api/admin/set-plan/route.ts:48-49,63` — `VALID_PLANS`/`VALID_STATUSES` (sumar `suspended`), lógica de update a reusar en la nueva server action
- `app/api/booking/create/route.ts:57-64` — blocklist SEC-04 `['expired','cancelled']` → sumar `'suspended'`
- `app/(dashboard)/layout.tsx:25,40` — `plan_status` hoy solo alimenta `<PlanBanner>`; agregar bloqueo en `suspended`
- `app/api/subscription/webhook/route.ts:52-107` — escribe `plan_status` active/cancelled/expired (NO TOCAR · D-10)
- `supabase/schema.sql:108-122` — columnas de `businesses` (`plan`, `plan_status`, `trial_ends_at`, `mp_subscription_id`, `subscription_ends_at`); agregar `has_web_custom`, `has_whatsapp`
- `supabase/migrations/031_crm_audit_log.sql` — última migración aplicada (próxima = 032); convención + lección RLS
- `lib/audit.ts` (`logAudit`), `lib/admin-guard.ts` (`requireAdmin`) — Phase 1, usar en cada acción

### Reglas del proyecto
- `.claude/skills/supabase-multitenant-rls/SKILL.md` — checklist RLS para la migración 032
- `.claude/skills/mercadopago-suscripciones/SKILL.md` — estado de suscripción / plan_status (lectura para KPIs; no tocar webhook)
- `.claude/skills/convenciones-forjo/SKILL.md` — naming, estructura, manejo de errores
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `requireAdmin()` (`lib/admin-guard.ts`) + `logAudit()` (`lib/audit.ts`): toda acción de ADM-03..06 las usa (guard server-side + auditoría).
- `ConfirmDialog` (`components/crm/confirm-dialog.tsx`, Phase 1): niveles ya lockeados — Cambiar plan (simple), Suspender ("SUSPENDER"), Editar precio ("CONFIRMAR").
- `CrmSidebar`: slots de nav ya creados (Dashboard, Negocios, Planes y precios, Auditoría) — esta fase los cablea a páginas reales.
- KPI card + Riesgo badge + audit table: contratos de `01-UI-SPEC.md`, reusar verbatim.
- `set-plan` update logic: base para la nueva server action de cambio de plan/estado.

### Established Patterns
- `page.tsx` server component async → fetch Supabase → componente client co-ubicado (`*-client.tsx`).
- Server actions del CRM: `requireAdmin()` primero, `logAudit()` después de la mutación.
- Migraciones numeradas aplicadas a mano (próxima = 032); RLS habilitada en la misma migración, escritura sensible solo service-role.
- Gate de plan fail-closed con blocklist explícito (SEC-04) — extender, no reescribir.

### Integration Points
- `businesses`: nuevo valor `plan_status='suspended'` + columnas `has_web_custom`/`has_whatsapp` (migración 032).
- Precios editables: nueva tabla/config en migración 032; `lib/plans.ts` como seed.
- `app/api/booking/create/route.ts` (blocklist) y `app/(dashboard)/layout.tsx` (guard) — puntos donde "suspended" produce efecto real.
- Webhook de suscripción: SOLO lectura de `plan_status` para KPIs/alertas; NO se modifica.
</code_context>

<specifics>
## Specific Ideas

- Referencia visual fiel: los mockups de `crm-design/` son la verdad de diseño; reproducir, no aproximar (el prototipo es un MOCK, re-implementar nativo).
- "Recordatorios WhatsApp", nunca "SMS" (el mock mezcla ambos — unificar a WhatsApp).
- Un operador, bajo tráfico → preferir cálculo en vivo sobre infra (cron/eventos) en todo lo de esta fase.
</specifics>

<deferred>
## Deferred Ideas

- **Persistir monto cobrado por suscripción + MRR histórico** → v2 (habilitaría MRR histórico real en vez del snapshot de D-03).
- **Evento discreto "pago falló" persistido** (tabla notifications/events) → v2; relacionado con NOTIF-EXT-01 (canal externo de alertas).
- **Cobro automático de add-ons** → v2 (ADDON-PAY-01, ya en REQUIREMENTS v2). En v1 add-ons son flags on/off, cobro manual.
- Impersonación read-only (IMP-01..03) = Phase 3; Pipeline/tags/timeline = Phase 4; Reportes = Phase 5; Bandeja = Phase 6.

None — discussion stayed within phase scope (las decisiones de arriba son diferimientos explícitos, no scope creep).
</deferred>

---

*Phase: 02-admin-de-plataforma*
*Context gathered: 2026-06-18 via discuss-phase*
