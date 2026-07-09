---
phase: 14-cms-editor-ui
plan: 02
subsystem: web-builder / CMS editor
status: complete
tags: [cms, editor, landing, sections, reorder, copy-forms, a11y, owner-only]
dependency_graph:
  requires:
    - "app/(dashboard)/web/web-client.tsx (shell — pasa draft + callbacks + datos read-only, Phase 14-01)"
    - "lib/landing/editor-draft.ts (mutadores puros moveSection/toggleSection/setSectionData, Phase 14-01)"
    - "lib/landing/schema.ts (schemas data por-sección: heroData/aboutData/servicesData/galleryData/rsvData/locationData/ctaData)"
    - "lib/landing/derive.ts (groupHoursByDay/DIAS/HOURS_RENDER_ORDER para el panel de horarios read-only)"
  provides:
    - "app/(dashboard)/web/_sections/section-list.tsx (SectionListPanel — impl completa del contrato frozen)"
    - "app/(dashboard)/web/_sections/section-forms.tsx (SectionForm dispatcher + sub-forms + ImageSlot seam)"
    - "lib/landing/editor-draft.ts (normalizeSections — nuevo export puro; move/toggle/setData ahora upsert-safe)"
  affects:
    - "14-03 (implementa image-controls → inyecta imageSlot en SectionForm)"
tech-stack:
  added: []
  patterns:
    - "Panel de set FIJO administrado por flechas (reorder) + toggle (Eye/EyeOff), cero DnD, cero dependencia nueva"
    - "Un form de copy por sección dirigido por el schema `data` de esa sección; listas derivadas read-only con hint"
    - "Costura imageSlot (render-prop): la carga de imágenes (14-03) se inyecta sin acoplar los forms al upload"
    - "normalizeSections idempotente: materializa las 8 secciones fijas on-demand en los mutadores (no en el seed)"
key-files:
  created:
    - "app/(dashboard)/web/_sections/section-forms.tsx"
  modified:
    - "app/(dashboard)/web/_sections/section-list.tsx"
    - "lib/landing/editor-draft.ts"
    - "test/landing-editor-draft.test.ts"
decisions:
  - "normalizeSections vive en editor-draft.ts (no en web-client.tsx, intocable): materializa las 8 secciones fijas dentro de los mutadores + en el panel, sin cambiar el seed ni la firma de props."
  - "Faltantes se materializan ocultas (enabled:false) salvo hero/booking (núcleo, visible): una sección vacía no aparece en el preview hasta que el dueño la prende y la llena."
  - "hours no tiene copy: panel informativo read-only que además previsualiza el horario derivado de time_blocks (mismo agrupado que el renderer)."
  - "map_url valida https onBlur solo como UX; la validación no-bypasseable corre server-side al Guardar (T-14-06, heredado Phase 13)."
metrics:
  duration_min: 22
  completed: 2026-07-09
  tasks: 2
  files: 4
  tests_added: 9
  suite_total: 416
---

# Phase 14 Plan 02: Panel de secciones + forms de copy por sección Summary

Implementación del panel de administración de las 8 secciones fijas (EDIT-03: reorden por flechas + toggle enabled, sin DnD) y de los forms de copy por sección (EDIT-01: edición de textos por los schemas `data`), reemplazando el stub `section-list.tsx` de 14-01 y creando `section-forms.tsx`. Cada mutación pasa por el reducer puro `editor-draft.ts`; el preview del shell reacciona al instante.

## What was built

- **`app/(dashboard)/web/_sections/section-forms.tsx`** (nuevo) — named export `SectionForm`, dispatcher por `section.type`. Un form por sección editando EXACTAMENTE los campos del schema `data` de esa sección: hero (headline/kicker/subhead/cta_label + slot imagen), about (title/body + slot imagen), services (title/subtitle + lista read-only de `services`), gallery (title + slot multi-grid), location (title, map_url con validación https onBlur, show_address toggle + lista read-only de `locations`), hours (panel informativo read-only + preview del horario derivado de `time_blocks`), cta (headline), booking (rsvData header/intro + slot multi-grid de la galería RSV). Sub-componentes reutilizables: `TextField`, `UrlField` (error inline onBlur), `ToggleField` (segmentado Sí/No), `ReadonlyPanel` (bg-muted/40 + hint), `ImageSeamFallback`. La costura `imageSlot?` (render-prop `(spec) => ReactNode`) deja el punto de inyección para los controles de imagen de 14-03 sin instanciar upload acá (cero `supabase.storage`).
- **`app/(dashboard)/web/_sections/section-list.tsx`** (reemplaza el stub) — named export `SectionListPanel` con la firma FINAL frozen de 14-01 (sin cambios; web-client.tsx intocado). Lista SIEMPRE las 8 secciones fijas en orden por `order`, sin filtrar enabled. Cada fila (`<li>` en `<ul>`): grip decorativo `GripVertical` (no interactivo), label español disparador del acordeón (Portada/Nosotros/Servicios/Galería/Ubicación/Horarios/Llamado a la acción/Reservas), botones subir/bajar (`ChevronUp`/`ChevronDown`, `variant="ghost"`, `min-h-11 min-w-11`, primera fila up-disabled / última down-disabled con `aria-disabled`), y toggle enabled (`Eye`/`EyeOff`, `aria-pressed`, "on"=accent fill). `booking` locked-on (toggle disabled + hint "Esta sección siempre se muestra"); `hero` togglable. Expand-to-edit inline (una a la vez) monta `SectionForm`. Reorden anunciado a AT via región `aria-live="polite"`.
- **`lib/landing/editor-draft.ts`** (modificado — deviación Rule 2, ver abajo) — nuevo export puro `normalizeSections`: materializa las 8 secciones fijas (faltantes ocultas salvo hero/booking) con `order` contiguo canónico, idempotente sobre un config ya-completo. Los tres mutadores estructurales (`moveSection`/`toggleSection`/`setSectionData`) normalizan primero → togglear/editar/reordenar una sección que el config omitía la crea de verdad.

## Verification

- `npx tsc --noEmit` → exit 0 (sin drift de firma; web-client.tsx compila sin cambios).
- `npx vitest run` (suite completa) → **416/416 verdes** (33 archivos; +9 sobre la baseline de 407).
- `npx vitest run test/landing-editor-draft.test.ts` → 32/32 (23 originales intactos + 9 nuevos de normalize/upsert).
- Grep de aislamiento: `supabase.storage` / `@/lib/supabase` == 0 en `section-forms.tsx` (upload diferido a 14-03).
- Grep anti-DnD: `react-dnd|dnd-kit|react-beautiful-dnd|draggable` == 0 en `_sections/`.
- Acceptance Task 1: 8 filas siempre; up/down disabled en bordes; booking locked-on y hero togglable; controles `<button>` icon-only `min-h-11 min-w-11`; región `aria-live` presente.
- Acceptance Task 2: cada form edita solo los campos del schema `data`; services/locations/hours read-only con hint; `map_url` valida https onBlur; imágenes via `imageSlot`; labels siempre visibles + opcionales marcados.

## Deviations from Plan

### Auto-added critical functionality

**1. [Rule 2 - Missing critical functionality] `normalizeSections` para garantizar las 8 secciones siempre**
- **Found during:** Task 1 (verificación de acceptance "se renderizan exactamente 8 filas siempre").
- **Issue:** El must-have truth #1 y la acceptance exigen que el dueño vea SIEMPRE las 8 secciones fijas, pero los configs reales NO las traen todas: el builder (`lib/landing/builder.ts`) omite las secciones vacías (about/gallery/location/hours/cta), `booking` no vive en el config (la inyecta el render vía `orderedSections`), y el `DEFAULT_LANDING_CONFIG` sembrado trae solo hero+booking. Rendir `draft.sections` mostraría entre 2 y 7 filas, y los mutadores (`moveSection`/`toggleSection`/`setSectionData`) hacían no-op sobre las secciones ausentes → imposible prenderlas/editarlas/reordenarlas. El fix natural (normalizar en el seed) está en `web-client.tsx`, que el plan prohíbe tocar, y la firma de props está frozen.
- **Fix:** Nuevo export puro e idempotente `normalizeSections` en `lib/landing/editor-draft.ts` (una lib, NO el shell prohibido): materializa las faltantes (ocultas salvo hero/booking) con `order` contiguo canónico. Los tres mutadores estructurales normalizan primero → togglear/editar/reordenar una sección ausente la crea. El panel renderiza `normalizeSections(draft).sections`. Como normalize es idempotente sobre un config ya-8 (el fixture de los tests de 14-01), los 23 tests originales quedan intactos.
- **Files modified:** `lib/landing/editor-draft.ts`, `app/(dashboard)/web/_sections/section-list.tsx`, `test/landing-editor-draft.test.ts` (+9 tests).
- **Commit:** 75c9774

Boundaries respetadas: `web-client.tsx` y `page.tsx` intocados; firma de props de `SectionListPanel` sin cambios; cero dependencia nueva.

## Notes for downstream plans

- **14-03** implementa los controles de imagen. Inyectar el render-prop `imageSlot` de `SectionForm` (`(spec: { field, kind: 'single'|'multi', label }) => ReactNode`) desde el panel/shell para montar el upload real; sin él, cada campo de imagen rinde `ImageSeamFallback`. Los `field` ya están cableados: `hero.image`, `about.image`, `gallery.images`, `rsvData.images` (kind `single`/`multi`).
- El saved config ahora puede incluir hasta 8 secciones (algunas `enabled:false` vacías) tras la primera edición; el renderer las oculta con sus predicados (`shouldHide*`) + `orderedSections`, así que el render público sigue byte-idéntico para las secciones vacías/ocultas.

## Threat surface scan

Sin superficie nueva fuera del `<threat_model>` del plan. `map_url`/campos URL: validación UX onBlur (client) + validación no-bypasseable server-side al Guardar (T-14-06, heredado Phase 13). Listas read-only de services/locations: datos del propio negocio ya fetcheados con `.eq('business_id', business.id)` (T-14-08 accept). Cero upload/red acá (14-03). Cero dependencia nueva (T-14-SC accept).

## Self-Check: PASSED

Archivos verificados en disco. Commits verificados en `git log`:
- dded275 — feat forms de copy por sección
- 623f27b — feat panel de secciones (reorder + toggle)
- 75c9774 — fix normalizeSections (8 secciones siempre) + tests
