# Architecture Research

**Domain:** Themeable landing/web builder bolted onto an existing Next.js 16 App Router + Supabase multi-tenant SaaS (config-as-data, no per-client deploy)
**Researched:** 2026-06-17
**Confidence:** HIGH (verified against the actual codebase: `app/[slug]/page.tsx`, `app/[slug]/layout.tsx`, `app/[slug]/booking-client.tsx`, `components/palette-script.tsx`, migrations `026`, `003`)

> Scope note: this file answers HOW the v0.10 Web Builder components integrate with the existing architecture. The existing architecture (route groups, Supabase client planes, RLS) is treated as GIVEN and not re-researched. All LOCKED decisions from the brief (`landing_config jsonb`, single `<LandingRenderer>`, config-as-data, Zod + safe fallback, service-role writes, Storage-by-URL, no separate site, no per-client code) are honored.

---

## Standard Architecture

### System Overview — where the new pieces attach

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Cliente final (browser, anon)  →  GET /[slug]                             │
└───────────────────────────────┬──────────────────────────────────────────┘
                                 │
        ┌────────────────────────┴───────────────────────────┐
        │                                                      │
        ▼                                                      ▼
┌───────────────────────────┐                  ┌──────────────────────────────┐
│ app/[slug]/layout.tsx     │ (MODIFIED)       │ app/[slug]/page.tsx          │ (MODIFIED)
│  · getSlugBusiness()      │                  │  · reads public_businesses    │
│    service-role, base     │                  │    (anon, no cookies)         │
│    `businesses` table     │                  │  · + select landing_config    │
│  · generateMetadata()     │                  │  · parseLandingConfig() Zod   │
│    + og:image/desc        │                  │  · fetch booking props        │
│    + JSON-LD LocalBusiness│                  │    (services…locations) AS TODAY
│  · <PaletteScript>        │                  │  · <LandingRenderer config    │
│    + theme override from  │                  │       sections={…}            │
│      landing_config.theme │                  │       bookingProps={…}/>      │
└───────────────────────────┘                  └───────────────┬──────────────┘
                                                                │
                           ┌────────────────────────────────────┘
                           ▼
        ┌──────────────────────────────────────────────────────────┐
        │ <LandingRenderer>  (NEW · server component)               │
        │   sorts sections by order, filters enabled, maps type→cmp │
        └───┬──────┬──────┬──────┬───────┬───────┬───────┬──────────┘
            ▼      ▼      ▼      ▼       ▼       ▼       ▼
          Hero  About Services Gallery Location Hours   CTA   ┌─────────────────┐
         (NEW server sections, all pure-presentational)       │ Booking section │
                                                              │ wraps existing  │
                                                              │ <BookingClient> │ (UNCHANGED)
                                                              │  client island  │
                                                              └─────────────────┘
                                 │
                                 ▼
        ┌──────────────────────────────────────────────────────────┐
        │ Supabase                                                   │
        │  businesses.landing_config jsonb        (NEW column)       │
        │  public_businesses view + landing_config (MODIFIED view)   │
        │  storage bucket `landing-assets` (NEW, public read)        │
        └──────────────────────────────────────────────────────────┘
                                 ▲
                                 │ service-role UPDATE (no client write)
        ┌──────────────────────────────────────────────────────────┐
        │ skill `forjo-web-builder` (NEW, runs in Claude Code/VS)    │
        │  resolves slug → builds config → uploads images → UPDATE   │
        └──────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | New / Modified | File |
|-----------|----------------|----------------|------|
| `landing_config` column | Per-business landing config as JSON data | **NEW** | migration `030_*` on `businesses` |
| `public_businesses` view | Expose `landing_config` to anon alongside existing non-secret columns | **MODIFIED** | migration `030_*` (`CREATE OR REPLACE VIEW`) |
| `landing-assets` bucket | Public-read storage for hero/about/gallery images; owner-write | **NEW** | migration `031_*` (new bucket; do NOT reuse private `attachments`) |
| `LandingConfig` type + `parseLandingConfig()` | Zod schema + safe-fallback parser; invalid/null config → minimal valid landing | **NEW** | `lib/landing/schema.ts`, `lib/landing/types.ts` |
| `<LandingRenderer>` | Sort by `order`, filter `enabled`, dispatch `type` → section component; receives `bookingProps` | **NEW** server component | `app/[slug]/landing/landing-renderer.tsx` |
| Section components (Hero/About/Services/Gallery/Location/Hours/CTA) | Render one section from its `data` + theme tokens; pure presentational | **NEW** server components | `app/[slug]/landing/sections/*.tsx` |
| Booking section wrapper | Thin server wrapper that renders the existing `<BookingClient>` with the props `page.tsx` already fetches | **NEW** (wrapper) / `BookingClient` **UNCHANGED** | `app/[slug]/landing/sections/booking-section.tsx` |
| `app/[slug]/page.tsx` | Read `landing_config` from view, parse, pass booking props + sections to renderer | **MODIFIED** | `app/[slug]/page.tsx` |
| `app/[slug]/layout.tsx` | Theme override + extended `generateMetadata` (og/JSON-LD) from config | **MODIFIED** | `app/[slug]/layout.tsx` |
| `<PaletteScript>` | Apply per-business palette/theme/font (already does); fed theme override resolved from config | **MODIFIED call-site, possibly UNCHANGED component** | `components/palette-script.tsx` |
| Theme presets | 2–3 token sets (color/typo/radius/spacing) as CSS `[data-theme=...]` selectors in `globals.css` | **NEW** (extends existing token system) | `app/globals.css` |
| skill `forjo-web-builder` | Build config, scrape IG (optional), upload images, service-role UPDATE, return preview URL | **NEW** | `.claude/skills/forjo-web-builder/SKILL.md` |

---

## Recommended Project Structure

```
app/[slug]/
├── page.tsx                         # MODIFIED — reads+parses landing_config, renders LandingRenderer
├── layout.tsx                       # MODIFIED — theme override + generateMetadata (og + JSON-LD)
├── booking-client.tsx               # UNCHANGED — stays the client island
└── landing/                         # NEW — all web-builder presentation lives here
    ├── landing-renderer.tsx         # server: order/enabled dispatch
    └── sections/
        ├── hero-section.tsx         # server
        ├── about-section.tsx        # server
        ├── services-section.tsx     # server (source:"auto" reads injected services prop)
        ├── gallery-section.tsx      # server (images by URL)
        ├── location-section.tsx     # server
        ├── hours-section.tsx        # server (reads injected timeBlocks/exceptions)
        ├── cta-section.tsx          # server (whatsapp link)
        └── booking-section.tsx      # server wrapper → <BookingClient {...bookingProps}/>

lib/landing/
├── types.ts                         # NEW — LandingConfig, Section, Theme TS types
├── schema.ts                        # NEW — Zod schemas + parseLandingConfig() safe fallback
├── presets.ts                       # NEW — preset id → theme metadata (font choices, defaults)
└── default-config.ts               # NEW — DEFAULT_LANDING_CONFIG (Hero + Booking only)

supabase/migrations/
├── 030_landing_config.sql           # NEW — add column + CREATE OR REPLACE VIEW public_businesses
└── 031_landing_assets_bucket.sql    # NEW — public bucket + owner-write policy

components/palette-script.tsx        # MODIFIED call-site only (theme arg now may come from config)
app/globals.css                      # MODIFIED — add [data-theme=preset] token blocks + dark variants
```

### Structure Rationale

- **`app/[slug]/landing/`:** co-locates all builder UI under the public route it serves, matching the existing co-location convention (`*-client.tsx` lives next to its `page.tsx`). Keeps `BookingClient` exactly where it is so the diff to it is zero.
- **`lib/landing/`:** schema/types/presets are framework-agnostic domain logic → belongs in `lib/` per the project's layering convention. `parseLandingConfig` must be importable by both `page.tsx` (render) and the skill/any future editor (validate before write).
- **Two migrations, not one:** column+view change (`030`) is independent of the storage bucket (`031`). Splitting keeps each hand-applied migration atomic and reviewable, per the repo's numbered-SQL convention. (Next free number is `030`; latest applied is `029`.)
- **New bucket, not reuse:** `attachments` (`003`) is `public:false` with owner-only RLS — landing images must be **publicly readable** by anon visitors. Reusing it would either break privacy of client attachments or fail to serve images. A dedicated public `landing-assets` bucket is required (resolves brief open question §6.1).

---

## Architectural Patterns

### Pattern 1: Parse-at-the-edge with safe fallback (no-regression guarantee)

**What:** `page.tsx` reads the raw `landing_config` jsonb, runs it through `parseLandingConfig()` which returns a **guaranteed-valid** `LandingConfig`. On `null`, malformed JSON, or Zod failure it returns `DEFAULT_LANDING_CONFIG`, never throws.

**When to use:** every render of `/[slug]`. This is the single seam that makes "invalid config can NEVER break the public page" true and gives existing businesses (config = null) today's behavior.

**Trade-offs:** a malformed config silently degrades to the default instead of erroring — correct for a public page (availability > strictness), but the editor/skill must validate with the *same* schema before writing so authors get feedback. Validation logic lives once in `lib/landing/schema.ts` and is shared.

**Example:**
```typescript
// lib/landing/schema.ts
export function parseLandingConfig(raw: unknown): LandingConfig {
  const result = landingConfigSchema.safeParse(raw)
  if (result.success) return result.data
  // null, {}, malformed, or partially-invalid → minimal functional landing
  return DEFAULT_LANDING_CONFIG   // { theme:{preset:'bauhaus-light'}, sections:[hero, booking] }
}

// app/[slug]/page.tsx (after fetching `business` from public_businesses)
const config = parseLandingConfig(business.landing_config)
```

### Pattern 2: Injected-props sections (server renderer, client island unchanged)

**What:** `<LandingRenderer>` is a server component. Data-bearing sections (`services:auto`, `hours`, `booking`) do **not** re-fetch — they receive the data `page.tsx` already fetched as props. The renderer threads `bookingProps` straight through to the booking section, which renders the **untouched** `<BookingClient>`.

**When to use:** any section whose content overlaps data the page already loads. Avoids N+1 fetches and keeps a single source of truth for services/hours/availability.

**Trade-offs:** the renderer signature carries both `config.sections` and a `data` bundle (`{services, professionals, timeBlocks, exceptions, locations}`). Slightly wider prop surface, but it preserves the booking flow verbatim (LOCKED) and keeps everything except `BookingClient` as server components (zero added client JS for Hero/About/Gallery/etc.).

**Example:**
```tsx
// app/[slug]/landing/landing-renderer.tsx  (server)
export function LandingRenderer({ config, data }: { config: LandingConfig; data: BookingData }) {
  const sections = config.sections
    .filter(s => s.enabled)
    .sort((a, b) => a.order - b.order)
  return (
    <main>
      {sections.map(s => {
        switch (s.type) {
          case 'hero':     return <HeroSection key={s.type} data={s.data} />
          case 'services': return <ServicesSection key={s.type} data={s.data} services={data.services} />
          case 'hours':    return <HoursSection key={s.type} data={s.data} timeBlocks={data.timeBlocks} exceptions={data.exceptions} />
          case 'booking':  return <BookingSection key={s.type} data={s.data} {...data} />  // → <BookingClient>
          // about, gallery, location, cta…
        }
      })}
    </main>
  )
}
```

### Pattern 3: Theme = data-attribute presets over the existing PaletteScript system (no FOUC, no per-client CSS)

**What:** Themes are NOT new CSS per client. Each preset is a `[data-theme="preset-id"]` token block added once to `globals.css` (mirroring the existing `data-palette`/`data-theme` model). `landing_config.theme.preset` selects which attribute value `<PaletteScript>` writes onto `<html>` *before paint* (the script already runs inline in the layout, eliminating FOUC). Optional `primary`/font overrides become inline CSS custom properties on the same element.

**When to use:** all per-business theming. The existing `PaletteScript` already accepts `palette/theme/font` and writes them synchronously in `<head>` — the builder reuses that exact mechanism, so there is no flash and no per-client code.

**Trade-offs:** overrides are limited to the variables the token system exposes (color/typo/radius/spacing) — intentional (LOCKED: themeable template, not bespoke). Free-form per-client CSS is explicitly out of scope. The one decision to make in plan-phase: where the theme value comes from — `layout.tsx` reads the base table via service-role; `page.tsx` reads the view. Recommendation: resolve theme in `layout.tsx` from `landing_config.theme` (extend `getSlugBusiness` select to include `landing_config`, fall back to existing `palette/theme/font` columns when config is null) so the attribute is set in the same place it is today.

**Example:**
```css
/* app/globals.css — one block per preset, plus dark variant, no per-client rules */
[data-theme="bauhaus-light"] { --primary: #d94a2b; --radius: 0.25rem; /* … */ }
.dark[data-theme="bauhaus-light"] { --primary: #e85c3d; /* … */ }
```
```tsx
// app/[slug]/layout.tsx — override layered as inline custom props (optional)
<PaletteScript palette={business?.palette} theme={config.theme.preset} font={config.theme.font_body} />
{config.theme.primary && <style>{`[data-slug-override]{--primary:${sanitize(config.theme.primary)}}`}</style>}
```

### Pattern 4: Service-role write, anon read (config-as-data, no deploy)

**What:** The skill writes `landing_config` via a **service-role UPDATE** on the `businesses` row (server-side, never from a browser). The public page reads it through the anon `public_businesses` view. Because `/[slug]` is `force-dynamic`, the new config is live on the next request — applying = writing the row, no deploy, no "publish".

**When to use:** the skill flow, and any future dashboard editor (which should write via the same admin/endpoint pattern — `set-plan`+`ADMIN_SECRET` style, never client-side).

**Trade-offs:** consistent with the existing service-role-only-on-server constraint and the booking write pattern. The write path MUST validate with the shared Zod schema before UPDATE so a bad config never lands in the DB (defense in depth on top of the read-side fallback).

---

## Data Flow

### Request flow (public landing render)

```
GET /[slug]
   ↓
layout.tsx: getSlugBusiness(slug)  [service-role, base `businesses`, cached]
   ↓  resolve theme.preset from landing_config (or palette/theme/font fallback)
   → <PaletteScript> writes data-theme on <html>  (pre-paint, no FOUC)
   → generateMetadata: og:image = hero image, description, JSON-LD LocalBusiness
   ↓
page.tsx: createPublicServerClient() [anon, no cookies]
   → select from public_businesses (… + landing_config)
   → parseLandingConfig(business.landing_config)  ── null/invalid → DEFAULT_LANDING_CONFIG
   → Promise.all: services(public_services), professionals(public_professionals),
                  timeBlocks, exceptions, locations   [AS TODAY — unchanged]
   ↓
<LandingRenderer config={…} data={{services, professionals, timeBlocks, exceptions, locations}}>
   → ordered, enabled sections render server-side
   → booking section → <BookingClient {...data}>  [client island, unchanged]
   ↓
HTML to client
```

### Write flow (skill applies a landing)

```
forjo-web-builder skill (Claude Code / VS, service-role env)
   → resolve slug → business.id; read services for services:auto
   → (optional) scrape IG via instagram-a-web engine → copy/images
   → build LandingConfig object; humanizador on copy
   → upload images to storage bucket `landing-assets/<business_id>/...`  → public URLs
   → validate config with landingConfigSchema (FAIL → fix, never write invalid)
   → service-role UPDATE businesses SET landing_config = <json> WHERE slug = …
   → return preview URL /[slug]  (live immediately — force-dynamic)
```

### Key data flows

1. **No-regression for null config:** existing businesses have `landing_config = null` → `parseLandingConfig` → `DEFAULT_LANDING_CONFIG`. Recommendation: make the literal default render exactly today's bare `BookingClient` layout for byte-for-byte parity (safest no-regression baseline), with "Hero + Booking" being the first *configured* state, not the empty default. Decide the exact default shape in plan-phase.
2. **services:auto single source of truth:** the Services section reuses the `services` array already fetched (from `public_services`), never duplicating service content into the config (brief §2).
3. **Theme split-brain risk:** `layout.tsx` reads the base table (service-role); `page.tsx` reads the view (anon). Both must agree on theme. Resolve theme in ONE place (layout, from `landing_config.theme`) and let the page only render content — see Anti-Pattern 2.

---

## Scaling Considerations

| Scale | Architecture adjustments |
|-------|--------------------------|
| 0–50 businesses (MVP) | Current force-dynamic per-request read is fine. Skill writes one row at a time. No editor needed (brief defers it). |
| 50–500 businesses | Consider image CDN/transform on the public bucket (Supabase image transforms) for hero LCP. Possibly add a `version` field to the config for safe schema migrations. |
| 500+ businesses | Per-business custom domains (deferred Fases 8/9) + Vercel Pro; ISR/cache with on-write revalidation if force-dynamic read cost matters. |

### Scaling priorities

1. **First bottleneck — hero image LCP/CLS:** large unoptimized hero images hurt the public page's Core Web Vitals. Fix with `next/image` + explicit `width/height` + Supabase image transforms; this is also the og:image (1200×630). Address in the SEO/OG phase.
2. **Second bottleneck — schema evolution:** once configs exist in many rows, changing the schema shape needs care. Mitigate by versioning the Zod schema and keeping `parseLandingConfig` tolerant (drop unknown keys, coerce, fall back per-section rather than whole-config).

---

## Anti-Patterns

### Anti-Pattern 1: Re-fetching data inside section components

**What people do:** make `ServicesSection`/`HoursSection`/`BookingSection` fetch their own services/hours/availability from Supabase.
**Why it's wrong:** duplicates queries the page already runs, risks divergent results, and would force those sections to become async/client where they shouldn't. Booking especially must keep its single fetched prop set.
**Do this instead:** `page.tsx` fetches once (as today) and the renderer injects the data as props (Pattern 2). Sections are pure functions of `(data, theme)`.

### Anti-Pattern 2: Reading theme/config from two sources that can disagree

**What people do:** resolve the theme from `palette/theme/font` columns in `layout.tsx` while reading `landing_config.theme` in `page.tsx`, or vice versa.
**Why it's wrong:** `layout.tsx` uses service-role on the base table; `page.tsx` uses anon on the view. They can drift (config says one preset, columns say another), producing a flash or mismatched theme.
**Do this instead:** make `landing_config.theme` the single source for the builder. Extend `getSlugBusiness`'s select to include `landing_config`, resolve the preset there, and feed `<PaletteScript>`. Keep `palette/theme/font` columns as the fallback only when `landing_config` is null (preserves dashboard/preview behavior).

### Anti-Pattern 3: Letting a section component throw on missing data

**What people do:** assume `data.headline` / `data.images` exist and crash when a hand-written or scraped config omits them.
**Why it's wrong:** one bad section would 500 the whole public page, defeating the safe-fallback guarantee.
**Do this instead:** the Zod schema fills defaults per field; sections additionally treat empty arrays/strings as "render nothing / render fallback". Fail soft at the section level, not just the whole-config level.

### Anti-Pattern 4: Writing config from the client or storing images in the private bucket

**What people do:** add a client-side write to `landing_config`, or push landing images into the `attachments` bucket.
**Why it's wrong:** client writes bypass the service-role-only constraint (tenant-tampering surface); `attachments` is `public:false` so images wouldn't load for anon visitors and would mix with private client files.
**Do this instead:** writes only via service-role (skill) or an admin endpoint with `ADMIN_SECRET`; images only in the new public `landing-assets` bucket, referenced by URL.

---

## Integration Points

### Existing system touch-points (each marked new/modified)

| Boundary | Integration | New / Modified | Notes |
|----------|-------------|----------------|-------|
| `public_businesses` view ↔ page | add `landing_config` column to the view + to the page's explicit `.select(...)` string | MODIFIED (both) | `CREATE OR REPLACE VIEW` is idempotent (matches migration 026 style). Still exposes no secrets. The page's `.select(...)` is an explicit column list — must add `landing_config` there too. |
| `app/[slug]/page.tsx` ↔ `<LandingRenderer>` | parse config, inject booking data as props | MODIFIED page + NEW renderer | Booking props (`services, professionals, timeBlocks, exceptions, locations`) stay byte-identical to today. |
| `app/[slug]/layout.tsx` ↔ theming | resolve `theme.preset`, feed `<PaletteScript>` | MODIFIED | Extend cached `getSlugBusiness` select to include `landing_config`; fall back to `palette/theme/font`. |
| `app/[slug]/layout.tsx` ↔ SEO | extend `generateMetadata`: `description`, `og:title/description/image/url`, JSON-LD `LocalBusiness` | MODIFIED | og:image = hero image from config (1200×630). Reuses the `cache()`d business read — no extra query. JSON-LD emitted as a `<script type="application/ld+json">` rendered in `layout.tsx` body. |
| `<PaletteScript>` / `globals.css` ↔ themes | add `[data-theme=preset]` token blocks + dark variants | MODIFIED globals; PaletteScript likely UNCHANGED | Reuses the existing pre-paint, no-FOUC mechanism. PaletteScript already accepts `theme`/`font`; the change is the arg source + new CSS blocks. |
| `BookingClient` ↔ booking section | render unchanged inside a thin server wrapper | UNCHANGED client + NEW wrapper | LOCKED: do not touch the booking/payment flow. Wrapper just forwards the existing props. |
| Storage `landing-assets` ↔ sections | images referenced by public URL in config | NEW bucket | Public read; owner-write RLS via `(storage.foldername(name))[1] = business_id`, mirroring bucket `003` policy shape but `public:true`. |
| skill `forjo-web-builder` ↔ DB/Storage | service-role UPDATE + image upload | NEW | Validates with shared Zod schema before write; returns `/[slug]` preview. |

### External services

| Service | Integration pattern | Notes |
|---------|---------------------|-------|
| Supabase Storage | new public bucket `landing-assets`, owner-write policy, URLs in config | Public read is the change vs. existing `attachments` (private). |
| Instagram (via `instagram-a-web` skill) | scrape engine only → raw copy/images for the config | LOCKED: no HTML output, content only. Optional input to the skill. |
| MercadoPago / booking | untouched — booking section reuses `BookingClient` | LOCKED: no changes to seña/availability/webhook flow. |

### Internal boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `lib/landing/schema.ts` ↔ page render + skill write | shared `parseLandingConfig` / `landingConfigSchema` | One schema, two consumers — read-side fallback and write-side validation must use the same definition. |
| renderer ↔ sections | typed `data` prop per section type | Discriminated union on `type`; renderer owns the switch, sections stay dumb. |

---

## Suggested Build Order (dependencies respected)

The brief's Fases 1→4 + 6 map cleanly to a dependency chain. Recommended order:

1. **Schema + Storage + types (foundation).** Migration `030` (`landing_config` column + add to `public_businesses` view). Migration `031` (public `landing-assets` bucket + owner-write policy). `lib/landing/types.ts`, `schema.ts` (Zod), `default-config.ts`. Wire `parseLandingConfig` into `page.tsx` reading the new column — with the default equal to today's output (no-regression proven before any new UI exists). *Unblocks everything; nothing else can be tested without the column + parser.*
2. **Renderer + sections.** `<LandingRenderer>` + the seven presentational sections + the booking wrapper (reusing `BookingClient` verbatim). Inject booking data as props. *Depends on 1 (needs the parsed config shape).*
3. **Theming.** Add 2–3 preset token blocks + dark variants to `globals.css`; resolve `theme.preset` in `layout.tsx` and feed `<PaletteScript>`; layer optional overrides. *Depends on 2 (sections must exist to be themed) and on the config theme shape from 1.*
4. **SEO/OG.** Extend `generateMetadata` (og:image from hero, description) + JSON-LD `LocalBusiness`; optimize hero image (`next/image`, width/height) for LCP/CLS. *Depends on 1 (reads config) and benefits from 2 (hero section/image exists).*
5. **Skill `forjo-web-builder`.** Build config, optional IG scrape, image upload, service-role UPDATE, preview. *Depends on 1–4 (writes the schema the renderer/theming/SEO consume; validates with the same Zod schema).*

Operational track (Fases 7–9: in-app sales, per-business URLs, custom domain) is deferred this milestone (PROJECT.md out-of-scope) and does not block 1–5.

---

## Sources

- `app/[slug]/page.tsx`, `app/[slug]/layout.tsx`, `app/[slug]/booking-client.tsx` (verified current behavior) — HIGH
- `components/palette-script.tsx` (theming mechanism, pre-paint no-FOUC) — HIGH
- `supabase/migrations/026_public_businesses_view.sql` (view pattern, secret exclusion) — HIGH
- `supabase/migrations/003_storage_attachments.sql` (bucket/RLS shape; confirmed `public:false`) — HIGH
- `.planning/PROJECT.md`, `web-builder-brief.md` (LOCKED decisions, phases, skill spec) — HIGH
- `.planning/codebase/ARCHITECTURE.md` (existing layering, anti-patterns, client planes) — HIGH

---
*Architecture research for: Forjo Web Builder (v0.10) integration into existing Next.js 16 + Supabase multi-tenant SaaS*
*Researched: 2026-06-17*
