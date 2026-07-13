# Phase 3: Rework del selector de rubro - Pattern Map

**Mapped:** 2026-07-04
**Files analyzed:** 6 (5 modificados + 1 nuevo)
**Analogs found:** 6 / 6 (todos los análogos viven en el propio repo — es un rework in-place)

> Idioma de la UI: **español** (convención del proyecto). Identificadores de código quedan como están.
> Todos los excerpts son código REAL del repo con `file:line`. El planner/executor deben **espejar** el
> patrón vigente, no introducir uno nuevo (perfil del dev: example-driven, mirror in-repo pattern).

---

## File Classification

| Archivo (nuevo/modificado) | Rol | Data Flow | Análogo más cercano | Match |
|----------------------------|-----|-----------|---------------------|-------|
| `lib/verticals.ts` (mod) | config / lib puro | transform (declarativo) | sí mismo (`TYPE_GROUPS`, `resolveVertical`) | exact (self) |
| `supabase/migrations/047_*.sql` (nuevo) | migration | batch / data-migration | `046_drop_business_hours.sql` (header+cutover), CASE aditivo | role-match |
| `app/(onboarding)/onboarding/page.tsx` (mod) | page (client component) | request-response (form→insert) | sí mismo (Select `TYPE_GROUPS`, hints) | exact (self) |
| `app/(dashboard)/settings/settings-client.tsx` (mod) | component (client) | CRUD (update business) | sí mismo (Select+"Otro", `saveBusiness`) | exact (self) |
| `app/[slug]/booking-client.tsx` (mod) | component (client) | request-response (display) | sí mismo `:401` + gemelo canchas | exact (self) |
| `app/[slug]/canchas-booking-client.tsx` (mod) | component (client) | request-response (display) | `booking-client.tsx:401` (línea gemela) | exact (twin) |

---

## Pattern Assignments

### `lib/verticals.ts` (config, transform declarativo)

**Análogo:** sí mismo — los helpers nuevos imitan `TYPE_GROUPS` / `resolveVertical`.

**Cambio 1 — Label de belleza (D-01)** (`lib/verticals.ts:66`):
```typescript
    label: 'Belleza y Estética',   // ← pasa a 'Belleza/Estética/Spa'
```
Se propaga solo al Select, al fallback de booking y a los hints (todos leen `VERTICALS[k].label`).

**Cambio 2 — Vaciar los `types` (D-08)** (`lib/verticals.ts:43,67,88,106`):
```typescript
    types: ['Médico', 'Psicólogo', 'Kinesiólogo', 'Odontólogo', 'Nutricionista'],  // ← []
```
Los 4 arrays quedan `types: []`. `getVerticalKeyByType` (`:141-147`) y `LEGACY_TYPE_VERTICAL`
(`:129-135`) **se conservan** como fallback para filas sin `vertical` (tras el backfill ninguna real
depende de ellos).

**Cambio 3 — Borrar `ALL_BUSINESS_TYPES` (código muerto)** (`lib/verticals.ts:183-186`):
```typescript
// Lista cerrada de todos los subtipos válidos (todos los verticales). La usa la
// sugerencia de rubro por IA: el modelo elige uno de acá, no inventa.
export const ALL_BUSINESS_TYPES = (Object.keys(VERTICALS) as VerticalKey[])
  .flatMap((key) => VERTICALS[key].types)
```
Cero importadores (RESEARCH grep-verified) → borrar entero junto con el comentario.

**Cambio 4 — Helpers nuevos.** Espejar el patrón declarativo de `TYPE_GROUPS` (`:177-181`):
```typescript
// PATRÓN vigente a imitar (lib/verticals.ts:177-181):
export const TYPE_GROUPS = (Object.keys(VERTICALS) as VerticalKey[]).map((key) => ({
  key, label: VERTICALS[key].label, types: VERTICALS[key].types,
}))
```
Agregar (mismo lugar, mismo estilo; ver RESEARCH Pattern 1):
```typescript
export const RUBRO_PLACEHOLDERS: Record<VerticalKey, string> = {
  salud: 'Ej: Lic. en Psicología, Kinesiólogo',
  belleza: 'Ej: Barbería, Masajista, Depilación',
  general: 'Ej: Lavaautos, Tatuajes, Fotógrafo',
  canchas: 'Ej: Canchas de fútbol',
}
export function getVerticalLabel(business: { vertical?: string | null; type?: string | null }): string {
  return resolveVertical(business).label   // resolveVertical (:163) ya prefiere `vertical`
}
```

---

### `supabase/migrations/047_backfill_vertical.sql` (migration, data-migration aditiva)

**Análogo:** `046_drop_business_hours.sql` — **espejar su header** (bloque de comentarios denso en
español explicando qué hace, por qué es seguro, orden de aplicación, cutover manual a prod).

**Header pattern a imitar** (`046_drop_business_hours.sql:1-38`): comentario multilínea con: contexto de
la fase, por qué es seguro, **ORDEN OBLIGATORIO** (aplicar a prod coordinado con el deploy), y nota de
"validación = `supabase db reset` local (PG17); prod A MANO; regenerar `schema.sql` después".

**Diferencias clave con 046:**
- 046 es **destructiva** (`DROP TABLE`); 047 es **aditiva** (`UPDATE ... WHERE vertical IS NULL`) — no toca `type`.
- El body es el CASE de RESEARCH (`03-RESEARCH.md:222-249`), derivado 1:1 de `VERTICALS[*].types` (`:43,67,88,106`) + `LEGACY_TYPE_VERTICAL` (`:129-135`), con `ELSE 'general'`.
- **ORDEN:** correr 047 en prod **antes o durante** el deploy del código que vacía los `types` (Pitfall 1). El CASE usa strings literales → no depende del código.

**Numeración:** próxima = **047**. Nota: `045_landing_cms.sql` existe local pero es de otro workstream
(excluido del merge canchas, MEMORY); igual el siguiente número libre en `gsd/onboarding` es 047 (046 es
la última de esta línea). Confirmar `ls supabase/migrations/` antes de crear.

**Validación** (PowerShell, patrón del proyecto):
```powershell
supabase db reset      # replaya baseline + 040..047; falla si el SQL rompe
```
Post-condición verificable: `SELECT count(*) FROM businesses WHERE vertical IS NULL;` → 0.

---

### `app/(onboarding)/onboarding/page.tsx` (page client, form→insert)

**Análogo:** sí mismo — el Select actual y los hints.

**Select actual a reemplazar** (`page.tsx:466-483`):
```tsx
<Label>Tipo de negocio *</Label>                 {/* ← "Rubro *" (UI-SPEC) */}
<Select value={type} onValueChange={v => setType(v ?? '')}>
  <SelectTrigger><SelectValue placeholder="Seleccioná un tipo" /></SelectTrigger>
  <SelectContent>
    {TYPE_GROUPS.map(group => (
      <SelectGroup key={group.key}>
        <SelectLabel>{group.label}</SelectLabel>
        {group.types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
      </SelectGroup>
    ))}
  </SelectContent>
</Select>
```
Pasa a: **estado nuevo `vertical: VerticalKey`** + 4 `SelectItem` planos iterando `Object.keys(VERTICALS)`
(`value = VerticalKey`, placeholder "Elegí tu rubro"), + `<Label>¿A qué se dedica tu negocio?</Label>` +
`<Input value={type} placeholder={RUBRO_PLACEHOLDERS[vertical]} />` + `<p className="text-xs
text-muted-foreground">Así aparecerá en tu página de reservas</p>`. Ver UI-SPEC §Layout: el Input libre +
leyenda van a ancho completo (`sm:col-span-2`), gap `space-y-2`.

**Insert — re-keyear el vertical (D-07)** (`page.tsx:288-293`):
```tsx
.insert({ owner_id: user.id, name, slug, type,
  vertical: getVerticalKeyByType(type),   // ← vertical: vertical  (la VerticalKey elegida directa)
  ... })
```

**Auto-hide canchas (D-07 / Pitfall 2)** (`page.tsx:380`):
```tsx
const visibleSteps = getVerticalKeyByType(type) === 'canchas'   // ← vertical === 'canchas'
  ? steps.filter(s => s.n !== 3) : steps
```
Ídem `canGoNext` (`:396` `return name && slug && slugAvailable && type` → `&& vertical`, el rubro es
required D-02) y los hints (`:487,493` `getVerticalKeyByType(type) === 'salud'` → `vertical === 'salud'`).

**Hint por vertical — se conserva** (`page.tsx:487-492`, recuadro exacto a mantener, solo cambia la condición):
```tsx
<div className="flex items-start gap-2.5 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
  <Stethoscope className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
  <span className="text-muted-foreground">Tu panel incluirá <strong className="text-foreground">historia clínica</strong>…</span>
</div>
```

---

### `app/(dashboard)/settings/settings-client.tsx` (component client, CRUD update)

**Análogo:** sí mismo — reemplaza el andamiaje "grupo + Otro" por el control unificado.

**Andamiaje a REMOVER** (Pitfall 4 — código huérfano tras el rework):
- `OTRO_TYPE` (`:28`), `predefinedTypes` (`:30`), `typeIsOtro`/`typeSelectValue` (`:248-249`), `onTypeChange` (`:251-264`), `initTypeGroup` (`:244-247`).
- Import `SelectGroup, SelectLabel` (`:21`) queda sin uso si el nuevo Select es plano → limpiar.

**Estado nuevo:** `const [vertical, setVertical] = useState<VerticalKey>((business.vertical && business.vertical in VERTICALS ? business.vertical : getVerticalKeyByType(business.type)) as VerticalKey)`. El `type` sigue en `bizForm.type`.

**Select viejo a reemplazar** (`settings-client.tsx:1089-1118`):
```tsx
<Label>Tipo</Label>                                        {/* ← "Rubro" */}
<div className="flex gap-2">
  <Select value={typeSelectValue} onValueChange={onTypeChange}>
    <SelectTrigger className={typeIsOtro ? 'w-28 flex-shrink-0' : 'w-full'}>
      <SelectValue>{typeIsOtro ? 'Otro' : bizForm.type}</SelectValue></SelectTrigger>
    <SelectContent>
      {TYPE_GROUPS.map(group => ( <SelectGroup ...>{...}<SelectItem value={`${group.key}:::${OTRO_TYPE}`}>Otro…</SelectItem></SelectGroup> ))}
    </SelectContent>
  </Select>
  {typeIsOtro && <Input ... />}
</div>
<p className="text-xs text-muted-foreground pt-0.5">
  Rubro: <span className="text-foreground">{VERTICALS[typeGroup].label}</span> · define el menú…
</p>
```
Pasa al **mismo control que el onboarding** (4 rubros planos + Input libre siempre visible +
`RUBRO_PLACEHOLDERS[vertical]` + leyenda "Así aparecerá…"). El hint "Rubro: … · define el menú" **se
conserva** leyendo `VERTICALS[vertical].label`. Gap de la superficie: `space-y-1` (no `space-y-2`).

**`saveBusiness` — patrón CRUD a preservar** (`settings-client.tsx:277-287`):
```tsx
const vertical = typeGroup                            // ← vertical = <state vertical>
const verticalChanged = vertical !== (business.vertical ?? 'general')
const type = typeIsOtro ? bizForm.type.trim() : bizForm.type   // ← type = bizForm.type.trim()
const { error } = await supabase.from('businesses')
  .update({ ...bizForm, type, whatsapp, vertical, maps_url }).eq('id', business.id)
...
if (verticalChanged) setTimeout(() => window.location.reload(), 600)  // menú/terminología dependen del vertical
```
Mantener el `.eq('id', business.id)` (aislamiento por owner) y el reload-on-verticalChanged.

---

### `app/[slug]/booking-client.tsx` + `app/[slug]/canchas-booking-client.tsx` (display, líneas gemelas)

**Análogo:** líneas idénticas — `booking-client.tsx:401` y `canchas-booking-client.tsx:331`.

**Patrón actual (idéntico en ambos)** (`booking-client.tsx:401`, `canchas-booking-client.tsx:331`):
```tsx
{business.type && <p className="text-sm text-primary-foreground/80 mt-1.5">{business.type}</p>}
```

**Fallback D-03 — aplicar en AMBOS (Pitfall 3):**
```tsx
{(business.type || getVerticalLabel(business)) && (
  <p className="text-sm text-primary-foreground/80 mt-1.5">{business.type || getVerticalLabel(business)}</p>
)}
```
`getVerticalLabel` siempre devuelve algo → el guard es simplificable a mostrar siempre. **Render con JSX
interpolado (auto-escape de React); prohibido `dangerouslySetInnerHTML`** sobre el texto libre `type`
(RESEARCH Security V5). Importar `getVerticalLabel` desde `@/lib/verticals` en ambos clients.

---

## Shared Patterns

### Fuente única declarativa en `lib/verticals.ts`
**Source:** `lib/verticals.ts:177-181` (`TYPE_GROUPS`)
**Apply to:** onboarding + settings (placeholders) + ambos booking clients (label fallback).
`RUBRO_PLACEHOLDERS[vertical]` y `getVerticalLabel(business)` — nunca hardcodear el placeholder ni el
label del rubro en cada componente.

### Control shadcn (Select + Input + Label) sin restilizar
**Source:** `@/components/ui/{select,input,label}` (ya importados en ambas superficies)
**Apply to:** onboarding + settings. Reusar verbatim; estados default/hover/focus/disabled/invalid ya
liftados por los primitivos (UI-SPEC §Interaction States). No reescribir estilos, no hardcodear
color/radio/tamaño — todo por tokens (`border-input`, `ring-ring/50`, `text-muted-foreground`, `rounded-lg`).

### Escritura sobre el negocio del owner (aislamiento por tenant)
**Source:** onboarding `page.tsx:286-302` (`.insert({ owner_id: user.id, ... })`), settings
`settings-client.tsx:282` (`.update(...).eq('id', business.id)`)
**Apply to:** ambas superficies. RLS por `business_id`/owner vigente — no cambia. El backfill 047 opera
por fila (`WHERE vertical IS NULL`), aditivo, sin cross-tenant.

### Migración SQL numerada con header denso + cutover manual
**Source:** `046_drop_business_hours.sql:1-38`
**Apply to:** 047. Header en español (contexto/seguridad/orden), validación `supabase db reset` local,
prod A MANO coordinado con el deploy, regenerar `schema.sql` después.

---

## No Analog Found

Ninguno. Es un rework in-place: todos los archivos y patrones existen en el repo. `RUBRO_PLACEHOLDERS` y
`getVerticalLabel` son nuevos pero modelan directamente el patrón declarativo vigente (`TYPE_GROUPS` /
`resolveVertical`), no requieren análogo externo.

---

## Metadata

**Analog search scope:** `lib/verticals.ts`, `app/(onboarding)/onboarding/`, `app/(dashboard)/settings/`, `app/[slug]/`, `supabase/migrations/`
**Files scanned:** 6 (todos leídos con `file:line` verificado)
**Pattern extraction date:** 2026-07-04
