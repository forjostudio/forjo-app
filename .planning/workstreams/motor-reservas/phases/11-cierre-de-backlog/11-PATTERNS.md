# Phase 11: Cierre de backlog - Pattern Map

**Mapped:** 2026-07-27
**Files analyzed:** 8 (6 MODIFY, 1 CREATE, 2 REFERENCE/verify)
**Analogs found:** 8 / 8 (todos in-repo; cero patrón externo)

> Fase de pulido: 4 ítems de UI/copy + 1 setting con migración. Ningún archivo toca `book_slot_atomic` ni el contrato de disponibilidad (D-08). Cada analog es código real del repo (no plantilla genérica).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/(dashboard)/abonos/abonos-client.tsx` | component (client) | render / transform | `components/ui/badge.tsx` (variants) + mismo `.map` (self, `:322-334`) | exact (self-pattern) |
| `app/(dashboard)/clients/clients-client.tsx` | component (client) | render / state-reset | `key`-remount doctrine (react.dev) + subcomponentes co-ubicados del repo | role-match |
| `app/cancelar/[token]/cancel-client.tsx` | component (client, público) | verify-only | su gemela `abono-cancel-client.tsx` | exact (gemelas) |
| `app/abono/cancelar/[token]/abono-cancel-client.tsx` | component (client, público) | verify-only | su gemela `cancel-client.tsx` | exact (gemelas) |
| `app/(dashboard)/settings/settings-client.tsx` | component (client) | CRUD / copy | `deleteService` (self, `:397-409`) | exact (self-pattern) |
| `components/dashboard/canchas-manager.tsx` | component (client) | CRUD / copy | `deleteService` en settings-client | role-match |
| `supabase/migrations/061_*.sql` | migration | schema DDL | `060_*.sql` + columnas settings de `businesses` (`abono_window_weeks` CHECK) | role-match |
| `app/[slug]/page.tsx` + `app/[slug]/booking-client.tsx` | route/server + component | read-through / config | `require_deposit` (select + prop + persist) | exact (self-pattern) |

---

## Pattern Assignments

### `app/(dashboard)/abonos/abonos-client.tsx` (component, POLISH-01)

**Analog A (componente):** `components/ui/badge.tsx` — variants disponibles. NO hay variant `success`; los que sirven son `destructive` (token semántico suave) y `secondary` (neutral):

```tsx
// badge.tsx:12-16
default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
secondary: "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
destructive: "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 ... [a]:hover:bg-destructive/20",
```
`bg-destructive/10 text-destructive` = exactamente el "muted/destructive suave" que pide D-01, con token semántico y cero hex.

**Analog B (self, punto de inserción):** el bloque `flex flex-col items-end` donde ya viven los chips, `abonos-client.tsx:322-334`:

```tsx
<div className="flex flex-col items-end gap-1 flex-shrink-0">
  <Badge variant="secondary" className="gap-1">
    <CalendarClock className="w-3 h-3" />
    {`${count} turno${count === 1 ? '' : 's'}`}
  </Badge>
  {skipped > 0 && (
    <Badge variant="destructive" className="gap-1"><AlertTriangle className="w-3 h-3" />{skipped} salteada...</Badge>
  )}
</div>
```

**Copiar de aquí:** el chip nuevo va junto a estos, en el mismo contenedor. `Badge` ya está importado (`:22`). El `status` ya existe (`:35`, `'active'|'cancelled'|'completed'`).
- `'cancelled'` → `<Badge variant="destructive">Cancelado</Badge>`
- `'completed'` → `<Badge variant="secondary">Completado</Badge>`

**NO copiar:** `StatusBadge` de `appointments-client.tsx:56-62` — usa hex hardcodeados (`bg-red-500/20 text-red-400`), viola D-01. No re-interpretar `isAbonoActivo` (`:82-96`); el chip es aditivo puro.

---

### `app/(dashboard)/clients/clients-client.tsx` (component, POLISH-02)

**Analog:** patrón `key`-remount de React (react.dev "Resetting state with a key"). No hay un ejemplo idéntico en el repo, pero el repo ya co-ubica subcomponentes de detalle; se extrae el panel de detalle a `<ClientDetail>` y se monta con `key`.

**Código ofensor a eliminar** (`:494-508`) — dispara el ERROR `react-hooks/set-state-in-effect` en `:497` (NO es `exhaustive-deps`; el `eslint-disable-line` de `:508` silencia otra regla):

```tsx
const selected = clients.find(c => c.id === selectedId) ?? null   // :467 derivado en render
useEffect(() => {
  if (!selected) return
  setNotes(selected.notes || '')          // :497 ← el error
  setEditMode(false)
  setHistoryExpanded(false)
  setEditForm({ name: selected.name, phone: ..., email: ..., insurance_name: ..., insurance_number: ..., preferences: ... })
}, [selectedId]) // eslint-disable-line   // :508
```

**Pattern a aplicar** (remount por `key`):

```tsx
{selected && (
  <ClientDetail
    key={selected.id}   // ← remonta al cambiar de cliente ⇒ estados vuelven a init, sin efecto
    client={selected}
    isSalud={isSalud} isBelleza={isBelleza}
    ...
  />
)}
```
Dentro de `ClientDetail`: `useState(() => client.notes || '')`, `useState(false)` para `editMode`/`historyExpanded`, `useState(() => ({ name: client.name, ... }))`. Se borra el `useEffect` + su `eslint-disable-line`.

**Estados a mover** al subcomponente: `notes` (`:192`), `editMode` (`:190`), `historyExpanded` (`:198`), `editForm` (`:191`). Cuidar los callers que editan después: `setEditForm(f=>...)` (`:861-873`), autosave `handleNotesChange` (`:511-519`), edición (`:521-540`). Además sacar el warning `TrendingUp` sin usar (`:24`) para dejar `npx eslint` sin salida.

**Verificable:** `npx eslint "app/(dashboard)/clients/clients-client.tsx"` sin errores + búsqueda (`:186`) / filtros (`:187-189`) / alta (`:214-215`) idénticos.

---

### `app/cancelar/[token]/cancel-client.tsx` + `app/abono/cancelar/[token]/abono-cancel-client.tsx` (verify-only, POLISH-03)

**Analog:** una gemela de la otra. Los dos bordes YA coinciden byte a byte:

```tsx
// cancel-client.tsx:85
<div className="rounded-md border border-border border-l-4 p-4 space-y-1 text-sm mb-5" style={{ borderLeftColor: accent }}>
// abono-cancel-client.tsx:136
<div className="rounded-md border border-border border-l-4 p-4 space-y-1 text-sm mb-5" style={{ borderLeftColor: accent }}>
```

**Acción (NO editar el diseño):** confirmar consistencia (ya se cumple) + aceptar el finding `side-tab` del hook impeccable como intencional (patrón de marca app-wide, D-03). Vía: config **reviewable acotada** de la skill `impeccable` sobre esos 2 paths (`.impeccable/` root + `app/[slug]/.impeccable/hook.cache.json`), NO un `eslint-disable` a lo bruto ni borrar el borde.

**Fuera de scope (NO tocar, D-03):** la divergencia real es el logo-fallback — `cancel-client.tsx:74` usa `text-white`, `abono-cancel-client.tsx:125` usa `color: accentText` (contraste por luminancia, IN-05). Es contraste, no borde; se documenta como observación. NO aflojar 404 genérico / token / número del servidor / `noindex`.

---

### `app/(dashboard)/settings/settings-client.tsx` + `components/dashboard/canchas-manager.tsx` (component, EXTRA-A)

**Analog (patrón correcto):** `deleteService` en `settings-client.tsx:397-409` — captura el error, ramifica por `23503`, NO muta el estado si falló:

```tsx
async function deleteService(id: string) {
  const { error } = await supabase.from('services').delete().eq('id', id).eq('business_id', business.id)
  if (error) {
    if (error.code === '23503') toast.error('No se puede eliminar: el servicio tiene turnos asociados. Desactivalo en vez de borrarlo.')
    else toast.error('No se pudo eliminar el servicio')
    return
  }
  setServices(prev => prev.filter(s => s.id !== id))
  toast.success('Servicio eliminado')
}
```

**Solo copy (D-04)** en los 3 que ya manejan 23503 — reemplazar el string por el copy de referencia, adaptando sustantivo/género:
- servicio: `settings-client.tsx:403`
- sede: `settings-client.tsx:738` (usa `${locWord}`)
- cancha: `canchas-manager.tsx:181` (ramifica por `res.error === 'has_appointments'`, `:180`)

Copy de referencia: *"No se puede eliminar: tiene turnos asociados, incluidos pasados y cancelados (cancelar no los borra). Desactivalo para dejar de ofrecerlo y conservar el historial, o borrá esos turnos primero."*

**Fix real (alinear al analog):** `deleteProfessional` (`settings-client.tsx:573`) hoy es fire-and-forget con borrado optimista y `toast.success` mentiroso:

```tsx
async function deleteProfessional(id: string) {
  await supabase.from('professionals').delete().eq('id', id).eq('business_id', business.id)  // ← sin capturar
  setProfessionals(prev => prev.filter(p => p.id !== id))   // ← optimista aunque falle el FK
  ...
  toast.success('Profesional eliminado')                    // ← miente si 23503 bloqueó
}
```
Reescribir igual que `deleteService`: capturar `{ error }`, `if (error.code === '23503')` copy nuevo (sustantivo "el profesional"), `return` sin mutar `setProfessionals`/`setAgendaSpaces`. Mensaje genérico "tiene turnos asociados" (el FK que bloquea es el de `appointments`; `professional_services`/`agenda_spaces` caen por CASCADE — A3).

**NO cambiar comportamiento:** el FK 23503 protege el historial de Finanzas; soft-disable (`toggleService`/`toggleLocation`) ya existe.

---

### `supabase/migrations/061_public_selector_default.sql` (migration, EXTRA-B)

**Analog:** columnas de settings de `businesses` en `schema.sql` (`require_deposit` bool DEFAULT false; `default_slot_duration` int DEFAULT 60; `max_advance_days` int DEFAULT 30; `abono_window_weeks` int DEFAULT 8 + CHECK, `:462-463`) + última migración `060_public_professionals_exclude_canchas.sql`. Próxima = **061**.

**Pattern a copiar** (idempotente, CHECK vía `pg_constraint` como `abono_window_weeks`):

```sql
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS public_selector_default text NOT NULL DEFAULT 'any';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'businesses_public_selector_default_chk') THEN
    ALTER TABLE public.businesses
      ADD CONSTRAINT businesses_public_selector_default_chk
      CHECK (public_selector_default IN ('any', 'choose'));
  END IF;
END$$;

NOTIFY pgrst, 'reload schema';
```
- `NOT NULL DEFAULT 'any'` ⇒ todas las filas nacen en `'any'` (D-06, cero regresión).
- `schema.sql` se edita **quirúrgicamente** (agregar columna + constraint en el bloque `businesses`), NO por dump.
- Validación local: `npx supabase db reset` (replay 001→061 PG17) + `\d businesses`. Prod = A MANO + `NOTIFY pgrst`.

---

### `app/[slug]/page.tsx` + `app/[slug]/booking-client.tsx` (route/server + component, EXTRA-B wiring)

**Analog:** `require_deposit` — el mismo ciclo select → prop → persist que se replica para `public_selector_default`.

**1. Lectura server-side** (`page.tsx:63`): agregar `public_selector_default` al string del `.select('id, owner_id, ..., max_advance_days, max_advance_date')` sobre `businesses`. Ya viaja como prop vía `<BookingClient business={business as unknown as PublicBusiness} ... />` (`:153-161`). Agregar el campo al tipo `PublicBusiness` en `lib/types.ts`. NO toca `public_professionals` ni el contrato `{ok,busy,full}` (D-08).

**2. Manifestación en el paso 2** (`booking-client.tsx`, Opción A confirmada por D-05) — el setting controla el **orden/prominencia** de la tarjeta "Cualquiera", NO auto-salteo ni highlight:
- Estado actual: `:50` `useState<... >('none')`; gate `showAny = capaces.length >= 2` (`:121-130`, D-02); paso 2 en `:502-536`, cada tarjeta llama `setStep(3)` (`:509/:525/:540`); al reservar `anyProfessional: isAny` (`:349-350`).
- `'any'` → tarjeta "Cualquiera" **arriba** (byte-idéntico a hoy, cero cambio, D-06).
- `'choose'` → tarjeta "Cualquiera" **después** de la lista de `capaces` (profesionales primero); sigue disponible con ≥2 capaces (D-07).
- Wiring: condicionar el orden del bloque `:507-519` vs `:537-553` por `business.public_selector_default`.
- **Gap Wave 0:** extraer función pura (ej. resolver de orden / `initialSelectedPro(setting)`) para unit test sin DOM.

**3. Toggle en el panel** (`settings-client.tsx`, sección reservas/seña junto a `require_deposit` `:1750-1756`). Persistencia — patrón `require_deposit` (`:865`) / `abono_window_weeks` (`abonos-client.tsx:232`):

```tsx
supabase.from('businesses').update({ public_selector_default: value }).eq('id', business.id)
```
Control de 2 opciones (radio/segmented, enum). Copy sugerido: *"Cuando reservan, ¿preseleccionar 'Cualquiera'?"* — "Sí (recomendado)" = `any` / "No, que elijan un profesional" = `choose`. RLS owner-only ya cubre el aislamiento (V4).

---

## Shared Patterns

### Persistencia de un setting de business (EXTRA-B)
**Source:** `settings-client.tsx:865` (`require_deposit`), `abonos-client.tsx:232` (`abono_window_weeks`)
**Apply to:** el toggle EXTRA-B
```tsx
await supabase.from('businesses').update({ <col>: value }).eq('id', business.id)  // browser client, RLS owner-only
```

### Borrado con manejo de FK 23503 (EXTRA-A)
**Source:** `settings-client.tsx:397-409` (`deleteService`)
**Apply to:** `deleteProfessional` (`:573`) — hoy le falta; alinear al patrón (capturar error, ramificar 23503, no mutar estado si falló).

### Chip de estado con token semántico (POLISH-01)
**Source:** `components/ui/badge.tsx` variants `destructive`/`secondary`
**Apply to:** chip Cancelado/Completado en Archivados. Evitar el molde con hex de `StatusBadge` (appointments-client).

### Columna nueva idempotente en `businesses` (EXTRA-B)
**Source:** `abono_window_weeks` (`schema.sql:462-463`) CHECK vía `pg_constraint`
**Apply to:** migr. 061 (`ADD COLUMN IF NOT EXISTS` + CHECK envuelto en `DO $$`).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (ninguno) | — | — | Los 8 archivos tienen analog in-repo. POLISH-02 usa doctrina React (`key`) más que un ejemplo idéntico, pero el repo ya co-ubica subcomponentes de detalle. |

## Metadata

**Analog search scope:** `app/(dashboard)/{abonos,clients,settings}`, `app/[slug]/`, `app/cancelar/`, `app/abono/cancelar/`, `components/ui/badge.tsx`, `components/dashboard/canchas-manager.tsx`, `supabase/migrations/`, `supabase/schema.sql`.
**Files scanned:** 8 objetivo + 3 analog (badge.tsx, migración 060, schema.sql businesses).
**Pattern extraction date:** 2026-07-27
</content>
</invoke>
