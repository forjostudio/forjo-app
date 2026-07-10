---
phase: 14-cms-editor-ui
verified: 2026-07-10T12:57:43Z
status: human_needed
score: 5/5 must-haves verified (roadmap Success Criteria)
behavior_unverified: 0
overrides_applied: 0
gaps: []
human_verification:
  - test: "Subir una imagen (hero/about/gallery/RSV) en un entorno prod-like (Storage local está OFF) y confirmar que el objeto queda bajo landing-assets/{business_id}/, que 'Reemplazar' sube un objeto nuevo y actualiza la URL, y que 'Quitar' la saca del preview."
    expected: "El upload real contra Supabase Storage funciona end-to-end (la lógica está verificada por unit test + code review, pero el round-trip contra Storage no corrió en este entorno)."
    why_human: "El Storage local de Supabase está OFF en este proyecto (documentado en RESEARCH/SUMMARY 14-03); no hay infra para ejecutar el upload real en CI/verificación automatizada."
---

# Phase 14: CMS editor UI Verification Report

**Phase Goal:** El dueño edita toda su landing desde un editor visual en el panel — copy por sección, imágenes (subir/reemplazar/borrar, incluida la galería de la reserva RSV), reorden y on/off del set FIJO de secciones, tema/paleta/primary/motion — con preview antes de persistir. Todo escribe por el path owner-only de la Phase 13 (`saveLandingConfig`). Detrás del flag `CMS_ENABLED`, sin exposición en nav, sin publish/go-live.

**Verified:** 2026-07-10T12:57:43Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth (Roadmap SC) | Status | Evidence |
|---|---|---|---|
| SC1 | El dueño edita los textos/copy de cada sección (Hero, About, CTA, etc.) desde el editor y ve el cambio reflejado. | ✓ VERIFIED | `app/(dashboard)/web/_sections/section-forms.tsx:228-437` — `SectionForm` dispatches on `section.type` with one form per section, editing exactly the `data` schema fields (hero: headline/kicker/subhead/cta_label; about: title/body; services: title/subtitle + read-only list; gallery: title; location: title/map_url/show_address + read-only list; hours: read-only panel from `time_blocks`; cta: headline; booking: rsvData header/intro). Every `onChange` calls `onDataChange({...})` (lines 239, 246, 252, 258, 272, 279, 293, 299, 326, 341, 346, 351, 405, 421, 428) → `section-list.tsx:189` `onDataChange={(partial) => onSectionDataChange(s.type, partial)}` → `web-client.tsx:123-127` `onSectionDataChange` calls `setSectionData` (pure reducer, `lib/landing/editor-draft.ts:107-119`, shallow-merges into the loaded config, never rebuilt from scratch — L5 landmine closed) → draft state update → live preview re-render via `LandingRenderer` (`web-client.tsx:195-203`). Covered by `test/landing-editor-draft.test.ts` (part of 77/77 passing). |
| SC2 | El dueño sube, reemplaza y borra imágenes por sección — incluida la galería RSV — re-hosteadas en `landing-assets` namespaced por `business_id` (nunca fuera de su prefijo). | ✓ VERIFIED | **Wiring confirmed real, not the placeholder.** `section-list.tsx:195-216` builds `imageSlot` and mounts `SingleImageControl`/`ImageGridControl` (`app/(dashboard)/web/_sections/image-controls.tsx`) for every `renderImage(imageSlot, spec)` call in `section-forms.tsx` (hero.image single, about.image single, gallery.images multi, rsvData.images multi at line 430 — RSV gallery included). This wiring was closed in commit `feee1fb` (`fix(14): cablear imageSlot + señal de uploading`), which also wires `onUploadingChange` through `SectionListPanelProps` (`section-list.tsx:60`) into `web-client.tsx:270` → the `uploading` counter (`web-client.tsx:103,138-140`) that gates the Save button (`web-client.tsx:298`, `disabled={saving \|\| !dirty \|\| uploading > 0}`). Path isolation: `lib/landing/editor-upload.ts:46-60` `buildUploadPath` ALWAYS prefixes the path with the caller-supplied `businessId` verbatim (never sanitized/derivable from client input beyond the session-resolved `business.id` passed from `page.tsx`/`web-client.tsx`/`section-list.tsx`), and sanitizes `section` to `[a-z0-9-]` so a hostile value like `../otro-negocio` cannot escape the prefix — covered by `test/landing-editor-upload.test.ts` (part of the 77/77 passing suite). Upload uses `createClient()` (browser session client) — grep confirms zero `createAdminClient`/`@/lib/supabase/admin` anywhere under `app/(dashboard)/web/`. Reemplazar/Quitar are config-only (`image-controls.tsx:162,236-239`) — matches D-02c. |
| SC3 | El dueño reordena y prende/apaga las secciones habilitadas dentro del set FIJO (sin layout libre/DnD). | ✓ VERIFIED | `section-list.tsx:83` renders all 8 `SECTION_TYPES` (via `normalizeSections`, `lib/landing/editor-draft.ts:33-49`, which materializes any section the builder omitted so the panel never shows fewer than 8). ChevronUp/ChevronDown (lines 132-155) call `onMove` → `moveSection` (pure swap of adjacent `order`, no-op at edges — `editor-draft.ts:57-85`); first row's up-button and last row's down-button are `disabled` (`isFirst`/`isLast`, lines 136,149). Toggle (Eye/EyeOff, lines 158-176) calls `onToggle` → `toggleSection` (`editor-draft.ts:90-98`), and `booking` is `LOCKED_ON` (line 47/162) — pinned visible, disabled. No drag-and-drop dependency imported anywhere in the phase's files (grep clean). |
| SC4 | El dueño elige preset de tema y ajusta paleta/color primario y `motion` dentro del set permitido, viendo el resultado aplicado. | ✓ VERIFIED | `theme-controls.tsx` implements preset grid (`THEMES.map`, lines 100-133, `selectPreset` at line 85-87 resets palette to `THEME_DEFAULT_PAL[preset]`), palette grid scoped to the active preset (`THEME_PALETTES[activePreset]`, lines 144-175), and a native `<input type="color">` + hex text field validated by `isSafeColor` (lines 63-81) — an invalid hex sets `hexError` and never calls `onChange`, so it is never persisted. Motion is a 3-way segmented control (`role="group"`, lines 208-229) calling `onMotionChange`. All writes flow through `onChange`/`onMotionChange` → `web-client.tsx:128-136` → `setTheme`/`setMotion` (`editor-draft.ts:127-156`), which write to `config.theme.{preset,overrides.palette,overrides.primary}` and `config.motion` — grep confirms zero references to `businesses.theme/palette/font` or `.from('businesses')` in `theme-controls.tsx`. Active-preset match uses `normalizeTheme` (line 47) so a null-seeded config (`preset: 'default'`) highlights Forjo — covered by the +5 test cases added to `test/landing-theme.test.ts` (part of the 77/77 passing suite). The preview wrapper recomputes `resolveLandingTheme` live (`web-client.tsx:173-193`). |
| SC5 | El dueño ve un preview de su landing con los cambios (WYSIWYG o lado a lado) antes de persistir por el path owner-only. | ✓ VERIFIED | `web-client.tsx:195-203` renders the REAL `LandingRenderer` client-side with `config={draft}` (not a diff/mock) inside `.frj-site`, themed via `resolveLandingTheme` applied to the wrapper only (never `<html>`, preserving the panel chrome). Every mutation above flows into `draft` and re-renders synchronously — no persistence until Save. `handleSave` (`web-client.tsx:143-155`) builds the FULL draft object and calls `saveLandingConfig(draft)` (`_landing-actions.ts:35`, Phase 13's owner-only overwrite-total path: session client only, `business_id` resolved server-side from the session — never client-supplied, Zod `parseLandingConfigForWrite` reject-on-invalid), then maps all 6 documented error codes (`cms_disabled`, `unauthorized`, `no_business`, `invalid_config`, `update_failed`, `server_error`) to toasts via `SAVE_ERROR_COPY` (`web-client.tsx:73-80`). Success sets `savedBaseline = draft`, clearing the dirty flag. |

**Score:** 5/5 roadmap Success Criteria verified.

### Gating / Scope (threat-note + roadmap constraints)

| Constraint | Status | Evidence |
|---|---|---|
| Gated by `CMS_ENABLED`, fail-closed, as the FIRST operation | ✓ VERIFIED | `app/(dashboard)/web/page.tsx:25,29` — `const CMS_ENABLED = process.env.CMS_ENABLED === 'true'` read at module scope; `if (!CMS_ENABLED) notFound()` is the first statement inside `WebEditorPage`, before any Supabase client is created. Identical literal expression to `_landing-actions.ts:33,39` (defense in depth). |
| No nav entry (no client exposure) | ✓ VERIFIED | `components/dashboard/sidebar.tsx` — the `NAV_ITEMS`/route map (lines 57-67) has no `/web` entry; grep for `/web` route references outside `app/(dashboard)/web/` returns nothing. |
| No publish/go-live flow | ✓ VERIFIED | grep for `publish\|go-live\|goLive` under `app/(dashboard)/web/` returns zero matches. |
| No `createAdminClient`/service-role on the write/upload surface | ✓ VERIFIED | grep for `createAdminClient\|@/lib/supabase/admin` under `app/(dashboard)/web/` returns zero code matches (two comment-only references explaining the prohibition). |
| Writes go exclusively through Phase 13's `saveLandingConfig` | ✓ VERIFIED | Single call site, `web-client.tsx:146`; no other `.from('businesses').update` in the phase's files. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `app/(dashboard)/web/page.tsx` | Server page, flag-gated, tenant-scoped fetch | ✓ VERIFIED | Fail-closed flag check, session client, 5 datasets fetched with `.eq('business_id', business.id)`. |
| `app/(dashboard)/web/web-client.tsx` | Editor shell: draft state, live preview, save bar, confirm-on-exit, empty-state | ✓ VERIFIED (with 1 partial sub-feature, see Human Verification / Notes) | Draft/preview/save bar/empty-state all real and wired. Confirm-on-exit: `beforeunload` (native browser prompt) is real and wired (lines 158-167); the custom in-app `<Dialog>` (lines 317-334) exists but `setShowExitConfirm(true)` is never called anywhere in the codebase — it is currently dead code, so in-app SPA navigation away from `/web` (e.g. clicking a sidebar link) does **not** trigger a confirm, only tab-close/reload does. This is a plan-level must-have from 14-01 (not one of the 5 roadmap SCs) and does not block the roadmap goal, but is a real, observable gap. |
| `lib/landing/editor-draft.ts` | Pure draft reducer (move/toggle/setSectionData/setTheme/setMotion/isDirty/normalizeSections) | ✓ VERIFIED | All exports present, pure (spread-based, no mutation), tested. |
| `lib/landing/editor-upload.ts` | Pure path builder + file validator | ✓ VERIFIED | `buildUploadPath`/`validateImageFile`, businessId-prefix invariant enforced, tested. |
| `app/(dashboard)/web/_sections/section-list.tsx` | 8 fixed rows, reorder, toggle, imageSlot wiring | ✓ VERIFIED | Confirmed real (not placeholder) per commit `feee1fb`. |
| `app/(dashboard)/web/_sections/section-forms.tsx` | Per-section copy forms + read-only panels | ✓ VERIFIED | All 8 section types handled; `imageSlot` render-prop consumed correctly. |
| `app/(dashboard)/web/_sections/image-controls.tsx` | Single + multi-grid upload controls | ✓ VERIFIED | Session client only, validates before upload, config-only remove/replace, uploading counter wired both directions. |
| `app/(dashboard)/web/_sections/theme-controls.tsx` | Preset/palette/primary/motion controls | ✓ VERIFIED | Writes to `landing_config.theme`/`config.motion` exclusively; `isSafeColor` gate confirmed. |

### Key Link Verification

| From | To | Via | Status |
|---|---|---|---|
| `web-client.tsx` | `components/landing/landing-renderer.tsx` | Direct import, rendered with `config={draft}` | ✓ WIRED |
| `web-client.tsx` | `app/(dashboard)/web/_landing-actions.ts` | `saveLandingConfig(draft)` on Save | ✓ WIRED |
| `section-list.tsx` | `lib/landing/editor-draft.ts` | `onMove`/`onToggle` → `moveSection`/`toggleSection` | ✓ WIRED |
| `section-forms.tsx` | `lib/landing/schema.ts` | Per-section `data` schemas parsed/edited | ✓ WIRED |
| `section-list.tsx` | `image-controls.tsx` | `imageSlot` render-prop mounts `SingleImageControl`/`ImageGridControl` | ✓ WIRED (closed by `feee1fb`) |
| `image-controls.tsx` | `lib/supabase/client.ts` | `createClient()` (browser session) `.storage.from('landing-assets').upload/getPublicUrl` | ✓ WIRED |
| `image-controls.tsx` | `lib/landing/editor-upload.ts` | `buildUploadPath`/`validateImageFile` before every upload | ✓ WIRED |
| `theme-controls.tsx` | `lib/theme-config.ts` | `THEMES`/`THEME_PALETTES`/`THEME_DEFAULT_PAL`/`normalizeTheme` | ✓ WIRED |
| `theme-controls.tsx` | `lib/landing/theme.ts` | `isSafeColor` gate on primary | ✓ WIRED |
| `theme-controls.tsx`/`section-list.tsx`/`section-forms.tsx` | `lib/landing/editor-draft.ts` | `setTheme`/`setMotion`/`setSectionData` mutate the draft | ✓ WIRED |

### Behavioral Spot-Checks / Test Execution

| Check | Command | Result | Status |
|---|---|---|---|
| Phase 14 unit tests (draft reducer + upload path/validator + theme active-match) | `npx vitest run test/landing-editor-draft.test.ts test/landing-editor-upload.test.ts test/landing-theme.test.ts` | 3 files, 77/77 tests passed | ✓ PASS |
| Typecheck | `npx tsc --noEmit` | exit 0, no output | ✓ PASS |
| Full suite (context check, not a Phase-14 regression gate) | `npx vitest run` | 391 passed, 43 skipped, 8 test files FAILED at `beforeAll` with `fetch failed` (booking-core, isolation, concurrency, manual-booking, manual-client, canchas, webhook, clients-import) | ✓ CONFIRMED environment issue, not Phase-14 regression — all 8 failures are DB-backed suites erroring on `admin.auth.admin.createUser` because the local Supabase instance is not running (`fetch failed` at seed, before any test body runs). None of the failing files touch `app/(dashboard)/web/`, `lib/landing/editor-*`, or `lib/theme-config.ts`. |
| Nav exposure grep | `grep -rn "/web" components/dashboard/sidebar.tsx` | No match | ✓ PASS |
| Service-role grep | `grep -rn "createAdminClient\|supabase/admin" "app/(dashboard)/web"` | 2 comment-only matches (prohibition documentation), 0 code usages | ✓ PASS |
| Publish/go-live grep | `grep -rln "publish\|go-live\|goLive" "app/(dashboard)/web"` | No match | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| EDIT-01 | 14-02 | Copy editing per section | ✓ SATISFIED | `section-forms.tsx` |
| EDIT-02 | 14-03 | Image upload/replace/remove incl. RSV gallery | ✓ SATISFIED | `image-controls.tsx` + `editor-upload.ts`, wired via `feee1fb` |
| EDIT-03 | 14-02 | Reorder + on/off, fixed set | ✓ SATISFIED | `section-list.tsx` |
| EDIT-04 | 14-04 | Theme/palette/primary/motion | ✓ SATISFIED | `theme-controls.tsx` |
| EDIT-06 | 14-01 | Editor shell + live preview + save path | ✓ SATISFIED | `page.tsx` + `web-client.tsx` |

No orphaned requirements found for Phase 14 in `.planning/REQUIREMENTS.md` beyond the 5 above (EDIT-05/EDIT-07 belong to Phase 13, already verified in that phase).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `web-client.tsx` | 108, 317-334 | Dead code: `showExitConfirm` state + custom `<Dialog>` markup, `setShowExitConfirm(true)` never called anywhere | ⚠️ Warning | The in-app "cambios sin guardar" confirm dialog for internal SPA navigation is unreachable; only the native `beforeunload` browser prompt (tab close/reload/external nav) actually fires. This was a 14-01 plan-level must-have ("salir/navegar dispara un confirm") but is NOT one of the 5 roadmap Success Criteria for Phase 14, and does not block the phase goal (copy/images/reorder/theme/preview/save-path all work). Flagged as a UI-completeness gap, not a phase blocker. |

No debt markers (`TBD`/`FIXME`/`XXX`), no placeholder/"próximamente" strings reachable in the shipped paths (the only "próximamente" string, `ImageSeamFallback` in `section-forms.tsx:216`, is confirmed dead code — `imageSlot` is always supplied by `section-list.tsx` in the shipped wiring), no hardcoded empty returns on the write/upload paths.

## Human Verification Required

### 1. End-to-end image upload round-trip against real Storage

**Test:** Open `/web` with `CMS_ENABLED=true` in a prod-like environment (Supabase Storage enabled), upload an image to Hero, confirm it appears in the preview and the object lands under `landing-assets/{business_id}/`; Reemplazar uploads a new object and updates the URL; Quitar removes it from the preview without deleting the old object.
**Expected:** Upload succeeds, URL is written to the draft only after `getPublicUrl` resolves, Save persists it via `saveLandingConfig`.
**Why human:** The local Supabase Storage is OFF in this dev environment (documented constraint, not a Phase 14 defect); the upload logic itself is verified by unit test (`buildUploadPath`/`validateImageFile`, 77/77 passing) and static code review, but the live Storage round-trip cannot be exercised by an automated verifier here.

## Gaps Summary

No gaps against the 5 roadmap Success Criteria — all verified with direct file:line evidence, and the SC2 image-upload wiring (the phase's highest-risk/most-recently-patched surface) is confirmed real via commit `feee1fb`, not the "próximamente" placeholder. One non-blocking UI-completeness item is noted (dead confirm-on-exit dialog for in-app navigation) — informational, not a phase blocker, and not part of the roadmap contract.

---

_Verified: 2026-07-10T12:57:43Z_
_Verifier: Claude (gsd-verifier)_
