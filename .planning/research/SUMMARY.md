# Project Research Summary

**Project:** Forjo Web Builder (v0.10)
**Domain:** Themeable, jsonb-config-driven landing page renderer with native booking, inside an existing Next.js 16 + Supabase multi-tenant SaaS
**Researched:** 2026-06-17
**Confidence:** HIGH

## Executive Summary

Forjo Web Builder v0.10 is not a site builder — it is a rendering + theming milestone. The product already owns all the data that small-service businesses need on a marketing page (services, hours, locations, professionals, booking flow, MercadoPago seña). The milestone's job is to render that data as a premium, themeable, scroll-driven one-pager at `/[slug]`, replacing the bare booking page without breaking it. The decisive structural advantage over Wix/Squarespace/Calendly-style alternatives: Forjo derives landing content from data it already holds and embeds its own native booking — so there is no re-entry of services, no iframe scheduler, no CORS dance. The implementation is overwhelmingly about rendering + theming + safe degradation, not new business capabilities.

The recommended approach is config-as-data with a Zod-validated safe fallback at every read boundary. A single `landing_config jsonb` column on `businesses` drives the entire page; a `forjo-web-builder` skill (running locally in Claude Code, never on Vercel) writes it via service-role. The fixed section set (Hero, About, Services, Gallery, Location, Hours, Booking, CTA) is composed by a `<LandingRenderer>` server component that sorts by `order`, filters by `enabled`, and injects data the page already fetches — leaving `BookingClient` completely untouched. Zero new npm dependencies are required.

The critical risks are concentrated in two areas: (1) security — adding `landing_config` to the `public_businesses` view must not re-open the secret-exposure hole that v0.9 just closed (explicit column enumeration is non-negotiable), and the public `landing-assets` Storage bucket must be public-read/private-write with `business_id`-namespaced keys; (2) availability — an invalid or null config must never crash `/[slug]` or break booking, so Zod `safeParse` + a `DEFAULT_LANDING_CONFIG` is the non-negotiable floor for every render path.

## Key Findings

### Recommended Stack

Zero new runtime npm dependencies. Next.js 16's `generateMetadata`, `next/image`, and `next/og` cover metadata and SEO; zod v4's `safeParse` + `discriminatedUnion` + `.catch()` covers jsonb validation; the existing `data-theme`/`data-palette` CSS-first engine covers multi-preset theming with no FOUC; Supabase Storage (already in the installed SDK) covers image hosting. Non-npm infra changes: (1) `images.remotePatterns` in `next.config.ts`; (2) new `landing-assets` public bucket; (3) `landing_config` column + view migration. Instagram scraping is a build-time skill (runs on dev machine, adds nothing to `package.json`).

**Core technologies (all already installed):**
- **Next.js 16.2.7**: `generateMetadata`, `next/image`, RSC `<LandingRenderer>`, `force-dynamic` — already the framework
- **zod 4.4.3**: `safeParse` + discriminated union + `.catch()` for `LandingConfig` — already the project standard
- **@supabase/supabase-js 2.106.2**: Storage upload (service-role) + public URL read — Storage is bundled in the SDK
- **Tailwind CSS v4 + `globals.css`/`themes.css`**: `[data-theme=preset]` token blocks — existing engine, extend with new preset blocks
- **`PaletteScript` + `data-*` attributes**: pre-paint theme, no FOUC — unchanged component, new data source

### Expected Features

**Must have (P1 — table stakes):**
- Config schema + `LandingConfig` type + Zod validation + safe default (foundation; nothing works without it)
- `<LandingRenderer>` composing fixed sections by `order`/`enabled`
- Hero + Booking sections (irreducible minimum; safe default floor)
- Services (auto), Hours, Location, CTA (WhatsApp) — from existing DB data
- About + Gallery sections (default-off until content exists)
- No-regression fallback (null config = today's behavior, not a 500)
- 2–3 theme presets + constrained per-config overrides + coherent dark mode
- Mobile-first responsive + WCAG AA
- SEO/OG per business + JSON-LD `LocalBusiness`
- Skill `forjo-web-builder` (last, depends on all above)

**Should have (P2 — differentiators, add post-launch):**
- Premium scroll/reveal animations + sticky-shrink nav
- Vertical-aware copy and terminology in sections
- IG scrape as optional skill input

**Defer (v2+ — separate milestones):**
- Editor-in-dashboard
- In-app sales / `landing_status` upsell
- Custom domains (Vercel Pro + host resolution + URL re-parametrization)
- Testimonials/reviews (no data model)
- Free-form/drag-and-drop layout (anti-feature for this milestone)

### Architecture Approach

Adds a `landing/` subtree under `app/[slug]/` (server section components + renderer) and a `lib/landing/` module (types, schema, presets, default config), modifying `page.tsx` and `layout.tsx` minimally and leaving `booking-client.tsx` untouched. Two new migrations: `030` (column + view update) and `031` (public Storage bucket). The skill writes config via service-role UPDATE; live preview is immediate (`force-dynamic`).

**Major components:**
1. **`lib/landing/schema.ts` + `parseLandingConfig()`** — Zod schema + safe fallback; single source shared by render path and skill write path
2. **`<LandingRenderer>`** — server component; orders/filters sections, dispatches to typed section components, forwards booking props unchanged
3. **Section components (`app/[slug]/landing/sections/*.tsx`)** — 7 presentational RSC + 1 thin `booking-section.tsx` wrapper for unmodified `<BookingClient>`
4. **`app/[slug]/layout.tsx` (modified)** — resolves theme from `landing_config`, feeds existing `PaletteScript`, extends `generateMetadata` with OG + JSON-LD
5. **`landing-assets` Storage bucket** — public read, owner/service-role write scoped by `business_id` folder prefix
6. **Skill `forjo-web-builder`** — config build, optional IG scrape, image re-hosting, Zod validation before write, service-role UPDATE, preview URL

### Critical Pitfalls

1. **`landing_config` re-opens the v0.9 secret-exposure hole** — `SELECT *` on the view or recreating it carelessly re-exposes `mp_access_token`, `resend_api_key`, `google_refresh_token` to `anon`. Prevention: enumerate columns explicitly in migration; Zod `.strip()` unknown keys before write; verify with anon-key isolation test.

2. **Invalid/null config crashes `/[slug]` and takes down booking** — Any unguarded `as LandingConfig` cast will 500 on a bad blob. Prevention: `parseLandingConfig()` uses Zod `safeParse`; null/invalid → `DEFAULT_LANDING_CONFIG`; renderer skips unknown section types; per-section components defend their own data.

3. **Storage bucket misconfigured** — Public write policy or non-namespaced keys enable cross-tenant overwrite. Prevention: public read only; writes scoped to `{business_id}/...` via owner-RLS; skill generates `${businessId}/${randomUUID()}.${ext}` with extension allowlist.

4. **Booking regression from renderer wrapping** — Reshaping props, making booking disableable, or wrapping `BookingClient` in `overflow:hidden`/`transform` breaks the date picker/drawer/toasts. Prevention: prop contract frozen; booking non-disableable; vaul/sonner verified in themed wrapper.

5. **XSS from scraped content + FOUC from per-business theming** — `dangerouslySetInnerHTML` and unvalidated URLs are an XSS vector; client-side theme application causes visible color flash. Prevention: all config text as plain JSX children; Zod URL `https:` allowlist; theme resolved server-side via existing `PaletteScript`.

## Implications for Roadmap

### Phase 1: Schema, Storage, and Safe Foundation
**Rationale:** Nothing can be built or tested without the config type, Zod schema, safe fallback, DB column, view update, and Storage bucket. Carries the highest security risk (Pitfalls 1 and 2) — front-loading isolates the danger. The no-regression guarantee must be proven here, before any new UI exists.
**Delivers:** `landing_config` column + updated `public_businesses` view (explicit column list); public `landing-assets` bucket with owner-write RLS; `lib/landing/` (types, schema, presets, default config); `parseLandingConfig()` wired into `page.tsx` with safe default matching pre-v0.10 output; anon isolation test.
**Addresses:** Config schema + Zod + safe default; Image storage bucket; No-regression fallback
**Avoids:** Pitfall 1 (secret re-exposure), Pitfall 2 (storage misconfig), Pitfall 4 (invalid config crash), Pitfall 7 (Zod `.max()` bounds set here)

### Phase 2: Renderer and Section Components
**Rationale:** With a parsed, guaranteed-valid config, the presentation layer can be built. Booking regression risk is highest here; it must be verified before theming is layered on.
**Delivers:** `<LandingRenderer>`; all 7 presentational server sections with per-section empty-state rules; `booking-section.tsx` wrapper with frozen prop contract; mobile-first responsive markup; Vitest no-regression check.
**Addresses:** `<LandingRenderer>`; all 8 sections; Mobile-first + WCAG AA; Booking integration
**Avoids:** Pitfall 4 (per-section fail-soft), Pitfall 5 (no dangerouslySetInnerHTML; Zod URL validation), Pitfall 6 (image dimensions, on-origin URLs), Pitfall 8 (booking regression)

### Phase 3: Theming
**Rationale:** Sections must exist before they can be themed. Theming is the core value proposition. FOUC (Pitfall 9) must be eliminated before any client sees the landing.
**Delivers:** 2–3 preset token blocks in `globals.css` + dark variants; `layout.tsx` resolves `landing_config.theme.preset` server-side via `PaletteScript`; constrained per-config overrides as inline CSS vars; WCAG AA contrast verified; date picker/vaul/sonner verified unbroken in themed wrapper; `next.config.ts` `images.remotePatterns` added.
**Addresses:** Theme presets + constrained overrides; Dark mode coherence
**Avoids:** Pitfall 9 (FOUC), Pitfall 8 (theming must not break BookingClient)

### Phase 4: SEO, OG, and Performance
**Rationale:** A "web a medida" with no OG image or that fails Core Web Vitals is not a premium product. SEO reads from the finalized config. `generateMetadata` must be fail-safe (shares Zod fallback from Phase 1).
**Delivers:** Extended `generateMetadata` (og:title, og:description, og:image, og:url, twitter card); JSON-LD `LocalBusiness` via `JSON.stringify` of typed object; `next/image` with explicit dimensions (hero `priority`, gallery `lazy`); single deduplicated business fetch via App Router cache memoization; validated og:image with fallback.
**Addresses:** SEO/OG + JSON-LD
**Avoids:** Pitfall 10 (generateMetadata fail-safe; single fetch; JSON.stringify not templates), Pitfall 6 (hero LCP/CLS), Pitfall 7 (perf review)

### Phase 5: Skill `forjo-web-builder`
**Rationale:** Must come last — writes the exact config shape that Phases 1–4 define. Can only be fully tested against a working landing. Highest complexity piece.
**Delivers:** `forjo-web-builder` skill: slug resolution; optional IG scrape via `instagram-a-web` (graceful fallback to manual input); `humanizador` for copy; image re-hosting to `landing-assets/{businessId}/{uuid}.{ext}`; Zod validation before write; service-role UPDATE; preview URL; completes on scrape failure.
**Addresses:** Skill `forjo-web-builder` (P1); IG scrape as optional input (P2)
**Avoids:** Pitfall 3 (no web-exposed write endpoint), Pitfall 6 (images re-hosted, never IG CDN at runtime), Pitfall 11 (scraping offline/optional/best-effort)

### Phase Ordering Rationale

- Foundation first: Zod schema + safe fallback is the single seam that makes "invalid config can never break `/[slug]`" true.
- Sections before theming: cannot theme what doesn't exist; booking regression risk caught before CSS changes layer on.
- SEO after theming: reads config (Phase 1) and hero image (Phase 2) and `remotePatterns` (Phase 3).
- Skill last: it is the config author; all downstream consumers must be final before it encodes their shapes.
- Premium scroll animations (P2) deferred post-launch: ship static premium layout first, verify no CLS regressions, then add tasteful motion behind `prefers-reduced-motion`.

### Research Flags

Phases with standard patterns (skip research-phase):
- **Phase 1:** Zod schema design and Supabase Storage bucket setup match existing repo patterns (migration 003, migration 026).
- **Phase 2:** RSC section components with injected props is a standard Next.js App Router pattern.
- **Phase 3:** CSS-first `data-theme` theming is already working in `themes.css`/`globals.css`; extending it is additive CSS.
- **Phase 5:** `instagram-a-web` skill engine is already defined; skill authoring follows established `.claude/skills/` pattern.

Phases that may benefit from a targeted spike during planning:
- **Phase 4 (SEO):** `generateMetadata` + App Router fetch memoization under `force-dynamic` has subtle caching semantics in Next 16. Quick read of `node_modules/next/dist/docs/` before implementation recommended — specifically how `cache()` interacts with `force-dynamic` and whether layout + page hit the same memoized resolver.
- **Phase 3 (theming):** If section wrappers use CSS `transform` or `overflow:hidden` for animations, they can clip `vaul` drawers and `react-day-picker` popovers. Verify with DOM inspection before committing to animation approach.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified against actual `package.json`, source files (`globals.css`, `themes.css`, `palette-script.tsx`, migrations), and Next 16 docs. Zero ambiguity. |
| Features | HIGH | Scope LOCKED by `web-builder-brief.md`. Section set, anti-features, MVP definition are authoritative. |
| Architecture | HIGH | Verified against actual codebase (`page.tsx`, `layout.tsx`, `booking-client.tsx`, `PaletteScript`, migrations). Integration points grounded in real code. |
| Pitfalls | HIGH (security/isolation) / MEDIUM (Next 16 metadata caching, IG scraping) | Security pitfalls from v0.9 audit (`CONCERNS.md`) — HIGH. Next 16 caching + IG legal/fragility — MEDIUM (web sources). |

**Overall confidence:** HIGH

### Gaps to Address

- **`DEFAULT_LANDING_CONFIG` exact shape:** Clarify in Phase 1 planning whether null config renders today's bare `BookingClient` (byte-for-byte parity) or a new Hero + Booking layout. ARCHITECTURE recommends bare parity as safest no-regression baseline; FEATURES says Hero + Booking is the minimum configured state. These are compatible but the distinction must be made explicit.
- **Theme preset definitions:** The research identifies 2–3 presets but does not define token values. Design decision for Phase 3 planning — existing `themes.css` presets are starting points; decide which to expose and whether Bauhaus dark is a preset or the default.
- **`map_url` / coordinates in Location section:** Verify whether the current `locations` table has `lat/lng` or just an address string during Phase 1 — determines whether Location section uses a static map embed URL from config or a derived Google Maps link.
- **Gallery lightbox approach:** Client-side lightbox (adds JS) vs CSS-only approach unresolved. Decide in Phase 2 planning.

## Sources

### Primary (HIGH confidence)
- `web-builder-brief.md` — LOCKED decisions D1–D7, phases, guardrails, skill spec
- `app/[slug]/page.tsx`, `layout.tsx`, `booking-client.tsx` — verified current rendering behavior
- `components/palette-script.tsx`, `app/globals.css`, `app/themes.css`, `lib/theme-config.ts` — existing theming engine
- `supabase/migrations/003_storage_attachments.sql`, `026_public_businesses_view.sql` — storage and view patterns
- `.planning/codebase/CONCERNS.md` — v0.9 audit; secret exposure, service-role caveat, admin-endpoint auth
- `.planning/PROJECT.md` (v0.10) — v0.9 outcomes, constraints, key decisions
- `node_modules/next/dist/docs/` — Next 16 `generateMetadata`, `images.remotePatterns`, JSON-LD, `next/og`

### Secondary (MEDIUM confidence)
- jjotalab.com — reference aesthetic for booking landing page
- Bitly, Unicorn Platform, Landingi — booking landing page section conventions
- Moburst, sitesplaced — 2026 premium scroll/reveal patterns
- ScrapeOps, Zyte — Instagram scraping legality, rate limits, anti-bot measures
- Next.js caching docs — `force-dynamic` + `cache()` + metadata semantics

---
*Research completed: 2026-06-17*
*Ready for roadmap: yes*
