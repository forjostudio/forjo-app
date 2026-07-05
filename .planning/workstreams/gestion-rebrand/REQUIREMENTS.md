# Requirements — v0.15 Gestión rebrand

**Milestone:** v0.15 — Gestión rebrand (reorg de IA + features, behavior-frozen)
**Workstream:** gestion-rebrand
**Defined:** 2026-07-04
**Branch:** `gsd/gestion-rebrand` (desde main c1d31d1, con v0.14 ya shipeado)

> **Goal:** Reorganizar la información de la app Gestión (sidebar agrupado + split Negocio/Configuración)
> y sumar features acotadas SIN dependencia del agente WhatsApp, manteniendo el comportamiento
> existente intacto (behavior-frozen). El diseño ya está aprobado (mock en `design_handoff_forjo_rebrand/`)
> → re-implementar nativo. Rutas viejas redirigen a la nueva ubicación.

## Contexto

- El diseño aprobado incluye un "Mapa de cambios de dónde a dónde" que sirve de checklist de migración.
- **Behavior-frozen:** la reorg mueve funcionalidad de lugar (componentes/rutas), no la cambia.
- **Import = backend delicado** (parsear, validar, deduplicar, aislamiento por tenant). Export = simple.
- Migraciones: continuar desde **049** (047=backfill vertical, 048=app_settings/kill-app, 045=landing_cms ya en main; no renumerar las ajenas).

## v1 Requirements

### Navegación / Arquitectura de información (NAV)

- [ ] **NAV-01**: El sidebar se agrupa en secciones (PANEL · AGENDA · GESTIÓN · REPORTES · AJUSTES) en
  vez de lista plana, sin cambiar el comportamiento de cada item (behavior-frozen).

- [ ] **NAV-02**: "Negocio" pasa a ser un hub con tabs (Datos del negocio · Cobros · Integraciones ·
  Notificaciones/Mails) y "Configuración" queda para app/cuenta (Apariencia · Seguridad · Suscripción).
  Las rutas viejas redirigen a la nueva ubicación sin romper el flujo existente.

### Datos — Export / Import CSV (DATA)

- [ ] **DATA-01**: El dueño exporta su lista de **clientes** a CSV.

- [ ] **DATA-02**: El dueño exporta sus **finanzas** (movimientos/cashflow) a CSV.

- [ ] **DATA-03**: El dueño **importa clientes** desde un CSV con flujo upload → preview/validación →
  confirmar, deduplicando y respetando el aislamiento por tenant (RLS + `business_id`).

### Clientes (CLIENT)

- [ ] **CLIENT-01**: El dueño da de alta un cliente/paciente **manualmente** (que no vino por reserva),
  y cada cliente muestra un **badge de origen** (Reserva · Manual · Importado).

### Ayuda (HELP)

- [ ] **HELP-01**: La app ofrece una **FAQ/ayuda estática** (cómo usar Forjo Gestión), accesible desde
  Configuración o el footer. Sin relación con el agente.

## v2 / Future Requirements

Reconocidos pero diferidos — no entran en v0.15 (dependen del add-on del agente WhatsApp).

- **MSG-01**: Bandeja de Mensajes por negocio (conversaciones de WhatsApp del negocio con sus clientes,
  vía el agente), gated por el add-on. Reusa la familia de componente de la Bandeja del CRM (v0.11).

- **MSG-FAQ-01**: FAQ-base-de-conocimiento del agente (el dueño carga Q&A y el agente las usa para
  responderle a sus clientes), atada al add-on, cerca de Mensajes.

- **NAV-MSG-01**: Grupo MENSAJES en el sidebar, visible solo con el add-on (+ pantalla de upsell).

## Out of Scope

| Feature | Reason |
|---------|--------|
| Rediseño visual de las 11 pantallas | Behavior-frozen: la reorg mueve funcionalidad, no rediseña; el diseño aprobado es "solo lo que cambia" |
| Import de turnos / finanzas | El import se acota a clientes (el punto delicado); export sí cubre clientes + finanzas |
| Cambios al motor de agenda/booking | El motor no se re-toca; este milestone es reorg + features CRUD |
| Bandeja de Mensajes / FAQ del agente | Dependen del add-on del agente → milestone aparte (ver v2) |

## Traceability

> Mapeo creado por gsd-roadmapper al crear ROADMAP.md. Cada requirement mapea a exactamente una fase.

| Requirement | Phase | Status |
|-------------|-------|--------|
| NAV-01 | Phase 1 | Pending |
| NAV-02 | Phase 1 | Pending |
| HELP-01 | Phase 1 | Pending |
| CLIENT-01 | Phase 2 | Pending |
| DATA-01 | Phase 2 | Pending |
| DATA-02 | Phase 2 | Pending |
| DATA-03 | Phase 3 | Pending |
