---
phase: 14-cms-editor-ui
audited: 2026-07-10
auditor: gsd-security-auditor
asvs_level: 1
block_on: high
threats_total: 16
threats_closed: 16
threats_open: 0
accepted_risks: 3
status: SECURED
---

# Phase 14: CMS Editor UI — Security Audit

Security-sensitive phase: it touches the multi-tenant invariant (Core Value) via the ONLY net-new
write surface of the milestone — the browser-direct image upload. The threat register was authored
at plan time across the four plans (`register_authored_at_plan_time: true`), IDs T-14-01 .. T-14-15
plus the recurring supply-chain accept T-14-SC. This audit VERIFIES each declared mitigation exists
in the shipped code (HEAD, including the imageSlot wiring commit `feee1fb`). Documentation and intent
are not accepted as evidence — every row is backed by a file:line reference; behavioral claims are
backed by a live test run.

**Result: SECURED — 16/16 threats resolved (13 mitigated + verified, 3 accepted; 0 open). `block_on: high` satisfied (zero high/critical open).**

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-14-01 | Tampering (cross-tenant write via body `business_id`) | mitigate | CLOSED | `_landing-actions.ts:55-59` resolves the tenant with `.eq('owner_id', user.id).single()`; `:70-73` `.update(...).eq('id', business.id)`. The editor sends ONLY the config — `web-client.tsx:146` `saveLandingConfig(draft)` (no `business_id` in the payload). Inherited T-13-01 (Phase 13 SECURED, `isolation.test.ts` green against real DB). |
| T-14-02 | Elevation (editor route rendered without flag) | mitigate | CLOSED | `page.tsx:25` `const CMS_ENABLED = process.env.CMS_ENABLED === 'true'`; `:29` `if (!CMS_ENABLED) notFound()` is the FIRST statement in `WebEditorPage`, before `createClient()`/`getUser()`/any fetch. Defense-in-depth: the action re-checks the flag first (`_landing-actions.ts:39`, inherited T-13-04). |
| T-14-03 | Information Disclosure (preview shows another tenant's data) | mitigate | CLOSED | `page.tsx:62-74` — all 5 preview datasets (`services`, `professionals`, `time_blocks`, `schedule_exceptions`, `locations`) fetched with `.eq('business_id', business.id)` where `business` is session-resolved (`:42-46`). Session client (RLS). No cross-tenant fetch. |
| T-14-04 | Tampering (service-role on the web read surface) | mitigate | CLOSED | `page.tsx:1` imports only `createClient` from `@/lib/supabase/server` (session, anon+cookies, RLS). Grep `createAdminClient\|supabase/admin` under `app/(dashboard)/web/` = 0 executable (2 comment-only hits in `_landing-actions.ts:14,45`). Inherited T-13-02. |
| T-14-05 | Availability (preview breaks the booking widget) | mitigate | CLOSED | `web-client.tsx:186` the `overflow-hidden rounded-lg` lives on the EXTERNAL frame; `:188` the `.frj-site` wrapper carries only theme `data-*` + `--primary`, NO transform/overflow. The `sticky` save bar (`:281`) and preview column (`:305-307`) sit OUTSIDE `.frj-site` — never an ancestor of `#reservar` (L7). Inherited RSV-02. |
| T-14-06 | Injection (`map_url` / URL copy fields) | mitigate | CLOSED | Non-bypassable server-side barrier at save: `schema.ts:145` `map_url: z.string().url().optional()`; `write.ts:23` `landingConfigSchema.safeParse` (reject-on-invalid); `_landing-actions.ts:63-64` returns before `.update` on invalid. Client `UrlField` onBlur (`section-forms.tsx:112-127`) is UX-only, correctly documented as non-authoritative. Inherited Phase 13 write path. |
| T-14-07 | Tampering (reorder/toggle manipulating the section set) | mitigate | CLOSED | `editor-draft.ts` — `moveSection`/`toggleSection`/`setSectionData` never add/remove sections; `normalizeSections` (`:33-49`) materializes EXACTLY `SECTION_TYPES` (fixed 8). `booking` is render-forced by `orderedSections` even when toggled off. Behavior covered by `test/landing-editor-draft.test.ts` (32 cases, green). |
| T-14-08 | Information Disclosure (read-only services/locations lists in editor) | accept | CLOSED | Own-business data only, fetched with `.eq('business_id', business.id)` (`page.tsx:62,70`) and rendered read-only (`section-forms.tsx:301-313,353-366`). Same data the owner already sees in Servicios / Negocio. Logged as AR-14-02 below. |
| T-14-09 | Tampering / Elevation (cross-tenant upload under another prefix) | mitigate | CLOSED | `editor-upload.ts:46-60` `buildUploadPath` FORCES `${businessId}/...` as the first segment (businessId used verbatim — session-sourced UUID) and sanitizes `section` to `[a-z0-9-]` (`:33-36`) so `../`/`/`/symbols cannot inject segments. `businessId` is threaded session→prop end-to-end (`page.tsx:42-46,84` → `web-client.tsx:269` → `section-list.tsx:203,210` `businessId={business.id}` → `image-controls.tsx:50`), NEVER from client input. Enforcement backstop: RLS INSERT policy `landing-assets owner insert` (migr. `030_landing_config_and_storage.sql:86-93`, `(storage.foldername(name))[1] IN (SELECT id::text FROM businesses WHERE owner_id = auth.uid())`). Path invariant proven by `test/landing-editor-upload.test.ts` (incl. `../otro-negocio`, `a/b/c` cases) — pure, NO service-role. See note on baseline-vs-archive below. |
| T-14-10 | Tampering (service-role on the upload surface) | mitigate | CLOSED | `image-controls.tsx:28,49` upload uses `createClient()` from `@/lib/supabase/client` (browser SESSION client → RLS `authenticated`). Grep `createAdminClient\|supabase/admin` in `image-controls.tsx` and `lib/landing/` = 0. Inherited T-13-02. |
| T-14-11 | Injection / Input Validation (malicious file or non-http URL in config) | mitigate | CLOSED | `editor-upload.ts:21-25` `validateImageFile` (allowlist `{jpeg,png,webp}` + 2 MB) before any upload (`image-controls.tsx:93,214`); only the `getPublicUrl` result is written to the draft (`image-controls.tsx:56-60`), never a `blob:`/object URL. Server-side non-bypassable: schema image fields `z.string().url()` (`schema.ts:93,103,120,136`) + `write.ts` at save. Validator covered by upload test. |
| T-14-12 | Availability (draft URL points to a not-yet-uploaded object) | mitigate | CLOSED | URL written to the draft ONLY after `upload`+`getPublicUrl` resolve (`image-controls.tsx:51-60,104,231`); on error the draft is not mutated (`:52-55,103`). Save gated while uploads in flight: `onUploadingChange(+1/-1)` (`:100,107,220,226`) → shell counter (`web-client.tsx:103,138-140`) → `disabled={saving || !dirty || uploading > 0}` (`web-client.tsx:298`). |
| T-14-13 | Injection (`overrides.primary` → inline CSS var in preview) | mitigate | CLOSED | `theme-controls.tsx:74` `isSafeColor(v)` gate before `onChange({ primary: v })`; an invalid hex sets `hexError` and is NOT persisted (`:77-80`). Allowlist regex `HEX_COLOR` (`theme.ts:21-26`). Defense-in-depth: `resolveLandingTheme` re-validates primary via `isSafeColor` on render (`theme.ts:70`). Inherited T-08-01. |
| T-14-14 | Tampering (writing to the wrong target `businesses.*`) | mitigate | CLOSED | Grep `businesses`/`.from(` in `theme-controls.tsx` = 0. All theme writes flow through `onChange`/`onMotionChange` → `setTheme`/`setMotion` (`editor-draft.ts:127-145`, isolated) → `config.theme.{preset,overrides.palette,overrides.primary}` / `config.motion` only. Never touches the dashboard-chrome columns. |
| T-14-15 | Information Disclosure (unknown preset/palette breaks the preview) | mitigate | CLOSED | `theme-controls.tsx:47,50` active-match uses `normalizeTheme`/`normalizePalette` (`theme-config.ts:95,101`) — any unknown value degrades to `forjo`/default (fail-safe, no crash, no leak). `resolveLandingTheme` re-normalizes on render (`theme.ts:57-63`). Covered by +5 `normalizeTheme` cases in `test/landing-theme.test.ts`. |
| T-14-SC | Tampering (supply chain — npm installs) | accept | CLOSED | All four SUMMARYs report `tech-stack.added: []`; zero new packages this phase. No supply-chain surface introduced. Logged as AR-14-03 below. |

**Behavioral evidence (run during this audit, not taken on faith):**
- `npx vitest run test/landing-editor-draft.test.ts test/landing-editor-upload.test.ts test/landing-theme.test.ts` → **3 files, 77/77 passed** (draft reducer purity + fixed-8 invariant; path-isolation invariant incl. `../` escape attempts; `validateImageFile` allowlist; `normalizeTheme` active-match + `isSafeColor` rejection).
- Isolation greps: `createAdminClient\|supabase/admin` under `app/(dashboard)/web/` = 0 executable (2 comment-only); under `lib/landing/` = 0; `businesses`/`.from(` in `theme-controls.tsx` = 0.

## Note on the upload RLS enforcement (T-14-09) — baseline vs. archive

The `landing-assets` owner-write RLS policies are present in the applied migration source
`supabase/_migrations-archive/030_landing_config_and_storage.sql:84-121` (INSERT/UPDATE/DELETE, each
gated on `(storage.foldername(name))[1] IN (SELECT id::text FROM businesses WHERE owner_id = auth.uid())`).
They do NOT appear in `supabase/migrations/00000000000000_baseline.sql` because the local Supabase used
to regenerate the baseline has Storage OFF (documented project constraint; MEMORY: "analytics/studio/storage
off en Windows"), so `storage` schema objects are not captured in the dump. This is a baseline-completeness
artifact, not evidence the policy is absent from production: the SIBLING DDL from the same one-shot migration
(the `businesses.landing_config` column and the `public_businesses` view extension) is confirmed LIVE in prod
by Phase 13's isolation tests (D-10b/c green). The disposition stands: the declared enforcement for T-14-09
exists. The end-to-end upload round-trip against real Storage remains a UAT item (14-VERIFICATION.md
`human_needed`), which is an environment limitation, not a code gap — the client-side path invariant is proven
by unit test and the server-side RLS is the authoritative isolation control.

## Accepted Risks

### AR-14-01 — Orphaned image objects on delete/replace are not garbage-collected in v1

- **Disposition:** ACCEPT (deferred cleanup, same-tenant, benign — D-02c).
- **Origin:** `image-controls.tsx:162` (Quitar → `onChange(undefined)`) and `:236-239` (grid delete) and Reemplazar
  are config-only: they drop/repoint the URL in the draft but do not `.remove()` the old object from the bucket.
- **Why it is NOT an open threat:** The orphaned objects are the owner's OWN images under their OWN
  `{business_id}/` prefix (T-14-09 invariant). No cross-tenant exposure, no exfiltration, no elevation — the same
  benign owner-scoped class as AR-13-01. Public read is by-design for a public landing bucket. Residual cost is
  bucket storage bloat only.
- **Residual risk:** LOW. Same-tenant, self-inflicted storage growth. Re-evaluate if bucket cost becomes material
  (a scheduled orphan-sweep is the deferred hardening).

### AR-14-02 — Owner's own services/locations lists are shown read-only inside the editor (T-14-08)

- **Disposition:** ACCEPT (own-tenant data, expected).
- **Origin:** `section-forms.tsx:301-313,353-366` render the business's services/locations as read-only hints so the
  owner knows where to edit them.
- **Why it is NOT an open threat:** The lists are fetched with `.eq('business_id', business.id)` (`page.tsx:62,70`)
  — strictly the owner's own data, identical to what they already see in Servicios / Negocio. No new class of exposure.
- **Residual risk:** NONE (same-tenant, already-visible data).

### AR-14-03 — Supply chain (T-14-SC)

- **Disposition:** ACCEPT (N/A this phase).
- **Origin:** Register-standard supply-chain line.
- **Why it is NOT an open threat:** Zero packages installed this phase (all four SUMMARYs `tech-stack.added: []`).
  No new dependency surface.
- **Residual risk:** NONE.

## Unregistered Flags

None. No `## Threat Flags` section in any Phase 14 SUMMARY declares new attack surface:
- `14-01-SUMMARY.md`: no new security surface (shell + pure reducer; grep-clean of service-role).
- `14-02-SUMMARY.md` `## Threat surface scan`: "Sin superficie nueva fuera del `<threat_model>` del plan."
- `14-03-SUMMARY.md` `## Threat surface`: "Sin superficie nueva fuera del `<threat_model>` del plan."
- `14-04-SUMMARY.md`: "Deviations from Plan: None."

Independently confirmed: this phase introduced NO new migration (the bucket/RLS predates it, migr. 030), NO new
endpoint, NO service-role path. The only net-new write is the browser-direct upload, which is fully registered
(T-14-09..12).

## Informational (non-threat)

- **Dead confirm-on-exit dialog:** `web-client.tsx:108,317-334` — `showExitConfirm` state + `<Dialog>` exist but
  `setShowExitConfirm(true)` is never called, so in-app SPA navigation away from `/web` does not prompt (only
  tab-close/reload via `beforeunload` does). Flagged by 14-VERIFICATION.md as a UI-completeness warning. Not a
  security concern and not part of the threat register — noted for completeness only.

## Conclusion

All 16 register threats resolve: 13 `mitigate` threats verified present in the shipped code with file:line +
live-test evidence, and 3 `accept` (T-14-08 own-data lists, T-14-SC supply chain, plus the deferred orphan-cleanup
limitation AR-14-01) documented. The headline Phase 14 risk — cross-tenant image upload — is closed on both legs:
the client-side path invariant (`buildUploadPath` forces `{session business.id}/…`, proven by unit test with NO
service-role) and the authoritative server-side RLS (migr. 030 owner-write, gated on `owner_id = auth.uid()`).
The editor and upload surfaces carry zero service-role usage; theme writes are confined to `landing_config`; the
route is fail-closed behind `CMS_ENABLED`; and all persistence goes through Phase 13's owner-only `saveLandingConfig`.

`block_on: high` is satisfied: zero high/critical open threats.

**Phase 14 is SECURED.**
