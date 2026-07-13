# Roadmap: Forjo App — Consola CRM (v0.11)

**Workstream:** crm · **Milestone:** v0.11 · **Granularity:** coarse · **Phase numbering reset to Phase 1**

## Overview

El milestone construye el centro de operaciones interno de Forjo Studio (operador único, `is_admin`) en seis fases que respetan el orden de dependencias del brief (§10 + §12): primero los cimientos transversales de seguridad (guard server-side, auditoría, doble confirmación, shell del CRM), porque todo lo demás se apoya en ellos; luego la capa de admin de plataforma — la más chica y la que se necesita antes del primer cliente — junto con sus alertas; después la impersonación read-only, que es la acción más peligrosa y reutiliza la ficha y la auditoría de la fase anterior; el pipeline con tags y timeline alrededor del trabajo de ficha/leads; los reportes de ventas, que dependen de precios editables y de la suscripción persistida; y por último las comunicaciones, deliberadamente al final por estar atadas a incógnitas técnicas sin resolver (stack del agente de WhatsApp §9.1, infra de mail entrante §9.2). El aislamiento multi-tenant y la auditoría son no negociables y atraviesan todas las fases.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Cimientos & Auditoría** - Guard server-side de `/admin`, tabla `audit_log`, doble confirmación reutilizable y shell del CRM anclado al tema Forjo default (completed 2026-06-18)
- [x] **Phase 2: Admin de Plataforma** - Directorio + ficha de negocios, gestión de plan/suscripción, precios editables, add-ons (flags), KPIs y alertas (completed 2026-06-18)
- [x] **Phase 3: Impersonación Read-Only** - "Ver como cliente" con read-only garantizado SERVER-SIDE, banner y auditoría por acceso con motivo (completed 2026-06-20)
- [x] **Phase 4: Pipeline, Tags & Timeline** - Tablero de pipeline lead→pago, conversión lead→`business`, tags filtrables y timeline cronológico en la ficha (completed 2026-06-22)
- [x] **Phase 5: Reportes de Ventas** - Revenue por mes, MRR, conversión por etapa y ranking con gráficos interactivos (completed 2026-06-24)
- [x] **Phase 6: Comms (Bandeja)** - Bandeja unificada WhatsApp (agente) con estados y toma manual de conversación (mail two-way COMMS-03 DIFERIDO a v2 — D-01) (completed 2026-06-24)

## Phase Details

### Phase 1: Cimientos & Auditoría

**Goal**: Existe la base de seguridad transversal del CRM — acceso controlado server-side, registro de auditoría de toda acción sensible, patrón de doble confirmación reutilizable y un shell de UI consistente — sobre la que se montan todas las demás fases.
**Depends on**: Nothing (first phase)
**Requirements**: FND-01, FND-02, FND-03, FND-04
**Success Criteria** (what must be TRUE):

  1. El operador con `is_admin = true` entra a `/admin`; cualquier otro usuario es redirigido server-side (sin render parcial ni guard solo-cliente).
  2. Toda acción sensible (cambio de plan, edición de precios, suspensión, add-ons, impersonación, otorgar `is_admin`) queda registrada en `audit_log` con quién, qué, cuándo y motivo cuando aplica.
  3. El operador no puede ejecutar una acción peligrosa sin pasar el type-to-confirm escalonado por riesgo (SUSPENDER / VER / CONFIRMAR / confirmación simple), provisto como patrón reutilizable.
  4. El CRM se muestra con su shell propio (sidebar agrupado, cards, tablas, badges, tabs, dialog, toasts) anclado al tema Forjo default en modo oscuro, con acentos amarillo principal / azul info / rojo SOLO peligro.

**Plans**: 4/4 plans complete
Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Cimientos: migración 031 audit_log (RLS admin-only) + logAudit() + requireAdmin() [FND-01, FND-02]

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Guard server-side de /admin (layout) + proxy KNOWN_PREFIXES + accent remap dark scopeado [FND-01, FND-04]
- [x] 01-04-PLAN.md — ConfirmDialog escalonado (FND-03) + script local de bootstrap de is_admin [FND-03]

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03-PLAN.md — Shell CRM: CrmSidebar agrupado + topbar + Toaster dark + RiskBadge + visor de auditoría [FND-04, FND-02]

**UI hint**: yes

### Phase 2: Admin de Plataforma

**Goal**: El operador gestiona el ciclo de vida de cada negocio (plan, suscripción, precios, add-ons, suspensión/trial) desde el panel sin tocar Supabase ni MercadoPago, ve los KPIs de operación arriba de todo y recibe alertas de lo urgente.
**Depends on**: Phase 1
**Requirements**: ADM-01, ADM-02, ADM-03, ADM-04, ADM-05, ADM-06, ADM-07, ALERT-01
**Success Criteria** (what must be TRUE):

  1. El operador busca/filtra el directorio de negocios (los suspendidos siguen visibles y marcados) y abre una ficha con plan, `plan_status`, estado de suscripción MP, contacto (email + WhatsApp obligatorios) y add-ons activos.
  2. El operador cambia el plan, suspende un negocio o extiende su trial desde la ficha, y cada acción exige confirmación según riesgo y queda en auditoría.
  3. El operador edita los precios de los planes desde el panel con doble confirmación + auditoría, sin alterar suscripciones ya activas sin aviso explícito.
  4. El operador activa/desactiva add-ons por negocio como flags booleanas (cobro manual fuera de la app) y la activación queda auditada.
  5. El dashboard muestra arriba de todo los KPIs (negocios activos, trials por vencer, pagos fallidos, MRR) y alertas de eventos urgentes (pago falló, trial por vencer) reusando la lógica de webhooks de suscripción existente.

**Plans**: 4/4 plans complete
Plans:

- [x] 02-01-PLAN.md

**Wave 1**

- [~] 02-01-PLAN.md — Migración 032 (plan_prices ARS + add-on flags + cierre agujero RLS owner) + libs puras (KPIs/alertas/trial/filtro) + set-plan suspended [ADM-04, ADM-05, ADM-07, ALERT-01] — PAUSADO en checkpoint humano (aplicar migración 032 a Supabase); 3/4 tareas autónomas completas, SUMMARY escrito

**Wave 2** *(blocked on Wave 1)*

- [x] 02-02-PLAN.md — 6 server actions del CRM (requireAdmin + zod + logAudit) + corte real de suspended (booking 403 + dashboard /suspendido) [ADM-03, ADM-04, ADM-05, ADM-06] — COMPLETO (backbone de mutación + auditoría; las pantallas que las invocan llegan en 02-04). Commits 79b6e7a/e897dcc/095fa7c
- [x] 02-03-PLAN.md — Dashboard /admin (KpiCard + AlertList) + Directorio /admin/negocios (StatusBadge) + sidebar cableado [ADM-01, ADM-07, ALERT-01] — COMPLETO (KPIs reales via computeKpis, alertas clickeables via deriveAlerts, directorio con suspendidos siempre visibles). Commits 6c540de/9dcbabd/ce59fff

**Wave 3** *(blocked on Wave 2)*

- [x] 02-04-PLAN.md — Ficha /admin/negocios/[id] (AddonToggle + ExtendTrialDialog) + Editor /admin/planes (PlanPriceCard) [ADM-02, ADM-03, ADM-04, ADM-05, ADM-06]

**UI hint**: yes

### Phase 3: Impersonación Read-Only

**Goal**: El operador puede "ver como cliente" cualquier negocio en modo solo lectura para soporte, con la garantía real de que ningún write ocurre bajo la sesión impersonada, scope estricto por `business_id` y cada acceso auditado con motivo.
**Depends on**: Phase 2
**Requirements**: IMP-01, IMP-02, IMP-03
**Success Criteria** (what must be TRUE):

  1. Bajo una sesión impersonada ningún write puede ocurrir, garantizado SERVER-SIDE (la UI deshabilitada es solo refuerzo, no la garantía).
  2. Iniciar una impersonación exige doble confirmación (type-to-confirm "VER") y un motivo obligatorio, y registra cada acceso en auditoría (quién, qué negocio, cuándo, motivo).
  3. La impersonación lee con scope estricto por `business_id` sin fuga cross-tenant, y se muestra siempre el banner "Estás viendo como X · solo lectura" con acción de salir.

**Plans**: 2/2 plans complete
Plans:

**Wave 1**

- [x] 03-01-PLAN.md — Backbone de seguridad: startImpersonationSchema + startImpersonation (audit 'user.impersonate', sin mutar) + lib/impersonation.ts (lectura service-role acotada por business_id) + loader /ver/page.tsx [IMP-01, IMP-02, IMP-03]

**Wave 2** *(blocked on Wave 1)*

- [x] 03-02-PLAN.md — Superficie visual read-only: ImpersonationBanner + renderers presentacionales por sección + botón "Ver como cliente" en la ficha con ConfirmDialog "VER" + motivo + checkpoint humano (APROBADO) [IMP-01, IMP-03]. Fix: startImpersonation audita+retorna y la ficha navega client-side (elimina el toast espurio del NEXT_REDIRECT). Commits d382de1/d89fe87/8723f4f

**UI hint**: yes

### Phase 4: Pipeline, Tags & Timeline

**Goal**: El operador opera el pipeline de ventas completo — un lead entra, se mueve por etapas y se convierte en `business` al registrarse manteniendo su historial — con tags filtrables en pipeline y directorio y un timeline cronológico unificado en la ficha.
**Depends on**: Phase 2
**Requirements**: PIPE-01, PIPE-02, PIPE-03, PIPE-04, TL-01
**Success Criteria** (what must be TRUE):

  1. Un lead (frío o signup de trial) entra al pipeline en una etapa inicial, persistido en tablas `leads`/`deals`.
  2. El operador mueve leads entre etapas en un tablero (lead → trial → propuesta → pago).
  3. Al registrarse, un lead se convierte en `business` (tenant) y queda vinculado a su historial de pipeline.
  4. El operador asigna tags (color + texto) a leads y negocios y filtra por tag tanto en el pipeline como en el directorio.
  5. La ficha de un negocio/lead tiene una pestaña de timeline con el historial cronológico unificado (comms, tareas, notas, cambios de plan/estado, impersonaciones), distinto de la Bandeja.

**Plans**: 9/9 plans complete
**Wave 1**

- [x] 04-01-PLAN.md — Migración 034 (6 tablas admin-only + VIEW crm_timeline security_invoker) + libs puras (STAGES, filtro tags OR, tipos timeline) + schemas zod + tag-chip — COMPLETE 2026-06-21

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 04-02-PLAN.md — Tablero de pipeline (DnD nativo, filtro tags OR, resumen $) + conversión lead→business dual (auto en onboarding + manual) + server actions de pipeline/tags/conversión — COMPLETE 2026-06-21
- [x] 04-03-PLAN.md — Tab Timeline en la ficha (session read RLS-gated) + notas/tareas + filtro de tags en el directorio + timeline-entry — COMPLETE 2026-06-22

**Gap closure (del 04-UAT.md — 6 gaps diagnosticados)**

Wave 1 (paralelos, sin overlap de archivos):

- [x] 04-04-PLAN.md — [TDD] Backend pipeline: markWon (status='won', audita 'deal.won') + createDeal reuse-by-email acotado a leads activos [gaps test 5/4b backend] [PIPE-02]
- [x] 04-05-PLAN.md — Migración 035: de-duplicar crm_timeline (excluir note.*/task.* de la rama audit_log) + checkpoint blocking-human [gap test 11 dup] [TL-01]

Wave 2:

- [x] 04-06-PLAN.md — UI pipeline: createDeal refresca el tablero + botón "Marcar ganado" + wonTotal server-side en el header + deal.title prioritario [gaps test 4a/5/4b UI] [PIPE-01, PIPE-02] (depends 04-04)
- [x] 04-07-PLAN.md — UI ficha: desbloqueo de tags (createTag, +Tag) + completar tareas (completeTask + checkbox) + fix cosmético badge ConfirmDialog [gaps test 13/11/12] [PIPE-04, TL-01] (depends 04-05)

**Gap closure round 2 (re-test 2026-06-22 — 1 major + 2 minor)**

- [x] 04-08-PLAN.md — Tags del pipeline end-to-end: diálogo de tags compartido (TagManagerDialog, entityType lead|business) reusado por ficha + tablero + createTag→id (auto-asignación) + "Limpiar filtros" siempre visible en el directorio [gaps test 7/13/14] [PIPE-04]

**Gap closure round 3 (re-test 2 2026-06-22 — 1 major)**

- [x] 04-09-PLAN.md — Quitar tags desde el TagManagerDialog: sección "Asignadas" con TagChip removable + removeTag (afordance directo para lead y business; la fila + ConfirmDialog de la ficha queda intacta) [gap test 7] [PIPE-04]

**UI hint**: yes

### Phase 5: Reportes de Ventas

**Goal**: El operador ve la salud comercial del negocio en reportes — revenue mensual y MRR, conversión por etapa y ranking — con gráficos interactivos, apoyado en los precios editables y la suscripción persistida.
**Depends on**: Phase 2, Phase 4
**Requirements**: RPT-01, RPT-02
**Success Criteria** (what must be TRUE):

  1. El operador ve reportes de revenue por mes y MRR derivados de los precios editables (ADM-05) y la suscripción persistida.
  2. El operador ve la conversión por etapa del pipeline y un ranking, con gráficos interactivos.

**Plans**: 2/2 plans complete
Plans:

**Wave 1**

- [x] 05-01-PLAN.md — Cimientos de datos: migración 036 (mrr_snapshots, RLS admin-only + seed) + bloque snapshot idempotente en el cron diario + lib pura crm-reports.ts (MRR/ARPA/embudo/churn/ranking) + vitest [RPT-01, RPT-02] (incluye checkpoint blocking: aplicar 036 a mano)

**Wave 2** *(blocked on Wave 1 + migración 036 aplicada)*

- [x] 05-02-PLAN.md — Superficie /admin/reportes: RSC con lectura session/service-role split + reportes-client recharts (5 KPIs + Evolución MRR + MRR por plan donut + Embudo + Ranking + toggle 3/6/12m), fiel a 06-reportes.png [RPT-01, RPT-02]

**UI hint**: yes

### Phase 6: Comms (Bandeja)

**Goal**: El operador centraliza las comunicaciones con leads y negocios en una bandeja unificada de WhatsApp (agente) y mail two-way, con estados de conversación y la posibilidad de tomar la charla pausando al agente.
**Depends on**: Phase 4
**Requirements**: COMMS-01, COMMS-02, COMMS-03
**Success Criteria** (what must be TRUE):

  1. El operador ve una bandeja unificada con las conversaciones de WhatsApp (del agente) y los mails, asociadas al lead/negocio.
  2. Cada conversación muestra su estado (IA atendiendo / Vos atendés / Sin asignar); al "tomar la conversación" el agente pausa.
  3. ~~La bandeja recibe y responde mail (two-way), no solo saliente transaccional.~~ **(COMMS-03 — DIFERIDO a v2, ver nota de scope abajo; NO se entrega en v1).**

**Plans**: 2/2 plans complete

**Wave 1**

- [x] 06-01-PLAN.md — Cimientos: migración 038 (conversations/messages + RLS mixta owner-OR-admin + idempotencia) + libs puras (conversations/agent-context + vitest) + endpoints del agente (ingest fail-closed, context, state) + takeover server action auditada [COMMS-01, COMMS-02] (incluye checkpoint blocking: aplicar 038 a mano)

**Wave 2** *(blocked on Wave 1 + migración 038 aplicada)*

- [x] 06-02-PLAN.md — Superficie /admin/bandeja: RSC session-read (RLS-gated) + bandeja-client (lista 2-paneles + thread + estados + filtros Todas/WhatsApp + Tomar conversación, composer DESHABILITADO) fiel a 07-bandeja.png + habilitar item Bandeja del sidebar [COMMS-01, COMMS-02]

**UI hint**: yes

> **Scope v1 (LOCKED D-01):** Phase 6 = bandeja **WhatsApp únicamente**. **COMMS-03 (mail two-way) DIFERIDO entero a v2** — el inbound necesita infra/costo no resuelto (§9.2: proveedor + DNS/MX); sin tab "Email" en v1. **Envío manual saliente DIFERIDO (D-03):** el composer ship deshabilitado ("próximamente") hasta que el bot exponga un endpoint `send`. Success Criteria #3 (mail) NO se entrega en v1.
> **Gate técnico (brief §9) RESUELTO:** el stack del agente de WhatsApp (§9.1) ya existe (Baileys/VPS/SQLite, otro repo); Forjo solo expone los endpoints (ingest/context/state). El mail entrante (§9.2) es justamente lo que se difiere.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Cimientos & Auditoría | 4/4 | Complete    | 2026-06-18 |
| 2. Admin de Plataforma | 4/4 | Complete    | 2026-06-18 |
| 3. Impersonación Read-Only | 2/2 | Complete   | 2026-06-20 |
| 4. Pipeline, Tags & Timeline | 9/9 | Complete   | 2026-06-22 |
| 5. Reportes de Ventas | 2/2 | Complete    | 2026-06-24 |
| 6. Comms (Bandeja) | 2/2 | Complete    | 2026-06-24 |

---
*Roadmap created: 2026-06-17 — workstream crm, v0.11 Consola CRM. Phase numbering reset to Phase 1 (--reset-phase-numbers).*
