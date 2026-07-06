---
gsd_state_version: 1.0
milestone: v0.15
milestone_name: milestone
current_phase: 02
current_plan: 3
status: executing
stopped_at: Completed 02-02-PLAN.md (alta manual + badge de origen)
last_updated: "2026-07-06T12:37:10.168Z"
last_activity: 2026-07-06 -- Completed 02-02 (alta manual de cliente)
progress:
  total_phases: 3
  completed_phases: 1
  total_plans: 6
  completed_plans: 5
  percent: 33
---

# Project State

## Project Reference

**Milestone:** v0.15 Gestión rebrand (reorg de IA + features CRUD, behavior-frozen)
**Core value:** un negocio NUNCA lee ni modifica datos de otro (aislamiento por tenant);
en este milestone el riesgo dominante es la **regresión** (no romper comportamiento/rutas),
salvo DATA-03 (import CSV) donde el aislamiento vuelve a ser crítico.
**Branch:** `gsd/gestion-rebrand` (desde main, con v0.14 shipeado)

## Current Position

**Status:** Executing Phase 02
**Current Phase:** 02
**Last Activity:** 2026-07-06 -- Completed 02-02 (alta manual de cliente)
**Last Activity Description:** 02-02 ejecutado: endpoint POST /api/clients/create (anon+RLS, origin='manual') + Dialog "Nuevo cliente" + badge de origen. Próximo: 02-03 (exports CSV)

## Progress

**Phases Complete:** 1 / 3
**Current Plan:** 3 (Phase 02 · 02-01 y 02-02 hechos)
**Progreso:** [████████░░] 83%

## Roadmap

- Phase 1: Reorg de IA + Ayuda — NAV-01, NAV-02, HELP-01 (UI, behavior-frozen)
- Phase 2: Alta manual + Exports CSV — CLIENT-01, DATA-01, DATA-02 (introduce columna origen, migr. 049)
- Phase 3: Import de clientes CSV — DATA-03 (backend delicado; research a nivel plan-phase)

## Accumulated Context

**Decisiones / notas:**

- Behavior-frozen: la reorg mueve funcionalidad de lugar, no la cambia. Mock aprobado en
  `design_handoff_forjo_rebrand/` (incluye "Mapa de cambios de dónde a dónde" = checklist de migración).

- Próxima migración libre = **049** (045=landing_cms, 047=backfill vertical, 048=app_settings ya tomadas; no renumerar las ajenas). La columna de origen del cliente (Fase 2) es candidata a 049.
- El badge de origen (Fase 2) y el import (Fase 3) comparten la columna de origen → introducirla en Fase 2, consumirla en Fase 3.
- Vertical `canchas` existe (sin profesionales) — la reorg no puede romper el gating/terminología por vertical (`resolveVertical`/`VERTICALS`).

- **[01-01]** Sidebar agrupado data-driven `{ section, keys[] }` dentro de `sidebar.tsx`, filtrado contra `resolveVertical(business).menu`; `lib/verticals.ts` intacto. Estado activo `bg-primary` (NO el del CRM). El link "Ayuda" del footer lo agrega el Plan 01-03, NO el 01-01.
- **[01-01]** Fix pre-existente aplicado en el mismo archivo: `SidebarContent` función → elemento JSX const (react-hooks/static-components) para pasar el gate `npx eslint`; patrón analog de `crm-sidebar.tsx`.
- **[01-02]** Split Negocio/Configuración (NAV-02): la migración = **reasignar qué TabsList/TabsContent muestra cada `view`** en `settings-client.tsx`, NO mover el cuerpo de las tabs (behavior-frozen). `/negocio` = hub de 4 tabs con estado propio `negocioTab` (default `business`); `/settings` reducido a 3 tabs (Apariencia·Seguridad·Suscripción). El único `<Tabs>` con los 7 TabsContent como hijos hace el resto (shadcn muestra solo el que matchea `value`).
- **[01-02]** OAuth de MercadoPago reruteado a `/negocio` (D-06): callback/connect redirigen a `/negocio?mp=...` y el `useEffect` del `?mp=` (gateado por `isNegocio`) setea la tab Integraciones + toast + `replaceState` a `/negocio`. NO se tocó la validación de state/CSRF ni el canje de code.
- **[01-02]** `negocio/page.tsx` ahora pasa `secrets = getBusinessSecrets(business.id)` (service-role, scoped por `owner_id`) al hub para las tabs migradas — mismo patrón que `settings/page.tsx`.
- **[01-02]** eslint del repo (regla estricta `react-hooks/set-state-in-effect`) ya fallaba en `settings-client.tsx` en HEAD (muchos errores pre-existentes: set-state-in-effect, "This value cannot be modified", impure-fn-during-render). Conteo de problemas baseline vs. post-cambio = 20 vs 20: no se introdujo ninguno nuevo. tsc verde.
- **[02-02]** Alta manual de cliente (CLIENT-01): endpoint `POST /api/clients/create` = molde de `appointments/create` (anon+RLS `@/lib/supabase/server`, NUNCA service-role; tenant por `owner_id`). `origin='manual'` y `business_id` se fijan server-side en `buildClientInsert` (`lib/clients-create.ts`, lógica pura compartida con `test/manual-client.test.ts` → misma fuente de verdad testeable sin server). `insurance_*` gateado por `resolveVertical(business).key==='salud'`. Sin dedupe (el alta crea directo). UI: tercer Dialog "Nuevo cliente" espejando delete/merge + botón primary en el header + badge de origen por fila (`ORIGIN_BADGE`: reserva=outline·manual=default·importado=secondary), status dot intacto; escribe por fetch + prepend optimista (SC-1). TDD: RED 9c3e7bc → GREEN 9b41b42 (7/7). eslint del archivo: 2 problemas pre-existentes (set-state-in-effect L347 + TrendingUp unused), 0 nuevos → `deferred-items.md`.

- **[01-03]** FAQ/ayuda estática (HELP-01): ruta `/ayuda` = server component sync con `const FAQ: { pregunta, respuesta }[]` (7 preguntas) versionado en git (D-08, sin Supabase/MDX). Disclosure nativo `<details>`/`<summary>` estilado con Tailwind (`group-open:rotate-180`, `[&::-webkit-details-marker]:hidden`) → **cero deps nuevas** (HARD GATE `git diff --stat package.json` vacío; NO shadcn Accordion). Dos accesos (D-07): footer del sidebar (`HelpCircle` + `<Link href=/ayuda>` que cierra el drawer mobile) y link "¿Necesitás ayuda? Ver la guía" en la view `config` de settings-client (gateado con `!isSection`). Behavior-frozen: ningún otro destino del sidebar cambió. Contenido de las 7 respuestas = draft de Claude, el usuario debe revisarlo (D-09). Los 10 errores eslint de `settings-client.tsx` son pre-existentes (mismo conteo en HEAD) → deferred, no tocados.

**TODOs:**

- Fase 3: research a nivel plan-phase (parseo/validación/dedup/aislamiento del import CSV).

**Blockers:** Ninguno.

## Session Continuity

**Last session:** 2026-07-06T12:18:15.062Z

**Stopped At:** Completed 02-02-PLAN.md (alta manual + badge de origen)
**Resume File:** .planning/workstreams/gestion-rebrand/phases/02-alta-manual-exports-csv/02-03-PLAN.md
