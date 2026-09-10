---
phase: 20-lo-que-el-publico-ve
reviewed: 2026-09-10T22:50:52Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - app/[slug]/booking-client.tsx
  - app/[slug]/page.tsx
  - lib/staff-services.ts
  - test/schedule-coverage-public.test.ts
  - test/service-coverage-public.test.ts
findings:
  critical: 1
  warning: 6
  info: 5
  total: 12
status: issues_found
---

# Phase 20: Code Review Report

**Reviewed:** 2026-09-10T22:50:52Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Reviewed the phase-20 diff (`7904fa3^..HEAD`): the new 8th `Promise.all` query in the public RSC, the
move of the staff filter from the RSC to the client, `isServiceStaffed`, the two-axis disable-with-reason
in step 1, the per-service calendar (`serviceBlocks` / `openDaysSet`), and the two DB-backed tests.

**Verified clean (not findings):**
- Tenant isolation of the new query: `public_time_block_services` is read with `createPublicServerClient()`
  (anon key, no cookies) and scoped with `.eq('business_id', business.id)` where `business.id` comes from the
  slug lookup on `public_businesses`. Same shape and same position as the `public_professional_services`
  precedent two lines above. No cross-tenant read introduced by this phase.
- The bridge-side wildcard semantics are correct in both axes: an empty `time_block_services` /
  `professional_services` bridge degrades to "everything allowed", and `timeBlockServices ?? []` preserves
  that when the optional prop is absent.
- `isServiceStaffed` keeps the sentinel guard (`activeProfessionals.length === 0 → true`) that
  `bookableServices` used to own; the extraction is behaviour-preserving.

**Key concerns:** the franja axis has one input where the fail-safe is *inverted* — an empty/failed
`timeBlocks` read disables the whole catalog (CR-01) — the staff axis lost its last server-side layer with
nothing behind the browser `disabled` attribute (WR-01), the reason copy that is the whole point of the
feature fails WCAG AA contrast and is unreachable by keyboard (WR-02/WR-03), and the owner's CMS preview
now diverges from the live page (WR-04). Test coverage guards the function the phase *stopped* using
(WR-05) and never exercises the empty-blocks case that produces CR-01 (WR-06).

## Critical Issues

### CR-01: Zero time blocks disables the entire public catalog (fail-safe inverted on the `timeBlocks` input)

**File:** `app/[slug]/booking-client.tsx:574` (and `app/[slug]/page.tsx:171`)

**Issue:**
`isServiceScheduled(service.id, timeBlocks, timeBlockServices ?? [])` delegates to
`blocksForService(...).length > 0`. With `blocks = []` the filter returns `[]` → `false`. The wildcard rule
protects against an empty **bridge**, not against an empty **blocks array**, so:

- A business with **zero rows in `time_blocks`** now renders *every* service card disabled with
  "Sin horarios disponibles", with no path to book at all. This state is reachable in production:
  `app/(onboarding)/onboarding/page.tsx:387` only inserts when `timeBlocksToInsert.length > 0` (all days
  skipped/disabled → zero blocks, and the insert error is unchecked), and the panel lets an owner delete
  every franja.
- Such a business is **still bookable today** through `schedule_exceptions` with special hours:
  `isDayOpen` (`booking-client.tsx:230`) returns `true` for a non-closed global exception regardless of
  `openDaysSet`, `handleDateSelect` builds `dayBlocks` from that exception, and the server backstop
  explicitly *accepts* it (`lib/time-block-services.ts:144` — "sin franja contenedora: se acepta"; the panel
  itself documents at `agenda-client.tsx:834` that special-hours days are not franjas). After this phase the
  client blocks, at step 1, bookings the server would happily accept.
- The same inversion applies to a **read failure**: `page.tsx:171` passes `timeBlocks={timeBlocks || []}`.
  The comment at `page.tsx:106-108` promises the fail-safe is directional ("nunca apaga servicios por un
  error de lectura") — that promise holds only for the bridge. A `time_blocks` read that errors (policy
  change, schema-cache miss, transient) now silently turns off the whole catalog of every business, with no
  error surfaced anywhere.

**Fix:** make the franja axis inert when there is nothing to reason about, mirroring the "no containing
block ⇒ accept" rule the server already uses:

```tsx
// booking-client.tsx, inside services.map
// Sin NINGUNA franja cargada la pregunta no tiene sujeto (negocio a medio configurar, o lectura
// fallida): el eje franja no puede afirmar nada y no apaga. Mismo criterio que isServiceAllowedAt,
// que ACEPTA cuando ninguna franja contiene el horario (lib/time-block-services.ts:144).
const scheduled = timeBlocks.length === 0 || isServiceScheduled(service.id, timeBlocks, timeBlockServices ?? [])
```

Add the missing regression case to `test/schedule-coverage-public.test.ts` (blocks `[]` + bridge `[]` ⇒ every
service scheduled) so the inversion cannot come back.

## Warnings

### WR-01: The staff axis is now guarded only by the browser `disabled` attribute — no server backstop

**File:** `app/[slug]/page.tsx:148-176`, `app/[slug]/booking-client.tsx:580-586`

**Issue:** Before this phase the RSC removed uncoverable services from the array it rendered
(`bookableServices`). That layer is gone. Grep confirms there is **no** server-side equivalent of the staff
rule: `lib/booking-core.ts` validates the franja axis (`enforceServiceWindow` → `isServiceAllowedAt` →
`service_not_scheduled`, `route.ts:227`) but never asks whether any active professional performs the
service. A request with `professionalId: null, anyProfessional: false` falls to `proId = null` → SENTINEL
bucket and is inserted. So an uncoverable service can still be booked (stale tab, devtools removing
`disabled`, or a crafted POST), producing an appointment — possibly with a paid deposit — that nobody on the
staff is mapped to fulfil. The project's own anti-pattern list forbids leaving a control only where the
client cooperates; `lib/booking-core.ts:189-192` says so verbatim about the `any_professional_unsupported`
gate.

**Fix:** add the mirror backstop next to the franja one in `lib/booking-core.ts`, evaluated on the
`business_id`-revalidated `service.id`, returning a domain code:

```ts
// eje staff: si hay staff nombrado y NINGÚN activo hace este servicio, no hay a quién asignarle el turno
const { data: pros } = await supabase.from('professionals')
  .select('id').eq('business_id', business.id).eq('active', true)
if ((pros?.length ?? 0) > 0) {
  const { data: bridge } = await supabase.from('professional_services')
    .select('professional_id, service_id').eq('business_id', business.id)
  if (!isServiceCovered(service.id as string, (pros || []) as Professional[], (bridge || []) as ProfessionalService[]))
    return { ok: false, error: 'service_not_staffed', status: 400 }
}
```

…and handle `service_not_staffed` in the client's error switch (`booking-client.tsx:429-455`) with the same
"recargá y elegí otro" copy used for `service_not_scheduled`. Gate it behind a flag as
`enforceServiceWindow` is, so the manual/abonos callers stay byte-identical.

### WR-02: The disabled reason fails WCAG AA contrast — `opacity-60` on the card dims the very text that explains it

**File:** `app/[slug]/booking-client.tsx:595, 626-628`

**Issue:** the disabled card gets `opacity-60`, which composites *everything inside it*, including the
reason `<p className="text-xs text-muted-foreground">`. Measured against the project tokens
(`app/globals.css:77,83,86` — bg `#f3ead8`, `--muted-foreground: #6b6253`, card `bg-secondary/30`):
`--muted-foreground` alone is ≈5.0:1 (passes AA), but at 60% alpha the effective colour is ≈`#a19888` →
**≈2.4:1**, well under the 4.5:1 that CLAUDE.md calls non-negotiable. The dark theme
(`--muted-foreground: #a99e8b` on `#1a1714`) degrades the same way. The feature's entire premise is that the
reason is *visible*; today it is the least readable text on the screen.

**Fix:** dim the decorative content, not the explanation. Drop `opacity-60` from the card and dim the inner
block instead, keeping the reason at full opacity and on a foreground token:

```tsx
!enabled ? 'border-border/50 bg-secondary/30 cursor-not-allowed' : …
// …
<div className={cn('flex items-center justify-between gap-3', !enabled && 'opacity-60')}> … </div>
{!enabled && <p className="mt-1 text-xs font-medium text-foreground/80">{…}</p>}
```

### WR-03: `disabled` removes the card from the tab order — keyboard and screen-reader users never get the reason

**File:** `app/[slug]/booking-client.tsx:585`

**Issue:** a natively `disabled` button is not focusable and is skipped by most AT navigation, so the reason
text ("Sin horarios disponibles" / "Sin profesional disponible") is announced to nobody navigating by
keyboard or by button list. CLAUDE.md requires every interactive element to have a visible focus state and,
per the phase brief, a disabled card must stay reachable/understandable. The existing
`focus-visible:ring-3` on the card is dead code in the disabled branch for the same reason.

**Fix:** use `aria-disabled` and guard the handler, which keeps focusability and lets the ring do its job:

```tsx
aria-disabled={!enabled}
aria-describedby={!enabled ? `${service.id}-motivo` : undefined}
onClick={() => { if (!enabled) return; setSelectedService(service); … }}
```

…with `id={`${service.id}-motivo`}` on the reason `<p>`. (This also makes `cursor-not-allowed` meaningful —
see IN-02.)

### WR-04: The owner's CMS preview does not receive the new prop — the preview no longer shows what the visitor sees

**File:** `components/landing/landing-renderer.tsx:297-305`, `app/(dashboard)/web/web-client.tsx:419-427`

**Issue:** `LandingRenderer` still only accepts `professionalServices?` and never forwards
`timeBlockServices`. `app/(dashboard)/web/web-client.tsx` renders `<LandingRenderer>` **without a
`bookingSlot` and without `professionalServices`**, so the preview mounts the fallback `BookingClient` with
both bridges empty ⇒ wildcard ⇒ **every service enabled**, while the live `/[slug]` disables them. The
preview wrapper's own comment (`web-client.tsx:415-416`) claims "Ahora el preview muestra exactamente lo que
verá el visitante" — after this phase that is false for both coverage axes. `landing-renderer.tsx:67-68`
also asserts the fallback is "un camino muerto"; the dashboard preview is a live consumer of it.

**Fix:** thread both bridges through `LandingRenderer` and pass them from `web-client.tsx` (the RSC that
feeds it already reads the other public views; add the two selects there), then drop the `?` on
`timeBlockServices` in `BookingClient` (IN-03) so a future call site cannot silently degrade.

### WR-05: The staff-axis test now guards a function with no production caller, and reads the public views with the service role

**File:** `test/service-coverage-public.test.ts:87,99,114` and `:191-196`

**Issue:** two problems in the file this phase edited.
1. Grep confirms `bookableServices` has **zero production call sites** after `page.tsx` stopped using it —
   its only remaining callers are these three assertions. The behaviour the public now gets flows through
   `isServiceStaffed`, which has **no test at all** (neither unit nor DB-backed), including its sentinel
   guard that moved in this phase. The suite is green while the code path that ships is unverified.
2. `readPublicBooking()` reads `public_services` / `public_professionals` /
   `public_professional_services` with `t.admin` (**service role**, bypasses RLS), while the docstring
   claims it exercises "las MISMAS vistas acotadas que el RSC". Its brand-new sibling,
   `test/schedule-coverage-public.test.ts:24-27,71-76`, documents precisely why that is worthless for the
   failure mode ("el service-role bypassa RLS y haría pasar el test aunque la vista tuviera los permisos mal
   aplicados") and uses a bare anon client. The two files disagree on the discipline.

**Fix:** repoint the three assertions at `isServiceStaffed` (per service, the shape the component uses) or
add a parallel `describe` for it, and swap `t.admin` for the same `anonPublic()` helper the schedule test
defines (extract it to `test/helpers/` instead of duplicating it).

### WR-06: No test covers the empty-blocks input that produces CR-01

**File:** `test/schedule-coverage-public.test.ts:100-122`

**Issue:** the new file covers (a) mapped bridge and (b) empty bridge, both with **exactly one** seeded time
block (`expect(blocks.length).toBe(1)` in both cases). The "no franjas at all" input — the one that silently
turns `false` for every service (CR-01) — is never exercised here nor in
`test/time-block-services.test.ts` (its `isServiceScheduled` suite always passes 2 blocks). The stated goal
of case (b) is "un bug que devolviera `false` para todo … apagaría el catálogo entero"; the file catches
that only for the bridge dimension.

**Fix:** add case (c): delete the franjas (or seed a tenant without any) and assert
`isServiceScheduled(svc, [], []) === true` under the fixed rule from CR-01.

### WR-07: All-disabled step 1 has no empty state and no way out

**File:** `app/[slug]/booking-client.tsx:566-632`

**Issue:** when every service is uncoverable (very reachable now — see CR-01, and any business mid-migration
of its franjas), step 1 renders a grid of dead cards and nothing else: no explanation at the step level, no
suggested action, no fallback contact. CLAUDE.md is explicit ("Empty states: ilustración/icono +
explicación + acción sugerida. Nunca dejar pantalla en blanco" / "Nunca dejar al usuario varado"). The
per-card copy is deliberately generic, so the visitor is left with a wall of grey boxes and no next step.

**Fix:** when `services.every(s => !enabledFor(s))`, render a single explanatory block instead of / above the
grid, with the business's WhatsApp CTA (already available as `business.whatsapp`, used by the floating
button) as the suggested action. Hoist the per-service `scheduled`/`staffed` computation into a `useMemo`
map above the JSX so both the grid and the empty state read the same values.

## Info

### IN-01: The franja check is location-blind — a covered service can still dead-end

**File:** `app/[slug]/booking-client.tsx:574`
**Issue:** `isServiceScheduled` is evaluated against **all** `timeBlocks` of the business, ignoring the
service's own location scoping (`service.location_ids` / `location_id`, used at `:135-140`) and whether the
block's location is active. A service restricted to sede A whose only covering franja lives in sede B shows
as enabled and dies at step 3 with an empty grid — the exact experience the phase exists to remove. The
calendar layer is documented as deliberately permissive, so this is consistent with precedent rather than a
new inversion.
**Fix:** if the dead-end is worth closing, intersect with the allowed locations
(`blocksForService(...).some(b => !b.location_id || isAllowed(b.location_id))`), and reuse the same helper
for `openDaysSet`.

### IN-02: `cursor-not-allowed` is inert on a natively disabled button

**File:** `app/[slug]/booking-client.tsx:595`
**Issue:** browsers suppress pointer interaction on `disabled` form controls, so the class is a no-op today.
It becomes meaningful only after WR-03 (switch to `aria-disabled`).
**Fix:** keep the class and apply WR-03, or drop it.

### IN-03: `timeBlockServices?` optional only serves the un-threaded fallback

**File:** `app/[slug]/booking-client.tsx:44`
**Issue:** the only justification for the `?` is the `LandingRenderer` fallback, which WR-04 shows should be
threaded rather than left degraded. An optional prop on the sole coverage input is a standing invitation for
a future call site to silently lose the gating.
**Fix:** after WR-04, make it required (`timeBlockServices: TimeBlockService[]`) and delete the `?? []` at
`:197` and `:574`.

### IN-04: `<p>` inside `<button>` is invalid nesting

**File:** `app/[slug]/booking-client.tsx:626-628`
**Issue:** `<button>`'s content model is phrasing content; the new reason paragraph follows the pre-existing
`<p>` usage inside the same card (`:605-616`), so this is consistent with the file, not a regression.
**Fix:** if ever normalised, use `<span className="block …">` throughout the card.

### IN-05: `public_time_block_services` is a DEFINER view granted to anon (pre-existing, not introduced here)

**File:** `app/[slug]/page.tsx:109`; `supabase/migrations/071_time_block_services.sql:144-161`
**Issue:** the view runs as DEFINER without `security_invoker` (deliberate — documented Pitfall 5), so a
PostgREST call from `anon` *without* the `business_id` filter returns the mapping rows of every tenant
(UUID triples: business/time_block/service). The RSC under review filters correctly, so this phase adds no
leak; the exposure is inherent to the `public_*` pattern accepted repo-wide (059/044) and its write path was
already closed in migr. 072.
**Fix:** none required for this phase. Noted so the consumer added here is not mistaken for the mitigation.

---

_Reviewed: 2026-09-10T22:50:52Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
