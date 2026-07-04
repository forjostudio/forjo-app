# Requirements — v0.14 Onboarding

**Milestone:** v0.14 — Onboarding
**Workstream:** onboarding
**Defined:** 2026-07-02
**Branch:** `gsd/onboarding` (desde main, con v0.13 ya shipeado)

> **Goal:** Que el onboarding traslade correctamente los horarios (reconciliando las dos tablas en
> uso, `business_hours` ↔ `time_blocks`, sin romper landing/agente/panel/booking) y que el flujo de
> alta sea más usable (omitir pasos no obligatorios + repaso general).

## Contexto del bug (verificado 2026-07-02 contra código)

- El paso "Horarios de atención" del onboarding (`app/(onboarding)/onboarding/page.tsx:209`) escribe
  en **`business_hours`**.

- El **panel de agenda** (`app/(dashboard)/agenda/*`) y el **booking público** (`app/[slug]/page.tsx`)
  leen **`time_blocks`** → los horarios del onboarding NO llegan ahí.

- Pero `business_hours` **ya no está huérfana**: la leen la **landing** (`lib/landing/derive.ts`,
  `components/landing/hours.tsx`) y el **agente de WhatsApp** (`lib/agent-context.ts`,
  `app/api/agent/context/route.ts`). → Hay **dos fuentes de horarios divergentes**; la fuente
  canónica se lockea en el discuss/plan de la Phase 1.

## v1 Requirements

### Horarios — reconciliación (SCHED)

- [x] **SCHED-01**: Los horarios que el negocio carga en el onboarding se reflejan en el **panel de
  agenda** y en el **booking público** (los horarios del alta efectivamente se usan para reservar).

- [x] **SCHED-02**: La **landing pública** y el **agente de WhatsApp** muestran los mismos horarios
  que el panel/booking — una sola fuente de verdad, sin divergencia entre `business_hours` y
  `time_blocks` (cero regresión en los lectores actuales).

### Onboarding — UX (ONB)

- [x] **ONB-01**: El usuario puede **omitir** los pasos no obligatorios del onboarding y completarlos
  después desde el panel (botón "Omitir" en los pasos no cruciales).

- [x] **ONB-02**: El flujo de onboarding es claro y sin fricción — labels siempre visibles, feedback
  inmediato, orden lógico de los pasos (repaso general de UX).

## v2 / Future Requirements

Reconocidos pero diferidos — no entran en v0.14.

- **SCHED-DROP-01**: Deprecar/eliminar la tabla perdedora (`business_hours` o `time_blocks`) una vez
  unificada la fuente y migrados todos los lectores — limpieza de esquema (candidata si la Phase 1
  decide mantener ambas tablas de forma transitoria).

- **ONB-PROGRESS-01**: Indicador de "onboarding incompleto" en el panel que recuerde completar los
  pasos omitidos.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Rediseño visual completo del onboarding | El scope es reconciliar horarios + fricción del flujo (omitir/claridad), no un rebrand |
| Nuevos pasos/campos en el onboarding | No se agregan capacidades nuevas al alta; se arregla y pule lo existente |
| Cambios al motor de agenda/booking (time_blocks) más allá de recibir los horarios del onboarding | El motor v0.12 no se re-toca; solo se unifica de dónde salen los horarios |

## Traceability

> Mapeo creado por gsd-roadmapper al crear ROADMAP.md. Cada requirement mapea a exactamente una fase.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHED-01 | Phase 1 | Complete |
| SCHED-02 | Phase 1 | Complete |
| ONB-01 | Phase 2 | Complete |
| ONB-02 | Phase 2 | Complete |
