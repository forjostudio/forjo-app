# Phase 13: Borrado de servicio preservando historial - Mapa de Patrones

**Mapeado:** 2026-07-31
**Archivos analizados:** 14 (1 nuevo + 13 modificados)
**Analogs encontrados:** 14 / 14 (todos con molde literal en el repo)

> Todos los punteros del 13-RESEARCH.md fueron **verificados leyendo el código**. Las divergencias
> respecto de la investigación están marcadas con ⚠ y son las únicas cosas que el planner debe
> re-chequear.

---

## Clasificación de archivos

| Archivo nuevo/modificado | Rol | Data flow | Analog más cercano | Calidad del match |
|--------------------------|-----|-----------|--------------------|-------------------|
| `supabase/migrations/065_*.sql` | migration | batch / DDL | `061_public_selector_default.sql` (cabecera + idempotencia + NOTIFY) + `042_spaces_and_coupled_exclusion.sql:312-359` (función+trigger) | exact |
| `lib/appointment-service.ts` **(NUEVO)** | utility (helper puro) | transform | `lib/booking-window.ts:1-35` (puro, sin React ni Supabase, doc de zona AR) | exact |
| `app/(dashboard)/settings/settings-client.tsx` — `deleteService` | client component / mutation | request-response | `lib/booking-core.ts:347-370` (mapeo de códigos PG a dominio) | role-match |
| `app/(dashboard)/settings/settings-client.tsx` — pre-check del modal | client component | CRUD read | `components/dashboard/canchas-manager.tsx:158-170` (`openDelete`) | exact |
| `app/(dashboard)/settings/settings-client.tsx` — diálogo 2 estados | client component | event-driven | `components/crm/confirm-dialog.tsx` + `canchas-manager.tsx:197-203` (`delDescription`) | exact |
| `app/(dashboard)/settings/settings-client.tsx` — tabs Activos/Desactivados | client component | transform (filtro) | `app/(dashboard)/abonos/abonos-client.tsx:54-58 / 149-156 / 263-297` | exact |
| `app/(dashboard)/settings/settings-client.tsx` — `toggleService` | client component | CRUD write | `deleteService` (mismo archivo, :521-533) — patrón `.eq('business_id')` + `if (error)` | exact |
| `app/(dashboard)/finances/finances-client.tsx` (7 sitios) | client component | read / aggregate | sí mismo (el ternario inline ya existe 4 veces) → reemplazar por el helper | exact |
| `app/api/export/finances/route.ts` | route handler | file-I/O (CSV) | sí mismo :65-72 | exact |
| `app/(dashboard)/clients/clients-client.tsx` | client component | read | sí mismo :145-150 (`getApptPrice`/`getApptService`) → **promover a `lib/`** | exact |
| `app/(dashboard)/appointments/appointments-client.tsx` (2 renders) | client component | read | sí mismo :382/:409-411 (desktop) y :424/:440-442 (mobile) | exact |
| `app/(dashboard)/abonos/{page,abonos-client}.tsx` | server page + client | read | `abonos-client.tsx:31-47` (tipo `AbonoRow`) | exact |
| `lib/canchas.ts` — `deleteCancha` | utility (lib) | CRUD write | sí mismo :185-196 (mapeo `23503`) | exact |
| `lib/types.ts` — `Appointment` | model | — | sí mismo :270-277 (campos opcionales de migración con comentario) | exact |
| `test/appointment-snapshot.test.ts` **(NUEVO)** | test | integración | `test/helpers/booking-fixtures.ts` (`seedOneTenant`) + `test/booking-core.test.ts` | exact |

---

## Asignaciones de patrón

### `supabase/migrations/065_*.sql` (migration, DDL)

**Analogs:** `061_public_selector_default.sql` (estructura completa) + `042:312-359` (función/trigger).

**Cabecera + idempotencia + NOTIFY** — copiar la forma de `061` tal cual (`061:1-54, 93-94`):

```sql
-- 061 — businesses.public_selector_default: default del paso "Profesional" de la reserva pública (EXTRA-B).
--
-- Contexto (motor-reservas / Phase 11 — cierre de backlog, ítem EXTRA-B):
--   …
-- Qué hace (idempotente — re-correr la migración es no-op):
--   1. ADD COLUMN IF NOT EXISTS …
-- Qué NO hace (invariantes del proyecto):
--   - NO se aplica vía push remoto. La ÚNICA validación es `supabase db reset` local (PG17), que
--     replaya el baseline numerado + 040..061 en orden. Prod se aplica A MANO coordinado con el
--     deploy + `NOTIFY pgrst, 'reload schema';`. La última migración en prod = 060. Tras aplicar,
--     regenerar `supabase/schema.sql` (patrón del repo).

-- ── 1. Columna: NOT NULL DEFAULT 'any' (cubre filas existentes sin backfill, D-06) ───────────────
ALTER TABLE "public"."businesses"
  ADD COLUMN IF NOT EXISTS "public_selector_default" "text" NOT NULL DEFAULT 'any';

-- ── 2. CHECK del enum. Idempotente: sólo se crea si no existe (re-correr = no-op) ─────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM "pg_constraint"
     WHERE "conname" = 'businesses_public_selector_default_chk'
       AND "conrelid" = '"public"."businesses"'::"regclass"
  ) THEN
    ALTER TABLE "public"."businesses"
      ADD CONSTRAINT "businesses_public_selector_default_chk"
      CHECK ("public_selector_default" IN ('any', 'choose'));
  END IF;
END
$$;

-- ── 4. Recargar el schema cache de PostgREST (obligatorio tras DDL) ───────────────────────────────
NOTIFY pgrst, 'reload schema';
```

> Para la 065 la cabecera dice **"la última migración en prod = 064"** y el rango replayado es
> `040..065`. El `DO $$ pg_constraint` es **el mismo bloque** que hay que usar para re-crear los dos
> FKs (`appointments_service_id_fkey`, `abonos_service_id_fkey`) tras el `DROP CONSTRAINT IF EXISTS`.
> ⚠ Divergencia justificada del molde: las columnas de snapshot van **NULLABLE** (no `NOT NULL DEFAULT`),
> porque `service_id` es nullable — documentarlo en la cabecera (RESEARCH §"Por qué las columnas van
> NULLABLE").

**Función + trigger** — molde literal de `042:312-335` (verificado):

```sql
CREATE OR REPLACE FUNCTION "public"."appointment_spaces_populate"() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('confirmed', 'pending_payment') THEN
    INSERT INTO appointment_spaces (appointment_id, business_id, space_id, slot)
    SELECT NEW.id, NEW.business_id, asp.space_id, …
    FROM agenda_spaces asp
    WHERE asp.business_id = NEW.business_id       -- ← filtro por tenant DENTRO del SECURITY DEFINER
      AND asp.professional_id = NEW.professional_id;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."appointment_spaces_populate"() OWNER TO "postgres";

CREATE TRIGGER "appointment_spaces_populate_trg"
  AFTER INSERT ON "public"."appointments"
  FOR EACH ROW EXECUTE FUNCTION "public"."appointment_spaces_populate"();
```

A copiar exactamente: la firma (`LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`), el
`ALTER FUNCTION … OWNER TO "postgres";`, el nombre del trigger con sufijo `_trg`, el comentario largo
en español arriba de la función, y el **filtro `business_id` adentro** (regla dura de la skill
`supabase-multitenant-rls`).
⚠ **042 NO lleva `DROP TRIGGER IF EXISTS`** (verificado en :333 y :357). La 065 **sí** debe anteponerlo
a cada `CREATE TRIGGER` para ser re-corrible.

**Trigger existente que NO se dispara con el `SET NULL`** (verificado, `042:357-359`):
`appointment_spaces_cleanup_trg` es `AFTER UPDATE OF "status"` ⇒ un update que solo toca `service_id`
no lo activa. Confirmado: cero efecto colateral.

---

### `lib/appointment-service.ts` (utility, transform) — **NUEVO**

**Analog:** `lib/booking-window.ts:1-35` — el molde de "helper puro compartido por client y server".

```ts
import { addDays, isAfter, parseISO, startOfDay } from 'date-fns'

// ── Ventana de reserva pública (BOOK-WINDOW) ────────────────────────────────────────────────
// Fuente ÚNICA de verdad del corte de la ventana de reserva, compartida por la UI (los dos
// calendarios públicos capan navegación/días) y por el backstop server (app/api/booking/create).
// Que ambos consuman EXACTAMENTE la misma función evita drift entre lo que el cliente ve y lo
// que el server acepta (D-08 enforcement en 3 capas).
//
// Funciones PURAS: sin React ni Supabase → reutilizables en client y server, testeables sin DB.

// Subconjunto de Business que necesita el cálculo (lo cumplen Business y PublicBusiness).
type BookingWindowBiz = {
  max_advance_days?: number | null
  max_advance_date?: string | null
}

export function todayInAR(): Date { … }
```

Qué replicar: el bloque de cabecera con el *por qué* en español, el **tipo estructural mínimo** como
parámetro (`type BookingWindowBiz` — no importar `Appointment` entero: así lo consumen tanto las filas
de PostgREST acotadas de Finanzas como el `Appointment` completo), named exports, cero import de React
o Supabase.

**Estado actual del fallback a reemplazar** (`clients-client.tsx:145-150`, verificado literal):

```ts
function getApptPrice(a: Appointment): number {
  return (a.services as { price?: number } | null)?.price || 0
}
function getApptService(a: Appointment): string {
  return (a.services as { name?: string } | null)?.name || '—'
}
```

⚠ Al promoverlas usar `??` y no `||` (RESEARCH §Code Example 4): un precio 0 legítimo hoy colapsa
con `null`.

---

### `settings-client.tsx` → pre-check del modal (client, CRUD read)

**Analog:** `components/dashboard/canchas-manager.tsx:155-170` — **verificado literal**:

```ts
// ── Eliminar permanentemente (hard-delete, D-05) con gate por tipeo "ELIMINAR" ────────────────
const [delCancha, setDelCancha] = useState<Cancha | null>(null)
const [delPending, setDelPending] = useState<number | null>(null) // reservas próximas; null = contando

async function openDelete(c: Cancha) {
  setDelCancha(c)
  setDelPending(null)
  // Contar reservas PRÓXIMAS (pending/pending_payment/confirmed, fecha >= hoy AR) de la agenda de la cancha.
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  const { count } = await supabase.from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', business.id)
    .eq('professional_id', c.professional.id)
    .in('status', ['pending', 'pending_payment', 'confirmed'])
    .gte('date', today)
  setDelPending(count ?? 0)
}
```

Qué copiar: el par de estados (`target` + `pending: number | null` donde **null = "contando…"**), la
derivación de "hoy AR" con `toLocaleDateString('en-CA', { timeZone: … })`, `.eq('business_id', …)`
siempre, y el `count ?? 0`.
Qué cambiar para servicios: `.eq('service_id', s.id)`; y como D-13 pide **la fecha del próximo turno**,
reemplazar `head: true` por `.select('date', { count: 'exact' }).order('date').limit(1)`; sumar la
consulta de abono activo (`abonos … .eq('status','active')`).
⚠ El pre-check y el trigger tienen que usar **la misma semántica de estado** — canchas usa la lista
blanca `.in([...])` y D-08 define `status != 'cancelled'`. Recomendación de RESEARCH (Pitfall 2):
lista blanca en ambos lados.

---

### `settings-client.tsx` → `deleteService` (mutation, request-response)

**Estado actual verificado** (`settings-client.tsx:521-537`):

```ts
async function deleteService(id: string) {
  // NO optimista: capturamos el error real. Defensa en profundidad con business_id (igual que
  // deleteProfessional). Si hay turnos asociados, el FK (23503) bloquea el borrado → sugerimos
  // desactivar en vez de tocar el estado (el item sigue en la lista porque no filtramos).
  const { error } = await supabase.from('services').delete().eq('id', id).eq('business_id', business.id)
  if (error) {
    if (error.code === '23503') toast.error('No se puede eliminar: el servicio tiene turnos asociados, incluidos pasados y cancelados (cancelar no los borra). Desactivalo para dejar de ofrecerlo y conservar el historial, o borrá esos turnos primero.')
    else toast.error('No se pudo eliminar el servicio')
    return
  }
  setServices(prev => prev.filter(s => s.id !== id))
  toast.success('Servicio eliminado')
}
async function toggleService(id: string, active: boolean) {
  await supabase.from('services').update({ active }).eq('id', id)
  setServices(prev => prev.map(s => s.id === id ? { ...s, active } : s))
}
```

⚠ Confirmado el hallazgo de RESEARCH: **`toggleService` no filtra por `business_id` ni chequea
`error`**. Si D-12 lo expone como acción primaria del modal, alinearlo al patrón de `deleteService`
(`.eq('business_id', business.id)` + `if (error) toast.error(...)`).

**Analog del mapeo de errores:** `lib/booking-core.ts:347-370` (verificado literal):

```ts
if (rpcErr || !appt) {
  // (a0) RAISE 'simultaneous_space_conflict' (ERRCODE P0001 — migr. 064, gap 3): …
  if (rpcErr?.message?.includes('simultaneous_space_conflict')) {
    return { ok: false, error: 'simultaneous_space_conflict', status: 409 }
  }
  // (a) RAISE 'slot_full' (ERRCODE P0001 — cupo grupal lleno) llega en `message` → slot_full (409).
  if (rpcErr?.message?.includes('slot_full')) {
    return { ok: false, error: 'slot_full', status: 409 }
  }
  // (b) 23505 = índice único de seat …; 23P01 = exclusion constraint 013 → slot_taken (409).
  if (rpcErr?.code === '23505' || rpcErr?.code === '23P01') {
```

Patrón a replicar: **discriminar por `message.includes('<código_de_dominio>')` primero y por
`code` después**, cada rama con un comentario de una-a-tres líneas explicando de qué migración viene el
`RAISE`. Es exactamente lo que necesitan `service_has_future_appointments` /
`service_has_active_abono`. Dejar la rama `23503` como fallback defensivo.

**El mismo mapeo hay que actualizarlo en `lib/canchas.ts:185-196`** (LANDMINE #1, verificado):

```ts
const { error: svcErr } = await client
  .from('services').delete().eq('id', cancha.service.id).eq('business_id', businessId)
if (svcErr) {
  if ((svcErr as { code?: string }).code === '23503') return { ok: false, error: 'has_appointments' }
  return { ok: false, error: 'service_delete_failed' }
}
```

Tras la 065 ese `23503` deja de producirse ⇒ agregar el reconocimiento de `P0001` + message del
trigger, mapeando al mismo `'has_appointments'` que ya consume `canchas-manager.tsx:180-183`.

---

### `settings-client.tsx` → diálogo de dos estados (client, event-driven)

**Analog 1 — call-site actual del `ConfirmDialog`** (`settings-client.tsx:2304-2317`, verificado):

```tsx
{/* Confirmación de borrado (servicio / consultorio). El ConfirmDialog usa el cliente browser
    de Supabase directo (NO server actions, NO redirect) → sin toast espurio de NEXT_REDIRECT. */}
<ConfirmDialog
  open={!!delService}
  onOpenChange={(o) => { if (!o) setDelService(null) }}
  title="¿Eliminar servicio?"
  description={delService ? `Vas a eliminar "${delService.name}". Esta acción no se puede deshacer.` : undefined}
  risk="alto"
  confirmLabel="Eliminar"
  destructive
  onConfirm={async () => { if (delService) { await deleteService(delService.id); setDelService(null) } }}
/>
```

**Analog 2 — descripción dinámica multi-estado** (`canchas-manager.tsx:196-203`, verificado):

```ts
// Descripción del dialog de eliminar: avisa de reservas próximas y exige tipear ELIMINAR.
const delDescription = delCancha
  ? (delPending === null
      ? `Vas a eliminar "${delCancha.service.name}" de forma permanente. Verificando reservas…`
      : delPending > 0
        ? `⚠ "${delCancha.service.name}" tiene ${delPending} reserva(s) próxima(s). …`
        : `Vas a eliminar "${delCancha.service.name}" de forma permanente. No se puede deshacer. …`)
  : undefined
```

Molde exacto del estado *bloqueado / confirmable / contando* de D-11: **una constante derivada fuera
del JSX**, ternario anidado, `undefined` cuando no hay target.

**Contrato de `ConfirmDialog`** (`components/crm/confirm-dialog.tsx:41-62`, verificado): props
`open, onOpenChange, title, description?, confirmWord?, requireReason?, minReasonLength?, risk,
confirmLabel, destructive?, onConfirm`. Cómo extender (Opción A de RESEARCH): **props opcionales
aditivas**, con el mismo estilo de JSDoc que ya usa `minReasonLength`:

```ts
/**
 * Largo mínimo del motivo para habilitar confirmar (default 1 = el "no vacío" actual). Opcional y
 * aditivo: las llamadas que no la pasan conservan el comportamiento previo. …
 */
minReasonLength?: number
```

⚠ Dos comportamientos verificados del componente que condicionan el diseño:
- El footer es fijo `[Cancelar] [confirmLabel]` (`:276-298`) — no hay slot para un segundo botón.
- `handleConfirm` (`:212-225`) **cierra el dialog si `onConfirm` no lanza** y muestra un toast genérico
  si lanza (`'No se pudo completar la acción…'`). Como `deleteService` no lanza, el backstop del
  trigger cerraría el modal silenciosamente. Si se quiere re-renderizar en estado bloqueado,
  `deleteService` tiene que devolver un discriminado o lanzar. **Decisión del planner.**
- La lógica pura (`computeConfirmState`, `buildSubmitGuard`, `confirmButtonClass`) está exportada y
  testeada en `confirm-dialog.test.tsx` — cualquier prop nueva de gating debe entrar por ahí, no por
  el componente.

---

### `settings-client.tsx` → tabs Activos/Desactivados (client, transform)

**Analog:** `abonos-client.tsx` — verificado en los tres puntos.

**Tipo + constante a nivel módulo** (`:51-58`):

```ts
// Filtro del listado (D-20). La vista principal es de series VIVAS; a Archivados va lo que ya no
// genera turnos y no le queda nada por delante: …
type AbonoTab = 'activos' | 'archivados'
const ABONO_TABS: { key: AbonoTab; label: string }[] = [
  { key: 'activos', label: 'Activos' },
  { key: 'archivados', label: 'Archivados' },
]
```

**Filtro + contadores con el MISMO predicado** (`:143-156`):

```ts
// El filtro y el contador llaman al MISMO predicado a propósito: si cada uno decidiera por su cuenta,
// el tab podría decir "Activos (1)" sobre una lista vacía.
const visibleAbonos = useMemo(
  () => abonos.filter((a) => isAbonoActivo(a, futureTurnoCounts) === (tab === 'activos')),
  [abonos, tab, futureTurnoCounts],
)
const tabCounts = useMemo(() => {
  const activos = abonos.filter((a) => isAbonoActivo(a, futureTurnoCounts)).length
  return { activos, archivados: abonos.length - activos }
}, [abonos, futureTurnoCounts])
```

**Render de las píldoras** (`:262-278`) — copiar clases exactas:

```tsx
{/* Píldoras de filtro (D-20), mismo molde visual que los filtros de Clientes. */}
<div className="flex gap-1 flex-wrap">
  {ABONO_TABS.map((t) => (
    <button
      key={t.key}
      type="button"
      onClick={() => setTab(t.key)}
      aria-pressed={tab === t.key}
      className={cn(
        'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
        tab === t.key ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 text-muted-foreground hover:text-foreground',
      )}
    >
      {t.label} ({tabCounts[t.key]})
    </button>
  ))}
</div>
```

**Empty state por tab** (`:281-297`): `rounded-lg border border-dashed border-border p-8 text-center
space-y-2` + icono `mx-auto h-6 w-6 text-muted-foreground` + `<p className="text-sm font-medium">` +
`<p className="text-xs text-muted-foreground">`, con **copy distinto por tab**.

**Dónde se inserta** — la lista de servicios (`settings-client.tsx:1450-1491`, dentro de la rama
`!isCanchas`) itera `services.map(s => …)` directo; hay que interponer `visibleServices`. El nombre
tachado del desactivado vive en `:1472`:

```tsx
<p className={cn('text-sm font-medium truncate', !s.active && 'line-through text-muted-foreground')}>{s.name}</p>
…
<Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => toggleService(s.id, !s.active)}>
  {s.active ? 'Desactivar' : 'Activar'}
</Button>
…
<Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive h-8 w-8" onClick={() => setDelService(s)}>
  <Trash2 className="w-4 h-4" />
</Button>
```

El `onClick={() => setDelService(s)}` del tacho (`:1488`) es el punto donde D-11 engancha el
pre-check (`openDeleteService(s)`).

---

### Read-paths de historial (D-05/D-06) — patrón único a aplicar

El mismo cast inline se repite con dos formas. **Ambas** se reemplazan por el helper.

**Forma A — reduce sobre un select acotado** (`finances-client.tsx:250`, `:273`, `:288`, `:518`):

```ts
const pServices = (pA.data || []).reduce((s, x) => s + ((x.services as { price?: number } | null)?.price || 0), 0)
const apptRevenue = appointments.reduce((s, a) => s + ((a.services as { price?: number } | null)?.price || 0), 0)
for (const a of appointments) inc.set(a.date, (inc.get(a.date) || 0) + ((a.services as { price?: number } | null)?.price || 0))
```

⚠ En `:246` y `:268` el select es **acotado** (`select('services(price)')`) — hay que ampliarlo con la
columna del snapshot o el helper recibe `undefined` (Pitfall 7). El de `:219`
(`select('*, services(name, price)')`) ya trae el snapshot por el `*`.

**Forma B — variable `svc`/`service` y render** (`finances-client.tsx:313-318` y `:881-887`,
`appointments-client.tsx:382/409-411` y `:424/440-442`, `export/finances/route.ts:65-72`):

```ts
// finances-client.tsx:313-318 (ranking)
for (const a of appointments) {
  const svc = a.services as { name?: string; price?: number } | null
  const label = svc?.name || 'Sin servicio'
  const cur = rankingMap.get(label) || { label, total: 0, count: 0 }
  cur.total += svc?.price || 0
```

```tsx
{/* finances-client.tsx:886-887 (fila) */}
<span className="text-muted-foreground hidden sm:block truncate max-w-32">{service?.name}</span>
<span className="font-semibold">{fmtARS(service?.price || 0)}</span>
```

```tsx
{/* appointments-client.tsx:409-411 — DESKTOP */}
<td className="px-4 py-3 align-top">{service?.name || '—'}</td>
<td className="px-4 py-3 align-top text-right font-medium whitespace-nowrap">{service?.price != null ? `$${Number(service.price).toLocaleString('es-AR')}` : '—'}</td>

{/* appointments-client.tsx:440-442 — MOBILE (Pitfall 6: son DOS, migrar ambos) */}
{service?.name}
{service?.price != null && ` · $${Number(service.price).toLocaleString('es-AR')}`}
```

```ts
// app/api/export/finances/route.ts:65-72 — CSV (NO listado en el CONTEXT, sí en alcance)
for (const a of apptRes.data ?? []) {
  const svc = a.services as { name?: string | null; price?: number | null } | null
  movimientos.push({
    fecha: a.date ?? '',
    tipo: 'turno',
    concepto: svc?.name ?? '—',
    monto: Number(svc?.price ?? 0),
  })
}
```

⚠ El select de esta ruta (`:48`) es acotado: `select('date, services(name, price)')` → **ampliar**.

**Tipo del modelo** — `lib/types.ts:270-277` es el molde de cómo se documentan los campos aditivos
de una migración:

```ts
// Cupos grupales (migración 041, lo escribe book_slot_atomic). Opcionales con `?` porque no todo
// `select` los trae. `seat` = posición 0..capacity-1 …
seat?: number
is_group?: boolean
// FK a la serie del abono (migración 054, D-03); marca el turno como 'fijo' en la agenda (D-09).
abono_id?: string | null
```

Copiar esa forma: `?` + `| null`, comentario con **número de migración + quién la escribe + por qué es
opcional**.

**Abonos (D-09)** — `abonos-client.tsx:31-47` (`type AbonoRow`) tiene `services: { name: string } | null`
y el select vive en `abonos/page.tsx:39`
(`.select('id, day_of_week, …, clients(name), services(name), professionals(name)')`): sumar la columna
de snapshot en **ambos**.

---

## Patrones compartidos

### Aislamiento por tenant (aplica a: migración, pre-check, deleteService, toggleService)
**Fuente:** `settings-client.tsx:525` + `042:324` + skill `supabase-multitenant-rls`.
- Cliente browser + RLS + `.eq('business_id', business.id)` **siempre**, nunca service-role en el panel.
- Dentro de una función `SECURITY DEFINER` la RLS **no aplica** ⇒ filtro `business_id` explícito en el
  `WHERE` (`042:324`: `WHERE asp.business_id = NEW.business_id`).

### Mapeo de errores de Postgres a dominio (aplica a: `deleteService`, `lib/canchas.ts`)
**Fuente:** `lib/booking-core.ts:347-370`. `message.includes('<codigo_dominio>')` para los `RAISE`
(`P0001`) y `code` para los SQLSTATE de constraint; una rama por caso, cada una comentada con la
migración de origen.

### Comentarios en español explicando el *por qué* (aplica a: todos)
**Fuente:** `settings-client.tsx:522-524`, `042:301-311`, `abonos-client.tsx:147-148`,
`export/finances/route.ts:3-25`. Todo bloque no obvio (carreras, constraints, tenant, decisiones D-xx)
lleva su párrafo. Los archivos SQL usan separadores `-- ── N. Título ──────`.

### Toasts de feedback (aplica a: todas las mutaciones del panel)
**Fuente:** `settings-client.tsx:526-532`. `toast.error(...)` con copy accionable + `return` temprano;
`toast.success(...)` recién después de mutar el estado local. Borrado **no optimista**.

### Fixtures de test de integración (aplica al test nuevo)
**Fuente:** `test/helpers/booking-fixtures.ts:20-75` — `seedOneTenant` devuelve
`{ admin, userId, email, password, businessId, bufferMinutes, serviceId, serviceDurationMinutes,
professionalId, locationId }`, con prefijo único por corrida (`__test_<uuid8>`) y service-role
**solo** para sembrar/limpiar. Los tests se auto-skipean con `describe.skipIf(!hasSupabaseCreds)`
(`test/env.ts`).

---

## Sin analog

Ninguno. Los 14 archivos tienen molde en el repo.

Casos límite (molde parcial — el planner debe decidir, no hay precedente literal):

| Ítem | Por qué no hay analog exacto |
|------|------------------------------|
| `BEFORE DELETE` con `RAISE EXCEPTION` sobre `services` | Los 2 triggers del repo (`042`) son `AFTER INSERT`/`AFTER UPDATE` y no hacen `RAISE`. La firma y el estilo sí se copian; la semántica (`RETURN OLD` obligatorio) sale de RESEARCH §Code Example 2. |
| `(now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date` en SQL | 0 ocurrencias en `supabase/migrations/` (verificado por RESEARCH). El equivalente TS sí existe (`canchas-manager.tsx:162`, `lib/booking-window.ts:31-35`). |
| Segundo botón de acción en `ConfirmDialog` | El componente no lo soporta hoy (footer fijo `:276-298`). Es la extensión aditiva de la Opción A. |

---

## Verificaciones sobre RESEARCH.md

| Puntero de RESEARCH | Resultado |
|---------------------|-----------|
| `042:310-359` trigger | ✅ exacto (función en 312, trigger en 333 y 357; sin `DROP TRIGGER IF EXISTS`) |
| `061` migración idempotente | ✅ exacto (`ADD COLUMN IF NOT EXISTS`, `DO $$ pg_constraint`, `NOTIFY pgrst` en :94) |
| `canchas-manager.tsx:157-201` pre-check | ✅ exacto (`openDelete` en 158-170, `delDescription` en 197-203) |
| `abonos-client.tsx:53-57/146-156/264-295` tabs | ✅ (tipo/const en **54-58**, memos en **149-156**, render en **263-278**, empty states en **281-297**) |
| `booking-core.ts:346-360` mapeo de errores | ✅ (el bloque real va **347-370** e incluye la rama `23505`/`23P01`) |
| `test/helpers/booking-fixtures.ts` | ✅ `seedOneTenant` con service-role y prefijo por corrida |
| `clients-client.tsx:145-150` helpers | ✅ literal |
| `export/finances/route.ts:48,65-72` | ✅ literal — select acotado, `?? '—'` / `?? 0` |
| `appointments-client.tsx:382/424` dos renders | ✅ (los renders reales son **409-411** desktop y **440-442** mobile) |
| `settings-client.tsx:521-537` | ✅ literal; confirmado que `toggleService` no filtra por `business_id` ni mira `error` |
| `lib/canchas.ts` mapeo `23503` | ✅ (**185-196**: dos ramas, `professionals` y `services`) |

---

## Metadata

**Alcance de la búsqueda:** `supabase/migrations/`, `app/(dashboard)/{settings,finances,clients,appointments,abonos}/`, `app/api/export/finances/`, `components/{crm,dashboard}/`, `lib/`, `test/helpers/`.
**Archivos leídos:** 18
**Fecha de extracción:** 2026-07-31
