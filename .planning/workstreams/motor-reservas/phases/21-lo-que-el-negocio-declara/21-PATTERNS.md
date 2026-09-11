# Phase 21: Lo que el negocio declara — Mapa de patrones

**Mapeado:** 2026-09-11
**Archivos analizados:** 4 (2 nuevos · 2 modificados)
**Análogos encontrados:** 4 / 4

> Todos los análogos de este documento son fuente **git-tracked** (verificado con `git ls-files`).
> No hay ningún path de mirror/instalación.

---

## Clasificación de archivos

| Archivo nuevo/modificado | Rol | Flujo de datos | Análogo más cercano | Calidad del match |
|--------------------------|-----|----------------|---------------------|-------------------|
| `components/agenda/block-services-line.tsx` (NUEVO) | component (presentacional, puro sobre props) | event-driven (toggle → callback al padre) | `app/(dashboard)/agenda/agenda-client.tsx:183-374` (el bloque que se extrae) | **exact** — es literalmente el mismo código movido |
| `app/(dashboard)/agenda/agenda-client.tsx` (MODIFICADO) | component (panel, client) | request-response (RPC) + event-driven | sí mismo — el cambio es borrar definiciones locales y agregar un import | **exact** |
| `app/(onboarding)/onboarding/page.tsx` (MODIFICADO) | component (wizard client) + write path multi-tabla | request-response (insert + RPC) + event-driven (chips/toggle) | `app/(dashboard)/agenda/agenda-client.tsx` (`saveHours` `:860-925`, call site `:1524-1537`, gates `:655-667`) | **role-match** (misma pantalla lógica, distinto momento: sin guardado incremental) |
| `test/onboarding-agenda-payload.test.ts` (NUEVO, opcional) | test | batch/transform (funciones puras) | `test/agenda-save-blocks-rpc.test.ts` · patrón de suites de `lib/agenda-hours-payload.ts` | role-match |

⚠ **No se crea ningún route handler, ninguna migración y ninguna tabla.** Si un plan propone
cualquiera de las tres, se desvió (ver RESEARCH §Anti-Patterns).

---

## Asignaciones de patrón

### `components/agenda/block-services-line.tsx` (component, event-driven) — NUEVO

**Análogo:** `app/(dashboard)/agenda/agenda-client.tsx:183-374` (el origen del corte).

**Regla de extracción (no negociable):** mover el código **sin editar su cuerpo**. El diff esperado es
*cortar-y-pegar + cambiar imports*. Cada detalle contraintuitivo tiene un comentario que explica por
qué es así y ya pasó UAT cuatro veces en la Phase 19 (`gap-y-0`, `role="status"` fuera del flujo, los
marcados que nunca se colapsan).

**Símbolos a mover** (líneas verificadas en esta sesión):

| Símbolo | Líneas en `agenda-client.tsx` | Nota |
|---------|------------------------------|------|
| `ServiceCatalogItem` | `:71-75` | exportado; ver §"Import a verificar" abajo |
| `CHIPS_COLLAPSED_MAX = 6` | `:183` | |
| `DRAFT_BLOCK_ID` + `isDraftBlockWildcard` | `:191-200` | adaptador al módulo puro |
| `ServiceChip` | `:201-250` | |
| `BlockServicesLine` | `:260-373` | |

**Imports que el archivo nuevo necesita** (derivados de `agenda-client.tsx:1-30`):

```ts
'use client'

import { toast } from 'sonner'
import { Check, Asterisk } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isBlockWildcard } from '@/lib/time-block-services'
```

**Contrato del tipo — verbatim, no tocar** (`agenda-client.tsx:71-75`):

```ts
export type ServiceCatalogItem = {
  id: string
  name: string
  active: boolean
}
```

**Adaptador al módulo puro — verbatim** (`agenda-client.tsx:194-200`). Es el patrón de *filas
sintéticas* que también reusa el aviso de D-07:

```ts
const DRAFT_BLOCK_ID = '__draft__'
function isDraftBlockWildcard(serviceIds: string[]): boolean {
  return isBlockWildcard(
    DRAFT_BLOCK_ID,
    serviceIds.map(id => ({ business_id: '', time_block_id: DRAFT_BLOCK_ID, service_id: id })),
  )
}
```

**Contrato de props — verbatim** (`agenda-client.tsx:260-275`), el que ambos call sites consumen:

```ts
function BlockServicesLine({ serviceIds, catalog, groupLabel, expanded, disabled, onToggleExpanded, onToggleService }: {
  serviceIds: string[]
  catalog: ServiceCatalogItem[]
  groupLabel: string
  expanded: boolean
  disabled?: boolean
  onToggleExpanded: () => void
  onToggleService: (serviceId: string) => void
})
```

**Accesibilidad / touch target a preservar** (`agenda-client.tsx:216-219` y `:311`):

```tsx
className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
...
<div role="group" aria-label={groupLabel} className="flex flex-wrap items-center gap-x-2 gap-y-0">
  <span role="status" className="sr-only">{wildcard ? 'Cualquier servicio' : ''}</span>
```

**Chip comodín de D-06 — verbatim** (`agenda-client.tsx:339-346`):

```tsx
{wildcard && (
  <span aria-hidden="true" className="inline-flex min-h-11 items-center">
    <span className="inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-border px-3 text-xs font-medium text-muted-foreground whitespace-nowrap">
      <Asterisk aria-hidden="true" className="size-3" />
      Cualquier servicio
    </span>
  </span>
)}
```

**Import a verificar (hallazgo de esta sesión, corrige A4 de RESEARCH.md):**
`grep -rn "ServiceCatalogItem"` devuelve **solo cuatro ocurrencias, todas dentro de
`app/(dashboard)/agenda/agenda-client.tsx`** (`:71`, `:264`, `:297`, `:487`). `agenda/page.tsx` **no lo
importa** — pasa la prop `serviceCatalog` sin nombrar el tipo (`agenda/page.tsx:82-83`). Conclusión:
mover el tipo **no rompe ningún import externo**; no hace falta re-exportar desde `agenda-client.tsx`.

---

### `app/(dashboard)/agenda/agenda-client.tsx` (component) — MODIFICADO

**Análogo:** el propio archivo. Cambio quirúrgico (C-05: `Edit`, nunca `Write`).

1. Borrar `:71-75`, `:183`, `:191-250`, `:260-373`.
2. Agregar el import del componente extraído.
3. Revisar dos imports que pueden quedar huérfanos (`tsc` los marca): `Check`/`Asterisk` de
   `lucide-react` (`:20`) e `isBlockWildcard` de `@/lib/time-block-services` (`:24`) — `servicesOfBlock`
   **sí sigue en uso** en el panel.

**Lo que NO cambia (call site, verbatim — `agenda-client.tsx:1527-1537`):** es el molde exacto que el
alta tiene que imitar.

```tsx
{showServicesLine && (
  <BlockServicesLine
    serviceIds={block.service_ids}
    catalog={serviceCatalog}
    groupLabel={`Servicios de la franja de ${block.start_time} a ${block.end_time}`}
    expanded={expandedChips.has(`${day}-${idx}`)}
    disabled={savingHours}
    onToggleExpanded={() => toggleChipsExpanded(day, idx)}
    onToggleService={serviceId => toggleBlockService(day, idx, serviceId)}
  />
)}
```

**Criterio de verificación sugerido:** que el cuerpo del componente extraído sea byte-idéntico al
bloque borrado, salvo imports (Pitfall 4).

---

### `app/(onboarding)/onboarding/page.tsx` (component wizard + write path) — MODIFICADO

Es el archivo con más superficie. Se subdivide por patrón; cada uno con su análogo propio.

#### a) Gate por vertical de D-03 — control oculto, no paso oculto

**Análogo del booleano derivado:** `app/(dashboard)/agenda/agenda-client.tsx:655-667` (el panel ya
tiene los tres gates que el alta necesita).

```ts
// Source: app/(dashboard)/agenda/agenda-client.tsx:659-667 (verbatim)
const isCanchas = resolveVertical(business).key === 'canchas'
const hasChipCatalog = serviceCatalog.some(s => s.active)
  || dayStates.some(d => d.blocks.some(b => b.service_ids.length > 0))
const showServicesLine = !isCanchas && hasChipCatalog
```

**Adaptación al alta:** el negocio **no existe** cuando se pinta el paso 4, así que el gate se evalúa
contra el estado local `vertical` (`page.tsx:75`), igual que hace `visibleSteps` — **no** contra
`resolveVertical(business)`.

**Molde del gateo por vertical en el alta (verbatim — `page.tsx:416-433`):**

```ts
const steps = [
  { n: 1, label: 'Tu negocio' },
  { n: 2, label: 'Servicios' },
  { n: 3, label: 'Profesionales' },
  { n: 4, label: 'Horarios' },
]

const visibleSteps = vertical === 'canchas'
  ? steps.filter(s => s.n !== 3)
  : steps
```

⚠ D-03 **no** filtra `steps`: el paso 4 sí se muestra en canchas. El gate es un booleano
(`const canMapServices = vertical !== 'canchas'`) que decide si se renderiza toggle + chips + aviso.
El gate de catálogo vacío (Pitfall 6) es el análogo directo de `hasChipCatalog`.

#### b) Toggle de D-01

**Análogo:** `app/(dashboard)/web/_sections/section-forms.tsx:245-273` — `ToggleField`, botón
segmentado (no existe `switch.tsx` en `@/components/ui`).

```tsx
// Source: app/(dashboard)/web/_sections/section-forms.tsx:256-272 (verbatim)
<button
  type="button"
  role="switch"
  aria-checked={value}
  aria-pressed={value}
  onClick={() => onChange(!value)}
  className={cn(
    'inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    value
      ? 'bg-primary text-primary-foreground'
      : 'text-muted-foreground hover:text-foreground',
  )}
>
  {value ? 'Sí' : 'No'}
</button>
```

⚠ El handler **solo** hace `setPerFranja(v => !v)`. Un `setDayStates(... service_ids: [] ...)` adentro
del handler viola D-04 (Pitfall 5).

#### c) Estado de chips y colapso por franja

**Análogo:** `agenda-client.tsx:641-652` + `:740-753`. Aplican tal cual: la clave `${day}-${idx}`
alcanza (el alta no tiene consultorios).

```ts
// Source: app/(dashboard)/agenda/agenda-client.tsx:641-652 (verbatim)
const [expandedChips, setExpandedChips] = useState<Set<string>>(new Set())
function toggleChipsExpanded(day: number, idx: number) {
  setExpandedChips(prev => {
    const next = new Set(prev)
    const key = `${day}-${idx}`
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })
}
```

```ts
// Source: app/(dashboard)/agenda/agenda-client.tsx:740-753 (verbatim, salvo el setHoursDirty)
function toggleBlockService(day: number, idx: number, serviceId: string) {
  setHoursDirty(true)                      // ← el alta NO tiene este indicador: se omite esta línea
  setDayStates(prev => {
    const next = [...prev]
    const blocks = [...next[day].blocks]
    const current = blocks[idx].service_ids
    const service_ids = current.includes(serviceId)
      ? current.filter(id => id !== serviceId)
      : [...current, serviceId]
    blocks[idx] = { ...blocks[idx], service_ids }
    next[day] = { ...next[day], blocks }
    return next
  })
}
```

**Adaptación del modelo del alta:** `HourBlock` (`page.tsx:26-30`) hoy es
`{ start_time, end_time, error? }` — hay que sumarle `service_ids: string[]`, y `DEFAULT_DAY_STATES`
(`:39-45`) más `addBlock`/`toggleDay` tienen que inicializarlo en `[]`.

**Dónde va la línea de chips dentro del paso 4:** el molde es el mismo orden que el panel — inputs de
hora, después el `<p className="text-xs text-destructive">{b.error}</p>` (`page.tsx:863`), y los chips
**abajo de todo**. El render del bloque está en `page.tsx:830-864`.

#### d) Clave local de D-08 / D-09 — `crypto.randomUUID()` por servicio

**Precedentes in-repo del generador** (los tres verificados):

```ts
// Source: lib/landing/editor-upload.ts:58 (verbatim)
const uuid = globalThis.crypto.randomUUID()
```
```ts
// Source: app/api/google/connect/route.ts:20 (verbatim)
const state = crypto.randomUUID()
```
```ts
// Source: app/api/mercadopago/connect/route.ts:15
const state = crypto.randomUUID()
```

⚠ **Los tres precedentes son de tokens/paths, NO de PK.** Usar el uuid del cliente como `services.id`
es el **único patrón sin precedente in-repo de esta fase** (D-09 lo acepta explícitamente). Tres
consecuencias para el plan:

1. La forma `globalThis.crypto.randomUUID()` de `editor-upload.ts` es la preferible (A1: secure
   context).
2. El estado del paso 2 (`page.tsx:107`, `services`) pasa a nacer con `id`, y el render deja de usar
   `key={i}` (`page.tsx:696-698`) para usar `key={service.id}`.
3. **Fallback registrado** si el plan-check rechaza la PK-en-cliente — molde verbatim de
   `app/(dashboard)/settings/settings-client.tsx:1354-1356`:

```ts
const { data, error } = await supabase.from('services')
  .insert({ name, duration_minutes, price, location_ids: location_ids.length ? location_ids : null, capacity_mode, capacity, business_id: business.id })
  .select().single()
if (error) { toast.error('Error'); return }
```

#### e) Write path del submit — el RPC, no `time_blocks.insert`

**Análogo:** `app/(dashboard)/agenda/agenda-client.tsx:870-884` (`saveHours`).

```ts
// Source: app/(dashboard)/agenda/agenda-client.tsx:870-884 (verbatim)
const blocks = buildSaveHoursPayload(dayStates, { hasLocations: activeLocations.length > 0 })
const { data, error } = await supabase.rpc('save_agenda_blocks', {
  p_business_id: business.id,
  p_blocks: blocks,
})
if (error) {
  const reason = classifySaveHoursError(error)
  console.error('[agenda/save-hours] rechazo:', reason, error.code)
  if (reason === 'not_deployed') {
    console.error('[agenda/save-hours] la función de guardado de la agenda no está expuesta por PostgREST — verificar que la migración 074 esté aplicada y que se haya recargado el cache del schema')
  }
  toast.error(SAVE_HOURS_REJECT_COPY[reason])
  return
}
```

**Lo que reemplaza en el alta — el bloque a borrar (`page.tsx:376-390`, verbatim):**

```ts
const timeBlocksToInsert = dayStates.flatMap((ds, day) =>
  ds.enabled
    ? ds.blocks.map(b => ({
        business_id: business.id,
        day_of_week: day,
        start_time: b.start_time,
        end_time: b.end_time,
        label: null,
        location_id: null,
        capacity: 1,
      }))
    : []
)
if (timeBlocksToInsert.length > 0) {
  await supabase.from('time_blocks').insert(timeBlocksToInsert)
}
```

Se va con él el `capacity: 1` (cumple D-12 del milestone gratis) y el `await` sin chequeo de error.

**Payload:** `buildSaveHoursPayload(days, { hasLocations: false })` — en el alta siempre `false` (no
hay sedes), así que ningún bloque se descarta y todos van con `location_id: null`
(`lib/agenda-hours-payload.ts:161-183`). Los bloques del alta van **sin `id`** ⇒ el RPC los trata como
INSERT (`agenda-hours-payload.ts:177`: `id: block.id ?? null`).

**Manejo de error:** el clasificador y la copy ya existen (`agenda-client.tsx:433-456` y `:468-474`).
El planner decide si los extrae a un módulo compartido o escribe un manejo más chico; lo que **no**
puede hacer es un `toast.error(error.message)` (filtra nombres de tabla/constraint). En el alta,
`block_not_found` y `not_your_business` son inalcanzables.

**Criterio de fallo (Q3):** los horarios **no** son best-effort, pero **no se tira**: el negocio ya
existe y el alta no es re-entrante. Molde exacto del criterio "la copy dice la verdad completa":
`agenda-client.tsx:913-921` (el UPDATE de duración que falla después de un RPC exitoso).

**Precedente de best-effort del alta que NO aplica acá** (para contrastar — `page.tsx:344-348`):

```ts
} else {
  console.error('[onboarding/logo]', uploadErr.message)
}
```

**Prefijo de log de esta fase:** `[onboarding/agenda]` (C-06), en línea con
`[onboarding/logo]` (`page.tsx:345`) y `[onboarding/link-lead]` (`page.tsx:400`).

**Anti-tampering (C-02):** el `business_id` que viaja al RPC sale **siempre** de `business.id` de esta
sesión (`page.tsx:310-329`, `.select().single()` sobre `businesses`), jamás del estado del formulario.
Es el único punto que la nota de `secure-phase` de RESEARCH marca como verificable.

#### f) Aviso de D-07 (no bloqueante)

**Análogo del patrón de filas sintéticas:** `agenda-client.tsx:194-200` (ver arriba), extendido a toda
la grilla.

⚠ **Usar `hasScheduleCoverage`, NO `isServiceScheduled`** — corrección sobre `21-CONTEXT.md:82`/`:112`
(CR-01: con cero franjas `isServiceScheduled` da `false` para *todo* servicio, y en el alta cerrar los
7 días es un click).

```ts
// Firmas verbatim de lib/time-block-services.ts:111, :144, :249, :268
export function hasScheduleCoverage<T extends { id: string }>(serviceId: string, blocks: T[], bridge: TimeBlockService[]): boolean
```

El contrato D-16 (`lib/time-block-services.ts:21-24`) se cumple trivialmente: todas las filas son del
negocio que se está creando, y se pasa `business_id: ''`, igual que el panel.

**Copy:** anticipar la frase que el público ya muestra desde la Phase 20, para que el dueño reconozca
el efecto — `app/[slug]/booking-client.tsx:630`, verbatim: `'Sin horarios disponibles'`. Tono de
**consecuencia**, no de error de validación (`<specifics>` del CONTEXT).

#### g) Validación de horas — cerrar el hueco del `''` (Pitfall 3)

**Lo que hay hoy (`page.tsx:271-280`, verbatim del criterio):**

```ts
const blocks = ds.blocks.map(b => {
  if (b.end_time <= b.start_time) { valid = false; return { ...b, error: 'La hora fin debe ser mayor a la hora inicio' } }
  return { ...b, error: undefined }
})
```

**Análogo del fix:** `isValidBlockTime()` de `lib/agenda-hours-payload.ts:135`, ya importado por el
panel (`agenda-client.tsx:25`). Import de una línea, con suite propia.

#### h) Higiene del estado al borrar un servicio (Pitfall 7)

`removeService(i)` (`page.tsx:170-172`) filtra por índice y **no toca** los `service_ids` de los
bloques. Defensa en profundidad, las dos capas:

1. **UX:** limpiar el id borrado de todos los `service_ids` dentro de `removeService`.
2. **Backstop:** filtrar el payload contra el catálogo vigente antes de llamar al RPC
   (`.filter(id => idsVigentes.has(id))`).

Sin esto, la FK compuesta `tbs_service_same_tenant` rebota con `23503` y **revierte la agenda entera**
(el RPC es todo-o-nada).

---

### `test/onboarding-agenda-payload.test.ts` (test, transform) — NUEVO, opcional

**Análogo:** las suites puras del workstream (`test/agenda-save-blocks-rpc.test.ts`, las de
`lib/agenda-hours-payload.ts`). Vitest ya está configurado (`vitest.config.mts`, `npm test`).

Candidatos a testear **sin DB**, porque son funciones puras: el armado del payload desde `DayState[]` +
catálogo local, el filtro del Pitfall 7 (servicio borrado), la regla de D-10 (toggle apagado ⇒
`service_ids: []`) y el cálculo del aviso de D-07 con **cero franjas** (la guarda CR-01).

⚠ Un test del mapeo que pasa con **un solo servicio** no prueba nada (Pitfall 1 necesita ≥2).

---

## Patrones compartidos

### Aislamiento por tenant en la escritura (C-02)
**Fuente:** `app/(onboarding)/onboarding/page.tsx:310-329` (el `businesses.insert().select().single()`)
**Aplicar a:** todo insert/RPC del submit.
El `business_id` sale del negocio creado por **esta sesión**, nunca del formulario. El comentario que
ya lo declara (`page.tsx:379-381`) se conserva al reescribir el bloque.

### Cliente Supabase (C-03)
**Fuente:** `app/(onboarding)/onboarding/page.tsx:7` — `import { createClient } from '@/lib/supabase/client'`
**Aplicar a:** todo el write path del alta. **Jamás** service-role en el cliente; el único endpoint
service-role del alta es `slug-available` y no se toca.

### Logging de fallas (C-06)
**Fuente:** `app/(onboarding)/onboarding/page.tsx:345` y `agenda-client.tsx:878`
**Aplicar a:** el manejo de error del RPC.
Se loguea el **código**, nunca el mensaje crudo de Postgres:
`console.error('[onboarding/agenda]', agendaErr.code)`.

### Regla del comodín — fuente única (AGENDA-02)
**Fuente:** `lib/time-block-services.ts` (sin cambios en esta fase)
**Aplicar a:** el componente extraído y el aviso de D-07.
Prohibido escribir `serviceIds.length === 0` o un `.filter(r => r.time_block_id === …)` inline.

### Touch target y foco (C-07)
**Fuente:** `agenda-client.tsx:219` (`min-h-11 min-w-11` + `focus-visible:ring-2 focus-visible:ring-ring`)
y `section-forms.tsx:265-270`
**Aplicar a:** chips, disparador de colapso y toggle. No se puede perder al extraer.

### Feedback de acciones
**Fuente:** `sonner` (`toast.error` / `toast.success`), ya en los dos archivos
**Aplicar a:** el aviso de fallo del RPC. El aviso de D-07 **no** es un toast: es texto al pie del
paso, no bloqueante.

---

## Sin análogo

| Archivo / pieza | Rol | Flujo | Motivo |
|-----------------|-----|-------|--------|
| `services.id` generado en el cliente (D-09) | write path | request-response | **No hay precedente in-repo de PK generada en el cliente.** `crypto.randomUUID()` sí existe tres veces, pero siempre para tokens OAuth o paths de storage, nunca como clave primaria de una fila. Es el único patrón novel de la fase; fallback documentado arriba (§d). |
| Copy del toggle y del aviso | UI | — | Discreción de Claude por diseño. Límites: UI-SPEC de la Phase 19 + la frase pública `'Sin horarios disponibles'` (`booking-client.tsx:630`). |

---

## Metadata

**Alcance de la búsqueda de análogos:** `app/(dashboard)/agenda/`, `app/(onboarding)/onboarding/`,
`app/(dashboard)/web/_sections/`, `app/(dashboard)/settings/`, `lib/`, `app/[slug]/`.
**Archivos leídos:** 8 (todos git-tracked, verificados con `git ls-files`).
**Correcciones sobre documentos upstream halladas en esta sesión:**
1. `ServiceCatalogItem` **no** lo importa `agenda/page.tsx` — solo se usa dentro de
   `agenda-client.tsx` (afina A4 de RESEARCH.md; mover el tipo no rompe nada).
2. `BlockServicesLine` termina en `:373`, no en `:368` (el cierre del `</div>` y de la función).
3. `services.insert(...)` del submit está en `:356` y el bloque de `time_blocks.insert` en `:376-390`
   (drift de líneas respecto del CONTEXT, ya señalado por RESEARCH).

**Fecha de extracción de patrones:** 2026-09-11
