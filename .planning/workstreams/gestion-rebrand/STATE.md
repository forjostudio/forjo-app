---
gsd_state_version: 1.0
milestone: v0.15
milestone_name: milestone
current_phase: 03
current_plan: 2
status: executing
stopped_at: Completed 03-01-PLAN.md
last_updated: "2026-07-06T21:30:03.022Z"
last_activity: 2026-07-06 -- Completed 03-01 (import CSV — lógica pura + papaparse)
progress:
  total_phases: 3
  completed_phases: 2
  total_plans: 9
  completed_plans: 8
  percent: 67
---

# Project State

## Project Reference

**Milestone:** v0.15 Gestión rebrand (reorg de IA + features CRUD, behavior-frozen)
**Core value:** un negocio NUNCA lee ni modifica datos de otro (aislamiento por tenant);
en este milestone el riesgo dominante es la **regresión** (no romper comportamiento/rutas),
salvo DATA-03 (import CSV) donde el aislamiento vuelve a ser crítico.
**Branch:** `gsd/gestion-rebrand` (desde main, con v0.14 shipeado)

## Current Position

**Status:** Executing Phase 03
**Current Phase:** 03
**Last Activity:** 2026-07-06 -- Completed 03-02 (route handlers preview/confirm del import CSV)
**Last Activity Description:** 03-02 ejecutado: preview (parse+clasificar, no escribe) + confirm (re-parse + batch insert anon+RLS origin='importado'), tsc verde + vitest 20/20

## Progress

**Phases Complete:** 2 / 3
**Current Plan:** 3
**Progreso:** [█████████░] 89%

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

- **[02-03]** Exports CSV (DATA-01/DATA-02): dos route handlers autenticados `GET /api/export/clients` y `GET /api/export/finances` — molde de `appointments/create` (anon+RLS `@/lib/supabase/server`, NUNCA service-role; tenant por `owner_id`, jamás del querystring; `.eq('business_id', business.id)`). Devuelven `Response` crudo `text/csv; charset=utf-8` con `Content-Disposition: attachment`, BOM U+FEFF (secuencia de escape TS `'U+FEFF'`, no glifo pegado) + escaping RFC4180 hand-authored (sin lib CSV, cero deps). Clientes: header contrato round-trip Fase 3 `nombre,telefono,email,origen,notas,obra_social,nro_obra_social`. Finanzas: combina appointments(neq cancelled)+manual_sales(amount*quantity)+expenses, header `fecha,tipo,concepto,monto`; `fixed_expenses` excluidas por diseño (plantillas recurrentes, no movimientos fechados). Botones "Exportar CSV" secundarios (outline): Clientes = `<a download>` con buttonVariants; Finanzas = Button onClick→window.location.href. eslint: 2 errores pre-existentes (set-state-in-effect L347 clients, L283 finances) + 1 warning, 0 nuevos → deferred-items. tsc verde.

- **[01-03]** FAQ/ayuda estática (HELP-01): ruta `/ayuda` = server component sync con `const FAQ: { pregunta, respuesta }[]` (7 preguntas) versionado en git (D-08, sin Supabase/MDX). Disclosure nativo `<details>`/`<summary>` estilado con Tailwind (`group-open:rotate-180`, `[&::-webkit-details-marker]:hidden`) → **cero deps nuevas** (HARD GATE `git diff --stat package.json` vacío; NO shadcn Accordion). Dos accesos (D-07): footer del sidebar (`HelpCircle` + `<Link href=/ayuda>` que cierra el drawer mobile) y link "¿Necesitás ayuda? Ver la guía" en la view `config` de settings-client (gateado con `!isSection`). Behavior-frozen: ningún otro destino del sidebar cambió. Contenido de las 7 respuestas = draft de Claude, el usuario debe revisarlo (D-09). Los 10 errores eslint de `settings-client.tsx` son pre-existentes (mismo conteo en HEAD) → deferred, no tocados.

- **[03-01]** Import CSV — lógica pura (DATA-03). `papaparse@5.5.4` = primera y única dep del milestone (pineada exacta sin caret; npm agrega `^` por default → corregido a mano + `npm install --package-lock-only`). `lib/clients-import.ts` (framework-agnostic, molde `lib/clients-create.ts`): `parseCsv` (papaparse header:true + skipEmptyLines:'greedy' + transformHeader trim/lowercase + BOM stripping + header rígido validado contra `nombre,telefono,email,origen,notas,obra_social,nro_obra_social`), `unescapeFormulaGuard` (quita UN `'` líder solo si el siguiente char ∈ `[=+-@\t\r]` = mismo conjunto que el `esc()` del export invertido → round-trip lossless `=X`→`=X`), `classifyRows` (des-escapa → `validateClientBody` reusado → dedup email-minúsc + tel solo-dígitos vs existentes E intra-CSV, mismo criterio que "Fusionar duplicados" L260-266 → `{importables, errores:[{row:idx+2, error}], duplicadas, total}`; notas truncadas 1000; NO inserta, eso es la Wave 2). `buildClientInsert` parametrizado con `origin: 'manual'|'importado' = 'manual'` (retro-compatible: `clients/create/route.ts` NO se toca). TDD: RED be58292 → GREEN 6d893ec, 20/20 verde en aislamiento + `manual-client` 8/8 sin regresión. FLAKY conocido: la suite full-parallel (`vitest run`, 31 archivos) tira timeouts 5s en tests Supabase-backed por contención → `deferred-items.md` (fix = subir testTimeout/limitar pool, fuera de scope).

- **[03-02]** Route handlers preview/confirm del import (DATA-03). Dos endpoints autenticados que comparten el MISMO pipeline (auth `getUser`→401 · tenant por `owner_id`→404 · upload multipart Next 16 `request.formData()`→`File`→`file.text()` = PRIMER uso de formData en el repo · guards ANTES de parsear: `MAX_BYTES=2MB`→413, extensión `.csv`→400, header rígido→400 `invalid_header`, `>2000` filas→400 `too_many_rows` · `parseCsv`/`classifyRows` de `@/lib/clients-import` · query existentes filtrada por `business_id`), anon+RLS `@/lib/supabase/server` NUNCA service-role. **`preview`** solo cuenta → `{ok,preview:{total,importables,duplicadas,errores}}`, CERO `.insert/.update/.delete` (SC-1, grep verifica). **`confirm`** RE-PARSEA autoritativamente (D-03, no confía en la preview — T-03-07) + batch `.insert(payload).select('id')` con `buildClientInsert(business, fila, 'importado')` (origin forzado server-side, Pitfall 5) → `{ok,resumen:{importados,omitidos,fallidos}}`. Fallo parcial de batch → cuenta no-insertadas en `fallidos` (200 con resumen); solo fallo total inesperado (0 insertadas) → 500 `insert_failed`. Fix de tipado: `insertedCount = inserted?.length ?? 0` resuelto ANTES de ramificar sobre `insertErr` (Supabase narrowea `inserted`→`null` en la rama de error → TS2339). Verify aislado `vitest run test/clients-import.test.ts` 20/20 + tsc verde (suite full sigue con flakiness de infra de 03-01, no relacionada).

**TODOs:**

- Fase 3: ejecutar 03-03 (UI dialog import) — consume `POST /api/import/clients/{preview,confirm}`.

**Blockers:** Ninguno.

## Session Continuity

**Last session:** 2026-07-06T21:33:00.000Z

**Stopped At:** Completed 03-02-PLAN.md
**Resume File:** .planning/workstreams/gestion-rebrand/phases/03-import-de-clientes-csv/03-03-PLAN.md
