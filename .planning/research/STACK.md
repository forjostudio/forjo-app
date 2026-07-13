# Stack Research

**Domain:** Themeable, jsonb-config-driven landing renderer inside an existing Next.js 16 + Tailwind v4 + Supabase multi-tenant SaaS (Forjo Web Builder, v0.10)
**Researched:** 2026-06-17
**Confidence:** HIGH

## TL;DR / Verdict

**The Web Builder needs ZERO new runtime npm dependencies.** Every capability the question asks about is already covered by the installed stack:

- Image storage → Supabase Storage (already used, migration `003`), `@supabase/supabase-js` already installed.
- IG scraping → handled by the **`instagram-a-web` skill at build time** (Firecrawl MCP / Playwright / WebFetch). It is NOT app runtime code, so it adds nothing to `package.json`.
- Theming → the app **already** has a full CSS-first, data-attribute theme engine (`app/themes.css`, `lib/theme-config.ts`, `components/palette-script.tsx`). Presets extend it. No new lib.
- Metadata + JSON-LD + OG → native Next 16 `generateMetadata` (already in use in `app/[slug]/layout.tsx`) + inline `<script type="application/ld+json">` + `next/og` (ships with Next). No new lib.
- jsonb validation → `zod` v4 (`^4.4.3`) is already installed and is exactly the right tool.

The only **infra/config** changes (not npm installs) are: (1) a new Storage bucket migration, (2) `images.remotePatterns` in `next.config.ts`, and (3) `next/image` usage (the component ships with Next; the app just doesn't use it yet).

## Recommended Stack

### Core Technologies (all ALREADY INSTALLED — reuse, do not re-add)

| Technology | Version (installed) | Purpose for Web Builder | Why Recommended |
|------------|---------------------|-------------------------|-----------------|
| Next.js | `16.2.7` | `generateMetadata`, `next/image`, `next/og` ImageResponse, RSC `<LandingRenderer>` on the existing `force-dynamic` `/[slug]` | Already the framework; metadata/OG/image are first-party APIs, no plugin needed |
| React | `19.2.4` | Section components as RSC; `BookingClient` stays a client island | Already in use; RSC keeps the landing server-rendered for SEO/LCP |
| Tailwind CSS v4 | `^4` (CSS-first) | Style every section via existing CSS custom properties / `@theme inline` tokens | CSS-first + tokens already wired in `app/globals.css`; presets are pure CSS, no config |
| `@supabase/supabase-js` | `2.106.2` | Storage upload (service-role from the skill), `public_businesses` read of `landing_config` | Already the DB/Storage client; Storage is part of the same SDK |
| `@supabase/ssr` | `0.10.3` | Server-side reads on `/[slug]` (already wired) | No change; landing read rides the existing public-view path |
| `zod` | `4.4.3` | Validate `landing_config` jsonb at render time + before service-role write, with safe fallback | Already installed; v4 `.safeParse` + `.catch()`/`.default()` give the LOCKED "Zod + safe fallback" requirement out of the box |
| `next-themes` | `0.4.6` | Light/dark on the public landing (Bauhaus dark identity) | Already drives `.dark` on `<html>`; presets reuse `.dark[data-theme=…]` selectors |

### Supporting Libraries (ALREADY INSTALLED — reuse for sections)

| Library | Version | Purpose in landing sections | When to Use |
|---------|---------|------------------------------|-------------|
| `lucide-react` | `^1.17.0` | Icons in CTA/Location/Hours/Services sections | Any section iconography (project's locked icon set) |
| shadcn (`base-nova`) + `@base-ui/react` | `^4.10.0` / `^1.5.0` | Buttons, cards, primitives inside sections | Reuse `@/components/ui/*`; do not author raw markup |
| `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css` | `^0.7.1` / `^2.1.1` / `^3.6.0` / `^1.4.0` | Section variants (e.g. hero layout variants), class merging, entrance animations | Per-section style variants and tasteful motion |
| `vaul` / `sonner` | `^1.1.2` / `^2.0.7` | Mobile drawer / toasts inside the booking section | Reused as-is by `BookingClient` |
| `date-fns` | `^4.4.0` | Hours/availability formatting (AR UTC-3) | Hours section + booking, already handled |

### What the Skill uses at BUILD TIME (NOT app dependencies)

| Tool | Purpose | Notes |
|------|---------|-------|
| `instagram-a-web` skill | Scrape client IG bio/photos/text → raw material for `landing_config` | Build-time skill run by you in Claude Code. Uses Firecrawl MCP (if available) → Playwright (auto-installed on demand) → WebFetch fallback. **Do NOT add a scraping lib to the app.** |
| `web-scrolling` skill | Design criteria/inspiration only | No HTML output reaches the app (LOCKED D5). |
| `humanizador` skill | De-AI the generated copy before writing config | Build-time only. |

## Installation

```bash
# Core: NOTHING. Every runtime need is already in package.json.
#   next 16.2.7, react 19.2.4, tailwind v4, @supabase/supabase-js 2.106.2,
#   @supabase/ssr 0.10.3, zod 4.4.3, next-themes 0.4.6 — all present.

# Supporting: NOTHING new.

# Dev dependencies: NOTHING new (vitest 4.1.9 already present from v0.9).
```

**Non-npm changes required (config + DB, NOT installs):**

1. **`next.config.ts` — add `images.remotePatterns`** so `next/image` can optimize Supabase Storage URLs:
   ```ts
   const nextConfig: NextConfig = {
     images: {
       remotePatterns: [
         { protocol: 'https', hostname: '<project-ref>.supabase.co', pathname: '/storage/v1/object/public/**' },
       ],
     },
   }
   ```
   The app currently uses `next/image` **nowhere** and `next.config.ts` is empty — adding this is mandatory before the hero/gallery images can use `next/image` (LCP/CLS requirement, brief Fase 4).

2. **New Storage bucket migration** (`landing-assets`), modeled on `003_storage_attachments.sql` but **public-read** (see Storage Pattern below).

3. **`landing_config jsonb` column** on `businesses` + add it to the `public_businesses` view (brief Fase 1; the view already exists, migration `026`).

## Capability-by-capability findings

### (1) Image upload/storage — Supabase Storage

**Reuse the SDK already installed.** Storage is part of `@supabase/supabase-js@2.106.2` (`supabase.storage.from('landing-assets').upload(...)`). No new package.

The existing bucket `attachments` (migration `003`) is **private** (`public: false`) with an owner-only `FOR ALL` policy keyed on `(storage.foldername(name))[1] = business_id`. Landing images need **public read + owner/service-role write**, so create a **new bucket** rather than reuse `attachments`:

```sql
-- new migration, e.g. 030_landing_assets_storage.sql
INSERT INTO storage.buckets (id, name, public)
  VALUES ('landing-assets', 'landing-assets', true)   -- public read
  ON CONFLICT (id) DO NOTHING;

-- owner can write/delete its own folder; path = [business_id]/...
DROP POLICY IF EXISTS "landing assets write" ON storage.objects;
CREATE POLICY "landing assets write" ON storage.objects
  FOR ALL USING (
    bucket_id = 'landing-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM businesses WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'landing-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM businesses WHERE owner_id = auth.uid()
    )
  );
-- Public SELECT on objects in a public bucket is granted by the bucket flag;
-- the write policy above gates uploads. The skill writes via service-role (bypasses RLS),
-- so the owner policy is for the future dashboard editor (brief Fase 5).
```

Resolves open question §6.1 from the brief: **do NOT reuse `003`'s private bucket — make a new public `landing-assets` bucket.** Public read is required because anon visitors load the images directly; isolation is by `business_id` folder prefix on write only. No secrets are exposed (images are public marketing assets by design).

Confidence: HIGH (verified against migration `003` and the existing public-bucket pattern).

### (2) Instagram scraping — `fetch` is NOT enough, but no app lib is needed

Plain `fetch` against `instagram.com/[handle]` is unreliable: Instagram serves JS-hydrated HTML and aggressively blocks unauthenticated server requests. The `instagram-a-web` skill already solves this with a fallback ladder: **Firecrawl MCP → Playwright (auto-installed) → WebFetch (og: meta tags)**.

Critical point: **this is a build-time skill operation, not app runtime code.** The skill runs in Claude Code on your machine, scrapes, and writes the resulting `landing_config` + uploads images. **Add nothing to `package.json`** for this. Do NOT add `puppeteer`/`playwright`/`cheerio`/`instagram-private-api` as app dependencies — they'd bloat the Vercel bundle for a feature that never executes at request time and would violate the "no new backend per client" principle.

Confidence: HIGH (verified against `.claude/skills/instagram-a-web/SKILL.md`).

### (3) Multi-preset theming on Tailwind v4 CSS-first, NO tailwind.config

**Already solved in-repo. Reuse it; add nothing.** The app implements exactly the pattern best practice recommends for Tailwind v4 CSS-first multi-theme:

- Tokens defined as CSS custom properties in `app/globals.css` under `@theme inline { … }` and `:root` / `.dark`.
- Alternative theme presets in `app/themes.css` scoped by `[data-theme="modern"]`, `[data-theme="spa"]`, `[data-theme="cyber"]`, with dark variants `.dark[data-theme="…"]`.
- Per-business accent palettes via `[data-palette="…"]`, fonts via `[data-font="…"]`.
- `components/palette-script.tsx` sets `data-palette` / `data-theme` / `data-font` on `<html>` **before paint** (no FOUC), driven by `businesses.theme/palette/font`.
- `lib/theme-config.ts` is the single source of truth (`THEMES`, `THEME_PALETTES`, `FONTS`) plus defensive `normalizeTheme/normalizePalette/normalizeFont`.

For the Web Builder's "2-3 presets" (brief Fase 3), a preset = a `data-theme` token set already in `THEMES`/`themes.css`. The `landing_config.theme` (`preset` + optional `primary`/font overrides) maps directly: write `theme/palette/font` columns (or carry them inside `landing_config`) and feed them to the existing `PaletteScript`. Per-config color override = set the `--primary`/`--tint` custom property inline on the landing root, or via an inline `<style>` scoped to the section tree. **No `tailwind.config`, no theming library, no CSS-in-JS.**

Confidence: HIGH (verified against `globals.css`, `themes.css`, `theme-config.ts`, `palette-script.tsx`).

### (4) Next 16 per-route dynamic metadata + JSON-LD

**Native Next 16, already partially in use. Add nothing.**

- `app/[slug]/layout.tsx` **already** exports `generateMetadata({ params })` and uses React's `cache()` to dedupe the DB call between metadata and the layout. Extend it: pull `meta description` from `landing_config`, set `openGraph.images` to the hero image (1200×630), `openGraph.title/description/url`, `twitter` card.
- **JSON-LD**: the Next 16 docs prescribe rendering structured data as a plain inline script — no library:
  ```tsx
  export default async function Page({ params }) {
    const jsonLd = { '@context': 'https://schema.org', '@type': 'LocalBusiness', name, address, telephone, openingHours, image }
    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        {/* … */}
      </>
    )
  }
  ```
  (Optional hardening: validate the JSON-LD object with a small Zod schema before stringifying, and/or use a `schema-dts` **type-only** dev dependency for `@type` autocomplete — see Alternatives. Neither is required.)
- **Dynamic OG image** (optional, nicer than a static hero crop): `next/og`'s `ImageResponse` ships with Next 16 (`import { ImageResponse } from 'next/og'`) via an `app/[slug]/opengraph-image.tsx`. No install. If you just point `openGraph.images` at the uploaded hero (already 1200×630), you can skip `next/og` entirely.

Confidence: HIGH (verified against `node_modules/next/dist/docs/.../generate-metadata.md` and `14-metadata-and-og-images.md`).

### (5) Safe jsonb validation/runtime parsing beyond zod v4

**Nothing beyond zod v4 is needed.** `zod@4.4.3` is already installed and is the right tool. The LOCKED requirement ("validate config with Zod + safe fallback") maps cleanly:

- Define `landingConfigSchema` with `z.discriminatedUnion('type', …)` over the fixed section set (hero/about/services/gallery/location/hours/booking/cta) — discriminated unions are ideal for the `sections[]` shape and give precise errors.
- Use `.safeParse(business.landing_config)` at render time; on failure, fall back to the safe default (Hero + Booking only) so a bad config **cannot** crash the public page. Per-field resilience with `.catch(default)` / `.default(…)` (zod v4) lets a single malformed field degrade instead of dropping the whole section.
- Same schema gates the **service-role write** in the skill (parse before UPDATE).

Do NOT add `ajv`, `yup`, `valibot`, `superstruct`, `io-ts`, or a JSON-Schema layer. They'd fragment validation (the rest of the app is zod) for zero benefit.

Confidence: HIGH (zod already in stack; pattern matches project conventions in `app/(auth)/register/page.tsx`).

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Supabase Storage (installed SDK) | UploadThing / S3 / Cloudinary | Only if you outgrow Supabase Storage egress/transform limits at scale — not now. Cloudinary if heavy on-the-fly image transforms become a bottleneck. |
| `next/image` + `images.remotePatterns` | Supabase image transformation loader (custom `loader`) | If you want Supabase to resize on its CDN (`/render/image`) instead of Vercel's optimizer; Next docs document a `supabaseLoader`. Defer — default optimizer is fine for a landing. |
| Native OG via `generateMetadata` + static hero | `next/og` `ImageResponse` dynamic OG | Use `next/og` only if you want generated/branded OG cards (business name overlaid). Adds render cost; the uploaded 1200×630 hero is enough for MVP. |
| Inline `<script type="application/ld+json">` | `schema-dts` (type-only) | Add `schema-dts` as a **dev** dependency only if you want compile-time typing of the JSON-LD object. Pure DX, zero runtime. |
| Existing `data-theme`/`data-palette` engine | CSS-in-JS (styled-components/emotion) or `next-themes` multi-theme add-ons | Never here — would fight the established CSS-first token system and add client JS. |
| `zod` v4 | `valibot` (smaller bundle) | Only relevant if the schema shipped to the client and bundle size mattered; here validation runs server-side, and the app is all-in on zod. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Any IG-scraping npm lib (`instagram-private-api`, `puppeteer`, `cheerio`) as an app dependency | Scraping is a build-time skill op, not request-time; would bloat the Vercel bundle and risk ToS/account bans at runtime | `instagram-a-web` skill (Firecrawl MCP / Playwright / WebFetch) run in Claude Code |
| A headless CMS (Sanity/Contentful/Payload) | LOCKED D1/D2: inside-Forjo, config is a jsonb column, not an external CMS; adding one contradicts "config = data, one INSERT, no deploy" | `landing_config jsonb` + `public_businesses` view |
| A page-builder / drag-drop lib (Puck, GrapesJS, react-email-editor) | LOCKED D3: fixed section set, no free-form layout per client; these ship large client bundles and an editor you explicitly deferred (Fase 5) | Fixed React/Tailwind section components + `order`/`enabled` from config |
| `tailwind.config.js` / `@tailwindcss/typography` plugin to add themes | Project is Tailwind v4 CSS-first with NO config file; reintroducing a config splits the source of truth | CSS custom properties in `app/globals.css` + `app/themes.css` (`@theme inline`, `[data-theme]`) |
| `ajv` / `yup` / `valibot` for jsonb validation | Fragments validation; app standard is zod | `zod` v4 `safeParse` + discriminated union + `.catch()` fallback |
| `dangerouslySetInnerHTML` for landing **content** (injected HTML) | LOCKED: Forjo-native components only, no loose HTML; also an XSS surface on a public page | Typed section components rendering parsed config fields |
| Reusing the private `attachments` bucket (003) for landing images | It's `public:false` (anon can't read) and owner-`FOR ALL`; landing images must be publicly readable | New `landing-assets` bucket with `public: true` + owner/service-role write |
| A separate `next-seo` package | Next 16 Metadata API + inline JSON-LD cover everything; `next-seo` is a Pages-router-era crutch | Native `generateMetadata` + `<script type="application/ld+json">` |

## Stack Patterns by Variant

**If the skill writes config (MVP path, brief §8.2):**
- Validate with zod, then UPDATE via **service-role** (`createAdminClient`) — bypasses RLS, gated by slug resolution. No client write path.
- Because: matches the locked "config written via service-role" decision and the existing `set-plan` + admin-secret pattern.

**If/when the dashboard editor lands (Fase 5, deferred):**
- The owner-write Storage policy + owner RLS on `businesses` already cover authenticated edits; reuse `@supabase/ssr` browser client.
- Because: no new infra; the bucket policy was written owner-aware from day one.

**If dynamic branded OG cards are wanted later (Fase 4 stretch):**
- Add `app/[slug]/opengraph-image.tsx` using `next/og` `ImageResponse` (no install).
- Because: first-party Next 16 API; only render cost, no dependency.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `next@16.2.7` | `next/image`, `next/og`, Metadata API | All first-party; `next/og` and `generateMetadata` are stable in 16. Middleware is `proxy.ts` (not `middleware.ts`) — irrelevant to landing render but note for any host-resolution work (deferred Fase 9). |
| `next@16.2.7` `images.remotePatterns` | Supabase Storage public URLs | Must list the `<project-ref>.supabase.co` host + `/storage/v1/object/public/**` path or `next/image` throws at runtime. |
| `zod@4.4.3` | `@hookform/resolvers@5.4.0` | Already paired in the app; same schema usable in the (future) editor form. |
| `@supabase/supabase-js@2.106.2` | Storage API | Storage client is bundled; no separate `@supabase/storage-js` install. |
| Tailwind v4 (`@tailwindcss/postcss`) | `data-*` attribute selectors + `@theme inline` | CSS-first themes already proven in `themes.css`; presets are additive CSS, no build-config change. |

## Sources

- `web-builder-brief.md` (LOCKED decisions D1–D7, phases, skill spec) — HIGH
- `.planning/PROJECT.md`, `.planning/codebase/STACK.md` — installed versions verified via `node -p require(...).version` (next 16.2.7, zod 4.4.3, @supabase/supabase-js 2.106.2, @supabase/ssr 0.10.3, vitest 4.1.9) — HIGH
- `supabase/migrations/003_storage_attachments.sql`, `026_public_businesses_view.sql` — Storage + public-view patterns — HIGH
- `app/globals.css`, `app/themes.css`, `lib/theme-config.ts`, `components/palette-script.tsx` — existing CSS-first theming engine — HIGH
- `app/[slug]/layout.tsx` — existing `generateMetadata` + `cache()` + `PaletteScript` usage — HIGH
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md`, `.../05-config/01-next-config-js/images.md`, `.../01-getting-started/14-metadata-and-og-images.md` — Next 16 Metadata, `images.remotePatterns`, JSON-LD, `next/og` ImageResponse — HIGH
- `.claude/skills/instagram-a-web/SKILL.md` — build-time IG scraping ladder (Firecrawl/Playwright/WebFetch) — HIGH

---
*Stack research for: Forjo Web Builder (v0.10) — jsonb-config-driven themeable landing renderer*
*Researched: 2026-06-17*
