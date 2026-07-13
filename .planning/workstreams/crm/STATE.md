---
gsd_state_version: 1.0
milestone: v0.11
milestone_name: Consola CRM
status: Awaiting next milestone
stopped_at: Phase 6 COMPLETE — 06-02 (bandeja UI) cerrado, QA visual aprobada
last_updated: "2026-06-25T18:09:01.090Z"
last_activity: 2026-06-25 — Milestone v0.11 completed and archived
progress:
  total_phases: 6
  completed_phases: 6
  total_plans: 23
  completed_plans: 23
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (sección "Current Milestone (workstream `crm`): v0.11 Consola CRM")
Brief fuente de verdad: `c:\Users\franc\Desktop\Forjo Studio\forjo-crm-admin-brief.md`
Diseño aprobado (referencia, NO código): `c:\Users\franc\Desktop\Forjo Studio\crm-design\`
Roadmap: .planning/workstreams/crm/ROADMAP.md (6 fases, 25/25 requirements mapeados)

**Core value:** Un negocio NUNCA puede leer ni modificar datos de otro. El CRM y la impersonación son la superficie MÁS sensible del sistema — no pueden filtrar datos entre tenants bajo ninguna circunstancia.
**Current focus:** Phase 06 — comms-bandeja

## Current Position

Phase: Milestone v0.11 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-06-25 — Milestone v0.11 completed and archived

## Roadmap Summary

| Fase | Goal (resumen) | Requirements | Depende de |
|------|----------------|--------------|------------|
| 1. Cimientos & Auditoría | Guard server-side, `audit_log`, doble confirmación, shell CRM | FND-01..04 | — |
| 2. Admin de Plataforma | Directorio + ficha, plan/suscripción, precios, add-ons, KPIs + alertas | ADM-01..07, ALERT-01 | 1 |
| 3. Impersonación Read-Only | "Ver como cliente" read-only server-side, banner, auditoría con motivo | IMP-01..03 | 2 |
| 4. Pipeline, Tags & Timeline | Tablero lead→pago, conversión lead→business, tags, timeline en ficha | PIPE-01..04, TL-01 | 2 |
| 5. Reportes de Ventas | Revenue/MRR, conversión por etapa, ranking, gráficos | RPT-01, RPT-02 | 2, 4 |
| 6. Comms (Bandeja) | Bandeja WhatsApp+mail two-way, estados, toma manual | COMMS-01..03 | 4 |

Orden de ejecución: 1 → 2 → 3 → 4 → 5 → 6.

## Accumulated Context

### Decisions

Decisiones LOCKED del milestone (no re-litigar en discuss-phase) — del brief §1 y §11/§12:

- [v0.11/A1]: CRM interno de 3 capas en UNA herramienta — (1) ventas/pipeline, (2) comms WhatsApp+mail, (3) admin de plataforma
- [v0.11/A2]: Acceso por flag `is_admin` + check server-side en el layout de `/admin` (NO allowlist, NO header)
- [v0.11/A3]: Pipeline = full CRM (lead frío → trial → pago → ciclo de vida); el lead se convierte en `business` al registrarse
- [v0.11/A4]: Comms = mix agente IA + toma manual; mail en la misma bandeja; al "tomar" la charla el agente pausa
- [v0.11/A5]: Add-ons = flags booleanas por negocio (`has_web_custom`, `has_whatsapp`, etc.), cobro manual fuera de la app (sin infra de cobro automático en v1)
- [v0.11/A6]: Precios de planes editables desde el panel (habilita MRR)
- [v0.11/A7]: Impersonación "ver como cliente" = SOLO LECTURA, acción crítica, audita cada acceso + motivo
- [v0.11/A8]: Auditoría desde v1 (cambio de plan, edición de precios, suspensión, add-ons, cada impersonación, otorgar is_admin)
- [v0.11/A11]: Doble confirmación SIEMPRE en acciones peligrosas (type-to-confirm escalonado: SUSPENDER / VER / CONFIRMAR según riesgo)
- [v0.11/A12]: Diseño primero (aprobado) → build incremental nativo. El prototipo es MOCK, no código a shippear
- [v0.11/§12]: CRM NO themeable — anclado al tema Forjo default (Bauhaus cálido), modo oscuro principal. Acentos: amarillo `#f4c543` principal, azul `#2a5fa5` info, rojo `#d94a2b` SOLO peligro (un solo rojo)
- [v0.11/roadmap]: 6 fases, numeración reiniciada en Phase 1 (--reset-phase-numbers). Orden por dependencias del brief §10+§12: cimientos → admin → impersonación → pipeline → reportes → comms.
- [Phase ?]: ConfirmDialog (FND-03) no autoriza; la garantia real es requireAdmin() server-side
- [Phase ?]: Gating del ConfirmDialog testeado via helpers puros en node (sin Testing Library/jsdom; cero deps)
- [Phase ?]: is_admin se setea en app_metadata via Admin API con script local (no SQL, no self-serve)
- [Phase 2/02-01]: Cierre del agujero A5 vía BEFORE UPDATE trigger businesses_protect_admin_columns (auth.role() != 'service_role' revierte has_web_custom/has_whatsapp/plan/plan_status): Postgres no restringe columnas en RLS, el trigger no rompe los updates legítimos del dueño
- [Phase 2/02-01]: plan_prices seedeada con price_ars de subscription-plans.ts (15000/30000/50000), NO el price_usd de plans.ts (Pitfall 1)
- [Phase 2/02-01]: Fin del día AR para fecha exacta de trial vía offset literal -03:00 (UTC-3 sin DST), sin date-fns-tz (cero paquetes nuevos)
- [Phase 2/02-02]: 6 server actions del CRM con patrón obligatorio: requireAdmin() primera línea + zod parse + mutación + logAudit + revalidatePath (primer 'use server' del repo)
- [Phase 2/02-02]: extendTrial actualiza SOLO trial_ends_at, NUNCA plan_status (extender trial no reactiva); reactivateBusiness es la única que pone active + trial_ends_at=null, replicando set-plan
- [Phase 2/02-02]: updatePlanPrice escribe plan_prices (price_ars/updated_at/updated_by) y NO toca MercadoPago (D-04); aplica a cobros futuros, no muta suscripciones MP activas
- [Phase 2/02-02]: 'suspended' corta de verdad (D-06): booking/create 403 plan_inactive + guard del dashboard redirige a /suspendido. API zod top-level de zod 4 (z.uuid/z.iso.datetime/z.int)
- [Phase 2/02-04]: Cambiar plan rota basic→studio→pro→basic; el ConfirmDialog (simple) nombra el plan destino antes de confirmar (no hay selector de plan en el mock/UI-SPEC); changePlan recibe el destino explícito
- [Phase 2/02-04]: AddonToggle re-sincroniza el prop DURANTE el render (prevChecked), no en useEffect, para evitar el lint react-hooks/set-state-in-effect (cascading renders)
- [Phase 2/02-04]: PlanPriceCard no usa <ConfirmDialog> directo (no expone slot de children para el input de monto): reusa sus helpers PUROS (computeConfirmState/buildSubmitGuard/confirmButtonClass) sobre el Dialog base — contrato de confirmación idéntico
- [Phase 3/03-01]: Impersonación read-only POR CONSTRUCCIÓN (D-02): la garantía IMP-01 se logra por AUSENCIA de write paths — startImpersonation solo audita+redirige sin mutar; lib/impersonation.ts sin update/insert/delete ni cliente browser
- [Phase 3/03-01]: Capa de lectura cross-tenant centralizada en loadImpersonationData (service-role acotado por business_id, negocio por id) para que ninguna query olvide el filtro; cero owner_id
- [Phase 3/03-01]: Trail de auditoría hermético — entrada con motivo (user.impersonate/alto) + auditoría por CARGA del loader (user.impersonate.view/medio, sin motivo): ninguna vista del tenant sin traza, incluido acceso directo por URL
- [Phase 3/03-01]: Motivo validado server-side z.string().trim().min(10) (el dialog es refuerzo, no la garantía); presencia de integraciones como booleanos (getBusinessIntegrationStatus), nunca el valor crudo del secreto bajo impersonación
- [Phase 3/03-01]: Escape del shell dark del CRM en /ver con clase scopeada .impersonation-view (re-declara neutrales light de :root; acento del data-palette del negocio) — el dark del CRM es class-based, una variante 'not-dark' no existe/no neutraliza
- [Phase 3/03-02]: ImpersonationView = renderers NUEVOS presentacionales (Card/Badge/StatusBadge/UpcomingAppointments), NO se reusa ningún *-client.tsx del dashboard (todos mutan, RESEARCH §1); la ausencia de write paths ES la garantía read-only. Config muestra solo presencia de integraciones, nunca el secreto
- [Phase 3/03-02]: ConfirmDialog.minReasonLength como prop OPCIONAL aditiva (default = "no vacío" actual); alinea el min del motivo dialog↔server (feedback inline en vez de toast genérico) sin tocar los callers de Phase 2
- [Phase 3/03-02 — FIX checkpoint]: startImpersonation pasó de redirect() server-side a audit+return (Promise<void> limpio); la navegación a /ver la hace el cliente con router.push. redirect() lanza NEXT_REDIRECT que atravesaba el try/catch del ConfirmDialog → toast de error espurio aunque la navegación ocurría. D-04 preservado (navegar ahora client-side); auditoría sin cambios. Commit 8723f4f
- [Phase 4/04-03]: crm_timeline (VIEW security_invoker) se lee con el SESSION client (createClient), NO service-role: hereda la RLS admin-read de las tablas base; service-role bypassaría el gate (T-04-10). Siempre .eq('business_id', id)
- [Phase 4/04-03]: _content-actions.ts (notas/tareas) sigue el contrato de 6 pasos de _actions.ts; codes note.create/edit/delete + task.create/complete; completeTask setea completed_at now/null según done; deleteNote risk medio detrás de ConfirmDialog
- [Phase 4/04-03]: ACTION_LABEL es un mapa central único en lib/crm-timeline (auditoria-client y timeline-entry lo importan); se eliminó el mapa local duplicado de auditoria-client
- [Phase 4/04-03]: Las notas borrables se leen aparte (con id) porque la VIEW crm_timeline no expone el id de cada nota; el filtro de tags del directorio combina tab+query (AND) con filterByTags (OR)
- [Phase ?]: Diálogo de tags compartido (TagManagerDialog) reusado por ficha (business) y pipeline (lead); createTag devuelve id para auto-asignar
- [Phase 4/04-09 — gap test 7]: TagManagerDialog ahora incluye sección "Asignadas" con quitar directo (removeTag, riesgo bajo, afordance sin ConfirmDialog) para AMBOS entityType; el pipeline (lead) gana el surface de quitar que no tenía. La fila de chips removable + ConfirmDialog de la ficha (business, test 13) queda INTACTA como surface adicional. removeTag revalida requireAdmin()+zod server-side (T-04-16 mitigado)
- [Phase 5/05-02]: RSC /admin/reportes con split de lectura: deals/audit_log/mrr_snapshots con createClient() (session, hereda RLS admin-read; service-role bypassaría la policy — lección T-04-10); businesses (sin policy is_admin) + getPlanPrices con createAdminClient() solo tras el guard del layout. Solo agregados cruzan al client; el admin client y las filas crudas nunca salen del server (T-05-05). Cross-tenant POR DISEÑO (D-10): aislamiento is_admin, NO business_id; ninguna query filtra por tenant (T-05-08 aceptado)
- [Phase 5/05-02]: Primeros charts recharts del repo en reportes-client ('use client'): ResponsiveContainer en padre con altura fija (h-72), tooltips custom dark tipados con tokens CSS (var(--card)/--border/--foreground), colores de series desde var(--...) y STAGES[].color (cero hex hardcodeado). Empty-states honestos: churn = cuenta de bajas + "— sin historia suficiente" si pct null (jamás NaN%); "Ingresos del mes" = proxy recurrente NO "cobrado" (D-03); sin botón Exportar muerto (D-08). Cero deps nuevas (recharts ^3.8.1 ya instalado, D-09)
- [Phase 5/05-02 — follow-up]: nav item "Reportes" del sidebar CRM estaba como placeholder PRONTO (href '#') pese a que el plan lo asumía habilitado; se habilitó a /admin/reportes durante la QA visual (commit 9ac6659). QA visual aprobada contra crm-design/06-reportes.png con los diffs esperados LOCKED

### Pending Todos

- [Diseño]: Comportamientos del prototipo a PRESERVAR en build (brief §11): banner impersonación + salir; type-to-confirm escalonado; estados de bandeja IA/Vos/Sin asignar + "Tomar conversación"; auditoría con columnas Motivo y Riesgo.
- [Fix de diseño]: Add-on es "Recordatorios WhatsApp", NO "SMS" (el mock los mezcla) — unificar a WhatsApp.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260625-jqy | Fix borrado/desactivación de locales y servicios + editar servicios | 2026-06-25 | 294ff5f | [260625-jqy-fix-borrado-y-desactivacion-de-locales-y](../../quick/260625-jqy-fix-borrado-y-desactivacion-de-locales-y/) |

### Blockers/Concerns

Unknowns técnicos del brief §9 (no bloquean diseño/roadmap; sí el build de las fases que los tocan):

- [Comms — §9.1, Phase 6]: Stack del agente de WhatsApp sin definir (¿existe? ¿Cloud API + LLM?). Resolver en plan-phase de Phase 6. NOTA: MEMORY indica que el agente ya existe (Baileys, VPS, SQLite) y Forjo solo expone GET /api/agent/context; sync a Supabase es opcional — confirmar en plan-phase.
- [Comms — §9.2, Phase 6]: Mail entrante (two-way). Resend hoy es solo saliente/transaccional; una bandeja que RECIBE necesita infra de inbound (otro servicio/dominio).
- [Métricas — §9.3, Phase 5]: Datos para MRR/pagos fallidos dependen de precios editables (A6 / ADM-05) + persistir monto/estado de cada suscripción. Confirmar qué expone MercadoPago y qué se persiste. Por eso Phase 5 depende de Phase 2 (precios) y Phase 4 (etapas de pipeline para conversión).
- [Impersonación — §7/§11.1 CRÍTICO, Phase 3]: Read-only debe ser garantía SERVER-SIDE real (ningún write bajo sesión impersonada); UI deshabilitada es solo refuerzo. En vertical salud son datos de salud de pacientes (categoría especial, peso legal) — revisar base legal/consentimiento antes de habilitar.
- [is_admin — §7, Phase 1/Out of scope]: Otorgar `is_admin` son "las llaves del reino" — no self-serve desde el panel; barrera extra o fuera del panel. La acción de otorgar is_admin se audita (FND-02) aunque no sea self-serve.
- [Phase 2/02-01 — BLOCKING ACTIVO]: Aplicar a mano `supabase/migrations/032_crm_admin.sql` al Postgres del proyecto (SQL Editor o `supabase db push`, en orden — última aplicada: 031). Verificar 3 filas en plan_prices + 2 columnas has_web_custom/has_whatsapp en businesses. Sin esto, las pantallas de Phase 2 no tienen datos live (getPlanPrices cae a fallback). Resume-signal: "aplicada".
- [Phase 4/04-01 — RESUELTO 2026-06-21]: Migración 034 (6 tablas CRM admin-only + VIEW crm_timeline security_invoker) APLICADA a mano por el operador (resume-signal "aplicada"). Las tablas y la VIEW existen en Supabase. Pendiente operativo NO bloqueante: regenerar `supabase/schema.sql` con `supabase db dump`.
- [Phase 5/05-01 — RESUELTO 2026-06-23]: Migración 036 (tabla `mrr_snapshots` + RLS admin-read single SELECT policy, sin write + seed mes actual) APLICADA a mano por el operador (resume-signal "aplicada"). Verificado: tabla con esquema correcto, RLS con UNA policy "admin read mrr_snapshots" (sin insert/update/delete), seed presente (2026-06-01, basic, mrr 16000, active_count 1). Pendiente operativo NO bloqueante: regenerar `supabase/schema.sql` con `supabase db dump`.
- [Phase 6/06-01 — RESUELTO 2026-06-24]: Migración 038 (tablas `conversations`/`messages` + RLS MIXTA owner-OR-admin + índices de idempotencia) APLICADA a mano por el operador (resume-signal "aplicada"). Verificado: ambas tablas con RLS habilitada, EXACTAMENTE 2 SELECT policies por tabla (owner read + admin read), 0 write policies; índices UNIQUE `conversations(business_id,channel,contact_phone)` y `messages(external_id)` presentes. Pendiente operativo NO bloqueante: regenerar `supabase/schema.sql` con `supabase db dump`.

## Session Continuity

Last session: 2026-06-24T20:15:00.000Z
Stopped at: Phase 6 COMPLETE — 06-02 (bandeja UI) cerrado, QA visual aprobada
Resume file: None (milestone v0.11 con las 6 fases completas)

## Deferred Items

Ítems reconocidos y diferidos al cierre del milestone v0.11 (2026-06-25). Son **statuses de artefacto sin finalizar**, no gaps funcionales: el trabajo está hecho, verificado en sesión (QA visual aprobada), SECURED y deployado (CI verde en `9c084cb`).

| Categoría | Ítem | Status | Nota |
|-----------|------|--------|------|
| uat | Phase 04 (pipeline-tags-timeline) | diagnosed · 0 pendientes | UAT completado y aprobado en sesión; el frontmatter quedó en "diagnosed" sin actualizar a "resolved" |
| verification | Phase 01 (cimientos-auditoría) | human_needed | Verificado en prod (UAT 4/4) en su momento; el verifier no actualizó el status |
| verification | Phase 06 (comms-bandeja) | human_needed | QA visual de /admin/bandeja aprobada; los ítems runtime restantes dependen del bot de WhatsApp aún no conectado (pendiente `FORJO_AGENT_TOKEN` en Vercel) |

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone

## Performance Metrics

| Phase | Plan | Duration | Notes |
|-------|------|----------|-------|
| Phase 01 P01 | 12 min | 3 tasks | 4 files |
| Phase 01-cimientos-auditor-a P02 | ~2 min | 3 tasks | 5 files |
| Phase 01 P04 | 4min | 2 tasks | 4 files |
| Phase 01 P03 | 12min | 2 tasks | 7 files |
| Phase 02 P01 | ~4min | 3/4 tasks (pausado en checkpoint) | 7 files |
| Phase 02 P02 | ~4min | 3 tasks | 6 files |
| Phase 02 P03 | ~9min | 3 tasks | 7 files |
| Phase 02 P04 | ~6min | 3 tasks | 7 files |
| Phase 03 P01 | ~24min | 3 tasks | 8 files |
| Phase 03 P02 | checkpoint+fix | 3 tasks (T3 humano aprobado) | 7 files |
| Phase 04 P01 | ~18min | 5 tasks (4 auto + 1 checkpoint blocking resuelto) | 10 files |
| Phase 04 P03 | ~10min | 3 tasks | 7 files |
| Phase 04 P04-08 | 25m | 3 tasks | 6 files |
| Phase 04 P09 | ~10m | 1 task (gap test 7) | 1 file |
| Phase 05 P01 | ~14min | 2 auto + 1 checkpoint humano resuelto | 4 files |
| Phase 05 P02 | ~57min (incl. QA visual) | 2 auto + 1 checkpoint humano resuelto + 1 follow-up | 3 files |
| Phase 06 P01 | (06-01) | endpoints agente + migr.038 + libs puras + takeover auditado | 6 files |
| Phase 06 P02 | continuation (incl. QA visual) | 2 auto + 1 checkpoint humano aprobado | 3 files |
