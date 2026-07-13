---
phase: 14-cms-editor-ui
plan: 03
subsystem: web-builder / CMS editor
status: complete
tags: [cms, editor, landing, image-upload, storage, rls, owner-only, security, a11y]
dependency_graph:
  requires:
    - "app/(dashboard)/web/_sections/image-controls.tsx (stub con contrato de props frozen, Phase 14-01)"
    - "app/(dashboard)/web/_sections/section-forms.tsx (costura imageSlot que montará estos controles, Phase 14-02)"
    - "lib/supabase/client.ts (browser session client — cookies del dueño → RLS authenticated)"
    - "supabase/_migrations-archive/030_landing_config_and_storage.sql (bucket landing-assets + RLS owner-write por prefijo {business_id}/)"
  provides:
    - "lib/landing/editor-upload.ts (buildUploadPath + validateImageFile — módulo PURO, la garantía de aislamiento del upload)"
    - "app/(dashboard)/web/_sections/image-controls.tsx (SingleImageControl + ImageGridControl — impl completa del contrato frozen)"
    - "test/landing-editor-upload.test.ts (13 tests del invariante de path + validador)"
  affects:
    - "14-04 (wave 2) — al cablear el imageSlot en web-client (fuera de este plan), montará estos controles"
tech-stack:
  added: []
  patterns:
    - "Upload directo browser→Storage con session client (RLS owner-write por prefijo {business_id}/), NUNCA service-role"
    - "Barrera de aislamiento EXTRAÍDA a módulo puro testeable (buildUploadPath) — verificable sin infra de Storage (Nyquist, igual que theme.ts/derive.ts)"
    - "Sanitización por allowlist [a-z0-9-] del segmento de section → un ../ o / no inyecta subcarpetas ni escapa el prefijo"
    - "getPublicUrl → URL https válida al draft (L4); onChange solo en éxito (en fallo el draft no muta)"
    - "onUploadingChange +1/-1 propaga al shell para deshabilitar Guardar mientras uploading>0 (L9)"
key-files:
  created:
    - "lib/landing/editor-upload.ts"
    - "test/landing-editor-upload.test.ts"
  modified:
    - "app/(dashboard)/web/_sections/image-controls.tsx"
decisions:
  - "Contrato de props del stub CONGELADO (orden del orquestador): SingleImageControl {businessId,value,onChange,onUploadingChange} / ImageGridControl {businessId,values,onChange,onUploadingChange}. El Plan Task 2 mencionaba un prop `section`; se resolvió a favor del contrato frozen y `buildUploadPath` recibe un token de section CONSTANTE interno al control (single='image', grid='gallery'). El path es cosmético; el invariante de aislamiento (primer segmento = businessId) no depende de la section."
  - "businessId se usa VERBATIM como primer segmento (UUID de confianza de la sesión) — no se sanitiza, porque alterarlo rompería el match de la RLS `(storage.foldername(name))[1]`. La section SÍ se sanitiza (dato de presentación)."
  - "Quitar/Reemplazar = config-only (D-02c): tocan la URL en el borrador; el objeto viejo queda huérfano en el bucket (benigno, limpieza diferida)."
  - "web-client.tsx / page.tsx INTOCADOS: el cableado del imageSlot (montar estos controles) queda para 14-04."
metrics:
  duration_min: 12
  completed: 2026-07-09
  tasks: 2
  files: 3
  tests_added: 13
  suite_total: 429
---

# Phase 14 Plan 03: Controles de imagen del editor CMS (EDIT-02) Summary

Upload directo del navegador al bucket `landing-assets/{business_id}/` vía el session Storage client (RLS owner-write, migr. 030) — la única superficie de escritura net-new de la fase y su superficie de seguridad. Se implementaron los dos controles frozen (`SingleImageControl` hero/about, `ImageGridControl` gallery/RSV) reemplazando el stub de 14-01, y se extrajo la construcción del path + la validación de archivo a un módulo PURO testeado (`editor-upload.ts`), que es la garantía verificable del aislamiento sin infra de Storage.

## What was built

- **`lib/landing/editor-upload.ts`** (nuevo, PURO — sin React/Supabase) — `buildUploadPath({ businessId, section, ext })` construye `${businessId}/${sectionToken}-${uuid}.${ext}`: el PRIMER segmento es SIEMPRE el `businessId` de la sesión (verbatim), la `section` se sanitiza por allowlist `[a-z0-9-]` (un `../` o `/` no inyecta subcarpetas), el nombre es único por `crypto.randomUUID()` (upsert:false nunca colisiona), la ext se normaliza a minúsculas con fallback `jpg`. `validateImageFile(file)` reusa verbatim las reglas de settings: `{ ok:false, error:'oversize' }` si >2MB, `'wrong_type'` si el type no está en {jpeg,png,webp}, si no `{ ok:true }`.
- **`test/landing-editor-upload.test.ts`** (nuevo, 13 tests) — espeja `landing-theme.test.ts`: (a) el primer segmento del path es SIEMPRE el businessId (varios ids); (b) una section maliciosa (`../otro-negocio`, `a/b/c`, símbolos) NO escapa el prefijo ni inyecta segmentos (siempre 2 segmentos); (c) ext normalizada / fallback / uuid único; (d) `validateImageFile` acepta jpeg/png/webp ≤2MB y rechaza oversize + tipos fuera del allowlist. Cero creds, environment node.
- **`app/(dashboard)/web/_sections/image-controls.tsx`** (reemplaza el stub) — `SingleImageControl` y `ImageGridControl` con el contrato de props frozen SIN CAMBIOS. Al seleccionar: `validateImageFile` primero (fallo → `toast.error` con copy verbatim de settings, sin entrar en uploading); si valida → `onUploadingChange(+1)`, `createClient()` (browser session — nunca admin/service-role), `buildUploadPath(...)`, `supabase.storage.from('landing-assets').upload(path, file, { upsert:false })`; en error → `toast.error('No se pudo subir la imagen. Probá de nuevo.')`, el draft NO se muta, `onUploadingChange(-1)`; en éxito → `getPublicUrl` y se escribe SOLO esa `publicUrl` (https válido, L4) al draft, `onUploadingChange(-1)`. UI (UI-SPEC §4): single = drop-zone `ImageIcon` cuando vacío / thumbnail `next/image` + Reemplazar + Quitar (destructive) cuando hay valor; grid = `grid grid-cols-3 sm:grid-cols-4 gap-3`, tiles `aspect-square object-cover`, delete por tile (`Trash2`, `min-h-11 min-w-11`, destructive), placeholders con spinner por upload en vuelo, tile "+ Agregar foto" (multi-select). Estados uploading con `Loader2` + interacción deshabilitada + "Subiendo…".

## Verification

- `npx vitest run test/landing-editor-upload.test.ts` → **13/13 verdes** (invariante del path + validador).
- `npx tsc --noEmit` → exit 0 (contrato de props del stub sin drift; web-client.tsx / page.tsx intocados).
- Grep de aislamiento: `createAdminClient|supabase/admin` == 0 en `image-controls.tsx` y `editor-upload.ts`; todo path vía `buildUploadPath` (4 usos), nunca un string a mano con slug/id del cliente.
- Suite completa `npx vitest run` → 424/429 en la corrida paralela; los 5 "fallos" son suites DB-backed (booking-core, isolation, manual-booking, canchas, webhook) que dependen del Supabase LOCAL y son FLAKY bajo contención paralela — **pasan todas al correrse con menos archivos** (verificado: isolation 8/8 sola; booking-core+manual-booking+editor-upload 25/25 juntas). No hay regresión introducida por este plan (archivos puros/client-only, no tocan esas suites).

## Deviations from Plan

### Reconciliación de contrato (orden del orquestador vs. Plan Task 2)

**1. [Rule 3 - Reconciliación] Prop `section` NO agregado a los controles**
- **Found during:** Task 2 (lectura del stub + objetivo del orquestador).
- **Issue:** El Plan Task 2 listaba props `{ businessId, section, value, onChange, onUploadingChange }`, pero el stub frozen de 14-01 y el objetivo explícito del orquestador congelan el contrato a `{ businessId, value|values, onChange, onUploadingChange }` (sin `section`). Además `web-client.tsx` (intocable) aún no cablea el `imageSlot`, así que ningún caller pasa `section`.
- **Fix:** Se mantuvo el contrato frozen. `buildUploadPath` conserva su firma `{ businessId, section, ext }` (con la sanitización testeada), y el control provee un token de `section` CONSTANTE interno (single='image', grid='gallery'). El invariante de aislamiento (primer segmento = businessId) no depende de la section, así que no hay pérdida de seguridad; el path solo pierde el prefijo por-sección (cosmético).
- **Files modified:** app/(dashboard)/web/_sections/image-controls.tsx, lib/landing/editor-upload.ts
- **Commit:** feat(14-03) image controls / feat(14-03) editor-upload

## Known Stubs

Ninguno. Los controles quedan completamente implementados. El único cableado pendiente (montar el `imageSlot` en `web-client.tsx`) está fuera del scope de este plan (web-client intocable) y corresponde a 14-04.

## UAT pendiente (requiere Storage prod-like — Storage LOCAL está OFF)

El upload end-to-end no es testeable con el Supabase LOCAL (Storage OFF, RESEARCH Env Availability). Verificación manual en un entorno prod-like:
1. Subir una imagen al hero → aparece en el preview al instante; en el bucket, el objeto queda bajo `{business_id}/`.
2. Reemplazar → sube un objeto nuevo y actualiza la URL (el viejo queda huérfano, esperado).
3. Quitar → saca la imagen del preview (config-only).
4. Galería/RSV: agregar varias, borrar por tile.
5. Confirmar que durante una subida "Guardar cambios" queda deshabilitado (uploading>0).

## Threat surface

Sin superficie nueva fuera del `<threat_model>` del plan. T-14-09 (path cross-tenant) mitigado por el invariante de `buildUploadPath` + RLS migr.030; T-14-10 (service-role) grep-verificado == 0; T-14-11 (archivo/URL) por `validateImageFile` + `getPublicUrl` + Zod server-side al Guardar; T-14-12 (URL a objeto no subido) por escribir la URL solo tras `upload`+`getPublicUrl` y el gate `uploading>0`.

## Self-Check: PASSED

Todos los archivos declarados existen en disco y los 3 commits de tarea (test/feat/feat) están en el historial.
