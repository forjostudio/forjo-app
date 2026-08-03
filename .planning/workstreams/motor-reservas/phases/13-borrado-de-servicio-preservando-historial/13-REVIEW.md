---
phase: 13-borrado-de-servicio-preservando-historial
reviewed: 2026-08-03T00:00:00Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - app/(dashboard)/abonos/abonos-client.tsx
  - app/(dashboard)/abonos/page.tsx
  - app/(dashboard)/appointments/appointments-client.tsx
  - app/(dashboard)/clients/clients-client.tsx
  - app/(dashboard)/dashboard/page.tsx
  - app/(dashboard)/finances/finances-client.tsx
  - app/(dashboard)/settings/settings-client.tsx
  - app/api/export/finances/route.ts
  - app/globals.css
  - components/crm/confirm-dialog.test.tsx
  - components/crm/confirm-dialog.tsx
  - components/crm/risk-badge.tsx
  - components/dashboard/canchas-manager.tsx
  - lib/appointment-service.ts
  - lib/appointment-time.ts
  - lib/canchas.ts
  - lib/types.ts
  - supabase/migrations/065_service_snapshot_and_delete_gate.sql
  - supabase/schema.sql
  - test/appointment-service.test.ts
  - test/appointment-time.test.ts
  - test/canchas-provision.test.ts
  - test/service-delete-gate.test.ts
  - test/service-snapshot.test.ts
findings:
  critical: 1
  warning: 8
  info: 5
  total: 14
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-08-03
**Depth:** standard
**Files Reviewed:** 24
**Status:** issues_found

## Summary

Reviewed migration 065 (snapshot + FK SET NULL + delete gate), the shared
`snapshot → join` helper and its 8 read-path consumers, the two-state delete
modal, and the five UAT gap-closure commits.

Verified clean (no findings):

- **Three-way predicate mirror.** `065_*.sql` §6.2, `schema.sql`
  `services_block_delete`, and the PostgREST pre-check in
  `settings-client.tsx:544-546` express the same predicate. The
  `.or('status.is.null,and(status.neq.cancelled,status.neq.completed)')` form is
  the exact PostgREST equivalent of `status IS NULL OR status NOT IN
  ('cancelled','completed')` — the NULL branch is present in all three, so a
  status-less appointment blocks in all three. `date >= today(AR)` matches:
  `(now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date` on the DB side
  vs `toLocaleDateString('en-CA', { timeZone: … })` on the client. Abono branch
  (`status = 'active'`) also matches.
- **Tenant isolation.** Every new query in the diff carries an explicit
  `.eq('business_id', …)` on top of RLS (the three pre-check queries, the
  `deleteService` DELETE, the fixed `toggleService` UPDATE). Both snapshot
  triggers gate on `s.business_id = NEW.business_id`, which is mandatory given
  `SECURITY DEFINER` bypasses RLS; the fail-safe on no-match is NULL (not a
  RAISE), which is the right call.
- **Cascade guard.** `NOT EXISTS (SELECT 1 FROM businesses …)` runs as definer,
  so it is a true global existence check, not an RLS-filtered one — a
  non-definer version would have silently skipped the gate for every caller. The
  guard is not exploitable to bypass the gate (making it fire requires deleting
  the parent business, which cascades the appointments anyway).
- **`RETURN OLD`** is present on every non-raising exit path of
  `services_block_delete` (returning NULL would cancel the DELETE silently).
- **`??` vs `||`** in `lib/appointment-service.ts` — a `service_price` of 0 does
  not collapse into the join. Both the `services` object and array embed shapes
  are normalized.
- **Backfill idempotency.** `services.price` is `NOT NULL`, so a joined row
  always gets a non-NULL `service_price`; the `IS NULL` re-run guard therefore
  cannot re-fire and overwrite an existing snapshot.
- **Snapshot staleness on UPDATE** is not reachable: no code path in `app/` or
  `lib/` ever `UPDATE`s `appointments.service_id`.
- **Selects.** Every read path that consumes the helper actually fetches the
  snapshot column — either via `select('*')` (clients, appointments, dashboard
  month, finances main) or via an explicitly widened acotado select (finances
  prev/6-month, CSV export, abonos page).

The defects below cluster in the UI layer built on top of the (sound) DB
mechanism: a hard-delete path that can leave a cancha half-destroyed, a
pre-check whose failures are indistinguishable from "nothing to lose", and an
error message that now actively lies about what blocks a deletion.

## Critical Issues

### CR-01: `deleteCancha` hard-delete can destroy the cancha tuple and leave the service behind (no rollback)

**File:** `lib/canchas.ts:196-222` (new P0001 branch at `lib/canchas.ts:210-221`), caller `components/dashboard/canchas-manager.tsx:172-194`

**Issue:** The hard path deletes in this order: `agenda_spaces` → `professionals`
→ `services`. Only the *last* step is gated by the new trigger, and there is no
rollback for the first two. Migration 065 opened a new failure mode for that last
step: `service_has_active_abono`. Reaching it requires only that the agenda have
no appointments of its own (so the `professionals` delete succeeds) while the
service still has an active abono, or has appointments attached to a *different*
professional (multi-staff, migr. 057-061).

When it fires, the DB is left with: `agenda_spaces` gone, `professional` gone,
`service` alive. `canchasFromData` matches on `professional.service_id`
(`lib/canchas.ts:127-144`), so the tuple can no longer be reconstructed — the
cancha disappears from `CanchasManager` on the next load. Worse, the caller does
not touch local state on the error branch
(`canchas-manager.tsx:178-185` returns before the `setServices`/`setProfessionals`
filters), so the operator sees the cancha still listed, is told "no se puede
eliminar", and only discovers the loss after a refresh. The orphaned `service`
row then reappears in the generic Servicios list (it is no longer a cancha per
`nonCanchaServices`), where its price/duration are editable but the agenda is
irrecoverable.

**Fix:** Gate the destructive steps behind the same check the DB will apply, or
restore what was deleted on failure. Cheapest correct fix: probe the service
delete first is not possible (it is the terminal step), so re-create on failure:

```ts
// lib/canchas.ts — deleteCancha, hard path
const dedicated = dedicatedSpaceIds(cancha, opts.agendaSpaces ?? [])
const removedMappings = (opts.agendaSpaces ?? []).filter(a => a.professional_id === cancha.professional.id)

await client.from('agenda_spaces').delete()
  .eq('professional_id', cancha.professional.id).eq('business_id', businessId)

const { error: proErr } = await client.from('professionals').delete()
  .eq('id', cancha.professional.id).eq('business_id', businessId)
if (proErr) {
  // rollback del mapeo (el professional sigue vivo)
  for (const m of removedMappings) await client.from('agenda_spaces').insert(m)
  if ((proErr as { code?: string }).code === '23503') return { ok: false, error: 'has_appointments' }
  return { ok: false, error: 'professional_delete_failed' }
}

const { error: svcErr } = await client.from('services').delete()
  .eq('id', cancha.service.id).eq('business_id', businessId)
if (svcErr) {
  // ROLLBACK MANUAL (molde de provisionCancha): re-crear la agenda y su mapeo, o la
  // cancha queda inadministrable. Reusar el MISMO id no es posible; se re-inserta y se
  // re-apunta service_id, que es lo que canchasFromData necesita.
  const { data: rePro } = await client.from('professionals')
    .insert({ name: cancha.professional.name, service_id: cancha.service.id, business_id: businessId, active: cancha.professional.active })
    .select().single()
  if (rePro) {
    for (const m of removedMappings) {
      await client.from('agenda_spaces').insert({ ...m, professional_id: (rePro as { id: string }).id })
    }
  }
  const e = svcErr as { code?: string; message?: string }
  if (e.code === '23503') return { ok: false, error: 'has_appointments' }
  if (e.code === 'P0001' && e.message?.includes('service_has_active_abono')) return { ok: false, error: 'has_active_abono' }
  if (e.code === 'P0001' && e.message?.includes('service_has_future_appointments')) return { ok: false, error: 'has_appointments' }
  return { ok: false, error: 'service_delete_failed' }
}
```

If a rollback of that shape is judged too fragile, the alternative is to move the
whole hard-delete into a `SECURITY DEFINER` RPC so it runs in one transaction —
which is what "no hay RPC/transacción" in the module header already flags as the
known residual risk, now with a concrete way to trip it.

## Warnings

### WR-01: the cancha delete error copy now states something migration 065 made false, and steers the owner toward deleting history

**File:** `components/dashboard/canchas-manager.tsx:180-182`

**Issue:** The `has_appointments` branch renders: *"la cancha tiene turnos
asociados, **incluidos pasados y cancelados** (cancelar no los borra). […] o
**borrá esos turnos primero**."* After 065 that is wrong on both counts: past
and cancelled appointments no longer block anything, and `lib/canchas.ts:218`
now routes `service_has_future_appointments` **and**
`service_has_active_abono` into this same string. The message therefore tells
the owner that historical rows are the obstacle and instructs them to delete
those rows — the exact destructive, irreversible action this phase exists to
make unnecessary. It also cannot distinguish an active abono from a future
appointment, so the owner is sent hunting for turnos that do not exist.

**Fix:** Split the domain error as the settings modal already does, and rewrite
the copy to match the new predicate.

```ts
// lib/canchas.ts — devolver el motivo real
if (e.code === 'P0001' && e.message?.includes('service_has_active_abono')) return { ok: false, error: 'has_active_abono' }
if (e.code === 'P0001' && e.message?.includes('service_has_future_appointments')) return { ok: false, error: 'has_appointments' }
```

```tsx
// canchas-manager.tsx — confirmDelete
toast.error(
  res.error === 'has_active_abono'
    ? 'No se puede eliminar: la cancha tiene un abono activo. Desactivala para dejar de ofrecerla y conservar el historial.'
    : res.error === 'has_appointments'
      ? 'No se puede eliminar: la cancha tiene reservas futuras. Desactivala para dejar de ofrecerla y conservar el historial.'
      : 'No se pudo eliminar la cancha'
)
```

### WR-02: a failing pre-check renders as "nothing to lose" and unlocks the Eliminar button

**File:** `app/(dashboard)/settings/settings-client.tsx:539-561`

**Issue:** The three pre-check queries are destructured only for `.count` /
`.data`; `fut.error`, `abo.error` and `hist.error` are never inspected. On any
failure (network blip, RLS surprise, PostgREST parse error on the `.or(...)`
string) `count` is `null`, so `delInfo` becomes
`{ future: 0, nextDate: null, activeAbono: false, history: 0 }`. That is
indistinguishable from a genuinely deletable service: `delBlocked` is false,
`hideConfirm` is false, the destructive **Eliminar** appears, and the modal
promises *"Se conservan sus **0** turnos en el historial"* about a service that
may have hundreds. The DB gate still backstops the delete, but the modal's whole
job (D-11: anticipate the outcome before the owner presses) is inverted into a
fail-open.

**Fix:** Make the error state explicit and keep the confirm hidden.

```ts
const [delInfo, setDelInfo] = useState<
  { future: number; nextDate: string | null; activeAbono: boolean; history: number } | 'error' | null
>(null)
// …
if (fut.error || abo.error || hist.error) {
  console.error('[settings/delete-service] pre-check falló:', fut.error ?? abo.error ?? hist.error)
  setDelInfo('error')
  return
}
```

…then treat `'error'` as a third state in `delDescription` ("No pudimos
verificar los turnos de este servicio. Probá de nuevo.") and keep
`hideConfirm` true for it.

### WR-03: opening two delete modals in quick succession can show service A's counts for service B

**File:** `app/(dashboard)/settings/settings-client.tsx:533-561`

**Issue:** `openDeleteService` sets `delService` synchronously and then awaits
three round-trips before calling `setDelInfo`. There is no request-generation
guard. Close the modal for service A while its `Promise.all` is still in flight,
open it for B, and A's late resolution overwrites `delInfo` — the dialog for B
then renders A's `future`/`nextDate`/`history`. If A had no future turnos and B
does, the owner is shown a confirmable modal with a live **Eliminar** for a
service the DB will reject, plus a wrong "se conservan sus N turnos" count. Same
race applies to the re-check fired from the `onConfirm` backstop
(`settings-client.tsx:2479`).

**Fix:** Guard with the service id (or a monotonic request token) before
committing state.

```ts
const delReqRef = useRef(0)
async function openDeleteService(s: Service) {
  const req = ++delReqRef.current
  setDelService(s); setDelInfo(null)
  const [fut, abo, hist] = await Promise.all([/* … */])
  if (delReqRef.current !== req) return // llegó tarde: otro servicio ganó
  setDelInfo({ /* … */ })
}
```

### WR-04: the blocked modal offers "Desactivar" on services that are already inactive

**File:** `app/(dashboard)/settings/settings-client.tsx:2460-2462`

**Issue:** `secondaryAction` is attached whenever `delBlocked && delService`,
with no check on `delService.active`. From the **Desactivados** tab (new in this
phase — `settings-client.tsx:838`), every service in the list is already
inactive, so a blocked delete presents "Desactivar" as the promoted primary
action (`computeFooterLayout` promotes it to `variant: 'default'` when the
confirm is hidden). Pressing it writes `active: false` over `active: false`,
fires `toast.success('Servicio desactivado')`, and closes the dialog — the owner
is told the escape hatch worked while nothing changed and the service still
cannot be deleted. It is a guaranteed dead end presented as the recommended
action.

**Fix:** Only offer the exit when it is actually an exit, and give the
already-inactive case its own copy.

```tsx
secondaryAction={delBlocked && delService && delService.active
  ? { label: 'Desactivar', onClick: async () => { await toggleService(delService.id, false); setDelService(null); setDelInfo(null) } }
  : undefined}
```

…and in `delDescription`, when `delBlocked && !delService.active`, replace
"Desactivalo para dejar de ofrecerlo y conservar el historial" with something
truthful ("Ya está desactivado: no se puede eliminar hasta que no queden turnos
futuros ni abonos activos").

### WR-05: `--danger-foreground` does not follow the per-theme `--destructive-foreground`, dropping below WCAG AA

**File:** `app/globals.css:99-101`, `app/globals.css:147`

**Issue:** `--danger: var(--destructive)` correctly re-resolves per theme (the
`[data-theme=…]` blocks in `app/themes.css` sit on the same `<html>` and
override `--destructive`). `--danger-foreground`, however, is hardcoded to
`#fbf3e3` (light) / `#1a1714` (dark) — while every alternative theme ships its
own `--destructive-foreground` that this indirection ignores
(`app/themes.css:34-35`, `:98-99`, `:162-163`). The pairing therefore only holds
for the Forjo theme:

| theme (light) | `--danger` (= `--destructive`) | `--danger-foreground` | ratio |
|---|---|---|---|
| forjo | `#b23a26` | `#fbf3e3` | 5.40:1 ✅ |
| modern | `#e5484d` | `#fbf3e3` | ~3.6:1 ❌ |
| spa | `#c0876b` | `#fbf3e3` | ~2.8:1 ❌ |

Both the destructive **Eliminar** button (`confirm-dialog.tsx:183-187`) and the
"Alto" risk dot (`risk-badge.tsx:54-60`) are affected, on the exact modal this
phase added to the dashboard. The project rule is an explicit "Contraste mínimo
4.5:1 para texto normal (WCAG AA)".

**Fix:** Make the foreground follow the same indirection, with the Forjo value
as the fallback for themes that do not define one:

```css
/* :root, [data-theme='forjo'] */
--destructive-foreground: #fbf3e3;      /* el theme base también expone su par */
--danger: var(--destructive);
--danger-foreground: var(--destructive-foreground);
```
```css
/* .dark */
--destructive-foreground: #1a1714;
```
and let `app/themes.css` keep owning its own `--destructive-foreground` values.

### WR-06: the destructive button's hover color drops the dark-mode pairing under AA

**File:** `components/crm/confirm-dialog.tsx:185`

**Issue:** `hover:bg-[color-mix(in_oklch,var(--danger),black_10%)]` darkens the
surface while the foreground stays fixed. That is safe in light mode (cream on a
darker red improves), but in dark mode the pairing is *ink on a light red* —
darkening the background reduces contrast. `#e05c43` with `#1a1714` is 4.91:1 at
rest; a 10% black mix in oklch takes it to roughly 4.2:1, below AA. WCAG applies
to hover states, and the Forjo dark theme is the app's signature look.

**Fix:** Either lighten instead of darkening when the foreground is dark, or
drop the mix in favour of an opacity/ring treatment that does not move the
background luminance:

```ts
return destructive
  ? 'bg-[var(--danger)] text-[var(--danger-foreground)] hover:brightness-110 dark:hover:brightness-110'
  : ''
```
(or introduce a `--danger-hover` token per theme block, resolved the same way as
`--danger`).

### WR-07: `lib/types.ts` still documents `abonos.service_id` as `ON DELETE RESTRICT`

**File:** `lib/types.ts:299`

**Issue:** `service_id: string | null // ON DELETE RESTRICT (evita orfandad de
generación)`. Migration 065 §3 changed that constraint to `ON DELETE SET NULL`,
and `supabase/schema.sql:1495-1498` already reflects it. The comment now asserts
the exact invariant the phase inverted, on a line inside a file this phase
edited (the `service_name` snapshot field was added 8 lines below). In a repo
where comments are treated as the primary design record, a stale
"RESTRICT (evita orfandad)" is worse than no comment: the next reader will
assume an active abono cannot lose its service pointer.

**Fix:**

```ts
// ON DELETE SET NULL desde la migr. 065: borrar el servicio ya no está prohibido, se desacopla.
// La orfandad de generación la evita el gate `services_block_delete_trg` (un abono `active`
// bloquea el DELETE); los archivados se desacoplan y conservan `service_name` (snapshot).
service_id: string | null
```

### WR-08: the modal's secondary action is fire-and-forget — no loading, no failure handling

**File:** `components/crm/confirm-dialog.tsx:323-327`, `app/(dashboard)/settings/settings-client.tsx:2461`

**Issue:** The secondary button calls `void secondaryAction.onClick()`. It is
only `disabled={loading}`, and `loading` is owned exclusively by the confirm
path — so the button is never disabled while its own async work runs (double
click ⇒ two UPDATEs, two toasts), the dialog is never locked (`handleOpenChange`
only blocks on `loadingRef`, `confirm-dialog.tsx:225`), and nothing catches a
rejection. The settings caller compounds it: `onClick` awaits `toggleService`
and then unconditionally `setDelService(null)` — `toggleService` swallows its
error into a toast and returns void
(`settings-client.tsx:619-624`), so on failure the dialog closes anyway, leaving
an error toast next to a dismissed dialog. That directly contradicts the
"NO optimista: capturamos el error real" convention the same commit introduced
two functions above.

**Fix:** Route the secondary through the same guard as the confirm, and let the
caller signal failure.

```tsx
// confirm-dialog.tsx
secondaryAction?: { label: string; onClick: () => Promise<boolean | void> | boolean | void }
// …
const [secLoading, setSecLoading] = React.useState(false)
<Button
  type="button" variant={footer.secondaryVariant}
  disabled={loading || secLoading}
  onClick={async () => { setSecLoading(true); try { await secondaryAction.onClick() } finally { setSecLoading(false) } }}
>
```
```ts
// settings-client.tsx — toggleService devuelve el resultado
async function toggleService(id: string, active: boolean): Promise<boolean> { /* … return !error */ }
// secondaryAction
onClick: async () => { if (await toggleService(delService.id, false)) { setDelService(null); setDelInfo(null) } }
```

## Info

### IN-01: `delInfo.history` counts cancelled turnos but the copy promises they appear in Finanzas

**File:** `app/(dashboard)/settings/settings-client.tsx:551-552`, copy at `:574`

**Issue:** The `history` query has no status filter, while Finanzas and the CSV
export both apply `.neq('status', 'cancelled')`. The modal therefore says
"Se conservan sus N turnos en el historial (Finanzas y ficha del cliente)" with
an N that overstates what Finanzas will show. The client detail card also filters
to confirmed-only.

**Fix:** Either add `.neq('status', 'cancelled')` to the `hist` query, or soften
the copy to "Se conserva todo su historial (Finanzas y ficha del cliente)…" and
drop the count.

### IN-02: `hhmmss` mangles fractional-second times and silently coerces junk to 0

**File:** `lib/appointment-time.ts:32-35`

**Issue:** `pad2(Number(s) || 0)` on a component like `'00.5'` yields `'0.5'`
(3 chars, `padStart(2)` is a no-op), producing `'13:00:0.5'`, which sorts
*before* `'13:00:00'` — a turno at exactly `now` would flip to "pasado". And any
non-numeric component becomes `0` rather than surfacing. Not reachable with the
current data (slot times are whole minutes) but the helper is presented as the
single source of truth for the cut.

**Fix:** Truncate before padding: `const [h='0', m='0', s='0'] = raw.split(':')`
→ `pad2(Math.trunc(Number(h)) || 0)` etc., or slice the fractional part off
`raw` first (`raw.split('.')[0]`).

### IN-03: `nowInAR()` is evaluated once per render, so the tab cut is frozen

**File:** `app/(dashboard)/appointments/appointments-client.tsx:130`

**Issue:** `const now = nowInAR()` runs during render with no timer. An
appointment whose start time passes while the page is open stays in "Próximos"
until some unrelated state change forces a re-render. The old date-only cut had
the same staleness at day granularity; the new minute-granularity cut makes it
observable within a session.

**Fix:** Refresh on an interval (e.g. `useEffect` + `setInterval(…, 60_000)`
storing `nowInAR()` in state), or accept it and note the limitation next to the
`const`.

### IN-04: the services toggle is the only control in its row without an `aria-label`

**File:** `app/(dashboard)/settings/settings-client.tsx:1623-1625`

**Issue:** The Editar (`:1626`) and Eliminar (`:1629`) buttons both carry
`aria-label={\`… ${s.name}\`}`. The Activar/Desactivar button has none, so a
screen-reader user gets N identical "Desactivar" buttons with no way to tell
which service each belongs to. Gap fix 13-05 #3 unified this control's look with
`canchas-manager.tsx:227-234` and explicitly kept the `aria-label` **there** for
exactly this reason — the settings side was left behind, so the two now diverge
on the accessible name while matching visually.

**Fix:**

```tsx
<Button variant="ghost" size="sm" className="text-xs text-muted-foreground"
  aria-label={s.active ? `Desactivar ${s.name}` : `Activar ${s.name}`}
  onClick={() => toggleService(s.id, !s.active)}>
```

### IN-05: the gate ignores appointments whose `business_id` differs from the service's

**File:** `supabase/migrations/065_service_snapshot_and_delete_gate.sql:250-257`

**Issue:** `(OLD.business_id IS NULL OR a.business_id = OLD.business_id)` means a
future appointment that references this `service_id` under a *different* tenant
is not counted, so the delete proceeds and that row's `service_id` is set to
NULL. Its snapshot is also NULL (the insert trigger applies the same tenant
filter, by design), so it loses its service name and price outright. Such a row
should not exist, but the filter is described in the migration as
"defensa en profundidad" while it actually widens the blast radius for the
inconsistent case.

**Fix:** Either drop the tenant filter from the *count* (the anchor is already
`a.service_id = OLD.id`, a non-guessable UUID PK, so counting every referencing
row is strictly fail-closed), or leave it and add a comment stating that
cross-tenant references are knowingly discarded.

---

_Reviewed: 2026-08-03_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
