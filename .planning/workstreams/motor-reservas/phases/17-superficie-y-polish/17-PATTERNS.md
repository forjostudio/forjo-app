# Phase 17: Superficie y polish - Pattern Map

**Mapped:** 2026-08-20
**Files analyzed:** 3 (modified only — no new files, no new components fuera de los 2 autorizados por el UI-SPEC)
**Analogs found:** 6 / 6 líneas de código nuevas necesitan analog; todas tienen match exacto en el repo

> Este phase ya trae un `17-UI-SPEC.md` §10 "Moldes a reusar" muy completo, con file:line propios.
> Este documento **verificó cada cita** contra el código actual (2026-08-20) y las confirma casi todas
> exactas (offsets de 1-3 líneas por ediciones posteriores al UI-SPEC). Donde hay diferencia la señalo.
> No duplico lo que el UI-SPEC ya resuelve a nivel de tokens/spacing/color — esto es el mapa de
> **archivo origen → archivo destino** para el planner.

## File Classification

| Archivo a modificar | Rol | Data flow | Analog más cercano | Calidad de match |
|---|---|---|---|---|
| `app/(dashboard)/settings/settings-client.tsx` (`CapacityModeFields`, ~L215-300) | component (form fields) | request-response (config) | mismo archivo, bloque de aviso `--warning` ~L270-277 y toggles ~L253-260 | exact (in-file) |
| `app/(dashboard)/settings/settings-client.tsx` (diálogo editar servicio, ~L1803-1875) | component (dialog) | CRUD (update) | `components/ui/dialog.tsx` `DialogFooter` L106-118 | role-match, patrón documentado en UI-SPEC §3 |
| `app/(dashboard)/settings/settings-client.tsx` (tarjeta de servicio + `CapacityInlineControl` nuevo, ~L1730-1750) | component + **segundo path de escritura CRUD** | CRUD (update, `{ capacity }` only) | stepper de `agenda-client.tsx:781-800` (visual) + `saveEditService` `settings-client.tsx:775-813` (path de escritura) + `NumberField` de `section-forms.tsx:120-185` (lógica onBlur) | exact (composición de 3 analogs, ninguno solo) |
| `app/(dashboard)/settings/settings-client.tsx` (alta de servicio, botón `+` → `Agregar servicio`) | component (form submit) | CRUD (insert) | `saveHours` button pattern `agenda-client.tsx:843-846` (`disabled={saving}` + texto `Guardando…`) | role-match |
| `app/(dashboard)/agenda/agenda-client.tsx` (columna del día, ~L460-690) | component (calendar grid) | CRUD read + event-driven (click abre roster) | mismo archivo: `isSimultaneous`/badge `N/M lleno` L637-656 | exact (in-file, es la mitad que ya existe) |
| `app/(dashboard)/finances/finances-client.tsx` (~L890) | component (list row) | CRUD read | mismo patrón, es solo CSS (`hidden sm:block` → segunda línea) | trivial, sin analog externo necesario |

## Pattern Assignments

### 1. `CapacityInlineControl` (nuevo, vive en `settings-client.tsx`)

**Analog 1 — visual del stepper:** `app/(dashboard)/agenda/agenda-client.tsx:781-800` (stepper de cupo
por bloque, ya verificado byte a byte contra el repo actual):

```tsx
<div className="flex shrink-0 items-center overflow-hidden rounded-md border border-border" title="Cupo (lugares por bloque)">
  <button type="button" aria-label="Menos cupo" disabled={block.capacity <= 1}
    onClick={() => updateBlock(day, idx, 'capacity', Math.max(1, block.capacity - 1))}
    className="flex h-8 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-30">
    <Minus className="h-3 w-3" />
  </button>
  <input type="number" min={1} value={block.capacity} onFocus={e => e.target.select()}
    onChange={e => updateBlock(day, idx, 'capacity', Math.max(1, Math.floor(Number(e.target.value) || 1)))}
    className="h-8 w-9 border-x border-border bg-transparent text-center text-sm tabular-nums outline-none focus:bg-secondary/50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    aria-label="Cupo (lugares por bloque)" />
  <button type="button" aria-label="Más cupo" onClick={() => updateBlock(day, idx, 'capacity', block.capacity + 1)}
    className="flex h-8 w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
    <Plus className="h-3 w-3" />
  </button>
</div>
```

**Copiar:** el contenedor `overflow-hidden rounded-md border`, el `disabled:pointer-events-none
disabled:opacity-30` en el piso, los spinners nativos ocultos. **NO copiar:** el `onChange` que
normaliza en cada tecla — ese es exactamente el bug D-06 que esta fase corrige (`min` fijo en vez del
piso por modo, y `Math.max` en `onChange` en vez de `onBlur`).

**Analog 2 — la lógica de `onBlur` (D-06), literal:** `app/(dashboard)/web/_sections/section-forms.tsx:120-185`
(`NumberField`), ya leído completo. El patrón exacto a portar:

```tsx
const [text, setText] = useState(String(value))
// onChange: solo escribe al estado real si el string parsea a número finito; si está vacío, no toca `onChange`.
onChange={(e) => {
  const raw = e.target.value
  setText(raw)
  if (raw.trim() === '') return
  const n = Number(raw)
  if (Number.isFinite(n)) onChange(clamp(n))
}}
// onBlur: normaliza lo que quedó tipeado; vacío/basura → vuelve al valor vigente.
onBlur={() => {
  const n = Number(text)
  commit(Number.isFinite(n) && text.trim() !== '' ? n : value)
}}
```

**Trampa:** `NumberField` clampa con `min`/`max` fijos pasados por prop. `CapacityInlineControl` tiene
que clampar con `minCapacityFor(mode)` (función ya existente, `settings-client.tsx:135`), no con un
`min` estático — el piso cambia según si el servicio es `group_class`/`simultaneous_resource`.
`MAX_CAPACITY = 99` (`settings-client.tsx:145`) es el techo en los dos casos.

**Analog 3 — el segundo path de escritura, `saveEditService`:** `settings-client.tsx:775-813`
(verificado completo). Patrón a replicar en el nuevo `saveCapacityInline(serviceId)`:

- `.update(payload).eq('id', ...).eq('business_id', business.id)` — defensa en profundidad (línea ~789).
- Mapeo de error: `if (error.code === 'P0001' && error.message?.includes('service_mode_has_future_appointments'))`
  → **reusar la MISMA cadena de copy ya escrita en L809** (`'No se puede cambiar cómo se ocupa el
  cupo: quedan turnos por delante o un abono activo. Cancelá los turnos y dá de baja el abono...'`).
  Por §1.5 del UI-SPEC este código no debería llegar nunca desde la tarjeta (D-09: no se manda
  `capacity_mode`) — si llega, es fail-safe, no camino feliz.
- Error genérico → `toast.error(...)`, copy fija nueva del UI-SPEC §7.3 (`'No pudimos guardar el cupo...'`),
  **nunca interpolar `error.message`** (T-14-25/T-13-09, marcado explícito en el comentario de L797 del
  analog: *"la copy es PROPIA y fija: NUNCA se interpola error.message"*).
- Éxito: `setServices(prev => prev.map(s => s.id === ... ? { ...s, ...payload } : s))` (mismo patrón de
  actualización optimista local post-confirmación, L807) + `toast.success('Cupo actualizado')`.
- **Payload:** a diferencia de `saveEditService` (que manda `capacity_mode` siempre), el path inline
  manda **solo `{ capacity }`** — decisión medida y documentada en UI-SPEC §1.5, no un descuido.
- **Estado de guardado por tarjeta:** `saveEditService` usa un único `savingEditSvc` boolean porque solo
  hay un diálogo abierto a la vez. El nuevo path **no puede copiar ese shape**: necesita
  `savingCapacityId: string | null` (o un `Set<string>`) porque varias tarjetas están en pantalla
  simultáneamente. Este es el único punto donde el analog NO alcanza tal cual — flagged también en el
  UI-SPEC §1.4③.

**La tarjeta origen a modificar:** `settings-client.tsx:1730-1746` (bloque `<p className="text-xs
text-muted-foreground">{s.duration_minutes}min · ...} </p>`, línea de datos exacta verificada). Se
convierte en el `<div className="flex flex-wrap items-center gap-x-2 gap-y-1 ...">` del UI-SPEC §1.1.
El pill "Sin cobertura" está en `L1737-1741` (`inline-flex items-center gap-1 ... border-warning/30
bg-warning/10 ... TriangleAlert`) — **ese es el registro de alarma que D-07 dice NO copiar** para el
badge de modo (que es un dato, no una advertencia).

### 2. Bloque explicativo + radiogroup realineado (D-01/D-02/D-13)

**Analog — aviso `--warning` ya en pantalla:** `settings-client.tsx:270-277` (bloque de aviso de
espacio compartido, mencionado en CONTEXT D-13, no releído línea por línea porque el UI-SPEC ya lo cita
igual y no cambia de forma — solo se reutiliza el mismo patrón `flex items-start gap-1.5 text-xs
text-warning` + `TriangleAlert`).

**Analog — toggles de modo activo:** `settings-client.tsx:253-260` (verificado: el `onClick` de cada
opción manda `{ capacity_mode: o.key, capacity: ... }` — confirma D-02, que tocar cualquier toggle
YA escribe en el form, por eso el explicador de las 3 capas no puede vivir detrás de un click).
Cambia de `inline-flex flex-wrap gap-1` a `grid grid-cols-1 sm:grid-cols-3` (D-13) — ver UI-SPEC §2.1
para las clases exactas, ya completas.

**Trampa:** el UI-SPEC dice explícitamente "**Solo se realinea este bloque**. El grupo 'Se ofrece en'
queda como está" — no tocar el otro `flex-wrap` group aunque comparta clase base.

### 3. Diálogo alto — scroll interno + footer anclado

**Analog — `DialogFooter`:** `components/ui/dialog.tsx:106-118` (verificado completo):

```tsx
function DialogFooter({ className, showCloseButton = false, children, ...props }) {
  return (
    <div data-slot="dialog-footer"
      className={cn("-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end", className)}
      {...props} />
  )
}
```

Ya trae `border-t bg-muted/50` y bleed `-mx-4 -mb-4` — exactamente lo que D-05 necesita para el footer
anclado. **No tocar este componente base** (UI-SPEC lo dice explícito): el patrón se aplica por
caller con clases sobre `DialogContent`, ver receta completa en UI-SPEC §3.1 (ya prescriptiva, no hace
falta repetirla acá).

**Dónde aplica:** el diálogo "Editar servicio", `settings-client.tsx:1803` (`<CapacityModeFields` dentro)
hasta `:1870` (botón `Guardar` hoy suelto como último hijo de `DialogContent`, confirmado). Ese botón
pasa a vivir dentro de `<DialogFooter>`.

**No-analog explícito (anotar, no tocar):** "Copiar horario" (`agenda-client.tsx:1130`) y el roster
desktop (`agenda-client.tsx:1110`) tienen el mismo problema de overflow potencial pero quedan **fuera
de esta fase** — el UI-SPEC ya lo anota como precedente a migrar después.

### 4. Columna del día — slot grupal colapsado + `OccupancyBadge`

**Analog — el badge que ya existe, para el modo `simultaneous_resource`:**
`agenda-client.tsx:637-656` (verificado completo, `isSimultaneous`, `overlapFull`, el `Badge` con
`h-4 gap-0.5 ... text-[9px] ... border-warning/30 bg-warning/10 text-warning`, icono `Users
size-2.5!`). Este es el molde literal a extraer como `OccupancyBadge` — **hoy solo lo consume el
recurso simultáneo y solo cuando está lleno**; el componente extraído lo consumen los dos modos y
siempre visible para `group_class` (D-10).

**Fuente de datos — CONFIRMADO, no data-flow change:** `app/(dashboard)/agenda/page.tsx:48` hace
`supabase.from('services').select('*').eq('business_id', business.id).eq('active', true)` — **ya trae
`capacity` y `capacity_mode` completos**. `serviceById` (`agenda-client.tsx:482`,
`new Map(services.map(s => [s.id, s]))`) ya tiene todo lo necesario. **No hace falta ampliar ningún
`select` de `page.tsx`** — el planner puede descartar esa preocupación del CONTEXT.

**A eliminar, confirmado con line numbers reales (offset de ~1-2 líneas vs. lo citado en CONTEXT):**
- `capacityFor` — `agenda-client.tsx:467` (el `useCallback` completo, calcula sobre `time_blocks`).
- `isGroup` — `agenda-client.tsx:638`: `const isGroup = !isSimultaneous && capacityFor(ds, a.time) > 1`.
  Reemplaza por `serviceById.get(a.service_id)?.capacity_mode === 'group_class'`, mismo patrón que
  `isSimultaneous` en la línea de arriba (`:637`), que YA lee el modo en vez de deducirlo — es el
  molde correcto a copiar, a un renglón de distancia del que hay que borrar.
- El roster (`rosterSlot`/`useMemo` de enrollees, `:530-537`) también usa `capacityFor` en su `return`
  (`capacity: capacityFor(date, time)`) — cambia a `services.capacity` también ahí.

**Agrupación por slot:** hoy el `return isGroup ? <button onClick={() => setRosterSlot({date, time})}>`
(`:666-670`, verificado) ya abre el roster por chip individual. D-10 pide agrupar por
`date|time|service_id` en **una sola fila** en vez de un `<button>` por turno — es cambio de
estructura del `.map`, no solo de estilo, tal como el CONTEXT ya lo marca en mayúsculas.

### 5. Finanzas mobile

**No hay analog externo que copiar — es edición trivial, in-place.** La fila hoy
(`finances-client.tsx:886-895`, confirmado): `<span className="text-muted-foreground hidden sm:block
truncate max-w-32">{apptServiceName(appt, '')}</span>` dentro de un `<div className="flex items-center
gap-3 ...">`. Pasa a una segunda línea dentro del contenedor del nombre del cliente
(`<span className="flex-1 truncate font-medium">{appt.client_name}</span>` dos líneas arriba, mismo
bloque) — el patrón exacto ya está prescriptivo en UI-SPEC §6, sin necesitar otro analog del repo.

## Shared Patterns

### Anti-tampering de tenant en el segundo write path
**Fuente:** `settings-client.tsx:789` (`saveEditService`) — `.update(...).eq('id', editSvc.id).eq('business_id', business.id)`.
**Aplica a:** el nuevo `saveCapacityInline`. Sin este `.eq('business_id', ...)` el UPDATE confía
en RLS como única capa — el repo pide las dos.

### Copy del rechazo del gate — cadena única, no reescribir
**Fuente:** `settings-client.tsx:809` (la cadena completa post-WR-02 de la Phase 16).
**Aplica a:** cualquier código que capture `service_mode_has_future_appointments` en esta fase.
**Regla dura (T-14-25/T-13-09):** nunca interpolar `error.message` ni el nombre del servicio.

### Toast (sonner)
**Fuente:** ya en uso en todo `settings-client.tsx` (`toast.success`/`toast.error`, import ya presente).
**Aplica a:** los 3 toasts nuevos de esta fase (`'Cupo actualizado'`, error genérico, `'Servicio agregado'`).

### Estado "guardando" con texto que cambia
**Fuente:** `saveHours` button, `agenda-client.tsx:843-846` — `disabled={savingHours}` + texto
`{savingHours ? 'Guardando...' : 'Guardar horarios'}`. Y `saveEditService`'s button en
`settings-client.tsx:1870`.
**Aplica a:** el botón inline (`Guardando…`) y el botón de alta (`Agregando…`).

## No Analog Found / requiere composición nueva

| Elemento | Rol | Por qué no hay un analog 1:1 | Riesgo a vigilar |
|---|---|---|---|
| `CapacityInlineControl` como conjunto (badge + stepper + guardar en una línea de 12px) | component nuevo | Es la combinación de 3 patrones existentes (stepper visual + onBlur logic + write path) que nunca convivieron en un solo control; el propio UI-SPEC lo llama "la pieza de más riesgo de la fase" | Estado de guardado **por tarjeta** (no existe un precedente de estado-por-fila-en-lista en este repo; todos los `saving*` existentes son singleton) |
| `OccupancyBadge` como componente extraído y compartido | extracción/refactor | Hoy el badge vive inline en el JSX de un solo lugar (`agenda-client.tsx:648-655`); extraerlo a función/componente reusable no tiene precedente de extracción similar en este archivo | Verificar que el segundo modo ("sin seña") no rompa el ancho fijo de la fila de grupo |
| Agrupación de chips por `date|time|service_id` en la columna del día | cambio de estructura de datos derivados, no de estilo | No hay agrupación por slot en el repo hoy — cada turno es su propio `.map` item | El `roster` y el `setRosterSlot` deben pasar a llevar `service_id`, tocando también el título/roster dialog (`agenda-client.tsx:1109-1127`) |

## Metadata

**Analog search scope:** `app/(dashboard)/settings/settings-client.tsx`,
`app/(dashboard)/agenda/agenda-client.tsx`, `app/(dashboard)/agenda/page.tsx`,
`app/(dashboard)/finances/finances-client.tsx`, `app/(dashboard)/web/_sections/section-forms.tsx`,
`components/ui/dialog.tsx`.
**Files scanned:** 6 (todos leídos con `grep -n` dirigido + lectura de rango puntual, sin re-lecturas
de rangos ya vistos).
**Pattern extraction date:** 2026-08-20.
**Verificación:** todas las citas de `17-UI-SPEC.md` §10 fueron re-chequeadas contra el código actual;
coinciden con offset de 1-3 líneas (drift normal desde que se escribió el spec el mismo día). El único
hallazgo nuevo respecto al UI-SPEC/CONTEXT: **`agenda/page.tsx:48` ya usa `select('*')` sobre
`services`**, así que la preocupación del CONTEXT sobre "¿hay que ampliar el select?" queda **resuelta
= NO hace falta tocar `page.tsx`**.
