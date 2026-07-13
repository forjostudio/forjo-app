# Phase 02: Rework UX del onboarding - Pattern Map

**Mapped:** 2026-07-03
**Files analyzed:** 1 modified (`app/(onboarding)/onboarding/page.tsx`) + 3 read-only analogs
**Analogs found:** 6 / 6 (all in-repo)

> **Phase shape:** UX rework of ONE existing client component. NO new files. Every change lives inside `app/(onboarding)/onboarding/page.tsx`. The value below is CONCRETE CURRENT CODE (real line numbers) per change area + the closest in-repo analog to mirror. All patterns are grounded in code that was read — no invented APIs.

---

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `app/(onboarding)/onboarding/page.tsx` (nav bar, D-01/02/04) | component (client, wizard) | event-driven (local step state) | same file (self) | self / exact |
| `app/(onboarding)/onboarding/page.tsx` (`canGoNext`/`steps`, D-02) | component | transform (gating predicate) | same file (self) | self / exact |
| `app/(onboarding)/onboarding/page.tsx` (dynamic stepper, D-03) | component | transform (vertical-filtered array) | `lib/verticals.ts` `getVerticalKeyByType` | exact |
| `app/(onboarding)/onboarding/page.tsx` (Servicios header, D-07) | component | request-response (form grid) | same file (self, first-row labels) | self / exact |
| `app/(onboarding)/onboarding/page.tsx` (inline onBlur validation, D-08) | component | event-driven (onBlur → error state) | same file `validateHours` + `agenda-client.tsx:validateBlocks` | exact |
| `app/(onboarding)/onboarding/page.tsx` (allow price 0, D-09) | component | CRUD (services insert) | `settings-client.tsx` service insert | role-match (confirms tolerance) |

---

## Pattern Assignments

### 1. Omitir button + nav bar (D-01, D-02, D-04)

**Analog:** self — current nav bar cluster.

**Current nav bar** (`page.tsx:659-680`):
```tsx
{/* Navigation */}
<div className="flex justify-between mt-6 pt-4 border-t border-border">
  <Button
    variant="ghost"
    onClick={() => setStep(s => s - 1)}
    disabled={step === 1}
  >
    Atrás
  </Button>
  {step < 4 ? (
    <Button
      onClick={() => setStep(s => s + 1)}
      disabled={!canGoNext()}
    >
      Siguiente
    </Button>
  ) : (
    <Button onClick={handleFinish} disabled={loading}>
      {loading ? 'Guardando...' : 'Finalizar y entrar al dashboard'}
    </Button>
  )}
</div>
```

**Change:** Right cluster becomes `Atrás — [ Omitir por ahora ] [ Siguiente ]`. `Omitir por ahora` = `variant="ghost"`, shown on steps 2/3/4 (NOT step 1), advances via `setStep(s => s + 1)` WITHOUT running gating. Last step = no Omitir, Finalizar CTA instead (per UI-SPEC §Omitir, copy `Omitir por ahora`). The `step < 4` literal `4` must become the dynamic last-step index (see D-03).

**Existing ghost + `variant`/`size` reference in same file** (Trash2 buttons, `page.tsx:534-541`, `640-647`) — confirms `variant="ghost"` is the established de-emphasis style. Focus ring is shadcn default (`focus-visible:ring-2 focus-visible:ring-ring`) — do NOT remove.

---

### 2. `canGoNext` gating relax + allow price 0 (D-02, D-09)

**Analog:** self.

**Current gating** (`page.tsx:324-329`):
```tsx
const canGoNext = () => {
  if (step === 1) return name && slug && slugAvailable && type
  if (step === 2) return services.every(s => s.name && s.price > 0) && services.length > 0
  if (step === 3) return professionals.every(p => p.name) && professionals.length > 0
  return true
}
```

**Current `steps` array** (`page.tsx:317-322`):
```tsx
const steps = [
  { n: 1, label: 'Tu negocio' },
  { n: 2, label: 'Servicios' },
  { n: 3, label: 'Profesionales' },
  { n: 4, label: 'Horarios' },
]
```

**Change (D-02):** Drop the `step === 2` and `step === 3` branches entirely — steps 2/3/4 never block Siguiente. Only step 1 keeps its predicate. This also removes the residual `s.price > 0` requirement (D-09). Because `step` is now a filtered-array index (D-03), the `step === 1` check should key off the FIRST step being Negocio (always index/n 1), not a hardcoded position that shifts.

**Note:** `canGoNext` is invoked at `page.tsx:671` (`disabled={!canGoNext()}`).

---

### 3. Dynamic stepper / canchas auto-hide (D-03)

**Analog:** `lib/verticals.ts` — `getVerticalKeyByType`, already imported (`page.tsx:15`) and already used for the salud/belleza hints (`page.tsx:410`, `416`).

**Confirmed `'canchas'` is a `VerticalKey`** (`lib/verticals.ts:5`):
```ts
export type VerticalKey = 'salud' | 'belleza' | 'general' | 'canchas'
```
```ts
// lib/verticals.ts:141
export function getVerticalKeyByType(businessType?: string | null): VerticalKey
```

**Existing vertical-conditional render (pattern to mirror)** (`page.tsx:410`):
```tsx
{type && getVerticalKeyByType(type) === 'salud' && (
  <div className="flex items-start gap-2.5 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
    ...
```

**Current stepper render** (`page.tsx:348-373`) iterates `steps.map((s, idx) => ...)` and uses `s.n` for the node number, `step > s.n` / `step === s.n` for state, and `idx < steps.length - 1` for connectors.

**Change:** Make `steps` vertical-dependent — filter out `{ label: 'Profesionales' }` when `getVerticalKeyByType(type) === 'canchas'` → 3 steps (Negocio → Servicios → Horarios), else 4. Per UI-SPEC §Dynamic stepper: node numbers must derive from FILTERED array position (1-2-3 / 1-2-3-4, no gaps) — so `step` should compare against filtered index, not the hardcoded `n`. The `step < 4` literal in the nav bar (`page.tsx:668`) and the `handleFinish`/last-step detection must use `steps.length` (last item = Horarios in both cases). Header subtitle `Configurá tu negocio en 4 pasos` (`page.tsx:344`) must reflect the real count or be made count-agnostic.

---

### 4. Servicios column header (D-07)

**Analog:** self — current first-row-only labels.

**Current per-first-row labels** (`page.tsx:494-531`, the `{i === 0 && <Label ...>}` gates):
```tsx
{services.map((service, i) => (
  <div key={i} className="grid grid-cols-12 gap-2 items-end">
    <div className="col-span-5 space-y-1">
      {i === 0 && <Label className="text-xs text-muted-foreground">Nombre</Label>}
      <Input value={service.name} ... />
    </div>
    <div className="col-span-3 space-y-1">
      {i === 0 && (
        <Label className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="w-3 h-3" /> Min.
        </Label>
      )}
      <Input type="number" value={service.duration_minutes} ... />
    </div>
    <div className="col-span-3 space-y-1">
      {i === 0 && (
        <Label className="text-xs text-muted-foreground flex items-center gap-1">
          <DollarSign className="w-3 h-3" /> Precio
        </Label>
      )}
      <Input type="number" value={service.price} ... />
    </div>
    <div className="col-span-1 flex items-end justify-end">
      {services.length > 1 && ( <Button variant="ghost" size="icon" ...><Trash2 .../></Button> )}
    </div>
  </div>
))}
```

**Change (per UI-SPEC §Servicios column header):** Promote the three labels to a SINGLE fixed (non-sticky) header row above the `.map`, aligned to the same `grid grid-cols-12 gap-2`: `Nombre` = `col-span-5`, `Min.` (Clock icon) = `col-span-3`, `Precio` (DollarSign icon) = `col-span-3`, trash spacer = `col-span-1`. Keep `text-xs text-muted-foreground`. Remove the `{i === 0 && ...}` label gates from rows. `items-end` on rows may become `items-center` (labels no longer offset row 1) — keep alignment consistent.

---

### 5. Inline validation onBlur (D-08)

**Analog A (same file):** `validateHours` + per-block error markup.
**Analog B (panel reference):** `agenda-client.tsx:validateBlocks`.

**Existing inline-error markup to mirror** (`page.tsx:607-637`):
```tsx
<Input
  type="time"
  value={b.start_time}
  onChange={e => updateBlock(day, idx, 'start_time', e.target.value)}
  className="w-28 text-sm"
  aria-invalid={!!b.error}
/>
...
{b.error && <p className="text-xs text-destructive">{b.error}</p>}
```

**Existing `validateHours` predicate (state-marking pattern)** (`page.tsx:209-221`):
```tsx
function validateHours(): boolean {
  let valid = true
  const next = dayStates.map(ds => {
    if (!ds.enabled) return ds
    const blocks = ds.blocks.map(b => {
      if (b.end_time <= b.start_time) { valid = false; return { ...b, error: 'La hora fin debe ser mayor a la hora inicio' } }
      return { ...b, error: undefined }
    })
    return { ...ds, blocks }
  })
  setDayStates(next)
  return valid
}
```

**Panel analog** (`agenda-client.tsx:228-255`, `validateBlocks`) — same shape: map over state, set `error` string per invalid block, return boolean. Confirms the repo-wide convention (error lives IN the item state, rendered as `<p className="text-xs text-destructive">`, input carries `aria-invalid`).

**Existing WhatsApp format check (currently only on finish)** (`page.tsx:236-243`):
```tsx
let whatsappNorm: string | null = null
if (whatsapp.trim()) {
  whatsappNorm = normalizeArWhatsApp(whatsapp)
  if (!whatsappNorm) {
    toast.error('WhatsApp inválido. Usá código de país y área, ej. +54 9 11 1234-5678')
    return
  }
}
```
`normalizeArWhatsApp` imported at `page.tsx:16`.

**Change (per UI-SPEC §Inline validation):**
- **WhatsApp (step 1, `page.tsx:447-449`):** add onBlur → if non-empty and `normalizeArWhatsApp(whatsapp)` is null, set an inline error state + `aria-invalid` on the Input; render `<p className="text-xs text-destructive">` below. Copy reuses the existing message. Empty stays valid (WhatsApp optional). Needs a new local error state (e.g. `whatsappError`) — no such state exists today.
- **Precio (Servicios, `page.tsx:524-530`):** add onBlur → if `price < 0`, inline error `El precio no puede ser negativo` + `aria-invalid`; price 0 and positive are valid (D-09). Per-row error → store on the `Service` item (add optional `error?`/`priceError?`), mirroring how `HourBlock` carries `error?` (`page.tsx:36-40`).

---

### 6. Allow price 0 — insert + panel tolerance (D-09)

**Analog:** `settings-client.tsx` (the actual Servicios panel UI) service insert.

**Onboarding services insert (already tolerates 0)** (`page.tsx:265-267`):
```tsx
await supabase.from('services').insert(
  services.filter(s => s.name).map(s => ({ ...s, business_id: business.id }))
)
```
Filters by `s.name` only — passes `price` through untouched. Nothing here rejects `price === 0`.

**Panel confirms 0 is a valid price** (`app/(dashboard)/settings/settings-client.tsx`, rendered by `servicios/page.tsx` via `SettingsClient`):
```tsx
// settings-client.tsx:357  default price: 0
const [newService, setNewService] = useState<{...; price: number; ...}>({ ..., price: 0, ... })
// settings-client.tsx:364  insert — no price>0 guard
.insert({ name, duration_minutes, price, location_ids: ..., business_id: business.id })
// settings-client.tsx:1221  input min={0}
<Input type="number" value={newService.price} onChange={...} min={0} step={100} />
// settings-client.tsx:1183  display tolerates 0
<p className="text-xs text-muted-foreground">{s.duration_minutes}min · ${Number(s.price).toLocaleString('es-AR')}</p>
```

**Conclusion:** The `services` insert AND the panel already tolerate price 0. The ONLY residual blocker is `canGoNext`'s `s.price > 0` (`page.tsx:326`) — removed by D-02 (change area 2). No data-model or insert change needed.

---

## Shared Patterns

### Item-level inline error (repo convention)
**Source:** `page.tsx:36-40` (`HourBlock { error? }`), `page.tsx:607-637` (render), `agenda-client.tsx:228-255` (`validateBlocks`).
**Apply to:** D-08 WhatsApp (component-level error state) and Precio (per-`Service` error field).
```tsx
// error lives in state; rendered as:
<Input ... aria-invalid={!!error} />
{error && <p className="text-xs text-destructive">{error}</p>}
```

### Vertical-conditional rendering
**Source:** `lib/verticals.ts:141` (`getVerticalKeyByType`) + `page.tsx:410`/`416` (existing salud/belleza hints).
**Apply to:** D-03 dynamic `steps` filter (`=== 'canchas'`).

### Ghost = de-emphasized secondary action
**Source:** `page.tsx:534-541`, `640-647` (Trash2 ghost buttons).
**Apply to:** D-01 Omitir button (`variant="ghost"`, never accent, never destructive).

### `(opcional)` optional-field marker
**Source:** `page.tsx:447`, `451`, `457`.
**Apply to:** signposting omitibility if reused in copy (WhatsApp/Instagram/Dirección already use it).

---

## No Analog Found

None. Every change area maps to concrete existing code in `page.tsx` and/or a read-only panel analog (`agenda-client.tsx`, `settings-client.tsx`) plus `lib/verticals.ts`. No file needs a pattern imported from RESEARCH.md.

---

## Metadata

**Analog search scope:** `app/(onboarding)/onboarding/page.tsx`, `lib/verticals.ts`, `app/(dashboard)/agenda/agenda-client.tsx`, `app/(dashboard)/servicios/page.tsx` → `app/(dashboard)/settings/settings-client.tsx`.
**Files scanned:** 5.
**Pattern extraction date:** 2026-07-03.
