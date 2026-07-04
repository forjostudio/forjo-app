# Roadmap: Forjo App — Onboarding (v0.14)

> Workstream `onboarding`. Numeración de fases reiniciada en Phase 1 (workstream nuevo). PROJECT.md compartido en `.planning/PROJECT.md`; requirements en `.planning/workstreams/onboarding/REQUIREMENTS.md`. Scopear comandos GSD con `--ws onboarding`.

## Overview

Este milestone cierra dos brechas del alta de negocios que hoy generan fricción y datos divergentes. No agrega features al onboarding: **arregla y pule lo que ya existe**.

La primera brecha es de **datos**: el paso "Horarios de atención" del onboarding escribe en `business_hours`, pero el **panel de agenda** y el **booking público** leen `time_blocks` — así que los horarios que carga el negocio en el alta NO llegan a donde se reserva. Y `business_hours` ya no está huérfana: hoy la leen la **landing pública** (`lib/landing/derive.ts`, `components/landing/hours.tsx`) y el **agente de WhatsApp** (`lib/agent-context.ts`, `app/api/agent/context/route.ts`). Hay dos fuentes de horarios divergentes. Phase 1 unifica esa fuente sin romper a ninguno de los cuatro lectores actuales (panel, booking, landing, agente). El riesgo dominante acá NO es aislamiento (los horarios ya viven bajo `business_id`), sino **regresión**: no romper lo que hoy funciona.

La segunda brecha es de **UX**: el flujo de alta obliga a completar pasos que el negocio quizás quiera dejar para después, y tiene fricciones de presentación (labels, feedback, orden). Phase 2 agrega un botón "Omitir" en los pasos no obligatorios (completables luego desde el panel) y hace un repaso general del flujo, sin rediseño visual completo ni pasos/campos nuevos.

El faseo va datos → UX: primero se unifica de dónde salen los horarios (Phase 1), y recién sobre esa base se pule el flujo de alta (Phase 2), porque el rework de UX del paso de horarios se apoya en que la fuente ya esté reconciliada.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (1.1, 1.2): Urgent insertions (marked with INSERTED)

Faseo: reconciliación de horarios → rework UX del onboarding (los datos se unifican antes de pulir el flujo que los carga).

- [x] **Phase 1: Reconciliación de horarios** - Unificar la fuente de horarios para que lo que se carga en el onboarding llegue al panel de agenda + booking público, y que landing + agente de WhatsApp muestren lo mismo (sin divergencia `business_hours` ↔ `time_blocks`) (completed 2026-07-03)
- [x] **Phase 2: Rework UX del onboarding** - Botón "Omitir" en los pasos no obligatorios (completar después desde el panel) + repaso general del flujo (labels visibles, feedback inmediato, orden lógico) (completed 2026-07-04)
- [x] **Phase 3: Rework del selector de rubro** - Reducir a 4 rubros (Salud, Belleza/Estética/Spa, General, Canchas) + campo personalizable siempre visible con sugerencia por rubro y leyenda "Así aparecerá en tu página de reservas", aplicado en el onboarding y en la configuración del dashboard (completed 2026-07-04)

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

**Plans**: 3/3 plans complete

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Onboarding escribe `time_blocks` (con horario partido) en vez de `business_hours` (SCHED-01) · wave 1
- [x] 01-02-PLAN.md — Agente de WhatsApp lee `time_blocks` (único lector vivo restante; la landing ya migró en web-builder) (SCHED-02) · wave 1

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-03-PLAN.md — DROP `business_hours` (migr. 045) + regenerar schema.sql + quitar tipo `BusinessHour` (SCHED-02 / SCHED-DROP-01 folded) · wave 2, aplicación a prod MANUAL

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

**Plans**: 1/1 plans complete

Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Rework UX del onboarding: "Omitir por ahora" en pasos opcionales + stepper dinámico (canchas) + header fijo de Servicios + validación inline onBlur + precio 0 (ONB-01, ONB-02) · wave 1

**UI hint**: yes

**Phase-level decision (defer to discuss-phase)**: **qué pasos son "no obligatorios" (omitibles) y cuáles no.** Definir en discuss-phase el set exacto de pasos que llevan botón "Omitir" vs. los obligatorios, y **cómo se representa un paso omitido** para que el panel sepa que quedó pendiente (marcar el paso como incompleto vs. simplemente dejar el dato vacío). El indicador de "onboarding incompleto" en el panel que recuerde completar los pasos omitidos queda diferido (ONB-PROGRESS-01, v2), así que en v0.14 alcanza con que el dato quede completable desde el panel, sin un recordatorio dedicado.

**Security/Integrity relevance**: Bajo (UX). Es rework de presentación/UX sobre pasos existentes del onboarding; no agrega datos de tenant nuevos ni toca el aislamiento. El onboarding escribe sobre el negocio del usuario autenticado (patrón ya vigente); "Omitir" no debilita ninguna validación server-side ni permite escribir sobre otro tenant. El único cuidado de integridad es no permitir omitir un paso que sea prerrequisito real de otro (que el flujo quede en un estado inconsistente); eso se acota al definir el set de pasos obligatorios vs. omitibles en discuss-phase.

### Phase 3: Rework del selector de rubro

**Goal**: Simplificar el selector de rubro a **4 opciones** (Salud, Belleza/Estética/Spa, General, Canchas — los 4 `VerticalKey` que ya existen) y sumar un **campo personalizable siempre visible** (texto libre) que muestra una **sugerencia por rubro** (placeholder tipo "Ej: …") y una **leyenda "Así aparecerá en tu página de reservas"**. El rubro elegido resuelve el vertical (terminología/menú/features); el texto libre es la etiqueta visible del negocio en la **página pública de reservas**. Aplica tanto al **onboarding** (paso "Tu negocio") como a la **configuración del negocio en el dashboard**. Cero regresión en la resolución de vertical de negocios existentes.
**Depends on**: Phase 2
**Requirements**: ONB-RUBRO-01, ONB-RUBRO-02
**Success Criteria** (what must be TRUE):

  1. El usuario ve 4 rubros (Salud, Belleza/Estética/Spa, General, Canchas), elige uno, y **siempre** aparece un campo para personalizar el rubro con una sugerencia acorde ("Ej: …") — sin depender de tocar "Otro" (que hoy además está roto: el campo no aparece).
  2. El texto personalizado se guarda y **aparece en la página pública de reservas** como categoría del negocio ("así aparecerá…"); el rubro elegido define terminología/menú/features (vertical).
  3. El **mismo selector** (4 rubros + campo personalizable) está en la **configuración del negocio en el dashboard**, consistente con el onboarding.
  4. **Cero regresión**: negocios existentes siguen resolviendo su vertical/terminología correctamente (sin migración destructiva); el auto-ocultar Profesionales en canchas (D-03 de Phase 2) sigue funcionando con el nuevo modelo.

**Plans**: 3/3 plans complete

- [x] 03-01-PLAN.md — Migración 047 (backfill vertical) + rework de lib/verticals.ts (label belleza, vaciar types, helpers RUBRO_PLACEHOLDERS/getVerticalLabel, borrar dead code) + test del CASE
- [x] 03-02-PLAN.md — Selector de 4 rubros + campo libre siempre visible en onboarding y settings (re-key auto-hide canchas/canGoNext/hints al vertical elegido)
- [x] 03-03-PLAN.md — Fallback de categoría (getVerticalLabel) en ambos booking clients (genérico + canchas)

**UI hint**: yes

**Phase-level decision (defer to discuss-phase)**:

- **Mapeo de datos:** rubro elegido → columna `vertical`; texto libre → columna `type` (etiqueta visible). Confirmar que `resolveVertical` (ya prefiere `vertical`) y la lógica de canchas del onboarding (hoy keyea `getVerticalKeyByType(type)`) se pasan al **rubro elegido** sin romper negocios existentes (que tienen `type` granular).
- **Sugerencia por IA:** hoy la clasificación elige de `ALL_BUSINESS_TYPES` (lista cerrada de subtipos). Con texto libre cambia de sentido: mantener / adaptar / quitar.
- **¿El campo personalizable es obligatorio u opcional?** Qué se muestra en booking si queda vacío (fallback al label del rubro).
- **Placeholders por rubro** (propuesta del usuario): Salud "Ej: Lic. en Psicología, Kinesiólogo" · Belleza/Estética/Spa "Ej: Barbería, Masajista, Depilación" · General "Ej: Lavaautos, Tatuajes, Fotógrafo" · Canchas "Ej: Canchas de fútbol".

**Security/Integrity relevance**: Bajo-Medio (regresión, no aislamiento). Rubro/`type`/`vertical` ya viven bajo `business_id`; esta fase no agrega aislamiento nuevo. Pero toca el **modelo de resolución de vertical usado en toda la app** (terminología, menú, landing, agente) + la **página pública de reservas**. Riesgo dominante = **regresión** en negocios existentes (mismo cuidado que Phase 1): no cambiar el vertical resuelto de un negocio ya creado. Todo cambio de datos debe ser **aditivo/no destructivo**; el texto libre en `type` expuesto en booking es data pública ya acotada.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Reconciliación de horarios | 3/3 | Complete    | 2026-07-03 |
| 2. Rework UX del onboarding | 1/1 | Complete   | 2026-07-04 |
| 3. Rework del selector de rubro | 3/3 | Complete   | 2026-07-04 |
