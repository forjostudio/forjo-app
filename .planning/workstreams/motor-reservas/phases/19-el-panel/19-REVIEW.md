---
phase: 19-el-panel
reviewed: 2026-08-26T13:40:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - app/(dashboard)/agenda/agenda-client.tsx
  - app/(dashboard)/agenda/page.tsx
  - app/(dashboard)/settings/settings-client.tsx
  - app/[slug]/booking-client.tsx
  - lib/agenda-hours-payload.ts
  - lib/time-block-services.ts
  - supabase/migrations/074_save_agenda_blocks.sql
  - supabase/schema.sql
  - test/agenda-hours-payload.test.ts
  - test/agenda-save-blocks-rpc.test.ts
  - test/time-block-services.test.ts
findings:
  critical: 1
  warning: 8
  info: 4
  total: 13
status: issues_found
---

# Phase 19: Code Review Report

**Reviewed:** 2026-08-26T13:40:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Reviewed the Phase 19 delta (`d5fc596^..HEAD`) that lets a business owner declare which services
are offered in each time block, and persists it atomically through the new
`public.save_agenda_blocks` RPC (migration 074, already applied to production).

**What holds up under adversarial reading:**

- **Tenant isolation in the RPC is sound.** `SECURITY INVOKER` + an authorship guard against
  `auth.uid()` + an explicit `business_id` on every `WHERE`/`INSERT`/`ON` clause. The `UPDATE`
  filters on `id AND business_id` and raises `block_not_found` instead of degrading to `INSERT`,
  which closes the realizable attack (block ids are public via `public read time_blocks`
  `USING (true)`). The `REVOKE ... FROM PUBLIC/anon` plus the `ALTER DEFAULT PRIVILEGES` for
  `FUNCTIONS` is the right fix at the right level.
- **The atomicity/diff contract works.** Traced all four scenarios from the review brief:
  save-twice-without-reload does *not* duplicate (post-save re-derivation gives every block a real
  id, so the second payload is all-`UPDATE`); editing a mapped block's time keeps the mapping
  (`UPDATE` on the same row, the `ON DELETE CASCADE` child is never touched); the multi-location
  payload is complete (`buildSaveHoursPayload` has no location parameter to filter by, enforced by
  its signature); `ON CONFLICT ("time_block_id","service_id")` matches the real PK
  (`time_block_services_pkey`, schema.sql:1517).
- `supabase/schema.sql` is a faithful surgical reflection of 074 (190 insertions, 0 deletions;
  function body, `REVOKE`/`GRANT` at 4095-4097, and the default-ACL revoke at 4438 all present and
  in replay-correct order).
- `tsc --noEmit` clean; 36/36 pure tests pass; `eslint` on the touched files reports only the
  known out-of-scope `react-hooks/purity` error.

**Where it does not hold up:** the write path leaves the editor fully interactive while the RPC is
in flight and then blindly overwrites local state with the server's answer (CR-01 — silent loss of
exactly the data class this phase exists to protect). Beyond that, the client-side validation gap
on empty time inputs collides with a classifier that mislabels the resulting DB error as a network
problem (WR-01/WR-02), the new delete-service warning states something that is factually false for
multi-service blocks (WR-03), the RPC validates block and service tenancy but not `location_id`
(WR-04), and the `canchas` gate can hide mappings the engine still enforces (WR-05).

## Critical Issues

### CR-01: `saveHours` silently discards edits made while the save is in flight

**File:** `app/(dashboard)/agenda/agenda-client.tsx:740-800` (overwrite at `:777-778`; unguarded
inputs at `:1357`, `:1364`; unguarded chips at `:296-318`)

**Issue:**
`saveHours` sets `savingHours` (which only disables the *save button*) and then awaits the RPC.
Every other control in the editor stays live: both `type="time"` inputs, the ×/eliminar button,
`Agregar bloque`, the day toggle, `Copiar día`, and — critically — every `ServiceChip`. When the
RPC resolves, the handler does a **non-functional** state replacement:

```tsx
setDayStates(buildDayStatesFromRows((data ?? []) as SavedAgendaBlock[]))
setHoursDirty(false)
```

Any `setDayStates` queued between the RPC dispatch and its resolution is clobbered, and
`setHoursDirty(false)` erases the *only* signal that something was pending. Concretely: the owner
clicks "Guardar horarios", toggles two more service chips while the spinner is up, and the app
lands on "Horarios guardados" with no dirty indicator and the two chips visually reverted. That is
the exact failure mode the phase's own migration header calls "the worst possible failure mode" —
a mapping that vanishes without noise and whose end state (comodín) is visually identical to
"never configured" — reintroduced on the client side after being closed on the DB side.

This is trivially reachable on a mobile connection (the RPC is a multi-statement plpgsql loop, not
a single-row write), and the whole point of the chips line is that it invites rapid successive
clicks.

Note that the design decision to overwrite instead of merge is correct (P-01 requires re-derivation
from the returned rows). The defect is that nothing prevents the user from creating divergent state
during the window.

**Fix:** Freeze the editor for the duration of the write, matching what `savingHours` already does
for the button. Minimum viable:

```tsx
// 1. Inputs de hora
<Input type="time" value={block.start_time} disabled={savingHours}
       onChange={e => updateBlock(day, idx, 'start_time', e.target.value)} ... />
<Input type="time" value={block.end_time} disabled={savingHours}
       onChange={e => updateBlock(day, idx, 'end_time', e.target.value)} ... />

// 2. El botón de eliminar bloque
<button onClick={() => removeBlock(day, idx)} disabled={savingHours} aria-label="Eliminar bloque" ... >

// 3. El chip de servicio — nuevo prop `disabled`, propagado desde BlockServicesLine
function ServiceChip({ label, selected, inactive, ariaLabel, disabled, onToggle }: {
  /* ... */ disabled?: boolean
}) {
  return (
    <button type="button" onClick={onToggle} disabled={disabled} aria-pressed={selected}
            aria-label={ariaLabel}
            className="... disabled:pointer-events-none disabled:opacity-50">
```

…and pass `disabled={savingHours}` down through `BlockServicesLine`, plus the same guard on
`Agregar bloque`, el toggle de día y `Copiar día`. A cheaper (but weaker) alternative is an early
return guard inside every mutator (`if (savingHours) return`), which avoids threading a prop but
gives the user no visual explanation for why their click did nothing — prefer the `disabled` route.

## Warnings

### WR-01: `validateBlocks` accepts an empty `start_time`, so the DB cast fails instead of the backstop

**File:** `app/(dashboard)/agenda/agenda-client.tsx:662-671`
(consumed by `supabase/migrations/074_save_agenda_blocks.sql:187`)

**Issue:**
`<Input type="time">` can be cleared, which sets `block.start_time = ''`. The only client check is
a lexicographic comparison:

```tsx
if (b.end_time <= b.start_time) return { ...b, error: 'La hora fin debe ser mayor a la hora inicio' }
```

With `start_time === ''` and `end_time === '18:00'`, `'18:00' <= ''` is **false** (any non-empty
string sorts after `''`), so the block passes validation and travels in the payload. In the RPC,
`v_start := (v_item->>'start_time')::time without time zone` then raises `22007
invalid input syntax for type time: ""` — **before** the `v_start IS NULL` branch at `:204` can
ever run, so the intended `invalid_block` backstop (T-19-10) is unreachable for this input class.

The same hole exists for a cleared `end_time` when `start_time` is empty too, and for
`location_id` (`::uuid` cast at `:190`).

**Fix:** Reject empty/malformed times in `validateBlocks` before the ordering check:

```tsx
const HHMM = /^\d{2}:\d{2}$/
const blocks = ds.blocks.map(b => {
  if (!HHMM.test(b.start_time) || !HHMM.test(b.end_time)) {
    return { ...b, error: 'Completá la hora de inicio y la de fin' }
  }
  if (b.end_time <= b.start_time) return { ...b, error: 'La hora fin debe ser mayor a la hora inicio' }
  return { ...b, error: undefined }
})
```

The DB side is fine as-is (a cast error still rolls the transaction back atomically); do **not**
edit migration 074 for this.

### WR-02: the `invalid` and `unknown` reject copies are dead ends for the user

**File:** `app/(dashboard)/agenda/agenda-client.tsx:402-430`

**Issue:** Two problems in the same table:

1. `SAVE_HOURS_REJECT_COPY.invalid` is `'Corregí los errores antes de guardar'`, but this branch is
   only reachable when the *server* rejected something the client validator let through — so there
   is no inline error painted on any block. The owner is told to fix errors that are nowhere on
   screen.
2. `classifySaveHoursError` only recognises `P0001`, `23503` and `PGRST202`. Every other Postgres
   SQLSTATE (including the `22007`/`22P02` cast failures from WR-01, `23514` check violations, and
   `23505`) falls to `'unknown'` → *"Revisá tu conexión y probá de nuevo"*, which asserts a network
   problem that did not happen and sends the owner into an infinite retry loop.

**Fix:** Split the copy so it does not lie about the cause:

```ts
const SAVE_HOURS_REJECT_COPY: Record<SaveHoursReject, string> = {
  reload: 'No se pudieron guardar los horarios. Recargá la página y probá de nuevo.',
  stale: 'Los horarios cambiaron desde otra pestaña o sesión. Recargá la página y volvé a guardar.',
  invalid: 'Hay una franja con horarios incompletos o inválidos. Revisalos y volvé a guardar.',
  not_deployed: 'No se pudieron guardar los horarios. Probá de nuevo en un momento.',
  unknown: 'No se pudieron guardar los horarios. Probá de nuevo.',
}
```

and add a `data`-class branch so cast failures land on `invalid` rather than `unknown`:

```ts
// 22xxx = error de dato (hora vacía, uuid mal formado): es el payload del editor, no la red.
if (code.startsWith('22')) return 'invalid'
```

### WR-03: the delete-service warning claims blocks become "cualquier servicio" when they may not

**File:** `app/(dashboard)/settings/settings-client.tsx:1270` (count sourced at `:1207-1208`)

**Issue:** The new D-07 sentence is unconditional:

> `Está asignado a ${delInfo.blocks} franjas horarias de tu agenda: al eliminarlo, esas franjas vuelven a ofrecer cualquier servicio.`

`delInfo.blocks` counts rows in `time_block_services` where `service_id = s.id` — i.e. *blocks this
service is mapped to*, not *blocks that would become wildcard*. A block mapped to `{Corte, Color}`
loses only the `Corte` row on cascade and stays **restricted to `Color`**. For that block the
warning is factually false, and in the wrong direction: the owner is told the block widens when it
actually narrows. Since the whole justification for the sentence (per the in-code comment) is
"avisar de un borrado que AGRANDA lo que se ofrece", the message is only correct for the subset it
does not distinguish.

**Fix:** Count only the blocks whose *sole* mapping is this service, or soften the claim. The
cheapest correct version keeps one round trip and computes the subset client-side:

```ts
// (e) Las franjas mapeadas: se traen los time_block_id de ESTE servicio…
supabase.from('time_block_services').select('time_block_id')
  .eq('business_id', business.id).eq('service_id', s.id),
// (f) …y todas las filas del negocio, para saber cuáles de esas franjas quedan SIN mapeo.
supabase.from('time_block_services').select('time_block_id, service_id')
  .eq('business_id', business.id),
```

```ts
const mine = new Set((blocks.data ?? []).map(r => r.time_block_id))
const others = new Set((allRows.data ?? [])
  .filter(r => r.service_id !== s.id && mine.has(r.time_block_id))
  .map(r => r.time_block_id))
// Sólo estas vuelven a COMODÍN; el resto siguen restringidas a los servicios que les quedan.
const toWildcard = [...mine].filter(id => !others.has(id)).length
```

If you prefer to avoid the second query, change the copy to state only what is provable:
`… Está asignado a N franjas horarias de tu agenda y al eliminarlo se va a quitar de todas.`

### WR-04: `save_agenda_blocks` never checks that `location_id` belongs to the tenant

**File:** `supabase/migrations/074_save_agenda_blocks.sql:190, 219, 236`
(mirrored in `supabase/schema.sql:617, 645, 655`)

**Issue:** The function validates block tenancy (`AND tb."business_id" = p_business_id` on the
`UPDATE`) and delegates service tenancy to the composite FKs of migration 073, and its own header
at `:255-260` asserts that *"las FK compuestas … ya rechazan en la BASE cualquier combinación en la
que el bloque o el servicio no sean del negocio"*. That claim does not cover `location_id`:
`time_blocks_location_id_fkey` (schema.sql:2163-2164) is a **plain** FK to `locations(id)` with
`ON DELETE SET NULL`, not a `(id, business_id)` composite — and `locations` has no `(id,
business_id)` unique to hang one on (only `locations_pkey`, schema.sql:1620).

Consequence: an authenticated owner can forge a payload with any other tenant's location UUID and
the RPC will write it into their own `time_blocks` row. The blast radius is bounded (no read or
write of the other tenant's data; the block simply becomes unreachable from the owner's own
location tabs, and if the foreign location is later deleted the FK nulls it out — after which the
next save silently drops the block, because `buildSaveHoursPayload` discards location-less blocks
when the business has locations). It is not a tenant *breach*, but it is a missing input validation
on a brand-new privileged write path whose documentation claims the opposite.

The old delete-all + insert path had the same hole, so this is not a regression — but 074 is the
moment where every other tenancy check was consolidated, and it was skipped here.

**Fix:** Migration 074 is already applied to production, so **do not edit it** — this needs a new
`supabase/migrations/075_*.sql`. Preferred shape (mirrors 073's approach, no second source of truth
inside the function):

```sql
ALTER TABLE ONLY "public"."locations"
  ADD CONSTRAINT "locations_id_business_uq" UNIQUE ("id", "business_id");

ALTER TABLE ONLY "public"."time_blocks"
  DROP CONSTRAINT "time_blocks_location_id_fkey";

ALTER TABLE ONLY "public"."time_blocks"
  ADD CONSTRAINT "tb_location_same_tenant"
  FOREIGN KEY ("location_id", "business_id")
  REFERENCES "public"."locations"("id", "business_id") ON DELETE SET NULL;
```

Verify the backfill is clean first (`SELECT count(*) FROM time_blocks tb JOIN locations l ON
l.id = tb.location_id WHERE l.business_id <> tb.business_id;` must return 0), then reflect it
surgically in `supabase/schema.sql` and update the 074 header's claim.

### WR-05: the `canchas` gate hides mappings the engine still enforces

**File:** `app/(dashboard)/agenda/agenda-client.tsx:565, 574`

**Issue:**

```tsx
const isCanchas = resolveVertical(business).key === 'canchas'
const showServicesLine = !isCanchas && hasChipCatalog
```

The in-code justification is *"Sin el gate esas franjas quedan comodín igual (cero filas en la
puente) ⇒ el gate no cambia comportamiento"*. That only holds for a business that has **always**
been `canchas`. The vertical is user-editable (`lib/verticals.ts:176` — *"Type options grouped by
vertical, for the onboarding / settings select"*), so a `belleza`/`salud` business that mapped
services and *then* switched to `canchas` keeps its `time_block_services` rows. The engine
(`blocksForService` / `isServiceAllowedAt`) still reads them and still restricts availability, but
the panel renders no line — the owner has no surface anywhere in the app to see or clear the
restriction. Public slots disappear with nothing on screen explaining why.

Note the gate is also asymmetric with the second gate right below it: `hasChipCatalog` explicitly
falls back to `dayStates.some(d => d.blocks.some(b => b.service_ids.length > 0))` precisely to
avoid this class of invisibility, but the `canchas` gate short-circuits it.

**Fix:** Make the vertical gate yield to existing data, exactly like the catalog gate already does:

```tsx
// En canchas la línea NO se ofrece… salvo que ya existan mapeos: esconder una restricción que el
// motor sigue aplicando deja al dueño sin ningún lugar donde verla ni quitarla.
const hasExistingMappings = dayStates.some(d => d.blocks.some(b => b.service_ids.length > 0))
const showServicesLine = (!isCanchas || hasExistingMappings) && hasChipCatalog
```

(The guide paragraph at `:1309-1327` can stay gated on `!isCanchas`.)

### WR-06: `hasChipCatalog` reimplements the wildcard rule inline

**File:** `app/(dashboard)/agenda/agenda-client.tsx:571-572`

**Issue:**

```tsx
const hasChipCatalog = serviceCatalog.some(s => s.active)
  || dayStates.some(d => d.blocks.some(b => b.service_ids.length > 0))
```

`b.service_ids.length > 0` is literally the negation of the comodín rule, written inline — the
thing `lib/time-block-services.ts:196-236` and the component's own `isDraftBlockWildcard` helper
(`:193-199`) exist to prevent, and that the module header calls out by name: *"AGENDA-02 prohíbe
explícitamente reimplementar la lectura en el componente … dos interpretaciones es exactamente cómo
el panel y el motor terminan diciendo cosas distintas sobre la misma franja"*. The helper is
already defined 380 lines above and is unused outside `BlockServicesLine`.

Today the two agree; the point of the rule is that they cannot be made to disagree by a later edit.

**Fix:**

```tsx
const hasChipCatalog = serviceCatalog.some(s => s.active)
  || dayStates.some(d => d.blocks.some(b => !isDraftBlockWildcard(b.service_ids)))
```

### WR-07: the hardened `count === null` guard was applied to one of five counts

**File:** `app/(dashboard)/settings/settings-client.tsx:1222`

**Issue:** The phase added `blocks.count === null` to the pre-check guard with an explicit
rationale (`:1214-1221`): *"un `head: true` que no puede resolverse contra la tabla vuelve 204 con
`error: null` y `count: null` … sobre un fallo este diálogo no ofrece la acción"*. That argument
applies verbatim to `abo` (`:1203-1204`) and `hist` (`:1205-1206`), which are the exact same
`select(..., { count: 'exact', head: true })` shape and are still consumed with `?? 0` at
`:1240-1241`.

This matters more for `abo` than for the new `blocks`: `activeAbono` feeds `delBlocked`
(`:1246`), so a null count silently flips a **blocked** delete into a **confirmable** one. The DB
trigger `services_block_delete_trg` still rejects it, so no data is lost — but the modal offers a
destructive action it has been told it cannot verify, which is precisely the WR-02/P-08 failure the
guard was written to prevent.

**Fix:** Extend the guard to the counts whose null value is load-bearing:

```ts
if (futDias.error || futHoy.error || abo.error || hist.error || blocks.error
    || abo.count === null || hist.count === null || blocks.count === null) {
```

### WR-08: `isServiceScheduled` is a dead export with a comment promising this phase would use it

**File:** `lib/time-block-services.ts:99-117`

**Issue:** `isServiceScheduled` has zero production consumers — the only references outside its own
definition are in `test/time-block-services.test.ts` (verified by repo-wide grep). Its docblock
states *"el aviso en el panel es de la Phase 19"*, and the module header at `:9-10` repeats it
(*"el aviso de D-06 cuando a un servicio no lo cubre ninguna"*). Phase 19 shipped the D-07 delete
warning instead and marked AGENDA-05/06 Complete without implementing a D-06 aviso.

So the repo now carries an exported helper whose documentation points at a consumer that was
decided against, and there is no `deferred-items.md` entry covering it (the only entry is the
`react-hooks/purity` one). A reader hunting for the D-06 warning will conclude it exists.

**Fix:** Pick one and make the artifact honest:

- If the D-06 aviso is deferred to Phase 20, add it to
  `.planning/workstreams/motor-reservas/phases/19-el-panel/deferred-items.md` and amend the
  docblock: `⚠ Sin consumidor todavía — el aviso de D-06 se difiere a la Phase 20.`
- If it is dropped, delete `isServiceScheduled` and its suite, and remove the D-06 promise from the
  module header at `:9-10`.

## Info

### IN-01: `Ver todos (N)` counts the wildcard chip as if it were a service

**File:** `app/(dashboard)/agenda/agenda-client.tsx:273, 338`
**Issue:** `total = shown.length + (wildcard ? 1 : 0)` is used both for the collapse threshold
(correct — it is a height calculation) and for the visible label `Ver todos (${total})`. A business
with 8 services on a comodín block renders "Ver todos (9)", implying a 9th service.
**Fix:** Keep `total` for the layout math and label with the real count:
`{expanded ? 'Ver menos' : \`Ver todos (${shown.length})\`}`.

### IN-02: `expandedChips` is not reset after a save or a day copy

**File:** `app/(dashboard)/agenda/agenda-client.tsx:551-563, 704-717, 777`
**Issue:** The `${day}-${idx}` collapse keys are invalidated by index shifts. `removeBlock` and
`selectLocation` clear the Set, but two other paths also reorder blocks and do not:
`applyCopyDay` rebuilds target days as `[...others, ...copied]`, and the post-save re-derivation
returns rows ordered by `(day_of_week, start_time)` which need not match the local insertion order.
An expanded chip line can therefore jump to a different franja. Purely cosmetic (view state, never
persisted).
**Fix:** `setExpandedChips(new Set())` alongside `setHoursDirty(false)` in `saveHours`, and in
`applyCopyDay` next to `setHoursDirty(true)`.

### IN-03: `hoursDirty` does not track duración del turno ni descanso

**File:** `app/(dashboard)/agenda/agenda-client.tsx:501-502, 540, 786-790`
**Issue:** The same "Guardar horarios" button persists `default_slot_duration` and
`buffer_minutes`, but `setSlotDuration`/`setBufferMinutes` never set `hoursDirty`, so changing
either shows no "Cambios sin guardar". The in-code rationale enumerates "los seis gestos" of the
grid only, so this is deliberate — but it makes the indicator's absence non-informative for two
controls sitting in the same card behind the same button.
**Fix:** Either set the flag in both setters, or narrow the label to what it actually covers
(e.g. `Franjas sin guardar`).

### IN-04: `key={idx}` on the block list

**File:** `app/(dashboard)/agenda/agenda-client.tsx:1349`
**Issue:** Blocks are keyed by array index (`key={idx}`) while the list is reordered by the
post-save re-derivation and by `applyCopyDay`. React reuses the wrong DOM nodes, which is why
`expandedChips` (IN-02) desyncs visibly. Pre-existing pattern, but the new re-derivation makes
reordering routine rather than exceptional.
**Fix:** Key on the stable identity when it exists: `key={block.id ?? \`new-${idx}\`}`.

---

_Reviewed: 2026-08-26T13:40:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
