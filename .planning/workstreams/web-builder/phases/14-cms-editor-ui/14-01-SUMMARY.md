---
phase: 14-cms-editor-ui
plan: 01
subsystem: web-builder / CMS editor
status: complete
tags: [cms, editor, landing, preview, wysiwyg, owner-only, flag-gated]
dependency_graph:
  requires:
    - "app/(dashboard)/web/_landing-actions.ts (saveLandingConfig — Phase 13)"
    - "components/landing/landing-renderer.tsx (renderer puro de props — v0.10)"
    - "lib/landing/schema.ts (LandingConfig, DEFAULT_LANDING_CONFIG, parseLandingConfig)"
    - "lib/landing/theme.ts (resolveLandingTheme, isSafeColor)"
    - "CMS_ENABLED (env server-only — Phase 13)"
  provides:
    - "app/(dashboard)/web/page.tsx (WebEditorPage — server, flag-gated)"
    - "app/(dashboard)/web/web-client.tsx (WebEditorClient — shell editor+preview)"
    - "lib/landing/editor-draft.ts (mutadores puros del borrador + isDirty)"
    - "app/(dashboard)/web/_sections/section-list.tsx (SectionListPanel — stub props-contract)"
    - "app/(dashboard)/web/_sections/image-controls.tsx (Single/Grid ImageControl — stub props-contract)"
    - "app/(dashboard)/web/_sections/theme-controls.tsx (ThemeControls — stub props-contract)"
  affects:
    - "14-02 (implementa SectionListPanel)"
    - "14-03 (implementa image-controls)"
    - "14-04 (implementa ThemeControls)"
tech-stack:
  added: []
  patterns:
    - "Módulo PURO unit-testeable (espeja lib/landing/derive.ts): mutadores del borrador sin React/Supabase"
    - "Preview WYSIWYG: LandingRenderer (RSC por convención, puro de props) importado directo al boundary 'use client'"
    - "Tema al WRAPPER del preview via data-attributes + --primary inline (nunca al <html>)"
    - "Overwrite-total del config: draft = spread del config cargado, nunca armado desde cero (L5)"
key-files:
  created:
    - "lib/landing/editor-draft.ts"
    - "test/landing-editor-draft.test.ts"
    - "app/(dashboard)/web/page.tsx"
    - "app/(dashboard)/web/web-client.tsx"
    - "app/(dashboard)/web/_sections/section-list.tsx"
    - "app/(dashboard)/web/_sections/image-controls.tsx"
    - "app/(dashboard)/web/_sections/theme-controls.tsx"
  modified: []
decisions:
  - "Confirm-on-exit v1: beforeunload nativo (recarga/cierre) + Dialog controlado; la intercepción de navegación interna del panel se cablea en 14-02 con los enlaces reales (el shell ya expone el estado showExitConfirm)."
  - "El shell pasa a SectionListPanel los 4 datos read-only (services/locations/timeBlocks/business) desde la page, para que 14-02 implemente los paneles derivados sin cambiar la firma."
  - "motion default en el preview: draft.motion ?? 'none' (el config sembrado por DEFAULT no trae motion → estático, byte-idéntico a hoy)."
metrics:
  duration_min: 8
  completed: 2026-07-09
  tasks: 3
  files: 7
  tests_added: 23
  suite_total: 407
---

# Phase 14 Plan 01: CMS editor shell (page + client + draft reducer + stubs) Summary

Shell del editor CMS: ruta server fail-closed por `CMS_ENABLED`, cliente editor con borrador en memoria y preview WYSIWYG en vivo del `LandingRenderer` real dirigido por el draft, save bar integrada a `saveLandingConfig` (overwrite-total, mapeo de 6 errores), confirm-on-exit, empty-state, y los 3 sub-editores expuestos como stubs con su props-contract FINAL.

## What was built

- **`lib/landing/editor-draft.ts`** — módulo PURO (sin React/Supabase, named exports, espeja `derive.ts`): `moveSection` (swap de `order` con la vecina adyacente, no-op en bordes), `toggleSection` (invierte `enabled`, preserva el set fijo de 8), `setSectionData` (merge shallow del `data`, parte del config recibido — L5), `setTheme` (preset + `overrides.{palette,primary}` sin pisar otros overrides; `undefined` borra la clave), `setMotion`, `isDirty` (deep-equal por `JSON.stringify`). Todos devuelven config nuevo, nunca mutan el argumento.
- **`test/landing-editor-draft.test.ts`** — 23 casos: reorder + bordes, toggle, set-data + preservación de theme/motion/otras secciones, set-theme sin pisar overrides, set-motion, isDirty, y pureza (input no mutado) en cada mutador.
- **`app/(dashboard)/web/page.tsx`** — `WebEditorPage` Server Component: `notFound()` como PRIMER paso si `CMS_ENABLED !== 'true'` (antes de client/sesión/fetch); resuelve business por `owner_id` con el session client (sin service-role); server-fetchea los 5 datasets del preview con `.eq('business_id', business.id)` (selects acotados a ExceptionLite/LocationLite); pasa el `landing_config` crudo como `initialConfig`.
- **`app/(dashboard)/web/web-client.tsx`** — `WebEditorClient` (`'use client'`): draft en memoria sembrado con `parseLandingConfig(initialConfig) ?? DEFAULT_LANDING_CONFIG`; preview importando `LandingRenderer` directo con `config={draft}` dentro del wrapper `.frj-site` con tema resuelto por `resolveLandingTheme` (data-attrs + `--primary` inline en el wrapper; overflow del marco en el contenedor EXTERNO, nunca sobre ancestro de `#reservar`); save bar sticky con indicador dirty/clean, `saveLandingConfig(draft)` + mapeo de errores + baseline-on-success, disabled sin cambios o con `uploading>0`; confirm-on-exit (beforeunload + Dialog); empty-state notice cuando `initialConfig` es null; mobile toggle Editar/Vista previa (`min-h-11`).
- **3 stubs en `_sections/`** — `SectionListPanel` (props `{ draft, onMove, onToggle, onSectionDataChange, services, locations, timeBlocks, business }`), `SingleImageControl`/`ImageGridControl` (props `{ businessId, value|values, onChange, onUploadingChange }`), `ThemeControls` (props `{ theme, onChange, motion, onMotionChange }`). Cada uno renderiza UI mínima real y respeta su tipo; su implementación completa llega en 14-02/03/04 sin cambiar la firma.

## Verification

- `npx vitest run test/landing-editor-draft.test.ts` → 23/23 verdes.
- `npx vitest run` (suite completa) → **407/407 verdes** (33 archivos; +23 sobre la baseline).
- `npx tsc --noEmit` → exit 0 (confirma la invariante Focus 1: el árbol del renderer es legal dentro del boundary client).
- Grep de aislamiento: `createAdminClient` / `@/lib/supabase/admin` == 0 en `page.tsx` y `web-client.tsx`.
- `page.tsx`: 5 fetches con `.eq('business_id', business.id)`; `notFound()` antes de `createClient()`/`getUser()`.
- `web-client.tsx`: `import { LandingRenderer }` directo; sin `transform`/`overflow`/`sticky` sobre un ancestro de `#reservar` dentro de `.frj-site` (el `overflow-hidden` va en el marco externo; el `sticky` del save bar y de la columna preview quedan fuera de `.frj-site`).

## Deviations from Plan

Ninguna funcional. Un ajuste de redacción menor:

**1. [Rule 3 - Blocking] Comentario con token `createAdminClient()` reescrito en `page.tsx`**
- **Found during:** Task 2 (verificación de acceptance)
- **Issue:** El acceptance exige grep `createAdminClient`/`@/lib/supabase/admin` == 0 en `page.tsx`; el archivo mencionaba el token en un comentario de intención ("PROHIBIDO createAdminClient()"), lo que hacía que un verificador basado en grep contara 1 falso positivo.
- **Fix:** Reescrito el comentario a "PROHIBIDO el service-role/admin client" — misma semántica, grep ahora == 0.
- **Files modified:** `app/(dashboard)/web/page.tsx`
- **Commit:** f8a3527

## Notes for downstream plans

- **14-02** implementa `SectionListPanel` (8 filas fijas, reorder up/down via `onMove`, toggle `enabled` via `onToggle` con `booking` locked-on, forms de copy por sección via `onSectionDataChange`, paneles read-only de services/locations/hours). El shell ya le pasa los 4 datos read-only; **no cambiar la firma**. También cablea la intercepción de navegación interna → `setShowExitConfirm` (el Dialog ya existe en el shell).
- **14-03** implementa `image-controls` (upload browser-direct a `landing-assets/${businessId}/`, `upsert:false`, nombres únicos; `onUploadingChange(+1/-1)` para bloquear Save; `onChange` escribe la URL pública al draft). El contador `uploading` del shell ya deshabilita Save cuando `>0`.
- **14-04** implementa `ThemeControls` (grillas de swatches espejando `settings-client.tsx`, input de color validado por `isSafeColor`, segmented de motion). `onChange` → `setTheme`; `onMotionChange` → `setMotion` (ya cableados en el shell).

## Self-Check: PASSED

Archivos creados verificados en disco (7/7 FOUND). Commits verificados en `git log`:
- 44fc469 — reducer + tests
- f8a3527 — server page
- 27a268b — cliente editor + stubs
