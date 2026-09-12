---
phase: 21-lo-que-el-negocio-declara
reviewed: 2026-09-11T21:40:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - app/(dashboard)/agenda/agenda-client.tsx
  - app/(onboarding)/onboarding/page.tsx
  - components/agenda/block-services-line.tsx
  - lib/onboarding-agenda.ts
  - test/onboarding-agenda-rpc.test.ts
  - test/onboarding-agenda.test.ts
findings:
  critical: 1
  warning: 7
  info: 5
  total: 13
status: issues_found
---

# Phase 21: Code Review Report

**Reviewed:** 2026-09-11T21:40:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Scope reviewed against `f2d2ddd`. Three things check out cleanly and are worth stating so the rest of the report reads correctly:

1. **The chips extraction is a true move, not a rewrite.** A comment-stripped textual diff of the removed block in `agenda-client.tsx` against `components/agenda/block-services-line.tsx` produces exactly two deltas: the added imports/`'use client'` header, and `function BlockServicesLine` → `export function BlockServicesLine`. The panel call site (`agenda-client.tsx:1304-1312`) passes the identical prop set. No behavioural drift.
2. **No index-based correlation anywhere.** `services.id` is client-generated (`newServiceId`), the insert deliberately omits `.select()`, and the RPC payload references the same uuid. The synthetic `${day}-${idx}` ids in `onboardingDraftBlocks` never leave the module. The focus concern is genuinely absent.
3. **Tenant isolation in the submit path holds.** `p_business_id` and every `business_id` come from the server-returned `businesses` row, never from form state; `save_agenda_blocks` is SECURITY INVOKER with an `owner_id = auth.uid()` guard; no service-role client is reachable from this client component. `tsc --noEmit` exits 0 and the pure suite is 12/12 green.

What does not hold is the **"lo que veo es lo que queda" invariant the phase was written to protect**. There is a reachable state where the chips line, the D-07 coverage notice, and the payload actually persisted say three different things about the same franja — verified by executing a scratch reproduction against the real modules, not by inspection. The deleted-service backstop covers `removeService`; nothing covers a service whose *name* is cleared, and the name is exactly what `liveServiceIds` and `chipCatalog` are keyed on.

Secondary theme: the two failure paths the phase introduced (`falloServicios`, `agendaErr`) degrade correctly but under-report. The owner is told services failed; they are never told that the per-franja mapping they just configured was silently converted to wildcard — i.e. to the most permissive possible configuration, which is what the public booking page will then honour.

Test-quality theme: the pure suite constrains the translator well, but **the gating expression that actually decides what gets persisted — `canMapServices && perFranja && !falloServicios` at `page.tsx:488` — is asserted by nothing**. All three flags can be inverted and the entire suite stays green.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: A service whose name is cleared while still mapped makes the chips line, the coverage notice and the persisted agenda disagree

**File:** `lib/onboarding-agenda.ts:135-146`, `app/(onboarding)/onboarding/page.tsx:559`, `app/(onboarding)/onboarding/page.tsx:579`

**Issue:**
`liveServiceIds` (`page.tsx:489`) is derived from `filasDeServicios`, which filters `services.filter(s => s.name.trim())`. `chipCatalog` (`page.tsx:559`) applies the same name filter. But `dayStates[d].blocks[i].service_ids` is only cleaned when a service row is **deleted** (`removeService`, `page.tsx:226-238`) — never when its name is edited to empty. Clearing the name of an already-mapped service is one back-navigation away (Horarios → Profesionales → Servicios, then select-all + delete in the name input).

In that state, for a franja whose only declared service is the now-unnamed one:

- **The chips line says "restringida, a nada":** `isDraftBlockWildcard(['<unnamed-id>'])` is `false`, so the "Cualquier servicio" chip is suppressed (`block-services-line.tsx:145,204`) — but the id is not in `catalog`, so no chip renders selected either (`block-services-line.tsx:152`). The owner sees a franja that is neither comodín nor visibly restricted.
- **The notice says the rest of the catalogue is uncovered:** `servicesWithoutCoverage` builds `draftBridge` from the *raw* `block.service_ids` (`onboarding-agenda.ts:142-144`), so the franja counts as restricted and covers nothing.
- **The database gets the opposite:** `buildOnboardingAgendaPayload` filters against `vigentes` (`onboarding-agenda.ts:76`), the id drops out, `service_ids` becomes `[]` — and an empty array *is* the wildcard. The franja is persisted as **open to the entire catalogue**.

Verified by executing the three modules directly (scratch vitest run, all three assertions passed simultaneously):

```ts
const services = [{ id: A, name: 'Yoga' }, { id: B, name: '' }]
const days = /* lunes 09:00-13:00, service_ids: [B] */

isBlockWildcard('x', [{ business_id: '', time_block_id: 'x', service_id: B }])  // false  → sin chip comodín
servicesWithoutCoverage(services, days).map(s => s.name)                        // ['Yoga'] → el aviso miente
buildOnboardingAgendaPayload(days, { mapServices: true, liveServiceIds: [A] })[0].service_ids // [] → comodín
```

Why this is Critical and not a warning: the persisted result is the **permissive** one. A studio that declared "los martes de 15 a 16 sólo cerámica" ships a franja that the public booking engine will offer for every service in the catalogue — the exact class of silent, plausible, wrong data the phase's own module header (`onboarding-agenda.ts:10-22`) says it exists to prevent. And the coverage notice actively asserts the opposite of what was saved, which trains the owner to distrust it.

**Fix:** Make "vigente" one rule applied at every boundary, not just at the payload. Thread the live ids through the notice so its bridge matches what is persisted:

```ts
// lib/onboarding-agenda.ts
export function servicesWithoutCoverage<S extends { id: string; name: string }>(
  services: S[],
  days: OnboardingDayDraft[],
): S[] {
  // Vigentes = EXACTAMENTE el mismo criterio que usa el payload (nombre no vacío): si el aviso
  // razona sobre ids que el payload descarta, dice algo distinto de lo que se guarda.
  const vigentes = new Set(services.filter(s => s.name.trim() !== '').map(s => s.id))
  const draftBlocks = onboardingDraftBlocks(days).map(b => ({
    ...b,
    service_ids: b.service_ids.filter(id => vigentes.has(id)),
  }))
  const draftBridge = draftBlocks.flatMap(b =>
    b.service_ids.map(serviceId => ({ business_id: '', time_block_id: b.id, service_id: serviceId })),
  )
  return services.filter(s => s.name.trim() !== '' && !hasScheduleCoverage(s.id, draftBlocks, draftBridge))
}
```

and apply the same filter to the prop the chips line receives, so the comodín chip appears exactly when the franja will be persisted as comodín:

```tsx
// app/(onboarding)/onboarding/page.tsx — call site de BlockServicesLine
const vigentes = new Set(chipCatalog.map(s => s.id))
...
<BlockServicesLine serviceIds={b.service_ids.filter(id => vigentes.has(id))} ... />
```

(Cleaning the state inside `updateService` is the cheaper-looking alternative but is worse: it would destroy the mapping while the owner is mid-retype of a name, which is a second silent data loss.)

## Warnings

### WR-01: A failed services insert silently converts the whole per-franja mapping to wildcard, and the toast never says so

**File:** `app/(onboarding)/onboarding/page.tsx:465-473`, `app/(onboarding)/onboarding/page.tsx:487-490`

**Issue:** `falloServicios` correctly forces `mapServices: false` — that part is right and prevents the 23503/agenda-wipe. But the only feedback is *"Creamos tu negocio, pero no pudimos guardar tus servicios. Entrá a Servicios y cargalos."* The owner re-creates their services in the panel and has no idea that the franja↔servicio configuration they filled in during the wizard was dropped, nor that their agenda is now wide open. The project rule for error copy is "what went wrong **and** how to fix it"; this says neither about the half that matters more.

**Fix:** Make the message reflect what was actually discarded:

```ts
toast.error(
  perFranja && canMapServices
    ? 'Creamos tu negocio, pero no pudimos guardar tus servicios, así que tampoco pudimos guardar qué se da en cada franja. Entrá a Servicios, cargalos, y después definí las franjas en Agenda.'
    : 'Creamos tu negocio, pero no pudimos guardar tus servicios. Entrá a Servicios y cargalos.'
)
```

### WR-02: `globalThis.crypto.randomUUID()` in the `useState` initializer hard-crashes onboarding in an insecure context

**File:** `app/(onboarding)/onboarding/page.tsx:37-39`, `app/(onboarding)/onboarding/page.tsx:134`

**Issue:** `Crypto.randomUUID` is `[SecureContext]` — on a non-HTTPS origin the method is **absent**, not broken, so the call throws `TypeError: globalThis.crypto.randomUUID is not a function`. It now runs in the `useState` lazy initializer, i.e. during the first render of the page, with no error boundary above it: the entire onboarding screen goes blank. `https://` production is fine, but `http://192.168.x.x:3000` — the standard way this project does mobile UAT on a real device — is not, and before this phase the page rendered there. A regression that only appears on the device where the UAT actually finds bugs is worth closing.

**Fix:** Degrade instead of throwing; the id only needs to be unique within one wizard session.

```ts
function newServiceId(): string {
  // randomUUID es [SecureContext]: en http:// (UAT desde el celular en la LAN) el método NO existe
  // y tirar acá dejaría la pantalla del alta en blanco. El id sólo tiene que ser único dentro de
  // esta sesión del wizard; la unicidad real la garantiza la PK de services.
  const c = globalThis.crypto
  if (typeof c?.randomUUID === 'function') return c.randomUUID()
  const b = new Uint8Array(16)
  c.getRandomValues(b)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`
}
```

### WR-03: An emptied duration/price field produces `NaN`, which nulls a NOT NULL column and loses every service — and now the mapping with it

**File:** `app/(onboarding)/onboarding/page.tsx:882`, `app/(onboarding)/onboarding/page.tsx:897`

**Issue:** `parseInt(e.target.value)` on a cleared `<input type="number">` yields `NaN`. `JSON.stringify({ duration_minutes: NaN })` serialises to `null`, and `services.duration_minutes` / `services.price` are both `NOT NULL` (`supabase/schema.sql:1365-1366`) → 23502 → the **whole array insert** fails, because a Supabase multi-row insert is one statement. Nothing blocks it: `validateServicePrice` only checks `< 0` (`NaN < 0` is `false`), `canAddService` only checks name + `priceError`, and `validateServiceName`'s `hasData` reads `NaN !== 30` as `true`.

The `parseInt` predates this phase, but its blast radius does not: `falloServicios` now also discards the entire per-franja mapping (WR-01), so one emptied minutes field costs the owner their catalogue *and* their agenda configuration.

**Fix:** Never let a non-finite number into state.

```ts
function toNumberOr(value: string, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}
// onChange de Min.:    updateService(i, 'duration_minutes', toNumberOr(e.target.value, 30))
// onChange de Precio:  updateService(i, 'price', toNumberOr(e.target.value, 0))
```

and extend `validateServicePrice`/add a duration check so `0` or negative minutes cannot be submitted (a service with `duration_minutes <= 0` is a degenerate input for the availability grid).

### WR-04: The per-franja toggle carries an ARIA attribute its role forbids and has no accessible name

**File:** `app/(onboarding)/onboarding/page.tsx:979-993`

**Issue:** Two separate defects on one control, both new in this phase:

1. `role="switch"` together with `aria-pressed` — `aria-pressed` is a `button`-role attribute and is not supported by `switch`. ESLint flags it (`jsx-a11y/role-supports-aria-props`, the **only new lint diagnostic** this phase introduces; the other three in these files predate `f2d2ddd`). The state is already carried correctly by `aria-checked`.
2. The button's accessible name is just `"Sí"` / `"No"`. The question it answers lives in a sibling `<span>` (`page.tsx:978`) with no `id`/`aria-labelledby` link, so a screen-reader user lands on "No, switch, off" with no idea what is being switched.

**Fix:**

```tsx
<span id="per-franja-label" className="text-sm font-medium">¿Cada franja es para un servicio puntual?</span>
<button
  type="button"
  role="switch"
  aria-checked={perFranja}
  aria-labelledby="per-franja-label"
  onClick={() => setPerFranja(v => !v)}
  ...
>
```

### WR-05: Nothing tests the gating expression that actually decides what is persisted

**File:** `test/onboarding-agenda.test.ts:1-189`, `test/onboarding-agenda-rpc.test.ts:1-170`, `app/(onboarding)/onboarding/page.tsx:487-490`

**Issue:** Both suites exercise `buildOnboardingAgendaPayload` with hand-written flags. The line that computes those flags in production —

```ts
mapServices: canMapServices && perFranja && !falloServicios
```

— is asserted by nothing. `vitest.config.mts` runs `environment: 'node'` and explicitly does not render JSX, so `handleFinish` has zero coverage. Mutating that expression (`!falloServicios` → `falloServicios`, `&&` → `||`, dropping `canMapServices`) leaves all 12 pure tests and all 3 RPC tests green while shipping precisely the failure the module header says the phase exists to prevent: a payload referencing service ids that were never inserted → 23503 on `tbs_service_same_tenant` → the all-or-nothing RPC reverts the agenda entirely.

**Fix:** Lift the decision out of the component into the pure module so it is testable, and assert it. E.g. add to `lib/onboarding-agenda.ts`:

```ts
/** ¿Se persiste el mapeo? Las TRES condiciones, en un solo lugar que se puede testear. */
export function shouldMapServices(
  { vertical, perFranja, servicesFailed }: { vertical: string; perFranja: boolean; servicesFailed: boolean },
): boolean {
  return vertical !== 'canchas' && perFranja && !servicesFailed
}
```

then `handleFinish` calls it and the suite pins all eight truth-table rows — in particular `servicesFailed: true ⇒ false` and `vertical: 'canchas' ⇒ false`.

### WR-06: The RPC test's "backstop" case never demonstrates the failure it claims to guard against

**File:** `test/onboarding-agenda-rpc.test.ts:149-170`

**Issue:** Case (c) is documented as proving that without the filter "la FK compuesta `tbs_service_same_tenant` rebota con 23503 y el RPC —todo-o-nada— revierte TAMBIÉN las franjas". It never sends an unfiltered payload. It asserts `p_blocks[0].service_ids).toEqual([svcCeramica])` — a pure assertion already covered by `onboarding-agenda.test.ts:78` — and then asserts the *filtered* payload succeeds, which proves only that a valid payload is valid. If the composite FK were dropped, or the RPC swallowed the 23503, this test would not notice.

**Fix:** Add the negative half, which is the only part that requires a database:

```ts
it('c-bis. sin el filtro, el id fantasma rebota con 23503 y NO queda ninguna franja', async () => {
  const days = dayStatesDelAlta()
  days[1].blocks[0].service_ids = [crypto.randomUUID()]           // id inexistente, SIN filtrar
  const crudo = buildOnboardingAgendaPayload(days, { mapServices: true, liveServiceIds: [] })
  crudo[0].service_ids = days[1].blocks[0].service_ids            // evadimos el backstop a propósito

  const { error } = await anonA.rpc('save_agenda_blocks', { p_business_id: seeded.bizA, p_blocks: crudo })
  expect(error?.code).toBe('23503')
  // Todo-o-nada: la llamada anterior dejó 2 franjas y ésta no pudo borrarlas ni reemplazarlas.
  expect(await readBridge(seeded.bizA)).toHaveLength(0)
})
```

Related: this whole suite is `describe.skipIf(!hasSupabaseCreds)`, so the assumption it exists to close (A2 — that a client-generated `services.id` is accepted by the INSERT policy) is only closed on machines/CI that actually have the three credentials. Worth confirming the CI job sets them, otherwise A2 remains open in the pipeline.

### WR-07: The professionals insert still discards its error, now inconsistently with its neighbour

**File:** `app/(onboarding)/onboarding/page.tsx:475-477`

**Issue:** Three consecutive writes in the same submit now have three different error policies: `services` is checked and reported, `save_agenda_blocks` is checked and reported, `professionals` is `await`ed and thrown away. A failing professionals insert produces a fully silent loss — the owner is redirected to a dashboard with a success toast and no professionals. The phase touched both siblings; leaving this one is an inconsistency a reader will read as intentional. (It also fires `.insert([])` when every name is blank, which is a wasted round-trip at best.)

**Fix:**

```ts
const filasDeProfesionales = professionals.filter(p => p.name.trim()).map(p => ({ name: p.name, business_id: business.id }))
if (filasDeProfesionales.length > 0) {
  const { error: proErr } = await supabase.from('professionals').insert(filasDeProfesionales)
  if (proErr) {
    console.error('[onboarding/professionals]', proErr.code)
    toast.error('Creamos tu negocio, pero no pudimos guardar tus profesionales. Entrá a Profesionales y cargalos.')
  }
}
```

## Info

### IN-01: Unused import

**File:** `app/(onboarding)/onboarding/page.tsx:13`
**Issue:** `Badge` is imported and never rendered (0 occurrences of `<Badge`). Pre-existing, surfaced by `@typescript-eslint/no-unused-vars` while linting this phase's files.
**Fix:** Delete the import.

### IN-02: Block identity is positional, so removing a block reassigns view state to its neighbour

**File:** `app/(onboarding)/onboarding/page.tsx:151-160`, `app/(onboarding)/onboarding/page.tsx:1023`
**Issue:** `expandedChips` is keyed `${day}-${idx}` and the block `<div>` uses `key={idx}`. Removing the first of three blocks shifts every later block's key, so an "expanded" chips line follows the position, not the franja. Copied from the panel, and it only affects view state — but the panel has persisted block ids available and the wizard does not, so the two will diverge in behaviour.
**Fix:** Give each `HourBlock` a local `uid` (the same `newServiceId()` generator) at creation and key both the list and `expandedChips` on it.

### IN-03: The generic catch logs the whole error object, contradicting the policy the same function just established

**File:** `app/(onboarding)/onboarding/page.tsx:526`
**Issue:** `console.error(err)` dumps the full Supabase error (message, details, hint, possibly table/constraint names) three lines after `console.error('[onboarding/agenda]', agendaErr.code)` deliberately logs only the code "para no arrastrar nombres de tabla ni de constraint a ningún lado". Browser console, so impact is low, but the inconsistency undercuts the stated rule.
**Fix:** `console.error('[onboarding/finish]', err instanceof Error ? err.message : err)` — the repo's standard shape.

### IN-04: Mixed update styles on the same state in the same function

**File:** `app/(onboarding)/onboarding/page.tsx:226-238`, `app/(onboarding)/onboarding/page.tsx:240-253`
**Issue:** `removeService` uses a stale-closure copy for `setServices(services.filter(...))` and a functional updater for `setDayStates(prev => ...)` in the same body; `updateService` uses the closure copy too. Correct for one click per render, fragile under batching or a future programmatic caller.
**Fix:** Use `setServices(prev => ...)` in both, matching the `dayStates` handlers.

### IN-05: `addBlock` can create an un-submittable block at the end of the day

**File:** `app/(onboarding)/onboarding/page.tsx:305-314`
**Issue:** `Math.min(h + 3, 23)` means a last block ending at `23:00` produces a new block of `23:00 — 23:00`, which `validateHours` immediately rejects ("La hora fin debe ser mayor a la hora inicio"). The owner is shown an error for a block they did not author. Pre-existing.
**Fix:** Clamp to a minimum span, e.g. `if (newEnd <= newStart) newEnd = '23:59'`, or skip creating the block and toast that the day is already full.

---

_Reviewed: 2026-09-11T21:40:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
