# Roadmap: Forjo App — Onboarding (v0.14)

> Workstream `onboarding`. Numeración de fases reiniciada en Phase 1 (workstream nuevo). PROJECT.md compartido en `.planning/PROJECT.md`; requirements en `.planning/workstreams/onboarding/REQUIREMENTS.md`. Scopear comandos GSD con `--ws onboarding`.

## Overview

Este milestone cierra dos brechas del alta de negocios que hoy generan fricción y datos divergentes. No agrega features al onboarding: **arregla y pule lo que ya existe**.

La primera brecha es de **datos**: el paso "Horarios de atención" del onboarding escribe en `business_hours`, pero el **panel de agenda** y el **booking público** leen `time_blocks` — así que los horarios que carga el negocio en el alta NO llegan a donde se reserva. Y `business_hours` ya no está huérfana: hoy la leen la **landing pública** (`lib/landing/derive.ts`, `components/landing/hours.tsx`) y el **agente de WhatsApp** (`lib/agent-context.ts`, `app/api/agent/context/route.ts`). Hay dos fuentes de horarios divergentes. Phase 1 unifica esa fuente sin romper a ninguno de los cuatro lectores actuales (panel, booking, landing, agente). El riesgo dominante acá NO es aislamiento (los horarios ya viven bajo `business_id`), sino **regresión**: no romper lo que hoy funciona.

La segunda brecha es de **UX**: el flujo de alta obliga a completar pasos que el negocio quizás quiera dejar para después, y tiene fricciones de presentación (labels, feedback, orden). Phase 2 agrega un botón "Omitir" en los pasos no obligatorios (completables luego desde el panel) y hace un repaso general del flujo, sin rediseño visual completo ni pasos/campos nuevos.

El faseo va datos → UX: primero se unifica de dónde salen los horarios (Phase 1), y recién sobre esa base se pule el flujo de alta (Phase 2), porque el rework de UX del paso de horarios se apoya en que la fuente ya esté reconciliada.

## Phases

**Phase Numbering:**

- Integer phases (1, 2): Planned milestone work
- Decimal phases (1.1, 1.2): Urgent insertions (marked with INSERTED)

Faseo: reconciliación de horarios → rework UX del onboarding (los datos se unifican antes de pulir el flujo que los carga).

- [ ] **Phase 1: Reconciliación de horarios** - Unificar la fuente de horarios para que lo que se carga en el onboarding llegue al panel de agenda + booking público, y que landing + agente de WhatsApp muestren lo mismo (sin divergencia `business_hours` ↔ `time_blocks`)
- [ ] **Phase 2: Rework UX del onboarding** - Botón "Omitir" en los pasos no obligatorios (completar después desde el panel) + repaso general del flujo (labels visibles, feedback inmediato, orden lógico)

## Phase Details

### Phase 1: Reconciliación de horarios

**Goal**: Que los horarios que el negocio carga en el paso "Horarios de atención" del onboarding se reflejen efectivamente en el **panel de agenda** y en el **booking público** (hoy leen `time_blocks`, pero el onboarding escribe `business_hours`), y que la **landing pública** y el **agente de WhatsApp** (hoy lectores de `business_hours`) muestren exactamente los mismos horarios — una sola fuente de verdad, sin divergencia entre las dos tablas y con **cero regresión** en ninguno de los cuatro lectores actuales.
**Depends on**: Nothing (first phase)
**Requirements**: SCHED-01, SCHED-02
**Success Criteria** (what must be TRUE):

  1. Un negocio carga sus horarios en el paso "Horarios de atención" del onboarding y esos horarios aparecen en el **panel de agenda** y se usan efectivamente para reservar en el **booking público** (los horarios del alta llegan a donde se reserva).
  2. La **landing pública** (`components/landing/hours.tsx` vía `lib/landing/derive.ts`) y el **agente de WhatsApp** (`app/api/agent/context/route.ts` vía `lib/agent-context.ts`) muestran los mismos horarios que el panel/booking — cero divergencia entre `business_hours` y `time_blocks`.
  3. Los cuatro lectores actuales (panel de agenda, booking público, landing, agente) siguen funcionando sin regresión: ningún negocio existente pierde ni ve cambiados sus horarios tras la unificación.
  4. Editar los horarios desde el panel de agenda se refleja de forma consistente en todos los lectores (una sola fuente de verdad; no hay que cargarlos dos veces en dos lugares distintos).

**Plans**: TBD

**Phase-level decision (defer to discuss-phase)**: **cuál es la tabla canónica de horarios.** Opciones a evaluar en discuss-phase (NO lockear acá): (a) migrar el onboarding a escribir `time_blocks` (lo que ya leen panel/booking) y migrar los lectores de `business_hours` (landing/agente) a `time_blocks` — `time_blocks` como única fuente; (b) mantener `business_hours` como fuente y hacer que panel/booking la lean; (c) una vista/sincronización que mantenga ambas coherentes de forma transitoria. Evaluar qué **minimiza migración** y **no rompe a los lectores actuales** (panel, booking, landing, agente). La deprecación/eliminación de la tabla perdedora queda diferida (SCHED-DROP-01, v2), así que la opción elegida puede mantener ambas tablas transitoriamente si eso reduce riesgo de regresión.

**Security/Integrity relevance**: Bajo (regresión, no aislamiento). Los horarios son datos por tenant y ya viven bajo `business_id` en ambas tablas — toda query/escritura respeta el aislamiento multi-tenant ya vigente (RLS + filtro `business_id`), y esta fase no lo debilita. El riesgo real es de **regresión**: romper landing/agente/panel/booking que hoy funcionan, o corromper/perder horarios de negocios existentes durante la reconciliación. Si la decisión de fase agrega una migración (nueva `04x+` sobre el baseline v0.13), debe ser aditiva, validada con `supabase db reset` local antes de prod, y no exponer horarios de un tenant a otro ni a `anon` más allá de la vista pública acotada ya vigente (`public_business_hours`).

### Phase 2: Rework UX del onboarding

**Goal**: Reducir la fricción del flujo de alta sobre `app/(onboarding)/onboarding/page.tsx` y sus pasos, con dos cambios acotados: (1) un botón **"Omitir"** en los pasos **no obligatorios**, que deja el paso sin completar y le permite al negocio llegar al dashboard y completarlo después desde el panel; (2) un **repaso general de UX** del flujo existente — labels siempre visibles (no solo placeholders), feedback inmediato en las acciones, y orden lógico de los pasos. Es un rework de presentación/UX sobre pasos ya existentes: NO se agregan pasos ni campos nuevos, NO es un rediseño visual completo, y no introduce datos de tenant nuevos.
**Depends on**: Phase 1
**Requirements**: ONB-01, ONB-02
**Success Criteria** (what must be TRUE):

  1. El usuario ve un botón "Omitir" en los pasos no obligatorios del onboarding, lo usa, y llega al dashboard con esos pasos sin completar (sin quedar trabado en el alta).
  2. Un paso omitido en el alta se puede completar después desde el panel (el negocio no pierde la posibilidad de cargar lo que salteó).
  3. Los pasos obligatorios (los que no se pueden omitir) siguen exigiéndose: el flujo distingue claramente qué es opcional y qué no, y no deja avanzar sin lo crucial.
  4. El flujo se siente más claro y sin fricción: labels siempre visibles, feedback inmediato en las acciones (errores/confirmaciones), y orden lógico de los pasos — sin campos ni pasos nuevos.

**Plans**: TBD
**UI hint**: yes

**Phase-level decision (defer to discuss-phase)**: **qué pasos son "no obligatorios" (omitibles) y cuáles no.** Definir en discuss-phase el set exacto de pasos que llevan botón "Omitir" vs. los obligatorios, y **cómo se representa un paso omitido** para que el panel sepa que quedó pendiente (marcar el paso como incompleto vs. simplemente dejar el dato vacío). El indicador de "onboarding incompleto" en el panel que recuerde completar los pasos omitidos queda diferido (ONB-PROGRESS-01, v2), así que en v0.14 alcanza con que el dato quede completable desde el panel, sin un recordatorio dedicado.

**Security/Integrity relevance**: Bajo (UX). Es rework de presentación/UX sobre pasos existentes del onboarding; no agrega datos de tenant nuevos ni toca el aislamiento. El onboarding escribe sobre el negocio del usuario autenticado (patrón ya vigente); "Omitir" no debilita ninguna validación server-side ni permite escribir sobre otro tenant. El único cuidado de integridad es no permitir omitir un paso que sea prerrequisito real de otro (que el flujo quede en un estado inconsistente); eso se acota al definir el set de pasos obligatorios vs. omitibles en discuss-phase.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Reconciliación de horarios | 0/TBD | Not started | - |
| 2. Rework UX del onboarding | 0/TBD | Not started | - |
