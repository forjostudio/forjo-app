# Phase 14: CMS editor UI - Research

**Researched:** 2026-07-08
**Domain:** Next.js 16 dashboard editor UI (RSC/client boundary) + Supabase Storage browser upload + live WYSIWYG preview of a real landing renderer
**Confidence:** HIGH (all 7 focus areas confirmed against the real repo with file:line evidence; no external packages introduced)

## Summary

Phase 14 is a **UI-assembly phase, not a foundation phase**: every risky primitive already exists and is verified. The write path (`saveLandingConfig`, owner-only, flag-gated, overwrite-total) is done (Phase 13). The renderer, all 8 section components, the theme resolver, the storage bucket + RLS, and the swatch/upload UI patterns to mirror all exist. The job is to wire them into a split editor↔preview client surface behind `CMS_ENABLED`, with zero new dependencies.

The **single load-bearing technical fact** is the RSC/client boundary of the live preview (Focus 1). `components/landing/landing-renderer.tsx` is a Server Component *by convention* (no `'use client'`), but it has **no server-only dependency** — no `next/headers`, no `cookies()`, no admin/server Supabase client, no `async`/`await`, no data fetching. It is a **pure presentational function of its props**. Its whole subtree (all sections + `BookingClient`, which is already `'use client'`) is composed of "shared" or client components. Per Next 16 docs (`node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md:176`), a `'use client'` file pulls all its imports into the client bundle — which is exactly what we want here: importing `LandingRenderer` into a `'use client'` editor forces the whole tree to render client-side, driven by the in-memory draft config. This is legal because nothing in that tree touches a server-only API. **This works — it is not a redesign risk — but it must be verified with `tsc` + a real render, because it depends on that "no server-only import" invariant holding across the whole tree.**

The theme preview (Focus 4) resolves cleanly: landing tokens cascade from `data-theme`/`data-palette`/`data-font` + inline `--primary` on any ancestor element (attribute selectors in `app/themes.css` / `app/globals.css` are not `:root`-scoped), so the editor applies them to the preview **wrapper div**, never to `<html>` (which would repaint the dashboard chrome). Storage upload (Focus 2) is a near-verbatim copy of the existing `uploadLogo` flow, retargeted to the `landing-assets` bucket under `${business.id}/`. Everything else (save integration, gating, section forms, section reorder) is a direct mirror of existing patterns.

**Primary recommendation:** Build one server `page.tsx` (flag-gated, mirrors `settings/page.tsx` fetch) that server-fetches the same 6 datasets `app/[slug]/page.tsx` passes to `LandingRenderer`, plus the current `landing_config`, and mounts a single `'use client'` editor. The editor holds the full config as in-memory draft, imports and renders `LandingRenderer` directly (client-side) inside a `.frj-site` wrapper carrying the resolved theme data-attributes, and calls `saveLandingConfig(fullConfig)` on Save. No new dependency, no migration, no new route.

## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01..D-07 — authoritative, do NOT reopen)
- **D-01:** Split editor + live preview; preview re-renders the REAL `landing-renderer` with the DRAFT config **client-side** (no iframe, no new preview route). Desktop = split; mobile = Editar/Preview toggle. Booking stays a black box.
- **D-01b:** Renderer consumes server-fetched data (business, services, locations, time_blocks…) beyond the config; `page.tsx` fetches them ONCE and passes to the client; preview only swaps the draft `landing_config` against that static data.
- **D-02:** Browser-direct upload to `landing-assets` with the **session browser client** (anon + owner session). Bucket RLS (migr. 030) forces the `{business_id}/` prefix. **Never** service-role. No upload helper exists yet — NEW.
- **D-02b:** Public URL of the uploaded object is stored in the config `image`/`images` field, persisted only on Save. Replace = upload new object, point URL at it. Image fields are `z.string().url()` → must be a valid https URL.
- **D-02c:** Remove image = touches config ONLY (drops the URL). Storage object left orphaned (benign, owner-scoped). Real orphan cleanup DEFERRED.
- **D-02d:** Applies to `hero.image`, `about.image`, `gallery.images[]`, and the RSV gallery (`rsvData.images[]` on the `booking` section).
- **D-03:** In-memory draft + "Guardar cambios" button assembles the FULL config and calls `saveLandingConfig` (overwrite-total). Editor loads current `landing_config` (or `DEFAULT_LANDING_CONFIG` if null) as initial state.
- **D-03b:** No draft table/column. Unsaved-changes indicator + confirm on exit/navigate.
- **D-03c:** Caller MUST handle `saveLandingConfig` return: `{ok:false, error}` → toast per code (`cms_disabled`, `unauthorized`, `no_business`, `invalid_config`, `update_failed`, `server_error`); `{ok:true}` → clear unsaved flag. Feedback via `sonner`.
- **D-04:** ALWAYS list the 8 fixed sections with `enabled` toggle + up/down buttons rewriting `order`. No drag-and-drop, no new dependency, accessible.
- **D-04b:** (UI/planner discretion) evaluate whether `booking` (and maybe `hero`) stay always-enabled; default = all toggle.
- **D-05:** One form per section driven by the existing per-section `data` schemas. Editor edits the config `data`. `services`/`locations` lists come from tables (read-only here). `hours` derives from `time_blocks` (no copy). `booking` has no copy except `rsvData` (header/intro/images).
- **D-06:** Reuse the swatch pattern from `settings-client.tsx` (`THEMES`/`THEME_PALETTES`) but pointed at **`landing_config.theme`** (`preset` + `overrides.palette` + `overrides.primary`), NOT `businesses.theme/palette/font`. Primary validated against `isSafeColor`. `motion` selector (`none`/`subtle`/`premium`). All applied live via `resolveLandingTheme`.
- **D-07:** Editor at `app/(dashboard)/web/`: `page.tsx` Server Component gated by `CMS_ENABLED` server-side (fail-closed), resolves session business, server-fetches preview data, mounts `*-client.tsx`. Zero nav exposure (EDIT-07).

### Claude's Discretion
- Fine component structure (one big client vs sub-components per section / `vaul` drawers on mobile), naming, draft state composition.
- Debounce/optimization of the preview re-render; wrapper vs direct use of the renderer.
- Exact toast copy and section labels in the UI.

### Deferred Ideas (OUT OF SCOPE)
- CMS nav exposure + plan gating (v2, PUB-01).
- Publish/go-live draft→published (v2, PUB-02).
- Real orphan cleanup in `landing-assets`.
- Drag-and-drop reorder + inline WYSIWYG.
- Per-section `data` schema tightening (discriminated union).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EDIT-01 | Owner edits copy per section from a visual editor | Focus 6: per-section `data` schemas in `lib/landing/schema.ts:86-156` define exactly which fields each form edits; live via in-memory draft (Focus 1). |
| EDIT-02 | Owner uploads/replaces/deletes images per section incl. RSV, rehosted in `landing-assets/{business_id}/` | Focus 2: browser upload flow mirrors `settings-client.tsx:321-346`; bucket + RLS confirmed in migr. 030; `next/image` already whitelists the bucket (`next.config.ts:20`). |
| EDIT-03 | Owner reorders + toggles enabled sections in fixed set | Focus 6: `SECTION_TYPES` (`schema.ts:8`) is the fixed 8; `order`/`enabled` are on `sectionSchema` (`schema.ts:32-37`); `orderedSections` (derive.ts) reads them. |
| EDIT-04 | Owner picks theme preset + palette/primary + motion, sees it applied | Focus 4: swatch pattern `settings-client.tsx:852-967`; `resolveLandingTheme`/`isSafeColor` `lib/landing/theme.ts:23-73`; tokens cascade from wrapper data-attributes. |
| EDIT-06 | Owner previews changes before they hit the public page | Focus 1: live client-side render of the REAL `LandingRenderer` with the draft; Focus 3: nothing persists until `saveLandingConfig` on Save. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Flag gate + session/business resolution + preview data fetch | Frontend Server (RSC `page.tsx`) | — | `CMS_ENABLED` is server-only; business resolves from session cookies; preview data is server-fetched ONCE (D-01b/D-07). Mirrors `settings/page.tsx`. |
| Draft config state + all editor forms/controls | Browser / Client (`web-client.tsx`) | — | In-memory draft, keystroke-driven preview, interactivity (D-03). `'use client'`. |
| Live preview render | Browser / Client (renders RSC-by-convention `LandingRenderer` client-side) | — | Pure-props renderer pulled into the client bundle by the editor's `'use client'` boundary (Focus 1). No server-only dep in the tree. |
| Image upload | Browser / Client (session Supabase Storage client) | Database/Storage (RLS enforces prefix) | Owner-write RLS on `landing-assets` (migr. 030) makes browser-direct upload safe (D-02). |
| Config persistence | API / Backend (Server Action `saveLandingConfig`) | Database (RLS `owner_id = auth.uid()`) | Single owner-only write path; Zod validation server-side; overwrite-total (Phase 13). |
| Theme resolution for preview | Browser / Client (calls pure `resolveLandingTheme`) | — | Pure function; applied as data-attributes on the preview wrapper (Focus 4). |

---

## Focus 1: Preview — landing-renderer contract (D-01) — RISKIEST PIECE

**VERDICT: CONFIRMED — the preview works client-side by importing `LandingRenderer` directly into the `'use client'` editor. `LandingRenderer` is a Server Component by convention only; it is a PURE FUNCTION OF PROPS with zero server-only dependencies, so its whole subtree is legal to render inside a client boundary. `[VERIFIED: repo + node_modules/next docs]`**

**Exact props the renderer needs** (`components/landing/landing-renderer.tsx:50-63,69`):
```
config: LandingConfig
business: PublicBusiness
services: Service[]
professionals: Professional[]
timeBlocks: TimeBlock[]
exceptions: { date; closed; start_time; end_time; location_id }[]   // ExceptionLite (:47)
locations: { id; name; address; phone }[]                            // LocationLite (:48)
bookingSlot?: ReactNode                                              // vertical-resolved booking node
```
This is **exactly** the prop set `app/[slug]/page.tsx:140-149` passes. The renderer does NOT fetch anything internally — `app/[slug]/page.tsx:60-75` does all fetching (via `public_*` views) and hands the results in as props. **So the plan should have `web/page.tsx` server-fetch the same 6 datasets** using the session `createClient()` (owner context, not the public anon client — the owner is authenticated and RLS on base tables applies), plus the current `landing_config`, and pass them to the client editor once (D-01b). Query shape to mirror from `app/[slug]/page.tsx:60-75`: services/professionals/timeBlocks/exceptions/locations/canchas. For the dashboard owner context, reading the base tables `services`/`professionals`/`time_blocks`/`schedule_exceptions`/`locations` filtered by `.eq('business_id', business.id)` is correct (same as `settings/page.tsx:28-34`).

**Why client-side render is legal** — the boundary rule (`node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md:176`): *"Once a file is marked with `'use client'`, all of its imports and the components it directly renders are included in the client bundle."* Confirmed: none of the renderer subtree uses a server-only API —
- `landing-renderer.tsx` imports (`:21-41`): only types, `BookingClient` (`'use client'`, `app/[slug]/booking-client.tsx:1`), the 8 section components, pure `derive`/`theme`/`schema` helpers, `_premium`. No `next/headers`, no `cookies()`, no `createAdminClient`/`createClient`/`createPublicServerClient`, no `async`/`await` (verified by grep across `components/landing/` — zero server-only hits).
- All 8 section components are **shared components** (no `'use client'`, only `next/image`, `lucide-react`, schema parse, pure helpers) — verified heads of `hero/about/services/gallery/location/hours/cta/rsv-strip/_premium`.
- `lib/landing/derive.ts:1-12` and `lib/landing/theme.ts` are explicitly PURE (no React/Supabase/admin).

**So the plan should:** import `LandingRenderer` directly into the `'use client'` editor and render `<div className="frj-site-frame">{/* theme wrapper */}<LandingRenderer config={draft} …staticData />}</div>`. Do NOT pass it as `children` from the server (that would freeze it to the initial config and defeat live editing). Add a **`tsc --noEmit` + real render check as a verification step** — the "no server-only import" invariant is what makes this legal, and it must hold across the whole imported tree. (Note: `booking-client.tsx` imports `date-fns`, `next/navigation` — all client-safe.)

**Booking stays a black box:** pass a `bookingSlot` into the preview (or let the renderer fall back to its default `BookingClient`, `:239-248`). The RSV strip (`rsvData`) IS editable; the booking widget is rendered but not exercised. Do NOT wrap the preview in `transform`/`overflow`/`position:fixed|sticky`/`filter` around `<section id="reservar">` — that breaks vaul/sonner/react-day-picker positioning (documented hard rule, `landing-renderer.tsx:161-167,220-227`). The preview frame container in the UI-SPEC (`rounded-lg border bg-background overflow-hidden`, §1) — **CAUTION: that `overflow-hidden` is on the OUTER frame wrapping the whole `.frj-site`, which is fine, but do NOT put `overflow`/`transform` on an element that is an *ancestor of `#reservar` inside `.frj-site`***. Keep the frame strictly outside/around, and if a scroll container is needed, scroll the OUTER frame, not an inner wrapper between `.frj-site` and `#reservar`.

**Preview performance:** every keystroke re-renders the whole landing tree. React reconciliation of ~8 static sections is cheap; `next/image` re-renders are the cost. **So the plan should** debounce the config→preview propagation ~100-150ms for text inputs (D-01 discretion) if profiling shows jank, but start without it (correctness first).

---

## Focus 2: Image upload from the browser (D-02, EDIT-02)

**VERDICT: CONFIRMED — browser client + `landing-assets` bucket + owner-write RLS all exist; the upload is a retargeted copy of the existing `uploadLogo`. `[VERIFIED: repo + migr. 030]`**

**Browser client** (`lib/supabase/client.ts:1-8`): `createClient()` → `createBrowserClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)`. It carries the owner's session cookies, so `authenticated` RLS applies. `@supabase/supabase-js@2.106.2` installed (latest 2.110.1 — no need to bump; `.storage` API is stable).

**Exact upload call** (mirror `settings-client.tsx:321-336` `uploadLogo`, retargeted):
```ts
const supabase = createClient()               // @/lib/supabase/client
const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
const path = `${business.id}/${section}-${crypto.randomUUID()}.${ext}`   // MUST be prefixed with business.id
const { error } = await supabase.storage.from('landing-assets').upload(path, file, { upsert: false })
if (error) { /* toast 'No se pudo subir la imagen' */ return }
const { data: { publicUrl } } = supabase.storage.from('landing-assets').getPublicUrl(path)
// publicUrl is https + valid → write into draft config field (hero.image / gallery.images[] / rsvData.images[])
```

**Bucket + RLS** (`supabase/_migrations-archive/030_landing_config_and_storage.sql`):
- Bucket `landing-assets`, `public = true` (`:66-68`) → public read by URL (no SELECT policy needed).
- **INSERT policy quoted** (`:85-93`):
  ```sql
  CREATE POLICY "landing-assets owner insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'landing-assets'
      AND (storage.foldername(name))[1] IN (
        SELECT id::text FROM businesses WHERE owner_id = auth.uid()
      )
    );
  ```
  UPDATE (`:96-110`) and DELETE (`:113-121`) policies are analogous. **The first path segment MUST equal a `business_id` owned by the caller — a path outside `${business.id}/` is rejected by RLS.** So the path MUST start with `${business.id}/` (never a client-supplied business_id, never a raw slug).

**Resolve `business_id` client-side:** the server `page.tsx` passes `business` (with `.id`) as a prop to the editor (mirror `settings-client.tsx` which reads `business.id` from props). Never trust a business_id from anywhere else.

**Validation before upload** (reuse `settings-client.tsx:314-316` / `validatePhoto` `:433-437` verbatim copy): size ≤ 2MB → "El archivo no puede superar 2MB"; type ∈ {jpeg,png,webp} → "Formato no soportado. Usá JPG, PNG o WebP". Note: settings `uploadLogo` uses `{ upsert: true }` on a fixed filename; **for landing images prefer unique filenames + `upsert:false`** (D-02b "replace = upload new object, point URL at it", D-02c orphan-benign) so replace never clobbers and cache-busting isn't needed.

**`next/image` will render uploaded images:** `next.config.ts:10-25` already whitelists `remotePatterns` for `<supabase-host>/storage/v1/object/public/landing-assets/**` (derived from `NEXT_PUBLIC_SUPABASE_URL`, works prod https + local http). So the preview shows the new image immediately once the public URL is in the draft. `[VERIFIED: next.config.ts:20]`

**Next 16 client-component constraint:** the upload runs in the `'use client'` editor — fine. `crypto.randomUUID()` is available in the browser. Do NOT call the Server Action for uploads (uploads go direct to Storage, not through `saveLandingConfig`).

**So the plan should:** add a NEW client upload helper (D-02 confirms none exists) with path `${business.id}/${section}-${uuid}.${ext}`, `upsert:false`, unique names; block Save (`disabled`) while any upload is in flight (UI-SPEC §4/§6); on failure do NOT mutate the draft.

---

## Focus 3: saveLandingConfig integration (D-03)

**VERDICT: CONFIRMED — signature, return shape, error codes, callability from a client, and overwrite-total all verified. `[VERIFIED: app/(dashboard)/web/_landing-actions.ts]`**

- **File exists:** `app/(dashboard)/web/_landing-actions.ts`, top-level `'use server'` (`:1`).
- **Signature** (`:35-37`): `export async function saveLandingConfig(input: unknown): Promise<{ ok: true } | { ok: false; error: string }>`. Takes the config as an object (`unknown`), NOT FormData (`:9-10` comment confirms Phase 14 calls it as `await saveLandingConfig(config)`).
- **Callable from a client component:** it's a `'use server'` action — import it into the `'use client'` editor and `await` it. This is the standard Next 16 pattern (server action imported into a client component). No wrapper needed.
- **Exact error codes to map to toasts** (all present in source):
  - `cms_disabled` (`:39`) — flag off.
  - `unauthorized` (`:52`) — no session user.
  - `no_business` (`:60`) — no business for the session.
  - `invalid_config` — returned via `parsed.error` from `parseLandingConfigForWrite` (`:63-64`); the Zod validator returns this code.
  - `update_failed` (`:75-76`) — DB error OR zero rows affected.
  - `server_error` (`:79-81`) — catch-all for unexpected throws.
  The UI-SPEC "Save error mapping" table (14-UI-SPEC.md:243-252) already maps all 6 to Spanish toasts — use verbatim.
- **Overwrite-total** (`:70-73`): `.update({ landing_config: parsed.data }).eq('id', business.id)` — writes the ENTIRE config, nothing merged. **So the editor MUST send the FULL config** (theme + all 8 sections + motion), not a diff. `business_id` is resolved from the SESSION (`:55-59`), never from the payload — any business_id in `input` is ignored by construction.
- **`{ ok: true }`** (`:78`) → clear the unsaved-changes flag + set draft-as-saved baseline (D-03c).

**Config-preservation on overwrite-total (Focus 7 landmine):** because the write is total, the editor's draft MUST carry every field it loaded. `parseLandingConfigForWrite` validates with the shared Zod schema; **Zod v4 `z.object` strips unknown keys** (`schema.ts:10-11`) — so any field NOT in the schema is silently dropped on save. The schema envelope keeps `theme`, `sections[]` (`{type,enabled,order,data?}`), and `motion`. Per-section `data` is `z.unknown().optional()` (`schema.ts:36`) so arbitrary `data` shapes survive. **So the plan should** initialize the draft from the loaded `landing_config` (or `DEFAULT_LANDING_CONFIG` if null) and never construct the save payload from scratch — spread the loaded config and mutate fields, so nothing is accidentally lost.

**So the plan should:** on Save, assemble `fullConfig` from the draft, `await saveLandingConfig(fullConfig)`, `switch` on `res.ok`/`res.error` to `toast.success`/`toast.error` per the UI-SPEC mapping.

---

## Focus 4: Theme/palette/primary/motion editing (D-06, EDIT-04)

**VERDICT: CONFIRMED — swatch pattern, preset/palette source, `isSafeColor` allowlist, and `resolveLandingTheme` mapping all verified. The preview reflects theme changes live via data-attributes on the preview WRAPPER (not `<html>`). `[VERIFIED: repo]`**

**Swatch pattern to mirror** (`settings-client.tsx:852-967`): three grids — `THEMES.map` (`:853-885`), `THEME_PALETTES[theme].map` (`:898-927`), `FONTS.map` (`:940-965`). Active state = `border-primary ring-2 ring-primary/20` + `Check` badge; each is a real `<button aria-pressed>` with `focus-visible:ring-2 ring-ring`. **Copy the structure verbatim; only change the write target** (D-06 / UI-SPEC §5).

**Source of presets/palettes** (`lib/theme-config.ts`): `THEMES` (`:38-43`, 4 presets: forjo/modern/spa/cyber), `THEME_PALETTES` (`:46-75`, per-theme palette lists), `THEME_DEFAULT_PAL` (`:77-79`), `FONTS` (`:82-89`). Selecting a preset resets palette to that preset's default (`THEME_DEFAULT_PAL`), same as settings `selectTheme`.

**Primary validation — `isSafeColor` allowlist quoted** (`lib/landing/theme.ts:21-26`):
```ts
const HEX_COLOR = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
export function isSafeColor(value): boolean {
  if (typeof value !== 'string') return false
  return HEX_COLOR.test(value)
}
```
Only `#` + exactly 3/4/6/8 hex digits pass. An invalid hex must show an inline error and NOT be written (the renderer drops it anyway — `resolveLandingTheme` `:70`). Use a native `<input type="color">` + a text hex field validated with `isSafeColor` (UI-SPEC §5).

**`resolveLandingTheme` mapping** (`lib/landing/theme.ts:51-73`): `preset → normalizeTheme → data-theme`; `overrides.palette → normalizePalette(theme,…) → data-palette`; `overrides.font → normalizeFont → data-font`; `overrides.primary → isSafeColor ? primary : undefined → inline --primary`. The editor writes to `landing_config.theme = { preset, overrides: { palette, font?, primary } }` — this is the `LandingTheme` shape (`schema.ts:18-28`, `overrides` is `z.record(z.string(), z.string())`).

**Live preview of theme (how tokens reach the preview):** on the public site the theme is applied to `<html>` via `PaletteScript` in `app/[slug]/layout.tsx:100-114`. **The editor must NOT touch `<html>`** (that would repaint the whole dashboard chrome). Instead: theme/palette accent tokens are defined by **attribute selectors** that cascade to descendants — `[data-palette="red"] { --primary… }` (`globals.css:137`), `[data-theme="modern"][data-palette="indigo"] { --primary… }` (`themes.css:195`) — NOT `:root`-only. And `.frj-site` derives ALL its premium tokens from those engine tokens via `color-mix` (`globals.css:243-261`, comment `:236-241`). **So the plan should** compute `const t = resolveLandingTheme(draft.theme, businessFallback)` in the client and set on the preview WRAPPER div:
```
data-theme={t.theme !== 'forjo' ? t.theme : undefined}
data-palette={t.palette}
data-font={t.font !== 'auto' ? t.font : undefined}
style={t.primary ? { ['--primary' as string]: t.primary } : undefined}
className="frj-site …"   // .frj-site scope must wrap the LandingRenderer output
```
(Mirror `PaletteScript`'s "omit forjo/auto" rules, `palette-script.tsx:24-26`.) The renderer's own `<main class="frj-site" data-motion>` (`:169`) supplies motion; the theme wrapper supplies palette/theme/font/primary above it.
> **CAUTION (subtle preset gotcha):** `DEFAULT_LANDING_CONFIG.theme.preset` is `'default'` (`schema.ts:58`), but `normalizeTheme` (`theme-config.ts:95-97`) only knows `forjo/modern/spa/cyber` → `'default'` degrades to `'forjo'`. In the preset grid, the "active" match must go through `normalizeTheme` (or treat `'default'`→`forjo`) so a null-seeded config highlights Forjo, not nothing.

**Dark mode:** the landing tokens have `.dark[data-palette=…]` variants (`globals.css:138`). The dashboard shell is dark by default; the preview will inherit the dashboard's `.dark` class from an ancestor unless deliberately scoped. **So the plan should** decide the preview's light/dark context — the public landing is NOT forced dark; consider rendering the preview wrapper without inheriting `.dark`, or accept dark-mode preview as a known approximation (the UI-SPEC treats preview fidelity as owned by v0.10, not this editor). Flag as an Assumption (A1).

**Motion selector:** 3-way segmented `none/subtle/premium` writing `config.motion` (`schema.ts:49`, `z.enum([...]).optional().catch(undefined)`). The renderer emits `data-motion` on `.frj-site` (`:78,169`). Motion is **100% CSS** via `animation-timeline: view()` (`globals.css:474-538`, "cero JS, cero 'use client'") — no IntersectionObserver, so the preview shows reveals automatically. **CAUTION:** `animation-timeline: view()` is tied to the nearest scroll container; inside a scrollable preview panel the reveal/parallax may key off the panel's scroll rather than the page — a minor fidelity note, not a blocker (UI-SPEC §5 A11y; flag as A2).

**The editor writes to `landing_config.theme`, NOT `businesses.theme/palette/font`** — confirmed as the D-06 invariant; `settings-client.tsx` writes the latter (`businesses` columns) and must not be reused as the write target.

---

## Focus 5: Editor page gating (D-07)

**VERDICT: CONFIRMED — same env read as the action, fail-closed; session/business/landing_config resolution mirrors `settings/page.tsx`; no nav entry to add. `[VERIFIED: repo]`**

**Flag read (must match the action exactly)** — `_landing-actions.ts:33`: `const CMS_ENABLED = process.env.CMS_ENABLED === 'true'`. Server-only (NOT `NEXT_PUBLIC_*`), fail-closed: only the exact string `'true'` enables. **So `web/page.tsx` should** read the identical expression and, if false, render nothing / `notFound()` before any session or data work (fail-closed — threat note d of Phase 13). Defense-in-depth: even if the page leaks, `saveLandingConfig` re-checks the flag first (`:39`).

**Session + business + landing_config resolution (mirror `settings/page.tsx:7-18`):**
```ts
const supabase = await createClient()                          // @/lib/supabase/server (session, RLS)
const { data: { user } } = await supabase.auth.getUser()
if (!user) redirect('/login')
const { data: business } = await supabase.from('businesses')
  .select('*')                                                 // includes landing_config, theme/palette/font (fallback)
  .eq('owner_id', user.id).single()
if (!business) redirect('/onboarding')
```
`business.landing_config` is the current config (parse client-side with `parseLandingConfig` → null seeds `DEFAULT_LANDING_CONFIG` in the draft, D-03). `business.theme/palette/font` are the fallback for `resolveLandingTheme`'s second arg (Focus 4).

**Preview data fetch** — add the `Promise.all` from `settings/page.tsx:28-34` pattern, fetching the 6 datasets the renderer needs (services, professionals, time_blocks, schedule_exceptions, locations; canchas only if you want vertical-correct booking in the preview). Filter each `.eq('business_id', business.id)`.

**No nav entry (EDIT-07):** the route lives at `app/(dashboard)/web/` but is NOT added to the sidebar/nav (v1). Confirmed by REQUIREMENTS EDIT-07 (Out of Scope: nav exposure) and D-07 ("Cero exposición en nav"). Access is by direct URL only while the flag is on. **So the plan should** add ZERO nav/menu changes.

---

## Focus 6: Section forms from schema (D-05)

**VERDICT: CONFIRMED — per-section `data` shapes, read-only tables, hours-from-time_blocks, and RSV gallery location all verified. `[VERIFIED: lib/landing/schema.ts]`**

**Per-section editable `data` fields** (`lib/landing/schema.ts`):
| Section | Schema | Editable fields |
|---------|--------|-----------------|
| hero | `heroData` (`:86-96`) | `headline`, `kicker`, `subhead`, `cta_label` (strings) + `image` (url) |
| about | `aboutData` (`:99-105`) | `title`, `body` + `image` (url) |
| services | `servicesData` (`:109-114`) | `title`, `subtitle` ONLY (list from `services` table — read-only) |
| gallery | `galleryData` (`:117-122`) | `title` + `images[]` (url array) |
| location | `locationData` (`:142-149`) | `title`, `map_url` (url), `show_address` (bool) (list from `locations` table — read-only) |
| hours | *(no schema)* | derives from `time_blocks` — NO copy, read-only info panel |
| cta | `ctaData` (`:151-156`) | `headline` |
| booking | `rsvData` (`:132-139`) | `header`, `intro` + `images[]` (RSV gallery, url array) |

- **services/locations lists are read-only here** — `schema.ts:108` ("La LISTA de servicios viene de la tabla `services`… el data solo aporta título") and `:141`. Show a read-only preview + a hint pointing to Servicios/Negocio. Confirmed by D-05 and UI-SPEC §3 table.
- **hours has no copy** — `schema.ts:84` ("Hours deriva solo de time_blocks → ninguno tiene esquema"). Show an informational panel ("Se editan en Negocio → Horarios"). No form fields.
- **RSV gallery = `rsvData.images[]` on the `booking` section** — `schema.ts:125-139` (dedicated field, added Phase 12) and `landing-renderer.tsx:238` (`<RsvStrip data={dataOf('booking')} />`). Confirmed D-02d/D-05.

**All image fields are `z.string().url()`** (`:93,104,121,137,147`) → uploaded public URLs must be valid https (Focus 2 guarantees this via `getPublicUrl`). Each `data` schema has `.catch({})` → a malformed field degrades to `{}` and the section falls back / hides, never breaking the preview.

**So the plan should** build one form per section keyed by these exact fields; render services/locations/hours as read-only derived panels; wire the RSV gallery under the `booking` section's `rsvData`; every keystroke updates the in-memory draft.

**Reorder/toggle (EDIT-03):** `sectionSchema` (`:32-37`) has `enabled: boolean` + `order: number`. `SECTION_TYPES` (`:8`) = the fixed 8. Always list all 8; up/down buttons swap `order` of two adjacent sections; toggle flips `enabled`. `orderedSections` (imported in renderer `:24`) filters `enabled=false`, sorts by `order`, and guarantees `booking` is present — so the preview reflects reorder/toggle automatically. No new dependency (D-04).

---

## Focus 7: Landmines

| # | Landmine | Evidence | Mitigation (so the plan should…) |
|---|----------|----------|-----------------------------------|
| L1 | **Rendering an RSC inside a client component** — the general rule is you CAN'T import a Server Component into a `'use client'` file. | `node_modules/next/dist/docs/…/05-server-and-client-components.md:176-178` | It IS safe HERE because `LandingRenderer` has no server-only dep (Focus 1). Import it directly. Add a `tsc --noEmit` + real-render verification step. Do NOT pass it as `children` (kills live editing). |
| L2 | **Passing a Server Action to a client editor** | `_landing-actions.ts:1` `'use server'` | Import `saveLandingConfig` directly into the client and `await` it — standard Next 16 pattern; no serialization wrapper needed. |
| L3 | **Preview re-render performance** | keystroke → full landing tree re-render | Start without debounce (correctness); add ~100-150ms debounce on text→preview if profiling shows jank (D-01 discretion). |
| L4 | **Image `z.string().url()` requires valid https URLs** | `schema.ts:93,104,121,137,147`; parse `.catch({})` drops the whole `data` on any invalid url | Only ever write `getPublicUrl().data.publicUrl` (always valid https) into image fields; never a blob:/object URL or raw path. A single bad url in an array is caught and can wipe the section's `data`. |
| L5 | **Overwrite-total silently drops unknown keys** | `saveLandingConfig` overwrite (`:70-73`); Zod v4 `z.object` strips unknown (`schema.ts:10-11`) | Initialize the draft from the loaded config and mutate in place; never build the save payload from scratch (Focus 3). |
| L6 | **Theme applied to `<html>` would repaint the dashboard** | `PaletteScript` sets `<html>` dataset (`palette-script.tsx:28`) | Apply `data-theme/palette/font` + `--primary` to the preview WRAPPER only; tokens cascade via attribute selectors (Focus 4). |
| L7 | **Wrapping `#reservar` in transform/overflow breaks vaul/sonner/date-picker** | `landing-renderer.tsx:161-167,220-227` | Preview frame styles (`overflow-hidden`/scroll) go on the OUTER frame, never on an inner ancestor of `#reservar` inside `.frj-site` (Focus 1). |
| L8 | **`'default'` preset degrades to `forjo`** | `DEFAULT_LANDING_CONFIG` `:58` vs `normalizeTheme` `:95-97` | Compute active preset through `normalizeTheme` so the swatch grid highlights correctly for null-seeded configs (Focus 4). |
| L9 | **Save enabled while an upload is in flight** could persist a config referencing a not-yet-uploaded URL | D-02b, UI-SPEC §4/§6 | Disable "Guardar cambios" while any upload is pending; only write the URL to the draft after `upload` + `getPublicUrl` succeed. |
| L10 | **`animation-timeline: view()` in a scrollable preview panel** may key motion off the panel scroll, not the page | `globals.css:504-538` | Accept as approximate preview fidelity; document (A2). Motion correctness is verified on the real `/[slug]`, not here. |

---

## Standard Stack

No new packages. Everything is already vendored.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/ssr` (`createBrowserClient`) | via `@supabase/ssr ^0.10.3` | Session browser client for Storage upload | `lib/supabase/client.ts` already uses it |
| `@supabase/supabase-js` | `2.106.2` (installed; latest 2.110.1) | `.storage.from().upload()/getPublicUrl()` | already the app's client; no bump needed |
| `sonner` | `^2.0.7` | toasts for save/upload results | repo convention |
| `@/components/ui/*` (shadcn base-nova) | vendored | Card/Input/Label/Textarea/Button/Select/Separator/Tabs/Dialog/Drawer | UI-SPEC reuse-first mandate; no new registry fetch |
| `lucide-react` | `^1.17.0` | icons (ChevronUp/Down, Eye/EyeOff, Trash2, ImageIcon, Check) | single icon system |
| `next/image` | via `next 16.2.7` | preview + thumbnails | bucket already whitelisted in `next.config.ts` |

**Installation:** none.

## Package Legitimacy Audit

Not applicable — this phase installs **zero external packages**. All dependencies already exist in `package.json` and are in use in production. No `npm install` step in any plan.

## Common Pitfalls

### Pitfall 1: Treating the RSC/client boundary as a blocker
**What goes wrong:** planner assumes `LandingRenderer` can't be rendered in the client and invents an iframe / new preview route / renderer fork.
**Why it happens:** the general "can't import RSC into client" rule.
**How to avoid:** the renderer is pure-props with no server-only dep (Focus 1) — importing it into the `'use client'` editor is legal and is the intended D-01 approach. No fork, no iframe.
**Warning signs:** any plan task that duplicates the renderer or adds an iframe.

### Pitfall 2: Building the save payload from scratch (losing config fields)
**What goes wrong:** overwrite-total + Zod key-stripping silently deletes fields the editor didn't reconstruct.
**How to avoid:** draft = spread of loaded config; mutate; send whole draft (Focus 3 / L5).

### Pitfall 3: Applying theme to `<html>` and repainting the dashboard
**How to avoid:** wrapper-scoped data-attributes only (Focus 4 / L6).

### Pitfall 4: Wrapping the booking section in transform/overflow
**How to avoid:** preview frame styling stays outside `.frj-site`→`#reservar` chain (Focus 1 / L7).

## Runtime State Inventory

Greenfield UI phase — no rename/refactor/migration. No stored data, live service config, OS-registered state, secrets, or build artifacts are altered. `CMS_ENABLED` env var already exists (Phase 13) and is unchanged. **None — verified: this phase adds one route + one client component + one upload helper; no migration, no config rename.**

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase Storage bucket `landing-assets` | image upload (EDIT-02) | ✓ (migr. 030, in prod) | — | — |
| Storage owner-write RLS policies | upload isolation | ✓ (migr. 030) | — | — |
| `saveLandingConfig` server action | persistence (all EDIT) | ✓ (Phase 13) | — | — |
| `CMS_ENABLED` env var | gating | ✓ (server-only, Phase 13) | — | Off by default (fail-closed) — set to `'true'` in dev to build/test |
| `next/image` remotePatterns for the bucket | preview thumbnails | ✓ (`next.config.ts`) | — | — |
| Test framework (vitest) | validation | ✓ (`vitest`, 283+ tests in repo) | — | — |

**Missing dependencies with no fallback:** none.
**Note:** to develop/test locally, `CMS_ENABLED=true` must be set in the dev env (currently off by default; fail-closed). The local dev env uses `.env.development.local` (Supabase LOCAL); local Storage is OFF per memory — image upload against local Storage may not work in dev, so **upload UAT may need the hosted/staging Supabase or a manual verification against prod-like Storage** (flag for the planner's checkpoint).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (repo has 283+ passing tests) |
| Config file | `vitest.config.*` (present; test infra configured per memory) |
| Quick run command | `npx vitest run <file>` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EDIT-03 | reorder swaps `order`; toggle flips `enabled`; set stays fixed (8) | unit (pure reducer) | `npx vitest run test/web-editor-draft.test.ts` | ❌ Wave 0 — extract draft mutations to a pure module and test |
| EDIT-04 | theme→`resolveLandingTheme` mapping + `isSafeColor` reject bad primary | unit | `npx vitest run test/landing/theme.test.ts` (extend existing) | ✅ (theme.ts already unit-tested) |
| EDIT-02 | upload path is always `${business.id}/…`; bad path never constructed | unit (path builder pure fn) | `npx vitest run test/web-upload-path.test.ts` | ❌ Wave 0 — extract path builder to pure fn |
| EDIT-01 | draft edit of section `data` produces a config that `parseLandingConfigForWrite` accepts | unit | `npx vitest run test/landing/write.test.ts` (extend) | ✅ (write validator tested in Phase 13) |
| EDIT-06 | preview renders draft; save calls action + maps return | manual UAT | — (RSC/client render + Storage; no RTL in repo) | ❌ manual-only (no React Testing Library in repo — consistent with derive/theme extraction strategy) |

**Manual-only justification:** the repo has NO React Testing Library (derive.ts/theme.ts comments confirm the Nyquist strategy is to extract PURE logic and unit-test that; visual render goes through UAT). So EDIT-01/06 render behavior is UAT; the pure logic (draft reducer, upload path builder, theme mapping) is unit-tested.

### Sampling Rate
- **Per task commit:** `npx vitest run <touched test file>`
- **Per wave merge:** `npx vitest run` (full suite green)
- **Phase gate:** full suite + `tsc --noEmit` green before `/gsd:verify-work` (tsc is CI-enforced per memory).

### Wave 0 Gaps
- [ ] `test/web-editor-draft.test.ts` — pure draft mutations (reorder/toggle/set data) — covers EDIT-03
- [ ] `test/web-upload-path.test.ts` — path builder always `${businessId}/…` — covers EDIT-02 isolation
- [ ] Extract draft reducer + upload path builder to PURE modules (`lib/landing/editor-*.ts`) so they're unit-testable (mirror derive.ts/theme.ts strategy)
- [ ] Extend `test/landing/theme.test.ts` for the editor's active-preset normalization (L8)

## Security Domain

`security_enforcement` = enabled (v0.9 hardening, multi-tenant Core Value). This phase is a UI on top of Phase 13's owner-only write path; the security surface is the **image upload** (only net-new write).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | session via `createClient()` (RLS `owner_id=auth.uid()`); page redirects on no session |
| V4 Access Control | yes | Storage RLS forces `{business_id}/` prefix (migr. 030); `saveLandingConfig` resolves business from session, ignores body business_id |
| V5 Input Validation | yes | image type/size validated client-side; `isSafeColor` allowlist for primary; `z.string().url()` for image fields; server-side Zod in `parseLandingConfigForWrite` (non-bypassable) |
| V6 Cryptography | no | — |
| V12 File Upload | yes | ext/type/size checks; unique filenames; public bucket (no secrets ever stored); browser client (never service-role) |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-tenant upload (write to another business's prefix) | Tampering / Elevation | Storage RLS `WITH CHECK ((storage.foldername(name))[1] IN (owner's business ids))` (migr. 030:88-92); path built from session `business.id` only |
| Cross-tenant config write | Tampering | `saveLandingConfig` uses session client + business_id from session, not body (`_landing-actions.ts:54-59`) — proven by isolation test SC2 |
| CSS/style injection via primary color | Injection | `isSafeColor` allowlist (`theme.ts:21-26`); renderer drops invalid |
| Client-supplied config bypassing validation | Tampering | server-side `parseLandingConfigForWrite` is the non-bypassable barrier; client-side is UX only |
| Preview leaking another tenant's data | Info Disclosure | preview data is server-fetched for the SESSION business only (`.eq('business_id', business.id)`); no cross-tenant fetch |
| Booking black-box regression | Availability | no transform/overflow around `#reservar` (L7) |

**Net-new threat to verify in `/gsd:secure-phase 14`:** the image upload path MUST always be `${session business.id}/…` and the RLS must reject a forged prefix. Add a `checkpoint:human-verify` (or unit test on the path builder) that no code path constructs a Storage path from a slug or client-supplied id.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Preview via iframe / separate route | Client-side render of the real RSC-by-convention renderer (pure props) | Next 13+ RSC model; Next 16 confirms | No iframe/route; instant WYSIWYG from in-memory draft |
| Scroll-reveal via IntersectionObserver JS | CSS `animation-timeline: view()` (zero JS) | v0.10 Phase 12 (`globals.css:474`) | Preview shows motion with no extra client code |
| Theme via `<html>` PaletteScript only | Attribute-selector tokens cascade to any wrapper | v0.10 Phase 8 | Preview themes without touching dashboard chrome |

**Deprecated/outdated:** none relevant.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Preview inherits the dashboard's `.dark` class; landing preview shown in dark context is acceptable (fidelity owned by v0.10, not this editor) | Focus 4 | If the owner expects a light-mode public-site preview, dark preview misleads; mitigable by scoping the wrapper's mode. Confirm with UI checkpoint. |
| A2 | `animation-timeline: view()` inside a scrollable preview panel keys off the panel scroll (approximate motion fidelity), acceptable for preview | Focus 4 / L10 | Motion preview may look slightly off vs the real page; motion is UAT-verified on `/[slug]` regardless. |
| A3 | Reading base tables (`services`/`professionals`/`time_blocks`/`schedule_exceptions`/`locations`) with the session client in `web/page.tsx` returns the same shapes the renderer's `LocationLite`/`ExceptionLite` expect | Focus 1/5 | If base-table columns differ from the public views' lite shapes, a cast/select mismatch; mitigate by selecting the exact columns the renderer types declare (`landing-renderer.tsx:47-48`). |
| A4 | `vitest.config.*` present and `npx vitest run` is the command (per memory "vitest 283/283") | Validation | If the runner differs, adjust commands; low risk (memory + package.json confirm vitest). |

## Open Questions (RESOLVED)

1. **Dark/light context of the preview**
   - What we know: dashboard is dark-by-default; landing tokens have `.dark[data-palette]` variants; public site is not forced dark.
   - What's unclear: whether the preview should render light (public default) or inherit dashboard dark.
   - Recommendation: default to inheriting dashboard context for v1 (simplest, WYSIWYG fidelity is v0.10's concern); revisit if UAT flags it. (A1)
   - RESOLVED: inherit dashboard dark context for v1 (A1 accepted). Revisit only if UAT flags fidelity.

2. **Local Storage for upload UAT**
   - What we know: local dev Storage is OFF (memory); prod bucket exists.
   - What's unclear: how the owner tests upload in dev.
   - Recommendation: gate an upload UAT step against staging/prod-like Storage, or a `checkpoint:human-verify` in the plan.
   - RESOLVED: upload UAT runs against staging/prod-like Storage (local Storage off); captured as a human-verify UAT step in Plan 14-03.

3. **Locked-enabled set for toggles (D-04b)**
   - What we know: default = all toggle; recommendation = lock `booking` only.
   - What's unclear: whether `hero` is also locked.
   - Recommendation: lock `booking` only (it's force-injected by `orderedSections` anyway); leave `hero` toggleable — planner confirms. (Design decision, not a research gap.)
   - RESOLVED: lock `booking` only; `hero` stays toggleable (planner confirmed, implemented in Plan 14-02).

## Sources

### Primary (HIGH confidence)
- `components/landing/landing-renderer.tsx` — props/data contract, black-box booking, no server-only deps
- `app/[slug]/page.tsx` + `layout.tsx` — the exact fetch + theme-application pattern to mirror
- `app/(dashboard)/web/_landing-actions.ts` — `saveLandingConfig` signature/return/error codes/overwrite-total
- `lib/landing/schema.ts` — per-section `data` schemas, section envelope, DEFAULT config, Zod key-strip
- `lib/landing/theme.ts` — `resolveLandingTheme`, `isSafeColor`, `normalizeMotion`
- `lib/theme-config.ts` — `THEMES`/`THEME_PALETTES`/`THEME_DEFAULT_PAL`/`FONTS`/normalize*
- `app/(dashboard)/settings/settings-client.tsx:311-346,852-999` — upload + swatch patterns to mirror
- `app/(dashboard)/settings/page.tsx` — server fetch/session/business resolution to mirror
- `supabase/_migrations-archive/030_landing_config_and_storage.sql` — bucket + owner-write RLS
- `lib/supabase/client.ts` — browser client
- `next.config.ts` — `next/image` bucket whitelist
- `app/globals.css` + `app/themes.css` — token scoping (attribute selectors cascade), `.frj-site`, motion CSS
- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` — `'use client'` boundary rule

### Secondary (MEDIUM confidence)
- MEMORY.md `web-builder-v016-milestone` — env layout (`CMS_ENABLED` off, local Storage off, next/image fix f41973f)

### Tertiary (LOW confidence)
- none

## Metadata

**Confidence breakdown:**
- Preview RSC/client boundary (Focus 1): HIGH — verified renderer + full subtree have no server-only deps + Next 16 docs
- Image upload (Focus 2): HIGH — verified bucket/RLS/client/next.config; direct copy of working pattern
- saveLandingConfig (Focus 3): HIGH — read the source, all codes present
- Theme (Focus 4): HIGH — verified resolver + token scoping + swatch pattern
- Gating (Focus 5): HIGH — matches action's flag read + settings page pattern
- Section forms (Focus 6): HIGH — schemas read directly
- Landmines (Focus 7): HIGH — each backed by file:line

**Research date:** 2026-07-08
**Valid until:** 2026-08-07 (stable — all internal repo code; re-verify only if `landing-renderer.tsx`, `schema.ts`, `_landing-actions.ts`, or migr. 030 change)

## RESEARCH COMPLETE
