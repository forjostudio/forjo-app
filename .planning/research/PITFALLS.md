# Pitfalls Research

**Domain:** Themeable, jsonb-config-driven landing builder on a security-hardened multi-tenant Next.js 16 + Supabase booking SaaS (Forjo Web Builder v0.10)
**Researched:** 2026-06-17
**Confidence:** HIGH (security/isolation, fail-safe rendering, booking regression — derived from the v0.9 audit and brief LOCKED decisions); MEDIUM (Next 16 metadata/caching specifics, Instagram scraping fragility — web-sourced, version-sensitive)

> Scope: mistakes specific to ADDING this feature to THIS hardened stack. The v0.9 milestone made multi-tenant isolation non-negotiable: public reads go through bounded views (`public_businesses`, migr. 026) that never expose secrets; writes are owner-RLS or service-role with a header-secret + `timingSafeEqual` admin pattern (SEC-03). Every pitfall below is checked against those invariants and mapped to a phase from the brief (§3).

---

## Critical Pitfalls

### Pitfall 1: `landing_config` smuggles secrets back into the public surface

**What goes wrong:**
Adding `landing_config jsonb` to `public_businesses` re-opens the exact hole v0.9 just closed — but through a column instead of a policy. Two variants: (a) the view is redefined with `SELECT *` or the migration recreates it without re-enumerating safe columns, silently re-exposing `mp_access_token`, `resend_api_key`, `recaptcha_secret_key`, `google_refresh_token`; (b) the skill or future editor writes sensitive data INTO the jsonb itself (e.g. a Google Maps API key, an internal admin note, a WhatsApp number meant to stay private, a draft price), and since the whole blob is public, it leaks to `anon` via PostgREST.

**Why it happens:**
jsonb is opaque to the column-level allowlist that protected the relational columns. The view grants `SELECT` on the column; nobody audits the *contents*. Recreating a view (`CREATE OR REPLACE VIEW`) is a common migration step and an easy place to regress the column list. The brief itself flags this as guardrail §4 ("NUNCA meter campos sensibles en la vista ni en el config").

**How to avoid:**
- Redefine `public_businesses` by **explicitly listing columns** + `landing_config`; never `SELECT *`. Diff the view definition in the migration review against migr. 026. Confirm `anon` still cannot read `business_secrets` columns.
- Treat `landing_config` as **fully public data by contract**. The Zod schema (Pitfall 4) is the gate: it should accept ONLY the known section/theme fields and `.strip()` unknown keys, so a stray secret cannot survive a write through the validator.
- The `services:auto` section must read from the existing `public_services` view, not re-embed prices/data into the blob from a privileged source.
- Add a Vitest isolation case (extends TEST-01): with the `anon` key, `SELECT * FROM public_businesses` and assert no secret column is present AND `landing_config` of business B is not readable while authenticated as A's owner where it should be gated.

**Warning signs:**
View definition uses `*`; `landing_config` contains anything that looks like a token/key/email; the skill writes a field not present in the Zod schema; a code reviewer cannot list from memory which columns the view exposes.

**Phase to address:** Phase 1 (config schema + storage + view change). Verified by Phase 6 skill guardrails and the Vitest isolation test.

---

### Pitfall 2: Storage bucket misconfigured — public write, cross-tenant overwrite, or path traversal

**What goes wrong:**
The landing-image bucket is created `public` for **read** (correct) but its write/RLS policy is too loose, so: (a) `anon` or any authenticated owner can upload/overwrite into another tenant's path; (b) object keys are not namespaced by `business_id`, so two businesses collide or one overwrites another's hero image; (c) the skill (service-role) builds object paths from unsanitized scraped filenames, enabling `../` traversal or absurd keys; (d) the bucket allows arbitrary content-types/sizes, so someone stores HTML/SVG with embedded script and serves it from the Forjo origin.

**Why it happens:**
Supabase Storage RLS is a *separate* policy surface from table RLS and is easy to leave at the permissive defaults when "just getting images working." The brief (§6 open item 1) hasn't decided whether to reuse the `003_storage_attachments` bucket or make a new one — reusing a bucket with attachment-era policies risks importing the wrong access model.

**How to avoid:**
- New dedicated bucket `landing-assets`, **public read, no public write**. Writes happen only via service-role (the skill) or owner-RLS scoped by a path prefix `{business_id}/...`.
- Enforce a Storage RLS policy that ties the object's first path segment to `auth.uid()`'s business (owner) — never trust a client-supplied path.
- The skill must generate keys server-side: `${businessId}/${crypto.randomUUID()}.${ext}`, validate `ext` against an allowlist (`jpg|jpeg|png|webp|avif`), and set `contentType` explicitly. Never derive the key from a scraped URL or filename.
- Restrict served content-type: store images only; reject SVG (script vector) unless sanitized; cap object size.

**Warning signs:**
Bucket policy reads `true` for `INSERT`/`UPDATE`; object keys without a `business_id` prefix; filenames carrying scraped strings; SVG uploads accepted; the same bucket also holds clinical/attachment data.

**Phase to address:** Phase 1 (storage). Skill respects the contract in Phase 6.

---

### Pitfall 3: Config-write endpoint or skill path lacks the project's auth discipline

**What goes wrong:**
Writing `landing_config` is a privileged operation (it sets what every visitor sees on a public page). If a future dashboard editor (deferred, but tempting to start early) or a convenience HTTP endpoint writes the config, and it authenticates weakly — `secret !== env` instead of `timingSafeEqual`, secret accepted via query string, or worse, the browser client writing directly — an attacker can deface any tenant's landing or inject content. The MVP path (skill runs locally with service-role) is safe *only as long as no web-exposed write path is added without the SEC-03 pattern*.

**Why it happens:**
v0.9 SEC-03 already established the correct pattern (header-only secret, `timingSafeEqual`, hash-both-sides, no query-string secrets, `setup-plans` moved out of the web runtime). A new feature is exactly where teams forget to reuse it and reach for a quick `===` check. CONCERNS.md documented the pre-v0.9 weakness as the anti-pattern.

**How to avoid:**
- MVP: keep config writes in the **local skill via service-role only** (brief §8.2) — no web write endpoint at all. This is the lowest-risk path; do not add an endpoint "just in case."
- If/when a write endpoint is unavoidable: reuse the SEC-03 pattern verbatim — header secret, `crypto.timingSafeEqual`, hash both sides, reject query-string secrets, owner-RLS for owner-driven edits (not service-role from the browser).
- Service-role writes must still re-resolve and scope by `business_id`/slug (the standing service-role caveat from CONCERNS.md) — never trust a client-supplied business id.

**Warning signs:**
Any `landing_config` UPDATE reachable from a browser; a `!==`/`===` secret comparison; secret in a query param; service-role key referenced in client code; an UPDATE that takes `business_id` from the request body without re-validating ownership.

**Phase to address:** Phase 6 (skill = service-role local). Phase 5/editor (deferred) must adopt SEC-03 + owner-RLS before shipping.

---

### Pitfall 4: Invalid/malformed `landing_config` crashes the public `/[slug]` page

**What goes wrong:**
A bad blob (skill bug, partial write, schema drift, a section type the renderer doesn't know, a `null` where an object is expected, `order` collisions, a missing `data`) throws inside the server component or renderer, and because `/[slug]` is `force-dynamic` it 500s on every request — taking down both the marketing page AND the booking flow for that tenant. Worst case the error is in a shared render path and affects more than one tenant.

**Why it happens:**
jsonb has no shape guarantees; TypeScript types are erased at runtime. Developers `as LandingConfig` the raw row and index into `config.sections[0].data.headline` trusting it. The page is the single revenue-critical surface, so any uncaught throw is a P1.

**How to avoid:**
- **Parse, don't assert.** Run the raw jsonb through `LandingConfig` **Zod** `safeParse` at the page boundary. On failure: log `[landing] invalid config for <slug>` and fall back to the **safe default** = Hero (from existing business fields) + Booking only — i.e. exactly today's behavior. Brief LOCKED this ("Zod + fallback seguro").
- `null`/absent config ⇒ same safe default (no-regression path, Pitfall 8).
- Renderer iterates only over **known section types** via a registry/switch; unknown `type` is skipped, not thrown. Each section component defends its own `data` with per-section parsed props.
- De-dupe/normalize `order`; never let ordering logic throw.
- Wrap the renderer subtree so a single section's render error degrades to "section hidden," not whole-page 500 (React error boundary around per-section render, or validate-then-render so bad data never reaches JSX).

**Warning signs:**
`as LandingConfig` casts; direct indexing into jsonb without a parse; no test feeding garbage config; the page lacks a try/fallback around config consumption; a section that renders raw `config.sections` length without bounds.

**Phase to address:** Phase 1 (Zod schema + default) and Phase 2 (renderer fail-safe + per-section validation).

---

### Pitfall 5: XSS from scraped/user content rendered as HTML

**What goes wrong:**
Copy pulled from Instagram (bio, captions) or entered by an owner contains markup. If any section renders it via `dangerouslySetInnerHTML` (to support line breaks, links, or "rich" formatting), it executes script in the Forjo origin — session-stealing, defacement, or pivot against the dashboard cookie. Even map embeds / `map_url` rendered into an `<iframe src>` or an `href` without scheme validation enable `javascript:` URLs and clickjacking.

**Why it happens:**
Scraped marketing copy "looks like it needs HTML" for formatting; `dangerouslySetInnerHTML` is the path of least resistance. The content is attacker-influenceable (the business owner, or whatever the scraper grabbed from a public IG that the owner doesn't fully control).

**How to avoid:**
- Render all config text as **plain text** (JSX children auto-escape). No `dangerouslySetInnerHTML` for any config-driven field. If line breaks are needed, split on `\n` and map to `<br/>`/paragraphs — no raw HTML.
- Validate URL fields in Zod: `z.string().url()` AND enforce `https:` scheme allowlist; reject `javascript:`/`data:`. Applies to `image`, `map_url`, `whatsapp`, any link.
- For external images, only render if the URL is on the Supabase Storage host (or an allowlisted CDN) — see Pitfall 6 — which also defeats arbitrary-origin tracking pixels.
- Run scraped copy through the `humanizador` skill (brief §4) — useful, but it is NOT a security control; the no-HTML rule is the control.

**Warning signs:**
Any `dangerouslySetInnerHTML` in landing sections; URL fields typed as bare `string`; `<a href={config...}>` or `<iframe src={config...}>` without scheme/host validation; rendering raw HTML "to support formatting."

**Phase to address:** Phase 2 (section components + Zod URL validation). Reinforced by Phase 6 (skill sanitizes/structures content, never emits HTML — brief D5/guardrails).

---

### Pitfall 6: Broken / unbounded / off-origin image URLs degrade or break the page

**What goes wrong:**
Hero/gallery images reference Storage keys that don't exist (skill uploaded to wrong path, object deleted), so the page shows broken-image icons or — if used as `og:image` — a broken social card. Or galleries embed dozens of full-res images with no dimensions, tanking LCP/CLS. Or images point at arbitrary external hosts (the scraped IG CDN), which can rate-limit, expire, hotlink-block, or disappear, silently breaking every landing that referenced them.

**Why it happens:**
The skill scrapes IG image URLs and stores them by reference instead of re-hosting; IG CDN URLs are signed/expiring. `next/image` needs `width`/`height` or fill+sized container; gallery sections invite unbounded arrays.

**How to avoid:**
- **Re-host every image** in the `landing-assets` bucket; never reference the IG CDN at runtime. The config stores only Storage URLs.
- Use `next/image` with explicit `width`/`height` (or `fill` + a sized container) for CLS; mark the hero `priority` for LCP; `loading="lazy"` below the fold (consistent with the repo's Core Web Vitals lint).
- Bound the gallery in Zod (e.g. max 12 images) — see Pitfall 7.
- Each `<Image>` should have a graceful fallback (a placeholder/skip) when the asset is missing, so one dead URL doesn't leave a broken-icon hero.
- Configure `next.config.ts` `images.remotePatterns` to the Storage host ONLY — this both enables optimization and enforces the on-origin rule from Pitfall 5.

**Warning signs:**
Config image URLs on `cdninstagram.com`/`fbcdn.net`; `<img>` instead of `next/image`; no `width`/`height`; gallery arrays with no max; no `remotePatterns` allowlist.

**Phase to address:** Phase 2 (image rendering, gallery bounds), Phase 4 (LCP/CLS, og:image), Phase 6 (skill re-hosts).

---

### Pitfall 7: Unbounded jsonb — size, payload, and dynamic-render cost

**What goes wrong:**
Because `/[slug]` is `force-dynamic`, the full `landing_config` is read from the DB and shipped (as RSC payload + hydration props) on **every request**. An unbounded blob (huge gallery arrays, long pasted copy, deeply nested structures, many sections) inflates row size, query time, and the per-request payload — slowing the most-hit public page and pushing toward Postgres TOAST overhead. There is no CDN cache softening this because the page is intentionally dynamic.

**Why it happens:**
jsonb feels "free" to grow; the skill may dump entire scraped bios/post histories. Nobody sets limits because the relational schema never needed them.

**How to avoid:**
- Bound everything in the Zod schema: max sections, max gallery images, max string lengths per field, allowed section types only. Reject (and log) configs that exceed limits at write time (skill side) so bad data never lands.
- Keep heavy assets in Storage (URLs in config), never base64/inline blobs in the jsonb.
- Revisit caching strategy in Phase 4: the page can stay `force-dynamic` for booking freshness, but the landing-config read is effectively static between edits — consider reading config once and not re-fetching per section; the existing fetch memoization dedupes within a request, but the blob size is the real cost, so cap it.

**Warning signs:**
A single `landing_config` row over tens of KB; gallery/section arrays with no Zod `.max()`; inline base64 in the blob; p95 latency on `/[slug]` creeping up as more businesses go live.

**Phase to address:** Phase 1 (schema bounds), Phase 4 (perf/caching review).

---

### Pitfall 8: Wrapping `BookingClient` in the renderer breaks the existing booking flow

**What goes wrong:**
The booking section is supposed to reuse `BookingClient` "tal cual" with the props `page.tsx` already fetches (services, professionals, timeBlocks, exceptions, locations). Regressions creep in when: the renderer doesn't pass a prop through, passes it reshaped, the booking section is conditionally `enabled:false` (so a misconfigured landing has NO way to book), the section is rendered inside a themed wrapper that changes layout/stacking/`position` and breaks the date-picker/drawer (vaul) or toasts (sonner), or `force-dynamic`/fresh-data behavior is lost when data now flows through the config path. Worst case: the public page renders but nobody can actually book — silent revenue loss.

**Why it happens:**
Booking is the revenue path; the builder is "just presentation," so the integration seam is under-tested. Theming (Pitfall 9) injects CSS variables/containers around `BookingClient` that it wasn't designed for. The brief LOCKED "no tocar el flujo de reservas" precisely because this is the highest-stakes seam.

**How to avoid:**
- Treat `BookingClient`'s prop contract as **frozen**. The booking section is a thin adapter that forwards the already-fetched props unchanged; do not reshape them in the renderer.
- **Booking is non-disableable** in the safe default and should be hard to turn off — if a config omits/disables it, the renderer still appends a booking section (the no-regression fallback = Hero + Booking).
- Keep `app/[slug]/page.tsx` fetching booking data exactly as today and `force-dynamic`; the renderer composes presentation around it, it does not own that data.
- Add a Vitest/integration check that a business with `landing_config = null` renders identically to pre-v0.10 (no-regression) and that booking props reach `BookingClient`.
- Verify the date picker (`react-day-picker`), mobile drawer (`vaul`), and toasts still work inside a themed section wrapper (no `overflow:hidden`/`transform` ancestor breaking fixed/absolute positioning).

**Warning signs:**
Booking section accepts an `enabled` toggle with no floor; props reshaped in the renderer; `BookingClient` rendered inside a `transform`/`overflow` container; the no-config path no longer matches today's page; date picker/drawer visually clipped under a theme.

**Phase to address:** Phase 2 (renderer + booking integration + no-regression fallback). Re-verified in Phase 3 (theming must not break booking UI).

---

### Pitfall 9: Per-business theming causes FOUC / flash of wrong theme

**What goes wrong:**
The landing's per-business theme (preset + color/font overrides) is applied after hydration, so the first paint shows the default/Forjo palette then flips to the business's — a visible flash (FOUC), especially harsh in dark mode. With `next-themes` + the existing `PaletteScript` + `data-palette`/`data-theme` on `<html>`, the per-business override has to be set **before paint**; if it's set in a `useEffect` or via a client component, it flashes. Custom web fonts loaded without `font-display: swap`/preload add a separate flash of unstyled/invisible text.

**Why it happens:**
The existing theming infra is for the dashboard's light/dark, set early by `PaletteScript`. The per-business landing color/font is *data* read from the config and naturally lands in render/effect timing unless deliberately inlined server-side. `force-dynamic` means the server already knows the business's theme — but only if you thread it into the `<html>`/inline style on the server.

**How to avoid:**
- Resolve the theme **server-side in the layout/page** (config is already read there) and emit the theme tokens as inline CSS custom properties / `data-*` attributes on the server-rendered markup — before any client JS. Extend the existing `PaletteScript`/data-attribute mechanism rather than inventing a parallel client-side theming path.
- Constrain fonts to the **allowed set** (brief: "dentro del set permitido"), self-host/preload them with `font-display: swap`; do not let the config load arbitrary Google Fonts at runtime.
- Keep theme overrides as CSS variables consumed by Tailwind v4 tokens (existing pattern) so a missing override falls back to the preset, not to nothing.
- Dark mode must be coherent (brief Phase 3): test each preset in both modes; ensure WCAG AA contrast survives owner color overrides (an owner can pick an illegible primary — clamp or warn).

**Warning signs:**
Theme applied in `useEffect`/client component; visible color flip on first load; web fonts not preloaded; owner-chosen colors failing contrast; a parallel theming path that bypasses `PaletteScript`.

**Phase to address:** Phase 3 (themes). Contrast/a11y verified there per the global UI/UX WCAG AA rules.

---

### Pitfall 10: `generateMetadata` / JSON-LD throws or double-fetches, breaking SEO and/or the page

**What goes wrong:**
SEO is added by extending `app/[slug]/layout.tsx` metadata. Failure modes: (a) `generateMetadata` reads `landing_config` and throws on a bad blob (Pitfall 4) — this runs server-side before render and can break the response, so an invalid config now kills SEO *and* potentially the page; (b) `og:image` points at the hero image but the hero is disabled/missing/off-origin, yielding a broken social card; (c) JSON-LD `LocalBusiness` is built by string-concatenating unescaped config values, producing invalid JSON or an injection vector in the `<script type="application/ld+json">`; (d) metadata and page each fetch the business separately, and if not the same cached `fetch`, it double-queries.

**Why it happens:**
`generateMetadata` is a separate function that tracks data access independently from the page; developers fetch the row twice or assume it can't fail. JSON-LD is often hand-built with template strings.

**How to avoid:**
- `generateMetadata` must **fail safe**: wrap config access in the same Zod parse + fallback (Pitfall 4); on invalid config emit baseline metadata from existing business fields (name, address) — never throw.
- Rely on the App Router's **fetch memoization** so the metadata read and the page read of the business dedupe within the request (don't issue two raw Supabase queries with different shapes; share a resolver).
- `og:image`: 1200x630, validated on-origin Storage URL; if hero image absent, fall back to logo or a default OG image — never emit a dead URL.
- Build JSON-LD by `JSON.stringify`-ing a typed object (auto-escapes), injected with care; never string-concatenate config values. Validate required `LocalBusiness` fields exist before emitting.

**Warning signs:**
`generateMetadata` without a try/fallback; two distinct business fetches per request; JSON-LD built with backtick templates; `og:image` not validated; metadata throwing on bad config.

**Phase to address:** Phase 4 (SEO/OG/JSON-LD). Shares the Zod fallback from Phase 1.

---

### Pitfall 11: Instagram scraping is fragile, ToS-violating, and a runtime liability if treated as a hard dependency

**What goes wrong:**
The skill's optional IG scraping (via `instagram-a-web`'s engine) is treated as reliable. Reality: Instagram's ToS prohibits automated collection without permission; datacenter IPs (Vercel/AWS/GCP) are blocked instantly; rate limits (~200 req/hr/IP) trigger 429s and IP/account bans; the scraper breaks whenever IG changes markup; scraped content goes stale. If scraping runs server-side at request time, or the skill hard-fails when scraping fails, the build flow becomes unreliable and the company's IG account / infra IP risks bans. Stale/scraped copy can also misrepresent a business or carry someone else's content (rights/licensing).

**Why it happens:**
"Convert their Instagram into a web" is the headline pitch (brief §4 triggers), so it's tempting to make scraping central and automatic. The legal nuance (public-data scraping is arguably legal post hiQ v. LinkedIn but still ToS-violating and ban-prone) gets glossed.

**How to avoid:**
- Scraping is **offline, optional, best-effort, human-in-the-loop** — it runs in the skill at build time (Claude Code on the dev machine), never on Vercel/server at request time, and never on a per-visitor path.
- The skill must **degrade gracefully**: if scraping fails/empties, fall back to manual content input; never block landing creation on a successful scrape.
- Re-host scraped images (Pitfall 6); review scraped copy for accuracy and rights before publishing; pass through `humanizador`. Get the client's go-ahead to use their IG content (it's their account — lower risk, but confirm).
- Rate-limit/throttle and expect breakage; do not build automation that hammers IG. Prefer client-provided content as the primary input, IG as a convenience accelerant.
- Document that IG content is a snapshot — it will not auto-update; refreshes are a manual re-run.

**Warning signs:**
Scraping on a request-time/server path; skill aborts when scraping fails; IG CDN URLs referenced at runtime; no manual-content fallback; assuming the scrape stays current.

**Phase to address:** Phase 6 (skill). Out of the runtime path entirely.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `CREATE OR REPLACE VIEW public_businesses AS SELECT *` to "just add the column" | One-line migration | Re-exposes every secret column to `anon`; undoes v0.9 | **Never** — always enumerate columns explicitly |
| `row.landing_config as LandingConfig` (cast instead of parse) | Skips Zod plumbing | Any bad blob 500s the public+booking page | **Never** on the public render path |
| `dangerouslySetInnerHTML` for "rich" landing copy | Easy line breaks/links | XSS in Forjo origin from scraped/owner content | **Never** for config-driven content |
| Quick web endpoint to write `landing_config` for convenience | Edit without re-running skill | Privileged write surface; defacement if auth weak | Only with SEC-03 pattern + owner-RLS; defer to editor phase |
| Reference IG CDN image URLs directly in config | No re-upload step | URLs expire/hotlink-block; off-origin XSS surface; breaks silently | **Never** — always re-host in Storage |
| Reuse the `003_storage_attachments` bucket for landing images | No new bucket | Inherits attachment-era access model; mixes clinical & public assets | Only after auditing its policies match public-read/owner-write |
| Apply per-business theme client-side (useEffect) | Simpler than server inlining | FOUC / flash of wrong theme on every load | **Never** — resolve server-side before paint |
| Make scraping automatic and central to the skill | Flashier demo | Ban risk, fragility, stale content, build-flow failures | Only as optional best-effort offline accelerant |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Supabase view `public_businesses` | `SELECT *` / recreating the view drops the column allowlist | Explicit column list + `landing_config`; diff against migr. 026 in review |
| Supabase Storage | Public write policy or keys not namespaced by `business_id` | Public read only; service-role/owner-RLS write scoped to `{business_id}/...`; server-generated keys |
| Supabase service-role (skill) | Trusting client/body `business_id`; not scoping queries | Re-resolve business by slug, filter every query by `business_id` (standing CONCERNS.md caveat) |
| `next/image` | Off-origin/IG-CDN sources, no `remotePatterns`, no dimensions | Storage-host `remotePatterns` allowlist; explicit width/height; hero `priority` |
| `next-themes` + `PaletteScript` | Per-business theme set after hydration → FOUC | Extend `PaletteScript`/data-attributes; inline theme tokens server-side |
| MercadoPago / booking | Reshaping or dropping `BookingClient` props in the renderer | Forward fetched props unchanged; booking section is a thin adapter; data stays in `page.tsx` |
| Instagram | Scraping at request time / on Vercel IPs; hard dependency | Offline best-effort in skill; manual fallback; re-host images; expect breakage |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Unbounded jsonb shipped on every `force-dynamic` request | Rising `/[slug]` p95; large RSC payload | Zod `.max()` on arrays/strings; assets in Storage not inline | As businesses go live with large galleries/long copy |
| Hero/gallery images without dimensions or optimization | Poor LCP/CLS; layout shift | `next/image` + width/height, `priority` hero, lazy below fold | Immediately on image-heavy landings; hurts SEO |
| Double-fetching the business in `generateMetadata` and page | Two queries per request | Shared resolver + App Router fetch memoization | Every request; compounds under traffic |
| Re-running availability/booking data through the config path | Lost freshness or extra queries | Keep booking data fetch in `page.tsx`, `force-dynamic`, untouched | When booking section is "integrated" carelessly |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| `landing_config` exposing secrets (in view or in the blob) | `anon` reads MP/Resend/Google/reCAPTCHA secrets — repeats the v0.9 critical | Explicit-column view; Zod strips unknown keys; isolation Vitest test |
| Storage public write / cross-tenant overwrite / traversal | One tenant defaces/overwrites another's images; script via SVG | Public read only; owner/service-role write scoped by `business_id`; server-generated sanitized keys; image-only content-type |
| Weak auth on any config-write path | Anyone defaces any tenant's public landing | SEC-03 pattern (header secret + `timingSafeEqual`, no query-string); owner-RLS; MVP = local skill only |
| XSS via scraped/owner HTML or `javascript:` URLs | Script in Forjo origin; cookie/session theft; pivot to dashboard | Plain-text rendering, no `dangerouslySetInnerHTML`; Zod URL+scheme validation; on-origin image hosts |
| JSON-LD built by string concatenation of config values | Invalid JSON or script injection in `ld+json` | `JSON.stringify` a typed object; validate required fields |
| Service-role write trusting client `business_id` | Cross-tenant write | Re-resolve by slug; scope every query by `business_id` |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Booking section disableable with no floor | Visitor lands but cannot book — silent revenue loss | Booking non-disableable; safe default always includes it |
| FOUC / flash of wrong per-business theme | Looks broken/cheap, jarring in dark mode | Server-side theme tokens before paint; preload fonts |
| Owner picks illegible primary color | Fails WCAG AA contrast; unreadable | Clamp/validate contrast; warn in skill; presets safe by default |
| Broken hero/og image | Broken-image icon; dead social card | Validated on-origin Storage URLs; fallback to logo/default |
| Stale scraped IG content presented as current | Wrong prices/info; misrepresents business | Human review before publish; document snapshot semantics |

## "Looks Done But Isn't" Checklist

- [ ] **Public view change:** Often missing — confirm the view enumerates columns explicitly and `anon` still cannot read secrets; verify with an `anon`-key `SELECT *` test.
- [ ] **Invalid config handling:** Often missing — feed garbage/null/unknown-type config and confirm the page falls back to Hero + Booking, not a 500.
- [ ] **Booking no-regression:** Often missing — a `landing_config = null` business must render and book exactly like pre-v0.10.
- [ ] **Storage write policy:** Often missing — try uploading to another tenant's path as a non-owner and confirm it's denied; confirm keys are `business_id`-prefixed.
- [ ] **XSS/URL validation:** Often missing — config with `javascript:` URL and HTML in copy must render inert.
- [ ] **Theme before paint:** Often missing — hard-reload a themed landing in dark mode and watch for a color flash.
- [ ] **generateMetadata fail-safe:** Often missing — bad config must still yield baseline metadata, not a thrown response.
- [ ] **og:image valid + sized:** Often missing — verify 1200x630 on-origin URL and a fallback when hero is absent.
- [ ] **Scraping degradation:** Often missing — skill must complete with manual content when IG scrape fails.
- [ ] **Image dimensions:** Often missing — every landing image has width/height; hero is `priority`; CLS measured.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Secret exposed via view/config | HIGH | Redefine view with explicit columns; purge secret from any config; **rotate** affected keys (as v0.9 did); add isolation test |
| Invalid config 500s the page | LOW | Wrap config access in Zod safeParse + fallback; ship hotfix; the null/safe-default path restores the page |
| Storage cross-tenant write/overwrite | MEDIUM | Tighten Storage RLS; re-namespace keys by `business_id`; re-upload affected images; audit objects |
| XSS shipped via config | MEDIUM | Remove `dangerouslySetInnerHTML`; switch to plain text; invalidate sessions if exploited; audit configs for injected payloads |
| Booking broken by renderer wrapping | MEDIUM | Restore frozen prop contract; remove offending theme/layout wrapper; re-run no-regression test |
| FOUC on theming | LOW | Move theme resolution server-side into the layout/PaletteScript path |
| IG scrape ban / breakage | LOW | Switch to manual content input; the skill's fallback path already covers this if built per Pitfall 11 |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 — Secrets via `landing_config`/view | Phase 1 | `anon`-key `SELECT *` isolation test (extends TEST-01) shows no secrets |
| 2 — Storage misconfig | Phase 1 | Non-owner upload to foreign path denied; keys `business_id`-prefixed |
| 3 — Weak config-write auth | Phase 6 (skill); deferred editor | No browser-reachable write; SEC-03 pattern if endpoint added |
| 4 — Invalid config crashes page | Phase 1 + Phase 2 | Garbage/null config renders safe default, not 500 |
| 5 — XSS from content | Phase 2 (+6) | `javascript:` URL + HTML copy render inert; no `dangerouslySetInnerHTML` in code |
| 6 — Broken/off-origin images | Phase 2 + Phase 4 + 6 | Images on Storage host only; width/height present; missing-image fallback |
| 7 — Unbounded jsonb | Phase 1 + Phase 4 | Zod `.max()` enforced; row size and `/[slug]` p95 within budget |
| 8 — Booking regression | Phase 2 (re-check Phase 3) | `landing_config=null` matches pre-v0.10; booking props reach `BookingClient`; date picker/drawer work under theme |
| 9 — Theming FOUC | Phase 3 | No color flash on hard reload; fonts preloaded; AA contrast holds |
| 10 — generateMetadata/JSON-LD | Phase 4 | Bad config yields baseline metadata; valid JSON-LD; single business fetch; valid og:image |
| 11 — IG scraping fragility | Phase 6 | Scraping offline/optional; skill completes on scrape failure; images re-hosted |

## Sources

- `.planning/codebase/CONCERNS.md` (Forjo audit 2026-06-15) — view/secret exposure, service-role caveat, admin-endpoint auth, webhook patterns. Confidence HIGH.
- `c:/Users/franc/Desktop/Forjo Studio/web-builder-brief.md` — LOCKED decisions, guardrails §4, risks §8, phase plan §3. Confidence HIGH.
- `.planning/PROJECT.md` (v0.10) — v0.9 SEC-01..04 outcomes, constraints, key decisions. Confidence HIGH.
- [Is Instagram Scraping Legal? Anti-Bot & Best Proxies (ScrapeOps)](https://scrapeops.io/websites/instagram/) — ToS, rate limits, anti-bot. Confidence MEDIUM.
- [Court Rules Meta's Terms Do Not Prohibit Scraping of Public Data (Zyte)](https://www.zyte.com/blog/california-court-meta-ruling/) — legal nuance post hiQ. Confidence MEDIUM.
- [Is Instagram Scraping Legal? 2025 Developer's Guide (SociaVault)](https://sociavault.com/blog/instagram-scraping-legal-2025) — compliance. Confidence MEDIUM.
- [Functions: generateMetadata (Next.js docs)](https://nextjs.org/docs/app/api-reference/functions/generate-metadata) — metadata data-access tracking, fetch memoization. Confidence MEDIUM.
- [Getting Started: Caching (Next.js docs)](https://nextjs.org/docs/app/getting-started/caching) — force-dynamic / no-store semantics. Confidence MEDIUM.

---
*Pitfalls research for: jsonb-config-driven themeable landing builder on hardened multi-tenant Next.js 16 + Supabase*
*Researched: 2026-06-17*
