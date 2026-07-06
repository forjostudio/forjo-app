---
phase: 03-import-de-clientes-csv
plan: 01
subsystem: api
tags: [papaparse, csv, import, multitenant, tdd, vitest]

# Dependency graph
requires:
  - phase: 02 (gestión-rebrand — export + alta manual de clientes)
    provides: "validateClientBody / isValidPhone / buildClientInsert, el esc() + header RFC4180 del export (contrato de round-trip), columna origin (migr.049)"
provides:
  - "papaparse@5.5.4 instalada y pineada (primera dep del milestone)"
  - "lib/clients-import.ts — lógica PURA del import: parseCsv (RFC4180+BOM), unescapeFormulaGuard (round-trip lossless), classifyRows (validación+dedup)"
  - "buildClientInsert parametrizado con origin ('manual'|'importado', default 'manual', retro-compatible)"
  - "test/clients-import.test.ts — 20 casos (round-trip estrella, validación, dedup, insert anon+RLS)"
affects: [03-02 (route handlers preview/confirm), 03-03 (UI dialog import)]

# Tech tracking
tech-stack:
  added: [papaparse@5.5.4, "@types/papaparse@5.5.2"]
  patterns:
    - "Lógica pura framework-agnostic compartida handler+test (molde lib/clients-create.ts)"
    - "unescapeFormulaGuard acoplado al esc() del export (mismo regex invertido) para round-trip lossless"
    - "Dedup reusando el criterio de 'Fusionar duplicados' (email minúsc + tel solo-dígitos)"

key-files:
  created: [lib/clients-import.ts, test/clients-import.test.ts]
  modified: [package.json, package-lock.json, lib/clients-create.ts]

key-decisions:
  - "papaparse pineada SIN caret (5.5.4 exacto) — npm agrega ^ por default, editado a mano para evitar saltos de versión"
  - "origin parametrizado con default 'manual' → clients/create/route.ts NO se toca (cero regresión del alta manual)"
  - "obra_social/nro_obra_social NO se des-escapan (no son campos de fórmula ni contacto); buildClientInsert las gatea por vertical de todos modos"

patterns-established:
  - "unescapeFormulaGuard(v): quita UN ' líder solo si el siguiente char ∈ [=+-@\\t\\r] — mismo conjunto que el esc() del export, invertido"
  - "classifyRows({rows,existing,business}) → {importables, errores:[{row,error}], duplicadas, total}; row = índice+2 (header=fila 1)"

requirements-completed: [DATA-03]

# Metrics
duration: ~10min
completed: 2026-07-06
status: complete
---

# Phase 3 Plan 1: Lógica pura del import CSV Summary

**papaparse instalada + `lib/clients-import.ts` (parseo RFC4180, des-escapado anti-fórmula round-trip lossless, validación por fila reusada y dedup idéntica al panel) + `buildClientInsert` parametrizado con `origin` retro-compatible, todo respaldado por 20 tests.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-07-06T21:10:00Z (aprox)
- **Completed:** 2026-07-06T21:20:21Z
- **Tasks:** 3
- **Files modified:** 5 (2 creados, 3 modificados)

## Accomplishments
- `papaparse@5.5.4` + `@types/papaparse@5.5.2` instaladas y **pineadas exactas** (sin caret) — única dep nueva del milestone (D-05).
- `lib/clients-import.ts` (lógica pura, cero imports React/Next): `parseCsv` (papaparse header:true + BOM stripping + header rígido validado), `unescapeFormulaGuard` (round-trip lossless con el export), `classifyRows` (validación reusando `validateClientBody` + dedup vs DB e intra-CSV con el mismo criterio que "Fusionar duplicados").
- `buildClientInsert` parametrizado con `origin` (default `'manual'`) → habilita `'importado'` sin tocar el alta manual.
- **Test estrella round-trip lossless verde:** `=Ana` → export `esc()` lo prefija a `'=Ana` → `unescapeFormulaGuard` lo devuelve a `=Ana` (no `'=Ana`).

## Task Commits

Cada tarea commiteada atómicamente (commits normales CON hooks):

1. **Task 1: Instalar papaparse** - `0cced7e` (chore)
2. **Task 2: Parametrizar origin en buildClientInsert** - `78ef625` (feat)
3. **Task 3: lib/clients-import.ts + test (TDD)** - `be58292` (test — RED) → `6d893ec` (feat — GREEN)

_TDD: Task 3 tuvo commit RED (test fallando sin el módulo) → GREEN (implementación, 20/20 verde)._

## Files Created/Modified
- `package.json` / `package-lock.json` — papaparse pineada exacta (dependency) + @types/papaparse (devDependency).
- `lib/clients-create.ts` — `buildClientInsert` recibe 3er param `origin: 'manual' | 'importado' = 'manual'`; return usa shorthand `origin`. Comentario de cabecera actualizado.
- `lib/clients-import.ts` (NUEVO) — parseCsv, unescapeFormulaGuard, classifyRows + interfaces RawRow/ImportableRow/ClassifyResult.
- `test/clients-import.test.ts` (NUEVO) — 20 tests: round-trip, parseCsv (BOM/header/columnas extra), classifyRows (validación/dedup/notas), insert real origin=importado via ownerAnon.

## Decisions Made
- **Pin exacto forzado a mano:** `npm install` dejó `^5.5.4`; el plan exige pin exacto (evitar saltos de major) → editado `package.json` a `5.5.4`/`5.5.2` y `npm install --package-lock-only` para sincronizar el lockfile.
- **`obra_social`/`nro_obra_social` sin des-escapar:** no son campos de fórmula ni de dedup; se trim + null-coalesce. `buildClientInsert` ya las gatea por vertical (salud) — sin cambios de contrato.

## Deviations from Plan

None - plan ejecutado tal cual. (El pin exacto a mano no es una desviación: el plan lo exige explícitamente; npm simplemente agrega el caret por default y hubo que corregirlo.)

## Issues Encountered
- **Timeouts flaky en la suite COMPLETA (`npx vitest run`, 31 archivos en paralelo):** varios tests Supabase-backed (`manual-client`, `booking-core`, `canchas-booking`, `concurrency` y el nuevo `clients-import` origin=importado) fallan intermitentemente con `Test timed out in 5000ms` bajo carga paralela contra el Supabase local. **NO es regresión de 03-01:** en aislamiento pasan 28/28 (`clients-import` 20/20 + `manual-client` 8/8), y el conteo de fallas varía entre corridas (2→5), confirmando contención de red, no fallo determinista. El verify del plan (`vitest run test/clients-import.test.ts`) pasa 20/20. Registrado en `deferred-items.md` (SCOPE BOUNDARY — fix candidato: subir `testTimeout` o limitar el pool en `vitest.config.mts`, fuera del alcance de este plan).

## User Setup Required
None - sin configuración de servicio externo.

## Next Phase Readiness
- La capa pura testeable está lista: los dos route handlers de la Wave 2 (03-02 preview/confirm) importan `parseCsv`/`classifyRows` de `@/lib/clients-import` y `buildClientInsert(business, input, 'importado')`.
- El contrato de round-trip con el export está verificado por el test estrella → preview y confirm compartirán la misma fuente de verdad, evitando el bug "preview dice válida / confirm rechaza".
- Blocker menor de infra (flakiness de la suite full-parallel) documentado en deferred-items; no bloquea 03-02.

## Self-Check: PASSED

- Archivos: lib/clients-import.ts, test/clients-import.test.ts, lib/clients-create.ts, package.json — todos presentes.
- Commits: 0cced7e, 78ef625, be58292, 6d893ec — todos en el árbol.

---
*Phase: 03-import-de-clientes-csv*
*Completed: 2026-07-06*
