---
phase: 03-import-de-clientes-csv
plan: 02
subsystem: api
tags: [csv, import, multipart, multitenant, rls, route-handler, next16]

# Dependency graph
requires:
  - phase: 03-01 (lógica pura del import)
    provides: "parseCsv / classifyRows de lib/clients-import; buildClientInsert(business, input, 'importado') de lib/clients-create"
provides:
  - "app/api/import/clients/preview/route.ts — POST: upload multipart → parse → clasificar → conteos (NO escribe, SC-1)"
  - "app/api/import/clients/confirm/route.ts — POST: re-upload → RE-PARSE → batch insert anon+RLS origin='importado' → resumen (SC-2/SC-4)"
  - "Contrato de respuesta { ok, preview:{total,importables,duplicadas,errores} } y { ok, resumen:{importados,omitidos,fallidos} } para la UI (Plan 03)"
affects: [03-03 (UI dialog import que consume estos endpoints)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Upload multipart Next 16: request.formData() → File → file.text() (PRIMER uso de formData en el repo)"
    - "Guards de tamaño/extensión/header/filas ANTES de parsear/tocar la DB (fail-fast contra archivo hostil)"
    - "Arquitectura preview→confirm STATELESS: confirm re-recibe el mismo File y re-parsea (sin stash server-side — Vercel Hobby efímero)"

key-files:
  created:
    - app/api/import/clients/preview/route.ts
    - app/api/import/clients/confirm/route.ts
  modified: []

key-decisions:
  - "MAX_BYTES=2MB + MAX_ROWS=2000 como constantes de módulo en ambos handlers (D-04); guards antes de file.text()"
  - "Fallo PARCIAL de batch insert → cuenta las no-insertadas en `fallidos` y devuelve 200 con el resumen; solo un fallo TOTAL inesperado (0 insertadas) → 500 insert_failed"
  - "existingErr (query de existentes) → 400 bad_request en vez de crashear (defensivo)"

patterns-established:
  - "Ambos handlers comparten el MISMO pipeline (auth→tenant→upload→guards→parseCsv→existentes→classifyRows) para que preview y confirm NO diverjan; confirm solo agrega el batch insert"
  - "insertedCount = inserted?.length ?? 0 resuelto ANTES de ramificar sobre insertErr (los tipos de Supabase narrowean `inserted` a null en la rama de error)"

requirements-completed: [DATA-03]

# Metrics
duration: ~12min
completed: 2026-07-06
status: complete
---

# Phase 3 Plan 2: Route handlers preview/confirm del import CSV Summary

**Dos route handlers autenticados del import (D-03): `preview` parsea+valida+deduplica y devuelve conteos SIN escribir nada (SC-1), y `confirm` RE-recibe el mismo archivo, RE-PARSEA (no confía en la preview) e inserta solo las importables con `origin='importado'` forzado server-side vía anon+RLS (SC-2/SC-4) — ambos con business_id de la sesión y guards de tamaño/extensión/header/filas antes de tocar la DB.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-07-06
- **Tasks:** 2
- **Files modified:** 2 (2 creados, 0 modificados)

## Accomplishments
- `app/api/import/clients/preview/route.ts` (NUEVO): molde auth+tenant del alta manual (anon+RLS, negocio por `owner_id`, 401/404) + **upload multipart Next 16** (`request.formData()` → `File` → `file.text()`, primer uso de formData en el repo). Guards ANTES de parsear: `MAX_BYTES=2MB`→413, extensión `.csv`→400, header rígido→400 (`parseCsv`), `>2000` filas→400. Query de existentes filtrada por `business_id` + `classifyRows`. Devuelve `{ ok, preview:{ total, importables, duplicadas, errores } }`. **CERO `.insert()/.update()/.delete()`** (SC-1).
- `app/api/import/clients/confirm/route.ts` (NUEVO): mismo pipeline idéntico + batch insert. **RE-PARSEA autoritativamente** el archivo crudo (D-03, no confía en la preview — T-03-07). `buildClientInsert(business, fila, 'importado')` fuerza `origin='importado'` server-side (Pitfall 5); un solo `.insert(payload)` anon+RLS con `.select('id')`. Fallo de batch → cuenta en `fallidos` (200 con resumen); fallo total inesperado → 500 `insert_failed`. Devuelve `{ ok, resumen:{ importados, omitidos, fallidos } }`.

## Task Commits

Cada tarea commiteada atómicamente (commits normales CON hooks):

1. **Task 1: preview/route.ts (upload+parse+clasificar, no escribe)** — `51ac4dd` (feat)
2. **Task 2: confirm/route.ts (re-parse + batch insert anon+RLS)** — `00c78a6` (feat)

## Files Created/Modified
- `app/api/import/clients/preview/route.ts` (NUEVO) — POST preview: auth→tenant→upload→guards→parseCsv→existentes→classifyRows→conteos. Sin escrituras.
- `app/api/import/clients/confirm/route.ts` (NUEVO) — POST confirm: mismo pipeline + `buildClientInsert(…, 'importado')` + batch `.insert()` anon+RLS + resumen.

## Decisions Made
- **Fallo parcial vs total del batch:** si el `.insert()` batch devuelve error pero insertó ≥1 fila (parcial), se devuelve 200 con el resumen contando las no-insertadas en `fallidos`; solo un fallo total inesperado (0 insertadas) devuelve 500 `insert_failed`. Semántica documentada en el resumen (T-03-09: un fallo de batch no rompe el response).
- **`insertedCount` resuelto antes de ramificar:** los tipos de Supabase narrowean `inserted` a `null` en la rama `if (insertErr)`, lo que hacía `inserted?.length` colapsar a `never` (TS2339). Se calcula `insertedCount = inserted?.length ?? 0` antes del `if` y se usa en ambas ramas.
- **`existingErr` → 400 defensivo:** la query de existentes se chequea; un error no debe crashear el handler ni proceder con un dedup incompleto.

## Deviations from Plan

None - plan ejecutado tal cual. El fix de tipado (`insertedCount` pre-ramificación) es un ajuste de implementación para satisfacer `tsc`, no un cambio de contrato ni de comportamiento observable.

## Issues Encountered
- **Ninguno bloqueante.** `tsc` tiró un TS2339 (`Property 'length' does not exist on type 'never'`) en el manejo del fallo parcial del insert por el narrowing de Supabase; resuelto sacando el conteo fuera del `if`. Se corrió el verify aislado (`npx vitest run test/clients-import.test.ts`) como indica el plan — la suite completa tiene flakiness de infra documentada en 03-01 (no relacionada con estos handlers).

## User Setup Required
None - sin configuración de servicio externo.

## Next Phase Readiness
- Los dos endpoints están listos para la UI (Plan 03): contrato de respuesta exacto según `<interface_context>` (`preview:{total,importables,duplicadas,errores}` / `resumen:{importados,omitidos,fallidos}`, errores snake_case con status 401/404/400/413/500).
- Aislamiento verificado por grep: preview sin `.insert/.update/.delete`, ningún handler importa `supabase/admin`, `business_id` nunca del body/CSV.

## Threat Mitigations Applied
- **T-03-04 (EoP/Tampering, insert del tenant):** `business_id` = `business.id` por `owner_id` de sesión; `buildClientInsert` lo fija; CSV/body nunca lo aportan. anon+RLS `with check` + filtro explícito = defensa en profundidad.
- **T-03-05 (DoS, archivo gigante):** `file.size > MAX_BYTES (2MB)` → 413 ANTES de leer/parsear.
- **T-03-06 (DoS, expansión por filas):** `rows.length > 2000` → 400 `too_many_rows` antes de dedup/insert.
- **T-03-07 (Tampering, preview manipulada):** confirm RE-PARSEA + RE-VALIDA + RE-DEDUP el archivo crudo; recibe el File, no "las filas que vio".
- **T-03-08 (Tampering, header/origen falso):** header rígido en `parseCsv` (invalid_header); columna `origen` del CSV ignorada; `origin='importado'` forzado.
- **T-03-09 (DoS, CSV malformado / batch):** try/catch alrededor de `formData()`; fallo de batch contado en `fallidos`, no rompe el response.
- **T-03-10 (InfoDisclosure/EoP, service-role):** ambos usan `createClient()` anon+RLS (`@/lib/supabase/server`); grep confirma cero `createAdminClient`/`supabase/admin`.

## Self-Check: PASSED

- Archivos: `app/api/import/clients/preview/route.ts`, `app/api/import/clients/confirm/route.ts` — ambos presentes.
- Commits: `51ac4dd`, `00c78a6` — ambos en el árbol.
- Grep de seguridad: preview sin writes reales, sin admin/service-role, `business_id` nunca del body/CSV.
- `tsc --noEmit` verde; `vitest run test/clients-import.test.ts` 20/20.

---
*Phase: 03-import-de-clientes-csv*
*Completed: 2026-07-06*
