---
phase: 17-superficie-y-polish
reviewed: 2026-08-24T19:15:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - app/(dashboard)/settings/settings-client.tsx
  - app/(dashboard)/agenda/agenda-client.tsx
  - app/(dashboard)/finances/finances-client.tsx
  - lib/agenda-occupancy.ts
  - test/agenda-occupancy.test.ts
findings:
  critical: 1
  warning: 8
  info: 8
  total: 17
status: issues_found
---

# Phase 17: Code Review Report

**Reviewed:** 2026-08-24
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Se revisaron los cinco archivos de código de la fase con el diff completo `c07e3da..11cd8c9`, contra
el motor real (`book_slot_atomic` en las migraciones 068/069) y contra el read-path público
(`app/api/booking/availability/route.ts`), no solo contra sí mismos.

Estado de las herramientas: `./node_modules/.bin/tsc --noEmit` sale 0; `npx vitest run
test/agenda-occupancy.test.ts` da 20/20; `eslint` sobre los cinco archivos deja **dos hallazgos
NUEVOS** de esta fase (settings 329 y 643) sobre 13 pre-existentes.

El hallazgo central es de lógica, no de layout, y está **reproducido**: `lib/agenda-occupancy.ts`
decide la ocupación con una clave (`date|time|service_id`) que **no es la que usa el motor**
(`business|bucket|date|time`, donde bucket = `COALESCE(professional_id, sentinel)`). El módulo ni
siquiera recibe `professional_id` — la query de `agenda/page.tsx:37` no lo trae —, así que la
divergencia no es un olvido puntual sino estructural. En un negocio multi-staff el panel colapsa dos
clases de dos agendas distintas en UNA fila y muestra un contador imposible ("9/6 lleno") sobre
horarios que la página pública sigue ofreciendo, con el roster de las dos agendas mezclado: exactamente
el defecto que D-10 cerró en el eje del servicio, abierto en el eje de la agenda.

El segundo bloque de hallazgos está donde el brief lo anticipaba: `settings-client.tsx` absorbió seis
planes y ahí aparecen los defectos de edición acumulada — un estado de guardado global que se cruza
entre tarjetas, un `UPDATE` sin verificar filas afectadas (el propio archivo documenta el patrón
correcto tres funciones más arriba, en `deleteService`) e ids de DOM duplicados que rompen justo el
canal de accesibilidad que D-02 existe para preservar.

Lo verificado y que SÍ se sostiene: el filtro por tenant y el payload de una sola clave de
`saveCapacityInline`, la copy propia del rechazo del gate (nunca se interpola `error.message`), el
label de modo inerte de D-09, y la invariante D-06 del modal (`capacityFocusedRef`) — se trazaron los
tres caminos (tipeo, stepper, cambio de modo que sube al piso) y ninguno resincroniza bajo el cursor.

---

## Critical Issues

### CR-01: la clave de agrupamiento del panel no es la clave de conteo del motor — contador falso y roster cruzado entre agendas

**File:** `lib/agenda-occupancy.ts:147` (`const key = \`${a.date}|${time}|${a.service_id}\``) · `app/(dashboard)/agenda/page.tsx:37` (el `select` que no trae `professional_id`) · `app/(dashboard)/agenda/agenda-client.tsx:677-720` (la fila que lo pinta)
**Estado:** **REPRODUCIDO** (script sobre el módulo puro, salida abajo).

**Issue:**
El motor cuenta los lugares de un `group_class` por **bucket de agenda**:

```sql
-- migr. 069:451 (rama individual + group_class de book_slot_atomic)
SELECT count(*) INTO v_occupied FROM appointments a
WHERE a.business_id = p_business_id
  AND COALESCE(a.professional_id, '000...000'::uuid) = v_bucket   -- ← POR AGENDA
  AND a.date = p_date AND a.time = p_time
  AND a.status IN ('confirmed','pending_payment');                -- ← SIN service_id
```

`availability` (`app/api/booking/availability/route.ts:455-458`) usa el mismo eje: `live` está
filtrado por `bucket` y `full` compara ese conteo contra `services.capacity`.

`buildDayEntries` usa el eje **opuesto**: agrupa por servicio y **suma todas las agendas**. Como el
tipo `OccupancyAppt` no tiene `professional_id` y la query del server tampoco lo trae, la distinción
es imposible de hacer aguas abajo.

Reproducción (misma clase grupal de cupo 6, dictada por dos profesionales a las 09:00 — 6 inscriptos
en la agenda A, 3 en la B):

```
entradas: 1
  fila grupal 2026-08-25|09:00|yoga -> 9/6 (miembros: 9) => BADGE "lleno"
motor/availability: agenda A 6/6 LLENA, agenda B 3/6 con 3 lugares libres
```

Tres consecuencias, todas de cara al dueño:
1. El contador miente en la dirección peligrosa: dice **"lleno"** sobre un horario que la página
   pública sigue vendiendo (es el precedente CR-01 de la Phase 12, reabierto por otra puerta).
2. Muestra `9/6`, un número que no puede existir, o sea que la fila queda sin lectura posible.
3. El roster de una agenda lista a los inscriptos de la otra — el mismo daño que T-17-18 describe
   para el eje del servicio y que la suite congela en el caso 4.

**Corolario en el eje inverso** (nuevo, sobre el ítem ya trackeado del `seat` sin `service_id`): dos
servicios grupales distintos en la **misma** agenda y hora ahora se muestran como dos filas con dos
contadores independientes (`Yoga 5/6` y `Pilates 3/4`, también reproducido), mientras el motor
computa `v_occupied = 8` para ese bucket y rechaza las dos con `slot_full`. Antes de esta fase el
panel no afirmaba nada sobre cuántos lugares quedaban; ahora afirma un número que el motor contradice.

**Fix:** el módulo tiene que contar por el mismo eje que el motor. Mínimo:

```ts
// lib/agenda-occupancy.ts
export type OccupancyAppt = {
  // ...
  /** Bucket de agenda: COALESCE(professional_id, sentinel), byte-idéntico al del RPC. */
  professional_id?: string | null
}

const SENTINEL = '00000000-0000-0000-0000-000000000000'
const bucket = a.professional_id ?? SENTINEL
const key = `${a.date}|${time}|${bucket}|${a.service_id}`   // una fila por AGENDA
```

y agregar `professional_id` al `select` de `app/(dashboard)/agenda/page.tsx:37`. La fila debe además
rotular la agenda cuando hay ≥2 profesionales (si no, dos filas idénticas a la misma hora son
indistinguibles). Si se decide NO tocar el data flow en esta fase, la alternativa honesta es **no
mostrar el contador** cuando el negocio tiene más de una agenda activa: un número ausente es
recuperable, uno falso no. Sumar el caso a la suite como discriminante (dos buckets, mismo servicio y
hora ⇒ dos entradas).

---

## Warnings

### WR-01: `saveCapacityInline` canta éxito sin verificar que haya escrito una fila

**File:** `app/(dashboard)/settings/settings-client.tsx:1297-1316`
**Estado:** razonado sobre el código (mismo patrón que el archivo ya documenta como trampa).

**Issue:** un `UPDATE` de PostgREST que no matchea ninguna fila —RLS que filtra, id que ya no existe,
fila borrada en otra pestaña— vuelve con `error: null` y cero filas. Este camino no lo distingue:
emite `toast.success('Cupo actualizado')`, escribe el número en `services` local y el control se
resincroniza sobre un valor que la base no tiene. El dueño queda creyendo que la clase tiene 6 lugares
hasta que recargue. El propio archivo escribe el patrón correcto 140 líneas más arriba:

> `.select('id')` tampoco es cosmético: si la RLS filtra la fila, el DELETE vuelve sin error y con 0
> filas — sin eso diríamos "Servicio eliminado" sin haber borrado nada. (`deleteService`, línea ~1174)

**Fix:**
```ts
const { data, error } = await supabase.from('services')
  .update({ capacity }).eq('id', svc.id).eq('business_id', business.id)
  .select('id')
// ...mapeo de error existente...
if (!data || data.length === 0) {
  toast.error('No pudimos guardar el cupo. Volvimos al valor anterior. Intentá de nuevo.')
  return false
}
```

### WR-02: `savingCapacityId` es global, no por tarjeta — dos guardados inline se pisan

**File:** `app/(dashboard)/settings/settings-client.tsx:1228, 1285, 1298`
**Estado:** razonado, trazado paso a paso.

**Issue:** el comentario afirma «`savingCapacityId` se prende con el id de ESTE servicio y se apaga en
TODAS las salidas: una tarjeta = un request en vuelo». El estado es **uno solo para toda la lista**, y
como el botón de cada tarjeta solo se deshabilita con `savingCapacityId === s.id`, nada impide dos
guardados simultáneos. Secuencia: Guardar en A → `savingCapacityId='A'`; Guardar en B (habilitado) →
`'B'`; vuelve A → `setSavingCapacityId(null)` → **B queda sin spinner, con su Guardar y su stepper
re-habilitados con el request todavía en vuelo**. De ahí salen dos daños: doble submit sobre B, y —
peor — si el dueño toca `+` mientras B viaja, cuando B confirma el efecto de resincronización
(línea 642) le pisa la edición nueva con el valor viejo, sin ningún aviso.

**Fix:** que el estado sea un conjunto, o guardar el flag adentro de cada tarjeta:
```ts
const [savingCapacityIds, setSavingCapacityIds] = useState<Set<string>>(new Set())
// prender: setSavingCapacityIds(p => new Set(p).add(svc.id))
// apagar : setSavingCapacityIds(p => { const n = new Set(p); n.delete(svc.id); return n })
// card   : saving={savingCapacityIds.has(s.id)}
```

### WR-03: ids `cap-mode-help-*` duplicados en el DOM — el `aria-describedby` del diálogo apunta al formulario de alta

**File:** `app/(dashboard)/settings/settings-client.tsx:437` y `:502`, instanciado en `:2374` (alta) y `:2451` (diálogo de edición)
**Estado:** razonado sobre el árbol de render (los dos `CapacityModeFields` conviven montados).

**Issue:** los ids del bloque explicativo son literales, y `CapacityModeFields` se renderiza **dos
veces en la misma pantalla**: en la tarjeta "Agregar servicio" y adentro del `Dialog` de edición
(Radix portalea el diálogo pero **no desmonta la página de atrás**). Con el diálogo abierto hay dos
`#cap-mode-help-individual`, dos `#cap-mode-help-group_class` y dos `#cap-mode-help-simultaneous_resource`.
`aria-describedby` resuelve al **primero** del documento, o sea al del formulario de alta: quien usa
lector de pantalla dentro del diálogo escucha el estado del OTRO formulario (qué modo está expandido
allá, con su ejemplo y su advertencia). Justamente el canal que D-02 construyó para poder comparar los
tres modos **sin activarlos** —y el `sr-only` que `secure-phase` dio por bueno— queda leyendo la
instancia equivocada. Además es HTML inválido.

**Fix:** namespacear por instancia con `useId()`:
```ts
const uid = useId()
// botón:  aria-describedby={`${uid}-help-${o.key}`}
// bloque: id={`${uid}-help-${h.key}`}
```

### WR-04: el roster muestra el valor crudo de la base ("completed", "pending") como estado del inscripto

**File:** `app/(dashboard)/agenda/agenda-client.tsx:1195` (`{statusLabel(a.status)}`) · `lib/agenda-occupancy.ts:75-77` (`appts` = TODOS los miembros)
**Estado:** razonado, con la ruta de escritura confirmada (`appointments-client.tsx:81`, botón "Marcar completado").

**Issue:** hasta esta fase el roster filtraba por `OCCUPYING_STATUSES`, así que `statusLabel` solo veía
`confirmed` y `pending_payment` y su rama de fallback (`return status`) era **inalcanzable**. Ahora la
entrada de grupo lleva TODOS los miembros (decisión correcta para no perder gente al colapsar), y con
eso el fallback se volvió alcanzable: un turno marcado desde Turnos aparece en el roster con un chip
que dice literalmente `completed`, y uno legacy con el default de la columna dice `pending`. Valores de
base de datos, en inglés, en una interfaz que está toda en español. La cobertura de `statusChip` tiene
el mismo agujero: cae en el gris neutro para todo lo que no sea confirmado o seña pendiente.

**Fix:** completar el mapa (el diccionario ya existe en `appointments-client.tsx:26`, conviene una sola
fuente):
```ts
function statusLabel(status: string): string {
  if (status === 'confirmed') return 'Confirmado'
  if (status === 'pending_payment') return 'Seña pendiente'
  if (status === 'completed') return 'Completado'
  if (status === 'cancelled') return 'Cancelado'
  if (status === 'pending') return 'Pendiente'
  return 'Otro'   // nunca el valor crudo de la DB
}
```

### WR-05: una clase pasada con todos los turnos "Completado" se pinta como cancelada y con 0/N

**File:** `app/(dashboard)/agenda/agenda-client.tsx:691` (`statusChip(entry.occupied > 0 ? 'confirmed' : 'cancelled')`) · congelado por el caso 11 de la suite
**Estado:** razonado; la vista semanal arranca en `startOfWeek` (`agenda/page.tsx:26`), así que siempre muestra días ya pasados de la semana en curso.

**Issue:** el estado de la fila grupal se colapsa a un booleano derivado de la ocupación **actual**.
`completed` no ocupa lugar (correcto, espeja el motor), así que una clase de 6 personas dictada el
lunes, con sus seis turnos marcados como completados, el miércoles se ve como **una fila gris con
"0/6"** — el mismo tratamiento visual que un slot cancelado, y sin los nombres que antes se leían en
los seis chips. La lectura que se lleva el dueño ("no vino nadie / se canceló") es la opuesta a lo que
pasó. Antes de esta fase los seis chips seguían ahí con su nombre y su color.

**Fix:** derivar el estado de la fila de los miembros, no del contador, y no reusar el chip de
cancelado como "otro":
```ts
const anyLive   = entry.appts.some(a => OCCUPYING_STATUSES.includes(a.status))
const allClosed = !anyLive && entry.appts.every(a => a.status === 'completed')
statusChip(anyLive ? 'confirmed' : allClosed ? 'completed' : 'cancelled')
```
y, para un slot cerrado, mostrar `{entry.appts.length} asistieron` en vez de `0/N` (o suprimir el
badge de ocupación, que ya no responde ninguna pregunta útil sobre un horario pasado).

### WR-06: el cupo inline se puede bajar por debajo de los lugares ya ocupados, sin aviso

**File:** `app/(dashboard)/settings/settings-client.tsx:1282-1318` (`saveCapacityInline`) · efecto visible en `agenda-client.tsx:691-712`
**Estado:** razonado; verificado que ningún gate lo impide (el trigger `services_block_mode_change_trg` es `BEFORE UPDATE OF capacity_mode` y hace `RETURN NEW` cuando el modo no cambia — migr. 068:244).

**Issue:** POLISH-08 vuelve trivial (dos toques desde la tarjeta) una operación que antes exigía abrir
el diálogo: bajar `services.capacity`. Nada valida el número contra las inscripciones vivas — ni el
panel, ni el CHECK (que solo mira el piso del modo), ni el trigger. Bajar una clase de 9 a 6 con 9
inscriptos deja la agenda mostrando `9/6 lleno` (números imposibles, ver CR-01) y al motor rechazando
toda reserva nueva con `slot_full`, sin que nadie le haya dicho al dueño qué acaba de hacer. Es la
interacción directa entre los dos entregables centrales de la fase y no está cubierta por ninguna de
las cuatro rondas de UAT.

**Fix:** el panel ya tiene los turnos futuros a mano en otras superficies; como mínimo, confirmar antes
de escribir cuando el cupo nuevo es menor que el máximo de ocupación futura de ese servicio ("Hay un
horario con 9 inscriptos. Bajar el cupo a 6 no cancela a nadie, pero la clase va a figurar llena y no
vas a poder tomar reservas nuevas hasta que baje a 6."). Alternativa mínima y barata: acotar el badge a
`Math.min(occupied, capacity)` **no** sirve —esconde el problema—; el aviso tiene que estar en la
escritura.

### WR-07: `saveCapacityInline` no tiene `try/finally` — un rechazo deja la tarjeta congelada en "Guardando…"

**File:** `app/(dashboard)/settings/settings-client.tsx:1285-1318` y `:665-673` (`handleSave`)
**Estado:** razonado. Probabilidad baja (supabase-js normalmente devuelve el error en vez de tirarlo), impacto alto y costo de arreglo nulo.

**Issue:** si la promesa se rechaza en vez de resolver con `{ error }`, `setSavingCapacityId(null)`
nunca corre: el stepper y el botón de esa tarjeta quedan deshabilitados **hasta recargar la página**, y
`handleSave` tampoco atrapa nada, así que la excepción sube al handler de React sin ningún feedback.
La misma fase escribió el criterio contrario en la función de al lado:

> `finally` y no una línea antes de cada `return`: el early return por error del INSERT y cualquier
> excepción de red tienen que devolver el botón, o el alta queda muerta hasta recargar. (`addService`)

**Fix:** envolver el cuerpo en `try { ... } finally { setSavingCapacityId(null) }` y devolver `false`
en el `catch`, más un `try/catch` en `handleSave` que llame a `revert()`.

### WR-08: el rechazo del guardado inline se comunica solo por color (y `aria-invalid` no aplica a `role="group"`)

**File:** `app/(dashboard)/settings/settings-client.tsx:326-330`
**Estado:** **REPRODUCIDO** por `eslint` (hallazgo NUEVO de esta fase):
`326:5 warning The attribute aria-invalid is not supported by the role group — jsx-a11y/role-supports-aria-props`.

**Issue:** cuando la base rechaza, el estado `rejected` sobrevive 4 s y se expresa en dos canales:
`border-destructive` (color puro) y `aria-invalid` sobre un `<span role="group">`, atributo que ese rol
**no soporta** y que los lectores de pantalla ignoran. El tercer canal, el toast, dura menos y no está
asociado al control. Resultado: para quien no distingue el rojo, o para quien usa lector de pantalla,
el rechazo es invisible en el elemento que falló — y el número ya volvió solo a su valor anterior
(`revert()` corre antes de marcar), o sea que tampoco queda rastro en el dato. El propio código de esta
fase escribe la regla que acá se rompe: «El color NUNCA es el único portador» (`OccupancyBadge`,
`agenda-client.tsx:82`).

**Fix:** mover el estado inválido al `<input>` (`aria-invalid` sí es válido ahí) y sumar un texto:
```tsx
<input aria-invalid={invalid || undefined} aria-describedby={invalid ? errId : undefined} ... />
{invalid && <span id={errId} role="status" className="text-xs text-destructive">No se guardó</span>}
```

---

## Info

### IN-01: `apptServiceName` se llama dos veces por fila, contra lo que dice su propio comentario

**File:** `app/(dashboard)/finances/finances-client.tsx:889` y `:903`
**Issue:** el comentario dice «el nombre del servicio, **una sola vez** y desde el helper compartido»,
pero la columna de desktop sigue llamando `apptServiceName(appt, '')` en línea en vez de usar `svc`.
No cambia el comportamiento (mismo helper, mismos argumentos), pero el comentario ya no describe el
código, que es la clase de deriva que el resto del archivo evita con cuidado.
**Fix:** `<span ...>{svc}</span>` en la línea 903.

### IN-02: rama muerta — "Sin inscriptos aún." es inalcanzable

**File:** `app/(dashboard)/agenda/agenda-client.tsx:1176-1177`
**Issue:** una entrada `group` solo existe si tuvo al menos un miembro (`buildDayEntries` la crea
dentro del bucle, con el turno en la mano), y `enrollees` ya no filtra por estado. `roster.enrollees.length === 0`
no puede darse. Antes de la fase sí podía (el filtro por `OCCUPYING_STATUSES` podía vaciar la lista).
**Fix:** borrar la rama, o dejar escrito por qué se conserva.

### IN-03: el alta de servicio puede mandar `NaN` en `duration_minutes` / `price`

**File:** `app/(dashboard)/settings/settings-client.tsx:2367` y `:2371`
**Issue:** pre-existente, pero vive en el bloque que 17-02 reestructuró y que ahora tiene su propio
botón de confirmación. `parseInt(e.target.value)` sin `|| 0` (el diálogo de edición SÍ lo tiene, líneas
2444/2448): vaciar "Min." o "Precio" deja `NaN` en el estado, `JSON.stringify` lo serializa como `null`
y las dos columnas son `NOT NULL` ⇒ el INSERT rebota con 23502 y el dueño ve `toast.error('Error')`,
sin decirle qué campo. El `disabled` del botón solo mira el nombre.
**Fix:** `parseInt(e.target.value) || 0` en los dos, y sumar los campos al `disabled` del botón.

### IN-04: el `CapacityModeFields` del alta no se deshabilita mientras se guarda

**File:** `app/(dashboard)/settings/settings-client.tsx:2374-2379`
**Issue:** el del diálogo recibe `disabled={savingEditSvc}` (línea 2455); el del alta no recibe nada,
así que durante `savingNewSvc` el dueño puede seguir cambiando modo y cupo mientras el INSERT viaja con
el valor viejo. El servicio se crea con lo que había al hacer clic, no con lo que quedó en pantalla.
**Fix:** `disabled={savingNewSvc}`.

### IN-05: en la tarjeta, tipear el cupo no muestra el botón Guardar hasta salir del campo

**File:** `app/(dashboard)/settings/settings-client.tsx:650` (`dirty = value !== saved`) y `:718` (`onTextChange={setText}`)
**Issue:** el texto crudo no toca `value`, así que `dirty` sigue en `false` mientras se escribe: escribir
`12` y buscar el botón no funciona — hay que tocar afuera primero (o usar el stepper) para que aparezca.
`Enter` tampoco hace nada (el bloque no está dentro de un `<form>`, no hay `onKeyDown` para Enter; solo
Escape está cableado, en la línea 704). El camino del stepper —el que la UAT ejercitó— no lo expone.
**Fix:** manejar `Enter` en el contenedor como "normalizar y guardar", espejando el Escape que ya está.

### IN-06: fixture con un estado que la base ya no admite

**File:** `test/agenda-occupancy.test.ts:294` (caso 16, `{ ...YOGA, capacity: 1 }`)
**Issue:** un `group_class` de cupo 1 es ilegal desde la migración 068 (`services_capacity_matches_mode_chk`)
y el backfill de esa migración los convirtió a `individual`. El caso sigue probando lo que quiere probar
(que un grupal nunca entra al mapa de solape), pero lo hace con una fila imposible, y eso invita a
razonar sobre estados que no existen.
**Fix:** usar `capacity: 6` — el aserto (`size === 0`) no cambia.

### IN-07: huecos de cobertura de la suite (20/20 verde, pero)

**File:** `test/agenda-occupancy.test.ts`
**Issue:** lo que la suite NO cubre, en orden de riesgo:
1. **Dos agendas, mismo servicio y hora** — el caso de CR-01. Es el simétrico exacto del caso 4
   (discriminante, probado por mutación) en el otro eje, y falta.
2. **`occupied > capacity`** — hoy es alcanzable por WR-06 y ninguna aserción lo contempla; ningún test
   fija qué debe mostrar la fila cuando el contador se pasa.
3. **`expires_at` inválido**: `occupiesSeat` devuelve `false` (verificado ejecutando el módulo:
   `expires_at: 'no-es-fecha'` ⇒ `false`), porque `NaN > nowMs` es `false`. Es fail-**open**: no ocupa.
   Contradice el criterio fail-closed que `finEnSegundos` aplica en `settings-client.tsx:245` para el
   caso equivalente («si igual llegara nulo se cuenta como vivo»).
4. **Recuperación del `service_id` por `key.slice(0, key.indexOf('|'))`** (`agenda-occupancy.ts:206`):
   funciona porque un UUID no contiene `|`, pero es un supuesto no escrito y no probado; guardar el id
   en la lane junto a la lista lo vuelve innecesario.
**Fix:** los cuatro casos son de una línea de fixture cada uno sobre el andamiaje ya existente.

### IN-08: el efecto de resincronización del control inline no tiene la guarda de foco que sí tiene su gemelo

**File:** `app/(dashboard)/settings/settings-client.tsx:642-645`
**Estado:** **la invariante D-06 se verificó y HOY se sostiene** — se trazaron los tres caminos (tipeo,
stepper, cambio de modo que sube al piso) y ninguno cambia `saved` con el foco adentro.
**Issue:** es un hallazgo NUEVO de `eslint` de esta fase
(`643:5 error Calling setState synchronously within an effect can trigger cascading renders`), y la
asimetría es la que importa: `CapacityModeFields` (línea 408) se protege con `capacityFocusedRef` y por
eso el linter no lo marca; el control de la tarjeta se apoya en un comentario («`saved` sólo cambia
cuando un guardado se confirmó») en vez de en el código. Ese comentario es cierto hoy y deja de serlo
en cuanto alguien refresque `services` desde el servidor, agregue realtime, o haga que otra superficie
escriba el cupo — o sea, en cuanto aparezca el tercer camino de escritura, que es exactamente lo que ya
pasó dos veces en este milestone.
**Fix:** replicar la guarda (tres líneas, cero cambio de comportamiento):
```ts
const focusedRef = useRef(false)
useEffect(() => { if (focusedRef.current) return; setValue(saved); setText(String(saved)) }, [saved])
// y onInputFocus={() => { focusedRef.current = true }} / en onInputBlur ponerlo en false
```

---

## Fuera de alcance / ya trackeado (no re-reportado)

`agenda-client.tsx:345-358` escribiendo `time_blocks.capacity`; el índice
`appointments_no_double_booking` sin `service_id` (sí se reporta su **consecuencia nueva** dentro de
CR-01); "Seña pendiente" en holds vencidos; flakiness de las suites de abonos; los 13 errores de
`eslint` pre-existentes en `settings-client.tsx` (843, 857, 865-887, 1011, 1343),
`agenda-client.tsx:518` y `finances-client.tsx:290`.

---

_Reviewed: 2026-08-24_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
