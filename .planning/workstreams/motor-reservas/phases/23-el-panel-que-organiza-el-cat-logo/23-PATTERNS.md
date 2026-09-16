# Phase 23: El panel que organiza el catálogo — Mapa de patrones

**Mapeado:** 2026-09-16
**Archivos a crear/modificar:** 4 (2 nuevos, 2 modificados) + 1 archivo de test nuevo
**Analogías encontradas:** 4 / 4

> **Cómo leer este documento.** Cada línea que se cita acá se **midió esta sesión** con `Read` sobre el
> archivo real. Donde el `23-CONTEXT.md` o el `23-UI-SPEC.md` citan otra línea, manda la de acá (y la
> tabla §"Desajustes medidos" del `23-RESEARCH.md`, que ya documentó 8 derivas: D-1…D-8).
> Todos los analogos citados están **trackeados en git** (`git ls-files` verificado esta sesión): no hay
> ni una ruta de mirror/gitignore.

---

## Clasificación de archivos

| Archivo nuevo/modificado | Rol | Flujo de datos | Analogía más cercana | Calidad del match |
|---|---|---|---|---|
| **NUEVO** `components/dashboard/categories-manager.tsx` (nombre tentativo) | component (client, CRUD + DnD) | CRUD + event-driven (drag/drop) | `components/dashboard/canchas-manager.tsx` | **exacta** — mismo rol, misma pantalla, mismo padre, mismo modo de escritura |
| **NUEVO** `lib/catalog-order.ts` (nombre tentativo) | utility (módulo puro) | transform | `lib/staff-services.ts` / `lib/service-categories.ts` | **exacta** — mismo rol (regla de dominio pura, testeable sin DB) |
| **MOD** `app/(dashboard)/servicios/page.tsx` | route (RSC) | request-response / read | sí mismo (`:21-28`, el `Promise.all` que ya existe) | **exacta** — se extiende el patrón vivo del propio archivo |
| **MOD** `app/(dashboard)/settings/settings-client.tsx` | component (client, 3636 líneas) | CRUD | sí mismo (`addService` `:1351`, `saveEditService` `:1465`, `selectPalette` `:993`) | **exacta** |
| **NUEVO** `test/catalog-order.test.ts` (nombre tentativo) | test | transform | `test/service-categories.test.ts` | **exacta** |

**Fuera de alcance (no se toca):** `app/[slug]/booking-client.tsx`, `app/[slug]/page.tsx`,
`components/landing/services.tsx`, `components/dashboard/canchas-manager.tsx` (el vertical canchas
queda AFUERA por decisión del UI-SPEC, respaldada por el leak guard de `canchas-manager.tsx:14-15`),
y **cualquier migración** (la fase está locked en cero migraciones por D-09).

---

## Asignaciones de patrón

### `components/dashboard/categories-manager.tsx` (component, CRUD + drag)

**Analogía estructural:** `components/dashboard/canchas-manager.tsx` (435 líneas, medido).

#### 1. Cabecera + imports — copiar el registro, no sólo la forma (`canchas-manager.tsx:1-30`)

```tsx
'use client'

// components/dashboard/canchas-manager.tsx — manager de canchas para el vertical canchas (D-03).
//
// Se renderiza en /servicios (view='servicios') SOLO cuando resolveVertical(business).key === 'canchas',
// …
// LEAK GUARD (Pitfall 3): las agendas-cancha se presentan como 'Canchas' (term.resource), NUNCA como
// 'Equipo'; no se muestran campos de staff (specialty/license/phone/email) ni el service_id (puntero interno).

import { useState } from 'react'
import { toast } from 'sonner'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Business, Service, Professional, Space, AgendaSpace } from '@/lib/types'
import { provisionCancha, canchasFromData, … } from '@/lib/canchas'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/crm/confirm-dialog'
import { useActiveTabs, ActiveTabs, ActiveTabsEmptyState } from '@/components/dashboard/active-tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Trash2, Clock, DollarSign, Pencil, MapPin, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
```

Qué se copia literal:
- `'use client'` + **bloque de cabecera en español** que dice **dónde se monta, qué consume y cuál es el
  límite explícito**. Para el componente nuevo ese límite es: *"el vertical canchas queda afuera a
  propósito"* y *"la regla de agrupar/ordenar NO vive acá: la resuelve `groupCatalog()` de
  `@/lib/service-categories`"*.
- Imports por alias `@/…` (nunca relativos profundos), `lucide-react` como única librería de iconos,
  `sonner` como único canal de feedback.
- **Cero imports de drag-and-drop.** No se agrega ninguna dependencia (§Registry Safety del UI-SPEC).

#### 2. Props: el cliente Supabase VIENE POR PROP (`canchas-manager.tsx:35-58`)

```tsx
// Predicado único … Vive a nivel de módulo para que su identidad sea estable entre renders y los
// useMemo del hook compartido no se invaliden en cada uno.
const isCanchaActive = (c: Cancha) => !!c.service.active

interface Props {
  business: Business
  supabase: SupabaseClient
  // Estado + setters compartidos con SettingsClient: la provisión mergea a las 4 colecciones para que
  // la reconstrucción (canchasFromData) sea consistente sin recargar la página.
  services: Service[]
  setServices: React.Dispatch<React.SetStateAction<Service[]>>
  professionals: Professional[]
  setProfessionals: React.Dispatch<React.SetStateAction<Professional[]>>
  …
}

export function CanchasManager({ business, supabase, services, setServices, … }: Props) {
```

Traducción directa para el organizador:

```tsx
interface Props {
  business: Business                 // trae category_sort_mode / service_sort_mode (select('*'))
  supabase: SupabaseClient           // ⬅ NUNCA createClient() adentro: el padre y el hijo comparten sesión
  services: Service[]
  setServices: React.Dispatch<React.SetStateAction<Service[]>>
  categories: ServiceCategory[]
  setCategories: React.Dispatch<React.SetStateAction<ServiceCategory[]>>
  // Escritor ÚNICO de services.category_id (D-07) — lo provee el padre o vive acá y el padre lo importa,
  // pero es UNA función, no tres.
  onAssignCategory: (serviceId: string, categoryId: string | null) => Promise<boolean>
}
```

⚠ **Pitfall 7 (RESEARCH):** `CategoryRow` / `ServiceChip` se declaran **a nivel de módulo**, igual que
`isCanchaActive` (`:35`). Declarados dentro del componente cambian de identidad en cada render, React
remonta el subárbol y **el arrastre se corta a mitad de gesto**.

#### 3. Raíz de la Card + empty state (`canchas-manager.tsx:259-280`, medido)

```tsx
  return (
    <>
      <Card className="p-6 space-y-4">
        {/* Píldoras de filtro (D-13), desde el módulo compartido … */}
        <ActiveTabs tab={tab} onChange={setTab} counts={tabCounts} />
        {visibleCanchas.length === 0 ? (
          <ActiveTabsEmptyState
            tab={tab}
            icon={MapPin}
            activos={{ title: 'Todavía no tenés canchas activas', help: 'Cargá la primera acá abajo…' }}
            desactivados={{ title: 'No hay canchas desactivadas', help: '…' }}
          />
        ) : (
        <div className="space-y-2">
```

Se copia: `Card className="p-6 space-y-4"` como raíz, el fragmento `<>` con el `ConfirmDialog` como
**hermano fuera de la Card**, y el **tono del empty state** (título + `help` que dice qué hacer).
El organizador **no** usa `ActiveTabs` (las categorías no tienen activo/desactivado) — se mira contra
`ActiveTabsEmptyState` sólo por el registro del copy.

#### 4. Colapsable hecho a mano — el precedente vivo de D-02 (`canchas-manager.tsx:347-357`)

```tsx
{spaces.length > 0 && (
  <div className="space-y-1.5">
    <button
      type="button"
      onClick={() => setShareOpen(o => !o)}
      className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
      aria-expanded={shareOpen}
    >
      {shareOpen ? '− ' : '+ '}Compartir espacio con otras canchas (avanzado)
    </button>
    {shareOpen && (
      <div className="space-y-1.5 rounded-lg border border-border p-3">
```

`<button type="button" aria-expanded>` + **render condicional**. Sin animación de alto, sin
`Collapsible`. El UI-SPEC suma `aria-controls`; el header lleva el conteo (D-02).
⚠ **Pitfall 8:** el handler del colapso tiene que resetear `draggingId`/`dragOverId` — si no, una fila
queda en `border-dashed` para siempre porque `onDragEnd` nunca corre sobre un nodo desmontado.

#### 5. Escritura con el cliente browser + `toast` (`canchas-manager.tsx:83-114`)

```tsx
  async function addCancha() {
    const name = newName.trim()
    …
    if (!name) { toast.error('Poné un nombre para la cancha'); return }
    setSaving(true)
    const res = await provisionCancha(supabase, business.id, { … })
    setSaving(false)
    if (!res.ok) { toast.error('No se pudo crear la cancha. Probá de nuevo.'); return }
    setServices(prev => [...prev, res.service])           // merge al estado del PADRE, sin recargar
    …
    setNewName(''); setNewPrice(''); …                    // reset del form
    toast.success('Cancha creada')
  }
```

Se copia: `trim()` al guardar (no en `onChange`), flag `saving` alrededor del `await` (guard de doble
submit), **early return sin tocar el estado local** ante el error, merge al estado del padre, reset del
form y `toast.success` al final.

#### 6. `ConfirmDialog` como hermano fuera de la Card — molde de D-04 (`canchas-manager.tsx:416-431`)

```tsx
      {/* Eliminación PERMANENTE (hard-delete): gate por tipeo "ELIMINAR" + aviso de reservas próximas. */}
      <ConfirmDialog
        open={!!delCancha}
        onOpenChange={o => { if (!o) setDelCancha(null) }}
        title="¿Eliminar cancha?"
        description={delDescription}     // ⬅ el conteo se arma ANTES y viaja como descripción
        confirmWord="ELIMINAR"
        risk="alto"
        confirmLabel="Eliminar"
        destructive
        // Fail-closed (WR-B4): con el pre-check fallido NO se ofrece confirmar.
        hideConfirm={delPending === 'error'}
        onConfirm={confirmDelete}
      />
```

Para D-04 el `description` es **el conteo de servicios que quedan sin categoría + "siguen activos y
reservables"**. El conteo sale del estado local (`services.filter(s => s.category_id === cat.id).length`),
no de una query nueva: la relación ya está en memoria.
⚠ Gotcha del repo: la acción del `ConfirmDialog` **audita y retorna**, nunca `redirect()`.
⚠ **Pitfall 6:** **no** sacar la categoría del estado de forma optimista antes del `await`.

#### 7. Los botones ▲/▼ — se porta el BOTÓN, no el mutador (`app/(dashboard)/web/_sections/section-list.tsx:110-155`, medido)

```tsx
<li key={s.type} className="rounded-md border bg-secondary">                       {/* :110 */}
  <div className="flex items-center gap-1.5 p-2">
    {/* Grip decorativo: señala "arrastrable-ish" … */}
    <GripVertical className="size-4 shrink-0 text-muted-foreground/40" aria-hidden="true" />  {/* :113-116 */}
    …
    {/* Subir: disabled en la primera fila. */}
    <Button
      variant="ghost"
      size="icon"
      className="min-h-11 min-w-11"
      disabled={isFirst}
      aria-disabled={isFirst}          {/* :136-137 — los DOS juntos */}
      aria-label="Subir sección"
      onClick={() => handleMove(s.type, 'up', i)}
    >
      <ChevronUp className="size-4" />
    </Button>
    … ChevronDown con disabled={isLast} …                                          {/* :145-155 */}
```

Se porta literal: `disabled` **y** `aria-disabled` juntos, `aria-label` con el nombre interpolado
(`Subir ${categoria.name}`), `GripVertical` siempre `aria-hidden`, y la región
`<div aria-live="polite" className="sr-only">` **siempre montada** cuyo *contenido* cambia
(`section-list.tsx:226-228`, medido — el UI-SPEC cita `:214`).

⚠ **NO se porta:**
- El **mutador**: `section-list` hace **swap** con la vecina. **CAT-03 lo prohíbe** — se renumera la
  lista completa (Pitfall 3).
- El **tamaño**: acá es `min-h-11 min-w-11` fijo; el UI-SPEC pide `h-11 w-11 sm:h-8 sm:w-8` (molde de
  la tarjeta de servicio, `settings-client.tsx:2701`).

#### 8. El `draggable` nativo (`app/(crm)/admin/pipeline/pipeline-client.tsx`, medido)

**Origen** (`:461-471`):

```tsx
<article
  draggable
  onDragStart={(e) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', deal.id)
    onDragStart()                                  // ⬅ y ADEMÁS al estado de React
  }}
  onDragEnd={onDragEnd}
  className={`group/card cursor-grab rounded-lg border border-border bg-card p-3 active:cursor-grabbing ${
    dragging ? 'opacity-50' : ''                   // ⚠ NO portar: el UI-SPEC manda border-dashed
  }`}
>
```

**Destino** (`:258-271`):

```tsx
<div
  onDragOver={(e) => {
    e.preventDefault()                             // ⬅ sin esto onDrop NUNCA dispara
    setDragOverStage(stage.key)
  }}
  onDragLeave={(e) => {
    // Solo limpiar si salimos de la columna (no al pasar sobre un hijo).
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverStage(null)
  }}
  onDrop={() => handleDrop(stage.key)}
  className={`… transition-colors ${isOver ? 'border-primary bg-secondary/40' : 'border-border'}`}
>
```

**El handler** (`:141-161`):

```tsx
  async function handleDrop(targetStage: StageKey) {
    const dealId = draggingId
    setDraggingId(null)                            // ⬅ los dos estados se limpian ANTES de cualquier await
    setDragOverStage(null)
    if (!dealId) return
    const moved = deals.find((d) => d.id === dealId)
    if (!moved || moved.stage === targetStage) return   // no-op si destino === origen
    const prevStage = moved.stage
    setDeals((prev) => prev.map(…))                // optimista
    try { await moveStage({ dealId, stage: targetStage }) }
    catch {
      setDeals((prev) => prev.map(…))              // revertir + toast
      toast.error('No se pudo mover la tarjeta. Probá de nuevo.')
    }
  }
```

⚠ **D-10.2 pide MÁS que revertir:** re-leer el orden real de la base y pintar eso (ver §Patrones
compartidos → "Rechazo honesto"). El `id` viaja por `useState` (no por `dataTransfer`, que devuelve
`''` durante `dragover`).

#### 9. La regla de renumerar — `../forjo-tiendas/…/Organizador.tsx:125-167` (FORMA solamente)

```ts
function mover(c, delta: -1 | 1) {
  const hermanas = hermanasDe(c.padreId)
  const desde = hermanas.findIndex(x => x.id === c.id)
  const hacia = desde + delta
  if (desde < 0 || hacia < 0 || hacia >= hermanas.length) return   // no-op en los bordes
  const ids = hermanas.map(x => x.id)
  const [sacado] = ids.splice(desde, 1)
  ids.splice(hacia, 0, sacado)
  correr(() => reordenarCategorias(ids))                           // ⬅ se manda la lista ENTERA
}
```

⚠ **Es un repo hermano, no una fuente de copia.** Sus columnas están en español
(`tienda_id`/`nombre`/`orden`), su RLS es otra, y su `reordenarCategorias` (`acciones.ts:181-194`)
hace N updates **sin filtro de tenant** — exactamente lo que **D-10.1 prohíbe**. Se porta: (a) que el
drag y las flechas desemboquen en **la misma** operación "lista de ids reordenada", y (b) que se mande
la lista completa. Nada más.

---

### `lib/catalog-order.ts` (utility, transform) — NUEVO

**Analogía:** `lib/staff-services.ts` (cabecera medida `:1-34`) y `lib/service-categories.ts`.

```ts
import type { Professional, Service, ProfessionalService } from '@/lib/types'

// ── Regla del comodín staff↔servicios (STAFF, D-01/D-12) ────────────────────────────────────
// Fuente ÚNICA de verdad … Encierra la regla una sola vez para que las TRES capas que la necesitan
// la interpreten idéntico: …
// Definirla y testearla acá evita que tres implementaciones deriven en la interpretación de D-01.
//
// Funciones PURAS: sin React ni Supabase → reutilizables en client y server, testeables sin DB.
// Los inputs son filas planas (…), nunca clientes de datos. El caller resuelve el filtrado por tenant
// y por `active` ANTES de llamar (D-16).

/**
 * Los servicios que hace `professionalId`.
 * …
 */
export function servicesForProfessional(…): Service[] { … }
```

Lo que el módulo nuevo hereda, línea por línea:
- **Cabecera en español** con `POR QUÉ EXISTE` / `QUÉ HACE` / `QUÉ NO HACE` (el registro de
  `active-tabs.tsx:3-21` es la versión más explícita del repo).
- **Sin React y sin Supabase**: entra un `string[]` de ids, sale `{ id, sort_order }[]`. El filtrado
  por tenant lo resuelve el caller **antes** (mismo contrato que `staff-services`, `:13`).
- Named exports, JSDoc por función.

Superficie recomendada (RESEARCH, pregunta abierta 2 → "sí"):

```ts
export function renumber(ids: string[]): { id: string; sort_order: number }[]
export function moveWithinList(ids: string[], from: number, to: number): string[]
```

⚠ **PROHIBIDO** meter acá la regla de **agrupar u ordenar**: eso ya es `groupCatalog()` de
`lib/service-categories.ts:252`. Este módulo sólo sabe de *posiciones*.

**Test:** molde `test/service-categories.test.ts`. Lo que hay que asertar (no está cubierto hoy):
que `renumber` produce `0..n-1` **sin huecos ni empates** sobre la lista completa, y que
`moveWithinList` es no-op en los bordes.

---

### `app/(dashboard)/servicios/page.tsx` (route RSC, read) — MODIFICAR

**Analogía: sí mismo.** El archivo tiene 44 líneas y el `Promise.all` vive en `:21-28` (medido):

```ts
  // professional_services (STAFF, migr. 057): la cobertura por servicio (Bloque B) necesita las filas
  // del mapeo. Por tenant (.eq('business_id') + RLS, defensa en profundidad).
  const [{ data: services }, { data: locations }, { data: professionals }, { data: spaces }, { data: agendaSpaces }, { data: professionalServices }] = await Promise.all([
    supabase.from('services').select('*').eq('business_id', business.id).order('created_at'),   // :22
    supabase.from('locations').select('*').eq('business_id', business.id).order('created_at'),
    …
  ])

  return (
    <SettingsClient
      business={business}
      initialServices={services || []}
      …
      view="servicios"
    />
  )
```

Los dos cambios, **los dos en este archivo solo**:

1. `:22` pasa a `.order('sort_order', { ascending: true }).order('created_at', { ascending: true })`.
2. Una lectura más en el `Promise.all`, con el comentario en español del **porqué** del desempate:
   `supabase.from('service_categories').select('*').eq('business_id', business.id).order('sort_order').order('created_at')`
   — sin el `created_at` el orden de varias categorías en `sort_order = 0` no está garantizado.

Y la prop nueva en el `return`, con default `[]` del lado del cliente. **Pitfall 10:** dejar escrito
**por qué alcanza con `/servicios`** (el panel `services` sólo se monta con `view="servicios"`;
`TabsContent` es `TabsPrimitive.Panel` con `keepMounted = false`).

---

### `app/(dashboard)/settings/settings-client.tsx` (component, CRUD) — MODIFICAR

**Analogía: sí mismo.** ⚠ **Pitfall 2:** anclar cada `Edit` por **texto único**
(`{/* Alta de servicio */}`, `<CapacityModeFields`, `ActiveTabs tab={serviceTab}`,
`<p className="text-sm font-medium">Agregar servicio</p>`), **nunca** por número de línea.

#### a) Los dos shapes de form — texto crudo, comentado (`:1140-1151`, medido)

```tsx
  const [services, setServices] = useState<Service[]>(initialServices)
  // capacity_mode/capacity (migr. 062, ampliado por la 068): el default espeja el de la DB …
  // `duration_minutes` y `price` guardan el TEXTO CRUDO del input (G-21-11): es lo que permite
  // vaciar la celda con el teclado. …
  const [newService, setNewService] = useState<{ name: string; duration_minutes: string; price: string; location_ids: string[]; capacity_mode: CapacityMode; capacity: number }>({ name: '', duration_minutes: String(DEFAULT_SERVICE_MINUTES), price: '0', location_ids: [], capacity_mode: 'individual', capacity: 1 })
  // Guard de doble submit del alta (T-17-05) …
  const [savingNewSvc, setSavingNewSvc] = useState(false)
```

`editSvcForm` es el **espejo literal** (`:1431-1434`): `// Mismo criterio que `newService`: los dos
campos numéricos son texto crudo (G-21-11).`
Los dos suman `category_id: string | null` y `description: string`.
⚠ La descripción **NO se normaliza en `onBlur`** (a diferencia de duración y precio): sólo al guardar.

#### b) El alta (`addService`, `:1351-1381`, medido)

```tsx
  async function addService() {
    // El botón deshabilitado es la SEÑAL, no la defensa …
    if (!newService.name) return
    if (savingNewSvc) return
    setSavingNewSvc(true)
    try {
      …
      const { data, error } = await supabase.from('services')
        .insert({ name, duration_minutes: durationMinutes, price: priceValue, location_ids: …, capacity_mode, capacity, business_id: business.id })
        .select().single()
      if (error) { toast.error('Error'); return }
      setServices(prev => [...prev, data as Service])
      setNewService({ … })                 // reset
      toast.success('Servicio agregado')
    } finally {
      // `finally` y no una línea antes de cada `return`: el early return por error del INSERT y
      // cualquier excepción de red tienen que devolver el botón …
      setSavingNewSvc(false)
    }
  }
```

Se extiende el `insert` con `category_id` y `description` (trim → `null` si queda vacía). El
`finally` se conserva tal cual.

#### c) La edición (`openEditService` `:1447-1464` + `saveEditService` `:1465-1501`, medido)

```tsx
    setEditSvcForm({
      name: s.name,
      // `String(...)` y no `Number(...)`: el estado ahora es texto. …
      duration_minutes: String(s.duration_minutes),
      price: String(s.price),
      location_ids: serviceLocSet(s),
      capacity_mode: mode,
      capacity: normalizeCapacity(Number(s.capacity), minCapacityFor(mode)),
    })
…
    const payload = { name: editSvcForm.name.trim(), duration_minutes: …, price: …, location_ids: …, location_id: null, capacity_mode: …, capacity: … }
    // El `.eq('business_id', ...)` es defensa en profundidad (la RLS es la segunda capa, no la única).
    const { error } = await supabase.from('services').update(payload).eq('id', editSvc.id).eq('business_id', business.id)
    setSavingEditSvc(false)
    if (error) {
      // Mapeo del rechazo del gate … La copy es PROPIA y fija: NUNCA se interpola `error.message`
      // ni el nombre del servicio (T-14-14 / T-13-09).
      if (error.code === 'P0001' && error.message?.includes('service_mode_has_future_appointments')) { toast.error(GATE_MODE_CHANGE_MESSAGE); return }
      toast.error('Error al guardar')
      return
    }
    setServices(prev => prev.map(s => s.id === editSvc.id ? { ...s, ...payload } : s))
```

Hidratación suma `category_id: s.category_id ?? null` y `description: s.description ?? ''`; el
`payload` suma las dos.
⚠ **El `payload` del diálogo de edición NO es la vía de asignación de categoría de D-07** cuando la
asignación viene del organizador: el `Select` del form es **uno de los tres call sites** y llama a la
**misma** `asignarCategoria(serviceId, categoryId)` (o, si la asignación viaja dentro del guardado del
servicio, se documenta explícitamente que ese es el único punto donde la columna viaja acompañada).
Tres implementaciones distintas de `.update({ category_id })` es lo que la restricción dura prohíbe.

#### d) El `Select` — render-prop obligatorio (`:2421-2429`, medido — Pitfall 9)

```tsx
<Select value={vertical} onValueChange={v => setVertical(v as VerticalKey)}>
  {/* Base UI Select.Value muestra el value crudo (la VerticalKey); mapeamos a su label. */}
  <SelectTrigger className="w-full"><SelectValue>{(v: string | null) => (v && v in VERTICALS ? VERTICALS[v as VerticalKey].label : 'Elegí tu rubro')}</SelectValue></SelectTrigger>
  <SelectContent>
    {(Object.keys(VERTICALS) as VerticalKey[]).map(k => (
      <SelectItem key={k} value={k}>{VERTICALS[k].label}</SelectItem>
    ))}
  </SelectContent>
</Select>
```

Vale para los **tres** Selects nuevos: Categoría (alta + edición) y los dos de modo de orden. Sin el
render-prop el trigger dice `custom` o un UUID.

#### e) Dónde aterrizan los campos nuevos (medido esta sesión)

| Campo | Superficie | Ancla de texto | Línea medida |
|---|---|---|---|
| Categoría + Descripción | alta | después del `</div>` que cierra el `grid-cols-12` de Nombre/Min./Precio, **antes** de `<CapacityModeFields` | entre `:2736` y `:2737` |
| Categoría + Descripción | diálogo de edición | después del `grid grid-cols-2` de Min./Precio, **antes** de `<CapacityModeFields` | entre `:2813` y `:2814` |
| Selector de modo de orden de **servicios** (D-03) | vista de servicios | justo debajo de `<ActiveTabs tab={serviceTab} …>` | `:2498` |
| Organizador (componente nuevo) | vista de servicios | primer hijo del fragmento `<>` del `else` de `isCanchas` | `:2494` (el ternario abre en `:2477`) |

El markup del alta a espejar (`:2719-2735`, medido) usa `grid grid-cols-12 gap-2 items-end` con
`col-span-12 sm:col-span-N` y `Label className="text-xs text-muted-foreground"`. El del diálogo
(`:2799-2813`) vive dentro de `<div className="-mx-4 min-h-0 space-y-3 overflow-y-auto overscroll-contain px-4 py-1">`
— **esa fila del medio es la única que scrollea**: sumarle dos campos no requiere tocar el
`DialogContent` (`:2789`, con su `grid-rows-[auto_minmax(0,1fr)_auto]`).

#### f) El CTA del alta (`:2763-2765`, medido)

```tsx
<Button onClick={addService} disabled={!newService.name.trim() || savingNewSvc} className="w-full sm:w-auto min-h-11 sm:min-h-0">
  <Plus className="w-4 h-4" /> {savingNewSvc ? 'Agregando…' : 'Agregar servicio'}
</Button>
```

Molde del botón de alta de categoría: verbo + sustantivo, `disabled` con `.trim()`, label que cambia
mientras la escritura está en vuelo.

---

## Patrones compartidos

### 1. Escritura de orden — N `.update({ sort_order })`, un mutador por eje

**Fuente:** `settings-client.tsx:1485` (update por tenant) + `:1382-1400` (el `.select('id')` y el
chequeo de 0 filas) + `agenda-client.tsx:651-665` (el rechazo honesto).
**Aplica a:** los **dos** ejes (categorías **y** servicios).

> ⚠ **El usuario resolvió la pregunta abierta D-1 a favor de la opción B.** El upsert escrito en D-09
> para el eje categorías **no se implementa**: fue medido abortando con `23502` porque
> `service_categories.name` es `NOT NULL` sin default. **No mapear analogías para el upsert.**
> El precedente `agenda-client.tsx:801` queda como nota histórica, no como molde de esta fase.

El molde de update por tenant, literal del repo (`settings-client.tsx:1484-1485`):

```ts
    // El `.eq('business_id', ...)` es defensa en profundidad (la RLS es la segunda capa, no la única).
    const { error } = await supabase.from('services').update(payload).eq('id', editSvc.id).eq('business_id', business.id)
```

Y el `.select('id')` que convierte "0 filas" en un fallo (`settings-client.tsx:1382-1388, 1400`):

```ts
  // NO optimista: capturamos el error real. Defensa en profundidad con business_id …
  // `.select('id')` tampoco es cosmético: si la RLS filtra la fila, el DELETE vuelve sin error y con
  // 0 filas — sin eso diríamos "Servicio eliminado" sin haber borrado nada.
  async function deleteService(id: string): Promise<DeleteServiceResult> {
    const { data, error } = await supabase.from('services').delete().eq('id', id).eq('business_id', business.id).select('id')
    …
    if (!data || data.length === 0) return { ok: false, error: 'unknown' }
```

**Un update de 0 filas no es un éxito.** Vale igual para `service_categories`.

### 2. Rechazo honesto — ramificar por `error.code`, nunca tocar el estado local

**Fuente:** `app/(dashboard)/agenda/agenda-client.tsx:200-232` (clasificador) + `:651-665` (call site).
**Aplica a:** D-10.2 (fallo parcial de reorden), CAT-01 (duplicado `23505` / blanco `23514`), y todo
error de las 5 escrituras nuevas.

El clasificador (`:200-232`, medido):

```ts
// ── El rechazo de la base → copy propia del cliente (T-19-24 / T-14-25 / T-13-09) ──────────────
//
// El mensaje que devuelve Postgres trae nombres de tabla, de constraint y detalles del schema. Acá
// se INSPECCIONA para saber qué pasó … pero NUNCA cruza a la pantalla: lo único que sale de esta
// función es un código de dominio propio, y la copy la pone el call site.
type SaveHoursReject = 'reload' | 'stale' | 'invalid' | 'not_deployed' | 'unknown'

function classifySaveHoursError(error: { code?: string; message?: string }): SaveHoursReject {
  const code = error.code ?? ''
  const message = error.message ?? ''
  if (code === 'P0001' && message.includes('not_your_business')) return 'reload'
  if (code === '23503') return 'reload'
  …
  return 'unknown'
}
```

El call site (`:651-665`, medido):

```ts
      if (error) {
        const reason = classifySaveHoursError(error)
        // Se registra el CÓDIGO, nunca el mensaje: alcanza para diagnosticar y no arrastra el
        // schema a ningún lado.
        console.error('[agenda/save-hours] rechazo:', reason, error.code)
        …
        toast.error(SAVE_HOURS_REJECT_COPY[reason])
        // El estado local NO se toca: lo que el dueño ve sigue siendo lo que quiso guardar.
        return
      }
```

Y la re-derivación desde lo que devolvió la base (`:666-673`) es el precedente exacto de D-10.2:
*"Re-derivar el estado con lo que devolvió la base NO es opcional (P-01)."*

⚠ **`23505` no significa lo mismo en los dos caminos.** En el **alta** de categoría es el nombre
duplicado → error inline bajo el input con `aria-invalid`. En un **reorden** es una carrera → toast
genérico + re-read. La distinción va **por call site**, no en un clasificador global.
⚠ **Nunca** `toast.error(error.message)`. Prefijo de log `[catalogo/<accion>]`, molde
`[agenda/save-hours]`.

### 3. Escritura de una columna de `businesses` (los dos modos de orden, CAT-04)

**Fuente:** `settings-client.tsx:993-1000` (medido). **Aplica a:** los dos selectores de D-03.

```ts
  async function selectPalette(key: string) {
    setPalette(key)
    // Feedback inmediato en el <html>; la persistencia confirma después.
    document.documentElement.dataset.palette = key
    const { error } = await supabase.from('businesses').update({ palette: key }).eq('id', business.id)
    if (error) { toast.error('Error al guardar la paleta'); return }
    toast.success('Paleta actualizada')
  }
```

⚠ **Pitfall 4 / D-11 / CAT-06:** el handler escribe **una sola columna de `businesses` y nada más**.
Cualquier `sort_order` dentro de este handler es el bug. Reversibilidad **one-way**.

### 4. Escritor único de `services.category_id` (D-07, restricción dura)

**Fuente:** la forma canónica del repo (`settings-client.tsx:1485` + `:1388`) compuesta por RESEARCH
§"Code Examples". **Aplica a:** los tres call sites (Select del form, drop del chip, diálogo "Mover a…").

```ts
async function asignarCategoria(serviceId: string, categoryId: string | null): Promise<boolean> {
  const { data, error } = await supabase.from('services')
    .update({ category_id: categoryId })
    .eq('id', serviceId)
    .eq('business_id', business.id)
    .select('id')
  if (error || !data || data.length === 0) {
    console.error('[catalogo/asignar] rechazo:', error?.code ?? 'cero filas')
    return false
  }
  setServices(prev => prev.map(s => s.id === serviceId ? { ...s, category_id: categoryId } : s))
  return true
}
```

La FK compuesta `services_category_same_tenant` rechaza con `23503` una categoría de otro negocio
(garantía **declarativa**); el `.eq('business_id')` es la segunda capa.

### 5. Agrupar y ordenar — `groupCatalog()`, prohibido reimplementar

**Fuente:** `lib/service-categories.ts:252`. **Aplica a:** todo render agrupado del organizador.

```ts
groupCatalog(
  services,                                   // Service[] del estado local — sin cast
  categories,                                 // ServiceCategory[] — sin cast
  { categories: business.category_sort_mode, services: business.service_sort_mode },  // pueden ser undefined
)
```

Los comparadores **no se exportan** (`:124-204`): el panel no puede "usar el alfabético" por su cuenta.
`localeCompare` a secas **tira** con `name` nulo (`:136-143`).

### 6. Módulo puro compartido — cabecera `POR QUÉ EXISTE / QUÉ HACE / QUÉ NO HACE`

**Fuente:** `components/dashboard/active-tabs.tsx:3-21` (medido) — el registro más explícito del repo:

```tsx
// components/dashboard/active-tabs.tsx — píldoras "Activos / Desactivados" del dashboard (D-13).
//
// POR QUÉ EXISTE: es la TERCERA aparición del mismo molde en el repo …
// QUÉ HACE: el estado del tab, el filtro, los contadores, las dos píldoras y el panel de estado vacío…
// QUÉ NO HACE: no sabe qué está filtrando. Es genérico sobre `T`, no importa tipos de dominio ni
// clientes de datos …
// QUIÉN QUEDA AFUERA A PROPÓSITO: /abonos. …
```

**Aplica a:** el componente nuevo (su "QUIÉN QUEDA AFUERA A PROPÓSITO" = el vertical canchas) y al
módulo puro nuevo (su "QUÉ NO HACE" = agrupar/ordenar, que es `groupCatalog`).

### 7. Guards de doble submit

`savingNewSvc` (booleano) para una operación única (`:1151`, `:1356-1357`, `:1376-1380`), y
**conjunto** cuando hay N controles en pantalla a la vez (`savingCapacityIds`, `:1435-1446`, con el
comentario que explica por qué un id suelto no alcanza). El organizador tiene N filas de categoría y N
chips: si se deshabilita por elemento, es un `ReadonlySet<string>`.

---

## Sin analogía

Ninguno. Los 5 archivos tienen analogía en el repo. Los únicos comportamientos **sin precedente
directo** son dos, y los dos se componen de patrones existentes:

| Comportamiento | Por qué no hay analogía exacta | Con qué se compone |
|---|---|---|
| **Renumerar la lista completa** (CAT-03) | El único precedente in-repo (`section-list.tsx`) hace **swap**, que CAT-03 prohíbe | Forma de `../forjo-tiendas/…/Organizador.tsx:125-167` (sólo forma) + módulo puro nuevo + el mutador por tenant de `settings-client.tsx:1485` |
| **Drag que cambia de contenedor y re-lee tras el fallo** (D-10.2) | `pipeline-client.tsx` **revierte**; D-10.2 pide **re-leer de la base y pintar eso** | Mecanismo de drag de `pipeline-client.tsx:258-271, 461-471` + la re-derivación de `agenda-client.tsx:666-673` |

---

## Metadata

**Alcance de la búsqueda:** `app/(dashboard)/`, `app/(crm)/admin/`, `components/dashboard/`,
`components/crm/`, `lib/`, `test/`, y el repo hermano `../forjo-tiendas` (sólo como referencia de forma).
**Archivos leídos esta sesión:** `canchas-manager.tsx` (`:1-120`, `:255-369`, `:410-435`),
`servicios/page.tsx` (entero), `section-list.tsx` (`:100-169`), `agenda-client.tsx` (`:198-237`, `:636-675`),
`settings-client.tsx` (`:980-1008`, `:1140-1164`, `:1351-1410`, `:1431-1505`, `:2405-2434`, `:2713-2770`, `:2789-2818`),
`active-tabs.tsx` (`:1-70`), `pipeline-client.tsx` (`:136-165`, `:255-272`, `:455-474`), `staff-services.ts` (`:1-40`).
**Verificación de tracking:** `git ls-files` sobre los 12 analogos citados → los 12 trackeados.
**Fecha de extracción:** 2026-09-16
**Se invalida si:** cambia el tamaño de `settings-client.tsx` (hoy 3636 líneas) o se aplica una
migración sobre `services` / `service_categories` — en ese caso hay que volver a medir todas las líneas.
