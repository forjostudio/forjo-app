# Feature Research

**Domain:** Themeable, fixed-section marketing landing page with integrated booking, for small service businesses (peluquerías, consultorios, estudios) in Argentina — milestone v0.10 Forjo Web Builder
**Researched:** 2026-06-17
**Confidence:** HIGH (scope is locked by brief; categorization grounded in small-business booking-page conventions + the jjotalab reference + premium scroll-UI trends)

> **Scope guardrail (LOCKED — from the brief).** This is a **fixed-section, very-themeable template**, NOT a free-form site builder. Section set is fixed: Hero, About, Services, Gallery, Location, Hours, Booking, CTA. Per business you vary: colors / typography / images / order / on-off toggles. Config is `landing_config jsonb` (data, not code). The Booking section reuses the existing `BookingClient` verbatim. A skill (`forjo-web-builder`) populates the config. **Editor-in-dashboard, in-app sales, and custom domains are OUT of scope this milestone.** Every feature below is judged against *this* scope — "table stakes" means "table stakes for a fixed-section themeable landing that renders premium and degrades safely," not "table stakes for a generic website builder."
>
> **Critical reframe for the roadmapper.** Because the section content is largely **derived from data the business already gave Forjo** (services, hours, locations, professionals) and the booking flow already exists, the v0.10 work is overwhelmingly about **(a) rendering those sections premium, (b) theming them, and (c) degrading safely when content is sparse** — NOT about inventing new business capabilities. Treat "premium rendering + safe empty-state" as the table-stakes core, not the differentiator.

## Feature Landscape

### Table Stakes (Users Expect These)

Missing these = the landing feels broken, amateur, or worse than the plain `/[slug]` it replaces.

| Feature | Why Expected | Complexity | Notes / Data Dependency |
|---------|--------------|------------|-------|
| **Hero section** (headline, subhead, background image, primary CTA → booking) | First screen; answers "what is this, for whom, what do I do now." Every small-business landing has one. | LOW | Data: business `name`, optional hero image (Storage). CTA scrolls/links to Booking section. Headline/subhead from config (skill writes them). |
| **Booking section = existing `BookingClient`, rendered in-page** | The entire point of the milestone (D1/D4): native reservations, no CORS, no duplicated seña/MercadoPago flow. | MEDIUM | Data: services, professionals, timeBlocks, exceptions, locations — **already fetched by `page.tsx`**. Risk: BookingClient must render inside a themed section without style bleed. |
| **Services section, `source:"auto"` from `services` table** | Users expect to see what's offered + price before booking. Auto-source avoids content duplication. | LOW–MEDIUM | Data: `services` table (name, price, duration, maybe description). Must respect vertical terminology (salud/belleza/general). Empty/1-service businesses need a graceful layout. |
| **Hours section** (opening hours) | Local-business table stakes; "are they open / when can I go." | LOW | Data: business hours (`public_business_hours` view exists). Argentina UTC-3, fixed TZ. Render as a clean weekly grid; collapse closed days sensibly. |
| **Location section** (address + map) | "Where are they." Expected for any physical-location service business. | LOW–MEDIUM | Data: `locations` table (address, maybe lat/lng or a `map_url`). If multiple locations, list them. If online-only, must hide cleanly. |
| **CTA section** (WhatsApp contact) | Argentina default contact channel; users expect a direct line, not only a form. | LOW | Data: business WhatsApp (already normalized to `wa.me` per conventions). Pre-filled message is a nice touch. |
| **Mobile-first responsive rendering (375px baseline)** | Majority of small-business traffic is mobile; CLAUDE rules mandate it. A landing that breaks on a phone is a regression vs the current page. | MEDIUM | Touch targets ≥44px, no hover-only affordances, single-column stacking of every section. |
| **Theming: 2–3 presets (color / type / radius / spacing) + per-config overrides** | Without theming this is just the current page; theming is the product. Reuses `PaletteScript` / `data-palette` infra. | MEDIUM | Presets as token sets in `globals.css`. Overrides (primary color, fonts within an allowed set) from `landing_config.theme`. Dark mode coherent (Bauhaus dark is brand). |
| **Section ordering + on/off toggles honored by renderer** | The "configurable" half of "fixed-section configurable." Renderer composes by `order` + `enabled`. | LOW–MEDIUM | Pure rendering logic over `landing_config.sections[]`. Disabled section = not rendered, no gap. |
| **Safe default when `landing_config` is null/invalid** | A bad/empty config must NOT break the public page or regress the current booking experience. | MEDIUM | **See "Safe Default Landing" below.** Null → minimal functional landing (Hero + Booking). Invalid → Zod-validated fallback, never a 500. This is a security/availability requirement, not cosmetic. |
| **No-regression fallback for businesses without a landing** | Most businesses won't have a custom landing on day 1; they must keep working exactly as today. | MEDIUM | If no `landing_config`, render today's `/[slug]` behavior (or the safe default). Explicit acceptance criterion. |
| **SEO/OG basics per business** | A "web a medida" with no meta description / OG image looks broken when shared on WhatsApp/IG. | MEDIUM | Data: hero image → `og:image` (1200×630), business name/desc → title/description, JSON-LD `LocalBusiness` (name, address, hours, phone). Extends existing `app/[slug]/layout.tsx` metadata. |
| **About section** (story/positioning + image) | Standard small-business trust block ("who are you"). | LOW | Data: config `title`/`body`/`image`. Optional — must hide cleanly when empty. |
| **Image storage + public read for landing assets** | Hero/About/Gallery need hosted images. | LOW–MEDIUM | Decide: reuse `003_storage_attachments` bucket vs new `landing-assets`. Public read, owner/service-role write. |

### Differentiators (Competitive Advantage)

These are where the "jjotalab-tier premium" promise is won. Align with Core Value of "diseñable y temable."

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Premium scroll feel: reveal-on-scroll, smooth section transitions, sticky/shrinking nav** | This is the entire reason to pay for "una web a medida" vs the plain booking page. 2026 premium landings are scroll-driven: fade/slide/blur reveals, sections that transition into each other, sticky header that compresses on scroll. | MEDIUM | Reference `web-scrolling` skill as *criterion* (not its HTML). Keep animations minimal/tasteful. **Must respect `prefers-reduced-motion`** and not animate layout-triggering props (use transform/opacity per CLAUDE rules). |
| **Gallery section** (curated photos, premium grid/masonry/lightbox) | Beauty/aesthetics/studio verticals sell on visuals; a strong gallery is the single biggest "premium" lever for these businesses. | MEDIUM | Data: `gallery.images[]` (Storage URLs). Default `enabled:false` (only on when photos exist). Needs lazy-loading + `width/height` to protect CLS. |
| **Theme presets that actually feel distinct (e.g. light / dark-Bauhaus / high-contrast)** | A business should be able to look meaningfully different from the next, within guardrails. 2–3 genuinely different presets >> one preset with a color swap. | MEDIUM | Curated, opinionated presets beat infinite knobs. Each preset = coherent color + type + radius + spacing set. |
| **Vertical-aware copy & terminology in sections** | Reuses existing verticals (salud/belleza/general) so a clinic's landing reads like a clinic, a salon's like a salon — without per-client code. | LOW–MEDIUM | Reuse `lib/verticals.ts` + `use-terminology`. Mostly affects Services/Hours/Booking labels. |
| **Skill-generated content from Instagram scrape (bio, copy, photos)** | Turns "I have nothing written" into a populated, on-brand landing in one skill run. Big operational lever for Forjo Studio (you, not the client, populate it). | HIGH (but in the skill, not the runtime) | Reuses `instagram-a-web` scraping engine + `humanizador` for copy. **Out of the React app**: this is skill-side config generation. Roadmap it as the *last* phase (needs all sections + theming done). |
| **OG image auto-derived from hero** | Shared links look designed, not default. Cheap once SEO phase exists. | LOW | Falls out of the SEO/OG work; flag as "use hero image, fall back to a branded default." |
| **JSON-LD `LocalBusiness` structured data** | Local SEO / rich results for "peluquería cerca de mí" type queries. Genuine differentiator for a small business that otherwise has no SEO. | LOW–MEDIUM | Built from hours/location/phone data already present. |

### Anti-Features (Commonly Requested, Often Problematic)

These seem reasonable but violate the locked scope or create disproportionate risk. **The roadmapper should treat these as explicit non-goals.**

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Free-form / drag-and-drop layout per client** | "Make it fully custom." | Breaks D2/D3 (fixed sections). Explodes complexity, QA surface, and accessibility risk. Turns config-as-data into a layout engine. | Fixed sections + theming + order/on-off. Bespoke = future standalone-via-API milestone (D6). |
| **Editor-in-dashboard this milestone** | "Let the owner edit their own page." | Explicitly out of scope (brief §1, PROJECT.md). Adds a whole authenticated write UI + validation + preview surface. | Skill writes `landing_config` by slug (service-role + Zod). Editor is a later milestone. |
| **In-app sales / `landing_status` / upsell section** | "Sell the add-on inside the app." | Out of scope (Fase 7 deferred). Couples a marketing/billing flow into the rendering milestone. | Manual sales now; the rendering + skill ship first. |
| **Custom domains / per-business base URLs** | "My own domain." | Out of scope (Fases 8–9 deferred). Requires Vercel Pro, host-based tenant resolution in `proxy.ts`, and re-parametrizing every hardcoded `NEXT_PUBLIC_APP_URL` (emails, MP `back_url`). High blast radius on payments. | Serve at `/[slug]`. Domains are a separate milestone with its own URL-parametrization phase. |
| **Arbitrary fonts / Google-Fonts-by-URL / arbitrary CSS in config** | "Use exactly my brand font." | Unbounded input into a public page = perf (LCP/CLS), consistency, and injection-surface risk. Config is data that anon reads via `public_businesses`. | Fonts limited to an **allowed set**; theme overrides constrained to known tokens. Validate with Zod; reject anything outside the allowlist. |
| **Raw HTML / embed blocks in sections** | "Paste my own widget / tracking / iframe." | Injection risk into a multi-tenant public page; breaks "only Forjo-native components" guardrail (skill spec §4). | Fixed section types only. No arbitrary markup ever enters the Next app. |
| **Optimistic/cached "publish" workflow with draft vs live states** | "Preview before publishing." | Adds state machine + cache invalidation. `/[slug]` is already `force-dynamic`; writing the row IS publishing (brief §8.2 — instant, no deploy). | Skill returns a live preview URL; the row write is the publish. No separate draft system. |
| **Per-service manual ordering / featured flags in the landing** | "Highlight my top service." | Tempting scope creep into Services management; risks divergence from the `services` table source of truth. | Start with `source:"auto"` (table order). Treat manual ordering as an open question (brief §6.4), not v1. |
| **Testimonials / reviews section** | Standard landing trust block. | Not in the locked section set, and there's no reviews data model in Forjo today. Adding it = new schema + moderation. | Out of scope. CTA + Gallery + About carry the trust load for v1. Revisit only with a real reviews model. |
| **Contact form (separate from booking)** | "Let people message me." | Duplicates the WhatsApp CTA and the booking flow; adds spam/abuse surface (another public write endpoint). | CTA section = WhatsApp deep link. Booking handles actual appointments. |
| **Multi-page sites (separate /about, /services routes)** | "I want a real website." | Breaks the single-page `/[slug]` model and force-dynamic rendering; multiplies SEO/routing work. | One scroll-driven page with anchored sections (matches 2026 premium one-pager convention). |

## Feature Dependencies

```
[Config schema + storage + LandingConfig type + Zod + safe default]   ← foundation
        |
        +──required by──> [Sections + <LandingRenderer> (order/enabled)]
        |                        |
        |                        +──required by──> [Booking section = BookingClient integration]
        |                        +──required by──> [Themes (presets + overrides)]
        |                        +──required by──> [SEO/OG + JSON-LD]
        |
        +──required by──> [Image storage bucket]  ──enhances──> [Hero / About / Gallery]

[Themes] ──enhances──> [Premium scroll feel]   (theming + motion together = "jjotalab tier")

[All sections + Themes + SEO done] ──required by──> [Skill `forjo-web-builder`]
                                                          |
                                          [IG scrape + humanizador] ──enhances──> [Skill]

[Custom domains]  ──conflicts(this milestone)──>  [scope]   (deferred — Fases 8–9)
[Editor-in-dashboard] ──conflicts(this milestone)──> [scope] (deferred — Fase 5/next)
```

### Dependency Notes

- **Everything requires the config schema + safe default first.** The `LandingConfig` type, its Zod validator, and the null/invalid fallback are the foundation; no section can render without it. This must be phase 1 and must include the "config can never break the public page" guarantee.
- **Sections + renderer must exist before themes, booking integration, and SEO.** Themes style the sections; SEO reads section data; booking is a section. The renderer (compose by `order`/`enabled`) is the spine.
- **Image storage is needed before Hero/About/Gallery can show photos**, but those sections can ship text-only first and gain images once the bucket exists. Storage is low-risk and can land in the foundation phase.
- **The skill is strictly last.** It populates a config whose shape, sections, themes, and SEO behavior must already be final. Building the skill earlier means rebuilding it.
- **Premium scroll feel pairs with theming**, not with the raw section build — animate after the sections look right, and gate all motion behind `prefers-reduced-motion`.
- **Custom domains and the dashboard editor actively conflict with this milestone's scope** and must not be pulled forward; they have their own deferred phases with payment/URL blast radius.

## MVP Definition

### Launch With (v1 — this milestone)

The minimum that makes `/[slug]` a *premium, themeable, safe* landing with native booking.

- [ ] **Config schema + `LandingConfig` type + Zod validation + safe default** — foundation; guarantees a bad config never breaks the public page.
- [ ] **Image storage bucket** (public read, owner/service-role write) — needed for any imagery.
- [ ] **`<LandingRenderer>` composing fixed sections by `order`/`enabled`** — the spine.
- [ ] **Hero + Booking sections** — the irreducible landing (matches the brief's "Hero + Booking minimum" safe default).
- [ ] **Services (auto) + Hours + Location + CTA(WhatsApp) sections** — local-business table stakes, all from existing data.
- [ ] **About + Gallery sections** — present but default-off until content exists.
- [ ] **No-regression fallback** — businesses without a landing keep working exactly as today.
- [ ] **2–3 theme presets + constrained per-config overrides + coherent dark mode** — theming is the product.
- [ ] **Mobile-first responsive + WCAG AA + focus states** — non-negotiable per project rules.
- [ ] **SEO/OG per business + JSON-LD `LocalBusiness`** — a "web a medida" must be shareable and indexable.
- [ ] **Skill `forjo-web-builder`** (writes config by slug via service-role; IG scrape optional) — how a client is actually onboarded without code.

### Add After Validation (v1.x)

- [ ] **Premium scroll/reveal animations + sticky-shrink nav** — ship the static premium layout first; layer tasteful motion once sections are stable and `prefers-reduced-motion` is handled. *Trigger: sections + theming verified, no CLS regressions.*
- [ ] **Manual service ordering / featured services in the landing** — *Trigger: a real client asks and `source:"auto"` proves insufficient.*
- [ ] **Richer per-business OG image variants** — *Trigger: sharing analytics show it matters.*

### Future Consideration (v2+ — separate milestones)

- [ ] **Editor-in-dashboard** — *Defer: out of scope; needs a full authenticated write+preview UI.*
- [ ] **In-app sales + `landing_status` upsell** — *Defer: business-flow milestone (Fase 7).*
- [ ] **Per-business URLs + custom domains** — *Defer: Vercel Pro + host resolution + URL re-parametrization across payments/emails (Fases 8–9).*
- [ ] **Standalone bespoke site via public API (CORS + embeddable widget)** — *Defer: only for clients the fixed template can't serve (D6).*
- [ ] **Testimonials/reviews section** — *Defer: needs a reviews data model that doesn't exist today.*

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Config schema + Zod + safe default | HIGH | MEDIUM | P1 |
| `<LandingRenderer>` (order/enabled) | HIGH | MEDIUM | P1 |
| Hero section | HIGH | LOW | P1 |
| Booking section (BookingClient integration) | HIGH | MEDIUM | P1 |
| No-regression fallback | HIGH | MEDIUM | P1 |
| Services (auto) section | HIGH | LOW–MEDIUM | P1 |
| Hours section | MEDIUM | LOW | P1 |
| Location section | MEDIUM | LOW–MEDIUM | P1 |
| CTA (WhatsApp) section | MEDIUM | LOW | P1 |
| Theme presets + constrained overrides | HIGH | MEDIUM | P1 |
| Image storage bucket | MEDIUM | LOW–MEDIUM | P1 |
| Mobile-first + WCAG AA | HIGH | MEDIUM | P1 |
| SEO/OG + JSON-LD | MEDIUM–HIGH | MEDIUM | P1 |
| About section | MEDIUM | LOW | P1 (off by default) |
| Gallery section | MEDIUM–HIGH | MEDIUM | P1 (off by default) |
| Skill `forjo-web-builder` | HIGH | HIGH | P1 (last phase) |
| Premium scroll/reveal animations | MEDIUM–HIGH | MEDIUM | P2 |
| IG scrape into config | MEDIUM | HIGH | P2 (skill enhancement) |
| Manual service ordering/featured | LOW–MEDIUM | MEDIUM | P3 |
| Editor-in-dashboard | MEDIUM | HIGH | P3 (deferred) |
| Custom domains | MEDIUM | HIGH | P3 (deferred) |
| Testimonials/reviews | LOW (no data model) | HIGH | P3 (deferred) |

**Priority key:** P1 = must have for this milestone · P2 = should have, add when stable · P3 = deferred / future milestone

## Per-Section Spec (data, premium feel, sparse-content default)

> This is the load-bearing detail for the roadmapper: what each fixed section needs, what makes it feel premium, and how it must degrade.

| Section | Data source (existing vs config) | Premium feel (jjotalab tier) | Default when sparse / empty |
|---------|----------------------------------|------------------------------|-----------------------------|
| **Hero** | Config: headline, subhead, hero image, CTA label. Existing: business `name`. | Full-bleed image or bold type, single dominant CTA → Booking, generous whitespace, restrained motion on load. | No image → typographic hero on a theme-colored background; headline falls back to business name + vertical tagline; CTA always present ("Reservar turno"). |
| **About** | Config: title, body, image. | Asymmetric image+text, comfortable line length (45–75ch), 1 image. | Empty body → **section hidden** (don't render an empty block). |
| **Services** | Existing: `services` table (name, price, duration). Config: title, `source:"auto"`. | Clean card/list grid, price + duration aligned, vertical-correct terminology. | 0 services → hide section (booking still works); 1 service → single centered card, not a lonely grid cell. |
| **Gallery** | Config: `images[]` (Storage). | Masonry/uniform grid, lazy-load, optional lightbox, consistent aspect ratios. | Default `enabled:false`; <3 images → simple row, not a broken grid; 0 images → hidden. |
| **Location** | Existing: `locations` (address; map_url/coords). Config: title, `show_address`. | Embedded/styled map + address card + directions link. | No physical location (online-only) → hide; multiple locations → list each cleanly. |
| **Hours** | Existing: business hours (`public_business_hours`). Config: title. | Clean weekly grid; today highlighted; "open now" optional. Argentina UTC-3 fixed. | No hours set → hide (don't show an empty schedule); closed days shown as "Cerrado," not omitted mid-week. |
| **Booking** | Existing: services/professionals/timeBlocks/exceptions/locations (already fetched by `page.tsx`). Config: title. | The existing `BookingClient`, themed to match (tokens, not a re-skin), framed in a titled section. | Always functional; this is the irreducible section. Must never be broken by config. |
| **CTA** | Existing: WhatsApp (normalized `wa.me`). Config: headline, `whatsapp:true`. | Bold closing band, theme-accent background, single WhatsApp action with pre-filled message. | No WhatsApp on file → fall back to Booking CTA; never render a dead button. |

### Safe Default Landing (`landing_config` is null or invalid)

This is an **availability + security requirement**, not a nicety — a malformed config must never 500 the public page or regress booking.

- **`landing_config IS NULL`** → render the **minimal functional landing: Hero (typographic, from business name + vertical) + Booking + (optionally) the always-derivable Services/Hours/Location/CTA from existing data, all on the default theme preset.** Brief mandates Hero + Booking as the floor.
- **`landing_config` present but invalid (fails Zod)** → **do not trust it.** Fall back to the safe default; never throw. Log server-side. Per-section: an invalid/disabled section is simply not rendered.
- **`landing_config` valid but content-sparse** → each section applies its own empty-state rule from the table above (hide-if-empty for optional sections; data-derived fallbacks for Hero/Services/Hours/Location/CTA).
- **No regression guarantee** → a business that never gets a custom landing must look and behave at least as well as today's `/[slug]`.

## Competitor / Reference Feature Analysis

| Aspect | Generic site builders (Wix/Squarespace/Webflow templates) | Booking-first pages (Calendly/Zoho/Trafft landing templates) | Forjo Web Builder approach |
|--------|-----------------------------------------------------------|--------------------------------------------------------------|----------------------------|
| Section model | Free-form blocks, drag-and-drop | Fixed: hero + benefits + embedded scheduler + trust | **Fixed sections + theming + order/on-off** (deliberately not free-form) |
| Booking | Third-party embed / iframe | Embedded scheduler widget | **Native `BookingClient`, same DB/seña/MP flow** — no iframe, no CORS |
| Content authoring | Owner edits in a visual editor | Owner edits form + copy | **Skill populates config by slug**; owner doesn't edit (this milestone) |
| Theming | Infinite knobs (analysis paralysis) | Minimal | **2–3 curated presets + constrained overrides** |
| Custom domain | Yes (paid tier) | Sometimes | **Deferred milestone** (Vercel Pro + host resolution) |
| Data reuse | None (everything re-entered) | None | **Services/hours/locations auto from existing tables** — the structural advantage |

The decisive structural advantage: Forjo already holds the booking flow and the structured business data (services, hours, locations, professionals). Most builders make the owner re-enter all of it and bolt on a third-party scheduler. Forjo derives the landing from data it already owns and embeds its *own* native booking — so v0.10 is mostly *rendering + theming + safe defaults*, not new capability.

## Sources

- jjotalab.com — reference aesthetic (a Forjo-style booking page itself: hero → value props → 4-step booking → MercadoPago deposit → confirmation; clean sans-serif, warm/minimal imagery) — MEDIUM
- [How to Create a Landing Page for Booking Appointments That Converts — Bitly](https://bitly.com/blog/steps-for-building-an-appointment-booking-landing-page/) — booking-page section conventions (hero with outcome, services, hours/location, embedded booking, trust) — MEDIUM
- [Best Booking Landing Page Examples in 2026 — Unicorn Platform](https://unicornplatform.com/blog/best-booking-landing-page-examples-in-2026/) — single clear action, minimal nav — MEDIUM
- [20 Best Service Landing Page Examples — Landingi](https://landingi.com/landing-page/service-examples/) — service-business section patterns — LOW
- [Best Landing Page Design Trends for 2026 — Moburst](https://www.moburst.com/blog/landing-page-design-trends-2026/) and [Best Landing Pages of 2026 — sitesplaced](https://sitesplaced.com/blog/best-landing-pages-of-2026) — premium scroll/reveal/sticky-nav conventions — MEDIUM
- [What Is a Sticky Header? 2026 UX Guide — Parallel](https://www.parallelhq.com/blog/what-sticky-header) — shrinking/hide-reveal sticky nav patterns — MEDIUM
- [15 Scroll Animations (2026) — veebilehed24](https://veebilehed24.ee/en/blog/css-scroll-animations-html-css-javascript-examples/) — reveal/blur/transform animation techniques (and motion restraint) — LOW
- [Blank/empty website templates & placeholder content — Webflow Inspo](https://webflow.com/list/blank), [Mobirise local-business templates](https://mobirise.com/html-templates/local-business/) — empty-state / placeholder-content conventions for sparse content — LOW
- Forjo brief `web-builder-brief.md` + `PROJECT.md` (v0.10) — LOCKED scope, section set, `landing_config` shape, skill spec — HIGH (authoritative for scope)

---
*Feature research for: themeable fixed-section landing builder with native booking (Forjo Web Builder v0.10)*
*Researched: 2026-06-17*
